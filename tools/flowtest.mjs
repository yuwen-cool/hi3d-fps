// Fast full-match check in simulated time: an "assist" kills one robot every couple of seconds and
// chips the colossus' cores, so the three acts, the tank strike, the boss, the tower and extraction
// all fire. Prints the event timeline + errors; saves a frame at every milestone.
// node tools/flowtest.mjs [outDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] || 'out/flow'; mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--use-angle=metal', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const logs = []; p.on('pageerror', (e) => logs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) logs.push(m.text().slice(0, 300)); });
await p.goto((process.env.BASE || 'http://127.0.0.1:5320') + '/?shot=1&god=1&record=1');
await p.waitForFunction(() => window.__ready, null, { timeout: 120000 });
await p.evaluate(() => {
  const G = __G, T = G.THREE; G.god = true; G.tl = []; G.snap = [];
  const mark = (n) => { G.tl.push([n, +G.time.toFixed(1)]); G.snap.push(n); };
  G.events.on('flow:act', (e) => mark('act' + e.act));
  for (const n of ['tank:boom', 'boss:spawn', 'boss:core', 'boss:dying', 'boss:dead', 'tower:fall', 'tower:down', 'flow:extract', 'flow:won']) G.events.on(n, () => mark(n));
  G.assistT = 0;
  G.modules.assist = { update(dt) {
    G.assistT += dt; const ps = G.player.s;
    // look at whatever is happening: boss if present, else nearest robot
    const B = G.boss.S; let look = null;
    if (B.active) look = B.pos.clone().setY(7); else { const e = G.enemies.list.find((x) => x.alive); if (e) look = e.root.position.clone().setY(1.2); }
    if (look) { const eye = G.R.camera.position, d = look.sub(eye); ps.yaw = Math.atan2(-d.x, -d.z); ps.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); }
    if (G.assistT < 2) return; G.assistT = 0;
    const e = G.enemies.list.find((x) => x.alive); if (e) G.enemies.damage(e, 999, { part: 'body', point: e.root.position.clone().setY(1) }, new T.Vector3(0, 0, 1));
    else if (B.active && !B.dead) { const c = G.boss.cores.find((x) => x.alive); if (c) G.boss.damage({ core: c, point: c.light.position.clone() }, 260); }
    if (G.flow.S.state === 'extract') ps.pos.set(-17, ps.pos.y, 4);
  } };
  const a = G.modules.assist; delete G.modules.assist; const ie = G.modules.inputEnd; delete G.modules.inputEnd; G.modules.assist = a; G.modules.inputEnd = ie;
});
let shots = 0;
for (let s = 0; s < 420; s += 1) {
  const r = await p.evaluate(() => { __step(30, 1 / 30); const n = __G.snap.splice(0); return { n, st: __G.flow.S.state }; });
  for (const n of r.n) await p.screenshot({ path: `${out}/${String(shots++).padStart(2, '0')}_${n.replace(':', '-')}.jpg`, type: 'jpeg', quality: 80 });
  if (s % 20 === 0) await p.screenshot({ path: `${out}/t${String(s).padStart(3, '0')}.jpg`, type: 'jpeg', quality: 70 });
  if (r.st === 'won') break;
}
console.log(JSON.stringify(await p.evaluate(() => ({ tl: __G.tl, state: __G.flow.S.state, act: __G.flow.S.act, kills: __G.flow.S.kills, errors: __errors }))), logs.slice(0, 5));
await b.close();
