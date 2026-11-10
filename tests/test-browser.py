import os
import json,pathlib,threading,unittest
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from functools import partial
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
class MerlinBrowserTests(unittest.TestCase):
 def test_home_import_enrich_and_six_views(self):
  self.assertTrue((ROOT/'site/index.html').exists(),'Merlin home has not been built')
  server=ThreadingHTTPServer(('127.0.0.1',0),partial(SimpleHTTPRequestHandler,directory=str(ROOT/'site')))
  threading.Thread(target=server.serve_forever,daemon=True).start()
  try:
   with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('MERLIN_CHROME_PATH'),headless=True)
    page=browser.new_page(viewport={'width':1500,'height':1100});errors=[];remote=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('request',lambda r:remote.append(r.url) if r.url.startswith('http') and '127.0.0.1' not in r.url else None)
    page.goto(f'http://127.0.0.1:{server.server_port}/');page.wait_for_function('document.fonts.status === "loaded"')
    self.assertEqual(page.locator('.view-card').count(),6)
    self.assertEqual(page.locator('#home').evaluate('el=>getComputedStyle(el).backgroundColor'),'rgb(46, 43, 245)')
    self.assertEqual(len(page.locator('#viewGrid').evaluate('el=>getComputedStyle(el).gridTemplateColumns').split()),3)
    page.screenshot(path=str(ROOT/'preview-home.png'),full_page=True)
    page.locator('[data-view="artists"]').click();self.assertTrue(page.locator('#importDialog').is_visible())
    row={'ts':'2024-01-01T12:00:00Z','ms_played':60000,'master_metadata_track_name':'Synthetic song','master_metadata_album_artist_name':'Synthetic artist','master_metadata_album_album_name':'Synthetic album','spotify_track_uri':'spotify:track:0123456789ABCDEFGHIJKL','ip_addr':'192.0.2.1'}
    page.locator('#historyFiles').set_input_files({'name':'history.json','mimeType':'application/json','buffer':json.dumps([row,{**row,'ts':'2024-02-02T00:00:00Z','ms_played':120000}]).encode()})
    page.wait_for_selector('#enrichDialog[open]',timeout=60000);self.assertIn('2',page.locator('#dataStatus').inner_text())
    page.locator('#closeEnrich').click();page.locator('[data-view="artists"]').click()
    frame=page.frame_locator('#chartFrame');frame.locator('#plot').wait_for();page.wait_for_function('document.getElementById("chartFrame").contentWindow.atlas?.ready')
    self.assertEqual(frame.locator('.series-solo').count(),0)
    self.assertEqual(frame.locator('.series-check').count(),1)
    frame.locator('#seriesNone').click()
    page.locator('#goHome').click();page.locator('[data-view="songs"]').click()
    page.wait_for_function('document.getElementById("chartFrame").contentWindow.atlas?.ready')
    page.locator('#goHome').click();page.locator('[data-view="artists"]').click()
    page.wait_for_function('document.getElementById("chartFrame").contentWindow.atlas?.ready')
    self.assertEqual(frame.locator('.series-check:checked').count(),0,'Returning to a view must preserve its selection')
    page.locator('#goHome').click();page.locator('[data-view="calendar"]').click()
    page.wait_for_function('document.getElementById("chartFrame").contentWindow.atlas?.calendarReady')
    self.assertEqual(page.locator('#chartFrame').content_frame.locator('.calendar-day[data-minutes]').count()>0,True)
    page.locator('#goHome').click();page.locator('[data-view="spectrum"]').click()
    self.assertTrue(page.locator('#lockedView').is_visible());self.assertIn('Data not enriched',page.locator('#lockedView').inner_text())
    page.locator('#enrichLocked').click()
    side={'format':'merlin-enrichment','version':1,'tracks':[{'spotify_id':'0123456789ABCDEFGHIJKL','features':dict(zip(['energy','danceability','valence','acousticness','instrumentalness','speechiness','loudness','tempo'],[.5,.5,.5,.5,.5,.1,-9,120])),'lastfm':{'families':['Rock'],'tags':['rock']}}]}
    page.locator('#enrichedFiles').set_input_files({'name':'enriched.json','mimeType':'application/json','buffer':json.dumps(side).encode()})
    page.wait_for_function('window.merlinData?.tracks[0].features[0]===.5',timeout=60000);page.locator('#closeEnrich').click()
    for mode in ['spectrum','lanes','genre','artists','songs','calendar']:
     page.locator('#goHome').click();page.locator('[data-view="'+mode+'"]').click()
     page.wait_for_function('document.getElementById("chartFrame").contentWindow.atlas?.ready')
    page.screenshot(path=str(ROOT/'preview-calendar.png'),full_page=True)
    page.locator('#goHome').click();page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(ROOT/'preview-home-mobile.png'),full_page=True)
    self.assertTrue(page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
    self.assertEqual(errors,[]);self.assertEqual(remote,[])
    browser.close()
  finally:server.shutdown();server.server_close()
if __name__=='__main__':unittest.main()
