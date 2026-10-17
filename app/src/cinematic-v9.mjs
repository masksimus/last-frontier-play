// V9.2: budgeted, actual 3D industrial dressing (not a flat concept-art background).
// Uses Three.js instancing for geometry, keeps visual details out of Rapier gameplay collisions.
import * as THREE from 'three';

export const DETAIL_BUDGETS=Object.freeze({
  touch:Object.freeze({debris:60,puddles:14,embers:20,lights:0,beams:2,maxPixelRatio:1}),
  desktop:Object.freeze({debris:130,puddles:30,embers:40,lights:1,beams:3,maxPixelRatio:1.25}),
});
export function detailBudget(isTouch){return DETAIL_BUDGETS[isTouch?'touch':'desktop'];}
export function seededRandom(seed=7717){
  let state=seed>>>0;
  return ()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296;};
}
export function chooseDetailPoint(rand,area={w:44,h:32}){
  // Keep center spawn / player lanes readable, especially at low screen widths.
  for(let tries=0;tries<16;tries++){
    const x=1.4+rand()*(area.w-2.8),z=1.4+rand()*(area.h-2.8);
    if(x>14&&x<30&&z>11&&z<21)continue;
    return {x,z};
  }
  return {x:2+rand()*6,z:3+rand()*5};
}
const BEACONS=Object.freeze([
  {x:10,z:9,color:0xffa34d},{x:32,z:9,color:0x48bfff},
  {x:7,z:26,color:0xffa34d},{x:36,z:26,color:0x69b9ff},
  {x:13,z:6,color:0xffa34d},{x:31,z:25,color:0xffa34d}
]);

