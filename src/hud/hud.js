// Combat HUD (concept board C): objective plate, compass with objective/enemy marks, storm clock, radar, kill feed,
// segmented shield/health, ability cooldowns, ammo with round ticks, dynamic crosshair, hit/kill confirms,
// enemy tags, interaction prompt, radio subtitles, banners, boss bar, visor crack and glitch.
// Reads game state; the flow publishes the current objective in G.obj = { act, title, line, count:[done,total], marks:[{p,label,kind}] }.

const ICON = {
  od: '<svg viewBox="0 0 24 24" fill="none" stroke="#efe5cf" stroke-width="2.2" stroke-linejoin="miter"><path d="M13 2L5 14h6l-1 8 8-12h-6z"/></svg>',
  dash: '<svg viewBox="0 0 24 24" fill="none" stroke="#efe5cf" stroke-width="2.6" stroke-linejoin="miter"><path d="M4 5l7 7-7 7M12 5l7 7-7 7"/></svg>',
  scan: '<svg viewBox="0 0 24 24" fill="none" stroke="#efe5cf" stroke-width="2.2"><circle cx="12" cy="12" r="2.2"/><path d="M6.3 6.3a8 8 0 000 11.4M17.7 6.3a8 8 0 010 11.4M3.5 3.5a12 12 0 000 17M20.5 3.5a12 12 0 010 17"/></svg>',
  melee: '<svg viewBox="0 0 24 24" fill="none" stroke="#efe5cf" stroke-width="2.4"><path d="M5 19l9-9M14 10l2-6 4 4-6 2M4 14l6 6"/></svg>',
};
const CARD = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
const NAMES = { rifle: 'RIFLEMAN', charger: 'CHARGER', heavy: 'SHIELD HEAVY', drone: 'SEEKER DRONE' };
const pad3 = (n) => String(Math.round(n) % 360).padStart(3, '0');
export const bearing = (from, to) => ((Math.atan2(to.x - from.x, -(to.z - from.z)) * 180 / Math.PI) + 360) % 360;

