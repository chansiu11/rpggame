import test from 'node:test';
import assert from 'node:assert/strict';
import {createArena} from '../multiplayer-server/ai/arena-runtime.js';
import {createWorldCombat} from '../multiplayer-server/world-combat.js';

function prepareVoidArena(){
 const arena=createArena({style:'void'}),sent=[];
 arena.api.init(arena.snapshot,arena.snapshot,true,m=>sent.push(m));
 arena.api.enemy.x=arena.api.me.x+95;arena.api.enemy.y=arena.api.me.y;
 arena.api.enemy.netX=arena.api.enemy.x;arena.api.enemy.netY=arena.api.enemy.y;
 arena.api.me.stam=arena.api.me.maxStam;
 arena.api.control({keys:[],aim:0,skill:2});arena.step(.2);
 const opening=sent.find(p=>p.t==='atk');
 assert.ok(opening,'Void 3 must send its opening attack after preparation');
 arena.api.receive({t:'attackResult',id:opening.id,result:'hit'});
 assert.equal(arena.api.me.void3DodgeRemaining,5);
 return {arena,sent};
}
test('Void 3 PVP automatically counters five times after the 50ms disappearance delay',()=>{
 const {arena,sent}=prepareVoidArena();
 try{
  const me=arena.api.me,hp=me.hp;
  arena.api.control({keys:[],aim:0,release:2});
  assert.equal(me.void3DodgeRemaining,5,'releasing the key must not end the stance');
  for(let n=1;n<=5;n++){
   arena.step(.2);
   arena.api.receive({t:'atk',id:300+n,shape:'circle',x:me.x,y:me.y,r:90,d:24,stun:.5});
   assert.equal(me.hp,hp,'marked attacker hit must be dodged');
   assert.equal(me.void3DodgeRemaining,5-n);
   const counters=()=>sent.filter(p=>p.t==='atk').length-1;
   const before=counters();
   arena.step(.03);assert.equal(counters(),before,'no counter may happen before 50ms');
   arena.step(.03);assert.ok(counters()>before,'counter must appear after 50ms');
  }
  assert.ok(me.cool[2]>0,'normal cooldown starts when fifth evade is spent');
 }finally{arena.dispose();}
});
test('Void 3 PVP expiry restores original cooldown without a hit',()=>{
 const {arena}=prepareVoidArena();
 try{arena.step(10.1);assert.equal(arena.api.me.void3DodgeRemaining,0);assert.ok(arena.api.me.cool[2]>0);}
 finally{arena.dispose();}
});
function worldFixture(){
 let clock=1000;const broadcasts=[],players=new Map();
 const fighter=(id,x,y,style='')=>({id,name:id,x,y,a:0,vx:0,vy:0,ready:true,clientMode:'world',hp:5000,maxHp:5000,maxShield:100,shield:100,stam:100,maxStam:100,weapon:0,swordStyle:style,defenseReduction:0});
 const a=fighter('void',300,300,'void'),b=fighter('marked',390,300);
 players.set(a.id,a);players.set(b.id,b);
 const combat=createWorldCombat({players,send:()=>{},broadcast:m=>broadcasts.push(m),publicState:p=>({id:p.id,x:p.x,y:p.y,hp:p.hp,maxHp:p.maxHp,a:p.a}),safeZone:()=>false,width:3000,height:3000,clipTarget:(p,q)=>q,now:()=>clock});
 let cast=0,attacks=0;
 return {a,b,combat,broadcasts,step:ms=>{clock+=ms;combat.tick();},arm:()=>{
  combat.handle(a,{seq:++cast,events:[{kind:'attack',targetId:b.id,shape:'circle',x:b.x,y:b.y,r:75,damage:90,skillId:'gravityCut'}]});
  assert.ok(a.void3Mark,'a confirmed opening hit should arm server-side counters');
 },attack:()=>{
  combat.handle(b,{seq:++attacks,events:[{kind:'attack',targetId:a.id,shape:'circle',x:a.x,y:a.y,r:75,damage:90,skillId:'basic'}]});
 }};
}
test('shared world PvP enforces five marked dodges and authoritative knockback',()=>{
 const w=worldFixture();w.arm();const original=w.a.hp;
 for(let n=1;n<=5;n++){
  w.step(150);w.attack();
  assert.equal(w.a.hp,original,'marked attacks cannot damage the dodging player');
  assert.equal(w.a.void3Mark.remaining,5-n);
  assert.equal(w.broadcasts.at(-1).outcome,'void3Evade');
  w.step(55);
  assert.equal(w.broadcasts.filter(m=>m.outcome==='void3Counter').length,n);
  assert.ok(w.b.forceMove,'counter must apply server-owned knockback');
  assert.ok(w.b.stunUntil>0,'counter must stun');
 }
 assert.equal(w.a.void3Mark,null,'fifth counter closes stance');
});
test('shared world PvP expires unused stance after ten seconds',()=>{
 const w=worldFixture();w.arm();w.step(10001);
 assert.equal(w.a.void3Mark,null);
});
