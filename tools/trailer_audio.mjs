// Score and sound the trailer from the recorded event logs: every shot, hit, explosion, footstep and
// thunderclap lands on the frame it happened. Ambience bed per clip, music ducked under the hits,
// mastered to -14 LUFS for X/Twitter, muxed into the cut (1080p + 720p).
//   node tools/trailer_audio.mjs        (needs out/trailer/timeline.json from tools/trailer.mjs,
//                                         out/rec/<clip>.events.json from tools/record.mjs,
//                                         public/sfx/index.json samples, out/trailer/music.mp3 optional)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const SR = 48000, dir = 'out/trailer';
const tl = JSON.parse(readFileSync(`${dir}/timeline.json`, 'utf8'));
const index = JSON.parse(readFileSync('public/sfx/index.json', 'utf8'));
const total = tl.at(-1).offset + tl.at(-1).dur;
const N = Math.ceil(total * SR), L = new Float32Array(N), R = new Float32Array(N);   // SFX bus
const KEYS = new Float32Array(N);                                                       // ducking key (hit energy)

const cache = {};
function load(file) { // decode any audio file to 48 kHz stereo float
  if (cache[file]) return cache[file];
  const raw = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-f', 'f32le', '-ac', '2', '-ar', String(SR), '-'], { maxBuffer: 1 << 30 });
  const f = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4); const l = new Float32Array(f.length / 2), r = new Float32Array(f.length / 2);
  for (let i = 0; i < l.length; i++) { l[i] = f[2 * i]; r[i] = f[2 * i + 1]; }
  return (cache[file] = { l, r });
}
const rr = {}; const pick = (key) => { const a = index[key]; if (!a?.length) return null; rr[key] = ((rr[key] ?? -1) + 1) % a.length; return `public/sfx/${a[rr[key]]}`; };
const last = {};
function place(key, t, gain = 1, { pan = 0, every = 0, rate = 1, duck = 0 } = {}) {
  if (t < 0 || t >= total) return; if (every && last[key] != null && t - last[key] < every) return; last[key] = t;
  const f = pick(key); if (!f) return; const s = load(f);
  const g0 = gain * (0.92 + Math.random() * 0.08), gl = g0 * Math.min(1, 1 - pan), gr = g0 * Math.min(1, 1 + pan);
  const i0 = Math.floor(t * SR), len = Math.floor(s.l.length / rate);
  for (let i = 0; i < len && i0 + i < N; i++) { const j = Math.floor(i * rate); L[i0 + i] += s.l[j] * gl; R[i0 + i] += s.r[j] * gr; }
  if (duck) for (let i = 0; i < Math.min(len, SR * 1.2) && i0 + i < N; i++) KEYS[i0 + i] = Math.max(KEYS[i0 + i], duck * Math.exp(-i / (SR * 0.5)));
}
function bed(key, t0, t1, gain) { // looped ambience with 0.6 s fades
  const f = index[key]?.[0] && `public/sfx/${index[key][0]}`; if (!f) return; const s = load(f), fade = 0.6 * SR;
  const i0 = Math.floor(t0 * SR), i1 = Math.min(N, Math.floor(t1 * SR));
  for (let i = i0; i < i1; i++) { const k = (i - i0) % s.l.length, e = Math.min(1, (i - i0) / fade, (i1 - i) / fade) * gain; L[i] += s.l[k] * e; R[i] += s.r[k] * e; }
}
// distance falloff for world sounds (metres from camera)
const att = (d, ref = 6) => Math.min(1, ref / Math.max(ref, d || ref));
const BEDS = { seg_hook: [['howl', 0.2]], seg_p2_dusk: [['wind', 0.22]], seg_p2_wall: [['wind', 0.18], ['howl', 0.18]], seg_p2_storm: [['howl', 0.32]], seg_p2_tank: [['howl', 0.28]], seg_p2_boss: [['crackle', 0.35], ['wind', 0.1]], seg_p2_tower: [['crackle', 0.4]] };

