import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import {createHash} from 'node:crypto';
import {createDeviceTraining} from '../multiplayer-server/ai/device-training.js';
import {seedPolicy} from '../multiplayer-server/ai/brain.js';
const pass='test-admin-password-not-production';
function harness(){let time=100000,busy=false,jobs=[],sent=[],applied;const svc=createDeviceTraining({send:(ws,m)=>sent.push(m),isBusy:()=>busy,onPolicy:p=>applied=p,now:()=>time,passwordHash:createHash('sha256').update(pass).digest('hex'),makeWorker:data=>{const w=new EventEmitter();w.data=data;w.terminate=()=>w.emit('exit');jobs.push(w);return w}});const p={clientMode:'pvp',clientSessionId:'training-device-old',ws:{readyState:1,_socket:{remoteAddress:'local'},close(){this.readyState=3}}};return {svc,p,jobs,sent,setBusy:v=>busy=v,advance:n=>time+=n,auth:()=>svc.handle(p,{type:'ai:trainAuth',password:pass}),load:()=>svc.handle(p,{type:'ai:trainLoad'}),ack(){const m=sent.filter(x=>x.type==='ai:trainCheckpoint').at(-1);svc.handle(p,{type:'ai:trainSaved',session:m.session,revision:m.revision,matches:m.checkpoint.policy.matches})}}}
test('hidden entry never substitutes for server password; saved checkpoint required to start',()=>{const h=harness();try{h.svc.handle(h.p,{type:'ai:trainStart'});assert.equal(h.jobs.length,0);h.svc.handle(h.p,{type:'ai:trainAuth',password:'wrong'});assert.equal(h.sent.at(-1).ok,false);h.auth();assert.equal(h.p.trainingAdmin,true);h.load();h.svc.handle(h.p,{type:'ai:trainStart'});assert.equal(h.jobs.length,0);h.ack();h.svc.handle(h.p,{type:'ai:trainStart'});assert.equal(h.jobs.length,1);}finally{h.svc.close()}});
test('player activity, missing heartbeat, save failures and logout pause the worker',()=>{const h=harness();try{h.auth();h.load();h.ack();h.svc.handle(h.p,{type:'ai:trainStart'});const gate=new Int32Array(h.jobs[0].data.control);assert.equal(gate[0],1);h.setBusy(true);h.svc.tick();assert.equal(gate[0],0);h.setBusy(false);h.svc.tick();assert.equal(gate[0],1);h.advance(46000);h.svc.tick();assert.equal(gate[0],0);h.svc.handle(h.p,{type:'ai:trainBeat'});assert.equal(gate[0],1);h.svc.handle(h.p,{type:'ai:trainSaveFailed'});h.svc.tick();assert.equal(gate[0],0);h.svc.leave(h.p);assert.equal(h.p.trainingAdmin,false);}finally{h.svc.close()}});
test('25 matches or five minutes request cloud save; policy survives device disconnect',()=>{const h=harness();try{h.auth();h.load();h.ack();h.svc.handle(h.p,{type:'ai:trainStart'});const policy=seedPolicy();policy.matches=25;h.jobs[0].emit('message',{checkpoint:{schema:1,batch:25,completed:25,policy,baseline:seedPolicy()}});assert.equal(h.sent.filter(x=>x.type==='ai:trainCheckpoint').at(-1).save,true);h.ack();h.advance(300001);h.svc.handle(h.p,{type:'ai:trainBeat'});assert.equal(h.sent.filter(x=>x.type==='ai:trainCheckpoint').at(-1).save,true);h.svc.leave(h.p);h.auth();assert.equal(h.sent.filter(x=>x.type==='ai:trainAuth').at(-1).loaded,true);}finally{h.svc.close()}});
test('new authenticated device takes over after old device saves; stale sessions cannot auto-reconnect',()=>{
 const h=harness();
 try{
  h.auth();h.load();h.ack();h.svc.handle(h.p,{type:'ai:trainStart'});assert.equal(h.jobs.length,1);
  const q={clientMode:'pvp',clientSessionId:'training-device-new',ws:{readyState:1,_socket:{remoteAddress:'other'},close(){this.readyState=3}}};
  h.svc.handle(q,{type:'ai:trainAuth',password:'wrong',manualLogin:true});assert.equal(q.trainingAdmin,undefined);assert.equal(h.p.trainingAdmin,true);
  h.svc.handle(q,{type:'ai:trainAuth',password:pass,manualLogin:true});
  const replacement=h.sent.findLast(m=>m.type==='ai:trainReplaced');
  assert.ok(replacement);assert.equal(q.trainingAdmin,undefined,'Wait for old Firebase save before granting new owner');
  assert.equal(h.jobs[0].data.control.byteLength,4);assert.equal(h.jobs[0].listenerCount('exit'),1);
  h.svc.handle(h.p,{type:'ai:trainHandoffSaved',session:replacement.session,revision:replacement.revision});
  assert.equal(q.trainingAdmin,true);assert.equal(h.p.trainingAdmin,false);assert.equal(h.p.ws.readyState,3);
  assert.equal(h.svc.isRevoked('training-device-old'),true);
  const stale={clientMode:'pvp',clientSessionId:'training-device-old',ws:{_socket:{remoteAddress:'old-reconnect'}}};
  h.svc.handle(stale,{type:'ai:trainAuth',password:pass});
  assert.equal(h.sent.findLast(m=>m.type==='ai:trainAuth').replaced,true);
  assert.notEqual(stale.trainingAdmin,true);
  h.svc.handle(stale,{type:'ai:trainAuth',password:pass,manualLogin:true});
  assert.equal(h.svc.isRevoked('training-device-old'),false);
  assert.ok(h.sent.some(m=>m.type==='ai:trainReplaced'),"Manual login can initiate a fresh takeover");
 }finally{h.svc.close()}
});
test('old device disconnect during handoff does not discard server checkpoint',()=>{
 const h=harness();try{
  h.auth();h.load();h.ack();
  const q={clientMode:'pvp',clientSessionId:'fresh',ws:{readyState:1,_socket:{remoteAddress:'fresh'},close(){this.readyState=3}}};
  h.svc.handle(q,{type:'ai:trainAuth',password:pass,manualLogin:true});
  h.svc.leave(h.p);
  assert.equal(q.trainingAdmin,true);
  assert.equal(h.sent.findLast(m=>m.type==='ai:trainCheckpoint').save,true);
  assert.equal(h.sent.findLast(m=>m.type==='ai:trainTakeoverNotice').message.includes('저장 확인'),true);
 }finally{h.svc.close()}
});
test('repeated incorrect passwords cannot force an administrator logout',()=>{
 const h=harness();try{
  h.auth();
  const q={clientMode:'pvp',clientSessionId:'attacker',ws:{_socket:{remoteAddress:'other'}}};
  for(let i=0;i<6;i++)h.svc.handle(q,{type:'ai:trainAuth',password:'wrong'});
  h.svc.handle(q,{type:'ai:trainAuth',password:pass,manualLogin:true});
  assert.equal(h.sent.at(-1).ok,false);assert.equal(h.p.trainingAdmin,true);assert.equal(q.trainingAdmin,undefined);
  h.svc.handle(h.p,{type:'ai:trainLoad',checkpoint:{schema:1}});
  assert.equal(h.sent.at(-1).type,'ai:trainError');
 }finally{h.svc.close()}
});

