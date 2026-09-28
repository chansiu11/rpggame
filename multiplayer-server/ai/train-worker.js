import {parentPort,workerData} from 'node:worker_threads';
import {duel} from './self-play.js';
import {learn,styles} from './brain.js';
const policy=structuredClone(workerData.policy),baseline=structuredClone(workerData.policy),ids=Object.keys(styles),batch=workerData.batch||25;
for(let i=0;i<batch;i++){
 const n=policy.matches,a=ids[n%3],b=ids[Math.floor(n/3)%3],r=duel(a,b,policy,i%4===0?baseline:policy,n+7);
 learn(policy,a,r.results[0].tactic,r.results[0]);if(i%4!==0)learn(policy,b,r.results[1].tactic,r.results[1]);policy.matches++;
 parentPort.postMessage({progress:policy.matches});
}
let wins=0,losses=0,draws=0;const rounds=18;
for(let i=0;i<rounds;i++){
 const a=ids[i%3],b=ids[Math.floor(i/3)%3],swap=i>=9;
 const r=swap?duel(b,a,baseline,policy,10000+i%9):duel(a,b,policy,baseline,10000+i%9);
 if(r.winner<0)draws++;else if(r.winner===(swap?1:0))wins++;else losses++;
}
const accepted=wins>=losses;
if(!accepted)for(const id of ids)policy.styles[id].weights=baseline.styles[id].weights;
policy.generation++;policy.evaluation={wins,losses,draws,rounds,accepted,againstGeneration:baseline.generation,at:new Date().toISOString()};
parentPort.postMessage({policy});
