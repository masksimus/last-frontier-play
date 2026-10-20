const test=require('node:test');
const assert=require('node:assert/strict');
const W=require('../src/iso-world.js');

test('three bounded sectors connect every encounter, pickup and objective',()=>{
 assert.equal(W.LEVELS.length,3);
 assert.equal(new Set(W.LEVELS.map(l=>l.map.join('\n'))).size,3);
 for(let index=0;index<W.LEVELS.length;index++){
  const level=W.level(index),width=level.map[0].length;
  assert.equal(width,36);assert.equal(level.map.length,30);
  assert.ok(level.map.every(row=>row.length===width&&/^[.# ]+$/.test(row)));
  assert.ok(level.map[0].split('').every(cell=>cell!=='.'));
  assert.ok(level.map.at(-1).split('').every(cell=>cell!=='.'));
  assert.ok(level.map.every(row=>row[0]!=='.'&&row.at(-1)!=='.'));
  const floorCount=level.map.join('').split('').filter(cell=>cell==='.').length;
  assert.ok(floorCount>300&&floorCount<(index===0?850:650),'the yard and interior floors stay inside the perimeter');
  const queue=[level.spawn],seen=new Set([`${Math.floor(level.spawn.x)},${Math.floor(level.spawn.y)}`]);
  for(let i=0;i<queue.length;i++){
   const point=queue[i];
   for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
    const x=Math.floor(point.x)+dx,y=Math.floor(point.y)+dy,key=`${x},${y}`;
    if(!seen.has(key)&&W.isWalkable(level,x+.5,y+.5)){seen.add(key);queue.push({x:x+.5,y:y+.5});}
   }
  }
  assert.equal(seen.size,floorCount,'no sealed-off unreachable room');
  const targets=[level.exit,...level.terminals,...level.nests,...level.supplies,...level.enemyGroups,...(level.boss?[level.boss]:[])];
  for(const target of targets){
   assert.ok(W.isWalkable(level,target.x,target.y,.3),`${level.id} target ${target.id||target.type||target.kind||'exit'} has body clearance`);
   const path=W.findPath(level,level.spawn,target);
   assert.ok(path.length>0,`${level.id} target is reachable`);
   assert.deepEqual(path.at(-1),{x:Math.floor(target.x)+.5,y:Math.floor(target.y)+.5});
   let previous=level.spawn;
   for(const point of path){assert.equal(Math.abs(point.x-previous.x)+Math.abs(point.y-previous.y),1);previous=point;}
  }
 }
 assert.equal(W.LEVELS[0].terminals.length,1);assert.equal(W.LEVELS[0].nests.length,2);
 assert.equal(W.LEVELS[1].terminals.length,2);assert.equal(W.LEVELS[1].nests.length,3);
 assert.equal(W.LEVELS[2].boss.type,'queen');
});

test('the first sector has an open combat apron, long sightlines and several routes around cover',()=>{
 const yard=W.level(0),floorCount=yard.map.join('').split('').filter(cell=>cell==='.').length;
 assert.equal(yard.environment.kind,'industrial-yard');
 assert.ok(floorCount>750,'the first sector is a broad yard rather than a room network');
 // A full 15-by-10-tile arena joins the entrance and both halves of the yard.
 for(let y=8;y<=17;y++)for(let x=8;x<=22;x++)assert.ok(W.isWalkable(yard,x+.5,y+.5,.3),'central fighting space stays open');
 assert.ok(W.lineOfSight(yard,{x:2.5,y:10.5},{x:33.5,y:10.5}),'a horizontal freight lane crosses the entire yard');
 assert.ok(W.lineOfSight(yard,{x:18.5,y:2.5},{x:18.5,y:27.5}),'a wide north-south lane stays open');
 assert.ok(W.lineOfSight(yard,yard.spawn,{x:29.5,y:8.5}),'the entrance has a long clear combat sightline');
 const start={x:12.5,y:5.5},goal={x:17.5,y:5.5};
 assert.equal(W.lineOfSight(yard,start,goal),false,'a container is real cover for gunfire');
 const path=W.findPath(yard,start,goal);
 assert.ok(path.length>5&&path.length<15,'enemies can flank the container by a short route');
 const body={...start,r:.2};W.move(yard,body,5,0);
 assert.ok(body.x<=12.8&&body.x>=12.6,'solid equipment blocks movement through its art footprint');
});

test('yard dressing describes physical cover separately from perimeter scenery',()=>{
 const yard=W.level(0),{bounds,props,backdrop}=yard.environment,[left,top,right,bottom]=bounds;
 assert.ok(props.filter(prop=>prop.solid).length>=4);
 assert.ok(backdrop.some(prop=>prop.type==='factory')&&backdrop.some(prop=>prop.type==='tower'));
 const ids=[...props,...backdrop].map(prop=>prop.id);
 assert.equal(new Set(ids).size,ids.length,'all explicit scenery has a stable identity');
 for(const prop of props){
  assert.ok(Number.isFinite(prop.x)&&Number.isFinite(prop.y)&&prop.size>0);
  if(!prop.solid){assert.equal(prop.footprint,undefined);continue;}
  const [l,t,r,b]=prop.footprint;
  assert.ok(l>left&&r<right&&t>top&&b<bottom,'cover islands leave a route along the perimeter');
  for(let y=t;y<=b;y++)for(let x=l;x<=r;x++)assert.equal(W.isWalkable(yard,x+.5,y+.5),false,'solid art and the collision grid agree');
 }
 assert.ok(Object.isFrozen(W.LEVELS[0].environment.props[0].footprint));
 yard.environment.props[0].footprint[0]=99;
 assert.notEqual(W.level(0).environment.props[0].footprint[0],99,'renderer metadata cannot corrupt later games');
});

test('level data is isolated from runtime destruction and cannot corrupt future runs',()=>{
 const original=W.LEVELS[0].nests[0].hp,a=W.level(0);a.nests[0].hp=0;a.map[0]='bad';a.spawn.x=99;
 assert.equal(W.level(0).nests[0].hp,original);assert.equal(W.level(0).map[0].length,36);assert.notEqual(W.level(0).spawn.x,99);
 assert.ok(Object.isFrozen(W.LEVELS[0].nests[0]));
 assert.throws(()=>W.level(-1),RangeError);assert.throws(()=>W.level(3),RangeError);
});

test('isometric projection is invertible for fractional and negative world points',()=>{
 for(const point of [{x:0,y:0},{x:36,y:30},{x:3.75,y:19.125},{x:-12.3,y:6.7}]){
  const screen=W.project(point.x,point.y),world=W.unproject(screen.x,screen.y);
  assert.ok(Math.abs(world.x-point.x)<1e-12);assert.ok(Math.abs(world.y-point.y)<1e-12);
 }
 assert.deepEqual(W.project(1,0),{x:48,y:24});assert.deepEqual(W.project(0,1),{x:-48,y:24});
});

const obstacle={map:['########','#..#...#','#..#...#','#......#','########']};

test('circle clearance blocks walls and corners while allowing tangency',()=>{
 assert.equal(W.isWalkable(obstacle,2.7,1.5,.2),true);
 assert.equal(W.isWalkable(obstacle,2.9,1.5,.2),false);
 assert.equal(W.isWalkable(obstacle,2.8,1.5,.2),true);
 assert.equal(W.isWalkable(obstacle,2.9,3.1,.2),false,'circle overlaps diagonal wall corner');
 assert.equal(W.isWalkable(obstacle,3.5,1.5,0),false);
 assert.equal(W.isWalkable(obstacle,-.5,1.5),false);assert.equal(W.isWalkable(obstacle,NaN,1.5),false);
});

test('movement slides along a wall and cannot tunnel through one with a large delta',()=>{
 const body={x:2.5,y:1.5,r:.2};W.move(obstacle,body,1.4,1);
 assert.ok(body.x<=2.8&&body.y>2.4,'blocked x movement preserves free y movement');
 assert.ok(W.isWalkable(obstacle,body.x,body.y,body.r));
 const fast={x:1.5,y:1.5,radius:.2};W.move(obstacle,fast,5,0);
 assert.ok(fast.x<=2.8&&fast.x>=2.6,'substeps stop at the intervening wall');
 assert.equal(fast.y,1.5);
});

test('A* takes the connected passage around a wall and rejects unreachable goals',()=>{
 const start={x:2.5,y:1.5},goal={x:4.5,y:1.5},path=W.findPath(obstacle,start,goal);
 assert.equal(path.length,6);assert.ok(path.some(point=>point.y===3.5));
 let previous=start;
 for(const point of path){assert.ok(W.isWalkable(obstacle,point.x,point.y));assert.equal(Math.abs(previous.x-point.x)+Math.abs(previous.y-point.y),1);previous=point;}
 assert.deepEqual(path.at(-1),goal);
 assert.deepEqual(W.findPath({map:['#####','#.#.#','#####']},{x:1.5,y:1.5},{x:3.5,y:1.5}),[]);
 assert.deepEqual(W.findPath(obstacle,start,{x:3.5,y:1.5}),[]);
 assert.deepEqual(W.findPath(obstacle,start,{x:2.2,y:1.2}),[{x:2.5,y:1.5}]);
});

test('line of sight respects room walls, open passages and closed diagonal corners',()=>{
 assert.equal(W.lineOfSight(obstacle,{x:1.5,y:1.5},{x:2.5,y:2.5}),true);
 assert.equal(W.lineOfSight(obstacle,{x:2.5,y:1.5},{x:4.5,y:1.5}),false);
 assert.equal(W.lineOfSight(obstacle,{x:1.5,y:3.5},{x:6.5,y:3.5}),true);
 const corner={map:['####','#.##','##.#','####']};
 assert.equal(W.lineOfSight(corner,{x:1.5,y:1.5},{x:2.5,y:2.5}),false);
 assert.equal(W.lineOfSight(obstacle,{x:-1,y:1},{x:1.5,y:1.5}),false);
 assert.equal(W.lineOfSight(obstacle,{x:1.5,y:1.5},{x:1.5,y:1.5}),true);
});
