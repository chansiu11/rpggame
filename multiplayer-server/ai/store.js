import {createSign,randomUUID} from 'node:crypto';
export function validatePolicy(p){
 if(p?.schema!==1||!Number.isSafeInteger(p.matches)||p.matches<0||!Number.isSafeInteger(p.generation)||p.generation<0)throw Error('Invalid policy');
 for(const id of ['gale','void','dawn']){const s=p.styles?.[id];if(!s||s.weights?.length!==3||s.weights.some(v=>!Number.isFinite(v)||v<.2||v>5)||!Number.isFinite(s.games)||!Number.isFinite(s.wins)||!Number.isFinite(s.reward)||!s.metrics)throw Error('Invalid style policy');}
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
 async load(version='current'){if(!/^(current|v[\w-]{1,80})$/.test(version))throw Error('Invalid version');const d=await this.request(version);return d?validatePolicy(JSON.parse(d.fields.policy.stringValue)):null;}
 async save(p){validatePolicy(p);const body=JSON.stringify({fields:{policy:{stringValue:JSON.stringify(p)},savedAt:{timestampValue:new Date().toISOString()}}});const version='v'+p.generation+'-'+Date.now()+'-'+randomUUID();await this.request(version,{method:'PATCH',body});await this.request('current',{method:'PATCH',body});return version;}
 async versions(){const token=await this.access();const r=await fetch('https://firestore.googleapis.com/v1/projects/'+encodeURIComponent(this.project)+'/databases/(default)/documents/aiLearning?pageSize=100&orderBy=savedAt%20desc',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Version listing failed');const d=await r.json();return (d.documents||[]).map(x=>{const p=JSON.parse(x.fields.policy.stringValue);return {id:x.name.split('/').at(-1),savedAt:x.fields.savedAt.timestampValue,matches:p.matches,generation:p.generation,evaluation:p.evaluation}});}
}
