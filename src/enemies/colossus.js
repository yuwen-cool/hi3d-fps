import * as THREE from 'three';
import { instance } from '../world/assets.js';

// The colossus: a four-legged oil-rig walker built from three Hi3D parts (hull, upper leg, lower leg).
// No skinning: every leg is two rigid segments solved with analytic two-bone IK each frame, feet are
// planted and stepped in diagonal pairs, the hull rides on top with bob and lean. It fires a charged
// beam that sweeps across the player and sets the ground alight; two glowing coolant tanks on its
// back are the only real weak points.
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const CFG = { bodyH: 8.7, hipX: 4.0, hipZ: 3.6, upper: 6.4, lower: 7.6, reachX: 7.8, reachZ: 5.9, stepLen: 3.6, stepT: 0.7, lift: 2.1, speed: 1.8, turn: 0.32, coreHp: 650, armour: 0.04 };

// align a part so its long axis runs from the local origin down -Y; `fat` = which end is heavier
async function segment(name, len, fatEnd) {
  const src = await instance(name); const g = new THREE.Group(); const inner = src; inner.updateMatrixWorld(true);
  const P = []; inner.traverse((m) => { if (m.isMesh) { const a = m.geometry.attributes.position; for (let i = 0; i < a.count; i += 9) P.push(V(0, 0, 0).fromBufferAttribute(a, i).applyMatrix4(m.matrixWorld)); } });
  const bb = new THREE.Box3().setFromPoints(P), sz = bb.getSize(V(0, 0, 0)), c = bb.getCenter(V(0, 0, 0));
  const ax = sz.x >= sz.y && sz.x >= sz.z ? 'x' : sz.y >= sz.z ? 'y' : 'z', L = sz[ax];
  const spread = (lo) => { const sel = P.filter((p) => lo ? p[ax] < bb.min[ax] + L * 0.2 : p[ax] > bb.max[ax] - L * 0.2); const b = new THREE.Box3().setFromPoints(sel).getSize(V(0, 0, 0)); return b.x * b.y * b.z / Math.max(1e-6, b[ax]); };
  const loFat = spread(true) > spread(false);
  // top end (origin) = the thin end for the lower leg (foot is fat), the fat hinge for the upper leg
  const topIsLo = fatEnd === 'bottom' ? !loFat : loFat;
  const along = V(0, 0, 0); along[ax] = topIsLo ? 1 : -1;            // top -> bottom
  const mid = new THREE.Group(); mid.add(inner); inner.position.copy(c).negate(); inner.position[ax] += (topIsLo ? 1 : -1) * L / 2;
  mid.quaternion.setFromUnitVectors(along, V(0, -1, 0)); mid.scale.setScalar(len / L);
  g.add(mid); g.userData.len = len; return g;
}

