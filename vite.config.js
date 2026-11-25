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

export default defineConfig({
  server: { port: 5320, host: '127.0.0.1' },
  build: { target: 'es2022', assetsInlineLimit: 0 },
  define: { __ASSET_BYTES__: JSON.stringify(assetBytes()) },
});
