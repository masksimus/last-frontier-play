const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../src/campaign.js'),C=require('../src/core.js');
test('campaign contains ten waves, three distinct sectors, bosses and weapon progression',()=>{
 assert.deepEqual(Array.from({length:10},(_,i)=>M.sectorFor(i+1).id),['perimeter','perimeter','perimeter','foundry','foundry','foundry','uplink','uplink','uplink','uplink']);
 assert.equal(M.unlockedWeapons(1).length,2);assert.equal(M.unlockedWeapons(4).length,3);assert.equal(M.unlockedWeapons(7).length,4);
 assert.equal(new Set(M.SECTORS.map(s=>s.relays[0].x+','+s.relays[0].y)).size,3);
});
test('relays charge only in range during active simulation; completed relays stay charged',()=>{
 const relays=M.SECTORS[0].relays;let p=M.newObjectives();
 for(let i=0;i<110;i++)p=M.tickObjectives(p,relays[0],relays,.05).progress;
 assert.deepEqual(p,[5,0]);assert.equal(M.objectivesComplete(p),false);
 assert.deepEqual(M.tickObjectives(p,{x:1100,y:800},relays,.05).progress,p);
 for(let i=0;i<110;i++)p=M.tickObjectives(p,relays[1],relays,.05).progress;
 assert.equal(M.objectivesComplete(p),true);
});
test('spawn remains away from a player pressed against every world corner',()=>{
 for(const player of [{x:45,y:45},{x:2155,y:45},{x:45,y:1555},{x:2155,y:1555}]){
  const p=M.spawnPoint(player,2200,1600,390,844,false,()=>.625);
  assert.ok(C.distance(player,p)>=310);assert.ok(p.x>=65&&p.x<=2135&&p.y>=65&&p.y<=1535);
 }
});
test('checkpoint round trips with strict schema, starts sector and rejects corruption',()=>{
 const game={wave:5,player:C.newPlayer(),difficulty:'standard',weapon:'railgun',score:1200,time:143};
 const saved=M.makeCheckpoint(game);assert.equal(saved.wave,4);assert.deepEqual(M.parseCheckpoint(JSON.stringify(saved)),saved);
 for(const raw of ['{','null','{}',JSON.stringify({...saved,version:99}),JSON.stringify({...saved,wave:10}),JSON.stringify({...saved,player:{...saved.player,damage:Infinity}}),JSON.stringify({...saved,player:{...saved.player,hp:NaN}})])assert.equal(M.parseCheckpoint(raw),null);
});
