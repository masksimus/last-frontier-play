"""V7 2D graphics regression: WebGL, touch, boss, and Canvas fallback.

Automated Chromium emulation only; not a physical Android or Yandex-hosted SDK test.
"""
import json,subprocess,shutil,time,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'browser-v7-evidence';OUT.mkdir(exist_ok=True)
server=subprocess.Popen(['python3','-m','http.server','4217','--bind','127.0.0.1','--directory',str(ROOT/'dist')],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
results=[]
try:
 for i in range(30):
  try:
   with urllib.request.urlopen('http://127.0.0.1:4217/',timeout=1):break
  except Exception:time.sleep(.2)
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium'),args=['--no-sandbox','--disable-dev-shm-usage','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
  for label,w,h,force in [('desktop',1366,768,True),('mobile-landscape',920,420,False),('mobile-canvas-fallback',920,420,True)]:
   context=browser.new_context(viewport={'width':w,'height':h},has_touch=label!='desktop',is_mobile=label!='desktop')
   page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   try:
    if force:page.add_init_script('window.__FRONTIER_TEST_FORCE_CANVAS__=true;')
    page.goto('http://127.0.0.1:4217/',wait_until='load',timeout=45000)
    page.wait_for_function("window.__FRONTIER_QA__?.get()?.animatedSpritesReady === true",timeout=25000)
    if force:page.wait_for_function("window.FrontierV6?.status()?.renderer === 'canvas-fallback'",timeout=20000)
    else:page.wait_for_function("window.FrontierV6?.status()?.ready === true",timeout=30000)
    page.locator('#start').click();page.wait_for_timeout(750)
    before=page.evaluate('window.__FRONTIER_QA__.get()')
    assert before['mode']=='running' and before['visualVersion']==7, before
    if label=='desktop':
     pass # Scope: rendering/start/boss/pause desktop; touch movement is verified on mobile.
    else:
     page.evaluate("""() => {const el=document.querySelector('#stickZone'),r=el.getBoundingClientRect();
        el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:77,pointerType:'touch',clientX:r.left+r.width/2+30,clientY:r.top+60}));}""")
     page.wait_for_timeout(480)
     page.evaluate("""() => document.querySelector('#stickZone').dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:77,pointerType:'touch'}))""")
    after=page.evaluate('window.__FRONTIER_QA__.get()')
    if label!='desktop':assert (after['x']-before['x'])**2+(after['y']-before['y'])**2>64,after
    page.evaluate('window.__FRONTIER_QA__.spawnBoss()');page.wait_for_timeout(250)
    assert page.evaluate('window.__FRONTIER_QA__.get().bosses')>=1
    assert page.evaluate('window.__FRONTIER_QA__.get().animatedSpritesReady')
    page.screenshot(path=str(OUT/(label+'-boss.png')))
    page.locator('#pauseButton').click();assert page.locator('#paused').is_visible()
    assert not errors,errors
    results.append({'profile':label,'passed':True,'renderer':after['pixiStatus']['renderer'],'enemies':after['enemies'],'visualVersion':7})
   except Exception as e:
    results.append({'profile':label,'passed':False,'error':str(e),'errors':errors,'status':'browser or game test failed'})
   finally:context.close()
  browser.close()
finally:
 server.terminate();server.wait(timeout=4)
(OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
print(json.dumps(results,ensure_ascii=False,indent=2))
assert all(r['passed'] for r in results)
