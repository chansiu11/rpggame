(()=>{
'use strict';
// Match-authenticated relay remains available throughout optional direct negotiation.
window.EchoesPvpTransport={create({host,relaySend,onData,onStatus=()=>{}}){
 let pc=null,reliable=null,states=null,closed=false,resetting=false,directRtt=Infinity,relayRtt=Infinity,directAt=0,retryAt=0,serial=0,received=0,signalChain=Promise.resolve(),offerBusy=false;
 const pendingIce=[],probes=new Map(),pending=new Map(),seen=new Set();
 const ICE_SERVERS=[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'},{urls:'stun:stun2.l.google.com:19302'},{urls:'stun:stun3.l.google.com:19302'}];
 const clock=()=>performance.now(),smooth=(old,ms)=>Number.isFinite(old)?old*.72+ms*.28:ms;
 function useDirect(){return reliable?.readyState==='open'&&clock()-directAt<3000&&Number.isFinite(directRtt)&&directRtt<=relayRtt+4;}
 function raw(data,path){if(path==='direct'){const ch=data.t==='state'&&states?.readyState==='open'?states:reliable;if(ch?.readyState!=='open')return false;if(data.t==='state'&&ch.bufferedAmount>8192)return false;try{ch.send(JSON.stringify(data));return true;}catch{return false;}}return relaySend(data);}
 function receive(data,path){
  if(closed||!data||typeof data!=='object')return;
  if(data.t==='routeAck'){pending.delete(data.id);return;}
  if(data.t==='routeData'){raw({t:'routeAck',id:data.id},path);if(seen.has(data.id))return;seen.add(data.id);if(seen.size>2048)seen.delete(seen.values().next().value);receive(data.data,path);return;}
  if(data.t==='rtcSignal'){if(path==='relay')signal(data.signal);return;}
  if(data.t==='routeProbe'){raw({t:'routePong',id:data.id},path);return;}
  if(data.t==='routePong'){const probe=probes.get(data.id);if(!probe||probe.path!==path)return;probes.delete(data.id);const ms=clock()-probe.at;if(path==='direct'){directRtt=smooth(directRtt,ms);directAt=clock();}else relayRtt=smooth(relayRtt,ms);onStatus(useDirect()?'DIRECT':'RELAY');return;}
  if(data.t==='state'&&Number.isSafeInteger(data.routeSeq)){if(data.routeSeq<=received)return;received=data.routeSeq;}
  onData(data);
 }
 function probe(path){const id=path+':'+(++serial);probes.set(id,{at:clock(),path});raw({t:'routeProbe',id},path);}
 function tick(){if(closed)return;for(const [id,p] of probes)if(clock()-p.at>3500)probes.delete(id);if(host&&!pc&&clock()>=retryAt)startOffer();probe('relay');if(reliable?.readyState==='open')probe('direct');onStatus(useDirect()?'DIRECT':'RELAY');}
 function resetDirect(delay=1200){if(closed||resetting)return;resetting=true;const old=pc;pc=null;reliable=states=null;directAt=0;directRtt=Infinity;retryAt=clock()+delay;for(const [id,p] of probes)if(p.path==='direct')probes.delete(id);pendingIce.length=0;try{old?.close();}catch{}resetting=false;onStatus('RELAY');}
 function bind(channel){if(!['combat','state'].includes(channel.label)){channel.close();return;}if(channel.label==='combat')reliable=channel;else states=channel;
  try{channel.bufferedAmountLowThreshold=2048;}catch{}
  channel.onmessage=e=>{try{receive(JSON.parse(e.data),'direct');}catch{}};
  channel.onopen=()=>{if(channel.label==='combat')probe('direct');};
  channel.onclose=()=>{if(channel.label==='combat'&&!closed&&!resetting)resetDirect(900);};
 }
 function setup(){if(pc||closed||clock()<retryAt||typeof RTCPeerConnection!=='function')return pc;const connection=pc=new RTCPeerConnection({iceServers:ICE_SERVERS,iceCandidatePoolSize:4,bundlePolicy:'max-bundle'});connection.onicecandidate=e=>{if(e.candidate&&!closed)relaySend({t:'rtcSignal',signal:{candidate:e.candidate.toJSON()}});};connection.ondatachannel=e=>bind(e.channel);connection.onconnectionstatechange=()=>{const state=connection.connectionState;if(connection!==pc||closed)return;if(state==='failed')resetDirect(900);else if(state==='disconnected')setTimeout(()=>{if(!closed&&pc===connection&&connection.connectionState==='disconnected')resetDirect(700);},1400);};return connection;}
 function startOffer(){if(!host||closed||offerBusy||pc||clock()<retryAt)return;const connection=setup();if(!connection)return;offerBusy=true;try{bind(connection.createDataChannel('combat',{ordered:true}));bind(connection.createDataChannel('state',{ordered:false,maxRetransmits:0}));}catch{offerBusy=false;resetDirect(1200);return;}signalChain=signalChain.then(async()=>{await connection.setLocalDescription(await connection.createOffer());if(!closed&&pc===connection)relaySend({t:'rtcSignal',signal:{description:connection.localDescription.toJSON()}});}).catch(()=>resetDirect(1200)).finally(()=>{offerBusy=false;});}
 function signal(s){signalChain=signalChain.then(async()=>{if(closed||!s)return;const connection=setup();if(!connection)return;
  if(s.description){const d=s.description;if(!['offer','answer'].includes(d.type)||typeof d.sdp!=='string'||d.sdp.length>50000)return;if(d.type==='offer'&&host)return;if(d.type==='answer'&&!host)return;await connection.setRemoteDescription(d);for(const ice of pendingIce.splice(0))await connection.addIceCandidate(ice);if(d.type==='offer'){await connection.setLocalDescription(await connection.createAnswer());relaySend({t:'rtcSignal',signal:{description:connection.localDescription.toJSON()}});}}
  else if(s.candidate){if(connection.remoteDescription)await connection.addIceCandidate(s.candidate);else if(pendingIce.length<64)pendingIce.push(s.candidate);}
 }).catch(()=>resetDirect(1200));}
 const timer=setInterval(tick,700);
 const retryTimer=setInterval(()=>{if(closed)return;for(const entry of pending.values()){if(clock()-entry.at<Math.max(150,Math.min(1000,Number.isFinite(directRtt)?directRtt*3:500))&&reliable?.readyState==='open')continue;entry.at=clock();raw(entry.packet,'relay');}},100);
 try{if(host)startOffer();}catch{resetDirect(1200);}
 tick();
 return {send(data){if(closed)return false;if(data.t==='state')data={...data,routeSeq:++serial};if(useDirect()){if(data.t!=='state'){const packet={t:'routeData',id:++serial,data};pending.set(packet.id,{packet,at:clock()});if(raw(packet,'direct'))return true;return raw(packet,'relay');}if(raw(data,'direct'))return true;}return raw(data,'relay');},receiveRelay:data=>receive(data,'relay'),close(){closed=true;clearInterval(timer);clearInterval(retryTimer);probes.clear();pending.clear();try{pc?.close();}catch{}pc=null;reliable=states=null;},get route(){return useDirect()?'DIRECT':'RELAY';}};
}};
})();
