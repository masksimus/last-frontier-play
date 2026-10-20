import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import * as CANNON from 'cannon-es';

// Genuine meshes, skeletal animation, perspective-correct muzzle sockets and
// rigid-body debris. The Canvas adapter remains available if WebGL cannot start.
const R=window.OutbreakRenderer;
const status={ready:false,renderer:'loading',reason:'',models:0,skinnedMeshes:0,drawCalls:0,triangles:0,muzzleShots:0,physicsContacts:0,animation:{playerBones:[],activeClips:[],paused:true}};
window.Frontier3D={status:()=>({...status})};
const fallback={...R};
function start3D(){
const models={},actors=new Map();
let renderer;
try { renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'}); }
catch(error){status.renderer='canvas-fallback';status.reason=String(error?.message||error);return;}
const scene=new THREE.Scene();scene.background=new THREE.Color('#101923');scene.fog=new THREE.FogExp2('#18232d',.019);
const camera=new THREE.OrthographicCamera(-12,12,7,-7,.1,130);
renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.24;
renderer.domElement.id='three-stage';renderer.domElement.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0';
const stage=document.getElementById('stage');
if(!stage){renderer.dispose();status.renderer='canvas-fallback';status.reason='Missing game canvas';return;}
stage.parentNode.insertBefore(renderer.domElement,stage);
const levelRoot=new THREE.Group(),actorRoot=new THREE.Group(),fxRoot=new THREE.Group();scene.add(levelRoot,actorRoot,fxRoot);
const playerRing=new THREE.Mesh(new THREE.RingGeometry(.52,.575,48),new THREE.MeshBasicMaterial({color:0x79eaff,side:THREE.DoubleSide,transparent:true,opacity:.85,depthWrite:false}));playerRing.rotation.x=-Math.PI/2;scene.add(playerRing);
const hemi=new THREE.HemisphereLight('#8fa9bd','#35231c',1.6);scene.add(hemi);
const sun=new THREE.DirectionalLight('#bcd9eb',2.7);sun.position.set(-8,19,6);sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-25,right:25,top:25,bottom:-25,near:1,far:65});sun.shadow.bias=-.0005;scene.add(sun);
scene.add(new THREE.AmbientLight('#a09e9a',.25));
const material=(color,metalness=.6,roughness=.5,emissive=null)=>new THREE.MeshStandardMaterial({color,metalness,roughness,emissive:emissive||0,emissiveIntensity:emissive?2:0});
const steel=material('#243541',.85,.38),edge=material('#66737c',.8,.34),dark=material('#101923',.65,.65),rust=material('#73432d',.65,.7),yellow=material('#bd8b36',.6,.45),red=material('#571d18',.5,.45),blue=material('#1d85ba',.5,.2,'#36bcff');
const orange=material('#da7721',.2,.25,'#ff7b16');
const boxGeo=new THREE.BoxGeometry(1,1,1),sphereGeo=new THREE.SphereGeometry(1,10,7),cylinderGeo=new THREE.CylinderGeometry(1,1,1,12);
function mesh(geo,mat,pos,size,parent=levelRoot){const m=new THREE.Mesh(geo,mat);m.position.set(...pos);m.scale.set(...size);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function box(pos,size,mat=steel,parent=levelRoot){return mesh(boxGeo,mat,pos,size,parent);}
function pipe(a,b,r,mat=edge,parent=levelRoot){const delta=new THREE.Vector3(...b).sub(new THREE.Vector3(...a)),m=mesh(cylinderGeo,mat,new THREE.Vector3(...a).addScaledVector(delta,.5).toArray(),[r,delta.length(),r],parent);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return m;}
const localLights=[];
function light(pos,color,intensity=5,distance=8){const l=new THREE.PointLight(color,intensity,distance,2);l.position.set(...pos);levelRoot.add(l);localLights.push(l);return l;}
let width=innerWidth,height=innerHeight,lastState=null,lastLevel=null,time=0,ready=false,gpuUnavailable=false,visibleProps=0;
let focus=new THREE.Vector3(),cameraTarget=new THREE.Vector3(),physics=null;
function useFallback(error){gpuUnavailable=true;ready=false;status.ready=false;status.renderer='canvas-fallback';status.reason=String(error?.message||error);renderer.domElement.remove();renderer.dispose();removeEventListener('resize',resize);stage.style.opacity='';Object.assign(R,fallback);if(window.FrontierPhysics)window.FrontierPhysics.active=false;}
// Android may discard a WebGL context when another app needs GPU memory. Keep
// the existing game state and input running through the Canvas adapter.
renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();useFallback('WebGL context lost');});
function viewportAnchor(){return width<600?{x:width*.5,y:height*.42}:{x:width*.38,y:height*.67};}
function resize(){width=Math.max(1,innerWidth);height=Math.max(1,innerHeight);renderer.setSize(width,height);const vertical=width<600?15.8:17.6;camera.top=vertical/2;camera.bottom=-vertical/2;camera.left=-vertical*width/height/2;camera.right=-camera.left;const a=viewportAnchor();camera.setViewOffset(width,height,width*.5-a.x,height*.5-a.y,width,height);camera.updateProjectionMatrix();}
resize();addEventListener('resize',resize);
const ray=new THREE.Raycaster(),ndc=new THREE.Vector2(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),0),hit=new THREE.Vector3();
function worldToScreen(x,y,z=0){const p=typeof x==='object'?x:{x,y};const v=new THREE.Vector3(p.x,z,p.y).project(camera);return {x:(v.x+1)*width/2,y:(1-v.y)*height/2};}
function screenToWorld(x,y){ndc.set(x/width*2-1,1-y/height*2);ray.setFromCamera(ndc,camera);if(!ray.ray.intersectPlane(plane,hit))return {x:lastState?.player.x||0,y:lastState?.player.y||0};return {x:hit.x,y:hit.z};}
function clearGroup(group){for(const c of [...group.children]){if(c.isInstancedMesh)c.dispose();group.remove(c);}}
// Static pipework, container ribs and wall blocks share GPU draw calls. Animated
// fire and actors stay separate; GLB geometry/materials remain shared by clones.
function batchLevel(){
 const batches=new Map();levelRoot.updateMatrixWorld(true);
 for(const child of [...levelRoot.children])if(child.isMesh&&[boxGeo,cylinderGeo,sphereGeo].includes(child.geometry)){
  const key=child.geometry.uuid+child.material.uuid;let list=batches.get(key);if(!list)batches.set(key,list=[]);list.push(child);
 }
 let instances=0;for(const list of batches.values()){if(list.length<2)continue;const first=list[0],batch=new THREE.InstancedMesh(first.geometry,first.material,list.length);
  batch.castShadow=first.castShadow;batch.receiveShadow=true;
  list.forEach((m,i)=>{batch.setMatrixAt(i,m.matrix);levelRoot.remove(m);});batch.computeBoundingSphere();levelRoot.add(batch);instances+=list.length;
 }status.staticInstances=instances;status.staticBatches=batches.size;
}
function addContainer(x,z,w=3,d=1.6){box([x,.72,z],[w,1.4,d],steel);box([x,1.44,z],[w+.07,.08,d+.06],edge);
 for(let n=-w/2+.15;n<w/2;n+=.24){box([x+n,.74,z-d/2-.015],[.035,1.3,.04],edge);box([x+n,.74,z+d/2+.015],[.035,1.3,.04],edge);}
 for(const s of [-1,1]){box([x+s*w/2,.74,z],[.055,1.4,d+.08],edge);box([x+s*(w/2-.1),.2,z+d/2+.03],[.14,.3,.04],yellow);}
}
function generator(x,z,w=2.3,d=2){box([x,.15,z],[w,.3,d],dark);box([x,.65,z],[w*.8,.8,d*.8],steel);
 for(const s of [-1,1]){pipe([x+s*w*.25,.5,z],[x+s*w*.25,2,z],.18,edge);pipe([x+s*w*.25,.65,z],[x+s*w*.25,1.8,z],.105,blue);}
 box([x,1.97,z],[w*.75,.16,d*.5],dark);light([x,1.25,z],0x48bfff,4,5);
 for(let n=0;n<5;n++)box([x-w*.31+n*w*.15,.66,z+d*.41],[w*.07,.5,.035],edge);
}
function tower(x,z){box([x,2.8,z],[.45,5.6,.45],steel);box([x,4.6,z],[1.4,.18,1.4],edge);box([x,5.1,z],[.9,.8,.9],dark);
 for(const s of [-1,1]){box([x+s*.47,5.1,z],[.04,.32,.63],orange);pipe([x+s*.5,0,z],[x+s*.5,4.7,z],.045,edge);}light([x,5.4,z],0xffb55b,12,13);}
