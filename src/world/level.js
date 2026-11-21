import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { instance, setRendererCaps } from './assets.js';
import { makeGround, PADS } from './ground.js';
import { triplanarMaterial } from '../mats/triplanar.js';
import { dress } from './scatter.js';
import { buildOutskirts, scatterModel } from './outskirts.js';
import { INTERIOR } from '../mats/patch.js';
import { ZONES, buildZones, boxGeo, ibeam } from './zones.js';
import { buildDecals, wearFor } from './decals.js';

// Abandoned desert refinery. Player starts at +Z looking -Z into the low sun (backlit, like
// target/t1). Three zones (zones.js): A the yard x∈[-21,19], z∈[-31,7] with the workshop corridor x∈[14,20];
// B the process unit to the south; C the tank farm to the west.
//   gantry (procedural steel) on the left throws the light shafts; pipe racks bridge the yard;
//   tanks + columns form the skyline; Hi3D props are cover.
export const LAYOUT = {
  spawn: new THREE.Vector3(0, 0, 3), spawnYaw: 0,
  bounds: { minX: -72, maxX: 22, minZ: -74, maxZ: 8 }, zones: ZONES,
  corridor: { minX: 14, maxX: 20, minZ: -24, maxZ: 0, h: 5.2 },
};

export async function buildLevel(G) {
  const R = G.R, P = G.phys, scene = R.scene;
  setRendererCaps(R.renderer);
  const have = new Set(await fetch('/models/index.json').then((r) => r.json()).catch(() => []));
  const root = new THREE.Group(); root.name = 'level'; scene.add(root);
  const ground = makeGround(320); root.add(ground);
  const explosives = [];

  const matSteel = triplanarMaterial('rusty_metal_02', { metres: 1.6, cls: 'rust', tint: 0xb8aa98 });
  const matConc = triplanarMaterial('concrete_floor_worn_001', { metres: 3.0, cls: 'concrete', metal: 0, tint: 0xd8cbb6 });
  const matWall = triplanarMaterial('rusty_metal_02', { metres: 2.6, cls: 'rust', tint: 0x8c7d70 });
  const steel = [], conc = [], wall = [], floor = [], grate = [], gas = [], pipes = [];
  const matGrate = triplanarMaterial('rusty_metal_02', { metres: 0.9, cls: 'rust', tint: 0x7d7268 });
  const matGas = triplanarMaterial('rusty_metal_02', { metres: 1.4, cls: 'paint', tint: 0xd9a92a });   // gas lines: yellow paint gone rusty
  const matPipe = triplanarMaterial('rusty_metal_02', { metres: 1.2, cls: 'rust', tint: 0xa89684 });
  const matFloor = triplanarMaterial('concrete_floor_worn_001', { metres: 2.2, cls: 'concrete', metal: 0, tint: 0x6e6257, rough: 0.85 });

  // ---------- gantry: 2 rows x 6 columns, 4 levels, the light-shaft maker ----------
  const gx0 = -19, gz = [-22, -17];
  for (let i = 0; i < 6; i++) for (const z of gz) { steel.push(...ibeam(12.5, 'y', gx0 + i * 3.2, 0, z)); P.addBoxCenter(new THREE.Vector3(gx0 + i * 3.2, 6, z), new THREE.Vector3(0.4, 12, 0.4), 'metal'); }
  for (let k = 0; k < 4; k++) {
    const y = 3 + k * 3;
    for (const z of gz) steel.push(...ibeam(16.4, 'x', gx0 + 8, y, z));
    for (let i = 0; i < 6; i++) steel.push(...ibeam(5, 'z', gx0 + i * 3.2, y, -19.5, 0.3));
    // grating deck on level 1 + 3 (thin slabs)
    if (k === 0 || k === 2) steel.push(boxGeo(16, 0.06, 5, gx0 + 8, y + 0.2, -19.5));
  }
  // diagonal braces (as long thin boxes)
  for (let i = 0; i < 5; i++) for (const z of gz) {
    const g = new THREE.BoxGeometry(0.16, 4.2, 0.16); g.rotateZ(i % 2 ? 0.82 : -0.82); g.translate(gx0 + 1.6 + i * 3.2, 4.5 + (i % 2) * 3, z); steel.push(g);
  }
  // ---------- corridor / workshop (interior volume) ----------
  const C = LAYOUT.corridor;
  INTERIOR.min.set(C.minX + 0.15, -1, C.minZ + 0.15); INTERIOR.max.set(C.maxX - 0.15, C.h - 0.1, C.maxZ - 0.15);
  G.R.setWet(PADS, new THREE.Vector4(C.minX + 0.2, C.minZ + 0.2, C.maxX - 0.2, C.maxZ - 0.2)); // leaking roof: puddled slab
  const wallT = 0.25;
  // outer wall x = maxX, inner wall x = minX with two openings (z in [-5,-2.6] and [-20,-17.6])
  wall.push(boxGeo(wallT, C.h, C.maxZ - C.minZ, C.maxX, C.h / 2, (C.minZ + C.maxZ) / 2));
  P.addBox(new THREE.Vector3(C.maxX - 0.2, 0, C.minZ), new THREE.Vector3(C.maxX + 0.3, C.h, C.maxZ), 'metal');
  const seg = [[C.minZ, -20], [-17.6, -13.4], [-9.6, -5], [-2.6, C.maxZ]];
  for (const [z0, z1] of seg) {
    wall.push(boxGeo(wallT, C.h, z1 - z0, C.minX, C.h / 2, (z0 + z1) / 2));
    P.addBox(new THREE.Vector3(C.minX - 0.2, 0, z0), new THREE.Vector3(C.minX + 0.2, C.h, z1), 'metal');
  }
  // lintels over the openings
  for (const [z0, z1] of [[-20, -17.6], [-5, -2.6], [-13.4, -9.6]]) wall.push(boxGeo(wallT, 1.6, z1 - z0, C.minX, C.h - 0.8, (z0 + z1) / 2));
  // end walls
  for (const z of [C.minZ, C.maxZ]) { wall.push(boxGeo(C.maxX - C.minX, C.h, wallT, (C.minX + C.maxX) / 2, C.h / 2, z)); P.addBox(new THREE.Vector3(C.minX, 0, z - 0.2), new THREE.Vector3(C.maxX, C.h, z + 0.2), 'metal'); }
  // roof with torn holes (gaps between panels let the low sun cut in as shafts)
  const roofPanels = [[-24, -21.2], [-20, -15.5], [-14.6, -11], [-9.2, -6.2], [-5, -1], [-0.6, 0]];
  for (const [z0, z1] of roofPanels) wall.push(boxGeo(C.maxX - C.minX + 0.4, 0.12, z1 - z0, (C.minX + C.maxX) / 2, C.h, (z0 + z1) / 2));
  for (let z = C.minZ + 1; z < C.maxZ; z += 3) steel.push(...ibeam(C.maxX - C.minX, 'x', (C.minX + C.maxX) / 2, C.h - 0.3, z, 0.26));
  // concrete floor slab inside
  floor.push(boxGeo(C.maxX - C.minX, 0.08, C.maxZ - C.minZ, (C.minX + C.maxX) / 2, 0.04, (C.minZ + C.maxZ) / 2));
  // ---------- perimeter: low concrete wall on the left, blast wall at the back right ----------
  // the yard's west wall has two gates into the tank farm: one onto its east-west lane, one to the pad
  const WG = [[-26, -22], [2, 6]];
  for (let z = -30; z < 6; z += 4) { const c = z + 2; if (WG.some(([a, b]) => c > a - 1.9 && c < b + 1.9)) continue; conc.push(boxGeo(0.5, 2.4, 3.9, -21.5, 1.2, c)); }
  for (const [z0, z1] of [[-31, -26], [-22, 2], [6, 7]]) P.addBox(new THREE.Vector3(-22, 0, z0), new THREE.Vector3(-21.2, 2.4, z1), 'concrete');
  for (const [a, b] of WG) for (const z of [a - 0.2, b + 0.2]) conc.push(boxGeo(0.7, 3.2, 0.7, -21.6, 1.6, z));  // gate posts
  // the yard's east edge (behind the workshop) stays closed
  P.addBox(new THREE.Vector3(19.9, 0, -31), new THREE.Vector3(20.9, 6, 7), 'concrete');

  const add = (list, mat, name) => {
    if (!list.length) return;
    const g = mergeGeometries(list.map((x) => x.index ? x.toNonIndexed() : x), false);
    g.computeVertexNormals?.();
    const m = new THREE.Mesh(g, mat); m.name = name; m.castShadow = m.receiveShadow = true; root.add(m);
    m.userData.surface = name === 'concrete' ? 'concrete' : 'metal';
    P.addShootable(m, m.userData.surface);
  };

  // ---------- Hi3D props ----------
  const place = async (name, x, z, ry = 0, opts = {}) => {
    const { s = 1, y = 0, col = true, shrink = 0.85, surface = 'metal', colH, big, mega } = opts;
    const o = await instance(name); o.position.set(x, y, z); o.rotation.y = ry; o.scale.setScalar(s); root.add(o);
    o.updateMatrixWorld(true);
    let colBox = null;
    if (col) {
      const bb = new THREE.Box3().setFromObject(o); const c = bb.getCenter(new THREE.Vector3()); const sz = bb.getSize(new THREE.Vector3());
      sz.x *= shrink; sz.z *= shrink; if (colH) { sz.y = colH; c.y = y + colH / 2; }
      colBox = P.addBoxCenter(c, sz, surface);
    }
    P.addShootable(o, surface);
    if (name === 'drums' || opts.explosive) { o.userData.explosive = { hp: 40, box: colBox }; o.traverse((m) => { m.userData.owner = o; }); explosives.push(o); }
    // storage tank that can go up: takes a grenade or a few magazines, then becomes a burning wreck
    if (big) { o.userData.explosive = { hp: mega ? 600 : 380, box: colBox, big: true, mega: !!mega }; o.traverse((m) => { m.userData.owner = o; }); explosives.push(o); }
    return o;
  };
  const optional = (n, ...a) => (have.has(n) ? [place(n, ...a)] : []);
  let fallTower = null; // the distillation column that comes down at the end
  const jobs = [
    // the process unit's big tank (zone B) and the skyline beyond the workshop
    place('tank', 14, -44, 0.4, { s: 1.35, surface: 'metal', big: true, shrink: 0.9 }), // east of the gate lane from the yard place('tank', 27, -26, 2.0, { s: 1.15 }),
    place('tower', -4, -46, 0.2, { s: 1.0 }).then((o) => { fallTower = o; return o; }), place('tower', 5, -52, 1.3, { s: 1.15 }),
    place('tank', 10.2, 2.6, 2.6, { s: 0.9, big: true }), place('tower', -18.4, -28.6, 0.8, { s: 0.75 }),
    place('valves', -14, 1.5, 2.2), place('barrier', -10.5, -1.5, 1.2, { surface: 'concrete' }),
    ...optional('pumpjack', -42, 10, 0.9, { s: 1.0 }), ...optional('pumpjack', 24, -38, 2.4, { s: 1.1 }),
    ...optional('container', 11.6, -19.5, 1.45, {}), ...optional('container', -15.5, -13.2, 0.15, {}), ...optional('container', 26, -14, 0.3, { col: false }),
    ...optional('generator', -16.2, -8.8, 1.6, {}), ...optional('generator', 7.6, -27.6, 0.2, {}),
    ...optional('spool', 2.8, -14, 0.7, {}), ...optional('sandbags', 4.6, -3.2, 0.1, { surface: 'concrete' }), ...optional('sandbags', -6.4, -17.8, 2.9, { surface: 'concrete' }),
    ...optional('scaffold', -13, -42, 0.4, {}),
    // pipe racks bridging the yard (overhead, walkable underneath: collide only legs)
    place('piperack', -6, -11.5, 0, { s: 1.35, col: false }), place('piperack', 3.6, -11.5, 0, { s: 1.35, col: false }),
    place('piperack', 22, -9, Math.PI / 2, { s: 1.3, col: false }),
    // cover
    place('barrier', 2.2, -6.5, 0.15, { surface: 'concrete' }), place('barrier', -5.5, -9.5, -0.35, { surface: 'concrete' }),
    place('barrier', 7.5, -16, 1.4, { surface: 'concrete' }), place('barrier', -1.5, -21.5, 0.05, { surface: 'concrete' }),
    place('barrier', 10.5, -25.5, -0.2, { surface: 'concrete' }), place('barrier', -12, -27, 0.4, { surface: 'concrete' }),
    place('hazard_fence', -11, -13.5, 0.5), place('hazard_fence', 10.5, -4.5, -1.2), place('hazard_fence', 3.5, -26.5, 0.1),
    place('drums', -8.5, -3.5, 0.6), place('drums', 4.8, -18.5, 2.2), place('drums', 17, -8, 0.3, { surface: 'metal' }),
    place('valves', -15.5, -7, 0.9), place('valves', 8.5, -22.5, -0.6),
    place('rubble', 7.2, -2, 0.4, { colH: 0.5, surface: 'concrete' }), place('rubble', -4, -29, 1.4, { colH: 0.5, surface: 'concrete' }), place('rubble', -17, -24, 2.4, { colH: 0.5, surface: 'concrete' }),
    place('stairs', -12.5, -19.5, Math.PI / 2, { s: 1.0 }),
    place('wall_broken', 16.9, -24.1, 0, { s: 1.4, col: false }),
    ...[-2.2, -6.4, -10.6, -14.8, -19.0, -23.0].map((z) => place('wall_broken', C.maxX - 0.22, z, -Math.PI / 2, { s: 1.15, col: false })),
    // inner face of the workshop wall: same rusted panel kit as the outer wall so both sides of the corridor read
    ...[[-22, 0.95], [-15.5, 1.0], [-7.3, 1.08], [-1.3, 0.62]].map(([z, s]) => place('wall_broken', C.minX + 0.22, z, Math.PI / 2, { s, col: false })),
    ...[-3.5, -9.5, -15.5, -21.5].map((z) => place('lamp', C.maxX - 0.3, z, -Math.PI / 2, { y: 3.2, col: false })),
    place('drums', 18.6, -12.5, 1.1), place('valves', 18.5, -17.5, -1.4), place('rubble', 15.4, -8, 0.5, { colH: 0.4, surface: 'concrete' }), place('rubble', 18.2, -3.5, 2, { colH: 0.4, surface: 'concrete' }),
  ];
  // ---------- zones B and C ----------
  const ctx = { G, P, root, steel, conc, grate, gas, pipes, place, optional, jobs, valveSpots: [['A', -6.8, -25.2, 0.15, 0]], lights: [], fences: [], crates: [], zones: {}, zone(id) { return (this.zones[id] ||= { steel: [], conc: [], grate: [], gas: [], pipes: [] }); } };
  buildZones(ctx);
  if (have.has('fence')) jobs.push(scatterModel(root, 'fence', ctx.fences, { shadow: false, inside: true }).then((f) => { // one mesh round the whole map: it would cast into the shadow map from everywhere
    // the colossus walks in through the fence: a section it steps on is flattened, outward, in a burst of dust
    if (!f) return; const down = new Set(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), sc = new THREE.Vector3();
    G.events.on('boss:step', (e) => { if (e.far) return; f.list.forEach((o, i) => { if (down.has(i) || Math.hypot(o.x - e.pos.x, o.z - e.pos.z) > 4.5) return; down.add(i);
      const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.cos(o.ry), 0, -Math.sin(o.ry)), (e.pos.x < o.x ? 1 : -1) * 1.45);
      for (const { im, local } of f.meshes) { m4.compose(p.set(o.x, o.y + 0.15, o.z), tilt.multiply(q.setFromAxisAngle(Y, o.ry)), sc.setScalar(o.s)).multiply(local); im.setMatrixAt(i, m4); im.instanceMatrix.needsUpdate = true; tilt.setFromAxisAngle(new THREE.Vector3(Math.cos(o.ry), 0, -Math.sin(o.ry)), (e.pos.x < o.x ? 1 : -1) * 1.45); }
      for (let k = 0; k < 14; k++) G.fxs?.emit(true, { pos: new THREE.Vector3(o.x + (G.rng() - 0.5) * 4, 0.4, o.z + (G.rng() - 0.5) * 1), vel: new THREE.Vector3((G.rng() - 0.5) * 4, 1 + G.rng() * 2, (G.rng() - 0.5) * 4), life: 2 + G.rng(), size: 0.6, size1: 2.8, col: G.fxs.litColor([0.5, 0.42, 0.32]), alpha: 0.45, soft: true, drag: 1.4 });
      G.audio?.play?.('clank', { pos: new THREE.Vector3(o.x, 1, o.z), ref: 10, gain: 1.2, rate: 0.7 }); }); });
  }));
  add(steel, matSteel, 'steel'); add(conc, matConc, 'concrete'); add(wall, matWall, 'wall'); add(floor, matFloor, 'concrete'); add(grate, matGrate, 'grating');
  add(pipes, matPipe, 'pipes'); add(gas, matGas, 'gas');
  for (const z of Object.values(ctx.zones)) { add(z.steel, matSteel, 'steel'); add(z.conc, matConc, 'concrete'); add(z.grate, matGrate, 'grating'); add(z.pipes, matPipe, 'pipes'); add(z.gas, matGas, 'gas'); }
  // dry shrubs (no collision)
  const shrubs = [[-19.5, 2], [-19.8, -10], [-14, 4.5], [12.4, 3.5], [-20, -29], [9, -29.5], [-8, -30], [13, -18.5], [-3, 5.5]];
  for (const [x, z] of shrubs) jobs.push(place('shrub', x, z, x * 1.7, { col: false, s: 0.8 + ((x * z) % 0.4 + 0.4) * 0.6, surface: 'wood' }));
  await Promise.all(jobs);

  // supply crates (olive boxes with a light strip): walk up to refill ammo + grenades
  const crateMat = triplanarMaterial('rusty_metal_02', { metres: 0.8, cls: 'paint', tint: 0x55603a }); const crates = [];
  const stripMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 3.2, 1.4), toneMapped: false });
  for (const [x, z, ry] of [[3.2, 5.2, 0.3], [-18.5, -12, 1.2], [9.5, -24.5, -0.4], ...ctx.crates]) {
    const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.6, 0.7), crateMat); b.position.y = 0.3; b.castShadow = b.receiveShadow = true;
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.72), stripMat); st.position.y = 0.5; g.add(b, st); g.position.set(x, 0, z); g.rotation.y = ry; root.add(g);
    P.addBoxCenter(new THREE.Vector3(x, 0.3, z), new THREE.Vector3(1.0, 0.6, 0.8), 'metal'); crates.push(new THREE.Vector3(x, 0, z));
  }
  // pressure-line valve stations (act objectives): Hi3D station + its handwheel on a pivot so it can turn
  const valves = [];
  for (const [id, x, z, ry, y0] of ctx.valveSpots) { // valve A (act 1), valve B on the gallery deck (act 1), the flare-line igniter (finale)
    if (!have.has('valve_station')) break;
    const st = await place('valve_station', x, z, ry, { surface: 'metal', shrink: 0.8, y: y0 });
    const bb = new THREE.Box3().setFromObject(st); const top = new THREE.Vector3(); bb.getCenter(top); top.y = bb.max.y;
    let wheel = null;
    if (have.has('valve_wheel')) {
      const w = await instance('valve_wheel'); const wb = new THREE.Box3().setFromObject(w).getSize(new THREE.Vector3());
      // the generated wheel carries its stub axle (longest axis): stand the axle up, disc on top, threaded stem through it
      const ax = wb.x > wb.y && wb.x > wb.z ? 'x' : wb.z > wb.y ? 'z' : 'y';
      if (ax === 'x') w.rotation.z = Math.PI / 2; else if (ax === 'z') w.rotation.x = -Math.PI / 2;
      wheel = new THREE.Group(); wheel.position.set(top.x, top.y - 0.1, top.z); root.add(wheel); wheel.add(w); wheel.updateMatrixWorld(true);
      const wb2 = new THREE.Box3().setFromObject(w), c = wb2.getCenter(new THREE.Vector3()).sub(wheel.position);
      w.position.x -= c.x; w.position.z -= c.z; w.position.y -= wb2.max.y - wheel.position.y;
    }
    // a small amber status lamp on the plinth: red until opened
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 0.6, 0.2), toneMapped: false }));
    lamp.position.set(top.x + Math.cos(ry) * 0.9, bb.min.y + 0.45, top.z - Math.sin(ry) * 0.9); root.add(lamp);
    valves.push({ id, pos: new THREE.Vector3(x, y0, z), top, station: st, wheel, lamp, open: false });
  }
  // practical lights for the workshop lamps: warm, unshadowed, with a hot bulb so bloom picks them up
  const bulbM = new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 5.2, 2.4), toneMapped: false });
  for (const z of [-3.5, -9.5, -15.5, -21.5]) {
    const l = new THREE.PointLight(new THREE.Color(1.0, 0.6, 0.3), 9, 8.5, 2); l.position.set(C.maxX - 0.75, 3.05, z); root.add(l); R.volLights.push(l);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), bulbM); b.position.set(C.maxX - 0.48, 3.12, z); root.add(b);
  }
  // floodlights: fixtures everywhere, but a fixed pool of three lights follows the camera to the nearest ones
  // (the light count never changes, so no shader ever recompiles)
  const floodM = new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 5.5, 2.6), toneMapped: false }), housing = [];
  for (const [p] of ctx.lights) { housing.push(boxGeo(0.9, 0.35, 0.5, p.x, p.y + 0.15, p.z)); const f = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.28), floodM); f.rotation.x = Math.PI / 2; f.position.set(p.x, p.y - 0.04, p.z); root.add(f); }
  add(housing, matSteel, 'steel');
  const floodPool = [0, 1, 2].map(() => { const l = new THREE.PointLight(0xffb36b, 0, 16, 1.6); scene.add(l); R.volLights.push(l); return l; });
  const padM = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 6, 2), toneMapped: false });
  for (const p of ctx.padLights || []) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), padM); m.position.copy(p); root.add(m); }
  // shadow casters: anything tall keeps casting (the long low-sun shadows across the yard come from the far structures);
  // small casters (rocks, grass, props under 4 m) only cast within 34 m of the camera — the shadow map spans the whole map
  const smallCasters = []; let castT = 0;
  function collectCasters() { root.updateMatrixWorld(true); root.traverse((o) => { if (!(o.isMesh || o.isInstancedMesh) || !o.castShadow) return; const bb = o.isInstancedMesh ? (o.computeBoundingBox(), o.boundingBox.clone().applyMatrix4(o.matrixWorld)) : new THREE.Box3().setFromObject(o); smallCasters.push({ o, bb, r: o.isInstancedMesh || bb.max.y - bb.min.y < 4 ? 34 : 70 }); }); } // instanced scatter: its own instance bounds, never the single rock's
  const _cp = new THREE.Vector3();
  function updateLights(cam, night) {
    if ((castT -= G.realDt || 1 / 60) <= 0) { castT = 0.35; for (const [m, bb, far] of G.level.scatterNear || []) { _cp.set(cam.x, 0, cam.z); m.visible = bb.distanceToPoint(_cp) < far; } for (const c of smallCasters) { _cp.set(cam.x, (c.bb.min.y + c.bb.max.y) / 2, cam.z); c.o.castShadow = c.bb.distanceToPoint(_cp) < c.r; } }
    const ranked = ctx.lights.map((L) => [L, L[0].distanceTo(cam)]).sort((a, b) => a[1] - b[1]);
    floodPool.forEach((l, i) => { const r = ranked[i]; if (!r) { l.intensity = 0; return; } const [L, d] = r; l.position.copy(L[0]); l.color.set(L[1]); l.distance = L[3]; l.intensity = L[2] * Math.max(0.15, night) * THREE.MathUtils.clamp((60 - d) / 20, 0, 1); });
  }
  G.level = { root, cover: [], layout: LAYOUT, explosives, fallTower, crates, valves, updateLights, floodPool, tankSpots: ctx.tankSpots, padLights: ctx.padLights };
  await dress(G, root);
  // ground wear: stains, cracks, tracks and sand on every slab; lane paint down the tank farm's roads; chevrons at the igniter
  { const ex = [], put = (c, x, z, sx, sz, ry) => ex.push({ c, x, z, sx, sz, ry });
    for (let z = -64; z < -8; z += 4) { if (z > -42 && z < -19) continue; put(8, -47, z, 4, 4, 0); put(9, -52.2, z, 4, 4, 0); put(9, -41.8, z, 4, 4, 0); }
    for (let x = -70; x < -24; x += 4) { if (x > -57 && x < -37) continue; put(8, x, -30, 4, 4, Math.PI / 2); }
    for (const [x, z, ry] of [[-38.5, -26, 0], [-36, -26, 0]]) put(13, x, z, 2.6, 2.6, ry);
    for (const [x, z] of [[-47, -24], [-47, -36], [-44, -55], [0, -58], [-12, -60], [10, -61], [-50, -12]]) put(14, x, z, 1.1, 1.1, 0);
    for (const [x, z, r] of [[-52, -33, 4], [-41, -38, 3], [-58, -22, 3.5]]) put(15, x, z, r, r, 0);
    buildDecals(G, root, wearFor(G.rng, PADS, ex)); }
  await buildOutskirts(G, root);
  R.fitShadow(new THREE.Box3(new THREE.Vector3(-78, -1, -84), new THREE.Vector3(32, 30, 16)));
  R.setInteriors([{ c: new THREE.Vector3((C.minX + C.maxX) / 2, C.h / 2, (C.minZ + C.maxZ) / 2), h: new THREE.Vector3((C.maxX - C.minX) / 2, C.h / 2, (C.maxZ - C.minZ) / 2) }]);
  root.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh) { o.matrixAutoUpdate = false; o.updateMatrix(); } });
  collectCasters();
  // cover points (both sides of each cover object), used by the AI
  const cover = [];
  for (const b of P.boxes) {
    const h = b.max.y - b.min.y; if (h < 0.9 || h > 2.6) continue;
    const c = new THREE.Vector3((b.min.x + b.max.x) / 2, 0, (b.min.z + b.max.z) / 2);
    const ex = (b.max.x - b.min.x) / 2 + 0.7, ez = (b.max.z - b.min.z) / 2 + 0.7;
    cover.push(c.clone().add(new THREE.Vector3(0, 0, -ez)), c.clone().add(new THREE.Vector3(0, 0, ez)), c.clone().add(new THREE.Vector3(-ex, 0, 0)), c.clone().add(new THREE.Vector3(ex, 0, 0)));
  }
  G.level.cover = cover.filter((p) => !P.blocked(p.x, p.z, 0.4));
  return G.level;
}
