const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');
function lineWith(token){const line=html.split(/\r?\n/).find(v=>v.includes(token));assert.ok(line,'missing '+token);return line;}
function functionSource(name){const start=html.indexOf('function '+name+'(');assert.ok(start>=0,'missing '+name);const end=html.indexOf('\nfunction ',start+1);return html.slice(start,end>start?end:html.length);}
test('forceEnemyTo preserves the packet type while sending duration separately',()=>{
  const packets=[],ctx={ARENA_W:3000,ARENA_H:2000,clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),net:m=>packets.push(m),enemy:{x:120,y:100,netX:120,netY:100,netVX:0,netVY:0,stun:0,remoteForce:null}};
  vm.createContext(ctx);vm.runInContext(functionSource('forceEnemyTo'),ctx);ctx.forceEnemyTo(160,100,.18,.3);
  assert.equal(packets.at(-1).t,'forceDelta');assert.equal(packets.at(-1).time,.18);assert.equal(packets.at(-1).dx,40);
});
test('forceDelta received during an active knockback extends the authoritative endpoint and returns a valid ack',()=>{
  const branch=lineWith("else if(m.t==='forceDelta'&&me)").trim().replace(/^else if/,'if');
  const packets=[],ctx={ARENA_W:3000,ARENA_H:2000,clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),performance:{now:()=>1000},net:m=>packets.push(m),me:{x:120,y:100,vx:0,vy:0,stun:0,knockCameraHold:0,escapeProtectUntil:0,forcedMove:{x:180,y:100,t:.2,max:.3,elapsed:.1,startX:100,startY:100,stun:.2,priority:true}}};
  vm.createContext(ctx);vm.runInContext(`function apply(m){${branch}}`,ctx);ctx.apply({t:'forceDelta',dx:40,dy:0,time:.18,stun:.3});
  assert.equal(ctx.me.forcedMove.x,220);assert.equal(ctx.me.forcedMove.priority,true);assert.equal(packets.at(-1).t,'forceDeltaAck');assert.equal(packets.at(-1).x,220);assert.equal(packets.at(-1).time,.18);
  ctx.apply({t:'forceDelta',dx:30,dy:0,time:.18,stun:.2});assert.equal(ctx.me.forcedMove.x,250);assert.equal(packets.at(-1).x,250);
});
test('attacker preview accumulates overlapping push deltas onto the pending landing',()=>{
  const packets=[],ctx={ARENA_W:3000,ARENA_H:2000,clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),net:m=>packets.push(m),enemy:{x:120,y:100,netX:180,netY:100,netVX:0,netVY:0,stun:0,remoteForce:{x:180,y:100,max:.3,elapsed:.1,startX:100,startY:100,stun:.2}}};
  vm.createContext(ctx);vm.runInContext(functionSource('forceEnemyTo'),ctx);ctx.forceEnemyTo(ctx.enemy.x+40,ctx.enemy.y,.18,.3);
  assert.equal(ctx.enemy.remoteForce.x,220);assert.equal(ctx.enemy.netX,220);assert.equal(packets.at(-1).t,'forceDelta');assert.equal(packets.at(-1).dx,40);
});
test('forceDeltaAck reads duration from time instead of the message type field',()=>{
  const line=lineWith("else if(m.t==='forceDeltaAck'&&enemy)");assert.match(line,/clamp\(\+m\.time\|\|\.28/);assert.doesNotMatch(line,/clamp\(\+m\.t\|\|\.28/);
});
test('eclipse pull no longer sends the same displacement through both hit force and forceEnemyTo',()=>{
  assert.equal((html.match(/force:comboPull\?pullForce:knock/g)||[]).length,0);assert.equal((html.match(/force:comboPull\?0:knock/g)||[]).length,2);
});
