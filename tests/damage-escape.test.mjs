import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createArena} from '../multiplayer-server/ai/arena-runtime.js';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
function setup(){
 const arena=createArena({style:'break',level:100}),packets=[];
 arena.api.init(arena.snapshot,arena.snapshot,true,m=>packets.push(m));
 arena.api.enemy.x=arena.api.me.x+420;arena.api.enemy.y=arena.api.me.y;
 arena.api.enemy.netX=arena.api.enemy.x;arena.api.enemy.netY=arena.api.enemy.y;
 let id=0;
 const strike=(d=5000,skillId='guardBreak',lease='')=>{
  const f=arena.api.me;f.inv=0;f.hitInv=0;
  arena.api.receive({t:'atk',id:++id,shape:'circle',x:f.x,y:f.y,r:65,
   sx:arena.api.enemy.x,sy:arena.api.enemy.y,d,stun:.32,
   rapidHit:true,skillId,controlLease:lease,controlLeaseMs:950});
 };
 return {arena,packets,strike};
}
function fillThreshold(f){
 const me=f.arena.api.me;
 for(let i=0;i<16&&me.escapeDamage<me.maxHp*.4;i++)f.strike();
 assert.ok(me.escapeDamage>=me.maxHp*.4,'actual HP damage should fill 40 percent of max health');
 assert.ok(me.hp>0,'the threshold should be earned before the character is defeated');
}
test('damage escape is usable with the dash input while stunned and grants one second of immunity',()=>{
 const f=setup();
 try{
  fillThreshold(f);
  const me=f.arena.api.me;assert.ok(me.stun>0);
  f.arena.api.control({keys:[],aim:0,dash:true});
  assert.equal(f.packets.filter(m=>m.t==='escape').length,1);
  assert.equal(me.escapeDamage,0,'escape consumes the earned meter');
  assert.equal(me.stun,0,'escape overrides an ordinary hit stun');
  assert.ok(me.inv>=.99,'escape grants one second of immunity');
  assert.ok(me.dash>0,'escape immediately executes the dash');
  const hp=me.hp;f.arena.api.receive({t:'atk',id:10001,shape:'circle',x:me.x,y:me.y,r:80,
   d:5000,stun:1,rapidHit:true});
  assert.equal(me.hp,hp,'the first incoming hit after escape is ignored');
 }finally{f.arena.dispose();}
});
test('an idle streak of 2.5 seconds hides the escape meter and starts a fresh damage chain',()=>{
 const f=setup();
 try{
  f.strike(1100);const me=f.arena.api.me;assert.ok(me.escapeDamage>0);
  for(let i=0;i<151;i++)f.arena.step(1/60);
  assert.equal(me.escapeDamage,0);
  assert.equal(me.escapeIdle,0);
  f.strike(1100);assert.ok(me.escapeDamage>0);
  assert.ok(me.escapeDamage<me.maxHp*.4);
 }finally{f.arena.dispose();}
});
test('confirmed scripted ultimate hits lock escape until their guaranteed sequence ends',()=>{
 const f=setup();
 try{
  fillThreshold(f);
  const me=f.arena.api.me;
  f.strike(1,'meteorBreaker','hongFinale');
  assert.ok(me.escapeGuaranteedUntil>0);
  f.arena.api.control({keys:[],aim:0,dash:true});
  assert.equal(f.packets.filter(m=>m.t==='escape').length,0,
   'dash must not break out of a confirmed scripted ultimate');
  me.escapeGuaranteedUntil=0;me.controlLease=null;
  f.arena.api.control({keys:[],aim:0,dash:true});
  assert.equal(f.packets.filter(m=>m.t==='escape').length,1,
   'the stored gauge becomes available after the guaranteed skill ends');
 }finally{f.arena.dispose();}
});
test('world and arena expose matching unobstructed southeast escape bars',()=>{
 for(const id of ['worldEscapeHud','pvpEscapeHud'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/\.escape-hud\{position:absolute;top:53%;right:8%;/);
 assert.match(html,/worldEscapeFill/);
 assert.match(html,/pvpEscapeFill/);
 assert.match(html,/function updateWorldEscapeHud\(/);
 assert.match(html,/function updatePvpEscapeHud\(/);
});
