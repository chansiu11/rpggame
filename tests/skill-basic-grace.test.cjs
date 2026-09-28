const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');
function section(start,end){const a=html.indexOf(start),b=html.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,'Missing '+start);return html.slice(a,b);}
test('World first 100ms permits one basic without cancelling current skill',()=>{
 const s={now:1000,graceUntil:1100,hits:0,player:{weapon:0,exhaust:0,dodge:0,attackCd:.6,cast:.55,parry:0,attackAnim:.55,attackDuration:.55,skillPose:2,attackAngle:1.25,attackArc:2,comboTimer:0,combo:0,rune:'',facing:0}};
 const init="const performance={now:()=>state.now},player=state.player,void3State=null,canAct=()=>true,skillActionBusy=()=>true,queueAction=()=>{},WEAPONS=[{reach:94,arc:1.9,cool:.32,cost:0}],damageValue=()=>35,basicMeleeHit=()=>state.hits++,hitSecretStatue=()=>{},moveBody=()=>{},effects=[],burst=()=>{},sound=()=>{},aim=()=>{};let skillBasicGraceUntil=state.graceUntil,skillBasicGraceUsed=false;";
 const run=new Function('state',[init,section('function attack(){','// Restore shared skill definitions'),'return {attack,used:()=>skillBasicGraceUsed};'].join('\n'))(s);
 run.attack();assert.equal(s.hits,1);assert.equal(s.player.skillPose,2);assert.equal(s.player.cast,.55);assert.equal(s.player.attackCd,.6);assert.equal(s.player.attackAngle,1.25);
 run.attack();s.now=1100;run.attack();assert.equal(s.hits,1,'No duplicate or late basic');
});
test('World skill input grants grace only if skill is accepted, including hidden skills',()=>{
 const s={now:3000,weapon:0,accept:false,held:false};
 const init="const player={get weapon(){return state.weapon}},performance={now:()=>state.now};let skillBasicGraceUntil=0,skillBasicGraceUsed=false;const beginStandardSkillInput=()=>state.accept,beginHiddenSkillInput=()=>state.accept,basicAttackHeld=()=>state.held;";
 const run=new Function('state',[init,section('function pressSkillWithBasicGrace(index){',"$('skillTray').addEventListener"),'return {pressSkillWithBasicGrace,getUntil:()=>skillBasicGraceUntil};'].join('\n'))(s);
 assert.equal(run.pressSkillWithBasicGrace(0),false);assert.equal(run.getUntil(),0);
 s.accept=true;s.held=true;assert.equal(run.pressSkillWithBasicGrace(0),false);assert.equal(run.getUntil(),0);
 s.held=false;assert.equal(run.pressSkillWithBasicGrace(0),true);assert.equal(run.getUntil(),3100);
 s.weapon=3;s.now=4000;assert.equal(run.pressSkillWithBasicGrace(1),true);assert.equal(run.getUntil(),4100);
});
test('PVP first 100ms permits one basic without cancelling current skill',()=>{
 const s={now:2000,hits:0,me:{weapon:0,attackCd:.6,attackAnim:.55,attackDuration:.55,stun:0,exhaust:0,skillHold:{kind:'swordPrepare'},skillEvent:null,skillBasicGraceUntil:2100,skillBasicGraceUsed:false,combo:0,comboTimer:0,rune:'',a:0}};
 const init="const performance={now:()=>state.now},me=state.me,void3Pvp=null,roundLocked=false,weaponData=[{range:94,arc:1.9,cool:.32,cost:0}],useStam=()=>true,combatAimAngle=()=>0,fighterAttack=()=>35,arcAttack=()=>state.hits++,window={EchoesCombat:{basicControl:()=>({force:0,stun:.5})}},burst=()=>{};";
 const run=new Function('state',[init,section('function basic(){','function dash(){'),'return basic;'].join('\n'))(s);
 run();assert.equal(s.hits,1);assert.equal(s.me.skillHold.kind,'swordPrepare');assert.equal(s.me.attackCd,.6);assert.equal(s.me.skillBasicGraceUsed,true);
 run();s.now=2100;run();assert.equal(s.hits,1,'No duplicate or late basic');
});

