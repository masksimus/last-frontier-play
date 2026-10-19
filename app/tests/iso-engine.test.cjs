'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const World = require('../src/iso-world.js');

const engine = fs.readFileSync(path.join(__dirname, '../src/iso-game.js'), 'utf8');
const SAVE_KEY = 'last-frontier-outbreak-v1';

// Only browser plumbing is replaced. The actual engine, collision world,
// controls, projectile simulation and checkpoint validator run unchanged.
function boot({ storage = new Map(), search = '?test=1' } = {}) {
  class Element {
    constructor() {
      this.classList = { toggle() {}, add() {}, remove() {} };
      this.style = {};
      this.dataset = {};
      this.handlers = new Map();
      this.value = 'standard';
    }
    addEventListener(event, listener) { this.handlers.set(event, listener); }
    setAttribute() {}
    setPointerCapture() {}
    replaceChildren() {}
    append() {}
    querySelector() { return null; }
  }
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  const documentHandlers = new Map();
  const windowHandlers = new Map();
  let animationFrame;
  const context = {
    console, Math, URLSearchParams,
    performance: { now: () => 100 },
    location: { search },
    innerWidth: 1280, innerHeight: 720,
    matchMedia: () => ({ matches: false }),
    navigator: { maxTouchPoints: 0 },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key)
    },
    requestAnimationFrame(callback) { animationFrame = callback; },
    document: {
      body: { dataset: {} },
      getElementById: element,
      querySelectorAll: () => [],
      createElement: () => new Element(),
      addEventListener: (event, listener) => documentHandlers.set(event, listener)
    },
    addEventListener: (event, listener) => windowHandlers.set(event, listener),
    OutbreakWorld: World,
    OutbreakRenderer: {
      render() {},
      screenToWorld: (x, y) => ({ x, y }),
      status: () => ({ assetsReady: true })
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(engine, context, { filename: 'iso-game.js' });
  const click = id => element(id).handlers.get('click')();
  const start = () => { click('start'); click('deploy'); };
  return { context, element, click, start, storage, debug: context.OutbreakDebug, windowHandlers, documentHandlers, frame: now => animationFrame(now) };
}

function physicsArena() {
  const game = boot(); game.start();
  const state = game.debug.getState();
  state.nests = []; state.pickups = [];
  state.level.map = Array.from({ length: 24 }, (_, y) => Array.from({ length: 24 }, (_, x) =>
    x > 0 && y > 0 && x < 23 && y < 23 ? '.' : '#').join(''));
  game.debug.teleport(10, 10); state.player.invulnerable = 1000;
  state.enemies = [{ ...state.enemies[0], id: 5000, type: 'brute', r: .36, x: 15, y: 10, hp: 2000, maxHp: 2000, alerted: true, telegraph: 100, cooldown: 100, path: [] }];
  return game;
}

function key(game, code, pressed = true) {
  game.documentHandlers.get(pressed ? 'keydown' : 'keyup')({ code, target: { tagName: 'BODY' }, repeat: false, preventDefault() {} });
}

test('combat waits for held left mouse input before spending ammunition', () => {
  const game = boot();
  game.start();
  const state = game.debug.getState();
  state.player.invulnerable = 1000;
  const initialClip = state.player.clip.rifle;
  game.debug.step(2);
  assert.equal(state.player.clip.rifle, initialClip, 'idle combat must not auto-fire');
  assert.equal(state.bullets.length, 0);

  game.element('stage').handlers.get('pointerdown')({
    pointerType: 'mouse', pointerId: 1, button: 0,
    clientX: state.player.x + 5, clientY: state.player.y,
    preventDefault() {}
  });
  game.debug.step(.2);
  assert.ok(state.player.clip.rifle < initialClip, 'holding the left mouse button fires');
  game.windowHandlers.get('pointerup')({ pointerType: 'mouse' });
  const releasedClip = state.player.clip.rifle;
  game.debug.step(.3);
  assert.equal(state.player.clip.rifle, releasedClip, 'releasing the mouse stops firing');
});

