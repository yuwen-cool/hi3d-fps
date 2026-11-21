// The Hi3D hangar from the title menu: concept image, the mesh printing up, the finished model; a few models.
//   node tools/hangar_shots.mjs [outDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] || 'out/hangar'; mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--use-angle=metal', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } }); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
await p.goto((process.env.BASE || 'http://127.0.0.1:5320') + '/'); await p.waitForFunction(() => window.__ready, null, { timeout: 120000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(2500); await p.click('#ui .title .menu button:nth-child(3)'); await wait(900);
await p.screenshot({ path: `${out}/h1_concept.jpg`, quality: 84, type: 'jpeg' }); await wait(1800);
await p.screenshot({ path: `${out}/h2_mesh.jpg`, quality: 84, type: 'jpeg' }); await wait(3200);
await p.screenshot({ path: `${out}/h3_model.jpg`, quality: 84, type: 'jpeg' });
for (const [n, k] of [['h4_hull', 1], ['h5_ship', 8]]) { for (let i = 0; i < k; i++) { await p.keyboard.press('ArrowDown'); await wait(120); } await wait(6500); await p.screenshot({ path: `${out}/${n}.jpg`, quality: 84, type: 'jpeg' }); }
await p.keyboard.press('Escape'); await wait(800); await p.screenshot({ path: `${out}/h6_back.jpg`, quality: 70, type: 'jpeg' });
console.log(JSON.stringify({ open: await p.evaluate(() => !!__G.hangarOpen), errs: errs.slice(0, 5) })); await b.close();
