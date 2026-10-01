const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{spawn}=require('node:child_process');
const {WebSocket}=require('../multiplayer-server/node_modules/ws');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(root+'/index.html','utf8');
function boot(){
const noop=()=>{},ctx=new Proxy({measureText:()=>({width:20}),createLinearGradient:()=>({addColorStop:noop}),createRadialGradient:()=>({addColorStop:noop})},{get:(o,k)=>o[k]||noop,set:(o,k,v)=>(o[k]=v,true)});
const nodes=new Map();function node(id=''){if(nodes.has(id))return nodes.get(id);const n={id,clientWidth:1200,clientHeight:800,style:{setProperty:noop,removeProperty:noop},classList:{add:noop,remove:noop,toggle:noop,contains:()=>false},dataset:{},addEventListener:noop,getContext:()=>ctx,querySelectorAll:q=>q==='[data-skill]'?Array.from({length:5},(_,i)=>{const b=node('skill'+i);b.dataset.skill=String(i);return b;}):[],querySelector:q=>node(q),getBoundingClientRect:()=>({x:0,y:0,left:0,top:0,width:1200,height:800}),children:[],appendChild:noop,remove:noop,focus:noop,setAttribute:noop,innerHTML:'',textContent:'',width:1200,height:800};nodes.set(id,n);return n;}
const storage=new Map([['echoes_accounts_v1',JSON.stringify({qa:{username:'qa',displayName:'qa'}})],['echoes_account_session_v1','qa']]);const localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
const c={console,performance,Date,Math,Map,Set,Array,JSON,Number,String,Object,Boolean,Infinity,Promise,Uint8Array,Float32Array,Float64Array,Int32Array,localStorage,sessionStorage:localStorage,setTimeout:noop,clearTimeout:noop,setInterval:noop,clearInterval:noop,requestAnimationFrame:noop,addEventListener:noop,matchMedia:()=>({matches:false,addEventListener:noop}),innerWidth:1200,innerHeight:800,devicePixelRatio:1,navigator:{maxTouchPoints:0,userAgent:'test'},location:{protocol:'http:',hostname:'localhost'},document:{getElementById:node,querySelectorAll:()=>[],querySelector:q=>node(q),createElement:()=>node(Math.random()),addEventListener:noop,documentElement:node('html'),body:node('body'),hidden:false},__PLAYTEST__:true};c.window=c;c.globalThis=c;c.Image=class{};vm.createContext(c);
let script=html.split('<script>')[1].split('</script>')[0];script=script.replace('// QA hooks', 'window.testHooks={chooseSwordStyle,render,validateSave,startOnlineWorld,setTrainer:()=>swordTrainerSession=true};\n// QA hooks');

vm.runInContext(fs.readFileSync(root+'/multiplayer-server/combat-core.js','utf8'),c);
vm.runInContext(script,c,{filename:'index-inline.js'});
return {c,g:c.__game,h:c.testHooks,storage,nodes};
}

