import {NN_BEHAVIORS,NN_SHAPE,createNetwork,validateNetwork,forward,perturbNetwork,esUpdateNetwork,hashSeed,networkParameterCount} from './neural-policy.js';
import {analyzeLoadout,activeSkillThreat,skillUseScore,preferredDistance,leadAim} from './skill-knowledge.js';
export {NN_BEHAVIORS,NN_SHAPE,networkParameterCount};

export const styles={
 gale:{name:'질풍'},
 moon:{name:'월식'},
 void:{name:'이형'},
 dawn:{name:'여명'},
 break:{name:'홍련'}
};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const ratio=(a,b)=>clamp((Number(a)||0)/Math.max(1,Number(b)||1),0,1);
const initialStyle=id=>{
 const network=createNetwork(hashSeed('echoes-neural-'+id));
 // These are trainable starting priors, not runtime rules. They only keep a
 // fresh random policy from freezing in permanent block/feint behavior before
 // self-play has produced its first useful gradients.
 network.b3[2]=-.45; // block prior: do not turtle forever at generation 0
 network.b3[3]=.25;  // basic attack prior
 for(let i=4;i<=8;i++)network.b3[i]=.20; // five learnable skill logits
 network.b3[10]=-.55; // feint starts conservative, then self-play can raise it
 network.b3[11]=.12; // mild initiative
 network.b3[13]=.10; // mild punish initiative
 return {network,sigma:.055,learningRate:.0035,rewardMean:0,games:0,wins:0,reward:0,metrics:{}};
};
export function stylePairs(){
 const ids=Object.keys(styles),pairs=[];
 for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++)pairs.push([ids[i],ids[j]]);
 return pairs;
}
const matchupKey=(a,b)=>[String(a),String(b)].sort().join('|');
function ensureMatchups(policy){
 if(!policy.matchups||typeof policy.matchups!=='object')policy.matchups={};
 for(const [a,b] of stylePairs()){
  const key=matchupKey(a,b),n=Number(policy.matchups[key]);
  policy.matchups[key]=Number.isSafeInteger(n)&&n>=0?n:0;
 }
 return policy.matchups;
}
export function ensurePolicyStyles(policy){
 if(!policy||typeof policy!=='object')return policy;
 policy.schema=2;policy.model='mlp-es-v1';policy.learning={behaviors:[...NN_BEHAVIORS,'skillRangeUnderstanding','skillThreatUnderstanding','skillTimingUnderstanding'],fixedDodge:'skill-aware',resourceManagement:false};
 if(!policy.styles||typeof policy.styles!=='object')policy.styles={};
 for(const id of Object.keys(styles)){
  const s=policy.styles[id];
  if(!s||!validateNetwork(s.network))policy.styles[id]=initialStyle(id);
 }
 ensureMatchups(policy);
 return policy;
}
export function seedPolicy(){
 const policy={
  schema:2,model:'mlp-es-v1',generation:0,matches:0,
  learning:{behaviors:[...NN_BEHAVIORS,'skillRangeUnderstanding','skillThreatUnderstanding','skillTimingUnderstanding'],fixedDodge:'skill-aware',resourceManagement:false},
  styles:Object.fromEntries(Object.keys(styles).map(id=>[id,initialStyle(id)])),
  matchups:{}
 };
 ensureMatchups(policy);
 return policy;
}
export function recordMatchup(policy,a,b,count=1){
 ensurePolicyStyles(policy);
 const key=matchupKey(a,b);
 if(!(key in policy.matchups))return false;
 policy.matchups[key]=Math.max(0,(Number(policy.matchups[key])||0)+Math.max(0,Math.floor(Number(count)||0)));
 return true;
}
// Pick the least-played matchup first, then prefer the least-experienced styles.
// This guarantees all ten five-style pairings receive training instead of repeatedly
// pairing only whichever two styles currently have the fewest total games.
export function leastTrainedPair(policy){
 ensurePolicyStyles(policy);
 const pairs=stylePairs(),offset=(Number(policy.matches)||0)%pairs.length;
 return pairs.map((pair,index)=>{
  const [a,b]=pair,key=matchupKey(a,b);
  return {pair,index,games:Number(policy.matchups[key])||0,experience:(Number(policy.styles[a]?.games)||0)+(Number(policy.styles[b]?.games)||0)};
 }).sort((x,y)=>x.games-y.games||x.experience-y.experience||((x.index-offset+pairs.length)%pairs.length)-((y.index-offset+pairs.length)%pairs.length))[0].pair;
}
export function rng(seed=1){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};}
export const difficulties={
 1:{name:'매우 쉬움',outputNoise:.34,mistake:.32,attackThreshold:.22},
 2:{name:'쉬움',outputNoise:.22,mistake:.20,attackThreshold:.13},
 3:{name:'보통',outputNoise:.11,mistake:.09,attackThreshold:.06},
 4:{name:'어려움',outputNoise:.055,mistake:.035,attackThreshold:.015},
 5:{name:'매우 어려움',outputNoise:.018,mistake:.012,attackThreshold:-.025}
};
export function normalizeDifficulty(value){const n=Number(value);return Number.isInteger(n)&&n>=1&&n<=5?n:3;}

