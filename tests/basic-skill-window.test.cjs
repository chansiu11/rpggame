const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');
function section(start,end){const i=html.indexOf(start),j=html.indexOf(end,i+start.length);assert.ok(i>=0&&j>i,'Missing source '+start);return html.slice(i,j);}
test('World: basic skill-cancel window is [0,100)ms even with mouse, keyboard or touch held',()=>{
 const state={now:1000,busy:false,mouse:{down:false},keys:new Set(),player:{attackCd:.32,attackAnim:.34,attackDuration:.34,heavy:false,strikePose:1}};
 const code="const performance={now:()=>state.now},mouse=state.mouse,keys=state.keys,player=state.player,skillActionBusy=()=>state.busy;let touchAttackPointer=null,basicAttackStartedAt=1000,basicAttackLockUntil=1340,bufferedAction=null,pendingAttack=false;";
 const fn=new Function('state',[code,section('function basicAttackHeld(){','function isSharedWorldItem('),"return {basicAttackHeld,basicAttackSkillBlocked,cancelBasicAttackForSkill,setTouch:v=>touchAttackPointer=v,reset:()=>{basicAttackStartedAt=1000;basicAttackLockUntil=1340;player.attackAnim=.34;player.attackCd=.32},getTimer:()=>[basicAttackStartedAt,basicAttackLockUntil]};"].join('\n'))(state);
 state.mouse.down=true;assert.equal(fn.basicAttackHeld(),true);assert.equal(fn.cancelBasicAttackForSkill(),true);assert.deepEqual(fn.getTimer(),[0,0]);
 fn.reset();state.mouse.down=false;state.keys.add('KeyZ');state.now=1099;assert.equal(fn.cancelBasicAttackForSkill(),true);
 fn.reset();state.keys.clear();fn.setTouch(3);state.now=1000;assert.equal(fn.cancelBasicAttackForSkill(),true);
 fn.reset();fn.setTouch(null);state.now=1100;assert.equal(fn.basicAttackSkillBlocked(),true);assert.equal(fn.cancelBasicAttackForSkill(),false);assert.equal(state.player.attackAnim,.34);
 state.now=1339;assert.equal(fn.cancelBasicAttackForSkill(),false);state.now=1340;assert.equal(fn.basicAttackSkillBlocked(),false);assert.equal(fn.cancelBasicAttackForSkill(),true);
 fn.reset();state.now=1050;state.busy=true;assert.equal(fn.cancelBasicAttackForSkill(),false);
});
test('World: standard and hidden inputs reject the late basic interval without stopping basic',()=>{
 const state={now:1000,player:{weapon:0,level:50,attackCd:.32,attackAnim:.34,attackDuration:.34,skillCds:[0,0,0,0,0],hiddenSkillCds:[0,0,0,0,0],cast:0,exhaust:0,dodge:0,parry:0,facing:0,heavy:false,strikePose:1}};
 const code="const performance={now:()=>state.now},player=state.player,skillInfo=()=>({locked:false,level:1,cool:.2}),canAct=()=>true,skillActionBusy=()=>false;const HIDDEN_SKILLS=[{level:1}],hiddenSkillHold=null,hiddenSkillFollowup=null,hiddenFollowReady=()=>false,triggerSkillShake=()=>{},hiddenSkillFacing=()=>0,hiddenMoveFacing=a=>a,triggerHiddenPrepared=()=>true,cancelShieldForSkill=()=>{};let basicAttackStartedAt=1000,basicAttackLockUntil=1340,standardSkillHold=null,activeSwordSkill=null,bufferedAction=null,pendingAttack=false;";
 const fn=new Function('state',[code,section('function basicAttackHeld(){','function isSharedWorldItem('),section('function hiddenSkillCanStart(index,allowFollow=false){','function hiddenCommit(index){'),section('function beginHiddenSkillInput(index){','function releaseHiddenSkillInput(index){'),section('function standardSkillCanPrepare(index){','function endVoid3World()'),"return {standardSkillCanPrepare,beginHiddenSkillInput,reset:()=>{basicAttackStartedAt=1000;basicAttackLockUntil=1340;player.attackCd=.32;player.attackAnim=.34;player.cast=0}};"].join('\n'))(state);
 assert.equal(fn.standardSkillCanPrepare(0),true);
 fn.reset();state.now=1100;assert.equal(fn.standardSkillCanPrepare(0),false);assert.equal(state.player.attackAnim,.34);
 state.player.weapon=3;assert.equal(fn.beginHiddenSkillInput(0),false);assert.equal(state.player.attackCd,.32);
 fn.reset();state.now=1099;assert.equal(fn.beginHiddenSkillInput(0),true,'hidden is allowed in first 100ms');
 fn.reset();state.now=1340;state.player.weapon=0;assert.equal(fn.standardSkillCanPrepare(0),true,'standard is available after animation');
});
test('PVP: first 100ms permits cancelling a basic, second phase blocks until animation ends',()=>{
 const state={now:1000,mouse:{down:true},keys:new Set(),me:{weapon:0,attackCd:.32,attackAnim:.34,attackDuration:.34,basicAttackLockUntil:1340,basicAttackStartedAt:1000,skillPose:-1,skillHold:null,skillEvent:null,cool:[0,0,0,0,0],stun:0,exhaust:0},running:true,roundLocked:false};
 const code="const performance={now:()=>state.now},mouse=state.mouse,keys=state.keys,me=state.me,running=state.running,roundLocked=state.roundLocked,pkey=x=>x;";
 const fn=new Function('state',[code,section('function pvpBasicHeld(){','function pvpMouseAimActive(){'),"return {pvpBasicSkillBlocked,pvpBasicCancelable,cancelPvpBasicForSkill,skillReady};"].join('\n'))(state);
 assert.equal(fn.skillReady(0),true);
 state.now=1099;assert.equal(fn.skillReady(0),true);
 state.now=1100;assert.equal(fn.pvpBasicSkillBlocked(),true);assert.equal(fn.skillReady(0),false);
 state.mouse.down=false;state.now=1339;assert.equal(fn.skillReady(0),false);
 state.now=1340;state.me.attackAnim=0;state.me.attackCd=.12;assert.equal(fn.skillReady(0),true);fn.cancelPvpBasicForSkill();assert.equal(state.me.attackCd,0);assert.equal(state.me.basicAttackLockUntil,0);assert.equal(state.me.basicAttackStartedAt,0);
});
test('PVP: button path and hidden followup respect basic lock and 0.2s wind-up',()=>{
 const state={now:1000,starts:0,me:{weapon:0,a:0,moveLock:0,skillBasicGraceUntil:0,skillBasicGraceUsed:true,attackCd:.32,attackAnim:.34,basicAttackLockUntil:1340,basicAttackStartedAt:1000,skillPose:-1,skillHold:null,skillEvent:null,stun:0,exhaust:0,block:false,dash:0,cool:[0,0,0,0,0]},roundLocked:false};
 const code="const window={EchoesSkillPrepare:{duration:.2,kind:()=> 'slash'}},me=state.me,performance={now:()=>state.now},roundLocked=state.roundLocked,mouse={down:false},keys=new Set(),pkey=x=>x,running=true,combatAimAngle=()=>0,pvpSwordSkillAt=()=>({id:'windSlash',cfg:{mode:'windShot'}}),startSwordSequence=()=>{state.starts++;return true;},startBowSkill=()=>false,hiddenSkillCanStart=()=>true;";
 const fn=new Function('state',[code,section('function pvpBasicHeld(){','function pvpMouseAimActive(){'),section('function hiddenCanStart(i,follow=false){','function beginHidden(i){'),section('function grantPvpSkillBasicGrace(){','function switchWeapon(i){'),"return {skillDown,skillUp,hiddenCanStart};"].join('\n'))(state);
 fn.skillDown(0);assert.equal(state.starts,0);assert.equal(state.me.skillHold.kind,'inputPrepare');
 state.me.skillHold.elapsed=.2;fn.skillUp(0);assert.equal(state.starts,1);
 state.me.weapon=3;assert.equal(fn.hiddenCanStart(0),true);
 state.me.weapon=0;state.now=1200;Object.assign(state.me,{skillHold:null,skillEvent:null,skillPose:-1,basicAttackLockUntil:1340,basicAttackStartedAt:1000,attackAnim:.34,attackCd:.32});
 fn.skillDown(0);assert.equal(state.me.skillHold,null);assert.equal(state.starts,1);
 state.me.weapon=3;assert.equal(fn.hiddenCanStart(0),false);assert.equal(fn.hiddenCanStart(1,true),false,'stigma followup is also blocked');
 state.now=1340;state.me.attackAnim=0;state.me.attackCd=0;state.me.weapon=0;fn.skillDown(0);assert.equal(state.me.skillHold.kind,'inputPrepare');assert.equal(state.starts,1);
 state.me.skillHold.elapsed=.2;fn.skillUp(0);assert.equal(state.starts,2);
});
