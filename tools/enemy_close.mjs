// Enemy close-up stills: node tools/enemy_close.mjs '<json [[out,x,z,camAngleDeg,dist,aimYawOffsetDeg],...]>'
import { chromium } from 'playwright';
const shots = JSON.parse(process.argv[2] || '[["out/blind/ours_enemy_close.png",-4,-3,35,3,25]]');
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--use-angle=metal', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } }); const logs = [];
p.on('pageerror', (e) => logs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) logs.push(m.text().slice(0, 300)); });
await p.goto('http://127.0.0.1:5320/?shot=1&noenemies=1&nohud=1&record=1'); await p.waitForFunction(() => window.__ready, null, { timeout: 120000 });
for (const [out, x, z, ca, dist, ao] of shots) {
  await p.evaluate(([x, z, ca, dist, ao, HOLD]) => {
    const G = __G, T = G.THREE; G.auto = {}; G.god = true; G.camLocked = true; G.viewModelVisible = false; Object.assign(G.HOLD, HOLD);
    if (window.__pe) window.__pe.root.visible = false;
    // camera on the sun side, rotated by ca degrees, so the robot is front / three-quarter lit
    const sunA = Math.atan2(-0.62, -0.77), a = sunA + ca * Math.PI / 180;
    const cx = x + Math.sin(a) * dist, cz = z + Math.cos(a) * dist;
    const yaw = Math.atan2(cx - x, cz - z) + ao * Math.PI / 180;
    const e = G.enemies.spawn(new T.Vector3(x, 0, z), { yaw }); e.puppet = true; e.yaw = yaw; window.__pe = e;
    e.puppetAim = new T.Vector3(x + Math.sin(yaw) * 10, 1.45, z + Math.cos(yaw) * 10);
    const c = G.R.camera; c.fov = 38; c.updateProjectionMatrix(); c.position.set(cx, 1.5, cz); c.lookAt(x, 1.15, z);
    window.__step(40, 1 / 60);
  }, [x, z, ca, dist, ao, JSON.parse(process.env.HOLD || '{}')]);
  await p.screenshot({ path: out }); console.log(out);
}
console.log(logs.slice(0, 3)); await b.close();
