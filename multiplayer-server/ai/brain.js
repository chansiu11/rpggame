// Declarative profiles: add a style without changing the combat engine.
export const styles={
 gale:{name:'질풍',distance:115,combos:[[1,2,3,4],[0,1,4]],aggression:.8},
 void:{name:'이형',distance:155,combos:[[1,2,4],[0,3,1]],aggression:.65},
 dawn:{name:'여명',distance:330,combos:[[0,3,4],[2,1,0]],aggression:.45}
};
export function seedPolicy(){return {schema:1,generation:0,matches:0,styles:Object.fromEntries(Object.keys(styles).map(s=>[s,{weights:[1,1,1],games:0,wins:0,reward:0,metrics:{}}]))};}
export function rng(seed=1){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};}
export const difficulties={
 1:{name:'매우 쉬움',delay:.50,jitter:.30,mistake:.38,block:.22,dash:.10,attack:.42},
 2:{name:'쉬움',delay:.30,jitter:.23,mistake:.23,block:.42,dash:.21,attack:.70},
 3:{name:'보통',delay:.13,jitter:.17,mistake:.09,block:.65,dash:.33,attack:1},
 4:{name:'어려움',delay:.10,jitter:.10,mistake:.045,block:.78,dash:.46,attack:1.15},
 5:{name:'매우 어려움',delay:.075,jitter:.075,mistake:.02,block:.88,dash:.58,attack:1.3}
};
export function normalizeDifficulty(value){const n=Number(value);return Number.isInteger(n)&&n>=1&&n<=5?n:3;}
export function createBrain(style,policy=seedPolicy(),random=Math.random,difficulty=3){
 const settings=difficulties[normalizeDifficulty(difficulty)];
 const profile=styles[style];if(!profile)throw Error('Unsupported AI style');
 const weights=policy.styles[style].weights;let pick=random()*weights.reduce((a,b)=>a+b,0),tactic=0;
 while(tactic<2&&pick>weights[tactic])pick-=weights[tactic++];if(random()<.12)tactic=Math.floor(random()*3);
 let wait=0,hold=-1,releaseAt=0,time=0,combo=0,side=random()<.5?-1:1,previous=null,dodgeBias=0;
 const chain=profile.combos[tactic%profile.combos.length];let current={keys:[],aim:0};
 return {tactic,step(dt,me,enemy){time+=dt;wait-=dt;
 if(hold>=0&&time>=releaseAt){const release=hold;hold=-1;return {...current,release,basic:false,skill:undefined,dash:false};}
 if(wait>0)return {...current,basic:false,skill:undefined,dash:false};
 wait=settings.delay+random()*settings.jitter; // Observation/action delay; no future inputs or hidden cooldowns.
 const dx=enemy.x-me.x,dy=enemy.y-me.y,d=Math.hypot(dx,dy),a=Math.atan2(dy,dx),resources=me.stam/Math.max(1,me.maxStam),hp=me.hp/me.maxHp;
 if(previous&&enemy.dash>0)dodgeBias=dodgeBias*.8+Math.sign((enemy.x-previous.x)*-Math.sin(a)+(enemy.y-previous.y)*Math.cos(a))*.2;
 previous={x:enemy.x,y:enemy.y};if(random()<.13)side*=-1;
 const threat=d<310&&(enemy.attackAnim>0||enemy.skillPose>=0),mistake=random()<settings.mistake;
 const desired=profile.distance+(tactic===1?100:tactic===2?-45:0)+(resources<.22||hp<.25?210:0);
 const radial=d>desired+40?1:d<desired-35?-1:0,strafe=side*(radial? .35:1);
 let mx=Math.cos(a)*radial-Math.sin(a)*strafe,my=Math.sin(a)*radial+Math.cos(a)*strafe;
 if(me.x<130)mx=1;if(me.x>3470)mx=-1;if(me.y<130)my=1;if(me.y>1970)my=-1;
 const keys=[];if(mx>.22)keys.push('KeyD');if(mx<-.22)keys.push('KeyA');if(my>.22)keys.push('KeyS');if(my<-.22)keys.push('KeyW');if(d>500&&resources>.55)keys.push('ShiftLeft');
 current={keys,aim:a+dodgeBias*.06,block:!mistake&&threat&&random()<settings.block&&me.shield>0,dash:!mistake&&threat&&resources>.2&&random()<settings.dash,basic:false};
 if(current.block||current.dash||me.stun>0)return current;
 if(hold>=0){current.basic=false;return current;}
 const ready=i=>me.cool[i]<=0&&!(style==='void'&&i===2&&me.void3DodgeRemaining>0),available=chain.filter(ready),busy=me.skillEvent||me.skillHold;
 if(!busy&&resources>.18&&d<650&&!mistake&&available.length&&random()<Math.min(1,(profile.aggression+.15)*settings.attack)){
 const i=ready(chain[combo%chain.length])?chain[combo++%chain.length]:available[0];current.skill=i;hold=i;releaseAt=time+.2+random()*.45;
 }else if(d<130&&!busy&&!mistake)current.basic=true;
 return current;
 }};
}
export function learn(policy,style,tactic,result){const s=policy.styles[style];s.games++;s.wins+=result.win?1:0;s.reward+=result.reward;
 s.weights[tactic]=Math.max(.2,Math.min(5,s.weights[tactic]*Math.exp(.04*result.reward)));
 for(const [k,v] of Object.entries(result.metrics||{}))s.metrics[k]=(s.metrics[k]||0)+v;
}
