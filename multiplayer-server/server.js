import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT || 8787);
const TICK_MS = 100;
const PARTY_MAX = 4;
const BOSS_RESPAWN_MS = 3 * 60 * 1000;

const WORLD = {
  width: 22000,
  height: 11000,
  difficulty: 'normal',
  difficultyLabel: '보통',
  areaScaleComparedToLegacy: 5.04
};

const SAFE_ZONES = [
  {name:'이끼빛 마을',x:760,y:3010,r:430},
  {name:'황금잎 광장',x:6000,y:3020,r:690}
];
function safeZoneAt(x,y){
  return SAFE_ZONES.find(z=>Math.hypot(Number(x)-z.x,Number(y)-z.y)<z.r)||null;
}

const BIOMES = [
  {id:'moss',name:'이끼빛 들판',x:1400,y:3600,rx:3600,ry:3000,level:1},
  {id:'forest',name:'바람숲',x:4300,y:1850,rx:3900,ry:2600,level:12},
  {id:'plaza',name:'황금잎 평원',x:6500,y:4100,rx:3200,ry:2500,level:1},
  {id:'marsh',name:'유리 습지',x:8200,y:7600,rx:4100,ry:2600,level:28},
  {id:'ember',name:'붉은 고원',x:10800,y:2800,rx:4300,ry:2600,level:38},
  {id:'frost',name:'빙결 수정원',x:15100,y:2100,rx:4300,ry:2600,level:55},
  {id:'abyss',name:'적월 심연',x:17400,y:8200,rx:4300,ry:2600,level:74},
  {id:'citadel',name:'종말의 별성',x:20500,y:4000,rx:3000,ry:3400,level:90}
];

const LANDMARKS = [
  {id:'mossVillage',name:'이끼빛 마을',x:800,y:3100,type:'town'},
  {id:'goldleaf',name:'황금잎 대광장',x:6100,y:3020,type:'town'},
  {id:'glassLake',name:'유리호',x:8450,y:8350,type:'landmark'},
  {id:'emberPass',name:'붉은바람 협곡',x:11250,y:4200,type:'landmark'},
  {id:'frostNeedle',name:'빙정 첨탑',x:15450,y:1250,type:'landmark'},
  {id:'moonGate',name:'적월 관문',x:17850,y:7200,type:'landmark'},
  {id:'lastStar',name:'종언의 별성',x:20500,y:3900,type:'landmark'}
];

const HIDDEN_ITEMS = [
  {id:'blueprint1',name:'잊힌 설계도 조각 I',x:19700,y:10100,kind:'blueprint'},
  {id:'blueprint2',name:'잊힌 설계도 조각 II',x:8850,y:9200,kind:'blueprint'},
  {id:'blueprint3',name:'잊힌 설계도 조각 III',x:14550,y:5150,kind:'blueprint'},
  {id:'blueprint4',name:'잊힌 설계도 조각 IV',x:20750,y:2050,kind:'blueprint'},
  {id:'moonCharm',name:'적월의 부적',x:17120,y:9340,kind:'rare'},
  {id:'frostRelic',name:'빙정 유물',x:15820,y:930,kind:'rare'},
  {id:'wandererRing',name:'방랑자의 반지',x:10350,y:6900,kind:'rare'}
];

const bossDefs = [
  {id:'boss0',name:'고목의 수호자',x:4300,y:1250,maxHp:3000},
  {id:'boss1',name:'유리 날개의 수호자',x:8350,y:7850,maxHp:3750},
  {id:'boss2',name:'불씨의 수호자',x:11250,y:2550,maxHp:4625},
  {id:'boss3',name:'빙정의 군주',x:15400,y:1550,maxHp:6250},
  {id:'boss4',name:'적월 포식자',x:18100,y:8350,maxHp:8000},
  {id:'boss5',name:'별의 종언자',x:20500,y:3850,maxHp:9750}
];

