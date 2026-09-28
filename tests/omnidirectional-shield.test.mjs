import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const worldCombat=fs.readFileSync(new URL('../multiplayer-server/world-combat.js',import.meta.url),'utf8');

test('local shield blocks parryable attacks from every direction',()=>{
 assert.match(html,/if\(shieldHeld\(\)&&player\.shield>0&&player\.shieldBroken<=0&&parryable\)\{/);
 assert.doesNotMatch(html,/shieldHeld\(\)[^\n]+angleDiff\(a,player\.facing\)/);
});

test('arena PVP shield blocks from every direction unless explicitly bypassed',()=>{
 assert.match(html,/if\(!bypassShield&&me\.block&&me\.shield>0\)\{/);
 assert.doesNotMatch(html,/me\.block&&me\.shield>0&&facingSource/);
});

test('shared-world authoritative shield does not require facing the attacker',()=>{
 assert.match(worldCombat,/if\(b\.block&&b\.shield>0&&!e\.bypassShield\)\{/);
 assert.doesNotMatch(worldCombat,/const facing=Math\.abs\(C\.angle/);
 assert.doesNotMatch(worldCombat,/b\.block&&b\.shield>0&&facing/);
});
