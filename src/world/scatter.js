import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { triplanarMaterial } from '../mats/triplanar.js';
import { instance } from './assets.js';
import { patchMaterial } from '../mats/patch.js';

// Set dressing that turns an empty yard into a lived-in ruin: instanced rocks/gravel,
// procedural pipe runs with flanges, extra Hi3D clutter and shrubs.
function rockGeo(seed, detail = 3) {
  // organic rock: smooth 3D value-noise displacement (two octaves) + flattened base, welded so normals stay smooth
  let s = seed; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const H = (x, y, z) => { const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed) * 43758.5453; return n - Math.floor(n); };
  const N = (x, y, z) => { const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z); let fx = x - ix, fy = y - iy, fz = z - iz; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
    const l = (a, b, t) => a + (b - a) * t;
    return l(l(l(H(ix, iy, iz), H(ix + 1, iy, iz), fx), l(H(ix, iy + 1, iz), H(ix + 1, iy + 1, iz), fx), fy), l(l(H(ix, iy, iz + 1), H(ix + 1, iy, iz + 1), fx), l(H(ix, iy + 1, iz + 1), H(ix + 1, iy + 1, iz + 1), fx), fy), fz); };
  let g = new THREE.IcosahedronGeometry(1, detail); g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position; const v = new THREE.Vector3();
  const k = [0.7 + r() * 0.5, 0.42 + r() * 0.3, 0.7 + r() * 0.5]; const o = [r() * 10, r() * 10, r() * 10];
  const cuts = []; for (let i = 0; i < 9; i++) { const n = new THREE.Vector3(r() - 0.5, (r() - 0.3) * 0.9, r() - 0.5).normalize(); cuts.push([n, 0.5 + r() * 0.28]); }
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i);
    const d = 1 + (N(v.x * 1.6 + o[0], v.y * 1.6 + o[1], v.z * 1.6 + o[2]) - 0.5) * 0.55 + (N(v.x * 4.5 + o[1], v.y * 4.5, v.z * 4.5 + o[2]) - 0.5) * 0.18;
    v.multiplyScalar(d);
    // fracture planes: clamp onto a few random half-spaces so the stone reads as broken, not as a pebble
    for (const [n, c] of cuts) { const t = v.dot(n) - c; if (t > 0) v.addScaledVector(n, -t); }
    v.set(v.x * k[0], v.y * k[1], v.z * k[2]); if (v.y < -0.12) v.y = -0.12 + (v.y + 0.12) * 0.2; p.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals(); return g;
}
export async function dress(G, root) {
  const P = G.phys, rnd = G.rng;
  const rockMat = triplanarMaterial('gravelly_sand', { metres: 0.7, cls: 'concrete', metal: 0, tint: 0x9a8670, nscale: 1.6 });
  // ---- rocks: clusters along walls/structures + random sprinkle ----
  const geos = [rockGeo(7), rockGeo(91), rockGeo(345), rockGeo(1201, 2), rockGeo(7, 2), rockGeo(91, 1), rockGeo(345, 2), rockGeo(1201, 1)]; // 0-3 detailed (big rocks), 4-7 light (pebbles)
  const B = G.level.layout.bounds, ZS = G.level.layout.zones;
  // scatter gathers round props that stand on the ground — not stair steps, rails, deck slabs or perimeter walls
  const propBoxes = P.boxes.filter((b) => { const h = b.max.y - b.min.y; return b.min.y < 0.05 && h >= 0.3 && h <= 8 && Math.min(b.max.x - b.min.x, b.max.z - b.min.z) > 0.6; });
  // scatter is laid per zone (each gets its own instanced meshes so the camera culls the zones it is not looking at)
  // ...and within a zone in 20 m tiles, so the camera can stop drawing small stuff it is far from (scatter.update)
  const TILE = 20, tiles = new Map(); const zoneOf = (x, z) => { const k = Math.floor(x / TILE) * 1000 + Math.floor(z / TILE); if (!tiles.has(k)) tiles.set(k, tiles.size); return tiles.get(k); };
  const inZ = (r, m = 0) => [r.minX + m + rnd() * (r.maxX - r.minX - 2 * m), r.minZ + m + rnd() * (r.maxZ - r.minZ - 2 * m)];
  const area = (r) => (r.maxX - r.minX) * (r.maxZ - r.minZ);
  const near = []; // [mesh, centre, draw distance]
  const chunked = (lists, mk, far = 50) => lists.forEach((perTile) => perTile.forEach((l, gi) => { if (!l.length) return; const im = mk(gi, l.length); l.forEach((m, k) => im.setMatrixAt(k, m)); im.computeBoundingSphere(); im.computeBoundingBox(); root.add(im); near.push([im, im.boundingBox, far]); }));
  const tl = (n) => Array.from({ length: 256 }, () => Array.from({ length: n }, () => []));
  G.level.scatterNear = near;
  const spots = [];
  const cluster = (x, z, n, r, s0, s1) => { for (let i = 0; i < n; i++) { const a = rnd() * 6.28, d = Math.sqrt(rnd()) * r; spots.push([x + Math.cos(a) * d, z + Math.sin(a) * d, s0 + Math.pow(rnd(), 2.2) * (s1 - s0)]); } };
  for (const b of propBoxes) { const h = b.max.y - b.min.y; if (h > 8) continue; const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2; cluster(cx, cz, 10, Math.max(b.max.x - b.min.x, b.max.z - b.min.z) * 0.8 + 0.8, 0.04, 0.3); }
  for (const r of ZS) for (let i = 0, n = Math.round(260 * area(r) / 1530); i < n; i++) spots.push([...inZ(r), 0.03 + Math.pow(rnd(), 3) * 0.35]);
  cluster(-8, -6, 30, 3, 0.05, 0.5); cluster(5, -30, 30, 4, 0.05, 0.6); cluster(-18, -12, 25, 3, 0.05, 0.5); cluster(0, 0, 12, 4, 0.03, 0.12);
  const per = tl(geos.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (const [x, z, s] of spots) {
    if (s > 0.18 && P.blocked(x, z, s * 0.6, -1, 2)) continue;
    const gi = Math.floor(rnd() * 4) + (s < 0.2 ? 4 : 0);
    e.set(rnd() * 0.25, rnd() * 6.28, rnd() * 0.25); q.setFromEuler(e);
    m4.compose(new THREE.Vector3(x, s * 0.08, z), q, new THREE.Vector3(s, s, s)); per[zoneOf(x, z)][gi].push(m4.clone());
  }
  chunked(per, (i, n) => { const im = new THREE.InstancedMesh(geos[i], rockMat, n); im.castShadow = true; im.receiveShadow = true; im.name = 'rocks'; return im; }, 55);
  // ---- gravel: thousands of small angular stones, densest along walls/structures and the play paths ----
  {
    const gGeos = [rockGeo(17, 1), rockGeo(23, 1), rockGeo(51, 1)];
    const gm = triplanarMaterial('gravelly_sand', { metres: 0.35, cls: 'concrete', metal: 0, tint: 0x8c7a66, nscale: 1.2 });
    const pts = [];
    const near = (x, z, n, rad) => { for (let i = 0; i < n; i++) { const a = rnd() * 6.28, d = Math.pow(rnd(), 0.7) * rad; pts.push([x + Math.cos(a) * d, z + Math.sin(a) * d]); } };
    for (const b of propBoxes) { const h = b.max.y - b.min.y; if (h > 8 || h < 0.3) continue;
      const per = Math.min(70, 8 + ((b.max.x - b.min.x) + (b.max.z - b.min.z)) * 4);
      for (let i = 0; i < per; i++) { const t = rnd(), side = Math.floor(rnd() * 4), o = 0.05 + Math.pow(rnd(), 2) * 0.9;
        const x = side < 2 ? b.min.x + t * (b.max.x - b.min.x) : side === 2 ? b.min.x - o : b.max.x + o;
        const z = side >= 2 ? b.min.z + t * (b.max.z - b.min.z) : side === 0 ? b.min.z - o : b.max.z + o; pts.push([x, z]); } }
    ZS.forEach((r, zi) => { const k = zi === 0 ? 1 : 0.55; // the yard keeps its full density; the new zones are bigger, a little sparser
      for (let i = 0, n = Math.round(9000 * k * area(r) / 1530); i < n; i++) pts.push(inZ(r));
      // clumps: gravel collects in patches rather than spreading evenly
      for (let i = 0, n = Math.round(160 * k * area(r) / 1530); i < n; i++) near(...inZ(r), 25 + Math.floor(rnd() * 40), 0.4 + rnd() * 1.2); });
    near(0, 2, 500, 6); near(-4, -6, 300, 5); near(4, -14, 300, 6);
    const lists = tl(gGeos.length);
    for (const [x, z] of pts) { if (P.blocked(x, z, 0.02, -1, 2)) continue;
      const sz = 0.018 + Math.pow(rnd(), 2.2) * 0.1; e.set(rnd() * 3, rnd() * 6.28, rnd() * 3); q.setFromEuler(e);
      m4.compose(new THREE.Vector3(x, sz * 0.1, z), q, new THREE.Vector3(sz, sz * (0.6 + rnd() * 0.6), sz)); lists[zoneOf(x, z)][Math.floor(rnd() * 3)].push(m4.clone()); }
    chunked(lists, (i, n) => { const im = new THREE.InstancedMesh(gGeos[i], gm, n); im.receiveShadow = true; im.castShadow = false; im.name = 'gravel'; return im; }, 28);
  }
  // ---- debris: rusty bent plates, rebar and broken planks lying around ----
  {
    const plate = new THREE.BoxGeometry(1, 0.012, 1, 6, 1, 6); { const a = plate.attributes.position; for (let i = 0; i < a.count; i++) { const x = a.getX(i), z = a.getZ(i); a.setY(i, a.getY(i) + Math.sin(x * 4.1 + z * 2.3) * 0.035 + x * z * 0.06); } plate.computeVertexNormals(); }
    const bar = new THREE.CylinderGeometry(0.008, 0.008, 1, 6); bar.rotateZ(Math.PI / 2);
    const plank = new THREE.BoxGeometry(1, 0.03, 0.12);
    const rust = triplanarMaterial('rusty_metal_02', { metres: 0.6, cls: 'rust', tint: 0x9a8070 });
    const wood = triplanarMaterial('concrete_floor_worn_001', { metres: 0.5, cls: 'default', metal: 0, tint: 0x6a5240 });
    const sets = [[plate, rust, 70, [0.25, 0.7]], [bar, rust, 90, [0.5, 1.6]], [plank, wood, 40, [0.6, 1.4]]];
    for (const [geo, mat, n0, [s0, s1]] of sets) for (const r of ZS) {
      const l = [], n = Math.round(n0 * area(r) / 1530 * (r === ZS[0] ? 1 : 0.7));
      for (let i = 0; i < n * 3 && l.length < n; i++) { const [x, z] = inZ(r, 1);
        if (P.blocked(x, z, 0.4, -1, 2)) continue; const sc = s0 + rnd() * (s1 - s0);
        e.set((rnd() - 0.5) * 0.15, rnd() * 6.28, (rnd() - 0.5) * 0.15); q.setFromEuler(e);
        m4.compose(new THREE.Vector3(x, 0.012, z), q, new THREE.Vector3(sc, 1, geo === plate ? sc * (0.5 + rnd() * 0.6) : 1)); l.push(m4.clone()); }
      if (!l.length) continue; const im = new THREE.InstancedMesh(geo, mat, l.length); l.forEach((m, k) => im.setMatrixAt(k, m)); im.computeBoundingSphere(); im.computeBoundingBox(); im.castShadow = im.receiveShadow = true; im.name = 'debris'; root.add(im); near.push([im, im.boundingBox, 36]);
    }
  }
  // ---- dry grass tufts: crossed alpha cards with a procedurally drawn blade texture ----
  {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256; const c2 = cv.getContext('2d');
    for (let i = 0; i < 70; i++) { const x0 = 128 + (rnd() - 0.5) * 120, h = 90 + rnd() * 160, lean = (rnd() - 0.5) * 120, w = 1.5 + rnd() * 3;
      const l = 0.55 + rnd() * 0.35; c2.strokeStyle = `rgb(${Math.round(150 * l + 40)},${Math.round(120 * l + 25)},${Math.round(70 * l + 10)})`; c2.lineWidth = w; c2.lineCap = 'round';
      c2.beginPath(); c2.moveTo(x0, 256); c2.quadraticCurveTo(x0 + lean * 0.3, 256 - h * 0.6, x0 + lean, 256 - h); c2.stroke(); }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const gm = patchMaterial(new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.95 }), 'plant');
    const card = new THREE.PlaneGeometry(1, 1); card.translate(0, 0.5, 0); const card2 = card.clone().rotateY(Math.PI / 3), card3 = card.clone().rotateY(-Math.PI / 3);
    const tuft = mergeGeometries([card, card2, card3]); tuft.computeVertexNormals();
    // normals point up so the cards light like a soft volume instead of flickering per facing
    { const nn = tuft.attributes.normal; for (let i = 0; i < nn.count; i++) nn.setXYZ(i, 0, 1, 0); }
    const gl = tl(1);
    const put = (x, z, s) => { if (P.blocked(x, z, 0.1, -1, 2)) return; e.set(0, rnd() * 6.28, 0); q.setFromEuler(e); m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s * (0.8 + rnd() * 0.5), s, s)); gl[zoneOf(x, z)][0].push(m4.clone()); };
    for (const b of propBoxes) { const h = b.max.y - b.min.y; if (h > 8 || h < 0.3) continue; for (let i = 0; i < 6; i++) { const t = rnd(), side = Math.floor(rnd() * 4), o = 0.1 + rnd() * 0.35;
      put(side < 2 ? b.min.x + t * (b.max.x - b.min.x) : side === 2 ? b.min.x - o : b.max.x + o, side >= 2 ? b.min.z + t * (b.max.z - b.min.z) : side === 0 ? b.min.z - o : b.max.z + o, 0.22 + rnd() * 0.35); } }
    for (const r of ZS) for (let i = 0, nn = Math.round(260 * area(r) / 1530 * (r === ZS[0] ? 1 : 0.8)); i < nn; i++) { const [cx, cz] = inZ(r), n = 2 + Math.floor(rnd() * 6);
      for (let k = 0; k < n; k++) put(cx + (rnd() - 0.5) * 1.4, cz + (rnd() - 0.5) * 1.4, 0.2 + Math.pow(rnd(), 2) * 0.45); }
    chunked(gl, (i, n) => { const im = new THREE.InstancedMesh(tuft, gm, n); im.castShadow = true; im.receiveShadow = true; im.name = 'grass'; return im; }, 34);
  }
  // ---- flare stack: a tall burner that stays lit all match (fire.js lights it); a landmark at night ----
  {
    const fx = 29, fz = -46, H = 34, sg = [];
    const cy = (r0, r1, h, y) => { const g = new THREE.CylinderGeometry(r1, r0, h, 16, 1, false); g.translate(fx, y + h / 2, fz); sg.push(g); };
    cy(1.1, 0.7, H, 0); cy(1.3, 1.3, 0.5, H * 0.33); cy(1.15, 1.15, 0.5, H * 0.66); cy(0.95, 0.95, 1.2, H);   // shaft, platforms, tip
    for (let i = 0; i < 3; i++) { const a = i * 2.09, g = new THREE.CylinderGeometry(0.06, 0.06, H * 0.8, 6); g.rotateZ(Math.cos(a) * 0.12); g.rotateX(Math.sin(a) * 0.12); g.translate(fx + Math.cos(a) * 4, H * 0.4, fz + Math.sin(a) * 4); sg.push(g); } // guy wires
    const m = new THREE.Mesh(mergeGeometries(sg.map((g) => g.index ? g.toNonIndexed() : g), false), triplanarMaterial('rusty_metal_02', { metres: 1.5, cls: 'rust', tint: 0x8a7464 }));
    m.castShadow = true; m.name = 'flare_stack'; root.add(m);
    G.level.flares = [new THREE.Vector3(fx, H + 1.4, fz)];
  }
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
  // under the workshop roof: a pipe bundle and a cable tray hugging the ceiling
  for (const [x, y, r] of [[14.6, 4.75, 0.14], [14.95, 4.8, 0.09], [19.3, 4.7, 0.18], [18.9, 4.82, 0.1]]) pipe(V(x, y, 0.2), V(x, y, -24.2), r);
  // ground-level runs (cover + trip hazards) on sleepers
  // ...with two gaps: the yard's south gates into the process unit
  for (const [x0, x1] of [[-20, -15], [-11, 3], [7, 12]]) { pipe(V(x0, 0.45, -28.5), V(x1, 0.45, -28.5), 0.32); pipe(V(x0, 0.4, -29.4), V(x1, 0.4, -29.4), 0.26); }
  const pm = new THREE.Mesh(mergeGeometries(pg.map((g) => g.index ? g.toNonIndexed() : g), false), pipeMat); pm.castShadow = pm.receiveShadow = true; pm.name = 'pipes'; root.add(pm);
  P.addShootable(pm, 'metal');
  for (const [x0, x1] of [[-20, -15], [-11, 3], [7, 12]]) P.addBox(V(x0, 0, -29.8), V(x1, 0.78, -28.1), 'metal');
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
