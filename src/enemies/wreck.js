import * as THREE from 'three';

// Robot break-up on death. The robot is near-rigidly skinned, so at load the skinned mesh is cut
// into armour groups by each vertex's dominant bone (no re-rig). On a kill the live pose is frozen
// into one rigid mesh per group and the pieces fly apart: hit side hardest, sparks at the cuts,
// smoke from the torso, then they settle, lie for a while and sink.
const GROUPS = [
  ['head', 'head', /^(neck_01|head|head_leaf)$/], ['torso', 'spine_03', /^(spine_02|spine_03|clavicle_[lr])$/], ['pelvis', 'pelvis', /^(root|pelvis|spine_01)$/],
  ['uarm_l', 'upperarm_l', /^upperarm_l$/], ['farm_l', 'lowerarm_l', /^(lowerarm_l|hand_l|.*_0\d(_leaf)?_l)$/],
  ['uarm_r', 'upperarm_r', /^upperarm_r$/], ['farm_r', 'lowerarm_r', /^(lowerarm_r|hand_r|.*_0\d(_leaf)?_r)$/],
  ['thigh_l', 'thigh_l', /^thigh_l$/], ['shin_l', 'calf_l', /^(calf_l|foot_l|ball_l|ball_leaf_l)$/],
  ['thigh_r', 'thigh_r', /^thigh_r$/], ['shin_r', 'calf_r', /^(calf_r|foot_r|ball_r|ball_leaf_r)$/],
];

