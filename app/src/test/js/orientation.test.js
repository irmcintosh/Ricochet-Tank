const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const assets = path.resolve(__dirname, '..', '..', 'main', 'assets');
const clone = (value) => JSON.parse(JSON.stringify(value));

function createGame(width = 390, height = 844) {
  const elements = new Map();
  const listeners = new Map();
  const frames = new Map();
  const storage = new Map();
  let nextFrame = 0;
  let clock = 0;
  const listen = (map, type, callback) => {
    if (!map.has(type)) map.set(type, []);
    map.get(type).push(callback);
  };
  const drawing = new Proxy({
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    measureText: (text) => ({ width: text.length * 6 }),
  }, { get: (target, key) => key in target ? target[key] : () => {} });
  const window = {
    innerWidth: width, innerHeight: height, devicePixelRatio: 1,
    addEventListener: (type, callback) => listen(listeners, type, callback),
    setInterval: () => 1, clearInterval() {}, setTimeout: () => 1,
    localStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
  };
  function element(id) {
    if (elements.has(id)) return elements.get(id);
    const classes = new Set(id.startsWith('screen-') && id !== 'screen-start' ? ['hidden'] : []);
    const attrs = new Map();
    const handlers = new Map();
    const el = {
      width: 104, height: 64, clientWidth: 86, offsetWidth: 96, handlers,
      style: { setProperty() {} },
      classList: {
        add: (...names) => names.forEach((name) => classes.add(name)),
        remove: (...names) => names.forEach((name) => classes.delete(name)),
        contains: (name) => classes.has(name),
        toggle: (name, force) => {
          const on = force === undefined ? !classes.has(name) : force;
          if (on) classes.add(name);
          else classes.delete(name);
          return on;
        },
      },
      addEventListener: (type, callback) => listen(handlers, type, callback),
      setAttribute: (name, value) => attrs.set(name, value),
      getAttribute: (name) => attrs.get(name),
      querySelectorAll: () => [],
      getContext: () => drawing,
      getBoundingClientRect: () => ({
        left: 0, top: 0,
        width: id === 'game-canvas' ? parseFloat(el.style.width) : window.innerWidth,
        height: id === 'game-canvas' ? parseFloat(el.style.height) : window.innerHeight,
        bottom: id === 'hud-bar' ? 44 : window.innerHeight,
      }),
    };
    elements.set(id, el);
    return el;
  }
  const context = vm.createContext({
    window, console, performance: { now: () => clock }, navigator: {},
    document: {
      hidden: false, activeElement: null, addEventListener() {},
      getElementById: element, querySelector: element,
      createElement: () => element(`offscreen-${elements.size}`),
    },
    requestAnimationFrame: (callback) => { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame: (id) => frames.delete(id),
  });
  for (const name of ['arena_layout.js', 'mp_comms.js', 'game.js']) {
    let source = fs.readFileSync(path.join(assets, name), 'utf8');
    if (name === 'game.js') {
      // Inspect the existing IIFE in memory without adding a public gameplay/debug API.
      source = source.replace(/\}\)\(\);\s*$/, `window.game = {
        state, particleSystem, startNewGame, loadWave, resizeCanvas, ensurePeerComms,
        generateProceduralSector, validateSectorConnectivity, buildStateSnapshot,
        circleIntersectsRect, circleIntersectsDeflector, updateAttractSkirmish, clientToArena
      }; })();`);
    }
    vm.runInContext(source, context, { filename: name });
  }
  const runFrames = (now) => {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(now);
  };
  const emit = (handlers, type, target, props) => {
    const event = { button: 0, target, preventDefault() {}, stopPropagation() {}, ...props };
    for (const callback of handlers.get(type) || []) callback(event);
  };
  return {
    ...window.game, window, elements, layout: window.RicochetArena,
    rotate(w, h) { window.innerWidth = w; window.innerHeight = h; window.game.resizeCanvas(); },
    event(type) {
      emit(listeners, type, window, {});
      runFrames(16);
    },
    emit(type, props = {}) { emit(listeners, type, window, props); },
    dispatch(id, type, props = {}) { emit(element(id).handlers, type, element(id), props); },
    advance(ms) { clock += ms; },
    tick(ms = 16) {
      clock += ms;
      runFrames(clock);
    },
    peer(role) {
      const peer = window.game.ensurePeerComms();
      const events = [];
      peer.role = role;
      peer.connected = true;
      peer.sendEvent = (message) => events.push(clone(message));
      peer.sendState = () => {};
      return { peer, events };
    },
  };
}

