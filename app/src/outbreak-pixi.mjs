/* MIT libraries, bundled locally by Vite: PixiJS for the effects layer, Howler for audio. */
import { Application, Graphics } from 'pixi.js';
import { Howl, Howler } from 'howler';

const status = { ready:false, renderer:'canvas', audioReady:false, particleErrors:0, bursts:0, reason:'' };
const bridge = { status:()=>({...status}), get ready(){return status.ready;}, playAudio:()=>false,
  mute:()=>{}, effects:()=>{}, beginFrame:()=>{}, endFrame:()=>{} };
window.FrontierV6 = bridge;
const sounds={};
for(const key of ['shot','hit','boom','pickup']) sounds[key]=new Howl({src:[`assets/sounds/${key}.wav`],volume:.18,preload:true});
status.audioReady=true;
bridge.mute=value=>Howler.mute(!!value);
bridge.playAudio=(frequency,length,type,volume)=>{
  const sound=sounds[frequency>750?'pickup':frequency>=350?'shot':frequency<200?'boom':'hit'];
  try {sound.volume(Math.min(.55,Math.max(.025,(volume||.04)*4)));sound.play();return true;}catch{return false;}
};
async function init(){
  const base=document.getElementById('stage');
  const app=new Application();
  await app.init({backgroundAlpha:0,resizeTo:window,resolution:Math.min(2,devicePixelRatio||1),
    autoDensity:true,antialias:true,preference:'webgl',powerPreference:'high-performance',sharedTicker:false});
  app.ticker.stop();
  app.canvas.id='pixi-stage';app.canvas.setAttribute('aria-hidden','true');
  app.canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1';
  base.insertAdjacentElement('afterend',app.canvas);
  const fx=new Graphics();app.stage.addChild(fx);
  bridge.effects=(events=[])=>{
    fx.clear();
    for(const event of events){
      const alpha=Math.max(0,Math.min(1,event.alpha??1));
      if(event.kind==='line'){
        fx.moveTo(event.x,event.y).lineTo(event.x2,event.y2).stroke({color:event.color||0xffd8a0,width:event.width||2,alpha});
      }else{
        fx.circle(event.x,event.y,Math.max(.2,event.r||3)).fill({color:event.color||0xffb14a,alpha:alpha*.2});
        fx.circle(event.x,event.y,Math.max(.2,(event.r||3)*.35)).fill({color:0xfff0ce,alpha});
      }
    }
    status.bursts=events.length;app.render();
  };
  status.ready=true;status.renderer='pixi-webgl-effects+canvas-isometric';
  window.dispatchEvent(new Event('frontier-v6-ready'));
}
init().catch(error=>{status.reason=String(error?.message||error);document.getElementById('pixi-stage')?.remove();});
