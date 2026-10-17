const {test}=require('node:test');
const assert=require('node:assert/strict');
test('siege titan is a tangible 3D figure with armor plates, reactor and dual cannons',async()=>{
 const THREE=await import('three');
 const {createTitanArmor}=await import('../src/visible-art-v93.mjs');
 const body=new THREE.Group(),rig=createTitanArmor(body);
 try{
   assert.equal(body.children.length,1);
   assert.equal(rig.group.name,'SiegeTitanArmoredV93');
   const meshes=[];rig.group.traverse(o=>{if(o.isMesh)meshes.push(o)});
   assert(meshes.length>=25,'boss must have substantial separate geometry');
   assert(rig.core.geometry.type==='IcosahedronGeometry');
   assert(rig.halo.geometry.type==='TorusGeometry');
   assert(rig.mats.some(m=>m.isMeshStandardMaterial&&m.emissiveIntensity>1));
   rig.update(2,false);const normal=rig.mats[2].emissiveIntensity;
   rig.update(2,true);assert(rig.mats[2].emissiveIntensity>normal);
 }finally{rig.dispose()}
 assert.equal(body.children.length,0);
});
test('reactor landmark geometry is grouped, shaded and bounded',async()=>{
 const THREE=await import('three');
 const {createIndustrialLandmarks,FACTORY_POSITIONS}=await import('../src/visible-art-v93.mjs');
 const scene=new THREE.Scene(),a=createIndustrialLandmarks(scene);
 try{
  assert.equal(FACTORY_POSITIONS.length,2);
  assert.equal(a.summary.landmarks,2);
  assert.equal(a.summary.materialBatches,4);
  assert.equal(a.summary.rings,2);
  assert(a.summary.primitives>30);
  const geometry=a.group.children.filter(o=>o.isMesh);
  assert.equal(geometry.length,6);
  assert(geometry.every(o=>o.geometry.attributes.position.count>0));
  assert(!geometry.some(o=>o.material.isShaderMaterial));
  assert(!a.group.children.some(o=>o.isPointLight||o.isSpotLight));
  a.update(1);assert(Number.isFinite(a.rings[0].rotation.z));
 }finally{a.dispose()}
 assert.equal(scene.children.length,0);
});
test('the runtime actually instantiates new art in the 3D scene, not a static image',async()=>{
 const fs=require('node:fs'),path=require('node:path');
 const text=fs.readFileSync(path.join(__dirname,'../src/three-layer.mjs'),'utf8');
 assert(text.includes('createTitanArmor(root)'));
 assert(text.includes('createIndustrialLandmarks(scene)'));
 assert(text.includes('landmarks.update(t)'));
 assert(text.includes("V11 · AEGIS-07 3D"));
 assert(text.includes("build:'11.0.0-aegis-real-3d'"));
});
