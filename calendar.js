/* Sixth view: one heatmap per year in the chosen date range. */
'use strict';
const calendarHost=document.createElement('div');calendarHost.id='calendarHost';calendarHost.hidden=true;$('plot').parentNode.prepend(calendarHost);
function renderCalendar(){
 const days=new Map();let count=0,ms=0;
 for(const e of DATA.events){if(e[0]<atlas.start||e[0]>atlas.end||!basePass(e))continue;const key=date(e[0]);if(!days.has(key))days.set(key,{ms:0,count:0});days.get(key).ms+=e[2];days.get(key).count++;count++;ms+=e[2]}
 const a=Math.max(atlas.start,DATA.meta.first),b=Math.min(atlas.end,DATA.meta.last),firstYear=new Date(a*1000).getUTCFullYear(),lastYear=new Date(b*1000).getUTCFullYear();
 const colors=['#f1f0e9','#d6d5ff','#a5a3ff','#6966fa','#2e2bf5'],max=Math.max(1,...[...days.values()].map(d=>d.ms));
 let html='<div class="calendar-legend"><span>Recorded minutes</span><span>Less '+colors.map(color=>'<i style="background:'+color+'"></i>').join('')+' More</span></div>';
 if(a>b)html+='<p class="calendar-empty">No listening history in this date range.</p>';
 for(let year=firstYear;a<=b&&year<=lastYear;year++){
  const start=Date.UTC(year,0,1)/1000,end=Date.UTC(year+1,0,1)/1000,offset=(new Date(start*1000).getUTCDay()+6)%7;
  html+='<section class="calendar-year" data-year="'+year+'"><h3>'+year+'</h3><div class="calendar-scroll"><div class="calendar-months">';
  for(let month=0;month<12;month++){const t=Date.UTC(year,month,1)/1000,col=Math.floor(((t-start)/DAY+offset)/7);html+='<span style="grid-column:'+(col+2)+'">'+new Date(t*1000).toLocaleDateString('en-US',{month:'short',timeZone:'UTC'})+'</span>'}
  html+='</div><div class="calendar-grid">';
  for(let day=0;day<7;day++)html+='<span class="calendar-weekday" style="grid-row:'+(day+1)+';grid-column:1">'+['Mon','','Wed','','Fri','','Sun'][day]+'</span>';
  for(let t=start,index=0;t<end;t+=DAY,index++){
   const key=date(t),d=days.get(key)||{ms:0,count:0},unknown=t>Math.floor(DATA.meta.last/DAY)*DAY||t<Math.floor(DATA.meta.first/DAY)*DAY,outside=t+DAY<=atlas.start||t>atlas.end,level=d.ms?Math.min(4,1+Math.floor(Math.sqrt(d.ms/max)*3)):0,title=key+' · '+(unknown?'Outside supplied history':outside?'Outside date range':(d.ms/60000).toFixed(1)+' min · '+d.count+' events');
   html+='<button class="calendar-day'+(unknown?' unavailable':'')+(outside?' outside-filter':'')+'" '+(!unknown?'data-minutes="'+d.ms/60000+'"':'')+' data-date="'+key+'" style="grid-column:'+(Math.floor((index+offset)/7)+2)+';grid-row:'+((index+offset)%7+1)+';background:'+(unknown?'transparent':colors[level])+'" title="'+title+'" aria-label="'+title+'"></button>';
  }
  html+='</div></div></section>';
 }
 html+='<p id="calendarDayDetail" hidden></p>';calendarHost.innerHTML=html;
 calendarHost.querySelectorAll('.calendar-day').forEach(button=>button.onclick=()=>{const key=button.dataset.date,items=new Map();for(const e of DATA.events){if(date(e[0])!==key||!basePass(e)||e[0]<atlas.start||e[0]>atlas.end)continue;const label=DATA.tracks[e[1]].title+' — '+DATA.tracks[e[1]].artist;items.set(label,(items.get(label)||0)+e[2])}const d=days.get(key),target=$('calendarDayDetail');target.hidden=false;target.textContent=key+' · '+(d?(d.ms/60000).toFixed(1)+' min':'No matching events')+' · '+[...items].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([name,value])=>name+' ('+(value/60000).toFixed(1)+' min)').join(' · ')});
 atlas.calendarStats={count,ms,days:days.size,years:a>b?0:lastYear-firstYear+1};
 $('chartTitle').textContent='Listening calendar';$('summary').innerHTML='<span><strong>'+hours(ms)+' h</strong> recorded</span><span><strong>'+fmt.format(count)+'</strong> events</span><span><strong>'+days.size+'</strong> listening days</span>';
 atlas.ready=true;atlas.calendarReady=true;
}
const chartRender=render,chartRebuild=rebuild;
render=function(){if(atlas.mode==='calendar')renderCalendar();else chartRender()};
rebuild=function(){const on=atlas.mode==='calendar';document.body.classList.toggle('calendar-mode',on);calendarHost.hidden=!on;$('plot').hidden=on;if(on){document.body.classList.remove('cumulative-mode');$('metricControl').hidden=true;$('cumulativeMethods').hidden=true;$('selectionTools').hidden=true;$('k').disabled=true;renderCalendar()}else{atlas.calendarReady=false;chartRebuild()}};
const option=document.createElement('option');option.value='calendar';option.textContent='06 · Listening calendar';$('mode').append(option);
atlas.mode=DATA.meta.requestedView||'artists';$('mode').value=atlas.mode;syncDates();rebuild();
