import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {styles,seedPolicy,ensurePolicyStyles,leastTrainedPair} from '../multiplayer-server/ai/brain.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const html=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');

test('Black Moon is a trainable neural self-play style',()=>{
 assert.equal(styles.moon?.name,'흑월');
 const seeded=seedPolicy();
 assert.ok(seeded.styles.moon?.network,'seed policy must include a Black Moon network');
 assert.equal(seeded.styles.moon.games,0);
});

test('legacy neural policies are hydrated with Black Moon without deleting learned styles',()=>{
 const legacy=seedPolicy();
 const galeNetwork=legacy.styles.gale.network;
 delete legacy.styles.moon;
 const hydrated=ensurePolicyStyles(legacy);
 assert.ok(hydrated.styles.moon?.network,'missing Black Moon network must be created');
 assert.equal(hydrated.styles.gale.network,galeNetwork,'existing learned networks must be preserved');
});

test('least-trained self-play rotation can select Black Moon',()=>{
 const p=seedPolicy();
 for(const [id,s] of Object.entries(p.styles))s.games=id==='moon'?0:100;
 const pair=leastTrainedPair(p);
 assert.ok(pair.includes('moon'),`expected moon in least-trained pair, got ${pair.join(',')}`);
});

test('Black Moon world FX uses deterministic reliable replay instead of sparse exact suppression',()=>{
 assert.match(html,/const deterministicBlackMoon=BLACK_MOON_SKILL_IDS\.has\(String\(multiSkillFxState\.skillId\|\|''\)\)/);
 const render=html.indexOf("if(BLACK_MOON_SKILL_IDS.has(id)){replayRemoteSwordSignature");
 const suppress=html.indexOf("if(rp&&(rp.remoteExactFxUntil||0)>realTime)return;",render);
 assert.ok(render>=0&&suppress>render,'Black Moon replay must run before exact-FX suppression');
 assert.match(html,/const replayGap=BLACK_MOON_SKILL_IDS\.has\(id\)\?\.072:\.115/);
});

test('PVP forced landing rejects delayed snap-back until two landing confirmations',()=>{
 assert.match(html,/remoteForceLandingUntil=performance\.now\(\)\+1800/);
 assert.match(html,/remoteForceLandingConfirm=landingNear\?\(enemy\.remoteForceLandingConfirm\|\|0\)\+1:0/);
 assert.match(html,/\(enemy\.remoteForceLandingConfirm\|\|0\)<2/);
 assert.match(html,/landingDist<=120/);
});

test('Black Moon style group and all five skills remain wired into the main game',()=>{
 assert.match(html,/\{id:'moon',name:'흑월 유파'/);
 for(const id of ['moonSpin','mirrorStep','crossBloom','crescent','lunarBind']){
  assert.match(html,new RegExp("\\{id:'"+id+"'"));
 }
});
