// Out-of-combat screens: boot log while loading, title over the live refinery, pause, controls, settings,
// KIA and extraction results. Owns pointer lock (deploy / resume) and the title camera.
import { CSS } from './style.js';

const KEYS = [['W A S D', 'MOVE'], ['MOUSE', 'AIM'], ['LMB', 'FIRE'], ['RMB', 'AIM DOWN SIGHTS'], ['SHIFT', 'DASH / SPRINT'], ['C', 'CROUCH / SLIDE'], ['SPACE', 'JUMP'], ['Q', 'SCAN PULSE'], ['F', 'MELEE'], ['G', 'GRENADE'], ['X', 'OVERDRIVE'], ['1 / 2 / WHEEL', 'CARBINE / LANCE'], ['E', 'INTERACT (HOLD)'], ['R', 'RELOAD'], ['ESC', 'PAUSE']];
const LS = 'sandline.settings';
export const settings = (() => { const d = { sens: 1, vol: 0.85, fov: 74, q: 'auto' }; try { return { ...d, ...JSON.parse(localStorage.getItem(LS) || '{}') }; } catch { return d; } })();
const saveSettings = () => { try { localStorage.setItem(LS, JSON.stringify(settings)); } catch { /* private mode */ } };

function mount() {
  if (!document.getElementById('sl-css')) { const st = document.createElement('style'); st.id = 'sl-css'; st.textContent = CSS; document.head.appendChild(st); }
  let ui = document.getElementById('ui'); if (!ui) { ui = document.createElement('div'); ui.id = 'ui'; document.body.appendChild(ui); }
  const fit = () => { document.documentElement.style.fontSize = `${(Math.min(innerHeight / 1080, innerWidth / 1920) * 16).toFixed(2)}px`; };
  fit(); addEventListener('resize', fit);
  return ui;
}

// ---------- boot log (shown from the first frame, fed by the loader) ----------
export function createBoot() {
  const ui = mount(); document.getElementById('loading')?.remove();
  const el = document.createElement('div'); el.className = 'scr boot on';
  el.innerHTML = `<div class="lg">SANDLINE // HELMET OS 4.12</div><div class="log"></div><div class="bar">${'<i></i>'.repeat(24)}</div><div class="pc">0%</div>`;
  ui.appendChild(el);
  const log = el.querySelector('.log'), bars = [...el.querySelectorAll('.bar i')], pc = el.querySelector('.pc');
  const lines = []; let last = '';
  const LBL = { world: 'TERRAIN + SKY', level: 'REFINERY GEOMETRY', weapon: 'KR-9 CARBINE', enemies: 'HOSTILE UNITS', compile: 'SHADER CACHE' };
  return {
    el,
    progress(t, p) {
      if (t !== last) { if (last) lines[lines.length - 1] = lines[lines.length - 1].replace('......', '...... <b>OK</b>'); lines.push(`> LOADING ${LBL[t] || t.toUpperCase()} ......`); last = t; if (lines.length > 7) lines.shift(); log.innerHTML = lines.join('\n'); }
      const n = Math.round(p * bars.length); bars.forEach((b, i) => b.classList.toggle('f', i < n)); pc.textContent = `${Math.round(p * 100)}%`;
    },
    done() { lines[lines.length - 1] = lines[lines.length - 1].replace('......', '...... <b>OK</b>'); lines.push('> ALL SYSTEMS NOMINAL'); log.innerHTML = lines.join('\n'); bars.forEach((b) => b.classList.add('f')); pc.textContent = '100%'; },
    out(instant) { if (instant) { el.remove(); return; } el.classList.add('out'); setTimeout(() => el.remove(), 700); },
    fail(msg) { lines.push(`> <b>FAULT</b> ${msg}`); log.innerHTML = lines.join('\n'); },
  };
}