function almostEqual(actual, expected, tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
}

function pose(entity) {
  return [entity.x, entity.y, entity.w, entity.h, entity.hp, entity.alive, entity.vx, entity.vy,
    entity.hullAngle, entity.turretAngle, entity.moveAngle, entity.sniperLockAngle,
    entity.spawnX, entity.spawnY, entity.angle, entity.rot];
}

const DEG = Math.PI / 180;

function openBattlefield(s) {
  s.phase = 'playing';
  for (const group of ['stones', 'crates', 'tempBarriers', 'deflectors']) s[group].length = 0;
  s.enemies.forEach((enemy) => { enemy.alive = false; });
}

function placeAt(body, from, angle, dist = 200) {
  return Object.assign(body, { alive: true, x: from.x + Math.cos(angle) * dist, y: from.y + Math.sin(angle) * dist });
}

function shotAngle(s, owner) {
  const shots = s.bullets.filter((bullet) => bullet.owner === owner);
  assert.equal(shots.length, 1);
  return Math.atan2(shots[0].vy, shots[0].vx);
}

test('live rotations preserve entities, collisions, buffs, shell trajectories and sector progress', () => {
  const game = createGame();
  game.startNewGame('coop', 'local-split');
  const s = game.state;
  s.paused = true;
  s.phase = 'wave_transition';
  s.score = 450;
  s.transitionTimer = 1.2;
  s.player.hp = 2;
  s.player.buffs.rapid = 4.2;
  s.touch.fireReleaseQueued = 0.14;
  s.p2Touch.fireReleaseQueued = 0.14;
  s.crates[0].hp = 0;
  const bullet = { id: 99, owner: 'player', x: 260, y: 740, vx: 435, vy: 50, radius: 4.2,
    bouncesLeft: 1, age: 0.4, trail: [{ x: 250, y: 730 }] };
  s.bullets.push(bullet);
  s.tempBarriers.push({ x: 70, y: 750, w: 48, h: 18, hp: 3 });
  s.mines.push({ x: 100, y: 780, radius: 10, armTimer: 0.4 });
  game.particleSystem.particles.push({ x: 200, y: 720, vx: 10, vy: 30, rot: 0.2, life: 1 });
  const bodies = [s.player, s.player2, ...s.enemies, ...s.stones, ...s.crates,
    ...s.tempBarriers, ...s.deflectors, ...s.mines, bullet, ...game.particleSystem.particles];
  const original = bodies.map(pose);
  const grid = clone(s.currentSectorSpec.grid);
  const hits = () => [s.player, s.player2, bullet].map((body) =>
    s.stones.some((wall) => game.circleIntersectsRect(body.x, body.y, body.radius, wall)) ||
    s.deflectors.some((wall) => game.circleIntersectsDeflector(body.x, body.y, body.radius, wall)));
  assert.deepEqual(hits(), [false, false, false]);

  for (let cycle = 0; cycle < 10; cycle++) {
    game.rotate(844, 390);
    assert.equal(s.currentSectorSpec.grid.length, 14);
    assert.equal(s.currentSectorSpec.grid[0].length, 31);
    assert.ok(s.stones.some((stone) => stone.flank));
    assert.deepEqual(hits(), [false, false, false]);
    almostEqual(Math.hypot(bullet.vx, bullet.vy), Math.hypot(435, 50));
    assert.equal(s.player, bodies[0]);
    assert.equal(s.bullets[0], bullet);
    const heading = s.player.turretAngle;
    game.rotate(915, 412);
    assert.equal(s.currentSectorSpec.grid[0].length, 32);
    almostEqual(s.player.turretAngle, heading);
    assert.deepEqual(hits(), [false, false, false]);
    game.rotate(390, 844);
    assert.deepEqual(hits(), [false, false, false]);
    assert.equal(s.stones.some((stone) => stone.flank), false);
  }
  bodies.forEach((body, i) => pose(body).forEach((value, j) => {
    if (typeof value === 'number') almostEqual(value, original[i][j]);
    else assert.equal(value, original[i][j]);
  }));
  assert.deepEqual(clone(s.currentSectorSpec.grid), grid);
  assert.deepEqual(clone(bullet.trail), [{ x: 250, y: 730 }]);
  assert.equal(s.paused, true);
  assert.equal(s.phase, 'wave_transition');
  assert.equal(s.touch.fireReleaseQueued, 0);
  assert.equal(s.p2Touch.fireReleaseQueued, 0);
  assert.equal(s.score, 450);
  assert.equal(s.transitionTimer, 1.2);
  assert.equal(s.player.buffs.rapid, 4.2);
  assert.equal(bullet.bouncesLeft, 1);
  assert.equal(bullet.age, 0.4);
});

