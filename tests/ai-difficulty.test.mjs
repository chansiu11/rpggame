import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrain,normalizeDifficulty,seedPolicy,rng} from '../multiplayer-server/ai/brain.js';
test('difficulty validates untrusted levels and keeps the normal default',()=>{
 for(const value of [undefined,null,0,6,-1,2.5,'bad',{},Infinity])assert.equal(normalizeDifficulty(value),3);
 for(let n=1;n<=5;n++)assert.equal(normalizeDifficulty(String(n)),n);
});
test('higher difficulties react and defend more often with identical combat stats',()=>{
 const me={x:1000,y:1000,hp:100,maxHp:100,stam:100,maxStam:100,shield:100,stun:0,cool:[99,99,99,99,99]};
 const enemy={x:1200,y:1000,attackAnim:1,skillPose:-1};
 const counts=[];
 for(let level=1;level<=5;level++){
 const brain=createBrain('gale',seedPolicy(),rng(42),level);let defenses=0,changes=0,prev;
 for(let i=0;i<6000;i++){const action=brain.step(1/60,me,enemy);if(action.block||action.dash)defenses++;if(action.keys!==prev)changes++;prev=action.keys;}
 counts.push({defenses,changes});
 }
 for(let i=1;i<5;i++){assert.ok(counts[i].defenses>counts[i-1].defenses);assert.ok(counts[i].changes>counts[i-1].changes);}
 assert.equal(me.hp,100);assert.equal(me.stam,100);
});