test('a muzzle offset cannot shoot through the freight-room wall corner', () => {
  const game = boot();
  game.start();
  const state = game.debug.getState();
  state.enemies = [];
  for (const nest of state.nests) nest.budget = 0;
  assert.equal(game.debug.teleport(12.78, 6.78), true);
  state.player.angle = 40 * Math.PI / 180;
  const muzzle = {
    x: state.player.x + Math.cos(state.player.angle) * .4,
    y: state.player.y + Math.sin(state.player.angle) * .4
  };
  assert.equal(World.isWalkable(state.level, muzzle.x, muzzle.y, .035), true,
    'the regression requires a muzzle endpoint on the next floor');
  assert.equal(World.lineOfSight(state.level, state.player, muzzle), false,
    'a short wall corner lies between the player and that endpoint');
  const target = {
    id: 999, type: 'crawler', x: 13.55, y: 7.43, r: .22,
    hp: 1, maxHp: 45, angle: 0, anim: 0, attackFlash: 0,
    cooldown: 100, path: [], repath: 100, alerted: false,
    charge: 0, telegraph: 0, aliveTime: 0
  };
  assert.equal(World.isWalkable(state.level, target.x, target.y, target.r), true);
  state.enemies = [target];
  game.debug.fire();
  game.debug.step(.04);
  assert.equal(target.hp, 1, 'the target behind the corner remains unharmed');
  assert.equal(state.bullets.length, 0, 'the wall absorbs the shot');

  // Positive control: the same rifle hits the same target across open floor.
  assert.equal(game.debug.teleport(12.78, 7.5), true);
  target.x = 13.55; target.y = 7.5;
  state.player.angle = 0; state.player.cooldown = 0;
  game.debug.fire();
  game.debug.step(.04);
  assert.ok(target.hp <= 0, 'a clear shot still hits');
});

test('checkpoint validation rejects an inherited weapon name', () => {
  const storage = new Map();
  const original = boot({ storage });
  original.start();
  const valid = boot({ storage });
  valid.click('continue');
  assert.equal(valid.debug.snapshot().mode, 'briefing', 'the unmodified checkpoint is valid');

  const corrupted = JSON.parse(storage.get(SAVE_KEY));
  corrupted.player.weapon = 'constructor';
  corrupted.player.owned.constructor = true;
  storage.set(SAVE_KEY, JSON.stringify(corrupted));
  const restored = boot({ storage });
  assert.equal(restored.element('continue').disabled, true);
  restored.click('continue');
  assert.equal(restored.debug.snapshot().mode, 'menu', 'invalid data cannot enter gameplay');
});

test('normal URLs expose no test controls while the production game starts', () => {
  for (const search of ['', '?test=0']) {
    const game = boot({ search });
    assert.equal(Object.hasOwn(game.context, 'OutbreakDebug'), false);
    game.start();
    assert.equal(game.context.document.body.dataset.mode, 'playing');
  }
});

test('deployment starts with eight visible threats outside contact range and a safe opening', () => {
  const game = boot(); game.start();
  const state = game.debug.getState();
  const entrance = state.enemies.filter(enemy => {
    const distance = Math.hypot(enemy.x - state.player.x, enemy.y - state.player.y);
    return distance > 2.8 && distance <= 5.8 && World.lineOfSight(state.level, state.player, enemy);
  });
  assert.ok(entrance.length >= 8, 'the first room contains an immediate, visible fight');
  const hp = state.player.hp;
  game.debug.step(1);
  assert.equal(state.player.hp, hp, 'no unavoidable contact damage during the first second');
  assert.equal(state.wave, 1);
});

