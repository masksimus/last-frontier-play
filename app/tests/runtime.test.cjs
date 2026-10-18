const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sources = ['core.js', 'animation.js', 'combat-v8.js', 'campaign.js', 'game.js']
  .map(name => ({ name, code: fs.readFileSync(path.join(root, 'src', name), 'utf8') }));

// Each test boots a separate browser-like session. Rendering is stubbed; game
// rules, event handlers, campaign transitions and localStorage run unchanged.
function boot(initialMemory = {}) {
  const listeners = {};
  const elements = new Map();
  const memory = { frontier_mute: '1', ...initialMemory };
  let frame = null, now = 0, seed = 123456789;
  const randomMath = Object.create(Math);
  randomMath.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const ctx = new Proxy({
    createRadialGradient: () => ({ addColorStop() {} }),
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
  }, { get: (target, key) => target[key] || (() => {}), set: (target, key, value) => (target[key] = value, true) });

  class FakeElement {
    constructor(id = '') {
      this.id = id;
      this.listeners = {};
      this.style = {};
      this.className = '';
      this.textContent = '';
      this.hidden = false;
      this.disabled = false;
      this.children = [];
      this.attrs = {};
      this.value = id === 'difficulty' ? 'standard' : '';
      const classes = new Set(['controls', 'upgrade', 'paused', 'end', 'briefing', 'continue'].includes(id) ? ['hidden'] : []);
      this.classList = {
        contains: key => classes.has(key),
        add: key => classes.add(key),
        remove: key => classes.delete(key),
        toggle: (key, force) => {
          const active = force === undefined ? !classes.has(key) : Boolean(force);
          if (active) classes.add(key); else classes.delete(key);
          return active;
        },
      };
    }
    set innerHTML(value) { this._html = value; this.children = []; }
    get innerHTML() { return this._html || ''; }
    addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
    dispatch(name, payload = {}) {
      for (const fn of this.listeners[name] || []) fn({ preventDefault() {}, pointerId: 1, clientX: 0, clientY: 0, ...payload });
    }
    append(...els) { this.children.push(...els); }
    appendChild(el) { this.children.push(el); }
    getBoundingClientRect() { return this.rect || { x: 18, y: 670, width: 136, height: 145, left: 18, top: 670 }; }
    querySelector(selector) { return this.id === 'stickZone' && selector === '.ring' ? element('stickRing') : null; }
    getContext() { return ctx; }
    setPointerCapture() {}
    getAttribute(name) { return this.attrs[name]; }
  }

  const element = id => {
    if (!elements.has(id)) elements.set(id, new FakeElement(id));
    return elements.get(id);
  };
  const addListener = (name, fn) => (listeners[name] ||= []).push(fn);
  const doc = {
    getElementById: element,
    createElement: tag => new FakeElement(tag),
    querySelector: selector => {
      const weapon = selector.match(/^\[data-weapon="([a-z]+)"\]$/)?.[1];
      return weapon ? element('weaponSlot-' + weapon) : null;
    },
    head: new FakeElement('head'),
    addEventListener: addListener,
    hidden: false,
  };
  const windowObj = { innerWidth: 390, innerHeight: 844, devicePixelRatio: 1, addEventListener: addListener };
  const sandbox = {
    window: windowObj, document: doc, location: { hostname: 'localhost', search: '' },
    localStorage: { getItem: key => memory[key] ?? null, setItem: (key, value) => (memory[key] = String(value)) },
    performance: { now: () => now }, innerWidth: 390, innerHeight: 844,
    Math: randomMath, URLSearchParams, console,
    Image: class { constructor() { this.complete = true; this.naturalWidth = this.naturalHeight = 64; } set src(value) { this._src = value; } },
    requestAnimationFrame: fn => (frame = fn),
  };
  windowObj.document = doc;
  windowObj.location = sandbox.location;
  const context = vm.createContext(sandbox);
  for (const { name, code } of sources) {
    vm.runInContext(code, context, { filename: name });
    for (const key of ['FrontierCore', 'FrontierAnimation', 'FrontierCombatV8', 'FrontierCampaign']) {
      if (sandbox[key]) windowObj[key] = sandbox[key];
    }
  }
  const qa = windowObj.__FRONTIER_QA__;
  const state = () => JSON.parse(JSON.stringify(qa.get()));
  const tick = (count = 1) => { for (let i = 0; i < count; i++) { now += 16; frame?.(now); } };
  const event = (name, payload = {}) => { for (const fn of listeners[name] || []) fn({ preventDefault() {}, repeat: false, ...payload }); };
  const click = id => { if (!element(id).disabled) element(id).dispatch('click'); };
  const start = (deploy = true) => { click('start'); if (deploy) click('deploy'); };
  const chooseUpgrade = () => {
    assert.equal(state().mode, 'upgrading');
    assert.equal(element('cards').children.length, 3);
    // Select damage when offered, leaving movement unchanged for later assertions.
    const cards = element('cards').children;
    const card = cards.find(item => item.children[1].textContent === 'РАЗРЫВНЫЕ ПУЛИ') || cards[0];
    card.dispatch('click');
  };
  const finishWave = () => {
    assert.equal(state().mode, 'running');
    tick(); // Let the production update create a required boss before clearing it.
    qa.clearWave();
    tick();
    if (state().mode === 'upgrading') chooseUpgrade();
    return state();
  };
  return { state, tick, event, click, start, chooseUpgrade, finishWave, element, memory, qa, doc, M: windowObj.FrontierCampaign };
}

