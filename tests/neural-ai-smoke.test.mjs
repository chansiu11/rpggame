import test from 'node:test';
import assert from 'node:assert/strict';
import {seedPolicy,createBrain,learn,stylePairs,NN_BEHAVIORS,networkParameterCount} from '../multiplayer-server/ai/brain.js';
import {validatePolicy} from '../multiplayer-server/ai/store.js';
import {createDuelSession} from '../multiplayer-server/ai/self-play.js';

test('neural policy shape and learning contract are valid',()=>{
 const p=seedPolicy();
 assert.equal(stylePairs().length,10);
 assert.equal(Object.keys(p.styles).length,5);
 assert.equal(Object.keys(p.matchups).length,10);
 assert.equal(p.schema,3);
 assert.equal(p.model,'mlp-es-skill-aware-v2');
 assert.equal(networkParameterCount(),934);
 assert.equal(NN_BEHAVIORS.length,10);
 assert.deepEqual(p.learning.behaviors.slice(0,NN_BEHAVIORS.length),NN_BEHAVIORS);
 assert.deepEqual(p.learning.behaviors.slice(-3),['skillRangeUnderstanding','skillThreatUnderstanding','skillTimingUnderstanding']);
 assert.equal(p.learning.fixedDodge,'skill-aware');
 assert.equal(p.learning.resourceManagement,false);
 assert.doesNotThrow(()=>validatePolicy(structuredClone(p)));
 for(const s of Object.values(p.styles)){
  const n=s.network;
  assert.equal(n.w1.length,480);
  assert.equal(n.b1.length,16);
  assert.equal(n.w2.length,192);
  assert.equal(n.b2.length,12);
  assert.equal(n.w3.length,216);
  assert.equal(n.b3.length,18);
 }
});

test('reactive dodge reads the active enemy skill profile',()=>{
 const p=seedPolicy(),brain=createBrain('gale',p,()=>.5,3,{training:true});
 const me={x:1000,y:1000,hp:100,maxHp:100,shield:100,maxShield:100,stam:100,maxStam:100,stun:0,dash:0,cool:[0,0,0,0,0],skillEvent:null,skillHold:null,attackAnim:0,skillPose:-1,combo:0};
 const enemy={x:1120,y:1000,hp:100,maxHp:100,shield:100,maxShield:100,stun:0,dash:0,attackAnim:.25,skillPose:0,block:false,combo:0};
 const enemySkill={id:'bladeRain',name:'사건선 절단',cost:61,cool:10.2,cfg:{duration:1.05,hits:[.18,.52,.88],mult:[.38,.62,2.05],arc:[.72,.72,.82],reach:[220,230,265],mode:'eventHorizonShear'}};
 const action=brain.step(1/60,me,enemy,{selfSkills:Array(5).fill(null),enemySkills:[enemySkill,null,null,null,null]});
 assert.equal(action.dash,true);
 assert.ok(action.keys.length>0);
});

test('self-play exploration produces trainable neural result',()=>{
 const p=seedPolicy(),session=createDuelSession('gale','break',p,p,77,2,()=>{},null,{explore:true});
 let result;try{while(!session.done)result=session.step();}finally{session.dispose();}
 assert.ok(result);
 assert.equal(result.results.length,2);
 for(const r of result.results){
  assert.ok(Number.isFinite(r.reward));
  assert.ok(Number.isInteger(r.training.noiseSeed));
  assert.ok(Number.isFinite(r.training.sigma));
 }
});

test('fresh neural policies produce combat exploration for every style',()=>{
 const p=seedPolicy(),pairs=[['gale','void'],['moon','break'],['dawn','break'],['gale','dawn'],['void','break']];
 for(let n=0;n<pairs.length;n++){
  const [a,b]=pairs[n],session=createDuelSession(a,b,p,p,200+n,4,()=>{},null,{explore:true});
  let result;try{while(!session.done)result=session.step();}finally{session.dispose();}
  assert.ok(result.results.some(r=>r.metrics.attempts>0),a+' vs '+b+' must explore at least one attack from a fresh policy');
 }
});

test('fresh neural policy acts without training-only exploration',()=>{
 const p=seedPolicy(),session=createDuelSession('gale','break',p,p,901,6,()=>{},null,{explore:false});
 let result;try{while(!session.done)result=session.step();}finally{session.dispose();}
 assert.ok(result.results.some(r=>r.metrics.attempts>0),'fresh live/evaluation policy must attempt combat without exploration');
 assert.ok(result.results.some(r=>r.metrics.damage>0),'fresh live/evaluation policy must be capable of dealing damage');
});

test('every fresh style can choose an attack without training exploration',()=>{
 for(const style of ['gale','moon','void','dawn','break']){
  const p=seedPolicy(),brain=createBrain(style,p,()=>.5,3,{training:true});
  const me={x:1000,y:1000,hp:100,maxHp:100,shield:100,maxShield:100,stam:100,maxStam:100,stun:0,dash:0,cool:[0,0,0,0,0],skillEvent:null,skillHold:null,attackAnim:0,skillPose:-1,combo:0,void3DodgeRemaining:0};
  const enemy={x:1160,y:1000,hp:100,maxHp:100,shield:100,maxShield:100,stun:0,dash:0,attackAnim:0,skillPose:-1,block:false,combo:0};
  let attacked=false;
  for(let i=0;i<600&&!attacked;i++){
   const a=brain.step(1/60,me,enemy);
   attacked=!!a.basic||Number.isInteger(a.skill);
  }
  assert.equal(attacked,true,style+' fresh neural policy must be able to initiate combat');
 }
});

test('learning updates the network and never learns resource management',()=>{
 const p=seedPolicy(),before=p.styles.break.network.w1.slice();
 learn(p,'break',{noiseSeed:123456,sigma:p.styles.break.sigma},{win:true,reward:1.2,metrics:{hits:3}});
 assert.notDeepEqual(p.styles.break.network.w1,before);
 assert.equal(p.learning.resourceManagement,false);
 assert.ok(validatePolicy(p));
});
