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
#hud .ammo .lbl{font-size:11px;letter-spacing:.28em;opacity:.65}
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
  <div class="hp"><div class="lbl">INTEGRITY</div><div class="bar"><div class="fill"></div></div></div>
  <div class="ammo"><div class="low">LOW AMMO</div><b>30</b><span>/ 150</span><div class="lbl">KR-9 CARBINE</div></div>
  <div class="feed"></div><div class="ban"></div>
  ${G.params.shot ? '' : `<div class="title"><p>HI3D · BROWSER FPS DEMO</p><h1>SANDLINE</h1><p>ABANDONED REFINERY · DUSK</p><div class="go">CLICK TO DEPLOY</div><div class="keys">WASD MOVE · SHIFT SPRINT · SPACE JUMP · C CROUCH · RMB AIM · LMB FIRE · R RELOAD</div></div>`}`;
  const q = (s) => el.querySelector(s);
  const xh = q('.xh'), arms = { t: q('.xh .t'), b: q('.xh .b'), l: q('.xh .l'), r: q('.xh .r') }, hm = q('.hm'), dmgI = q('.dmg i');
  const ammoB = q('.ammo b'), ammoS = q('.ammo span'), low = q('.ammo .low'), hpF = q('.hp .fill'), feed = q('.feed'), ban = q('.ban'), title = q('.title'), obj = q('.obj');
  let hmT = 0, hmDur = 0.24, banT = 0;
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
  G.events.on('flow:start', () => { if (title) title.style.display = 'none'; });
  function update(dt) {
    const W = G.weapon, p = G.player.s; if (!W) return;
    // crosshair gap from spread
    const fov = G.R.camera.fov * Math.PI / 180; const H = innerHeight;
    let gap = Math.tan(W.S.spread) / Math.tan(fov / 2) * (H / 2) + 4 + (p.sprinting ? 10 : 0); gap = Math.round(Math.min(70, Math.max(4, gap)) * 2) / 2;
    arms.t.style.top = `${-gap - 9}px`; arms.b.style.top = `${gap}px`; arms.l.style.left = `${-gap - 9}px`; arms.r.style.left = `${gap}px`;
    xh.style.opacity = W.S.ads > 0.6 || p.dead ? 0 : 1;
    if (hmT > 0) { hmT -= dt; const k = 1 - hmT / hmDur; const s = (hm.className.includes('kill') || hm.className.includes('weak') ? 1.5 : 1.15); hm.style.opacity = k < 0.35 ? 1 : 1 - (k - 0.35) / 0.65; hm.style.transform = `scale(${k < 0.35 ? s - (s - 1) * k / 0.35 : 1})`; } else hm.style.opacity = 0;
    ammoB.textContent = W.S.ammo; ammoS.textContent = `/ ${W.S.reserve}`; low.style.opacity = W.S.ammo <= Math.ceil(W.W.mag * 0.27) ? 1 : 0;
    hpF.style.width = `${Math.max(0, p.hp / p.maxHp * 100)}%`;
    if (banT > 0) { banT -= dt; if (banT <= 0) ban.style.opacity = 0; }
    const F = G.flow?.S; if (F) obj.textContent = F.state === 'play' ? `WAVE ${Math.max(1, F.wave + 1)} · HOSTILES ${G.enemies?.alive ?? 0}` : F.state === 'extract' ? 'REACH EXTRACTION ◂ WEST GATE' : '';
  }
  return { update };
}
