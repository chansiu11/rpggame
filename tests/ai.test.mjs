import test from 'node:test';import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {createArena} from '../multiplayer-server/ai/arena-runtime.js';
import {seedPolicy,learn} from '../multiplayer-server/ai/brain.js';
import {validatePolicy} from '../multiplayer-server/ai/store.js';
import {duel} from '../multiplayer-server/ai/self-play.js';
import {createAiService} from '../multiplayer-server/ai/live-service.js';
test('all styles execute the existing arena code and inflict damage without rendering',()=>{
 for(const [a,b] of [['gale','void'],['void','dawn'],['dawn','gale']]){const r=duel(a,b,seedPolicy(),seedPolicy(),72,20);assert.ok(r.results.some(x=>x.metrics.damage>0));assert.ok(r.results.every(x=>Number.isFinite(x.reward)));}
});
test('learning is bounded and survives serialization; malformed policy rejected',()=>{const p=seedPolicy();for(let i=0;i<100;i++)learn(p,'gale',0,{win:true,reward:1,metrics:{hits:1}});assert.equal(validatePolicy(JSON.parse(JSON.stringify(p))).styles.gale.weights[0],5);assert.throws(()=>validatePolicy({...p,schema:2}));});
test('live worker negotiates the same PVP protocol and sends state, skills and damage',{timeout:12000},async()=>{
 const a=createArena(),worker=new Worker(new URL('../multiplayer-server/ai/live-worker.js',import.meta.url),{workerData:{style:'gale',level:100}});let ready=false,started=false,states=0,attacks=0;
 a.api.init(a.snapshot,a.snapshot,true,m=>worker.postMessage(m));
 const finished=new Promise((resolve,reject)=>{worker.on('error',reject);worker.on('message',m=>{try{if(m.t==='aiReady'){ready=true;worker.postMessage({t:'hello',v:3,s:a.snapshot});}else if(m.t==='helloAck'){started=true;a.api.init(a.snapshot,m.s,true,d=>worker.postMessage(d));a.api.me.x=2050;}else{if(m.t==='state')states++;if(m.t==='atk'||m.t==='proj')attacks++;a.api.receive(m);if(states>20&&attacks>0)resolve();}}catch(e){reject(e)}})});
 const timer=setInterval(()=>{if(started)a.step(1/60)},1000/60);try{await finished;assert.ok(ready&&started&&states>20&&attacks>0)}finally{clearInterval(timer);await worker.terminate();a.dispose()}
});
test('AI service ignores world users and enforces concurrent session cap',async()=>{const sent=[],service=createAiService((ws,m)=>sent.push(m));const a={id:'a',clientMode:'pvp',ws:{}},b={id:'b',clientMode:'pvp',ws:{}},world={id:'world',clientMode:'world',ws:{}};try{service.handle(world,{type:'pvp:aiStart'},20);assert.equal(sent.length,0);service.handle(a,{type:'pvp:aiStart',style:'void'},20);service.handle(b,{type:'pvp:aiStart'},20);assert.equal(sent.at(-1).type,'pvp:aiError');assert.equal(service.handle(a,{type:'world:combat'},20),false);}finally{service.leave(a);service.leave(b)}});

test('browser AI button flow connects through the real server, then exits cleanly',{timeout:12000},async()=>{
 const {spawn}=await import('node:child_process'),{readFileSync}=await import('node:fs'),vm=await import('node:vm'),{WebSocket}=await import('../multiplayer-server/node_modules/ws/wrapper.mjs');
 const port=24000+Math.floor(Math.random()*3000),server=spawn(process.execPath,['multiplayer-server/server.js'],{env:{...process.env,PORT:String(port)}});
 let logs='';server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);const wait=async fn=>{for(let i=0;i<400;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('Timed out: '+logs)};
 const a=createArena();try{await wait(()=>logs.includes('listening'));
 Object.assign(a.c,{WebSocket,setTimeout,clearTimeout,queueMicrotask,ECHOES_MULTIPLAYER_CONFIG:{serverUrl:'ws://127.0.0.1:'+port}});
 vm.runInContext(readFileSync(new URL('../multiplayer-client.js',import.meta.url),'utf8'),a.c);
 await a.api.startAiMatch();await wait(()=>a.api.running&&a.api.enemy?.name.startsWith('AI'));
 assert.ok(['gale','void','dawn'].includes(a.api.enemy.swordStyle));a.api.stopNet();assert.equal(a.api.running,false);
 }finally{a.api.stopNet();a.c.EchoesMulti?.disconnect();a.dispose();server.kill();}
});

test('Firebase checkpoints reload with a new store and reject failed writes',async()=>{
 const {FirebaseStore}=await import('../multiplayer-server/ai/store.js'),{generateKeyPairSync}=await import('node:crypto');
 const oldFetch=globalThis.fetch,oldEnv=process.env.FIREBASE_SERVICE_ACCOUNT_JSON,db=new Map();let fail=false;
 const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});process.env.FIREBASE_SERVICE_ACCOUNT_JSON=JSON.stringify({project_id:'test-only',client_email:'test@example.invalid',private_key:privateKey.export({type:'pkcs8',format:'pem'})});
 globalThis.fetch=async(url,options={})=>{if(url.includes('oauth2'))return new Response(JSON.stringify({access_token:'test'}));const id=url.split('/').at(-1);if(options.method==='PATCH'){if(fail)return new Response('{}',{status:403});db.set(id,JSON.parse(options.body));}return db.has(id)?new Response(JSON.stringify(db.get(id))):new Response('{}',{status:404});};
 try{const p=seedPolicy();p.matches=25;p.autorun=true;const id=await new FirebaseStore().save(p);assert.match(id,/^v0-/);assert.deepEqual(await new FirebaseStore().load(),p);assert.deepEqual(await new FirebaseStore().load(id),p);fail=true;await assert.rejects(new FirebaseStore().save(p),/403/);}finally{globalThis.fetch=oldFetch;if(oldEnv===undefined)delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;else process.env.FIREBASE_SERVICE_ACCOUNT_JSON=oldEnv;}
});
