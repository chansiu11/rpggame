import test from 'node:test';import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {createArena} from '../multiplayer-server/ai/arena-runtime.js';
import {seedPolicy,learn,createBrain,leastTrainedPair} from '../multiplayer-server/ai/brain.js';
import {validatePolicy} from '../multiplayer-server/ai/store.js';
import {duel} from '../multiplayer-server/ai/self-play.js';
import {createAiService} from '../multiplayer-server/ai/live-service.js';
test('all styles execute the existing arena code and inflict damage without rendering',()=>{
 for(const [a,b] of [['gale','void'],['void','dawn'],['dawn','gale']]){const r=duel(a,b,seedPolicy(),seedPolicy(),72,20);assert.ok(r.results.some(x=>x.metrics.damage>0));assert.ok(r.results.every(x=>Number.isFinite(x.reward)));}
});
test('AI self-play optionally exposes real read-only spectator snapshots',()=>{
 const a=seedPolicy(),b=seedPolicy(),frames=[];
 const result=duel('gale','void',a,b,98,2,()=>{},frame=>frames.push(frame));
 assert.ok(frames.length>=2,'A watched bout should produce initial and final snapshots');
 assert.equal(frames.at(-1).final,true);
 assert.ok(frames.every(f=>f.players?.length===2&&f.players.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.hp)&&p.maxHp>0)));
 assert.ok(result.results.every(x=>Number.isFinite(x.reward)));
 assert.equal(a.matches,0,'Watching alone must not mutate AI policy');
});
test('device trainer advances at least three watched battles concurrently',{timeout:12000},async()=>{
 const control=new Int32Array(new SharedArrayBuffer(4)),watch=new Int32Array(new SharedArrayBuffer(4)),tuning=new Int32Array(new SharedArrayBuffer(8));
 Atomics.store(control,0,1);Atomics.store(watch,0,1);Atomics.store(tuning,0,0);Atomics.store(tuning,1,3);
 const p=seedPolicy(),checkpoint={schema:1,batch:25,completed:0,policy:p,baseline:structuredClone(p)};
 const worker=new Worker(new URL('../multiplayer-server/ai/train-worker.js',import.meta.url),{workerData:{policy:p,checkpoint,control:control.buffer,watch:watch.buffer,tuning:tuning.buffer,device:true}});
 const lanes=new Set();
 try{
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Concurrent training previews timed out: '+[...lanes].join(','))),10000);
   worker.on('error',e=>{clearTimeout(timer);reject(e)});
   worker.on('message',m=>{if(m.preview?.phase==='train'){lanes.add(m.preview.lane);if(lanes.size>=3){clearTimeout(timer);resolve();}}});
  });
  assert.deepEqual([...lanes].sort((a,b)=>a-b),[0,1,2]);
 }finally{
  Atomics.store(control,0,2);Atomics.notify(control,0);await worker.terminate();
 }
});

