(()=>{'use strict';
const C=window.FrontierCore,Anim=window.FrontierAnimation;if(!C||!Anim)throw Error('Core or animation module unavailable');
const $=id=>document.getElementById(id), canvas=$('stage'),ctx=canvas.getContext('2d',{alpha:false});
const ui={home:$('home'),upgrade:$('upgrade'),paused:$('paused'),end:$('end'),hud:$('hud'),controls:$('controls'),wave:$('wave'),hp:$('hpText'),hpFill:$('hpFill'),xp:$('xpFill'),level:$('levelText'),kills:$('kills'),score:$('score'),clock:$('clock'),ticker:$('waveCountdown'),boss:$('bossBar'),bossFill:$('bossFill'),cards:$('cards'),stick:$('stickZone'),knob:$('stickKnob'),dash:$('dash'),dashText:$('dashText'),toast:$('toast')};
const imageList={player:'player',drone:'drone',runner:'runner',brute:'brute',boss:'boss',gem:'gem',tile:'tile',icon:'icon',crate:'crate',barrel:'barrel',reactor:'reactor',barricade:'barricade',explosion:'explosion',shockwave:'shockwave',smoke:'smoke',muzzle:'muzzle',scorch:'scorch'};
const floor=new Image();floor.src='assets/floor.webp';const images={};Object.entries(imageList).forEach(([key,file])=>{const im=new Image();im.src='assets/'+file+(file==='muzzle'||file==='explosion'||file==='smoke'||file==='shockwave'||file==='scorch'?'.png':'.svg');images[key]=im});
const actors={};for(const name of ['player','drone','runner','brute','boss']){const asset=new Image();asset.src='assets/characters/'+name+'.webp';actors[name]=asset}
let heroMotion={moving:false,time:0,firing:0,hit:0,pose:0};let defeated=[];
function actorPose(kind,state){return Anim.pose(kind,state)}
function drawActor(kind,x,y,size,angle=0,alpha=1,pose=0){
 const layer=window.FrontierV6;
 if(layer?.ready){
  ctx.save();ctx.translate(x,y);
  if(kind==='player') {ctx.scale(Math.cos(angle-Math.PI/2)<0?-1:1,1);ctx.rotate(Math.sin(angle-Math.PI/2)*.045);}
  else if(kind==='boss'){ctx.scale(Math.cos(angle-Math.PI/2)>0?-1:1,1);ctx.rotate(Math.sin(angle)*.035);}
  else ctx.rotate(angle);
  const m=ctx.getTransform();const d=DPR;
  const accepted=layer.actor(kind,pose,size,alpha,{a:m.a/d,b:m.b/d,c:m.c/d,d:m.d/d,e:m.e/d,f:m.f/d});
  ctx.restore();if(accepted)return;
 }
 const im=actors[kind];
 if(im?.complete && im.naturalWidth===Anim.COLUMNS*Anim.FRAME_SIZE && im.naturalHeight===Anim.ROWS*Anim.FRAME_SIZE){
  ctx.save();ctx.translate(x,y);
  // The painted player and boss are 3/4-view cut-outs. Rotating them 360°
  // like top-down SVGs turns their bodies sideways; mirror toward the target
  // instead. Remaining enemies retain world-angle sprite rotation.
  if(kind==='player'){
   ctx.scale(Math.cos(angle-Math.PI/2)<0?-1:1,1);
   ctx.rotate(Math.sin(angle-Math.PI/2)*.045);
  }else if(kind==='boss'){
   ctx.scale(Math.cos(angle-Math.PI/2)>0?-1:1,1);
   ctx.rotate(Math.sin(angle)*.035);
  }else ctx.rotate(angle);
  ctx.globalAlpha=alpha;
  const source=Anim.sourceRect(pose);ctx.drawImage(im,source.x,source.y,source.width,source.height,-size/2,-size/2,size,size);ctx.restore();
 }else drawSprite(kind,x,y,size,angle,alpha);
}
let W=innerWidth,H=innerHeight,DPR=1,mode='menu',game=null,last=0,frame=0,uid=0,particles=[],floaters=[],vfx=[],scars=[],damageFlash=0,shake=0,keys=new Set(),pendingWave=false,mobileStick=null,stickVec={x:0,y:0},lastFacing=0,toastT=0;
const THEME={sea:'#55f5e2',gold:'#ffb775',red:'#ff5f7c',blue:'#51bbee'};
function resize(){W=Math.max(300,window.innerWidth);H=Math.max(320,window.innerHeight);DPR=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.floor(W*DPR);canvas.height=Math.floor(H*DPR);canvas.style.width=W+'px';canvas.style.height=H+'px';ctx.setTransform(DPR,0,0,DPR,0,0)}
window.addEventListener('resize',resize);resize();
function safeGet(key,def){try{return localStorage.getItem(key)||def}catch{return def}}
function safeSet(key,v){try{localStorage.setItem(key,String(v))}catch{}}
let best=Number(safeGet('frontier_best','0'))||0;let mute=safeGet('frontier_mute','0')==='1';
$('bestHome').textContent='ЛУЧШИЙ РЕЗУЛЬТАТ: '+best.toLocaleString('ru');$('mute').textContent=mute?'♪̸':'♫';
let audio=null;
function sound(freq=330,len=.08,type='triangle',vol=.035){if(mute||mode==='menu')return;if(window.FrontierV6?.playAudio?.(freq,len,type,vol))return;try{audio ||=new(window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();const osc=audio.createOscillator(),gain=audio.createGain();osc.type=type;osc.frequency.setValueAtTime(freq,audio.currentTime);osc.frequency.exponentialRampToValueAtTime(Math.max(freq*.6,60),audio.currentTime+len);gain.gain.setValueAtTime(vol,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+len);osc.connect(gain).connect(audio.destination);osc.start();osc.stop(audio.currentTime+len+.01)}catch{}}
function sdkInit(){if(!/(^|\.)yandex\.|(^|\.)yandex\.net$/.test(location.hostname)&&!new URLSearchParams(location.search).has('yandex-sdk'))return;const script=document.createElement('script');script.src='/sdk.js';script.async=true;script.onload=()=>{if(!window.YaGames)return;window.YaGames.init().then(api=>{sdk=api;try{sdk.features?.LoadingAPI?.ready()}catch{};sdk.on?.('game_api_pause',()=>pause(true));sdk.on?.('game_api_resume',()=>{if(mode==='running')sdkEvent(true)});sdkEvent(mode==='running')}).catch(()=>{})};document.head.appendChild(script)}
let sdk=null;function sdkEvent(isPlaying){try{if(isPlaying)sdk?.features?.GameplayAPI?.start();else sdk?.features?.GameplayAPI?.stop()}catch{}}
sdkInit();
function show(which){for(const elem of [ui.home,ui.upgrade,ui.paused,ui.end])elem.classList.toggle('hidden',elem.id!==which);ui.controls.classList.toggle('hidden',which==='home'||which==='end'||which==='paused'||which==='upgrade');}
function announce(message){ui.toast.textContent=message;ui.toast.classList.remove('hidden');toastT=2.1}
function seedGame(){game={player:C.newPlayer(),enemies:[],bullets:[],enemyBullets:[],gems:[],wave:1,waveTime:0,spawnTimer:.7,bossSpawned:false,time:0,dead:0,score:0,camera:{x:0,y:0},upgrades:0};particles=[];floaters=[];vfx=[];scars=[];heroMotion={moving:false,time:0,firing:0,hit:0,pose:0};defeated=[];pendingWave=false;uid=0;mode='running';show('none');ui.hud.classList.remove('hidden');sdkEvent(true);announce('ВОЛНА 01 — ЗАЩИЩАЙ РУБЕЖ');updateHud()}
function quit(){mode='menu';game=null;ui.hud.classList.add('hidden');show('home');$('bestHome').textContent='ЛУЧШИЙ РЕЗУЛЬТАТ: '+best.toLocaleString('ru');sdkEvent(false);resetStick()}
function endGame(win=false){if(!game)return;mode='ended';resetStick();sdkEvent(false);if(game.score>best){best=game.score;safeSet('frontier_best',best)}$('endTitle').textContent=win?'РУБЕЖ УДЕРЖАН':'РУБЕЖ ПАЛ';$('endOverline').textContent=win?'ПОБЕДА • ВСЕ ВОЛНЫ ОТРАЖЕНЫ':'СИГНАЛ ПОТЕРЯН';$('endDescription').textContent=win?'Титаны уничтожены. База спасена. История запомнит эту ночь.':'Рой прорвал оборону. Усиль арсенал и попробуй снова.';$('endWave').textContent=String(game.wave);$('endKills').textContent=String(game.player.kills);$('endScore').textContent=game.score.toLocaleString('ru');show('end');sound(win?720:180,.37,'sawtooth',.08)}
function pause(fromSDK=false){if(mode!=='running')return;mode='paused';resetStick();sdkEvent(false);show('paused');if(!fromSDK)sound(220,.13)}
function resume(){if(mode!=='paused')return;mode='running';show('none');sdkEvent(true)}
$('start').addEventListener('click',()=>{sound(540,.17);seedGame()});$('retry').addEventListener('click',seedGame);$('endMenu').addEventListener('click',quit);$('resume').addEventListener('click',resume);$('pauseButton').addEventListener('click',()=>{if(mode==='running')pause()});$('quit').addEventListener('click',quit);$('mute').addEventListener('click',()=>{mute=!mute;safeSet('frontier_mute',mute?'1':'0');$('mute').textContent=mute?'♪̸':'♫'});
window.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','Escape'].includes(e.key))e.preventDefault();keys.add(e.key.toLowerCase());if(e.key==='Escape'){if(mode==='running')pause();else if(mode==='paused')resume()}if(e.key===' '&&mode==='running')dash()});window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
function resetStick(){mobileStick=null;stickVec={x:0,y:0};ui.knob.style.transform='translate(0,0)'}
function adjustStick(e){const rect=ui.stick.getBoundingClientRect();const centerX=rect.left+rect.width/2,centerY=rect.top+58;const n=C.norm(e.clientX-centerX,e.clientY-centerY),scale=Math.min(1,Math.hypot(e.clientX-centerX,e.clientY-centerY)/47);stickVec={x:n.x*scale,y:n.y*scale};ui.knob.style.transform=`translate(${stickVec.x*28}px,${stickVec.y*28}px)`;}
ui.stick.addEventListener('pointerdown',e=>{if(mode!=='running')return;mobileStick=e.pointerId;try{ui.stick.setPointerCapture(e.pointerId)}catch{}adjustStick(e)});
ui.stick.addEventListener('pointermove',e=>{if(e.pointerId===mobileStick)adjustStick(e)});
for(const t of ['pointerup','pointercancel','lostpointercapture'])ui.stick.addEventListener(t,e=>{if(e.pointerId===mobileStick)resetStick()});
ui.dash.addEventListener('pointerdown',e=>{e.preventDefault();dash()});
function getInput(){let x=stickVec.x,y=stickVec.y;if(keys.has('a')||keys.has('arrowleft'))x-=1;if(keys.has('d')||keys.has('arrowright'))x+=1;if(keys.has('w')||keys.has('arrowup'))y-=1;if(keys.has('s')||keys.has('arrowdown'))y+=1;const n=C.norm(x,y);if(Math.hypot(x,y)>.12)lastFacing=Math.atan2(n.y,n.x);return n}
function dash(){if(mode!=='running'||game.player.dashCd>0)return;let dir=getInput();if(dir.x===0&&dir.y===0)dir={x:Math.cos(lastFacing),y:Math.sin(lastFacing)};const p=game.player;p.dashTime=.23;p.dashCd=4.1;p.invuln=.35;for(let k=0;k<15;k++)spark(p.x,p.y,'#60ffeb',8);sound(730,.18,'sawtooth',.05)}
function spark(x,y,color,count=5){for(let i=0;i<count&&particles.length<180;i++){const a=Math.random()*Math.PI*2,s=45+Math.random()*190;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,l:.24+Math.random()*.5,life:.55,color,size:1+Math.random()*3})}}
// V3 GAME FX: independent GPU-friendly alpha sprites, capped allocations for mobile.
// World-space VFX are drawn individually by Canvas, never pasted as a background illustration.
const FX_LIMIT=85,SCAR_LIMIT=55;
function effect(type,x,y,size=76,ttl=.48,angle=0){window.FrontierV6?.burst?.(type,x,y);
 if(vfx.length>=FX_LIMIT)vfx.shift();
 vfx.push({type,x,y,size,life:ttl,total:ttl,angle,spin:(Math.random()-.5)*.25,seed:Math.random()});
}
function blast(x,y,scale=1){
 effect('explosion',x,y,128*scale,.4);effect('shockwave',x,y,170*scale,.32);
 if(vfx.length<FX_LIMIT-5)for(let i=0;i<4;i++)effect('smoke',x+(Math.random()-.5)*85*scale,y+(Math.random()-.5)*85*scale,75*scale,1.1+Math.random()*.5);
 if(scars.length>=SCAR_LIMIT)scars.shift();scars.push({x,y,size:78*scale,life:26});
 spark(x,y,'#ffb569',Math.min(16,Math.round(scale*9)));
}
function drawCombatFx(){
 for(const sc of scars){const im=images.scorch;if(im?.complete&&im.naturalWidth){ctx.globalAlpha=Math.min(.75,sc.life/9*.75);ctx.drawImage(im,sc.x-sc.size/2,sc.y-sc.size/2,sc.size,sc.size)}}ctx.globalAlpha=1;
 for(const e of vfx){const im=images[e.type];if(!im?.complete||!im.naturalWidth)continue;
   let t=e.life/e.total;ctx.save();ctx.translate(e.x,e.y);ctx.rotate(e.angle+(1-t)*e.spin);
   const isSmoke=e.type==='smoke',isMuzzle=e.type==='muzzle',size=e.size*(isSmoke?1+(1-t)*1.2:1+(1-t)*.42);
   ctx.globalAlpha=(isSmoke?.48:1)*Math.min(1,t*3);
   if(!isSmoke){ctx.globalCompositeOperation='screen';}
   ctx.drawImage(im,-size/2,-size*(isMuzzle?.25:.5),size,size*(isMuzzle?.5:1));ctx.restore();
 }
}
function fxTick(dt){for(let i=vfx.length-1;i>=0;i--){vfx[i].life-=dt;if(vfx[i].life<=0)vfx.splice(i,1)}for(let i=scars.length-1;i>=0;i--){scars[i].life-=dt;if(scars[i].life<=0)scars.splice(i,1)}}
function numberFx(x,y,str,color){floaters.push({x,y,text:str,color,life:.6})}
function spawnEnemy(type){if(game.enemies.length>70)return;const p=game.player;const theta=Math.random()*Math.PI*2,rad=type==='boss'?Math.min(330,Math.max(220,Math.min(W,H)*.40)):Math.max(W,H)*.55+110;let x=C.clamp(p.x+Math.cos(theta)*rad,45,C.WIDTH-45),y=C.clamp(p.y+Math.sin(theta)*rad,45,C.HEIGHT-45);const base=C.mobStats[type],mul=type==='boss'?1:1+(game.wave-1)*.17;const hp=type==='boss'?C.waveInfo(game.wave).bossHp:Math.round(base.hp*mul);game.enemies.push({id:++uid,type,x,y,r:base.r,hp,maxhp:hp,spd:base.spd*(1+(game.wave-1)*.025),dmg:base.dmg,attack:Math.random()*3,anim:Math.random()*6,knock:0});if(type==='boss'){announce('⚠ ТИТАН ОБНАРУЖЕН');effect('shockwave',x,y,330,.8);effect('smoke',x,y,170,1.4);sound(126,.5,'sawtooth',.1)}}
function beginNextWave(){if(game.wave>=C.TOTAL_WAVES){endGame(true);return}game.wave++;game.waveTime=0;game.spawnTimer=.5;game.bossSpawned=false;game.player.hp=Math.min(game.player.maxhp,game.player.hp+23);announce('ВОЛНА '+String(game.wave).padStart(2,'0')+' — ДЕРЖИ ОБОРОНУ');sound(600,.23)}
function showUpgrade(nextWave=false){pendingWave=nextWave;mode='upgrading';show('upgrade');sdkEvent(false);const options=C.sampleUpgrades();ui.cards.innerHTML='';for(const upgrade of options){const card=document.createElement('button');card.className='upgradeCard';const sym=document.createElement('span'),name=document.createElement('strong'),sub=document.createElement('small');sym.className='emoji';sym.textContent=upgrade.symbol;name.textContent=upgrade.title;sub.textContent=upgrade.desc;card.append(sym,name,sub);card.addEventListener('click',()=>{C.applyUpgrade(game.player,upgrade.id);game.upgrades++;sound(580,.21);if(pendingWave)beginNextWave();mode='running';show('none');sdkEvent(true);announce('МОДУЛЬ УСТАНОВЛЕН');});ui.cards.appendChild(card)}}
function shoot(){const p=game.player;let target=null,closest=520;for(const e of game.enemies){const d=C.distance(p,e);if(d<closest){target=e;closest=d}}if(!target)return;const baseAngle=Math.atan2(target.y-p.y,target.x-p.x);lastFacing=baseAngle;for(let i=0;i<p.shots;i++){const angle=baseAngle+(i-(p.shots-1)/2)*.13;const dx=Math.cos(angle),dy=Math.sin(angle);game.bullets.push({x:p.x+dx*28,y:p.y+dy*28,r:4,vx:dx*690,vy:dy*690,ttl:1.1,damage:p.damage,pierce:p.pierce,hit:[]});}heroMotion.firing=.19;spark(p.x+Math.cos(baseAngle)*22,p.y+Math.sin(baseAngle)*22,'#fff1ad',3);effect('muzzle',p.x+Math.cos(baseAngle)*55,p.y+Math.sin(baseAngle)*55,70,.1,baseAngle);sound(420+Math.random()*100,.045,'square',.015);p.fireTimer=p.fireDelay;shake=Math.max(shake,1.5);if(game.bullets.length>100)game.bullets.splice(0,game.bullets.length-100)}
function killEnemy(enemy){defeated.push({type:enemy.type,x:enemy.x,y:enemy.y,angle:Math.atan2(game.player.y-enemy.y,game.player.x-enemy.x)+Math.PI/2,life:.46,maxLife:.46});if(defeated.length>20)defeated.shift();game.player.kills++;game.score+=C.mobStats[enemy.type].score;game.player.score=game.score;spark(enemy.x,enemy.y,enemy.type==='boss'?'#ff8d6a':'#6ffff0',enemy.type==='boss'?50:9);if(enemy.type!=='boss')blast(enemy.x,enemy.y,enemy.type==='brute'?.55:.28);game.gems.push({x:enemy.x,y:enemy.y,r:8,value:C.mobStats[enemy.type].xp,anim:0});if(enemy.type==='boss'){blast(enemy.x,enemy.y,2.2);announce('ТИТАН УНИЧТОЖЕН');sound(790,.35,'triangle',.08)}}
function update(dt){if(mode!=='running'||!game)return;const p=game.player;game.time+=dt;game.waveTime+=dt;damageFlash=Math.max(0,damageFlash-dt*1.9);shake=Math.max(0,shake-dt*12);const wave=C.waveInfo(game.wave);if(wave.isBoss&&!game.bossSpawned){spawnEnemy('boss');game.bossSpawned=true}const inp=getInput();C.advancePlayer(p,inp,dt);heroMotion.time+=dt;heroMotion.moving=Math.hypot(inp.x,inp.y)>.16;heroMotion.firing=Math.max(0,heroMotion.firing-dt);heroMotion.hit=Math.max(0,heroMotion.hit-dt);if(p.regen){p.regenTimer+=dt;if(p.regenTimer>=3){p.regenTimer=0;p.hp=Math.min(p.maxhp,p.hp+p.regen)}}if(p.fireTimer<=0)shoot();
 if(game.waveTime<wave.duration){game.spawnTimer-=dt;if(game.spawnTimer<=0){spawnEnemy(C.chooseMob(game.wave));game.spawnTimer=wave.spawnRate*(.6+Math.random()*.8)}}
 for(const e of game.enemies){e.anim+=dt;e.knock=Math.max(0,e.knock-dt);e.attackPose=Math.max(0,(e.attackPose||0)-dt);const n=C.norm(p.x-e.x,p.y-e.y);e.x=C.clamp(e.x+n.x*e.spd*dt*(e.knock?-.35:1),e.r,C.WIDTH-e.r);e.y=C.clamp(e.y+n.y*e.spd*dt*(e.knock?-.35:1),e.r,C.HEIGHT-e.r);if(C.collision(p,e)&&p.invuln<=0){p.hp-=e.dmg;p.invuln=.8;damageFlash=.8;heroMotion.hit=.26;shake=8;spark(p.x,p.y,'#ff6a75',12);effect('shockwave',p.x,p.y,100,.22);numberFx(p.x,p.y-20,'-'+e.dmg,'#ff7a87');sound(100,.2,'sawtooth',.08);if(p.hp<=0){p.hp=0;endGame();return}}
 if(e.type==='boss'){e.attack-=dt;if(e.attack<=0){e.attack=1.8;e.attackPose=.46;const center=Math.atan2(p.y-e.y,p.x-e.x);for(let j=-2;j<=2;j++){const a=center+j*.22;game.enemyBullets.push({x:e.x,y:e.y,vx:Math.cos(a)*195,vy:Math.sin(a)*195,r:9,ttl:4})}effect('shockwave',e.x,e.y,132,.4);effect('explosion',e.x,e.y,70,.18);sound(155,.25,'sawtooth',.04)}}}
 for(let k=game.enemyBullets.length-1;k>=0;k--){const b=game.enemyBullets[k];b.x+=b.vx*dt;b.y+=b.vy*dt;b.ttl-=dt;if(C.collision(b,p)&&p.invuln<=0){p.hp-=14;p.invuln=.8;damageFlash=.8;heroMotion.hit=.26;shake=8;spark(p.x,p.y,'#ff737b',9);effect('explosion',p.x,p.y,86,.25);b.ttl=0;if(p.hp<=0){p.hp=0;endGame();return}}if(b.ttl<=0)game.enemyBullets.splice(k,1)}
 for(let i=game.bullets.length-1;i>=0;i--){const b=game.bullets[i];b.x+=b.vx*dt;b.y+=b.vy*dt;b.ttl-=dt;for(const e of game.enemies){if(e.hp>0&&C.bulletHit(b,e)){e.knock=.06;spark(b.x,b.y,'#ffe6a2',3);effect('explosion',b.x,b.y,38,.19);if(e.hp<=0)killEnemy(e);if(b.pierce<0){b.ttl=0;break}}}if(b.ttl<=0)game.bullets.splice(i,1)}
 game.enemies=game.enemies.filter(e=>e.hp>0);
 for(let i=game.gems.length-1;i>=0;i--){const g=game.gems[i];g.anim+=dt;const d=C.distance(g,p);if(d<p.magnet*2.6){const n=C.norm(p.x-g.x,p.y-g.y),spd=d<p.magnet?950:340;g.x+=n.x*spd*dt;g.y+=n.y*spd*dt}if(C.distance(g,p)<p.r+g.r+12){p.xp+=g.value;spark(g.x,g.y,'#5fffdb',3);game.gems.splice(i,1);sound(810,.05,'sine',.013)}}
 if(p.xp>=p.xpNeed){p.xp-=p.xpNeed;p.level++;p.xpNeed=Math.floor(p.xpNeed*1.28+8);showUpgrade();}
 if(mode==='running'&&game.waveTime>=wave.duration&&game.enemies.length===0){if(game.wave===C.TOTAL_WAVES)endGame(true);else showUpgrade(true)}
 for(let i=particles.length-1;i>=0;i--){const e=particles[i];e.x+=e.vx*dt;e.y+=e.vy*dt;e.vx*=.95;e.vy*=.95;e.l-=dt;if(e.l<=0)particles.splice(i,1)}for(let i=floaters.length-1;i>=0;i--){floaters[i].y-=35*dt;floaters[i].life-=dt;if(floaters[i].life<=0)floaters.splice(i,1)}
 for(let i=defeated.length-1;i>=0;i--){defeated[i].life-=dt;if(defeated[i].life<=0)defeated.splice(i,1)}fxTick(dt);if(toastT>0){toastT-=dt;if(toastT<=0)ui.toast.classList.add('hidden')}updateHud();}
function updateHud(){if(!game)return;const p=game.player;ui.wave.textContent=String(game.wave).padStart(2,'0');ui.hp.textContent=Math.ceil(p.hp)+' / '+p.maxhp;ui.hpFill.style.width=(100*p.hp/p.maxhp)+'%';ui.xp.style.width=(100*p.xp/p.xpNeed)+'%';ui.level.textContent='УР. '+p.level;ui.kills.textContent=p.kills;ui.score.textContent=game.score.toLocaleString('ru');ui.clock.textContent=Math.floor(game.time/60)+':'+String(Math.floor(game.time%60)).padStart(2,'0');ui.ticker.textContent=Math.max(0,Math.ceil(C.waveInfo(game.wave).duration-game.waveTime));let boss=game.enemies.find(e=>e.type==='boss');ui.boss.hidden=!boss;if(boss)ui.bossFill.style.width=(100*boss.hp/boss.maxhp)+'%';ui.dash.classList.toggle('cooldown',p.dashCd>0);ui.dashText.textContent=p.dashCd>0?p.dashCd.toFixed(1)+' c':'РЫВОК';const weapons=p.shots>1?'МУЛЬТИЗАЛП · '+p.shots:'ШТУРМОВАЯ ВИНТОВКА';$('weaponName').textContent=weapons;}
function drawSprite(name,x,y,size,angle=0,alpha=1){const img=images[name];ctx.save();ctx.globalAlpha=alpha;ctx.translate(x,y);ctx.rotate(angle);if(img?.complete&&img.naturalWidth)ctx.drawImage(img,-size/2,-size/2,size,size);else {ctx.fillStyle='#44e5d8';ctx.beginPath();ctx.arc(0,0,size*.36,0,Math.PI*2);ctx.fill()}ctx.restore()}
// V2: baked industrial environment; every prop is a separate SVG image, not a background screenshot.
const PROP_DATA=[
 {type:'reactor',x:675,y:520,size:260,scale:1.0},{type:'crate',x:1515,y:520,size:196},
 {type:'barricade',x:1010,y:485,size:166},{type:'barrel',x:1195,y:550,size:104},
 {type:'crate',x:735,y:1080,size:205},{type:'reactor',x:1590,y:1080,size:265},
 {type:'barricade',x:1410,y:815,size:145},{type:'barrel',x:570,y:825,size:100},
 {type:'crate',x:1730,y:755,size:220},{type:'barricade',x:1060,y:1190,size:200},
 {type:'barrel',x:1510,y:1320,size:88},{type:'crate',x:310,y:1120,size:200},
 {type:'reactor',x:310,y:310,size:258},{type:'barrel',x:1010,y:280,size:102},
 {type:'crate',x:1900,y:1380,size:210},{type:'barricade',x:1880,y:330,size:193},
];
function hash2(x,y){let n=(x*374761393+y*668265263)>>>0;n=(Math.imul(n^(n>>>13),1274126177))>>>0;return ((n^(n>>>16))>>>0)/4294967295;}
function environmentalLight(x,y,rad,color){ctx.save();ctx.globalCompositeOperation='screen';const g=ctx.createRadialGradient(x,y,4,x,y,rad);g.addColorStop(0,color);g.addColorStop(1,'#00000000');ctx.fillStyle=g;ctx.fillRect(x-rad,y-rad,rad*2,rad*2);ctx.restore();}
function paintEnvironment(cam){
 ctx.fillStyle='#131f29';ctx.fillRect(cam.x,cam.y,W,H);
 const step=768;
 for(let x=Math.floor(cam.x/step)*step;x<cam.x+W+step;x+=step){
  for(let y=Math.floor(cam.y/step)*step;y<cam.y+H+step;y+=step){
   if(floor.complete&&floor.naturalWidth)ctx.drawImage(floor,x,y,step,step);
  }
 }
 // Main road and lane markings; perspective is suggested through highlights and extruded props.
 ctx.save();ctx.globalAlpha=.46;ctx.fillStyle='#111b24';ctx.fillRect(330,711,1530,214);ctx.globalAlpha=1;
 ctx.strokeStyle='#e4a14c77';ctx.lineWidth=5;ctx.setLineDash([90,32]);
 ctx.beginPath();ctx.moveTo(352,739);ctx.lineTo(1840,739);ctx.moveTo(352,901);ctx.lineTo(1840,901);ctx.stroke();ctx.setLineDash([]);
 ctx.fillStyle='#b8b9a45d';ctx.font='900 27px system-ui';ctx.save();ctx.translate(400,857);ctx.rotate(-.045);ctx.fillText('SECTOR A-7   ▸   RESTRICTED',0,0);ctx.restore();
 ctx.strokeStyle='#5b869480';ctx.lineWidth=6;ctx.strokeRect(17,17,C.WIDTH-34,C.HEIGHT-34);
 ctx.strokeStyle='#12212cf0';ctx.lineWidth=16;ctx.strokeRect(27,27,C.WIDTH-54,C.HEIGHT-54);
 // Physical wear, fixed run-to-run; no heavy particle allocation while drawing.
 for(let i=0;i<170;i++){
  const x=25+hash2(i,42)*(C.WIDTH-50),y=25+hash2(i,110)*(C.HEIGHT-50);
  if(x<cam.x-18||x>cam.x+W+18||y<cam.y-18||y>cam.y+H+18)continue;
  const len=3+hash2(i,88)*25;
  ctx.strokeStyle=i%7===0?'#b66d4055':'#060c12a2';ctx.lineWidth=.7+hash2(i,5)*1.8;
  ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+len,y+len*.25);ctx.lineTo(x+len*1.3,y+len*.6);ctx.stroke();
 }
 // Independent silhouettes with floor contact shadows (not baked into background artwork).
 for(const prop of PROP_DATA){
  if(prop.x<cam.x-prop.size||prop.x>cam.x+W+prop.size||prop.y<cam.y-prop.size||prop.y>cam.y+H+prop.size)continue;
  ctx.save();ctx.fillStyle='#000c13ae';ctx.shadowBlur=28;ctx.shadowColor='#02070c';
  ctx.beginPath();ctx.ellipse(prop.x+14,prop.y+prop.size*.26,prop.size*.43,prop.size*.17,-.08,0,Math.PI*2);ctx.fill();ctx.restore();
  drawSprite(prop.type,prop.x,prop.y,prop.size,0,1);
 }
 for(const light of [{x:682,y:590,r:205,c:'#26cfe549'},{x:1598,y:1130,r:250,c:'#3dbcf04b'},{x:1178,y:550,r:165,c:'#ff9c394e'},{x:1570,y:530,r:155,c:'#ff925538'},{x:320,y:310,r:230,c:'#19aee338'}]){
  if(light.x+light.r>cam.x&&light.x-light.r<cam.x+W&&light.y+light.r>cam.y&&light.y-light.r<cam.y+H)environmentalLight(light.x,light.y,light.r,light.c);
 }
 ctx.restore();
}
// V7: bounded gameplay-linked local lights. The WebGL actor layer remains a
// separate GPU canvas; its original CSS overlay still receives no touch input.
function frontierLocalLights(player,enemies){
 if(!player)return;
 function glow(x,y,r,base,outer){
  const g=ctx.createRadialGradient(x,y,2,x,y,r);
  g.addColorStop(0,base);g.addColorStop(.52,outer);g.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=g;ctx.fillRect(x-r,y-r,2*r,2*r);
 }
 ctx.save();ctx.globalCompositeOperation='screen';
 glow(player.x,player.y+12,130,'rgba(22,181,215,.20)','rgba(5,74,120,.065)');
 let active=0;const max=W<650?7:14;
 for(const e of enemies){
  if(active>=max)break;
  if(Math.abs(e.x-player.x)>W*.7+80||Math.abs(e.y-player.y)>H*.7+80)continue;
  const pulse=1+.08*Math.sin(frame*.075+e.x*.017);
  const rad=(e.type==='boss'?205:e.type==='brute'?82:e.type==='drone'?65:48)*pulse;
  const inner=e.type==='drone'?'rgba(34,170,220,.22)':e.type==='boss'?'rgba(246,72,26,.25)':'rgba(211,52,55,.15)';
  const edge=e.type==='drone'?'rgba(21,69,120,.05)':'rgba(106,22,20,.055)';
  glow(e.x,e.y,rad,inner,edge);active++;
 }
 ctx.restore();
}
function paintMenuScene(){
 const xx=C.WIDTH/2-W/2, yy=C.HEIGHT/2-H/2;window.FrontierV6?.camera?.(xx,yy);
 ctx.save();ctx.translate(-xx,-yy);paintEnvironment({x:xx,y:yy});
 for(const enemy of [{type:'drone',x:960,y:585,z:67},{type:'runner',x:1450,y:675,z:80},{type:'brute',x:1400,y:995,z:105},{type:'boss',x:1550,y:740,z:252}]){
  drawActor(enemy.type,enemy.x,enemy.y,enemy.z,Math.sin(frame*.009)*.06,1,actorPose(enemy.type,{motion:true,time:frame/60}));
 }
 drawActor('player',1040,895,118,Math.sin(frame*.015)*.04,1,actorPose('player',{motion:frame%280>150,time:frame/60}));
 environmentalLight(1050,897,160,'#27bcd82e');ctx.restore();
}
function arena(){const p=game?.player||{x:C.WIDTH/2,y:C.HEIGHT/2},cam=game?.camera||{x:0,y:0};cam.x=C.clamp(p.x-W/2,0,Math.max(0,C.WIDTH-W));cam.y=C.clamp(p.y-H/2,0,Math.max(0,C.HEIGHT-H));window.FrontierV6?.camera?.(cam.x,cam.y);ctx.save();ctx.translate(-cam.x,-cam.y);paintEnvironment(cam);
 if(game)frontierLocalLights(p,game.enemies);
 if(game){for(const gem of game.gems){ctx.save();ctx.shadowBlur=17;ctx.shadowColor='#64ffe2';drawSprite('gem',gem.x,gem.y+Math.sin(gem.anim*6)*5,26,gem.anim*.6);ctx.restore()}
 for(const bullet of game.bullets){ctx.strokeStyle='#ffb86c99';ctx.lineWidth=4;ctx.shadowBlur=13;ctx.shadowColor='#ffe3aa';ctx.beginPath();ctx.moveTo(bullet.x-bullet.vx*.012,bullet.y-bullet.vy*.012);ctx.lineTo(bullet.x,bullet.y);ctx.stroke()}
 for(const bullet of game.enemyBullets){ctx.save();ctx.shadowBlur=18;ctx.shadowColor='#ff5070';ctx.fillStyle='#fd547b';ctx.beginPath();ctx.arc(bullet.x,bullet.y,bullet.r,0,Math.PI*2);ctx.fill();ctx.restore()}
 for(const fallen of defeated){const scale=fallen.type==='boss'?245:fallen.type==='brute'?112:fallen.type==='runner'?84:90;drawActor(fallen.type,fallen.x,fallen.y,scale,fallen.angle,Math.min(.74,fallen.life/fallen.maxLife),actorPose(fallen.type,{dead:true,time:fallen.maxLife-fallen.life}));}
 for(const enemy of game.enemies){ctx.save();ctx.shadowBlur=enemy.type==='boss'?25:8;ctx.shadowColor=enemy.type==='boss'?'#ff507e':'#fa815588';ctx.translate(enemy.x,enemy.y);/* V7: fixed 3/4 painterly poses, no 360-degree tumbling */ctx.scale(p.x<enemy.x?-1:1,1);ctx.rotate(Math.sin(enemy.anim*5)*.018);let scale=enemy.type==='boss'?245:enemy.type==='brute'?112:enemy.type==='runner'?84:90;const pose=actorPose(enemy.type,{motion:true,firing:(enemy.attackPose||0)>0,hit:enemy.knock>0,time:enemy.anim});drawActor(enemy.type,0,Math.sin(enemy.anim*4)*1.5,scale,0,1,pose);ctx.restore();if(enemy.hp<enemy.maxhp){ctx.fillStyle='#152b38';ctx.fillRect(enemy.x-23,enemy.y-enemy.r-16,46,5);ctx.fillStyle=enemy.type==='boss'?'#fd547b':'#ffac79';ctx.fillRect(enemy.x-23,enemy.y-enemy.r-16,46*enemy.hp/enemy.maxhp,5)}}
 const heroAngle=lastFacing+Math.PI/2;ctx.save();ctx.strokeStyle='#46d6eb88';ctx.lineWidth=3;ctx.shadowColor='#4cdeea';ctx.shadowBlur=14;ctx.beginPath();ctx.ellipse(p.x,p.y+26,41,20,0,0,Math.PI*2);ctx.stroke();ctx.restore();ctx.save();ctx.shadowBlur=12;ctx.shadowColor='#53d9ed';const opacity=p.invuln>0?(.62+Math.sin(frame*.45)*.3):1;heroMotion.pose=actorPose('player',{motion:heroMotion.moving,firing:heroMotion.firing>0,hit:heroMotion.hit>0,time:heroMotion.time});drawActor('player',p.x,p.y,110,heroAngle,opacity,heroMotion.pose);ctx.restore();ctx.save();ctx.translate(p.x,p.y);ctx.rotate(lastFacing);ctx.fillStyle='#fbe7ad';ctx.fillRect(29,-3,12,5);ctx.restore();if(p.dashTime>0){ctx.strokeStyle='#72ffecbb';ctx.lineWidth=4;ctx.beginPath();ctx.arc(p.x,p.y,36,0,Math.PI*2);ctx.stroke()}
 drawCombatFx();for(const e of particles){ctx.globalAlpha=C.clamp(e.l/.55,0,1);ctx.fillStyle=e.color;ctx.fillRect(e.x,e.y,e.size,e.size)}ctx.globalAlpha=1;ctx.font='900 15px system-ui';for(const e of floaters){ctx.globalAlpha=e.life/.6;ctx.fillStyle=e.color;ctx.fillText(e.text,e.x,e.y)}ctx.globalAlpha=1;}
 ctx.restore()}
