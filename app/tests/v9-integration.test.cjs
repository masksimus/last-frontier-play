const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
test('GLB assets match provenance hashes and need no external textures/buffers',()=>{
 const root=path.join(__dirname,'../assets/models');const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));
 for(const entry of manifest){const data=fs.readFileSync(path.join(root,entry.file));assert.equal(crypto.createHash('sha256').update(data).digest('hex'),entry.sha256);assert.equal(data.readUInt32LE(0),0x46546c67);assert.equal(data.readUInt32LE(8),data.length);const gltf=JSON.parse(data.subarray(20,20+data.readUInt32LE(12)));for(const obj of [...gltf.buffers||[],...gltf.images||[]])assert(!obj.uri||obj.uri.startsWith('data:'),entry.file+' has remote dependency');assert.equal(entry.license,'CC0-1.0');}
});
test('Rapier stops a fast dash and projectiles at actual cover',async()=>{
 const {createPhysics}=await import('../src/physics-v9.mjs');const physics=await createPhysics();
 try{const p={x:570,y:950,r:19};physics.move(p,{x:570,y:700});assert(p.y<800&&p.y>700);assert(physics.wallHit({x:570,y:700},{x:570,y:950}));assert(!physics.wallHit({x:1100,y:700},{x:1100,y:850}));}finally{physics.dispose();}
});
test('Enemies navigate around generator cover and reach the player',async()=>{
 const {createNavigation}=await import('../src/navigation-v9.mjs');const {createPhysics}=await import('../src/physics-v9.mjs');const navigate=createNavigation(),physics=await createPhysics();
 try{for(const r of [18,26,61]){const e={x:675,y:350,r},target={x:700,y:750};for(let step=0;step<1200;step++){const d=navigate(e,target),before={x:e.x,y:e.y};e.x+=d.x*3;e.y+=d.y*3;physics.move(e,before);if(Math.hypot(e.x-target.x,e.y-target.y)<12)break;}assert(Math.hypot(e.x-target.x,e.y-target.y)<15,JSON.stringify(e));}}finally{physics.dispose();}
});
