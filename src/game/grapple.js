// Grapple onto the colossus. Once a knee is gone and it is down on its knees, a mark appears on its back: look at it
// and press E, a cable fires and hauls you up onto the hull's front deck. Up there it carries you: WASD walks the deck,
// the exposed coolant cores sit at the deck edges right below you and take extra damage at that range, the machine
// bucks to throw you, and its beam cannot reach its own back. Space jumps off; it throws you when it overloads.
// The deck is baked once at load: a height grid over the hull top (hull-local metres), cast straight down.
export function createGrapple(G) {
  const THREE = G.THREE, B = G.boss, R = G.R; if (!B) return { update() {}, available: () => false };
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const H = B.hull;
  // ---- deck height grid (1 m cells) over x[-4,4] z[-8,6] in hull space; null = not walkable (mast, stacks, off the edge)
  const X0 = -4, Z0 = -8, NX = 9, NZ = 15, grid = new Array(NX * NZ).fill(null);
  {
    const meshes = []; H.traverse((m) => { if (m.isMesh && m.geometry.attributes.position.count > 200) meshes.push(m); });
    const vis = B.root.visible; B.root.visible = true; H.parent.updateMatrixWorld(true);
    const inv = H.matrixWorld.clone().invert(), q = H.getWorldQuaternion(new THREE.Quaternion()), down = V(0, -1, 0).applyQuaternion(q), rc = new THREE.Raycaster();
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      rc.set(V(X0 + i, 12, Z0 + j).applyMatrix4(H.matrixWorld), down); const h = rc.intersectObjects(meshes, false)[0];
      if (h) { const y = h.point.applyMatrix4(inv).y; if (y > -1 && y < 3.2) grid[j * NX + i] = y; }
    }
    B.root.visible = vis;
  }
  const cell = (x, z) => { const i = Math.round(x - X0), j = Math.round(z - Z0); return i < 0 || j < 0 || i >= NX || j >= NZ ? null : grid[j * NX + i]; };
  const ANCHOR = V(0, 0, 3.2), DECK = { x0: -3.3, x1: 3.3, z0: -7.4, z1: 5.4 };
  // ---- the cable: a thin bright line from the gun to the anchor, created up front
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1, 6, 1, true).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.0, 1.5), toneMapped: false }));
  cable.visible = false; cable.frustumCulled = false; R.scene.add(cable);
  const S = { mode: 'idle', t: 0, from: V(), local: V(), cd: 0, buck: 3, jolt: V() };
  const _a = V(), _q = new THREE.Quaternion(), _w = V(), _m = V(), _prev = V();
  const anchorWorld = (out = V()) => H.localToWorld(out.copy(ANCHOR));
  function available() { const b = B.S, f = G.flow?.S; return !!(b.active && !b.dead && b.legBroken && !b.overload && !G.player.s.dead && f?.state === 'play' && S.cd <= 0); }
  function aimable() {
    if (S.mode !== 'idle' || !available() || G.cinematic) return false;
    const cam = R.camera, a = anchorWorld(_a), d = a.clone().sub(cam.position), L = d.length(); if (L > 36) return false;
    const fwd = cam.getWorldDirection(_w); return fwd.dot(d.divideScalar(L)) > 0.94;
  }
  function stand() { // keep the player on the deck point S.local, at the deck height there
    const h = cell(S.local.x, S.local.z); S.local.y = (h ?? S.local.y) + 0.02;
    const ps = G.player.s; _m.copy(S.local).add(S.jolt); H.localToWorld(_m); ps.pos.copy(_m);
  }
  function detach(kind) {
    const ps = G.player.s; ps.ride = null; S.mode = 'idle'; S.cd = 5; cable.visible = false;
    const out = ps.pos.clone().sub(H.getWorldPosition(_w)).setY(0).normalize();
    ps.vel.set(out.x * (kind === 'thrown' ? 9 : 6), kind === 'thrown' ? 7 : 5.5, out.z * (kind === 'thrown' ? 9 : 6)); ps.grounded = false;
    G.player.addShake(kind === 'thrown' ? 0.5 : 0.2); G.events.emit('grapple:off', { kind });
  }
  // the player module calls this instead of its own physics while riding
  const ride = { step(dt, w, jump) {
    if (S.mode !== 'ride') return;
    if (jump) { detach('jump'); return; }
    _q.copy(H.getWorldQuaternion(_q)).invert(); const lw = _w.copy(w).applyQuaternion(_q);
    const nx = THREE.MathUtils.clamp(S.local.x + lw.x * dt * 0.75, DECK.x0, DECK.x1), nz = THREE.MathUtils.clamp(S.local.z + lw.z * dt * 0.75, DECK.z0, DECK.z1);
    if (cell(nx, nz) != null) { S.local.x = nx; S.local.z = nz; } else if (cell(nx, S.local.z) != null) S.local.x = nx; else if (cell(S.local.x, nz) != null) S.local.z = nz;
    stand();
  } };
  function update(dt) {
    const ps = G.player.s, I = G.input, rdt = G.realDt || dt; S.cd = Math.max(0, S.cd - dt);
    if (S.mode === 'idle') {
      if (aimable()) {
        if (!G.interact || G.interact.v === 'grapple') G.interact = { v: 'grapple', label: 'GRAPPLE ONTO ITS BACK', prog: 0, near: true, key: 'E' };
        if (I.pressed('use') || G.auto?.grapple) { if (G.auto) G.auto.grapple = false; S.mode = 'pull'; S.t = 0; S.from.copy(ps.pos); G.interact = null; G.audio?.play?.('dash', { gain: 0.9, rate: 0.7 }); G.events.emit('grapple:fire', {}); }
      } else if (G.interact?.v === 'grapple') G.interact = null;
      return;
    }
    if (S.mode === 'pull') { // hauled up along an arc that keeps tracking the moving anchor
      if (!B.S.active || B.S.dead) { S.mode = 'idle'; cable.visible = false; return; }
      S.t += rdt; const k = Math.min(1, S.t / 0.75), e = k * k * (3 - 2 * k), a = anchorWorld(_a);
      ps.pos.lerpVectors(S.from, a, e).y += Math.sin(Math.PI * e) * 2.6; ps.vel.set(0, 0, 0); ps.fovKick = Math.max(ps.fovKick || 0, 10 * (1 - k));
      const g = R.camera.position.clone().add(V(0.18, -0.2, 0).applyQuaternion(R.camera.quaternion)), d = a.clone().sub(g);
      cable.visible = true; cable.position.copy(g); cable.quaternion.setFromUnitVectors(V(0, 1, 0), d.clone().normalize()); cable.scale.set(1, d.length(), 1);
      if (k >= 1) { S.mode = 'ride'; S.local.copy(ANCHOR); S.buck = 2.5; cable.visible = false; ps.ride = ride; G.player.addShake(0.45); G.events.emit('grapple:on', {}); G.hud?.banner?.('ON ITS BACK', { kind: 'good', sub: 'SHOOT THE CORES — SPACE TO JUMP OFF', dur: 2.6, pri: 2 }); }
      return;
    }
    // riding: thrown off when it overloads or dies; it bucks every few seconds; re-seat after the boss moved this frame
    if (!B.S.active || B.S.dead || B.S.overload) { detach('thrown'); return; }
    S.buck -= dt; if (S.buck <= 0) { S.buck = 3.5 + Math.random() * 2; S.jolt.set((Math.random() - 0.5) * 0.5, 0.25, (Math.random() - 0.5) * 0.5); G.player.addShake(0.35); G.events.emit('boss:step', { pos: H.getWorldPosition(_w) }); }
    S.jolt.multiplyScalar(Math.exp(-dt * 5));
    _prev.copy(ps.pos); stand(); R.camera.position.add(_w.copy(ps.pos).sub(_prev)); // the hull moved after the player updated: carry the camera too
  }
  return { update, available, anchorWorld, get riding() { return S.mode === 'ride'; }, S };
}
