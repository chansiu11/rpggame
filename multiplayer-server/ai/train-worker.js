import {parentPort,workerData} from 'node:worker_threads';
import {createDuelSession} from './self-play.js';
import {learn,styles,leastTrainedPair,recordMatchup,stylePairs,ensurePolicyStyles} from './brain.js';

let saved=workerData.checkpoint||null;
let policy=ensurePolicyStyles(structuredClone(saved?.policy||workerData.policy));
let baseline=ensurePolicyStyles(structuredClone(saved?.baseline||workerData.policy));
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
// Four simultaneous bouts keeps the free server within a practical memory
// budget while making the spectator show several genuinely active fights.
function parallelBattles(){return Math.max(1,Math.min(4,burstSize()));}
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
  if(frame.final||Number(frame.step)%24===0)parentPort.postMessage({preview:{phase,match,styles,lane,laneCount,cycle,...frame}});
 };
 emit.enabled=()=>!!workerData.device&&!!watch&&Atomics.load(watch,0)===1;
 return emit;
}
function plannedPair(planner){
 const [a,b]=leastTrainedPair(planner);
 planner.styles[a].games++;
 planner.styles[b].games++;
 recordMatchup(planner,a,b);
 planner.matches++;
 return [a,b];
}
function runConcurrent(configs){
 const active=configs.map(c=>({...c,session:createDuelSession(c.a,c.b,c.policyA,c.policyB,c.seed,90,()=>{},c.watch,{explore:c.explore===true}),result:null}));
 let remaining=active.length;
 try{
  while(remaining>0){
   permit();
   for(const item of active){
    if(item.result)continue;
    item.session.step();
    if(item.session.done){item.result=item.session.result;remaining--;}
   }
  }
  return active;
 }finally{
  for(const item of active)item.session.dispose();
 }
}

for(;;){
 permit();
 let batch=saved?.batch||batchTarget();
 let completed=saved?.completed||0;

 while(completed<batch){
  permit();
  batch=Math.max(batch,batchTarget());
  const lanes=parallelBattles(),count=Math.min(lanes,batch-completed);
  const planner=structuredClone(policy),wavePolicy=structuredClone(policy),startMatch=policy.matches;
  const configs=[];
  for(let j=0;j<count;j++){
   const [a,b]=plannedPair(planner),match=startMatch+j+1;
   configs.push({a,b,policyA:wavePolicy,policyB:wavePolicy,seed:startMatch+j+7,watch:spectator('train',match,[a,b],j,lanes),explore:true});
  }
  const finished=runConcurrent(configs);
  for(const item of finished){
   const {a,b,result:r}=item;
   learn(policy,a,r.results[0].training,r.results[0]);
   learn(policy,b,r.results[1].training,r.results[1]);
   recordMatchup(policy,a,b);
   policy.matches++;
   completed++;
   parentPort.postMessage({progress:policy.matches,pair:[a,b],parallel:lanes});
   checkpoint(batch,completed,null);
   cool();
  }
 }

 let {wins=0,losses=0,draws=0,completed:evalCompleted=0}=saved?.evaluation||{};
 const evalPairs=stylePairs(),evalRepeats=2,rounds=evalPairs.length*2*evalRepeats;
 while(evalCompleted<rounds){
  permit();
  const lanes=parallelBattles(),count=Math.min(lanes,rounds-evalCompleted),configs=[];
  for(let j=0;j<count;j++){
   const i=evalCompleted+j,pairIndex=i%evalPairs.length,phase=Math.floor(i/evalPairs.length),swap=phase%2===1,repeat=Math.floor(phase/2);
   const base=evalPairs[pairIndex],pair=swap?[base[1],base[0]]:base;
   configs.push({
    a:pair[0],b:pair[1],
    policyA:swap?baseline:policy,policyB:swap?policy:baseline,
    seed:10000+repeat*1000+pairIndex,swap,
    watch:spectator('evaluation',i+1,pair,j,lanes)
   });
  }
  const finished=runConcurrent(configs);
  for(const item of finished){
   const r=item.result,swap=item.swap;
   if(r.winner<0)draws++;else if(r.winner===(swap?1:0))wins++;else losses++;
   evalCompleted++;
   checkpoint(batch,batch,{wins,losses,draws,completed:evalCompleted});
  }
 }

 const accepted=wins>=losses;
 if(!accepted)for(const id of ids){
  policy.styles[id].network=structuredClone(baseline.styles[id].network);
  policy.styles[id].sigma=baseline.styles[id].sigma;
  policy.styles[id].learningRate=baseline.styles[id].learningRate;
  policy.styles[id].rewardMean=baseline.styles[id].rewardMean;
 }
 policy.generation++;
 policy.evaluation={wins,losses,draws,rounds,accepted,againstGeneration:baseline.generation,at:new Date().toISOString()};
 parentPort.postMessage({policy:structuredClone(policy),batch});

 baseline=structuredClone(policy);
 saved=null;
 cycle++;
}
