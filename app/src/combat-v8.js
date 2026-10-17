/* V8: deterministic weapon modes and boss attacks, browser + Node. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.FrontierCombatV8=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
const ORDER=Object.freeze(['rifle','shotgun','railgun']);
const WEAPONS=Object.freeze({
 rifle:Object.freeze({name:'ШТУРМОВАЯ ВИНТОВКА',ratio:1,color:'#ffcf83',label:'АВТО'}),
 shotgun:Object.freeze({name:'ДРОБОВИК',ratio:2.2,color:'#ff9362',label:'ДРОБЬ'}),
 railgun:Object.freeze({name:'РЕЛЬСОТРОН',ratio:2.8,color:'#6befff',label:'ПРОБОЙ'})
});
function nextWeapon(current){return ORDER[(Math.max(0,ORDER.indexOf(current))+1)%ORDER.length]}
function makeVolley(weapon,p,angle){
 const w=WEAPONS[weapon]||WEAPONS.rifle;
 const count=weapon==='shotgun'?5+(p.shots-1):weapon==='railgun'?1:p.shots;
 const shot=[];
 for(let i=0;i<count;i++){
   const spread=weapon==='shotgun'?.14:weapon==='railgun'?0:.13;
   const a=angle+(i-(count-1)/2)*spread,dx=Math.cos(a),dy=Math.sin(a);
   const speed=weapon==='railgun'?950:weapon==='shotgun'?660:690;
   shot.push({x:p.x+dx*28,y:p.y+dy*28,r:weapon==='railgun'?7:weapon==='shotgun'?4.5:4,
      vx:dx*speed,vy:dy*speed,ttl:weapon==='shotgun'?.45:weapon==='railgun'?1.25:1.1,
      damage:p.damage*(weapon==='shotgun'?.43:weapon==='railgun'?2.9:1),
      pierce:p.pierce+(weapon==='railgun'?4:0),hit:[],color:w.color,weapon});
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
return Object.freeze({ORDER,WEAPONS,nextWeapon,makeVolley,bossVolley,bossPhase});
});
