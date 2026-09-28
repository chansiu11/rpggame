import {createArena} from './arena-runtime.js';
import {createBrain,rng} from './brain.js';
export function duel(styleA,styleB,policyA,policyB,seed=1,seconds=90){
 const a=createArena({style:styleA}),b=createArena({style:styleB});const arenas=[a,b],metrics=arenas.map(()=>({attempts:0,hits:0,misses:0,defenses:0,evades:0,parries:0,comboHits:0,lowResourceFrames:0,frames:0,damage:0})),queue=[];
 for(let i=0;i<2;i++)arenas[i].api.init(arenas[i].snapshot,arenas[1-i].snapshot,i===0,m=>{
 if(m.t==='atk')metrics[i].attempts++;
 if(m.t==='attackResult'){const target=metrics[1-i];if(m.result==='hit'){target.hits++;if(arenas[1-i].api.me.combo>1)target.comboHits++;}else if(m.result==='miss')target.misses++;else if(m.result==='parried')metrics[i].parries++;else if(m.result==='blocked')metrics[i].defenses++;else if(m.result==='ignored')metrics[i].evades++;}
 // Visual-only traffic is discarded in training, combat messages are unchanged.
 if(!['fxBatch','ping','pong','skillShake','galePulseShake'].includes(m.t))queue.push([1-i,structuredClone(m)]);
 });
 const brains=[createBrain(styleA,policyA,rng(seed)),createBrain(styleB,policyB,rng(seed+99))];
 let steps=0;try{for(;steps<seconds*60;steps++){
 for(let i=0;i<2;i++){const r=arenas[i];r.api.control(brains[i].step(1/60,r.api.me,r.api.enemy));r.step(1/60);metrics[i].frames++;if(r.api.me.stam<r.api.me.maxStam*.2)metrics[i].lowResourceFrames++;}
 let count=0;while(queue.length){if(++count>2000)throw Error('Combat message loop');const [i,m]=queue.shift();arenas[i].api.receive(m);}
 if(arenas.some(r=>r.api.locked||r.api.me.hp<=0))break;
 }
 const fractions=arenas.map(r=>r.api.me.hp/r.api.me.maxHp),winner=Math.abs(fractions[0]-fractions[1])<.001?-1:fractions[0]>fractions[1]?0:1;
 metrics.forEach((m,i)=>{m.damage=arenas[1-i].api.me.maxHp-arenas[1-i].api.me.hp});
 return {winner,timeout:steps>=seconds*60,steps,results:metrics.map((m,i)=>({win:winner===i,tactic:brains[i].tactic,metrics:m,reward:(winner===i?1:winner===-1?0:-1)+.25*(m.hits/Math.max(1,m.attempts))+.08*(m.defenses+m.parries)/Math.max(1,m.defenses+m.parries+metrics[1-i].hits)+.07*m.comboHits/Math.max(1,m.hits)-.15*m.lowResourceFrames/Math.max(1,m.frames)}))};
 }finally{for(const r of arenas)r.dispose();}
}
