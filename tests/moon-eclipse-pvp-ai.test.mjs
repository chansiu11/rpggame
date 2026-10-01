import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createArena} from '../multiplayer-server/ai/arena-runtime.js';
import {createBrain,seedPolicy,rng} from '../multiplayer-server/ai/brain.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const html=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');

const idle=()=>({keys:[],aim:0,block:false,dash:false,basic:false});
const stepN=(arena,n)=>{for(let i=0;i<n;i++)arena.step(1/60);};
function tap(arena,slot){
 arena.api.control({...idle(),skill:slot});
 arena.step(1/60);
 arena.api.control({...idle(),release:slot});
 stepN(arena,18);
}
function waitForEventMode(arena,slot,max=90){
 arena.api.control({...idle(),skill:slot});
 arena.step(1/60);
 arena.api.control({...idle(),release:slot});
 for(let i=0;i<max;i++){arena.step(1/60);const mode=arena.api.me.skillEvent?.cfg?.mode;if(mode)return mode;}
 return '';
}
function finishAction(arena,max=240){for(let i=0;i<max&&(arena.api.me.skillHold||arena.api.me.skillEvent||arena.api.me.attackCd>0);i++)arena.step(1/60);}

test('Moon PVP uses real form shift input and swaps 2-4 to Solar skills',()=>{
 const arena=createArena({style:'moon',level:100});
 try{
  const own=structuredClone(arena.snapshot),other=structuredClone(arena.snapshot);
  arena.api.init(own,other,true,()=>{});
  arena.api.enemy.x=arena.api.me.x+150;arena.api.enemy.y=arena.api.me.y;
  assert.equal(arena.api.me.moonForm,'lunar');

  const lunarModes=['lunarMistStep','lunarSpiralBind','lunarWildAngles'];
  for(let slot=1;slot<=3;slot++){
   const mode=waitForEventMode(arena,slot);
   assert.equal(mode,lunarModes[slot-1]);
   finishAction(arena);
  }
  assert.ok(arena.api.me.cool.slice(1,4).every(v=>v>0),'lunar 2-4 should all be cooling');

  // Real slot-1 press/release path; no direct moonForm mutation.
  tap(arena,0);stepN(arena,20);
  assert.equal(arena.api.me.moonForm,'solar');
  assert.ok(arena.api.me.cool.slice(1,4).every(v=>v<=.001),'fresh Solar bank should make 2-4 ready');

  const solarModes=['solarFlashLine','solarFlowChain','solarFallingCleave'];
  for(let slot=1;slot<=3;slot++){
   const mode=waitForEventMode(arena,slot);
   assert.equal(mode,solarModes[slot-1]);
   finishAction(arena);
  }
  assert.ok(arena.api.me.cool.slice(1,4).every(v=>v>0),'solar 2-4 should all be cooling after use');
 }finally{arena.dispose();}
});

function setMoonOutputBias(policy,index,value){
 const n=policy.styles.moon.network;n.w1.fill(0);n.b1.fill(0);n.w2.fill(0);n.b2.fill(0);n.w3.fill(0);n.b3.fill(-2);n.b3[index]=value;return policy;
}

test('Moon AI does not force form shift when 2-4 are cooling',()=>{
 const arena=createArena({style:'moon',level:100});
 try{
  arena.api.init(structuredClone(arena.snapshot),structuredClone(arena.snapshot),true,()=>{});
  const me=arena.api.me,enemy=arena.api.enemy,p=setMoonOutputBias(seedPolicy(),3,2);
  const brain=createBrain('moon',p,()=>.5,3,{training:true});
  enemy.x=me.x+150;enemy.y=me.y;me.cool[1]=8;me.cool[2]=9;me.cool[3]=10;me.cool[0]=0;
  const action=brain.step(1/60,me,enemy);
  assert.equal(action.basic,true);
  assert.notEqual(action.skill,0);
  assert.equal(action.formShift,undefined);
 }finally{arena.dispose();}
});

test('Moon AI can choose real skill 1 itself and tap to change form',()=>{
 const arena=createArena({style:'moon',level:100});
 try{
  arena.api.init(structuredClone(arena.snapshot),structuredClone(arena.snapshot),true,()=>{});
  const me=arena.api.me,enemy=arena.api.enemy,p=setMoonOutputBias(seedPolicy(),4,2);
  const brain=createBrain('moon',p,()=>.5,3,{training:true});
  enemy.x=me.x+170;enemy.y=me.y;
  const press=brain.step(1/60,me,enemy);
  assert.equal(press.skill,0);
  assert.equal(press.formShift,undefined);
  arena.api.control(press);arena.step(1/60);
  const release=brain.step(1/60,me,enemy);
  assert.equal(release.release,0);
  arena.api.control(release);stepN(arena,30);
  assert.equal(me.moonForm,'solar');
 }finally{arena.dispose();}
});

