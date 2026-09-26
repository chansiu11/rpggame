import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import '../multiplayer-server/combat-core.js';
import {forceMob,advanceMobControl} from '../multiplayer-server/mob-control.js';
const C=globalThis.EchoesCombat,html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function source(name){const a=html.indexOf('function '+name+'('),b=html.indexOf('\nfunction ',a+1);return html.slice(a,b);}
test('confirmed targets are unique, stale casts cannot mark a later skill, and nearest is recomputed',()=>{
 const seq={prismCast:'new'},targets=[{id:'a',x:100,y:0,hp:100},{id:'b',x:400,y:0,hp:100},{id:'dead',x:20,y:0,hp:0,dead:true}];
 assert.equal(C.markPrismTarget(seq,'old','a'),false);for(const e of targets){C.markPrismTarget(seq,'new',e.id);C.markPrismTarget(seq,'new',e.id);}assert.equal(seq.prismTargets.size,3);assert.equal(C.nextPrismTarget(seq,targets,{x:0,y:0}).id,'a');assert.equal(C.nextPrismTarget(seq,targets,{x:450,y:0}).id,'b');seq.prismDone.add('b');assert.equal(C.nextPrismTarget(seq,targets,{x:450,y:0}).id,'a');
});
function world(blocked=false){const seq={prismCast:'cast',slot:4,chaseElapsed:0},targets=[{id:'far',x:700,y:0,hp:1000,r:18},{id:'near',x:240,y:0,hp:1000,r:18,networkPlayer:true}],hits=[],player={x:0,y:0,hp:100,stun:0,moveLock:0};for(const e of targets)C.markPrismTarget(seq,'cast',e.id);
 const c={window:{EchoesCombat:C},activeSwordSkill:seq,player,Math,Set,combatTargets:()=>targets,combatCenter:e=>e,combatRadius:e=>e.r,combatDistance:(e,p)=>Math.hypot(e.x-p.x,e.y-p.y),sendSharedSkillFxFrame:()=>{},moveBody:(p,dx,dy)=>{if(!blocked){p.x+=dx;p.y+=dy}},effects:[],syncSkillMoveIfNeeded:()=>{},solidAt:()=>blocked,damageValue:m=>100*m,hitEnemy:(e,d)=>hits.push([e.id,d]),ring:()=>{},cancelSwordSkill:()=>{c.activeSwordSkill=null}};vm.createContext(c);vm.runInContext(source('prismPathClear')+'\n'+source('finishPrismWorldChase')+'\n'+source('updatePrismWorldChase'),c);return {c,seq,hits,player};}
test('world chase reaches marked player then monster, strikes once each and leaves final position',()=>{const f=world();for(let i=0;i<180&&f.c.activeSwordSkill;i++)f.c.updatePrismWorldChase(f.seq,1/60);assert.deepEqual(f.hits,[['near',450],['far',450]]);assert.ok(f.player.x>550);assert.equal(f.c.activeSwordSkill,null);});
test('blocked chase does not damage through terrain or stay stuck indefinitely',()=>{const f=world(true);for(let i=0;i<650&&f.c.activeSwordSkill;i++)f.c.updatePrismWorldChase(f.seq,1/60);assert.equal(f.hits.length,0);assert.equal(f.player.x,0);assert.equal(f.c.activeSwordSkill,null);});
test('interruption clears the follow-up before damage',()=>{const f=world();f.player.stun=1;f.c.updatePrismWorldChase(f.seq,.02);assert.equal(f.hits.length,0);assert.equal(f.c.activeSwordSkill,null);});
test('arena follow-up shares damage and force and only hits confirmed opponent once',()=>{const ev={prismCast:'c',chaseElapsed:0},me={x:0,y:0,skillEvent:ev},enemy={x:450,y:0,hp:1000,r:18},hits=[];C.markPrismTarget(ev,'c','enemy');const c={window:{EchoesCombat:C},me,enemy,Math,Set,ARENA_W:3600,ARENA_H:2100,clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),beamFx:()=>{},net:()=>{},circleAttack:(...a)=>hits.push(a),pvpSkillAttack:()=>100,riftCutFx:()=>{}};vm.createContext(c);vm.runInContext(source('finishPrismPvpChase')+'\n'+source('updatePrismPvpChase'),c);for(let i=0;i<150&&me.skillEvent;i++)c.updatePrismPvpChase(ev,1/60);assert.equal(hits.length,1);assert.equal(hits[0][3],450);assert.equal(hits[0][5].force,180);assert.equal(me.skillEvent,null);assert.ok(ev.chaseElapsed<1);assert.equal(me.attackCd,0);assert.equal(me.moveLock,0);assert.equal(me.postSkillLock,0);});
test('successive mob damage force uses same actual-position start and cubic timing as players',()=>{
 const m={x:0,y:0},move=(m,dx,dy)=>{m.x+=dx;m.y+=dy};forceMob(m,180,0,0,undefined,move,true);assert.equal(m.forceMove.max,C.forceDuration(180));const expected=C.forcePoint(m.forceMove,.11);forceMob(m,180,0,110,undefined,move,true);assert.ok(Math.abs(m.forceMove.startX-expected.x)<1e-8);assert.ok(Math.abs(m.forceMove.x-expected.x-180)<1e-8);advanceMobControl(m,1000,move);assert.ok(Math.abs(m.x-expected.x-180)<1e-8);assert.equal(m.forceMove,null);
});
test('blocked pursuit limits trail generation and movement packets instead of repeating full cast FX',()=>{const f=world(true);let packets=0,signatures=0;f.c.syncSkillMoveIfNeeded=()=>packets++;f.c.sendSharedSkillFxFrame=()=>signatures++;for(let i=0;i<30;i++)f.c.updatePrismWorldChase(f.seq,1/60);assert.ok(f.c.effects.length<=11);assert.ok(packets<=11);assert.equal(signatures,0);});

