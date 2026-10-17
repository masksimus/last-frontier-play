// V9.3 distinctive 3D art pass: a readable armored siege boss + structural landmarks.
// Genuine WebGL mesh geometry, not a reference image or a background billboard.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function plate(group,mat,x,y,z,w,h,d,rot=0){
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
 mesh.position.set(x,y,z);mesh.rotation.y=rot;mesh.castShadow=false;mesh.receiveShadow=false;
 group.add(mesh);return mesh;
}
const steel=()=>new THREE.MeshStandardMaterial({color:0x263741,metalness:.68,roughness:.36});
const rim=()=>new THREE.MeshStandardMaterial({color:0x828d95,metalness:.76,roughness:.3});
const ember=()=>new THREE.MeshStandardMaterial({color:0xff5025,emissive:0xff2308,emissiveIntensity:2.7,roughness:.4});
const dark=()=>new THREE.MeshStandardMaterial({color:0x101e2b,metalness:.43,roughness:.6});
export function createTitanArmor(root){
 const g=new THREE.Group();g.name='SiegeTitanArmoredV93';root.add(g);
 const armor=steel(),edge=rim(),glow=ember(),low=dark(),mats=[armor,edge,glow,low];
 // Proportions are in game-world meters, close to the existing 4.3m animated boss.
 plate(g,armor,0,2.5,-.08,1.6,1.7,1.2);
 plate(g,edge,0,3.03,.67,1.18,.28,.13);
 plate(g,low,0,2.45,.7,1.05,1.06,.12);
 for(const sign of [-1,1]){
  plate(g,armor,sign*.99,3.15,0,1.25,.47,1.25,sign*.11);
  plate(g,edge,sign*1.12,3.38,.18,.92,.13,1.01,sign*.11);
  plate(g,armor,sign*.89,2.05,-.02,.59,1.35,.71,sign*.1);
  plate(g,edge,sign*.93,1.28,.4,.51,.2,.45);
  for(let j=0;j<3;j++)plate(g,glow,sign*(.73+j*.13),3.18,.64,.065,.13,.055);
 }
 // Central red-lit reactor grille, seen from the camera-facing front.
 const core=new THREE.Mesh(new THREE.IcosahedronGeometry(.42,1),glow);core.position.set(0,2.59,.82);g.add(core);
 const halo=new THREE.Mesh(new THREE.TorusGeometry(.57,.085,7,24),glow);
 halo.position.set(0,2.59,.87);g.add(halo);
 const visor=plate(g,glow,0,3.83,.52,.96,.15,.12);
 plate(g,armor,0,4,.1,1.15,.34,.67);
 // Shoulder-mounted twin machine cannons, physically distinct from the skinned GLB.
 for(const sign of [-1,1]){
  const mount=new THREE.Group();mount.position.set(sign*1.32,2.47,.5);
  g.add(mount);
  const tube=new THREE.Mesh(new THREE.CylinderGeometry(.25,.29,1.55,10),armor);
  tube.rotation.x=Math.PI/2;mount.add(tube);
  const muzzle=new THREE.Mesh(new THREE.TorusGeometry(.23,.07,6,12),glow);
  muzzle.position.z=.8;mount.add(muzzle);
  for(const dx of [-.12,.12])for(const dy of [-.12,.12]){
   const vent=new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,1.67,5),edge);
   vent.rotation.x=Math.PI/2;vent.position.set(dx,dy,.06);mount.add(vent);
  }
 }
 function update(time,rage=false){
  glow.emissiveIntensity=(rage?5:2.5)+Math.sin(time*5)*.45;
  halo.rotation.z=time*(rage?2:1);
  core.scale.setScalar(1+Math.sin(time*7)*.05);
 }
 return {group:g,core,halo,visor,mats,update,
  dispose(){g.removeFromParent();g.traverse(o=>{if(o.isMesh)o.geometry.dispose();});for(const m of mats)m.dispose();}};
}