test('all four steel deflector corners retain collision and reflection normals after a turn', () => {
  const game = createGame();
  const before = game.state.deflectors.map((deflector) => {
    const edge = deflector.edges.find((value) => value.isHyp);
    const point = { x: (edge.ax + edge.bx) / 2 + edge.nx * 2, y: (edge.ay + edge.by) / 2 + edge.ny * 2 };
    assert.equal(game.circleIntersectsDeflector(point.x, point.y, 4.2, deflector), true);
    return { edge: { ...edge }, point, vx: -edge.nx * 300, vy: -edge.ny * 300 };
  });
  assert.equal(new Set(game.state.deflectors.map((value) => value.kind)).size, 4);
  game.rotate(844, 390);
  game.state.deflectors.forEach((deflector, i) => {
    const old = before[i];
    const normal = deflector.edges.find((value) => value.isHyp);
    almostEqual(normal.nx, -old.edge.ny);
    almostEqual(normal.ny, old.edge.nx);
    assert.equal(game.circleIntersectsDeflector(game.layout.widenX(880 - old.point.y, 880, 40, 31 * 40), old.point.x, 4.2, deflector), true);
    const vx = -old.vy;
    const vy = old.vx;
    const dot = vx * normal.nx + vy * normal.ny;
    almostEqual(vx - 2 * dot * normal.nx, -old.edge.ny * 300);
    almostEqual(vy - 2 * dot * normal.ny, old.edge.nx * 300);
  });
});

test('procedural normal and boss sectors fill landscape widths with reachable, reversible flank lanes', () => {
  const game = createGame();
  for (const [w, h, cols] of [[780, 420, 26], [840, 420, 28], [900, 420, 30], [844, 390, 31], [915, 412, 32]]) {
    game.rotate(w, h);
    for (const bossType of [null, 'boss_juggernaut', 'boss_sniper', 'boss_vanguard']) {
      const seed = 7;
      const opts = { seed, forceBoss: !!bossType, bossType };
      const portrait = game.generateProceduralSector(6, { ...opts, landscape: false });
      const landscape = game.generateProceduralSector(6, { ...opts, landscape: true });
      assert.equal(portrait.grid.length, 22);
      assert.equal(portrait.grid[0].length, 14);
      assert.equal(landscape.grid.length, 14);
      assert.equal(landscape.grid[0].length, cols);
      assert.equal(game.validateSectorConnectivity(landscape.grid), true);
      assert.deepEqual(clone(landscape.grid), clone(game.layout.toLandscapeGrid(portrait.grid, cols)));
      assert.deepEqual(clone(game.layout.toPortraitGrid(landscape.grid)), clone(portrait.grid));
      for (let r = 1; r < 13; r++) {
        const { left, right } = game.layout.flankColumns(cols);
        assert.equal(landscape.grid[r].slice(2, left + 1), '.'.repeat(left - 1), 'left flank stays open');
        assert.equal(landscape.grid[r].slice(cols - right - 1, cols - 2), '.'.repeat(right - 1), 'right flank stays open');
        assert.equal(landscape.grid[r][1] === '#', landscape.grid[13 - r][cols - 2] === '#', 'flank pillars mirror');
      }
    }
  }
});

