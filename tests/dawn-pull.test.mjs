import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import '../multiplayer-server/combat-core.js';
const C=globalThis.EchoesCombat;
test('Dawn waves pull front and rear victims toward current caster position without overshoot',()=>{
 for(const x of [-500,500,40,0]){const t={x,y:0,r:18},caster={x:0,y:0,r:18},f=C.projectileForce({vx:560,vy:0,pullToCaster:true},t,caster,180);assert.ok(f.dx*x<=0);assert.ok(Math.abs(f.dx)<=Math.max(0,Math.abs(x)-36));assert.ok(Number.isFinite(f.a));}
 const f=C.projectileForce({vx:560,vy:0,pullToCaster:true},{x:100,y:0},{x:100,y:300},180);assert.ok(f.dy>0);assert.ok(Math.abs(f.dx)<1e-8);
});
test('other waves retain directional knockback',()=>{assert.equal(C.projectileForce({vx:560,vy:0},{x:500,y:0},{x:0,y:0},180).dx,180);});
test('only Solar Return tags outgoing world and arena projectiles',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');function source(n){const a=html.indexOf('function '+n+'(');return html.slice(a,html.indexOf('\nfunction ',a+1));}
 for(const id of ['solarReturn','dawnArc','prismLance']){const c={window:{EchoesCombat:C},Math,Map,Set,projectiles:[],activeSwordSkill:{skillId:id},me:{x:0,y:0,skillEvent:{skill:{id}}},net:()=>{}};vm.createContext(c);vm.runInContext(source('fireProjectile')+'\n'+source('sendProjectile'),c);c.fireProjectile(0,0,0,560,100,'player','wave',4);c.sendProjectile(0,560,100);for(const p of c.projectiles)assert.equal(!!p.pullToCaster,id==='solarReturn');}
});
