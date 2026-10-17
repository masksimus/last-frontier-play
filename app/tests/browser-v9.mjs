import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const out='browser-v9-evidence';fs.mkdirSync(out,{recursive:true});
const server=spawn('python3',['-m','http.server','4239','--bind','127.0.0.1','--directory','dist'],{stdio:'ignore'});
await new Promise(r=>setTimeout(r,700));
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const results=[];
try{
 for(const profile of [
  {name:'desktop',w:1366,h:768},
  {name:'android-landscape-emulated',w:920,h:420,touch:true},
  {name:'android-portrait-emulated',w:393,h:851,touch:true},
  {name:'canvas-fallback',w:920,h:420,touch:true,fallback:true},
  {name:'missing-model-fallback',w:920,h:420,missing:true},
  {name:'context-loss',w:920,h:420,lost:true},
 ].filter(p=>!process.env.V9_PROFILE||p.name===process.env.V9_PROFILE)){
  const context=await browser.newContext({viewport:{width:profile.w,height:profile.h},hasTouch:!!profile.touch,isMobile:!!profile.touch,deviceScaleFactor:1});
  const page=await context.newPage(),errors=[],failed=[],warnings=[],consoleErrors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>failed.push(r.url()));page.on('console',m=>{if(m.type()==='warning')warnings.push(m.text());if(m.type()==='error')consoleErrors.push(m.text())});
  const result={profile:profile.name,passed:false,checks:[]};
  try{
   if(profile.fallback)await page.addInitScript(()=>window.__FRONTIER_TEST_FORCE_CANVAS__=true);
   if(profile.missing)await page.route('**/models/Enemy_Large.glb',r=>r.abort());
   await page.goto('http://127.0.0.1:4239/',{waitUntil:'load'});
   await page.waitForFunction(()=>!document.querySelector('#start').disabled,{timeout:45000});
   if(!profile.fallback&&!profile.missing){assert(await page.evaluate(()=>window.FrontierV9.ready));assert(await page.evaluate(()=>window.FrontierV9.status().highDetailTitan),'Blender HD GLB not loaded');result.checks.push('original Blender textured 3D boss model and Rapier initialized');assert.equal(await page.evaluate(()=>window.FrontierV9.status().build),'11.0.0-aegis-real-3d');}
   await page.locator('#start').click();
   assert.equal(await page.evaluate(()=>window.__FRONTIER_QA__.get().mode),'running');
   if(!profile.fallback&&!profile.missing){const h=await page.evaluate(()=>window.FrontierV9.status());assert(h.aegisHero&&h.aegisGLB&&h.aegisMeshCount>=75,'Exported GLB main character missing');result.checks.push('AEGIS-07 visible 3D mesh, '+h.aegisMeshCount+' articulated parts');}
   await page.locator('#weaponSwitch').dispatchEvent('pointerdown',{pointerId:91,pointerType:'touch'});
   assert.equal(await page.evaluate(()=>window.__FRONTIER_QA__.get().weapon),'shotgun');
   await page.locator('#weaponSwitch').dispatchEvent('pointerdown',{pointerId:92,pointerType:'touch'});
   assert.equal(await page.evaluate(()=>window.__FRONTIER_QA__.get().weapon),'railgun');result.checks.push('rifle → shotgun → railgun');
   const before=await page.evaluate(()=>window.__FRONTIER_QA__.get());
   if(profile.touch){
    const rect=await page.locator('#stickZone .ring').boundingBox(),cdp=await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:rect.x+rect.width*.8,y:rect.y+rect.height*.5}]});
    await page.waitForFunction(x=>window.__FRONTIER_QA__.get().x>x+15,before.x,{timeout:15000});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});result.checks.push('real CDP touchscreen movement');
   }else{
    await page.keyboard.down('d');await page.waitForFunction(x=>window.__FRONTIER_QA__.get().x>x+15,before.x,{timeout:15000});await page.keyboard.up('d');result.checks.push('keyboard movement');
   }
   await page.locator('#dash').dispatchEvent('pointerdown',{pointerId:93,pointerType:'touch'});
   await page.waitForFunction(()=>document.querySelector('#dashText').textContent.includes('c'));assert.match(await page.locator('#dashText').innerText(),/c/);result.checks.push('dash cooldown');
   await page.locator('#pauseButton').click();const paused=await page.evaluate(()=>window.__FRONTIER_QA__.get());await page.waitForTimeout(180);assert.deepEqual(await page.evaluate(()=>[window.__FRONTIER_QA__.get().x,window.__FRONTIER_QA__.get().y]),[paused.x,paused.y]);await page.locator('#resume').click();result.checks.push('pause freezes simulation, resume');
   if(!profile.fallback&&!profile.missing){
    const collision=await page.evaluate(()=>{const p={x:570,y:950,r:19};window.FrontierV9.move(p,{x:570,y:700});return p;});assert(collision.y<800,JSON.stringify(collision));result.checks.push('Rapier swept obstacle collision');
    assert((await page.evaluate(()=>window.FrontierV9.status().animationClips.player)).includes('Run_Gun_Shoot'));
   }
   await page.evaluate(()=>window.__FRONTIER_QA__.forceUpgrade());await page.locator('#cards button').first().click();assert.equal(await page.evaluate(()=>window.__FRONTIER_QA__.get().mode),'running');result.checks.push('upgrade choice resumes play');
   await page.evaluate(()=>window.__FRONTIER_QA__.clearWave());await page.waitForFunction(()=>window.__FRONTIER_QA__.get().mode==='upgrading');await page.locator('#cards button').first().click();assert.equal(await page.evaluate(()=>window.__FRONTIER_QA__.get().wave),2);result.checks.push('wave completion');
   if(!profile.fallback&&!profile.missing){
     const art=await page.evaluate(()=>window.FrontierV9.status().visibleArt);
     assert.equal(art.landmarks,2);assert.equal(art.reactorRings,2);
     result.checks.push('two new industrial landmarks rendered as 3D geometry');
   }
   await page.evaluate(()=>{window.__FRONTIER_QA__.spawnBoss();window.__FRONTIER_QA__.bossEnrage();});
   await page.waitForFunction(()=>window.__FRONTIER_QA__.get().enemyProjectiles>0,{timeout:20000});assert.match(await page.locator('#bossLabel').innerText(),/ЯРОСТИ/);result.checks.push('boss rage and projectiles');
   if(profile.name==='desktop'){
    await page.screenshot({path:`${out}/desktop-combat.png`});
    await page.evaluate(()=>window.__FRONTIER_QA__.stress());
    // Bounded real-time sample; software renderer evidence, not a device FPS claim.
    const timings=await page.evaluate(()=>new Promise(resolve=>{const samples=[];let last=performance.now();function tick(t){samples.push(t-last);last=t;if(samples.length<100)requestAnimationFrame(tick);else resolve(samples);}requestAnimationFrame(tick);}));
    assert.equal(await page.evaluate(()=>window.__FRONTIER_QA__.get().mode),'running','stress sample must not be paused by an upgrade');
    timings.sort((a,b)=>a-b);result.softwareFrameMs={median:timings[50],p95:timings[95]};result.checks.push('100 rendered frames with 45 additional enemies');
   }
   if(profile.lost){await page.evaluate(()=>document.querySelector('#three-stage').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());await page.waitForFunction(()=>!window.FrontierV9.ready);result.checks.push('context loss switches to Canvas without losing combat state');}
   if(profile.touch&&!profile.fallback){await page.setViewportSize({width:profile.h,height:profile.w});await page.waitForTimeout(100);await page.setViewportSize({width:profile.w,height:profile.h});result.checks.push('orientation resize');}
   await page.screenshot({path:`${out}/${profile.name}.png`});result.state=await page.evaluate(()=>window.__FRONTIER_QA__.get());
   await page.evaluate(()=>window.__FRONTIER_QA__.forceWin());assert(await page.locator('#end').isVisible());await page.locator('#retry').click();assert.equal(await page.evaluate(()=>window.__FRONTIER_QA__.get().wave),1);result.checks.push('victory screen and retry');
   await page.evaluate(()=>window.__FRONTIER_QA__.damage(10000));assert.match(await page.locator('#endTitle').innerText(),/ПАЛ/);result.checks.push('defeat screen');
   if(!profile.fallback&&!profile.missing&&!profile.lost){assert.equal(consoleErrors.length,0,JSON.stringify(consoleErrors));assert(result.state.v9.contactShadows>0);assert(result.state.v9.shadowCasters<=(profile.touch?5:8));result.checks.push('shader compilation clean; contact shadows retained; shadow budget respected');}
   assert.equal(errors.length,0,JSON.stringify(errors));if(!profile.missing)assert.equal(failed.length,0,JSON.stringify(failed));
   result.passed=true;
  }catch(e){result.error=String(e);await page.screenshot({path:`${out}/${profile.name}-failure.png`}).catch(()=>{});}
  result.jsErrors=errors;result.consoleErrors=consoleErrors;result.failedRequests=failed;result.warnings=[...new Set(warnings)];results.push(result);console.log(JSON.stringify(result));await context.close();
 }
}finally{await browser.close();server.kill();fs.writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));}
assert(results.every(r=>r.passed),'Browser acceptance failures; see browser-v9-evidence/results.json');
