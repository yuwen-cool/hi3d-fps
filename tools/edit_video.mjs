// The edit: cold open (the run's five biggest shots, hard cuts on the hits) -> title card -> the playthrough with the
// dead air trimmed (short crossfades; fights, set pieces and act openings never cut) -> results -> end card.
// Sound is the game's own recorded mix, with the game's music under the open, the menus and the cards; -14 LUFS.
//   node tools/edit_video.mjs   (needs out/video/raw.mp4, raw.wav, moments.json, card_title.png, card_end.png)
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const dir = 'out/video', M = JSON.parse(readFileSync(`${dir}/moments.json`, 'utf8')), FPS = M.fps, DUR = M.dur;
const sec = (f) => f / FPS, first = (n, after = 0) => { const m = M.mom.find((x) => x.n === n && x.f >= after); return m ? sec(m.f) : null; };
const all = (n) => M.mom.filter((x) => x.n === n).map((x) => sec(x.f));
const deploy = first('flow:act') ?? 20, won = first('flow:won') ?? DUR - 14;

// ---- activity: where something happens (moments), plus loud audio (gunfire) from the recorded mix ----
const wav = readFileSync(`${dir}/raw.wav`), SR = wav.readUInt32LE(24), data = new Int16Array(wav.buffer, wav.byteOffset + 44, (wav.length - 44) >> 1);
const WIN = 0.25, nW = Math.floor(DUR / WIN), rms = new Float32Array(nW);
for (let w = 0; w < nW; w++) { let s = 0, c = 0; const i0 = Math.floor(w * WIN * SR) * 2, i1 = Math.min(data.length, Math.floor((w + 1) * WIN * SR) * 2); for (let i = i0; i < i1; i += 8) { s += data[i] * data[i]; c++; } rms[w] = Math.sqrt(s / Math.max(1, c)) / 32768; }
const keep = new Uint8Array(nW), mark = (a, b) => { for (let w = Math.max(0, Math.floor(a / WIN)); w < Math.min(nW, Math.ceil(b / WIN)); w++) keep[w] = 1; };
mark(0, deploy + 12);                                                                     // title, hangar, deploy, the brief
for (const t of all('flow:act')) mark(t - 1, t + 9);                                     // every act opening
for (const [n, a, b] of [['boss:spawn', -2, 10], ['boss:leg', -3, 6], ['grapple:fire', -3, 6], ['boss:dying', -2, 10], ['tower:fall', -3, 8], ['tank:boom', -3, 6], ['trap:ignite', -3, 5], ['weapon:unlock', -4, 5], ['valve:open', -4, 4], ['boss:core', -3, 3], ['ship:ready', -6, 4], ['drone:dive', -2, 2], ['shield:break', -2, 2], ['od:start', -1, 4]])
  for (const t of all(n)) mark(t + a, t + b);
for (const t of [...all('enemy:killed'), ...all('explosion'), ...all('lance:fire')]) mark(t - 2.2, t + 1.5);
mark(won - 8, DUR);                                                                        // extraction, results
// segments to keep; a gap shorter than 5 s stays (cutting it would only jolt), longer gaps keep 0.8 s each side
const segs = []; { let a = null; for (let w = 0; w <= nW; w++) { const k = w < nW && keep[w]; if (k && a == null) a = w * WIN; if (!k && a != null) { segs.push([a, w * WIN]); a = null; } } }
const merged = []; for (const s of segs) { const l = merged.at(-1); if (l && s[0] - l[1] < 5) l[1] = s[1]; else merged.push([...s]); }
for (const s of merged) { s[0] = Math.max(0, s[0] - 0.8); s[1] = Math.min(DUR, s[1] + 0.8); }
const body = merged.filter((s) => s[1] - s[0] > 1.2);
const bodyLen = body.reduce((a, s) => a + s[1] - s[0], 0);
console.log(`raw ${DUR.toFixed(0)} s -> body ${bodyLen.toFixed(0)} s in ${body.length} segments`);

