import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function source(name){const a=html.indexOf('function '+name+'(');assert.ok(a>=0,'missing '+name);const b=html.indexOf('\nfunction ',a+1);return html.slice(a,b<0?html.length:b);}
function skill(id){const line=html.split('\n').find(l=>l.includes("{id:'"+id+"',name:"));assert.ok(line,'missing '+id);return vm.runInNewContext('('+line.trim().replace(/,$/,'')+')',{TAU:Math.PI*2});}
test('Dawn 5 remake uses delayed seal slash timing',()=>{const sk=skill('prismLance');assert.equal(sk.cfg.mode,'dawnJudgmentSeal');assert.equal(sk.cfg.duration,1.08);assert.deepEqual(sk.cfg.hits,[.72]);assert.deepEqual(sk.cfg.mult,[1.55]);assert.equal(sk.cfg.reach[0],280);assert.match(html,/if\(slot===4&&sk\.id==='prismLance'\)\{cfg\.duration=1\.08;cfg\.hits=\[\.72\];cfg\.mult=\[1\.55\];cfg\.arc=\[2\.78\];cfg\.reach=\[378\]/);});
test('Dawn 5 no longer resolves on keydown',()=>{const sk=skill('prismLance'),world=source('startSwordSkill'),pvp=source('startSwordSequence');assert.equal(world.includes('performSwordSkillHit(seq,0)'),false);assert.equal(pvp.includes('pvpWorldSwordHit(ev,0);me.skillEvent=null'),false);let t=0,hit=null;while(t<sk.cfg.duration&&hit===null){t+=1/240;if(t>=sk.cfg.hits[0])hit=t;}assert.ok(hit>=.72&&hit<.725);});
test('Dawn 5 applies the seal in both world and PvP hit paths',()=>{assert.ok(html.includes("activeSwordSkill?.skillId!=='prismLance'"));assert.match(source('performSwordSkillHit'),/mode==='dawnJudgmentSeal'[\s\S]*applyDawnSeal\(e\)/);assert.match(source('pvpWorldSwordHit'),/mode==='dawnJudgmentSeal'[\s\S]*onHit:startPvpDawnSeal/);});
