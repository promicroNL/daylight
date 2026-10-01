// Sleep versions are independent estimates. Never combine versions in daily totals.
export const sleepKeys=['sleep','sleepRest','sleepHours','awakeMinutes','deep','light','rem'];
export function resolveSleepOverlaps(input,preferVersion=false) {
  const duration=s=>Date.parse(s.end+'Z')-Date.parse(s.start+'Z');
  const rank=s=>s.algorithm==='sleep_session_v2'?2:s.algorithm==='sleep_session_v1'?1:0;
  const ranked=[...input].sort((a,b)=>(preferVersion?rank(b)-rank(a):0)||duration(b)-duration(a)||String(b.updated||'').localeCompare(String(a.updated||''))||a.id.localeCompare(b.id));
  const kept=[],excluded=[];
  for(const session of ranked){const conflict=kept.find(other=>session.start<other.end&&session.end>other.start);if(conflict)excluded.push({...session,retainedId:conflict.id,reason:preferVersion?'Overlaps a preferred version (v2, then v1, then unversioned)':'Overlaps a wider or equally wide retained interval in this version'});else kept.push(session);}
  return {kept:kept.sort((a,b)=>a.start.localeCompare(b.start)),excluded};
}
export function buildSleepVariants(sessions) {
  return Object.fromEntries(['v1','v2','hybrid','unversioned'].map(version=>{
    const candidates=version==='hybrid'?sessions:sessions.filter(s=>(s.algorithm==='sleep_session_v1'?'v1':s.algorithm==='sleep_session_v2'?'v2':'unversioned')===version);
    const {kept,excluded}=resolveSleepOverlaps(candidates,version==='hybrid'),days=new Map();
    for(const s of kept){if(!days.has(s.date))days.set(s.date,{date:s.date});const d=days.get(s.date);for(const [key,value]of [['sleepHours',s.minutes==null?null:s.minutes/60],['awakeMinutes',s.awake],['deep',s.deep],['light',s.light],['rem',s.rem]])if(value!=null)d[key]=(d[key]||0)+value;}
    const scored=new Set();for(const s of [...kept].sort((a,b)=>(Date.parse(b.end)-Date.parse(b.start))-(Date.parse(a.end)-Date.parse(a.start))))if(s.score!=null&&!scored.has(s.date)){const d=days.get(s.date);d.sleep=s.score;if(s.sleepRest!=null)d.sleepRest=s.sleepRest;scored.add(s.date);}
    return [version,{records:[...days.values()].sort((a,b)=>a.date.localeCompare(b.date)),sessions:kept,excluded}];
  }));
}
export function applySleepVariant(data,version){
  const variant=data.sleepVariants?.[version];if(!variant)return data;
  const byDate=new Map(variant.records.map(r=>[r.date,r]));
  const originals=new Map(data.records.map(r=>[r.date,r]));
  const records=[...new Set([...originals.keys(),...byDate.keys()])].sort().map(date=>{const r=originals.get(date)||{date};const clean={...r};for(const key of sleepKeys)delete clean[key];return {...clean,...byDate.get(r.date)};});
  return {...data,records,sleepSessions:variant.sessions,excludedSleepSessions:variant.excluded,selectedSleepVersion:version};
}
export function compareSleepVersions(variants,start,end){
  const a=new Map((variants?.v1?.records||[]).map(r=>[r.date,r])),b=new Map((variants?.v2?.records||[]).map(r=>[r.date,r]));
  return [...new Set([...a.keys(),...b.keys()])].filter(d=>d>=start&&d<=end).sort().map(date=>({date,v1:a.get(date),v2:b.get(date)}));
}
export function flagExerciseOverlaps(exercises){
  const sorted=exercises.map(e=>({...e,possibleOverlapIds:[]})).sort((a,b)=>a.start.localeCompare(b.start));
  for(let i=0;i<sorted.length;i++){const a=sorted[i];if(!(a.duration>0))continue;const at=Date.parse(a.start+'Z'),end=at+a.duration*60000;for(let j=i+1;j<sorted.length;j++){const b=sorted[j],bt=Date.parse(b.start+'Z');if(bt>=end)break;if(b.type!==a.type||!(b.duration>0))continue;const overlap=Math.min(end,bt+b.duration*60000)-bt;if(overlap/60000>Math.min(a.duration,b.duration)*.8){a.possibleOverlapIds.push(b.id);b.possibleOverlapIds.push(a.id);}}}
  return sorted;
}
