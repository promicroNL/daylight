import {coverage,metrics} from './metrics.js';
export const DAY=86400000;
export const iso=t=>new Date(t).toISOString().slice(0,10);
export const time=d=>Date.parse(d+'T00:00:00Z');
export function normalizeDataset(data){
  if(!Array.isArray(data.records)||!data.records.length)throw Error('No supported data found. Import an export first.');
  const records=[...data.records].sort((a,b)=>a.date.localeCompare(b.date));
  return {...data,records,metrics:Object.fromEntries(metrics.map(m=>[m.key,{...coverageCache(records)[m.key],...data.metrics?.[m.key]}])),exercises:data.exercises||[],sleepSessions:data.sleepSessions||[],warnings:data.warnings||[],schemaVersion:data.schemaVersion||1};
}
let cachedRecords,cachedCoverage;
function coverageCache(records){if(cachedRecords!==records){cachedRecords=records;cachedCoverage=coverage(records);}return cachedCoverage;}
export function rowsBetween(byDate,start,end){const rows=[];for(let t=start;t<=end;t+=DAY)rows.push(byDate.get(iso(t))||{date:iso(t)});return rows;}
export function trailingMean(rows,key,window,byDate){return rows.map(r=>{if(r[key]==null)return null;let sum=0,count=0;for(let i=0;i<window;i++){const v=byDate.get(iso(time(r.date)-i*DAY))?.[key];if(v!=null){sum+=v;count++;}}return count?sum/count:null;});}
