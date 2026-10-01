import test from 'node:test';
import assert from 'node:assert/strict';
import {createArena} from '../multiplayer-server/ai/arena-runtime.js';
import {createBrain,seedPolicy,rng} from '../multiplayer-server/ai/brain.js';

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

test('Moon AI presses/releases actual skill 1 and does not immediately flip back after success',()=>{
 const arena=createArena({style:'moon',level:100});
 try{
  arena.api.init(structuredClone(arena.snapshot),structuredClone(arena.snapshot),true,()=>{});
  const me=arena.api.me,enemy=arena.api.enemy,brain=createBrain('moon',seedPolicy(),rng(77),3);
  me.cool[1]=8;me.cool[2]=9;me.cool[3]=10;me.cool[0]=0;
  const now=0;
  me.moonFormCooldownEnds.solar[1]=12000;me.moonFormCooldownEnds.solar[2]=13000;me.moonFormCooldownEnds.solar[3]=14000;

  const press=brain.step(1/60,me,enemy);
  assert.equal(press.skill,0);
  assert.equal(press.formShift,undefined);
  assert.notEqual(press.basic,true);
  arena.api.control(press);arena.step(1/60);

  const release=brain.step(1/60,me,enemy);
  assert.equal(release.release,0);
  arena.api.control(release);
  stepN(arena,30);
  assert.equal(me.moonForm,'solar');

  const next=brain.step(1/60,me,enemy);
  assert.notEqual(next.skill,0,'successful form shift must be latched while opposite 2-4 are still cooling');
 }finally{arena.dispose();}
});
