import * as THREE from 'three';
import { triplanarMaterial } from '../mats/triplanar.js';
import { instance } from './assets.js';
import { inZones } from './zones.js';

// Everything past the fence: dunes that rise out of the flat yard sand into a ridged horizon, a working
// refinery around the yard built from Hi3D models (columns, a cracking unit, LPG spheres, a tank farm,
// pumpjacks and dead trucks to the north), and sandstone mesas on the skyline. The colossus walks the open
// sand west of the yard, so that corridor stays empty.
const CX = -1, CZ = -12; // yard centre
const sstep = THREE.MathUtils.smoothstep;
const H = (x, z) => { const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return n - Math.floor(n); };
function vn(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z); let fx = x - ix, fz = z - iz; fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
  const a = H(ix, iz), b = H(ix + 1, iz), c = H(ix, iz + 1), d = H(ix + 1, iz + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
// dune height: zero (below the yard plane) inside ~80 m, long crests across the wind further out
const PX0 = -72, PX1 = 22, PZ0 = -74, PZ1 = 8; // the playable area
export function duneH(x, z) {
  const dx = Math.max(PX0 - x, 0, x - PX1), dz = Math.max(PZ0 - z, 0, z - PZ1), r = Math.hypot(dx, dz), ramp = sstep(r, 18, 210);
  if (ramp <= 0) return -0.8;
  const w = x * 0.627 + z * 0.779, c = -x * 0.779 + z * 0.627;            // along / across the storm wind
  const ph = w * 0.03 + Math.sin(c * 0.009) * 2.4 + vn(x * 0.01, z * 0.01) * 3;
  const s = 0.5 + 0.5 * Math.sin(ph); const crest = s * s * (1.4 - 0.4 * s);   // soft windward side, steeper slip face
  const big = 0.55 + 0.9 * vn(x * 0.004 + 3.1, z * 0.004 - 1.7);
  const ripple = (vn(x * 0.06, z * 0.06) - 0.5) * 1.2;
  return -0.8 + ramp * ((5 + 34 * ramp) * (0.3 + 0.7 * crest) * big + ripple);
}
const inBossLane = (x, z) => x > -128 && x < -84 && z > -80 && z < 50; // where the colossus walks the horizon in act 1

function duneMesh() {
  const R0 = 70, R1 = 880, NR = 110, NA = 384, pos = [], idx = [];
  for (let i = 0; i <= NR; i++) {
    const r = R0 * Math.pow(R1 / R0, i / NR);
    for (let j = 0; j < NA; j++) { const a = j / NA * Math.PI * 2, x = CX + Math.cos(a) * r, z = CZ + Math.sin(a) * r; pos.push(x, duneH(x, z), z); }
  }
  for (let i = 0; i < NR; i++) for (let j = 0; j < NA; j++) {
    const a = i * NA + j, b = i * NA + (j + 1) % NA, c = a + NA, d = b + NA; idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// one InstancedMesh per sub-mesh of a model, so a whole ring of copies costs a draw call or two
export async function scatterModel(root, name, list, { shadow = false, inside = false } = {}) {
  if (!inside) list = list.filter((o) => !inZones(o.x, o.z, 10)); // nothing out here may stand inside the playable zones
  if (!list.length) return;
  const src = await instance(name); src.updateMatrixWorld(true);
  const meshes = [], out = []; src.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3();
  for (const mesh of meshes) {
    const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, list.length);
    list.forEach((o, i) => { m4.compose(p.set(o.x, o.y, o.z), q.setFromAxisAngle(Y, o.ry), s.setScalar(o.s)).multiply(mesh.matrixWorld); im.setMatrixAt(i, m4); });
    im.computeBoundingSphere(); im.castShadow = shadow; im.receiveShadow = true; im.name = 'out_' + name; root.add(im); out.push({ im, local: mesh.matrixWorld.clone() });
  }
  return { meshes: out, list };
}

export async function buildOutskirts(G, root) {
  const rnd = G.rng;
  const dunes = new THREE.Mesh(duneMesh(), triplanarMaterial('gravelly_sand', { metres: 7, cls: 'ground', metal: 0, tint: 0xc9a27c, nscale: 0.6 }));
  dunes.name = 'dunes'; dunes.receiveShadow = true; root.add(dunes);
  // a footprint sits on the lowest sand under it and sinks a little so nothing floats on a crest
  const base = (x, z, rad) => { let m = 1e9; for (let k = 0; k < 7; k++) { const a = k / 7 * 6.283; m = Math.min(m, duneH(x + Math.cos(a) * rad, z + Math.sin(a) * rad)); } m = Math.min(m, duneH(x, z)); return Math.max(0, m) - (m > 0 ? 0.6 : 0); };
  const at = (x, z, s = 1, ry = rnd() * 6.283, rad = 6) => ({ x, y: base(x, z, rad * s), z, s, ry });
  const polar = (a, d, s, rad) => at(CX + Math.cos(a) * d, CZ + Math.sin(a) * d, s, undefined, rad);
  const L = { column_cluster: [], cracker: [], horton_sphere: [], tank_far: [], tower_far: [], tanker_truck: [], container_far: [], pumpjack_far: [], tank_wreck: [], mesa: [] };

  // ---- near ring (35-75 m): the refinery the yard belongs to, seen over the walls ----
  L.column_cluster.push(at(-36, -84, 1), at(18, -88, 0.85), at(-62, -80, 0.9));
  L.cracker.push(at(-6, -90, 1.1));
  L.horton_sphere.push(at(42, -46, 1), at(56, -30, 1), at(44, -18, 0.9));
  L.tank_far.push(at(38, 4, 1.2), at(50, 14, 1), at(-44, -86, 1.1));
  L.tower_far.push(at(34, -58, 1));
  L.tank_wreck.push(at(-24, -86, 1.1));
  // north: an oil field and the road in, wrecks left where they stopped
  L.pumpjack_far.push(at(-12, 36, 1.3), at(12, 42, 1.3), at(32, 30, 1.3), at(-30, 48, 1.3), at(4, 62, 1.3), at(46, 50, 1.3));
  L.tanker_truck.push(at(-34, 22, 1, 0.4), at(10, 22, 1, -1.2), at(28, 18, 1, 2.6), at(-44, 30, 1, 1.9));
  L.container_far.push(at(-27, 24, 1, 0.2), at(-24, 27, 1, 1.7), at(22, 26, 1, 0.1), at(40, -2, 1, 1.4), at(-40, -14, 1, 0.9));

  // ---- far ring (100-240 m): more plant along the sun side where the money shots look, a tank farm east ----
  for (let i = 0; i < 48; i++) {
    const sun = rnd() < 0.55, a = sun ? -2.2 + (rnd() - 0.5) * 2.0 : rnd() * 6.283, d = 100 + Math.pow(rnd(), 0.8) * 140;
    const x = CX + Math.cos(a) * d, z = CZ + Math.sin(a) * d; if (inBossLane(x, z)) continue;
    const k = rnd(), s = 1.1 + rnd() * 0.7;
    if (k < 0.22) L.column_cluster.push(at(x, z, s));
    else if (k < 0.32) L.cracker.push(at(x, z, s));
    else if (k < 0.48) L.horton_sphere.push(at(x, z, s * 0.9));
    else if (k < 0.75) L.tank_far.push(at(x, z, 1.2 + rnd() * 1.4));
    else if (k < 0.88) L.tower_far.push(at(x, z, s));
    else L.pumpjack_far.push(at(x, z, 1.4));
  }
  // ---- horizon: sandstone mesas standing out of the dunes ----
  for (let i = 0; i < 10; i++) { const a = i / 10 * 6.283 + rnd() * 0.45, d = 500 + rnd() * 260; L.mesa.push(polar(a, d, 0.5 + rnd() * 0.6, 40)); }

  await Promise.all(Object.entries(L).map(([n, list]) => scatterModel(root, n, list, { shadow: false })));
}
