// First minute for a new player: the mission brief, the objective line with its why, the first tips.
//   node tools/onboard_shots.mjs [outDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] || 'out/onboard'; mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--use-angle=metal', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
await p.goto((process.env.BASE || 'http://127.0.0.1:5320') + '/?record=1&tips=1'); await p.waitForFunction(() => window.__ready, null, { timeout: 120000 });
const ev = (f, a) => p.evaluate(f, a); const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (n) => { await wait(450); await p.screenshot({ path: `${out}/${n}.jpg`, type: 'jpeg', quality: 82 }); console.log('shot', n); };
await ev(() => __step(30)); await wait(600); await p.click('#ui .title .menu button:nth-child(1)');
for (let i = 0; i < 40 && await ev(() => __G.flow.S.state) !== 'play'; i++) await ev(() => __step(10));
await ev(() => { __G.god = true; __step(150); }); await shot('o1_brief');
await ev(() => __step(420)); await shot('o2_move_tip');
for (const k of ['shoot', 'lance', 'scan', 'grapple']) { await ev((k) => { const T = __G.tutor; T.want(k); for (let i = 0; i < 40; i++) __step(15); }, k); await ev((k) => { __G.tutor.want(k); __step(30); }, k); await shot('o3_' + k); }
console.log(JSON.stringify(await ev(() => __errors.slice(0, 3)))); await b.close();
