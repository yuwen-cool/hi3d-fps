// Teaching as you play: each mechanic gets one short tip (keys + why) the first time it matters, never during a
// cutscene, one at a time. Seen tips are remembered in localStorage so a second run is not lectured again
// (?tips=1 shows them all again). Also the mission brief: the whole plan in three steps when you deploy and on each act.
const TIPS = {
  move: { keys: [['WASD', 'MOVE'], ['SHIFT', 'DASH'], ['SPACE', 'JUMP']], text: 'Follow the ◆ marker on the compass and in the world: that is your objective.' },
  shoot: { keys: [['LMB', 'FIRE'], ['RMB', 'AIM'], ['R', 'RELOAD']], text: 'Robots fire in bursts after a red flash on the visor. Break line of sight, then return fire.' },
  shield: { keys: [], text: 'The orange bar is your shield: it refills on its own a few seconds after the hits stop. Health (white) only refills at supply crates.' },
  crate: { keys: [], text: 'Supply crate: walk over it to refill ammo, grenades and health.' },
  boom: { keys: [['G', 'GRENADE']], text: 'Red drums, yellow gas lines and storage tanks explode. Shoot them when robots are close.' },
  melee: { keys: [['F', 'MELEE']], text: 'Up close, melee knocks a robot down and smashes riot shields.' },
  lance: { keys: [['2', 'ARC-7'], ['1', 'CARBINE'], ['HOLD LMB', 'CHARGE']], text: 'The ARC-7 pierces every robot in a line, riot shields included, and burns a clear tunnel through the sandstorm.' },
  scan: { keys: [['Q', 'SCAN']], text: 'You can barely see in the sand. Scan to outline every robot nearby for a few seconds — but they hear it and come.' },
  od: { keys: [['X', 'OVERDRIVE']], text: 'Overdrive is charged by kills: the robots slow down and light up for 8 seconds.' },
  boss: { keys: [], text: 'Its armour is too thick. Shoot the glowing knee joints to bring it down.' },
  grapple: { keys: [['E', 'GRAPPLE']], text: 'It is down on its knees: look at the blue mark on its back and grapple up. The cores are right below the deck.' },
};
const STEPS = [['PRESSURISE THE FLARE LINE', 'Open valve A in the yard and valve B on the pipe gallery.'], ['SURVIVE THE SANDSTORM', 'Two waves inside the storm. Scan to see them.'], ['KILL THE WALKER', 'Break a knee, destroy its cores, burn it on the flare line. Then get to the dropship.']];

export function createTutor(G) {
  const ui = document.getElementById('hud') || document.getElementById('ui');
  const tip = document.createElement('div'); tip.className = 'tip'; ui.appendChild(tip);
  const brief = document.createElement('div'); brief.className = 'brief'; ui.appendChild(brief);
  brief.innerHTML = `<div class="bh"><span>OPERATION</span><b>SANDLINE</b></div>${STEPS.map(([a, b], i) => `<div class="st" data-i="${i}"><em>${i + 1}</em><div><b>${a}</b><span>${b}</span></div></div>`).join('')}`;
  const steps = [...brief.querySelectorAll('.st')];
  let seen = {}; try { seen = G.params.tips ? {} : JSON.parse(localStorage.getItem('sl_tips_v1') || '{}'); } catch { /* private mode */ }
  const q = [], S = { cur: null, t: 0, briefT: 0 };
  function want(k) { if (seen[k] || q.includes(k) || S.cur === k || !TIPS[k] || G.params.shot) return; if (k === 'move') q.unshift(k); else q.push(k); } // how to move always comes first
  function show(k) {
    const T = TIPS[k]; S.cur = k; S.t = 7 + T.text.length * 0.02; seen[k] = 1; try { localStorage.setItem('sl_tips_v1', JSON.stringify(seen)); } catch { /* */ }
    tip.innerHTML = `<div class="th">${T.keys.map(([a, b]) => `<span><span class="kc">${a}</span>${b}</span>`).join('')}</div><p>${T.text}</p>`;
    tip.classList.remove('on'); void tip.offsetWidth; tip.classList.add('on'); G.audio?.play?.('uiMove', { gain: 0.4 });
  }
  function showBrief(act, dur) { if (G.params.shot) return; steps.forEach((s, i) => { s.classList.toggle('done', i < act - 1); s.classList.toggle('now', i === act - 1); }); brief.classList.remove('on'); void brief.offsetWidth; brief.classList.add('on'); S.briefT = dur; }
  const E = G.events;
  E.on('flow:act', (e) => { const a = e?.act ?? G.flow?.S.act ?? 1; showBrief(a, a === 1 ? 7.5 : 5); if (a === 2) setTimeout(() => want('scan'), 5000); if (a === 3) setTimeout(() => want('boss'), 16000); });
  E.on('enemy:fire', () => want('shoot'));
  E.on('player:hit', () => want('shield'));
  E.on('weapon:unlock', () => setTimeout(() => want('lance'), 1800));
  E.on('boss:spawn', () => setTimeout(() => want('boss'), 9000));
  let near = 0;
  function update(dt) {
    const rdt = G.realDt || dt, F = G.flow?.S, play = F?.state === 'play' && !G.cinematic && !G.player.s.dead;
    if (S.briefT > 0) { S.briefT -= rdt; if (S.briefT <= 0 || G.cinematic) { brief.classList.remove('on'); S.briefT = 0; } }
    if (F?.state === 'play' && !seen.move) want('move');
    if ((near -= rdt) <= 0 && play) { near = 0.5; const pp = G.player.s.pos;
      if (!seen.crate && (G.level.crates || []).some((c) => c.distanceTo(pp) < 9)) want('crate');
      if (!seen.boom && (G.level.explosives || []).some((o) => !o.userData.explosive?.dead && o.position.distanceTo(pp) < 14) && (G.enemies?.list || []).some((e) => e.alive && e.state === 'engage')) want('boom');
      if (!seen.melee && (G.enemies?.list || []).some((e) => e.alive && e.root.position.distanceTo(pp) < 3.2)) want('melee');
      if (!seen.grapple && G.grapple?.available?.()) want('grapple');
      if (!seen.od && G.od?.S.charge >= 1) want('od'); }
    if (S.cur) { if (G.cinematic) { tip.classList.remove('on'); S.cur = null; } else if ((S.t -= rdt) <= 0) { tip.classList.remove('on'); S.cur = null; } }
    else if (q.length && play && S.briefT <= 0) show(q.shift());
  }
  return { update, want, showBrief, STEPS };
}
