const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
function section(a,b){return html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)+a.length));}
function world(){return new Function(`
 const player={weapon:0,stun:0,skillPose:0,attackAnim:.15};let standardSkillHold={index:0,weapon:0,facing:1,elapsed:0},calls=0;
 const triggerSkillShake=()=>{},startSwordSkill=()=>{calls++;return true},executeSkillNow=startSwordSkill;
 const releaseVoid3WorldInput=()=>{},void3State=null,stopHeldSwordSkill=()=>{};
 function cancelSkillPreparationOnStun(){standardSkillHold=null;player.skillKind='';player.skillPose=-1;player.attackAnim=0;}
 ${section('function releaseStandardSkillInput(index){','function skill(index=0)')}
 return {player,release:()=>releaseStandardSkillInput(0),update:updateStandardSkillPrepare,get hold(){return standardSkillHold},get calls(){return calls}};
 `)();}
test('world tap waits 150ms, held input waits for release, stun cancels pending release',()=>{
 let w=world();w.release();w.update(.10);assert.equal(w.calls,0);w.update(.051);assert.equal(w.calls,1);w.update(.5);assert.equal(w.calls,1);
 w=world();w.update(.4);assert.equal(w.calls,0);w.release();assert.equal(w.calls,1);
 w=world();w.release();w.update(.05);w.player.stun=.2;w.update(.01);assert.equal(w.hold,null);w.player.stun=0;w.update(.3);w.release();assert.equal(w.calls,0);
});
test('arena release waits for preparation and cannot cast while stunned',()=>{
 const make=()=>new Function(`
 let me={weapon:0,stun:0,skillHold:{kind:'swordPrepare',index:0,a:0,elapsed:.05}},void3Pvp=null,calls=0;
 const startSwordSequence=()=>calls++,startBowSkill=()=>calls++,releaseHidden=()=>{},stopWorldSwordHold=()=>{},releaseVoid3PvpInput=()=>{};
 ${section('function skillUp(i){','function switchWeapon(i)')}
 return {me,release:()=>skillUp(0),get calls(){return calls}};
 `)();
 let a=make();a.release();assert.equal(a.calls,0);assert.equal(a.me.skillHold.released,true);a.me.skillHold.elapsed=.15;a.release();assert.equal(a.calls,1);a.release();assert.equal(a.calls,1);
 a=make();a.me.stun=.1;a.release();assert.equal(a.me.skillHold,null);assert.equal(a.calls,0);
});
test('anticipation uses distinct limb poses without spawning surrounding effects',()=>{
 const window={};new Function('window',section('window.EchoesSkillPrepare={','const esc='))(window);
 const poses=['slash','thrust','overhead','spin','bow'].map(k=>window.EchoesSkillPrepare.pose(k,0,1,1,1,-42,-56));
 assert.equal(new Set(poses.map(p=>JSON.stringify(p.hand))).size,5);assert.ok(poses.every(p=>p.footX!==5));
 assert.doesNotMatch(section('function updateStandardSkillPrepare(dt){','function skill(index=0)'),/ring\(|effects.push/);
});
