// Voice lines through Monid (ElevenLabs text-to-speech), normalised and registered as sample keys vo_<key>.
//   node tools/vo_gen.mjs [--only double,triple] [--max-usd 0.5]
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i < 0 ? d : process.argv[i + 1]; };
const ONLY = arg('only', '') ? arg('only').split(',') : null, MAX = +arg('max-usd', 0.5);
const spec = JSON.parse(readFileSync('tools/vo/spec.json', 'utf8'));
const KEY = readFileSync('tools/.monid_key', 'utf8').trim();
const INDEX = 'public/sfx/index.json', index = JSON.parse(readFileSync(INDEX, 'utf8'));
const api = async (path, body) => { for (let i = 0; i < 6; i++) { const r = await fetch('https://api.monid.ai' + path, { method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); if (r.status === 429) { await new Promise((s) => setTimeout(s, 4000)); continue; } const j = await r.json().catch(() => ({})); if (r.status >= 400 && r.status !== 408) throw new Error(`${r.status} ${JSON.stringify(j).slice(0, 300)}`); return j; } throw new Error('rate limited'); };
const find = (o) => { if (!o || typeof o !== 'object') return null; if (typeof o.download_link === 'string') return o.download_link; for (const v of Object.values(o)) { const f = find(v); if (f) return f; } return null; };
let spent = 0;
const SET = { ann: { stability: 0.3, similarity_boost: 0.8 }, ctl: { stability: 0.5, similarity_boost: 0.8 } };
await Promise.all(spec.lines.filter((l) => !ONLY || ONLY.includes(l.key)).map(async (l, n) => {
  await new Promise((s) => setTimeout(s, n * 400));
  try {
    if (spent > MAX) throw new Error('spend cap');
    let r = await api('/v1/run', { provider: 'elevenlabs', endpoint: '/text-to-speech', input: { body: { text: l.text, voice_id: spec.voices[l.v], model_id: 'eleven_v4', voice_settings: SET[l.v] } }, maxCost: 0.05, tag: `sandline-vo-${l.key}` });
    while (r.runId && ['READY', 'RUNNING', 'STOPPING'].includes(r.status)) { await new Promise((s) => setTimeout(s, 2000)); r = await api(`/v1/runs/${r.runId}`); }
    const c = +(r.cost?.value ?? 0) || 0; spent += c; appendFileSync('tools/vo/ledger.jsonl', JSON.stringify({ t: new Date().toISOString(), key: l.key, runId: r.runId, status: r.status, cost: c }) + '\n');
    const u = find(r.output); if (r.status !== 'COMPLETED' || !u) throw new Error(`${r.status} ${JSON.stringify(r.output || r.reason).slice(0, 200)}`);
    const raw = `assets/sfx/vo_${l.key}.mp3`; writeFileSync(raw, Buffer.from(await (await fetch(u)).arrayBuffer()));
    const f = `vo_${l.key}.mp3`;
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-af', 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I=-16:TP=-1.5', '-ar', '44100', '-ac', '2', '-b:a', '160k', `public/sfx/${f}`]);
    index['vo_' + l.key] = [f]; console.log('ok', l.key, c);
  } catch (e) { console.error('FAIL', l.key, e.message); }
}));
writeFileSync(INDEX, JSON.stringify(index, null, 1)); console.log('spent', spent.toFixed(3));
