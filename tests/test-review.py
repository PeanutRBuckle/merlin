import os
"""First-review UI regression: lean chrome, right filters, full reset, and one page scroll."""
import json,pathlib,threading,unittest
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
class ReviewTests(unittest.TestCase):
 def test_requested_review_changes_and_pilot_feedback(self):
  server=ThreadingHTTPServer(('127.0.0.1',0),partial(SimpleHTTPRequestHandler,directory=str(ROOT/'site')));threading.Thread(target=server.serve_forever,daemon=True).start()
  try:
   with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('MERLIN_CHROME_PATH'),headless=True)
    page=browser.new_page(viewport={'width':1500,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(f'http://127.0.0.1:{server.server_port}/');page.wait_for_function('document.fonts.status==="loaded"')
    self.assertEqual(page.locator('.brand-tagline').inner_text(),'Music Magic')
    self.assertNotIn('illuminated',page.locator('#home').inner_text().lower());self.assertNotIn('Find the patterns',page.locator('#home').inner_text())
    page.locator('#openEnrich').click();boxes=[page.locator('#'+x).bounding_box() for x in ['copyPrompt','downloadCatalog']]+[page.locator('.dialog-actions a').bounding_box()]
    self.assertLess(max(b['height'] for b in boxes)-min(b['height'] for b in boxes),2)
    self.assertLess(max(b['y'] for b in boxes)-min(b['y'] for b in boxes),2)
    page.locator('#closeEnrich').click();page.locator('#openImport').click()
    rows=[]
    for i in range(120):rows.append({'ts':f'{2023+i%3}-02-{1+i%27:02d}T12:00:00Z','ms_played':60000+i*10,'master_metadata_track_name':f'Synthetic track {i}','master_metadata_album_artist_name':'Synthetic artist','master_metadata_album_album_name':'Synthetic album','spotify_track_uri':'spotify:track:'+f'{i:022d}'})
    page.locator('#historyFiles').set_input_files({'name':'history.json','mimeType':'application/json','buffer':json.dumps(rows).encode()});page.wait_for_selector('#enrichDialog[open]')
    # A successful file read with no usable fields must explain why nothing unlocks.
    empty={'format':'merlin-enrichment','version':1,'tracks':[{'spotify_id':f'{i:022d}','lastfm':{'tags':[],'families':[]}} for i in range(50)]}
    page.locator('#enrichedFiles').set_input_files({'name':'pilot-empty.json','mimeType':'application/json','buffer':json.dumps(empty).encode()})
    page.wait_for_function('window.merlinData?.meta.enrichment?.matched===50');self.assertIn('0 usable',page.locator('#enrichStatus').inner_text());self.assertIn('No new views',page.locator('#enrichStatus').inner_text())
    side={'format':'merlin-enrichment','version':1,'tracks':[{'spotify_id':f'{i:022d}','features':dict(zip(['energy','danceability','valence','acousticness','instrumentalness','speechiness','loudness','tempo'],[.4+i/200,.5,.5,.5,.2,.1,-10,120])),'lastfm':{'families':['Rock'],'tags':['rock']}} for i in range(50)]}
    page.locator('#enrichedFiles').set_input_files({'name':'pilot.json','mimeType':'application/json','buffer':json.dumps(side).encode()});page.wait_for_function('merlinData.tracks.filter(t=>t.features[0]!==null).length===50')
    self.assertIn('50 complete',page.locator('#enrichStatus').inner_text());self.assertIn('Genre map',page.locator('#enrichStatus').inner_text())
    page.locator('#closeEnrich').click();page.locator('[data-view="songs"]').click();page.wait_for_function('document.getElementById("chartFrame").contentWindow.atlas?.reviewReady')
    frame=page.frame_locator('#chartFrame')
    self.assertEqual(frame.locator('#chartTitle').inner_text(),'Songs over time')
    self.assertFalse(frame.locator('#mode').is_visible());self.assertFalse(frame.locator('#explanation').is_visible());self.assertEqual(frame.locator('#trend').count(),0)
    self.assertNotIn('ID …',frame.locator('#groups').inner_text())
    filters=frame.locator('#filterPanel').bounding_box();chart=frame.locator('article').bounding_box();self.assertGreater(filters['x'],chart['x']+chart['width']-2)
    self.assertGreater(frame.locator('#genre').bounding_box()['y'],frame.locator('#search').bounding_box()['y'])
    self.assertGreater(frame.locator('#from').bounding_box()['y'],frame.locator('#cutoff').bounding_box()['y'])
    self.assertIn('Dates',frame.locator('#filterPanel').inner_text());self.assertNotIn('UTC dates',frame.locator('#filterPanel').inner_text())
    frame.locator('#seriesNone').click()
    self.assertEqual(frame.locator('#summary > span').count(),2,'Selection actions must keep the compact stats, not restore explanatory text')
    frame.locator('#search').fill('nothing');page.wait_for_timeout(250);frame.locator('#genre').select_option('Rock');frame.locator('#cutoff').select_option('60000')
    frame.locator('#from').fill('2024-01-01');frame.locator('#to').fill('2024-12-31');frame.locator('#applyDates').click();frame.locator('#reset').click()
    self.assertEqual(frame.locator('#reset').inner_text(),'Reset');self.assertEqual(frame.locator('#search').input_value(),'');self.assertEqual(frame.locator('#genre').input_value(),'');self.assertEqual(frame.locator('#cutoff').input_value(),'30000')
    self.assertEqual(frame.locator('.series-check:checked').count(),10,'Reset restores the default selected series too')
    self.assertTrue(page.evaluate('document.getElementById("chartFrame").contentWindow.atlas.start===document.getElementById("chartFrame").contentWindow.atlas.fullStart'))
    page.locator('#goHome').click();page.locator('[data-view="calendar"]').click();page.wait_for_function('document.getElementById("chartFrame").contentWindow.atlas?.calendarReady')
    self.assertEqual(frame.locator('#chartTitle').inner_text(),'Listening calendar');self.assertEqual(frame.locator('#calendarYear').count(),0);self.assertGreaterEqual(frame.locator('.calendar-year').count(),3)
    frame.locator('#from').fill('2024-01-01');frame.locator('#to').fill('2024-12-31');frame.locator('#applyDates').click();self.assertEqual(frame.locator('.calendar-year').count(),1)
    frame.locator('#reset').click();self.assertGreaterEqual(frame.locator('.calendar-year').count(),3)
    page.wait_for_timeout(300)
    self.assertTrue(page.evaluate('(()=>{const f=document.getElementById("chartFrame"),d=f.contentDocument;return d.scrollingElement.scrollHeight <= f.clientHeight+2})()'),'iframe must not create a second vertical scroll region')
    page.screenshot(path=str(ROOT/'preview-review-calendar.png'),full_page=True)
    page.locator('#goHome').click();page.screenshot(path=str(ROOT/'preview-review-home.png'),full_page=True)
    page.set_viewport_size({'width':390,'height':844});page.locator('[data-view="artists"]').click();page.wait_for_timeout(300);self.assertTrue(page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
    page.screenshot(path=str(ROOT/'preview-review-mobile.png'),full_page=True)
    self.assertEqual(errors,[]);browser.close()
  finally:server.shutdown();server.server_close()
if __name__=='__main__':unittest.main()
