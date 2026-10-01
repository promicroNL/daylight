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
