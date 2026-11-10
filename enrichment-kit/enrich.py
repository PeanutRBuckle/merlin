"""Optional local collector. Python standard library only. No history timestamps required."""
import argparse,datetime as dt,email.utils,json,math,os,pathlib,re,time,urllib.error,urllib.parse,urllib.request
FIELDS=['energy','danceability','valence','acousticness','instrumentalness','speechiness','loudness','tempo']
ROOT=pathlib.Path(__file__).resolve().parent

def parse_features(body,ids):
 if not isinstance(body,dict) or not isinstance(body.get('items'),list):raise ValueError('Unexpected stats.fm response shape; stop and check current docs.')
 out={i:None for i in ids}
 for row in body['items']:
  if not isinstance(row,dict) or row.get('id') not in out:continue
  values={f:row.get(f) for f in FIELDS}
  for f,v in values.items():
   if v is None:continue
   if isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v):raise ValueError('Invalid numeric audio feature.')
   if f in FIELDS[:6] and not 0<=v<=1:raise ValueError('Audio feature outside 0–1.')
   if f=='tempo' and not 0<=v<=400:raise ValueError('Invalid tempo.')
   if f=='loudness' and not -100<=v<=10:raise ValueError('Invalid loudness.')
  if out[row['id']] is not None and out[row['id']]!=values:raise ValueError('Conflicting duplicate provider ID.')
  out[row['id']]=values
 return out

def parse_tags(body,taxonomy=ROOT/'taxonomy.json'):
 if body.get('error'):
  if body['error']==6:return {'families':[],'tags':[],'raw_tags':[],'status':'not_found'}
  raise ValueError('Last.fm returned an API error code '+str(body['error'])+'; stop and inspect access, without printing credentials.')
 raw=body.get('toptags',{}).get('tag',[])
 if isinstance(raw,dict):raw=[raw]
 vocabulary=json.loads(pathlib.Path(taxonomy).read_text());mapping=vocabulary['effective_tag_mapping'];threshold=vocabulary['minimum_source_weight'];families=set();tags=set()
 for row in raw:
  name=' '.join(str(row.get('name','')).casefold().split())
  try:weight=float(row.get('count',0))
  except (ValueError,TypeError):continue
  if name in mapping and weight>=threshold:families.add(mapping[name]['family']);tags.add(mapping[name]['canonical_genre'])
 return {'families':sorted(families),'tags':sorted(tags),'raw_tags':raw,'status':'matched' if tags else 'no_usable_tags'}

def write(path,obj):
 temporary=path.with_suffix(path.suffix+'.partial');temporary.write_text(json.dumps(obj,ensure_ascii=False,indent=2));temporary.replace(path)

def request(base,params,cache,cache_path):
 url=base+'?'+urllib.parse.urlencode(params)
 try:
  with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Merlin-personal-listening-analytics/1'}),timeout=40) as response:return json.loads(response.read())
 except urllib.error.HTTPError as error:
  if error.code==429:
   value=error.headers.get('Retry-After','3600')
   try:seconds=float(value)
   except ValueError:
    try:seconds=max(0,email.utils.parsedate_to_datetime(value).timestamp()-time.time())
    except Exception:seconds=3600
   cache['retry_after_unix']=time.time()+seconds;write(cache_path,cache)
  raise RuntimeError('Provider HTTP '+str(error.code)+'. Stopped; do not evade access/rate limits. No request URL is logged.') from None
 except (urllib.error.URLError,TimeoutError):raise RuntimeError('Provider connection failed. Check access before resuming; no automatic retries.') from None

def export(catalog,cache,output):
 rows=[]
 for track in catalog['tracks']:
  sid=track['spotify_id'];row={'spotify_id':sid};state=cache.get('features',{}).get(sid)
  if state is not None:row['features']=state;row['features_source']={'provider':'stats.fm','fetched_at':cache.get('feature_dates',{}).get(sid)}
  pair=json.dumps([track.get('artist'),track.get('title')],ensure_ascii=False)
  if pair in cache.get('tags',{}):row['lastfm']=cache['tags'][pair]
  if len(row)>1:rows.append(row)
 write(output,{'format':'merlin-enrichment','version':1,'source':'stats.fm audio features / Last.fm track tags; source levels remain separate','tracks':rows})

class Pacer:
 def __init__(self,interval,clock=time.monotonic,sleep=time.sleep):
  self.interval=interval;self.clock=clock;self.sleep=sleep;self.last_start=None
 def wait(self):
  now=self.clock()
  if self.last_start is not None:
   remaining=self.interval-(now-self.last_start)
   if remaining>0:self.sleep(remaining)
  self.last_start=self.clock()

