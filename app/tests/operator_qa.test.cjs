'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {inspectGLB}=require('../scripts/audit_operator_glb.cjs');
function mock(doc){
  let j=Buffer.from(JSON.stringify(doc));j=Buffer.concat([j,Buffer.alloc((4-j.length%4)%4,0x20)]);
  const b=Buffer.alloc(j.length+20);b.write('glTF',0);b.writeUInt32LE(2,4);b.writeUInt32LE(b.length,8);b.writeUInt32LE(j.length,12);b.write('JSON',16);j.copy(b,20);return b;
}
test('unindexed triangles are counted',()=>{
  const x=inspectGLB(mock({asset:{version:'2.0'},accessors:[{count:6}],meshes:[{primitives:[{attributes:{POSITION:0}}]}]}));
  assert.equal(x.triangles,2);assert.equal(x.vertices,6);assert.equal(x.checks.requiredClips,false);
});
test('malformed chunks fail, never pass',()=>{
  assert.throws(()=>inspectGLB(Buffer.from('bad')),/signature/);
  const b=mock({asset:{version:'2.0'}});b.writeUInt32LE(999999,12);assert.throws(()=>inspectGLB(b),/chunk size/);
});
test('extra skin influence channels cannot be marked mobile safe',()=>{
  const x=inspectGLB(mock({asset:{version:'2.0'},accessors:[{count:3}],meshes:[{primitives:[{attributes:{POSITION:0,JOINTS_0:0,WEIGHTS_0:0,JOINTS_1:0,WEIGHTS_1:0}}]}]}));
  assert.equal(x.checks.maxFourInfluenceChannels,false);
});
