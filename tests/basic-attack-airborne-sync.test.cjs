const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');
const client=fs.readFileSync(path.resolve(__dirname,'../multiplayer-client.js'),'utf8');
const server=fs.readFileSync(path.resolve(__dirname,'../multiplayer-server/server.js'),'utf8');
function section(src,start,end){const i=src.indexOf(start),j=src.indexOf(end,i+start.length);assert.ok(i>=0&&j>i,'Missing code: '+start);return src.slice(i,j);}
test('World basic attack blocks dash and shield through animation, then releases',()=>{
 const state={now:1000,player:{attackCd:.34,parry:0,perfectWindow:0,dodge:0,stam:100,maxStam:100,shield:90,maxShield:90,shieldRearm:0,shieldBroken:0,perks:{flow:0,focus:0},facing:0,training:{dodge:false},stats:{dodges:0}}};
 const init="let basicAttackLockUntil=1340;const performance={now:()=>state.now},player=state.player,keys=new Set(['KeyC']),touchPointers=new Map(),canAct=()=>true,skillActionActive=()=>false,standardSkillHold=null,void3State=null,useStam=()=>true,queueAction=()=>{},joy={x:0,y:0},ring=()=>{},sound=()=>{},aim=()=>{};";
 const run=new Function('state',[init,section(html,'function dash(){','function hitPlayer('),'desktopShield=true;return {dash,parry,shieldHeld};'].join('\n'))(state);
 run.dash();run.parry();assert.equal(state.player.dodge,0);assert.equal(state.player.parry,0);assert.equal(run.shieldHeld(),false);
 state.now=1341;state.player.attackCd=0;run.parry();assert.ok(state.player.parry>.2);assert.equal(run.shieldHeld(),true);
 state.player.parry=0;run.dash();assert.equal(state.player.dodge,.2);
});
test('Arena held basic attacks impact after 0.2 seconds and keep the fifth-hit pose',()=>{
 const state={now:1000,hits:0,me:{attackCd:0,attackAnim:0,attackDuration:.26,basicMoveSlow:0,basicSeq:0,basicStage:0,basicVisual:0,basicAttackLockUntil:0,basicAttackStartedAt:0,pendingBasic:null,skillLift:0,skillPose:-1,stun:0,exhaust:0,skillHold:null,skillEvent:null,weapon:0,combo:0,comboTimer:0,rune:'',a:0,stam:100,maxStam:100,dash:0,dashCd:0,galeRoot:0,perks:{flow:0,focus:0},shield:100,maxShield:100,shieldRearm:0,shieldBroken:0,shieldNeedsRelease:false}};
 const init="const performance={now:()=>state.now},me=state.me,roundLocked=false,void3Pvp=null,weaponData=[{cool:.32,range:94,arc:1.9,cost:0}],useStam=()=>true,basicPvpAimAngle=()=>0,pvpBasicHeld=()=>true,fighterAttack=()=>35,arcAttack=()=>state.hits++,sendProjectile=()=>state.hits++,window={EchoesCombat:{basicControl:()=>({force:0,stun:.5})}},burst=()=>{},ring=()=>{},keys=new Set(),pkey=x=>x,moveAngle=()=>0,ARENA_W=3600,ARENA_H=2100,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));";
 const run=new Function('state',[init,section(html,'const PVP_BASIC_WINDUP=.2;','function potion(){'),'return {basic,updatePvpPendingBasic,dash,beginBlock};'].join('\n'))(state);
 run.basic();assert.equal(state.hits,0,'pressing basic must not damage immediately');assert.equal(state.me.basicAttackLockUntil,1200);assert.equal(state.me.basicSeq,1);assert.equal(state.me.basicStage,1);assert.equal(state.me.strikePose,0);assert.equal(state.me.basicAngle,0);assert.ok(state.me.basicVisual>=.3,'basic visual state must cover windup and impact pose');
 run.dash();run.beginBlock();assert.equal(state.me.dash,0);assert.equal(!!state.me.block,false);
 run.updatePvpPendingBasic(.19);assert.equal(state.hits,0);
 run.updatePvpPendingBasic(.01);assert.equal(state.hits,1,'impact occurs after the full 0.2 s windup');assert.equal(state.me.basicStage,2);
 state.me.attackCd=0;run.basic();assert.equal(state.hits,1,'the next held strike also waits for its windup');run.updatePvpPendingBasic(.2);assert.equal(state.hits,2);
 state.me.attackCd=0;state.me.combo=4;state.me.comboTimer=1;run.basic();assert.equal(state.me.combo,5);run.updatePvpPendingBasic(.2);
 assert.equal(state.me.combo,5,'fifth-hit combo number remains through the short impact animation');assert.equal(state.me.comboTimer,.12);assert.equal(state.me.attackAnim,.11);assert.ok(state.me.basicVisual>=.11,'impact pose must remain explicitly marked as a basic attack');
 run.beginBlock();assert.equal(state.me.block,true);state.me.block=false;run.dash();assert.equal(state.me.dash,.2);
 assert.ok(html.includes("if(pvpBasicHeld()&&me.attackCd<=0&&!me.skillHold&&!me.skillEvent)basic();"),'PVP hold path must keep auto-attacking');
 assert.ok(html.includes("if(basicAttackHeld()&&player.attackCd<=0)attack();"),'world/touch hold path must keep auto-attacking');
});
test('PVP basic animation sync advances by attack stage instead of rewinding on every state packet',()=>{
 assert.ok(html.includes("basicSeq:Math.max(0,Math.floor(Number(me.basicSeq)||0))"),'PVP state packet must carry a basic attack sequence');
 assert.ok(html.includes("basicStage:Math.floor(clamp(Number(me.basicStage)||0,0,2))"),'PVP state packet must carry windup/impact stage');
 assert.ok(html.includes("enemy.basicVisual=Math.max(0,(Number(enemy.basicVisual)||0)-dt)"),'remote visual timer must advance locally between packets');
 const syncSrc=section(html,'function syncRemotePvpBasic(f,m){','function onData(m)');
 const sync=new Function('clamp','PVP_BASIC_WINDUP',syncSrc+';return syncRemotePvpBasic;')((v,a,b)=>Math.max(a,Math.min(b,v)),.2);
 const enemy={basicSeq:0,basicStage:0,basicVisual:0,attackAnim:0,attackDuration:.26};
 assert.equal(sync(enemy,{basicSeq:11,basicStage:1,basicVisual:.28,attackAnim:.18,attackDuration:.2}),true);
 assert.equal(enemy.basicSeq,11);assert.equal(enemy.basicStage,1);assert.equal(enemy.attackAnim,.18);
 enemy.attackAnim=.12;enemy.basicVisual=.22;
 sync(enemy,{basicSeq:11,basicStage:1,basicVisual:.27,attackAnim:.19,attackDuration:.2});
 assert.equal(enemy.attackAnim,.12,'repeated windup packets must not rewind remote animation time');
 assert.equal(enemy.basicVisual,.22,'repeated windup packets must not rewind the local visual timer');
 sync(enemy,{basicSeq:11,basicStage:2,basicVisual:.10,attackAnim:.09,attackDuration:.11});
 assert.equal(enemy.basicStage,2);assert.equal(enemy.attackDuration,.11);assert.equal(enemy.attackAnim,.11);
 enemy.attackAnim=.06;
 sync(enemy,{basicSeq:11,basicStage:2,basicVisual:.09,attackAnim:.10,attackDuration:.11});
 assert.equal(enemy.attackAnim,.06,'repeated impact packets must not rewind the strike pose');
 assert.ok(html.includes("const netStep=pvpRoute==='DIRECT'?1/60:pvpRoute==='RELAY'?.025:.02;"),'existing DIRECT/RELAY state packet cadence must remain unchanged');
 assert.ok(html.includes("if(pingAt<=0&&conn?.open){pingAt=1;net({t:'ping',n:performance.now()})}"),'existing ping probe cadence must remain unchanged');
});
test('PVP basic renderer freezes each strike pose and facing until its visual ends',()=>{
 const draw=section(html,'function drawJourneyFighter(f,isMe)','function renderPvpEclipseFx(f)');
 assert.ok(draw.includes('const basicPose=clamp(Math.floor(Number(f.strikePose)||0),0,4)'));
 assert.ok(draw.includes('basicAttackPose(basicPose+1,basicWindupVisual'));
 const motion=section(html,'function animatePvpFighter(f,dt)','function prismPvpUninterruptible()');
 assert.ok(motion.includes("const visualFacing=(Number(f.basicVisual)||0)>0&&Number.isFinite(Number(f.basicAngle))?Number(f.basicAngle):f.a"));
 const syncSrc=section(html,'function syncRemotePvpBasic(f,m){','function onData(m)');
 const sync=new Function('clamp','PVP_BASIC_WINDUP',syncSrc+';return syncRemotePvpBasic;')((v,a,b)=>Math.max(a,Math.min(b,v)),.2);
 const enemy={a:2.2,basicSeq:0,basicStage:0,basicVisual:0,basicAngle:2.2,strikePose:0,attackAnim:0,attackDuration:.26};
 sync(enemy,{basicSeq:31,basicStage:1,basicVisual:.3,attackAnim:.2,attackDuration:.2,basicAngle:.75,strikePose:3,a:1.9,combo:4});
 assert.equal(enemy.basicAngle,.75);assert.equal(enemy.strikePose,3);
 enemy.basicVisual=.2;enemy.attackAnim=.1;
 sync(enemy,{basicSeq:31,basicStage:1,basicVisual:.29,attackAnim:.19,attackDuration:.2,basicAngle:-1.4,strikePose:0,a:-1.4,combo:1});
 assert.equal(enemy.basicAngle,.75,'same attack packets cannot rotate the stored visual facing');
 assert.equal(enemy.strikePose,3,'same attack packets cannot swap the stored strike pose');
});
test('PVP remote basic attack cannot inherit a stale skill/evade render state',()=>{
 const draw=section(html,'function drawJourneyFighter(f,isMe)','function renderPvpEclipseFx(f)');
 assert.ok(draw.includes("visualSkillKind=basicAttackVisual?'':String(f.skillKind||'')"),'basic rendering must blank stale skill kind');
 assert.ok(draw.includes("visualSkillPose=basicAttackVisual?-1:f.skillPose"),'basic rendering must blank stale skill pose');
 assert.ok(draw.includes("if(!basicAttackVisual&&visualSkillKind==='void3Evade')"),'void evade may hide the fighter only when a basic attack is not active');
 assert.ok(html.includes("if(remoteBasic){enemy.skillPose=-1;enemy.skillLift=0;enemy.skillKind='';enemy.skillId='';}"),'received basic state must clear stale remote skill visuals');
 assert.ok(html.includes("if(!duringSkill){me.basicMoveSlow=.5;me.skillLift=0;me.skillPose=-1;me.skillKind='';}"),'normal local basic start must clear stale skill visuals before sending state');
});
test('PVP protocol prevents cached old and current arena clients from mixing',()=>{
 assert.ok(html.includes("const ONLINE_PVP_V2=true,PVP_PROTOCOL=4"));
 assert.ok(html.includes("ruleset:'world-combat-20261002-pvp-basic-v4'"));
 assert.ok(server.includes("const PVP_RULESET = 'world-combat-20261002-pvp-basic-v4';"));
 assert.ok(html.includes("Number(m.v)!==PVP_PROTOCOL"));
 assert.ok(html.includes("String(m.ruleset||m.s?.ruleset||'')!==PVP_RULESET"));
 const ensure=section(html,'async function ensureMatchServer(s){','async function startMatchmaking(){');
 assert.equal(ensure.includes('serverRuleset'),false,'client must never downgrade itself to the server-advertised build id');
 assert.ok(ensure.includes('currentRuleset!==PVP_RULESET'),'an already connected old PVP profile must reconnect with the current ruleset');
});
test('World packets, server snapshots, and remote renderer share exact aerial height',()=>{
 assert.ok(client.includes('skillLift:p.skillLift'));
 assert.ok(html.includes('skillLift:Math.max(0,player.skillLift||0)'));
 assert.ok(html.includes('skillLift:Math.max(0,Number(rp.skillLift)||0)'));
 assert.ok(server.includes("'skillLift'"),'Server must ingest height');
 const src=section(server,'function publicPlayer(p){','function bossSnapshot');
 const render=new Function('worldCombat','clamp',src+'return {publicPlayer,publicPlayerState};')({snapshot:()=>({})},(x,a,b)=>Math.max(a,Math.min(b,x)));
 for(const fn of Object.values(render)){assert.equal(fn({id:'p',skillLift:82}).skillLift,82);assert.equal(fn({id:'p',skillLift:900}).skillLift,150);}
});
test('World packets preserve explicit basic visual state for remote players',()=>{
 assert.ok(html.includes('basicVisual:Math.max(0,player.basicVisual||0)'));
 assert.ok(client.includes('basicVisual:p.basicVisual'),'World websocket client must forward basic visual state');
 assert.ok(html.includes('rp.basicVisual=Math.max(0,(Number(rp.basicVisual)||0)-dt)'));
 assert.ok(server.includes("'basicVisual'"),'Server must ingest basic visual state');
 const src=section(server,'function publicPlayer(p){','function bossSnapshot');
 const render=new Function('worldCombat','clamp',src+'return {publicPlayer,publicPlayerState};')({snapshot:()=>({})},(x,a,b)=>Math.max(a,Math.min(b,x)));
 for(const fn of Object.values(render)){assert.equal(fn({id:'p',basicVisual:.31}).basicVisual,.31);assert.equal(fn({id:'p',basicVisual:9}).basicVisual,.5);}
 const draw=section(html,'function drawPlayer()','function drawEnemy(e)');
 assert.ok(draw.includes('const basicAttackVisual=(Number(p.basicVisual)||0)>0'));
 assert.equal(draw.includes('!!pendingBasicAttack'),false,'remote drawPlayer must not depend on the local pending attack');
});
test('Arena sends opponent aerial height and resets it after interruption',()=>{
 assert.ok(html.includes('skillLift:clamp(me.skillLift||0,0,150)'));
 assert.ok(html.includes('enemy.skillLift=clamp(Number(m.skillLift)||0,0,150)'));
 assert.ok(html.includes('if(me.stun>0){me.skillLift=0'));
 assert.ok(html.includes('if(!me.skillHold&&!me.skillEvent){me.skillLift=0;'));
});
test('World, arena, network client and server scripts parse',()=>{
 const sections=html.split('<script>');assert.equal(sections.length,3);
 new Function(sections[1].split('</script>')[0]);new Function(sections[2].split('</script>')[0]);
 new Function(client);new Function(server.replace(/^import .*;\s*$/gm,''));
});
