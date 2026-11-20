import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

// Collision world: axis-aligned boxes for movement (fast, predictable), BVH'd render meshes
// for bullets (impacts land on the real surface, decals sit right).
export function createPhysics() {
  const boxes = [];            // {min:Vector3,max:Vector3,mat:string}
  const shootables = [];       // meshes with bounds trees
  const surf = new Map();      // mesh.uuid -> surface type
  const ray = new THREE.Raycaster(); ray.firstHitOnly = true;

  function addBox(min, max, mat = 'concrete') { const b = { min: min.clone(), max: max.clone(), mat }; boxes.push(b); return b; }
  function addBoxCenter(c, size, mat) { const h = size.clone().multiplyScalar(0.5); return addBox(c.clone().sub(h), c.clone().add(h), mat); }
  function addShootable(root, mat = 'concrete') {
    root.updateMatrixWorld(true);
    root.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh) { if (!o.geometry.boundsTree) o.geometry.computeBoundsTree(); shootables.push(o); surf.set(o.uuid, o.userData.surface || mat); } });
  }
  // capsule (as vertical segment + radius) vs boxes, resolved per axis
  function overlap(p, r, h, b) {
    return p.x + r > b.min.x && p.x - r < b.max.x && p.z + r > b.min.z && p.z - r < b.max.z && p.y + h > b.min.y && p.y < b.max.y;
  }
  // moves pos (feet) by vel*dt; returns {grounded, hitCeil}
  function move(pos, vel, dt, r = 0.32, h = 1.8, step = 0.45) {
    const out = { grounded: false, hitCeil: false };
    const n = Math.max(1, Math.ceil(vel.length() * dt / 0.12));
    const sdt = dt / n;
    for (let s = 0; s < n; s++) {
      for (const ax of ['x', 'z']) {
        pos[ax] += vel[ax] * sdt;
        for (const b of boxes) {
          if (!overlap(pos, r, h, b)) continue;
          // step up small ledges
          if (b.max.y - pos.y <= step && b.max.y - pos.y > 0 && vel.y <= 0.5) {
            const old = pos.y; pos.y = b.max.y + 0.001;
            if (boxes.some((o) => o !== b && overlap(pos, r, h, o))) pos.y = old; else continue;
          }
          if (ax === 'x') pos.x = vel.x > 0 ? b.min.x - r - 1e-4 : b.max.x + r + 1e-4;
          else pos.z = vel.z > 0 ? b.min.z - r - 1e-4 : b.max.z + r + 1e-4;
          vel[ax] = 0;
        }
      }
      pos.y += vel.y * sdt;
      if (pos.y <= 0) { pos.y = 0; if (vel.y <= 0) { vel.y = 0; out.grounded = true; } }
      for (const b of boxes) {
        if (!overlap(pos, r, h, b)) continue;
        if (vel.y <= 0 && pos.y - vel.y * sdt >= b.max.y - 0.05) { pos.y = b.max.y; vel.y = 0; out.grounded = true; }
        else if (vel.y > 0) { pos.y = b.min.y - h - 1e-4; vel.y = 0; out.hitCeil = true; }
        else if (pos.y + 0.6 > b.max.y) { pos.y = b.max.y; vel.y = 0; out.grounded = true; }
      }
    }
    return out;
  }
  function groundBelow(pos, r = 0.3) {
    let g = 0;
    for (const b of boxes) if (pos.x + r > b.min.x && pos.x - r < b.max.x && pos.z + r > b.min.z && pos.z - r < b.max.z && b.max.y <= pos.y + 0.05) g = Math.max(g, b.max.y);
    return g;
  }
  function blocked(x, z, r = 0.35, y0 = 0.2, y1 = 1.6) {
    for (const b of boxes) if (x + r > b.min.x && x - r < b.max.x && z + r > b.min.z && z - r < b.max.z && b.max.y > y0 && b.min.y < y1) return true;
    return false;
  }
  const _hits = [];
  // world ray: real geometry + ground plane
  function raycast(origin, dir, far = 300) {
    ray.set(origin, dir); ray.far = far; _hits.length = 0;
    let best = null;
    for (const m of shootables) {
      if (!m.visible) continue;
      _hits.length = 0; m.raycast(ray, _hits);
      for (const h of _hits) if (h.distance < (best ? best.distance : far)) best = { distance: h.distance, point: h.point.clone(), normal: h.face ? h.face.normal.clone().transformDirection(m.matrixWorld) : new THREE.Vector3(0, 1, 0), object: m, surface: surf.get(m.uuid) };
    }
    if (dir.y < -1e-4) { const t = -origin.y / dir.y; if (t > 0 && t < (best ? best.distance : far)) best = { distance: t, point: origin.clone().addScaledVector(dir, t), normal: new THREE.Vector3(0, 1, 0), object: null, surface: 'sand' }; }
    if (best && best.normal.dot(dir) > 0) best.normal.negate();
    return best;
  }
  // cheap line of sight against boxes only (AI)
  function los(a, b) {
    const d = b.clone().sub(a); const len = d.length(); d.divideScalar(len);
    const r = new THREE.Ray(a, d); const p = new THREE.Vector3(); const bx = new THREE.Box3();
    for (const o of boxes) { bx.min.copy(o.min); bx.max.copy(o.max); if (r.intersectBox(bx, p) && p.distanceTo(a) < len - 0.05) return false; }
    return true;
  }
  return { boxes, shootables, addBox, addBoxCenter, addShootable, move, groundBelow, blocked, raycast, los };
}
