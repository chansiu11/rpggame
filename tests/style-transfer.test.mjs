import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('style transfer normalizes sword arrays before applying the style',()=>{
 assert.match(html,/function normalizeSwordStyleState\(\)/);
 assert.match(html,/if\(!Array\.isArray\(player\.learnedSwordSkills\)\)player\.learnedSwordSkills=\[\]/);
 assert.match(html,/player\.equippedSwordSkills=\[first,null,null,null,null\]/);
 assert.match(html,/player\.skillCds=\[0,0,0,0,0\]/);
});

test('style transfer validates the first skill and isolates post-transfer failures',()=>{
 assert.match(html,/const g=swordStyleById\(id\),first=g\?\.skills\?\.\[0\],firstSkill=swordSkillById\(first\)/);
 assert.match(html,/\[style-transfer\] tutorial/);
 assert.match(html,/\[style-transfer\] save/);
 assert.doesNotMatch(html,/requestAnimationFrame\(\(\)=>\{try\{updateHUD\(\)/);
});

test('style transfer checkpoints locally and defers cloud sync',()=>{
 assert.match(html,/function saveLocalSnapshot\(\)/);
 assert.match(html,/function scheduleStyleTransferSave\(\)/);
 assert.match(html,/saveLocalSnapshot\(\)/);
 const start=html.indexOf('function scheduleStyleTransferSave()');
 const end=html.indexOf('function chooseSwordStyle',start);
 const scheduler=html.slice(start,end);
 assert.match(scheduler,/saveGame\(false\)/);
 assert.ok(scheduler.indexOf('saveLocalSnapshot()')<scheduler.indexOf('setTimeout('));
 assert.doesNotMatch(scheduler,/EchoesCloud/);
 assert.match(scheduler,/1200/);
});

test('HUD tutorial progress is bounded and save-free during rendering',()=>{
 assert.match(html,/function updateTutorialJourney\(deferSave=false,maxSteps=Infinity\)/);
 assert.match(html,/updateTutorialJourney\(true,1\);refreshQuestPingTargets\(\)/);
 assert.match(html,/if\(changed&&!deferSave\)saveGame\(false\)/);
});

test('style transfer briefly defers multiplayer profile broadcasting',()=>{
 assert.match(html,/if\(multiplayerMode\)multiProfileSendAt=performance\.now\(\)\+1200/);
});
