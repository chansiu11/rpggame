import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../multiplayer-server/server.js',import.meta.url),'utf8');
function source(name){const a=html.indexOf('function '+name+'(');assert.ok(a>=0,'missing '+name);const b=html.indexOf('\nfunction ',a+1);return html.slice(a,b<0?html.length:b);}
function branch(fn){const s=source(fn),a=s.indexOf("else if(mode==='dawnReboundZ')"),b=s.indexOf("else if(mode==='earthSlam')",a);assert.ok(a>=0&&b>a);return s.slice(a,b);}

test('Dawn 2 world FX continues through the Z dash',()=>{
 const s=branch('updateSwordSkillMotion');
 assert.match(s,/seq\.elapsed<cfg\.duration/);
 assert.match(s,/seq\.fx=\.055/);
 assert.match(s,/type:'dawnZTrace'/);
 assert.match(s,/type:'dawnEchoCut'/);
 assert.match(s,/t:\.15,max:\.15/);
});

test('Dawn 2 PvP FX continues and is relayed to the peer',()=>{
 const s=branch('pvpWorldSwordMotion');
 assert.match(s,/ev\.elapsed<cfg\.duration/);
 assert.match(s,/ev\.fx=\.055/);
 assert.match(s,/kind:'dawnZTrace'/);
 assert.match(s,/kind:'dawnEchoCut'/);
 assert.ok((s.match(/},true\);/g)||[]).length>=2);
});

test('Dawn 2 startup and trail lifetimes overlap until the dash ends',()=>{
 const startup=source('swordSkillStartVisuals');
 assert.match(startup,/sk\.id==='tempest'[\s\S]*t:\.24,max:\.24/);
 const duration=.42,startupEnd=.24,firstTrail=.10,interval=.055,trailLife=.15;
 let covered=startupEnd;
 for(let t=firstTrail;t<duration;t+=interval){assert.ok(t<=covered+1e-9);covered=Math.max(covered,t+trailLife);}
 assert.ok(covered>=duration);
});


test('Dawn 2 PvP uses swept segment probes for high-speed Z movement',()=>{
 const s=source('pvpWorldSwordHit'),a=s.indexOf("else if(mode==='dawnReboundZ')"),b=s.indexOf("else if(mode==='earthSlam')",a),branch=s.slice(a,b);
 assert.match(branch,/shape:'segment'/);
 assert.match(branch,/x1,y1,x2,y2,r/);
 assert.match(branch,/reach\*\.38/);
 assert.doesNotMatch(branch,/shape:'arc'/);
});

test('Dawn 2 PvP has dedicated reliable visual packets for startup and trail',()=>{
 assert.match(html,/t:'dawnReboundFx'/);
 assert.match(html,/m\.t==='dawnReboundFx'/);
 assert.match(html,/pvpDawnReboundVisualFx\('trail'/);
 assert.match(html,/pvpDawnReboundVisualFx\('bind'/);
 assert.match(html,/pvpDawnReboundVisualFx\('resolve'/);
 assert.match(html,/world-combat-20261002-pvp-basic-v5/);
});


test('Dawn 2 PvP client and relay server advertise the same v5 ruleset',()=>{
 assert.match(html,/world-combat-20261002-pvp-basic-v5/);
 assert.match(server,/const PVP_RULESET = 'world-combat-20261002-pvp-basic-v5'/);
});
