import * as THREE from 'three';
import { patchMaterial } from './patch.js';
import { loadTex, NRM_GLSL, rgNormals } from '../render/gputex.js';

// Object-space dominant-axis projection for procedural box geometry (beams, walls, slabs):
// no UVs needed, texel density in metres, correct tangent frame per face, rotation-safe.
const tex = (name, srgb) => loadTex(`/tex/${name}.webp`, srgb, name.endsWith('_nor'));
export function triplanarMaterial(set, { metres = 2, tint = 0xffffff, cls = 'rust', rough = 1, metal = 1, nscale = 1 } = {}) {
  const m = new THREE.MeshStandardMaterial({ map: tex(set + '_diff', true), normalMap: tex(set + '_nor', false), roughnessMap: tex(set + '_arm', false),
    metalnessMap: tex(set + '_arm', false), aoMap: tex(set + '_arm', false), color: tint, roughness: rough, metalness: metal, normalScale: new THREE.Vector2(nscale, nscale) });
  rgNormals(m, m.normalMap);
  const u = { uTpScale: { value: 1 / metres } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTpP; varying vec3 vTpN; varying vec3 vTpTv; varying vec3 vTpBv;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vTpP = position; vTpN = normal;
{ vec3 a = abs(normal); vec3 T, B;
  if (a.x > a.y && a.x > a.z) { T = vec3(0.0, 0.0, -sign(normal.x)); B = vec3(0.0, 1.0, 0.0); }
  else if (a.y > a.z) { T = vec3(1.0, 0.0, 0.0); B = vec3(0.0, 0.0, -sign(normal.y)); }
  else { T = vec3(sign(normal.z), 0.0, 0.0); B = vec3(0.0, 1.0, 0.0); }
  vTpTv = normalize(normalMatrix * T); vTpBv = normalize(normalMatrix * B); }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vTpP; varying vec3 vTpN; varying vec3 vTpTv; varying vec3 vTpBv; uniform float uTpScale;
${NRM_GLSL}
vec2 tpUV(out vec3 T, out vec3 B){ vec3 a = abs(vTpN);
  if (a.x > a.y && a.x > a.z) { T = vec3(0.0, 0.0, -sign(vTpN.x)); B = vec3(0.0, 1.0, 0.0); return vec2(-vTpP.z * sign(vTpN.x), vTpP.y) * uTpScale; }
  if (a.y > a.z) { T = vec3(1.0, 0.0, 0.0); B = vec3(0.0, 0.0, -sign(vTpN.y)); return vec2(vTpP.x, -vTpP.z * sign(vTpN.y)) * uTpScale + 0.37; }
  T = vec3(sign(vTpN.z), 0.0, 0.0); B = vec3(0.0, 1.0, 0.0); return vec2(vTpP.x * sign(vTpN.z), vTpP.y) * uTpScale + 0.71; }
vec3 tpT, tpB; vec2 tpUv;`)
      .replace('#include <map_fragment>', 'tpUv = tpUV(tpT, tpB); diffuseColor *= texture(map, tpUv);\n// SL_MAP')
      .replace('#include <roughnessmap_fragment>', 'vec4 tpArm = texture(roughnessMap, tpUv); float roughnessFactor = roughness * tpArm.g;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = metalness * tpArm.b;')
      .replace('#include <normal_fragment_maps>', `{ vec3 tn = slNrm(texture(normalMap, tpUv)); tn.xy *= normalScale;
        normal = normalize(normalize(vTpTv) * tn.x + normalize(vTpBv) * tn.y + normal * tn.z); }\n// SL_NRM`)
      .replace('#include <aomap_fragment>', 'float tpAo = mix(1.0, tpArm.r, 0.8); reflectedLight.indirectDiffuse *= tpAo; reflectedLight.indirectSpecular *= tpAo;\n// SL_AO');
  };
  m.customProgramCacheKey = () => 'tp1';
  return patchMaterial(m, cls);
}
