const config = window.ECHOES_FIREBASE_CONFIG;
const TRAINING_ACCOUNT='gkrtmqrhksflwk';
const AI_TRAINING_RESET_EPOCH='2026-09-30-ai-neural-reset-3';

function normalizeUser(v){
  return String(v || '').trim().toLowerCase();
}
function authEmail(username){
  const safe = Array.from(normalizeUser(username)).map(ch => {
    if (/^[a-z0-9._-]$/i.test(ch)) return ch;
    return 'u' + ch.codePointAt(0).toString(16);
  }).join('').slice(0,48) || 'player';
  return `${safe}@users.rpggame.example.com`;
}
function friendlyMessage(err){
  const code = String(err?.code || '');
  if(code.includes('email-already-in-use')) return '이미 사용 중인 아이디입니다.';
  if(code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return '아이디 또는 비밀번호를 확인하세요.';
  if(code.includes('weak-password')) return '비밀번호를 6자 이상 입력하세요.';
  if(code.includes('too-many-requests')) return '로그인 시도가 너무 많습니다. 잠시 뒤 다시 시도하세요.';
  if(code.includes('network-request-failed')) return '네트워크 연결을 확인하세요.';
  if(code.includes('permission-denied')) return '서버 저장 권한 설정을 확인하세요.';
  if(code.includes('operation-not-allowed')) return 'Firebase에서 이메일/비밀번호 로그인을 활성화해야 합니다.';
  if(code.includes('unauthorized-domain')) return '현재 사이트 주소가 Firebase 허용 도메인에 등록되지 않았습니다.';
  if(code.includes('invalid-api-key')) return 'Firebase 설정의 API 키를 확인하세요.';
  return err?.message || '서버 연결 중 오류가 발생했습니다.';
}
let resolveCloudReady;
const cloudReady=new Promise(resolve=>{resolveCloudReady=resolve;});
window.EchoesCloud={
  enabled:false,
  ready:cloudReady,
  register:async()=>{throw new Error('Firebase가 아직 준비되지 않았습니다.');},
  login:async()=>{throw new Error('Firebase가 설정되지 않았습니다.');},
  logout:async()=>{},
  save:async()=>{},
  load:async()=>null,
  hasSave:async()=>false,
  clearSave:async()=>false,
  currentUid:()=>null,
  message:friendlyMessage
};

if(config && config.apiKey && config.authDomain && config.projectId && config.appId){
  try{
    const [appMod,authMod,storeMod]=await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js')
    ]);
    const app=appMod.initializeApp(config);
    const auth=authMod.getAuth(app);
    const db=storeMod.getFirestore(app);
    await authMod.setPersistence(auth,authMod.browserLocalPersistence);
    await new Promise(resolve=>{
      let done=false;
      const finish=()=>{if(done)return;done=true;try{unsub?.();}catch(e){}resolve();};
      let unsub=authMod.onAuthStateChanged(auth,finish,finish);
      setTimeout(finish,2500);
    });

    // Training credentials and session stay in memory in a separate Auth instance.
    const trainingApp=appMod.initializeApp(config,'ai-training');
    const trainingAuth=authMod.getAuth(trainingApp);
    const trainingDb=storeMod.getFirestore(trainingApp);
    await authMod.setPersistence(trainingAuth,authMod.inMemoryPersistence);
    if(auth.currentUser?.email===authEmail(TRAINING_ACCOUNT))await authMod.signOut(auth);

    async function purgeTrainingHistory(uid){
      try{await storeMod.deleteDoc(storeMod.doc(trainingDb,'users',uid,'aiTraining','main'));}catch(e){}
      while(true){
        const snaps=await storeMod.getDocs(storeMod.query(storeMod.collection(trainingDb,'users',uid,'aiTrainingVersions'),storeMod.limit(400)));
        if(snaps.empty)break;
        const batch=storeMod.writeBatch(trainingDb);for(const d of snaps.docs)batch.delete(d.ref);await batch.commit();
        if(snaps.size<400)break;
      }
    }

    async function profile(uid){
      const snap=await storeMod.getDoc(storeMod.doc(db,'users',uid));
      return snap.exists()?snap.data():null;
    }

    window.EchoesCloud={
      enabled:true,
      ready:cloudReady,
      message:friendlyMessage,
      currentUid:()=>auth.currentUser?.uid||null,
      currentTrainingUid:()=>trainingAuth.currentUser?.uid||null,
      async loginTraining(password){
        const cred=await authMod.signInWithEmailAndPassword(trainingAuth,authEmail(TRAINING_ACCOUNT),password);
        try{await authMod.signOut(auth);}catch(e){await authMod.signOut(trainingAuth);throw e;}
        return {uid:cred.user.uid,username:TRAINING_ACCOUNT};
      },
      async logoutTraining(){await authMod.signOut(trainingAuth);},
      async saveTraining(checkpoint){
        const u=trainingAuth.currentUser;if(!u)throw new Error('게임 계정 로그인이 필요합니다.');
        if(!checkpoint||checkpoint.schema!==1)throw new Error('학습 기록 형식 오류');
        const stamped=structuredClone(checkpoint);stamped.resetEpoch=AI_TRAINING_RESET_EPOCH;
        const batch=storeMod.writeBatch(trainingDb),value={checkpoint:stamped,updatedAt:storeMod.serverTimestamp()};batch.set(storeMod.doc(trainingDb,'users',u.uid,'aiTraining','main'),value);batch.set(storeMod.doc(trainingDb,'users',u.uid,'aiTrainingVersions','v-'+Date.now()+'-'+crypto.randomUUID()),value);await batch.commit();return true;
      },
      async trainingVersions(){
        const u=trainingAuth.currentUser;if(!u)throw new Error('로그인이 필요합니다.');
        const snaps=await storeMod.getDocs(storeMod.query(storeMod.collection(trainingDb,'users',u.uid,'aiTrainingVersions'),storeMod.orderBy('updatedAt','desc'),storeMod.limit(40)));
        return snaps.docs.filter(d=>d.data()?.checkpoint?.resetEpoch===AI_TRAINING_RESET_EPOCH).slice(0,20).map(d=>({id:d.id,matches:d.data().checkpoint.policy.matches,generation:d.data().checkpoint.policy.generation}));
      },
      async loadTrainingVersion(id){
        const u=trainingAuth.currentUser;if(!u||!/^v-[a-zA-Z0-9-]+$/.test(id))throw new Error('잘못된 기록입니다.');
        const snap=await storeMod.getDoc(storeMod.doc(trainingDb,'users',u.uid,'aiTrainingVersions',id));if(!snap.exists())throw new Error('기록이 없습니다.');
        const checkpoint=snap.data().checkpoint;if(checkpoint?.resetEpoch!==AI_TRAINING_RESET_EPOCH)throw new Error('AI 훈련 초기화 이전 기록은 사용할 수 없습니다.');return checkpoint;
      },
      async loadTraining(){
        const u=trainingAuth.currentUser;if(!u)throw new Error('게임 계정 로그인이 필요합니다.');
        const snap=await storeMod.getDoc(storeMod.doc(trainingDb,'users',u.uid,'aiTraining','main'));
        if(!snap.exists())return null;
        const checkpoint=snap.data().checkpoint;
        if(checkpoint?.resetEpoch!==AI_TRAINING_RESET_EPOCH){await purgeTrainingHistory(u.uid);return null;}
        return checkpoint;
      },
      async register(username,password){
        const displayName=String(username||'').trim();
        const userKey=normalizeUser(displayName);
        if(userKey===TRAINING_ACCOUNT)throw new Error('훈련 전용 계정입니다. 첫 화면에서 Ctrl + Shift + F9로 접속하세요.');
        const cred=await authMod.createUserWithEmailAndPassword(auth,authEmail(userKey),password);
        let profileSynced=true;
        try{
          await storeMod.setDoc(storeMod.doc(db,'users',cred.user.uid),{
            username:userKey,displayName,
            createdAt:storeMod.serverTimestamp(),
            lastLogin:storeMod.serverTimestamp()
          },{merge:true});
        }catch(err){
          profileSynced=false;
          console.warn('Firebase 계정은 생성됐지만 프로필 저장이 지연됩니다:',err);
        }
        return {uid:cred.user.uid,username:userKey,displayName,profileSynced};
      },
      async login(username,password){
        const userKey=normalizeUser(username);
        if(userKey===TRAINING_ACCOUNT)throw new Error('훈련 전용 계정입니다. 첫 화면에서 Ctrl + Shift + F9로 접속하세요.');
        const cred=await authMod.signInWithEmailAndPassword(auth,authEmail(userKey),password);
        let p=null;
        try{p=await profile(cred.user.uid);}catch(err){console.warn('프로필 불러오기 지연:',err);}
        const displayName=p?.displayName||username;
        try{
          await storeMod.setDoc(storeMod.doc(db,'users',cred.user.uid),{
            username:userKey,displayName,lastLogin:storeMod.serverTimestamp()
          },{merge:true});
        }catch(err){console.warn('최근 로그인 기록 저장 지연:',err);}
        return {uid:cred.user.uid,username:userKey,displayName};
      },
      async logout(){await authMod.signOut(auth);},
      async save(data){
        const u=auth.currentUser;
        if(!u) throw new Error('로그인이 필요합니다.');
        await storeMod.setDoc(storeMod.doc(db,'users',u.uid,'saves','main'),{
          data,updatedAt:storeMod.serverTimestamp()
        },{merge:true});
        return true;
      },
      async load(){
        const u=auth.currentUser;
        if(!u) return null;
        const snap=await storeMod.getDoc(storeMod.doc(db,'users',u.uid,'saves','main'));
        return snap.exists()?snap.data()?.data||null:null;
      },
      async hasSave(){
        const u=auth.currentUser;
        if(!u) return false;
        const snap=await storeMod.getDoc(storeMod.doc(db,'users',u.uid,'saves','main'));
        return snap.exists();
      },
      async clearSave(){
        const u=auth.currentUser;
        if(!u) return false;
        await storeMod.deleteDoc(storeMod.doc(db,'users',u.uid,'saves','main'));
        return true;
      }
    };
    resolveCloudReady(true);
  }catch(err){
    console.error('Firebase 초기화 실패:',err);
    window.EchoesCloud.enabled=false;
    resolveCloudReady(false);
  }
}else{
  resolveCloudReady(false);
}

