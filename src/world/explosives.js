import * as THREE from 'three';
// Shootable fuel drums: take damage from bullets, ignite, then explode (fireball, shockwave,
// area damage to robots and the player, shake, sound). The wreck stays as scorched debris.
export function createExplosives(G) {
  const list = G.level.explosives || [];
  const burning = [];
  function hurt(o, dmg) {
    const ex = o.userData.explosive; if (!ex || ex.dead) return;
    ex.hp -= dmg;
    if (ex.hp <= 0 && !ex.lit) { ex.lit = true; ex.fuse = 0.35 + Math.random() * 0.3; burning.push(o); }
  }
  G.events.on('weapon:fire', (e) => { const ob = e.hitW?.object; let o = ob; while (o && !o.userData.explosive) o = o.parent; if (o) hurt(o, 26); });
  G.events.on('explosion', (e) => { for (const o of list) { const ex = o.userData.explosive; if (!ex.dead && !ex.lit && o.position.distanceTo(e.pos) < 4.5) { ex.lit = true; ex.fuse = 0.18 + Math.random() * 0.25; burning.push(o); } } });
  function boom(o) {
    const ex = o.userData.explosive; ex.dead = true;
    const p = o.position.clone().setY(0.7);
    G.fxs?.explosion(p, 1.3);
    for (const e of G.enemies?.list || []) { if (!e.alive) continue; const d = e.root.position.distanceTo(p); if (d < 6) G.enemies.damage(e, 160 * (1 - d / 6) + 20, { part: 'body', point: e.root.position.clone().setY(1) }, e.root.position.clone().sub(p).normalize()); }
    const pd = G.player.s.pos.distanceTo(p); if (pd < 5.5) G.player.damage(Math.round(55 * (1 - pd / 5.5)), p);
    G.player.addShake(THREE.MathUtils.clamp(1 - pd / 24, 0, 1) * 0.75);
    // wreck: flatten + char
    o.scale.y *= 0.45; o.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); m.material.color?.multiplyScalar(0.25); m.material.roughness = 1; } });
    if (ex.box) { ex.box.max.y = ex.box.min.y + 0.5; }
  }
  function update(dt) {
    for (let i = burning.length - 1; i >= 0; i--) {
      const o = burning[i], ex = o.userData.explosive;
      ex.fuse -= dt;
      if (Math.random() < 0.6) G.fxs?.emit(false, { pos: o.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.9, (Math.random() - 0.5) * 0.6)), vel: new THREE.Vector3(0, 2.5, 0), life: 0.35, size: 0.25, size1: 0.6, col: [12, 5, 1.2], drag: 2, soft: true });
      if (ex.fuse <= 0) { burning.splice(i, 1); boom(o); }
    }
  }
  return { update, hurt };
}
