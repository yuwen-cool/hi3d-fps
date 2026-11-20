import * as THREE from 'three';

// CPU-simulated, GPU-instanced particles. Pools: additive (sparks, tracers, glows) and
// alpha (smoke, dust, sand), plus debris chunks, brass shells and bullet-hole decals.
// Every effect follows "anticipation -> burst -> lingering residue".

const PVS = /* glsl */`
attribute vec4 iPos;    // xyz, size
attribute vec4 iCol;    // rgb (HDR), alpha
attribute vec4 iVel;    // dir xyz, stretch (metres)
attribute vec2 iRot;    // rotation, softness
varying vec4 vCol; varying vec2 vUv; varying float vSoft;
void main(){
  vec3 c = (modelViewMatrix * vec4(iPos.xyz, 1.0)).xyz;
  vec2 q = position.xy; vUv = position.xy * 2.0;
  float s = iPos.w;
  vec3 vd = (modelViewMatrix * vec4(iVel.xyz, 0.0)).xyz;
  if (iVel.w > 0.0 && length(vd.xy) > 1e-4) {     // velocity-aligned streak
    vec2 ax = normalize(vd.xy); vec2 pe = vec2(-ax.y, ax.x);
    c.xy += ax * q.x * (iVel.w + s) + pe * q.y * s;
  } else {
    float cs = cos(iRot.x), sn = sin(iRot.x);
    c.xy += mat2(cs, -sn, sn, cs) * q * s;
  }
  vCol = iCol; vSoft = iRot.y;
  gl_Position = projectionMatrix * vec4(c, 1.0);
}`;
const PFS = /* glsl */`
varying vec4 vCol; varying vec2 vUv; varying float vSoft;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main(){
  float r = length(vUv);
  float a;
  if (vSoft > 0.5) { // puffy smoke: noisy soft disc
    float nn = n(vUv * 2.6 + vCol.a * 7.0) * 0.6 + n(vUv * 5.3 - 3.0) * 0.4;
    a = smoothstep(1.0, 0.25, r + (nn - 0.5) * 0.7);
  } else a = smoothstep(1.0, 0.0, r) * smoothstep(1.0, 0.6, r * 0.9);
  ADDITIVE_OUT
}`;

function pool(n, additive) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const A = { iPos: 4, iCol: 4, iVel: 4, iRot: 2 };
  const buf = {};
  for (const [k, w] of Object.entries(A)) { buf[k] = new THREE.InstancedBufferAttribute(new Float32Array(n * w), w); buf[k].setUsage(THREE.DynamicDrawUsage); geo.setAttribute(k, buf[k]); }
  geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    vertexShader: PVS,
    fragmentShader: PFS.replace('ADDITIVE_OUT', additive ? 'gl_FragColor = vec4(vCol.rgb * a * vCol.a, 1.0);' : 'gl_FragColor = vec4(vCol.rgb, a * vCol.a);'),
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = additive ? 6 : 5;
  const P = [];   // live particles
  return { mesh, geo, buf, P, n, additive };
}

