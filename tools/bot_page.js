// Browser-side test player shared by tools/botrun.cjs and tools/first60.mjs: plays through the HUD objective
// (nav to the marked valve, hold E), aims and shoots, scans in the storm, melees up close. No free kills.
window.__installBot = () => {
    const G = __G, T = G.THREE; G.god = !location.search.includes('god=0') && location.search.includes('god=1'); G.log = []; G.kills = []; G.used = { scan: 0, melee: 0, dash: 0, od: 0 };
    G.events.on('enemy:killed', (e) => G.kills.push(+G.time.toFixed(0)));
    G.events.on('flow:act', (e) => G.log.push(['act' + e.act, +G.time.toFixed(0)]));
    for (const n of ['boss:leg', 'boss:exposed', 'boss:overload', 'boss:stuck', 'trap:ignite', 'valve:open', 'tank:boom', 'boss:spawn', 'boss:core', 'boss:dead', 'tower:down', 'flow:extract', 'flow:won', 'player:dead']) G.events.on(n, () => G.log.push([n, +G.time.toFixed(0)]));
    G.events.on('scan:fire', () => G.used.scan++); G.events.on('player:melee', () => G.used.melee++); G.events.on('player:dash', () => G.used.dash++); G.events.on('od:start', () => G.used.od++);
    let t = 0, burst = 0, nav = { pts: [], t: 0, goal: null }; const humanaim = location.search.includes('humanaim=1');
    const go = (ps, target, dt) => { // follow the nav grid toward a world point
      nav.t -= dt; if (nav.t <= 0 || !nav.goal || nav.goal.distanceTo(target) > 0.5) { nav.pts = G.enemies.path(ps.pos, target) || []; nav.t = 1; nav.goal = target.clone(); }
      const nx = nav.pts.find((q) => q.distanceTo(ps.pos) > 0.7) || target; const d = nx.clone().sub(ps.pos), want = Math.atan2(-d.x, -d.z), dy = Math.atan2(Math.sin(want - ps.yaw), Math.cos(want - ps.yaw));
      ps.yaw += humanaim ? Math.max(-6 * dt, Math.min(6 * dt, dy * Math.min(1, dt * 9))) : dy; ps.pitch *= humanaim ? 0.97 : 0.9; G.auto = { fwd: 1, str: humanaim && Math.abs(dy) > 1.2 ? 0 : 0 }; // ?humanaim=1: walking turns are eased like a hand on a mouse
    };
    const stuck = { p: null, t: 0, esc: 0, side: 1 };
    G.modules.bot = { update(dt) {
      t += dt; const ps = G.player.s; if (ps.dead || !['play', 'extract'].includes(G.flow.S.state)) return;
      // wedged (walking into something for 2 s): jump and sidestep out, the way a player would
      if (stuck.esc > 0) { stuck.esc -= dt; G.auto = { fwd: 1, str: stuck.side, jump: stuck.esc > 0.8 }; return; }
      if ((stuck.t += dt) > 2) { if (stuck.p && stuck.p.distanceTo(ps.pos) < 0.3 && G.auto?.fwd > 0 && !G.auto?.use) { stuck.esc = 1.1; stuck.side = -stuck.side; } stuck.p = ps.pos.clone(); stuck.t = 0; }
      if (ps.assisting) { G.auto = {}; return; } /* the game is showing us something: watch it */ const eye = G.R.camera.getWorldPosition(new T.Vector3());
      let tgt = null, bd = 1e9, te = null;
      for (const e of G.enemies.list) { if (!e.alive) continue; const h = e.bones.spine_03.getWorldPosition(new T.Vector3()); const d = h.distanceTo(eye); if (d < bd && G.phys.los(eye, h)) { bd = d; tgt = h; te = e; } }
      for (const dr of G.drones?.list || []) { if (!dr.alive) continue; const h = dr.root.position.clone(); const d = h.distanceTo(eye) * 0.8; if (d < bd && G.phys.los(eye, h)) { bd = d; tgt = h; te = null; } } /* drones first when close: they dive */
      // the lance for a shielded heavy, the carbine for everything else
      const W = G.weapon; if (W.S.lanceOn) { const want = te?.shield && !te.shield.broken && (W.kits.find((k) => k.key === 'lance')?.ammo + W.kits.find((k) => k.key === 'lance')?.reserve > 0) ? 'lance' : 'rifle'; if (W.key !== want && W.S.swapT < 0) W.swapTo(want); }
      const pod = G.flow.S.pod; if (pod?.landed && !pod.taken && !tgt) { go(ps, pod.at, dt); return; }
      const B = G.boss.S;
      if (!tgt && B.active && !B.dead) for (const w of G.boss.targets()) { const cp = w.clone(); const d = cp.clone().sub(eye); const len = d.length(); d.normalize(); if (len < bd && !G.phys.raycast(eye, d, len)) { tgt = cp; bd = len; } }
      if (G.weapon.kits.every((k) => k.ammo + k.reserve < (k.key === 'rifle' ? 20 : 2))) { const c = G.level.crates.slice().sort((a, b) => a.distanceTo(ps.pos) - b.distanceTo(ps.pos))[0]; go(ps, c, dt); return; }
      // objective first when nothing is in sight: the marked valve / extraction
      const F = G.flow.S, v = G.level.valves?.[0];
      if (!tgt && F.step === 'valve' && v && !v.open) {
        if (G.interact?.near) { const d = v.top.clone().sub(eye); ps.yaw = Math.atan2(-d.x, -d.z); ps.pitch = -0.4; G.auto = { use: true }; return; }
        const stand = v.pos.clone().add(new T.Vector3(0.4, 0, 2.0)); go(ps, stand, dt);
        if (stand.distanceTo(ps.pos) < 1.2) { const d = v.top.clone().sub(eye); ps.yaw = Math.atan2(-d.x, -d.z); }
        return;
      }
      // valve B is up on the pipe gallery deck: walk to the nearer north stairs, climb, walk the deck to the valve
      const vb = G.level.valves?.find((x) => x.id === 'B');
      if (!tgt && F.step === 'valveB' && vb && !vb.open) {
        const face = (p) => { const d = p.clone().sub(ps.pos); ps.yaw = Math.atan2(-d.x, -d.z); ps.pitch *= 0.9; G.auto = { fwd: 1, str: 0 }; };
        if (ps.pos.y > vb.pos.y - 0.4 && ps.pos.z < -58.6 && ps.pos.z > -61.4) { // on the deck (not still on the top step)
          // within reach from wherever it got to: face the wheel and hold E; otherwise walk at it
          if (Math.hypot(ps.pos.x - vb.pos.x, ps.pos.z - vb.pos.z) < 2.2) { const d = vb.top.clone().sub(eye); ps.yaw = Math.atan2(-d.x, -d.z); ps.pitch = -0.5; G.auto = { use: true }; return; }
          face(new T.Vector3(vb.pos.x, ps.pos.y, vb.pos.z)); return;
        }
        const sx = Math.abs(ps.pos.x + 19) < Math.abs(ps.pos.x - 17) ? -19 : 17, base = new T.Vector3(sx, 0, -51.4);
        if (ps.pos.y > 0.2 || Math.hypot(ps.pos.x - sx, ps.pos.z + 51.4) < 0.9) { face(new T.Vector3(sx, ps.pos.y, -59.6)); return; } // on the flight: straight up it
        go(ps, base, dt); return;
      }
      if (F.state === 'extract') { go(ps, F.extract, dt); return; }
      const ig = G.level.valves?.find((x) => x.id === 'IGN');
      if (F.bossPhase === 'trap' && ig && !ig.open && !B.dead) {
        if (G.interact?.near && G.interact.v === ig) { const d = ig.top.clone().sub(eye); ps.yaw = Math.atan2(-d.x, -d.z); ps.pitch = -0.4; G.auto = { use: true }; return; }
        const stand = ig.pos.clone().add(new T.Vector3(2.0, 0, 0)); go(ps, stand, dt); if (stand.distanceTo(ps.pos) < 1.2) { const d = ig.top.clone().sub(eye); ps.yaw = Math.atan2(-d.x, -d.z); }
        return;
      }
      // the colossus is down on its knees: grapple onto its back, then shoot the cores from up there
      if (G.grapple?.riding) { const c = G.boss.cores.filter((x) => x.alive && x.exposed).map((x) => x.light.position)[0]; if (c) { const d = c.clone().sub(eye); ps.yaw = Math.atan2(-d.x, -d.z); ps.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); burst += dt; G.auto = { fire: G.weapon.key === 'lance' ? true : (burst % 0.9) < 0.45 }; if (G.weapon.S.ammo === 0 && !G.weapon.S.reloading) G.weapon.startReload(); return; } }
      if (G.grapple?.available?.() && G.grapple.S.mode === 'idle' && !window.__noGrapple) { const a = G.grapple.anchorWorld(); if (a.distanceTo(eye) < 34) { const d = a.clone().sub(eye); ps.yaw = Math.atan2(-d.x, -d.z); ps.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); G.auto = { grapple: true }; return; }
        const h = G.boss.hull.position, dir = ps.pos.clone().sub(h).setY(0).normalize(); go(ps, h.clone().setY(0).addScaledVector(dir, 20), dt); return; }
      // the machine is up but no weak point in sight: work round to ~16 m from it along a real path (not a straight line into cover)
      if (!tgt && B.active && !B.dead && !B.distant) { const h = G.boss.hull.position, dir = ps.pos.clone().sub(h).setY(0).normalize(); go(ps, h.clone().setY(0).addScaledVector(dir, 16), dt); return; }
      G.auto = { fwd: Math.sin(t * 0.7) > 0.3 ? 1 : 0, str: Math.sin(t * 1.3) > 0 ? 1 : -1 };
      if (F.act === 2 && (G.scan.S.cd <= 0) && !tgt) G.auto.scan = true;
      if (tgt) {
        const d = tgt.clone().sub(eye); const yaw = Math.atan2(-d.x, -d.z), pit = Math.atan2(d.y, Math.hypot(d.x, d.z));
        ps.yaw += Math.atan2(Math.sin(yaw - ps.yaw), Math.cos(yaw - ps.yaw)) * Math.min(1, dt * 8); ps.pitch += (pit - ps.pitch) * Math.min(1, dt * 8);
        burst += dt; G.auto.fire = G.weapon.key === 'lance' ? true : (burst % 0.9) < 0.45; G.auto.fwd = 0;
        if (te && bd < 2.4 && G.weapon.S.meleeCd <= 0) G.auto.melee = true;
        if (G.od?.S.charge >= 1 && !G.od.S.active) G.auto.ult = true;
      }
      if (G.weapon.S.ammo === 0 && !G.weapon.S.reloading) G.weapon.startReload();
    } };
    const bot = G.modules.bot; delete G.modules.bot; const ie = G.modules.inputEnd; delete G.modules.inputEnd; G.modules.bot = bot; G.modules.inputEnd = ie;
    const I = G.input; const d0 = I.down, p0 = I.pressed; I.pressed = (a) => (a === 'jump' && G.auto?.jump) || p0(a);
    I.down = (a) => (a === 'fwd' && G.auto?.fwd > 0) || (a === 'right' && G.auto?.str > 0) || (a === 'left' && G.auto?.str < 0) || (a === 'use' && G.auto?.use) || d0(a);
};
