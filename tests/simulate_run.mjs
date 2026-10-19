// A deterministic input-only controller: no damage/health buffs, teleporting,
// enemy removal, altered time scale or direct room progression.
// This tests that a whole run can finish under the real combat rules.
import assert from 'node:assert/strict';
import { Game, segmentRect } from '../src/game.js';

const game = new Game({ storage: { getItem() { return null; }, setItem() {} } });
game.startRun(123);
let lastJump = -5, stuck = 0, lastX = 0;
const priority = ['bloodHeal', 'heavyRounds', 'vitality', 'pierce', 'closeRange', 'quickReload', 'extendedMag'];
const rank = id => priority.includes(id) ? priority.indexOf(id) : 99;
for (let step = 0; step < 60 * 900 && !['dead', 'won'].includes(game.mode); step++) {
  if (game.mode === 'reward') {
    game.chooseUpgrade([...game.rewardChoices].sort((a, b) => rank(a.id) - rank(b.id))[0].id);
    continue;
  }
  const p = game.player;
  game.input.keys.clear();
  const drop = game.pickups.find(d => d.type === 'weapon' && Math.abs(d.x - p.x) < 95);
  if (drop?.weaponId === 'smg') game.interact();
  const smg = p.weapons.findIndex(w => w.id === 'smg');
  if (smg >= 0 && p.weaponIndex !== smg) game.switchWeapon();
  const target = game.enemies.filter(e => !e.dead).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
  const tx = target ? target.x : game.room.exit.x;
  const dx = tx - p.x, dy = target ? target.y - p.y : 0;
  game.input.mouse.x = tx - game.camera.x;
  game.input.mouse.y = target ? target.y - target.h * 0.55 : 602;
  game.input.mouse.left = Boolean(target);
  const obstructed = target && [...game.room.covers, ...game.room.platforms].some(c => segmentRect(p.x, p.y - 38, target.x, target.y - target.h * 0.55, c) !== null);
  if (game.room.cleared || Math.abs(dx) > 380 || obstructed || dy < -55) game.input.keys.add(dx > 0 ? 'KeyD' : 'KeyA');
  else if (Math.abs(dx) < 180) game.input.keys.add(dx > 0 ? 'KeyA' : 'KeyD');
  if ((obstructed || dy < -55 || stuck > 30) && p.grounded && game.time - lastJump > 0.65) {
    game.input.pressed.add('Space');
    lastJump = game.time;
  }
  const incoming = game.bullets.some(b => b.owner === 'enemy' && Math.hypot(b.x - p.x, b.y - (p.y - 30)) < 110);
  if (incoming && p.rollCooldown === 0) game.input.pressed.add('ShiftLeft');
  game.input.mouse.right = Boolean(target && target.state === 'attack' && p.slow > 20);
  if (game.room.cleared && Math.abs(dx) < 100) game.interact();
  stuck = Math.abs(p.x - lastX) < 0.1 ? stuck + 1 : 0;
  lastX = p.x;
  game.tick(1 / 60);
}
assert.equal(game.mode, 'won', `Run stalled or died in room ${game.roomIndex + 1}`);
assert.equal(game.stats.roomsCleared, 9);
assert.equal(game.best.wins, 1);
console.log(JSON.stringify({ result: game.mode, simulatedSeconds: Math.round(game.time), rooms: game.stats.roomsCleared, kills: game.kills, shots: game.stats.shots, hits: game.stats.hits, hp: game.player.hp, seed: game.seed }, null, 2));
