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

// These branches are copied from rpggametest/index.html, not recreated.
test('the test build original fire renderers all draw, including roaming fifth-form flames',()=>{
 const copied=['crimsonWing','crimsonPillar','crimsonTriangle','crimsonRibbon','crimsonBloom','crimsonFlameRing','crimsonFlameSlash'];
 for(const kind of copied)assert.match(worldFx,new RegExp("if\\(e\\.type==='"+kind+"'\\)"),kind+' original render path');
 const effects=[
  sample('crimsonWing',{reach:150}),
  sample('crimsonPillar',{t:.3,max:.5,activeLife:.5}),
  sample('crimsonTriangle',{vs:[{x:940,y:940},{x:1040,y:1000},{x:960,y:1060}]}),
  sample('crimsonRibbon',{w:45}),
  sample('crimsonBloom',{intensity:1}),
  sample('crimsonFlameRing'),
  sample('crimsonFlameSlash')
 ];
 for(const quality of ['high','low']){
  const h=harness(effects,quality);
  h.draw(false);
  assert.equal(h.stats().depth,0,'Original '+quality+' fire must restore Canvas state');
  assert.ok(h.stats().fills>35,'Original '+quality+' fire should visibly render');
  assert.ok(h.stats().saves>=7,'Original moving flame types should all render');
 }
 const ground=harness([sample('crimsonScorch',{w:90})]);
 ground.draw(true);
 assert.equal(ground.stats().depth,0);
 assert.ok(ground.stats().fills>0,'Original test scorch must draw below the fighters');
 assert.doesNotMatch(html,/drawHongryeonFinaleAura/,'Do not recreate the test project fire as a synthetic aura');
});
test('world fifth-form target death ends the active combo without leftover attack lock',()=>{
 const fn=section('function updateFlameBreathFinale(', 'function updateSwordSkill(');
 const original={flameCaught:true,flameFace:0,facing:0,originX:100,originY:100,flameTarget:{dead:true,hp:0}};
 const state=new Function('seq',`
  const player={x:100,y:100,skillPose:4,skillLift:0,cast:3.6,attackCd:3.6,attackAnim:3.6,moveLock:3.6,postSkillLockTimer:3.6};
  let activeSwordSkill=seq;
  const syncInstantPlayerMove=()=>{throw Error('No teleport should occur when standing still');};
  ${fn}
  updateFlameBreathFinale(seq,{id:'meteorBreaker'},1/60);
  return {activeSwordSkill,player};
 `)(original);
 assert.equal(state.activeSwordSkill,null);
 assert.equal(state.player.attackCd,0);
 assert.equal(state.player.moveLock,0);
 assert.ok(fn.includes('if(e.dead||Number(e.hp)<=0){finish();return;}'),'Death on the current strike should stop additional hits');
 assert.ok(fn.includes("const theta=dashElapsed*20,orbit=49,px=player.x,py=player.y;"),'Keep the richer opening-dash flame plumes after the 0.5 second ignition');
 const pvp=section('function pvpHongryeonFinale(', 'function pvpWorldSwordMotion(');
 assert.ok(pvp.includes('if(ev.hongCaught&&(!enemy||enemy.hp<=0)){finish();return;}'),'PVP fifth form should stop when caught opponent dies');
});

test('the exact test-project 1100-particle rotating fifth-form vortex renders over the characters',()=>{
 const copied=section('const FLAME_FINALE_PARTICLES=Array.from(', 'window.EchoesDrawFlameFinaleVortex=');
 assert.match(copied,/length:1100/,'The source must reuse the test project particle pool');
 assert.match(copied,/spin=since\*410\.0/,'The test-project 410 rad\/s rotation must be preserved');
 assert.match(copied,/swarmCount=low\?340:780,sparks=low\?118:260/);
 assert.match(html,/drawEffects\(false\);drawFlameFinaleVortex\(\);drawLockMarker\(\);/,'Draw the TEST vortex in the world foreground');
 assert.match(html,/const drawVortex=window\.EchoesDrawFlameFinaleVortex/,'PvP must reuse the very same TEST renderer');
 const create=new Function('ctx','activeSwordSkill','player','options','TAU','clamp','combatCenter','window',
  copied+';return {drawFlameFinaleVortex,FLAME_FINALE_PARTICLES};');
 for(const quality of ['high','low']){
  let depth=0,moves=0,quads=0,fills=0,strokes=0;
  const canvas=new Proxy({},{
   get(_,key){
    if(key==='save')return ()=>{depth++;};
    if(key==='restore')return ()=>{depth--;assert.ok(depth>=0,'Unbalanced Canvas context');};
    if(key==='moveTo')return ()=>{moves++;};
    if(key==='quadraticCurveTo')return ()=>{quads++;};
    if(key==='fill')return ()=>{fills++;};
    if(key==='stroke')return ()=>{strokes++;};
    if(typeof key==='string')return ()=>{};
   },set(){return true;}
  });
  const target={x:1100,y:1080,dead:false,hp:3000},
   player={x:980,y:1010},seq={skillId:'meteorBreaker',flameCaught:true,elapsed:.20,flameCaughtAt:0,side:1,flameTarget:target};
  const fx=create(canvas,seq,player,{quality},Math.PI*2,(v,a,b)=>Math.max(a,Math.min(b,v)),v=>v,{});
  assert.equal(fx.FLAME_FINALE_PARTICLES.length,1100);
  for(let frame=0;frame<8;frame++){
   seq.elapsed=.20+frame*.18;const before=moves;
   fx.drawFlameFinaleVortex();
   assert.equal(depth,0,'Every fifth-form frame must restore its Canvas state');
   assert.ok(moves-before>=(quality==='low'?500:1130),'Original TEST '+quality+' flames and rotating points must render');
  }
  assert.ok(quads>0&&fills>0&&strokes>0,'Swirling flame tongues, spark shards and curved strokes remain visible');
  const before=moves;target.dead=true;fx.drawFlameFinaleVortex();
  assert.equal(moves,before,'Do not leave a vortex behind once the target disappears');
 }
});
