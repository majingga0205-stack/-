import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, GROUND, STEP } from '../src/game.js';
import { WEAPONS } from '../src/data.js';
import { updateEncounters } from '../src/encounters.js';

function arena() {
  const g = new Game({ storage: null });
  g.startRun(24);
  Object.assign(g.room, { covers: [], platforms: [], hazards: [], weatherAllowed: false });
  g.arrivals = []; g.enemies = []; g.pickups = [];
  g.updateRoomProgress = () => {};
  g.player.invuln = 0;
  return g;
}
function advance(g, seconds) {
  for (let i = 0; i < Math.round(seconds / STEP); i++) g.tick(STEP);
}
function bullet(g, { owner = 'player', weaponId = 'pistol', x = 200, y = 600, vx = 1000, vy = 0, damage = 10, pierce = 0 } = {}) {
  const b = { id: g.nextBulletId++, owner, weaponId, x, y, px: x, py: y, vx, vy, damage,
    radius: 1, life: 2, travel: 0, originX: x, originY: y, hitIds: new Set(), pierce };
  g.bullets.push(b); return b;
}
function target(g, x = 300) {
  const enemy = g.spawnEnemy({ type: 'heavy', x, y: GROUND }, 0);
  enemy.hp = enemy.maxHp = 1000;
  return enemy;
}
function car(g, kind = 'car') {
  const event = { id: 'test-car', kind, x: 100, y: GROUND, fromX: 100, toX: 900,
    elapsed: 0, warning: .9, approach: 2, unload: 1, departureWarning: .75, depart: 2,
    duration: 6.65, enemyIds: [], facing: 1, hitPlayerByLeg: {}, phase: 'warning' };
  g.arrivals = [event]; return event;
}

test('only pistols and revolvers multiply head hits, from either side', () => {
  for (const id of Object.keys(WEAPONS)) for (const direction of [1, -1]) {
    const g = arena(), e = target(g);
    bullet(g, { weaponId: id, x: e.x - direction * 80, y: e.y - e.h + 5, vx: direction * 1000 });
    g.updateBullets(.12);
    const expected = ['pistol', 'revolver'].includes(id) ? 20 : 10;
    assert.equal(1000 - e.hp, expected, `${id} head hit from ${direction}`);
    assert.equal(g.stats.headshots, expected === 20 ? 1 : 0);
    assert.equal(g.bullets.length, 0, 'a head hit consumes its bullet');
  }
});

test('a swept chest-first diagonal hit is not upgraded to a later head intersection', () => {
  const g = arena(), e = target(g);
  // Enters the torso from below before reaching the head at the end of the step.
  bullet(g, { x: e.x, y: e.y - 15, vx: 0, vy: -1000 });
  g.updateBullets(.1);
  assert.equal(e.hp, 990);
  assert.equal(g.stats.headshots, 0);
});

test('headshot collision respects a thin wall and piercing hits each enemy only once', () => {
  const g = arena(), a = target(g, 300), b = target(g, 370);
  const y = a.y - a.h + 5;
  g.room.covers = [{ x: 270, y: y - 10, w: 2, h: 20, hp: 100, destructible: false }];
  bullet(g, { y, pierce: 2 }); g.updateBullets(.25);
  assert.equal(a.hp, 1000); assert.equal(b.hp, 1000);
  g.room.covers = [];
  bullet(g, { y, pierce: 2 }); g.updateBullets(.11); g.updateBullets(.11);
  assert.equal(a.hp, 980); assert.equal(b.hp, 980);
  assert.equal(g.stats.headshots, 2);
});

test('enemy bullets cause 1.5× head damage and crouching moves the head hit region', () => {
  for (const crouching of [false, true]) {
    const g = arena();
    if (crouching) { g.input.keys.add('KeyC'); advance(g, .03); }
    bullet(g, { owner: 'enemy', x: 70, y: g.player.y - g.player.h + 5 });
    g.updateBullets(.15);
    assert.equal(g.player.hp, 35);
    g.player.invuln = 0;
    bullet(g, { owner: 'enemy', x: 70, y: g.player.y - 15 });
    g.updateBullets(.15);
    assert.equal(g.player.hp, 25, 'a torso hit stays at base damage');
  }
});

