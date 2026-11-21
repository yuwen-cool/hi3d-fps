// Global context, URL params, event bus, seeded RNG, quality tiers.
export const params = Object.fromEntries(new URLSearchParams(location.search));

export function rng(seed = 4207) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function events() {
  const m = new Map();
  return {
    on(n, f) { (m.get(n) || m.set(n, []).get(n)).push(f); return () => this.off(n, f); },
    off(n, f) { const a = m.get(n); if (a) a.splice(a.indexOf(f) >>> 0, 1); },
    emit(n, d) { const a = m.get(n); if (!a) return; for (const f of a.slice()) { try { f(d); } catch (e) { console.error('[event]', n, e); } } },
  };
}

// scale, msaa, shadow map, volume steps, ao taps, motion blur, pixel budget
export const TIERS = {
  low:    { name: 'low',    scale: 0.70, msaa: 0, shadow: 2048, vol: 12, ao: 0, aoTaps: 8,  budget: 1.0e6 },
  medium: { name: 'medium', scale: 0.85, msaa: 2, shadow: 2048, vol: 16, ao: 1, aoTaps: 12, budget: 1.5e6 },
  high:   { name: 'high',   scale: 1.00, msaa: 2, shadow: 4096, vol: 24, ao: 1, aoTaps: 12, budget: 2.3e6 },
  ultra:  { name: 'ultra',  scale: 1.00, msaa: 4, shadow: 4096, vol: 40, ao: 1, aoTaps: 16, budget: 3.7e6 },
  test:   { name: 'test',   scale: 1.00, msaa: 0, shadow: 2048, vol: 16, ao: 1, aoTaps: 12, budget: 2.3e6 },
};

export function pickTier(gl) {
  if (params.q && TIERS[params.q]) return TIERS[params.q];
  if (/Mobi|Android|iPhone|iPad/.test(navigator.userAgent)) return TIERS.low;
  let r = '';
  try { const ext = gl.getExtension('WEBGL_debug_renderer_info'); r = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ''; } catch { /* */ }
  if (/SwiftShader|llvmpipe|Software|Mali|Adreno|PowerVR/i.test(r) || (/Intel/i.test(r) && !/Arc/i.test(r))) return TIERS.medium;
  return TIERS.high;
}

// Tuning table: one place for every look parameter (see docs/SPEC.md §2.4).
export const TUNE = {
  volSunScale: 1.25, volAmbient: 0.07, volSigma: 0.0038, volMaxD: 170, volFarHaze: 0.16, volInteriorDust: 3.5, volLocal: 0.06, volHeightFall: 5.5, volBase: 0.3,
  aoRadius: 0.9, aoIntensity: 1.6, aoStrength: 0.95,
  bloom: 0.065, bloomMix: 0.62, streak: 0.03, streakThresh: 2.2,
  key: 0.15, minExp: 0.6, maxExp: 1.4, adaptTau: 1.5, manualExp: 1.0,
  agx: 0.25, ca: 0.0013, vignette: 0.32, sat: 1.2, sharpen: 0.3, grain: 0.02, lookPow: 1.18, lookSat: 1.22,
  splitLo: [0.88, 1.0, 1.07], splitHi: [1.10, 1.0, 0.86], lift: [0.006, 0.0085, 0.011],
  envIntensity: 1.15, viewFill: 1.35,
};
