import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../multiplayer-server/server.js',import.meta.url),'utf8');
test('monster loot goes straight to the rewarded player',()=>{
 assert.match(html,/function grantMonsterLoot\(/);
 assert.match(html,/function dropMonsterLoot\([^)]*\)\{return grantMonsterLoot\(kind,amount,x,y\);\}/);
 assert.doesNotMatch(html,/function dropMonsterLoot\([^}]*dropLoot\(/);
});
test('legacy ground loot is not persisted or restored',()=>{
 assert.match(html,/loot:\[\],savedAt:/);
 assert.doesNotMatch(html,/resetWorldState\(\);restoreLoot\(data\.loot\)/);
 assert.match(html,/function resetWorldState\(keepLoot=false\)\{prepareLoot\(\);/);
});
test('shared server no longer republishes ground loot',()=>{
 assert.match(server,/mobs:mobSnapshot\(\),items:\[\]/);
 assert.match(server,/function handleItemSpawn\(player,msg\)\{return;\}/);
 assert.match(server,/2026-10-12-direct-monster-rewards-1/);
});
