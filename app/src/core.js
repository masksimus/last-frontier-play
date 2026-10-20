(function(root,factory){const lib=factory();if(typeof module==='object'&&module.exports)module.exports=lib;root.FrontierCore=lib;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
const WIDTH=2200,HEIGHT=1600,TOTAL_WAVES=10,WAVE_SECONDS=25;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const norm=(x,y)=>{const l=Math.hypot(x,y);return l>0?{x:x/l,y:y/l}:{x:0,y:0}};
const isBossWave=w=>w>0&&w%3===0&&w<=9;
const mobStats={drone:{hp:31,spd:84,r:18,dmg:9,xp:4,score:20},runner:{hp:20,spd:135,r:15,dmg:7,xp:4,score:30},brute:{hp:95,spd:51,r:26,dmg:17,xp:9,score:65},boss:{hp:740,spd:51,r:61,dmg:24,xp:120,score:1200}};
function waveInfo(w){const boss=isBossWave(w);return{wave:w,isBoss:boss,spawnRate:Math.max(.36,1.22-w*.078),duration:WAVE_SECONDS+Math.min(w,6)*2,bossHp:boss?mobStats.boss.hp+(w-3)*170:0};}
function chooseMob(w,rand=Math.random){const r=rand();if(w<2)return 'drone';if(w<4)return r<.24?'runner':'drone';if(w<7)return r<.20?'brute':r<.52?'runner':'drone';return r<.30?'brute':r<.67?'runner':'drone';}
const UPGRADES=[
 {id:'damage',symbol:'✹',title:'РАЗРЫВНЫЕ ПУЛИ',desc:'Урон от выстрела +25%'},
 {id:'rate',symbol:'⚡',title:'ПЕРЕГРУЗКА',desc:'Скорострельность +22%'},
 {id:'speed',symbol:'➤',title:'РЕАКТИВНЫЕ БОТИНКИ',desc:'Скорость движения +15%'},
 {id:'maxhp',symbol:'✚',title:'БРОНЕКОРПУС',desc:'Максимум брони +35 и лечение'},
 {id:'magnet',symbol:'◇',title:'МАГНИТНОЕ ПОЛЕ',desc:'Радиус подбора ресурсов +40%'},
 {id:'multishot',symbol:'✦',title:'ДВОЙНОЙ ЗАЛП',desc:'Дополнительный снаряд'},
 {id:'pierce',symbol:'⇢',title:'ПРОБИТИЕ',desc:'Дополнительная цель для пули'},
 {id:'regen',symbol:'♥',title:'НАНОРЕМОНТ',desc:'Восстановление брони каждые 3 с'}
];
const UPGRADE_CAPS=Object.freeze({shots:5,pierce:4,fireDelay:.13,speed:360,magnet:240});
function canApplyUpgrade(player,id){
 if(!player)return true;
 switch(id){
  case'multishot':return !(player.shots>=UPGRADE_CAPS.shots);
  case'pierce':return !(player.pierce>=UPGRADE_CAPS.pierce);
  case'rate':return !(player.fireDelay<=UPGRADE_CAPS.fireDelay);
  case'speed':return !(player.speed>=UPGRADE_CAPS.speed);
  case'magnet':return !(player.magnet>=UPGRADE_CAPS.magnet);
  default:return true;
 }
}
// Existing sampleUpgrades(random, count) callers remain valid. Passing a player
// as the first argument, or as the third argument, hides exhausted upgrades.
function sampleUpgrades(rand=Math.random,count=3,player=null){
 if(typeof rand!=='function'){player=rand||player;rand=Math.random;}
 if(count&&typeof count==='object'){player=count;count=3;}
 const arr=UPGRADES.filter(upgrade=>canApplyUpgrade(player,upgrade.id));
 for(let i=arr.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}
 return arr.slice(0,Math.max(0,Math.floor(count)));
}
function applyUpgrade(player,id){switch(id){case'damage':player.damage*=1.25;break;case'rate':player.fireDelay=Math.max(UPGRADE_CAPS.fireDelay,player.fireDelay/1.22);break;case'speed':player.speed=Math.min(UPGRADE_CAPS.speed,player.speed*1.15);break;case'maxhp':player.maxhp+=35;player.hp=Math.min(player.maxhp,player.hp+55);break;case'magnet':player.magnet=Math.min(UPGRADE_CAPS.magnet,player.magnet*1.40);break;case'multishot':player.shots=Math.min(UPGRADE_CAPS.shots,player.shots+1);break;case'pierce':player.pierce=Math.min(UPGRADE_CAPS.pierce,player.pierce+1);break;case'regen':player.regen+=2;break;default:throw Error('Unknown upgrade '+id)}return player}
function newPlayer(){return{x:WIDTH/2,y:HEIGHT/2,hp:100,maxhp:100,r:19,speed:205,damage:24,fireDelay:.43,fireTimer:0,shots:1,pierce:0,magnet:68,regen:0,regenTimer:0,invuln:0,dashCd:0,dashTime:0,dashX:0,dashY:0,level:1,xp:0,xpNeed:28,score:0,kills:0};}
function collision(a,b){return distance(a,b)<a.r+b.r}
function sweptCollision(projectile,target){
 // Closest point on this frame's motion segment catches fast projectiles that
 // pass through a small enemy between two rendered frames.
 const startX=Number.isFinite(projectile.prevX)?projectile.prevX:projectile.x;
 const startY=Number.isFinite(projectile.prevY)?projectile.prevY:projectile.y;
 const dx=projectile.x-startX,dy=projectile.y-startY,len2=dx*dx+dy*dy;
 const t=len2?clamp(((target.x-startX)*dx+(target.y-startY)*dy)/len2,0,1):0;
 const x=startX+dx*t-target.x,y=startY+dy*t-target.y;
 return x*x+y*y<(projectile.r+target.r)**2;
}
function advanceProjectile(projectile,dt){
 const step=Math.min(clamp(dt,0,.05),Math.max(0,projectile.ttl));
 projectile.prevX=projectile.x;projectile.prevY=projectile.y;
 projectile.x+=projectile.vx*step;projectile.y+=projectile.vy*step;
 projectile.ttl=Math.max(0,projectile.ttl-step);
 return projectile;
}
function bulletHit(bullet,enemy){if(bullet.pierce<0||enemy.hp<=0||!sweptCollision(bullet,enemy))return false;if(!bullet.hit)bullet.hit=[];if(bullet.hit.includes(enemy.id))return false;bullet.hit.push(enemy.id);enemy.hp-=bullet.damage;bullet.pierce=(bullet.pierce||0)-1;return true}
function advancePlayer(player,input,dt){
 dt=clamp(dt,0,.05);
 const n=norm(input.x,input.y),storedDash=norm(player.dashX||0,player.dashY||0);
 const dashDir=storedDash.x||storedDash.y?storedDash:n;
 const dashDt=Math.min(dt,Math.max(0,player.dashTime)),walkDt=dt-dashDt;
 player.x=clamp(player.x+player.speed*(dashDir.x*3.5*dashDt+n.x*walkDt),45,WIDTH-45);
 player.y=clamp(player.y+player.speed*(dashDir.y*3.5*dashDt+n.y*walkDt),45,HEIGHT-45);
 player.dashCd=Math.max(0,player.dashCd-dt);player.dashTime=Math.max(0,player.dashTime-dt);
 if(player.dashTime===0){player.dashX=0;player.dashY=0;}
 player.invuln=Math.max(0,player.invuln-dt);player.fireTimer=Math.max(0,player.fireTimer-dt);
}
return{WIDTH,HEIGHT,TOTAL_WAVES,WAVE_SECONDS,clamp,norm,distance,collision,sweptCollision,advanceProjectile,mobStats,waveInfo,chooseMob,isBossWave,sampleUpgrades,canApplyUpgrade,applyUpgrade,newPlayer,bulletHit,advancePlayer,UPGRADES,UPGRADE_CAPS};});
