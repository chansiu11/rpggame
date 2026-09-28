const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
function section(a,b){const i=html.indexOf(a),j=html.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,'Missing source '+a);return html.slice(i,j);}
function makeWorld(hold=false){
 return new Function('hold',[
  "const window={EchoesSkillPrepare:{duration:.2,kind:()=> 'slash'}};",
  "const player={weapon:0,facing:0,stun:0,skillPose:-1,attackAnim:0,moveLock:0};let standardSkillHold=null,activeSwordSkill=null,void3State=null,calls=0;",
  "const skillInfo=()=>({id:'windSlash',holdContinuous:hold,locked:false}),hiddenFollowReady=()=>false,hiddenSkillCanStart=()=>true,cancelBasicAttackForSkill=()=>true,standardSkillCanPrepare=()=>true,aim=()=>{},cancelShieldForSkill=()=>{},triggerSkillShake=()=>{},cancelSkillPreparationOnStun=()=>{standardSkillHold=null;player.skillKind='';player.skillPose=-1;},beginHiddenSkillInput=()=>true,releaseHiddenSkillInput=()=>{},releaseVoid3WorldInput=()=>{},startVoid3World=()=>true;",
  "const startSwordSkill=()=>{calls++;return true},executeSkillNow=startSwordSkill,startHeldSwordSkill=()=>{calls++;activeSwordSkill={slot:0,held:true};return true},stopHeldSwordSkill=()=>{activeSwordSkill=null;return true};",
  section('function beginStandardSkillInput(index){','function skill(index=0)'),
  "return {player,down:()=>beginStandardSkillInput(0),up:()=>releaseStandardSkillInput(0),step:updateStandardSkillPrepare,get calls(){return calls},get active(){return activeSwordSkill}};"
 ].join('\n'))(hold);
}
function makePvp(hold=false){
 return new Function('hold',[
  "const window={EchoesSkillPrepare:{duration:.2,kind:()=> 'slash'}};",
  "const performance={now:()=>1000};let me={weapon:0,a:0,stun:0,skillPose:-1,attackAnim:0,moveLock:0,skillHold:null,skillEvent:null},enemy={hp:100},running=true,roundLocked=false,void3Pvp=null,calls=0;",
  "const pvpBasicSkillBlocked=()=>false,skillReady=()=>true,pvpSwordSkillAt=()=>({id:'windSlash',holdContinuous:hold,cfg:{mode:'windShot'}}),combatAimAngle=()=>0,cancelPvpBasicForSkill=()=>{},hiddenCanStart=()=>true,beginHidden=()=>true,releaseHidden=()=>{},startSwordSequence=()=>{calls++;return true},startWorldSwordHold=()=>{calls++;me.skillHold={kind:'worldSwordHold',index:0};return true},stopWorldSwordHold=()=>{me.skillHold=null},startVoid3Pvp=()=>true,releaseVoid3PvpInput=()=>{},startBowSkill=()=>true;",
  section('function grantPvpSkillBasicGrace(){','function switchWeapon(i){'),
  'function step(dt){const h=me.skillHold;if(h){'+section("if(h.kind==='inputPrepare'){","if(h.kind==='worldSwordHold'){")+'}}',
  "return {me,down:()=>skillDown(0),up:()=>skillUp(0),step,get calls(){return calls}};"
 ].join('\n'))(hold);
}
for(const [name,create] of [['world',makeWorld],['PVP (also used by AI)',makePvp]]){
 test(name+' short tap fires at 0.2s',()=>{const a=create();a.down();a.up();a.step(.199);assert.equal(a.calls,0);a.step(.001);assert.equal(a.calls,1);a.step(.3);assert.equal(a.calls,1);});
 test(name+' long tap waits for key release',()=>{const a=create();a.down();a.step(.22);assert.equal(a.calls,0);a.up();assert.equal(a.calls,1);});
 test(name+' continuous skill starts at 0.2s',()=>{const a=create(true);a.down();a.step(.199);assert.equal(a.calls,0);a.step(.001);assert.equal(a.calls,1);});
 test(name+' early-released continuous skill keeps first attack frame',()=>{const a=create(true);a.down();a.up();a.step(.2);assert.equal(a.calls,1);assert.equal((a.active||a.me.skillHold).tapReleaseAt,.02);});
 test(name+' stun cancels during preparation',()=>{const a=create();a.down();a.up();if(a.player)a.player.stun=.1;else a.me.stun=.1;a.step(.2);assert.equal(a.calls,0);});
}
test('preparation uses distinct skill-specific hand poses, not effect spawns',()=>{
 const window={};new Function('window',section('window.EchoesSkillPrepare={','const esc='))(window);
 assert.equal(window.EchoesSkillPrepare.duration,.2);
 const gestures=['slash','thrust','overhead','spin','bow'].map(k=>window.EchoesSkillPrepare.pose(k,0,1,1,1,-42,-56,.5));
 assert.equal(new Set(gestures.map(p=>JSON.stringify(p.hand))).size,5);
 const x=window.EchoesSkillPrepare.pose('slash',0,1,1,1,-42,-56,window.EchoesSkillPrepare.variant('windSlash'));
 const y=window.EchoesSkillPrepare.pose('slash',0,1,1,1,-42,-56,window.EchoesSkillPrepare.variant('dawnArc'));
 assert.notDeepEqual(x.hand,y.hand);
 assert.doesNotMatch(section('function updateStandardSkillPrepare(dt){','function skill(index=0)'),/ring\(|effects.push/);
});
test('headless AI runs same PVP input methods',()=>{
 const worker=fs.readFileSync(path.join(__dirname,'../multiplayer-server/ai/live-worker.js'),'utf8');
 const adapter=fs.readFileSync(path.join(__dirname,'../multiplayer-server/ai/arena-runtime.js'),'utf8');
 assert.match(worker,/arena\.api\.control\(brain\.step\(/);assert.match(adapter,/shared-pvp\.js/);
 assert.match(html,/if\(Number\.isInteger\(c\.skill\)\)skillDown\(c\.skill\);if\(Number\.isInteger\(c\.release\)\)skillUp\(c\.release\)/);
});