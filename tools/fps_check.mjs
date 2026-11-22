// Frame rate on the title scene in a real (headful) Chrome window at a given size and pixel ratio.
//   node tools/fps_check.mjs [width] [height] [dpr] [query]
import { chromium } from 'playwright';
const [w = 1422, h = 684, dpr = 1.8, q = ''] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'chrome', headless: false, args: ['--mute-audio'] });
const ctx = await b.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr }); const p = await ctx.newPage();
await p.goto((process.env.BASE || 'http://127.0.0.1:5320') + '/?' + q); await p.waitForFunction(() => window.__ready, null, { timeout: 120000 }); await p.waitForTimeout(6000);
const r = await p.evaluate(() => new Promise((res) => { let n = 0, t0 = performance.now(), worst = 0, last = t0; const f = () => { const t = performance.now(); worst = Math.max(worst, t - last); last = t; n++; if (t - t0 < 4000) requestAnimationFrame(f); else res({ fps: +(n / ((t - t0) / 1000)).toFixed(1), worst: Math.round(worst), res: window.__G.R.res, scale: window.__G.R.scale }); }; requestAnimationFrame(f); }));
console.log(JSON.stringify({ w, h, dpr, q, ...r })); await b.close();
