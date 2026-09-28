// Declarative profiles: add a style without changing the combat engine.
export const styles={
 gale:{name:'질풍',distance:115,combos:[[1,2,3,4],[0,1,4]],aggression:.8},
 void:{name:'이형',distance:155,combos:[[1,2,4],[0,3,1]],aggression:.65},
 dawn:{name:'여명',distance:330,combos:[[0,3,4],[2,1,0]],aggression:.45}
};
export function seedPolicy(){return {schema:1,generation:0,matches:0,styles:Object.fromEntries(Object.keys(styles).map(s=>[s,{weights:[1,1,1],games:0,wins:0,reward:0,metrics:{}}]))};}
export function rng(seed=1){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};}
export function createBrain(style,policy=seedPolicy(),random=Math.random){
 const profile=styles[style];if(!profile)throw Error('Unsupported AI style');
 const weights=policy.styles[style].weights;let pick=random()*weights.reduce((a,b)=>a+b,0),tactic=0;
 while(tactic<2&&pick>weights[tactic])pick-=weights[tactic++];if(random()<.12)tactic=Math.floor(random()*3);
 let wait=0,hold=-1,releaseAt=0,time=0,combo=0,side=random()<.5?-1:1,previous=null,dodgeBias=0;
 const chain=profile.combos[tactic%profile.combos.length];let current={keys:[],aim:0};
 return {tactic,step(dt,me,enemy){time+=dt;wait-=dt;
 if(hold>=0&&time>=releaseAt){const release=hold;hold=-1;return {...current,release,basic:false,skill:undefined,dash:false};}
 if(wait>0)return {...current,basic:false,skill:undefined,dash:false};
 wait=.13+random()*.17; // Observation/action delay; no future inputs or hidden cooldowns.
 const dx=enemy.x-me.x,dy=enemy.y-me.y,d=Math.hypot(dx,dy),a=Math.atan2(dy,dx),resources=me.stam/Math.max(1,me.maxStam),hp=me.hp/me.maxHp;
 if(previous&&enemy.dash>0)dodgeBias=dodgeBias*.8+Math.sign((enemy.x-previous.x)*-Math.sin(a)+(enemy.y-previous.y)*Math.cos(a))*.2;
 previous={x:enemy.x,y:enemy.y};if(random()<.13)side*=-1;
 const threat=d<310&&(enemy.attackAnim>0||enemy.skillPose>=0),mistake=random()<.09;
 const desired=profile.distance+(tactic===1?100:tactic===2?-45:0)+(resources<.22||hp<.25?210:0);
 const radial=d>desired+40?1:d<desired-35?-1:0,strafe=side*(radial? .35:1);
 let mx=Math.cos(a)*radial-Math.sin(a)*strafe,my=Math.sin(a)*radial+Math.cos(a)*strafe;
 if(me.x<130)mx=1;if(me.x>3470)mx=-1;if(me.y<130)my=1;if(me.y>1970)my=-1;
 const keys=[];if(mx>.22)keys.push('KeyD');if(mx<-.22)keys.push('KeyA');if(my>.22)keys.push('KeyS');if(my<-.22)keys.push('KeyW');if(d>500&&resources>.55)keys.push('ShiftLeft');
 current={keys,aim:a+dodgeBias*.06,block:!mistake&&threat&&random()<.65&&me.shield>0,dash:!mistake&&threat&&resources>.2&&random()<.33,basic:false};
 if(current.block||current.dash||me.stun>0)return current;
 if(hold>=0){current.basic=style==='void'&&hold===2&&d<240;return current;}
 const ready=i=>me.cool[i]<=0,available=chain.filter(ready),busy=me.skillEvent||me.skillHold;
 if(!busy&&resources>.18&&d<650&&!mistake&&available.length&&random()<profile.aggression+.15){
 const i=ready(chain[combo%chain.length])?chain[combo++%chain.length]:available[0];current.skill=i;hold=i;releaseAt=time+(style==='void'&&i===2?1.8:.2+random()*.45);
 }else if(d<130&&!busy)current.basic=true;
 return current;
 }};
}
export function learn(policy,style,tactic,result){const s=policy.styles[style];s.games++;s.wins+=result.win?1:0;s.reward+=result.reward;
 s.weights[tactic]=Math.max(.2,Math.min(5,s.weights[tactic]*Math.exp(.04*result.reward)));
 for(const [k,v] of Object.entries(result.metrics||{}))s.metrics[k]=(s.metrics[k]||0)+v;
}
