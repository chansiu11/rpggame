import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../multiplayer-server/server.js',import.meta.url),'utf8');
function source(name){const a=html.indexOf('function '+name+'(');assert.ok(a>=0,'missing '+name);const b=html.indexOf('\nfunction ',a+1);return html.slice(a,b<0?html.length:b);}
function skill(id){const line=html.split('\n').find(l=>l.includes("{id:'"+id+"',name:"));assert.ok(line,'missing '+id);return vm.runInNewContext('('+line.trim().replace(/,$/,'')+')',{TAU:Math.PI*2});}
function branch(fn,start,end){const s=source(fn),a=s.indexOf(start),b=s.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,'missing branch '+start);return s.slice(a,b);}

test('Dawn remake keeps the five test-server skills in production slots',()=>{
 const ids=['dawnArc','tempest','skyFall','solarReturn','prismLance'];
 const expected=[['dawnWave',.72,[.28]],['dawnReboundZ',.42,[.035,.105,.185,.31]],['skyFall',1,[.78]],['dawnStillSun',.52,[.055,.135,.215,.305,.42]],['dawnJudgmentSeal',1.08,[.72]]];
 const styleLine=html.split('\n').find(l=>l.includes("{id:'dawn',name:'여명 유파'"));
 assert.ok(styleLine);
 const style=vm.runInNewContext('('+styleLine.trim().replace(/,$/,'')+')');
 assert.deepEqual(style.skills,ids);
 ids.forEach((id,i)=>{const s=skill(id);assert.equal(s.cfg.mode,expected[i][0]);assert.equal(s.cfg.duration,expected[i][1]);assert.deepEqual(s.cfg.hits,expected[i][2]);});
});

test('Solar Return remains stationary in world and PvP',()=>{
 const world=branch('updateSwordSkillMotion',"else if(mode==='dawnStillSun')","else if(mode==='dawnJudgmentSeal')");
 const pvp=branch('pvpWorldSwordMotion',"else if(mode==='dawnStillSun')","else if(mode==='dawnJudgmentSeal')");
 assert.equal(world.includes('moveBody('),false);
 assert.equal(pvp.includes('me.x+='),false);
 assert.equal(pvp.includes('me.y+='),false);
});

test('server style-adept copy uses the same delayed Dawn 5 timing',()=>{
 assert.match(server,/"prismLance":\{"id":"prismLance","name":"천명 · 광륜심판","slot":4,"hold":false,"damageScale":0\.58,"cfg":\{"duration":1\.08,"hits":\[0\.72\]/);
});
