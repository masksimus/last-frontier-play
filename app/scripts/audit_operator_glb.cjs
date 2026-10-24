'use strict';
// Structural glTF 2.0 audit. Visual correctness and retarget quality require separate testing.
const fs=require('node:fs'),path=require('node:path');
const REQUIRED_CLIPS=['Anim_Idle','Anim_Walk','Anim_Run','Anim_Aim','Anim_Crouch'];
const REQUIRED_SOCKETS=['weapon_r','weapon_l','holster_r','backpack_root'];
const REQUIRED_BONES=['root','pelvis','spine_01','spine_02','spine_03','neck_01','head',
  ...['l','r'].flatMap(s=>['clavicle','upperarm','lowerarm','hand','thigh','calf','foot','toe'].map(n=>n+'_'+s))];
function inspectGLB(b,name='<memory>') {
  if(b.length<20||b.toString('ascii',0,4)!=='glTF')throw Error('Invalid GLB signature');
  if(b.readUInt32LE(4)!==2||b.readUInt32LE(8)!==b.length)throw Error('Wrong GLB version or byte length');
  let p=12,doc=null,binBytes=0;
  while(p<b.length){
    if(p+8>b.length)throw Error('Truncated chunk header');
    const size=b.readUInt32LE(p),type=b.toString('ascii',p+4,p+8);p+=8;
    if(size%4||p+size>b.length)throw Error('Invalid GLB chunk size');
    if(type==='JSON'){if(doc)throw Error('Duplicate JSON chunk');doc=JSON.parse(b.toString('utf8',p,p+size).trim());}
    if(type==='BIN\0')binBytes+=size;
    p+=size;
  }
  if(doc?.asset?.version!=='2.0')throw Error('Missing glTF 2.0 scene');
  const accessors=doc.accessors||[],meshes=doc.meshes||[],nodes=doc.nodes||[],mats=doc.materials||[];
  let tris=0,verts=0,primitiveCount=0,extraJointSets=0,unweighted=0;
  for(const m of meshes)for(const prim of (m.primitives||[])){
    ++primitiveCount;
    const att=prim.attributes||{};
    const count=accessors[att.POSITION]?.count||0;
    verts+=count;
    const indices=prim.indices===undefined?count:accessors[prim.indices]?.count||0;
    const mode=prim.mode??4;
    if(mode===4)tris+=Math.floor(indices/3);
    else if(mode===5||mode===6)tris+=Math.max(indices-2,0);
    if(att.JOINTS_1!==undefined||att.WEIGHTS_1!==undefined)extraJointSets++;
    if(att.JOINTS_0===undefined||att.WEIGHTS_0===undefined)unweighted++;
  }
  const names=new Set(nodes.map(n=>n.name).filter(Boolean));
  const clips=(doc.animations||[]).map((a,i)=>a.name||'unnamed_'+i);
  const missingClips=REQUIRED_CLIPS.filter(n=>!clips.includes(n));
  const missingBones=REQUIRED_BONES.filter(n=>!names.has(n));
  const missingSockets=REQUIRED_SOCKETS.filter(n=>!names.has(n));
  const checks={
    validMesh:meshes.length>0&&tris>0,
    hasSkin:(doc.skins||[]).length>0,
    pbrMaterials:mats.some(m=>m.pbrMetallicRoughness),
    maxFourInfluenceChannels:extraJointSets===0&&unweighted===0,
    requiredClips:missingClips.length===0,
    requiredBones:missingBones.length===0,
    weaponSockets:missingSockets.length===0,
    lod0TriangleTarget:tris>=60000&&tris<=70000,
    lod1And2:false
  };
  return {file:path.basename(name),bytes:b.length,meshCount:meshes.length,primitiveCount,triangles:tris,
    vertices:verts,nodes:nodes.length,skins:(doc.skins||[]).length,
    materials:mats.length,images:(doc.images||[]).length,textures:(doc.textures||[]).length,
    pbrMaterialCount:mats.filter(m=>m.pbrMetallicRoughness).length,
    normalMaterialCount:mats.filter(m=>m.normalTexture).length,
    metallicRoughnessMapCount:mats.filter(m=>m.pbrMetallicRoughness?.metallicRoughnessTexture).length,
    aoMaterialCount:mats.filter(m=>m.occlusionTexture).length,
    animations:clips.length,animationNames:clips,missingClips,missingBones,missingSockets,
    extraJointSets,primitivesWithoutWeights:unweighted,binBytes,checks,
    notVerified:['textureResolution','worldPivot','animationQuality','actualWeightNormalization',
      'meshManifold','uvOverlaps','UnityHumanoid','UnrealRetarget','referenceSimilarity','mobileFPS']};
}
if(require.main===module){
  try{
    const files=process.argv.slice(2).filter(s=>!s.startsWith('--'));
    if(!files.length)throw Error('Usage: node audit_operator_glb.cjs [--strict] file.glb ...');
    const out={spec:'LAST_FRONTIER_CHARACTER_TZ_V1',createdUTC:new Date().toISOString(),
      results:files.map(f=>inspectGLB(fs.readFileSync(f),f))};
    process.stdout.write(JSON.stringify(out,null,2)+'\n');
    if(process.argv.includes('--strict')&&out.results.some(x=>Object.values(x.checks).some(v=>!v)))process.exitCode=2;
  }catch(e){console.error(String(e));process.exitCode=1;}
}
module.exports={inspectGLB,REQUIRED_CLIPS};