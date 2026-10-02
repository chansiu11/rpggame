import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../multiplayer-server/server.js',import.meta.url),'utf8');
function source(name){const a=html.indexOf('function '+name+'(');assert.ok(a>=0,'missing '+name);const b=html.indexOf('\nfunction ',a+1);return html.slice(a,b<0?html.length:b);}\nfunction sourceLast(name){const a=html.lastIndexOf('function '+name+'(');assert.ok(a>=0,'missing '+name);const b=html.indexOf('\nfunction ',a+1);return html.slice(a,b<0?html.length:b);}

test('Dawn 1 PvP uses rpggametest wave rod and knockback control',()=>{
 const hit=source('pvpWorldSwordHit'),send=source('sendProjectile'),render=sourceLast('render');
 assert.match(hit,/mode==='dawnWave'[\s\S]*wave=window\.EchoesCombat\.waveControl/);
 assert.match(hit,/force:wave\.force/);
 assert.match(hit,/stun:wave\.stun/);
 assert.match(hit,/r:wave\.r/);
 assert.match(hit,/visualLen:48/);
 assert.match(hit,/skillId:'dawnArc'/);
 assert.match(send,/skillId:String\(opts\.skillId/);
 assert.match(render,/p\.skillId==='dawnArc'/);
});

test('Dawn 4 PvP uses crossing echo cuts then Sun Fold circle burst',()=>{
 const fx=source('pvpSwordSignatureFx');
 assert.match(fx,/id==='solarReturn'/);
 assert.match(fx,/kind:'dawnEchoCut'/);
 assert.match(fx,/cross:1/);
 assert.match(fx,/kind:'dawnSunFold'/);
 assert.match(fx,/nova\(cx,cy,118/);
});

test('Dawn 5 PvP uses large halo, 660-length Genesis Cut and reactive seal glyph',()=>{
 const start=source('startSwordSequence'),hit=source('pvpSwordSignatureFx'),seal=source('startPvpDawnSeal'),stack=source('recordPvpDawnSealDamage'),renderFx=source('renderFx');
 assert.match(start,/kind:'dawnGenesisHalo'/);
 assert.doesNotMatch(start,/sk\.id==='prismLance'[\s\S]{0,500}for\(let j=0;j<12;j\).*beamFx/);
 assert.match(hit,/id==='prismLance'[\s\S]*kind:'dawnGenesisCut'[\s\S]*len:660/);
 assert.match(seal,/kind:'dawnSealGlyph'/);
 assert.match(stack,/kind:'dawnSealGlyph'/);
 assert.match(renderFx,/f\.kind==='dawnSealGlyph'/);
 assert.match(renderFx,/f\.kind==='dawnGenesisCut'/);
});

test('PvP client and server advertise the same Dawn parity ruleset',()=>{
 assert.match(html,/PVP_PROTOCOL=6/);
 assert.match(html,/world-combat-20261002-dawn-test-parity-v6/);
 assert.match(server,/const PVP_RULESET = 'world-combat-20261002-dawn-test-parity-v6'/);
});
