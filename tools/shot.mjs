// Screenshot + perf probe. Drives the real GPU through system Chrome so agents can look at
// what they built: node tools/shot.mjs --url "/?view=chase&t=12" --out shots/a.png [--fps] [--eval "js"]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]?.startsWith('--') || arr[i + 1] === undefined ? true : arr[i + 1]]);
  return acc;
}, []));

const base = args.base ?? 'http://127.0.0.1:5320';
const url = base + (args.url ?? '/');
const out = args.out ?? 'shots/shot.png';
const [w, h] = (args.size ?? '1920x1080').split('x').map(Number);

const browser = await chromium.launch({
  channel: 'chrome',
  headless: !args.headed,
  args: ['--mute-audio', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'],
});
const page = await browser.newPage({ viewport: { width: w, height: h } });
const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

await page.goto(url);
await page.waitForFunction(() => window.__ready || window.__fatal, null, { timeout: 120000 });
const err = await page.evaluate(() => window.__fatal);
if (err) console.log('APP ERROR:', err);

if (args.fps) await page.waitForTimeout(6000);
// --eval "js": run in the page right before the screenshot (e.g. aim the camera), then
// render one more frame so the change shows.
if (args.eval) {
  const res = await page.evaluate(args.eval);
  if (res !== undefined) console.log("eval:", typeof res === "string" ? res : JSON.stringify(res));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}
const stats = await page.evaluate(() => window.__stats?.());
mkdirSync(dirname(out), { recursive: true });
await page.screenshot({ path: out });
console.log(JSON.stringify({ out, stats }, null, 0));
if (logs.length) console.log(logs.slice(0, 20).join('\n'));
await browser.close();
