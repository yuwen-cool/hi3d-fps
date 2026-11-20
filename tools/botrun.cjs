// Unassisted full-match check: a bot that only aims and shoots (no free kills). Must reach state "won".
// node tools/botrun.cjs
const {chromium}=require('playwright');(async()=>{const b=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--use-angle=metal','--enable-gpu']});const p=await b.newPage({viewport:{width:1280,height:720}});const L=[];p.on('pageerror',e=>L.push(e.message));
await p.goto('http://127.0.0.1:5320/?shot=1&god=1&record=1');await p.waitForFunction(()=>window.__ready,null,{timeout:120000});
await p.evaluate(()=>{const G=__G,T=G.THREE;G.god=true;G.log=[];G.kills=[];G.events.on('enemy:killed',e=>G.kills.push(+G.time.toFixed(0)));G.events.on('flow:act',e=>G.log.push(['act'+e.act,+G.time.toFixed(0)]));for(const n of ['tank:boom','boss:spawn','boss:core','boss:dead','tower:down','flow:extract','flow:won'])G.events.on(n,()=>G.log.push([n,+G.time.toFixed(0)]));
 let t=0,burst=0;G.modules.bot={update(dt){t+=dt;const ps=G.player.s;const es=G.enemies.list.filter(e=>e.alive);let tgt=null,bd=1e9;const eye=G.R.camera.getWorldPosition(new T.Vector3());
  for(const e of es){const h=e.bones.spine_03.getWorldPosition(new T.Vector3());const d=h.distanceTo(eye);if(d<bd&&G.phys.los(eye,h)){bd=d;tgt=h;}}
  const B=G.boss.S;if(!tgt&&B.active&&!B.dead){const c=G.boss.cores.find(x=>x.alive);if(c){const cp=c.light.position.clone();const d=cp.clone().sub(eye);const len=d.length();d.normalize();const hw=G.phys.raycast(eye,d,len);if(!hw){tgt=cp;bd=len;}}}
  if(G.weapon.S.ammo+G.weapon.S.reserve<20){const c=G.level.crates.slice().sort((a,b)=>a.distanceTo(ps.pos)-b.distanceTo(ps.pos))[0];const d=c.clone().sub(ps.pos);ps.yaw=Math.atan2(-d.x,-d.z);G.auto={fwd:1,str:0};return;}
  if(G.flow.S.state==='extract'){const ex=G.flow.S.extract;const d=ex.clone().sub(ps.pos);ps.yaw=Math.atan2(-d.x,-d.z);G.auto={fwd:1,str:0};return;}
  G.auto={fwd:Math.sin(t*0.7)>0.3?1:0,str:Math.sin(t*1.3)>0?1:-1};
  if(tgt){const d=tgt.clone().sub(eye);const yaw=Math.atan2(-d.x,-d.z),pit=Math.atan2(d.y,Math.hypot(d.x,d.z));ps.yaw+=Math.atan2(Math.sin(yaw-ps.yaw),Math.cos(yaw-ps.yaw))*Math.min(1,dt*8);ps.pitch+=(pit-ps.pitch)*Math.min(1,dt*8);burst+=dt;G.auto.fire=(burst%0.9)<0.45;G.auto.fwd=0;}
  if(G.weapon.S.ammo===0&&!G.weapon.S.reloading)G.weapon.startReload();}};
 const bot=G.modules.bot;delete G.modules.bot;const ie=G.modules.inputEnd;delete G.modules.inputEnd;G.modules.bot=bot;G.modules.inputEnd=ie;
 const I=G.input;const d0=I.down;I.down=(a)=>(a==='fwd'&&G.auto?.fwd>0)||(a==='right'&&G.auto?.str>0)||(a==='left'&&G.auto?.str<0)||d0(a);});
const snaps=[];
for(let s=0;s<600;s+=10){const r=await p.evaluate(()=>{__step(300,1/30);const G=__G,T=G.THREE;const pp=G.player.s.pos;const eye=G.R.camera.getWorldPosition(new T.Vector3());
 return {t:Math.round(G.time),act:G.flow.S.act,wave:G.flow.S.wave,reserve:G.weapon.S.reserve,ammo:G.weapon.S.ammo,pl:[+pp.x.toFixed(0),+pp.z.toFixed(0)],en:G.enemies.list.filter(e=>e.alive).map(e=>({p:[+e.root.position.x.toFixed(0),+e.root.position.z.toFixed(0)],st:e.state,mode:e.mode,d:+e.root.position.distanceTo(pp).toFixed(0),los:G.phys.los(eye,e.bones.spine_03.getWorldPosition(new T.Vector3())),wp:e.wp.length,k:e.kind}))}});snaps.push(r);if(await p.evaluate(()=>__G.flow.S.state==='won'))break;}
for(const r of snaps)console.log(r.t,'act',r.act,'wave',r.wave,'ammo',r.ammo+'/'+r.reserve,'alive',r.en.length,r.en.map(e=>e.st[0]+e.d+(e.los?'L':'')).join(' '));
console.log(JSON.stringify(await p.evaluate(()=>({state:__G.flow.S.state,kills:__G.kills.length,log:__G.log,gl:__G.weapon.S.gl,bossHp:__G.boss.S.hp,err:__errors}))),L.slice(0,3));await b.close()})()
