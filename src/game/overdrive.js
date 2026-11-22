// OVERDRIVE (X): charged by kills. For 8 seconds the robots run at a third of real time, every one of them is
// outlined through walls and dust, the rifle throws plasma (double damage, faster, almost no recoil), and the
// world drains to a cold blue except for heat. It opens with a shockwave that throws nearby robots back.
export function createOverdrive(G) {
  const THREE = G.THREE;
  const S = { charge: 0, active: false, t: 0, dur: 8, readySaid: false };
  const gain = (n) => { if (!S.active) S.charge = Math.min(1, S.charge + n); };
  G.events.on('enemy:killed', (e) => gain(e.melee ? 0.3 : e.weak ? 0.24 : 0.17));
  G.events.on('boss:core', () => gain(0.5));
  function activate() {
    if (S.active || S.charge < 1) return;
    S.active = true; S.t = 0; S.charge = 0; G.enemyTime = 0.3; G.events.emit('od:start');
    G.audio?.vo?.('overdrive'); G.audio?.play?.('scan', { gain: 1, rate: 0.7 }); G.audio?.play?.('bigBoom', { gain: 0.5, rate: 1.4 });
    G.player.addShake(0.5); G.hitstop(0.04); G.R.fx.flash = 1;
    // shockwave: a ring of light and dust from the player, robots close by are thrown back
    const p = G.player.s.pos;
    for (let i = 0; i < 90; i++) { const a = i / 90 * Math.PI * 2; G.fxs?.emit(false, { pos: new THREE.Vector3(p.x + Math.cos(a) * 1.2, 0.25, p.z + Math.sin(a) * 1.2), vel: new THREE.Vector3(Math.cos(a), 0.03, Math.sin(a)).multiplyScalar(24), life: 0.4, size: 0.06, size1: 0.02, stretch: 0.9, col: [4, 14, 20], drag: 1.2 }); }
    for (let i = 0; i < 30; i++) { const a = Math.random() * Math.PI * 2; G.fxs?.emit(true, { pos: new THREE.Vector3(p.x, 0.2, p.z), vel: new THREE.Vector3(Math.cos(a), 0.1, Math.sin(a)).multiplyScalar(8 + Math.random() * 5), life: 1.2, size: 0.4, size1: 2, col: G.fxs.litColor([0.5, 0.45, 0.4]), alpha: 0.4, soft: true, drag: 2.5 }); }
    for (const e of G.enemies?.list || []) {
      if (!e.alive) continue; const d = e.root.position.distanceTo(p); if (d > 10) continue;
      const dir = e.root.position.clone().sub(p).setY(0).normalize(); e.stagT = 1.2; e.knockV.copy(dir).multiplyScalar(14 * (1 - d / 12));
    }
  }
  function update() {
    const dt = G.realDt || 1 / 60, live = !G.player.s.dead && !G.cinematic && ['play', 'extract'].includes(G.flow?.S.state);
    if (live && (G.input.pressed('ult') || G.auto?.ult)) { if (G.auto) G.auto.ult = false; activate(); }
    if (!S.readySaid && S.charge >= 1 && live) { S.readySaid = true; G.audio?.play?.('shieldUp', { gain: 0.6, rate: 1.3 }); }
    if (S.charge < 1) S.readySaid = false;
    if (S.active) {
      S.t += dt; const k = S.t / S.dur;
      for (const e of G.enemies?.list || []) if (e.alive) e.scanT = Math.max(e.scanT || 0, 0.6);
      G.R.fx.over = Math.min(1, S.t * 5) * (k > 0.88 ? (1 - k) / 0.12 : 1) * (1 - 0.5 * (G.env?.S.inside || 0)); // on top of the storm's own grade it went near-black
      if (S.t >= S.dur || G.player.s.dead) { S.active = false; G.enemyTime = 1; G.R.fx.over = 0; G.events.emit('od:end'); G.audio?.play?.('scan', { gain: 0.5, rate: 1.5 }); }
    }
  }
  return { update, S, activate, get active() { return S.active; } };
}
