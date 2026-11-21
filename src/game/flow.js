import * as THREE from 'three';

// Match flow. Every step publishes one objective (G.obj) that the HUD shows as a plate line, a compass mark,
// a radar mark and a radio call, so there is always an answer to "what now, and where".
//   DEPLOY  drop into the yard, the helmet powers on.
//   I  DUSK   open valve A across the yard (patrol on it), then hold the yard; the storm clock runs the whole act.
//   II STORM  the front rolls over; two waves inside the sand; lightning takes the storage tank.
//   III NIGHT the colossus walks in from the west; break its two coolant cores; the column falls; extract.
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const SPAWNS = [[-9, -26], [2, -29], [11, -27], [-16, -21], [-3, -18], [8, -12], [-14, -3], [0, -25], [-8, -10], [7, -9], [-12, -6], [12, -7], [0, -14], [-6, -17], [9, -17]];
const WAVES = [{ n: 4, ch: 1 }, { n: 4, ch: 1 }, { n: 5, ch: 2 }, { n: 2, ch: 1 }];
const BOSS_PATH = [V(-33, 0, -16), V(-31, 0, -4), V(-34, 0, -24), V(-31, 0, -10)];
const STORM_CLOCK = 180;
const RADIO = {
  deploy: 'Boots on the ground. Storm front is three minutes out.',
  valve: 'Valve A is across the yard. Open it — we need pressure on the flare line.',
  contact: 'Hostiles on the valve. Clear them.',
  opened: 'Line A is live. Pressure is building. Now hold that yard.',
  inbound: 'More of them coming over the wall. Hold.',
  storm: 'Here it comes. You will not see them in that — use your scan.',
  wave: 'Another group, inside the sand. Ping them before they ping you.',
  passing: 'Storm is passing... wait. Something big on the west ridge.',
  boss: 'That is not on any manifest. Hit the coolant cores on its belly.',
  core: 'One core down! It is venting — hit the other one.',
  dead: 'It is down. Get to extraction, west gate. Go.',
  won: 'Got you. Bringing you home.',
  lateValve: 'Forget the valve — the storm is on you.',
};

