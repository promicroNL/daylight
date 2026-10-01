export const categories = ['Activity', 'Sleep', 'Heart & Recovery', 'Body'];
const metric = (key,label,category,unit,color,aggregation,chart,sources,options={}) => ({key,label,category,unit,color,aggregation,chart,sources,...options});
export const metrics = [
  metric('sleep','Sleep score','Sleep','/ 100','#8271b5','last','line',['sleep_score*.csv','UserSleepScores*.csv'],{min:0,max:100,positive:true}),
  metric('hrv','Heart rate variability','Heart & Recovery','ms','#268980','mean','line',['Daily Heart Rate Variability Summary*.csv'],{positive:true}),
  metric('rest','Resting heart rate','Heart & Recovery','bpm','#d28b4b','mean','line',['resting_heart_rate*.json'],{positive:true}),
  metric('heart','Average heart rate','Heart & Recovery','bpm','#c26c73','mean','line',['heart_rate-*.json'],{positive:true}),
  metric('steps','Steps','Activity','steps','#288873','sum','bar',['steps_*.csv','steps-*.json']),
  metric('distance','Distance','Activity','km','#508aa2','sum','bar',['distance_*.csv']),
  metric('calories','Total calories','Activity','kcal','#b98446','sum','bar',['calories_*.csv','calories-*.json']),
  metric('activeCalories','Active calories','Activity','kcal','#ce7657','sum','bar',['active_energy_burned_*.csv']),
  metric('zoneMinutes','Active zone minutes','Activity','weighted min','#658858','sum','bar',['active_zone_minutes_*.csv']),
  metric('sleepHours','Sleep duration','Sleep','h','#8073b9','sum','line',['UserSleeps*.csv','sleep-*.json']),
  metric('awakeMinutes','Awake during sleep','Sleep','min','#b19cb9','sum','line',['UserSleeps*.csv','sleep-*.json']),
  metric('deep','Deep sleep','Sleep','min','#625292','sum','line',['UserSleepStages*.csv','sleep-*.json'],{group:'stages'}),
  metric('light','Light sleep','Sleep','min','#a294d1','sum','line',['UserSleepStages*.csv','sleep-*.json'],{group:'stages'}),
  metric('rem','REM sleep','Sleep','min','#71b8b4','sum','line',['UserSleepStages*.csv','sleep-*.json'],{group:'stages'}),
  metric('readiness','Readiness score','Heart & Recovery','/ 100','#548c77','mean','line',['daily_readiness.csv'],{min:0,max:100,positive:true}),
  metric('stress','Stress management score','Heart & Recovery','/ 100','#8b85ac','mean','line',['Stress Score.csv'],{min:0,max:100,positive:true}),
  metric('spo2','Nightly oxygen saturation','Heart & Recovery','%','#558fa9','mean','line',['Daily SpO2*.csv'],{positive:true,max:100}),
  metric('respiratory','Sleeping respiratory rate','Heart & Recovery','breaths/min','#799967','mean','line',['respiratory_rate_sleep_summary_*.csv'],{positive:true}),
  metric('weight','Weight','Body','kg','#aa865b','last','line',['weight.csv'],{positive:true}),
  metric('skinTemp','Nightly skin temperature','Body','°C','#b67a65','mean','line',['daily_sleep_temperature_derivations.csv'],{positive:true}),
  metric('tempDelta','Skin temperature vs baseline','Body','°C','#ba6877','mean','line',['daily_sleep_temperature_derivations.csv'],{signed:true}),
];
export const metricByKey = Object.fromEntries(metrics.map(m=>[m.key,m]));
export const defaultSelection = ['sleep','hrv','rest','heart'];
export function validValue(key,value) {
  if(value===null||value===undefined||String(value).trim()==='') return null;
  const n=Number(value),m=metricByKey[key];
  if(!m||!Number.isFinite(n)||(!m.signed&&n<0)||(m.positive&&n===0)||(m.max!==undefined&&n>m.max))return null;
  return n;
}
export function coverage(records) {
  return Object.fromEntries(metrics.map(m=>{const a=records.filter(r=>r[m.key]!=null);return [m.key,{days:a.length,first:a[0]?.date??null,last:a.at(-1)?.date??null}];}));
}

