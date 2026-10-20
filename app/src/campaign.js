/* Campaign rules and validated checkpoints. No DOM, renderer or network dependency. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.FrontierCampaign=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
const SAVE_KEY='frontier_campaign_v1';
const DIFFICULTIES=Object.freeze({story:{name:'СЮЖЕТ',damage:.6,hp:.8,spawn:1.2},standard:{name:'БОЕВОЙ',damage:1,hp:1,spawn:1},veteran:{name:'ВЕТЕРАН',damage:1.3,hp:1.2,spawn:.85}});
const SECTORS=Object.freeze([
 {id:'perimeter',name:'ПЕРИМЕТР',code:'A–07',first:1,last:3,color:'#66e9de',ground:'#18302e',boss:'СТРАЖ ПЕРИМЕТРА',brief:'Рой отключил внешнюю оборону. Восстанови два реле: удерживай круг каждого 5 секунд, затем уничтожь Стража на третьей волне.',relays:[{x:530,y:480},{x:1700,y:1130}],spawn:{x:1100,y:800},unlock:'shotgun'},
 {id:'foundry',name:'ЛИТЕЙНЫЙ ЦЕХ',code:'F–12',first:4,last:6,color:'#ffb16b',ground:'#39281e',boss:'ГОРНИЛО',brief:'За защитным кольцом работает завод Роя. Отключи два контура управления и уничтожь Горнило. Доступен рельсотрон для пробития тяжёлой брони.',relays:[{x:480,y:1110},{x:1710,y:470}],spawn:{x:1100,y:800},unlock:'railgun'},
 {id:'uplink',name:'УЗЕЛ «ЗАРЯ»',code:'Z–01',first:7,last:10,color:'#ba9bff',ground:'#29213b',boss:'АРХИТЕКТОР РОЯ',brief:'Подними два передатчика, уничтожь Архитектора и отрази последнюю волну. Когда сектор очищен, доберись до зоны эвакуации в центре северной границы. Плазмомёт доступен.',relays:[{x:500,y:500},{x:1690,y:1050}],spawn:{x:1100,y:800},unlock:'plasma'}
]);
function sectorIndex(wave){return wave<=3?0:wave<=6?1:2}
function sectorFor(wave){return SECTORS[sectorIndex(wave)]}
function unlockedWeapons(wave){return wave<=3?['rifle','shotgun']:wave<=6?['rifle','shotgun','railgun']:['rifle','shotgun','railgun','plasma']}
function newObjectives(){return [0,0]}
function tickObjectives(progress,player,relays,dt){const before=progress.filter(x=>x>=5).length;const next=progress.map((t,i)=>Math.min(5,t+(Math.hypot(player.x-relays[i].x,player.y-relays[i].y)<=92?Math.max(0,Math.min(.05,dt)):0)));return {progress:next,completed:next.filter(x=>x>=5).length-before}}
function objectivesComplete(progress){return progress.length===2&&progress.every(t=>t>=5)}
function spawnPoint(player,width,height,viewWidth,viewHeight,boss=false,rand=Math.random){
 const margin=65,minDistance=boss?260:Math.min(550,Math.max(310,Math.min(viewWidth,viewHeight)*.58));
 let best={x:margin,y:margin},bestScore=-Infinity;
 for(let i=0;i<32;i++){
  const a=rand()*Math.PI*2,r=boss?360:Math.max(viewWidth,viewHeight)*.55+140;
  const p={x:Math.max(margin,Math.min(width-margin,player.x+Math.cos(a)*r)),y:Math.max(margin,Math.min(height-margin,player.y+Math.sin(a)*r))};
  const distance=Math.hypot(p.x-player.x,p.y-player.y);
  const outside=Math.abs(p.x-player.x)>viewWidth*.5+35||Math.abs(p.y-player.y)>viewHeight*.5+35;
  const score=distance+(outside?200:0);if(score>bestScore){best=p;bestScore=score}
  if(distance>=minDistance&&(outside||boss))return p;
 }
 if(Math.hypot(best.x-player.x,best.y-player.y)<minDistance){
  const corners=[{x:margin,y:margin},{x:width-margin,y:margin},{x:margin,y:height-margin},{x:width-margin,y:height-margin}];
  best=corners.reduce((a,b)=>Math.hypot(a.x-player.x,a.y-player.y)>Math.hypot(b.x-player.x,b.y-player.y)?a:b);
 }
 return best;
}
const PLAYER_LIMITS={hp:[1,10000],maxhp:[100,10000],speed:[100,600],damage:[1,10000],fireDelay:[.13,2],shots:[1,5],pierce:[0,4],magnet:[1,400],regen:[0,100],level:[1,1000],xp:[0,1e9],xpNeed:[1,1e9],kills:[0,1e7],score:[0,1e9]};
function makeCheckpoint(game){const player={};for(const key of Object.keys(PLAYER_LIMITS))player[key]=game.player[key];return {version:1,wave:sectorFor(game.wave).first,difficulty:game.difficulty,weapon:game.weapon,score:game.score,time:game.time,player}}
function parseCheckpoint(raw){
 try{const d=typeof raw==='string'?JSON.parse(raw):raw;if(!d||d.version!==1||![1,4,7].includes(d.wave)||!Object.hasOwn(DIFFICULTIES,d.difficulty)||!d.player||typeof d.player!=='object')return null;
  if(!Number.isFinite(d.score)||d.score<0||d.score>1e9||!Number.isFinite(d.time)||d.time<0||d.time>1e7)return null;
  const player={};for(const [key,[low,high]] of Object.entries(PLAYER_LIMITS)){const v=d.player[key];if(!Number.isFinite(v)||v<low||v>high)return null;player[key]=v}
  if(player.hp>player.maxhp||!unlockedWeapons(d.wave).includes(d.weapon))return null;
  return {version:1,wave:d.wave,difficulty:d.difficulty,weapon:d.weapon,score:d.score,time:d.time,player};
 }catch{return null}
}
return {SAVE_KEY,DIFFICULTIES,SECTORS,sectorIndex,sectorFor,unlockedWeapons,newObjectives,tickObjectives,objectivesComplete,spawnPoint,makeCheckpoint,parseCheckpoint};
});