function readySkills(me,style){
 const cool=Array.isArray(me?.cool)?me.cool:[0,0,0,0,0];
 return Array.from({length:5},(_,i)=>Number(cool[i]||0)<=0&&!(style==='void'&&i===2&&Number(me?.void3DodgeRemaining)>0));
}
function makeFeatures(state,me,enemy,holdAge,ready,dt,style){
 const dx=(Number(enemy?.x)||0)-(Number(me?.x)||0),dy=(Number(enemy?.y)||0)-(Number(me?.y)||0),d=Math.max(1,Math.hypot(dx,dy)),a=Math.atan2(dy,dx);
 const prev=state.previous,edx=prev?((Number(enemy?.x)||0)-prev.ex):0,edy=prev?((Number(enemy?.y)||0)-prev.ey):0;
 const invDt=1/Math.max(.001,dt),rv=prev?clamp(((d-prev.d)*invDt)/520,-1,1):0;
 const lateral=prev?clamp(((-Math.sin(a)*edx+Math.cos(a)*edy)*invDt)/520,-1,1):0;
 const alpha=clamp(dt*3.5,.02,.3),enemyAttack=(Number(enemy?.attackAnim)>0||Number(enemy?.skillPose)>=0)?1:0,enemySkill=Number(enemy?.skillPose)>=0?1:0;
 state.attackEma+=(enemyAttack-state.attackEma)*alpha;
 state.blockEma+=((enemy?.block?1:0)-state.blockEma)*alpha;
 state.dashEma+=((Number(enemy?.dash)>0?1:0)-state.dashEma)*alpha;
 state.skillEma+=(enemySkill-state.skillEma)*alpha;
 state.enemyVx=prev?edx*invDt:0;state.enemyVy=prev?edy*invDt:0;state.previous={ex:Number(enemy?.x)||0,ey:Number(enemy?.y)||0,d};
 const selfAction=(Number(me?.attackAnim)>0||Number(me?.skillPose)>=0)?1:0;
 // Saved networks stay 30 inputs. Moon alone reuses the two trailing context slots:
 // [28] = opposite-form 2/3/4 readiness, [29] = current Lunar(-1)/Solar(+1) form.
 const moon=style==='moon';
 const context28=moon?clamp((Number(me?.moonAltReady)||0)*2-1,-1,1):clamp((Number(enemy?.combo)||0)/5,0,1);
 const context29=moon?(me?.moonForm==='solar'?1:-1):(selfAction?1:-1);
 return [
  clamp(dx/700,-1,1),clamp(dy/700,-1,1),clamp(d/800,0,1.5),Math.sin(a),Math.cos(a),
  ratio(me?.hp,me?.maxHp),ratio(enemy?.hp,enemy?.maxHp),clamp(ratio(me?.hp,me?.maxHp)-ratio(enemy?.hp,enemy?.maxHp),-1,1),
  ratio(me?.shield,me?.maxShield),ratio(enemy?.shield,enemy?.maxShield),
  selfAction,enemyAttack,clamp(Number(me?.stun)||0,0,1),clamp(Number(enemy?.stun)||0,0,1),enemy?.block?1:0,
  rv,lateral,state.attackEma,state.blockEma,state.dashEma,state.skillEma,clamp(holdAge/1.5,0,1),clamp((Number(me?.combo)||0)/5,0,1),
  ready[0]?1:0,ready[1]?1:0,ready[2]?1:0,ready[3]?1:0,ready[4]?1:0,context28,
  context29
 ];
}
function addDifficultyNoise(out,settings,random,training){
 if(training)return out;
 for(let i=0;i<out.length;i++)out[i]=clamp(out[i]+(random()*2-1)*settings.outputNoise,-1,1);
 return out;
}

