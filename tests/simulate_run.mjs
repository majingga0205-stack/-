// A deterministic input-only controller: no damage/health buffs, teleporting,
// enemy removal, altered time scale or direct room progression.
// This tests that a whole run can finish under the real combat rules.
import assert from 'node:assert/strict';
import { Game, segmentRect } from '../src/game.js';

const game = new Game({ storage: { getItem() { return null; }, setItem() {} } });
// Seed 7 is the documented expanded-game smoke route; pass another seed on
// the command line to explore a different layout without changing the rules.
game.startRun(Number(process.argv[2] ?? 7));
let lastJump = -5, stuck = 0, lastX = 0, servicing = false, reloadHeld = false;
let jamTaps = 0, maintenanceJobs = 0;
const priority = ['bloodHeal', 'heavyRounds', 'vitality', 'pierce', 'closeRange', 'quickReload', 'extendedMag'];
const rank = id => priority.includes(id) ? priority.indexOf(id) : 99;
const weaponRank = id => ['smg', 'revolver', 'shotgun', 'pistol'].indexOf(id);
for (let step = 0; step < 60 * 900 && !['dead', 'won'].includes(game.mode); step++) {
  if (game.mode === 'reward') {
    game.chooseUpgrade([...game.rewardChoices].sort((a, b) => rank(a.id) - rank(b.id))[0].id);
    continue;
  }
  const p = game.player;
  game.input.keys.clear();
  const drop = game.pickups.find(d => d.type === 'weapon' && Math.abs(d.x - p.x) < 95);
  if (drop && (p.weapons.length < 2 || weaponRank(drop.weaponId) <= weaponRank(game.getWeapon().id))) game.interact();
  const preferred = p.weapons.reduce((best, w, i) => weaponRank(w.id) < weaponRank(p.weapons[best].id) ? i : best, 0);
  if (p.weaponIndex !== preferred) game.switchWeapon();
  const target = game.enemies.filter(e => !e.dead).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
  const tx = target ? target.x : game.room.exit.x;
  const dx = tx - p.x, dy = target ? target.y - p.y : 0;
  game.input.mouse.x = tx - game.camera.x;
  game.input.mouse.y = target ? target.y - target.h * 0.55 : 602;
  game.input.mouse.left = Boolean(target && target.spawnTime <= 0);
  // A bullet cannot pass through the platform beneath us. Walk off its edge
  // before chasing a lower target instead of oscillating directly above it.
  const underfoot = target && target.y > p.y + 60 && game.room.platforms.find(c => p.x > c.x - p.w / 2 && p.x < c.x + c.w + p.w / 2 && c.y >= p.y - 1 && c.y < target.y);
  const escapeX = underfoot ? (Math.abs(p.x - underfoot.x) < Math.abs(p.x - underfoot.x - underfoot.w) ? underfoot.x - 60 : underfoot.x + underfoot.w + 60) : null;
  const obstructed = target && [...game.room.covers, ...game.room.platforms].some(c => segmentRect(p.x, p.y - 38, target.x, target.y - target.h * 0.55, c) !== null);
  if (game.room.cleared || Math.abs(dx) > 380 || obstructed || dy < -55) game.input.keys.add(dx > 0 ? 'KeyD' : 'KeyA');
  else if (Math.abs(dx) < 180) game.input.keys.add(dx > 0 ? 'KeyA' : 'KeyD');
  if (underfoot) { game.input.keys.clear(); game.input.keys.add(escapeX > p.x ? 'KeyD' : 'KeyA'); }
  if (!underfoot && (obstructed || dy < -55 || stuck > 30 || (target && target.spawnTime <= 0)) && p.grounded && game.time - lastJump > 0.65) {
    game.input.pressed.add('Space');
    lastJump = game.time;
  }
  const incoming = game.bullets.some(b => b.owner === 'enemy' && Math.hypot(b.x - p.x, b.y - (p.y - 30)) < 110);
  if (incoming && p.rollCooldown === 0) game.input.pressed.add('ShiftLeft');
  game.input.mouse.right = Boolean(target && target.state === 'attack' && p.slow > 20);
  // Use the same distinct R presses and held-R maintenance available to a
  // player. No condition is overwritten: rainfall and wear remain simulated.
  const weapon = game.getWeapon();
  if (servicing && p.maintenanceBlocked && weapon.maintenance === 0) {
    servicing = false;
    if (weapon.durability === 100) maintenanceJobs++;
  }
  if (!servicing && !weapon.jammed && !p.maintenanceBlocked &&
      (weapon.durability < 25 || weapon.wetness > 67 || (!target && weapon.durability < 85))) servicing = true;
  const holdReload = weapon.jammed ? step % 12 < 3 : servicing && !p.maintenanceBlocked;
  if (holdReload) {
    game.input.keys.add('KeyR');
    if (!reloadHeld) { game.input.pressed.add('KeyR'); if (weapon.jammed) jamTaps++; }
  }
  reloadHeld = holdReload;
  if (servicing || weapon.jammed) game.input.mouse.left = false;
  if (game.room.cleared && Math.abs(dx) < 100) game.interact();
  stuck = Math.abs(p.x - lastX) < 0.1 ? stuck + 1 : 0;
  lastX = p.x;
  game.tick(1 / 60);
}
assert.equal(game.mode, 'won', `Run stalled or died in room ${game.roomIndex + 1}`);
assert.equal(game.stats.roomsCleared, 9);
assert.equal(game.best.wins, 1);
console.log(JSON.stringify({ result: game.mode, simulatedSeconds: Math.round(game.time), rooms: game.stats.roomsCleared, kills: game.kills, shots: game.stats.shots, hits: game.stats.hits, hp: game.player.hp, seed: game.seed, jamTaps, maintenanceJobs }, null, 2));
