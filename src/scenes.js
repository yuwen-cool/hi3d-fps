import * as THREE from 'three';

// Entry for ?show=... showcases and the game itself.
export async function build(G, show, setLoad) {
  const R = G.R;
  if (show === 'render') return renderTest(G);
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
