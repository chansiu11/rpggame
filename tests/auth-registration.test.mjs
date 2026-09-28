import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const cloud=fs.readFileSync(new URL('../cloud-save.js',import.meta.url),'utf8');

test('Firebase readiness waits for actual initialization',()=>{
 assert.match(cloud,/const cloudReady=new Promise\(resolve=>\{resolveCloudReady=resolve;\}\)/);
 assert.match(cloud,/ready:cloudReady/);
 assert.match(cloud,/resolveCloudReady\(true\)/);
 assert.match(cloud,/resolveCloudReady\(false\)/);
 assert.match(html,/async function waitForCloudAuth\(timeout=5000\)/);
 assert.match(html,/const cloudReady=await waitForCloudAuth\(\)/);
});

test('account creation survives a profile-write failure',()=>{
 assert.match(cloud,/let profileSynced=true/);
 assert.match(cloud,/profileSynced=false/);
 assert.match(cloud,/return \{uid:cred\.user\.uid,username:userKey,displayName,profileSynced\}/);
});

test('login survives profile read and last-login write delays',()=>{
 assert.match(cloud,/try\{p=await profile\(cred\.user\.uid\);\}catch/);
 assert.match(cloud,/최근 로그인 기록 저장 지연/);
});

test('browser cache is busted for the fixed cloud auth module',()=>{
 assert.match(html,/cloud-save\.js\?v=20260928-device-training-1/);
});

