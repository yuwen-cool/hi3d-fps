// A whole match as the player sees it: the HUD-following test bot plays from the title screen; a frame is saved
// every few game seconds and shortly after every notable event (explosions, scan, boss beats). out/match/*.jpg
import { chromium } from 'playwright';
import { mkdirSync, rmSync } from 'node:fs';
const out = process.argv[2] || 'out/match'; rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--use-angle=metal', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto((process.env.BASE || 'http://127.0.0.1:5320') + '/?record=1&god=1'); await p.waitForFunction(() => window.__ready, null, { timeout: 120000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.evaluate(() => __step(60)); await wait(1200);
await p.addScriptTag({ path: 'tools/bot_page.js' }); await p.evaluate(() => { __installBot(); const G = __G; G.ev = [];
  for (const n of ['explosion', 'tank:boom', 'scan:fire', 'melee:hit', 'boss:spawn', 'boss:charge', 'boss:beam', 'boss:core', 'boss:dying', 'boss:dead', 'tower:fall', 'tower:down', 'thunder', 'valve:open', 'flow:act', 'flow:extract', 'flow:won', 'player:shieldBreak', 'ignite'])
    G.events.on(n, (e) => G.ev.push(n + (n === 'flow:act' ? e.act : ''))); });
await p.click('#ui .title .menu button:nth-child(1)');
let n = 0, lastT = -99; const seen = {}; const cap = { explosion: 4, thunder: 3, 'scan:fire': 4, 'boss:beam': 4, 'boss:charge': 2, ignite: 2, 'melee:hit': 2, 'player:shieldBreak': 2 };
const shot = async (tag, t) => { await wait(120); await p.screenshot({ path: `${out}/${String(n++).padStart(3, '0')}_${String(Math.round(t)).padStart(3, '0')}s_${tag.replace(/[:]/g, '-')}.jpg`, type: 'jpeg', quality: 80 }); };
for (let i = 0; i < 4000; i++) {
  const r = await p.evaluate(() => { __step(6, 1 / 30); const G = __G; return { t: G.time, st: G.flow.S.state, ev: G.ev.splice(0) }; });
  const evs = r.ev.filter((e) => { seen[e] = (seen[e] || 0) + 1; return seen[e] <= (cap[e] ?? 1); });
  if (evs.length) { await p.evaluate(() => __step(8, 1 / 30)); await shot(evs[0], r.t); lastT = r.t; }
  else if (r.t - lastT > 9 && r.st !== 'title') { await shot('t', r.t); lastT = r.t; }
  if (r.st === 'won' || r.st === 'dead') { await wait(3200); await shot('end', r.t); break; }
}
console.log(JSON.stringify(await p.evaluate(() => ({ state: __G.flow.S.state, t: Math.round(__G.time), kills: __G.flow.S.kills, score: __G.score, err: __errors }))), errs.slice(0, 3), 'frames', n);
await b.close();
