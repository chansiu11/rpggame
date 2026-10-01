import {createArena} from './arena-runtime.js';
import {createBrain,rng} from './brain.js';

export function createDuelSession(styleA,styleB,policyA,policyB,seed=1,seconds=90,permit=()=>{},onFrame=null,options={}){
 const a=createArena({style:styleA}),b=createArena({style:styleB}),arenas=[a,b];
 const metrics=arenas.map(()=>({attempts:0,hits:0,misses:0,defenses:0,evades:0,parries:0,comboHits:0,frames:0,damage:0})),queue=[];
 for(let i=0;i<2;i++)arenas[i].api.init(arenas[i].snapshot,arenas[1-i].snapshot,i===0,m=>{
  if(m.t==='atk')metrics[i].attempts++;
  if(m.t==='attackResult'){
   const target=metrics[1-i];
   if(m.result==='hit'){target.hits++;if(arenas[1-i].api.me.combo>1)target.comboHits++;}
   else if(m.result==='miss')target.misses++;
   else if(m.result==='parried')metrics[i].parries++;
   else if(m.result==='blocked')metrics[i].defenses++;
   else if(m.result==='ignored')metrics[i].evades++;
  }
  // Visual-only traffic is discarded in training, combat messages are unchanged.
  if(!['fxBatch','ping','pong','skillShake','galePulseShake'].includes(m.t))queue.push([1-i,structuredClone(m)]);
 });
 const explore=options?.explore===true;
 const brains=[
  createBrain(styleA,policyA,rng(seed),3,explore?{training:true,noiseSeed:(Math.imul(seed>>>0,2654435761)+17)>>>0}:{training:true}),
  createBrain(styleB,policyB,rng(seed+99),3,explore?{training:true,noiseSeed:(Math.imul((seed+99)>>>0,2246822519)+53)>>>0}:{training:true})
 ];
 const frame=f=>({x:f.x,y:f.y,a:f.a,hp:f.hp,maxHp:f.maxHp,shield:f.shield,maxShield:f.maxShield,stam:f.stam,maxStam:f.maxStam,skillPose:f.skillPose,skillKind:f.skillKind||'',block:!!f.block,dash:f.dash||0,stun:f.stun||0,attackAnim:f.attackAnim||0,attackDuration:f.attackDuration||0});
 const enabled=()=>!!onFrame&&(!onFrame.enabled||onFrame.enabled());
 const limit=Math.max(1,Math.round(seconds*60)),stallLimit=Math.round(18*60);
 let steps=0,done=false,result=null,disposed=false,finalSent=false,lastDamageStep=0,lastHp=arenas.map(r=>r.api.me.hp);

 function emit(final=false){
  if(!enabled())return;
  if(final)finalSent=true;
  onFrame({step:steps,players:arenas.map(r=>frame(r.api.me)),hits:metrics.map(m=>m.hits),...(final?{final:true}:{})});
 }
 function finish(){
  if(done)return result;
  done=true;
  if(!finalSent)emit(true);
  const fractions=arenas.map(r=>r.api.me.hp/r.api.me.maxHp),winner=Math.abs(fractions[0]-fractions[1])<.001?-1:fractions[0]>fractions[1]?0:1;
  metrics.forEach((m,i)=>{m.damage=arenas[1-i].api.me.maxHp-arenas[1-i].api.me.hp});
  const stalled=options.explore===true&&steps-lastDamageStep>=stallLimit&&steps>=stallLimit;
  result={winner,timeout:steps>=limit,stalled,steps,results:metrics.map((m,i)=>{
   const dealt=m.damage/Math.max(1,arenas[1-i].api.me.maxHp),taken=metrics[1-i].damage/Math.max(1,arenas[i].api.me.maxHp);
   const accuracy=m.hits/Math.max(1,m.attempts),defense=(m.defenses+m.parries)/Math.max(1,m.defenses+m.parries+metrics[1-i].hits),combo=m.comboHits/Math.max(1,m.hits);
   const neural={...brains[i].stats};for(const [k,v] of Object.entries(neural))m['neural_'+k]=v;
   const activity=Math.min(1,m.attempts/10),inactive=m.attempts===0?.12:0;
   return {win:winner===i,tactic:-1,training:brains[i].training,metrics:m,reward:(winner===i?1:winner===-1?0:-1)+.30*(dealt-taken)+.18*accuracy+.08*defense+.08*combo+.03*activity-inactive};
  })};
  return result;
 }
 function step(){
  if(done)return result;
  permit();
  for(let i=0;i<2;i++){
   const r=arenas[i];
   r.api.control(brains[i].step(1/60,r.api.me,r.api.enemy,r.api.skillContext?.()||{}));
   r.step(1/60);
   metrics[i].frames++;
  }
  let count=0;
  while(queue.length){
   if(++count>2000)throw Error('Combat message loop');
   const [i,m]=queue.shift();arenas[i].api.receive(m);
  }
  for(let i=0;i<2;i++){const hp=Number(arenas[i].api.me.hp)||0;if(Math.abs(hp-lastHp[i])>.001){lastDamageStep=steps;lastHp[i]=hp;}}
  if(enabled()&&steps%8===0)emit(false);
  const ended=arenas.some(r=>r.api.locked||r.api.me.hp<=0);
  steps++;
  const stalled=options.explore===true&&steps>=stallLimit&&steps-lastDamageStep>=stallLimit;
  if(ended||stalled||steps>=limit)return finish();
  return null;
 }
 function dispose(){
  if(disposed)return;
  disposed=true;
  for(const r of arenas)r.dispose();
 }
 return {step,finish,dispose,get done(){return done},get result(){return result},get steps(){return steps}};
}

export function duel(styleA,styleB,policyA,policyB,seed=1,seconds=90,permit=()=>{},onFrame=null){
 const session=createDuelSession(styleA,styleB,policyA,policyB,seed,seconds,permit,onFrame,{explore:false});
 try{
  while(!session.done)session.step();
  return session.result;
 }finally{session.dispose();}
}
