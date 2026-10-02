// A match-scoped transport for arena packets. World combat never enters this relay.
export function createPvpRelay(players,send){
 const matches=new Map();
 function leave(player){
  const match=matches.get(player.pvpRelayMatch);if(!match)return;
  matches.delete(match.id);clearTimeout(match.timer);
  for(const id of match.ids){const p=players.get(id);if(!p)continue;p.pvpRelayMatch=null;send(p.ws,{type:'pvp:relayClosed',matchId:match.id});}
 }
 function create(id,a,b){
  leave(a);leave(b);
  const match={id,ids:[a.id,b.id],ready:new Set(),open:false,timer:null};
  matches.set(id,match);a.pvpRelayMatch=b.pvpRelayMatch=id;
  match.timer=setTimeout(()=>leave(a),15000);match.timer.unref?.();
 }
 function handle(player,msg,rawBytes){
  if(!['pvp:relayReady','pvp:relay','pvp:relayLeave'].includes(msg.type))return false;
  const match=matches.get(player.pvpRelayMatch);
  if(player.clientMode!=='pvp'||!match||msg.matchId!==match.id||!match.ids.includes(player.id))return true;
  if(msg.type==='pvp:relayLeave'){leave(player);return true;}
  if(msg.type==='pvp:relayReady'){
   match.ready.add(player.id);
   if(!match.open&&match.ready.size===2){match.open=true;clearTimeout(match.timer);for(const id of match.ids)send(players.get(id).ws,{type:'pvp:relayOpen',matchId:match.id});console.log('[pvp-relay-open]',match.id);}
   return true;
  }
  if(!match.open||!msg.data||typeof msg.data!=='object'||Array.isArray(msg.data)||typeof msg.data.t!=='string'||(rawBytes??JSON.stringify(msg.data).length)>65536)return true;
  const opponent=players.get(match.ids.find(id=>id!==player.id));
  if(msg.data.t==='state'&&Number(opponent?.ws?.bufferedAmount||0)>4096)return true;
  if(opponent?.pvpRelayMatch===match.id)send(opponent.ws,{type:'pvp:relay',matchId:match.id,data:msg.data},{volatile:msg.data.t==='state'});
  return true;
 }
 return {create,handle,leave};
}