test('PVP keydown starts tap sword skill and grace immediately, rejects unavailable skills',()=>{
 const s={now:5000,ready:true,held:false,starts:0,me:{weapon:0,skillBasicGraceUntil:0,skillBasicGraceUsed:true},roundLocked:false};
 const init="const performance={now:()=>state.now},me=state.me,roundLocked=state.roundLocked,skillReady=()=>state.ready,pvpSwordSkillAt=()=>({id:'windSlash',cfg:{mode:'windShot'}}),combatAimAngle=()=>0,startSwordSequence=()=>{state.starts++;me.skillEvent={kind:'swordSeq'};return true;},startBowSkill=()=>false,pvpBasicHeld=()=>state.held;";
 const run=new Function('state',[init,section('function grantPvpSkillBasicGrace(){','function skillUp(i){'),'return skillDown;'].join('\n'))(s);
 s.held=true;run(0);assert.equal(s.starts,0);assert.equal(s.me.skillBasicGraceUntil,0);
 s.held=false;run(0);assert.equal(s.starts,1);assert.equal(s.me.skillEvent.kind,'swordSeq');assert.equal(s.me.skillBasicGraceUntil,5100);assert.equal(s.me.skillBasicGraceUsed,false);
 s.now=6000;s.ready=false;run(0);assert.equal(s.starts,1);assert.equal(s.me.skillBasicGraceUntil,5100);
});
test('World standard skills start on keydown instead of waiting for release',()=>{
 const s={weapon:0,ready:true,starts:0,bowStarts:0,holdStarts:0};
 const init="const player={get weapon(){return state.weapon},facing:0,skillPose:-1},standardSkillCanPrepare=()=>state.ready,skillInfo=()=>({id:'windSlash',cfg:{mode:'windShot'},color:'#fff'}),aim=()=>{},cancelShieldForSkill=()=>{},triggerSkillShake=()=>{},startSwordSkill=()=>{state.starts++;player.skillPose=0;return true;},executeSkillNow=()=>{state.bowStarts++;player.skillPose=1;return true;},startVoid3World=()=>true,startHeldSwordSkill=()=>{state.holdStarts++;return true;};let standardSkillHold=null;";
 const run=new Function('state',[init,section('function beginStandardSkillInput(index){','function releaseStandardSkillInput(index){'),'return {beginStandardSkillInput,getHold:()=>standardSkillHold};'].join('\n'))(s);
 assert.equal(run.beginStandardSkillInput(0),true);assert.equal(s.starts,1);assert.equal(run.getHold(),null);
 s.weapon=2;assert.equal(run.beginStandardSkillInput(1),true);assert.equal(s.bowStarts,1);assert.equal(run.getHold(),null);
 s.ready=false;assert.equal(run.beginStandardSkillInput(2),false);assert.equal(s.starts,1);
});
test('World missed 100ms basic preserves running skill pose, duration and movement',()=>{
 const skill={kind:'skyFall',elapsed:.04},s={now:1000,hits:0,moves:0,player:{weapon:0,exhaust:0,dodge:0,attackCd:.82,cast:.82,parry:0,attackAnim:.82,attackDuration:.92,skillPose:2,skillKind:'skyFall',attackAngle:1.1,attackArc:1.3,strikePose:3,heavy:true,moveLock:.8,comboTimer:0,combo:0,rune:'',facing:.7}};
 const init="const performance={now:()=>state.now},player=state.player,void3State=null,canAct=()=>true,skillActionBusy=()=>true,queueAction=()=>{},WEAPONS=[{reach:94,arc:1.9,cool:.32,cost:0}],damageValue=()=>35,basicMeleeHit=()=>{state.hits++;return 0;},hitSecretStatue=()=>{},moveBody=()=>state.moves++,effects=[],burst=()=>{},sound=()=>{},aim=()=>{player.facing=0;};let skillBasicGraceUntil=1100,skillBasicGraceUsed=false;";
 const run=new Function('state',[init,section('function attack(){','// Restore shared skill definitions'),'return attack;'].join('\n'))(s);
 run();assert.equal(s.hits,1);assert.equal(s.moves,0);assert.equal(s.player.skillPose,2);assert.equal(s.player.skillKind,'skyFall');assert.equal(s.player.cast,.82);assert.equal(s.player.attackCd,.82);assert.equal(s.player.attackAnim,.82);assert.equal(s.player.attackDuration,.92);assert.equal(s.player.strikePose,3);assert.equal(s.player.heavy,true);assert.equal(s.player.moveLock,.8);assert.equal(s.player.facing,.7);
 run();assert.equal(s.hits,1);
});
test('PVP missed 100ms basic keeps the active skill sequence and its attack timer',()=>{
 const running={kind:'swordSeq',elapsed:.04},s={now:2000,hits:0,me:{weapon:0,attackCd:.82,attackAnim:.82,attackDuration:.92,stun:0,exhaust:0,skillHold:null,skillEvent:running,skillPose:2,skillKind:'skyFall',moveLock:.8,postSkillLock:.9,skillBasicGraceUntil:2100,skillBasicGraceUsed:false,combo:0,comboTimer:0,rune:'',a:.75}};
 const init="const performance={now:()=>state.now},me=state.me,void3Pvp=null,roundLocked=false,weaponData=[{range:94,arc:1.9,cool:.32,cost:0}],useStam=()=>true,combatAimAngle=()=>0,fighterAttack=()=>35,arcAttack=()=>state.hits++,window={EchoesCombat:{basicControl:()=>({force:0,stun:.5})}},burst=()=>{};";
 const run=new Function('state',[init,section('function basic(){','function dash(){'),'return basic;'].join('\n'))(s);
 run();assert.equal(s.hits,1);assert.strictEqual(s.me.skillEvent,running);assert.equal(s.me.skillPose,2);assert.equal(s.me.skillKind,'skyFall');assert.equal(s.me.attackCd,.82);assert.equal(s.me.attackAnim,.82);assert.equal(s.me.attackDuration,.92);assert.equal(s.me.moveLock,.8);assert.equal(s.me.postSkillLock,.9);assert.equal(s.me.a,.75);
 run();assert.equal(s.hits,1);
});

