import fs from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const html=fs.readFileSync(root+'index.html','utf8');
function boot(){
let clock=0;const timers=new Map();let serial=0;const micro=[];const schedule=(fn,ms=0)=>{const id=++serial;timers.set(id,{fn,at:clock+ms});return id};
const noop=()=>{},ctx=new Proxy({measureText:()=>({width:20}),createLinearGradient:()=>({addColorStop:noop}),createRadialGradient:()=>({addColorStop:noop})},{get:(o,k)=>o[k]||noop,set:(o,k,v)=>(o[k]=v,true)});
const nodes=new Map();function node(id=''){if(nodes.has(id))return nodes.get(id);const n={id,clientWidth:1200,clientHeight:800,style:{setProperty:noop,removeProperty:noop},classList:{add:noop,remove:noop,toggle:noop,contains:()=>false},dataset:{},addEventListener:noop,getContext:()=>ctx,querySelectorAll:q=>q==='[data-skill]'?Array.from({length:5},(_,i)=>{const b=node('skill'+i);b.dataset.skill=String(i);return b;}):[],querySelector:q=>node(q),getBoundingClientRect:()=>({x:0,y:0,left:0,top:0,width:1200,height:800}),children:[],appendChild:noop,remove:noop,focus:noop,setAttribute:noop,innerHTML:'',textContent:'',width:1200,height:800};nodes.set(id,n);return n;}
const storage=new Map([['echoes_accounts_v1',JSON.stringify({qa:{username:'qa',displayName:'qa'}})],['echoes_account_session_v1','qa']]);const localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
const c={console,performance:{now:()=>clock},Date,Math,Map,Set,Array,JSON,Number,String,Object,Boolean,Infinity,Promise,Uint8Array,Float32Array,Float64Array,Int32Array,localStorage,sessionStorage:localStorage,setTimeout:schedule,clearTimeout:id=>timers.delete(id),queueMicrotask:fn=>micro.push(fn),setInterval:noop,clearInterval:noop,requestAnimationFrame:noop,addEventListener:noop,matchMedia:()=>({matches:false,addEventListener:noop}),innerWidth:1200,innerHeight:800,devicePixelRatio:1,navigator:{maxTouchPoints:0,userAgent:'test'},location:{protocol:'http:',hostname:'localhost'},document:{getElementById:node,querySelectorAll:()=>[],querySelector:q=>node(q),createElement:()=>node(Math.random()),addEventListener:noop,documentElement:node('html'),body:node('body'),hidden:false},__PLAYTEST__:true,__AI_SERVER__:true};c.window=c;c.globalThis=c;c.Image=class{};vm.createContext(c);
let script=html.split('<script>')[1].split('</script>')[0];script=script.replace('// QA hooks', 'window.testHooks={chooseSwordStyle,render,validateSave,startOnlineWorld,setTrainer:()=>swordTrainerSession=true};\n// QA hooks');

vm.runInContext(fs.readFileSync(root+'/multiplayer-server/combat-core.js','utf8'),c);
vm.runInContext(script,c,{filename:'index-inline.js'});
return {c,g:c.__game,storage,advance(dt){clock+=dt*1000;for(const [id,t] of timers)if(t.at<=clock){timers.delete(id);t.fn()}},flush(){for(let n=0;micro.length&&n<100;n++)micro.shift()()},dispose(){timers.clear();micro.length=0}};
}


export function createArena({style='gale',level=100,live=false}={}){
 const runtime=boot(),{c,g}=runtime;c.__AI_LIVE__=live;g.beginNew('normal');g.player.level=level;g.player.swordStyle=style;
 const group=g.SWORD_STYLE_GROUPS.find(s=>s.id===style);if(!group)throw Error('Unknown style');
 g.player.equippedSwordSkills=[...group.skills];g.saveGame();
 vm.runInContext(html.split('<script>')[2].split('</script>')[0],c,{filename:'shared-pvp.js'});
 const api=c.__arena;if(!api)throw Error('Arena adapter missing');
 return {...runtime,api,snapshot:api.snapshot(),step(dt){runtime.advance(dt);if(api.running)api.step(dt);runtime.flush()}};
}