function factory(x,z,w=7){box([x,2.2,z],[w,4.4,2.2],dark);box([x,4.46,z],[w+.2,.2,2.4],steel);
 for(let n=-w/2+.5;n<w/2;n+=1.05){box([x+n,2.4,z+1.12],[.14,4.7,.18],edge);box([x+n+.35,2.5,z+1.14],[.42,.2,.03],orange);}
 for(const y of [1.3,3.25]){pipe([x-w/2,y,z+1.3],[x+w/2,y,z+1.3],.13,edge);for(let n=-w/2+.4;n<w/2;n+=1.7)box([x+n,y,z+1.3],[.08,.35,.35],rust);}
 box([x,1.1,z+1.14],[1.4,2.2,.12],rust);box([x,2.3,z+1.3],[1.5,.13,.17],orange);light([x,2.3,z+1.7],0xffa13b,8,9);
}
const fires=[];
function fireProp(x,z,size=1){const group=new THREE.Group();group.position.set(x,0,z);levelRoot.add(group);for(let i=0;i<5;i++){const m=mesh(sphereGeo,orange,[(i-2)*.12,.6+i*.06,0],[.16,.6,.16],group);m.userData.phase=i*1.8;}fires.push({group,size});light([x,1,z],0xff6c19,9*size,8);}
const floorMat=material('#495054',.3,.76),groundTexture=new THREE.TextureLoader().load('assets/siege/yard-ground.webp');groundTexture.colorSpace=THREE.SRGBColorSpace;groundTexture.wrapS=groundTexture.wrapT=THREE.RepeatWrapping;groundTexture.repeat.set(4,3.5);groundTexture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());floorMat.map=groundTexture;
const exitGeometry=new THREE.RingGeometry(.9,1.04,48),exitMaterial=new THREE.MeshBasicMaterial({color:0x67cdb4,side:THREE.DoubleSide});
function buildLevel(level){lastLevel=level;clearGroup(levelRoot);fires.length=0;localLights.length=0;visibleProps=0;physics=createPhysics(level);
 box([level.map[0].length/2,-.12,level.map.length/2],[level.map[0].length,.24,level.map.length],floorMat).castShadow=false;
 const yard=level.environment?.kind==='industrial-yard',map=level.map;
 for(let z=0;z<map.length;z++)for(let x=0;x<map[z].length;x++)if(map[z][x]==='#'){
   if(yard){const [l,t,r,b]=level.environment.bounds;if(x>=l&&x<=r&&z>=t&&z<=b)continue;if(x<l-1||x>r+1||z<t-1||z>b+1)continue;box([x+.5,.23,z+.5],[1,.46,1],steel);}
   else box([x+.5,.9,z+.5],[1,1.8,1],steel);
 }
 if(yard){
  for(const p of level.environment.props){if(p.solid){const f=p.footprint,w=f?f[2]-f[0]+1:2,d=f?f[3]-f[1]+1:2;if(p.type==='generator')generator(p.x,p.y,w*.85,d*.85);else if(p.type==='barrels'){for(let i=0;i<5;i++)mesh(cylinderGeo,i%2?rust:red,[p.x+(i%3-1)*.6,.55,p.y+Math.floor(i/3)*.65],[.29,1.1,.29]);}else addContainer(p.x,p.y,w*.95,d*.9);visibleProps++;}}
  for(const x of [4,12,21,29])factory(x,.4,7);
  for(const z of [6,16,25]){factory(.1,z,5);tower(1.1,z-2);}
  for(const x of [3,11,22,32])tower(x,1.4);
  for(const z of [3,8,13,18,23,28]){pipe([1.6,.3,z],[1.6,1.4,z],.045,edge);pipe([1.6,1.35,z],[1.6,1.35,z+4.5],.035,edge);}
  for(const [x,z] of [[33,8],[33,20],[1,19]])fireProp(x,z,1.4);
 }
 for(const terminal of level.terminals)generator(terminal.x,terminal.y,.65,.65);
 const exit=new THREE.Mesh(exitGeometry,exitMaterial);exit.rotation.x=-Math.PI/2;exit.position.set(level.exit.x,.02,level.exit.y);levelRoot.add(exit);
 batchLevel();focus.set(level.spawn.x,0,level.spawn.y);
}
function createPhysics(level){const world=new CANNON.World({gravity:new CANNON.Vec3(0,-650/48,0)});world.broadphase=new CANNON.SAPBroadphase(world);world.allowSleep=true;
 const groundMaterial=new CANNON.Material('ground'),bodyMaterial=new CANNON.Material('debris');world.addContactMaterial(new CANNON.ContactMaterial(groundMaterial,bodyMaterial,{friction:.55,restitution:.32}));
 const floor=new CANNON.Body({mass:0,material:groundMaterial,shape:new CANNON.Plane()});floor.quaternion.setFromEuler(-Math.PI/2,0,0);world.addBody(floor);
 // Match the height of visible cover: grenades can clear a crate or low yard
 // wall. Only adjacent cells of equal height share a collider.
 const yard=level.environment?.kind==='industrial-yard',heights=level.map.map(row=>Array.from(row,c=>c==='#'?(yard?.46:1.8):0));
 if(yard)for(const prop of level.environment.props)if(prop.solid&&prop.footprint){const [left,top,right,bottom]=prop.footprint,h=prop.type==='generator'?2.05:prop.type==='barrels'?1.1:1.48;for(let z=top;z<=bottom;z++)for(let x=left;x<=right;x++)if(heights[z]?.[x])heights[z][x]=h;}
 for(let y=0;y<heights.length;y++)for(let x=0;x<heights[y].length;){const h=heights[y][x];if(!h){x++;continue;}const start=x;while(heights[y][x]===h)x++;const half=(x-start)/2;world.addBody(new CANNON.Body({mass:0,material:groundMaterial,position:new CANNON.Vec3(start+half,h/2,y+.5),shape:new CANNON.Box(new CANNON.Vec3(half,h/2,.5))}));}
 return {world,bodyMaterial,bodies:new Map(),contacts:0};}
