(()=>{
'use strict';
const listeners=new Map();
// Shared world/PVP sound system. All sounds are synthesized locally, so no media downloads or network packets are needed.
const gameAudio=(()=>{
  const Audio=window.AudioContext||window.webkitAudioContext;
  let ctx=null, last=new Map(), previous=new Map(), uiReady=false;
  const now=()=>performance.now();
  function unlock(){if(!Audio)return;try{ctx ||= new Audio();if(ctx.state==='suspended')ctx.resume().catch(()=>{});}catch{}}
  function tone(f,d=.09,type='sine',gain=.045,shift=0,pan=0){
    if(!ctx||ctx.state!=='running')return;
    const t=ctx.currentTime, o=ctx.createOscillator(), g=ctx.createGain();
    o.type=type;o.frequency.setValueAtTime(Math.max(30,f),t);o.frequency.exponentialRampToValueAtTime(Math.max(30,f+shift),t+d);
    g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.0002,gain),t+.008);
    g.gain.exponentialRampToValueAtTime(.0001,t+d);
    if(ctx.createStereoPanner){const p=ctx.createStereoPanner();p.pan.value=Math.max(-1,Math.min(1,pan));o.connect(g).connect(p).connect(ctx.destination);}
    else o.connect(g).connect(ctx.destination);
    o.start(t);o.stop(t+d+.015);
  }
  function sound(kind,opt={}){
    if(!ctx||ctx.state!=='running')return;
    const limit={hit:65,attack:90,skill:150,remoteAttack:120,remoteSkill:160,step:290,click:55}[kind]||100;
    const key=kind+':'+(opt.id||'');
    if(now()-(last.get(key)||0)<limit)return;
    last.set(key,now());
    const pan=Number.isFinite(opt.pan)?opt.pan:0, slot=Number(opt.slot)||0;
    const style=String(opt.id||'').toLowerCase();
    let base=style.includes('thunder')||style.includes('gale')?480:style.includes('void')?185:style.includes('dawn')?720:style.includes('hong')||style.includes('flame')?310:style.includes('prism')?840:380;
    base+=slot*45;
    switch(kind){
      case 'click':tone(680,.045,'sine',.022,-190);break;
      case 'confirm':tone(520,.11,'sine',.035,340);break;
      case 'error':tone(180,.17,'triangle',.035,-55);break;
      case 'attack':case 'remoteAttack':tone(240,.075,'sawtooth',kind==='attack'?.033:.018,-145,pan);break;
      case 'hit':tone(115,.12,'triangle',.055,-60,pan);tone(750,.035,'square',.012,-420,pan);break;
      case 'shield':tone(610,.13,'triangle',.035,-190,pan);break;
      case 'parry':tone(1050,.18,'sine',.05,380,pan);break;
      case 'dash':tone(360,.16,'sawtooth',.025,-270,pan);break;
      case 'death':tone(340,.45,'triangle',.06,-290,pan);break;
      case 'victory':for(let i=0;i<3;i++)setTimeout(()=>tone([523,659,784][i],.24,'sine',.045,85,pan),i*125);break;
      case 'skill':case 'remoteSkill':
        tone(base,.22,style.includes('void')?'sine':'sawtooth',kind==='skill'?.043:.023,base*(slot===5?-.65:.45),pan);
        if(slot===5) setTimeout(()=>tone(base*.65,.31,'triangle',.055,base*.8,pan),95);
        break;
      case 'pickup':tone(760,.08,'sine',.025,280);break;
      case 'heal':tone(480,.18,'sine',.032,220);break;
      case 'step':tone(95,.035,'triangle',.008,-20,pan);break;
    }
  }
  function watch(id,p,remote=false){
    if(!p||typeof p!=='object')return;
    const old=previous.get(id)||{}, pan=remote&&Number.isFinite(p.x)&&Number.isFinite(window.EchoesMulti?.state?.profile?.x)
      ?Math.max(-.8,Math.min(.8,(p.x-window.EchoesMulti.state.profile.x)/700)):0;
    if(p.skillFxSeq&&p.skillFxSeq!==old.skillFxSeq)sound(remote?'remoteSkill':'skill',{id:p.skillFxId||p.skillId,slot:p.skillFxSlot,pan});
    else if(p.attackAnim&&p.attackAnim!==old.attackAnim)sound(remote?'remoteAttack':'attack',{pan});
    if(p.deathSeq&&p.deathSeq!==old.deathSeq)sound('death',{pan});
    if(p.parry&&!old.parry)sound('parry',{pan});
    if(p.dodge&&!old.dodge)sound('dash',{pan});
    if(p.shield&&!old.shield)sound('shield',{pan});
    previous.set(id,{skillFxSeq:p.skillFxSeq,attackAnim:p.attackAnim,deathSeq:p.deathSeq,parry:p.parry,dodge:p.dodge,shield:p.shield});
    if(previous.size>100)previous.delete(previous.keys().next().value);
  }
  function init(){
    if(uiReady)return;uiReady=true;
    document.addEventListener('pointerdown',unlock,{passive:true,capture:true});
    document.addEventListener('keydown',unlock,{capture:true});
    document.addEventListener('click',e=>{
      if(e.target.closest('button,[role="button"],input[type="button"],input[type="submit"],select,a'))sound('click');
    },{capture:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  return {sound,watch,unlock};
})();

const REQUIRED_SERVER_BUILD='2026-09-27-session-stability-opt-1';
let connectingPromise=null;
const CLIENT_SESSION_KEY='echoes_multi_client_session_v1';
let fallbackClientSessionId='';
function getClientSessionId(){
  try{
    let v=sessionStorage.getItem(CLIENT_SESSION_KEY)||'';
    if(!v){v=(globalThis.crypto?.randomUUID?.()||('c_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2)));sessionStorage.setItem(CLIENT_SESSION_KEY,v);}
    return String(v).slice(0,96);
  }catch{
    if(!fallbackClientSessionId)fallbackClientSessionId='c_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2);
    return fallbackClientSessionId;
  }
}
let mobQueue=[],mobScheduled=false,mobSeq=0;
function queueMobHit(event){if(!state.mobCombatProtocol){send({type:'world:mobDamage',...event});return;}mobQueue.push(event);if(mobScheduled)return;mobScheduled=true;const socket=state.socket;queueMicrotask(()=>{mobScheduled=false;const events=mobQueue;mobQueue=[];if(socket!==state.socket)return;for(let i=0;i<events.length;i+=64)send({type:'world:mobCombat',seq:++mobSeq,events:events.slice(i,i+64)});});}
let combatSeq=0,combatAck=0,controlAck=0,combatQueue=[];
function flushCombat(){if(!combatQueue.length)return;const events=combatQueue.splice(0,64);if(!send({type:'world:combat',seq:++combatSeq,events}))combatQueue=[];}
function combatEvent(event){if(state.connected&&state.profile?.mode!=='pvp'){combatQueue.push(event);if(combatQueue.length>=64)flushCombat();}}
const state={
  socket:null,connected:false,connecting:false,selfId:null,
  players:new Map(),bosses:new Map(),party:null,pendingInvite:null,
  world:null,worldRole:{leaderId:null,isLeader:false},worldSnapshot:{mobs:[],items:[],updatedAt:0},worldRevision:0,takenItems:new Set(),
  profile:null,lastError:'',partyMax:4,pvpRuleset:'',serverBuild:'',clientSessionId:getClientSessionId(),reconnectTimer:null,reconnectGraceTimer:null,reconnectAttempts:0,recovering:false,pendingState:null,manualClose:false,lastWorldResyncAt:0
};
function emit(type,payload){
  const set=listeners.get(type);if(!set)return;
  for(const fn of [...set]){try{fn(payload);}catch(e){console.error(e);}}
}
function on(type,fn){
  if(!listeners.has(type))listeners.set(type,new Set());
  listeners.get(type).add(fn);
  return ()=>listeners.get(type)?.delete(fn);
}
function url(){
  return String(window.ECHOES_MULTIPLAYER_CONFIG?.serverUrl||'').trim();
}
function send(data){
  const ws=state.socket;if(ws?.readyState!==WebSocket.OPEN)return false;
  if(['pvp:relay','pvp:aiPacket'].includes(data?.type)&&data.data?.t==='state'&&!state.profile?.spectator&&ws.bufferedAmount>4096)return false;
  if(ws.bufferedAmount>48000&&(data?.type==='state'||data?.type==='world:mobsDelta'))return false;
  try{ws.send(JSON.stringify(data,data.type==='state'?((k,v)=>typeof v==='number'&&Number.isFinite(v)?Math.round(v*1000)/1000:v):undefined));return true;}catch{return false;}
}
function normalizeBoss(b){
  return {...b,hp:Number(b.hp)||0,maxHp:Math.max(1,Number(b.maxHp)||1),alive:b.alive!==false,respawnInMs:Math.max(0,Number(b.respawnInMs)||0)};
}
function requestWorldResync(force=false){
  const now=performance.now();if(!force&&now-(state.lastWorldResyncAt||0)<900)return;state.lastWorldResyncAt=now;send({type:'world:resync',revision:state.worldRevision||0});
}
function handle(msg){
  if(!msg||typeof msg!=='object')return;
  if(msg.type==='skill:fx')gameAudio.sound('remoteSkill',{id:msg.skillId,slot:msg.slot});
  if(msg.type==='world:mobAttack')gameAudio.sound('remoteAttack');
  if(msg.type==='world:combatResult'&&msg.targetId===state.selfId)gameAudio.sound('hit');
  if(msg.type==='boss:defeated')gameAudio.sound('victory');
  if(msg.type==='boss:respawn')gameAudio.sound('confirm');
  if(msg.type==='pvp:relay'||msg.type==='pvp:aiPacket'){
    const packet=msg.data||msg.packet||{};
    if(packet.t==='state')gameAudio.watch('pvp:remote',packet,true);
    else if(/hit|damage/i.test(String(packet.t||'')))gameAudio.sound('hit');
    else if(/skill|attack/i.test(String(packet.t||'')))gameAudio.sound('remoteSkill',{id:packet.skillId,slot:packet.slot});
  }
  if(msg.type==='net:pong'){if(msg.nonce!==state.lastPingNonce)return;const rtt=Date.now()-msg.nonce;if(rtt>=0&&rtt<3000){state.rtt=rtt;state.serverOffset=msg.serverTime-(msg.nonce+rtt/2);}return;}
  if(msg.type==='hello:ok'){
    state.lastPingAt=0;delete state.serverOffset;mobQueue=[];mobSeq=0;combatSeq=0;combatAck=0;controlAck=0;combatQueue=[];state.serverBuild=String(msg.serverBuild||'');state.deviceTrainingProtocol=Number(msg.deviceTrainingProtocol)||0;state.mobCombatProtocol=Number(msg.mobCombatProtocol)||0;state.combatProtocol=Number(msg.combatProtocol)||0;state.selfId=msg.selfId;state.world=msg.world||null;state.partyMax=msg.partyMax||4;state.pvpRuleset=String(msg.pvpRuleset||'');
    state.players=new Map((msg.players||[]).filter(p=>p.id!==state.selfId).map(p=>[p.id,p]));
    state.bosses=new Map((msg.bosses||[]).map(b=>[b.id,normalizeBoss(b)]));
    state.worldRole=msg.worldRole||{leaderId:null,isLeader:false,serverAuthority:true};
    state.worldSnapshot=msg.worldSnapshot||{mobs:[],items:[],updatedAt:0};state.worldRevision=Number(state.worldSnapshot.revision)||0;
    state.takenItems=new Set(msg.takenItemIds||[]);
    emit('ready',{selfId:state.selfId,world:state.world,bosses:[...state.bosses.values()]});
    emit('world:role',state.worldRole);
    emit('world:snapshot',state.worldSnapshot);
    emit('world:taken',[...state.takenItems]);
    emit('players',[...state.players.values()]);
    emit('bosses',[...state.bosses.values()]);
    return;
  }
  if(msg.type==='players'){
    const next=new Map();
    for(const p of msg.players||[]){if(p.id===state.selfId)continue;const old=state.players.get(p.id)||{};next.set(p.id,{...old,...p,netReceivedAt:performance.now()});}
    state.players=next;for(const p of next.values())gameAudio.watch('world:'+p.id,p,true);if(Number(msg.revision)>state.worldRevision)requestWorldResync();emit('players',[...state.players.values()]);return;
  }
  if(msg.type==='world:combatResult'){if(msg.targetId===state.selfId){const rev=Number(msg.player?.combatRevision)||0;if(rev<=combatAck)return;combatAck=rev;controlAck=Math.max(controlAck,Number(msg.player?.controlRevision)||0);}else if(msg.player){const old=state.players.get(msg.targetId)||{};if((old.combatRevision||0)>(msg.player.combatRevision||0))return;state.players.set(msg.targetId,{...old,...msg.player});}emit('world:combatResult',msg);return;}
  if(msg.type==='player:self'){emit('player:self',msg);return;}
  if(msg.type==='skill:fx'){emit('skill:fx',msg);return;}
  if(msg.type==='skill:effects'){emit('skill:effects',msg);return;}
  if(msg.type==='player:state'){
    const p=msg.player;if(!p?.id||p.id===state.selfId)return;
    const old=state.players.get(p.id)||{},merged={...old,...p,netReceivedAt:performance.now()};
    state.players.set(p.id,merged);emit('player:state',merged);return;
  }
  if(msg.type==='player:join'){if(msg.player?.id!==state.selfId){state.players.set(msg.player.id,{...msg.player,netReceivedAt:performance.now()});emit('players',[...state.players.values()]);emit('notice',msg.player.name+'님이 월드에 들어왔습니다.');}return;}
  if(msg.type==='player:leave'){const p=state.players.get(msg.id);state.players.delete(msg.id);emit('players',[...state.players.values()]);if(p)emit('notice',p.name+'님이 월드에서 나갔습니다.');return;}
  if(msg.type==='boss:update'||msg.type==='boss:defeated'||msg.type==='boss:respawn'){
    const b=normalizeBoss(msg.boss||{});if(b.id)state.bosses.set(b.id,b);
    emit('boss',b);emit('bosses',[...state.bosses.values()]);
    if(msg.type==='boss:defeated'){emit('boss:defeated',msg);emit('notice',b.name+'이(가) 쓰러졌습니다. 약 3분 뒤 다시 나타납니다.');}
    if(msg.type==='boss:respawn')emit('notice',b.name+'이(가) 다시 나타났습니다.');
    return;
  }
  if(msg.type==='party:update'){state.party=msg.party||null;emit('party',state.party);return;}
  if(msg.type==='party:invite'){state.pendingInvite=msg;emit('party:invite',msg);return;}
  if(msg.type==='party:chat'){emit('party:chat',msg);return;}
  if(['ai:trainAuth','ai:trainStatus','ai:trainCheckpoint','ai:trainError','ai:trainWatchStatus','ai:trainPreview','ai:trainTakeoverPending','ai:trainTakeoverNotice','ai:trainReplaced'].includes(msg.type)){emit(msg.type,msg);return;}
  if(['pvp:relay','pvp:relayOpen','pvp:relayClosed','pvp:aiReady','pvp:aiPacket','pvp:aiError'].includes(msg.type)){emit(msg.type,msg);return;}
  if(msg.type==='pvp:matchStatus'){emit('pvp:matchStatus',msg);return;}
  if(msg.type==='pvp:matchFound'){emit('pvp:matchFound',msg);return;}
  if(msg.type==='pvp:damage'){emit('pvp:damage',msg);return;}
  if(msg.type==='pvp:blocked'){emit('pvp:blocked',msg);return;}
  if(msg.type==='world:role'){state.worldRole={leaderId:msg.leaderId||null,isLeader:!!msg.isLeader,serverAuthority:msg.serverAuthority!==false};emit('world:role',state.worldRole);return;}
  if(msg.type==='world:authority'){state.worldRole={...state.worldRole,serverAuthority:true};emit('world:role',state.worldRole);return;}
  if(msg.type==='world:projectileHit'){emit('world:projectileHit',msg);return;}
  if(msg.type==='world:mobAttack'){emit('world:mobAttack',msg);return;}
  if(msg.type==='world:snapshot'){state.worldSnapshot=msg.snapshot||{mobs:[],items:[],updatedAt:0};state.worldRevision=Number(state.worldSnapshot.revision)||state.worldRevision||0;emit('world:snapshot',state.worldSnapshot);return;}
  if(msg.type==='world:mobsDelta'){const rev=Number(msg.revision)||0;if(rev&&state.worldRevision&&rev>state.worldRevision+1)requestWorldResync();if(rev)state.worldRevision=Math.max(state.worldRevision||0,rev);emit('world:mobsDelta',msg.mobs||[]);return;}
  if(msg.type==='world:itemTaken'){if(msg.itemId)state.takenItems.add(msg.itemId);emit('world:itemTaken',msg);return;}
  if(msg.type==='world:itemSpawn'){emit('world:itemSpawn',msg.item||{});return;}
  if(msg.type==='world:mobPatch'){emit('world:mobPatch',msg.mob||{});return;}
  if(msg.type==='pvp:control'){emit('pvp:control',msg);return;}
  if(msg.type==='pvp:hit'){emit('pvp:hit',msg);return;}
  if(msg.type==='pvp:confirm'){emit('pvp:confirm',msg);return;}
  if(msg.type==='pvp:defeated'){emit('pvp:defeated',msg);return;}
  if(msg.type==='session:replaced'){emit('session:replaced',msg);return;}
  if(msg.type==='notice'){emit('notice',msg.message||'');return;}
}
function scheduleReconnect(){
  if(state.manualClose||!state.profile||state.reconnectTimer)return;
  state.reconnectAttempts++;
  const delay=state.reconnectAttempts===1?180:Math.min(8000,650*Math.pow(1.65,Math.min(6,state.reconnectAttempts-2)));
  if(state.reconnectAttempts>1)emit('reconnecting',{attempt:state.reconnectAttempts,delay});
  state.reconnectTimer=setTimeout(()=>{
    state.reconnectTimer=null;
    connect(state.profile,true).catch(()=>scheduleReconnect());
  },delay);
}
function connect(profile={},reconnecting=false){
  if(state.connected)return Promise.resolve(true);
  if(state.connecting&&connectingPromise)return connectingPromise;
  const endpoint=url();
  if(!endpoint)return Promise.reject(new Error('멀티플레이 서버 주소가 설정되지 않았습니다.'));
  state.profile=profile;state.connecting=true;state.lastError='';state.manualClose=false;
  return connectingPromise=new Promise((resolve,reject)=>{
    let settled=false,opened=false;
    const ws=new WebSocket(endpoint);state.socket=ws;
    const waiting=setTimeout(()=>{if(!settled&&state.socket===ws)emit('notice','서버를 준비하고 있습니다. 무료 서버가 쉬고 있었다면 약 1분 걸릴 수 있습니다. 잠시 기다려 주세요.');},8000);
    const timer=setTimeout(()=>{if(!settled){settled=true;try{ws.close();}catch{}state.connected=false;state.connecting=false;reject(new Error('멀티플레이 서버가 시작되는 데 시간이 오래 걸리고 있습니다. 다시 접속해 주세요.'));}},90000);
    ws.addEventListener('open',()=>{
      if(state.socket!==ws){try{ws.close();}catch{}return;}opened=true;
      try{ws.binaryType='arraybuffer';}catch{}
      send({type:'hello',pvpRelay:1,name:profile.name||'Player',accountId:profile.accountId||'',clientSessionId:state.clientSessionId,level:profile.level||1,weapon:profile.weapon||0,mode:profile.mode==='pvp'?'pvp':'world',pvpRuleset:profile.mode==='pvp'?String(profile.pvpRuleset||window.EchoesWorldPvpData?.ruleset||''):''});
    });
    ws.addEventListener('message',e=>{
      if(state.socket!==ws||state.manualClose)return;
      let msg;try{msg=JSON.parse(e.data);}catch{return;}
      handle(msg);
      if(msg.type==='hello:ok'){
        const protocolCompatible=(Number(msg.combatProtocol)||0)>=1&&(Number(msg.mobCombatProtocol)||0)>=1&&(Number(msg.controlProtocol)||0)>=2&&(Number(msg.visualProtocol)||0)>=2;
        if(!protocolCompatible){
          state.lastError='server-protocol';state.connected=false;state.connecting=false;state.manualClose=true;
          try{ws.close(4002,'server protocol mismatch');}catch{}
          if(!settled){settled=true;clearTimeout(timer);clearTimeout(waiting);connectingPromise=null;reject(new Error('멀티플레이 서버 통신 규격이 현재 게임과 맞지 않습니다.'));}
          return;
        }
        const wasRecovering=reconnecting||state.reconnectAttempts>0;
        state.connected=true;state.connecting=false;state.reconnectAttempts=0;state.recovering=false;
        if(state.reconnectGraceTimer){clearTimeout(state.reconnectGraceTimer);state.reconnectGraceTimer=null;}
        const pendingState=state.pendingState;state.pendingState=null;
        emit('connection',{connected:true,reconnected:wasRecovering});
        if(wasRecovering)emit('reconnected',{brief:true});
        if(pendingState)queueMicrotask(()=>window.EchoesMulti?.sendState(pendingState));
        if(!settled){settled=true;clearTimeout(timer);clearTimeout(waiting);connectingPromise=null;resolve(true);}
      }
    });
    ws.addEventListener('close',()=>{
      clearTimeout(timer);clearTimeout(waiting);if(state.socket!==ws){if(!settled){settled=true;reject(new Error('연결이 취소되었습니다.'));}return;}connectingPromise=null;const shouldReconnect=!state.manualClose&&!!state.profile&&(opened||reconnecting);
      if(state.profile?.mode==='pvp')emit('pvp:relayClosed',{});
      state.connected=false;state.connecting=false;if(state.socket===ws)state.socket=null;
      if(shouldReconnect){
        state.recovering=true;
        if(!state.reconnectGraceTimer)state.reconnectGraceTimer=setTimeout(()=>{state.reconnectGraceTimer=null;if(!state.connected&&!state.manualClose){state.recovering=false;state.selfId=null;state.party=null;emit('connection',{connected:false,reconnecting:true});emit('reconnecting',{attempt:Math.max(1,state.reconnectAttempts),delay:0});}},6000);
      }else{state.recovering=false;state.pendingState=null;state.selfId=null;state.party=null;emit('connection',{connected:false,reconnecting:false});}
      if(!settled){settled=true;reject(new Error('멀티플레이 서버에 연결하지 못했습니다.'));}
      if(shouldReconnect)scheduleReconnect();
    });
    ws.addEventListener('error',()=>{if(state.socket===ws)state.lastError='network';});
  });
}
function disconnect(){
  connectingPromise=null;state.manualClose=true;state.profile=null;state.reconnectAttempts=0;state.recovering=false;state.pendingState=null;
  if(state.reconnectTimer){clearTimeout(state.reconnectTimer);state.reconnectTimer=null;}
  if(state.reconnectGraceTimer){clearTimeout(state.reconnectGraceTimer);state.reconnectGraceTimer=null;}
  try{state.socket?.close();}catch{}
  state.connected=false;state.connecting=false;state.socket=null;state.players.clear();state.party=null;state.selfId=null;
}
window.EchoesMulti={
  state,on,connect,disconnect,requestWorldResync,combatEvent,flushCombat,audio:gameAudio,
  serverNow(){return Date.now()+(state.serverOffset||0);},
  packetAge(stamp){return Number.isFinite(stamp)&&Number.isFinite(state.serverOffset)?Math.max(0,Math.min(.3,(Date.now()+state.serverOffset-stamp)/1000)):0;},
  get combatAck(){return combatAck;},
  get controlAck(){return controlAck;},
  get enabled(){return !!url();},
  get connected(){return state.connected||state.recovering;},
  get serverUrl(){return url();},
  sendState(p){if(!p)return;gameAudio.watch('self',p);if(!state.connected){if(state.recovering)state.pendingState=p;return;}const now=Date.now();if(now-(state.lastPingAt||0)>2000){state.lastPingAt=now;state.lastPingNonce=now;send({type:'net:ping',nonce:now});}send({type:p.teleport?'world:teleport':'state',combatAck,controlAck,defenseReduction:p.defenseReduction,shield:p.shield,maxShield:p.maxShield,stam:p.stam,maxStam:p.maxStam,block:p.block,parryWindow:p.parryWindow,invuln:p.invuln,stun:p.stun,shieldBroken:p.shieldBroken,shieldDelay:p.shieldDelay,skillId:p.skillId,skillKind:p.skillKind,moveSpeed:p.moveSpeed,special:p.special,
    x:p.x,y:p.y,a:p.a,hp:p.hp,maxHp:p.maxHp,level:p.level,weapon:p.weapon,
    swordStyle:p.swordStyle,swordSkills:Array.isArray(p.swordSkills)?p.swordSkills.slice(0,5):undefined,
    equippedHead:p.equippedHead,equippedChest:p.equippedChest,equippedShield:p.equippedShield,
    attackAnim:p.attackAnim,attackDuration:p.attackDuration,basicVisual:p.basicVisual,strikePose:p.strikePose,skillPose:p.skillPose,skillLift:p.skillLift,
    combo:p.combo,parry:p.parry,dodge:p.dodge,dx:p.dx,dy:p.dy,walk:p.walk,phase:p.phase,
    deathSeq:p.deathSeq||0,skillFxSeq:p.skillFxSeq||0,skillFxSlot:p.skillFxSlot||0,skillFxId:p.skillFxId||'',skillFxWeapon:p.skillFxWeapon||0,skillFxX:p.skillFxX,skillFxY:p.skillFxY,skillFxA:p.skillFxA,
    vx:p.vx||0,vy:p.vy||0,seq:p.seq||0
  });},
  bootstrapWorld(snapshot){if(state.connected&&snapshot?.mobs?.length)send({type:'world:bootstrap',spawnLayoutVersion:String(snapshot.spawnLayoutVersion||''),mobs:snapshot.mobs,obstacles:snapshot.obstacles||[]});},
  sendWorldSnapshot(snapshot){if(state.connected&&state.worldRole?.isLeader)send({type:'world:snapshot',items:Array.isArray(snapshot?.items)?snapshot.items:[]});},
  sendMobDelta(){return false;},
  itemTaken(itemId){if(itemId)send({type:'world:itemTaken',itemId});},
  itemSpawn(item){if(item?.id)send({type:'world:itemSpawn',item});},
  damageMob(mobId,damage,control={}){if(mobId&&damage>0)gameAudio.sound('hit');if(mobId&&state.connected)queueMobHit({mobId,damage,stun:control.stun||0,root:control.root||0,knockbackX:control.knockbackX||0,prismCast:String(control.prismCast||'').slice(0,64),knockbackY:control.knockbackY||0,duration:control.duration,replaceForce:control.replaceForce===true});},
  skillFx(fx){if(fx)gameAudio.sound('skill',{id:fx.skillId,slot:fx.slot});if(state.connected&&fx)send({type:'skill:fx',fxSeq:fx.seq||0,slot:fx.slot,skillId:fx.skillId,weapon:fx.weapon,x:fx.x,y:fx.y,a:fx.a});},
  skillEffects(packet){if(state.connected&&packet)send({type:'skill:effects',seq:packet.seq||0,effects:Array.isArray(packet.effects)?packet.effects.slice(0,90):[],projectiles:Array.isArray(packet.projectiles)?packet.projectiles.slice(0,24):[]});},
  pvpDamage(targetId,damage,range=180,kind='melee',control={}){combatEvent({targetId,kind:'attack',damage,range,...control});},
  pvpControl(targetId,dx,dy,stun=0,kind='skill-control'){combatEvent({targetId,kind:'control',dx,dy,stun});},
  pvpRelayReady(matchId){return send({type:'pvp:relayReady',matchId});},
  pvpRelaySend(matchId,data){if(data?.t==='state')gameAudio.watch('pvp:self',data);else if(/hit|damage/i.test(String(data?.t||'')))gameAudio.sound('hit');else if(/skill|attack/i.test(String(data?.t||'')))gameAudio.sound('skill',{id:data?.skillId,slot:data?.slot});if(data?.t==='state'){const packed={...data};for(const key of Object.keys(packed)){const v=packed[key];if(typeof v==='number'&&Number.isFinite(v))packed[key]=Math.round(v*1000)/1000;}data=packed;}return send({type:'pvp:relay',matchId,data});},
  pvpRelayLeave(matchId){return send({type:'pvp:relayLeave',matchId});},
  training(type,data={}){return send({...data,type:'ai:train'+type});},
  aiStart(style,difficulty=3,options={}){gameAudio.sound('confirm');return send({type:'pvp:aiStart',style,difficulty,spectate:options.spectate===true,localStyle:options.localStyle,localDifficulty:options.localDifficulty});},
  aiPacket(matchId,data){return send({type:'pvp:aiPacket',matchId,data});},
  aiLeave(){return send({type:'pvp:aiLeave'});},
  pvpMatchJoin(){gameAudio.sound('confirm');return send({type:'pvp:matchJoin'});},
  pvpMatchCancel(){return send({type:'pvp:matchCancel'});},
  damageBoss(bossId,damage,control={}){if(damage>0)gameAudio.sound('hit');send({type:'boss:damage',bossId,damage,stun:control.stun||0,root:control.root||0,knockbackX:control.knockbackX||0,prismCast:String(control.prismCast||'').slice(0,64),knockbackY:control.knockbackY||0,duration:control.duration,replaceForce:control.replaceForce===true});},
  hitPlayer(targetId,damage,range=180,kind='attack',parryable=true){combatEvent({targetId,kind:'attack',damage,range,parryable});},
  createParty(){send({type:'party:create'});},
  invite(targetId){send({type:'party:invite',targetId});},
  acceptParty(partyId){send({type:'party:accept',partyId});},
  leaveParty(){send({type:'party:leave'});},
  partyChat(message){send({type:'party:chat',message});}
};
})();


