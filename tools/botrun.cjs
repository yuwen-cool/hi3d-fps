// Unassisted full-match check: a bot that plays through the HUD's objective (walks to the marked valve and
// holds E), aims and shoots, scans in the storm, melees at close range — no free kills. Must reach "won".
// node tools/botrun.cjs
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--use-angle=metal', '--enable-gpu'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const L = []; p.on('pageerror', (e) => L.push(e.message));
  await p.goto((process.env.BASE || 'http://127.0.0.1:5320') + '/?shot=1&record=1' + (process.env.GOD === '0' ? '' : '&god=1'));
  await p.waitForFunction(() => window.__ready, null, { timeout: 120000 });
  await p.addScriptTag({ path: 'tools/bot_page.js' }); await p.evaluate(() => __installBot());
  const snaps = [];
  for (let s = 0; s < 600; s += 10) {
    const r = await p.evaluate(() => { __step(300, 1 / 30); const G = __G; const pp = G.player.s.pos;
      return { t: Math.round(G.time), act: G.flow.S.act, step: G.flow.S.step, wave: G.flow.S.wave, ammo: G.weapon.S.ammo + '/' + G.weapon.S.reserve, hp: Math.round(G.player.s.hp), sh: Math.round(G.player.s.shield), pl: [+pp.x.toFixed(0), +pp.z.toFixed(0)], alive: G.enemies.alive, obj: G.obj?.line }; });
    snaps.push(r); if (await p.evaluate(() => ['won', 'dead'].includes(__G.flow.S.state))) break;
  }
  for (const r of snaps) console.log(r.t, 'act', r.act, r.step, 'wave', r.wave, 'ammo', r.ammo, 'hp', r.hp, 'sh', r.sh, 'pos', r.pl.join(','), 'alive', r.alive, '|', r.obj);
  console.log(JSON.stringify(await p.evaluate(() => ({ state: __G.flow.S.state, kills: __G.kills.length, log: __G.log, used: __G.used, score: __G.score, err: __errors }))), L.slice(0, 3));
  await b.close();
})();