// ---------- menu helper: keyboard + mouse, sounds ----------
function menu(G, root, items, onPick) {
  const m = document.createElement('div'); m.className = 'menu';
  m.innerHTML = items.map((it, i) => `<button class="${i === 0 ? 'sel' : ''}${it.dis ? ' dis' : ''}"><span class="n">0${i + 1}</span>${it.label}</button>`).join('');
  root.appendChild(m);
  const bs = [...m.querySelectorAll('button')]; let sel = 0;
  const focus = (i, snd = true) => { if (i === sel) return; bs[sel].classList.remove('sel'); sel = i; bs[sel].classList.add('sel'); if (snd) G.audio?.play?.('uiMove', { gain: 0.35 }); };
  bs.forEach((b, i) => { b.onmouseenter = () => focus(i); b.onclick = (e) => { e.stopPropagation(); if (items[i].dis) return; G.audio?.play?.('uiOk', { gain: 0.5 }); onPick(items[i].id, e); }; });
  const key = (e) => {
    if (!root.classList.contains('on') || !m.isConnected || m.closest('.scr') !== root || root.querySelector('.pnl') && !m.closest('.pnl')) return;
    if (['ArrowDown', 'KeyS'].includes(e.code)) focus((sel + 1) % bs.length);
    else if (['ArrowUp', 'KeyW'].includes(e.code)) focus((sel + bs.length - 1) % bs.length);
    else if (['Enter', 'Space'].includes(e.code)) bs[sel].click();
  };
  addEventListener('keydown', key);
  return { el: m, dispose() { removeEventListener('keydown', key); m.remove(); } };
}

