import * as THREE from 'three';

// One shader patch for every PBR material in the world: world-space macro albedo/roughness
// variation, cavity grime, settled dust on up-facing surfaces, a sand splash band near the
// ground, and specular anti-aliasing from normal variance. Keeps generated assets from
// looking like isolated studio renders dropped into the scene.
export const CLASSES = {
  default: { macro: [0.12, 0.10, 0.6, 0.25], dust: [0.35, 0.5] },
  metal:   { macro: [0.16, 0.14, 0.45, 0.35], dust: [0.45, 0.55] },
  rust:    { macro: [0.20, 0.10, 0.35, 0.40], dust: [0.50, 0.65] },
  concrete:{ macro: [0.22, 0.12, 0.35, 0.40], dust: [0.55, 0.70] },
  paint:   { macro: [0.18, 0.16, 0.40, 0.45], dust: [0.45, 0.60] },
  ground:  { macro: [0.10, 0.08, 0.15, 0.00], dust: [0.00, 0.00] },
  robot:   { macro: [0.08, 0.10, 1.20, 0.25], dust: [0.30, 0.40] },
  weapon:  { macro: [0.06, 0.06, 6.0, 0.00], dust: [0.10, 0.00] },
  plant:   { macro: [0.10, 0.05, 1.0, 0.00], dust: [0.20, 0.20] },
};
export const INTERIOR = { min: new THREE.Vector3(1e5, 1e5, 1e5), max: new THREE.Vector3(1e5, 1e5, 1e5) };
export const DUST_COLOR = new THREE.Color().setRGB(0.42, 0.33, 0.24); // linear, sampled from target sand

const VERT_DECL = /* glsl */`
varying vec3 vSlWP; varying vec3 vSlWN;`;
const VERT_BODY = /* glsl */`
#include <worldpos_vertex>
{
  mat4 slM = modelMatrix;
  #ifdef USE_INSTANCING
    slM = modelMatrix * instanceMatrix;
  #endif
  vSlWP = (slM * vec4(transformed, 1.0)).xyz;
  vSlWN = normalize(mat3(slM) * objectNormal);
}`;

const FRAG_DECL = /* glsl */`
varying vec3 vSlWP; varying vec3 vSlWN;
uniform vec4 uSlMacro;   // albedoVar, roughVar, freq (1/m), grime
uniform vec4 uSlDust;    // amount, splashBand, -, -
uniform vec3 uSlDustCol;
uniform vec3 uSlInMin, uSlInMax;
float slInterior(vec3 p){ vec3 d = max(uSlInMin - p, p - uSlInMax); return 1.0 - smoothstep(0.0, 1.2, max(max(d.x, d.y), d.z)); }
float slH(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float slN(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(slH(i), slH(i + vec3(1,0,0)), f.x), mix(slH(i + vec3(0,1,0)), slH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(slH(i + vec3(0,0,1)), slH(i + vec3(1,0,1)), f.x), mix(slH(i + vec3(0,1,1)), slH(i + vec3(1,1,1)), f.x), f.y), f.z); }
float slMac, slMac2, slDustK;`;

const FRAG_ALBEDO = /* glsl */`
#include <map_fragment>
{
  slMac = slN(vSlWP * uSlMacro.z);
  slMac2 = slN(vSlWP * uSlMacro.z * 3.7 + 11.3);
  float m = slMac * 0.65 + slMac2 * 0.35 - 0.5;
  diffuseColor.rgb *= 1.0 + uSlMacro.x * m * 2.0;
  float grime = smoothstep(0.5, 0.85, slMac * 0.6 + slMac2 * 0.4) * uSlMacro.w;
  diffuseColor.rgb *= 1.0 - grime * 0.35;
  float up = smoothstep(0.35, 0.9, vSlWN.y);
  float band = smoothstep(0.55, 0.0, vSlWP.y) * smoothstep(-0.5, -0.05, vSlWN.y) * uSlDust.y;
  float n2 = slN(vSlWP * 2.3 + 4.1);
  slDustK = clamp((up * (0.55 + 0.45 * slMac2) * smoothstep(0.25, 0.65, n2 + slMac * 0.4) + band * (0.5 + 0.5 * n2)) * uSlDust.x, 0.0, 1.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, uSlDustCol * (0.85 + 0.3 * slMac2), slDustK * 0.85);
}`;

const FRAG_ROUGH = /* glsl */`
#include <normal_fragment_maps>
{
  roughnessFactor += uSlMacro.y * ((slMac2 - 0.5) * 1.4 + (slMac - 0.5) * 0.8);
  roughnessFactor = mix(roughnessFactor, 0.92, slDustK);
  metalnessFactor *= 1.0 - slDustK;
  vec3 dn = fwidth(normal);
  float var = clamp(dot(dn, dn) * 2.0, 0.0, 0.5);
  roughnessFactor = sqrt(roughnessFactor * roughnessFactor + var);
  roughnessFactor = clamp(roughnessFactor, 0.045, 1.0);
}`;

const AO_SNIP = `
{ float slIn = slInterior(vSlWP); reflectedLight.indirectDiffuse *= mix(1.0, 0.28, slIn); reflectedLight.indirectSpecular *= mix(1.0, 0.22, slIn); }`;
export function patchMaterial(mat, cls = 'default', over = {}) {
  if (mat.userData.slPatched) return mat;
  const c = { ...CLASSES[cls] || CLASSES.default, ...over };
  const u = {
    uSlMacro: { value: new THREE.Vector4(...c.macro) },
    uSlDust: { value: new THREE.Vector4(c.dust[0], c.dust[1], 0, 0) },
    uSlDustCol: { value: DUST_COLOR }, uSlInMin: { value: INTERIOR.min }, uSlInMax: { value: INTERIOR.max },
  };
  mat.userData.slPatched = true; mat.userData.sl = u;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>' + VERT_DECL).replace('#include <worldpos_vertex>', VERT_BODY);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>' + FRAG_DECL)
      .replace('#include <map_fragment>', FRAG_ALBEDO).replace('#include <normal_fragment_maps>', FRAG_ROUGH)
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>' + AO_SNIP).replace('// SL_AO', AO_SNIP)
      .replace('// SL_MAP', FRAG_ALBEDO.replace('#include <map_fragment>', '')).replace('// SL_NRM', FRAG_ROUGH.replace('#include <normal_fragment_maps>', ''));
  };
  const prevKey = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => prevKey() + '|sl1';
  mat.needsUpdate = true;
  return mat;
}
