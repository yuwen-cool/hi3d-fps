// In-engine cutscenes: the camera is taken for a few seconds (letterbox, HUD off, player invulnerable), a shot
// function drives it, and an overlay can pin labels to world points. Any key or click skips.
//   G.cine.play({ dur, cam(t) -> { pos, look, fov }, start(), end(), card: {cls, name, threat}, callouts: [{ label, at() -> Vector3 }] })
export function createCine(G) {
  const THREE = G.THREE, cam = G.R.camera;
  const ui = document.getElementById('ui');
  const el = document.createElement('div'); el.className = 'cine';
  el.innerHTML = `<i class="bar t"></i><i class="bar b"></i><div class="card"><div class="cl"></div><div class="nm"></div><div class="th"></div></div><div class="calls"></div><div class="skip"><span class="kc">SPACE</span>SKIP</div>`;
  ui.appendChild(el);
  const card = el.querySelector('.card'), calls = el.querySelector('.calls');
  const S = { cur: null, t: 0, skip: false };
  const _p = new THREE.Vector3();
  const onSkip = (e) => { if (S.cur && !S.cur.noSkip && S.t > 0.6 && (e.type === 'mousedown' || ['Space', 'Enter', 'Escape'].includes(e.code))) S.skip = true; };
  addEventListener('keydown', onSkip); addEventListener('mousedown', onSkip);

  function play(shot) {
    if (G.params.shot && !G.params.cine) { shot.start?.(); shot.end?.(); return; } // capture tools skip cutscenes unless asked
    S.cur = shot; S.t = 0; S.skip = false; S.fov0 = cam.fov;
    G.cinematic = true; G.camLocked = true; G.hudHidden = true; G.viewModelVisible = false;
    el.classList.add('on'); el.querySelector('.skip').style.display = shot.noSkip ? 'none' : '';
    card.className = 'card'; if (shot.card) { card.querySelector('.cl').textContent = shot.card.cls || ''; card.querySelector('.nm').textContent = shot.card.name || ''; card.querySelector('.th').innerHTML = shot.card.threat || ''; }
    calls.innerHTML = (shot.callouts || []).map((c) => `<div class="call"><i></i><b></b><span>${c.label}</span></div>`).join('');
    shot.start?.();
  }
  function end() {
    const shot = S.cur; S.cur = null; el.classList.remove('on'); card.classList.remove('in'); calls.innerHTML = '';
    G.cinematic = false; G.camLocked = false; G.hudHidden = false; G.viewModelVisible = true;
    cam.fov = S.fov0; cam.updateProjectionMatrix();
    shot.end?.();
  }
  function update() {
    if (!S.cur) return;
    const dt = G.realDt || 1 / 60; S.t += dt; const shot = S.cur;
    const c = shot.cam(S.t); cam.position.copy(c.pos); cam.lookAt(c.look); if (c.roll) cam.rotateZ(c.roll);
    if (c.fov && Math.abs(cam.fov - c.fov) > 0.01) { cam.fov = c.fov; cam.updateProjectionMatrix(); }
    if (shot.card && S.t > (shot.card.at ?? 1)) card.classList.add('in');
    // callouts: a leader line from the world point to a label, revealed one after another
    [...calls.children].forEach((d, i) => {
      const co = shot.callouts[i]; const show = S.t > (co.t ?? 1.6 + i * 0.25);
      _p.copy(co.at()).project(cam); const vis = show && _p.z < 1 && Math.abs(_p.x) < 0.95 && Math.abs(_p.y) < 0.9;
      d.classList.toggle('on', vis); if (!vis) return;
      const x = (_p.x * 0.5 + 0.5) * innerWidth, y = (-_p.y * 0.5 + 0.5) * innerHeight;
      const dx = co.dx ?? (x > innerWidth / 2 ? 90 : -90), dy = co.dy ?? -70;
      d.style.transform = `translate(${x.toFixed(0)}px,${y.toFixed(0)}px)`;
      const ln = d.children[1], L = Math.hypot(dx, dy); ln.style.width = `${L}px`; ln.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
      const lb = d.children[2]; lb.style.left = `${dx}px`; lb.style.top = `${dy}px`; lb.style.transform = `translate(${dx < 0 ? '-100%' : '0'},-50%)`;
    });
    if (S.t > shot.dur || S.skip) end();
  }
  return { update, play, get playing() { return !!S.cur; } };
}
