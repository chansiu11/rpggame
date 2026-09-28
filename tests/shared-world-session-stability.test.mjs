import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server=fs.readFileSync(new URL('../multiplayer-server/server.js',import.meta.url),'utf8');
const client=fs.readFileSync(new URL('../multiplayer-client.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('automatic reconnects use a stable browser-session id and do not trigger account replacement',()=>{
 assert.match(client,/CLIENT_SESSION_KEY='echoes_multi_client_session_v1'/);
 assert.match(client,/clientSessionId:state\.clientSessionId/);
 assert.match(server,/player\.clientSessionId=cleanClientSessionId\(msg\.clientSessionId\)/);
 assert.match(server,/const sameClient=!!player\.clientSessionId&&old\.clientSessionId===player\.clientSessionId/);
 assert.match(server,/old\.ws\.close\(4000,'reconnect superseded'\)/);
});

test('real duplicate multiplayer connections no longer log the user out of the account',()=>{
 const marker="m.on('session:replaced'";
 const p=html.indexOf(marker);
 assert.ok(p>=0);
 const snippet=html.slice(p,p+550);
 assert.doesNotMatch(snippet,/logoutAccount/);
 assert.match(snippet,/m\.disconnect\(\)/);
 assert.match(snippet,/계정 로그인은 유지됩니다/);
 assert.match(server,/connectionOnly:true/);
});

test('shared-world server accepts level 200 clients',()=>{
 assert.match(server,/player\.level=Math\.floor\(clamp\(msg\.level,1,200\)\)/);
 assert.match(server,/player\.level=Math\.floor\(clamp\(msg\.level,1,200\)\)/);
});

test('network load is reduced without lowering the 33ms combat simulation tick',()=>{
 assert.match(server,/const SIM_TICK_MS = 33;/);
 assert.match(server,/const MOB_NET_TICK_MS = 100;/);
 assert.match(server,/now-ambientSelectionAt>=200/);
 assert.match(server,/now-\(player\.lastSelfAckAt\|\|0\)>=100/);
 assert.match(html,/multiNetTimer>=\.066/);
});

test('target scans avoid square roots in the ambient selection hot path',()=>{
 const start=server.indexOf('function buildAmbientAggroSelections()');
 const end=server.indexOf('function serverStyleRange',start);
 const hot=server.slice(start,end);
 assert.match(hot,/d2=dx\*dx\+dy\*dy/);
 assert.doesNotMatch(hot,/Math\.hypot/);
});


test('brief websocket drops keep world session state during the reconnect grace period',()=>{
 const client=fs.readFileSync(new URL('../multiplayer-client.js',import.meta.url),'utf8');
 assert.match(client,/reconnectGraceTimer:null/);
 assert.match(client,/state\.reconnectAttempts===1\?180/);
 assert.match(client,/\},2200\)/);
 assert.match(client,/if\(state\.reconnectGraceTimer\)\{clearTimeout\(state\.reconnectGraceTimer\)/);
 assert.match(html,/multiplayer-client\.js\?v=20260928-style-transfer-reconnect-1/);
});
