const t=require('node:test'),a=require('node:assert/strict');
const C=require('../src/combat-v8.js');
const p={x:10,y:20,damage:30,pierce:1,shots:2,fireDelay:.4};
t('all three weapons cycle and respond to current choice',()=>{a.equal(C.nextWeapon('rifle'),'shotgun');a.equal(C.nextWeapon('shotgun'),'railgun');a.equal(C.nextWeapon('railgun'),'rifle')});
t('three weapons create different real projectile properties',()=>{const rifle=C.makeVolley('rifle',p,0),shotgun=C.makeVolley('shotgun',p,0),rail=C.makeVolley('railgun',p,0);a.equal(rifle.bullets.length,2);a.equal(shotgun.bullets.length,6);a.equal(rail.bullets.length,1);a.ok(rail.bullets[0].damage>rifle.bullets[0].damage);a.ok(shotgun.bullets[0].ttl<rifle.bullets[0].ttl);a.ok(rail.delay>rifle.delay);a.ok(rail.bullets[0].pierce>p.pierce)});
t('boss fan and rage ring produce different projectile patterns',()=>{const boss={x:1,y:1,anim:0},player={x:100,y:100};const fan=C.bossVolley(boss,player,'fan'),ring=C.bossVolley(boss,player,'ring');a.equal(fan.length,5);a.equal(ring.length,12);a.ok(ring.every(b=>b.damage===12));a.ok(fan.every(b=>b.damage===14))});
t('boss enters rage at 50 percent health',()=>{a.equal(C.bossPhase(50,100),'enraged');a.equal(C.bossPhase(51,100),'normal')});
