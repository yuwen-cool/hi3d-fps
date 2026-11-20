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
out vec4 o;
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
    float s = uSigma * shape(p.y) * (1.0 + uInteriorDust * interior(p));
    vec4 sc = uShadowMat * vec4(p, 1.0);
    float sh = 1.0;
    if (sc.x > 0.0 && sc.x < 1.0 && sc.y > 0.0 && sc.y < 1.0 && sc.z < 1.0) {
      float ef = smoothstep(0.0, 0.12, min(min(sc.x, 1.0 - sc.x), min(sc.y, 1.0 - sc.y)));
      sh = mix(1.0, texture(tShadow, vec3(sc.xy, sc.z - 0.0006)), ef);
    }
    float nearW = mix(2.3, 0.55, smoothstep(4.0, 85.0, t));
    vec3 L = uSunCol * uSunScale * sh * ph * 12.566 * nearW + uAmbient * uFogCol * (0.4 + 0.6 * sh);
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
out vec4 o;
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
  if (uUseVol == 1) col.rgb = col.rgb * vS.a + vS.rgb;
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
uniform float uBloom, uStreak, uManualExp, uAgx, uVignette, uSat, uLookPow, uLookSat, uCA, uDamage, uLow, uAds, uFade, uFlash, uTime;
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
  vec2 off = cc * r2 * (uCA + uDamage * 0.006);
  vec3 col = vec3(texture(tHdr, vUv - off).r, texture(tHdr, vUv).g, texture(tHdr, vUv + off).b);
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
