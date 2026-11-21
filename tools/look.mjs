// Screenshot the game from a given camera (record mode, no HUD): node tools/look.mjs x,y,z,tx,ty,tz out.jpg [extra-query]
import { chromium } from 'playwright';
const [cam, out, q = ''] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--use-angle=metal', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto(`${process.env.BASE || 'http://127.0.0.1:5320'}/?shot=1&nohud=1&noenemies=1&record=1&cam=${cam}${q}`); await p.waitForFunction(() => window.__ready, null, { timeout: 120000 });
await p.evaluate(() => { __G.viewModelVisible = false; __step(40); });
await p.screenshot({ path: out, type: 'jpeg', quality: 85 }); await b.close();
