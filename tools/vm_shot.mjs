// Viewmodel states: hip / ads / reload@t / sprint, cropped to the gun.
import { chromium } from 'playwright';
const q = process.argv[2] || ''; const out = process.argv[3] || 'out/m5/vm_states.jpg';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--use-angle=metal', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto('http://127.0.0.1:5320/?shot=1&noenemies=1&nohud=1' + q); await p.waitForFunction(() => window.__ready, null, { timeout: 120000 });
const shots = [];
for (const st of ['hip', 'ads', 'r0.5', 'r1.0', 'r1.6', 'sprint']) {
  await p.evaluate(async (st) => {
    const G = __G, W = G.weapon, s = (ms) => new Promise((r) => setTimeout(r, ms)); G.auto = {}; G.player.s.yaw = Math.PI * 0.75; G.player.s.pitch = 0;
    W.S.reloading = false; W.S.ammo = 20;
    if (st === 'ads') G.auto = { ads: true };
    if (st === 'sprint') { G.input.down = ((d) => (a) => a === 'sprint' || a === 'fwd' || d(a))(G.input.down.__orig || G.input.down); }
    await s(450);
    if (st[0] === 'r') { W.startReload(); await s(+st.slice(1) * 1000); }
  }, st);
  shots.push(await p.screenshot());
  await p.evaluate(() => { const I = __G.input; I.down = (a) => I.keys.has(a); });
}
const sharp = (await import('sharp')).default;
const tiles = await Promise.all(shots.map((s) => sharp(s).extract({ left: 480, top: 180, width: 800, height: 540 }).resize(480, 324).toBuffer()));
await sharp({ create: { width: 1440, height: 648, channels: 3, background: '#000' } }).composite(tiles.map((t, i) => ({ input: t, left: (i % 3) * 480, top: Math.floor(i / 3) * 324 }))).jpeg().toFile(out);
console.log(out); await b.close();
