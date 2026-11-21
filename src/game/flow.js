import * as THREE from 'three';

// Match flow. Every step publishes one objective (G.obj) that the HUD shows as a plate line, a compass mark,
// a radar mark and a radio call, so there is always an answer to "what now, and where".
//   DEPLOY  drop into the yard, the helmet powers on.
//   I  DUSK   open valve A across the yard (patrol on it), then hold the yard; the storm clock runs the whole act.
//   II STORM  the front rolls over; two waves inside the sand; lightning takes the storage tank.
//   III NIGHT the colossus walks in from the west; break its two coolant cores; the column falls; extract.
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const SPAWNS = [[-9, -26], [2, -29], [11, -27], [-16, -21], [-3, -18], [8, -12], [-14, -3], [0, -25], [-8, -10], [7, -9], [-12, -6], [12, -7], [0, -14], [-6, -17], [9, -17]];
// n robots (ch of them chargers, hv shield heavies) + dr drones over the wall
const WAVES = [{ n: 4, ch: 1 }, { n: 3, ch: 1, dr: 3 }, { n: 4, ch: 1, hv: 1, dr: 2 }, { n: 2, ch: 1, dr: 2 }];
const BOSS_PATH = [V(-33, 0, -16), V(-31, 0, -4), V(-34, 0, -24), V(-31, 0, -10)];
const STORM_CLOCK = 180;
// the dropship settles over the pad nose-west (wings across the wall line), belly ~3.4 m up; the boarding shot is taken from inside the yard
const SHIP = { hover: V(-19, 3.4, 4), yaw: Math.PI / 2, cam0: V(-6, 1.8, -6), cam1: V(-8, 2.4, -3) };
const ease = (t) => t * t * (3 - 2 * t);
const RADIO = {
  deploy: 'Boots on the ground. Storm front is three minutes out.',
  valve: 'Valve A is across the yard. Open it — we need pressure on the flare line.',
  contact: 'Hostiles on the valve. Clear them.',
  opened: 'Line A is live. Pressure is building. Now hold that yard.',
  inbound: 'More of them coming over the wall. Hold.',
  storm: 'Here it comes. You will not see them in that — use your scan.',
  wave: 'Another group, inside the sand. Ping them before they ping you.',
  passing: 'Storm is passing... wait. Something big on the west ridge.',
  boss: 'That is not on any manifest. Its cores are armoured — take out a knee.',
  legdown: 'Leg is gone! The armour blew — the cores are open, hit them!',
  overload: 'It is overloading — it is stuck on the flare line. Light it. Now!',
  core: 'One core down! It is venting — hit the other one.',
  dead: "It's down. Dropship is on the way — get to the pad.",
  won: 'Got you. Bringing you home.',
  shipIn: "Dropship is on approach. Hold at the pad, it's coming in hot.",
  board: 'Ramp is down! Get aboard, now!',
  pod: 'Sending you a lance. Drop pod on your position — grab it.',
  heavy: 'Shield unit! Get behind it, or put a lance through it.',
  drones: 'Drones over the wall! Watch the sky — they dive.',
  lateValve: 'Forget the valve — the storm is on you.',
  horizon: 'Eyes west. Something is walking out there.',
};
const STORM_DIR = new THREE.Vector2(-0.627, -0.779); // where the storm (and the thing inside it) comes from

