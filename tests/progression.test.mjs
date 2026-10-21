import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, GROUND, STEP, seededRandom } from '../src/game.js';
import { WEAPONS, UPGRADES, ENEMY_TYPES, generateRoom } from '../src/data.js';

function memory() {
  const map = new Map();
  return { map, getItem: key => map.get(key), setItem: (key, value) => map.set(key, value) };
}
function game(seed = 314, storage = memory()) {
  const g = new Game({ storage });
  g.startRun(seed);
  return g;
}
function arena(seed = 314) {
  const g = game(seed);
  g.room.covers = []; g.room.platforms = []; g.room.hazards = []; g.arrivals = []; g.enemies = []; g.pickups = [];
  g.updateRoomProgress = () => {};
  return g;
}
function advance(g, seconds, fps = 120) {
  for (let frame = 0; frame < Math.round(seconds * fps); frame++) g.tick(1 / fps);
}
function until(g, condition, seconds = 4) {
  for (let frame = 0; frame < Math.round(seconds / STEP); frame++) {
    if (condition()) return;
    g.tick(STEP);
  }
  assert.ok(condition(), 'expected state reached within the simulation deadline');
}
function near(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} should equal ${expected}`);
}
function target(g, x = 300, hp = 1000) {
  const enemy = g.spawnEnemy({ type: 'pistol', x, y: GROUND }, 0);
  enemy.hp = enemy.maxHp = hp;
  return enemy;
}
function grant(g, upgrade) {
  g.mode = 'reward'; g.rewardChoices = [upgrade];
  return g.chooseUpgrade(upgrade.id);
}
function clearWave(g) {
  for (const e of g.enemies) { e.spawnTime = 0; g.damageEnemy(e, e.hp); }
  until(g, () => g.enemies.length === 0 || g.mode === 'won');
}
function bullet(x, owner, damage, vx = 1000) {
  return { id: 999, x, y: 602, px: x, py: 602, vx, vy: 0, owner, damage, radius: 2.5,
    life: 2, travel: 0, hitIds: new Set(), pierce: 0, weaponId: 'pistol', originX: 150, originY: GROUND };
}

test('complete seeded run connects all nine rooms, three waves, eight rewards, boss and victory', () => {
  const g = game(901);
  const visitedZones = new Set();
  for (let index = 0; index < 8; index++) {
    assert.equal(g.roomIndex, index); visitedZones.add(g.room.theme);
    assert.equal(g.room.totalWaves, 3);
    assert.equal(g.nextRoom(), false, 'an uncleared room cannot be skipped');
    for (let wave = 1; wave <= 3; wave++) {
      assert.equal(g.room.wave, wave); assert.ok(g.enemies.length >= 4);
      clearWave(g);
      if (wave < 3) until(g, () => g.room.wave === wave + 1);
    }
    until(g, () => g.mode === 'reward');
    assert.equal(g.stats.roomsCleared, index + 1);
    assert.equal(g.rewardChoices.length, 3);
    assert.equal(new Set(g.rewardChoices.map(u => u.id)).size, 3);
    assert.equal(g.chooseUpgrade('not-a-choice'), false);
    assert.equal(g.chooseUpgrade(g.rewardChoices[0].id), true);
    assert.equal(g.mode, 'playing'); assert.ok(g.room.rewardTaken);
    assert.equal(g.nextRoom(), false, 'an exit requires proximity');
    g.player.x = g.room.exit.x; g.player.y = GROUND;
    g.input.pressed.add('KeyE'); g.tick(STEP);
    assert.equal(g.roomIndex, index + 1, 'E opens the cleared exit');
    assert.equal(g.bullets.length, 0); assert.equal(g.rewardChoices.length, 0);
  }
  assert.deepEqual([...visitedZones], ['alley', 'subway', 'hq']);
  assert.ok(g.room.boss); assert.equal(g.room.totalWaves, 1);
  const boss = g.enemies.find(e => e.type === 'boss'); boss.spawnTime = 0;
  g.damageEnemy(boss, boss.maxHp / 2); g.updateEnemy(boss, STEP);
  assert.equal(boss.phase, 2);
  clearWave(g); until(g, () => g.mode === 'won');
  assert.equal(g.stats.roomsCleared, 9); assert.equal(g.best.rooms, 9); assert.equal(g.best.wins, 1);
  assert.equal(g.bullets.length, 0); assert.equal(g.input.pressed.size, 0);
  const bestScore = g.best.score; g.endRun(true);
  assert.equal(g.best.wins, 1, 'ending is saved once');
  g.startRun(902);
  assert.equal(g.mode, 'playing'); assert.equal(g.roomIndex, 0);
  assert.equal(g.best.score, bestScore); assert.equal(g.best.wins, 1);
  assert.deepEqual(g.player.upgrades, {}); assert.equal(g.player.weapons.length, 1);
});

test('reward selection freezes reload, projectile, enemy tell, slow gauge and run clock', () => {
  const g = arena(); const enemy = target(g, 800);
  enemy.state = 'windup'; enemy.timer = 0.7;
  g.getWeapon().ammo = 4; g.reload(); g.fire();
  g.bullets.push(bullet(400, 'enemy', 10));
  g.input.mouse.right = true; g.mode = 'reward'; g.rewardChoices = [UPGRADES[0]];
  const state = { reload: g.getWeapon().reload, x: g.bullets[0].x, timer: enemy.timer, slow: g.player.slow, time: g.time };
  advance(g, 5);
  assert.deepEqual({ reload: g.getWeapon().reload, x: g.bullets[0].x, timer: enemy.timer, slow: g.player.slow, time: g.time }, state);
  g.input.keys.add('KeyD'); g.input.mouse.left = true;
  assert.equal(g.chooseUpgrade(UPGRADES[0].id), true);
  assert.equal(g.input.keys.size, 0); assert.equal(g.input.mouse.left, false); assert.equal(g.input.mouse.right, false);
  g.tick(STEP); assert.ok(g.getWeapon().reload < state.reload); assert.ok(enemy.timer < state.timer);
});

test('death and retry discard run state while persisting only settings and records', () => {
  const storage = memory(), g = game(19, storage);
  g.setSettings({ music: 0, sfx: 0.25, shake: 0, flash: 0 });
  g.score = 999; g.stats.roomsCleared = 4; g.player.upgrades.heavyRounds = 3;
  g.player.weapons.push(g.createWeapon('shotgun')); g.player.weaponIndex = 1;
  g.getWeapon().ammo = 1; g.reload(); g.roll(); g.input.mouse.left = true;
  g.input.keys.add('KeyD'); g.input.pressed.add('Space'); g.bullets.push(bullet(10, 'enemy', 10));
  g.player.invuln = 0; assert.equal(g.damagePlayer(1000), true);
  assert.equal(g.mode, 'dead'); assert.equal(g.best.score, 999); assert.equal(g.best.rooms, 4);
  const saved = JSON.parse([...storage.map.values()][0]);
  assert.deepEqual(Object.keys(saved).sort(), ['best', 'settings']);
  const oldEnemyIds = new Set(g.enemies.map(e => e.id));
  g.startRun(20);
  assert.equal(g.mode, 'playing'); assert.equal(g.score, 0); assert.equal(g.kills, 0); assert.equal(g.time, 0);
  assert.deepEqual(g.player.upgrades, {}); assert.equal(g.player.hp, 50); assert.equal(g.player.maxHp, 50);
  assert.equal(g.player.weapons.length, 1); assert.equal(g.getWeapon().id, 'pistol'); assert.equal(g.getWeapon().reload, 0);
  assert.equal(g.player.rollTime, 0); assert.equal(g.player.rollCooldown, 0); assert.equal(g.hitStop, 0);
  assert.equal(g.bullets.length, 0); assert.equal(g.particles.length, 0); assert.equal(g.rewardChoices.length, 0);
  assert.ok(g.enemies.every(e => !oldEnemyIds.has(e.id)));
  assert.equal(g.input.keys.size, 0); assert.equal(g.input.pressed.size, 0); assert.equal(g.input.mouse.left, false);
  const restored = new Game({ storage });
  assert.equal(restored.best.score, 999); assert.equal(restored.best.rooms, 4); assert.equal(restored.settings.flash, 0);
  assert.equal(restored.player, null); assert.equal(restored.mode, 'title');
});

test('a lethal incoming bullet stops the step before later kills can heal or change saved score', () => {
  const g = arena(); g.player.hp = 5; g.player.invuln = 0; g.player.upgrades.bloodHeal = 3;
  const enemy = target(g, 230, 1);
  g.bullets = [bullet(130, 'enemy', 10, 300), bullet(200, 'player', 22, 600)];
  g.updateBullets(0.1);
  assert.equal(g.mode, 'dead'); assert.equal(g.player.hp, 0); assert.equal(g.kills, 0);
  assert.equal(g.score, g.best.score); assert.equal(enemy.dead, false); assert.equal(g.bullets.length, 0);
  assert.equal(g.damageEnemy(enemy, 100), false);
});

test('piercing hits each target only once and never passes intact cover', () => {
  const g = arena(); g.player.upgrades.pierce = 2; g.rng = () => 0.5;
  const first = target(g, 210), second = target(g, 270), behindWall = target(g, 420);
  g.room.covers = [{ x: 330, y: 550, w: 25, h: 90, hp: 100, maxHp: 100, destructible: false }];
  g.player.aim = 0; g.fire();
  for (let i = 0; i < 40; i++) g.updateBullets(STEP);
  assert.equal(first.hp, 1000 - WEAPONS.pistol.damage); assert.equal(second.hp, 1000 - WEAPONS.pistol.damage); assert.equal(behindWall.hp, 1000);
  assert.equal(g.stats.hits, 2); assert.equal(g.bullets.length, 0); assert.equal(g.room.covers[0].hp, 100);
});

test('firing from beneath a thin platform cannot skip it with the muzzle offset', () => {
  const g = arena(); g.room.platforms = [{ x: 100, y: 530, w: 300, h: 17 }];
  g.player.x = 180; g.player.y = 592; g.player.aim = -Math.PI / 2; g.rng = () => 0.5;
  const enemy = target(g, 180); enemy.y = 500;
  g.fire(); for (let i = 0; i < 15; i++) g.updateBullets(STEP);
  assert.equal(g.bullets.length, 0); assert.equal(enemy.hp, 1000);
});

test('expired projectiles, destroyed cover and expired effects are removed', () => {
  const g = arena(); g.room.covers = [{ x: 200, y: 550, w: 25, h: 90, hp: 1, maxHp: 1, destructible: true }];
  g.player.aim = 0; g.fire(); g.updateBullets(0.1); assert.equal(g.room.covers.length, 0);
  const outside = bullet(g.room.width + 100, 'player', 10); g.bullets.push(outside);
  g.bullets.push({ ...bullet(600, 'player', 10), life: 0.001 }); g.updateBullets(STEP);
  assert.equal(g.bullets.length, 0);
  g.updateParticles(3); assert.equal(g.particles.length, 0);
});

test('slow motion preserves movement, firing and reloading across 30/60/144 FPS', () => {
  const snapshots = [30, 60, 144].map(fps => {
    const g = arena(); g.input.keys.add('KeyD'); g.input.mouse.right = true; g.input.mouse.left = true;
    g.player.upgrades.secondWind = 2; g.getWeapon().ammo = 2; advance(g, 4, fps);
    assert.ok(g.stats.shots > 2, 'automatic reload completes and firing resumes');
    return { x: g.player.x, slow: g.player.slow, ammo: g.getWeapon().ammo, reload: g.getWeapon().reload, shots: g.stats.shots };
  });
  for (const snapshot of snapshots) {
    near(snapshot.x, snapshots[0].x, 3); near(snapshot.slow, snapshots[0].slow, 0.2);
    assert.equal(snapshot.ammo, snapshots[0].ammo); assert.equal(snapshot.shots, snapshots[0].shots);
    near(snapshot.reload, snapshots[0].reload, 0.01);
  }
});

test('weapon pickup fills second slot, replaces active slot and refills an existing weapon', () => {
  const g = arena(); const pickup = id => g.pickups.push({ type: 'weapon', weaponId: id, x: g.player.x, y: g.player.y });
  pickup('smg'); assert.equal(g.interact(), true); assert.equal(g.getWeapon().id, 'smg');
  pickup('shotgun'); assert.equal(g.interact(), true);
  assert.deepEqual(g.player.weapons.map(w => w.id), ['pistol', 'shotgun']);
  assert.ok(g.pickups.some(p => p.weaponId === 'smg'));
  g.pickups = []; g.getWeapon().ammo = 0; g.reload(); pickup('shotgun'); g.interact();
  assert.equal(g.getWeapon().ammo, 5); assert.equal(g.getWeapon().reload, 0); assert.equal(g.player.weapons.length, 2);
});

for (const upgrade of UPGRADES) {
  test(`upgrade ${upgrade.id}: advertised stack cap rejects excess awards`, () => {
    const g = arena();
    assert.ok(upgrade.description.match(/\d/), 'effect text states numeric values');
    for (let level = 1; level <= upgrade.maxStacks; level++) {
      assert.equal(grant(g, upgrade), true); assert.equal(g.stack(upgrade.id), level);
    }
    const hp = g.player.hp, maxHp = g.player.maxHp;
    assert.equal(grant(g, upgrade), false); assert.equal(g.stack(upgrade.id), upgrade.maxStacks);
    assert.equal(g.player.hp, hp); assert.equal(g.player.maxHp, maxHp);
  });
}

test('capped upgrades are excluded from three-choice room rewards', () => {
  const g = game(18); const remaining = UPGRADES.slice(-3).map(u => u.id);
  for (const u of UPGRADES.slice(0, -3)) g.player.upgrades[u.id] = u.maxStacks;
  g.enemies = []; g.room.wave = g.room.totalWaves; g.updateRoomProgress(STEP);
  assert.equal(g.mode, 'reward'); assert.deepEqual(g.rewardChoices.map(u => u.id).sort(), remaining.sort());
});

test('dodgeShot strengthens exactly the next shot and expires after its window', () => {
  const g = arena(); g.player.upgrades.dodgeShot = 2;
  g.roll(); advance(g, 0.3); g.fire(); near(g.bullets.at(-1).damage, WEAPONS.pistol.damage * 1.9);
  g.getWeapon().cooldown = 0; g.fire(); near(g.bullets.at(-1).damage, WEAPONS.pistol.damage);
  g.player.rollCooldown = 0; g.roll(); advance(g, 1.6); g.getWeapon().cooldown = 0;
  g.fire(); near(g.bullets.at(-1).damage, WEAPONS.pistol.damage);
});

test('lastRound and heavyRounds combine on the final cartridge', () => {
  const g = arena(); g.player.upgrades.lastRound = 2; g.player.upgrades.heavyRounds = 3;
  g.getWeapon().ammo = 2; g.fire(); near(g.bullets.at(-1).damage, WEAPONS.pistol.damage * 1.45);
  g.getWeapon().cooldown = 0; g.fire(); near(g.bullets.at(-1).damage, WEAPONS.pistol.damage * 2.35);
});

test('quickReload reduces reload duration during a kill window and returns to normal afterwards', () => {
  const g = arena(); g.player.upgrades.quickReload = 2;
  g.damageEnemy(target(g, 800, 1), 1); g.getWeapon().ammo = 1; g.reload(); near(g.getWeapon().reloadTotal, WEAPONS.pistol.reload * 0.6);
  advance(g, 4.5); g.getWeapon().ammo = 1; g.reload(); near(g.getWeapon().reloadTotal, WEAPONS.pistol.reload);
});

test('slowFocus reduces the same seeded angular spread only during slow motion', () => {
  const sample = (slow, stacks) => {
    const g = arena(); g.player.aim = 0; g.rng = () => 1;
    g.player.upgrades.slowFocus = stacks; g.slowActive = slow; g.fire();
    return Math.atan2(g.bullets[0].vy, g.bullets[0].vx);
  };
  near(sample(false, 2), sample(false, 0)); near(sample(true, 2), sample(false, 0) * 0.3);
});

test('swapFrenzy speeds firing for two seconds after a real weapon switch', () => {
  const g = arena(); g.player.upgrades.swapFrenzy = 1; g.player.weapons.push(g.createWeapon('revolver'));
  g.switchWeapon(); g.fire(); near(g.getWeapon().cooldown, WEAPONS.revolver.interval * 0.75);
  advance(g, 2.1); g.fire(); near(g.getWeapon().cooldown, WEAPONS.revolver.interval);
});

test('closeRange boosts nearby damage and leaves distant targets unchanged', () => {
  for (const [x, damage] of [[350, WEAPONS.pistol.damage * 1.5], [700, WEAPONS.pistol.damage]]) {
    const g = arena(); g.player.upgrades.closeRange = 2; g.rng = () => 0.5; const enemy = target(g, x);
    g.player.aim = 0; g.fire(); for (let i = 0; i < 80; i++) g.updateBullets(STEP);
    near(1000 - enemy.hp, damage);
  }
});

test('shotgun pellets lose damage over distance while the other guns retain it', () => {
  const damageAt = (weaponId, distance) => {
    const g = arena(); g.player.weapons = [g.createWeapon(weaponId)];
    g.rng = () => 0.5; g.player.aim = 0; const enemy = target(g, g.player.x + distance);
    g.fire(); for (let i = 0; i < 100; i++) g.updateBullets(STEP);
    return 1000 - enemy.hp;
  };
  near(damageAt('shotgun', 110), WEAPONS.shotgun.damage * WEAPONS.shotgun.pellets);
  assert.ok(damageAt('shotgun', 600) < damageAt('shotgun', 110) * 0.6);
  near(damageAt('pistol', 110), damageAt('pistol', 600));
});

test('vitality adds and heals 25 per award without duplicate application', () => {
  const g = arena(); g.player.hp = 20; const upgrade = UPGRADES.find(u => u.id === 'vitality');
  for (let level = 1; level <= 3; level++) { grant(g, upgrade); assert.equal(g.player.maxHp, 50 + level * 25); assert.equal(g.player.hp, 20 + level * 25); }
});

test('extendedMag rounds each base magazine upward and applies to subsequent reloads', () => {
  const g = arena(); g.player.upgrades.extendedMag = 1;
  for (const [id, capacity] of Object.entries({ pistol: 15, revolver: 8, smg: 38, shotgun: 7 })) assert.equal(g.createWeapon(id).ammo, capacity);
  g.player.upgrades.extendedMag = 2; g.getWeapon().ammo = 0; g.reload(); advance(g, 1.1);
  assert.equal(g.getWeapon().ammo, 18); assert.equal(g.magazine('shotgun'), 8);
});

test('slowHarvest and bloodHeal restore their per-kill values without exceeding capacity', () => {
  const g = arena(); g.player.upgrades.slowHarvest = 2; g.player.upgrades.bloodHeal = 3;
  g.player.slow = 20; g.player.hp = 20; g.damageEnemy(target(g, 800, 1), 1);
  assert.equal(g.player.slow, 48); assert.equal(g.player.hp, 26);
  g.player.slow = 98; g.player.hp = 49; g.damageEnemy(target(g, 900, 1), 1);
  assert.equal(g.player.slow, 100); assert.equal(g.player.hp, 50);
});

test('secondWind extends finite slow motion with the advertised drain reduction', () => {
  const g = arena(); g.player.upgrades.secondWind = 2; g.input.mouse.right = true;
  advance(g, 2); near(g.player.slow, 100 - 23 * 0.6 * 2, 0.01);
  advance(g, 6); assert.equal(g.player.slow, 0);
});

test('quickFeet changes movement speed and dodge cooldown at the stated cap', () => {
  const g = arena(); g.player.upgrades.quickFeet = 2; g.input.keys.add('KeyD'); advance(g, 0.5);
  near(g.player.vx, 310 * 1.2); g.roll(); near(g.player.rollCooldown, 1.25 * 0.7);
});

test('every normal enemy telegraphs before attacking and leaves a recovery interval', () => {
  for (const type of Object.keys(ENEMY_TYPES).filter(t => t !== 'boss')) {
    const g = arena(); g.player.x = 750;
    const e = g.spawnEnemy({ type, x: 900, y: GROUND }, 0); e.timer = 0;
    g.updateEnemy(e, STEP); assert.equal(e.state, 'windup', type); assert.equal(g.bullets.length, 0);
    for (let step = 0; step < 12; step++) g.updateEnemy(e, STEP);
    assert.equal(e.state, 'windup', type); assert.equal(g.bullets.length, 0);
    for (let step = 0; step < 300 && e.state !== 'recover'; step++) g.updateEnemy(e, STEP);
    assert.equal(e.state, 'recover', type); assert.ok(e.timer > 1, `${type} has a punishable recovery`);
    if (type !== 'rusher') assert.equal(g.bullets.length, { pistol: 1, smg: 5, shotgun: 5, heavy: 3 }[type]);
  }
});

test('rusher charge damages at most once even if invulnerability expires during contact', () => {
  const g = arena(); g.player.x = 900; g.player.invuln = 0;
  const e = g.spawnEnemy({ type: 'rusher', x: 900, y: GROUND }, 0);
  e.state = 'attack'; e.timer = 0.36; e.chargeDir = 1;
  for (let i = 0; i < 20; i++) { e.x = g.player.x; g.player.invuln = 0; g.updateEnemy(e, STEP); }
  assert.equal(g.player.hp, 50 - ENEMY_TYPES.rusher.damage);
});

for (const phase of [1, 2]) {
  test(`boss phase ${phase} cycles telegraphed fan, focus and relocation with recovery gaps`, () => {
    const g = arena(); g.player.x = 800;
    const e = g.spawnEnemy({ type: 'boss', x: 1600, y: GROUND }, 0);
    e.phase = phase; if (phase === 2) e.hp = e.maxHp * 0.4;
    const expected = phase === 1 ? { fan: 14, focus: 6 } : { fan: 27, focus: 9 };
    for (const pattern of ['fan', 'focus', 'rush']) {
      e.state = 'idle'; e.timer = 0; g.bullets = [];
      g.updateEnemy(e, STEP); assert.equal(e.pattern, pattern); assert.equal(e.state, 'windup');
      const initialX = e.x;
      for (let i = 0; i < 36; i++) g.updateEnemy(e, STEP);
      assert.equal(e.state, 'windup'); assert.equal(g.bullets.length, 0);
      for (let i = 0; i < 500 && e.state !== 'recover'; i++) g.updateEnemy(e, STEP);
      assert.equal(e.state, 'recover'); assert.ok(e.timer >= 1);
      if (pattern === 'rush') { assert.ok(Math.abs(e.x - initialX) > 200); assert.equal(g.bullets.length, 0); }
      else {
        assert.equal(g.bullets.length, expected[pattern]);
        const velocities = g.bullets.map(b => Math.hypot(b.vx, b.vy));
        assert.ok(velocities.every(v => v < 500), 'attacks remain visibly dodgeable');
        if (pattern === 'fan') {
          const angles = g.bullets.map(b => Math.atan2(b.vy, b.vx));
          assert.ok(Math.max(...angles) - Math.min(...angles) > 0.8, 'fan distributes rather than stacks bullets');
        }
      }
    }
  });
}

test('boss phase change occurs once at half health and grants a recovery window', () => {
  const g = arena(), e = g.spawnEnemy({ type: 'boss', x: 1000, y: GROUND }, 0);
  e.state = 'attack'; e.timer = 0.4; e.hp = e.maxHp / 2;
  g.updateEnemy(e, STEP); assert.equal(e.phase, 2); assert.equal(e.state, 'recover'); near(e.timer, 1.6);
  g.updateEnemy(e, STEP); assert.ok(e.timer < 1.6, 'phase transition does not continually reset');
});

test('seeded room templates vary yet preserve supported spawn points and an accessible exit', () => {
  const signatures = new Set();
  for (let seed = 1; seed <= 30; seed++) for (let index = 0; index < 9; index++) {
    const room = generateRoom(seededRandom(seed), index);
    assert.deepEqual(room, generateRoom(seededRandom(seed), index));
    signatures.add(`${index}:${room.name}:${room.weaponDrop}:${room.platforms[0].x}`);
    assert.ok(room.exit.x > 2500 && room.exit.x < room.width - 50); assert.equal(room.exit.y, GROUND);
    for (const c of room.covers) assert.ok(c.h < 100, 'all ground obstacles can be jumped');
    for (const p of room.platforms) assert.ok(p.y >= 420 && p.y < GROUND && p.w >= 260);
    for (const p of room.spawnPoints) {
      assert.ok(p.x >= 730 && p.x < room.exit.x - 100);
      assert.ok(p.y === GROUND || room.platforms.some(s => p.y === s.y && p.x >= s.x && p.x <= s.x + s.w));
      const def = ENEMY_TYPES[p.type];
      assert.ok(!room.covers.some(c => p.x + def.w / 2 > c.x && p.x - def.w / 2 < c.x + c.w && p.y > c.y && p.y - def.h < c.y + c.h));
    }
  }
  assert.ok(signatures.size > 100, 'runs vary templates, positions and weapon rewards');
});

test('reinforcements spawn at a safe distance without overlapping each other', () => {
  for (let seed = 1; seed <= 40; seed++) for (const playerX of [300, 900, 1500, 2100, 2500]) {
    const g = game(seed); g.player.x = playerX; g.enemies = []; g.room.wave = 2; g.spawnWave();
    assert.ok(g.enemies.length > 0);
    for (let i = 0; i < g.enemies.length; i++) {
      const a = g.enemies[i];
      assert.ok(Math.abs(a.x - playerX) >= 480, `seed ${seed}: spawn clear of player`);
      assert.ok(a.spawnTime >= 1, 'reinforcements have a visible arrival warning');
      for (const b of g.enemies.slice(i + 1)) {
        const overlap = Math.abs(a.x - b.x) < (a.w + b.w) / 2 && a.y > b.y - b.h && b.y > a.y - a.h;
        assert.equal(overlap, false, `seed ${seed}, player ${playerX}: actors at ${a.x}/${b.x} overlap`);
      }
    }
  }
});
