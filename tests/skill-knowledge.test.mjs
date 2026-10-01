import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeSkill,analyzeLoadout,rangeFit,skillUseScore,preferredDistance,activeSkillThreat,leadAim} from '../multiplayer-server/ai/skill-knowledge.js';

const skill=(id,mode,extra={})=>({id,name:id,cost:extra.cost??30,cool:extra.cool??5,ultimate:!!extra.ultimate,holdContinuous:!!extra.holdContinuous,holdMax:extra.holdMax||0,cfg:{duration:extra.duration??.8,hits:extra.hits??[.2,.55],mult:extra.mult??[.7,1.2],arc:extra.arc??[1.5,1.8],reach:extra.reach??[40,80],mode,...extra.cfg}});

test('skill analyzer distinguishes projectile, mobility, area and control skills',()=>{
 const wind=analyzeSkill(skill('windSlash','windShot'),0);
 const blink=analyzeSkill(skill('flashRush','galeBlink'),1);
 const pulse=analyzeSkill(skill('galeOrbit','galePulse',{arc:[Math.PI*2],reach:[0]}),2);
 assert.ok(wind.projectile>.9&&wind.effectiveRange>=350);
 assert.ok(blink.mobility>.9&&blink.effectiveRange>=700);
 assert.ok(pulse.area>.9&&pulse.control>.9);
});

test('skill use score favors a skill inside its real range and penalizes a miss-range cast',()=>{
 const blade=analyzeSkill(skill('bladeRain','eventHorizonShear',{reach:[220,230,265],hits:[.18,.52,.88]}),3);
 const near=skillUseScore(blade,{distance:300,selfHpRatio:1,enemyHpRatio:1,staminaRatio:1,maxStamina:500});
 const far=skillUseScore(blade,{distance:900,selfHpRatio:1,enemyHpRatio:1,staminaRatio:1,maxStamina:500});
 assert.ok(near>far+.4);
 assert.ok(rangeFit(blade,300)>rangeFit(blade,900));
});

test('active threat uses the opponent active slot instead of a universal distance',()=>{
 const long=skill('bladeRain','eventHorizonShear',{reach:[220,230,265],hits:[.18,.52,.88],duration:1.05});
 const load=analyzeLoadout([long,null,null,null,null]);
 const enemy={skillPose:0,attackAnim:.85,attackDuration:1.05};
 const danger=activeSkillThreat(enemy,load,320);
 const safe=activeSkillThreat(enemy,load,900);
 assert.equal(danger.active,true);assert.ok(danger.danger>.4);assert.ok(danger.danger>safe.danger);
});

test('preferred spacing and projectile leading come from skill definitions',()=>{
 const load=analyzeLoadout([
  skill('windSlash','windShot'),
  skill('flashRush','galeBlink'),
  skill('galeOrbit','galePulse',{arc:[Math.PI*2],reach:[0]}),
  null,null
 ]);
 const d=preferredDistance(load,[true,true,true,false,false]);
 assert.ok(d>150&&d<500);
 const aimed=leadAim(load[0],0,0,120,300);
 assert.ok(aimed>0,'projectile aim should lead a moving target');
});
