// Grapple: the mark on its back, the pull, the deck, shooting the cores from up there, jumping off.
//   node tools/grapple_shots.mjs [outDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] || 'out/grapple'; mkdirSync(out, { recursive: true });
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
  for (const e of G.enemies.list) if (e.alive) G.enemies.damage(e, 999, { part: 'body', point: e.root.position.clone() }, new G.THREE.Vector3(0, 0, 1)); __step(30); G.player.s.pos.set(-40, 0, -22); __step(2); }); // the tank farm crossroads
const look = (p) => ev((p) => { const G = __G, V = G.THREE.Vector3, t = new V(...p), d = t.clone().sub(G.R.camera.position); G.player.s.yaw = Math.atan2(-d.x, -d.z); G.player.s.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); __step(2); }, p);
// break a knee, let it go down
await ev(() => { const G = __G, L = G.boss.legs[0]; G.boss.damage({ knee: L, point: L.knee.clone() }, 9999); __step(240); });
const a = await ev(() => { const G = __G, a = G.grapple.anchorWorld(), h = G.boss.hull.position; const dir = new G.THREE.Vector3(Math.sin(G.boss.S.yaw), 0, Math.cos(G.boss.S.yaw)); G.player.s.pos.set(h.x + dir.x * 20, 0, h.z + dir.z * 20); __step(3); return a.toArray(); });
await look(a); await ev(() => __step(4)); await shot('g1_mark');
console.log('avail', await ev(() => [__G.grapple.available(), __G.interact?.v]));
await ev(() => { __G.auto = { grapple: true }; __step(20); }); await shot('g2_pull');
await ev(() => { __G.auto = {}; __step(40); }); console.log('riding', await ev(() => [__G.grapple.riding, __G.player.s.pos.toArray().map((v) => +v.toFixed(1))]));
await ev(() => { const G = __G; G.player.s.yaw = G.boss.S.yaw + Math.PI; G.player.s.pitch = -0.15; __step(3); }); await shot('g3_deck_fwd');
const c = await ev(() => __G.boss.cores.find((x) => x.alive && x.exposed)?.light.position.toArray()); if (c) { await look(c); await shot('g4_core'); }
await ev(() => { __G.auto = { fire: true }; __step(90); __G.auto = {}; __step(2); }); console.log('cores', await ev(() => __G.boss.cores.map((x) => Math.round(x.hp))));
await ev(() => { const G = __G; G.input.pressed = ((p0) => (a) => a === 'jump' || p0(a))(G.input.pressed); __step(2); G.input.pressed = G.input.__p0 || G.input.pressed; __step(60); });
console.log('off', await ev(() => [__G.grapple.riding, __G.player.s.pos.toArray().map((v) => +v.toFixed(1)), __errors.slice(0, 3)]));
await shot('g5_off'); await b.close();