function render(){window.FrontierV6?.beginFrame?.();ctx.setTransform(DPR,0,0,DPR,0,0);ctx.clearRect(0,0,W,H);ctx.fillStyle='#071725';ctx.fillRect(0,0,W,H);if(mode==='menu'||!game){paintMenuScene();}else{ctx.save();ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);arena();ctx.restore();if(damageFlash>0){ctx.fillStyle='rgba(252,55,81,'+(damageFlash*.24)+')';ctx.fillRect(0,0,W,H)}const g=ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*.2,W/2,H/2,Math.max(W,H)*.79);g.addColorStop(0,'#00000000');g.addColorStop(1,'#000d18aa');ctx.fillStyle=g;ctx.fillRect(0,0,W,H)}window.FrontierV6?.endFrame?.(.016);}
function loop(time){const dt=Math.min(.045,Math.max(0,(time-last)/1000||.016));last=time;frame++;update(dt);render();requestAnimationFrame(loop)}requestAnimationFrame(loop);
window.addEventListener('blur',()=>{if(mode==='running')pause(true)});document.addEventListener('visibilitychange',()=>{if(document.hidden&&mode==='running')pause(true)});
// Test hooks on local HTTP host only: not available in the Yandex production build.
if(['localhost','127.0.0.1'].includes(location.hostname))window.__FRONTIER_QA__={get:()=>({mode,wave:game?.wave,kills:game?.player.kills,score:game?.score,enemies:game?.enemies.length,bosses:game?.enemies.filter(e=>e.type==='boss').length,x:game?.player.x,y:game?.player.y,hp:game?.player.hp,shots:game?.player.shots,visualVersion:7,pixiStatus:window.FrontierV6?.status?.(),playerPose:heroMotion.pose,animatedSpritesReady:['player','drone','runner','brute','boss'].every(n=>actors[n].naturalWidth===Anim.COLUMNS*Anim.FRAME_SIZE&&actors[n].naturalHeight===Anim.ROWS*Anim.FRAME_SIZE),actorFrameCount:Anim.FRAMES,actorAtlasColumns:Anim.COLUMNS,deathEffects:defeated.length,propCount:PROP_DATA.length,terrainReady:!!floor.naturalWidth,fxCount:vfx.length,scars:scars.length,fxAssetsLoaded:['explosion','smoke','muzzle','shockwave','scorch'].every(n=>images[n].naturalWidth>0),bossFrame:game?.enemies.find(e=>e.type==='boss')?actorPose('boss',{motion:true,time:game.enemies.find(e=>e.type==='boss').anim}):null}),triggerExplosion:()=>{if(game)blast(game.player.x+85,game.player.y-55,1.1)},spawnBoss:()=>{if(game){game.wave=3;game.bossSpawned=true;spawnEnemy('boss');const b=game.enemies.find(e=>e.type==='boss');if(b){b.x=C.clamp(game.player.x+175,90,C.WIDTH-90);b.y=C.clamp(game.player.y+68,90,C.HEIGHT-90)}}},killNearest:()=>{if(game?.enemies.length){const e=game.enemies[0];e.hp=0;killEnemy(e);game.enemies=game.enemies.filter(item=>item.hp>0)}},forceUpgrade:()=>{if(game&&mode==='running')showUpgrade(false)},forceWin:()=>{if(game)endGame(true)},clearWave:()=>{if(game&&mode==='running'){game.enemies=[];game.waveTime=99;}},damage:n=>{if(game){game.player.hp-=n;if(game.player.hp<=0)endGame(false)}}};
})();
