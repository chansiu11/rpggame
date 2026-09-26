import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import '../multiplayer-server/combat-core.js';
const C=globalThis.EchoesCombat,html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function source(name){const a=html.indexOf('function '+name+'('),b=html.indexOf('\nfunction ',a+1);return html.slice(a,b);}
test('distance cap is independent of speed and frame rate, including reflected projectiles',()=>{
 for(const speed of [300,720,1750])for(const dt of [1/120,1/30,.1]){const p={vx:speed,vy:0};let travelled=0;for(let i=0;i<1000;i++){const step=C.projectileTime(p,dt);travelled+=Math.hypot(p.vx,p.vy)*step;if(i===5)p.vx=-p.vx*1.5;if(!step)break;}assert.ok(Math.abs(travelled-1000)<1e-6);assert.equal(p.distanceTravelled,1000);}
});
function world(targets=[]){let scans=0,checks=0,hits=0;const ctx={window:{EchoesCombat:C},projectiles:[],Math,Map,Set,solidAt:()=>false,burst:()=>{},combatTargets:()=>{scans++;return targets},combatRadius:e=>e.r,combatDistance:(e,p)=>{checks++;return Math.hypot(e.x-p.x,e.y-p.y)},hitEnemy:()=>hits++,distance:(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),player:{x:5000,y:5000,r:18},hitPlayer:()=>{hits++;return 'hit'}};vm.createContext(ctx);vm.runInContext(source('fireProjectile')+'\n'+source('updateProjectiles'),ctx);return {ctx,stats:()=>({scans,checks,hits})};}
test('world arrows, waves and enemy orbs are removed at maximum range before distant damage',()=>{
 for(const [owner,kind] of [['player','arrow'],['player','wave'],['enemy','orb']]){const f=world([{id:'far',x:1200,y:0,r:18}]);f.ctx.fireProjectile(0,0,0,1500,10,owner,kind,20);for(let i=0;i<100;i++)f.ctx.updateProjectiles(.016);assert.equal(f.ctx.projectiles.length,0);assert.equal(f.stats().hits,0);}
});
test('Dawn volley builds target adapters once and avoids distant narrow-phase checks',()=>{
 const targets=Array.from({length:200},(_,i)=>({id:String(i),x:5000+i*10,y:5000,r:18})),f=world(targets);
 for(let i=0;i<19;i++)f.ctx.fireProjectile(0,0,i*.01,920,10,'player','wave',3);f.ctx.updateProjectiles(.033);assert.equal(f.stats().scans,1);assert.equal(f.stats().checks,0);
});
test('cosmetic and arena projectiles share the same cap even with long remaining lifetime',()=>{
 for(const kind of ['remote','arena']){const p={x:0,y:0,vx:2000,vy:0,t:20,life:20,owner:'me',distanceTravelled:980};const c={window:{EchoesCombat:C},dt:.05,projectiles:[p],remoteSkillProjectiles:[p],ARENA_W:10000,ARENA_H:10000};
 const text=kind==='remote'?html.slice(html.indexOf('for(const p of remoteSkillProjectiles){p.t-=dt;'),html.indexOf('\n if(!modal)updateRift')):html.slice(html.indexOf('for(const p of projectiles){p.life-=dt;'),html.indexOf('\n for(const f of fx){f.t-=dt;'));
 vm.runInNewContext(text,c);assert.equal(p.x,20);assert.equal(kind==='remote'?c.remoteSkillProjectiles.length:c.projectiles.length,0);}
});
