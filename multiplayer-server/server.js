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
  {id:'boss0',name:'고목의 수호자',x:4300,y:1250,maxHp:1200},
  {id:'boss1',name:'유리 날개의 수호자',x:8350,y:7850,maxHp:1500},
  {id:'boss2',name:'불씨의 수호자',x:11250,y:2550,maxHp:1850},
  {id:'boss3',name:'빙정의 군주',x:15400,y:1550,maxHp:2500},
  {id:'boss4',name:'적월 포식자',x:18100,y:8350,maxHp:3200},
  {id:'boss5',name:'별의 종언자',x:20500,y:3850,maxHp:3900}
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

function id(prefix='p'){return prefix + crypto.randomBytes(5).toString('hex');}
function cleanName(v){
  return String(v||'Player').replace(/[<>]/g,'').trim().slice(0,20) || 'Player';
}
function clamp(v,a,b){v=Number(v);return Number.isFinite(v)?Math.max(a,Math.min(b,v)):a;}
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
    player.updatedAt=Date.now();
    return;
  }
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
    res.end(JSON.stringify({ok:true,players:players.size,parties:parties.size,bosses:bossSnapshot(),world:WORLD}));
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
    level:1,weapon:0,partyId:null,updatedAt:Date.now(),ready:false,lastBossHitAt:0
  };
  players.set(player.id,player);

  const helloTimer=setTimeout(()=>{if(!player.ready)ws.close(1008,'hello timeout');},8000);

  ws.on('message',(raw)=>{
    let msg;try{msg=JSON.parse(String(raw));}catch{return;}
    if(!player.ready){
      if(msg.type!=='hello')return;
      player.name=cleanName(msg.name);
      player.level=Math.floor(clamp(msg.level,1,100));
      player.weapon=Math.floor(clamp(msg.weapon,0,3));
      player.ready=true;
      clearTimeout(helloTimer);
      safeSend(ws,{
        type:'hello:ok',
        selfId:player.id,
        world:{...WORLD,biomes:BIOMES,landmarks:LANDMARKS,hiddenItems:HIDDEN_ITEMS},
        players:[...players.values()].filter(p=>p.ready).map(publicPlayer),
        bosses:bossSnapshot(),
        partyMax:PARTY_MAX,
        bossRespawnMs:BOSS_RESPAWN_MS
      });
      broadcast({type:'player:join',player:publicPlayer(player)},ws);
      return;
    }
    handleMessage(player,msg);
  });

  ws.on('close',()=>{
    clearTimeout(helloTimer);
    leaveParty(player);
    players.delete(player.id);
    if(player.ready)broadcast({type:'player:leave',id:player.id});
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
