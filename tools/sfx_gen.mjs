// Generate the game's sound effects and music through Monid (ElevenLabs Sound Effects / Music, billed per
// second of audio, no markup), post-process them with ffmpeg and register them in public/sfx/index.json,
// which src/audio/audio.js loads to replace its synthesised sounds.
//
//   node tools/sfx_gen.mjs --dry                     # list what would be generated and what it costs
//   node tools/sfx_gen.mjs --max-usd 3               # generate everything (hard spend cap)
//   node tools/sfx_gen.mjs --only shot,boom --takes 3 # re-roll a few keys with more takes to pick from
//   node tools/sfx_gen.mjs --pick shot=0,2,3          # choose which takes become the in-game variants
//
// API key: tools/.monid_key (one line, gitignored) or MONID_KEY. Raw takes are kept in assets/sfx/<key>/.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const DRY = !!arg('dry', false), MAX = +arg('max-usd', 3), TAKES = +arg('takes', 2), ONLY = arg('only', '') ? String(arg('only')).split(',') : null, PICK = arg('pick', '');
const spec = JSON.parse(readFileSync('tools/sfx/spec.json', 'utf8'));
const RAW = 'assets/sfx', OUT = 'public/sfx', INDEX = `${OUT}/index.json`, LEDGER = 'tools/sfx/ledger.jsonl';
mkdirSync(RAW, { recursive: true }); mkdirSync(OUT, { recursive: true });
const index = existsSync(INDEX) ? JSON.parse(readFileSync(INDEX, 'utf8')) : {};
const SFX_RATE = 0.12 / 60, MUSIC_RATE = 0.15 / 60; // USD per second of generated audio (Monid public price)

// ---------- choose which takes ship (no API calls) ----------
if (PICK) {
  for (const part of String(PICK).split(';')) {
    const [key, list] = part.split('='); const takes = list.split(',').map(Number);
    index[key] = takes.map((t, i) => { const f = `${key}_${i}.mp3`; finish(key, `${RAW}/${key}/take${t}.mp3`, `${OUT}/${f}`); return f; });
  }
  writeFileSync(INDEX, JSON.stringify(index, null, 1)); console.log('index updated', Object.keys(index).length, 'keys'); process.exit(0);
}

const jobs = [];
for (const s of spec.sfx) if (!ONLY || ONLY.includes(s.key)) jobs.push({ ...s, kind: 'sfx', takes: Math.max(s.n, TAKES) });
for (const m of spec.music) if (!ONLY || ONLY.includes(m.key)) jobs.push({ ...m, n: 1, kind: 'music', takes: ONLY ? TAKES : 1 });
const cost = (j) => j.takes * j.sec * (j.kind === 'music' ? MUSIC_RATE : SFX_RATE);
const total = jobs.reduce((a, j) => a + cost(j), 0);
console.log(jobs.map((j) => `${j.kind.padEnd(5)} ${j.key.padEnd(12)} ${j.takes} x ${j.sec}s  $${cost(j).toFixed(3)}`).join('\n'));
console.log(`\nplanned: ${jobs.length} sounds, ${jobs.reduce((a, j) => a + j.takes, 0)} takes, ~$${total.toFixed(2)} (cap $${MAX})`);
if (DRY) process.exit(0);
if (total > MAX) { console.error(`planned cost $${total.toFixed(2)} is over the cap $${MAX}; raise --max-usd or narrow --only`); process.exit(1); }

