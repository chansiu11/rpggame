import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

function simulateHitInv(times,{rapid=false,trueInvWindows=[]}={}){
 let hitInv=0,last=0,hits=[];
 for(let i=0;i<times.length;i++){
  const t=times[i],dt=t-last;last=t;hitInv=Math.max(0,hitInv-dt);
  const trueInv=trueInvWindows.some(([a,b])=>t>=a&&t<b);
  if(trueInv||(!rapid&&hitInv>1e-9))continue;
  hits.push(i);hitInv=.10;
 }
 return hits;
}

function simulateReliableAtk(count,{peerSupportsAck=true}={}){
 const pending=new Map(),seen=new Set(),applied=[],queue=[];
 for(let i=1;i<=count;i++){
  const uid='ult_'+i,packet={t:'atk',criticalUid:uid,attempt:0};
  if(peerSupportsAck)pending.set(uid,packet);
  queue.push(packet);
 }
 let guard=0;
 while(queue.length&&guard++<10000){
  const p=queue.shift(),n=Number(p.criticalUid.split('_')[1]);
  const firstLoss=peerSupportsAck&&p.attempt===0&&n%3===0;
  if(!firstLoss){
   if(peerSupportsAck){
    if(!seen.has(p.criticalUid)){seen.add(p.criticalUid);applied.push(p.criticalUid);}
    const ackLoss=p.attempt===0&&n%4===0;
    if(!ackLoss)pending.delete(p.criticalUid);
   }else{
    applied.push(p.criticalUid); // legacy client treats the normal atk packet once
   }
  }
  if(peerSupportsAck&&pending.has(p.criticalUid)&&p.attempt<5)queue.push({...p,attempt:p.attempt+1});
 }
 return {applied,seen,pending};
}

function pvpWeapon(savedWeapon,owned=[0,3]){
 const w=Math.floor(Number(savedWeapon)||0);
 let wi=w===4?0:Math.max(0,Math.min(3,w));
 if(wi===1||!owned.includes(wi))wi=0;
 return wi;
}

test('PVP critical ultimates stay on the legacy-compatible atk message type',{timeout:1000},()=>{
 assert.match(html,/packet=\{t:'atk',id:\+\+attackSerial,criticalUid:uid/);
 assert.match(html,/caps:\{criticalAtkAck:1\}/);
 assert.match(html,/m\.t==='atk'&&m\.criticalUid/);
 assert.match(html,/m\.t==='atkAck'\|\|m\.t==='ultAck'/);
 assert.match(html,/sendPvpUltimateHit\(\{skillId:'thunderDrive'/);
 assert.match(html,/sendPvpUltimateHit\(\{skillId:'voidDance'/);
 assert.match(html,/PVP build 20260927-ULT-DIRECT-5/);
});

test('admin sword maps to sword combat instead of hidden greatsword in PVP',{timeout:1000},()=>{
 assert.equal(pvpWeapon(4,[0,3]),0);
 assert.equal(pvpWeapon(0,[0,3]),0);
 assert.equal(pvpWeapon(3,[0,3]),3);
 assert.match(html,/savedWeapon===4\?0:clamp\(savedWeapon,0,3\)/);
});

test('PVP style skill lookup can recover a missing V-slot skill from the selected style',{timeout:1000},()=>{
 assert.match(html,/function pvpSwordSkillAt\(i,f=me\)\{if\(!f\|\|f\.weapon>=2\)return null;/);
 assert.match(html,/const style=WORLD_PVP\.style\?\.\(f\.swordStyle\|\|''\),id=style\?\.skills\?\.\[i\]/);
 assert.match(html,/skills:\['windSlash','flashRush','galeOrbit','starRush','thunderDrive'\]/);
 assert.match(html,/skills:\['chainReap','phantomSwap','gravityCut','bladeRain','voidDance'\]/);
});

test('Gale fifth skill accepts every rapid hit including the finisher',{timeout:1000},()=>{
 const times=[0,...Array.from({length:30},(_,i)=>.70+i*.05)];
 const oldLike=simulateHitInv(times,{rapid:false});
 const fixed=simulateHitInv(times,{rapid:true});
 assert.equal(oldLike.length,16);
 assert.equal(oldLike.includes(times.length-1),false);
 assert.equal(fixed.length,31);
 assert.equal(fixed.includes(times.length-1),true);
});

test('Void fifth skill is stable across 100ms cadence jitter',{timeout:1000},()=>{
 const times=[0];let t=0;
 for(let i=1;i<=20;i++){t+=i%2?.096:.104;times.push(t);}
 assert.equal(simulateHitInv(times,{rapid:false}).length,11);
 assert.equal(simulateHitInv(times,{rapid:true}).length,21);
});

test('updated peers survive loss and duplicate retries exactly once',{timeout:1000},()=>{
 for(const count of [31,21]){
  const r=simulateReliableAtk(count,{peerSupportsAck:true});
  assert.equal(r.applied.length,count);
  assert.equal(new Set(r.applied).size,count);
  assert.equal(r.pending.size,0);
 }
});

test('legacy peers still receive one normal atk instead of an unknown ultimate message',{timeout:1000},()=>{
 for(const count of [31,21]){
  const r=simulateReliableAtk(count,{peerSupportsAck:false});
  assert.equal(r.applied.length,count);
 }
});

test('rapid multi-hit still does not bypass real dash or skill invulnerability',{timeout:1000},()=>{
 const times=[0,.05,.10,.15];
 const hits=simulateHitInv(times,{rapid:true,trueInvWindows:[[0,.12]]});
 assert.deepEqual(hits,[3]);
});


test('Gale and Void V-slot ultimates use the direct PVP startup path',{timeout:1000},()=>{
 assert.match(html,/function resolvePvpStyleUltimate\(f=me\)/);
 assert.match(html,/if\(i===4\)\{const ult=resolvePvpStyleUltimate\(me\);if\(ult&&skillReady\(i\)\)/);
 assert.match(html,/startSwordSequence\(i,a,ult\)/);
 assert.match(html,/function startSwordSequence\(i,preparedA=null,forcedSkill=null\)/);
});
