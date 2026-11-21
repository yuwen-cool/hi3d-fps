import * as THREE from 'three';
import { TUNE, TIERS, pickTier, params } from '../core/ctx.js';
import { makeSkyMaterial, makeSkyEquirect } from './sky.js';
import * as S from './shaders.js';

// Softer, less aliased directional-shadow PCF: 12 Vogel taps (x4 hardware PCF) instead of 5.
function patchShadowChunk() {
  const k = 'shadowmap_pars_fragment';
  let src = THREE.ShaderChunk[k];
  const re = /shadow = \(\s*texture\( shadowMap, vec3\( shadowCoord\.xy \+ vogelDiskSample\( 0, 5, phi \) \* radius, shadowCoord\.z \) \) \+[\s\S]*?\) \* 0\.2;/;
  if (re.test(src)) {
    src = src.replace(re, `shadow = 0.0;
				for ( int si = 0; si < 12; si ++ ) shadow += texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( si, 12, phi ) * radius, shadowCoord.z ) );
				shadow /= 12.0;
				vec2 edge = smoothstep( vec2( 0.0 ), vec2( 0.02 ), shadowCoord.xy ) * smoothstep( vec2( 0.0 ), vec2( 0.02 ), 1.0 - shadowCoord.xy );
				shadow = mix( 1.0, shadow, edge.x * edge.y );`);
    THREE.ShaderChunk[k] = src;
    return true;
  }
  console.warn('[render] shadow chunk patch skipped (pattern not found)');
  return false;
}

function rt(w, h, o = {}) {
  const t = new THREE.WebGLRenderTarget(w, h, {
    type: o.type ?? THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    depthBuffer: !!o.depth, stencilBuffer: false, samples: o.samples || 0, generateMipmaps: false,
  });
  t.texture.colorSpace = THREE.NoColorSpace;
  if (o.depthTexture) { t.depthTexture = new THREE.DepthTexture(w, h, THREE.UnsignedIntType); t.depthTexture.minFilter = t.depthTexture.magFilter = THREE.NearestFilter; }
  return t;
}

