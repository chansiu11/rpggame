// Deploy separately from server.js. No self-play runs in the PVP process.
import http from 'node:http';
import {Worker} from 'node:worker_threads';
import {timingSafeEqual} from 'node:crypto';
import {FirebaseStore} from './store.js';
import {seedPolicy,leastTrainedPair} from './brain.js';
const store=new FirebaseStore();let policy=seedPolicy(),worker=null,running=false,ready=false,error='',progress=0,version=null,busy=false,savedMatches=0,resumeAfterShutdown=false,lastPair=null;
function launch(){if(!running||worker||!ready)return;worker=new Worker(new URL('./train-worker.js',import.meta.url),{workerData:{policy,batch:25},resourceLimits:{maxOldGenerationSizeMb:160}});
 worker.on('message',async m=>{if(m.progress)progress=m.progress;if(Array.isArray(m.pair))lastPair=[...m.pair];if(m.policy){busy=true;try{policy=m.policy;policy.autorun=running||resumeAfterShutdown;version=await store.save(policy);savedMatches=policy.matches;error='';}catch(e){error=e.message;running=false;}finally{busy=false;}}});
 worker.on('error',e=>{error=e.message;running=false;});worker.on('exit',()=>{worker=null;const next=()=>{if(busy)setTimeout(next,100);else if(running)launch();};setTimeout(next,1000)});
}
async function initialize(){try{if(!store.enabled)throw Error('FIREBASE_SERVICE_ACCOUNT_JSON is required');policy=await store.ensureResetEpoch(seedPolicy());progress=savedMatches=policy.matches;ready=true;running=policy.autorun===true;launch();}catch(e){error=e.message;}}
await initialize();
const allowedOrigin=process.env.AI_ADMIN_ORIGIN||'https://chansiu11.github.io';
function authorized(req){const expected=process.env.AI_ADMIN_TOKEN||'',provided=String(req.headers.authorization||'').replace(/^Bearer /,'');const a=Buffer.from(provided),b=Buffer.from(expected);return b.length>=24&&a.length===b.length&&timingSafeEqual(a,b);}
const server=http.createServer(async(req,res)=>{
 res.setHeader('Content-Type','application/json');if(req.headers.origin===allowedOrigin){res.setHeader('Access-Control-Allow-Origin',allowedOrigin);res.setHeader('Vary','Origin');}
 if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, POST');res.writeHead(204);res.end();return;}
 const reply=(code,data)=>{res.writeHead(code);res.end(JSON.stringify(data));};
 if(req.url==='/health')return reply(200,{ok:true,ready});if(!authorized(req))return reply(401,{error:'관리자 인증이 필요합니다.'});
 try{
 if(req.method==='GET'&&req.url==='/status')return reply(200,{ready,running,draining:!running&&!!worker,busy,progress,savedMatches,lastPair,nextPair:leastTrainedPair(policy),version,error,policy});
 if(req.method==='GET'&&req.url==='/versions')return reply(200,{versions:await store.versions()});
 if(req.method!=='POST')return reply(404,{error:'Not found'});
 if(busy)return reply(409,{error:'저장 중입니다.'});
 if(req.url==='/stop'){running=false;policy.autorun=false;if(!worker){busy=true;try{version=await store.save(policy)}finally{busy=false}}return reply(200,{ok:true,draining:!!worker});}
 if(worker)return reply(409,{error:'훈련을 중지한 후 현재 배치 저장이 끝날 때까지 기다려 주세요.'});
 busy=true;try{
 if(req.url==='/start'){if(!ready)await initialize();if(!ready)throw Error(error);policy.autorun=true;await store.save(policy);running=true;launch();}
 else if(req.url==='/save'){version=await store.save(policy);savedMatches=policy.matches;}
 else if(req.url==='/load'){policy=await store.load()||seedPolicy();progress=savedMatches=policy.matches;}
 else if(req.url?.startsWith('/restore/')){const restored=await store.load(req.url.slice(9));if(!restored)throw Error('Version not found');policy={...restored,autorun:false};version=await store.save(policy);progress=savedMatches=policy.matches;}
 else return reply(404,{error:'Not found'});
 return reply(200,{ok:true});
 }finally{busy=false;}
 }catch(e){reply(503,{error:e.message});}
});
server.listen(Number(process.env.PORT)||8790,()=>console.log('AI trainer listening'));
process.on('SIGTERM',()=>{resumeAfterShutdown=running;running=false;server.close();const drain=()=>{if(worker||busy)setTimeout(drain,100);else process.exit(0)};drain();});
