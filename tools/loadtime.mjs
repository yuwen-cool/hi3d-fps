// Cold load: time from navigation to the title screen, bytes transferred, the slowest requests. node tools/loadtime.mjs [url]
import { chromium } from 'playwright';
const url = process.argv[2] || 'http://127.0.0.1:5320/';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--use-angle=metal', '--enable-gpu'] });
const ctx = await b.newContext({ viewport: { width: 1600, height: 900 } }); const p = await ctx.newPage();
const reqs = []; p.on('requestfinished', async (r) => { const t = r.timing(); const s = await r.sizes().catch(() => ({ responseBodySize: 0 })); reqs.push({ u: r.url().replace(/^https?:\/\/[^/]+/, ''), ms: Math.round(t.responseEnd), kb: Math.round((s.responseBodySize || 0) / 1024) }); });
const t0 = Date.now(); await p.goto(url); const marks = {};
await p.waitForFunction(() => window.__ready, null, { timeout: 300000 }); marks.ready = Date.now() - t0;
await p.waitForSelector('#ui .title.on', { timeout: 60000 }).catch(() => {}); marks.title = Date.now() - t0;
const tot = reqs.reduce((a, r) => a + r.kb, 0);
console.log(JSON.stringify({ ...marks, requests: reqs.length, MB: +(tot / 1024).toFixed(1) }));
for (const r of reqs.sort((a, b) => b.kb - a.kb).slice(0, 8)) console.log(r.kb + ' KB', r.u);
await b.close();
