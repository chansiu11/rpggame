const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(new URL('../pvp-transport.js','file://'+__filename),'utf8');
test('reliable combat packets fence out older unordered state coordinates',()=>{
 const received=[],relay=[],c={window:null,performance:{now:()=>0},setInterval:()=>1,clearInterval:()=>{}};c.window=c;vm.createContext(c);vm.runInContext(source,c);
 const t=c.EchoesPvpTransport.create({host:false,relaySend:d=>{relay.push(d);return true;},onData:d=>received.push(d)});
 t.receiveRelay({t:'state',routeSeq:10,x:100,y:100});assert.equal(received.at(-1).x,100);
 t.receiveRelay({t:'routeData',id:20,data:{t:'forceDeltaAck',x:500,y:100}});assert.equal(received.at(-1).t,'forceDeltaAck');
 const count=received.length;t.receiveRelay({t:'state',routeSeq:19,x:100,y:100});assert.equal(received.length,count,'pre-knockback state must not restore the old position');
 t.receiveRelay({t:'state',routeSeq:21,x:500,y:100});assert.equal(received.at(-1).x,500,'post-knockback state can confirm the landing');assert.ok(relay.some(d=>d.t==='routeAck'&&d.id===20));t.close();
});
