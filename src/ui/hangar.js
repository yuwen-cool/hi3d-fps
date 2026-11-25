// The Hi3D hangar (title menu): every model in the game, each shown the way it was made — the single concept image
// Hi3D started from, then the generated mesh printing itself up as a wireframe, then the finished, textured model
// on a turntable. Reuses the main renderer (paused while open) so GPU-compressed ExternalTextures stay on one context.
import * as THREE from 'three';
import { instance, MODELS } from '../world/assets.js';

const LIST = [ // model, concept image, name, what it is
  ['robot', 'enemy', 'COMBAT ROBOT', 'enemy · rigged and animated'], ['colossus_hull', 'colossus_hull', 'COLOSSUS — HULL', 'boss · 1 of 4 parts'],
  ['colossus_head', 'colossus_head', 'COLOSSUS — SENSOR HEAD', 'boss · 1 of 4 parts'], ['colossus_leg_upper', 'colossus_leg_upper', 'COLOSSUS — UPPER LEG', 'boss · 1 of 4 parts'],
  ['colossus_leg_lower', 'colossus_leg_lower', 'COLOSSUS — LOWER LEG', 'boss · 1 of 4 parts'], ['drone', 'drone', 'SEEKER DRONE', 'enemy'], ['riot_shield', 'riot_shield', 'RIOT SHIELD', 'enemy gear'],
  ['rifle2', 'rifle2', 'KR-9 CARBINE', 'weapon · first person'], ['lance', 'lance', 'ARC-7 LANCE', 'weapon · first person'], ['dropship', 'dropship', 'DROPSHIP', 'vehicle'],
  ['drop_pod', 'drop_pod', 'DROP POD', 'set piece'], ['tank', 'tank', 'STORAGE TANK', 'explosive · prop'], ['tower', 'tower', 'DISTILLATION COLUMN', 'set piece'],
  ['horton_sphere', 'horton_sphere', 'LPG SPHERE', 'explosive · prop'], ['column_cluster', 'column_cluster', 'COLUMN CLUSTER', 'skyline'], ['cracker', 'cracker', 'CRACKING UNIT', 'skyline'],
  ['pumpjack', 'pumpjack', 'PUMPJACK', 'skyline'], ['tanker_truck', 'tanker_truck', 'TANKER TRUCK', 'prop'], ['forklift', 'forklift', 'FORKLIFT', 'prop'], ['generator', 'generator', 'GENERATOR', 'prop'],
  ['container', 'container', 'SHIPPING CONTAINER', 'cover'], ['valve_station', 'valve_station', 'VALVE STATION', 'objective'], ['cabin', 'cabin', 'CONTROL CABIN', 'prop'],
  ['transformer', 'transformer', 'TRANSFORMER', 'prop'], ['gas_rack', 'gas_rack', 'GAS CYLINDER RACK', 'explosive · prop'], ['pump_skid', 'pump_skid', 'PUMP SKID', 'prop'],
  ['scaffold', 'scaffold', 'SCAFFOLD', 'prop'], ['piperack', 'piperack', 'PIPE RACK', 'structure'], ['barrier', 'barrier', 'BARRIER', 'cover'], ['sandbags', 'sandbags', 'SANDBAGS', 'cover'],
  ['drums', 'drums', 'OIL DRUMS', 'explosive · cover'], ['pallets', 'pallets', 'PALLET STACK', 'prop'], ['fence', 'fence', 'PERIMETER FENCE', 'structure'], ['tank_wreck', 'tank_wreck', 'WRECKED TANK', 'prop'], ['mesa', 'mesa', 'SANDSTONE MESA', 'skyline'],
].filter(([m]) => MODELS[m]);
const STAGE = [['CONCEPT', 'One image in.'], ['MESH', 'Hi3D builds the geometry.'], ['MODEL', 'Textured, game-ready.']];

