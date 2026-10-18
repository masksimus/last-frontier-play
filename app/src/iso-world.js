/* Original containment-facility layouts. Coordinates are world tiles; cell centres are n + .5. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.OutbreakWorld=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';

const WIDTH=36,HEIGHT=30;

// Rectangles describe traversable interiors. Deriving the surrounding shell keeps
// every room and connecting passage enclosed, including concave doorways.
function makeMap(rectangles){
 const cells=Array.from({length:HEIGHT},()=>Array(WIDTH).fill(' '));
 for(const [left,top,right,bottom] of rectangles){
  for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++)cells[y][x]='.';
 }
 const floors=[];
 for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++)if(cells[y][x]==='.')floors.push([x,y]);
 for(const [x,y] of floors)for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){
  const row=cells[y+oy];if(row&&row[x+ox]===' ')row[x+ox]='#';
 }
 return cells.map(row=>row.join(''));
}

// The loading yard has one connected apron, with solid equipment islands rather
// than room shells. A prop footprint is inclusive tile bounds and is shared by
// collision, line of sight and the renderer; visual-only dressing has no footprint.
const FREIGHT_BOUNDS=[2,2,33,27];
const FREIGHT_PROPS=[
 {id:'freight-container-north',type:'container',x:15,y:5.5,size:245,solid:true,footprint:[13,4,16,6]},
 {id:'freight-generator-west',type:'generator',x:5.5,y:13.5,size:180,solid:true,footprint:[4,12,6,14]},
 {id:'freight-container-east',type:'container',x:25,y:13.5,size:240,solid:true,footprint:[23,12,26,14]},
 {id:'freight-generator-south',type:'generator',x:16,y:19.5,size:195,solid:true,footprint:[14,18,17,20]},
 {id:'freight-barrels-east',type:'barrels',x:29.5,y:15.5,size:155,solid:true,footprint:[28,14,30,16]},
 {id:'freight-container-south',type:'container',x:15,y:24.5,size:240,solid:true,footprint:[13,23,16,25]},
 {id:'freight-barrels-entry',type:'barrels',x:3.1,y:3.6,size:95,solid:false},
 {id:'freight-crates-entry',type:'crate',x:3,y:10.6,size:90,solid:false},
 {id:'freight-barrels-north',type:'barrels',x:19.5,y:3.1,size:100,solid:false},
 {id:'freight-crates-west',type:'crate',x:3.1,y:18,size:92,solid:false},
 {id:'freight-barrels-exit',type:'barrels',x:32.6,y:26.2,size:100,solid:false}
];
function makeYard(bounds,props){
 const cells=makeMap([bounds]).map(row=>row.split(''));
 for(const prop of props){
  if(!prop.solid||!prop.footprint)continue;
  const [left,top,right,bottom]=prop.footprint;
  for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++)cells[y][x]='#';
 }
 return cells.map(row=>row.join(''));
}

const LEVELS=[
 {
  id:'freight',name:'01 / ПРОМЫШЛЕННЫЙ ДВОР',subtitle:'Комплекс «Рубеж» · открытая грузовая площадка A-7',
  brief:'Связь с комплексом оборвалась двадцать минут назад. Промышленный двор захвачен заражёнными, разгрузочный шлюз заперт. Пробейся через открытую площадку между контейнерами, включи резервное питание на севере и выжги два очага заражения.',
  objective:'Включить питание двора, уничтожить 2 гнезда и дойти до шлюза.',
  map:makeYard(FREIGHT_BOUNDS,FREIGHT_PROPS),
  environment:{kind:'industrial-yard',floor:'wet-concrete',bounds:FREIGHT_BOUNDS,props:FREIGHT_PROPS,
   backdrop:[
    {id:'freight-factory-west',type:'factory',x:3,y:1,size:500},
    {id:'freight-tower-west',type:'tower',x:11,y:.7,size:235},
    {id:'freight-factory-side',type:'factory',x:.7,y:10.2,size:490},
    {id:'freight-tower-side',type:'tower',x:.7,y:20.5,size:240},
    {id:'freight-factory-north',type:'factory',x:21,y:1,size:530},
    {id:'freight-tower-east',type:'tower',x:32,y:.7,size:250}
   ]},
  spawn:{x:4.5,y:6.5},exit:{x:30.5,y:24.5},
  terminals:[{id:'freight-power',x:29.5,y:5.5,label:'РЕЗЕРВНОЕ ПИТАНИЕ'}],
  nests:[{id:'freight-nest-a',x:5.5,y:23.5,hp:200},{id:'freight-nest-b',x:22.5,y:23.5,hp:240}],
  supplies:[{x:10.5,y:4.5,kind:'ammo'},{x:21.5,y:4.5,kind:'credits'},{x:17.5,y:13.5,kind:'medkit'},{x:11.5,y:24.5,kind:'ammo'},{x:30.5,y:19.5,kind:'credits'}],
  enemyGroups:[{x:22.5,y:7.5,type:'crawler',count:8},{x:29.5,y:8.5,type:'crawler',count:6},{x:7.5,y:19.5,type:'crawler',count:7},{x:17.5,y:15.5,type:'spitter',count:4},{x:23.5,y:21.5,type:'crawler',count:8},{x:29.5,y:24.5,type:'brute',count:3},{x:9.5,y:24.5,type:'crawler',count:4}],
  boss:null
 },
 {
  id:'laboratory',name:'02 / СЕКТОР БИОИЗОЛЯЦИИ',subtitle:'Исследовательский блок · карантин нарушен',
  brief:'Инфекция вышла из тестовых камер. Три очага питают заражённых через технические каналы. Сбрось блокировку на двух пультах; путь к реактору откроется только после полной зачистки.',
  objective:'Отключить 2 пульта карантина, уничтожить 3 гнезда и очистить лабораторию.',
  map:makeMap([[16,3,19,26],[2,2,12,9],[23,2,33,9],[2,13,12,19],[23,13,33,19],[2,23,12,27],[23,23,33,27],[10,5,25,7],[10,15,25,17],[10,24,25,26]]),
  spawn:{x:17.5,y:26.5},exit:{x:17.5,y:3.5},
  terminals:[{id:'lab-west',x:5.5,y:4.5,label:'ЗАПАДНЫЙ КАРАНТИН'},{id:'lab-east',x:30.5,y:5.5,label:'ВОСТОЧНЫЙ КАРАНТИН'}],
  nests:[{id:'lab-nest-a',x:4.5,y:16.5,hp:300},{id:'lab-nest-b',x:31.5,y:16.5,hp:300},{id:'lab-nest-c',x:4.5,y:25.5,hp:320}],
  supplies:[{x:11.5,y:25.5,kind:'ammo'},{x:26.5,y:25.5,kind:'medkit'},{x:30.5,y:25.5,kind:'credits'},{x:10.5,y:14.5,kind:'ammo'},{x:25.5,y:18.5,kind:'credits'},{x:6.5,y:7.5,kind:'medkit'},{x:28.5,y:3.5,kind:'ammo'}],
  enemyGroups:[{x:6.5,y:25.5,type:'crawler',count:7},{x:29.5,y:25.5,type:'crawler',count:7},{x:6.5,y:16.5,type:'crawler',count:9},{x:29.5,y:16.5,type:'crawler',count:9},{x:17.5,y:12.5,type:'spitter',count:5},{x:7.5,y:5.5,type:'crawler',count:7},{x:28.5,y:5.5,type:'spitter',count:6},{x:17.5,y:8.5,type:'brute',count:4}],
  boss:null
 },
 {
  id:'reactor',name:'03 / СЕРДЦЕ РЕАКТОРА',subtitle:'Энергетический блок · критическое заражение',
  brief:'В реакторном зале поселилась матка. Отключи два контура охлаждения, уничтожь очаги и ликвидируй источник заражения. После зачистки доберись до аварийного лифта на востоке.',
  objective:'Отключить 2 контура, уничтожить гнезда и матку. Выйти через аварийный лифт.',
  map:makeMap([[11,9,24,22],[2,2,9,8],[26,2,33,8],[2,23,9,27],[26,23,33,27],[5,5,29,7],[5,5,7,25],[28,5,30,25],[5,24,29,26],[6,13,29,15],[16,5,19,11],[16,21,19,26]]),
  spawn:{x:5.5,y:25.5},exit:{x:30.5,y:25.5},
  terminals:[{id:'coolant-west',x:4.5,y:4.5,label:'КОНТУР ОХЛАЖДЕНИЯ А'},{id:'coolant-east',x:31.5,y:4.5,label:'КОНТУР ОХЛАЖДЕНИЯ Б'}],
  nests:[{id:'reactor-nest-a',x:12.5,y:11.5,hp:400},{id:'reactor-nest-b',x:23.5,y:20.5,hp:400}],
  supplies:[{x:8.5,y:25.5,kind:'ammo'},{x:3.5,y:24.5,kind:'medkit'},{x:8.5,y:3.5,kind:'ammo'},{x:27.5,y:3.5,kind:'credits'},{x:23.5,y:10.5,kind:'ammo'},{x:12.5,y:21.5,kind:'medkit'},{x:29.5,y:23.5,kind:'ammo'}],
  enemyGroups:[{x:6.5,y:18.5,type:'crawler',count:8},{x:5.5,y:6.5,type:'spitter',count:6},{x:17.5,y:6.5,type:'crawler',count:8},{x:29.5,y:6.5,type:'spitter',count:6},{x:14.5,y:13.5,type:'crawler',count:10},{x:21.5,y:18.5,type:'crawler',count:10},{x:29.5,y:18.5,type:'brute',count:6},{x:17.5,y:24.5,type:'crawler',count:10}],
  boss:{x:18.5,y:14.5,type:'queen',hp:2400}
 }
];

function freezeTree(value){if(value&&typeof value==='object'){Object.values(value).forEach(freezeTree);Object.freeze(value);}return value;}
freezeTree(LEVELS);

function level(index){
 if(!Number.isInteger(index)||index<0||index>=LEVELS.length)throw new RangeError('Unknown containment level: '+index);
 return JSON.parse(JSON.stringify(LEVELS[index]));
}
function floorAt(map,x,y){return Number.isInteger(x)&&Number.isInteger(y)&&!!map[y]&&map[y][x]==='.';}
function isWalkable(layout,x,y,r=.2){
 if(!layout||!Array.isArray(layout.map)||!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(r)||r<0)return false;
 const map=layout.map;
 if(!floorAt(map,Math.floor(x),Math.floor(y)))return false;
 if(r===0)return true;
 for(let ty=Math.floor(y-r);ty<=Math.floor(y+r);ty++)for(let tx=Math.floor(x-r);tx<=Math.floor(x+r);tx++){
  if(floorAt(map,tx,ty))continue;
  const cx=Math.max(tx,Math.min(x,tx+1)),cy=Math.max(ty,Math.min(y,ty+1));
  if((x-cx)*(x-cx)+(y-cy)*(y-cy)<r*r-1e-12)return false;
 }
 return true;
}
function move(layout,body,dx,dy){
 if(!body||!Number.isFinite(body.x)||!Number.isFinite(body.y)||!Number.isFinite(dx)||!Number.isFinite(dy))return body;
 const r=body.radius??body.r??.2,steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))/.16)),sx=dx/steps,sy=dy/steps;
 for(let i=0;i<steps;i++){
  let moved=false;
  if(sx&&isWalkable(layout,body.x+sx,body.y,r)){body.x+=sx;moved=true;}
  if(sy&&isWalkable(layout,body.x,body.y+sy,r)){body.y+=sy;moved=true;}
  if(!moved)break;
 }
 return body;
}

// A small binary heap keeps repeated pursuit paths bounded on the room grid.
function push(heap,node){let i=heap.length;heap.push(node);while(i){const p=(i-1)>>1;if(heap[p].f<=node.f)break;heap[i]=heap[p];i=p;}heap[i]=node;}
function pop(heap){const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let child=i*2+1;if(child+1<heap.length&&heap[child+1].f<heap[child].f)child++;if(heap[child].f>=last.f)break;heap[i]=heap[child];i=child;}heap[i]=last;}return first;}
function findPath(layout,from,to){
 if(!layout||!Array.isArray(layout.map)||!from||!to||![from.x,from.y,to.x,to.y].every(Number.isFinite))return [];
 const map=layout.map,sy=Math.floor(from.y),sx=Math.floor(from.x),ty=Math.floor(to.y),tx=Math.floor(to.x);
 if(!floorAt(map,sx,sy)||!floorAt(map,tx,ty))return [];
 const width=map.reduce((w,row)=>Math.max(w,row.length),0),start=sy*width+sx,goal=ty*width+tx;
 if(start===goal)return [{x:tx+.5,y:ty+.5}];
 const best=new Map([[start,0]]),previous=new Map(),closed=new Set(),open=[];
 push(open,{id:start,x:sx,y:sy,g:0,f:Math.abs(tx-sx)+Math.abs(ty-sy)});
 while(open.length){
  const current=pop(open);if(closed.has(current.id))continue;
  if(current.id===goal){
   const path=[];let id=goal;
   while(id!==start){path.push({x:id%width+.5,y:Math.floor(id/width)+.5});id=previous.get(id);}
   return path.reverse();
  }
  closed.add(current.id);
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
   const x=current.x+dx,y=current.y+dy,id=y*width+x,g=current.g+1;
   if(!floorAt(map,x,y)||closed.has(id)||g>=(best.get(id)??Infinity))continue;
   best.set(id,g);previous.set(id,current.id);push(open,{id,x,y,g,f:g+Math.abs(tx-x)+Math.abs(ty-y)});
  }
 }
 return [];
}
function project(x,y){return {x:(x-y)*48,y:(x+y)*24};}
function unproject(x,y){return {x:x/96+y/48,y:y/48-x/96};}
function lineOfSight(layout,a,b){
 if(!layout||!Array.isArray(layout.map)||!a||!b||![a.x,a.y,b.x,b.y].every(Number.isFinite))return false;
 const map=layout.map;let x=Math.floor(a.x),y=Math.floor(a.y);const endX=Math.floor(b.x),endY=Math.floor(b.y);
 if(!floorAt(map,x,y)||!floorAt(map,endX,endY))return false;
 const dx=b.x-a.x,dy=b.y-a.y,stepX=Math.sign(dx),stepY=Math.sign(dy),deltaX=dx===0?Infinity:Math.abs(1/dx),deltaY=dy===0?Infinity:Math.abs(1/dy);
 let edgeX=dx>0?(x+1-a.x)*deltaX:dx<0?(a.x-x)*deltaX:Infinity;
 let edgeY=dy>0?(y+1-a.y)*deltaY:dy<0?(a.y-y)*deltaY:Infinity;
 while(x!==endX||y!==endY){
  if(Math.abs(edgeX-edgeY)<1e-12){
   // A ray touching two wall corners cannot shoot between closed rooms.
   if(!floorAt(map,x+stepX,y)||!floorAt(map,x,y+stepY))return false;
   x+=stepX;y+=stepY;edgeX+=deltaX;edgeY+=deltaY;
  }else if(edgeX<edgeY){x+=stepX;edgeX+=deltaX;}
  else{y+=stepY;edgeY+=deltaY;}
  if(!floorAt(map,x,y))return false;
 }
 return true;
}

return {LEVELS,level,isWalkable,move,findPath,project,unproject,lineOfSight};
});
