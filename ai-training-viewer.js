(()=>{
'use strict';
// Read-only split spectator. Combat and learning continue entirely in the worker.
function create(){
 let root=null,enabled=false,pump=null,trainGrid=null,evalGrid=null;
 const panes=new Map();
 const labels={gale:'질풍',void:'이형',dawn:'여명',break:'홍련'};
 const colors={gale:'#64e7ce',void:'#c6a0ff',dawn:'#ffd48a',break:'#ff782e'};

 function init(node){
  if(root)return;
  root=node;root.hidden=true;
  const css=document.createElement('style');
  css.textContent='#aiSpectator{margin-top:16px;padding:12px;border:1px solid #476658;border-radius:9px;background:#0a1921}#aiSpectator .aiSplitHead{margin:10px 0 7px;color:#e9d9ab;font:700 13px/1.4 system-ui}#aiSpectator .aiSplitGrid{display:grid;grid-template-columns:repeat(var(--ai-cols,1),minmax(0,1fr));gap:8px;align-items:start;width:100%}#aiSpectator .aiBattlePane{min-width:0;padding:5px;background:#0d1d24;border:1px solid #3d5a52;border-radius:7px;overflow:hidden}#aiSpectator .aiBattlePane canvas{display:block;width:100%;height:auto;background:#101f25;border:1px solid #4b6c61;border-radius:5px}#aiSpectator .aiBattlePane p{margin:4px 0 0;color:#b6c9c0;font:10px/1.35 system-ui;white-space:normal;overflow-wrap:anywhere}#aiSpectator .aiBattlePane .aiBattleTitle{margin:0 0 5px;color:#f0dfb6;font-weight:700}#aiSpectator .aiSpectatorHint{margin:9px 0 0;color:#8fa99f;font:11px/1.5 system-ui}';
  document.head.appendChild(css);
  const h1=document.createElement('p');h1.className='aiSplitHead';h1.textContent='자율 학습 전투 · 반복 재전투 분할 관전';
  trainGrid=document.createElement('div');trainGrid.className='aiSplitGrid';
  const h2=document.createElement('p');h2.className='aiSplitHead';h2.textContent='성능 검증 전투 · 반복 분할 관전';
  evalGrid=document.createElement('div');evalGrid.className='aiSplitGrid';
  const hint=document.createElement('p');hint.className='aiSpectatorHint';hint.textContent='모든 실제 대전은 최대 6개의 관전 칸에 순서대로 배정됩니다. 관전 시작 즉시 예정된 칸을 모두 표시하며, PC 화면에서는 최대 6개를 한 줄에서 동시에 볼 수 있습니다. 한 대전이 끝난 칸은 다음 대전이 오면 즉시 초기 상태로 바뀌어 재전투를 보여줍니다. 관전은 읽기 전용이라 학습 판정과 속도에는 영향을 주지 않습니다.';
  root.appendChild(h1);root.appendChild(trainGrid);root.appendChild(h2);root.appendChild(evalGrid);root.appendChild(hint);
 }
 function show(on){
  enabled=!!on;
  if(root)root.hidden=!enabled;
  if(enabled)ensurePump();
  else stopPump();
 }
 function stopPump(){if(pump){clearTimeout(pump);pump=null;}}
 const num=(x,fallback=0)=>Number.isFinite(Number(x))?Number(x):fallback;
 const ratio=(a,b)=>Math.max(0,Math.min(1,num(a)/Math.max(1,num(b,1))));

 function setGridColumns(grid,count){
  if(!grid)return;
  const cols=Math.max(1,Math.min(6,Number(count)||1));
  grid.style?.setProperty?.('--ai-cols',String(cols));
 }
 function ensureAllPanes(frame){
  const phase=frame?.phase==='evaluation'?'evaluation':'train';
  const count=Math.max(1,Math.min(6,Number(frame?.laneCount)||1));
  const grid=phase==='evaluation'?evalGrid:trainGrid;
  setGridColumns(grid,count);
  for(let lane=0;lane<count;lane++)ensurePane({...frame,phase,lane,_placeholder:true});
 }
 function ensurePane(frame){
  const phase=frame?.phase==='evaluation'?'evaluation':'train';
  const lane=Math.max(0,Number.isInteger(Number(frame?.lane))?Number(frame.lane):0);
  const key=phase+':'+lane;
  let pane=panes.get(key);
  if(pane)return pane;
  const box=document.createElement('section');box.className='aiBattlePane';
  const title=document.createElement('p');title.className='aiBattleTitle';title.textContent=(phase==='evaluation'?'검증':'학습')+' 슬롯 '+(lane+1);
  const canvas=document.createElement('canvas');canvas.width=360;canvas.height=195;canvas.setAttribute('role','img');canvas.setAttribute('aria-label','AI 훈련 분할 관전 화면');
  const info=document.createElement('p');info.textContent=frame?._placeholder?'전투 배정 대기 중':'전투 대기 중';
  box.appendChild(title);box.appendChild(canvas);box.appendChild(info);
  (phase==='evaluation'?evalGrid:trainGrid)?.appendChild(box);
  pane={key,phase,lane,box,title,canvas,info,queue:[],last:null,lastMatch:null,restarts:0};
  panes.set(key,pane);
  return pane;
 }

 function draw(pane,frame){
  const p=frame?.players;
  const pair=(frame.styles||[]).map(id=>labels[id]||id).join(' vs ');
  pane.title.textContent=(frame.phase==='evaluation'?'검증':'학습')+' '+(pane.lane+1)+' · '+(pair||'AI 대전')+(pane.restarts?` · 재전투 ${pane.restarts}회`:'');
  if(Array.isArray(p)&&p.length===2){
   const status=p.map((f,i)=>(labels[frame.styles?.[i]]||'AI')+' '+Math.round(100*ratio(f.hp,f.maxHp))+'%').join(' / ');
   pane.info.textContent=(frame.match||'?')+'번째 · '+status+' · '+(num(frame.step)/60).toFixed(1)+'초'+(frame.final?' · 종료':'')+' · 세대 사이클 '+(num(frame.cycle)+1);
  }
  pane.last=frame;
  const ctx=pane.canvas?.getContext?.('2d');
  if(!ctx||!Array.isArray(p)||p.length!==2)return;
  const w=pane.canvas.width,h=pane.canvas.height,a=p[0],b=p[1],cx=(num(a.x)+num(b.x))/2,cy=(num(a.y)+num(b.y))/2;
  const scale=Math.min(.27,315/Math.max(850,Math.abs(num(a.x)-num(b.x))*1.8),165/Math.max(550,Math.abs(num(a.y)-num(b.y))*1.8));
  const pos=(x,y)=>[w/2+(num(x)-cx)*scale,h/2+(num(y)-cy)*scale];
  const line=(x,y,x2,y2,color,width=1)=>{ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();};
  ctx.fillStyle='#122329';ctx.fillRect(0,0,w,h);
  for(let x=Math.floor((cx-w/scale/2)/120)*120;x<cx+w/scale/2;x+=120){const v=pos(x,0)[0];line(v,0,v,h,'#cbd9bd13');}
  for(let y=Math.floor((cy-h/scale/2)/120)*120;y<cy+h/scale/2;y+=120){const v=pos(0,y)[1];line(0,v,w,v,'#cbd9bd13');}
  const [midX,midY]=pos(1800,1050);
  ctx.beginPath();ctx.arc(midX,midY,215*scale,0,Math.PI*2);ctx.strokeStyle='#eacb8350';ctx.lineWidth=1.5;ctx.stroke();
  const [x0,y0]=pos(a.x,a.y),[x1,y1]=pos(b.x,b.y);
  ctx.setLineDash([3,6]);line(x0,y0,x1,y1,'#aec8c045');ctx.setLineDash([]);
  for(let i=0;i<2;i++){
   const f=p[i],style=frame.styles?.[i]||'gale',color=colors[style]||'#c4e9dc',[x,y]=pos(f.x,f.y),dir=num(f.a),active=num(f.attackAnim)>0;
   if(num(f.dash)>0){ctx.beginPath();ctx.arc(x,y,17,0,Math.PI*2);ctx.strokeStyle=color+'77';ctx.lineWidth=3;ctx.stroke();}
   if(num(f.skillPose,-1)>=0){ctx.beginPath();ctx.arc(x,y,21,0,Math.PI*2);ctx.strokeStyle=color;ctx.lineWidth=2;ctx.stroke();}
   if(f.block){ctx.beginPath();ctx.arc(x,y,18,dir-1.2,dir+1.2);ctx.strokeStyle='#c5f5ff';ctx.lineWidth=4;ctx.stroke();}
   ctx.fillStyle='#010e1699';ctx.beginPath();ctx.ellipse(x,y+10,13,5,0,0,Math.PI*2);ctx.fill();
   ctx.beginPath();ctx.arc(x,y,11,0,Math.PI*2);ctx.fillStyle=num(f.stun)>0?'#8999a4':color;ctx.strokeStyle='#faf5e8';ctx.lineWidth=1.5;ctx.fill();ctx.stroke();
   line(x+Math.cos(dir)*7,y+Math.sin(dir)*7,x+Math.cos(dir)*(active?23:17),y+Math.sin(dir)*(active?23:17),active?'#ffe9bb':'#c1d3d2',active?4:3);
   ctx.font='bold 10px system-ui';ctx.textAlign='center';ctx.fillStyle=color;ctx.fillText(labels[style]||style,x,y-25);
   ctx.fillStyle='#0b1318';ctx.fillRect(x-23,y-22,46,4);ctx.fillStyle='#eb8787';ctx.fillRect(x-23,y-22,46*ratio(f.hp,f.maxHp),4);
   ctx.fillStyle='#0b1318';ctx.fillRect(x-23,y-16,46,2);ctx.fillStyle='#9bcfcf';ctx.fillRect(x-23,y-16,46*ratio(f.shield,f.maxShield),2);
  }
 }

 function ensurePump(){
  if(pump||!enabled)return;
  const tick=()=>{
   pump=null;
   if(!enabled)return;
   let pending=false;
   for(const pane of panes.values()){
    if(!pane.queue.length)continue;
    // If the server trained much faster than the display, advance through the
    // backlog faster while still showing the beginning, middle and end states.
    const skip=Math.max(1,Math.floor(pane.queue.length/90));
    let frame=null;
    for(let i=0;i<skip&&pane.queue.length;i++)frame=pane.queue.shift();
    if(frame)draw(pane,frame);
    if(pane.queue.length)pending=true;
   }
   if(pending)pump=setTimeout(tick,70);
  };
  pump=setTimeout(tick,0);
 }

 function frame(data){
  if(!enabled||!data)return;
  ensureAllPanes(data);
  const pane=ensurePane(data);
  const matchKey=String(data.cycle??0)+':'+String(data.match??'');
  if(pane.lastMatch!==null&&pane.lastMatch!==matchKey){
   // A new real bout has been assigned to this lane. Drop stale playback from
   // the previous bout and show the new opening frame immediately so the pane
   // visibly restarts instead of sitting on an old 'ended' frame.
   pane.queue.length=0;
   pane.restarts++;
   draw(pane,data);
  }else{
   pane.queue.push(data);
  }
  pane.lastMatch=matchKey;
  // A single slot can receive long 90-second bouts. Bound only frame density,
  // not the number of battle slots, so every split battle remains visible.
  if(pane.queue.length>180){
   const keep=[pane.queue[0]];
   for(let i=2;i<pane.queue.length-1;i+=2)keep.push(pane.queue[i]);
   keep.push(pane.queue.at(-1));
   pane.queue=keep;
  }
  ensurePump();
 }
 return {init,show,frame};
}
window.EchoesAiTrainingViewer=create();
})();
