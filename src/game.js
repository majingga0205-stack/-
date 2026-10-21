import { WEAPONS, UPGRADES, ZONES, ENEMY_TYPES, generateRoom } from './data.js';
import { createEncounter, updateEncounters } from './encounters.js';
import { PLAYER_HEADS, getPlayerPose } from './motion.js';

export const WIDTH = 1280, HEIGHT = 720, GROUND = 640, STEP = 1 / 120;
const SAVE_KEY = 'last-bullet-before-dawn-v1';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const approach = (v, target, amount) => v < target ? Math.min(v + amount, target) : Math.max(v - amount, target);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function seededRandom(seed) {
  let s = seed >>> 0;
  return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function segmentRect(x1, y1, x2, y2, rect, padding = 0) {
  let tmin = 0, tmax = 1;
  const dx = x2 - x1, dy = y2 - y1;
  for (const [origin, delta, min, max] of [[x1, dx, rect.x - padding, rect.x + rect.w + padding], [y1, dy, rect.y - padding, rect.y + rect.h + padding]]) {
    if (Math.abs(delta) < 1e-8) { if (origin < min || origin > max) return null; }
    else { let a = (min - origin) / delta, b = (max - origin) / delta; if (a > b) [a, b] = [b, a]; tmin = Math.max(tmin, a); tmax = Math.min(tmax, b); if (tmin > tmax) return null; }
  }
  return tmin >= 0 && tmin <= 1 ? tmin : null;
}
const actorRect = a => ({ x: a.x - a.w / 2, y: a.y - a.h, w: a.w, h: a.h });
// Resolve the first anatomical surface touched, rather than awarding a headshot
// to a bullet that first travelled through the torso. Walls use the same sweep.
function actorHit(b, nx, ny, a, player = false) {
  const top = a.y - a.h;
  let headRect = { x: a.x - a.w * 0.28, y: top, w: a.w * 0.56, h: 12 }, bodyTop = top + 12;
  if (player) {
    const { pose, frame, dir } = getPlayerPose(a);
    const [hx, hy] = pose === 'roll' ? PLAYER_HEADS.roll[frame] : PLAYER_HEADS[pose];
    headRect = { x: a.x + (hx - 32) * dir - 8, y: a.y - 64 + hy - 5, w: 16, h: 14 };
    bodyTop = pose === 'roll' ? Math.min(top, headRect.y + headRect.h) : headRect.y + headRect.h;
  }
  const head = segmentRect(b.x, b.y, nx, ny, headRect, b.radius);
  const body = segmentRect(b.x, b.y, nx, ny, { x: a.x - a.w / 2, y: bodyTop, w: a.w, h: a.y - bodyTop }, b.radius);
  if (head === null && body === null) return null;
  const headshot = head !== null && (body === null || head < body);
  return { t: headshot ? head : body, headshot };
}

export class Game {
  constructor(options = {}) {
    // File URLs and private browser policies may deny storage access entirely.
    this.storage = options.storage ?? null;
    if (options.storage === undefined) { try { this.storage = globalThis.localStorage ?? null; } catch {} }
    this.audio = options.audio || null;
    this.settings = { music: 0.3, sfx: 0.65, shake: 0.55, flash: 0.4 };
    this.best = { score: 0, rooms: 0, wins: 0 };
    try { const saved = JSON.parse(this.storage?.getItem(SAVE_KEY) || '{}'); for (const k of Object.keys(this.settings)) if (Number.isFinite(saved.settings?.[k])) this.settings[k] = clamp(saved.settings[k], 0, 1); for (const k of Object.keys(this.best)) if (Number.isFinite(saved.best?.[k])) this.best[k] = Math.max(0, saved.best[k]); } catch {}
    this.mode = 'title'; this.room = null; this.player = null;
    this.roomIndex = 0; this.zoneIndex = 0; this.time = 0; this.kills = 0; this.score = 0;
    this.seed = 0; this.rng = seededRandom(1); this.camera = { x: 0 };
    this.enemies = []; this.bullets = []; this.particles = []; this.pickups = []; this.arrivals = [];
    this.weather = { intensity: 0, target: 0, timer: 10, elapsed: 0, kindlabel: '비 그침' };
    this.weatherRng = seededRandom(7);
    this.rewardChoices = []; this.toast = { text: '', time: 0 }; this.notice = '';
    this.input = { keys: new Set(), mouse: { x: 850, y: 380, left: false, right: false }, pressed: new Set() };
    this.accumulator = 0; this.shake = 0; this.flash = 0; this.slowActive = false; this.hitStop = 0;
    this.stats = { shots: 0, hits: 0, headshots: 0, damageTaken: 0, roomsCleared: 0 };
    this.nextEnemyId = 1; this.nextBulletId = 1; this.waveDelay = 0;
    this.bound = false; this.endingSaved = false;
  }
  persist() { try { this.storage?.setItem(SAVE_KEY, JSON.stringify({ settings: this.settings, best: this.best })); } catch {} }
  setSettings(patch) { for (const key of Object.keys(this.settings)) if (Number.isFinite(patch[key])) this.settings[key] = clamp(patch[key], 0, 1); this.audio?.setVolumes(this.settings.music, this.settings.sfx); this.persist(); }
  emitSound(name, options) { this.audio?.sfx(name, options); }
  notify(text, duration = 2.8) { this.toast = { text, time: duration }; }
  stack(id) { return this.player?.upgrades[id] || 0; }
  getWeapon() { return this.player?.weapons[this.player.weaponIndex] || null; }
  getWeaponDef() { return WEAPONS[this.getWeapon()?.id] || WEAPONS.pistol; }
  magazine(id) { return Math.ceil(WEAPONS[id].magazine * (1 + this.stack('extendedMag') * 0.25)); }
  createWeapon(id) { return { id, ammo: this.magazine(id), cooldown: 0, reload: 0, reloadTotal: 0, heat: 0, durability: 100, wetness: 0, jammed: false, jamReason: '', clearProgress: 0, maintenance: 0, jamGrace: 0 }; }
  startRun(seed) {
    this.seed = (seed ?? Math.floor(Math.random() * 0xFFFFFFFF)) >>> 0; this.rng = seededRandom(this.seed);
    this.weatherRng = seededRandom(this.seed ^ 0x6B24A3D1);
    this.roomIndex = 0; this.zoneIndex = 0; this.time = 0; this.kills = 0; this.score = 0;
    this.stats = { shots: 0, hits: 0, headshots: 0, damageTaken: 0, roomsCleared: 0 }; this.endingSaved = false;
    this.player = { x: 150, y: GROUND, vx: 0, vy: 0, w: 30, h: 58, hp: 50, maxHp: 50, aim: 0, facing: 1, grounded: true, coyote: 0.1, jumpBuffer: 0, rollTime: 0, rollCooldown: 0, rollDir: 1, invuln: 0, slow: 100, maxSlow: 100, recoil: 0, weaponIndex: 0, weapons: [], upgrades: {}, hurt: 0, muzzle: 0, dodgeBuff: 0, reloadBuff: 0, swapBuff: 0, animation: 0 };
    this.player.weapons = [this.createWeapon('pistol')];
    Object.assign(this.player, { crouching: false, sheltered: false, vaultTime: 0, vaultCooldown: 0, vault: null, maintenanceBlocked: false });
    this.clearInput(); this.shake = 0; this.flash = 0; this.hitStop = 0; this.accumulator = 0;
    this.loadRoom(0); this.mode = 'playing'; this.audio?.start(); this.audio?.setVolumes(this.settings.music, this.settings.sfx);
  }
  clearInput() { this.input.keys.clear(); this.input.pressed.clear(); this.input.mouse.left = false; this.input.mouse.right = false; this.slowActive = false; }
  pause() { if (this.mode === 'playing') { this.mode = 'paused'; this.clearInput(); this.accumulator = 0; } }
  resume() { if (this.mode === 'paused') { this.mode = 'playing'; this.clearInput(); this.accumulator = 0; } }
  returnToTitle() { this.mode = 'title'; this.clearInput(); this.enemies = []; this.bullets = []; this.particles = []; this.pickups = []; this.arrivals = []; this.room = null; this.player = null; this.accumulator = 0; }
  bindInput(canvas) {
    if (this.bound) return; this.bound = true;
    const gameKeys = new Set(['KeyA', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyR', 'KeyQ', 'KeyE', 'KeyC', 'KeyF', 'Escape']);
    window.addEventListener('keydown', e => {
      if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (gameKeys.has(e.code)) e.preventDefault();
      if (e.code === 'Escape' && !e.repeat) { if (this.ui?.handleEscape) this.ui.handleEscape(); else if (this.mode === 'playing') this.pause(); else if (this.mode === 'paused') this.resume(); return; }
      if (this.mode !== 'playing') return;
      if (!e.repeat && !this.input.keys.has(e.code)) this.input.pressed.add(e.code);
      this.input.keys.add(e.code);
    });
    window.addEventListener('keyup', e => this.input.keys.delete(e.code));
    const pointer = e => { const r = canvas.getBoundingClientRect(); this.input.mouse.x = (e.clientX - r.left) * WIDTH / r.width; this.input.mouse.y = (e.clientY - r.top) * HEIGHT / r.height; };
    canvas.addEventListener('pointermove', pointer);
    // Pointerdown only fires for the first pressed mouse button. Mouse events
    // deliver every chord edge, so RMB focus + LMB fire work in either order.
    canvas.addEventListener('mousedown', e => { if (this.mode !== 'playing') return; e.preventDefault(); pointer(e); if (e.button === 0) this.input.mouse.left = true; if (e.button === 2) this.input.mouse.right = true; this.audio?.start(); });
    window.addEventListener('mouseup', e => { if (e.button === 0) this.input.mouse.left = false; if (e.button === 2) this.input.mouse.right = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('blur', () => this.pause());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); });
  }
  tick(realDt) {
    realDt = clamp(realDt, 0, 0.1);
    if (this.mode !== 'playing') { this.accumulator = 0; return; }
    this.accumulator += realDt;
    while (this.accumulator >= STEP && this.mode === 'playing') {
      this.accumulator -= STEP;
      this.slowActive = this.input.mouse.right && this.player.slow > 0;
      if (this.slowActive) this.player.slow = Math.max(0, this.player.slow - STEP * 23 * (1 - this.stack('secondWind') * 0.2));
      const scale = this.slowActive ? 0.4 : 1;
      this.time += STEP;
      if (this.hitStop > 0) { this.hitStop -= STEP; continue; }
      this.update(STEP * scale);
    }
  }
  update(dt) {
    if (this.mode !== 'playing') return;
    const p = this.player;
    for (const key of ['invuln', 'hurt', 'rollCooldown', 'vaultCooldown', 'muzzle', 'dodgeBuff', 'reloadBuff', 'swapBuff', 'landingTime', 'knockbackTime']) p[key] = Math.max(0, p[key] - dt);
    p.motionTime += dt;
    this.toast.time = Math.max(0, this.toast.time - dt); this.shake = Math.max(0, this.shake - dt * 24); this.flash = Math.max(0, this.flash - dt * 5);
    p.recoil = Math.max(0, p.recoil - dt * 8);
    const press = this.input.pressed;
    if (press.has('Space')) p.jumpBuffer = 0.13;
    if (press.has('KeyR')) { if (this.getWeapon().jammed) this.clearJam(); else this.reload(); }
    if (press.has('KeyQ')) this.switchWeapon();
    if (press.has('KeyE')) this.interact();
    if (press.has('ShiftLeft') || press.has('ShiftRight')) this.roll();
    if (press.has('KeyF')) this.vault();
    press.clear();
    if (this.mode !== 'playing') return;
    this.updatePlayer(dt);
    this.updateHazards(dt);
    if (this.mode !== 'playing') return;
    this.updateWeather(dt);
    this.updateWeaponCondition(dt);
    updateEncounters(this, dt);
    if (this.mode !== 'playing') return;
    for (const weapon of p.weapons) {
      weapon.cooldown = Math.max(0, weapon.cooldown - dt); weapon.heat = Math.max(0, weapon.heat - dt * 0.8);
      if (weapon.reload > 0) { weapon.reload = Math.max(0, weapon.reload - dt); if (weapon.reload === 0) { weapon.ammo = this.magazine(weapon.id); this.emitSound('reloadDone'); this.notify(`${WEAPONS[weapon.id].name} · 재장전 완료`, 1.2); } }
    }
    if (this.input.mouse.left && p.rollTime <= 0 && p.vaultTime <= 0) this.fire();
    for (const enemy of this.enemies) { if (this.mode !== 'playing') break; if (!enemy.dead) this.updateEnemy(enemy, dt); }
    if (this.mode !== 'playing') return;
    this.updateBullets(dt);
    this.updateParticles(dt);
    this.enemies = this.enemies.filter(e => !e.dead);
    if (p.hp <= 0) return;
    this.updateRoomProgress(dt);
    this.camera.x = approach(this.camera.x, clamp(p.x - WIDTH * 0.38, 0, this.room.width - WIDTH), dt * (100 + Math.abs(p.vx)) * 3);
  }
  updatePlayer(dt) {
    const p = this.player, keys = this.input.keys;
    if (p.vaultTime > 0) {
      const v = p.vault; v.elapsed = Math.min(v.duration, v.elapsed + dt);
      const position = this.vaultPosition(v, v.elapsed / v.duration);
      // A new obstruction aborts the traversal instead of pushing through it.
      if (this.room.covers.some(c => c.hp > 0 && this.rectOverlaps({ x: position.x - p.w / 2, y: position.y - p.h, w: p.w, h: p.h }, c))) {
        p.vaultTime = 0; p.vault = null; p.vx = p.vy = 0;
      } else {
        p.x = position.x; p.y = position.y; p.vaultTime = Math.max(0, v.duration - v.elapsed);
        p.vx = p.vy = 0; p.grounded = false;
        if (p.vaultTime === 0) { p.vault = null; p.grounded = true; p.landingTime = 0.18; }
        p.aim = Math.atan2(this.input.mouse.y - (p.y - 38), this.input.mouse.x + this.camera.x - p.x);
        return;
      }
    }
    const wantsCrouch = keys.has('KeyC') && p.grounded && p.rollTime <= 0;
    const headBlocked = this.room.covers.some(c => c.hp > 0 && this.rectOverlaps({ x: p.x - p.w / 2, y: p.y - 58, w: p.w, h: 58 }, c));
    p.crouching = wantsCrouch || (p.crouching && headBlocked); p.h = p.crouching || p.rollTime > 0 ? 34 : 58;
    p.aim = Math.atan2(this.input.mouse.y - (p.y - (p.crouching ? 21 : 38)), this.input.mouse.x + this.camera.x - p.x);
    p.facing = Math.cos(p.aim) >= 0 ? 1 : -1;
    p.coyote = p.grounded ? 0.1 : Math.max(0, p.coyote - dt);
    p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
    if (p.jumpBuffer > 0 && p.coyote > 0 && p.rollTime <= 0 && !headBlocked) { p.crouching = false; p.h = 58; p.vy = -760; p.grounded = false; p.coyote = 0; p.jumpBuffer = 0; this.burst(p.x, p.y, 5, '#828b91', 'smoke'); }
    const move = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    if (p.knockbackTime > 0) { p.vx = p.knockbackX; p.knockbackX *= Math.exp(-dt * 3); }
    else if (p.rollTime > 0) { p.rollTime = Math.max(0, p.rollTime - dt); p.vx = p.rollDir * 670; if (p.rollTime === 0) { p.dodgeBuff = 1.2; p.h = p.crouching ? 34 : 58; } }
    else p.vx = approach(p.vx, move * (p.crouching ? 130 : 310) * (this.getWeapon().maintenance > 0.25 ? 0.45 : 1) * (1 + 0.1 * this.stack('quickFeet')), (p.grounded ? 2500 : 1700) * dt);
    p.animation += Math.abs(p.vx) * dt / 42;
    const wasAirborne = !p.grounded && p.vy > 100;
    this.moveActor(p, dt);
    if (wasAirborne && p.grounded) { p.landingTime = 0.18; this.burst(p.x, p.y, 4, '#65717a', 'smoke'); }
  }
  moveActor(a, dt) {
    const oldX = a.x, oldY = a.y;
    a.x += a.vx * dt; a.x = clamp(a.x, a.w / 2 + 8, this.room.width - a.w / 2 - 8);
    for (const c of this.room.covers) if (c.hp > 0 && a.y > c.y + 3 && a.y - a.h < c.y + c.h && a.x + a.w / 2 > c.x && a.x - a.w / 2 < c.x + c.w) {
      if (oldX + a.w / 2 <= c.x + 1) a.x = c.x - a.w / 2;
      else if (oldX - a.w / 2 >= c.x + c.w - 1) a.x = c.x + c.w + a.w / 2;
      a.vx = 0;
    }
    a.vy = Math.min(1000, a.vy + 1900 * dt); a.y += a.vy * dt; a.grounded = false;
    const surfaces = [...this.room.platforms, ...this.room.covers.filter(c => c.hp > 0), { x: 0, y: GROUND, w: this.room.width, h: 80 }];
    if (a.vy >= 0) for (const s of surfaces) if (oldY <= s.y + 1 && a.y >= s.y && a.x + a.w / 2 > s.x && a.x - a.w / 2 < s.x + s.w) { a.y = Math.min(a.y, s.y); a.vy = 0; a.grounded = true; }
    if (a.y > HEIGHT + 100) { a.y = GROUND; a.vy = 0; }
  }
  roll() {
    const p = this.player;
    if (p.rollCooldown > 0 || p.rollTime > 0 || p.vaultTime > 0 || p.knockbackTime > 0) return false;
    p.rollDir = (this.input.keys.has('KeyD') ? 1 : 0) - (this.input.keys.has('KeyA') ? 1 : 0) || p.facing;
    p.rollTotal = p.rollTime = 0.28; p.rollCooldown = 1.25 * (1 - this.stack('quickFeet') * 0.15); p.invuln = Math.max(p.invuln, 0.24);
    this.emitSound('roll'); this.burst(p.x, p.y - 10, 8, '#7f8c98', 'smoke'); return true;
  }
  rectOverlaps(a, b) { return a.x < b.x + b.w - 0.01 && a.x + a.w > b.x + 0.01 && a.y < b.y + b.h - 0.01 && a.y + a.h > b.y + 0.01; }
  vaultPosition(v, t) {
    const smooth = n => n * n * (3 - 2 * n);
    const plantX = v.plantX ?? v.startX;
    if (t < 0.16) return { x: v.startX + (plantX - v.startX) * smooth(t / 0.16), y: v.startY };
    if (t < 0.40) return { x: plantX, y: v.startY + (v.topY - v.startY) * smooth((t - 0.16) / 0.24) };
    if (t < 0.78) return { x: plantX + (v.endX - plantX) * smooth((t - 0.40) / 0.38), y: v.topY };
    return { x: v.endX, y: v.topY + (v.endY - v.topY) * smooth((t - 0.78) / 0.22) };
  }
  vault() {
    const p = this.player;
    if (!p.grounded || p.rollTime > 0 || p.vaultTime > 0 || p.vaultCooldown > 0 || p.knockbackTime > 0) return false;
    const dir = (this.input.keys.has('KeyD') ? 1 : 0) - (this.input.keys.has('KeyA') ? 1 : 0) || p.facing;
    const candidates = this.room.covers.filter(c => c.hp > 0 && p.y - c.y >= 12 && p.y - c.y <= 100 && c.w <= 130)
      .map(c => ({ c, gap: dir > 0 ? c.x - (p.x + p.w / 2) : p.x - p.w / 2 - (c.x + c.w) }))
      .filter(item => item.gap >= -0.1 && item.gap <= 54).sort((a, b) => a.gap - b.gap);
    const obstacle = candidates[0]?.c;
    if (!obstacle) { this.notify('낮은 상자나 담 가까이에서 F · 높이 100 이하', 1.3); return false; }
    if (obstacle.vaultable === false || obstacle.kind === 'wire') { this.notify('철조망 · 손을 짚을 수 없습니다. 충분히 높게 점프하세요', 2); return false; }
    const endX = dir > 0 ? obstacle.x + obstacle.w + p.w / 2 + 10 : obstacle.x - p.w / 2 - 10;
    if (endX < p.w / 2 + 8 || endX > this.room.width - p.w / 2 - 8) return false;
    const v = { startX: p.x, startY: p.y, endX, endY: p.y, topY: obstacle.y - 8, duration: obstacle.kind === 'barricade' ? 0.48 : 0.55, elapsed: 0, kind: obstacle.kind === 'barricade' ? 'barricade' : 'cover', obstacleX: obstacle.x, obstacleY: obstacle.y, obstacleW: obstacle.w, dir };
    v.plantX = dir > 0 ? obstacle.x - p.w / 2 - 2 : obstacle.x + obstacle.w + p.w / 2 + 2;
    for (let sample = 0; sample <= 40; sample++) {
      const point = this.vaultPosition(v, sample / 40), rect = { x: point.x - p.w / 2, y: point.y - 58, w: p.w, h: 58 };
      if (this.room.covers.some(c => c.hp > 0 && this.rectOverlaps(rect, c))) { this.notify('넘어갈 공간이 부족합니다', 1.2); return false; }
    }
    p.crouching = false; p.h = 58; p.vault = v; p.vaultTime = v.duration; p.vaultCooldown = 1.1; p.vx = p.vy = 0;
    this.emitSound('roll'); return true;
  }
  updateWeather(dt) {
    const w = this.weather, p = this.player;
    w.elapsed += dt;
    if (!this.room.weatherAllowed) { w.intensity = w.target = 0; w.kindlabel = '실내 · 비 없음'; }
    else {
      w.timer -= dt;
      if (w.timer <= 0) {
        w.target = w.target > 0 ? 0 : 0.65 + this.weatherRng() * 0.35;
        w.timer = w.target > 0 ? 16 + this.weatherRng() * 10 : 22 + this.weatherRng() * 20;
        this.notify(w.target > 0 ? '소나기 · 빗물이 총에 쌓인다. R을 길게 눌러 점검' : '비가 잦아든다 · 젖음은 총기 점검으로만 제거', 3);
      }
      w.intensity = approach(w.intensity, w.target, dt * 0.28);
      w.kindlabel = w.intensity > 0.15 ? '소나기' : '비 그침';
    }
    p.sheltered = false;
  }
  jamWeapon(weapon, reason) {
    if (weapon.jammed) return;
    weapon.jammed = true; weapon.jamReason = reason; weapon.clearProgress = 0; weapon.maintenance = 0; weapon.reload = 0;
    this.emitSound('reload');
    if (weapon === this.getWeapon()) this.notify(`${reason === 'rain' ? '빗물 유입' : '총기 마모'} · 작동 불량! R을 5번 눌러 복구`, 4);
  }
  clearJam() {
    const weapon = this.getWeapon();
    if (!weapon?.jammed) return false;
    weapon.clearProgress = Math.min(5, weapon.clearProgress + 1); this.emitSound('reload');
    if (weapon.clearProgress < 5) { this.notify(`총기 복구 ${weapon.clearProgress}/5 · R 연타`, 1.5); return false; }
    weapon.jammed = false; weapon.jamReason = ''; weapon.clearProgress = 0;
    weapon.durability = Math.max(35, weapon.durability); weapon.jamGrace = 5;
    this.player.maintenanceBlocked = true;
    this.notify('작동 복구 · 젖음 유지! 5초 안에 R을 다시 길게 눌러 점검', 3); this.emitSound('reloadDone'); return true;
  }
  updateWeaponCondition(dt) {
    const p = this.player, active = this.getWeapon(), held = this.input.keys.has('KeyR');
    if (!held) p.maintenanceBlocked = false;
    for (const weapon of p.weapons) {
      const exposed = weapon === active && this.room.weatherAllowed && this.weather.intensity > 0.05;
      weapon.jamGrace = Math.max(0, (weapon.jamGrace || 0) - dt);
      const previousWetness = weapon.wetness;
      weapon.wetness = clamp(weapon.wetness + dt * (exposed ? this.weather.intensity * 7 : 0), 0, 100);
      if (weapon === active && previousWetness < 65 && weapon.wetness >= 65 && !weapon.jammed) this.notify('총이 젖고 있습니다 · R을 1.4초 길게 눌러 점검', 3);
      if (weapon.wetness >= 85 && weapon.jamGrace <= 0) this.jamWeapon(weapon, 'rain');
      if (weapon !== active || !held || weapon.jammed || p.maintenanceBlocked || p.rollTime > 0 || p.vaultTime > 0 || (weapon.durability >= 100 && weapon.wetness <= 0)) { weapon.maintenance = 0; continue; }
      weapon.maintenance += dt;
      if (weapon.maintenance >= 1.4) {
        weapon.durability = 100; weapon.wetness = 0; weapon.maintenance = 0; weapon.jamGrace = 0;
        p.maintenanceBlocked = true; this.notify('총기 점검 완료 · 내구도 100 / 젖음 0%', 2); this.emitSound('reloadDone');
      }
    }
  }
  reload() {
    const weapon = this.getWeapon(); if (!weapon || weapon.jammed || weapon.reload > 0 || weapon.ammo >= this.magazine(weapon.id)) return false;
    weapon.reloadTotal = WEAPONS[weapon.id].reload * (this.player.reloadBuff > 0 ? 1 - 0.2 * this.stack('quickReload') : 1);
    weapon.reload = weapon.reloadTotal; this.emitSound('reload'); this.notify('재장전 중 · 예비 탄약 무제한', 1); return true;
  }
  switchWeapon() {
    const p = this.player; if (p.weapons.length < 2) { this.notify('무기를 발견하면 E로 획득하세요', 1.5); return false; }
    this.getWeapon().maintenance = 0; p.maintenanceBlocked = this.input.keys.has('KeyR');
    p.weaponIndex = 1 - p.weaponIndex; p.swapBuff = 2; this.emitSound('pickup'); this.notify(`${this.getWeaponDef().name} · 무기 교체`, 1.1); return true;
  }
  fire() {
    const p = this.player, weapon = this.getWeapon(), def = WEAPONS[weapon.id];
    if (weapon.cooldown > 0 || weapon.reload > 0 || weapon.jammed || weapon.maintenance > 0.25 || p.vaultTime > 0) return false;
    if (weapon.durability <= 0) { this.jamWeapon(weapon, 'wear'); return false; }
    if (weapon.ammo <= 0) { this.reload(); return false; }
    const last = weapon.ammo === 1;
    const dodgeBonus = p.dodgeBuff > 0 ? 0.45 * this.stack('dodgeShot') : 0;
    const damage = def.damage * (1 + 0.15 * this.stack('heavyRounds') + (last ? 0.45 * this.stack('lastRound') : 0) + dodgeBonus);
    weapon.ammo--; weapon.cooldown = def.interval * (p.swapBuff > 0 && this.stack('swapFrenzy') ? 0.75 : 1); weapon.heat = Math.min(1, weapon.heat + 0.12);
    weapon.durability = Math.max(0, weapon.durability - (def.wear ?? 0.22));
    const spread = def.spread * (weapon.id === 'smg' ? 0.5 + weapon.heat : 1) * (this.slowActive ? 1 - 0.35 * this.stack('slowFocus') : 1);
    p.recoil = def.recoil; p.muzzle = 0.065; p.dodgeBuff = 0; this.stats.shots++;
    // Sweep from the shoulder: a muzzle protruding through thin cover must not bypass it.
    const origin = { x: p.x, y: p.y - (p.crouching ? 21 : 38) };
    for (let i = 0; i < def.pellets; i++) {
      const angle = p.aim + (this.rng() - 0.5) * spread * 2;
      this.bullets.push({ id: this.nextBulletId++, x: origin.x, y: origin.y, px: origin.x, py: origin.y, vx: Math.cos(angle) * def.speed, vy: Math.sin(angle) * def.speed, owner: 'player', damage, radius: 2.5, life: def.range / def.speed, color: def.color || '#f8dc93', trail: 24, pierce: this.stack('pierce'), hitIds: new Set(), travel: 0, weaponId: weapon.id, originX: p.x, originY: p.y });
    }
    this.particles.push({ x: p.x, y: origin.y, vx: -p.facing * (65 + this.rng() * 70), vy: -110 - this.rng() * 80, life: 0.7, maxLife: 0.7, size: 3, color: '#b5a47d', type: 'shell' });
    this.shake = Math.max(this.shake, weapon.id === 'shotgun' ? 6 : weapon.id === 'revolver' ? 4 : 1.5);
    this.emitSound(weapon.id); if (weapon.ammo === 0) this.notify('탄창 소진 · R 재장전', 1.3); return true;
  }
  burst(x, y, count, color, type = 'spark') {
    for (let i = 0; i < count; i++) { const angle = this.rng() * Math.PI * 2, speed = 35 + this.rng() * 180, life = 0.15 + this.rng() * 0.45; this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life, maxLife: life, size: type === 'smoke' ? 5 + this.rng() * 7 : 1 + this.rng() * 3, color, type }); }
    if (this.particles.length > 500) this.particles.splice(0, this.particles.length - 500);
  }
  updateParticles(dt) { for (const p of this.particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.type === 'shell') { p.vy += 700 * dt; if (p.y > GROUND) { p.y = GROUND; p.vy *= -0.3; p.vx *= 0.5; } } else { p.vx *= Math.exp(-dt * 2); p.vy += (p.type === 'smoke' ? -30 : 90) * dt; } } this.particles = this.particles.filter(p => p.life > 0); }
  updateBullets(dt) {
    for (const b of this.bullets) {
      b.px = b.x; b.py = b.y; const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
      b.life -= dt; b.travel += Math.hypot(nx - b.x, ny - b.y);
      const hits = [];
      for (const c of [...this.room.covers, ...this.room.platforms]) { if (c.hp !== undefined && c.hp <= 0) continue; const t = segmentRect(b.x, b.y, nx, ny, c, b.radius); if (t !== null) hits.push({ t, kind: 'wall', target: c }); }
      if (b.owner === 'player') for (const enemy of this.enemies) { if (enemy.dead || enemy.spawnTime > 0 || b.hitIds.has(enemy.id)) continue; const hit = actorHit(b, nx, ny, enemy); if (hit) hits.push({ ...hit, kind: 'enemy', target: enemy }); }
      else { const hit = actorHit(b, nx, ny, this.player, true); if (hit) hits.push({ ...hit, kind: 'player', target: this.player }); }
      hits.sort((a, c) => a.t - c.t);
      for (const hit of hits) {
        const hx = b.x + (nx - b.x) * hit.t, hy = b.y + (ny - b.y) * hit.t;
        if (hit.kind === 'wall') { const c = hit.target; if (c.destructible && c.hp > 0) { c.hp -= b.damage; if (c.hp <= 0) { this.burst(c.x + c.w / 2, c.y + c.h / 2, 18, '#a88b67'); this.emitSound('hit'); } } this.burst(hx, hy, 4, '#ddb875'); b.life = -1; break; }
        if (hit.kind === 'player') { this.damagePlayer(b.damage * (hit.headshot ? 1.5 : 1), { headshot: hit.headshot }); b.life = -1; if (this.mode !== 'playing') return; break; }
        const e = hit.target; let damage = b.damage;
        const headshot = hit.headshot && (b.weaponId === 'pistol' || b.weaponId === 'revolver');
        if (headshot) damage *= WEAPONS[b.weaponId].headMultiplier;
        if (b.weaponId === 'shotgun') damage *= clamp(1 - Math.max(0, b.travel - 150) / 720, 0.28, 1);
        if (Math.hypot(e.x - b.originX, e.y - b.originY) <= 300) damage *= 1 + this.stack('closeRange') * 0.25;
        b.hitIds.add(e.id); this.damageEnemy(e, damage); this.stats.hits++;
        if (headshot) { this.stats.headshots++; this.particles.push({ x: hx, y: hy - 14, vx: 0, vy: -32, life: 0.7, maxLife: 0.7, size: 12, type: 'text', text: '헤드샷 ×2', color: '#f4d799' }); }
        this.burst(hx, hy, 5, '#c24b45', 'blood');
        if (b.pierce > 0) b.pierce--; else { b.life = -1; break; }
      }
      b.x = nx; b.y = ny;
      if (b.x < -80 || b.x > this.room.width + 80 || b.y < -100 || b.y > GROUND + 10) b.life = -1;
    }
    this.bullets = this.bullets.filter(b => b.life > 0); this.room.covers = this.room.covers.filter(c => c.hp > 0);
  }
  damagePlayer(amount, { headshot = false, hazard = false } = {}) {
    const p = this.player; if (this.mode !== 'playing' || (!hazard && p.invuln > 0) || p.hp <= 0) return false;
    p.hp = Math.max(0, p.hp - amount); if (!hazard) p.invuln = 0.65; p.hurt = 0.3; this.stats.damageTaken += amount;
    this.shake = 9; this.flash = 0.5; this.emitSound('hurt'); this.burst(p.x, p.y - 30, 10, '#c34849', 'blood');
    if (p.hp <= 0) this.endRun(false); else this.notify(hazard ? `철조망 −${Math.round(amount)} · 가시에서 벗어나세요` : `${headshot ? '머리 피격 ×1.5' : '피격'} −${Math.round(amount)} · 엄폐하거나 회피하세요`, 1.2); return true;
  }
  updateHazards(dt) {
    const p = this.player;
    p.wireCooldown = Math.max(0, p.wireCooldown - dt);
    if (p.wireCooldown > 0) return;
    const contact = (this.room.hazards || []).find(h => h.kind === 'wire' && this.rectOverlaps(actorRect(p), h));
    if (contact) { p.wireCooldown = contact.interval || 0.5; this.damagePlayer(contact.damage || 3, { hazard: true }); }
  }
  applyVehicleImpact(event, { speed, direction }) {
    const damage = clamp(Math.round(speed * 0.025), 8, 30);
    if (!this.damagePlayer(damage)) return false;
    const p = this.player;
    p.knockbackX = clamp(speed * 0.45, 120, 560) * direction; p.knockbackTime = 0.32;
    p.vx = p.knockbackX; p.vy = -clamp(speed * 0.16, 100, 240); p.grounded = false;
    p.vault = null; p.vaultTime = 0; p.rollTime = 0; p.coyote = 0; p.jumpBuffer = 0;
    if (this.mode === 'playing') this.notify(`차량 충돌 −${damage} · 헤드라이트를 보면 점프하거나 회피`, 2);
    return true;
  }
  damageEnemy(enemy, damage) {
    if (this.mode !== 'playing' || this.player.hp <= 0 || enemy.dead || enemy.spawnTime > 0) return false;
    enemy.hp -= damage; enemy.flash = 0.09; this.emitSound('hit'); this.hitStop = Math.max(this.hitStop, 0.017);
    if (enemy.hp <= 0) {
      enemy.dead = true; this.kills++; this.score += enemy.type === 'boss' ? 2500 : enemy.type === 'heavy' ? 160 : 100;
      this.player.slow = Math.min(100, this.player.slow + 12 + this.stack('slowHarvest') * 8);
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.stack('bloodHeal') * 2);
      this.player.reloadBuff = 4;
      const weapon = this.getWeapon(); if (weapon.reload > 0 && this.stack('quickReload')) { const newTotal = WEAPONS[weapon.id].reload * (1 - this.stack('quickReload') * 0.2); weapon.reload = Math.min(weapon.reload, newTotal); weapon.reloadTotal = newTotal; }
      this.burst(enemy.x, enemy.y - 28, 14, '#a83b3c', 'blood'); this.emitSound('kill'); this.shake = Math.max(this.shake, 3);
      if (this.rng() < 0.12 && enemy.type !== 'boss') this.pickups.push({ type: 'health', x: enemy.x, y: enemy.y, amount: 12 });
    } return true;
  }
  spawnEnemy(point, warning = 1) {
    const def = ENEMY_TYPES[point.type];
    const enemy = { ...def, type: point.type, id: this.nextEnemyId++, x: point.x, y: point.y, vx: 0, vy: 0, hp: def.hp, maxHp: def.hp, aim: Math.PI, facing: -1, state: 'idle', timer: 0.5 + this.rng() * 1.1, flash: 0, muzzle: 0, phase: 1, pattern: 'fan', patternIndex: 0, spawnTime: warning, grounded: true, dead: false, attackHit: false, burstLeft: 0, shotTimer: 0, windupTotal: def.windup, animation: 0, jumpCooldown: 0, airDashTime: 0, airDashDir: 0 };
    this.enemies.push(enemy); return enemy;
  }
  spawnWave() { createEncounter(this); }
  enemyShot(e, angle, { count = 1, spread = 0, speed = 370, damage = e.damage } = {}) {
    e.muzzle = 0.08;
    const x = e.x, y = e.y - e.h * 0.65;
    for (let i = 0; i < count; i++) {
      const a = angle + (count > 1 ? (i / (count - 1) - 0.5) * spread : 0);
      this.bullets.push({ id: this.nextBulletId++, x, y, px: x, py: y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, owner: 'enemy', damage, radius: e.type === 'heavy' ? 5 : 4, life: 4.5, color: e.type === 'heavy' ? '#ffb86b' : '#fa7067', trail: 12, hitIds: new Set(), travel: 0 });
    }
    this.emitSound(e.type === 'boss' || e.type === 'heavy' ? 'revolver' : e.type === 'rusher' ? 'roll' : e.type, { volume: 0.3 });
  }
  updateEnemy(e, dt) {
    e.flash = Math.max(0, e.flash - dt); e.muzzle = Math.max(0, e.muzzle - dt);
    if (e.spawnTime > 0) { e.spawnTime = Math.max(0, e.spawnTime - dt); return; }
    const p = this.player, dx = p.x - e.x, dy = p.y - (p.crouching ? 19 : 34) - (e.y - e.h * 0.65), dist = Math.hypot(dx, dy);
    e.facing = dx >= 0 ? 1 : -1;
    if (e.state !== 'windup' && e.state !== 'attack') e.aim = Math.atan2(dy, dx);
    e.timer -= dt;
    e.jumpCooldown = Math.max(0, e.jumpCooldown - dt); e.airDashTime = Math.max(0, e.airDashTime - dt);
    if (e.type === 'boss') { this.updateBoss(e, dt, dx, dist); this.moveActor(e, dt); return; }
    if (e.state === 'idle') {
      const desiredRange = e.type === 'rusher' ? 90 : e.type === 'shotgun' ? 300 : Math.min(e.range * 0.65, 650);
      e.vx = Math.abs(dx) > desiredRange ? e.facing * e.speed : e.type !== 'rusher' && Math.abs(dx) < 140 ? -e.facing * e.speed * 0.7 : 0;
      const obstacleAhead = e.type === 'rusher' && this.room.covers.some(c => c.hp > 0 && e.y > c.y + 5 && e.y - c.y < 150 && (e.facing > 0 ? c.x - (e.x + e.w / 2) : e.x - e.w / 2 - c.x - c.w) >= -2 && (e.facing > 0 ? c.x - (e.x + e.w / 2) : e.x - e.w / 2 - c.x - c.w) < 85);
      const leap = e.type === 'rusher' && e.grounded && e.jumpCooldown <= 0 && (obstacleAhead || (p.y < e.y - 45 && Math.abs(dx) < 440));
      if (leap || (e.timer <= 0 && dist < (e.type === 'rusher' ? 330 : e.range))) {
        e.pattern = leap ? 'leap' : 'dash';
        e.state = 'windup'; e.timer = e.windup; e.windupTotal = e.windup; e.lockedAim = e.aim; e.vx = 0;
      }
    } else if (e.state === 'windup') {
      e.vx = 0;
      // Lock aim for the final 0.32 seconds, so the tell gives a real dodge window.
      if (e.timer > 0.32) { e.aim = Math.atan2(dy, dx); e.lockedAim = e.aim; }
      if (e.timer <= 0) {
        e.state = 'attack'; e.lockedAim = e.aim; e.attackHit = false;
        if (e.type === 'rusher') {
          e.chargeDir = Math.cos(e.lockedAim) >= 0 ? 1 : -1; e.timer = e.pattern === 'leap' ? 0.68 : 0.36;
          if (e.pattern === 'leap') { e.vy = -740; e.grounded = false; e.airDashTime = 0.40; e.airDashDir = e.chargeDir; e.jumpCooldown = 1.2; }
        }
        else if (e.type === 'smg') { e.burstLeft = 5; e.shotTimer = 0; e.timer = 0.68; }
        else { this.enemyShot(e, e.lockedAim, { count: e.type === 'shotgun' ? 5 : e.type === 'heavy' ? 3 : 1, spread: e.type === 'shotgun' ? 0.5 : e.type === 'heavy' ? 0.16 : 0, speed: e.type === 'heavy' ? 310 : 360 }); e.timer = 0.12; }
      }
    } else if (e.state === 'attack') {
      e.vx = e.type === 'rusher' ? e.chargeDir * (e.pattern === 'leap' ? (e.airDashTime > 0 ? 660 : 420) : 620) : 0;
      if (e.type === 'rusher' && !e.attackHit && Math.abs(dx) < 44 && Math.abs(p.y - e.y) < 55) { this.damagePlayer(e.damage); e.attackHit = true; }
      if (e.type === 'smg') { e.shotTimer -= dt; if (e.shotTimer <= 0 && e.burstLeft > 0) { this.enemyShot(e, e.lockedAim + (this.rng() - 0.5) * 0.12, { speed: 380 }); e.burstLeft--; e.shotTimer = 0.13; } }
      if (e.timer <= 0) { e.state = 'recover'; e.timer = e.interval; e.vx = 0; }
    } else if (e.state === 'recover') { e.vx = 0; if (e.timer <= 0) { e.state = 'idle'; e.timer = 0.15; } }
    // Chase enemies can jump low cover and follow players off ledges.
    if (e.type !== 'rusher' && e.grounded && e.vx !== 0 && this.room.covers.some(c => c.hp > 0 && Math.abs(c.x + c.w / 2 - e.x) < c.w / 2 + e.w / 2 + 12 && e.y > c.y + 5)) e.vy = -610;
    e.animation += Math.abs(e.vx) * dt / 40; this.moveActor(e, dt);
  }
  updateBoss(e, dt, dx, dist) {
    if (e.hp <= e.maxHp * 0.5 && e.phase === 1) {
      e.phase = 2; e.state = 'recover'; e.timer = 1.6; e.vx = 0; this.notify('백야 · “이 도시에 무죄인 사람은 없어.”', 3); this.shake = 7; this.burst(e.x, e.y - 40, 22, '#c35148');
    }
    if (e.state === 'idle') {
      e.vx = Math.abs(dx) > 850 ? Math.sign(dx) * 80 : 0;
      if (e.timer <= 0 && dist < 1800) { e.pattern = ['fan', 'focus', 'rush'][e.patternIndex++ % 3]; e.state = 'windup'; e.timer = e.pattern === 'focus' ? 1.15 : 0.95; e.windupTotal = e.timer; e.lockedAim = e.aim; e.chargeDir = e.x > this.room.width / 2 ? -1 : 1; e.vx = 0; }
    } else if (e.state === 'windup') {
      e.vx = 0;
      if (e.timer > 0.4) { e.aim = Math.atan2(this.player.y - (this.player.crouching ? 19 : 34) - (e.y - e.h * 0.65), dx); e.lockedAim = e.aim; }
      if (e.timer <= 0) {
        e.state = 'attack'; e.lockedAim = e.aim; e.shotTimer = 0;
        e.burstLeft = e.pattern === 'fan' ? (e.phase === 2 ? 3 : 2) : e.pattern === 'focus' ? (e.phase === 2 ? 9 : 6) : 0;
        e.timer = e.pattern === 'rush' ? 0.8 : e.pattern === 'fan' ? 1.05 : 1.5;
        if (e.pattern === 'rush') { e.chargeDir ||= e.x > this.room.width / 2 ? -1 : 1; e.vy = -300; }
      }
    } else if (e.state === 'attack') {
      e.vx = e.pattern === 'rush' ? e.chargeDir * (e.phase === 2 ? 620 : 480) : 0;
      e.shotTimer -= dt;
      if (e.burstLeft > 0 && e.shotTimer <= 0) {
        if (e.pattern === 'fan') { this.enemyShot(e, e.lockedAim, { count: e.phase === 2 ? 9 : 7, spread: 1.15, speed: 310, damage: 11 }); e.shotTimer = 0.34; }
        else { this.enemyShot(e, e.lockedAim + (this.rng() - 0.5) * 0.055, { speed: 470, damage: 12 }); e.shotTimer = e.phase === 2 ? 0.13 : 0.19; }
        e.burstLeft--;
      }
      if (e.timer <= 0) { e.state = 'recover'; e.timer = e.phase === 2 ? 1.05 : 1.65; e.vx = 0; }
    } else { e.vx = 0; if (e.timer <= 0) { e.state = 'idle'; e.timer = 0.35; } }
    if (e.grounded && e.vx !== 0 && this.room.covers.some(c => Math.abs(c.x + c.w / 2 - e.x) < c.w / 2 + e.w / 2 + 12)) e.vy = -610;
    e.animation += Math.abs(e.vx) * dt / 40;
  }
  updateRoomProgress(dt) {
    for (const pickup of this.pickups) if (pickup.type === 'health' && distance(pickup, this.player) < 44 && this.player.hp < this.player.maxHp) { this.player.hp = Math.min(this.player.maxHp, this.player.hp + pickup.amount); pickup.used = true; this.emitSound('pickup'); this.notify(`응급 처치 · 체력 +${pickup.amount}`, 1.3); }
    this.pickups = this.pickups.filter(p => !p.used);
    if (this.room.boss && !this.enemies.some(e => e.type === 'boss' && !e.dead)) { this.room.cleared = true; this.stats.roomsCleared = 9; this.score += 1000; this.endRun(true); return; }
    if (this.room.cleared || this.enemies.length > 0) return;
    if (this.room.wave < this.room.totalWaves) {
      if (this.waveDelay <= 0) { this.waveDelay = 2.5; this.notify('아직 끝나지 않았다 · 재장전할 시간', 2.4); }
      this.waveDelay -= dt;
      if (this.waveDelay <= 0) { this.room.wave++; this.spawnWave(); }
      return;
    }
    this.room.cleared = true; this.stats.roomsCleared++; this.score += 350; this.bullets = [];
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + 18); this.player.slow = Math.min(100, this.player.slow + 25);
    const options = UPGRADES.filter(u => this.stack(u.id) < u.maxStacks);
    for (let i = options.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [options[i], options[j]] = [options[j], options[i]]; }
    this.rewardChoices = options.slice(0, 3); this.clearInput(); this.mode = 'reward'; this.emitSound('upgrade');
    this.pickups.push({ type: 'weapon', weaponId: this.room.weaponDrop, x: Math.min(this.room.width - 280, this.player.x + 100), y: GROUND });
  }
  loadRoom(index) {
    this.roomIndex = index; this.zoneIndex = Math.floor(index / 3); this.room = generateRoom(this.rng, index);
    this.room.enteredAt = this.time;
    this.enemies = []; this.bullets = []; this.particles = []; this.pickups = []; this.rewardChoices = []; this.arrivals = []; this.bossIntro = null;
    this.room.cleared = false; this.room.rewardTaken = false; this.room.wave = 1; this.room.totalWaves = this.room.boss ? 1 : 3;
    this.player.x = 150; this.player.y = GROUND; this.player.vx = this.player.vy = 0; this.player.invuln = 1; this.camera.x = 0; this.waveDelay = 0;
    this.player.rollTime = 0; this.player.rollCooldown = 0; this.player.jumpBuffer = 0; this.player.grounded = true; this.player.coyote = 0.1;
    Object.assign(this.player, { crouching: false, h: 58, vault: null, vaultTime: 0, vaultCooldown: 0, sheltered: false, maintenanceBlocked: false, motionTime: 0, landingTime: 0, rollTotal: 0.28, knockbackTime: 0, knockbackX: 0, wireCooldown: 0 });
    for (const weapon of this.player.weapons) weapon.maintenance = 0;
    this.weather = { intensity: 0, target: 0, timer: 7 + this.weatherRng() * 8, elapsed: 0, kindlabel: this.room.weatherAllowed ? '비 그침' : '실내 · 비 없음' };
    this.spawnWave();
    if (index === 0) this.pickups.push({ type: 'weapon', weaponId: ['revolver', 'smg', 'shotgun'][Math.floor(this.rng() * 3)], x: 315, y: GROUND });
    this.notice = this.room.story || ''; this.notify(this.room.boss ? '타이어가 비명을 지른다 · 백야의 차가 들어온다' : `${ZONES[this.zoneIndex].name} · ${this.room.name}`, this.room.boss ? 4.5 : 3.5);
  }
  interact() {
    if (this.mode !== 'playing') return false;
    const p = this.player;
    const pickup = this.pickups.filter(item => distance(item, p) < 105).sort((a, b) => distance(a, p) - distance(b, p))[0];
    if (pickup) {
      if (pickup.type === 'health') { if (p.hp >= p.maxHp) { this.notify('체력이 가득 찼습니다'); return false; } p.hp = Math.min(p.maxHp, p.hp + pickup.amount); }
      else {
        const incoming = pickup.weaponState ? { ...pickup.weaponState, maintenance: 0, reload: 0, cooldown: 0 } : this.createWeapon(pickup.weaponId);
        const existing = p.weapons.find(w => w.id === pickup.weaponId);
        if (existing) {
          existing.ammo = Math.min(this.magazine(existing.id), Math.max(existing.ammo, incoming.ammo)); existing.reload = 0;
          existing.durability = Math.max(existing.durability, incoming.durability);
          existing.jammed = existing.jammed && incoming.jammed; if (!existing.jammed) { existing.jamReason = ''; existing.clearProgress = 0; }
          this.notify(`${WEAPONS[existing.id].name} · 탄약과 양호한 부품 확보`);
        }
        else if (p.weapons.length < 2) { p.weapons.push(incoming); p.weaponIndex = p.weapons.length - 1; p.swapBuff = 2; this.notify(`${WEAPONS[pickup.weaponId].name} 획득 · Q 무기 교체`); }
        else {
          const dropped = { ...this.getWeapon(), reload: 0, cooldown: 0, maintenance: 0 };
          p.weapons[p.weaponIndex] = incoming; this.pickups.push({ type: 'weapon', weaponId: dropped.id, weaponState: dropped, x: pickup.x - 35, y: pickup.y }); p.swapBuff = 2;
          this.notify(`${WEAPONS[pickup.weaponId].name} 획득 · 기존 무기를 내려놓았습니다`);
        }
        p.maintenanceBlocked = this.input.keys.has('KeyR');
      }
      this.pickups.splice(this.pickups.indexOf(pickup), 1); this.emitSound('pickup'); return true;
    }
    if (Math.abs(p.x - this.room.exit.x) < 110) {
      if (this.room.cleared && this.room.rewardTaken) return this.nextRoom();
      this.notify('아직 적이 남아 있습니다 · 모든 증원을 제압하세요'); return false;
    }
    return false;
  }
  chooseUpgrade(id) {
    if (this.mode !== 'reward' || !this.rewardChoices.some(u => u.id === id)) return false;
    const def = UPGRADES.find(u => u.id === id); if (!def || this.stack(id) >= def.maxStacks) return false;
    this.player.upgrades[id] = this.stack(id) + 1;
    if (id === 'vitality') { this.player.maxHp += 25; this.player.hp = Math.min(this.player.maxHp, this.player.hp + 25); }
    this.room.rewardTaken = true; this.rewardChoices = []; this.mode = 'playing'; this.clearInput(); this.accumulator = 0;
    this.notify(`${def.name} 획득 · 오른쪽 출구에서 E`, 4); this.emitSound('upgrade'); return true;
  }
  nextRoom() {
    if (this.mode !== 'playing' || !this.room.cleared || !this.room.rewardTaken || this.roomIndex >= 8 || Math.abs(this.player.x - this.room.exit.x) >= 110) return false;
    this.clearInput(); this.loadRoom(this.roomIndex + 1); this.emitSound('door'); return true;
  }
  endRun(won) { if (this.endingSaved) return; this.endingSaved = true; this.mode = won ? 'won' : 'dead'; this.clearInput(); this.bullets = []; this.best.score = Math.max(this.best.score, this.score); this.best.rooms = Math.max(this.best.rooms, this.stats.roomsCleared); if (won) this.best.wins++; this.persist(); this.emitSound(won ? 'win' : 'death'); }
}
