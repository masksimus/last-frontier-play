"""Live V8 browser checks: weapon switching, boss rage, mobile touch, GPU fallback."""
from pathlib import Path
import json,subprocess,time,urllib.request
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'browser-v8-evidence';OUT.mkdir(exist_ok=True)
assert (ROOT/'dist'/'index.html').is_file()
server=subprocess.Popen(['python3','-m','http.server','4228','--bind','127.0.0.1','--directory',str(ROOT/'dist')],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
results=[]
try:
 for _ in range(60):
  try:
   with urllib.request.urlopen('http://127.0.0.1:4228/',timeout=1):break
  except Exception:time.sleep(.2)
 else:raise RuntimeError('Local server unavailable')
 with sync_playwright() as pw:
  browser=pw.chromium.launch(headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
  for label,w,h,force in [('desktop',1366,768,False),('mobile-landscape',920,420,False),('mobile-canvas-fallback',920,420,True)]:
   context=browser.new_context(viewport={'width':w,'height':h},is_mobile=label!='desktop',has_touch=label!='desktop')
   page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   try:
    if force:page.add_init_script('window.__FRONTIER_TEST_FORCE_CANVAS__=true;')
    page.goto('http://127.0.0.1:4228/',wait_until='load',timeout=40000)
    page.wait_for_function("window.__FRONTIER_QA__?.get()?.animatedSpritesReady === true",timeout=30000)
    if force:page.wait_for_function("window.FrontierV6?.status()?.renderer === 'canvas-fallback'",timeout=20000)
    else:page.wait_for_function("window.FrontierV6?.status()?.ready === true",timeout=40000)
    page.locator('#start').click();page.wait_for_timeout(350)
    before=page.evaluate('window.__FRONTIER_QA__.get()')
    assert before['mode']=='running' and before['visualVersion']==8 and before['weapon']=='rifle',before
    page.locator('#weaponSwitch').dispatch_event('pointerdown',{'pointerId':10,'pointerType':'touch'})
    assert page.evaluate('window.__FRONTIER_QA__.get().weapon')=='shotgun'
    page.locator('#weaponSwitch').dispatch_event('pointerdown',{'pointerId':11,'pointerType':'touch'})
    assert page.evaluate('window.__FRONTIER_QA__.get().weapon')=='railgun'
    if label!='desktop':
     page.evaluate("""() => {
       const el=document.querySelector('#stickZone'),r=el.getBoundingClientRect();
       el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:51,pointerType:'touch',clientX:r.left+r.width/2+45,clientY:r.top+58}));
     }""")
     page.wait_for_timeout(460)
     page.evaluate("""() => document.querySelector('#stickZone').dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:51,pointerType:'touch'}))""")
     after=page.evaluate('window.__FRONTIER_QA__.get()')
     assert (after['x']-before['x'])**2+(after['y']-before['y'])**2>64,(before,after)
    page.evaluate('window.__FRONTIER_QA__.spawnBoss()')
    page.evaluate('window.__FRONTIER_QA__.bossEnrage()')
    page.wait_for_timeout(450)
    state=page.evaluate('window.__FRONTIER_QA__.get()')
    assert state['bosses']>0 and state['enemyProjectiles']>0,state
    assert 'ЯРОСТИ' in page.locator('#bossLabel').inner_text()
    page.screenshot(path=str(OUT/(label+'-boss-v8.png')))
    page.locator('#pauseButton').click();assert page.locator('#paused').is_visible()
    assert not errors,errors
    results.append({'profile':label,'passed':True,'weapon':state['weapon'],'bossProjectiles':state['enemyProjectiles'],'renderer':page.evaluate('window.FrontierV6.status().renderer'),'jsErrors':0})
   except Exception as exc:results.append({'profile':label,'passed':False,'error':str(exc),'jsErrors':errors})
   finally:context.close()
  browser.close()
finally:
 server.terminate()
 try:server.wait(timeout=4)
 except subprocess.TimeoutExpired:server.kill()
(OUT/'results.json').write_text(json.dumps(results,indent=2,ensure_ascii=False))
print(json.dumps(results,indent=2,ensure_ascii=False))
assert all(item['passed'] for item in results)
