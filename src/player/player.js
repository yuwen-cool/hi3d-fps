import * as THREE from 'three';

// Input + first-person controller. Numbers follow docs/SPEC.md §5 (Saltline-tuned feel).
export const MOVE = { walk: 3.8, sprint: 6.4, crouch: 1.9, ads: 2.4, accel: 34, decel: 26, airAccel: 9, gravity: 21, jumpH: 1.0, coyote: 0.12, buffer: 0.13,
  radius: 0.32, height: 1.8, crouchH: 1.15, eye: 1.68, eyeCrouch: 1.05, sens: 0.0021 };

export function createInput(canvas) {
  const keys = new Set(), pressed = new Set();
  const st = { dx: 0, dy: 0, fire: false, ads: false, locked: false, pressedFire: false };
  const map = { KeyW: 'fwd', KeyS: 'back', KeyA: 'left', KeyD: 'right', ShiftLeft: 'sprint', ShiftRight: 'sprint', Space: 'jump', ControlLeft: 'crouch', KeyC: 'crouch', KeyR: 'reload', KeyF: 'melee', KeyV: 'melee', KeyG: 'gl', KeyQ: 'scan', KeyE: 'use' };
  const clear = () => { keys.clear(); st.fire = st.ads = false; };
  addEventListener('keydown', (e) => { const a = map[e.code]; if (!a) return; if (!keys.has(a)) pressed.add(a); keys.add(a); e.preventDefault(); });
  addEventListener('keyup', (e) => { const a = map[e.code]; if (a) keys.delete(a); });
  for (const ev of ['blur', 'pagehide']) addEventListener(ev, clear);
  document.addEventListener('visibilitychange', () => document.hidden && clear());
  canvas.addEventListener('mousedown', (e) => {
    if (!st.locked) { canvas.requestPointerLock?.(); return; }
    if (e.button === 0) { st.fire = true; st.pressedFire = true; } if (e.button === 2) st.ads = true;
  });
  addEventListener('mouseup', (e) => { if (e.button === 0) st.fire = false; if (e.button === 2) st.ads = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('pointerlockchange', () => { st.locked = document.pointerLockElement === canvas; if (!st.locked) clear(); });
  addEventListener('mousemove', (e) => { if (!st.locked) return; if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return; st.dx += e.movementX; st.dy += e.movementY; });
  return {
    st, keys, clear, down: (a) => keys.has(a), pressed: (a) => pressed.has(a),
    endFrame() { pressed.clear(); st.dx = st.dy = 0; st.pressedFire = false; },
    // scripted control (demo/recording/tests)
    inject(o) { Object.assign(st, o); },
  };
}

export function createPlayer(G) {
  const R = G.R, P = G.phys, cam = R.camera;
  const s = {
    pos: G.level.layout.spawn.clone(), vel: new THREE.Vector3(), yaw: G.level.layout.spawnYaw, pitch: 0.02,
    grounded: true, airT: 0, coyote: 0, jumpBuf: 0, crouch: 0, eye: MOVE.eye, hp: 100, maxHp: 100, shield: 60, maxShield: 60, hurtT: 9, dead: false,
    dashT: 0, dashCd: 0, dashCdMax: 2.2, dashV: new THREE.Vector3(), slideT: 0, slideV: 0, slideDir: new THREE.Vector3(), lungeT: 0, lungeV: new THREE.Vector3(), speedFx: 0, fovKick: 0,
    sprinting: false, speed: 0, stepPhase: 0, bobAmt: 0, dip: 0, dipV: 0, trauma: 0, recoilP: 0, recoilY: 0, recoilOffP: 0, recoilOffY: 0, rollZ: 0,
    fovBase: 74, fov: 74, ads: 0, lastFireT: -9, t: 0, strafeV: 0, fwdV: 0, landedV: 0,
  };
  const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _w = new THREE.Vector3();
  function addShake(a) { s.trauma = Math.min(1, s.trauma + a); }
  function recoil(pitch, yaw) {
    // 35% sticks to the view, 65% goes into a recoverable offset
    s.pitch += pitch * 0.35; s.yaw += yaw * 0.35;
    s.recoilOffP = THREE.MathUtils.clamp(s.recoilOffP + pitch * 0.65, -0.3, 0.3);
    s.recoilOffY = THREE.MathUtils.clamp(s.recoilOffY + yaw * 0.65, -0.2, 0.2);
  }
  function damage(n, from) {
    if (s.dead || G.god) return;
    s.hurtT = 0; addShake(0.22 + n / 70);
    if (s.shield > 0) { const a = Math.min(s.shield, n); s.shield -= a; n -= a; if (s.shield <= 0) G.events.emit('player:shieldBreak'); }
    s.hp -= n;
    G.R.fx.damage = Math.min(1, G.R.fx.damage + 0.35 + n / 40);
    G.events.emit('player:hit', { dmg: n, from });
    if (s.hp <= 0) { s.hp = 0; s.dead = true; G.events.emit('player:dead'); }
  }
  function heal(n) { const h = s.hp; s.hp = Math.min(s.maxHp, s.hp + n); return s.hp > h; }
  function update(dt) {
    const I = G.input; s.t += dt;
    const inputOn = !G.cinematic && !s.dead;
    if (inputOn) {
      const k = MOVE.sens * (G.sens || 1) * (1 - 0.4 * s.ads);
      s.yaw -= I.st.dx * k; s.pitch -= I.st.dy * k;
      s.pitch = THREE.MathUtils.clamp(s.pitch, -1.5, 1.5);
    }
    // recoil recovery
    const sinceFire = s.t - s.lastFireT;
    if (sinceFire > 0.09) { const r = 1 - Math.exp(-6.5 * dt); s.recoilOffP -= s.recoilOffP * r; s.recoilOffY -= s.recoilOffY * r; }
    const fwd = inputOn ? (I.down('fwd') ? 1 : 0) - (I.down('back') ? 1 : 0) : (G.auto?.fwd || 0);
    const str = inputOn ? (I.down('right') ? 1 : 0) - (I.down('left') ? 1 : 0) : (G.auto?.str || 0);
    // dash (Shift tap, then hold to sprint) and slide (crouch while running)
    s.dashCd -= dt; s.dashT -= dt; s.lungeT -= dt;
    _f.set(-Math.sin(s.yaw), 0, -Math.cos(s.yaw)); _r.set(Math.cos(s.yaw), 0, -Math.sin(s.yaw));
    if (inputOn && (I.pressed('sprint') || G.auto?.dash) && s.dashCd <= 0 && s.slideT <= 0) {
      if (G.auto) G.auto.dash = false;
      _w.set(0, 0, 0).addScaledVector(_f, fwd || (str ? 0 : 1)).addScaledVector(_r, str).normalize();
      s.dashV.copy(_w).multiplyScalar(13.5); s.dashT = 0.17; s.dashCd = s.dashCdMax; s.speedFx = 1; s.fovKick = 9; addShake(0.06);
      if (s.vel.y < 0 && !s.grounded) s.vel.y *= 0.3;
      G.events.emit('player:dash', { dir: _w.clone() });
    }
    const hSpeed = Math.hypot(s.vel.x, s.vel.z);
    if (inputOn && I.pressed('crouch') && s.grounded && s.slideT <= 0 && (hSpeed > 5.2 || s.dashT > 0)) {
      s.slideDir.set(s.vel.x, 0, s.vel.z).normalize(); s.slideV = Math.max(hSpeed, 9.5); s.slideT = 0.9; s.speedFx = Math.max(s.speedFx, 0.7); s.fovKick = Math.max(s.fovKick, 6);
      G.events.emit('player:slide', { pos: s.pos.clone() });
    }
    if (s.slideT > 0) { s.slideT -= dt; s.slideV -= 8.5 * dt; if (s.slideV < 3.2 || (inputOn && !I.down('crouch') && s.slideT < 0.65) || !s.grounded && s.airT > 0.3) s.slideT = 0; }
    const sliding = s.slideT > 0;
    const crouchHeld = inputOn && (I.down('crouch') || sliding);
    s.crouch += ((crouchHeld ? 1 : 0) - s.crouch) * Math.min(1, dt * (sliding ? 16 : 11));
    s.sprinting = inputOn && I.down('sprint') && fwd > 0.55 && Math.abs(str) < 0.6 && !crouchHeld && s.ads < 0.35 && sinceFire > 0.25;
    s.sliding = sliding;
    const maxV = s.ads > 0.5 ? MOVE.ads : crouchHeld ? MOVE.crouch : s.sprinting ? MOVE.sprint : MOVE.walk * (fwd < 0 ? 0.82 : 1);
    _w.set(0, 0, 0).addScaledVector(_f, fwd).addScaledVector(_r, str); if (_w.lengthSq() > 1) _w.normalize();
    _w.multiplyScalar(maxV);
    const acc = s.grounded ? (_w.lengthSq() > 0.01 ? MOVE.accel : MOVE.decel) : MOVE.airAccel;
    const hv = new THREE.Vector2(s.vel.x, s.vel.z), tv = new THREE.Vector2(_w.x, _w.z);
    const d = tv.clone().sub(hv); const dl = d.length(); const step = acc * dt;
    if (dl > step) d.multiplyScalar(step / dl); hv.add(d); s.vel.x = hv.x; s.vel.z = hv.y;
    if (s.dashT > 0) { s.vel.x = s.dashV.x; s.vel.z = s.dashV.z; }
    else if (sliding) { s.vel.x = s.slideDir.x * s.slideV + _w.x * 0.15; s.vel.z = s.slideDir.z * s.slideV + _w.z * 0.15; }
    if (s.lungeT > 0) { s.vel.x = s.lungeV.x; s.vel.z = s.lungeV.z; }
    // jump: coyote time + buffer
    s.coyote = s.grounded ? MOVE.coyote : s.coyote - dt;
    if (inputOn && I.pressed('jump')) s.jumpBuf = MOVE.buffer; else s.jumpBuf -= dt;
    if (s.jumpBuf > 0 && s.coyote > 0 && s.crouch < 0.5) { s.vel.y = Math.sqrt(2 * MOVE.gravity * MOVE.jumpH); s.coyote = 0; s.jumpBuf = 0; G.events.emit('player:jump'); }
    s.vel.y -= MOVE.gravity * dt;
    const vyBefore = s.vel.y;
    const h = THREE.MathUtils.lerp(MOVE.height, MOVE.crouchH, s.crouch);
    const res = P.move(s.pos, s.vel, dt, MOVE.radius, h);
    if (res.grounded && !s.grounded && s.airT > 0.12) {
      const v = -vyBefore; s.dipV -= Math.min(v * 0.36, 3.2); if (v > 7.5) addShake(Math.min(0.5, (v - 7.5) * 0.06));
      G.events.emit('player:land', { v }); s.landedV = v;
    }
    s.grounded = res.grounded; s.airT = s.grounded ? 0 : s.airT + dt;
    s.speed = Math.hypot(s.vel.x, s.vel.z);
    // keep inside the yard
    const B = G.level.layout.bounds; s.pos.x = THREE.MathUtils.clamp(s.pos.x, B.minX, B.maxX); s.pos.z = THREE.MathUtils.clamp(s.pos.z, B.minZ, B.maxZ);
    // health regen
    s.hurtT += dt;
    if (!s.dead && s.hurtT > 3.2 && s.shield < s.maxShield) { s.shield = Math.min(s.maxShield, s.shield + 32 * dt); if (s.shield >= s.maxShield) G.events.emit('player:shieldUp'); }
    if (!s.dead && s.hurtT > 5 && s.hp % 10 > 0.01) s.hp = Math.min(Math.ceil(s.hp / 10) * 10, s.hp + 6 * dt); // only the damaged cell refills
    s.speedFx = Math.max(s.sprinting ? 0.12 : 0, s.speedFx - dt * 2.4); s.fovKick *= Math.exp(-dt * 5);
    G.R.fx.low += ((s.dead ? 1 : THREE.MathUtils.smoothstep(s.hp / s.maxHp, 0.55, 0.12) * 0 + (1 - THREE.MathUtils.smoothstep(s.hp / s.maxHp, 0.12, 0.55))) - G.R.fx.low) * Math.min(1, dt * 4);
    G.R.fx.damage = Math.max(0, G.R.fx.damage - dt * 1.9);
    G.R.fx.speed = s.speedFx;
    // camera: footsteps bob, landing dip spring, strafe roll, shake
    const A = THREE.MathUtils.clamp(s.speed / MOVE.walk, 0, 1) * (s.sprinting ? 1.9 : 1) * THREE.MathUtils.lerp(1, 0.22, s.ads) * (crouchHeld ? 0.7 : 1);
    s.bobAmt += (A * (s.grounded ? 1 : 0) - s.bobAmt) * Math.min(1, dt * 9);
    const stride = s.sprinting ? 2.1 : crouchHeld ? 1.05 : 1.55;
    if (s.grounded) { const prev = s.stepPhase; s.stepPhase += s.speed * dt / stride; if (Math.floor(prev) !== Math.floor(s.stepPhase) && s.speed > 0.5) G.events.emit('player:step', { sprint: s.sprinting, pos: s.pos }); }
    const hph = s.stepPhase;
    const bobY = -Math.cos(2 * Math.PI * hph) * 0.024 * s.bobAmt, bobX = Math.sin(Math.PI * hph) * 0.013 * s.bobAmt;
    s.dipV += (-s.dip * 150 - s.dipV * 17) * dt; s.dip = THREE.MathUtils.clamp(s.dip + s.dipV * dt, -0.2, 0.05);
    const lat = s.vel.x * _r.x + s.vel.z * _r.z;
    s.rollZ += (-lat / MOVE.sprint * 0.02 * THREE.MathUtils.lerp(1, 0.4, s.ads) + (sliding ? 0.07 : 0) - s.rollZ) * Math.min(1, dt * 8);
    s.trauma = Math.max(0, s.trauma - dt * 1.7); const tr = s.trauma * s.trauma, t = s.t;
    const shP = 0.03 * tr * (Math.sin(43.1 * t) + 0.6 * Math.sin(71.7 * t + 1.3));
    const shY = 0.03 * tr * (Math.sin(37.3 * t + 2.1) + 0.6 * Math.sin(83.9 * t));
    const shR = 0.045 * tr * (Math.sin(29.7 * t + 0.7) + 0.5 * Math.sin(61.3 * t + 4));
    s.eye += ((crouchHeld ? MOVE.eyeCrouch : MOVE.eye) - s.eye) * Math.min(1, dt * 11);
    let eyeY = s.eye; if (s.dead) { s.deadT = (s.deadT || 0) + dt; eyeY = THREE.MathUtils.lerp(s.eye, 0.22, Math.min(1, s.deadT / 0.85)); }
    if (!G.camLocked) {
      cam.position.set(s.pos.x + _r.x * bobX, s.pos.y + eyeY + bobY + s.dip, s.pos.z + _r.z * bobX);
      cam.rotation.set(s.pitch + s.recoilOffP + shP + s.dip * 0.12, s.yaw + s.recoilOffY + shY, s.rollZ + bobX * 0.35 + shR + (s.dead ? Math.min(1, (s.deadT || 0) / 0.85) * 1.15 : 0));
      const fovT = THREE.MathUtils.lerp(s.fovBase + (s.sprinting ? 6 : 0) + s.fovKick, 52, s.ads);
      s.fov += (fovT - s.fov) * Math.min(1, dt * (s.ads > 0.05 && s.ads < 0.95 ? 30 : 7));
      if (Math.abs(cam.fov - s.fov) > 0.01) { cam.fov = s.fov; cam.updateProjectionMatrix(); }
    }
  }
  return { s, update, addShake, recoil, damage, heal, get forward() { return _f; }, get right() { return _r; } };
}
