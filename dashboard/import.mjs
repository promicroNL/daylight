import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {metrics,metricByKey,validValue,coverage} from './metrics.js';

export function csv(text) {
  let rows=[],row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
    else if(!quoted&&(c===','||c==='\n')){row.push(field.replace(/\r$/,''));field='';if(c==='\n'){rows.push(row);row=[];}}
    else field+=c;
  }
  if(field||row.length){row.push(field.replace(/\r$/,''));rows.push(row);}
  const headers=(rows.shift()||[]).map(x=>x.replace(/^\uFEFF/,''));
  return rows.filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??''])));
}
export function date(s) {
  if(!s)return null;
  const m=String(s).match(/^(\d{2})\/(\d{2})\/(\d{2})/);
  const d=m?`20${m[3]}-${m[1]}-${m[2]}`:/^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(0,10):null;
  return d&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d?d:null;
}
function stamp(s) { const d=date(s);return d?d+'T'+(String(s).match(/(?:T| )(\d\d:\d\d:\d\d(?:\.\d+)?)/)?.[1]||'00:00:00'):null; }
function number(v){return v==null||String(v).trim()===''||!Number.isFinite(Number(v))?null:Number(v);}
function* walk(root){for(const e of fs.readdirSync(root,{withFileTypes:true})){if(['dashboard','node_modules','.git'].includes(e.name))continue;const p=path.join(root,e.name);if(e.isDirectory())yield* walk(p);else yield p;}}
function kind(n) {
  if(/^UserSleepScores.*\.csv$/i.test(n))return 'sleepNew';
  if(/^sleep_score.*\.csv$/i.test(n))return 'sleep';
  if(/^Daily Heart Rate Variability Summary.*\.csv$/i.test(n))return 'hrv';
  if(/^resting_heart_rate.*\.json$/i.test(n))return 'rest';
  if(/^heart_rate-.*\.json$/i.test(n))return 'heart';
  if(/^UserSleepStages.*\.csv$/i.test(n))return 'stages';
  if(/^UserSleeps.*\.csv$/i.test(n))return 'sessions';
  if(/^sleep-.*\.json$/i.test(n))return 'legacySleep';
  if(/^UserExercises.*\.csv$/i.test(n))return 'exercises';
  if(/^exercise-.*\.json$/i.test(n))return 'legacyExercise';
  for(const [re,k]of [[/^steps_.*\.csv$/i,'steps'],[/^distance_.*\.csv$/i,'distance'],[/^calories_\d{4}-.*\.csv$/i,'calories'],[/^active_energy_burned_.*\.csv$/i,'activeCalories'],[/^active_zone_minutes_.*\.csv$/i,'zoneMinutes'],[/^daily_readiness\.csv$/i,'readiness'],[/^Stress Score\.csv$/i,'stress'],[/^Daily SpO2.*\.csv$/i,'spo2'],[/^respiratory_rate_sleep_summary_.*\.csv$/i,'respiratory'],[/^weight\.csv$/i,'weight'],[/^daily_sleep_temperature_derivations\.csv$/i,'temperature']])if(re.test(n))return k;
  if(/^(steps|calories)-.*\.json$/i.test(n))return 'legacy'+n.split('-')[0];
  return null;
}
export function importData(root) {
  const paths=[...walk(root)].sort(),days=new Map(),warnings=[],provenance={},summary={parsed:0,empty:0,unsupported:0,failed:0,duplicateObservations:0};
  const sessions=new Map(),legacySessions=new Map(),stages=new Map(),exercises=new Map(),legacyExercises=new Map();
  let samples=0; const newerExerciseDates=new Set();
  const day=d=>{if(!days.has(d))days.set(d,{date:d});return days.get(d);};
  const source=(k,name,d)=>{const map=provenance[k]??=new Map();if(!map.has(d))map.set(d,new Set());map.get(d).add(name);};
  const recognized=paths.map(p=>({p,k:kind(path.basename(p))}));
  summary.unsupported=recognized.filter(x=>!x.k&&/\.(csv|json)$/i.test(x.p)).length;
  // Process one adapter at a time to release timestamp deduplication sets between large streams.
  const order=[...new Set(recognized.filter(x=>x.k).map(x=>x.k))];
  const priorities=new Map();
  for(const adapter of order){
    const buckets=new Map(),heartSeen=new Map();
    function observe(k,s,v,priority,name,identity='',lastUpdated='') {
      const d=date(s),n=validValue(k,v);if(!d||n===null)return;
      const key=k+'|'+d,old=priorities.get(key)||0;
      if(priority<old)return;
      if(priority>old){priorities.set(key,priority);delete day(d)[k];provenance[k]?.delete(d);}
      let a=buckets.get(key);if(!a){a={d,k,sum:0,count:0,seen:new Set(),last:'',value:null};buckets.set(key,a);}
      const signature=identity||stamp(s);if(a.seen.has(signature)){summary.duplicateObservations++;if(metricByKey[k].aggregation==='last'&&(lastUpdated||stamp(s))>=a.last){a.last=lastUpdated||stamp(s);a.value=n;}return;}a.seen.add(signature);
      a.sum+=n;a.count++;if((lastUpdated||stamp(s))>=a.last){a.last=lastUpdated||stamp(s);a.value=n;}
      source(k,name,d);
    }
    for(const {p,k}of recognized.filter(x=>x.k===adapter)) {
      const n=path.basename(p);
      try {
        const text=fs.readFileSync(p,'utf8'),rows=/\.json$/i.test(n)?JSON.parse(text):csv(text);
        if(!Array.isArray(rows))throw Error('Expected an array of records');
        if(!rows.length){summary.empty++;continue;}
        const required={sleepNew:'overall_score',sleep:'overall_score',hrv:'rmssd',stages:'sleep_id',sessions:'sleep_id',exercises:'exercise_id',steps:'steps',distance:'distance',calories:'calories',activeCalories:'Kilocalories',zoneMinutes:'total minutes',readiness:'score',stress:'STRESS_SCORE',spo2:'average_value',respiratory:'full sleep stats - milli breaths per minute',weight:'weight grams',temperature:'nightly temperature celsius'}[k];
        if(required&&!(required in rows[0]))throw Error('Unsupported schema: missing '+required);
        summary.parsed++;
        for(const r of rows) {
          const s=r.timestamp||r.score_time||r.dateTime||r.DATE;
          if(k==='heart') {
            const d=date(s),v=validValue('heart',r.value?.bpm),t=stamp(s);if(!d||v===null||!t)continue;
            // Whole-second legacy samples: a compact daily bitmap avoids retaining millions of strings.
            let seen=heartSeen.get(d);if(!seen){seen={bits:new Uint8Array(10800),fractional:new Set()};heartSeen.set(d,seen);}
            const h=t.slice(11).split(':'),sec=Number(h[0])*3600+Number(h[1])*60+Number(h[2]);
            if(!Number.isFinite(sec)||sec<0||sec>=86400)continue;
            if(Number.isInteger(sec)){const byte=sec>>3,mask=1<<(sec&7);if(seen.bits[byte]&mask){summary.duplicateObservations++;continue;}seen.bits[byte]|=mask;}
            else {if(seen.fractional.has(sec)){summary.duplicateObservations++;continue;}seen.fractional.add(sec);}
            const a=day(d);a._heartSum=(a._heartSum||0)+v;a.count=(a.count||0)+1;samples++;source('heart',n,d);continue;
          }
          if(k==='sleep'||k==='sleepNew'){observe('sleep',s,r.overall_score,k==='sleepNew'?2:1,n,'',r.sleep_score_last_updated||s);const d=date(s),v=number(r.resting_heart_rate);if(d&&v>0&&(k==='sleepNew'||day(d).sleepRest==null))day(d).sleepRest=v;}
          if(k==='hrv')observe('hrv',s,r.rmssd,1,n);
          if(k==='rest')observe('rest',s,r.value?.value,1,n);
          if(k==='steps'||k==='calories')observe(k,s,r[k],2,n,stamp(s)+'|'+(r['data source']||''));
          if(k==='legacysteps'||k==='legacycalories')observe(k.slice(6),s,r.value,1,n);
          if(k==='distance')observe(k,s,number(r.distance)===null?null:Number(r.distance)/1000,2,n,stamp(s)+'|'+(r['data source']||''));
          if(k==='activeCalories')observe(k,s,r.Kilocalories,2,n,stamp(s)+'|'+(r['data source']||''));
          if(k==='zoneMinutes')observe(k,s,r['total minutes'],2,n,stamp(s)+'|'+r['heart rate zone']+'|'+(r['data source']||''));
          if(k==='readiness')observe(k,s,r.score,2,n);
          if(k==='stress'&&String(r.CALCULATION_FAILED).toLowerCase()!=='true'&&r.STATUS!=='NO_DATA')observe(k,s,r.STRESS_SCORE,2,n);
          if(k==='spo2')observe(k,s,r.average_value,2,n);
          if(k==='respiratory')observe(k,s,number(r['full sleep stats - milli breaths per minute'])===null?null:Number(r['full sleep stats - milli breaths per minute'])/1000,2,n);
          if(k==='weight')observe(k,s,number(r['weight grams'])===null?null:Number(r['weight grams'])/1000,2,n);
          if(k==='temperature') {observe('skinTemp',s,r['nightly temperature celsius'],2,n);const t=number(r['nightly temperature celsius']),b=number(r['baseline temperature celsius']);if(t>0&&b>0)observe('tempDelta',s,t-b,2,n);}
          if(k==='sessions'||k==='legacySleep') {
            const newer=k==='sessions',id=String(newer?r.sleep_id:r.logId),end=newer?r.sleep_end:r.endTime,start=newer?r.sleep_start:r.startTime,d=date(end);
            if(!d||!id||id==='undefined')continue;
            const record={id,date:d,start:stamp(start),end:stamp(end),minutes:validValue('awakeMinutes',newer?r.minutes_asleep:r.minutesAsleep),awake:validValue('awakeMinutes',newer?r.minutes_awake:r.minutesAwake),source:n,updated:newer?r.sleep_last_updated:''};
            if(!newer){record.deep=validValue('deep',r.levels?.summary?.deep?.minutes);record.light=validValue('light',r.levels?.summary?.light?.minutes);record.rem=validValue('rem',r.levels?.summary?.rem?.minutes);}
            const map=newer?sessions:legacySessions,previous=map.get(id);if(!previous||record.updated>=previous.updated)map.set(id,record);else summary.duplicateObservations++;
          }
          if(k==='stages') {
            const id=r.sleep_stage_id||r.sleep_id+'|'+r.sleep_stage_start+'|'+r.sleep_stage_type;
            const start=Date.parse(r.sleep_stage_start),end=Date.parse(r.sleep_stage_end),type=String(r.sleep_stage_type).toLowerCase();
            if(!['deep','light','rem'].includes(type)||!Number.isFinite(start)||!Number.isFinite(end)||end<start)continue;
            const previous=stages.get(id);if(!previous||r.sleep_stage_last_updated>=previous.updated)stages.set(id,{sleepId:r.sleep_id,type,minutes:(end-start)/60000,updated:r.sleep_stage_last_updated,source:n});
          }
          if(k==='exercises'||k==='legacyExercise') {
            const newer=k==='exercises';if(newer&&date(r.exercise_start))newerExerciseDates.add(date(r.exercise_start));if(newer&&r.deletion_reason&&r.deletion_reason!=='UNSPECIFIED')continue;
            const start=stamp(newer?r.exercise_start:r.startTime),end=stamp(r.exercise_end),d=date(start),id=String(newer?r.exercise_id:r.logId);if(!d||!id||id==='undefined')continue;
            const manual=newer&&r.log_type==='MANUAL';
            const read=(field)=>number(r[(manual?'manually_logged_':'tracker_')+field]);
            const mm=newer?read('total_distance_mm'):null;
            let distance=mm!==null&&mm>=0?mm/1e6:null;
            if(!newer&&number(r.distance)!==null){const u=String(r.distanceUnit||'').toLowerCase();if(['kilometer','kilometers','km'].includes(u))distance=Number(r.distance);if(['mile','miles','mi'].includes(u))distance=Number(r.distance)*1.609344;}
            const record={id,date:d,start,type:String(newer?r.activity_name||r.autodetected_activity_name||'Unspecified':r.activityName||'Unspecified'),duration:newer?(end?(Date.parse(end+'Z')-Date.parse(start+'Z'))/60000:null):number(r.duration)===null?null:Number(r.duration)/60000,distance,calories:newer?read('total_calories'):number(r.calories),heart:newer?number(r.tracker_avg_heart_rate):number(r.averageHeartRate),source:n,updated:newer?r.exercise_last_updated:r.lastModified||''};
            for(const field of ['duration','distance','calories','heart'])if(record[field]!==null&&(!Number.isFinite(record[field])||record[field]<0||(field==='heart'&&record[field]===0)))record[field]=null;
            const map=newer?exercises:legacyExercises,previous=map.get(id);if(!previous||record.updated>=previous.updated)map.set(id,record);
          }
        }
      }catch(e){summary.failed++;warnings.push(`${n}: ${e.message}`);}
    }
    for(const a of buckets.values())day(a.d)[a.k]=metricByKey[a.k].aggregation==='sum'?a.sum:metricByKey[a.k].aggregation==='last'?a.value:a.sum/a.count;
  }
  // Prefer entire newer-source days for sessions, avoiding duplicate records with migrated IDs/timezones.
  const newerSleepDays=new Set([...sessions.values()].map(s=>s.date));
  for(const [id,s]of legacySessions)if(!sessions.has(id)&&!newerSleepDays.has(s.date))sessions.set(id,s);
  for(const s of stages.values()){const session=sessions.get(s.sleepId);if(session){session[s.type]=(session[s.type]||0)+s.minutes;source(s.type,s.source,session.date);}}
  for(const s of sessions.values()) {
    const r=day(s.date);
    for(const [key,v]of [['sleepHours',s.minutes===null?null:s.minutes/60],['awakeMinutes',s.awake],['deep',s.deep],['light',s.light],['rem',s.rem]])if(v!=null){r[key]=(r[key]||0)+v;source(key,s.source,s.date);}
    delete s.updated;
  }
  const newerExerciseDays=newerExerciseDates;
  for(const [id,e]of legacyExercises)if(!exercises.has(id)&&!newerExerciseDays.has(e.date))exercises.set(id,e);
  for(const e of exercises.values()){day(e.date);delete e.updated;}
  const records=[...days.values()].sort((a,b)=>a.date.localeCompare(b.date));
  for(const r of records){if(r.count)r.heart=r._heartSum/r.count;delete r._heartSum;}
  const stats=coverage(records);for(const m of metrics)stats[m.key].sources=[...new Set([...(provenance[m.key]?.values()||[])].flatMap(s=>[...s]))].sort();
  return {schemaVersion:2,generated:new Date().toISOString(),files:summary.parsed,samples,warnings,summary,metrics:stats,records,sleepSessions:[...sessions.values()].sort((a,b)=>a.start.localeCompare(b.start)),exercises:[...exercises.values()].sort((a,b)=>a.start.localeCompare(b.start))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  console.log('Reading supported health files locally…');
  const data=importData(path.resolve(process.argv[2]||'..'));
  if(!data.records.length)throw Error('No supported health records found. Existing dashboard data preserved.');
  const out=new URL('./data.json',import.meta.url);fs.writeFileSync(new URL('./data.json.tmp',import.meta.url),JSON.stringify(data));fs.renameSync(new URL('./data.json.tmp',import.meta.url),out);
  console.log(JSON.stringify({summary:data.summary,samples:data.samples,metrics:Object.fromEntries(Object.entries(data.metrics).map(([k,m])=>[k,{days:m.days,first:m.first,last:m.last}])),sleepSessions:data.sleepSessions.length,exercises:data.exercises.length,warnings:data.warnings},null,2));
}
