// Offline recorder: node tools/record.mjs <shot.json> -> out/rec/<name>/f00000.jpg ... + mp4
// shot.json: { name, url, seconds, fps, size:[w,h], setup: "js run once", perFrame: "js run each frame (t in seconds as `t`)" }
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
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
// event log for the trailer mix: every sound-making event with its clip time, position and camera distance
await p.evaluate(() => {
  const G = __G; G.__ev = []; const t0 = G.time;
  const names = ['weapon:fire', 'enemy:fire', 'enemy:killed', 'enemy:hit', 'explosion', 'gl:fire', 'thunder', 'boss:step', 'boss:charge', 'boss:beam', 'boss:core', 'boss:dying', 'tower:fall', 'tower:down', 'tank:boom', 'shell:bounce', 'leak', 'ignite', 'wreck:land', 'weapon:magout', 'weapon:magin', 'weapon:bolt'];
  for (const n of names) G.events.on(n, (e) => { const p = e?.pos || e?.muzzle || e?.point; const c = G.R.camera.position;
    G.__ev.push({ t: +(G.time - t0).toFixed(3), n, d: p ? +p.distanceTo(c).toFixed(1) : 0, size: e?.size, delay: e?.delay, hitE: !!e?.hitE, weak: e?.hitE?.part === 'weak' }); });
});
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  if (S.perFrame) await p.evaluate(`(()=>{const t=${i / fps};${S.perFrame}})()`);
  await p.evaluate((dt) => window.__step(1, dt), 1 / fps);
  await p.screenshot({ path: `${dir}/f${String(i).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 93 });
  if (i % 60 === 0) process.stdout.write(`${i}/${N} `);
}
const evs = await p.evaluate(() => __G.__ev || []);
await b.close();
writeFileSync(`${dir}.events.json`, JSON.stringify(evs));
execSync(`ffmpeg -y -loglevel error -framerate ${fps} -i ${dir}/f%05d.jpg -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p ${dir}.mp4`);
console.log(`\n${dir}.mp4 ${N} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s`, logs.slice(0, 3));
