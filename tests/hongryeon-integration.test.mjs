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

test('Hongryeon self-play uses live PVP mechanics and returns finite learning rewards',()=>{
 const p=seedPolicy(),result=duel('break','gale',p,p,411,3);
 assert.ok(result.results.every(x=>Number.isFinite(x.reward)));
 assert.ok(result.results.some(x=>x.metrics.attempts>0));
});