export function createHUD(G) {
  const el = document.getElementById('hud');
  const THREE = G.THREE;
  if (G.params.nohud) { el.style.display = 'none'; return { update() {}, say() {}, banner() {}, glitch() {}, hint() {}, boot() {}, alert() {} }; }
  const segs = (n, cls = '') => Array.from({ length: n }, () => `<i class="${cls}"><b></b></i>`).join('');
  const ring = '<svg class="rg" viewBox="0 0 36 36"><circle cx="18" cy="18" r="16" fill="none" stroke="rgba(239,229,207,.18)" stroke-width="2.5"/><circle class="c" cx="18" cy="18" r="16" fill="none" stroke="#ff6a14" stroke-width="2.5" stroke-dasharray="100.5" stroke-dashoffset="0"/></svg>';
  el.innerHTML = `
  <svg class="crack" viewBox="0 0 1600 900" preserveAspectRatio="none"></svg>
  <div class="speed"></div>
  <div class="obj sh0 pw" style="--d:.5s"><div class="act"><b class="an">ACT 1</b><span class="at">DUSK</span></div><div class="ln"><i class="dm"></i><span class="tx">STAND BY</span><span class="ct"></span></div><div class="sub"><span class="sx"></span><div class="pb"><i></i></div></div><div class="ho">HOSTILES<em>0</em></div></div>
  <div class="cmp pw" style="--d:.35s"><div class="win"><div class="strip"></div></div><div class="base"></div><div class="hd">000</div><div class="mks"></div></div>
  <div class="wmks"></div>
  <div class="tr"><div class="storm sh0 pw" style="--d:.65s"><div class="t">STORM FRONT IN</div><div class="v">--:--</div><div class="z"></div></div><div class="radar pw" style="--d:.75s"><canvas></canvas></div></div>
  <div class="feed"></div>
  <div class="boss"><div class="t">COLOSSUS<span>CLASS-IV SIEGE WALKER</span></div><div class="bar">${'<i></i>'.repeat(24)}</div></div>
  <div class="alert"><span>▲</span><span class="at">SHIELD DOWN</span><span>▲</span></div>
  <div class="vit sh0 pw" style="--d:.9s">
    <div class="bars"><div class="lb"><span>SHIELD / HEALTH</span><b><s class="sn">75</s><span class="n">100</span></b></div><div class="seg sh">${segs(4)}</div><div class="seg hp">${segs(10)}</div></div>
    <div class="ab"><div class="a dash">${ring}<span class="ic">${ICON.dash}</span><span class="cd"></span><span class="kk">SHIFT DASH</span></div><div class="a scan">${ring}<span class="ic">${ICON.scan}</span><span class="cd"></span><span class="kk">Q SCAN</span></div><div class="a od">${ring}<span class="ic">${ICON.od}</span><span class="cd"></span><span class="kk">X OVERDRIVE</span></div></div>
  </div>
  <div class="amm sh0 pw" style="--d:1.0s">
    <div class="rl">RELOADING</div><div class="gain"></div>
    <div class="top"><b>30</b><span>/ 150</span></div>
    <div class="tk">${'<i></i>'.repeat(30)}</div>
    <div class="bot"><span class="gl">GRENADE [G] <i></i><i></i><i></i></span><span class="wn">KR-9 CARBINE</span></div>
    <div class="ws"><span class="w1 on"><em>1</em>CARBINE</span><span class="w2"><em>2</em>LANCE</span></div>
  </div>
  <div class="xh"><i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><i class="d"></i></div>
  <svg class="chg" viewBox="-30 -30 60 60"><circle r="22" class="bg"/><circle r="22" class="fg" pathLength="100"/><path class="tk" d="M0 -27V-17M0 27V17M-27 0H-17M27 0H17"/></svg>
  <div class="hm"><i style="transform:rotate(45deg) translateX(.9rem)"></i><i style="transform:rotate(135deg) translateX(.9rem)"></i><i style="transform:rotate(225deg) translateX(.9rem)"></i><i style="transform:rotate(315deg) translateX(.9rem)"></i></div>
  <div class="pts"></div>
  <div class="kb"><svg viewBox="-50 -50 100 100"></svg><div class="lb"></div></div>
  <div class="odf"></div><div class="odt">OVERDRIVE<i></i></div>
  <div class="dmg"><i></i><i></i><i></i></div>
  <div class="tags">${'<div class="tag"><div class="br"></div><div class="lb"><span class="nm"></span><div class="hb"><i></i></div></div></div>'.repeat(6)}</div>
  <div class="rlp sh0"><span class="kc">R</span>RELOAD</div>
  <div class="use"><span class="kc">E</span><div class="w"><b>HOLD — OPEN VALVE</b><div class="pb"><i></i></div></div></div>
  <div class="hint sh0"></div>
  <div class="ban"><i class="hz"></i><b></b><i class="hz"></i><s></s></div>
  <div class="rad"><div class="bars">${'<i></i>'.repeat(5)}</div><div class="box"><b>CONTROL:</b><span></span></div><div class="bars">${'<i></i>'.repeat(5)}</div></div>`;
  const q = (s) => el.querySelector(s), qa = (s) => [...el.querySelectorAll(s)];
  const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

  // ---------- compass ----------
  const K = 0.3; // rem per degree (±76° visible across 46 rem)
  {
    let h = '';
    for (let d = -180; d <= 560; d += 5) {
      const n = ((d % 360) + 360) % 360, x = (d + 180) * K;
      h += `<i class="${n % 15 === 0 ? 'm' : ''}" style="left:${x}rem"></i>`;
      if (n % 15 === 0 && n % 45 !== 0 || n % 45 === 0) h += `<b class="${CARD[n] ? 'c' : ''}" style="left:${x}rem">${CARD[n] || pad3(n)}</b>`;
    }
    q('.cmp .strip').innerHTML = h;
  }
  const strip = q('.cmp .strip'), cmpHd = q('.cmp .hd'), cmpMks = q('.cmp .mks');
  const markPool = [], enPool = [];
  const mkEl = () => { const m = document.createElement('div'); m.className = 'mk'; m.innerHTML = '<i class="d"></i><span class="l"></span><div class="r"></div>'; cmpMks.appendChild(m); return m; };
  const enEl = () => { const m = document.createElement('i'); m.className = 'en'; cmpMks.appendChild(m); return m; };

  // ---------- radar ----------
  const rc = q('.radar canvas'), rx = rc.getContext('2d'); let rT = 0, sweep = 0;
  function radar(heading) {
    const dpr = Math.min(2, devicePixelRatio || 1), S = Math.round(rc.clientWidth * dpr); if (!S) return;
    if (rc.width !== S) { rc.width = rc.height = S; }
    const c = rx, r = S / 2, R = r - 3 * dpr, range = 42, pp = G.player.s.pos;
    c.clearRect(0, 0, S, S);
    c.fillStyle = 'rgba(10,8,6,.72)'; c.beginPath(); c.arc(r, r, R, 0, 7); c.fill();
    c.strokeStyle = 'rgba(239,229,207,.85)'; c.lineWidth = 1.5 * dpr; c.beginPath(); c.arc(r, r, R, 0, 7); c.stroke();
    c.strokeStyle = 'rgba(239,229,207,.25)'; c.lineWidth = dpr; for (const k of [0.33, 0.66]) { c.beginPath(); c.arc(r, r, R * k, 0, 7); c.stroke(); }
    c.beginPath(); c.moveTo(r, r - R); c.lineTo(r, r + R); c.moveTo(r - R, r); c.lineTo(r + R, r); c.stroke();
    // sweep
    const g = c.createConicGradient ? c.createConicGradient(sweep - Math.PI / 2 - 0.9, r, r) : null;
    if (g) { g.addColorStop(0, 'rgba(255,106,20,0)'); g.addColorStop(0.14, 'rgba(255,106,20,.42)'); g.addColorStop(0.145, 'rgba(255,106,20,0)'); c.fillStyle = g; c.beginPath(); c.moveTo(r, r); c.arc(r, r, R, 0, 7); c.fill(); }
    const hr = heading * Math.PI / 180;
    const put = (p) => { const dx = p.x - pp.x, dz = p.z - pp.z; const e = dx * Math.cos(hr) + dz * Math.sin(hr), n = -dz * Math.cos(hr) + dx * Math.sin(hr); let x = e / range, y = -n / range; const L = Math.hypot(x, y); const edge = L > 0.92; if (edge) { x *= 0.92 / L; y *= 0.92 / L; } return [r + x * R, r + y * R, edge]; };
    // objective marks
    for (const m of G.obj?.marks || []) { const [x, y] = put(m.p); c.fillStyle = m.kind === 'boss' ? '#ff3b2b' : m.kind === 'ext' ? '#efe5cf' : '#ff6a14'; const s = (m.kind === 'boss' ? 7 : 5) * dpr; c.save(); c.translate(x, y); c.rotate(Math.PI / 4); c.fillRect(-s, -s, 2 * s, 2 * s); c.restore(); }
    // hostiles: seen, scanned, or firing recently
    for (const e of [...(G.enemies?.list || []), ...(G.drones?.list || [])]) {
      if (!e.alive) continue; const vis = e.scanT > 0 || (G.time - (e.lastShotT ?? -99)) < 2.5 || e.seenT > 0 || e.mode === 'lock' || e.mode === 'dive'; if (!vis) continue;
      const [x, y, edge] = put(e.root.position); c.fillStyle = e.scanT > 0 ? '#62f1ff' : '#ff3b2b'; c.globalAlpha = edge ? 0.6 : 1;
      c.beginPath(); c.arc(x, y, 3.2 * dpr, 0, 7); c.fill(); c.globalAlpha = 1;
    }
    // player
    c.fillStyle = '#efe5cf'; c.beginPath(); c.moveTo(r, r - 7 * dpr); c.lineTo(r + 5 * dpr, r + 5 * dpr); c.lineTo(r, r + 2 * dpr); c.lineTo(r - 5 * dpr, r + 5 * dpr); c.closePath(); c.fill();
  }

  // ---------- refs ----------
  const xh = q('.xh'), arms = { t: q('.xh .t'), b: q('.xh .b'), l: q('.xh .l'), r: q('.xh .r') }, hm = q('.hm'), pts = q('.pts'), dmgI = qa('.dmg i');
  const objAn = q('.obj .an'), objAt = q('.obj .at'), objLn = q('.obj .ln'), objTx = q('.obj .ln .tx'), objCt = q('.obj .ln .ct'), objHo = q('.obj .ho em'), objSub = q('.obj .sub'), objSubTx = q('.obj .sub .sx'), objSubPb = q('.obj .sub .pb i');
  const stormEl = q('.storm'), stormV = q('.storm .v'), stormT = q('.storm .t'), stormZ = q('.storm .z'), feed = q('.feed');
  const shN = q('.vit .sn'), vit = q('.vit'), amm = q('.amm'), shRow = q('.vit .sh'), shSeg = qa('.vit .sh i b'), hpSeg = qa('.vit .hp i b'), hpN = q('.vit .n');
  const abOd = q('.a.od'), kb = q('.kb'), kbSvg = q('.kb svg'), kbLb = q('.kb .lb'), odf = q('.odf'), odt = q('.odt'), odtBar = q('.odt i');
  const abDash = q('.a.dash'), abScan = q('.a.scan'), rlp = q('.rlp'), gain = q('.amm .gain');
  const ammC = q('.amm .top'), ammB = q('.amm .top b'), ammS = q('.amm .top span'), glP = qa('.amm .gl i'), tk = q('.amm .tk'), rl = q('.amm .rl'), wn = q('.amm .wn'), ws = q('.amm .ws'), ws1 = q('.amm .w1'), ws2 = q('.amm .w2');
  const chg = q('.chg'), chgFg = q('.chg .fg');
  let tks = qa('.amm .tk i');
  // the round ticks, the name and the slot row follow whichever gun is up
  function setGun() { const W = G.weapon; if (!W) return; const n = W.W.mag; tk.innerHTML = '<i></i>'.repeat(n); tk.classList.toggle('big', n < 10); tks = qa('.amm .tk i'); setTx(wn, W.W.label); ws1.classList.toggle('on', W.key === 'rifle'); ws2.classList.toggle('on', W.key === 'lance'); ws.classList.toggle('has', !!W.S.lanceOn); }
  G.events.on('weapon:switch', setGun); G.events.on('weapon:unlock', setGun);
  const wmks = q('.wmks'), wPool = [];
  const wEl = () => { const m = document.createElement('div'); m.className = 'wmk'; m.innerHTML = '<i class="d"></i><span class="l"></span><div class="r sh0"><span class="nm"></span><em></em></div>'; wmks.appendChild(m); return m; };
  let combatT = 0;
  const tags = qa('.tag'), useEl = q('.use'), useB = q('.use b'), usePb = q('.use .pb i'), hintEl = q('.hint'), ban = q('.ban'), rad = q('.rad'), radTx = q('.rad .box span'), radBars = qa('.rad .bars i');
  const bossLbl = q('.boss .t span'), bossEl = q('.boss'), bossSeg = qa('.boss .bar i'), alertEl = q('.alert'), alertTx = q('.alert .at'), crack = q('.crack'), speed = q('.speed');
  const set = (o, k, v) => { if (o['_' + k] !== v) { o['_' + k] = v; o[k] = v; } };
  const setTx = (node, v) => { if (node._t !== v) { node._t = v; node.textContent = v; } };

  // ---------- events ----------
  let hmT = 0, hmDur = 0.24;
  G.events.on('enemy:hit', (e) => { hmT = hmDur = 0.22; hm.className = 'hm' + (e.weak ? ' weak' : ''); });
  let score = 0, streak = 0, streakT = 0;
  G.events.on('enemy:killed', (e) => {
    hmT = hmDur = 0.45; hm.className = 'hm kill';
    const crit = e.weak || e.melee; const n = 100 + (e.weak ? 50 : 0) + (e.melee ? 50 : 0);
    streak = streakT > 0 ? streak + 1 : 1; streakT = 3.5; score += n; G.score = score;
    pts.textContent = `+${n}`; pts.classList.remove('go'); void pts.offsetWidth; pts.classList.add('go');
    addFeed(`${NAMES[e.e?.kind] || 'HOSTILE'} DOWN${e.melee ? ' — TAKEDOWN' : e.weak ? ' — HEADSHOT' : ''}`, `+${n}`, crit);
    emblem(streak, e);
    if (streak >= 2) { const b = 50 * (streak - 1); score += b; G.score = score; addFeed(['', '', 'DOUBLE KILL', 'TRIPLE KILL'][streak] || `${streak}× MULTI-KILL`, `+${b}`, true); }
  });
  // kill emblem: a diamond that gains rings and heat with every kill in a streak; the announcer calls the big ones
  let annT = 0;
  const TIER = ['', '', 'DOUBLE KILL', 'TRIPLE KILL', 'RAMPAGE', 'UNSTOPPABLE'], ANN = ['', '', 'double', 'triple', 'rampage', 'unstoppable'];
  function emblem(n, e) {
    const t = Math.min(5, n); let g = '';
    for (let i = 0; i < t; i++) { const r = 18 + i * 7; g += `<path class="rg" d="M0 ${-r}L${r} 0L0 ${r}L${-r} 0Z" style="opacity:${1 - i * 0.12}"/>`; }
    g += `<path class="core" d="M0 -10L10 0L0 10L-10 0Z"/>`; if (e.weak) g += `<path class="rg" d="M-30 -30L-22 -30M30 -30L22 -30M-30 30L-22 30M30 30L22 30" style="stroke-width:3"/>`;
    kbSvg.innerHTML = g; kbLb.textContent = TIER[t] || (e.melee ? 'TAKEDOWN' : e.weak ? 'HEADSHOT' : '');
    kb.className = 'kb t' + t; void kb.offsetWidth; kb.classList.add('go');
    G.audio?.play?.('killConfirm', { gain: 0.5 + 0.08 * t, rate: 1 + 0.09 * (t - 1) });
    const now = G.time; if (now - annT < 1.2) return;
    const line = ANN[t] || (e.melee ? 'takedown' : e.weak && Math.random() < 0.5 ? 'headshot' : ''); if (line) { annT = now; G.audio?.vo?.(line); }
  }
  G.events.on('flow:lastkill', () => { banner('WAVE CLEARED', { kind: 'good', dur: 2.2 }); setTimeout(() => G.audio?.vo?.('cleared'), 500); });
  G.events.on('boss:dead', () => setTimeout(() => G.audio?.vo?.('colossusdown'), 900));
  G.events.on('trap:ignite', () => setTimeout(() => G.audio?.vo?.('ignited'), 300));
  G.events.on('od:start', () => { setTimeout(() => { if (G.od?.S?.active !== false) odf.classList.add('on'); }, 330); odt.classList.add('on'); glitch(); hint([], 0); hintEl.classList.remove('on'); }); // the READY prompt goes the moment it is used
  G.events.on('od:end', () => { odf.classList.remove('on'); odt.classList.remove('on'); });
  function addFeed(text, val, crit) {
    const d = document.createElement('div'); if (crit) d.className = 'crit'; d.innerHTML = `<span></span><em></em>`; d.firstChild.textContent = text; d.lastChild.textContent = val; feed.prepend(d);
    while (feed.children.length > 4) feed.lastChild.remove();
    setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 520); }, 4200);
  }
  let dmgN = 0;
  G.events.on('player:hit', (e) => {
    if (!e.from) return; const p = G.player.s; const dx = e.from.x - p.pos.x, dz = e.from.z - p.pos.z;
    const a = Math.atan2(dx, -dz) + p.yaw; const i = dmgI[dmgN++ % dmgI.length];
    i.style.transform = `rotate(${a}rad)`; i.style.transition = 'none'; i.style.opacity = 1;
    requestAnimationFrame(() => { i.style.transition = 'opacity 1s'; i.style.opacity = 0; });
  });
  G.events.on('player:shieldBreak', () => { shRow.classList.remove('brk'); void shRow.offsetWidth; shRow.classList.add('brk'); alertMsg('SHIELD DOWN'); visorCrack(); }); // no glitch here: it happens all the time in a fight and read as a broken HUD
  G.events.on('ammo:gain', (e) => { if (!e.n) return; gain.textContent = `+${e.n} SALVAGED`; gain.classList.remove('go'); void gain.offsetWidth; gain.classList.add('go'); });
  for (const n of ['weapon:fire', 'player:hit', 'enemy:hit']) G.events.on(n, () => { combatT = 5; });
  G.events.on('player:dash', () => { abDash.classList.remove('pop'); void abDash.offsetWidth; abDash.classList.add('pop'); });
  G.events.on('scan:fire', () => { abScan.classList.remove('pop'); void abScan.offsetWidth; abScan.classList.add('pop'); });
  G.events.on('thunder', (e) => { if (e.delay < 0.35) setTimeout(glitch, e.delay * 1000); });

  // ---------- visor crack: procedural branching fracture in one corner, fades out ----------
  let crackT = 0;
  function visorCrack() {
    const cx = Math.random() < 0.5 ? 80 + Math.random() * 300 : 1220 + Math.random() * 300, cy = 620 + Math.random() * 230;
    let p = ''; const br = (x, y, a, len, w, d) => { let X = x, Y = y; const n = 4 + (Math.random() * 4 | 0); let s = `M${X.toFixed(0)} ${Y.toFixed(0)}`; for (let i = 0; i < n; i++) { a += (Math.random() - 0.5) * 0.9; X += Math.cos(a) * len / n; Y += Math.sin(a) * len / n; s += ` L${X.toFixed(0)} ${Y.toFixed(0)}`; if (d < 2 && Math.random() < 0.35) br(X, Y, a + (Math.random() - 0.5) * 1.6, len * 0.45, w * 0.6, d + 1); } p += `<path d="${s}" stroke-width="${w.toFixed(1)}"/>`; };
    for (let i = 0; i < 7; i++) br(cx, cy, Math.random() * 6.28, 120 + Math.random() * 260, 2.2, 0);
    crack.innerHTML = `<g fill="none" stroke="rgba(255,255,255,.75)" stroke-linecap="round" style="filter:drop-shadow(0 0 2px rgba(0,0,0,.9))">${p}</g><circle cx="${cx}" cy="${cy}" r="10" fill="rgba(255,255,255,.35)"/>`;
    crack.classList.add('on'); crackT = 6;
  }
  function glitch() { el.classList.remove('glitch'); void el.offsetWidth; el.classList.add('glitch'); }
  let alertT = 0;
  function alertMsg(t) { alertTx.textContent = t; alertEl.classList.remove('on'); void alertEl.offsetWidth; alertEl.classList.add('on'); alertT = 1.6; }

  // ---------- radio: queued lines, typed out, squelch on open ----------
  const radQ = []; let radCur = null;
  function say(text, key) { radQ.push({ text, key, dur: Math.max(2.6, text.length * 0.065) }); }
  function radioTick(dt) {
    if (!radCur && radQ.length) { radCur = { ...radQ.shift(), t: 0 }; rad.classList.add('on'); G.audio?.play?.('radio', { gain: 0.5 }); const L = radCur.key ? G.audio?.vo?.(radCur.key, true) : 0; if (L) radCur.dur = L + 0.6; radCur.rate = radCur.text.length / Math.max(0.8, (L || radCur.dur * 0.6)); }
    if (!radCur) { return; }
    radCur.t += dt; const n = Math.min(radCur.text.length, Math.floor(radCur.t * Math.max(30, radCur.rate || 55))); setTx(radTx, radCur.text.slice(0, n));
    const talking = n < radCur.text.length || radCur.t < radCur.dur * 0.8;
    radBars.forEach((b, i) => { b.style.height = talking ? `${25 + 75 * Math.abs(Math.sin(G.time * (9 + i * 3.1) + i))}%` : '30%'; });
    if (radCur.t > radCur.dur) { radCur = null; if (!radQ.length) rad.classList.remove('on'); }
  }
  // ---------- banners and key hints ----------
  // banners queue by priority: an act card (3) is never stepped on, events (2) wait their turn, minor notes (1: a zone
  // name, a pickup, a line coming online) are smaller and only show when nothing more important is up
  const banQ = []; let banUntil = 0, banPri = 0;
  function banner(text, { sub = '', kind = '', dur = 3, pri = 2 } = {}) {
    const now = performance.now() / 1000;
    if (now < banUntil && pri <= banPri) { if (banQ.length < 4) banQ.push([text, { sub, kind, dur, pri }]); banQ.sort((a, b) => b[1].pri - a[1].pri); return; }
    q('.ban b').textContent = text; q('.ban s').textContent = sub; ban.className = 'ban ' + kind + (pri <= 1 ? ' minor' : ''); ban.style.setProperty('--dur', dur + 's'); void ban.offsetWidth; ban.classList.add('on');
    banUntil = now + dur * 0.85; banPri = pri;
  }
  function banTick() { if (banQ.length && performance.now() / 1000 >= banUntil) { const [t, o] = banQ.shift(); banUntil = 0; banner(t, o); } }
  let hintT = 0;
  function hint(pairs, dur = 5) { hintEl.innerHTML = pairs.map(([k, t]) => `<span><span class="kc">${k}</span>${t}</span>`).join(''); hintEl.classList.add('on'); hintT = dur; }
  // power-on sequence (deploy)
  function boot() { el.classList.remove('live'); void el.offsetWidth; el.classList.add('live'); }
  if (G.params.shot) el.classList.add('live');

  // ---------- per-frame ----------
  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Vector3();
  let lastHeading = 0;
  function update(dt) {
    banTick();
    dt = G.realDt || dt;
    const W = G.weapon, p = G.player.s, cam = G.R.camera; if (!W) return;
    const playing = G.flow?.S && ['play', 'extract'].includes(G.flow.S.state);
    el.style.visibility = G.hudHidden ? 'hidden' : '';
    // compass
    const heading = ((-(p.yaw + (p.recoilOffY || 0)) * 180 / Math.PI) % 360 + 360) % 360; lastHeading = heading;
    strip.style.transform = `translateX(${(23 - (heading + 180) * K).toFixed(2)}rem)`;
    const card = CARD[Math.round(heading / 45) * 45 % 360];
    setTx(cmpHd, pad3(heading));
    const marks = G.obj?.marks || [], placed = [];
    marks.forEach((m, i) => {
      const e = markPool[i] || (markPool[i] = mkEl());
      let rel = ((bearing(p.pos, m.p) - heading + 540) % 360) - 180; const edge = Math.abs(rel) > 70; rel = Math.max(-70, Math.min(70, rel));
      if (placed.some((q) => q.k === m.kind && Math.abs(q.r - rel) < 5)) { e.style.opacity = 0; return; } placed.push({ k: m.kind, r: rel }); // two weak points on one bearing: one mark
      e.style.transform = `translateX(${(23 + rel * K).toFixed(2)}rem)`; e.style.opacity = 1;
      const cls = 'mk' + (m.kind ? ' ' + m.kind : '') + (edge ? ' edge' : ''); if (e._c !== cls) { e._c = cls; e.className = cls; }
      setTx(e.children[1], m.label || ''); setTx(e.children[2], `${Math.round(Math.hypot(m.p.x - p.pos.x, m.p.z - p.pos.z))}M`);
    });
    for (let i = marks.length; i < markPool.length; i++) markPool[i].style.opacity = 0;
    let en = 0;
    for (const e of [...(G.enemies?.list || []), ...(G.drones?.list || [])]) {
      if (!e.alive || !(e.scanT > 0 || (G.time - (e.lastShotT ?? -99)) < 1.5)) continue;
      const rel = ((bearing(p.pos, e.root.position) - heading + 540) % 360) - 180; if (Math.abs(rel) > 76) continue;
      const m = enPool[en] || (enPool[en] = enEl()); en++; m.style.opacity = 1; m.style.transform = `translateX(${(23 + rel * K).toFixed(2)}rem)`; m.style.borderTopColor = e.scanT > 0 ? '#62f1ff' : '';
    }
    for (let i = en; i < enPool.length; i++) enPool[i].style.opacity = 0;
    // world-space objective markers (screen-edge clamped when off screen)
    let wi = 0; const onScr = [];
    for (const m of marks) {
      const d = Math.hypot(m.p.x - p.pos.x, m.p.z - p.pos.z); if (d < 3.5 && m.kind !== 'boss') continue;
      const e = wPool[wi] || (wPool[wi] = wEl()); wi++;
      _v.copy(m.p); _v.y = (m.kind === 'boss' ? 9 : (m.p.y || 0) + 2.6); _v.project(cam);
      const behind = _v.z > 1; let x = _v.x * (behind ? -1 : 1), y = _v.y * (behind ? -1 : 1);
      const off = behind || Math.abs(x) > 0.9 || Math.abs(y) > 0.8; if (off) { const k = Math.max(Math.abs(x) / 0.9, Math.abs(y) / 0.8, 1e-3); x /= k; y /= k; if (behind && Math.abs(y) < 0.6) { x = Math.sign(x || 1) * 0.9; } }
      const sx = (x * 0.5 + 0.5) * innerWidth, sy = (-y * 0.5 + 0.5) * innerHeight;
      if (onScr.some((q) => q.k === m.kind && Math.hypot(q.x - sx, q.y - sy) < 90)) { e.style.opacity = 0; continue; } onScr.push({ k: m.kind, x: sx, y: sy }); // overlapping marks of one kind: the nearer one only
      e.style.transform = `translate(${sx.toFixed(0)}px,${sy.toFixed(0)}px)`;
      const ctr = !off && Math.hypot(x * innerWidth / innerHeight, y) < 0.22; // near the crosshair: diamond only, label off, so it never fights the enemy tags
      e.style.opacity = ctr ? 0.55 : 1;
      const cls = 'wmk' + (m.kind ? ' ' + m.kind : '') + (m.kind === 'boss' || d > 12 ? ' pulse' : '') + (ctr ? ' ctr' : ''); if (e._c !== cls) { e._c = cls; e.className = cls; }
      setTx(e.children[1], m.label || ''); setTx(e.querySelector('.nm'), m.name || ''); setTx(e.querySelector('em'), `${Math.round(d)}M`);
    }
    for (let i = wi; i < wPool.length; i++) wPool[i].style.opacity = 0;
    // objective plate
    const O = G.obj;
    if (O) {
      const [an, at] = (O.title || '').split(' // '); setTx(objAn, an || ''); setTx(objAt, at || ''); setTx(objHo, String(G.enemies?.alive ?? 0));
      if (objTx._t !== O.line) { objLn.classList.remove('flash'); void objLn.offsetWidth; objLn.classList.add('flash'); }
      setTx(objTx, O.line || ''); setTx(objCt, O.count ? `${O.count[0]}/${O.count[1]}${O.unit ? ' ' + O.unit : ''}` : '');
      objSub.style.display = O.sub ? 'block' : 'none'; if (O.sub) { setTx(objSubTx, O.sub); objSubPb.style.width = `${Math.round((O.prog || 0) * 100)}%`; }
    }
    // storm clock
    const F = G.flow?.S; const sc = F?.stormClock;
    const counting = sc != null && sc > 0 && !F?.stormFF;
    stormZ.style.transform = `scaleX(${counting ? Math.min(1, sc / 180).toFixed(3) : 0})`; // the bar only under a running countdown
    setTx(stormT, F?.act >= 2 ? 'SANDSTORM' : 'STORM FRONT IN');
    if (sc != null && sc > 0 && F?.stormFF) { setTx(stormV, 'IMMINENT'); stormEl.classList.add('crit'); stormV.classList.add('tx'); } // the front is accelerating: no countdown that jumps
    else if (counting) { const s = Math.ceil(sc); setTx(stormV, `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`); stormEl.classList.toggle('crit', sc < 15); stormV.classList.remove('tx'); }
    else { setTx(stormV, F?.act === 2 ? 'ACTIVE' : F?.act >= 3 ? 'PASSED' : '--:--'); stormEl.classList.toggle('crit', F?.act === 2); stormV.classList.add('tx'); }
    rT -= dt; sweep += dt * 2.6; if (rT <= 0) { rT = 1 / 20; radar(heading); }
    // vitals
    const sh = p.shield ?? 0, shM = p.maxShield || 1;
    shSeg.forEach((b, i) => { const f = Math.max(0, Math.min(1, sh / shM * 4 - i)); set(b.style, 'width', `${(f * 100).toFixed(0)}%`); });
    hpSeg.forEach((b, i) => { const f = Math.max(0, Math.min(1, p.hp / p.maxHp * 10 - i)); set(b.style, 'width', `${(f * 100).toFixed(0)}%`); });
    setTx(hpN, String(Math.ceil(p.hp))); setTx(shN, String(Math.ceil(sh))); vit.classList.toggle('low', p.hp < 35);
    combatT -= dt; const idle = combatT <= 0 && p.hp >= p.maxHp && sh >= shM; vit.classList.toggle('idle', idle); amm.classList.toggle('idle', combatT <= 0);
    const ring = (a, k, label) => { const c = a.querySelector('.c'); set(c.style, 'strokeDashoffset', (100.5 * (1 - k)).toFixed(1)); a.classList.toggle('rdy', k >= 1); setTx(a.querySelector('.cd'), k >= 1 ? '' : label); };
    ring(abDash, p.dashCd ? 1 - Math.max(0, p.dashCd) / p.dashCdMax : 1, `${Math.max(0, p.dashCd || 0).toFixed(1)}`);
    const SC = G.scan?.S; ring(abScan, SC ? 1 - Math.max(0, SC.cd) / SC.cdMax : 1, `${Math.ceil(Math.max(0, SC?.cd || 0))}`);
    const OD = G.od?.S; if (OD) { ring(abOd, OD.active ? 1 - OD.t / OD.dur : OD.charge, OD.active ? '' : `${Math.floor(OD.charge * 100)}`); if (OD.active) odtBar.style.transform = `scaleX(${(1 - OD.t / OD.dur).toFixed(3)})`; }
    // ammo
    setTx(ammB, String(W.S.ammo)); setTx(ammS, `/ ${W.S.reserve}`); const lowA = W.S.ammo <= Math.ceil(W.W.mag * 0.2) && !W.S.reloading; ammC.classList.toggle('low', lowA);
    rlp.classList.toggle('on', lowA && W.S.reserve > 0 && playing && !p.dead);
    glP.forEach((g, i) => g.classList.toggle('f', i < W.S.gl));
    if (!tks.length || tks.length !== W.W.mag) setGun();
    { const k = W.S.charge || 0; chg.classList.toggle('on', k > 0.01 && playing && !p.dead); chg.classList.toggle('full', k >= 1); chgFg.style.strokeDashoffset = (100 - 100 * k).toFixed(1); }
    const reloading = W.S.reloading; tk.classList.toggle('rl', reloading); rl.classList.toggle('on', reloading);
    const fillN = reloading ? Math.floor(Math.min(1, W.S.reloadT / Math.max(0.01, W.S.reloadDur)) * W.W.mag) : W.S.ammo;
    tks.forEach((t, i) => { const on = i < fillN; if (t._on !== on) { t._on = on; t.className = reloading ? (on ? 'f' : '') : (on ? '' : 'e'); } });
    // crosshair
    const fov = cam.fov * Math.PI / 180, H = innerHeight, rp = rem();
    let gap = Math.tan(W.S.spread) / Math.tan(fov / 2) * (H / 2) + 4 + (p.sprinting ? 10 : 0); gap = Math.round(Math.min(70, Math.max(4, gap)) * 2) / 2;
    const L = 0.62 * rp; arms.t.style.top = `${-gap - L}px`; arms.b.style.top = `${gap}px`; arms.l.style.left = `${-gap - L}px`; arms.r.style.left = `${gap}px`;
    xh.style.opacity = W.S.ads > 0.6 || p.dead || !playing ? 0 : 1;
    if (hmT > 0) { hmT -= dt; const k = 1 - hmT / hmDur; const s = hm.className.includes('kill') ? 1.6 : hm.className.includes('weak') ? 1.4 : 1.15; hm.style.opacity = k < 0.35 ? 1 : 1 - (k - 0.35) / 0.65; hm.style.transform = `scale(${k < 0.35 ? s - (s - 1) * k / 0.35 : 1})`; } else hm.style.opacity = 0;
    streakT -= dt;
    // enemy tags: the one under the crosshair + every scanned one
    let ti = 0, onEnemy = false;
    const camPos = cam.getWorldPosition(_c);
    const list = (G.enemies?.list || []).filter((e) => e.alive);
    let aim = null, aimD = 0.075;
    for (const e of list) { _v.copy(e.root.position).setY(1.4).project(cam); if (_v.z > 1) continue; const d = Math.hypot(_v.x * innerWidth / innerHeight, _v.y); if (d < aimD) { aimD = d; aim = e; } }
    if (aim && !G.phys.los(camPos, _w.copy(aim.root.position).setY(1.4))) aim = null;
    if (aim) { aim.seenT = 2; onEnemy = true; }
    for (const e of list) { if (e.seenT > 0) e.seenT -= dt; }
    for (const e of list) {
      if (ti >= tags.length) break; if (e !== aim) continue; // a tag only on what you aim at: the scan shows silhouettes, not a wall of labels
      _v.copy(e.root.position).setY(2.05).project(cam); _w.copy(e.root.position).setY(0.05).project(cam); if (_v.z > 1 || _w.z > 1) continue;
      const tg = tags[ti++]; const x = (_v.x * 0.5 + 0.5) * innerWidth, yTop = (-_v.y * 0.5 + 0.5) * innerHeight, yBot = (-_w.y * 0.5 + 0.5) * innerHeight;
      const h = Math.max(18, yBot - yTop), w = h * 0.5;
      tg.style.transform = `translate(${x.toFixed(0)}px,${yTop.toFixed(0)}px)`; tg.style.opacity = 1; tg.className = 'tag' + (e !== aim ? ' scan' : '');
      const br = tg.firstChild; br.style.cssText = `left:${(-w / 2).toFixed(0)}px;top:0;width:${w.toFixed(0)}px;height:${h.toFixed(0)}px`;
      const lb = tg.children[1]; lb.style.left = `${(w / 2 + 6).toFixed(0)}px`; lb.style.top = `${(-rp * 0.4).toFixed(0)}px`;
      setTx(lb.firstChild, `${NAMES[e.kind] || 'HOSTILE'} ${Math.round(e.root.position.distanceTo(p.pos))}M`);
      lb.lastChild.firstChild.style.width = `${Math.max(0, e.hp / (e.maxHp || 100) * 100).toFixed(0)}%`;
    }
    for (let i = ti; i < tags.length; i++) tags[i].style.opacity = 0;
    xh.classList.toggle('on', onEnemy);
    // interaction prompt
    const U = G.interact; useEl.classList.toggle('on', !!(U && U.near && playing));
    if (U && U.near) { setTx(useB, U.label); usePb.style.width = `${Math.round((U.prog || 0) * 100)}%`; }
    // boss
    const B = G.boss?.S; bossEl.classList.toggle('on', !!(B?.active && !B.dead));
    if (B?.active) { setTx(bossLbl, B.label || 'CLASS-IV SIEGE WALKER'); const n = Math.ceil(B.hp * bossSeg.length); bossSeg.forEach((s, i) => { const f = i < n; if (s._f !== f) { s._f = f; s.className = f ? '' : 'e'; } }); }
    // timers
    radioTick(dt);
    if (hintT > 0) { hintT -= dt; if (hintT <= 0) hintEl.classList.remove('on'); }
    if (crackT > 0) { crackT -= dt; if (crackT <= 0) crack.classList.remove('on'); }
    if (alertT > 0) alertT -= dt;
    speed.style.opacity = Math.min(1, (p.speedFx || 0)).toFixed(2);
  }
  return { update, say, banner, glitch, hint, boot, alert: alertMsg, visorCrack, addFeed, get heading() { return lastHeading; } };
}
