"""Build Merlin's data-free chart renderer from the preserved private explorer sources."""
from pathlib import Path
import re,zipfile
ROOT=Path(__file__).resolve().parent
SITE=ROOT/'site'
SOURCE=ROOT/'renderer'
template=(SOURCE/'template.html').read_text()
template=re.sub(r'<header>.*?</header>','',template,count=1,flags=re.S)
template=template.replace('<title>Listening Atlas · Quinn</title>','<title>Merlin chart</title>')
template=template.replace("$('archiveRange').textContent", "if($('archiveRange')) $('archiveRange').textContent")
template=template.replace('const fullStart=Date.UTC(2020,6,7)/1000,','const fullStart=Math.floor(DATA.meta.first/86400)*86400,')
template=template.replace('syncDates();rebuild();','syncDates();')
template=template.replace('new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(render,90)})','new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(atlas.ready)render()},90)})')
template=template.replace('co-tag similarity','genre family').replace('ordered by co-tag similarity','arranged by genre family')
template=template.replace("i/(familyList.length-1)","i/Math.max(1,familyList.length-1)")
template=template.replace('Families are ordered by average-linkage clustering of Jaccard co-tag distance, with optimal leaf ordering.','Families are ordered alphabetically for a stable reference; spacing does not imply a measured musical distance.')
template=template.replace('Tracks are fitted equally, not weighted by how often you played them.','Tracks with complete features are fitted equally, not weighted by how often you played them.')
template=template.replace('K-means uses the same eight-feature space, a fixed seed (42), and 15 initializations.','K-means uses the same eight-feature space with deterministic farthest-first initialization and up to 35 updates in your browser. Fewer than the requested number of groups may contain tracks in small datasets.')
template=template.replace('K-means uses the same eight-feature space, a fixed seed (42), and 15 initializations.','K-means uses deterministic initialization in the browser.')
template=template.replace('<option value="spectrum">01 · Sound spectrum</option>','<option value="spectrum">01 · Sound spectrum</option>')
core=(SOURCE/'cumulative-core.js').read_text()
ui=(SOURCE/'cumulative-ui.js').read_text()
# Remove the standalone Only controls without changing cumulative selection semantics.
ui=re.sub(r'<button class="series-solo".*?</button>','',ui)
ui=re.sub(r"\n  row\.querySelector\('button'\)\.onclick=.*?;\n",'\n',ui)
ui=ui.replace('“Only” isolates one.','Choose None, then check one name to isolate it.').replace(' · Only isolates one','')
ui=ui.replace('individual Only buttons','individual checkboxes')
ui=ui.replace("+' · ID …'+esc(String(s.key).slice(-6))",'')
colors={"'#eaaa83'":"'#c35e22'","'#e4ca76'":"'#967311'","'#b7cd7e'":"'#6c7f26'","'#75bfa4'":"'#277c65'","'#6fc0c7'":"'#147e8c'","'#7fa9dc'":"'#3155c4'","'#a6a0d2'":"'#7052aa'","'#c594b5'":"'#a3437a'","'#d3aaa4'":"'#a8685d'","'#b7c6ce'":"'#526f85'","'#91ab82'":"'#426b39'","'#d7a76d'":"'#a87820'","'#81a9b1'":"'#3d6f76'","'#c2a8d4'":"'#8b5ca6'","'#6e807b'":"'#85838c'","'#a4b6ad'":"'#5c5b63'","'#2c3a36'":"'#dedcd3'","'#263632'":"'#dedcd3'","'#c9d8cc'":"'#111114'","'#99aaa0'":"'#85838c'","'#9cafa5'":"'#5c5b63'","'#3b5146'":"'#b4b2ff'","'#c7deaa'":"'#2e2bf5'","'#ffffff06'":"'#11111406'","'#ffffff08'":"'#11111408'","'#77967e'":"'#7774f8'"}
ui=ui.replace('58% ${rank%3===0?72:rank%3===1?62:79}%','65% ${rank%3===0?40:rank%3===1?46:36}%')
template=template.replace('__CUMULATIVE_CORE__',core).replace('__CUMULATIVE_UI__',ui)
for old,new in colors.items():template=template.replace(old,new)
template=template.replace('11px Avenir Next, sans-serif','11px Geist, sans-serif').replace('10px Avenir Next,sans-serif','10px Geist,sans-serif').replace('11px Avenir Next,sans-serif','11px Geist,sans-serif')
template=template.replace('e.g. Steely Dan','Find artist or track').replace('Listens (qualifying events)','Listens')
template=template.replace('</head>','<link rel="stylesheet" href="assets/fonts.css"><style>'+(ROOT/'chart-theme.css').read_text()+'\n'+(ROOT/'chart-review.css').read_text()+'</style></head>')
template=template.replace('</body>','<script>'+(ROOT/'calendar.js').read_text()+'</script><script>'+(ROOT/'chart-ui.js').read_text()+'</script></body>')
assert template.count('__PAYLOAD__')==1
assert 'Quinn' not in template and 'const DATA=' in template
assert 'class="series-solo"' not in template
(SITE/'chart-frame.html').write_text(template)
(SITE/'assets/favicon.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#2e2bf5"/><text x="32" y="47" text-anchor="middle" font-family="Georgia,serif" font-size="48" fill="white">M</text></svg>')
kit=ROOT/'enrichment-kit'
if kit.exists():
 (kit/'enrichment-prompt.txt').write_text((SITE/'enrichment-prompt.txt').read_text())
 with zipfile.ZipFile(SITE/'enrichment-kit.zip','w',zipfile.ZIP_DEFLATED) as z:
  for p in kit.rglob('*'):
   if p.is_file() and '__pycache__' not in p.parts:z.write(p,'merlin-enrichment/'+str(p.relative_to(kit)))
import hashlib
fingerprint=hashlib.sha256()
for name in ['index.html','app.js','styles.css','data-core.js','worker.js','chart-frame.html','assets/fonts.css','enrichment-prompt.txt','enrichment-kit.zip']:
 fingerprint.update((SITE/name).read_bytes())
sw=(SITE/'sw.js').read_text()
sw=re.sub(r"const CACHE='[^']+';", "const CACHE='merlin-static-"+fingerprint.hexdigest()[:12]+"';",sw)
(SITE/'sw.js').write_text(sw)
with zipfile.ZipFile(ROOT/'merlin-netlify.zip','w',zipfile.ZIP_DEFLATED) as archive:
 for p in sorted(SITE.rglob('*')):
  if p.is_file():archive.write(p,p.relative_to(SITE))
print('Built public data-free chart renderer:',SITE/'chart-frame.html')
print('Built Netlify deployment archive:',ROOT/'merlin-netlify.zip')