test('five jam taps preserve wetness, permit a repair window, then wetness can jam again', () => {
  const g = arena(), w = g.getWeapon();
  Object.assign(w, { wetness: 100, durability: 10, jammed: true });
  for (let i = 0; i < 5; i++) g.clearJam();
  assert.equal(w.wetness, 100); assert.equal(w.jammed, false);
  advance(g, 4.8);
  assert.equal(w.jammed, false, 'the five-second window must be usable');
  advance(g, .3);
  assert.equal(w.jammed, true, 'uninspected wet guns can jam again after the window');
  for (let i = 0; i < 5; i++) g.clearJam();
  advance(g, .03); g.input.keys.add('KeyR'); advance(g, 1.5);
  assert.equal(w.wetness, 0); assert.equal(w.durability, 100); assert.equal(w.jammed, false);
});

test('vault and landing head hits follow the visible lowered face, not the old standing head', () => {
  for (const dir of [1, -1]) for (const landing of [false, true]) {
    const g = arena(), p = g.player;
    Object.assign(p, { x: 300, y: landing ? 640 : 550, aim: dir > 0 ? 0 : Math.PI,
      grounded: landing, landingTime: landing ? .18 : 0 });
    if (!landing) { p.vault = { dir, kind: 'barricade', elapsed: .24, duration: .48 }; p.vaultTime = .24; }
    // These are visual world coordinates, independently measured from the pose.
    bullet(g, { owner: 'enemy', x: 200, y: landing ? 585 : 498 });
    g.updateBullets(.2);
    assert.equal(p.hp, 50, 'empty air above the bent head must not count as a hit');
    g.bullets = [];
    bullet(g, { owner: 'enemy', x: 200, y: landing ? 596 : 512 });
    g.updateBullets(.2);
    assert.equal(p.hp, 35, 'the actual lowered face still receives head damage');
  }
});

test('collecting spare parts from the same weapon does not dry the owned gun', () => {
  const g = arena(); g.getWeapon().wetness = 72;
  g.pickups.push({ type: 'weapon', weaponId: 'pistol', x: g.player.x, y: g.player.y });
  assert.equal(g.interact(), true);
  assert.equal(g.getWeapon().wetness, 72);
});

test('cars warn before moving and accelerate from rest instead of teleporting at constant speed', () => {
  const g = arena(), event = car(g); g.player.y = 400;
  updateEncounters(g, .5); assert.equal(event.x, 100); assert.equal(event.phase, 'warning');
  updateEncounters(g, .4);
  updateEncounters(g, .1); const initialSpeed = event.speed;
  updateEncounters(g, .3); const laterSpeed = event.speed;
  assert.ok(initialSpeed > 0 && laterSpeed > initialSpeed * 2);
  assert.ok(event.x > 100 && event.x < 900);
});

test('vehicle impacts scale damage and knockback with speed and push through actor collision', () => {
  const values = [240, 1000].map(speed => {
    const g = arena(); g.player.x = 500;
    const event = { kind: 'car', x: 400, y: GROUND };
    const hit = g.applyVehicleImpact(event, { speed, direction: 1, x: 490, y: 600 });
    assert.notEqual(hit, false);
    const damage = 50 - g.player.hp, impulse = g.player.knockbackX;
    const before = g.player.x;
    advance(g, .08);
    assert.ok(g.player.x > before, 'knockback must affect subsequent physics');
    assert.ok(g.player.y < GROUND, 'impact throws the player upward');
    return { damage, impulse };
  });
  assert.ok(values[1].damage > values[0].damage);
  assert.ok(values[1].impulse > values[0].impulse);
});

