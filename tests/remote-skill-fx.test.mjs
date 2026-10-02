import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf('function renderRemoteSkillFx('),end=html.indexOf('\nfunction ',start+1),code=html.slice(start,end).replace('function renderRemoteSkillFx(', 'function applyRemoteSkillFx(');
function fixture(){const rp={lastSkillFxSeq:4},effects=[];let signatures=0;const c={multiplayerMode:true,window:{EchoesMulti:{state:{selfId:'me'}}},multiRemotePlayers:new Map([['other',rp]]),realTime:10,clamp:(x,a,b)=>Math.max(a,Math.min(b,x)),effects,TAU:Math.PI*2,BLACK_MOON_SKILL_IDS:new Set(),SWORD_STYLE_FX:{gale:{main:'#fff',sub:'#fff',accent:'#fff'}},HIDDEN_SKILLS:[],SKILLS:[],swordSkillById:id=>['windSlash','prismLance'].includes(id)?{id}:null,swordStyleFxForSkill:()=>({main:'#ffd95c',sub:'#fffbe8',accent:'#fff29a'}),replayRemoteSwordSignature:()=>signatures++,ring:()=>effects.push({type:'ring'}),burst:()=>{},remoteSwordSkillId:()=>''};vm.createContext(c);vm.runInContext(code,c);return {c,rp,effects,get signatures(){return signatures;},run:msg=>c.applyRemoteSkillFx({playerId:'other',fxSeq:4,skillId:'prismLance',slot:4,weapon:0,x:100,y:100,a:0,...msg})};}
test('remote Dawn 5 packets show the charging halo instead of an early finisher slash',()=>{const f=fixture();f.run();assert.ok(f.effects.some(e=>e.type==='dawnGenesisHalo'));assert.equal(f.effects.some(e=>e.type==='riftCut'),false);const count=f.effects.length;f.run();f.run({fxSeq:3});assert.equal(f.effects.length,count);f.run({fxSeq:5});assert.ok(f.effects.length>count);});
test('ordinary sword, bow and hidden skill packets still reach visual handlers',()=>{const f=fixture();f.run({skillId:'windSlash'});assert.equal(f.signatures,1);for(const [seq,id,weapon] of [[5,'bow:1',2],[6,'hidden:2',3]]){const before=f.effects.length;f.run({fxSeq:seq,skillId:id,weapon});assert.ok(f.effects.length>before);}});
