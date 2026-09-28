import {parentPort,workerData} from 'node:worker_threads';
import {duel} from './self-play.js';
import {learn,styles} from './brain.js';
const saved=workerData.checkpoint,policy=structuredClone(saved?.policy||workerData.policy),baseline=structuredClone(saved?.baseline||workerData.policy),ids=Object.keys(styles),batch=workerData.batch||25;
const gate=workerData.control?new Int32Array(workerData.control):null;
function permit(){if(!gate)return;while(Atomics.load(gate,0)===0)Atomics.wait(gate,0,0,1000);if(Atomics.load(gate,0)===2)process.exit(0);}
function checkpoint(completed,evaluation){if(workerData.device)parentPort.postMessage({checkpoint:{schema:1,batch,completed,policy:structuredClone(policy),baseline,evaluation}});}
const nap=new Int32Array(new SharedArrayBuffer(4));
function cool(start){if(workerData.device){const delay=Math.max(500,(performance.now()-start)*3);Atomics.wait(nap,0,0,Math.min(10000,delay));}}
for(let i=saved?.completed||0;i<batch;i++){
 permit();const start=performance.now(),n=policy.matches,a=ids[n%3],b=ids[Math.floor(n/3)%3],r=duel(a,b,policy,i%4===0?baseline:policy,n+7,90,permit);
 learn(policy,a,r.results[0].tactic,r.results[0]);if(i%4!==0)learn(policy,b,r.results[1].tactic,r.results[1]);policy.matches++;
 parentPort.postMessage({progress:policy.matches});checkpoint(i+1,null);cool(start);
}
let {wins=0,losses=0,draws=0,completed=0}=saved?.evaluation||{};const rounds=18;
for(let i=completed;i<rounds;i++){
 permit();const start=performance.now(),a=ids[i%3],b=ids[Math.floor(i/3)%3],swap=i>=9;
 const r=swap?duel(b,a,baseline,policy,10000+i%9,90,permit):duel(a,b,policy,baseline,10000+i%9,90,permit);
 if(r.winner<0)draws++;else if(r.winner===(swap?1:0))wins++;else losses++;
 checkpoint(batch,{wins,losses,draws,completed:i+1});cool(start);
}
const accepted=wins>=losses;
if(!accepted)for(const id of ids)policy.styles[id].weights=baseline.styles[id].weights;
policy.generation++;policy.evaluation={wins,losses,draws,rounds,accepted,againstGeneration:baseline.generation,at:new Date().toISOString()};
parentPort.postMessage({policy});
