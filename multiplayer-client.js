(()=>{
'use strict';
const listeners=new Map();
let connectingPromise=null;
let mobQueue=[],mobScheduled=false,mobSeq=0;
function queueMobHit(event){if(!state.mobCombatProtocol){send({type:'world:mobDamage',...event});return;}mobQueue.push(event);if(mobScheduled)return;mobScheduled=true;const socket=state.socket;queueMicrotask(()=>{mobScheduled=false;const events=mobQueue;mobQueue=[];if(socket!==state.socket)return;for(let i=0;i<events.length;i+=64)send({type:'world:mobCombat',seq:++mobSeq,events:events.slice(i,i+64)});});}
let combatSeq=0,combatAck=0,combatQueue=[];
function flushCombat(){if(!combatQueue.length)return;const events=combatQueue.splice(0,64);if(!send({type:'world:combat',seq:++combatSeq,events}))combatQueue=[];}
function combatEvent(event){if(state.connected&&state.profile?.mode!=='pvp'){combatQueue.push(event);if(combatQueue.length>=64)flushCombat();}}
const state={
  socket:null,connected:false,connecting:false,selfId:null,
  players:new Map(),bosses:new Map(),party:null,pendingInvite:null,
  world:null,worldRole:{leaderId:null,isLeader:false},worldSnapshot:{mobs:[],items:[],updatedAt:0},worldRevision:0,takenItems:new Set(),
  profile:null,lastError:'',partyMax:4,pvpRuleset:'',reconnectTimer:null,reconnectAttempts:0,manualClose:false,lastWorldResyncAt:0
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
  if(msg.type==='net:pong'){if(msg.nonce!==state.lastPingNonce)return;const rtt=Date.now()-msg.nonce;if(rtt>=0&&rtt<3000){state.rtt=rtt;state.serverOffset=msg.serverTime-(msg.nonce+rtt/2);}return;}
  if(msg.type==='hello:ok'){
    state.lastPingAt=0;delete state.serverOffset;mobQueue=[];mobSeq=0;combatSeq=0;combatAck=0;combatQueue=[];state.mobCombatProtocol=Number(msg.mobCombatProtocol)||0;state.combatProtocol=Number(msg.combatProtocol)||0;state.selfId=msg.selfId;state.world=msg.world||null;state.partyMax=msg.partyMax||4;state.pvpRuleset=String(msg.pvpRuleset||'');
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
    state.players=next;if(Number(msg.revision)>state.worldRevision)requestWorldResync();emit('players',[...state.players.values()]);return;
  }
  if(msg.type==='world:combatResult'){if(msg.targetId===state.selfId){const rev=Number(msg.player?.combatRevision)||0;if(rev<=combatAck)return;combatAck=rev;}else if(msg.player){const old=state.players.get(msg.targetId)||{};if((old.combatRevision||0)>(msg.player.combatRevision||0))return;state.players.set(msg.targetId,{...old,...msg.player});}emit('world:combatResult',msg);return;}
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
  if(msg.type==='pvp:matchStatus'){emit('pvp:matchStatus',msg);return;}
  if(msg.type==='pvp:matchFound'){emit('pvp:matchFound',msg);return;}
  if(msg.type==='pvp:damage'){emit('pvp:damage',msg);return;}
  if(msg.type==='pvp:blocked'){emit('pvp:blocked',msg);return;}
  if(msg.type==='world:role'){state.worldRole={leaderId:msg.leaderId||null,isLeader:!!msg.isLeader,serverAuthority:msg.serverAuthority!==false};emit('world:role',state.worldRole);return;}
  if(msg.type==='world:authority'){state.worldRole={...state.worldRole,serverAuthority:true};emit('world:role',state.worldRole);return;}
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
  const delay=Math.min(8000,800*Math.pow(1.65,Math.min(6,state.reconnectAttempts-1)));
  emit('reconnecting',{attempt:state.reconnectAttempts,delay});
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
      send({type:'hello',name:profile.name||'Player',accountId:profile.accountId||'',level:profile.level||1,weapon:profile.weapon||0,mode:profile.mode==='pvp'?'pvp':'world',pvpRuleset:profile.mode==='pvp'?String(profile.pvpRuleset||window.EchoesWorldPvpData?.ruleset||''):''});
    });
    ws.addEventListener('message',e=>{
      if(state.socket!==ws||state.manualClose)return;
      let msg;try{msg=JSON.parse(e.data);}catch{return;}
      handle(msg);
      if(msg.type==='hello:ok'){
        state.connected=true;state.connecting=false;state.reconnectAttempts=0;
        emit('connection',{connected:true,reconnected:reconnecting});
        if(reconnecting)emit('reconnected',{});
        if(!settled){settled=true;clearTimeout(timer);clearTimeout(waiting);connectingPromise=null;resolve(true);}
      }
    });
    ws.addEventListener('close',()=>{
      clearTimeout(timer);clearTimeout(waiting);if(state.socket!==ws){if(!settled){settled=true;reject(new Error('연결이 취소되었습니다.'));}return;}connectingPromise=null;const shouldReconnect=!state.manualClose&&!!state.profile&&(opened||reconnecting);
      state.connected=false;state.connecting=false;if(state.socket===ws)state.socket=null;state.selfId=null;state.party=null;
      emit('connection',{connected:false,reconnecting:shouldReconnect});
      if(!settled){settled=true;reject(new Error('멀티플레이 서버에 연결하지 못했습니다.'));}
      if(shouldReconnect)scheduleReconnect();
    });
    ws.addEventListener('error',()=>{if(state.socket===ws)state.lastError='network';});
  });
}
function disconnect(){
  connectingPromise=null;state.manualClose=true;state.profile=null;state.reconnectAttempts=0;
  if(state.reconnectTimer){clearTimeout(state.reconnectTimer);state.reconnectTimer=null;}
  try{state.socket?.close();}catch{}
  state.connected=false;state.connecting=false;state.socket=null;state.players.clear();state.party=null;state.selfId=null;
}
window.EchoesMulti={
  state,on,connect,disconnect,requestWorldResync,combatEvent,flushCombat,
  serverNow(){return Date.now()+(state.serverOffset||0);},
  packetAge(stamp){return Number.isFinite(stamp)&&Number.isFinite(state.serverOffset)?Math.max(0,Math.min(.3,(Date.now()+state.serverOffset-stamp)/1000)):0;},
  get combatAck(){return combatAck;},
  get enabled(){return !!url();},
  get connected(){return state.connected;},
  get serverUrl(){return url();},
  sendState(p){if(!state.connected||!p)return;const now=Date.now();if(now-(state.lastPingAt||0)>2000){state.lastPingAt=now;state.lastPingNonce=now;send({type:'net:ping',nonce:now});}send({type:p.teleport?'world:teleport':'state',combatAck,defenseReduction:p.defenseReduction,shield:p.shield,maxShield:p.maxShield,stam:p.stam,maxStam:p.maxStam,block:p.block,parryWindow:p.parryWindow,invuln:p.invuln,stun:p.stun,shieldBroken:p.shieldBroken,shieldDelay:p.shieldDelay,skillId:p.skillId,skillKind:p.skillKind,moveSpeed:p.moveSpeed,special:p.special,
    x:p.x,y:p.y,a:p.a,hp:p.hp,maxHp:p.maxHp,level:p.level,weapon:p.weapon,
    swordStyle:p.swordStyle,swordSkills:Array.isArray(p.swordSkills)?p.swordSkills.slice(0,5):undefined,
    equippedHead:p.equippedHead,equippedChest:p.equippedChest,equippedShield:p.equippedShield,
    attackAnim:p.attackAnim,attackDuration:p.attackDuration,strikePose:p.strikePose,skillPose:p.skillPose,
    combo:p.combo,parry:p.parry,dodge:p.dodge,dx:p.dx,dy:p.dy,walk:p.walk,phase:p.phase,
    deathSeq:p.deathSeq||0,skillFxSeq:p.skillFxSeq||0,skillFxSlot:p.skillFxSlot||0,skillFxId:p.skillFxId||'',skillFxWeapon:p.skillFxWeapon||0,skillFxX:p.skillFxX,skillFxY:p.skillFxY,skillFxA:p.skillFxA,
    vx:p.vx||0,vy:p.vy||0,seq:p.seq||0
  });},
  bootstrapWorld(snapshot){if(state.connected&&snapshot?.mobs?.length)send({type:'world:bootstrap',spawnLayoutVersion:String(snapshot.spawnLayoutVersion||''),mobs:snapshot.mobs,obstacles:snapshot.obstacles||[]});},
  sendWorldSnapshot(snapshot){if(state.connected&&state.worldRole?.isLeader)send({type:'world:snapshot',items:Array.isArray(snapshot?.items)?snapshot.items:[]});},
  sendMobDelta(){return false;},
  itemTaken(itemId){if(itemId)send({type:'world:itemTaken',itemId});},
  itemSpawn(item){if(item?.id)send({type:'world:itemSpawn',item});},
  damageMob(mobId,damage,control={}){if(mobId&&state.connected)queueMobHit({mobId,damage,stun:control.stun||0,knockbackX:control.knockbackX||0,knockbackY:control.knockbackY||0,duration:control.duration||.28});},
  skillFx(fx){if(state.connected&&fx)send({type:'skill:fx',fxSeq:fx.seq||0,slot:fx.slot,skillId:fx.skillId,weapon:fx.weapon,x:fx.x,y:fx.y,a:fx.a});},
  skillEffects(packet){if(state.connected&&packet)send({type:'skill:effects',seq:packet.seq||0,effects:Array.isArray(packet.effects)?packet.effects.slice(0,90):[],projectiles:Array.isArray(packet.projectiles)?packet.projectiles.slice(0,24):[]});},
  pvpDamage(targetId,damage,range=180,kind='melee',control={}){combatEvent({targetId,kind:'attack',damage,range,...control});},
  pvpControl(targetId,dx,dy,stun=0,kind='skill-control'){combatEvent({targetId,kind:'control',dx,dy,stun});},
  pvpMatchJoin(){return send({type:'pvp:matchJoin'});},
  pvpMatchCancel(){return send({type:'pvp:matchCancel'});},
  damageBoss(bossId,damage,control={}){send({type:'boss:damage',bossId,damage,stun:control.stun||0,knockbackX:control.knockbackX||0,knockbackY:control.knockbackY||0});},
  hitPlayer(targetId,damage,range=180,kind='attack',parryable=true){combatEvent({targetId,kind:'attack',damage,range,parryable});},
  createParty(){send({type:'party:create'});},
  invite(targetId){send({type:'party:invite',targetId});},
  acceptParty(partyId){send({type:'party:accept',partyId});},
  leaveParty(){send({type:'party:leave'});},
  partyChat(message){send({type:'party:chat',message});}
};
})();

