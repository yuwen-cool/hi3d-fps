import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { triplanarMaterial } from '../mats/triplanar.js';
import { instance } from './assets.js';

// Set dressing that turns an empty yard into a lived-in ruin: instanced rocks/gravel,
// procedural pipe runs with flanges, extra Hi3D clutter and shrubs.
function rockGeo(seed, detail = 1) {
  const g = new THREE.IcosahedronGeometry(1, detail); const p = g.attributes.position; const v = new THREE.Vector3();
  let s = seed; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const k = [0.6 + r() * 0.6, 0.45 + r() * 0.4, 0.6 + r() * 0.6];
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = 0.78 + r() * 0.35; v.set(v.x * k[0] * n, v.y * k[1] * n, v.z * k[2] * n); p.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals(); return g;
}
export async function dress(G, root) {
  const P = G.phys, rnd = G.rng;
  const rockMat = triplanarMaterial('concrete_floor_worn_001', { metres: 0.9, cls: 'concrete', metal: 0, tint: 0xc9b49a, nscale: 1.4 });
  // ---- rocks: clusters along walls/structures + random sprinkle ----
  const geos = [rockGeo(7, 1), rockGeo(91, 1), rockGeo(345, 1), rockGeo(1201, 0)];
  const B = G.level.layout.bounds;
  const spots = [];
  const cluster = (x, z, n, r, s0, s1) => { for (let i = 0; i < n; i++) { const a = rnd() * 6.28, d = Math.sqrt(rnd()) * r; spots.push([x + Math.cos(a) * d, z + Math.sin(a) * d, s0 + Math.pow(rnd(), 2.2) * (s1 - s0)]); } };
  for (const b of P.boxes) { const h = b.max.y - b.min.y; if (h > 8) continue; const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2; cluster(cx, cz, 10, Math.max(b.max.x - b.min.x, b.max.z - b.min.z) * 0.8 + 0.8, 0.04, 0.3); }
  for (let i = 0; i < 260; i++) spots.push([B.minX + rnd() * (B.maxX - B.minX), B.minZ - 20 + rnd() * (B.maxZ - B.minZ + 20), 0.03 + Math.pow(rnd(), 3) * 0.35]);
  cluster(-8, -6, 30, 3, 0.05, 0.5); cluster(5, -30, 30, 4, 0.05, 0.6); cluster(-18, -12, 25, 3, 0.05, 0.5); cluster(0, 0, 12, 4, 0.03, 0.12);
  const per = geos.map(() => []);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (const [x, z, s] of spots) {
    if (s > 0.18 && P.blocked(x, z, s * 0.6, -1, 2)) continue;
    const gi = Math.floor(rnd() * geos.length);
    e.set(rnd() * 0.5, rnd() * 6.28, rnd() * 0.5); q.setFromEuler(e);
    m4.compose(new THREE.Vector3(x, s * 0.35, z), q, new THREE.Vector3(s, s, s)); per[gi].push(m4.clone());
  }
  per.forEach((list, i) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geos[i], rockMat, list.length); list.forEach((m, k) => im.setMatrixAt(k, m));
    im.castShadow = true; im.receiveShadow = true; im.name = 'rocks'; root.add(im);
  });
  // ---- pipe runs (procedural): horizontal runs on the gantry + along the workshop wall, with flanges ----
  const pipeMat = triplanarMaterial('rusty_metal_02', { metres: 1.2, cls: 'rust', tint: 0xa89684 });
  const pg = [];
  const pipe = (a, b, r) => {
    const d = b.clone().sub(a); const L = d.length(); const g = new THREE.CylinderGeometry(r, r, L, 18, 1, true);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize())); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); pg.push(g);
    for (let t = 1.6; t < L - 0.5; t += 3.2) { const f = new THREE.CylinderGeometry(r * 1.45, r * 1.45, 0.07, 18); f.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize())); const p = a.clone().addScaledVector(d, t / L); f.translate(p.x, p.y, p.z); pg.push(f); }
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // gantry bundle (level 1 + 2)
  for (const [y, z, r] of [[3.55, -21.6, 0.22], [3.55, -21.0, 0.16], [6.55, -21.4, 0.28], [6.5, -16.6, 0.2], [9.5, -17.3, 0.14]]) pipe(V(-21, y, z), V(-1.5, y, z), r);
  // drop pipes to the ground with elbows implied by flanges
  for (const [x, z, r] of [[-2.5, -21.6, 0.22], [-9, -16.6, 0.2]]) pipe(V(x, 0, z), V(x, 3.55, z), r);
  // along the workshop's outer face, above head height
  pipe(V(13.6, 3.9, 0.5), V(13.6, 3.9, -24.5), 0.18); pipe(V(13.7, 4.4, 0.5), V(13.7, 4.4, -24.5), 0.12);
  // overhead crossings between rack and workshop
  pipe(V(-7, 5.2, -11.2), V(13.5, 5.2, -11.2), 0.24); pipe(V(-7, 5.6, -11.9), V(13.5, 5.6, -11.9), 0.16);
  // ground-level runs (cover + trip hazards) on sleepers
  pipe(V(-20, 0.45, -28.5), V(12, 0.45, -28.5), 0.32); pipe(V(-20, 0.4, -29.4), V(12, 0.4, -29.4), 0.26);
  const pm = new THREE.Mesh(mergeGeometries(pg.map((g) => g.index ? g.toNonIndexed() : g), false), pipeMat); pm.castShadow = pm.receiveShadow = true; pm.name = 'pipes'; root.add(pm);
  P.addShootable(pm, 'metal');
  P.addBox(V(-20, 0, -29.8), V(12, 0.78, -28.1), 'metal');
  for (const [x, z] of [[-2.5, -21.6], [-9, -16.6]]) P.addBox(V(x - 0.25, 0, z - 0.25), V(x + 0.25, 3.6, z + 0.25), 'metal');
  // ---- extra Hi3D clutter: drums/valves/barriers dotted near structures, more shrubs ----
  const extra = [['drums', -16.5, -16, 1.2], ['drums', 12.5, -14, 2.8], ['valves', 0.5, -24.2, 2.0], ['rubble', 11, -10, 0.7], ['rubble', -9.5, -24.5, 2.2], ['hazard_fence', -17.5, -26.5, 1.4], ['lamp', 13.8, -6.3, -Math.PI / 2], ['lamp', 13.8, -15.6, -Math.PI / 2]];
  await Promise.all(extra.map(async ([n, x, z, ry]) => {
    const o = await instance(n); o.position.set(x, n === 'lamp' ? 2.9 : 0, z); o.rotation.y = ry; root.add(o); o.updateMatrixWorld(true);
    if (n !== 'lamp' && n !== 'rubble') { const bb = new THREE.Box3().setFromObject(o); const c = bb.getCenter(new THREE.Vector3()), s = bb.getSize(new THREE.Vector3()); s.x *= 0.85; s.z *= 0.85; P.addBoxCenter(c, s, 'metal'); }
    P.addShootable(o, n === 'rubble' ? 'concrete' : 'metal');
  }));
  const sh = [[-6, -14], [9, -8], [-19, -18], [3, -16], [-12, -31], [15, -30], [-1, -33], [18, 3], [-21, -4], [6, 4.5], [-11, 2], [10.5, -31.5]];
  await Promise.all(sh.map(async ([x, z], i) => { const o = await instance('shrub'); o.position.set(x, 0, z); o.rotation.y = i * 2.3; o.scale.setScalar(0.6 + (i % 4) * 0.25); root.add(o); }));
}
