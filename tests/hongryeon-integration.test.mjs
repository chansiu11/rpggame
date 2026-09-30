import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createArena} from '../multiplayer-server/ai/arena-runtime.js';
import {seedPolicy,createBrain,styles,learn} from '../multiplayer-server/ai/brain.js';
import {validatePolicy} from '../multiplayer-server/ai/store.js';
import {duel} from '../multiplayer-server/ai/self-play.js';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const server=readFileSync(new URL('../multiplayer-server/server.js',import.meta.url),'utf8');
const skills=[
 ['guardBreak','flameBreathSweep'],
 ['earthRend','flameBreathRise'],
 ['quakeRush','flameBreathCleave'],
 ['ironJudgment','flameBreathWheel'],
 ['meteorBreaker','flameBreathFinale']
];

test('the production client and world server recognize all five current Hongryeon forms',()=>{
 for(const [id,mode] of skills){
  assert.match(html,new RegExp("id:'"+id+"'[^\\n]+mode:'"+mode+"'"),id+' config');
  assert.match(server,new RegExp('"'+id+'"[^\\n]+"mode":"'+mode+'"'),id+' world-server config');
 }
 assert.match(html,/function updateFlameBreathFinale\(/,'world hit-confirmed ultimate');
 assert.match(html,/function pvpHongryeonFinale\(/,'dedicated PvP hit-confirmed ultimate');
 assert.match(html,/function styleAdeptExactShapes\(/,'NPC predicted hitboxes');
 assert.match(server,/FLAME_FINALE_CUTS\.map\(c=>\.53\+c\.at\)/,'server-owned follow-up timestamps');
 assert.match(server,/bypassShield:data\.cfg\.mode/,'shield bypass data reaches the client');
});

test('older v1 checkpoints preserve trained styles and initialize only Hongryeon',()=>{
 const previous=seedPolicy();delete previous.styles.break;
 previous.matches=208;previous.generation=12;previous.styles.gale.weights=[2.2,.35,4.8];
 previous.styles.void.games=120;previous.styles.dawn.reward=18.5;
 const restored=validatePolicy(JSON.parse(JSON.stringify(previous)));
 assert.deepEqual(restored.styles.gale.weights,[2.2,.35,4.8]);
 assert.equal(restored.styles.void.games,120);
 assert.equal(restored.styles.dawn.reward,18.5);
 assert.deepEqual(restored.styles.break.weights,[1,1,1]);
 assert.equal(restored.styles.break.games,0);
 learn(restored,'break',0,{win:true,reward:.4,metrics:{hits:1}});
 assert.equal(restored.styles.break.games,1);
 assert.equal(restored.styles.gale.games,previous.styles.gale.games);
});

test('Hongryeon AI supports all five skill indices without changing old style entries',()=>{
 assert.deepEqual(styles.break.combos[0].slice().sort(),[0,1,2,3,4]);
 const policy=seedPolicy(),brain=createBrain('break',policy,()=>.15);
 const me={x:1000,y:1000,stam:100,maxStam:100,hp:100,maxHp:100,shield:100,stun:0,cool:[0,0,0,0,0],skillEvent:null,skillHold:null},
 enemy={x:1150,y:1000,dash:0,attackAnim:0,skillPose:-1};
 const actions=[];for(let i=0;i<60;i++){
  const v=brain.step(.35,me,enemy);if(Number.isInteger(v.skill)){actions.push(v.skill);me.cool[v.skill]=100;}
 }
 assert.ok(actions.length>0);
 assert.ok(actions.every(i=>i>=0&&i<=4));
});

test('PvP sends the shared world Hongryeon startup, strike and trail recipes to the opponent',()=>{
 assert.match(html,/window\.EchoesDrawWorldFx=\(drawContext,fxList,ground=false,bounds=null\)/);
 assert.match(html,/function pvpHongryeonPacket\(p\)/);
 assert.match(html,/function pvpHongryeonStartup\(sk,x,y,a\)/);
 assert.match(html,/function pvpHongryeonTrail\(x1,y1,x2,y2,power=1,ev=null\)/);
 assert.match(html,/if\(f\.kind==='hongWorldFx'\)/,'the local arena renders the world primitives');
 assert.match(html,/const allowed=\['guardBreak','earthRend','quakeRush','ironJudgment','meteorBreaker'\]/,
  'incoming PvP flame packets must support all five current skills');
 assert.match(html,/draw\(ctx,visible,true,bounds\);draw\(ctx,visible,false,bounds\)/,
  'the world ground scorch and airborne flames must both be rendered');
});

test('Hongryeon arena boots with original saved character data, costs and five equipped slots',()=>{
 const arena=createArena({style:'break',level:100});
 try{
  arena.api.init(arena.snapshot,arena.snapshot,true,()=>{});
  assert.equal(arena.api.me.swordStyle,'break');
  assert.deepEqual(Array.from(arena.api.me.swordSkills?.map(s=>s?.id)),skills.map(s=>s[0]));
  assert.equal(arena.api.me.cool.length,5);
  assert.ok(arena.snapshot.hp>0||arena.snapshot.maxHp>0);
 }finally{arena.dispose();}
});

test('Hongryeon ultimate ends after missed dash and follows up only on confirmed hit',()=>{
 const a=createArena({style:'break',level:100}),out=[];
 try{
  a.api.init(a.snapshot,a.snapshot,true,m=>out.push(m));
  a.api.enemy.x=a.api.me.x+1750;a.api.enemy.y=a.api.me.y;
  a.api.enemy.netX=a.api.enemy.x;a.api.enemy.netY=a.api.enemy.y;
  a.api.control({keys:[],aim:0,skill:4});
  a.step(.35);a.api.control({keys:[],aim:0,release:4});
  assert.equal(a.api.me.skillEvent?.skill?.id,'meteorBreaker','ultimate should cast after preparation and key release');
  for(let i=0;i<100;i++)a.step(1/60);
  assert.equal(out.some(m=>m.t==='atk'&&m.skillId==='meteorBreaker'),false,'miss should send no fabricated hits');
  assert.equal(a.api.me.skillEvent,null,'missed dash must finish instead of starting the finisher');
 }finally{a.dispose();}
 const b=createArena({style:'break',level:100}),hits=[];
 try{
  b.api.init(b.snapshot,b.snapshot,true,m=>hits.push(m));
  b.api.enemy.x=b.api.me.x+350;b.api.enemy.y=b.api.me.y;
  b.api.enemy.netX=b.api.enemy.x;b.api.enemy.netY=b.api.enemy.y;
  b.api.control({keys:[],aim:0,skill:4});
  b.step(.35);b.api.control({keys:[],aim:0,release:4});
  assert.equal(b.api.me.skillEvent?.skill?.id,'meteorBreaker');
  for(let i=0;i<110&&!hits.some(m=>m.t==='atk'&&m.skillId==='meteorBreaker');i++)b.step(1/60);
  const first=hits.find(m=>m.t==='atk'&&m.skillId==='meteorBreaker');
  assert.ok(first,'short dash must produce an opening hit packet');
  b.api.receive({t:'attackResult',id:first.id,result:'hit'});
  assert.equal(b.api.me.skillEvent?.hongCaught,true,'only confirmed damage can start the 14-cut follow-up');
  for(let i=0;i<260;i++)b.step(1/60);
  const combos=hits.filter(m=>m.t==='atk'&&m.skillId==='meteorBreaker');
  assert.ok(combos.length>=15,'opening hit plus all 14 authored cuts must be emitted');
 }finally{b.dispose();}
});


test('Hongryeon PVP fifth-form immediately ends when its caught opponent dies',()=>{
 const arena=createArena({style:'break',level:100}),packets=[];
 try{
  arena.api.init(arena.snapshot,arena.snapshot,true,m=>packets.push(m));
  arena.api.enemy.x=arena.api.me.x+350;arena.api.enemy.y=arena.api.me.y;
  arena.api.enemy.netX=arena.api.enemy.x;arena.api.enemy.netY=arena.api.enemy.y;
  arena.api.control({keys:[],aim:0,skill:4});arena.step(.35);
  arena.api.control({keys:[],aim:0,release:4});
  for(let i=0;i<110&&!packets.some(m=>m.t==='atk'&&m.skillId==='meteorBreaker');i++)arena.step(1/60);
  const opening=packets.find(m=>m.t==='atk'&&m.skillId==='meteorBreaker');
  assert.ok(opening,'opening dash should hit');
  arena.api.receive({t:'attackResult',id:opening.id,result:'hit'});
  assert.equal(arena.api.me.skillEvent?.hongCaught,true);
  arena.api.enemy.hp=0;arena.step(1/60);
  assert.equal(arena.api.me.skillEvent,null,'victim death cancels the remaining animation');
  assert.equal(arena.api.me.attackCd,0);
  assert.equal(arena.api.me.moveLock,0);
  const hits=packets.filter(m=>m.t==='atk'&&m.skillId==='meteorBreaker').length;
  for(let i=0;i<120;i++)arena.step(1/60);
  assert.equal(packets.filter(m=>m.t==='atk'&&m.skillId==='meteorBreaker').length,hits,'no phantom follow-up strikes after kill');
 }finally{arena.dispose();}
});

test('all four regular Hongryeon forms emit authored PVP hit timings and shield metadata',()=>{
 const expected=[2,1,2,3];
 for(let index=0;index<4;index++){
  const a=createArena({style:'break',level:100}),packets=[];
  try{
   a.api.init(a.snapshot,a.snapshot,true,m=>packets.push(m));
   a.api.enemy.x=a.api.me.x+180;a.api.enemy.y=a.api.me.y;
   a.api.enemy.netX=a.api.enemy.x;a.api.enemy.netY=a.api.enemy.y;
   a.api.control({keys:[],aim:0,skill:index});a.step(.35);
   a.api.control({keys:[],aim:0,release:index});
   assert.equal(a.api.me.skillEvent?.skill?.id,skills[index][0],'skill '+(index+1)+' must launch');
   for(let n=0;n<92;n++)a.step(1/60);
   const hits=packets.filter(p=>p.t==='atk'&&p.skillId===skills[index][0]);
   assert.equal(hits.length,expected[index],'skill '+(index+1)+' must emit its current authored hit count');
   assert.ok(hits.every(p=>Number.isFinite(p.d)&&p.d>0&&Number.isFinite(p.stun)&&p.stun>0));
   assert.ok(packets.some(p=>p.t==='fxBatch'),'each skill must send bounded remote visual events');
   if(index===1){assert.equal(hits[0].bypassShield,true);assert.equal(hits[0].shape==='circle'||hits[0].shape==='segment',true);}
   if(index===3){assert.ok(hits.every(p=>p.controlLease==='hongWheel'));}
  }finally{a.dispose();}
 }
});


test('server-owned Hongryeon NPC shapes follow the authored five move tracks',async()=>{
 const {runInNewContext}=await import('node:vm');
 const fn=name=>{const a=server.indexOf('function '+name+'('),b=server.indexOf(String.fromCharCode(10)+'function ',a+10);assert.ok(a>0&&b>a,name);return server.slice(a,b);};
 const first=server.indexOf('const FLAME_FINALE_CUTS=Object.freeze('),last=server.indexOf('function styleServerPose(',first);
 assert.ok(first>0&&last>first);
 const c={Math,Number,clamp:(v,lo,hi)=>Math.max(lo,Math.min(hi,v))};
 runInNewContext(server.slice(first,last)+fn('styleServerPose')+fn('styleServerShapes')+';globalThis.pose=styleServerPose;globalThis.shapes=styleServerShapes;',c);
 const m=(hits,slot)=>({x:1000,y:1000,locked:0,styleOriginX:1000,styleOriginY:1000,styleAnchorX:1350,styleAnchorY:1000,styleSide:1,styleHits:hits,skillSlot:slot});
 const sweep=c.shapes(m([.24,.48],0),{cfg:{mode:'flameBreathSweep',duration:.62}},0);
 assert.equal(sweep[0].r,300);assert.equal(sweep[0].type,'sector');
 const rise=c.shapes(m([.5],1),{cfg:{mode:'flameBreathRise',duration:.8}},0);
 assert.equal(rise[0].r,250);assert.equal(rise[1].w,76);
 assert.equal(Math.round(rise[1].x2),1328);
 const leap=c.shapes(m([.10,.65],2),{cfg:{mode:'flameBreathCleave',duration:.85}},1);
 assert.equal(leap[0].r,245);
 const wheel=c.pose(m([.18,.375,.58],3),{cfg:{mode:'flameBreathWheel',duration:.83}},2);
 assert.ok(wheel.x>1700&&wheel.x<1870,'third cut should finish the smooth, extended S dash');
 const finale=c.shapes(m([.53,.70],4),{cfg:{mode:'flameBreathFinale',duration:.71}},0);
 assert.equal(finale[0].type,'segment');assert.equal(finale[0].w,79);
 assert.equal(Math.round(finale[0].x2),1271);
 const follow=c.shapes(m([.53,.70],4),{cfg:{mode:'flameBreathFinale',duration:4.14}},1);
 assert.equal(follow[0].type,'sector');
});

test('Hongryeon self-play uses live PVP mechanics and returns finite learning rewards',()=>{
 const p=seedPolicy(),result=duel('break','gale',p,p,411,3);
 assert.ok(result.results.every(x=>Number.isFinite(x.reward)));
 assert.ok(result.results.some(x=>x.metrics.attempts>0));
});

test('PVP draws the actual test-version vortex for both fighters from confirmed combat state',()=>{
 const arena=createArena({style:'break',level:100});
 try{
  const {api,c}=arena,frames=[],original=c.EchoesDrawFlameFinaleVortex;
  assert.equal(typeof original,'function','The original test-build vortex is exposed by the world renderer');
  assert.equal(typeof api.render,'function','The headless PVP harness can exercise the real PVP render path');
  c.EchoesDrawFlameFinaleVortex=(seq,ctx,center,caster,quality)=>{
   original(seq,ctx,center,caster,quality);
   frames.push({since:seq.elapsed-seq.flameCaughtAt,centerX:seq.flameVortexCenterX,
    centerY:seq.flameVortexCenterY,particles:seq.flameVortexParticleCount,
    spin:seq.flameVortexSpinRate,casterX:caster.x});
  };
  api.init(arena.snapshot,arena.snapshot,true,()=>{});
  api.enemy.x=api.me.x+260;api.enemy.y=api.me.y;
  api.render();
  assert.equal(frames.length,0,'Idle PVP must not draw any fifth-form fire');
  api.me.skillKind=''; // Rendering must not depend on a transient pose string.
  api.me.skillEvent={kind:'swordSeq',skill:{id:'meteorBreaker'},hongCaught:true,
   elapsed:1.14,hongCaughtAt:.53,side:1};
  api.render();
  assert.equal(frames.length,1,'The caster must see the original vortex after a confirmed hit');
  assert.equal(frames[0].particles,1040,'The real test-build high-quality 780+260 particles render');
  assert.equal(frames[0].spin,410);
  assert.equal(frames[0].centerX,api.enemy.x);
  api.me.skillEvent=null;
  api.receive({t:'state',x:api.enemy.x,y:api.enemy.y,a:api.enemy.a,
   hp:api.enemy.hp,skillPose:4,skillKind:'flameBreathFinale',skillId:'meteorBreaker',
   hongVortexActive:true,hongVortexSince:.8,hongVortexSide:-1});
  assert.equal(api.enemy.hongVortexActive,true,'The recipient must read the explicit PvP hit-confirmed state');
  api.render();
  assert.equal(frames.length,2,'The defender must also see the original vortex');
  assert.equal(frames[1].centerX,api.me.x);
  assert.equal(frames[1].spin,410);
  api.receive({t:'state',x:api.enemy.x,y:api.enemy.y,a:api.enemy.a,
   hp:api.enemy.hp,skillPose:-1,skillKind:'',skillId:'',
   hongVortexActive:false,hongVortexSince:0,hongVortexSide:1});
  api.render();
  assert.equal(frames.length,2,'Remote vortex must stop when the confirmed combo ends');
 }finally{arena.dispose();}
});

test('PvP fifth form uses world flame cuts and rotating fire without old explosion overlays',()=>{
 const start=html.indexOf('function pvpHongryeonFinale(ev,dt)'),end=html.indexOf('function pvpWorldSwordMotion(',start);
 assert.ok(start>0&&end>start);
 const pvp=html.slice(start,end);
 assert.doesNotMatch(pvp,/pvpCrimsonImpact\(|pvpCrimsonOutside\(|slashFx\(/,
   'Old PvP-only explosions and line slashes must not cover the original TEST vortex');
 assert.match(pvp,/pvpHongryeonFx\(cut\.kind==='finisher'/,
   'The confirmed final combo must emit the shared world sword-flame recipe');
 assert.match(html,/const angles=\{wide:-\.26,reverse:\.37/,
   'The shared world factory must keep the authored original fifth-form sword angles');
 assert.match(html,/window\.EchoesBuildHongryeonFx=function\(p\)/,
   'PvP must construct the exact world flame primitives');
 assert.match(html,/const drawVortex=window\.EchoesDrawFlameFinaleVortex/,
   'The PvP canvas must use the exact original TEST vortex renderer');
 assert.match(html,/hongVortexActive:me\.skillEvent\?\.skill\?\.id==='meteorBreaker'/,
   'The same confirmed vortex state must be sent to the remote player');
 const arena=createArena({style:'break',level:100}),packets=[];
 try{
  arena.api.init(arena.snapshot,arena.snapshot,true,m=>packets.push(m));
  arena.api.enemy.x=arena.api.me.x+350;arena.api.enemy.y=arena.api.me.y;
  arena.api.enemy.netX=arena.api.enemy.x;arena.api.enemy.netY=arena.api.enemy.y;
  arena.api.control({keys:[],aim:0,skill:4});arena.step(.35);
  arena.api.control({keys:[],aim:0,release:4});
  for(let i=0;i<110&&!packets.some(m=>m.t==='atk'&&m.skillId==='meteorBreaker');i++)arena.step(1/60);
  const opening=packets.find(m=>m.t==='atk'&&m.skillId==='meteorBreaker');
  assert.ok(opening);
  arena.api.receive({t:'attackResult',id:opening.id,result:'hit'});
  assert.equal(arena.api.me.skillEvent?.hongCaught,true);
  const recorded=[],original=arena.c.EchoesDrawFlameFinaleVortex;
  assert.equal(typeof original,'function');
  arena.c.EchoesDrawFlameFinaleVortex=(...args)=>{recorded.push(args);return original(...args);};
  arena.step(.20);arena.api.render();
  assert.equal(recorded.length,1,'Local confirmed fifth form renders one original vortex');
  assert.equal(recorded[0][2].x,arena.api.enemy.x,'The original vortex is centered on the caught enemy');
  assert.equal(recorded[0][0].skillId,'meteorBreaker');
  assert.ok(recorded[0][0].elapsed>recorded[0][0].flameCaughtAt);
  arena.api.me.skillEvent=null;arena.api.me.skillKind='';recorded.length=0;
  arena.api.receive({t:'state',x:arena.api.enemy.x,y:arena.api.enemy.y,
   hp:arena.api.enemy.hp,skillPose:4,skillId:'meteorBreaker',skillKind:'flameBreathFinale',
   hongVortexActive:true,hongVortexSince:.48,hongVortexSide:-1});
  arena.api.render();
  assert.equal(recorded.length,1,'Remote confirmed fifth form renders the same original vortex once');
  assert.equal(recorded[0][2].x,arena.api.me.x,'The remote vortex surrounds its victim');
  assert.equal(recorded[0][0].side,-1);
 }finally{arena.dispose();}
});


test('Hongryeon regular PvP cuts reach the opponent and state replay cannot double-render them',()=>{
 for(let slot=0;slot<4;slot++){
  const attacker=createArena({style:'break',level:100}),defender=createArena({style:'gale',level:100}),packets=[];
  try{
   attacker.api.init(attacker.snapshot,defender.snapshot,true,m=>packets.push(JSON.parse(JSON.stringify(m))));
   defender.api.init(defender.snapshot,attacker.snapshot,false,()=>{});
   attacker.api.control({keys:[],aim:0,skill:slot});
   attacker.step(.35);
   attacker.api.control({keys:[],aim:0,release:slot});
   for(let j=0;j<85;j++)attacker.step(1/60);
   const id=skills[slot][0],direct=packets.find(p=>p.t==='hongFx'&&p.f.id===id&&p.f.phase==='signature');
   assert.ok(direct,'skill '+(slot+1)+' needs an explicit remote flame event');
   const fallback=packets.find(p=>p.t==='state'&&p.hongFxReplay?.some(e=>e.seq===direct.f.seq));
   assert.ok(fallback,'skill '+(slot+1)+' should survive a dropped fire packet using state replay');
   defender.api.receive(direct);
   defender.api.receive({t:'fxBatch',effects:[direct.f]});
   defender.api.receive(fallback);
   const fire=defender.api.effects.filter(f=>f.kind==='hongWorldFx'&&f.id===id&&f.phase==='signature');
   assert.equal(fire.length,1,'direct, batch and state must draw one copy on defender');
   assert.doesNotThrow(()=>defender.api.render());
   assert.ok(fire[0].worldFx?.length>0,'defender must create and render actual shared world flame primitives');
  }finally{attacker.dispose();defender.dispose();}
 }
});

test('PvP fifth-form confirmed hit sends the first flame to the other player from inside attackResult',()=>{
 const attacker=createArena({style:'break',level:100}),defender=createArena({style:'break',level:100}),packets=[];
 try{
  attacker.api.init(attacker.snapshot,defender.snapshot,true,m=>packets.push(JSON.parse(JSON.stringify(m))));
  defender.api.init(defender.snapshot,attacker.snapshot,false,()=>{});
  attacker.api.enemy.x=attacker.api.me.x+350;attacker.api.enemy.y=attacker.api.me.y;
  attacker.api.enemy.netX=attacker.api.enemy.x;attacker.api.enemy.netY=attacker.api.enemy.y;
  attacker.api.control({keys:[],aim:0,skill:4});attacker.step(.35);
  attacker.api.control({keys:[],aim:0,release:4});
  for(let i=0;i<110&&!packets.some(p=>p.t==='atk'&&p.skillId==='meteorBreaker');i++)attacker.step(1/60);
  const hit=packets.find(p=>p.t==='atk'&&p.skillId==='meteorBreaker');
  assert.ok(hit,'opening dash should connect');
  const before=packets.length;
  attacker.api.receive({t:'attackResult',id:hit.id,result:'hit'});
  const confirmed=packets.slice(before).find(p=>p.t==='hongFx'&&p.f.id==='meteorBreaker'&&p.f.phase==='signature'&&p.f.index===0);
  assert.ok(confirmed,'incoming hit ACK must not suppress the attacker’s outbound flame');
  defender.api.receive(confirmed);
  const received=defender.api.effects.find(f=>f.kind==='hongWorldFx'&&f.id==='meteorBreaker'&&f.index===0);
  assert.ok(received,'defender should receive the actual first hit flame');
  assert.doesNotThrow(()=>defender.api.render());
  assert.ok(received.worldFx?.length>0,'defender renders the same authored world first-hit flames');
 }finally{attacker.dispose();defender.dispose();}
});

test('Hongryeon fourth-form finishing launch is not overridden by older PvP carry snapshots',()=>{
 const a=createArena({style:'gale',level:100}),sent=[];
 try{
  a.api.init(a.snapshot,a.snapshot,true,m=>sent.push(m));
  const me=a.api.me,enemy=a.api.enemy,originalX=me.x,originalY=me.y;
  me.controlLease={key:'hongWheel',until:performance.now()+920};
  const stale={t:'state',x:enemy.x,y:enemy.y,hp:enemy.hp,
   controlKey:'hongWheel',controlX:originalX-110,controlY:originalY,
   controlTime:.12,controlStun:.20,controlSeq:30};
  a.api.receive(stale);
  assert.equal(me.forceTrack?.source,'stigmaState','the prior two hits can still carry the defender');
  a.api.receive({t:'atk',id:981,skillId:'ironJudgment',teleportHit:true,rapidHit:true,
   d:5,stun:.94,force:155,forceA:0,controlLease:'hongWheel',controlLeaseMs:920});
  assert.equal(me.forcedMove?.priority,true,'the third hit uses the defender-native knockback');
  assert.equal(me.forceTrack,null,'the previous carry must end immediately on the finishing hit');
  a.api.receive({...stale,controlSeq:31});
  assert.equal(me.forceTrack,null,'a delayed carry state cannot bring the launched defender back');
  for(let i=0;i<32;i++)a.step(1/60);
  assert.ok(me.x>originalX+95,'the defender should remain displaced in the final slash direction');
 }finally{a.dispose();}
});

test('Hongryeon fourth form never resumes carrying after its last PvP cut',()=>{
 const a=createArena({style:'break',level:100}),sent=[];
 try{
  a.api.init(a.snapshot,a.snapshot,true,m=>sent.push(m));
  a.api.enemy.x=a.api.me.x+180;a.api.enemy.y=a.api.me.y;
  a.api.enemy.netX=a.api.enemy.x;a.api.enemy.netY=a.api.enemy.y;
  a.api.control({keys:[],aim:0,skill:3});a.step(.35);
  a.api.control({keys:[],aim:0,release:3});
  let first=null,second=null,third=null;
  for(let i=0;i<90&&!third;i++){
   a.step(1/60);
   const cuts=sent.filter(m=>m.t==='atk'&&m.skillId==='ironJudgment');
   if(cuts[0]&&!first){first=cuts[0];a.api.receive({t:'attackResult',id:first.id,result:'hit'});}
   if(cuts[1])second=cuts[1];
   if(cuts[2])third=cuts[2];
  }
  assert.ok(first&&second&&third,'all three authored sword cuts should be emitted');
  assert.equal(third.force,155);
  assert.equal(a.api.me.skillEvent?.hongWheelReleased,true,'third cut releases the victim');
  assert.equal(a.api.me.outgoingControl,null,'the stale carry snapshot is cleared before the launch');
  a.api.receive({t:'attackResult',id:second.id,result:'hit'});
  assert.equal(a.api.me.skillEvent?.hongWheelCaught,false,'a late second-cut ACK cannot restart carry');
 }finally{a.dispose();}
});

test('Hongryeon fifth form halves opening and follow-up PvP stun without changing damage',()=>{
 const a=createArena({style:'break',level:100}),sent=[];
 try{
  a.api.init(a.snapshot,a.snapshot,true,m=>sent.push(m));
  a.api.enemy.x=a.api.me.x+350;a.api.enemy.y=a.api.me.y;
  a.api.enemy.netX=a.api.enemy.x;a.api.enemy.netY=a.api.enemy.y;
  a.api.control({keys:[],aim:0,skill:4});a.step(.35);
  a.api.control({keys:[],aim:0,release:4});
  for(let i=0;i<110&&!sent.some(m=>m.t==='atk'&&m.skillId==='meteorBreaker');i++)a.step(1/60);
  const opening=sent.find(m=>m.t==='atk'&&m.skillId==='meteorBreaker');
  assert.ok(opening);
  assert.equal(opening.stun,1.55,'opening stun is half of 3.1 seconds');
  a.api.receive({t:'attackResult',id:opening.id,result:'hit'});
  for(let i=0;i<45;i++)a.step(1/60);
  const follow=sent.filter(m=>m.t==='atk'&&m.skillId==='meteorBreaker').slice(1);
  assert.ok(follow.length>=2,'confirmed impact must trigger its authored follow-up');
  assert.equal(follow[0].stun,1.1,'first follow-up stun is half of 2.2 seconds');
  assert.ok(follow.every(m=>m.stun<=1.55),'all follow-up stuns must remain halved');
 }finally{a.dispose();}
});

test('Hongryeon second and third forms use bounded flame geometry without altering other styles',()=>{
 const arena=createArena({style:'break',level:100});
 try{
  arena.api.init(arena.snapshot,arena.snapshot,true,()=>{});
  const build=arena.c.EchoesBuildHongryeonFx;
  assert.equal(typeof build,'function');
  const second=build({id:'earthRend',phase:'signature',x:1328,y:1000,a:0,originX:1000,originY:1000,side:1});
  const thirdStart=build({id:'quakeRush',phase:'startup',x:1000,y:1000,a:0});
  const thirdFinish=build({id:'quakeRush',phase:'signature',index:1,final:true,x:1225,y:1000,a:0});
  const plumes=fx=>fx.filter(e=>e.type==='flameBreathPlume');
  assert.equal(second.filter(e=>e.type==='crimsonBladeFire').length,1,
   'the second-form finish keeps one visible circular flame blade, without a redundant overlapping ring');
  assert.ok(plumes(second).length<=10,'the second-form impact should have at most six ring and four corridor plumes');
  assert.ok(plumes(second).every(e=>e.density<=.58),'the second-form plume layers should be reduced in both world and PvP');
  assert.ok(plumes(thirdStart).length<=6,'the third-form startup ring should use at most six plumes');
  assert.ok(plumes(thirdFinish).length<=6,'the third-form landing ring should use at most six plumes');
  const hotTrail=build({id:'earthRend',phase:'trail',x:1000,y:1000,x2:1045,y2:1000,a:0,power:1.18});
  const leapTrail=build({id:'quakeRush',phase:'trail',x:1000,y:1000,x2:1045,y2:1000,a:0,power:1.05});
  assert.equal(hotTrail.find(e=>e.type==='crimsonDashEdgeFire')?.density,.62);
  assert.equal(plumes(hotTrail)[0]?.density,.62);
  assert.equal(leapTrail.find(e=>e.type==='crimsonDashEdgeFire')?.density,.5);
  assert.equal(plumes(leapTrail)[0]?.density,.5);
  assert.ok(plumes(thirdStart).every(e=>e.density<=.45));
  assert.ok(plumes(thirdFinish).every(e=>e.density<=.45));
  const otherTrail=build({id:'guardBreak',phase:'trail',x:1000,y:1000,x2:1045,y2:1000,a:0});
  assert.equal(otherTrail.find(e=>e.type==='crimsonDashEdgeFire')?.density,1,
   'other Hongryeon effects retain their existing normal-quality density');
 }finally{arena.dispose();}
});

test('Hongryeon second and third form PvP dash trails send fewer packets with state replay backup',()=>{
 for(const slot of [1,2]){
  const arena=createArena({style:'break',level:100}),packets=[];
  try{
   arena.api.init(arena.snapshot,arena.snapshot,true,m=>packets.push(m));
   arena.api.enemy.x=arena.api.me.x+620;arena.api.enemy.y=arena.api.me.y;
   arena.api.enemy.netX=arena.api.enemy.x;arena.api.enemy.netY=arena.api.enemy.y;
   arena.api.control({keys:[],aim:0,skill:slot});arena.step(.35);
   arena.api.control({keys:[],aim:0,release:slot});
   for(let i=0;i<70;i++)arena.step(1/60);
   const skillId=skills[slot][0],
    direct=packets.filter(p=>p.t==='hongFx'&&p.f.id===skillId&&p.f.phase==='trail'),
    batches=packets.filter(p=>p.t==='fxBatch').flatMap(p=>p.effects||[]),
    replay=packets.filter(p=>p.t==='state').flatMap(p=>p.hongFxReplay||[]);
   assert.ok(direct.length>0,'skill '+(slot+1)+' must retain its visible dash trail');
   assert.ok(direct.length<=8,'skill '+(slot+1)+' should not flood the relay with per-frame fire');
   assert.ok(direct.every(p=>p.f.max===.36),'optimized trail particles should expire promptly');
   assert.equal(batches.filter(f=>f.id===skillId&&f.phase==='trail').length,0,
    'short dash trails use direct delivery without a redundant batch copy');
   assert.ok(replay.some(f=>f.id===skillId&&f.phase==='trail'),
    'a recent trail stays available in state snapshots for a dropped direct packet');
   assert.ok(batches.some(f=>f.id===skillId&&f.phase==='signature'),
    'important impact flames must retain their separate FX batch fallback');
  }finally{arena.dispose();}
 }
});

test('Hongryeon fifth-form PvP shield blocks and perfect parries end the cast without follow-up strikes',()=>{
 for(const result of ['blocked','parried']){
  const a=createArena({style:'break',level:100}),packets=[];
  try{
   a.api.init(a.snapshot,a.snapshot,true,m=>packets.push(m));
   a.api.enemy.x=a.api.me.x+350;a.api.enemy.y=a.api.me.y;
   a.api.enemy.netX=a.api.enemy.x;a.api.enemy.netY=a.api.enemy.y;
   a.api.control({keys:[],aim:0,skill:4});a.step(.35);
   a.api.control({keys:[],aim:0,release:4});
   for(let i=0;i<110&&!packets.some(p=>p.t==='atk'&&p.skillId==='meteorBreaker');i++)a.step(1/60);
   const opening=packets.find(p=>p.t==='atk'&&p.skillId==='meteorBreaker');
   assert.ok(opening,'the opening dash should reach the defender');
   assert.equal(opening.bypassShield,false,'the opening dash must be blockable');
   assert.equal(opening.parryable,true,'the opening dash must allow a perfect parry');
   a.api.receive({t:'attackResult',id:opening.id,result});
   assert.equal(a.api.me.skillEvent,null,result+' should immediately end the ultimate');
   assert.equal(a.api.me.attackCd,0,'a shielded cast should release movement and action lock');
   assert.equal(a.api.me.moveLock,0);
   for(let i=0;i<260;i++)a.step(1/60);
   assert.equal(packets.filter(p=>p.t==='atk'&&p.skillId==='meteorBreaker').length,1,
    result+' must not create a phantom follow-up cut');
  }finally{a.dispose();}
 }
});

test('Hongryeon fifth-form world opening waits for actual unshielded damage',()=>{
 const fn=html.slice(html.indexOf('function updateFlameBreathFinale('),html.indexOf('function updateSwordSkill(dt)'));
 assert.ok(fn.length>1000,'world finale should remain present');
 assert.match(fn,/bypassShield:false,skillId:sk\.id,shape:'circle'/,
  'opening damage must be processed by the world shield rather than bypassing it');
 assert.match(fn,/onResult:e\.networkPlayer\?result=>\{if\(activeSwordSkill===seq&&!\(result\.damage>0\)\)finish\(\);\}:null/,
  'shielded world hits should resolve without arming the follow-up');
});

test('Hongryeon fourth-form visual geometry stays bounded in shared world and PvP',()=>{
 const arena=createArena({style:'break',level:100});
 try{
  arena.api.init(arena.snapshot,arena.snapshot,true,()=>{});
  const build=arena.c.EchoesBuildHongryeonFx;
  const ring2=build({id:'earthRend',phase:'signature',x:1328,y:1000,a:0,originX:1000,originY:1000});
  const start3=build({id:'quakeRush',phase:'startup',x:1000,y:1000,a:0});
  const land3=build({id:'quakeRush',phase:'signature',index:1,final:true,x:1225,y:1000,a:0});
  const forms4=[0,1,2].map(index=>build({id:'ironJudgment',phase:'signature',index,final:index===2,x:1000+index*220,y:1000,a:0,side:1}));
  const blades=fx=>fx.filter(e=>e.type==='crimsonBladeFire');
  const edges=fx=>fx.filter(e=>e.type==='crimsonEdgeFlames');
  assert.equal(blades(ring2).length,1,'second form retains exactly one circular flame blade');
  assert.equal(blades(ring2)[0].density,.66);
  assert.equal(edges(ring2)[0].density,.63);
  assert.equal(blades(start3).length,1);
  assert.equal(blades(start3)[0].density,.66);
  assert.equal(blades(land3).length,2,'third-form finishing ring and separate sword slash both remain visible');
  assert.ok(blades(land3).every(e=>e.density<.75));
  assert.ok(land3.some(e=>e.type==='crimsonFlameBurst'&&e.density===.72));
  for(const [index,fx] of forms4.entries()){
   assert.equal(blades(fx).length,1,'fourth form sword cut '+index+' should still have its own flame blade');
   assert.equal(blades(fx)[0].density,.72);
   assert.equal(edges(fx)[0].density,.72);
   assert.ok(fx.some(e=>e.type==='flameBreathPlume'&&e.density===.68));
   if(index===2)assert.ok(fx.some(e=>e.type==='crimsonFlameBurst'&&e.density===.73));
  }
  const trail4=build({id:'ironJudgment',phase:'trail',x:1000,y:1000,x2:1110,y2:1040,a:0,power:1.21});
  assert.equal(trail4.find(e=>e.type==='crimsonDashEdgeFire')?.density,.68);
  assert.equal(trail4.find(e=>e.type==='flameBreathPlume')?.density,.68);
  const other=build({id:'guardBreak',phase:'signature',x:1000,y:1000,a:0,index:0});
  assert.equal(blades(other)[0].density,1,'the first form keeps its original full-strength painter');
 }finally{arena.dispose();}
});

test('Hongryeon fourth-form PvP flame trail avoids duplicate packets but preserves every cut and launch',()=>{
 const arena=createArena({style:'break',level:100}),packets=[];
 try{
  arena.api.init(arena.snapshot,arena.snapshot,true,m=>packets.push(m));
  arena.api.enemy.x=arena.api.me.x+220;arena.api.enemy.y=arena.api.me.y;
  arena.api.enemy.netX=arena.api.enemy.x;arena.api.enemy.netY=arena.api.enemy.y;
  arena.api.control({keys:[],aim:0,skill:3});arena.step(.35);
  arena.api.control({keys:[],aim:0,release:3});
  for(let i=0;i<90;i++)arena.step(1/60);
  const hits=packets.filter(p=>p.t==='atk'&&p.skillId==='ironJudgment');
  assert.equal(hits.length,3,'optimizing the trail must not remove any of the three actual sword hits');
  assert.equal(hits[2].force,155,'the third hit must retain its original final knockback');
  assert.ok(hits.every(p=>p.controlLease==='hongWheel'),'the existing victim-control contract is unchanged');
  const direct=packets.filter(p=>p.t==='hongFx'&&p.f.id==='ironJudgment'&&p.f.phase==='trail');
  assert.ok(direct.length>0&&direct.length<=10,'the smooth S-shaped dash should have a bounded visible flame trail');
  assert.ok(direct.every(p=>p.f.max===.38));
  const batches=packets.filter(p=>p.t==='fxBatch').flatMap(p=>p.effects||[]);
  assert.equal(batches.filter(p=>p.id==='ironJudgment'&&p.phase==='trail').length,0,
   'short dash wakes use the direct FX channel, not duplicate generic batches');
  assert.ok(batches.some(p=>p.id==='ironJudgment'&&p.phase==='signature'),
   'every important sword impact retains the regular visual fallback');
  assert.ok(packets.some(p=>p.t==='state'&&p.hongFxReplay?.some(e=>e.id==='ironJudgment'&&e.phase==='trail')),
   'state snapshots can still recover a lost trail packet');
 }finally{arena.dispose();}
});

test('Hongryeon fifth form uses a natural fire-circle startup and begins its half-speed dash only after 0.5 seconds',()=>{
 const arena=createArena({style:'break',level:100}),packets=[];
 try{
  arena.api.init(arena.snapshot,arena.snapshot,true,m=>packets.push(m));
  const build=arena.c.EchoesBuildHongryeonFx;
  const startup=build({id:'meteorBreaker',phase:'startup',x:1000,y:1000,a:0});
  const plumes=startup.filter(e=>e.type==='flameBreathPlume');
  assert.ok(plumes.length>=8,'startup circle should be made from multiple irregular fire tongues');
  assert.ok(plumes.every(e=>Math.hypot(e.x-1000,e.y-1000)>90&&Math.hypot(e.x-1000,e.y-1000)<145),
   'startup flames should sit around the caster instead of forming a central beam');
  assert.equal(startup.filter(e=>e.type==='ring').length,0,'the startup recipe should not use a solid ring primitive');

  arena.api.enemy.x=arena.api.me.x+700;arena.api.enemy.y=arena.api.me.y;
  arena.api.enemy.netX=arena.api.enemy.x;arena.api.enemy.netY=arena.api.enemy.y;
  const ox=arena.api.me.x;
  arena.api.control({keys:[],aim:0,skill:4});arena.step(.2);
  arena.api.control({keys:[],aim:0,release:4});
  const seq=arena.api.me.skillEvent;assert.equal(seq?.skill?.id,'meteorBreaker');
  for(let i=0;i<25;i++)arena.step(1/60);
  assert.ok(Math.abs(arena.api.me.x-ox)<2,'the caster must remain in the ignition circle for the first 0.5 seconds');
  for(let i=0;i<12;i++)arena.step(1/60);
  assert.ok(arena.api.me.x>ox+20,'the dash starts after the startup delay');
  const trail=packets.filter(p=>p.t==='hongFx'&&p.f.id==='meteorBreaker'&&p.f.phase==='trail');
  assert.ok(trail.length>0,'the slower dash keeps a visible flame trail');
 }finally{arena.dispose();}
 const world=html.slice(html.indexOf('function updateFlameBreathFinale('),html.indexOf('function updateSwordSkill(dt)'));
 const pvp=html.slice(html.indexOf('function pvpHongryeonFinale('),html.indexOf('function pvpWorldSwordMotion('));
 assert.match(world,/startup=\.50,dashElapsed=seq\.elapsed-startup/);
 assert.match(world,/dashSpeed=1175/);
 assert.match(pvp,/startup=\.50,dashElapsed=ev\.elapsed-startup/);
 assert.match(pvp,/dashSpeed=1175/);
});
