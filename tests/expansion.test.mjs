import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, GROUND, STEP } from '../src/game.js';
import { WEAPONS } from '../src/data.js';

function arena(seed = 123) {
  const g = new Game({ storage: { getItem() { return null; }, setItem() {} } });
  g.startRun(seed);
  g.room.covers = []; g.room.platforms = []; g.enemies = []; g.pickups = [];
  g.updateRoomProgress = () => {}; g.player.invuln = 0;
  return g;
}
function advance(g, seconds) {
  for (let i = 0; i < Math.round(seconds / STEP); i++) g.tick(STEP);
}
function incoming(g, y) {
  return { id: 9001, x: g.player.x - 100, y, px: g.player.x - 100, py: y,
    vx: 1000, vy: 0, owner: 'enemy', damage: 10, radius: 2, life: 1,
    travel: 0, hitIds: new Set(), pierce: 0, weaponId: 'pistol', originX: 0, originY: GROUND };
}
function crate(x = 185) {
  return { x, y: 588, w: 60, h: 52, hp: 100, maxHp: 100, destructible: false };
}

test('crouching reduces the actual hitbox and permits high incoming shots to pass', () => {
  const g = arena();
  g.input.keys.add('KeyC'); advance(g, 0.05);
  assert.equal(g.player.h, 34);
  g.bullets = [incoming(g, GROUND - 45)]; g.updateBullets(0.2);
  assert.equal(g.player.hp, 100, 'a shot above the crouched head must miss');
  g.input.keys.delete('KeyC'); advance(g, 0.05);
  assert.equal(g.player.h, 58);
  g.bullets = [incoming(g, GROUND - 45)]; g.updateBullets(0.2);
  assert.equal(g.player.hp, 90, 'the same shot hits the standing body');
});

test('crouch movement is slower and the muzzle follows the lower body', () => {
  const g = arena(); g.input.keys.add('KeyC'); g.input.keys.add('KeyD');
  advance(g, 0.4);
  assert.ok(g.player.vx >= 120 && g.player.vx <= 140);
  g.player.aim = 0; g.fire();
  assert.ok(g.bullets.every(b => b.y > GROUND - 34 && b.y < GROUND), 'bullets start inside the crouched body');
  assert.equal(g.stats.shots, 1);
});

test('a safe vault crosses a low crate and cannot be reused during cooldown', () => {
  const g = arena(); g.room.covers = [crate()];
  g.player.facing = 1;
  assert.equal(g.vault(), true);
  assert.equal(g.vault(), false);
  advance(g, 0.8);
  assert.ok(g.player.x >= 260, `vault ended at ${g.player.x}, still inside the crate`);
  assert.equal(g.player.y, GROUND);
  assert.ok(g.player.vaultCooldown > 0);
});

test('vault rejects oversized obstacles and routes blocked by a second obstacle', () => {
  for (const covers of [
    [{ ...crate(), y: 520, h: 120 }],
    [{ ...crate(), w: 150 }],
    [crate(), { ...crate(249), w: 90 }],
  ]) {
    const g = arena(); g.room.covers = covers;
    assert.equal(g.vault(), false);
    advance(g, 0.8);
    assert.equal(g.player.x, 150);
  }
});

test('pause freezes an in-progress vault and its cooldown', () => {
  const g = arena(); g.room.covers = [crate()]; g.vault(); advance(g, 0.1);
  g.pause();
  const state = JSON.stringify([g.player.x, g.player.y, g.player.vault, g.player.vaultCooldown]);
  advance(g, 3);
  assert.equal(JSON.stringify([g.player.x, g.player.y, g.player.vault, g.player.vaultCooldown]), state);
  g.resume(); advance(g, 0.8);
  assert.ok(g.player.x >= 260);
});

test('all weapons lose durability once per discharge, including a seven-pellet shotgun', () => {
  const expected = { pistol: 0.22, revolver: 0.55, smg: 0.09, shotgun: 0.65 };
  for (const [id, wear] of Object.entries(expected)) {
    const g = arena(); g.player.weapons = [g.createWeapon(id)];
    const weapon = g.getWeapon();
    assert.equal(weapon.durability, 100); assert.equal(weapon.wetness, 0); assert.equal(weapon.jammed, false);
    assert.equal(g.fire(), true);
    assert.ok(Math.abs(weapon.durability - (100 - wear)) < 1e-9, id);
    assert.equal(g.bullets.length, WEAPONS[id].pellets);
    g.fire();
    assert.ok(Math.abs(weapon.durability - (100 - wear)) < 1e-9, 'cooldown clicks cause no wear');
  }
});

