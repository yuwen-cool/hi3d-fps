// Procedural Web Audio: every sound is synthesised at load into AudioBuffers (variants each),
// played through buses: near (player), world (3D panned), dry (UI/hurt), amb, music.
// Master chain: duck lowpass -> compressor -> soft clip. Two convolution reverbs (yard / shed)
// crossfaded by how "inside" the listener is. Numbers: docs/SPEC.md §7.
export function createAudio(G) {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC || G.params.mute) return { update() {} };
  const ctx = new AC();
  const SR = ctx.sampleRate;
  const resume = () => { if (ctx.state !== 'running') ctx.resume(); };
  addEventListener('pointerdown', resume); addEventListener('keydown', resume);
  // ---------- master chain ----------
  const duck = ctx.createBiquadFilter(); duck.type = 'lowpass'; duck.frequency.value = 20000; duck.Q.value = 0.5;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -10; comp.knee.value = 6; comp.ratio.value = 6; comp.attack.value = 0.002; comp.release.value = 0.14;
  const pre = ctx.createGain(); pre.gain.value = 0.45;
  const clip = ctx.createWaveShaper(); clip.oversample = '2x';
  { const n = 2048, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; const a = Math.abs(x * 2); c[i] = Math.sign(x) * (a <= 0.6 ? a : 0.6 + 0.4 * Math.tanh((a - 0.6) / 0.4)) * 0.5; } clip.curve = c; }
  const master = ctx.createGain(); master.gain.value = 0.9;
  duck.connect(comp); comp.connect(pre); pre.connect(clip); clip.connect(master); master.connect(ctx.destination);
  const bus = (g, to = duck) => { const n = ctx.createGain(); n.gain.value = g; n.connect(to); return n; };
  const near = bus(0.95), world = bus(1.0), amb = bus(0.55), musicBus = bus(0.62), dry = bus(1.0, comp);
  const musicDuck = ctx.createGain(); musicDuck.gain.value = 1; musicDuck.connect(musicBus);
  // ---------- reverbs ----------
  function ir(len, early, tau, lp0, lp1) {
    const b = ctx.createBuffer(2, Math.floor(SR * len), SR);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch); let lp = 0;
      for (const [ms, g] of early) { const i = Math.floor(SR * ms / 1000 * (ch ? 1.07 : 0.96)); if (i < d.length) d[i] += g * (Math.random() < 0.5 ? -1 : 1); }
      for (let i = 0; i < d.length; i++) { const t = i / SR; const cut = lp0 * Math.pow(lp1 / lp0, t / len); const k = 1 - Math.exp(-2 * Math.PI * cut / SR); lp += k * ((Math.random() * 2 - 1) - lp); d[i] += lp * Math.exp(-t / tau) * 0.6; }
    }
    return b;
  }
  const revOut = ctx.createConvolver(); revOut.buffer = ir(1.4, [[62, 0.55], [89, 0.42], [118, 0.33], [151, 0.25], [178, 0.18], [243, 0.1]], 0.27, 6000, 900);
  const revIn = ctx.createConvolver(); revIn.buffer = ir(2.2, [[18, 0.6], [31, 0.5], [47, 0.42], [66, 0.33], [92, 0.26], [139, 0.18]], 0.36, 5200, 650);
  const send = ctx.createGain(); send.gain.value = 1;
  const gOut = ctx.createGain(), gIn = ctx.createGain(); gIn.gain.value = 0;
  send.connect(gOut); send.connect(gIn); gOut.connect(revOut); gIn.connect(revIn);
  const rOutG = bus(0.75), rInG = bus(0.95); revOut.connect(rOutG); revIn.connect(rInG);
  const sW = ctx.createGain(); sW.gain.value = 0.9; world.connect(sW); sW.connect(send);
  const sN = ctx.createGain(); sN.gain.value = 0.32; near.connect(sN); sN.connect(send);

  // ---------- synthesis helpers ----------
  const R = Math.random;
  function buf(len, fn) { const b = ctx.createBuffer(1, Math.max(1, Math.floor(SR * len)), SR); const d = b.getChannelData(0); fn(d, SR); let pk = 0; for (const v of d) pk = Math.max(pk, Math.abs(v)); if (pk > 0) for (let i = 0; i < d.length; i++) d[i] /= pk; return b; }
  const lpf = (d, cut, SR_) => { let y = 0; const k = 1 - Math.exp(-2 * Math.PI * cut / SR_); for (let i = 0; i < d.length; i++) { y += k * (d[i] - y); d[i] = y; } };
  const hpf = (d, cut, SR_) => { let y = 0, x0 = 0; const a = 1 / (1 + 2 * Math.PI * cut / SR_); for (let i = 0; i < d.length; i++) { const x = d[i]; y = a * (y + x - x0); x0 = x; d[i] = y; } };
  const env = (t, a, dcy) => (t < a ? t / a : Math.exp(-(t - a) / dcy));
  function gunshot(pitch = 1, bright = 1) {
    return buf(0.34, (d, sr) => {
      const crack = new Float32Array(d.length), body = new Float32Array(d.length), low = new Float32Array(d.length);
      for (let i = 0; i < d.length; i++) { const t = i / sr; crack[i] = (R() * 2 - 1) * env(t, 0.0004, 0.012); body[i] = (R() * 2 - 1) * env(t, 0.001, 0.05); low[i] = Math.sin(2 * Math.PI * (160 * pitch * Math.exp(-t * 18) + 45) * t) * env(t, 0.001, 0.07); }
      hpf(crack, 2600 * bright, sr); lpf(body, 2400 * bright, sr); hpf(body, 180, sr);
      for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = crack[i] * 1.3 + body[i] * 0.9 + low[i] * 1.1 + (t > 0.035 && t < 0.05 ? (R() * 2 - 1) * 0.25 * env(t - 0.035, 0.0005, 0.004) : 0) + (t > 0.06 && t < 0.075 ? (R() * 2 - 1) * 0.18 * env(t - 0.06, 0.0005, 0.004) : 0); }
    });
  }
  function tail(len, refl, lp) { return buf(len, (d, sr) => { for (const [ms, g] of refl) { const i0 = Math.floor(sr * ms / 1000); for (let k = 0; k < sr * 0.03 && i0 + k < d.length; k++) d[i0 + k] += (R() * 2 - 1) * g * Math.exp(-k / (sr * 0.008)); } for (let i = 0; i < d.length; i++) d[i] += (R() * 2 - 1) * 0.35 * Math.exp(-i / sr / (len * 0.28)); lpf(d, lp, sr); hpf(d, 90, sr); }); }
  function click(f = 3000, len = 0.03, n = 2) { return buf(len + n * 0.04, (d, sr) => { for (let c = 0; c < n; c++) { const i0 = Math.floor(sr * c * 0.035 * (0.8 + R() * 0.4)); for (let i = 0; i < sr * len && i0 + i < d.length; i++) { const t = i / sr; d[i0 + i] += ((R() * 2 - 1) * 0.6 + Math.sin(2 * Math.PI * f * (0.8 + c * 0.3) * t)) * Math.exp(-t / (len * 0.25)); } } hpf(d, 600, sr); }); }
  function step(surf) { return buf(0.18, (d, sr) => { for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = (R() * 2 - 1) * env(t, 0.004, surf === 'metal' ? 0.05 : 0.03) + (surf === 'metal' ? Math.sin(2 * Math.PI * 420 * t) * 0.3 * Math.exp(-t / 0.06) : 0); } lpf(d, surf === 'sand' ? 1400 : 2600, sr); hpf(d, 120, sr); }); }
  function clink() { return buf(0.35, (d, sr) => { const fs = [3100, 4700, 6900, 8800].map((f) => f * (0.9 + R() * 0.2)); for (let i = 0; i < d.length; i++) { const t = i / sr; let s = 0; fs.forEach((f, k) => { s += Math.sin(2 * Math.PI * f * t) * Math.exp(-t / (0.09 / (1 + k * 0.5))); }); d[i] = s; } }); }
  function impact(kind) { return buf(0.25, (d, sr) => { for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = (R() * 2 - 1) * env(t, 0.0005, kind === 'metal' ? 0.03 : 0.02) + (kind === 'metal' ? Math.sin(2 * Math.PI * (2200 + R() * 10) * t) * 0.5 * Math.exp(-t / 0.05) : 0) + (kind === 'robot' ? Math.sin(2 * Math.PI * 1300 * t) * 0.7 * Math.exp(-t / 0.08) + Math.sin(2 * Math.PI * 3400 * t) * 0.4 * Math.exp(-t / 0.04) : 0); } if (kind === 'sand') lpf(d, 1800, sr); hpf(d, 300, sr); }); }
  function boom() { return buf(2.4, (d, sr) => { for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = (R() * 2 - 1) * env(t, 0.003, 0.5) * 0.8 + Math.sin(2 * Math.PI * (55 * Math.exp(-t * 2) + 28) * t) * env(t, 0.004, 0.6); } lpf(d, 1500, sr); }); }
  function whiz() { return buf(0.3, (d, sr) => { for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = (R() * 2 - 1) * Math.exp(-Math.pow((t - 0.12) / 0.05, 2)); } lpf(d, 4500, sr); hpf(d, 1200, sr); }); }
  function servo() { return buf(1.6, (d, sr) => { for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = Math.sin(2 * Math.PI * (180 + 40 * Math.sin(t * 4)) * t) * 0.4 + Math.sin(2 * Math.PI * 360 * t) * 0.15 + (R() * 2 - 1) * 0.1; } lpf(d, 1200, sr); }); }
  function tele() { return buf(0.5, (d, sr) => { for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = Math.sin(2 * Math.PI * (600 + 1800 * t) * t) * Math.min(1, t * 20) * (1 - t / 0.5) * 0.7; } }); }
  function death() { return buf(1.4, (d, sr) => { for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = Math.sin(2 * Math.PI * (300 * Math.exp(-t * 1.8) + 40) * t) * Math.exp(-t / 0.6) * 0.8 + (R() * 2 - 1) * Math.exp(-t / 0.08) * 0.8 + (R() < 0.002 ? 1 : 0) * Math.exp(-t / 0.5); } lpf(d, 3000, sr); }); }
  function hurt() { return buf(0.3, (d, sr) => { for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = Math.sin(2 * Math.PI * 70 * t) * env(t, 0.002, 0.1) + (R() * 2 - 1) * env(t, 0.001, 0.03) * 0.5; } lpf(d, 900, sr); }); }
  function ring() { return buf(2.2, (d, sr) => { for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = Math.sin(2 * Math.PI * 3900 * t) * Math.min(1, t * 30) * Math.exp(-t / 0.8); } }); }
  function wind(len = 6) { const b = ctx.createBuffer(2, SR * len, SR); for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); let y = 0, z = 0; for (let i = 0; i < d.length; i++) { const t = i / SR; const g = 0.5 + 0.5 * Math.sin(t * 2 * Math.PI / len + ch) * Math.sin(t * 1.3 + ch * 2); y += 0.02 * ((R() * 2 - 1) - y); z += 0.2 * (y - z); d[i] = z * (0.4 + 0.6 * g) * 3; } } return b; }
  function hitmark(weak) { return buf(0.12, (d, sr) => { for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = Math.sin(2 * Math.PI * (weak ? 2600 : 1900) * t) * Math.exp(-t / 0.03); } }); }

  // ---- phase-2 sounds: storm, fire, colossus, launcher, big set pieces ----
  function thunder(close) { return buf(5, (d, sr) => { let y = 0; const k = 1 - Math.exp(-2 * Math.PI * 160 / sr); const cracks = Array.from({ length: 6 }, () => [R() * 1.5, 0.3 + R() * 0.7]);
    for (let i = 0; i < d.length; i++) { const t = i / sr; y += k * ((R() * 2 - 1) - y); let a = Math.exp(-t / 1.6) * Math.min(1, t * 6); for (const [c, g] of cracks) a += g * Math.exp(-Math.abs(t - c) / 0.18) * (t > c ? 1 : 0.2); d[i] = y * a * 3 + (close && t < 0.12 ? (R() * 2 - 1) * Math.exp(-t / 0.03) * 0.8 : 0); } }); }
  function rumble(len, f0, f1, decay) { return buf(len, (d, sr) => { let ph = 0; for (let i = 0; i < d.length; i++) { const t = i / sr; ph += 2 * Math.PI * (f1 + (f0 - f1) * Math.exp(-t * 6)) / sr; d[i] = Math.sin(ph) * env(t, 0.006, decay) + (R() * 2 - 1) * env(t, 0.002, decay * 0.3) * 0.5; } lpf(d, 900, sr); }); }
  function clank() { return buf(0.9, (d, sr) => { const fs = [180, 260, 410, 640].map((f) => f * (0.9 + R() * 0.2)); for (let i = 0; i < d.length; i++) { const t = i / sr; let x = 0; fs.forEach((f, k) => { x += Math.sin(2 * Math.PI * f * t) * Math.exp(-t / (0.25 - k * 0.04)); }); d[i] = x * 0.4 + (R() * 2 - 1) * env(t, 0.001, 0.02); } }); }
  function whine(len, f0, f1) { return buf(len, (d, sr) => { let ph = 0; for (let i = 0; i < d.length; i++) { const t = i / sr, k = t / len; ph += 2 * Math.PI * (f0 + (f1 - f0) * k * k) / sr; d[i] = (Math.sin(ph) + 0.4 * Math.sin(ph * 2.01) + 0.25 * (R() * 2 - 1) * k) * Math.min(1, t * 4) * (k < 0.95 ? 1 : (1 - k) * 20); } }); }
  function roar(len) { return buf(len, (d, sr) => { let y = 0; for (let i = 0; i < d.length; i++) { const t = i / sr; y += 0.2 * ((R() * 2 - 1) - y); d[i] = (y * 1.4 + Math.sin(2 * Math.PI * 95 * t) * 0.5 * (0.7 + 0.3 * Math.sin(t * 60)) + Math.sin(2 * Math.PI * 190 * t) * 0.25) * Math.min(1, t * 12) * Math.min(1, (len - t) * 6); } }); }
  function thoomp() { return buf(0.5, (d, sr) => { for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = Math.sin(2 * Math.PI * (120 * Math.exp(-t * 14) + 50) * t) * env(t, 0.002, 0.09) + (R() * 2 - 1) * env(t, 0.001, 0.03) * 0.6; } lpf(d, 1800, sr); }); }
  function hiss(len) { return buf(len, (d, sr) => { for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = (R() * 2 - 1) * Math.min(1, t * 10) * Math.min(1, (len - t) * 3); } hpf(d, 2500, sr); }); }
  function whoomp() { return buf(1.2, (d, sr) => { let y = 0; for (let i = 0; i < d.length; i++) { const t = i / sr; y += 0.05 * ((R() * 2 - 1) - y); d[i] = y * 6 * env(t, 0.08, 0.35); } }); }
  function crackleLoop(len = 4) { const b = ctx.createBuffer(1, SR * len, SR), d = b.getChannelData(0); let y = 0; for (let i = 0; i < d.length; i++) { y += 0.08 * ((R() * 2 - 1) - y); d[i] = y * 0.6 + (R() < 0.0009 ? (R() * 2 - 1) * 0.9 : 0) + (R() < 0.004 ? (R() * 2 - 1) * 0.3 : 0); } return b; }
  function howlLoop(len = 8) { const b = ctx.createBuffer(2, SR * len, SR); for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); let y = 0, z = 0; for (let i = 0; i < d.length; i++) { const t = i / SR; const g = 0.55 + 0.45 * Math.sin(t * 2 * Math.PI / len * 3 + ch) * Math.sin(t * 1.7 + ch * 2); y += 0.03 * ((R() * 2 - 1) - y); z += 0.25 * ((R() * 2 - 1) - z); d[i] = (y * 3 + z * 0.35) * g; } } return b; }
  const V = (n, f) => Array.from({ length: n }, (_, i) => f(i));
  const S = {
    shot: V(4, (i) => gunshot([1, 0.955, 1.045, 0.985][i], [1, 1.12, 0.9, 1.05][i])),
    tailOut: V(2, () => tail(1.55, [[58, 0.6], [97, 0.45], [151, 0.35], [204, 0.25], [262, 0.15]], 2200)),
    tailIn: V(2, () => tail(2.3, [[44, 0.7], [90, 0.55], [135, 0.45], [181, 0.35], [228, 0.25]], 1400)),
    dry: [click(2500, 0.02, 1)], magout: [click(1800, 0.04, 2)], magin: [click(1400, 0.05, 2)], slap: [click(900, 0.06, 1)], bolt: [click(2200, 0.03, 3)],
    stepSand: V(4, () => step('sand')), stepMetal: V(4, () => step('metal')), stepConc: V(4, () => step('concrete')),
    clink: V(4, clink), impMetal: V(3, () => impact('metal')), impConc: V(3, () => impact('concrete')), impSand: V(3, () => impact('sand')), impRobot: V(3, () => impact('robot')),
    boom: [boom()], whiz: V(3, whiz), servo: [servo()], tele: [tele()], death: V(2, death), hurt: V(3, hurt), ring: [ring()], hit: [hitmark(false)], hitWeak: [hitmark(true)],
    eShot: V(3, (i) => gunshot([0.82, 0.86, 0.79][i], 0.75)),
    thunderNear: [thunder(true)], thunderFar: V(2, () => thunder(false)), bossStep: V(3, () => rumble(1.4, 70, 32, 0.45)), clank: V(3, clank),
    charge: [whine(1.6, 140, 900)], beam: [roar(1.9)], gl: [thoomp()], hiss: [hiss(1.2)], whoomp: [whoomp()], bigBoom: [rumble(4, 60, 24, 1.4)], groan: [whine(3.2, 90, 40)],
  };
  // ---- recorded/generated samples (public/sfx/index.json: { key: [file, ...] }) replace the synthesised
  // variants per key; loops (wind, howl, crackle, music_act1..3) are picked up by the beds and score.
  const SMP = {};
  fetch('/sfx/index.json').then((r) => (r.ok ? r.json() : {})).then(async (idxJson) => {
    await Promise.all(Object.entries(idxJson).map(async ([k, files]) => {
      const bufs = (await Promise.all(files.map((f) => fetch('/sfx/' + f).then((r) => r.arrayBuffer()).then((a) => ctx.decodeAudioData(a)).catch(() => null)))).filter(Boolean);
      if (!bufs.length) return; SMP[k] = bufs; if (S[k]) S[k] = bufs;
    }));
    G.events.emit('audio:samples', { keys: Object.keys(SMP) });
  }).catch(() => {});
  const idx = {};
  const pick = (k) => { const a = S[k]; idx[k] = ((idx[k] || 0) + 1 + (a.length > 2 && R() < 0.3 ? 1 : 0)) % a.length; return a[idx[k]]; };
  const last = {};
  function play(k, { bus: b = near, gain = 1, rate = 1, jitter = 0.035, pos = null, ref = 3, roll = 0.6, every = 0 } = {}) {
    if (ctx.state !== 'running') return;
    const now = ctx.currentTime; if (every && last[k] && now - last[k] < every) return; last[k] = now;
    const src = ctx.createBufferSource(); src.buffer = pick(k); src.playbackRate.value = rate * (1 + (R() * 2 - 1) * jitter);
    const g = ctx.createGain(); g.gain.value = gain * (1 - R() * 0.08);
    src.connect(g);
    if (pos) { const p = ctx.createPanner(); p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = roll; p.maxDistance = 400; p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; g.connect(p); p.connect(world); }
    else g.connect(b);
    src.start(); return src;
  }
  // ambience: wind bed
  let windSrc = null;
  function startAmb() { if (windSrc || ctx.state !== 'running') return; windSrc = ctx.createBufferSource(); windSrc.buffer = SMP.wind?.[0] || wind(); windSrc.loop = true; const g = ctx.createGain(); g.gain.value = 0.5; windSrc.connect(g); g.connect(amb); windSrc.start(); startMusic(); }
  // music: slow dark pad + pulse that rises in combat (procedural, no samples)
  let musicLvl = 0, combat = 0, pulseT = 0; const mus = {};
  function startMusic() {
    const out = ctx.createGain(); out.gain.value = 0; out.connect(musicDuck); mus.out = out;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 0.7; lp.connect(out); mus.lp = lp;
    mus.osc = []; for (const [f, det] of [[55, 0], [82.4, 4], [110, -6], [130.8, 7], [164.8, -3]]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det; const g = ctx.createGain(); g.gain.value = 0.05; o.connect(g); g.connect(lp); o.start(); mus.osc.push(o); }
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07; const lg = ctx.createGain(); lg.gain.value = 280; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
  }
  function pulse() { // low tom + noise hat, only in combat
    const t = ctx.currentTime; const o = ctx.createOscillator(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.25); const g = ctx.createGain(); g.gain.setValueAtTime(0.35 * combat, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35); o.connect(g); g.connect(musicDuck); o.start(t); o.stop(t + 0.4);
  }

  // ---------- event bindings ----------
  let indoor = 0, muffle = 0, ringCd = 0, musDuckV = 1, lastTail = 0;
  const ev = G.events;
  ev.on('weapon:fire', (e) => {
    startAmb(); musDuckV = Math.min(musDuckV, 0.55); combat = Math.min(1, combat + 0.08);
    play('shot', { gain: 1, jitter: 0.012 });
    const now = ctx.currentTime; if (now - lastTail > 0.28) { lastTail = now; play('tailOut', { bus: dry, gain: 0.55 * (1 - indoor), jitter: 0.02 }); if (indoor > 0.05) play('tailIn', { bus: dry, gain: 0.62 * indoor, jitter: 0.02 }); }
    if (e.hitW) play(e.hitW.surface === 'metal' ? 'impMetal' : e.hitW.surface === 'sand' ? 'impSand' : 'impConc', { pos: e.hitW.point, ref: 4, gain: 0.9, jitter: 0.07, every: 0.022 });
    if (e.hitE) play(e.hitE.part === 'weak' ? 'hitWeak' : 'hit', { bus: dry, gain: 0.5, rate: 1 });
    if (e.hitE) play('impRobot', { pos: e.hitE.point, ref: 5, gain: e.hitE.part === 'weak' ? 1 : 0.85, rate: e.hitE.part === 'weak' ? 1.25 : 1, jitter: 0.07 });
  });
  ev.on('weapon:dry', () => play('dry', { gain: 0.6 }));
  for (const k of ['magout', 'magin', 'slap', 'bolt']) ev.on('weapon:' + k, () => play(k, { gain: 0.7 }));
  ev.on('player:step', (e) => { startAmb(); const inside = indoor > 0.5; play(inside ? 'stepConc' : 'stepSand', { gain: e.sprint ? 0.8 : 0.55, jitter: 0.06 }); });
  ev.on('player:land', (e) => play('stepSand', { gain: Math.min(1.2, 0.35 + e.v / 10), rate: 0.8 }));
  ev.on('shell:bounce', (e) => play('clink', { pos: e.pos, ref: 2, roll: 1, gain: 0.8, jitter: 0.08, every: 0.04 }));
  ev.on('enemy:fire', (e) => play('eShot', { pos: e.pos, ref: 8, gain: 1, jitter: 0.02 }));
  ev.on('enemy:tele', (e) => play('tele', { pos: e.e.root.position, ref: 6, gain: 0.5, every: 0.12 }));
  ev.on('enemy:killed', (e) => { play('death', { pos: e.pos, ref: 7, gain: 0.9 }); });
  ev.on('whiz', (e) => play('whiz', { pos: e.pos, ref: 1.5, gain: Math.max(0.3, Math.min(1, 1.15 - e.d / 3.5)), jitter: 0.1, every: 0.09 }));
  ev.on('player:hit', (e) => { play('hurt', { bus: dry, gain: 0.5 + e.dmg / 40 }); muffle = Math.max(muffle, Math.min(0.7, Math.max(0.2, e.dmg / 40))); if (e.dmg >= 6 && ringCd <= 0) { ringCd = 1.8; play('ring', { bus: dry, gain: 0.25 }); } });
  ev.on('explosion', (e) => { play('boom', { pos: e.pos, ref: 12, roll: 0.5, gain: 0.6 + 0.25 * e.size }); musDuckV = Math.min(musDuckV, 0.4); });
  ev.on('player:dead', () => { muffle = 1; });
  ev.on('thunder', (e) => setTimeout(() => play(e.delay < 0.25 ? 'thunderNear' : 'thunderFar', { bus: dry, gain: Math.max(0.35, 1.1 - e.delay * 0.5), jitter: 0.08 }), e.delay * 1000));
  ev.on('boss:step', (e) => { play('bossStep', { pos: e.pos, ref: 25, roll: 0.4, gain: 1.2, jitter: 0.1 }); play('clank', { pos: e.pos, ref: 18, roll: 0.5, gain: 0.5, jitter: 0.12 }); });
  ev.on('boss:charge', () => { const B = G.boss?.S; play('charge', { pos: B?.pos, ref: 25, roll: 0.3, gain: 1 }); });
  ev.on('boss:beam', (e) => play('beam', { pos: e.pos, ref: 30, roll: 0.25, gain: 1.2 }));
  ev.on('boss:dying', (e) => play('groan', { pos: e.pos, ref: 30, roll: 0.3, gain: 1 }));
  ev.on('gl:fire', () => play('gl', { gain: 1 }));
  ev.on('leak', (e) => play('hiss', { pos: e.pos, ref: 4, gain: 0.7, every: 0.2 }));
  ev.on('ignite', (e) => play('whoomp', { pos: e.pos, ref: 6, gain: 1 }));
  for (const n of ['tank:boom', 'tower:down', 'boss:dead']) ev.on(n, (e) => { play('bigBoom', { bus: dry, gain: 1.1 }); musDuckV = 0.2; });
  ev.on('tower:fall', (e) => play('groan', { pos: e.pos, ref: 40, roll: 0.2, gain: 1.1, rate: 0.7 }));
  // per-act score: the pad's chord and the pulse tempo follow the story
  const CHORDS = { 1: [55, 82.4, 110, 130.8, 164.8], 2: [51.9, 77.8, 103.8, 123.5, 155.6], 3: [43.7, 65.4, 87.3, 103.8, 130.8] }; let bpm = 92;
  const loops = {}; // act -> { src, g }
  function playAct(a) {
    const b = SMP['music_act' + a]?.[0]; if (!b || ctx.state !== 'running') return false;
    const t = ctx.currentTime;
    for (const [k, l] of Object.entries(loops)) { l.g.gain.setTargetAtTime(0, t, 1.2); l.src.stop(t + 6); delete loops[k]; }
    const src = ctx.createBufferSource(); src.buffer = b; src.loop = true; const g = ctx.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(0.8, t, 1.5); src.connect(g); g.connect(musicDuck); src.start(); loops[a] = { src, g };
    if (mus.out) mus.out.gain.setTargetAtTime(0, t, 1.0); mus.sampled = true; return true;
  }
  ev.on('flow:act', (e) => { if (playAct(e.act)) return; const c = CHORDS[e.act]; if (c && mus.osc) mus.osc.forEach((o, i) => o.frequency.setTargetAtTime(c[i], ctx.currentTime, 2.5)); bpm = [92, 92, 104, 118][e.act] || 92; });
  ev.on('boss:spawn', () => { combat = 1; });
  // storm howl and fire crackle beds
  const beds = {};
  function startBeds() { if (beds.on || ctx.state !== 'running') return; beds.on = true;
    for (const [k, b] of [['howl', SMP.howl?.[0] || howlLoop()], ['crackle', SMP.crackle?.[0] || crackleLoop()]]) { const src = ctx.createBufferSource(); src.buffer = b; src.loop = true; const g = ctx.createGain(); g.gain.value = 0; src.connect(g); g.connect(amb); src.start(); beds[k] = g; } }

  function update(dt) {
    const cam = G.R.camera; const p = cam.getWorldPosition(new G.THREE.Vector3()); const f = cam.getWorldDirection(new G.THREE.Vector3());
    const L = ctx.listener; if (L.positionX) { L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z; L.forwardX.value = f.x; L.forwardY.value = f.y; L.forwardZ.value = f.z; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; }
    const C = G.level?.layout?.corridor; const inside = C && p.x > C.minX && p.x < C.maxX && p.z > C.minZ && p.z < C.maxZ ? 1 : 0;
    indoor += (inside - indoor) * Math.min(1, dt * 3); gOut.gain.value = 1 - 0.9 * indoor; gIn.gain.value = indoor;
    muffle = Math.max(0, muffle - dt * (G.player.s.dead ? 0 : 0.6)); duck.frequency.value = 20000 * Math.pow(0.03, muffle);
    musDuckV += (1 - musDuckV) * Math.min(1, dt * 3.5); musicDuck.gain.value = musDuckV;
    ringCd -= dt;
    const engaged = G.enemies?.list?.some((e) => e.alive && e.state === 'engage');
    combat += ((engaged ? 1 : 0) - combat) * Math.min(1, dt * (engaged ? 0.6 : 0.15));
    if (mus.out && !mus.sampled) { musicLvl += (0.55 + 0.45 * combat - musicLvl) * Math.min(1, dt * 0.5); mus.out.gain.value = musicLvl; mus.lp.frequency.value = 500 + 1600 * combat; }
    if (combat > 0.3 && !mus.sampled) { pulseT -= dt; if (pulseT <= 0) { pulseT = 60 / bpm; pulse(); } }
    startBeds();
    if (beds.on) {
      const inside = G.env?.S?.inside || 0, storm = G.env?.S?.storm || 0; beds.howl.gain.value += (inside * 1.3 + storm * 0.15 - beds.howl.gain.value) * Math.min(1, dt * 1.5);
      let fd = 1e9; for (const f of G.fire?.fires || []) fd = Math.min(fd, f.pos.distanceTo(p) / Math.max(0.5, f.size)); beds.crackle.gain.value += (Math.min(1, 3 / (1 + fd)) * 0.9 - beds.crackle.gain.value) * Math.min(1, dt * 3);
    }
  }
  return { update, ctx, play };
}
