// Deterministic per-role 20-frame pose selector for a 5x4 packed sprite atlas.
(function(root){'use strict';
const FRAMES=20, FRAME_SIZE=256,COLUMNS=5,ROWS=4;
const RANGES=Object.freeze({idle:[0,3],run:[4,11],attack:[12,15],hit:[16,17],death:[18,19]});
function state({motion=false,firing=false,hit=false,dead=false}={}){
 if(dead)return 'death';if(hit)return 'hit';if(firing)return 'attack';if(motion)return 'run';return 'idle';
}
function pose(kind,options={}){
 const {time=0}=options;const action=state(options);const [first,last]=RANGES[action];
 const speed=action==='run'?(kind==='boss'?5:11):action==='attack'?(kind==='boss'?10:14):action==='hit'?12:action==='death'?5:3;
 return first+(Math.floor(Math.max(0,time)*speed)%(last-first+1));
}
function sourceRect(frame){const index=Math.max(0,Math.min(FRAMES-1,Math.floor(Number.isFinite(frame)?frame:0)));return {x:(index%COLUMNS)*FRAME_SIZE,y:Math.floor(index/COLUMNS)*FRAME_SIZE,width:FRAME_SIZE,height:FRAME_SIZE};}
const api=Object.freeze({pose,state,sourceRect,RANGES,FRAMES,FRAME_SIZE,COLUMNS,ROWS});
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.FrontierAnimation=api;
})(typeof window!=='undefined'?window:globalThis);
