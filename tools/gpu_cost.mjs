// GPU time per frame (timer queries) on the title scene, with each costly feature switched off in turn.
//   node tools/gpu_cost.mjs [width] [height] [dpr] [query]
import { chromium } from 'playwright';
const [w = 1512, h = 900, dpr = 2, q = 'dynres=0'] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'chrome', headless: false, args: ['--mute-audio'] });
const ctx = await b.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr }); const p = await ctx.newPage();
await p.goto((process.env.BASE || 'http://127.0.0.1:5320') + '/?' + q); await p.waitForFunction(() => window.__ready, null, { timeout: 120000 }); await p.waitForTimeout(4000);
await p.evaluate(() => { window.__gpuRes = null; (async () => { const G = window.__G, R = G.R, gl = R.renderer.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'); R.renderer.setAnimationLoop(null);
  const gpu = (n = 40) => new Promise((res) => { const qs = [], vals = []; let i = 0;
    const step = () => { if (i < n) { const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); R.frame(1 / 60); gl.endQuery(ext.TIME_ELAPSED_EXT); qs.push(q); i++; }
      for (let k = qs.length - 1; k >= 0; k--) { const q = qs[k]; if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) { if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) vals.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(q); qs.splice(k, 1); } }
      if (i >= n && !qs.length) { vals.sort((a, b) => a - b); res(vals.length ? +vals[Math.floor(vals.length / 2)].toFixed(2) : -1); } else requestAnimationFrame(step); };
    requestAnimationFrame(step); });
  const C = R.M.comp.uniforms, out = { out: [R.renderer.domElement.width, R.renderer.domElement.height], res: R.res };
  out.base = await gpu();
  const tog = async (name, on, off) => { on(); out[name] = await gpu(); off(); };
  await tog('noShadow', () => { R.sun.castShadow = false; }, () => { R.sun.castShadow = true; });
  await tog('noVol', () => { R.post.vol = false; }, () => { R.post.vol = true; });
  await tog('noAO', () => { R.post.ao = false; }, () => { R.post.ao = true; });
  await tog('noSSR', () => { C.uUseSSR.value = 0; }, () => { C.uUseSSR.value = 1; });
  await tog('noBloom', () => { R.post.bloom = false; }, () => { R.post.bloom = true; });
  await tog('noVM', () => { G.viewModelVisible = false; }, () => { G.viewModelVisible = true; });
  await tog('noPost', () => { R.post.on = false; }, () => { R.post.on = true; });
  out.base2 = await gpu();
  window.__gpuRes = out; })(); });
await p.waitForFunction(() => window.__gpuRes !== null, null, { timeout: 180000 });
console.log(JSON.stringify(await p.evaluate(() => window.__gpuRes))); await b.close();
