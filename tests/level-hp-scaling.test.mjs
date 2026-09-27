import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

const BASE_HP=82;
const STARTER_GEAR_HP=18;
const HP_PER_LEVEL=49900/199;

function starterHp(level){
 return Math.round(BASE_HP+(level-1)*HP_PER_LEVEL+STARTER_GEAR_HP);
}

test('level cap is 200 and starter HP hits the requested endpoints',()=>{
 assert.match(html,/MAX_LEVEL=200/);
 assert.match(html,/PLAYER_BASE_HP=82/);
 assert.match(html,/PLAYER_HP_PER_LEVEL=49900\/199/);
 assert.equal(starterHp(1),100);
 assert.equal(starterHp(200),50000);
});

test('HP rises monotonically through all 200 levels',()=>{
 let prev=starterHp(1);
 for(let level=2;level<=200;level++){
  const hp=starterHp(level);
  assert.ok(hp>prev,`Lv.${level} HP must exceed previous level`);
  prev=hp;
 }
});

test('PVP accepts level 200 and the new HP range without the old flat bonus',()=>{
 assert.match(html,/s\.level>=1&&s\.level<=200/);
 assert.match(html,/s\.maxHp>0&&s\.maxHp<100000/);
 assert.match(html,/baseHp=Number\(WORLD_COMBAT\.baseHp\)\|\|82/);
 assert.match(html,/maxHp=Math\.round\(baseHp\+\(lvl-1\)\*PVP_HP_PER_LEVEL\+resolve\*12\+h\.hp\+cg\.hp\),/);
 assert.doesNotMatch(html,/maxHp=Math\.round\(baseHp\+\(lvl-1\)\*PVP_HP_PER_LEVEL[^\n]+\)\+1000/);
});

test('level extension does not rescale the existing Gale and Void ultimate damage targets',()=>{
 assert.match(html,/function ultimateTargetDamage\(maxAt100,level=player\?\.level\|\|1\)\{const lv=clamp\(Number\(level\)\|\|1,1,100\)/);
 assert.match(html,/function pvpUltimateTargetDamage\(maxAt100,level=me\?\.level\|\|1\)\{const lv=clamp\(Number\(level\)\|\|1,1,100\)/);
});


test('per-level player damage growth is increased by 1.5x',()=>{
 assert.match(html,/PLAYER_DAMAGE_PER_LEVEL=2\.55/);
 assert.equal(2.55,1.7*1.5);
});
