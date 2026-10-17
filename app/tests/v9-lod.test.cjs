const {test}=require('node:test');
const assert=require('node:assert/strict');

test('LOD keeps all bosses and nearest live enemies in animated GLB budget',async()=>{
 const {selectDetailedActors,LOD_BUDGETS}=await import('../src/actor-lod-v9.mjs');
 const hero={x:1000,y:800};
 const actors=Array.from({length:50},(_,i)=>({id:i+1,type:'runner',x:1000+(i+1)*3,y:800}));
 actors[49].type='boss';
 const desktop=selectDetailedActors(actors,hero,false,false);
 const phone=selectDetailedActors(actors,hero,true,false);
 assert(desktop.has(actors[49].id));
 assert(phone.has(actors[49].id));
 assert(desktop.size<=LOD_BUDGETS.desktop.normal);
 assert(phone.size<=LOD_BUDGETS.touch.normal);
 assert(desktop.has(1)&&phone.has(1));
 assert(selectDetailedActors(actors,hero,true,true).size<=LOD_BUDGETS.touch.performance);
 assert.equal(actors.length,50,'Selection must not mutate game simulation');
});

test('real instanced 3D LOD has bounded triangles/draw calls for heavy crowds',async()=>{
 const THREE=await import('three');
 const {createActorLOD}=await import('../src/actor-lod-v9.mjs');
 const scene=new THREE.Scene(),lod=createActorLOD(scene,{capacity:96});
 try{
  assert.equal(scene.children.length,4);
  assert(Object.values(lod.meshes).every(m=>m.isInstancedMesh&&!m.castShadow));
  const hero={x:1100,y:800};
  const enemies=Array.from({length:68},(_,i)=>({id:i+1,type:['drone','runner','brute'][i%3],x:300+i*12,y:250+i*9}));
  assert.equal(lod.draw(enemies,hero),enemies.length);
  assert.equal(Object.values(lod.counts).reduce((a,b)=>a+b,0),enemies.length);
  for(const mesh of Object.values(lod.meshes)){
   assert(mesh.count<=96);
   const g=mesh.geometry;
   const faces=(g.index?.count||g.attributes.position.count)/3;
   assert(faces>50&&faces<1000,'LOD must be actual but lightweight geometry');
  }
  assert.equal(lod.draw([],hero),0);
  assert(Object.values(lod.meshes).every(m=>m.count===0),'Old enemies must not remain visible');
 }finally{lod.dispose()}
 assert.equal(scene.children.length,0);
});

test('renderer uses LOD only for enemies and retains gameplay simulation',async()=>{
 const fs=require('node:fs');
 const p=require('node:path');
 const src=fs.readFileSync(p.join(__dirname,'../src/three-layer.mjs'),'utf8');
 assert.match(src,/selectDetailedActors\(visible,p,touch,state\.quality==='performance'\)/);
 assert.match(src,/actorLOD\.draw\(lower,p\)/);
 assert.match(src,/state\.lodActors=/);
 assert.match(src,/if\(detailed\.has\(e\.id\)\)actor\(/);
});
