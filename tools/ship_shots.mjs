// The dropship beat by beat: the drop-in and departure, the night approach with the searchlight, settled on the pad, the boarding shot.
//   node tools/ship_shots.mjs [outDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] || 'out/ship'; mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--use-angle=metal', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto((process.env.BASE || 'http://127.0.0.1:5320') + '/?record=1'); await p.waitForFunction(() => window.__ready, null, { timeout: 120000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (n, ms = 250) => { await wait(ms); await p.screenshot({ path: `${out}/${n}.jpg`, type: 'jpeg', quality: 84 }); console.log('shot', n); };
const ev = (f, a) => p.evaluate(f, a);
const aim = (x, y, z) => ev(([x, y, z]) => { const G = __G, c = G.R.camera.position; const dx = x - c.x, dy = y - c.y, dz = z - c.z; G.player.s.yaw = Math.atan2(-dx, -dz); G.player.s.pitch = Math.atan2(dy, Math.hypot(dx, dz)); __step(2); }, [x, y, z]);
await ev(() => __step(30)); await wait(600); await p.click('#ui .title .menu button:nth-child(1)');
// drop-in: the ship above while falling, then leaving into the sun
await ev(() => { __G.god = true; __step(20); }); await ev(() => { __G.player.s.pitch = 1.2; __step(1); }); await shot('01_drop_up');
for (let i = 0; i < 40 && await ev(() => __G.flow.S.state) !== 'play'; i++) await ev(() => __step(10));
await ev(() => { for (const e of __G.enemies.list) if (e.alive) e.root.position.set(18, 0, 6); __step(30); });
const sp = async () => { const s = await ev(() => __G.ship.S.pos.toArray()); await aim(s[0], s[1], s[2]); };
await sp(); await shot('02_leave_a'); await ev(() => __step(90)); await sp(); await shot('03_leave_b');
// night, storm gone: bring the ship in
await ev(() => { const G = __G; Object.assign(G.env.S, { night: 1, storm: 0.3, front: -400 }); for (const e of G.enemies.list) if (e.alive) e.alive && (e.root.position.y = -50); G.flow.S.bossDead = true; G.flow.S.act = 4; G.env.S.storm = 0.3; G.flow.toExtract(); G.player.s.pos.set(-6, 0, -3); __step(60); });
for (const [n, k] of [['04_in_far', 240], ['05_in_mid', 240], ['06_in_flare', 200], ['07_landing', 120]]) { await ev((k) => __step(k), k); await sp(); await shot(n); }
await ev(() => __step(220)); await ev(() => { __G.player.s.pos.set(-12, 0, -2); __step(2); }); await sp(); await shot('08_on_pad');
await ev(() => { __G.player.s.pos.set(-16, 0, 1); __step(2); }); await aim(-18.5, 4.5, 6); await shot('09_under');
console.log('ready', await ev(() => __G.ship.ready));
await ev(() => { __G.player.s.pos.set(-17, 0, 4); __step(3); });
for (const [n, k] of [['10_board_a', 40], ['11_board_b', 80], ['12_board_c', 120], ['13_board_d', 160]]) { await ev((k) => __step(k), k); await shot(n); }
console.log(JSON.stringify(await ev(() => ({ state: __G.flow.S.state, err: __errors.slice(0, 3) }))), errs.slice(0, 3));
await b.close();
