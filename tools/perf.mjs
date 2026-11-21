// Real-time frame pacing with the full HUD up: node tools/perf.mjs [seconds]
import { chromium } from 'playwright';
const secs = +(process.argv[2] || 12);
const b = await chromium.launch({ channel: 'chrome', headless: false, args: ['--mute-audio', '--window-size=1920,1080'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.goto((process.env.BASE || 'http://127.0.0.1:5320') + '/?shot=1&god=1' + (process.env.Q || '')); await p.waitForFunction(() => window.__ready, null, { timeout: 120000 });
if (process.env.NOSCAN) await p.evaluate(() => { window.__noscan = 1; });
if (process.env.POS) await p.evaluate((xz) => { const [x, z] = xz.split(',').map(Number); __G.player.s.pos.set(x, 0, z); }, process.env.POS);
await new Promise((r) => setTimeout(r, 3000));
const r = await p.evaluate(async (secs) => {
  const G = __G; G.auto = {}; const ft = []; let last = performance.now(); let t0 = last; let k = 0;
  return await new Promise((res) => { const f = () => { const n = performance.now(); ft.push(n - last); last = n; k++;
    if (k % 90 === 0 && !window.__noscan) G.auto.scan = true; G.player.s.yaw += 0.004;
    if (n - t0 < secs * 1000) requestAnimationFrame(f); else { ft.sort((a, b) => a - b); res({ frames: ft.length, avg: +(1000 / (ft.reduce((a, b) => a + b, 0) / ft.length)).toFixed(1), p50: +ft[ft.length >> 1].toFixed(1), p99: +ft[Math.floor(ft.length * 0.99)].toFixed(1), worst: +ft[ft.length - 1].toFixed(1), stats: __stats(), err: __errors, prof: Object.fromEntries(Object.entries({ ...G.prof }).filter(([, v]) => v > 0.25).map(([k, v]) => [k, +v.toFixed(2)])) }); } };
    requestAnimationFrame(f); });
}, secs);
console.log(JSON.stringify(r)); await b.close();