test('flank lanes are open in landscape and evacuate safely when turning back to portrait', () => {
  const game = createGame();
  game.startNewGame('coop', 'local-split');
  const s = game.state;
  s.paused = true;
  const portraitStones = s.stones.length;
  game.rotate(844, 390);
  const grid = s.currentSectorSpec.grid;
  const cols = grid[0].length;
  const { left, right } = game.layout.flankColumns(cols);
  const flankStones = s.stones.filter((stone) => stone.flank);
  assert.equal(s.stones.length, portraitStones + flankStones.length);
  assert.ok(flankStones.every((stone) => stone.x / 40 <= left || stone.x / 40 >= cols - 1 - right));
  const row = grid.findIndex((line, r) => r > 0 &&
    line.slice(1, left + 1) + line.slice(cols - right - 1, cols - 1) === '.'.repeat(left + right));
  const y = row * 40 + 20;
  const enemy = s.enemies[0];
  Object.assign(s.player, { x: 60, y });
  Object.assign(s.player2, { x: 100, y });
  Object.assign(enemy, { x: cols * 40 - 60, y });
  s.bullets.push({ owner: 'enemy', x: 70, y: y + 10, vx: -300, vy: 0, radius: 4.2, bouncesLeft: 1, trail: [{ x: 90, y }] });
  s.mines.push({ x: 90, y: y - 12, radius: 10, armTimer: 0.4 });
  s.powerUps.push({ type: 'rapid', x: cols * 40 - 90, y, radius: 13, age: 0, life: 9, maxLife: 9 });
  s.tempBarriers.push({ x: 48, y: y + 24, w: 36, h: 16, hp: 3, maxHp: 3, hitFlash: 0 });
  s.treadMarks.push({ x: 60, y, angle: 0, life: 4, maxLife: 4 });
  const blocked = (body) => [...s.stones, ...s.crates.filter((crate) => crate.hp > 0), ...s.tempBarriers]
    .some((wall) => game.circleIntersectsRect(body.x, body.y, body.radius, wall)) ||
    s.deflectors.some((wall) => game.circleIntersectsDeflector(body.x, body.y, body.radius, wall));
  const tanks = [s.player, s.player2, enemy];
  assert.deepEqual(tanks.map(blocked), [false, false, false]);

  game.rotate(390, 844);
  assert.equal(s.stones.length, portraitStones);
  assert.equal(s.currentSectorSpec.grid[0].length, 14);
  const bodies = [...tanks, ...s.bullets, ...s.mines, ...s.powerUps];
  assert.equal(bodies.length, 6);
  for (const body of bodies) {
    assert.equal(blocked(body), false);
    assert.ok(body.x >= 40 + body.radius && body.x <= 520 - body.radius);
    assert.ok(body.y >= 40 + body.radius && body.y <= 840 - body.radius);
  }
  assert.ok(Math.hypot(s.player.x - s.player2.x, s.player.y - s.player2.y) >= 30);
  for (const barrier of s.tempBarriers) {
    assert.ok(barrier.x >= 40 && barrier.x + barrier.w <= 520 && barrier.y >= 40 && barrier.y + barrier.h <= 840);
  }
  assert.equal(s.treadMarks.length, 0);

  game.rotate(844, 390);
  assert.equal(s.stones.filter((stone) => stone.flank).length, flankStones.length);
});

