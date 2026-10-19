import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, segmentRect } from '../src/game.js';
import { WEAPONS, UPGRADES, generateRoom } from '../src/data.js';

const memory = () => { const map = new Map(); return { getItem: key => map.get(key), setItem: (key, value) => map.set(key, value), map }; };
test('game still starts when browser policy denies localStorage access', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Storage denied'); } });
  try {
    const g = new Game(); g.startRun(123); g.setSettings({ sfx: 0 });
    assert.equal(g.mode, 'playing'); assert.equal(g.storage, null); assert.equal(g.player.hp, 100);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
});
function fresh(seed = 123) { const g = new Game({ storage: memory() }); g.startRun(seed); g.room.covers = []; g.room.platforms = []; g.updateRoomProgress = () => {}; g.enemies = []; return g; }
function advance(g, seconds, fps = 60) { for (let i = 0; i < seconds * fps; i++) g.tick(1 / fps); }

test('movement and fire are independent of rendering at 30/60/144 FPS', () => {
  const values = [30, 60, 144].map(fps => { const g = fresh(); g.input.keys.add('KeyD'); g.input.mouse.left = true; advance(g, 1, fps); return { x: g.player.x, ammo: g.getWeapon().ammo }; });
  for (const v of values) { assert.ok(Math.abs(v.x - values[0].x) < 3); assert.equal(v.ammo, values[0].ammo); }
});
test('aim stays to the right while walking left; jump can aim down', () => {
  const g = fresh(); g.player.x = 500; g.input.keys.add('KeyA'); g.input.mouse.x = 900; advance(g, 0.2);
  assert.ok(g.player.x < 500); assert.ok(Math.cos(g.player.aim) > 0);
  g.input.pressed.add('Space'); g.input.mouse.x = g.player.x; g.input.mouse.y = 700; advance(g, 0.2);
  assert.ok(g.player.y < 640); assert.ok(Math.sin(g.player.aim) > 0.5);
});
test('jump buffer and coyote allow forgiving grounded transitions', () => {
  const g = fresh(); g.player.y = 620; g.player.vy = 220; g.player.grounded = false; g.player.coyote = 0; g.input.pressed.add('Space'); advance(g, 0.12); assert.ok(g.player.vy < 0, 'buffer jumps after landing');
  const c = fresh(); c.player.y = 635; c.player.grounded = false; c.player.coyote = 0.08; c.input.pressed.add('Space'); c.tick(1 / 60); assert.ok(c.player.vy < 0, 'coyote jump');
});
test('roll has short invulnerability and enforced cooldown', () => {
  const g = fresh(); g.player.invuln = 0; assert.equal(g.roll(), true); assert.equal(g.damagePlayer(20), false); assert.equal(g.roll(), false); advance(g, 0.4); assert.equal(g.damagePlayer(20), true); assert.equal(g.player.hp, 80); advance(g, 1); assert.equal(g.roll(), true);
});
test('magazine, reload, swap and pause timers behave coherently', () => {
  const g = fresh(); g.fire(); assert.equal(g.getWeapon().ammo, 11); assert.equal(g.reload(), true); const time = g.getWeapon().reload;
  g.pause(); advance(g, 4); assert.equal(g.getWeapon().reload, time); g.resume(); advance(g, 1.2); assert.equal(g.getWeapon().ammo, 12);
  g.player.weapons.push(g.createWeapon('shotgun')); g.switchWeapon(); assert.equal(g.getWeapon().id, 'shotgun'); assert.equal(g.player.weapons.length, 2);
});
test('slow motion is finite and stops completely during pause', () => {
  const g = fresh(); g.input.mouse.right = true; advance(g, 2); assert.ok(g.player.slow < 55 && g.player.slow > 50); g.pause(); const v = g.player.slow; advance(g, 10); assert.equal(g.player.slow, v); g.resume(); g.input.mouse.right = true; advance(g, 4); assert.equal(g.player.slow, 0);
});
test('swept collision prevents fast bullets tunneling through thin cover', () => {
  assert.equal(segmentRect(0, 20, 100, 20, { x: 50, y: 0, w: 2, h: 50 }), 0.5);
  const g = fresh(); g.room.covers = [{ x: 200, y: 550, w: 4, h: 90, hp: 100, maxHp: 100, destructible: true }]; g.player.aim = 0; g.fire(); g.updateBullets(0.1); assert.equal(g.bullets.length, 0); assert.equal(g.room.covers[0].hp, 78);
});
test('all four weapons have distinct magazine/rate/reload/spread and shotgun pellets', () => {
  assert.equal(Object.keys(WEAPONS).length, 4); assert.equal(new Set(Object.values(WEAPONS).map(w => w.interval)).size, 4); const g = fresh(); g.player.weapons = [g.createWeapon('shotgun')]; g.fire(); assert.equal(g.bullets.length, 7);
});
