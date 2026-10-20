const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');
const V = require('../src/combat-v8.js');

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('standing dash follows its stored direction and ignores a change of movement input', () => {
  const p = C.newPlayer();
  const start = { x: p.x, y: p.y };
  Object.assign(p, { dashTime: .2, dashX: 3, dashY: 4 });
  C.advancePlayer(p, { x: 0, y: 0 }, .04);
  C.advancePlayer(p, { x: -1, y: 0 }, .04);
  near(p.x - start.x, p.speed * 3.5 * .08 * .6);
  near(p.y - start.y, p.speed * 3.5 * .08 * .8);
});

test('dash expiry splits the frame between dash and normal movement', () => {
  const p = C.newPlayer();
  const start = { x: p.x, y: p.y };
  Object.assign(p, { dashTime: .01, dashX: 1, dashY: 0 });
  C.advancePlayer(p, { x: 0, y: 1 }, .04);
  near(p.x - start.x, p.speed * 3.5 * .01);
  near(p.y - start.y, p.speed * .03);
  assert.equal(p.dashTime, 0);
  assert.equal(p.dashX, 0);
  assert.equal(p.dashY, 0);
  C.advancePlayer(p, { x: -1, y: 0 }, .04);
  near(p.x - start.x, p.speed * (3.5 * .01 - .04));
});

test('dash stays inside arena and old callers without a stored direction still move', () => {
  const p = C.newPlayer();
  p.x = 46;
  p.dashTime = .2;
  C.advancePlayer(p, { x: -1, y: 0 }, .05);
  assert.equal(p.x, 45);
  p.dashX = 1;
  C.advancePlayer(p, { x: 0, y: 0 }, .05);
  assert.ok(p.x > 45);
});

test('upgrade offers omit exhausted stats while preserving legacy random/count arguments', () => {
  const p = C.newPlayer();
  Object.assign(p, { shots: 5, pierce: 4, fireDelay: .13, speed: 360, magnet: 240 });
  const available = C.sampleUpgrades(() => .4, 8, p).map(u => u.id).sort();
  assert.deepEqual(available, ['damage', 'maxhp', 'regen']);
  assert.deepEqual(C.sampleUpgrades(p).map(u => u.id).sort(), available);
  assert.equal(C.sampleUpgrades(() => .4, 8).length, 8);
  assert.equal(new Set(C.sampleUpgrades(() => .4).map(u => u.id)).size, 3);
  assert.equal(C.sampleUpgrades(() => .4, 0, p).length, 0);
});

test('speed, pickup radius, fire rate and projectile counts stop at playable caps', () => {
  const p = C.newPlayer();
  for (let i = 0; i < 30; i++) {
    for (const upgrade of ['speed', 'magnet', 'rate', 'multishot', 'pierce']) C.applyUpgrade(p, upgrade);
  }
  assert.equal(p.speed, C.UPGRADE_CAPS.speed);
  assert.equal(p.magnet, C.UPGRADE_CAPS.magnet);
  assert.equal(p.fireDelay, C.UPGRADE_CAPS.fireDelay);
  assert.equal(p.shots, C.UPGRADE_CAPS.shots);
  assert.equal(p.pierce, C.UPGRADE_CAPS.pierce);
  assert.ok(C.sampleUpgrades(() => .5, 8, p).every(u => !['speed', 'magnet', 'rate', 'multishot', 'pierce'].includes(u.id)));
});

test('swept collision hits an enemy crossed between frames and refuses exhausted bullets', () => {
  const b = { x: 0, y: 0, vx: 2000, vy: 0, ttl: 1, r: 2, damage: 15, pierce: 0, hit: [] };
  const enemy = { id: 1, x: 40, y: 0, r: 5, hp: 30 };
  C.advanceProjectile(b, .04);
  assert.equal(C.collision(b, enemy), false);
  assert.equal(C.bulletHit(b, enemy), true);
  assert.equal(enemy.hp, 15);
  assert.equal(C.bulletHit(b, { ...enemy, id: 2 }), false);
  assert.equal(C.bulletHit(b, enemy), false);
});

test('swept collision respects trajectory, target radius and segment endpoints', () => {
  const bullet = { prevX: 0, prevY: 0, x: 80, y: 0, r: 2 };
  assert.equal(C.sweptCollision(bullet, { x: 40, y: 6, r: 5 }), true);
  assert.equal(C.sweptCollision(bullet, { x: 40, y: 8, r: 5 }), false);
  assert.equal(C.sweptCollision(bullet, { x: 100, y: 0, r: 5 }), false);
  assert.equal(C.sweptCollision({ x: 8, y: 3, r: 2 }, { x: 8, y: 3, r: 5 }), true);
});

test('projectile expiry cannot travel beyond its remaining weapon range', () => {
  const bullet = { x: 0, y: 0, vx: 1000, vy: 0, ttl: .01, r: 2 };
  C.advanceProjectile(bullet, .05);
  assert.equal(bullet.x, 10);
  assert.equal(bullet.ttl, 0);
  C.advanceProjectile(bullet, .05);
  assert.equal(bullet.x, 10);
});

test('weapon targeting uses actual projectile reach so shotgun does not fire at distant targets', () => {
  const p = C.newPlayer();
  const distant = { x: p.x + 500, y: p.y, r: 18 };
  assert.equal(V.inRange('shotgun', p, distant), false);
  assert.equal(V.inRange('rifle', p, distant), true);
  assert.equal(V.inRange('railgun', p, { ...distant, x: p.x + 1000 }), true);
  for (const weapon of V.ORDER) {
    const bullet = V.makeVolley(weapon, p, 0).bullets[0];
    near(V.weaponRange(weapon), V.shotReach(bullet));
    const edge = { x: p.x + V.weaponRange(weapon) + 28 + bullet.r + 18, y: p.y, r: 18 };
    assert.equal(V.inRange(weapon, p, edge), true);
    assert.equal(V.inRange(weapon, p, { ...edge, x: edge.x + 1 }), false);
  }
});

test('plasma makes real splash projectiles and consumes a single collision', () => {
  const p = C.newPlayer();
  p.shots = 3;
  p.pierce = 4;
  const volley = V.makeVolley('plasma', p, Math.PI / 4);
  assert.equal(volley.bullets.length, 3);
  near(volley.delay, p.fireDelay * 1.5);
  assert.ok(volley.bullets.every(b => b.splash === 76 && b.damage > p.damage && b.pierce === 0));
  assert.ok(volley.bullets.every(b => b.color === '#83edff' && b.glow === '#ac7aff'));
  const b = volley.bullets[0];
  const enemy = { id: 1, x: b.x, y: b.y, r: 15, hp: 100 };
  assert.equal(C.bulletHit(b, enemy), true);
  assert.equal(C.bulletHit(b, { ...enemy, id: 2 }), false);
});