test('an exhausted weapon jams without consuming ammunition, and five taps restore function', () => {
  const g = arena(), weapon = g.getWeapon();
  weapon.durability = 0; weapon.wetness = 100;
  assert.equal(g.fire(), false); assert.equal(weapon.jammed, true);
  assert.equal(weapon.ammo, 12); assert.equal(g.stats.shots, 0);
  for (let tap = 0; tap < 4; tap++) {
    g.clearJam(); assert.equal(weapon.jammed, true);
    assert.equal(g.fire(), false); assert.equal(weapon.ammo, 12);
  }
  g.clearJam();
  assert.equal(weapon.jammed, false); assert.equal(weapon.clearProgress, 0);
  assert.equal(weapon.wetness, 30); assert.ok(weapon.durability >= 35);
  weapon.cooldown = 0;
  assert.equal(g.fire(), true);
});

test('a healthy weapon can be maintained by holding R, while firing is blocked', () => {
  const g = arena(), weapon = g.getWeapon();
  weapon.durability = 20; weapon.wetness = 60;
  g.input.keys.add('KeyR'); advance(g, 0.5);
  const progress = weapon.maintenance;
  assert.ok(progress > 0);
  g.input.mouse.left = true; advance(g, 0.2);
  assert.equal(g.stats.shots, 0, 'maintenance locks the trigger');
  g.pause(); advance(g, 3);
  assert.ok(weapon.maintenance >= progress, 'pause must preserve current maintenance progress');
  const frozen = JSON.stringify([weapon.durability, weapon.wetness, weapon.maintenance]);
  advance(g, 2); assert.equal(JSON.stringify([weapon.durability, weapon.wetness, weapon.maintenance]), frozen);
  g.resume(); g.input.keys.add('KeyR'); advance(g, 1.7);
  assert.equal(weapon.durability, 100); assert.ok(weapon.wetness <= 15);
});

test('weapon condition and jam progress reset on a new run', () => {
  const g = arena(); Object.assign(g.getWeapon(), { durability: 3, wetness: 100, jammed: true, clearProgress: 3 });
  g.startRun(124);
  const weapon = g.getWeapon();
  assert.equal(weapon.durability, 100); assert.equal(weapon.wetness, 0);
  assert.equal(weapon.jammed, false); assert.equal(weapon.clearProgress, 0);
  assert.equal(g.player.h, 58); assert.equal(g.player.vaultCooldown, 0);
});

test('swapping a dropped weapon back preserves its ammunition, wear, wetness and jam', () => {
  const g = arena();
  g.player.weapons.push(g.createWeapon('smg')); g.player.weaponIndex = 1;
  Object.assign(g.getWeapon(), { ammo: 7, durability: 42, wetness: 81, jammed: true, clearProgress: 2 });
  g.pickups.push({ type: 'weapon', weaponId: 'shotgun', x: g.player.x, y: g.player.y });
  assert.equal(g.interact(), true); assert.equal(g.getWeapon().id, 'shotgun');
  assert.ok(g.pickups.some(p => p.weaponId === 'smg'));
  assert.equal(g.interact(), true);
  const weapon = g.getWeapon();
  assert.equal(weapon.id, 'smg'); assert.equal(weapon.ammo, 7);
  assert.equal(weapon.durability, 42); assert.equal(weapon.wetness, 81);
  assert.equal(weapon.jammed, true);
});

test('prolonged exposed rain jams the active weapon while a holstered gun stays protected', () => {
  const g = arena(); g.player.x = 700; g.room.weatherAllowed = true; g.room.shelters = [];
  Object.assign(g.weather, { intensity: 1, target: 1, timer: 100 });
  g.player.weapons.push(g.createWeapon('smg'));
  g.updateWeather(0.1); assert.equal(g.player.sheltered, false);
  g.updateWeaponCondition(12.2);
  assert.equal(g.getWeapon().jammed, true); assert.equal(g.getWeapon().jamReason, 'rain');
  assert.ok(g.getWeapon().wetness >= 85);
  assert.equal(g.player.weapons[1].wetness, 0); assert.equal(g.player.weapons[1].jammed, false);
});

