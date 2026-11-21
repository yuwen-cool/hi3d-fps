import * as THREE from 'three';
import { createPhysics } from '../world/physics.js';
import { buildLevel } from '../world/level.js';
import { createInput, createPlayer } from '../player/player.js';

export async function buildGame(G, setLoad) {
  const R = G.R;
  G.phys = createPhysics();
  setLoad('level', 0.3);
  await buildLevel(G);
  G.input = createInput(R.renderer.domElement);
  G.player = createPlayer(G);
  const mods = [];
  setLoad('weapon', 0.5);
  try { const { createWeapon } = await import('../weapon/weapon.js'); G.weapon = await createWeapon(G); mods.push(['weapon', G.weapon]); } catch (e) { console.warn('weapon', e); }
  try { const { createFX } = await import('../fx/fx.js'); G.fxs = createFX(G); mods.push(['fx', G.fxs]); } catch (e) { console.warn('fx', e); }
  try { const { createScan } = await import('../fx/scan.js'); G.scan = createScan(G); mods.push(['scan', G.scan]); } catch (e) { console.warn('scan', e); }
  try { const { createFire } = await import('../fx/fire.js'); G.fire = createFire(G); mods.push(['fire', G.fire]); } catch (e) { console.warn('fire', e); }
  setLoad('enemies', 0.65);
  try { const { createEnemies } = await import('../enemies/enemies.js'); G.enemies = await createEnemies(G); mods.push(['enemies', G.enemies]); } catch (e) { console.warn('enemies', e); }
  try { const { createColossus } = await import('../enemies/colossus.js'); G.boss = await createColossus(G); mods.push(['boss', G.boss]); } catch (e) { console.warn('boss', e); }
  try { const { createExplosives } = await import('../world/explosives.js'); G.explosives = createExplosives(G); mods.push(['explosives', G.explosives]); } catch (e) { console.warn('explosives', e); }
  try { const { createAudio } = await import('../audio/audio.js'); G.audio = createAudio(G); mods.push(['audio', G.audio]); } catch (e) { console.warn('audio', e); }
  try { const { createHUD } = await import('../hud/hud.js'); G.hud = createHUD(G); mods.push(['hud', G.hud]); } catch (e) { console.warn('hud', e); }
  try { const { createEnv } = await import('../world/env.js'); G.env = createEnv(G); mods.push(['env', G.env]); } catch (e) { console.warn('env', e); }
  try { const { createDropship } = await import('./dropship.js'); G.ship = createDropship(G); mods.push(['ship', G.ship]); } catch (e) { console.warn('ship', e); }
  try { const { createCine } = await import('./cine.js'); G.cine = createCine(G); mods.push(['cine', G.cine]); } catch (e) { console.warn('cine', e); }
  try { const { createOverdrive } = await import('./overdrive.js'); G.od = createOverdrive(G); mods.push(['od', G.od]); } catch (e) { console.warn('overdrive', e); }
  try { const { createFlow } = await import('./flow.js'); G.flow = createFlow(G); mods.push(['flow', G.flow]); } catch (e) { console.warn('flow', e); }
  G.modules.player = G.player;
  for (const [n, m] of mods) G.modules[n] = m;
  G.modules.inputEnd = { update: () => G.input.endFrame() };
  // keep inputEnd last
  const ie = G.modules.inputEnd; delete G.modules.inputEnd; G.modules.inputEnd = ie;
  if (G.params.shot) G.player.s.pitch = +(G.params.pitch || 0.05);
}
