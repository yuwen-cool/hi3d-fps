// Objective first pass over the generated takes (assets/sfx/<key>/take*.mp3): measures onset, punch,
// dead air and steadiness, ranks the takes per key, picks the best n into the game (via sfx_gen --pick),
// and writes an audition page (out/audition/index.html) to confirm by ear.
//   node tools/sfx_rank.mjs            # rank + report + audition page
//   node tools/sfx_rank.mjs --apply    # also ship the top-ranked takes
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const spec = JSON.parse(readFileSync('tools/sfx/spec.json', 'utf8'));
const all = [...spec.sfx, ...spec.music.map((m) => ({ ...m, n: 1, music: true }))];
const SR = 22050;
const LONG = new Set(['boom', 'bigBoom', 'thunderNear', 'thunderFar', 'death', 'groan', 'beam', 'charge', 'whoomp', 'hiss', 'tailOut', 'tailIn']);
function analyse(file) {
  const raw = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(SR), '-'], { maxBuffer: 1 << 30 });
  const x = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  let peak = 0, sum = 0; for (const v of x) { const a = Math.abs(v); if (a > peak) peak = a; sum += v * v; }
  const rms = Math.sqrt(sum / x.length), db = (v) => 20 * Math.log10(v + 1e-9);
  const W = Math.floor(SR * 0.02), wins = []; for (let i = 0; i + W <= x.length; i += W) { let s = 0; for (let k = 0; k < W; k++) s += x[i + k] * x[i + k]; wins.push(db(Math.sqrt(s / W))); }
  const onset = x.findIndex((v) => Math.abs(v) >= 0.25 * peak) / SR;
  const firstHalf = wins.slice(0, Math.max(1, Math.floor(wins.length * 0.5)));
  const silence = wins.filter((w) => w < -45).length / wins.length, silenceEarly = firstHalf.filter((w) => w < -45).length / firstHalf.length;
  const W2 = Math.floor(SR * 0.5), big = []; for (let i = 0; i + W2 <= x.length; i += W2) { let s = 0; for (let k = 0; k < W2; k++) s += x[i + k] * x[i + k]; big.push(db(Math.sqrt(s / W2))); }
  const mean = big.reduce((a, b) => a + b, 0) / Math.max(1, big.length), steadiness = Math.sqrt(big.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, big.length));
  return { dur: +(x.length / SR).toFixed(2), peakDb: +db(peak).toFixed(1), rmsDb: +db(rms).toFixed(1), crest: +(peak / (rms + 1e-9)).toFixed(1), onset: +onset.toFixed(3), silence: +silence.toFixed(2), silenceEarly: +silenceEarly.toFixed(2), steadiness: +steadiness.toFixed(1) };
}
function score(s, m) {
  if (s.loop || s.music) return -m.steadiness * (s.music ? 0.3 : 1) - m.silence * 20 + (m.rmsDb > -40 ? 0 : -10);
  if (LONG.has(s.key)) return -m.silenceEarly * 10 - m.onset * 4 + Math.min(m.crest, 12) * 0.15 + (m.rmsDb > -38 ? 0 : -5);
  return -m.onset * 30 + Math.min(m.crest, 20) * 0.3 - m.silenceEarly * 8 - (m.peakDb < -20 ? 5 : 0);
}
const report = {}, picks = [];
for (const s of all) {
  const d = `assets/sfx/${s.key}`; if (!existsSync(d)) continue;
  const takes = readdirSync(d).filter((f) => /^take\d+\.mp3$/.test(f)).sort();
  const rows = takes.map((f) => { const m = analyse(`${d}/${f}`); return { take: +f.match(/\d+/)[0], ...m, score: +score(s, m).toFixed(2) }; }).sort((a, b) => b.score - a.score);
  report[s.key] = rows; const keep = rows.slice(0, s.n).map((r) => r.take);
  if (s.key !== 'trailer') picks.push(`${s.key}=${keep.join(',')}`);
  console.log(s.key.padEnd(12), rows.map((r) => `#${r.take}(${r.score}${r.silenceEarly > 0.3 ? ' gap' : ''}${r.onset > 0.08 && !s.loop && !s.music && !LONG.has(s.key) ? ' slow' : ''})`).join('  '));
}
writeFileSync('tools/sfx/rank.json', JSON.stringify(report, null, 1));
// audition page: every take, best first, picked ones marked
mkdirSync('out/audition', { recursive: true });
const rowsHtml = Object.entries(report).map(([k, rows]) => { const n = all.find((s) => s.key === k)?.n || 1; return `<section><h2>${k}</h2><p>${all.find((s) => s.key === k)?.prompt || ''}</p>${rows.map((r, i) => { const f = `${k}_take${r.take}.mp3`; copyFileSync(`assets/sfx/${k}/take${r.take}.mp3`, `out/audition/${f}`); return `<div class="${i < n ? 'pick' : ''}"><span>#${r.take}${i < n ? ' ✓' : ''}</span><audio controls preload="none" src="${f}"></audio><small>score ${r.score} · ${r.dur}s · crest ${r.crest} · onset ${r.onset}s</small></div>`; }).join('')}</section>`; }).join('');
writeFileSync('out/audition/index.html', `<!doctype html><meta charset="utf-8"><title>SANDLINE audition</title><style>body{font:14px system-ui;background:#111;color:#ddd;max-width:900px;margin:24px auto;padding:0 16px}h2{margin:24px 0 4px;color:#ffcf9a}p{color:#999;margin:0 0 8px}div{display:flex;gap:10px;align-items:center;margin:4px 0}div.pick span{color:#7f7}small{color:#888}</style><h1>SANDLINE — sound audition</h1><p>✓ = currently in the game. Tell Claude e.g. "shot 用 #2 #0" to swap.</p>${rowsHtml}`);
console.log('\npick string:', picks.join(';'));
if (process.argv.includes('--apply')) execFileSync('node', ['tools/sfx_gen.mjs', '--pick', picks.join(';')], { stdio: 'inherit' });
