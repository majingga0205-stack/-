// A deterministic input-only controller: no damage/health buffs, teleporting,
// enemy removal, altered time scale or direct room progression.
// This tests that a whole run can finish under the real combat rules.
import assert from 'node:assert/strict';
import { Game, segmentRect } from '../src/game.js';

const game = new Game({ storage: { getItem() { return null; }, setItem() {} } });
// Keep seed 7 as a reproducible diagnostic baseline. The harder balance can
// defeat this controller; failure remains a nonzero result (see README).
// Pass another seed on the command line without changing the combat rules.
game.startRun(Number(process.argv[2] ?? 7));
const originalDamage = game.damagePlayer.bind(game);
game.damagePlayer = (amount, options) => {
  const hit = originalDamage(amount, options);
  if (hit && process.env.BOT_TRACE) console.log('damage', {
    time: game.time.toFixed(2), room: game.roomIndex + 1, amount, options,
    position: [game.player.x, game.player.y], rollCooldown: game.player.rollCooldown,
    cars: game.arrivals.filter(e => e.speed > 70).map(e => [e.phase, Math.round(e.x), Math.round(e.speed)]),
  });
  return hit;
};
let lastJump = -5, stuck = 0, lastX = 0, servicing = false, reloadHeld = false;
let jamTaps = 0, maintenanceJobs = 0;
const priority = ['bloodHeal', 'heavyRounds', 'vitality', 'pierce', 'closeRange', 'quickReload', 'extendedMag'];
const rank = id => priority.includes(id) ? priority.indexOf(id) : 99;
const weaponRank = id => ['revolver', 'pistol', 'smg', 'shotgun'].indexOf(id);
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
  const headAim = ['pistol', 'revolver'].includes(game.getWeapon().id);
  const aimY = target ? target.y - (headAim ? target.h - 5 : target.h * .55) : 602;
  const flight = target ? Math.hypot(dx, aimY - (p.y-38)) / game.getWeaponDef().speed : 0;
  game.input.mouse.x = tx + (target?.vx || 0) * flight * .8 - game.camera.x;
  game.input.mouse.y = aimY;
  game.input.mouse.left = Boolean(target && target.spawnTime <= 0);
  // A bullet cannot pass through the platform beneath us. Walk off its edge
  // before chasing a lower target instead of oscillating directly above it.
  const underfoot = target && target.y > p.y + 60 && game.room.platforms.find(c => p.x > c.x - p.w / 2 && p.x < c.x + c.w + p.w / 2 && c.y >= p.y - 1 && c.y < target.y);
  const escapeX = underfoot ? (target.x < underfoot.x + underfoot.w / 2 ? underfoot.x - 60 : underfoot.x + underfoot.w + 60) : null;
  const obstructed = target && [...game.room.covers, ...game.room.platforms].some(c => segmentRect(p.x, p.y - 38, target.x, aimY, c) !== null);
  if (game.room.cleared || Math.abs(dx) > 380 || obstructed || dy < -55) game.input.keys.add(dx > 0 ? 'KeyD' : 'KeyA');
  else if (Math.abs(dx) < 180) game.input.keys.add(dx > 0 ? 'KeyA' : 'KeyD');
  if (underfoot) { game.input.keys.clear(); game.input.keys.add(escapeX > p.x ? 'KeyD' : 'KeyA'); }
  if (!underfoot && (obstructed || dy < -55 || stuck > 30 || (target && target.spawnTime <= 0)) && p.grounded && game.time - lastJump > 0.65) {
    game.input.pressed.add('Space');
    lastJump = game.time;
  }
  const incoming = game.bullets.some(b => b.owner === 'enemy' && segmentRect(b.x,b.y,b.x+b.vx*.22,b.y+b.vy*.22,{x:p.x-22,y:p.y-p.h-3,w:44,h:p.h+6}) !== null);
  const ease = t => { t=Math.max(0,Math.min(1,t)); return t*t*t*(t*(t*6-15)+10); };
  const carX = (e, when) => { const start=e.warning+e.approach+e.unload+e.departureWarning; if(when<e.warning) return e.fromX; if(when<e.warning+e.approach) return e.fromX+(e.toX-e.fromX)*ease((when-e.warning)/e.approach); if(when<start) return e.toX; return e.toX+((e.facing<0?-300:game.room.width+300)-e.toX)*ease((when-start)/e.depart); };
  let carSoon = false, carImmediate = false;
  for(const e of game.arrivals.filter(a=>['car','bossCar'].includes(a.kind))) {
    const future = carX(e,e.elapsed+.38), next=carX(e,e.elapsed+.08), half=e.kind==='bossCar'?139:122;
    if(Math.abs(future-e.x)>8 && p.x+15>Math.min(e.x,future)-half && p.x-15<Math.max(e.x,future)+half) carSoon=true;
    if(Math.abs(next-e.x)>3 && p.x+15>Math.min(e.x,next)-half && p.x-15<Math.max(e.x,next)+half && Math.max(p.y,p.y+p.vy*.08+6.1)>e.y-91) carImmediate=true;
  }
  const moveDir=game.input.keys.has('KeyD')?1:game.input.keys.has('KeyA')?-1:0;
  const wireSoon=game.room.hazards.some(h=>p.y>=h.y-10 && p.x+moveDir*65+15>h.x && p.x+moveDir*65-15<h.x+h.w);
  if((carSoon||wireSoon) && p.grounded) { game.input.pressed.add('Space'); lastJump=game.time; }
  if ((incoming || carImmediate) && p.rollCooldown === 0) game.input.pressed.add('ShiftLeft');
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
console.log(JSON.stringify({ result: game.mode, seconds: Math.round(game.time), room: game.roomIndex + 1,
  kills: game.kills, shots: game.stats.shots, headshots: game.stats.headshots, hp: game.player.hp,
  seed: game.seed, jamTaps, maintenanceJobs }));
assert.equal(game.mode, 'won', `Run stalled or died in room ${game.roomIndex + 1}`);
assert.equal(game.stats.roomsCleared, 9);
assert.equal(game.best.wins, 1);
console.log(JSON.stringify({ result: game.mode, simulatedSeconds: Math.round(game.time), rooms: game.stats.roomsCleared, kills: game.kills, shots: game.stats.shots, hits: game.stats.hits, hp: game.player.hp, seed: game.seed, jamTaps, maintenanceJobs }, null, 2));
