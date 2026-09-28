const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8'),world=fs.readFileSync(path.resolve(__dirname,'../multiplayer-server/world-combat.js'),'utf8'),core=fs.readFileSync(path.resolve(__dirname,'../multiplayer-server/combat-core.js'),'utf8');
function section(a,b){const i=html.indexOf(a),j=html.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,'missing '+a);return html.slice(i,j)}
test('world PvP only grants hit follow-ups when HP is damaged',()=>{
 const root={};new Function('globalThis',core)(root);
 const src=world.replace("import './combat-core.js';",'').replace('export function createWorldCombat','function createWorldCombat');
 const create=new Function('globalThis',src+';return createWorldCombat')({EchoesCombat:root.EchoesCombat});
 const messages=[],a={id:'a',x:100,y:100,hp:100,ready:true,clientMode:'world',weapon:3,skillId:'hidden:1',shield:0},
 b={id:'b',x:200,y:100,hp:100,ready:true,clientMode:'world',shield:1000,maxShield:1000,block:true},players=new Map([[a.id,a],[b.id,b]]);
 const combat=create({players,send:()=>{},broadcast:m=>messages.push(m),publicState:p=>({id:p.id,x:p.x,y:p.y,hp:p.hp,shield:p.shield}),safeZone:()=>false,width:3000,height:2000,now:()=>10000});
 const attack={kind:'attack',targetId:b.id,damage:50,skillId:'hidden:1',procId:'blocked-proc',shape:'circle',x:b.x,y:b.y,r:64,stun:.6,root:.3,dx:200,range:1200};
 combat.handle(a,{seq:1,events:[attack]});
 assert.equal(b.hp,100);assert.ok(!b.forceMove);assert.ok(!a.confirmedSkillHits?.has('b'));
 assert.equal(messages.find(m=>m.outcome==='blocked')?.procId,'blocked-proc');
 combat.handle(a,{seq:2,events:[{kind:'stigmaFollowReady',targets:['b']}]});
 assert.ok(!a.stigmaFollow);
 a.skillId='galeOrbit';
 combat.handle(a,{seq:3,events:[{kind:'special',skillId:'galeOrbit',targetId:'b',range:330,x:140,y:100,stun:.4,root:.2}]});
 assert.equal(b.x,200);assert.ok(!b.forceMove);
 a.skillId='hidden:1';b.shield=0;b.block=false;
 combat.handle(a,{seq:4,events:[{...attack,procId:'damage-proc'}]});
 assert.ok(b.hp<100);assert.equal(messages.find(m=>m.outcome==='hit')?.procId,'damage-proc');
 combat.handle(a,{seq:5,events:[{kind:'stigmaFollowReady',targets:['b']}]});
 assert.ok(a.stigmaFollow?.ids.has('b'));
});
function duel({shield=1000,parry=false,breakShield=false,contact=true}={}){
 const fragment=section('function hurt(raw,opts={})','function sendAttack(data,onHit=null)');
 const code=[
 "const me={x:100,y:100,r:18,hp:1000,maxHp:1000,shield,maxShield:1000,block:shield>0,parryWindow:parry?.25:0,stam:60,maxStam:100,inv:0,hitInv:0,defense:0,damageReduction:0,stun:0,galeRoot:0,rune:'none'},enemy={x:200,y:100},packets=[],pvpVortices=[{remote:true,id:'v',x:100,y:100,t:2,caught:null}];let pvpShake=0,void3Pvp=null;const roundLocked=false,running=true;",
 "const window={EchoesCombat:{contains:()=>contact,shieldCost:r=>Math.max(12,r*1.4),damageAfterArmor:r=>Math.max(1,Math.round(r)),forceDuration:()=>.22,forcePoint:()=>({})}};",
 "const performance={now:()=>1000},clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),net=m=>packets.push(m),ring=()=>{},burst=()=>{},pvpDamagePop=()=>{},pvpImpactShake=()=>{},roundEnd=()=>{},damageTaken=raw=>window.EchoesCombat.damageAfterArmor(raw),angleDiff=(a,b)=>a-b;",
 fragment,
 "receiveAttack({t:'atk',id:42,shape:'circle',x:100,y:100,r:64,d:50,stun:.5,root:.6,vortexId:'v',skillId:'starRush',stigmaMarkMs:3000,controlLease:'followup',breakShield});",
 "return {me,packets,vortex:pvpVortices[0]}"
 ].join('\n');
 return new Function('shield','parry','breakShield','contact',code)(shield,parry,breakShield,contact);
}
test('arena PvP shield blocks all effects as well as HP damage',()=>{
 const {me,packets,vortex}=duel();
 assert.equal(me.hp,1000);assert.ok(me.shield<1000);assert.equal(packets.find(p=>p.t==='attackResult')?.result,'blocked');
 assert.equal(me.stun,0);assert.equal(me.galeRoot,0);assert.ok(!me.controlLease);assert.ok(!me.stigmaMarkUntil);assert.equal(vortex.caught,null);
});
test('arena parry and miss do not count as hits',()=>{
 assert.equal(duel({parry:true}).packets.find(p=>p.t==='attackResult')?.result,'parried');
 assert.equal(duel({contact:false}).packets.find(p=>p.t==='attackResult')?.result,'miss');
});
test('arena shield break which deals HP damage still unlocks on-hit effects',()=>{
 const {me,packets,vortex}=duel({shield:20});
 assert.ok(me.hp<1000);assert.equal(packets.find(p=>p.t==='attackResult')?.result,'hit');
 assert.ok(me.stigmaMarkUntil);assert.ok(me.controlLease);assert.ok(vortex.caught);
});
test('attacker callbacks trigger only on confirmed HP damage',()=>{
 const arm=html.split('\n').find(l=>l.includes("else if(m.t==='attackResult')"));assert.ok(arm);
 const handle=new Function('m','pvpHitProcs','running','roundLocked','if(false){} '+arm);
 for(const outcome of ['blocked','parried','miss','ignored','hit']){
  const map=new Map(),events=[];map.set(42,()=>events.push('proc'));
  handle({t:'attackResult',id:42,result:outcome},map,true,false);
  assert.equal(map.size,0);assert.equal(events.length,outcome==='hit'?1:0);
 }
});