test('Moon neural input distinguishes Lunar and Solar for different learned skill choices',()=>{
 const p=seedPolicy(),n=p.styles.moon.network;
 n.w1.fill(0);n.b1.fill(0);n.w2.fill(0);n.b2.fill(0);n.w3.fill(0);n.b3.fill(-2);
 n.w1[29*16]=2;n.w2[0]=2;
 n.w3[0*18+5]=-3;
 n.w3[0*18+6]=3;
 const me={x:1000,y:1000,hp:100,maxHp:100,shield:100,maxShield:100,stam:100,maxStam:100,stun:0,dash:0,cool:[0,0,0,0,0],skillEvent:null,skillHold:null,attackAnim:0,skillPose:-1,combo:0,moonAltReady:1};
 const enemy={x:1160,y:1000,hp:100,maxHp:100,shield:100,maxShield:100,stun:0,dash:0,attackAnim:0,skillPose:-1,block:false,combo:0};
 const lunar=createBrain('moon',p,()=>.5,3,{training:true}).step(1/60,{...me,moonForm:'lunar'},enemy);
 const solar=createBrain('moon',p,()=>.5,3,{training:true}).step(1/60,{...me,moonForm:'solar'},enemy);
 assert.equal(lunar.skill,1);
 assert.equal(solar.skill,2);
});


test('Moon Eclipse custom FX survive the remote PVP path for players and bots',()=>{
 const a=createArena({style:'moon',level:100}),b=createArena({style:'moon',level:100});
 try{
  const packets=[];
  a.api.init(structuredClone(a.snapshot),structuredClone(b.snapshot),true,m=>packets.push(structuredClone(m)));
  b.api.init(structuredClone(b.snapshot),structuredClone(a.snapshot),false,()=>{});
  a.api.enemy.x=a.api.me.x+150;a.api.enemy.y=a.api.me.y;
  b.api.enemy.x=b.api.me.x+150;b.api.enemy.y=b.api.me.y;

  a.api.effects.length=0;b.api.effects.length=0;
  assert.equal(waitForEventMode(a,1),'lunarMistStep');
  stepN(a,20);
  const lunarBatches=packets.splice(0).filter(m=>m.t==='fxBatch');
  const lunarFx=lunarBatches.flatMap(m=>m.effects||[]);
  assert.ok(lunarFx.some(f=>f.kind==='eclipseLunarInk'),'lunar ink must be transmitted');
  const styledLunar=lunarFx.find(f=>f.kind==='slash'&&f.innerColor);
  assert.ok(styledLunar,'styled lunar slash must be transmitted');
  for(const m of lunarBatches)b.api.receive(m);
  assert.ok(b.api.effects.some(f=>f.kind==='eclipseLunarInk'),'remote side must keep lunar ink');
  const remoteStyled=b.api.effects.find(f=>f.kind==='slash'&&f.innerColor);
  assert.equal(remoteStyled?.innerColor,styledLunar.innerColor);
  assert.equal(remoteStyled?.innerAlpha,styledLunar.innerAlpha);

  finishAction(a);packets.length=0;a.api.effects.length=0;b.api.effects.length=0;
  tap(a,0);stepN(a,20);finishAction(a);
  assert.equal(a.api.me.moonForm,'solar');
  packets.length=0;a.api.effects.length=0;b.api.effects.length=0;

  assert.equal(waitForEventMode(a,1),'solarFlashLine');
  stepN(a,20);
  const solarBatches=packets.splice(0).filter(m=>m.t==='fxBatch');
  const solarFx=solarBatches.flatMap(m=>m.effects||[]);
  assert.ok(solarFx.some(f=>f.kind==='eclipseSolarShard'),'solar shard must be transmitted');
  for(const m of solarBatches)b.api.receive(m);
  assert.ok(b.api.effects.some(f=>f.kind==='eclipseSolarShard'),'remote side must keep solar shard');
 }finally{a.dispose();b.dispose();}
});


test('Eclipse combo movement pulls targets instead of chasing',()=>{
 assert.match(html,/function eclipseComboPullVector\(/);
 assert.match(html,/function pvpEclipseComboPoint\(/);
 assert.match(html,/forceEnemyTo\(pullPoint\.x,pullPoint\.y,\.14/);
 const worldMotion=html.slice(html.indexOf('function eclipseSkillMotion('),html.indexOf('\nfunction ',html.indexOf('function eclipseSkillMotion(')+10));
 const pvpMotion=html.slice(html.indexOf('function pvpEclipseMotion('),html.indexOf('\nfunction ',html.indexOf('function pvpEclipseMotion(')+10));
 assert.doesNotMatch(worldMotion,/swordSeqTarget|\btc\b|moveTo\(/);
 assert.doesNotMatch(pvpMotion,/pvpWorldSwordTarget|\btc\b|moveTo\(|lockedDashFace/);
 const pvpHit=html.slice(html.indexOf('function pvpEclipseHit('),html.indexOf('function pvpWorldSwordHit('));
 assert.doesNotMatch(pvpHit,/net\(\{t:'teleport'/);
});
