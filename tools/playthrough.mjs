// A full playthrough recorded like a screen capture, frame-exact: title screen, a look round the hangar, deploy,
// the whole mission played by the test bot (smoothed camera, real hits but no death), the results screen.
// One clock drives everything: the game steps 1/60 s per frame, page timers / CSS animations / rAF are virtual,
// and Web Audio runs in an OfflineAudioContext whose clock is the same frame time — so every shot, voice line,
// ambience and music cue the game itself plays lands on its frame. Output: out/video/raw.mp4 (+ raw.wav, moments.json).
//   node tools/playthrough.mjs [maxSeconds]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, openSync, writeSync, closeSync } from 'node:fs';
const FPS = 60, MAXS = +(process.argv[2] || 540), W = 1920, H = 1080, SR = 44100, AUDIO_S = MAXS + 20, out = 'out/video';
mkdirSync(out, { recursive: true });

const SHIM = `(() => {
  const RT = { now: performance.now.bind(performance), dnow: Date.now, st: setTimeout.bind(window), ct: clearTimeout.bind(window), si: setInterval.bind(window), ci: clearInterval.bind(window), raf: requestAnimationFrame.bind(window), caf: cancelAnimationFrame.bind(window) };
  const V = window.__V = { on: false, t: 0, base: 0, dbase: 0, q: [], id: 1e7, rafq: [] };
  performance.now = () => V.on ? V.base + V.t * 1000 : RT.now();
  Date.now = () => V.on ? V.dbase + V.t * 1000 : RT.dnow();
  window.setTimeout = (fn, ms = 0, ...a) => { if (!V.on) return RT.st(fn, ms, ...a); const id = V.id++; V.q.push({ id, at: V.t + (+ms || 0) / 1000, fn, a }); return id; };
  window.clearTimeout = (id) => { if (id >= 1e7) V.q = V.q.filter((x) => x.id !== id); else RT.ct(id); };
  window.setInterval = (fn, ms = 0, ...a) => { if (!V.on) return RT.si(fn, ms, ...a); const id = V.id++; V.q.push({ id, at: V.t + ms / 1000, every: Math.max(ms, 1) / 1000, fn, a }); return id; };
  window.clearInterval = window.clearTimeout;
  window.requestAnimationFrame = (fn) => { if (!V.on) return RT.raf(fn); const id = V.id++; V.rafq.push({ id, fn }); return id; };
  window.cancelAnimationFrame = (id) => { V.rafq = V.rafq.filter((x) => x.id !== id); RT.caf(id); };
  window.__vstart = () => { V.base = RT.now(); V.dbase = RT.dnow(); V.t = 0; V.on = true; };
  window.__vtick = (dt) => {
    V.t += dt;
    for (let guard = 0; guard < 200; guard++) { let k = -1; for (let i = 0; i < V.q.length; i++) if (V.q[i].at <= V.t && (k < 0 || V.q[i].at < V.q[k].at)) k = i; if (k < 0) break;
      const x = V.q[k]; if (x.every) x.at += x.every; else V.q.splice(k, 1); try { x.fn(...x.a); } catch (e) { console.error(e); } }
    const r = V.rafq; V.rafq = []; for (const x of r) { try { x.fn(performance.now()); } catch (e) { console.error(e); } }
    for (const an of document.getAnimations()) { if (an.__vt == null) { an.__vt = Math.max(0, +an.currentTime || 0); an.pause(); } else an.__vt += dt * 1000; try { an.currentTime = an.__vt; } catch {} }
  };
  // Web Audio on the frame clock
  const Off = window.OfflineAudioContext; let C = null;
  function AC() { C = new Off(2, Math.ceil(${AUDIO_S} * ${SR}), ${SR}); Object.defineProperty(C, 'currentTime', { get: () => V.t }); Object.defineProperty(C, 'state', { get: () => (V.on ? 'running' : 'suspended') }); C.resume = () => Promise.resolve(); C.suspend = () => Promise.resolve(); window.__recCtx = C; return C; }
  window.AudioContext = AC; window.webkitAudioContext = AC;
  for (const P of [AudioScheduledSourceNode.prototype, AudioBufferSourceNode.prototype]) {
    if (Object.prototype.hasOwnProperty.call(P, 'start')) { const s0 = P.start; P.start = function (when, ...a) { return s0.call(this, Math.max(V.t, +when || 0), ...a); }; }
    if (Object.prototype.hasOwnProperty.call(P, 'stop')) { const p0 = P.stop; P.stop = function (when) { try { return p0.call(this, Math.max(V.t, +when || 0)); } catch (e) { /* not started */ } }; }
  }
  const D = Object.getOwnPropertyDescriptor(AudioParam.prototype, 'value'), sh = new WeakMap();
  Object.defineProperty(AudioParam.prototype, 'value', { configurable: true, get() { return sh.has(this) ? sh.get(this) : D.get.call(this); },
    set(v) { sh.set(this, v); if (!V.on) { D.set.call(this, v); return; } try { this.setValueAtTime(v, V.t); } catch { D.set.call(this, v); } } });
  window.__audioRender = async () => { const b = await C.startRendering(); window.__ab = b; return b.duration; };
  window.__audioChunk = (t0, t1) => { const b = window.__ab, a = b.getChannelData(0), c = b.getChannelData(1), i0 = Math.floor(t0 * ${SR}), i1 = Math.min(a.length, Math.floor(t1 * ${SR}));
    const u = new Uint8Array((i1 - i0) * 4); const dv = new DataView(u.buffer);
    for (let i = i0, o = 0; i < i1; i++, o += 4) { dv.setInt16(o, Math.max(-1, Math.min(1, a[i])) * 32767, true); dv.setInt16(o + 2, Math.max(-1, Math.min(1, c[i])) * 32767, true); }
    let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
})();`;

