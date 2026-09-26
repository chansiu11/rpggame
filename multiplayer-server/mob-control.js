import './combat-core.js';
const C=globalThis.EchoesCombat;
export function advanceMobControl(m,now,move){
 if(!m.forceMove)return false;
 const q=C.forcePoint(m.forceMove,(now-m.forceMove.startedAt)/1000);
 move(m,q.x-m.x,q.y-m.y);
 if(q.done)m.forceMove=null;
 return true;
}
export function forceMob(m,dx,dy,now,duration=.28,move=null){
 const base=m.forceMove||m;
 m.forceMove={startX:m.x,startY:m.y,x:base.x+dx,y:base.y+dy,max:Math.max(.22,Math.min(.8,duration)),startedAt:now};
 if(move){const x=m.x,y=m.y;move(m,m.forceMove.x-x,m.forceMove.y-y);m.forceMove.x=m.x;m.forceMove.y=m.y;m.x=x;m.y=y;}
 m.attackAt=0;m.chargeUntil=0;m.recoverUntil=0;m.knockVX=m.knockVY=0;
}
