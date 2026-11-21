import * as THREE from 'three';
import { instance, MODELS } from '../world/assets.js';

// First-person rifle. Viewmodel lives on layer 1 under the world camera and is drawn by the
// view camera with depthRange(0,0.05) (never clips into walls). Motion is all springs.
// Numbers: docs/SPEC.md §4.
const W = {
  rpm: 720, dmg: 26, range: 300, mag: 30, reserve: 150,
  hip: new THREE.Vector3(0.27, -0.235, -0.53), hipR: new THREE.Euler(0.07, 0.24, -0.08),
  sprintP: new THREE.Vector3(-0.035, 0.004, 0.03), sprintR: new THREE.Euler(-0.04, 0.62, 0.26),
  reloadP: new THREE.Vector3(-0.02, 0.06, 0.0), reloadR: new THREE.Euler(0.28, 0.16, -0.48),
  adsZ: -0.135, tactical: 2.1, empty: 2.72,
};
function spring(k, c) { return { x: 0, v: 0, k, c, t: 0 }; }
function stepSpring(s, dt) { const n = dt > 0.012 ? Math.ceil(dt / 0.008) : 1, h = dt / n; for (let i = 0; i < n; i++) { s.v += ((s.t - s.x) * s.k - s.v * s.c) * h; s.x += s.v * h; } }
const ease5 = (t) => { t = THREE.MathUtils.clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };

