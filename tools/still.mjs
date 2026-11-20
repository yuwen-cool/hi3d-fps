// Deterministic gameplay stills: [HUD=1] node tools/still.mjs '<json [{out, p:[x,z], yaw, pitch, enemies:[[x,z],...], steps, fire}]>'
// Enemies are puppets aiming at the player's eye; the player view model is live (sway settled over `steps`).
import { chromium } from 'playwright';
const shots = JSON.parse(process.argv[2]);
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--use-angle=metal', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } }); const logs = [];
p.on('pageerror', (e) => logs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) logs.push(m.text().slice(0, 300)); });
await p.goto('http://127.0.0.1:5320/?shot=1&noenemies=1&record=1&q=ultra' + (process.env.HUD ? '' : '&nohud=1')); await p.waitForFunction(() => window.__ready, null, { timeout: 120000 });
for (const s of shots) {
  await p.evaluate((s) => {
    const G = __G, T = G.THREE; G.auto = {}; G.god = true;
    for (const e of (window.__pes || [])) e.root.visible = false;
    const ps = G.player.s; ps.pos.set(s.p[0], ps.pos.y, s.p[1]); ps.yaw = s.yaw; ps.pitch = s.pitch || 0;
    __step(2, 1 / 60);
    const eye = G.R.camera.getWorldPosition(new T.Vector3());
    window.__pes = (s.enemies || []).map(([x, z]) => {
      const yaw = Math.atan2(eye.x - x, eye.z - z);
      const e = G.enemies.spawn(new T.Vector3(x, 0, z), { yaw }); e.puppet = true; e.yaw = yaw; e.puppetAim = eye.clone(); return e;
    });
    __step(s.steps || 120, 1 / 60);
    // optional: freeze on a shot (muzzle flash, tracer, impact sparks)
    if (s.fire) { G.weapon.fire(); __step(s.fire, 1 / 60); }
  }, s);
  await p.screenshot({ path: s.out }); console.log(s.out);
}
console.log(logs.slice(0, 3)); await b.close();
