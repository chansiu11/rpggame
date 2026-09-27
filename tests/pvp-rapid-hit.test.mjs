import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

function simulate(times,{rapid=false,trueInvWindows=[]}={}){
 let hitInv=0,last=0,hits=[];
 for(let i=0;i<times.length;i++){
  const t=times[i],dt=t-last;last=t;hitInv=Math.max(0,hitInv-dt);
  const trueInv=trueInvWindows.some(([a,b])=>t>=a&&t<b);
  if(trueInv||(!rapid&&hitInv>1e-9))continue;
  hits.push(i);hitInv=.10;
 }
 return hits;
}

test('PVP Gale and Void ultimates mark only their rapid multi-hits',{timeout:1000},()=>{
 assert.match(html,/controlLease:'galePursuit',controlLeaseMs:1600,rapidHit:true/);
 assert.match(html,/controlLease:'galePursuit',controlLeaseMs:1400,rapidHit:true/);
 assert.match(html,/controlLease:'voidDance',controlLeaseMs:1100,rapidHit:true/);
 assert.match(html,/function segmentAttack\([^\n]+rapidHit:!!extra\.rapidHit/);
 assert.match(html,/function hurt\(raw,opts=\{\}\)\{if\(!me\|\|me\.inv>0\|\|\(!opts\.rapidHit&&me\.hitInv>0\)/);
 assert.match(html,/me\.hitInv=\.10;me\.hurt=/);
});

test('Gale fifth skill accepts every configured rapid hit including the finisher',{timeout:1000},()=>{
 const times=[0,...Array.from({length:30},(_,i)=>.70+i*.05)];
 const oldLike=simulate(times,{rapid:false});
 const fixed=simulate(times,{rapid:true});
 assert.equal(oldLike.length,16);
 assert.equal(oldLike.includes(times.length-1),false);
 assert.equal(fixed.length,31);
 assert.equal(fixed.includes(times.length-1),true);
});

test('Void fifth skill is stable across 100ms cadence jitter',{timeout:1000},()=>{
 const times=[0];let t=0;
 for(let i=1;i<=20;i++){t+=i%2?.096:.104;times.push(t);}
 assert.equal(simulate(times,{rapid:false}).length,11);
 assert.equal(simulate(times,{rapid:true}).length,21);
});

test('rapid multi-hit does not bypass real dash or skill invulnerability',{timeout:1000},()=>{
 const times=[0,.05,.10,.15];
 const hits=simulate(times,{rapid:true,trueInvWindows:[[0,.12]]});
 assert.deepEqual(hits,[3]);
});
