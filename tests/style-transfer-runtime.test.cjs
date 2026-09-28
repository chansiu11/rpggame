// Executes the real world script with a minimal DOM/canvas, including all five HUD skill slots.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(root+'/index.html','utf8');
function boot(){
const noop=()=>{},ctx=new Proxy({measureText:()=>({width:20}),createLinearGradient:()=>({addColorStop:noop}),createRadialGradient:()=>({addColorStop:noop})},{get:(o,k)=>o[k]||noop,set:(o,k,v)=>(o[k]=v,true)});
const nodes=new Map();function node(id=''){if(nodes.has(id))return nodes.get(id);const n={id,clientWidth:1200,clientHeight:800,style:{setProperty:noop,removeProperty:noop},classList:{add:noop,remove:noop,toggle:noop,contains:()=>false},dataset:{},addEventListener:noop,getContext:()=>ctx,querySelectorAll:q=>q==='[data-skill]'?Array.from({length:5},(_,i)=>{const b=node('skill'+i);b.dataset.skill=String(i);return b;}):[],querySelector:q=>node(q),getBoundingClientRect:()=>({x:0,y:0,left:0,top:0,width:1200,height:800}),children:[],appendChild:noop,remove:noop,focus:noop,setAttribute:noop,innerHTML:'',textContent:'',width:1200,height:800};nodes.set(id,n);return n;}
const storage=new Map([['echoes_accounts_v1',JSON.stringify({qa:{username:'qa',displayName:'qa'}})],['echoes_account_session_v1','qa']]);const localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
const c={console,performance,Date,Math,Map,Set,Array,JSON,Number,String,Object,Boolean,Infinity,Promise,Uint8Array,Float32Array,Float64Array,Int32Array,localStorage,sessionStorage:localStorage,setTimeout:noop,clearTimeout:noop,setInterval:noop,clearInterval:noop,requestAnimationFrame:noop,addEventListener:noop,matchMedia:()=>({matches:false,addEventListener:noop}),innerWidth:1200,innerHeight:800,devicePixelRatio:1,navigator:{maxTouchPoints:0,userAgent:'test'},location:{protocol:'http:',hostname:'localhost'},document:{getElementById:node,querySelectorAll:()=>[],querySelector:q=>node(q),createElement:()=>node(Math.random()),addEventListener:noop,documentElement:node('html'),body:node('body'),hidden:false},__PLAYTEST__:true};c.window=c;c.globalThis=c;c.Image=class{};vm.createContext(c);
let script=html.split('<script>')[1].split('</script>')[0];script=script.replace('// QA hooks', 'window.testHooks={chooseSwordStyle,render,validateSave,startOnlineWorld,setTrainer:()=>swordTrainerSession=true};\n// QA hooks');

vm.runInContext(fs.readFileSync(root+'/multiplayer-server/combat-core.js','utf8'),c);
vm.runInContext(script,c,{filename:'index-inline.js'});
return {c,g:c.__game,h:c.testHooks,storage};
}
function train(g){
 g.beginNew('normal');g.closeModal();g.player.level=5;
 g.player.training.complete=true;g.player.stats.kills=3;g.player.stats.gathers=1;g.player.stats.oreMined=1;
 g.player.camps.push('forest');for(let i=0;i<5;i++)g.updateHUD();
 const npc=g.objects.find(o=>o.id==='swordMaster');g.player.x=npc.x;g.player.y=npc.y+40;
}
test('all five NPC styles survive HUD updates, frames, immediate save and reload',()=>{
 for(let i=0;i<5;i++){
  const {g,h,storage}=boot();train(g);h.setTrainer();const style=g.SWORD_STYLE_GROUPS[i];h.chooseSwordStyle(style.id);
  assert.equal(g.player.swordStyle,style.id);
  assert.doesNotThrow(()=>{g.updateHUD();for(let n=0;n<6;n++){g.update(.033);h.render();}});
  const raw=[...storage.entries()].find(([k])=>k.startsWith('echoes_wild_save_v1'))?.[1];assert.ok(raw,'style must save before its deferred timer');
  const saved=JSON.parse(raw);assert.equal(saved.player.swordStyle,style.id);assert.ok(saved.player.level>=5);
  const restored=boot();restored.g.loadData(saved);assert.equal(restored.g.player.level,saved.player.level);assert.equal(restored.g.player.swordStyle,style.id);restored.g.updateHUD();
 }
});
test('restored balance values work for sword, bow, hidden weapon and PVP skill bridge',()=>{
 const {c,g}=boot();train(g);
 for(const style of g.SWORD_STYLE_GROUPS){g.player.weapon=0;g.player.swordStyle=style.id;g.player.equippedSwordSkills=[...style.skills];for(let i=0;i<5;i++){const sk=g.skillInfo(i),raw=g.SWORD_SKILL_LIBRARY.find(s=>s.id===sk.id);assert.equal(sk.cool,Math.round(raw.cool*1.5*10)/10);assert.equal(sk.cost,Math.round(raw.cost*1.15));assert.ok(Number.isFinite(c.EchoesWorldPvpData.swordSkill(sk.id,i).cost));}}
 for(const weapon of [2,3]){g.player.weapon=weapon;for(let i=0;i<5;i++){const sk=g.skillInfo(i);assert.ok(Number.isFinite(sk.cool)&&Number.isFinite(sk.cost));}g.updateHUD();}
});
test('failed world save restoration preserves the save and aborts entry instead of resetting to level 1',async()=>{
 const {c,g,h,storage}=boot();train(g);g.saveGame();g.returnTitle(true);
 const key=[...storage.keys()].find(k=>k.startsWith('echoes_wild_save_v1')),bad=JSON.parse(storage.get(key));bad.player.upgrades=null;const original=JSON.stringify(bad);storage.set(key,original);
 const handlers=new Map();let disconnected=false;c.console={...console,error:()=>{}};
 c.EchoesMulti={enabled:true,on:(k,fn)=>handlers.set(k,fn),connect:async()=>true,disconnect:()=>{disconnected=true;},state:{worldRole:{},worldSnapshot:{},bosses:new Map()}};
 await h.startOnlineWorld();assert.equal(storage.get(key),original);assert.equal(g.mode,'title');assert.equal(g.multiplayerMode,false);assert.equal(disconnected,true);assert.equal(g.modal,'message');
 assert.equal(g.saveGame(),false);assert.equal(storage.get(key),original);
});