const bosses = new Map(bossDefs.map(b => [b.id, {
  ...b,
  hp:b.maxHp,
  alive:true,
  respawnAt:0,
  lastHitAt:0
}]));

const players = new Map();
const parties = new Map();
let worldLeaderId=null;
let worldSnapshot={mobs:[],items:[],updatedAt:0};
const takenItems=new Set();

function id(prefix='p'){return prefix + crypto.randomBytes(5).toString('hex');}
function cleanName(v){
  return String(v||'Player').replace(/[<>]/g,'').trim().slice(0,20) || 'Player';
}
function cleanAccountId(v,name=''){
  const raw=String(v||'').trim().slice(0,128);
  if(raw)return raw.replace(/[^A-Za-z0-9_:\-.]/g,'');
  return 'name:'+String(name||'player').trim().toLowerCase().replace(/[^a-z0-9가-힣_\-]/g,'').slice(0,40);
}
function clamp(v,a,b){v=Number(v);return Number.isFinite(v)?Math.max(a,Math.min(b,v)):a;}
function safeZoneName(x,y){
  if(Math.hypot(x-760,y-3010)<430)return '이끼빛 마을';
  if(Math.hypot(x-6000,y-3020)<690)return '황금잎 광장';
  return null;
}
function sanitizeEquip(v,fallback){return String(v||fallback||'').replace(/[^A-Za-z0-9_\-]/g,'').slice(0,40);}
function electWorldLeader(){
  const next=[...players.values()].find(p=>p.ready);
  const nextId=next?.id||null;
  if(nextId===worldLeaderId)return;
  worldLeaderId=nextId;
  for(const p of players.values())if(p.ready)safeSend(p.ws,{type:'world:role',leaderId:worldLeaderId,isLeader:p.id===worldLeaderId});
}
function safeSend(ws,data){
  if(ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify(data));
}
function broadcast(data,except=null){
  const text=JSON.stringify(data);
  for(const p of players.values()){
    if(p.ws!==except && p.ws.readyState===WebSocket.OPEN) p.ws.send(text);
  }
}
function publicPlayer(p){
  return {
    id:p.id,name:p.name,x:p.x,y:p.y,a:p.a,
    hp:p.hp,maxHp:p.maxHp,level:p.level,weapon:p.weapon,
    equippedHead:p.equippedHead,equippedChest:p.equippedChest,equippedShield:p.equippedShield,
    attackAnim:p.attackAnim,attackDuration:p.attackDuration,strikePose:p.strikePose,skillPose:p.skillPose,
    combo:p.combo,parry:p.parry,dodge:p.dodge,dx:p.dx,dy:p.dy,walk:p.walk,phase:p.phase,
    partyId:p.partyId||null,updatedAt:p.updatedAt
  };
}
function bossSnapshot(){
  const now=Date.now();
  return [...bosses.values()].map(b=>({
    id:b.id,name:b.name,x:b.x,y:b.y,hp:b.hp,maxHp:b.maxHp,
    alive:b.alive,respawnInMs:b.alive?0:Math.max(0,b.respawnAt-now)
  }));
}
function partyPublic(party){
  return {
    id:party.id,
    leaderId:party.leaderId,
    members:[...party.members],
    invites:[...party.invites]
  };
}
function sendPartyState(party){
  if(!party)return;
  const payload={type:'party:update',party:partyPublic(party)};
  for(const pid of party.members){
    const p=players.get(pid);
    if(p) safeSend(p.ws,payload);
  }
}
function destroyPartyIfEmpty(party){
  if(!party || party.members.size) return;
  parties.delete(party.id);
}
function leaveParty(player){
  if(!player?.partyId)return;
  const party=parties.get(player.partyId);
  player.partyId=null;
  if(!party)return;
  party.members.delete(player.id);
  party.invites.delete(player.id);
  if(party.leaderId===player.id){
    party.leaderId=party.members.values().next().value || null;
  }
  if(!party.members.size) destroyPartyIfEmpty(party);
  else sendPartyState(party);
}
function createParty(player){
  leaveParty(player);
  const party={id:id('party_'),leaderId:player.id,members:new Set([player.id]),invites:new Set()};
  parties.set(party.id,party);
  player.partyId=party.id;
  sendPartyState(party);
}
function inviteParty(player,targetId){
  const party=parties.get(player.partyId);
  if(!party || party.leaderId!==player.id) return {ok:false,message:'파티장만 초대할 수 있습니다.'};
  if(party.members.size>=PARTY_MAX) return {ok:false,message:'파티가 가득 찼습니다.'};
  const target=players.get(String(targetId||''));
  if(!target) return {ok:false,message:'해당 플레이어를 찾을 수 없습니다.'};
  if(target.partyId) return {ok:false,message:'이미 다른 파티에 참가 중입니다.'};
  party.invites.add(target.id);
  safeSend(target.ws,{type:'party:invite',partyId:party.id,leaderId:player.id,leaderName:player.name});
  sendPartyState(party);
  return {ok:true};
}
function acceptParty(player,partyId){
  const party=parties.get(String(partyId||''));
  if(!party || !party.invites.has(player.id)) return {ok:false,message:'유효한 초대가 없습니다.'};
  if(party.members.size>=PARTY_MAX) return {ok:false,message:'파티가 가득 찼습니다.'};
  leaveParty(player);
  party.invites.delete(player.id);
  party.members.add(player.id);
  player.partyId=party.id;
  sendPartyState(party);
  return {ok:true};
}
function handleBossDamage(player,msg){
  const boss=bosses.get(String(msg.bossId||''));
  if(!boss || !boss.alive)return;
  const now=Date.now();
  const damage=clamp(msg.damage,0,1200);
  if(damage<=0)return;
  // Prevent accidental packet floods from one client.
  if(now-(player.lastBossHitAt||0)<25)return;
  player.lastBossHitAt=now;
  boss.hp=Math.max(0,boss.hp-damage);
  boss.lastHitAt=now;
  if(boss.hp<=0){
    boss.alive=false;
    boss.respawnAt=now+BOSS_RESPAWN_MS;
    broadcast({type:'boss:defeated',boss:{...boss,respawnInMs:BOSS_RESPAWN_MS},killerId:player.id,partyId:player.partyId||null});
  }
  broadcast({type:'boss:update',boss:{
    id:boss.id,name:boss.name,x:boss.x,y:boss.y,hp:boss.hp,maxHp:boss.maxHp,
    alive:boss.alive,respawnInMs:boss.alive?0:Math.max(0,boss.respawnAt-now)
  }});
}
function handlePvpHit(player,msg){
  const target=players.get(String(msg.targetId||''));
  if(!target||!target.ready||target===player||player.hp<=0||target.hp<=0)return;
  // PvP is disabled in towns/safe zones for either side.
  if(safeZoneAt(player.x,player.y)||safeZoneAt(target.x,target.y)){
    safeSend(player.ws,{type:'pvp:blocked',reason:'safe'});
    return;
  }
  // Party members cannot damage one another.
  if(player.partyId&&target.partyId&&player.partyId===target.partyId){
    safeSend(player.ws,{type:'pvp:blocked',reason:'party'});
    return;
  }
  const now=Date.now();
  if(now-(player.lastPvpHitAt||0)<35)return;
  player.lastPvpHitAt=now;
  const damage=Math.round(clamp(msg.damage,1,650));
  const range=clamp(msg.range,60,1000);
  const dist=Math.hypot(player.x-target.x,player.y-target.y);
  if(dist>range+110)return;
  safeSend(target.ws,{
    type:'pvp:damage',
    attackerId:player.id,
    attackerName:player.name,
    x:player.x,y:player.y,
    damage,
    kind:String(msg.kind||'attack').slice(0,24),
    parryable:msg.parryable!==false
  });
}