test('menu boots and operation waits for briefing deployment before simulation starts', () => {
  const h = boot();
  h.tick(3);
  assert.equal(h.state().mode, 'menu');
  assert.equal(h.element('home').classList.contains('hidden'), false);
  assert.equal(h.element('hud').classList.contains('hidden'), true);
  h.start(false);
  assert.equal(h.state().mode, 'briefing');
  assert.equal(h.state().wave, 1);
  assert.equal(h.element('controls').classList.contains('hidden'), true);
  h.tick(150);
  assert.equal(h.state().enemies, 0);
  h.click('deploy');
  assert.equal(h.state().mode, 'running');
  assert.equal(h.element('controls').classList.contains('hidden'), false);
  h.tick(150);
  assert.ok(h.state().enemies > 0);
});

test('pause, resume, fresh upgrade cards, retry and defeat work through UI handlers', () => {
  const h = boot();
  h.start();
  h.click('pauseButton');
  assert.equal(h.state().mode, 'paused');
  h.click('resume');
  assert.equal(h.state().mode, 'running');
  for (let i = 0; i < 2; i++) { h.qa.forceUpgrade(); h.chooseUpgrade(); }
  assert.equal(h.state().mode, 'running');
  h.qa.spawnBoss();
  h.tick();
  assert.equal(h.element('bossBar').hidden, false);
  h.qa.forceWin();
  assert.equal(h.state().mode, 'ended');
  h.click('retry');
  assert.equal(h.state().mode, 'briefing');
  h.click('deploy');
  h.qa.damage(h.state().hp);
  assert.equal(h.state().mode, 'ended');
  assert.equal(h.element('endTitle').textContent, 'РУБЕЖ ПАЛ');
  assert.match(h.element('hpText').textContent, /^0 \/ /);
});

test('a standing dash moves with no held key and keeps its initial direction', () => {
  const h = boot();
  h.start();
  const before = h.state();
  h.event('keydown', { key: ' ', code: 'Space' });
  h.tick(3);
  const after = h.state();
  assert.ok(after.x > before.x + 25);
  assert.equal(after.y, before.y);
  h.event('keydown', { key: 'w', code: 'KeyW' });
  h.tick(3);
  assert.ok(h.state().x > after.x + 25);
  assert.equal(h.state().y, before.y);
  assert.ok(h.state().dashCd > 0);
  assert.equal(h.element('dash').classList.contains('cooldown'), true);
});

test('blur and pause clear movement keys even when keyup is lost', () => {
  const h = boot();
  h.start();
  h.event('keydown', { key: 'd', code: 'KeyD' });
  h.tick(3);
  const moving = h.state();
  h.event('blur');
  assert.equal(h.state().mode, 'paused');
  h.click('resume');
  h.tick(3);
  assert.equal(h.state().x, moving.x);
  assert.equal(h.state().y, moving.y);
  h.event('keydown', { key: 'd', code: 'KeyD' });
  h.click('pauseButton');
  h.click('resume');
  h.tick(3);
  assert.equal(h.state().x, moving.x);
});

test('physical movement keys work with Russian layout and upgrades clear held input', () => {
  const h = boot();
  h.start();
  const before = h.state();
  h.event('keydown', { key: 'ц', code: 'KeyW' });
  h.tick(3);
  assert.ok(h.state().y < before.y);
  h.event('keyup', { key: 'ц', code: 'KeyW' });
  const released = h.state();
  h.tick(3);
  assert.equal(h.state().y, released.y);
  h.event('keydown', { key: 'd', code: 'KeyD' });
  h.qa.forceUpgrade();
  h.chooseUpgrade();
  h.tick(3);
  assert.equal(h.state().x, released.x);
});

