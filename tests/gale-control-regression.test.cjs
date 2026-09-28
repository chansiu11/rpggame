const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');
function section(start,end){const a=html.indexOf(start),b=html.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,'Missing '+start);return html.slice(a,b);}
const vortex=new Function(section('const GALE_VORTEX=Object.freeze(','window.EchoesGaleVortex=GALE_VORTEX;')+'return GALE_VORTEX;')();
test('Gale 4 stuns on capture and keeps solo-world enemies stunned without extra hits',()=>{
 const source=section('function updateGaleVortices(dt){','const GALE_PULSE_RADIUS=');
 const mob={id:'target',type:'sprout',x:208,y:100,r:18,hp:100,stun:0,kind:'regular'};
 const sim=new Function('cfg','mob',`
 const GALE_VORTEX=cfg,player={x:100,y:100,r:15},options={shake:false};
 let realTime=1,galeVortices=[{x:200,y:100,a:0,t:5,age:0,damage:15,hitAt:new Map(),caught:new Map(),controlAt:0}],remoteGaleVortices=[],shake=0,multiplayerMode=false;
 const window={EchoesMulti:{connected:false}},clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const hits=[],combatTargets=()=>[mob],combatCenter=e=>({x:e.x,y:e.y}),combatRadius=e=>e.r||18;
 const ring=()=>{},damageValue=()=>15,moveBody=(e,x,y)=>{e.x+=x;e.y+=y},worldTargetControl=()=>{};
 const applyEnemyStun=(e,d)=>{e.stun=Math.max(e.stun||0,d)};
 const hitEnemy=(e,amount,heavy,source,ctrl)=>{hits.push(ctrl);e.stun=Math.max(e.stun||0,ctrl.stun||0)};
 const releaseGaleVortex=()=>{};
 ${source}
 return {run:dt=>updateGaleVortices(dt),hits};
 `)(vortex,mob);
 sim.run(.016);assert.equal(sim.hits.length,1);assert.equal(sim.hits[0].stun,.95);assert.ok(mob.stun>=.95);
 mob.stun=0;sim.run(.016);assert.equal(sim.hits.length,1,'stun refresh must not cause additional damage');assert.ok(mob.stun>=.18);
});
test('Gale 3 pulls much farther in solo world and online player/mob control',()=>{
 const source=section('const GALE_PULSE_RADIUS=292','function updateSwordSkillMotion(');
 const run=new Function('mob','online',`
 const player={x:100,y:100,r:15},realTime=1,actions=[];
 let multiplayerMode=online;
 const window={EchoesMulti:{connected:online,damageMob:(id,d,ctl)=>actions.push({id,...ctl}),damageBoss:(id,d,ctl)=>actions.push({id,...ctl})}};
 const combatTargets=()=>[mob],combatCenter=e=>({x:e.x,y:e.y}),combatRadius=e=>e.r||18;
 const worldTargetControl=(id,ctl)=>actions.push({id,...ctl}),moveBody=(e,x,y)=>{e.x+=x;e.y+=y};
 ${source}
 const before=mob.x;updateGalePulseChargePull({skillId:'galeOrbit',elapsed:.1},.25);
 return {distance:before-mob.x,actions,pullSpeed:GALE_PULSE_PULL_SPEED};
 `);
 const solo=run({id:'solo',x:340,y:100,r:18,type:'sprout'},false);
 const online=run({id:'remote',x:340,y:100,r:18,type:'player',networkPlayer:true},true);
 const mob=run({id:'mob',x:340,y:100,r:18,type:'sprout',kind:'regular'},true);
 assert.equal(solo.pullSpeed,270);assert.equal(solo.distance,67.5);
 assert.equal(online.actions[0].x,313);assert.equal(mob.actions[0].knockbackX,-27);
 assert.ok(html.includes('Math.min(d-stop,PVP_GALE_PULSE_PULL_SPEED*dt)'),'PVP must use the shared stronger pull speed');
});
test('Gale 4 PVP sends entry stun and maintains victim stun during orbit',()=>{
 const source=section("function spawnPvpGaleVortex(x,y,a,remote=false,id=''){","function pvpSwordSignatureFx(");
 const sim=new Function('cfg',`
 const GALE_VORTEX_PVP=cfg,ARENA_W=3000,ARENA_H=2000,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 let pvpVortices=[],pvpVortexSeq=0,pvpShake=0,roundLocked=false;
 const me={x:100,y:100,hp:100,stun:0,galeRoot:0},enemy={x:200,y:100,hp:100,r:18},packets=[];
 const net=m=>packets.push(m),sendAttack=m=>packets.push(m),ring=()=>{},nova=()=>{},burst=()=>{},pvpSkillAttack=()=>100;
 ${source}
 return {me,packets,spawn:spawnPvpGaleVortex,step:updatePvpGaleVortices};
 `)(vortex);
 sim.spawn(110,100,0,false,'attack');sim.step(.016);
 assert.equal(sim.packets.find(p=>p.skillId==='starRush')?.stun,.95);
 const captured=sim.spawn(110,100,0,true,'victim');captured.caught={angle:0};sim.step(.016);
 assert.ok(sim.me.stun>=.18);assert.ok(sim.me.galeVortexAnchor);
 sim.me.x=800;sim.me.y=900;captured.t=.001;sim.step(.016);
 assert.ok(sim.me.forcedMove,'victim must launch itself on release');
 assert.ok(Math.abs(Math.hypot(sim.me.forcedMove.x-800,sim.me.forcedMove.y-900)-195)<1e-7,'PVP release distance must be halved to 195');
});

test('Gale 4 world releases targets at half the former distance',()=>{
 const source=section('function releaseGaleVortex(v){','function updateGaleVortices(dt){');
 const release=new Function('mob','online',`
 let multiplayerMode=online,skill2Knocks=[],actions=[];
 const window={EchoesMulti:{connected:online,damageMob:(id,d,ctrl)=>actions.push(ctrl),damageBoss:(id,d,ctrl)=>actions.push(ctrl)}};
 const combatTargets=()=>[mob],combatCenter=e=>({x:e.x,y:e.y}),ring=()=>{};
 const worldTargetControl=(id,ctrl)=>actions.push(ctrl);
 ${source}
 releaseGaleVortex({x:100,y:100,caught:new Map([[mob.id,{}]])});
 return {knocks:skill2Knocks,actions};
 `);
 const local=release({id:'solo',x:150,y:100,r:18,type:'sprout'},false);
 assert.equal(local.knocks.length,1);assert.equal(local.knocks[0].x-local.knocks[0].startX,185);
 const onlinePlayer=release({id:'remote',x:150,y:100,r:18,type:'player',networkPlayer:true},true);
 assert.equal(onlinePlayer.actions.length,1);assert.equal(onlinePlayer.actions[0].x,335);
 const onlineMob=release({id:'mob',x:150,y:100,r:18,type:'sprout',kind:'regular'},true);
 assert.equal(onlineMob.actions.length,1);assert.equal(onlineMob.actions[0].knockbackX,185);
});
