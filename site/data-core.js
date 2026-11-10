/* Merlin's local, deterministic import/enrichment data contract. */
(function(root){'use strict';
const FEATURES=['energy','danceability','valence','acousticness','instrumentalness','speechiness','loudness','tempo'];
const FAMILIES=['Ambient','Blues','Children/Seasonal','Classical','Country/Americana','Easy Listening/Lounge','Electronic','Experimental/Avant-garde','Folk/Acoustic','Hip-Hop/Rap','Indie/Alternative','Jazz','Latin','Metal','Pop','Punk','R&B/Soul/Funk','Reggae/Ska','Rock','Soundtrack/Stage','Spoken/Non-music','World/Regional'];
const emptyTrack=(id,title,artist,album)=>({id,title,artist,album,features:Array(8).fill(null),families:[],tags:[],statsTrack:[],statsAlbum:[],statsArtist:[]});
function stable(x){if(Array.isArray(x))return '['+x.map(stable).join(',')+']';if(x&&typeof x==='object')return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+stable(x[k])).join(',')+'}';return JSON.stringify(x)}
function convert(files){
 const seen=new Set(),tracks=[],keys=new Map(),artists=[],artistKeys=new Map(),entries=[];
 const report={sourceRows:0,duplicates:0,excludedNonMusic:0,missingTrackIds:0};
 for(const file of files){if(!Array.isArray(file.rows))throw Error(file.name+': expected an array of Spotify extended-history records.');const medium=/video/i.test(file.name)?'video':'audio';
  for(const r of file.rows){report.sourceRows++;if(!r||typeof r!=='object')throw Error('Invalid history record.');const signature=medium+':'+stable(r);if(seen.has(signature)){report.duplicates++;continue}seen.add(signature);
   if(medium==='video'||r.episode_name||r.spotify_episode_uri||r.audiobook_uri||r.audiobook_title||(!r.spotify_track_uri&&!r.master_metadata_track_name)){report.excludedNonMusic++;continue}
   const time=Date.parse(r.ts)/1000;if(!Number.isFinite(time))throw Error('Invalid timestamp in '+file.name);if(!Number.isSafeInteger(r.ms_played)||r.ms_played<0)throw Error('Invalid recorded duration in '+file.name);
   const match=/^spotify:track:([A-Za-z0-9]{22})$/.exec(r.spotify_track_uri||'');const id=match?match[1]:null;
   if(!id)report.missingTrackIds++;const key=r.spotify_track_uri||stable([r.master_metadata_track_name,r.master_metadata_album_artist_name,r.master_metadata_album_album_name]);
   if(!keys.has(key)){keys.set(key,tracks.length);tracks.push(emptyTrack(id,r.master_metadata_track_name||'Unknown title',r.master_metadata_album_artist_name||null,r.master_metadata_album_album_name||null))}
   const name=r.master_metadata_album_artist_name||null;if(!artistKeys.has(name)){artistKeys.set(name,artists.length);artists.push(name)}
   entries.push({event:[Math.floor(time),keys.get(key),r.ms_played],artist:artistKeys.get(name)});
  }
 }
 if(!entries.length)throw Error('No audio-track history was found. Use Spotify Extended Streaming History JSON files.');entries.sort((a,b)=>a.event[0]-b.event[0]);
 const events=entries.map(x=>x.event),meta={artistNames:artists,eventArtists:entries.map(x=>x.artist),eventMs:events.reduce((n,e)=>n+e[2],0),first:events[0][0],last:events.at(-1)[0],features:FEATURES,importReport:report,built:new Date().toISOString()};
 const data={format:'merlin-history',version:1,tracks,events,meta};data.models=models(data);return data;
}
function validate(d){
 if(!d||!Array.isArray(d.tracks)||!Array.isArray(d.events)||!d.meta||!Array.isArray(d.meta.artistNames)||!Array.isArray(d.meta.eventArtists))throw Error('Not a Merlin prepared-history file. Import the original Spotify JSON files instead.');
 if(!d.events.length||d.meta.eventArtists.length!==d.events.length)throw Error('Missing history or artist attribution.');let prev=-Infinity;
 for(let j=0;j<d.events.length;j++){const e=d.events[j];if(!Array.isArray(e)||e.length!==3||!Number.isSafeInteger(e[0])||e[0]<prev)throw Error('Invalid or unsorted timestamp.');prev=e[0];if(!Number.isInteger(e[1])||e[1]<0||e[1]>=d.tracks.length)throw Error('Invalid track reference.');if(!Number.isSafeInteger(e[2])||e[2]<0)throw Error('Invalid duration.');if(!Number.isInteger(d.meta.eventArtists[j])||d.meta.eventArtists[j]<0||d.meta.eventArtists[j]>=d.meta.artistNames.length)throw Error('Invalid artist reference.')}
 for(const t of d.tracks){if(t.id!==null&&!/^[A-Za-z0-9]{22}$/.test(t.id))throw Error('Invalid Spotify ID.');for(const f of ['families','tags','statsTrack','statsAlbum','statsArtist'])if(!Array.isArray(t[f])||t[f].some(s=>typeof s!=='string'))throw Error('Invalid '+f+' labels.');checkFeatures(t.features);}
 d.meta.first=d.events[0][0];d.meta.last=d.events.at(-1)[0];d.meta.eventMs=d.events.reduce((n,e)=>n+e[2],0);d.models=models(d);return d;
}
function checkFeatures(values){if(!Array.isArray(values)||values.length!==8)throw Error('Expected eight audio features.');values.forEach((v,i)=>{if(v===null)return;if(typeof v!=='number'||!Number.isFinite(v))throw Error('Invalid '+FEATURES[i]);if(i<6&&(v<0||v>1))throw Error('Invalid '+FEATURES[i]+' (expected 0–1).');if(i===6&&(v<-100||v>10))throw Error('Invalid loudness.');if(i===7&&(v<0||v>400))throw Error('Invalid tempo.');})}
function capabilityCounts(data){let completeAudioTracks=0,usableGenreTracks=0;for(const t of data.tracks){if(t.features.every(v=>v!==null))completeAudioTracks++;if(t.families.length)usableGenreTracks++;}let audioMs=0,genreMs=0;for(const e of data.events){if(data.tracks[e[1]].features.every(v=>v!==null))audioMs+=e[2];if(data.tracks[e[1]].families.length)genreMs+=e[2];}return {completeAudioTracks,usableGenreTracks,audioMs,genreMs};}
function mergeEnrichment(data,side){
 if(!side||side.format!=='merlin-enrichment'||side.version!==1||!Array.isArray(side.tracks))throw Error('Expected a version 1 merlin-enrichment JSON file.');const out=JSON.parse(JSON.stringify(data)),ids=new Map(out.tracks.map((t,i)=>[t.id,i])),seen=new Set(),before=capabilityCounts(data);let matched=0,audioTracksInFile=0,genreTracksInFile=0;
 for(const row of side.tracks){if(!/^[A-Za-z0-9]{22}$/.test(row.spotify_id||''))throw Error('Invalid Spotify track ID in enrichment.');if(seen.has(row.spotify_id))throw Error('Duplicate enrichment ID: '+row.spotify_id);seen.add(row.spotify_id);const i=ids.get(row.spotify_id);if(i===undefined)continue;matched++;const t=out.tracks[i];
  if(row.features){if(typeof row.features!=='object'||Array.isArray(row.features))throw Error('Invalid audio feature object.');const supplied=FEATURES.map(f=>row.features[f]??null);checkFeatures(supplied);if(supplied.every(v=>v!==null))audioTracksInFile++;t.features=t.features.map((old,j)=>supplied[j]===null?old:supplied[j]);}
  if(row.lastfm){for(const f of ['families','tags']){if(row.lastfm[f]===undefined||row.lastfm[f]===null)continue;const list=row.lastfm[f];if(!Array.isArray(list)||list.some(x=>typeof x!=='string'||x.length>200))throw Error('Invalid Last.fm '+f);if(f==='families'&&list.some(x=>!FAMILIES.includes(x)))throw Error('Unknown broad family; use the documented vocabulary.');t[f]=[...new Set([...t[f],...list])];}if(row.lastfm.families?.length)genreTracksInFile++;}
  for(const [key,field] of [['track_release','statsTrack'],['album_release','statsAlbum'],['credited_artist','statsArtist']])if(row.statsfm?.[key]){const tags=row.statsfm[key];if(!Array.isArray(tags)||tags.some(x=>typeof x!=='string'))throw Error('Invalid stats.fm labels.');t[field]=[...new Set([...t[field],...tags])];}
 }
 if(!matched&&side.tracks.length)throw Error('No enrichment IDs match this listening history.');const after=capabilityCounts(out),newViews=[];if(!before.completeAudioTracks&&after.completeAudioTracks)newViews.push('spectrum','lanes');if(!before.usableGenreTracks&&after.usableGenreTracks)newViews.push('genre');
 out.meta.enrichment={matched,provided:side.tracks.length,unmatched:side.tracks.length-matched,audioTracksInFile,genreTracksInFile,...after,newCompleteAudioTracks:after.completeAudioTracks-before.completeAudioTracks,newUsableGenreTracks:after.usableGenreTracks-before.usableGenreTracks,newViews,source:side.source||'Imported sidecar',importedAt:new Date().toISOString()};out.models=models(out);return out;
}
function models(data){
 const tracks=data.tracks,n=tracks.length,valid=[];tracks.forEach((t,i)=>{if(t.features.every(v=>v!==null))valid.push(i)});const ms=Array(n).fill(0),counts=Array(n).fill(0);for(const e of data.events){ms[e[1]]+=e[2];counts[e[1]]++}
 let vectors=[],axis=Array(8).fill(0),spectrum=Array(n).fill(null),explained=0,project=[];
 if(valid.length){const means=Array(8).fill(0),std=Array(8).fill(0);for(const i of valid)tracks[i].features.forEach((v,j)=>means[j]+=v/valid.length);for(const i of valid)tracks[i].features.forEach((v,j)=>std[j]+=(v-means[j])**2/valid.length);vectors=valid.map(i=>tracks[i].features.map((v,j)=>Math.max(-4,Math.min(4,(v-means[j])/(Math.sqrt(std[j])||1)))));
  const cov=Array.from({length:8},()=>Array(8).fill(0));for(const v of vectors)for(let a=0;a<8;a++)for(let b=0;b<8;b++)cov[a][b]+=v[a]*v[b]/valid.length;
  axis=Array(8).fill(1/Math.sqrt(8));for(let r=0;r<100;r++){const next=cov.map(row=>row.reduce((s,v,j)=>s+v*axis[j],0)),norm=Math.hypot(...next);if(norm<1e-12){axis=[0,0,0,1,0,0,0,0];break}axis=next.map(v=>v/norm)}if(axis[3]<0)axis=axis.map(v=>-v);
  const eig=axis.reduce((s,v,a)=>s+v*cov[a].reduce((r,z,j)=>r+z*axis[j],0),0),trace=cov.reduce((s,row,j)=>s+row[j],0);explained=trace?eig/trace:0;
  project=vectors.map(v=>v.reduce((s,z,j)=>s+z*axis[j],0));let min=Infinity,max=-Infinity;for(const p of project){min=Math.min(min,p);max=Math.max(max,p)}valid.forEach((id,i)=>spectrum[id]=max===min?.5:(project[i]-min)/(max-min));
 }
 const pos=['Energetic','Danceable','High-valence','Acoustic','Instrumental','Speech-heavy','Loud','Fast'],neg=['Gentle','Less danceable','Low-valence','Electric','Vocal','Low-speech','Quiet','Slow'],clusters={};
 for(const k of [6,10,14]){
  const actual=Math.min(k,valid.length),centers=[];if(actual){centers.push([...vectors[0]]);for(let q=1;q<actual;q++){let best=0,distance=-1;vectors.forEach((v,i)=>{const d=Math.min(...centers.map(c=>v.reduce((s,z,j)=>s+(z-c[j])**2,0)));if(d>distance){distance=d;best=i}});centers.push([...vectors[best]])}}
  let labels=Array(valid.length).fill(0);for(let round=0;round<35&&actual;round++){const sums=Array.from({length:actual},()=>Array(8).fill(0)),sizes=Array(actual).fill(0);let changes=0;vectors.forEach((v,i)=>{let best=0,d=Infinity;centers.forEach((c,g)=>{const x=v.reduce((s,z,j)=>s+(z-c[j])**2,0);if(x<d){d=x;best=g}});if(labels[i]!==best)changes++;labels[i]=best;sizes[best]++;v.forEach((z,j)=>sums[best][j]+=z)});centers.forEach((c,g)=>{if(sizes[g])centers[g]=sums[g].map(z=>z/sizes[g])});if(round>0&&!changes)break}
  const order=centers.map((c,id)=>({id,p:c.reduce((s,v,j)=>s+v*axis[j],0)})).sort((a,b)=>a.p-b.p),remap=new Map(order.map((g,i)=>[g.id,i])),assignment=Array(n).fill(-1);valid.forEach((id,i)=>assignment[id]=remap.get(labels[i]));
  const groups=Array.from({length:k},(_,g)=>{const members=valid.filter(id=>assignment[id]===g),centroid=centers[order[g]?.id]||Array(8).fill(0),topFeatures=Array.from({length:8},(_,j)=>j).sort((a,b)=>Math.abs(centroid[b])-Math.abs(centroid[a])).slice(0,2),artistMs=new Map(),tagMs=new Map();for(const i of members){const a=tracks[i].artist||'Unknown artist';artistMs.set(a,(artistMs.get(a)||0)+ms[i]);for(const t of tracks[i].families)tagMs.set(t,(tagMs.get(t)||0)+ms[i])}return {id:g,name:members.length?topFeatures.map(j=>centroid[j]>=0?pos[j]:neg[j]).join(' / '):'No assigned tracks',ms:members.reduce((s,i)=>s+ms[i],0),events:members.reduce((s,i)=>s+counts[i],0),tracks:members.length,top:[...members].sort((a,b)=>ms[b]-ms[a]).slice(0,8),artists:[...artistMs].sort((a,b)=>b[1]-a[1]).slice(0,5).map(x=>x[0]),tags:[...tagMs].sort((a,b)=>b[1]-a[1]).slice(0,4).map(x=>x[0]),profile:Array.from({length:8},(_,j)=>members.reduce((s,i)=>s+tracks[i].features[j],0)/(members.length||1))}});clusters[k]={assignment,groups};
 }
 const families=[...new Set(tracks.flatMap(t=>t.families))].sort();const genrePosition=tracks.map(t=>t.families.length?t.families.reduce((s,f)=>s+families.indexOf(f)/Math.max(1,families.length-1),0)/t.families.length:null);
 return {clusters,spectrum,pcaExplained:explained,pcaLoadings:axis,genreAxis:families,genrePosition};
}
const api={convert,validate,mergeEnrichment,models,FEATURES,FAMILIES};if(typeof module==='object'&&module.exports)module.exports=api;else root.MerlinData=api;
})(typeof globalThis==='object'?globalThis:this);
