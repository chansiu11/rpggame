import {createSign,randomUUID} from 'node:crypto';
export const AI_TRAINING_RESET_EPOCH='2026-09-30-ai-reset-2';
export function validatePolicy(p){
 if(p?.schema!==1||!Number.isSafeInteger(p.matches)||p.matches<0||!Number.isSafeInteger(p.generation)||p.generation<0)throw Error('Invalid policy');
 // A v1 checkpoint created before Hongryeon keeps all existing learned weights.
 // Only the new style starts with an untrained tactic policy.
 if(p.styles&&!p.styles.break)p.styles.break={weights:[1,1,1],games:0,wins:0,reward:0,metrics:{}};
 for(const id of ['gale','void','dawn','break']){const s=p.styles?.[id];if(!s||s.weights?.length!==3||s.weights.some(v=>!Number.isFinite(v)||v<.2||v>5)||!Number.isFinite(s.games)||!Number.isFinite(s.wins)||!Number.isFinite(s.reward)||!s.metrics)throw Error('Invalid style policy');}
 return p;
}
export class FirebaseStore{
 constructor(){this.enabled=!!process.env.FIREBASE_SERVICE_ACCOUNT_JSON;this.token=null;}
 async access(){if(this.token&&this.expires>Date.now())return this.token;
 const c=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON||'null');if(!c?.project_id||!c.client_email||!c.private_key)throw Error('Firebase server credentials are not configured');
 this.project=c.project_id;const enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url'),now=Math.floor(Date.now()/1000),unsigned=enc({alg:'RS256',typ:'JWT'})+'.'+enc({iss:c.client_email,scope:'https://www.googleapis.com/auth/datastore',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
 const sign=createSign('RSA-SHA256');sign.update(unsigned);const jwt=unsigned+'.'+sign.sign(c.private_key,'base64url');
 const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:jwt}),signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Firebase authentication failed ('+r.status+')');
 const data=await r.json();this.token=data.access_token;this.expires=Date.now()+3000000;return this.token;
 }
 async request(path,options={}){const token=await this.access();const r=await fetch('https://firestore.googleapis.com/v1/projects/'+encodeURIComponent(this.project)+'/databases/(default)/documents/aiLearning/'+path,{...options,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},signal:AbortSignal.timeout(15000)});if(r.status===404)return null;if(!r.ok)throw Error('Firebase request failed ('+r.status+')');return r.json();}
 async load(version='current'){if(!/^(current|v[\w-]{1,80})$/.test(version))throw Error('Invalid version');const d=await this.request(version);if(!d)return null;const p=JSON.parse(d.fields.policy.stringValue);return p.resetEpoch===AI_TRAINING_RESET_EPOCH?validatePolicy(p):null;}
 async save(p){const stored=structuredClone(p);stored.resetEpoch=AI_TRAINING_RESET_EPOCH;validatePolicy(stored);const body=JSON.stringify({fields:{policy:{stringValue:JSON.stringify(stored)},savedAt:{timestampValue:new Date().toISOString()}}});const version='v'+stored.generation+'-'+Date.now()+'-'+randomUUID();await this.request(version,{method:'PATCH',body});await this.request('current',{method:'PATCH',body});return version;}
 async purgeAll(){const token=await this.access(),base='https://firestore.googleapis.com/v1/projects/'+encodeURIComponent(this.project)+'/databases/(default)/documents/aiLearning';while(true){const r=await fetch(base+'?pageSize=100',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('AI reset listing failed ('+r.status+')');const d=await r.json(),ids=(d.documents||[]).map(x=>x.name.split('/').at(-1));if(!ids.length)break;for(let i=0;i<ids.length;i+=20)await Promise.all(ids.slice(i,i+20).map(id=>this.request(id,{method:'DELETE'})));}}
 async ensureResetEpoch(seed){const d=await this.request('current');if(d){const p=JSON.parse(d.fields.policy.stringValue);if(p.resetEpoch===AI_TRAINING_RESET_EPOCH)return validatePolicy(p);}await this.purgeAll();const fresh=structuredClone(seed);fresh.resetEpoch=AI_TRAINING_RESET_EPOCH;await this.save(fresh);return fresh;}
 async versions(){const token=await this.access();const r=await fetch('https://firestore.googleapis.com/v1/projects/'+encodeURIComponent(this.project)+'/databases/(default)/documents/aiLearning?pageSize=100&orderBy=savedAt%20desc',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Version listing failed');const d=await r.json();return (d.documents||[]).map(x=>{const p=JSON.parse(x.fields.policy.stringValue);return {id:x.name.split('/').at(-1),savedAt:x.fields.savedAt.timestampValue,matches:p.matches,generation:p.generation,evaluation:p.evaluation,resetEpoch:p.resetEpoch||''}}).filter(x=>x.resetEpoch===AI_TRAINING_RESET_EPOCH);}
}
