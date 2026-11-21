import * as THREE from 'three';
import { instance } from '../world/assets.js';

// Seeker drones (Hi3D model). They come in high over the walls, circle the player at rooftop height and snipe
// with short bursts; after a while — or once they are hurt — one locks on (eye strobes red, a rising beep),
// then dives straight at where the player stood and detonates. Dash out of the line. Two rifle hits bring
// one down: it spins out trailing smoke and pops where it lands. In the storm the red eyes are all you see.
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const CFG = { hp: 45, r: 0.55, speed: 9, accel: 7, alt: [4.5, 7.5], orbit: [7, 12], burst: 3, gap: 0.12, shotDmg: 3, cool: [2.4, 3.8], lock: 0.9, dive: 19, boom: 34, life: [11, 17] };

export async function createDrones(G) {
  const R = G.R, scene = R.scene, P = G.phys, rnd = G.rng;
  const src = await instance('drone');
  src.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = false; } });
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.4)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const list = [];
  const B = G.level.layout.bounds;

  function spawn(from, opts = {}) {
    const root = new THREE.Group(); const body = src.clone(true); body.rotation.y = Math.PI; root.add(body); // nose (eye) toward -Z
    const eye = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(6, 0.5, 0.25), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
    eye.scale.setScalar(0.5); eye.position.set(0, 0.12, -0.42); root.add(eye);
    root.position.copy(from); scene.add(root);
    const d = { root, body, eye, kind: 'drone', alive: true, hp: CFG.hp, maxHp: CFG.hp, vel: V(), mode: 'orbit', t: 0, modeT: 0, fireT: 1.5 + rnd() * 2, burstN: 0,
      oa: rnd() * 6.28, ow: (rnd() < 0.5 ? -1 : 1) * (0.35 + rnd() * 0.25), or: CFG.orbit[0] + rnd() * (CFG.orbit[1] - CFG.orbit[0]), alt: CFG.alt[0] + rnd() * (CFG.alt[1] - CFG.alt[0]),
      life: CFG.life[0] + rnd() * (CFG.life[1] - CFG.life[0]), scanT: 0, lastShotT: -99, diveTo: V(), spin: 0, loop: G.audio?.loop?.('droneLoop', { ref: 5, roll: 0.8 }) || null, id: list.length };
    list.push(d); G.events.emit('drone:spawn', { d }); return d;
  }
  // the whole flight is in the yard's air: these helpers keep it out of the ground and off the props
  const _a = V(), _b = V(), _t = V(), _f = V();
  function steer(d, target, speed, dt) {
    _t.copy(target).sub(d.root.position); const L = _t.length(); if (L > 1e-3) _t.multiplyScalar(Math.min(speed, L * 2) / L);
    // feel ahead: climb over anything in the way
    if (d.vel.lengthSq() > 0.5) { _f.copy(d.vel).normalize(); const h = P.raycast(d.root.position, _f, 3.5); if (h) _t.y += 6; }
    d.vel.lerp(_t, Math.min(1, CFG.accel * dt / Math.max(1, d.vel.distanceTo(_t))));
    d.root.position.addScaledVector(d.vel, dt); if (d.root.position.y < 1.6) { d.root.position.y = 1.6; d.vel.y = Math.max(0, d.vel.y); }
  }
  const eyeP = () => G.R.camera.getWorldPosition(_b);
  function shoot(d) {
    const m = d.root.position.clone().add(V(0, -0.25, 0)), pe = eyeP().clone(), dir = pe.clone().sub(m).normalize();
    const sp = 0.05 * (G.player.s.speed > 3 ? 1.5 : 1); dir.x += (rnd() - 0.5) * sp; dir.y += (rnd() - 0.5) * sp; dir.z += (rnd() - 0.5) * sp; dir.normalize();
    const hw = P.raycast(m, dir, 80), pc = G.player.s.pos.clone().setY(G.player.s.pos.y + 1.1), t = pc.clone().sub(m).dot(dir), cl = m.clone().addScaledVector(dir, t);
    const hit = t > 0 && cl.distanceTo(pc) < 0.55 && (!hw || hw.distance > t);
    G.fxs?.tracer(m, hit ? cl : hw ? hw.point : m.clone().addScaledVector(dir, 80), true); R.flash(m, 0xff5a3a, 10, 5, 0.04);
    if (hit) G.player.damage(CFG.shotDmg, d.root.position.clone()); else if (hw) G.fxs?.impact(hw, dir);
    if (!hit && t > 0 && cl.distanceTo(pc) < 3) G.events.emit('whiz', { pos: cl, d: cl.distanceTo(pc) });
    d.lastShotT = G.time; G.events.emit('enemy:fire', { pos: m, drone: true });
  }
  function explode(d, p, big) {
    if (!d.alive && d.mode === 'gone') return; d.mode = 'gone'; d.alive = false; d.root.visible = false; d.loop?.stop(0.3);
    G.explosives?.blast(p, big ? 0.9 : 0.55, big ? 3.4 : 2.4, big ? CFG.boom : 12);
  }
  function kill(d, dir) {
    if (!d.alive) return; d.alive = false; d.mode = 'falling'; d.spin = (rnd() < 0.5 ? -1 : 1) * (8 + rnd() * 6);
    d.vel.add(V(dir.x * 3, 1.5, dir.z * 3)); G.fxs?.electric(d.root.position.clone());
    R.flash(d.root.position, 0xffa060, 30, 6, 0.08);
    G.events.emit('enemy:killed', { e: d, drone: true, weak: false, melee: false, pos: d.root.position.clone() });
  }
  function damage(d, dmg, point, dir) {
    if (!d.alive) return; d.hp -= dmg; G.events.emit('enemy:hit', { e: d, weak: false, point });
    for (let i = 0; i < 6; i++) G.fxs?.emit(false, { pos: point, vel: V((rnd() - 0.5) * 5, rnd() * 3, (rnd() - 0.5) * 5), life: 0.2 + rnd() * 0.15, size: 0.01, stretch: 0.04, col: [14, 8, 3], grav: 9.8, drag: 2 });
    d.vel.addScaledVector(dir, 2.5);
    if (d.hp <= 0) kill(d, dir); else if (d.mode === 'orbit' && d.hp < CFG.hp * 0.6 && rnd() < 0.5) lock(d); // a hurt drone commits
  }
  function lock(d) { d.mode = 'lock'; d.modeT = 0; G.events.emit('drone:lock', { d }); }
  G.events.on('blast', (e) => { for (const d of list) if (d.alive) { const L = d.root.position.distanceTo(e.pos); if (L < e.r * 1.2) damage(d, 999, d.root.position.clone(), d.root.position.clone().sub(e.pos).normalize()); } });

  function hitTest(o, dir, maxD) {
    let best = null;
    for (const d of list) {
      if (!d.alive) continue; _a.copy(d.root.position).sub(o); const t = _a.dot(dir); if (t < 0 || t > maxD) continue;
      const dd = _a.addScaledVector(dir, -t).length(); if (dd > CFG.r) continue;
      const dist = t - Math.sqrt(CFG.r * CFG.r - dd * dd); if (!best || dist < best.distance) best = { distance: dist, drone: d, point: o.clone().addScaledVector(dir, dist) };
    }
    return best;
  }
  function hitAll(o, dir, maxD) { const out = []; for (const d of list) { if (!d.alive) continue; const h = hitTest(o, dir, maxD); if (!h) break; out.push(h); h.drone.alive = false; } for (const h of out) h.drone.alive = true; return out; }

  function update(dt) {
    dt *= G.enemyTime ?? 1; const pp = G.player.s.pos, pdead = G.player.s.dead;
    for (const d of list) {
      if (d.mode === 'gone') continue;
      d.t += dt; d.modeT += dt; if (d.scanT > 0) d.scanT -= dt; if (G.od?.active) d.scanT = Math.max(d.scanT, 0.6);
      const pos = d.root.position;
      if (d.mode === 'falling') { // shot down: spin, smoke, pop where it lands
        d.vel.y -= 9.8 * dt; pos.addScaledVector(d.vel, dt); d.root.rotation.y += d.spin * dt; d.root.rotation.z += d.spin * 0.2 * dt;
        G.fxs?.emit(true, { pos: pos.clone(), vel: V(0, 0.5, 0), life: 1.2, size: 0.15, size1: 0.8, col: G.fxs.litColor([0.18, 0.17, 0.16]), alpha: 0.5, soft: true, drag: 1, rise: 0.4 });
        if (rnd() < 0.5) G.fxs?.emit(false, { pos: pos.clone(), vel: V((rnd() - 0.5) * 3, rnd() * 2, (rnd() - 0.5) * 3), life: 0.2, size: 0.012, stretch: 0.04, col: [14, 7, 2], grav: 9.8 });
        if (pos.y < 0.3 || P.blocked(pos.x, pos.z, 0.2, pos.y - 0.2, pos.y + 0.2)) explode(d, pos.clone().setY(Math.max(0.3, pos.y)), false);
        d.loop?.set(pos, 0.8, 0.7);
        continue;
      }
      const eye = eyeP(), see = !pdead && P.los(pos, eye);
      let eyeK = 1, eyeCol = 0;
      if (d.mode === 'orbit' || d.mode === 'fire') {
        d.oa += d.ow * dt; const tgt = _a.set(pp.x + Math.cos(d.oa) * d.or, d.alt + Math.sin(d.t * 0.9 + d.id) * 0.6, pp.z + Math.sin(d.oa) * d.or);
        tgt.x = THREE.MathUtils.clamp(tgt.x, B.minX - 4, B.maxX + 4); tgt.z = THREE.MathUtils.clamp(tgt.z, B.minZ - 4, B.maxZ + 4);
        steer(d, tgt, CFG.speed, dt);
        if (d.mode === 'orbit') { d.fireT -= dt; if (d.fireT <= 0.4) eyeK = 1 + 2.5 * (1 - d.fireT / 0.4); if (d.fireT <= 0 && see && !pdead) { d.mode = 'fire'; d.modeT = 0; d.burstN = 0; } else if (d.fireT <= 0) d.fireT = 0.5; }
        else if (d.modeT > CFG.gap * d.burstN) { if (see) shoot(d); d.burstN++; if (d.burstN >= CFG.burst) { d.mode = 'orbit'; d.fireT = CFG.cool[0] + rnd() * (CFG.cool[1] - CFG.cool[0]); } }
        if (d.t > d.life && d.mode === 'orbit' && see && !list.some((o) => o !== d && o.alive && (o.mode === 'lock' || o.mode === 'dive'))) lock(d);
      } else if (d.mode === 'lock') { // hold, turn on the player, strobe and beep
        d.vel.multiplyScalar(Math.exp(-4 * dt)); pos.addScaledVector(d.vel, dt);
        eyeK = 1.5 + 3 * (Math.sin(d.modeT * (12 + d.modeT * 30)) > 0 ? 1 : 0); eyeCol = 1;
        if (d.modeT >= CFG.lock) { d.mode = 'dive'; d.modeT = 0; d.diveTo.copy(pp).setY(pp.y + 0.9); d.vel.copy(d.diveTo).sub(pos).normalize().multiplyScalar(6); G.events.emit('drone:dive', { d }); }
      } else if (d.mode === 'dive') { // committed: a straight, accelerating line at where the player was
        _t.copy(d.diveTo).sub(pos); const L = _t.length(); _t.normalize(); d.vel.lerp(_t.multiplyScalar(CFG.dive), Math.min(1, dt * 4));
        const step = d.vel.length() * dt, h = P.raycast(pos, _f.copy(d.vel).normalize(), step + 0.4);
        pos.addScaledVector(d.vel, dt); eyeK = 4; eyeCol = 1;
        G.fxs?.emit(false, { pos: pos.clone(), vel: d.vel.clone().multiplyScalar(-0.1), life: 0.15, size: 0.05, size1: 0.01, col: [14, 3, 1] });
        if (pos.distanceTo(_b.copy(pp).setY(pp.y + 0.9)) < 1.7 || h || pos.y < 0.4 || L < 0.6 || d.modeT > 3) explode(d, pos.clone(), true);
      }
      if (d.mode === 'gone') continue;
      // attitude: face the player, bank into the motion, rotors buzz
      const want = Math.atan2(-(eye.x - pos.x), -(eye.z - pos.z));
      d.root.rotation.order = 'YXZ'; d.root.rotation.y += THREE.MathUtils.clamp(((want - d.root.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI, -6 * dt, 6 * dt);
      const lv = d.vel.clone().applyAxisAngle(V(0, 1, 0), -d.root.rotation.y);
      d.root.rotation.x = THREE.MathUtils.lerp(d.root.rotation.x, THREE.MathUtils.clamp(lv.z * 0.06, -0.5, 0.5) - (d.mode === 'dive' ? 0.6 : 0), Math.min(1, dt * 5));
      d.root.rotation.z = THREE.MathUtils.lerp(d.root.rotation.z, THREE.MathUtils.clamp(-lv.x * 0.06, -0.5, 0.5), Math.min(1, dt * 5));
      const inside = G.env?.S.inside || 0;
      d.eye.material.color.setRGB(6 * eyeK, (0.5 - 0.4 * eyeCol) * eyeK, 0.25 * eyeK); d.eye.scale.setScalar((0.45 + 0.5 * inside) * (0.8 + 0.2 * eyeK));
      d.loop?.set(pos, 1, (d.mode === 'dive' ? 1.35 : 1) + d.vel.length() * 0.01);
    }
  }
  return { update, spawn, list, hitTest, hitAll, damage, CFG, get alive() { return list.filter((d) => d.alive).length; } };
}
