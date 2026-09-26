import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'node:crypto';
import { forceMob, advanceMobControl } from './mob-control.js';
import { createWorldCombat } from './world-combat.js';

const PORT = Number(process.env.PORT || 8787);
const TICK_MS = 1000;
const PARTY_MAX = 4;
const BOSS_RESPAWN_MS = 3 * 60 * 1000;
const PVP_RULESET = 'world-combat-20260926-3';

const SIM_TICK_MS = 25;
const MOB_NET_TICK_MS = 50;
const PLAYER_LIST_MS = 1000;
const NORMAL_MOB_RESPAWN_MS = 160 * 1000;
const MAX_SOCKET_BUFFER = 64 * 1024;
const SPAWN_LAYOUT_VERSION = 'regional-clusters-v2-leash';
const MOB_TYPES = {
  sprout:{speed:77,damage:13,reach:66,wind:.8,kind:'melee',r:18},wolf:{speed:127,damage:18,reach:155,wind:.8,kind:'charge',r:18},
  sentry:{speed:65,damage:16,reach:360,wind:1.05,kind:'ranged',r:18},golem:{speed:55,damage:27,reach:116,wind:1.2,kind:'slam',r:26},
  wisp:{speed:85,damage:17,reach:315,wind:1,kind:'ranged',r:16},shade:{speed:115,damage:21,reach:116,wind:.75,kind:'melee',r:19},
  frostling:{speed:105,damage:24,reach:92,wind:.72,kind:'melee',r:18},shardStalker:{speed:142,damage:29,reach:180,wind:.82,kind:'charge',r:20},
  crystalMage:{speed:72,damage:27,reach:390,wind:.96,kind:'ranged',r:18},abyssHound:{speed:151,damage:34,reach:190,wind:.75,kind:'charge',r:20},
  bloodWisp:{speed:91,damage:32,reach:420,wind:.9,kind:'ranged',r:18},voidKnight:{speed:92,damage:39,reach:125,wind:.82,kind:'slam',r:23},
  forestBoss:{speed:62,damage:28,reach:210,wind:1.1,kind:'boss',r:40},marshBoss:{speed:92,damage:27,reach:240,wind:1,kind:'boss',r:35},
  plateauBoss:{speed:70,damage:34,reach:230,wind:1.1,kind:'boss',r:41},frostBoss:{speed:84,damage:39,reach:250,wind:.95,kind:'boss',r:43},
  abyssBoss:{speed:98,damage:45,reach:260,wind:.88,kind:'boss',r:45},finalBoss:{speed:90,damage:50,reach:275,wind:.86,kind:'boss',r:48}
};
const BOSS_ATTACKS = {
  forestBoss:['roots','melee','branches','roots'],marshBoss:['ranged','tide','rain','tide'],plateauBoss:['charge','fissure','slam','charge'],
  frostBoss:['iceLance','shardRing','frostLine','iceLance'],abyssBoss:['bloodRain','gravityWell','voidVolley','bloodRain'],finalBoss:['constellation','starfall','cross','charge']
};

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
// Future regional overrides can be added here: safe | combat | pvp.
const WORLD_COMBAT_POLICY={enabled:true,defaultMode:'combat',zones:SAFE_ZONES.map(z=>({...z,mode:'safe'}))};
function worldCombatModeAt(x,y){return WORLD_COMBAT_POLICY.zones.find(z=>Math.hypot(x-z.x,y-z.y)<z.r)?.mode||WORLD_COMBAT_POLICY.defaultMode;}
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
const pvpMatchQueue=[];
let worldLeaderId=null;
let worldRevision=0;
let worldSnapshot={mobs:[],items:[],updatedAt:0,revision:0};
const takenItems=new Set();
const authoritativeMobs=new Map();
const dirtyMobIds=new Set();
const navGrid=new Map();
let mobsBootstrapped=false;
let lastMobNetFlush=0;

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
  const next=[...players.values()].find(p=>p.ready&&p.clientMode!=='pvp'),nextId=next?.id||null;if(nextId===worldLeaderId)return;worldLeaderId=nextId;
  for(const p of players.values())if(p.ready&&p.clientMode!=='pvp')safeSend(p.ws,{type:'world:role',leaderId:worldLeaderId,isLeader:p.id===worldLeaderId,serverAuthority:true});
}
function safeSend(ws,data,{volatile=false}={}){
  if(ws.readyState!==WebSocket.OPEN)return false;if(volatile&&Number(ws.bufferedAmount||0)>MAX_SOCKET_BUFFER)return false;
  try{ws.send(JSON.stringify(data));return true;}catch{return false;}
}
function broadcast(data,except=null,{volatile=false}={}){
  const text=JSON.stringify(data),origin=data.player||data.fx||(['skill:fx','skill:effects'].includes(data.type)?data:null),interest=['player:state','skill:fx','skill:effects','world:combatResult'].includes(data.type);for(const p of players.values()){if(interest&&origin&&Number.isFinite(origin.x)&&Math.hypot(p.x-origin.x,p.y-origin.y)>2200&&p.id!==data.attackerId&&p.id!==data.targetId)continue;if(p.clientMode==='pvp'||p.ws===except||p.ws.readyState!==WebSocket.OPEN)continue;if(volatile&&Number(p.ws.bufferedAmount||0)>MAX_SOCKET_BUFFER)continue;try{p.ws.send(text);}catch{}}
}
function removePvpMatchQueue(player,notify=false){
  if(!player)return false;let removed=false;
  for(let i=pvpMatchQueue.length-1;i>=0;i--)if(pvpMatchQueue[i]===player.id){pvpMatchQueue.splice(i,1);removed=true;}
  player.pvpQueued=false;
  if(notify&&player.ws?.readyState===WebSocket.OPEN)safeSend(player.ws,{type:'pvp:matchStatus',queued:false,count:pvpMatchQueue.length});
  return removed;
}
function joinPvpMatchQueue(player){
  if(!player?.ready||player.ws?.readyState!==WebSocket.OPEN)return;
  removePvpMatchQueue(player,false);
  if(!player.pvpRuleset){
    safeSend(player.ws,{type:'pvp:matchStatus',queued:false,count:pvpMatchQueue.length,error:'missing-ruleset'});
    safeSend(player.ws,{type:'notice',message:'PVP 전투 규칙 정보를 불러오지 못했습니다. 페이지를 새로고침해 주세요.'});
    return;
  }
  let rival=null,checks=pvpMatchQueue.length;
  while(checks-->0&&pvpMatchQueue.length){
    const id=pvpMatchQueue.shift(),candidate=players.get(id);
    if(!candidate||candidate===player||!candidate.ready||!candidate.pvpQueued||candidate.ws.readyState!==WebSocket.OPEN)continue;
    if(candidate.accountId&&player.accountId&&candidate.accountId===player.accountId){candidate.pvpQueued=false;continue;}
    if(candidate.pvpRuleset!==player.pvpRuleset){pvpMatchQueue.push(candidate.id);continue;}
    rival=candidate;break;
  }
  if(!rival){
    player.pvpQueued=true;player.pvpQueuedAt=Date.now();pvpMatchQueue.push(player.id);
    safeSend(player.ws,{type:'pvp:matchStatus',queued:true,count:pvpMatchQueue.length,startedAt:player.pvpQueuedAt,ruleset:player.pvpRuleset});
    return;
  }
  player.pvpQueued=false;rival.pvpQueued=false;
  const matchId=crypto.randomBytes(6).toString('hex'),peerId='echoes-pvp-auto-'+matchId;
  safeSend(rival.ws,{type:'pvp:matchFound',matchId,peerId,role:'host',ruleset:player.pvpRuleset,opponent:{id:player.id,name:player.name,level:player.level}});
  safeSend(player.ws,{type:'pvp:matchFound',matchId,peerId,role:'guest',ruleset:player.pvpRuleset,opponent:{id:rival.id,name:rival.name,level:rival.level}});
  console.log('[pvp-match]',rival.id,'vs',player.id,matchId,'ruleset',player.pvpRuleset);
}
function publicPlayer(p){
  return {
    ...worldCombat.snapshot(p),
    id:p.id,name:p.name,x:p.x,y:p.y,a:p.a,
    hp:p.hp,maxHp:p.maxHp,level:p.level,weapon:p.weapon,
    swordStyle:p.swordStyle||'',swordSkills:Array.isArray(p.swordSkills)?p.swordSkills.slice(0,5):[],
    equippedHead:p.equippedHead,equippedChest:p.equippedChest,equippedShield:p.equippedShield,
    attackAnim:p.attackAnim,attackDuration:p.attackDuration,strikePose:p.strikePose,skillPose:p.skillPose,
    combo:p.combo,parry:p.parry,dodge:p.dodge,dx:p.dx,dy:p.dy,walk:p.walk,phase:p.phase,
    deathSeq:p.deathSeq||0,skillFxSeq:p.skillFxSeq||0,skillFxSlot:p.skillFxSlot||0,skillFxId:p.skillFxId||'',skillFxWeapon:p.skillFxWeapon||0,skillFxX:p.skillFxX,skillFxY:p.skillFxY,skillFxA:p.skillFxA,
    vx:p.vx||0,vy:p.vy||0,seq:p.seq||0,
    partyId:p.partyId||null,updatedAt:p.updatedAt
  };
}
function publicPlayerState(p){
  return {
    ...worldCombat.snapshot(p),
    id:p.id,x:p.x,y:p.y,a:p.a,hp:p.hp,maxHp:p.maxHp,weapon:p.weapon,swordStyle:p.swordStyle||'',swordSkills:p.swordSkills||[],
    attackAnim:p.attackAnim,attackDuration:p.attackDuration,strikePose:p.strikePose,skillPose:p.skillPose,
    combo:p.combo,parry:p.parry,dodge:p.dodge,stun:p.stun||0,dx:p.dx,dy:p.dy,walk:p.walk,phase:p.phase,
    deathSeq:p.deathSeq||0,skillFxSeq:p.skillFxSeq||0,skillFxSlot:p.skillFxSlot||0,skillFxId:p.skillFxId||'',skillFxWeapon:p.skillFxWeapon||0,skillFxX:p.skillFxX,skillFxY:p.skillFxY,skillFxA:p.skillFxA,
    vx:p.vx||0,vy:p.vy||0,seq:p.seq||0,updatedAt:p.updatedAt
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

function navKey(x,y){return Math.floor(x/240)+','+Math.floor(y/240);}
function addNavObstacle(o){const key=navKey(o.x,o.y);if(!navGrid.has(key))navGrid.set(key,[]);navGrid.get(key).push(o);}
function serverSolidAt(x,y,r=18){
  if(x<45+r||y<45+r||x>WORLD.width-45-r||y>WORLD.height-45-r)return true;
  if(Math.hypot(x-690,y-2880)<39+r)return true;
  for(let gy=Math.floor((y-r-120)/240);gy<=Math.floor((y+r+120)/240);gy++)for(let gx=Math.floor((x-r-120)/240);gx<=Math.floor((x+r+120)/240);gx++){
    const list=navGrid.get(gx+','+gy);if(!list)continue;
    for(const o of list){if(o.ellipse){if(((x-o.x)/(o.rx+r))**2+((y-o.y)/(o.ry+r))**2<1)return true;}else if(o.box){if(Math.abs(x-o.x)<o.w/2+r&&Math.abs(y-o.y)<o.h/2+r)return true;}else if(Math.hypot(x-o.x,y-o.y)<(o.r||18)+r)return true;}
  }return false;
}
function moveServerMob(m,dx,dy){
  const len=Math.hypot(dx,dy);if(len<.0001)return false;const steps=Math.max(1,Math.ceil(len/10)),sx=dx/steps,sy=dy/steps;let moved=false;
  for(let i=0;i<steps;i++){const nx=m.x+sx,ny=m.y+sy;if(!serverSolidAt(nx,ny,m.r)){m.x=nx;m.y=ny;moved=true;continue;}if(!serverSolidAt(nx,m.y,m.r)){m.x=nx;moved=true;}if(!serverSolidAt(m.x,ny,m.r)){m.y=ny;moved=true;}}
  return moved;
}
function mobPublic(m){const now=Date.now(),timer=m.state==='windup'?Math.max(0,(m.attackAt-now)/1000):m.state==='recover'?Math.max(0,(m.recoverUntil-now)/1000):m.state==='charge'?Math.max(0,(m.chargeUntil-now)/1000):0;return {stun:Math.max(0,((m.stunUntil||0)-now)/1000),forceMove:m.forceMove?{...m.forceMove,elapsed:(now-m.forceMove.startedAt)/1000}:null,id:m.id,type:m.type,x:Math.round(m.x*10)/10,y:Math.round(m.y*10)/10,hp:Math.max(0,Math.round(m.hp)),maxHp:Math.max(1,Math.round(m.maxHp)),dead:!!m.dead,state:m.state||'idle',facing:Math.round((m.facing||0)*100)/100,alert:!!m.alert,targetId:m.targetId||null,attackType:m.attackType||m.kind||'melee',timer,windTotal:m.state==='windup'?Math.max(timer,m.wind||.5):0,locked:Number.isFinite(m.locked)?m.locked:(m.facing||0),range:mobAttackRange(m)};}
function mobSnapshot(){return [...authoritativeMobs.values()].map(mobPublic);}
function serverWorldSnapshot(){return {ready:mobsBootstrapped,mobs:mobSnapshot(),items:worldSnapshot.items||[],updatedAt:Date.now(),revision:worldRevision};}
function markMobDirty(m){if(m?.id)dirtyMobIds.add(m.id);}
function syncBossMob(boss){const m=authoritativeMobs.get(boss.id);if(!m)return;m.hp=boss.hp;m.maxHp=boss.maxHp;m.dead=!boss.alive;m.respawnAt=boss.respawnAt||0;if(m.dead){m.state='dead';m.targetId=null;m.alert=false;}else if(m.state==='dead'){m.state='idle';m.x=m.sx;m.y=m.sy;}markMobDirty(m);}
function bootstrapAuthoritativeWorld(player,msg){
  if(mobsBootstrapped&&authoritativeMobs.size){safeSend(player.ws,{type:'world:snapshot',snapshot:serverWorldSnapshot()});return;}
  if(String(msg.spawnLayoutVersion||'')!==SPAWN_LAYOUT_VERSION){safeSend(player.ws,{type:'notice',message:'몬스터 스폰 배치가 업데이트되었습니다. 게임 페이지를 새로고침해 주세요.'});return;}
  const list=Array.isArray(msg.mobs)?msg.mobs.slice(0,900):[];if(!list.length)return;authoritativeMobs.clear();navGrid.clear();
  for(const raw of list){
    const id=String(raw.id||'').slice(0,50),type=String(raw.type||'').slice(0,40),def=MOB_TYPES[type];if(!id||!def||type==='dummy'||id.startsWith('rift_'))continue;
    const boss=bosses.get(id),maxHp=boss?boss.maxHp:clamp(raw.maxHp,1,9999999),hp=boss?boss.hp:clamp(raw.hp,0,maxHp),x=clamp(raw.x,50,WORLD.width-50),y=clamp(raw.y,50,WORLD.height-50);
    const m={id,type,x,y,sx:x,sy:y,hp,maxHp,dead:boss?!boss.alive:!!raw.dead,state:raw.dead?'dead':'idle',facing:clamp(raw.facing,-20,20),alert:false,targetId:null,provokedBy:null,attackType:def.kind,
      speed:clamp(raw.speed,10,900)||def.speed,damage:clamp(raw.damage,0,5000)||def.damage,reach:clamp(raw.reach,40,900)||def.reach,wind:clamp(raw.wind,.1,4)||def.wind,kind:def.kind,r:clamp(raw.r,8,80)||def.r,
      attackAt:0,recoverUntil:0,chargeUntil:0,chargeHit:false,locked:0,stunUntil:0,respawnAt:0,pattern:0,knockVX:0,knockVY:0,lastAttackAt:0,spawnZone:String(raw.spawnZone||'').slice(0,40),spawnZoneX:Number.isFinite(Number(raw.spawnZoneX))?clamp(raw.spawnZoneX,50,WORLD.width-50):x,spawnZoneY:Number.isFinite(Number(raw.spawnZoneY))?clamp(raw.spawnZoneY,50,WORLD.height-50):y,spawnZoneRadius:clamp(raw.spawnZoneRadius,0,1200)};
    if(m.dead)m.respawnAt=Date.now()+(boss?Math.max(0,boss.respawnAt-Date.now()):NORMAL_MOB_RESPAWN_MS);authoritativeMobs.set(id,m);markMobDirty(m);
  }
  const nav=Array.isArray(msg.obstacles)?msg.obstacles.slice(0,2200):[];
  for(const raw of nav){const x=Number(raw.x),y=Number(raw.y);if(!Number.isFinite(x)||!Number.isFinite(y))continue;const o={x:clamp(x,0,WORLD.width),y:clamp(y,0,WORLD.height),box:!!raw.box,ellipse:!!raw.ellipse};if(o.ellipse){o.rx=clamp(raw.rx,8,1400);o.ry=clamp(raw.ry,8,1400);}else if(o.box){o.w=clamp(raw.w,8,800);o.h=clamp(raw.h,8,800);}else o.r=clamp(raw.r,4,120);addNavObstacle(o);}
  mobsBootstrapped=authoritativeMobs.size>0;worldRevision++;worldSnapshot.updatedAt=Date.now();worldSnapshot.revision=worldRevision;broadcast({type:'world:snapshot',snapshot:serverWorldSnapshot()});console.log('[world-bootstrap]',player.id,'layout',SPAWN_LAYOUT_VERSION,'mobs',authoritativeMobs.size,'nav',nav.length);
}
function validMobTarget(m,p){return !!p?.ready&&p.clientMode!=='pvp'&&p.hp>0&&(m.kind==='boss'||!safeZoneAt(p.x,p.y));}
function mobAggroGroupKey(m){if(m.kind==='boss')return 'boss:'+m.id;const zone=String(m.spawnZone||'');return !zone||zone==='lone'?'mob:'+m.id:'zone:'+zone;}
function ambientAggroKey(m,playerId){return mobAggroGroupKey(m)+'|'+playerId;}
function buildAmbientAggroSelections(){
  const selected=new Map(),best=new Map();
  // Keep one already-engaged monster per spawn group/player so aggro does not jump around every tick.
  for(const m of authoritativeMobs.values()){
    if(m.dead||m.kind==='boss'||m.provokedBy||!m.targetId)continue;
    const p=players.get(m.targetId);if(!validMobTarget(m,p)||Math.hypot(p.x-m.x,p.y-m.y)>1150)continue;
    const key=ambientAggroKey(m,p.id),d=Math.hypot(p.x-m.x,p.y-m.y),prev=selected.get(key);
    if(!prev||d<prev.d)selected.set(key,{mobId:m.id,d});
  }
  // If nobody from the group is engaged yet, choose only the nearest monster in that group.
  for(const p of players.values()){
    if(!p.ready||p.hp<=0)continue;
    for(const m of authoritativeMobs.values()){
      if(m.dead||m.kind==='boss'||m.provokedBy||!validMobTarget(m,p))continue;
      const d=Math.hypot(p.x-m.x,p.y-m.y);if(d>=720)continue;
      const key=ambientAggroKey(m,p.id);if(selected.has(key))continue;
      const prev=best.get(key);if(!prev||d<prev.d)best.set(key,{mobId:m.id,d});
    }
  }
  for(const [key,v] of best)if(!selected.has(key))selected.set(key,v);
  return new Map([...selected].map(([key,v])=>[key,v.mobId]));
}
function nearestMobTarget(m,ambientSelections=null){let best=null,bestD=m.kind==='boss'?900:720;for(const p of players.values()){if(!validMobTarget(m,p))continue;if(m.kind!=='boss'&&ambientSelections&&ambientSelections.get(ambientAggroKey(m,p.id))!==m.id)continue;const d=Math.hypot(p.x-m.x,p.y-m.y);if(d<bestD){best=p;bestD=d;}}return best;}
function mobAttackRange(m){if(m.kind==='ranged')return Math.max(220,m.reach||320);if(m.kind==='charge')return Math.max(130,Math.min(210,m.reach||170));if(m.kind==='boss')return Math.max(180,Math.min(280,m.reach||220));return Math.max(75,m.reach||90);}
function chooseBossAttack(m){const list=BOSS_ATTACKS[m.type];if(!list?.length)return 'melee';const t=list[m.pattern%list.length];m.pattern++;return t;}
function sendMobAttack(m,target){
  if(!target||!validMobTarget(m,target))return;
  const dx=target.x-m.x,dy=target.y-m.y,dist=Math.hypot(dx,dy),range=mobAttackRange(m),attackType=m.attackType||m.kind;
  let kind=m.kind,allowed=m.kind==='ranged'?range+80:range+55;
  if(m.kind==='boss'){
    const direct=attackType==='melee'||attackType==='slam'||attackType==='charge';
    if(!direct){kind='ranged';allowed=range+180;}
    else{
      allowed=attackType==='charge'?m.r+42:range+35;
      const targetAngle=Math.atan2(dy,dx),diff=Math.abs(((targetAngle-m.facing+Math.PI*3)%(Math.PI*2))-Math.PI);
      if(attackType!=='charge'&&diff>1.25)return;
    }
  }
  if(dist>allowed)return;
  broadcast({type:'world:mobAttack',mobId:m.id,mobType:m.type,targetId:target.id,damage:m.damage,x:m.x,y:m.y,tx:target.x,ty:target.y,facing:m.facing,kind,attackType,serverTime:Date.now()},null,{volatile:true});
}
function respawnMob(m,now){m.dead=false;m.hp=m.maxHp;m.x=m.sx;m.y=m.sy;m.state='idle';m.alert=false;m.targetId=null;m.provokedBy=null;m.attackAt=0;m.recoverUntil=0;m.chargeUntil=0;m.stunUntil=0;m.respawnAt=0;m.knockVX=0;m.knockVY=0;m.forceMove=null;const b=bosses.get(m.id);if(b){b.alive=true;b.hp=b.maxHp;b.respawnAt=0;broadcast({type:'boss:respawn',boss:{id:b.id,name:b.name,x:b.x,y:b.y,hp:b.hp,maxHp:b.maxHp,alive:true,respawnInMs:0}});}markMobDirty(m);}
function simulateMob(m,dt,now,ambientSelections){
  if(m.dead){if(m.respawnAt&&now>=m.respawnAt)respawnMob(m,now);return;}
  if(advanceMobControl(m,now,moveServerMob)){m.state='stunned';markMobDirty(m);return;}
  if(now<m.stunUntil){if(m.state!=='stunned'){m.state='stunned';markMobDirty(m);}return;}
  if(m.kind!=='boss'){
    const cx=Number.isFinite(m.spawnZoneX)?m.spawnZoneX:m.sx,cy=Number.isFinite(m.spawnZoneY)?m.spawnZoneY:m.sy,baseR=m.spawnZoneRadius>0?m.spawnZoneRadius:430,leash=baseR+(m.spawnZone==='lone'?220:300),zoneDist=Math.hypot(m.x-cx,m.y-cy);
    if(zoneDist>leash){m.targetId=null;m.provokedBy=null;m.alert=false;m.attackAt=0;m.chargeUntil=0;m.recoverUntil=0;m.state='return';const hd=Math.hypot(m.sx-m.x,m.sy-m.y);if(hd>16){const a=Math.atan2(m.sy-m.y,m.sx-m.x);m.facing=a;if(moveServerMob(m,Math.cos(a)*m.speed*1.55*dt,Math.sin(a)*m.speed*1.55*dt))markMobDirty(m);}else{m.state='idle';markMobDirty(m);}return;}
  }
  if(now<m.stunUntil){if(m.state!=='stunned'){m.state='stunned';markMobDirty(m);}return;}
  if(Math.abs(m.knockVX)+Math.abs(m.knockVY)>2){if(moveServerMob(m,m.knockVX*dt,m.knockVY*dt))markMobDirty(m);const decay=Math.exp(-dt*9);m.knockVX*=decay;m.knockVY*=decay;}
  let target=null;
  if(m.kind==='boss'){
    target=m.targetId?players.get(m.targetId):null;if(!validMobTarget(m,target)||Math.hypot(target.x-m.x,target.y-m.y)>1150)target=null;if(!target)target=nearestMobTarget(m,null);
  }else if(m.provokedBy){
    target=players.get(m.provokedBy);if(!validMobTarget(m,target)||Math.hypot(target.x-m.x,target.y-m.y)>1150){m.provokedBy=null;target=null;}
  }else{
    target=m.targetId?players.get(m.targetId):null;
    if(!validMobTarget(m,target)||Math.hypot(target.x-m.x,target.y-m.y)>1150||ambientSelections?.get(ambientAggroKey(m,target.id))!==m.id)target=null;
    if(!target)target=nearestMobTarget(m,ambientSelections);
  }
  if(!target){m.targetId=null;m.alert=false;const hd=Math.hypot(m.sx-m.x,m.sy-m.y);if(hd>18){const a=Math.atan2(m.sy-m.y,m.sx-m.x);m.facing=a;m.state='return';if(moveServerMob(m,Math.cos(a)*m.speed*1.15*dt,Math.sin(a)*m.speed*1.15*dt))markMobDirty(m);}else if(m.state!=='idle'){m.state='idle';markMobDirty(m);}return;}
  if(m.targetId!==target.id){m.targetId=target.id;m.alert=true;markMobDirty(m);}const dx=target.x-m.x,dy=target.y-m.y,d=Math.hypot(dx,dy)||1,a=Math.atan2(dy,dx);m.facing=a;m.alert=true;
  if(m.state==='charge'){if(now<m.chargeUntil){const speed=m.kind==='boss'?620:(m.type==='abyssHound'?560:m.type==='shardStalker'?520:470);if(moveServerMob(m,Math.cos(m.locked)*speed*dt,Math.sin(m.locked)*speed*dt))markMobDirty(m);if(!m.chargeHit&&Math.hypot(target.x-m.x,target.y-m.y)<m.r+34){sendMobAttack(m,target);m.chargeHit=true;}return;}m.state='recover';m.recoverUntil=now+650;markMobDirty(m);return;}
  if(m.state==='windup'){if(now>=m.attackAt){if(m.kind==='charge'||m.attackType==='charge'){m.state='charge';m.chargeUntil=now+420;m.chargeHit=false;}else{sendMobAttack(m,target);m.state='recover';m.recoverUntil=now+(m.kind==='boss'?760:520);}markMobDirty(m);}return;}
  if(now<m.recoverUntil){if(m.state!=='recover'){m.state='recover';markMobDirty(m);}return;}
  const range=mobAttackRange(m);if(d<=range&&now-m.lastAttackAt>Math.max(450,m.wind*1000*.7)){m.state='windup';m.attackType=m.kind==='boss'?chooseBossAttack(m):m.kind;m.locked=a;m.attackAt=now+Math.max(260,m.wind*1000);m.lastAttackAt=now;markMobDirty(m);return;}
  m.state='chase';let dir=1;if(m.kind==='ranged'&&d<range*.55)dir=-1;else if(m.kind==='ranged'&&d<range*.82)dir=0;if(dir&&moveServerMob(m,Math.cos(a)*m.speed*dir*dt,Math.sin(a)*m.speed*dir*dt))markMobDirty(m);
}
function simulateWorld(now=Date.now()){if(!mobsBootstrapped)return;const dt=SIM_TICK_MS/1000,ambientSelections=buildAmbientAggroSelections();for(const m of authoritativeMobs.values())simulateMob(m,dt,now,ambientSelections);}
function flushMobDeltas(now=Date.now()){if(!dirtyMobIds.size)return;const mobs=[];for(const id of dirtyMobIds){const m=authoritativeMobs.get(id);if(m)mobs.push(mobPublic(m));}dirtyMobIds.clear();if(!mobs.length)return;worldRevision++;worldSnapshot.updatedAt=now;worldSnapshot.revision=worldRevision;broadcast({type:'world:mobsDelta',mobs,serverTime:now,revision:worldRevision},null,{volatile:true});}

function handleBossDamage(player,msg){
  const boss=bosses.get(String(msg.bossId||''));if(!boss||!boss.alive)return;const now=Date.now(),damage=clamp(msg.damage,0,1200),stun=clamp(msg.stun,0,2.5),kx=clamp(msg.knockbackX,-180,180),ky=clamp(msg.knockbackY,-180,180);
  if(damage<=0&&stun<=0&&!kx&&!ky)return;if(damage>0){if(now-(player.lastBossHitAt||0)<25)return;player.lastBossHitAt=now;boss.hp=Math.max(0,boss.hp-damage);boss.lastHitAt=now;}
  const m=authoritativeMobs.get(boss.id);if(m){if(stun>0)m.stunUntil=Math.max(m.stunUntil||0,now+stun*1000);if(kx||ky){moveServerMob(m,kx,ky);m.knockVX=clamp(kx*7,-900,900);m.knockVY=clamp(ky*7,-900,900);}}
  if(boss.hp<=0){boss.alive=false;boss.respawnAt=now+BOSS_RESPAWN_MS;broadcast({type:'boss:defeated',boss:{...boss,respawnInMs:BOSS_RESPAWN_MS},killerId:player.id,partyId:player.partyId||null});}
  syncBossMob(boss);broadcast({type:'boss:update',boss:{id:boss.id,name:boss.name,x:boss.x,y:boss.y,hp:boss.hp,maxHp:boss.maxHp,alive:boss.alive,respawnInMs:boss.alive?0:Math.max(0,boss.respawnAt-now)}});
}
function sanitizeWorldSnapshot(msg){
  const mobs=Array.isArray(msg.mobs)?msg.mobs.slice(0,500).map(m=>({
    id:String(m.id||'').slice(0,50),type:String(m.type||'').slice(0,40),
    x:clamp(m.x,0,WORLD.width),y:clamp(m.y,0,WORLD.height),
    hp:clamp(m.hp,0,9999999),maxHp:clamp(m.maxHp,1,9999999),
    dead:!!m.dead,state:String(m.state||'idle').slice(0,20),
    facing:clamp(m.facing,-20,20),alert:!!m.alert
  })).filter(m=>m.id):worldSnapshot.mobs;
  const items=Array.isArray(msg.items)?msg.items.slice(0,2200).map(o=>({
    id:String(o.id||'').slice(0,70),type:String(o.type||'').slice(0,30),
    x:clamp(o.x,0,WORLD.width),y:clamp(o.y,0,WORLD.height),
    lootKind:String(o.lootKind||'').slice(0,30),amount:clamp(o.amount,0,999999),fixed:!!o.fixed
  })).filter(o=>o.id&&!takenItems.has(o.id)):worldSnapshot.items;
  return {mobs,items,updatedAt:Date.now()};
}
function handleWorldSnapshot(player,msg){if(player.id!==worldLeaderId)return;const clean=sanitizeWorldSnapshot({items:msg.items});worldSnapshot.items=clean.items;worldSnapshot.updatedAt=Date.now();worldSnapshot.revision=++worldRevision;broadcast({type:'world:snapshot',snapshot:serverWorldSnapshot()});}
function handleWorldMobDelta(player,msg){if(msg?.mobs?.length)safeSend(player.ws,{type:'world:authority',serverAuthority:true});}
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
  const mobId=String(msg.mobId||'').slice(0,50),mob=authoritativeMobs.get(mobId);if(!mob||mob.dead||mob.kind==='boss')return;if(Math.hypot(player.x-mob.x,player.y-mob.y)>1100)return;
  const now=Date.now(),wasPassive=!mob.alert||!mob.targetId||mob.state==='idle'||mob.state==='return',damage=clamp(msg.damage,0,1800),stun=clamp(msg.stun,0,2.5),kx=clamp(msg.knockbackX,-720,720),ky=clamp(msg.knockbackY,-720,720);if(damage<=0&&stun<=0&&!kx&&!ky)return;
  if(damage>0){player.mobHitTimes??=new Map();if(now-(player.mobHitTimes.get(mobId)||0)<18)return;player.mobHitTimes.set(mobId,now);mob.hp=Math.max(0,mob.hp-damage);}if(stun>0)mob.stunUntil=Math.max(mob.stunUntil||0,now+stun*1000);
  if(stun>0){mob.state='stunned';mob.attackAt=0;mob.chargeUntil=0;mob.recoverUntil=0;}
  if(kx||ky)forceMob(mob,kx,ky,now,Number(msg.duration)||.28,moveServerMob);
  if(mob.hp<=0){mob.dead=true;mob.hp=0;mob.forceMove=null;mob.state='dead';mob.targetId=null;mob.provokedBy=null;mob.alert=false;mob.respawnAt=now+NORMAL_MOB_RESPAWN_MS;}
  else if(wasPassive&&validMobTarget(mob,player)){mob.provokedBy=player.id;mob.targetId=player.id;mob.alert=true;if(now>=mob.stunUntil)mob.state='chase';}
  markMobDirty(mob);broadcast({type:'world:mobPatch',mob:{...mobPublic(mob),damage,by:player.id,respawnAt:mob.respawnAt||0}});
}
function handleMessage(player,msg){
  if(!msg||typeof msg!=='object')return;
  if(msg.type==='pvp:matchJoin'){joinPvpMatchQueue(player);return;}
  if(msg.type==='pvp:matchCancel'){removePvpMatchQueue(player,true);return;}
  if(msg.type==='world:teleport')msg={...msg,type:'state',teleport:true};
  if(msg.type==='world:combat'){worldCombat.handle(player,msg);return;}
  // Retire the three competing legacy damage/control paths for world clients.
  if(['pvp:damage','pvp:hit','pvp:control'].includes(msg.type))return;
  if(msg.type==='state'){
    if(player.clientMode==='pvp')return;
    msg=worldCombat.ingest(player,msg);if(!msg)return;
    const now=Date.now(),oldX=player.x,oldY=player.y,elapsed=Math.max(.016,Math.min(.5,(now-(player.lastStateAt||now-50))/1000));
    if(Number.isFinite(Number(msg.x)))player.x=clamp(msg.x,40,WORLD.width-40);if(Number.isFinite(Number(msg.y)))player.y=clamp(msg.y,40,WORLD.height-40);if(Number.isFinite(Number(msg.a)))player.a=clamp(msg.a,-Math.PI*4,Math.PI*4);
    if(Number.isFinite(Number(msg.hp)))player.hp=clamp(msg.hp,0,999999);if(Number.isFinite(Number(msg.maxHp)))player.maxHp=clamp(msg.maxHp,1,999999);if(Number.isFinite(Number(msg.level)))player.level=Math.floor(clamp(msg.level,1,100));if(Number.isFinite(Number(msg.weapon)))player.weapon=Math.floor(clamp(msg.weapon,0,4));
    if(msg.swordStyle!==undefined)player.swordStyle=String(msg.swordStyle||'').slice(0,20);
    if(Array.isArray(msg.swordSkills))player.swordSkills=msg.swordSkills.slice(0,5).map(v=>String(v||'').slice(0,40));
    if(msg.equippedHead!==undefined)player.equippedHead=sanitizeEquip(msg.equippedHead,'wandererHood');if(msg.equippedChest!==undefined)player.equippedChest=sanitizeEquip(msg.equippedChest,'travelerCoat');if(msg.equippedShield!==undefined)player.equippedShield=sanitizeEquip(msg.equippedShield,'woodenShield');
    for(const k of ['attackAnim','attackDuration','strikePose','skillPose','combo','parry','dodge','stun','dx','dy','walk','phase'])if(Number.isFinite(Number(msg[k])))player[k]=Number(msg[k]);
    if(Number.isFinite(Number(msg.deathSeq)))player.deathSeq=Math.floor(clamp(msg.deathSeq,0,1e12));
    if(Number.isFinite(Number(msg.skillFxSeq))&&Number(msg.skillFxSeq)>=(player.skillFxSeq||0)){player.skillFxSeq=Math.floor(clamp(msg.skillFxSeq,0,1e12));player.skillFxSlot=Math.floor(clamp(msg.skillFxSlot,0,4));player.skillFxId=String(msg.skillFxId||'').slice(0,40);player.skillFxWeapon=Math.floor(clamp(msg.skillFxWeapon,0,4));player.skillFxX=clamp(Number(msg.skillFxX)||player.x,40,WORLD.width-40);player.skillFxY=clamp(Number(msg.skillFxY)||player.y,40,WORLD.height-40);player.skillFxA=clamp(Number(msg.skillFxA)||player.a,-Math.PI*4,Math.PI*4);}
    player.attackAnim=clamp(player.attackAnim,0,5);player.attackDuration=clamp(player.attackDuration,.05,5);player.strikePose=Math.floor(clamp(player.strikePose,0,8));player.skillPose=Math.floor(clamp(player.skillPose,-1,8));player.combo=Math.floor(clamp(player.combo,0,10));player.parry=clamp(player.parry,0,2);player.dodge=clamp(player.dodge,0,2);player.stun=clamp(player.stun||0,0,1.5);player.dx=clamp(player.dx,-1,1);player.dy=clamp(player.dy,-1,1);player.walk=clamp(player.walk,0,1);player.phase=clamp(player.phase,-1e6,1e6);
    player.vx=clamp(Number.isFinite(Number(msg.vx))?msg.vx:(player.x-oldX)/elapsed,-3000,3000);player.vy=clamp(Number.isFinite(Number(msg.vy))?msg.vy:(player.y-oldY)/elapsed,-3000,3000);player.seq=Math.max((player.seq||0)+1,Math.floor(clamp(msg.seq,0,1e12)));player.updatedAt=now;player.lastStateAt=now;
    const pub=publicPlayerState(player);safeSend(player.ws,{type:'player:self',player:pub,serverTime:now},{volatile:true});broadcast({type:'player:state',player:pub},player.ws,{volatile:true});return;
  }
  if(msg.type==='skill:effects'){
    const seq=Math.floor(clamp(msg.seq,0,1e12));if(seq<=(player.visualSeq||0))return;player.visualSeq=seq;
    const num=(v,min,max)=>clamp(Number(v)||0,min,max),effects=[];
    const projectiles=(Array.isArray(msg.projectiles)?msg.projectiles:[]).slice(0,24).flatMap(raw=>{
      if(!raw)return[];const x=Number(raw.x),y=Number(raw.y),vx=Number(raw.vx),vy=Number(raw.vy);if(![x,y,vx,vy].every(Number.isFinite))return[];
      return[{x:num(x,0,WORLD.width),y:num(y,0,WORLD.height),vx:num(vx,-3000,3000),vy:num(vy,-3000,3000),a:num(raw.a,-20,20),kind:String(raw.kind||'orb').slice(0,16),r:num(raw.r,2,24),t:num(raw.t,.05,2.5)}];
    });
    if(effects.length||projectiles.length)broadcast({type:'skill:effects',playerId:player.id,x:player.x,y:player.y,seq:Math.floor(clamp(msg.seq,0,1e12)),effects,projectiles,serverTime:Date.now()},player.ws,{volatile:true});
    return;
  }
  if(msg.type==='skill:fx'){
    const slot=Math.floor(clamp(msg.slot,0,4)),weapon=Math.floor(clamp(msg.weapon,0,4)),skillId=String(msg.skillId||'').slice(0,40),fxSeq=Math.max(player.skillFxSeq||0,Math.floor(clamp(msg.fxSeq,0,1e12)));
    const x=clamp(Number(msg.x)||player.x,40,WORLD.width-40),y=clamp(Number(msg.y)||player.y,40,WORLD.height-40),a=clamp(Number(msg.a)||0,-Math.PI*4,Math.PI*4);
    player.skillFxSeq=fxSeq;player.skillFxSlot=slot;player.skillFxId=skillId;player.skillFxWeapon=weapon;player.skillFxX=x;player.skillFxY=y;player.skillFxA=a;
    broadcast({type:'skill:fx',playerId:player.id,fxSeq,slot,skillId,weapon,x,y,a,serverTime:Date.now()},player.ws,{volatile:true});return;
  }
  if(msg.type==='world:bootstrap'){bootstrapAuthoritativeWorld(player,msg);return;}if(msg.type==='world:resync'){const now=Date.now();if(now-(player.lastWorldResyncAt||0)>900){player.lastWorldResyncAt=now;safeSend(player.ws,{type:'world:snapshot',snapshot:serverWorldSnapshot()});}return;}if(msg.type==='world:snapshot'){handleWorldSnapshot(player,msg);return;}if(msg.type==='world:mobsDelta'){handleWorldMobDelta(player,msg);return;}if(msg.type==='world:itemTaken'){handleItemTaken(player,msg);return;}if(msg.type==='world:itemSpawn'){handleItemSpawn(player,msg);return;}if(msg.type==='world:mobDamage'){handleMobDamage(player,msg);return;}if(msg.type==='world:mobCombat'){const seq=Number(msg.seq);if(!Number.isSafeInteger(seq)||seq<1||seq<=(player.mobCombatSeq||0))return;player.mobCombatSeq=seq;for(const e of (Array.isArray(msg.events)?msg.events:[]).slice(0,64))if(e&&typeof e==='object')handleMobDamage(player,e);return;}
  if(msg.type==='party:create'){createParty(player);return;}if(msg.type==='party:invite'){const r=inviteParty(player,msg.targetId);if(!r.ok)safeSend(player.ws,{type:'notice',message:r.message});return;}if(msg.type==='party:accept'){const r=acceptParty(player,msg.partyId);if(!r.ok)safeSend(player.ws,{type:'notice',message:r.message});return;}if(msg.type==='party:leave'){leaveParty(player);return;}if(msg.type==='boss:damage'){handleBossDamage(player,msg);return;}
  if(msg.type==='party:chat'){const party=parties.get(player.partyId);if(!party)return;const message=String(msg.message||'').trim().slice(0,120);if(!message)return;for(const pid of party.members){const target=players.get(pid);if(target)safeSend(target.ws,{type:'party:chat',fromId:player.id,fromName:player.name,message});}}
}
const worldCombat=createWorldCombat({players,send:safeSend,broadcast,publicState:publicPlayerState,safeZone:(x,y)=>!WORLD_COMBAT_POLICY.enabled||worldCombatModeAt(x,y)==='safe',clipTarget:(p,q)=>{const dx=q.x-p.x,dy=q.y-p.y,n=Math.max(1,Math.ceil(Math.hypot(dx,dy)/8));let last={x:p.x,y:p.y};for(let i=1;i<=n;i++){const x=p.x+dx*i/n,y=p.y+dy*i/n;if(serverSolidAt(x,y,15))break;last={x,y};}return last;},allowParty:(a,b)=>worldCombatModeAt(a.x,a.y)==='pvp'&&worldCombatModeAt(b.x,b.y)==='pvp',width:WORLD.width,height:WORLD.height});
setInterval(()=>worldCombat.tick(),50);
const server=http.createServer((req,res)=>{
  if(req.url==='/health'){
    res.writeHead(200,{'content-type':'application/json','access-control-allow-origin':'*'});
    res.end(JSON.stringify({ok:true,combatProtocol:1,mobCombatProtocol:1,players:players.size,worldPlayers:[...players.values()].filter(p=>p.ready&&p.clientMode!=='pvp').length,pvpQueue:pvpMatchQueue.length,pvpRuleset:PVP_RULESET,parties:parties.size,bosses:bossSnapshot(),world:WORLD,worldLeaderId,worldSnapshotUpdatedAt:worldSnapshot.updatedAt,worldRevision,authoritativeMobs:authoritativeMobs.size,serverAuthority:true}));
    return;
  }
  res.writeHead(200,{'content-type':'application/json','access-control-allow-origin':'*'});
  res.end(JSON.stringify({
    name:'Echoes Shared World Server',
    ok:true,
    players:players.size,
    world:WORLD,
    bossRespawnMinutes:BOSS_RESPAWN_MS/60000,
    pvpRuleset:PVP_RULESET
  }));
});

const wss=new WebSocketServer({server,maxPayload:512*1024});

wss.on('connection',(ws)=>{
  try{ws._socket?.setNoDelay(true);ws._socket?.setKeepAlive(true,20000);}catch{}
  ws.isAlive=true;ws.on('pong',()=>{ws.isAlive=true;});
  const player={
    id:id('p_'),ws,name:'Player',x:800,y:3100,a:0,hp:100,maxHp:100,
    level:1,weapon:0,equippedHead:'wandererHood',equippedChest:'travelerCoat',equippedShield:'woodenShield',
    attackAnim:0,attackDuration:.26,strikePose:0,skillPose:-1,combo:0,parry:0,dodge:0,dx:0,dy:0,walk:0,phase:0,
    vx:0,vy:0,seq:0,lastStateAt:Date.now(),
    partyId:null,accountId:'',clientMode:'world',pvpRuleset:'',pvpQueued:false,pvpQueuedAt:0,updatedAt:Date.now(),ready:false,lastBossHitAt:0,lastPvpHitAt:0
  };
  players.set(player.id,player);

  const helloTimer=setTimeout(()=>{if(!player.ready)ws.close(1008,'hello timeout');},8000);

  ws.on('message',(raw)=>{
    let msg;try{msg=JSON.parse(String(raw));}catch{return;}
    if(!player.ready){
      if(msg.type!=='hello')return;
      player.name=cleanName(msg.name);
      player.accountId=cleanAccountId(msg.accountId,player.name);
      player.clientMode=msg.mode==='pvp'?'pvp':'world';player.pvpRuleset=String(msg.pvpRuleset||'').slice(0,80);
      const replaced=[...players.values()].filter(p=>p!==player&&p.ready&&p.accountId===player.accountId);
      for(const old of replaced){
        safeSend(old.ws,{type:'session:replaced',message:'같은 계정이 다른 기기에서 접속했습니다.'});
        setTimeout(()=>{try{old.ws.close(4001,'duplicate account session');}catch{}},80);
      }
      player.level=Math.floor(clamp(msg.level,1,100));
      player.weapon=Math.floor(clamp(msg.weapon,0,4));
      player.ready=true;
      clearTimeout(helloTimer);
      if(player.clientMode!=='pvp'&&!worldLeaderId)worldLeaderId=player.id;
      safeSend(ws,{
        type:'hello:ok',
        selfId:player.id,combatProtocol:1,mobCombatProtocol:1,
        world:{...WORLD,combatPolicy:WORLD_COMBAT_POLICY,biomes:BIOMES,landmarks:LANDMARKS,hiddenItems:HIDDEN_ITEMS},
        players:player.clientMode==='pvp'?[]:[...players.values()].filter(p=>p.ready&&p.clientMode!=='pvp').map(publicPlayer),
        bosses:bossSnapshot(),
        worldRole:{leaderId:worldLeaderId,isLeader:player.id===worldLeaderId,serverAuthority:true},
        worldSnapshot:serverWorldSnapshot(),
        takenItemIds:[...takenItems],
        partyMax:PARTY_MAX,
        pvpRuleset:player.clientMode==='pvp'?(player.pvpRuleset||PVP_RULESET):PVP_RULESET,
        bossRespawnMs:BOSS_RESPAWN_MS
      });
      if(player.clientMode!=='pvp')broadcast({type:'player:join',player:publicPlayer(player)},ws);
      console.log('[ws-open]',player.id,'mode',player.clientMode,'players',players.size);
      if(player.clientMode!=='pvp')electWorldLeader();
      return;
    }
    handleMessage(player,msg);
  });

  ws.on('close',(code)=>{
    if(player.ready)console.log('[ws-close]',player.id,'code',code,'players',players.size);
    clearTimeout(helloTimer);
    removePvpMatchQueue(player,false);
    leaveParty(player);
    players.delete(player.id);
    if(player.ready&&player.clientMode!=='pvp')broadcast({type:'player:leave',id:player.id});
    if(player.id===worldLeaderId)electWorldLeader();
  });
  ws.on('error',()=>{});
});

let playerListTick=0;
setInterval(()=>{
  const now=Date.now();simulateWorld(now);if(now-lastMobNetFlush>=MOB_NET_TICK_MS){lastMobNetFlush=now;flushMobDeltas(now);}
  for(const boss of bosses.values())if(!boss.alive&&boss.respawnAt<=now){boss.alive=true;boss.hp=boss.maxHp;boss.respawnAt=0;syncBossMob(boss);broadcast({type:'boss:respawn',boss:{id:boss.id,name:boss.name,x:boss.x,y:boss.y,hp:boss.hp,maxHp:boss.maxHp,alive:true,respawnInMs:0}});}
  playerListTick+=SIM_TICK_MS;if(playerListTick>=PLAYER_LIST_MS){playerListTick=0;broadcast({type:'players',players:[...players.values()].filter(p=>p.ready&&p.clientMode!=='pvp').map(publicPlayer),serverTime:now,revision:worldRevision},null,{volatile:true});}
},SIM_TICK_MS);
setInterval(()=>{
  for(const ws of wss.clients){
    if(ws.isAlive===false){try{ws.terminate();}catch{}continue;}
    ws.isAlive=false;try{ws.ping();}catch{}
  }
},25000);

server.listen(PORT,()=>{
  console.log('Echoes shared world server listening on',PORT);
});

