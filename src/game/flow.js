import * as THREE from 'three';

// Match flow: title -> intro -> patrol + 3 waves -> extraction. Death -> retry.
const SPAWNS = [[-9, -26], [2, -29], [11, -27], [-16, -21], [17, -21], [-3, -18], [8, -12], [-14, -3], [16, -3], [0, -25]];
const WAVES = [{ n: 2 }, { n: 3 }, { n: 4 }];

export function createFlow(G) {
  const S = { state: G.params.shot ? 'play' : 'title', wave: -1, waveT: 0, kills: 0, t: 0, extract: new THREE.Vector3(-17, 0, 4), msg: '', msgT: 0, startT: 0 };
  const E = () => G.enemies;
  function say(m, t = 3) { S.msg = m; S.msgT = t; G.events.emit('flow:msg', { m, t }); }
  function spawnWave(n) {
    const pp = G.player.s.pos; const cand = SPAWNS.map(([x, z]) => new THREE.Vector3(x, 0, z)).filter((p) => p.distanceTo(pp) > 16 && !G.phys.blocked(p.x, p.z, 0.45));
    cand.sort(() => G.rng() - 0.5);
    for (let i = 0; i < n && i < cand.length; i++) setTimeout(() => { const e = E()?.spawn(cand[i], { yaw: Math.atan2(pp.x - cand[i].x, pp.z - cand[i].z) }); if (e && S.wave > 0) { e.lastKnown = pp.clone(); e.state = 'investigate'; } }, i * 850);
  }
  function start() {
    if (S.state === 'play') return;
    S.state = 'play'; S.startT = S.t; S.wave = -1; S.waveT = 3;
    // opening patrol: two robots wandering in the far yard
    E()?.spawn(new THREE.Vector3(-6, 0, -24), { yaw: 0.3 }); E()?.spawn(new THREE.Vector3(6, 0, -22), { yaw: -0.4 });
    say('CLEAR THE REFINERY', 3.5);
    G.events.emit('flow:start');
  }
  G.events.on('enemy:killed', () => { S.kills++; });
  G.events.on('player:dead', () => { S.state = 'dead'; S.deadT = 0; say('KIA — CLICK TO RETRY', 99); });
  addEventListener('mousedown', () => { if (S.state === 'title') start(); else if (S.state === 'dead' && S.deadT > 1.5) location.reload(); });
  if (G.params.shot && !G.params.noenemies) setTimeout(start, 0);
  function update(dt) {
    S.t += dt; if (S.msgT > 0) S.msgT -= dt;
    if (S.state === 'dead') { S.deadT += dt; return; }
    if (S.state !== 'play') return;
    const alive = E()?.alive ?? 0;
    if (alive === 0) {
      S.waveT -= dt;
      if (S.waveT <= 0) {
        S.wave++;
        if (S.wave < WAVES.length) { spawnWave(WAVES[S.wave].n); say(`WAVE ${S.wave + 1} / ${WAVES.length}`, 2.5); S.waveT = 4; }
        else if (S.state === 'play') { S.state = 'extract'; say('AREA CLEAR — REACH EXTRACTION', 4); G.events.emit('flow:extract'); }
      }
    }
    if (S.state === 'extract' && G.player.s.pos.distanceTo(S.extract) < 3) { S.state = 'won'; say(`EXTRACTED — ${S.kills} KILLS — ${Math.round(S.t - S.startT)}s`, 99); G.events.emit('flow:won'); }
  }
  return { update, S, start, say };
}