test('panel is reachable only by the title-screen hotkey and controls remain locked before auth',async()=>{
 const vm=await import('node:vm'),{readFileSync}=await import('node:fs');const nodes=new Map(),events={},listeners={};let titleHidden=false;
 function node(id){if(nodes.has(id))return nodes.get(id);const n={id,hidden:id==='aiDeviceControls',value:'',textContent:'',classList:{contains:()=>titleHidden},appendChild(){},replaceChildren(){},addEventListener(t,fn){listeners[id+':'+t]=fn},focus(){},showModal(){this.open=true},close(){this.open=false}};nodes.set(id,n);return n;}
 const panel=node('panel'),c={console,Promise,Map,Object,JSON,String,structuredClone,setInterval:()=>1,clearInterval(){},localStorage:{getItem:()=>null,setItem(){}},document:{createElement:t=>t==='dialog'?panel:node(t),head:node('head'),body:node('body'),getElementById:node},EchoesMulti:{on:(t,f)=>events[t]=f,training(){},disconnect(){},state:{deviceTrainingProtocol:3}},addEventListener:(t,f)=>listeners[t]=f};c.window=c;vm.createContext(c);vm.runInContext(readFileSync(new URL('../ai-device-panel.js',import.meta.url),'utf8'),c);
 listeners.keydown({code:'F9',ctrlKey:false,shiftKey:false,preventDefault(){}});assert.equal(panel.open,undefined);
 titleHidden=true;listeners.keydown({code:'F9',ctrlKey:true,shiftKey:true,preventDefault(){}});assert.equal(panel.open,undefined);
 titleHidden=false;listeners.keydown({code:'F9',ctrlKey:true,shiftKey:true,preventDefault(){}});assert.equal(panel.open,true);assert.equal(node('aiDeviceControls').hidden,true);
 await events['ai:trainAuth']({ok:false,message:'Denied'});assert.equal(node('aiDeviceControls').hidden,true);assert.equal(node('aiDeviceMessage').textContent,'Denied');
});

