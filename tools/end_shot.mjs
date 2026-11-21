// Screenshot the results / KIA screen: node tools/end_shot.mjs won|dead out.jpg
import { chromium } from 'playwright';
const [kind = 'won', out = 'out/ui/end.jpg'] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
await p.goto('http://127.0.0.1:5320/?record=1'); await p.waitForFunction(() => window.__ready, null, { timeout: 120000 });
await p.evaluate((k) => { __G.flow.start(); __step(20); __G.events.emit(k === 'won' ? 'flow:won' : 'player:dead'); }, kind);
await new Promise((r) => setTimeout(r, 3600)); await p.mouse.move(1200, 200); await new Promise((r) => setTimeout(r, 400));
await p.screenshot({ path: out, type: 'jpeg', quality: 85 }); await b.close();
