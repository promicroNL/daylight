import fs from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {csv} from './import.mjs';
const root=new URL('../Google%20Health/',import.meta.url),generated=new URL('./data.json',import.meta.url);
const available=fs.existsSync(root)&&fs.existsSync(generated);
test('real export: reconcile activity, recovery, sleep and exercise with source rows',{skip:!available},()=>{
 const data=JSON.parse(fs.readFileSync(generated));if(data.schemaVersion<2)return;
 const rows=(dir,prefix)=>{const url=new URL(dir+'/',root);return fs.existsSync(url)?fs.readdirSync(url).filter(n=>n.startsWith(prefix)&&n.endsWith('.csv')).flatMap(n=>csv(fs.readFileSync(new URL(dir+'/'+n,root),'utf8'))):[];};
 const physical='Physical Activity_GoogleData';
 const candidates=data.records.filter(r=>['steps','distance','calories','activeCalories','zoneMinutes','sleepHours','deep','light','rem'].every(k=>r[k]!=null));
 const day=candidates.at(-1);
 if(day){
  const date=day.date,month=date.slice(0,7);
  for(const [prefix,column,key,factor]of [['steps_','steps','steps',1],['distance_','distance','distance',.001],['calories_','calories','calories',1],['active_energy_burned_','Kilocalories','activeCalories',1],['active_zone_minutes_','total minutes','zoneMinutes',1]]){
   const source=rows(physical,prefix+month).filter(r=>r.timestamp.slice(0,10)===date);
   if(!source.length)continue;
   const unique=[...new Map(source.map(r=>[r.timestamp+'|'+(r['data source']||'')+'|'+(r['heart rate zone']||''),r])).values()];
   const expected=unique.reduce((s,r)=>s+Number(r[column])*factor,0);assert.ok(Math.abs(day[key]-expected)<1e-6,key+' matches source total');
  }
  const retainedIds=new Set(data.sleepSessions.map(s=>s.id));
  const sleepRows=rows('Health Fitness Data_GoogleData','UserSleeps_').filter(r=>r.sleep_end.startsWith(date)&&retainedIds.has(r.sleep_id));
  if(sleepRows.length){assert.ok(Math.abs(day.sleepHours-sleepRows.reduce((s,r)=>s+Number(r.minutes_asleep)/60,0))<1e-8);
   const ids=new Set(sleepRows.map(r=>r.sleep_id)),stageRows=rows('Health Fitness Data_GoogleData','UserSleepStages_').filter(r=>ids.has(r.sleep_id));
   for(const stage of ['deep','light','rem']){const expected=stageRows.filter(r=>r.sleep_stage_type.toLowerCase()===stage).reduce((s,r)=>s+(Date.parse(r.sleep_stage_end)-Date.parse(r.sleep_stage_start))/60000,0);assert.equal(day[stage],expected);}
  }
 }
 const weights=rows(physical,'weight.csv').sort((a,b)=>a.timestamp.localeCompare(b.timestamp)),weight=weights.at(-1);
 if(weight){const weightDay=data.records.find(r=>r.date===weight.timestamp.slice(0,10));assert.equal(weightDay.weight,Number(weight['weight grams'])/1000);}
 const temp=rows(physical,'daily_sleep_temperature_derivations').find(r=>Number(r['nightly temperature celsius'])>0&&Number(r['baseline temperature celsius'])>0);
 if(temp){const tempDay=data.records.find(r=>r.date===temp.timestamp.slice(0,10));assert.equal(tempDay.tempDelta,Number(temp['nightly temperature celsius'])-Number(temp['baseline temperature celsius']));}
 const exercise=rows('Health Fitness Data_GoogleData','UserExercises_').find(r=>r.log_type==='TRACKER'&&(!r.deletion_reason||r.deletion_reason==='UNSPECIFIED')&&Number(r.tracker_total_distance_mm)>0);
 if(exercise){const actual=data.exercises.find(e=>e.id===exercise.exercise_id);assert.ok(actual);assert.equal(actual.distance,Number(exercise.tracker_total_distance_mm)/1e6);}
 const ordered=[...data.sleepSessions].sort((a,b)=>a.start.localeCompare(b.start));for(let i=1;i<ordered.length;i++)assert.ok(ordered[i].start>=ordered[i-1].end,'retained sleep sessions must not overlap');
 assert.equal(data.warnings.length,0);assert.ok(!JSON.stringify(data.exercises).includes('location_metadata'));
});
