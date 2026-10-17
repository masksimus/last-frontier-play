const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');

test('cinematic budgets are explicit and cheaper for coarse-pointer mobile',async()=>{
 const {detailBudget}=await import('../src/cinematic-v9.mjs');
 const phone=detailBudget(true),pc=detailBudget(false);
 for(const key of ['debris','puddles','embers','lights','beams'])assert(phone[key]<pc[key],key);
 assert(phone.maxPixelRatio<=1&&pc.maxPixelRatio<=1.5);
 assert.equal(phone.lights,0);assert(pc.lights<=1&&phone.debris<=60&&phone.puddles<=14);
});

test('deterministic industrial detail avoids central combat lane',async()=>{
 const {seededRandom,chooseDetailPoint}=await import('../src/cinematic-v9.mjs');
 const a=seededRandom(49),b=seededRandom(49);
 for(let i=0;i<350;i++){
  const x=chooseDetailPoint(a),y=chooseDetailPoint(b);
  assert.deepEqual(x,y);
  assert(x.x>=0&&x.x<=44&&x.z>=0&&x.z<=32);
  assert(!(x.x>14&&x.x<30&&x.z>11&&x.z<21),'debris blocks central firing lane');
 }
});

test('actual InstancedMesh geometry and PBR materials exist and dispose safely',async()=>{
 const THREE=await import('three');
 const {createCinematicIndustrial}=await import('../src/cinematic-v9.mjs');
 for(const touch of [true,false]){
  const scene=new THREE.Scene(),fx=createCinematicIndustrial(scene,{touch});
  assert.equal(scene.children.length,1);
  const meshes=fx.group.children.filter(m=>m.isInstancedMesh);
  assert.equal(meshes.length,3);
  const [rubble,puddles,embers]=meshes;
  assert.equal(rubble.count,fx.summary.debris);
  assert.equal(puddles.count,fx.summary.puddles);
  assert.equal(embers.count,fx.summary.embers);
  assert(puddles.material.isMeshStandardMaterial);
  assert(puddles.material.roughness<.3&&puddles.material.metalness>=.2);
  assert.equal(fx.summary.dynamicShadowLights,0);
  assert(fx.summary.geometryBatches<=3);
  assert.equal(fx.group.children.filter(m=>m.isPointLight).length,fx.summary.lights);
  fx.update(.5,false);
  const matrix=embers.instanceMatrix.array;
  assert([...matrix.slice(0,16)].every(Number.isFinite));
  fx.update(1,true);
  fx.dispose();
  assert.equal(scene.children.length,0);
 }
});

test('Three.js scene uses dynamic cinematic layer after static mesh batching',()=>{
 const code=fs.readFileSync(path.join(root,'src/three-layer.mjs'),'utf8');
 const afterMerge=code.indexOf('const cinematic=createCinematicIndustrial(scene,{touch})');
 const afterBatch=code.indexOf('const batches=new Map()');
 assert(afterMerge>afterBatch);
 assert.match(code,/cinematic\.update\(t,state\.quality==='performance'\)/);
 assert.match(code,/detailBudget\(touch\)\.maxPixelRatio/);
});
