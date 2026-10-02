import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldCombat} from '../multiplayer-server/world-combat.js';
function fixture(){let time=10000;const player=id=>({id,ready:true,clientMode:'world',x:1000,y:1000,hp:1000,maxHp:1000,shield:500,maxShield:500,stam:100,maxStam:200,a:Math.PI});const a=player('a'),b=player('b');b.x=1100;const players=new Map([['a',a],['b',b]]),messages=[];const c=createWorldCombat({players,send(){},broadcast:m=>messages.push(m),publicState:p=>({id:p.id,x:p.x,y:p.y,hp:p.hp}),safeZone:(x)=>x<500,width:22000,height:11000,now:()=>time});let seq=0;return {a,b,c,messages,hit:(e={})=>c.handle(a,{seq:++seq,events:[{targetId:'b',kind:'attack',damage:100,...e}]}),step:n=>{time+=n;c.advance(a);c.advance(b);}};}
test('duplicate combat packet and duplicate input cannot double damage or roll state back',()=>{const f=fixture();f.hit();assert.equal(f.b.hp,900);f.c.handle(f.a,{seq:1,events:[{kind:'attack',targetId:'b',damage:100}]});assert.equal(f.b.hp,900);const state=f.c.ingest(f.b,{seq:1,combatAck:0,x:800,y:800,hp:1000});assert.equal(state.hp,900);assert.equal(state.x,1100);assert.equal(f.c.ingest(f.b,{seq:1}),null);});
test('forced movement wins over active input, settles, then permits fresh movement',()=>{const f=fixture();f.hit({dx:280,stun:.6,duration:.4});f.step(200);const x=f.b.x;assert.ok(x>1100&&x<1380);const state=f.c.ingest(f.b,{seq:1,combatAck:1,x:100,y:100,hp:900});assert.equal(state.x,x);f.step(500);assert.equal(f.b.x,1380);assert.equal(f.b.forceMove,null);const stale=f.c.ingest(f.b,{seq:2,combatAck:0,x:1100,hp:1000});assert.equal(stale.x,1380);const fresh=f.c.ingest(f.b,{seq:3,combatAck:f.b.combatRevision,x:1385,hp:900});assert.equal(fresh.x,1385);});
test('several forced deltas accumulate from server endpoint, no snap back',()=>{const f=fixture();f.hit({dx:100});f.c.handle(f.a,{seq:2,events:[{kind:'control',targetId:'b',dx:120,stun:.1}]});f.step(1000);assert.equal(f.b.x,1320);});
test('safe areas, party members, dead players and matchmaking clients excluded',()=>{for(const change of [f=>f.a.x=100,f=>{f.a.partyId=f.b.partyId='p'},f=>f.b.hp=0,f=>f.a.clientMode='pvp']){const f=fixture();change(f);const hp=f.b.hp;f.hit();assert.equal(f.b.hp,hp);}});
test('airborne sword skills ignore damage, stun and forced movement until landing',()=>{
 const f=fixture();f.b.skillLift=42;
 f.hit({damage:180,stun:1.1,dx:260});
 f.c.handle(f.a,{seq:2,events:[{kind:'control',targetId:'b',dx:180,stun:.8}]});
 assert.equal(f.b.hp,1000);assert.equal(f.b.x,1100);assert.ok(!f.b.forceMove);assert.ok(!(f.b.stunUntil>10000));
 f.b.skillLift=0;f.hit({damage:100,stun:.3,dx:100});
 assert.equal(f.b.hp,900,'damage resumes immediately after landing');assert.ok(f.b.forceMove);
});
test('invulnerability prevents damage and does not grant a control lease',()=>{const f=fixture();f.b.invulnUntil=11000;f.hit({dx:100});f.c.handle(f.a,{seq:2,events:[{kind:'control',targetId:'b',dx:100}]});assert.equal(f.b.hp,1000);assert.equal(f.b.x,1100);assert.ok(!f.b.forceMove);});
test('shield block, break and parry are resolved once by server',()=>{let f=fixture();f.b.block=true;f.hit();assert.equal(f.b.hp,1000);assert.equal(f.b.shield,360);f=fixture();f.b.block=true;f.b.parryWindowUntil=10200;f.hit({dx:200});assert.equal(f.b.hp,1000);assert.equal(f.b.shield,496);assert.ok(f.a.stunUntil>10000);assert.ok(!f.b.forceMove);f=fixture();f.b.block=true;f.hit({breakShield:true});assert.equal(f.b.shield,0);assert.equal(f.b.hp,900);});
test('mark and shield-break special states require an accepted hit lease',()=>{const f=fixture();f.c.handle(f.a,{seq:1,events:[{kind:'special',targetId:'b',mark:3,breakShield:true}]});assert.equal(f.b.shield,500);f.c.handle(f.a,{seq:2,events:[{kind:'attack',targetId:'b',damage:100},{kind:'special',targetId:'b',mark:3,breakShield:true}]});assert.equal(f.b.shield,0);assert.equal(f.c.snapshot(f.b).mark,3);});
test('attack geometry evaluates actual victim coordinate',()=>{const f=fixture();f.hit({shape:'circle',x:900,y:1000,r:30});assert.equal(f.b.hp,1000);f.hit({shape:'arc',x:1000,y:1000,a:0,range:130,arc:1});assert.equal(f.b.hp,900);});
test('shared geometry and cubic forced move primitives',()=>{const c=globalThis.EchoesCombat;assert.equal(c.contains({shape:'segment',x1:0,y1:0,x2:100,y2:0,r:5},{x:50,y:50,r:18}),false);assert.equal(c.contains({shape:'rect',x:0,y:0,a:0,forward:100,half:10},{x:50,y:0,r:18}),true);assert.deepEqual(c.forcePoint({startX:0,startY:0,x:100,y:0,max:.4},.4),{x:100,y:0,done:true});});
test('absolute tracking replaces an endpoint instead of adding it repeatedly',()=>{const f=fixture();f.hit({dx:100});for(let i=0;i<8;i++){f.c.handle(f.a,{seq:i+2,events:[{kind:'control',targetId:'b',x:1400,y:1000,duration:.25}]});f.step(25);}f.step(500);assert.equal(f.b.x,1400);});
test('attack shape origin is not interpreted as a force destination',()=>{const f=fixture();f.hit({shape:'circle',x:1100,y:1000,r:50,dx:100});f.step(500);assert.equal(f.b.x,1200);});
test('PVP armor and shield formulas have matching deterministic values',()=>{const C=globalThis.EchoesCombat;assert.equal(C.damageAfterArmor(100,.2),80);assert.equal(C.damageAfterArmor(100,1),25);assert.equal(C.shieldCost(100),140);assert.equal(C.shieldCost(1),12);const f=fixture();f.b.defenseReduction=.2;f.hit();assert.equal(f.b.hp,920);});
test('teleport is rejected during control and accepted with a fresh acknowledgement afterward',()=>{const f=fixture();f.hit({stun:.5});let s=f.c.ingest(f.b,{seq:1,combatAck:1,teleport:true,x:4000,y:4000});assert.equal(s.x,1100);assert.ok(!f.b.teleportSeq);f.step(600);s=f.c.ingest(f.b,{seq:2,combatAck:1,teleport:true,x:4000,y:4000});assert.equal(s.x,4000);assert.equal(f.b.teleportSeq,2);});
test('repeated wave impacts renew force from victim actual position, not old endpoint',()=>{
 const f=fixture(),C=globalThis.EchoesCombat;
 for(let i=0;i<5;i++){const x=f.b.x;f.hit({shape:'circle',x,y:f.b.y,r:32,range:1200,skillId:'dawnArc',dx:C.waveControl.force,stun:C.waveControl.stun,duration:C.forceDuration(180)});assert.equal(f.b.forceMove.startX,x);assert.equal(f.b.forceMove.x,x+180);f.step(110);}
 assert.equal(f.b.hp,500);assert.ok(f.b.x>1600);f.step(800);const end=f.b.x;assert.equal(f.c.ingest(f.b,{seq:1,combatAck:0,x:1100,y:1000}).x,end);
});
test('projectile cast acknowledgement is attached only to accepted damage',()=>{const f=fixture();f.hit({prismCast:'prism:1'});assert.equal(f.messages.at(-1).prismCast,'prism:1');const n=f.messages.length;f.hit({prismCast:'prism:2'});assert.equal(f.messages.length,n);});
test('Stigma follow-up requires an actual damaging mark and consumes that mark once',()=>{
 const f=fixture();f.a.weapon=3;
 f.hit({skillId:'hidden:1',procId:'mark-1'});assert.equal(f.b.hp,900);
 f.c.handle(f.a,{seq:2,events:[{kind:'stigmaFollowReady',targets:['b']}]});
 f.a.stunUntil=12000;f.a.controlUntil=12000;f.a.forceMove={startX:1000,startY:1000,x:800,y:1000,max:.4,startedAt:10000};
 f.c.handle(f.a,{seq:3,events:[{kind:'stigmaFollow',targetId:'b',x:1160,y:1000}]});
 assert.equal(f.a.stun,0);assert.equal(f.a.stunUntil,0);assert.equal(f.a.forceMove,null);assert.equal(f.a.controlUntil,0);
 assert.equal(f.messages.at(-1).outcome,'stigmaCleanse');assert.equal(f.a.x,1160);
 assert.equal(f.c.ingest(f.a,{seq:1,combatAck:0,x:1000,y:1000}).x,1160);
 f.a.stunUntil=12000;f.c.handle(f.a,{seq:4,events:[{kind:'stigmaFollowReady',targets:['b']}]});
 f.c.handle(f.a,{seq:5,events:[{kind:'stigmaFollow',targetId:'b',x:1160,y:1000}]});
 assert.equal(f.a.stunUntil,12000);
});
test('Stigma cleanse rejects missing or expired marks and wrong weapons',()=>{for(const mode of ['missing','expired','weapon']){const f=fixture();f.a.weapon=3;if(mode!=='missing'){f.hit({skillId:'hidden:1'});f.c.handle(f.a,{seq:2,events:[{kind:'stigmaFollowReady',targets:['b']}]});}if(mode==='expired')f.step(3001);if(mode==='weapon')f.a.weapon=0;f.a.stunUntil=20000;f.c.handle(f.a,{seq:3,events:[{kind:'stigmaFollow',targetId:'b',x:1160,y:1000}]});assert.equal(f.a.stunUntil,20000);}});

