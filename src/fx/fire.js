import * as THREE from 'three';

// Fire and leaks. Fires are particle flame tongues (additive, stretched upward) with smoke, embers,
// burn damage and a flickering light from a small pool that also scatters in the volume. Shooting a
// pipe or valve opens a leak: a gas jet that turns into a fire jet as soon as any flame touches it.
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const MAXF = 40, MAXL = 6, LIGHTS = 6;

export function createFire(G) {
  const R = G.R, rnd = G.rng;
  const fires = [], leaks = [];
  const lights = []; for (let i = 0; i < LIGHTS; i++) { const l = new THREE.PointLight(0xff7a2a, 0, 10, 2); l.layers.enable(1); R.scene.add(l); R.volLights.push(l); lights.push(l); }

  // size ~ flame height in metres; life in seconds (Infinity = permanent)
  function add(pos, { size = 1, life = 8, dir = null, dmg = 22, smoke = true } = {}) {
    if (fires.length >= MAXF) fires.shift();
    const f = { pos: pos.clone(), size, life, age: 0, dir: dir ? dir.clone().normalize() : null, dmg, acc: 0, seed: rnd() * 100, smoke };
    fires.push(f); return f;
  }
  function leak(pos, nrm) {
    if (leaks.length >= MAXL || leaks.some((l) => l.pos.distanceTo(pos) < 1.5)) return null;
    const l = { pos: pos.clone(), dir: nrm.clone().normalize(), age: 0, life: 14, fire: null };
    leaks.push(l); G.events.emit('leak', { pos: l.pos.clone() }); return l;
  }
  const ignite = (l) => { if (!l.fire) { l.fire = add(l.pos, { size: 1.3, life: l.life - l.age, dir: l.dir, dmg: 45 }); G.events.emit('ignite', { pos: l.pos.clone() }); } };

  // pipes and valves vent when shot
  G.events.on('weapon:fire', (e) => {
    const h = e.hitW; if (!h || !h.object) return;
    let o = h.object, n = ''; while (o) { if (o.name === 'pipes' || o.name === 'valves') { n = o.name; break; } o = o.parent; }
    if (n && rnd() < 0.5) leak(h.point.clone().addScaledVector(h.normal, 0.02), h.normal);
  });
  // explosions start fires around them and light every leak in reach
  G.events.on('explosion', (e) => {
    const n = 2 + Math.round(e.size * 1.5);
    for (let i = 0; i < n; i++) { const a = rnd() * 6.28, r = (0.4 + rnd() * 1.8) * e.size; add(V(e.pos.x + Math.cos(a) * r, 0.05, e.pos.z + Math.sin(a) * r), { size: 0.4 + rnd() * 0.6 * e.size, life: 6 + rnd() * 8 }); }
    for (const l of leaks) if (l.pos.distanceTo(e.pos) < 4 + e.size * 2) ignite(l);
  });

  for (const p of G.level?.flares || []) add(p, { size: 4.2, life: Infinity, dmg: 0, smoke: false }); // clean gas flare
  const _p = V(0, 0, 0), _v = V(0, 0, 0), _a = V(0, 0, 0), _b = V(0, 0, 0);
  function flames(f, dt) {
    const fx = G.fxs, k = f.age < 0.4 ? f.age / 0.4 : 1, end = f.life - f.age < 2 ? Math.max(0, (f.life - f.age) / 2) : 1, s = f.size * k * end;
    if (s < 0.02) return;
    f.acc += dt * (f.dir ? 70 : 34 + 30 * s);
    while (f.acc > 1) { f.acc -= 1;
      if (f.dir) { // jet: fast tongues along the nozzle direction, bending upward
        _v.copy(f.dir).multiplyScalar(5 + rnd() * 4).add(V((rnd() - 0.5) * 1.2, 1 + rnd(), (rnd() - 0.5) * 1.2));
        fx.emit(false, { pos: f.pos, vel: _v, life: 0.3 + rnd() * 0.25, size: 0.16 * s, size1: 0.5 * s, stretch: 0.25 * s, col: rnd() < 0.3 ? [20, 11, 3.5] : [13, 4.5, 1], drag: 2.2, rise: 3, soft: true });
      } else {
        const a = rnd() * 6.28, r = Math.sqrt(rnd()) * 0.35 * s;
        _p.set(f.pos.x + Math.cos(a) * r, f.pos.y + 0.05, f.pos.z + Math.sin(a) * r);
        const core = r < 0.15 * s;
        fx.emit(false, { pos: _p, vel: V((rnd() - 0.5) * 0.4, 1.4 + rnd() * 1.6 * s, (rnd() - 0.5) * 0.4), life: 0.35 + rnd() * 0.4, size: (core ? 0.3 : 0.22) * s, size1: 0.04, stretch: 0.22 * s, col: core ? [22, 12, 4] : [12, 3.8, 0.8], drag: 1.5, rise: 2.5, soft: true });
      }
    }
    if (f.smoke && rnd() < dt * (3 + 4 * s)) fx.emit(true, { pos: V(f.pos.x, f.pos.y + 0.9 * s, f.pos.z), vel: V(0.4 + (rnd() - 0.5) * 0.5, 1.1 + rnd() * 0.6, 0.2 + (rnd() - 0.5) * 0.5), life: 3.5 + rnd() * 2, size: 0.3 * s, size1: 2.2 * s, col: fx.litColor([0.05, 0.045, 0.04]), alpha: 0.6, soft: true, drag: 0.5, rise: 0.5, spin: 0.4 });
    if (rnd() < dt * (6 + 10 * s)) fx.emit(false, { pos: V(f.pos.x + (rnd() - 0.5) * 0.4 * s, f.pos.y + 0.4 * s, f.pos.z + (rnd() - 0.5) * 0.4 * s), vel: V((rnd() - 0.5) * 1.5, 2 + rnd() * 3, (rnd() - 0.5) * 1.5), life: 1 + rnd() * 1.2, size: 0.008, stretch: 0.03, col: [16, 6, 1.5], drag: 0.6, rise: 1.2 });
  }
  function burn(f, dt) {
    const reach = f.dir ? 3.5 : 0.9 * f.size + 0.4;
    const hits = (p) => { if (!f.dir) return p.distanceTo(f.pos) < reach; _a.copy(p).sub(f.pos); const t = _a.dot(f.dir); if (t < 0 || t > reach) return false; return _a.addScaledVector(f.dir, -t).length() < 0.6 + t * 0.25; };
    for (const e of G.enemies?.list || []) { if (!e.alive) continue; _b.copy(e.root.position).setY(e.root.position.y + 0.9); if (hits(_b)) G.enemies.damage(e, f.dmg * dt, { part: 'body', point: _b.clone() }, V(0, 0, 1)); }
    const pp = G.player.s.pos; _b.set(pp.x, pp.y + 0.9, pp.z); if (!G.god && hits(_b)) { f.pdmg = (f.pdmg || 0) + f.dmg * 0.5 * dt; if (f.pdmg >= 1) { G.player.damage(Math.floor(f.pdmg), f.pos); f.pdmg %= 1; } }
  }
  function update(dt) {
    const cam = R.camera.position;
    for (let i = leaks.length - 1; i >= 0; i--) {
      const l = leaks[i]; l.age += dt; if (l.age > l.life) { leaks.splice(i, 1); continue; }
      if (!l.fire) { // white gas jet
        if (rnd() < dt * 40) G.fxs?.emit(true, { pos: l.pos, vel: l.dir.clone().multiplyScalar(4 + rnd() * 3).add(V((rnd() - 0.5) * 0.6, 0.3, (rnd() - 0.5) * 0.6)), life: 0.7 + rnd() * 0.5, size: 0.05, size1: 0.7, col: G.fxs.litColor([0.7, 0.7, 0.7]), alpha: 0.35, soft: true, drag: 2.5, rise: 0.6 });
        for (const f of fires) if (f !== l.fire && f.pos.distanceTo(l.pos) < 2.2) { ignite(l); break; }
      }
    }
    for (let i = fires.length - 1; i >= 0; i--) {
      const f = fires[i]; f.age += dt; if (f.age > f.life) { fires.splice(i, 1); continue; }
      flames(f, dt); burn(f, dt);
    }
    // lights: the biggest fires nearest the camera get one each, with flicker
    const ranked = fires.slice().sort((a, b) => b.size / (4 + b.pos.distanceTo(cam)) - a.size / (4 + a.pos.distanceTo(cam)));
    for (let i = 0; i < LIGHTS; i++) {
      const l = lights[i], f = ranked[i];
      if (!f) { l.intensity = 0; continue; }
      const t = G.time * 13 + f.seed, flick = 0.75 + 0.18 * Math.sin(t) + 0.12 * Math.sin(t * 2.7 + 1.3) + 0.08 * (rnd() - 0.5);
      const end = Math.min(1, (f.life - f.age) / 2, f.age / 0.3);
      l.position.set(f.pos.x, f.pos.y + 0.6 * f.size, f.pos.z); l.distance = 6 + 5 * f.size; l.intensity = (14 + 22 * f.size) * flick * end;
    }
  }
  return { update, add, leak, fires, leaks };
}
