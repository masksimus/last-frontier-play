/**
 * AEGIS-07 / player mesh for the EXISTING Three.js + Rapier game.
 * Original mesh geometry only. Nothing here is a sprite, camera billboard or flat image.
 * Front +Z, world +Y up, 2.28m tall. Joint pivots driven by live game motion.
 * Manual hard-surface reconstruction of APPROVED concept (not one-to-one scan).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const steel=new THREE.MeshStandardMaterial({color:0x303b49,metalness:.78,roughness:.34});
const pale=new THREE.MeshStandardMaterial({color:0x89959e,metalness:.73,roughness:.28});
const white=new THREE.MeshStandardMaterial({color:0xc7d0d6,metalness:.67,roughness:.3});
const dark=new THREE.MeshStandardMaterial({color:0x101923,metalness:.67,roughness:.49});
const motor=new THREE.MeshStandardMaterial({color:0x56616c,metalness:.89,roughness:.3});
const black=new THREE.MeshStandardMaterial({color:0x07131d,metalness:.24,roughness:.72});
const gold=new THREE.MeshStandardMaterial({color:0xf3a52b,metalness:.65,roughness:.34});
const blue=new THREE.MeshStandardMaterial({color:0x1daee8,metalness:.29,roughness:.22,emissive:0x08aeff,emissiveIntensity:2.5});
const pure=new THREE.MeshStandardMaterial({color:0xd9faff,metalness:.05,roughness:.17,emissive:0x89eaff,emissiveIntensity:3.7});
const mats={steel,pale,white,dark,motor,black,gold,blue,pure};
function group(parent,name,x=0,y=0,z=0){const g=new THREE.Group();g.name=name;g.position.set(x,y,z);parent.add(g);return g;}
function add(parent,name,geometry,material,x=0,y=0,z=0){const m=new THREE.Mesh(geometry,material);m.name=name;m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function box(parent,name,p,size,material,r=.025,rx=0,rz=0){
 const [x,y,z]=p,[w,h,d]=size;
 const geometry=new RoundedBoxGeometry(w,h,d,2,Math.min(r,w*.2,h*.2,d*.2));
 const m=add(parent,name,geometry,material,x,y,z);m.rotation.x=rx;m.rotation.z=rz;return m;
}
function rod(parent,name,a,b,r,mat,radial=12){
 const aa=new THREE.Vector3(...a),bb=new THREE.Vector3(...b);const v=bb.clone().sub(aa);
 const m=add(parent,name,new THREE.CylinderGeometry(r,r,v.length(),radial),mat,...aa.clone().add(bb).multiplyScalar(.5).toArray());
 m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());return m;
}
function disc(parent,name,p,r,d,mat,axis='z'){
 const m=add(parent,name,new THREE.CylinderGeometry(r,r,d,24),mat,...p);
 if(axis==='z')m.rotation.x=Math.PI/2;
 else if(axis==='x')m.rotation.z=Math.PI/2;
 return m;
}
function torus(parent,name,p,r,tube,mat,axis='z'){
 const m=add(parent,name,new THREE.TorusGeometry(r,tube,7,32),mat,...p);
 if(axis==='y')m.rotation.x=Math.PI/2;
 if(axis==='x')m.rotation.y=Math.PI/2;
 return m;
}
function plate(parent,name,points,z,depth,mat,bevel=.012){
 const path=new THREE.Shape();points.forEach(([x,y],i)=>i?path.lineTo(x,y):path.moveTo(x,y));path.closePath();
 const geo=new THREE.ExtrudeGeometry(path,{depth,bevelEnabled:true,bevelSize:bevel,bevelThickness:bevel*.7,bevelSegments:2,steps:1,curveSegments:1});
 return add(parent,name,geo,mat,0,0,z);
}
export function createAegisHero(){
 const root=new THREE.Group();root.name='AEGIS_07_REAL_3D';
 const torso=group(root,'TORSO',0,1.39,0);
 box(torso,'Carbon_Inner_Chest',[0,.31,0],[.88,.56,.43],dark,.09);
 box(torso,'Armour_Back',[0,.30,-.22],[.88,.61,.15],steel,.07);
 box(torso,'Waist_Bearing',[0,-.10,0],[.50,.30,.35],motor,.055);
 for(const s of [-1,1]){
  // Sloping, layered pectoral armor inspired by the approved concept
  plate(torso,'CHEST_PLATE_'+s,[[s*.07,.43],[s*.25,.57],[s*.47,.52],[s*.53,.35],[s*.39,.17],[s*.13,.18]],.22,.16,pale);
  plate(torso,'CHEST_FACET_'+s,[[s*.15,.48],[s*.30,.52],[s*.45,.48],[s*.48,.39],[s*.34,.36],[s*.17,.39]],.39,.023,white,.007);
  plate(torso,'CHEST_LOWER_'+s,[[s*.12,.22],[s*.38,.20],[s*.49,.24],[s*.43,.13],[s*.24,.08],[s*.13,.13]],.31,.11,steel);
  box(torso,'Chest_LED_'+s,[s*.32,.12,.44],[.20,.024,.027],blue,.004,0,s*.11);
  box(torso,'Upper_Collar_'+s,[s*.22,.55,.08],[.30,.13,.30],steel,.04,0,s*.22);
  for(let i=0;i<3;i++)box(torso,'Abdominal_Fin_'+s+'_'+i,[s*.18,-.04-i*.072,.245],[.26,.039,.06],i%2?steel:pale,.011);
  rod(torso,'Piston_Abdomen_'+s,[s*.26,-.15,-.12],[s*.30,.29,-.10],.032,motor);
  box(torso,'Hip_Wing_'+s,[s*.40,-.24,.05],[.29,.21,.32],steel,.043,0,s*.14);
  box(torso,'Hip_Orange_'+s,[s*.41,-.18,.245],[.055,.029,.022],gold,.006);
 }
 // Cylindrical energy core, actual volume and stacked rings (not a texture)
 disc(torso,'Reactor_Cavity',[0,.34,.39],.157,.085,black);
 torus(torso,'Reactor_Steel',[0,.34,.45],.125,.024,pale);
 torus(torso,'Reactor_Glow',[0,.34,.477],.100,.019,blue);
 disc(torso,'Reactor_Emitter',[0,.34,.477],.078,.018,pure);
 torus(torso,'Emitter_Inner',[0,.34,.49],.046,.008,white);
 for(let i=0;i<8;i++){const a=i*Math.PI/4;disc(torso,'Reactor_Bolt_'+i,[Math.cos(a)*.134,.34+Math.sin(a)*.134,.487],.009,.010,gold);}
 const head=group(torso,'HEAD',0,.59,.04);
 rod(head,'Neck_Main',[0,-.10,-.01],[0,.065,0],.073,motor);
 for(const s of [-1,1]){
  rod(head,'Neck_Cable_'+s,[s*.075,-.08,-.03],[s*.083,.055,-.02],.017,white,8);
 }
 box(head,'Helmet_Shell',[0,.103,0],[.43,.245,.36],steel,.064,0,0);
 box(head,'Helmet_Crest',[0,.215,-.01],[.37,.062,.33],pale,.018,-.14);
 plate(head,'Helmet_Brow',[[-.216,.145],[-.156,.203],[.15,.203],[.217,.142],[.20,.079],[-.20,.079]],.16,.073,steel,.012);
 box(head,'Black_Faceplate',[0,.071,.202],[.35,.105,.037],black,.016);
 box(head,'CYAN_VISOR',[0,.105,.230],[.33,.049,.019],pure,.012);
 box(head,'Angular_Mouth',[0,-.014,.193],[.25,.065,.06],dark,.023,-.17);
 for(const s of [-1,1]){
  box(head,'Head_Ear_Guard_'+s,[s*.245,.135,.01],[.08,.15,.21],motor,.02);
  box(head,'Ear_Gold_'+s,[s*.272,.149,.074],[.035,.071,.089],gold,.012);
  rod(head,'Antenna_'+s,[s*.185,.22,-.045],[s*.25,.34,-.055],.017,pale,8);
  box(head,'Cheek_Chamfer_'+s,[s*.15,.015,.19],[.092,.075,.06],steel,.021,0,s*.23);
 }
 // Arms and legs: explicit transform pivots for actual 3D animation and player aiming
 const arms=[],forearms=[],legs=[],shins=[],feet=[];
 for(const s of [-1,1]){
  const arm=group(torso,'SHOULDER_'+s,s*.67,.35,0);arms.push(arm);
  disc(arm,'Shoulder_Drive',[0,-.02,0],.155,.27,motor,'x');
  disc(arm,'Shoulder_Hub',[s*.16,-.02,0],.080,.05,black,'x');
  torus(arm,'Shoulder_Glow',[s*.189,-.02,0],.055,.012,blue,'x');
  box(arm,'Huge_Armoured_Pauldron',[s*.018,.045,-.005],[.35,.27,.39],steel,.07,0,-s*.14);
  box(arm,'Pauldron_Facet',[s*.036,.095,.21],[.305,.138,.068],pale,.035,0,-s*.12);
  box(arm,'Pauldron_Bolt_Gold',[s*.125,.070,.260],[.043,.04,.025],gold,.01);
  box(arm,'Bicep_Skeleton',[s*.033,-.24,0],[.21,.43,.23],dark,.045,0,s*.07);
  box(arm,'Bicep_Armor',[s*.05,-.22,.105],[.245,.32,.18],pale,.045);
  rod(arm,'Piston_Arm',[s*.17,-.10,-.12],[s*.19,-.37,-.11],.032,motor);
  const fore=group(arm,'ELBOW_'+s,s*.06,-.46,0);forearms.push(fore);
  disc(fore,'Elbow_Cog',[0,0,0],.098,.24,steel,'x');
  box(fore,'Forearm_Carbon',[0,-.18,0],[.205,.39,.22],dark,.05);
  box(fore,'Forearm_Shield',[0,-.17,.117],[.265,.38,.155],steel,.055,0,s*.04);
  box(fore,'Forearm_Metal_Facet',[0,-.14,.208],[.195,.27,.043],pale,.02);
  box(fore,'Forearm_LED',[0,-.20,.239],[.033,.12,.019],blue,.009);
  const hand=group(fore,'HAND_'+s,0,-.40,0);
  disc(hand,'Wrist_Actuator',[0,.035,0],.056,.11,motor,'y');
  box(hand,'Palm',[0,-.07,.025],[.155,.115,.13],steel,.025);
  for(let i=0;i<4;i++){const dx=(i-1.5)*.038;rod(hand,'Finger_'+i,[dx,-.119,.055],[dx,-.194,.080],.015,pale,8);box(hand,'Knuckle_'+i,[dx,-.117,.070],[.025,.021,.028],motor,.005);}
  rod(hand,'Opposing_Thumb',[s*.088,-.06,.072],[s*.11,-.135,.105],.022,motor,8);
  const thigh=group(root,'HIP_'+s,s*.28,1.23,0);legs.push(thigh);
  disc(thigh,'Hip_Actuator',[0,-.04,0],.147,.23,motor,'x');
  box(thigh,'Femur_Frame',[s*.009,-.195,0],[.28,.49,.285],dark,.054);
  box(thigh,'Thigh_Armor',[s*.025,-.20,.135],[.34,.46,.215],steel,.065,0,-s*.044);
  box(thigh,'Thigh_Light_Facet',[s*.045,-.16,.257],[.263,.30,.032],pale,.023,0,-s*.07);
  box(thigh,'Thigh_Cyan',[s*.105,-.30,.273],[.026,.10,.02],blue,.009);
  rod(thigh,'Thigh_Piston',[s*.18,-.11,-.14],[s*.17,-.37,-.14],.032,motor);
  const shin=group(thigh,'KNEE_'+s,s*.015,-.50,0);shins.push(shin);
  disc(shin,'Knee_Hinge',[0,.02,0],.128,.28,motor,'x');
  disc(shin,'Knee_Hub',[s*.148,.02,0],.061,.024,blue,'x');
  box(shin,'Knee_Cap',[0,.015,.153],[.255,.19,.105],white,.036);
  box(shin,'Shin_Core',[0,-.31,0],[.235,.53,.27],dark,.045);
  box(shin,'Shin_Main_Armor',[0,-.315,.141],[.314,.54,.195],steel,.073);
  box(shin,'Shin_Silver_Crest',[0,-.16,.25],[.27,.17,.036],pale,.025);
  box(shin,'Vertical_Energy_Strip',[0,-.365,.246],[.033,.235,.018],blue,.008);
  rod(shin,'Calf_Piston_'+s,[s*.14,-.10,-.145],[s*.14,-.48,-.14],.027,pale);
  const foot=group(shin,'ANKLE_'+s,0,-.55,.015);feet.push(foot);
  disc(foot,'Ankle_Rotator',[0,0,0],.101,.235,motor,'x');
  box(foot,'Heel_Frame',[0,-.04,-.082],[.28,.17,.32],steel,.05);
  box(foot,'Boot_Sole',[0,-.087,.155],[.355,.11,.59],black,.035);
  box(foot,'Boot_Main',[0,.005,.153],[.34,.15,.51],steel,.05);
  box(foot,'Toe_Upper',[0,-.012,.361],[.31,.105,.17],pale,.028);
  for(const dx of [-.09,.09])box(foot,'Toe_Segmented_'+dx,[dx,-.035,.448],[.13,.09,.077],white,.02);
  box(foot,'Ankle_Blue',[s*.165,.01,.01],[.019,.074,.12],blue,.01);
 }
 root.userData={pivots:{torso,head,arms,forearms,legs,shins,feet},height:2.28,meshType:'true-three-dimensional-hard-surface'};
 // Preserve everything needed to display the model in the Three.js renderer.
 return root;
}
export function animateAegis(root,{moving=false,firing=false,hit=false,dead=false,speed=0}={},time=0,dt=.016){
 const p=root?.userData?.pivots;if(!p)return;
 const stride=Math.min(1,Math.max(0,speed/3.5))*(moving?1:0);
 const phase=time*8.7,walk=Math.sin(phase)*stride;
 p.torso.rotation.z=Math.sin(phase)*.015*stride;
 p.torso.position.y=1.39+Math.sin(phase*2)*.021*stride+Math.sin(time*2)*.006;
 p.head.rotation.y=Math.sin(time*1.35)*.034;
 for(let i=0;i<2;i++){
  const sign=i===0?1:-1;
  p.legs[i].rotation.x=walk*sign*.52;
  p.shins[i].rotation.x=Math.max(0,-walk*sign)*.65;
  p.feet[i].rotation.x=-(p.legs[i].rotation.x+p.shins[i].rotation.x)*.31;
  p.arms[i].rotation.x=-walk*sign*.33+(firing?(i===0?-.20:-.13):0);
  p.forearms[i].rotation.x=firing?-.20:Math.sin(phase+sign)*.07*stride;
 }
 p.torso.rotation.x=hit?.12:0;
 root.rotation.z=dead?Math.min(1.25,root.rotation.z+dt*2.5):0;
}
