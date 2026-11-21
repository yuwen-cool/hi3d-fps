// The storm beat by beat: the wall on the horizon, closing in, the opening shot of act 2, inside the storm, a blast clearing the air.
//   node tools/storm_shots.mjs [outDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] || 'out/storm'; mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--use-angle=metal', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto((process.env.BASE || 'http://127.0.0.1:5320') + '/?record=1'); await p.waitForFunction(() => window.__ready, null, { timeout: 120000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (n, ms = 200) => { await wait(ms); await p.screenshot({ path: `${out}/${n}.jpg`, type: 'jpeg', quality: 84 }); console.log('shot', n); };
const ev = (f, a) => p.evaluate(f, a);
await ev(() => __step(30)); await wait(600); await p.click('#ui .title .menu button:nth-child(1)');
for (let i = 0; i < 40 && await ev(() => __G.flow.S.state) !== 'play'; i++) await ev(() => __step(10));
const lookNW = () => ev(() => { const G = __G; G.god = true; G.player.s.pos.set(2, 0, 4); __step(2); G.player.s.yaw = Math.atan2(0.627, 0.779); G.player.s.pitch = 0.18; __step(3); });
await ev(() => { __G.god = true; for (const e of __G.enemies.list) if (e.alive) e.root.position.set(18, 0, 6); __step(60 * 5); });
await lookNW(); await shot('01_wall_far', 1200);
await ev(() => { __G.flow.S.stormClock = 25; __step(10); }); await lookNW(); await shot('02_wall_near');
await ev(() => { __G.flow.S.stormClock = 0.01; __step(4); });
for (const [n, k] of [['03_shot_a', 30], ['04_shot_b', 70], ['05_shot_card', 70]]) { await ev((k) => __step(k), k); await shot(n, n.includes('card') ? 900 : 250); }
for (let i = 0; i < 30 && await ev(() => __G.cine.playing); i++) await ev(() => __step(20));
await ev(() => __step(60 * 3)); await lookNW(); await shot('06_front_arrives', 400);
await ev(() => { __step(60 * 9); const G = __G; G.player.s.pos.set(-2, 0, -14); __step(2); G.player.s.yaw = 0.4; G.player.s.pitch = 0.0; __step(3); }); await shot('07_inside');
await ev(() => { const G = __G; const e = G.enemies.list.find((x) => x.alive); if (e) { e.root.position.set(-6, 0, -24); __step(2); const d = e.root.position.clone().setY(1.4).sub(G.R.camera.position); G.player.s.yaw = Math.atan2(-d.x, -d.z); G.player.s.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); } __step(3); }); await shot('08_inside_enemy');
await ev(() => { const G = __G, f = G.player.forward; G.explosives.blast(G.player.s.pos.clone().addScaledVector(f, 11).setY(1), 1.2, 4, 0); __step(20); }); await shot('09_blast_clear');
await ev(() => __step(40)); await shot('10_blast_clear2');
await ev(() => __step(60 * 4)); await shot('11_refilled');
console.log(JSON.stringify(await ev(() => ({ act: __G.flow.S.act, front: Math.round(__G.env.S.front), err: __errors.slice(0, 3) }))), errs.slice(0, 3));
await b.close();