export function createCinematicIndustrial(scene,{touch=false,seed=7717}={}){
  const budget=detailBudget(touch),random=seededRandom(seed),group=new THREE.Group();
  group.name='IndustrialCinematicV9_2';
  scene.add(group);
  const dummy=new THREE.Object3D();
  function submit(mesh,index,x,y,z,sx,sy,sz,rot=0){
    dummy.position.set(x,y,z);dummy.rotation.set(0,rot,0);dummy.scale.set(sx,sy,sz);dummy.updateMatrix();
    mesh.setMatrixAt(index,dummy.matrix);
  }
  // Real low-poly fragments: geometry is batched into ONE draw call.
  // Dynamic physics uses existing Rapier cover colliders, not decorative shards.
  const rubbleGeometry=new THREE.TetrahedronGeometry(1,0);
  const rubbleMaterial=new THREE.MeshStandardMaterial({
    color:0x53616a,roughness:.86,metalness:.3,flatShading:true
  });
  const rubble=new THREE.InstancedMesh(rubbleGeometry,rubbleMaterial,budget.debris);
  rubble.name='IndustrialRubbleInstanced';rubble.castShadow=false;rubble.receiveShadow=true;
  const rubbleColors=[0x4d5a66,0x273943,0x77644d,0x61544d,0x39434c].map(v=>new THREE.Color(v));
  for(let i=0;i<budget.debris;i++){
    const {x,z}=chooseDetailPoint(random),size=.07+random()*.17;
    submit(rubble,i,x,.03,z,size,.035+random()*.05,size,random()*Math.PI*2);
    rubble.setColorAt(i,rubbleColors[Math.floor(random()*rubbleColors.length)]);
  }
  rubble.instanceMatrix.needsUpdate=true;rubble.instanceColor.needsUpdate=true;
  rubble.frustumCulled=false;group.add(rubble);

  // Real wet ground meshes with standard physically based metalness/roughness.
  // Clearcoat and transparent physical reflection were too costly in SwiftShader.
  const puddleGeom=new THREE.CircleGeometry(1,14);
  const puddleMat=new THREE.MeshStandardMaterial({
    color:0x344a5b,metalness:.22,roughness:.22,
    transparent:true,opacity:.4,depthWrite:false,side:THREE.DoubleSide
  });
  const puddles=new THREE.InstancedMesh(puddleGeom,puddleMat,budget.puddles);
  puddles.name='WetConcretePuddles';puddles.castShadow=false;
  for(let i=0;i<budget.puddles;i++){
    const {x,z}=chooseDetailPoint(random);
    const a=.18+random()*.55,b=.07+random()*.25;
    dummy.position.set(x,.012,z);dummy.rotation.set(-Math.PI/2,0,random()*Math.PI);
    dummy.scale.set(a,b,1);dummy.updateMatrix();puddles.setMatrixAt(i,dummy.matrix);
  }
  puddles.instanceMatrix.needsUpdate=true;
  puddles.frustumCulled=false;group.add(puddles);

  // Localized industrial floodlights without real-time spotlight shadow passes.
  // 2 on touch, 3 on desktop; emissive fixture + cone mesh mimics atmospheric fog.
  const beamGeometry=new THREE.ConeGeometry(1,1,12,1,true);
  const fixtureGeometry=new THREE.SphereGeometry(.16,10,6);
  const lamps=[];
  const beams=[];
  for(let i=0;i<budget.beams;i++){
    const p=BEACONS[i],color=new THREE.Color(p.color);
    const bulb=new THREE.Mesh(fixtureGeometry,new THREE.MeshBasicMaterial({color, toneMapped:false}));
    bulb.position.set(p.x,5.05,p.z);
    group.add(bulb);
    if(i<budget.lights){
      const light=new THREE.PointLight(color,1.4,5.5,2);
      light.position.copy(bulb.position);light.castShadow=false;
      group.add(light);lamps.push({light,phase:i*1.71});
    }
  }
  for(let i=0;i<budget.beams;i++){
    const p=BEACONS[i],beam=new THREE.Mesh(beamGeometry,new THREE.MeshBasicMaterial({
      color:p.color,transparent:true,opacity:touch?.023:.028,
      blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide
    }));
    beam.position.set(p.x,2.5,p.z);beam.scale.set(1.45,4.5,1.45);
    beam.renderOrder=1;group.add(beam);beams.push(beam);
  }

  // Instanced embers near the amber fixtures, animated at a fixed, bounded cost.
  const emberGeometry=new THREE.OctahedronGeometry(.045,0);
  const emberMaterial=new THREE.MeshBasicMaterial({
    color:0xffa45b,transparent:true,opacity:.76,
    depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false
  });
  const embers=new THREE.InstancedMesh(emberGeometry,emberMaterial,budget.embers);
  embers.name='AnimatedIndustrialEmbers';embers.frustumCulled=false;
  const origin=Array.from({length:budget.embers},(_,i)=>{
    const p=BEACONS[(i*3+Math.floor(random()*3))%budget.beams];
    return {x:p.x+(random()-.5)*2.4,z:p.z+(random()-.5)*1.9,
      offset:random(),speed:.15+random()*.3,phase:random()*6.28};
  });
  group.add(embers);
  let lastBucket=-1,lastPerf=null;
  function update(time,performance=false){
    if(lastPerf!==performance){
      lastPerf=performance;
      // Optional graphics are disabled before the fallback canvas is needed.
      for(const beam of beams)beam.visible=!performance;
      puddles.visible=!performance;
    }
    const cadence=performance?12:24,bucket=Math.floor(time*cadence);
    if(bucket===lastBucket)return;
    lastBucket=bucket;
    for(let i=0;i<origin.length;i++){
      const p=origin[i],travel=(time*p.speed+p.offset)%1;
      submit(embers,i,p.x+Math.sin(time*.9+p.phase)*.15,
        .18+travel*2.5,p.z+Math.cos(time*.8+p.phase)*.1,
        .4+travel*.7,.5+travel*.7,.4+travel*.7);
    }
    embers.instanceMatrix.needsUpdate=true;
    for(const lamp of lamps)lamp.light.intensity=performance?0:1.4+
      .12*Math.sin(time*4.5+lamp.phase);
  }
  function dispose(){
    group.removeFromParent();
    rubbleGeometry.dispose();rubbleMaterial.dispose();puddleGeom.dispose();puddleMat.dispose();
    beamGeometry.dispose();fixtureGeometry.dispose();emberGeometry.dispose();emberMaterial.dispose();
    for(const o of group.children){if(o.material&&![
      rubbleMaterial,puddleMat,emberMaterial
    ].includes(o.material))o.material.dispose();}
  }
  const summary=Object.freeze({
    mode:touch?'touch':'desktop',debris:budget.debris,puddles:budget.puddles,
    embers:budget.embers,beams:budget.beams,lights:budget.lights,
    geometryBatches:3,dynamicShadowLights:0
  });
  return {group,summary,update,dispose};
}
