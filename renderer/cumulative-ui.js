/* Two cumulative Explore views integrated with the existing offline atlas. */
'use strict';
const cumulative=window.cumulative={model:null,signature:null,selected:new Set(),hover:null,focus:null,draw:{lines:[]},selections:new Map()};
function isCumulative(){return atlas.mode==='artists'||atlas.mode==='songs'}
const scatterUI={render,rebuild,move:$('plot').onpointermove,up:$('plot').onpointerup,leave:$('plot').onpointerleave,clear:$('clearSelection').onclick,note:$('plotNote').textContent,help:$('groupHelp').textContent};
const seriesColor=rank=>`hsl(${(rank*137.508+32)%360} 58% ${rank%3===0?72:rank%3===1?62:79}%)`;
const measure=()=>cumulative.model.metric==='minutes'?'recorded min':'listens';
const displayValue=value=>fmt.format(cumulative.model.metric==='minutes'?Math.round(value/60000*10)/10:value);
function ensureCumulative(){
 const signature=JSON.stringify([atlas.mode,$('metric').value,Number($('cutoff').value),$('genre').value]);
 if(signature===cumulative.signature)return;
 cumulative.signature=signature;cumulative.hover=null;cumulative.focus=null;
 cumulative.model=CumulativeCore.build(DATA,{type:atlas.mode,metric:$('metric').value,cutoff:Number($('cutoff').value),family:$('genre').value,start:fullStart,end:fullEnd});
 cumulative.model.series.forEach((s,i)=>{s.rank=i+1;s.color=seriesColor(i)});
 if(!cumulative.selections.has(signature))cumulative.selections.set(signature,new Set(cumulative.model.series.slice(0,10).map(s=>s.id)));
 cumulative.selected=cumulative.selections.get(signature);
}
function seriesTitle(s){return atlas.mode==='songs'?s.label+' — '+(s.artist||'Unknown artist'):s.label}
function buildSeriesList(){
 const query=$('search').value.trim().toLocaleLowerCase();
 const list=cumulative.model.series.filter(s=>`${s.label} ${s.artist||''} ${s.album||''}`.toLocaleLowerCase().includes(query));
 $('groups').innerHTML=list.map(s=>`<div class="series-row" data-id="${s.id}"><input class="series-check" id="series-${s.id}" type="checkbox" ${cumulative.selected.has(s.id)?'checked':''} aria-label="${esc(seriesTitle(s))}"><label class="series-label" for="series-${s.id}"><span class="series-rank">${s.rank}.</span><i class="swatch" style="background:${s.color}"></i>${esc(s.label)}<small>${s.artist?esc(s.artist)+' · ':''}${displayValue(s.total)} ${measure()} · full archive${atlas.mode==='songs'?'<br>'+esc(s.album||'Unknown album')+' · ID …'+esc(String(s.key).slice(-6)):''}</small></label><button class="series-solo" title="Show only this series" aria-label="Show only ${esc(seriesTitle(s))}">Only</button></div>`).join('')||'<p>No top-50 matches. Search filters this list, not the chart or ranking.</p>';
 for(const row of $('groups').querySelectorAll('.series-row')){
  const id=Number(row.dataset.id);
  row.querySelector('input').onchange=e=>{if(e.target.checked)cumulative.selected.add(id);else cumulative.selected.delete(id);renderCumulative();inspectSeries(id)};
  row.querySelector('button').onclick=()=>{cumulative.selected.clear();cumulative.selected.add(id);buildSeriesList();renderCumulative();inspectSeries(id)};
  row.onmouseenter=()=>{cumulative.hover=id;renderCumulative();inspectSeries(id)};
  row.onmouseleave=()=>{cumulative.hover=null;renderCumulative();restoreCumulativeInspector()};
  row.querySelector('input').onfocus=row.onmouseenter;row.querySelector('input').onblur=row.onmouseleave;
 }
 $('seriesAll').textContent='All '+cumulative.model.series.length;
}
function chooseSeries(count){cumulative.selected.clear();cumulative.model.series.slice(0,count).forEach(s=>cumulative.selected.add(s.id));cumulative.hover=null;cumulative.focus=null;buildSeriesList();renderCumulative();restoreCumulativeInspector()}
$('seriesAll').onclick=()=>chooseSeries(50);$('seriesNone').onclick=()=>chooseSeries(0);$('seriesTop10').onclick=()=>chooseSeries(10);
function inspectSeries(id){
 const s=cumulative.model.series.find(s=>s.id===id);if(!s)return;
 const a=CumulativeCore.valueAt(s.points,atlas.start),b=CumulativeCore.valueAt(s.points,atlas.end);
 $('inspector').innerHTML=`<div class="eyebrow">${atlas.mode==='artists'?'Artist':'Song'} · rank ${s.rank} / ${cumulative.model.series.length}</div><h3>${esc(seriesTitle(s))}</h3>${s.album?'<p>'+esc(s.album)+'</p>':''}<h4>Full archive total</h4><p>${fmt.format(s.count)} qualifying events<br>${fmt.format(Math.round(s.ms/60000))} recorded minutes</p><h4>Cumulative at window boundaries</h4><p>${date(atlas.start)}: ${displayValue(a)} ${measure()}<br>${date(atlas.end)}: ${displayValue(b)} ${measure()}</p><p>Totals keep everything before the zoom window. A flat section means no additional qualifying events in this export—not a live account reading.</p>${atlas.mode==='songs'?'<p>Spotify ID: '+esc(s.key)+'</p>':'<p>Grouped by the exact artist name exported on each historical event, not inferred full artist credits.</p>'}`;
}
function restoreCumulativeInspector(){if(cumulative.focus!==null)inspectSeries(cumulative.focus);else $('inspector').innerHTML='<h3>Compare your long-running favorites</h3><p>Check any of the top 50 to add its line. All 50, None, and Top 10 apply to the whole list, even during search. “Only” isolates one.</p><p>Hover a line or name to highlight it and inspect totals. Click a line to pin its details; Escape clears the pin.</p><p>Search filters the chooser only. Ranking uses the full archive with the current duration and genre filters; changing the date window never re-ranks or resets cumulative totals.</p>'}
function niceMax(value){if(value<=0)return 1;const power=10**Math.floor(Math.log10(value)),n=value/power;return(n<=1?1:n<=2?2:n<=5?5:10)*power}
function renderCumulative(){
 if(!isCumulative())return;ensureCumulative();
 const {c,w,h}=setupCanvas($('plot')),left=w<550?64:89,right=24,top=31,bottom=h-50;
 geometry={w,h,left,right};
 const X=t=>left+(t-atlas.start)/(atlas.end-atlas.start)*(w-left-right);atlas.toX=X;
 const selected=cumulative.model.series.filter(s=>cumulative.selected.has(s.id));
 const unit=cumulative.model.metric==='minutes'?60000:1;
 const peak=Math.max(0,...selected.map(s=>CumulativeCore.valueAt(s.points,atlas.end)))/unit;
 const max=niceMax(peak/5)*5*unit;
 const Y=v=>bottom-v/max*(bottom-top);cumulative.draw={lines:[],max,left,right,w,h,X,Y};
 c.font='11px Avenir Next,sans-serif';c.textBaseline='middle';c.lineWidth=.7;
 for(let i=0;i<=5;i++){const value=max*i/5,y=Y(value);c.strokeStyle='#2c3a36';c.beginPath();c.moveTo(left,y);c.lineTo(w-right,y);c.stroke();c.fillStyle='#a4b6ad';c.textAlign='right';c.fillText(displayValue(value),left-10,y)}
 c.textAlign='left';c.fillStyle='#c9d8cc';c.fillText('CUMULATIVE '+measure().toUpperCase(),left,13);
 const span=atlas.end-atlas.start,ticks=[];
 if(span>2*365*DAY){for(let y=new Date(atlas.start*1000).getUTCFullYear();y<=new Date(atlas.end*1000).getUTCFullYear();y++)ticks.push([Date.UTC(y,0,1)/1000,String(y)])}
 else if(span>80*DAY){const d=new Date(atlas.start*1000);d.setUTCDate(1);for(let i=0;i<27;i++){let t=d.getTime()/1000;if(t>atlas.end)break;ticks.push([t,d.toLocaleDateString('en-US',{month:'short',year:'2-digit',timeZone:'UTC'})]);d.setUTCMonth(d.getUTCMonth()+1)}}
 else{const step=span>20*DAY?7*DAY:Math.max(DAY,Math.ceil(span/5/DAY)*DAY);for(let t=Math.ceil(atlas.start/DAY)*DAY;t<=atlas.end;t+=step)ticks.push([t,date(t).slice(5)])}
 let previous=-Infinity;for(const [t,label] of ticks){if(t<atlas.start||t>atlas.end)continue;const x=X(t);if(x-previous<(w<550?53:65))continue;previous=x;c.strokeStyle='#263632';c.beginPath();c.moveTo(x,top);c.lineTo(x,bottom);c.stroke();c.fillStyle='#a4b6ad';c.fillText(label,x-8,h-24)}
 const focus=cumulative.hover??cumulative.focus;
 c.save();c.beginPath();c.rect(left,top,w-left-right,bottom-top+1);c.clip();
 for(const s of [...selected].sort((a,b)=>Number(a.id===focus)-Number(b.id===focus))){
  c.strokeStyle=s.color;c.globalAlpha=focus===null?.8:s.id===focus?1:.13;c.lineWidth=s.id===focus?2.7:1.55;
  const baseline=CumulativeCore.valueAt(s.points,atlas.start),end=CumulativeCore.valueAt(s.points,atlas.end);
  c.beginPath();c.moveTo(left,Y(baseline));let prev=baseline;
  for(const [t,v] of s.points){if(t<=atlas.start)continue;if(t>atlas.end)break;c.lineTo(X(t),Y(prev));c.lineTo(X(t),Y(v));prev=v;}
  c.lineTo(w-right,Y(prev));c.stroke();
  cumulative.draw.lines.push({id:s.id,baseline,end,lastX:w-right,lastY:Y(end)});
 }
 c.restore();c.globalAlpha=1;
 if(DATA.meta.last<atlas.end&&DATA.meta.last>=atlas.start){const x=X(DATA.meta.last);c.fillStyle='#ffffff08';c.fillRect(x,top,w-right-x,bottom-top);c.strokeStyle='#99aaa0';c.setLineDash([3,4]);c.beginPath();c.moveTo(x,top);c.lineTo(x,bottom);c.stroke();c.setLineDash([]);c.textAlign='right';c.fillStyle='#a4b6ad';c.fillText('Export ends '+date(DATA.meta.last),w-right,top+12);c.textAlign='left'}
 $('empty').hidden=selected.length>0;$('empty').textContent='No lines selected. Check names at right or choose Top 10.';
 const selectedAtEnd=selected.reduce((sum,s)=>sum+CumulativeCore.valueAt(s.points,atlas.end),0);
 $('summary').innerHTML=`<span><strong>${selected.length} / ${cumulative.model.series.length}</strong> ${atlas.mode==='artists'?'artists':'songs'} selected</span><span><strong>${displayValue(selectedAtEnd)}</strong> ${measure()} through ${date(atlas.end)}</span><span>Top ${cumulative.model.series.length} ranked over the <strong>full archive</strong></span><span>Zoom keeps <strong>prior history</strong></span>`;
 $('coverage').textContent=`UTC ${date(atlas.start)} to ${date(atlas.end)}. Lines begin at zero at the archive origin; zooming retains earlier totals. ${$('cutoff').value==='0'?'Every event counts, including short/zero-duration records.':'Only events with at least '+Number($('cutoff').value)/1000+' seconds recorded are included.'} ${$('genre').value?'Last.fm family filter: '+$('genre').value+'. Tagged subset only.':''}`;
 drawCumulativeOverview(selected);atlas.ready=true;
}
function drawCumulativeOverview(selected){
 const ids=new Set(selected.map(s=>s.id)),{c,w,h}=setupCanvas($('trend')),months=new Map();
 for(let j=0;j<DATA.events.length;j++){const e=DATA.events[j];if(e[2]<Number($('cutoff').value)||($('genre').value&&!DATA.tracks[e[1]].families.includes($('genre').value)))continue;const id=atlas.mode==='artists'?DATA.meta.eventArtists[j]:e[1];if(!ids.has(id))continue;const m=date(e[0]).slice(0,7);months.set(m,(months.get(m)||0)+(cumulative.model.metric==='listens'?1:e[2]));}
 let cur=new Date(fullStart*1000);cur.setUTCDate(1);const last=new Date(fullEnd*1000),all=[];while(cur<=last){const month=cur.toISOString().slice(0,7),a=cur.getTime()/1000;cur.setUTCMonth(cur.getUTCMonth()+1);all.push({month,a,b:cur.getTime()/1000,ms:months.get(month)||0});}
 const max=Math.max(1,...all.map(m=>m.ms)),bw=w/all.length;trendBars=[];
 all.forEach((m,i)=>{const x=i*bw,hh=m.ms/max*(h-22);c.fillStyle='#77967e';c.fillRect(x,h-17-hh,Math.max(1,bw-2),hh);if(m.b>=atlas.start&&m.a<=atlas.end){c.fillStyle='#c7deaa';c.fillRect(x,h-14,Math.max(1,bw-2),2)}if(m.month.endsWith('-01')){c.fillStyle='#a4b6ad';c.font='10px Avenir Next,sans-serif';c.fillText(m.month.slice(0,4),x,h-1)}trendBars.push({...m,x});});
 $('trendHeading').textContent='MONTHLY '+measure().toUpperCase()+' · SELECTED LINES';$('trendNote').textContent='Not cumulative · click a month to zoom';
}
function cumulativeRebuild(){
 ensureCumulative();$('tooltip').style.display='none';cumulative.hover=null;
 $('chartTitle').textContent='Top 50 '+(atlas.mode==='artists'?'artists':'songs')+' · cumulative '+(cumulative.model.metric==='listens'?'listens':'recorded minutes');
 $('explanation').textContent='Every line starts at zero at the archive origin and steps upward as you listen. Top 10 shown initially; choose any of the top 50 at right. Ranked by '+(cumulative.model.metric==='listens'?'qualifying event count':'recorded playback time')+' over the full archive, not the zoom window.';
 $('groupHeading').textContent='Top 50 '+(atlas.mode==='artists'?'artists':'songs');
 $('groupHelp').textContent='Checkboxes add/remove lines · Only isolates one · search narrows this list';
 $('plotNote').textContent='Exact event-time cumulative steps, not smoothed estimates. Hover a line for its total at that date; click to pin details. Drag horizontally to zoom, or use the UTC date fields. All totals include earlier history.';
 $('plot').setAttribute('aria-label','Cumulative line chart of top '+atlas.mode+' over time');
 buildSeriesList();renderCumulative();restoreCumulativeInspector();
}
render=function(){if(isCumulative())renderCumulative();else scatterUI.render()};
rebuild=function(){const on=isCumulative();document.body.classList.toggle('cumulative-mode',on);$('metricControl').hidden=!on;$('cumulativeMethods').hidden=!on;$('selectionTools').hidden=!on;$('clearSelection').hidden=on;$('search').placeholder=on?'Search the top 50…':'e.g. Steely Dan';
 if(on)cumulativeRebuild();else{$('plotNote').textContent=scatterUI.note;$('groupHelp').textContent=scatterUI.help;$('trendHeading').textContent='MONTHLY RECORDED HOURS · FULL ARCHIVE';$('empty').textContent='No matching listening events. Try clearing the filters.';$('plot').setAttribute('aria-label','Scatter plot of listening history over time');scatterUI.rebuild()}
};
$('metric').onchange=rebuild;
function cumulativeMove(e){
 if(dragging){scatterUI.move(e);return;}
 const rect=$('plot').getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top,d=cumulative.draw;
 if(x<d.left||x>d.w-d.right){$('tooltip').style.display='none';return;}
 const time=atlas.start+(x-d.left)/(d.w-d.left-d.right)*(atlas.end-atlas.start);let hit=null,best=22;
 for(const s of cumulative.model.series){if(!cumulative.selected.has(s.id))continue;const v=CumulativeCore.valueAt(s.points,time),delta=Math.abs(d.Y(v)-y);if(delta<best){best=delta;hit={s,v};}}
 if(!hit){if(cumulative.hover!==null){cumulative.hover=null;renderCumulative();restoreCumulativeInspector()}$('tooltip').style.display='none';return;}
 if(cumulative.hover!==hit.s.id){cumulative.hover=hit.s.id;renderCumulative();inspectSeries(hit.s.id)}
 $('tooltip').innerHTML=`<strong>${esc(seriesTitle(hit.s))}</strong><div class="sub">${date(time)} UTC</div><div>${displayValue(hit.v)} cumulative ${measure()}</div><div class="sub">Full archive: ${displayValue(hit.s.total)} ${measure()}<br>${hit.s.album?esc(hit.s.album)+'<br>':''}Rank ${hit.s.rank} / ${cumulative.model.series.length}</div><span class="key">Click to pin details · drag to zoom</span>`;
 $('tooltip').style.display='block';const tw=$('tooltip').offsetWidth,th=$('tooltip').offsetHeight;$('tooltip').style.left=Math.max(10,Math.min(e.clientX+15,innerWidth-tw-10))+'px';$('tooltip').style.top=Math.max(10,Math.min(e.clientY+15,innerHeight-th-10))+'px';
}
$('plot').onpointermove=e=>isCumulative()?cumulativeMove(e):scatterUI.move(e);
$('plot').onpointerup=e=>{if(!isCumulative()){scatterUI.up(e);return;}const rect=$('plot').getBoundingClientRect();if(dragging&&Math.abs(e.clientX-rect.left-dragging.x)>8){scatterUI.up(e);return;}dragging=null;$('brush').style.display='none';cumulative.focus=cumulative.hover;restoreCumulativeInspector()};
$('plot').onpointerleave=e=>{if(!isCumulative()){scatterUI.leave(e);return;}cumulative.hover=null;$('tooltip').style.display='none';renderCumulative();restoreCumulativeInspector()};
$('clearSelection').onclick=()=>{if(isCumulative()){cumulative.focus=null;cumulative.hover=null;renderCumulative();restoreCumulativeInspector()}else scatterUI.clear()};
const scatterTrendMove=$('trend').onmousemove;$('trend').onmousemove=e=>{if(!isCumulative()){scatterTrendMove(e);return;}const x=e.clientX-$('trend').getBoundingClientRect().left,m=trendBars.find((b,i)=>x>=b.x&&(i===trendBars.length-1||x<trendBars[i+1].x));if(m)$('trend').title=m.month+' · '+displayValue(m.ms)+' '+measure()};
