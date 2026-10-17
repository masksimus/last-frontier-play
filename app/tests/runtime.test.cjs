const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'), listeners={};let frame=null,now=0;
class FakeElement{
 constructor(id=''){this.id=id;this.listeners={};this.style={};this.className='';this.textContent='';this.innerHTML='';this.hidden=false;this.children=[];this.attrs={};const c=new Set(id==='controls'||['upgrade','paused','end'].includes(id)?['hidden']:[]);this.classList={contains:k=>c.has(k),add:k=>c.add(k),remove:k=>c.delete(k),toggle:(k,value)=>value?c.add(k):c.delete(k)};}
 addEventListener(name,fn){(this.listeners[name] ||= []).push(fn)}
 dispatch(name,payload={}){for(const fn of this.listeners[name]||[])fn({preventDefault(){},pointerId:1,clientX:0,clientY:0,...payload})}
 append(...els){this.children.push(...els)}appendChild(el){this.children.push(el)}getBoundingClientRect(){return {x:18,y:670,width:136,height:145,left:18,top:670}}setPointerCapture(){}getAttribute(x){return this.attrs[x]}
}
const elements=new Map();const element=id=>{if(!elements.has(id))elements.set(id,new FakeElement(id));return elements.get(id)};
const ctxProxy=new Proxy({createRadialGradient:()=>({addColorStop(){}})}, {get:(t,k)=>t[k]||(typeof k==='string' ? ()=>{} : undefined),set:(t,k,v)=>(t[k]=v,true)});
const windowObj={innerWidth:390,innerHeight:844,devicePixelRatio:1,AudioContext:class{},addEventListener:(name,fn)=>{(listeners[name]||=[]).push(fn)}};
const doc={getElementById:element,createElement:id=>new FakeElement(id),head:new FakeElement('head'),addEventListener:(name,fn)=>{(listeners[name]||=[]).push(fn)}};
const memory={};const sb={window:windowObj,document:doc,location:{hostname:'localhost',search:''},localStorage:{getItem:k=>memory[k]||null,setItem:(k,v)=>memory[k]=v},performance:{now:()=>now},innerWidth:390,innerHeight:844,Math,URLSearchParams,console,Image:class{constructor(){this.complete=true;this.naturalWidth=64;}set src(s){this._src=s}},requestAnimationFrame:fn=>{frame=fn}};
windowObj.document=doc;windowObj.location=sb.location;
element('stage').getContext=()=>ctxProxy;
vm.runInNewContext(fs.readFileSync(path.join(root,'src/core.js'),'utf8'),sb,{filename:'core.js'});
windowObj.FrontierCore=sb.FrontierCore;
vm.runInNewContext(fs.readFileSync(path.join(root,'src/animation.js'),'utf8'),sb,{filename:'animation.js'});
vm.runInNewContext(fs.readFileSync(path.join(root,'src/game.js'),'utf8'),sb,{filename:'game.js'});
function tick(n=1){for(let i=0;i<n;i++){now+=16;if(frame)frame(now)}}

test('menu boot and frame drawing without runtime errors',()=>{tick(3);assert.ok(!element('home').classList.contains('hidden'));assert.ok(typeof windowObj.__FRONTIER_QA__.get==='function')});
test('start creates wave and visible controls',()=>{element('start').dispatch('click');tick(3);let state=windowObj.__FRONTIER_QA__.get();assert.equal(state.mode,'running');assert.equal(state.wave,1);assert.equal(element('controls').classList.contains('hidden'),false)});
test('wave contains spawned enemies after gameplay time',()=>{tick(150);assert.ok(windowObj.__FRONTIER_QA__.get().enemies>0)});
test('dash, pause, resume and three-option upgrade',()=>{element('dash').dispatch('pointerdown');tick(2);assert.ok(element('dash').classList.contains('cooldown'));element('pauseButton').dispatch('click');assert.equal(windowObj.__FRONTIER_QA__.get().mode,'paused');element('resume').dispatch('click');assert.equal(windowObj.__FRONTIER_QA__.get().mode,'running');windowObj.__FRONTIER_QA__.forceUpgrade();assert.equal(element('cards').children.length,3);element('cards').children[0].dispatch('click');assert.equal(windowObj.__FRONTIER_QA__.get().mode,'running')});
test('boss, victory, retry, defeat and record',()=>{windowObj.__FRONTIER_QA__.spawnBoss();tick(1);assert.equal(element('bossBar').hidden,false);windowObj.__FRONTIER_QA__.forceWin();assert.equal(windowObj.__FRONTIER_QA__.get().mode,'ended');element('retry').dispatch('click');assert.equal(windowObj.__FRONTIER_QA__.get().mode,'running');windowObj.__FRONTIER_QA__.damage(999);assert.equal(windowObj.__FRONTIER_QA__.get().mode,'ended')});
