import { chromium } from 'playwright';
const qs = process.argv.slice(2, -1), out = process.argv.at(-1);
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--use-angle=metal', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const shots = [];
for (const q of qs) { await p.goto('http://127.0.0.1:5320/?shot=1&noenemies=1&nohud=1&' + q); await p.waitForFunction(() => window.__ready, null, { timeout: 120000 }); await p.evaluate(async () => { __G.player.s.yaw = Math.PI * 0.75; __G.player.s.pitch = 0; await new Promise((r) => setTimeout(r, 300)); }); shots.push(await p.screenshot()); }
const sharp = (await import('sharp')).default;
const tiles = await Promise.all(shots.map((s) => sharp(s).extract({ left: 380, top: 150, width: 900, height: 570 }).resize(450, 285).toBuffer()));
await sharp({ create: { width: 450 * Math.min(4, tiles.length), height: 285 * Math.ceil(tiles.length / 4), channels: 3, background: '#000' } }).composite(tiles.map((t, i) => ({ input: t, left: (i % 4) * 450, top: Math.floor(i / 4) * 285 }))).jpeg().toFile(out);
await b.close();
