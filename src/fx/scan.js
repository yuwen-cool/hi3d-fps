// Scan pulse (Q): a ring of light runs out from the player across every surface; behind it the world shows its
// wire grid for a moment, and every robot the ring passes is outlined through walls and dust for a few seconds.
// The price: robots within earshot hear it and come to where you stood.
const XRAY_VS = /* glsl */`
#include <common>
#include <skinning_pars_vertex>
varying vec3 vN; varying vec3 vV;
void main(){
  #include <skinbase_vertex>
  #include <beginnormal_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  #include <project_vertex>
  vN = normalize(transformedNormal); vV = -mvPosition.xyz;
}`;
const XRAY_FS = /* glsl */`
uniform float uA, uT; uniform vec3 uCol; uniform sampler2D tDepth; uniform vec2 uRes; varying vec3 vN; varying vec3 vV;
void main(){
  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float rim = pow(f, 2.2);
  float lines = 0.5 + 0.5 * sin(gl_FragCoord.y * 0.9 - uT * 30.0);
  // behind something: solid hot silhouette; in plain view: just a rim so the robot itself still reads
  float occ = step(texture2D(tDepth, gl_FragCoord.xy / uRes).r + 2e-4, gl_FragCoord.z);
  gl_FragColor = vec4(uCol * mix(rim * 3.5, rim * 6.0 + 0.22 + 0.22 * lines, occ) * uA, 1.0);
}`;

export function createScan(G) {
  const THREE = G.THREE, R = G.R;
  const S = { cd: 0, cdMax: 9, t: -1, r: 0, maxR: 70, dur: 1.9, origin: new THREE.Vector3(), heard: 26 };
  const U = R.M.comp.uniforms;
  const xray = new THREE.ShaderMaterial({ vertexShader: XRAY_VS, fragmentShader: XRAY_FS, uniforms: { uA: { value: 0 }, uT: { value: 0 }, uCol: { value: new THREE.Color(1.0, 0.42, 0.1) }, tDepth: { value: null }, uRes: { value: new THREE.Vector2(1, 1) } },
    transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false });
  R.xray = { mat: xray, on: false };
  const meshes = (e) => e.xrMeshes || (e.xrMeshes = (() => { const a = []; e.o.traverse((m) => { if (m.isMesh) a.push(m); }); e.gun?.traverse((m) => { if (m.isMesh) a.push(m); }); return a; })());
  function fire() {
    S.cd = S.cdMax; S.t = 0; S.origin.copy(G.player.s.pos); S.origin.y += 0.2; S.hit = new Set();
    G.player.addShake(0.12); G.audio?.play?.('scan', { gain: 0.9 }); G.events.emit('scan:fire', { pos: S.origin.clone() });
    // everyone in earshot turns toward the pulse
    for (const e of G.enemies?.list || []) {
      if (!e.alive || e.state === 'engage' || e.root.position.distanceTo(S.origin) > S.heard) continue;
      e.lastKnown = S.origin.clone(); e.state = 'investigate'; e.wp = G.enemies.path(e.root.position, e.lastKnown) || []; e.goal = e.lastKnown.clone();
    }
  }
  function update(dt) {
    const live = !G.player.s.dead && !G.cinematic && G.flow?.S.state !== 'title';
    S.cd = Math.max(0, S.cd - dt);
    if (live && (G.input.pressed('scan') || G.auto?.scan) && S.cd <= 0) { if (G.auto) G.auto.scan = false; fire(); }
    let a = 0;
    if (S.t >= 0) {
      S.t += dt; const k = Math.min(1, S.t / S.dur); S.r = S.maxR * (1 - Math.pow(1 - k, 2.4));
      a = S.t < S.dur ? 1 : Math.max(0, 1 - (S.t - S.dur) / 0.8); if (a <= 0) S.t = -1;
      for (const e of G.enemies?.list || []) if (e.alive && !S.hit.has(e) && e.root.position.distanceTo(S.origin) < S.r) { S.hit.add(e); e.scanT = 6; G.events.emit('scan:reveal', { e }); }
      for (const d of G.drones?.list || []) if (d.alive && !S.hit.has(d) && d.root.position.distanceTo(S.origin) < S.r) { S.hit.add(d); d.scanT = 6; }
      const B = G.boss?.S; if (B?.active && !B.dead && !S.hit.has(B) && B.pos.distanceTo(S.origin) < S.r + 6) { S.hit.add(B); B.scanT = 6; }
    }
    U.uScan.value.set(S.origin.x, S.origin.y, S.origin.z, S.r); U.uScanA.value = a;
    // x-ray layer: scanned robots render through everything
    let any = 0;
    for (const e of G.enemies?.list || []) {
      const on = e.alive && e.scanT > 0; if (on) any = Math.max(any, Math.min(1, e.scanT / 1.2));
      if (!!e.xrOn !== on) { e.xrOn = on; for (const m of meshes(e)) { if (on) m.layers.enable(2); else m.layers.disable(2); } }
    }
    xray.uniforms.uA.value = any; xray.uniforms.uT.value = G.time; R.xray.on = any > 0.01;
  }
  return { update, S, fire };
}
