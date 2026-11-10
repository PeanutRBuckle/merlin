/* Exact event-time cumulative series. No network, rounding, or edition merging. */
(function(root){
'use strict';
function build(data,options){
 const {type,metric,cutoff,family,start,end}=options,byArtist=type==='artists',groups=new Map(),accepted=[];
 for(let j=0;j<data.events.length;j++){
  const e=data.events[j],track=data.tracks[e[1]];
  if(e[2]<cutoff||(family&&!track.families.includes(family)))continue;
  const id=byArtist?data.meta.eventArtists[j]:e[1];
  if(!groups.has(id)){
   const name=byArtist?data.meta.artistNames[id]:track.title;
   groups.set(id,{id,key:byArtist?name:track.id,label:name??'Unknown artist',artist:byArtist?null:track.artist,album:byArtist?null:track.album,count:0,ms:0,points:[[start,0]]});
  }
  const s=groups.get(id);s.count++;s.ms+=e[2];accepted.push([id,e[0],metric==='listens'?1:e[2]]);
 }
 const series=[...groups.values()].map(s=>({...s,total:metric==='listens'?s.count:s.ms})).sort((a,b)=>b.total-a.total||String(a.key).localeCompare(String(b.key))).slice(0,50);
 const chosen=new Map(series.map(s=>[s.id,s]));
 for(const [id,time,increment] of accepted){const s=chosen.get(id);if(!s)continue;const last=s.points[s.points.length-1];if(last[0]===time)last[1]+=increment;else s.points.push([time,last[1]+increment]);}
 for(const s of series){const last=s.points[s.points.length-1];if(last[0]!==end)s.points.push([end,last[1]]);}
 return {series,type,metric,cutoff,family,start,end,universe:groups.size};
}
function valueAt(points,time){let lo=0,hi=points.length;while(lo<hi){const mid=(lo+hi)>>>1;if(points[mid][0]<=time)lo=mid+1;else hi=mid;}return lo?points[lo-1][1]:0;}
const api={build,valueAt};if(typeof module==='object'&&module.exports)module.exports=api;else root.CumulativeCore=api;
})(typeof globalThis==='object'?globalThis:this);
