import * as THREE from 'three';
import { triplanarMaterial } from '../mats/triplanar.js';

// The two zones that open off the yard.
//   B  PROCESS UNIT (south): a two-storey pipe gallery the player climbs (valve B sits on its deck), the
//      distillation columns, a control cabin and a substation; yellow gas lines that vent when shot.
//   C  TANK FARM (west): four big storage tanks in bunded pits with lanes between them wide enough for the
//      colossus to walk, an LPG sphere at the south end, the flare-line igniter at the crossroads and the
//      extraction pad at the north end.
// Everything walkable above ground is AABB boxes in the physics (stairs are one box per step, decks are
// slabs); the robots' nav grid only sees the ground floor, so decks and stairs are the player's high ground.
export const ZONES = [
  { id: 'A', minX: -21, maxX: 19.4, minZ: -31, maxZ: 7 },
  { id: 'B', minX: -24, maxX: 22, minZ: -74, maxZ: -31 },
  { id: 'C', minX: -72, maxX: -22, minZ: -66, maxZ: 8 },
];
export const inZones = (x, z, m = 0) => ZONES.some((r) => x > r.minX - m && x < r.maxX + m && z > r.minZ - m && z < r.maxZ + m);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export function boxGeo(w, h, d, x, y, z, ry = 0) { const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); g.translate(x, y, z); return g; }
export function ibeam(len, axis, x, y, z, s = 0.36) {
  const t = 0.04, out = [];
  const f = (w, h, d, ox, oy, oz) => out.push(boxGeo(w, h, d, x + ox, y + oy, z + oz));
  if (axis === 'y') { f(s, len, t, 0, len / 2, s / 2 - t / 2); f(s, len, t, 0, len / 2, -s / 2 + t / 2); f(t, len, s - 2 * t, 0, len / 2, 0); }
  else if (axis === 'x') { f(len, t, s, 0, s / 2 - t / 2, 0); f(len, t, s, 0, -s / 2 + t / 2, 0); f(len, s - 2 * t, t, 0, 0, 0); }
  else { f(s, t, len, 0, s / 2 - t / 2, 0); f(s, t, len, 0, -s / 2 + t / 2, 0); f(t, s - 2 * t, len, 0, 0, 0); }
  return out;
}
// a straight cylinder between two points
export function tube(a, b, r, seg = 16) {
  const d = b.clone().sub(a), L = d.length(); const g = new THREE.CylinderGeometry(r, r, L, seg, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize())); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); return g;
}