function physicsStep(state,dt){if(!ready||!state.level)return false;if(lastLevel!==state.level)buildLevel(state.level);if(state.mode!=='playing'||dt<=0)return true;const list=[...state.grenades,...state.effects.filter(e=>e.kind==='casing')],live=new Set(list);
 for(const [item,body] of physics.bodies)if(!live.has(item)){physics.world.removeBody(body);physics.bodies.delete(item);}
 for(const item of list)if(!physics.bodies.has(item)){const casing=item.kind==='casing',radius=casing?.025:.1,b=new CANNON.Body({mass:casing?.02:.4,material:physics.bodyMaterial,shape:casing?new CANNON.Cylinder(.018,.018,.065,8):new CANNON.Sphere(radius),position:new CANNON.Vec3(item.x,(item.z||0)/48+radius,item.y),velocity:new CANNON.Vec3(item.vx||0,(item.vz||0)/48,item.vy||0),angularVelocity:new CANNON.Vec3(5,9,3),linearDamping:.015,angularDamping:.1,sleepSpeedLimit:.08,sleepTimeLimit:.25});b.addEventListener('collide',ev=>{status.physicsContacts++;if(Math.abs(ev.contact.ni.y)>.5&&Math.abs(ev.contact.getImpactVelocityAlongNormal())>.5){item.bounces=(item.bounces||0)+1;physics.contacts++;}});physics.world.addBody(b);physics.bodies.set(item,b);}
 physics.world.step(1/120,Math.min(dt,.1),12);
 for(const [item,b] of physics.bodies){item.x=b.position.x;item.y=b.position.z;item.z=Math.max(0,(b.position.y-(item.kind==='casing'?.025:.1))*48);item.vx=b.velocity.x;item.vy=b.velocity.z;item.vz=b.velocity.y*48;item.spin=(item.spin||0)+dt*9;item.quaternion3D=b.quaternion.toArray();item.physical3D=true;}
 return true;}