// ---- cold open: the five biggest shots of this run, in story-free order for impact ----
const pick = [['tank:boom', 0.25, 1.8], ['boss:spawn', 1.4, 2.1], ['boss:leg', 0.5, 1.9], ['grapple:fire', -0.15, 1.5], ['boss:dying', 3.2, 2.4]]
  .map(([n, off, len]) => { const t = first(n); return t == null ? null : [Math.max(0, t + off), len]; }).filter(Boolean);
const flash = 0.12, xf = 0.35;
// ---- pass 1: every piece as its own short file (fast seek, so the 6-minute master is read once per piece, not per filter) ----
const { mkdirSync } = await import('node:fs'); mkdirSync(`${dir}/parts`, { recursive: true });
const enc = ['-c:v', 'libx264', '-preset', 'fast', '-crf', '14', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2'];
const cut = (a, len, file, vf = null) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', a.toFixed(3), '-t', len.toFixed(3), '-i', `${dir}/raw.mp4`, '-ss', a.toFixed(3), '-t', len.toFixed(3), '-i', `${dir}/raw.wav`, ...(vf ? ['-vf', vf] : []), '-map', '0:v', '-map', '1:a', ...enc, file]);
const parts = [];
pick.forEach(([a, len], i) => { const f = `${dir}/parts/o${i}.mov`; cut(a, len, f); parts.push({ f, len, tr: i ? 'fadewhite' : null, d: flash }); });
// title card: the colossus' death fire, blurred, darkened, a slow push in, the card fading in over it
const tAt = first('boss:leg') != null ? first('boss:leg') + 1.0 : DUR * 0.8, tLen = 3.6; // a still from the knee shot: fire and the machine's silhouette, no text
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', tAt.toFixed(3), '-i', `${dir}/raw.mp4`, '-loop', '1', '-t', String(tLen), '-i', `${dir}/card_title.png`, '-f', 'lavfi', '-t', String(tLen), '-i', 'anullsrc=r=48000:cl=stereo',
  '-filter_complex', `[0:v]trim=end_frame=1,loop=loop=-1:size=1:start=0,trim=duration=${tLen},setpts=PTS-STARTPTS,boxblur=16:2,eq=brightness=-0.16:saturation=0.85,scale=2112:1188,crop=1920:1080:'96-96*t/${tLen}':'54-54*t/${tLen}',setsar=1[bg];[1:v]format=rgba,fade=t=in:st=0.25:d=0.6:alpha=1[c];[bg][c]overlay=0:0:shortest=1,format=yuv420p[v]`,
  '-map', '[v]', '-map', '2:a', ...enc, `${dir}/parts/title.mov`]);
parts.push({ f: `${dir}/parts/title.mov`, len: tLen, tr: 'fadeblack', d: 0.25, title: true });
body.forEach(([a, b], i) => { const f = `${dir}/parts/b${String(i).padStart(2, '0')}.mov`; cut(a, b - a, f); parts.push({ f, len: b - a, tr: i ? 'fade' : 'fadeblack', d: i ? xf : 0.6, body0: i === 0 }); });
const eLen = 4.5;
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-sseof', '-0.6', '-i', `${dir}/raw.mp4`, '-loop', '1', '-t', String(eLen), '-i', `${dir}/card_end.png`, '-f', 'lavfi', '-t', String(eLen), '-i', 'anullsrc=r=48000:cl=stereo',
  '-filter_complex', `[0:v]trim=end_frame=1,loop=loop=-1:size=1:start=0,trim=duration=${eLen},setpts=PTS-STARTPTS,boxblur=18:2,eq=brightness=-0.25,setsar=1[bg];[1:v]format=rgba,fade=t=in:st=0.3:d=0.6:alpha=1[c];[bg][c]overlay=0:0:shortest=1,fade=t=out:st=${eLen - 0.8}:d=0.8,format=yuv420p[v]`,
  '-map', '[v]', '-map', '2:a', ...enc, `${dir}/parts/end.mov`]);
