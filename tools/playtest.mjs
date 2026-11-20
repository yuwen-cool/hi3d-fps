// Headless scripted match: bot player strafes, auto-aims at the nearest robot, fires in bursts.
// Reports fps, errors, kills, damage taken, wave progress; saves periodic screenshots.
import { chromium } from 'playwright';
const secs = +(process.argv[2] || 40), outDir = process.argv[3] || 'out/play';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const logs = []; p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) logs.push(m.text().slice(0, 300)); }); p.on('pageerror', (e) => logs.push(e.message));
await p.goto('http://127.0.0.1:5320/?shot=1' + (process.argv[4] === 'god' ? '&god=1' : ''));
await p.waitForFunction(() => window.__ready, null, { timeout: 120000 });
await p.evaluate(() => {
  const G = __G, T = G.THREE; G.botStats = { frames: [], dmg: 0, acts: [] }; G.events.on('flow:act', (e) => G.botStats.acts.push([e.act, Math.round(G.time)])); for (const n of ['boss:spawn', 'boss:core', 'boss:dead', 'tower:down', 'flow:extract', 'tank:boom']) G.events.on(n, () => G.botStats.acts.push([n, Math.round(G.time)])); G.god = !!new URLSearchParams(location.search).get('god');
  G.events.on('player:hit', (e) => G.botStats.dmg += e.dmg);
  let last = performance.now(), t = 0, burst = 0;
  G.modules.bot = { update(dt) {
    const now = performance.now(); G.botStats.frames.push(now - last); last = now; t += dt;
    const ps = G.player.s; if (ps.dead) { G.auto = {}; return; }
    const es = G.enemies.list.filter((e) => e.alive);
    let tgt = null, bd = 1e9; const eye = G.R.camera.getWorldPosition(new T.Vector3());
    for (const e of es) { const h = e.bones.spine_03.getWorldPosition(new T.Vector3()); const d = h.distanceTo(eye); if (d < bd && G.phys.los(eye, h)) { bd = d; tgt = h; } }
    // colossus: go for the coolant tanks once no robot is in sight; lob a grenade now and then
    const B = G.boss?.S; if (!tgt && B?.active && !B.dead) { const c = G.boss.cores.find((x) => x.alive); if (c) { tgt = c.light.position.clone(); bd = tgt.distanceTo(eye); if (G.weapon.S.gl > 0 && Math.random() < dt * 0.15) G.auto.gl = true; } }
    G.auto = { fwd: Math.sin(t * 0.7) > 0.3 ? 1 : 0, str: Math.sin(t * 1.3) > 0 ? 1 : -1, gl: G.auto?.gl };
    if (tgt) { const d = tgt.clone().sub(eye); const yaw = Math.atan2(-d.x, -d.z), pit = Math.atan2(d.y, Math.hypot(d.x, d.z));
      ps.yaw += Math.atan2(Math.sin(yaw - ps.yaw), Math.cos(yaw - ps.yaw)) * Math.min(1, dt * 8); ps.pitch += (pit - ps.pitch) * Math.min(1, dt * 8);
      burst += dt; G.auto.fire = (burst % 0.9) < 0.45; G.auto.ads = bd > 12; G.auto.fwd = 0; }
    if (G.weapon.S.ammo === 0 && !G.weapon.S.reloading) G.weapon.startReload();
  } };
  const bot = G.modules.bot; delete G.modules.bot; const ie = G.modules.inputEnd; delete G.modules.inputEnd; G.modules.bot = bot; G.modules.inputEnd = ie;
  // the controller reads G.auto only when "cinematic"; route bot movement through input injection
  const I = G.input; const down0 = I.down; I.down = (a) => (a === 'fwd' && G.auto?.fwd > 0) || (a === 'right' && G.auto?.str > 0) || (a === 'left' && G.auto?.str < 0) || down0(a);
});
for (let i = 0; i < secs; i += 5) { await p.waitForTimeout(5000); await p.screenshot({ path: `${outDir}/t${String(i + 5).padStart(3, '0')}.png` }); }
const r = await p.evaluate(() => { const G = __G, f = G.botStats.frames.slice(30).sort((a, b) => a - b); const avg = f.reduce((a, b) => a + b, 0) / f.length;
  return { avgMs: +avg.toFixed(2), p50: +f[Math.floor(f.length * 0.5)].toFixed(2), p99: +f[Math.floor(f.length * 0.99)].toFixed(2), fps: +(1000 / avg).toFixed(1), kills: G.flow.S.kills, wave: G.flow.S.wave, act: G.flow.S.act, timeline: G.botStats.acts, state: G.flow.S.state, hp: Math.round(G.player.s.hp), dmgTaken: G.botStats.dmg, alive: G.enemies.alive, stats: window.__stats(), errors: window.__errors }; });
console.log(JSON.stringify(r)); if (logs.length) console.log([...new Set(logs)].slice(0, 8).join('\n'));
await b.close();