test('responsive joystick centres and small touch jitter stay still while an outside touch moves', () => {
  for (const size of [112, 100, 84]) {
    const h = boot();
    h.start();
    const stick = h.element('stickZone');
    const rect = { left: 18 + (136 - size) / 2, top: 670, width: size, height: size };
    h.element('stickRing').rect = rect;
    const center = { clientX: rect.left + size / 2, clientY: rect.top + size / 2, pointerId: 7 };
    const initial = h.state();
    stick.dispatch('pointerdown', center);
    h.tick(3);
    assert.equal(h.state().x, initial.x, `horizontal drift at ${size}px`);
    assert.equal(h.state().y, initial.y, `vertical drift at ${size}px`);
    stick.dispatch('pointermove', { ...center, clientX: center.clientX + 3, clientY: center.clientY + 2 });
    h.tick(3);
    assert.equal(h.state().x, initial.x, `horizontal jitter at ${size}px`);
    assert.equal(h.state().y, initial.y, `vertical jitter at ${size}px`);
    stick.dispatch('pointermove', { ...center, clientX: center.clientX + 28 });
    h.tick(3);
    assert.ok(h.state().x > initial.x + 8, `outside touch did not move at ${size}px`);
    assert.equal(h.state().y, initial.y);
    stick.dispatch('pointerup', { pointerId: 7 });
    const released = h.state();
    h.tick(3);
    assert.equal(h.state().x, released.x);
    assert.equal(h.state().y, released.y);
  }
});

test('joystick falls back to its zone centre when no ring node is available', () => {
  const h = boot();
  h.start();
  const stick = h.element('stickZone');
  stick.querySelector = undefined;
  const rect = stick.getBoundingClientRect();
  const before = h.state();
  stick.dispatch('pointerdown', { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 });
  h.tick(3);
  assert.equal(h.state().x, before.x);
  assert.equal(h.state().y, before.y);
});

test('weapon controls respect sector unlocks', () => {
  const h = boot();
  h.start();
  h.event('keydown', { key: '4', code: 'Digit4' });
  assert.equal(h.state().weapon, 'rifle');
  assert.equal(h.element('weaponSlot-plasma').disabled, true);
  h.qa.switchWeapon();
  assert.equal(h.state().weapon, 'shotgun');
  h.qa.switchWeapon();
  assert.equal(h.state().weapon, 'rifle');
});

test('relay capture advances only nearby during active gameplay and rewards completion', () => {
  const h = boot();
  h.start();
  const relay = h.M.sectorFor(1).relays[0];
  h.qa.setPosition(relay.x, relay.y);
  h.tick(30);
  const progress = h.state().objectives[0];
  assert.ok(progress > .45 && progress < .5);
  h.click('pauseButton');
  h.tick(30);
  assert.equal(h.state().objectives[0], progress);
  h.click('resume');
  h.qa.setPosition(1100, 800);
  h.tick(5);
  assert.equal(h.state().objectives[0], progress);
  h.qa.setPosition(relay.x, relay.y);
  h.tick(285);
  assert.equal(h.state().objectives[0], 5);
  assert.equal(h.state().objectives[1], 0);
  assert.ok(h.state().score >= 300);
  assert.match(h.element('objectiveCount').textContent, /^1 \/ 2/);
});

test('wave 3 waits for relays, then wave 4 starts a new sector briefing and checkpoint', () => {
  const h = boot();
  h.start();
  assert.equal(h.finishWave().wave, 2);
  assert.equal(h.finishWave().wave, 3);
  h.tick();
  assert.equal(h.state().bosses, 1);
  h.qa.clearWave();
  h.tick(3);
  assert.equal(h.state().wave, 3);
  assert.equal(h.state().mode, 'running');
  h.qa.completeObjectives();
  h.tick();
  h.chooseUpgrade();
  const state = h.state();
  assert.equal(state.mode, 'briefing');
  assert.equal(state.wave, 4);
  assert.equal(state.sector, 'foundry');
  assert.equal(state.weapon, 'railgun');
  assert.deepEqual(state.objectives, [0, 0]);
  assert.equal(state.enemies, 0);
  assert.equal(state.enemyProjectiles, 0);
  const saved = JSON.parse(h.memory[h.M.SAVE_KEY]);
  assert.equal(saved.wave, 4);
  assert.equal(saved.weapon, 'railgun');
  assert.equal(saved.player.hp, saved.player.maxhp);
  h.click('deploy');
  assert.equal(h.state().mode, 'running');
});

