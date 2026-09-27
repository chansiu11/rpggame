import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('Void 3 drops its movement slow immediately when the tracked target is gone',()=>{
 assert.match(html,/function void3WorldTarget\(\)/);
 assert.match(html,/if\(void3State&&\(realTime>=void3State\.until\|\|!void3WorldTarget\(\)\)\)endVoid3World\(\)/);
 assert.match(html,/if\(void3Pvp&&\(performance\.now\(\)>=void3Pvp\.until\|\|enemy\.hp<=0\)\)endVoid3Pvp\(\)/);
});

test('Void 3 auto-attacks every 100ms without requiring the skill key to stay held',()=>{
 assert.match(html,/nextAutoAt:realTime\+\.10/);
 assert.match(html,/void3State\.nextAutoAt=realTime\+\.10/);
 assert.match(html,/nextAutoAt:performance\.now\(\)\+100/);
 assert.match(html,/void3Pvp\.nextAutoAt=now\+100/);
 assert.doesNotMatch(html,/if\(!keys\.has\('KeyT'\)\)return false/);
 assert.doesNotMatch(html,/if\(!keys\.has\(pkey\('KeyT'\)\)\)return false/);
});

test('Void 3 follow-up animation and recovery allow the 100ms cadence',()=>{
 assert.match(html,/player\.attackDuration=player\.attackAnim=\.10;player\.attackCd=\.10/);
 assert.match(html,/me\.attackDuration=me\.attackAnim=\.10;me\.attackCd=\.10/);
 assert.match(html,/void3State\.exitDash=\{x:exit\.x,y:exit\.y,startX:strikeX,startY:strikeY,elapsed:0,max:\.08/);
 assert.match(html,/void3Pvp\.exitDash=\{x:exitX,y:exitY,startX:strikeX,startY:strikeY,elapsed:0,max:\.08/);
});

test('per-level damage growth remains 2.55',()=>{
 assert.match(html,/PLAYER_DAMAGE_PER_LEVEL=2\.55/);
});
