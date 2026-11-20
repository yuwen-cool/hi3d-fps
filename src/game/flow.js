import * as THREE from 'three';

// Match flow in three acts. The waves gate progress; the environment is animated between them.
//   I  DUSK   patrol + wave 1 under the low sun; the sand wall stands on the horizon and creeps in.
//   II STORM  the front rolls over the refinery; waves 2-3 are fought in the sand by visor light,
//             tracers and lightning — one strike hits the storage tank by the spawn and it goes up.
//   III FIRE  the storm passes into night, the refinery burns, the colossus walks out of the desert.
//             Kill it, the distillation column comes down, then reach extraction.
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const SPAWNS = [[-9, -26], [2, -29], [11, -27], [-16, -21], [-3, -18], [8, -12], [-14, -3], [0, -25], [-8, -10], [7, -9], [-12, -6], [12, -7], [0, -14], [-6, -17], [9, -17]];
const WAVES = [{ n: 3, ch: 0 }, { n: 4, ch: 1 }, { n: 5, ch: 2 }, { n: 2, ch: 1 }];
// west side: only a 2.4 m wall between it and the yard, so the whole machine is in view
const BOSS_PATH = [V(-33, 0, -16), V(-31, 0, -4), V(-34, 0, -24), V(-31, 0, -10)];

