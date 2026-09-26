const {chromium}=require('playwright'),fs=require('fs'),http=require('http'),{spawn}=require('child_process'),assert=require('assert/strict');
const root=require('path').resolve(__dirname,'..');
(async()=>{
 const web=http.createServer((req,res)=>{let file=root+decodeURI(req.url.split('?')[0]);if(file.endsWith('/'))file+='index.html';try{res.setHeader('content-type',file.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end();}});await new Promise(r=>web.listen(18800,'127.0.0.1',r));
 const server=spawn(process.execPath,['server.js'],{cwd:root+'/multiplayer-server',env:{...process.env,PORT:'18787'}});let serverErrors='';server.stderr.on('data',b=>serverErrors+=b);await new Promise(r=>server.stdout.once('data',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});const pages=[],errors=[];
 try{
  for(let i=0;i<2;i++){
   const context=await browser.newContext(),page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(({id})=>{window.__PLAYTEST__=true;localStorage.setItem('echoes_accounts_v1',JSON.stringify({[id]:{username:id,displayName:id}}));localStorage.setItem('echoes_account_session_v1',id);},{id:'qa'+i});
   await page.route('**/*',r=>{const url=r.request().url();if(!url.startsWith('http://127.0.0.1'))return r.abort();if(url.includes('multiplayer-config.js'))return r.fulfill({contentType:'text/javascript',body:"window.ECHOES_MULTIPLAYER_CONFIG={serverUrl:'ws://127.0.0.1:18787'}"});if(url.includes('cloud-save.js'))return r.fulfill({contentType:'text/javascript',body:''});return r.continue();});
   await page.goto('http://127.0.0.1:18800');
   console.log('boot',i,await page.evaluate(()=>({qa:!!window.__game,error:window.__game?.error})));
   await page.evaluate(async({i})=>{const g=window.__game;g.beginNew('normal');g.closeModal();g.player.x=1000+i*100;g.player.y=1000;g.player.hp=g.player.maxHp=2000;g.player.stam=g.player.maxStam=2000;g.player.shield=g.player.maxShield=1000;g.player.level=100;g.multiplayerMode=true;g.bindMultiplayerEvents();await window.EchoesMulti.connect({name:'qa'+i,accountId:'qa'+i});},{i});
  }
  await pages[0].waitForFunction(()=>window.__game.combatTargets().some(e=>e.networkPlayer));
  console.log('players',await pages[0].evaluate(()=>({mode:__game.mode,targets:__game.combatTargets().filter(x=>x.networkPlayer).length,error:__game.error})));
  await pages[0].evaluate(()=>{const g=__game,e=g.combatTargets().find(e=>e.networkPlayer);g.hitEnemy(e,100,true);g.flushWorldCombat();});
  await pages[1].waitForFunction(()=>__game.player.hp<2000);
  const hit=await pages[1].evaluate(()=>({hp:__game.player.hp,x:__game.player.x,stun:__game.player.stun}));assert.ok(hit.hp<2000&&hit.hp>1800);
  await pages[1].keyboard.down('a');await new Promise(r=>setTimeout(r,350));await pages[1].keyboard.up('a');
  const after=await pages[1].evaluate(()=>({hp:__game.player.hp,x:__game.player.x,stun:__game.player.stun,error:__game.error}));assert.ok(after.x>1100,'knockback lost to movement');console.log('active-input knockback',hit,after);
  await new Promise(r=>setTimeout(r,550));
  const targetId=await pages[1].evaluate(()=>EchoesMulti.state.selfId);
  // Shared target adapter routes direct assignment, stun, marks and shield break.
  await pages[0].evaluate(({targetId})=>{const g=__game,p=g.player,e=g.combatTargets().find(e=>e.id===targetId);p.x=e.x-60;p.y=e.y;p.stun=p.moveLock=p.attackCd=p.cast=p.dodge=0;p.invuln=0;g.hitEnemy(e,80,false);e.stun=.8;e.shield=0;g.moveBody(e,150,0);g.flushWorldCombat();},{targetId});
  await pages[1].waitForFunction(hp=>__game.player.hp<hp,hit.hp);
  await new Promise(r=>setTimeout(r,450));const force=await pages[1].evaluate(()=>({hp:__game.player.hp,x:__game.player.x,shield:__game.player.shield,error:__game.error}));assert.ok(force.x>1250);assert.equal(force.shield,0);console.log('adapter force/shield',force);
  const stale=await pages[1].evaluate(()=>{const before=__game.player.hp;__game.applyWorldCombatResult({targetId:EchoesMulti.state.selfId,player:{combatRevision:1,hp:2000,x:0,y:0}});return {before,after:__game.player.hp};});assert.equal(stale.before,stale.after);
  const skills=await pages[0].evaluate(()=>{
   const g=__game,m=EchoesMulti,original={combatEvent:m.combatEvent,flushCombat:m.flushCombat,sendState:m.sendState,skillFx:m.skillFx,pvpDamage:m.pvpDamage},events=[];m.pvpDamage=(targetId,damage,range,kind,control)=>events.push({kind,targetId,damage,...control});m.combatEvent=e=>events.push(e);m.flushCombat=()=>{};m.sendState=()=>{};m.skillFx=()=>{};
   const output=[];try{for(const style of g.SWORD_STYLE_GROUPS){for(let slot=0;slot<5;slot++){
    g.cancelSwordSkill();const p=g.player;p.weapon=4;p.adminSwordSkills=[...style.skills];p.level=100;p.stam=p.maxStam=100000;p.hp=p.maxHp=100000;p.x=3000;p.y=3000;p.facing=0;p.stun=p.cast=p.attackCd=p.dodge=p.parry=p.exhaust=p.moveLock=p.postSkillLockTimer=0;p.skillCds=[0,0,0,0,0];
    g.mergeRemotePlayerState({id:'skill-target',x:3070,y:3000,hp:100000,maxHp:100000,shield:1000,a:Math.PI,seq:1});const info=g.skillInfo(slot),before=events.length;
    g.skill(slot);for(let n=0;n<230;n++){g.updateCombat(.033);g.updateSwordSkill(.033);g.updateProjectiles(.033);g.flushWorldCombat();}
    output.push({id:info.id,events:events.length-before});
   }}
   for(let slot=0;slot<5;slot++){g.cancelSwordSkill();const p=g.player;p.weapon=3;p.stam=100000;p.x=3000;p.y=3000;p.facing=0;p.stun=p.cast=p.attackCd=p.dodge=p.parry=p.exhaust=p.moveLock=p.postSkillLockTimer=0;p.hiddenSkillCds=[0,0,0,0,0];g.mergeRemotePlayerState({id:'skill-target',x:3070,y:3000,hp:100000,maxHp:100000,shield:1000,a:Math.PI,seq:1});const before=events.length;g.beginHiddenSkillInput(slot);for(let n=0;n<230;n++){g.updateCombat(.033);g.updateSwordSkill(.033);g.updateProjectiles(.033);g.flushWorldCombat();}g.releaseHiddenSkillInput(slot);g.updateCombat(.033);g.flushWorldCombat();output.push({id:'hidden:'+slot,events:events.length-before});}
   for(let slot=0;slot<5;slot++){g.cancelSwordSkill();const p=g.player;p.weapon=2;p.stam=100000;p.x=3000;p.y=3000;p.facing=0;p.stun=p.cast=p.attackCd=p.dodge=p.parry=p.exhaust=p.moveLock=p.postSkillLockTimer=0;p.skillCds=[0,0,0,0,0];g.mergeRemotePlayerState({id:'skill-target',x:3070,y:3000,hp:100000,maxHp:100000,shield:1000,a:Math.PI,seq:1});const before=events.length;g.skill(slot);for(let n=0;n<230;n++){g.updateCombat(.033);g.updateSwordSkill(.033);g.updateProjectiles(.033);g.flushWorldCombat();}output.push({id:'bow:'+slot,events:events.length-before});}
   if(g.enemies.some(e=>e.networkPlayer))throw Error('Network target leaked into monster collection');
   if(g.packSave().bossHealth.some(e=>e.id==='skill-target'))throw Error('Network target leaked into save');
   return output;
   }finally{Object.assign(m,original);g.cancelSwordSkill();}
  });console.log('skill runtime',skills);assert.equal(skills.length,35);assert.ok(skills.every(s=>s.events>0),'skill missing player events');
  console.log('errors',errors,serverErrors);assert.deepEqual(errors,[]);assert.equal(serverErrors,'');
 }finally{await browser.close();server.kill();web.close();}
})().catch(e=>{console.error(e);process.exit(1)});
