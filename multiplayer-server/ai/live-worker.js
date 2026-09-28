import {parentPort,workerData} from 'node:worker_threads';
import {createArena} from './arena-runtime.js';
import {createBrain} from './brain.js';
const arena=createArena({style:workerData.style,level:Math.min(100,Math.max(1,workerData.level||100))});
const brain=createBrain(workerData.style,workerData.policy);let initialized=false;
parentPort.on('message',m=>{
 if(!initialized){if(m.t!=='hello'||!arena.api.validSnap(m.s))return;
 const own=arena.snapshot;for(const key of ['maxHp','maxShield','maxStam','attacks','defense','damageReduction','speed','cdr','perks'])if(m.s[key]!==undefined)own[key]=m.s[key];own.name='AI · '+own.styleName;own.weapon=0;own.ownedWeapons=[0];own.potions=0;
 arena.api.init(own,m.s,false,data=>parentPort.postMessage(data));initialized=true;parentPort.postMessage({t:'helloAck',v:3,s:own});return;}
 if(m.t==='rematch')parentPort.postMessage({t:'rematch'});
 arena.api.receive(m);
});
let last=performance.now();setInterval(()=>{if(!initialized)return;const now=performance.now(),dt=Math.min(.05,(now-last)/1000);last=now;
 if(arena.api.running&&!arena.api.locked)arena.api.control(brain.step(dt,arena.api.me,arena.api.enemy));arena.step(dt);
},1000/60);
parentPort.postMessage({t:'aiReady'});
