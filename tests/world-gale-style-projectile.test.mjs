import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../multiplayer-server/server.js',import.meta.url),'utf8');

test('world Gale ultimate does not stack a second player-only 720 knockback',()=>{
 const p=html.indexOf("else if(mode==='galePursuit')");
 assert.ok(p>=0);
 const block=html.slice(p,p+7000);
 assert.match(block,/push=720/);
 assert.doesNotMatch(block,/worldTargetControl\(hit\.id,\{dx:pdx,dy:pdy/);
 assert.match(block,/if\(target\.networkPlayer\)\{\/\* 서버 권한형 플레이어는 첫 적중 넉백만 사용/);
 assert.doesNotMatch(block,/worldTargetControl\(target\.id,\{x:tx,y:ty,stun:\.34/);
});

test('style mob projectile shapes carry real projectile metadata',()=>{
 assert.match(server,/projectile=null\)=>\(\{type:'segment',x1,y1,x2,y2,w,projectile\}\)/);
 assert.match(server,/projectileDamage=!directHit&&projectiles\.length\?baseDamage:0/);
 assert.match(server,/broadcast\(\{\.\.\.packet,damage:0,projectileDamage:0\}/);
});

test('style projectile damage is deferred to the normal world projectile collision loop',()=>{
 assert.match(html,/function spawnStyleAdeptNetworkDamageProjectiles\(e,msg\)/);
 assert.match(html,/projectileDamage/);
 assert.match(html,/owner:'enemy',kind:'wave'/);
 const handler=html.slice(html.indexOf("m.on('world:mobAttack'"),html.indexOf("m.on('world:projectileHit'"));
 assert.match(handler,/spawnStyleAdeptNetworkDamageProjectiles\(e,msg\)/);
 assert.match(html,/else if\(distance\(p,player\)<player\.r\+p\.r\)\{const result=hitPlayer\(p\.damage,p,true\)/);
});

test('collision-only style projectiles reuse the existing visual projectile and are not double drawn',()=>{
 assert.match(html,/p\._styleCollisionOnly\|\|!visible\(p\)/);
 assert.match(html,/if\(result==='parried'\)\{p\._styleCollisionOnly=false;/);
});
