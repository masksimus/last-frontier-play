import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Howl, Howler } from 'howler';
import { createNavigation } from './navigation-v9.mjs';
import { PROPS, UNIT, clamp, screenInput } from './world-v9.mjs';
import { createActorAnimation, dampAngle } from './actor-animation-v9.mjs';
import { createConcreteMaps, weatherMetal } from './surfaces-v9.mjs';
import { createCinematicIndustrial, detailBudget } from './cinematic-v9.mjs';
import { createActorLOD, selectDetailedActors } from './actor-lod-v9.mjs';
import { createTitanArmor, createIndustrialLandmarks } from './visible-art-v93.mjs';

const actorModels={player:'Astronaut_FinnTheFrog',drone:'Enemy_Flying',runner:'Enemy_Small',brute:'Enemy_Large',boss:'Mech_FinnTheFrog'};
const state={cinematic:null,lodActors:0,detailedActors:0,ready:false,renderer:'canvas-fallback',reason:'',models:0,actors:0,drawCalls:0,triangles:0,frameMs:0,quality:'balanced',build:'10.0.0-blender.1',shadowCasters:0,contactShadows:0,animationClips:[],contextLost:false};
const bridge={ready:false,status:()=>({...state,physics:physics?.status()}),screenInput,draw(){},move(){}};
window.FrontierV9=bridge;
let physics,renderer,scene,camera,disposed=false;
const sounds={};
for(const key of ['shot','hit','boom','pickup']) sounds[key]=new Howl({src:[`assets/sounds/${key}.wav`],volume:key==='boom'?.25:.12});
window.FrontierV6={ready:false,status:()=>({ready:false,renderer:'canvas-fallback',audioReady:true}),playAudio(freq,len,type,vol){const key=freq>750?'pickup':freq>=350?'shot':freq<200?'boom':'hit';sounds[key].volume(Math.min(.5,vol*5));sounds[key].play();return true;},mute:value=>{muted=value;Howler.mute(value)}};
bridge.setAudioActive=active=>{Howler.mute(muted||!active);};
let muted=false;try{muted=localStorage.getItem('frontier_mute')==='1';}catch{}
Howler.mute(muted);
function failure(error){
 state.ready=bridge.ready=false;state.reason=String(error.message||error);state.renderer='canvas-fallback';
 document.querySelector('#three-stage')?.remove();document.querySelector('#renderStatus').textContent='РЕЗЕРВНЫЙ РЕЖИМ';document.querySelector('#start').disabled=false;window.dispatchEvent(new Event('frontier-renderer-ready'));
 physics?.dispose();physics=null;renderer?.dispose();disposed=true;
 console.warn('V9 renderer fallback:',state.reason);
}
async function init(){
 if(window.__FRONTIER_TEST_FORCE_CANVAS__)throw Error('Requested Canvas fallback');
 const touch=matchMedia('(pointer:coarse)').matches;
 renderer=new THREE.WebGLRenderer({antialias:!touch,alpha:false,powerPreference:'high-performance'});
 renderer.domElement.id='three-stage';renderer.domElement.setAttribute('aria-hidden','true');
 renderer.domElement.style.cssText='position:absolute;inset:0;pointer-events:none;z-index:1';
 document.querySelector('#stage').after(renderer.domElement);
 renderer.setPixelRatio(Math.min(devicePixelRatio||1,detailBudget(touch).maxPixelRatio));
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
 scene=new THREE.Scene();scene.background=new THREE.Color(0x080e18);scene.fog=new THREE.FogExp2(0x142033,.018);
 const pmrem=new THREE.PMREMGenerator(renderer);const environment=new RoomEnvironment();scene.environment=pmrem.fromScene(environment,.05).texture;scene.environmentIntensity=.63;environment.dispose();pmrem.dispose();
 camera=new THREE.OrthographicCamera(-12,12,7,-7,.1,100);
 const loader=new GLTFLoader();
 const files=[...new Set([...PROPS.filter(p=>!p.procedural).map(p=>p.model),...Object.values(actorModels),'chimney_detailed','hangar_smallA','pipe_straight','pipe_cornerRound','rail','supports_high','turret_double','weapon_rifle','weapon_gun','craft_speederA','rock_crystals'])];
 const models=Object.fromEntries(await Promise.all(files.map(async name=>[name,await loader.loadAsync(`assets/models/${name}.glb`)])));
  // Real offline Blender-authored GLB: optional fallback retains the previously tested animated titan.
  try{models.siege_titan_hd=await loader.loadAsync('assets/models/Siege_Titan_HD.glb');state.highDetailTitan=true;}catch(err){state.highDetailTitan=false;console.warn('Blender HD titan unavailable; using old rig:',String(err));}
 state.models=files.length;state.animationClips=Object.fromEntries(Object.entries(actorModels).map(([kind,name])=>[kind,models[name].animations.map(a=>a.name)]));
 physics=await (await import('./physics-v9.mjs')).createPhysics();bridge.enemyDirection=createNavigation();bridge.wallHit=(a,b)=>physics?.wallHit(a,b);bridge.move=(entity,previous)=>physics?.move(entity,previous);
 const hemi=new THREE.HemisphereLight(0x7caccd,0x1c1113,1.02);scene.add(hemi);
 const moon=new THREE.DirectionalLight(0x89bfe8,2.25);moon.position.set(8,23,7);moon.castShadow=true;
 const shadowSize=matchMedia('(pointer:coarse)').matches?1024:1536;
 moon.shadow.mapSize.set(shadowSize,shadowSize);Object.assign(moon.shadow.camera,{left:-14,right:14,top:14,bottom:-14,near:1,far:65});moon.shadow.bias=-.00025;moon.shadow.normalBias=.025;moon.shadow.intensity=.72;scene.add(moon,moon.target);
 const warm=new THREE.DirectionalLight(0xff7633,2.2);warm.position.set(40,8,-10);scene.add(warm);
 const concrete=createConcreteMaps(renderer);
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(48,36),new THREE.MeshStandardMaterial({...concrete,normalScale:new THREE.Vector2(.2,.2),color:0x617889,roughness:.86,metalness:.16}));floor.rotation.x=-Math.PI/2;floor.position.set(22,-.025,16);floor.receiveShadow=true;scene.add(floor);
 const steel=weatherMetal(new THREE.MeshStandardMaterial({color:0x4a5862,metalness:.68,roughness:.5}));
 const amber=new THREE.MeshStandardMaterial({color:0xffb24e,emissive:0xff8020,emissiveIntensity:2});
 const blue=new THREE.MeshStandardMaterial({color:0x79eaff,emissive:0x16cfff,emissiveIntensity:3});
 const red=new THREE.MeshStandardMaterial({color:0xff5238,emissive:0xff210d,emissiveIntensity:3});
 const geoBox=new THREE.BoxGeometry(1,1,1), geoCylinder=new THREE.CylinderGeometry(1,1,1,10);
 const staticParts=[];
 function box(x,y,z,w,h,d,mat=steel){const o=new THREE.Mesh(geoBox,mat);o.position.set(x,y,z);o.scale.set(w,h,d);o.castShadow=o.receiveShadow=true;scene.add(o);staticParts.push(o);return o;}
 function prop(name,x,z,w,h,d,rot=0){
  const obj=models[name].scene.clone(true);const bounds=new THREE.Box3().setFromObject(obj),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  obj.position.set(-center.x,-bounds.min.y,-center.z);const group=new THREE.Group();group.add(obj);group.scale.set(w/size.x,h/size.y,d/size.z);group.rotation.y=rot;group.position.set(x,0,z);
  obj.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;o.material=o.material.clone();o.material.color.set(0x768794);o.material.metalness=.5;o.material.roughness=.5;weatherMetal(o.material);}});scene.add(group);return group;
 }
 for(const p of PROPS.filter(p=>!p.procedural)){prop(p.model,p.x/UNIT,p.y/UNIT,p.w,p.h,p.d);box(p.x/UNIT,p.h*.63,p.y/UNIT+p.d*.51,p.w*.55,.09,.06,p.model.includes('Large')?blue:amber);}
 // Perimeter machinery leaves the established play area and spawn lanes open.
 for(let x=2;x<44;x+=6){
  prop('hangar_smallA',x,-1,5,3.5,3);prop('chimney_detailed',x+.7,-2,1.7,8,1.7);
  prop('pipe_straight',x,1,6,.6,.6,Math.PI/2);prop('rail',x,2,5,.9,.12);
  box(x,3.8,.8,1.1,.14,.25,amber);
 }
 for(let z=4;z<32;z+=7){prop('supports_high',-.5,z,1.8,5.5,1.5);prop('pipe_straight',-.5,z,1,1,7);prop('hangar_smallA',45,z,4,4,5);box(43,3,z,1,.15,.2,amber);}
 // Raised gantries, individual pipes and crossbeams give readable depth.
 for(const x of [7,36]){for(const z of [5,26]){prop('supports_high',x,z,1,5,1);box(x,5,z,4,.3,2.4);prop('turret_double',x,z,1.7,1.3,1.4).position.y=5;box(x,4.7,z+.9,.9,.12,.1,blue);}}
 for(let x=9;x<36;x+=1.6){box(x,.006,14.4,.8,.012,.065,amber);box(x,.006,18.5,.8,.012,.065,amber);}
 // Elevated pipe racks and watchtowers frame the central fighting lane.
 for(const x of [10,32]){
  prop('supports_high',x,9,1.2,5.3,1.2);box(x,5.3,9,3.2,.25,2.4);
  prop('turret_double',x,9,1.8,1.2,1.8).position.y=5.45;
  box(x,4.8,10.15,1.1,.14,.08,amber);
  prop('chimney_detailed',x-1.6,7,1.4,7.8,1.4);
 }
 for(let x=12;x<32;x+=4){prop('pipe_straight',x,8,4,.45,.45,Math.PI/2).position.y=3.8;prop('rail',x,7.8,4,.65,.15).position.y=2.6;}
 // Hazard-striped individual cargo stacks, with bolts and ribbed metal edges.
 for(const [x,z] of [[17,10],[19,10],[28,24],[30,24],[10,19],[35,17]]){
  box(x,.7,z,1.6,1.4,1.3);box(x,.72,z+.66,1.3,.84,.035);
  for(const dx of [-.65,.65]){box(x+dx,.7,z+.68,.12,1.4,.06,steel);box(x+dx,.3,z+.72,.07,.09,.04,amber);box(x+dx,1.1,z+.72,.07,.09,.04,amber);}
  box(x,1.42,z,1.6,.08,1.35,steel);
 }
 // Merge repeated structural meshes per material to keep mobile draw calls bounded.
 for(const material of [steel,amber,blue,red]){
  const objects=staticParts.filter(o=>o.material===material);if(!objects.length)continue;
  const geometries=objects.map(o=>{o.updateMatrix();return o.geometry.clone().applyMatrix4(o.matrix);});
  const merged=new THREE.Mesh(mergeGeometries(geometries),material);merged.castShadow=material===steel;merged.receiveShadow=true;scene.add(merged);
  for(const o of objects)scene.remove(o);for(const g of geometries)g.dispose();
 }
 // Static GLTF meshes are baked into material batches, preserving each model's geometry.
 scene.updateMatrixWorld(true);
 const batches=new Map(),remove=[];
 scene.traverse(o=>{if(!o.isMesh||o===floor||!o.geometry.attributes.normal)return;
  const m=o.material;if(Array.isArray(m))return;
  const key=[m.map?.uuid||'',m.color.getHex(),m.metalness,m.roughness,m.emissive?.getHex(),m.customProgramCacheKey()].join(':');
  if(!batches.has(key))batches.set(key,{material:m,geometries:[],shadow:o.castShadow});
  batches.get(key).geometries.push(o.geometry.clone().applyMatrix4(o.matrixWorld));remove.push(o);
 });
 for(const o of remove)o.removeFromParent();
 for(const b of batches.values()){const geometry=mergeGeometries(b.geometries);if(geometry){const mesh=new THREE.Mesh(geometry,b.material);mesh.castShadow=b.shadow;mesh.receiveShadow=true;scene.add(mesh);}for(const g of b.geometries)g.dispose();}
 // Keep instance geometry separate from static GLTF merge passes.
 const cinematic=createCinematicIndustrial(scene,{touch});
 const actorLOD=createActorLOD(scene);
 const landmarks=createIndustrialLandmarks(scene);
 state.cinematic=cinematic.summary;
 state.visibleArt={landmarks:landmarks.summary.landmarks,reactorRings:landmarks.summary.rings,materialBatches:landmarks.summary.materialBatches};
 // Ground-projected lighting cards are independent effects, never background art.
 const glowCanvas=document.createElement('canvas');glowCanvas.width=glowCanvas.height=64;const gc=glowCanvas.getContext('2d'),gradient=gc.createRadialGradient(32,32,0,32,32,32);gradient.addColorStop(0,'#ffffff');gradient.addColorStop(.22,'#ffffff88');gradient.addColorStop(1,'#ffffff00');gc.fillStyle=gradient;gc.fillRect(0,0,64,64);
 const glowTex=new THREE.CanvasTexture(glowCanvas);
 const groundGlows=[];
 for(const p of PROPS){const m=new THREE.MeshBasicMaterial({map:glowTex,color:p.model.includes('Large')?0x0e8cbf:0xd46612,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});const o=new THREE.Mesh(new THREE.PlaneGeometry(6,6),m);o.rotation.x=-Math.PI/2;o.position.set(p.x/UNIT,.012,p.y/UNIT+.8);scene.add(o);groundGlows.push(o);}
 const ring=new THREE.Mesh(new THREE.RingGeometry(.55,.6,40),new THREE.MeshBasicMaterial({color:0x55dbff,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;scene.add(ring);
 const selectionGlow=new THREE.PointLight(0x36caff,5,5,2);scene.add(selectionGlow);
 const muzzleLight=new THREE.PointLight(0xff9a35,0,5,2);scene.add(muzzleLight);
 const actorMap=new Map(),pools={player:[],drone:[],runner:[],brute:[],boss:[]};
 const heights={player:1.9,drone:1.35,runner:1.6,brute:2.25,boss:4.3};
 function makeActor(kind){
  const obj=clone(models[actorModels[kind]].scene);const bounds=new THREE.Box3().setFromObject(obj),height=bounds.max.y-bounds.min.y;
  obj.scale.setScalar(heights[kind]/height);obj.position.y=-bounds.min.y*obj.scale.y;
  const root=new THREE.Group();root.add(obj);scene.add(root);
  const armorV93=kind==='boss'?createTitanArmor(root):null;
  let titanHD=null,pivotsHD=null;
  if(kind==='boss'&&models.siege_titan_hd){
    titanHD=models.siege_titan_hd.scene.clone(true);
    const boundsHD=new THREE.Box3().setFromObject(titanHD);
    const desiredHeight=5.5;
    const heightHD=boundsHD.max.y-boundsHD.min.y;
    if(heightHD>0){
      titanHD.scale.setScalar(desiredHeight/heightHD);
      titanHD.position.y=-boundsHD.min.y*titanHD.scale.y;
      titanHD.traverse(m=>{if(m.isMesh){m.castShadow=false;m.receiveShadow=true;}});
      obj.visible=false;armorV93.group.visible=false;
      root.add(titanHD);
      pivotsHD={left:titanHD.getObjectByName('ARM_L'),
        right:titanHD.getObjectByName('ARM_R'),
        legL:titanHD.getObjectByName('LEG_L'),
        legR:titanHD.getObjectByName('LEG_R'),
        head:titanHD.getObjectByName('HEAD'),
        cannon:titanHD.getObjectByName('CANNON_R')};
    }else titanHD=null;
  }
  obj.traverse(o=>{if(o.isMesh){o.castShadow=true;o.frustumCulled=false;o.material=o.material.clone();o.material.metalness=kind==='player'||kind==='boss'?.42:.18;o.material.roughness=.55;
   o.material.color.set(kind==='player'?0x8db7d3:kind==='boss'?0x85717b:0xc27979);
  }});
  const glowMat=kind==='player'?blue:red;
  // Separate armour plates, visor and backpack customize the rig without replacing it.
  const gun=models[kind==='boss'?'turret_double':'weapon_rifle'].scene.clone(true);
  const gb=new THREE.Box3().setFromObject(gun),gs=gb.getSize(new THREE.Vector3());gun.scale.setScalar((kind==='boss'?1.65:.85)/Math.max(gs.x,gs.y,gs.z));gun.position.set(heights[kind]*.22,heights[kind]*.48,.25);if(kind==='player')root.add(gun);
  gun.visible=false;
  if(kind==='runner')root.scale.set(.8,1,.85);
  const mixer=new THREE.AnimationMixer(obj),actions={};for(const clip of models[actorModels[kind]].animations)actions[clip.name]=mixer.clipAction(clip);
  let helmet=null,head=null;
  if(kind==='player'||kind==='boss'){
   head=obj.getObjectByName('Head');
   helmet=new THREE.Group();const radius=kind==='player'?.42:.7;
   const shell=new THREE.Mesh(new THREE.SphereGeometry(radius,12,8),new THREE.MeshStandardMaterial({color:kind==='player'?0x162b3b:0x292c32,metalness:.45,roughness:.58}));shell.scale.set(1,.85,1.2);shell.castShadow=true;helmet.add(shell);
   const visor=new THREE.Mesh(new THREE.BoxGeometry(radius*1.5,radius*.25,radius*.22),kind==='player'?amber:red);visor.position.set(0,0,radius);helmet.add(visor);root.add(helmet);
  }
  const animation=createActorAnimation(mixer,actions,kind);
  const actor={root,obj,mixer,animation,actions,kind,gun,helmet,head,armorV93,titanHD,pivotsHD,age:0,lastX:null,lastY:null,recoil:0,lastShot:0};return actor;
 }
 function actor(id,kind,x,y,angle,motion,dt){
  let a=actorMap.get(id);if(a&&a.kind!==kind){a.root.visible=false;a.animation.reset();pools[a.kind].push(a);actorMap.delete(id);a=null;}
  if(!a){a=pools[kind].pop()||makeActor(kind);actorMap.set(id,a);a.animation.reset();a.root.visible=true;a.age=0;a.lastX=x;a.lastY=y;a.lastShot=motion.shots||0;a.recoil=0;a.root.rotation.y=Math.PI/2-angle;}
  a.seen=true;a.age+=dt;
  a.armorV93?.update(a.age,!!motion.enraged);
  // Articulated mesh pivots from Blender export. Physics and hit boxes remain unchanged.
  if(a.pivotsHD){
    const stride=Math.min(.17,Math.max(0,dt)*8);
    const phase=Math.sin(a.age*6.2)*stride;
    if(a.pivotsHD.legL)a.pivotsHD.legL.rotation.x=phase;
    if(a.pivotsHD.legR)a.pivotsHD.legR.rotation.x=-phase;
    if(a.pivotsHD.left)a.pivotsHD.left.rotation.x=-phase*.7;
    if(a.pivotsHD.right)a.pivotsHD.right.rotation.x=phase*.55;
    if(a.pivotsHD.cannon)a.pivotsHD.cannon.position.z=motion.firing?-.07:0;
    if(a.pivotsHD.head)a.pivotsHD.head.rotation.z=Math.sin(a.age*1.5)*.035;
  }
  const dx=(x-a.lastX)/UNIT,dy=(y-a.lastY)/UNIT;
  const speed=dt>0?Math.hypot(dx,dy)/dt:0;
  a.lastX=x;a.lastY=y;
  a.root.position.set(x/UNIT,kind==='drone'||kind==='runner'?.45+Math.sin(a.age*4+Number(id||0))*.045:0,y/UNIT);
  if(motion.dead)a.root.rotation.y=Math.PI/2-angle;
  else a.root.rotation.y=dampAngle(a.root.rotation.y,Math.PI/2-angle,dt);
  a.animation.update({...motion,speed,reverse:dx*Math.cos(angle)+dy*Math.sin(angle)<-.001},dt);
  if(motion.shots!==undefined&&motion.shots!==a.lastShot){a.recoil=.055;a.lastShot=motion.shots;}
  a.recoil*=Math.exp(-dt*24);
  // Small visual recoil follows each real volley; collision and aim stay authoritative.
  a.obj.rotation.x=-a.recoil;
  if(a.helmet&&a.head){a.root.updateMatrixWorld(true);a.helmet.position.copy(a.root.worldToLocal(a.head.getWorldPosition(scratchPosition)));a.helmet.position.y+=a.kind==='player'?.12:.1;a.helmet.position.z+=a.kind==='player'?.12:.18;}
  if(motion.dead&&motion.life<.22)a.root.position.y-= (.22-motion.life)*2;
  return a;
 }
 function pool(capacity,geometry,material){const mesh=new THREE.InstancedMesh(geometry,material,capacity);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;scene.add(mesh);return mesh;}
 const scratchPosition=new THREE.Vector3(), viewSphere=new THREE.Sphere(new THREE.Vector3(),3), frustum=new THREE.Frustum(), projection=new THREE.Matrix4();
 const contacts=pool(96,new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:glowTex,color:0x03070b,transparent:true,opacity:.48,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}));
 const bullets=pool(260,new THREE.SphereGeometry(1,6,4),new THREE.MeshBasicMaterial({color:0xffffff}));
 const gems=pool(256,new THREE.OctahedronGeometry(.16),new THREE.MeshStandardMaterial({color:0x71fff2,emissive:0x24c9ba,emissiveIntensity:1.5,metalness:.5,roughness:.2}));
 const sparks=pool(220,new THREE.SphereGeometry(1,4,3),new THREE.MeshBasicMaterial({color:0xffffff}));
 const dummy=new THREE.Object3D(),color=new THREE.Color();
 function instance(mesh,i,x,y,z,sx,sy,sz,angle=0,tint){dummy.position.set(x,y,z);dummy.scale.set(sx,sy,sz);dummy.rotation.set(0,angle,0);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);if(tint)mesh.setColorAt(i,color.set(tint));}
 const fxTextures={};for(const key of ['explosion','muzzle','smoke','shockwave'])fxTextures[key]=await new THREE.TextureLoader().loadAsync(`assets/${key}.png`);
 const fxPool=Array.from({length:64},()=>{const o=new THREE.Sprite(new THREE.SpriteMaterial({transparent:true,depthWrite:false}));o.visible=false;scene.add(o);return o;});
 let currentGame=null;
 let previousTime=0,slowFrames=0,qualityScale=Math.min(devicePixelRatio||1,1.5),width=0,height=0;
 function resize(){width=innerWidth;height=innerHeight;renderer.setSize(width,height);const half=width<height?10:height<550?5.8:7.5;camera.left=-half*width/height;camera.right=half*width/height;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();}
 resize();window.addEventListener('resize',resize);
 renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();state.contextLost=true;failure(Error('WebGL context lost'));},{once:true});
 bridge.draw=(game,motion,facing,fx,particles,fallen,dt,mode)=>{
  if(disposed)return;
  if(game!==currentGame){for(const [id,a] of actorMap){a.root.visible=false;a.animation.reset();pools[a.kind].push(a);}actorMap.clear();currentGame=game;}
  const now=performance.now();if(previousTime){state.frameMs=state.frameMs*.95+(now-previousTime)*.05;}previousTime=now;
  if(mode==='running'&&state.frameMs>38)slowFrames++;else slowFrames=Math.max(0,slowFrames-1);
  if(slowFrames>(touch?16:24)&&state.quality!=='performance'){qualityScale=.85;renderer.setPixelRatio(.85);renderer.shadowMap.enabled=false;state.quality='performance';slowFrames=0;}
  const p=game?.player||{x:1100,y:800};const target=new THREE.Vector3(p.x/UNIT,0,p.y/UNIT-1.2);
  camera.position.copy(target).add(new THREE.Vector3(0,22,28.16));camera.lookAt(target);
  // Quantize the shadow projection to texels to avoid crawling on slow movement.
  const texel=28/shadowSize, shadowX=Math.round(target.x/texel)*texel,shadowZ=Math.round(target.z/texel)*texel;
  moon.position.set(shadowX-8,23,shadowZ-10);moon.target.position.set(shadowX,0,shadowZ);moon.target.updateMatrixWorld();
  camera.updateMatrixWorld();frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  ring.position.set(p.x/UNIT,.035,p.y/UNIT);selectionGlow.position.set(p.x/UNIT,1,p.y/UNIT);
  for(const a of actorMap.values())a.seen=false;
  const t=game?.time||now/1000;
  cinematic.update(t,state.quality==='performance');
  landmarks.update(t);
  const hero=actor('player','player',p.x,p.y,facing||-.5,{moving:motion?.moving,firing:motion?.firing>0,hit:motion?.hit>0,shots:game?.visualShots||0},dt);
  const visible=[];
  if(game){for(const e of game.enemies){viewSphere.center.set(e.x/UNIT,1,e.y/UNIT);if(frustum.intersectsSphere(viewSphere))visible.push(e);}}
  const detailed=selectDetailedActors(visible,p,touch,state.quality==='performance');
  const lower=[];
  for(const e of visible){
   if(detailed.has(e.id))actor(e.id,e.type,e.x,e.y,Math.atan2(p.y-e.y,p.x-e.x),{moving:true,firing:e.attackPose>0,hit:e.knock>0,enraged:e.type==='boss'&&e.hp<=e.maxhp*.5},dt);
   else lower.push(e);
  }
  state.lodActors=actorLOD.draw(lower,p);
  state.detailedActors=detailed.size;
  if(!game){actor('menu-boss','boss',1370,690,2.4,{moving:false},dt);actor('menu-brute','brute',890,620,.4,{moving:true},dt);}
  for(const f of fallen){actor(f.id,f.type,f.x,f.y,f.angle-Math.PI/2,{dead:true,life:f.life},dt);}
  for(const [id,a] of actorMap){if(!a.seen){a.root.visible=false;a.animation.reset();pools[a.kind].push(a);actorMap.delete(id);}}
  // Budget expensive dynamic shadow draws, retaining ground contact for every actor
  // even after the adaptive performance mode disables the shadow map.
  const nearest=[...actorMap.values()].filter(a=>a.seen).sort((a,b)=>a.root.position.distanceToSquared(hero.root.position)-b.root.position.distanceToSquared(hero.root.position));
  const shadowBudget=matchMedia('(pointer:coarse)').matches?5:8;
  let contactCount=0,casters=0;
  for(const a of nearest){
   const cast=casters<shadowBudget&&renderer.shadowMap.enabled; if(cast)casters++;
   a.obj.traverse(o=>{if(o.isMesh)o.castShadow=cast;});if(a.helmet)a.helmet.traverse(o=>{if(o.isMesh)o.castShadow=cast;});
   if(contactCount<96){const radius=a.kind==='boss'?2.9:a.kind==='brute'?1.5:1.05;dummy.position.set(a.root.position.x,.006,a.root.position.z);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.set(radius,radius,1);dummy.updateMatrix();contacts.setMatrixAt(contactCount++,dummy.matrix);}
  }
  contacts.count=contactCount;contacts.instanceMatrix.needsUpdate=true;state.contactShadows=contactCount;state.shadowCasters=casters;state.playerAnimation=hero.animation.status();
  let n=0;for(const b of [...(game?.bullets||[]),...(game?.enemyBullets||[])]){if(n>=260)break;const enemy=!b.weapon;instance(bullets,n++,b.x/UNIT,enemy?.8:1,b.y/UNIT,enemy?.13:.045,enemy?.13:.045,enemy?.13:(b.weapon==='railgun'?.45:.22),Math.atan2(b.vx,b.vy),b.color||'#ff6c32');}bullets.count=n;bullets.instanceMatrix.needsUpdate=true;if(bullets.instanceColor)bullets.instanceColor.needsUpdate=true;
  n=0;for(const g of game?.gems||[]){if(n>=256)break;instance(gems,n++,g.x/UNIT,.2+Math.sin(t*5+g.x)*.06,g.y/UNIT,1,1,1,t);}gems.count=n;gems.instanceMatrix.needsUpdate=true;
  n=0;for(const e of particles){if(n>=220)break;instance(sparks,n++,e.x/UNIT,.25+(1-e.l/.55)*.8,e.y/UNIT,.035,.035,.035,0,e.color);}sparks.count=n;sparks.instanceMatrix.needsUpdate=true;if(sparks.instanceColor)sparks.instanceColor.needsUpdate=true;
  n=0;for(const e of fx){if(n>=fxPool.length)break;const s=fxPool[n++],life=e.life/e.total;s.visible=true;s.position.set(e.x/UNIT,e.type==='smoke'?1.4:1,e.y/UNIT);s.material.map=fxTextures[e.type];s.material.opacity=(e.type==='smoke'?.4:1)*Math.min(1,life*3);s.material.blending=e.type==='smoke'?THREE.NormalBlending:THREE.AdditiveBlending;s.material.color.set(e.type==='smoke'?0x7d858e:0xffffff);const size=e.size/UNIT*(1+(1-life)*.8);s.scale.set(size,size,1);}for(;n<fxPool.length;n++)fxPool[n].visible=false;
  muzzleLight.intensity=motion?.firing>0?4:0;muzzleLight.position.set(p.x/UNIT+Math.cos(facing)*.8,1.2,p.y/UNIT+Math.sin(facing)*.8);
  renderer.render(scene,camera);state.actors=actorMap.size+state.lodActors;state.drawCalls=renderer.info.render.calls;state.triangles=renderer.info.render.triangles;
 };
 state.ready=bridge.ready=true;state.renderer='three-webgl';document.querySelector('#start').disabled=false;window.dispatchEvent(new Event('frontier-renderer-ready'));document.querySelector('#renderStatus').textContent='V10 · BLENDER HD';
}
init().catch(failure);