test('a roof protects only the space below it, and indoor rooms dry wet weapons', () => {
  const g = arena(); g.player.x = 700; g.room.weatherAllowed = true;
  g.room.shelters = [{ x: 650, y: 430, w: 150, h: 12 }];
  Object.assign(g.weather, { intensity: 1, target: 1, timer: 100 });
  g.getWeapon().wetness = 50;
  g.updateWeather(0.1); assert.equal(g.player.sheltered, true);
  g.updateWeaponCondition(1); assert.ok(g.getWeapon().wetness < 50);
  g.player.y = 400; g.updateWeather(0.1); assert.equal(g.player.sheltered, false);
  const beforeRain = g.getWeapon().wetness;
  g.updateWeaponCondition(1); assert.ok(g.getWeapon().wetness > beforeRain);
  g.room.weatherAllowed = false; g.updateWeather(0.1);
  assert.equal(g.weather.intensity, 0); assert.equal(g.player.sheltered, true);
  const beforeDry = g.getWeapon().wetness;
  g.updateWeaponCondition(1); assert.ok(g.getWeapon().wetness < beforeDry);
});

test('outdoor weather alternates rain and clear intervals without advancing combat randomness', () => {
  const g = arena(73), control = arena(73); g.room.weatherAllowed = true;
  let sawRain = false, sawClearAfterRain = false;
  for (let i = 0; i < 600; i++) {
    g.updateWeather(0.25);
    if (g.weather.intensity > 0.5) sawRain = true;
    if (sawRain && g.weather.intensity === 0) sawClearAfterRain = true;
  }
  assert.ok(sawRain && sawClearAfterRain, 'a run includes both showers and clear stretches');
  assert.equal(g.rng(), control.rng(), 'weather must not perturb combat/drop RNG');
});

test('rain, wetness and repairs stop during pause and reward selection', () => {
  const g = arena(); g.player.x = 700; g.room.shelters = [];
  Object.assign(g.weather, { intensity: 1, target: 1, timer: 100 });
  g.getWeapon().durability = 50; advance(g, 0.3);
  for (const mode of ['paused', 'reward']) {
    g.mode = mode;
    const snapshot = JSON.stringify([g.weather, g.getWeapon()]);
    advance(g, 3);
    assert.equal(JSON.stringify([g.weather, g.getWeapon()]), snapshot);
  }
});

test('the boss arrives in a drifting car, remains protected through entry and pauses with the scene', () => {
  const g = arena(); g.loadRoom(8); g.player.invuln = 100;
  const boss = g.enemies.find(e => e.type === 'boss');
  assert.ok(boss && boss.spawnTime > 0);
  assert.equal(g.bossIntro.kind, 'bossCar');
  assert.equal(g.damageEnemy(boss, 100), false); assert.equal(boss.hp, boss.maxHp);
  advance(g, 1.2);
  assert.ok(g.bossIntro.drift > 0);
  assert.ok(g.bossIntro.x < g.bossIntro.fromX);
  g.pause();
  const snapshot = JSON.stringify([g.arrivals, boss.spawnTime, boss.entry]);
  advance(g, 3);
  assert.equal(JSON.stringify([g.arrivals, boss.spawnTime, boss.entry]), snapshot);
  g.resume(); advance(g, 1.2);
  assert.ok(g.bossIntro.doorOpen && boss.entry.visible);
  assert.ok(boss.spawnTime > 0, 'the door opens before the boss can attack');
  advance(g, 2.1);
  assert.equal(boss.spawnTime, 0);
  assert.equal(g.damageEnemy(boss, 1), true);
});

test('tracking telegraphs agree with the final shot and boss relocation direction', () => {
  const g = arena();
  const heavy = g.spawnEnemy({ type: 'heavy', x: 900, y: GROUND }, 0);
  heavy.state = 'windup'; heavy.timer = 0.9; heavy.lockedAim = Math.PI;
  g.player.x = 500; g.player.y = 400;
  g.updateEnemy(heavy, 0.1);
  assert.equal(heavy.lockedAim, heavy.aim, 'tracking marker follows the shown gun direction');
  const locked = heavy.aim; heavy.timer = 0.2; g.player.y = GROUND;
  g.updateEnemy(heavy, 0.1);
  assert.equal(heavy.aim, locked, 'final reaction window freezes aim');
  const boss = g.spawnEnemy({ type: 'boss', x: 900, y: GROUND }, 0);
  boss.patternIndex = 2; boss.timer = 0; boss.state = 'idle';
  g.updateEnemy(boss, 0.01);
  assert.equal(boss.pattern, 'rush'); assert.equal(boss.chargeDir, 1);
  boss.timer = 0; g.updateEnemy(boss, 0.01); g.updateEnemy(boss, 0.01);
  assert.ok(boss.vx > 0, 'boss moves in its announced direction, even when player stands left');
});
