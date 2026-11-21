// A full playthrough by the test bot with the HUD on, captured for review: a frame every 12 s of game time and one
// at each key moment (valves, pod, acts, the reveal, boss phases, extraction, the end screen).
//   node tools/review_capture.mjs [outDir]
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const out = process.argv[2] || 'out/review3'; mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--use-angle=metal', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
await p.goto((process.env.BASE || 'http://127.0.0.1:5320') + '/?record=1&god=1'); await p.waitForFunction(() => window.__ready, null, { timeout: 180000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0; const log = [];
const shot = async (tag) => { const t = await p.evaluate(() => Math.round(__G.time)); const f = `${String(n++).padStart(3, '0')}_${t}s_${tag}.jpg`; await p.screenshot({ path: `${out}/${f}`, type: 'jpeg', quality: 80 }); log.push(f); };
await p.evaluate(() => __step(30)); await wait(900); await shot('title');
await p.click('#ui .title .menu button:nth-child(1)');
await p.evaluate(() => __step(20)); await shot('drop');
await p.addScriptTag({ content: readFileSync('tools/bot_page.js', 'utf8') }); await p.evaluate(() => { __installBot(); window.__keys = []; for (const k of ['valve:open', 'flow:act', 'boss:spawn', 'boss:leg', 'boss:exposed', 'boss:core', 'boss:overload', 'trap:ignite', 'boss:dead', 'tower:fall', 'tank:boom', 'flow:extract', 'ship:ready', 'weapon:unlock', 'shield:break', 'drone:dive', 'od:start']) __G.events.on(k, () => window.__keys.push(k)); });
let lastT = 0;
for (let i = 0; i < 4000; i++) {
  const r = await p.evaluate(() => { __step(9, 1 / 30); const k = window.__keys.splice(0); return { t: __G.time, keys: k, state: __G.flow.S.state, cine: __G.cine.playing }; });
  if (r.keys.length) { await p.evaluate(() => __step(8, 1 / 30)); await shot(r.keys[0].replace(':', '-')); }
  else if (r.t - lastT > 12) { lastT = r.t; await shot(r.cine ? 'cine' : 'play'); }
  if (['won', 'dead'].includes(r.state)) { await p.evaluate(() => __step(60 * 12)); await wait(3200); await shot('end'); break; }
}
writeFileSync(`${out}/index.txt`, log.join('\n')); console.log(log.length, 'frames', JSON.stringify(await p.evaluate(() => ({ state: __G.flow.S.state, err: __errors.slice(0, 3) }))));
await b.close();