export function openHangar(G, root, onClose) {
  const el = document.createElement('div'); el.className = 'hangar';
  el.innerHTML = `<div class="hh"><div class="ov">EVERY MODEL IN THIS GAME WAS GENERATED WITH HI3D</div><h2>HANGAR</h2></div>
    <div class="list">${LIST.map(([, , n, k], i) => `<button data-i="${i}"><span class="n">${String(i + 1).padStart(2, '0')}</span>${n}<em>${k}</em></button>`).join('')}</div>
    <div class="stage"><img class="concept" alt=""><div class="steps">${STAGE.map(([a, b], i) => `<div data-s="${i}"><b>${String(i + 1).padStart(2, '0')} ${a}</b><span>${b}</span></div>`).join('')}</div>
    <div class="info"><b></b><span></span></div></div>
    <div class="foot"><span class="kc">←</span><span class="kc">→</span> MODEL <span class="kc">ESC</span> BACK</div>`;
  root.appendChild(el);
  const stageEl = el.querySelector('.stage'), img = el.querySelector('.concept'), info = el.querySelector('.info'), steps = [...el.querySelectorAll('.steps div')], btns = [...el.querySelectorAll('.list button')];
  const r = G.R.renderer;
  const prevState = { clip: r.localClippingEnabled, shadow: r.shadowMap.enabled, autoClear: r.autoClear, tone: r.toneMapping, exp: r.toneMappingExposure };
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(32, 1, 0.05, 200);
  scene.add(new THREE.HemisphereLight(0xdfe6f2, 0x2a211a, 1.3)); const key = new THREE.DirectionalLight(0xfff0dc, 2.6); key.position.set(3, 5, 4); scene.add(key); const rim = new THREE.DirectionalLight(0x8ab4ff, 1.6); rim.position.set(-4, 2, -5); scene.add(rim);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.MeshBasicMaterial({ side: THREE.BackSide, color: 0x6a5a4c })));
  const envLight = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5.5, 5) })); envLight.position.set(0, 6, 4); envLight.lookAt(0, 0, 0); envScene.add(envLight);
  const envRT = G.R.pmrem.fromScene(envScene, 0.04); scene.environment = envRT.texture; scene.environmentIntensity = 0.9;
  envScene.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  const pool = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'), g = x.createRadialGradient(128, 128, 0, 128, 128, 128); g.addColorStop(0, 'rgba(70,56,44,0.95)'); g.addColorStop(0.55, 'rgba(40,32,26,0.7)'); g.addColorStop(1, 'rgba(20,16,13,0)'); x.fillStyle = g; x.fillRect(0, 0, 256, 256); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshBasicMaterial({ map: pool, transparent: true, depthWrite: false })); floor.rotation.x = -Math.PI / 2; scene.add(floor); // a pool of light on a dark floor, fading out
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.99, 1, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 0.45, 0.1), toneMapped: false, transparent: true, opacity: 0.55 })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.002; scene.add(ring);
  const turn = new THREE.Group(); scene.add(turn);
  const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0), clipW = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);

  // MSAA HDR stage target composited onto the main canvas over the hangar radial backdrop (with ACESFilmic + sRGB).
  const tri = new THREE.BufferGeometry(); tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const compCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const compMat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, depthTest: false, depthWrite: false, toneMapped: false,
    uniforms: { tStage: { value: null }, uRect: { value: new THREE.Vector4(0, 0, 1, 1) } },
    vertexShader: `out vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `precision highp float; in vec2 vUv; out vec4 outColor;
      uniform sampler2D tStage; uniform vec4 uRect;
      vec3 aces(vec3 x){
        const mat3 m1 = mat3(0.59719,0.07600,0.02840, 0.35458,0.90834,0.13383, 0.04823,0.01566,0.83777);
        const mat3 m2 = mat3(1.60475,-0.10208,-0.00327, -0.53108,1.10813,-0.07276, -0.07367,-0.00605,1.07602);
        vec3 v = m1 * (x * 1.05 / 0.6); vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
        return clamp(m2 * (a / b), 0.0, 1.0);
      }
      vec3 toSrgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(max(c, 0.0), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
      void main(){
        vec2 d = (vUv - vec2(0.62, 0.45)) / vec2(0.62, 0.55); float r = length(d);
        vec3 c0 = vec3(42.0, 34.0, 27.0) / 255.0, c1 = vec3(18.0, 15.0, 12.0) / 255.0, c2 = vec3(10.0, 8.0, 7.0) / 255.0;
        vec3 bg = r < 0.55 ? mix(c0, c1, smoothstep(0.0, 0.55, r)) : mix(c1, c2, smoothstep(0.55, 1.0, r));
        vec2 suv = (vUv - uRect.xy) / max(uRect.zw, vec2(1e-4));
        if (suv.x >= 0.0 && suv.x <= 1.0 && suv.y >= 0.0 && suv.y <= 1.0) {
          vec4 fg = texture(tStage, suv); float a = clamp(fg.a, 0.0, 1.0);
          vec3 col = a > 1e-4 ? toSrgb(aces(fg.rgb / a)) : vec3(0.0);
          bg = mix(bg, col, a);
        }
        outColor = vec4(bg, 1.0);
      }`,
  });
  const compScene = new THREE.Scene(); const compQuad = new THREE.Mesh(tri, compMat); compQuad.frustumCulled = false; compScene.add(compQuad);
  let rt = null;
  const samples = Math.min(G.tier?.msaa ?? 0, r.capabilities.maxSamples || 0); // what this tier's game passes already use
  const ensureRT = (w, h) => {
    if (rt && rt.width === w && rt.height === h) return;
    rt?.dispose();
    rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, samples, depthBuffer: true, stencilBuffer: false });
    compMat.uniforms.tStage.value = rt.texture;
  };
  const disposeObj = (o) => { if (!o) return; turn.remove(o); o.traverse((x) => { if (x.isMesh) for (const mm of [].concat(x.material)) mm.dispose?.(); }); };

  let cur = -1, obj = null, wire = null, size = 1, objH = 1, t = 0, raf = 0, last = performance.now(), loadId = 0;
  function frameIt(o) { // centre on the turntable, sit on the floor, scale the camera to the object
    const b = new THREE.Box3().setFromObject(o), s = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
    o.position.x -= c.x; o.position.z -= c.z; o.position.y -= b.min.y; size = Math.max(s.x, s.y * 1.25, s.z); objH = s.y;
    floor.scale.setScalar(size * 0.9); ring.scale.setScalar(size * 0.52); return s;
  }
  async function show(i) {
    i = (i + LIST.length) % LIST.length; if (i === cur) return; cur = i; const my = ++loadId;
    btns.forEach((b, k) => b.classList.toggle('sel', k === i)); btns[i].scrollIntoView({ block: 'nearest' });
    const [m, c, n, k] = LIST[i]; img.src = `/hangar/${c}.webp`; info.querySelector('b').textContent = n; info.querySelector('span').textContent = '';
    t = 0; disposeObj(obj); obj = null; disposeObj(wire); wire = null;
    const o = await instance(m, { cloneMaterials: true }); if (my !== loadId) { disposeObj(o); return; }
    let tris = 0; o.traverse((x) => { if (x.isMesh) { tris += (x.geometry.index ? x.geometry.index.count : x.geometry.attributes.position.count) / 3; x.frustumCulled = false; for (const mm of [].concat(x.material)) mm.clippingPlanes = [clip]; } });
    const s = frameIt(o); obj = o; turn.add(o);
    wire = o.clone(true); wire.traverse((x) => { if (x.isMesh) x.material = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 1.6, 2.2), wireframe: true, transparent: true, opacity: 0.5, toneMapped: false, clippingPlanes: [clipW] }); }); turn.add(wire);
    info.querySelector('span').textContent = `${k.toUpperCase()} · ${Math.round(tris / 1000)}K TRIANGLES · ${s.x.toFixed(1)} × ${s.y.toFixed(1)} × ${s.z.toFixed(1)} M`;
  }
  function tick() {
    raf = requestAnimationFrame(tick); const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    const vw = window.innerWidth || 1, vh = window.innerHeight || 1;
    const rect = stageEl.getBoundingClientRect();
    const cw = r.domElement.width, ch = r.domElement.height;
    const rw = Math.max(1 / vw, rect.width / vw), rh = Math.max(1 / vh, rect.height / vh);
    const tw = Math.max(64, Math.round(cw * rw)), th = Math.max(64, Math.round(ch * rh));
    ensureRT(tw, th);
    if (Math.abs(cam.aspect - rect.width / Math.max(1, rect.height)) > 1e-3) { cam.aspect = rect.width / Math.max(1, rect.height); cam.updateProjectionMatrix(); }
    compMat.uniforms.uRect.value.set(rect.left / vw, 1 - rect.bottom / vh, rw, rh);

    // 0-1.8 s concept, 1.8-4.2 s the mesh prints bottom-up as a wireframe with the model following it, then the turntable
    const stage = t < 1.8 ? 0 : t < 4.2 ? 1 : 2, p = THREE.MathUtils.clamp((t - 1.8) / 2.4, 0, 1);
    steps.forEach((s, k) => s.classList.toggle('on', k === stage)); img.classList.toggle('on', stage === 0);
    const top = size * 1.3; clipW.constant = p * top; clip.constant = Math.max(0, p * top - size * 0.25) * (stage === 1 ? 1 : 0) + (stage === 2 ? top * 2 : 0);
    if (wire) wire.traverse((x) => { if (x.isMesh) x.material.opacity = stage === 1 ? 0.55 : stage === 2 ? Math.max(0, 0.55 - (t - 4.2) * 0.8) : 0; });
    if (obj) obj.visible = stage > 0; if (wire) wire.visible = stage > 0;
    turn.rotation.y += dt * (stage === 2 ? 0.45 : 0.25);
    const d = Math.max(size * 1.5, objH * 2.4); cam.position.set(Math.sin(0.6) * d, objH * 0.55 + size * 0.22, Math.cos(0.6) * d); cam.lookAt(0, objH * 0.47, 0); // the whole height in frame

    r.localClippingEnabled = true; r.shadowMap.enabled = false; r.autoClear = false; r.toneMapping = THREE.NoToneMapping;
    r.state.buffers.depth.setMask(true);
    r.setRenderTarget(rt); r.setClearColor(0x000000, 0); r.clear(true, true, false);
    r.render(scene, cam);
    r.setRenderTarget(null); r.setViewport(0, 0, cw, ch);
    r.render(compScene, compCam);
  }
  const onKey = (e) => { e.stopImmediatePropagation(); if (e.code === 'Escape' || e.code === 'Backspace') { e.preventDefault(); close(); } else if (e.code === 'ArrowDown' || e.code === 'ArrowRight') show(cur + 1); else if (e.code === 'ArrowUp' || e.code === 'ArrowLeft') show(cur - 1); };
  btns.forEach((b) => { b.onclick = (e) => { e.stopPropagation(); G.audio?.play?.('uiMove', { gain: 0.35 }); show(+b.dataset.i); }; });
  addEventListener('keydown', onKey, true);
  function close() {
    loadId++; removeEventListener('keydown', onKey, true); cancelAnimationFrame(raf);
    disposeObj(obj); disposeObj(wire); rt?.dispose(); envRT.dispose(); pool.dispose();
    floor.geometry.dispose(); floor.material.dispose(); ring.geometry.dispose(); ring.material.dispose();
    compMat.dispose(); tri.dispose();
    r.localClippingEnabled = prevState.clip; r.shadowMap.enabled = prevState.shadow; r.autoClear = prevState.autoClear;
    r.toneMapping = prevState.tone; r.toneMappingExposure = prevState.exp;
    r.setClearColor(0x000000, 1); r.setRenderTarget(null); r.resetState();
    el.remove(); G.hangarOpen = false; onClose?.();
  }
  G.hangarOpen = true; show(0); tick();
  return { close };
}
