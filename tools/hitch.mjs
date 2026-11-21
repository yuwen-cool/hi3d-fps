// Real-time playthrough with the test bot in a visible window, logging every frame over 50 ms with what was
// happening around it (recent game events, the module CPU profile, new shader programs, new geometries/textures).
//   node tools/hitch.mjs [seconds]
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const secs = +(process.argv[2] || 240);
const b = await chromium.launch({ channel: 'chrome', headless: false, args: ['--mute-audio', '--window-size=1600,900'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
await p.goto((process.env.BASE || 'http://127.0.0.1:5320') + '/?shot=1&god=1'); await p.waitForFunction(() => window.__ready, null, { timeout: 180000 });
await p.addScriptTag({ content: readFileSync('tools/bot_page.js', 'utf8') }); await p.evaluate(() => __installBot());
const out = await p.evaluate(async (secs) => {
  const G = __G, R = G.R, info = R.renderer.info, ev = [], hitches = []; let frames = 0;
  const emit = G.events.emit.bind(G.events); G.events.emit = (n, e) => { ev.push([performance.now(), n]); if (ev.length > 60) ev.shift(); return emit(n, e); };
  let last = performance.now(), progs = info.programs?.length || 0, geos = info.memory.geometries, tex = info.memory.textures; const t0 = last;
  return await new Promise((res) => { const f = () => { const n = performance.now(), dt = n - last; last = n; frames++;
    const pr = info.programs?.length || 0, gg = info.memory.geometries, tt = info.memory.textures;
    if (dt > 50 && n - t0 > 3000) hitches.push({ t: +G.time.toFixed(1), ms: Math.round(dt), act: G.flow.S.act, step: G.flow.S.step, ev: ev.filter((x) => n - x[0] < dt + 120).map((x) => x[1]).join(','), newProgs: pr - progs, names: (info.programs || []).slice(progs).map((q) => q.name + '|' + String(q.cacheKey).slice(0, 90)).slice(0, 4), newGeo: gg - geos, newTex: tt - tex });
    progs = pr; geos = gg; tex = tt;
    if (n - t0 < secs * 1000 && !['won', 'dead'].includes(G.flow.S.state)) requestAnimationFrame(f); else res({ frames, hitches, state: G.flow.S.state, err: __errors.slice(0, 3) }); };
  requestAnimationFrame(f); });
}, secs);
console.log('frames', out.frames, 'state', out.state, 'hitches', out.hitches.length, JSON.stringify(out.err));
for (const h of out.hitches) console.log(JSON.stringify(h));
await b.close();
