// Synthetic preview server. Never reads data.json or a Takeout export.
import http from 'node:http';
import fs from 'node:fs';
import {coverage} from './metrics.js';
import {buildSleepVariants} from './sleep-data.js';
const records=Array.from({length:365},(_,i)=>{
  const date=new Date(Date.UTC(2025,0,1+i)).toISOString().slice(0,10),r={date};
  if(i%23!==0)Object.assign(r,{
    sleep:Math.round(78+7*Math.sin(i/19)+4*Math.sin(i*1.7)),hrv:34+6*Math.sin(i/23)+3*Math.cos(i*1.3),rest:60+3*Math.sin(i/28)+2*Math.cos(i*1.1),heart:73+5*Math.sin(i/17)+3*Math.cos(i*.9),count:12000,
    steps:Math.round(7500+2800*Math.sin(i/11)+1500*Math.cos(i)),distance:5.5+2*Math.sin(i/11),calories:2200+300*Math.sin(i/11),activeCalories:450+200*Math.sin(i/11),zoneMinutes:Math.round(30+20*Math.sin(i/9)),
    sleepHours:7.2+.7*Math.sin(i/17),awakeMinutes:35+15*Math.sin(i/12),deep:70+15*Math.sin(i/17),light:260+30*Math.sin(i/17),rem:102+10*Math.sin(i/17),
    readiness:Math.round(70+15*Math.sin(i/15)),stress:Math.round(75+10*Math.sin(i/20)),spo2:96+Math.sin(i/23),respiratory:15+Math.sin(i/26),skinTemp:33.5+.4*Math.sin(i/13),tempDelta:.4*Math.sin(i/13),...(i%7===0?{weight:75-2*i/365+.2*Math.sin(i)}:{})
  });return r;
});
const exercises=records.filter((r,i)=>i%3===0).map((r,i)=>({id:'demo-'+i,date:r.date,start:r.date+'T10:00:00',type:i%2?'Walk':'Run',duration:35+i%20,distance:4+i%4,calories:200+i%100,heart:100+i%35}));
const sleepSessions=records.filter(r=>r.sleepHours!=null).map((r,i)=>({id:'demo-sleep-'+i,date:r.date,start:r.date+'T00:00:00',end:r.date+'T08:00:00',minutes:r.sleepHours*60,awake:r.awakeMinutes,deep:r.deep,light:r.light,rem:r.rem}));
for(const s of sleepSessions){s.algorithm='sleep_session_v1';s.score=records.find(r=>r.date===s.date).sleep;}
const v2=sleepSessions.filter(s=>s.date>='2025-07-01').map((s,i)=>({...s,id:s.id+'-v2',algorithm:'sleep_session_v2',minutes:s.minutes+12*Math.sin(i/8),score:Math.min(100,s.score+3),deep:s.deep+4,light:s.light-2,rem:s.rem+5}));
const sleepVariants=buildSleepVariants([...sleepSessions,...v2]);
const data={schemaVersion:3,sleepVariants,defaultSleepVersion:'v1',generated:'2026-01-01T00:00:00Z',files:0,samples:0,warnings:[],summary:{parsed:0,empty:0,unsupported:0,failed:0,duplicateObservations:0},metrics:coverage(records),records,exercises,sleepSessions};
http.createServer((req,res)=>{
  const assets={'/':'index.html','/app.js':'app.js','/style.css':'style.css','/metrics.js':'metrics.js','/model.js':'model.js','/sleep-data.js':'sleep-data.js'};
  if(req.url==='/data.json'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(data));}
  const name=assets[req.url];if(!name){res.writeHead(404);return res.end();}
  let body=fs.readFileSync(new URL(name,import.meta.url),'utf8');
  if(name==='index.html')body=body.replace('● Local & private','SYNTHETIC DEMO · NOT REAL HEALTH DATA').replace('Your health, over time. Explore patterns at your own pace.','Illustrative readings only. Every value in this preview is generated.');
  res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html; charset=utf-8');res.end(body);
}).listen(4174,'127.0.0.1',()=>console.log('Synthetic demo: http://127.0.0.1:4174'));