export function createFlow(G) {
  const S = { queue: [], state: 'title', act: 0, wave: -1, waveT: 0, kills: 0, t: 0, actT: 0, extract: V(-17, 0, 4), startT: 0, step: 'intro', stormClock: null, cores: 0 };
  const E = () => G.enemies, env = () => G.env?.S, hud = () => G.hud;
  const say = (k) => hud()?.say?.(RADIO[k] || k);
  const valveA = () => G.level.valves?.[0];
  G.obj = null;
  function obj(o) { G.obj = { ...G.obj, ...o }; }
  const later = (sec, fn) => S.queue.push({ t: S.t + sec, fn }); // game-time timers (deterministic in record mode)
  function spawnWave(n, ch = 0, near = null) {
    const pp = G.player.s.pos; const ref = near || pp;
    const cand = SPAWNS.map(([x, z]) => V(x, 0, z)).filter((p) => p.distanceTo(pp) > 11 && !G.phys.blocked(p.x, p.z, 0.45) && (E()?.canReach?.(p, pp) ?? true));
    cand.sort((a, b) => a.distanceTo(ref) - b.distanceTo(ref) + (G.rng() - 0.5) * 14);
    const m = Math.min(n, cand.length);
    for (let i = 0; i < m; i++) S.queue.push({ t: S.t + i * 0.65, fn: () => { const e = E()?.spawn(cand[i], { yaw: Math.atan2(pp.x - cand[i].x, pp.z - cand[i].z), kind: i >= m - ch ? 'charger' : 'rifle' }); if (e) { e.lastKnown = G.player.s.pos.clone(); e.state = 'investigate'; } } });
    S.pending = m; S.waveN = m; S.waveK = S.kills; S.queue.push({ t: S.t + m * 0.65 + 0.05, fn: () => { S.pending = 0; } });
  }
  function setAct(a) { S.act = a; S.actT = 0; G.events.emit('flow:act', { act: a }); }

  // ---------- deploy: drop in from above, land hard, helmet powers on ----------
  function deploy() {
    if (S.state !== 'title') return;
    S.state = 'deploy'; G.camLocked = false; G.cinematic = true;
    const ps = G.player.s, L = G.level.layout; ps.pos.copy(L.spawn); ps.pos.y = 13; ps.vel.set(0, -5, 0); ps.yaw = L.spawnYaw; ps.pitch = -0.32;
    G.R.fx.fade = 1; G.audio?.play?.('deploy', { gain: 0.9 });
    hud()?.hint?.([], 0);
  }
  G.events.on('player:land', (e) => {
    if (S.state !== 'deploy') return;
    G.cinematic = false; G.player.addShake(0.75); G.player.s.dipV -= 2.5;
    const p = G.player.s.pos;
    for (let i = 0; i < 36; i++) { const a = i / 36 * 6.283; G.fxs?.emit(true, { pos: V(p.x + Math.cos(a) * 0.6, 0.15, p.z + Math.sin(a) * 0.6), vel: V(Math.cos(a), 0.15, Math.sin(a)).multiplyScalar(5 + Math.random() * 3), life: 1.4 + Math.random(), size: 0.3, size1: 1.8, col: G.fxs.litColor([0.5, 0.42, 0.32]), alpha: 0.45, soft: true, drag: 2.2 }); }
    hud()?.boot?.(); start();
  });

  function start() {
    if (S.state === 'play') return;
    S.state = 'play'; S.startT = S.t; S.wave = -1; S.waveT = 3; S.step = 'valve'; setAct(1); S.stormClock = STORM_CLOCK;
    Object.assign(env() || {}, { front: 260, storm: 1, night: 0 });
    // patrol on the valve and two in the yard
    const vA = valveA()?.pos || V(-7, 0, -25);
    for (const [p, y] of [[V(vA.x - 2.5, 0, vA.z + 3.2), 2.6], [V(vA.x + 3.2, 0, vA.z + 1.5), -2.2], [V(-5, 0, -12), 0.3], [V(6, 0, -10), -0.4]]) if (!G.phys.blocked(p.x, p.z, 0.45)) E()?.spawn(p, { yaw: y });
    obj({ act: 1, title: 'ACT 1 // DUSK', line: valveA() ? 'OPEN VALVE A' : 'CLEAR THE YARD', count: valveA() ? [0, 1] : null, marks: valveA() ? [{ p: vA, label: 'A' }] : [], sub: null });
    hud()?.banner?.('ACT 1 // DUSK', { sub: 'OPEN VALVE A — HOLD THE YARD', dur: 3.5 });
    later(0.7, () => { say('deploy'); say('valve'); });
    later(2.5, () => hud()?.hint?.([['WASD', 'MOVE'], ['SHIFT', 'DASH'], ['C', 'SLIDE'], ['F', 'MELEE']], 6));
    if (!valveA()) S.step = 'hold';
    G.events.emit('flow:start');
  }
  // ---------- kill feel + bookkeeping ----------
  G.events.on('enemy:killed', () => {
    S.kills++; G.hitstop(0.055); G.player.addShake(0.32);
    if (S.state === 'play' && (E()?.alive ?? 1) === 0 && !S.pending) { G.slowmo(0.9, 0.28); G.events.emit('flow:lastkill'); }
  });
  G.events.on('player:dead', () => { S.state = 'dead'; S.deadT = 0; G.obj = null; });
  G.events.on('boss:core', () => { S.cores++; obj({ count: [S.cores, 2] }); if (S.cores === 1) say('core'); });
  G.events.on('boss:dead', () => { S.bossDead = true; later(1.8, fellTower); });
  G.events.on('scan:fire', () => { S.scanned = true; });
  if (G.params.shot && !G.params.noenemies) setTimeout(start, 0);

  // ---------- valve interaction (hold E) ----------
  const _f = new THREE.Vector3();
  function valveTick(dt) {
    const v = valveA(); if (!v || v.open) { G.interact = null; return; }
    const ps = G.player.s; const d = Math.hypot(ps.pos.x - v.pos.x, ps.pos.z - v.pos.z);
    _f.set(v.top.x - ps.pos.x, 0, v.top.z - ps.pos.z).normalize(); const look = -Math.sin(ps.yaw) * _f.x - Math.cos(ps.yaw) * _f.z;
    const near = d < 2.6 && look > 0.2 && !ps.dead;
    const U = G.interact || (G.interact = { label: 'HOLD — OPEN VALVE A', prog: 0 }); U.near = near;
    const hold = near && (G.input.down('use') || G.auto?.use);
    U.prog = THREE.MathUtils.clamp(U.prog + (hold ? dt / 1.6 : -dt * 1.5), 0, 1);
    if (hold && v.wheel) { v.wheel.rotation.y -= dt * 4.2; if ((S.valveSnd = (S.valveSnd || 0) - dt) <= 0) { S.valveSnd = 1.1; G.audio?.play?.('valve', { pos: v.top, ref: 4, gain: 0.9 }); } }
    if (!S.valveSaid && d < 16) { S.valveSaid = true; if (E()?.list.some((e) => e.alive && e.root.position.distanceTo(v.pos) < 9)) say('contact'); }
    if (U.prog >= 1) {
      v.open = true; G.interact = null; v.lamp.material.color.setRGB(0.6, 5, 1.2);
      G.audio?.play?.('pressure', { pos: v.top, ref: 10, gain: 1.1 }); G.audio?.play?.('objective', { gain: 0.8 }); G.player.addShake(0.25);
      for (let i = 0; i < 24; i++) G.fxs?.emit(true, { pos: v.top.clone().add(V(0, -0.5, 0)), vel: V((Math.random() - 0.5) * 3, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 3), life: 1.6, size: 0.15, size1: 1.2, col: G.fxs.litColor([0.85, 0.85, 0.85]), alpha: 0.35, soft: true, drag: 1.5, rise: 0.8 });
      hud()?.banner?.('PRESSURE LINE A ONLINE', { kind: 'good', dur: 2.8 }); say('opened');
      obj({ count: [1, 1] }); S.step = 'hold'; S.waveT = 2.5; G.events.emit('valve:open', { id: v.id });
    }
  }

  // the distillation column behind the colossus topples toward the yard
  function fellTower() {
    const o = G.level.fallTower; if (!o || S.fell) return; S.fell = { o, t: 0, axis: V(1, 0, 0.25).normalize() };
    G.events.emit('tower:fall', { pos: o.position.clone() });
  }
  function towerTick(dt) {
    const f = S.fell; if (!f || f.done) return; f.t += dt;
    const k = Math.min(1, Math.pow(f.t / 3.2, 2.2)); f.o.rotation.set(0, f.o.rotation.y, 0); f.o.rotateOnWorldAxis(f.axis, k * 1.45);
    if (Math.random() < dt * 20) G.fxs?.emit(true, { pos: f.o.position.clone().add(V((Math.random() - 0.5) * 6, 0.5, (Math.random() - 0.5) * 6)), vel: V((Math.random() - 0.5) * 4, 1.5, (Math.random() - 0.5) * 4), life: 3, size: 1, size1: 4, col: G.fxs.litColor([0.3, 0.24, 0.18]), alpha: 0.5, soft: true, drag: 1 });
    if (k >= 1) { f.done = true; const hit = f.o.position.clone().add(V(0, 0, 14)); G.explosives?.blast(hit, 1.6, 6, 0); G.player.addShake(0.9); for (let i = 0; i < 40; i++) { const a = Math.random() * 6.28; G.fxs?.emit(true, { pos: V(hit.x + Math.cos(a) * 4, 0.4, hit.z + Math.sin(a) * 10), vel: V(Math.cos(a), 0.2, Math.sin(a)).multiplyScalar(6 + Math.random() * 6), life: 3 + Math.random() * 2, size: 1, size1: 5, col: G.fxs.litColor([0.45, 0.35, 0.25]), alpha: 0.55, soft: true, drag: 1.5 }); } G.events.emit('tower:down', {}); }
  }

  function toStorm(late) {
    setAct(2); S.stormClock = 0; S.wave = Math.max(S.wave, 0); S.waveT = 6;
    if (late && valveA() && !valveA().open) { say('lateValve'); valveA().open = true; G.interact = null; }
    obj({ act: 2, title: 'ACT 2 // SANDSTORM', line: 'SURVIVE THE STORM', count: [0, 2], marks: [], sub: null });
    hud()?.banner?.('SANDSTORM', { kind: 'crit', sub: 'VISIBILITY LOST — USE YOUR SCAN', dur: 3.5 }); G.audio?.play?.('alarm', { gain: 0.7 });
    say('storm'); later(3, () => { if (!S.scanned) hud()?.hint?.([['Q', 'SCAN PULSE']], 7); });
  }

  const lerp = THREE.MathUtils.lerp, sstep = THREE.MathUtils.smoothstep;
  let fadeIn = 0;
  function update(dt) {
    S.t += dt; S.actT += dt;
    for (let i = S.queue.length - 1; i >= 0; i--) if (S.queue[i].t <= S.t) { const q = S.queue.splice(i, 1)[0]; q.fn(); }
    if (S.state === 'deploy' || (S.state === 'play' && G.R.fx.fade > 0)) { fadeIn += dt; G.R.fx.fade = Math.max(0, 1 - fadeIn / 0.9); }
    towerTick(dt);
    // supply crates: ammo, grenades and health
    for (const c of G.level.crates || []) if (c.distanceTo(G.player.s.pos) < 2.2 && !(c.cdT > S.t)) { const a = G.weapon?.resupply(), h = G.player.heal?.(50); if (a || h) { c.cdT = S.t + 1.5; hud()?.addFeed?.('SUPPLY CRATE', h ? '+AMMO +HP' : '+AMMO'); } }
    if (S.state === 'dead') { S.deadT += dt; return; }
    if (S.state !== 'play' && S.state !== 'extract') return;
    const ev = env(), alive = E()?.alive ?? 0, clear = alive === 0 && !S.pending;
    // ---- act I ----
    if (S.act === 1) {
      S.stormClock = Math.max(0, S.stormClock - dt);
      if (ev) ev.front = 150 + 110 * (S.stormClock / STORM_CLOCK);
      if (S.step === 'valve') valveTick(dt);
      else if (S.step === 'hold') {
        if (S.wave < 0 && clear) { S.waveT -= dt; if (S.waveT <= 0) { S.wave = 0; spawnWave(WAVES[0].n, WAVES[0].ch); say('inbound'); hud()?.banner?.('HOSTILES INBOUND', { kind: 'crit', dur: 2.4 }); obj({ line: 'HOLD THE YARD', count: [0, WAVES[0].n], marks: [] }); } }
        else if (S.wave === 0) { obj({ count: [Math.min(S.waveN, S.kills - S.waveK), S.waveN] }); if (clear) { S.step = 'storm'; S.stormClock = Math.min(S.stormClock, 8); hud()?.banner?.('SANDSTORM INBOUND', { kind: 'crit', dur: 3 }); obj({ line: 'GET TO COVER', count: null }); } }
      }
      if (S.stormClock <= 0) toStorm(S.step === 'valve');
    // ---- act II: front sweeps over (~24 s); waves 2 and 3 inside the storm; lightning takes the tank ----
    } else if (S.act === 2) {
      if (ev) ev.front = lerp(150, -140, sstep(S.actT, 0, 24));
      if (S.actT > 9 && !S.tankHit) { S.tankHit = true; const tk = G.level.explosives.find((o) => o.userData.explosive?.big); if (tk) { G.env?.strike(tk.position.clone().setY(30)); later(0.12, () => G.explosives?.hurt(tk, 9999)); } }
      if (S.wave >= 1) obj({ count: [S.wave - 1 + (clear ? 1 : 0), 2] });
      if (clear) {
        S.waveT -= dt;
        if (S.waveT <= 0) {
          if (S.wave < 2) { S.wave++; spawnWave(WAVES[S.wave].n, WAVES[S.wave].ch); if (S.wave === 2) say('wave'); hud()?.banner?.(`WAVE ${S.wave} / 2`, { kind: 'crit', dur: 2.2 }); S.waveT = 3; }
          else if (S.actT > 24) toNight();
        }
      }
      if (S.act === 2 && S.actT > 120) toNight();
    // ---- act III: night falls on the burning yard; the colossus comes ----
    } else if (S.act === 3) {
      if (ev) { ev.night = sstep(S.actT, 0, 10); ev.storm = lerp(1, 0.3, sstep(S.actT, 0, 10)); ev.front = Math.min(ev.front, -140); }
      if (S.actT > 6 && !S.bossIn) {
        S.bossIn = true; G.boss?.spawn(V(-75, 0, -14), Math.PI / 2, BOSS_PATH); spawnWave(WAVES[3].n, WAVES[3].ch);
        hud()?.banner?.('WARNING // MASSIVE CONTACT', { kind: 'crit', sub: 'COLOSSUS — CLASS-IV SIEGE WALKER', dur: 4 }); G.audio?.play?.('alarm', { gain: 0.9 });
        say('boss'); obj({ line: 'DESTROY THE COOLANT CORES', count: [0, 2] });
      }
      const B = G.boss?.S; if (B?.active && !B.dead) obj({ marks: [{ p: B.pos, label: '!', kind: 'boss' }] });
      if (S.bossDead && clear && S.state === 'play' && (S.fell?.done || !G.level.fallTower)) {
        S.state = 'extract'; say('dead'); hud()?.banner?.('COLOSSUS DESTROYED', { kind: 'good', sub: 'REACH EXTRACTION — WEST GATE', dur: 3.5 });
        obj({ line: 'REACH EXTRACTION', count: null, marks: [{ p: S.extract, label: 'X', kind: 'ext' }] }); G.events.emit('flow:extract');
      }
    }
    if (S.state === 'extract' && G.player.s.pos.distanceTo(S.extract) < 3) { S.state = 'won'; say('won'); G.obj = null; G.events.emit('flow:won'); }
  }
  function toNight() {
    if (S.act !== 2) return; S.wave = 2; setAct(3); S.waveT = 7;
    obj({ act: 3, title: 'ACT 3 // NIGHT', line: 'STAND BY', count: null, marks: [] }); say('passing');
    hud()?.banner?.('ACT 3 // NIGHT', { sub: 'THE STORM PASSES', dur: 3 });
  }
  return { update, S, start, deploy, setAct, fellTower };
}
