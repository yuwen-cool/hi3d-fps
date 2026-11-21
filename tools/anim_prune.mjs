// Keep only the animation clips the game plays (anim.js WANT) and the rig they need; meshes and the rest go.
//   node tools/anim_prune.mjs   (writes public/anim/*-used.glb from assets/anim/ or public/anim/ originals)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, resample, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { existsSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const WANT = {
  base: ['Idle_A', 'Jog', 'Walk', 'Sprint', 'Crouch_Idle', 'Crouch_Walk', 'Pistol_Aim_Neutral', 'Pistol_Shoot', 'Pistol_Reload', 'Pistol_Idle', 'Hit_Chest', 'Hit_Head', 'Death_D', 'Roll'],
  addon: ['Death_A', 'Death_B', 'Death_C', 'Strafe_left', 'Strafe_right', 'Walk_Backwards', 'Run_Stealth', 'Dodge_left', 'Dodge_right', 'Idle Hurt'],
};
mkdirSync('assets/anim', { recursive: true });
for (const [k, names] of Object.entries(WANT)) {
  const src = `assets/anim/human-${k}-animations.glb`, pub = `public/anim/human-${k}-animations.glb`;
  if (!existsSync(src)) copyFileSync(pub, src); // keep the full library outside public/
  const doc = await io.read(src); const root = doc.getRoot();
  const before = root.listAnimations().length;
  for (const a of root.listAnimations()) if (!names.includes(a.getName())) a.dispose();
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) p.dispose(); // the clips retarget onto the robot rig; the source mannequin's skin is not drawn
  await doc.transform(resample(), dedup(), prune({ keepLeaves: true }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const out = `public/anim/human-${k}-animations.glb`; await io.write(out, doc);
  console.log(k, before, '->', root.listAnimations().length, 'clips', (statSync(src).size / 1e6).toFixed(1), '->', (statSync(out).size / 1e6).toFixed(2), 'MB');
}
