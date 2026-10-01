import {metrics,metricByKey,categories,defaultSelection} from './metrics.js';
import {normalizeDataset,rowsBetween,trailingMean,DAY,iso,time} from './model.js';
const $=s=>document.querySelector(s);
const fmt=v=>v==null?'—':Number(v).toLocaleString(undefined,{maximumFractionDigits:1});
let data,byDate,start,end,first,last,preset=90,activeTab='Overview',exerciseType='All',selected=new Set(defaultSelection);
try{const saved=JSON.parse(localStorage.getItem('daylight.charts.v2'));if(Array.isArray(saved))selected=new Set(saved.filter(k=>metricByKey[k]));}catch{}
const element=(tag,text,className)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;};
function range(n){preset=n;end=last;start=n===0?first:Math.max(first,end-(n-1)*DAY);render();}
function statusFor(key){const m=data.metrics[key];return m?.days?`${m.days.toLocaleString()} days · ${m.first} — ${m.last}`:data.schemaVersion<2&&!defaultSelection.includes(key)?'Reimport to discover this measurement':'Not in this export';}
function setupPicker(){
  const picker=$('#picker-groups');picker.replaceChildren();
  for(const category of categories){const field=element('fieldset');field.append(element('legend',category));
    for(const m of metrics.filter(m=>m.category===category)){const label=element('label'),input=element('input');input.type='checkbox';input.checked=selected.has(m.key);input.value=m.key;input.addEventListener('change',()=>{if(input.checked)selected.add(m.key);else selected.delete(m.key);try{localStorage.setItem('daylight.charts.v2',JSON.stringify([...selected]));}catch{}render();});const text=element('span');text.append(element('span',m.label),element('small',statusFor(m.key)));label.append(input,text);field.append(label);}picker.append(field);
  }
}
function lazyTable(parent,label,headers,rows){
  const details=element('details'),summary=element('summary',label),scroll=element('div',undefined,'table-scroll');details.append(summary,scroll);parent.append(details);
  details.addEventListener('toggle',()=>{if(!details.open||scroll.childNodes.length)return;const table=element('table'),thead=element('thead'),tr=element('tr');headers.forEach(h=>tr.append(element('th',h)));thead.append(tr);table.append(thead);const tbody=element('tbody');for(const row of rows){const tr=element('tr');row.forEach(value=>tr.append(element('td',String(value??'—'))));tbody.append(tr);}table.append(tbody);scroll.append(table);});
}
function render(){
  $('#from').value=iso(start);$('#to').value=iso(end);$('#status').textContent='';const count=Math.round((end-start)/DAY)+1;
  $('#period').textContent=`${iso(start)} — ${iso(end)} · ${count.toLocaleString()} days`;
  $('#prev').disabled=start<=first;$('#next').disabled=end>=last;
  document.querySelectorAll('#ranges button').forEach(b=>{const on=Number(b.dataset.days)===preset;b.classList.toggle('active',on);b.setAttribute('aria-pressed',on);});
  document.querySelectorAll('#tabs button').forEach(b=>{const on=b.textContent===activeTab;b.classList.toggle('active',on);b.setAttribute('aria-selected',on);b.tabIndex=on?0:-1;});
  $('#picker').hidden=activeTab!=='Overview';$('#view-title').textContent=activeTab;
  const rows=rowsBetween(byDate,start,end),visible=metrics.filter(m=>activeTab==='Overview'?selected.has(m.key):m.category===activeTab);
  $('#cards').replaceChildren();$('#charts').replaceChildren();$('#sessions').replaceChildren();
  if(!visible.length)$('#charts').append(element('p','Choose charts above to build your overview.','empty'));
  for(const m of visible){
    const vals=rows.filter(r=>r[m.key]!=null),avg=vals.length?vals.reduce((s,r)=>s+r[m.key],0)/vals.length:null;
    const card=element('article',undefined,'card');card.append(element('div',m.label,'eyebrow'));
    const value=element('div',fmt(avg)+' ','value');value.append(element('span',m.unit,'unit'));card.append(value,element('div',`${vals.length.toLocaleString()} / ${count.toLocaleString()} days · daily average`,'coverage'));$('#cards').append(card);
  }
  const stageMetrics=visible.filter(m=>m.group==='stages');
  for(const m of visible.filter(m=>m.group!=='stages'))renderChart([m],rows);
  if(stageMetrics.length)renderChart(stageMetrics,rows,true);
  if(activeTab==='Activity')renderExercises();
  if(activeTab==='Sleep')renderSleepSessions();
}
function renderChart(ms,rows,stack=false){
  const m=ms[0],key=m.key,title=stack?'Sleep stages':m.label,unit=m.unit;
  const vals=rows.filter(r=>ms.some(m=>r[m.key]!=null));
  const panel=element('article',undefined,'chart');panel.append(element('h2',title));
  const description=stack?ms.map(m=>m.label).join(' · ')+' · daily minutes; missing stages are not estimated':key==='heart'?'Sample mean, not time-weighted · bpm':key==='tempDelta'?'Nightly skin temperature minus exported baseline · °C':key==='zoneMinutes'?'Intensity-weighted minutes as exported':`${unit} · ${m.aggregation==='sum'?'daily total':m.aggregation==='last'?'last observation of the day':'daily measurement'}`;
  panel.append(element('p',description));if(stack){const legend=element('div',undefined,'stage-legend');for(const metric of ms){const item=element('span',metric.label);item.className='stage-'+metric.key;legend.append(item);}panel.append(legend);}const cov=element('p',stack?ms.map(m=>`${m.label}: ${statusFor(m.key)}`).join(' / '):statusFor(key),'metric-coverage');panel.append(cov);
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 560 230');svg.setAttribute('role','img');svg.setAttribute('tabindex','0');svg.setAttribute('aria-label',`${title} over selected dates. Use arrow keys to inspect daily values.`);panel.append(svg);
  const available=ms.some(m=>data.metrics[m.key]?.days),empty=available?'No observations in this period.':data.schemaVersion<2?'Reimport your export to discover additional measurements.':'Not in this export.';
  panel.append(element('div',vals.length?'Hover or use arrow keys to explore.':empty,'readout'));
  lazyTable(panel,`Daily values (${vals.length.toLocaleString()})`,['Date',...ms.map(m=>`${m.label} (${m.unit})`),...(key==='heart'?['Samples']:[])],vals.map(r=>[r.date,...ms.map(m=>fmt(r[m.key])),...(key==='heart'?[fmt(r.count)]:[])]));
  $('#charts').append(panel);draw(svg,panel,rows,ms,stack,empty);
}
function draw(svg,panel,rows,ms,stack,empty){
  const m=ms[0],ns='http://www.w3.org/2000/svg';
  const add=(tag,attrs,text)=>{const e=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;svg.append(e);return e;};
  const raw=rows.map(r=>{const v=ms.map(m=>r[m.key]).filter(v=>v!=null);return v.length?v.reduce((a,b)=>a+b,0):null;}),values=raw.filter(v=>v!=null);
  if(!values.length){add('text',{x:280,y:100,'text-anchor':'middle',fill:'#75877b','font-size':12},empty);return;}
  const window=Number($('#smooth').value),smooth=stack?[]:trailingMean(rows,m.key,window,byDate);
  const domain=values.concat(smooth.filter(v=>v!=null));let min=Math.min(...domain),max=Math.max(...domain),pad=Math.max((max-min)*.12,m.signed?.1:1);
  if(stack||m.chart==='bar')min=0;else min=m.signed?Math.min(0,min-pad):Math.max(0,min-pad);
  max+=pad;if(m.signed)max=Math.max(0,max);if(m.min===0&&m.max===100){min=0;max=100;}
  const x=i=>44+(rows.length===1?250:i/(rows.length-1)*500),y=v=>190-(v-min)/(max-min)*170;
  for(let i=0;i<5;i++){const v=min+(max-min)*i/4,yy=y(v);add('line',{x1:44,x2:544,y1:yy,y2:yy,stroke:'#edf0eb'});add('text',{x:36,y:yy+4,'text-anchor':'end',fill:'#7b8b80','font-size':10},fmt(v));}
  for(const i of new Set([0,Math.floor((rows.length-1)/2),rows.length-1]))add('text',{x:x(i),y:218,'text-anchor':rows.length===1?'middle':i===0?'start':i===rows.length-1?'end':'middle',fill:'#7b8b80','font-size':10},rows[i].date);
  const width=Math.max(.12,Math.min(18,450/rows.length));
  if(stack||m.chart==='bar')rows.forEach((r,i)=>{let total=0;for(const metric of ms){const v=r[metric.key];if(v==null)continue;add('rect',{x:x(i)-width/2,y:y(total+v),width,height:Math.max(v===0?1:0,y(total)-y(total+v)),fill:metric.color,opacity:stack?.85:.4});total+=v;}});
  function line(vals,width,opacity){let d='',up=false;vals.forEach((v,i)=>{if(v==null){up=false;return;}d+=`${up?'L':'M'}${x(i).toFixed(2)},${y(v).toFixed(2)} `;up=true;});add('path',{d,fill:'none',stroke:m.color,'stroke-width':width,opacity,'stroke-linejoin':'round'});vals.forEach((v,i)=>{if(v!=null&&(i===0||vals[i-1]==null)&&(i===vals.length-1||vals[i+1]==null))add('circle',{cx:x(i),cy:y(v),r:2,fill:m.color});});}
  if(!stack){if(m.chart!=='bar')line(raw,1,.3);line(smooth,2.2,1);}
  const cursor=add('line',{x1:44,x2:44,y1:15,y2:190,stroke:m.color,'stroke-dasharray':'3 3',visibility:'hidden'});let idx=0;
  const show=i=>{idx=Math.max(0,Math.min(rows.length-1,i));const r=rows[idx];cursor.setAttribute('x1',x(idx));cursor.setAttribute('x2',x(idx));cursor.setAttribute('visibility','visible');panel.querySelector('.readout').textContent=`${r.date} · ${ms.map(m=>`${stack?m.label+': ':''}${r[m.key]==null?'No observation':fmt(r[m.key])+' '+m.unit}`).join(' · ')}${!stack&&r[m.key]!=null&&window>1?' · '+window+'-day mean '+fmt(smooth[idx]):''}${m.key==='heart'&&r.count?' · '+r.count.toLocaleString()+' samples':''}`;};
  svg.addEventListener('pointermove',e=>{const b=svg.getBoundingClientRect(),scale=Math.min(b.width/560,b.height/230),left=b.left+(b.width-560*scale)/2;show(rows.length===1?0:Math.round(((e.clientX-left)/scale-44)/500*(rows.length-1)));});
  svg.addEventListener('focus',()=>show(idx));svg.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();show(e.key==='Home'?0:e.key==='End'?rows.length-1:idx+(e.key==='ArrowRight'?1:-1));}});
}
function renderExercises(){
  const section=$('#sessions'),heading=element('h2','Exercises'),label=element('label','Activity type '),select=element('select');select.setAttribute('aria-label','Activity type');
  for(const type of ['All',...new Set(data.exercises.map(e=>e.type))].sort((a,b)=>a==='All'?-1:b==='All'?1:a.localeCompare(b))){const o=element('option',type);o.value=type;select.append(o);}select.value=exerciseType;select.addEventListener('change',()=>{exerciseType=select.value;section.replaceChildren();renderExercises();});label.append(select);section.append(heading,label);
  const rows=data.exercises.filter(e=>e.date>=iso(start)&&e.date<=iso(end)&&(exerciseType==='All'||e.type===exerciseType)).reverse();
  section.append(element('p',`${rows.length.toLocaleString()} exercises in this period${!data.exercises.length?' · '+(data.schemaVersion<2?'Reimport to discover exercises':'Not in this export'):''}`));
  lazyTable(section,'View exercises',['Date / time','Activity','Duration (min)','Distance (km)','Calories (kcal)','Heart rate (bpm)'],rows.map(e=>[e.start.replace('T',' '),e.type,fmt(e.duration),fmt(e.distance),fmt(e.calories),fmt(e.heart)]));
}
function renderSleepSessions(){
  const section=$('#sessions'),rows=data.sleepSessions.filter(s=>s.date>=iso(start)&&s.date<=iso(end)).reverse();section.append(element('h2','Sleep sessions'),element('p',`${rows.length.toLocaleString()} sessions · assigned to their end date`));
  lazyTable(section,'View sleep sessions',['Start','End','Asleep (min)','Awake (min)','Deep (min)','Light (min)','REM (min)'],rows.map(s=>[s.start?.replace('T',' '),s.end?.replace('T',' '),fmt(s.minutes),fmt(s.awake),fmt(s.deep),fmt(s.light),fmt(s.rem)]));
}
for(const name of ['Overview',...categories]){const b=element('button',name);b.setAttribute('role','tab');b.setAttribute('aria-controls','view');b.onclick=()=>{activeTab=name;render();};b.onkeydown=e=>{if(!['ArrowRight','ArrowLeft','Home','End'].includes(e.key))return;e.preventDefault();const buttons=[...$('#tabs').children],i=buttons.indexOf(b),next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;buttons[next].click();buttons[next].focus();};$('#tabs').append(b);}
for(const [n,label]of [[7,'1 week'],[14,'2 weeks'],[30,'1 month'],[90,'3 months'],[365,'1 year'],[0,'All history']]){const b=element('button',label);b.dataset.days=n;b.onclick=()=>range(n);$('#ranges').append(b);}
$('#smooth').onchange=render;
for(const id of ['from','to'])$('#'+id).onchange=()=>{const a=time($('#from').value),b=time($('#to').value);if(!Number.isFinite(a)||!Number.isFinite(b)||a>b||a<first||b>last){$('#status').textContent='Choose dates within your imported history, with From on or before To.';return;}start=a;end=b;preset=-1;render();};
for(const [id,dir]of [['prev',-1],['next',1]])$('#'+id).onclick=()=>{const width=end-start,shift=width+DAY;start+=dir*shift;end+=dir*shift;if(start<first){start=first;end=Math.min(last,start+width);}if(end>last){end=last;start=Math.max(first,end-width);}preset=-1;render();};
$('#latest').onclick=()=>range(preset>0?preset:90);
try{
  const res=await fetch('/data.json');if(!res.ok)throw Error('Import your export first with node dashboard/import.mjs "path/to/Takeout".');data=normalizeDataset(await res.json());byDate=new Map(data.records.map(r=>[r.date,r]));first=time(data.records[0].date);last=time(data.records.at(-1).date);
  $('#extent').textContent=`${iso(first)} — ${iso(last)} · ${data.records.length.toLocaleString()} recorded days`;
  for(const id of ['from','to']){$('#'+id).min=iso(first);$('#'+id).max=iso(last);}
  const s=data.summary;$('#provenance').textContent=`Imported ${new Date(data.generated).toLocaleString()} · ${(data.samples||0).toLocaleString()} heart-rate samples. ${s?`${s.parsed} parsed files, ${s.empty} empty, ${s.unsupported} unsupported (not imported), ${s.failed} failed. ${s.duplicateObservations.toLocaleString()} duplicate observations skipped.`:'Legacy dataset: reimport to discover additional measurements.'} ${data.warnings.join('; ')}`;
  const sourceList=$('#sources');for(const m of metrics){const d=element('details');d.append(element('summary',m.label+' · '+statusFor(m.key)),element('p',(data.metrics[m.key]?.sources||[]).join(', ')||'No source file list in this dataset.'));sourceList.append(d);}
  setupPicker();range(90);
}catch(e){$('#status').textContent=e.message;document.querySelectorAll('button,input,select').forEach(e=>e.disabled=true);}

