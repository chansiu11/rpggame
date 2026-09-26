import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import '../multiplayer-server/combat-core.js';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function source(name){const start=html.indexOf('function '+name+'('),end=html.indexOf('\nfunction ',start+1);return html.slice(start,end);}
const base={id:'prismLance',cfg:{duration:.62,hits:[.30],mult:[1],arc:[1.8],reach:[10],step:[0],mode:'fanLances'}};
function config(slot){const c={SWORD_RANGE_SCALE:1.35,GALE_SKILLS:new Set(),GALE_RANGE_SCALE:1.45,SWORD_DASH_SKILLS:new Set(),SWORD_ULT_DAMAGE_SCALE:1.65,SWORD_ULT_RANGE_SCALE:1.35,SWORD_ULT_MIN_DURATION:1.9,base,slot};vm.createContext(c);vm.runInContext(source('balancedSwordSkill')+';result=balancedSwordSkill(base,slot)',c);return c.result.cfg;}
test('Dawn ultimate final damage phase coincides with end animation; other slots unchanged',()=>{const cfg=config(4);assert.equal(cfg.hits[2],cfg.duration);assert.ok(cfg.hits[2]-cfg.hits[1]>.5);assert.equal(config(0).hits.length,1);assert.equal(base.cfg.hits.length,1);});
test('world finisher hits monster and player adapters once, misses targets outside beam',()=>{
 const cfg=config(4),targets=[{id:'mob',x:400,y:0,r:18},{id:'player',networkPlayer:true,x:600,y:35,r:18},{id:'miss',x:400,y:100,r:18}],hits=[];
 const ctx={cfg,hitIndex:2,ang:0,player:{x:0,y:0},combatTargets:()=>targets,combatCenter:e=>e,combatRadius:e=>e.r,segmentDistance:(x,y,a,b)=>globalThis.EchoesCombat.segment(x,y,...a,...b),damageValue:m=>100*m,hitEnemy:(e,d)=>hits.push([e.id,d]),applyEnemyStun:()=>{},fireProjectile:()=>{}};
 const fn=source('performSwordSkillHit'),a=fn.indexOf("if(hitIndex===0){for(let j=-2;j<=2;j++)fireProjectile"),b=fn.indexOf(" }else if(mode==='windShot')",a);vm.runInNewContext(fn.slice(a,b),ctx);assert.deepEqual(hits,[['mob',340],['player',340]]);
});
test('arena final phase sends direct segment damage with shared geometry, before side waves',()=>{
 const cfg=config(4),packets=[];const fn=source('pvpWorldSwordHit'),a=fn.indexOf('if(k===0)for(let j=-2;j<=2;j++)wave'),b=fn.indexOf(" }else if(mode==='windShot')",a);
 vm.runInNewContext(fn.slice(a,b),{cfg,k:2,a:0,me:{x:0,y:0},color:'#fff',pvpSkillAttack:()=>100,segmentAttack:(...p)=>packets.push(p),wave:()=>{}});
 assert.equal(packets.length,1);assert.deepEqual(packets[0].slice(0,7),[-120,0,640,0,46,340,.75]);
});
