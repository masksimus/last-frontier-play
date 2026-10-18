/* Последний рубеж: Протокол заражения. Original isometric campaign runtime. */
(function () {
  'use strict';
  const W = window.OutbreakWorld;
  const R = window.OutbreakRenderer;
  if (!W || !R) {
    console.error('Outbreak: world and renderer must load before the game.');
    return;
  }
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const TAU = Math.PI * 2;
  const WEAPONS = {
    pistol: { name: 'ПИСТОЛЕТ «ГРАЧ»', clip: 12, rate: .24, reload: 1.05, damage: 30, speed: 24, range: 13, spread: .025, pellets: 1, reserve: Infinity },
    shotgun: { name: 'ДРОБОВИК «МОЛОТ»', clip: 8, rate: .72, reload: 1.65, damage: 22, speed: 21, range: 7.5, spread: .17, pellets: 7, reserve: 96 },
    rifle: { name: 'АВТОМАТ «РУБЕЖ»', clip: 30, rate: .085, reload: 1.6, damage: 23, speed: 29, range: 15, spread: .038, pellets: 1, reserve: 540 },
    plasma: { name: 'ПЛАЗМОМЁТ «ИСКРА»', clip: 18, rate: .3, reload: 1.9, damage: 64, speed: 14, range: 13, spread: .02, pellets: 1, reserve: 180 }
  };
  const TYPES = {
    crawler: { hp: 45, speed: 1.85, r: .22, damage: 8, cash: 16 },
    spitter: { hp: 70, speed: 1.45, r: .25, damage: 11, cash: 25 },
    brute: { hp: 245, speed: 1.15, r: .36, damage: 20, cash: 60 },
    queen: { hp: 1500, speed: .86, r: .55, damage: 24, cash: 500 }
  };
  const DIFFICULTIES = {
    story: { hp: .76, damage: .65, speed: .9, label: 'СЮЖЕТНАЯ' },
    standard: { hp: 1, damage: 1, speed: 1, label: 'БОЕВАЯ' },
    veteran: { hp: 1.25, damage: 1.3, speed: 1.08, label: 'ВЕТЕРАН' }
  };
  const SAVE_KEY = 'last-frontier-outbreak-v1';
  const TEST = new URLSearchParams(location.search).get('test') === '1';
  const touchDevice = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  const input = { keys: new Set(), fire: false, pointerValid: false, move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, touchAim: false };
  let seed = 7102026;
  let enemyId = 0;
  let queued = [];
  let lastFrame = 0;
  let uiTimer = 0;
  let muted = false;
  let audioContext;
  let nextAudio = 0;
  let checkpoint = null;
  let levelStartInventory = null;
  let state;
  function random() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; }
  function playerDefault() {
    return { x: 0, y: 0, r: .22, hp: 120, maxHp: 120, armor: 45, maxArmor: 100, angle: 0, weapon: 'rifle', owned: { pistol: true, rifle: true, shotgun: false, plasma: false },
      ammo: { pistol: 0, shotgun: 0, rifle: 120, plasma: 0 }, clip: { pistol: 12, shotgun: 0, rifle: 30, plasma: 0 }, reload: 0, reloadWeapon: null, cooldown: 0, grenades: 3, cash: 180, moving: false, anim: 0, invulnerable: 0 };
  }
  function newState() {
    return { mode: 'menu', levelIndex: 0, level: null, player: playerDefault(), difficulty: 'standard', enemies: [], bullets: [], enemyBullets: [], grenades: [], pickups: [], effects: [], decals: [], corpses: [], terminals: [], nests: [], time: 0, levelTime: 0, kills: 0, aim: { x: 1, y: 0 }, pointer: { x: innerWidth * .65, y: innerHeight * .5 }, shake: 0, flash: 0, toast: '', toastTime: 0, exitReady: false, reducedMotion: false, touch: touchDevice, spawnRemaining: 0, totalEnemies: 0 };
  }
  state = newState();
  function sound(kind) {
    if (muted || performance.now() < nextAudio) return;
    nextAudio = performance.now() + (kind === 'shot' ? 38 : 18);
    try {
      const bridge = window.FrontierV6;
      const frequencies = { shot: 470, plasma: 660, explosion: 80, hit: 260, pickup: 920, alert: 280, terminal: 1100 };
      if (bridge && typeof bridge.playAudio === 'function' && bridge.playAudio(frequencies[kind] || 470, .1, 'sawtooth', kind === 'explosion' ? .07 : .035)) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioContext = audioContext || new AC();
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
      if (audioContext.state !== 'running') return;
      const o = audioContext.createOscillator(), g = audioContext.createGain();
      const now = audioContext.currentTime;
      const sounds = { shot: [110, 35, .055, .045], plasma: [390, 85, .16, .035], explosion: [72, 19, .35, .1], hit: [210, 60, .07, .024], pickup: [500, 980, .15, .035], alert: [340, 120, .18, .04], terminal: [540, 840, .25, .04] };
      const s = sounds[kind] || sounds.shot;
      o.type = kind === 'pickup' || kind === 'terminal' ? 'sine' : 'sawtooth';
      o.frequency.setValueAtTime(s[0], now); o.frequency.exponentialRampToValueAtTime(s[1], now + s[2]);
      g.gain.setValueAtTime(s[3], now); g.gain.exponentialRampToValueAtTime(.0001, now + s[2]);
      o.connect(g); g.connect(audioContext.destination); o.start(now); o.stop(now + s[2]);
    } catch (_) { /* Audio support never blocks the game. */ }
  }
  function toast(message, duration) {
    state.toast = message; state.toastTime = duration || 3;
    const el = $('toast'); if (el) { el.textContent = message; el.classList.remove('hidden'); }
  }
  function effect(kind, x, y, life, radius, extra) {
    state.effects.push(Object.assign({ kind, x, y, life, maxLife: life, r: radius || .2 }, extra || {}));
    if (state.effects.length > 180) state.effects.splice(0, state.effects.length - 180);
  }
  function clearInput() {
    input.keys.clear(); input.fire = false; input.move.x = input.move.y = 0; input.aim.x = input.aim.y = 0; input.touchAim = false;
    for (const id of ['moveKnob', 'aimKnob']) if ($(id)) $(id).style.transform = 'translate(0px, 0px)';
  }
  function setMode(mode) {
    state.mode = mode; clearInput();
    const panels = { home: 'menu', briefing: 'briefing', paused: 'paused', shop: 'shop', end: ['dead', 'victory'] };
    for (const [id, panelMode] of Object.entries(panels)) {
      const visible = Array.isArray(panelMode) ? panelMode.includes(mode) : panelMode === mode;
      if ($(id)) $(id).classList.toggle('hidden', !visible);
    }
    if ($('hud')) $('hud').classList.toggle('hidden', !['playing', 'paused'].includes(mode));
    if ($('touchControls')) $('touchControls').classList.toggle('hidden', mode !== 'playing' || !touchDevice);
    document.body.dataset.mode = mode;
    updateUI();
  }
  function cleanInventory(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const fresh = playerDefault();
    for (const key of ['hp', 'maxHp', 'armor', 'cash', 'grenades']) if (!Number.isFinite(raw[key])) return null;
    if (raw.maxHp !== 120 || raw.hp < 1 || raw.hp > 120 || raw.armor < 0 || raw.armor > 100 || raw.cash < 0 || raw.cash > 100000 || raw.grenades < 0 || raw.grenades > 12) return null;
    if (!raw.owned || !raw.ammo || !raw.clip || typeof raw.weapon !== 'string' || !Object.hasOwn(WEAPONS, raw.weapon) || !raw.owned[raw.weapon]) return null;
    fresh.hp = raw.hp; fresh.armor = raw.armor; fresh.cash = Math.floor(raw.cash); fresh.grenades = Math.floor(raw.grenades); fresh.weapon = raw.weapon;
    for (const [key, spec] of Object.entries(WEAPONS)) {
      if (typeof raw.owned[key] !== 'boolean' || !Number.isInteger(raw.ammo[key]) || raw.ammo[key] < 0 || raw.ammo[key] > (Number.isFinite(spec.reserve) ? spec.reserve : 0) || !Number.isInteger(raw.clip[key]) || raw.clip[key] < 0 || raw.clip[key] > spec.clip) return null;
      fresh.owned[key] = raw.owned[key]; fresh.ammo[key] = raw.ammo[key]; fresh.clip[key] = raw.clip[key];
    }
    if (!fresh.owned.pistol) return null;
    return fresh;
  }
  function inventory() {
    const p = state.player;
    return { hp: p.hp, maxHp: p.maxHp, armor: p.armor, cash: p.cash, grenades: p.grenades, weapon: p.weapon, owned: Object.assign({}, p.owned), ammo: Object.assign({}, p.ammo), clip: Object.assign({}, p.clip) };
  }
  function readCheckpoint() {
    try {
      const raw = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!raw || raw.version !== 1 || !Number.isInteger(raw.levelIndex) || raw.levelIndex < 0 || raw.levelIndex >= W.LEVELS.length || !Object.hasOwn(DIFFICULTIES, raw.difficulty) || !Number.isInteger(raw.kills) || raw.kills < 0 || raw.kills > 10000 || !Number.isFinite(raw.time) || raw.time < 0 || raw.time > 86400) return null;
      const p = cleanInventory(raw.player); if (!p) return null;
      return Object.assign({}, raw, { player: p });
    } catch (_) { return null; }
  }
  function saveCheckpoint() {
    const save = { version: 1, levelIndex: state.levelIndex, player: inventory(), difficulty: state.difficulty, time: state.time, kills: state.kills };
    checkpoint = save;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (_) { /* Private browser mode may disallow storage. */ }
    updateContinue();
  }
  function updateContinue() {
    const button = $('continue');
    if (button) { button.disabled = !checkpoint; button.classList.toggle('hidden', !checkpoint); if (checkpoint) button.textContent = 'ПРОДОЛЖИТЬ · СЕКТОР ' + (checkpoint.levelIndex + 1); }
  }
  function startNew() {
    const setting = $('difficulty') ? $('difficulty').value : 'standard';
    const reducedMotion = state.reducedMotion;
    state = newState(); state.reducedMotion = reducedMotion;
    state.difficulty = Object.hasOwn(DIFFICULTIES, setting) ? setting : 'standard';
    seed = 7102026; enemyId = 0;
    prepareLevel(0, true);
  }
  function continueGame() {
    checkpoint = readCheckpoint(); if (!checkpoint) { toast('Сохранение недоступно. Начните новую операцию.'); updateContinue(); return; }
    const reducedMotion = state.reducedMotion;
    state = newState(); state.reducedMotion = reducedMotion; state.player = cleanInventory(checkpoint.player); state.difficulty = checkpoint.difficulty; state.time = checkpoint.time; state.kills = checkpoint.kills;
    prepareLevel(checkpoint.levelIndex, false);
  }
  function prepareLevel(index, writeSave) {
    state.levelIndex = index; state.level = W.level(index);
    state.enemies = []; state.bullets = []; state.enemyBullets = []; state.grenades = []; state.effects = []; state.decals = []; state.corpses = [];
    state.pickups = (state.level.supplies || []).map(p => Object.assign({ amount: p.kind === 'credits' ? 90 : 0, age: 0 }, p));
    state.terminals = (state.level.terminals || []).map(t => Object.assign({ active: false }, t));
    const initialCount = (state.level.enemyGroups || []).reduce((sum, group) => sum + Math.max(0, group.count | 0), 0);
    const targetCount = [82, 111, 139][index] || 100;
    const nests = state.level.nests || [];
    let remainingBudget = Math.max(0, targetCount - initialCount - (state.level.boss ? 1 : 0));
    state.nests = nests.map((nest, i) => {
      const budget = Math.ceil(remainingBudget / (nests.length - i)); remainingBudget -= budget;
      return Object.assign({}, nest, { hp: nest.hp || 260 + index * 100, maxHp: nest.hp || 260 + index * 100, budget, spawnTimer: 2 + i * 1.8, anim: 0 });
    });
    queued = [];
    for (const group of state.level.enemyGroups || []) {
      for (let i = 0; i < group.count; i++) queued.push({ x: group.x, y: group.y, type: group.type, offset: i });
    }
    if (state.level.boss) queued.push(Object.assign({ type: 'queen', offset: 0 }, state.level.boss));
    state.totalEnemies = initialCount + state.nests.reduce((sum, n) => sum + n.budget, 0) + (state.level.boss ? 1 : 0);
    state.spawnRemaining = state.totalEnemies;
    state.levelTime = 0; state.exitReady = false; state.shake = 0; state.flash = 0;
    const p = state.player; p.x = state.level.spawn.x; p.y = state.level.spawn.y; p.angle = -.6; p.reload = 0; p.reloadWeapon = null; p.cooldown = 0; p.invulnerable = 1.5; p.moving = false;
    state.aim = { x: p.x + 2, y: p.y - 1 };
    levelStartInventory = inventory();
    if (writeSave) saveCheckpoint();
    if ($('sectorBriefTitle')) $('sectorBriefTitle').textContent = state.level.name;
    if ($('sectorBriefText')) $('sectorBriefText').textContent = state.level.brief;
    if ($('sectorBriefMeta')) $('sectorBriefMeta').textContent = state.terminals.length + ' ТЕРМИНАЛА · ' + state.nests.length + ' ГНЕЗДА · ' + (state.level.boss ? 'МАТКА' : 'ЗАЧИСТКА');
    // The briefing already shows the actual map, not a separate decorative scene.
    fillInitialEnemies();
    setMode('briefing');
  }
  function placeNear(x, y, radius, countOffset) {
    const offset = countOffset || 0;
    for (let attempt = 0; attempt < 24; attempt++) {
      const a = (offset * 2.39996) + random() * TAU;
      const radiusSpread = attempt === 0 && offset === 0 ? 0 : .25 + random() * 1.35;
      const p = { x: x + Math.cos(a) * radiusSpread, y: y + Math.sin(a) * radiusSpread };
      if (W.isWalkable(state.level, p.x, p.y, radius) && dist(p, state.player) > 2.8) return p;
    }
    return W.isWalkable(state.level, x, y, radius) ? { x, y } : null;
  }
  function spawnEnemy(spec) {
    const base = TYPES[spec.type] || TYPES.crawler, difficulty = DIFFICULTIES[state.difficulty];
    const position = placeNear(spec.x, spec.y, base.r, spec.offset);
    if (!position) return false;
    const maxHp = Math.round((spec.hp || base.hp) * difficulty.hp);
    state.enemies.push({ id: ++enemyId, type: spec.type, x: position.x, y: position.y, r: base.r, hp: maxHp, maxHp, angle: 0, anim: random() * TAU, attackFlash: 0, cooldown: .6 + random(), path: [], repath: random() * .7, alerted: false, charge: 0, telegraph: 0, chargeAngle: 0, aliveTime: 0 });
    return true;
  }
  function fillInitialEnemies() {
    let attempts = 0;
    while (queued.length && state.enemies.length < 70 && attempts++ < 140) {
      const spec = queued.shift();
      if (!spawnEnemy(spec)) queued.push(spec);
    }
  }
  function deploy() {
    if (state.mode !== 'briefing') return;
    setMode('playing'); toast('Зачистите комплекс. WASD — движение, мышь — прицел, ЛКМ — огонь.', 5); sound('terminal');
  }
  function switchWeapon(key) {
    if (!Object.hasOwn(WEAPONS, key) || !state.player.owned[key]) { if (Object.hasOwn(WEAPONS, key)) toast('Оружие продаётся в арсенале между секторами.'); return; }
    if (state.player.weapon === key) return;
    state.player.weapon = key; state.player.reload = 0; state.player.reloadWeapon = null; state.player.cooldown = Math.max(.12, state.player.cooldown);
    updateUI();
  }
  function cycleWeapon() {
    const keys = Object.keys(WEAPONS).filter(key => state.player.owned[key]);
    switchWeapon(keys[(keys.indexOf(state.player.weapon) + 1) % keys.length]);
  }
  function reload() {
    if (state.mode !== 'playing') return;
    const p = state.player, spec = WEAPONS[p.weapon];
    if (p.reload || p.clip[p.weapon] >= spec.clip || (p.weapon !== 'pistol' && p.ammo[p.weapon] <= 0)) return;
    p.reload = spec.reload; p.reloadWeapon = p.weapon; updateUI();
  }
  function completeReload() {
    const p = state.player, key = p.reloadWeapon;
    if (!key || !WEAPONS[key]) return;
    const spec = WEAPONS[key];
    const amount = key === 'pistol' ? spec.clip - p.clip[key] : Math.min(spec.clip - p.clip[key], p.ammo[key]);
    p.clip[key] += amount; if (key !== 'pistol') p.ammo[key] -= amount;
    p.reloadWeapon = null;
  }
  function fire() {
    const p = state.player, spec = WEAPONS[p.weapon];
    if (p.cooldown > 0 || p.reload > 0) return;
    if (p.clip[p.weapon] <= 0) { reload(); if (p.weapon !== 'pistol' && p.ammo[p.weapon] <= 0) { toast('Нет патронов. Пистолет: клавиша 1.', 2); p.cooldown = .5; } return; }
    p.clip[p.weapon]--; p.cooldown = spec.rate;
    let muzzle = { x: p.x + Math.cos(p.angle) * .4, y: p.y + Math.sin(p.angle) * .4 };
    // The visual gun barrel must never place a projectile beyond a wall corner.
    // Starting at the body in this case lets the same swept collision resolve it.
    if (!W.lineOfSight(state.level, p, muzzle)) muzzle = { x: p.x, y: p.y };
    for (let i = 0; i < spec.pellets; i++) {
      const angle = p.angle + (random() - .5) * spec.spread * 2;
      state.bullets.push({ x: muzzle.x, y: muzzle.y, px: muzzle.x, py: muzzle.y, vx: Math.cos(angle) * spec.speed, vy: Math.sin(angle) * spec.speed, ttl: spec.range / spec.speed, kind: p.weapon, damage: spec.damage, r: p.weapon === 'plasma' ? .14 : .055 });
    }
    effect('muzzle', muzzle.x, muzzle.y, .075, p.weapon === 'shotgun' ? .4 : .22, { angle: p.angle, weapon: p.weapon });
    if (!state.reducedMotion) state.shake = Math.max(state.shake, p.weapon === 'shotgun' ? 3 : p.weapon === 'plasma' ? 2.6 : 1.4);
    sound(p.weapon === 'plasma' ? 'plasma' : 'shot');
  }
  function throwGrenade() {
    if (state.mode !== 'playing' || state.player.grenades <= 0) return;
    const p = state.player; p.grenades--;
    state.grenades.push({ x: p.x, y: p.y, vx: Math.cos(p.angle) * 6.5, vy: Math.sin(p.angle) * 6.5, life: 1.05, maxLife: 1.05 });
    toast('Граната!', 1); updateUI();
  }
  function damagePlayer(amount, from) {
    const p = state.player; if (p.invulnerable > 0 || state.mode !== 'playing') return;
    const total = amount * DIFFICULTIES[state.difficulty].damage;
    const absorbed = Math.min(p.armor, total * .7); p.armor -= absorbed; p.hp = Math.max(0, p.hp - total + absorbed); p.invulnerable = .14;
    state.flash = state.reducedMotion ? .12 : .4; if (!state.reducedMotion) state.shake = Math.max(state.shake, 5);
    sound('hit'); if (from) effect('blood', p.x, p.y, .24, .25);
    if (p.hp <= 0) endGame(false);
  }
  function damageEnemy(enemy, amount, source) {
    if (enemy.hp <= 0) return;
    enemy.hp -= amount; enemy.alerted = true; enemy.attackFlash = .12;
    effect('blood', enemy.x, enemy.y, .18, enemy.type === 'queen' ? .4 : .2);
    if (source && source.kind !== 'plasma' && enemy.type !== 'queen') {
      const distance = Math.max(.01, dist(enemy, source));
      W.move(state.level, enemy, (enemy.x - source.x) / distance * .035, (enemy.y - source.y) / distance * .035);
    }
    if (enemy.hp <= 0) killEnemy(enemy);
  }
  function killEnemy(enemy) {
    state.kills++; state.player.cash += TYPES[enemy.type].cash; state.spawnRemaining = Math.max(0, state.spawnRemaining - 1);
    state.corpses.push({ x: enemy.x, y: enemy.y, type: enemy.type, angle: enemy.angle, age: 0 }); if (state.corpses.length > 90) state.corpses.shift();
    state.decals.push({ x: enemy.x, y: enemy.y, r: enemy.type === 'queen' ? 1.1 : .3 + random() * .3, alpha: .55 + random() * .3, angle: random() * TAU }); if (state.decals.length > 100) state.decals.shift();
    if (random() < .18 || enemy.type === 'brute' || enemy.type === 'queen') {
      const kind = state.player.hp < 65 && random() < .5 ? 'medkit' : 'ammo';
      state.pickups.push({ x: enemy.x, y: enemy.y, kind, amount: enemy.type === 'queen' ? 60 : 0, age: 0 });
    }
    if (enemy.type === 'queen') { effect('explosion', enemy.x, enemy.y, .8, 2.5); sound('explosion'); toast('МАТКА УНИЧТОЖЕНА. Завершите зачистку и идите к выходу.', 5); }
  }
  function damageNest(nest, amount) {
    if (nest.hp <= 0) return;
    nest.hp -= amount; effect('blood', nest.x, nest.y, .18, .4);
    if (nest.hp <= 0) {
      state.spawnRemaining = Math.max(0, state.spawnRemaining - nest.budget); nest.budget = 0; state.player.cash += 100;
      effect('explosion', nest.x, nest.y, .65, 1.6); sound('explosion'); toast('Гнездо уничтожено · +100 кредитов', 2.5);
      state.decals.push({ x: nest.x, y: nest.y, r: 1.1, alpha: .8, angle: random() * TAU });
    }
  }
  function explode(x, y, radius, damage, playerSafe) {
    effect('explosion', x, y, .5, radius); sound('explosion');
    if (!state.reducedMotion) state.shake = Math.max(state.shake, 9);
    for (const enemy of state.enemies) {
      const d = Math.hypot(enemy.x - x, enemy.y - y); if (enemy.hp > 0 && d < radius + enemy.r && W.lineOfSight(state.level, { x, y }, enemy)) damageEnemy(enemy, damage * (1 - .45 * d / radius), { x, y, kind: 'plasma' });
    }
    for (const nest of state.nests) if (nest.hp > 0 && Math.hypot(nest.x - x, nest.y - y) < radius + .6 && W.lineOfSight(state.level, { x, y }, nest)) damageNest(nest, damage * .85);
    if (!playerSafe && Math.hypot(state.player.x - x, state.player.y - y) < radius) damagePlayer(damage * .3);
  }
  function segmentHit(x1, y1, x2, y2, cx, cy, radius) {
    const dx = x2 - x1, dy = y2 - y1, len = dx * dx + dy * dy;
    const t = len > 0 ? clamp(((cx - x1) * dx + (cy - y1) * dy) / len, 0, 1) : 0;
    const x = x1 + dx * t, y = y1 + dy * t;
    return (cx - x) * (cx - x) + (cy - y) * (cy - y) <= radius * radius ? t : Infinity;
  }
  function updateBullets(dt) {
    for (const bullet of state.bullets) {
      bullet.px = bullet.x; bullet.py = bullet.y;
      const stepTime = Math.min(dt, bullet.ttl); bullet.ttl -= dt;
      const nx = bullet.x + bullet.vx * stepTime, ny = bullet.y + bullet.vy * stepTime;
      const subdivisions = Math.max(1, Math.ceil(Math.hypot(nx - bullet.x, ny - bullet.y) / .16));
      let wallT = Infinity;
      // Exact grid traversal catches very short wall-corner intersections that
      // evenly spaced radius samples could otherwise skip between two floors.
      if (!W.lineOfSight(state.level, bullet, { x: nx, y: ny })) {
        let low = 0, high = 1;
        for (let i = 0; i < 12; i++) {
          const t = (low + high) / 2;
          if (W.lineOfSight(state.level, bullet, { x: bullet.x + (nx - bullet.x) * t, y: bullet.y + (ny - bullet.y) * t })) low = t;
          else high = t;
        }
        wallT = high;
      }
      for (let i = 1; i <= subdivisions; i++) {
        const t = i / subdivisions;
        if (!W.isWalkable(state.level, bullet.x + (nx - bullet.x) * t, bullet.y + (ny - bullet.y) * t, .035)) { wallT = Math.min(wallT, (i - .5) / subdivisions); break; }
      }
      let target = null, bestT = wallT;
      for (const enemy of state.enemies) if (enemy.hp > 0) { const t = segmentHit(bullet.x, bullet.y, nx, ny, enemy.x, enemy.y, enemy.r + bullet.r); if (t < bestT) { bestT = t; target = enemy; } }
      for (const nest of state.nests) if (nest.hp > 0) { const t = segmentHit(bullet.x, bullet.y, nx, ny, nest.x, nest.y, .56 + bullet.r); if (t < bestT) { bestT = t; target = nest; } }
      if (Number.isFinite(bestT)) {
        bullet.x += (nx - bullet.x) * bestT; bullet.y += (ny - bullet.y) * bestT; bullet.ttl = 0;
        if (bullet.kind === 'plasma') explode(bullet.x, bullet.y, 1.35, bullet.damage, true);
        else if (target) { if (target.type) damageEnemy(target, bullet.damage, bullet); else damageNest(target, bullet.damage); }
        else effect('spark', bullet.x, bullet.y, .16, .18);
      } else { bullet.x = nx; bullet.y = ny; }
    }
    state.bullets = state.bullets.filter(b => b.ttl > 0);
    for (const bullet of state.enemyBullets) {
      bullet.px = bullet.x; bullet.py = bullet.y; bullet.ttl -= dt;
      const nx = bullet.x + bullet.vx * dt, ny = bullet.y + bullet.vy * dt;
      if (!W.lineOfSight(state.level, bullet, { x: nx, y: ny })) { bullet.ttl = 0; effect('acid', nx, ny, .25, .25); }
      else if (Number.isFinite(segmentHit(bullet.x, bullet.y, nx, ny, state.player.x, state.player.y, state.player.r + .12))) { damagePlayer(bullet.damage, bullet); bullet.ttl = 0; effect('acid', nx, ny, .3, .3); }
      bullet.x = nx; bullet.y = ny;
    }
    state.enemyBullets = state.enemyBullets.filter(b => b.ttl > 0);
  }
  function enemyShot(enemy, angle, speed, damage) {
    state.enemyBullets.push({ x: enemy.x, y: enemy.y, px: enemy.x, py: enemy.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, ttl: 3, kind: 'acid', damage });
    effect('acid', enemy.x, enemy.y, .14, .25);
  }
  function updateEnemies(dt) {
    const p = state.player, difficulty = DIFFICULTIES[state.difficulty];
    fillInitialEnemies();
    for (const nest of state.nests) {
      nest.anim += dt;
      if (nest.hp <= 0 || nest.budget <= 0) continue;
      nest.spawnTimer -= dt;
      if (nest.spawnTimer <= 0 && state.enemies.length < 70 && dist(nest, p) < 15) {
        const type = state.levelIndex > 0 && random() < .21 ? 'spitter' : 'crawler';
        if (spawnEnemy({ type, x: nest.x, y: nest.y, offset: 1 })) { nest.budget--; effect('spawn', nest.x, nest.y, .5, .7); }
        nest.spawnTimer = 2.3 + random() * 1.8;
      }
    }
    for (const enemy of state.enemies) {
      if (enemy.hp <= 0) continue;
      enemy.aliveTime += dt; enemy.anim += dt * 5; enemy.attackFlash = Math.max(0, enemy.attackFlash - dt); enemy.cooldown -= dt; enemy.repath -= dt;
      const d = dist(enemy, p), los = d < 17 && W.lineOfSight(state.level, enemy, p);
      if (los || d < 5) enemy.alerted = true;
      if (!enemy.alerted) continue;
      enemy.angle = Math.atan2(p.y - enemy.y, p.x - enemy.x);
      if ((enemy.type === 'brute' || enemy.type === 'queen') && enemy.telegraph > 0) {
        enemy.telegraph -= dt;
        if (enemy.telegraph <= 0) { enemy.charge = enemy.type === 'queen' ? .7 : .6; effect('charge', enemy.x, enemy.y, .2, enemy.r); }
        continue;
      }
      if (enemy.charge > 0) {
        const oldX = enemy.x, oldY = enemy.y;
        W.move(state.level, enemy, Math.cos(enemy.chargeAngle) * dt * 6.2, Math.sin(enemy.chargeAngle) * dt * 6.2);
        enemy.charge -= dt;
        if (Math.hypot(enemy.x - oldX, enemy.y - oldY) < dt * 1.5) enemy.charge = 0;
        if (dist(enemy, p) < enemy.r + p.r + .15) { damagePlayer(TYPES[enemy.type].damage * 1.5, enemy); enemy.charge = 0; }
        continue;
      }
      if (enemy.type === 'spitter' && los && d < 8 && d > 2 && enemy.cooldown <= 0) {
        enemyShot(enemy, enemy.angle, 5.2, TYPES.spitter.damage); enemy.cooldown = 1.6 + random() * .5; enemy.attackFlash = .18;
      }
      if ((enemy.type === 'brute' || enemy.type === 'queen') && los && d > 2.4 && d < 8 && enemy.cooldown <= 0) {
        enemy.telegraph = enemy.type === 'queen' ? .75 : .65; enemy.chargeAngle = enemy.angle; enemy.cooldown = enemy.type === 'queen' ? 3.5 : 4.5;
        effect('telegraph', enemy.x, enemy.y, enemy.telegraph, enemy.r + .45, { angle: enemy.chargeAngle, length: Math.min(d, 5) });
        if (enemy.type === 'queen') {
          for (let i = -2; i <= 2; i++) enemyShot(enemy, enemy.angle + i * .22, 4, 15);
        }
        continue;
      }
      if (d < enemy.r + p.r + .16) {
        if (enemy.cooldown <= 0) { damagePlayer(TYPES[enemy.type].damage, enemy); enemy.cooldown = enemy.type === 'crawler' ? .65 : .9; enemy.attackFlash = .2; }
        continue;
      }
      let tx = p.x, ty = p.y;
      if (!los) {
        if (enemy.repath <= 0) { enemy.path = W.findPath(state.level, enemy, p) || []; enemy.repath = .65 + random() * .55; }
        while (enemy.path.length && dist(enemy, enemy.path[0]) < .23) enemy.path.shift();
        if (!enemy.path.length) continue;
        tx = enemy.path[0].x; ty = enemy.path[0].y;
      } else enemy.path = [];
      let dx = tx - enemy.x, dy = ty - enemy.y;
      let length = Math.hypot(dx, dy); if (length < .01) continue;
      let direction = 1;
      if (enemy.type === 'spitter' && los && d < 4.2) direction = -1;
      if (enemy.type === 'spitter' && los && d >= 4.2 && d < 6.3) direction = 0;
      dx = dx / length * direction; dy = dy / length * direction;
      const speed = TYPES[enemy.type].speed * difficulty.speed * (enemy.type === 'queen' && enemy.hp < enemy.maxHp * .4 ? 1.4 : 1);
      const separation = { x: 0, y: 0 };
      for (const other of state.enemies) {
        if (other === enemy || other.hp <= 0) continue;
        const sx = enemy.x - other.x, sy = enemy.y - other.y, sd2 = sx * sx + sy * sy, minimum = enemy.r + other.r + .08;
        if (sd2 > .0001 && sd2 < minimum * minimum) { const sd = Math.sqrt(sd2); const force = (minimum - sd) / minimum; separation.x += sx / sd * force; separation.y += sy / sd * force; }
      }
      W.move(state.level, enemy, (dx * speed + clamp(separation.x, -1.5, 1.5) * 2) * dt, (dy * speed + clamp(separation.y, -1.5, 1.5) * 2) * dt);
    }
    state.enemies = state.enemies.filter(enemy => enemy.hp > 0);
  }
  function updatePlayer(dt) {
    const p = state.player;
    p.cooldown = Math.max(0, p.cooldown - dt); p.invulnerable = Math.max(0, p.invulnerable - dt);
    if (p.reload > 0) { p.reload = Math.max(0, p.reload - dt); if (p.reload === 0) completeReload(); }
    let sx = (input.keys.has('KeyD') || input.keys.has('ArrowRight') ? 1 : 0) - (input.keys.has('KeyA') || input.keys.has('ArrowLeft') ? 1 : 0) + input.move.x;
    let sy = (input.keys.has('KeyS') || input.keys.has('ArrowDown') ? 1 : 0) - (input.keys.has('KeyW') || input.keys.has('ArrowUp') ? 1 : 0) + input.move.y;
    const screenLength = Math.hypot(sx, sy); if (screenLength > 1) { sx /= screenLength; sy /= screenLength; }
    // Screen arrows remain screen arrows despite the diamond projection.
    let dx = sx + sy * 2, dy = -sx + sy * 2;
    const worldLength = Math.hypot(dx, dy); if (worldLength > 0) { const magnitude = Math.min(1, screenLength); dx = dx / worldLength * magnitude; dy = dy / worldLength * magnitude; }
    p.moving = worldLength > .05;
    if (p.moving) { W.move(state.level, p, dx * 3.05 * dt, dy * 3.05 * dt); p.anim += dt * 10; }
    else p.anim += dt * 1.5;
    if (input.touchAim && Math.hypot(input.aim.x, input.aim.y) > .16) {
      let ax = input.aim.x + input.aim.y * 2, ay = -input.aim.x + input.aim.y * 2;
      let angle = Math.atan2(ay, ax);
      // A small aim assist cone makes the twin sticks usable on a phone.
      let best = .48, target = null;
      for (const enemy of state.enemies) if (enemy.hp > 0 && dist(p, enemy) < 12 && W.lineOfSight(state.level, p, enemy)) {
        const a = Math.atan2(enemy.y - p.y, enemy.x - p.x), delta = Math.abs(Math.atan2(Math.sin(a - angle), Math.cos(a - angle)));
        if (delta < best) { best = delta; target = enemy; }
      }
      if (target) angle = Math.atan2(target.y - p.y, target.x - p.x);
      p.angle = angle; state.aim = { x: p.x + Math.cos(angle) * 6, y: p.y + Math.sin(angle) * 6 };
    } else if (input.pointerValid) {
      let aim = R.screenToWorld(state.pointer.x, state.pointer.y);
      // Sprites stand above their floor coordinate. Clicking a visible torso
      // should hit that creature rather than the floor behind its feet.
      if (typeof R.worldToScreen === 'function') {
        const zoom = R.status ? R.status().zoom || 1 : 1;
        let closest = Infinity, target = null;
        for (const candidate of state.enemies.concat(state.nests)) {
          if (candidate.hp <= 0 || dist(p, candidate) > WEAPONS[p.weapon].range || !W.lineOfSight(state.level, p, candidate)) continue;
          const point = R.worldToScreen(candidate.x, candidate.y);
          const height = candidate.type === 'queen' ? 40 : candidate.type === 'brute' ? 30 : candidate.type ? 22 : 20;
          const radius = (candidate.type === 'queen' ? 35 : candidate.type === 'brute' ? 27 : 22) * zoom;
          const distance = Math.min(Math.hypot(state.pointer.x - point.x, state.pointer.y - point.y), Math.hypot(state.pointer.x - point.x, state.pointer.y - point.y + height * zoom));
          if (distance <= radius && distance < closest) { closest = distance; target = candidate; }
        }
        if (target) aim = { x: target.x, y: target.y };
      }
      if (aim && Number.isFinite(aim.x) && Number.isFinite(aim.y)) { state.aim = aim; p.angle = Math.atan2(aim.y - p.y, aim.x - p.x); }
    } else if (p.moving) p.angle = Math.atan2(dy, dx);
    if (input.fire || (input.touchAim && Math.hypot(input.aim.x, input.aim.y) > .16)) fire();
  }
  function collectPickups(dt) {
    const p = state.player;
    for (const pickup of state.pickups) {
      pickup.age = (pickup.age || 0) + dt;
      if (dist(p, pickup) > .72 || pickup.collected) continue;
      if (pickup.kind === 'medkit') {
        if (p.hp >= p.maxHp) continue;
        p.hp = Math.min(p.maxHp, p.hp + 42); toast('Аптечка · +42 здоровья', 2);
      } else if (pickup.kind === 'credits') { p.cash += pickup.amount || 90; toast('Кредиты · +' + (pickup.amount || 90), 2); }
      else {
        p.ammo.rifle = Math.min(WEAPONS.rifle.reserve, p.ammo.rifle + (pickup.amount || 36));
        if (p.owned.shotgun) p.ammo.shotgun = Math.min(WEAPONS.shotgun.reserve, p.ammo.shotgun + 8);
        if (p.owned.plasma) p.ammo.plasma = Math.min(WEAPONS.plasma.reserve, p.ammo.plasma + 12);
        toast('Боезапас пополнен', 1.5);
      }
      pickup.collected = true; sound('pickup'); effect('pickup', pickup.x, pickup.y, .55, .6);
    }
    state.pickups = state.pickups.filter(pickup => !pickup.collected);
  }
  function objectiveText() {
    const terminals = state.terminals.filter(t => t.active).length, nests = state.nests.filter(n => n.hp > 0).length;
    if (state.exitReady) return 'Сектор зачищен. Идите к выходу · E — эвакуация.';
    const parts = [];
    if (terminals < state.terminals.length) parts.push('Терминалы ' + terminals + '/' + state.terminals.length + ' · E рядом');
    if (nests > 0) parts.push('Гнёзда: ' + nests);
    if (state.spawnRemaining > 0) parts.push('Угроз: ' + state.spawnRemaining);
    return parts.join('  /  ') || 'Выход открыт';
  }
  function interact() {
    if (state.mode !== 'playing') return;
    const terminal = state.terminals.find(t => !t.active && dist(t, state.player) < 1.3);
    if (terminal) { terminal.active = true; effect('terminal', terminal.x, terminal.y, 1, .8); sound('terminal'); toast('Терминал ' + (terminal.label || terminal.id) + ' активирован', 3); updateObjective(); return; }
    if (dist(state.player, state.level.exit) < 1.4) {
      if (state.exitReady) completeLevel(); else toast('Выход заблокирован. Активируйте терминалы и уничтожьте заражённых.', 3);
    }
  }
  function updateObjective() {
    const ready = state.terminals.every(t => t.active) && state.nests.every(n => n.hp <= 0) && state.enemies.length === 0 && queued.length === 0;
    if (ready && !state.exitReady) { state.exitReady = true; state.spawnRemaining = 0; toast('СЕКТОР ЗАЧИЩЕН. Выход открыт — следуйте к зелёному маркеру.', 6); sound('terminal'); }
  }
  function completeLevel() {
    if (state.mode !== 'playing') return;
    state.player.cash += 250 + state.levelIndex * 150; state.player.reload = 0; state.player.reloadWeapon = null;
    if (state.levelIndex >= W.LEVELS.length - 1) { endGame(true); return; }
    state.player.hp = Math.max(state.player.hp, 65);
    setMode('shop'); renderShop(); toast('Контрольная точка. Арсенал перед следующим сектором.', 4);
    // Save the NEXT sector. Loading it never repeats a completed mission or doubles its reward.
    const previousIndex = state.levelIndex; state.levelIndex++;
    saveCheckpoint(); state.levelIndex = previousIndex;
  }
  const SHOP = [
    { id: 'shotgun', title: 'ДРОБОВИК «МОЛОТ»', text: 'Семь дробин. Останавливает стаю в узких проходах. В комплекте 32 патрона.', price: 340, type: 'weapon' },
    { id: 'plasma', title: 'ПЛАЗМОМЁТ «ИСКРА»', text: 'Взрывные сгустки. Поражает группы и гнёзда. В комплекте 54 заряда.', price: 950, type: 'weapon' },
    { id: 'rifleAmmo', title: '120 ПАТРОНОВ', text: 'Боезапас для автомата «Рубеж».', price: 95, type: 'ammo' },
    { id: 'shotgunAmmo', title: '24 ПАТРОНА', text: 'Боезапас дробовика. Требуется купленный дробовик.', price: 85, type: 'ammo' },
    { id: 'plasmaAmmo', title: '36 ЗАРЯДОВ', text: 'Боезапас плазмомёта. Требуется купленный плазмомёт.', price: 145, type: 'ammo' },
    { id: 'armor', title: 'БРОНЕПЛАСТИНЫ', text: 'Восстанавливает 70 единиц брони, максимум 100.', price: 160, type: 'supply' },
    { id: 'medkit', title: 'МЕДИЦИНСКИЙ БЛОК', text: 'Полностью восстанавливает здоровье.', price: 120, type: 'supply' },
    { id: 'grenades', title: '2 ОСКОЛОЧНЫЕ ГРАНАТЫ', text: 'Большой радиус поражения. Максимум 12 гранат.', price: 110, type: 'supply' }
  ];
  function itemAvailable(item) {
    const p = state.player;
    if (item.type === 'weapon') return !p.owned[item.id];
    if (item.id === 'shotgunAmmo') return p.owned.shotgun && p.ammo.shotgun < WEAPONS.shotgun.reserve;
    if (item.id === 'plasmaAmmo') return p.owned.plasma && p.ammo.plasma < WEAPONS.plasma.reserve;
    if (item.id === 'rifleAmmo') return p.ammo.rifle < WEAPONS.rifle.reserve;
    if (item.id === 'armor') return p.armor < p.maxArmor;
    if (item.id === 'medkit') return p.hp < p.maxHp;
    return p.grenades < 12;
  }
  function renderShop() {
    const list = $('shopItems'); if (!list) return;
    list.replaceChildren();
    for (const item of SHOP) {
      const card = document.createElement('article'); card.className = 'shop-item';
      const title = document.createElement('h3'); title.textContent = item.title;
      const text = document.createElement('p'); text.textContent = item.text;
      const button = document.createElement('button'); button.className = 'buy-button secondary'; button.dataset.buy = item.id;
      const available = itemAvailable(item); button.disabled = !available || state.player.cash < item.price;
      button.textContent = !available && item.type === 'weapon' ? 'УЖЕ В АРСЕНАЛЕ' : item.price + ' КР. · КУПИТЬ';
      button.addEventListener('click', () => buy(item.id)); card.append(title, text, button); list.append(card);
    }
    if ($('shopCash')) $('shopCash').textContent = Math.floor(state.player.cash).toLocaleString('ru-RU');
  }
  function buy(id) {
    if (state.mode !== 'shop') return;
    const item = SHOP.find(i => i.id === id), p = state.player;
    if (!item || p.cash < item.price || !itemAvailable(item)) return;
    p.cash -= item.price;
    if (item.type === 'weapon') {
      p.owned[id] = true; p.clip[id] = WEAPONS[id].clip; p.ammo[id] = id === 'shotgun' ? 24 : 36; p.weapon = id;
    } else if (id === 'rifleAmmo') p.ammo.rifle = Math.min(WEAPONS.rifle.reserve, p.ammo.rifle + 120);
    else if (id === 'shotgunAmmo') p.ammo.shotgun = Math.min(WEAPONS.shotgun.reserve, p.ammo.shotgun + 24);
    else if (id === 'plasmaAmmo') p.ammo.plasma = Math.min(WEAPONS.plasma.reserve, p.ammo.plasma + 36);
    else if (id === 'armor') p.armor = Math.min(p.maxArmor, p.armor + 70);
    else if (id === 'medkit') p.hp = p.maxHp;
    else if (id === 'grenades') p.grenades = Math.min(12, p.grenades + 2);
    const previousIndex = state.levelIndex; state.levelIndex++; saveCheckpoint(); state.levelIndex = previousIndex;
    sound('pickup'); renderShop(); updateUI();
  }
  function shopContinue() { if (state.mode === 'shop') prepareLevel(state.levelIndex + 1, true); }
  function endGame(won) {
    setMode(won ? 'victory' : 'dead');
    if ($('endTitle')) $('endTitle').textContent = won ? 'ПРОТОКОЛ ЗАКРЫТ' : 'СВЯЗЬ ПОТЕРЯНА';
    if ($('endDescription')) $('endDescription').textContent = won ? 'Матка уничтожена. Комплекс зачищен, выжившие эвакуированы. Вы остановили заражение.' : 'Боец погиб в секторе «' + state.level.name + '». Повторите сектор с сохранённым арсеналом.';
    if ($('endKills')) $('endKills').textContent = state.kills;
    if ($('endScore')) $('endScore').textContent = Math.floor(state.player.cash).toLocaleString('ru-RU');
    if ($('retry')) $('retry').textContent = won ? 'НОВАЯ ОПЕРАЦИЯ' : 'ПОВТОРИТЬ СЕКТОР';
    if (won) { checkpoint = null; try { localStorage.removeItem(SAVE_KEY); } catch (_) {} updateContinue(); }
    sound(won ? 'terminal' : 'alert');
  }
  function retry() {
    if (state.mode === 'victory') { startNew(); return; }
    if (state.mode !== 'dead') return;
    const saved = readCheckpoint();
    if (saved) { checkpoint = saved; continueGame(); }
    else { state.player = cleanInventory(levelStartInventory) || playerDefault(); prepareLevel(state.levelIndex, true); }
  }
  function returnMenu() { setMode('menu'); checkpoint = readCheckpoint(); updateContinue(); }
  function togglePause() {
    if (state.mode === 'playing') setMode('paused'); else if (state.mode === 'paused') setMode('playing');
  }
  function update(dt) {
    state.time += dt; state.levelTime += dt;
    updatePlayer(dt); updateBullets(dt);
    if (state.mode !== 'playing') return;
    updateEnemies(dt); collectPickups(dt);
    for (const grenade of state.grenades) {
      grenade.life -= dt;
      const moving = { x: grenade.x, y: grenade.y, r: .1 };
      const oldX = moving.x, oldY = moving.y;
      W.move(state.level, moving, grenade.vx * dt, grenade.vy * dt);
      if (Math.abs(moving.x - oldX) < Math.abs(grenade.vx * dt) * .5) grenade.vx *= -.45;
      if (Math.abs(moving.y - oldY) < Math.abs(grenade.vy * dt) * .5) grenade.vy *= -.45;
      grenade.x = moving.x; grenade.y = moving.y; grenade.vx *= Math.pow(.25, dt); grenade.vy *= Math.pow(.25, dt);
      if (grenade.life <= 0) explode(grenade.x, grenade.y, 3.1, 320, true);
    }
    state.grenades = state.grenades.filter(g => g.life > 0);
    state.enemies = state.enemies.filter(e => e.hp > 0);
    updateObjective();
    if (touchDevice) {
      const nearTerminal = state.terminals.find(t => !t.active && dist(t, state.player) < .9);
      if (nearTerminal || (state.exitReady && dist(state.player, state.level.exit) < .9)) interact();
    }
  }
  function setText(id, text) { const el = $(id); if (el) el.textContent = text; }
  function updateUI() {
    const p = state.player, spec = WEAPONS[p.weapon];
    setText('hpText', Math.ceil(p.hp) + ' / ' + p.maxHp); if ($('hpFill')) $('hpFill').style.width = clamp(p.hp / p.maxHp * 100, 0, 100) + '%';
    setText('armorText', Math.ceil(p.armor)); setText('ammoText', p.reload > 0 ? 'ПЕРЕЗАРЯДКА…' : p.clip[p.weapon] + ' / ' + (p.weapon === 'pistol' ? '∞' : p.ammo[p.weapon]));
    setText('weaponName', spec.name); setText('cash', Math.floor(p.cash).toLocaleString('ru-RU')); setText('kills', state.kills);
    setText('sectorTitle', state.level ? state.level.name : 'ПРОТОКОЛ ЗАРАЖЕНИЯ');
    setText('missionStatus', state.level ? objectiveText() : ''); setText('enemyCount', state.spawnRemaining);
    setText('grenadesText', p.grenades); setText('grenadeButton', '◉ ' + p.grenades); setText('weaponSwitch', p.weapon === 'rifle' ? 'АВТ' : p.weapon === 'pistol' ? 'ПСТ' : p.weapon === 'shotgun' ? 'ДРБ' : 'ПЛЗ');
    for (const button of document.querySelectorAll('[data-weapon]')) {
      const key = button.dataset.weapon; button.classList.toggle('active', key === p.weapon); button.classList.toggle('locked', !p.owned[key]); button.setAttribute('aria-pressed', String(key === p.weapon)); button.disabled = !p.owned[key];
    }
    if ($('interactButton') && state.level) {
      const near = state.terminals.some(t => !t.active && dist(t, p) < 1.3) || dist(p, state.level.exit) < 1.4;
      $('interactButton').classList.toggle('ready', near); $('interactButton').disabled = !near;
    }
    if ($('interactHint') && state.level) {
      const terminal = state.terminals.find(t => !t.active && dist(t, p) < 1.3);
      const nearExit = dist(p, state.level.exit) < 1.4;
      $('interactHint').classList.toggle('hidden', state.mode !== 'playing' || (!terminal && !nearExit));
      const label = $('interactHint').querySelector('span');
      if (label) label.textContent = terminal ? 'АКТИВИРОВАТЬ ' + (terminal.label || 'ТЕРМИНАЛ') : state.exitReady ? 'ПОКИНУТЬ СЕКТОР' : 'ВЫХОД ЗАБЛОКИРОВАН';
    }
  }
  function tick(now) {
    const dt = Math.min(.04, Math.max(0, (now - (lastFrame || now)) / 1000)); lastFrame = now;
    if (state.mode === 'playing') update(dt);
    for (const item of state.effects) item.life -= dt;
    state.effects = state.effects.filter(item => item.life > 0);
    for (const corpse of state.corpses) corpse.age += dt;
    state.shake *= Math.exp(-dt * 12); state.flash = Math.max(0, state.flash - dt * 2);
    state.toastTime -= dt; if (state.toastTime <= 0 && $('toast')) $('toast').classList.add('hidden');
    uiTimer -= dt; if (uiTimer <= 0) { updateUI(); uiTimer = .12; }
    R.render(state, dt);
    requestAnimationFrame(tick);
  }
  function on(id, event, fn) { const el = $(id); if (el) el.addEventListener(event, fn); }
  on('start', 'click', startNew); on('continue', 'click', continueGame); on('deploy', 'click', deploy);
  on('pauseButton', 'click', togglePause); on('resume', 'click', togglePause); on('quit', 'click', returnMenu); on('endMenu', 'click', returnMenu); on('retry', 'click', retry); on('shopContinue', 'click', shopContinue);
  on('reloadButton', 'click', reload); on('grenadeButton', 'click', throwGrenade);
  on('interactButton', 'click', interact); on('weaponSwitch', 'click', () => { if (state.mode === 'playing') cycleWeapon(); });
  for (const button of document.querySelectorAll('[data-weapon]')) button.addEventListener('click', () => { if (state.mode === 'playing') switchWeapon(button.dataset.weapon); });
  on('mute', 'click', () => { muted = !muted; if (window.FrontierV6 && window.FrontierV6.mute) window.FrontierV6.mute(muted); if ($('mute')) { $('mute').textContent = muted ? '♪̸' : '♫'; $('mute').setAttribute('aria-pressed', String(muted)); } if (!muted) sound('pickup'); });
  on('fullscreen', 'click', () => { const promise = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); if (promise && promise.catch) promise.catch(() => toast('Полноэкранный режим недоступен в этом браузере.')); });
  on('motionToggle', 'change', e => { state.reducedMotion = !!e.target.checked; });
  document.addEventListener('keydown', e => {
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.code === 'Escape' && !e.repeat) { togglePause(); return; }
    if (state.mode !== 'playing') return;
    input.keys.add(e.code);
    if (e.repeat) return;
    if (e.code === 'KeyR') reload();
    else if (e.code === 'Space' || e.code === 'KeyG') throwGrenade();
    else if (e.code === 'KeyE') interact();
    else if (e.code === 'KeyQ') cycleWeapon();
    else if (/^Digit[1-4]$/.test(e.code)) switchWeapon(['pistol', 'shotgun', 'rifle', 'plasma'][Number(e.code.slice(-1)) - 1]);
  });
  document.addEventListener('keyup', e => input.keys.delete(e.code));
  window.addEventListener('blur', () => { clearInput(); if (state.mode === 'playing') setMode('paused'); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && state.mode === 'playing') setMode('paused'); });
  const canvas = $('stage');
  if (canvas) {
    canvas.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' || !e.pointerType) { state.pointer.x = e.clientX; state.pointer.y = e.clientY; input.pointerValid = true; } });
    canvas.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch' || state.mode !== 'playing') return;
      e.preventDefault(); input.pointerValid = true; state.pointer.x = e.clientX; state.pointer.y = e.clientY;
      if (e.button === 0) input.fire = true;
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }
  window.addEventListener('pointerup', e => { if (e.pointerType !== 'touch') input.fire = false; });
  window.addEventListener('pointercancel', e => { if (e.pointerType !== 'touch') input.fire = false; });
  function joystick(id, knobId, target, aiming) {
    const element = $(id), knob = $(knobId); if (!element) return;
    let activePointer = null;
    function motion(e) {
      const bounds = element.getBoundingClientRect(); const radius = Math.min(bounds.width, bounds.height) * .35;
      const x = e.clientX - bounds.left - bounds.width / 2, y = e.clientY - bounds.top - bounds.height / 2;
      const length = Math.hypot(x, y), scale = length > radius ? radius / length : 1;
      target.x = length < radius * .15 ? 0 : x * scale / radius; target.y = length < radius * .15 ? 0 : y * scale / radius;
      if (knob) knob.style.transform = 'translate(' + (x * scale).toFixed(1) + 'px,' + (y * scale).toFixed(1) + 'px)';
      if (aiming) input.touchAim = true;
    }
    function release(e) {
      if (activePointer !== e.pointerId) return;
      activePointer = null; target.x = target.y = 0; if (aiming) input.touchAim = false;
      if (knob) knob.style.transform = 'translate(0px,0px)';
    }
    element.addEventListener('pointerdown', e => { if (state.mode !== 'playing' || activePointer !== null) return; e.preventDefault(); activePointer = e.pointerId; element.setPointerCapture(e.pointerId); motion(e); });
    element.addEventListener('pointermove', e => { if (activePointer !== e.pointerId) return; e.preventDefault(); motion(e); });
    element.addEventListener('pointerup', release); element.addEventListener('pointercancel', release); element.addEventListener('lostpointercapture', release);
  }
  joystick('moveStick', 'moveKnob', input.move, false); joystick('aimStick', 'aimKnob', input.aim, true);
  checkpoint = readCheckpoint(); updateContinue();
  // Render a genuine sector behind the menu, without simulating a hidden battle.
  state.level = W.level(0); state.player.x = state.level.spawn.x; state.player.y = state.level.spawn.y;
  state.terminals = (state.level.terminals || []).map(t => Object.assign({ active: false }, t));
  state.nests = (state.level.nests || []).map(n => Object.assign({ hp: n.hp || 260, maxHp: n.hp || 260, budget: 0 }, n));
  setMode('menu');
  if (TEST) {
    window.OutbreakDebug = {
      getState: () => state,
      snapshot: () => ({ mode: state.mode, levelIndex: state.levelIndex, level: state.level.id, player: { x: state.player.x, y: state.player.y, hp: state.player.hp, armor: state.player.armor, weapon: state.player.weapon, ammo: Object.assign({}, state.player.ammo), clip: Object.assign({}, state.player.clip), cash: state.player.cash, owned: Object.assign({}, state.player.owned), grenades: state.player.grenades }, enemies: state.enemies.length, spawnRemaining: state.spawnRemaining, totalEnemies: state.totalEnemies, kills: state.kills, terminalCount: state.terminals.length, activeTerminals: state.terminals.filter(t => t.active).length, livingNests: state.nests.filter(n => n.hp > 0).length, exitReady: state.exitReady, queued: queued.length, bullets: state.bullets.length, time: state.time, audioReady: !!audioContext && audioContext.state === 'running' || !!(window.FrontierV6 && window.FrontierV6.status && window.FrontierV6.status().audioReady), assetsReady: !!(R.status && R.status().assetsReady) }),
      finishLevel: () => { if (state.mode !== 'playing') return false; for (const t of state.terminals) t.active = true; for (const n of state.nests) { n.hp = 0; n.budget = 0; } queued = []; state.enemies = []; state.spawnRemaining = 0; updateObjective(); state.player.x = state.level.exit.x; state.player.y = state.level.exit.y; interact(); return true; },
      step: seconds => { if (!Number.isFinite(seconds) || seconds < 0 || seconds > 10) return false; for (let t = 0; t < seconds && state.mode === 'playing'; t += .02) update(Math.min(.02, seconds - t)); return true; },
      teleport: (x, y) => { if (!Number.isFinite(x) || !Number.isFinite(y) || !W.isWalkable(state.level, x, y, state.player.r)) return false; state.player.x = x; state.player.y = y; return true; },
      damagePlayer, interact, reload, switchWeapon, buy, throwGrenade,
      fire: () => { if (state.mode === 'playing') fire(); },
      resetSeed: () => { seed = 7102026; }
    };
  }
  requestAnimationFrame(tick);
})();
