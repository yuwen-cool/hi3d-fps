import * as THREE from 'three';
import { clone as skClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { loadRobotRig } from './anim.js';
import { alignedGun } from '../weapon/align.js';
import { patchMaterial } from '../mats/patch.js';
import { createWreck } from './wreck.js';
import { instance } from '../world/assets.js';

// Hi3D combat robots. AI layer follows docs/SPEC.md §6.1 (perception, attack tokens, firing
// positions scored away from teammates and into line of sight, telegraph -> burst -> cool).
// Animation: Mesh2Motion clips retargeted at load, split into lower-body locomotion and
// upper-body aim/shoot layers.
const CFG = { hp: 140, headR: 0.15, shotDmg: 5, burst: 4, burstGap: 0.11, cool: [1.0, 1.9], tele: 0.35, spreadFar: 0.06, spreadNear: 0.03,
  run: 4.2, walk: 1.6, accel: 7, turn: 3.0, range: [6, 14], sight: 48, fovCos: Math.cos(1.75), react: 0.55, height: 1.9, maxTokens: 3, tokenGap: 0.7 };
// kinds: riflemen hold 6-14 m and trade bursts; chargers sprint in and fire on the move (orange visor);
// heavies are a size up, walk a riot shield straight at you and fire around it (red visor) — break the shield,
// get behind them (the power pack on the back is the weak point), lob a grenade over it, or put a lance slug through it
const KINDS = { rifle: {}, charger: { hp: 110, run: 5.6, range: [2.5, 6], burst: 7, burstGap: 0.075, cool: [0.6, 1.1], tele: 0.3, visor: [2.2, 0.55, 0.12] },
  heavy: { hp: 340, run: 2.3, range: [4, 10], burst: 6, burstGap: 0.13, cool: [1.1, 1.8], tele: 0.45, visor: [2.6, 0.18, 0.08], scale: 1.18, mass: 2.6, shield: 650, tint: 0.55, turn: 1.5 } };
const SHIELD = { w: 0.86, h: 1.55, t: 0.07 };
const HOLD = { fwd: 0.3, down: -0.15, inward: -0.08, rBack: -0.05, rUp: 0.04, lFwd: 0.32, lUp: -0.03, lSide: 0.0, twist: -0.2, lPole: 0.25 };
const UPPER = /^(spine|neck|head|clavicle|upperarm|lowerarm|hand|index|middle|ring|pinky|thumb)/;
function subClip(c, upper, name) { return new THREE.AnimationClip(name, c.duration, c.tracks.filter((t) => UPPER.test(t.name.split('.')[0]) === upper)); }

export async function createEnemies(G) {
  const R = G.R, P = G.phys, scene = R.scene, rnd = G.rng;
  const { gltf, clips } = await loadRobotRig(); G.HOLD = HOLD;
  const src = gltf.scene;
  let skinSrc = null; src.traverse((m) => { if (m.isSkinnedMesh) skinSrc = m; });
  src.traverse((m) => { if (m.isMesh) { m.castShadow = m.receiveShadow = true; m.frustumCulled = false; patchMaterial(m.material, 'robot'); m.material.color.multiplyScalar(1.7); m.material.emissiveIntensity = 4.5; } });
  const L = {}, U = {};
  for (const n of ['Jog', 'Walk', 'Strafe_left', 'Strafe_right', 'Walk_Backwards', 'Sprint', 'Pistol_Idle', 'Idle_A', 'Run_Stealth']) if (clips[n]) L[n] = subClip(clips[n], false, n + '_L');
  for (const n of ['Pistol_Aim_Neutral', 'Pistol_Shoot', 'Pistol_Idle', 'Pistol_Reload', 'Jog', 'Walk', 'Sprint']) if (clips[n]) U[n] = subClip(clips[n], true, n + '_U');
  const wreck = createWreck(G, skinSrc);
  const gunA = await alignedGun('rifle_v1'); const gunSrc = gunA.group;
  // riot shield: stand it up with its thin axis along Z (face toward +Z), base at the origin
  const shieldSrc = await (async () => {
    const o = await instance('riot_shield'); const g = new THREE.Group(); o.updateMatrixWorld(true);
    const sz = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()); if (sz.x < sz.z) o.rotation.y = Math.PI / 2;
    o.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(o), c = b.getCenter(new THREE.Vector3()), s2 = b.getSize(new THREE.Vector3());
    o.position.sub(c); const k = SHIELD.h / s2.y; const inner = new THREE.Group(); inner.add(o); inner.scale.set(SHIELD.w / s2.x, k, k); g.add(inner);
    g.traverse((m) => { if (m.isMesh) { m.castShadow = m.receiveShadow = true; } }); return g;
  })();
  const list = [], tokens = { n: 0, last: 0 }; let gripFit = null;
  // ---------- nav grid ----------
  const B = G.level.layout.bounds, CS = 0.5, NX = Math.ceil((B.maxX - B.minX) / CS), NZ = Math.ceil((B.maxZ - B.minZ) / CS);
  const block = new Uint8Array(NX * NZ);
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) block[j * NX + i] = P.blocked(B.minX + (i + 0.5) * CS, B.minZ + (j + 0.5) * CS, 0.42) ? 1 : 0;
  const cell = (x, z) => [THREE.MathUtils.clamp(Math.floor((x - B.minX) / CS), 0, NX - 1), THREE.MathUtils.clamp(Math.floor((z - B.minZ) / CS), 0, NZ - 1)];
  const g = new Float32Array(NX * NZ), came = new Int32Array(NX * NZ), closed = new Uint8Array(NX * NZ), heap = [], hf = [];
  let tx_ = 0, tz_ = 0; const h = (k) => { const dx = Math.abs((k % NX) - tx_), dz = Math.abs(((k / NX) | 0) - tz_); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
  function push(k, f) { heap.push(k); hf.push(f); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= hf[i]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; [hf[p], hf[i]] = [hf[i], hf[p]]; i = p; } }
  function pop() { const top = heap[0], lk = heap.pop(), lf = hf.pop(); if (heap.length) { heap[0] = lk; hf[0] = lf; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && hf[l] < hf[m]) m = l; if (r < heap.length && hf[r] < hf[m]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; [hf[m], hf[i]] = [hf[i], hf[m]]; i = m; } } return top; }
  function path(from, to) {
    const [sx, sz] = cell(from.x, from.z), [tx, tz] = cell(to.x, to.z);
    let S = sz * NX + sx, T = tz * NX + tx;
    // a goal or start inside a prop's footprint (e.g. someone standing at a valve): use the nearest free cell
    const free = (k) => { if (!block[k]) return k; const cx = k % NX, cz = Math.floor(k / NX); for (let r = 1; r <= 4; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue; const x = cx + dx, z = cz + dz; if (x >= 0 && z >= 0 && x < NX && z < NZ && !block[z * NX + x]) return z * NX + x; } return -1; };
    T = free(T); S = free(S); if (T < 0 || S < 0) return null; tx_ = T % NX; tz_ = (T / NX) | 0;
    // A* on the 0.5 m grid with a binary heap (the map is ~190 x 165 cells)
    g.fill(1e9); came.fill(-1); closed.fill(0); g[S] = 0; heap.length = 0; push(S, h(S));
    let it = 0;
    while (heap.length && it++ < 60000) {
      const c = pop(); if (c === T) break; if (closed[c]) continue; closed[c] = 1;
      const cx = c % NX, cz = (c / NX) | 0;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        if (!dx && !dz) continue; const nx = cx + dx, nz = cz + dz; if (nx < 0 || nz < 0 || nx >= NX || nz >= NZ) continue;
        const k = nz * NX + nx; if (block[k] || closed[k]) continue; if (dx && dz && (block[cz * NX + nx] || block[nz * NX + cx])) continue;
        const ng = g[c] + (dx && dz ? 1.414 : 1); if (ng < g[k]) { g[k] = ng; came[k] = c; push(k, ng + h(k)); }
      }
    }
    if (came[T] < 0 && S !== T) return null;
    const pts = []; for (let k = T; k !== S && k >= 0; k = came[k]) pts.push(new THREE.Vector3(B.minX + (k % NX + 0.5) * CS, 0, B.minZ + (Math.floor(k / NX) + 0.5) * CS));
    pts.reverse();
    // string-pull, but only across segments a body can actually pass (clearance sampled along the line)
    const clear = (p0, p1) => { const L = Math.hypot(p1.x - p0.x, p1.z - p0.z), n = Math.ceil(L / 0.35); for (let k = 1; k < n; k++) { const t = k / n; if (P.blocked(p0.x + (p1.x - p0.x) * t, p0.z + (p1.z - p0.z) * t, 0.4)) return false; } return true; };
    const out = []; let a = from.clone();
    for (let i = 0; i < pts.length; i++) { const nxt = pts[i + 1]; if (!nxt || !clear(a, nxt)) { out.push(pts[i]); a = pts[i]; } }
    return out;
  }

  function spawn(pos, opts = {}) {
    const kind0 = opts.kind || 'rifle', sc = KINDS[kind0]?.scale || 1;
    const o = skClone(src); o.scale.setScalar(CFG.height * sc);
    const root = new THREE.Group(); root.add(o); root.position.copy(pos); scene.add(root);
    const bones = {}; o.traverse((b) => { if (b.isBone) bones[b.name] = b; });
    const kind = opts.kind || 'rifle', c = { ...CFG, ...KINDS[kind] };
    let skinned = null;
    const mats = []; o.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); patchMaterial(m.material, 'robot'); if (c.visor) m.material.emissive.setRGB(...c.visor); if (c.tint) m.material.color.multiplyScalar(c.tint); mats.push(m.material); } if (m.isSkinnedMesh) skinned = m; });
    // rifle in the right hand
    const gun = gunSrc.clone(true); gun.scale.setScalar(1.12); scene.add(gun); // world-space each frame; 1.12x keeps human proportions on a 1.9 m robot
    gun.userData.fit = true;
    gun.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    const mixer = new THREE.AnimationMixer(o);
    const act = {}; for (const [k, c] of Object.entries(L)) act['L' + k] = mixer.clipAction(c); for (const [k, c] of Object.entries(U)) act['U' + k] = mixer.clipAction(c);
    const death = {}; for (const n of ['Death_A', 'Death_B', 'Death_C', 'Death_D']) if (clips[n]) { const a = mixer.clipAction(clips[n]); a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; death[n] = a; }
    const hitA = clips.Hit_Chest ? mixer.clipAction(subClip(clips.Hit_Chest, true, 'Hit_U')) : null; if (hitA) { hitA.setLoop(THREE.LoopOnce); }
    const e = {
      root, o, skinned, kind, c, bones, mats, mixer, act, death, hitA, gun, hp: c.hp, maxHp: c.hp, scanT: 0, stagT: 0, knockV: new THREE.Vector3(), lastShotT: -99, alive: true, state: opts.state || 'patrol', seeT: 0, lostT: 0, think: rnd() * 0.15,
      vel: new THREE.Vector3(), yaw: opts.yaw ?? Math.PI, wp: [], goal: null, repath: 0, mode: 'move', modeT: 0, burstN: 0, shotT: 0, token: false,
      lastKnown: null, home: pos.clone(), patrolT: 0, hitSpr: { p: 0, pv: 0, r: 0, rv: 0 }, curL: null, curU: null, deadT: 0, id: list.length, glow: 0,
    };
    // bones edited procedurally after the mixer (stance twist, aim pitch, hit springs, arm IK)
    if (c.shield) { const sh = shieldSrc.clone(true); scene.add(sh); e.shield = { m: sh, hp: c.shield, broken: false, v: new THREE.Vector3(), w: new THREE.Vector3(), c: new THREE.Vector3(), q: new THREE.Quaternion(), flash: 0 }; }
    e.pb = ['spine_02', 'spine_03', 'neck_01', 'head', 'upperarm_l', 'lowerarm_l', 'upperarm_r', 'lowerarm_r'].map((n) => bones[n]);
    e.pq = e.pb.map((b) => b.quaternion.clone());
    play(e, 'L', 'Pistol_Idle', 0); play(e, 'U', 'Pistol_Idle', 0);
    list.push(e); return e;
  }
  function play(e, layer, name, fade = 0.2) {
    const a = e.act[layer + name]; if (!a) return; const cur = layer === 'L' ? e.curL : e.curU;
    if (cur === a) return;
    a.reset().setEffectiveWeight(1).play(); if (cur) cur.crossFadeTo(a, fade, false); else a.fadeIn(fade);
    if (layer === 'L') e.curL = a; else e.curU = a;
  }
  // ---------- perception & combat ----------
  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), eyeP = new THREE.Vector3();
  const playerEye = () => G.R.camera.getWorldPosition(eyeP);
  function muzzle(e, out) { e.bones.hand_r.getWorldPosition(out); return out.addScaledVector(fwd(e), 0.55).setY(out.y + 0.05); }
  const fwd = (e) => _w.set(Math.sin(e.yaw), 0, Math.cos(e.yaw));
  function canSee(e) {
    const ep = e.root.position.clone().setY(1.75), pe = playerEye();
    const d = pe.distanceTo(ep); if (d > CFG.sight) return false;
    if (d > 3.5 && e.state !== 'engage') { const dir = pe.clone().sub(ep).setY(0).normalize(); if (dir.dot(fwd(e)) < CFG.fovCos) return false; }
    return P.los(ep, pe);
  }
  function pickSpot(e) {
    const pp = G.player.s.pos; const cands = [];
    for (const c of G.level.cover) cands.push({ p: c, pri: -2 });
    for (let i = 0; i < 7; i++) { const a = rnd() * 6.28, r = e.c.range[0] + rnd() * (e.c.range[1] - e.c.range[0]); cands.push({ p: new THREE.Vector3(pp.x + Math.cos(a) * r, 0, pp.z + Math.sin(a) * r), pri: 0 }); }
    const base = Math.atan2(e.root.position.z - pp.z, e.root.position.x - pp.x);
    for (let i = 0; i < 5; i++) { const a = base + (i - 2) * 0.65, r = 12; cands.push({ p: new THREE.Vector3(pp.x + Math.cos(a) * r, 0, pp.z + Math.sin(a) * r), pri: 0 }); }
    let best = null, bs = 1e9;
    for (const c of cands) {
      const d = c.p.distanceTo(pp); if (d < e.c.range[0] || d > e.c.range[1] + 4 || P.blocked(c.p.x, c.p.z, 0.45)) continue;
      const B_ = G.level.layout.bounds; if (c.p.x < B_.minX + 1 || c.p.x > B_.maxX - 1 || c.p.z < B_.minZ + 1 || c.p.z > B_.maxZ - 1) continue;
      let s = c.p.distanceTo(e.root.position) * 0.9 + c.pri + rnd() * 3;
      const dirC = c.p.clone().sub(pp).normalize();
      for (const o of list) { if (o === e || !o.alive || o.state !== 'engage') continue; const ref = (o.goal || o.root.position).clone().sub(pp).normalize(); const cs = dirC.dot(ref); if (cs > 0.86) s += 14 * (cs - 0.86) / 0.14; if ((o.goal || o.root.position).distanceTo(c.p) < 3) s += 16; }
      if (!P.los(c.p.clone().setY(1.6), playerEye())) s += 22;
      if (s < bs) { bs = s; best = c.p; }
    }
    return best;
  }
  function setGoal(e, p) { e.goal = p ? p.clone() : null; e.wp = p ? (path(e.root.position, p) || []) : []; e.repath = 0.6; }
  function alert(e) {
    if (e.state === 'engage') return; e.state = 'engage'; e.mode = 'move'; setGoal(e, pickSpot(e)); G.events.emit('enemy:alert', { e });
    for (const o of list) if (o !== e && o.alive && o.state !== 'engage' && o.root.position.distanceTo(e.root.position) < 18) { o.state = 'investigate'; o.lastKnown = G.player.s.pos.clone(); setGoal(o, o.lastKnown); }
  }
  function shoot(e) {
    const m = muzzle(e, new THREE.Vector3()); const pe = playerEye();
    const d = m.distanceTo(pe); const spread = THREE.MathUtils.lerp(CFG.spreadNear, CFG.spreadFar, THREE.MathUtils.clamp(d / 30, 0, 1)) * (G.player.s.speed > 3 ? 1.4 : 1);
    const dir = pe.clone().sub(m).normalize(); dir.x += (rnd() - 0.5) * spread * 2; dir.y += (rnd() - 0.5) * spread * 1.2; dir.z += (rnd() - 0.5) * spread * 2; dir.normalize();
    const hw = P.raycast(m, dir, 120);
    // does the ray pass close to the player's capsule?
    const pc = G.player.s.pos.clone().setY(G.player.s.pos.y + 1.1); const t = pc.clone().sub(m).dot(dir); const closest = m.clone().addScaledVector(dir, t);
    const hitP = t > 0 && closest.distanceTo(pc) < 0.55 && (!hw || hw.distance > t);
    const end = hitP ? closest : hw ? hw.point : m.clone().addScaledVector(dir, 120);
    G.fxs?.tracer(m, end, true);
    R.flash(m, 0x8fc4ff, 18, 7, 0.05);
    G.fxs?.emit(false, { pos: m, life: 0.06, size: 0.6, size1: 0.2, col: [7, 11, 22] });
    if (hitP) G.player.damage(CFG.shotDmg, e.root.position.clone());
    else if (hw) G.fxs?.impact(hw, dir);
    // near miss whiz
    if (!hitP && t > 0 && closest.distanceTo(pc) < 3.2) G.events.emit('whiz', { pos: closest, d: closest.distanceTo(pc) });
    e.lastShotT = G.time;
    G.events.emit('enemy:fire', { pos: m.clone(), e });
  }
  function damage(e, dmg, hit, dir) {
    if (!e.alive) return;
    if (hit.part === 'shield') { // the plate takes it: sparks, a ring, and it wears down
      const S_ = e.shield; S_.hp -= dmg; S_.flash = 1; G.events.emit('shield:hit', { e, point: hit.point });
      if (dir) for (let i = 0; i < 6; i++) G.fxs?.emit(false, { pos: hit.point, vel: dir.clone().multiplyScalar(-3 - rnd() * 3).add(new THREE.Vector3((rnd() - 0.5) * 4, rnd() * 3, (rnd() - 0.5) * 4)), life: 0.2 + rnd() * 0.2, size: 0.01, stretch: 0.05, col: [16, 10, 4], grav: 9.8, drag: 2 });
      if (e.state !== 'engage') { e.lastKnown = G.player.s.pos.clone(); alert(e); }
      if (S_.hp <= 0) breakShield(e, dir || new THREE.Vector3(0, 0, 1));
      return;
    }
    e.hp -= dmg; const weak = hit.part === 'weak';
    const Q = Math.min(1.6, dmg / 28) * (weak ? 1.6 : 1);
    e.hitSpr.pv -= Q * 6 * (0.6 + rnd() * 0.4); e.hitSpr.rv += (rnd() - 0.5) * Q * 8;
    G.events.emit('enemy:hit', { e, weak, point: hit.point });
    if (e.state !== 'engage') { e.lastKnown = G.player.s.pos.clone(); alert(e); }
    if (e.hp <= 0) kill(e, dir, weak);
    else if (hit.part !== 'weak' && e.hitA && dmg >= 26 && rnd() < 0.35) { e.hitA.reset().setEffectiveWeight(0.7).fadeIn(0.05).play(); setTimeout(() => e.hitA.fadeOut(0.25), 250); }
  }
  function breakShield(e, dir) {
    const S_ = e.shield; if (S_.broken) return; S_.broken = true;
    S_.v.copy(dir).setY(0).normalize().multiplyScalar(-2.5).add(new THREE.Vector3(0, 2.5, 0)); S_.w.set((rnd() - 0.5) * 4, (rnd() - 0.5) * 3, -3 - rnd() * 2);
    e.stagT = 1.3; e.knockV.copy(dir).setY(0).normalize().multiplyScalar(2.5); e.c = { ...e.c, run: 3.8, range: [3, 8] };
    S_.m.getWorldPosition(S_.c); G.fxs?.electric(S_.c); R.flash(S_.c, 0xffb070, 40, 6, 0.1); G.hitstop(0.06);
    for (let i = 0; i < 10; i++) G.fxs?.chunk(S_.c.clone().add(new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.6)), new THREE.Vector3((rnd() - 0.5) * 5, 2 + rnd() * 3, (rnd() - 0.5) * 5), 0.05 + rnd() * 0.08, 0x4a4844, 6, 1);
    G.events.emit('shield:break', { e, pos: S_.c.clone() });
  }
  function shieldBash(e, dir) { e.stagT = 0.55; e.knockV.copy(dir).multiplyScalar(4); const S_ = e.shield; S_.hp -= 140; S_.flash = 1; G.events.emit('shield:hit', { e, point: S_.m.getWorldPosition(new THREE.Vector3()), bash: true }); if (S_.hp <= 0) breakShield(e, dir.clone().negate()); }
  function kill(e, dir, weak) {
    e.alive = false; e.state = 'dead'; e.deadT = 0; if (e.token) { e.token = false; tokens.n--; }
    e.knock = null;
    wreck.spawn(e, dir, weak); e.root.visible = false;
    const hp = e.bones.head.getWorldPosition(new THREE.Vector3());
    G.fxs?.electric(weak ? hp : e.bones.spine_03.getWorldPosition(new THREE.Vector3()));
    const core = e.bones.spine_03.getWorldPosition(new THREE.Vector3());
    for (let i = 0; i < 7; i++) G.fxs?.chunk(core.clone().add(new THREE.Vector3(rnd() - 0.5, rnd() - 0.3, rnd() - 0.5).multiplyScalar(0.4)), new THREE.Vector3((rnd() - 0.5) * 5 + dir.x * 4, 2.5 + rnd() * 4, (rnd() - 0.5) * 5 + dir.z * 4), 0.12 + rnd() * 0.14, rnd() < 0.5 ? 0x3b3a37 : 0x9a8f7c, 9, 1);
    G.fxs?.emit(false, { pos: core, life: 0.12, size: 1.2, size1: 0.3, col: [8, 10, 16] });
    for (let i = 0; i < 6; i++) G.fxs?.chunk(hp.clone().add(new THREE.Vector3(rnd() - 0.5, -rnd() * 0.6, rnd() - 0.5).multiplyScalar(0.3)), new THREE.Vector3((rnd() - 0.5) * 4 + dir.x * 3, 2 + rnd() * 3, (rnd() - 0.5) * 4 + dir.z * 3), 0.04 + rnd() * 0.05, 0x2c2b29, 6);
    for (const m of e.mats) m.emissiveIntensity = 0;
    if (e.shield && !e.shield.broken) { e.shield.broken = true; e.shield.v.set(dir.x * 2, 1.5, dir.z * 2); e.shield.w.set(0, 0, -2.5); }
    G.events.emit('enemy:killed', { e, weak, melee: !!e.meleeHit, pos: e.root.position.clone() });
  }
  // ---------- hit test: bone-following spheres/capsules ----------
  const segs = [['head', null, CFG.headR, 'weak'], ['spine_01', 'neck_01', 0.24, 'body'], ['pelvis', 'spine_01', 0.2, 'body'],
    ['upperarm_l', 'lowerarm_l', 0.08, 'limb'], ['lowerarm_l', 'hand_l', 0.07, 'limb'], ['upperarm_r', 'lowerarm_r', 0.08, 'limb'], ['lowerarm_r', 'hand_r', 0.07, 'limb'],
    ['thigh_l', 'calf_l', 0.1, 'limb'], ['calf_l', 'foot_l', 0.08, 'limb'], ['thigh_r', 'calf_r', 0.1, 'limb'], ['calf_r', 'foot_r', 0.08, 'limb']];
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _ray = new THREE.Ray(), _pt = new THREE.Vector3(), _ps = new THREE.Vector3();
  const _so = new THREE.Vector3(), _sd = new THREE.Vector3(), _sq = new THREE.Quaternion();
  function shieldHit(e, o, d) { // ray vs the shield's box in its own frame
    const m = e.shield.m; m.getWorldQuaternion(_sq).invert(); m.getWorldPosition(_so);
    const lo = o.clone().sub(_so).applyQuaternion(_sq), ld = _sd.copy(d).applyQuaternion(_sq);
    const H = [SHIELD.w / 2, SHIELD.h / 2, SHIELD.t / 2]; let t0 = -1e9, t1 = 1e9;
    for (const [k, h] of [['x', H[0]], ['y', H[1]], ['z', H[2]]]) { if (Math.abs(ld[k]) < 1e-6) { if (Math.abs(lo[k]) > h) return null; continue; } let a = (-h - lo[k]) / ld[k], b = (h - lo[k]) / ld[k]; if (a > b) [a, b] = [b, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return null; }
    return t0 > 0 ? t0 : null;
  }
  function hitTest(o, d, maxD, opt = {}) {
    _ray.set(o, d); let best = null;
    for (const e of list) {
      if (!e.alive) continue;
      if (e.shield && !e.shield.broken && !opt.pierce) { const t = shieldHit(e, o, d); if (t != null && t < maxD && (!best || t < best.distance)) best = { distance: t, enemy: e, part: 'shield', point: o.clone().addScaledVector(d, t) }; }
      const c = e.root.position; if (_ray.distanceSqToPoint(_a.set(c.x, c.y + 1, c.z)) > 2.5 * (e.c.scale || 1) ** 2) continue;
      for (const [b0, b1, r, part] of segs) {
        e.bones[b0].getWorldPosition(_a);
        let dist;
        if (!b1) { // sphere (head, centred a bit up)
          _a.y += 0.06;
          const t = _a.clone().sub(o).dot(d); if (t < 0) continue; _pt.copy(o).addScaledVector(d, t); const dd = _pt.distanceTo(_a); if (dd > r) continue; dist = t - Math.sqrt(r * r - dd * dd);
        } else {
          e.bones[b1].getWorldPosition(_b);
          const sq = _ray.distanceSqToSegment(_a, _b, _pt, _ps); if (sq > r * r) continue; dist = _pt.distanceTo(o) - r * 0.5;
        }
        // a heavy's back carries its power pack: body hits from behind count as weak-point hits
        const pp_ = e.c.shield && part === 'body' && (Math.sin(e.yaw) * d.x + Math.cos(e.yaw) * d.z) > 0.35 ? 'weak' : part;
        if (dist > 0 && dist < maxD && (!best || dist < best.distance)) best = { distance: dist, enemy: e, part: pp_, point: o.clone().addScaledVector(d, dist) };
      }
    }
    return best;
  }
  // ---------- rifle placement: grip in the right hand, muzzle along the aim line ----------
  const _gp = new THREE.Vector3(), _gl = new THREE.Vector3(), _gm = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0);
  // Rifle hold: the clip library only has pistol poses, so the rifle is shouldered procedurally
  // (stock in the right shoulder pocket, bore along the aim line) and both arms are solved onto it
  // with analytic two-bone IK (right hand on the pistol grip, left hand on the handguard).
  const UPV = new THREE.Vector3(0, 1, 0);
  const _ia = new THREE.Vector3(), _ib = new THREE.Vector3(), _ic = new THREE.Vector3(), _it = new THREE.Vector3(), _el = new THREE.Vector3();
  const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _wq = new THREE.Quaternion(), _rt = new THREE.Vector3(), _upw = new THREE.Vector3();
  function rotateBoneWorld(bone, from, to) {
    _q.setFromUnitVectors(from.normalize(), to.normalize());
    bone.getWorldQuaternion(_wq); _wq.premultiply(_q);
    bone.parent.getWorldQuaternion(_pq); bone.quaternion.copy(_pq.invert().multiply(_wq));
    bone.updateMatrixWorld(true);
  }
  function yawBoneWorld(bone, ang) {
    _q.setFromAxisAngle(UPV, ang); bone.getWorldQuaternion(_wq); _wq.premultiply(_q);
    bone.parent.getWorldQuaternion(_pq); bone.quaternion.copy(_pq.invert().multiply(_wq)); bone.updateMatrixWorld(true);
  }
  function ik2(up, lo, hand, target, pole) {
    up.getWorldPosition(_ia); lo.getWorldPosition(_ib); hand.getWorldPosition(_ic);
    const l1 = _ia.distanceTo(_ib), l2 = _ib.distanceTo(_ic);
    const d = THREE.MathUtils.clamp(_ia.distanceTo(target), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
    const ax = _it.copy(target).sub(_ia).normalize();
    const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const pp = pole.clone().addScaledVector(ax, -pole.dot(ax)).normalize();
    _el.copy(_ia).addScaledVector(ax, l1 * cosA).addScaledVector(pp, l1 * sinA);
    rotateBoneWorld(up, _ib.clone().sub(_ia), _el.clone().sub(_ia));
    lo.getWorldPosition(_ib); hand.getWorldPosition(_ic);
    const tgt = _ia.clone().addScaledVector(ax, d);
    rotateBoneWorld(lo, _ic.clone().sub(_ib), tgt.sub(_ib));
  }
  function placeGun(e, aim, at) {
    const B_ = e.bones;
    // bladed rifle stance: torso turns so the support shoulder comes forward, head counter-turns onto the target
    e.o.updateMatrixWorld(true);
    yawBoneWorld(B_.spine_02, HOLD.twist * 0.55); yawBoneWorld(B_.spine_03, HOLD.twist * 0.45); yawBoneWorld(B_.neck_01, -HOLD.twist * 0.7); yawBoneWorld(B_.head, -HOLD.twist * 0.3);
    e.o.updateMatrixWorld(true);
    B_.upperarm_r.getWorldPosition(_gp);
    let dir;
    if (at) dir = at.clone().sub(_gp).normalize();
    else if (aim && !G.player.s.dead) dir = playerEye().clone().sub(_gp).normalize();
    else dir = new THREE.Vector3(Math.sin(e.yaw), -0.62, Math.cos(e.yaw)).normalize();
    // keep the bore within a believable cone of the torso's facing
    const f = new THREE.Vector3(Math.sin(e.yaw), 0, Math.cos(e.yaw));
    const h = dir.clone().setY(0); if (h.lengthSq() < 1e-4) h.copy(f); h.normalize();
    if (h.dot(f) < 0.8) { h.lerp(f, 0.6).normalize(); dir.set(h.x * Math.hypot(dir.x, dir.z), dir.y, h.z * Math.hypot(dir.x, dir.z)).normalize(); }
    _rt.crossVectors(dir, UPV).normalize(); _upw.crossVectors(_rt, dir).normalize();
    _gm.lookAt(new THREE.Vector3(0, 0, 0), dir.clone().negate(), _upw); // -Z of the gun -> dir
    e.gun.quaternion.setFromRotationMatrix(_gm);
    // pistol grip sits ahead of and below the shoulder pocket, pulled toward the chest centreline
    e.gun.position.copy(_gp).addScaledVector(dir, HOLD.fwd).addScaledVector(_upw, HOLD.down).addScaledVector(_rt, HOLD.inward);
    e.gun.visible = e.root.visible;
    e.gun.updateMatrixWorld(true);
    // right hand -> grip (wrist sits slightly behind/above the grip origin)
    const rT = e.gun.position.clone().addScaledVector(dir, HOLD.rBack).addScaledVector(_upw, HOLD.rUp);
    ik2(B_.upperarm_r, B_.lowerarm_r, B_.hand_r, rT, _upw.clone().multiplyScalar(-1).addScaledVector(_rt, 0.7).addScaledVector(dir, -0.3));
    if (e.shield && !e.shield.broken) { placeShield(e); return; }
    // left hand -> handguard
    const lT = e.gun.position.clone().addScaledVector(dir, HOLD.lFwd).addScaledVector(_upw, HOLD.lUp).addScaledVector(_rt, HOLD.lSide);
    ik2(B_.upperarm_l, B_.lowerarm_l, B_.hand_l, lT, _upw.clone().multiplyScalar(-1).addScaledVector(_rt, -HOLD.lPole).addScaledVector(dir, 0.15));
  }
  // the shield rides on the left forearm: in front of the body, edged left so the rifle can fire past its right side
  const _sh = new THREE.Vector3();
  function placeShield(e) {
    const S_ = e.shield, sc = e.c.scale || 1, f = new THREE.Vector3(Math.sin(e.yaw), 0, Math.cos(e.yaw)), r = new THREE.Vector3(f.z, 0, -f.x);
    const bob = Math.sin(G.time * 5 + e.id) * 0.02 * Math.min(1, e.vel.length());
    S_.m.position.copy(e.root.position).addScaledVector(f, 0.62 * sc).addScaledVector(r, 0.16 * sc).setY(e.root.position.y + (SHIELD.h / 2 + 0.38) * sc * 0.9 + bob);
    S_.m.rotation.set(0.06, e.yaw - 0.12, 0); S_.m.scale.setScalar(sc * 0.95); S_.m.visible = e.root.visible; S_.m.updateMatrixWorld(true);
    _sh.copy(S_.m.position).addScaledVector(f, -0.12).add(new THREE.Vector3(0, -0.05, 0));
    ik2(e.bones.upperarm_l, e.bones.lowerarm_l, e.bones.hand_l, _sh, new THREE.Vector3(0, -1, 0).addScaledVector(r, 0.6));
  }
  function updShieldDebris(e, dt) { // a broken or dropped shield tumbles and lies where it fell
    const S_ = e.shield; if (!S_ || !S_.broken || S_.rest) return;
    S_.v.y -= 9.8 * dt; S_.m.position.addScaledVector(S_.v, dt); S_.m.rotation.x += S_.w.z * dt * 0.5; S_.m.rotation.z += S_.w.x * dt * 0.3;
    if (S_.m.position.y < 0.08) { S_.m.position.y = 0.08; S_.m.rotation.set(-Math.PI / 2 + 0.05, S_.m.rotation.y, 0); S_.rest = true; G.events.emit('shield:land', { pos: S_.m.position.clone() }); }
  }
  // ---------- update ----------
  function update(dt) {
    wreck.update(dt); dt *= G.enemyTime ?? 1; // overdrive slows the robots, not the player
    const pp = G.player.s.pos, pdead = G.player.s.dead;
    for (const e of list) {
      // PropertyMixer only writes a bone when its sampled value changes, so constant tracks would let
      // last frame's procedural edits pile up: restore the pure animated pose before sampling.
      for (let i = 0; i < e.pb.length; i++) e.pb[i].quaternion.copy(e.pq[i]);
      e.mixer.update(dt);
      for (let i = 0; i < e.pb.length; i++) e.pq[i].copy(e.pb[i].quaternion);
      if (e.shield) { updShieldDebris(e, dt); if (e.shield.flash > 0) e.shield.flash = Math.max(0, e.shield.flash - dt * 6); }
      if (!e.alive) {
        e.deadT += dt;
        if (e.deadT < 0.05) e.gunV = new THREE.Vector3((rnd() - 0.5) * 2, 2, (rnd() - 0.5) * 2);
        if (e.gun.position.y > 0.05) { e.gunV.y -= 9.8 * dt; e.gun.position.addScaledVector(e.gunV, dt); e.gun.rotateX(dt * 3); } 
        if (e.deadT > 15) e.gun.visible = false;
        continue;
      }
      if (e.scanT > 0) e.scanT -= dt;
      if (e.stagT > 0) { // knocked back by a melee hit: slide, no thinking or shooting
        e.stagT -= dt; const nx = e.root.position.x + e.knockV.x * dt, nz = e.root.position.z + e.knockV.z * dt;
        if (!P.blocked(nx, nz, 0.4)) e.root.position.set(nx, e.root.position.y, nz);
        e.knockV.multiplyScalar(Math.exp(-7 * dt)); e.root.rotation.y = e.yaw; e.o.updateMatrixWorld(true); placeGun(e, false); continue;
      }
      if (e.puppet) { // scripted (trailer / showcase): pose only, aim where told
        e.root.rotation.y = e.yaw; play(e, 'L', e.puppetL || 'Pistol_Idle'); play(e, 'U', e.puppetU || 'Pistol_Aim_Neutral', 0.25);
        e.o.updateMatrixWorld(true); placeGun(e, false, e.puppetAim); for (const m of e.mats) m.emissiveIntensity = 4.5 + e.glow * 14; continue;
      }
      const toP = _v.copy(pp).sub(e.root.position); toP.y = 0; const dist = toP.length();
      // perception
      e.think -= dt;
      if (e.think <= 0) {
        e.think = 0.11 + rnd() * 0.08;
        const see = !pdead && canSee(e);
        e.sees = see;
        if (see) { e.seeT += 0.15; e.lastKnown = pp.clone(); e.lostT = 0; } else { e.seeT = Math.max(0, e.seeT - 0.09); e.lostT += 0.15; }
        if (e.state !== 'engage' && e.seeT > (e.state === 'patrol' ? CFG.react : CFG.react * 0.45)) alert(e);
        if (e.state === 'engage' && e.lostT > 4) { e.state = 'search'; e.searchT = 8 + rnd() * 3; setGoal(e, e.lastKnown); }
      }
      if (e.state === 'search') { e.searchT -= dt; if (e.searchT <= 0) { e.state = 'patrol'; e.home = e.root.position.clone(); } }
      if (e.state === 'patrol') { e.patrolT -= dt; if (e.patrolT <= 0 || (!e.wp.length && !e.goal)) { e.patrolT = 4 + rnd() * 5; const a = rnd() * 6.28; const g = e.home.clone().add(new THREE.Vector3(Math.cos(a) * 4, 0, Math.sin(a) * 4)); if (!P.blocked(g.x, g.z, 0.45)) setGoal(e, g); } }
      // combat mode machine: move -> aim -> tele -> burst -> cool
      let aiming = false;
      if (e.state === 'engage' && !pdead) {
        e.modeT += dt;
        if (e.mode === 'move' && e.kind === 'charger' && e.sees && dist < 12) { e.shotT -= dt; if (e.shotT <= 0) { shoot(e); e.shotT = 0.16 + rnd() * 0.12; } }
        if (e.mode === 'move') {
          if (!e.wp.length || e.modeT > 7) { e.mode = 'aim'; e.modeT = 0; }
          if (e.goal && pp.distanceTo(e.goal) > 0 && (e.goal.distanceTo(pp) < e.c.range[0] - 3)) { setGoal(e, pickSpot(e)); }
        } else {
          aiming = true;
          if (e.mode === 'aim') {
            const facing = Math.abs(angleDiff(Math.atan2(toP.x, toP.z), e.yaw)) < 0.14;
            if (facing && e.sees && tokens.n < CFG.maxTokens && G.time - tokens.last > CFG.tokenGap / 2) { tokens.n++; tokens.last = G.time; e.token = true; e.mode = 'tele'; e.modeT = 0; G.events.emit('enemy:tele', { e }); }
            if (!e.sees && e.modeT > 1.5) { e.mode = 'move'; e.modeT = 0; setGoal(e, pickSpot(e)); }
          } else if (e.mode === 'tele') { e.glow = Math.min(1, e.modeT / e.c.tele); if (e.modeT >= e.c.tele) { e.mode = 'burst'; e.modeT = 0; e.burstN = 0; e.shotT = 0; } }
          else if (e.mode === 'burst') { e.shotT -= dt; if (e.shotT <= 0) { if (e.sees) shoot(e); e.burstN++; e.shotT = e.c.burstGap; if (e.burstN >= e.c.burst) { e.mode = 'cool'; e.modeT = 0; e.coolD = e.c.cool[0] + rnd() * (e.c.cool[1] - e.c.cool[0]); if (e.token) { e.token = false; tokens.n--; } } } }
          else if (e.mode === 'cool') { if (e.modeT > e.coolD) { e.mode = (rnd() < 0.45 || (e.goal && e.goal.distanceTo(pp) > e.c.range[1] + 3) || !e.sees) ? 'move' : 'aim'; e.modeT = 0; if (e.mode === 'move') setGoal(e, pickSpot(e)); } }
        }
      }
      if (e.mode !== 'tele') e.glow = Math.max(0, e.glow - dt * 3);
      // never strand a robot: with no route to follow and the player far away, re-plan toward the player;
      // if the grid still has no route, walk straight at them
      if (!e.wp.length && dist > 9 && (e.state === 'investigate' || e.state === 'search' || (e.state === 'engage' && e.mode === 'move'))) {
        e.stuckT = (e.stuckT || 0) + dt;
        if (e.stuckT > 1.5) { e.stuckT = 0; e.lastKnown = pp.clone(); setGoal(e, pp); if (!e.wp.length) e.wp = [pp.clone()]; if (e.state === 'search') e.state = 'investigate'; }
      } else e.stuckT = 0;
      // steering
      e.repath -= dt;
      let tv = new THREE.Vector3();
      const moving = e.state !== 'engage' || e.mode === 'move';
      if (moving && e.wp.length) {
        const wp = e.wp[0]; const d = wp.clone().sub(e.root.position).setY(0); if (d.length() < 0.55) e.wp.shift();
        else tv.copy(d.normalize()).multiplyScalar(e.state === 'engage' ? e.c.run : e.state === 'investigate' || e.state === 'search' ? e.c.run * 0.6 : CFG.walk);
      }
      // separation
      for (const o of list) if (o !== e && o.alive) { const d = e.root.position.clone().sub(o.root.position).setY(0); const l = d.length(); if (l < 1.2 && l > 1e-3) tv.addScaledVector(d.normalize(), (1.2 - l) * 3); }
      e.vel.lerp(tv, Math.min(1, CFG.accel * dt / Math.max(1, e.vel.distanceTo(tv))));
      const np = e.root.position.clone().addScaledVector(e.vel, dt);
      if (!P.blocked(np.x, np.z, 0.38, 0.3, 1.6)) e.root.position.copy(np); else e.vel.multiplyScalar(0.2);
      // facing: aim at player when engaged, else face velocity
      const want = (e.state === 'engage' && !pdead) ? Math.atan2(toP.x, toP.z) : (e.vel.lengthSq() > 0.05 ? Math.atan2(e.vel.x, e.vel.z) : e.yaw);
      e.yaw += THREE.MathUtils.clamp(angleDiff(want, e.yaw), -(e.c.turn || CFG.turn) * dt, (e.c.turn || CFG.turn) * dt);
      e.root.rotation.y = e.yaw;
      // animation selection (lower = locomotion relative to facing; upper = aim/shoot or match)
      const sp = e.vel.length();
      const lv = e.vel.clone().applyAxisAngle(UPV, -e.yaw);
      let lname = 'Pistol_Idle';
      if (sp > 0.3) lname = Math.abs(lv.x) > Math.abs(lv.z) ? (lv.x > 0 ? 'Strafe_left' : 'Strafe_right') : lv.z < 0 ? 'Walk_Backwards' : sp > 2.6 ? 'Jog' : 'Walk';
      play(e, 'L', L[lname] ? lname : 'Pistol_Idle');
      const uname = (aiming || e.state === 'engage') ? (e.mode === 'burst' ? 'Pistol_Shoot' : 'Pistol_Aim_Neutral') : (sp > 0.3 ? (U[lname] ? lname : 'Pistol_Idle') : 'Pistol_Idle');
      play(e, 'U', uname, 0.18);
      if (e.curL) e.curL.timeScale = sp > 0.3 ? THREE.MathUtils.clamp(sp / (lname === 'Jog' ? 3.6 : 1.5), 0.6, 1.5) : 1;
      // procedural: spine pitch toward player eye + hit-reaction springs
      const hs = e.hitSpr; for (let k = 0; k < 3; k++) { const h = dt / 3; hs.pv += (-hs.p * 300 - hs.pv * 20) * h; hs.p += hs.pv * h; hs.rv += (-hs.r * 300 - hs.rv * 20) * h; hs.r += hs.rv * h; }
      if (e.state === 'engage') { const pitch = Math.atan2(playerEye().y - 1.5, Math.max(1, dist)); e.bones.spine_02.rotateX(-pitch * 0.5); e.bones.spine_03.rotateX(-pitch * 0.5); }
      e.bones.spine_02.rotateX(hs.p * 0.6); e.bones.spine_03.rotateZ(hs.r * 0.5); e.bones.neck_01.rotateX(hs.p * 0.4);
      for (const m of e.mats) m.emissiveIntensity = (4.5 + e.glow * 14) * (1 + 2.5 * (G.env?.S.inside || 0)); // visors burn through the sand
      placeGun(e, aiming || e.state === 'engage');
    }
  }
  // something new lies on the ground (a fallen column): re-mark the cells under it
  function reblock(min, max) { const [i0, j0] = cell(min.x - 0.5, min.z - 0.5), [i1, j1] = cell(max.x + 0.5, max.z + 0.5); for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) block[j * NX + i] = P.blocked(B.minX + (i + 0.5) * CS, B.minZ + (j + 0.5) * CS, 0.42) ? 1 : 0; }
  return { update, spawn, list, hitTest, damage, shieldBash, reblock, CFG, KINDS, path, alert, canReach: (a, b) => !!path(a, b), get alive() { return list.filter((e) => e.alive).length; } };
}
function angleDiff(a, b) { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
