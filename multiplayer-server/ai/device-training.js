import {Worker} from 'node:worker_threads';
import {createHash,timingSafeEqual,randomUUID} from 'node:crypto';
import {seedPolicy,leastTrainedPair} from './brain.js';
import {validatePolicy} from './store.js';
// One authenticated device leases training on the existing web service.
// No extra Render instance. Dropped heartbeat or a failed save pauses work.
export function createDeviceTraining({send,isBusy,onPolicy,now=Date.now,makeWorker=(data)=>new Worker(new URL('./train-worker.js',import.meta.url),{workerData:data,resourceLimits:{maxOldGenerationSizeMb:144}}),passwordHash=process.env.AI_DEVICE_PASSWORD_SHA256||''}){
 let owner=null,lease=0,running=false,worker=null,checkpoint=null,revision=0,savedRevision=0,error='',loaded=false,lastPair=null;
 const control=new Int32Array(new SharedArrayBuffer(4)),watchControl=new Int32Array(new SharedArrayBuffer(4)),session=randomUUID();let lastSave=now(),lastSaveMatches=0,watchEnabled=false;
 const attempts=new Map();
 // A successful administrator login on another device transfers the training lease.
 // Replaced browser sessions cannot silently reconnect; explicit new logins still work.
 const revokedSessions=new Set();let pendingTakeover=null;
 function grant(p){
  watchEnabled=false;Atomics.store(watchControl,0,0);
  owner=p;p.trainingAdmin=true;p.trainingReplaced=false;lease=now()+45000;
  send(p.ws,{type:'ai:trainAuth',ok:true,session,loaded});status();if(loaded)exportCheckpoint(true);
 }
 function finishTakeover(h,saved){
  if(pendingTakeover!==h)return;
  clearTimeout(h.timer);pendingTakeover=null;
  if(saved&&h.revision===revision){savedRevision=Math.max(savedRevision,revision);lastSave=now();lastSaveMatches=Math.max(lastSaveMatches,checkpoint?.policy.matches||0);}
  const old=h.old;
  if(old===owner){
   old.trainingAdmin=false;old.trainingReplaced=true;owner=null;
   if(old.clientSessionId&&old.clientSessionId!==h.next.clientSessionId){
    revokedSessions.add(old.clientSessionId);
    if(revokedSessions.size>256)revokedSessions.delete(revokedSessions.values().next().value);
   }
   try{old.ws?.close?.(4001,'training admin replaced');}catch{}
  }
  if(h.next.ws?.readyState!==undefined&&h.next.ws.readyState!==1)return;
  grant(h.next);
  if(!saved&&checkpoint)send(h.next.ws,{type:'ai:trainTakeoverNotice',message:'이전 기기의 최신 Firebase 저장 확인이 불가능했습니다. 서버에 남은 훈련 기록을 새 기기에 전달합니다.'});
 }
 function beginTakeover(next){
  if(pendingTakeover){
   if(pendingTakeover.next===next)return;
   const prev=pendingTakeover;clearTimeout(prev.timer);pendingTakeover=null;
   send(prev.next.ws,{type:'ai:trainAuth',ok:false,message:'다른 기기에서 관리자가 접속했습니다.'});
  }
  const old=owner;running=false;pause();watchEnabled=false;Atomics.store(watchControl,0,0);
  if(worker){const w=worker;worker=null;Atomics.store(control,0,2);Atomics.notify(control,0);w.terminate();}
  if(!old||old===next){grant(next);return;}
  const h={old,next,revision,timer:null};pendingTakeover=h;
  send(next.ws,{type:'ai:trainTakeoverPending',message:'기존 기기의 훈련을 중단하고 최신 기록을 저장하고 있습니다.'});
  send(old.ws,{type:'ai:trainReplaced',session,revision,checkpoint,message:'다른 기기에서 훈련 관리자로 로그인하여 자동 로그아웃합니다.'});
  if(!checkpoint||now()>lease){finishTakeover(h,false);return;}
  h.timer=setTimeout(()=>finishTakeover(h,false),6500);h.timer.unref?.();
 }
 const valid=c=>{if(!c||c.schema!==1||c.batch!==25||!Number.isInteger(c.completed)||c.completed<0||c.completed>25)throw Error('잘못된 학습 기록입니다.');validatePolicy(c.policy);validatePolicy(c.baseline);if(c.evaluation&&(!Number.isInteger(c.evaluation.completed)||c.evaluation.completed<0||c.evaluation.completed>32))throw Error('잘못된 평가 기록입니다.');return c;};
 function status(){if(owner)send(owner.ws,{type:'ai:trainStatus',session,running,paused:!running?'stopped':isBusy(owner)?'players':now()>lease?'disconnected':error?'save-error':'',matches:checkpoint?.policy.matches||0,lastPair,nextPair:checkpoint?leastTrainedPair(checkpoint.policy):null,revision,savedRevision,error});}
 function exportCheckpoint(force=false){if(owner&&checkpoint)send(owner.ws,{type:'ai:trainCheckpoint',session,revision,checkpoint,save:force||checkpoint.policy.matches-lastSaveMatches>=25||now()-lastSave>=300000});}
 function pause(){Atomics.store(control,0,0);}
 function launch(){if(worker||!running||!loaded)return;Atomics.store(control,0,1);
 const w=makeWorker({policy:checkpoint.policy,checkpoint,control:control.buffer,watch:watchControl.buffer,device:true});worker=w;
 w.on('message',m=>{if(worker!==w)return;
  if(Array.isArray(m.pair)&&m.pair.length===2)lastPair=[...m.pair];
  if(m.preview){
   if(watchEnabled&&owner&&!pendingTakeover&&(owner.ws?.bufferedAmount||0)<65536)
    send(owner.ws,{type:'ai:trainPreview',session,preview:m.preview});
   return;
  }
  if(m.checkpoint){checkpoint=valid(m.checkpoint);revision++;exportCheckpoint();}
 if(m.policy){onPolicy(m.policy);checkpoint={schema:1,batch:25,completed:0,policy:m.policy,baseline:structuredClone(m.policy)};revision++;exportCheckpoint(true);}status();});
 w.on('error',e=>{if(worker!==w)return;error='훈련 실행 오류';running=false;status();});
 w.on('exit',()=>{if(worker!==w)return;worker=null;status();});
 }
 function tick(){if(!owner||!running||now()>lease||isBusy(owner)||error){pause();return;}if(!worker)launch();else{Atomics.store(control,0,1);Atomics.notify(control,0);}if(checkpoint&&now()-lastSave>=300000)exportCheckpoint(true);}
 const timer=setInterval(tick,1000);timer.unref?.();
 function leave(p){
  if(pendingTakeover?.next===p){clearTimeout(pendingTakeover.timer);pendingTakeover=null;}
  if(pendingTakeover?.old===p)finishTakeover(pendingTakeover,false);
  if(owner!==p)return;
  pause();running=false;watchEnabled=false;Atomics.store(watchControl,0,0);owner.trainingAdmin=false;owner=null;
  if(worker){const w=worker;worker=null;w.terminate();}
 }
 function handle(p,m,bytes=0){if(!String(m?.type||'').startsWith('ai:train'))return false;
 if(bytes>160000)return true;
 if(m.type==='ai:trainAuth'){
 if(p.clientMode!=='pvp')return true;
 const key=p.ws?._socket?.remoteAddress||'unknown',t=now();let a=attempts.get(key)||{count:0,until:t+60000};if(t>a.until)a={count:0,until:t+60000};a.count++;attempts.set(key,a);if(attempts.size>2000)for(const [k,v] of attempts)if(t>v.until)attempts.delete(k);
 const token=String(m.password||''),hash=createHash('sha256').update(token).digest('hex');
 if(a.count>5||passwordHash.length!==64||!timingSafeEqual(Buffer.from(hash),Buffer.from(passwordHash))){send(p.ws,{type:'ai:trainAuth',ok:false,message:'관리자 비밀번호를 확인하세요. 여러 번 실패하면 1분 후 다시 시도하세요.'});return true;}
 if(p.clientSessionId&&revokedSessions.has(p.clientSessionId)&&m.manualLogin!==true){
  p.trainingReplaced=true;
  send(p.ws,{type:'ai:trainAuth',ok:false,message:'다른 기기에서 관리자 로그인이 완료되어 자동 로그아웃됐습니다. 다시 관리하려면 직접 로그인하세요.',replaced:true});
  return true;
 }
 if(m.manualLogin===true&&p.clientSessionId)revokedSessions.delete(p.clientSessionId);
 attempts.delete(key);
 if(owner&&owner!==p){beginTakeover(p);return true;}
 grant(p);return true;
 }
 if(pendingTakeover&&p===pendingTakeover.old&&(m.type==='ai:trainHandoffSaved'||m.type==='ai:trainHandoffFailed')){
  const h=pendingTakeover;
  if(m.session===session&&m.revision===h.revision)finishTakeover(h,m.type==='ai:trainHandoffSaved');
  return true;
 }
 if(owner!==p){send(p.ws,{type:'ai:trainError',message:'관리자 인증이 필요합니다.'});return true;}
 if(pendingTakeover){if(m.type==='ai:trainBeat')status();return true;}
 lease=now()+45000;
 try{
 if(m.type==='ai:trainBeat'){tick();status();}
 else if(m.type==='ai:trainWatch'){watchEnabled=m.enabled===true;Atomics.store(watchControl,0,watchEnabled?1:0);send(p.ws,{type:'ai:trainWatchStatus',session,enabled:watchEnabled});}
 else if(m.type==='ai:trainLoad'){
 if(running||worker)throw Error('중지 후 현재 작업이 끝날 때까지 기다려 주세요.');
 checkpoint=m.checkpoint?valid(structuredClone(m.checkpoint)):{schema:1,batch:25,completed:0,policy:seedPolicy(),baseline:seedPolicy()};lastPair=null;loaded=true;revision++;error='';onPolicy(checkpoint.baseline);exportCheckpoint(true);status();
 }else if(m.type==='ai:trainStart'){if(!loaded||savedRevision!==revision)throw Error('Firebase 저장 확인 후 시작할 수 있습니다.');running=true;error='';tick();status();}
 else if(m.type==='ai:trainStop'){running=false;pause();if(worker){Atomics.store(control,0,2);Atomics.notify(control,0);const w=worker;worker=null;w.terminate();}exportCheckpoint(true);status();}
 else if(m.type==='ai:trainSaved'){if(m.session!==session||!Number.isInteger(m.revision)||m.revision>revision||m.revision<savedRevision)return true;savedRevision=m.revision;lastSave=now();lastSaveMatches=Math.max(lastSaveMatches,Number(m.matches)||0);error='';status();}
 else if(m.type==='ai:trainSaveFailed'){error='Firebase 저장 실패 · 연결을 확인하고 다시 저장하세요.';pause();status();}
 else if(m.type==='ai:trainSave')exportCheckpoint(true);
 else if(m.type==='ai:trainLeave'){exportCheckpoint(true);leave(p);}
 }catch(e){send(p.ws,{type:'ai:trainError',message:e.message});}return true;
 }
 return {handle,leave,isRevoked:id=>!!id&&revokedSessions.has(id),close(){clearInterval(timer);Atomics.store(watchControl,0,0);Atomics.store(control,0,2);Atomics.notify(control,0);worker?.terminate();worker=null},tick};
}
