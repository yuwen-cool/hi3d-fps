import * as THREE from 'three';
import { clone as skClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { loadRobotRig } from './anim.js';
import { alignedGun } from '../weapon/align.js';
import { patchMaterial } from '../mats/patch.js';

// Hi3D combat robots. AI layer follows docs/SPEC.md §6.1 (perception, attack tokens, firing
// positions scored away from teammates and into line of sight, telegraph -> burst -> cool).
// Animation: Mesh2Motion clips retargeted at load, split into lower-body locomotion and
// upper-body aim/shoot layers.
const CFG = { hp: 140, headR: 0.15, shotDmg: 5, burst: 4, burstGap: 0.11, cool: [1.6, 2.8], tele: 0.5, spreadFar: 0.06, spreadNear: 0.03,
  run: 4.2, walk: 1.6, accel: 7, turn: 3.0, range: [8, 20], sight: 48, fovCos: Math.cos(1.75), react: 0.55, height: 1.9, maxTokens: 2, tokenGap: 1.1 };
const UPPER = /^(spine|neck|head|clavicle|upperarm|lowerarm|hand|index|middle|ring|pinky|thumb)/;
function subClip(c, upper, name) { return new THREE.AnimationClip(name, c.duration, c.tracks.filter((t) => UPPER.test(t.name.split('.')[0]) === upper)); }

export async function createEnemies(G) {
  const R = G.R, P = G.phys, scene = R.scene, rnd = G.rng;
  const { gltf, clips } = await loadRobotRig();
  const src = gltf.scene;
  src.traverse((m) => { if (m.isMesh) { m.castShadow = m.receiveShadow = true; m.frustumCulled = false; patchMaterial(m.material, 'robot'); m.material.emissiveIntensity = 2.5; } });
  const L = {}, U = {};
  for (const n of ['Jog', 'Walk', 'Strafe_left', 'Strafe_right', 'Walk_Backwards', 'Sprint', 'Pistol_Idle', 'Idle_A', 'Run_Stealth']) if (clips[n]) L[n] = subClip(clips[n], false, n + '_L');
  for (const n of ['Pistol_Aim_Neutral', 'Pistol_Shoot', 'Pistol_Idle', 'Pistol_Reload', 'Jog', 'Walk', 'Sprint']) if (clips[n]) U[n] = subClip(clips[n], true, n + '_U');
  const gunA = await alignedGun('rifle_v1'); const gunSrc = gunA.group;
  const list = [], tokens = { n: 0, last: 0 }; let gripFit = null;
  // ---------- nav grid ----------
  const B = G.level.layout.bounds, CS = 0.5, NX = Math.ceil((B.maxX - B.minX) / CS), NZ = Math.ceil((B.maxZ - B.minZ) / CS);
  const block = new Uint8Array(NX * NZ);
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) block[j * NX + i] = P.blocked(B.minX + (i + 0.5) * CS, B.minZ + (j + 0.5) * CS, 0.42) ? 1 : 0;
  const cell = (x, z) => [THREE.MathUtils.clamp(Math.floor((x - B.minX) / CS), 0, NX - 1), THREE.MathUtils.clamp(Math.floor((z - B.minZ) / CS), 0, NZ - 1)];
  function path(from, to) {
    const [sx, sz] = cell(from.x, from.z), [tx, tz] = cell(to.x, to.z);
    const S = sz * NX + sx, T = tz * NX + tx; if (block[T]) return null;
    const g = new Float32Array(NX * NZ).fill(1e9), came = new Int32Array(NX * NZ).fill(-1), open = [S]; g[S] = 0; const closed = new Uint8Array(NX * NZ);
    const h = (k) => Math.hypot((k % NX) - tx, Math.floor(k / NX) - tz);
    let it = 0;
    while (open.length && it++ < 6000) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (g[open[i]] + h(open[i]) < g[open[bi]] + h(open[bi])) bi = i;
      const c = open.splice(bi, 1)[0]; if (c === T) break; closed[c] = 1;
      const cx = c % NX, cz = Math.floor(c / NX);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        if (!dx && !dz) continue; const nx = cx + dx, nz = cz + dz; if (nx < 0 || nz < 0 || nx >= NX || nz >= NZ) continue;
        const k = nz * NX + nx; if (block[k] || closed[k]) continue; if (dx && dz && (block[cz * NX + nx] || block[nz * NX + cx])) continue;
        const ng = g[c] + (dx && dz ? 1.414 : 1); if (ng < g[k]) { g[k] = ng; came[k] = c; if (!open.includes(k)) open.push(k); }
      }
    }
    if (came[T] < 0 && S !== T) return null;
    const pts = []; for (let k = T; k !== S && k >= 0; k = came[k]) pts.push(new THREE.Vector3(B.minX + (k % NX + 0.5) * CS, 0, B.minZ + (Math.floor(k / NX) + 0.5) * CS));
    pts.reverse();
    // string-pull with box LOS at knee height
    const out = []; let a = from.clone();
    for (let i = 0; i < pts.length; i++) { const nxt = pts[i + 1]; if (!nxt || !P.los(a.clone().setY(0.5), nxt.clone().setY(0.5))) { out.push(pts[i]); a = pts[i]; } }
    return out;
  }

  function spawn(pos, opts = {}) {
    const o = skClone(src); o.scale.setScalar(CFG.height);
    const root = new THREE.Group(); root.add(o); root.position.copy(pos); scene.add(root);
    const bones = {}; o.traverse((b) => { if (b.isBone) bones[b.name] = b; });
    const mats = []; o.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); patchMaterial(m.material, 'robot'); mats.push(m.material); } });
    // rifle in the right hand
    const gun = gunSrc.clone(true); scene.add(gun); // placed in world space each frame (robust to any clip)
    gun.userData.fit = true;
    gun.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    const mixer = new THREE.AnimationMixer(o);
    const act = {}; for (const [k, c] of Object.entries(L)) act['L' + k] = mixer.clipAction(c); for (const [k, c] of Object.entries(U)) act['U' + k] = mixer.clipAction(c);
    const death = {}; for (const n of ['Death_A', 'Death_B', 'Death_C', 'Death_D']) if (clips[n]) { const a = mixer.clipAction(clips[n]); a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; death[n] = a; }
    const hitA = clips.Hit_Chest ? mixer.clipAction(subClip(clips.Hit_Chest, true, 'Hit_U')) : null; if (hitA) { hitA.setLoop(THREE.LoopOnce); }
    const e = {
      root, o, bones, mats, mixer, act, death, hitA, gun, hp: CFG.hp, alive: true, state: opts.state || 'patrol', seeT: 0, lostT: 0, think: rnd() * 0.15,
      vel: new THREE.Vector3(), yaw: opts.yaw ?? Math.PI, wp: [], goal: null, repath: 0, mode: 'move', modeT: 0, burstN: 0, shotT: 0, token: false,
      lastKnown: null, home: pos.clone(), patrolT: 0, hitSpr: { p: 0, pv: 0, r: 0, rv: 0 }, curL: null, curU: null, deadT: 0, id: list.length, glow: 0,
    };
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
    for (let i = 0; i < 7; i++) { const a = rnd() * 6.28, r = CFG.range[0] + rnd() * (CFG.range[1] - CFG.range[0]); cands.push({ p: new THREE.Vector3(pp.x + Math.cos(a) * r, 0, pp.z + Math.sin(a) * r), pri: 0 }); }
    const base = Math.atan2(e.root.position.z - pp.z, e.root.position.x - pp.x);
    for (let i = 0; i < 5; i++) { const a = base + (i - 2) * 0.65, r = 12; cands.push({ p: new THREE.Vector3(pp.x + Math.cos(a) * r, 0, pp.z + Math.sin(a) * r), pri: 0 }); }
    let best = null, bs = 1e9;
    for (const c of cands) {
      const d = c.p.distanceTo(pp); if (d < CFG.range[0] || d > CFG.range[1] + 4 || P.blocked(c.p.x, c.p.z, 0.45)) continue;
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
    G.fxs?.tracer(m, end);
    R.flash(m, 0xffb060, 16, 7, 0.05);
    G.fxs?.emit(false, { pos: m, life: 0.05, size: 0.55, size1: 0.2, col: [14, 8, 3] });
    if (hitP) G.player.damage(CFG.shotDmg, e.root.position.clone());
    else if (hw) G.fxs?.impact(hw, dir);
    // near miss whiz
    if (!hitP && t > 0 && closest.distanceTo(pc) < 3.2) G.events.emit('whiz', { pos: closest, d: closest.distanceTo(pc) });
    G.events.emit('enemy:fire', { pos: m.clone(), e });
  }
  function damage(e, dmg, hit, dir) {
    if (!e.alive) return;
    e.hp -= dmg; const weak = hit.part === 'weak';
    const Q = Math.min(1.6, dmg / 28) * (weak ? 1.6 : 1);
    e.hitSpr.pv -= Q * 6 * (0.6 + rnd() * 0.4); e.hitSpr.rv += (rnd() - 0.5) * Q * 8;
    G.events.emit('enemy:hit', { e, weak, point: hit.point });
    if (e.state !== 'engage') { e.lastKnown = G.player.s.pos.clone(); alert(e); }
    if (e.hp <= 0) kill(e, dir, weak);
    else if (hit.part !== 'weak' && e.hitA && dmg >= 26 && rnd() < 0.35) { e.hitA.reset().setEffectiveWeight(0.7).fadeIn(0.05).play(); setTimeout(() => e.hitA.fadeOut(0.25), 250); }
  }
  function kill(e, dir, weak) {
    e.alive = false; e.state = 'dead'; e.deadT = 0; if (e.token) { e.token = false; tokens.n--; }
    // fall direction relative to the robot's facing
    const local = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -e.yaw);
    const name = Math.abs(local.x) > Math.abs(local.z) ? (local.x > 0 ? 'Death_B' : 'Death_C') : (local.z > 0 ? 'Death_A' : 'Death_D');
    const a = e.death[name] || Object.values(e.death)[0];
    e.mixer.stopAllAction(); if (a) { a.reset().play(); }
    e.knock = dir.clone().setY(0).normalize().multiplyScalar(0.6);
    const hp = e.bones.head.getWorldPosition(new THREE.Vector3());
    G.fxs?.electric(weak ? hp : e.bones.spine_03.getWorldPosition(new THREE.Vector3()));
    const core = e.bones.spine_03.getWorldPosition(new THREE.Vector3());
    for (let i = 0; i < 7; i++) G.fxs?.chunk(core.clone().add(new THREE.Vector3(rnd() - 0.5, rnd() - 0.3, rnd() - 0.5).multiplyScalar(0.4)), new THREE.Vector3((rnd() - 0.5) * 5 + dir.x * 4, 2.5 + rnd() * 4, (rnd() - 0.5) * 5 + dir.z * 4), 0.12 + rnd() * 0.14, rnd() < 0.5 ? 0x3b3a37 : 0x9a8f7c, 9, 1);
    G.fxs?.emit(false, { pos: core, life: 0.12, size: 1.2, size1: 0.3, col: [8, 10, 16] });
    for (let i = 0; i < 6; i++) G.fxs?.chunk(hp.clone().add(new THREE.Vector3(rnd() - 0.5, -rnd() * 0.6, rnd() - 0.5).multiplyScalar(0.3)), new THREE.Vector3((rnd() - 0.5) * 4 + dir.x * 3, 2 + rnd() * 3, (rnd() - 0.5) * 4 + dir.z * 3), 0.04 + rnd() * 0.05, 0x2c2b29, 6);
    for (const m of e.mats) m.emissiveIntensity = 0;
    G.events.emit('enemy:killed', { e, weak, pos: e.root.position.clone() });
  }
  // ---------- hit test: bone-following spheres/capsules ----------
  const segs = [['head', null, CFG.headR, 'weak'], ['spine_01', 'neck_01', 0.24, 'body'], ['pelvis', 'spine_01', 0.2, 'body'],
    ['upperarm_l', 'lowerarm_l', 0.08, 'limb'], ['lowerarm_l', 'hand_l', 0.07, 'limb'], ['upperarm_r', 'lowerarm_r', 0.08, 'limb'], ['lowerarm_r', 'hand_r', 0.07, 'limb'],
    ['thigh_l', 'calf_l', 0.1, 'limb'], ['calf_l', 'foot_l', 0.08, 'limb'], ['thigh_r', 'calf_r', 0.1, 'limb'], ['calf_r', 'foot_r', 0.08, 'limb']];
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _ray = new THREE.Ray(), _pt = new THREE.Vector3(), _ps = new THREE.Vector3();
  function hitTest(o, d, maxD) {
    _ray.set(o, d); let best = null;
    for (const e of list) {
      if (!e.alive) continue;
      const c = e.root.position; if (_ray.distanceSqToPoint(_a.set(c.x, c.y + 1, c.z)) > 2.5) continue;
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
        if (dist > 0 && dist < maxD && (!best || dist < best.distance)) best = { distance: dist, enemy: e, part, point: o.clone().addScaledVector(d, dist) };
      }
    }
    return best;
  }
  // ---------- rifle placement: grip in the right hand, muzzle along the aim line ----------
  const _gp = new THREE.Vector3(), _gl = new THREE.Vector3(), _gm = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0);
  function placeGun(e, aim) {
    e.o.updateMatrixWorld(true);
    e.bones.hand_r.getWorldPosition(_gp); e.bones.hand_l.getWorldPosition(_gl);
    let dir;
    if (aim && !G.player.s.dead) dir = playerEye().clone().sub(_gp).normalize();
    else dir = new THREE.Vector3(Math.sin(e.yaw), -0.55, Math.cos(e.yaw)).normalize();
    _gm.lookAt(new THREE.Vector3(0, 0, 0), dir.clone().negate(), _up); // -Z of the gun -> dir
    e.gun.quaternion.setFromRotationMatrix(_gm);
    e.gun.position.copy(_gp).addScaledVector(dir, 0.04).y += 0.02;
    e.gun.visible = e.root.visible;
  }
  // ---------- update ----------
  const UPV = new THREE.Vector3(0, 1, 0);
  function update(dt) {
    const pp = G.player.s.pos, pdead = G.player.s.dead;
    for (const e of list) {
      e.mixer.update(dt);
      if (!e.alive) {
        e.deadT += dt; if (e.knock && e.deadT < 0.4) e.root.position.addScaledVector(e.knock, dt * (1 - e.deadT / 0.4));
        // wreck: electrical sputter + smoke for a few seconds
        if (e.deadT < 4 && G.fxs) {
          if (rnd() < dt * 6) { const c = e.bones.spine_03.getWorldPosition(new THREE.Vector3()); for (let i = 0; i < 5; i++) G.fxs.emit(false, { pos: c, vel: new THREE.Vector3((rnd() - 0.5) * 6, 2 + rnd() * 4, (rnd() - 0.5) * 6), life: 0.2 + rnd() * 0.3, size: 0.01, stretch: 0.06, col: [8, 11, 18], grav: 9.8 }); R.flash(c, 0x9fd8ff, 3, 2.5, 0.06); }
          if (rnd() < dt * 9) { const c = e.bones.spine_02.getWorldPosition(new THREE.Vector3()); G.fxs.emit(true, { pos: c, vel: new THREE.Vector3(0.3, 0.8, 0.2), life: 2.6, size: 0.15, size1: 0.9, col: G.fxs.litColor([0.1, 0.09, 0.085]), alpha: 0.45, soft: true, drag: 0.8, rise: 0.4 }); }
        }
        if (e.deadT < 0.05) e.gunV = new THREE.Vector3((rnd() - 0.5) * 2, 2, (rnd() - 0.5) * 2);
        if (e.gun.position.y > 0.05) { e.gunV.y -= 9.8 * dt; e.gun.position.addScaledVector(e.gunV, dt); e.gun.rotateX(dt * 3); } 
        if (e.deadT > 12) { e.root.position.y -= dt * 0.22; if (e.deadT > 15) { e.root.visible = false; e.gun.visible = false; } }
        continue;
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
        if (e.mode === 'move') {
          if (!e.wp.length || e.modeT > 7) { e.mode = 'aim'; e.modeT = 0; }
          if (e.goal && pp.distanceTo(e.goal) > 0 && (e.goal.distanceTo(pp) < CFG.range[0] - 3)) { setGoal(e, pickSpot(e)); }
        } else {
          aiming = true;
          if (e.mode === 'aim') {
            const facing = Math.abs(angleDiff(Math.atan2(toP.x, toP.z), e.yaw)) < 0.14;
            if (facing && e.sees && tokens.n < CFG.maxTokens && G.time - tokens.last > CFG.tokenGap / 2) { tokens.n++; tokens.last = G.time; e.token = true; e.mode = 'tele'; e.modeT = 0; G.events.emit('enemy:tele', { e }); }
            if (!e.sees && e.modeT > 1.5) { e.mode = 'move'; e.modeT = 0; setGoal(e, pickSpot(e)); }
          } else if (e.mode === 'tele') { e.glow = Math.min(1, e.modeT / CFG.tele); if (e.modeT >= CFG.tele) { e.mode = 'burst'; e.modeT = 0; e.burstN = 0; e.shotT = 0; } }
          else if (e.mode === 'burst') { e.shotT -= dt; if (e.shotT <= 0) { if (e.sees) shoot(e); e.burstN++; e.shotT = CFG.burstGap; if (e.burstN >= CFG.burst) { e.mode = 'cool'; e.modeT = 0; e.coolD = CFG.cool[0] + rnd() * (CFG.cool[1] - CFG.cool[0]); if (e.token) { e.token = false; tokens.n--; } } } }
          else if (e.mode === 'cool') { if (e.modeT > e.coolD) { e.mode = (rnd() < 0.45 || (e.goal && e.goal.distanceTo(pp) > CFG.range[1] + 3) || !e.sees) ? 'move' : 'aim'; e.modeT = 0; if (e.mode === 'move') setGoal(e, pickSpot(e)); } }
        }
      }
      if (e.mode !== 'tele') e.glow = Math.max(0, e.glow - dt * 3);
      // steering
      e.repath -= dt;
      let tv = new THREE.Vector3();
      const moving = e.state !== 'engage' || e.mode === 'move';
      if (moving && e.wp.length) {
        const wp = e.wp[0]; const d = wp.clone().sub(e.root.position).setY(0); if (d.length() < 0.55) e.wp.shift();
        else tv.copy(d.normalize()).multiplyScalar(e.state === 'engage' ? CFG.run : e.state === 'investigate' || e.state === 'search' ? CFG.run * 0.6 : CFG.walk);
      }
      // separation
      for (const o of list) if (o !== e && o.alive) { const d = e.root.position.clone().sub(o.root.position).setY(0); const l = d.length(); if (l < 1.2 && l > 1e-3) tv.addScaledVector(d.normalize(), (1.2 - l) * 3); }
      e.vel.lerp(tv, Math.min(1, CFG.accel * dt / Math.max(1, e.vel.distanceTo(tv))));
      const np = e.root.position.clone().addScaledVector(e.vel, dt);
      if (!P.blocked(np.x, np.z, 0.38, 0.3, 1.6)) e.root.position.copy(np); else e.vel.multiplyScalar(0.2);
      // facing: aim at player when engaged, else face velocity
      const want = (e.state === 'engage' && !pdead) ? Math.atan2(toP.x, toP.z) : (e.vel.lengthSq() > 0.05 ? Math.atan2(e.vel.x, e.vel.z) : e.yaw);
      e.yaw += THREE.MathUtils.clamp(angleDiff(want, e.yaw), -CFG.turn * dt, CFG.turn * dt);
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
      for (const m of e.mats) m.emissiveIntensity = 2.5 + e.glow * 14;
      placeGun(e, aiming || e.state === 'engage');
    }
  }
  return { update, spawn, list, hitTest, damage, CFG, get alive() { return list.filter((e) => e.alive).length; } };
}
function angleDiff(a, b) { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