export function createWreck(G, skinned) {
  const R = G.R, rnd = G.rng, scene = R.scene;
  const sk = skinned.skeleton, names = sk.bones.map((b) => b.name);
  const groupOf = names.map((n) => { const g = GROUPS.findIndex(([, , re]) => re.test(n)); return g < 0 ? 1 : g; });
  const refIdx = GROUPS.map(([, ref]) => names.indexOf(ref));
  // split geometry, expressed in each group's reference-bone bind space
  const src = skinned.geometry.index ? skinned.geometry.toNonIndexed() : skinned.geometry;
  const P = src.attributes.position, N = src.attributes.normal, UV = src.attributes.uv, J = src.attributes.skinIndex, W = src.attributes.skinWeight;
  const buckets = GROUPS.map(() => ({ p: [], n: [], uv: [] }));
  const v = new THREE.Vector3(), nn = new THREE.Vector3();
  const toBone = refIdx.map((j) => new THREE.Matrix4().multiplyMatrices(sk.boneInverses[j], skinned.bindMatrix));
  const toBoneN = toBone.map((m) => new THREE.Matrix3().getNormalMatrix(m));
  for (let t = 0; t < P.count; t += 3) {
    // dominant bone of the triangle's first vertex decides the group
    let bj = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = W.getComponent(t, k); if (w > bw) { bw = w; bj = J.getComponent(t, k); } }
    const g = groupOf[bj], B = buckets[g];
    for (let i = t; i < t + 3; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(toBone[g]); B.p.push(v.x, v.y, v.z);
      nn.fromBufferAttribute(N, i).applyMatrix3(toBoneN[g]).normalize(); B.n.push(nn.x, nn.y, nn.z);
      if (UV) B.uv.push(UV.getX(i), UV.getY(i));
    }
  }
  const geos = buckets.map((B) => {
    if (!B.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(B.n, 3));
    if (B.uv.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(B.uv, 2));
    g.computeBoundingSphere(); g.computeBoundingBox();
    const b = g.boundingBox; g.userData.corners = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z));
    return g;
  });

  const pieces = [];
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _c = new THREE.Vector3();
  // e: enemy (bones, o, mats); dir: shot direction; weak: headshot -> collapse in place, head flies
  function spawn(e, dir, weak) {
    const mesh = e.skinned; mesh.updateMatrixWorld(true);
    const core = e.bones.spine_03.getWorldPosition(new THREE.Vector3());
    const push = dir.clone().setY(0).normalize();
    const mat = e.mats[0];
    GROUPS.forEach(([key], g) => {
      if (!geos[g]) return;
      const bone = e.bones[GROUPS[g][1]];
      _m.multiplyMatrices(mesh.matrixWorld, mesh.bindMatrixInverse).multiply(bone.matrixWorld);
      const m = new THREE.Mesh(geos[g], mat); m.castShadow = m.receiveShadow = true;
      _m.decompose(m.position, m.quaternion, m.scale); scene.add(m);
      const c = geos[g].boundingSphere.center.clone().applyMatrix4(_m); const r = geos[g].boundingSphere.radius * m.scale.x;
      // velocity: hit push + radial burst from the core; limbs and head fly further than the trunk
      const light = !/torso|pelvis/.test(key), head = key === 'head';
      const rad = c.clone().sub(core).setY(0); if (rad.lengthSq() < 1e-4) rad.set(rnd() - 0.5, 0, rnd() - 0.5); rad.normalize();
      const k = weak ? (head ? 1.6 : 0.35) : (light ? 1 : 0.55);
      const vel = push.clone().multiplyScalar((2.2 + rnd() * 2.5) * k).addScaledVector(rad, (1.2 + rnd() * 2.2) * k);
      vel.y = (head && weak ? 5 + rnd() * 2 : 1 + rnd() * 2.6 * k);
      const w = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar((light ? 14 : 5) * k);
      pieces.push({ m, vel, w, r, c0: c.sub(m.position), age: 0, rest: 0, key, smoke: key === 'torso' ? 4.5 : 0, spark: 1.2 + rnd() * 0.8 });
      // cut sparks at every joint
      for (let i = 0; i < 4; i++) G.fxs?.emit(false, { pos: m.position, vel: new THREE.Vector3(rnd() - 0.5, rnd() * 0.8, rnd() - 0.5).multiplyScalar(7), life: 0.2 + rnd() * 0.35, size: 0.012, stretch: 0.07, col: [10, 12, 18], grav: 9.8 });
    });
    if (pieces.length > 13 * 7) for (const p of pieces.splice(0, pieces.length - 13 * 7)) scene.remove(p.m);
  }
  const _p = new THREE.Vector3();
  function update(dt) {
    for (let i = pieces.length - 1; i >= 0; i--) {
      const p = pieces[i]; p.age += dt;
      if (p.rest < 1) {
        p.vel.y -= 9.8 * dt; p.m.position.addScaledVector(p.vel, dt);
        _q.setFromEuler(_e.set(p.w.x * dt, p.w.y * dt, p.w.z * dt)); p.m.quaternion.premultiply(_q);
        // lowest bbox corner decides contact, so a limb rests on its side instead of sinking to the joint
        let lo = 1e9; for (const c of p.m.geometry.userData.corners) { _p.copy(c).multiply(p.m.scale).applyQuaternion(p.m.quaternion); if (_p.y < lo) lo = _p.y; }
        const g = G.phys.groundBelow(p.m.position, 0.05), floor = g - lo;
        if (p.m.position.y < floor) {
          p.m.position.y = floor;
          if (p.vel.y < -1.2) { p.vel.y *= -0.28; p.vel.x *= 0.55; p.vel.z *= 0.55; p.w.multiplyScalar(0.5); if (p.r > 0.12) G.events.emit('wreck:land', { pos: p.m.position.clone(), s: p.r }); }
          else { p.vel.multiplyScalar(0.8); p.vel.y = 0; p.w.multiplyScalar(0.85); if (p.vel.lengthSq() < 0.02 && p.w.lengthSq() < 0.05) p.rest = 1; }
        }
      }
      if (p.spark > 0) { p.spark -= dt; if (rnd() < dt * 9) { _p.copy(p.m.position); G.fxs?.emit(false, { pos: _p, vel: new THREE.Vector3((rnd() - 0.5) * 4, 1 + rnd() * 3, (rnd() - 0.5) * 4), life: 0.25, size: 0.01, stretch: 0.05, col: [9, 12, 20], grav: 9.8 }); if (rnd() < 0.3) R.flash(_p, 0x9fd8ff, 3, 2.5, 0.05); } }
      if (p.smoke > 0) { p.smoke -= dt; if (rnd() < dt * 10) G.fxs?.emit(true, { pos: p.m.position, vel: new THREE.Vector3(0.3, 0.9, 0.2), life: 2.4, size: 0.12, size1: 0.8, col: G.fxs.litColor([0.09, 0.085, 0.08]), alpha: 0.5, soft: true, drag: 0.8, rise: 0.4 }); }
      if (p.age > 14) p.m.position.y -= dt * 0.2;
      if (p.age > 16.5) { scene.remove(p.m); pieces.splice(i, 1); }
    }
  }
  return { spawn, update, pieces };
}
