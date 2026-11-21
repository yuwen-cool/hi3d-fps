// Battle report: the game photographs its own best moments while you play (the storm taking a tank, the column coming
// down, the knee going, riding its back, the kill) and the results screen lays the best three out as a poster with the
// run's numbers, ready to save. A shot is the frame as drawn (often a cutscene angle), copied right after rendering,
// so it costs no extra render.
const W = 960, H = 540;
const MOMENTS = { // event -> when to take it (real seconds after), how much it is worth, the caption
  'tank:boom': [0.45, 2, 'STORAGE TANK GOES UP'], 'tower:fall': [1.5, 2, 'THE COLUMN COMES DOWN'], 'boss:spawn': [2.6, 1, 'COLOSSUS SIGHTED'],
  'boss:leg': [1.3, 3, 'LEG DESTROYED'], 'grapple:on': [0.7, 2.5, 'ON ITS BACK'], 'trap:ignite': [1.2, 2, 'THE FLARE LINE IGNITES'],
  'boss:dying': [4.1, 4, 'COLOSSUS DOWN'], // mid death cutscene, as the hull blows (slow motion stretches the first beats) 'player:dead': [0.15, 0.5, 'LAST STAND'],
};
export function createPoster(G) {
  const shots = [], pending = [];
  let clock = 0;
  for (const [ev, [delay, worth, label]] of Object.entries(MOMENTS)) G.events.on(ev, () => {
    if (shots.some((s) => s.ev === ev && worth < 3) || pending.some((p) => p.ev === ev)) return; // one of each kind (the big ones may replace)
    pending.push({ ev, at: clock + delay, worth, label, t: G.flow?.S ? G.flow.S.t - (G.flow.S.startT || 0) : 0 });
  });
  function update() { clock += G.realDt || 1 / 60; }
  // called by the main loop right after the frame is drawn: the drawing buffer still holds it
  function grab() {
    if (!pending.length) return;
    const i = pending.findIndex((p) => clock >= p.at); if (i < 0) return;
    const p = pending.splice(i, 1)[0], src = G.R.renderer.domElement;
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    const sa = src.width / src.height, ta = W / H; let sw = src.width, sh = src.height, sx = 0, sy = 0;
    if (sa > ta) { sw = sh * ta; sx = (src.width - sw) / 2; } else { sh = sw / ta; sy = (src.height - sh) / 2; }
    try { x.drawImage(src, sx, sy, sw, sh, 0, 0, W, H); } catch { return; }
    const old = shots.findIndex((s) => s.ev === p.ev); if (old >= 0) shots.splice(old, 1);
    shots.push({ ...p, c }); shots.sort((a, b) => b.worth - a.worth); shots.length = Math.min(shots.length, 6);
  }
  function best() { return shots.slice(0, 3).sort((a, b) => a.t - b.t); }
  // the poster: one big frame and two small ones, the result, the numbers, the line about Hi3D
  function compose({ kind, time, kills, acc, score, grade }) {
    const P = document.createElement('canvas'); P.width = 1600; P.height = 1200; const x = P.getContext('2d');
    const F = (w, s, f = "'Big Shoulders Display', Impact, sans-serif") => `${w} ${s}px ${f}`, O = '#ff6a14', BONE = '#efe5cf', INK = '#0d0b09';
    x.fillStyle = INK; x.fillRect(0, 0, 1600, 1200);
    const sel = best(), hero = sel.slice().sort((a, b) => b.worth - a.worth)[0], rest = sel.filter((s) => s !== hero);
    const frame = (s, X, Y, w, h, big) => {
      x.save(); x.beginPath(); x.rect(X, Y, w, h); x.clip();
      if (s) x.drawImage(s.c, X, Y, w, h); else { x.fillStyle = '#1a1612'; x.fillRect(X, Y, w, h); }
      const g = x.createLinearGradient(0, Y + h * 0.55, 0, Y + h); g.addColorStop(0, 'rgba(13,11,9,0)'); g.addColorStop(1, 'rgba(13,11,9,0.85)'); x.fillStyle = g; x.fillRect(X, Y, w, h); x.restore();
      x.strokeStyle = 'rgba(239,229,207,0.5)'; x.lineWidth = 2; x.strokeRect(X + 1, Y + 1, w - 2, h - 2);
      if (!s) return;
      x.font = F(900, big ? 46 : 30); const tw = x.measureText(s.label).width, th = big ? 58 : 40, ty = Y + h - th - (big ? 28 : 18);
      for (let k = 0; k < 2; k++) { const hx = k ? X + 24 + 18 + tw + 26 : X + 24; x.save(); x.beginPath(); x.rect(hx, ty, 18, th); x.clip(); x.fillStyle = '#e8b40c'; x.fillRect(hx, ty, 18, th); x.fillStyle = INK; for (let d = -th; d < 30; d += 12) { x.beginPath(); x.moveTo(hx + d, ty + th); x.lineTo(hx + d + 6, ty + th); x.lineTo(hx + d + 6 + th, ty); x.lineTo(hx + d + th, ty); x.fill(); } x.restore(); }
      x.fillStyle = INK; x.fillRect(X + 24 + 18, ty, tw + 26, th); x.fillStyle = O; x.textBaseline = 'middle'; x.fillText(s.label, X + 24 + 18 + 13, ty + th / 2 + 2);
      x.font = F(600, big ? 22 : 18, "'Barlow Condensed', 'Arial Narrow', sans-serif"); x.fillStyle = BONE; x.fillText(`T+${Math.floor(s.t / 60)}:${String(Math.floor(s.t % 60)).padStart(2, '0')}`, X + w - (big ? 110 : 90), ty + th / 2 + 2);
    };
    frame(hero, 40, 150, 1520, 760, true);
    frame(rest[0], 40, 930, 600, 230, false); frame(rest[1], 660, 930, 600, 230, false);
    // header
    x.textBaseline = 'alphabetic'; x.fillStyle = BONE; x.font = F(900, 92); x.fillText('SANDLINE', 40, 112);
    x.font = F(600, 22, "'Barlow Condensed', 'Arial Narrow', sans-serif"); x.fillStyle = O; x.fillText('SECTOR 7 // KHARA BASIN — BATTLE REPORT', 470, 66);
    x.fillStyle = kind === 'won' ? O : '#ff3b2b'; x.font = F(900, 54); x.fillText(kind === 'won' ? 'EXTRACTED' : 'KIA', 470, 112);
    // numbers, stacked down the right of the small frames
    const stats = [['TIME', time], ['KILLS', kills], ['ACCURACY', acc], ['SCORE', score], ['GRADE', grade]];
    stats.forEach(([k, v], i) => { const X = 1280 + (i % 2) * 140, Y = 930 + Math.floor(i / 2) * 78; x.fillStyle = '#1a1612'; x.fillRect(X, Y, 130, 70); x.strokeStyle = 'rgba(239,229,207,0.5)'; x.strokeRect(X + 0.5, Y + 0.5, 129, 69);
      x.fillStyle = 'rgba(239,229,207,0.7)'; x.font = F(600, 15, "'Barlow Condensed', 'Arial Narrow', sans-serif"); x.fillText(k, X + 10, Y + 20); x.fillStyle = O; x.font = F(900, 36, "'Big Shoulders Stencil Display', 'Big Shoulders Display', Impact, sans-serif"); x.fillText(String(v), X + 10, Y + 58); });
    x.fillStyle = 'rgba(239,229,207,0.75)'; x.font = F(600, 18, "'Barlow Condensed', 'Arial Narrow', sans-serif"); x.textAlign = 'right'; x.fillText('EVERY MODEL IN THIS GAME WAS GENERATED WITH HI3D', 1560, 66); x.textAlign = 'left';
    return P;
  }
  return { update, grab, best, compose, get count() { return shots.length; } };
}
