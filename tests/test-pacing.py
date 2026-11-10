"""Pacing regression: intervals are between starts, not added after every response."""
import importlib.util,pathlib,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('collector',ROOT/'enrichment-kit/enrich.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class PacingTests(unittest.TestCase):
 def test_global_start_spacing_only_sleeps_for_remaining_gap(self):
  self.assertTrue(hasattr(m,'Pacer'),'Provider-aware request-start pacing is missing')
  now=[0.];sleeps=[]
  def sleep(value):sleeps.append(value);now[0]+=value
  pacer=m.Pacer(.3,clock=lambda:now[0],sleep=sleep)
  pacer.wait();self.assertEqual(sleeps,[])
  now[0]=.12;pacer.wait();self.assertAlmostEqual(sleeps[0],.18)
  now[0]=1.1;pacer.wait();self.assertEqual(len(sleeps),1,'A slow response must not incur another full delay')
 def test_provider_defaults_and_legacy_override(self):
  self.assertTrue(hasattr(m,'make_parser'),'Provider-specific interval options are missing')
  args=m.make_parser().parse_args(['catalog.json','--audio','--genres'])
  self.assertEqual(args.tag_interval,.3);self.assertEqual(args.audio_interval,1.5);self.assertIsNone(args.interval)
  self.assertEqual(m.make_parser().parse_args(['catalog.json','--interval','.5']).interval,.5)
 def test_lastfm_api_error_29_persists_a_stop_without_retry(self):
  import json,tempfile,time
  from unittest.mock import patch
  with tempfile.TemporaryDirectory(dir=ROOT) as folder:
   root=pathlib.Path(folder);catalog=root/'catalog.json';cache=root/'cache.json';output=root/'out.json'
   catalog.write_text(json.dumps({'format':'merlin-catalog','tracks':[{'spotify_id':'0123456789ABCDEFGHIJKL','artist':'Synthetic artist','title':'Synthetic title'}]}))
   argv=['enrich.py',str(catalog),'--genres','--cache',str(cache),'--output',str(output)]
   with patch('sys.argv',argv),patch.dict('os.environ',{'LASTFM_API_KEY':'synthetic-not-a-real-key'}),patch.object(m,'request',return_value={'error':29}) as request:
    self.assertEqual(m.main(),1);self.assertEqual(request.call_count,1)
   self.assertGreater(json.loads(cache.read_text())['retry_after_unix'],time.time())
   self.assertEqual(json.loads(output.read_text())['tracks'],[])
if __name__=='__main__':unittest.main()
