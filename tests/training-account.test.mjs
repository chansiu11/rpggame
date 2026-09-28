import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../cloud-save.js',import.meta.url),'utf8');
async function harness(){
 const auths=new Map(),writes=[],persistence=[];
 const appMod={initializeApp:(_,name='game')=>({name})};
 const authMod={browserLocalPersistence:'local',inMemoryPersistence:'memory',getAuth:app=>{const a={name:app.name,currentUser:app.name==='game'?{uid:'player',email:'player@example.test'}:null};auths.set(app.name,a);return a;},setPersistence:async(a,p)=>persistence.push([a.name,p]),onAuthStateChanged:(a,fn)=>{queueMicrotask(fn);return ()=>{}},signOut:async a=>{a.currentUser=null;},signInWithEmailAndPassword:async(a,email,password)=>{if(password!=='fixture-password')throw Error('wrong password');a.currentUser={uid:'trainer',email};return {user:a.currentUser};}};
 const storeMod={getFirestore:app=>app.name,doc:(db,...path)=>({db,path}),serverTimestamp:()=>1,writeBatch:()=>({set:(ref,value)=>writes.push({ref,value}),commit:async()=>{}})};
 const c={window:{ECHOES_FIREBASE_CONFIG:{apiKey:'test',authDomain:'test',projectId:'test',appId:'test'}},console,Promise,setTimeout:()=>1,crypto:{randomUUID:()=> 'test'},appMod,authMod,storeMod};vm.createContext(c);
 const script=source.replace(/const \[appMod,authMod,storeMod\]=await Promise.all\(\[[\s\S]*?\]\);/,'const {appMod,authMod,storeMod}=globalThis;');
 await vm.runInContext('(async()=>{'+script+'})()',c);return {cloud:c.window.EchoesCloud,auths,writes,persistence};
}
test('ordinary login rejects training account without signing out the player',async()=>{const h=await harness();await assert.rejects(h.cloud.login('gkrtmqrhksflwk','fixture-password'),/훈련 전용/);assert.equal(h.cloud.currentUid(),'player');await assert.rejects(h.cloud.loginTraining('wrong'));assert.equal(h.cloud.currentUid(),'player');});
test('training login signs out game account, uses memory auth and writes under trainer UID',async()=>{const h=await harness();await h.cloud.loginTraining('fixture-password');assert.equal(h.cloud.currentUid(),null);assert.equal(h.cloud.currentTrainingUid(),'trainer');assert.ok(h.persistence.some(([a,p])=>a==='ai-training'&&p==='memory'));await h.cloud.saveTraining({schema:1});assert.equal(h.writes.length,2);for(const w of h.writes){assert.equal(w.ref.db,'ai-training');assert.equal(w.ref.path[1],'trainer');}await h.cloud.logoutTraining();assert.equal(h.cloud.currentTrainingUid(),null);await assert.rejects(h.cloud.saveTraining({schema:1}),/로그인/);});
test('manager switches accounts and saves before logout on exit',async()=>{
 const nodes=new Map(),events={},listeners={},order=[];
 function node(id){if(nodes.has(id))return nodes.get(id);const n={value:'',hidden:true,textContent:'',classList:{contains:()=>false},appendChild(){},replaceChildren(){},addEventListener(t,f){listeners[id+':'+t]=f},focus(){},showModal(){this.open=true},close(){this.open=false}};nodes.set(id,n);return n;}
 const panel=node('panel'),cloud={ready:Promise.resolve(),loginTraining:async()=>order.push('login'),logoutTraining:async()=>order.push('logout'),currentTrainingUid:()=> 'trainer',loadTraining:async()=>null,saveTraining:async()=>order.push('save')};
 const m={state:{deviceTrainingProtocol:1},on:(t,f)=>events[t]=f,connect:async()=>{},disconnect(){order.push('disconnect')},training(type){if(type==='Stop')queueMicrotask(()=>events['ai:trainStatus']({running:false,matches:1}));}};
 const c={console,Promise,Map,Object,JSON,String,structuredClone,setTimeout,clearTimeout,setInterval:()=>1,clearInterval(){},localStorage:{getItem:()=>null,setItem(){}},document:{createElement:t=>t==='dialog'?panel:node(t),head:node('head'),body:node('body'),getElementById:node},EchoesCloud:cloud,EchoesMulti:m,EchoesTrainingAccount:{clearGameSession:()=>order.push('clear-game')},addEventListener:(t,f)=>listeners[t]=f};c.window=c;vm.createContext(c);vm.runInContext(fs.readFileSync(new URL('../ai-device-panel.js',import.meta.url),'utf8'),c);
 listeners.keydown({code:'F9',ctrlKey:true,shiftKey:true,preventDefault(){}});node('aiDevicePassword').value='fixture-password';await node('aiDeviceLogin').onsubmit({preventDefault(){}});assert.deepEqual(order,['login','clear-game']);await events['ai:trainAuth']({ok:true,session:'s',loaded:true});events['ai:trainCheckpoint']({session:'s',revision:1,save:true,checkpoint:{policy:{matches:1,styles:{}}}});await node('aiDeviceClose').onclick();assert.equal(panel.open,false);assert.equal(order.at(-1),'logout');assert.ok(order.indexOf('save')<order.indexOf('logout'));assert.equal(node('aiDevicePassword').value,'');
});
