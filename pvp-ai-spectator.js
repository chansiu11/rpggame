(()=>{
'use strict';
const $=id=>document.getElementById(id),names={gale:'질풍',void:'이형',dawn:'여명'};
const s={active:false,mode:'both',zoom:1,actualZoom:1,panX:1800,panY:1050,pressed:new Set(),drag:null,brainModule:null};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
let start=()=>{},stop=()=>{};
function mount(callbacks){
 start=callbacks.start;stop=callbacks.stop;
 const card=$('pvpLobby')?.querySelector('.pvp-card'),stage=$('pvpStage'),canvas=$('pvpCanvas');
 if(!card||!stage||!canvas)return;
 const styles='<option value="random">무작위</option><option value="gale">질풍</option><option value="void">이형</option><option value="dawn">여명</option>';
 const difficulty='<option value="1">1 · 매우 쉬움</option><option value="2">2 · 쉬움</option><option value="3" selected>3 · 보통</option><option value="4">4 · 어려움</option><option value="5">5 · 매우 어려움</option>';
 const lobby=document.createElement('section');lobby.id='pvpAiSpectateSetup';
 lobby.innerHTML='<h3>AI 대 AI · 실제 PVP 관전</h3><p>두 AI가 같은 PVP 아레나에서 싸웁니다. 전투는 AI에게 맡기고 관전 시점을 직접 조작합니다.</p><div class="pvpSpectateConfig"><label>AI 1 유파<select id="pvpSpecStyleA">'+styles+'</select></label><label>AI 1 난이도<select id="pvpSpecDiffA">'+difficulty+'</select></label><label>AI 2 유파<select id="pvpSpecStyleB">'+styles+'</select></label><label>AI 2 난이도<select id="pvpSpecDiffB">'+difficulty+'</select></label><button type="button" id="pvpAiSpectateStart" class="primary">AI끼리 대전 관전</button></div>';
 card.appendChild(lobby);
 const tools=document.createElement('div');tools.id='pvpSpectateTools';tools.hidden=true;
 tools.innerHTML='<label>카메라 <select id="pvpSpecCamera"><option value="both">두 AI 모두 추적</option><option value="a">AI 1 추적</option><option value="b">AI 2 추적</option><option value="free">자유 카메라</option></select></label><button id="pvpSpecMinus" type="button" aria-label="화면 축소">−</button><span id="pvpSpecZoom">100%</span><button id="pvpSpecPlus" type="button" aria-label="화면 확대">+</button><button id="pvpSpecReset" type="button">시점 초기화</button><button id="pvpSpecStop" type="button">관전 종료</button><span class="pvpSpecHelp">화면 드래그·방향키: 이동 / 휠: 확대·축소</span>';
 stage.appendChild(tools);
 const css=document.createElement('style');
 css.textContent='#pvpLobby .pvp-card{max-height:min(85vh,850px);overflow-y:auto}#pvpAiSpectateSetup{border-top:1px solid #adc8ad55;margin-top:14px;padding-top:12px}#pvpAiSpectateSetup h3{color:#e6c981;font-size:16px;margin:4px 0}#pvpAiSpectateSetup p{font-size:11px;color:#afc9be;line-height:1.7}#pvpAiSpectateSetup .pvpSpectateConfig{display:flex;align-items:end;flex-wrap:wrap;gap:8px}#pvpAiSpectateSetup label{font-size:11px;display:grid;gap:4px}#pvpAiSpectateSetup select{background:#0b2129;color:#f2ead3;border:1px solid #738c80;padding:8px;border-radius:6px}#pvpSpectateTools{position:absolute;z-index:10;bottom:15px;right:14px;left:14px;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:7px;background:#081c27e9;border:1px solid #9ea98789;border-radius:9px;padding:7px 11px;box-shadow:0 5px 20px #0009}#pvpSpectateTools[hidden]{display:none}#pvpSpectateTools button,#pvpSpectateTools select{padding:7px 10px;font-size:11px}#pvpSpectateTools label,#pvpSpecZoom{font-size:11px;color:#eadbab}#pvpSpecZoom{min-width:38px;text-align:center}#pvpSpectateTools .pvpSpecHelp{font-size:10px;color:#b6c9bb}#pvpLayer.spectating #pvpCooldowns,#pvpLayer.spectating #pvpCombo{display:none!important}#pvpLayer.spectating #pvpCanvas{cursor:grab}@media(max-width:650px){#pvpSpectateTools{bottom:8px;padding:5px}#pvpSpectateTools .pvpSpecHelp{display:none}}';
 document.head.appendChild(css);
 $('pvpAiSpectateStart').onclick=()=>start(getConfig());
 $('pvpSpecStop').onclick=()=>stop();
 $('pvpSpecCamera').onchange=e=>{s.mode=e.target.value;if(s.mode==='free'){s.panX=s.cameraX??1800;s.panY=s.cameraY??1050;}};
 function setZoom(z){s.zoom=clamp(z,.32,2);$('pvpSpecZoom').textContent=Math.round(s.zoom*100)+'%';}
 $('pvpSpecMinus').onclick=()=>setZoom(s.zoom/1.2);$('pvpSpecPlus').onclick=()=>setZoom(s.zoom*1.2);
 $('pvpSpecReset').onclick=()=>{s.mode='both';s.panX=1800;s.panY=1050;$('pvpSpecCamera').value='both';setZoom(1);};
 canvas.addEventListener('wheel',e=>{if(!s.active)return;e.preventDefault();setZoom(s.zoom*(e.deltaY>0?1/1.12:1.12));},{passive:false});
 canvas.addEventListener('pointerdown',e=>{if(!s.active||(e.button!==0&&e.button!==1))return;e.preventDefault();s.mode='free';$('pvpSpecCamera').value='free';s.panX=s.cameraX??1800;s.panY=s.cameraY??1050;s.drag={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture?.(e.pointerId);});
 canvas.addEventListener('pointermove',e=>{const d=s.drag;if(!s.active||!d||d.id!==e.pointerId)return;const rect=canvas.getBoundingClientRect();s.panX-=(e.clientX-d.x)*1200/Math.max(1,rect.width)/Math.max(.1,s.actualZoom);s.panY-=(e.clientY-d.y)*700/Math.max(1,rect.height)/Math.max(.1,s.actualZoom);d.x=e.clientX;d.y=e.clientY;});
 for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,e=>{if(s.drag?.id===e.pointerId)s.drag=null;});
}
function getConfig(){const choose=id=>id==='random'?['gale','void','dawn'][Math.floor(Math.random()*3)]:id;return {styleA:choose($('pvpSpecStyleA')?.value||'random'),styleB:choose($('pvpSpecStyleB')?.value||'random'),difficultyA:Number($('pvpSpecDiffA')?.value)||3,difficultyB:Number($('pvpSpecDiffB')?.value)||3};}
async function loadBrain(){if(!s.brainModule)s.brainModule=import('./multiplayer-server/ai/brain.js');return s.brainModule;}
function makeBrain(style,policy,difficulty){return loadBrain().then(m=>m.createBrain(style,policy||m.seedPolicy(),Math.random,difficulty));}
function setActive(on){s.active=!!on;s.pressed.clear();s.drag=null;s.mode='both';s.zoom=1;s.actualZoom=1;s.panX=1800;s.panY=1050;if($('pvpSpecZoom'))$('pvpSpecZoom').textContent='100%';if($('pvpSpecCamera'))$('pvpSpecCamera').value='both';if($('pvpSpectateTools'))$('pvpSpectateTools').hidden=!on;}
function key(code,pressed){if(!s.active)return false;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD'].includes(code)){if(pressed){s.pressed.add(code);if(s.mode!=='free'){s.mode='free';s.panX=s.cameraX??1800;s.panY=s.cameraY??1050;$('pvpSpecCamera').value='free';}}else s.pressed.delete(code);return true;}if(pressed&&code==='Escape'){stop();return true;}if(pressed&&(code==='Equal'||code==='NumpadAdd')){$('pvpSpecPlus')?.click();return true;}if(pressed&&(code==='Minus'||code==='NumpadSubtract')){$('pvpSpecMinus')?.click();return true;}return false;}
function update(camera,me,enemy,dt,W,H,arenaW,arenaH){if(!s.active||!me||!enemy)return;
 if(s.mode==='free'){const speed=950*dt/Math.max(.4,s.zoom),right=(s.pressed.has('ArrowRight')||s.pressed.has('KeyD'))?1:0,left=(s.pressed.has('ArrowLeft')||s.pressed.has('KeyA'))?1:0,down=(s.pressed.has('ArrowDown')||s.pressed.has('KeyS'))?1:0,up=(s.pressed.has('ArrowUp')||s.pressed.has('KeyW'))?1:0;s.panX+=speed*(right-left);s.panY+=speed*(down-up);}
 let x=s.panX,y=s.panY;if(s.mode==='a'){x=me.x;y=me.y;}else if(s.mode==='b'){x=enemy.x;y=enemy.y;}else if(s.mode==='both'){x=(me.x+enemy.x)/2;y=(me.y+enemy.y)/2;}
 const fit=s.mode==='both'?Math.min((W-220)/Math.max(300,Math.abs(me.x-enemy.x)),(H-180)/Math.max(210,Math.abs(me.y-enemy.y))):Infinity;
 // Two-fighter mode always keeps both real positions in view, regardless of manual zoom.
 s.actualZoom=clamp(Math.min(s.zoom,fit),.15,2);
 const z=s.actualZoom,halfX=W/(2*z),halfY=H/(2*z);
 x=halfX*2>arenaW?arenaW/2:clamp(x,halfX,arenaW-halfX);
 y=halfY*2>arenaH?arenaH/2:clamp(y,halfY,arenaH-halfY);
 const smooth=1-Math.exp(-dt*(s.mode==='free'?26:13));camera.x+=(x-camera.x)*smooth;camera.y+=(y-camera.y)*smooth;s.cameraX=camera.x;s.cameraY=camera.y;
}
const zoom=()=>s.active?s.actualZoom:1;
window.EchoesPvpSpectator={mount,getConfig,loadBrain,makeBrain,setActive,key,update,zoom,get active(){return s.active},names};
})();
