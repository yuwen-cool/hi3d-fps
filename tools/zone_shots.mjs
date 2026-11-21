// The acts in their zones: valve B on the gallery, the storm in the process unit, the column coming down,
// the colossus in the tank farm at night, the LPG sphere going up, the dropship on the pad.
//   node tools/zone_shots.mjs [outDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] || 'out/zones'; mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--use-angle=metal', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto((process.env.BASE || 'http://127.0.0.1:5320') + '/?record=1'); await p.waitForFunction(() => window.__ready, null, { timeout: 180000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (n, ms = 250) => { await wait(ms); await p.screenshot({ path: `${out}/${n}.jpg`, type: 'jpeg', quality: 84 }); console.log('shot', n); };
const ev = (f, a) => p.evaluate(f, a);
const aim = (x, y, z) => ev(([x, y, z]) => { const G = __G, c = G.R.camera.position; const dx = x - c.x, dy = y - c.y, dz = z - c.z; G.player.s.yaw = Math.atan2(-dx, -dz); G.player.s.pitch = Math.atan2(dy, Math.hypot(dx, dz)); __step(2); }, [x, y, z]);
await ev(() => __step(30)); await wait(600); await p.click('#ui .title .menu button:nth-child(1)');
for (let i = 0; i < 40 && await ev(() => __G.flow.S.state) !== 'play'; i++) await ev(() => __step(10));
await ev(() => { const G = __G; G.god = true; for (const e of G.enemies.list) if (e.alive) { e.alive = false; e.root.visible = false; e.gun.visible = false; } __step(30); });
// act 1: valve B on the gallery deck, guards below
await ev(() => { const G = __G; G.flow.S.wave = 0; G.flow.S.step = 'hold'; G.flow.S.pending = 0; __step(5); });
await ev(() => { const G = __G; for (const e of G.enemies.list) if (e.alive) { e.alive = false; e.root.visible = false; e.gun.visible = false; } __step(60); });
await ev(() => { const G = __G; G.player.s.pos.set(-19, 4.5, -59.8); __step(3); }); await aim(5, 5.5, -60); await shot('z1_deck_valveB', 500);
await aim(-4, 1, -50); await shot('z2_deck_guards');
// act 2: the storm in the process unit
await ev(() => { const G = __G; G.flow.S.stormClock = 0.01; __step(6); for (let i = 0; i < 30 && G.cine.playing; i++) __step(20); __step(60 * 12); });
await ev(() => { const G = __G; G.player.s.pos.set(-8, 0, -40); __step(3); }); await aim(2, 6, -60); await shot('z3_storm_unit', 400);
await ev(() => { const G = __G; G.player.s.pos.set(10, 4.5, -60); __step(3); }); await aim(-20, 2, -45); await shot('z4_storm_deck');
// the column comes down
await ev(() => { const G = __G; G.player.s.pos.set(10, 0, -36); __step(3); }); await aim(-4, 10, -46);
await ev(() => { __G.flow.fellTower(); __step(80); }); await shot('z5_tower_falling', 100);
await ev(() => __step(140)); await aim(-4, 1, -38); await shot('z6_tower_down', 300);
// act 3: night, the colossus in the tank farm
await ev(() => { const G = __G; G.flow.S.wave = 2; G.flow.S.pending = 0; G.flow.S.nightT = G.flow.S.t; __step(4); for (const e of G.enemies.list) if (e.alive) { e.alive = false; e.root.visible = false; e.gun.visible = false; } for (const d of G.drones?.list || []) d.alive = false; __step(60 * 7); for (let i = 0; i < 30 && G.cine.playing; i++) __step(20); });
await shot('z7_reveal_end', 200);
await ev(() => { const G = __G; for (const e of G.enemies.list) if (e.alive) { e.alive = false; e.root.visible = false; e.gun.visible = false; } for (const d of G.drones?.list || []) d.alive = false; __step(60 * 14); G.player.s.pos.set(-40, 0, -22); __step(3); });
const bp = await ev(() => __G.boss.S.pos.toArray()); await aim(bp[0], 9, bp[2]); await shot('z8_colossus_tanks', 300);
await ev(() => { const G = __G; G.player.s.pos.set(-47, 0, -36); __step(3); }); await aim(-47, 6, -60); await shot('z9_sphere_night');
await ev(() => { const G = __G; const s = G.level.explosives.find((o) => o.userData.explosive?.mega); if (s) G.explosives.hurt(s, 9999); __step(60); }); await shot('z10_sphere_boom', 100);
await ev(() => __step(90)); await shot('z11_chain', 100);
// extraction
await ev(() => { const G = __G; G.boss.S.dead = true; G.flow.S.bossDead = true; G.flow.toExtract(); G.player.s.pos.set(-36, 0, -8); __step(60 * 19); }); await aim(-47, 3, 1); await shot('z12_pad_ship', 300);
console.log(JSON.stringify(await ev(() => ({ act: __G.flow.S.act, state: __G.flow.S.state, err: __errors.slice(0, 4) }))), errs.slice(0, 4));
await b.close();
