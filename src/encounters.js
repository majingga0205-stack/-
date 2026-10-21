import { ENEMY_TYPES } from './data.js';

const GROUND = 640;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const mix = (a, b, t) => a + (b - a) * t;
const easeOut = t => 1 - (1 - clamp(t, 0, 1)) ** 3;
// Quintic motion begins and ends at rest, with continuous acceleration. It is
// evaluated from elapsed simulation time, not integrated once per frame.
const driveEase = value => { const t = clamp(value, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };

function vehicleSweep(game, event, previousX, dt) {
  if (!['car', 'bossCar'].includes(event.kind) || dt <= 0 || !game.player) return;
  event.velocity = (event.x - previousX) / dt;
  event.speed = Math.abs(event.velocity);
  if (event.speed < 70) return;
  const leg = event.phase === 'approach' ? 'approach' : event.phase === 'depart' ? 'depart' : null;
  if (!leg || event.hitPlayerByLeg?.[leg]) return;
  const player = game.player, halfWidth = event.kind === 'bossCar' ? 139 : 122;
  const bodyHeight = event.kind === 'bossCar' ? 91 : 85;
  // Sweeping the car's horizontal extent prevents a fast car tunnelling over
  // the player. A jump above the roof or a player behind the roadway is clear.
  const left = Math.min(previousX, event.x) - halfWidth;
  const right = Math.max(previousX, event.x) + halfWidth;
  if (player.x + player.w / 2 < left || player.x - player.w / 2 > right || player.y <= event.y - bodyHeight || player.y - player.h >= event.y) return;
  event.hitPlayerByLeg ||= {};
  // Each moving leg can hit at most once, even when an invulnerability window
  // expires while the large vehicle still overlaps the player.
  event.hitPlayerByLeg[leg] = true;
  game.applyVehicleImpact?.(event, { speed: event.speed, direction: Math.sign(event.velocity), x: clamp(player.x, left, right), y: Math.min(player.y, event.y - 35) });
}

function safePoint(game, point) {
  const def = ENEMY_TYPES[point.type];
  if (!def || Math.abs(point.x - game.player.x) < 480) return false;
  if (point.x < 50 || point.x > game.room.width - 100) return false;
  if (point.y !== GROUND && !game.room.platforms.some(p => point.y === p.y && point.x - def.w / 2 >= p.x && point.x + def.w / 2 <= p.x + p.w)) return false;
  if (game.room.covers.some(c => c.hp > 0 && point.x + def.w / 2 + 10 > c.x && point.x - def.w / 2 - 10 < c.x + c.w && point.y > c.y && point.y - def.h < c.y + c.h)) return false;
  if ((game.room.hazards || []).some(h => point.x + def.w / 2 + 12 > h.x && point.x - def.w / 2 - 12 < h.x + h.w && point.y > h.y && point.y - def.h < h.y + h.h)) return false;
  return !game.enemies.some(e => !e.dead && Math.abs(e.x - point.x) < (e.w + def.w) / 2 + 42 && Math.abs(e.y - point.y) < Math.max(e.h, def.h) + 12);
}

function findSafePoint(game, requested) {
  if (safePoint(game, requested)) return requested;
  const choices = [];
  for (let x = 440; x < game.room.width - 180; x += 110) {
    const point = { ...requested, x, y: GROUND };
    if (safePoint(game, point)) choices.push(point);
  }
  for (const platform of game.room.platforms) for (let x = platform.x + 60; x < platform.x + platform.w - 60; x += 115) {
    const point = { ...requested, x, y: platform.y };
    if (safePoint(game, point)) choices.push(point);
  }
  return choices.length ? choices[Math.floor(game.rng() * choices.length)] : null;
}

function makeArrival(game, kind, point, ordinal) {
  const car = kind === 'car' || kind === 'bossCar', train = kind === 'train';
  const boss = kind === 'bossCar';
  const fromRight = point.x > game.player.x;
  const approach = car ? (boss ? 2.05 : 1.5) : train ? 1.65 : kind === 'road' ? 0.2 : 0.35;
  const warning = car ? 0.9 : 0;
  const unload = boss ? 2.2 : car || train ? 1.65 : kind === 'road' ? 2.4 : 1.05;
  const depart = car || train ? 2.1 : 0.7;
  const departureWarning = car ? 0.75 : 0;
  const toX = point.x + (car ? 25 : 0);
  const fromX = car || train ? (fromRight ? game.room.width + 220 : -260) : kind === 'road' ? (fromRight ? game.room.width + 40 : -40) : toX;
  const event = {
    id: `${game.room.index}:${game.room.wave}:${ordinal}`,
    kind, x: fromX, y: point.y, fromX, toX,
    elapsed: 0, duration: warning + approach + unload + departureWarning + depart,
    warning, approach, unload, departureWarning, depart, doorOpen: false, enemyIds: [], phase: warning ? 'warning' : 'approach',
    facing: fromRight ? -1 : 1, drift: 0, velocity: 0, speed: 0, hitPlayerByLeg: {},
  };
  game.arrivals.push(event);
  return event;
}

/** Spawn the whole wave immediately; arrival animations never hide queued enemies. */
export function createEncounter(game) {
  game.arrivals ||= [];
  // Finished cars can linger briefly, but cannot leak into later reinforcement waves.
  game.arrivals = game.arrivals.filter(a => a.elapsed < a.duration && a.enemyIds.some(id => game.enemies.some(e => e.id === id && !e.dead && e.spawnTime > 0)));
  const room = game.room;
  const pool = game.zoneIndex === 0 ? ['pistol', 'smg', 'rusher', 'shotgun'] : ['pistol', 'smg', 'shotgun', 'rusher', 'heavy'];
  const requests = room.spawnPoints.map(p => ({ ...p, type: room.wave > 1 ? pool[Math.floor(game.rng() * pool.length)] : p.type }));
  // Boss first reserves the visible forecourt; guards use separate doors beyond it.
  requests.sort((a, b) => Number(b.type === 'boss') - Number(a.type === 'boss'));
  let vehicle = null;
  for (let i = 0; i < requests.length; i++) {
    const point = findSafePoint(game, requests[i]);
    if (!point) continue;
    let kind;
    if (point.type === 'boss') kind = 'bossCar';
    else if (point.y < GROUND) kind = 'door';
    else if (room.theme === 'subway') kind = room.variant === 4 && room.wave % 2 ? 'door' : 'train';
    else if (room.variant === 7 || room.boss) kind = 'door';
    else if (Math.abs(point.x - (point.x > game.player.x ? room.width : 0)) < 570 && room.wave % 2 === 0) kind = 'road';
    else kind = 'car';
    let event;
    // Two people may emerge from the same vehicle when their safe positions fit.
    if (vehicle && vehicle.kind === kind && Math.abs(vehicle.toX - point.x) < 170 && vehicle.enemyIds.length < 2) event = vehicle;
    else { event = makeArrival(game, kind, point, i); if (kind === 'car' || kind === 'train') vehicle = event; }
    const delay = event.enemyIds.length * 0.24;
    const appearance = event.warning + event.approach + delay;
    const warning = Math.max(room.boss && point.type !== 'boss' ? 4.6 : 0, appearance + event.unload - 0.15);
    const enemy = game.spawnEnemy(point, warning);
    // Only render coordinates move during the arrival; collision remains at the
    // validated destination and damage/attacks stay disabled by spawnTime.
    enemy.entry = {
      eventId: event.id, kind, fromX: kind === 'road' ? event.fromX : kind === 'door' ? point.x : event.toX + 8,
      targetX: point.x, targetY: point.y, drawX: point.x, drawY: point.y,
      progress: 0, visible: false, appearance, readyAt: warning,
    };
    event.enemyIds.push(enemy.id);
    if (point.type === 'boss') game.bossIntro = event;
  }
  if (room.boss) game.notify('타이어가 비명을 지른다 · 회장 백야가 도착했다', 4.4);
  else if (room.wave > 1) {
    const kind = game.arrivals.find(a => a.kind !== 'door')?.kind || 'door';
    const hint = kind === 'train' ? '멈춘 전동차의 문이 열린다' : kind === 'car' ? '검은 차량이 골목으로 들어온다' : kind === 'road' ? '도로 끝에서 발소리가 몰려온다' : '잠긴 출입문 너머로 발소리가 들린다';
    game.notify(`${hint} · 증원 ${room.wave}/${room.totalWaves}`, 3.5);
  }
}

/** Called with simulation time, so pause, rewards and slow motion stay coherent. */
export function updateEncounters(game, dt) {
  if (!game.arrivals?.length) return;
  for (const event of game.arrivals) {
    const previousX = event.x;
    event.elapsed += dt;
    const warning = event.warning || 0, departureWarning = event.departureWarning || 0;
    const approachEnd = warning + event.approach;
    const unloadEnd = approachEnd + event.unload;
    const departStart = unloadEnd + departureWarning;
    // These latches belong to the encounter, so a frame rate change or pause
    // never repeats a rev, tyre squeal, brake or door slam.
    if (!event.soundStarted) {
      event.soundStarted = true;
      if (event.kind === 'car' || event.kind === 'bossCar') game.emitSound('engine', { volume: event.kind === 'bossCar' ? 0.75 : 0.35 });
    }
    if (!event.soundBraked && event.elapsed >= warning + event.approach * 0.68) {
      event.soundBraked = true;
      if (event.kind === 'bossCar' || event.kind === 'car') game.emitSound('skid', { volume: event.kind === 'bossCar' ? 0.85 : 0.28 });
      else if (event.kind === 'train') game.emitSound('trainBrake', { volume: 0.45 });
    }
    if (!event.soundOpened && event.elapsed >= approachEnd) {
      event.soundOpened = true;
      if (event.kind !== 'road') game.emitSound('arrivalDoor', { volume: event.kind === 'bossCar' ? 0.8 : 0.3 });
    }
    if (!event.soundDeparted && event.elapsed >= unloadEnd) {
      event.soundDeparted = true;
      if (event.kind === 'car' || event.kind === 'bossCar') game.emitSound('engine', { volume: 0.5 });
    }
    const entering = event.elapsed >= warning && event.elapsed < approachEnd;
    const unloading = event.elapsed >= approachEnd && event.elapsed < unloadEnd;
    event.phase = event.elapsed < warning ? 'warning' : entering ? 'approach' : unloading ? 'unload' : event.elapsed < departStart ? 'departureWarning' : 'depart';
    event.doorOpen = unloading;
    const progress = clamp((event.elapsed - warning) / event.approach, 0, 1);
    event.drift = event.kind === 'bossCar' && entering ? Math.sin(progress * Math.PI) * 0.16 : 0;
    if (event.elapsed < warning) event.x = event.fromX;
    else if (entering) event.x = mix(event.fromX, event.toX, driveEase(progress));
    else if (event.elapsed < departStart) event.x = event.toX;
    else if (event.kind === 'car' || event.kind === 'bossCar' || event.kind === 'train') {
      const leaving = clamp((event.elapsed - departStart) / event.depart, 0, 1);
      event.x = mix(event.toX, event.facing < 0 ? -300 : game.room.width + 300, driveEase(leaving));
    }
    event.velocity = dt > 0 ? (event.x - previousX) / dt : 0;
    event.speed = Math.abs(event.velocity);
    vehicleSweep(game, event, previousX, dt);
    for (const id of event.enemyIds) {
      const enemy = game.enemies.find(e => e.id === id);
      if (!enemy || enemy.dead || !enemy.entry) continue;
      const entry = enemy.entry;
      // Tests, future skip-intro controls and gameplay may release the enemy early.
      // Never reset spawnTime or restore an enemy that has already been killed.
      if (enemy.spawnTime <= 0) { entry.visible = true; entry.progress = 1; entry.drawX = enemy.x; entry.drawY = enemy.y; continue; }
      entry.visible = event.elapsed >= entry.appearance;
      entry.progress = clamp((event.elapsed - entry.appearance) / Math.max(0.1, entry.readyAt - entry.appearance), 0, 1);
      entry.drawX = mix(entry.fromX, entry.targetX, easeOut(entry.progress));
      entry.drawY = event.kind === 'train' ? mix(entry.targetY - 80, entry.targetY, entry.progress) : entry.targetY;
      if (entry.visible) enemy.animation += dt * 7;
    }
  }
  game.arrivals = game.arrivals.filter(event => event.elapsed < event.duration);
  if (game.bossIntro && game.bossIntro.elapsed >= game.bossIntro.duration) game.bossIntro = null;
}