def make_parser():
 parser=argparse.ArgumentParser(description='Enrich an exported Merlin track list locally; provider access is not guaranteed.')
 parser.add_argument('catalog',type=pathlib.Path);parser.add_argument('--output',type=pathlib.Path,default=pathlib.Path('merlin-enrichment.json'));parser.add_argument('--cache',type=pathlib.Path,default=pathlib.Path('merlin-enrichment-cache.json'));parser.add_argument('--audio',action='store_true');parser.add_argument('--genres',action='store_true');parser.add_argument('--export-only',action='store_true');parser.add_argument('--interval',type=float,default=None,help='Optional legacy override for both request-start intervals.');parser.add_argument('--tag-interval',type=float,default=.3,help='Seconds between Last.fm query starts (not an extra delay after each response).');parser.add_argument('--audio-interval',type=float,default=1.5,help='Seconds between stats.fm batch starts; each batch contains up to 50 IDs.');parser.add_argument('--limit',type=int,default=50,help='Pilot size per run; explicitly increase after checking access and terms.')
 return parser

def main():
 parser=make_parser()
 args=parser.parse_args();catalog=json.loads(args.catalog.read_text())
 if catalog.get('format')!='merlin-catalog' or not isinstance(catalog.get('tracks'),list):parser.error('Use Export track list from Merlin.')
 tag_interval=args.interval if args.interval is not None else args.tag_interval;audio_interval=args.interval if args.interval is not None else args.audio_interval
 if args.limit<1 or any(not math.isfinite(v) or v<.25 for v in [tag_interval,audio_interval]):parser.error('Use a positive limit and finite request-start intervals of at least 0.25 seconds; limits are provider-controlled, not guaranteed by this setting.')
 tag_pacer=Pacer(tag_interval);audio_pacer=Pacer(audio_interval)
 seen=set()
 for row in catalog['tracks']:
  sid=row.get('spotify_id','')
  if not re.fullmatch('[A-Za-z0-9]{22}',sid) or sid in seen:parser.error('Catalog has an invalid or duplicate literal Spotify track ID.')
  seen.add(sid)
 cache=json.loads(args.cache.read_text()) if args.cache.exists() else {'features':{},'feature_dates':{},'tags':{},'raw_features':[]}
 if cache.get('retry_after_unix',0)>time.time() and not args.export_only:parser.error('A provider Retry-After cooldown remains active. Use --export-only or wait.')
 if not any([args.audio,args.genres,args.export_only]):parser.error('Choose --audio, --genres, or --export-only.')
 key=os.environ.get('LASTFM_API_KEY')
 if args.genres and not key and not args.export_only:parser.error('Set LASTFM_API_KEY locally. Never paste it into a chatbot or app.')
 try:
  if args.audio and not args.export_only:
   pending=[r['spotify_id'] for r in catalog['tracks'] if r['spotify_id'] not in cache['features']][:args.limit]
   for offset in range(0,len(pending),50):
    ids=pending[offset:offset+50];audio_pacer.wait();body=request('https://api.stats.fm/api/v1/SPOTIFY/audio-features',{'ids':','.join(ids)},cache,args.cache);values=parse_features(body,ids);now=dt.datetime.now(dt.timezone.utc).isoformat();cache['features'].update(values);cache['feature_dates'].update({i:now for i in ids});cache['raw_features'].append({'ids':ids,'fetched_at':now,'body':body});write(args.cache,cache);export(catalog,cache,args.output);print('Checkpointed audio IDs:',offset+len(ids))
  if args.genres and not args.export_only:
   done=0
   for track in catalog['tracks']:
    pair=json.dumps([track.get('artist'),track.get('title')],ensure_ascii=False)
    if pair in cache['tags']:continue
    tag_pacer.wait();body=request('https://ws.audioscrobbler.com/2.0/',{'method':'track.getTopTags','artist':track.get('artist') or '', 'track':track.get('title') or '', 'api_key':key,'format':'json','autocorrect':0},cache,args.cache)
    if body.get('error')==29:
     cache['retry_after_unix']=time.time()+60;write(args.cache,cache);raise RuntimeError('Last.fm error 29: rate limit exceeded. Stopped and saved a conservative 60-second cooldown; do not keep retrying. This is a local backoff, not a claimed provider reset time.')
    tags=parse_tags(body);tags.update({'provider':'Last.fm track.getTopTags','match':'exact_export_text','fetched_at':dt.datetime.now(dt.timezone.utc).isoformat()});cache['tags'][pair]=tags;write(args.cache,cache);export(catalog,cache,args.output);done+=1;print('Checkpointed tag queries:',done)
    if done>=args.limit:break
  export(catalog,cache,args.output)
 except (ValueError,RuntimeError,json.JSONDecodeError) as error:
  export(catalog,cache,args.output);print('Stopped:',str(error));return 1
 print('Wrote',args.output,'(gaps stay missing; cached completed requests are skipped).');return 0
if __name__=='__main__':raise SystemExit(main())