function sanitizeWorldSnapshot(msg){
  const mobs=Array.isArray(msg.mobs)?msg.mobs.slice(0,500).map(m=>({
    id:String(m.id||'').slice(0,50),type:String(m.type||'').slice(0,40),
    x:clamp(m.x,0,WORLD.width),y:clamp(m.y,0,WORLD.height),
    hp:clamp(m.hp,0,9999999),maxHp:clamp(m.maxHp,1,9999999),
    dead:!!m.dead,state:String(m.state||'idle').slice(0,20),
    facing:clamp(m.facing,-20,20),alert:!!m.alert
  })).filter(m=>m.id):[];
  const items=Array.isArray(msg.items)?msg.items.slice(0,2200).map(o=>({
    id:String(o.id||'').slice(0,70),type:String(o.type||'').slice(0,30),
    x:clamp(o.x,0,WORLD.width),y:clamp(o.y,0,WORLD.height),
    lootKind:String(o.lootKind||'').slice(0,30),amount:clamp(o.amount,0,999999),fixed:!!o.fixed
  })).filter(o=>o.id&&!takenItems.has(o.id)):[];
  return {mobs,items,updatedAt:Date.now()};
}
function handleWorldSnapshot(player,msg){
  if(player.id!==worldLeaderId)return;
  worldSnapshot=sanitizeWorldSnapshot(msg);
  broadcast({type:'world:snapshot',snapshot:worldSnapshot},player.ws);
}
function handleItemTaken(player,msg){
  const itemId=String(msg.itemId||'').slice(0,70);if(!itemId)return;
  takenItems.add(itemId);
  worldSnapshot.items=worldSnapshot.items.filter(o=>o.id!==itemId);
  broadcast({type:'world:itemTaken',itemId,by:player.id});
}
function handleItemSpawn(player,msg){
  const raw=msg.item||{},item={
    id:String(raw.id||'').slice(0,70),type:String(raw.type||'loot').slice(0,30),
    x:clamp(raw.x,0,WORLD.width),y:clamp(raw.y,0,WORLD.height),
    lootKind:String(raw.lootKind||'').slice(0,30),amount:clamp(raw.amount,1,999999),fixed:!!raw.fixed
  };
  if(!item.id||takenItems.has(item.id))return;
  const i=worldSnapshot.items.findIndex(o=>o.id===item.id);
  if(i>=0)worldSnapshot.items[i]=item;else worldSnapshot.items.push(item);
  broadcast({type:'world:itemSpawn',item});
}
function handleMobDamage(player,msg){
  const mobId=String(msg.mobId||'').slice(0,50),mob=worldSnapshot.mobs.find(m=>m.id===mobId);
  if(!mob||mob.dead)return;
  if(Math.hypot(player.x-mob.x,player.y-mob.y)>900)return;
  const damage=clamp(msg.damage,0,1800);if(damage<=0)return;
  mob.hp=Math.max(0,mob.hp-damage);if(mob.hp<=0)mob.dead=true;
  const patch={id:mob.id,hp:mob.hp,maxHp:mob.maxHp,dead:mob.dead,by:player.id};
  broadcast({type:'world:mobPatch',mob:patch});
}
function handlePvpDamage(player,msg){
  const target=players.get(String(msg.targetId||''));if(!target||!target.ready||target.id===player.id)return;
  if(player.partyId&&target.partyId&&player.partyId===target.partyId)return;
  const safeA=safeZoneName(player.x,player.y),safeB=safeZoneName(target.x,target.y);
  if(safeA||safeB){safeSend(player.ws,{type:'notice',message:'마을 안전구역에서는 PVP를 할 수 없습니다.'});return;}
  const maxRange=clamp(msg.range,80,760);
  if(Math.hypot(player.x-target.x,player.y-target.y)>maxRange+70)return;
  const damage=clamp(msg.damage,1,650);
  target.hp=Math.max(0,target.hp-damage);
  safeSend(target.ws,{type:'pvp:hit',attackerId:player.id,attackerName:player.name,damage,hp:target.hp,maxHp:target.maxHp});
  safeSend(player.ws,{type:'pvp:confirm',targetId:target.id,damage,hp:target.hp,maxHp:target.maxHp});
  if(target.hp<=0){
    broadcast({type:'pvp:defeated',targetId:target.id,targetName:target.name,killerId:player.id,killerName:player.name});
  }
}
function handleMessage(player,msg){
  if(!msg || typeof msg!=='object')return;
  if(msg.type==='state'){
    player.x=clamp(msg.x,40,WORLD.width-40);
    player.y=clamp(msg.y,40,WORLD.height-40);
    player.a=clamp(msg.a,-Math.PI*4,Math.PI*4);
    player.hp=clamp(msg.hp,0,999999);
    player.maxHp=clamp(msg.maxHp,1,999999);
    player.level=Math.floor(clamp(msg.level,1,100));
    player.weapon=Math.floor(clamp(msg.weapon,0,3));
    player.equippedHead=sanitizeEquip(msg.equippedHead,'wandererHood');
    player.equippedChest=sanitizeEquip(msg.equippedChest,'travelerCoat');
    player.equippedShield=sanitizeEquip(msg.equippedShield,'woodenShield');
    player.attackAnim=clamp(msg.attackAnim,0,5);player.attackDuration=clamp(msg.attackDuration,.05,5);
    player.strikePose=Math.floor(clamp(msg.strikePose,0,8));player.skillPose=Math.floor(clamp(msg.skillPose,-1,8));
    player.combo=Math.floor(clamp(msg.combo,0,10));player.parry=clamp(msg.parry,0,2);player.dodge=clamp(msg.dodge,0,2);
    player.dx=clamp(msg.dx,-1,1);player.dy=clamp(msg.dy,-1,1);player.walk=clamp(msg.walk,0,1);player.phase=clamp(msg.phase,-1e6,1e6);
    player.updatedAt=Date.now();
    return;
  }
  if(msg.type==='world:snapshot'){handleWorldSnapshot(player,msg);return;}
  if(msg.type==='world:itemTaken'){handleItemTaken(player,msg);return;}
  if(msg.type==='world:itemSpawn'){handleItemSpawn(player,msg);return;}
  if(msg.type==='world:mobDamage'){handleMobDamage(player,msg);return;}
  if(msg.type==='pvp:damage'){handlePvpDamage(player,msg);return;}
  if(msg.type==='party:create'){createParty(player);return;}
  if(msg.type==='party:invite'){
    const r=inviteParty(player,msg.targetId);
    if(!r.ok)safeSend(player.ws,{type:'notice',message:r.message});
    return;
  }
  if(msg.type==='party:accept'){
    const r=acceptParty(player,msg.partyId);
    if(!r.ok)safeSend(player.ws,{type:'notice',message:r.message});
    return;
  }
  if(msg.type==='party:leave'){leaveParty(player);return;}
  if(msg.type==='boss:damage'){handleBossDamage(player,msg);return;}
  if(msg.type==='pvp:hit'){handlePvpHit(player,msg);return;}
  if(msg.type==='party:chat'){
    const party=parties.get(player.partyId);
    if(!party)return;
    const message=String(msg.message||'').trim().slice(0,120);
    if(!message)return;
    for(const pid of party.members){
      const target=players.get(pid);
      if(target)safeSend(target.ws,{type:'party:chat',fromId:player.id,fromName:player.name,message});
    }
    return;
  }
}