test('new admin login triggers previous browser checkpoint save, sign-out and disables automatic re-login',async()=>{
 const vm=await import('node:vm'),{readFileSync}=await import('node:fs');
 const nodes=new Map(),events={},listeners={},sent=[],saved=[];let loggedOut=0,disconnected=0;
 function node(id){if(nodes.has(id))return nodes.get(id);const n={id,hidden:false,value:'',textContent:'',classList:{contains:()=>false},appendChild(){},replaceChildren(){},addEventListener(t,fn){listeners[id+':'+t]=fn},focus(){},showModal(){this.open=true},close(){this.open=false}};nodes.set(id,n);return n;}
 const panel=node('panel'),cloud={ready:Promise.resolve(),currentTrainingUid:()=> 'admin-test',loginTraining:async()=>{},logoutTraining:async()=>{loggedOut++},saveTraining:async p=>saved.push(p)};
 const multi={state:{deviceTrainingProtocol:3},connected:false,on:(t,f)=>events[t]=f,training:(t,p)=>sent.push({type:t,...p}),connect:async function(){this.connected=true},disconnect(){this.connected=false;disconnected++}};
 const c={console,Promise,Map,Object,JSON,String,structuredClone,setInterval:()=>1,clearInterval(){},localStorage:{getItem:()=>null,setItem(){}},document:{createElement:t=>t==='dialog'?panel:node(t),head:node('head'),body:node('body'),getElementById:node},EchoesMulti:multi,EchoesCloud:cloud,EchoesTrainingAccount:{clearGameSession(){}},addEventListener:(t,f)=>listeners[t]=f};
 c.window=c;vm.createContext(c);vm.runInContext(readFileSync(new URL('../ai-device-panel.js',import.meta.url),'utf8'),c);
 listeners.keydown({code:'F9',ctrlKey:true,shiftKey:true,preventDefault(){}});node('aiDevicePassword').value='test-secret';
 await node('aiDeviceLogin').onsubmit({preventDefault(){}});
 assert.equal(sent.find(m=>m.type==='Auth').manualLogin,true);
 await events['ai:trainAuth']({ok:true,session:'test-session',loaded:true});
 const checkpoint={schema:1,policy:{matches:42,styles:{gale:{games:42,wins:21,weights:[1,1,1]}}}};
 events['ai:trainCheckpoint']({checkpoint,session:'test-session',revision:3,save:false});
 await events['ai:trainReplaced']({session:'test-session',revision:3,checkpoint});
 assert.equal(saved.at(-1).policy.matches,42);
 assert.equal(sent.find(m=>m.type==='HandoffSaved').revision,3);
 assert.equal(loggedOut,1);assert.equal(disconnected,1);assert.equal(node('aiDeviceControls').hidden,true);
 const before=sent.length;events['reconnected']();assert.equal(sent.length,before,'Old computer must not silently authenticate again');
});


