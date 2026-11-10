import importlib.util,pathlib,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
class EnrichmentTests(unittest.TestCase):
 def test_feature_id_matching_and_tag_provenance(self):
  path=ROOT/'enrichment-kit/enrich.py'
  self.assertTrue(path.exists(),'Portable enrichment collector is missing')
  spec=importlib.util.spec_from_file_location('collector',path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
  row={'id':'0123456789ABCDEFGHIJKL','energy':0,'danceability':.6,'valence':.7,'acousticness':.1,'instrumentalness':0,'speechiness':.02,'loudness':-7,'tempo':120}
  out=m.parse_features({'items':[row]},['0123456789ABCDEFGHIJKL','ZZZZZZZZZZZZZZZZZZZZZZ'])
  self.assertEqual(out['0123456789ABCDEFGHIJKL']['energy'],0)
  self.assertIsNone(out['ZZZZZZZZZZZZZZZZZZZZZZ'])
  self.assertRaises(ValueError,m.parse_features,{'items':[{**row,'energy':2}]},[row['id']])
  tag=m.parse_tags({'toptags':{'tag':[{'name':'rock','count':40},{'name':'favorites','count':100},{'name':'jazz','count':1}]}},ROOT/'enrichment-kit/taxonomy.json')
  self.assertEqual(tag['families'],['Rock']);self.assertEqual(tag['tags'],['rock'])
  self.assertEqual(len(tag['raw_tags']),3)
if __name__=='__main__':unittest.main()
