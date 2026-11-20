import * as THREE from 'three';
import { patchMaterial } from '../mats/patch.js';

const tl = new THREE.TextureLoader();
function tex(name, srgb, rep) {
  const t = tl.load(`/tex/${name}.webp`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.repeat.set(rep, rep);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return t;
}

// Ground: two CC0 PBR sets (gravelly sand + sandy gravel) blended by a world-space noise mask,
// with per-tile UV rotation/offset ("stochastic") to kill visible repetition.
export function makeGroundMaterial(set = 'gravelly_sand', set2 = 'sandy_gravel_02', metres = 3.2) {
  const m = new THREE.MeshStandardMaterial({
    map: tex(set + '_diff', true, 1), normalMap: tex(set + '_nor', false, 1),
    roughnessMap: tex(set + '_arm', false, 1), aoMap: tex(set + '_arm', false, 1), metalnessMap: tex(set + '_arm', false, 1),
    roughness: 1, metalness: 1, normalScale: new THREE.Vector2(1.2, 1.2),
  });
  const t2 = { d: tex(set2 + '_diff', true, 1), n: tex(set2 + '_nor', false, 1), a: tex(set2 + '_arm', false, 1) };
  const u = { uGTile: { value: 1 / metres }, uG2d: { value: t2.d }, uG2n: { value: t2.n }, uG2a: { value: t2.a } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGW = (modelMatrix * vec4(transformed,1.0)).xyz;');
    const decl = `
varying vec3 vGW; uniform float uGTile; uniform sampler2D uG2d, uG2n, uG2a;
float gH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gN(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(gH(i),gH(i+vec2(1,0)),f.x),mix(gH(i+vec2(0,1)),gH(i+vec2(1,1)),f.x),f.y); }
// stochastic-ish: blend two rotated/offset lookups chosen per cell
vec2 gRot(vec2 uv, vec2 cell){ float a = gH(cell) * 6.2831; float s = sin(a), c = cos(a); return mat2(c,-s,s,c) * uv + vec2(gH(cell+7.1), gH(cell+3.3)); }
vec4 gSample(sampler2D t, vec2 uv){
  vec2 c = floor(uv * 0.5); vec2 f = fract(uv * 0.5);
  vec4 a = texture(t, gRot(uv, c)); vec4 b = texture(t, gRot(uv, c + 17.0));
  float w = smoothstep(0.3, 0.7, gN(uv * 0.5 + 3.1));
  return mix(a, b, w);
}
float gMask(){ return smoothstep(0.35, 0.65, gN(vGW.xz * 0.06) * 0.7 + gN(vGW.xz * 0.23) * 0.3); }`;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>' + decl)
      .replace('#include <map_fragment>', `
  vec2 gUv = vGW.xz * uGTile; float gm = gMask();
  vec4 gd1 = gSample(map, gUv), gd2 = gSample(uG2d, gUv * 0.8);
  diffuseColor *= mix(gd1, gd2, gm);`)
      .replace('#include <roughnessmap_fragment>', `
  vec4 ga = mix(gSample(roughnessMap, gUv), gSample(uG2a, gUv * 0.8), gm);
  float roughnessFactor = roughness * ga.g;`)
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = 0.0;')
      .replace('#include <normal_fragment_maps>', `
  vec3 gn = mix(gSample(normalMap, gUv).xyz, gSample(uG2n, gUv * 0.8).xyz, gm) * 2.0 - 1.0;
  gn.xy *= normalScale;
  normal = normalize(vec3(gn.x, gn.z, -gn.y)); // ground plane: tangent space == world XZ
  normal = normalize((viewMatrix * vec4(normal, 0.0)).xyz);`)
      .replace('#include <aomap_fragment>', `
  float gao = mix(1.0, ga.r, 0.85);
  reflectedLight.indirectDiffuse *= gao; reflectedLight.indirectSpecular *= gao;`);
  };
  m.customProgramCacheKey = () => 'ground1';
  return m;
}

export function makeGround(size = 260) {
  const geo = new THREE.PlaneGeometry(size, size, 1, 1); geo.rotateX(-Math.PI / 2);
  const g = new THREE.Mesh(geo, makeGroundMaterial());
  g.receiveShadow = true; g.castShadow = false; g.name = 'ground';
  return g;
}
