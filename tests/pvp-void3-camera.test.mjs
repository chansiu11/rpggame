import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('Void 3 release auto-finishes remaining basics instead of ending immediately',()=>{
 assert.match(html,/void3Pvp\.held=false;void3Pvp\.autoFinish=true/);
 assert.match(html,/void3Pvp\.autoFinish&&!void3Pvp\.exitDash&&now>=\(void3Pvp\.nextBasicAt\|\|0\)\)void3PvpBasic\(true\)/);
 assert.match(html,/void3Pvp\.nextBasicAt=now\+100/);
 assert.match(html,/void3Pvp\.count>=5/);
});

test('Void 3 random movement is centered on the struck enemy',()=>{
 assert.match(html,/tx=clamp\(enemy\.x\+Math\.cos\(a\)\*dist/);
 assert.match(html,/ty=clamp\(enemy\.y\+Math\.sin\(a\)\*dist/);
 assert.match(html,/queueVoid3PvpRandomMove\(-1\)/);
 assert.match(html,/queueVoid3PvpRandomMove\(step\)/);
});

test('PVP camera biases slightly toward the opponent while remaining player-centered',()=>{
 assert.match(html,/enemyDx=enemy\?enemy\.x-me\.x:0/);
 assert.match(html,/enemyDy=enemy\?enemy\.y-me\.y:0/);
 assert.match(html,/enemyDx\*\.18/);
 assert.match(html,/enemyDy\*\.14/);
});
