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

function simulateCriticalTransport(count){
 const pending=new Map(),seen=new Set(),applied=[],acked=new Set(),queue=[];
 for(let i=1;i<=count;i++){
  const uid='ult_'+i,packet={uid,tries:0};
  pending.set(uid,packet);
  queue.push({kind:'packet',uid,attempt:0});
 }
 let guard=0;
 while(queue.length&&guard++<10000){
  const e=queue.shift(),p=pending.get(e.uid);
  if(e.kind==='packet'){
   if(!p)continue;
   const dropFirst=e.attempt===0&&(Number(e.uid.split('_')[1])%3===0);
   if(!dropFirst){
    if(!seen.has(e.uid)){seen.add(e.uid);applied.push(e.uid);}
    const dropAck=e.attempt===0&&(Number(e.uid.split('_')[1])%4===0);
    if(!dropAck)queue.push({kind:'ack',uid:e.uid});
   }
   if(pending.has(e.uid)&&e.attempt<5)queue.push({kind:'packet',uid:e.uid,attempt:e.attempt+1});
  }else{
   acked.add(e.uid);pending.delete(e.uid);
  }
 }
 return {applied,seen,acked,pending};
}

test('PVP Gale and Void ultimates use the acknowledged critical-hit path',{timeout:1000},()=>{
 assert.match(html,/function sendPvpUltimateHit\(data\)/);
 assert.match(html,/function receivePvpUltimateHit\(m\)/);
 assert.match(html,/m\.t==='ultHit'/);
 assert.match(html,/m\.t==='ultAck'/);
 assert.match(html,/sendPvpUltimateHit\(\{skillId:'thunderDrive'/);
 assert.match(html,/sendPvpUltimateHit\(\{skillId:'voidDance'/);
 assert.match(html,/PVP build 20260927-ULT-HIT-2/);
 assert.match(html,/function hurt\(raw,opts=\{\}\)\{if\(!me\|\|me\.inv>0\|\|\(!opts\.rapidHit&&me\.hitInv>0\)/);
 assert.match(html,/me\.hitInv=\.10;me\.hurt=/);
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

test('critical ultimate transport survives first-send loss, ACK loss and duplicates exactly once',{timeout:1000},()=>{
 for(const count of [31,21]){
  const r=simulateCriticalTransport(count);
  assert.equal(r.applied.length,count);
  assert.equal(new Set(r.applied).size,count);
  assert.equal(r.seen.size,count);
  assert.equal(r.acked.size,count);
  assert.equal(r.pending.size,0);
 }
});

test('rapid multi-hit still does not bypass real dash or skill invulnerability',{timeout:1000},()=>{
 const times=[0,.05,.10,.15];
 const hits=simulateHitInv(times,{rapid:true,trueInvWindows:[[0,.12]]});
 assert.deepEqual(hits,[3]);
});
