// Frames of the set pieces: horizon silhouette, boss reveal cutscene, night look, overdrive, wave finisher, kill emblem.
//   node tools/show_shots.mjs [outDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] || 'out/show'; mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--use-angle=metal', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errs.push(m.text().slice(0, 200)); });
await p.goto((process.env.BASE || 'http://127.0.0.1:5320') + '/?record=1&god=1'); await p.waitForFunction(() => window.__ready, null, { timeout: 120000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (n) => { await wait(150); await p.screenshot({ path: `${out}/${n}.jpg`, type: 'jpeg', quality: 84 }); console.log('shot', n); };
const ev = (f, a) => p.evaluate(f, a);
const look = (x, y, z) => ev(([x, y, z]) => { const G = __G, ps = G.player.s, d = new G.THREE.Vector3(x, y, z).sub(G.R.camera.position); ps.yaw = Math.atan2(-d.x, -d.z); ps.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); }, [x, y, z]);
await ev(() => __step(30)); await wait(600); await p.click('#ui .title .menu button:nth-child(1)');
for (let i = 0; i < 40 && await ev(() => __G.flow.S.state) !== 'play'; i++) await ev(() => __step(10));
await ev(() => __step(60 * 13, 1 / 60));
// horizon: stand in the open south of the yard, face the storm
await ev(() => { const G = __G; G.player.s.pos.set(2, 0, 4); for (const e of G.enemies.list) if (e.alive) e.root.position.set(18, 0, 6); });
const hp = await ev(() => { const h = __G.boss.worldPos(); return [h.x, h.y, h.z]; });
await look(hp[0], hp[1] * 0.6, hp[2]); await ev(() => __step(30)); await shot('01_horizon');
await ev(() => { const G = __G, h = G.boss.worldPos(); G.env.strike(h.clone().add(new G.THREE.Vector3(-19, 30, -23))); __step(2); }); await shot('02_horizon_lightning');
// skip to the boss: storm, then night
await ev(() => { __G.flow.S.stormClock = 0.01; __step(10); __G.flow.S.actT = 200; __step(3); });
for (let i = 0; i < 20 && !(await ev(() => __G.cine.playing)); i++) await ev(() => __step(30));
const tags = ['03_reveal_a', '04_reveal_b', '05_reveal_card', '06_reveal_callouts', '07_reveal_end'];
for (let i = 0; i < tags.length; i++) { await ev((n) => __step(n), i === 0 ? 20 : 55); await wait(i === 2 ? 900 : 300); await shot(tags[i]); }
for (let i = 0; i < 20 && (await ev(() => __G.cine.playing)); i++) await ev(() => __step(20));
await wait(600); await ev(() => __step(40)); await shot('08_after_reveal');
// overdrive
await ev(() => { const G = __G; G.od.S.charge = 1; G.auto = { ult: true }; __step(3); const e = G.enemies.list.find((x) => x.alive); if (e) { const d = e.root.position.clone().setY(1.4).sub(G.R.camera.position); G.player.s.yaw = Math.atan2(-d.x, -d.z); G.player.s.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); } G.auto = { fire: true }; __step(14); });
await wait(300); await shot('09_overdrive');
await ev(() => { __G.auto = {}; __step(60 * 9); });
// finisher + kill emblem: kill everyone but one, then the last with a headshot
await ev(() => { const G = __G, T = G.THREE; const al = G.enemies.list.filter((e) => e.alive); al.slice(0, -1).forEach((e) => G.enemies.damage(e, 999, { part: 'body', point: e.root.position.clone() }, new T.Vector3(0, 0, 1)));
  const e = al.at(-1); if (e) { e.root.position.set(G.player.s.pos.x + 3, 0, G.player.s.pos.z - 7); __step(2); const d = e.root.position.clone().setY(1.4).sub(G.R.camera.position); G.player.s.yaw = Math.atan2(-d.x, -d.z); G.player.s.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); __step(2); G.enemies.damage(e, 999, { part: 'weak', point: e.root.position.clone().setY(1.7) }, new T.Vector3(0, 0, -1)); } __step(4); });
await wait(250); await shot('10_finisher');
console.log(JSON.stringify(await ev(() => ({ st: __G.flow.S.state, act: __G.flow.S.act, err: __errors }))), errs.slice(0, 4));
await b.close();
