import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const html=readFileSync(resolve(dirname(fileURLToPath(import.meta.url)),'../index.html'),'utf8');
function section(start,end){const a=html.indexOf(start),b=html.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,'missing '+start);return html.slice(a,b);}
const worldHelper=section('function hitEnemyConfirmed(','function hiddenDamageRadius(');
test('World hidden and sword on-hit callbacks reject blocked and pending hits',()=>{
 const actor={},victim={id:'victim',dead:false};let callbacks=0,serverCallback;
 const mk=hitEnemy=>new Function('hitEnemy','player',worldHelper+'return hitEnemyConfirmed;')(hitEnemy,actor);
 mk(()=>false)(victim,50,false,actor,()=>callbacks++);
 assert.equal(callbacks,0,'shield or evasion cannot trigger follow-up');
 mk(()=>null)(victim,50,false,actor,()=>callbacks++);
 assert.equal(callbacks,0,'pending network hit cannot trigger follow-up');
 mk((e,d,heavy,source,override)=>{serverCallback=override.onHit;return null;})(victim,50,false,actor,()=>callbacks++);
 assert.equal(callbacks,0);
 serverCallback();assert.equal(callbacks,1,'authoritatively confirmed hit fires once');
 mk(()=>true)(victim,50,false,actor,()=>callbacks++);
 assert.equal(callbacks,2,'immediate local damage triggers the same follow-up');
});
const hurtCode=section('function hurt(raw,opts={})','function pointSegmentDistance');
const receiveCode=section('function receiveAttack(m){','function sendAttack(data,onHit=null){');
const sendCode=section('function sendAttack(data,onHit=null){','function forceEnemyTo(');
const ackLine=html.split('\n').find(s=>s.includes("else if(m.t==='attackResult')"));
assert.ok(ackLine,'PvP needs the defender-owned attack acknowledgment');
const ackCode=ackLine.trim().replace(/^else if/,'if');
const arenaBoot=new Function('ctx',`
 const {me,enemy,packets,net}=ctx;
 let roundLocked=false,running=true,attackSerial=0,pvpShake=0,void3Pvp=null;
 const ARENA_W=2000,ARENA_H=2000,pvpVortices=[],pvpHitProcs=new Map();
 const window={EchoesCombat:{
  contains:ctx.contains,
  shieldCost:raw=>Math.max(12,raw*1.4),
  damageAfterArmor:raw=>Math.max(1,Math.round(raw)),
  forceDuration:()=>.4
 }};
 const performance={now:()=>1000},clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 const damageTaken=raw=>window.EchoesCombat.damageAfterArmor(raw);
 const ring=()=>{},burst=()=>{},pvpDamagePop=()=>{},pvpImpactShake=()=>{},roundEnd=()=>{},nova=()=>{};
 ${hurtCode}
 ${receiveCode}
 ${sendCode}
 function acknowledge(m){${ackCode}}
 return {sendAttack,receiveAttack,acknowledge,me,packets};
`);
function arenaCase({shield=500,block=true,breakShield=false,parry=false,contact=true}={}){
 const me={x:100,y:100,r:18,hp:1000,shield,maxShield:500,stam:100,maxStam:200,
 block,parryWindow:parry?.2:0,weapon:0,rune:'none',stun:0,inv:0,hitInv:0,
 damageReduction:0,shieldDelay:0,shieldNeedsRelease:false};
 const enemy={x:120,y:100,r:18,hp:1000},packets=[];
 const app=arenaBoot({me,enemy,packets,net:m=>packets.push(m),contains:()=>contact});
 let procs=0;
 const id=app.sendAttack({shape:'circle',x:100,y:100,r:50,d:100,breakShield},()=>procs++);
 assert.equal(procs,0,'sending a skill never executes its follow-up optimistically');
 app.receiveAttack({t:'atk',id,shape:'circle',x:100,y:100,r:50,d:100,breakShield,
  stun:.5,force:120,controlLease:'hidden4',stigmaMarkMs:3000});
 const response=packets.find(m=>m.t==='attackResult');assert.ok(response,'defender must answer');
 assert.equal(procs,0,'damage result must arrive before a follow-up');
 app.acknowledge(response);app.acknowledge(response);
 return {result:response.result,procs,hp:me.hp,shield:me.shield,
  mark:!!me.stigmaMarkUntil,lease:!!me.controlLease,force:!!me.forcedMove};
}
test('Arena full shield block suppresses every on-hit proc, stun, mark and launch',()=>{
 const f=arenaCase();assert.equal(f.result,'blocked');assert.equal(f.procs,0);
 assert.equal(f.hp,1000);assert.equal(f.mark,false);assert.equal(f.lease,false);assert.equal(f.force,false);
});
test('Arena shield depleted exactly also prevents any HP damage or proc',()=>{
 const f=arenaCase({shield:140});assert.equal(f.result,'blocked');assert.equal(f.shield,0);
 assert.equal(f.hp,1000);assert.equal(f.procs,0);assert.equal(f.mark,false);assert.equal(f.lease,false);
});
test('Arena parry suppresses the follow-up and leaves HP untouched',()=>{
 const f=arenaCase({parry:true});assert.equal(f.result,'parried');assert.equal(f.hp,1000);
 assert.equal(f.procs,0);assert.equal(f.mark,false);assert.equal(f.lease,false);
});
test('Arena shield-breaking damaging hit triggers follow-up exactly once',()=>{
 const f=arenaCase({breakShield:true});assert.equal(f.result,'hit');
 assert.equal(f.shield,0);assert.equal(f.hp,900);assert.equal(f.procs,1);assert.equal(f.mark,true);
 assert.equal(f.lease,true);assert.equal(f.force,true);
});
test('Arena ordinary unguarded hit triggers one confirmed follow-up',()=>{
 const f=arenaCase({block:false});assert.equal(f.result,'hit');assert.equal(f.procs,1);assert.equal(f.hp,900);
});
test('Arena missed skill does not trigger its follow-up',()=>{
 const f=arenaCase({block:false,contact:false});assert.equal(f.result,'miss');assert.equal(f.procs,0);assert.equal(f.hp,1000);
});

test('A late confirmed sword hit still releases its finisher once, but an interrupted skill does not',()=>{
 const snippet=section('const carryOnHit=()=>{','const heavyArc=');
 const factory=new Function('env',`
 const {ev,me,enemy,mode,forces}=env,performance={now:()=>env.now};
 let roundLocked=false,running=true;
 const forceEnemyTo=(...args)=>forces.push(args);
 ${snippet}
 return carryOnHit;
 `);
 const ev={a:0,endedAt:500,carryFinalized:false},forces=[];
 const env={ev,me:{skillEvent:null},enemy:{x:400,y:500},mode:'chaseCombo',now:1000,forces};
 const callback=factory(env);callback();callback();
 assert.equal(forces.length,1,'late confirmed finisher must be deduplicated');
 assert.equal(forces[0][0],462,'late confirmed hit preserves the sword launch');
 const interrupted={a:0},other=[];
 factory({...env,ev:interrupted,forces:other})();assert.equal(other.length,0);
 const expired={a:0,endedAt:100},stale=[];
 factory({...env,ev:expired,now:2200,forces:stale})();assert.equal(stale.length,0);
});
