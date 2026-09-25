(()=>{
'use strict';
const listeners=new Map();
const state={
  socket:null,connected:false,connecting:false,selfId:null,
  players:new Map(),bosses:new Map(),party:null,pendingInvite:null,
  world:null,worldRole:{leaderId:null,isLeader:false},worldSnapshot:{mobs:[],items:[],updatedAt:0},takenItems:new Set(),
  profile:null,lastError:'',partyMax:4,reconnectTimer:null
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
  if(state.socket?.readyState===WebSocket.OPEN)state.socket.send(JSON.stringify(data));
}
function normalizeBoss(b){
  return {...b,hp:Number(b.hp)||0,maxHp:Math.max(1,Number(b.maxHp)||1),alive:b.alive!==false,respawnInMs:Math.max(0,Number(b.respawnInMs)||0)};
}
function handle(msg){
  if(!msg||typeof msg!=='object')return;
  if(msg.type==='hello:ok'){
    state.selfId=msg.selfId;state.world=msg.world||null;state.partyMax=msg.partyMax||4;
    state.players=new Map((msg.players||[]).filter(p=>p.id!==state.selfId).map(p=>[p.id,p]));
    state.bosses=new Map((msg.bosses||[]).map(b=>[b.id,normalizeBoss(b)]));
    state.worldRole=msg.worldRole||{leaderId:null,isLeader:false};
    state.worldSnapshot=msg.worldSnapshot||{mobs:[],items:[],updatedAt:0};
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
    state.players=new Map((msg.players||[]).filter(p=>p.id!==state.selfId).map(p=>[p.id,p]));
    emit('players',[...state.players.values()]);
    return;
  }
  if(msg.type==='player:join'){if(msg.player?.id!==state.selfId){state.players.set(msg.player.id,msg.player);emit('players',[...state.players.values()]);emit('notice',msg.player.name+'님이 월드에 들어왔습니다.');}return;}
  if(msg.type==='player:leave'){const p=state.players.get(msg.id);state.players.delete(msg.id);emit('players',[...state.players.values()]);if(p)emit('notice',p.name+'님이 월드에서 나갔습니다.');return;}
  if(msg.type==='boss:update'||msg.type==='boss:defeated'||msg.type==='boss:respawn'){
    const b=normalizeBoss(msg.boss||{});if(b.id)state.bosses.set(b.id,b);
    emit('boss',b);emit('bosses',[...state.bosses.values()]);
    if(msg.type==='boss:defeated')emit('notice',b.name+'이(가) 쓰러졌습니다. 약 3분 뒤 다시 나타납니다.');
    if(msg.type==='boss:respawn')emit('notice',b.name+'이(가) 다시 나타났습니다.');
    return;
  }
  if(msg.type==='party:update'){state.party=msg.party||null;emit('party',state.party);return;}
  if(msg.type==='party:invite'){state.pendingInvite=msg;emit('party:invite',msg);return;}
  if(msg.type==='party:chat'){emit('party:chat',msg);return;}
  if(msg.type==='pvp:damage'){emit('pvp:damage',msg);return;}
  if(msg.type==='pvp:blocked'){emit('pvp:blocked',msg);return;}
  if(msg.type==='world:role'){state.worldRole={leaderId:msg.leaderId||null,isLeader:!!msg.isLeader};emit('world:role',state.worldRole);return;}
  if(msg.type==='world:snapshot'){state.worldSnapshot=msg.snapshot||{mobs:[],items:[],updatedAt:0};emit('world:snapshot',state.worldSnapshot);return;}
  if(msg.type==='world:itemTaken'){if(msg.itemId)state.takenItems.add(msg.itemId);emit('world:itemTaken',msg);return;}
  if(msg.type==='world:mobPatch'){emit('world:mobPatch',msg.mob||{});return;}
  if(msg.type==='pvp:hit'){emit('pvp:hit',msg);return;}
  if(msg.type==='pvp:confirm'){emit('pvp:confirm',msg);return;}
  if(msg.type==='pvp:defeated'){emit('pvp:defeated',msg);return;}
  if(msg.type==='session:replaced'){emit('session:replaced',msg);return;}
  if(msg.type==='notice'){emit('notice',msg.message||'');return;}
}
function connect(profile={}){
  if(state.connected||state.connecting)return Promise.resolve(state.connected);
  const endpoint=url();
  if(!endpoint)return Promise.reject(new Error('멀티플레이 서버 주소가 설정되지 않았습니다.'));
  state.profile=profile;state.connecting=true;state.lastError='';
  return new Promise((resolve,reject)=>{
    let settled=false;
    const ws=new WebSocket(endpoint);state.socket=ws;
    const timer=setTimeout(()=>{if(!settled){settled=true;try{ws.close();}catch{}state.connecting=false;reject(new Error('멀티플레이 서버 연결 시간이 초과되었습니다.'));}},9000);
    ws.addEventListener('open',()=>{
      state.connected=true;state.connecting=false;
      send({type:'hello',name:profile.name||'Player',accountId:profile.accountId||'',level:profile.level||1,weapon:profile.weapon||0});
      emit('connection',{connected:true});
    });
    ws.addEventListener('message',e=>{
      let msg;try{msg=JSON.parse(e.data);}catch{return;}
      handle(msg);
      if(msg.type==='hello:ok'&&!settled){settled=true;clearTimeout(timer);resolve(true);}
    });
    ws.addEventListener('close',()=>{
      clearTimeout(timer);state.connected=false;state.connecting=false;state.socket=null;state.selfId=null;state.party=null;
      emit('connection',{connected:false});
      if(!settled){settled=true;reject(new Error('멀티플레이 서버에 연결하지 못했습니다.'));}
    });
    ws.addEventListener('error',()=>{state.lastError='network';});
  });
}
function disconnect(){
  if(state.reconnectTimer){clearTimeout(state.reconnectTimer);state.reconnectTimer=null;}
  try{state.socket?.close();}catch{}
  state.connected=false;state.connecting=false;state.socket=null;state.players.clear();state.party=null;state.selfId=null;
}
window.EchoesMulti={
  state,on,connect,disconnect,
  get enabled(){return !!url();},
  get connected(){return state.connected;},
  get serverUrl(){return url();},
  sendState(p){if(!state.connected||!p)return;send({type:'state',
    x:p.x,y:p.y,a:p.a,hp:p.hp,maxHp:p.maxHp,level:p.level,weapon:p.weapon,
    equippedHead:p.equippedHead,equippedChest:p.equippedChest,equippedShield:p.equippedShield,
    attackAnim:p.attackAnim,attackDuration:p.attackDuration,strikePose:p.strikePose,skillPose:p.skillPose,
    combo:p.combo,parry:p.parry,dodge:p.dodge,dx:p.dx,dy:p.dy,walk:p.walk,phase:p.phase
  });},
  sendWorldSnapshot(snapshot){if(state.connected&&state.worldRole?.isLeader)send({type:'world:snapshot',...(snapshot||{})});},
  itemTaken(itemId){if(itemId)send({type:'world:itemTaken',itemId});},
  damageMob(mobId,damage){if(mobId)send({type:'world:mobDamage',mobId,damage});},
  pvpDamage(targetId,damage,range=180,kind='melee'){if(targetId)send({type:'pvp:damage',targetId,damage,range,kind});},
  damageBoss(bossId,damage){send({type:'boss:damage',bossId,damage});},
  hitPlayer(targetId,damage,range=180,kind='attack',parryable=true){if(!state.connected)return;send({type:'pvp:hit',targetId,damage,range,kind,parryable});},
  createParty(){send({type:'party:create'});},
  invite(targetId){send({type:'party:invite',targetId});},
  acceptParty(partyId){send({type:'party:accept',partyId});},
  leaveParty(){send({type:'party:leave'});},
  partyChat(message){send({type:'party:chat',message});}
};
})();
