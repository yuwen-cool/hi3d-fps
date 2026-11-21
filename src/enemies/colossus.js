import * as THREE from 'three';
import { instance } from '../world/assets.js';

// The colossus: a four-legged oil-rig walker built from three Hi3D parts (hull, upper leg, lower leg).
// No skinning: every leg is two rigid segments solved with analytic two-bone IK each frame, feet are
// planted and stepped in diagonal pairs, the hull rides on top with bob and lean. It fires a charged
// beam that sweeps across the player and sets the ground alight; two glowing coolant tanks on its
// back are the only real weak points.
const V = (x, y, z) => new THREE.Vector3(x, y, z);
// K: the machine's size. It has to stand over the 10 m storage tanks and read as a walking landmark from anywhere in the tank
// farm; the stance widens less (KR) so it still fits the farm's lanes (22 m and 26 m)
const K = 1.4, KR = 1.25;
const CFG = { bodyH: 8.7 * K, hipX: 4.0 * K, hipZ: 3.6 * K, upper: 6.4 * K, lower: 7.6 * K, reachX: 7.8 * KR, reachZ: 5.9 * KR, stepLen: 3.6 * K, stepT: 0.8, lift: 2.1 * K, speed: 1.8, turn: 0.32, coreHp: 520, armour: 0.04, kneeHp: 320 };

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
  hull.scale.multiplyScalar(K); hull.updateMatrixWorld(true); { const s = new THREE.Box3().setFromObject(hull).getSize(V(0, 0, 0)); hull.position.y = -s.y * 0.55; }
  // legs: hip offsets in hull space (x right, z forward)
  const legs = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const up = await segment('colossus_leg_upper', CFG.upper, 'top'), lo = await segment('colossus_leg_lower', CFG.lower, 'bottom');
    root.add(up, lo);
    legs.push({ sx, sz, up, lo, hip: V(0, 0, 0), knee: V(0, 0, 0), foot: V(0, 0, 0), from: V(0, 0, 0), to: V(0, 0, 0), t: 1, pair: sx * sz > 0 ? 0 : 1 });
  }
  root.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; } });
  // weak points glow from inside: a white-hot centre that falls off to deep orange at the rim, with slow plasma bands
  // (reads as a hot lens in an armoured socket, not a flat ball). uI = heat, flashes on a hit.
  const hotMat = (bands, hot = [4.6, 1.25, 0.22], rim = [0.9, 0.08, 0.01]) => new THREE.ShaderMaterial({ toneMapped: false, uniforms: { uI: { value: 1 }, uT: { value: 0 }, uHot: { value: new THREE.Vector3(...hot) }, uRim: { value: new THREE.Vector3(...rim) } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vL; void main(){ vL = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }',
    fragmentShader: `varying vec3 vN; varying vec3 vV; varying vec3 vL; uniform float uI, uT; uniform vec3 uHot, uRim;
      void main(){ float f = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0); float c = pow(f, 2.2);
        float b = ${bands ? '0.7 + 0.3 * sin(vL.y * 5.0 - uT * 5.0) * sin(vL.y * 2.1 + uT * 1.7)' : '0.85 + 0.15 * sin(uT * 7.0)'};
        vec3 col = mix(uRim, uHot, c) * b * uI;
        gl_FragColor = vec4(col, 1.0); }` });
  const armour = new THREE.MeshStandardMaterial({ color: 0x1e1b18, metalness: 0.85, roughness: 0.42 });
  // knee actuators: the first weak points (the cores start sealed inside the hull). A hot lens in a dark armoured collar.
  for (const L of legs) {
    const g = new THREE.Group(), mat = hotMat(false); g.add(new THREE.Mesh(new THREE.SphereGeometry(0.46 * K, 20, 14), mat));
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.58 * K, 0.17 * K, 10, 28), armour); g.add(collar);
    for (let i = 0; i < 4; i++) { const cl = new THREE.Mesh(new THREE.BoxGeometry(0.22 * K, 0.3 * K, 0.5 * K), armour); const a = i * Math.PI / 2 + Math.PI / 4; cl.position.set(Math.cos(a) * 0.62 * K, Math.sin(a) * 0.62 * K, 0); cl.rotation.z = a; g.add(cl); }
    g.traverse((o) => { o.frustumCulled = false; }); // so the loading screen's warm-up frame compiles them for the HDR target
    g.visible = false; scene.add(g); L.k = { hp: CFG.kneeHp, alive: true, w: V(0, 0, 0), g, mat, flash: 0 };
  }
  // the sensor head on the front of the hull: one burning optic that turns to follow you (Hi3D part)
  const headG = new THREE.Group(); { // out in front of the hull's front face, at the height of its upper half
    hullH.updateMatrixWorld(true); const inv = hullH.matrixWorld.clone().invert(), P = []; hull.traverse((m) => { if (m.isMesh) { const a = m.geometry.attributes.position; for (let i = 0; i < a.count; i += 7) P.push(V(0, 0, 0).fromBufferAttribute(a, i).applyMatrix4(m.matrixWorld).applyMatrix4(inv)); } });
    const zmax = Math.max(...P.map((p) => p.z)), fr = P.filter((p) => p.z > zmax - 2.5 * K && Math.abs(p.x) < 2.5 * K), ys = fr.map((p) => p.y).sort((a, b) => a - b);
    headG.position.set(0, ys[Math.floor(ys.length * 0.6)] - 0.5 * K, zmax + 0.9 * K); }
  headG.scale.setScalar(K); hullH.add(headG);
  const headM = await instance('colossus_head'); headM.rotation.y = Math.PI; headG.add(headM);
  headM.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; } });
  const eyeMat = hotMat(false, [5.5, 0.28, 0.06], [0.6, 0.0, 0.0]); const eye = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 14), eyeMat); eye.position.set(0, 0.86, 1.85); eye.frustumCulled = false; headG.add(eye);
  const _hl = V(0, 0, 0);
  // coolant cores (weak points) on the back of the hull, with their own glow light
  const coreLocal = [V(-2.9 * K, -0.4 * K, 0.6 * K), V(2.9 * K, -0.4 * K, 0.6 * K)];
  const cores = coreLocal.map((p) => { const l = { intensity: 0, position: new THREE.Vector3(), getWorldPosition: (o) => o.copy(l.position) }; /* the core's glow is its emissive + bloom; its 'light' is just a tracked point (every real light costs every pixel) */
    const m = new THREE.Group(), mat = hotMat(true); m.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.42 * K, 1.3 * K, 6, 18), mat)); m.userData.mat = mat;
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3, bar = new THREE.Mesh(new THREE.BoxGeometry(0.09 * K, 2.3 * K, 0.12 * K), armour); bar.position.set(Math.cos(a) * 0.5 * K, 0, Math.sin(a) * 0.5 * K); bar.rotation.y = -a; m.add(bar); } // a cage around the coolant rod
    for (const y of [-1.15, 1.15]) { const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.6 * K, 0.6 * K, 0.22 * K, 18), armour); cap.position.y = y * K; m.add(cap); }
    m.traverse((o) => { o.frustumCulled = false; o.castShadow = true; }); m.position.copy(p); hullH.add(m);
    return { local: p, hp: CFG.coreHp, alive: true, light: l, mesh: m, w: V(0, 0, 0), exposed: false, ex: 0, sealed: V(p.x * 0.45, p.y - 0.5 * K, p.z) }; });
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
  // its own lights, so it reads at night: two headlamps with beams sweeping the ground ahead, red beacons on the hips.
  // Glow sprites and additive cones only — no real lights (each would cost every pixel all game)
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.12, 'rgba(255,255,255,0.5)'); g.addColorStop(0.35, 'rgba(255,255,255,0.08)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const glow = (col, size) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false })); sp.scale.setScalar(size); sp.visible = false; scene.add(sp); return sp; };
  const lampLocal = [V(-1.7 * K, 0.1 * K, 5.7 * K), V(1.7 * K, 0.1 * K, 5.7 * K)];
  const lamps = lampLocal.map(() => glow(new THREE.Color(5, 4.6, 3.8), 0.5 * K));   // a hot point with a tight bloom, not a ball of light
  const beacons = [0, 1, 2, 3].map(() => glow(new THREE.Color(10, 0.6, 0.2), 0.55 * K));
  const coneMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, uniforms: { uA: { value: 0 } },
    vertexShader: 'varying vec3 vN; varying vec3 vP; varying float vH; void main(){ vH = -position.y; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vP = mv.xyz; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying vec3 vN; varying vec3 vP; varying float vH; uniform float uA; void main(){ float f = abs(dot(normalize(-vP), normalize(vN))); float a = pow(f, 1.5) * pow(1.0 - vH, 1.8) * smoothstep(0.0, 0.04, vH) * uA; gl_FragColor = vec4(vec3(1.0, 0.92, 0.78) * a, a); }' });
  const coneGeo = new THREE.ConeGeometry(1, 1, 28, 1, true); coneGeo.translate(0, -0.5, 0);
  const cones = lampLocal.map(() => { const m = new THREE.Mesh(coneGeo, coneMat); m.frustumCulled = false; m.visible = false; scene.add(m); return m; });
  const _lp = V(0, 0, 0), _ld = V(0, 0, 0), _lq = new THREE.Quaternion();
  function lights(t) {
    const on = root.visible && !S.distant && !S.dead && S.active, night = G.env?.S.night ?? 0;
    lamps.forEach((l, i) => { l.visible = on; if (!on) return; toWorld(lampLocal[i], l.position); l.material.opacity = 0.85 + 0.15 * Math.sin(t * 9 + i); });
    beacons.forEach((b, i) => { b.visible = on; if (!on) return; b.position.copy(legs[i].hip).add(V(0, 0.9 * K, 0)); b.material.opacity = Math.sin(t * 3.2 + (i % 2) * Math.PI) > 0.3 ? 1 : 0.08; });
    coneMat.uniforms.uA.value = 0.22 * THREE.MathUtils.smoothstep(night, 0.2, 0.9);
    if (on) { // the head turns to the player (inside its arc), the eye burns hotter when the beam is coming
      _hl.copy(G.player.s.pos); _hl.y += 1.6; hullH.worldToLocal(_hl); _hl.sub(headG.position);
      const ty = THREE.MathUtils.clamp(Math.atan2(_hl.x, _hl.z), -0.6, 0.6), tp = THREE.MathUtils.clamp(-Math.atan2(_hl.y, Math.hypot(_hl.x, _hl.z)), -0.35, 0.3), dt = G.realDt || 1 / 60;
      headG.rotation.y += (ty - headG.rotation.y) * Math.min(1, dt * 2.2); headG.rotation.x += (tp - headG.rotation.x) * Math.min(1, dt * 2.2);
      eyeMat.uniforms.uT.value = t; eyeMat.uniforms.uI.value = S.phase === 'charge' ? 1.4 + 0.6 * Math.sin(t * 30) : S.overload ? 0.6 + 0.4 * Math.sin(t * 13) : 1.05; }
    const rim = 0.16 * THREE.MathUtils.smoothstep(night, 0.2, 0.9) * (S.distant ? 0.5 : 1); for (const x of mats) { const u = x.m.userData.sl?.uSlRim; if (u) u.value.w = rim; } // its outline against the night sky
    cones.forEach((c, i) => { c.visible = on && night > 0.2; if (!c.visible) return; toWorld(lampLocal[i], _lp);
      _ld.copy(fwd()).applyAxisAngle(V(0, 1, 0), Math.sin(t * 0.45 + i * 1.3) * 0.45 + (i ? -0.12 : 0.12)).setY(-0.62).normalize(); // two beams sweeping the ground ahead of it
      const len = Math.min(42, (_lp.y + 0.5) / Math.max(0.2, -_ld.y)); c.position.copy(_lp); c.quaternion.copy(_lq.setFromUnitVectors(V(0, -1, 0), _ld)); c.scale.set(len * 0.24, len, len * 0.24); });
  }

  const S = { kneel: 0, leanX: 0, leanZ: 0, legBroken: false, rage: false, overload: false, stuck: false, broken: null, stagT: 0, distant: false, scale: 1, active: false, dead: false, pos: V(0, 0, 0), yaw: 0, vel: V(0, 0, 0), phase: 'idle', t: 0, path: [], wp: 0, gait: 0, bob: 0, lean: 0, limp: 0, beamFrom: V(0, 0, 0), beamTo: V(0, 0, 0), sweepA: V(0, 0, 0), sweepB: V(0, 0, 0), deathT: 0, hp: 1 };
  const fwd = () => V(Math.sin(S.yaw), 0, Math.cos(S.yaw)), right = () => V(Math.cos(S.yaw), 0, -Math.sin(S.yaw));
  const toWorld = (local, out = V(0, 0, 0)) => out.copy(local).applyQuaternion(hullH.quaternion).add(hullH.position); // follows the hull's lean

  // far away on the horizon, before the fight: same machine, scaled up so it reads as a silhouette against the storm;
  // it only walks (no beam, no damage, not a target). Positions live in scaled space: world = root.scale * local.
  // in the distance the machine reads as a dark silhouette with two burning cores, not a hazy grey shape
  const mats = []; root.traverse((m) => { if (m.isMesh && m.material.color && !cores.some((c) => c.mesh === m)) mats.push({ m: m.material, c: m.material.color.clone() }); });
  const silhouette = (on) => { for (const x of mats) x.m.color.copy(x.c).multiplyScalar(on ? 0.22 : 1); for (const c of cores) c.mesh.scale.setScalar(on ? 1.6 : 1); };
  function spawnDistant(pos, yaw, path, scale = 1.7) {
    silhouette(true);
    S.distant = true; S.active = false; S.dead = false; S.scale = scale; root.scale.setScalar(scale);
    S.pos.copy(pos).divideScalar(scale); S.yaw = yaw; S.path = path.map((p) => p.clone().divideScalar(scale)); S.wp = 0; S.phase = 'walk'; S.t = 0; root.visible = true;
    for (const L of legs) { home(L, L.foot); L.from.copy(L.foot); L.to.copy(L.foot); L.t = 1; }
  }
  function hideDistant() { if (!S.distant) return; silhouette(false); S.distant = false; root.visible = false; root.scale.setScalar(1); S.scale = 1; }
  const worldPos = () => hullH.position.clone().multiplyScalar(S.scale);
  function spawn(pos, yaw, path) {
    silhouette(false); S.distant = false; S.scale = 1; root.scale.setScalar(1);
    S.active = true; S.dead = false; S.pos.copy(pos); S.yaw = yaw; S.path = path.map((p) => p.clone()); S.wp = 0; S.phase = 'walk'; S.t = 0; root.visible = true;
    for (const c of cores) { c.hp = CFG.coreHp; c.alive = true; c.mesh.visible = true; c.exposed = false; c.ex = 0; }
    for (const L of legs) { L.broken = false; L.k.hp = CFG.kneeHp; L.k.alive = true; L.k.g.visible = true; L.lo.visible = true; L.fall = null; }
    Object.assign(S, { legBroken: false, stagT: 0, kneel: 0, rage: false, overload: false, stuck: false, broken: null, limp: 0, leanX: 0, leanZ: 0 });
    for (const L of legs) { home(L, L.foot); L.from.copy(L.foot); L.to.copy(L.foot); L.t = 1; }
    G.events.emit('boss:spawn', { pos: pos.clone() });
  }
  function home(L, out) { return out.copy(S.pos).addScaledVector(right(), L.sx * CFG.reachX).addScaledVector(fwd(), L.sz * CFG.reachZ).setY(G.phys.groundBelow(out, 0.2)); }

  // two-bone IK in the vertical plane through hip and foot, knee bowed outward and up (insect stance)
  const _a = V(0, 0, 0), _b = V(0, 0, 0), _q = new THREE.Quaternion();
  function solveLeg(L) {
    L.hip.set(L.sx * CFG.hipX, 0, L.sz * CFG.hipZ); toWorld(L.hip, L.hip);
    if (L.broken) { const out = L.hip.clone().sub(hullH.position).setY(0).normalize(); L.knee.copy(L.hip).addScaledVector(out, 2.4 * K).add(V(0, -5.6 * K, 0)); place(L.up, L.hip, L.knee, out.clone().add(V(0, 1, 0)).normalize()); return; }
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
      const other = legs.filter((L) => L.pair !== pair && !L.broken);
      if (other.some((L) => L.t < 1)) continue;
      const mine = legs.filter((L) => L.pair === pair && !L.broken);
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
    if (S.distant) { G.events.emit('boss:step', { pos: L.foot.clone().multiplyScalar(S.scale), far: true }); return; }
    const p = L.foot; G.events.emit('boss:step', { pos: p.clone() });
    for (let i = 0; i < 14; i++) { const a = rnd() * 6.28; G.fxs?.emit(true, { pos: V(p.x + Math.cos(a) * 0.6, 0.2, p.z + Math.sin(a) * 0.6), vel: V(Math.cos(a), 0.15, Math.sin(a)).multiplyScalar(3 + rnd() * 3), life: 1.3 + rnd(), size: 0.4, size1: 1.8, col: G.fxs.litColor([0.55, 0.42, 0.3]), alpha: 0.45, soft: true, drag: 2.2 }); }
    G.fxs?.decal(V(p.x, 0.01, p.z), V(0, 1, 0), 1.6);
    const pd = G.player.s.pos.distanceTo(p); G.player.addShake(THREE.MathUtils.clamp(1 - pd / 40, 0, 1) * 0.45);
    if (pd < 2.2 && !G.god) G.player.damage(45, p);
  }
  // beam: charge at the muzzle, then sweep across the player's position
  const muzzle = () => toWorld(V(0, -0.84 * K, 6.2 * K));
  function beamTick(dt) {
    S.t += dt; const m = muzzle();
    if (S.phase === 'charge') {
      const k = Math.min(1, S.t / 1.6); muzzleLight.position.copy(m); muzzleLight.intensity = 40 * k * (0.8 + 0.2 * Math.sin(S.t * 40));
      if (rnd() < dt * 30) { const v = V((rnd() - 0.5), (rnd() - 0.5), (rnd() - 0.5)).normalize(); G.fxs?.emit(false, { pos: m.clone().addScaledVector(v, 1.5), vel: v.multiplyScalar(-4), life: 0.35, size: 0.03, stretch: 0.2, col: [16, 8, 3] }); }
      if (S.t > 1.6) {
        S.phase = 'fire'; S.t = 0; const pp = G.player.s.pos.clone().setY(0.4), side = right().multiplyScalar(S.rage ? 12 + rnd() * 5 : 7 + rnd() * 3);
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
      // it cooks whatever it touches: a tank (or drum, or gas rack) caught in the sweep goes up, gas lines vent and burn
      if (h?.object) { let o = h.object; while (o && !o.userData.explosive) o = o.parent; if (o) G.explosives?.hurt(o, 300 * dt);
        if (h.object.name === 'gas' && rnd() < dt * 4) { const l = G.fire?.leak(h.point.clone().addScaledVector(h.normal, 0.05), h.normal, true); if (l) G.fire.add(l.pos, { size: 2, life: 18, dir: l.dir, dmg: 80 }); } }
      if ((S.lastScorch || 0) + 0.12 < S.t) { S.lastScorch = S.t; G.fxs?.decal(V(end.x, 0.012, end.z), V(0, 1, 0), 1.1); if (rnd() < 0.4) G.fire?.add(V(end.x, 0.05, end.z), { size: 0.5 + rnd() * 0.5, life: 10 + rnd() * 10 }); }
      // damage: the beam line passing through the player
      const pc = G.player.s.pos.clone().setY(G.player.s.pos.y + 1); const t = pc.clone().sub(m).dot(d);
      if (!G.god && t > 0 && t < m.distanceTo(end) + 0.5 && m.clone().addScaledVector(d, t).distanceTo(pc) < 1.0) { S.pacc = (S.pacc || 0) + 70 * dt; if (S.pacc >= 1) { G.player.damage(Math.floor(S.pacc), m); S.pacc %= 1; } }
      if (S.t > 1.8) { S.phase = 'walk'; S.t = 0; beam.visible = false; muzzleLight.intensity = 0; S.cool = S.rage ? 2.2 + rnd() * 1.5 : 4 + rnd() * 3; }
    }
  }
  // weak points + armour: hitTest returns {distance, point, core}
  const _c = V(0, 0, 0), _ray = new THREE.Ray();
  function hitTest(o, d, maxD) {
    if (!S.active || S.dead) return null; _ray.set(o, d); let best = null;
    // the tanks ride outside the hull: a shot passing within their radius counts, wherever it is fired from
    if (!S.legBroken) for (const L of legs) { const k = L.k; if (!k.alive) continue; const t = k.w.clone().sub(o).dot(d); if (t < 0 || t > maxD) continue; if (o.clone().addScaledVector(d, t).distanceTo(k.w) < 1.2 * K && (!best || t < best.distance)) best = { distance: t - 0.5, point: o.clone().addScaledVector(d, t - 0.5), knee: L }; }
    if (best) return best;
    for (const c of cores) { if (!c.alive || !c.exposed) continue; toWorld(c.local, _c); const t = _c.clone().sub(o).dot(d); if (t < 0 || t > maxD) continue; if (o.clone().addScaledVector(d, t).distanceTo(_c) < 1.15 * K && (!best || t < best.distance)) best = { distance: t - 0.6, point: o.clone().addScaledVector(d, t - 0.6), core: c }; }
    if (best) return best;
    const hb = new THREE.Box3().setFromObject(hullH); const p = _ray.intersectBox(hb, V(0, 0, 0)); if (p) { const t = p.distanceTo(o); if (t < maxD) best = { distance: t, point: p, core: null }; }
    return best;
  }
  function damage(hit, dmg) {
    if (S.dead || S.overload) return;
    if (hit.knee) {
      const k = hit.knee.k; k.hp -= dmg; k.flash = 0.08;
      for (let i = 0; i < 5; i++) G.fxs?.emit(false, { pos: hit.point, vel: V((rnd() - 0.5) * 8, rnd() * 6, (rnd() - 0.5) * 8), life: 0.3, size: 0.02, stretch: 0.08, col: [18, 9, 3], grav: 9.8 });
      if (k.hp <= 0 && k.alive) breakLeg(hit.knee);
      return;
    }
    if (hit.core) {
      const c = hit.core; c.hp -= dmg; c.flash = 0.08;
      for (let i = 0; i < 6; i++) G.fxs?.emit(false, { pos: hit.point, vel: V((rnd() - 0.5) * 8, rnd() * 6, (rnd() - 0.5) * 8), life: 0.3, size: 0.02, stretch: 0.08, col: [18, 9, 3], grav: 9.8 });
      if (c.hp <= 0 && c.alive) { c.alive = false; c.light.intensity = 0; c.mesh.visible = false; G.explosives?.blast(toWorld(c.local), 1.6, 4, 0); S.limp = Math.min(1, S.limp + 0.5); G.events.emit('boss:core', { left: cores.filter((x) => x.alive).length }); if (!cores.some((x) => x.alive)) overload(); }
    } else { G.fxs?.enemyHit?.(hit.point, V(0, 1, 0), false); }
  }
  // phase 1 -> 2: the knee blows, the shin drops away, the machine goes down on that corner and the armour over the
  // cores is blown off by the shock — from now on it drags itself on three legs and fires faster and wider
  function breakLeg(L) {
    L.k.alive = false; L.k.g.visible = false; L.broken = true; S.legBroken = true; S.broken = L; S.stagT = 0; S.phase = 'stagger'; beam.visible = false; muzzleLight.intensity = 0;
    const knee = L.knee.clone(), out = L.knee.clone().sub(hullH.position).setY(0).normalize();
    L.fall = { t: 0, from: knee.clone(), fromQ: L.lo.quaternion.clone(), to: V(knee.x + out.x * 4, 0.8, knee.z + out.z * 4), toQ: new THREE.Quaternion().setFromUnitVectors(V(0, -1, 0), out.clone().add(V(0, -0.08, 0)).normalize()), landed: false };
    G.explosives?.blast(knee, 1.5, 4, 0); G.fxs?.electric(knee); G.player.addShake(0.6); G.slowmo(1.2, 0.3); G.R.fx.punch = 1;
    G.events.emit('boss:leg', { pos: knee });
  }
  function exposeCores() {
    for (const c of cores) { c.exposed = true; const p = toWorld(c.local); G.explosives?.blast(p, 1.2, 3, 0);
      for (let i = 0; i < 18; i++) G.fxs?.emit(true, { pos: p, vel: V((rnd() - 0.5) * 3, 2 + rnd() * 3, (rnd() - 0.5) * 3), life: 2.2, size: 0.4, size1: 2.6, col: G.fxs.litColor([0.85, 0.85, 0.85]), alpha: 0.4, soft: true, rise: 1, drag: 1 }); }
    G.events.emit('boss:exposed', {});
  }
  // both cores gone: it overloads, stops fighting and staggers to the trap point the flow gives it (or just dies)
  function overload() {
    S.overload = true; S.phase = 'walk'; beam.visible = false; muzzleLight.intensity = 0;
    if (!S.trap) { die(); return; }
    S.path = [S.trap.clone()]; S.wp = 0; G.events.emit('boss:overload', { pos: hullH.position.clone() });
  }
  function trapKill() { if (!S.dead) die(); }
  function die() { S.dead = true; S.phase = 'dying'; S.deathT = 0; beam.visible = false; muzzleLight.intensity = 0; G.slowmo(1.6, 0.25); G.events.emit('boss:dying', { pos: hullH.position.clone() }); }
  // blasts from grenades/drums hit the cores too
  G.events.on('blast', (e) => { if (!S.active || S.dead || !e.dmg) return; for (const c of cores) if (c.alive && c.exposed && toWorld(c.local).distanceTo(e.pos) < 3) damage({ core: c, point: e.pos }, e.dmg * 0.8);
    if (!S.legBroken) for (const L of legs) if (L.k.alive && L.k.w.distanceTo(e.pos) < 3) damage({ knee: L, point: e.pos }, e.dmg * 0.8); });

  // the legs are solid: the player is shoved out of a lower leg (knee to foot) instead of the camera ending up inside it
  const _pa = V(0, 0, 0), _pb = V(0, 0, 0);
  function pushPlayer() {
    const pp = G.player.s.pos, R0 = 1.15 * K;
    for (const L of legs) { if (L.broken && L.fall) continue; _pa.copy(L.knee); _pb.copy(L.foot);
      const dx = _pb.x - _pa.x, dz = _pb.z - _pa.z, dy = _pb.y - _pa.y, len2 = dx * dx + dy * dy + dz * dz || 1;
      const t = THREE.MathUtils.clamp(((pp.x - _pa.x) * dx + (pp.y + 1 - _pa.y) * dy + (pp.z - _pa.z) * dz) / len2, 0, 1);
      const cx = _pa.x + dx * t, cy = _pa.y + dy * t, cz = _pa.z + dz * t; if (cy > pp.y + 2.2) continue;
      const ox = pp.x - cx, oz = pp.z - cz, d = Math.hypot(ox, oz); if (d >= R0) continue;
      const k = (R0 - d) / Math.max(d, 1e-3); pp.x += (d > 1e-3 ? ox : 1) * k; pp.z += (d > 1e-3 ? oz : 0) * k; }
  }
  function update(dt) {
    lights(G.time);
    if (!S.active && !S.distant) return;
    if (S.active && !S.dead) pushPlayer();
    dt *= G.enemyTime ?? 1;
    if (S.phase === 'dying') return dying(dt);
    // locomotion: follow waypoints, keep facing the player while firing
    const pp = G.player.s.pos; const toP = pp.clone().sub(S.pos).setY(0);
    const goal = S.path[S.wp]; S.vel.set(0, 0, 0);
    if (S.phase === 'stagger') {
      S.stagT += dt; if (S.stagT > 1.3 && !cores[0].exposed) exposeCores();
      if (S.stagT > 3.6) { S.phase = 'walk'; S.rage = true; S.limp = 0.55; S.cool = 1.5; }
    }
    if (S.phase === 'walk') {
      if (goal) { const d = goal.clone().sub(S.pos).setY(0);
        if (S.overload && d.length() < 2) { if (!S.stuck) { S.stuck = true; G.events.emit('boss:stuck', { pos: hullH.position.clone() }); } }
        else if (d.length() < 1.5) S.wp = (S.wp + 1) % S.path.length; else S.vel.copy(d.normalize()).multiplyScalar(CFG.speed * (1 - 0.4 * S.limp) * (S.overload ? 0.7 : 1)); }
      if (S.overload) S.cool = 99;
      S.cool = (S.cool ?? 3) - dt;
      if (!S.distant && !G.cinematic && S.cool <= 0 && toP.length() < 45) { S.phase = 'charge'; S.t = 0; G.events.emit('boss:charge', {}); }
    }
    const wantYaw = S.phase === 'walk' && (S.vel.lengthSq() > 0.01 || S.distant) ? (S.vel.lengthSq() > 0.01 ? Math.atan2(S.vel.x, S.vel.z) : S.yaw) : Math.atan2(toP.x, toP.z);
    let dy = wantYaw - S.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); S.turning = Math.abs(dy) > 0.05;
    S.yaw += THREE.MathUtils.clamp(dy, -CFG.turn * dt, CFG.turn * dt);
    S.pos.addScaledVector(S.vel, dt);
    stepFeet(dt);
    // hull rides on the feet: height from the mean foot height, lean toward lifted legs, a heavy bob
    const fy = legs.reduce((a, L) => a + L.foot.y, 0) / 4; S.gait += dt * 3.2;
    // going down on the broken corner: a hard drop during the stagger, then it rides lower and leans for good
    const kneelT = S.legBroken ? (S.phase === 'stagger' ? 3.2 * Math.min(1, S.stagT / 0.5) * (S.stagT > 2.6 ? 1 - 0.35 * Math.min(1, (S.stagT - 2.6)) : 1) : 2.1) : 0;
    S.kneel += (kneelT - S.kneel) * Math.min(1, dt * (S.phase === 'stagger' ? 9 : 2));
    const bk = S.broken, leanK = S.kneel / 3.2;
    S.leanZ = bk ? -bk.sx * 0.2 * leanK : 0; S.leanX = bk ? bk.sz * 0.14 * leanK : 0;
    const shake = S.stuck ? (rnd() - 0.5) * 0.08 : 0;
    hullH.position.set(S.pos.x + shake, CFG.bodyH + fy * 0.4 - 0.18 * Math.abs(Math.sin(S.gait)) - S.limp * 0.6 - S.kneel, S.pos.z);
    const lx = legs.reduce((a, L) => a + L.sx * (L.foot.y), 0), lz = legs.reduce((a, L) => a + L.sz * (L.foot.y), 0);
    hullH.rotation.set(-lz * 0.03 + S.leanX, S.yaw, lx * 0.03 + S.leanZ + shake * 0.5, 'YXZ');
    for (const L of legs) solveLeg(L);
    // knee targets ride the knees and pulse; the shin of a broken leg tumbles to the sand
    const camP = G.R.camera.position;
    for (const L of legs) {
      const k = L.k; k.w.copy(L.knee); k.flash = Math.max(0, k.flash - dt);
      if (k.alive && !S.distant && !S.legBroken) { k.g.position.copy(L.knee); k.g.lookAt(camP); k.mat.uniforms.uT.value = G.time; k.mat.uniforms.uI.value = (0.85 + 0.15 * Math.sin(G.time * 6 + L.sx * 2)) * (k.flash > 0 ? 1.8 : 1); k.g.visible = true; } else k.g.visible = false;
      if (L.fall && !L.fall.landed) {
        const f = L.fall; f.t += dt; const e = Math.min(1, f.t / 0.9), e2 = e * e;
        L.lo.position.lerpVectors(f.from, f.to, e).setY(THREE.MathUtils.lerp(f.from.y, f.to.y, e2)); L.lo.quaternion.slerpQuaternions(f.fromQ, f.toQ, Math.min(1, e * 1.2));
        if (e >= 1) { f.landed = true; const p = f.to.clone().setY(0.2); G.events.emit('boss:step', { pos: p }); G.player.addShake(0.5);
          for (let i = 0; i < 30; i++) { const a = rnd() * 6.28; G.fxs?.emit(true, { pos: V(p.x + Math.cos(a) * 2, 0.3, p.z + Math.sin(a) * 2), vel: V(Math.cos(a), 0.2, Math.sin(a)).multiplyScalar(4 + rnd() * 4), life: 2, size: 0.5, size1: 2.6, col: G.fxs.litColor([0.55, 0.42, 0.3]), alpha: 0.5, soft: true, drag: 2 }); }
          G.fire?.add(p, { size: 1.2, life: 60 }); }
      } else if (L.fall) { if (rnd() < dt * 3) G.fxs?.emit(false, { pos: L.fall.to.clone().setY(1), vel: V((rnd() - 0.5) * 3, 2 + rnd() * 3, (rnd() - 0.5) * 3), life: 0.4, size: 0.015, stretch: 0.08, col: [14, 8, 2], grav: 9.8 }); }
      else if (!L.broken) { /* attached */ }
    }
    if (S.broken && rnd() < dt * 12) { const p = S.broken.knee; G.fxs?.emit(false, { pos: p, vel: V((rnd() - 0.5) * 4, rnd() * 3, (rnd() - 0.5) * 4), life: 0.35, size: 0.015, stretch: 0.08, col: [16, 9, 3], grav: 9.8 }); if (rnd() < 0.3) G.fxs?.emit(true, { pos: p, vel: V(0.2, 1.2, 0.2), life: 2.5, size: 0.3, size1: 1.8, col: G.fxs.litColor([0.07, 0.06, 0.05]), alpha: 0.5, soft: true, rise: 0.5 }); }
    for (const c of cores) { if (!c.alive) continue; c.ex = Math.min(1, c.ex + (c.exposed ? dt * 1.4 : 0)); const ce = c.ex * c.ex * (3 - 2 * c.ex);
      c.mesh.position.lerpVectors(c.sealed, c.local, ce); c.mesh.scale.setScalar(0.55 + 0.45 * ce); }
    for (const c of cores) { if (!c.alive) continue; if (!root.visible || S.distant) { c.light.intensity = 0; continue; } toWorld(c.mesh.position, c.light.position); c.flash = Math.max(0, (c.flash || 0) - dt); { const u = c.mesh.userData.mat.uniforms; u.uT.value = G.time; u.uI.value = (0.55 + 0.45 * c.ex) * (c.flash > 0 ? 1.8 : 1); } c.light.intensity = (2 + 14 * c.ex) * (1 + 0.4 * Math.sin(G.time * 5)) + (c.flash > 0 ? 40 : 0); if (c.flash > 0) R.flash(c.light.position, 0xff7a20, 40, 9, 0.05); }
    if (S.stuck && rnd() < dt * 20) { const p = toWorld(V((rnd() - 0.5) * 5, rnd() * 1.5, (rnd() - 0.5) * 6)); G.fxs?.emit(false, { pos: p, vel: V((rnd() - 0.5) * 6, rnd() * 5, (rnd() - 0.5) * 6), life: 0.4, size: 0.02, stretch: 0.1, col: [8, 14, 22], grav: 9.8 }); if (rnd() < 0.15) G.fxs?.electric(p); }
    // health bar: knees are the first third, the cores the rest; overload sits on a sliver
    const kneeBest = Math.max(...legs.map((L) => (L.k.alive ? L.k.hp : 0))) / CFG.kneeHp;
    S.hp = S.overload ? 0.06 : !S.legBroken ? 0.7 + 0.3 * Math.min(...legs.filter((L) => L.k.alive).map((L) => L.k.hp / CFG.kneeHp)) : 0.08 + 0.62 * cores.reduce((a, c) => a + Math.max(0, c.hp), 0) / (CFG.coreHp * cores.length);
    S.label = S.overload ? 'OVERLOADING' : S.legBroken ? 'CORES EXPOSED' : 'ARMOURED — KNEE ACTUATORS'; void kneeBest;
    if ((S.phase === 'charge' || S.phase === 'fire') && !S.distant) beamTick(dt);
    // damaged: smoke and sparks from dead cores
    for (const c of cores) if (!c.alive && rnd() < dt * 8) G.fxs?.emit(true, { pos: toWorld(c.local), vel: V(0.3, 1.6, 0.2), life: 3, size: 0.4, size1: 2.4, col: G.fxs.litColor([0.06, 0.055, 0.05]), alpha: 0.6, soft: true, rise: 0.6, drag: 0.6 });
  }
  function dying(dt) {
    S.deathT += dt; const k = Math.min(1, S.deathT / 2.6);
    // knees buckle: hull sinks and rolls, chain explosions along it, then one last blast
    hullH.position.y = THREE.MathUtils.lerp(CFG.bodyH, 1.6 * K, k * k); hullH.rotation.z += dt * 0.12 * (1 - k); hullH.rotation.x += dt * 0.08 * (1 - k);
    for (const L of legs) { L.foot.lerp(L.foot.clone().sub(hullH.position).setY(0).multiplyScalar(1.25).add(hullH.position).setY(0), dt * 0.8); solveLeg(L); }
    if (rnd() < dt * 5 && S.deathT < 2.8) G.fxs?.explosion(toWorld(V((rnd() - 0.5) * 4, 0.5 + rnd(), (rnd() - 0.5) * 5)), 0.9 + rnd() * 0.6);
    if (S.deathT > 2.8 && !S.final) { S.final = true; G.explosives?.blast(hullH.position.clone(), 3.4, 14, 400); for (let i = 0; i < 6; i++) G.fire?.add(toWorld(V((rnd() - 0.5) * 6, -hullH.position.y + 0.1, (rnd() - 0.5) * 7)), { size: 1 + rnd() * 1.5, life: 200 }); G.events.emit('boss:dead', { pos: hullH.position.clone() }); }
  }
  // what is worth shooting right now (world points), for markers and the test player
  function targets() { if (!S.active || S.dead || S.overload) return []; return S.legBroken ? cores.filter((c) => c.alive && c.exposed).map((c) => c.light.getWorldPosition(new THREE.Vector3())) : legs.filter((L) => L.k.alive).map((L) => L.k.w); }
  return { spawn, spawnDistant, hideDistant, worldPos, muzzle, update, hitTest, damage, trapKill, targets, legs, S, root, cores, hull: hullH, head: headG };
}
