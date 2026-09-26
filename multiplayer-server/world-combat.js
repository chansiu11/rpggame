import './combat-core.js';
const C=globalThis.EchoesCombat;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
const number=v=>Number.isFinite(Number(v));
// One result revision covers health, control and special state. Input can acknowledge
// a result, but cannot replace its position until its control lease has finished.
export function createWorldCombat({players,send,broadcast,publicState,safeZone,width,height,allowParty=()=>false,clipTarget=(p,q)=>q,now=Date.now}){
 let eventSeq=0;
 const timed=['stun','invuln','dodge','parryWindow','shieldBroken','shieldDelay','mark'];
 function advance(p,t=now()){
  for(const k of timed)p[k]=Math.max(0,((p[k+'Until']||0)-t)/1000);
  if(p.forceMove){const q=C.forcePoint(p.forceMove,(t-p.forceMove.startedAt)/1000);p.x=q.x;p.y=q.y;p.vx=p.vy=0;if(q.done)p.forceMove=null;}
 }
 function snapshot(p){advance(p);return {teleportSeq:p.teleportSeq||0,combatRevision:p.combatRevision||0,controlRevision:p.controlRevision||0,shield:p.shield||0,maxShield:p.maxShield||0,stam:p.stam||0,maxStam:p.maxStam||0,block:!!p.block,stun:p.stun||0,invuln:p.invuln||0,dodge:p.dodge||0,parryWindow:p.parryWindow||0,shieldBroken:p.shieldBroken||0,shieldDelay:p.shieldDelay||0,mark:p.mark||0,forceMove:p.forceMove?{...p.forceMove,elapsed:(now()-p.forceMove.startedAt)/1000}:null,skillId:p.skillId||'',skillKind:p.skillKind||'',moveSpeed:p.moveSpeed||0,special:p.special||{}};}
 function emit(p,extra={}){p.combatRevision=(p.combatRevision||0)+1;const result={type:'world:combatResult',eventId:++eventSeq,targetId:p.id,serverTime:now(),...extra,player:{...publicState(p),...snapshot(p)}};broadcast(result);return result;}
 function allowed(a,b){return a&&b&&a!==b&&a.ready&&b.ready&&a.clientMode!=='pvp'&&b.clientMode!=='pvp'&&a.hp>0&&b.hp>0&&!safeZone(a.x,a.y)&&!safeZone(b.x,b.y)&&(!(a.partyId&&a.partyId===b.partyId)||allowParty(a,b));}
 function lease(p,e,t){
  const stun=clamp(e.stun,0,2.5);p.stunUntil=Math.max(p.stunUntil||0,t+stun*1000);
  const dx=clamp(e.dx??e.knockbackX,-720,720),dy=clamp(e.dy??e.knockbackY,-720,720);
  const track=e.kind!=='attack'&&number(e.x)&&number(e.y);
  if(dx||dy||track){const base=p.forceMove||p,duration=clamp(e.duration||(.18+Math.hypot(dx,dy)/900),.08,.8);
   const tx=track?p.x+clamp(e.x-p.x,-720,720):base.x+dx,ty=track?p.y+clamp(e.y-p.y,-720,720):base.y+dy,spot=clipTarget(p,{x:clamp(tx,40,width-40),y:clamp(ty,40,height-40)});
   p.forceMove={startX:p.x,startY:p.y,x:spot.x,y:spot.y,max:duration,startedAt:t};
   p.controlUntil=t+Math.max(.22,duration)*1000;p.controlRevision=(p.controlRevision||0)+1;
  }
  p.controlUntil=Math.max(p.controlUntil||0,p.stunUntil||0);
 }
 function ingest(p,msg){
  const t=now();advance(p,t);const seq=Math.floor(Number(msg.seq)||0);
  if(seq<= (p.inputSeq||0))return null;p.inputSeq=seq;
  const ack=Math.floor(Number(msg.combatAck)||0),fresh=ack===(p.combatRevision||0),out={...msg};
  if(!fresh||p.forceMove||t<(p.controlUntil||0)){out.x=p.x;out.y=p.y;out.vx=out.vy=0;}
  if(msg.teleport&&fresh&&!p.forceMove&&t>=(p.controlUntil||0))p.teleportSeq=seq;
  if(!fresh){out.hp=p.hp;out.shield=p.shield;out.stam=p.stam;}
  if(fresh){
   for(const k of ['maxShield','maxStam'])if(number(msg[k]))p[k]=clamp(msg[k],0,999999);
   for(const k of ['shield','stam'])if(number(msg[k]))p[k]=clamp(msg[k],0,p[k==='shield'?'maxShield':'maxStam']||999999);
   for(const k of timed){if(k==='stun'||k==='mark')continue;if(number(msg[k]))p[k+'Until']=t+clamp(msg[k],0,k==='invuln'?1:3)*1000;}
   if(number(msg.defenseReduction))p.defenseReduction=clamp(msg.defenseReduction,0,.45);
   p.block=!!msg.block&&t>=(p.stunUntil||0)&&p.shield>0;
   p.skillId=String(msg.skillId||'').slice(0,48);p.skillKind=String(msg.skillKind||'').slice(0,48);p.moveSpeed=clamp(msg.moveSpeed,0,3000);
   const s=msg.special||{};p.special={void3:clamp(s.void3,0,7),hold:!!s.hold,moveScale:clamp(s.moveScale??1,0,2)};
  }
  out.stun=p.stun;return out;
 }
 function handle(a,msg){
  if(a.clientMode==='pvp'||!a.ready)return;
  const t=now(),seq=Math.floor(Number(msg.seq)||0);if(!seq||seq<=(a.combatInputSeq||0))return;a.combatInputSeq=seq;
  if(t-(a.combatBudgetAt||0)>1000){a.combatBudgetAt=t;a.combatBudget=0;}
  const events=(Array.isArray(msg.events)?msg.events:[]).slice(0,64);
  for(const e of events){
   if(++a.combatBudget>240)break;advance(a,t);const b=players.get(String(e.targetId||''));if(b)advance(b,t);
   if(!allowed(a,b)||t<(a.stunUntil||0)||Math.hypot(a.x-b.x,a.y-b.y)>clamp(e.range||1100,40,1200)+80)continue;
   const kind=String(e.kind||'attack'),damageEvent=kind==='attack',hasLease=b.controlBy===a.id&&t<(b.controlLeaseUntil||0);
   if(!damageEvent&&!['control','special'].includes(kind))continue;
   if(!damageEvent&&!hasLease)continue;
   if(damageEvent&&e.shape&&!C.contains(e,{x:b.x,y:b.y,r:18}))continue;
   if(t<(b.invulnUntil||0)&&damageEvent)continue;
   let damage=0,outcome='control';
   if(damageEvent){
    let raw=clamp(e.damage,0,5000);if(!raw)continue;
    const facing=Math.abs(C.angle(Math.atan2(a.y-b.y,a.x-b.x),b.a||0))<1.7;
    if(b.block&&b.shield>0&&facing&&!e.bypassShield){
     b.shieldDelayUntil=t+1400;
     if(e.parryable!==false&&t<(b.parryWindowUntil||0)&&!e.breakShield){b.parryWindowUntil=0;b.shield=Math.max(0,b.shield-4);b.stam=Math.min(b.maxStam||0,(b.stam||0)+28);b.invulnUntil=t+250;lease(a,{stun:1.25},t);a.forceMove=null;a.controlBy=null;emit(a,{attackerId:b.id,outcome:'parried',damage:0});emit(b,{attackerId:a.id,outcome:'parry',damage:0});b.controlBy=null;continue;}
     if(e.breakShield){b.shield=0;b.shieldBrokenUntil=t+1500;b.block=false;}else{const cost=C.shieldCost(raw),before=b.shield;b.shield=Math.max(0,b.shield-cost);if(b.shield>0){emit(b,{attackerId:a.id,outcome:'blocked',damage:0});b.controlBy=null;continue;}b.shieldBrokenUntil=t+1500;b.block=false;raw*=Math.max(0,1-before/cost);}
    }
    damage=C.damageAfterArmor(raw,b.defenseReduction||0);b.hp=Math.max(0,b.hp-damage);b.invulnUntil=t+100;b.shieldDelayUntil=t+1400;outcome='hit';
    b.controlBy=a.id;b.controlLeaseUntil=t+1400;
   }
   if(b.hp>0){lease(b,e,t);if(e.breakShield){b.shield=0;b.shieldBrokenUntil=t+1500;b.block=false;}if(e.mark)b.markUntil=t+clamp(e.mark,0,5)*1000;if(e.stun>0||e.dx||e.dy||number(e.x)&&number(e.y)){b.block=false;b.dodgeUntil=0;}}
   if(b.hp<=0){b.forceMove=null;b.controlBy=null;}
   emit(b,{attackerId:a.id,outcome,damage,skillId:String(e.skillId||a.skillId||'').slice(0,48)});
   if(b.hp<=0){b.forceMove=null;b.controlBy=null;broadcast({type:'pvp:defeated',targetId:b.id,targetName:b.name,killerId:a.id,killerName:a.name});}
  }
 }
 function tick(){for(const p of players.values())if(p.ready&&p.clientMode!=='pvp'&&p.forceMove){advance(p);broadcast({type:'player:state',player:{...publicState(p),...snapshot(p)}});}}
 return {handle,ingest,snapshot,tick,advance,allowed};
}
