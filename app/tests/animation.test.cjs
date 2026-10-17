const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const A=require('../src/animation.js'),root=path.resolve(__dirname,'..');
test('five distinct 20-frame actor atlases use mobile safe 5x4 layout',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/characters/atlas.json'),'utf8'));
 assert.equal(manifest.version,7);assert.equal(manifest.layout,'grid');
 assert.equal(manifest.frames,20);assert.equal(manifest.frameSize,256);assert.equal(manifest.columns,5);assert.equal(manifest.rows,4);
 for(const name of ['player','drone','runner','brute','boss']){
   const body=fs.readFileSync(path.join(root,manifest.actors[name].file));
   assert.equal(body.toString('ascii',0,4),'RIFF');assert.equal(body.toString('ascii',8,12),'WEBP');
   assert.ok(body.length>70000,name+' missing complete actor atlas');
 }
});
test('stable atlas source rectangles do not reach outside 1280x1024 image',()=>{
 assert.deepEqual(A.sourceRect(0),{x:0,y:0,width:256,height:256});
 assert.deepEqual(A.sourceRect(5),{x:0,y:256,width:256,height:256});
 assert.deepEqual(A.sourceRect(19),{x:1024,y:768,width:256,height:256});
 for(let i=0;i<20;i++){const r=A.sourceRect(i);assert.ok(r.x+r.width<=1280&&r.y+r.height<=1024)}
});
test('idle, moving, attacking, hit and death use separate animation bands',()=>{
 for(const [name,params] of [['idle',{}],['run',{motion:true}],['attack',{firing:true}],['hit',{hit:true}],['death',{dead:true}]]){
   const [min,max]=A.RANGES[name];for(let i=0;i<20;i++){const n=A.pose('player',{...params,time:i*.12});assert.ok(n>=min&&n<=max,`${name} ${n}`);}
 }
});
test('death > hit > attack > run priority',()=>{
 assert.equal(A.state({dead:true,hit:true,firing:true,motion:true}),'death');
 assert.equal(A.state({hit:true,firing:true,motion:true}),'hit');
 assert.equal(A.state({firing:true,motion:true}),'attack');
});
test('run uses eight distinct frames at player pace',()=>{
 const frames=new Set();for(let i=0;i<16;i++)frames.add(A.pose('player',{motion:true,time:i/11}));
 assert.equal(frames.size,8)
});
test('runtime draws via grid sourceRect and animates defeated enemies',()=>{
 const source=fs.readFileSync(path.join(root,'src/game.js'),'utf8');
 assert.match(source,/Anim\.sourceRect\(pose\)/);assert.match(source,/actorPose\(fallen\.type,\{dead:true/);
 assert.match(source,/defeated\.push\(/);assert.match(source,/ctx\.drawImage\(im,source\.x/);
 assert.match(source,/heroMotion\.moving=Math\.hypot/);
});
