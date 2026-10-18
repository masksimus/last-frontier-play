/**
 * Progressive PixiJS v8 renderer, deliberately separate from trusted game rules.
 * Actors and GPU sparks render here; environment/HUD and collision remain in Canvas 2D.
 * If WebGL or any atlas fails to initialize, the original Canvas sprite path stays active.
 * No external network calls at runtime; dependencies are Vite-bundled.
 */
import { Application, Container, Sprite, Assets, Texture, Rectangle, Matrix } from 'pixi.js';
import { Howl } from 'howler';

const ACTORS=['player','drone','runner','brute','boss'];
const FRAME=256, COLS=5, ROWS=4, MAX_ACTORS=105;
const status={ ready:false, renderer:'canvas-fallback', actorCount:0, bursts:0, particleErrors:0, audioReady:false, reason:'' };
const bridge={
  get ready(){return status.ready;},
  status:()=>({...status}), beginFrame(){}, endFrame(){}, actor(){return false;},
  camera(){}, burst(){}, playAudio(){return false;}, mute(){},
};
window.FrontierV6=bridge;

async function init(){
  // QA-only fault injection: verify Canvas fallback when GPU setup fails.
  // Normal browsers never set this flag. No generated code is executed.
  if (window.__FRONTIER_TEST_FORCE_CANVAS__ === true) {
    throw new Error('Simulated GPU initialization failure');
  }
  const base=document.getElementById('stage');
  if(!base)throw new Error('Canvas game missing');
  const app=new Application();
  await app.init({backgroundAlpha:0,resizeTo:window,powerPreference:'high-performance',
    antialias:false,resolution:Math.min(2,window.devicePixelRatio||1),autoDensity:true,
    preference:'webgl', sharedTicker:false});
  app.ticker.stop();
  const overlay=app.canvas;
  overlay.id='pixi-stage';overlay.setAttribute('aria-hidden','true');
  overlay.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;';
  base.insertAdjacentElement('afterend',overlay);
  const actorLayer=new Container(),fxLayer=new Container();
  app.stage.addChild(actorLayer,fxLayer);
  const textures={};
  for(const name of ACTORS){
    const tex=await Assets.load(`assets/characters/${name}.webp`);
    if(tex.width!==FRAME*COLS || tex.height!==FRAME*ROWS) throw Error('Invalid atlas dimensions: '+name);
    textures[name]=Array.from({length:COLS*ROWS},(_,i)=>new Texture({source:tex.source,
      frame:new Rectangle((i%COLS)*FRAME,Math.floor(i/COLS)*FRAME,FRAME,FRAME)}));
  }
  let sprites=[],visible=0,cameraX=0,cameraY=0,bursts=[],particles=[];
  let sounds={};
  for(const name of ['shot','hit','boom','pickup']){
    const file=`assets/sounds/${name}.wav`;
    sounds[name]=new Howl({src:[file],volume:name==='boom'?.37:.19,preload:true,html5:false});
  }
  status.audioReady=true;
  bridge.playAudio=(freq,len,type,vol)=>{
    const key=freq>750?'pickup':freq>=350?'shot':freq<200?'boom':'hit';
    const s=sounds[key];if(!s)return false;
    try {s.volume(Math.min(0.7,Math.max(0.025,vol*6)));s.play();return true;}
    catch {return false;}
  };
  bridge.mute=value=>{for(const s of Object.values(sounds))s.mute(!!value);};
  bridge.beginFrame=()=>{visible=0;};
  bridge.camera=(x,y)=>{cameraX=x;cameraY=y;};
  bridge.actor=(kind,pose,size,alpha,m)=>{
    if(!textures[kind] || visible>=MAX_ACTORS)return false;
    let sprite=sprites[visible];
    if(!sprite){sprite=new Sprite(textures[kind][0]);sprite.anchor.set(.5);actorLayer.addChild(sprite);sprites.push(sprite);}
    sprite.texture=textures[kind][Math.max(0,Math.min(19,pose|0))];
    sprite.alpha=Math.max(0,Math.min(1,alpha));sprite.visible=true;
    const scale=size/FRAME;
    sprite.setFromMatrix(new Matrix(m.a*scale,m.b*scale,m.c*scale,m.d*scale,m.e,m.f));
    visible++;return true;
  };
  bridge.burst=(type,x,y)=>{
    if(bursts.length<25)bursts.push({type,x,y});
  };
  // Native PixiJS v8 GPU spark sprites. The third-party emitter had a
  // non-Container particle transform incompatibility with Pixi v8; this is
  // a bounded, tested fallback, not a claim that the external library works.
  function makeBurst(event){
    const boom=event.type==='explosion',shock=event.type==='shockwave';
    const count=boom?20:shock?15:9;
    const cx=event.x-cameraX,cy=event.y-cameraY;
    for(let i=0;i<count;i++){
      if(particles.length>=280)break;
      const angle=Math.random()*Math.PI*2,speed=(boom?110:shock?155:78)*(0.3+Math.random());
      const ttl=(boom?.48:.24)*(.65+Math.random()*.7);
      const dot=new Sprite(Texture.WHITE);dot.anchor.set(.5);
      dot.position.set(cx,cy);dot.width=boom?5:3;dot.height=boom?5:3;
      dot.tint=boom?(Math.random()<.5?0xffbb61:0xff613f):0x7ceaff;
      fxLayer.addChild(dot);
      particles.push({dot,x:event.x,y:event.y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,ttl,life:ttl});
    }
    status.bursts++;
  }
  bridge.endFrame=(dt=.016)=>{
    status.actorCount=visible;
    for(let i=visible;i<sprites.length;i++)sprites[i].visible=false;
    for(const e of bursts.splice(0)){
      try{makeBurst(e);}catch(err){status.particleErrors++;if(status.particleErrors===1)console.warn('Pixi emitter fallback:',String(err));}
    }
    for(let i=particles.length-1;i>=0;i--){
      const p=particles[i];p.life-=dt;
      p.x+=p.vx*dt;p.y+=p.vy*dt;
      p.dot.position.set(p.x-cameraX,p.y-cameraY);
      p.vx*=.94;p.vy*=.94;
      p.dot.alpha=Math.max(0,p.life/p.ttl);
      if(p.life<=0){p.dot.destroy();particles.splice(i,1);}
    }
    app.render();
  };
  status.renderer='pixi-webgl-actors+canvas-environment';status.ready=true;
  window.dispatchEvent(new Event('frontier-v6-ready'));
}
init().catch(err=>{
  status.reason=String(err?.message||err);
  console.warn('PixiJS unavailable; keeping original Canvas renderer:',status.reason);
  const el=document.getElementById('pixi-stage');if(el)el.remove();
  status.ready=false;status.renderer='canvas-fallback';
});

