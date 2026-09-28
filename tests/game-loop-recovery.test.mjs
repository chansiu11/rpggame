import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('world loop recovers instead of opening a permanent blocking modal',()=>{
 assert.match(html,/function recoverGameLoop\(error\)/);
 const p=html.indexOf('function frame(stamp)');
 const q=html.indexOf('// QA hooks',p);
 const frame=html.slice(p,q);
 assert.match(frame,/catch\(error\)\{recoverGameLoop\(error\);\}/);
 assert.doesNotMatch(frame,/showMessage\('잠시 멈췄습니다'/);
});

test('combat recovery clears transient Void 3 and movement locks',()=>{
 const p=html.indexOf('function recoverGameLoop(error)');
 const q=html.indexOf('function frame(stamp)',p);
 const src=html.slice(p,q);
 assert.match(src,/if\(void3State\)endVoid3World\(\)/);
 assert.match(src,/cancelSwordSkill\(\)/);
 assert.match(src,/worldForce=null/);
 assert.match(src,/player\.moveLock=0/);
});

test('PVP loop also survives transient combat exceptions',()=>{
 assert.match(html,/function recoverPvpLoop\(error\)/);
 const p=html.indexOf('function loop(t)',html.indexOf('const ONLINE_PVP_V2=true'));
 const q=html.indexOf("$('pvpBtn')",p);
 const loop=html.slice(p,q);
 assert.match(loop,/try\{if\(running\)update\(dt\);render\(\)\}catch\(error\)\{recoverPvpLoop\(error\)\}/);
});