test('mixed-orientation peers share host geometry and reject packets from obsolete arenas', () => {
  const host = createGame();
  const client = createGame(844, 390);
  const h = host.peer('host');
  const c = client.peer('client');
  host.startNewGame('coop', 'p2p-host');
  c.peer.handlers.onEventMessage(h.events.at(-1));
  assert.equal(client.state.arenaLandscape, false);
  const oldSnapshot = clone(host.buildStateSnapshot());
  h.peer.handlers.onStateMessage({ t: 'in', rev: host.state.arenaRevision, mx: 1, my: 0, fireHeld: true });
  assert.equal(host.state.p2Input.mx, 1);
  host.state.paused = client.state.paused = true;
  host.state.player.hp = 2;
  host.state.crates[0].hp = 0;
  host.rotate(844, 390);
  const rotation = h.events.at(-1);
  assert.equal(rotation.t, 'arena');

  c.peer.handlers.onStateMessage(rotation.snapshot);
  assert.equal(client.state.arenaLandscape, false);
  c.peer.handlers.onEventMessage(rotation);
  assert.equal(client.state.arenaLandscape, true);
  assert.equal(client.state.player.hp, 2);
  assert.equal(client.state.crates[0].hp, 0);
  assert.equal(client.state.paused, true);
  const aligned = clone(client.buildStateSnapshot());
  c.peer.handlers.onStateMessage(oldSnapshot);
  assert.deepEqual(clone(client.buildStateSnapshot().p1), aligned.p1);
  h.peer.handlers.onStateMessage({ t: 'in', rev: oldSnapshot.rev, mx: 1, my: 0, fireHeld: true });
  h.peer.handlers.onEventMessage({ t: 'fire', rev: oldSnapshot.rev, a: 0 });
  assert.equal(host.state.p2Input.mx, 0);
  assert.equal(host.state.p2Input.fireHeld, false);
  assert.equal(host.state.p2Input.fireQueued, 0);
  client.rotate(390, 844);
  assert.equal(client.state.arenaLandscape, true);
  assert.equal(client.state.arenaRevision, host.state.arenaRevision);
  const cs = client.state;
  const aimPoint = client.clientToArena(
    cs.renderOffsetX + cs.player2.x * cs.renderScale,
    cs.renderOffsetY + cs.player2.y * cs.renderScale
  );
  almostEqual(aimPoint.x, cs.player2.x);
  almostEqual(aimPoint.y, cs.player2.y);
  assert.equal(h.peer.connected, true);
  assert.equal(c.peer.connected, true);

  host.rotate(915, 412);
  const wider = h.events.at(-1);
  assert.equal(wider.cols, 32);
  c.peer.handlers.onEventMessage(wider);
  assert.equal(client.state.currentSectorSpec.grid[0].length, 32);
  almostEqual(client.state.player.x, host.state.player.x, 0.051);
  almostEqual(client.state.player.y, host.state.player.y, 0.051);

  host.startNewGame('coop', 'p2p-host');
  const wave = h.events.at(-1);
  assert.equal(wave.spec.grid[0].length, 32);
  c.peer.handlers.onEventMessage(wave);
  for (const group of ['stones', 'crates', 'enemies']) {
    assert.equal(host.state[group].length, client.state[group].length);
    host.state[group].forEach((entity, i) => {
      almostEqual(entity.x, client.state[group][i].x, 0.051);
      almostEqual(entity.y, client.state[group][i].y, 0.051);
    });
  }
  const tampered = clone(wave);
  tampered.rev = tampered.snapshot.rev = wave.rev + 1;
  tampered.spec.grid[5] = tampered.spec.grid[5].slice(0, 1) + (tampered.spec.grid[5][1] === '#' ? '.' : '#') +
    tampered.spec.grid[5].slice(2);
  c.peer.handlers.onEventMessage(tampered);
  assert.equal(client.state.arenaRevision, wave.rev);
  assert.deepEqual(clone(client.state.currentSectorSpec.grid), wave.spec.grid);
  h.peer.connected = false;
  const sentBeforeDisconnect = h.events.length;
  host.rotate(390, 844);
  assert.equal(h.events.length, sentBeforeDisconnect + 1);
  assert.equal(h.events.at(-1).t, 'arena');
});

