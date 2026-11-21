import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { patchMaterial } from '../mats/patch.js';

// Asset table: real-world size (longest axis, metres), material class, flags.
export const MODELS = {
  rifle_v1: { len: 0.92, cls: 'weapon' },
  rifle2: { len: 0.90, cls: 'weapon' },
  mag: { len: 0.25, cls: 'weapon' },
  glove_r: { len: 0.26, cls: 'default' },
  arm_l: { len: 0.46, cls: 'default' },
  robot: { len: 1.90, cls: 'robot', up: true },
  tank: { len: 9.0, cls: 'rust', up: true },
  tower: { len: 16.0, cls: 'rust', up: true },
  piperack: { len: 7.0, cls: 'rust' },
  valves: { len: 2.6, cls: 'metal' },
  barrier: { len: 3.0, cls: 'concrete' },
  hazard_fence: { len: 3.0, cls: 'paint' },
  drums: { len: 2.6, cls: 'paint' },
  stairs: { len: 4.2, cls: 'rust' },
  rubble: { len: 2.6, cls: 'concrete' },
  shrub: { len: 1.2, cls: 'plant' },
  wall_broken: { len: 4.2, cls: 'rust' },
  lamp: { len: 0.55, cls: 'metal' },
  container: { len: 6.1, cls: 'paint' },
  pumpjack: { len: 7.5, cls: 'rust' },
  generator: { len: 3.4, cls: 'paint' },
  spool: { len: 2.4, cls: 'default' },
  sandbags: { len: 3.0, cls: 'default' },
  scaffold: { len: 15.0, cls: 'rust', up: true },
  colossus_hull: { len: 12.6, cls: 'paint' },
  colossus_leg_upper: { len: 6.4, cls: 'paint' },
  colossus_leg_lower: { len: 7.6, cls: 'paint' },
  tank_wreck: { len: 9.0, cls: 'rust' },
  valve_station: { len: 2.5, cls: 'metal' },
  valve_wheel: { len: 0.72, cls: 'paint' },
  dropship: { len: 19, cls: 'paint' },
  column_cluster: { len: 34, cls: 'rust', up: true },
  cracker: { len: 30, cls: 'rust', up: true },
  horton_sphere: { len: 17, cls: 'paint', up: true },
  mesa: { len: 140, cls: 'concrete', matte: true },
  tanker_truck: { len: 13, cls: 'rust' },
  tank_far: { len: 9.0, cls: 'rust', up: true },
  tower_far: { len: 16.0, cls: 'rust', up: true },
  pumpjack_far: { len: 7.5, cls: 'rust' },
  lance: { len: 0.86, cls: 'weapon' },
  riot_shield: { len: 1.55, cls: 'metal', up: true },
  drone: { len: 0.95, cls: 'paint' },
  drop_pod: { len: 2.3, cls: 'paint', up: true },
  fence: { len: 4.0, cls: 'metal' },
  cabin: { len: 8.5, cls: 'paint' },
  pump_skid: { len: 3.2, cls: 'paint' },
  transformer: { len: 3.0, cls: 'metal' },
  gas_rack: { len: 2.4, cls: 'paint' },
  forklift: { len: 3.4, cls: 'paint' },
  pallets: { len: 1.5, cls: 'default' },
  container_far: { len: 6.1, cls: 'paint' },
};

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map();
let maxAniso = 8;
export function setRendererCaps(renderer) { maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy()); }

async function loadRaw(name) {
  if (!cache.has(name)) cache.set(name, loader.loadAsync(`/models/${name}.glb`).then((g) => {
    const def = MODELS[name] || {};
    const root = g.scene;
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root); const size = box.getSize(new THREE.Vector3());
    const longest = def.up ? size.y : Math.max(size.x, size.y, size.z);
    const k = (def.len || longest) / longest;
    const holder = new THREE.Group(); holder.name = name;
    root.scale.multiplyScalar(k);
    root.updateMatrixWorld(true);
    const b2 = new THREE.Box3().setFromObject(root); const c = b2.getCenter(new THREE.Vector3());
    root.position.sub(new THREE.Vector3(c.x, b2.min.y, c.z));
    holder.add(root);
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      const m = o.material;
      for (const t of [m.map, m.normalMap, m.roughnessMap, m.aoMap, m.emissiveMap]) if (t) t.anisotropy = maxAniso;
      if (m.aoMap) m.aoMapIntensity = 1;
      if (m.emissiveMap) m.emissiveIntensity = 1;
      if (def.matte) { m.roughnessMap = null; m.roughness = 0.95; m.metalnessMap = null; m.metalness = 0; } // rock: the generated ORM reads as polished
      patchMaterial(m, def.cls || 'default');
    });
    holder.userData.size = b2.getSize(new THREE.Vector3());
    return holder;
  }).catch((e) => { console.warn('[assets] missing', name, e.message); return null; }));
  return cache.get(name);
}

// Clone for placement. Falls back to a same-size placeholder box when the model is missing.
export async function instance(name, { cloneMaterials = false } = {}) {
  const src = await loadRaw(name);
  if (!src) {
    const def = MODELS[name] || { len: 1 };
    const g = new THREE.Group(); g.name = name + '_placeholder';
    const m = new THREE.Mesh(new THREE.BoxGeometry(def.len * 0.6, def.len * 0.6, def.len * 0.6), patchMaterial(new THREE.MeshStandardMaterial({ color: 0xff00aa, roughness: 0.8 })));
    m.position.y = def.len * 0.3; m.castShadow = m.receiveShadow = true; g.add(m); return g;
  }
  const c = src.clone(true);
  if (cloneMaterials) c.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.userData = { ...o.material.userData }; } });
  c.userData.size = src.userData.size;
  return c;
}
export const has = async (name) => !!(await loadRaw(name));
