const config = window.ECHOES_FIREBASE_CONFIG;

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
  return err?.message || '서버 연결 중 오류가 발생했습니다.';
}
window.EchoesCloud={
  enabled:false,
  ready:Promise.resolve(false),
  register:async()=>{throw new Error('Firebase가 설정되지 않았습니다.');},
  login:async()=>{throw new Error('Firebase가 설정되지 않았습니다.');},
  logout:async()=>{},
  save:async()=>{},
  load:async()=>null,
  hasSave:async()=>false,
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

    async function profile(uid){
      const snap=await storeMod.getDoc(storeMod.doc(db,'users',uid));
      return snap.exists()?snap.data():null;
    }

    window.EchoesCloud={
      enabled:true,
      ready:Promise.resolve(true),
      message:friendlyMessage,
      async register(username,password){
        const displayName=String(username||'').trim();
        const userKey=normalizeUser(displayName);
        const cred=await authMod.createUserWithEmailAndPassword(auth,authEmail(userKey),password);
        await storeMod.setDoc(storeMod.doc(db,'users',cred.user.uid),{
          username:userKey,displayName,
          createdAt:storeMod.serverTimestamp(),
          lastLogin:storeMod.serverTimestamp()
        },{merge:true});
        return {uid:cred.user.uid,username:userKey,displayName};
      },
      async login(username,password){
        const userKey=normalizeUser(username);
        const cred=await authMod.signInWithEmailAndPassword(auth,authEmail(userKey),password);
        const p=await profile(cred.user.uid);
        await storeMod.setDoc(storeMod.doc(db,'users',cred.user.uid),{
          username:userKey,
          displayName:p?.displayName||username,
          lastLogin:storeMod.serverTimestamp()
        },{merge:true});
        return {uid:cred.user.uid,username:userKey,displayName:p?.displayName||username};
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
      }
    };
  }catch(err){
    console.error('Firebase 초기화 실패:',err);
    window.EchoesCloud.enabled=false;
  }
}
