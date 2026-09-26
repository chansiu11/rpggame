import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {WebSocket} from '../multiplayer-server/node_modules/ws/wrapper.mjs';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function connect(port,name,mode='world'){
 const ws=new WebSocket(`ws://127.0.0.1:${port}`),messages=[];let input=0;ws.on('message',b=>messages.push(JSON.parse(b)));
 await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
 const send=m=>ws.send(JSON.stringify(m));send({type:'hello',name,accountId:name,mode,pvpRuleset:'test-compatible'});
 const wait=async pred=>{for(let i=0;i<100;i++){const m=messages.find(pred);if(m)return m;await delay(10);}throw Error('Message timeout '+name);};
 const hello=await wait(m=>m.type==='hello:ok');
 return {ws,messages,send,wait,id:hello.selfId,state:(x,hp=1000,ack=0)=>send({type:'state',seq:++input,combatAck:ack,x,y:1000,hp,maxHp:1000,shield:500,maxShield:500,stam:100,maxStam:200})};
}
test('real two-client WebSocket combat, stale input, force settlement and PVP matching',{timeout:15000},async()=>{
 const port=18000+Math.floor(Math.random()*10000),server=spawn(process.execPath,['server.js'],{cwd:new URL('../multiplayer-server/',import.meta.url),env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
 const clients=[];let stderr='';server.stderr.on('data',b=>stderr+=b);
 try{
  await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('exit',c=>reject(Error('server exit '+c+' '+stderr)));});
  const a=await connect(port,'world-a'),b=await connect(port,'world-b');clients.push(a,b);a.state(1000);b.state(1100);await b.wait(m=>m.type==='player:self');
  const attack={type:'world:combat',seq:1,events:[{kind:'attack',targetId:b.id,damage:100,dx:280,stun:.5,duration:.3}]};a.send(attack);a.send(attack);
  const hit=await b.wait(m=>m.type==='world:combatResult');assert.equal(hit.player.hp,900);assert.equal(hit.damage,100);
  for(let i=0;i<20;i++){b.state(1100,1000,0);await delay(25);}
  const last=b.messages.filter(m=>m.type==='player:self').at(-1).player;assert.equal(last.hp,900);assert.equal(last.x,1380);assert.equal(b.messages.filter(m=>m.type==='world:combatResult'&&m.damage>0).length,1);
  const settled=await b.wait(m=>m.type==='world:combatResult'&&m.outcome==='settled'&&m.targetId===b.id);b.state(1385,900,settled.player.combatRevision);await delay(50);assert.equal(b.messages.filter(m=>m.type==='player:self').at(-1).player.x,1385);
  a.send({type:'world:bootstrap',spawnLayoutVersion:'regional-clusters-v2-leash',mobs:['mob-a','mob-b'].map((id,i)=>({id,type:'sprout',x:1080+i*30,y:1000,hp:1000,maxHp:1000,speed:10,r:18})),obstacles:[]});
  await a.wait(m=>m.type==='world:snapshot'&&m.snapshot.mobs.some(e=>e.id==='mob-a'));
  const mobPacket={type:'world:mobCombat',seq:1,events:['mob-a','mob-b'].map(mobId=>({mobId,damage:100,stun:1,knockbackX:120}))};a.send(mobPacket);a.send(mobPacket);
  for(const id of ['mob-a','mob-b']){const patch=await b.wait(m=>m.type==='world:mobPatch'&&m.mob.id===id);assert.equal(patch.mob.hp,900);assert.ok(patch.mob.forceMove);}
  await delay(400);
  for(const id of ['mob-a','mob-b']){const patches=b.messages.filter(m=>m.type==='world:mobPatch'&&m.mob.id===id);assert.equal(patches.length,1);const initial=patches[0].mob;const last=b.messages.filter(m=>m.type==='world:mobsDelta').flatMap(m=>m.mobs).filter(m=>m.id===id).at(-1);assert.equal(last.hp,900);assert.ok(last.x>initial.x+100);assert.equal(last.forceMove,null);}
  const p=await connect(port,'match-a','pvp'),q=await connect(port,'match-b','pvp');clients.push(p,q);p.send({type:'pvp:matchJoin'});q.send({type:'pvp:matchJoin'});const pm=await p.wait(m=>m.type==='pvp:matchFound'),qm=await q.wait(m=>m.type==='pvp:matchFound');assert.equal(pm.matchId,qm.matchId);assert.notEqual(pm.role,qm.role);
  p.send({type:'world:combat',seq:1,events:[{kind:'attack',targetId:a.id,damage:100}]});await delay(50);assert.ok(!a.messages.some(m=>m.type==='world:combatResult'&&m.targetId===a.id));assert.equal(stderr,'');
 }finally{for(const c of clients)c.ws.close();server.kill();}
});
test('two clients with delayed hit/settlement acknowledgements and bounded visual replication',{timeout:15000},async()=>{
 const port=28000+Math.floor(Math.random()*10000),server=spawn(process.execPath,['server.js'],{cwd:new URL('../multiplayer-server/',import.meta.url),env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});const clients=[];
 try{
  await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('exit',c=>reject(Error('exit '+c)));});
  const a=await connect(port,'lag-a'),b=await connect(port,'lag-b');clients.push(a,b);a.state(1000);b.state(1100);await b.wait(m=>m.type==='player:self');
  a.send({type:'net:ping',nonce:123});const pong=await a.wait(m=>m.type==='net:pong');assert.equal(pong.nonce,123);assert.ok(pong.serverTime>0);
  await delay(80);a.send({type:'world:combat',seq:1,events:[{kind:'attack',targetId:b.id,damage:100,dx:180,stun:.75}]});const hit=await b.wait(m=>m.type==='world:combatResult'&&m.damage===100);
  await delay(80);for(let i=0;i<24;i++){b.state(1100,900,hit.player.combatRevision);await delay(35);}
  const settled=await b.wait(m=>m.type==='world:combatResult'&&m.outcome==='settled');assert.equal(settled.player.x,1280);
  const authoritative=b.messages.filter(m=>m.type==='player:self').at(-1).player;assert.equal(authoritative.x,1280);assert.equal(authoritative.hp,900);
  await delay(80);b.state(1280,900,settled.player.combatRevision);a.state(1190);await delay(80);
  a.send({type:'world:combat',seq:2,events:[{kind:'attack',targetId:b.id,damage:100,dx:180,stun:.75}]});const second=await b.wait(m=>m.type==='world:combatResult'&&m.player.hp===800);assert.equal(second.damage,100);assert.ok(second.player.forceMove.x>=1459);
  a.send({type:'skill:effects',seq:1,effects:[{type:'particle',x:1190,y:1000},{type:'riftCut',x:1190,y:1000,len:300,width:35,t:.3,color:'#fff'}],projectiles:[]});const fx=await b.wait(m=>m.type==='skill:effects');assert.equal(fx.effects.length,1);assert.equal(fx.effects[0].type,'riftCut');
 }finally{for(const c of clients)c.ws.close();server.kill();}
});