export function buildZones(ctx) {
  const { P, place, optional, jobs, lights } = ctx;
  // each zone gets its own merged meshes (so the renderer can cull them, and their shadows, by distance)
  let steel, conc, grate, gas, pipes; const zone = (id) => ({ steel, conc, grate, gas, pipes } = ctx.zone(id));
  // ---------- kit ----------
  // open steel stairs: treads + stringers to look at, one solid box per step to walk on (rise 0.3 <= step-up 0.45)
  function stairs(x, z, dir, rise, w = 1.3) {
    const n = Math.ceil(rise / 0.3), h = rise / n, run = 0.42, dx = dir === 'x+' ? 1 : dir === 'x-' ? -1 : 0, dz = dir === 'z+' ? 1 : dir === 'z-' ? -1 : 0;
    const across = dx ? 'z' : 'x';
    for (let i = 0; i < n; i++) {
      const c = V(x + dx * (i + 0.5) * run, 0, z + dz * (i + 0.5) * run), top = (i + 1) * h;
      const sx = dx ? run : w, sz = dz ? run : w;
      grate.push(boxGeo(sx, 0.05, sz, c.x, top - 0.025, c.z));
      P.addBox(V(c.x - sx / 2, 0, c.z - sz / 2), V(c.x + sx / 2, top, c.z + sz / 2), 'metal');
      // the handrails are solid: one short wall per step on each side of the flight
      for (const sd of [-1, 1]) { const ox = dx ? 0 : sd * (w / 2 + 0.06), oz = dz ? 0 : sd * (w / 2 + 0.06), hx = dx ? sx / 2 : 0.04, hz = dz ? sz / 2 : 0.04; P.addBox(V(c.x + ox - hx, top, c.z + oz - hz), V(c.x + ox + hx, top + 1.05, c.z + oz + hz), 'metal'); }
    }
    // stringers: two sloped plates along the flight, plus hand rails
    const L = n * run, ang = Math.atan2(rise, L), len = Math.hypot(rise, L);
    for (const s of [-1, 1]) {
      const ox = across === 'x' ? s * (w / 2 + 0.03) : 0, oz = across === 'z' ? s * (w / 2 + 0.03) : 0;
      const mid = V(x + dx * L / 2 + ox, rise / 2, z + dz * L / 2 + oz);
      const st = new THREE.BoxGeometry(dx ? len : 0.05, 0.28, dz ? len : 0.05); if (dx) st.rotateZ(dx * ang); else st.rotateX(-dz * ang); st.translate(mid.x, mid.y - 0.1, mid.z); steel.push(st);
      const rl = new THREE.BoxGeometry(dx ? len : 0.05, 0.05, dz ? len : 0.05); if (dx) rl.rotateZ(dx * ang); else rl.rotateX(-dz * ang); rl.translate(mid.x, mid.y + 1.0, mid.z); steel.push(rl);
      for (let k = 0; k <= n; k += 3) { const px = x + dx * k * run + ox, pz = z + dz * k * run + oz; steel.push(boxGeo(0.05, 1.05, 0.05, px, k * h + 0.52, pz)); }
    }
    return V(x + dx * L, rise, z + dz * L);
  }
  // a walkable grating deck with a kick plate; rails are added per edge with gaps where stairs arrive
  function deck(x0, x1, z0, z1, y) {
    grate.push(boxGeo(x1 - x0, 0.08, z1 - z0, (x0 + x1) / 2, y - 0.04, (z0 + z1) / 2));
    P.addBox(V(x0, y - 0.18, z0), V(x1, y, z1), 'metal');
  }
  function rail(a, b, y, gaps = []) { // along x or z, posts every 1.5 m, two rails, physics wall 1.05 m
    const alongX = Math.abs(b.x - a.x) > Math.abs(b.z - a.z), L = alongX ? b.x - a.x : b.z - a.z, s = Math.sign(L);
    let cur = 0; const cuts = gaps.map(([g0, g1]) => [Math.min(g0, g1), Math.max(g0, g1)]).sort((p, q) => p[0] - q[0]);
    const runs = []; const at = (t) => (alongX ? a.x + t * s : a.z + t * s);
    let t0 = 0; for (const [g0, g1] of cuts) { const u0 = (g0 - (alongX ? a.x : a.z)) * s, u1 = (g1 - (alongX ? a.x : a.z)) * s; runs.push([t0, Math.min(u0, u1)]); t0 = Math.max(u0, u1); } runs.push([t0, Math.abs(L)]);
    for (const [r0, r1] of runs) { if (r1 - r0 < 0.3) continue;
      const m0 = at(r0), m1 = at(r1), mid = (m0 + m1) / 2, len = Math.abs(m1 - m0);
      for (const hh of [0.5, 1.05]) steel.push(alongX ? boxGeo(len, 0.05, 0.05, mid, y + hh, a.z) : boxGeo(0.05, 0.05, len, a.x, y + hh, mid));
      steel.push(alongX ? boxGeo(len, 0.12, 0.02, mid, y + 0.06, a.z) : boxGeo(0.02, 0.12, len, a.x, y + 0.06, mid));
      for (let k = r0; k <= r1 + 1e-3; k += 1.5) { const p = at(k); steel.push(alongX ? boxGeo(0.05, 1.05, 0.05, p, y + 0.52, a.z) : boxGeo(0.05, 1.05, 0.05, a.x, y + 0.52, p)); }
      if (alongX) P.addBox(V(Math.min(m0, m1), y, a.z - 0.05), V(Math.max(m0, m1), y + 1.05, a.z + 0.05), 'metal'); else P.addBox(V(a.x - 0.05, y, Math.min(m0, m1)), V(a.x + 0.05, y + 1.05, Math.max(m0, m1)), 'metal');
    }
    void cur;
  }
  // a run of pipes on sleepers at ground level: low cover with gaps; yellow ones are gas lines that vent when shot
  function groundRun(a, b, ys, gaps = [], col = true) {
    const alongX = Math.abs(b.x - a.x) > Math.abs(b.z - a.z);
    const segs = []; let s0 = alongX ? a.x : a.z; const e = alongX ? b.x : b.z;
    for (const [g0, g1] of gaps) { segs.push([s0, g0]); s0 = g1; } segs.push([s0, e]);
    for (const [u0, u1] of segs) {
      const p0 = alongX ? V(u0, 0, a.z) : V(a.x, 0, u0), p1 = alongX ? V(u1, 0, a.z) : V(a.x, 0, u1);
      ys.forEach(([y, r, off, isGas], i) => { const o = alongX ? V(0, y, off) : V(off, y, 0); (isGas ? gas : pipes).push(tube(p0.clone().add(o), p1.clone().add(o), r)); void i; });
      for (let u = u0 + 1; u < u1; u += 3) conc.push(alongX ? boxGeo(0.3, 0.25, 1.6, u, 0.125, a.z) : boxGeo(1.6, 0.25, 0.3, a.x, 0.125, u)); // sleepers
      if (col) { const top = Math.max(...ys.map(([y, r]) => y + r)); if (alongX) P.addBox(V(u0, 0, a.z - 0.75), V(u1, top, a.z + 0.75), 'metal'); else P.addBox(V(a.x - 0.75, 0, u0), V(a.x + 0.75, top, u1), 'metal'); }
    }
  }
  // perimeter: invisible wall + a visible fence line (Hi3D fence sections when available)
  function perimeter(a, b) {
    const d = b.clone().sub(a), L = d.length(), alongX = Math.abs(d.x) > Math.abs(d.z);
    if (alongX) P.addBox(V(Math.min(a.x, b.x), 0, a.z - 0.25), V(Math.max(a.x, b.x), 6, a.z + 0.25), 'metal'); else P.addBox(V(a.x - 0.25, 0, Math.min(a.z, b.z)), V(a.x + 0.25, 6, Math.max(a.z, b.z)), 'metal');
    const n = Math.max(1, Math.round(L / 4)); const ry = alongX ? 0 : Math.PI / 2;
    for (let i = 0; i < n; i++) { const p = a.clone().lerp(b, (i + 0.5) / n); ctx.fences.push({ x: p.x, y: 0, z: p.z, s: L / n / 4, ry }); }
  }

  // =================== B: PROCESS UNIT ===================
  zone('B');
  const GZ0 = -61.5, GZ1 = -58.5, DY = 4.5, GX0 = -21.5, GX1 = 19.5;
  // gallery: bents every 6 m, three levels of beams, the deck on the middle one
  for (let x = GX0; x <= GX1 + 0.01; x += 6) {
    for (const z of [GZ0 - 0.15, GZ1 + 0.15]) { steel.push(...ibeam(8, 'y', x, 0, z, 0.34)); P.addBoxCenter(V(x, 4, z), V(0.4, 8, 0.4), 'metal'); }
    for (const y of [2.2, DY - 0.25, 7.7]) steel.push(...ibeam(GZ1 - GZ0 + 0.7, 'z', x, y, (GZ0 + GZ1) / 2, 0.3));
    if (x < GX1 - 1) for (const z of [GZ0 - 0.15, GZ1 + 0.15]) { const g = new THREE.BoxGeometry(0.14, 4.3, 0.14); g.rotateZ(((x / 6) | 0) % 2 ? 0.95 : -0.95); g.translate(x + 3, 6, z); steel.push(g); } // knee braces on the top storey
  }
  for (const y of [2.2, DY - 0.25, 7.7]) for (const z of [GZ0 - 0.15, GZ1 + 0.15]) steel.push(...ibeam(GX1 - GX0, 'x', (GX0 + GX1) / 2, y, z, 0.3));
  deck(GX0, GX1, GZ0, GZ1, DY);
  // pipes: a bundle hanging under the deck, chest-high runs along both deck edges (cover up there), a top bundle
  for (const [y, z, r, g] of [[2.55, -61.0, 0.22, false], [2.6, -60.3, 0.3, true], [2.5, -59.5, 0.18, false], [2.62, -58.9, 0.26, false]]) (g ? gas : pipes).push(tube(V(GX0 - 2, y, z), V(GX1 + 2, y, z), r));
  for (const [y, z, r, g] of [[8.05, -61.0, 0.3, false], [8.1, -60.2, 0.36, false], [8.0, -59.3, 0.22, true]]) (g ? gas : pipes).push(tube(V(GX0 - 2, y, z), V(GX1 + 2, y, z), r));
  const edgeGaps = [[-20.1, -17.9], [-1.2, 1.2], [15.9, 18.1]]; // sorted west to east
  for (const [z, s] of [[GZ0 + 0.3, -1], [GZ1 - 0.3, 1]]) {
    let x0 = GX0; for (const [g0, g1] of [...edgeGaps, [GX1, GX1]]) { if (g0 - x0 > 0.5) { const isGas = s > 0; (isGas ? gas : pipes).push(tube(V(x0, DY + 0.75, z), V(g0, DY + 0.75, z), 0.28)); pipes.push(tube(V(x0, DY + 0.35, z + s * 0.05), V(g0, DY + 0.35, z + s * 0.05), 0.16)); P.addBox(V(x0, DY, z - 0.3), V(g0, DY + 1.05, z + 0.3), 'metal'); } x0 = g1; }
  }
  rail(V(GX0, 0, GZ0), V(GX0, 0, GZ1), DY); rail(V(GX1, 0, GZ0), V(GX1, 0, GZ1), DY);
  // two flights up from the north side, one from the south: the deck is reachable from either zone
  stairs(-19, -52.0, 'z-', DY); stairs(17, -52.0, 'z-', DY); stairs(0, GZ0 - 15 * 0.42 - 0.05, 'z+', DY); // each flight lands flush on the deck edge
  // valve B: on the deck, wheel up
  ctx.valveSpots.push(['B', 5, -60, Math.PI / 2, DY]);
  // ground gas header between the yard and the unit: low cover with gaps lined up with the yard's south gates
  groundRun(V(-22, 0, -36), V(20, 0, -36), [[0.42, 0.3, -0.35, true], [0.36, 0.24, 0.35, false]], [[-15, -11], [3, 7], [13, 15]]);
  // substation: transformers in a fenced pen, the control cabin, pump skids along the gallery
  jobs.push(...optional('cabin', 12.5, -69.5, 0, { s: 1, shrink: 0.9 }), ...optional('transformer', -15.5, -68.5, 0.1, {}), ...optional('transformer', -10.5, -68.8, -0.1, {}),
    ...optional('pump_skid', -9, -55, Math.PI / 2, {}), ...optional('pump_skid', 10.5, -54.5, Math.PI / 2, {}), ...optional('pump_skid', -14, -64.5, 0, {}),
    ...optional('gas_rack', 3, -64.5, 0, { explosive: true }), ...optional('gas_rack', -20.5, -45, Math.PI / 2, { explosive: true }), ...optional('gas_rack', 12, -49.5, -Math.PI / 2, { explosive: true }));
  jobs.push(place('container', -16, -40.5, 0.05, {}), place('container', -12, -45, 0.05, {}), place('barrier', -3, -41, 0.3, { surface: 'concrete' }), place('barrier', 12, -57, -0.2, { surface: 'concrete' }),
    place('barrier', -8, -70, 0.1, { surface: 'concrete' }), place('sandbags', 2, -44, 0.4, { surface: 'concrete' }), place('sandbags', -11, -49, 1.6, { surface: 'concrete' }),
    place('drums', 9, -46, 0.4), place('drums', -6, -66, 1.2), place('drums', 18, -64, 2.1), place('valves', -2, -55.5, 0.3), place('valves', 11, -63.5, 1.2),
    place('generator', 18, -38.5, Math.PI / 2, {}), place('spool', -12, -37.5, 0.6, {}), place('rubble', 4, -70, 0.7, { colH: 0.5, surface: 'concrete' }), place('hazard_fence', -1, -50, 0.1),
    place('lamp', -21.3, -56, Math.PI / 2, { y: 3.4, col: false }), place('lamp', 19.3, -56, -Math.PI / 2, { y: 3.4, col: false }));
  // pump drops: pipes come down off the under-deck bundle into the pump skids, with an elbow at the bottom
  for (const [x, z] of [[-9, -55], [10.5, -54.5]]) { pipes.push(tube(V(x, 2.55, -58.6), V(x, 2.55, z - 1.6), 0.16), tube(V(x, 2.55, z - 1.6), V(x, 0.7, z - 1.6), 0.16)); gas.push(tube(V(x + 0.6, 2.6, -58.6), V(x + 0.6, 1.0, -58.6), 0.12)); }
  // cable tray along the top of the gallery, with drops at every bent
  steel.push(boxGeo(GX1 - GX0, 0.08, 0.6, (GX0 + GX1) / 2, 7.95, GZ0 + 0.1), boxGeo(GX1 - GX0, 0.18, 0.04, (GX0 + GX1) / 2, 8.05, GZ0 - 0.2), boxGeo(GX1 - GX0, 0.18, 0.04, (GX0 + GX1) / 2, 8.05, GZ0 + 0.4));
  // the substation pen: transformers behind a hazard fence; the cabin's apron with a stack of pallets and drums
  jobs.push(place('hazard_fence', -15, -65.2, 0, { col: true }), place('hazard_fence', -9.5, -65.2, 0.05, { col: true }), place('hazard_fence', -19.2, -68.5, Math.PI / 2, { col: true }),
    place('drums', 7.5, -66.5, 0.4), place('drums', 16, -71.5, 2.2), place('spool', 9, -72, 1.2, {}), place('sandbags', -3, -36.5, 0.1, { surface: 'concrete' }), place('sandbags', 14, -42.5, 1.4, { surface: 'concrete' }),
    place('barrier', -20, -58, Math.PI / 2, { surface: 'concrete' }), place('barrier', 20.5, -61, Math.PI / 2, { surface: 'concrete' }), place('rubble', -6, -51.5, 2.2, { colH: 0.45, surface: 'concrete' }), place('valves', -12, -60, 0.4));
  ctx.crates.push([-3.5, -52, 0.3], [14, -70, 1.4]);
  // floodlights on the gallery: warm sodium pools on the ground floor (they also scatter in the volume)
  for (const x of [-15.5, 2.5, 14.5]) lights.push([V(x, 7.2, GZ1 + 0.6), 0xffb36b, 26, 16]);

  // =================== C: TANK FARM ===================
  zone('C');
  const TANKS = [[-29, -10], [-65, -10], [-29, -50], [-65, -50]]; // lanes: 22 m north-south, 26 m east-west (the colossus is ~16 m across)
  ctx.tankSpots = TANKS;
  for (const [x, z] of TANKS) {
    jobs.push(place('tank', x, z, x * 0.37 + z, { s: 1.1, big: true, shrink: 0.92 }));
    // bund: a 1 m concrete wall round each tank pit, a step-gap on the lane sides
    const h = 1.0, r = 7;
    for (const [ax, az, bx, bz] of [[-r, -r, r, -r], [-r, r, r, r], [-r, -r, -r, r], [r, -r, r, r]]) {
      const alongX = az === bz, len = 2 * r, mx = x + (ax + bx) / 2, mz = z + (az + bz) / 2;
      // a 2.4 m gap in the middle of each side so the pits can be entered on foot
      for (const sgn of [-1, 1]) { const segL = (len - 2.4) / 2, off = sgn * (1.2 + segL / 2);
        const cx = alongX ? mx + off : mx, cz = alongX ? mz : mz + off;
        conc.push(alongX ? boxGeo(segL, h, 0.4, cx, h / 2, cz) : boxGeo(0.4, h, segL, cx, h / 2, cz));
        P.addBoxCenter(V(cx, h / 2, cz), alongX ? V(segL, h, 0.4) : V(0.4, h, segL), 'concrete'); }
    }
  }
  // the LPG sphere: the biggest thing that can go up in the whole refinery
  jobs.push(...optional('horton_sphere', -47, -59.5, 0.3, { s: 0.9, big: true, mega: true, shrink: 0.7 }));
  // overhead racks crossing the lanes (the colossus walks under — and through — them)
  jobs.push(place('piperack', -47, -8, Math.PI / 2, { s: 1.35, col: false }), place('piperack', -47, -48, Math.PI / 2, { s: 1.35, col: false }), place('piperack', -31, -30, 0, { s: 1.35, col: false }));
  // flare-line igniter at the crossroads; the trench it feeds runs west down the lane
  ctx.valveSpots.push(['IGN', -38, -23.5, Math.PI, 0]);
  groundRun(V(-70, 0, -31.2), V(-40, 0, -31.2), [[0.4, 0.32, 0, true]], [], false);
  // extraction pad: a concrete slab with a painted ring, edge lights
  const padM = triplanarMaterial('concrete_floor_worn_001', { metres: 3, cls: 'concrete', metal: 0, tint: 0xb8ab98 });
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 7.8, 0.12, 48), padM); pad.position.set(-47, 0.06, 1); pad.receiveShadow = true; ctx.root.add(pad);
  const ringTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d'); x.strokeStyle = '#e8d070'; x.lineWidth = 22; x.beginPath(); x.arc(256, 256, 220, 0, 7); x.stroke(); x.fillStyle = '#e8d070'; x.font = 'bold 300px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('H', 256, 270); return new THREE.CanvasTexture(c); })();
  ringTex.colorSpace = THREE.SRGBColorSpace;
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshStandardMaterial({ map: ringTex, transparent: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 })); ring.rotation.x = -Math.PI / 2; ring.position.set(-47, 0.125, 1); ring.receiveShadow = true; ctx.root.add(ring);
  ctx.padLights = []; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; ctx.padLights.push(V(-47 + Math.cos(a) * 7.4, 0.2, 1 + Math.sin(a) * 7.4)); }
  // tank inlets over the bund into the lane-side headers (low cover lines with a gap where the lanes cross; one gas line in each)
  for (const [x, z] of TANKS) { const sx = x > -47 ? -1 : 1, x0 = x + sx * 4.6, x1 = x + sx * 8.1; pipes.push(tube(V(x0, 1.3, z + 2), V(x1, 1.3, z + 2), 0.2), tube(V(x1, 1.3, z + 2), V(x1, 0.55, z + 2), 0.2)); gas.push(tube(V(x0, 0.9, z - 2), V(x1, 0.9, z - 2), 0.14));
    jobs.push(place('valves', x1 + sx * 0.2, z - 2.8, sx > 0 ? Math.PI / 2 : -Math.PI / 2)); }
  for (const hx of [-38.6, -55.4]) groundRun(V(hx, 0, -62), V(hx, 0, -4), [[0.42, 0.28, 0, false], [0.36, 0.22, hx > -47 ? -0.5 : 0.5, true]], [[-38, -22], [-14, -11], [-49, -46]]);
  ctx.crates.push([-44, -26, 0.4], [-57, 4, 1.1]);
  // sandbag nests at the lane corners, drums and a spool by the bunds
  jobs.push(place('sandbags', -43, -40.5, 0.7, { surface: 'concrete' }), place('sandbags', -51.5, -19.5, 2.4, { surface: 'concrete' }), place('drums', -37, -42, 0.9), place('drums', -57, -17.5, 2.2),
    place('spool', -50, -64, 0.4, {}), place('barrier', -59, -38, 0.2, { surface: 'concrete' }), place('barrier', -36, -20.5, 1.2, { surface: 'concrete' }));
  // cover in the lanes and round the pad
  jobs.push(place('container', -66, 3, 0.1, {}), place('container', -66, -2.6, 0.05, {}), place('container', -28, 4, Math.PI / 2, {}), place('container', -68, -30, Math.PI / 2 + 0.1, {}),
    place('barrier', -47, -20.5, 0.1, { surface: 'concrete' }), place('barrier', -44, -37, 1.4, { surface: 'concrete' }), place('barrier', -51, -33, 0.3, { surface: 'concrete' }), place('barrier', -28, -29, 1.6, { surface: 'concrete' }),
    place('sandbags', -40, -3, 0.2, { surface: 'concrete' }), place('sandbags', -55, -5, 2.8, { surface: 'concrete' }), place('drums', -52, -24, 0.7), place('drums', -42, -35, 1.9), place('drums', -64, -32, 0.2),
    place('generator', -26.5, -20, 0, {}), place('valves', -28, -40, 1.2), place('rubble', -57, -64, 0.3, { colH: 0.5, surface: 'concrete' }), place('hazard_fence', -37, -62, 0.6),
    ...optional('pump_skid', -52, -38, 0, {}), ...optional('transformer', -28, -59, 0, {}), ...optional('gas_rack', -41, -18, Math.PI / 2, { explosive: true }), ...optional('gas_rack', -56, -63, 0, { explosive: true }));
  // flood poles at the four corners of the crossroads
  for (const [x, z] of [[-39, -19], [-55, -19], [-39, -41], [-55, -41]]) { steel.push(...ibeam(8.6, 'y', x, 0, z, 0.3)); P.addBoxCenter(V(x, 4.3, z), V(0.35, 8.6, 0.35), 'metal'); lights.push([V(x + (x > -47 ? -0.6 : 0.6), 8.6, z), 0xffb36b, 22, 20]); }

  // =================== perimeter ===================
  zone('P');
  const W = [[V(-72, 0, 8), V(-22, 0, 8)], [V(-72, 0, -66), V(-72, 0, 8)], [V(-72, 0, -66), V(-24, 0, -66)], [V(-24, 0, -74), V(-24, 0, -66)], [V(-24, 0, -74), V(22, 0, -74)], [V(22, 0, -74), V(22, 0, -31)], [V(19.9, 0, -31), V(22, 0, -31)], [V(-22, 0, 7.6), V(19.4, 0, 7.6)]];
  for (const [a, b] of W) perimeter(a, b);
}
