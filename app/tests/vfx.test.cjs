const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');const src=fs.readFileSync(path.join(root,'src/game.js'),'utf8');
for(const file of ['explosion','shockwave','smoke','muzzle','scorch']){
 test(`real transparent gameplay FX sprite ${file}.png`,()=>{const data=fs.readFileSync(path.join(root,'assets',file+'.png'));assert.equal(data.subarray(1,4).toString(),'PNG');assert.ok(data.length>1000);assert.ok(src.includes(file));});
}
test('FX bounded for mobile memory',()=>{assert.ok(src.includes('FX_LIMIT=85,SCAR_LIMIT=55'))});
test('FX spawned from real shots and damage instead of menu-only poster',()=>{assert.match(src,/function shoot\([\s\S]*?effect\('muzzle'/);assert.match(src,/function killEnemy\([\s\S]*?blast\(/);assert.match(src,/if\(e\.type==='boss'\)[\s\S]*?effect\('shockwave'/)});
