import * as THREE from 'three';
import { params, events, rng } from './core/ctx.js';
import { createRenderer } from './render/renderer.js';
import { createBoot } from './ui/screens.js';
import { gpuTexReady, gpuTexSettled } from './render/gputex.js';

window.__errors = []; window.__frames = 0; window.__ready = false; window.__fatal = null;
window.addEventListener('error', (e) => window.__errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => window.__errors.push(String(e.reason)));

const G = { THREE, params, events: events(), rng: rng(+(params.seed || 4207)), time: 0, modules: {}, err: {}, stopT: 0, slowT: 0, slowK: 1 };
G.hitstop = (s) => { G.stopT = Math.max(G.stopT, s); };
G.slowmo = (s, k = 0.3) => { G.slowT = s; G.slowK = k; };
window.__G = G;

let boot0 = null;
const setLoad = (t, p) => boot0?.progress(t, p);
const yieldFrame = () => new Promise((r) => setTimeout(r, 0));

// Loading-screen prewarm, so nothing compiles or uploads on first use mid-match: every model the game can spawn,
// everything that starts hidden (dropship, the lance, beams, wrecks), the first-person view model against the
// scene's lights, and every texture pushed to the GPU.
async function prewarm() {
  const R = G.R, renderer = R.renderer, { preloadAll } = await import('./world/assets.js');
  const tmp = new THREE.Group(); tmp.position.copy(R.camera.position).add(new THREE.Vector3(0, -50, 0));
  if (G.flow) for (const h of await preloadAll()) tmp.add(h.clone(true));
  R.scene.add(tmp);
  const hidden = []; const unhide = (root) => root.traverse((o) => { if (!o.visible && !o.isLight) { hidden.push(o); o.visible = true; } }); // never lights: the light count is part of every shader
  unhide(R.scene); unhide(R.camera);
  await renderer.compileAsync(R.scene, R.camera);
  await renderer.compileAsync(R.camera, R.viewCam, R.scene);
  const seen = new Set(); const up = (root) => root.traverse((o) => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap']) { const t = m[k]; if (t && !seen.has(t)) { seen.add(t); renderer.initTexture(t); } } });
  up(R.scene); up(R.camera);
  // the view model is drawn by its own camera with its own light set: one real frame with every gun showing
  const kits = G.weapon?.kits || []; const was = kits.map((k) => k.g.visible); kits.forEach((k) => { k.g.visible = true; });
  // and the paths that first run mid-game: a robot breaking apart (debris), the x-ray layer (scan / overdrive)
  const E = G.enemies, e0 = E?.list.find((e) => e.alive), nP = E?.wreck?.pieces.length ?? 0;
  if (e0) { try { E.wreck.spawn(e0, new THREE.Vector3(0, 0, 1), false); } catch (err) { console.warn('prewarm wreck', err); } e0.scanT = 1; }
  G.scan?.update?.(0);
  try { R.frame(1 / 60); } catch (e) { console.warn('prewarm frame', e); }
  if (e0) { for (const p of E.wreck.pieces.splice(nP)) R.scene.remove(p.m); e0.root.visible = true; e0.scanT = 0; G.scan?.update?.(0); }
  kits.forEach((k, i) => { k.g.visible = was[i]; });
  if (R.M?.exp) R.M.exp.uniforms.uFirst.value = 1; // that frame must not seed auto-exposure
  for (const o of hidden) o.visible = false; R.scene.remove(tmp);
}

// Before anything downloads: say plainly when this machine cannot play (a phone or tablet, no WebGL2), instead of
// a 120 MB load that ends in a frozen bar. Capture tools (webdriver) skip it.
function gate() {
  if (navigator.webdriver || params.force) return null;
  if (!matchMedia('(pointer: fine)').matches || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent))
    return ['SANDLINE 是电脑游戏，需要键盘和鼠标。请在电脑上用 Chrome 或 Edge 打开这个链接。', 'SANDLINE is a PC game: open this link on a computer with a keyboard and mouse (Chrome or Edge).'];
  if (!document.createElement('canvas').getContext('webgl2'))
    return ['这个浏览器没有开启 WebGL2 或显卡加速。请换最新版 Chrome 或 Edge，并在浏览器设置里打开“使用图形加速”。', 'This browser has no WebGL2 / graphics acceleration. Use an up-to-date Chrome or Edge with hardware acceleration on.'];
  return null;
}
function notice([zh, en]) {
  document.getElementById('loading')?.remove(); document.querySelector('.scr.boot')?.remove();
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;background:#0b0907;color:#e8e2d6;text-align:center;font:16px/1.6 system-ui,sans-serif;z-index:99';
  d.innerHTML = `<div style="letter-spacing:.3em;color:#e0782a;font-weight:700">SANDLINE</div><div style="max-width:34em"></div><div style="max-width:34em;color:#9c8f7c;font-size:14px"></div>`;
  d.children[1].textContent = zh; d.children[2].textContent = en;
  document.body.appendChild(d);
}