export async function createColossus(G) {
  const R = G.R, rnd = G.rng, scene = R.scene;
  const root = new THREE.Group(); root.name = 'colossus'; scene.add(root); root.visible = false;
  const hull = await instance('colossus_hull'); const hullH = new THREE.Group(); hullH.add(hull); root.add(hullH);
  { const s = new THREE.Box3().setFromObject(hull).getSize(V(0, 0, 0)); hull.position.y = -s.y * 0.55; }
  // legs: hip offsets in hull space (x right, z forward)
  const legs = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const up = await segment('colossus_leg_upper', CFG.upper, 'top'), lo = await segment('colossus_leg_lower', CFG.lower, 'bottom');
    root.add(up, lo);
    legs.push({ sx, sz, up, lo, hip: V(0, 0, 0), knee: V(0, 0, 0), foot: V(0, 0, 0), from: V(0, 0, 0), to: V(0, 0, 0), t: 1, pair: sx * sz > 0 ? 0 : 1 });
  }
  root.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; } });
  // coolant cores (weak points) on the back of the hull, with their own glow light
  const coreLocal = [V(-1.26, 1.54, -2.24), V(1.26, 1.54, -2.24)];
  const cores = coreLocal.map((p) => { const l = new THREE.PointLight(0xff7a20, 0, 9, 2); root.add(l); R.volLights.push(l); return { local: p, hp: CFG.coreHp, alive: true, light: l, w: V(0, 0, 0) }; });
  // beam: an additive cylinder from the muzzle to the hit point
  // beam = white-hot core + wide orange sheath, both view-facing (bright on the centre line, soft at the edge),
  // flickering in time rather than striped along the length; the far end tapers into the impact
  const beamShader = (core) => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, uniforms: { uI: { value: 0 }, uT: { value: 0 } },
    vertexShader: 'varying vec2 vUv; varying vec3 vN, vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: `varying vec2 vUv; varying vec3 vN, vV; uniform float uI, uT;
      void main(){ float f = abs(dot(normalize(vN), normalize(vV)));
        float fl = 0.85 + 0.15 * sin(uT * 47.0) * sin(uT * 31.0 + vUv.y * 6.0);
        float taper = smoothstep(0.0, 0.04, vUv.y) * (0.6 + 0.4 * smoothstep(1.0, 0.85, vUv.y));
        vec3 c = ${core ? 'vec3(1.0, 0.95, 0.85) * pow(f, 6.0) * 9.0' : 'vec3(1.0, 0.42, 0.12) * pow(f, 2.5) * 1.2'};
        gl_FragColor = vec4(c * fl * taper * uI, 1.0); }` });
  const beamMat = beamShader(true), glowMat = beamShader(false);
  const mkBeam = (r, mat) => { const g = new THREE.CylinderGeometry(r, r, 1, 18, 1, true); g.translate(0, 0.5, 0); g.rotateX(Math.PI / 2); const m = new THREE.Mesh(g, mat); m.frustumCulled = false; return m; };
  const beam = new THREE.Group(); beam.add(mkBeam(0.13, beamMat), mkBeam(0.75, glowMat)); beam.visible = false; scene.add(beam);
  const muzzleLight = new THREE.PointLight(0xff8a30, 0, 16, 2); scene.add(muzzleLight); R.volLights.push(muzzleLight);

  const S = { active: false, dead: false, pos: V(0, 0, 0), yaw: 0, vel: V(0, 0, 0), phase: 'idle', t: 0, path: [], wp: 0, gait: 0, bob: 0, lean: 0, limp: 0, beamFrom: V(0, 0, 0), beamTo: V(0, 0, 0), sweepA: V(0, 0, 0), sweepB: V(0, 0, 0), deathT: 0, hp: 1 };
  const fwd = () => V(Math.sin(S.yaw), 0, Math.cos(S.yaw)), right = () => V(Math.cos(S.yaw), 0, -Math.sin(S.yaw));
  const toWorld = (local, out = V(0, 0, 0)) => out.copy(local).applyAxisAngle(V(0, 1, 0), S.yaw).add(hullH.position);

  function spawn(pos, yaw, path) {
    S.active = true; S.dead = false; S.pos.copy(pos); S.yaw = yaw; S.path = path.map((p) => p.clone()); S.wp = 0; S.phase = 'walk'; S.t = 0; root.visible = true;
    for (const c of cores) { c.hp = CFG.coreHp; c.alive = true; }
    for (const L of legs) { home(L, L.foot); L.from.copy(L.foot); L.to.copy(L.foot); L.t = 1; }
    G.events.emit('boss:spawn', { pos: pos.clone() });
  }
  function home(L, out) { return out.copy(S.pos).addScaledVector(right(), L.sx * CFG.reachX).addScaledVector(fwd(), L.sz * CFG.reachZ).setY(G.phys.groundBelow(out, 0.2)); }

  // two-bone IK in the vertical plane through hip and foot, knee bowed outward and up (insect stance)
  const _a = V(0, 0, 0), _b = V(0, 0, 0), _q = new THREE.Quaternion();
  function solveLeg(L) {
    L.hip.set(L.sx * CFG.hipX, 0, L.sz * CFG.hipZ); toWorld(L.hip, L.hip);
    const d = _a.copy(L.foot).sub(L.hip), dist = THREE.MathUtils.clamp(d.length(), 0.5, CFG.upper + CFG.lower - 0.05); d.normalize();
    const a1 = CFG.upper, a2 = CFG.lower, cosA = (a1 * a1 + dist * dist - a2 * a2) / (2 * a1 * dist), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const out = _b.copy(L.hip).sub(hullH.position).setY(0).normalize().add(V(0, 1.6, 0)); out.addScaledVector(d, -out.dot(d)).normalize();
    L.knee.copy(L.hip).addScaledVector(d, a1 * cosA).addScaledVector(out, a1 * sinA);
    place(L.up, L.hip, L.knee, out); place(L.lo, L.knee, L.hip.clone().addScaledVector(d, dist), out);
  }
  function place(seg, a, b, side) {
    seg.position.copy(a); const dir = b.clone().sub(a).normalize();
    _q.setFromUnitVectors(V(0, -1, 0), dir); seg.quaternion.copy(_q);
    const x = V(1, 0, 0).applyQuaternion(_q); const want = side.clone().cross(dir).normalize();      // keep the part's side facing out
    const ang = Math.atan2(x.clone().cross(want).dot(dir), x.dot(want)); seg.rotateOnWorldAxis(dir, ang);
  }
  function stepFeet(dt) {
    // a pair may lift only when the other pair is planted
    const moving = S.vel.length() > 0.05 || S.turning;
    for (const pair of [0, 1]) {
      const other = legs.filter((L) => L.pair !== pair);
      if (other.some((L) => L.t < 1)) continue;
      const mine = legs.filter((L) => L.pair === pair);
      const want = mine.map((L) => home(L, V(0, 0, 0)).addScaledVector(S.vel, CFG.stepT * 1.6));
      if (mine.some((L, i) => L.t >= 1 && L.foot.distanceTo(want[i]) > CFG.stepLen * (moving ? 0.55 : 0.3))) {
        mine.forEach((L, i) => { if (L.t >= 1) { L.from.copy(L.foot); L.to.copy(want[i]); L.t = 0; } });
        break;
      }
    }
    for (const L of legs) {
      if (L.t >= 1) continue;
      L.t = Math.min(1, L.t + dt / (CFG.stepT * (1 + S.limp * (L.sx < 0 ? 0.8 : 0))));
      const e = L.t * L.t * (3 - 2 * L.t);
      L.foot.lerpVectors(L.from, L.to, e); L.foot.y += Math.sin(Math.PI * L.t) * CFG.lift;
      if (L.t >= 1) land(L);
    }
  }
  function land(L) {
    const p = L.foot; G.events.emit('boss:step', { pos: p.clone() });
    for (let i = 0; i < 14; i++) { const a = rnd() * 6.28; G.fxs?.emit(true, { pos: V(p.x + Math.cos(a) * 0.6, 0.2, p.z + Math.sin(a) * 0.6), vel: V(Math.cos(a), 0.15, Math.sin(a)).multiplyScalar(3 + rnd() * 3), life: 1.3 + rnd(), size: 0.4, size1: 1.8, col: G.fxs.litColor([0.55, 0.42, 0.3]), alpha: 0.45, soft: true, drag: 2.2 }); }
    G.fxs?.decal(V(p.x, 0.01, p.z), V(0, 1, 0), 1.6);
    const pd = G.player.s.pos.distanceTo(p); G.player.addShake(THREE.MathUtils.clamp(1 - pd / 40, 0, 1) * 0.45);
    if (pd < 2.2 && !G.god) G.player.damage(45, p);
  }
  // beam: charge at the muzzle, then sweep across the player's position
  const muzzle = () => toWorld(V(0, -0.84, 6.2));
  function beamTick(dt) {
    S.t += dt; const m = muzzle();
    if (S.phase === 'charge') {
      const k = Math.min(1, S.t / 1.6); muzzleLight.position.copy(m); muzzleLight.intensity = 40 * k * (0.8 + 0.2 * Math.sin(S.t * 40));
      if (rnd() < dt * 30) { const v = V((rnd() - 0.5), (rnd() - 0.5), (rnd() - 0.5)).normalize(); G.fxs?.emit(false, { pos: m.clone().addScaledVector(v, 1.5), vel: v.multiplyScalar(-4), life: 0.35, size: 0.03, stretch: 0.2, col: [16, 8, 3] }); }
      if (S.t > 1.6) {
        S.phase = 'fire'; S.t = 0; const pp = G.player.s.pos.clone().setY(0.4), side = right().multiplyScalar(7 + rnd() * 3);
        S.sweepA.copy(pp).addScaledVector(side, -1).addScaledVector(fwd(), -2); S.sweepB.copy(pp).add(side).addScaledVector(fwd(), 2);
        G.events.emit('boss:beam', { pos: m.clone() });
      }
    } else if (S.phase === 'fire') {
      const k = Math.min(1, S.t / 1.8); const aim = S.sweepA.clone().lerp(S.sweepB, k * k * (3 - 2 * k));
      const d = aim.clone().sub(m).normalize(); const h = G.phys.raycast(m, d, 120); const end = h ? h.point : m.clone().addScaledVector(d, 120);
      beam.visible = true; beam.position.copy(m); beam.lookAt(end); beam.scale.set(1, 1, m.distanceTo(end)); const bi = 1.6 * Math.min(1, S.t * 8) * Math.min(1, (1.8 - S.t) * 6 + 0.2); for (const mm of [beamMat, glowMat]) { mm.uniforms.uI.value = bi; mm.uniforms.uT.value = G.time; }
      muzzleLight.position.copy(end).addScaledVector(d, -0.5); muzzleLight.intensity = 90;
      R.flash(end, 0xff9040, 30, 8, 0.05); G.fxs?.emit(false, { pos: end, life: 0.06, size: 1.4, size1: 0.6, col: [16, 9, 4], soft: true });
      for (let i = 0; i < 3; i++) G.fxs?.emit(false, { pos: end, vel: V((rnd() - 0.5) * 6, 2 + rnd() * 5, (rnd() - 0.5) * 6), life: 0.4 + rnd() * 0.4, size: 0.02, stretch: 0.08, col: [18, 8, 2], grav: 9.8 });
      if (rnd() < dt * 18) G.fxs?.emit(true, { pos: end, vel: V(0.3, 1.2, 0.2), life: 2.5, size: 0.3, size1: 1.6, col: G.fxs.litColor([0.08, 0.07, 0.06]), alpha: 0.6, soft: true, rise: 0.5, drag: 0.8 });
      if ((S.lastScorch || 0) + 0.12 < S.t) { S.lastScorch = S.t; G.fxs?.decal(V(end.x, 0.012, end.z), V(0, 1, 0), 1.1); if (rnd() < 0.4) G.fire?.add(V(end.x, 0.05, end.z), { size: 0.5 + rnd() * 0.5, life: 10 + rnd() * 10 }); }
      // damage: the beam line passing through the player
      const pc = G.player.s.pos.clone().setY(G.player.s.pos.y + 1); const t = pc.clone().sub(m).dot(d);
      if (!G.god && t > 0 && t < m.distanceTo(end) + 0.5 && m.clone().addScaledVector(d, t).distanceTo(pc) < 1.0) { S.pacc = (S.pacc || 0) + 70 * dt; if (S.pacc >= 1) { G.player.damage(Math.floor(S.pacc), m); S.pacc %= 1; } }
      if (S.t > 1.8) { S.phase = 'walk'; S.t = 0; beam.visible = false; muzzleLight.intensity = 0; S.cool = 4 + rnd() * 3; }
    }
  }
  // weak points + armour: hitTest returns {distance, point, core}
  const _c = V(0, 0, 0), _ray = new THREE.Ray();
  function hitTest(o, d, maxD) {
    if (!S.active || S.dead) return null; _ray.set(o, d); let best = null;
    for (const c of cores) { if (!c.alive) continue; toWorld(c.local, _c); const t = _c.clone().sub(o).dot(d); if (t < 0 || t > maxD) continue; if (o.clone().addScaledVector(d, t).distanceTo(_c) < 0.75 && (!best || t < best.distance)) best = { distance: t - 0.3, point: o.clone().addScaledVector(d, t - 0.3), core: c }; }
    const hb = new THREE.Box3().setFromObject(hullH); const p = _ray.intersectBox(hb, V(0, 0, 0)); if (p) { const t = p.distanceTo(o); if (t < maxD && (!best || t < best.distance - 0.5)) best = { distance: t, point: p, core: null }; }
    return best;
  }
  function damage(hit, dmg) {
    if (S.dead) return;
    if (hit.core) {
      const c = hit.core; c.hp -= dmg; c.flash = 0.08;
      for (let i = 0; i < 6; i++) G.fxs?.emit(false, { pos: hit.point, vel: V((rnd() - 0.5) * 8, rnd() * 6, (rnd() - 0.5) * 8), life: 0.3, size: 0.02, stretch: 0.08, col: [18, 9, 3], grav: 9.8 });
      if (c.hp <= 0 && c.alive) { c.alive = false; c.light.intensity = 0; G.explosives?.blast(toWorld(c.local), 1.6, 4, 0); S.limp = Math.min(1, S.limp + 0.5); G.events.emit('boss:core', { left: cores.filter((x) => x.alive).length }); if (!cores.some((x) => x.alive)) die(); }
    } else { G.fxs?.enemyHit?.(hit.point, V(0, 1, 0), false); }
    S.hp = cores.reduce((a, c) => a + Math.max(0, c.hp), 0) / (CFG.coreHp * cores.length);
  }
  function die() { S.dead = true; S.phase = 'dying'; S.deathT = 0; beam.visible = false; muzzleLight.intensity = 0; G.slowmo(1.6, 0.25); G.events.emit('boss:dying', { pos: hullH.position.clone() }); }
  // blasts from grenades/drums hit the cores too
  G.events.on('blast', (e) => { if (!S.active || S.dead) return; for (const c of cores) if (c.alive && toWorld(c.local).distanceTo(e.pos) < 3) damage({ core: c, point: e.pos }, e.dmg * 0.8); });

  function update(dt) {
    if (!S.active) return;
    if (S.phase === 'dying') return dying(dt);
    // locomotion: follow waypoints, keep facing the player while firing
    const pp = G.player.s.pos; const toP = pp.clone().sub(S.pos).setY(0);
    const goal = S.path[S.wp]; S.vel.set(0, 0, 0);
    if (S.phase === 'walk') {
      if (goal) { const d = goal.clone().sub(S.pos).setY(0); if (d.length() < 1.5) S.wp = (S.wp + 1) % S.path.length; else S.vel.copy(d.normalize()).multiplyScalar(CFG.speed * (1 - 0.4 * S.limp)); }
      S.cool = (S.cool ?? 3) - dt;
      if (S.cool <= 0 && toP.length() < 45) { S.phase = 'charge'; S.t = 0; G.events.emit('boss:charge', {}); }
    }
    const wantYaw = S.phase === 'walk' && S.vel.lengthSq() > 0.01 ? Math.atan2(S.vel.x, S.vel.z) : Math.atan2(toP.x, toP.z);
    let dy = wantYaw - S.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); S.turning = Math.abs(dy) > 0.05;
    S.yaw += THREE.MathUtils.clamp(dy, -CFG.turn * dt, CFG.turn * dt);
    S.pos.addScaledVector(S.vel, dt);
    stepFeet(dt);
    // hull rides on the feet: height from the mean foot height, lean toward lifted legs, a heavy bob
    const fy = legs.reduce((a, L) => a + L.foot.y, 0) / 4; S.gait += dt * 3.2;
    hullH.position.set(S.pos.x, CFG.bodyH + fy * 0.4 - 0.18 * Math.abs(Math.sin(S.gait)) - S.limp * 0.6, S.pos.z);
    const lx = legs.reduce((a, L) => a + L.sx * (L.foot.y), 0), lz = legs.reduce((a, L) => a + L.sz * (L.foot.y), 0);
    hullH.rotation.set(-lz * 0.03, S.yaw, lx * 0.03 + S.limp * 0.12, 'YXZ');
    for (const L of legs) solveLeg(L);
    for (const c of cores) { if (!c.alive) continue; toWorld(c.local, c.light.position); c.flash = Math.max(0, (c.flash || 0) - dt); c.light.intensity = 10 + 6 * Math.sin(G.time * 5) + (c.flash > 0 ? 40 : 0); }
    if (S.phase !== 'walk') beamTick(dt);
    // damaged: smoke and sparks from dead cores
    for (const c of cores) if (!c.alive && rnd() < dt * 8) G.fxs?.emit(true, { pos: toWorld(c.local), vel: V(0.3, 1.6, 0.2), life: 3, size: 0.4, size1: 2.4, col: G.fxs.litColor([0.06, 0.055, 0.05]), alpha: 0.6, soft: true, rise: 0.6, drag: 0.6 });
  }
  function dying(dt) {
    S.deathT += dt; const k = Math.min(1, S.deathT / 2.6);
    // knees buckle: hull sinks and rolls, chain explosions along it, then one last blast
    hullH.position.y = THREE.MathUtils.lerp(CFG.bodyH, 1.6, k * k); hullH.rotation.z += dt * 0.12 * (1 - k); hullH.rotation.x += dt * 0.08 * (1 - k);
    for (const L of legs) { L.foot.lerp(L.foot.clone().sub(hullH.position).setY(0).multiplyScalar(1.25).add(hullH.position).setY(0), dt * 0.8); solveLeg(L); }
    if (rnd() < dt * 5 && S.deathT < 2.8) G.fxs?.explosion(toWorld(V((rnd() - 0.5) * 4, 0.5 + rnd(), (rnd() - 0.5) * 5)), 0.9 + rnd() * 0.6);
    if (S.deathT > 2.8 && !S.final) { S.final = true; G.explosives?.blast(hullH.position.clone(), 3.4, 14, 400); for (let i = 0; i < 6; i++) G.fire?.add(toWorld(V((rnd() - 0.5) * 6, -hullH.position.y + 0.1, (rnd() - 0.5) * 7)), { size: 1 + rnd() * 1.5, life: 200 }); G.events.emit('boss:dead', { pos: hullH.position.clone() }); }
  }
  return { spawn, update, hitTest, damage, S, root, cores };
}