test('Void AI treats skill 3 as a reactive evade stance, not the old basic follow-up combo',()=>{
 const brain=createBrain('void',seedPolicy(),()=>.2,3),me={x:1000,y:1000,stam:100,maxStam:100,hp:100,maxHp:100,shield:100,stun:0,cool:[9,9,0,9,9],skillEvent:null,skillHold:null,void3DodgeRemaining:0},enemy={x:1100,y:1000,dash:0,attackAnim:0,skillPose:-1};
 let command;for(let i=0;i<8&&!Number.isInteger(command?.skill);i++)command=brain.step(.3,me,enemy);assert.equal(command.skill,2);
 const holding=brain.step(.05,me,enemy);assert.equal(holding.basic,false,'arming Void 3 must not issue the obsolete basic follow-up');
 let release;for(let i=0;i<12&&!Number.isInteger(release?.release);i++)release=brain.step(.1,me,enemy);assert.equal(release.release,2);
 me.void3DodgeRemaining=5;me.cool=[9,9,0,9,9];const active=brain.step(.5,me,enemy);assert.notEqual(active.skill,2,'AI must not recast Void 3 while evade charges are active');
});
test('learning is bounded and survives serialization; malformed policy rejected',()=>{const p=seedPolicy();for(let i=0;i<100;i++)learn(p,'gale',0,{win:true,reward:1,metrics:{hits:1}});assert.equal(validatePolicy(JSON.parse(JSON.stringify(p))).styles.gale.weights[0],5);assert.throws(()=>validatePolicy({...p,schema:2}));});
test('training pairs the least experienced two styles even after loading uneven progress',()=>{
 const policy=seedPolicy();policy.styles.gale.games=100;policy.styles.void.games=9;policy.styles.dawn.games=3;policy.styles.break.games=1;
 assert.deepEqual(leastTrainedPair(policy),['break','dawn']);
 assert.deepEqual(leastTrainedPair(JSON.parse(JSON.stringify(policy))),['break','dawn'],'Stored progress determines the next opponents');
 assert.equal(new Set(leastTrainedPair(policy)).size,2,'A style must never duel itself');
});
test('reselecting and learning both duelists gives every style equal training exposure',()=>{
 const policy=seedPolicy(),first=[];
 for(let i=0;i<24;i++){
  const [a,b]=leastTrainedPair(policy);
  if(i<6)first.push([a,b]);
  const games=Object.values(policy.styles).map(s=>s.games);
  assert.equal(policy.styles[a].games,Math.min(...games));
  assert.equal(policy.styles[b].games,[...games].sort((x,y)=>x-y)[1]);
  learn(policy,a,0,{win:true,reward:0,metrics:{}});
  learn(policy,b,0,{win:false,reward:0,metrics:{}});
  policy.matches++;
 }
 assert.deepEqual(first,[['gale','void'],['dawn','break'],['gale','dawn'],['void','break'],['gale','break'],['void','dawn']]);
 assert.equal(new Set(first.map(pair=>pair.slice().sort().join('|'))).size,6,'Every possible style matchup must appear in the first three balanced rounds');
 assert.deepEqual(Object.values(policy.styles).map(s=>s.games),[12,12,12,12]);
 assert.equal(policy.matches,24,'Every duel increments the shared match count only once');
});
test('live worker negotiates the same PVP protocol and sends state, skills and damage',{timeout:12000},async()=>{
 const a=createArena(),worker=new Worker(new URL('../multiplayer-server/ai/live-worker.js',import.meta.url),{workerData:{style:'gale',level:100}});let ready=false,started=false,states=0,attacks=0,countdownAt=0,goAt=0,ponged=false;
 a.api.init(a.snapshot,a.snapshot,true,m=>worker.postMessage(m));
 const finished=new Promise((resolve,reject)=>{worker.on('error',reject);worker.on('message',m=>{try{if(m.t==='aiReady'){ready=true;worker.postMessage({t:'hello',v:3,s:a.snapshot});}else if(m.t==='helloAck'){started=true;a.api.init(a.snapshot,m.s,true,d=>worker.postMessage(d));a.api.me.x=2050;}else{if(m.t==='aiCountdown'){countdownAt=performance.now();worker.postMessage({t:'ping',n:12345});}if(m.t==='pong'&&m.n===12345){assert.equal(goAt,0);ponged=true;}if(m.t==='aiGo')goAt=performance.now();if(m.t==='atk'||m.t==='proj')assert.ok(goAt>0,'no attacks before server start');if(m.t==='state')states++;if(m.t==='atk'||m.t==='proj')attacks++;a.api.receive(m);if(states>20&&attacks>0)resolve();}}catch(e){reject(e)}})});
 const timer=setInterval(()=>{if(started)a.step(1/60)},1000/60);try{await finished;assert.ok(ready&&started&&states>20&&attacks>0);assert.ok(ponged,'pings remain responsive while locked');assert.ok(goAt-countdownAt>=2950,'at least three seconds before combat')}finally{clearInterval(timer);await worker.terminate();a.dispose()}
});
test('AI service ignores world users and enforces concurrent session cap',async()=>{const sent=[],service=createAiService((ws,m)=>sent.push(m));const a={id:'a',clientMode:'pvp',ws:{}},b={id:'b',clientMode:'pvp',ws:{}},world={id:'world',clientMode:'world',ws:{}};try{service.handle(world,{type:'pvp:aiStart'},20);assert.equal(sent.length,0);service.handle(a,{type:'pvp:aiStart',style:'void'},20);service.handle(b,{type:'pvp:aiStart'},20);assert.equal(sent.at(-1).type,'pvp:aiError');assert.equal(service.handle(a,{type:'world:combat'},20),false);}finally{service.leave(a);service.leave(b)}});

test('browser AI button flow connects through the real server, then exits cleanly',{timeout:12000},async()=>{
 const {spawn}=await import('node:child_process'),{readFileSync}=await import('node:fs'),vm=await import('node:vm'),{WebSocket}=await import('../multiplayer-server/node_modules/ws/wrapper.mjs');
 const port=24000+Math.floor(Math.random()*3000),server=spawn(process.execPath,['multiplayer-server/server.js'],{env:{...process.env,PORT:String(port)}});
 let logs='';server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);const wait=async fn=>{for(let i=0;i<400;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('Timed out: '+logs)};
 const a=createArena();try{await wait(()=>logs.includes('listening'));
 Object.assign(a.c,{WebSocket,setTimeout,clearTimeout,queueMicrotask,ECHOES_MULTIPLAYER_CONFIG:{serverUrl:'ws://127.0.0.1:'+port}});
 vm.runInContext(readFileSync(new URL('../multiplayer-client.js',import.meta.url),'utf8'),a.c);
 a.c.document.getElementById('pvpAiDifficulty').value='5';a.c.document.getElementById('pvpAiStyle').value='gale';
 await a.api.startAiMatch();await wait(()=>a.api.running&&a.api.enemy?.name.startsWith('AI'));
 assert.equal(a.api.enemy.swordStyle,'gale');assert.match(a.api.enemy.name,/5단계/);assert.ok(a.api.countdown&&a.api.locked);a.step(4);assert.ok(a.api.locked,'browser clock cannot unlock ahead of server');a.api.receive({t:'aiGo'});assert.equal(a.api.locked,false);a.api.stopNet();assert.equal(a.api.countdown,false);assert.equal(a.api.running,false);
 }finally{a.api.stopNet();a.c.EchoesMulti?.disconnect();a.dispose();server.kill();}
});

