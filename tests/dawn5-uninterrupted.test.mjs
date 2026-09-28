import test from 'node:test';import assert from 'node:assert/strict';
import {createArena} from '../multiplayer-server/ai/arena-runtime.js';
function run(slot,hit=false){const a=createArena({style:'dawn'}),packets=[];a.api.init(a.snapshot,a.snapshot,true,m=>packets.push(m));a.api.control({skill:slot,aim:0,keys:[]});assert.ok(a.api.me.skillEvent);const seq=a.api.me.skillEvent,hp=a.api.me.hp;
 if(hit)a.api.receive({t:'atk',id:'test-hit',shape:'circle',x:a.api.me.x,y:a.api.me.y,r:100,d:20,stun:1,parryable:false});
 for(let i=0;i<130;i++)a.step(1/60);return {a,packets,seq,hp};}
test('Dawn 5 keeps firing after damage/stun and each projectile matches Dawn 1',()=>{
 const one=run(0),five=run(4,true);try{assert.ok(five.a.api.me.hp<five.hp);const p1=one.packets.filter(m=>m.t==='proj'),p5=five.packets.filter(m=>m.t==='proj');assert.equal(p1.length,1);assert.equal(p5.length,19);for(const p of p5)assert.equal(p.d,p1[0].d);}finally{one.a.dispose();five.a.dispose();}
});
test('other skills still cancel on incoming stun',()=>{const r=run(0,true);try{assert.equal(r.packets.filter(m=>m.t==='proj').length,0);}finally{r.a.dispose();}});