test('full-viewport canvas keeps square tiles, visible landscape walls and accurate input at every DPR', () => {
  const game = createGame();
  game.startNewGame('1p', 'solo');
  game.state.paused = true;
  const player = game.state.player;
  for (const [w, h, dpr] of [[844, 390, 2.625], [915, 412, 3], [360, 640, 3], [640, 640, 1], [1024, 600, 2]]) {
    game.window.innerWidth = w;
    game.window.innerHeight = h;
    game.window.devicePixelRatio = dpr;
    game.event(w > h ? 'orientationchange' : 'resize');
    const s = game.state;
    const worldWidth = s.currentSectorSpec.grid[0].length * 40;
    const worldHeight = s.currentSectorSpec.grid.length * 40;
    assert.equal(s.displayW, w);
    assert.equal(s.displayH, h);
    almostEqual(s.renderScale, Math.min(w / worldWidth, h / worldHeight));
    assert.ok(s.renderOffsetX >= -1e-8 && s.renderOffsetY >= -1e-8, 'no gameplay cropping');
    if (w > h) {
      almostEqual(worldWidth * s.renderScale, w);
      almostEqual(s.renderOffsetX, 0);
    }
    for (const [x, y] of [[40, 40], [worldWidth / 2, worldHeight / 2], [worldWidth - 40, worldHeight - 40]]) {
      const point = game.clientToArena(s.renderOffsetX + x * s.renderScale, s.renderOffsetY + y * s.renderScale);
      almostEqual(point.x, x);
      almostEqual(point.y, y);
    }
    assert.equal(game.elements.get('game-canvas').width, Math.round(s.displayW * dpr));
    assert.equal(game.elements.get('game-canvas').height, Math.round(s.displayH * dpr));
    assert.equal(s.player, player);
    assert.equal(s.arenaLandscape, w > h);
  }
});

test('home-screen respawns retain their rotated staging coordinates', () => {
  const game = createGame();
  game.rotate(844, 390);
  const player = game.state.player;
  const spawn = { x: player.spawnX, y: player.spawnY };
  player.alive = false;
  player.aiRespawnTimer = 0;
  game.updateAttractSkirmish(0);
  almostEqual(player.x, spawn.x);
  almostEqual(player.y, spawn.y);
  assert.equal(player.alive, true);
});