test('a moving car hits at most once per pass; jumping above it and trains cause no impact', () => {
  const g = arena(), event = car(g); g.player.x = 500;
  for (let i = 0; i < 210; i++) {
    g.player.invuln = 0; updateEncounters(g, .01);
  }
  assert.ok(g.player.hp < 50 && g.player.hp > 0);
  const hp = g.player.hp;
  for (let i = 0; i < 70; i++) { g.player.invuln = 0; updateEncounters(g, .01); }
  assert.equal(g.player.hp, hp);
  assert.equal(event.hitPlayerByLeg.approach, true);
  for (const kind of ['car', 'train']) {
    const safe = arena(); car(safe, kind); safe.player.x = 500;
    if (kind === 'car') safe.player.y = 500;
    for (let i = 0; i < 300; i++) updateEncounters(safe, .01);
    assert.equal(safe.player.hp, 50, kind);
  }
});

test('thin barricades use a distinct vault and barbed wire cannot be interacted across', () => {
  const g = arena();
  const obstacle = { x: 185, y: 572, w: 22, h: 68, hp: 99999, destructible: false, kind: 'barricade', vaultable: true };
  g.room.covers = [obstacle];
  assert.equal(g.vault(), true); assert.equal(g.player.vault.kind, 'barricade');
  advance(g, .65); assert.ok(g.player.x > obstacle.x + obstacle.w + g.player.w / 2);
  Object.assign(g.player, { x: 150, y: GROUND, grounded: true, vaultCooldown: 0 });
  Object.assign(obstacle, { kind: 'wire', vaultable: false });
  assert.equal(g.vault(), false);
  advance(g, .65); assert.equal(g.player.x, 150);
});

test('wire inflicts periodic contact damage through roll immunity without shielding against bullets', () => {
  const g = arena();
  g.room.hazards = [{ kind: 'wire', x: 120, y: 630, w: 90, h: 10, damage: 3, interval: .5 }];
  g.player.invuln = .24;
  advance(g, .1); assert.equal(g.player.hp, 47);
  advance(g, .3); assert.equal(g.player.hp, 47, 'wire must not hurt once per frame');
  assert.equal(g.player.invuln, 0, 'wire grants no bullet immunity');
  advance(g, .2); assert.equal(g.player.hp, 44);
  const hp = g.player.hp;
  g.pause(); advance(g, 2); assert.equal(g.player.hp, hp);
  g.resume(); g.player.x = 250; advance(g, 1); assert.equal(g.player.hp, hp);
});

test('melee enemies telegraph a leap and cross cover blocking their pursuit', () => {
  const g = arena(); g.player.x = 650; g.player.invuln = 100;
  g.room.covers = [{ x: 350, y: 564, w: 45, h: 76, hp: 99999, destructible: false }];
  const e = g.spawnEnemy({ type: 'rusher', x: 295, y: GROUND }, 0);
  let warned = false, airborne = false, dash = false;
  for (let i = 0; i < 360; i++) {
    g.updateEnemy(e, STEP);
    warned ||= e.state === 'windup' && e.pattern === 'leap';
    airborne ||= e.y < 540;
    dash ||= !e.grounded && Math.abs(e.vx) > 500;
  }
  assert.ok(warned, 'the obstacle leap needs a visible preparation window');
  assert.ok(airborne && dash, 'rusher must actually jump-dash');
  assert.ok(e.x > 395 + e.w / 2, `rusher remained behind cover at ${e.x}`);
});

test('pause freezes impact and repair grace; retry clears all new transient states', () => {
  const g = arena();
  g.applyVehicleImpact({ kind: 'car' }, { speed: 400, direction: 1 });
  Object.assign(g.getWeapon(), { wetness: 90, jamGrace: 4 });
  g.player.wireCooldown = .4;
  g.pause();
  const frozen = JSON.stringify([g.player, g.weather, g.arrivals]);
  advance(g, 3);
  assert.equal(JSON.stringify([g.player, g.weather, g.arrivals]), frozen);
  g.startRun(25);
  assert.equal(g.player.hp, 50);
  assert.equal(g.player.knockbackTime, 0);
  assert.equal(g.player.wireCooldown, 0);
  assert.equal(g.getWeapon().jamGrace, 0);
  assert.equal(g.getWeapon().wetness, 0);
  assert.equal(g.stats.headshots, 0);
});