export function createFX(G) {
  const R = G.R, scene = R.scene, sunCol = G.sun.col, rnd = Math.random;
  const add = pool(3000, true), alpha = pool(1400, false);
  scene.add(add.mesh, alpha.mesh);
  const tmp = new THREE.Vector3();
  // lighting for alpha particles: warm sun-side, cool shadow side, cheap but consistent
  const amb = new THREE.Color(0.20, 0.18, 0.17), sunLit = new THREE.Color().copy(sunCol).multiplyScalar(1.1);
  function emit(p, o) {
    if (p.P.length >= p.n) p.P.shift();
    p.P.push({ x: o.pos.x, y: o.pos.y, z: o.pos.z, vx: o.vel?.x || 0, vy: o.vel?.y || 0, vz: o.vel?.z || 0, life: o.life, age: 0, s0: o.size, s1: o.size1 ?? o.size,
      r: o.col[0], g: o.col[1], b: o.col[2], a0: o.alpha ?? 1, grav: o.grav ?? 0, drag: o.drag ?? 0, stretch: o.stretch || 0, rot: rnd() * 6.28, vr: (rnd() - 0.5) * (o.spin || 0), soft: o.soft ? 1 : 0, rise: o.rise || 0, fadeIn: o.fadeIn || 0 });
  }
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  function cone(n, spread) { const d = n.clone(); d.x += (rnd() - 0.5) * spread; d.y += (rnd() - 0.5) * spread; d.z += (rnd() - 0.5) * spread; return d.normalize(); }
  function litColor(c, k = 1) { const s = 0.35 + 0.65 * k; return [c[0] * (amb.r + sunLit.r * s), c[1] * (amb.g + sunLit.g * s), c[2] * (amb.b + sunLit.b * s)]; }

  // ---------- debris chunks ----------
  const DEB = 256; const debGeo = new THREE.BoxGeometry(1, 1, 1);
  const debMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0.4 });
  const deb = new THREE.InstancedMesh(debGeo, debMat, DEB); deb.instanceMatrix.setUsage(THREE.DynamicDrawUsage); deb.castShadow = false; deb.frustumCulled = false; deb.count = 0; scene.add(deb);
  deb.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(DEB * 3), 3);
  const debs = [];
  function chunk(pos, vel, size, color, life = 2.5, flat = 0) { if (debs.length >= DEB) debs.shift(); debs.push({ p: pos.clone(), v: vel, s: size, c: new THREE.Color(color), life, age: 0, q: new THREE.Quaternion().random(), w: V(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(flat ? 12 : 30), flat }); }

  // ---------- shells ----------
  const SH = 60; const shGeo = new THREE.CylinderGeometry(0.0045, 0.0045, 0.045, 8); shGeo.rotateX(Math.PI / 2);
  const shMat = new THREE.MeshStandardMaterial({ color: 0xc9a046, metalness: 1, roughness: 0.32 });
  const shells = new THREE.InstancedMesh(shGeo, shMat, SH); shells.frustumCulled = false; shells.count = 0; scene.add(shells);
  const sh = [];
  // ---------- decals ----------
  const DC = 160;
  const dcv = document.createElement('canvas'); dcv.width = dcv.height = 128; const cx = dcv.getContext('2d');
  const gr = cx.createRadialGradient(64, 64, 2, 64, 64, 60); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.12, 'rgba(10,8,6,0.95)'); gr.addColorStop(0.3, 'rgba(40,32,24,0.55)'); gr.addColorStop(1, 'rgba(60,50,40,0)');
  cx.fillStyle = gr; cx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 14; i++) { cx.strokeStyle = 'rgba(20,15,10,0.5)'; cx.lineWidth = 1.5; cx.beginPath(); const a = rnd() * 6.28; cx.moveTo(64 + Math.cos(a) * 8, 64 + Math.sin(a) * 8); cx.lineTo(64 + Math.cos(a) * (20 + rnd() * 30), 64 + Math.sin(a) * (20 + rnd() * 30)); cx.stroke(); }
  const dTex = new THREE.CanvasTexture(dcv); dTex.colorSpace = THREE.SRGBColorSpace;
  const dMat = new THREE.MeshStandardMaterial({ map: dTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 0.95, metalness: 0 });
  const decals = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), dMat, DC); decals.frustumCulled = false; decals.count = 0; decals.receiveShadow = true; scene.add(decals);
  let dIdx = 0;
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1);
  function decal(p, n, size) {
    _q.setFromUnitVectors(_z, n); const rq = new THREE.Quaternion().setFromAxisAngle(_z, rnd() * 6.28); _q.multiply(rq);
    _m4.compose(p.clone().addScaledVector(n, 0.004), _q, _s.set(size, size, size));
    decals.setMatrixAt(dIdx, _m4); dIdx = (dIdx + 1) % DC; decals.count = Math.max(decals.count, dIdx === 0 ? DC : dIdx); decals.instanceMatrix.needsUpdate = true;
  }

  // ---------- effects ----------
  const SURF = {
    metal: () => ({ sparks: 18, dust: [0.30, 0.28, 0.26], debris: [0x3a3632, 3], decal: 0.07 }),
    concrete: () => ({ sparks: 4, dust: [0.62, 0.56, 0.48], debris: [0x9c9284, 4], decal: 0.09 }),
    sand: () => ({ sparks: 0, dust: [0.62, 0.50, 0.38], debris: [0x8d7356, 5], decal: 0.08, sand: true }),
    wood: () => ({ sparks: 0, dust: [0.45, 0.38, 0.28], debris: [0x6b5236, 4], decal: 0.06 }),
  };
  function impact(hit, dir) {
    const S = (SURF[hit.surface] || SURF.concrete)();
    const p = hit.point, nrm = hit.normal;
    const far = p.distanceTo(R.camera.position) > 55 ? 0.5 : 1;
    const refl = dir.clone().reflect(nrm);
    for (let i = 0; i < S.sparks * far; i++) {
      const d = cone(refl.clone().lerp(nrm, 0.4).normalize(), 1.4), sp = 6 + rnd() * 18;
      emit(add, { pos: p, vel: d.multiplyScalar(sp), life: 0.12 + rnd() * 0.25, size: 0.012, stretch: 0.06 + rnd() * 0.08, col: [14, 7, 2.4], grav: 9.8, drag: 2 });
    }
    if (S.sparks) emit(add, { pos: p.clone().addScaledVector(nrm, 0.03), life: 0.06, size: 0.28, size1: 0.1, col: [10, 6, 2.5] });
    // dust burst along the normal + slow residue
    for (let i = 0; i < 6 * far; i++) {
      const d = cone(nrm, 1.1);
      emit(alpha, { pos: p.clone().addScaledVector(nrm, 0.05), vel: d.multiplyScalar(1.5 + rnd() * 3.5), life: 0.6 + rnd() * 0.9, size: 0.08, size1: 0.45 + rnd() * 0.4, col: litColor(S.dust), alpha: 0.5, drag: 3.2, soft: true, rise: 0.25, spin: 1.5 });
    }
    if (S.sand) for (let i = 0; i < 10 * far; i++) { const d = cone(nrm, 0.8); emit(alpha, { pos: p, vel: d.multiplyScalar(2 + rnd() * 4), life: 0.5 + rnd() * 0.4, size: 0.02, col: litColor(S.dust, 0.8), alpha: 0.9, grav: 9.8 }); }
    for (let i = 0; i < S.debris[1] * far; i++) { const d = cone(nrm, 1.6); chunk(p.clone().addScaledVector(nrm, 0.03), d.multiplyScalar(2 + rnd() * 5), 0.012 + rnd() * 0.02, S.debris[0]); }
    decal(p, nrm, S.decal * (0.8 + rnd() * 0.4));
  }
  function enemyHit(p, dir, weak) {
    for (let i = 0; i < 13; i++) { const d = cone(dir.clone().negate(), 1.5); emit(add, { pos: p, vel: d.multiplyScalar(5 + rnd() * 16), life: 0.15 + rnd() * 0.3, size: 0.014, stretch: 0.07, col: weak ? [6, 9, 16] : [16, 8, 2.5], grav: 9.8, drag: 1.5 }); }
    emit(add, { pos: p, life: 0.07, size: 0.45, size1: 0.15, col: weak ? [5, 8, 14] : [12, 7, 3] });
    for (let i = 0; i < 2; i++) emit(alpha, { pos: p, vel: cone(V(0, 1, 0), 1).multiplyScalar(0.8), life: 0.9, size: 0.12, size1: 0.6, col: litColor([0.12, 0.11, 0.1]), alpha: 0.55, soft: true, drag: 2, rise: 0.4 });
    for (let i = 0; i < 2; i++) chunk(p, cone(dir.clone().negate(), 1.4).multiplyScalar(3 + rnd() * 3), 0.02 + rnd() * 0.02, 0x2e2c2a);
    if ((G._lastHitLight || 0) + 0.09 < G.time) { G._lastHitLight = G.time; R.flash(p, 0xffb060, 8, 4.5, 0.05); }
  }
  function tracer(from, to) {
    const d = to.clone().sub(from); const len = d.length(); d.normalize();
    if (len < 2) return;
    emit(add, { pos: from.clone().addScaledVector(d, Math.min(2.5, len * 0.3)), vel: d.clone().multiplyScalar(260), life: Math.min(0.25, (len - 2) / 260), size: 0.022, stretch: 1.4, col: [16, 9.5, 5], alpha: 1 });
  }
  function muzzleSmoke(p, heat) { emit(alpha, { pos: p, vel: V((rnd() - 0.5) * 0.3, 0.6, (rnd() - 0.5) * 0.3), life: 1.3, size: 0.1 + heat * 0.06, size1: 0.5, col: litColor([0.5, 0.48, 0.46]), alpha: 0.22, soft: true, drag: 1.2, rise: 0.3 }); }
  function explosion(p, size = 1) {
    R.flash(p, 0xffe0b0, 320 * size, 10 + 9 * size, 0.08); R.flash(p, 0xff8a30, 55 * size, 8 + 6 * size, 0.45);
    for (let i = 0; i < 13 + 5 * size; i++) emit(add, { pos: p.clone().add(V(rnd() - 0.5, rnd() * 0.6, rnd() - 0.5).multiplyScalar(size)), vel: cone(V(0, 1, 0), 2).multiplyScalar(2 + rnd() * 5 * size), life: 0.35 + rnd() * 0.4, size: 0.4 * size, size1: 1.4 * size, col: [14, 6, 1.5], drag: 4, soft: true });
    for (let i = 0; i < Math.min(90, 34 * size); i++) emit(add, { pos: p, vel: cone(V(0, 1, 0), 2.2).multiplyScalar(6 + rnd() * 20), life: 0.4 + rnd() * 0.9, size: 0.02, stretch: 0.12, col: [16, 7, 2], grav: 9.8, drag: 0.8 });
    for (let i = 0; i < 11 + 5 * size; i++) emit(alpha, { pos: p.clone().add(V(rnd() - 0.5, rnd(), rnd() - 0.5).multiplyScalar(size)), vel: cone(V(0, 1, 0), 1.6).multiplyScalar(1 + rnd() * 3), life: 2.5 + rnd() * 2, size: 0.6 * size, size1: 3.2 * size, col: litColor([0.14, 0.12, 0.11]), alpha: 0.75, drag: 1.4, soft: true, rise: 0.6, spin: 0.6 });
    for (let i = 0; i < 10 * size; i++) chunk(p, cone(V(0, 1, 0), 2).multiplyScalar(4 + rnd() * 8), 0.03 + rnd() * 0.06, 0x2a2622, 4);
    decal(V(p.x, 0.01, p.z), V(0, 1, 0), 2.3 * size);
    G.events.emit('explosion', { pos: p.clone(), size });
  }
  function electric(p) { // robot death: blue-white arcs + sparks
    for (let i = 0; i < 16; i++) emit(add, { pos: p, vel: cone(V(0, 1, 0), 2.5).multiplyScalar(4 + rnd() * 10), life: 0.2 + rnd() * 0.5, size: 0.012, stretch: 0.08, col: [8, 12, 20], grav: 9.8, drag: 1 });
    emit(add, { pos: p, life: 0.18, size: 0.9, size1: 0.2, col: [5, 8, 14] });
    R.flash(p, 0x9fd8ff, 6, 3, 0.15);
  }

  // shells
  const eject = new THREE.Vector3(0.035, 0.035, -0.12);
  G.events.on('weapon:fire', (e) => {
    tracer(e.muzzle, e.end);
    if (e.hitW) impact(e.hitW, e.dir);
    if (e.hitE) enemyHit(e.hitE.point, e.dir, e.hitE.part === 'weak');
    // brass
    const W = G.weapon; if (!W) return;
    const p = W.vmToWorld(eject, new THREE.Vector3());
    const cam = R.camera; const r = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion), u = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion), f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const v = r.multiplyScalar(2 + rnd() * 1.2).add(u.multiplyScalar(1.2 + rnd() * 0.8)).add(f.multiplyScalar(-0.1 + rnd() * 0.6)).add(G.player.s.vel);
    if (sh.length >= SH) sh.shift();
    sh.push({ p, v, q: new THREE.Quaternion().copy(cam.quaternion), w: V((rnd() - 0.5) * 40, (rnd() - 0.5) * 20, (rnd() - 0.5) * 40), bounces: 0, rest: 0, age: 0 });
    if (W.S.heat > 0.4 && rnd() < 0.3) muzzleSmoke(e.muzzle, W.S.heat);
  });

  const _p = new THREE.Vector3(), _sc = new THREE.Vector3(), _qq = new THREE.Quaternion(), _e = new THREE.Euler();
  function updPool(pl, dt) {
    const P = pl.P; let n = 0;
    const b = pl.buf;
    for (let i = 0; i < P.length; i++) {
      const p = P[i]; p.age += dt; if (p.age >= p.life) continue;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vz *= k; p.vy = p.vy * k - p.grav * dt + p.rise * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (p.y < 0.01 && p.grav > 0) { p.y = 0.01; p.vy *= -0.3; p.vx *= 0.5; p.vz *= 0.5; }
      p.rot += p.vr * dt;
      const t = p.age / p.life;
      const size = p.s0 + (p.s1 - p.s0) * (1 - (1 - t) * (1 - t));
      let a = p.a0 * (1 - t) * (p.fadeIn ? Math.min(1, t / p.fadeIn) : 1);
      if (p.soft) a *= Math.min(1, t * 8);
      const sp = Math.hypot(p.vx, p.vy, p.vz);
      b.iPos.array.set([p.x, p.y, p.z, size], n * 4);
      b.iCol.array.set([p.r, p.g, p.b, a], n * 4);
      b.iVel.array.set(p.stretch && sp > 0.1 ? [p.vx / sp, p.vy / sp, p.vz / sp, p.stretch * Math.min(1, sp / 10)] : [0, 0, 0, 0], n * 4);
      b.iRot.array.set([p.rot, p.soft], n * 2);
      P[n++] = p;
    }
    P.length = n;
    pl.geo.instanceCount = n;
    for (const k in b) { b[k].needsUpdate = true; b[k].clearUpdateRanges(); b[k].addUpdateRange(0, n * b[k].itemSize); }
  }
  let moteT = 0, gustT = 0;
  function ambient(dt) {
    const c = R.camera.position;
    moteT -= dt;
    while (moteT < 0) { moteT += 0.012;
      const p = new THREE.Vector3(c.x + (rnd() - 0.5) * 16, 0.2 + rnd() * 5, c.z + (rnd() - 0.5) * 16);
      emit(alpha, { pos: p, vel: V(0.5 + rnd() * 0.6, (rnd() - 0.5) * 0.15, 0.25 + rnd() * 0.3), life: 3 + rnd() * 3, size: 0.012 + rnd() * 0.02, col: litColor([1.4, 1.1, 0.8], 1), alpha: 0.5, fadeIn: 0.3 });
    }
    gustT -= dt;
    if (gustT < 0) { gustT = 0.05 + rnd() * 0.08;
      const p = new THREE.Vector3(c.x - 10 + rnd() * 20, 0.05, c.z - 14 + rnd() * 20);
      emit(alpha, { pos: p, vel: V(2.2 + rnd(), 0.15, 0.9 + rnd() * 0.5), life: 2 + rnd() * 1.5, size: 0.3, size1: 1.6, col: litColor([0.62, 0.5, 0.38]), alpha: 0.12, soft: true, fadeIn: 0.4, drag: 0.2 });
    }
  }
  function update(dt) {
    if (!G.params.noamb) ambient(dt);
    updPool(add, dt); updPool(alpha, dt);
    // debris
    let n = 0;
    for (const d of debs) {
      d.age += dt; if (d.age > d.life) continue;
      d.v.y -= 9.8 * dt; d.p.addScaledVector(d.v, dt);
      if (d.p.y < d.s * (d.flat ? 0.08 : 0.5)) { d.p.y = d.s * (d.flat ? 0.08 : 0.5); d.v.y *= -0.3; d.v.x *= 0.6; d.v.z *= 0.6; d.w.multiplyScalar(0.6); }
      _qq.setFromEuler(_e.set(d.w.x * dt, d.w.y * dt, d.w.z * dt)); d.q.multiply(_qq);
      const sc = d.s * Math.min(1, (d.life - d.age) * 3);
      _m4.compose(d.p, d.q, d.flat ? _sc.set(sc, sc * 0.12, sc * 0.75) : _sc.set(sc, sc * 0.7, sc * 0.9)); deb.setMatrixAt(n, _m4); deb.setColorAt(n, d.c); n++;
    }
    deb.count = n; deb.instanceMatrix.needsUpdate = true; if (deb.instanceColor) deb.instanceColor.needsUpdate = true;
    for (let i = debs.length - 1; i >= 0; i--) if (debs[i].age > debs[i].life) debs.splice(i, 1);
    // shells
    n = 0;
    for (const s of sh) {
      s.age += dt;
      if (s.rest < 1) {
        s.v.y -= 9.81 * dt; s.p.addScaledVector(s.v, dt);
        _qq.setFromEuler(_e.set(s.w.x * dt, s.w.y * dt, s.w.z * dt)); s.q.multiply(_qq);
        const g = G.phys.groundBelow(s.p, 0.01);
        if (s.p.y < g + 0.005) {
          s.p.y = g + 0.005;
          if (s.v.y < -0.9 && s.bounces < 4) { s.v.y = -s.v.y * (0.32 + rnd() * 0.16); s.v.x = s.v.x * 0.6 + (rnd() - 0.5) * 0.6; s.v.z = s.v.z * 0.6 + (rnd() - 0.5) * 0.6; s.w.set((rnd() - 0.5) * 50, (rnd() - 0.5) * 30, (rnd() - 0.5) * 50); s.bounces++; if (s.bounces <= 2) G.events.emit('shell:bounce', { pos: s.p.clone() }); }
          else { s.rest = 1; s.q.setFromEuler(_e.set(0, rnd() * 6.28, Math.PI / 2)); }
        }
        if (s.age > 8) s.rest = 1;
      } else s.rest += dt;
      const k = s.rest > 4 ? Math.max(0, 1 - (s.rest - 4) / 0.7) : 1;
      if (k <= 0) continue;
      _m4.compose(s.p, s.q, _sc.set(k, k, k)); shells.setMatrixAt(n++, _m4);
    }
    shells.count = n; shells.instanceMatrix.needsUpdate = true;
    for (let i = sh.length - 1; i >= 0; i--) if (sh[i].rest > 4.7) sh.splice(i, 1);
  }
  return { update, impact, enemyHit, tracer, explosion, electric, emit: (alphaPool, o) => emit(alphaPool ? alpha : add, o), chunk, decal, litColor };
}
