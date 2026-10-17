import {PROPS,UNIT} from './world-v9.mjs';
// Small cardinal flow fields, cached by target cell and collision radius.
// All enemies of a size share one search; no per-enemy A* allocation.
export function createNavigation(){
 const cache=new Map(),cols=44,rows=32;
 const blocked=(x,y,r)=>PROPS.some(p=>Math.abs((x+.5)*UNIT-p.x)<p.w*UNIT*.46+r&&Math.abs((y+.5)*UNIT-p.y)<p.d*UNIT*.46+r);
 return (entity,target)=>{
  const tx=Math.max(0,Math.min(cols-1,Math.floor(target.x/UNIT))),ty=Math.max(0,Math.min(rows-1,Math.floor(target.y/UNIT)));
  const radius=entity.r,key=`${tx},${ty},${radius}`;
  let field=cache.get(key);
  if(!field){
   if(cache.size>12)cache.clear();const costs=new Int16Array(cols*rows);costs.fill(32767);const queue=new Int16Array(cols*rows);let start=0,end=0;queue[end++]=ty*cols+tx;costs[ty*cols+tx]=0;
   while(start<end){const i=queue[start++],x=i%cols,y=Math.floor(i/cols);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,ni=ny*cols+nx;if(nx<0||ny<0||nx>=cols||ny>=rows||costs[ni]!==32767||blocked(nx,ny,radius+8))continue;costs[ni]=costs[i]+1;queue[end++]=ni;}}
   field=costs;cache.set(key,field);
  }
  const x=Math.max(0,Math.min(cols-1,Math.floor(entity.x/UNIT))),y=Math.max(0,Math.min(rows-1,Math.floor(entity.y/UNIT)));
  let goal=target,best=field[y*cols+x];
  if(best>1){for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=cols||ny>=rows)continue;const cost=field[ny*cols+nx];if(cost<best){best=cost;goal={x:(nx+.5)*UNIT,y:(ny+.5)*UNIT};}}}
  const dx=goal.x-entity.x,dy=goal.y-entity.y,length=Math.hypot(dx,dy);return length?{x:dx/length,y:dy/length}:{x:0,y:0};
 };
}
