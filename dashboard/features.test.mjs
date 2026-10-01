import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {importData} from './import.mjs';
import {validValue} from './metrics.js';
import {normalizeDataset,rowsBetween,trailingMean,time} from './model.js';
function fixture(files,check){const root=fs.mkdtempSync(path.join(os.tmpdir(),'daylight-fixture-'));try{for(const [name,body]of Object.entries(files)){const p=path.join(root,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,typeof body==='string'?body:JSON.stringify(body));}check(importData(root));}finally{fs.rmSync(root,{recursive:true,force:true});}}
test('new activity sources replace legacy days, copies deduplicate, zeros survive',()=>fixture({
  'legacy/steps-test.json':[{dateTime:'01/01/24 01:00:00',value:'900'},{dateTime:'01/02/24 01:00:00',value:'50'}],
  'new/steps_2024-01.csv':'timestamp,steps,data source\n2024-01-01T01:00:00Z,0,watch\n2024-01-01T02:00:00Z,100,watch\n',
  'copy/steps_2024-01.csv':'timestamp,steps,data source\n2024-01-01T01:00:00Z,0,watch\n2024-01-01T02:00:00Z,100,watch\n',
  'calories_2024-01.csv':'timestamp,calories,data source\n2024-01-01T01:00:00Z,2,watch\n2024-01-01T02:00:00Z,3,watch\n',
  'active_energy_burned_2024-01.csv':'timestamp,Kilocalories,data source\n2024-01-01T01:00:00Z,1,watch\n',
  'active_zone_minutes_2024-01.csv':'timestamp,heart rate zone,total minutes,data source\n2024-01-01T01:00:00Z,cardio,2,watch\n',
  'distance_2024-01.csv':'timestamp,distance,data source\n2024-01-01T01:00:00Z,1500,watch\n',
},d=>{const a=d.records[0];assert.equal(a.steps,100);assert.equal(d.records[1].steps,50);assert.equal(a.calories,5);assert.equal(a.activeCalories,1);assert.equal(a.zoneMinutes,2);assert.equal(a.distance,1.5);assert.equal(d.summary.duplicateObservations,2);}));
test('body and recovery units, invalid sentinels and signed deviations',()=>fixture({
  'weight.csv':'timestamp,weight grams\n2024-01-01T08:00:00Z,75000\n2024-01-01T09:00:00Z,76000\n',
  'daily_sleep_temperature_derivations.csv':'timestamp,nightly temperature celsius,baseline temperature celsius\n2024-01-01,33,34\n2024-01-02,33,NaN\n',
  'Stress Score.csv':'DATE,STRESS_SCORE,STATUS,CALCULATION_FAILED\n2024-01-01,0,NO_DATA,true\n2024-01-02,75,READY,false\n',
  'respiratory_rate_sleep_summary_2024.csv':'timestamp,full sleep stats - milli breaths per minute\n2024-01-01,15500\n',
  'daily_readiness.csv':'timestamp,score\n2024-01-01,85\n',
  'Daily SpO2 - test.csv':'timestamp,average_value\n2024-01-01,96.5\n2024-01-02,NaN\n'
},d=>{assert.equal(d.records[0].weight,76);assert.equal(d.records[0].tempDelta,-1);assert.equal(d.records[1].tempDelta,undefined);assert.equal(d.records[0].stress,undefined);assert.equal(d.records[1].stress,75);assert.equal(d.records[0].respiratory,15.5);assert.equal(d.records[0].spo2,96.5);assert.equal(d.records[0].readiness,85);assert.equal(validValue('steps',0),0);assert.equal(validValue('rest',0),null);assert.equal(validValue('tempDelta',-1),-1);}));
test('distinct sleep sessions sum on end date, stages deduplicate, migrated legacy day excluded',()=>fixture({
  'UserSleeps_2024.csv':'sleep_id,sleep_start,sleep_end,minutes_asleep,minutes_awake,sleep_last_updated\na,2023-12-31T23:00:00Z,2024-01-01T07:00:00Z,420,60,2024-01-01\nb,2024-01-01T14:00:00Z,2024-01-01T15:00:00Z,50,10,2024-01-01\n',
  'UserSleepStages_2024.csv':'sleep_id,sleep_stage_id,sleep_stage_type,sleep_stage_start,sleep_stage_end,sleep_stage_last_updated\na,x,DEEP,2024-01-01T01:00:00Z,2024-01-01T02:00:00Z,2024-01-01\na,x,DEEP,2024-01-01T01:00:00Z,2024-01-01T02:00:00Z,2024-01-01\n',
  'sleep-2024.json':[{logId:999,startTime:'2023-12-31T23:00:00',endTime:'2024-01-01T07:00:00',minutesAsleep:420,minutesAwake:60},{logId:1000,startTime:'2024-01-02T00:00:00',endTime:'2024-01-02T07:00:00',minutesAsleep:400,minutesAwake:20}]
},d=>{assert.equal(d.records[0].sleepHours,470/60);assert.equal(d.records[0].awakeMinutes,70);assert.equal(d.records[0].deep,60);assert.equal(d.records[0].light,undefined);assert.equal(d.sleepSessions.length,3);assert.equal(d.records[1].sleepHours,400/60);}));
test('exercise allowlist, units, deleted rows and precedence',()=>fixture({
  'UserExercises_2024.csv':'exercise_id,exercise_start,exercise_end,activity_name,log_type,tracker_total_distance_mm,tracker_total_calories,tracker_avg_heart_rate,exercise_last_updated,deletion_reason,location_metadata\na,2024-01-01T10:00:00Z,2024-01-01T10:30:00Z,Run,TRACKER,5000000,300,130,2024-01-01,,PRIVATE\nb,2024-01-02T10:00:00Z,2024-01-02T10:30:00Z,Run,TRACKER,5000000,300,130,2024-01-02,USER_DELETED,PRIVATE\n',
  'exercise-0.json':[{logId:9,startTime:'01/01/24 10:00:00',duration:1800000,activityName:'Run',distance:3,distanceUnit:'mile'},{logId:10,startTime:'01/03/24 10:00:00',duration:1800000,activityName:'Walk',distance:1,distanceUnit:'mile'}]
},d=>{assert.equal(d.exercises.length,2);assert.equal(d.exercises[0].distance,5);assert.equal(d.exercises[0].duration,30);assert.equal(d.exercises[1].distance,1.609344);assert.ok(!JSON.stringify(d).includes('PRIVATE'));assert.equal(d.exercises[0].heart,130);}));
test('overlapping heart files deduplicate by timestamp',()=>fixture({
  'a/heart_rate-1.json':[{dateTime:'01/01/24 01:00:00',value:{bpm:60}},{dateTime:'01/01/24 02:00:00',value:{bpm:80}}],
  'b/heart_rate-2.json':[{dateTime:'01/01/24 01:00:00',value:{bpm:60}}]
},d=>{assert.equal(d.samples,2);assert.equal(d.records[0].heart,70);assert.equal(d.summary.duplicateObservations,1);}));
test('summary separates empty, unsupported, failed and parsed inputs',()=>fixture({
  'steps_2024-01.csv':'timestamp,steps\n2024-01-01,0\n',
  'weight.csv':'timestamp,weight grams\n',
  'daily_readiness.csv':'wrong,header\n1,2\n',
  'calories_in_heart_rate_zone_2024.csv':'timestamp,kcal\n2024-01-01,3\n',
  'profile.csv':'name\nprivate\n'
},d=>{assert.equal(d.summary.parsed,1);assert.equal(d.summary.empty,1);assert.equal(d.summary.failed,1);assert.equal(d.summary.unsupported,2);assert.equal(d.metrics.weight.days,0);}));
test('sleep scores use preferred latest timestamp, not average of multiple sessions',()=>fixture({
  'sleep_score.csv':'timestamp,overall_score\n2024-01-01T07:00:00Z,70\n',
  'UserSleepScores_2024.csv':'score_time,overall_score\n2024-01-01T07:00:00Z,80\n2024-01-01T09:00:00Z,90\n'
},d=>assert.equal(d.records[0].sleep,90)));
test('legacy datasets and trailing means keep gaps and include pre-range readings',()=>{
 const d=normalizeDataset({records:[{date:'2024-01-01',sleep:70},{date:'2024-01-03',sleep:90}],metrics:{sleep:{days:2}}});
 assert.equal(d.schemaVersion,1);assert.deepEqual(d.exercises,[]);assert.equal(d.metrics.steps.days,0);
 const map=new Map(d.records.map(r=>[r.date,r])),rows=rowsBetween(map,time('2024-01-02'),time('2024-01-03'));
 assert.deepEqual(trailingMean(rows,'sleep',3,map),[null,80]);
});