const KEY = (process.env.MONID_KEY || (existsSync('tools/.monid_key') ? readFileSync('tools/.monid_key', 'utf8') : '')).trim();
if (!KEY) { console.error('no API key: put it in tools/.monid_key'); process.exit(1); }
const api = async (path, body) => {
  for (let i = 0; i < 5; i++) {
    const r = await fetch('https://api.monid.ai' + path, { method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 429) { await new Promise((s) => setTimeout(s, 1000 * (+r.headers.get('retry-after') || 5))); continue; }
    const j = await r.json().catch(() => ({})); if (r.status >= 400 && r.status !== 408) throw new Error(`${r.status} ${j.message || ''}`); return j;
  }
  throw new Error('rate limited');
};
// find the MP3 in whatever shape the provider output comes back in
const findAudio = (o) => { if (!o || typeof o !== 'object') return null; if (typeof o.audio_base64 === 'string') return o.audio_base64; if (typeof o.audio === 'string' && o.audio.length > 1000) return o.audio; for (const v of Object.values(o)) { const f = findAudio(v); if (f) return f; } return null; };
const findUrl = (o) => { if (!o || typeof o !== 'object') return null; for (const v of Object.values(o)) { if (typeof v === 'string' && /^https?:\/\/.+\.(mp3|wav|ogg|m4a)(\?|$)/i.test(v)) return v; const f = findUrl(v); if (f) return f; } return null; };
let spent = 0;
async function generate(j, take) {
  const body = j.kind === 'music'
    ? { provider: 'elevenlabs', endpoint: '/v1/music', input: { body: { prompt: j.prompt, music_length_ms: Math.round(j.sec * 1000), model_id: 'music_v1', force_instrumental: true } } }
    : { provider: 'elevenlabs', endpoint: '/v1/sound-generation', input: { body: { text: j.prompt, duration_seconds: j.sec, model_id: 'eleven_text_to_sound_v2', prompt_influence: 0.5, ...(j.loop ? { loop: true } : {}) } } };
  body.maxCost = +(j.sec * (j.kind === 'music' ? MUSIC_RATE : SFX_RATE) * 1.5 + 0.01).toFixed(4); body.tag = `sandline-${j.key}`;
  let run = await api('/v1/run', body);
  while (run.runId && ['READY', 'RUNNING', 'STOPPING'].includes(run.status)) { await new Promise((s) => setTimeout(s, 3000)); run = await api(`/v1/runs/${run.runId}`); }
  const charged = +(run.cost?.amount ?? run.billing?.amount ?? run.price?.amount ?? 0) || 0; spent += charged;
  appendFileSync(LEDGER, JSON.stringify({ t: new Date().toISOString(), key: j.key, take, runId: run.runId, status: run.status, cost: charged }) + '\n');
  if (run.status !== 'COMPLETED') throw new Error(`${j.key} take ${take}: ${run.status} ${run.reason || ''}`);
  const b64 = findAudio(run.output); const url = !b64 && findUrl(run.output);
  if (!b64 && !url) throw new Error(`${j.key}: no audio in output ${JSON.stringify(run.output).slice(0, 300)}`);
  const buf = b64 ? Buffer.from(b64, 'base64') : Buffer.from(await (await fetch(url)).arrayBuffer());
  mkdirSync(`${RAW}/${j.key}`, { recursive: true }); const f = `${RAW}/${j.key}/take${take}.mp3`; writeFileSync(f, buf); return f;
}
// ffmpeg finishing: one-shots trimmed + faded + peak-normalised, loops crossfaded seamless, music loudness-normalised
function finish(key, src, dst) {
  const s = [...spec.sfx, ...spec.music].find((x) => x.key === key) || {};
  const music = key.startsWith('music') || key === 'trailer';
  let af;
  if (music) af = 'loudnorm=I=-16:TP=-1.5:LRA=11';
  else if (s.loop) af = 'loudnorm=I=-20:TP=-2';
  else af = `silenceremove=start_periods=1:start_threshold=-50dB,afade=t=out:st=${Math.max(0.05, (s.sec || 1) * 0.8)}:d=${Math.max(0.05, (s.sec || 1) * 0.2)},loudnorm=I=-14:TP=-1`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-af', af, '-ar', '44100', '-ac', '2', '-b:a', '192k', dst]);
  if (s.loop && !music) { // seamless: crossfade the last second into the start
    const tmp = dst.replace('.mp3', '.tmp.mp3');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', dst, '-filter_complex', `[0]asplit[a][b];[a]atrim=start=1,asetpts=PTS-STARTPTS[body];[b]atrim=0:1,asetpts=PTS-STARTPTS[head];[body][head]acrossfade=d=1:c1=tri:c2=tri`, '-b:a', '192k', tmp]);
    execFileSync('mv', [tmp, dst]);
  }
}

for (const j of jobs) {
  const got = [];
  for (let t = 0; t < j.takes; t++) {
    if (spent > MAX) { console.error(`stopped: spent $${spent.toFixed(3)} reached the cap`); break; }
    try { got.push(await generate(j, t)); process.stdout.write(`${j.key}#${t} `); } catch (e) { console.error('\n', e.message); }
  }
  // default pick: the first n takes; re-pick by ear later with --pick
  if (got.length && j.key === 'trailer') { mkdirSync('out/trailer', { recursive: true }); finish(j.key, got[0], 'out/trailer/music.mp3'); } // trailer cue stays out of the game build
  else if (got.length) index[j.key] = got.slice(0, j.n).map((src, i) => { const f = `${j.key}_${i}.mp3`; finish(j.key, src, `${OUT}/${f}`); return f; });
  writeFileSync(INDEX, JSON.stringify(index, null, 1));
}
console.log(`\ndone. spent ~$${spent.toFixed(3)} (see ${LEDGER}); raw takes in ${RAW}/<key>/`);
