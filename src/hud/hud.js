// DOM HUD: dynamic crosshair, hit markers, kill feed, ammo, health, damage direction,
// banners and the title card. Minimal, tactical, readable over a bright dusk sky.
const CSS = `
#hud{font-family:"Inter","SF Pro Display",system-ui,sans-serif;color:#f1ebe0;text-shadow:0 1px 2px rgba(0,0,0,.6);user-select:none}
#hud .xh{position:absolute;left:50%;top:50%;width:0;height:0}
#hud .xh i{position:absolute;background:#f6f1e7;box-shadow:0 0 2px rgba(0,0,0,.8)}
#hud .xh .t,#hud .xh .b{width:2px;height:9px;left:-1px}#hud .xh .l,#hud .xh .r{height:2px;width:9px;top:-1px}
#hud .xh .d{width:2px;height:2px;left:-1px;top:-1px}
#hud .hm{position:absolute;left:50%;top:50%;width:0;height:0;opacity:0}
#hud .hm i{position:absolute;width:12px;height:2px;background:#fff;left:-6px;top:-1px}
#hud .hm.weak i{background:#ffd27a}#hud .hm.kill i{background:#ff5a3c}
#hud .ammo{position:absolute;right:56px;bottom:46px;text-align:right}
#hud .ammo b{font-size:46px;font-weight:600;letter-spacing:-1px}#hud .ammo span{font-size:18px;opacity:.7;margin-left:6px}
#hud .ammo .lbl{font-size:11px;letter-spacing:.28em;opacity:.65}#hud .ammo .gl{font-size:11px;margin:0;opacity:1;color:#ffcf9a}
#hud .ammo .low{color:#ffb27a;font-size:11px;letter-spacing:.2em;opacity:0;transition:opacity .2s}
#hud .hp{position:absolute;left:56px;bottom:52px;width:240px}
#hud .hp .bar{height:4px;background:rgba(255,255,255,.18);margin-top:6px}#hud .hp .fill{height:100%;background:#f1ebe0;width:100%;transition:width .12s}
#hud .hp .lbl{font-size:11px;letter-spacing:.28em;opacity:.65}
#hud .feed{position:absolute;right:56px;top:46px;text-align:right;font-size:13px;letter-spacing:.06em}
#hud .feed div{margin:4px 0;opacity:.95;transition:opacity .5s}#hud .feed b{color:#ffcf8a;font-weight:600}
#hud .ban{position:absolute;left:0;right:0;top:22%;text-align:center;font-size:15px;letter-spacing:.55em;font-weight:500;opacity:0;transition:opacity .4s}
#hud .dmg{position:absolute;left:50%;top:50%;width:0;height:0}
#hud .dmg i{position:absolute;width:120px;height:120px;left:-60px;top:-60px;border-radius:50%;border-top:4px solid rgba(255,70,40,.85);opacity:0;transition:opacity .6s}
#hud .title{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:flex-end;padding:0 0 9vh 7vw;background:linear-gradient(90deg,rgba(10,7,5,.75),rgba(10,7,5,0) 55%);pointer-events:auto;cursor:pointer}
#hud .title h1{font-size:76px;margin:0;letter-spacing:.12em;font-weight:700}
#hud .title p{margin:10px 0 0;font-size:13px;letter-spacing:.32em;opacity:.8}
#hud .title .go{margin-top:34px;font-size:12px;letter-spacing:.4em;color:#ffcf8a}
#hud .title .keys{margin-top:14px;font-size:11px;letter-spacing:.18em;opacity:.55}
#hud .credit{position:absolute;left:56px;top:46px;font-size:11px;letter-spacing:.3em;opacity:.55}
#hud .obj{position:absolute;left:56px;top:68px;font-size:12px;letter-spacing:.2em;opacity:.85}
#hud .mk{position:absolute;left:0;top:0;width:0;height:0;opacity:0;transition:opacity .25s}#hud .mk i{position:absolute;left:-9px;top:-9px;width:18px;height:18px;border:2px solid #ff8a3a;transform:rotate(45deg);box-shadow:0 0 10px rgba(255,138,58,.7)}#hud .mk b{position:absolute;left:-60px;top:16px;width:120px;text-align:center;font-size:10px;letter-spacing:.2em;color:#ffcf9a;font-weight:500}#hud .mk.ext i{border-color:#8fe3a2;box-shadow:0 0 10px rgba(143,227,162,.7)}#hud .mk.ext b{color:#c9f5d2}
#hud .boss{position:absolute;left:50%;top:44px;transform:translateX(-50%);width:420px;text-align:center;opacity:0;transition:opacity .4s}#hud .boss .lbl{font-size:11px;letter-spacing:.4em;color:#ffcf9a;margin-bottom:6px}#hud .boss .bar{height:4px;background:rgba(255,255,255,.15)}#hud .boss .fill{height:100%;background:#ff8a3a;width:100%;transition:width .15s}
`;
export function createHUD(G) {
  const el = document.getElementById('hud');
  if (G.params.nohud) { el.style.display = 'none'; return { update() {} }; }
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  el.innerHTML = `
  <div class="xh"><i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><i class="d"></i></div>
  <div class="hm"><i style="transform:rotate(45deg) translateX(14px)"></i><i style="transform:rotate(135deg) translateX(14px)"></i><i style="transform:rotate(225deg) translateX(14px)"></i><i style="transform:rotate(315deg) translateX(14px)"></i></div>
  <div class="dmg"><i></i></div>
  <div class="credit">SANDLINE · ASSETS GENERATED WITH HI3D</div>
  <div class="obj"></div>
  <div class="boss"><div class="lbl">COLOSSUS · SHOOT THE COOLANT TANKS</div><div class="bar"><div class="fill"></div></div></div>
  <div class="hp"><div class="lbl">INTEGRITY</div><div class="bar"><div class="fill"></div></div></div>
  <div class="ammo"><div class="low">LOW AMMO</div><b>30</b><span>/ 150</span><div class="lbl">KR-9 CARBINE · <span class="gl">GL 3</span></div></div>
  <div class="feed"></div><div class="ban"></div>
  <div class="mk"><i></i><b></b></div><div class="mk"><i></i><b></b></div><div class="mk"><i></i><b></b></div><div class="mk"><i></i><b></b></div>
  ${G.params.shot ? '' : `<div class="title"><p>HI3D · BROWSER FPS DEMO</p><h1>SANDLINE</h1><p>ABANDONED REFINERY · A STORM IS COMING</p><div class="go">CLICK TO DEPLOY</div><div class="keys">WASD MOVE · SHIFT SPRINT · SPACE JUMP · C CROUCH · RMB AIM · LMB FIRE · R RELOAD · G GRENADE</div></div>`}`;
  const q = (s) => el.querySelector(s);
  const xh = q('.xh'), arms = { t: q('.xh .t'), b: q('.xh .b'), l: q('.xh .l'), r: q('.xh .r') }, hm = q('.hm'), dmgI = q('.dmg i');
  const ammoB = q('.ammo b'), glS = q('.ammo .gl'), ammoS = q('.ammo span'), low = q('.ammo .low'), hpF = q('.hp .fill'), feed = q('.feed'), ban = q('.ban'), title = q('.title'), obj = q('.obj'), bossEl = q('.boss'), bossF = q('.boss .fill');
  let hmT = 0, hmDur = 0.24, banT = 0;
  // markers: projected onto the screen, pinned to the edge when the target is off-screen or behind
  const mks = [...el.querySelectorAll('.mk')], _mv = new G.THREE.Vector3();
  function markers() {
    const T = [], F = G.flow?.S, cam = G.R.camera, pp = G.player.s.pos;
    if (F?.state === 'extract') T.push({ p: F.extract.clone().setY(1.6), t: 'EXTRACT', c: 'ext' });
    const B = G.boss; if (B?.S.active && !B.S.dead) for (const c of B.cores) if (c.alive) T.push({ p: c.light.position, t: 'COOLANT' });
    if (G.weapon && G.weapon.S.reserve + G.weapon.S.ammo < 45) { const c = (G.level.crates || []).slice().sort((a, b) => a.distanceTo(pp) - b.distanceTo(pp))[0]; if (c) T.push({ p: c.clone().setY(1), t: 'AMMO', c: 'ext' }); }
    const es = (G.enemies?.list || []).filter((e) => e.alive);
    if (F?.state === 'play' && es.length && es.length <= 3) for (const e of es) T.push({ p: _mv.clone().copy(e.root.position).setY(2.2), t: 'HOSTILE' });
    mks.forEach((m, i) => {
      const t = T[i]; if (!t) { m.style.opacity = 0; return; }
      _mv.copy(t.p).project(cam); const behind = _mv.z > 1; let x = _mv.x * (behind ? -1 : 1), y = _mv.y * (behind ? -1 : 1);
      const off = behind || Math.abs(x) > 0.92 || Math.abs(y) > 0.88; if (off) { const k = Math.max(Math.abs(x) / 0.92, Math.abs(y) / 0.88, 1e-3); x /= k; y /= k; if (behind && Math.abs(y) < 0.5) x = Math.sign(x || 1) * 0.92; }
      m.style.transform = `translate(${(x * 0.5 + 0.5) * innerWidth}px,${(-y * 0.5 + 0.5) * innerHeight}px)`; m.style.opacity = 0.9; m.className = 'mk' + (t.c ? ' ' + t.c : '');
      m.lastChild.textContent = `${t.t} ${Math.round(t.p.distanceTo(pp))}M`;
    });
  }
  G.events.on('enemy:hit', (e) => { hmT = hmDur = 0.24; hm.className = 'hm' + (e.weak ? ' weak' : ''); });
  G.events.on('enemy:killed', (e) => {
    hmT = hmDur = 0.42; hm.className = 'hm kill';
    const d = document.createElement('div'); d.innerHTML = `<b>COMBAT UNIT</b> destroyed${e.weak ? ' · <b>VISOR</b>' : ''}`; feed.prepend(d);
    while (feed.children.length > 4) feed.lastChild.remove();
    setTimeout(() => { d.style.opacity = 0; setTimeout(() => d.remove(), 600); }, 4200);
  });
  G.events.on('player:hit', (e) => {
    if (!e.from) return; const p = G.player.s; const dx = e.from.x - p.pos.x, dz = e.from.z - p.pos.z;
    const a = Math.atan2(dx, -dz) + p.yaw; dmgI.style.transform = `rotate(${a}rad)`; dmgI.style.transition = 'none'; dmgI.style.opacity = 1;
    requestAnimationFrame(() => { dmgI.style.transition = 'opacity .9s'; dmgI.style.opacity = 0; });
  });
  G.events.on('flow:msg', (e) => { ban.textContent = e.m; ban.style.opacity = 1; banT = e.t; });
  const hpEl = q('.hp'); if (title) hpEl.style.visibility = 'hidden';
  G.events.on('flow:start', () => { if (title) title.style.display = 'none'; hpEl.style.visibility = ''; });
  function update(dt) {
    const W = G.weapon, p = G.player.s; if (!W) return;
    // crosshair gap from spread
    const fov = G.R.camera.fov * Math.PI / 180; const H = innerHeight;
    let gap = Math.tan(W.S.spread) / Math.tan(fov / 2) * (H / 2) + 4 + (p.sprinting ? 10 : 0); gap = Math.round(Math.min(70, Math.max(4, gap)) * 2) / 2;
    arms.t.style.top = `${-gap - 9}px`; arms.b.style.top = `${gap}px`; arms.l.style.left = `${-gap - 9}px`; arms.r.style.left = `${gap}px`;
    xh.style.opacity = W.S.ads > 0.6 || p.dead ? 0 : 1;
    if (hmT > 0) { hmT -= dt; const k = 1 - hmT / hmDur; const s = (hm.className.includes('kill') || hm.className.includes('weak') ? 1.5 : 1.15); hm.style.opacity = k < 0.35 ? 1 : 1 - (k - 0.35) / 0.65; hm.style.transform = `scale(${k < 0.35 ? s - (s - 1) * k / 0.35 : 1})`; } else hm.style.opacity = 0;
    ammoB.textContent = W.S.ammo; glS.textContent = `GL ${W.S.gl}  [G]`; ammoS.textContent = `/ ${W.S.reserve}`; low.style.opacity = W.S.ammo <= Math.ceil(W.W.mag * 0.27) ? 1 : 0;
    hpF.style.width = `${Math.max(0, p.hp / p.maxHp * 100)}%`;
    if (banT > 0) { banT -= dt; if (banT <= 0) ban.style.opacity = 0; }
    const F = G.flow?.S; if (F) obj.textContent = F.state === 'play' ? `${['', 'I · DUSK', 'II · SANDSTORM', 'III · FIRE NIGHT'][F.act] || ''} · HOSTILES ${G.enemies?.alive ?? 0}` : F.state === 'extract' ? 'REACH EXTRACTION ◂ WEST GATE' : '';
    markers();
    const B = G.boss?.S; bossEl.style.opacity = B?.active && !B.dead ? 1 : 0; if (B) bossF.style.width = `${Math.round(B.hp * 100)}%`;
  }
  return { update };
}
