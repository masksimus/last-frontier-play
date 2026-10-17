// V10.1: actual photogrammetry-derived CC0 Poly Haven surface textures on real 3D meshes.
// All photos are redistributed locally in assets/pbr. No image is a scene background.
import * as THREE from 'three';
export const PBR_PROVENANCE='assets/pbr/provenance.json';
export const CC0_PACKS=Object.freeze({
 floor:'assets/pbr/damaged_concrete_floor/',
 steel:'assets/pbr/metal_plate_02/'
});
export function configureTileTexture(map,{repeats=[6,4.5],albedo=false}={}){
 map.wrapS=map.wrapT=THREE.RepeatWrapping;
 map.repeat.set(repeats[0],repeats[1]);
 if(albedo)map.colorSpace=THREE.SRGBColorSpace;
 map.anisotropy=2;
 map.needsUpdate=true;
 return map;
}
export async function loadLocalLicensedPBR(){
 const loader=new THREE.TextureLoader(),load=(s)=>loader.loadAsync(s);
 async function bundle(path,repeats){
   const [map,normalMap,roughnessMap]=await Promise.all([
     load(path+'color.jpg'),load(path+'normal.png'),load(path+'roughness.jpg')
   ]);
   configureTileTexture(map,{repeats,albedo:true});
   configureTileTexture(normalMap,{repeats});
   configureTileTexture(roughnessMap,{repeats});
   return {map,normalMap,roughnessMap};
 }
 const [floor,steel]=await Promise.all([
  bundle(CC0_PACKS.floor,[9,7]),
  bundle(CC0_PACKS.steel,[3,2])
 ]);
 return {floor,steel,source:'Poly Haven CC0',dispose(){
   for(const pack of [floor,steel])for(const tex of Object.values(pack))tex.dispose();
 }};
}