parts.push({ f: `${dir}/parts/end.mov`, len: eLen, tr: 'fadeblack', d: 0.6 });
// ---- pass 2: join with transitions, lay the music, master ----
const F = []; let cv = '0:v', ca = '0:a', T = parts[0].len; const marks = { titleAt: 0, bodyAt: 0 };
parts.slice(1).forEach((p, j) => { const i = j + 1, off = T - p.d, nv = `x${i}v`, na = `x${i}a`;
  F.push(`[${cv}][${i}:v]xfade=transition=${p.tr}:duration=${p.d}:offset=${off.toFixed(3)}[${nv}]`, `[${ca}][${i}:a]acrossfade=d=${p.d}:c1=tri:c2=tri[${na}]`);
  if (p.title) marks.titleAt = off; if (p.body0) marks.bodyAt = off; cv = nv; ca = na; T = off + p.len; });
const total = T, menuEnd = marks.bodyAt + (deploy + 4 - body[0][0]), n = parts.length;
F.push(`[${n}:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=duration=${(marks.bodyAt + 2).toFixed(2)},volume=0.55,afade=t=out:st=${marks.bodyAt.toFixed(2)}:d=2[m1]`,
  `[${n + 1}:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=duration=${(menuEnd - marks.bodyAt + 3).toFixed(2)},volume=0.45,afade=t=in:d=1.5,afade=t=out:st=${(menuEnd - marks.bodyAt).toFixed(2)}:d=3,adelay=${Math.round(marks.bodyAt * 1000)}:all=1[m2]`,
  `[${n + 2}:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=start=20:duration=${(eLen + 2).toFixed(2)},volume=0.6,afade=t=in:d=1,afade=t=out:st=${eLen.toFixed(2)}:d=1.5,adelay=${Math.round((total - eLen - 1) * 1000)}:all=1[m3]`,
  `[${n + 3}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=0.9,adelay=${Math.round(marks.titleAt * 1000)}:all=1[hit]`,
  `[${ca}][m1][m2][m3][hit]amix=inputs=5:normalize=0:duration=first,alimiter=limit=0.8:attack=2:release=80[mix]`);
writeFileSync(`${dir}/edit.filter`, F.join(';\n'));
console.log(`final ${total.toFixed(1)} s (title at ${marks.titleAt.toFixed(1)}, body at ${marks.bodyAt.toFixed(1)})`);
const inputs = [...parts.flatMap((p) => ['-i', p.f]), '-i', 'public/sfx/music_act3_0.mp3', '-i', 'public/sfx/music_act1_0.mp3', '-i', 'public/sfx/music_act3_0.mp3', '-i', 'public/sfx/bigBoom_0.mp3'];
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex_script', `${dir}/edit.filter`, '-map', `[${cv}]`, '-map', '[mix]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-c:a', 'pcm_s16le', `${dir}/cut_raw.mov`], { stdio: 'inherit' });
// loudness: two-pass linear loudnorm to -14 LUFS / -1.5 dBTP, keeping the dynamics
const meas = execFileSync('sh', ['-c', `ffmpeg -hide_banner -i ${dir}/cut_raw.mov -vn -af loudnorm=I=-14:TP=-1.5:LRA=18:print_format=json -f null - 2>&1`]).toString(); const m = JSON.parse(meas.slice(meas.lastIndexOf('{'), meas.lastIndexOf('}') + 1));
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${dir}/cut_raw.mov`, '-c:v', 'copy', '-af', `loudnorm=I=-14:TP=-1.5:LRA=18:linear=true:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset},aresample=48000`, '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', `${dir}/SANDLINE_playthrough.mp4`]);
writeFileSync(`${dir}/edit.json`, JSON.stringify({ total, marks, pick, body }, null, 1));
// a lighter copy for sharing (same picture and sound, smaller file)
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${dir}/SANDLINE_playthrough.mp4`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-maxrate', '14M', '-bufsize', '28M', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', `${dir}/SANDLINE_playthrough_share.mp4`]);
console.log('wrote', `${dir}/SANDLINE_playthrough.mp4`);
