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
  b.state(1385,900,hit.player.combatRevision);await delay(50);assert.equal(b.messages.filter(m=>m.type==='player:self').at(-1).player.x,1385);
  const p=await connect(port,'match-a','pvp'),q=await connect(port,'match-b','pvp');clients.push(p,q);p.send({type:'pvp:matchJoin'});q.send({type:'pvp:matchJoin'});const pm=await p.wait(m=>m.type==='pvp:matchFound'),qm=await q.wait(m=>m.type==='pvp:matchFound');assert.equal(pm.matchId,qm.matchId);assert.notEqual(pm.role,qm.role);
  p.send({type:'world:combat',seq:1,events:[{kind:'attack',targetId:a.id,damage:100}]});await delay(50);assert.ok(!a.messages.some(m=>m.type==='world:combatResult'&&m.targetId===a.id));assert.equal(stderr,'');
 }finally{for(const c of clients)c.ws.close();server.kill();}
});
