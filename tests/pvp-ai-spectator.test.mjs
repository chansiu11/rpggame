import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createAiService} from '../multiplayer-server/ai/live-service.js';

test('spectator camera follows both fighters with automatic fit, allows free drag and zoom',{timeout:5000},()=>{
 const js=fs.readFileSync(new URL('../pvp-ai-spectator.js',import.meta.url),'utf8');
 const nodes=new Map(),events=new Map();
 let started=null,stopped=0;
 function node(id){if(nodes.has(id))return nodes.get(id);for(const existing of nodes.values())if(existing.id===id)return existing;const n={id,hidden:false,value:'',style:{},textContent:'',children:[],appendChild(c){this.children.push(c)},querySelector(){return node('card')},addEventListener(t,fn){events.set(id+':'+t,fn)},setPointerCapture(){},getBoundingClientRect(){return {width:1200,height:700}},setAttribute(){}};nodes.set(id,n);return n;}
 const ctx={document:{getElementById:node,createElement:id=>node('dynamic'+nodes.size),head:node('head')},Set,Math,Number};
 ctx.window=ctx;vm.createContext(ctx);vm.runInContext(js,ctx);
 const viewer=ctx.EchoesPvpSpectator;
 viewer.mount({start:config=>started=config,stop:()=>stopped++});
 assert.ok(node('card').children.some(el=>el.id==='pvpAiSpectateSetup'));
 assert.ok(node('pvpStage').children.some(el=>el.id==='pvpSpectateTools'));
 assert.match(node('pvpAiSpectateSetup').innerHTML,/AI끼리 대전 관전/);
 node('pvpSpecStyleA').value='gale';node('pvpSpecStyleB').value='void';
 node('pvpSpecDiffA').value='4';node('pvpSpecDiffB').value='5';
 node('pvpAiSpectateStart').onclick();
 assert.deepEqual({...started},{styleA:'gale',styleB:'void',difficultyA:4,difficultyB:5});
 viewer.setActive(true);assert.equal(node('pvpSpectateTools').hidden,false);
 const camera={x:1800,y:1050},a={x:1450,y:1050},b={x:2150,y:1050};
 viewer.update(camera,a,b,.25,1200,700,3600,2100);
 assert.ok(Math.abs(camera.x-1800)<1);assert.equal(viewer.zoom(),1);
 a.x=150;b.x=3450;viewer.update(camera,a,b,.5,1200,700,3600,2100);
 assert.ok(viewer.zoom()<.4,'Both far-apart fighters remain in the frame');
 let zoomed=false;events.get('pvpCanvas:wheel')({deltaY:-1,preventDefault(){zoomed=true}});
 assert.ok(zoomed);
 const previousZoom=viewer.zoom();viewer.update(camera,a,b,.2,1200,700,3600,2100);
 assert.equal(viewer.zoom(),previousZoom,'Both-fighter tracking must never crop either character to satisfy a manual zoom');
 node('pvpSpecCamera').value='a';node('pvpSpecCamera').onchange({target:{value:'a'}});
 viewer.update(camera,a,b,.5,1200,700,3600,2100);assert.ok(viewer.zoom()>previousZoom,'Individual follow allows manual zoom');
 viewer.key('ArrowRight',true);viewer.update(camera,a,b,.5,1200,700,3600,2100);
 assert.equal(node('pvpSpecCamera').value,'free');
 const priorX=camera.x;
 events.get('pvpCanvas:pointerdown')({button:0,pointerId:1,clientX:300,clientY:200,preventDefault(){}});
 events.get('pvpCanvas:pointermove')({pointerId:1,clientX:240,clientY:200});
 viewer.update(camera,a,b,.5,1200,700,3600,2100);
 assert.notEqual(camera.x,priorX,'Drag actually pans the free camera');
 viewer.key('ArrowRight',false);node('pvpSpecStop').onclick();assert.equal(stopped,1);
 viewer.setActive(false);assert.equal(node('pvpSpectateTools').hidden,true);
});

