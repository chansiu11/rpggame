const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(new URL('../pvp-transport.js','file://'+__filename),'utf8');
test('measured faster direct path is selected and relay survives direct failure',async()=>{
 let time=0;const channels=[],relay=[],received=[],timers=[];
 class RTC{constructor(){this.localDescription={toJSON:()=>({type:'offer',sdp:'test'})};}createDataChannel(label,opts){const c={label,opts,readyState:'connecting',bufferedAmount:0,sent:[],send(v){this.sent.push(JSON.parse(v));},close(){this.readyState='closed';}};channels.push(c);return c;}createOffer(){return Promise.resolve({type:'offer',sdp:'test'});}setLocalDescription(){return Promise.resolve();}close(){channels.forEach(c=>c.close());}}
 const c={window:null,performance:{now:()=>time},RTCPeerConnection:RTC,setInterval:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearInterval:()=>{}};c.window=c;vm.createContext(c);vm.runInContext(source,c);
 const t=c.EchoesPvpTransport.create({host:true,relaySend:d=>{relay.push(d);return true;},onData:d=>received.push(d)});
 const probe=relay.find(d=>d.t==='routeProbe');time=100;t.receiveRelay({t:'routePong',id:probe.id});assert.equal(t.route,'RELAY');
 const combat=channels.find(c=>c.label==='combat'),state=channels.find(c=>c.label==='state');assert.equal(state.opts.ordered,false);assert.equal(state.opts.maxRetransmits,0);
 time=200;combat.readyState=state.readyState='open';combat.onopen();const directProbe=combat.sent.at(-1);time=220;combat.onmessage({data:JSON.stringify({t:'routePong',id:directProbe.id})});assert.equal(t.route,'DIRECT');
 t.send({t:'atk',d:42});assert.equal(combat.sent.at(-1).data.d,42);
 const reliablePacket=combat.sent.at(-1);time=400;timers.find(t=>t.ms===100).fn();assert.equal(relay.at(-1).id,reliablePacket.id);t.receiveRelay({t:'routeAck',id:reliablePacket.id});const relayCount=relay.length;time=600;timers.find(t=>t.ms===100).fn();assert.equal(relay.length,relayCount);combat.onmessage({data:JSON.stringify(reliablePacket)});t.receiveRelay(reliablePacket);assert.equal(received.length,1);received.length=0;t.send({t:'state',x:50});assert.equal(state.sent.at(-1).x,50);
 t.receiveRelay({t:'state',routeSeq:10,x:10});combat.onmessage({data:JSON.stringify({t:'state',routeSeq:9,x:9})});assert.equal(received.length,1);
 combat.close();t.send({t:'atk',d:77});assert.equal(relay.at(-1).d,77);assert.equal(t.route,'RELAY');t.close();await Promise.resolve();
});
test('WebRTC absent or blocked retains working relay',()=>{
 const sent=[],c={window:null,performance:{now:()=>0},setInterval:()=>1,clearInterval:()=>{}};c.window=c;vm.createContext(c);vm.runInContext(source,c);
 const t=c.EchoesPvpTransport.create({host:true,relaySend:d=>{sent.push(d);return true;},onData:()=>{}});t.send({t:'hello'});assert.equal(sent.at(-1).t,'hello');assert.equal(t.route,'RELAY');t.close();
});