test('competing v1/v2 sleep estimates are not added; stages and score follow retained session',()=>fixture({
 'UserSleeps_2026.csv':'sleep_id,sleep_start,sleep_end,minutes_asleep,minutes_awake,sleep_last_updated,algorithm_version\nv1,2026-03-16T22:09:00Z,2026-03-17T05:35:30Z,405,41,2026-03-17T05:39:41Z,sleep_session_v1\nv2,2026-03-16T22:12:00Z,2026-03-17T05:29:00Z,412,24,2026-03-17T09:34:58Z,sleep_session_v2\nnap,2026-03-17T14:00:00Z,2026-03-17T14:30:00Z,25,5,2026-03-17T15:00:00Z,sleep_session_v2\n',
 'UserSleepStages_2026.csv':'sleep_id,sleep_stage_id,sleep_stage_type,sleep_stage_start,sleep_stage_end,sleep_stage_last_updated\nv1,s1,DEEP,2026-03-17T01:00:00Z,2026-03-17T02:00:00Z,2026-03-17\nv2,s2,DEEP,2026-03-17T01:00:00Z,2026-03-17T02:10:00Z,2026-03-17\n',
 'UserSleepScores_2026.csv':'sleep_id,score_time,overall_score,sleep_score_last_updated\nv1,2026-03-17T05:35:30Z,83,2026-03-17T05:39:41Z\nv2,2026-03-17T05:29:00Z,82,2026-03-17T09:34:58Z\n'
},d=>{assert.equal(d.records[0].sleepHours,405/60);assert.equal(d.records[0].deep,60);assert.equal(d.records[0].sleep,83);assert.equal(d.sleepSessions.length,1);assert.equal(d.sleepVariants.v2.sessions.length,2);assert.equal(d.summary.overlappingSleepSessions,1);}));
test('partial nested sleep records and equal-width updated copies retain one full interval',()=>fixture({
 'UserSleeps_2026.csv':'sleep_id,sleep_start,sleep_end,minutes_asleep,minutes_awake,sleep_last_updated\na,2026-03-09T21:32:30Z,2026-03-10T05:53:30Z,428,73,2026-03-10T06:00:09Z\nb,2026-03-10T01:51:00Z,2026-03-10T05:52:00Z,236,5,2026-03-10T20:48:06Z\nc,2026-03-11T00:00:00Z,2026-03-11T06:00:00Z,330,30,2026-03-11T07:00:00Z\nd,2026-03-11T00:00:00Z,2026-03-11T06:00:00Z,335,25,2026-03-11T08:00:00Z\n'
},d=>{assert.equal(d.records[0].sleepHours,428/60);assert.equal(d.records[1].sleepHours,335/60);assert.deepEqual(d.sleepSessions.map(s=>s.id),['a','d']);}));

