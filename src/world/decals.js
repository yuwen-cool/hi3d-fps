import * as THREE from 'three';

// Ground wear: oil stains, tyre tracks, faded lane paint, cracks, sand drifts, scorch marks and drain grates,
// laid flat on the ground as one instanced, scene-lit mesh. The art is drawn procedurally into a 4x4 atlas.
//   cells: 0-3 oil stains, 4-5 tyre tracks, 6-7 cracks, 8 lane dash, 9 edge line, 10-12 sand drifts, 13 chevrons, 14 drain, 15 scorch
const CELL = 256, N = 4;
function drawAtlas(rnd) {
  const cv = document.createElement('canvas'); cv.width = cv.height = CELL * N; const x = cv.getContext('2d');
  const at = (i) => [(i % N) * CELL, Math.floor(i / N) * CELL];
  const blob = (cx, cy, r, col, a, k = 18) => { x.save(); x.translate(cx, cy); x.beginPath(); for (let j = 0; j <= k; j++) { const t = j / k * Math.PI * 2, rr = r * (0.7 + 0.3 * Math.sin(t * 3 + rnd() * 6) + 0.15 * rnd()); x.lineTo(Math.cos(t) * rr, Math.sin(t) * rr); } x.closePath(); x.fillStyle = col; x.globalAlpha = a; x.fill(); x.restore(); };
  const soft = (cx, cy, r, col, a) => { const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, col.replace('A', a)); g.addColorStop(1, col.replace('A', 0)); x.fillStyle = g; x.fillRect(cx - r, cy - r, 2 * r, 2 * r); };
  // oil: a dark core with a softer rim and drips
  for (let i = 0; i < 4; i++) { const [ox, oy] = at(i), c = CELL / 2; soft(ox + c, oy + c, c * 0.9, 'rgba(18,14,10,A)', 0.55); for (let k = 0; k < 6; k++) blob(ox + c + (rnd() - 0.5) * 70, oy + c + (rnd() - 0.5) * 70, 20 + rnd() * 45, '#0c0906', 0.55); blob(ox + c, oy + c, 40 + i * 10, '#070504', 0.7); }
  // tyre tracks: two treaded bands running the length of the cell
  for (const i of [4, 5]) { const [ox, oy] = at(i); x.save(); x.beginPath(); x.rect(ox, oy, CELL, CELL); x.clip();
    for (const bx of [70, 186]) { for (let y = 0; y < CELL; y += 2) { const sw = i === 5 ? Math.sin(y / 40) * 6 : 0; x.globalAlpha = 0.07 + 0.05 * Math.sin(y * 0.3 + bx) + 0.04 * rnd(); x.fillStyle = '#1c150e'; x.fillRect(ox + bx - 17 + sw, oy + y, 34, 2);
      if (y % 8 === 0) { x.globalAlpha = 0.06; x.fillRect(ox + bx - 15 + sw, oy + y, 30, 1); } } } // a worn band, the tread only a faint rhythm in it
    x.restore(); }
  // cracks: a branching random walk
  for (const i of [6, 7]) { const [ox, oy] = at(i); x.strokeStyle = '#120d09'; x.lineCap = 'round';
    const walk = (px, py, a, len, w, d) => { x.lineWidth = w; x.globalAlpha = 0.75; x.beginPath(); x.moveTo(ox + px, oy + py); for (let k = 0; k < len; k++) { a += (rnd() - 0.5) * 0.7; px += Math.cos(a) * 6; py += Math.sin(a) * 6; x.lineTo(ox + px, oy + py); if (d < 2 && rnd() < 0.06) walk(px, py, a + (rnd() - 0.5) * 2, len * 0.4, w * 0.6, d + 1); } x.stroke(); };
    walk(20, CELL / 2, 0, 40, 3, 0); }
  // lane paint, worn: a dash and an edge line (paint flaked off in patches)
  for (const [i, w, dash] of [[8, 26, true], [9, 16, false]]) { const [ox, oy] = at(i); x.globalAlpha = 0.42; x.fillStyle = '#a88a42'; x.fillRect(ox + CELL / 2 - w / 2, oy + (dash ? 30 : 0), w, dash ? CELL - 60 : CELL);
    x.globalCompositeOperation = 'destination-out'; for (let k = 0; k < 700; k++) { x.globalAlpha = 0.35 * rnd(); x.fillRect(ox + CELL / 2 + (rnd() - 0.5) * w * 1.3, oy + rnd() * CELL, 1 + rnd() * 3, 1 + rnd() * 6); } x.globalCompositeOperation = 'source-over'; } // worn by traffic: fine scuffs, not holes
  // sand drifts: pale soft heaps of blown sand that soften the concrete edges
  for (const i of [10, 11, 12]) { const [ox, oy] = at(i); for (let k = 0; k < 14; k++) soft(ox + 40 + rnd() * 176, oy + 40 + rnd() * 176, 30 + rnd() * 60, 'rgba(196,150,100,A)', 0.35); }
  // chevrons, worn
  { const [ox, oy] = at(13); x.save(); x.beginPath(); x.rect(ox + 8, oy + 70, CELL - 16, 116); x.clip(); x.fillStyle = '#16120d'; x.globalAlpha = 0.85; x.fillRect(ox, oy, CELL, CELL); x.fillStyle = '#d9b23a';
    for (let k = -4; k < 8; k++) { x.beginPath(); x.moveTo(ox + k * 40, oy + 70); x.lineTo(ox + k * 40 + 20, oy + 70); x.lineTo(ox + k * 40 + 136, oy + 186); x.lineTo(ox + k * 40 + 116, oy + 186); x.fill(); } x.restore();
    x.globalCompositeOperation = 'destination-out'; for (let k = 0; k < 160; k++) { x.globalAlpha = 0.5 * rnd(); x.beginPath(); x.arc(ox + rnd() * CELL, oy + 70 + rnd() * 116, 2 + rnd() * 8, 0, 7); x.fill(); } x.globalCompositeOperation = 'source-over'; }
  // drain grate
  { const [ox, oy] = at(14), c = CELL / 2; x.globalAlpha = 0.95; x.fillStyle = '#2a2622'; x.beginPath(); x.arc(ox + c, oy + c, 90, 0, 7); x.fill(); x.fillStyle = '#0a0807'; for (let k = -3; k <= 3; k++) x.fillRect(ox + c - 70, oy + c + k * 22 - 6, 140, 11); soft(ox + c, oy + c, 120, 'rgba(10,8,6,A)', 0.4); }
  // scorch
  { const [ox, oy] = at(15), c = CELL / 2; soft(ox + c, oy + c, c, 'rgba(8,6,5,A)', 0.8); for (let k = 0; k < 20; k++) blob(ox + c + (rnd() - 0.5) * 120, oy + c + (rnd() - 0.5) * 120, 8 + rnd() * 20, '#050403', 0.4); }
  x.globalAlpha = 1;
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

