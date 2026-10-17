import { LoopOnce, LoopRepeat, MathUtils } from 'three';

const reactions = new Set(['HitReact', 'HitRecieve_1', 'Punch', 'Headbutt', 'Shoot_Big']);
export function locomotionClip(kind, moving, firing) {
 if (kind === 'player') return moving ? (firing ? 'Run_Gun_Shoot' : 'Run_Gun') : 'Idle_Gun';
 if (kind === 'drone' || kind === 'runner') return moving ? 'Fast_Flying' : 'Flying_Idle';
 return moving ? 'Walk' : 'Idle';
}

// Events are latched through their authored duration. Repeated render frames never
// restart a hit/death, and a short gameplay flag cannot truncate a one-shot.
export function createActorAnimation(mixer, actions, kind) {
 let current = null, lock = 0, dead = false, wasHit = false, wasAttack = false;
 function play(requested, once = false) {
  const name = actions[requested] ? requested : Object.keys(actions)[0];
  if (!name || (current === name && !once)) return;
  const next = actions[name], old = actions[current];
  next.reset().setLoop(once ? LoopOnce : LoopRepeat, once ? 1 : Infinity);
  next.clampWhenFinished = once;
  next.setEffectiveTimeScale(1).setEffectiveWeight(1).play();
  if (old && old !== next) { old.fadeOut(.13); next.fadeIn(.13); }
  current = name;
  lock = once ? next.getClip().duration : 0;
 }
 return {
  reset() { mixer.stopAllAction(); current = null; lock = 0; dead = wasHit = wasAttack = false; },
  update(motion, dt) {
   dt = Math.min(.05, Math.max(0, dt));
   lock = Math.max(0, lock - dt);
   if (motion.dead && !dead) { dead = true; play('Death', true); }
   if (!dead) {
    const hit = motion.hit && !wasHit, attack = motion.firing && !wasAttack;
    if (hit) play(kind === 'boss' ? 'HitRecieve_1' : 'HitReact', true);
    else if (!lock && attack && kind !== 'player') play(kind === 'boss' ? 'Shoot_Big' : kind === 'brute' ? 'Punch' : 'Headbutt', true);
    else if (!lock) play(locomotionClip(kind, motion.moving, motion.firing));
    // Match cadence to actual travel, including backward strafing while aiming.
    if (!lock && motion.moving && actions[current]) {
     const speed = MathUtils.clamp((motion.speed || 2.5) / (kind === 'player' ? 3.8 : 1.7), .65, 1.65);
     actions[current].setEffectiveTimeScale(motion.reverse ? -speed : speed);
    }
   }
   wasHit = !!motion.hit; wasAttack = !!motion.firing;
   mixer.update(dt);
  },
  status: () => ({ clip: current, locked: lock > 0, dead, oneShot: reactions.has(current) || dead }),
 };
}

export function dampAngle(current, target, dt, speed = 18) {
 const delta = Math.atan2(Math.sin(target-current), Math.cos(target-current));
 return current + delta * (1 - Math.exp(-speed * Math.max(0, dt)));
}