export function createFlow(G) {
  const S = { state: 'title', act: 0, wave: -1, waveT: 0, kills: 0, t: 0, actT: 0, extract: V(-17, 0, 4), msg: '', msgT: 0, startT: 0, step: 'intro' };
  const E = () => G.enemies, env = () => G.env?.S;
  function say(m, t = 3) { S.msg = m; S.msgT = t; G.events.emit('flow:msg', { m, t }); }
  function spawnWave(n, ch = 0) {
    const pp = G.player.s.pos; const cand = SPAWNS.map(([x, z]) => V(x, 0, z)).filter((p) => p.distanceTo(pp) > 10 && !G.phys.blocked(p.x, p.z, 0.45) && (E()?.canReach?.(p, pp) ?? true));
    cand.sort(() => G.rng() - 0.5);
    for (let i = 0; i < n && i < cand.length; i++) setTimeout(() => { const e = E()?.spawn(cand[i], { yaw: Math.atan2(pp.x - cand[i].x, pp.z - cand[i].z), kind: i >= n - ch ? 'charger' : 'rifle' }); if (e) { e.lastKnown = pp.clone(); e.state = 'investigate'; } }, i * 700);
    S.pending = n; setTimeout(() => { S.pending = 0; }, n * 700 + 50);
  }
  function setAct(a) { S.act = a; S.actT = 0; G.events.emit('flow:act', { act: a }); }
  function start() {
    if (S.state === 'play') return;
    S.state = 'play'; S.startT = S.t; S.wave = -1; S.waveT = 3; S.step = 'act1'; setAct(1);
    Object.assign(env() || {}, { front: 260, storm: 1, night: 0 });
    E()?.spawn(V(-5, 0, -12), { yaw: 0.3 }); E()?.spawn(V(6, 0, -10), { yaw: -0.4 });
    say('CLEAR THE REFINERY', 3.5);
    G.events.emit('flow:start');
  }
  // kill feel: a few frames of hitstop and a shake on every kill, slow motion on the wave's last one
  G.events.on('enemy:killed', () => {
    S.kills++; G.hitstop(0.055); G.player.addShake(0.32);
    if (S.state === 'play' && (E()?.alive ?? 1) === 0 && !S.pending) { G.slowmo(0.9, 0.28); G.events.emit('flow:lastkill'); }
  });
  G.events.on('player:dead', () => { S.state = 'dead'; S.deadT = 0; say('KIA — CLICK TO RETRY', 99); });
  G.events.on('boss:dead', () => { S.bossDead = true; setTimeout(fellTower, 1800); });
  addEventListener('mousedown', () => { if (S.state === 'title') start(); else if (S.state === 'dead' && S.deadT > 1.5) location.reload(); });
  if (G.params.shot && !G.params.noenemies) setTimeout(start, 0);

  // the distillation column behind the colossus topples toward the yard
  function fellTower() {
    const o = G.level.fallTower; if (!o || S.fell) return; S.fell = { o, t: 0, axis: V(1, 0, 0.25).normalize() };
    G.events.emit('tower:fall', { pos: o.position.clone() }); say('', 0);
  }
  function towerTick(dt) {
    const f = S.fell; if (!f || f.done) return; f.t += dt;
    const k = Math.min(1, Math.pow(f.t / 3.2, 2.2)); f.o.rotation.set(0, f.o.rotation.y, 0); f.o.rotateOnWorldAxis(f.axis, k * 1.45);
    if (Math.random() < dt * 20) G.fxs?.emit(true, { pos: f.o.position.clone().add(V((Math.random() - 0.5) * 6, 0.5, (Math.random() - 0.5) * 6)), vel: V((Math.random() - 0.5) * 4, 1.5, (Math.random() - 0.5) * 4), life: 3, size: 1, size1: 4, col: G.fxs.litColor([0.3, 0.24, 0.18]), alpha: 0.5, soft: true, drag: 1 });
    if (k >= 1) { f.done = true; const hit = f.o.position.clone().add(V(0, 0, 14)); G.explosives?.blast(hit, 1.6, 6, 0); G.player.addShake(0.9); for (let i = 0; i < 40; i++) { const a = Math.random() * 6.28; G.fxs?.emit(true, { pos: V(hit.x + Math.cos(a) * 4, 0.4, hit.z + Math.sin(a) * 10), vel: V(Math.cos(a), 0.2, Math.sin(a)).multiplyScalar(6 + Math.random() * 6), life: 3 + Math.random() * 2, size: 1, size1: 5, col: G.fxs.litColor([0.45, 0.35, 0.25]), alpha: 0.55, soft: true, drag: 1.5 }); } G.events.emit('tower:down', {}); }
  }

  const lerp = THREE.MathUtils.lerp, sstep = THREE.MathUtils.smoothstep;
  function update(dt) {
    S.t += dt; S.actT += dt; if (S.msgT > 0) S.msgT -= dt;
    towerTick(dt);
    // supply crates
    for (const c of G.level.crates || []) if (c.distanceTo(G.player.s.pos) < 2.2 && G.weapon?.resupply()) say('RESUPPLIED', 1.5);
    if (S.state === 'dead') { S.deadT += dt; return; }
    if (S.state !== 'play' && S.state !== 'extract') return;
    const ev = env(), alive = E()?.alive ?? 0, clear = alive === 0 && !S.pending;
    // ---- act I: the wall creeps in while the player clears patrol + wave 1 ----
    if (S.act === 1) {
      if (ev) ev.front = Math.max(150, ev.front - dt * 2.2);
      if (clear) {
        S.waveT -= dt;
        if (S.waveT <= 0) {
          if (S.wave < 0) { S.wave = 0; spawnWave(WAVES[0].n, WAVES[0].ch); say('WAVE 1 / 3', 2.5); S.waveT = 3; }
          else { setAct(2); say('SANDSTORM INBOUND', 3.5); S.waveT = 6; }
        }
      }
      if (S.act === 1 && S.actT > 90) { S.wave = Math.max(S.wave, 0); setAct(2); say('SANDSTORM INBOUND', 3.5); S.waveT = 4; } // the storm does not wait
    // ---- act II: front sweeps over (~22 s), waves 2 and 3 inside the storm; lightning takes the tank ----
    } else if (S.act === 2) {
      if (ev) ev.front = lerp(150, -140, sstep(S.actT, 0, 24));
      if (S.actT > 9 && !S.tankHit) { S.tankHit = true; const tk = G.level.explosives.find((o) => o.userData.explosive?.big); if (tk) { G.env?.strike(tk.position.clone().setY(30)); setTimeout(() => G.explosives?.hurt(tk, 9999), 120); } }
      if (clear) {
        S.waveT -= dt;
        if (S.waveT <= 0) {
          if (S.wave < 2) { S.wave++; spawnWave(WAVES[S.wave].n, WAVES[S.wave].ch); say(`WAVE ${S.wave + 1} / 3`, 2.5); S.waveT = 3; }
          else if (S.actT > 24) { setAct(3); say('THE STORM PASSES', 3); S.waveT = 7; }
        }
      }
      if (S.act === 2 && S.actT > 110) { S.wave = 2; setAct(3); say('THE STORM PASSES', 3); S.waveT = 7; }
    // ---- act III: night falls on the burning yard; the colossus comes ----
    } else if (S.act === 3) {
      if (ev) { ev.night = sstep(S.actT, 0, 10); ev.storm = lerp(1, 0.3, sstep(S.actT, 0, 10)); ev.front = Math.min(ev.front, -140); }
      if (S.actT > 6 && !S.bossIn) { S.bossIn = true; G.boss?.spawn(V(-75, 0, -14), Math.PI / 2, BOSS_PATH); spawnWave(WAVES[3].n, WAVES[3].ch); say('CONTACT — COLOSSUS', 4); }
      if (S.bossDead && clear && S.state === 'play' && (S.fell?.done || !G.level.fallTower)) { S.state = 'extract'; say('AREA CLEAR — REACH EXTRACTION', 4); G.events.emit('flow:extract'); }
    }
    if (S.state === 'extract' && G.player.s.pos.distanceTo(S.extract) < 3) { S.state = 'won'; say(`EXTRACTED — ${S.kills} KILLS — ${Math.round(S.t - S.startT)}s`, 99); G.events.emit('flow:won'); }
  }
  return { update, S, start, say, setAct, fellTower };
}
