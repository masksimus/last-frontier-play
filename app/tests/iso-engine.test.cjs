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
    requestAnimationFrame() {},
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
  return { context, element, click, start, storage, debug: context.OutbreakDebug, windowHandlers };
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
