// GPU instanced low-poly enemy LOD for dense encounters.
// Gameplay stays in the authoritative V8+Rapier simulation.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { UNIT } from './world-v9.mjs';
export const LOD_BUDGETS=Object.freeze({
 touch:Object.freeze({normal:12,performance:7}),
 desktop:Object.freeze({normal:18,performance:10})
});
export function selectDetailedActors(candidates,hero,touch=false,performance=false){
 const cap=LOD_BUDGETS[touch?'touch':'desktop'][performance?'performance':'normal'];
 // Every boss stays animated with an original GLB rig, and near foes take precedence.
 const sorted=[...candidates].sort((a,b)=>{
   if((a.type==='boss')!==(b.type==='boss'))return a.type==='boss'?-1:1;
   const da=(a.x-hero.x)**2+(a.y-hero.y)**2;
   const db=(b.x-hero.x)**2+(b.y-hero.y)**2;
   return da-db;
 });
 const detailed=new Set(sorted.slice(0,cap).map(a=>a.id));
 for(const a of sorted)if(a.type==='boss')detailed.add(a.id);
 return detailed;
}
function mergeParts(){
 const parts=[];
 const torso=new THREE.CylinderGeometry(.23,.34,.88,6);
 torso.translate(0,.78,0);parts.push(torso);
 const helm=new THREE.IcosahedronGeometry(.26,0);helm.translate(0,1.48,0);parts.push(helm);
 for(const side of [-1,1]){
  const arm=new THREE.BoxGeometry(.19,.6,.27);
  arm.translate(side*.36,.87,.08);parts.push(arm);
  const leg=new THREE.BoxGeometry(.19,.45,.24);
  leg.translate(side*.15,.22,0);parts.push(leg);
 }
 const plain=parts.map(p=>p.index?p.toNonIndexed():p);
 const merged=mergeGeometries(plain);
 for(const p of plain)if(!parts.includes(p))p.dispose();
 for(const p of parts)p.dispose();
 if(!merged)throw Error('Unable to merge actor LOD mesh geometries');
 merged.computeVertexNormals();
 return merged;
}
export function createActorLOD(scene,{capacity=96}={}){
 const geo=mergeParts();
 const styles={
  drone:0x536e79,runner:0x694b42,brute:0x4f5964,boss:0x6a4850
 };
 const meshes={},counts={};
 for(const [kind,tint] of Object.entries(styles)){
  const material=new THREE.MeshStandardMaterial({color:tint,roughness:.65,metalness:.28,flatShading:true});
  const mesh=new THREE.InstancedMesh(geo,material,capacity);
  mesh.name='EnemyGeometryLOD_'+kind;
  mesh.count=0;mesh.frustumCulled=false;mesh.castShadow=false;mesh.receiveShadow=false;
  scene.add(mesh);meshes[kind]=mesh;
 }
 const dummy=new THREE.Object3D();
 function draw(enemies,hero){
  for(const key of Object.keys(meshes))counts[key]=0;
  for(const e of enemies){
   const kind=e.type in meshes?e.type:'runner',i=counts[kind]++;
   if(i>=capacity){counts[kind]=capacity;continue}
   const angle=Math.atan2(hero.y-e.y,hero.x-e.x);
   const scale=kind==='boss'?2.6:kind==='brute'?1.35:kind==='runner'?.82:1;
   dummy.position.set(e.x/UNIT,kind==='drone'?.4:0,e.y/UNIT);
   dummy.rotation.set(0,Math.PI/2-angle,0);
   dummy.scale.setScalar(scale);
   dummy.updateMatrix();
   meshes[kind].setMatrixAt(i,dummy.matrix);
  }
  for(const [kind,mesh] of Object.entries(meshes)){
    mesh.count=counts[kind];
    if(counts[kind])mesh.instanceMatrix.needsUpdate=true;
  }
  return Object.values(counts).reduce((a,b)=>a+b,0);
 }
 function dispose(){
  for(const m of Object.values(meshes)){m.removeFromParent();m.material.dispose();}
  geo.dispose();
 }
 return {draw,dispose,meshes,counts};
}