// additive muzzle flash: petals + side jets + hot core, procedural (no textures)
function flashMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    uniforms: { uI: { value: 0 }, uSeed: { value: 0 }, uKind: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float uI, uSeed, uKind;
    float h(float n){ return fract(sin(n) * 43758.5453); }
    void main(){
      vec2 p = vUv; float r = length(p); float a = atan(p.y, p.x);
      float e;
      if (uKind < 0.5) { // front petals
        float n1 = 3.0 + floor(h(uSeed) * 3.0), n2 = 5.0 + floor(h(uSeed + 1.0) * 4.0);
        float pet = pow(abs(cos(a * n1 * 0.5 + uSeed)), 5.0) * 0.6 + pow(abs(cos(a * n2 * 0.5 + uSeed * 2.0)), 14.0) * 0.4;
        e = smoothstep(1.0, 0.0, r / (0.35 + 0.65 * pet)) + exp(-r * r * 22.0) * 2.4;
      } else { // side jet: gaussian along length, noisy edge
        float along = (p.x + 1.0) * 0.5; float w = 0.25 + 0.6 * along;
        e = exp(-pow(p.y / w, 2.0) * 3.0) * smoothstep(1.0, 0.2, along) * smoothstep(-0.05, 0.15, along) * (0.7 + 0.3 * sin(along * 30.0 + uSeed * 9.0));
      }
      vec3 c = mix(vec3(1.0, 0.50, 0.16), vec3(1.0, 0.90, 0.70), clamp(e - 0.6, 0.0, 1.0));
      gl_FragColor = vec4(c * e * uI, 1.0);
    }`,
  });
}

export async function createWeapon(G) {
  const R = G.R, cam = R.camera;
  const useV2 = !!(await fetch('/models/rifle2.glb', { method: 'HEAD' }).then((r) => r.ok && r.headers.get('content-type') !== 'text/html').catch(() => false));
  const gunName = G.params.gun || (useV2 ? 'rifle2' : 'rifle_v1');
  const gunSrc = await instance(gunName);
  const root = new THREE.Group(); root.name = 'viewmodel';
  const pose = new THREE.Group(); root.add(pose);     // sway/recoil
  const gun = new THREE.Group(); pose.add(gun);       // aligned rifle, origin at grip
  cam.add(root);
  // --- auto-align: longest axis -> -Z, muzzle (thin end) forward, top up ---
  const g = gunSrc; g.updateMatrixWorld(true);
  const pts = []; const v = new THREE.Vector3();
  g.traverse((o) => { if (o.isMesh) { const p = o.geometry.attributes.position; for (let i = 0; i < p.count; i += 7) pts.push(v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld).clone()); } });
  const bb = new THREE.Box3().setFromPoints(pts); const sz = bb.getSize(new THREE.Vector3());
  const ax = sz.x > sz.z ? 'x' : 'z';
  const band = (lo) => { const L = bb.max[ax] - bb.min[ax]; const sel = pts.filter((p) => lo ? p[ax] < bb.min[ax] + L * 0.12 : p[ax] > bb.max[ax] - L * 0.12); const ys = sel.map((p) => p.y); return Math.max(...ys) - Math.min(...ys); };
  const muzzleAtMin = band(true) < band(false);
  const holder = new THREE.Group(); holder.add(g);
  // rotate so that muzzle points to -Z
  if (ax === 'z') holder.rotation.y = muzzleAtMin ? 0 : Math.PI; else holder.rotation.y = muzzleAtMin ? -Math.PI / 2 : Math.PI / 2;
  holder.updateMatrixWorld(true);
  const pts2 = pts.map((p) => p.clone().applyMatrix4(holder.matrixWorld));
  const b2 = new THREE.Box3().setFromPoints(pts2);
  // grip: lowest points in the rear half; sight: highest points
  const L = b2.max.z - b2.min.z;
  const rear = pts2.filter((p) => p.z > b2.min.z + L * 0.45 && p.z < b2.min.z + L * 0.8);
  const gripBottom = rear.reduce((a, p) => (p.y < a.y ? p : a), rear[0]);
  const top = pts2.filter((p) => p.z > b2.min.z + L * 0.3 && p.z < b2.min.z + L * 0.7).reduce((a, p) => (p.y > a.y ? p : a), pts2[0]);
  const gripPt = new THREE.Vector3(0, gripBottom.y + 0.115, gripBottom.z - 0.02);
  const sightY = top.y - 0.042 - gripPt.y;  // eye line ~2.5cm under the top of the sight housing
  const sightZ = top.z - gripPt.z;
  holder.position.sub(gripPt);
  gun.add(holder);
  const muzzleLocal = new THREE.Vector3(0, (b2.min.y + b2.max.y) * 0.5 - gripPt.y + 0.03, b2.min.z - gripPt.z);
  const T = G.params;
  if (T.vmx) W.hip.set(+T.vmx, +T.vmy, +T.vmz);
  if (T.vrx) W.hipR.set(+T.vrx, +T.vry, +T.vrz);
  // gloves (rigid, fixed grip pose)
  const gloves = {};
  // right = fist glove on the pistol grip; left = Hi3D forearm (C-grip glove + sleeve) under the handguard
  for (const [n, src] of [['glove_r', 'glove_r'], ['glove_l', 'arm_l']]) {
    try { const o = await instance(src); o.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); m.material.color.multiplyScalar(n === 'glove_r' ? 0.42 : 0.8); } }); gloves[n] = o; gun.add(o); } catch { /* optional */ }
  }
  // auto-orient gloves: find cuff->fingertip axis (cuff end = fatter cross-section), then aim it
  function orientGlove(o, dir, roll, pos, pivot = 0) {
    o.updateMatrixWorld(true); o.position.set(0, 0, 0); o.rotation.set(0, 0, 0); o.updateMatrixWorld(true);
    const P = []; o.traverse((m) => { if (m.isMesh) { const a = m.geometry.attributes.position; for (let i = 0; i < a.count; i += 5) P.push(new THREE.Vector3().fromBufferAttribute(a, i).applyMatrix4(m.matrixWorld)); } });
    const bx = new THREE.Box3().setFromPoints(P); const sz = bx.getSize(new THREE.Vector3()); const c = bx.getCenter(new THREE.Vector3());
    const ax = sz.x >= sz.y && sz.x >= sz.z ? 'x' : sz.y >= sz.z ? 'y' : 'z';
    const L = sz[ax]; const spread = (lo) => { const sel = P.filter((p) => lo ? p[ax] < bx.min[ax] + L * 0.2 : p[ax] > bx.max[ax] - L * 0.2); const b = new THREE.Box3().setFromPoints(sel).getSize(new THREE.Vector3()); return b.x * b.y * b.z / b[ax]; };
    const cuffLo = spread(true) > spread(false);
    const along = new THREE.Vector3(); along[ax] = cuffLo ? 1 : -1;     // cuff -> fingers
    const inner = new THREE.Group(); while (o.children.length) inner.add(o.children[0]); inner.position.copy(c).negate(); inner.position[ax] -= along[ax] * L * pivot; // pivot toward the fingers 
    const mid = new THREE.Group(); mid.add(inner); mid.quaternion.setFromUnitVectors(along, new THREE.Vector3(0, 0, -1));
    const rollG = new THREE.Group(); rollG.add(mid); rollG.rotation.z = roll;
    const aimG = new THREE.Group(); aimG.add(rollG); aimG.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir.clone().normalize());
    o.add(aimG); o.position.copy(pos);
  }
  const gp = (k, d) => (T[k] ? T[k].split(',').map(Number) : d);
  const gR = gp('gr', [-0.25, 0.55, -0.6, 1.6, 0.03, -0.07, 0.06]), gL = gp('gl', [0.2, 0.3, -0.93, -0.5, 0.05, -0.02, -0.3]);
  if (gloves.glove_r) orientGlove(gloves.glove_r, new THREE.Vector3(gR[0], gR[1], gR[2]), gR[3], new THREE.Vector3(gR[4], gR[5], gR[6]));
  const lHome = new THREE.Vector3(gL[4], gL[5], muzzleLocal.z * 0.55 + gL[6]);
  const lQ = new THREE.Quaternion(), _rq = new THREE.Quaternion(), _rq2 = new THREE.Quaternion(), AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0);
  if (gloves.glove_l) orientGlove(gloves.glove_l, new THREE.Vector3(gL[0], gL[1], gL[2]), gL[3], lHome, +(T.lpiv || 0.4));
  if (gloves.glove_l) lQ.copy(gloves.glove_l.quaternion);
  // magazine (rifle2 has an empty magwell)
  let mag = null;
  if (gunName === 'rifle2') { try { mag = await instance('mag'); gun.add(mag); mag.position.set(0, -0.2, -0.13); mag.rotation.set(-0.12, Math.PI / 2, 0); } catch { /* */ } }
  const magHome = mag ? { p: mag.position.clone(), r: mag.rotation.clone() } : null;
  // finish: the de-lit Hi3D albedo reads as pale grey plastic up close. Real rifle furniture is near-black
  // anodised/polymer (albedo ~0.05-0.1) and the look comes from crisp specular, so darken + tighten roughness.
  const finish = (o, k, r) => o.traverse((m) => { if (!m.isMesh) return; m.material = m.material.clone(); m.material.userData = { ...m.material.userData }; m.material.color.multiplyScalar(k); m.material.roughness = r; m.material.metalness = 0.25; m.material.envMapIntensity = 1.1; }); // anodised/polymer: mostly dielectric, no chrome
  finish(holder, +(T.wk || 0.38), +(T.wr || 0.74));
  // the tan stock sits closest to the camera and blows out in sun: darken it with vertex colour by gun-space depth
  gun.updateMatrixWorld(true);
  holder.traverse((m) => { if (!m.isMesh) return; m.geometry = m.geometry.clone(); const a = m.geometry.attributes.position, c = new Float32Array(a.count * 3), v = new THREE.Vector3();
    for (let i = 0; i < a.count; i++) { v.fromBufferAttribute(a, i).applyMatrix4(m.matrixWorld); gun.worldToLocal(v); const k = 1 - 0.65 * THREE.MathUtils.smoothstep(v.z, 0.0, 0.1); c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = k; }
    m.geometry.setAttribute('color', new THREE.BufferAttribute(c, 3)); m.material.vertexColors = true; });
  if (mag) finish(mag, +(T.wk || 0.38) * 0.8, +(T.wr || 0.74) + 0.08);
  root.traverse((o) => { o.layers.set(1); if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; } }); // shade comes from the renderer's sun-visibility ray
  // muzzle flash meshes
  const fm = flashMaterial(), fj = flashMaterial(); fj.uniforms.uKind.value = 1;
  const flash = new THREE.Group(); flash.position.copy(muzzleLocal); gun.add(flash);
  const petals = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26), fm); flash.add(petals);
  const petals2 = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.18), fm); petals2.position.z = -0.03; flash.add(petals2);
  for (const r of [0, Math.PI / 3, -Math.PI / 3]) { const j = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.13), fj); j.position.z = -0.17; j.rotation.set(0, Math.PI / 2, r); flash.add(j); }
  // volumetric core: an open cone (base at the muzzle, tip forward) so the flash has depth from any angle
  const coneG = new THREE.CylinderGeometry(0.0, 0.055, 0.3, 14, 1, true); coneG.translate(0, 0.15, 0); coneG.rotateX(-Math.PI / 2);
  const fc = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, uniforms: { uI: fm.uniforms.uI, uSeed: fm.uniforms.uSeed },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float uI, uSeed;
    void main(){ float along = vUv.y; float n = 0.55 + 0.45 * sin(vUv.x * 31.4 + uSeed * 7.0) * sin(along * 18.0 - uSeed * 3.0);
      float e = pow(1.0 - along, 1.6) * n * 1.6; vec3 c = mix(vec3(1.0, 0.45, 0.12), vec3(1.0, 0.92, 0.75), clamp(e - 0.5, 0.0, 1.0));
      gl_FragColor = vec4(c * e * uI, 1.0); }` });
  flash.add(new THREE.Mesh(coneG, fc));
  flash.traverse((o) => { o.layers.set(1); o.renderOrder = 10; }); flash.visible = false;
  // reflex reticle: projected dot, only readable down the sight axis
  const dotMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false, uniforms: { uA: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec2 vUv; uniform float uA; void main(){ float r = length(vUv); float d = smoothstep(0.16, 0.0, r) * 3.0 + exp(-r * r * 9.0) * 0.5; gl_FragColor = vec4(vec3(1.0, 0.12, 0.06) * d * uA * 6.0, 1.0); }' });
  const dot = new THREE.Mesh(new THREE.PlaneGeometry(0.008, 0.008), dotMat); dot.position.set(0, sightY, sightZ + 0.01); dot.layers.set(1); dot.renderOrder = 12; gun.add(dot);

  const S = {
    ammo: W.mag, reserve: W.reserve, cool: 0, shots: 0, lastShot: -9, bloom: 0, spread: 0, heat: 0, ads: 0, adsLin: 0, sprint: 0,
    fired: 0, hits: 0, meleeT: -1, meleeCd: 0, meleeHit: false, meleeTgt: null, reloading: false, reloadT: 0, reloadDur: 0, reloadEmpty: false, flashT: 0, flashDur: 0, t: 0, phase: 0, bobAmt: 0, recoilPh: Math.random() * 6, idleT: 0,
    kZ: spring(520, 30), kP: spring(380, 26), kY: spring(300, 22), kR: spring(300, 20), swY: spring(110, 15), swP: spring(140, 13), jY: spring(140, 13), jP: spring(140, 13), bump: spring(600, 30),
  };
  G.events.on('player:jump', () => { S.jY.v -= 0.22; S.jP.v += 0.7; });
  G.events.on('player:land', ({ v }) => { const I = Math.min(0.6, v * 0.06); S.jY.v -= I; S.jP.v -= 3.2 * I; S.kR.v += (Math.random() - 0.5) * 2 * I; });

  const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Vector3();
  // view-model point -> world point seen at the same screen position by the world camera
  function vmToWorld(local, out) {
    out.copy(local); gun.localToWorld(out);           // world-camera space via cam parent chain
    const inCam = out.clone(); cam.worldToLocal(inCam);
    const k = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) / Math.tan(THREE.MathUtils.degToRad(R.viewCam.fov / 2));
    inCam.x *= k; inCam.y *= k;
    return out.copy(inCam).applyMatrix4(cam.matrixWorld);
  }

  function fire() {
    const p = G.player, ps = p.s;
    S.ammo--; S.shots++; S.lastShot = S.t; ps.lastFireT = ps.t; S.heat = Math.min(1.3, S.heat + 0.05);
    S.bloom = Math.min(1, S.bloom + 0.17);
    const ads = S.ads, bt = THREE.MathUtils.lerp(1, 0.55, ads) * (G.input.down('crouch') ? 0.85 : 1);
    // camera recoil
    const up = 0.0068 * (S.shots < 10 ? 1 : 0.38) * bt * (0.85 + Math.random() * 0.3);
    const yaw = S.shots <= 3 ? (Math.random() - 0.5) * 0.0022 : (Math.sin(S.shots * 0.57 + S.recoilPh) * 0.0042 + (Math.random() - 0.5) * 0.002) * bt;
    const odK = G.od?.active ? 0.35 : 1; p.recoil(up * odK, yaw * odK);
    p.addShake(0.12 * bt);
    // viewmodel kick
    S.kZ.v += 1.5 * THREE.MathUtils.lerp(1, 0.6, ads); S.kP.v += 1.5 * bt; S.kY.v += (Math.random() - 0.5) * 1.0 * bt; S.kR.v += (Math.random() - 0.5) * 1.8 * bt;
    // flash
    S.flashDur = 0.036 + Math.random() * 0.02; S.flashT = S.flashDur;
    fm.uniforms.uSeed.value = fj.uniforms.uSeed.value = Math.random() * 100;
    flash.rotation.z = Math.random() * Math.PI * 2; const fs = (0.8 + Math.random() * 0.5) * THREE.MathUtils.lerp(1, 0.62, ads); flash.scale.set(fs, fs, fs * (0.8 + Math.random() * 0.5));
    cam.updateMatrixWorld(true);
    vmToWorld(muzzleLocal, _m);
    R.flash(_m, 0xffb060, 20, 8, 0.05);
    R.fx.flash = 1;
    // hitscan with spread
    const spread = S.spread;
    cam.getWorldPosition(_o); cam.getWorldDirection(_d);
    const a = Math.random() * Math.PI * 2, rr = Math.tan(spread) * Math.sqrt(Math.random());
    const right = new THREE.Vector3().crossVectors(_d, cam.up).normalize(), upv = new THREE.Vector3().crossVectors(right, _d).normalize();
    _d.addScaledVector(right, Math.cos(a) * rr).addScaledVector(upv, Math.sin(a) * rr).normalize();
    const hitW = G.phys.raycast(_o, _d, W.range);
    const maxD = hitW ? hitW.distance : W.range;
    const hitE = G.enemies?.hitTest?.(_o, _d, maxD);
    const hitB = G.boss?.hitTest(_o, _d, hitE ? hitE.distance : maxD);
    const end = _o.clone().addScaledVector(_d, hitB ? hitB.distance : hitE ? hitE.distance : maxD);
    const odD = G.od?.active ? 2 : 1;
    if (hitB) G.boss.damage(hitB, W.dmg * odD);
    else if (hitE) { const dmg = W.dmg * odD * (hitE.part === 'weak' ? 2.2 : 1); G.enemies.damage(hitE.enemy, dmg, hitE, _d); }
    S.fired++; if (hitE || hitB) S.hits++;
    G.events.emit('weapon:fire', { muzzle: _m.clone(), dir: _d.clone(), end, hitW: hitE || hitB ? null : hitW, hitE: hitB ? null : hitE, hitB, ads });
    G.events.emit('noise', { pos: _o.clone(), r: 45 });
  }

  // under-barrel grenade launcher: lobbed 40 mm round, explodes on contact with world or robot
  const nades = [], nadeGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.07, 10); nadeGeo.rotateX(Math.PI / 2);
  const nadeMat = new THREE.MeshStandardMaterial({ color: 0x3a3b2e, roughness: 0.5, metalness: 0.6 });
  S.gl = 3;
  function launch() {
    if (S.gl <= 0 || S.reloading) { G.events.emit('weapon:dry'); return; }
    S.gl--; cam.updateMatrixWorld(true); vmToWorld(muzzleLocal, _m); cam.getWorldDirection(_d);
    const m = new THREE.Mesh(nadeGeo, nadeMat); m.position.copy(_m); R.scene.add(m);
    nades.push({ m, v: _d.clone().multiplyScalar(30).add(new THREE.Vector3(0, 2.5, 0)).add(G.player.s.vel), age: 0 });
    S.kZ.v += 3.2; S.kP.v += 3.5; G.player.recoil(0.03, (Math.random() - 0.5) * 0.01); G.player.addShake(0.3);
    R.flash(_m, 0xffb060, 30, 6, 0.06); for (let i = 0; i < 6; i++) G.fxs?.emit(true, { pos: _m, vel: _d.clone().multiplyScalar(2 + Math.random() * 2), life: 1.2, size: 0.08, size1: 0.6, col: G.fxs.litColor([0.5, 0.48, 0.46]), alpha: 0.4, soft: true, drag: 2.5, rise: 0.3 });
    G.events.emit('gl:fire', { pos: _m.clone() });
  }
  const _n0 = new THREE.Vector3(), _nd = new THREE.Vector3();
  function updNades(dt) {
    for (let i = nades.length - 1; i >= 0; i--) {
      const n = nades[i]; n.age += dt; _n0.copy(n.m.position);
      n.v.y -= 9.8 * dt; n.m.position.addScaledVector(n.v, dt); n.m.lookAt(_n0.clone().addScaledVector(n.v, -1)); n.m.rotateY(Math.PI);
      G.fxs?.emit(false, { pos: n.m.position, life: 0.12, size: 0.05, size1: 0.01, col: [10, 5, 1.6] });
      if (Math.random() < 0.6) G.fxs?.emit(true, { pos: n.m.position, vel: new THREE.Vector3(0, 0.3, 0), life: 0.9, size: 0.05, size1: 0.3, col: G.fxs.litColor([0.55, 0.53, 0.5]), alpha: 0.35, soft: true, drag: 1 });
      const seg = n.m.position.distanceTo(_n0); _nd.copy(n.m.position).sub(_n0).normalize();
      const hw = G.phys.raycast(_n0, _nd, seg + 0.05), he = G.enemies?.hitTest?.(_n0, _nd, seg + 0.3) || G.boss?.hitTest(_n0, _nd, seg + 0.3);
      if (hw || he || n.age > 6 || n.m.position.y < 0.02) {
        const p = he ? he.point : hw ? hw.point.clone().addScaledVector(hw.normal, 0.15) : n.m.position.clone().setY(Math.max(0.15, n.m.position.y));
        R.scene.remove(n.m); nades.splice(i, 1); G.explosives?.blast(p, 1.15, 5.5, 190);
      }
    }
  }
  // ---------- melee: rifle jab with a short lunge; from behind or on an unaware robot it is a takedown ----------
  const _me = new THREE.Vector3(), _mc = new THREE.Vector3();
  function startMelee() {
    const p = G.player, ps = p.s; S.meleeT = 0; S.meleeCd = 0.7; S.meleeHit = false;
    cam.getWorldPosition(_me); const f = p.forward; let best = null, bd = 4.8;
    for (const e of G.enemies?.list || []) {
      if (!e.alive) continue; e.bones.spine_03.getWorldPosition(_mc); const dx = _mc.x - _me.x, dz = _mc.z - _me.z, hd = Math.hypot(dx, dz);
      if (hd > bd || (dx * f.x + dz * f.z) / Math.max(0.01, hd) < 0.55 || !G.phys.los(_me, _mc)) continue; best = e; bd = hd;
    }
    S.meleeTgt = best;
    if (best && bd > 1.5) { const dir = best.root.position.clone().sub(ps.pos).setY(0).normalize(); ps.lungeV.copy(dir).multiplyScalar(Math.min(13, (bd - 1.1) / 0.12)); ps.lungeT = 0.12; ps.speedFx = Math.max(ps.speedFx, 0.6); }
    S.kZ.v -= 2.5; S.kP.v -= 1.5; G.events.emit('player:melee', { lunge: !!best });
  }
  function meleeStrike() {
    S.meleeHit = true; const e = S.meleeTgt, ps = G.player.s; if (!e || !e.alive || e.root.position.distanceTo(ps.pos) > 2.9) return;
    const dir = e.root.position.clone().sub(ps.pos).setY(0).normalize();
    const facing = Math.sin(e.yaw) * -dir.x + Math.cos(e.yaw) * -dir.z; // >0: the robot faces the player
    const takedown = e.state !== 'engage' || facing < -0.2;
    const pt = e.bones.spine_03.getWorldPosition(new THREE.Vector3());
    e.meleeHit = true; G.enemies.damage(e, takedown ? 999 : 95, { part: 'body', point: pt }, dir); e.meleeHit = false;
    if (e.alive) { e.stagT = 0.6; e.knockV.copy(dir).multiplyScalar(7.5); }
    G.hitstop(takedown ? 0.1 : 0.07); G.player.addShake(0.5); S.kZ.v += 5; S.kR.v += 3;
    for (let i = 0; i < 14; i++) G.fxs?.emit(false, { pos: pt, vel: new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6).addScaledVector(dir, 3), life: 0.25 + Math.random() * 0.2, size: 0.014, stretch: 0.06, col: [14, 7, 2.4], grav: 9.8, drag: 2 });
    R.flash(pt, 0xffb070, 25, 4, 0.06);
    G.events.emit('melee:hit', { pos: pt, takedown, kill: !e.alive });
  }
  // ammo economy: every robot you break gives rounds back, and supply crates refill you completely
  const MAXR = 240;
  G.events.on('enemy:killed', () => { const n = Math.min(26, MAXR - S.reserve); if (n > 0) { S.reserve += n; G.events.emit('ammo:gain', { n }); } });
  function resupply() { if (S.reserve >= W.reserve && S.gl >= 3) return false; S.reserve = Math.max(S.reserve, W.reserve); S.gl = 3; G.events.emit('ammo:gain', { n: 0, full: true }); return true; }
  function startReload() {
    if (S.reloading || S.ammo >= W.mag || S.reserve <= 0) return;
    S.reloading = true; S.reloadT = 0; S.reloadEmpty = S.ammo === 0; S.reloadDur = S.reloadEmpty ? W.empty : W.tactical; S.rEv = 0;
    G.events.emit('weapon:reload', { empty: S.reloadEmpty });
  }

  const tmpE = new THREE.Euler(), q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion();
  function update(dt) {
    S.t += dt; const I = G.input, p = G.player.s;
    const live = !p.dead && !G.cinematic;
    // ADS
    const adsHeld = live && (I.st.ads || G.auto?.ads) && !S.reloading && S.sprint < 0.35;
    S.adsLin = THREE.MathUtils.clamp(S.adsLin + (adsHeld ? dt : -dt) / 0.18, 0, 1); S.ads = ease5(S.adsLin); p.ads = S.ads; R.fx.ads = S.ads;
    S.sprint += ((p.sprinting ? 1 : 0) - S.sprint) * Math.min(1, dt * 10);
    // fire
    S.cool -= dt;
    updNades(dt);
    if (live && (I.pressed('gl') || G.auto?.gl) && S.sprint < 0.3) { if (G.auto) G.auto.gl = false; launch(); }
    S.meleeCd -= dt;
    if (live && (I.pressed('melee') || G.auto?.melee) && S.meleeCd <= 0 && !S.reloading) { if (G.auto) G.auto.melee = false; startMelee(); }
    if (S.meleeT >= 0) { S.meleeT += dt; if (!S.meleeHit && S.meleeT >= 0.11) meleeStrike(); if (S.meleeT > 0.48) S.meleeT = -1; }
    const trigger = live && (I.st.fire || G.auto?.fire) && !(S.meleeT >= 0 && S.meleeT < 0.36);
    if (trigger && !S.reloading && S.sprint < 0.3) {
      if (S.ammo <= 0) { if (I.st.pressedFire) { G.events.emit('weapon:dry'); S.bump.v -= 0.08; } if (!S.dryT) S.dryT = 0.32; }
      else { let n = 0; while (S.cool <= 0 && S.ammo > 0 && n < 3) { fire(); S.cool += 60 / (W.rpm * (G.od?.active ? 1.35 : 1)); if (G.od?.active && S.ammo < W.mag && S.ammo % 3 === 0) S.ammo++; n++; } }
    }
    if (S.cool < 0) S.cool = 0;
    if (S.dryT) { S.dryT -= dt; if (S.dryT <= 0) { S.dryT = 0; startReload(); } }
    if (!trigger && S.t - S.lastShot > 0.24) { S.shots = 0; S.recoilPh = Math.random() * 6; }
    if (live && I.pressed('reload')) startReload();
    S.bloom = Math.max(0, S.bloom - dt * 1.5); S.heat = Math.max(0, S.heat - dt * 0.2);
    const tgtSpread = THREE.MathUtils.lerp(0.0125, 0.0012, S.ads) + THREE.MathUtils.clamp(p.speed / 6, 0, 1) * THREE.MathUtils.lerp(0.013, 0.004, S.ads) + S.bloom * THREE.MathUtils.lerp(0.0065, 0.0022, S.ads) + (p.grounded ? 0 : 0.022);
    S.spread += (tgtSpread - S.spread) * Math.min(1, dt * 18);
    // reload timeline
    let rw = 0;
    if (S.reloading) {
      S.reloadT += dt; const t = S.reloadT, D = S.reloadDur;
      const evs = [[0.47, 'magout', -0.25], [1.345, 'magin', 0.55], [1.5, 'slap', 0.4]];
      if (S.reloadEmpty) evs.push([2.14, 'bolt', 0.3]);
      for (let i = S.rEv; i < evs.length; i++) if (t >= evs[i][0]) { S.bump.v += evs[i][2]; G.events.emit('weapon:' + evs[i][1]); if (evs[i][1] === 'magin') { const need = W.mag - S.ammo; const take = Math.min(need, S.reserve); S.ammo += take; S.reserve -= take; } if (evs[i][1] === 'bolt') S.kZ.v -= 0.5; S.rEv = i + 1; }
      rw = Math.min(ease5(t / 0.3), 1 - ease5((t - (D - 0.46)) / 0.4));
      if (mag) { // magazine follows the left hand out and back
        const out = THREE.MathUtils.clamp((t - 0.47) / 0.25, 0, 1) * (1 - THREE.MathUtils.clamp((t - 1.0) / 0.34, 0, 1));
        mag.position.set(magHome.p.x - out * 0.05, magHome.p.y - out * 0.28, magHome.p.z + out * 0.06); mag.rotation.set(magHome.r.x - out * 0.6, magHome.r.y, magHome.r.z);
        mag.visible = !(t > 0.72 && t < 0.86);
      }
      if (gloves.glove_l) { const k = THREE.MathUtils.clamp((t - 0.1) / 0.26, 0, 1) * (1 - THREE.MathUtils.clamp((t - 1.55) / 0.3, 0, 1)); const mp = mag ? mag.position : magHome?.p || new THREE.Vector3(0, -0.2, -0.13); gloves.glove_l.position.lerpVectors(lHome, new THREE.Vector3(mp.x - 0.05, mp.y - 0.08, mp.z + 0.02), k);
        // swing the forearm down and out while the hand works the magwell, so the sleeve never fills the screen
        gloves.glove_l.quaternion.copy(lQ).premultiply(_rq.setFromAxisAngle(AX, 1.15 * k)).premultiply(_rq2.setFromAxisAngle(AY, -0.35 * k)); }
      if (t >= D) { S.reloading = false; if (mag) { mag.position.copy(magHome.p); mag.rotation.copy(magHome.r); mag.visible = true; } if (gloves.glove_l) { gloves.glove_l.position.copy(lHome); gloves.glove_l.quaternion.copy(lQ); } }
    }
    // springs
    for (const k of ['kZ', 'kP', 'kY', 'kR', 'swY', 'swP', 'jY', 'jP', 'bump']) stepSpring(S[k], dt);
    // look drag
    const ddx = THREE.MathUtils.clamp(I.st.dx * 0.0021, -0.2, 0.2), ddy = THREE.MathUtils.clamp(I.st.dy * 0.0021, -0.2, 0.2);
    const adsK = THREE.MathUtils.lerp(1, 0.4, S.ads);
    S.swY.v += ddx * 3.2 * adsK * 60 * dt; S.swP.v += ddy * 2.6 * adsK * 60 * dt;
    S.swY.x = THREE.MathUtils.clamp(S.swY.x, -0.09, 0.09); S.swP.x = THREE.MathUtils.clamp(S.swP.x, -0.07, 0.07);
    // air
    if (!p.grounded) { S.jY.t = THREE.MathUtils.clamp(-p.vel.y * 0.0045, -0.02, 0.024); S.jP.t = THREE.MathUtils.clamp(p.vel.y * 0.012, -0.06, 0.06); } else { S.jY.t = 0; S.jP.t = 0; }
    // bob + breathing
    S.phase += dt * (5.2 + 1.55 * p.speed);
    S.bobAmt += (THREE.MathUtils.clamp(p.speed / 3.6, 0, 1) * (p.grounded ? 1 : 0) - S.bobAmt) * Math.min(1, dt * 8);
    const bob = S.bobAmt * (S.ads > 0.5 ? 0.12 : 1) * (1 + 1.4 * S.sprint), ph = S.phase, br = THREE.MathUtils.lerp(1, 0.3, S.ads), t = S.t;
    // compose pose
    const hipP = W.hip, adsP = new THREE.Vector3(0, -sightY, W.adsZ);
    const P0 = hipP.clone().lerp(adsP, S.ads);
    P0.addScaledVector(W.sprintP, S.sprint * (1 - S.ads)).addScaledVector(W.reloadP, rw);
    P0.x += Math.sin(ph) * 0.006 * bob - S.swY.x * 0.06 + Math.sin(0.85 * t + 1) * 0.0012 * br - (G.player.s.vel.x * G.player.right.x + G.player.s.vel.z * G.player.right.z) / 6.4 * 0.004 * (1 - S.ads);
    P0.y += (Math.sin(2 * ph) * 0.0042 - Math.pow(0.5 + 0.5 * Math.cos(2 * ph + 0.6), 4) * 0.0048) * bob + S.swP.x * 0.05 + Math.sin(1.7 * t) * 0.0016 * br + S.jY.x + S.bump.x * 0.02;
    P0.z += S.kZ.x * 0.055;
    const mk = S.meleeT < 0 ? 0 : S.meleeT < 0.1 ? ease5(S.meleeT / 0.1) : 1 - ease5((S.meleeT - 0.1) / 0.38);
    P0.z -= 0.2 * mk; P0.x -= 0.09 * mk; P0.y += 0.05 * mk;
    pose.position.copy(P0);
    const rx = THREE.MathUtils.lerp(W.hipR.x, 0, S.ads) + W.sprintR.x * S.sprint + W.reloadR.x * rw + Math.sin(2 * ph + 0.5) * 0.008 * bob + Math.sin(1.7 * t + 0.8) * 0.0035 * br + S.kP.x * 0.045 + S.jP.x + S.swP.x * 0.6 + S.bump.x * 0.08;
    const ry = THREE.MathUtils.lerp(W.hipR.y, 0, S.ads) + W.sprintR.y * S.sprint * (1 - S.ads) + W.reloadR.y * rw + Math.sin(ph) * 0.01 * bob + Math.sin(0.6 * t) * 0.002 * br + S.kY.x * 0.03 + S.swY.x;
    const rz = THREE.MathUtils.lerp(W.hipR.z, 0, S.ads) + W.sprintR.z * S.sprint + W.reloadR.z * rw + Math.sin(ph) * 0.014 * bob + Math.sin(0.5 * t) * 0.004 * br + S.kR.x * 0.03 + S.swY.x * 0.7;
    pose.rotation.set(rx - 0.25 * mk, ry + 0.35 * mk, rz + 0.75 * mk);
    // flash
    if (S.flashT > 0) { S.flashT -= dt; const k = Math.sqrt(Math.max(0, S.flashT / S.flashDur)); fm.uniforms.uI.value = fj.uniforms.uI.value = 9.5 * k; flash.visible = S.flashT > 0; }
    else flash.visible = false;
    R.fx.flash = Math.max(0, R.fx.flash - dt * 30);
    dotMat.uniforms.uA.value = THREE.MathUtils.smoothstep(S.ads, 0.55, 0.95);
    root.visible = !p.dead;
  }
  return { update, S, W, root, gun, fire, launch, resupply, startReload, muzzleLocal, vmToWorld, name: gunName, sightY, set hip(v) { W.hip.copy(v); } };
}