test('final world strike unlocks actions in the same frame, preserves cooldowns and keeps intermediate chain active',()=>{const f=world();f.player.skillCds=[0,3,0,0,8];f.player.postSkillLockTimer=2;for(let i=0;i<120&&f.hits.length<2;i++){f.c.updatePrismWorldChase(f.seq,1/60);if(f.hits.length===1)assert.equal(f.c.activeSwordSkill,f.seq);}assert.equal(f.hits.length,2);assert.ok(f.seq.chaseElapsed<1);assert.equal(f.c.activeSwordSkill,null);for(const k of ['cast','attackCd','moveLock','postSkillLockTimer'])assert.equal(f.player[k],0);assert.deepEqual(f.player.skillCds,[0,3,0,0,8]);});
test('Dawn saved default slots migrate once and custom layouts survive',()=>{const c={};vm.createContext(c);vm.runInContext(source('migrateDawnSlots'),c);const old=['dawnArc','tempest','skyFall','solarReturn','prismLance'];assert.deepEqual(c.migrateDawnSlots([...old],'dawn',0),old);assert.deepEqual(c.migrateDawnSlots(['dawnArc','tempest','solarReturn','skyFall','prismLance'],'dawn',1),old);assert.deepEqual(c.migrateDawnSlots([...old],'dawn',2),old);assert.deepEqual(c.migrateDawnSlots([...old],'dawn',1),old);assert.deepEqual(c.migrateDawnSlots([...old],'gale',0),old);});
test('solar dash travels the same distance at different frame rates in world and arena and respects world walls',()=>{
 const skillLine=html.split('\n').find(l=>l.includes("{id:'solarReturn',name:"));const sk=vm.runInNewContext('('+skillLine.trim().replace(/,$/,'')+')');
 for(const dt of [1/30,1/60,.1])for(const blocked of [false,true]){
  const player={x:500,y:500},me={x:500,y:500},seq={elapsed:0,duration:sk.cfg.duration,facing:0,fx:0},ev={elapsed:0,cfg:sk.cfg,skill:sk,a:0,fx:0};
  const c={player,me,Math,clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),swordSeqTarget:()=>null,pvpWorldSwordTarget:()=>null,moveBody:(p,x,y)=>{if(!blocked){p.x+=x;p.y+=y}},moveSwordCarryTargets:()=>{},syncSkillMoveIfNeeded:()=>{},effects:[],beamFx:()=>{},net:()=>{},ARENA_W:3600,ARENA_H:2100};vm.createContext(c);vm.runInContext(source('updateSwordSkillMotion')+'\n'+source('pvpWorldSwordMotion'),c);
  for(let t=0;t<.7;t+=dt){seq.elapsed+=dt;ev.elapsed+=dt;c.updateSwordSkillMotion(seq,sk,dt);c.pvpWorldSwordMotion(ev,dt);}
  assert.ok(Math.abs(player.x-(blocked?500:860))<1e-8);assert.ok(Math.abs(me.x-860)<1e-8);
 }
});
test('basic attack immediately after final Dawn chase does not throw and preserves basic knockback',()=>{
 const f=world();for(let i=0;i<120&&f.c.activeSwordSkill;i++)f.c.updatePrismWorldChase(f.seq,1/60);
 const target={id:'mob',x:f.player.x+30,y:0,r:18,hp:1000},hits=[];Object.assign(f.player,{weapon:0,attackAngle:0});Object.assign(f.c,{combatTargets:()=>[target],combatAngleFrom:()=>0,angleDiff:()=>0,burst:()=>{},hitEnemy:(e,d,h,p,control)=>hits.push(control)});vm.runInContext(source('basicMeleeHit').split('const SKILL_UNLOCK_LEVELS')[0],f.c);
 assert.equal(f.c.basicMeleeHit(100,Math.PI,20,false),1);assert.equal(hits[0].dx,0);assert.equal(hits[0].stun,.5);
 assert.equal(f.c.basicMeleeHit(100,Math.PI,20,true),1);assert.equal(hits[1].dx,180);assert.equal(hits[1].duration,C.forceDuration(180));
});
