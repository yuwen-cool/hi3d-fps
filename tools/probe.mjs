// Load the game in record mode and print the JSON of a JS expression evaluated against window.__G.
//   node tools/probe.mjs "(() => __G.flow.S)()" [steps]
import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 800, height: 450 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto((process.env.BASE || 'http://127.0.0.1:5320') + '/?record=1' + (process.env.Q || '')); await p.waitForFunction(() => window.__ready, null, { timeout: 120000 });
if (process.argv[3]) await p.evaluate((n) => __step(+n), process.argv[3]);
console.log(JSON.stringify(await p.evaluate(process.argv[2]), null, 0), errs.slice(0, 3));
await b.close();
