const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
test('AEGIS-07 hero is genuine 3D mesh geometry with articulated limbs, not sprite',async()=>{
 const {createAegisHero,animateAegis}=await import('../src/aegis-hero-3d.mjs');
 const hero=createAegisHero();
 assert.equal(hero.name,'AEGIS_07_REAL_3D');
 const meshes=[];hero.traverse(n=>{if(n.isMesh)meshes.push(n)});
 assert(meshes.length>=75, 'expected detailed authored 3D parts, found '+meshes.length);
 assert(meshes.every(m=>m.geometry?.isBufferGeometry),'all visible parts must have mesh geometry');
 assert(meshes.some(m=>m.material.emissiveIntensity>2), 'energy core must emit light');
 assert(meshes.some(m=>m.name==='CYAN_VISOR'), 'approved silhouette helmet visor');
 assert(meshes.some(m=>m.name==='Reactor_Emitter'), 'round chest reactor');
 assert(meshes.some(m=>m.name==='Huge_Armoured_Pauldron'), 'separate angular shoulder guards');
 const THREE=await import('three');const bounds=new THREE.Box3().setFromObject(hero);
 const dimensions=bounds.getSize(new THREE.Vector3());
 assert(dimensions.x>1&&dimensions.y>2&&dimensions.z>.30,'hero must be 3D in x/y/z');
 for(const key of ['torso','head','arms','forearms','legs','shins','feet'])
  assert(hero.userData.pivots[key],'missing 3D joint: '+key);
 assert.equal(hero.userData.pivots.legs.length,2);
 const before=hero.userData.pivots.legs[0].rotation.x;
 animateAegis(hero,{moving:true,speed:3.5},.2,.016);
 assert.notEqual(hero.userData.pivots.legs[0].rotation.x,before,'running must animate the actual 3D leg');
 animateAegis(hero,{firing:true,moving:false,speed:0},.4,.016);
 assert(hero.userData.pivots.arms[0].rotation.x<0,'attacking must animate real 3D arm');
});
test('AEGIS is rendered in original Three + Rapier game; astronaut hidden',()=>{
 const source=fs.readFileSync(path.join(root,'src/three-layer.mjs'),'utf8');
 assert.match(source,/models\.aegis_v11\?.*\.clone\(true\):createAegisHero\(\)/);
 assert.match(source,/obj\.visible=false;root\.add\(aegis\)/);
 assert.match(source,/animateAegis\(a\.aegis/);
 assert.match(source,/state\.aegisMeshCount=total/);
 assert.match(source,/createPhysics\(\)/);
 assert.match(source,/renderer\.render\(scene,camera\)/);
 assert.match(source,/state\.ready=bridge\.ready=true/);
 assert.doesNotMatch(source,/kind==='player'\s*\?\s*new THREE\.Sprite/);
});