export function buildDecals(G, root, list) {
  if (!list.length) return null;
  const tex = drawAtlas(G.rng);
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
  const cell = new Float32Array(list.length * 2); list.forEach((d, i) => { cell[i * 2] = (d.c % N) / N; cell[i * 2 + 1] = 1 - (Math.floor(d.c / N) + 1) / N; });
  geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cell, 2));
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.75, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aCell;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = uv / 4.0 + aCell;\n#endif');
  };
  mat.customProgramCacheKey = () => 'decal1';
  const im = new THREE.InstancedMesh(geo, mat, list.length); im.name = 'decals'; im.receiveShadow = true; im.castShadow = false; im.renderOrder = 1;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
  list.forEach((d, i) => { m4.compose(new THREE.Vector3(d.x, 0.02 + (i % 7) * 0.0015, d.z), q.setFromAxisAngle(Y, d.ry), new THREE.Vector3(d.sx, 1, d.sz)); im.setMatrixAt(i, m4); });
  im.computeBoundingSphere(); root.add(im); return im;
}

// where the wear goes: concrete gets stains, cracks and tracks along its long axis; edges get sand
export function wearFor(rnd, pads, extra = []) {
  const out = [], put = (c, x, z, sx, sz, ry) => out.push({ c, x, z, sx, sz, ry });
  for (const p of pads) {
    const [x0, z0, x1, z1] = [p.x, p.y, p.z, p.w], w = x1 - x0, d = z1 - z0, A = w * d, alongX = w > d;
    for (let i = 0, n = Math.round(A / 30); i < n; i++) put(Math.floor(rnd() * 4), x0 + rnd() * w, z0 + rnd() * d, 1.2 + rnd() * 2.6, 1.2 + rnd() * 2.6, rnd() * 6.28);  // oil
    for (let i = 0, n = Math.round(A / 60); i < n; i++) put(6 + Math.floor(rnd() * 2), x0 + rnd() * w, z0 + rnd() * d, 2 + rnd() * 3, 2 + rnd() * 3, rnd() * 6.28);   // cracks
    for (let i = 0, n = Math.max(1, Math.round((alongX ? w : d) / 7)); i < n; i++) { const t = (i + 0.5) / n, lane = rnd() < 0.5 ? 0.35 : 0.65; // tyre tracks along the slab
      put(4 + Math.floor(rnd() * 2), alongX ? x0 + t * w : x0 + lane * w, alongX ? z0 + lane * d : z0 + t * d, 2.2, 7.5, alongX ? Math.PI / 2 : 0); }
    for (let i = 0, n = Math.round(2 * (w + d) / 6); i < n; i++) { const e = rnd() * 2 * (w + d); let x, z; if (e < w) { x = x0 + e; z = z0; } else if (e < 2 * w) { x = x0 + e - w; z = z1; } else if (e < 2 * w + d) { x = x0; z = z0 + e - 2 * w; } else { x = x1; z = z0 + e - 2 * w - d; }
      put(10 + Math.floor(rnd() * 3), x, z, 3 + rnd() * 3, 3 + rnd() * 3, rnd() * 6.28); } // sand drifts over the edges
  }
  return out.concat(extra);
}
