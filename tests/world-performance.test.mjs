import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {selectMobInterest} from '../multiplayer-server/world-interest.js';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../multiplayer-server/server.js',import.meta.url),'utf8');
function source(text,name){const a=text.indexOf('function '+name+'('),b=text.indexOf('\nfunction ',a+1);return text.slice(a,b);}
test('movement at 20/30/60 FPS consumes equal time, with bounded collision steps',()=>{
 for(const fps of [20,30,60]){
  let distance=0,maxStep=0;const c={requestAnimationFrame:()=>{},lastStamp:0,realTime:0,frameMs:16,multiplayerMode:true,updateWorldForce:()=>{},flushWorldCombat:()=>{},updateAudio:()=>{},mode:'play',modal:null,hitstop:.05,update:dt=>{distance+=177*dt;maxStep=Math.max(maxStep,dt)},touchMode:false,render:()=>{},lastDrawStamp:0};
  vm.createContext(c);vm.runInContext(html.slice(html.indexOf('function frame(stamp)'),html.indexOf('// QA hooks')),c);
  for(let i=1;i<=fps;i++)c.frame(i*1000/fps);
  assert.ok(Math.abs(distance-177)<1e-6);assert.ok(maxStep<=.033);assert.ok(Math.abs(c.frameMs-1000/fps)<20);
 }
});
test('return from background has bounded catch-up and does not teleport across the map',()=>{
 let elapsed=0,calls=0;const c={requestAnimationFrame:()=>{},lastStamp:0,realTime:0,frameMs:16,multiplayerMode:true,updateWorldForce:()=>{},flushWorldCombat:()=>{},updateAudio:()=>{},mode:'play',modal:null,hitstop:0,update:dt=>{elapsed+=dt;calls++},touchMode:false,render:()=>{},lastDrawStamp:0};vm.createContext(c);vm.runInContext(html.slice(html.indexOf('function frame(stamp)'),html.indexOf('// QA hooks')),c);c.frame(5000);assert.equal(elapsed,.1);assert.equal(calls,4);
});
test('decor tiles reuse drawing, invalidate on world rebuild, and have a memory bound',()=>{
 let paints=0;const ctx={decor:[],document:{createElement:()=>({getContext:()=>({translate(){}})})},paintDecorTile:()=>paints++,ctx:{drawImage(){}},Map};vm.createContext(ctx);vm.runInContext('const decorTiles=new Map();let decorTileSource=null,decorTileCount=-1;'+source(html,'drawDecorTiles'),ctx);
 ctx.drawDecorTiles(0,0,511,511);ctx.drawDecorTiles(0,0,511,511);assert.equal(paints,1);ctx.decor=[];ctx.drawDecorTiles(0,0,511,511);assert.equal(paints,2);
 for(let i=0;i<100;i++)ctx.drawDecorTiles(i*512,0,i*512+511,511);assert.ok(vm.runInContext('decorTiles.size',ctx)<=48);
});
test('nearby mobs refresh on re-entry; far targeted attacks stay in interest',()=>{
 const p={id:'p',x:0,y:0},near={id:'near',x:100,y:0},far={id:'far',x:9000,y:0},target={id:'target',x:10000,y:0,targetId:'p'},mobs=new Map([near,far,target].map(m=>[m.id,m]));
 let r=selectMobInterest(p,mobs,new Set());assert.deepEqual(r.updates.map(m=>m.id),['near','target']);let prior=r.ids;p.x=9000;r=selectMobInterest(p,mobs,new Set(),prior);assert.ok(r.updates.includes(far));p.x=0;r=selectMobInterest(p,mobs,new Set(),r.ids);assert.ok(r.updates.includes(near));
});
test('interest filtering greatly reduces dense distant mob payload without altering combat packets',()=>{
 const mobs=new Map(Array.from({length:200},(_,i)=>[String(i),{id:String(i),x:i*300,y:0,hp:100,state:'chase'}]));const all=[...mobs.values()],r=selectMobInterest({id:'p',x:0,y:0},mobs,new Set(mobs.keys()));const before=JSON.stringify(all).length,after=JSON.stringify(r.updates).length;assert.ok(after<before*.1);console.log(`Synthetic 200-mob payload: ${before} -> ${after} bytes (${Math.round((1-after/before)*100)}% reduction)`);
});
test('interest delta retains global revision and retries entry after socket backpressure',()=>{
 const a={id:'a',ready:true,clientMode:'world',x:0,y:0,ws:{}},b={id:'b',ready:true,clientMode:'world',x:20000,y:0,ws:{}},mob={id:'mob',x:50,y:0};let fail=true;const sent=[];
 const c={Date,Map,Set,selectMobInterest,dirtyMobIds:new Set(['mob']),authoritativeMobs:new Map([['mob',mob]]),players:new Map([['a',a],['b',b]]),worldRevision:5,worldSnapshot:{},mobPublic:m=>m,safeSend:(ws,msg)=>{sent.push([ws,msg]);return !(ws===a.ws&&fail)}};
 vm.createContext(c);vm.runInContext(source(server,'flushMobDeltas'),c);c.flushMobDeltas(1000);assert.equal(sent[1][1].mobs.length,0);assert.equal(sent[1][1].revision,6);assert.equal(a.mobInterest,undefined);fail=false;sent.length=0;c.flushMobDeltas(1050);assert.equal(sent[0][1].mobs[0].id,'mob');assert.ok(a.mobInterest.has('mob'));
});
