const TAU=Math.PI*2;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const maxNum=(arr,fallback=0)=>Array.isArray(arr)&&arr.length?Math.max(...arr.map(v=>Number(v)||0)):fallback;
const minPositive=(arr,fallback=0)=>{const v=(Array.isArray(arr)?arr:[]).map(Number).filter(n=>Number.isFinite(n)&&n>=0);return v.length?Math.min(...v):fallback;};

const MODE=Object.freeze({
 eclipseShift:{utility:1,defensive:.15,ideal:260,range:0},
 lunarTideEcho:{area:.7,control:.45,mobility:.35,range:300,ideal:170},
 solarDial:{area:.75,mobility:.65,range:330,ideal:190},
 solarCross:{area:.8,mobility:.65,range:360,ideal:210},
 eclipseMoonChain:{area:.8,mobility:.9,tracking:.75,control:.35,range:460,ideal:210},
 windShot:{projectile:1,shieldBreak:.8,projectileSpeed:470,range:360,ideal:300},
 galeBlink:{mobility:1,tracking:.45,control:.65,range:760,ideal:430},
 galePulse:{area:1,control:1,range:260,ideal:150},
 galeCrescendo:{projectile:.55,area:1,control:.85,range:590,ideal:330},
 galePursuit:{mobility:1,tracking:1,control:.8,range:720,ideal:380},
 flameBreathSweep:{area:.55,range:275,ideal:145},
 tempest:{area:1,mobility:.45,range:190,ideal:100},
 flameBreathRise:{mobility:1,area:.75,shieldBreak:1,range:430,ideal:280},
 flameBreathCleave:{mobility:.9,area:1,range:420,ideal:240},
 flameBreathWheel:{mobility:.9,area:1,control:.55,range:410,ideal:220},
 flameBreathFinale:{mobility:1,tracking:.7,area:.9,control:.8,range:680,ideal:350},
 dawnWave:{projectile:1,projectileSpeed:720,range:760,ideal:520},
 boomerangWave:{mobility:1,projectile:.9,control:.8,projectileSpeed:640,range:620,ideal:360},
 fanLances:{projectile:1,tracking:.65,area:.6,projectileSpeed:780,range:820,ideal:520},
 skyFall:{mobility:1,tracking:1,area:1,control:.55,range:760,ideal:420},
 gravityDrift:{mobility:.65,range:280,ideal:150},
 singularityRush:{mobility:1,tracking:.65,control:1,range:650,ideal:360},
 void3Trigger:{defensive:1,control:.8,tracking:1,range:150,ideal:110},
 eventHorizonShear:{projectile:.35,area:.8,control:.8,range:390,ideal:270},
 holdShadow:{mobility:1,tracking:1,area:.65,control:.5,range:650,ideal:300},
 solarFlashLine:{mobility:1,tracking:.45,range:620,ideal:340},
 solarFlowChain:{mobility:.85,area:.6,range:390,ideal:180},
 solarFallingCleave:{mobility:1,area:1,control:.5,range:460,ideal:250},
 lunarMistStep:{mobility:.7,control:.45,range:330,ideal:180},
 lunarSpiralBind:{area:1,control:1,range:350,ideal:150},
 lunarWildAngles:{mobility:.9,area:.8,control:.45,range:420,ideal:200}
});

export function analyzeSkill(skill,slot=0){
 if(!skill||typeof skill!=='object')return null;
 const cfg=skill.cfg&&typeof skill.cfg==='object'?skill.cfg:{},mode=String(cfg.mode||''),profile=MODE[mode]||{};
 const reach=maxNum(cfg.reach,0),arc=maxNum(cfg.arc,0),hits=Array.isArray(cfg.hits)?cfg.hits.map(Number).filter(Number.isFinite):[];
 const duration=Math.max(.05,Number(cfg.duration)||Number(skill.holdMax)||.5),firstHit=minPositive(hits,Math.min(.22,duration*.35)),lastHit=hits.length?Math.max(...hits):firstHit;
 const meleeRange=94+Math.max(0,reach),effectiveRange=Math.max(meleeRange,Number(profile.range)||0,Number(cfg.dashDistance)||0);
 const inferredArea=arc>=TAU*.88?1:arc>=3?.65:arc>=2?.3:0,area=clamp(Number.isFinite(Number(profile.area))?Number(profile.area):inferredArea,0,1);
 const mobility=clamp(Number(profile.mobility)||((Number(cfg.dashDistance)||0)>0?1:0),0,1);
 const projectile=clamp(Number(profile.projectile)||0,0,1),tracking=clamp(Number(profile.tracking)||0,0,1),control=clamp(Number(profile.control)||0,0,1),defensive=clamp(Number(profile.defensive)||0,0,1);
 const utility=clamp(Number(profile.utility)||0,0,1),shieldBreak=clamp(Number(profile.shieldBreak)||0,0,1);
 const idealRange=clamp(Number(profile.ideal)||Math.min(effectiveRange*.65,260),60,Math.max(60,effectiveRange));
 const mult=Array.isArray(cfg.mult)?cfg.mult.reduce((a,v)=>a+Math.max(0,Number(v)||0),0):0;
 return {
  id:String(skill.id||''),name:String(skill.name||''),mode,slot:Math.max(0,Math.min(4,slot|0)),
  duration,firstHit,lastHit,recovery:Math.max(0,duration-lastHit),effectiveRange,idealRange,
  arc:clamp(arc/TAU,0,1),area,mobility,projectile,tracking,control,defensive,utility,shieldBreak,
  hold:skill.holdContinuous===true,holdMax:Math.max(0,Number(skill.holdMax)||0),ultimate:skill.ultimate===true||slot===4,
  cost:Math.max(0,Number(skill.cost)||0),cool:Math.max(.1,Number(skill.cool)||.1),
  damageWeight:clamp(mult/6,0,1.5),projectileSpeed:Math.max(0,Number(profile.projectileSpeed)||0)
 };
}

