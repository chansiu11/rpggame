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
  for(let i=0;i<65;i++)a.step(1/60);
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
  for(let i=0;i<32&&!hits.some(m=>m.t==='atk'&&m.skillId==='meteorBreaker');i++)b.step(1/60);
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
  for(let i=0;i<32&&!packets.some(m=>m.t==='atk'&&m.skillId==='meteorBreaker');i++)arena.step(1/60);
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
