const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const file=path.join(root,'assets/models/Siege_Titan_HD.glb');
function asset(){
 const buf=fs.readFileSync(file);
 assert.equal(buf.toString('utf8',0,4),'glTF');
 assert.equal(buf.readUInt32LE(4),2);
 assert.equal(buf.readUInt32LE(8),buf.length);
 assert.equal(buf.readUInt32LE(16),0x4e4f534a);
 const json=JSON.parse(buf.toString('utf8',20,20+buf.readUInt32LE(12)));
 return {buf,json};
}
test('real original Blender Siege Titan uses game-ready GLB geometry, not images as a level',()=>{
 const {buf,json}=asset();
 assert(buf.length>100000);
 assert(json.meshes.length>=6,'separate articulated mesh batches');
 assert(json.materials.length>=6,'nontrivial original PBR materials');
 assert(json.textures.length>=6,'actual embedded texture images');
 const tris=json.meshes.flatMap(m=>m.primitives).filter(p=>p.indices!=null)
   .reduce((sum,p)=>sum+Math.floor(json.accessors[p.indices].count/3),0);
 assert(tris>12000&&tris<110000,'LOD0 polygon budget');
 assert(json.materials.some(m=>m.normalTexture),'normal map missing');
 assert(json.materials.some(m=>m.pbrMetallicRoughness?.metallicRoughnessTexture),'roughness texture missing');
 const names=new Set(json.nodes.map(n=>n.name));
 for(const part of ['ROOT_GAME_ASSET','ARM_L','ARM_R','LEG_L','LEG_R','CANNON_R','HEAD'])
   assert(names.has(part),'no animated/articulated joint '+part);
});
test('asset hashes and Blender/PBR source are retained, without any proprietary models',()=>{
 const {buf}=asset(),manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/models/manifest.json')));
 const record=manifest.find(m=>m.file==='Siege_Titan_HD.glb');
 assert(record,'authored model must be in GLB manifest');
 assert.equal(record.sha256,crypto.createHash('sha256').update(buf).digest('hex'));
 assert.equal(record.license,'CC0-1.0');
 for(const src of ['scripts/blender_titan_v10.py','scripts/generate_titan_pbr.py'])
   assert(fs.existsSync(path.join(root,src)));
});
test('renderer instantiates Blender GLB without suppressing physics and fallback',()=>{
 const source=fs.readFileSync(path.join(root,'src/three-layer.mjs'),'utf8');
 assert.match(source,/loader\.loadAsync\('assets\/models\/Siege_Titan_HD\.glb'\)/);
 assert.match(source,/obj\.visible=false;armorV93\.group\.visible=false;/);
 assert.match(source,/a\.pivotsHD\.legL\.rotation\.x/);
 assert.match(source,/state\.highDetailTitan=true/);
 assert.match(source,/console\.warn\('Blender HD titan unavailable/);
});
