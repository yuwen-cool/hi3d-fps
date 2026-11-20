#!/usr/bin/env python3
"""Post-process raw bakes -> game textures.

  python3 tools/delight.py <bake_dir> [--emissive orange] [--k 0.85]

De-lighting: Hi3D textures carry the studio light that lit the multiview concept images. That
shading correlates with the surface's object-space normal, so fit log-luminance to a 2nd-order
spherical-harmonic basis of the normal (least squares over all texels) and divide it out.
Albedo variation that does not correlate with orientation (paint, decals, wear) is kept.
Writes base.png (sRGB), orm.png (R=AO, G=rough, B=metal), normal.png, emissive.png, report.json.
"""
import sys, json, numpy as np
from PIL import Image, ImageFilter

d = sys.argv[1]
args = sys.argv[2:]
K = float(args[args.index('--k') + 1]) if '--k' in args else 0.85
emis = args[args.index('--emissive') + 1] if '--emissive' in args else None

def load(n, mode='RGB'):
    return np.asarray(Image.open(f'{d}/tex_{n}.png').convert(mode)).astype(np.float32) / 255.0

base = load('base'); H, W = base.shape[:2]
on = np.asarray(Image.open(f'{d}/tex_onormal.png').convert('RGB').resize((W, H), Image.BILINEAR)).astype(np.float32) / 255.0
n = on * 2 - 1; ln = np.linalg.norm(n, axis=2, keepdims=True); valid = (ln[..., 0] > 0.5)
n = n / np.maximum(ln, 1e-4)
lin = np.where(base <= 0.04045, base / 12.92, ((base + 0.055) / 1.055) ** 2.4)
L = lin @ np.array([0.2126, 0.7152, 0.0722], np.float32)
valid &= L > 0.003
x, y, z = n[..., 0], n[..., 1], n[..., 2]
B = np.stack([np.ones_like(x), x, y, z, x * y, y * z, 3 * z * z - 1, x * z, x * x - y * y], -1)
idx = np.flatnonzero(valid.ravel())
rng = np.random.default_rng(1); samp = rng.choice(idx, size=min(400000, idx.size), replace=False)
A = B.reshape(-1, 9)[samp]; t = np.log(L.ravel()[samp])
coef, *_ = np.linalg.lstsq(A, t, rcond=None)
fit = (B.reshape(-1, 9) @ coef).reshape(H, W)
shade = np.exp(fit - coef[0])            # relative shading, mean ~ 1
shade = np.clip(shade, 0.45, 2.2) ** K
alb = lin / shade[..., None]
alb = np.where(valid[..., None], alb, lin)
lum = alb @ np.array([0.2126, 0.7152, 0.0722], np.float32)
p5, p95 = np.percentile(lum[valid], [5, 95])
# clamp to physically plausible albedo range (linear 0.02..0.85)
scale = min(1.0, 0.85 / max(p95, 1e-4))
alb = np.clip(alb * scale, 0.02, 0.9)
srgb = np.where(alb <= 0.0031308, alb * 12.92, 1.055 * alb ** (1 / 2.4) - 0.055)
Image.fromarray((np.clip(srgb, 0, 1) * 255 + 0.5).astype(np.uint8)).save(f'{d}/base.png')

rough = load('rough', 'L'); metal = load('metal', 'L'); ao = load('ao', 'L')
h2, w2 = rough.shape
metal = np.clip((metal - 0.35) / 0.3, 0, 1); metal = metal * metal * (3 - 2 * metal)   # binarise
ao = np.clip(ao, 0.0, 1.0) ** 0.8
orm = np.stack([ao, rough, metal], -1)
Image.fromarray((orm * 255 + 0.5).astype(np.uint8)).save(f'{d}/orm.png')
Image.open(f'{d}/tex_normal.png').convert('RGB').save(f'{d}/normal.png')

rep = {'sh_coef': coef.round(4).tolist(), 'shade_range': [float(np.percentile(shade[valid], 2)), float(np.percentile(shade[valid], 98))],
       'albedo_lum_p5_p95_before': [float(p5), float(p95)], 'metal_mid_frac': float(((metal > 0.1) & (metal < 0.9)).mean()),
       'rough_mean': float(rough.mean())}
if emis == 'orange':
    hsv = np.asarray(Image.fromarray((base * 255).astype(np.uint8)).convert('HSV')).astype(np.float32) / 255.0
    hue, sat, val = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    m = ((hue > 0.03) & (hue < 0.13) & (sat > 0.55) & (val > 0.6)).astype(np.float32)
    mi = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
    m = np.asarray(mi).astype(np.float32) / 255.0
    e = srgb * m[..., None]
    Image.fromarray((np.clip(e, 0, 1) * 255).astype(np.uint8)).save(f'{d}/emissive.png')
    rep['emissive_frac'] = float((m > 0.5).mean())
json.dump(rep, open(f'{d}/report.json', 'w'), indent=1)
print(json.dumps(rep))