test('authenticated spectator previews are optional, bounded and disabled on logout',()=>{
 const h=harness();
 try{
  const stranger={clientMode:'pvp',ws:{_socket:{remoteAddress:'stranger'}}};
  h.svc.handle(stranger,{type:'ai:trainWatch',enabled:true});
  assert.equal(h.sent.at(-1).type,'ai:trainError');
  h.auth();h.load();h.ack();
  h.svc.handle(h.p,{type:'ai:trainStart'});
  const job=h.jobs[0],watch=new Int32Array(job.data.watch);
  assert.equal(watch[0],0,'Live previews must be off by default');
  const preview={phase:'train',match:1,styles:['gale','void'],step:16,players:[{x:1450,y:1050,hp:100,maxHp:100},{x:2150,y:1050,hp:100,maxHp:100}]};
  const before=h.sent.filter(m=>m.type==='ai:trainPreview').length;
  job.emit('message',{preview});assert.equal(h.sent.filter(m=>m.type==='ai:trainPreview').length,before);
  h.svc.handle(h.p,{type:'ai:trainWatch',enabled:true});
  assert.equal(watch[0],1);assert.equal(h.sent.at(-1).enabled,true);
  job.emit('message',{preview});assert.equal(h.sent.filter(m=>m.type==='ai:trainPreview').length,before+1);
  h.p.ws.bufferedAmount=70000;job.emit('message',{preview});
  assert.equal(h.sent.filter(m=>m.type==='ai:trainPreview').length,before+1,'Skip preview when browser network is backed up');
  h.p.ws.bufferedAmount=0;h.svc.handle(h.p,{type:'ai:trainWatch',enabled:false});assert.equal(watch[0],0);
  job.emit('message',{preview});assert.equal(h.sent.filter(m=>m.type==='ai:trainPreview').length,before+1);
  h.svc.leave(h.p);assert.equal(watch[0],0);
 }finally{h.svc.close()}
});
test('AI training manager mounts spectator only behind authenticated controls',async()=>{
 const vm=await import('node:vm'),{readFileSync}=await import('node:fs');
 const nodes=new Map(),events={},listeners={},calls=[];
 const node=id=>{if(nodes.has(id))return nodes.get(id);const n={id,hidden:false,value:'',textContent:'',setAttribute(){},classList:{contains:()=>false},appendChild(){},replaceChildren(){},addEventListener(t,f){listeners[id+':'+t]=f},focus(){},showModal(){this.open=true},close(){this.open=false}};nodes.set(id,n);return n};
 const panel=node('panel'),viewer={init(el){calls.push(['init',el.id])},show(v){calls.push(['show',v])},frame(f){calls.push(['frame',f.step])}};
 const multi={on:(name,f)=>events[name]=f,training:(name,p)=>calls.push(['send',name,p]),state:{deviceTrainingProtocol:3},connect:async()=>{},disconnect(){},connected:false};
 const cloud={ready:Promise.resolve(),currentTrainingUid:()=> 'admin-test',loginTraining:async()=>{},logoutTraining:async()=>{},loadTraining:async()=>null};
 const c={console,Promise,Map,Object,JSON,String,structuredClone,setInterval:()=>1,clearInterval(){},setTimeout,localStorage:{getItem:()=>null,setItem(){}},document:{createElement:t=>t==='dialog'?panel:node(t),head:node('head'),body:node('body'),getElementById:node},EchoesAiTrainingViewer:viewer,EchoesMulti:multi,EchoesCloud:cloud,EchoesTrainingAccount:{clearGameSession(){}},addEventListener:(t,f)=>listeners[t]=f};
 c.window=c;vm.createContext(c);vm.runInContext(readFileSync(new URL('../ai-device-panel.js',import.meta.url),'utf8'),c);
 assert.deepEqual(calls[0],['init','aiSpectator']);
 events['ai:trainPreview']({session:'not-logged-in',preview:{step:16}});
 assert.ok(!calls.some(x=>x[0]==='frame'));
 listeners.keydown({code:'F9',ctrlKey:true,shiftKey:true,preventDefault(){}});
 node('aiDevicePassword').value='test-password';await node('aiDeviceLogin').onsubmit({preventDefault(){}});
 await events['ai:trainAuth']({ok:true,session:'test-session',loaded:true});
 await panel.onclick({target:{dataset:{ai:'Watch'}}});
 assert.ok(calls.some(x=>x[0]==='send'&&x[1]==='Watch'&&x[2].enabled===true));
 events['ai:trainPreview']({session:'wrong-session',preview:{step:16}});
 assert.ok(!calls.some(x=>x[0]==='frame'));
 events['ai:trainPreview']({session:'test-session',preview:{step:24}});
 assert.deepEqual(calls.find(x=>x[0]==='frame'),['frame',24]);
 await panel.onclick({target:{dataset:{ai:'Watch'}}});
 assert.ok(calls.some(x=>x[0]==='send'&&x[1]==='Watch'&&x[2].enabled===false));
 events['ai:trainPreview']({session:'test-session',preview:{step:32}});
 assert.equal(calls.filter(x=>x[0]==='frame').length,1);
});

