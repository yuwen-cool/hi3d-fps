import * as THREE from 'three';

// The lance shot: a white-hot core and a wider cyan sheath that snap on and bleed out over half a second,
// a corkscrew of ionised sparks around the line, a shock ring at the muzzle, arcs where it went through
// metal, and a molten splash where it stopped. Beams are camera-facing ribbons drawn in world space.
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export function createBeams(G) {
  const R = G.R, scene = R.scene, rnd = Math.random;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    uniforms: { uA: { value: 0 }, uT: { value: 0 }, uW: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float uA, uT, uW;
      float h(float n){ return fract(sin(n) * 43758.5453); }
      void main(){
        float x = abs(vUv.y - 0.5) * 2.0;                                 // 0 centre .. 1 edge
        float core = exp(-x * x * 90.0 / uW), sheath = exp(-x * x * 7.0);
        float along = vUv.x;
        float flick = 0.75 + 0.25 * sin(along * 140.0 - uT * 90.0) * sin(along * 37.0 + uT * 23.0);
        float fadeEnds = smoothstep(0.0, 0.01, along) * smoothstep(1.0, 0.97, along);
        vec3 c = vec3(1.0, 1.0, 1.0) * core * 6.0 + vec3(0.25, 0.7, 1.0) * sheath * 1.6 * flick;
        gl_FragColor = vec4(c * uA * fadeEnds, 1.0);
      }`,
  });
  const beams = [];
  const _c = V(), _side = V(), _d = V(), _m = new THREE.Matrix4();
  function ribbon(a, b, w) {
    const g = new THREE.PlaneGeometry(1, 1, 1, 1); const m = new THREE.Mesh(g, mat.clone()); m.frustumCulled = false; m.renderOrder = 6;
    m.userData = { a: a.clone(), b: b.clone(), w }; scene.add(m); return m;
  }
  function place(m) {
    const { a, b, w } = m.userData; const cam = R.camera.position;
    _d.subVectors(b, a); const L = _d.length(); _d.normalize();
    _c.addVectors(a, b).multiplyScalar(0.5); _side.subVectors(cam, _c).cross(_d).normalize();
    const n = V().crossVectors(_d, _side);
    _m.makeBasis(_d.clone().multiplyScalar(L), _side.clone().multiplyScalar(w), n).setPosition(_c);
    m.matrixAutoUpdate = false; m.matrix.copy(_m); m.matrixWorldNeedsUpdate = true;
  }
  { const w = ribbon(V(0, -100, 0), V(0, -100, 1), 0.1); w.visible = false; } // a hidden one so the loading screen compiles the shader
  G.events.on('lance:fire', (e) => {
    const k = e.k, a = e.muzzle, b = e.end;
    const core = ribbon(a, b, 0.09 + 0.08 * k), halo = ribbon(a, b, 0.5 + 0.4 * k); halo.material.uniforms.uW.value = 6;
    beams.push({ core, halo, t: 0, life: 0.55 + 0.25 * k, k });
    const fx = G.fxs; if (!fx) return;
    const d = b.clone().sub(a), L = d.length(); d.normalize();
    const side = V(0, 1, 0).cross(d).normalize(), up = V().crossVectors(d, side);
    // ionised corkscrew around the line
    for (let s = 0; s < L; s += 0.35) {
      const ang = s * 2.2, r = 0.12 + 0.05 * Math.sin(s * 0.7), p = a.clone().addScaledVector(d, s).addScaledVector(side, Math.cos(ang) * r).addScaledVector(up, Math.sin(ang) * r);
      fx.emit(false, { pos: p, vel: side.clone().multiplyScalar(Math.cos(ang) * 0.6).addScaledVector(up, Math.sin(ang) * 0.6), life: 0.35 + rnd() * 0.35, size: 0.018, size1: 0.004, col: [3, 8, 16], drag: 2 });
      if (rnd() < 0.18) fx.emit(true, { pos: a.clone().addScaledVector(d, s), vel: V((rnd() - 0.5) * 0.4, 0.3, (rnd() - 0.5) * 0.4), life: 1.4 + rnd(), size: 0.12, size1: 0.6, col: fx.litColor([0.5, 0.55, 0.6]), alpha: 0.18, soft: true, drag: 1, rise: 0.2 });
    }
    // through-hits: arcs and a spray of hot metal; the stop point: a molten splash
    for (const p of e.hits) { fx.electric(p); for (let i = 0; i < 10; i++) fx.emit(false, { pos: p, vel: d.clone().multiplyScalar(6 + rnd() * 6).add(V((rnd() - 0.5) * 4, rnd() * 3, (rnd() - 0.5) * 4)), life: 0.3 + rnd() * 0.3, size: 0.012, stretch: 0.08, col: [16, 10, 5], grav: 9.8, drag: 1.5 }); }
    if (e.hitW) { fx.impact(e.hitW, d); fx.impact(e.hitW, d); R.flash(e.hitW.point.clone().addScaledVector(e.hitW.normal, 0.3), 0x9fdcff, 40, 9, 0.15);
      for (let i = 0; i < 18; i++) fx.emit(false, { pos: e.hitW.point, vel: e.hitW.normal.clone().multiplyScalar(3 + rnd() * 5).add(V((rnd() - 0.5) * 5, rnd() * 4, (rnd() - 0.5) * 5)), life: 0.5 + rnd() * 0.6, size: 0.016, stretch: 0.05, col: [18, 9, 3], grav: 9.8, drag: 1 }); }
  });
  function update() {
    const dt = G.realDt || 1 / 60;
    for (let i = beams.length - 1; i >= 0; i--) {
      const B = beams[i]; B.t += dt; const u = B.t / B.life;
      const a = u < 0.04 ? 1.4 : Math.pow(1 - u, 2.2);
      for (const m of [B.core, B.halo]) { m.material.uniforms.uA.value = a * (m === B.halo ? 0.5 : 1); m.material.uniforms.uT.value = G.time; m.userData.w *= m === B.halo ? 1 + dt * 1.6 : 1 - dt * 1.8; place(m); }
      if (u >= 1) { for (const m of [B.core, B.halo]) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); } beams.splice(i, 1); }
    }
  }
  return { update };
}
