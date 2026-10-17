const {test}=require('node:test');const assert=require('node:assert/strict');
async function rig(kind='player'){
 const THREE=await import('three');const {createActorAnimation}=await import('../src/actor-animation-v9.mjs');
 const root=new THREE.Object3D(), mixer=new THREE.AnimationMixer(root),actions={};
 for(const name of ['Idle_Gun','Run_Gun','Run_Gun_Shoot','Walk','Idle','HitReact','HitRecieve_1','Death','Shoot_Big']){
  const clip=new THREE.AnimationClip(name,.6,[new THREE.NumberKeyframeTrack('.position[y]',[0,.6],[0,1])]);actions[name]=mixer.clipAction(clip);
 }
 return {controller:createActorAnimation(mixer,actions,kind),actions};
}
test('short damage flag plays the complete hit reaction; death overrides it and clamps',async()=>{
 const {controller:c,actions}=await rig();c.update({moving:true},.02);c.update({moving:true,hit:true},.02);
 for(let i=0;i<8;i++)c.update({moving:true},.02);assert.equal(c.status().clip,'HitReact');
 c.update({dead:true},.02);for(let i=0;i<50;i++)c.update({moving:true},.02);
 assert.equal(c.status().clip,'Death');assert.equal(c.status().dead,true);assert(actions.Death.paused);assert.equal(actions.Death.time,.6);
});
test('pool reset clears death lock, locomotion follows aim and pause freezes mixer',async()=>{
 const {controller:c,actions}=await rig();c.update({dead:true},.02);c.reset();c.update({moving:true,firing:true,reverse:true,speed:3.8},.03);
 assert.equal(c.status().clip,'Run_Gun_Shoot');assert(actions.Run_Gun_Shoot.timeScale<0);
 const before=actions.Run_Gun_Shoot.time;c.update({moving:true,firing:true,reverse:true},0);assert.equal(actions.Run_Gun_Shoot.time,before);assert.equal(c.status().dead,false);
});
test('boss attack survives its trigger and returns to walk after the authored duration',async()=>{
 const {controller:c}=await rig('boss');c.update({moving:true,firing:true},.02);
 for(let i=0;i<8;i++)c.update({moving:true},.02);assert.equal(c.status().clip,'Shoot_Big');
 for(let i=0;i<25;i++)c.update({moving:true},.02);assert.equal(c.status().clip,'Walk');
});
test('turn smoothing takes the shortest path across the angle boundary',async()=>{
 const {dampAngle}=await import('../src/actor-animation-v9.mjs');const a=dampAngle(Math.PI-.01,-Math.PI+.01,.016);
 assert(a>Math.PI-.01&&a<Math.PI+.01);assert.equal(dampAngle(1,2,0),1);
});
