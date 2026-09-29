import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const section=(start,end)=>{
 const a=html.indexOf(start),b=html.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,'Expected renderer section missing: '+start);
 return html.slice(a,b);
};
const worldFx=section('function drawEffects(ground=false){','function drawRemoteSkillOverlay(');
const sample=(type,overrides={})=>({
 type,x:1000,y:1000,x2:1100,y2:1100,r:90,len:120,width:65,
 color:'#ff9132',size:3,arc:1.5,a:.25,t:.5,max:.5,
 seed:42,power:1,density:1,side:1,rx:5,ry:2,vx:30,vy:-10,...overrides
});
function harness(effects,quality='high'){
 let depth=0,maxDepth=0,saves=0,fills=0;
 const canvas=new Proxy({},{
  get(target,key){
   if(key==='save')return ()=>{depth++;saves++;maxDepth=Math.max(maxDepth,depth);};
   if(key==='restore')return ()=>{depth--;assert.ok(depth>=0,'Canvas restore without save');};
   if(key==='createRadialGradient')return ()=>({addColorStop(){}});
   if(key==='createLinearGradient')return ()=>({addColorStop(){}});
   if(key==='fill'||key==='stroke'||key==='fillRect')return ()=>{fills++;};
   if(typeof key==='string')return ()=>{};
  },
  set(){return true;}
 });
 const paint=(ctx,...args)=>{ctx.beginPath();ctx.fill();};
 const line=(ctx,...args)=>{ctx.beginPath();ctx.stroke();};
 const factory=new Function('ctx','effects','options','camera','VIEW_W','VIEW_H','clamp','TAU','circle','line','glow',
  worldFx+';return drawEffects;');
 const draw=factory(canvas,effects,{quality},{x:1000,y:1000},1200,700,(v,min,max)=>Math.max(min,Math.min(max,v)),
  Math.PI*2,paint,line,paint);
 return {draw,stats:()=>({depth,maxDepth,saves,fills})};
}
test('world skill renderer balances Canvas 2D state after every normal and flame effect',()=>{
 const types=['particle','ember','flameBreathPlume','crimsonBladeFire','crimsonFlameBurst','crimsonEdgeFlames','crimsonDashEdgeFire','crimsonChargeFlames','flourish','ring','line','starSeal','vortex','riftCut','meteor','nova','slash'];
 const effects=types.map(type=>sample(type));
 const h=harness(effects);for(let frame=0;frame<10;frame++){h.draw(false);assert.equal(h.stats().depth,0,'Frame '+frame+' left Canvas drawing state on the stack');}
 assert.ok(h.stats().fills>0);assert.ok(h.stats().maxDepth<=3,'Skill effect should not accumulate transforms');
 // Normal particles and embers must only render once each, not duplicate the generic path.
 const particles=harness([sample('particle'),sample('ember')]);particles.draw(false);
 assert.equal(particles.stats().saves,3,'One normal particle and one nested ember draw');
});
test('ground flame effects restore drawing state separately from airborne skill effects',()=>{
 const h=harness([sample('crimsonAshPatch'),sample('particle')]);
 h.draw(true);assert.equal(h.stats().depth,0);
 const prev=h.stats().fills;h.draw(false);assert.equal(h.stats().depth,0);
 assert.ok(h.stats().fills>prev);
});
test('off-screen particles are culled, but long skill trails intersecting the viewport are rendered',()=>{
 const offscreen=Array.from({length:500},()=>sample('particle',{x:9999,y:9999,x2:9999,y2:9999}));
 const h=harness([...offscreen,sample('line',{x:4100,y:1000,x2:1000,y2:1000})]);
 h.draw(false);assert.equal(h.stats().saves,1,'Only intersecting long skill trail should be rendered');
 assert.equal(h.stats().depth,0);
});
test('both frame renderers reset compositing before clearing pixels, and recover a failed canvas',()=>{
 assert.match(html,/function render\(\)\{ctx\.setTransform\(DPR,0,0,DPR,0,0\);ctx\.globalAlpha=1;ctx\.globalCompositeOperation='source-over'/);
 assert.match(html,/function render\(\)\{ctx\.setTransform\(1,0,0,1,0,0\);ctx\.globalAlpha=1;ctx\.globalCompositeOperation='source-over'/);
 assert.match(html,/lastCanvasRecoveryAt/);assert.match(html,/lastPvpCanvasRecoveryAt/);
 assert.match(html,/canvas\.width=width;ctx\.setTransform\(DPR,0,0,DPR,0,0\)/);
 assert.match(html,/canvas\.width=width;ctx\.setTransform\(1,0,0,1,0,0\)/);
});
test('PVP caps all visual effects, even while spectating, without suppressing combat data',()=>{
 const fn=section('function trimFx(){','function pushFx(');
 const make=(quality,spectating)=>{const fx=Array.from({length:10000},(_,i)=>({x:i})),trim=new Function('fx','window','spectating',fn+';return trimFx;')(fx,{EchoesOptions:{quality}},spectating);trim();return fx.length;};
 assert.equal(make('low',false),300);assert.equal(make('high',false),520);assert.equal(make('high',true),640);
 assert.match(html,/fxMargin=250/,'PVP rendering must cull invisible effects');
});