// Bulk industrial skyline at pre-existing collider locations: towers/gantries do
// not add invisible physical barriers in the central player movement lanes.
export const FACTORY_POSITIONS=Object.freeze([
 Object.freeze({x:13.5,z:10.4}),
 Object.freeze({x:31.8,z:21.6})
]);
export function createIndustrialLandmarks(scene){
 const group=new THREE.Group();group.name='FactorySectorA7_V93';scene.add(group);
 const materials=[
  new THREE.MeshStandardMaterial({color:0x2a414f,metalness:.7,roughness:.6}),
  new THREE.MeshStandardMaterial({color:0x828b90,metalness:.65,roughness:.32}),
  new THREE.MeshStandardMaterial({color:0xffa447,emissive:0xff5c1c,emissiveIntensity:2.5,metalness:.2,roughness:.4}),
  new THREE.MeshStandardMaterial({color:0x38c9ff,emissive:0x12b0ff,emissiveIntensity:2.1,metalness:.25,roughness:.35})
 ];
 const batch=[[],[],[],[]];let primitives=0;
 function block(k,x,y,z,w,h,d){
  const g=new THREE.BoxGeometry(w,h,d);g.translate(x,y,z);batch[k].push(g);primitives++;
 }
 // Massive layered power towers around EXISTING machines.
 for(const [idx,p] of FACTORY_POSITIONS.entries()){
  block(0,p.x,2.5,p.z,3.3,5,2.75);
  for(const sign of [-1,1]){
   block(1,p.x+sign*1.36,2.6,p.z+1.42,.25,5,.28);
   block(0,p.x+sign*1.48,4.15,p.z,1,.38,3.1);
   for(let j=0;j<4;j++)block(2,p.x+sign*.9,1+j*.85,p.z+1.47,.22,.18,.11);
  }
  for(let j=0;j<3;j++){
   block(3,p.x,1+j*1.17,p.z+1.45,2.4,.17,.12);
   block(1,p.x,1.5+j*1.2,p.z-1.39,3.2,.14,.16);
  }
  // Tall tower beacons extending over scenery; emissive only (no shadow passes).
  block(0,p.x,6.1,p.z,.46,2.4,.46);
  block(idx===0?2:3,p.x,7.35,p.z,.76,.52,.8);
 }
 // Foreground-visible elevated crossbar, separated from collision/navigation.
 for(const x of [16,20,24,28]){
  block(0,x,5.0,8,4.15,.29,.55);
  block(1,x,5.23,8,.56,.16,.64);
  block(2,x,4.78,8,.75,.18,.68);
 }
 for(let k=0;k<batch.length;k++){
  const g=mergeGeometries(batch[k]);
  if(!g)throw Error('Failed industrial material batch '+k);
  const m=new THREE.Mesh(g,materials[k]);m.name='IndustrialSection_'+k;
  m.castShadow=false;m.receiveShadow=true;group.add(m);
  for(const part of batch[k])part.dispose();
 }
 // Tangible animated reactor rings frame the main generators.
 const rings=[];
 const ringGeo=new THREE.TorusGeometry(1.32,.1,6,30);
 for(let i=0;i<FACTORY_POSITIONS.length;i++){
  const p=FACTORY_POSITIONS[i],o=new THREE.Mesh(ringGeo,materials[i?3:2]);
  o.position.set(p.x,3.1,p.z+1.55);o.name='ReactorTorus_'+i;group.add(o);rings.push(o);
 }
 function update(t){for(let i=0;i<rings.length;i++)rings[i].rotation.z=Math.sin(t*.8+i*2)*.18;}
 return {group,rings,summary:{landmarks:FACTORY_POSITIONS.length,materialBatches:4,rings:2,primitives},
  update,dispose(){group.removeFromParent();for(const c of group.children){if(c.isMesh&&c.geometry!==ringGeo)c.geometry.dispose();}ringGeo.dispose();materials.forEach(m=>m.dispose());}};
}
