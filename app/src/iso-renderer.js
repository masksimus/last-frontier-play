/* Original 2:1 isometric renderer. Canvas world + optional PixiJS effects, no network resources. */
(()=>{'use strict';
const World=window.OutbreakWorld,canvas=document.getElementById('stage'),ctx=canvas.getContext('2d',{alpha:false});
const art={},names=Array.from(new Set(['floor','wall','crate','generator','barrel','terminal','nest','marine','crawler','brute','queen',...Object.keys(window.OutbreakArt?.sprites||{})]));
for(const name of names){const im=new Image();im.src='assets/outbreak/'+name+'.png';art[name]=im;}
let width=innerWidth,height=innerHeight,dpr=1,zoom=1,camera={x:0,y:0},origin={x:0,y:0},lastLevel=null,time=0;
let props=[],visible=new Set(),explored=new Set(),visibilityTimer=0,frame=0,lastState=null;
let gpu=[];const TAU=Math.PI*2;
function resize(){width=Math.max(300,innerWidth);height=Math.max(300,innerHeight);dpr=Math.min(2,devicePixelRatio||1);
 canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);canvas.style.width=width+'px';canvas.style.height=height+'px';
 zoom=Math.min(1.24,Math.max(.72,Math.min(width/1050,height/700)));}
resize();window.addEventListener('resize',resize);
const P=(x,y)=>World.project(x,y),hash=(x,y)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
function screen(point){const a=P(point.x,point.y);return {x:(a.x-camera.x)*zoom+origin.x,y:(a.y-camera.y)*zoom+origin.y};}
function screenToWorld(x,y){return World.unproject((x-origin.x)/zoom+camera.x,(y-origin.y)/zoom+camera.y);}
function polygon(points,fill,stroke){ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=.75;ctx.stroke();}}
function diamond(x,y,rx,ry,fill,stroke){polygon([[x,y-ry],[x+rx,y],[x,y+ry],[x-rx,y]],fill,stroke);}
function sprite(name,x,y,displayWidth,alpha=1,flip=false){
 const im=art[name];if(!im?.complete||!im.naturalWidth)return false;
 const meta=window.OutbreakArt?.sprites?.[name]||{},w=displayWidth||meta.displayWidth||80,h=w*im.naturalHeight/im.naturalWidth;
 ctx.save();ctx.translate(x,y);ctx.globalAlpha=alpha;if(flip)ctx.scale(-1,1);
 ctx.drawImage(im,-w*(meta.anchorX??.5),-h*(meta.anchorY??.78),w,h);ctx.restore();return true;
}
function shadow(x,y,rx=22,ry=10,alpha=.4){ctx.save();ctx.globalAlpha=alpha;ctx.fillStyle='#000';ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TAU);ctx.fill();ctx.restore();}
function nearPlayer(x,y,r=14){return !lastState?.player||Math.hypot(x-lastState.player.x,y-lastState.player.y)<r;}
function isVisible(x,y){return visible.has(Math.floor(x)+','+Math.floor(y));}
function makeProps(level){const result=[];
 for(let y=0;y<level.map.length;y++)for(let x=0;x<level.map[y].length;x++){
  if(level.map[y][x]!=='.'||hash(x,y)<.9)continue;
  const adjacent=(level.map[y-1]?.[x]==='#'||level.map[y]?.[x-1]==='#');
  if(!adjacent||[...level.terminals,...level.nests,level.spawn,level.exit,...level.supplies].some(p=>Math.hypot(p.x-x-.5,p.y-y-.5)<1.9))continue;
  result.push({x:x+.5,y:y+.5,type:hash(y,x)>.67?'generator':hash(y+3,x)>.5?'barrel':'crate'});
 }
 return result;
}
function updateVisibility(state,dt){visibilityTimer-=dt;if(visibilityTimer>0)return;visibilityTimer=.16;visible.clear();
 const p=state.player;
 for(let y=Math.max(0,Math.floor(p.y)-13);y<=Math.min(state.level.map.length-1,Math.floor(p.y)+13);y++){
  for(let x=Math.max(0,Math.floor(p.x)-13);x<=Math.min(state.level.map[y].length-1,Math.floor(p.x)+13);x++){
   if(state.level.map[y][x]==='.'&&Math.hypot(x+.5-p.x,y+.5-p.y)<13&&World.lineOfSight(state.level,p,{x:x+.5,y:y+.5})){const key=x+','+y;visible.add(key);explored.add(key);}
  }
 }
}
function floorTile(x,y,variant,lit,seen){
 const p=P(x+.5,y+.5),noise=hash(x,y),tint=variant===1?[47,56,53]:variant===2?[57,50,43]:[51,51,42];
 const light=lit?1:seen?.38:.13;
 diamond(p.x,p.y,48,24,`rgb(${tint.map(v=>Math.round((v+noise*12)*light)).join(',')})`,'#171c19');
 if(lit&&art.floor.complete&&art.floor.naturalWidth){const w=window.OutbreakArt?.sprites?.floor?.displayWidth||106;ctx.globalAlpha=.38;ctx.drawImage(art.floor,p.x-w/2,p.y-w/4,w,w/2);ctx.globalAlpha=1;}
 if(lit&&noise>.84){ctx.strokeStyle='#787a6328';ctx.beginPath();ctx.moveTo(p.x-32,p.y-7);ctx.lineTo(p.x-7,p.y+2);ctx.lineTo(p.x+10,p.y);ctx.stroke();}
 if(lit&&noise<.08){ctx.strokeStyle='#121814';ctx.lineWidth=2;for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(p.x-18+i*8,p.y-10+i*4);ctx.lineTo(p.x-32+i*8,p.y-3+i*4);ctx.stroke();}}
}
function wall(x,y,player){
 const p=P(x+.5,y+.5),dist=Math.hypot(x+.5-player.x,y+.5-player.y);
 const front=(x+y>player.x+player.y-1.5&&Math.abs(p.x-P(player.x,player.y).x)<120),h=front&&dist<4.5?20:56;
 const seen=dist<15,top=seen?'#50554a':'#222820',left=seen?'#303b35':'#171e19',right=seen?'#232d28':'#141b16';
 ctx.save();if(front&&dist<2.5)ctx.globalAlpha=.6;
 polygon([[p.x-48,p.y],[p.x,p.y+24],[p.x,p.y+24-h],[p.x-48,p.y-h]],left,'#101812');
 polygon([[p.x,p.y+24],[p.x+48,p.y],[p.x+48,p.y-h],[p.x,p.y+24-h]],right,'#101812');
 diamond(p.x,p.y-h,48,24,top,'#78806a');
 ctx.strokeStyle=seen?'#baa15a55':'#333b27';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(p.x-46,p.y-h+8);ctx.lineTo(p.x,p.y-h+30);ctx.lineTo(p.x+46,p.y-h+8);ctx.stroke();
 if(seen&&hash(x,y)>.6){ctx.fillStyle='#c49b4535';polygon([[p.x-28,p.y-h+18],[p.x-17,p.y-h+23],[p.x-17,p.y-h+37],[p.x-28,p.y-h+32]],'#b891493d');}
 ctx.restore();
}
function glow(x,y,r,color,alpha=.5){ctx.save();ctx.globalAlpha=alpha;const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);ctx.restore();}
function label(x,y,text,color='#efc481'){ctx.save();ctx.font='bold 9px ui-monospace, monospace';ctx.textAlign='center';ctx.fillStyle='#08100edb';ctx.fillRect(x-ctx.measureText(text).width/2-6,y-10,ctx.measureText(text).width+12,15);ctx.fillStyle=color;ctx.fillText(text,x,y+1);ctx.restore();}
function health(x,y,w,hp,max,color){if(hp>=max)return;ctx.fillStyle='#0a0c09';ctx.fillRect(x-w/2,y,w,4);ctx.fillStyle=color;ctx.fillRect(x-w/2,y,w*Math.max(0,hp/max),3);}
function entity(type,e,state){const p=P(e.x,e.y),lit=isVisible(e.x,e.y);if(!lit&&type!=='marine'&&type!=='terminal'&&type!=='nest')return;
 const moving=e.moving||type!=='marine',bob=moving?Math.sin((e.anim||time)*13+(e.id||0))*(type==='marine'?1.4:2):0;
 const size=type==='queen'?170:type==='brute'?105:type==='crawler'?70:type==='spitter'?74:68;
 const heading=((Math.round((e.angle||0)/(Math.PI/4))%8)+8)%8;
 const directional=(kind)=>art[kind+'_'+heading]?.naturalWidth?kind+'_'+heading:kind;
 const flip=false;
 shadow(p.x,p.y,size*.26,size*.105,.5);
 if(type==='terminal'){
  sprite('terminal',p.x,p.y,65,lit?1:.45);glow(p.x,p.y-24,34,e.active?'#91c99b':'#f5a83b',.3);
  if(nearPlayer(e.x,e.y,2.3)&&!e.active)label(p.x,p.y-64,'[E] ПИТАНИЕ');return;
 }
 if(type==='nest'){
  if(e.hp<=0){shadow(p.x,p.y,45,20,.3);return;}
  sprite('nest',p.x,p.y,114,lit?1:.35);glow(p.x,p.y-12,55,'#b3d33c',.16+Math.sin(time*3)*.05);
  if(lit)health(p.x,p.y-64,52,e.hp,e.maxHp||400,'#c1d75c');return;
 }
 if(type==='spitter'){ctx.save();ctx.filter='hue-rotate(35deg)';sprite(directional('crawler'),p.x,p.y-bob,size,1,flip);ctx.restore();}
 else if(!sprite(directional(type==='marine'?'marine':type),p.x,p.y-bob,size,e.hit?.8:1,flip)){
  ctx.fillStyle=type==='marine'?'#98a297':'#9a995b';ctx.beginPath();ctx.ellipse(p.x,p.y-18,size*.22,size*.3,0,0,TAU);ctx.fill();
 }
 if(type==='marine'){
  const angle=e.angle||0,dir=P(Math.cos(angle),Math.sin(angle)),n=Math.hypot(dir.x,dir.y),dx=dir.x/n,dy=dir.y/n;
  ctx.strokeStyle='#111712';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(p.x+dx*6,p.y-24+dy*6);ctx.lineTo(p.x+dx*29,p.y-24+dy*29);ctx.stroke();
  ctx.strokeStyle='#a5aa99';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(p.x+dx*13,p.y-25+dy*13);ctx.lineTo(p.x+dx*30,p.y-25+dy*30);ctx.stroke();
  ctx.fillStyle='#f6b846';ctx.fillRect(p.x+dx*28-1.5,p.y-25+dy*28-1.5,3,3);
 }else{if(type==='queen')glow(p.x,p.y-45,80,'#c0c950',.15);health(p.x,p.y-size*.67,size*.45,e.hp,e.maxHp,'#b9583f');}
}
function drawPickup(item){const p=P(item.x,item.y);if(!isVisible(item.x,item.y))return;const color=item.kind==='medkit'?'#a3d8b0':item.kind==='credits'?'#e4bc67':'#b9c7ac';
 shadow(p.x,p.y,13,5,.4);ctx.save();ctx.translate(p.x,p.y-6-Math.sin(time*3+item.x)*2);ctx.fillStyle='#1f2922';ctx.strokeStyle=color;ctx.lineWidth=1;ctx.fillRect(-10,-8,20,13);ctx.strokeRect(-10,-8,20,13);ctx.fillStyle=color;
 if(item.kind==='medkit'){ctx.fillRect(-2,-6,4,9);ctx.fillRect(-5,-3,10,3);}else if(item.kind==='credits'){ctx.font='bold 12px monospace';ctx.fillText('$',-4,3);}else for(let i=0;i<3;i++)ctx.fillRect(-5+i*4,-5,2,7);ctx.restore();
}
function drawEffects(state){
 const gpuReady=window.FrontierV6?.ready;
 for(const b of [...(state.bullets||[]),...(state.enemyBullets||[])]){
  const p=P(b.x,b.y),a=P(b.px??b.x,b.py??b.y),color=b.kind==='plasma'?'#a6f0c1':b.kind==='acid'?'#b7df4f':'#ffe0a2';
  ctx.strokeStyle=color;ctx.lineWidth=b.kind==='plasma'?3:1.5;ctx.beginPath();ctx.moveTo(a.x,a.y-18);ctx.lineTo(p.x,p.y-18);ctx.stroke();glow(p.x,p.y-18,b.kind==='plasma'?20:6,color,.4);
  if(gpuReady){const s=screen(b),old=screen({x:b.px??b.x,y:b.py??b.y});gpu.push({kind:'line',x:old.x,y:old.y-18*zoom,x2:s.x,y2:s.y-18*zoom,color:b.kind==='plasma'?0xa6f0c1:0xffe0a2,width:zoom*1.4,alpha:.5});}
 }
 for(const g of state.grenades||[]){const p=P(g.x,g.y);shadow(p.x,p.y,6,3,.5);ctx.fillStyle='#cd9e42';ctx.beginPath();ctx.arc(p.x,p.y-12-Math.sin((1.4-g.life)*2.5)*12,4,0,TAU);ctx.fill();}
 for(const e of state.effects||[]){const p=P(e.x,e.y),f=Math.max(0,e.life/(e.maxLife||.4));ctx.save();
  if(e.kind==='telegraph'){ctx.globalAlpha=.4+Math.sin(time*16)*.15;diamond(p.x,p.y,(e.r||1)*48,(e.r||1)*24,'#d53f2622','#f18a53');}
  else if(e.kind==='explosion'){const r=(1-f)*100+20;glow(p.x,p.y-15,r,'#ff8a35',f*.9);ctx.strokeStyle=`rgba(255,190,80,${f})`;ctx.lineWidth=4;ctx.beginPath();ctx.ellipse(p.x,p.y-8,r*.7,r*.4,0,0,TAU);ctx.stroke();}
  else if(e.kind==='muzzle'){glow(p.x,p.y-23,42,'#ffc66d',f*.8);ctx.fillStyle='#fff4b7';ctx.beginPath();ctx.arc(p.x,p.y-23,5*f,0,TAU);ctx.fill();}
  else if(e.kind==='blood'){for(let i=0;i<5;i++){const a=i*1.91+e.x;ctx.fillStyle='#af492c';ctx.globalAlpha=f;ctx.beginPath();ctx.arc(p.x+Math.cos(a)*(1-f)*32,p.y-10+Math.sin(a)*(1-f)*18,3*f,0,TAU);ctx.fill();}}
  else {for(let i=0;i<5;i++){const a=i*1.7+e.y;ctx.strokeStyle='#f9c16a';ctx.globalAlpha=f;ctx.beginPath();ctx.moveTo(p.x+Math.cos(a)*(1-f)*18,p.y-16+Math.sin(a)*(1-f)*18);ctx.lineTo(p.x+Math.cos(a)*(1-f)*29,p.y-16+Math.sin(a)*(1-f)*29);ctx.stroke();}}
  if(gpuReady&&e.kind!=='blood'&&e.kind!=='telegraph'){const s=screen(e);gpu.push({x:s.x,y:s.y-18*zoom,r:(e.kind==='explosion'?70:12)*zoom*f,color:0xffc16a,alpha:f*.6});}
  ctx.restore();
 }
}
function radar(state){const el=document.getElementById('radar');if(!el||frame%6)return;const c=el.getContext('2d'),w=el.width,h=el.height,map=state.level.map,s=Math.min((w-8)/map[0].length,(h-8)/map.length),ox=(w-map[0].length*s)/2,oy=(h-map.length*s)/2;
 c.fillStyle='#101813';c.fillRect(0,0,w,h);for(let y=0;y<map.length;y++)for(let x=0;x<map[y].length;x++)if(map[y][x]==='.'){
  c.fillStyle=explored.has(x+','+y)?'#495646':'#202b23';c.fillRect(ox+x*s,oy+y*s,s+.2,s+.2);
 }
 function dot(p,color,r=2){c.fillStyle=color;c.beginPath();c.arc(ox+p.x*s,oy+p.y*s,r,0,TAU);c.fill();}
 for(const n of state.nests||[])if(n.hp>0)dot(n,'#d39048');for(const t of state.terminals||[])dot(t,t.active?'#649c87':'#d4c284');dot(state.level.exit,state.exitReady?'#b3e5b2':'#63745d',2.5);
 for(const e of state.enemies||[])if(isVisible(e.x,e.y))dot(e,'#bf603e',1.3);dot(state.player,'#edf4d7',2.5);
}
const preview=World.level(0),previewEnemies=Array.from({length:12},(_,i)=>({id:i,x:7+(i%4)*.8,y:5+Math.floor(i/4)*1.05,type:i===5?'brute':'crawler',hp:100,maxHp:100,angle:2.8,anim:i}));
function render(state,dt=.016){time+=dt;frame++;gpu=[];const menu=!state?.level||state.mode==='menu';
 if(menu)state={mode:'menu',levelIndex:0,level:preview,player:{x:7.5,y:7,r:.2,angle:time*.2,moving:false},enemies:previewEnemies,terminals:preview.terminals,nests:preview.nests,pickups:[],bullets:[],effects:[],decals:[],corpses:[]};
 lastState=state;
 if(lastLevel!==state.level){lastLevel=state.level;props=makeProps(state.level);explored.clear();visible.clear();visibilityTimer=0;const p=P(state.player.x,state.player.y);camera={...p};}
 updateVisibility(state,dt);
 const target=P(state.player.x,state.player.y),smooth=1-Math.exp(-dt*9);
 camera.x+=(target.x-camera.x)*smooth;camera.y+=(target.y-camera.y)*smooth;
 if(menu){camera.x+=Math.sin(time*.15)*.2;camera.y+=Math.cos(time*.12)*.14;}
 origin={x:width*(menu?.66:.5),y:height*(width<600?.42:.48)};
 if(state.shake&&!document.getElementById('motionToggle')?.checked){origin.x+=(Math.random()-.5)*state.shake*3;origin.y+=(Math.random()-.5)*state.shake*2;}
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.globalAlpha=1;ctx.fillStyle='#090e0b';ctx.fillRect(0,0,width,height);
 ctx.save();ctx.translate(origin.x,origin.y);ctx.scale(zoom,zoom);ctx.translate(-camera.x,-camera.y);
 const display=(x,y,margin=130)=>{const p=screen({x,y});return p.x>-margin&&p.x<width+margin&&p.y>-margin&&p.y<height+margin;};
 const map=state.level.map,queue=[];
 for(let y=0;y<map.length;y++)for(let x=0;x<map[y].length;x++){
  if(!display(x+.5,y+.5))continue;
  if(map[y][x]==='.')floorTile(x,y,state.levelIndex,visible.has(x+','+y),explored.has(x+','+y));
  else if(map[y][x]==='#')queue.push({depth:x+y+1.03,draw:()=>wall(x,y,state.player)});
 }
 // Exit is a visible floor marking, but only becomes an active extraction zone after the objectives.
 const exit=P(state.level.exit.x,state.level.exit.y);diamond(exit.x,exit.y,60,30,state.exitReady?'#77b36c27':'#c8b66812',state.exitReady?'#c4eb9e':'#8b8659');
 ctx.save();ctx.translate(exit.x,exit.y-3);ctx.scale(1,.5);ctx.font='bold 13px monospace';ctx.textAlign='center';ctx.fillStyle=state.exitReady?'#d4efb0':'#8d8965';ctx.fillText('EXIT',0,4);ctx.restore();
 if(state.exitReady){glow(exit.x,exit.y-20,75,'#a6e174',.25);label(exit.x,exit.y-70,'ШЛЮЗ ОТКРЫТ','#c9eeb7');}
 for(const d of state.decals||[]){if(!display(d.x,d.y))continue;const p=P(d.x,d.y);ctx.globalAlpha=d.alpha??.65;for(let i=0;i<4;i++)diamond(p.x+Math.sin(i*3+d.x)*10,p.y+Math.cos(i*3)*5,(d.r||.3)*30+i*2,(d.r||.3)*12+i,'#643923');ctx.globalAlpha=1;}
 for(const c of state.corpses||[]){if(!display(c.x,c.y)||!isVisible(c.x,c.y))continue;const p=P(c.x,c.y);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(.25);ctx.scale(1,.35);ctx.globalAlpha=.55;sprite(c.type==='spitter'?'crawler':c.type,0,10,c.type==='queen'?130:55);ctx.restore();}
 for(const p of props){if(display(p.x,p.y)&&isVisible(p.x,p.y))queue.push({depth:p.x+p.y,draw:()=>{const a=P(p.x,p.y);shadow(a.x,a.y,22,9,.45);sprite(p.type,a.x,a.y,p.type==='generator'?98:p.type==='barrel'?43:62);}});}
 for(const t of state.terminals||[])if(display(t.x,t.y))queue.push({depth:t.x+t.y,draw:()=>entity('terminal',t,state)});
 for(const n of state.nests||[])if(display(n.x,n.y))queue.push({depth:n.x+n.y,draw:()=>entity('nest',n,state)});
 for(const item of state.pickups||[])if(display(item.x,item.y))queue.push({depth:item.x+item.y-.01,draw:()=>drawPickup(item)});
 for(const e of state.enemies||[])if(display(e.x,e.y))queue.push({depth:e.x+e.y,draw:()=>entity(e.type,e,state)});
 queue.push({depth:state.player.x+state.player.y,draw:()=>entity('marine',state.player,state)});
 queue.sort((a,b)=>a.depth-b.depth);for(const item of queue)item.draw();drawEffects(state);ctx.restore();
 // Lamp pool and a restrained edge vignette keep distant corridors readable.
 const player=screen(state.player),vignette=ctx.createRadialGradient(player.x,player.y,100*zoom,player.x,player.y,Math.max(width,height)*.72);
 vignette.addColorStop(0,'#00000000');vignette.addColorStop(.6,'#03090618');vignette.addColorStop(1,'#020805c9');ctx.fillStyle=vignette;ctx.fillRect(0,0,width,height);
 if(state.flash){ctx.fillStyle=`rgba(166,35,16,${Math.min(.3,state.flash*.22)})`;ctx.fillRect(0,0,width,height);}
 if(!menu&&state.aim&&width>700&&matchMedia('(pointer:fine)').matches){const a=state.pointer||screen(state.aim);ctx.strokeStyle='#eed29b';ctx.lineWidth=1;for(const [dx,dy]of [[-1,0],[1,0],[0,-1],[0,1]]){ctx.beginPath();ctx.moveTo(a.x+dx*5,a.y+dy*5);ctx.lineTo(a.x+dx*11,a.y+dy*11);ctx.stroke();}ctx.fillStyle='#e3c48b';ctx.fillRect(a.x-1,a.y-1,2,2);}
 if(window.FrontierV6?.ready)window.FrontierV6.effects(gpu);
 if(!menu)radar(state);
}
window.OutbreakRenderer={render,screenToWorld,worldToScreen:(x,y)=>screen(typeof x==='object'?x:{x,y}),status:()=>({projection:'2:1-isometric',zoom,assetsReady:names.every(n=>art[n].complete&&art[n].naturalWidth>0),explored:explored.size,visible:visible.size,props:props.length})};
})();
