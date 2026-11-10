'use strict';
const el=id=>document.getElementById(id),titles={spectrum:'Sound spectrum',lanes:'Sound clusters',genre:'Genre map',artists:'Artists over time',songs:'Songs over time',calendar:'Listening calendar'};
let data=null,currentView=null,renderedData=null,templatePromise=null,promptText='';window.merlinData=null;
function status(id,text,error=false){el(id).textContent=text;el(id).classList.toggle('error',error)}
function features(d){return d?.tracks.some(t=>t.features.every(v=>v!==null))}
function genres(d){return d?.tracks.some(t=>t.families.length)}
function openDialog(id){if(!el(id).open)el(id).showModal()}
function home(){el('workspace').hidden=true;el('home').hidden=false;currentView=null;document.title='Merlin · Your listening history';window.scrollTo(0,0)}
function updateState(){if(!data)return;window.merlinData=data;el('dataStatus').textContent=new Intl.NumberFormat().format(data.events.length)+' events · '+new Intl.NumberFormat().format(data.tracks.length)+' tracks · '+new Date(data.meta.first*1000).toISOString().slice(0,10)+' — '+new Date(data.meta.last*1000).toISOString().slice(0,10);el('homeExport').disabled=false;
 for(const tag of document.querySelectorAll('[data-needs]')){const count=data.tracks.filter(t=>tag.dataset.needs==='features'?t.features.every(v=>v!==null):t.families.length).length;tag.textContent=count?new Intl.NumberFormat().format(count)+' tracks':'Data not enriched'}
 el('workspaceSources').textContent='Spotify history'+(features(data)?' · Audio features':'')+(genres(data)?' · Genre tags':'');
}
async function showView(view){
 if(!data){openDialog('importDialog');return}currentView=view;el('home').hidden=true;el('workspace').hidden=false;el('workspaceTitle').textContent=titles[view];document.title='Merlin · '+titles[view];
 const needs=['spectrum','lanes'].includes(view)?'features':view==='genre'?'genres':null,available=needs==='features'?features(data):needs==='genres'?genres(data):true;
 el('chartFrame').hidden=true;el('lockedView').hidden=available;el('workspaceBadge').hidden=!needs;
 if(needs){const relevant=data.tracks.filter(t=>needs==='features'?t.features.every(v=>v!==null):t.families.length).length,ms=data.events.reduce((s,e)=>s+((needs==='features'?data.tracks[e[1]].features.every(v=>v!==null):data.tracks[e[1]].families.length)?e[2]:0),0),percent=data.meta.eventMs?100*ms/data.meta.eventMs:0,coverage=percent>0&&percent<.1?'<0.1':(Math.round(percent*10)/10);el('workspaceBadge').textContent=available?relevant+' tracks · '+coverage+'% by time':'Data not enriched'}
 if(!available){el('lockedMessage').textContent=needs==='features'?'This view needs audio features such as energy, acousticness, and tempo. Your artist, song, and calendar views already work.':'This view needs track-level genre tags. Your artist, song, and calendar views already work.';return}
 const cached=el('chartFrame').contentWindow;
 if(renderedData===data&&cached?.atlas?.ready){el('chartFrame').hidden=false;cached.atlas.mode=view;cached.atlas.pinned=null;cached.atlas.hoverGroup=null;cached.atlas.trackPinned=null;cached.document.getElementById('mode').value=view;cached.rebuild();window.scrollTo(0,0);return}
 try{templatePromise??=fetch('chart-frame.html').then(r=>{if(!r.ok)throw Error('Could not load the chart view.');return r.text()});const template=await templatePromise;if(currentView!==view)return;
 const payload=JSON.stringify({...data,meta:{...data.meta,requestedView:view}}).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');
 el('chartFrame').srcdoc=template.replace('__PAYLOAD__',()=>payload);renderedData=data;el('chartFrame').hidden=false;window.scrollTo(0,0);
 }catch(error){el('lockedView').hidden=false;el('lockedMessage').textContent=error.message}
}
function work(message,text){el('busyText').textContent=text;el('busy').hidden=false;return new Promise((resolve,reject)=>{const worker=new Worker('worker.js');worker.onmessage=e=>{worker.terminate();el('busy').hidden=true;if(e.data.error)reject(Error(e.data.error));else resolve(e.data.data)};worker.onerror=e=>{worker.terminate();el('busy').hidden=true;reject(Error(e.message||'The local importer could not finish.'))};worker.postMessage(message)})}
async function importHistory(files){if(!files.length)return;status('importStatus','Reading your files…');try{
 const loaded=await Promise.all([...files].map(async f=>({name:f.name,rows:JSON.parse(await f.text())})));
 const prepared=loaded.length===1&&loaded[0].rows?.events&&loaded[0].rows?.tracks;
 const converted=await work(prepared?{action:'validate',data:loaded[0].rows}:{action:'convert',files:loaded},'Preparing your listening history…');
 data=converted;updateState();el('enrichResult').hidden=true;el('enrichResult').replaceChildren();el('enrichStatus').classList.remove('warning');el('importDialog').close();home();status('enrichStatus','Your history is ready. Enrichment is optional.');openDialog('enrichDialog');status('importStatus','');
 }catch(error){status('importStatus',error instanceof SyntaxError?'That file is not valid JSON. Unzip your Spotify download and select its JSON files.':error.message,true)}finally{el('historyFiles').value=''}}
