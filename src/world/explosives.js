import * as THREE from 'three';
import { instance } from './assets.js';
// Shootable fuel drums: take damage from bullets, ignite, then explode (fireball, shockwave,
// area damage to robots and the player, shake, sound). The wreck stays as scorched debris.
// a burnt copy of a material that keeps its shader patch (a plain clone drops onBeforeCompile: a new, unpatched shader compiles mid-game)
function charred(src, k) { const c = src.clone(); c.onBeforeCompile = src.onBeforeCompile; c.customProgramCacheKey = src.customProgramCacheKey; c.userData = { ...src.userData }; c.color?.multiplyScalar(k); return c; }
export function createExplosives(G) {
  const list = G.level.explosives || [];
  const burning = [];
  function hurt(o, dmg) {
    const ex = o.userData.explosive; if (!ex || ex.dead) return;
    ex.hp -= dmg;
    if (ex.hp <= 0 && !ex.lit) { ex.lit = true; ex.fuse = 0.35 + Math.random() * 0.3; burning.push(o); }
  }
  const owner = (ob) => { let o = ob; while (o && !o.userData.explosive) o = o.parent; return o; };
  // carbine rounds set off drums and gas racks; a storage tank shrugs them off (it takes a grenade, a lance slug, the beam, a chain)
  G.events.on('weapon:fire', (e) => { const o = owner(e.hitW?.object); if (o) hurt(o, o.userData.explosive.big ? 2 : 26); });
  G.events.on('lance:fire', (e) => { const o = owner(e.hitW?.object); if (o) hurt(o, 260 + 260 * e.k); });
  G.events.on('explosion', (e) => { for (const o of list) { const ex = o.userData.explosive; if (ex.dead || ex.lit) continue;
    if (ex.big) { const r = (ex.r ??= new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).x * 0.5); if (o.position.distanceTo(e.pos.clone().setY(o.position.y)) < r + 3.5) hurt(o, 210 * e.size); }
    else if (o.position.distanceTo(e.pos) < 4.5) { ex.lit = true; ex.fuse = 0.18 + Math.random() * 0.25; burning.push(o); } } });
  function boom(o) {
    const ex = o.userData.explosive; ex.dead = true;
    if (ex.big) return bigBoom(o, ex);
    const p = o.position.clone().setY(0.7);
    blast(p, 1.3, 6, 160);
    // wreck: flatten + char
    o.scale.y *= 0.45; o.traverse((m) => { if (m.isMesh) { m.material = charred(m.material, 0.25); m.material.roughness = 1; } });
    if (ex.box) { ex.box.max.y = ex.box.min.y + 0.5; }
  }
  // shared area effect for drums, grenades, tanks: fireball + falloff damage to robots and player + shake
  function blast(p, size, r, dmg) {
    G.fxs?.explosion(p, size);
    for (const e of G.enemies?.list || []) { if (!e.alive) continue; const d = e.root.position.distanceTo(p); if (d < r) G.enemies.damage(e, dmg * (1 - d / r) + 20, { part: 'body', point: e.root.position.clone().setY(1) }, e.root.position.clone().sub(p).normalize()); }
    G.events.emit('blast', { pos: p.clone(), r, dmg });
    const pd = G.player.s.pos.distanceTo(p); if (pd < r * 0.9 && !G.god) G.player.damage(Math.round(dmg * 0.34 * (1 - pd / (r * 0.9))), p);
    G.player.addShake(THREE.MathUtils.clamp(1 - pd / (r * 4), 0, 1) * 0.9);
  }
  // storage tank: chained blasts up the shell, a tall fireball, the shell swaps to a torn wreck that burns on
  async function bigBoom(o, ex) {
    const sz = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()), c = o.position.clone();
    for (let i = 0; i < 4; i++) setTimeout(() => blast(c.clone().add(new THREE.Vector3((Math.random() - 0.5) * sz.x * 0.6, 1 + i * sz.y * 0.25, (Math.random() - 0.5) * sz.z * 0.6)), 2.2 + i * 0.4, 13, 260), i * 140);
    G.slowmo(0.35, 0.6); G.events.emit('tank:boom', { pos: c.clone() });
    G.fxs?.mushroom(c.clone().setY(0), sz.y * (ex.mega ? 2.4 : 1.5), Math.max(sz.x, sz.z) * (ex.mega ? 0.5 : 0.38));
    for (let i = 0; i < 7; i++) { const a = Math.random() * 6.28, r = sz.x * (0.3 + Math.random() * 0.5); G.fire?.add(new THREE.Vector3(c.x + Math.cos(a) * r, 0.05, c.z + Math.sin(a) * r), { size: 1 + Math.random() * 1.5, life: 120 + Math.random() * 120 }); }
    G.fire?.add(c.clone().setY(sz.y * 0.55), { size: 3.2, life: 300 });
    if (ex.mega) { // the LPG sphere: a fireball that climbs into the sky, a ground-wide shock, and it sets off the tanks beside it
      for (let i = 0; i < 6; i++) setTimeout(() => blast(c.clone().add(new THREE.Vector3((Math.random() - 0.5) * sz.x, sz.y * (0.4 + i * 0.18), (Math.random() - 0.5) * sz.z)), 3.4 + i * 0.3, 20, 420), 200 + i * 120);
      G.slowmo(1.4, 0.3); G.player.addShake(1); G.R.fx.punch = 1;
      setTimeout(() => { for (const t of list) { const e2 = t.userData.explosive; if (t !== o && e2?.big && !e2.dead && t.position.distanceTo(c) < 24) hurt(t, 9999); } }, 650);
      setTimeout(() => { o.traverse((m) => { if (m.isMesh) { m.material = charred(m.material, 0.18); m.material.roughness = 1; } }); o.scale.y *= 0.55; o.rotation.z = 0.12; if (ex.box) ex.box.max.y = ex.box.min.y + sz.y * 0.5; }, 300);
      return;
    }
    const w = await instance('tank_wreck');
    setTimeout(() => {
      o.visible = false; if (!w.name.endsWith('_placeholder')) { w.position.copy(o.position); w.rotation.copy(o.rotation); const ws = new THREE.Box3().setFromObject(w).getSize(new THREE.Vector3()); w.scale.setScalar(Math.max(sz.x, sz.z) / Math.max(ws.x, ws.z)); o.parent.add(w); }
      if (ex.box) ex.box.max.y = ex.box.min.y + sz.y * 0.6;
    }, 280);
  }
  function update(dt) {
    for (let i = burning.length - 1; i >= 0; i--) {
      const o = burning[i], ex = o.userData.explosive;
      ex.fuse -= dt;
      if (Math.random() < 0.6) G.fxs?.emit(false, { pos: o.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.9, (Math.random() - 0.5) * 0.6)), vel: new THREE.Vector3(0, 2.5, 0), life: 0.35, size: 0.25, size1: 0.6, col: [12, 5, 1.2], drag: 2, soft: true });
      if (ex.fuse <= 0) { burning.splice(i, 1); boom(o); }
    }
  }
  return { update, hurt, blast };
}
