(()=>{
'use strict';
const listeners=new Map();
const state={
  socket:null,connected:false,connecting:false,selfId:null,
  players:new Map(),bosses:new Map(),party:null,pendingInvite:null,
  world:null,worldRole:{leaderId:null,isLeader:false},worldSnapshot:{mobs:[],items:[],updatedAt:0},worldRevision:0,takenItems:new Set(),
  profile:null,lastError:'',partyMax:4,reconnectTimer:null,reconnectAttempts:0,manualClose:false,lastWorldResyncAt:0
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
  if(ws.bufferedAmount>192000&&(data?.type==='state'||data?.type==='world:mobsDelta'))return false;
  try{ws.send(JSON.stringify(data));return true;}catch{return false;}
}
function normalizeBoss(b){
  return {...b,hp:Number(b.hp)||0,maxHp:Math.max(1,Number(b.maxHp)||1),alive:b.alive!==false,respawnInMs:Math.max(0,Number(b.respawnInMs)||0)};
}
function requestWorldResync(force=false){
  const now=performance.now();if(!force&&now-(state.lastWorldResyncAt||0)<900)return;state.lastWorldResyncAt=now;send({type:'world:resync',revision:state.worldRevision||0});
}
function handle(msg){
  if(!msg||typeof msg!=='object')return;
  if(msg.type==='hello:ok'){
    state.selfId=msg.selfId;state.world=msg.world||null;state.partyMax=msg.partyMax||4;
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
  if(state.connected||state.connecting)return Promise.resolve(state.connected);
  const endpoint=url();
  if(!endpoint)return Promise.reject(new Error('멀티플레이 서버 주소가 설정되지 않았습니다.'));
  state.profile=profile;state.connecting=true;state.lastError='';state.manualClose=false;
  return new Promise((resolve,reject)=>{
    let settled=false,opened=false;
    const ws=new WebSocket(endpoint);state.socket=ws;
    const timer=setTimeout(()=>{if(!settled){settled=true;try{ws.close();}catch{}state.connected=false;state.connecting=false;reject(new Error('멀티플레이 서버가 시작되는 데 시간이 오래 걸리고 있습니다. 다시 접속해 주세요.'));}},30000);
    ws.addEventListener('open',()=>{
      opened=true;
      try{ws.binaryType='arraybuffer';}catch{}
      send({type:'hello',name:profile.name||'Player',accountId:profile.accountId||'',level:profile.level||1,weapon:profile.weapon||0,mode:profile.mode==='pvp'?'pvp':'world'});
    });
    ws.addEventListener('message',e=>{
      let msg;try{msg=JSON.parse(e.data);}catch{return;}
      handle(msg);
      if(msg.type==='hello:ok'){
        state.connected=true;state.connecting=false;state.reconnectAttempts=0;
        emit('connection',{connected:true,reconnected:reconnecting});
        if(reconnecting)emit('reconnected',{});
        if(!settled){settled=true;clearTimeout(timer);resolve(true);}
      }
    });
    ws.addEventListener('close',()=>{
      clearTimeout(timer);const shouldReconnect=!state.manualClose&&!!state.profile&&(opened||reconnecting);
      state.connected=false;state.connecting=false;if(state.socket===ws)state.socket=null;state.selfId=null;state.party=null;
      emit('connection',{connected:false,reconnecting:shouldReconnect});
      if(!settled){settled=true;reject(new Error('멀티플레이 서버에 연결하지 못했습니다.'));}
      if(shouldReconnect)scheduleReconnect();
    });
    ws.addEventListener('error',()=>{state.lastError='network';});
  });
}
function disconnect(){
  state.manualClose=true;state.profile=null;state.reconnectAttempts=0;
  if(state.reconnectTimer){clearTimeout(state.reconnectTimer);state.reconnectTimer=null;}
  try{state.socket?.close();}catch{}
  state.connected=false;state.connecting=false;state.socket=null;state.players.clear();state.party=null;state.selfId=null;
}
window.EchoesMulti={
  state,on,connect,disconnect,requestWorldResync,
  get enabled(){return !!url();},
  get connected(){return state.connected;},
  get serverUrl(){return url();},
  sendState(p){if(!state.connected||!p)return;send({type:'state',
    x:p.x,y:p.y,a:p.a,hp:p.hp,maxHp:p.maxHp,level:p.level,weapon:p.weapon,
    swordStyle:p.swordStyle||'',swordSkills:Array.isArray(p.swordSkills)?p.swordSkills.slice(0,5):[],
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
  damageMob(mobId,damage,control={}){if(mobId)send({type:'world:mobDamage',mobId,damage,stun:control.stun||0,knockbackX:control.knockbackX||0,knockbackY:control.knockbackY||0});},
  skillFx(fx){if(state.connected&&fx)send({type:'skill:fx',fxSeq:fx.seq||0,slot:fx.slot,skillId:fx.skillId,weapon:fx.weapon,x:fx.x,y:fx.y,a:fx.a});},
  skillEffects(packet){if(state.connected&&packet)send({type:'skill:effects',seq:packet.seq||0,effects:Array.isArray(packet.effects)?packet.effects.slice(0,90):[],projectiles:Array.isArray(packet.projectiles)?packet.projectiles.slice(0,24):[]});},
  pvpDamage(targetId,damage,range=180,kind='melee',control={}){if(targetId)send({type:'pvp:damage',targetId,damage,range,kind,knockbackX:control.knockbackX||0,knockbackY:control.knockbackY||0,stun:control.stun||0});},
  pvpControl(targetId,dx,dy,stun=0,kind='skill-control'){if(targetId)send({type:'pvp:control',targetId,dx,dy,stun,kind});},
  pvpMatchJoin(){return send({type:'pvp:matchJoin'});},
  pvpMatchCancel(){return send({type:'pvp:matchCancel'});},
  damageBoss(bossId,damage,control={}){send({type:'boss:damage',bossId,damage,stun:control.stun||0,knockbackX:control.knockbackX||0,knockbackY:control.knockbackY||0});},
  hitPlayer(targetId,damage,range=180,kind='attack',parryable=true){if(!state.connected)return;send({type:'pvp:hit',targetId,damage,range,kind,parryable});},
  createParty(){send({type:'party:create'});},
  invite(targetId){send({type:'party:invite',targetId});},
  acceptParty(partyId){send({type:'party:accept',partyId});},
  leaveParty(){send({type:'party:leave'});},
  partyChat(message){send({type:'party:chat',message});}
};
})();