const server=http.createServer((req,res)=>{
  if(req.url==='/health'){
    res.writeHead(200,{'content-type':'application/json','access-control-allow-origin':'*'});
    res.end(JSON.stringify({ok:true,players:players.size,parties:parties.size,bosses:bossSnapshot(),world:WORLD,worldLeaderId,worldSnapshotUpdatedAt:worldSnapshot.updatedAt}));
    return;
  }
  res.writeHead(200,{'content-type':'application/json','access-control-allow-origin':'*'});
  res.end(JSON.stringify({
    name:'Echoes Shared World Server',
    ok:true,
    players:players.size,
    world:WORLD,
    bossRespawnMinutes:BOSS_RESPAWN_MS/60000
  }));
});

const wss=new WebSocketServer({server});

wss.on('connection',(ws)=>{
  const player={
    id:id('p_'),ws,name:'Player',x:800,y:3100,a:0,hp:100,maxHp:100,
    level:1,weapon:0,equippedHead:'wandererHood',equippedChest:'travelerCoat',equippedShield:'woodenShield',
    attackAnim:0,attackDuration:.26,strikePose:0,skillPose:-1,combo:0,parry:0,dodge:0,dx:0,dy:0,walk:0,phase:0,
    partyId:null,accountId:'',updatedAt:Date.now(),ready:false,lastBossHitAt:0,lastPvpHitAt:0
  };
  players.set(player.id,player);

  const helloTimer=setTimeout(()=>{if(!player.ready)ws.close(1008,'hello timeout');},8000);

  ws.on('message',(raw)=>{
    let msg;try{msg=JSON.parse(String(raw));}catch{return;}
    if(!player.ready){
      if(msg.type!=='hello')return;
      player.name=cleanName(msg.name);
      player.accountId=cleanAccountId(msg.accountId,player.name);
      const replaced=[...players.values()].filter(p=>p!==player&&p.ready&&p.accountId===player.accountId);
      for(const old of replaced){
        safeSend(old.ws,{type:'session:replaced',message:'같은 계정이 다른 기기에서 접속했습니다.'});
        setTimeout(()=>{try{old.ws.close(4001,'duplicate account session');}catch{}},80);
      }
      player.level=Math.floor(clamp(msg.level,1,100));
      player.weapon=Math.floor(clamp(msg.weapon,0,3));
      player.ready=true;
      clearTimeout(helloTimer);
      if(!worldLeaderId)worldLeaderId=player.id;
      safeSend(ws,{
        type:'hello:ok',
        selfId:player.id,
        world:{...WORLD,biomes:BIOMES,landmarks:LANDMARKS,hiddenItems:HIDDEN_ITEMS},
        players:[...players.values()].filter(p=>p.ready).map(publicPlayer),
        bosses:bossSnapshot(),
        worldRole:{leaderId:worldLeaderId,isLeader:player.id===worldLeaderId},
        worldSnapshot,
        takenItemIds:[...takenItems],
        partyMax:PARTY_MAX,
        bossRespawnMs:BOSS_RESPAWN_MS
      });
      broadcast({type:'player:join',player:publicPlayer(player)},ws);
      electWorldLeader();
      return;
    }
    handleMessage(player,msg);
  });

  ws.on('close',()=>{
    clearTimeout(helloTimer);
    leaveParty(player);
    players.delete(player.id);
    if(player.ready)broadcast({type:'player:leave',id:player.id});
    if(player.id===worldLeaderId)electWorldLeader();
  });
  ws.on('error',()=>{});
});

setInterval(()=>{
  const now=Date.now();
  for(const boss of bosses.values()){
    if(!boss.alive && boss.respawnAt<=now){
      boss.alive=true;
      boss.hp=boss.maxHp;
      boss.respawnAt=0;
      broadcast({type:'boss:respawn',boss:{
        id:boss.id,name:boss.name,x:boss.x,y:boss.y,hp:boss.hp,maxHp:boss.maxHp,alive:true,respawnInMs:0
      }});
    }
  }
  const snapshot=[...players.values()].filter(p=>p.ready).map(publicPlayer);
  broadcast({type:'players',players:snapshot,serverTime:now});
},TICK_MS);

server.listen(PORT,()=>{
  console.log('Echoes shared world server listening on',PORT);
});
