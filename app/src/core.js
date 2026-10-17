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
function sampleUpgrades(rand=Math.random,count=3){const arr=UPGRADES.slice();for(let i=arr.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]]}return arr.slice(0,count)}
function applyUpgrade(player,id){switch(id){case'damage':player.damage*=1.25;break;case'rate':player.fireDelay=Math.max(.13,player.fireDelay/1.22);break;case'speed':player.speed*=1.15;break;case'maxhp':player.maxhp+=35;player.hp=Math.min(player.maxhp,player.hp+55);break;case'magnet':player.magnet*=1.40;break;case'multishot':player.shots=Math.min(5,player.shots+1);break;case'pierce':player.pierce=Math.min(4,player.pierce+1);break;case'regen':player.regen+=2;break;default:throw Error('Unknown upgrade '+id)}return player}
function newPlayer(){return{x:WIDTH/2,y:HEIGHT/2,hp:100,maxhp:100,r:19,speed:205,damage:24,fireDelay:.43,fireTimer:0,shots:1,pierce:0,magnet:68,regen:0,regenTimer:0,invuln:0,dashCd:0,dashTime:0,dashX:0,dashY:0,level:1,xp:0,xpNeed:28,score:0,kills:0};}
function collision(a,b){return distance(a,b)<a.r+b.r}
function bulletHit(bullet,enemy){if(!collision(bullet,enemy))return false;if(!bullet.hit)bullet.hit=[];if(bullet.hit.includes(enemy.id))return false;bullet.hit.push(enemy.id);enemy.hp-=bullet.damage;bullet.pierce--;return true}
function advancePlayer(player,input,dt){dt=clamp(dt,0,.05);const n=norm(input.x,input.y);const speed=player.speed*(player.dashTime>0?3.5:1);player.x=clamp(player.x+n.x*speed*dt,45,WIDTH-45);player.y=clamp(player.y+n.y*speed*dt,45,HEIGHT-45);player.dashCd=Math.max(0,player.dashCd-dt);player.dashTime=Math.max(0,player.dashTime-dt);player.invuln=Math.max(0,player.invuln-dt);player.fireTimer=Math.max(0,player.fireTimer-dt);}
return{WIDTH,HEIGHT,TOTAL_WAVES,WAVE_SECONDS,clamp,norm,distance,collision,mobStats,waveInfo,chooseMob,isBossWave,sampleUpgrades,applyUpgrade,newPlayer,bulletHit,advancePlayer,UPGRADES};});
