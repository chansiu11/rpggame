/* Shared deterministic primitives. Loaded by the browser and the world server. */
(function(root){
'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
const angle=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
function segment(px,py,x1,y1,x2,y2){const dx=x2-x1,dy=y2-y1,l=dx*dx+dy*dy;if(l<.001)return Math.hypot(px-x1,py-y1);const t=clamp(((px-x1)*dx+(py-y1)*dy)/l,0,1);return Math.hypot(px-x1-dx*t,py-y1-dy*t);}
function contains(m,p){
 const r=p.r||18,x=Number(m.x)||0,y=Number(m.y)||0,a=Number(m.a)||0;
 if(m.shape==='circle')return Math.hypot(p.x-x,p.y-y)<=clamp(m.r,10,500)+r;
 if(m.shape==='segment')return segment(p.x,p.y,+m.x1||0,+m.y1||0,+m.x2||0,+m.y2||0)<=clamp(m.r,5,200)+r;
 const dx=p.x-x,dy=p.y-y;
 if(m.shape==='rect'){const front=dx*Math.cos(a)+dy*Math.sin(a),side=-dx*Math.sin(a)+dy*Math.cos(a);return front>=-(+m.back||0)-r&&front<=clamp(m.forward,10,700)+r&&Math.abs(side)<=clamp(m.half,5,400)+r;}
 const dist=Math.hypot(dx,dy),arc=clamp(+m.arc||Math.PI*2,.2,Math.PI*2);
 return dist<=clamp(m.range,20,700)+r&&(arc>=6||Math.abs(angle(Math.atan2(dy,dx),a))<=arc/2+r/Math.max(30,dist));
}
function forcePoint(f,elapsed){const u=clamp(elapsed/Math.max(.22,f.max),0,1),ease=1-Math.pow(1-u,3);return {x:f.startX+(f.x-f.startX)*ease,y:f.startY+(f.y-f.startY)*ease,done:u>=1};}
const basicControl=final=>({stun:final?.75:.5,force:final?180:0});
function forceDuration(distance,requested){return clamp(Number.isFinite(requested)?requested:(.18+distance/900),.16,.8);}
const shieldCost=raw=>Math.max(12,raw*1.4);
const damageAfterArmor=(raw,reduction)=>Math.max(1,Math.round(raw*(1-clamp(reduction,0,.45))));
root.EchoesCombat=Object.freeze({version:2,basicControl,forceDuration,contains,segment,forcePoint,angle,shieldCost,damageAfterArmor});
})(globalThis);
