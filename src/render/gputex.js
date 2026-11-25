import * as THREE from 'three';
import { SparkGL } from '@ludicon/spark.js';
import { registerSparkLoader } from '@ludicon/spark.js/three-gltf';
import { params } from '../core/ctx.js';

// GPU block compression for every model texture (spark.js). The download stays the small WebP inside each GLB; on the
// player's GPU each image is encoded once, at load, to the format the GPU samples natively: colour and ORM to BC7
// (ASTC/ETC2 where there is no BC), normals to two-channel BC5. A 2048 texture with mips drops from 22 MB to 5.6 MB
// (BC7) or 2.8 MB (BC1-class), so the whole set fits next to the render targets on an ordinary laptop GPU.
// ?gputex=0 turns it off (plain RGBA8, as before), for A/B checks.
let ready = null, renderer = null, encoder = null;
const pending = new Set();

export function initGpuTex(r) {
  if (ready) return ready;
  renderer = r;
  ready = (async () => {
    if (params.gputex === '0') return null;
    try {
      const gl = r.getContext();
      const spark = await SparkGL.create(gl, { cacheTempResources: true });
      const formats = spark.getSupportedFormats?.() || [];
      if (!formats.length) return null;
      // The encoder works on the renderer's own context and restores most of what it touches, but not three's state
      // cache (texture units, bound program): reset it after every encode so the next frame binds from scratch.
      return { encodeTexture: (src, o) => spark.encodeTexture(src, o).finally(() => r.resetState()), spark };
    } catch (e) { console.warn('[gputex] off:', e.message); return null; }
  })();
  ready.then((s) => { encoder = s; });
  return ready;
}
export const gpuTexReady = () => ready;
// every standalone texture still encoding (the loading screen waits for them before its prewarm frame)
export const gpuTexSettled = () => Promise.all([...pending]);

// Standalone tiling textures (ground, triplanar sets): one texture per file, shared by every material that uses it.
// Colour and ARM to BC7; normal maps to two-channel BC5 like the models' (in BC7 the fine sand relief went flat), so a
// shader sampling one must rebuild z: those textures carry userData.rg and the material gets SL_RG_NRM (rgNormals()).
// flipY as THREE.TextureLoader does (the shaders were tuned on flipped images; a normal map flipped one way and not the
// other turns bumps into dents). Without an encoder (gputex=0, no BC/ASTC/ETC support) they load as plain textures.
const texCache = new Map(), plain = new THREE.TextureLoader();
function uploadFallback(url, srgb, t) {
  return new Promise((resolve) => {
    plain.load(url, (pt) => {
      const gl = renderer.getContext(), tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, srgb ? gl.SRGB8_ALPHA8 : gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, pt.image);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      renderer.resetState();
      t.sourceTexture = tex; setAniso(t, 8); pt.dispose();
      resolve();
    }, undefined, () => resolve());
  });
}
export function loadTex(url, srgb, normal = false) {
  const k = url + (srgb ? '|s' : ''); if (texCache.has(k)) return texCache.get(k);
  let t;
  if (encoder) {
    t = new THREE.ExternalTexture(null);
    t.userData.rg = normal;
    const job = encoder.encodeTexture(url, normal ? { format: 'rg', normal: true, mips: true, flipY: true } : { format: 'rgb', srgb, mips: true, flipY: true }).then((r) => {
      t.sourceTexture = r.texture; t.userData.byteLength = r.byteLength; setAniso(t, 8);
    }).catch((e) => { console.warn('[gputex]', url, e.message); return uploadFallback(url, srgb, t); }).finally(() => pending.delete(job));
    pending.add(job);
  } else {
    t = plain.load(url); t.anisotropy = 8;
  }
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texCache.set(k, t); return t;
}
// GLSL: a tangent-space normal from a normal-map sample, whichever way the texture is stored
export const NRM_GLSL = `vec3 slNrm(vec4 s){
#ifdef SL_RG_NRM
  vec2 xy = s.xy * 2.0 - 1.0; return vec3(xy, sqrt(clamp(1.0 - dot(xy, xy), 0.0, 1.0)));
#else
  return s.xyz * 2.0 - 1.0;
#endif
}`;
export function rgNormals(m, normalTex) { if (normalTex.userData.rg) m.defines = { ...(m.defines || {}), SL_RG_NRM: '' }; return m; }
function setAniso(t, aniso) {
  const gl = renderer.getContext(), ext = gl.getExtension('EXT_texture_filter_anisotropic');
  if (!ext || !t.sourceTexture) return;
  renderer.state.bindTexture(gl.TEXTURE_2D, t.sourceTexture);
  gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(aniso, renderer.capabilities.getMaxAnisotropy()));
  t.userData.slAniso = aniso;
}

// Register on a GLTFLoader once the encoder is known; a loader with nothing registered loads plain textures.
const done = new WeakSet();
export async function withGpuTex(loader) {
  const s = await ready;
  if (s && !done.has(loader)) { registerSparkLoader(loader, s, { mips: true }); done.add(loader); }
  return loader;
}

// After a GLTF loads: what the encoded textures need that three cannot set on an external texture.
// - anisotropic filtering (three only applies sampler state to textures it uploads itself)
// - normal maps are two-channel; tag them so the shader rebuilds z (USE_PACKED_NORMALMAP)
const PACKED = new Set([THREE.RGFormat, THREE.RED_GREEN_RGTC2_Format, THREE.RG11_EAC_Format]);
export function fixGpuTextures(root, aniso) {
  root.traverse((o) => {
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) {
      if (m.normalMap?.isExternalTexture && !PACKED.has(m.normalMap.format)) m.normalMap.format = THREE.RGFormat;
      for (const t of [m.map, m.normalMap, m.roughnessMap, m.metalnessMap, m.aoMap, m.emissiveMap]) {
        if (t?.isExternalTexture && t.userData.slAniso !== aniso) setAniso(t, aniso);
      }
    }
  });
}
