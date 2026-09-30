import {Worker} from 'node:worker_threads';
import {randomUUID} from 'node:crypto';
import {styles,seedPolicy,normalizeDifficulty} from './brain.js';
import {FirebaseStore} from './store.js';
export function createAiService(send,{store=new FirebaseStore(),refreshIntervalMs=60000}={}){
 const sessions=new Map();let policy=seedPolicy(),devicePolicyInstalled=false;
 // The device trainer can publish a newer policy while an earlier Firestore
 // read is still in flight. Never let that stale read undo its learned weights.
 const useStored=p=>{if(p&&!devicePolicyInstalled)policy=p;};
 if(store.enabled)(typeof store.ensureResetEpoch==='function'?store.ensureResetEpoch(seedPolicy()):store.load()).then(p=>{useStored(p);console.log('[ai-policy-reset]',p?.resetEpoch||'none','matches='+Number(p?.matches||0),'generation='+Number(p?.generation||0));}).catch(e=>console.error('[ai-policy-reset]',e.message));
 const refresh=setInterval(()=>{if(store.enabled&&!devicePolicyInstalled)store.load().then(useStored).catch(e=>console.error('[ai-policy-refresh]',e.message))},refreshIntervalMs);refresh.unref();
 function leave(p){const s=sessions.get(p.id);if(!s)return;sessions.delete(p.id);clearTimeout(s.timeout);s.worker.terminate();}
 function handle(p,m,bytes){if(!String(m?.type||'').startsWith('pvp:ai'))return false;
 if(m.type==='pvp:aiLeave'){leave(p);return true;}
 if(p.clientMode!=='pvp')return true;
 if(m.type==='pvp:aiStart'){
 if(p.pvpRelayMatch){send(p.ws,{type:'pvp:aiError',message:'진행 중인 PVP를 먼저 종료하세요.'});return true;}
 if(Date.now()-(p.aiLastStart||0)<3000)return true;p.aiLastStart=Date.now();leave(p);
 if(sessions.size>=Math.max(1,Math.min(4,Number(process.env.AI_MAX_MATCHES)||1))){send(p.ws,{type:'pvp:aiError',message:'AI 서버가 사용 중입니다. 잠시 후 다시 시도하세요.'});return true;}
 const style=Object.hasOwn(styles,m.style)?m.style:Object.keys(styles)[Math.floor(Math.random()*Object.keys(styles).length)],id=randomUUID(),difficulty=normalizeDifficulty(m.difficulty);
 const spectate=m.spectate===true;
 const worker=new Worker(new URL('./live-worker.js',import.meta.url),{workerData:{style,level:p.level,policy,difficulty},resourceLimits:{maxOldGenerationSizeMb:96}}),s={worker,id,spectate,count:0,at:Date.now(),timeout:setTimeout(()=>{send(p.ws,{type:'pvp:aiError',message:'AI 대전 제한 시간(20분)이 끝났습니다.'});leave(p)},20*60*1000)};sessions.set(p.id,s);
 worker.on('message',data=>{if(sessions.get(p.id)!==s)return;if(data.t==='aiReady')send(p.ws,{type:'pvp:aiReady',matchId:id,style,difficulty,...(spectate?{spectate:true,policy:structuredClone(policy)}:{})});else send(p.ws,{type:'pvp:aiPacket',matchId:id,data},{volatile:!spectate&&data.t==='state'});});
 worker.on('error',e=>{console.error('[ai-worker]',e.message);send(p.ws,{type:'pvp:aiError',message:'AI 실행 오류가 발생했습니다.'});leave(p)});
 worker.on('exit',()=>{if(sessions.get(p.id)===s){sessions.delete(p.id);clearTimeout(s.timeout);send(p.ws,{type:'pvp:aiError',message:'AI 대전이 종료되었습니다.'});}});
 }else if(m.type==='pvp:aiPacket'){
 const s=sessions.get(p.id);if(!s||s.id!==m.matchId||bytes>65536||!m.data||typeof m.data.t!=='string')return true;
 if(Date.now()-s.at>=1000){s.at=Date.now();s.count=0;}if(++s.count>(s.spectate?1200:240))return true;s.worker.postMessage(m.data);
 }return true;
 }return {handle,leave,setPolicy(value){policy=value;devicePolicyInstalled=true;},get currentPolicy(){return policy;},get active(){return sessions.size;},close(){clearInterval(refresh);for(const s of sessions.values()){clearTimeout(s.timeout);s.worker.terminate();}sessions.clear();}};
}
