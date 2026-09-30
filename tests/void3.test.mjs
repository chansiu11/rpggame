import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
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
 assert.equal(arena.api.me.void3DodgeRemaining,1);
 return {arena,sent};
}
test('Void 3 PVP automatically counters once after the 50ms disappearance delay',()=>{
 const {arena,sent}=prepareVoidArena();
 try{
  const me=arena.api.me,hp=me.hp;
  arena.api.control({keys:[],aim:0,release:2});
  assert.equal(me.void3DodgeRemaining,1,'releasing the key must not end the one-use stance');
  arena.step(.2);
  arena.api.receive({t:'atk',id:301,shape:'circle',x:me.x,y:me.y,r:90,d:24,stun:.5});
  assert.equal(me.hp,hp,'the marked attacker first hit must be dodged');
  assert.equal(me.void3DodgeRemaining,0);
  const counters=()=>sent.filter(p=>p.t==='atk').length-1,before=counters();
  arena.step(.03);assert.equal(counters(),before,'no counter may happen before 50ms');
  arena.step(.03);assert.ok(counters()>before,'counter must appear after 50ms');
  assert.ok(me.cool[2]>0,'normal cooldown starts when the single evade is spent');
  me.inv=me.hitInv=0;
  arena.api.receive({t:'atk',id:302,shape:'circle',x:me.x,y:me.y,r:90,d:24,stun:.5});
  assert.ok(me.hp<hp,'a second incoming hit is no longer auto-evaded');
 }finally{arena.dispose();}
});
test('Void 3 PVP expiry restores original cooldown without a hit',()=>{
 const {arena}=prepareVoidArena();
 try{for(let i=0;i<102;i++)arena.step(.1);assert.equal(arena.api.me.void3DodgeRemaining,0);assert.ok(arena.api.me.cool[2]>0);}
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
test('shared world PvP enforces one marked dodge and authoritative knockback',()=>{
 const w=worldFixture();w.arm();const original=w.a.hp;
 w.step(800);w.attack();
 assert.equal(w.a.hp,original,'the first marked attack cannot damage the dodging player');
 assert.equal(w.a.void3Mark.remaining,0);
 assert.equal(w.broadcasts.at(-1).outcome,'void3Evade');
 w.step(55);
 assert.equal(w.broadcasts.filter(m=>m.outcome==='void3Counter').length,1);
 assert.ok(w.b.forceMove,'counter must apply server-owned knockback');
 assert.ok(w.b.stunUntil>0,'counter must stun');
 assert.equal(w.a.void3Mark,null,'the single counter closes the stance');
 w.step(800);w.attack();
 assert.ok(w.a.hp<original,'the next marked-player attack damages normally after the one evade is spent');
});
test('shared world PvP expires unused stance after ten seconds',()=>{
 const w=worldFixture();w.arm();w.step(10001);
 assert.equal(w.a.void3Mark,null);
});

test('Void 5 renders a circular magic seal for 0.5 seconds before its existing movement and attacks',()=>{
 assert.match(html,/sk\.id==='voidDance'\?\.5:0/,'world/PvP hold duration includes the startup delay');
 assert.match(html,/if\(seq\.ultimate&&seq\.elapsed<\.5\)/,'world Void 5 waits inside its magic circle');
 assert.match(html,/if\(ult&&h\.elapsed<\.5\)/,'PvP Void 5 waits inside its magic circle');
 assert.match(html,/starSeal[^\n]+r:145[^\n]+\.55/,'the startup draws the large circular seal');
});
test('Gale 1 shield break and Gale 3 charge stun are wired through world and PvP hit paths',()=>{
 assert.match(html,/seq\?\.skillId==='windSlash'\)\{p\.stunScale=\.5;p\.breakShield=true;\}/,
  'world Gale 1 projectiles are tagged to break shields');
 assert.match(html,/mode==='windShot'[^\n]+breakShield:true/,
  'PvP Gale 1 projectiles carry the shield-break flag');
 assert.match(html,/parryable:p\.parryable,breakShield:!!p\.breakShield/,
  'received PvP projectiles apply shield break on contact');
 assert.match(html,/skillId:'galeOrbit'[^\n]+stun:\.16,root:\.23/,
  'world Gale 3 applies short stun throughout its charge pull');
 assert.match(html,/me\.galeRoot=Math\.max\(me\.galeRoot\|\|0,\.25\);me\.stun=Math\.max\(me\.stun\|\|0,\.16\)/,
  'PvP Gale 3 charge pull also renews short stun');
});
