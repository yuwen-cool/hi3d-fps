// View-model check: both guns at idle in daylight, in the storm and at night.
//   node tools/vm_shots.mjs [outDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] || 'out/vm'; mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--use-angle=metal', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
await p.goto((process.env.BASE || 'http://127.0.0.1:5320') + '/?record=1'); await p.waitForFunction(() => window.__ready, null, { timeout: 120000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (n, ms = 250) => { await wait(ms); await p.screenshot({ path: `${out}/${n}.jpg`, type: 'jpeg', quality: 84 }); console.log('shot', n); };
const ev = (f, a) => p.evaluate(f, a);
await ev(() => __step(30)); await wait(600); await p.click('#ui .title .menu button:nth-child(1)');
for (let i = 0; i < 40 && await ev(() => __G.flow.S.state) !== 'play'; i++) await ev(() => __step(10));
await ev(() => { const G = __G; G.god = true; for (const e of G.enemies.list) if (e.alive) { e.alive = false; e.root.visible = false; e.gun.visible = false; } G.weapon.S.lanceOn = true; G.weapon.unlock?.('lance'); __step(10); });
const pose = (x, z, yaw) => ev(([x, z, yaw]) => { const G = __G; G.player.s.pos.set(x, 0, z); G.player.s.yaw = yaw; G.player.s.pitch = -0.05; __step(40); }, [x, z, yaw]);
for (const [tag, setup] of [['day', null], ['storm', 'storm'], ['night', 'night']]) {
  if (setup === 'storm') await ev(() => { const G = __G; G.flow.S.stormClock = 0.01; __step(6); for (let i = 0; i < 30 && G.cine.playing; i++) __step(20); __step(60 * 14); for (const e of G.enemies.list) if (e.alive) { e.alive = false; e.root.visible = false; e.gun.visible = false; } });
  if (setup === 'night') await ev(() => { const G = __G; G.flow.S.nightT = G.flow.S.t; for (const e of G.enemies.list) if (e.alive) { e.alive = false; e.root.visible = false; e.gun.visible = false; } __step(60 * 9); });
  await pose(-6, -40, 2.4);
  await ev(() => { __G.weapon.swapTo('rifle'); __step(50); }); await shot(`${tag}_rifle`);
  await ev(() => { __G.weapon.swapTo('lance'); __step(50); }); await shot(`${tag}_lance`);
}
console.log(JSON.stringify(await ev(() => ({ key: __G.weapon.key, err: __errors.slice(0, 3) }))));
await b.close();
