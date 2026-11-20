import * as THREE from 'three';

// Procedural dusk sky dome: zenith/horizon gradient, sun-side warm band, layered clouds,
// multi-lobe sun halo, sun disk (disk only in the main view, never in the PMREM env).
export const SKY = {
  zenith: new THREE.Color(0.07, 0.13, 0.30),
  horizon: new THREE.Color(1.25, 0.48, 0.16),
  horizonAway: new THREE.Color(0.30, 0.34, 0.46),
  ground: new THREE.Color(0.20, 0.15, 0.11),
};

const VS = /* glsl */`
varying vec3 vDir;
void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;

const SKYFN = /* glsl */`
uniform vec3 uSunDir, uSunCol, uZenith, uHorizon, uAway, uGround;
uniform float uDisk, uTime, uEnv;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * n2(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
vec3 skyColor(vec3 d){
  float mu = dot(d, uSunDir);
  float sunSide = clamp(0.5 + 0.5 * dot(normalize(d.xz + 1e-5), normalize(uSunDir.xz + 1e-5)), 0.0, 1.0);
  float h = max(d.y, 0.0);
  vec3 hor = mix(uAway, uHorizon, pow(sunSide, 2.2));
  vec3 col = mix(hor, uZenith, pow(smoothstep(0.0, 0.62, h), 0.55));
  col += uHorizon * 0.25 * exp(-h * 14.0) * sunSide * sunSide;                // thick dusty horizon band
  // clouds: thin high streaks lit from below by the low sun
  if (d.y > 0.0) {
    vec2 uv = d.xz / (d.y + 0.08) * 0.9 + vec2(uTime * 0.004, 0.0);
    float c = fbm(uv * vec2(0.6, 2.2));
    c = smoothstep(0.46, 0.8, c) * smoothstep(0.0, 0.25, d.y) * (1.0 - smoothstep(0.5, 0.95, d.y));
    vec3 cl = mix(uAway * 0.75 + vec3(0.05, 0.03, 0.04), uSunCol * vec3(1.9, 1.3, 1.0), pow(sunSide, 2.5)) * (0.5 + 1.2 * pow(max(mu, 0.0), 5.0));
    col = mix(col, cl, c * 0.85);
  }
  // halo lobes
  float m = max(mu, 0.0);
  col += uSunCol * (pow(m, 8.0) * 0.35 + pow(m, 64.0) * 0.9 + pow(m, 600.0) * 3.0 + pow(m, 6000.0) * 14.0) * (1.0 - 0.6 * uEnv);
  if (uEnv < 0.5) col += uSunCol * smoothstep(0.99992, 0.99997, mu) * 110.0 * uDisk;
  // below horizon: dusty ground bounce
  if (d.y < 0.0) col = mix(hor * 0.9, uGround, smoothstep(0.0, 0.25, -d.y));
  return col;
}`;
const FS = SKYFN + /* glsl */`
varying vec3 vDir;
void main(){ gl_FragColor = vec4(skyColor(normalize(vDir)), 1.0); }`;
// equirect pass (fullscreen): uv -> direction, used to feed PMREM.fromEquirectangular
const EQ_VS = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const EQ_FS = SKYFN + /* glsl */`
varying vec2 vUv;
void main(){
  float phi = (vUv.x - 0.5) * 6.2831853; float th = (vUv.y - 0.5) * 3.14159265;
  vec3 d = vec3(sin(phi) * cos(th), sin(th), -cos(phi) * cos(th));
  gl_FragColor = vec4(skyColor(d), 1.0);
}`;
export function makeSkyEquirect(renderer, sunDir, sunCol, w = 1024) {
  const rt = new THREE.WebGLRenderTarget(w, w / 2, { type: THREE.HalfFloatType, depthBuffer: false });
  rt.texture.mapping = THREE.EquirectangularReflectionMapping;
  const mat = makeSkyMaterial(sunDir, sunCol, true);
  const m2 = new THREE.ShaderMaterial({ vertexShader: EQ_VS, fragmentShader: EQ_FS, uniforms: mat.uniforms, depthTest: false, depthWrite: false, toneMapped: false });
  const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m2); q.frustumCulled = false;
  const sc = new THREE.Scene(); sc.add(q);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt); renderer.render(sc, cam); renderer.setRenderTarget(prev);
  return rt;
}

export function makeSkyMaterial(sunDir, sunCol, env = false) {
  return new THREE.ShaderMaterial({
    vertexShader: VS, fragmentShader: FS, side: THREE.BackSide, depthWrite: false, depthTest: true,
    toneMapped: false, fog: false,
    uniforms: {
      uSunDir: { value: sunDir }, uSunCol: { value: sunCol }, uZenith: { value: SKY.zenith }, uHorizon: { value: SKY.horizon },
      uAway: { value: SKY.horizonAway }, uGround: { value: SKY.ground }, uDisk: { value: 1 }, uTime: { value: 0 }, uEnv: { value: env ? 1 : 0 },
    },
  });
}