for (const seg of tl) {
  for (const [k, g] of BEDS[seg.seg] || []) bed(k, seg.offset, seg.offset + seg.dur, g);
  const clip = seg.seg.replace(/^seg_/, '').replace(/^hook$/, 'p2_hook');
  const evf = `out/rec/${clip}.events.json`; if (!existsSync(evf)) continue;
  for (const e of JSON.parse(readFileSync(evf, 'utf8'))) {
    if (e.t > seg.dur) continue; const t = seg.offset + e.t;
    switch (e.n) {
      case 'weapon:fire': place('shot', t, 0.85, { duck: 0.5 }); place('tailOut', t + 0.01, 0.4, { every: 0.25 }); if (e.hitE) place('impRobot', t + 0.03, 0.6); break;
      case 'enemy:fire': place('eShot', t, 0.45 * att(e.d, 8), { pan: (Math.random() - 0.5) * 0.6 }); break;
      case 'enemy:killed': place('death', t, 0.9 * att(e.d, 8), { duck: 0.6 }); break;
      case 'explosion': { const big = e.size >= 2; if (last.__boom != null && t - last.__boom < 0.3) { place('boom', t + 0.08, 0.35); break; } last.__boom = t; place(big ? 'bigBoom' : 'boom', t, 1.15 * att(e.d, 14), { duck: 1 }); break; } // chained blasts: one main hit + aftershocks
      case 'tank:boom': break; // its explosions carry it
      case 'gl:fire': place('gl', t, 0.9, { duck: 0.4 }); break;
      case 'thunder': place(e.delay < 0.25 ? 'thunderNear' : 'thunderFar', t + (e.delay || 0), 0.9, { duck: 0.7 }); break;
      case 'boss:step': place('bossStep', t, 0.8 * att(e.d, 20), { duck: 0.4, every: 0.15 }); place('clank', t + 0.05, 0.4 * att(e.d, 20)); break;
      case 'boss:charge': place('charge', t, 0.9, { duck: 0.3 }); break;
      case 'boss:beam': place('beam', t, 1.0, { duck: 0.8 }); break;
      case 'boss:dying': case 'tower:fall': place('groan', t, 1.0, { duck: 0.5 }); break;
      case 'tower:down': case 'boss:core': place('bigBoom', t, 1.0, { duck: 1 }); break;
      case 'shell:bounce': place('clink', t, 0.25, { every: 0.08 }); break;
      case 'leak': place('hiss', t, 0.5); break;
      case 'ignite': place('whoomp', t, 0.8); break;
      case 'weapon:magout': place('magout', t, 0.7); break; case 'weapon:magin': place('magin', t, 0.7); break; case 'weapon:bolt': place('bolt', t, 0.7); break;
    }
  }
  // title and end cards: one deep hit each
  if (seg.seg === 'seg_in' || seg.seg === 'seg_out') place('bigBoom', seg.offset + 0.05, 0.55, { duck: 1, rate: 0.85 });
}
// music under the SFX, ducked by the hit key (fast attack, ~0.5 s release)
const M = existsSync(`${dir}/music.mp3`) ? load(`${dir}/music.mp3`) : null;
const outL = new Float32Array(N), outR = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const m = M && i < M.l.length ? 1 : 0, dk = 1 - 0.75 * Math.min(1, KEYS[i]), fadeOut = Math.min(1, (N - i) / (SR * 1.5));
  outL[i] = (L[i] + (m ? M.l[i] * 0.42 * dk : 0)) * fadeOut; outR[i] = (R[i] + (m ? M.r[i] * 0.42 * dk : 0)) * fadeOut;
}
// write float wav, then master (soft limiter + -14 LUFS) and mux
const wav = `${dir}/mix_raw.wav`; { const buf = Buffer.alloc(44 + N * 8); buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 8, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(3, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 8, 28); buf.writeUInt16LE(8, 32); buf.writeUInt16LE(32, 34); buf.write('data', 36); buf.writeUInt32LE(N * 8, 40); for (let i = 0; i < N; i++) { buf.writeFloatLE(outL[i], 44 + i * 8); buf.writeFloatLE(outR[i], 48 + i * 8); } writeFileSync(wav, buf); }
// two-pass linear loudnorm: measure, then apply one gain so the dynamics stay intact (-14 LUFS, -1.5 dBTP)
const measOut = execFileSync('sh', ['-c', `ffmpeg -hide_banner -i ${wav} -af alimiter=limit=0.7:attack=1:release=80,loudnorm=I=-14:TP=-1.5:LRA=20:print_format=json -f null - 2>&1`]).toString();
const meas = JSON.parse(measOut.slice(measOut.lastIndexOf('{'), measOut.lastIndexOf('}') + 1));
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-af', `alimiter=limit=0.7:attack=1:release=80,loudnorm=I=-14:TP=-1.5:LRA=20:linear=true:measured_I=${meas.input_i}:measured_TP=${meas.input_tp}:measured_LRA=${meas.input_lra}:measured_thresh=${meas.input_thresh}:offset=${meas.target_offset}`, '-ar', '48000', `${dir}/mix.wav`]);
for (const [src, dst] of [[`${dir}/sandline_trailer.mp4`, `${dir}/sandline_trailer_sound.mp4`], [`${dir}/sandline_trailer_720p.mp4`, `${dir}/sandline_trailer_sound_720p.mp4`]])
  if (existsSync(src)) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-i', `${dir}/mix.wav`, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', dst]);
const missing = Object.keys({ shot: 1, eShot: 1, boom: 1, bigBoom: 1, bossStep: 1, beam: 1, thunderNear: 1, howl: 1, wind: 1, crackle: 1 }).filter((k) => !index[k]);
console.log(`mixed ${total.toFixed(1)}s -> ${dir}/sandline_trailer_sound.mp4`, M ? 'with music' : 'NO music (out/trailer/music.mp3 missing)', missing.length ? `missing samples: ${missing.join(',')}` : '');