test('Blocking all HP damage rejects an on-hit proc, forced movement and follow-up mark',()=>{
 const f=fixture();f.a.weapon=3;f.b.block=true;f.b.shield=500;f.hit({damage:100,skillId:'hidden:1',procId:'blocked:1',dx:300,stun:1.2});
 assert.equal(f.b.hp,1000);assert.equal(f.b.x,1100);assert.ok(!f.b.forceMove);
 assert.equal(f.messages.at(-1).procId,'blocked:1');assert.equal(f.messages.at(-1).damage,0);
 f.c.handle(f.a,{seq:2,events:[{kind:'stigmaFollowReady',targets:['b']},{kind:'control',targetId:'b',dx:200,stun:1}]});
 assert.ok(!f.a.stigmaFollow);assert.ok(!f.b.forceMove);
 f.c.handle(f.a,{seq:3,events:[{kind:'stigmaFollow',targetId:'b',x:1160,y:1000}]});assert.equal(f.a.x,1000);
});
test('Exact shield depletion blocks all HP damage instead of leaking a minimum 1 HP',()=>{
 const f=fixture();f.b.block=true;f.b.shield=140;f.hit({damage:100,skillId:'hidden:1',procId:'shield-exact',dx:300,stun:.9});
 assert.equal(f.b.shield,0);assert.equal(f.b.hp,1000);assert.ok(!f.b.forceMove);
 assert.equal(f.messages.at(-1).outcome,'blocked');assert.equal(f.messages.at(-1).damage,0);
 assert.equal(f.messages.at(-1).procId,'shield-exact');
});
test('Breaking shield and actually hitting HP authorizes the impact proc',()=>{
 const f=fixture();f.b.block=true;f.hit({damage:100,breakShield:true,procId:'break:hit',dx:120});
 assert.equal(f.b.shield,0);assert.equal(f.b.hp,900);assert.equal(f.messages.at(-1).procId,'break:hit');
 assert.equal(f.messages.at(-1).damage,100);assert.ok(f.b.forceMove);
});

