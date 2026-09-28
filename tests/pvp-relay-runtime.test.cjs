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
 const script=html.split('<script>')[2].split('</script>')[0].replace('showLobby();requestAnimationFrame(loop);',"window.arenaTest={startMatchmaking,net,stopNet,onData,get running(){return running;},get me(){return me;},get enemy(){return enemy;},get room(){return room;}};showLobby();requestAnimationFrame(loop);");
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
  a.c.arenaTest.net({t:'state',x:800,y:900,hp:456,shield:10,stam:30});await waitFor(()=>b.c.arenaTest.enemy.hp===456);assert.equal(b.c.arenaTest.enemy.netX,800);
  // A repeated hello ack must not reset a running fight.
  const hp=a.c.arenaTest.me.hp;a.c.arenaTest.me.hp=321;a.c.arenaTest.onData({t:'helloAck',v:3,s:b.c.arenaTest.me});assert.equal(a.c.arenaTest.me.hp,321);
  const outsider=await arena(port,'outsider');clients.push(outsider);await outsider.c.EchoesMulti.connect({name:'outsider',accountId:'outsider',mode:'world'});
  outsider.c.EchoesMulti.pvpRelaySend(a.c.arenaTest.room,{t:'state',hp:999,x:999,y:999});await delay(100);assert.equal(b.c.arenaTest.enemy.hp,456);
  a.c.arenaTest.stopNet();await waitFor(()=>!b.c.arenaTest.running);assert.equal(errors,'');
 }finally{for(const x of clients){x.c.arenaTest.stopNet();x.c.EchoesMulti.disconnect();}server.kill();}
});
