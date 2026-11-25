import { defineConfig } from 'vite';
import { readFileSync, readdirSync, statSync } from 'node:fs';

// Bytes a first visit downloads (models the game loads, animations, sounds, tiling textures), so the loading bar can
// move with the download instead of sitting on one phase for a minute on a slow line.
function assetBytes() {
  const size = (f) => { try { return statSync('public/' + f).size; } catch { return 0; } };
  let n = 0;
  for (const m of JSON.parse(readFileSync('public/models/index.json', 'utf8'))) if (m !== 'robot') n += size(`models/${m}.glb`);
  for (const f of readdirSync('public/anim')) n += size('anim/' + f);
  for (const f of readdirSync('public/tex')) n += size('tex/' + f);
  for (const files of Object.values(JSON.parse(readFileSync('public/sfx/index.json', 'utf8')))) for (const f of [].concat(files)) n += size('sfx/' + f);
  return n;
}

// Release checks: refuse to build when a model is still a Git LFS pointer (it would ship as a broken .glb), and ship the
// licence texts of the libraries and fonts in the bundle (MIT/OFL require them alongside copies of the software).
function release() {
  return {
    name: 'release', apply: 'build',
    buildStart() {
      const bad = readdirSync('public/models').filter((f) => f.endsWith('.glb') && readFileSync('public/models/' + f).subarray(0, 4).toString() !== 'glTF');
      if (bad.length) this.error(`not real GLB files (run git lfs pull): ${bad.join(', ')}`);
    },
    generateBundle() {
      const deps = [...Object.keys(JSON.parse(readFileSync('package.json', 'utf8')).dependencies), 'meshoptimizer'];
      const text = deps.map((d) => { const dir = `node_modules/${d}`, f = readdirSync(dir).find((x) => /^licen[cs]e/i.test(x)); return f ? `==== ${d} ====\n\n${readFileSync(`${dir}/${f}`, 'utf8').trim()}\n` : null; }).filter(Boolean);
      this.emitFile({ type: 'asset', fileName: 'third-party-licenses.txt', source: `SANDLINE ships the following third-party software.\n\n${text.join('\n')}` });
    },
  };
}

export default defineConfig({
  server: { port: 5320, host: '127.0.0.1' },
  build: { target: 'es2022', assetsInlineLimit: 0 },
  plugins: [release()],
  define: { __ASSET_BYTES__: JSON.stringify(assetBytes()) },
});
