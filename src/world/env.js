import * as THREE from 'three';
import { TUNE } from '../core/ctx.js';

// Weather & time of day, driven by three numbers the match flow animates:
//   front  — where the sandstorm front is, in metres along the sun direction (it rolls in from behind the sun)
//   storm  — how thick the storm is once you're inside it (0..1)
//   night  — 0 = dusk, 1 = the sun is gone and the burning refinery is the only light
// From those it sets sun, sky, ambient, environment, volumetric density/colour, exposure, and owns the
// far sand wall, wind-blown sand, and lightning.
const lerp = THREE.MathUtils.lerp, sstep = THREE.MathUtils.smoothstep;

export function createEnv(G) {
  const R = G.R, rnd = G.rng, sun = R.sun, hemi = R.hemi, sky = R.sky.material.uniforms, vol = R.M.vol.uniforms, ex = R.M.exp.uniforms;
  const dir = new THREE.Vector2(G.sun.dir.x, G.sun.dir.z).normalize();        // toward the storm (the sun side)
  const base = {
    sun: sun.intensity, hemi: hemi.intensity, hemiSky: hemi.color.clone(), hemiGnd: hemi.groundColor.clone(),
    zen: sky.uZenith.value.clone(), hor: sky.uHorizon.value.clone(), away: sky.uAway.value.clone(), gnd: sky.uGround.value.clone(), disk: sky.uDisk.value,
    sigma: vol.uSigma.value, fog: vol.uFogCol.value.clone(), sunScale: vol.uSunScale.value, amb: vol.uAmbient.value, vhor: vol.uHorizon.value.clone(),
    key: ex.uKey.value, maxE: ex.uMaxE.value, sunCol: sun.color.clone(),
  };
  const MOON = new THREE.Color(0.5, 0.64, 1.0);
  const STORM = { zen: new THREE.Color(0.10, 0.065, 0.04), hor: new THREE.Color(0.55, 0.28, 0.12), away: new THREE.Color(0.24, 0.15, 0.09), fog: new THREE.Color(0.62, 0.40, 0.22), hemiSky: new THREE.Color(0.45, 0.30, 0.18) };
  const NIGHT = { zen: new THREE.Color(0.02, 0.03, 0.07), hor: new THREE.Color(0.22, 0.1, 0.06), away: new THREE.Color(0.04, 0.05, 0.09), fog: new THREE.Color(0.17, 0.12, 0.1), hemiSky: new THREE.Color(0.22, 0.27, 0.42) };
  const skySun = sky.uSunCol.value.clone(); sky.uSunCol.value = skySun; const sunCol0 = skySun.clone();
  const S = { front: 260, storm: 0, night: 0, flash: 0, boltT: 4, inside: 0 };

  // far sand wall: a boiling, backlit curtain standing on the storm front until the volume takes over
  const wallMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
    uniforms: { uT: { value: 0 }, uA: { value: 0 }, uSun: { value: G.sun.col }, uFlash: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`varying vec2 vUv; uniform float uT, uA, uFlash; uniform vec3 uSun;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++){ s += a * n(p); p = p * 2.07 + 13.7; a *= 0.5; } return s; }
      void main(){
        vec2 p = vec2(vUv.x * 9.0, vUv.y * 2.4);
        float boil = fbm(p + vec2(uT * 0.02, -uT * 0.06)) * 0.65 + fbm(p * 2.6 - vec2(uT * 0.05, uT * 0.11)) * 0.35;
        float top = 0.42 + 0.3 * fbm(vec2(vUv.x * 4.0 + uT * 0.01, uT * 0.02));      // crest 90-160 m up: a skyline, not the whole sky
        float a = 1.0 - smoothstep(top - 0.18, top + 0.02, vUv.y + (boil - 0.5) * 0.22);
        float rim = smoothstep(top - 0.25, top, vUv.y + (boil - 0.5) * 0.2);     // thin, sunlit crest
        float b2 = smoothstep(0.3, 0.75, boil); vec3 c = mix(vec3(0.07, 0.035, 0.016), vec3(0.42, 0.22, 0.1), b2) * (0.45 + 0.9 * vUv.y);
        c += uSun * rim * (0.8 + 2.8 * b2) * 1.4;                                       // the crest catches the sun, the face is in its own shadow
        c += vec3(0.7, 0.8, 1.0) * uFlash * (0.5 + boil);
        gl_FragColor = vec4(c, a * uA * (0.82 + 0.18 * boil));
      }` });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(1800, 220, 1, 1), wallMat); wall.frustumCulled = false; wall.renderOrder = -5; R.scene.add(wall);

  const _c = new THREE.Vector3(), _w = new THREE.Vector3(dir.x, 0, dir.y), _wind = new THREE.Vector3(-dir.x, 0, -dir.y);
  const clears = [null, null, null, null];
  const addClear = (a, b, r, hold) => { let i = clears.findIndex((c) => !c); if (i < 0) i = clears.reduce((m, c, j) => (c.t > clears[m].t ? j : m), 0); clears[i] = { p: a, q: b, r, t: 0, hold }; };
  G.events.on('explosion', (e) => { if (!e.pos) return; const p = e.pos.clone().setY(Math.max(1.5, e.pos.y)); addClear(p, p.clone(), 5 + 4 * (e.size || 1), 1.6); });
  G.events.on('storm:tunnel', (e) => addClear(e.a.clone(), e.b.clone(), e.r || 3, 1.6)); // a rail shot burns a tunnel through the sand
  function update(dt) {
    const cam = R.camera.position, t = G.time;
    // inside-ness at the camera (front coordinate along the storm direction)
    const u = cam.x * dir.x + cam.z * dir.y;
    S.inside = sstep(u - S.front, -12, 12) * S.storm;
    const n = S.night, k = S.inside;
    // the wall stands between the yard and the low sun: as it closes in, its shadow takes the light before the sand arrives
    const fd0 = S.front - u, shade = S.storm > 0 ? sstep(fd0, 170, 55) * (1 - n) : 0; S.shade = shade;
    // sun: swallowed by the storm, then gone at night
    sun.intensity = base.sun * (1 - 0.93 * k) * (1 - n) * (1 - 0.82 * shade) + base.sun * 0.2 * n * (1 - k);
    sun.color.copy(base.sunCol).lerp(MOON, n);
    hemi.intensity = base.hemi * (1 - 0.35 * k) * lerp(1, 1.25, n) + S.flash * 0.9;
    hemi.color.copy(base.hemiSky).lerp(STORM.hemiSky, k).lerp(NIGHT.hemiSky, n);
    // sky dome
    sky.uZenith.value.copy(base.zen).lerp(STORM.zen, k).lerp(NIGHT.zen, n).multiplyScalar(1 + S.flash * 3);
    sky.uHorizon.value.copy(base.hor).lerp(STORM.hor, k).lerp(NIGHT.hor, n).multiplyScalar(1 + S.flash * 2);
    sky.uAway.value.copy(base.away).lerp(STORM.away, k).lerp(NIGHT.away, n).multiplyScalar(1 + S.flash * 3);
    sky.uDisk.value = base.disk * (1 - k) * (1 - n) * (1 - shade);
    skySun.copy(sunCol0).multiplyScalar((1 - 0.8 * k) * Math.pow(1 - n, 3));
    R.scene.environmentIntensity = TUNE.envIntensity * (1 - 0.5 * k) * lerp(1, 0.22, n) + S.flash * 0.5;
    // volume: denser sand inside the storm, colour shifts brown, ambient scatter carries the storm's own glow
    vol.uStorm.value.set(dir.x, dir.y, S.front, 24 * S.storm);
    R.fx.storm = k;
    // blasts clear the air: a sphere of clean air that the wind fills back in
    for (let i = 0; i < 4; i++) { const c = clears[i], U = vol.uClear.value[i];
      if (!c) { U.w = 0; continue; } c.t += dt; c.p.addScaledVector(_wind, dt * 1.2); c.q.addScaledVector(_wind, dt * 1.2);
      const r = c.r * Math.min(1, c.t / 0.22) * (c.t < c.hold ? 1 : Math.max(0, 1 - (c.t - c.hold) / 4.5)); U.set(c.p.x, c.p.y, c.p.z, r); vol.uClearB.value[i].copy(c.q); if (r <= 0 && c.t > c.hold) clears[i] = null; }
    vol.uFogCol.value.copy(base.fog).lerp(STORM.fog, Math.max(k, 0.4 * S.storm)).lerp(NIGHT.fog, n);
    vol.uSunScale.value = base.sunScale * (1 - 0.75 * k) * (1 - n) * (1 - 0.7 * shade) + base.sunScale * 0.25 * n;
    vol.uAmbient.value = base.amb * (1 + 3.5 * k) * lerp(1, 0.35, n) + S.flash * 0.25;
    vol.uHorizon.value.copy(base.vhor).lerp(STORM.hor, k).lerp(NIGHT.hor, n);
    ex.uKey.value = base.key * lerp(1, 0.9, n) * (1 - 0.1 * k);
    ex.uMaxE.value = lerp(lerp(base.maxE, 2.0, k), 3.2, n);
    // far wall: stands on the front while it is far, hands over to the volume as it gets close
    const fd = S.front - u;
    wallMat.uniforms.uA.value = S.storm > 0 ? sstep(fd, 12, 55) * (1 - n) : 0;
    wallMat.uniforms.uT.value = t; wallMat.uniforms.uFlash.value = S.flash;
    _c.set(dir.x * S.front, 105, dir.y * S.front); wall.position.copy(_c); wall.lookAt(0, 105, 0);
    wall.visible = wallMat.uniforms.uA.value > 0.002;
    // wind-blown sand around the camera
    if (k > 0.02 && G.fxs) {
      for (let i = 0, m = Math.floor(260 * k * dt + rnd()); i < m; i++) {
        const p = new THREE.Vector3(cam.x + (rnd() - 0.5) * 22, 0.1 + rnd() * rnd() * 5, cam.z + (rnd() - 0.5) * 22).addScaledVector(_w, 6);
        G.fxs.emit(true, { pos: p, vel: _wind.clone().multiplyScalar(14 + rnd() * 8).add(new THREE.Vector3((rnd() - 0.5) * 2, (rnd() - 0.4) * 1.5, (rnd() - 0.5) * 2)), life: 0.7 + rnd() * 0.6, size: 0.012, stretch: 0.5, col: G.fxs.litColor([0.85, 0.6, 0.38], 1), alpha: 0.55, drag: 0.2 });
      }
      for (let i = 0, m = Math.floor(14 * k * dt + rnd()); i < m; i++) {
        const p = new THREE.Vector3(cam.x + (rnd() - 0.5) * 30, 0.3 + rnd() * 2, cam.z + (rnd() - 0.5) * 30).addScaledVector(_w, 10);
        G.fxs.emit(true, { pos: p, vel: _wind.clone().multiplyScalar(9 + rnd() * 5), life: 2.5 + rnd() * 1.5, size: 1.2, size1: 4, col: G.fxs.litColor([0.55, 0.38, 0.22]), alpha: 0.16, soft: true, fadeIn: 0.3, drag: 0.1, spin: 0.3 });
      }
    }
    // lightning inside the storm cell (also once the wall is close)
    S.flash = Math.max(0, S.flash - dt * 9);
    const active = S.storm > 0.3 && (k > 0.3 || (fd > 0 && fd < 140)) && n < 0.9;
    if (active) {
      S.boltT -= dt;
      if (S.boltT <= 0) {
        S.boltT = 3 + rnd() * 5;
        const a = Math.atan2(dir.y, dir.x) + (rnd() - 0.5) * 1.6, r = k > 0.3 ? 30 + rnd() * 50 : Math.max(20, fd) + 20;
        const p = new THREE.Vector3(cam.x + Math.cos(a) * r, 25 + rnd() * 30, cam.z + Math.sin(a) * r);
        strike(p);
      }
    }
  }
  // visible bolt: a jagged random walk from the cloud base to the ground, with a couple of side branches
  function bolt(a, b, w, depth = 0) {
    const segs = 14, pts = [a.clone()];
    for (let i = 1; i < segs; i++) { const t = i / segs; pts.push(a.clone().lerp(b, t).add(new THREE.Vector3((rnd() - 0.5) * 6, (rnd() - 0.5) * 2, (rnd() - 0.5) * 6).multiplyScalar(1 - t * 0.5))); }
    pts.push(b.clone());
    for (let i = 0; i < pts.length - 1; i++) {
      const d = pts[i + 1].clone().sub(pts[i]), L = d.length(); d.normalize();
      G.fxs?.emit(false, { pos: pts[i].clone().addScaledVector(d, L / 2), vel: d.multiplyScalar(10.01), life: 0.16, size: w, stretch: L / 2, col: [30, 36, 55], drag: 0 });
      if (depth < 1 && rnd() < 0.18) { const e = pts[i].clone().add(new THREE.Vector3((rnd() - 0.5) * 18, -6 - rnd() * 10, (rnd() - 0.5) * 18)); bolt(pts[i], e, w * 0.5, depth + 1); }
    }
  }
  function strike(p) {
    const d = p.distanceTo(R.camera.position);
    bolt(p, new THREE.Vector3(p.x + (rnd() - 0.5) * 10, 0, p.z + (rnd() - 0.5) * 10), 0.35);
    R.flash(p, 0xd8e6ff, 3e4, 200, 0.12); S.flash = 1;
    setTimeout(() => { R.flash(p, 0xd8e6ff, 2e4, 200, 0.08); S.flash = Math.max(S.flash, 0.7); }, 90 + rnd() * 90);
    G.events.emit('thunder', { pos: p.clone(), delay: d / 340 });
  }
  return { update, S, strike, wall };
}
