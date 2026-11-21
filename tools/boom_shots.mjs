// A storage tank going up, seen from across the map: the blast, the climbing fireball, the standing smoke column.
//   node tools/boom_shots.mjs [outDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] || 'out/boom'; mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--use-angle=metal', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
await p.goto((process.env.BASE || 'http://127.0.0.1:5320') + '/?record=1&nohud=1'); await p.waitForFunction(() => window.__ready, null, { timeout: 120000 });
const ev = (f, a) => p.evaluate(f, a); const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await ev(() => __step(30)); await wait(600); await p.click('#ui .title .menu button:nth-child(1)');
for (let i = 0; i < 40 && await ev(() => __G.flow.S.state) !== 'play'; i++) await ev(() => __step(10));
await ev(() => { const G = __G; G.god = true; for (const e of G.enemies.list) if (e.alive) { e.alive = false; e.root.visible = false; e.gun.visible = false; } __step(10); });
const tk = await ev(() => { const G = __G, t = G.level.explosives.find((o) => o.userData.explosive?.big && !o.userData.explosive.mega && o.position.x < -22 && o.position.z > -20); G.player.s.pos.set(t.position.x + 34, 0, t.position.z + 10); const d = t.position.clone().setY(9).sub(G.R.camera.position); G.player.s.yaw = Math.atan2(-d.x, -d.z); G.player.s.pitch = 0.12; __step(5); return t.position.toArray(); });
await p.screenshot({ path: `${out}/b0_before.jpg`, quality: 84, type: 'jpeg' });
await ev(() => { const G = __G, t = G.level.explosives.find((o) => o.userData.explosive?.big && !o.userData.explosive.mega && o.position.x < -22 && o.position.z > -20); G.explosives.hurt(t, 9999); __step(12); });
await p.screenshot({ path: `${out}/b1_blast.jpg`, quality: 84, type: 'jpeg' });
for (let i = 0; i < 30; i++) { await ev(() => __step(6)); await wait(40); await p.screenshot({ path: `${out}/s${String(i).padStart(2, '0')}.jpg`, quality: 70, type: 'jpeg' }); } // real-time pacing close to 1:1, so the chained blasts land where they would in play
await ev(() => __step(400)); await wait(300); await p.screenshot({ path: `${out}/b4_later.jpg`, quality: 84, type: 'jpeg' });
console.log(JSON.stringify(await ev(() => __errors.slice(0, 3)))); await b.close();
