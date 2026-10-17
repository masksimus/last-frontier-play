import RAPIER from '@dimforge/rapier3d-compat';
import { PROPS, UNIT } from './world-v9.mjs';
export async function createPhysics(){
 await RAPIER.init();
 const world=new RAPIER.World({x:0,y:0,z:0});
 const controller=world.createCharacterController(.015);controller.setSlideEnabled(true);
 for(const p of PROPS) world.createCollider(RAPIER.ColliderDesc.cuboid(p.w*.46,3,p.d*.46).setTranslation(p.x/UNIT,2,p.y/UNIT));
 // One sensor acts as a reusable query shape; V8 still owns combat and timers.
 const probe=world.createCollider(RAPIER.ColliderDesc.ball(.38).setSensor(true));
 world.step();let contacts=0;
 return {
  move(entity,previous){
   const dx=(entity.x-previous.x)/UNIT,dz=(entity.y-previous.y)/UNIT;
   if(!dx&&!dz)return;
   probe.setShape(new RAPIER.Ball(entity.r/UNIT));probe.setTranslation({x:previous.x/UNIT,y:1,z:previous.y/UNIT});
   controller.computeColliderMovement(probe,{x:dx,y:0,z:dz},RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
   const d=controller.computedMovement();contacts+=controller.numComputedCollisions();
   entity.x=previous.x+d.x*UNIT;entity.y=previous.y+d.z*UNIT;
  },
  wallHit(a,b){const dx=(b.x-a.x)/UNIT,dz=(b.y-a.y)/UNIT,length=Math.hypot(dx,dz);if(!length)return false;const ray=new RAPIER.Ray({x:a.x/UNIT,y:1,z:a.y/UNIT},{x:dx/length,y:0,z:dz/length});return !!world.castRay(ray,length,true,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);},
  status:()=>({engine:'rapier3d',colliders:world.colliders.len(),contacts}),
  dispose(){world.free();},
 };
}
