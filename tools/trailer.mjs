// Trailer cut: title card -> recorded shots (crossfaded) -> end card. Silent (music is added in the edit).
// node tools/trailer.mjs [out.mp4]   (expects out/rec/<shot>.mp4 from tools/record.mjs)
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';

const out = process.argv[2] || 'out/trailer/sandline_trailer.mp4';
const dir = 'out/trailer'; mkdirSync(dir, { recursive: true });
// [clip, seconds to use from its start]
// hook first (the colossus in the sand), then the title, then the three acts in order
const hook = ['p2_hook', 4.6];
const cut = [['p2_dusk', 5.5], ['p2_wall', 5.5], ['p2_storm', 5.5], ['p2_tank', 4.2], ['p2_boss', 8.5], ['p2_tower', 5.5]];
const F = 0.6; // crossfade seconds

const card = (title, sub, small) => `<html><body style="margin:0;width:1920px;height:1080px;background:#0b0907;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'Avenir Next','Helvetica Neue',sans-serif;color:#e8dcc6">
<div style="letter-spacing:.55em;font-size:92px;font-weight:600;padding-left:.55em">${title}</div>
<div style="margin-top:28px;letter-spacing:.35em;font-size:22px;color:#c9a77a">${sub}</div>
<div style="margin-top:14px;letter-spacing:.25em;font-size:15px;color:#8a7a66">${small}</div></body></html>`;
const b = await chromium.launch({ channel: 'chrome', headless: true });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
for (const [name, html] of [
  ['card_in', card('SANDLINE', 'A STORM IS COMING', 'A BROWSER FPS · EVERY MODEL GENERATED WITH HI3D')],
  ['card_out', card('SANDLINE', 'DUSK · SANDSTORM · FIRE NIGHT', 'PLAYABLE IN THE BROWSER AT 60 FPS · WEAPON, ROBOTS, COLOSSUS, REFINERY GENERATED WITH HI3D')],
]) { await p.setContent(html); await p.screenshot({ path: `${dir}/${name}.png` }); }
await b.close();

const seg = [];
const mk = (args, name) => { const f = `${dir}/${name}.mp4`; execSync(`ffmpeg -y -loglevel error ${args} -r 60 -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p ${f}`); seg.push(f); };
mk(`-t ${hook[1]} -i out/rec/${hook[0]}.mp4`, 'seg_hook');
mk(`-loop 1 -t 2.4 -i ${dir}/card_in.png`, 'seg_in');
for (const [c, t] of cut) { const src = `out/rec/${c}.mp4`; if (!existsSync(src)) { console.warn('missing', src); continue; } mk(`-t ${t} -i ${src}`, `seg_${c}`); }
mk(`-loop 1 -t 3.4 -i ${dir}/card_out.png -vf "fade=out:st=2.6:d=0.8"`, 'seg_out');

// chain xfades
const dur = (f) => +execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 ${f}`).toString();
let filter = '', last = '[0:v]', acc = dur(seg[0]);
for (let i = 1; i < seg.length; i++) {
  const o = i === seg.length - 1 ? '[v]' : `[x${i}]`;
  filter += `${last}[${i}:v]xfade=transition=fade:duration=${F}:offset=${(acc - F).toFixed(3)}${o};`;
  acc += dur(seg[i]) - F; last = o;
}
execSync(`ffmpeg -y -loglevel error ${seg.map((s) => `-i ${s}`).join(' ')} -filter_complex "${filter.slice(0, -1)}" -map "[v]" -r 60 -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -movflags +faststart ${out}`);
console.log(out, acc.toFixed(1) + 's');
