import * as THREE from 'three';
import { params, events, rng } from './core/ctx.js';
import { createRenderer } from './render/renderer.js';

window.__errors = []; window.__frames = 0; window.__ready = false; window.__fatal = null;
window.addEventListener('error', (e) => window.__errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => window.__errors.push(String(e.reason)));

const G = { THREE, params, events: events(), rng: rng(+(params.seed || 4207)), time: 0, modules: {}, err: {} };
window.__G = G;

const loading = document.getElementById('loading');
const setLoad = (t, p) => { if (loading) loading.querySelector('span').textContent = `${t} ${Math.round(p * 100)}%`; };
const yieldFrame = () => new Promise((r) => setTimeout(r, 0));

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
  try { await R.renderer.compileAsync(R.scene, R.camera); } catch (e) { console.warn('compileAsync', e); }
  if (loading) loading.style.display = 'none';

  if (params.cam) { const v = params.cam.split(',').map(Number); R.camera.position.set(v[0], v[1], v[2]); R.camera.lookAt(v[3], v[4], v[5]); G.camLocked = true; }
  if (params.fov) { R.camera.fov = +params.fov; R.camera.updateProjectionMatrix(); }

  let last = performance.now();
  const fixedDt = params.dt ? +params.dt : 0;
  R.renderer.setAnimationLoop(() => {
    const now = performance.now();
    let dt = fixedDt || Math.min((now - last) / 1000, 0.1); last = now;
    G.time += dt; G.dt = dt;
    for (const [name, m] of Object.entries(G.modules)) {
      if (!m.update || G.err[name]) continue;
      try { m.update(dt); } catch (e) { G.err[name] = 1; console.error(`[${name}]`, e); window.__errors.push(`${name}: ${e.message}`); }
    }
    try { R.frame(dt); } catch (e) { if (!G.err.render) { G.err.render = 1; console.error(e); window.__errors.push('render: ' + e.message); } }
    window.__frames++;
    if (window.__frames === 4) window.__ready = true;
  });
}

window.__stats = () => {
  const R = G.R; if (!R) return null;
  const i = R.renderer.info;
  return { calls: G.stats.calls, tris: G.stats.tris, geos: i.memory.geometries, tex: i.memory.textures, programs: i.programs?.length, res: R.res, scale: R.scale, tier: R.tier.name };
};

boot().catch((e) => { console.error(e); window.__fatal = String(e && e.stack || e); if (loading) loading.querySelector('span').textContent = 'Error: ' + e.message; });