test('split spectator creates separate panes for training and evaluation battles',async()=>{
 const vm=await import('node:vm'),{readFileSync}=await import('node:fs');
 const el=tag=>({tag,children:[],hidden:false,className:'',textContent:'',width:0,height:0,appendChild(v){this.children.push(v)},setAttribute(){}});
 const head=el('head'),document={head,createElement:el};
 const c={console,Map,Math,Number,Array,Object,String,setTimeout:()=>1,clearTimeout(){},document};c.window=c;vm.createContext(c);
 vm.runInContext(readFileSync(new URL('../ai-training-viewer.js',import.meta.url),'utf8'),c);
 const root=el('root');c.EchoesAiTrainingViewer.init(root);c.EchoesAiTrainingViewer.show(true);
 const players=[{x:1400,y:1050,a:0,hp:100,maxHp:100,shield:100,maxShield:100},{x:2200,y:1050,a:3.14,hp:100,maxHp:100,shield:100,maxShield:100}];
 c.EchoesAiTrainingViewer.frame({phase:'train',lane:0,laneCount:3,match:1,styles:['gale','void'],step:0,players});
 c.EchoesAiTrainingViewer.frame({phase:'train',lane:1,laneCount:3,match:2,styles:['dawn','break'],step:0,players});
 c.EchoesAiTrainingViewer.frame({phase:'evaluation',lane:0,laneCount:32,match:1,styles:['gale','break'],step:0,players});
 assert.equal(root.children[1].children.length,2);
 assert.equal(root.children[3].children.length,1);
});

test('split spectator restarts the same pane when a new bout reaches that lane',async()=>{
 const vm=await import('node:vm'),{readFileSync}=await import('node:fs');
 const ctx={beginPath(){},moveTo(){},lineTo(){},stroke(){},fillRect(){},arc(){},ellipse(){},fill(){},setLineDash(){},fillText(){}};
 const el=tag=>({tag,children:[],hidden:false,className:'',textContent:'',width:0,height:0,appendChild(v){this.children.push(v)},setAttribute(){},getContext(){return tag==='canvas'?ctx:null}});
 const head=el('head'),document={head,createElement:el};
 const scheduled=[];const c={console,Map,Math,Number,Array,Object,String,setTimeout:fn=>{scheduled.push(fn);return scheduled.length},clearTimeout(){},document};c.window=c;vm.createContext(c);
 vm.runInContext(readFileSync(new URL('../ai-training-viewer.js',import.meta.url),'utf8'),c);
 const root=el('root');c.EchoesAiTrainingViewer.init(root);c.EchoesAiTrainingViewer.show(true);
 const players=[{x:1400,y:1050,a:0,hp:100,maxHp:100,shield:100,maxShield:100},{x:2200,y:1050,a:3.14,hp:100,maxHp:100,shield:100,maxShield:100}];
 c.EchoesAiTrainingViewer.frame({phase:'train',lane:0,laneCount:3,cycle:0,match:1,styles:['gale','void'],step:60,players,final:true});
 while(scheduled.length)scheduled.shift()();
 const pane=root.children[1].children[0],oldInfo=pane.children[2].textContent;
 c.EchoesAiTrainingViewer.frame({phase:'train',lane:0,laneCount:3,cycle:0,match:4,styles:['dawn','break'],step:0,players});
 assert.notEqual(pane.children[2].textContent,oldInfo);
 assert.match(pane.children[0].textContent,/재전투 1회/);
 assert.match(pane.children[2].textContent,/4번째/);
 assert.doesNotMatch(pane.children[2].textContent,/종료/);
});

test('retraining cadence changes live without changing battle simulation speed',()=>{
 const h=harness();try{
  h.auth();h.load();h.ack();h.svc.handle(h.p,{type:'ai:trainStart'});
  const tuning=new Int32Array(h.jobs[0].data.tuning);
  assert.deepEqual([...tuning],[1000,3]);
  h.svc.handle(h.p,{type:'ai:trainConfig',retrainDelayMs:250,matchesPerBurst:7});
  assert.deepEqual([...tuning],[250,7]);
  const status=h.sent.filter(m=>m.type==='ai:trainStatus').at(-1);
  assert.deepEqual(status.settings,{retrainDelayMs:250,matchesPerBurst:7});
  h.svc.handle(h.p,{type:'ai:trainConfig',retrainDelayMs:-1,matchesPerBurst:7});
  assert.equal(h.sent.at(-1).type,'ai:trainError');
  assert.deepEqual([...tuning],[250,7]);
 }finally{h.svc.close();}
});

