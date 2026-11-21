// The new kit and the new enemies: lance pickup/charge/shot, a shield heavy, drones in flight and diving.
//   node tools/new_shots.mjs [outDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] || 'out/kit'; mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--use-angle=metal', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') errs.push(m.text().slice(0, 200)); });
await p.goto((process.env.BASE || 'http://127.0.0.1:5320') + '/?record=1'); await p.waitForFunction(() => window.__ready, null, { timeout: 120000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (n, ms = 250) => { await wait(ms); await p.screenshot({ path: `${out}/${n}.jpg`, type: 'jpeg', quality: 84 }); console.log('shot', n); };
const ev = (f, a) => p.evaluate(f, a);
const aim = (x, y, z) => ev(([x, y, z]) => { const G = __G, c = G.R.camera.position; const dx = x - c.x, dy = y - c.y, dz = z - c.z; G.player.s.yaw = Math.atan2(-dx, -dz); G.player.s.pitch = Math.atan2(dy, Math.hypot(dx, dz)); __step(2); }, [x, y, z]);
await ev(() => __step(30)); await wait(600); await p.click('#ui .title .menu button:nth-child(1)');
for (let i = 0; i < 40 && await ev(() => __G.flow.S.state) !== 'play'; i++) await ev(() => __step(10));
await ev(() => { const G = __G; G.god = true; for (const e of G.enemies.list) if (e.alive) e.root.position.set(18, 0, 6); __step(30); });
// drop pod
await ev(() => { __G.player.s.pos.set(0, 0, 0); __step(2); });
console.log('kits', await ev(() => __G.weapon.kits.map((k) => k.key)));
await p.evaluate(() => __G.flow.dropPod());
await ev(() => __step(40)); const pod = await ev(() => __G.flow.S.pod?.at?.toArray()); console.log('pod', pod);
if (pod) { await aim(pod[0], 3, pod[2]); await shot('01_pod_fall'); await ev(() => __step(110)); await aim(pod[0], 0.8, pod[2]); await shot('02_pod_landed', 400);
  await ev(([x, z]) => { __G.player.s.pos.set(x + 1, 0, z + 1); __step(10); }, [pod[0], pod[2]]); await ev(() => __step(40)); }
console.log('lance', await ev(() => ({ on: __G.weapon.S.lanceOn, key: __G.weapon.key })));
await ev(() => { __G.player.s.pos.set(0, 0, 2); __G.player.s.yaw = 0; __G.player.s.pitch = 0; __step(5); }); await shot('03_lance_idle');
await ev(() => { __G.auto = { fire: true }; __step(25); }); await shot('04_lance_charge');
await ev(() => { __step(16); }); await ev(() => { __G.auto = {}; __step(1); }); await shot('05_lance_fire', 50);
// heavy + a rifleman behind it
await ev(() => { const G = __G; const h = G.enemies.spawn(new G.THREE.Vector3(0, 0, -9), { kind: 'heavy', yaw: 0 }); h.state = 'engage'; const r = G.enemies.spawn(new G.THREE.Vector3(0.6, 0, -14), { kind: 'rifle', yaw: 0 }); r.state = 'engage'; G.player.s.pos.set(0, 0, 1); __step(40); });
await aim(0, 1.5, -9); await shot('06_heavy');
await ev(() => { __G.auto = { fire: true }; __G.weapon.swapTo('rifle'); __step(60); __G.auto = {}; __step(1); }); await shot('07_heavy_rifle');
await ev(() => { __G.weapon.swapTo('lance'); __step(40); __G.auto = { fire: true }; __step(45); __G.auto = {}; __step(1); }); await shot('08_heavy_lance', 50);
console.log('heavy', await ev(() => __G.enemies.list.filter((e) => e.kind === 'heavy').map((e) => ({ hp: e.hp, alive: e.alive, sh: e.shield.hp }))));
// drones
await ev(() => { const G = __G; for (const e of G.enemies.list) if (e.alive) e.root.position.set(18, 0, 6); G.player.s.pos.set(-2, 0, -8); for (let i = 0; i < 3; i++) G.drones.spawn(new G.THREE.Vector3(-30 + i * 4, 14, -40)); __step(200); });
const dp = await ev(() => __G.drones.list.find((d) => d.alive)?.root.position.toArray()); if (dp) { await aim(dp[0], dp[1], dp[2]); await shot('09_drone'); }
await ev(() => { const d = __G.drones.list.find((x) => x.alive); if (d) { d.t = 99; d.life = 0; } __step(50); });
const dl = await ev(() => __G.drones.list.find((d) => d.mode === 'lock' || d.mode === 'dive')?.root.position.toArray()); if (dl) { await aim(dl[0], dl[1], dl[2]); await shot('10_drone_lock'); }
await ev(() => __step(30)); await shot('11_after_dive');
console.log(JSON.stringify(await ev(() => ({ drones: __G.drones.list.map((d) => d.mode), hp: __G.player.s.hp, err: __errors.slice(0, 3) }))), errs.slice(0, 5));
await b.close();