test('PVP spectator uses original fighter motion, projectiles, vortex and all active visual effects',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const pvp=html.split('<script>')[2]?.split('</script>')[0]||'';
 assert.match(pvp,/function controlSpectatorAi\(dt\)/);
 assert.match(pvp,/if\(spectating\)controlSpectatorAi\(dt\)/);
 assert.match(pvp,/function renderFx\(f\)/);
 assert.match(pvp,/for\(const p of projectiles\)/);
 assert.match(pvp,/for\(const v of pvpVortices\)GALE_VORTEX_PVP\.draw/);
 assert.match(pvp,/for\(const f of fx\)renderFx\(f\)/);
 assert.match(pvp,/drawJourneyFighter\(q\.f,q\.m\)/);
 assert.match(pvp,/spectating&&!window\.__AI_SERVER__\?10000:520/);
 assert.match(pvp,/pvpOwnSnapshot\(\)/);
 assert.match(pvp,/pvpSpectator\.update\(pvpCamera,me,enemy,dt,W,H,ARENA_W,ARENA_H\)/);
});
test('both spectator bots receive the same current skill-aware decision path',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const spectator=fs.readFileSync(new URL('../pvp-ai-spectator.js',import.meta.url),'utf8');
 const pvp=html.split('<script>')[2]?.split('</script>')[0]||'';
 assert.match(spectator,/brain\.js\?v=20261002-dual-bot-skill-11/,'browser-side AI must use the current shared brain build');
 assert.match(html,/pvp-ai-spectator\.js\?v=20261002-dual-bot-skill-11/,'spectator controller cache must be busted with the matching build');
 assert.match(pvp,/const skillContext=\{selfSkills:Array\.from\(\{length:5\},\(_,i\)=>pvpSwordSkillAt\(i,me\)\),enemySkills:Array\.from\(\{length:5\},\(_,i\)=>pvpSwordSkillAt\(i,enemy\)\)\}/);
 assert.match(pvp,/spectatorBrain\.step\(dt,me,enemy,skillContext\)/,'AI 1 must receive real skill metadata just like server-side AI 2');
 assert.match(pvp,/browserBuild!==serverBuild/,'AI-vs-AI must refuse to start when the browser and server brains differ');
});
test('AI-vs-AI refuses to start unless both fighters expose five real skills',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const pvp=html.split('<script>')[2]?.split('</script>')[0]||'';
 assert.match(pvp,/function validAiSkillLoadout\(f\)/);
 assert.match(pvp,/Array\.from\(\{length:5\},\(_,i\)=>pvpSwordSkillAt\(i,f\)\)\.every/);
 assert.match(pvp,/spectating&&\(!validAiSkillLoadout\(snap\)\|\|!validAiSkillLoadout\(remoteSnap\)\)/);
});
test('new AI spectator match shares trained policy and receives reliable opponent state',{timeout:15000},async()=>{
 const events=[],service=createAiService((ws,m,opts)=>events.push({msg:m,opts}));
 const player={id:'spectate-test',clientMode:'pvp',level:100,ws:{}};
 try{
  service.handle(player,{type:'pvp:aiStart',style:'dawn',difficulty:5,spectate:true});
  const ready=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('AI spectator worker initialization timeout')),12000);
   const poll=setInterval(()=>{
    const found=events.find(e=>e.msg.type==='pvp:aiReady');
    if(found){clearInterval(poll);clearTimeout(timer);resolve(found);}
   },20);
  });
  assert.equal(ready.msg.spectate,true);
  assert.equal(ready.msg.style,'dawn');
  assert.equal(ready.msg.difficulty,5);
  assert.equal(ready.msg.aiBuild,'20261002-dual-bot-skill-11');
  assert.equal(ready.msg.policy.schema,2);assert.equal(ready.msg.policy.model,'mlp-es-v1');assert.ok(ready.msg.policy.styles.dawn.network.w1.length>0);
 }finally{service.leave(player)}
});
