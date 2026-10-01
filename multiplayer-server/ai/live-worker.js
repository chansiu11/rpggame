import {parentPort,workerData} from 'node:worker_threads';
import {createArena} from './arena-runtime.js';
import {createBrain} from './brain.js';
const arena=createArena({live:true,style:workerData.style,level:Math.min(100,Math.max(1,workerData.level||100))});
// Compile and exercise the shared update/state path before advertising readiness.
// No packets or combat outcomes from this warm-up reach the player.
arena.api.init(arena.snapshot,arena.snapshot,false,()=>{});
for(let i=0;i<90;i++)arena.step(1/60);
arena.api.dispose();
const brain=createBrain(workerData.style,workerData.policy,Math.random,workerData.difficulty);let initialized=false;
parentPort.on('message',m=>{
 if(!initialized){if(m.t!=='hello'||!arena.api.validSnap(m.s))return;
 const own=arena.snapshot;for(const key of ['maxHp','maxShield','maxStam','attacks','defense','damageReduction','speed','cdr','perks'])if(m.s[key]!==undefined)own[key]=m.s[key];own.name='AI · '+own.styleName+' · '+(workerData.difficulty||3)+'단계';own.weapon=0;own.ownedWeapons=[0];own.potions=0;
 arena.api.init(own,m.s,false,data=>parentPort.postMessage(data));initialized=true;last=performance.now();parentPort.postMessage({t:'helloAck',v:4,ruleset:own.ruleset,s:own,aiCountdown:true});arena.api.beginAiCountdown();return;}
 if(m.t==='rematch'){if(!arena.api.running){arena.api.receive(m);arena.api.rematch();}return;}
 arena.api.receive(m);
});
let last=performance.now();setInterval(()=>{if(!initialized)return;const now=performance.now(),dt=Math.min(.05,(now-last)/1000);last=now;
 if(arena.api.running&&!arena.api.locked)arena.api.control(brain.step(dt,arena.api.me,arena.api.enemy,arena.api.skillContext?.()||{}));arena.step(dt);
},1000/60);
parentPort.postMessage({t:'aiReady'});
