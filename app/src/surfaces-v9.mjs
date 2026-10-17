import * as THREE from 'three';

// Original, deterministic material maps. These are surface detail on real meshes;
// no scene or reference image is baked into the arena.
export function createConcreteMaps(renderer) {
 const size=512, canvas=document.createElement('canvas');canvas.width=canvas.height=size;
 const ctx=canvas.getContext('2d'), image=ctx.createImageData(size,size), height=new Float32Array(size*size);
 let seed=927;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const i=y*size+x, joint=x%128<2||y%128<2;
  const pool=Math.sin(x*.019+Math.sin(y*.023))*Math.cos(y*.014+x*.005);
  const grit=rand(), chip=grit<.014;
  height[i]=joint?.12:chip?.35:.58+grit*.025;
  const shade=joint?22:47+pool*8+grit*16;
  image.data.set([shade,shade+5,shade+8,255],i*4);
 }
 ctx.putImageData(image,0,0);
 // Hairline fractures, oil stains and worn tile edges vary at different scales.
 for(let i=0;i<32;i++){
  let x=rand()*size,y=rand()*size;const radius=12+rand()*60;
  const g=ctx.createRadialGradient(x,y,0,x,y,radius);g.addColorStop(0,i%3?'#02090d60':'#8e61332a');g.addColorStop(1,'#00000000');ctx.fillStyle=g;ctx.fillRect(x-radius,y-radius,radius*2,radius*2);
  ctx.strokeStyle='#0e141bbb';ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(x,y);
  for(let j=0;j<5;j++){x+=(rand()-.5)*23;y+=rand()*12;ctx.lineTo(x,y);}ctx.stroke();
 }
 const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
 const normalData=new Uint8Array(size*size*4),roughData=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const i=y*size+x,dx=height[y*size+(x+1)%size]-height[y*size+(x+size-1)%size],dy=height[((y+1)%size)*size+x]-height[((y+size-1)%size)*size+x];
  const n=new THREE.Vector3(-dx*2,-dy*2,1).normalize();normalData.set([(n.x*.5+.5)*255,(n.y*.5+.5)*255,(n.z*.5+.5)*255,255],i*4);
  const wet=Math.max(0,Math.sin(x*.019+Math.sin(y*.023))*Math.cos(y*.014+x*.005));
  const rough=230-wet*55;roughData.set([rough,rough,rough,255],i*4);
 }
 const normalMap=new THREE.DataTexture(normalData,size,size),roughnessMap=new THREE.DataTexture(roughData,size,size);
 for(const tex of [map,normalMap,roughnessMap]){tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(6,4.5);tex.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());tex.needsUpdate=true;}
 return {map,normalMap,roughnessMap};
}

// World-space patina does not depend on the palette UVs of CC0 models. It keeps
// original color atlases intact while adding nonuniform metal wear after batching.
export function weatherMetal(material) {
 material.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vPatinaPosition;')
   .replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvPatinaPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vPatinaPosition;\nfloat patinaHash(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453);}\nfloat patinaNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(mix(patinaHash(i),patinaHash(i+vec3(1,0,0)),f.x),mix(patinaHash(i+vec3(0,1,0)),patinaHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(patinaHash(i+vec3(0,0,1)),patinaHash(i+vec3(1,0,1)),f.x),mix(patinaHash(i+vec3(0,1,1)),patinaHash(i+vec3(1,1,1)),f.x),f.y),f.z);}')
   .replace('#include <color_fragment>',`#include <color_fragment>
    float grain = patinaHash(floor(vPatinaPosition * 85.0));
    float stains = patinaNoise(vPatinaPosition * 3.5);
    float rust = smoothstep(.55,.8,stains) * .28;
    diffuseColor.rgb *= .93 + grain * .1;
    diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.19,.065,.025),rust);`)
   .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + rust * .8 + grain * .08, .25, 1.0);');
 };
 material.customProgramCacheKey=()=> 'frontier-patina-1';
 return material;
}
