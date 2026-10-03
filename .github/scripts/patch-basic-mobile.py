from pathlib import Path

p = Path('index.html')
s = p.read_text(encoding='utf-8')


def repl(old, new, count=1, label='patch'):
    global s
    found = s.count(old)
    if found != count:
        raise SystemExit(f'{label}: expected {count}, found {found}')
    s = s.replace(old, new, count)


# Both windup constants are zero. The old renderer condition therefore treated
# the actual swing animation as a windup pose. Remove only that visual branch;
# attackAnim/attackDuration and the real swing pose remain unchanged.
repl(
    "const basicWindupVisual=basicAttackVisual&&!prep&&p.skillPose<0&&p.weapon!==2&&p.attackAnim>0&&p.attackDuration>=BASIC_ATTACK_WINDUP-.005;",
    "const basicWindupVisual=false;",
    label='world basic windup visual',
)
repl(
    "const basicWindupVisual=basicAttackVisual&&!prep&&f.skillPose<0&&f.weapon!==2&&f.attackAnim>0&&f.attackDuration>=PVP_BASIC_WINDUP-.005;",
    "const basicWindupVisual=false;",
    label='pvp basic windup visual',
)

# PVP is a separate input loop. Add a dedicated touch HUD; the normal world
# already has touchAttackPointer/touch joystick handling.
css_marker = "/* Compact combat HUD: keep the center of the battlefield clear. */"
css = r'''/* Mobile PVP controls */
#pvpTouch{display:none;position:absolute;inset:0;z-index:20;pointer-events:none;user-select:none;-webkit-user-select:none}
#pvpTouch button,#pvpTouchStick{pointer-events:auto;touch-action:none;-webkit-tap-highlight-color:transparent}
#pvpTouchStick{position:absolute;left:18px;bottom:24px;width:126px;height:126px;border-radius:50%;border:2px solid #d8e6cf66;background:#0b1b22aa;box-shadow:inset 0 0 24px #0007,0 5px 24px #0006}
#pvpTouchKnob{position:absolute;left:50%;top:50%;width:54px;height:54px;margin:-27px;border-radius:50%;background:#9fc9bca8;border:2px solid #e5f0d899;box-shadow:0 3px 12px #0008;transform:translate(0,0)}
#pvpTouchActions{position:absolute;right:12px;bottom:14px;display:grid;grid-template-columns:repeat(3,58px);gap:7px;align-items:end}
#pvpTouchSkills{position:absolute;right:12px;bottom:154px;display:grid;grid-template-columns:repeat(5,48px);gap:5px}
#pvpTouch button{min-width:0;height:52px;padding:4px;border:1px solid #d8e6cf55;border-radius:12px;background:#102831db;color:#edf2e9;font-size:10px;font-weight:700;box-shadow:0 4px 14px #0007}
#pvpTouch button[data-pvp-touch="attack"]{grid-row:span 2;height:111px;background:#6f2929e8;border-color:#f4aaa777;font-size:14px}
#pvpTouch button[data-pvp-touch="shield"]{background:#285066e8}
#pvpTouch button[data-pvp-touch^="skill"]{height:46px;background:#30264de8;border-color:#c9b5ff55;font-size:12px}
#pvpTouch button.held{transform:scale(.93);filter:brightness(1.35)}
#pvpLobby,.pvp-result{z-index:40}
@media (pointer:coarse),(max-width:900px){#pvpTouch{display:block}.pvp-cooldowns{bottom:210px}}
@media (pointer:fine) and (min-width:901px){#pvpTouch{display:none!important}}
@media (max-height:560px){#pvpTouchStick{width:104px;height:104px;left:10px;bottom:10px}#pvpTouchKnob{width:46px;height:46px;margin:-23px}#pvpTouchActions{right:8px;bottom:8px;grid-template-columns:repeat(3,51px);gap:5px}#pvpTouchActions button{height:44px}#pvpTouch button[data-pvp-touch="attack"]{height:93px}#pvpTouchSkills{right:8px;bottom:110px;grid-template-columns:repeat(5,43px);gap:4px}#pvpTouchSkills button{height:40px}.pvp-cooldowns{bottom:160px}}
#pvpLayer.spectating #pvpTouch{display:none!important}
*/
'''
repl(css_marker, css + css_marker, label='pvp touch css')

html_marker = '<div class="pvp-cooldowns hidden" id="pvpCooldowns"></div>'
html = html_marker + r'''
  <div id="pvpTouch" aria-label="PVP 모바일 조작">
   <div id="pvpTouchStick" aria-label="이동 조이스틱"><i id="pvpTouchKnob"></i></div>
   <div id="pvpTouchSkills">
    <button data-pvp-touch="skill0">1</button><button data-pvp-touch="skill1">2</button><button data-pvp-touch="skill2">3</button><button data-pvp-touch="skill3">4</button><button data-pvp-touch="skill4">5</button>
   </div>
   <div id="pvpTouchActions">
    <button data-pvp-touch="attack">공격</button><button data-pvp-touch="dash">대쉬</button><button data-pvp-touch="shield">쉴드</button><button data-pvp-touch="sprint">달리기</button><button data-pvp-touch="potion">회복</button>
   </div>
  </div>'''
repl(html_marker, html, label='pvp touch html')

key_marker = "let pvpKeybinds={...PVP_KEY_DEFAULTS};"
repl(
    key_marker,
    key_marker + "\nlet pvpTouchAttack=false,pvpTouchSprint=false,pvpTouchMove={x:0,y:0},pvpTouchStickPointer=null;",
    label='pvp touch state',
)
repl(
    "function pvpBasicHeld(){return mouse.down||keys.has(pkey('KeyZ'));}",
    "function pvpBasicHeld(){return mouse.down||pvpTouchAttack||keys.has(pkey('KeyZ'));}",
    label='pvp held attack',
)