const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(fn){for(let i=0;i<200;i++){if(fn())return;await delay(10);}throw Error('timed out');}
async function arena(port,id){
 const out=boot(),{c,g,storage}=out;g.beginNew('normal');g.player.level=200;g.player.swordStyle='gale';g.player.equippedSwordSkills=[...g.SWORD_STYLE_GROUPS[0].skills];g.saveGame();
 const raw=[...storage.entries()].find(([k])=>k.startsWith('echoes_wild_save_v1'))[1];storage.set('echoes_account_session_v1',id);storage.set('echoes_wild_save_v1::account::'+id,raw);
 Object.assign(c,{WebSocket,setTimeout,clearTimeout,queueMicrotask,ECHOES_MULTIPLAYER_CONFIG:{serverUrl:'ws://127.0.0.1:'+port}});
 vm.runInContext(fs.readFileSync(root+'/multiplayer-client.js','utf8'),c);
 vm.runInContext(fs.readFileSync(root+'/pvp-transport.js','utf8'),c);
 const script=html.split('<script>')[2].split('</script>')[0].replace('showLobby();requestAnimationFrame(loop);',"window.arenaTest={spawnPvpGaleVortex,updateSkillSystem,resetRound,startMatchmaking,net,stopNet,onData,update,burst,pushFx,sendProjectile,get effects(){return fx;},get projectiles(){return projectiles;},get running(){return running;},get me(){return me;},get enemy(){return enemy;},get room(){return room;}};showLobby();requestAnimationFrame(loop);");
 vm.runInContext(script,c,{filename:'pvp-inline.js'});return out;
}
test('two real clients enter arena without PeerJS, exchange packets, reject outsiders and close cleanly',{timeout:15000},async()=>{
 const port=19000+Math.floor(Math.random()*10000),server=spawn(process.execPath,['server.js'],{cwd:root+'/multiplayer-server',env:{...process.env,PORT:String(port)}});let logs='',errors='';server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>errors+=b);const clients=[];
 try{
  await waitFor(()=>logs.includes('listening'));
  const a=await arena(port,'relay-a'),b=await arena(port,'relay-b');clients.push(a,b);
  assert.equal(a.c.Peer,undefined);await a.c.arenaTest.startMatchmaking();await b.c.arenaTest.startMatchmaking();
  await waitFor(()=>a.c.arenaTest.running&&b.c.arenaTest.running);assert.ok(logs.includes('[pvp-relay-open]'));
  assert.equal(a.c.arenaTest.me.level,200);assert.equal(b.c.arenaTest.enemy.level,200);assert.equal(a.c.arenaTest.room,b.c.arenaTest.room);
  // A hit by slot 3 must finish at the caster's current position.
  const qa=a.c.arenaTest, fighter=qa.me, startX=fighter.x,startY=fighter.y;
  fighter.skillEvent={kind:'swordSeq',index:2,elapsed:.77,next:1,cfg:{mode:'galePulse',duration:.78,hits:[.5]},skill:{id:'galeOrbit'},galePulseHit:true,a:0,fx:1};
  qa.updateSkillSystem(.02);assert.equal(fighter.x,startX);assert.equal(fighter.y,startY);
  // A previous force path cannot resume after vortex capture/release.
  const vortex=qa.spawnPvpGaleVortex(startX,startY,0,true,'regression');vortex.caught={angle:0};
  fighter.forceTrack={x:25,y:25,remaining:10,max:10,stun:0};
  fighter.forcedMove={x:25,y:25,startX,startY,elapsed:0,max:10,t:10,priority:true};
  qa.update(.016);assert.equal(fighter.forceTrack,null);assert.equal(fighter.forcedMove,null);
  vortex.t=.001;qa.update(.016);assert.ok(fighter.forcedMove,'victim owns final launch');
  const landing={x:fighter.forcedMove.x,y:fighter.forcedMove.y};
  for(let n=0;n<50;n++)qa.update(.016);
  assert.ok(Math.hypot(fighter.x-landing.x,fighter.y-landing.y)<.01,'release stays at landing');
  qa.onData({t:'vortexLaunch',x:25,y:25,tx:100,ty:100,duration:.5});assert.equal(qa.enemy.remoteForce,null);
  qa.resetRound();
  let states=0;const relaySend=a.c.EchoesMulti.pvpRelaySend;a.c.EchoesMulti.pvpRelaySend=(id,data)=>{if(data.t==='state')states++;return relaySend(id,data);};for(let i=0;i<60;i++)a.c.arenaTest.update(1/60);assert.ok(states>=49&&states<=51,'60 FPS must retain the 50Hz schedule: '+states);a.c.EchoesMulti.pvpRelaySend=relaySend;
  a.c.arenaTest.net({t:'state',x:800,y:900,hp:456,shield:10,stam:30});await waitFor(()=>b.c.arenaTest.enemy.hp===456);assert.equal(b.c.arenaTest.enemy.netX,800);
  // Generated random particles and geometric effects must be identical on both peers.
  const aFx=a.c.arenaTest.effects.length,bFx=b.c.arenaTest.effects.length;
  a.c.arenaTest.burst(450,600,'#123456',6,180,123);
  a.c.arenaTest.pushFx({kind:'riftCut',x:450,y:600,a:.8,len:250,width:32,t:2,max:2,c:'#abcdef'},true);
  await waitFor(()=>b.c.arenaTest.effects.length>=bFx+7);
  assert.deepEqual(JSON.parse(JSON.stringify(a.c.arenaTest.effects.slice(aFx))),JSON.parse(JSON.stringify(b.c.arenaTest.effects.slice(bFx))));
  a.c.arenaTest.sendProjectile(.3,470,42,{visualLen:105,color:'#aabbcc'});await waitFor(()=>b.c.arenaTest.projectiles.length>0);
  assert.equal(b.c.arenaTest.projectiles.at(-1).visualLen,105);assert.equal(b.c.arenaTest.projectiles.at(-1).color,'#aabbcc');
  // A repeated hello ack must not reset a running fight.
  const hp=a.c.arenaTest.me.hp;a.c.arenaTest.me.hp=321;a.c.arenaTest.onData({t:'helloAck',v:4,ruleset:'world-combat-20261002-pvp-basic-v4',s:b.c.arenaTest.me});assert.equal(a.c.arenaTest.me.hp,321);
  const outsider=await arena(port,'outsider');clients.push(outsider);await outsider.c.EchoesMulti.connect({name:'outsider',accountId:'outsider',mode:'world'});
  outsider.c.EchoesMulti.pvpRelaySend(a.c.arenaTest.room,{t:'state',hp:999,x:999,y:999});await delay(100);assert.equal(b.c.arenaTest.enemy.hp,456);
  a.c.arenaTest.stopNet();await waitFor(()=>!b.c.arenaTest.running);assert.equal(errors,'');
 }finally{for(const x of clients){x.c.arenaTest.stopNet();x.c.EchoesMulti.disconnect();}server.kill();}
});

