import * as THREE from 'three';

// Entry for ?show=... showcases and the game itself.
export async function build(G, show, setLoad) {
  const R = G.R;
  if (show === 'render') return renderTest(G);
  if (show === 'asset') return assetShow(G);
  if (show === 'robot') return robotShow(G);
  const { buildGame } = await import('./game/game.js');
  return buildGame(G, setLoad);
}

// Grey-box courtyard + roughness ladder: validates the render foundation in isolation.
function renderTest(G) {
  const R = G.R; const s = R.scene;
  const grey = (c, r, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  const add = (geo, mat, x, y, z, ry = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = o.receiveShadow = true; s.add(o); return o; };
  const ground = add(new THREE.PlaneGeometry(200, 200), grey(0x8a7660, 0.9), 0, 0, 0); ground.rotation.x = -Math.PI / 2;
  // steel frame gantry (sun shines through it -> light shafts)
  const steel = grey(0x4a4744, 0.6, 0.6);
  for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) add(new THREE.BoxGeometry(0.4, 12, 0.4), steel, -14 + i * 3.2, 6, -18 + j * 5);
  for (let k = 0; k < 4; k++) add(new THREE.BoxGeometry(17, 0.35, 0.35), steel, -6, 3 + k * 3, -18);
  for (let k = 0; k < 4; k++) add(new THREE.BoxGeometry(17, 0.35, 0.35), steel, -6, 3 + k * 3, -13);
  for (let i = 0; i < 6; i++) for (let k = 0; k < 4; k++) add(new THREE.BoxGeometry(0.3, 0.3, 5), steel, -14 + i * 3.2, 3 + k * 3, -15.5);
  // tanks
  const tank = grey(0x6b625a, 0.7, 0.3);
  add(new THREE.CylinderGeometry(4, 4, 10, 48), tank, 12, 5, -20);
  add(new THREE.CylinderGeometry(1.5, 1.5, 18, 32), tank, 6, 9, -30);
  add(new THREE.CylinderGeometry(1.2, 1.2, 14, 32), tank, 18, 7, -34);
  // cover blocks
  const conc = grey(0x9c917f, 0.85);
  add(new THREE.BoxGeometry(3, 1.2, 0.8), conc, 2, 0.6, -8, 0.2);
  add(new THREE.BoxGeometry(3, 1.2, 0.8), conc, -4, 0.6, -11, -0.3);
  add(new THREE.BoxGeometry(1.2, 1.2, 3), conc, 7, 0.6, -6);
  // roughness ladder
  for (let i = 0; i < 7; i++) {
    add(new THREE.SphereGeometry(0.45, 48, 24), grey(0xb8b0a4, 0.05 + i * 0.15, 0), -3 + i * 1.1, 0.45, -3);
    add(new THREE.SphereGeometry(0.45, 48, 24), grey(0xc9a26a, 0.05 + i * 0.15, 1), -3 + i * 1.1, 0.45, -4.4);
  }
  R.fitShadow(new THREE.Box3(new THREE.Vector3(-40, -1, -45), new THREE.Vector3(40, 20, 20)));
  R.camera.position.set(1.5, 1.68, 4); R.camera.lookAt(-3, 3.2, -18);
}

// ?show=asset&m=name[,name2]&d=dist&yaw=deg&h=height : models on sand under the dusk sun
async function assetShow(G) {
  const R = G.R; const { instance, setRendererCaps } = await import('./world/assets.js'); const { makeGround } = await import('./world/ground.js');
  setRendererCaps(R.renderer);
  R.scene.add(makeGround());
  const names = (G.params.m || 'rifle_v1').split(',');
  let x = 0; let maxH = 0, maxL = 0;
  for (const n of names) {
    const o = await instance(n); const s = o.userData.size || new THREE.Vector3(1, 1, 1);
    o.position.x = x + s.x / 2; x += s.x + 0.5; R.scene.add(o); maxH = Math.max(maxH, s.y); maxL = Math.max(maxL, s.x, s.z);
    if (G.params.lift) o.position.y = +G.params.lift;
  }
  R.scene.children.filter((o) => names.includes(o.name)).forEach((o) => { o.position.x -= x / 2 - 0.25; });
  R.fitShadow(new THREE.Box3(new THREE.Vector3(-x - 6, -1, -8), new THREE.Vector3(x + 6, maxH + 4, 8)));
  const d = +(G.params.d || Math.max(maxL, maxH) * 1.6 + 0.4); const yaw = (+(G.params.yaw || 200)) * Math.PI / 180;
  const h = G.params.h !== undefined ? +G.params.h : maxH * 0.6 + (G.params.lift ? +G.params.lift : 0);
  R.camera.position.set(Math.sin(yaw) * d, h + d * 0.25, Math.cos(yaw) * d); R.camera.lookAt(0, h * 0.85, 0);
  R.camera.near = 0.02; R.camera.updateProjectionMatrix();
}

// ?show=robot&clips=Idle_A,Jog,Pistol_Aim_Neutral&t=0.4 : retargeted clips side by side
async function robotShow(G) {
  const R = G.R; const { loadRobotRig } = await import('./enemies/anim.js'); const { makeGround } = await import('./world/ground.js');
  const { patchMaterial } = await import('./mats/patch.js');
  const { setRendererCaps } = await import('./world/assets.js'); setRendererCaps(R.renderer);
  R.scene.add(makeGround());
  const names = (G.params.clips || 'Idle_A,Jog,Pistol_Aim_Neutral,Death_A').split(',');
  const { clips } = await loadRobotRig();
  const { clone } = await import('three/examples/jsm/utils/SkeletonUtils.js');
  const rigSrc = (await loadRobotRig()).gltf.scene;
  const mixers = [];
  names.forEach((n, i) => {
    const o = clone(rigSrc); o.scale.setScalar(1.9);
    o.position.set((i - (names.length - 1) / 2) * 1.6, 0, 0); o.rotation.y = Math.PI + 0.5;
    o.traverse((m) => { if (m.isMesh) { m.castShadow = m.receiveShadow = true; m.frustumCulled = false; patchMaterial(m.material, 'robot'); } });
    R.scene.add(o);
    const mx = new THREE.AnimationMixer(o); if (clips[n]) { const a = mx.clipAction(clips[n]); a.play(); mx.setTime((+(G.params.t || 0.35)) * clips[n].duration); }
    mixers.push(mx);
  });
  if (G.params.play) G.modules.robotShow = { update: (dt) => mixers.forEach((m) => m.update(dt)) };
  R.fitShadow(new THREE.Box3(new THREE.Vector3(-8, -1, -6), new THREE.Vector3(8, 4, 6)));
  R.camera.position.set(0.6, 1.5, -5.6); R.camera.lookAt(0, 1.0, 0);
}