async function boot() {
  const canvas = document.getElementById('c');
  // the GPU dropped the page (out of memory, driver reset): tell the player what to do instead of a frozen frame
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); notice(['显卡内存不够，画面停止了。请关掉其他网页和程序后刷新；还不行就在 ESC 菜单的 SETTINGS 里把 QUALITY 调成 LOW。', 'The graphics card ran out of memory. Close other tabs and reload; if it happens again, set QUALITY to LOW in ESC > SETTINGS.']); });
  const R = createRenderer(G, canvas);
  G.R = R;
  R.resize();
  await gpuTexReady(); // decide plain vs GPU-encoded textures before any material is made
  setLoad('world', 0.2); await yieldFrame();
  const show = params.show || 'game';
  const mods = await import('./scenes.js');
  await mods.build(G, show, setLoad);
  await gpuTexSettled();
  setLoad('compile', 0.9); await yieldFrame();
  try { await prewarm(); } catch (e) { console.warn('prewarm', e); }
  if (G.flow) {
    const { createUI } = await import('./ui/screens.js'); G.ui = createUI(G, boot0);
    const ie = G.modules.inputEnd; delete G.modules.inputEnd; G.modules.titleCam = G.ui.titleCam; G.modules.inputEnd = ie;
  } else boot0.out();

  if (params.cam) { const v = params.cam.split(',').map(Number); R.camera.position.set(v[0], v[1], v[2]); R.camera.lookAt(v[3], v[4], v[5]); G.camLocked = true; }
  if (params.fov) { R.camera.fov = +params.fov; R.camera.updateProjectionMatrix(); }

  let last = performance.now(); G.prof = new Proxy({}, { get: (o, k) => (k in o ? o[k] : 0) });
  const fixedDt = params.dt ? +params.dt : 0;
  const tick = (forceDt) => {
    const now = performance.now();
    const real = forceDt || fixedDt || Math.min((now - last) / 1000, 0.1); last = now;
    // game time: hitstop (near-freeze for a few frames) and slow motion, both measured in real seconds
    if (G.stopT > 0) G.stopT -= real;
    if (G.slowT > 0) G.slowT -= real;
    const slow = G.slowT > 0 ? THREE.MathUtils.lerp(1, G.slowK, Math.min(1, G.slowT / 0.25)) : 1;
    const dt = G.paused ? 0 : real * (G.stopT > 0 ? 0.04 : slow);
    G.time += dt; G.dt = dt; G.realDt = real;
    for (const [name, m] of Object.entries(G.modules)) {
      if (!m.update || G.err[name] || (G.paused && name !== 'inputEnd')) continue;
      const t0 = performance.now();
      try { m.update(dt); } catch (e) { G.err[name] = 1; console.error(`[${name}]`, e); window.__errors.push(`${name}: ${e.message} @ ${(String(e.stack).split('\n')[1] || '').trim().replace(/^at /, '').replace(/https?:\/\/[^/]+\//, '').replace(/\?t=\d+/, '')}`); }
      G.prof[name] = G.prof[name] * 0.95 + (performance.now() - t0) * 0.05; // CPU ms per module (smoothed)
    }
    const tr = performance.now();
    if (!G.hangarOpen) try { R.frame(dt); } catch (e) { if (!G.err.render) { G.err.render = 1; console.error(e); window.__errors.push('render: ' + e.message); } }
    G.prof.render = G.prof.render * 0.95 + (performance.now() - tr) * 0.05;
    try { G.poster?.grab(); } catch { /* a missed photo is not worth an error */ }
    window.__frames++;
    if (window.__frames === 4) window.__ready = true;
  };
  if (params.record) {
    // offline capture: frames advance only when the recorder asks (fixed dt, no wall clock)
    window.__step = (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) tick(dt); return window.__frames; };
    for (let i = 0; i < 4; i++) tick(1 / 60);
  } else R.renderer.setAnimationLoop(() => tick());
}

window.__stats = () => {
  const R = G.R; if (!R) return null;
  const i = R.renderer.info;
  return { calls: G.stats.calls, tris: G.stats.tris, geos: i.memory.geometries, tex: i.memory.textures, programs: i.programs?.length, res: R.res, scale: R.scale, tier: R.tier.name };
};

const blocked = gate();
if (blocked) notice(blocked);
else {
  boot0 = createBoot();
  boot().catch((e) => { console.error(e); window.__fatal = String(e && e.stack || e); boot0.fail(e.message); });
}
