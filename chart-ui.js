/* Lean chart chrome: right-side filters, one document scroll, and no secondary charts. */
'use strict';
const viewTitles={spectrum:'Sound spectrum',lanes:'Sound clusters',genre:'Genre map',artists:'Artists over time',songs:'Songs over time',calendar:'Listening calendar'};
const sidebar=document.querySelector('.sidebar'),groupPanel=sidebar.firstElementChild;groupPanel.id='groupPanel';
const filterPanel=document.createElement('section');filterPanel.id='filterPanel';filterPanel.innerHTML='<h2>Filters</h2>';sidebar.prepend(filterPanel);
const controls=document.querySelector('.controls'),dateRow=document.querySelector('.date-row');filterPanel.append(controls,dateRow,$('summary'));
const searchLabel=$('search').closest('label'),genreLabel=$('genre').closest('label'),cutoffLabel=$('cutoff').closest('label'),kLabel=$('k').closest('label');
$('mode').closest('label').hidden=true;
function renameLabel(label,text){for(const child of label.childNodes)if(child.nodeType===Node.TEXT_NODE){child.textContent=text;return}}
renameLabel(searchLabel,'Artist or track');renameLabel(genreLabel,'Genre');renameLabel($('metricControl'),'Measure');
controls.append($('metricControl'),kLabel,searchLabel,genreLabel,cutoffLabel);
const from=$('from'),to=$('to'),apply=$('applyDates'),reset=$('reset'),statusNode=$('status');
dateRow.replaceChildren();const dateTitle=document.createElement('span');dateTitle.className='date-label';dateTitle.textContent='Dates';
const fields=document.createElement('div');fields.className='date-fields';fields.append(from,to);const buttons=document.createElement('div');buttons.className='date-buttons';buttons.append(apply,reset);dateRow.append(dateTitle,fields,buttons,statusNode);
apply.textContent='Apply';reset.textContent='Reset';
for(const id of ['explanation','plotNote','coverage','groupHelp','cumulativeMethods'])$(id).hidden=true;
document.querySelectorAll('body>details').forEach(element=>element.hidden=true);
// Handler setup in the inherited renderer has already completed; these nodes can now go.
for(const selector of ['.trend-head','#trend'])document.querySelector(selector)?.remove();
const legacyLabels=document.createElement('div');legacyLabels.hidden=true;legacyLabels.innerHTML='<span id="trendHeading"></span><span id="trendNote"></span>';document.body.append(legacyLabels);
drawTrend=function(){};drawCumulativeOverview=function(){};
function compactStats(){
 if(isCumulative()&&cumulative.model){const chosen=cumulative.model.series.filter(s=>cumulative.selected.has(s.id)),value=chosen.reduce((sum,s)=>sum+CumulativeCore.valueAt(s.points,atlas.end),0);$('summary').innerHTML='<span><strong>'+chosen.length+' / '+cumulative.model.series.length+'</strong> selected</span><span><strong>'+displayValue(value)+'</strong> '+measure()+'</span>'}
 else if(atlas.mode==='calendar'&&atlas.calendarStats){const s=atlas.calendarStats;$('summary').innerHTML='<span><strong>'+hours(s.ms)+' h</strong> recorded</span><span><strong>'+fmt.format(s.count)+'</strong> events</span><span><strong>'+s.days+'</strong> listening days</span>'}
 else{for(const span of [...$('summary').children].slice(2))span.hidden=true;}
}
function cleanChrome(){
 $('chartTitle').textContent=viewTitles[atlas.mode];$('search').placeholder=isCumulative()?'Search the top 50…':'Find artist or track';for(const id of ['explanation','plotNote','coverage','groupHelp','cumulativeMethods'])$(id).hidden=true;
 groupPanel.hidden=atlas.mode==='calendar';$('inspector').hidden=atlas.mode==='calendar';kLabel.hidden=!(atlas.mode==='spectrum'||atlas.mode==='lanes');compactStats();atlas.reviewReady=true;scheduleHeight();
}
restoreCumulativeInspector=function(){if(cumulative.focus!==null)inspectSeries(cumulative.focus);else $('inspector').replaceChildren()};
inspectSeries=function(id){const s=cumulative.model?.series.find(s=>s.id===id);if(!s)return;const total=CumulativeCore.valueAt(s.points,atlas.end);$('inspector').innerHTML='<h3>'+esc(seriesTitle(s))+'</h3>'+(s.album?'<p class="album-name">'+esc(s.album)+'</p>':'')+'<dl class="inspect-totals"><dt>Total listens</dt><dd>'+fmt.format(s.count)+'</dd><dt>Recorded minutes</dt><dd>'+fmt.format(Math.round(s.ms/60000))+'</dd><dt>Through '+date(atlas.end)+'</dt><dd>'+displayValue(total)+' '+measure()+'</dd></dl>';scheduleHeight()};
const fullRestoreInspector=restoreInspector;restoreInspector=function(){if(atlas.trackPinned===null&&activeGroup()===null)$('inspector').replaceChildren();else fullRestoreInspector();scheduleHeight()};
const leanRender=render,leanRebuild=rebuild;
const directCumulativeRender=renderCumulative;renderCumulative=function(){directCumulativeRender();cleanChrome()};
render=function(){leanRender();cleanChrome()};rebuild=function(){leanRebuild();cleanChrome()};
reset.onclick=()=>{atlas.start=fullStart;atlas.end=fullEnd;atlas.k='10';atlas.pinned=null;atlas.hoverGroup=null;atlas.trackPinned=null;cumulative.focus=null;cumulative.hover=null;cumulative.selections.clear();cumulative.signature=null;$('search').value='';$('genre').value='';$('cutoff').value='30000';$('metric').value='listens';$('k').value='10';statusNode.textContent='';syncDates();rebuild()};
let heightFrame=0,lastHeight=0;
function scheduleHeight(){if(heightFrame)return;heightFrame=requestAnimationFrame(()=>{heightFrame=0;const height=Math.ceil(document.body.getBoundingClientRect().height)+1;if(height!==lastHeight&&height>0){lastHeight=height;parent.postMessage({type:'merlin:height',height},'*')}})}
new ResizeObserver(scheduleHeight).observe(document.body);document.fonts.ready.then(scheduleHeight);
rebuild();
