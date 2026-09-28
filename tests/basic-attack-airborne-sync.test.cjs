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
test('Arena basic attack blocks dash and shield until animation ends',()=>{
 const state={now:1000,hits:0,me:{attackCd:0,stun:0,exhaust:0,skillHold:null,skillEvent:null,weapon:0,combo:0,comboTimer:0,rune:'',a:0,stam:100,maxStam:100,dash:0,dashCd:0,galeRoot:0,perks:{flow:0,focus:0},shield:100,maxShield:100,shieldRearm:0,shieldBroken:0,shieldNeedsRelease:false}};
 const init="const performance={now:()=>state.now},me=state.me,roundLocked=false,void3Pvp=null,weaponData=[{cool:.32,range:94,arc:1.9,cost:0}],useStam=()=>true,combatAimAngle=()=>0,fighterAttack=()=>35,arcAttack=()=>state.hits++,window={EchoesCombat:{basicControl:()=>({force:0,stun:.5})}},burst=()=>{},ring=()=>{},keys=new Set(),pkey=x=>x,moveAngle=()=>0,ARENA_W=3600,ARENA_H=2100,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));";
 const run=new Function('state',[init,section(html,'function basic(){','function potion(){'),'return {basic,dash,beginBlock};'].join('\n'))(state);
 run.basic();assert.equal(state.hits,1);assert.equal(state.me.basicAttackLockUntil,1340);
 run.dash();run.beginBlock();assert.equal(state.me.dash,0);assert.equal(!!state.me.block,false);
 state.now=1341;run.beginBlock();assert.equal(state.me.block,true);state.me.block=false;run.dash();assert.equal(state.me.dash,.2);
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
