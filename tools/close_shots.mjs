// Close looks at the new enemies (no AI): a shield heavy front and back, a drone hovering, one locking on.
//   node tools/close_shots.mjs [outDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] || 'out/kit'; mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--use-angle=metal', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto((process.env.BASE || 'http://127.0.0.1:5320') + '/?shot=1&nohud=1&noenemies=1&record=1&cam=0,1.6,0,0,1.5,-6'); await p.waitForFunction(() => window.__ready, null, { timeout: 120000 });
const ev = (f, a) => p.evaluate(f, a); const shot = (n) => p.screenshot({ path: `${out}/${n}.jpg`, type: 'jpeg', quality: 86 });
await ev(() => { const G = __G, V = G.THREE.Vector3; G.viewModelVisible = false; G.player.s.dead = true;
  const h = G.enemies.spawn(new V(-1, 0, -12), { kind: 'heavy', yaw: 0.35 }); h.puppet = true; h.puppetU = 'Pistol_Aim_Neutral'; h.puppetAim = new V(0, 1.6, -6);
  const r = G.enemies.spawn(new V(1.4, 0, -12.5), { kind: 'rifle', yaw: -0.2 }); r.puppet = true; r.puppetAim = new V(0, 1.6, -6);
  const d = G.drones.spawn(new V(2.5, 3.2, -9)); d.life = 999; d.fireT = 999; G.camLocked = true; const cam = G.R.camera; cam.position.set(0, 1.6, -6.5); cam.lookAt(0, 1.5, -12); __step(60);
  d.root.position.set(2.2, 2.8, -9.5); d.vel.set(0, 0, 0); d.or = 0; });
await ev(() => { const c = __G.R.camera; c.position.set(0.6, 1.7, -7.5); c.lookAt(0, 1.4, -12); __step(2); }); await shot('c1_heavy_front');
await ev(() => { const c = __G.R.camera; c.position.set(-2.5, 1.9, -16.5); c.lookAt(-1, 1.4, -12); __step(2); }); await shot('c2_heavy_back');
await ev(() => { const G = __G, d = G.drones.list[0], c = G.R.camera; c.position.set(0.5, 2.2, -6.5); c.lookAt(d.root.position); __step(2); }); await shot('c3_drone');
await ev(() => { const G = __G, h = G.enemies.list[0]; G.enemies.damage(h, 999, { part: 'shield', point: h.shield.m.position.clone() }, new G.THREE.Vector3(0, 0, -1)); __step(90); const c = G.R.camera; c.position.set(0.6, 1.7, -7.5); c.lookAt(-1, 1, -12); __step(2); }); await shot('c4_shield_broken');
console.log(JSON.stringify(await ev(() => __errors.slice(0, 3))));
await b.close();
