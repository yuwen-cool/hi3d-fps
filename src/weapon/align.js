import * as THREE from 'three';
import { instance } from '../world/assets.js';

// Orient a generated rifle: longest axis -> -Z, muzzle (the thin end) forward, origin at the
// pistol grip. Returns the aligned group plus measured muzzle / sight points.
export async function alignedGun(name) {
  const g = await instance(name); g.updateMatrixWorld(true);
  const pts = []; const v = new THREE.Vector3();
  g.traverse((o) => { if (o.isMesh) { const p = o.geometry.attributes.position; for (let i = 0; i < p.count; i += 7) pts.push(v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld).clone()); } });
  const bb = new THREE.Box3().setFromPoints(pts); const sz = bb.getSize(new THREE.Vector3());
  const ax = sz.x > sz.z ? 'x' : 'z';
  const band = (lo) => { const L = bb.max[ax] - bb.min[ax]; const sel = pts.filter((p) => lo ? p[ax] < bb.min[ax] + L * 0.12 : p[ax] > bb.max[ax] - L * 0.12); const ys = sel.map((p) => p.y); return Math.max(...ys) - Math.min(...ys); };
  const muzzleAtMin = band(true) < band(false);
  const holder = new THREE.Group(); holder.add(g);
  if (ax === 'z') holder.rotation.y = muzzleAtMin ? 0 : Math.PI; else holder.rotation.y = muzzleAtMin ? -Math.PI / 2 : Math.PI / 2;
  holder.updateMatrixWorld(true);
  const pts2 = pts.map((p) => p.clone().applyMatrix4(holder.matrixWorld));
  const b2 = new THREE.Box3().setFromPoints(pts2); const L = b2.max.z - b2.min.z;
  const rear = pts2.filter((p) => p.z > b2.min.z + L * 0.45 && p.z < b2.min.z + L * 0.8);
  const gripBottom = rear.reduce((a, p) => (p.y < a.y ? p : a), rear[0]);
  const top = pts2.filter((p) => p.z > b2.min.z + L * 0.3 && p.z < b2.min.z + L * 0.7).reduce((a, p) => (p.y > a.y ? p : a), pts2[0]);
  const grip = new THREE.Vector3(0, gripBottom.y + 0.115, gripBottom.z - 0.02);
  holder.position.sub(grip);
  const out = new THREE.Group(); out.add(holder);
  return { group: out, muzzle: new THREE.Vector3(0, (b2.min.y + b2.max.y) * 0.5 - grip.y + 0.03, b2.min.z - grip.z), sightY: top.y - 0.025 - grip.y, box: b2, grip };
}