test('World blocks skills while mouse, keyboard or mobile basic is held; releasing permits cancelling active basic',()=>{
 const s={now:1000,mouse:{down:false},keys:new Set(),touch:null,busy:false,player:{attackCd:.32,attackAnim:.34,attackDuration:.34,heavy:false,strikePose:2}};
 const init="const mouse=state.mouse,keys=state.keys,player=state.player,performance={now:()=>state.now},skillActionBusy=()=>state.busy;let touchAttackPointer=null,basicAttackLockUntil=1340,bufferedAction=null,pendingAttack=false;";
 const fn=new Function('state',[init,section('function basicAttackHeld(){','function isSharedWorldItem('),'return {basicAttackHeld,cancelBasicAttackForSkill,setTouch:v=>touchAttackPointer=v,getLock:()=>basicAttackLockUntil};'].join('\n'))(s);
 s.mouse.down=true;assert.equal(fn.basicAttackHeld(),true);assert.equal(fn.cancelBasicAttackForSkill(),false);assert.equal(s.player.attackAnim,.34);
 s.mouse.down=false;s.keys.add('KeyZ');assert.equal(fn.cancelBasicAttackForSkill(),false);
 s.keys.clear();fn.setTouch(3);assert.equal(fn.cancelBasicAttackForSkill(),false);
 fn.setTouch(null);s.busy=true;assert.equal(fn.cancelBasicAttackForSkill(),false);
 s.busy=false;assert.equal(fn.cancelBasicAttackForSkill(),true);assert.equal(s.player.attackCd,0);assert.equal(s.player.attackAnim,0);assert.equal(fn.getLock(),0);
});
test('PVP distinguishes an unfinished basic from held input and an active skill animation',()=>{
 const s={now:1000,mouse:{down:false},keys:new Set(),me:{attackCd:.32,attackAnim:.34,attackDuration:.34,basicAttackLockUntil:1340,skillPose:-1,skillHold:null,skillEvent:null,cool:[0,0,0,0,0],stun:0,exhaust:0},running:true,roundLocked:false};
 const init="const performance={now:()=>state.now},mouse=state.mouse,keys=state.keys,me=state.me,running=state.running,roundLocked=state.roundLocked,pkey=k=>k;";
 const fn=new Function('state',[init,section('function pvpBasicHeld(){','function pvpMouseAimActive(){'),'return {pvpBasicHeld,pvpBasicCancelable,cancelPvpBasicForSkill,skillReady};'].join('\n'))(s);
 s.keys.add('KeyZ');assert.equal(fn.pvpBasicHeld(),true);assert.equal(fn.skillReady(0),false);
 s.keys.clear();s.mouse.down=true;assert.equal(fn.skillReady(0),false);
 s.mouse.down=false;assert.equal(fn.skillReady(0),true);
 s.me.skillPose=2;assert.equal(fn.pvpBasicCancelable(),false,'Active bow skill is not a cancelable basic');assert.equal(fn.skillReady(0),false);
 s.me.skillPose=-1;s.me.skillEvent={kind:'swordSeq'};assert.equal(fn.pvpBasicCancelable(),false);
 s.me.skillEvent=null;s.now=1340;assert.equal(fn.pvpBasicCancelable(),false);
 s.now=1100;assert.equal(fn.pvpBasicCancelable(),true);fn.cancelPvpBasicForSkill();assert.equal(s.me.attackCd,0);assert.equal(s.me.attackAnim,0);assert.equal(s.me.basicAttackLockUntil,0);
});
test('PVP commits skill during released basic animation and does not cancel a failed skill',()=>{
 const s={now:2000,mouse:{down:false},keys:new Set(),stam:100,me:{weapon:0,attackCd:.32,attackAnim:.34,attackDuration:.34,basicAttackLockUntil:2340,skillPose:-1,skillHold:null,skillEvent:null,cool:[0,0,0,0,0],combo:1,comboTimer:1,stun:0,exhaust:0}};
 const init="const performance={now:()=>state.now},mouse=state.mouse,keys=state.keys,me=state.me,pkey=k=>k,pvpSwordSkillAt=()=>({cost:20,cool:5}),SKILL_COST=[20],SKILL_CD=[5],useStam=n=>{if(state.stam<n)return false;state.stam-=n;return true},cdrScale=()=>1;";
 const fn=new Function('state',[init,section('function pvpBasicHeld(){','function pvpMouseAimActive(){'),section('function commitSkill(','function startWorldSwordHold('),'return {commitSkill};'].join('\n'))(s);
 s.keys.add('KeyZ');assert.equal(fn.commitSkill(0),true,'Caller must enforce held-button guard before commit'); // Test helper itself only handles accepted transactions.
 assert.equal(s.me.attackCd,.32,'Holding basic cannot cancel the animation');
 s.me.cool[0]=0;s.me.skillPose=-1;s.keys.clear();s.stam=0;assert.equal(fn.commitSkill(0),false);assert.equal(s.me.attackCd,.32);
 s.stam=100;assert.equal(fn.commitSkill(0),true);assert.equal(s.me.attackCd,0);assert.equal(s.me.attackAnim,0);assert.equal(s.me.basicAttackLockUntil,0);assert.equal(s.me.cool[0],5);assert.equal(s.stam,80);
});
