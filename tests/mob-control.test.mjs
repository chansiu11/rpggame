import test from 'node:test';
import assert from 'node:assert/strict';
import {forceMob,advanceMobControl} from '../multiplayer-server/mob-control.js';
const move=(m,dx,dy)=>{m.x+=dx;m.y+=dy;};
test('mob force moves during stun, interrupts attacks and settles without delayed knockback',()=>{
 const m={x:100,y:100,stunUntil:1000,attackAt:900,chargeUntil:1000};forceMob(m,240,0,0,.4);
 assert.equal(m.attackAt,0);assert.equal(m.chargeUntil,0);advanceMobControl(m,200,move);assert.equal(m.x,310);
 advanceMobControl(m,400,move);assert.equal(m.x,340);assert.equal(m.forceMove,null);assert.equal(advanceMobControl(m,1200,move),false);assert.equal(m.x,340);
});
test('successive force requests accumulate from endpoint and clip before replication',()=>{
 const m={x:100,y:100};forceMob(m,100,0,0);forceMob(m,100,0,0);advanceMobControl(m,300,move);assert.equal(m.x,300);
 forceMob(m,500,0,400,.28,(m,dx,dy)=>{m.x=Math.min(400,m.x+dx);m.y+=dy;});assert.equal(m.x,300);assert.equal(m.forceMove.x,400);advanceMobControl(m,800,move);assert.equal(m.x,400);
});
