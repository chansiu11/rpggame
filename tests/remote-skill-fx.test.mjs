import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf('function applyRemoteSkillFx('),end=html.indexOf('\nfunction ',start+1),code=html.slice(start,end);
function fixture(){const rp={lastSkillFxSeq:4},effects=[];let signatures=0;const c={multiplayerMode:true,window:{EchoesMulti:{state:{selfId:'me'}}},multiRemotePlayers:new Map([['other',rp]]),realTime:10,clamp:(x,a,b)=>Math.max(a,Math.min(b,x)),effects,TAU:Math.PI*2,HIDDEN_SKILLS:[],SKILLS:[],swordSkillById:id=>['windSlash','prismLance'].includes(id)?{id}:null,swordStyleFxForSkill:()=>({main:'#fff',sub:'#fff',accent:'#fff'}),replayRemoteSwordSignature:()=>signatures++,ring:()=>effects.push({type:'ring'}),burst:()=>{},remoteSwordSkillId:()=>''};vm.createContext(c);vm.runInContext(code,c);return {c,rp,effects,get signatures(){return signatures;},run:msg=>c.applyRemoteSkillFx({playerId:'other',fxSeq:4,skillId:'prismLance',slot:4,weapon:0,x:100,y:100,a:0,...msg})};}
test('sequenced ultimate packets render even when state merge already recorded the sequence, only once',()=>{const f=fixture();f.run();assert.ok(f.effects.some(e=>e.type==='riftCut'));const count=f.effects.length;f.run();f.run({fxSeq:3});assert.equal(f.effects.length,count);f.run({fxSeq:5});assert.ok(f.effects.length>count);});
test('sequenced ordinary sword, bow and hidden skills all reach visual handlers',()=>{const f=fixture();f.run({skillId:'windSlash'});assert.equal(f.signatures,1);for(const [seq,id,weapon] of [[5,'bow:1',2],[6,'hidden:2',3]]){const before=f.effects.length;f.run({fxSeq:seq,skillId:id,weapon});assert.ok(f.effects.length>before);}});
