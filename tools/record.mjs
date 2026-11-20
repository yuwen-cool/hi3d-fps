// Offline recorder: node tools/record.mjs <shot.json> -> out/rec/<name>/f00000.jpg ... + mp4
// shot.json: { name, url, seconds, fps, size:[w,h], setup: "js run once", perFrame: "js run each frame (t in seconds as `t`)" }
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
const S = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [W, H] = S.size || [1920, 1080], fps = S.fps || 60, N = Math.round((S.seconds || 5) * fps);
const dir = `out/rec/${S.name}`; rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: W, height: H } });
const logs = []; p.on('pageerror', (e) => logs.push(e.message));
await p.goto('http://127.0.0.1:5320' + S.url + (S.url.includes('?') ? '&' : '?') + 'record=1');
await p.waitForFunction(() => window.__ready || window.__fatal, null, { timeout: 180000 });
if (S.setup) await p.evaluate(`(async()=>{${S.setup}})()`);
if (S.warm) await p.evaluate((n) => window.__step(n, 1 / 60), S.warm);
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  if (S.perFrame) await p.evaluate(`(()=>{const t=${i / fps};${S.perFrame}})()`);
  await p.evaluate((dt) => window.__step(1, dt), 1 / fps);
  await p.screenshot({ path: `${dir}/f${String(i).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 93 });
  if (i % 60 === 0) process.stdout.write(`${i}/${N} `);
}
await b.close();
execSync(`ffmpeg -y -loglevel error -framerate ${fps} -i ${dir}/f%05d.jpg -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p ${dir}.mp4`);
console.log(`\n${dir}.mp4 ${N} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s`, logs.slice(0, 3));
