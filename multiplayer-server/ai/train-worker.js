import {parentPort,workerData} from 'node:worker_threads';
import {duel} from './self-play.js';
import {learn,styles,leastTrainedPair} from './brain.js';
const saved=workerData.checkpoint,policy=structuredClone(saved?.policy||workerData.policy),baseline=structuredClone(saved?.baseline||workerData.policy),ids=Object.keys(styles),batch=workerData.batch||25;
const gate=workerData.control?new Int32Array(workerData.control):null;
function permit(){if(!gate)return;while(Atomics.load(gate,0)===0)Atomics.wait(gate,0,0,1000);if(Atomics.load(gate,0)===2)process.exit(0);}
function checkpoint(completed,evaluation){if(workerData.device)parentPort.postMessage({checkpoint:{schema:1,batch,completed,policy:structuredClone(policy),baseline,evaluation}});}
const nap=new Int32Array(new SharedArrayBuffer(4));
function cool(start){if(workerData.device){const delay=Math.max(500,(performance.now()-start)*3);Atomics.wait(nap,0,0,Math.min(10000,delay));}}
const watch=workerData.watch?new Int32Array(workerData.watch):null;
function spectator(phase,match,styles){
 let last=-Infinity;
 const emit=frame=>{
  if(!emit.enabled())return;
  const at=performance.now();
  if(!frame.final&&at-last<70)return;last=at;
  parentPort.postMessage({preview:{phase,match,styles,...frame}});
 };
 emit.enabled=()=>!!workerData.device&&!!watch&&Atomics.load(watch,0)===1;
 return emit;
}
for(let i=saved?.completed||0;i<batch;i++){
 permit();const start=performance.now(),n=policy.matches,[a,b]=leastTrainedPair(policy),r=duel(a,b,policy,policy,n+7,90,permit,spectator('train',n+1,[a,b]));
 // Both selected AIs train in each bout; the frozen baseline is evaluation-only.
 learn(policy,a,r.results[0].tactic,r.results[0]);learn(policy,b,r.results[1].tactic,r.results[1]);policy.matches++;
 parentPort.postMessage({progress:policy.matches});checkpoint(i+1,null);cool(start);
}
let {wins=0,losses=0,draws=0,completed=0}=saved?.evaluation||{};const rounds=32;
for(let i=completed;i<rounds;i++){
 permit();const start=performance.now(),a=ids[i%ids.length],b=ids[Math.floor(i/ids.length)%ids.length],swap=i>=16;
 const r=swap?duel(b,a,baseline,policy,10000+i%16,90,permit,spectator('evaluation',i+1,[b,a])):duel(a,b,policy,baseline,10000+i%16,90,permit,spectator('evaluation',i+1,[a,b]));
 if(r.winner<0)draws++;else if(r.winner===(swap?1:0))wins++;else losses++;
 checkpoint(batch,{wins,losses,draws,completed:i+1});cool(start);
}
const accepted=wins>=losses;
if(!accepted)for(const id of ids)policy.styles[id].weights=baseline.styles[id].weights;
policy.generation++;policy.evaluation={wins,losses,draws,rounds,accepted,againstGeneration:baseline.generation,at:new Date().toISOString()};
parentPort.postMessage({policy});