export function createFlow(G) {
  const S = { queue: [], state: 'title', act: 0, wave: -1, waveT: 0, kills: 0, t: 0, actT: 0, extract: V(-17, 0, 4), startT: 0, step: 'intro', stormClock: null, cores: 0 };
  const E = () => G.enemies, env = () => G.env?.S, hud = () => G.hud;
  const say = (k) => hud()?.say?.(RADIO[k] || k, RADIO[k] ? k : null);
  // is a world point on screen and not hidden behind geometry?
  const _iv = new THREE.Vector3(), _ce = new THREE.Vector3();
  function inView(p, m = 0.8) { const cam = G.R.camera; _iv.copy(p).project(cam); if (_iv.z > 1 || Math.abs(_iv.x) > m || Math.abs(_iv.y) > m) return false; return G.phys.los(cam.getWorldPosition(_ce), p); }
  const valveA = () => G.level.valves?.[0];
  G.obj = null;
  function obj(o) { G.obj = { ...G.obj, ...o }; }
  const later = (sec, fn) => S.queue.push({ t: S.t + sec, fn }); // game-time timers (deterministic in record mode)
  const hostiles = () => (E()?.alive ?? 0) + (G.drones?.alive ?? 0);
  function spawnWave(n, ch = 0, near = null, { hv = 0, dr = 0 } = {}) {
    const pp = G.player.s.pos; const ref = near || pp;
    const cand = SPAWNS.map(([x, z]) => V(x, 0, z)).filter((p) => p.distanceTo(pp) > 11 && !G.phys.blocked(p.x, p.z, 0.45) && (E()?.canReach?.(p, pp) ?? true));
    cand.sort((a, b) => a.distanceTo(ref) - b.distanceTo(ref) + (G.rng() - 0.5) * 14);
    const m = Math.min(n, cand.length);
    for (let i = 0; i < m; i++) S.queue.push({ t: S.t + i * 0.65, fn: () => { const e = E()?.spawn(cand[i], { yaw: Math.atan2(pp.x - cand[i].x, pp.z - cand[i].z), kind: i < hv ? 'heavy' : i >= m - ch ? 'charger' : 'rifle' }); if (e) { e.lastKnown = G.player.s.pos.clone(); e.state = 'investigate'; } } });
    // drones come in high over the wall from the storm side, a beat apart
    const nd = G.drones ? dr : 0;
    for (let i = 0; i < nd; i++) S.queue.push({ t: S.t + 1.2 + i * 0.8, fn: () => { const a = Math.atan2(STORM_DIR.y, STORM_DIR.x) + (i - (nd - 1) / 2) * 0.5, p = G.player.s.pos; G.drones.spawn(V(p.x + Math.cos(a) * 34, 15 + i, p.z + Math.sin(a) * 34)); } });
    if (hv) later(2.2, () => say('heavy')); else if (nd) later(1.5, () => say('drones'));
    const tot = m + nd, last = Math.max(m * 0.65, nd ? 1.2 + nd * 0.8 : 0);
    S.pending = tot; S.waveN = tot; S.waveK = S.kills; S.queue.push({ t: S.t + last + 0.05, fn: () => { S.pending = 0; } });
  }
  function setAct(a) { S.act = a; S.actT = 0; G.events.emit('flow:act', { act: a }); }

  // ---------- deploy: drop in from above, land hard, helmet powers on ----------
  function deploy() {
    if (S.state !== 'title') return;
    S.state = 'deploy'; G.camLocked = false; G.cinematic = true;
    const ps = G.player.s, L = G.level.layout; ps.pos.copy(L.spawn); ps.pos.y = 13; ps.vel.set(0, -5, 0); ps.yaw = L.spawnYaw; ps.pitch = -0.32;
    G.R.fx.fade = 1; G.audio?.play?.('deploy', { gain: 0.9 }); G.ship?.deploy();
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
    obj({ act: 1, title: 'ACT 1 // DUSK', line: valveA() ? 'OPEN VALVE A' : 'CLEAR THE YARD', count: valveA() ? [0, 1] : null, marks: valveA() ? [{ p: vA, label: 'A', name: 'VALVE A' }] : [], sub: null });
    hud()?.banner?.('ACT 1 // DUSK', { sub: 'OPEN VALVE A — HOLD THE YARD', dur: 3.5 });
    later(0.7, () => { say('deploy'); say('valve'); });
    // the colossus is already out there: a silhouette walking along the storm front, lit by the lightning
    later(9, () => {
      if (S.act !== 1) return;
      // out in the open desert to the west (low wall, nothing in the way), pacing north-south along the dunes
      const a = V(-82, 0, -50), b = V(-82, 0, 30);
      G.boss?.spawnDistant(a.clone().lerp(b, 0.4), 0, [b, a], 2.3); S.horizon = { t: 0, said: false, bolt: 2 };
    });
    later(2.5, () => hud()?.hint?.([['WASD', 'MOVE'], ['SHIFT', 'DASH'], ['C', 'SLIDE'], ['F', 'MELEE']], 6));
    if (!valveA()) S.step = 'hold';
    G.events.emit('flow:start');
  }
  // ---------- the lance arrives: a drop pod falls out of the sky into the yard, burning, and the player picks it up ----------
  async function dropPod() {
    if (S.pod || !G.weapon?.kits?.some((k) => k.key === 'lance')) return;
    const pp = G.player.s.pos, spots = [V(-2, 0, -12), V(1, 0, -5), V(-6, 0, -8), V(4, 0, -16), V(-10, 0, -14)].filter((p) => !G.phys.blocked(p.x, p.z, 1.2, 0, 3));
    const at = spots.sort((a, b) => Math.abs(a.distanceTo(pp) - 8) - Math.abs(b.distanceTo(pp) - 8))[0] || pp.clone().add(V(0, 0, -6));
    const { instance } = await import('../world/assets.js'); const m = await instance('drop_pod');
    m.position.set(at.x + 18, 90, at.z - 30); m.rotation.y = G.rng() * 6; G.R.scene.add(m);
    const beacon = new THREE.PointLight(0x7fd0ff, 0, 7, 2); beacon.position.set(at.x, 1.6, at.z); G.R.scene.add(beacon); G.R.volLights.push(beacon);
    S.pod = { m, at, from: m.position.clone(), t: 0, landed: false, beacon, taken: false };
    say('pod'); G.audio?.play?.('shipPass', { gain: 0.9, rate: 1.6, pos: m.position.clone(), ref: 30, roll: 0.3 });
  }
  function podTick(dt) {
    const P_ = S.pod; if (!P_ || P_.taken) return; P_.t += dt;
    if (!P_.landed) { // 2.2 s fall on a steep line, a burning trail behind it
      const u = Math.min(1, P_.t / 2.2), k = u * u; P_.m.position.lerpVectors(P_.from, P_.at, k);
      G.fxs?.emit(false, { pos: P_.m.position.clone().add(V(0, 0.5, 0)), vel: P_.from.clone().sub(P_.at).normalize().multiplyScalar(4), life: 0.35, size: 0.6, size1: 0.15, col: [14, 6, 1.5], drag: 1 });
      G.fxs?.emit(true, { pos: P_.m.position.clone().add(V(0, 1, 0)), vel: V((G.rng() - 0.5), 1, (G.rng() - 0.5)), life: 2.5, size: 0.6, size1: 2.4, col: G.fxs.litColor([0.3, 0.28, 0.26]), alpha: 0.4, soft: true, drag: 0.6, rise: 0.4 });
      if (u >= 1) {
        P_.landed = true; G.player.addShake(Math.max(0.25, 0.9 - P_.at.distanceTo(G.player.s.pos) / 25)); G.R.flash(P_.at.clone().setY(1), 0xffa060, 50, 10, 0.12);
        G.fxs?.explosion(P_.at.clone().setY(0.4), 0.6); G.events.emit('explosion', { pos: P_.at.clone(), size: 0.6 });
        for (let i = 0; i < 40; i++) { const a = i / 40 * 6.283; G.fxs?.emit(true, { pos: V(P_.at.x + Math.cos(a), 0.2, P_.at.z + Math.sin(a)), vel: V(Math.cos(a), 0.15, Math.sin(a)).multiplyScalar(6 + G.rng() * 4), life: 1.6, size: 0.4, size1: 2.2, col: G.fxs.litColor([0.5, 0.42, 0.32]), alpha: 0.45, soft: true, drag: 2 }); }
        obj({ marks: [...(G.obj?.marks || []), { p: P_.at, label: '2', kind: 'pick', name: 'ARC LANCE' }] });
      }
      return;
    }
    P_.beacon.intensity = 6 + 4 * Math.sin(P_.t * 5);
    if (!(G.obj?.marks || []).some((m) => m.kind === 'pick')) obj({ marks: [...(G.obj?.marks || []), { p: P_.at, label: '2', kind: 'pick', name: 'ARC LANCE' }] });
    if (G.player.s.pos.distanceTo(P_.at) < 2.4) {
      P_.taken = true; P_.beacon.intensity = 0; G.weapon.unlockLance(); G.weapon.swapTo('lance');
      obj({ marks: (G.obj?.marks || []).filter((m) => m.kind !== 'pick') });
      hud()?.banner?.('ARC-7 LANCE', { kind: 'good', sub: 'HOLD FIRE TO CHARGE — PIERCES SHIELDS', dur: 3 });
      hud()?.hint?.([['2', 'LANCE'], ['1', 'CARBINE'], ['LMB', 'HOLD TO CHARGE']], 6); G.audio?.play?.('bolt', { gain: 1, rate: 0.8 });
    }
  }
  // ---------- kill feel + bookkeeping ----------
  G.events.on('enemy:killed', (e) => {
    S.kills++; G.hitstop(0.055); G.player.addShake(0.32);
    if (S.state === 'play' && hostiles() === 0 && !S.pending) { G.slowmo(1.1, 0.22); finisher(e.pos.clone().setY(1.2)); G.events.emit('flow:lastkill'); }
  });
  // the last robot of a wave overloads: a blue-white discharge, a ring of light along the ground, a punch on the lens
  function finisher(p) {
    G.R.fx.punch = 1; G.player.addShake(0.45); G.R.flash(p, 0x9fdcff, 60, 14, 0.12);
    G.fxs?.electric(p); G.fxs?.electric(p.clone().add(V(0, 0.5, 0)));
    for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; G.fxs?.emit(false, { pos: V(p.x, 0.3, p.z), vel: V(Math.cos(a), 0.02, Math.sin(a)).multiplyScalar(16), life: 0.5, size: 0.18, size1: 0.04, stretch: 0.35, col: [6, 14, 22], drag: 2 }); }
    for (let i = 0; i < 26; i++) { const v = V(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize(); G.fxs?.emit(false, { pos: p, vel: v.multiplyScalar(6 + Math.random() * 10), life: 0.5 + Math.random() * 0.5, size: 0.02, stretch: 0.12, col: [8, 16, 24], grav: 6, drag: 1 }); }
    G.audio?.play?.('shieldBreak', { gain: 0.9, rate: 0.75 }); G.audio?.play?.('boom', { gain: 0.5, rate: 1.3 });
  }
  G.events.on('player:dead', () => { S.state = 'dead'; S.deadT = 0; G.obj = null; });
  G.events.on('boss:core', () => { S.cores++; obj({ count: [S.cores, 2] }); if (S.cores === 1) say('core'); });
  G.events.on('boss:leg', () => { obj({ count: [1, 1] }); hud()?.banner?.('LEG DESTROYED', { kind: 'good', sub: 'ARMOUR BREACHED — CORES EXPOSED', dur: 3 }); later(1.4, () => { say('legdown'); obj({ line: 'DESTROY THE COOLANT CORES', count: [0, 2], unit: 'CORES' }); S.bossPhase = 'cores'; }); });
  G.events.on('boss:overload', () => { S.bossPhase = 'trap'; say('overload'); hud()?.banner?.('IT IS OVERLOADING', { kind: 'crit', sub: 'IGNITE THE FLARE LINE', dur: 3.2 }); G.audio?.play?.('alarm', { gain: 0.8 });
    const ig = igniter(); if (ig) { ig.lamp.material.color.setRGB(9, 1.2, 0.2); obj({ line: 'IGNITE THE FLARE LINE', count: null, unit: null, marks: [{ p: ig.pos, label: 'F', name: 'IGNITER' }] }); } });
  G.events.on('boss:dead', () => { S.bossDead = true; S.towerT = 0; });
  G.events.on('scan:fire', () => { S.scanned = true; });
  if (G.params.shot && !G.params.noenemies) setTimeout(start, 0);

  // ---------- hold-E stations (valve A in act 1, the flare-line igniter in the finale) ----------
  const _f = new THREE.Vector3();
  function holdTick(v, dt, { label, hold, col, done }) {
    if (!v || v.open) return;
    const ps = G.player.s; const d = Math.hypot(ps.pos.x - v.pos.x, ps.pos.z - v.pos.z);
    _f.set(v.top.x - ps.pos.x, 0, v.top.z - ps.pos.z).normalize(); const look = -Math.sin(ps.yaw) * _f.x - Math.cos(ps.yaw) * _f.z;
    const near = d < 2.6 && look > 0.2 && !ps.dead;
    if (!v.glow) { v.glow = []; v.wheel?.traverse((m) => { if (m.isMesh && m.material.emissive) v.glow.push(m.material); }); }
    const gk = d < 26 ? 0.55 + 0.45 * Math.sin(S.t * 5) : 0; for (const m of v.glow) { m.emissive.setRGB(...col); m.emissiveIntensity = gk * 2.2; }
    const U = G.interact && G.interact.v === v ? G.interact : (G.interact = { v, label, prog: 0 }); U.near = near;
    const held = near && (G.input.down('use') || G.auto?.use);
    U.prog = THREE.MathUtils.clamp(U.prog + (held ? dt / hold : -dt * 1.5), 0, 1);
    if (held && v.wheel) { v.wheel.rotation.y -= dt * 4.2; if ((S.valveSnd = (S.valveSnd || 0) - dt) <= 0) { S.valveSnd = 1.1; G.audio?.play?.('valve', { pos: v.top, ref: 4, gain: 0.9 }); } }
    if (U.prog >= 1) { v.open = true; G.interact = null; for (const m of v.glow) m.emissiveIntensity = 0; done(v); }
  }
  function valveTick(dt) {
    const v = valveA(); if (!v || v.open) { if (G.interact?.v === v) G.interact = null; return; }
    if (!S.valveSaid && Math.hypot(G.player.s.pos.x - v.pos.x, G.player.s.pos.z - v.pos.z) < 16) { S.valveSaid = true; if (E()?.list.some((e) => e.alive && e.root.position.distanceTo(v.pos) < 9)) say('contact'); }
    holdTick(v, dt, { label: 'HOLD — OPEN VALVE A', hold: 1.6, col: [1, 0.3, 0.04], done: () => {
      v.lamp.material.color.setRGB(0.6, 5, 1.2);
      G.audio?.play?.('pressure', { pos: v.top, ref: 10, gain: 1.1 }); G.audio?.play?.('objective', { gain: 0.8 }); G.player.addShake(0.25);
      for (let i = 0; i < 24; i++) G.fxs?.emit(true, { pos: v.top.clone().add(V(0, -0.5, 0)), vel: V((Math.random() - 0.5) * 3, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 3), life: 1.6, size: 0.15, size1: 1.2, col: G.fxs.litColor([0.85, 0.85, 0.85]), alpha: 0.35, soft: true, drag: 1.5, rise: 0.8 });
      hud()?.banner?.('PRESSURE LINE A ONLINE', { kind: 'good', dur: 2.8 }); say('opened');
      obj({ count: [1, 1], marks: [] }); S.step = 'hold'; S.waveT = 2.5; G.events.emit('valve:open', { id: v.id });
      later(2.5, dropPod);
    } });
  }
  // the finale: the overloaded machine is stuck on the flare line's outlet; light it
  const igniter = () => G.level.valves?.find((v) => v.id === 'IGN');
  function ignite(v) {
    const B = G.boss; const from = v.top.clone(); const to = B.hull.position.clone(); const dir = to.clone().sub(from).setY(0); const L = dir.length(); dir.normalize();
    G.audio?.play?.('whoomp', { gain: 1.3 }); G.audio?.play?.('pressure', { gain: 1.2, rate: 1.3 }); G.player.addShake(0.5); G.R.fx.punch = 0.8;
    hud()?.banner?.('FLARE LINE IGNITED', { kind: 'good', dur: 2.5 }); G.events.emit('trap:ignite', {});
    G.fire?.add(from.clone().addScaledVector(dir, 1.2).setY(1.1), { size: 2.6, life: 7, dir: dir.clone().add(V(0, 0.12, 0)), dmg: 0, smoke: false });
    const n = Math.ceil((L - 2.5) / 1.5);
    for (let i = 0; i <= n; i++) later(0.05 * i, () => { const p = from.clone().addScaledVector(dir, 2.5 + i * 1.5).setY(0.1); G.fire?.add(p, { size: 1.5 + i * 0.06, life: 30 + G.rng() * 20, dmg: 10 }); G.R.flash(p.clone().setY(1.5), 0xff9a40, 25, 8, 0.15); });
    for (let i = 0; i < 6; i++) later(0.6 + i * 0.22, () => { G.fxs?.explosion(B.hull.position.clone().add(V((G.rng() - 0.5) * 7, (G.rng() - 0.3) * 4, (G.rng() - 0.5) * 7)), 1.2 + G.rng() * 0.8); G.player.addShake(0.35); });
    // the line comes up under the machine: columns of fire around its feet, tall enough to read over the wall
    for (let i = 0; i < 5; i++) later(0.35 + i * 0.08, () => { const a = i / 5 * Math.PI * 2; G.fire?.add(to.clone().add(V(Math.cos(a) * 3.5, 0, Math.sin(a) * 3.5)).setY(0.1), { size: 3.2, life: 40, dmg: 0 }); });
    later(1.7, () => { G.boss.trapKill(); G.slowmo(2.2, 0.25); });
  }

  // the distillation column behind the colossus topples toward the yard
  function fellTower() {
    const o = G.level.fallTower; if (!o || S.fell) return; S.fell = { o, t: 0, axis: V(1, 0, 0.25).normalize() };
    G.player.assist?.(o.position.clone().add(V(0, 9, 6)), 0.3, 2.6); G.slowmo(2.2, 0.5); // keep the view on the column while it comes down
    G.events.emit('tower:fall', { pos: o.position.clone() });
  }
  function towerTick(dt) {
    const f = S.fell; if (!f || f.done) return; f.t += dt;
    const k = Math.min(1, Math.pow(f.t / 3.2, 2.2)); f.o.rotation.set(0, f.o.rotation.y, 0); f.o.rotateOnWorldAxis(f.axis, k * 1.45);
    if (Math.random() < dt * 20) G.fxs?.emit(true, { pos: f.o.position.clone().add(V((Math.random() - 0.5) * 6, 0.5, (Math.random() - 0.5) * 6)), vel: V((Math.random() - 0.5) * 4, 1.5, (Math.random() - 0.5) * 4), life: 3, size: 1, size1: 4, col: G.fxs.litColor([0.3, 0.24, 0.18]), alpha: 0.5, soft: true, drag: 1 });
    if (k >= 1) { f.done = true; const hit = f.o.position.clone().add(V(0, 0, 14)); G.explosives?.blast(hit, 1.6, 6, 0); G.player.addShake(0.9); for (let i = 0; i < 40; i++) { const a = Math.random() * 6.28; G.fxs?.emit(true, { pos: V(hit.x + Math.cos(a) * 4, 0.4, hit.z + Math.sin(a) * 10), vel: V(Math.cos(a), 0.2, Math.sin(a)).multiplyScalar(6 + Math.random() * 6), life: 3 + Math.random() * 2, size: 1, size1: 5, col: G.fxs.litColor([0.45, 0.35, 0.25]), alpha: 0.55, soft: true, drag: 1.5 }); } G.events.emit('tower:down', {}); }
  }

  // the wall arrives: a high shot over the yard toward the storm, the front rolling over the far stacks, lightning in its face
  function stormShot(done) {
    if (!G.cine) { done(); return; }
    const d = V(STORM_DIR.x, 0, STORM_DIR.y), A0 = V(5, 10.5, 9), A1 = V(4, 9.2, 6.5);
    G.cine.play({
      dur: 4.6,
      cam: (t) => { const k = Math.min(1, t / 4.6), e = k * k * (3 - 2 * k), fr = env()?.front ?? 120;
        return { pos: A0.clone().lerp(A1, e), look: d.clone().multiplyScalar(Math.max(60, fr)).setY(48 + 8 * e), fov: 72 - 10 * e, roll: Math.sin(t * 2.1) * 0.004 }; },
      start: () => { S.stormCine = true; for (const [t, k] of [[0.5, 0.7], [1.6, 0.5], [2.6, 0.85], [3.6, 0.6]]) later(t, () => { const fr = env()?.front ?? 120; G.env?.strike(d.clone().multiplyScalar(fr * k).add(V((G.rng() - 0.5) * 60, 45, (G.rng() - 0.5) * 30))); }); G.player.addShake(0.3); },
      card: { cls: 'ACT 2', name: 'SANDSTORM', threat: 'VISIBILITY: <b>ZERO</b>', at: 1.2 },
      end: () => { S.stormCine = false; done(); },
    });
  }
  function toStorm(late) {
    setAct(2); S.stormClock = 0; S.wave = Math.max(S.wave, 0); S.waveT = 6;
    if (late && valveA() && !valveA().open) { say('lateValve'); valveA().open = true; G.interact = null; }
    obj({ act: 2, title: 'ACT 2 // SANDSTORM', line: 'SURVIVE THE STORM', count: [0, 2], unit: 'WAVES', marks: [], sub: null });
    G.audio?.play?.('alarm', { gain: 0.7 });
    stormShot(() => {
      hud()?.banner?.('SANDSTORM', { kind: 'crit', sub: 'VISIBILITY LOST — USE YOUR SCAN', dur: 3.5 }); hud()?.boot?.();
      say('storm'); later(3, () => { if (!S.scanned) hud()?.hint?.([['Q', 'SCAN PULSE']], 7); });
    });
    later(14, () => G.boss?.hideDistant()); // swallowed by the storm
  }

  const lerp = THREE.MathUtils.lerp, sstep = THREE.MathUtils.smoothstep;
  let fadeIn = 0;
  function update(dt) {
    S.t += dt; S.actT += dt;
    for (let i = S.queue.length - 1; i >= 0; i--) if (S.queue[i].t <= S.t) { const q = S.queue.splice(i, 1)[0]; q.fn(); }
    if (S.state === 'deploy' || (S.state === 'play' && G.R.fx.fade > 0)) { fadeIn += dt; G.R.fx.fade = Math.max(0, 1 - fadeIn / 0.9); }
    towerTick(dt);
    // the column comes down once the player can see it (assist the view after a few seconds otherwise)
    if (S.towerT != null && !S.fell && G.level.fallTower) {
      S.towerT += dt; const top = G.level.fallTower.position.clone().setY(13);
      if (S.towerT > 1.2 && inView(top, 0.85)) fellTower();
      else if (S.towerT > 4.5) { G.player.assist?.(top, 0.8, 0.3); if (S.towerT > 5.3) fellTower(); }
    }
    // supply crates: ammo, grenades and health
    for (const c of G.level.crates || []) if (c.distanceTo(G.player.s.pos) < 2.2 && !(c.cdT > S.t)) { const a = G.weapon?.resupply(), h = G.player.heal?.(50); if (a || h) { c.cdT = S.t + 1.5; hud()?.addFeed?.('SUPPLY CRATE', h ? '+AMMO +HP' : '+AMMO'); } }
    if (S.state === 'dead') { S.deadT += dt; return; }
    if (S.state !== 'play' && S.state !== 'extract') return;
    podTick(dt);
    // the last one or two of a wave never sit it out somewhere: after a while they come for you, and they show on the radar
    { const left = (E()?.list || []).filter((e) => e.alive);
      if (left.length && left.length <= 2 && !S.pending && !G.boss?.S.active) { S.lingerT = (S.lingerT || 0) + dt; if (S.lingerT > 18) { S.lingerT = 0; for (const e of left) { e.lastKnown = G.player.s.pos.clone(); e.scanT = Math.max(e.scanT || 0, 4); E().alert(e); } } }
      else S.lingerT = 0; }
    const ev = env(), alive = hostiles(), clear = alive === 0 && !S.pending;
    // ---- act I ----
    if (S.horizon && G.boss?.S.distant) {
      const H = S.horizon; H.t += dt; H.bolt -= dt; const hp = G.boss.worldPos();
      if (!H.said && (inView(hp.clone().setY(hp.y), 0.9) || H.t > 30)) { H.said = true; say('horizon'); H.bolt = 0.4; G.events.emit('boss:sighted'); }
      if (H.bolt <= 0 && H.said) { H.bolt = 6 + G.rng() * 4; G.env?.strike(hp.clone().add(V(-28, 30, (G.rng() - 0.5) * 30))); }
    }
    if (S.act === 1) {
      S.stormClock = Math.max(0, S.stormClock - dt * (S.stormFF && S.stormClock > 8 ? 32 : 1)); // the front speeds up visibly once the yard is held
      if (ev) ev.front = 150 + 110 * (S.stormClock / STORM_CLOCK);
      if (S.step === 'valve') valveTick(dt);
      else if (S.step === 'hold') {
        if (S.wave < 0 && clear) { S.waveT -= dt; if (S.waveT <= 0) { S.wave = 0; spawnWave(WAVES[0].n, WAVES[0].ch); say('inbound'); hud()?.banner?.('HOSTILES INBOUND', { kind: 'crit', dur: 2.4 }); obj({ line: 'HOLD THE YARD', count: [0, WAVES[0].n], unit: 'DOWN', marks: [] }); } }
        else if (S.wave === 0) { obj({ count: [Math.min(S.waveN, S.kills - S.waveK), S.waveN] }); if (clear) { S.step = 'storm'; S.stormFF = true; hud()?.banner?.('SANDSTORM INBOUND', { kind: 'crit', sub: 'THE FRONT IS ACCELERATING', dur: 3 }); G.audio?.play?.('alarm', { gain: 0.6 }); obj({ line: 'BRACE FOR THE STORM', count: null, unit: null }); } }
      }
      if (S.stormClock <= 0) toStorm(S.step === 'valve');
    // ---- act II: front sweeps over (~24 s); waves 2 and 3 inside the storm; lightning takes the tank ----
    } else if (S.act === 2) {
      if (ev) ev.front = S.actT < 4.6 ? lerp(150, 85, S.actT / 4.6) : lerp(85, -140, sstep(S.actT, 4.6, 20)); // rolls in fast under the opening shot, then over the yard
      // lightning takes the storage tank — when the player is looking at it (or soon after, regardless)
      const tk = !S.tankHit && G.level.explosives.find((o) => o.userData.explosive?.big && !o.userData.explosive.dead);
      if (tk && S.actT > 6 && (inView(tk.position.clone().setY(9), 0.8) || S.actT > 45)) {
        const seen = S.actT <= 45; S.tankHit = true; G.env?.strike(tk.position.clone().setY(30));
        later(0.12, () => { G.explosives?.hurt(tk, 9999); if (seen) { G.slowmo(1.3, 0.3); G.player.addShake(0.6); G.player.assist?.(tk.position.clone().setY(5), 0.4, 1.6); } });
      }
      if (S.wave >= 1) obj({ count: [S.wave - 1 + (clear ? 1 : 0), 2] });
      if (clear) {
        S.waveT -= dt;
        if (S.waveT <= 0) {
          if (S.wave < 2) { S.wave++; spawnWave(WAVES[S.wave].n, WAVES[S.wave].ch, null, WAVES[S.wave]); if (S.wave === 2 && !WAVES[2].hv) say('wave'); hud()?.banner?.(`WAVE ${S.wave} / 2`, { kind: 'crit', dur: 2.2 }); S.waveT = 3; }
          else if (S.actT > 24) toNight();
        }
      }
      if (S.act === 2 && S.actT > 120) toNight();
    // ---- act III: night falls on the burning yard; the colossus comes ----
    } else if (S.act === 3) {
      if (ev) { ev.night = sstep(S.actT, 0, 10); ev.storm = lerp(1, 0.3, sstep(S.actT, 0, 10)); ev.front = Math.min(ev.front, -140); }
      if (S.actT > 6 && !S.bossIn) {
        S.bossIn = true; G.boss?.hideDistant(); G.boss?.spawn(V(-50, 0, -13), Math.PI / 2, BOSS_PATH); G.boss.S.trap = V(-31.5, 0, -4); G.audio?.play?.('alarm', { gain: 0.9 });
        revealBoss(() => {
          spawnWave(WAVES[3].n, WAVES[3].ch, null, WAVES[3]); hud()?.boot?.();
          hud()?.banner?.('WARNING // MASSIVE CONTACT', { kind: 'crit', sub: 'COLOSSUS — CLASS-IV SIEGE WALKER', dur: 3.5 });
          say('boss'); obj({ line: 'BREAK A LEG ACTUATOR', count: [0, 1], unit: 'LEGS' }); S.bossPhase = 'legs';
        });
      }
      const B = G.boss?.S;
      if (B?.active && !B.dead && S.bossPhase !== 'trap') {
        // the weak points of the current phase are the marks (the two nearest), the machine itself on the compass
        const pp = G.player.s.pos, wp = G.boss.targets().slice().sort((a, b) => a.distanceTo(pp) - b.distanceTo(pp)).slice(0, 2);
        obj({ marks: [{ p: B.pos, label: '!', kind: 'boss', name: 'COLOSSUS' }, ...wp.map((p) => ({ p, label: '◎', kind: 'weak', name: S.bossPhase === 'cores' ? 'CORE' : 'KNEE' }))] });
      }
      if (S.bossPhase === 'trap' && !G.boss?.S.dead) holdTick(igniter(), dt, { label: 'HOLD — IGNITE THE FLARE LINE', hold: 1.0, col: [1, 0.08, 0.02], done: ignite });
      if (S.bossDead && clear && S.state === 'play' && (S.fell?.done || !G.level.fallTower)) toExtract();
    }
    if (S.state === 'extract' && S.shipReady && G.player.s.pos.distanceTo(S.extract) < 3.2) { S.state = 'won'; G.obj = null; G.ship ? board() : G.events.emit('flow:won'); }
  }
  function toExtract() {
    S.state = 'extract'; S.shipReady = !G.ship; say('dead'); hud()?.banner?.('COLOSSUS DESTROYED', { kind: 'good', sub: 'REACH THE PAD — DROPSHIP INBOUND', dur: 3.5 });
    obj({ line: G.ship ? 'DROPSHIP INBOUND — HOLD AT THE PAD' : 'REACH EXTRACTION', count: null, marks: [{ p: S.extract, label: 'X', kind: 'ext', name: 'EXTRACTION' }] }); G.events.emit('flow:extract');
    if (G.ship) { G.ship.inbound(S.extract, SHIP); later(4, () => say('shipIn')); }
  }
  G.events.on('ship:ready', () => {
    if (S.state !== 'extract') return; S.shipReady = true; say('board');
    obj({ line: 'BOARD THE DROPSHIP', marks: [{ p: S.extract, label: 'X', kind: 'ext', name: 'DROPSHIP' }] }); hud()?.banner?.('DROPSHIP ON THE PAD', { kind: 'good', sub: 'GET ABOARD', dur: 2.5 });
  });
  // boarding: from inside the yard, watch the ship come off the pad and turn west over the burning wreck
  function board() {
    say('won'); const sh = G.ship.S, C0 = SHIP.cam0, C1 = SHIP.cam1, look = V();
    G.cine.play({
      dur: 600, // holds on the empty sky behind the results screen
      start() { G.ship.liftoff(() => G.events.emit('flow:won')); },
      cam(t) { look.lerp(sh.pos.clone().add(V(0, 1.5, 0)), t < 0.05 ? 1 : 0.06); return { pos: C0.clone().lerp(C1, ease(Math.min(1, t / 9))), look, fov: 58 - 14 * ease(Math.min(1, t / 7)) }; },
      end() {},
    });
  }
  // the reveal: a low angle from inside the yard, lightning behind the machine, name card, weak points called out
  function revealBoss(done) {
    const B = G.boss; if (!B || !G.cine) { done(); return; }
    // out on the sand west of the yard, low, the machine walking past toward the refinery
    const A0 = V(-27.5, 1.1, 5.5), A1 = V(-29.5, 1.5, 2.5), look = V(0, 0, 0), lk = V(-46, 8, -13);
    const key = new THREE.PointLight(0xffb27a, 0, 45, 1.6), rim = new THREE.PointLight(0x9fc8ff, 0, 60, 1.4); G.R.scene.add(key, rim);
    G.cine.play({
      dur: 5.2,
      cam: (t) => { const k = Math.min(1, t / 5.2), e = k * k * (3 - 2 * k); look.copy(B.hull.position).add(V(0, 0.6, 0)); lk.lerp(look, Math.min(1, (G.realDt || 0.016) * 4));
        key.position.copy(B.hull.position).add(V(10, 2, 14)); rim.position.copy(B.hull.position).add(V(-14, 10, -10)); key.intensity = 260 * Math.min(1, t * 2); rim.intensity = 420 * Math.min(1, t * 2);
        return { pos: A0.clone().lerp(A1, e), look: lk, fov: 44 - 8 * e, roll: Math.sin(t * 1.7) * 0.006 }; },
      start: () => { later(0.35, () => G.env?.strike(B.hull.position.clone().add(V(-26, 42, 3)))); later(1.6, () => G.env?.strike(B.hull.position.clone().add(V(-18, 38, -12)))); G.player.addShake(0.4); },
      card: { cls: 'CLASS-IV SIEGE WALKER', name: 'COLOSSUS', threat: 'THREAT LEVEL: <b>EXTREME</b>', at: 1.1 },
      callouts: [
        { label: 'LEG ACTUATOR', at: () => B.legs[0].k.w, t: 2.0, dx: -120, dy: -50 },
        { label: 'LEG ACTUATOR', at: () => B.legs[1].k.w, t: 2.3, dx: 120, dy: -60 },
        { label: 'COOLANT CORE // ARMOURED', at: () => B.cores[0].light.position, t: 2.6, dx: -130, dy: 60 },
        { label: 'BEAM EMITTER', at: () => B.muzzle(), t: 2.9, dx: 120, dy: 40 },
      ],
      end: () => { G.R.scene.remove(key, rim); const ps = G.player.s, d = B.hull.position.clone().sub(G.R.camera.position); ps.yaw = Math.atan2(-d.x, -d.z); ps.pitch = THREE.MathUtils.clamp(Math.atan2(d.y - 2, Math.hypot(d.x, d.z)), -0.3, 0.5); done(); },
    });
  }
  function toNight() {
    if (S.act !== 2) return; S.wave = 2; setAct(3); S.waveT = 7;
    obj({ act: 3, title: 'ACT 3 // NIGHT', line: 'STAND BY', count: null, unit: null, marks: [] }); say('passing');
    hud()?.banner?.('ACT 3 // NIGHT', { sub: 'THE STORM PASSES', dur: 3 });
  }
  return { update, S, start, deploy, setAct, fellTower, toExtract, dropPod };
}