test('PVP state compression and backpressure preserve critical packets',()=>{
 const sent=[],c={window:null,console,performance,sessionStorage:{getItem:()=> 'test'},WebSocket:{OPEN:1}};c.window=c;vm.createContext(c);vm.runInContext(fs.readFileSync(root+'/multiplayer-client.js','utf8'),c);
 const socket={readyState:1,bufferedAmount:0,send:v=>sent.push(v)};c.EchoesMulti.state.socket=socket;
 const state={t:'state',x:1234.1234567890123,y:2345.2345678901234,vx:177.1234567890123,vy:23.1234567890123,a:1.234567890123456,hp:2999.1234567890123,stam:123.1234567890123,attackAnim:.1234567890123};
 c.EchoesMulti.pvpRelaySend('test',state);const full=JSON.stringify({type:'pvp:relay',matchId:'test',data:state}).length,packed=sent[0].length;assert.ok(packed<full*.75);console.log('state packet bytes',full,'->',packed);
 assert.equal(JSON.parse(sent[0]).data.x,1234.123);assert.equal(state.x,1234.1234567890123);
 socket.bufferedAmount=9000;assert.equal(c.EchoesMulti.pvpRelaySend('test',state),false);
 const attack={t:'atk',d:123.123456789,x:1234.123456789};assert.equal(c.EchoesMulti.pvpRelaySend('test',attack),true);assert.equal(JSON.parse(sent.at(-1)).data.d,attack.d);
});
test('relay drops stale state under congestion but still delivers attacks',async()=>{
 const {createPvpRelay}=await import('../multiplayer-server/pvp-relay.js');const sent=[],players=new Map(),a={id:'a',clientMode:'pvp',ws:{bufferedAmount:0}},b={id:'b',clientMode:'pvp',ws:{bufferedAmount:9000}};players.set(a.id,a);players.set(b.id,b);const relay=createPvpRelay(players,(ws,msg)=>sent.push(msg));relay.create('match',a,b);for(const p of [a,b])relay.handle(p,{type:'pvp:relayReady',matchId:'match'},100);sent.length=0;
 relay.handle(a,{type:'pvp:relay',matchId:'match',data:{t:'state',x:123}},100);assert.equal(sent.length,0);
 relay.handle(a,{type:'pvp:relay',matchId:'match',data:{t:'atk',d:50}},100);assert.equal(sent[0].data.t,'atk');
 relay.handle(a,{type:'pvp:relay',matchId:'match',data:{t:'atk',d:999}},70000);assert.equal(sent.length,1);relay.leave(a);
});
