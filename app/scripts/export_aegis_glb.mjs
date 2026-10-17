/**
 * Build-time real GLB export for AEGIS-07. Shared mesh geometry with the game.
 * Run: node scripts/export_aegis_glb.mjs
 * No sprite atlases or reference photo cards are used in this export.
 */
import fs from 'node:fs';
import path from 'node:path';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {createAegisHero} from '../src/aegis-hero-3d.mjs';
class NodeFileReader {
  result=null;onloadend=null;onerror=null;
  readAsArrayBuffer(blob){blob.arrayBuffer().then(buffer=>{this.result=buffer;this.onloadend?.({target:this})}).catch(err=>this.onerror?.(err))}
  readAsDataURL(blob){blob.arrayBuffer().then(buffer=>{this.result='data:'+(blob.type||'application/octet-stream')+';base64,'+Buffer.from(buffer).toString('base64');this.onloadend?.({target:this})}).catch(err=>this.onerror?.(err))}
}
globalThis.FileReader ||=NodeFileReader;
const out=path.resolve('assets/models/AEGIS_07_V11.glb');
fs.mkdirSync(path.dirname(out),{recursive:true});
const robot=createAegisHero();
// Runtime pivot references contain objects; remove them only during GLB serialization.
robot.userData={asset:'AEGIS-07',purpose:'controllable-3d-player',units:'metres',upAxis:'Y'};
const exporter=new GLTFExporter();
const bytes=await exporter.parseAsync(robot,{binary:true,onlyVisible:true});
assertGLB(bytes);
fs.writeFileSync(out,Buffer.from(bytes));
function assertGLB(raw){
 const b=Buffer.from(raw);
 if(b.toString('ascii',0,4)!=='glTF'||b.readUInt32LE(4)!==2||b.readUInt32LE(8)!==b.length)throw Error('Invalid GLB structure');
 const n=b.readUInt32LE(12);const json=JSON.parse(b.subarray(20,20+n).toString());
 if((json.meshes?.length||0)<75)throw Error('Export did not retain volumetric mesh hierarchy');
 for(const name of ['AEGIS_07_REAL_3D','TORSO','HEAD','HIP_-1','HIP_1','KNEE_1','SHOULDER_-1','Reactor_Emitter','CYAN_VISOR']){
  if(!json.nodes?.some(node=>node.name===name))throw Error('Missing GLB mesh/pivot '+name);
 }
 console.log('AEGIS GLB',b.length,'bytes',json.meshes.length,'meshes',json.nodes.length,'nodes');
}