test('forty-percent damage builds an escape even while stunned and grants one second of server immunity',()=>{
 const f=fixture();let defenderSeq=0;
 for(const [i,damage] of [150,150,100].entries()){
  f.hit({damage,stun:.8,dx:60,procId:'escape-'+i});
  if(i<2)f.step(130);
 }
 assert.equal(f.b.escapeDamage,400);
 assert.ok(f.b.forceMove,'the normal launch is still active when the meter fills');
 f.c.handle(f.b,{seq:++defenderSeq,events:[{kind:'escape'}]});
 assert.equal(f.messages.at(-1).outcome,'escape');
 assert.equal(f.b.escapeDamage,0);
 assert.equal(f.b.forceMove,null);
 assert.equal(f.b.stunUntil,0);
 assert.equal(f.b.rootUntil,0);
 assert.equal(f.c.snapshot(f.b).invuln,1);
 const hp=f.b.hp;
 f.hit({damage:200,dx:120});
 assert.equal(f.b.hp,hp,'fresh attacks cannot hurt an escaped defender during immunity');
 f.step(900);
 f.hit({damage:200});
 assert.equal(f.b.hp,hp,'immunity should still apply just before one second');
 f.step(101);
 f.hit({damage:100});
 assert.equal(f.b.hp,hp-100,'hits return immediately after the one-second window');
});
test('damage escape resets after 2.5 seconds of no actual damage',()=>{
 const f=fixture();
 f.hit({damage:250});assert.equal(f.b.escapeDamage,250);
 f.step(2499);assert.equal(f.b.escapeDamage,250);
 f.step(1);f.c.tick();assert.equal(f.b.escapeDamage,0);
 f.c.handle(f.b,{seq:1,events:[{kind:'escape'}]});
 assert.equal(f.messages.at(-1).outcome,'escapeRejected');
 assert.equal(f.b.invuln||0,0);
 f.hit({damage:180});assert.equal(f.b.escapeDamage,180,'the new sequence begins with only its own damage');
});
test('shield blocks never fill the escape meter and scripted ultimate locks reject escape',()=>{
 const f=fixture();f.b.block=true;f.b.shield=500;
 f.hit({damage:100,skillId:'meteorBreaker'});
 assert.equal(f.b.escapeDamage||0,0,'a fully shielded impact does not count as lost HP');
 f.b.block=false;
 f.step(130);
 for(const damage of [200,200]){f.hit({damage,skillId:'meteorBreaker',stun:.9});f.step(130);}
 assert.equal(f.b.escapeDamage,400);
 f.c.handle(f.b,{seq:1,events:[{kind:'escape'}]});
 assert.equal(f.messages.at(-1).outcome,'escapeRejected','a confirmed meteor finisher cannot be interrupted mid-sequence');
 assert.ok(f.b.stunUntil>0);
 assert.equal(f.b.escapeDamage,400,'a rejected escape does not spend the earned gauge');
});

test('authoritative escape combines local monster HP loss with later world-PvP damage',()=>{
 const f=fixture();
 // The initial saved HP is not combat damage. Later acknowledged HP changes are.
 f.c.ingest(f.b,{seq:1,combatAck:0,hp:1000});
 assert.equal(f.b.escapeDamage||0,0);
 f.c.ingest(f.b,{seq:2,combatAck:0,hp:850});f.b.hp=850;
 assert.equal(f.b.escapeDamage,150);
 f.hit({damage:250,stun:.4,dx:120});
 assert.equal(f.b.escapeDamage,400);
 f.c.handle(f.b,{seq:1,events:[{kind:'escape'}]});
 assert.equal(f.messages.at(-1).outcome,'escape');
 assert.equal(f.b.forceMove,null);
});
