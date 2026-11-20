// Assemble a game GLB: low.glb geometry + processed textures -> public/models/<name>.glb
// node tools/assemble.mjs <bake_dir> <name> [--tex 2048] [--norm 2048] [--orm 1024] [--skin]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, reorder, quantize, meshopt, prune, dedup, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';

const [dir, name, ...rest] = process.argv.slice(2);
const opt = (k, d) => { const i = rest.indexOf('--' + k); return i >= 0 ? +rest[i + 1] : d; };
const TEX = opt('tex', 2048), NRM = opt('norm', 2048), ORM = opt('orm', 1024);
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const inI = rest.indexOf('--in'); const doc = await io.read(inI >= 0 ? rest[inI + 1] : `${dir}/low.glb`);
const root = doc.getRoot();
const img = async (file, size, fmt) => {
  const s = sharp(readFileSync(`${dir}/${file}`)).resize(size, size, { kernel: 'lanczos3' });
  return fmt === 'png' ? s.png({ compressionLevel: 9 }).toBuffer() : s.webp({ quality: fmt === 'nrm' ? 92 : 88, smartSubsample: true }).toBuffer();
};
const mat = doc.createMaterial(name).setRoughnessFactor(1).setMetallicFactor(1);
const tBase = doc.createTexture('base').setImage(await img('base.png', TEX, 'webp')).setMimeType('image/webp');
const tNrm = doc.createTexture('normal').setImage(await img('normal.png', NRM, 'nrm')).setMimeType('image/webp');
const tOrm = doc.createTexture('orm').setImage(await img('orm.png', ORM, 'webp')).setMimeType('image/webp');
mat.setBaseColorTexture(tBase).setNormalTexture(tNrm).setOcclusionTexture(tOrm).setMetallicRoughnessTexture(tOrm);
if (existsSync(`${dir}/emissive.png`)) {
  const tE = doc.createTexture('emissive').setImage(await img('emissive.png', Math.min(TEX, 1024), 'webp')).setMimeType('image/webp');
  mat.setEmissiveTexture(tE).setEmissiveFactor([1, 1, 1]);
}
doc.createExtension((await import('@gltf-transform/extensions')).EXTTextureWebP).setRequired(true);
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) p.setMaterial(mat);
for (const m of root.listMaterials()) if (m !== mat) m.dispose();
const skin = rest.includes('--skin');
await doc.transform(dedup(), prune(), reorder({ encoder: MeshoptEncoder }), ...(skin ? [] : [quantize()]), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
mkdirSync('public/models', { recursive: true });
const outp = `public/models/${name}.glb`;
await io.write(outp, doc);
const tris = root.listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
console.log(JSON.stringify({ out: outp, MB: +(statSync(outp).size / 1e6).toFixed(2), tris }));
