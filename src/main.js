import * as THREE from 'three';
import { params, events, rng } from './core/ctx.js';
import { createRenderer } from './render/renderer.js';
import { createBoot } from './ui/screens.js';

window.__errors = []; window.__frames = 0; window.__ready = false; window.__fatal = null;
window.addEventListener('error', (e) => window.__errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => window.__errors.push(String(e.reason)));

const G = { THREE, params, events: events(), rng: rng(+(params.seed || 4207)), time: 0, modules: {}, err: {}, stopT: 0, slowT: 0, slowK: 1 };
G.hitstop = (s) => { G.stopT = Math.max(G.stopT, s); };
G.slowmo = (s, k = 0.3) => { G.slowT = s; G.slowK = k; };
window.__G = G;

const boot0 = createBoot();
const setLoad = (t, p) => boot0.progress(t, p);
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
  try { R.frame(1 / 60); } catch (e) { console.warn('prewarm frame', e); }
  kits.forEach((k, i) => { k.g.visible = was[i]; });
  if (R.M?.exp) R.M.exp.uniforms.uFirst.value = 1; // that frame must not seed auto-exposure
  for (const o of hidden) o.visible = false; R.scene.remove(tmp);
}

async function boot() {
  const canvas = document.getElementById('c');
  const R = createRenderer(G, canvas);
  G.R = R;
  R.resize();
  setLoad('world', 0.2); await yieldFrame();
  const show = params.show || 'game';
  const mods = await import('./scenes.js');
  await mods.build(G, show, setLoad);
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
      try { m.update(dt); } catch (e) { G.err[name] = 1; console.error(`[${name}]`, e); window.__errors.push(`${name}: ${e.message}`); }
      G.prof[name] = G.prof[name] * 0.95 + (performance.now() - t0) * 0.05; // CPU ms per module (smoothed)
    }
    const tr = performance.now();
    try { R.frame(dt); } catch (e) { if (!G.err.render) { G.err.render = 1; console.error(e); window.__errors.push('render: ' + e.message); } }
    G.prof.render = G.prof.render * 0.95 + (performance.now() - tr) * 0.05;
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

boot().catch((e) => { console.error(e); window.__fatal = String(e && e.stack || e); boot0.fail(e.message); });
