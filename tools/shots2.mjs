// Writes the phase-2 trailer shot scripts (shots/p2/*.json) for tools/record.mjs.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
mkdirSync('shots/p2', { recursive: true });
const bot = readFileSync('shots/bot.js', 'utf8');
const base = '/?shot=1&noenemies=1&nohud=1&q=ultra';
const cam = (x, y, z) => `G.camLocked=true;G.viewModelVisible=false;G.R.camera.position.set(${x},${y},${z});`;
const shots = {
  // 1. hook: the colossus walks out of the sand, lightning behind it, then charges the beam at us
  p2_hook: { seconds: 5, warm: 20, setup: `const G=__G,T=G.THREE;G.god=true;Object.assign(G.env.S,{front:-30,storm:0.4,night:0.45});${cam(-20.6, 2.4, -12)}
    G.boss.spawn(new T.Vector3(-41,0,-15),Math.PI/2,[new T.Vector3(-34,0,-15),new T.Vector3(-33,0,-10)]);G.boss.S.cool=2.6;
    for(const [x,z,s] of [[-17,-9,0.8],[-22,-15,1.2]])G.fire.add(new T.Vector3(x,0.05,z),{size:s,life:99});`,
    perFrame: `const G=__G,c=G.R.camera,B=G.boss.S;c.position.set(-20.6+t*0.06,2.4,-12-t*0.08);c.lookAt(B.pos.x,9,B.pos.z-1);if(Math.abs(t-0.9)<0.009)G.env.strike(new G.THREE.Vector3(-62,45,-30));` },
  // 2. dusk close fight: riflemen + a charger, robots burst apart, a grenade for the last two
  p2_dusk: { seconds: 6, warm: 20, setup: `${bot}const ps=G.player.s;ps.pos.set(-6,ps.pos.y,-4);ps.yaw=-0.4;ps.pitch=0;
    for(const [x,z,k] of [[-3.5,-11,'rifle'],[-8.5,-12,'rifle'],[-1,-17,'charger']]){const e=G.enemies.spawn(new T.Vector3(x,0,z),{yaw:2.8,kind:k});e.lastKnown=ps.pos.clone();e.state='engage';e.mode='aim';}
    G.events.on('enemy:killed',()=>{G.hitstop(0.05);G.player.addShake(0.3);if(G.enemies.alive===0)G.slowmo(0.9,0.28);});`,
    perFrame: `const G=__G;G.auto.str=Math.sin(t*0.9)>0?1:-1;if(Math.abs(t-3.6)<0.009){G.botFire=false;G.auto.gl=true;}if(t>4.1)G.botFire=true;` },
  // 3. the wall arrives: timelapse of the front rolling over the refinery from the gantry roof
  p2_wall: { seconds: 6, warm: 20, setup: `const G=__G,T=G.THREE;Object.assign(G.env.S,{front:230,storm:1,night:0});${cam(4, 13, 8)}`,
    perFrame: `const G=__G,c=G.R.camera;G.env.S.front=230-t*36;c.position.set(4-t*0.3,13,8+t*0.2);c.lookAt(-26,9,-44);if(Math.abs(t-3.2)<0.009)G.env.strike(new G.THREE.Vector3(-60,50,-70));if(Math.abs(t-4.6)<0.009)G.env.strike(new G.THREE.Vector3(-35,45,-50));` },
  // 4. fighting inside the storm: plasma tracers, chargers out of the sand, lightning
  p2_storm: { seconds: 6, warm: 30, setup: `${bot}Object.assign(G.env.S,{front:-60,storm:1,night:0});const ps=G.player.s;ps.pos.set(2,ps.pos.y,-2);ps.yaw=0.3;
    for(const [x,z,k] of [[-2,-11,'rifle'],[3,-14,'charger'],[-5,-15,'charger'],[5,-10,'rifle']]){const e=G.enemies.spawn(new T.Vector3(x,0,z),{yaw:3,kind:k});e.lastKnown=ps.pos.clone();e.state='engage';}
    G.events.on('enemy:killed',()=>{G.hitstop(0.05);G.player.addShake(0.3);});`,
    perFrame: `const G=__G;G.auto.str=Math.sin(t*1.1)>0?1:-1;if(Math.abs(t-1.8)<0.009)G.env.strike(new G.THREE.Vector3(-14,40,-24));if(Math.abs(t-4.4)<0.009)G.env.strike(new G.THREE.Vector3(12,40,-30));` },
  // 5. lightning takes the storage tank by the spawn
  p2_tank: { seconds: 5, warm: 20, setup: `const G=__G,T=G.THREE;G.god=true;Object.assign(G.env.S,{front:-20,storm:1,night:0.1});${cam(-4, 1.7, -9)}`,
    perFrame: `const G=__G,c=G.R.camera;c.position.set(-4+t*0.15,1.7,-9+t*0.1);c.lookAt(10.2,4,2.6);if(Math.abs(t-1.0)<0.009){const tk=G.level.explosives.find(o=>o.userData.explosive?.big);G.env.strike(tk.position.clone().setY(30));setTimeout(()=>G.explosives.hurt(tk,9999),100);}` },
  // 6. fire night: the colossus beams the yard, we go for the coolant tanks, it goes down
  p2_boss: { seconds: 9, warm: 20, setup: `${bot}Object.assign(G.env.S,{front:-140,storm:0.3,night:1});const ps=G.player.s;ps.pos.set(-12,ps.pos.y,-8);ps.yaw=1.28;ps.pitch=0.25;
    for(const [x,z,s] of [[-16,-12,1.2],[-8,-16,0.8],[-19,-4,1.0],[-5,-6,0.6],[-24,-20,1.6],[2,-10,1]])G.fire.add(new T.Vector3(x,0.05,z),{size:s,life:999});
    G.boss.spawn(new T.Vector3(-38,0,-12),Math.PI/2,[new T.Vector3(-33,0,-12),new T.Vector3(-31,0,-6)]);G.boss.S.cool=1.2;G.botTurn=3;`,
    perFrame: `const G=__G;const c=G.boss.cores.find(x=>x.alive);G.botAim=c?c.light.position.clone():G.boss.S.pos.clone().setY(8);G.botFire=t>3.6;if(Math.abs(t-5.0)<0.009){G.botFire=false;G.auto.gl=true;}if(t>5.6&&c){G.boss.damage({core:c,point:c.light.position.clone()},14);}` },
  // 7. the distillation column comes down
  p2_tower: { seconds: 6, warm: 20, setup: `const G=__G,T=G.THREE;Object.assign(G.env.S,{front:-140,storm:0.3,night:1});${cam(-16, 2, -30)}
    for(const [x,z,s] of [[-6,-36,2],[-2,-32,1.5],[-12,-30,1.2],[-8,-26,1]])G.fire.add(new T.Vector3(x,0.05,z),{size:s,life:999});`,
    perFrame: `const G=__G,c=G.R.camera;c.position.set(-16+t*0.15,2,-30);c.lookAt(-4,13-t*1.4,-44);if(Math.abs(t-0.6)<0.009)G.flow.fellTower();` },
};
for (const [name, s] of Object.entries(shots)) writeFileSync(`shots/p2/${name}.json`, JSON.stringify({ name, url: base, fps: 60, size: [1920, 1080], ...s }, null, 1));
console.log(Object.keys(shots).join(' '));
