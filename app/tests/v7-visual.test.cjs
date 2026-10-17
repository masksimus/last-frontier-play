const t=require('node:test'), a=require('node:assert/strict'), fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
t('three full cut-out enemy sprite atlases replace V5 geometric visuals',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/characters/atlas.json')));
 for(const n of ['drone','runner','brute']){
  const entry=manifest.actors[n];
  a.match(entry.source,/segmented/i);
  a.ok(fs.statSync(path.join(root,entry.file)).size>90000);
  a.ok(fs.statSync(path.join(root,`assets/painted/${n}.png`)).size>3000);
 }
});
t('local character lighting has bounded budget for mobile',()=>{
 const code=fs.readFileSync(path.join(root,'src/game.js'),'utf8');
 a.match(code,/function frontierLocalLights\(/);
 a.match(code,/const max=W<650\?7:14/);
 a.match(code,/visualVersion:9/);
 a.match(code,/fixed 3\/4 painterly poses/);
});
