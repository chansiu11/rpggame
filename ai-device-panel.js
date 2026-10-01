(()=>{
'use strict';
let opened=false,authenticated=false,password='',session='',latest=null,saveQueue=Promise.resolve(),savedMatches=0,autoResume=false,reconnectAuth=false,wantedRunning=false,cloud=null,heartbeat=null,connecting=false,closing=false,stopAck=null,replaced=false,watchRequested=false,preparedTraining=null,preparedTrainingPending=false;
const panel=document.createElement('dialog');panel.id='aiDevicePanel';panel.innerHTML=`<form id="aiDeviceLogin"><h2>AI 훈련 관리자</h2><p>관리자 암호를 입력하면 훈련 전용 계정으로 전환합니다. 종료 시 자동 로그아웃됩니다.</p><input id="aiDevicePassword" type="password" autocomplete="off" required aria-label="관리자 암호"><button>접속</button><button type="button" id="aiDeviceClose">닫기</button></form><section id="aiDeviceControls" hidden><h2>기기 연결 훈련</h2><p>이 화면을 열어 두세요. 다른 플레이어가 접속하면 훈련을 쉽니다.<br>25전 또는 5분마다 Firebase 저장 · 기기 절전/브라우저 종료 시 중지</p><p><b>신경망 학습:</b> 쉴드·패링 타이밍 · 거리 조절 · 스킬 선택 · 콤보 연결 · 공격 중단 · 상대 패턴 예측 · 페이크/심리전 · 전체 전략 · 공격 방향/진입각 · 빈틈 처벌 타이밍<br><b>고정 코드:</b> 회피 이동/대쉬 · <b>학습 제외:</b> 지구력/마나 자원 관리</p><div><button data-ai="Start">훈련 시작</button><button data-ai="Stop">중지·저장</button><button data-ai="Save">지금 저장</button><button data-ai="Versions">이전 기록</button><button data-ai="Watch" id="aiWatchButton" aria-pressed="false">대전 관전 켜기</button><button data-ai="Close">종료</button></div><div id="aiTrainingTuning"><label>다음 훈련까지 대기 <input id="aiRetrainDelay" type="number" min="0" max="60000" step="100" value="1000"> ms</label><label>한 번에 연속 훈련 (동시 최대 4) <input id="aiMatchesPerBurst" type="number" min="1" max="100" step="1" value="3"> 회</label><button data-ai="Apply">설정 적용</button></div><p id="aiDeviceStats"></p><pre id="aiDeviceStyles"></pre><div id="aiDeviceVersions"></div><div id="aiSpectator" hidden></div></section><p id="aiDeviceMessage" role="status"></p>`;
const style=document.createElement('style');style.textContent='#aiDevicePanel{max-width:1400px;width:96vw;max-height:90vh;overflow:auto;background:#13272f;color:#e1eadc;border:1px solid #a5b784;border-radius:12px;padding:24px;z-index:200}#aiDevicePanel::backdrop{background:#000b}#aiDevicePanel input{padding:12px;color:#fff;background:#0b1c24;border:1px solid #789;border-radius:5px}#aiDevicePanel button{margin:5px}#aiTrainingTuning{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:12px 0;padding:10px;border:1px solid #45616b;border-radius:8px}#aiTrainingTuning label{display:flex;align-items:center;gap:6px}#aiTrainingTuning input{width:92px;margin:0;padding:8px}#aiDevicePanel pre{white-space:pre-wrap;font:14px/1.9 system-ui}#aiDeviceMessage{color:#e5c98d;line-height:1.7}';document.head.appendChild(style);document.body.appendChild(panel);
const $=id=>document.getElementById(id),m=window.EchoesMulti;
const tell=text=>$('aiDeviceMessage').textContent=text,viewer=window.EchoesAiTrainingViewer;viewer?.init($('aiSpectator'));
function showWatch(on){viewer?.show(on);$('aiWatchButton').textContent=on?'대전 관전 끄기':'대전 관전 켜기';$('aiWatchButton').setAttribute?.('aria-pressed',String(on));}
const key=()=> 'echoes-ai-checkpoint-v5-neural-seed-20260930:'+cloud.currentTrainingUid();
function localRead(){try{return JSON.parse(localStorage.getItem(key())||'null')}catch{return null}}
function localWrite(c){try{localStorage.setItem(key(),JSON.stringify(c))}catch{}}
function purgeLegacyLocalTraining(){try{const doomed=[];for(let i=0;i<(localStorage.length||0);i++){const k=localStorage.key?.(i);if(k&&k.startsWith('echoes-ai-checkpoint-')&&!k.startsWith('echoes-ai-checkpoint-v5-neural-seed-20260930:'))doomed.push(k);}for(const k of doomed)localStorage.removeItem?.(k);}catch{}}
function send(type,data={}){return m.training(type,data)}
const fmt=n=>Number(n||0).toLocaleString('ko-KR');
const tuningKey='echoes-ai-training-tuning-v1';
function readTuning(){try{const v=JSON.parse(localStorage.getItem(tuningKey)||'null');return {retrainDelayMs:Number.isInteger(v?.retrainDelayMs)?v.retrainDelayMs:1000,matchesPerBurst:Number.isInteger(v?.matchesPerBurst)?v.matchesPerBurst:3}}catch{return {retrainDelayMs:1000,matchesPerBurst:3}}}
function tuningPayload(){
 const retrainDelayMs=Math.max(0,Math.min(60000,Math.round(Number($('aiRetrainDelay').value)||0)));
 const matchesPerBurst=Math.max(1,Math.min(100,Math.round(Number($('aiMatchesPerBurst').value)||1)));
 $('aiRetrainDelay').value=String(retrainDelayMs);$('aiMatchesPerBurst').value=String(matchesPerBurst);
 return {retrainDelayMs,matchesPerBurst};
}
function loadTuningUi(){const v=readTuning();$('aiRetrainDelay').value=String(v.retrainDelayMs);$('aiMatchesPerBurst').value=String(v.matchesPerBurst);}
function persistTuning(v){try{localStorage.setItem(tuningKey,JSON.stringify(v))}catch{}}
loadTuningUi();
function show(){if(opened||document.getElementById('title')?.classList.contains('hidden'))return;opened=true;panel.showModal();$('aiDevicePassword').focus();tell('');}
const titleTrainingButton=document.getElementById('aiTrainingAdminBtn');if(titleTrainingButton)titleTrainingButton.addEventListener('click',show);
async function close(){
 if(closing||connecting)return;closing=true;autoResume=false;wantedRunning=false;
 try{
 if(authenticated){
 tell('훈련을 중지하고 저장한 뒤 로그아웃합니다…');
 await new Promise(resolve=>{const timer=setTimeout(()=>{stopAck=null;resolve();},3000);stopAck=()=>{clearTimeout(timer);stopAck=null;resolve();};send('Stop');});
 await saveQueue;if(latest){try{await cloud.saveTraining(latest);}catch(e){localWrite(latest);tell('Firebase 저장 실패 · 기기에 복구 기록을 남겼습니다. 다시 종료하면 저장을 재시도합니다.');return;}}
 }
 send('Leave');m?.disconnect();clearInterval(heartbeat);heartbeat=null;
 await cloud?.logoutTraining?.();opened=false;authenticated=false;password='';latest=null;session='';savedMatches=0;reconnectAuth=false;watchRequested=false;showWatch(false);
 $('aiDevicePassword').value='';$('aiDeviceControls').hidden=true;$('aiDeviceLogin').hidden=false;panel.close();
 }finally{closing=false;}
}
window.addEventListener('keydown',e=>{if(e.ctrlKey&&e.shiftKey&&e.code==='F9'){e.preventDefault();show();}},true);
panel.addEventListener('cancel',e=>{e.preventDefault();close()});$('aiDeviceClose').onclick=close;
$('aiDeviceLogin').onsubmit=async e=>{
 e.preventDefault();if(connecting||closing)return;replaced=false;connecting=true;
 try{
 if(typeof window.waitForCloudAuth==='function')await window.waitForCloudAuth();
 cloud=window.EchoesCloud;await cloud?.ready;cloud=window.EchoesCloud;
 if(!cloud?.loginTraining)throw Error('훈련 로그인 모듈을 불러오지 못했습니다. 새로고침해 주세요.');
 password=$('aiDevicePassword').value;if(!password)throw Error('관리자 암호를 입력하세요.');
 tell('훈련 전용 계정에 로그인하고 있습니다…');
 await cloud.loginTraining(password);window.EchoesTrainingAccount?.clearGameSession();
 tell('기존 AI 딥러닝 기록을 초기화 확인 중…');purgeLegacyLocalTraining();
 preparedTraining=await cloud.loadTraining();preparedTrainingPending=true;
 if(m.connected)m.disconnect();await m.connect({name:'AI Training',accountId:'ai-training:'+cloud.currentTrainingUid(),level:1,weapon:0,mode:'pvp'});
 if(m.state.deviceTrainingProtocol!==3)throw Error('서버에 새 훈련 기능이 아직 배포되지 않았습니다.');send('Auth',{password,manualLogin:true});
 }catch(e){await cloud?.logoutTraining?.();password='';m?.disconnect();tell(cloud?.message?.(e)||e.message);}finally{connecting=false;}
};
m?.on('ai:trainAuth',async msg=>{if(!opened||replaced)return;if(!msg.ok){password='';autoResume=false;wantedRunning=false;reconnectAuth=false;await cloud?.logoutTraining?.();m?.disconnect();tell(msg.message);return;}authenticated=true;session=msg.session;$('aiDevicePassword').value='';$('aiDeviceLogin').hidden=true;$('aiDeviceControls').hidden=false;clearInterval(heartbeat);heartbeat=setInterval(()=>{if(opened&&authenticated)send('Beat')},10000);send('Beat');send('Config',tuningPayload());if(watchRequested)send('Watch',{enabled:true});tell('관리자 인증 완료 · 저장 기록 확인 중…');
 if(preparedTrainingPending){try{const local=localRead(),remote=preparedTraining,chosen=local&&(!remote||local.policy.matches>remote.policy.matches||local.policy.matches===remote.policy.matches&&local.policy.generation>remote.policy.generation)?local:remote;preparedTrainingPending=false;preparedTraining=null;send('Load',{checkpoint:chosen||null});tell(chosen?'새 초기화 세대의 저장 기록을 불러왔습니다.':'AI 딥러닝 데이터 초기화 완료 · 0전부터 시작합니다.');}catch(e){preparedTrainingPending=false;preparedTraining=null;tell('AI 초기화 확인 실패: '+e.message);autoResume=false;}}
 else if(!msg.loaded){try{const remote=await cloud.loadTraining(),local=localRead();const chosen=local&&(!remote||local.policy.matches>remote.policy.matches||local.policy.matches===remote.policy.matches&&local.policy.generation>remote.policy.generation)?local:remote;send('Load',{checkpoint:chosen||null});}catch(e){tell('Firebase 불러오기 실패: '+e.message);autoResume=false;}}
});
m?.on('ai:trainCheckpoint',msg=>{if(!authenticated||msg.session!==session)return;latest=msg.checkpoint;localWrite(latest);$('aiDeviceStyles').textContent=Object.entries(latest.policy.styles).map(([id,s])=>{const params=(s.network?.w1?.length||0)+(s.network?.b1?.length||0)+(s.network?.w2?.length||0)+(s.network?.b2?.length||0)+(s.network?.w3?.length||0)+(s.network?.b3?.length||0);const name=({gale:'질풍',moon:'월식(흑월)',void:'이형',dawn:'여명',break:'홍련'}[id]||id);return name+' · '+fmt(s.games)+'전 · '+fmt(s.wins)+'승 · 신경망 '+fmt(params)+'개 · 평균보상 '+Number(s.rewardMean||0).toFixed(3)}).join('\n');if(!msg.save)return;
 const c=structuredClone(msg.checkpoint),rev=msg.revision,sid=msg.session;
 saveQueue=saveQueue.then(async()=>{try{await cloud.saveTraining(c);savedMatches=c.policy.matches;if(authenticated&&session===sid){send('Saved',{session:sid,revision:rev,matches:savedMatches});tell('Firebase 저장 완료 · '+savedMatches+'전');if(autoResume){autoResume=false;send('Start');}}}catch(e){autoResume=false;send('SaveFailed');tell('저장 실패 · 자동으로 다시 시도합니다: '+e.message);}});
});
m?.on('ai:trainStatus',s=>{if(!authenticated||replaced)return;if(!s.running&&!s.pendingStart)stopAck?.();$('aiDeviceStats').textContent=`${s.pendingStart?'Firebase 저장 확인 중 · 완료 후 자동 시작':s.running?s.paused==='players'?'플레이어 접속 중 · 훈련 휴식':'자동 훈련 중':'훈련 중지'} · 총 훈련 ${fmt(s.matches)}전 · ${fmt(s.generation)}세대 · 현재 배치 ${fmt(s.batchCompleted)}/${fmt(s.batchSize)} · Firebase 저장 ${fmt(savedMatches)}전 · 재훈련 대기 ${fmt(s.settings?.retrainDelayMs)}ms · 한 번에 ${fmt(s.settings?.matchesPerBurst)}전 · 실제 동시 ${fmt(s.parallelBattles||Math.min(4,s.settings?.matchesPerBurst||1))}전${s.lastPair?' · 최근 '+s.lastPair.map(id=>({gale:'질풍',moon:'월식(흑월)',void:'이형',dawn:'여명',break:'홍련'}[id]||id)).join(' vs '):''}${s.nextPair?' · 다음 '+s.nextPair.map(id=>({gale:'질풍',moon:'월식(흑월)',void:'이형',dawn:'여명',break:'홍련'}[id]||id)).join(' vs '):''}`;if(s.error)tell(s.error);});
m?.on('ai:trainWatchStatus',msg=>{if(authenticated&&msg.session===session)showWatch(msg.enabled===true);});
m?.on('ai:trainPreview',msg=>{if(opened&&authenticated&&!replaced&&watchRequested&&msg.session===session)viewer?.frame(msg.preview);});
m?.on('ai:trainTakeoverPending',s=>{if(opened&&!replaced)tell(s.message||'기존 기기의 최신 학습 기록을 저장하고 있습니다.');});
m?.on('ai:trainTakeoverNotice',s=>{if(opened&&!replaced)tell(s.message);});
m?.on('ai:trainReplaced',async msg=>{
 if(!opened||replaced||closing)return;
 replaced=true;wantedRunning=false;autoResume=false;reconnectAuth=false;watchRequested=false;showWatch(false);password='';authenticated=false;
 clearInterval(heartbeat);heartbeat=null;
 tell('다른 기기에서 관리자로 로그인했습니다. 학습 기록을 저장한 뒤 자동 로그아웃합니다.');
 const checkpoint=msg.checkpoint||latest;
 if(checkpoint&&cloud?.currentTrainingUid?.()){latest=checkpoint;localWrite(checkpoint);}
 let saved=false;
 try{
  await saveQueue;
  if(checkpoint)await cloud.saveTraining(checkpoint);
  saved=true;
 }catch(e){
  tell('다른 기기에서 로그인하여 로그아웃합니다. Firebase 저장 실패: 서버의 최신 체크포인트를 새 기기로 전달합니다.');
 }
 try{send(saved?'HandoffSaved':'HandoffFailed',{session:msg.session,revision:msg.revision});}catch{}
 try{m?.disconnect();}catch{}
 try{await cloud?.logoutTraining?.();}catch{}
 session='';latest=null;savedMatches=0;
 $('aiDevicePassword').value='';$('aiDeviceControls').hidden=true;$('aiDeviceLogin').hidden=false;
 tell(saved?'다른 기기에서 관리자로 로그인하여 자동 로그아웃됐습니다. Firebase 학습 기록은 저장했습니다.':'다른 기기에서 로그인하여 자동 로그아웃됐습니다. 서버의 체크포인트를 새 기기에서 다시 저장할 수 있습니다.');
 replaced=false;
});
m?.on('ai:trainError',s=>{if(!replaced)tell(s.message);});
m?.on('connection',s=>{if(opened&&authenticated&&!closing&&!replaced&&!s.connected){reconnectAuth=true;authenticated=false;autoResume=wantedRunning;tell('연결 끊김 · 서버 훈련이 중지되며 재연결 후 저장 기록으로 재개합니다.');}});
m?.on('reconnected',()=>{if(opened&&!closing&&!replaced&&(reconnectAuth||password)){autoResume=wantedRunning;reconnectAuth=false;send('Auth',{password})}});
panel.onclick=async e=>{const action=e.target.dataset.ai;if(!action)return;if(action==='Close'){close();return;}if(closing||connecting||replaced)return;try{if(action==='Watch'){watchRequested=!watchRequested;showWatch(watchRequested);send('Watch',{enabled:watchRequested});return;}if(action==='Apply'){const v=tuningPayload();persistTuning(v);send('Config',v);tell(`설정 적용 · 다음 훈련까지 ${v.retrainDelayMs}ms · 한 번에 ${v.matchesPerBurst}전`);return;}if(action==='Versions'){const versions=await cloud.trainingVersions();$('aiDeviceVersions').replaceChildren();for(const v of versions){const button=document.createElement('button');button.textContent=`${v.matches}전 · ${v.generation}세대 복원`;button.onclick=async()=>{try{send('Stop');const c=await cloud.loadTrainingVersion(v.id);send('Load',{checkpoint:c});}catch(e){tell(e.message)}};$('aiDeviceVersions').appendChild(button)}return;}if(action==='Start'){wantedRunning=true;const v=tuningPayload();persistTuning(v);send('Config',v);if(!watchRequested){watchRequested=true;showWatch(true);send('Watch',{enabled:true});}}if(action==='Stop'){wantedRunning=false;autoResume=false;}send(action);}catch(e){tell(e.message)}};
window.addEventListener('beforeunload',()=>{if(authenticated&&!replaced){send('Stop');send('Leave')}cloud?.logoutTraining?.();});
})();
