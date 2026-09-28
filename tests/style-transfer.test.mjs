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
 assert.match(html,/requestAnimationFrame\(\(\)=>\{try\{updateHUD\(\)/);
});