test('sleep versions stay separate; hybrid prefers v2 and fills only absent episodes',async()=>{
 const {buildSleepVariants,applySleepVariant,compareSleepVersions,flagExerciseOverlaps}=await import('./sleep-data.js');
 const sessions=[{id:'a',date:'2026-03-09',start:'2026-03-08T22:00:00',end:'2026-03-09T06:00:00',minutes:420,score:80,algorithm:'sleep_session_v1'},{id:'b',date:'2026-03-10',start:'2026-03-09T22:00:00',end:'2026-03-10T06:00:00',minutes:420,score:80,algorithm:'sleep_session_v1'},{id:'c',date:'2026-03-10',start:'2026-03-10T02:00:00',end:'2026-03-10T06:00:00',minutes:230,score:70,algorithm:'sleep_session_v2'}];
 const variants=buildSleepVariants(sessions);assert.equal(variants.v1.records.length,2);assert.equal(variants.v2.records.length,1);assert.deepEqual(variants.hybrid.sessions.map(s=>s.id),['a','c']);assert.equal(variants.hybrid.records[1].sleepHours,230/60);
 const data={records:[{date:'2026-03-09',sleep:80,sleepHours:7,steps:100},{date:'2026-03-10',sleep:80,sleepHours:7}],sleepVariants:variants};const v2=applySleepVariant(data,'v2');assert.equal(v2.records[0].sleep,undefined);assert.equal(v2.records[0].steps,100);assert.equal(v2.records[1].sleep,70);assert.equal(compareSleepVersions(variants,'2026-03-10','2026-03-10').length,1);
 const workouts=flagExerciseOverlaps([{id:'x',type:'Walk',start:'2026-03-10T10:00:00',duration:30},{id:'y',type:'Walk',start:'2026-03-10T10:01:00',duration:29},{id:'z',type:'Run',start:'2026-03-10T10:01:00',duration:29}]);assert.deepEqual(workouts[0].possibleOverlapIds,['y']);assert.deepEqual(workouts[2].possibleOverlapIds,[]);
});

test('version projection retains dates unique to another algorithm and score-only imports',async()=>{
 const {applySleepVariant}=await import('./sleep-data.js');
 const data={records:[{date:'2026-01-01',steps:4,sleep:80}],sleepVariants:{v2:{records:[{date:'2026-01-02',sleepHours:7}],sessions:[],excluded:[]}}};
 const projected=applySleepVariant(data,'v2');assert.equal(projected.records.length,2);assert.equal(projected.records[0].sleep,undefined);assert.equal(projected.records[1].sleepHours,7);
 fixture({'UserSleepScores_2026.csv':'score_time,overall_score\n2026-01-01,80\n'},d=>{assert.equal(d.records[0].sleep,80);assert.equal(d.sleepVariants,undefined);});
});

test('legacy sleep scores remain linked in unversioned and hybrid views',()=>fixture({
 'sleep-2024.json':[{logId:42,startTime:'2024-01-01T00:00:00',endTime:'2024-01-01T07:00:00',minutesAsleep:390,minutesAwake:30}],
 'sleep_score.csv':'sleep_log_entry_id,timestamp,overall_score,resting_heart_rate\n42,2024-01-01T07:00:00Z,81,58\n'
},d=>{assert.equal(d.defaultSleepVersion,'unversioned');assert.equal(d.records[0].sleep,81);assert.equal(d.sleepVariants.hybrid.records[0].sleep,81);assert.equal(d.sleepVariants.unversioned.records[0].sleepRest,58);}));
