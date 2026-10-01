import './combat-core.js';
const C=globalThis.EchoesCombat;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
const number=v=>Number.isFinite(Number(v));
// One result revision covers health, control and special state. Input can acknowledge
// a result, but cannot replace its position until its control lease has finished.
export function createWorldCombat({players,send,broadcast,publicState,safeZone,width,height,allowParty=()=>false,clipTarget=(p,q)=>q,resolveTarget=id=>players.get(id),now=Date.now}){
 let eventSeq=0;
 const timed=['stun','root','invuln','dodge','parryWindow','shieldBroken','shieldDelay','mark'];
 function advance(p,t=now()){
  for(const k of timed)p[k]=Math.max(0,((p[k+'Until']||0)-t)/1000);
  if(p.forceMove){const q=C.forcePoint(p.forceMove,(t-p.forceMove.startedAt)/1000);p.x=q.x;p.y=q.y;p.vx=p.vy=0;if(q.done){p.forceMove=null;emit(p,{outcome:'settled',damage:0});}}
 }
 function snapshot(p){advance(p);return {serverTime:now(),teleportSeq:p.teleportSeq||0,combatRevision:p.combatRevision||0,controlRevision:p.controlRevision||0,shield:p.shield||0,maxShield:p.maxShield||0,escapeDamage:p.escapeDamage||0,escapeLastAt:p.escapeLastAt||0,stam:p.stam||0,maxStam:p.maxStam||0,block:!!p.block,stun:p.stun||0,root:p.root||0,invuln:p.invuln||0,dodge:p.dodge||0,parryWindow:p.parryWindow||0,shieldBroken:p.shieldBroken||0,shieldDelay:p.shieldDelay||0,mark:p.mark||0,forceMove:p.forceMove?{...p.forceMove,elapsed:(now()-p.forceMove.startedAt)/1000}:null,skillId:p.skillId||'',skillKind:p.skillKind||'',moveSpeed:p.moveSpeed||0,special:p.special||{}};}
 function emit(p,extra={}){p.combatRevision=(p.combatRevision||0)+1;const result={type:'world:combatResult',eventId:++eventSeq,targetId:p.id,serverTime:now(),...extra,player:{...publicState(p),...snapshot(p)}};broadcast(result);return result;}
 function allowed(a,b){return a&&b&&a!==b&&a.ready&&b.ready&&a.clientMode!=='pvp'&&b.clientMode!=='pvp'&&a.hp>0&&b.hp>0&&!safeZone(a.x,a.y)&&!safeZone(b.x,b.y)&&(!(a.partyId&&a.partyId===b.partyId)||allowParty(a,b));}
 function lease(p,e,t){
  const stun=clamp(e.stun,0,2.5),root=clamp(e.root,0,3);p.stunUntil=Math.max(p.stunUntil||0,t+stun*1000);if(root>0)p.rootUntil=Math.max(p.rootUntil||0,t+root*1000);
  const dx=clamp(e.dx??e.knockbackX,-720,720),dy=clamp(e.dy??e.knockbackY,-720,720);
  const track=e.kind!=='attack'&&number(e.x)&&number(e.y);
  if(dx||dy||track){const base=e.kind==='attack'?p:(p.forceMove||p),duration=C.forceDuration(Math.hypot(dx,dy),number(e.duration)?Number(e.duration):undefined);
   const tx=track?p.x+clamp(e.x-p.x,-720,720):base.x+dx,ty=track?p.y+clamp(e.y-p.y,-720,720):base.y+dy,spot=clipTarget(p,{x:clamp(tx,40,width-40),y:clamp(ty,40,height-40)});
   p.forceMove={startX:p.x,startY:p.y,x:spot.x,y:spot.y,max:duration,startedAt:t};
   p.controlUntil=t+Math.max(.22,duration)*1000;p.controlRevision=(p.controlRevision||0)+1;
  }
  p.controlUntil=Math.max(p.controlUntil||0,p.stunUntil||0);
 }
 function ingest(p,msg){
  const t=now();advance(p,t);const seq=Math.floor(Number(msg.seq)||0),hadInput=(p.inputSeq||0)>0;
  if(seq<= (p.inputSeq||0))return null;p.inputSeq=seq;
  const ack=Math.floor(Number(msg.combatAck)||0),controlAck=Math.floor(Number(msg.controlAck)||0),fresh=ack===(p.combatRevision||0),controlFresh=controlAck===(p.controlRevision||0),out={...msg};
  if(!fresh||!controlFresh||p.forceMove||t<(p.controlUntil||0)||t<(p.rootUntil||0)){out.x=p.x;out.y=p.y;out.vx=out.vy=0;}
  if(msg.teleport&&fresh&&!p.forceMove&&t>=(p.controlUntil||0))p.teleportSeq=seq;
  if(!fresh){out.hp=p.hp;out.shield=p.shield;out.stam=p.stam;}
  if(fresh){
   // Shared-world monster damage is simulated by the defending client. Count
   // only acknowledged HP loss, never a stale replay or the initial login HP.
   if(hadInput&&number(msg.hp)&&Number(msg.hp)<p.hp){
    const lost=p.hp-clamp(msg.hp,0,p.maxHp||999999);
    if(lost>0){if(t-(p.escapeLastAt||0)>=2500)p.escapeDamage=0;
     p.escapeLastAt=t;p.escapeDamage=Math.min((p.maxHp||100)*.4,(p.escapeDamage||0)+lost);}
   }
   for(const k of ['maxShield','maxStam'])if(number(msg[k]))p[k]=clamp(msg[k],0,999999);
   for(const k of ['shield','stam'])if(number(msg[k]))p[k]=clamp(msg[k],0,p[k==='shield'?'maxShield':'maxStam']||999999);
   for(const k of timed){if(k==='stun'||k==='root'||k==='mark')continue;if(number(msg[k]))p[k+'Until']=t+clamp(msg[k],0,k==='invuln'?1:3)*1000;}
   if(number(msg.defenseReduction))p.defenseReduction=clamp(msg.defenseReduction,0,.75);
   p.block=!!msg.block&&t>=(p.stunUntil||0)&&p.shield>0;
   p.skillId=String(msg.skillId||'').slice(0,48);p.skillKind=String(msg.skillKind||'').slice(0,48);p.moveSpeed=clamp(msg.moveSpeed,0,3000);
   const s=msg.special||{};p.special={void3:clamp(s.void3,0,10),hold:!!s.hold,moveScale:clamp(s.moveScale??1,0,2)};
  }
  out.stun=p.stun;return out;
 }
 function record(p,t){
  const h=p.combatHistory||(p.combatHistory=[]);if(!h.length||t-h[h.length-1].t>=20)h.push({x:p.x,y:p.y,t});
  while(h.length>16||h.length&&t-h[0].t>400)h.shift();
 }
 function contact(b,e,t){
  if(!e.shape||C.contains(e,{x:b.x,y:b.y,r:18}))return true;
  const stamp=Number(e.observedAt);if(!Number.isFinite(stamp)||stamp<t-300||stamp>t)return false;
  const h=b.combatHistory||[];
  for(let i=1;i<h.length;i++){const a=h[i-1],z=h[i];if(a.t<=stamp&&stamp<=z.t){const u=(stamp-a.t)/Math.max(1,z.t-a.t);return C.contains(e,{x:a.x+(z.x-a.x)*u,y:a.y+(z.y-a.y)*u,r:18});}}
  return false;
 }
 function handle(a,msg){
  if(a.clientMode==='pvp'||!a.ready)return;
  const t=now(),seq=Math.floor(Number(msg.seq)||0);if(!seq||seq<=(a.combatInputSeq||0))return;a.combatInputSeq=seq;
  if(t-(a.combatBudgetAt||0)>1000){a.combatBudgetAt=t;a.combatBudget=0;}
  const events=(Array.isArray(msg.events)?msg.events:[]).slice(0,64);
  for(const e of events){
   if(++a.combatBudget>240)break;advance(a,t);
   if(e.kind==='stigmaFollowReady'){
    if(a.void3Mark&&t<a.void3Mark.until)continue;
    if(a.weapon!==3||a.hp<=0||t<(a.stunUntil||0))continue;
    const ids=(Array.isArray(e.targets)?e.targets:[]).slice(0,32).map(String).filter(id=>{const q=resolveTarget(id);return q&&q!==a&&q.hp>0&&!q.dead&&Math.hypot(q.x-a.x,q.y-a.y)<=550;});
    const landed=ids.filter(id=>{const h=a.confirmedSkillHits?.get(id);return h&&h.skillId==='hidden:1'&&t-h.at<=3000&&t>=(a.stigmaConsumed?.get(id)||0);});if(landed.length){const prior=a.stigmaFollow&&t<a.stigmaFollow.until?[...a.stigmaFollow.ids]:[];a.stigmaFollow={until:t+3000,ids:new Set([...prior,...landed])};a.stigmaReadyAfter=t+3000;}continue;
   }
   if(e.kind==='stigmaFollow'){
    if(a.void3Mark&&t<a.void3Mark.until)continue;
    const f=a.stigmaFollow,id=String(e.targetId||''),q=resolveTarget(id);
    if(a.weapon!==3||a.hp<=0||!f||t>f.until||!f.ids.has(id)||!q||q.hp<=0||q.dead||!number(e.x)||!number(e.y)||Math.hypot(e.x-q.x,e.y-q.y)>180)continue;
    f.ids.delete(id);a.stigmaConsumed??=new Map();a.stigmaConsumed.set(id,t+3000);a.stunUntil=0;a.stun=0;a.forceMove=null;a.controlUntil=0;a.controlBy=null;a.controlLeaseUntil=0;a.controlRevision=(a.controlRevision||0)+1;
    a.x=clamp(e.x,40,width-40);a.y=clamp(e.y,40,height-40);a.vx=a.vy=0;emit(a,{outcome:'stigmaCleanse',damage:0});continue;
   }
   if(e.kind==='escape'){
    // The defender can spend an earned escape even while stunned or knocked back.
    // Scripted guaranteed-hit sequences must finish before it becomes usable.
    const ready=(a.escapeDamage||0)>=Math.max(1,(a.maxHp||100)*.4)&&t-(a.escapeLastAt||0)<2500;
    const locked=t<(a.escapeGuaranteedUntil||0);
    if(!ready||locked||a.hp<=0){emit(a,{outcome:'escapeRejected',damage:0});continue;}
    a.escapeDamage=0;a.escapeLastAt=0;a.escapeGuaranteedUntil=0;
    a.forceMove=null;a.controlUntil=0;a.controlBy=null;a.controlLeaseUntil=0;
    a.stunUntil=0;a.stun=0;a.rootUntil=0;a.root=0;
    a.invulnUntil=t+1000;a.dodgeUntil=Math.max(a.dodgeUntil||0,t+200);
    a.controlRevision=(a.controlRevision||0)+1;a.vx=a.vy=0;
    emit(a,{outcome:'escape',damage:0});continue;
   }
   const b=players.get(String(e.targetId||''));if(b)advance(b,t);
   if(!allowed(a,b)||t<(a.stunUntil||0)||Math.hypot(a.x-b.x,a.y-b.y)>clamp(e.range||1100,40,1200)+80)continue;
   const kind=String(e.kind||'attack'),damageEvent=kind==='attack',hasLease=b.controlBy===a.id&&t<(b.controlLeaseUntil||0),galePulseControl=!damageEvent&&kind==='special'&&String(e.skillId||'')==='galeOrbit'&&String(a.skillId||'')==='galeOrbit'&&Math.hypot(a.x-b.x,a.y-b.y)<=320;
   if(!damageEvent&&!['control','special'].includes(kind))continue;
   if(!damageEvent&&!hasLease&&!galePulseControl)continue;
   // Pure shield blocks also resist queued pulls, stuns and follow-up control.
   if(!damageEvent&&b.block&&b.shield>0&&!e.bypassShield)continue;
   if(damageEvent&&!contact(b,e,t))continue;
   const guaranteedMeteorContact=damageEvent&&e.guaranteedContact===true&&String(e.skillId||'')==='meteorBreaker';
   if(t<(b.invulnUntil||0)&&damageEvent&&!guaranteedMeteorContact)continue;
   // A Void 3 mark only counters actual attacks from its marked opponent.
   const guard=b.void3Mark;
   if(damageEvent&&guard&&guard.targetId===a.id&&t<guard.until&&guard.remaining>0&&!guard.pending&&clamp(e.damage,0,5000)>0){
    guard.remaining--;guard.pending={at:t+50,enemyId:a.id};
    b.invulnUntil=t+140;b.block=false;b.parryWindowUntil=0;b.forceMove=null;
    const side=(guard.remaining%2?1:-1)*Math.PI/2,angle=(b.a||0)+side;
    const spot=clipTarget(b,{x:clamp(b.x+Math.cos(angle)*76,40,width-40),y:clamp(b.y+Math.sin(angle)*76,40,height-40)});
    b.x=spot.x;b.y=spot.y;b.vx=b.vy=0;b.teleportSeq=(b.teleportSeq||0)+1;
    b.controlUntil=Math.max(b.controlUntil||0,t+100);
    emit(b,{attackerId:a.id,outcome:'void3Evade',damage:0,void3Remaining:guard.remaining,void3Until:guard.until});
    continue;
   }
   let damage=0,outcome='control';
   if(damageEvent){
    let raw=clamp(e.damage,0,5000);if(!raw)continue;
    if(b.block&&b.shield>0&&!e.bypassShield&&!guaranteedMeteorContact){
     b.shieldDelayUntil=t+1400;
     if(e.parryable!==false&&t<(b.parryWindowUntil||0)&&!e.breakShield){b.parryWindowUntil=0;b.shield=Math.max(0,b.shield-4);if(b.shield<=0)b.block=false;b.stam=Math.min(b.maxStam||0,(b.stam||0)+28);b.invulnUntil=t+250;lease(a,{stun:1.25},t);a.forceMove=null;a.controlBy=null;emit(a,{attackerId:b.id,outcome:'parried',damage:0});emit(b,{attackerId:a.id,outcome:'parry',damage:0,procId:String(e.procId||'').slice(0,40)});b.controlBy=null;continue;}
     if(e.breakShield){b.shield=0;b.shieldBrokenUntil=t;b.block=false;}else{const cost=C.shieldCost(raw),before=b.shield;b.shield=Math.max(0,b.shield-cost);if(b.shield>0){emit(b,{attackerId:a.id,outcome:'blocked',damage:0,procId:String(e.procId||'').slice(0,40)});b.controlBy=null;continue;}b.shieldBrokenUntil=t;b.block=false;raw*=Math.max(0,1-before/cost);if(raw<=0){emit(b,{attackerId:a.id,outcome:'blocked',damage:0,procId:String(e.procId||'').slice(0,40)});b.controlBy=null;continue;}}
    }
    damage=C.damageAfterArmor(raw,b.defenseReduction||0);if(b.void3Mark)b.void3Mark=null;b.hp=Math.max(0,b.hp-damage);b.invulnUntil=t+100;b.shieldDelayUntil=t+1400;outcome='hit';
    b.controlBy=a.id;b.controlLeaseUntil=t+1400;
   }
   if(damage>0){
    if(t-(b.escapeLastAt||0)>=2500)b.escapeDamage=0;
    b.escapeLastAt=t;b.escapeDamage=Math.min((b.maxHp||100)*.4,(b.escapeDamage||0)+damage);
    // Mark scripted follow-up sequences; other attacks still allow a stun escape.
    if(String(e.skillId||'')==='meteorBreaker'){
     if(t>=(b.escapeGuaranteedUntil||0))b.escapeGuaranteedUntil=t+3800;
    }else if(['thunderDrive','moonEclipseChain','prismLance','voidDance','starRush'].includes(String(e.skillId||''))){
     b.escapeGuaranteedUntil=Math.max(b.escapeGuaranteedUntil||0,t+450);
    }
    // Arm only from a confirmed opening hit; the server counters never submit another cast event.
    if(String(e.skillId||'')==='gravityCut'&&a.swordStyle==='void'&&!a.void3Mark)
      a.void3Mark={targetId:b.id,until:t+10000,remaining:1,pending:null,damage:clamp(e.damage,1,5000)*.86};
    if(String(e.skillId||'')==='hidden:1')b.markUntil=Math.max(b.markUntil||0,t+3000);a.confirmedSkillHits??=new Map();a.confirmedSkillHits.set(b.id,{at:t,skillId:String(e.skillId||a.skillId||'')});if(a.confirmedSkillHits.size>64){for(const [id,h] of a.confirmedSkillHits)if(t-h.at>3000)a.confirmedSkillHits.delete(id);}}
   if(b.hp>0){lease(b,e,t);if(e.breakShield){b.shield=0;b.shieldBrokenUntil=t;b.block=false;}if(e.mark)b.markUntil=t+clamp(e.mark,0,5)*1000;if(e.stun>0){b.block=false;b.dodgeUntil=0;}}
   if(b.hp<=0){b.forceMove=null;b.controlBy=null;}
   emit(b,{attackerId:a.id,outcome,damage,prismCast:damage>0?String(e.prismCast||'').slice(0,64):'',skillId:String(e.skillId||a.skillId||'').slice(0,48),procId:String(e.procId||'').slice(0,40)});
   if(b.hp<=0){b.forceMove=null;b.controlBy=null;broadcast({type:'pvp:defeated',targetId:b.id,targetName:b.name,killerId:a.id,killerName:a.name});}
  }
 }
 function tick(){
  const t=now();
  for(const p of players.values())if(p.ready&&p.clientMode!=='pvp'){
   const moving=!!p.forceMove;advance(p,t);record(p,t);
   if(p.escapeDamage&&t-(p.escapeLastAt||0)>=2500)p.escapeDamage=0;
   const q=p.void3Mark;
   if(q&&q.pending&&t>=q.pending.at){
    const target=players.get(q.pending.enemyId);q.pending=null;
    if(!target||!allowed(p,target)){p.void3Mark=null;continue;}
    advance(target,t);
    const ox=p.x,oy=p.y,behind=(Number(target.a)||0)+Math.PI,distance=36+45;
    const spot=clipTarget(p,{x:clamp(target.x+Math.cos(behind)*distance,40,width-40),y:clamp(target.y+Math.sin(behind)*distance,40,height-40)});
    p.x=spot.x;p.y=spot.y;p.a=Math.atan2(target.y-p.y,target.x-p.x);p.vx=p.vy=0;p.forceMove=null;p.teleportSeq=(p.teleportSeq||0)+1;
    p.invulnUntil=Math.max(p.invulnUntil||0,t+130);
    emit(p,{attackerId:target.id,outcome:'void3Counter',damage:0,void3Remaining:q.remaining});
    {
     const d=C.damageAfterArmor(q.damage,target.defenseReduction||0),a=Math.atan2(target.y-p.y,target.x-p.x);
     target.hp=Math.max(0,target.hp-d);target.invulnUntil=t+100;target.block=false;target.void3Mark=null;
     if(t-(target.escapeLastAt||0)>=2500)target.escapeDamage=0;
     target.escapeLastAt=t;target.escapeDamage=Math.min((target.maxHp||100)*.4,(target.escapeDamage||0)+d);
     lease(target,{kind:'attack',stun:.75,dx:Math.cos(a)*220,dy:Math.sin(a)*220,duration:.3},t);
     emit(target,{attackerId:p.id,outcome:'hit',damage:d,skillId:'gravityCut',void3Counter:true});
     if(target.hp<=0){target.forceMove=null;broadcast({type:'pvp:defeated',targetId:target.id,targetName:target.name,killerId:p.id,killerName:p.name});}
    }
    if(q.remaining<=0||t>=q.until)p.void3Mark=null;
   }else if(q&&!q.pending&&(t>=q.until||q.remaining<=0))p.void3Mark=null;
   if(moving)broadcast({type:'player:state',player:{...publicState(p),...snapshot(p)}},null,{volatile:true});
  }
 }
 return {handle,ingest,snapshot,tick,advance,allowed};
}
