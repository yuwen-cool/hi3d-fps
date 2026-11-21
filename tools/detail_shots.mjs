// Eye-level detail comparison across the zones (dusk), and the tank farm at night: node tools/detail_shots.mjs [outDir] [night storm level]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] || 'out/detail', nightStorm = +(process.argv[3] ?? 0.3); mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--use-angle=metal', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
await p.goto((process.env.BASE || 'http://127.0.0.1:5320') + '/?shot=1&nohud=1&noenemies=1&record=1'); await p.waitForFunction(() => window.__ready, null, { timeout: 180000 });
const ev = (f, a) => p.evaluate(f, a);
const cam = async (n, pos, look, fov = 68) => { await ev(([pos, look, fov]) => { const G = __G, c = G.R.camera; G.viewModelVisible = false; G.camLocked = true; c.position.set(...pos); c.lookAt(...look); c.fov = fov; c.updateProjectionMatrix(); __step(4); }, [pos, look, fov]); await p.screenshot({ path: `${out}/${n}.jpg`, type: 'jpeg', quality: 84 }); console.log('shot', n); };
await ev(() => __step(40));
// dusk: the yard as the bar, then the same kind of view in B and C
await cam('d1_yard', [-2, 1.7, -4], [-4, 0.6, -22]);
await cam('d2_unit_ground', [-14, 1.7, -40], [0, 0.8, -56]);
await cam('d3_unit_cabin', [2, 1.7, -60], [14, 1, -70]);
await cam('d4_farm_lane', [-47, 1.7, -14], [-47, 0.8, -40]);
await cam('d5_farm_bund', [-40, 1.7, -36], [-60, 0.8, -50]);
await cam('d6_farm_pad', [-36, 1.7, -10], [-50, 0.5, 2]);
// night in the tank farm, the way act 3 leaves it
await ev((s) => { const G = __G; Object.assign(G.env.S, { night: 1, storm: s, front: -140 }); __step(90); }, nightStorm);
await cam('n1_farm_cross', [-47, 1.7, -14], [-47, 2, -40]);
await cam('n2_farm_tank', [-40, 1.7, -36], [-60, 3, -50]);
await cam('n3_pad', [-36, 1.7, -10], [-50, 0.5, 2]);
await cam('n4_unit', [-6, 1.7, -42], [2, 4, -60]);
console.log(JSON.stringify(await ev(() => __errors.slice(0, 3))));
await b.close();