test('right stick taps quick-fire with a cone assist while holds and drags aim precisely', () => {
  const game = createGame();
  game.startNewGame('1p', 'solo');
  const s = game.state;
  openBattlefield(s);
  const base = game.elements.get('aim-stick-base');
  const forward = -Math.PI / 2;
  const muzzle = { x: 280, y: 600 };
  const enemy = s.enemies[0];
  const rearm = () => {
    Object.assign(s.player, { ...muzzle, turretAngle: forward, fireCooldown: 0 });
    s.touch.fireReleaseQueued = 0;
    s.bullets.length = 0;
    base.classList.remove('quick-fire');
  };
  const touch = (type, x) =>
    game.dispatch('touch-zone-right', type, { changedTouches: [{ identifier: 1, clientX: x, clientY: 700 }] });
  const tap = () => {
    rearm();
    touch('touchstart', 300);
    game.advance(100);
    touch('touchend', 300);
    assert.equal(s.touch.fireReleaseQueued, 0.14);
    assert.equal(base.classList.contains('quick-fire'), true);
    return s.touch.fireAngle;
  };

  placeAt(enemy, muzzle, forward + 10 * DEG);
  almostEqual(tap(), forward + 10 * DEG);
  game.tick();
  almostEqual(shotAngle(s, 'player'), forward + 10 * DEG);
  assert.equal(s.touch.fireReleaseQueued, 0);
  game.dispatch('aim-stick-base', 'animationend', { target: game.elements.get('aim-stick-knob') });
  assert.equal(base.classList.contains('quick-fire'), true);
  game.dispatch('aim-stick-base', 'animationend');
  assert.equal(base.classList.contains('quick-fire'), false);

  s.stones.push({ x: 270, y: 480, w: 60, h: 40 });
  almostEqual(tap(), forward, 1e-12);
  s.stones.length = 0;
  placeAt(enemy, muzzle, forward + 20 * DEG);
  almostEqual(tap(), forward, 1e-12);

  // A quick 10px flick is still a tap: no turret swing, laser, or custom-aim change before release.
  rearm();
  const idleAim = s.touch.aimAngle;
  touch('touchstart', 300);
  game.advance(80);
  touch('touchmove', 310);
  assert.equal(s.touch.aimActive, false);
  assert.equal(base.classList.contains('precision'), false);
  game.advance(80);
  touch('touchend', 310);
  almostEqual(s.touch.fireAngle, forward, 1e-12);
  assert.equal(s.touch.fireReleaseQueued, 0.14);
  assert.equal(s.touch.aimAngle, idleAim);

  // Holding still past 180ms promotes to precision on the next frame; releasing in the deadzone cancels.
  rearm();
  touch('touchstart', 300);
  game.tick(200);
  assert.equal(s.touch.aimActive, true);
  assert.equal(s.touch.aimArmed, false);
  assert.equal(base.classList.contains('precision'), true);
  touch('touchend', 300);
  assert.equal(s.touch.fireReleaseQueued, 0);
  assert.equal(base.classList.contains('quick-fire'), false);

  // A fast 30px drag aims precisely and the shell leaves along the drag even before the turret catches up.
  rearm();
  touch('touchstart', 300);
  game.advance(40);
  touch('touchmove', 330);
  assert.equal(s.touch.aimArmed, true);
  game.advance(40);
  touch('touchend', 330);
  assert.equal(s.touch.fireAngle, 0);
  assert.equal(base.classList.contains('quick-fire'), false);
  almostEqual(s.player.turretAngle, forward);
  game.tick();
  almostEqual(shotAngle(s, 'player'), 0);

  rearm();
  touch('touchstart', 300);
  touch('touchmove', 330);
  touch('touchmove', 301);
  touch('touchend', 301);
  assert.equal(s.touch.fireReleaseQueued, 0);

  // Desktop mouse on the AIM pad: click quick-fires, click-drag aims.
  game.advance(1000);
  rearm();
  game.dispatch('touch-zone-right', 'mousedown', { clientX: 300, clientY: 700 });
  game.advance(60);
  game.emit('mouseup', { clientX: 300, clientY: 700 });
  almostEqual(s.touch.fireAngle, forward, 1e-12);
  assert.equal(base.classList.contains('quick-fire'), true);
  rearm();
  game.dispatch('touch-zone-right', 'mousedown', { clientX: 300, clientY: 700 });
  game.emit('mousemove', { clientX: 270, clientY: 700 });
  game.emit('mouseup', { clientX: 270, clientY: 700 });
  almostEqual(s.touch.fireAngle, Math.PI);
  assert.equal(s.touch.fireReleaseQueued, 0.14);
  assert.equal(base.classList.contains('quick-fire'), false);
});