old_input = "function input(dt){if(!me||roundLocked)return;let x=(keys.has(pkey('KeyD'))?1:0)-(keys.has(pkey('KeyA'))?1:0),y=(keys.has(pkey('KeyS'))?1:0)-(keys.has(pkey('KeyW'))?1:0),mag=Math.hypot(x,y);"
new_input = "function input(dt){if(!me||roundLocked)return;let x=(keys.has(pkey('KeyD'))?1:0)-(keys.has(pkey('KeyA'))?1:0)+pvpTouchMove.x,y=(keys.has(pkey('KeyS'))?1:0)-(keys.has(pkey('KeyW'))?1:0)+pvpTouchMove.y,mag=Math.hypot(x,y);"
repl(old_input, new_input, label='pvp touch movement')
repl(
    "const sprint=keys.has(pkey('ShiftLeft'))&&mag>0",
    "const sprint=(keys.has(pkey('ShiftLeft'))||pvpTouchSprint)&&mag>0",
    label='pvp touch sprint',
)

handler_marker = "$('pvpBtn')?.addEventListener('click',open);"
touch_code = r'''function releasePvpTouchShield(){
 if(!me)return;const wasRaised=me.block||me.shieldNeedsRelease||me.shield<me.maxShield;pvpShieldKeyLatched=false;me.block=false;me.parryWindow=0;me.shieldNeedsRelease=false;if(wasRaised)me.shieldRearm=Math.max(me.shieldRearm||0,.5);
}
function resetPvpTouchControls(){
 pvpTouchAttack=false;pvpTouchSprint=false;pvpTouchMove.x=pvpTouchMove.y=0;pvpTouchStickPointer=null;const knob=$('pvpTouchKnob');if(knob)knob.style.transform='translate(0,0)';document.querySelectorAll('#pvpTouch .held').forEach(b=>b.classList.remove('held'));if(me?.block)releasePvpTouchShield();
}
function initPvpTouchControls(){
 const ui=$('pvpTouch'),stick=$('pvpTouchStick'),knob=$('pvpTouchKnob');if(!ui||!stick||!knob||ui.dataset.bound==='1')return;ui.dataset.bound='1';
 const move=e=>{if(e.pointerId!==pvpTouchStickPointer)return;const r=stick.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,max=r.width*.34;let dx=e.clientX-cx,dy=e.clientY-cy,n=Math.hypot(dx,dy);if(n>max){dx=dx/n*max;dy=dy/n*max;n=max}if(n<max*.12)dx=dy=0;pvpTouchMove.x=dx/max;pvpTouchMove.y=dy/max;knob.style.transform=`translate(${dx}px,${dy}px)`;};
 const stop=e=>{if(e.pointerId!==pvpTouchStickPointer)return;pvpTouchStickPointer=null;pvpTouchMove.x=pvpTouchMove.y=0;knob.style.transform='translate(0,0)';try{stick.releasePointerCapture(e.pointerId)}catch{}};
 stick.addEventListener('pointerdown',e=>{if(spectating||!running||pvpTouchStickPointer!==null)return;e.preventDefault();pvpTouchStickPointer=e.pointerId;try{stick.setPointerCapture(e.pointerId)}catch{}move(e)});
 stick.addEventListener('pointermove',e=>{if(e.pointerId===pvpTouchStickPointer){e.preventDefault();move(e)}});for(const type of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(type,stop);
 ui.querySelectorAll('[data-pvp-touch]').forEach(b=>{
  const down=e=>{if(spectating||!running)return;e.preventDefault();const act=b.dataset.pvpTouch;b.dataset.pvpHeld='1';b.classList.add('held');try{b.setPointerCapture(e.pointerId)}catch{}if(act==='attack'){pvpTouchAttack=true;basic()}else if(act==='dash')dash();else if(act==='shield'){pvpShieldKeyLatched=true;beginBlock()}else if(act==='sprint')pvpTouchSprint=true;else if(act==='potion')potion();else if(act.startsWith('skill'))skillDown(Number(act.slice(5)));};
  const up=e=>{if(b.dataset.pvpHeld!=='1')return;e.preventDefault();b.dataset.pvpHeld='0';b.classList.remove('held');const act=b.dataset.pvpTouch;if(act==='attack')pvpTouchAttack=false;else if(act==='shield')releasePvpTouchShield();else if(act==='sprint')pvpTouchSprint=false;else if(act.startsWith('skill'))skillUp(Number(act.slice(5)));try{if(b.hasPointerCapture(e.pointerId))b.releasePointerCapture(e.pointerId)}catch{}};
  b.addEventListener('pointerdown',down);for(const type of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(type,up);b.addEventListener('contextmenu',e=>e.preventDefault());
 });
 window.addEventListener('blur',resetPvpTouchControls);document.addEventListener('visibilitychange',()=>{if(document.hidden)resetPvpTouchControls()});
}
initPvpTouchControls();
'''
repl(handler_marker, touch_code + handler_marker, label='pvp touch handlers')

repl(
    "function close(){stopNet();layer.classList.add('hidden');document.querySelector('#title')?.classList.remove('hidden')}",
    "function close(){resetPvpTouchControls();stopNet();layer.classList.add('hidden');document.querySelector('#title')?.classList.remove('hidden')}",
    label='pvp touch close reset',
)

p.write_text(s, encoding='utf-8')
print('patched index.html')
