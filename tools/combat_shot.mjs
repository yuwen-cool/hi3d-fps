// Scripted combat frame: spawn a robot in front, aim at it, hold fire, screenshot mid-burst.
import { chromium } from 'playwright';
const a = Object.fromEntries(process.argv.slice(2).map((x, i, arr) => x.startsWith('--') ? [x.slice(2), arr[i + 1]] : null).filter(Boolean));
const out = a.out || 'out/combat.png', dist = +(a.dist || 9), shots = +(a.shots || 6), part = a.part || 'chest', url = a.url || '/?shot=1&noenemies=1';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const logs = []; p.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); }); p.on('pageerror', (e) => logs.push(e.message));
await p.goto('http://127.0.0.1:5320' + url);
await p.waitForFunction(() => window.__ready || window.__fatal, null, { timeout: 120000 });
const res = await p.evaluate(async ({ dist, shots, part, ads }) => {
  const G = __G, T = G.THREE, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ps = G.player.s; const pos = ps.pos.clone().add(new T.Vector3(-Math.sin(ps.yaw), 0, -Math.cos(ps.yaw)).multiplyScalar(dist));
  const e = G.enemies.spawn(pos, { yaw: ps.yaw + Math.PI, state: 'patrol' });
  await sleep(400);
  const tgt = (part === 'head' ? e.bones.head : e.bones.spine_02).getWorldPosition(new T.Vector3());
  const eye = G.R.camera.getWorldPosition(new T.Vector3());
  const d = tgt.clone().sub(eye); ps.yaw = Math.atan2(-d.x, -d.z); ps.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
  G.auto = { fire: true, ads: !!ads };
  await sleep(shots * 83);
  G.auto = { fire: false, ads: !!ads };
  return { hp: e.hp, alive: e.alive, ammo: G.weapon.S.ammo };
}, { dist, shots, part, ads: a.ads === '1' });
await p.screenshot({ path: out });
console.log(JSON.stringify(res)); if (logs.length) console.log(logs.slice(0, 6).join('\n'));
await b.close();