test('Firebase checkpoints reload with a new store and reject failed writes',async()=>{
 const {FirebaseStore}=await import('../multiplayer-server/ai/store.js'),{generateKeyPairSync}=await import('node:crypto');
 const oldFetch=globalThis.fetch,oldEnv=process.env.FIREBASE_SERVICE_ACCOUNT_JSON,db=new Map();let fail=false;
 const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});process.env.FIREBASE_SERVICE_ACCOUNT_JSON=JSON.stringify({project_id:'test-only',client_email:'test@example.invalid',private_key:privateKey.export({type:'pkcs8',format:'pem'})});
 globalThis.fetch=async(url,options={})=>{if(url.includes('oauth2'))return new Response(JSON.stringify({access_token:'test'}));const id=url.split('/').at(-1);if(options.method==='PATCH'){if(fail)return new Response('{}',{status:403});db.set(id,JSON.parse(options.body));}return db.has(id)?new Response(JSON.stringify(db.get(id))):new Response('{}',{status:404});};
 try{const p=seedPolicy();p.matches=25;p.autorun=true;const id=await new FirebaseStore().save(p);assert.match(id,/^v0-/);assert.deepEqual(await new FirebaseStore().load(),p);assert.deepEqual(await new FirebaseStore().load(id),p);fail=true;await assert.rejects(new FirebaseStore().save(p),/403/);}finally{globalThis.fetch=oldFetch;if(oldEnv===undefined)delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;else process.env.FIREBASE_SERVICE_ACCOUNT_JSON=oldEnv;}
});


test('live countdown freezes actions and incoming combat for 3 seconds on start and round reset',()=>{
 const a=createArena({live:true}),packets=[];
 try{
 a.api.init(a.snapshot,a.snapshot,false,m=>packets.push(m));
 for(const begin of [()=>a.api.beginAiCountdown(),()=>{a.api.receive({t:'round',mine:1,theirs:0});a.step(1.21)}]){
 begin();const x=a.api.me.x,hp=a.api.me.hp;
 assert.equal(a.api.locked,true);assert.ok(packets.some(p=>p.t==='aiCountdown'));
 a.api.control({keys:['KeyW'],aim:0,basic:true,dash:true,block:true,skill:0});
 a.api.receive({t:'forceMove',x:25,y:25,t:.3,stun:1});
 a.api.receive({t:'state',x:25,y:25,hp:1,shield:1,stam:1});
 for(let i=0;i<29;i++)a.step(.1);
 assert.equal(a.api.locked,true);assert.equal(a.api.me.x,x);assert.equal(a.api.me.hp,hp);
 assert.equal(a.api.me.block,false);assert.equal(a.api.me.forcedMove,null);assert.equal(a.api.enemy.hp,a.snapshot.maxHp);
 a.step(.11);assert.equal(a.api.locked,false);assert.equal(packets.at(-1).t,'aiGo');
 }
 a.api.receive({t:'round',mine:3,theirs:0});a.step(.6);assert.equal(a.api.running,false);a.api.receive({t:'rematch'});a.api.rematch();assert.ok(a.api.running&&a.api.countdown&&a.api.locked,'rematch also starts locked');
 }finally{a.dispose();}
 const training=createArena();try{training.api.init(training.snapshot,training.snapshot,true,()=>{});training.api.resetRound();assert.equal(training.api.locked,false);assert.equal(training.api.countdown,false);}finally{training.dispose();}
});

test('a stale Firestore read cannot overwrite a newer policy learned by the connected trainer',async()=>{
 let resolveRead;const store={enabled:true,load:()=>new Promise(resolve=>{resolveRead=resolve;})};
 const service=createAiService(()=>{},{store,refreshIntervalMs:600000});
 try{
  const device=seedPolicy();device.matches=175;device.generation=7;device.styles.break.games=91;device.styles.break.weights=[2.1,3.2,1.8];
  service.setPolicy(device);
  const stale=seedPolicy();stale.matches=25;stale.generation=1;
  resolveRead(stale);
  await Promise.resolve();await Promise.resolve();
  assert.strictEqual(service.currentPolicy,device);
  assert.deepEqual(service.currentPolicy.styles.break.weights,[2.1,3.2,1.8]);
 }finally{service.close();}
});
