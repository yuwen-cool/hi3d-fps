// The boss fight beat by beat: knee targets, leg break, kneel + cores exposed, rage beam, overload, igniter, fire wall, death.
//   node tools/boss_shots.mjs [outDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] || 'out/boss'; mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--use-angle=metal', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto((process.env.BASE || 'http://127.0.0.1:5320') + '/?shot=1&record=1&god=1'); await p.waitForFunction(() => window.__ready, null, { timeout: 120000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (n) => { await wait(200); await p.screenshot({ path: `${out}/${n}.jpg`, type: 'jpeg', quality: 84 }); console.log('shot', n); };
const ev = (f, a) => p.evaluate(f, a);
const face = () => ev(() => { const G = __G, h = G.boss.hull.position, d = h.clone().sub(G.R.camera.position); G.player.s.yaw = Math.atan2(-d.x, -d.z); G.player.s.pitch = Math.atan2(d.y - 2.5, Math.hypot(d.x, d.z)); __step(2); });
// straight to act 3 with the boss in, clear the small fry
await ev(() => { const G = __G; G.god = true; G.flow.S.stormClock = 0.01; __step(10); G.flow.S.actT = 200; __step(3); for (let i = 0; i < 40 && !G.boss.S.active; i++) __step(30); __step(60 * 12, 1 / 60);
  for (const e of G.enemies.list) if (e.alive) G.enemies.damage(e, 999, { part: 'body', point: e.root.position.clone() }, new G.THREE.Vector3(0, 0, 1)); __step(30); G.player.s.pos.set(-15, 0, -3); __step(2); });
await face(); await shot('01_knees');
await ev(() => { const G = __G, L = G.boss.legs.slice().sort((a, b) => a.k.w.distanceTo(G.player.s.pos) - b.k.w.distanceTo(G.player.s.pos))[0]; G.boss.damage({ knee: L, point: L.k.w.clone() }, 999); __step(8); });
await shot('02_leg_break');
await ev(() => __step(40)); await face(); await shot('03_kneel');
await ev(() => __step(60)); await face(); await shot('04_cores_exposed');
await ev(() => { __step(120); }); await face(); await shot('05_rage');
await ev(() => { const G = __G; for (const c of G.boss.cores) G.boss.damage({ core: c, point: c.light.position.clone() }, 9999); __step(20); });
await face(); await shot('06_overload');
await ev(() => { for (let i = 0; i < 60 && !__G.boss.S.stuck; i++) __step(30); __step(30); }); await face(); await shot('07_stuck');
// at the igniter
await ev(() => { const G = __G, ig = G.level.valves.find((v) => v.id === 'IGN'); G.player.s.pos.set(ig.pos.x + 2, 0, ig.pos.z); __step(2); const d = ig.top.clone().sub(G.R.camera.position); G.player.s.yaw = Math.atan2(-d.x, -d.z); G.player.s.pitch = -0.35; __step(10); });
await shot('08_igniter');
await ev(() => { __G.auto = { use: true }; __step(70); __G.auto = {}; }); await face(); await ev(() => { __G.player.s.pitch = 0.05; __step(4); }); await shot('09_fire_wall');
await ev(() => __step(30)); await face(); await ev(() => { __G.player.s.pitch = 0.08; __step(2); }); await shot('10_burn');
await ev(() => __step(90)); await shot('11_dying');
await ev(() => __step(240)); await shot('12_after');
console.log(JSON.stringify(await ev(() => ({ st: __G.flow.S.state, phase: __G.flow.S.bossPhase, dead: __G.boss.S.dead, err: __errors.slice(0, 3) }))), errs.slice(0, 3));
await b.close();