for (const control of ['touch', 'p2-touch', 'mouse']) {
  test(`${control} aim release samples the final position for thresholds, direction and cancellation`, () => {
    const game = createGame();
    game.startNewGame('coop', 'local-split');
    const s = game.state;
    openBattlefield(s);
    const isP2 = control === 'p2-touch';
    const ts = isP2 ? s.p2Touch : s.touch;
    const tank = isP2 ? s.player2 : s.player;
    const base = game.elements.get(isP2 ? 'p2-aim-stick-base' : 'aim-stick-base');
    const zone = isP2 ? 'touch-zone-p2-right' : 'touch-zone-right';
    const forward = -Math.PI / 2;
    Object.assign(tank, { x: 280, y: 600, turretAngle: forward });
    placeAt(s.enemies[0], tank, 0);

    const input = (phase, x, y = 300) => {
      if (control === 'mouse') {
        const type = { start: 'mousedown', move: 'mousemove', end: 'mouseup' }[phase];
        const props = { clientX: x, clientY: y };
        if (phase === 'start') game.dispatch(zone, type, props);
        else game.emit(type, props);
      } else {
        game.dispatch(zone, `touch${phase}`, {
          changedTouches: [{ identifier: 1, clientX: x, clientY: y }],
        });
      }
    };
    const begin = () => {
      game.advance(1000);
      tank.turretAngle = forward;
      tank.fireCooldown = 0;
      ts.fireReleaseQueued = 0;
      s.bullets.length = 0;
      base.classList.remove('quick-fire');
      input('start', 300);
    };
    const expectShot = (angle, quick) => {
      assert.equal(ts.fireReleaseQueued, 0.14);
      almostEqual(ts.fireAngle, angle);
      assert.equal(base.classList.contains('quick-fire'), quick);
      game.tick();
      almostEqual(shotAngle(s, isP2 ? 'p2' : 'player'), angle);
    };

    begin();
    game.advance(179);
    input('end', 311.99);
    expectShot(forward, true);

    // No move event: reaching exactly 12px on release is precision, not a tap.
    begin();
    game.advance(179);
    input('end', 312);
    expectShot(0, false);

    // The last release point also supplies direction when it differs from the last move.
    begin();
    input('move', 330);
    input('end', 300, 270);
    expectShot(-Math.PI / 2, false);

    begin();
    input('move', 330);
    input('end', 300);
    assert.equal(ts.fireReleaseQueued, 0);
    assert.equal(base.classList.contains('quick-fire'), false);

    // No frame or move event: exactly 180ms still counts as a hold, and center cancels.
    begin();
    game.advance(180);
    input('end', 300);
    assert.equal(ts.fireReleaseQueued, 0);
    assert.equal(base.classList.contains('quick-fire'), false);
  });
}

test('quick-fire taps stay exact over WebRTC and for the local-split second stick', () => {
  const host = createGame();
  const client = createGame(844, 390);
  const h = host.peer('host');
  const c = client.peer('client');
  host.startNewGame('coop', 'p2p-host');
  c.peer.handlers.onEventMessage(h.events.at(-1));
  const muzzle = { x: 280, y: 600 };
  const assisted = -Math.PI / 2 + 10 * DEG;
  for (const game of [host, client]) {
    openBattlefield(game.state);
    Object.assign(game.state.player2, { ...muzzle, turretAngle: -Math.PI / 2, fireCooldown: 0 });
    placeAt(game.state.enemies[0], muzzle, assisted);
  }
  const touch = (type) => client.dispatch('touch-zone-right', type,
    { changedTouches: [{ identifier: 3, clientX: 600, clientY: 300 }] });
  touch('touchstart');
  client.advance(90);
  touch('touchend');
  const fire = c.events.at(-1);
  assert.equal(fire.t, 'fire');
  assert.equal(fire.rev, client.state.arenaRevision);
  almostEqual(fire.a, assisted, 1e-3);
  assert.equal(client.elements.get('aim-stick-base').classList.contains('quick-fire'), true);

  host.state.player2.turretAngle = Math.PI;
  host.state.bullets.length = 0;
  h.peer.handlers.onEventMessage(fire);
  host.tick();
  almostEqual(shotAngle(host.state, 'p2'), fire.a, 1e-12);

  const duel = createGame();
  duel.startNewGame('duel', 'local-split');
  const s = duel.state;
  openBattlefield(s);
  Object.assign(s.player2, { x: 280, y: 200, turretAngle: Math.PI / 2 });
  Object.assign(s.player, { x: 300, y: 600 });
  const p2Touch = (type) => duel.dispatch('touch-zone-p2-right', type,
    { changedTouches: [{ identifier: 7, clientX: 120, clientY: 120 }] });
  p2Touch('touchstart');
  duel.advance(90);
  p2Touch('touchend');
  assert.equal(s.p2Touch.fireReleaseQueued, 0.14);
  almostEqual(s.p2Touch.fireAngle, Math.atan2(400, 20));
  assert.equal(duel.elements.get('p2-aim-stick-base').classList.contains('quick-fire'), true);
});