function showEnrichmentResult(report){
 const box=el('enrichResult'),ratio=(value)=>data.meta.eventMs?(100*value/data.meta.eventMs).toFixed(1)+'%':'0%';box.hidden=false;
 box.innerHTML='<dl><dt>Track IDs matched</dt><dd>'+report.matched+' / '+report.provided+'</dd><dt>Complete audio tracks in this file</dt><dd>'+report.audioTracksInFile+'</dd><dt>Usable genre tracks in this file</dt><dd>'+report.genreTracksInFile+'</dd><dt>Audio coverage after import</dt><dd>'+report.completeAudioTracks+' tracks · '+ratio(report.audioMs)+'</dd><dt>Genre coverage after import</dt><dd>'+report.usableGenreTracks+' tracks · '+ratio(report.genreMs)+'</dd></dl>';
 let message=report.matched+' / '+report.provided+' IDs matched. '+report.audioTracksInFile+' complete audio tracks; '+report.genreTracksInFile+' usable genre tracks in this file. ';
 if(report.newViews.length)message+='Newly available: '+report.newViews.map(v=>titles[v]).join(', ')+'.';
 else if(!report.audioTracksInFile&&!report.genreTracksInFile)message+='No new views unlocked. Empty Last.fm tags are common; audio views need stats.fm audio features.';
 else message+='Existing views updated. Your listening events are unchanged.';
 if(report.unmatched)message+=' '+report.unmatched+' IDs did not match this history.';
 status('enrichStatus',message);el('enrichStatus').classList.toggle('warning',!report.audioTracksInFile&&!report.genreTracksInFile);
 const actions=document.createElement('div');actions.className='result-actions';for(const view of ['spectrum','lanes','genre']){if(view==='genre'?!report.usableGenreTracks:!report.completeAudioTracks)continue;const button=document.createElement('button');button.textContent='Open '+titles[view];button.onclick=()=>{el('enrichDialog').close();showView(view)};actions.append(button)}box.append(actions);
}
async function importEnrichment(files){if(!files.length)return;if(!data){status('enrichStatus','Import your Spotify history first, then add enrichment.',true);return}try{const side=JSON.parse(await files[0].text());const enriched=await work({action:'enrich',data,side},'Matching enrichment and arranging your music…');data=enriched;updateState();showEnrichmentResult(data.meta.enrichment);if(currentView)await showView(currentView)}catch(error){status('enrichStatus',error.message,true)}finally{el('enrichedFiles').value=''}}
function download(value,name){const blob=new Blob([typeof value==='string'?value:JSON.stringify(value)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function exportPrepared(){if(data)download({...data,format:'merlin-history',version:1},'merlin-history.json')}
el('homeExport').onclick=exportPrepared;el('workspaceExport').onclick=exportPrepared;
for(const id of ['openImport','workspaceImport'])el(id).onclick=()=>openDialog('importDialog');
for(const id of ['openEnrich','workspaceEnrich','enrichLocked'])el(id).onclick=()=>openDialog('enrichDialog');
el('closeImport').onclick=()=>el('importDialog').close();el('closeEnrich').onclick=()=>el('enrichDialog').close();
for(const id of ['goHome','backViews','lockedBack'])el(id).onclick=home;
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>showView(b.dataset.view));
el('historyFiles').onchange=e=>importHistory(e.target.files);el('enrichedFiles').onchange=e=>importEnrichment(e.target.files);
function dropZone(id,handler){const zone=el(id);zone.ondragover=e=>{e.preventDefault();zone.classList.add('drag')};zone.ondragleave=()=>zone.classList.remove('drag');zone.ondrop=e=>{e.preventDefault();zone.classList.remove('drag');handler(e.dataTransfer.files)}}
dropZone('historyDrop',importHistory);dropZone('enrichedDrop',importEnrichment);
fetch('enrichment-prompt.txt').then(r=>r.text()).then(text=>{promptText=text;el('promptPreview').textContent=text}).catch(()=>el('promptPreview').textContent='Download the enrichment kit for the prompt and instructions.');
el('copyPrompt').onclick=async()=>{try{if(!promptText)throw Error('The prompt is still loading.');await navigator.clipboard.writeText(promptText);status('enrichStatus','Prompt copied.')}catch(error){status('enrichStatus','Select and copy the prompt under “Read the prompt,” or download the kit.',true)}};
el('downloadCatalog').onclick=()=>{if(!data){status('enrichStatus','Import history before exporting the track list.',true);return}download({format:'merlin-catalog',version:1,tracks:data.tracks.filter(t=>t.id).map(t=>({spotify_id:t.id,title:t.title,artist:t.artist,album:t.album}))},'merlin-track-list.json');status('enrichStatus','Track list exported. It contains catalog details, not your play timestamps.')};
window.addEventListener('message',e=>{if(e.source!==el('chartFrame').contentWindow)return;if(e.data?.type==='merlin:height'&&Number.isFinite(e.data.height)&&e.data.height>0)el('chartFrame').style.height=Math.max(1,Math.min(50000,e.data.height))+'px';if(e.data?.type==='merlin:view'&&titles[e.data.view])showView(e.data.view)});
if('serviceWorker' in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('sw.js').catch(()=>{});
