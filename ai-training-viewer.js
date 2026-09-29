(()=>{
'use strict';
// Optional, read-only visualization. Combat and learning continue in the worker.
function create(){
 let root=null,canvas=null,info=null,enabled=false,pending=null,queued=false;
 const labels={gale:'질풍',void:'이형',dawn:'여명'};
 const colors={gale:'#64e7ce',void:'#c6a0ff',dawn:'#ffd48a'};
 function init(node){
  if(root)return;
  root=node;root.hidden=true;
  const css=document.createElement('style');
  css.textContent='#aiSpectator{margin-top:16px;padding:12px;border:1px solid #476658;border-radius:9px;background:#0a1921}#aiSpectator canvas{display:block;max-width:100%;width:100%;height:auto;background:#101f25;border:1px solid #4b6c61;border-radius:6px}#aiSpectator p{margin:7px 0;color:#b6c9c0;font:12px/1.6 system-ui}#aiSpectator .aiPreviewTitle{color:#e9d9ab;font-size:13px;font-weight:600}';
  document.head.appendChild(css);
  info=document.createElement('p');info.className='aiPreviewTitle';info.textContent='훈련 시작 후 대전 화면이 나타납니다.';
  canvas=document.createElement('canvas');canvas.width=720;canvas.height=390;canvas.setAttribute('role','img');canvas.setAttribute('aria-label','AI 훈련 대전 위치, HP, 방어와 스킬 사용');
  const hint=document.createElement('p');hint.textContent='실제 훈련 대전의 위치와 전투 상태를 간략히 보여줍니다. 원본 게임의 모든 이펙트는 표시하지 않습니다.';
  root.appendChild(info);root.appendChild(canvas);root.appendChild(hint);
 }
 function show(on){enabled=!!on;if(root)root.hidden=!enabled;if(!enabled){pending=null;queued=false;}else if(info)info.textContent='AI 대전 화면 연결됨 · 훈련을 시작하면 전투가 표시됩니다.';}
 const num=(x,fallback=0)=>Number.isFinite(Number(x))?Number(x):fallback;
 const ratio=(a,b)=>Math.max(0,Math.min(1,num(a)/Math.max(1,num(b,1))));
 function draw(frame){
  const ctx=canvas?.getContext?.('2d'),p=frame?.players;
  if(!ctx||!Array.isArray(p)||p.length!==2)return;
  const w=canvas.width,h=canvas.height,a=p[0],b=p[1],cx=(num(a.x)+num(b.x))/2,cy=(num(a.y)+num(b.y))/2;
  const scale=Math.min(.54,635/Math.max(850,Math.abs(num(a.x)-num(b.x))*1.8),330/Math.max(550,Math.abs(num(a.y)-num(b.y))*1.8));
  const pos=(x,y)=>[w/2+(num(x)-cx)*scale,h/2+(num(y)-cy)*scale];
  const line=(x,y,x2,y2,color,width=1)=>{ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();};
  ctx.fillStyle='#122329';ctx.fillRect(0,0,w,h);
  for(let x=Math.floor((cx-w/scale/2)/120)*120;x<cx+w/scale/2;x+=120){const v=pos(x,0)[0];line(v,0,v,h,'#cbd9bd13');}
  for(let y=Math.floor((cy-h/scale/2)/120)*120;y<cy+h/scale/2;y+=120){const v=pos(0,y)[1];line(0,v,w,v,'#cbd9bd13');}
  const [midX,midY]=pos(1800,1050);
  ctx.beginPath();ctx.arc(midX,midY,215*scale,0,Math.PI*2);ctx.strokeStyle='#eacb8350';ctx.lineWidth=2;ctx.stroke();
  const [x0,y0]=pos(a.x,a.y),[x1,y1]=pos(b.x,b.y);
  ctx.setLineDash([5,9]);line(x0,y0,x1,y1,'#aec8c050');ctx.setLineDash([]);
  for(let i=0;i<2;i++){
   const f=p[i],style=frame.styles?.[i]||'gale',color=colors[style]||'#c4e9dc',[x,y]=pos(f.x,f.y),dir=num(f.a),active=num(f.attackAnim)>0;
   if(num(f.dash)>0){ctx.beginPath();ctx.arc(x,y,25,0,Math.PI*2);ctx.strokeStyle=color+'77';ctx.lineWidth=5;ctx.stroke();}
   if(num(f.skillPose,-1)>=0){ctx.beginPath();ctx.arc(x,y,31,0,Math.PI*2);ctx.strokeStyle=color;ctx.lineWidth=3;ctx.stroke();}
   if(f.block){ctx.beginPath();ctx.arc(x,y,27,dir-1.2,dir+1.2);ctx.strokeStyle='#c5f5ff';ctx.lineWidth=6;ctx.stroke();}
   ctx.fillStyle='#010e1699';ctx.beginPath();ctx.ellipse(x,y+16,20,7,0,0,Math.PI*2);ctx.fill();
   ctx.beginPath();ctx.arc(x,y,17,0,Math.PI*2);ctx.fillStyle=num(f.stun)>0?'#8999a4':color;ctx.strokeStyle='#faf5e8';ctx.lineWidth=2;ctx.fill();ctx.stroke();
   line(x+Math.cos(dir)*11,y+Math.sin(dir)*11,x+Math.cos(dir)*(active?35:25),y+Math.sin(dir)*(active?35:25),active?'#ffe9bb':'#c1d3d2',active?6:4);
   ctx.font='bold 13px system-ui';ctx.textAlign='center';ctx.fillStyle=color;ctx.fillText(labels[style]||style,x,y-40);
   ctx.fillStyle='#0b1318';ctx.fillRect(x-32,y-35,64,5);ctx.fillStyle='#eb8787';ctx.fillRect(x-32,y-35,64*ratio(f.hp,f.maxHp),5);
   ctx.fillStyle='#0b1318';ctx.fillRect(x-32,y-28,64,3);ctx.fillStyle='#9bcfcf';ctx.fillRect(x-32,y-28,64*ratio(f.shield,f.maxShield),3);
  }
  const status=p.map((f,i)=>(labels[frame.styles?.[i]]||'AI')+' HP '+Math.round(100*ratio(f.hp,f.maxHp))+'%').join(' VS ');
  if(info)info.textContent=(frame.phase==='evaluation'?'성능 검증':'자율 학습')+' · '+(frame.match||'?')+'번째 대전 · '+status+' · 경기 '+(num(frame.step)/60).toFixed(1)+'초'+(frame.final?' · 종료':'');
 }
 function frame(data){
  if(!enabled)return;
  pending=data;
  if(queued)return;
  queued=true;
  const schedule=window.requestAnimationFrame||((fn)=>setTimeout(fn,0));
  schedule(()=>{queued=false;const current=pending;pending=null;if(enabled&&current)draw(current);});
 }
 return {init,show,frame};
}
window.EchoesAiTrainingViewer=create();
})();
