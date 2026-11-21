// The first minute as a new player sees it: title -> DEPLOY -> 60 s of play by the HUD-following test bot.
// Saves out/first60/*.jpg (title + frames at fixed seconds after landing) for the comprehension check.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] || 'out/first60'; mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--use-angle=metal', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
await p.goto((process.env.BASE || 'http://127.0.0.1:5320') + '/?record=1&god=1'); await p.waitForFunction(() => window.__ready, null, { timeout: 120000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.evaluate(() => __step(60)); await wait(1500); await p.evaluate(() => __step(30));
await p.screenshot({ path: `${out}/00_title.jpg`, type: 'jpeg', quality: 85 });
await p.addScriptTag({ path: 'tools/bot_page.js' }); await p.evaluate(() => __installBot());
await p.click('#ui .title .menu button:nth-child(1)');
for (let i = 0; i < 40 && await p.evaluate(() => __G.flow.S.state) !== 'play'; i++) await p.evaluate(() => __step(10));
const t0 = await p.evaluate(() => __G.time);
for (const s of [1, 4, 8, 12, 16, 20, 25, 30, 35, 40, 45, 50, 55, 60]) {
  await p.evaluate(([t0, s]) => { let n = 0; while (__G.time < t0 + s && n++ < 4000) __step(1, 1 / 30); }, [t0, s]);
  await wait(s === 1 ? 1300 : 250);
  await p.screenshot({ path: `${out}/t${String(s).padStart(2, '0')}s.jpg`, type: 'jpeg', quality: 82 });
}
console.log(JSON.stringify(await p.evaluate(() => ({ state: __G.flow.S.state, act: __G.flow.S.act, step: __G.flow.S.step, kills: __G.flow.S.kills, err: __errors }))));
await b.close();
