// Title and end cards for the playthrough video, drawn in the browser with the game's own fonts (transparent PNGs).
//   node tools/video_cards.mjs   -> out/video/card_title.png, card_end.png
import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.goto((process.env.BASE || 'http://127.0.0.1:5320') + '/?shot=1'); await p.waitForFunction(() => window.__ready, null, { timeout: 180000 });
await p.evaluate(() => document.fonts.ready);
const CSS = `html,body{margin:0;background:transparent!important}#c,#ui,#hud,#loading{display:none!important}
.card{position:fixed;inset:0;display:flex;flex-direction:column;justify-content:center;padding-left:150px;color:#efe5cf}
.ov{font-family:'Barlow Condensed';font-weight:600;font-size:30px;letter-spacing:.55em;color:#ff6a14}
h1{margin:0;font-family:'Big Shoulders Display';font-weight:900;font-size:300px;line-height:270px;letter-spacing:.01em;text-shadow:0 10px 60px rgba(0,0,0,.6)}
.ln{width:620px;height:5px;background:#ff6a14;margin:26px 0 22px}
.sub{font-family:'Barlow Condensed';font-weight:600;font-size:44px;letter-spacing:.06em;max-width:1650px;line-height:52px;text-shadow:0 2px 20px rgba(0,0,0,.8)}
.sm{margin-top:18px;font-family:'Barlow Condensed';font-weight:600;font-size:28px;letter-spacing:.32em;color:rgba(239,229,207,.75)}
.hz{display:inline-block;width:56px;height:56px;margin-right:18px;vertical-align:middle;background:repeating-linear-gradient(-45deg,#e8b40c 0 12px,#0d0b09 12px 24px)}`;
const cards = {
  title: `<div class="card"><div class="ov">HI3D // BROWSER FPS</div><h1>SANDLINE</h1><div class="ln"></div><div class="sub">Hold the refinery. Survive the sandstorm. Bring down the colossus.</div><div class="sm">A FULL PLAYTHROUGH — EVERY MODEL GENERATED WITH HI3D</div></div>`,
  end: `<div class="card"><div class="ov">MISSION COMPLETE</div><h1>SANDLINE</h1><div class="ln"></div><div class="sub"><span class="hz"></span>Runs in your browser. No install.</div><div class="sm">EVERY MODEL IN THIS GAME WAS GENERATED WITH HI3D</div></div>`,
};
for (const [k, html] of Object.entries(cards)) {
  await p.evaluate(([css, html]) => { document.getElementById('vcard')?.remove(); const s = document.getElementById('vcss') || Object.assign(document.head.appendChild(document.createElement('style')), { id: 'vcss' }); s.textContent = css; const d = document.createElement('div'); d.id = 'vcard'; d.innerHTML = html; document.body.appendChild(d); }, [CSS, html]);
  await p.waitForTimeout(200); await p.screenshot({ path: `out/video/card_${k}.png`, omitBackground: true });
}
console.log('cards written'); await b.close();
