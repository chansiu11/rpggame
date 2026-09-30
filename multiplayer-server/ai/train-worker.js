import {parentPort,workerData} from 'node:worker_threads';
import {duel} from './self-play.js';
import {learn,styles,leastTrainedPair} from './brain.js';

let saved=workerData.checkpoint||null;
let policy=structuredClone(saved?.policy||workerData.policy);
let baseline=structuredClone(saved?.baseline||workerData.policy);
const ids=Object.keys(styles);
const gate=workerData.control?new Int32Array(workerData.control):null;
const watch=workerData.watch?new Int32Array(workerData.watch):null;
const tuning=workerData.tuning?new Int32Array(workerData.tuning):null;
const nap=new Int32Array(new SharedArrayBuffer(4));
let cycle=0,burstProgress=0;

function permit(){
 if(!gate)return;
 while(Atomics.load(gate,0)===0)Atomics.wait(gate,0,0,1000);
 if(Atomics.load(gate,0)===2)process.exit(0);
}
function burstSize(){return Math.max(1,Math.min(100,tuning?Atomics.load(tuning,1):3));}
function batchTarget(){return Math.max(25,burstSize());}
function cool(){
 if(!workerData.device)return;
 const delay=Math.max(0,Math.min(60000,tuning?Atomics.load(tuning,0):1000));
 const burst=burstSize();
 burstProgress++;
 if(burstProgress>=burst){
  burstProgress=0;
  if(delay>0)Atomics.wait(nap,0,0,delay);
 }
}
function checkpoint(batch,completed,evaluation){
 if(workerData.device)parentPort.postMessage({checkpoint:{schema:1,batch,completed,policy:structuredClone(policy),baseline:structuredClone(baseline),evaluation}});
}
function spectator(phase,match,styles,lane,laneCount){
 const emit=frame=>{
  if(!emit.enabled())return;
  // self-play already snapshots every 8 simulation frames. Keep those frames so
  // the browser can replay every training bout in its own split spectator lane.
  if(frame.final||Number(frame.step)%24===0)parentPort.postMessage({preview:{phase,match,styles,lane,laneCount,cycle,...frame}});
 };
 emit.enabled=()=>!!workerData.device&&!!watch&&Atomics.load(watch,0)===1;
 return emit;
}

for(;;){
 permit();
 let batch=saved?.batch||batchTarget();
 let completed=saved?.completed||0;

 for(let i=completed;i<batch;i++){
  permit();
  // If the user raises "continuous training" while a cycle is running, extend
  // this cycle immediately instead of waiting for a worker restart.
  batch=Math.max(batch,batchTarget());
  const burst=burstSize();
  const n=policy.matches,[a,b]=leastTrainedPair(policy);
  const lane=i%burst;
  const r=duel(a,b,policy,policy,n+7,90,permit,spectator('train',n+1,[a,b],lane,burst));
  learn(policy,a,r.results[0].tactic,r.results[0]);
  learn(policy,b,r.results[1].tactic,r.results[1]);
  policy.matches++;
  parentPort.postMessage({progress:policy.matches,pair:[a,b]});
  checkpoint(batch,i+1,null);
  cool();
 }

 let {wins=0,losses=0,draws=0,completed:evalCompleted=0}=saved?.evaluation||{};
 const rounds=32;
 for(let i=evalCompleted;i<rounds;i++){
  permit();
  const a=ids[i%ids.length],b=ids[Math.floor(i/ids.length)%ids.length],swap=i>=16;
  const pair=swap?[b,a]:[a,b];
  const r=swap
   ?duel(b,a,baseline,policy,10000+i%16,90,permit,spectator('evaluation',i+1,pair,i,rounds))
   :duel(a,b,policy,baseline,10000+i%16,90,permit,spectator('evaluation',i+1,pair,i,rounds));
  if(r.winner<0)draws++;else if(r.winner===(swap?1:0))wins++;else losses++;
  checkpoint(batch,batch,{wins,losses,draws,completed:i+1});
 }

 const accepted=wins>=losses;
 if(!accepted)for(const id of ids)policy.styles[id].weights=baseline.styles[id].weights;
 policy.generation++;
 policy.evaluation={wins,losses,draws,rounds,accepted,againstGeneration:baseline.generation,at:new Date().toISOString()};
 parentPort.postMessage({policy:structuredClone(policy),batch});

 // Keep this worker alive and continue straight into the next generation.
 // This removes the old stop/recreate gap that made "continuous training"
 // appear not to work.
 baseline=structuredClone(policy);
 saved=null;
 cycle++;
}