export function createBrain(style,policy=seedPolicy(),random=Math.random,difficulty=3,options={}){
 ensurePolicyStyles(policy);
 const settings=difficulties[normalizeDifficulty(difficulty)],profile=policy?.styles?.[style],fallback=initialStyle(style);
 const base=profile&&validateNetwork(profile.network)?profile:fallback;
 const noiseSeed=Number.isInteger(options.noiseSeed)?options.noiseSeed>>>0:null;
 const network=noiseSeed===null?base.network:perturbNetwork(base.network,noiseSeed,base.sigma);
 const training={noiseSeed,sigma:base.sigma};
 const state={previous:null,enemyVx:0,enemyVy:0,attackEma:0,blockEma:0,dashEma:0,skillEma:0};
 let hold=-1,holdAge=0,dodgeLock=0,side=random()<.5?-1:1,moonShiftReleasePending=false;
 const stats={decisions:0,blocks:0,dodges:0,skills:0,basics:0,feints:0,releases:0,skillAwareChoices:0,threatDodges:0};
 let current={keys:[],aim:0,block:false,dash:false,basic:false};
 return {tactic:-1,training,stats,step(dt,me,enemy,combatContext={}){
  dt=clamp(Number(dt)||1/60,1/240,.08);stats.decisions++;dodgeLock=Math.max(0,dodgeLock-dt);
  const dx=(Number(enemy?.x)||0)-(Number(me?.x)||0),dy=(Number(enemy?.y)||0)-(Number(me?.y)||0),d=Math.max(1,Math.hypot(dx,dy)),a=Math.atan2(dy,dx);
  const ready=readySkills(me,style),selfSkills=Array.isArray(combatContext?.selfSkills)?combatContext.selfSkills:me?.swordSkills,enemySkills=Array.isArray(combatContext?.enemySkills)?combatContext.enemySkills:enemy?.swordSkills;
  const selfMeta=analyzeLoadout(selfSkills),enemyMeta=analyzeLoadout(enemySkills),threat=activeSkillThreat(enemy,enemyMeta,d);
  const features=makeFeatures(state,me,enemy,holdAge,ready,dt,style),out=addDifficultyNoise(forward(network,features),settings,random,options.training===true);
  const aggression=out[11],neuralDesired=clamp(330+out[0]*250-aggression*75,70,650),knownDesired=preferredDistance(selfMeta,ready),desired=clamp(neuralDesired*.58+knownDesired*.42,70,650);
  let radial=d>desired+24?1:d<desired-24?-1:out[14]*.35,lateral=clamp(out[1],-1,1);
  if(Math.abs(lateral)<.08)lateral=side*.16;
  let mx=Math.cos(a)*radial-Math.sin(a)*lateral,my=Math.sin(a)*radial+Math.cos(a)*lateral;
  if((Number(me?.x)||0)<130)mx=Math.max(mx,.8);if((Number(me?.x)||0)>3470)mx=Math.min(mx,-.8);
  if((Number(me?.y)||0)<130)my=Math.max(my,.8);if((Number(me?.y)||0)>1970)my=Math.min(my,-.8);
  const keys=[];if(mx>.22)keys.push('KeyD');if(mx<-.22)keys.push('KeyA');if(my>.22)keys.push('KeyS');if(my<-.22)keys.push('KeyW');
  let aim=a+out[12]*.62;
  if(Number(me?.stun)>0){hold=-1;holdAge=0;moonShiftReleasePending=false;current={keys:[],aim,block:false,dash:false,basic:false};return current;}
  if(moonShiftReleasePending){moonShiftReleasePending=false;current={keys,aim,block:false,dash:false,basic:false,release:0};return current;}

  // Skill press duration is learned, but the actual skill definition supplies the
  // legal/meaningful hold window so the bot does not treat every skill identically.
  if(hold>=0){
   holdAge+=dt;
   const heldMeta=selfMeta[hold],knowledgeCeiling=heldMeta?.hold?clamp(heldMeta.holdMax||1.6,.25,3.2):clamp(Math.max(.38,(heldMeta?.firstHit||.18)+.28),.38,.9);
   const continueHold=out[9]+out[17]*.22+(heldMeta?.hold?.18:-.05);
   if(continueHold<0||holdAge>=knowledgeCeiling){
    const release=hold;hold=-1;holdAge=0;stats.releases++;
    current={keys,aim,block:false,dash:false,basic:false,release};return current;
   }
   current={keys,aim,block:false,dash:false,basic:false};return current;
  }

  // Dodge remains deterministic for reliability, but it now reads the opponent's
  // actual active skill range/type/timing instead of using a universal 235px rule.
  const skillThreat=threat.active&&threat.danger>.43&&threat.timeToImpact<.55;
  const canDash=(Number(me?.dash)||0)<=0&&(me?.stam===undefined||Number(me.stam)>6);
  if(skillThreat&&canDash&&dodgeLock<=0){
   dodgeLock=.42;side=state.skillEma>.35?-side:side;stats.dodges++;stats.threatDodges++;
   let dodgeKeys;
   if((threat.meta?.area||0)>.72||(threat.meta?.tracking||0)>.78){
    dodgeKeys=[Math.sin(a)>.25?'KeyW':Math.sin(a)<-.25?'KeyS':'KeyW',Math.cos(a)>.25?'KeyA':Math.cos(a)<-.25?'KeyD':'KeyA'];
   }else{
    dodgeKeys=side>0
     ?[Math.sin(a)>-.2?'KeyS':'KeyW',Math.cos(a)>.2?'KeyA':'KeyD']
     :[Math.sin(a)>.2?'KeyW':'KeyS',Math.cos(a)>-.2?'KeyD':'KeyA'];
   }
   current={keys:[...new Set(dodgeKeys)],aim,block:false,dash:true,basic:false};return current;
  }

  const predictedAttack=out[15],predictedBlock=out[16];
  const skillBusy=!!me?.skillEvent||!!me?.skillHold;
  const busy=skillBusy||Number(me?.attackAnim)>0;

  // Moon form switching is learned, not forced. Slot 1 (index 0) stays in
  // the same neural skill-choice competition as the other skills and basic attack.

  // Training-only exploration prevents an untrained random network from
  // getting trapped in "never attack" behavior. This is never used by live AI
  // or evaluation; timing and action choice in real matches remain neural.
  if(options.training===true&&noiseSeed!==null&&!busy&&random()<.025){
   const readyIds=[];for(let i=0;i<5;i++)if(ready[i])readyIds.push(i);
   if(readyIds.length){
    const i=readyIds[Math.floor(random()*readyIds.length)];stats.skills++;
    if(style==='moon'&&i===0)moonShiftReleasePending=true;else{hold=i;holdAge=0;}
    current={keys,aim,block:false,dash:false,basic:false,skill:i};return current;
   }
   if(d<220){stats.basics++;current={keys,aim,block:false,dash:false,basic:true};return current;}
  }

  const blockScore=out[2]+predictedAttack*.18+threat.danger*.24-(threat.meta?.shieldBreak||0)*.22;
  const block=Number(me?.shield)>0&&blockScore>.18;
  if(block){stats.blocks++;current={keys,aim,block:true,dash:false,basic:false};return current;}

  const knowledgeScores=selfMeta.map((meta,i)=>ready[i]?skillUseScore(meta,{distance:d,enemyBlock:!!enemy?.block,enemyStun:enemy?.stun||0,enemyAttacking:Number(enemy?.attackAnim)>0||Number(enemy?.skillPose)>=0,selfHpRatio:ratio(me?.hp,me?.maxHp),enemyHpRatio:ratio(enemy?.hp,enemy?.maxHp),staminaRatio:ratio(me?.stam,me?.maxStam),maxStamina:me?.maxStam}):-1);
  const bestKnowledge=Math.max(-1,...knowledgeScores);
  const feintScore=out[10]+Math.max(0,predictedBlock)*.22-Math.max(0,bestKnowledge)*.28;
  const feint=feintScore>.34&&!busy&&bestKnowledge<.68;
  const stopAttack=out[9]<-.22&&(Number(me?.combo)||0)>0;
  const comboDrive=(Number(me?.combo)||0)>0?out[17]*.20:0;
  const attackDrive=aggression*.18+out[13]*.20+comboDrive-(feint?.38:0);
  const mistake=!options.training&&random()<settings.mistake;
  if(!busy&&!stopAttack&&!mistake){
   let bestType='none',best=-Infinity,bestSkill=-1;
   const basicScore=out[3]+attackDrive;
   if(d<190&&basicScore>best){best=basicScore;bestType='basic';}
   for(let i=0;i<5;i++)if(ready[i]){
    const knowledge=knowledgeScores[i];
    const score=out[4+i]+attackDrive+knowledge*.52;
    if(score>best){best=score;bestType='skill';bestSkill=i;}
   }
   if(!feint&&best>settings.attackThreshold){
    if(bestType==='skill'&&bestSkill>=0){stats.skills++;stats.skillAwareChoices++;aim=leadAim(selfMeta[bestSkill],aim,state.enemyVx,state.enemyVy,d);if(style==='moon'&&bestSkill===0)moonShiftReleasePending=true;else{hold=bestSkill;holdAge=0;}current={keys,aim,block:false,dash:false,basic:false,skill:bestSkill};return current;}
    if(bestType==='basic'){stats.basics++;current={keys,aim,block:false,dash:false,basic:true};return current;}
   }else if(feint&&best>settings.attackThreshold){stats.feints++;}
  }
  current={keys,aim,block:false,dash:false,basic:false};return current;
 }};
}

export function learn(policy,style,training,result){
 if(typeof training==='number'){result=arguments[3];training=null;}
 ensurePolicyStyles(policy);
 const s=policy.styles[style],reward=Number(result?.reward)||0;s.games++;s.wins+=result?.win?1:0;s.reward+=reward;
 const previous=Number(s.rewardMean)||0,advantage=clamp(reward-previous,-2,2);
 s.rewardMean=previous*.95+reward*.05;
 if(Number.isInteger(training?.noiseSeed)&&validateNetwork(s.network)){
  esUpdateNetwork(s.network,training.noiseSeed,(Number(s.learningRate)||.0035)*advantage);
  s.sigma=clamp((Number(s.sigma)||.055)*(advantage>0?.9995:1.00025),.025,.11);
 }
 for(const [k,v] of Object.entries(result?.metrics||{}))if(Number.isFinite(Number(v)))s.metrics[k]=(s.metrics[k]||0)+Number(v);
}