const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: W, height: H } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
await p.addInitScript(SHIM);
await p.goto((process.env.BASE || 'http://127.0.0.1:5320') + '/?record=1&tips=1&nodie=1&humanaim=1');
await p.waitForFunction(() => window.__ready, null, { timeout: 180000 });
await p.waitForFunction(() => (window.__G.audio?.samples?.() || []).length > 90, null, { timeout: 120000 }).catch(() => console.log('samples not all loaded'));
await p.evaluate(() => { const G = __G; window.__F = 0; window.__mom = []; const names = ['flow:act', 'valve:open', 'weapon:unlock', 'tank:boom', 'tower:fall', 'tower:down', 'boss:spawn', 'boss:leg', 'boss:exposed', 'grapple:fire', 'grapple:on', 'boss:core', 'boss:overload', 'trap:ignite', 'boss:dying', 'boss:dead', 'flow:extract', 'ship:ready', 'flow:won', 'od:start', 'enemy:killed', 'explosion', 'flow:lastkill', 'drone:dive', 'shield:break', 'lance:fire'];
  for (const n of names) G.events.on(n, (e) => window.__mom.push({ f: window.__F, n, size: e?.size }));
  for (let i = 0; i < 60; i++) __step(1, 1 / 60); __vstart(); });
const bot = readFileSync('tools/bot_page.js', 'utf8');
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS), `${out}/raw.mp4`], { stdio: ['pipe', 'inherit', 'inherit'] });
const put = (buf) => new Promise((r) => (ff.stdin.write(buf) ? r() : ff.stdin.once('drain', r)));
const box = async (sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, sel);
const moveTo = async (sel) => { const c = await box(sel); if (c) await p.mouse.move(c[0], c[1], { steps: 6 }); return c; };
const t0 = Date.now(); let f = 0, phase = 'title', at = 0, botOn = false, endF = 0;
for (; f < MAXS * FPS; f++) {
  // ---- the player's hands on the menus ----
  const s = f / FPS;
  if (phase === 'title') {
    if (f === 100) await moveTo('#ui .title .menu button:nth-child(2)');
    if (f === 130) await moveTo('#ui .title .menu button:nth-child(3)');
    if (f === 160) { const c = await box('#ui .title .menu button:nth-child(3)'); if (c) await p.mouse.click(c[0], c[1]); phase = 'hangar'; at = f; }
  } else if (phase === 'hangar') {
    if (f - at === 380 || f - at === 640) await p.keyboard.press('ArrowDown');
    if (f - at === 900) await p.keyboard.press('Escape');
    if (f - at === 960) await moveTo('#ui .title .menu button:nth-child(1)');
    if (f - at === 1000) { const c = await box('#ui .title .menu button:nth-child(1)'); if (c) await p.mouse.click(c[0], c[1]); phase = 'deploy'; at = f; }
  } else if (phase === 'deploy') {
    if (!botOn && await p.evaluate(() => __G.flow.S.state === 'play') && f - at > 150) { await p.evaluate((src) => { eval(src); __installBot(); }, bot); botOn = true; phase = 'play'; }
  } else if (phase === 'play') {
    if (f % 30 === 0 && await p.evaluate(() => ['won', 'dead'].includes(__G.flow.S.state))) { phase = 'end'; endF = f; }
  } else if (phase === 'end' && f - endF > 60 * 14) break;
  await p.evaluate((F) => { window.__F = F; __vtick(1 / 60); __step(1, 1 / 60); }, f);
  await put(await p.screenshot({ type: 'jpeg', quality: 92 }));
  if (f % 600 === 0) process.stdout.write(`${s.toFixed(0)}s(${phase}) `);
}
ff.stdin.end(); await new Promise((r) => ff.on('close', r));
const dur = f / FPS, mom = await p.evaluate(() => window.__mom), state = await p.evaluate(() => ({ st: __G.flow.S.state, err: __errors.slice(0, 5) }));
writeFileSync(`${out}/moments.json`, JSON.stringify({ fps: FPS, frames: f, dur, mom }));
console.log(`\nvideo ${dur.toFixed(1)} s, ${f} frames in ${((Date.now() - t0) / 60000).toFixed(1)} min`, JSON.stringify(state), errs.slice(0, 4));
// ---- audio: render the offline graph, pull it out in 10 s chunks, write a 16-bit wav ----
const len = await p.evaluate(() => __audioRender()); console.log('audio rendered', len.toFixed(1), 's');
const n = Math.floor(dur * SR), fd = openSync(`${out}/raw.wav`, 'w'), hdr = Buffer.alloc(44);
hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + n * 4, 4); hdr.write('WAVEfmt ', 8); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22); hdr.writeUInt32LE(SR, 24); hdr.writeUInt32LE(SR * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34); hdr.write('data', 36); hdr.writeUInt32LE(n * 4, 40); writeSync(fd, hdr);
for (let t = 0; t < dur; t += 10) writeSync(fd, Buffer.from(await p.evaluate(([a, c]) => __audioChunk(a, c), [t, Math.min(dur, t + 10)]), 'base64'));
closeSync(fd); await b.close();
console.log('wrote', `${out}/raw.mp4`, `${out}/raw.wav`, `${out}/moments.json`);
