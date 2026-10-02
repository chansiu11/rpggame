import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldCombat} from '../multiplayer-server/world-combat.js';

function fixture(){
  let time=10000;
  const player=id=>({id,ready:true,clientMode:'world',x:1000,y:1000,hp:1000,maxHp:1000,shield:500,maxShield:500,stam:100,maxStam:200,a:0});
  const a=player('a'),b=player('b');b.x=1100;
  const players=new Map([['a',a],['b',b]]),messages=[];
  const combat=createWorldCombat({players,send(){},broadcast:m=>messages.push(m),publicState:p=>({id:p.id,x:p.x,y:p.y,hp:p.hp,seq:p.seq||0}),safeZone:()=>false,width:22000,height:11000,now:()=>time});
  let combatSeq=0;
  return {a,b,combat,messages,hit:(extra={})=>combat.handle(a,{seq:++combatSeq,events:[{kind:'attack',targetId:'b',damage:100,...extra}]}),advance(ms){time+=ms;combat.advance(b);}};
}

test('settled knockback cannot be overwritten by a fresh-ack packet carrying the pre-hit position',()=>{
  const f=fixture();
  const origin=f.b.x;
  f.hit({dx:280,duration:.4,stun:.1});
  assert.equal(f.b.controlRevision,1);
  f.advance(500);
  assert.equal(f.b.x,1380);
  assert.equal(f.b.forceMove,null);
  assert.equal(f.b.controlRevision,2,'settling starts a new control generation');
  assert.equal(f.messages.at(-1).outcome,'settled');

  const stale=f.combat.ingest(f.b,{seq:1,combatAck:f.b.combatRevision,controlAck:f.b.controlRevision,x:origin,y:1000,hp:f.b.hp});
  assert.equal(stale.x,1380,'an old buffered coordinate must not snap the defender back');

  const confirm=f.combat.ingest(f.b,{seq:2,combatAck:f.b.combatRevision,controlAck:f.b.controlRevision,x:1380,y:1000,hp:f.b.hp});
  assert.equal(confirm.x,1380,'the client can acknowledge the authoritative endpoint');

  const move=f.combat.ingest(f.b,{seq:3,combatAck:f.b.combatRevision,controlAck:f.b.controlRevision,x:1392,y:1000,hp:f.b.hp});
  assert.equal(move.x,1392,'normal movement resumes immediately after endpoint acknowledgement');
});