function actorKey(e,marine=false){return marine?'player':e.id;}
function actorType(e,marine=false){return marine?'marine':e.isBoss||e.type==='queen'?'queen':e.type==='spitter'?'crawler':e.type;}
function createActor(e,marine){const type=actorType(e,marine),gltf=models[type]||models.crawler,object=cloneSkeleton(gltf.scene),mixer=new THREE.AnimationMixer(object),actions={};
 for(const source of gltf.animations){let clip=source;const name=source.name.toLowerCase();if(name==='fire'||name==='reload'){clip=source.clone();clip.tracks=clip.tracks.filter(t=>/^(weapon|spine|forearm_L)\./.test(t.name));THREE.AnimationUtils.makeClipAdditive(clip,0,gltf.animations.find(c=>c.name==='idle'));}const a=mixer.clipAction(clip);actions[name]=a;a.play();a.paused=true;a.setEffectiveWeight(0);}
 const entry={object,mixer,actions,type,muzzle:null,weapon:null,bones:0,animatedBones:[]};object.traverse(n=>{if(n.isBone&&['weapon','thigh_L','thigh_R','spine','forearm_L','upperarm_L'].includes(n.name))entry.animatedBones.push(n);if(n.name==='muzzle')entry.muzzle=n;if(n.name==='weapon')entry.weapon=n;if(n.isSkinnedMesh){n.castShadow=true;n.receiveShadow=true;n.frustumCulled=true;entry.bones++;}});
 actorRoot.add(object);return entry;}