export function createRenderer(G, canvas) {
  if (params.nopatch !== '1') patchShadowChunk();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false, depth: true, stencil: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.autoClear = false;
  renderer.info.autoReset = false;
  renderer.setClearColor(0x000000, 1);
  const gl = renderer.getContext();
  const tier = pickTier(gl);
  G.tier = tier;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(74, 16 / 9, 0.08, 900);
  camera.rotation.order = 'YXZ';
  const viewCam = new THREE.PerspectiveCamera(54, 16 / 9, 0.01, 10);
  viewCam.layers.set(1); viewCam.matrixAutoUpdate = false;
  scene.add(camera);

  // sun: low dusk sun behind the refinery
  const sunDir = new THREE.Vector3(-0.62, 0.14, -0.77).normalize();
  const sunCol = new THREE.Color(1.0, 0.56, 0.24);
  const sun = new THREE.DirectionalLight(sunCol, 11.0);
  sun.position.copy(sunDir).multiplyScalar(120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(tier.shadow, tier.shadow);
  sun.shadow.bias = -0.00012; sun.shadow.normalBias = 0.025; sun.shadow.radius = 2.2;
  scene.add(sun, sun.target);
  // warm bounce from the sunlit sand + dusty sky fill: keeps shadows from going cold-blue
  const hemi = new THREE.HemisphereLight(new THREE.Color(0.46, 0.42, 0.40), new THREE.Color(0.70, 0.46, 0.28), 0.7); scene.add(hemi);
  // lights are layer-filtered like meshes: the view-model pass (layer 1) must see the sun, fill and flashes too
  sun.layers.enable(1); hemi.layers.enable(1);
  const _vmP = new THREE.Vector3(); let vmSun = 1, vmSunT = 1;
  // view-model reflector: a soft camera-space fill (layer 1 only) from behind-left-above, so the gun's
  // machining still reads when the player looks straight into the dusk sun
  const vmFill = new THREE.DirectionalLight(new THREE.Color(1.0, 0.86, 0.72), 1.6); vmFill.layers.set(1); scene.add(vmFill, vmFill.target);
  const _vmFillDir = new THREE.Vector3(-0.55, 0.65, 0.55).normalize();
  G.sun = { light: sun, dir: sunDir, col: sunCol };
  // fit the ortho shadow box around a world AABB
  function fitShadow(box) {
    const c = box.getCenter(new THREE.Vector3());
    const r = box.getSize(new THREE.Vector3()).length() * 0.5 + 2;
    sun.target.position.copy(c); sun.position.copy(c).addScaledVector(sunDir, r * 2);
    const cam = sun.shadow.camera; cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r; cam.near = 1; cam.far = r * 4; cam.updateProjectionMatrix();
    renderer.shadowMap.needsUpdate = true;
  }

  // sky
  const sky = new THREE.Mesh(new THREE.SphereGeometry(800, 48, 24), makeSkyMaterial(sunDir, sunCol, false));
  sky.frustumCulled = false; sky.renderOrder = -10; sky.name = 'sky';
  scene.add(sky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  function rebuildEnv() {
    const eq = makeSkyEquirect(renderer, sunDir, sunCol);
    const rtEnv = pmrem.fromEquirectangular(eq.texture); eq.dispose();
    if (scene.environment) scene.environment.dispose?.();
    scene.environment = rtEnv.texture;
    scene.environmentIntensity = TUNE.envIntensity;
  }
  rebuildEnv();

  // point light pool (fixed count: no shader recompiles)
  const lights = [];
  for (let i = 0; i < 6; i++) { const l = new THREE.PointLight(0xffffff, 0, 12, 2); l.castShadow = false; l.layers.enable(1); scene.add(l); lights.push({ l, ttl: 0, life: 1, i0: 0 }); }
  let nextLight = 0; const _pls = [];
  const volLights = lights.map((s) => s.l); // registry of point lights that also scatter in the volume (pool + fires + lamps)
  function flash(pos, color, intensity, dist, ttl) {
    const s = lights[nextLight]; nextLight = (nextLight + 1) % lights.length;
    s.l.position.copy(pos); s.l.color.set(color); s.l.distance = dist; s.i0 = intensity; s.l.intensity = intensity; s.ttl = ttl; s.life = ttl;
  }

  // ---------- post chain ----------
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(tri); quad.frustumCulled = false;
  const postScene = new THREE.Scene(); postScene.add(quad);
  const U = () => ({ uRes: { value: new THREE.Vector2() }, uNear: { value: camera.near }, uFar: { value: camera.far } });
  function pass(fs, extra = {}) {
    return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: S.FS_TRI, fragmentShader: fs, uniforms: { ...U(), ...extra },
      depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false });
  }
  const M = {
    depthHalf: pass(S.DEPTH_HALF, { tDepth: { value: null }, uSrcRes: { value: new THREE.Vector2() } }),
    ao: pass(S.AO, { tZ: { value: null }, uHalfRes: { value: new THREE.Vector2() }, uProj: { value: new THREE.Vector4() }, uRadius: { value: TUNE.aoRadius }, uIntensity: { value: TUNE.aoIntensity }, uTaps: { value: tier.aoTaps } }),
    blur: pass(S.BILATERAL, { tSrc: { value: null }, tZ: { value: null }, uDir: { value: new THREE.Vector2() }, uTol: { value: 0.04 } }),
    vol: pass(S.VOLUME, {
      tZ: { value: null }, tShadow: { value: null }, uInvView: { value: new THREE.Matrix4() }, uShadowMat: { value: new THREE.Matrix4() }, uProj: { value: new THREE.Vector4() },
      uCamPos: { value: new THREE.Vector3() }, uSunDir: { value: sunDir }, uSunCol: { value: sunCol }, uFogCol: { value: new THREE.Color(0.50, 0.42, 0.36) }, uHorizon: { value: new THREE.Color(1.0, 0.52, 0.24) },
      uSigma: { value: TUNE.volSigma }, uMaxD: { value: TUNE.volMaxD }, uAmbient: { value: TUNE.volAmbient }, uFarHaze: { value: TUNE.volFarHaze }, uTime: { value: 0 }, uSunScale: { value: TUNE.volSunScale },
      uHeightFall: { value: TUNE.volHeightFall }, uBase: { value: TUNE.volBase }, uSteps: { value: tier.vol }, uPL: { value: [0, 1, 2, 3, 4, 5].map(() => new THREE.Vector4()) }, uPLc: { value: [0, 1, 2, 3, 4, 5].map(() => new THREE.Vector3()) }, uPLn: { value: 0 }, uStorm: { value: new THREE.Vector4(0, 0, 1e5, 0) }, uWind: { value: new THREE.Vector2(0.62, 0.77) },
      uInterior: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) }, uInteriorSize: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) }, uInteriorCount: { value: 0 }, uInteriorDust: { value: TUNE.volInteriorDust },
    }),
    comp: pass(S.COMPOSITE, { tColor: { value: null }, tDepth: { value: null }, tZ: { value: null }, tAO: { value: null }, tVol: { value: null }, uHalfRes: { value: new THREE.Vector2() }, uAOStrength: { value: TUNE.aoStrength }, uExposureHint: { value: 1 }, uUseAO: { value: 1 }, uUseVol: { value: 1 }, uUseSSR: { value: 1 }, uProjV: { value: new THREE.Vector4() }, uCamMat: { value: new THREE.Matrix4() }, uViewUp: { value: new THREE.Vector3() }, uPads: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(1e5, 1e5, 1e5, 1e5)) }, uCorr: { value: new THREE.Vector4(1e5, 1e5, 1e5, 1e5) }, uTime: { value: 0 }, uScan: { value: new THREE.Vector4(0, 0, 0, 0) }, uScanA: { value: 0 } }),
    down: pass(S.BLOOM_DOWN, { tSrc: { value: null }, uSrcPx: { value: new THREE.Vector2() }, uFirst: { value: 0 } }),
    up: pass(S.BLOOM_UP, { tSrc: { value: null }, tHigh: { value: null }, uSrcPx: { value: new THREE.Vector2() }, uMix: { value: TUNE.bloomMix } }),
    streak: pass(S.STREAK, { tSrc: { value: null }, uStep: { value: new THREE.Vector2() }, uThresh: { value: TUNE.streakThresh }, uFirst: { value: 1 } }),
    exp: pass(S.EXPOSURE, { tSrc: { value: null }, tPrev: { value: null }, uDt: { value: 0.016 }, uKey: { value: TUNE.key }, uMinE: { value: TUNE.minExp }, uMaxE: { value: TUNE.maxExp }, uTau: { value: TUNE.adaptTau }, uFirst: { value: 1 } }),
    grade: pass(S.GRADE, {
      tHdr: { value: null }, tBloom: { value: null }, tStreak: { value: null }, tExp: { value: null },
      uBloom: { value: TUNE.bloom }, uStreak: { value: TUNE.streak }, uManualExp: { value: TUNE.manualExp }, uAgx: { value: TUNE.agx }, uVignette: { value: TUNE.vignette }, uSat: { value: TUNE.sat },
      uLookPow: { value: TUNE.lookPow }, uLookSat: { value: TUNE.lookSat }, uCA: { value: TUNE.ca }, uDamage: { value: 0 }, uLow: { value: 0 }, uAds: { value: 0 }, uFade: { value: 0 }, uFlash: { value: 0 }, uTime: { value: 0 }, uSpeed: { value: 0 },
      uSplitLo: { value: new THREE.Vector3(...TUNE.splitLo) }, uSplitHi: { value: new THREE.Vector3(...TUNE.splitHi) }, uLift: { value: new THREE.Vector3(...TUNE.lift) },
    }),
    final: pass(S.FINAL, { tLdr: { value: null }, uSharpen: { value: TUNE.sharpen }, uGrain: { value: TUNE.grain }, uTime: { value: 0 } }),
    copy: pass(S.COPY, { tSrc: { value: null } }),
  };
  function run(mat, target) {
    quad.material = mat;
    mat.uniforms.uRes.value.set(target ? target.width : W, target ? target.height : H);
    renderer.setRenderTarget(target || null);
    renderer.render(postScene, postCam);
  }

  let W = 0, H = 0, T = null, dynScale = 1;
  const post = { ao: tier.ao === 1 && params.ao !== '0', vol: params.vol !== '0', bloom: params.bloom !== '0', on: params.post !== '0' };
  function alloc(w, h) {
    if (T) Object.values(T).flat().forEach((t) => t.dispose());
    const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
    T = {
      scene: rt(w, h, { depth: true, depthTexture: true, samples: tier.msaa }),
      comp: rt(w, h),
      z: rt(hw, hh), aoA: rt(hw, hh, { type: THREE.UnsignedByteType }), aoB: rt(hw, hh, { type: THREE.UnsignedByteType }),
      volA: rt(hw, hh), volB: rt(hw, hh),
      bloom: [], streakA: null, streakB: null,
      expA: rt(1, 1), expB: rt(1, 1),
      ldr: rt(w, h, { type: THREE.UnsignedByteType }),
    };
    let bw = hw, bh = hh;
    T.up = [];
    for (let i = 0; i < 6; i++) { T.bloom.push(rt(Math.max(1, bw), Math.max(1, bh))); T.up.push(rt(Math.max(1, bw), Math.max(1, bh))); bw >>= 1; bh >>= 1; }
    const m2 = T.bloom[1]; T.streakA = rt(m2.width, m2.height); T.streakB = rt(m2.width, m2.height);
    M.exp.uniforms.uFirst.value = 1;
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = canvas.clientWidth || window.innerWidth, ch = canvas.clientHeight || window.innerHeight;
    renderer.setPixelRatio(1);
    renderer.setSize(Math.round(cw * dpr), Math.round(ch * dpr), false);
    let w = cw * dpr * tier.scale * dynScale, h = ch * dpr * tier.scale * dynScale;
    const px = w * h; if (px > tier.budget) { const k = Math.sqrt(tier.budget / px); w *= k; h *= k; }
    w = Math.max(64, Math.round(w)); h = Math.max(64, Math.round(h));
    W = Math.round(cw * dpr); H = Math.round(ch * dpr);
    camera.aspect = viewCam.aspect = cw / ch; camera.updateProjectionMatrix(); viewCam.updateProjectionMatrix();
    if (!T || T.scene.width !== w || T.scene.height !== h) alloc(w, h);
  }
  window.addEventListener('resize', resize);

  // dynamic resolution
  const dyn = { acc: 0, n: 0, wait: 3.5, upDelay: 2, last: 0, on: params.dynres !== '0' && !params.shot };
  function dynres(dt) {
    if (!dyn.on) return;
    dyn.wait -= dt; dyn.acc += dt; dyn.n++;
    if (dyn.n < 45 && dyn.acc < 0.9) return;
    const avg = dyn.acc / dyn.n * 1000; dyn.acc = 0; dyn.n = 0;
    if (dyn.wait > 0) return;
    if (avg > 21.5 && dynScale > 0.6) { dynScale = Math.max(0.6, dynScale - (avg > 45 ? 1 : avg > 30 ? 0.2 : 0.1)); dyn.upDelay = Math.min(60, dyn.upDelay * 2); dyn.wait = 1; resize(); }
    else if (avg < 17.4 && dynScale < 1) { dynScale = Math.min(1, dynScale + 0.1); dyn.wait = dyn.upDelay; resize(); }
  }

  const interiors = [];
  function setInteriors(list) {
    interiors.length = 0; list.slice(0, 4).forEach((b) => interiors.push(b));
    M.vol.uniforms.uInteriorCount.value = interiors.length;
    interiors.forEach((b, i) => { M.vol.uniforms.uInterior.value[i].set(b.c.x, b.c.y, b.c.z, 0); M.vol.uniforms.uInteriorSize.value[i].set(b.h.x, b.h.y, b.h.z, 0); });
  }

  let frameNo = 0; let time = 0;
  const projV = new THREE.Vector4();
  const fx = { damage: 0, low: 0, ads: 0, fade: 0, flash: 0, speed: 0 };

  function frame(dt) {
    time += dt; frameNo++;
    dynres(dt);
    renderer.info.reset();
    for (const s of lights) { if (s.ttl > 0) { s.ttl -= dt; s.l.intensity = s.ttl > 0 ? s.i0 * (s.ttl / s.life) : 0; } }
    sky.material.uniforms.uTime.value = time; sky.position.copy(camera.position);
    camera.updateMatrixWorld(true);
    viewCam.matrixWorld.copy(camera.matrixWorld); viewCam.matrixWorldInverse.copy(camera.matrixWorldInverse);
    if (tier.name === 'ultra' || (frameNo & 1) === 0 || !sun.shadow.map) renderer.shadowMap.needsUpdate = true;

    // post passes leave depthMask=false in three's state cache, and renderer.clear() does not
    // re-enable it: without this the shadow map and scene depth never get cleared.
    renderer.state.buffers.depth.setMask(true);
    renderer.setRenderTarget(T.scene);
    renderer.clear(true, true, false);
    camera.layers.set(0);
    renderer.render(scene, camera);
    // view model: own camera, compressed depth range so it never clips into walls
    if (G.viewModelVisible !== false) {
      // the view model takes no shadow-map lookups (self-shadow acne, hard world shadows across the hands);
      // instead one ray toward the sun tells whether the player stands in shade and the sun eases down
      if (G.phys && (frameNo & 3) === 0) { _vmP.copy(camera.position).y -= 0.15; vmSunT = G.phys.raycast(_vmP, sunDir, 120) ? 0.22 : 1; }
      vmSun += (vmSunT - vmSun) * Math.min(1, dt * 6);
      vmFill.intensity = 1.6 * (0.35 + 0.65 * vmSun);
      vmFill.target.position.copy(camera.position); vmFill.position.copy(_vmFillDir).applyQuaternion(camera.quaternion).add(camera.position);
      vmFill.target.updateMatrixWorld(); vmFill.updateMatrixWorld();
      const prevSun = sun.intensity; sun.intensity = prevSun * vmSun;
      const prevEnv = scene.environmentIntensity; scene.environmentIntensity = prevEnv * TUNE.viewFill;
      const bg = scene.background; scene.background = null;
      gl.depthRange(0, 0.05);
      try { renderer.render(scene, viewCam); } finally { gl.depthRange(0, 1); scene.environmentIntensity = prevEnv; scene.background = bg; sun.intensity = prevSun; }
    }
    G.stats.calls = renderer.info.render.calls; G.stats.tris = renderer.info.render.triangles;

    if (!post.on) { // forward fallback
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      M.copy.uniforms.tSrc.value = T.scene.texture; run(M.copy, null); return;
    }
    const hw = T.z.width, hh = T.z.height;
    projV.set(1 / camera.projectionMatrix.elements[0], 1 / camera.projectionMatrix.elements[5], 0, 0);
    // depth
    M.depthHalf.uniforms.tDepth.value = T.scene.depthTexture; M.depthHalf.uniforms.uSrcRes.value.set(T.scene.width, T.scene.height);
    M.depthHalf.uniforms.uNear.value = camera.near; M.depthHalf.uniforms.uFar.value = camera.far;
    run(M.depthHalf, T.z);
    // AO
    if (post.ao) {
      M.ao.uniforms.tZ.value = T.z.texture; M.ao.uniforms.uHalfRes.value.set(hw, hh); M.ao.uniforms.uProj.value.copy(projV);
      run(M.ao, T.aoA);
      M.blur.uniforms.tZ.value = T.z.texture; M.blur.uniforms.uTol.value = 0.04;
      M.blur.uniforms.tSrc.value = T.aoA.texture; M.blur.uniforms.uDir.value.set(1 / hw, 0); run(M.blur, T.aoB);
      M.blur.uniforms.tSrc.value = T.aoB.texture; M.blur.uniforms.uDir.value.set(0, 1 / hh); run(M.blur, T.aoA);
    }
    // volumetric
    if (post.vol && sun.shadow.map) {
      const u = M.vol.uniforms;
      u.tZ.value = T.z.texture; u.tShadow.value = sun.shadow.map.depthTexture; u.uInvView.value.copy(camera.matrixWorld);
      u.uShadowMat.value.copy(sun.shadow.matrix); u.uProj.value.copy(projV); u.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
      u.uTime.value = time; u.uNear.value = camera.near; u.uFar.value = camera.far;
      // the six strongest local lights near the camera also scatter in the volume
      _pls.length = 0; for (const o of volLights) if (o.intensity > 0.05 && o.visible) _pls.push(o);
      _pls.sort((a, b) => b.intensity / (1 + a.position.distanceToSquared(camera.position) * 0.01) - a.intensity / (1 + b.position.distanceToSquared(camera.position) * 0.01) || 0);
      u.uPLn.value = Math.min(6, _pls.length);
      for (let i = 0; i < u.uPLn.value; i++) { const l = _pls[i]; u.uPL.value[i].set(l.position.x, l.position.y, l.position.z, l.distance || 12); u.uPLc.value[i].set(l.color.r, l.color.g, l.color.b).multiplyScalar(l.intensity * TUNE.volLocal); }
      run(M.vol, T.volA);
      M.blur.uniforms.uTol.value = 0.30;
      M.blur.uniforms.tSrc.value = T.volA.texture; M.blur.uniforms.uDir.value.set(1 / hw, 0); run(M.blur, T.volB);
      M.blur.uniforms.tSrc.value = T.volB.texture; M.blur.uniforms.uDir.value.set(0, 1 / hh); run(M.blur, T.volA);
    }
    // composite
    const c = M.comp.uniforms;
    c.tColor.value = T.scene.texture; c.tDepth.value = T.scene.depthTexture; c.tZ.value = T.z.texture; c.tAO.value = T.aoA.texture; c.tVol.value = T.volA.texture;
    c.uHalfRes.value.set(hw, hh); c.uUseAO.value = post.ao ? 1 : 0; c.uUseVol.value = post.vol ? 1 : 0; c.uNear.value = camera.near; c.uFar.value = camera.far;
    c.uProjV.value.copy(projV); c.uCamMat.value.copy(camera.matrixWorld); c.uViewUp.value.set(0, 1, 0).transformDirection(camera.matrixWorldInverse); c.uTime.value = time;
    run(M.comp, T.comp);
    // scanned robots: additive fresnel silhouettes on top of everything (after the dust, so the storm cannot hide them)
    if (R_.xray?.on) {
      R_.xray.mat.uniforms.tDepth.value = T.scene.depthTexture; R_.xray.mat.uniforms.uRes.value.set(T.comp.width, T.comp.height);
      renderer.setRenderTarget(T.comp); const bg = scene.background; scene.background = null; scene.overrideMaterial = R_.xray.mat; camera.layers.set(2);
      try { renderer.render(scene, camera); } finally { scene.overrideMaterial = null; scene.background = bg; camera.layers.set(0); }
    }
    // bloom
    let src = T.comp;
    for (let i = 0; i < T.bloom.length; i++) {
      M.down.uniforms.tSrc.value = src.texture; M.down.uniforms.uSrcPx.value.set(1 / src.width, 1 / src.height); M.down.uniforms.uFirst.value = i === 0 ? 1 : 0;
      run(M.down, T.bloom[i]); src = T.bloom[i];
    }
    // exposure (from the smallest mip, before upsampling overwrites it)
    M.exp.uniforms.tSrc.value = T.bloom[T.bloom.length - 2].texture; M.exp.uniforms.tPrev.value = T.expA.texture; M.exp.uniforms.uDt.value = Math.min(dt, 0.1);
    run(M.exp, T.expB); M.exp.uniforms.uFirst.value = 0; [T.expA, T.expB] = [T.expB, T.expA];
    // streak from mip1
    M.streak.uniforms.tSrc.value = T.bloom[1].texture; M.streak.uniforms.uFirst.value = 1; M.streak.uniforms.uStep.value.set(1.5 / T.bloom[1].width, 0); run(M.streak, T.streakA);
    M.streak.uniforms.tSrc.value = T.streakA.texture; M.streak.uniforms.uFirst.value = 0; M.streak.uniforms.uStep.value.set(5 / T.bloom[1].width, 0); run(M.streak, T.streakB);
    let upSrc = T.bloom[T.bloom.length - 1];
    for (let i = T.bloom.length - 1; i > 0; i--) {
      M.up.uniforms.tSrc.value = upSrc.texture; M.up.uniforms.tHigh.value = T.bloom[i - 1].texture; M.up.uniforms.uSrcPx.value.set(1 / upSrc.width, 1 / upSrc.height);
      run(M.up, T.up[i - 1]); upSrc = T.up[i - 1];
    }
    // grade
    const g = M.grade.uniforms;
    g.tHdr.value = T.comp.texture; g.tBloom.value = T.up[0].texture; g.tStreak.value = T.streakB.texture; g.tExp.value = T.expA.texture;
    g.uBloom.value = post.bloom ? TUNE.bloom : 0; g.uTime.value = time; g.uManualExp.value = TUNE.manualExp * (params.exposure ? +params.exposure : 1);
    g.uDamage.value = fx.damage; g.uLow.value = fx.low; g.uAds.value = fx.ads; g.uFade.value = fx.fade; g.uFlash.value = fx.flash; g.uSpeed.value = fx.speed;
    run(M.grade, T.ldr);
    M.final.uniforms.tLdr.value = T.ldr.texture; M.final.uniforms.uTime.value = time;
    renderer.setViewport(0, 0, W, H);
    run(M.final, null);
  }

  G.stats = { calls: 0, tris: 0 };
  // wet zones are set by the level once it exists (pads + interior slab)
  const setWet = (pads, corr) => { pads.forEach((p, i) => M.comp.uniforms.uPads.value[i].copy(p)); M.comp.uniforms.uCorr.value.copy(corr); };
  const R_ = {
    setWet, volLights, hemi,
    renderer, scene, camera, viewCam, sun, sky, pmrem, flash, frame, resize, fitShadow, rebuildEnv, setInteriors, fx, post, tier, M, gl,
    get res() { return T ? [T.scene.width, T.scene.height] : [0, 0]; }, get scale() { return dynScale; },
    readExposure() { const b = new Uint16Array(4); renderer.readRenderTargetPixels(T.expA, 0, 0, 1, 1, b); return THREE.DataUtils.fromHalfFloat(b[0]); },
  };
  return R_;
}
