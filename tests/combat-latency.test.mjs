import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createWorldCombat} from '../multiplayer-server/world-combat.js';
import {skillVisuals} from '../multiplayer-server/visual-protocol.js';
const C=globalThis.EchoesCombat;
function fixture(){let now=10000;const a={id:'a',ready:true,x:1000,y:1000,hp:1000,maxHp:1000,shield:100,stam:100},b={...a,id:'b',x:1100};const messages=[],c=createWorldCombat({players:new Map([['a',a],['b',b]]),send(){},broadcast:m=>messages.push(m),publicState:p=>({id:p.id,x:p.x,y:p.y,hp:p.hp}),safeZone:()=>false,width:22000,height:11000,now:()=>now});return {a,b,c,messages,step:n=>{now+=n;c.tick();},time:()=>now};}
for(const lag of [0,80,160,280])test(`force endpoint protected against ${lag}ms delayed acknowledged-but-unsettled input`,()=>{
 const f=fixture();f.c.handle(f.a,{seq:1,events:[{kind:'attack',targetId:'b',damage:100,dx:180,stun:.75}]});const hitRevision=f.b.combatRevision;
 let prev=f.b.x;for(let i=0;i<20;i++){f.step(50);assert.ok(f.b.x>=prev);prev=f.b.x;}
 assert.equal(f.b.x,1280);const settled=f.messages.filter(m=>m.outcome==='settled');assert.equal(settled.length,1);assert.ok(f.b.combatRevision>hitRevision);
 f.step(lag);const stale=f.c.ingest(f.b,{seq:1,combatAck:hitRevision,x:1100,y:1000,hp:900});assert.equal(stale.x,1280);
 const fresh=f.c.ingest(f.b,{seq:2,combatAck:f.b.combatRevision,x:1285,y:1000,hp:900});assert.equal(fresh.x,1285);
});
test('moving victim: 200ms old observed contact accepted but expired contact and immunity respected',()=>{
 const f=fixture();f.c.tick();f.b.x=1200;f.step(100);f.b.x=1500;f.step(100);
 const e={kind:'attack',targetId:'b',damage:100,shape:'circle',x:1100,y:1000,r:30,observedAt:10000};f.c.handle(f.a,{seq:1,events:[e]});assert.equal(f.b.hp,900);
 f.step(150);f.c.handle(f.a,{seq:2,events:[e]});assert.equal(f.b.hp,900);
 f.b.invulnUntil=f.time()+1000;f.c.handle(f.a,{seq:3,events:[{...e,x:1500,observedAt:f.time()}]});assert.equal(f.b.hp,900);
});
test('stun/force basic data is shared with the arena and force duration matches',()=>{
 assert.deepEqual(C.basicControl(false),{stun:.5,force:0});assert.deepEqual(C.basicControl(true),{stun:.75,force:180});
 const f=fixture(),ctrl=C.basicControl(true);f.c.handle(f.a,{seq:1,events:[{kind:'attack',targetId:'b',damage:100,dx:ctrl.force,stun:ctrl.stun}]});assert.equal(f.b.forceMove.max,C.forceDuration(180));
});
test('primary visuals bounded, finite and particles excluded',()=>{
 const v=skillVisuals([{type:'particle',x:1,y:1},{type:'riftCut',x:100,y:200,len:99999,width:200,t:3,color:'#fff'},{type:'nova',x:NaN,y:0}]);assert.equal(v.length,1);assert.equal(v[0].len,1600);assert.equal(v[0].width,150);assert.equal(v[0].t,1.2);assert.equal(skillVisuals(Array(100).fill(v[0])).length,24);assert.equal(skillVisuals([v[0]],0).length,0);
});
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function source(name){const a=html.indexOf('function '+name+'(');return html.slice(a,html.indexOf('\nfunction ',a+1));}
test('settlement result corrects local coordinates even without remaining stun or force',()=>{
 const p={x:1100,y:1000,hp:900,maxHp:1000,maxShield:100,maxStam:100},ctx={player:p,multiplayerMode:true,window:{EchoesMulti:{state:{selfId:'b'},packetAge:()=>0}},worldCombatSession:'b',worldCombatRevision:1,worldForce:null,worldControlUntil:0,performance:{now:()=>500},clamp:(n,a,b)=>Math.max(a,Math.min(b,n)),multiInstantMoveSeqFloor:0,multiInstantMoveProtectUntil:0};vm.createContext(ctx);vm.runInContext(source('applyWorldCombatResult'),ctx);ctx.applyWorldCombatResult({targetId:'b',outcome:'settled',player:{combatRevision:2,x:1280,y:1000,hp:900,shield:100,stam:100}});assert.equal(p.x,1280);ctx.applyWorldCombatResult({targetId:'b',outcome:'hit',player:{combatRevision:1,x:1100,y:1000,hp:1000}});assert.equal(p.x,1280);assert.equal(p.hp,900);
});
test('minimap base reused until exploration or dimensions change',()=>{
 let fills=0;const g=new Proxy({fillRect(){fills++;}},{get:(o,k)=>o[k]||(()=>{})}),ctx={mapBaseCache:new Map(),document:{createElement:()=>({getContext:()=>g})},WORLD:{w:1000},OVERWORLD_H:1000,MAP_ROWS:2,MAP_COLS:2,MAP_CELL:500,REGIONS:[{color:'#fff'}],regionAt:()=>0,seen:new Set(),paths:[],pools:[],village:{x:100,y:100},ellipse:()=>{}};vm.createContext(ctx);vm.runInContext(source('mapBackground'),ctx);const first=ctx.mapBackground(100,100,false),count=fills;assert.equal(ctx.mapBackground(100,100,false),first);assert.equal(fills,count);ctx.seen.add(0);assert.notEqual(ctx.mapBackground(100,100,false),first);assert.ok(fills>count);
});
test('attacker previews force without altering HP and uses shared arena curve',()=>{
 const rp={id:'b',x:1100,y:1000,rx:1100,ry:1000,hp:900},ctx={multiRemotePlayers:new Map([['b',rp]]),performance:{now:()=>100},window:{EchoesCombat:C,EchoesMulti:{state:{rtt:160}}}};vm.createContext(ctx);vm.runInContext(source('previewWorldControl'),ctx);ctx.previewWorldControl('b',{dx:180,dy:0});assert.equal(rp.hp,900);assert.equal(rp.x,1100);assert.equal(rp.previewForce.x,1280);assert.equal(C.forcePoint(rp.previewForce,.4).x,1280);assert.ok(rp.previewUntil>100);
});
test('remote cosmetic replay cannot be re-transmitted as a local skill',()=>{
 const local=[{type:'particle'}],ctx={effects:local,renderRemoteSkillFx:()=>{ctx.effects.push({type:'riftCut',x:1,y:2});}};vm.createContext(ctx);vm.runInContext(source('applyRemoteSkillFx'),ctx);ctx.applyRemoteSkillFx({});assert.equal(ctx.effects,local);assert.equal(local[1]._netSkillFxSent,true);assert.equal(local[1]._remoteExact,true);
});
