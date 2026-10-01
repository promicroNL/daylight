// Synthetic preview server. Never reads the user's data.json or Takeout export.
import http from 'node:http';
import fs from 'node:fs';
const records = Array.from({length:365},(_,i)=>{
  const date = new Date(Date.UTC(2025,0,1+i)).toISOString().slice(0,10);
  const r = {date};
  if(i%23!==0)Object.assign(r,{
    sleep:Math.round(78+7*Math.sin(i/19)+4*Math.sin(i*1.7)),
    hrv:Math.round((34+6*Math.sin(i/23)+3*Math.cos(i*1.3))*100)/100,
    rest:60+3*Math.sin(i/28)+2*Math.cos(i*1.1),
    heart:73+5*Math.sin(i/17)+3*Math.cos(i*.9),count:12000
  });
  return r;
});
const metrics=Object.fromEntries(['sleep','hrv','rest','heart'].map(k=>{const a=records.filter(r=>r[k]!=null);return [k,{days:a.length,first:a[0].date,last:a.at(-1).date}];}));
const data={generated:'2026-01-01T00:00:00Z',files:0,samples:0,warnings:[],metrics,records};
http.createServer((req,res)=>{
  const assets={'/':'index.html','/app.js':'app.js','/style.css':'style.css'};
  if(req.url==='/data.json'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(data));}
  const name=assets[req.url];if(!name){res.writeHead(404);return res.end();}
  let body=fs.readFileSync(new URL(name,import.meta.url),'utf8');
  if(name==='index.html')body=body.replace('● Local & private','SYNTHETIC DEMO · NOT REAL HEALTH DATA').replace('Your sleep and heart, over time. Explore patterns at your own pace.','Illustrative readings only. Every value in this preview is generated.');
  res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html; charset=utf-8');res.end(body);
}).listen(4174,'127.0.0.1',()=>console.log('Synthetic demo: http://127.0.0.1:4174'));
