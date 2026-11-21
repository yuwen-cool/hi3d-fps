import * as THREE from 'three';
import { instance } from '../world/assets.js';

// The dropship (Hi3D model). It brings the player in and takes them out:
//   deploy()        hovers over the drop point while the player falls, then noses down and leaves into the sun
//   inbound(pad)    at night after the colossus: in from the west over the dunes, banks round, flares, settles
//                   over the pad with the searchlight on it ('ship:ready')
//   liftoff(onGone) the boarding shot: climbs off the pad, turns west over the burning wreck and is gone
// Nav lights, engine glow, a searchlight with a visible beam, an underglow that lights the dust, rotor wash
// on the sand and a positioned engine loop.
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const YAW0 = Math.PI;                 // the model's nose is +Z; turn it to face local -Z
const sstep = THREE.MathUtils.smoothstep, lerp = THREE.MathUtils.lerp;
const ease = (t) => t * t * (3 - 2 * t);
const bez = (a, b, c, d, t, out) => { const u = 1 - t; return out.set(0, 0, 0).addScaledVector(a, u * u * u).addScaledVector(b, 3 * u * u * t).addScaledVector(c, 3 * u * t * t).addScaledVector(d, t * t * t); };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function createDropship(G) {
  const R = G.R, scene = R.scene;
  const root = new THREE.Group(); root.rotation.order = 'YXZ'; root.visible = false; scene.add(root);
  const hull = new THREE.Group(); root.add(hull);
  let size = V(13, 5, 19);
  const S = { mode: 'off', t: 0, yaw: 0, pitch: 0, roll: 0, eng: 0, pos: V(), last: V(), vel: V(), pad: V(), hover: V(), hoverYaw: 0, path: null, loop: null, ready: false };

  // ---- lights + glow (created up front so the light count never changes mid-game) ----
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.22, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const spr = (r, g, b, s) => { const m = new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(r, g, b), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, fog: false }); const sp = new THREE.Sprite(m); sp.scale.setScalar(s); sp.userData.base = m.color.clone(); hull.add(sp); return sp; };
  const engines = [spr(1.6, 1.0, 0.55, 1.7), spr(1.6, 1.0, 0.55, 1.7)];
  const navR = spr(6, 0.25, 0.15, 0.5), navG = spr(0.2, 6, 0.6, 0.5), strobe = spr(8, 8, 8, 1.2), beacon = spr(5, 0.4, 0.12, 0.45);
  const under = new THREE.PointLight(0xffb27a, 0, 24, 1.7); hull.add(under); R.volLights.push(under);
  const spot = new THREE.SpotLight(0xdde8ff, 0, 80, 0.36, 0.55, 1.4); spot.castShadow = false; const spotT = new THREE.Object3D(); scene.add(spot, spotT); spot.target = spotT;
  // the beam you see in the dust: an open cone, bright at the lamp, fading along its length and at its silhouette edge
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    uniforms: { uA: { value: 0 }, uCol: { value: new THREE.Color(0.9, 0.95, 1.0) } },
    vertexShader: 'varying vec3 vN; varying vec3 vP; varying float vH; void main(){ vH = -position.y; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vP = mv.xyz; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying vec3 vN; varying vec3 vP; varying float vH; uniform float uA; uniform vec3 uCol; void main(){ float f = abs(dot(normalize(-vP), normalize(vN))); float a = pow(f, 1.6) * pow(1.0 - vH, 1.6) * smoothstep(0.0, 0.05, vH) * uA; gl_FragColor = vec4(uCol * a, a); }',
  });
  const beamGeo = new THREE.ConeGeometry(1, 1, 32, 1, true); beamGeo.translate(0, -0.5, 0);
  const beam = new THREE.Mesh(beamGeo, beamMat); beam.frustumCulled = false; beam.renderOrder = 2; scene.add(beam);
  const lamp = V(), _q = new THREE.Quaternion(), _d = V(), _a = V(), _b = V(), _w = V();

  function layout() {
    const W = size.x, Hh = size.y, L = size.z;
    engines[0].position.set(-W * 0.39, Hh * 0.3, -L * 0.05); engines[1].position.set(W * 0.39, Hh * 0.3, -L * 0.05);
    navR.position.set(-W * 0.5, Hh * 0.5, -L * 0.05); navG.position.set(W * 0.5, Hh * 0.5, -L * 0.05);
    strobe.position.set(0, Hh * 0.95, L * 0.42); beacon.position.set(0, 0.15, L * 0.05); under.position.set(0, -0.6, 0);
    lamp.set(0, 0.5, -L * 0.44);
  }
  layout();
  instance('dropship').then((o) => {
    o.rotation.y = YAW0; o.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(o); size = b.getSize(V()); const c = b.getCenter(V());
    o.position.set(-c.x, -b.min.y, -c.z); hull.add(o); o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); layout();
  });

  // ---- missions ----
  function show() { root.visible = true; if (!S.loop) S.loop = G.audio?.loop?.('shipLoop', { ref: 14, roll: 0.45 }) || null; }
  function deploy() {
    const L = G.level.layout; S.mode = 'deploy'; S.t = 0; S.yaw = L.spawnYaw; S.pitch = 0; S.roll = 0; S.eng = 1; S.passed = false;
    S.pos.copy(L.spawn).add(V(0.6, 15.5, 0.4)); S.start = S.pos.clone(); show();
  }
  function inbound(pad, { hover, yaw = 0 } = {}) {
    S.pad.copy(pad); S.hover.copy(hover || pad.clone().add(V(-1.5, 3.4, 0))); S.hoverYaw = yaw; S.ready = false;
    const H = S.hover;
    S.path = [V(-380, 85, 60), V(-120, 40, 30), V(H.x + 30, H.y + 14, H.z - 18), V(H.x, H.y + 9, H.z)]; // over the dunes, past the pad, back round
    S.mode = 'inbound'; S.t = 0; S.eng = 1; S.pos.copy(S.path[0]); S.yaw = Math.atan2(-(S.path[1].x - S.path[0].x), -(S.path[1].z - S.path[0].z)); show();
  }
  function liftoff(onGone) {
    S.mode = 'leave'; S.t = 0; S.fwd = 0; S.dir = null; S.leaveFrom = S.pos.clone(); S.leaveYaw = Math.atan2(1, 0.25); S.onGone = onGone; S.passed = false;
  }

  const T_IN = 15, T_LAND = 3.4;
  function update() {
    const dt = G.realDt || 1 / 60; if (S.mode === 'off') return;
    S.t += dt; const t = S.t; S.last.copy(S.pos);
    let tgtPitch = 0, tgtYaw = S.yaw, gone = false;
    if (S.mode === 'deploy') {
      // hold while the player drops, then nose down and power away into the sun, climbing
      const k = Math.max(0, t - 1.6);
      S.pos.copy(S.start).add(V(0, Math.sin(t * 1.4) * 0.12 + 2.6 * k * k + 1.2 * k, -7.5 * k * k));
      tgtPitch = k > 0 ? -0.2 * sstep(k, 0, 0.8) + 0.12 * sstep(k, 2.5, 6) : 0;
      if (k > 0.1 && !S.passed) { S.passed = true; G.audio?.play?.('shipPass', { gain: 1.3, pos: S.pos.clone().add(V(0, 0, -20)), ref: 25, roll: 0.3 }); }
      gone = S.pos.distanceTo(G.R.camera.position) > 520;
    } else if (S.mode === 'inbound') {
      const u = Math.min(1, t / T_IN), e = 1 - Math.pow(1 - u, 2.2);   // fast over the dunes, slowing into the approach
      bez(...S.path, e, S.pos);
      _d.subVectors(S.pos, S.last); if (_d.lengthSq() > 1e-6) tgtYaw = Math.atan2(-_d.x, -_d.z);
      tgtYaw = lerpAngle(tgtYaw, S.hoverYaw, sstep(u, 0.72, 1));
      tgtPitch = -0.16 * (1 - sstep(u, 0.55, 0.75)) + 0.24 * sstep(u, 0.7, 0.85) * (1 - sstep(u, 0.9, 1)); // cruise nose-down, flare on arrival
      if (u >= 1) { S.mode = 'land'; S.t = 0; }
    } else if (S.mode === 'land' || S.mode === 'hover') {
      const k = S.mode === 'land' ? ease(Math.min(1, t / T_LAND)) : 1;
      S.pos.copy(S.hover).add(V(0, 9 * (1 - k) + Math.sin(G.time * 1.3) * 0.14, 0)); tgtYaw = S.hoverYaw;
      if (S.mode === 'land' && t >= T_LAND) { S.mode = 'hover'; S.t = 0; S.ready = true; G.events.emit('ship:ready'); }
    } else if (S.mode === 'leave') {
      // lift straight up off the pad, swing the nose west, then go — climbing over the wreck and out over the dunes
      const up = Math.min(t, 2.2), k = Math.max(0, t - 1.6);
      tgtYaw = lerpAngle(S.hoverYaw, S.leaveYaw, sstep(t, 0.6, 2.6));
      const f = V(-Math.sin(S.yaw), 0, -Math.cos(S.yaw));
      S.pos.copy(S.leaveFrom).add(V(0, 2.4 * up + 1.6 * up * up + 3 * k * k * 0.5, 0)); S.fwd = (S.fwd || 0) + dt * (4 * k * k + 6 * k); S.pos.addScaledVector(S.dir || (S.dir = f.clone()), S.fwd);
      if (t < 2.6) S.dir.copy(f);
      tgtPitch = -0.22 * sstep(k, 0, 1.2) + 0.1 * sstep(k, 3, 6);
      if (k > 0.2 && !S.passed) { S.passed = true; G.audio?.play?.('shipPass', { gain: 1.4, pos: S.pos.clone(), ref: 25, roll: 0.3 }); }
      if (t > 3 && S.onGone) { const cb = S.onGone; S.onGone = null; cb(); }
      gone = t > 16;
    }
    // attitude: smooth heading, bank into turns, pitch toward the target
    const dy = wrap(tgtYaw - S.yaw); S.yaw += dy * Math.min(1, dt * 2.2);
    S.roll = lerp(S.roll, THREE.MathUtils.clamp(-dy * 1.1, -0.45, 0.45) + Math.sin(G.time * 0.9) * 0.015, Math.min(1, dt * 2.5));
    S.pitch = lerp(S.pitch, tgtPitch, Math.min(1, dt * 2.5));
    root.position.copy(S.pos); root.rotation.set(S.pitch, S.yaw, S.roll);
    S.vel.subVectors(S.pos, S.last).divideScalar(Math.max(dt, 1e-4));
    if (gone) { stop(); return; }
    root.updateMatrixWorld(); fx(dt);
  }
  function lerpAngle(a, b, k) { return a + wrap(b - a) * k; }
  function stop() { S.mode = 'off'; root.visible = false; beam.visible = false; spot.intensity = 0; under.intensity = 0; S.loop?.stop(2); S.loop = null; }

  function fx(dt) {
    const t = G.time, night = G.env?.S.night ?? 0, alt = S.pos.y;
    // nav lights blink, strobe double-flashes, engines breathe
    navR.material.opacity = navG.material.opacity = 0.85 + 0.15 * Math.sin(t * 3);
    const st = t % 1.4; strobe.material.opacity = st < 0.05 || (st > 0.16 && st < 0.21) ? 1 : 0; beacon.material.opacity = 0.5 + 0.5 * Math.sin(t * 6.3);
    for (const e of engines) { e.material.opacity = 0.75 + 0.25 * Math.sin(t * 37 + e.position.x); e.scale.setScalar(1.7 * (0.9 + 0.1 * Math.sin(t * 23))); }
    under.intensity = 26 * (0.85 + 0.15 * Math.sin(t * 17));
    // searchlight: sweeps ahead on the way in, locks onto the pad for the landing, off once it leaves
    const on = (S.mode === 'inbound' || S.mode === 'land' || S.mode === 'hover') ? sstep(night, 0.2, 0.8) : 0;
    _a.copy(lamp).applyMatrix4(root.matrixWorld); spot.position.copy(_a);
    if (S.mode === 'inbound') { const f = V(-Math.sin(S.yaw), 0, -Math.cos(S.yaw)); _b.copy(S.pos).addScaledVector(f, 26 + Math.sin(t * 0.7) * 8).add(V(Math.cos(t * 0.9) * 6, -S.pos.y, Math.sin(t * 1.1) * 6)); }
    else _b.copy(S.pad).add(V(Math.sin(t * 0.6) * 0.8, 0, Math.cos(t * 0.5) * 0.8));
    spotT.position.lerp(_b, S.mode === 'inbound' ? 1 : Math.min(1, dt * 3));
    spot.intensity = 1600 * on; beamMat.uniforms.uA.value = 0.45 * on;
    _d.subVectors(spotT.position, _a); const len = Math.min(70, _d.length()); _d.normalize();
    beam.visible = on > 0.01; beam.position.copy(_a); beam.quaternion.copy(_q.setFromUnitVectors(V(0, -1, 0), _d)); beam.scale.set(len * Math.tan(0.36), len, len * Math.tan(0.36));
    // rotor wash: sand thrown out in a ring under the engines when it is low
    const wash = 1 - sstep(alt, 6, 20);
    if (wash > 0 && G.fxs) {
      for (let i = 0, m = Math.floor(90 * wash * dt + Math.random()); i < m; i++) {
        const a = Math.random() * 6.283, r = 2 + Math.random() * 6;
        _w.set(S.pos.x + Math.cos(a) * r, 0.2, S.pos.z + Math.sin(a) * r);
        G.fxs.emit(true, { pos: _w.clone(), vel: V(Math.cos(a), 0.12 + Math.random() * 0.2, Math.sin(a)).multiplyScalar(9 + Math.random() * 8), life: 1.2 + Math.random(), size: 0.5, size1: 3.2, col: G.fxs.litColor([0.55, 0.42, 0.3]), alpha: 0.32 * wash, soft: true, drag: 1.6 });
      }
      if (G.player && S.pos.distanceTo(G.player.s.pos) < 14) G.player.addShake(0.012 * wash);
    }
    // engine loop: louder and lower when it works hard
    if (S.loop) S.loop.set(S.pos, 1.6, 0.92 + Math.min(0.2, S.vel.length() * 0.004));
  }
  return { update, deploy, inbound, liftoff, stop, S, root, get ready() { return S.ready; } };
}
