// World coordinates stay in V8 pixels; rendering/physics use metres (50 px/m).
export const UNIT = 50;
export const PROPS = [
 {model:'machine_generatorLarge',x:675,y:520,w:3.2,h:3.8,d:2.4},
 {model:'machine_generator',x:1515,y:520,w:2.7,h:2.6,d:2},
 {model:'barrels',x:1195,y:550,w:1.4,h:1.5,d:1.2},
 {model:'machine_generator',x:735,y:1080,w:3,h:2.8,d:2.2},
 {model:'machine_generatorLarge',x:1590,y:1080,w:3.3,h:4,d:2.6},
 {model:'barrel',x:570,y:825,w:1,h:1.4,d:1},
 {model:'barrels',x:1730,y:755,w:2.2,h:2,d:1.4},
 {model:'machine_generator',x:310,y:1120,w:3,h:2.6,d:2.3},
 {model:'machine_generatorLarge',x:310,y:310,w:3.6,h:4,d:3},
 {model:'barrels',x:1900,y:1380,w:3,h:2,d:2},
];
// Additional cargo cover matches the 3D scene.
for(const [x,y] of [[17,10],[19,10],[28,24],[30,24],[10,19],[35,17]])PROPS.push({model:'cargo',x:x*50,y:y*50,w:1.6,h:1.4,d:1.3,procedural:true});
export const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
export function screenInput(x,y){const z=y/Math.sin(38*Math.PI/180);const length=Math.hypot(x,z);return length?{x:x/length,y:z/length}:{x:0,y:0};}
