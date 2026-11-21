// GLSL for the post chain. Written for this project; technique follows the HDR pipeline
// documented in docs/SPEC.md §2.4 (half-res AO + shadowed volumetric scattering + energy
// conserving bloom + auto exposure + ACES/AgX blend + grade + FXAA/sharpen/grain).

export const FS_TRI = /* glsl */`
out vec2 vUv;
void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const COMMON = /* glsl */`
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform float uNear, uFar;
float linZ(float d){ return uNear * uFar / (uFar - d * (uFar - uNear)); }
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
`;

// half-res linear depth; weapon pixels (depth < 0.05 because of depthRange(0,0.05)) -> 0.01
export const DEPTH_HALF = COMMON + /* glsl */`
uniform sampler2D tDepth; uniform vec2 uSrcRes;
out vec4 o;
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy * 2.0);
  p = min(p, ivec2(uSrcRes) - 1);
  float d = texelFetch(tDepth, p, 0).r;
  float z = d < 0.05 ? 0.01 : linZ(d);
  o = vec4(z, d, 0.0, 1.0);
}`;

// Screen-space AO on half-res linear depth. Normal from depth (smaller-difference side).
export const AO = COMMON + /* glsl */`
uniform sampler2D tZ; uniform vec2 uHalfRes; uniform vec4 uProj; // (1/P00, 1/P11, 0,0)
uniform float uRadius, uIntensity; uniform int uTaps;
out vec4 o;
vec3 viewPos(vec2 uv, float z){ vec2 ndc = uv * 2.0 - 1.0; return vec3(ndc.x * uProj.x * z, ndc.y * uProj.y * z, -z); }
vec3 vpAt(vec2 uv){ return viewPos(uv, texture(tZ, uv).r); }
void main(){
  float zc = texture(tZ, vUv).r;
  if (zc < 0.02 || zc > 140.0) { o = vec4(1.0); return; }
  vec2 px = 1.0 / uHalfRes;
  vec3 P = viewPos(vUv, zc);
  vec3 l = vpAt(vUv - vec2(px.x, 0.0)), r = vpAt(vUv + vec2(px.x, 0.0));
  vec3 b = vpAt(vUv - vec2(0.0, px.y)), t = vpAt(vUv + vec2(0.0, px.y));
  vec3 dx = abs(r.z - P.z) < abs(P.z - l.z) ? r - P : P - l;
  vec3 dy = abs(t.z - P.z) < abs(P.z - b.z) ? t - P : P - b;
  vec3 N = normalize(cross(dx, dy));
  float R = uRadius * (0.6 + 0.4 * clamp(zc / 12.0, 0.0, 1.0));
  float sr = R / (zc * uProj.y * 2.0);          // radius in uv
  sr = clamp(sr, 3.0 * px.y, 0.14);
  float ang = ign(gl_FragCoord.xy) * 6.2831853;
  float sum = 0.0;
  for (int i = 0; i < 16; i++) {
    if (i >= uTaps) break;
    float f = (float(i) + 0.5) / float(uTaps);
    float a = ang + f * 6.2831853 * 3.0;
    vec2 uv = vUv + vec2(cos(a), sin(a)) * sr * f;
    vec3 S = vpAt(uv);
    vec3 v = S - P;
    float vv = dot(v, v);
    float fall = max(R * R - vv, 0.0);
    sum += fall * fall * fall * max((dot(v, N) - (0.015 + 0.004 * zc)) / (vv + 0.004), 0.0);
  }
  float ao = 1.0 - uIntensity * sum * 5.0 / (pow(R, 6.0) * float(uTaps));
  ao = clamp(ao, 0.0, 1.0);
  ao = mix(ao, 1.0, smoothstep(70.0, 140.0, zc));
  o = vec4(ao, ao, ao, 1.0);
}`;

// depth-aware separable blur (7 taps)
export const BILATERAL = COMMON + /* glsl */`
uniform sampler2D tSrc, tZ; uniform vec2 uDir; uniform float uTol;
out vec4 o;
void main(){
  float zc = texture(tZ, vUv).r;
  vec4 acc = vec4(0.0); float w = 0.0;
  for (int i = -3; i <= 3; i++) {
    vec2 uv = vUv + uDir * float(i);
    float z = texture(tZ, uv).r;
    float k = (1.0 - 0.22 * abs(float(i))) * max(0.0, 1.0 - abs(z - zc) / (uTol * zc + 0.02));
    acc += texture(tSrc, uv) * k; w += k;
  }
  o = w > 1e-4 ? acc / w : texture(tSrc, vUv);
}`;

// Ray-marched single scattering from the sun through the shadow map + height fog.
export const VOLUME = COMMON + /* glsl */`
uniform sampler2D tZ;
uniform sampler2DShadow tShadow;
uniform mat4 uInvView, uShadowMat;
uniform vec4 uProj;
uniform vec3 uCamPos, uSunDir, uSunCol, uFogCol, uHorizon;
uniform float uSigma, uMaxD, uAmbient, uFarHaze, uTime, uSunScale, uHeightFall, uBase;
uniform int uSteps;
uniform vec4 uInterior[4]; uniform vec4 uInteriorSize[4]; uniform int uInteriorCount; uniform float uInteriorDust;
// local lights scattering in the dust (fires, explosions, muzzle flashes, lightning): pos.xyz + range, colour*intensity
uniform vec4 uPL[6]; uniform vec3 uPLc[6]; uniform int uPLn;
// sandstorm: xz = direction toward the storm, z = front position along it, w = density boost inside
uniform vec4 uStorm; uniform vec2 uWind;
uniform vec4 uClear[4]; uniform vec3 uClearB[4]; // clear capsules punched out of the storm (blasts: a == b; rail shots: a tunnel): a.xyz + radius, b
out vec4 o;
float h31(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vn3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z); }
float storm(vec3 p){
  if (uStorm.w <= 0.0) return 1.0;
  float u = dot(p.xz, uStorm.xy) - uStorm.z;
  float inside = smoothstep(-14.0, 14.0, u + (vn3(vec3(p.xz * 0.02, uTime * 0.05)) - 0.5) * 30.0);
  if (inside <= 0.001) return 1.0;
  vec3 q = p * 0.07 + vec3(uWind.x, -0.2, uWind.y) * uTime * 0.35;
  float n = vn3(q) * 0.6 + vn3(q * 2.3) * 0.4;
  float clear = 1.0;
  for (int i = 0; i < 4; i++) { float r = uClear[i].w; if (r <= 0.0) continue; vec3 a = uClear[i].xyz, ab = uClearB[i] - a; float d = length(p - a - ab * clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0)); clear *= smoothstep(r * 0.6, r * 1.05, d + (n - 0.5) * r * 0.35); }
  return 1.0 + uStorm.w * inside * clear * (0.35 + 1.3 * n) * (0.55 + 0.45 * exp(-max(p.y, 0.0) / 40.0));
}
float hg(float mu, float g){ float g2 = g * g; return (1.0 - g2) / (12.566 * pow(max(1.0 + g2 - 2.0 * g * mu, 1e-4), 1.5)); }
float shape(float h){ return uBase + (1.0 - uBase) * exp(-max(h, 0.0) / uHeightFall); }
float interior(vec3 p){
  float k = 0.0;
  for (int i = 0; i < 4; i++) { if (i >= uInteriorCount) break;
    vec3 d = abs(p - uInterior[i].xyz) - uInteriorSize[i].xyz;
    k = max(k, 1.0 - smoothstep(0.0, 1.5, max(max(d.x, d.y), d.z))); }
  return k;
}
void main(){
  float z = texture(tZ, vUv).r;
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 vdir = normalize(vec3(ndc.x * uProj.x, ndc.y * uProj.y, -1.0));
  vec3 wdir = normalize((uInvView * vec4(vdir, 0.0)).xyz);
  bool sky = z > uFar * 0.9;
  if (z < 0.02) { o = vec4(0.0, 0.0, 0.0, 1.0); return; } // weapon
  float dist = sky ? 1e5 : z / max(-vdir.z, 1e-3);
  float maxD = min(dist, uMaxD * (sky ? 0.3 : 1.0));
  float mu = dot(wdir, uSunDir);
  float ph = min(hg(mu, 0.78) * 0.55 + hg(mu, 0.25) * 0.45, 1.15);
  float jit = ign(gl_FragCoord.xy + fract(uTime * 7.31) * 64.0);
  vec3 ins = vec3(0.0); float T = 1.0; float prevT = 0.0;
  for (int i = 0; i < 48; i++) {
    if (i >= uSteps) break;
    float f = (float(i) + jit) / float(uSteps);
    float t = maxD * f * (0.35 + 0.65 * f);
    float dt = t - prevT; prevT = t;
    vec3 p = uCamPos + wdir * t;
    float s = uSigma * shape(p.y) * (1.0 + uInteriorDust * interior(p)) * storm(p);
    vec4 sc = uShadowMat * vec4(p, 1.0);
    float sh = 1.0;
    if (sc.x > 0.0 && sc.x < 1.0 && sc.y > 0.0 && sc.y < 1.0 && sc.z < 1.0) {
      float ef = smoothstep(0.0, 0.3, min(min(sc.x, 1.0 - sc.x), min(sc.y, 1.0 - sc.y))) * smoothstep(1.0, 0.85, sc.z);
      // penumbra that widens with distance (sun disc + scattering), so shafts get soft edges
      float ja = fract(jit * 7.13 + float(i) * 0.618) * 6.2831; vec2 jo = vec2(cos(ja), sin(ja)) * (0.0006 + t * 0.00006);
      float s0 = texture(tShadow, vec3(sc.xy + jo, sc.z - 0.0006)), s1 = texture(tShadow, vec3(sc.xy - jo.yx * 1.7, sc.z - 0.0006));
      sh = mix(1.0, (s0 + s1) * 0.5, ef);
    }
    float nearW = mix(2.3, 0.55, smoothstep(4.0, 85.0, t));
    vec3 L = uSunCol * uSunScale * sh * ph * 12.566 * nearW + uAmbient * uFogCol * (0.4 + 0.6 * sh);
    for (int k = 0; k < 6; k++) { if (k >= uPLn) break; vec3 dl = p - uPL[k].xyz; float d2 = dot(dl, dl);
      L += uPLc[k] * (1.0 / (1.0 + d2)) * smoothstep(uPL[k].w * uPL[k].w, 0.0, d2); }
    float a = exp(-s * dt);
    ins += T * L * (1.0 - a);
    T *= a;
  }
  if (dist > uMaxD && !sky) { // analytic far haze (sky already carries its own atmosphere)
    float tau = uSigma * uFarHaze * (min(dist, 4000.0) - uMaxD) * shape(uCamPos.y + wdir.y * uMaxD * 0.5);
    float a = exp(-tau);
    vec3 hz = uHorizon * 0.5 + uFogCol * uAmbient * 3.0 + uSunCol * uSunScale * ph * 0.6;
    ins += T * hz * (1.0 - a); T *= a;
  }
  o = vec4(ins, T);
}`;

// joint bilateral upsample of half-res AO/volume, combine
export const COMPOSITE = COMMON + /* glsl */`
uniform sampler2D tColor, tDepth, tZ, tAO, tVol; uniform vec2 uHalfRes;
uniform float uAOStrength, uExposureHint; uniform int uUseAO, uUseVol;
// wet ground: puddles on the concrete pads / corridor slab, screen-space reflections of the floor plane
uniform int uUseSSR; uniform vec4 uProjV; uniform mat4 uCamMat; uniform vec3 uViewUp; uniform vec4 uPads[4]; uniform vec4 uCorr; uniform float uTime;
uniform vec4 uScan; uniform float uScanA; // scan pulse: origin.xyz + radius, strength
out vec4 o;
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y); }
float wetMask(vec3 w){
  if (w.y > 0.11 || w.y < -0.05) return 0.0;
  float n = vn(w.xz * 0.55) * 0.55 + vn(w.xz * 1.9 + 7.0) * 0.3 + vn(w.xz * 6.0) * 0.15;
  vec2 dc = max(uCorr.xy - w.xz, w.xz - uCorr.zw);
  float inC = step(max(dc.x, dc.y), 0.0);
  float pad = 0.0; for (int i = 0; i < 4; i++) { vec4 r = uPads[i]; vec2 c = (r.xy + r.zw) * 0.5, h = (r.zw - r.xy) * 0.5; vec2 d = abs(w.xz - c) - h + 0.4; pad = max(pad, step(max(d.x, d.y), 0.0)); }
  float m = inC * smoothstep(0.5, 0.56, n) + pad * (1.0 - inC) * smoothstep(0.6, 0.66, n);
  return m;
}
vec3 viewPos(vec2 uv, float z){ return vec3((uv * 2.0 - 1.0) * uProjV.xy * z, -z); }
vec2 toUv(vec3 p){ return 0.5 + 0.5 * p.xy / (-p.z) / uProjV.xy; }
void main(){
  vec4 col = texture(tColor, vUv);
  float d = texture(tDepth, vUv).r;
  if (d < 0.05) { o = col; return; }        // weapon untouched
  float zc = linZ(d);
  vec2 hp = vUv * uHalfRes - 0.5; vec2 f = fract(hp); vec2 b = (floor(hp) + 0.5) / uHalfRes; vec2 px = 1.0 / uHalfRes;
  vec4 aoS = vec4(0.0), vS = vec4(0.0); float wS = 0.0;
  for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
    vec2 uv = b + vec2(i, j) * px;
    float bw = (i == 0 ? 1.0 - f.x : f.x) * (j == 0 ? 1.0 - f.y : f.y);
    float zh = texture(tZ, uv).r;
    float w = bw / (0.015 + abs(zh - zc) / zc);
    aoS += texture(tAO, uv) * w; vS += texture(tVol, uv) * w; wS += w;
  }
  aoS /= wS; vS /= wS;
  if (uUseAO == 1) {
    float lit = smoothstep(0.16, 0.85, luma(col.rgb) * uExposureHint);
    float a = mix(1.0, aoS.r, uAOStrength * (1.0 - 0.8 * lit));
    col.rgb *= mix(vec3(a), vec3(1.0), vec3(0.0, 0.03, 0.07));
  }
  if (uUseSSR == 1) {
    vec3 vp = viewPos(vUv, zc); vec3 wp = (uCamMat * vec4(vp, 1.0)).xyz;
    float m = wetMask(wp);
    if (m > 0.001) {
      vec3 V = normalize(vp);
      // faint ripple perturbation keeps the mirror from looking like glass
      vec2 rp = vec2(vn(wp.xz * 9.0 + uTime * 0.6), vn(wp.xz * 9.0 + 31.0 - uTime * 0.5)) - 0.5;
      vec3 N = normalize(uViewUp + vec3(rp.x, 0.0, rp.y) * 0.025);
      vec3 R = reflect(V, N);
      float cosT = clamp(-dot(V, N), 0.0, 1.0);
      float F = 0.05 + 0.95 * pow(1.0 - cosT, 4.0);
      vec3 refl = vec3(0.0); float hit = 0.0;
      {
        float stepL = 0.06 * zc + 0.05, jit = ign(gl_FragCoord.xy);
        vec3 p = vp + R * stepL * jit;
        for (int i = 0; i < 40; i++) {
          p += R * stepL; stepL *= 1.07;
          if (p.z > -uNear) break;
          vec2 uv = toUv(p); if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
          float sd = texture(tDepth, uv).r; if (sd < 0.05) continue;
          float sz = linZ(sd), dz = -p.z - sz;
          if (dz > 0.0 && dz < stepL * 1.6 + 0.08 * sz) {
            // refine
            vec3 a = p - R * stepL, b = p;
            for (int k = 0; k < 5; k++) { vec3 c = (a + b) * 0.5; float cz = linZ(texture(tDepth, toUv(c)).r); if (-c.z > cz) b = c; else a = c; }
            vec2 hu = toUv(b); refl = texture(tColor, hu).rgb;
            vec2 e = min(hu, 1.0 - hu); hit = smoothstep(0.0, 0.08, min(e.x, e.y)) * (1.0 - smoothstep(0.6, 1.0, float(i) / 40.0));
            break;
          }
        }
      }
      // miss: fall back to a dim sky-ish tint so puddles never read as holes
      vec3 fall = col.rgb * 0.15;
      vec3 rc = mix(fall, refl, hit);
      col.rgb = mix(col.rgb, col.rgb * 0.3 + rc * F * 1.7, m);
    }
  }
  if (uUseVol == 1) col.rgb = col.rgb * vS.a + vS.rgb;
  if (uScanA > 0.001) {
    // the ring rides over every surface; behind it the surfaces show a world-space wire grid that fades back
    vec3 vq = viewPos(vUv, zc); vec3 wq = (uCamMat * vec4(vq, 1.0)).xyz;
    float dist = length(wq - uScan.xyz), r = uScan.w;
    float w = 0.28 + r * 0.018;
    float ring = exp(-pow((dist - r) / w, 2.0)) + 0.35 * exp(-pow((dist - r + w * 3.0) / (w * 2.5), 2.0));
    float behind = step(dist, r) * exp(-(r - dist) / 7.0);
    vec3 dx = dFdx(wq), dy = dFdy(wq); vec3 n = abs(normalize(cross(dx, dy) + 1e-6));
    vec3 gp = wq * 0.75; vec3 g = abs(fract(gp) - 0.5) / max(fwidth(gp), vec3(1e-4));
    float lx = 1.0 - clamp(min(g.y, g.z) - 0.5, 0.0, 1.0), ly = 1.0 - clamp(min(g.x, g.z) - 0.5, 0.0, 1.0), lz = 1.0 - clamp(min(g.x, g.y) - 0.5, 0.0, 1.0);
    n /= (n.x + n.y + n.z);
    float line = lx * n.x + ly * n.y + lz * n.z;
    float near = 1.0 - smoothstep(45.0, 90.0, zc);
    vec3 cy = vec3(0.32, 0.92, 1.0);
    col.rgb += cy * (ring * 7.0 + line * behind * 1.6 + behind * 0.05) * uScanA * near;
  }
  o = vec4(max(col.rgb, 0.0), 1.0);
}`;

// 13-tap downsample (first level: partial Karis average)
export const BLOOM_DOWN = COMMON + /* glsl */`
uniform sampler2D tSrc; uniform vec2 uSrcPx; uniform int uFirst;
out vec4 o;
vec3 S(vec2 uv){ return min(texture(tSrc, uv).rgb, vec3(400.0)); }
void main(){
  vec2 x = uSrcPx;
  vec3 a = S(vUv + x * vec2(-2, 2)), b = S(vUv + x * vec2(0, 2)), c = S(vUv + x * vec2(2, 2));
  vec3 d = S(vUv + x * vec2(-2, 0)), e = S(vUv), f = S(vUv + x * vec2(2, 0));
  vec3 g = S(vUv + x * vec2(-2, -2)), h = S(vUv + x * vec2(0, -2)), i = S(vUv + x * vec2(2, -2));
  vec3 j = S(vUv + x * vec2(-1, 1)), k = S(vUv + x * vec2(1, 1)), l = S(vUv + x * vec2(-1, -1)), m = S(vUv + x * vec2(1, -1));
  vec3 r;
  if (uFirst == 1) {
    vec3 g0 = (a + b + d + e) * 0.25, g1 = (b + c + e + f) * 0.25, g2 = (d + e + g + h) * 0.25, g3 = (e + f + h + i) * 0.25, g4 = (j + k + l + m) * 0.25;
    float w0 = 1.0 / (1.0 + 0.08 * luma(g0)), w1 = 1.0 / (1.0 + 0.08 * luma(g1)), w2 = 1.0 / (1.0 + 0.08 * luma(g2)), w3 = 1.0 / (1.0 + 0.08 * luma(g3)), w4 = 1.0 / (1.0 + 0.08 * luma(g4));
    r = (g0 * w0 * 0.125 + g1 * w1 * 0.125 + g2 * w2 * 0.125 + g3 * w3 * 0.125 + g4 * w4 * 0.5) / (w0 * 0.125 + w1 * 0.125 + w2 * 0.125 + w3 * 0.125 + w4 * 0.5);
  } else {
    r = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  }
  o = vec4(r, 1.0);
}`;

export const BLOOM_UP = COMMON + /* glsl */`
uniform sampler2D tSrc, tHigh; uniform vec2 uSrcPx; uniform float uMix;
out vec4 o;
void main(){
  vec2 x = uSrcPx;
  vec3 s = texture(tSrc, vUv).rgb * 4.0;
  s += (texture(tSrc, vUv + x * vec2(-1, 0)).rgb + texture(tSrc, vUv + x * vec2(1, 0)).rgb + texture(tSrc, vUv + x * vec2(0, -1)).rgb + texture(tSrc, vUv + x * vec2(0, 1)).rgb) * 2.0;
  s += texture(tSrc, vUv + x * vec2(-1, -1)).rgb + texture(tSrc, vUv + x * vec2(1, -1)).rgb + texture(tSrc, vUv + x * vec2(-1, 1)).rgb + texture(tSrc, vUv + x * vec2(1, 1)).rgb;
  s /= 16.0;
  o = vec4(mix(texture(tHigh, vUv).rgb, s, uMix), 1.0);
}`;

// anamorphic streak (horizontal), threshold + gaussian
export const STREAK = COMMON + /* glsl */`
uniform sampler2D tSrc; uniform vec2 uStep; uniform float uThresh; uniform int uFirst;
out vec4 o;
void main(){
  vec3 acc = vec3(0.0); float w = 0.0;
  for (int i = -7; i <= 7; i++) {
    vec3 c = texture(tSrc, vUv + uStep * float(i)).rgb;
    if (uFirst == 1) c = max(c - uThresh, 0.0);
    float k = exp(-float(i * i) / 18.0);
    acc += c * k; w += k;
  }
  o = vec4(acc / w, 1.0);
}`;

// auto exposure: log-average on the smallest bloom mip, center-weighted; temporal adapt
export const EXPOSURE = COMMON + /* glsl */`
uniform sampler2D tSrc, tPrev; uniform float uDt, uKey, uMinE, uMaxE, uTau, uFirst;
out vec4 o;
void main(){
  float s = 0.0, w = 0.0;
  for (int j = 0; j < 5; j++) for (int i = 0; i < 7; i++) {
    vec2 uv = vec2((float(i) + 0.5) / 7.0, (float(j) + 0.5) / 5.0);
    float r = length((uv - 0.5) * vec2(1.6, 1.0));
    float k = 1.0 - 0.75 * smoothstep(0.1, 0.55, r);
    s += log(clamp(luma(texture(tSrc, uv).rgb), 0.002, 40.0)) * k; w += k;
  }
  float avg = exp(s / w);
  float target = clamp(pow(uKey / avg, 0.85), uMinE, uMaxE);
  float prev = texture(tPrev, vec2(0.5)).r;
  if (uFirst > 0.5 || !(prev > 0.0) || isnan(prev) || isinf(prev)) prev = target;
  float e = mix(prev, target, 1.0 - exp(-uDt / uTau));
  o = vec4(e, avg, 0.0, 1.0);
}`;

// grade -> LDR sRGB
export const GRADE = COMMON + /* glsl */`
uniform sampler2D tHdr, tBloom, tStreak, tExp;
uniform float uBloom, uStreak, uManualExp, uAgx, uVignette, uSat, uLookPow, uLookSat, uCA, uDamage, uLow, uAds, uFade, uFlash, uTime, uSpeed, uOver, uPunch, uStormLook;
uniform vec3 uSplitLo, uSplitHi, uLift;
out vec4 o;
vec3 aces(vec3 x){ // Hill fit
  const mat3 i = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 oM = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  vec3 v = i * x; vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return clamp(oM * (a / b), 0.0, 1.0);
}
vec3 agx(vec3 c){
  const mat3 m = mat3(0.842479062253094, 0.0423282422610123, 0.0423756549057051, 0.0784335999999992, 0.878468636469772, 0.0784336, 0.0792237451477643, 0.0791661274605434, 0.879142973793104);
  const mat3 mi = mat3(1.19687900512017, -0.0528968517574562, -0.0529716355144438, -0.0980208811401368, 1.15190312990417, -0.0980434501171241, -0.0990297440797205, -0.0989611768448433, 1.15107367264116);
  c = m * c; c = clamp(log2(max(c, 1e-10)), -12.47393, 4.026069); c = (c + 12.47393) / 16.49999;
  vec3 x2 = c * c, x4 = x2 * x2;
  c = 15.5 * x4 * x2 - 40.14 * x4 * c + 31.96 * x4 - 6.868 * x2 * c + 0.4298 * x2 + 0.1191 * c - 0.00232;
  c = pow(max(c, 0.0), vec3(uLookPow)); float lc = luma(c); c = lc + uLookSat * (c - lc);
  c = mi * c; return clamp(pow(max(c, 0.0), vec3(2.2)), 0.0, 1.0);
}
vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main(){
  vec2 cc = vUv - 0.5; float r2 = dot(cc * vec2(1.6, 1.0), cc * vec2(1.6, 1.0)) / 0.89;
  vec2 off = cc * r2 * (uCA + uDamage * 0.006 + uPunch * 0.025 + uOver * 0.004);
  vec3 col = vec3(texture(tHdr, vUv - off).r, texture(tHdr, vUv).g, texture(tHdr, vUv + off).b);
  if (uSpeed > 0.02) { // dash / slide: radial smear toward the edges
    float k = uSpeed * smoothstep(0.08, 0.9, r2) * 0.05; vec3 acc = col; 
    for (int i = 1; i <= 5; i++) acc += texture(tHdr, vUv - cc * k * float(i)).rgb;
    col = acc / 6.0;
  }
  vec3 bl = texture(tBloom, vUv).rgb;
  col = mix(col, bl, uBloom);
  col += texture(tStreak, vUv).rgb * vec3(0.45, 0.62, 1.0) * uStreak;
  float e = texture(tExp, vec2(0.5)).r * uManualExp;
  col *= e;
  col += vec3(1.0, 0.97, 0.9) * uFlash * 0.08;
  vec3 m = mix(aces(col * 1.3), agx(col), uAgx);
  float l = luma(m);
  m *= mix(uSplitLo, uSplitHi, smoothstep(0.03, 0.55, l));
  m = mix(m, m * m * (3.0 - 2.0 * m), 0.22);
  m = m * 0.988 + uLift;
  float sat = uSat * (1.0 - 0.65 * uLow) * (1.0 - 0.5 * uDamage);
  m = mix(vec3(luma(m)), m, sat);
  float vig = uVignette + 0.55 * uLow + 0.22 * uAds;
  float vr = smoothstep(0.15 - 0.08 * uAds, 1.05, r2);
  m *= 1.0 - vig * vr * vr * (3.0 - 2.0 * vr);
  float edge = smoothstep(0.18, 1.0, r2);
  float dw = clamp(uDamage * edge * 0.85 + uLow * edge * edge * 0.25 * (0.75 + 0.25 * sin(5.0 * uTime)), 0.0, 1.0);
  m = mix(m, vec3(0.55, 0.02, 0.01) * (0.35 + l), dw);
  if (uStormLook > 0.001) { // inside the storm: a burnt-ochre duotone; only light sources (hot or cold) keep their colour
    float lo = luma(m);
    float hot = max(smoothstep(0.62, 0.95, lo), smoothstep(0.015, 0.1, m.b - m.r) * smoothstep(0.12, 0.35, lo));
    vec3 duo = mix(vec3(0.035, 0.018, 0.008), vec3(1.0, 0.64, 0.34), smoothstep(0.0, 0.8, lo));
    duo = mix(duo, duo * duo * (3.0 - 2.0 * duo), 0.5);
    m = mix(m, mix(duo, m * 1.15, hot), uStormLook * 0.85);
    // sand on the visor: short bright dashes streaming with the wind, thicker toward the edges
    vec2 su = vUv * vec2(uRes.x / uRes.y, 1.0); float st = 0.0;
    for (int i = 0; i < 3; i++) { float fi = float(i); vec2 q = su * vec2(2.5 + fi * 2.0, 55.0 + fi * 25.0) + vec2(uTime * (6.0 + fi * 3.5), fi * 7.0);
      float h = hash12(floor(q)); float fr = fract(q.x); st += step(0.992 - fi * 0.003, h) * smoothstep(0.0, 0.08, fr) * smoothstep(0.55, 0.15, fr) * (0.6 + 0.4 * h); }
    m += vec3(1.0, 0.78, 0.52) * st * 0.12 * uStormLook * (0.15 + 0.85 * edge);
    m = mix(m, m * vec3(0.92, 0.78, 0.62), edge * uStormLook * 0.35); // dust packed in the visor rim
  }
  if (uOver > 0.001) { // overdrive: the world drains to cold blue, heat (fire, tracers, outlines) stays hot
    float lo = luma(m), heat = smoothstep(0.04, 0.28, m.r - m.b);
    vec3 cold = vec3(lo) * vec3(0.5, 0.86, 1.15) * 1.08;
    m = mix(m, mix(cold, m * 1.2, heat), uOver * 0.85);
    m += vec3(0.1, 0.55, 0.75) * edge * edge * 0.22 * uOver;
  }
  m += vec3(1.0, 0.85, 0.7) * uPunch * 0.12 * (1.0 - edge);
  m *= 1.0 - uFade;
  m = clamp(m, 0.0, 1.0);
  if (any(isnan(m)) || any(isinf(m))) m = vec3(0.0);
  vec3 s = toSRGB(m);
  o = vec4(s, luma(s));
}`;

// FXAA (lite) + unsharp + film grain + dither
export const FINAL = COMMON + /* glsl */`
uniform sampler2D tLdr; uniform float uSharpen, uGrain, uTime;
out vec4 o;
void main(){
  vec2 px = 1.0 / uRes;
  vec4 M = texture(tLdr, vUv);
  float lM = M.a;
  float lNW = texture(tLdr, vUv + vec2(-1, 1) * px).a, lNE = texture(tLdr, vUv + vec2(1, 1) * px).a;
  float lSW = texture(tLdr, vUv + vec2(-1, -1) * px).a, lSE = texture(tLdr, vUv + vec2(1, -1) * px).a;
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  float contrast = lMax - lMin;
  vec3 col = M.rgb;
  if (contrast > max(0.0312, lMax * 0.10)) {
    vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
    float red = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
    float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
    dir = clamp(dir * rcp, -8.0, 8.0) * px;
    vec3 a = 0.5 * (texture(tLdr, vUv + dir * (1.0 / 3.0 - 0.5)).rgb + texture(tLdr, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
    vec3 b = a * 0.5 + 0.25 * (texture(tLdr, vUv - dir * 0.5).rgb + texture(tLdr, vUv + dir * 0.5).rgb);
    float lb = luma(b);
    col = (lb < lMin || lb > lMax) ? a : b;
  }
  vec3 avg4 = 0.25 * (texture(tLdr, vUv + vec2(-1, 1) * px).rgb + texture(tLdr, vUv + vec2(1, 1) * px).rgb + texture(tLdr, vUv + vec2(-1, -1) * px).rgb + texture(tLdr, vUv + vec2(1, -1) * px).rgb);
  col += (M.rgb - avg4) * uSharpen * (1.0 - smoothstep(0.04, 0.22, contrast));
  float l = luma(col);
  float g = hash12(gl_FragCoord.xy + fract(uTime * 13.7) * 311.0) + hash12(gl_FragCoord.xy * 1.37 + fract(uTime * 7.1) * 97.0) - 1.0;
  col += g * uGrain * mix(1.0, 0.3, smoothstep(0.25, 0.9, l)) * (0.35 + 0.65 * smoothstep(0.0, 0.08, l));
  col += (hash12(gl_FragCoord.xy + 0.37) + hash12(gl_FragCoord.xy * 0.71 + 3.1) - 1.0) / 255.0;
  o = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export const COPY = COMMON + /* glsl */`
uniform sampler2D tSrc; out vec4 o; void main(){ o = texture(tSrc, vUv); }`;
