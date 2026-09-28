import {Worker} from 'node:worker_threads';
import {createHash,timingSafeEqual,randomUUID} from 'node:crypto';
import {seedPolicy} from './brain.js';
import {validatePolicy} from './store.js';
// One authenticated device leases training on the existing web service.
// No extra Render instance. Dropped heartbeat or a failed save pauses work.
export function createDeviceTraining({send,isBusy,onPolicy,now=Date.now,makeWorker=(data)=>new Worker(new URL('./train-worker.js',import.meta.url),{workerData:data,resourceLimits:{maxOldGenerationSizeMb:144}}),passwordHash=process.env.AI_DEVICE_PASSWORD_SHA256||''}){
 let owner=null,lease=0,running=false,worker=null,checkpoint=null,revision=0,savedRevision=0,error='',loaded=false;
 const control=new Int32Array(new SharedArrayBuffer(4)),session=randomUUID();let lastSave=now(),lastSaveMatches=0;
 const attempts=new Map();
 const valid=c=>{if(!c||c.schema!==1||c.batch!==25||!Number.isInteger(c.completed)||c.completed<0||c.completed>25)throw Error('잘못된 학습 기록입니다.');validatePolicy(c.policy);validatePolicy(c.baseline);if(c.evaluation&&(!Number.isInteger(c.evaluation.completed)||c.evaluation.completed<0||c.evaluation.completed>18))throw Error('잘못된 평가 기록입니다.');return c;};
 function status(){if(owner)send(owner.ws,{type:'ai:trainStatus',session,running,paused:!running?'stopped':isBusy(owner)?'players':now()>lease?'disconnected':error?'save-error':'',matches:checkpoint?.policy.matches||0,revision,savedRevision,error});}
 function exportCheckpoint(force=false){if(owner&&checkpoint)send(owner.ws,{type:'ai:trainCheckpoint',session,revision,checkpoint,save:force||checkpoint.policy.matches-lastSaveMatches>=25||now()-lastSave>=300000});}
 function pause(){Atomics.store(control,0,0);}
 function launch(){if(worker||!running||!loaded)return;Atomics.store(control,0,1);
 const w=makeWorker({policy:checkpoint.policy,checkpoint,control:control.buffer,device:true});worker=w;
 w.on('message',m=>{if(worker!==w)return;if(m.checkpoint){checkpoint=valid(m.checkpoint);revision++;exportCheckpoint();}
 if(m.policy){onPolicy(m.policy);checkpoint={schema:1,batch:25,completed:0,policy:m.policy,baseline:structuredClone(m.policy)};revision++;exportCheckpoint(true);}status();});
 w.on('error',e=>{if(worker!==w)return;error='훈련 실행 오류';running=false;status();});
 w.on('exit',()=>{if(worker!==w)return;worker=null;status();});
 }
 function tick(){if(!owner||!running||now()>lease||isBusy(owner)||error){pause();return;}if(!worker)launch();else{Atomics.store(control,0,1);Atomics.notify(control,0);}if(checkpoint&&now()-lastSave>=300000)exportCheckpoint(true);}
 const timer=setInterval(tick,1000);timer.unref?.();
 function leave(p){if(owner!==p)return;pause();running=false;owner.trainingAdmin=false;owner=null;if(worker){const w=worker;worker=null;w.terminate();}}
 function handle(p,m,bytes=0){if(!String(m?.type||'').startsWith('ai:train'))return false;
 if(bytes>160000)return true;
 if(m.type==='ai:trainAuth'){
 if(p.clientMode!=='pvp')return true;
 const key=p.ws?._socket?.remoteAddress||'unknown',t=now();let a=attempts.get(key)||{count:0,until:t+60000};if(t>a.until)a={count:0,until:t+60000};a.count++;attempts.set(key,a);if(attempts.size>2000)for(const [k,v] of attempts)if(t>v.until)attempts.delete(k);
 const token=String(m.password||''),hash=createHash('sha256').update(token).digest('hex');
 if(a.count>5||passwordHash.length!==64||!timingSafeEqual(Buffer.from(hash),Buffer.from(passwordHash))){send(p.ws,{type:'ai:trainAuth',ok:false,message:'관리자 비밀번호를 확인하세요. 여러 번 실패하면 1분 후 다시 시도하세요.'});return true;}
 if(owner&&owner!==p&&now()<lease){send(p.ws,{type:'ai:trainAuth',ok:false,message:'다른 기기에서 훈련 관리 중입니다.'});return true;}
 if(owner)owner.trainingAdmin=false;owner=p;p.trainingAdmin=true;lease=t+45000;attempts.delete(key);send(p.ws,{type:'ai:trainAuth',ok:true,session,loaded});status();if(loaded)exportCheckpoint(true);return true;
 }
 if(owner!==p){send(p.ws,{type:'ai:trainError',message:'관리자 인증이 필요합니다.'});return true;}
 lease=now()+45000;
 try{
 if(m.type==='ai:trainBeat'){tick();status();}
 else if(m.type==='ai:trainLoad'){
 if(running||worker)throw Error('중지 후 현재 작업이 끝날 때까지 기다려 주세요.');
 checkpoint=m.checkpoint?valid(structuredClone(m.checkpoint)):{schema:1,batch:25,completed:0,policy:seedPolicy(),baseline:seedPolicy()};loaded=true;revision++;error='';onPolicy(checkpoint.baseline);exportCheckpoint(true);status();
 }else if(m.type==='ai:trainStart'){if(!loaded||savedRevision!==revision)throw Error('Firebase 저장 확인 후 시작할 수 있습니다.');running=true;error='';tick();status();}
 else if(m.type==='ai:trainStop'){running=false;pause();if(worker){Atomics.store(control,0,2);Atomics.notify(control,0);const w=worker;worker=null;w.terminate();}exportCheckpoint(true);status();}
 else if(m.type==='ai:trainSaved'){if(m.session!==session||!Number.isInteger(m.revision)||m.revision>revision||m.revision<savedRevision)return true;savedRevision=m.revision;lastSave=now();lastSaveMatches=Math.max(lastSaveMatches,Number(m.matches)||0);error='';status();}
 else if(m.type==='ai:trainSaveFailed'){error='Firebase 저장 실패 · 연결을 확인하고 다시 저장하세요.';pause();status();}
 else if(m.type==='ai:trainSave')exportCheckpoint(true);
 else if(m.type==='ai:trainLeave'){exportCheckpoint(true);leave(p);}
 }catch(e){send(p.ws,{type:'ai:trainError',message:e.message});}return true;
 }
 return {handle,leave,close(){clearInterval(timer);Atomics.store(control,0,2);Atomics.notify(control,0);worker?.terminate();worker=null},tick};
}