function poseActor(entry,e,dt,marine,dead=false){const {object,mixer,actions}=entry;object.position.set(e.x,0,e.y);object.rotation.set(0,-(e.angle||0),0);
 const walk=Math.min(1,(e.moveSpeed||0)/(marine?3.05:1.8)),reload=e.reload>0,fire=Math.max(e.recoil||0,e.attackSwing||0),special=dead?'death':reload?'reload':fire>0?'fire':null;
 // Sample clips from simulation state, so pause freezes every bone and footsteps
 // stay locked to actual distance travelled instead of wall-clock frame rate.
 for(const [name,a]of Object.entries(actions)){const duration=a.getClip().duration||1;let weight=0,phase=0;
  if(name==='walk'){weight=(dead?0:1)*walk;phase=((e.anim||0)/(Math.PI*2))%1;}
  else if(name==='idle'){weight=(dead?0:1)*(1-walk);phase=(time*.65+(e.id||0)*.13)%1;}
  else if(name===special){weight=1;phase=dead?Math.min(1,e.fall||0):reload?Math.max(0,1-e.reload/(e.reloadDuration||1)):Math.min(1,1-fire);}
  a.setEffectiveWeight(weight);a.time=Math.min(duration-1e-6,Math.max(0,phase*duration));
 }
 mixer.update(0);
 // Lean belongs to the actor transform, never an accumulated weapon-bone delta.
 // AnimationMixer restores its own bones on every sample before socket queries.
 if(!dead){object.rotation.z=-(e.hitReact||0)*.11;object.position.y=Math.sin((e.throwTime||0)*Math.PI/.32)*.025;}
 object.updateMatrixWorld(true);
}
function muzzleFor(e,weapon){const entry=actors.get(e===lastState?.player?'player':e.id),angle=e.angle||0;
 if(!entry?.muzzle){const type=actorType(e,e===lastState?.player),scale=type==='queen'?2.42:type==='brute'?1.38:type==='crawler'?1.04:1,forward=(type==='marine'?1.36:type==='crawler'?.3:1.54)*scale;return {x:e.x+Math.cos(angle)*forward,y:e.y+Math.sin(angle)*forward,height:(type==='crawler'?1.65:1.26)*scale,dx:Math.cos(angle),dy:Math.sin(angle)};}
 // Synchronize orientation before firing; the input aim may change after render.
 poseActor(entry,e,0,e===lastState?.player);
 const point=entry.muzzle.getWorldPosition(new THREE.Vector3());return {x:point.x,y:point.z,height:point.y,dx:Math.cos(angle),dy:Math.sin(angle)};
}
const fxPool=[];function fxMesh(index,geo,mat){let m=fxPool[index];if(!m){m=new THREE.Mesh(geo,mat);fxPool[index]=m;fxRoot.add(m);}m.geometry=geo;m.material=mat;m.visible=true;m.rotation.set(0,0,0);return m;}
const bulletMat=new THREE.MeshBasicMaterial({color:0xffd989}),plasmaMat=new THREE.MeshBasicMaterial({color:0x8ae5ff}),bloodMat=material('#701b16',.1,.9),greenMat=new THREE.MeshBasicMaterial({color:0xa8d05c});
const warningRing=new THREE.RingGeometry(.88,1,48),warningMat=new THREE.MeshBasicMaterial({color:0xff492e,side:THREE.DoubleSide,transparent:true,opacity:.75,depthWrite:false});
function drawFX(state){let count=0;const segment=(a,b,r,mat)=>{const d=new THREE.Vector3().subVectors(b,a),m=fxMesh(count++,cylinderGeo,mat);m.position.copy(a).addScaledVector(d,.5);m.scale.set(r,Math.max(.001,d.length()),r);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());};
 for(const b of [...state.bullets,...state.enemyBullets]){const height=b.height??(b.sourceIsBoss?3.1:1.26),speed=Math.hypot(b.vx,b.vy),distance=Math.hypot(b.x-(b.startX??b.px??b.x),b.y-(b.startY??b.py??b.y)),age=Math.min(.05,speed>0?distance/speed:0),end=new THREE.Vector3(b.x,height,b.y),start=new THREE.Vector3(b.x-b.vx*age,height-(b.vzHeight||0)*age,b.y-b.vy*age);segment(start,end,b.kind==='plasma'?.045:.016,b.kind==='plasma'?plasmaMat:b.kind==='acid'?greenMat:bulletMat);}
 for(const g of state.grenades){const m=fxMesh(count++,sphereGeo,yellow);m.position.set(g.x,(g.z||0)/48+.1,g.y);m.scale.setScalar(.11);if(g.quaternion3D)m.quaternion.fromArray(g.quaternion3D);else m.rotation.z=g.spin||0;}
 for(const e of state.effects){const f=Math.max(0,e.life/e.maxLife),height=e.height??1.26;if(e.kind==='casing'){const m=fxMesh(count++,cylinderGeo,yellow);m.position.set(e.x,(e.z||0)/48+.025,e.y);m.scale.set(.018,.065,.018);if(e.quaternion3D)m.quaternion.fromArray(e.quaternion3D);else m.rotation.z=e.spin||0;}
 else if(e.kind==='muzzle'){const a=e.angle||0,p=new THREE.Vector3(e.x,height,e.y);segment(p,p.clone().add(new THREE.Vector3(Math.cos(a)*.55,0,Math.sin(a)*.55)),.07*f,bulletMat);if(!e._rendered3D){status.muzzleShots++;e._rendered3D=true;}}
 else if(e.kind==='explosion'||e.kind==='shockwave'){const m=fxMesh(count++,sphereGeo,e.kind==='shockwave'?plasmaMat:orange);m.position.set(e.x,.25+(1-f)*.5,e.y);m.scale.setScalar((1-f)*(e.r||2)*.65+.15);}
 else if(e.kind==='telegraph'){const radius=(e.r||1)*(1+.06*Math.sin(time*18)),m=fxMesh(count++,warningRing,warningMat);m.position.set(e.x,.035,e.y);m.rotation.x=-Math.PI/2;m.scale.setScalar(radius);if(e.length>0){const a=e.angle||0,start=new THREE.Vector3(e.x,.04,e.y),end=start.clone().add(new THREE.Vector3(Math.cos(a)*e.length,0,Math.sin(a)*e.length));segment(start,end,.045,warningMat);}}
 else if(e.kind==='blood')for(let i=0;i<4;i++){const m=fxMesh(count++,sphereGeo,bloodMat);m.position.set(e.x+Math.cos(i*2)*(1-f)*.65,.4+Math.sin(f*Math.PI)*.6,e.y+Math.sin(i*2)*(1-f)*.65);m.scale.setScalar(.035*f);}}
 for(const p of state.pickups){const m=fxMesh(count++,boxGeo,p.kind==='resource'?blue:yellow);m.position.set(p.x,.19+Math.sin(time*3+p.x)*.04,p.y);m.scale.set(.19,.23,.19);m.rotation.y=time;}
 for(const n of state.nests)if(n.hp>0){const m=fxMesh(count++,sphereGeo,red);m.position.set(n.x,.28,n.y);m.scale.set(.65,.5+Math.sin(time*3)*.03,.65);}
 for(let i=count;i<fxPool.length;i++)fxPool[i].visible=false;
}
function render(state,dt=.016){if(!ready){fallback.render(state,dt);return;}lastState=state;const running=state.mode==='playing',menu=state.mode==='menu',step=running||menu?dt:0;time+=step;if(lastLevel!==state.level)buildLevel(state.level);
 const player=state.player,target=new THREE.Vector3(player.x,0,player.y);focus.lerp(target,1-Math.exp(-step*9));
 playerRing.position.set(player.x,.025,player.y);playerRing.material.opacity=.72+Math.sin(time*3)*.12;
 // A view offset reserves reference-style space in front of the player.
 cameraTarget.copy(focus);camera.position.copy(cameraTarget).add(new THREE.Vector3(19,15.5,19));camera.lookAt(cameraTarget);camera.updateMatrixWorld(true);
 sun.position.copy(focus).add(new THREE.Vector3(-8,19,6));sun.target.position.copy(focus);scene.add(sun.target);
 const nearestLights=[...localLights].sort((a,b)=>a.position.distanceToSquared(focus)-b.position.distanceToSquared(focus));for(let i=0;i<nearestLights.length;i++)nearestLights[i].visible=i<6;
 const alive=new Set();for(const e of [player,...state.enemies]){const marine=e===player,key=actorKey(e,marine);alive.add(key);let a=actors.get(key);if(!a){a=createActor(e,marine);actors.set(key,a);}poseActor(a,e,step,marine);}
 for(const c of state.corpses.slice(-24)){const key=c;alive.add(key);let a=actors.get(key);if(!a){a=createActor(c,false);actors.set(key,a);}poseActor(a,c,0,false,true);}
 for(const [key,a]of actors)if(!alive.has(key)){actorRoot.remove(a.object);a.mixer.stopAllAction();actors.delete(key);}
 for(const f of fires)for(const m of f.group.children)m.scale.y=f.size*(.5+.16*Math.sin(time*9+m.userData.phase));
 drawFX(state);renderer.render(scene,camera);status.drawCalls=renderer.info.render.calls;status.triangles=renderer.info.render.triangles;status.activeActors=actors.size;status.skinnedMeshes=[...actors.values()].reduce((n,a)=>n+a.bones,0);status.physicsBodies=physics?.bodies.size||0;const playerActor=actors.get('player');status.animation={playerBones:playerActor?playerActor.animatedBones.flatMap(n=>[...n.position.toArray(),...n.quaternion.toArray()]):[],activeClips:playerActor?Object.entries(playerActor.actions).filter(([,a])=>a.getEffectiveWeight()>.001).map(([name])=>name):[],paused:!running&&!menu};
 drawRadar(state);drawCards();drawPortrait();
}
function drawRadar(state){const el=document.getElementById('radar');if(!el)return;const c=el.getContext('2d'),w=el.width,h=el.height,s=Math.min(w/36,h/30);c.fillStyle='#06111a';c.fillRect(0,0,w,h);c.fillStyle='#30414d';for(let y=0;y<state.level.map.length;y++)for(let x=0;x<state.level.map[y].length;x++)if(state.level.map[y][x]==='.')c.fillRect(x*s,y*s,s,s);for(const e of state.enemies){c.fillStyle='#ed3024';c.fillRect(e.x*s-1,e.y*s-1,3,3);}c.fillStyle='#80ffe8';c.fillRect(state.player.x*s-2,state.player.y*s-2,4,4);}
let cardsReady=false;function drawCards(){if(cardsReady)return;const im=new Image();im.onload=()=>{for(const b of document.querySelectorAll('[data-weapon]')){const map={pistol:'weaponPistol',rifle:'weaponRifle',shotgun:'weaponShotgun',plasma:'weaponPlasma'},m=window.SiegeArt.sprites[map[b.dataset.weapon]];if(!m)continue;let canvas=b.querySelector('canvas');if(!canvas){canvas=document.createElement('canvas');canvas.width=240;canvas.height=100;canvas.style.cssText='width:100%;height:42px;object-fit:contain';b.prepend(canvas);b.querySelector('svg')?.remove();}const c=canvas.getContext('2d'),[x,y,w,h]=m.rect,scale=Math.min(226/w,90/h);c.drawImage(im,x,y,w,h,(240-w*scale)/2,(100-h*scale)/2,w*scale,h*scale);}cardsReady=true;};im.src='assets/siege/weapons.png';cardsReady=true;}
let portraitRequested=false;function drawPortrait(){if(portraitRequested)return;const node=document.getElementById('portrait'),meta=window.SiegeArt?.sprites?.marineRight;if(!node||!meta)return;portraitRequested=true;const im=new Image();im.onload=()=>{const c=node.getContext('2d'),[x,y,w,h]=meta.rect;c.fillStyle='#0c2035';c.fillRect(0,0,node.width,node.height);c.drawImage(im,x+w*.13,y+h*.006,w*.57,h*.43,0,0,node.width,node.height);};im.src='assets/siege/'+window.SiegeArt.atlases[meta.atlas].file;}
async function init(){try{const loader=new GLTFLoader();await Promise.all(['marine','crawler','brute','queen'].map(async kind=>{models[kind]=await loader.loadAsync('assets/models/'+kind+'.glb');status.models++;}));if(gpuUnavailable)return;ready=true;status.ready=true;status.renderer='three-webgl';stage.style.opacity='0';document.getElementById('pixi-stage')?.remove();Object.assign(R,{render,worldToScreen,screenToWorld,muzzleFor,actorAimPoint:e=>worldToScreen(e.x,e.y,e.isBoss?3.4:e.type==='brute'?1.75:1.25),status:()=>({...fallback.status(),...status,renderMode:'three-webgl',assetsReady:ready,projection:'2:1-isometric',viewportAnchor:viewportAnchor(),zoom:1,physics:'cannon-es',camera:'orthographic-3d',animatedModels:true})});window.FrontierPhysics={active:true,step:physicsStep};window.Frontier3D.probe=()=>{const a=actors.get('player');if(!a)return null;const bones={};a.object.traverse(n=>{if(n.isBone&&['weapon','thigh_L','thigh_R','spine'].includes(n.name))bones[n.name]={position:n.position.toArray(),quaternion:n.quaternion.toArray()};});return {bones,muzzle:muzzleFor(lastState.player),actions:Object.fromEntries(Object.entries(a.actions).map(([n,v])=>[n,{weight:v.getEffectiveWeight(),time:v.time}]))};};window.dispatchEvent(new Event('frontier-3d-ready'));}catch(error){useFallback(error);console.error('3D initialization failed:',error);}}
init();
}
start3D();
