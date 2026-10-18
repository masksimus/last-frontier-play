/* V8: deterministic weapon modes and boss attacks, browser + Node. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.FrontierCombatV8=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
const ORDER=Object.freeze(['rifle','shotgun','railgun','plasma']);
const WEAPONS=Object.freeze({
 rifle:Object.freeze({name:'ШТУРМОВАЯ ВИНТОВКА',ratio:1,color:'#ffcf83',label:'АВТО',speed:690,ttl:1.1,range:759,radius:4,spread:.13,damage:1,extraPierce:0,splash:0}),
 shotgun:Object.freeze({name:'ДРОБОВИК',ratio:2.2,color:'#ff9362',label:'ДРОБЬ',speed:660,ttl:.45,range:297,radius:4.5,spread:.14,damage:.43,extraPierce:0,splash:0}),
 railgun:Object.freeze({name:'РЕЛЬСОТРОН',ratio:2.8,color:'#6befff',label:'ПРОБОЙ',speed:950,ttl:1.25,range:1187.5,radius:7,spread:0,damage:2.9,extraPierce:4,splash:0}),
 plasma:Object.freeze({name:'ПЛАЗМОМЁТ',ratio:1.5,color:'#83edff',glow:'#ac7aff',label:'ПЛАЗМА',speed:480,ttl:1.15,range:552,radius:9,spread:.16,damage:1.35,extraPierce:0,splash:76})
});
function nextWeapon(current){return ORDER[(Math.max(0,ORDER.indexOf(current))+1)%ORDER.length]}
function weaponRange(weapon){return (WEAPONS[weapon]||WEAPONS.rifle).range;}
function shotReach(shot){return Math.max(0,shot.ttl)*Math.hypot(shot.vx,shot.vy);}
function inRange(weapon,source,target){
 // Range begins at the muzzle. The enemy's collision radius counts, while
 // splash radius does not: a projectile still needs to reach its first target.
 const w=WEAPONS[weapon]||WEAPONS.rifle;
 return Math.hypot(target.x-source.x,target.y-source.y)<=w.range+28+w.radius+(target.r||0);
}
function makeVolley(weapon,p,angle){
 if(!WEAPONS[weapon])weapon='rifle';
 const w=WEAPONS[weapon];
 const count=weapon==='shotgun'?5+(p.shots-1):weapon==='railgun'?1:p.shots;
 const shot=[];
 for(let i=0;i<count;i++){
   const a=angle+(i-(count-1)/2)*w.spread,dx=Math.cos(a),dy=Math.sin(a);
   shot.push({x:p.x+dx*28,y:p.y+dy*28,r:w.radius,
      vx:dx*w.speed,vy:dy*w.speed,ttl:w.ttl,
      damage:p.damage*w.damage,
      pierce:weapon==='plasma'?0:p.pierce+w.extraPierce,
      hit:[],color:w.color,glow:w.glow||w.color,splash:w.splash,weapon});
 }
 return {bullets:shot,delay:p.fireDelay*w.ratio};
}
function bossVolley(boss,player,phase='fan'){
 const center=Math.atan2(player.y-boss.y,player.x-boss.x);
 const shots=[],ang=phase==='ring'?12:5;
 for(let i=0;i<ang;i++){
   const a=phase==='ring'?Math.PI*2*i/ang+(boss.anim||0)*.8:center+(i-2)*.22;
   shots.push({x:boss.x,y:boss.y,vx:Math.cos(a)*(phase==='ring'?235:195),
    vy:Math.sin(a)*(phase==='ring'?235:195),r:phase==='ring'?7:9,
    ttl:phase==='ring'?3.2:4,damage:phase==='ring'?12:14,color:phase==='ring'?'#ffb657':'#fd547b'});
 }
 return shots;
}
function bossPhase(hp,maxhp){return hp>0&&hp<=maxhp*.5?'enraged':'normal'}
return Object.freeze({ORDER,WEAPONS,nextWeapon,makeVolley,weaponRange,shotReach,inRange,bossVolley,bossPhase});
});