export function analyzeLoadout(skills){
 return Array.from({length:5},(_,i)=>analyzeSkill(Array.isArray(skills)?skills[i]:null,i));
}

export function rangeFit(meta,distance){
 if(!meta)return -1;
 const d=Math.max(0,Number(distance)||0);
 if(meta.utility)return .15;
 const r=Math.max(80,meta.effectiveRange),ideal=clamp(meta.idealRange,50,r);
 if(d>r)return -clamp((d-r)/Math.max(120,r*.65),0,1);
 const spread=Math.max(80,r*.62);
 return clamp(1-Math.abs(d-ideal)/spread,-.25,1);
}

export function skillUseScore(meta,ctx={}){
 if(!meta)return -1;
 const d=Math.max(0,Number(ctx.distance)||0),fit=rangeFit(meta,d),enemyStun=Math.max(0,Number(ctx.enemyStun)||0),enemyBlock=ctx.enemyBlock?1:0;
 const hp=clamp(Number(ctx.selfHpRatio)||1,0,1),enemyHp=clamp(Number(ctx.enemyHpRatio)||1,0,1),stam=clamp(Number(ctx.staminaRatio)||1,0,1);
 let score=fit*.72+meta.control*(enemyStun>0?.02:.13)+meta.tracking*.08+meta.area*(d<meta.effectiveRange*.7?.10:0);
 if(meta.mobility&&d>meta.idealRange)score+=clamp((d-meta.idealRange)/Math.max(180,meta.effectiveRange),0,.22);
 if(meta.projectile&&d>180)score+=.12;
 if(meta.defensive)score+=(hp<.55?.26:.04)+(ctx.enemyAttacking?.18:0);
 if(meta.utility)score+=.02;
 if(enemyBlock)score+=meta.shieldBreak*.24-meta.projectile*.04;
 if(enemyStun>0)score+=meta.damageWeight*.12+meta.ultimate*.10;
 if(meta.ultimate&&fit<.05)score-=.35;
 if(meta.ultimate&&enemyHp<.35)score+=.14;
 if(meta.cost>0&&stam<meta.cost/Math.max(1,Number(ctx.maxStamina)||meta.cost))score-=.45;
 score-=clamp(meta.firstHit-.18,0,.8)*.12;
 return clamp(score,-1,1);
}

export function preferredDistance(metas,ready){
 const values=[];
 for(let i=0;i<metas.length;i++){
  const m=metas[i];if(!m||ready&&ready[i]===false||m.utility)continue;
  let w=.55+m.projectile*.45+m.mobility*.12+m.control*.08+(m.ultimate?-.08:0);
  values.push({d:m.idealRange,w});
 }
 if(!values.length)return 220;
 const total=values.reduce((a,v)=>a+v.w,0);return values.reduce((a,v)=>a+v.d*v.w,0)/Math.max(.001,total);
}

export function activeSkillThreat(enemy,metas,distance){
 const idx=Math.floor(Number(enemy?.skillPose));
 if(!Number.isInteger(idx)||idx<0||idx>4)return {active:false,danger:0,meta:null,index:-1,timeToImpact:1};
 const meta=metas?.[idx]||null;if(!meta)return {active:true,danger:.25,meta:null,index:idx,timeToImpact:.5};
 const d=Math.max(0,Number(distance)||0),anim=Math.max(0,Number(enemy?.attackAnim)||0),dur=Math.max(.05,Number(enemy?.attackDuration)||meta.duration);
 const progress=clamp(1-anim/dur,0,1),timeToImpact=Math.max(0,meta.firstHit-progress*meta.duration);
 const proximity=d<=meta.effectiveRange+35?1:clamp(1-(d-meta.effectiveRange-35)/Math.max(160,meta.effectiveRange*.45),0,1);
 let danger=proximity*(.42+meta.control*.18+meta.tracking*.16+meta.area*.10+meta.mobility*.12+meta.ultimate*.10);
 if(timeToImpact<.22)danger+=.16;
 if(meta.projectile&&d<meta.effectiveRange*1.15)danger+=.10;
 return {active:true,danger:clamp(danger,0,1),meta,index:idx,timeToImpact,progress};
}

export function leadAim(meta,baseAngle,enemyVx=0,enemyVy=0,distance=0){
 if(!meta||meta.tracking>.7||meta.projectile<.35||meta.projectileSpeed<=0)return baseAngle;
 const flight=clamp((Number(distance)||0)/meta.projectileSpeed,0,.75),lx=Math.cos(baseAngle)*distance+(Number(enemyVx)||0)*flight,ly=Math.sin(baseAngle)*distance+(Number(enemyVy)||0)*flight;
 return Math.atan2(ly,lx);
}
