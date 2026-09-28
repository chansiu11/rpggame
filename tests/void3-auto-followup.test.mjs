import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('Void 3 drops its movement slow immediately when the tracked target is gone',()=>{
 assert.match(html,/if\(realTime>=void3State\.until\)\{endVoid3World\(\);return;\}/);
 assert.match(html,/void3State\.nextTargetCheckAt=realTime\+\.10/);
 assert.match(html,/if\(!void3WorldTarget\(\)\)\{endVoid3World\(\);return;\}/);
 assert.match(html,/if\(void3Pvp&&\(performance\.now\(\)>=void3Pvp\.until\|\|enemy\.hp<=0\)\)endVoid3Pvp\(\)/);
});

test('Void 3 follow-ups happen only from basic attacks while the skill key is held',()=>{
 assert.match(html,/if\(void3State\)\{if\(void3State\.held\)void3WorldBasic\(\);return;\}/);
 assert.match(html,/if\(void3Pvp\)\{if\(void3Pvp\.held\)void3PvpBasic\(\);return;\}/);
 assert.match(html,/void3State\.held=false;void3State\.ending=true/);
 assert.match(html,/void3Pvp\.held=false;void3Pvp\.ending=true/);
 assert.doesNotMatch(html,/if\(void3WorldBasic\(\)&&void3State\)void3State\.nextAutoAt/);
 assert.doesNotMatch(html,/if\(void3PvpBasic\(\)&&void3Pvp\)void3Pvp\.nextAutoAt/);
});

test('Void 3 allows five manual follow-ups at a minimum 100ms cadence',()=>{
 assert.match(html,/if\(void3State\.count>=5\)/);
 assert.match(html,/void3State\.nextBasicAt=realTime\+\.10/);
 assert.match(html,/if\(void3Pvp\.count>=5\)/);
 assert.match(html,/void3Pvp\.nextBasicAt=now\+100/);
 assert.match(html,/const step=void3State\.count%5/);
 assert.match(html,/const step=void3Pvp\.count%5/);
});

test('only the opener stuns; follow-ups bypass shields without moving the target',()=>{
 assert.match(html,/applyEnemyStun\(target,target\.kind==='boss'\?\.28:\.62\)/);
 assert.match(html,/hitEnemy\(target,damageValue\(mult,'gravityCut'\),false,player,\{stun:0,bypassShield:true,noHitstop:true\}\)/);
 assert.match(html,/if\(!controlOverride\?\.noHitstop\)hitstop=Math\.max/);
 assert.match(html,/arcAttack\(reach,pvpSkillAttack\(me,'gravityCut'\)\*mult,arc,0,0,\{color:'#a76cff',fx:false,teleportHit:hit,bypassShield:true\}\)/);
});

test('Void 3 ends on real damage in both shared world and arena PVP',()=>{
 assert.match(html,/if\(msg\.damage>0\)\{if\(void3State\)endVoid3World\(\)/);
 assert.match(html,/const d=damageTaken\(raw\);if\(void3Pvp\)void3Pvp=null;/);
});

test('Void 3 keeps the requested movement rules',()=>{
 assert.match(html,/const sprint=!void3State&&/);
 assert.match(html,/\*\(void3State\?\.5:1\)/);
 assert.match(html,/const sprint=!void3Pvp&&/);
 assert.match(html,/\*\(void3Pvp\?\.5:1\)/);
 assert.match(html,/dash\(\)\{if\(void3State\?\.exitDash\)void3State\.exitDash=null/);
 assert.match(html,/dash\(\)\{if\(void3Pvp\?\.exitDash\)void3Pvp\.exitDash=null/);
});

test('per-level damage growth is 2.55',()=>{
 assert.match(html,/PLAYER_DAMAGE_PER_LEVEL=2\.55/);
});


test('tracked target lookup avoids rebuilding all combat targets every frame',()=>{
 assert.match(html,/let target=enemies\.find\(e=>e\.id===id\)\|\|worldPlayerTargets\.get\(id\)\|\|null/);
 assert.match(html,/if\(void3State&&realTime>=void3State\.until\)endVoid3World\(\);updateVoid3WorldExitDash\(dt\)/);
});

test('ending Void 3 does not clear unrelated stun or movement locks',()=>{
 assert.match(html,/function endVoid3World\(\)\{void3State=null;\}/);
 assert.match(html,/function endVoid3Pvp\(\)\{void3Pvp=null;\}/);
 assert.doesNotMatch(html,/function endVoid3World\(\)[\s\S]{0,120}moveLock=0/);
 assert.doesNotMatch(html,/function endVoid3Pvp\(\)[\s\S]{0,120}moveLock=0/);
});
