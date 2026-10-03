from pathlib import Path

p=Path('index.html')
s=p.read_text(encoding='utf-8')
old='#pvpLayer.spectating #pvpTouch{display:none!important}\n*/\n/* Compact combat HUD: keep the center of the battlefield clear. */'
new='#pvpLayer.spectating #pvpTouch{display:none!important}\n/* Compact combat HUD: keep the center of the battlefield clear. */'
count=s.count(old)
if count!=1:
    raise SystemExit(f'expected one stray CSS terminator, found {count}')
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')
print('removed stray PVP mobile CSS terminator')