export function createUI(G, boot) {
  const ui = mount();
  const canvas = G.R.renderer.domElement;
  const scr = (cls, html) => { const d = document.createElement('div'); d.className = 'scr ' + cls; d.innerHTML = html; ui.appendChild(d); return d; };
  const lock = () => { try { const r = canvas.requestPointerLock?.({ unadjustedMovement: false }); if (r?.catch) r.catch(() => canvas.requestPointerLock?.()); } catch { canvas.requestPointerLock?.(); } };
  G.sens = settings.sens; G.player.s.fovBase = settings.fov; G.audio?.setVolume?.(settings.vol);

  // ---------- panels: controls + settings (shared by title and pause) ----------
  function panel(host, kind, back) {
    const p = document.createElement('div'); p.className = 'pnl';
    if (kind === 'controls') p.innerHTML = `<div class="hd"><b>CONTROLS</b><i class="hz"></i></div><div class="bd"><div class="ctl">${KEYS.map(([k, t]) => `<span><span class="kc">${k}</span></span><span>${t}</span>`).join('')}</div></div>`;
    else p.innerHTML = `<div class="hd"><b>SETTINGS</b><i class="hz"></i></div><div class="bd"><div class="set">
      <span>MOUSE SENSITIVITY</span><input type="range" min="0.3" max="2.5" step="0.05" data-k="sens"><span class="v" data-v="sens"></span>
      <span>FIELD OF VIEW</span><input type="range" min="65" max="95" step="1" data-k="fov"><span class="v" data-v="fov"></span>
      <span>VOLUME</span><input type="range" min="0" max="1" step="0.05" data-k="vol"><span class="v" data-v="vol"></span>
      <span>QUALITY</span><div class="opt">${['auto', 'low', 'medium', 'high'].map((q) => `<button data-q="${q}" class="${settings.q === q ? 'sel' : ''}">${q.toUpperCase()}</button>`).join('')}</div><span></span>
    </div></div>`;
    host.appendChild(p);
    const show = () => p.querySelectorAll('[data-v]').forEach((v) => { const k = v.dataset.v; v.textContent = k === 'vol' ? Math.round(settings.vol * 100) : k === 'sens' ? settings.sens.toFixed(2) : settings[k]; });
    p.querySelectorAll('input').forEach((i) => { i.value = settings[i.dataset.k]; i.oninput = () => { settings[i.dataset.k] = +i.value; G.sens = settings.sens; G.player.s.fovBase = settings.fov; G.audio?.setVolume?.(settings.vol); saveSettings(); show(); }; });
    p.querySelectorAll('[data-q]').forEach((b) => { b.onclick = () => { settings.q = b.dataset.q; saveSettings(); const u = new URL(location.href); if (settings.q === 'auto') u.searchParams.delete('q'); else u.searchParams.set('q', settings.q); location.href = u.toString(); }; });
    show();
    const bk = document.createElement('div'); bk.className = 'back'; p.querySelector('.bd').appendChild(bk);
    const m = menu(G, host, [{ id: 'back', label: 'BACK' }], () => { m.dispose(); p.remove(); back(); }); bk.appendChild(m.el);
    const esc = (e) => { if (e.code === 'Escape' && p.isConnected) { removeEventListener('keydown', esc); m.dispose(); p.remove(); back(); } }; addEventListener('keydown', esc);
  }

  // ---------- title ----------
  const title = scr('title', `
    <div class="wm"><div class="ov">HI3D // BROWSER FPS</div>
      <h1>${[...'SANDLINE'].map((c, i) => `<span style="animation-delay:${0.25 + i * 0.05}s">${c}</span>`).join('')}</h1>
      <div class="pr"><b>SECTOR 7 // KHARA BASIN</b>Hold the refinery. The storm is bringing something big.</div>
      <div class="mh"></div></div>
    <div class="keys">${[['WASD', 'MOVE'], ['LMB', 'FIRE'], ['R', 'RELOAD'], ['SHIFT', 'DASH'], ['Q', 'SCAN'], ['F', 'MELEE'], ['G', 'GRENADE'], ['E', 'INTERACT']].map(([k, t]) => `<span><span class="kc">${k}</span>${t}</span>`).join('')}</div>
    <div class="cr"><span class="mono">EVERY MODEL IN THIS GAME WAS GENERATED WITH</span><b>HI3D</b></div>`);
  let titleMenu = null;
  function openTitleMenu() {
    const cp = +G.params.cp || 0;
    titleMenu = menu(G, title, [...(cp >= 2 ? [{ id: 'cp', label: `CONTINUE — ACT ${cp}` }] : []), { id: 'deploy', label: cp >= 2 ? 'NEW MISSION' : 'DEPLOY' }, { id: 'controls', label: 'CONTROLS' }, { id: 'settings', label: 'SETTINGS' }], (id) => {
      if (id === 'cp') deploy(cp);
      if (id === 'deploy') deploy();
      else { const wm = title.querySelector('.wm'); wm.style.visibility = 'hidden'; panel(title, id, () => { wm.style.visibility = ''; }); }
    });
    title.querySelector('.mh').appendChild(titleMenu.el);
  }
  function showTitle() { title.classList.add('on'); openTitleMenu(); G.hudHidden = true; G.camLocked = true; G.viewModelVisible = false; G.cinematic = true; }
  function deploy(cp = 0) {
    lock(); titleMenu?.dispose(); title.classList.add('out');
    setTimeout(() => { title.classList.remove('on', 'out'); G.hudHidden = false; }, 560); // the HUD comes up once the title has gone, never under it
    G.viewModelVisible = true; if (cp >= 2) G.flow.checkpoint(cp); else G.flow.deploy();
  }

  // ---------- title camera: slow drift across the yard toward the stacks ----------
  const T0 = new G.THREE.Vector3(4.2, 2.1, 5.6), T1 = new G.THREE.Vector3(-9, 2.7, 5.0), L0 = new G.THREE.Vector3(-1, 4.2, -40), L1 = new G.THREE.Vector3(10, 6, -46);
  let tc = 0; const _p = new G.THREE.Vector3(), _l = new G.THREE.Vector3();
  const titleCam = { update(dt) {
    if (G.flow?.S.state !== 'title' || G.params.shot) return;
    tc += G.realDt || dt; const k = 0.5 - 0.5 * Math.cos(tc * 0.035);
    _p.lerpVectors(T0, T1, k); _p.y += Math.sin(tc * 0.4) * 0.03; _l.lerpVectors(L0, L1, k);
    const cam = G.R.camera; cam.position.copy(_p); cam.lookAt(_l);
    if (Math.abs(cam.fov - 62) > 0.01) { cam.fov = 62; cam.updateProjectionMatrix(); }
  } };

  // ---------- pause ----------
  const pause = scr('pause', ''); let pauseMenu = null;
  function openPause() {
    if (G.paused) return; G.paused = true; pause.classList.add('on'); G.input?.clear?.();
    pause.innerHTML = `<div class="pnl"><div class="hd"><b>PAUSED</b><i class="hz"></i></div><div class="bd"></div></div>`;
    const bd = pause.querySelector('.bd');
    pauseMenu = menu(G, pause, [{ id: 'resume', label: 'RESUME' }, { id: 'controls', label: 'CONTROLS' }, { id: 'settings', label: 'SETTINGS' }, { id: 'abort', label: 'ABORT MISSION' }], (id) => {
      if (id === 'resume') { lock(); }
      else if (id === 'abort') location.reload();
      else { const pn = pause.querySelector('.pnl'); pn.style.display = 'none'; panel(pause, id, () => { pn.style.display = ''; }); }
    });
    bd.appendChild(pauseMenu.el);
  }
  function closePause() { if (!G.paused) return; G.paused = false; pause.classList.remove('on'); pauseMenu?.dispose(); pause.innerHTML = ''; }
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas; const st = G.flow?.S.state;
    if (locked) closePause();
    else if ((st === 'play' || st === 'extract' || st === 'deploy') && !G.player.s.dead) openPause();
  });
  // clicking the canvas mid-game (after an Esc) re-locks
  canvas.addEventListener('mousedown', () => { const st = G.flow?.S.state; if (['play', 'extract', 'deploy'].includes(st) && !document.pointerLockElement) lock(); });

  // ---------- end screens ----------
  const end = scr('end', '');
  function showEnd(kind) {
    if (G.params.shot) return;
    const F = G.flow.S, secs = Math.round(F.t - F.startT), shots = G.weapon?.S.fired || 0, hits = G.weapon?.S.hits || 0;
    const acc = shots ? Math.round(hits / shots * 100) : 0, sc = G.score || 0;
    const grade = kind === 'won' ? (sc > 2600 && secs < 300 ? 'S' : sc > 1800 ? 'A' : sc > 1100 ? 'B' : 'C') : '—';
    end.className = 'scr end on ' + (kind === 'won' ? 'won' : 'kia');
    end.innerHTML = `<div class="big"><div class="ov">${kind === 'won' ? 'SECTOR 7 // MISSION COMPLETE' : 'SIGNAL LOST // OPERATOR DOWN'}</div><h1>${kind === 'won' ? 'EXTRACTED' : 'KIA'}</h1>
      <div class="stats"><div><span>TIME</span><b>${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}</b></div><div><span>KILLS</span><b>${F.kills}</b></div><div><span>ACCURACY</span><b>${acc}%</b></div><div><span>SCORE</span><b>${sc}</b></div><div><span>GRADE</span><b>${grade}</b></div></div><div class="mh" style="margin-top:2rem"></div></div>`;
    // a death past act 1 offers the act's checkpoint first (the page reloads straight into it)
    const go = (cp) => { const u = new URL(location.href); if (cp) u.searchParams.set('cp', cp); else u.searchParams.delete('cp'); location.href = u.toString(); };
    const items = kind !== 'won' && F.act >= 2 ? [{ id: 'cp', label: `RETRY — ACT ${F.act} CHECKPOINT` }, { id: 'again', label: 'RESTART MISSION' }, { id: 'title', label: 'TITLE SCREEN' }]
      : [{ id: 'again', label: kind === 'won' ? 'DEPLOY AGAIN' : 'RETRY' }, { id: 'title', label: 'TITLE SCREEN' }];
    const m = menu(G, end, items, (id) => go(id === 'cp' ? F.act : 0));
    end.querySelector('.mh').appendChild(m.el);
    document.exitPointerLock?.(); G.hudHidden = true;
  }
  G.events.on('player:dead', () => setTimeout(() => showEnd('kia'), 1800));
  G.events.on('flow:won', () => setTimeout(() => showEnd('won'), 2500));

  // ---------- start ----------
  boot?.done();
  if (G.params.shot) { boot?.out(true); } // capture tools: no fade to wait for
  else { G.hudHidden = true; G.viewModelVisible = false; setTimeout(() => { boot?.out(); showTitle(); }, 350); } // nothing of the HUD under the boot fade or the title
  return { titleCam, openPause, closePause, showTitle };
}
