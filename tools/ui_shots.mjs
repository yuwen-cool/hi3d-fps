// Walk the out-of-combat and combat UI in record mode and save a frame per screen (out/ui/*.jpg).
//   node tools/ui_shots.mjs [outDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] || 'out/ui'; mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--use-angle=metal', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const logs = []; p.on('pageerror', (e) => logs.push('pageerror ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) logs.push(m.text().slice(0, 300)); });
const shot = async (n) => { await p.screenshot({ path: `${out}/${n}.jpg`, type: 'jpeg', quality: 85 }); console.log('shot', n); };
const step = (n, dt = 1 / 60) => p.evaluate(([n, dt]) => __step(n, dt), [n, dt]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto((process.env.BASE || 'http://127.0.0.1:5320') + '/?record=1');
await wait(400); await shot('00_boot');
await p.waitForFunction(() => window.__ready, null, { timeout: 120000 });
await step(30); await wait(1600); await step(90); await shot('01_title');
await p.click('#ui .title .menu button:nth-child(3)'); await wait(500); await shot('02_settings');
await p.keyboard.press('Escape'); await wait(300);
await p.click('#ui .title .menu button:nth-child(1)'); await wait(200);
await step(20); await shot('03_drop');
for (let i = 0; i < 12 && await p.evaluate(() => __G.flow.S.state) === 'deploy'; i++) await step(15);
await step(6); await wait(150); await shot('04_land');
await wait(1400); await step(60); await shot('05_hud');
// walk to the valve: teleport near it, face it
await p.evaluate(() => { const G = __G, v = G.level.valves[0]; G.player.s.pos.set(v.pos.x + 0.4, 0, v.pos.z + 2.2); const d = v.top.clone().sub(G.player.s.pos); G.player.s.yaw = Math.atan2(-d.x, -d.z); G.player.s.pitch = -0.35; G.god = true; });
await step(20); await shot('06_valve_prompt');
await p.evaluate(() => { __G.auto = { use: true }; }); await step(50); await shot('07_valve_turning');
await step(60); await p.evaluate(() => { __G.auto = {}; }); await wait(300); await shot('08_valve_open');
// look back over the yard and scan
await p.evaluate(() => { const G = __G; G.player.s.pos.set(-2, 0, -14); G.player.s.yaw = Math.PI * 0.15; G.player.s.pitch = -0.05; });
await step(10); await p.evaluate(() => { __G.auto = { scan: true }; }); await step(22); await shot('09_scan_ring');
await step(40); await shot('10_scan_marked');
// face the nearest robot for the tag
await p.evaluate(() => { const G = __G, ps = G.player.s; const e = G.enemies.list.filter((x) => x.alive).sort((a, b) => a.root.position.distanceTo(ps.pos) - b.root.position.distanceTo(ps.pos))[0]; if (!e) return; const d = e.root.position.clone().setY(1.4).sub(G.R.camera.position); ps.yaw = Math.atan2(-d.x, -d.z); ps.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); });
await step(6); await shot('11_enemy_tag');
await p.evaluate(() => { __G.player.s.hurtT = 0; __G.god = false; __G.player.damage(70, __G.player.s.pos.clone().add(new __G.THREE.Vector3(4, 0, 0))); __G.god = true; }); await step(4); await wait(100); await shot('12_shield_break');
await p.evaluate(() => __G.ui.openPause()); await wait(400); await shot('13_pause'); await p.evaluate(() => __G.ui.closePause());
// storm
await p.evaluate(() => { __G.flow.S.stormClock = 0.01; }); await step(10); await wait(200); await shot('14_storm_banner');
await step(900, 1 / 30); await p.evaluate(() => { __G.auto = { scan: true }; }); await step(25); await shot('15_storm_scan');
await step(40); await shot('16_storm_scan2');
console.log(JSON.stringify(await p.evaluate(() => ({ state: __G.flow.S.state, act: __G.flow.S.act, obj: __G.obj && { t: __G.obj.title, l: __G.obj.line }, errors: __errors }))), logs.slice(0, 8));
await b.close();
