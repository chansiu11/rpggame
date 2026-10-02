import test from 'node:test';import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {createArena} from '../multiplayer-server/ai/arena-runtime.js';
import {seedPolicy,learn,createBrain,leastTrainedPair,recordMatchup,stylePairs,NN_BEHAVIORS,networkParameterCount} from '../multiplayer-server/ai/brain.js';
import {validatePolicy} from '../multiplayer-server/ai/store.js';
import {duel} from '../multiplayer-server/ai/self-play.js';
import {createAiService} from '../multiplayer-server/ai/live-service.js';
test('all styles execute the existing arena code and inflict damage without rendering',()=>{
 for(const [a,b] of [['gale','void'],['moon','break'],['void','dawn'],['dawn','gale']]){const r=duel(a,b,seedPolicy(),seedPolicy(),72,20);assert.ok(r.results.some(x=>x.metrics.damage>0));assert.ok(r.results.every(x=>Number.isFinite(x.reward)));}
});
test('AI can chain four basics into a skill instead of taking the fifth basic',()=>{
 const p=seedPolicy(),n=p.styles.gale.network;
 n.b3[2]=-4;n.b3[3]=4;n.b3[9]=1;n.b3[10]=-4;for(let i=4;i<=8;i++)n.b3[i]=.6;
 const skill=(id,mode,ultimate=false)=>({id,name:id,cost:30,cool:5,ultimate,cfg:{duration:.8,hits:[.2,.55],mult:[.7,1.2],arc:[1.5,1.8],reach:[40,80],mode}});
 const skills=[skill('windSlash','windShot'),skill('flashRush','galeBlink'),skill('galeOrbit','galePulse'),skill('starRush','galeCrescendo'),skill('thunderDrive','galePursuit',true)];
 const me={x:1000,y:1000,hp:100,maxHp:100,shield:100,maxShield:100,stam:500,maxStam:500,stun:0,dash:0,cool:[0,0,0,0,0],skillEvent:null,skillHold:null,attackAnim:0,skillPose:-1,combo:0,basicSeq:0,basicHitSeq:0,void3DodgeRemaining:0};
 const enemy={x:1140,y:1000,hp:100,maxHp:100,shield:100,maxShield:100,stun:0,dash:0,attackAnim:0,attackDuration:.26,skillPose:-1,skillKind:'',block:false,combo:0};
 const brain=createBrain('gale',p,()=>.5,3,{training:true}),actions=[];
 for(let step=0;step<10;step++){
  const a=brain.step(1/60,me,enemy,{selfSkills:skills,enemySkills:Array(5).fill(null)});
  if(a.basic){actions.push('basic');me.basicSeq++;me.basicHitSeq++;me.combo=Math.min(4,me.combo+1);}
  else if(Number.isInteger(a.skill)){actions.push('skill'+(a.skill+1));break;}
 }
 assert.deepEqual(actions.slice(0,4),['basic','basic','basic','basic']);
 assert.match(actions[4],/^skill[1-5]$/,'the fifth action in the chain must be a skill, not a fifth basic');
 assert.equal(brain.stats.fourHitComboSkills,1);
});
test('AI combo counter ignores missed basics and waits for four confirmed hits',()=>{
 const p=seedPolicy(),n=p.styles.gale.network;n.b3[2]=-4;n.b3[3]=4;n.b3[9]=1;n.b3[10]=-4;for(let i=4;i<=8;i++)n.b3[i]=1.2;
 const skill=(id,mode)=>({id,name:id,cost:30,cool:5,cfg:{duration:.8,hits:[.2,.55],mult:[.7,1.2],arc:[1.5,1.8],reach:[40,80],mode}});
 const skills=[skill('windSlash','windShot'),skill('flashRush','galeBlink'),skill('galeOrbit','galePulse'),skill('starRush','galeCrescendo'),skill('thunderDrive','galePursuit')];
 const me={x:1000,y:1000,hp:100,maxHp:100,shield:100,maxShield:100,stam:500,maxStam:500,stun:0,dash:0,cool:[0,0,0,0,0],skillEvent:null,skillHold:null,attackAnim:0,skillPose:-1,combo:0,basicSeq:0,basicHitSeq:0,void3DodgeRemaining:0};
 const enemy={x:1140,y:1000,hp:100,maxHp:100,shield:100,maxShield:100,stun:0,dash:0,attackAnim:0,attackDuration:.26,skillPose:-1,skillKind:'',block:false,combo:0};
 const brain=createBrain('gale',p,()=>.5,3,{training:true});
 for(let miss=0;miss<3;miss++){const a=brain.step(1/60,me,enemy,{selfSkills:skills,enemySkills:Array(5).fill(null)});assert.equal(a.basic,true);me.basicSeq++;}
 assert.equal(brain.awareness.comboBasicCount,0,'missed basic attempts must not advance the combo');
 for(let hit=0;hit<4;hit++){me.basicHitSeq++;brain.step(1/60,me,enemy,{selfSkills:skills,enemySkills:Array(5).fill(null)});}
 assert.equal(brain.awareness.comboBasicCount,4);
 assert.equal(brain.awareness.comboSkillReady,true);
});
test('AI explicitly tracks opponent skill and shield state transitions',()=>{
 const p=seedPolicy(),brain=createBrain('gale',p,()=>.5,3,{training:true});
 const me={x:1000,y:1000,hp:100,maxHp:100,shield:100,maxShield:100,stam:500,maxStam:500,stun:0,dash:0,cool:[0,0,0,0,0],skillEvent:null,skillHold:null,attackAnim:0,skillPose:-1,combo:0};
 const enemy={x:1260,y:1000,hp:100,maxHp:100,shield:100,maxShield:100,stun:0,dash:0,attackAnim:.8,attackDuration:1.05,skillPose:0,skillId:'bladeRain',skillKind:'eventHorizonShear',block:true,combo:0};
 const skill={id:'bladeRain',name:'사건선 절단',cost:61,cool:10.2,cfg:{duration:1.05,hits:[.18,.52,.88],mult:[.38,.62,2.05],arc:[.72,.72,.82],reach:[220,230,265],mode:'eventHorizonShear'}};
 brain.step(1/60,me,enemy,{selfSkills:Array(5).fill(null),enemySkills:[skill,null,null,null,null]});
 assert.equal(brain.awareness.skillActive,true);assert.equal(brain.awareness.skillIndex,0);assert.equal(brain.awareness.skillId,'bladeRain');
 assert.equal(brain.awareness.shielding,true);assert.ok(brain.awareness.shieldAge>0);
 enemy.block=false;enemy.skillPose=-1;enemy.skillId='';enemy.skillKind='';enemy.attackAnim=0;
 brain.step(1/60,me,enemy,{selfSkills:Array(5).fill(null),enemySkills:[skill,null,null,null,null]});
 assert.equal(brain.awareness.skillActive,false);assert.equal(brain.awareness.skillEndedAge,0);
 assert.equal(brain.awareness.shielding,false);assert.equal(brain.awareness.shieldReleasedAge,0);
});
test('arena exposes current-form skill definitions to the bot',()=>{
 const a=createArena({style:'moon'});
 try{
  a.api.init(a.snapshot,a.snapshot,true,()=>{});
  let ctx=a.api.skillContext();
  assert.equal(ctx.selfSkills.length,5);assert.equal(ctx.enemySkills.length,5);
  assert.equal(ctx.selfSkills[0].id,'eclipseShift');
  assert.ok(ctx.selfSkills.every((s,i)=>s&&s.cfg&&Number.isFinite(Number(s.cool))&&s.ultimate===(i===4)));
  a.api.me.moonForm='solar';ctx=a.api.skillContext();
  assert.equal(ctx.selfSkills[1].cfg.mode,'solarFlashLine');
  a.api.me.moonForm='lunar';ctx=a.api.skillContext();
  assert.equal(ctx.selfSkills[1].cfg.mode,'lunarMistStep');
 }finally{a.dispose();}
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

test('neural AI keeps learned combat behaviors and adds live skill understanding',()=>{
 const p=seedPolicy();
 assert.equal(p.schema,2);assert.equal(p.model,'mlp-es-v1');assert.deepEqual(p.learning.behaviors.slice(0,NN_BEHAVIORS.length),NN_BEHAVIORS);
 assert.deepEqual(p.learning.behaviors.slice(-3),['skillRangeUnderstanding','skillThreatUnderstanding','skillTimingUnderstanding']);
 assert.equal(p.learning.fixedDodge,'skill-aware');assert.equal(p.learning.resourceManagement,false);assert.equal(networkParameterCount(),934);
 const brain=createBrain('void',p,()=>.5,3,{training:true});
 const me={x:1000,y:1000,stam:100,maxStam:100,hp:100,maxHp:100,shield:100,maxShield:100,stun:0,dash:0,cool:[0,0,0,0,0],skillEvent:null,skillHold:null,attackAnim:0,skillPose:-1,combo:0,void3DodgeRemaining:0};
 const enemy={x:1120,y:1000,hp:100,maxHp:100,shield:100,maxShield:100,stun:0,dash:0,attackAnim:.2,skillPose:0,block:false,combo:0};
 const enemySkill={id:'bladeRain',name:'사건선 절단',cost:61,cool:10.2,ultimate:false,cfg:{duration:1.05,hits:[.18,.52,.88],mult:[.38,.62,2.05],arc:[.72,.72,.82],reach:[220,230,265],mode:'eventHorizonShear'}};
 const command=brain.step(1/60,me,enemy,{selfSkills:Array(5).fill(null),enemySkills:[enemySkill,null,null,null,null]});assert.equal(command.dash,true,'the dodge path must react to the active skill profile and range');assert.equal(brain.stats.threatDodges,1);
});
test('neural learning changes bounded network parameters and survives serialization',()=>{
 const p=seedPolicy(),before=p.styles.gale.network.w1.slice();
 for(let i=0;i<40;i++)learn(p,'gale',{noiseSeed:1000+i},{win:i%2===0,reward:i%2===0?1.15:-.45,metrics:{hits:1}});
 const checked=validatePolicy(JSON.parse(JSON.stringify(p)));
 assert.notDeepEqual(checked.styles.gale.network.w1,before);
 assert.ok(checked.styles.gale.network.w1.every(v=>Number.isFinite(v)&&Math.abs(v)<=8));
 assert.throws(()=>validatePolicy({...p,schema:1}));
});
test('five-style training scheduler covers all ten matchups without self fights',()=>{
 const policy=seedPolicy(),seen=new Set(),pairs=stylePairs();
 assert.equal(pairs.length,10);
 assert.equal(new Set(pairs.map(([a,b])=>[a,b].sort().join('|'))).size,10);
 for(let i=0;i<10;i++){
  const [a,b]=leastTrainedPair(policy),key=[a,b].sort().join('|');
  assert.notEqual(a,b,'A style must never duel itself');
  assert.equal(seen.has(key),false,'Every zero-count matchup should be scheduled before a repeat');
  seen.add(key);
  learn(policy,a,0,{win:true,reward:0,metrics:{}});
  learn(policy,b,0,{win:false,reward:0,metrics:{}});
  recordMatchup(policy,a,b);
  policy.matches++;
 }
 assert.equal(seen.size,10,'All five-style pairings must be trained once per balanced cycle');
 assert.deepEqual(Object.values(policy.styles).map(s=>s.games),[4,4,4,4,4]);
 assert.ok(Object.values(policy.matchups).every(v=>v===1));
 const restored=JSON.parse(JSON.stringify(policy));
 const [a,b]=leastTrainedPair(restored);
 assert.equal(new Set([a,b]).size,2);
 assert.equal(restored.matchups[[a,b].sort().join('|')],1,'Stored matchup history must survive reload');
});
test('live worker negotiates the same PVP protocol and sends state, skills and damage',{timeout:12000},async()=>{
 const a=createArena(),worker=new Worker(new URL('../multiplayer-server/ai/live-worker.js',import.meta.url),{workerData:{style:'gale',level:100}});let ready=false,started=false,states=0,attacks=0,countdownAt=0,goAt=0,ponged=false;
 a.api.init(a.snapshot,a.snapshot,true,m=>worker.postMessage(m));
 let timeout;
 const finished=new Promise((resolve,reject)=>{timeout=setTimeout(()=>reject(Error('Live neural AI produced no combat packet in time')),10000);worker.on('error',reject);worker.on('message',m=>{try{if(m.t==='aiReady'){ready=true;worker.postMessage({t:'hello',v:4,ruleset:a.snapshot.ruleset,s:a.snapshot});}else if(m.t==='helloAck'){started=true;a.api.init(a.snapshot,m.s,true,d=>worker.postMessage(d));a.api.me.x=2050;}else{if(m.t==='aiCountdown'){countdownAt=performance.now();worker.postMessage({t:'ping',n:12345});}if(m.t==='pong'&&m.n===12345){assert.equal(goAt,0);ponged=true;}if(m.t==='aiGo')goAt=performance.now();if(m.t==='atk'||m.t==='proj')assert.ok(goAt>0,'no attacks before server start');if(m.t==='state')states++;if(m.t==='atk'||m.t==='proj')attacks++;a.api.receive(m);if(states>20&&attacks>0){clearTimeout(timeout);resolve();}}}catch(e){clearTimeout(timeout);reject(e)}})});
 const timer=setInterval(()=>{if(started)a.step(1/60)},1000/60);try{await finished;assert.ok(ready&&started&&states>20&&attacks>0);assert.ok(ponged,'pings remain responsive while locked');assert.ok(goAt-countdownAt>=2950,'at least three seconds before combat')}finally{clearTimeout(timeout);clearInterval(timer);await worker.terminate();a.dispose()}
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
 try{const p=seedPolicy();p.matches=25;p.autorun=true;const id=await new FirebaseStore().save(p);assert.match(id,/^v0-/);const current=await new FirebaseStore().load(),version=await new FirebaseStore().load(id);assert.equal(current.matches,p.matches);assert.equal(version.matches,p.matches);assert.equal(current.resetEpoch,'2026-09-30-ai-neural-reset-4');assert.equal(version.resetEpoch,'2026-09-30-ai-neural-reset-4');fail=true;await assert.rejects(new FirebaseStore().save(p),/403/);}finally{globalThis.fetch=oldFetch;if(oldEnv===undefined)delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;else process.env.FIREBASE_SERVICE_ACCOUNT_JSON=oldEnv;}
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
  const device=seedPolicy();device.matches=175;device.generation=7;device.styles.break.games=91;device.styles.break.network.w3[0]=2.1;
  service.setPolicy(device);
  const stale=seedPolicy();stale.matches=25;stale.generation=1;
  resolveRead(stale);
  await Promise.resolve();await Promise.resolve();
  assert.strictEqual(service.currentPolicy,device);
  assert.equal(service.currentPolicy.styles.break.network.w3[0],2.1);
 }finally{service.close();}
});
