// Browser-side test player shared by tools/botrun.cjs and tools/first60.mjs: plays through the HUD objective
// (nav to the marked valve, hold E), aims and shoots, scans in the storm, melees up close. No free kills.
window.__installBot = () => {
    const G = __G, T = G.THREE; G.god = !location.search.includes('god=0') && location.search.includes('god=1'); G.log = []; G.kills = []; G.used = { scan: 0, melee: 0, dash: 0, od: 0 };
    G.events.on('enemy:killed', (e) => G.kills.push(+G.time.toFixed(0)));
    G.events.on('flow:act', (e) => G.log.push(['act' + e.act, +G.time.toFixed(0)]));
    for (const n of ['boss:leg', 'boss:exposed', 'boss:overload', 'boss:stuck', 'trap:ignite', 'valve:open', 'tank:boom', 'boss:spawn', 'boss:core', 'boss:dead', 'tower:down', 'flow:extract', 'flow:won', 'player:dead']) G.events.on(n, () => G.log.push([n, +G.time.toFixed(0)]));
    G.events.on('scan:fire', () => G.used.scan++); G.events.on('player:melee', () => G.used.melee++); G.events.on('player:dash', () => G.used.dash++); G.events.on('od:start', () => G.used.od++);
    let t = 0, burst = 0, nav = { pts: [], t: 0, goal: null };
    const go = (ps, target, dt) => { // follow the nav grid toward a world point
      nav.t -= dt; if (nav.t <= 0 || !nav.goal || nav.goal.distanceTo(target) > 0.5) { nav.pts = G.enemies.path(ps.pos, target) || []; nav.t = 1; nav.goal = target.clone(); }
      const nx = nav.pts.find((q) => q.distanceTo(ps.pos) > 0.7) || target; const d = nx.clone().sub(ps.pos); ps.yaw = Math.atan2(-d.x, -d.z); ps.pitch *= 0.9; G.auto = { fwd: 1, str: 0 };
    };
    G.modules.bot = { update(dt) {
      t += dt; const ps = G.player.s; if (ps.dead || !['play', 'extract'].includes(G.flow.S.state)) return;
      if (ps.assisting) { G.auto = {}; return; } /* the game is showing us something: watch it */ const eye = G.R.camera.getWorldPosition(new T.Vector3());
      let tgt = null, bd = 1e9, te = null;
      for (const e of G.enemies.list) { if (!e.alive) continue; const h = e.bones.spine_03.getWorldPosition(new T.Vector3()); const d = h.distanceTo(eye); if (d < bd && G.phys.los(eye, h)) { bd = d; tgt = h; te = e; } }
      const B = G.boss.S;
      if (!tgt && B.active && !B.dead) for (const w of G.boss.targets()) { const cp = w.clone(); const d = cp.clone().sub(eye); const len = d.length(); d.normalize(); if (len < bd && !G.phys.raycast(eye, d, len)) { tgt = cp; bd = len; } }
      if (G.weapon.S.ammo + G.weapon.S.reserve < 20) { const c = G.level.crates.slice().sort((a, b) => a.distanceTo(ps.pos) - b.distanceTo(ps.pos))[0]; go(ps, c, dt); return; }
      // objective first when nothing is in sight: the marked valve / extraction
      const F = G.flow.S, v = G.level.valves?.[0];
      if (!tgt && F.step === 'valve' && v && !v.open) {
        if (G.interact?.near) { const d = v.top.clone().sub(eye); ps.yaw = Math.atan2(-d.x, -d.z); ps.pitch = -0.4; G.auto = { use: true }; return; }
        const stand = v.pos.clone().add(new T.Vector3(0.4, 0, 2.0)); go(ps, stand, dt);
        if (stand.distanceTo(ps.pos) < 1.2) { const d = v.top.clone().sub(eye); ps.yaw = Math.atan2(-d.x, -d.z); }
        return;
      }
      if (F.state === 'extract') { go(ps, F.extract, dt); return; }
      const ig = G.level.valves?.find((x) => x.id === 'IGN');
      if (F.bossPhase === 'trap' && ig && !ig.open && !B.dead) {
        if (G.interact?.near && G.interact.v === ig) { const d = ig.top.clone().sub(eye); ps.yaw = Math.atan2(-d.x, -d.z); ps.pitch = -0.4; G.auto = { use: true }; return; }
        const stand = ig.pos.clone().add(new T.Vector3(2.0, 0, 0)); go(ps, stand, dt); if (stand.distanceTo(ps.pos) < 1.2) { const d = ig.top.clone().sub(eye); ps.yaw = Math.atan2(-d.x, -d.z); }
        return;
      }
      G.auto = { fwd: Math.sin(t * 0.7) > 0.3 ? 1 : 0, str: Math.sin(t * 1.3) > 0 ? 1 : -1 };
      if (F.act === 2 && (G.scan.S.cd <= 0) && !tgt) G.auto.scan = true;
      if (tgt) {
        const d = tgt.clone().sub(eye); const yaw = Math.atan2(-d.x, -d.z), pit = Math.atan2(d.y, Math.hypot(d.x, d.z));
        ps.yaw += Math.atan2(Math.sin(yaw - ps.yaw), Math.cos(yaw - ps.yaw)) * Math.min(1, dt * 8); ps.pitch += (pit - ps.pitch) * Math.min(1, dt * 8);
        burst += dt; G.auto.fire = (burst % 0.9) < 0.45; G.auto.fwd = 0;
        if (te && bd < 2.4 && G.weapon.S.meleeCd <= 0) G.auto.melee = true;
        if (G.od?.S.charge >= 1 && !G.od.S.active) G.auto.ult = true;
      }
      if (G.weapon.S.ammo === 0 && !G.weapon.S.reloading) G.weapon.startReload();
    } };
    const bot = G.modules.bot; delete G.modules.bot; const ie = G.modules.inputEnd; delete G.modules.inputEnd; G.modules.bot = bot; G.modules.inputEnd = ie;
    const I = G.input; const d0 = I.down;
    I.down = (a) => (a === 'fwd' && G.auto?.fwd > 0) || (a === 'right' && G.auto?.str > 0) || (a === 'left' && G.auto?.str < 0) || (a === 'use' && G.auto?.use) || d0(a);
};
