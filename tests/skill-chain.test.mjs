import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import '../multiplayer-server/combat-core.js';
const C=globalThis.EchoesCombat,html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function source(name){const a=html.indexOf('function '+name+'('),b=html.indexOf('\nfunction ',a+1);return html.slice(a,b);}
for(const networkPlayer of [false,true])test(`Dawn wave repeatedly catches a moving ${networkPlayer?'player':'mob'} with arena force`,()=>{
 const e={id:'victim',networkPlayer,x:120,y:0,r:18},hits=[];let clock=0,force;
 const ctx={window:{EchoesCombat:C},projectiles:[],Math,Map,Set,solidAt:()=>false,burst:()=>{},combatTargets:()=>[e],combatDistance:(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),combatRadius:a=>a.r,
 hitEnemy:(target,damage,heavy,origin,control)=>{hits.push({clock,x:e.x,control});force={startX:e.x,startY:0,x:e.x+control.dx,y:0,max:control.duration,at:clock};}};
 vm.createContext(ctx);vm.runInContext(source('fireProjectile')+'\n'+source('updateProjectiles'),ctx);
 vm.runInContext("fireProjectile(23,0,0,720,100,'player','wave',7)",ctx);
 for(let i=0;i<120;i++){clock+=1/120;if(force)e.x=C.forcePoint(force,clock-force.at).x;ctx.updateProjectiles(1/120);}
 assert.ok(hits.length>=3,`only ${hits.length} hits`);assert.ok(e.x>400,`victim only reached ${e.x}`);
 for(let i=1;i<hits.length;i++){assert.ok(hits[i].clock-hits[i-1].clock>=.1-1e-9);assert.ok(hits[i].x>hits[i-1].x);}
 assert.equal(hits[0].control.dx,180);
});
test('ordinary piercing arrows still hit the same target only once',()=>{
 let hits=0;const e={id:'e',x:0,y:0,r:100};const ctx={projectiles:[],Math,Map,Set,window:{EchoesCombat:C},solidAt:()=>false,burst:()=>{},combatTargets:()=>[e],combatDistance:()=>0,combatRadius:e=>e.r,hitEnemy:()=>hits++};vm.createContext(ctx);vm.runInContext(source('fireProjectile')+'\n'+source('updateProjectiles'),ctx);ctx.fireProjectile(0,0,0,1,10,'player','arrow',7);for(let i=0;i<20;i++)ctx.updateProjectiles(.016);assert.equal(hits,1);
});
test('Void hold registers swept contact and carries the target over successive teleports',()=>{
 const e={id:'e',x:120,y:0,r:18},player={x:0,y:0},seq={ultimate:true,side:1,elapsed:0,fx:0,facing:0},hits=[];
 const ctx={player,seq,e,dt:.11,accent:'x',main:'x',effects:[],Math,Set,combatTargets:()=>[e],combatDistance:(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),combatCenter:e=>e,combatRadius:e=>e.r,swordCarryEligible:()=>true,segmentDistance:(x,y,a,b)=>C.segment(x,y,...a,...b),damageValue:m=>m,hitEnemy:(...args)=>hits.push(args),moveBody:(e,dx,dy)=>{e.x+=dx;e.y+=dy},syncSkillMoveIfNeeded:()=>{},ring:()=>{}};
 vm.createContext(ctx);vm.runInContext(source('ensureSwordCarrySet')+'\n'+source('hitShadowCarryPath')+'\n'+source('moveSwordCarryTargets'),ctx);
 const fn=source('updateHeldSwordSkill'),a=fn.indexOf("}else if(mode==='holdShadow'){")+"}else if(mode==='holdShadow'){".length,b=fn.indexOf('\n }\n moveSwordCarryTargets',a),branch=fn.slice(a,b);
 let travel=0;
 for(let i=0;i<8;i++){const x=player.x,y=player.y;vm.runInContext('{'+branch+'}',ctx);ctx.moveSwordCarryTargets(seq,player.x-x,player.y-y);travel+=Math.hypot(player.x-x,player.y-y);seq.elapsed+=.11;}
 assert.equal(hits.length,8);assert.ok(seq.carryIds.has('e'));assert.ok(travel>800);assert.ok(Math.hypot(e.x-120,e.y)>500);assert.equal(hits[0][4].shape,'segment');
});