test('wave 6 opens the last sector with plasma and a wave 7 checkpoint', () => {
  const h = boot();
  h.start();
  for (let attempts = 0; h.state().wave < 6 && attempts < 10; attempts++) {
    h.qa.completeObjectives();
    h.finishWave();
    if (h.state().mode === 'briefing') h.click('deploy');
  }
  assert.equal(h.state().wave, 6);
  assert.equal(h.state().sector, 'foundry');
  h.qa.completeObjectives();
  const state = h.finishWave();
  assert.equal(state.wave, 7);
  assert.equal(state.mode, 'briefing');
  assert.equal(state.sector, 'uplink');
  assert.equal(state.weapon, 'plasma');
  assert.deepEqual(state.unlocked, ['rifle', 'shotgun', 'railgun', 'plasma']);
  assert.deepEqual(state.objectives, [0, 0]);
  assert.equal(JSON.parse(h.memory[h.M.SAVE_KEY]).wave, 7);
});

test('actual final-wave victory requires completed objectives and reaching evacuation', () => {
  const h = boot();
  h.start();
  for (let attempts = 0; h.state().wave < 7 && attempts < 10; attempts++) {
    h.qa.completeObjectives();
    h.finishWave();
    if (h.state().mode === 'briefing') h.click('deploy');
  }
  assert.equal(h.state().wave, 7);
  // Final-sector objectives remain incomplete while ordinary waves advance.
  for (let attempts = 0; h.state().wave < 10 && attempts < 5; attempts++) h.finishWave();
  assert.equal(h.state().wave, 10);
  assert.deepEqual(h.state().objectives, [0, 0]);
  h.qa.setPosition(1100, 230);
  h.qa.clearWave();
  h.tick(3);
  assert.equal(h.state().mode, 'running');
  assert.equal(h.state().evacuating, false);
  h.qa.setPosition(1100, 800);
  h.qa.completeObjectives();
  h.tick();
  assert.equal(h.state().mode, 'running');
  assert.equal(h.state().evacuating, true);
  assert.match(h.element('missionStatus').textContent, /ЭВАКУАЦИЯ/);
  h.qa.setPosition(1100, 230);
  h.tick();
  assert.equal(h.state().mode, 'ended');
  assert.equal(h.element('endTitle').textContent, 'РУБЕЖ УДЕРЖАН');
  assert.equal(h.memory[h.M.SAVE_KEY], '');
  assert.equal(h.element('continue').disabled, true);
  assert.equal(h.element('continue').classList.contains('hidden'), true);
});

test('a fresh browser session resumes the saved sector and equipment after defeat', () => {
  const h = boot();
  h.start();
  for (let attempts = 0; h.state().wave < 4 && attempts < 5; attempts++) {
    h.qa.completeObjectives();
    h.finishWave();
  }
  assert.equal(h.state().wave, 4);
  const saved = JSON.parse(h.memory[h.M.SAVE_KEY]);
  h.click('deploy');
  h.qa.damage(999);
  assert.equal(h.state().mode, 'ended');
  assert.equal(JSON.parse(h.memory[h.M.SAVE_KEY]).wave, 4);
  const fresh = boot(h.memory);
  assert.equal(fresh.element('continue').disabled, false);
  fresh.click('continue');
  const resumed = fresh.state();
  assert.equal(resumed.mode, 'briefing');
  assert.equal(resumed.wave, 4);
  assert.equal(resumed.sector, 'foundry');
  assert.equal(resumed.weapon, saved.weapon);
  assert.equal(resumed.hp, saved.player.hp);
  assert.equal(resumed.shots, saved.player.shots);
  assert.equal(resumed.score, saved.score);
  assert.deepEqual(resumed.objectives, [0, 0]);
  fresh.click('deploy');
  assert.equal(fresh.state().mode, 'running');
});

test('corrupt checkpoints cannot enable continue or bypass the new-operation flow', () => {
  const h = boot({ frontier_campaign_v1: '{broken json' });
  assert.equal(h.element('continue').disabled, true);
  h.click('continue');
  assert.equal(h.state().mode, 'menu');
  h.start(false);
  assert.equal(h.state().wave, 1);
  assert.equal(h.state().mode, 'briefing');
  assert.ok(h.M.parseCheckpoint(h.memory[h.M.SAVE_KEY]));
});
