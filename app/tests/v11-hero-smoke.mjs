// Fast end-to-end Chromium acceptance: REAL exported GLB as playable hero in THREE scene.
import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const out='browser-v11-evidence';fs.mkdirSync(out,{recursive:true});
const server=spawn('python3',['-m','http.server','4241','--bind','127.0.0.1','--directory','dist'],{stdio:'ignore'});
await new Promise(resolve=>setTimeout(resolve,900));
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const results=[];
try {
 for (const p of [{name:'desktop',w:1280,h:720},{name:'android-touch',w:900,h:430,touch:true}]){
  const context=await browser.newContext({viewport:{width:p.w,height:p.h},hasTouch:!!p.touch,isMobile:!!p.touch,deviceScaleFactor:1});
  const page=await context.newPage();
  const jsErrors=[];page.on('pageerror',e=>jsErrors.push(e.message));
  try {
   await page.goto('http://127.0.0.1:4241/',{waitUntil:'domcontentloaded',timeout:40000});
   await page.waitForFunction(()=>window.FrontierV9?.ready&&document.querySelector('#start')&&!document.querySelector('#start').disabled,{timeout:75000});
   const state=await page.evaluate(()=>window.FrontierV9.status());
   assert(state.aegisHero,'AEGIS mesh not instantiated');
   assert(state.aegisGLB,'Hero GLB not loaded from /assets/models');
   assert(state.aegisMeshCount>=75,'Must render actual 3D mesh nodes');
   assert.equal(state.renderer,'three-webgl');
   assert(state.physics,'Rapier physics must initialize');
   await page.screenshot({path:out+'/'+p.name+'-hero-menu.png',timeout:30000});
   await page.locator('#start').click();
   await page.waitForFunction(()=>window.__FRONTIER_QA__.get().mode==='running');
   await page.waitForTimeout(800);
   await page.screenshot({path:out+'/'+p.name+'.png',timeout:30000});
   assert.equal(jsErrors.length,0,JSON.stringify(jsErrors));
   results.push({profile:p.name,passed:true,meshCount:state.aegisMeshCount,glbLoaded:state.aegisGLB,renderer:state.renderer});
  }catch(error){
   results.push({profile:p.name,passed:false,error:String(error),jsErrors});
   await page.screenshot({path:out+'/'+p.name+'-fail.png',timeout:5000}).catch(()=>{});
  } finally { await context.close() }
 }
}finally {await browser.close();server.kill();fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2))}
console.log(results);
assert(results.every(r=>r.passed),'V11 3D Chromium acceptance failed');