test('continuous training accepts batches above 25 and keeps the configured burst',()=>{
 const h=harness();try{
  h.auth();h.load();h.ack();h.svc.handle(h.p,{type:'ai:trainConfig',retrainDelayMs:0,matchesPerBurst:100});h.svc.handle(h.p,{type:'ai:trainStart'});
  const policy=seedPolicy();policy.matches=30;
  h.jobs[0].emit('message',{checkpoint:{schema:1,batch:100,completed:30,policy,baseline:seedPolicy()}});
  const status=h.sent.filter(m=>m.type==='ai:trainStatus').at(-1);
  assert.equal(status.batchSize,100);assert.equal(status.batchCompleted,30);assert.equal(status.settings.matchesPerBurst,100);
 }finally{h.svc.close();}
});

test('training count continues beyond 1050 while Firebase save requests are coalesced',()=>{
 const h=harness();try{
  h.auth();h.load();h.ack();h.svc.handle(h.p,{type:'ai:trainStart'});
  const job=h.jobs[0],base=seedPolicy();
  for(let matches=1025;matches<=1100;matches+=25){
   const policy=structuredClone(base);policy.matches=matches;
   job.emit('message',{checkpoint:{schema:1,batch:25,completed:25,policy,baseline:seedPolicy()}});
  }
  const checkpoints=h.sent.filter(m=>m.type==='ai:trainCheckpoint');
  assert.equal(checkpoints.filter(m=>m.save===true).length,1,'Only one Firebase save may be in flight');
  const status=h.sent.filter(m=>m.type==='ai:trainStatus').at(-1);
  assert.equal(status.matches,1100,'Training counter must not stop at 1050');
  const requested=checkpoints.findLast(m=>m.save===true);
  h.svc.handle(h.p,{type:'ai:trainSaved',session:requested.session,revision:requested.revision,matches:requested.checkpoint.policy.matches});
  const after=h.sent.filter(m=>m.type==='ai:trainCheckpoint').at(-1);
  assert.equal(after.checkpoint.policy.matches,1100);
  assert.equal(after.save,true,'After the first save completes, only the newest unsaved checkpoint is requested');
 }finally{h.svc.close();}
});

test('Firebase save failure retries without pausing AI training',()=>{
 const h=harness();try{
  h.auth();h.load();h.ack();h.svc.handle(h.p,{type:'ai:trainStart'});
  const gate=new Int32Array(h.jobs[0].data.control),policy=seedPolicy();policy.matches=25;
  h.jobs[0].emit('message',{checkpoint:{schema:1,batch:25,completed:25,policy,baseline:seedPolicy()}});
  h.svc.handle(h.p,{type:'ai:trainSaveFailed'});
  h.svc.tick();
  assert.equal(gate[0],1,'Save failure must not pause the worker');
  const status=h.sent.filter(m=>m.type==='ai:trainStatus').at(-1);
  assert.equal(status.running,true);
  assert.match(status.error,/훈련은 계속/);
  h.advance(10001);h.svc.tick();
  assert.equal(h.sent.filter(m=>m.type==='ai:trainCheckpoint').at(-1).save,true,'Retry save after backoff');
 }finally{h.svc.close();}
});

test('training status includes the last duel and the next least-experienced pairing',()=>{
 const h=harness();try{
  h.auth();h.load();h.ack();h.svc.handle(h.p,{type:'ai:trainStart'});
  const job=h.jobs[0],policy=seedPolicy();policy.matches=1;policy.styles.gale.games=1;policy.styles.void.games=1;
  job.emit('message',{progress:1,pair:['gale','void'],checkpoint:{schema:1,batch:25,completed:1,policy,baseline:seedPolicy()}});
  const status=h.sent.filter(m=>m.type==='ai:trainStatus').at(-1);
  assert.deepEqual(status.lastPair,['gale','void']);
  assert.deepEqual(status.nextPair,['dawn','break']);
  assert.equal(status.matches,1);
 }finally{h.svc.close();}
});