test('all ten waves spawn finite groups and wait for the current group to clear', () => {
  const game = boot(); game.start();
  const seen = [];
  for (let sector = 0; sector < 3; sector++) {
    const state = game.debug.getState();
    state.player.invulnerable = 1000;
    for (const nest of state.nests) game.debug.damageNest(nest, 100000);
    const end = [3, 6, 10][sector];
    while (true) {
      const wave = state.wave; seen.push(wave);
      assert.ok(state.enemies.length > 0, 'every wave has actual spawned enemies');
      game.debug.step(.02);
      assert.equal(state.wave, wave, 'time alone cannot advance a wave');
      if (wave === end) assert.ok(state.enemies.some(enemy => enemy.isBoss), 'each sector ends with a real boss');
      for (const enemy of state.enemies) game.debug.damageEnemy(enemy, 100000);
      game.debug.step(.02);
      if (wave === end) break;
      assert.equal(state.wave, wave + 1);
    }
    assert.equal(game.debug.snapshot().pendingWaves, 0);
    assert.equal(state.waveProgress, 1);
    if (sector < 2) { game.debug.finishLevel(); game.click('shopContinue'); game.click('deploy'); }
  }
  assert.deepEqual(seen, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(game.debug.getState().bossesKilled, 3);
});

test('combat upgrades spend credits, respect caps and change weapon damage and health', () => {
  const game = boot();
  assert.equal(game.debug.purchaseUpgrade('damage'), false, 'menu purchases are rejected');
  game.start();
  const p = game.debug.getState().player;
  p.cash = 180;
  assert.equal(game.debug.purchaseUpgrade('damage'), true);
  assert.equal(p.cash, 0); assert.equal(p.upgrades.damage, 1);
  assert.equal(game.debug.purchaseUpgrade('damage'), false, 'unaffordable purchases have no effect');
  assert.equal(game.debug.purchaseUpgrade('constructor'), false);
  p.cash = 10000;
  for (let i = 1; i < 6; i++) assert.equal(game.debug.purchaseUpgrade('damage'), true);
  const cappedCash = p.cash;
  assert.equal(game.debug.purchaseUpgrade('damage'), false);
  assert.equal(p.upgrades.damage, 6); assert.equal(p.cash, cappedCash);
  const oldMax = p.maxHp;
  assert.equal(game.debug.purchaseUpgrade('health'), true);
  assert.equal(p.maxHp, oldMax + 20);
  game.debug.fire();
  assert.ok(game.debug.getState().bullets[0].damage >= 23 * 1.66 - .0001);
});

test('earned XP raises level, expands health and survives a validated checkpoint', () => {
  const storage = new Map(), game = boot({ storage }); game.start();
  const p = game.debug.getState().player;
  p.hp = 70;
  game.debug.awardXP(80);
  assert.equal(p.level, 2); assert.equal(p.xp, 0); assert.equal(p.maxHp, 125); assert.equal(p.hp, 90);
  p.cash = 1000; game.debug.purchaseUpgrade('health');
  game.debug.finishLevel();
  const restored = boot({ storage }); restored.click('continue');
  const saved = restored.debug.getState().player;
  assert.equal(saved.level, 2); assert.equal(saved.maxHp, 145); assert.equal(saved.upgrades.health, 1);
  const corrupted = JSON.parse(storage.get(SAVE_KEY));
  corrupted.player.upgrades.speed = 99;
  storage.set(SAVE_KEY, JSON.stringify(corrupted));
  assert.equal(boot({ storage }).element('continue').disabled, true);
});

test('dash grants a short dodge but cannot cross a solid wall or bypass its cooldown', () => {
  const game = boot(); game.start();
  const state = game.debug.getState(), p = state.player;
  assert.equal(game.debug.teleport(12.7, 6.5), true);
  p.angle = 0; p.invulnerable = 0;
  assert.equal(game.debug.dashAction(), true);
  const hp = p.hp, armor = p.armor;
  game.debug.damagePlayer(100);
  assert.equal(p.hp, hp); assert.equal(p.armor, armor);
  assert.equal(game.debug.dashAction(), false);
  game.debug.step(.2);
  assert.ok(p.x <= 12.781, 'swept body collision stops at the wall');
  assert.ok(World.isWalkable(state.level, p.x, p.y, p.r));
  assert.equal(p.dashTime, 0); assert.ok(p.dashCooldown > 3.5);
});

test('shockwave spends real energy, damages visible enemies and respects wall occlusion', () => {
  const game = boot(); game.start();
  const state = game.debug.getState();
  assert.equal(game.debug.teleport(12.78, 6.78), true);
  const template = state.enemies[0];
  const visible = { ...template, id: 991, x: 11.5, y: 6.5, hp: 300, maxHp: 300 };
  const hidden = { ...template, id: 992, x: 13.55, y: 7.43, hp: 300, maxHp: 300 };
  assert.equal(World.lineOfSight(state.level, state.player, hidden), false);
  state.enemies = [visible, hidden]; state.resources = 5;
  assert.equal(game.debug.useAbility(), true);
  assert.equal(state.resources, 0); assert.equal(visible.hp, 120); assert.equal(hidden.hp, 300);
  assert.equal(state.player.abilityCooldown, 8);
  assert.equal(game.debug.useAbility(), false);
});

test('legacy checkpoints migrate and resource collection is distinct from spending energy', () => {
  const storage = new Map(), game = boot({ storage }); game.start();
  const legacy = JSON.parse(storage.get(SAVE_KEY));
  for (const key of ['level', 'xp', 'xpNeed', 'upgrades']) delete legacy.player[key];
  for (const key of ['resources', 'resourcesCollected', 'bossesKilled', 'generatorActivated']) delete legacy[key];
  storage.set(SAVE_KEY, JSON.stringify(legacy));
  const migrated = boot({ storage }); migrated.click('continue'); migrated.click('deploy');
  const state = migrated.debug.getState();
  assert.equal(state.player.level, 1); assert.equal(state.player.maxHp, 120);
  state.pickups.push({ x: state.player.x, y: state.player.y, kind: 'resource', amount: 3, age: 0 });
  migrated.debug.step(.02);
  assert.equal(state.resources, 8); assert.equal(state.resourcesCollected, 3);
  migrated.debug.useAbility();
  assert.equal(state.resources, 3); assert.equal(state.resourcesCollected, 3);
});

test('boss minigun waits for its visible warning before firing actual projectiles', () => {
  const game = boot(); game.start();
  const state = game.debug.getState();
  for (const nest of state.nests) game.debug.damageNest(nest, 100000);
  while (state.wave < 3) {
    for (const enemy of state.enemies) game.debug.damageEnemy(enemy, 100000);
    game.debug.step(.02);
  }
  const boss = state.enemies.find(enemy => enemy.isBoss);
  assert.ok(boss.maxHp >= 800);
  state.enemies = [boss]; state.enemyBullets = [];
  boss.x = 8.5; boss.y = 6.5; boss.cooldown = 0; boss.alerted = true;
  state.player.invulnerable = 1000;
  game.debug.step(.02);
  assert.ok(boss.telegraph > .6); assert.equal(state.enemyBullets.length, 0);
  game.debug.step(.74);
  assert.ok(state.enemyBullets.some(bullet => bullet.kind === 'fire' && bullet.damage > 0));
  assert.ok(state.enemyBullets.every(bullet => bullet.sourceType === 'brute' && bullet.sourceIsBoss),
    'the renderer can distinguish a titan gun from the marine muzzle');
});

test('a packed HD horde spreads its bodies while continuing pursuit', () => {
  const game = boot(); game.start();
  const state = game.debug.getState();
  state.nests = [];
  state.player.x = 4.5; state.player.y = 10; state.player.invulnerable = 1000;
  // An open arena isolates crowd steering from the particular production layout;
  // the real world mover and collision circles remain active.
  state.level.map = Array.from({ length: 24 }, (_, y) => Array.from({ length: 24 }, (_, x) =>
    x > 0 && y > 0 && x < 23 && y < 23 ? '.' : '#').join(''));
  const template = state.enemies[0];
  state.enemies = Array.from({ length: 6 }, (_, i) => Object.assign({}, template, {
    id: 1000 + i, x: 11 + (i % 3) * .08, y: 10 + Math.floor(i / 3) * .08,
    type: i < 4 ? 'crawler' : 'brute', isBoss: i === 5, r: i < 4 ? .22 : .36,
    hp: 1000, maxHp: 1000, alerted: true, cooldown: 100, path: []
  }));
  // Exact shared centres previously never separated because sd2 was zero.
  state.enemies[1].x = state.enemies[0].x; state.enemies[1].y = state.enemies[0].y;
  const meanDistance = () => state.enemies.reduce((sum, enemy) => sum +
    Math.hypot(enemy.x - state.player.x, enemy.y - state.player.y), 0) / state.enemies.length;
  const initialDistance = meanDistance();
  game.debug.step(2);
  let closest = Infinity, closestToBoss = Infinity;
  for (let i = 0; i < state.enemies.length; i++) {
    const enemy = state.enemies[i];
    assert.equal(enemy.r, i < 4 ? .22 : .36, 'soft spacing must preserve combat collision radii');
    assert.equal(World.isWalkable(state.level, enemy.x, enemy.y, enemy.r), true);
    for (let j = i + 1; j < state.enemies.length; j++) {
      const other = state.enemies[j], distance = Math.hypot(enemy.x - other.x, enemy.y - other.y);
      closest = Math.min(closest, distance);
      if (enemy.isBoss || other.isBoss) closestToBoss = Math.min(closestToBoss, distance);
    }
  }
  assert.ok(closest > .95, 'wide HD bodies should not remain packed at collision-circle spacing');
  assert.ok(closestToBoss > 1.6, 'a brute-class boss still needs a titan-sized visual footprint');
  assert.ok(meanDistance() < initialDistance - 1.5, 'the spreading horde must keep pursuing the player');
});

test('speed and critical upgrades improve movement and actual shot outcomes', () => {
  const normal = boot(), upgraded = boot(); normal.start(); upgraded.start();
  const fast = upgraded.debug.getState().player; fast.cash = 10000;
  for (let i = 0; i < 6; i++) { upgraded.debug.purchaseUpgrade('speed'); upgraded.debug.purchaseUpgrade('crit'); }
  for (const game of [normal, upgraded]) {
    game.debug.getState().player.invulnerable = 1000;
    game.documentHandlers.get('keydown')({ code: 'KeyD', target: { tagName: 'BODY' }, repeat: false, preventDefault() {} });
    game.debug.step(.5);
  }
  const moved = game => Math.hypot(game.debug.getState().player.x - 4.5, game.debug.getState().player.y - 6.5);
  assert.ok(moved(upgraded) > moved(normal) * 1.3);
  function criticalShots(game) {
    game.debug.resetSeed(); const s = game.debug.getState(); s.bullets = [];
    for (let i = 0; i < 100; i++) { s.player.cooldown = 0; s.player.clip.rifle = 30; game.debug.fire(); }
    return s.bullets.filter(bullet => bullet.damage > 23.1).length;
  }
  assert.ok(criticalShots(upgraded) > criticalShots(normal) + 10, 'critical perk produces more amplified hits');
});

test('movement accelerates responsively, brakes after release and advances gait only on travelled distance', () => {
  const game = physicsArena(), p = game.debug.getState().player;
  key(game, 'KeyD'); game.debug.step(.02);
  assert.ok(p.moveSpeed > .3 && p.moveSpeed < 1, 'first step accelerates rather than jumping to full speed');
  game.debug.step(.2);
  assert.ok(p.moveSpeed > 3 && p.moveSpeed <= 3.051);
  const before = { x: p.x, y: p.y, anim: p.anim };
  key(game, 'KeyD', false); game.debug.step(.02);
  assert.ok(p.moveSpeed > 1, 'release has a short braking motion');
  assert.ok(p.anim > before.anim);
  game.debug.step(.4);
  assert.equal(p.moving, false); assert.equal(p.driveVX, 0); assert.equal(p.driveVY, 0);
  assert.ok(Math.hypot(p.x - before.x, p.y - before.y) < .12, 'braking cannot make the controls feel slippery');
  const stopped = p.anim; game.debug.step(.2); assert.equal(p.anim, stopped, 'idle feet do not keep walking');
  game.debug.teleport(22.779, 1.221); key(game, 'KeyD'); game.debug.step(.3);
  const blocked = p.anim; game.debug.step(.2);
  assert.equal(p.anim, blocked, 'collision blocks the gait as well as the body');
  assert.equal(p.moveSpeed, 0);
});

test('damped hit impulses slide without tunnelling through walls and heavy bodies resist push', () => {
  const game = physicsArena(), s = game.debug.getState(), target = s.enemies[0];
  target.x = 22.6; target.y = 10;
  game.debug.damageEnemy(target, 1, { x: 20, y: 10, kind: 'explosion' });
  assert.ok(target.impulseVX > 4); assert.equal(target.hitReact, 1);
  game.debug.step(.7);
  assert.ok(target.x >= 22.6 && target.x <= 22.64, 'impact stops on the near side of the wall');
  assert.ok(World.isWalkable(s.level, target.x, target.y, target.r));
  assert.equal(target.impulseVX, 0); assert.equal(target.hitReact, 0);
  target.x = 15; target.type = 'crawler'; target.impulseVX = 0; target.impulseVY = 0;
  game.debug.damageEnemy(target, 1, { x: 14, y: 10, kind: 'rifle', vx: 29, vy: 0 });
  const smallPush = target.impulseVX;
  target.type = 'brute'; target.impulseVX = 0;
  game.debug.damageEnemy(target, 1, { x: 14, y: 10, kind: 'rifle', vx: 29, vy: 0 });
  assert.ok(target.impulseVX < smallPush * .5);
  s.player.invulnerable = 0; s.player.angle = Math.PI;
  game.debug.damagePlayer(10, { x: 9, y: 10, type: 'crawler', vx: 0, vy: 2 });
  assert.ok(s.player.impulseVX > 0); assert.equal(s.player.hitReact, 1);
  assert.equal(s.player.impulseVY, 0, 'melee uses the attacker position, not its sideways steering velocity or the victim aim');
});

test('shockwave applies a radial physical impulse only to unobstructed targets', () => {
  const game = physicsArena(), s = game.debug.getState(), target = s.enemies[0];
  target.x = 12; target.y = 10; s.resources = 5;
  assert.equal(game.debug.useAbility(), true);
  assert.ok(target.impulseVX > 3.5); assert.equal(target.impulseVY, 0);
  game.debug.step(.15);
  assert.ok(target.x > 12.3, 'a telegraphing target is physically pushed even though it is not pursuing');
  // The production corner remains a line-of-sight barrier for both damage and force.
  s.level = World.level(0); game.debug.teleport(12.78, 6.78);
  target.x = 13.55; target.y = 7.43; target.impulseVX = target.impulseVY = 0;
  s.resources = 5; s.player.abilityCooldown = 0;
  const hp = target.hp; game.debug.useAbility();
  assert.equal(target.hp, hp); assert.equal(target.impulseVX, 0); assert.equal(target.impulseVY, 0);
});

test('grenades follow a gravitational arc, rebound off walls and settle after ground bounces', () => {
  const game = physicsArena(), s = game.debug.getState();
  game.debug.teleport(22.7, 8); s.player.angle = 0; game.debug.throwGrenade();
  const grenade = s.grenades[0];
  assert.equal(grenade.z, 48); assert.equal(grenade.vz, 220); assert.equal(s.player.throwTime, .32);
  grenade.life = 4; // Observe the same body after its normal fuse, without detonating it.
  game.debug.step(.1);
  assert.ok(grenade.vx < 0, 'a solid wall reflects horizontal velocity');
  assert.ok(grenade.z > 48 && grenade.vz > 0, 'the thrown grenade initially rises');
  game.debug.step(.4);
  assert.ok(grenade.vz < 0 && grenade.z > 0, 'gravity reverses vertical velocity before impact');
  game.debug.step(.4);
  assert.ok(grenade.bounces >= 1 && grenade.vz > 0, 'the first ground impact rebounds visibly');
  game.debug.step(2);
  assert.equal(grenade.z, 0); assert.equal(grenade.vz, 0);
  assert.equal(grenade.vx, 0); assert.equal(grenade.vy, 0);
  assert.ok(World.isWalkable(s.level, grenade.x, grenade.y, grenade.r));
  const resting = { x: grenade.x, y: grenade.y, spin: grenade.spin };
  game.debug.step(.2); assert.deepEqual({ x: grenade.x, y: grenade.y, spin: grenade.spin }, resting);
});

test('the normal grenade fuse explodes after its first bounce and pushes surviving enemies', () => {
  const game = physicsArena(), s = game.debug.getState(), target = s.enemies[0];
  s.player.angle = 0; target.x = 17; target.y = 10;
  game.debug.throwGrenade(); const grenade = s.grenades[0];
  game.debug.step(.9); assert.ok(grenade.bounces >= 1); assert.equal(s.grenades.length, 1);
  game.debug.step(.16);
  assert.equal(s.grenades.length, 0); assert.ok(s.effects.some(e => e.kind === 'explosion'));
  assert.ok(target.hp < 2000 && target.impulseVX > 0, 'the actual explosion deals damage and pushes outward');
});

test('shells and corpses have independent airborne/falling motion and finally come to rest', () => {
  const game = physicsArena(), s = game.debug.getState(), target = s.enemies[0];
  s.player.angle = 0; game.debug.fire();
  const casing = s.effects.find(item => item.kind === 'casing');
  assert.ok(casing && casing.z > 0); assert.equal(s.player.recoil, 1);
  const casingStart = { x: casing.x, y: casing.y };
  game.debug.step(.2);
  assert.ok(Math.hypot(casing.x - casingStart.x, casing.y - casingStart.y) > .3);
  game.debug.damageEnemy(target, 100000, { x: target.x - 1, y: target.y, kind: 'shotgun' });
  const corpse = s.corpses[0], deathX = corpse.x;
  assert.equal(corpse.fall, 0); assert.ok(Number.isFinite(corpse.fallAngle));
  game.debug.step(.2);
  assert.ok(corpse.fall > .45 && corpse.fall < .5); assert.ok(corpse.x > deathX);
  game.debug.step(1.5);
  assert.equal(corpse.fall, 1); assert.equal(corpse.vx, 0); assert.equal(corpse.vy, 0);
  assert.equal(casing.z, 0); assert.equal(casing.vz, 0); assert.equal(casing.vx, 0); assert.equal(casing.vy, 0);
  assert.ok(World.isWalkable(s.level, corpse.x, corpse.y, corpse.r));
});

test('pause freezes effects, corpses and ballistic bodies through real animation frames; teleport resets inertia', () => {
  const game = physicsArena(), s = game.debug.getState();
  key(game, 'KeyD'); game.debug.step(.1); key(game, 'KeyD', false);
  game.debug.fire(); game.debug.throwGrenade(); game.debug.damageEnemy(s.enemies[0], 100000, { x: 14, y: 10, kind: 'rifle' });
  game.frame(100); game.frame(120); game.click('pauseButton');
  const frozen = JSON.stringify({ player: s.player, effects: s.effects, corpses: s.corpses, grenades: s.grenades, time: s.time });
  game.frame(160); game.frame(200); game.debug.step(.4);
  assert.equal(JSON.stringify({ player: s.player, effects: s.effects, corpses: s.corpses, grenades: s.grenades, time: s.time }), frozen);
  game.click('resume'); game.frame(240);
  assert.ok(s.corpses[0].age > JSON.parse(frozen).corpses[0].age);
  s.player.impulseVX = 4; s.player.driveVY = 3; game.debug.teleport(9, 9);
  assert.equal(s.player.impulseVX, 0); assert.equal(s.player.driveVY, 0); assert.equal(s.player.moveSpeed, 0);
  const point = { x: s.player.x, y: s.player.y }; game.debug.step(.2);
  assert.deepEqual({ x: s.player.x, y: s.player.y }, point);
});

test('acceleration and damped impulses cover the same distance at different frame rates', () => {
  function simulate(frameMs) {
    const game = physicsArena(), state = game.debug.getState();
    game.frame(100); key(game, 'KeyD');
    game.debug.damageEnemy(state.enemies[0], 1, { x: 14, y: 10, kind: 'explosion' });
    for (let now = 100 + frameMs; now <= 500; now += frameMs) game.frame(now);
    return { player: state.player, enemy: state.enemies[0] };
  }
  const slow = simulate(40), fast = simulate(10);
  for (const name of ['player', 'enemy']) {
    assert.ok(Math.hypot(slow[name].x - fast[name].x, slow[name].y - fast[name].y) < .000001,
      name + ' motion must not depend on the render frame rate');
    assert.ok(Math.abs(slow[name].anim - fast[name].anim) < .000001, 'gait follows equal travelled distance');
  }
});
