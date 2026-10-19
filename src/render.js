const WIDTH = 1280;
const HEIGHT = 720;
const TAU = Math.PI * 2;
const COLORS = {
  ink: '#090d12', paper: '#eadbb3', gold: '#e9b85a', red: '#ed4d4c',
  blue: '#798e9d', platform: '#77818a', enemy: '#e97465',
};

function noise(n) {
  const value = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

function line(ctx, x1, y1, x2, y2, color, width = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

function polygon(ctx, points, color, stroke = null) {
  ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}

function glow(ctx, x, y, radius, color) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color); gradient.addColorStop(1, 'transparent');
  ctx.fillStyle = gradient;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function label(ctx, text, x, y, size = 12, color = COLORS.paper, align = 'center') {
  ctx.font = `${size > 16 ? '600' : '500'} ${size}px "Noto Sans KR", "Malgun Gothic", sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.pixelRatio = Math.min(globalThis.devicePixelRatio || 1, 2);
    canvas.width = WIDTH * this.pixelRatio;
    canvas.height = HEIGHT * this.pixelRatio;
    this.time = 0;
    this.rain = Array.from({ length: 128 }, (_, i) => ({
      x: noise(i + 2) * 1450, y: noise(i + 309) * 800,
      speed: 430 + noise(i + 610) * 430, length: 8 + noise(i + 800) * 19,
      alpha: 0.08 + noise(i + 720) * 0.19,
    }));
    this.skyLayers = new Map();
    this.titleArt = this.makeTitleArt();
  }

  draw(game, realDt = 1 / 60) {
    // Decorative motion shares combat's pause and slow-motion state. There are
    // no independent animation timers to leak into a reward or pause screen.
    const animated = game.mode === 'playing' || game.mode === 'title' || !game.room;
    if (animated) this.time += Math.min(realDt || 0, 0.1) * (game.slowActive ? 0.4 : 1);
    const ctx = this.ctx;
    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    if (!game.room || game.mode === 'title') {
      this.drawTitle(game);
      return;
    }
    const settings = game.settings || {};
    const shake = Math.min(game.shake || 0, 14) * (settings.shake ?? 0.6);
    ctx.save();
    ctx.translate(Math.sin(this.time * 143) * shake, Math.cos(this.time * 173) * shake * 0.65);
    const camera = game.camera?.x || 0;
    this.drawBackground(game.room, camera);
    ctx.save(); ctx.translate(-camera, 0);
    this.drawWorld(game.room, camera);
    this.drawExit(game);
    for (const platform of game.room.platforms || []) this.drawPlatform(platform);
    for (const cover of game.room.covers || []) {
      if (cover.hp > 0 || !cover.destructible) this.drawCover(cover, game.room.theme);
    }
    for (const pickup of game.pickups || []) this.drawPickup(pickup, game.player);
    for (const enemy of game.enemies || []) {
      if (!enemy.dead && enemy.hp > 0) this.drawEnemy(enemy, game);
    }
    if (game.player) this.drawPlayer(game.player, game);
    for (const bullet of game.bullets || []) this.drawBullet(bullet);
    for (const particle of game.particles || []) this.drawParticle(particle);
    ctx.restore();
    this.drawAtmosphere(game.room.theme, camera, game.slowActive);
    ctx.restore();
    if (game.slowActive) {
      ctx.fillStyle = '#55778b0b'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.strokeStyle = '#accbdb45'; ctx.lineWidth = 2; ctx.strokeRect(2, 2, WIDTH - 4, HEIGHT - 4);
    }
    const hurt = Math.min(game.player?.hurt || 0, 1) * (settings.flash ?? 0.5);
    if (hurt > 0) {
      const g = ctx.createRadialGradient(640, 360, 220, 640, 360, 740);
      g.addColorStop(0, 'transparent'); g.addColorStop(1, `rgba(145, 25, 29, ${hurt * 0.7})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
    if (game.flash > 0 && settings.flash !== 0) {
      ctx.fillStyle = `rgba(240,221,178,${Math.min(game.flash, 0.3) * (settings.flash ?? 0.5)})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
    if (game.mode === 'playing') this.drawCrosshair(game);
  }

  makeTitleArt() {
    const canvas = document.createElement('canvas'); canvas.width = WIDTH; canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d');
    const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    sky.addColorStop(0, '#101b24'); sky.addColorStop(0.65, '#36404a'); sky.addColorStop(1, '#10151a');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    glow(ctx, 882, 332, 320, '#b79e6b25');
    for (let i = 0; i < 18; i++) {
      const x = i * 80 - 30; const height = 110 + noise(i) * 220;
      ctx.fillStyle = i % 2 ? '#19232c' : '#1e2b34'; ctx.fillRect(x, 470 - height, 72, height);
      for (let row = 0; row < height / 20; row++) for (let col = 0; col < 5; col++) {
        if (noise(i * 89 + row * 13 + col) > 0.65) {
          ctx.fillStyle = noise(i * 33 + col) > 0.5 ? '#b9a47724' : '#78848b26';
          ctx.fillRect(x + 8 + col * 13, 480 - height + row * 20, 5, 9);
        }
      }
    }
    // The crooked rooflines and converging street create an old photographic city.
    polygon(ctx, [[0, 0], [475, 0], [605, 215], [605, 572], [0, 720]], '#0a1016');
    polygon(ctx, [[1280, 0], [1105, 0], [973, 215], [973, 567], [1280, 720]], '#0d1218');
    polygon(ctx, [[0, 720], [659, 512], [940, 512], [1280, 720]], '#20282d');
    for (let i = 0; i < 14; i++) {
      const y = 65 + i * 43;
      line(ctx, 0, y * 1.2, 601, y * 0.66 + 165, '#34404b3a');
      line(ctx, 982, y * 0.67 + 165, 1280, y * 1.2, '#3c41483b');
    }
    // Brickwork on the nearer building and barred sash windows.
    for (let y = 60; y < 590; y += 24) {
      for (let x = 1040; x < 1300; x += 65) {
        line(ctx, x + ((y / 24) % 2) * 32, y, x + ((y / 24) % 2) * 32, y + 24, '#55504a20');
      }
      line(ctx, 1010, y, 1280, y, '#71645513');
    }
    for (let i = 0; i < 4; i++) {
      const x = 1062 + (i % 2) * 136, y = 109 + Math.floor(i / 2) * 179;
      ctx.fillStyle = '#05080b'; ctx.fillRect(x - 5, y - 5, 66, 108);
      ctx.fillStyle = i === 2 ? '#c0a06a' : '#333d40'; ctx.globalAlpha = i === 2 ? 0.35 : 0.65;
      ctx.fillRect(x, y, 56, 97); ctx.globalAlpha = 1;
      line(ctx, x + 28, y, x + 28, y + 97, '#10161b', 4);
      line(ctx, x, y + 50, x + 56, y + 50, '#10161b', 5);
      line(ctx, x - 8, y + 104, x + 68, y + 104, '#5d5c53', 3);
    }
    // Fire escape and suspended cables.
    for (let i = 0; i < 3; i++) {
      const y = 238 + i * 112;
      line(ctx, 465, y, 584, y + 16, '#4a5051', 3);
      line(ctx, 473, y - 30, 584, y - 14, '#343b41', 2);
      for (let x = 480; x < 584; x += 18) line(ctx, x, y - 27, x, y + 4, '#343b41', 2);
      line(ctx, 478, y + 4, 564, y + 101, '#484d4d', 4);
      line(ctx, 492, y + 4, 578, y + 101, '#484d4d', 3);
      for (let step = 0; step < 7; step++) line(ctx, 480 + step * 12, y + step * 14, 495 + step * 12, y + step * 14, '#63605a', 2);
    }
    ctx.strokeStyle = '#070c11'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(540, 120); ctx.quadraticCurveTo(800, 278, 1070, 108); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(580, 300); ctx.quadraticCurveTo(800, 370, 1040, 270); ctx.stroke();
    this.neonSign(ctx, 746, 257, 'BAR', 108, 42, true);
    this.neonSign(ctx, 1144, 394, 'HOTEL', 84, 31, false);
    label(ctx, '24', 1000, 490, 14, '#b4a58a75');
    // Wet tarmac: long broken gold and red reflections, not a clean neon grid.
    for (let i = 0; i < 115; i++) {
      const y = 516 + noise(i + 42) * 204;
      const depth = (y - 510) / 210;
      const x = 620 + noise(i + 91) * 640;
      const length = 5 + noise(i + 332) * 62 * depth;
      const red = x < 855;
      ctx.fillStyle = red ? `rgba(185,64,54,${noise(i + 111) * 0.24})` : `rgba(218,174,99,${noise(i + 211) * 0.2})`;
      ctx.fillRect(x, y, length, 1 + depth * 2);
    }
    this.lamp(ctx, 1048, 532, 346, true);
    // A larger-than-life detective, split between streetlight and shadow.
    ctx.save(); ctx.translate(912, 650); ctx.scale(2.78, 2.78);
    polygon(ctx, [[-14, -61], [-23, -47], [-27, -10], [-17, -3], [-9, -12], [3, -8], [16, -2], [22, -9], [16, -47], [9, -62]], '#0a1015', '#596164');
    polygon(ctx, [[-10, -61], [-3, -46], [-8, -11], [-15, -14], [-16, -51]], '#1c272e');
    polygon(ctx, [[5, -61], [13, -51], [15, -17], [7, -9], [4, -39]], '#283237');
    polygon(ctx, [[-5, -56], [2, -56], [7, -42], [-1, -45]], '#9b9281');
    polygon(ctx, [[-1, -53], [2, -53], [3, -37], [0, -35]], '#77312e');
    polygon(ctx, [[-12, -13], [-2, -11], [-5, 0], [-17, 0]], '#090e13');
    polygon(ctx, [[4, -12], [13, -13], [17, 0], [5, 0]], '#0a0e13');
    polygon(ctx, [[-15, -51], [-24, -42], [-23, -23], [-17, -26], [-15, -38]], '#131b22');
    polygon(ctx, [[14, -52], [23, -41], [29, -25], [24, -22], [14, -35]], '#151d23', '#4d5353');
    ctx.fillStyle = '#8f8573'; ctx.fillRect(24, -25, 5, 6);
    ctx.save(); ctx.translate(29, -21); ctx.rotate(1.12); this.drawGun(ctx, 'pistol', 1.05, false); ctx.restore();
    polygon(ctx, [[-7, -75], [8, -76], [9, -62], [2, -58], [-7, -64]], '#726f64');
    polygon(ctx, [[-7, -74], [2, -76], [1, -61], [-7, -64]], '#182027');
    polygon(ctx, [[-13, -78], [-8, -88], [8, -89], [15, -79]], '#111a20', '#57605f');
    polygon(ctx, [[-19, -79], [17, -81], [21, -77], [-15, -75]], '#0b1117', '#68716d');
    line(ctx, 4, -70, 12, -71, '#d2ba82', 0.7);
    ctx.restore();
    // Near-side pipe and foreground silhouette anchor the image.
    line(ctx, 1250, 0, 1250, 720, '#02070b', 18);
    const shade = ctx.createLinearGradient(0, 0, WIDTH, 0);
    shade.addColorStop(0, '#070b10f5'); shade.addColorStop(0.38, '#070b10e5');
    shade.addColorStop(0.58, '#070b1070'); shade.addColorStop(0.78, '#070b1000');
    ctx.fillStyle = shade; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    const bottom = ctx.createLinearGradient(0, 540, 0, 720);
    bottom.addColorStop(0, 'transparent'); bottom.addColorStop(1, '#070b10e8');
    ctx.fillStyle = bottom; ctx.fillRect(0, 540, WIDTH, 180);
    return canvas;
  }

  drawTitle() {
    const ctx = this.ctx;
    ctx.drawImage(this.titleArt, 0, 0);
    this.drawRain(0, 0.8);
    const flicker = 0.017 + Math.max(0, Math.sin(this.time * 0.9)) * 0.012;
    glow(ctx, 802, 285, 160, `rgba(225,70,54,${flicker})`);
    // Smoke from the barrel and rain-swept haze are the only movement behind the menu.
    ctx.fillStyle = '#a2afba08';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath(); ctx.ellipse(750 + Math.sin(this.time * 0.12 + i) * 120, 590 + i * 13, 380, 12, 0, 0, TAU); ctx.fill();
    }
  }

  neonSign(ctx, x, y, text, width, height, vertical = false) {
    ctx.save();
    glow(ctx, x + width / 2, y + height / 2, width * 1.2, '#b83e3020');
    ctx.fillStyle = '#100f12'; ctx.fillRect(x - 4, y - 4, width + 8, height + 8);
    ctx.strokeStyle = '#bd4b42'; ctx.lineWidth = 1; ctx.strokeRect(x, y, width, height);
    ctx.shadowColor = '#ed5148'; ctx.shadowBlur = 13;
    ctx.font = `${vertical ? 700 : 500} ${height * 0.64}px Georgia, serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ee7663';
    ctx.fillText(text, x + width / 2, y + height / 2 + 1);
    ctx.restore();
  }

  lamp(ctx, x, ground, height = 310, title = false) {
    const top = ground - height;
    ctx.save();
    const cone = ctx.createLinearGradient(0, top, 0, ground);
    cone.addColorStop(0, title ? '#f2c06a25' : '#eed49321'); cone.addColorStop(1, '#cfb97c00');
    polygon(ctx, [[x - 8, top + 8], [x + 8, top + 8], [x + 125, ground], [x - 125, ground]], cone);
    glow(ctx, x, top + 6, title ? 108 : 85, title ? '#f5cd7b42' : '#eed38c2d');
    ctx.fillStyle = '#10151a'; ctx.fillRect(x + 22, top + 2, 7, height - 2);
    line(ctx, x + 26, top + 6, x + 26, top - 17, '#151b20', 5);
    line(ctx, x + 26, top - 17, x, top - 17, '#232a2f', 5);
    line(ctx, x, top - 17, x, top, '#232a2f', 4);
    polygon(ctx, [[x - 16, top], [x - 9, top - 8], [x + 9, top - 8], [x + 16, top]], '#151b21');
    line(ctx, x - 12, top + 2, x + 12, top + 2, '#f8d991', 3);
    ctx.fillStyle = '#080d12'; ctx.fillRect(x + 17, ground - 6, 17, 6);
    ctx.restore();
  }

  skyline(theme) {
    if (this.skyLayers.has(theme)) return this.skyLayers.get(theme);
    const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 720;
    const ctx = canvas.getContext('2d');
    for (let layer = 0; layer < 2; layer++) {
      for (let i = 0; i < 24; i++) {
        const x = i * 77 - 50; const w = 63 + noise(i + layer * 100) * 35;
        const h = 90 + noise(i + layer * 200) * (layer ? 240 : 190);
        const y = 468 - h + layer * 38;
        ctx.fillStyle = layer ? '#18232c' : '#26313a'; ctx.fillRect(x, y, w, h + 150);
        if (i % 4 === 0) {
          ctx.fillRect(x + w * 0.25, y - 19, w * 0.5, 19);
          line(ctx, x + w * 0.5, y - 42, x + w * 0.5, y - 19, '#26313a', 2);
        }
        for (let row = 0; row < h / 24; row++) for (let col = 0; col < w / 17 - 1; col++) {
          if (noise(i * 83 + row * 5 + col + layer * 500) > 0.55) {
            ctx.fillStyle = noise(col + i + row) > 0.3 ? '#c4ae7431' : '#8c9fa72a';
            ctx.fillRect(x + 10 + col * 17, y + 14 + row * 24, 5, 10);
          }
        }
      }
    }
    this.skyLayers.set(theme, canvas); return canvas;
  }

  drawBackground(room, camera) {
    const ctx = this.ctx;
    const subway = room.theme === 'subway';
    const sky = ctx.createLinearGradient(0, 0, 0, 640);
    sky.addColorStop(0, subway ? '#0b1318' : '#111c27');
    sky.addColorStop(0.58, subway ? '#222d32' : '#33414a');
    sky.addColorStop(1, '#101820');
    ctx.fillStyle = sky; ctx.fillRect(-20, -20, WIDTH + 40, HEIGHT + 40);
    if (!subway) {
      const distant = this.skyline(room.theme);
      const offset = (camera * 0.2) % 1600;
      ctx.drawImage(distant, -offset, 0); ctx.drawImage(distant, 1600 - offset, 0);
      glow(ctx, 1080 - camera * 0.035, 130, 190, '#c0ccd210');
      const mist = ctx.createLinearGradient(0, 320, 0, 590);
      mist.addColorStop(0, 'transparent'); mist.addColorStop(1, '#6a7b8324');
      ctx.fillStyle = mist; ctx.fillRect(0, 320, WIDTH, 270);
    }
    const start = Math.floor(camera * 0.53 / 370) - 1;
    for (let i = start; i < start + 6; i++) {
      const x = i * 370 - camera * 0.53;
      if (subway) this.subwayWall(ctx, x, i);
      else this.building(ctx, x, i, room.theme);
    }
  }

  building(ctx, x, i, theme) {
    const hq = theme === 'hq';
    const top = hq ? 115 : 188 + noise(i + 10) * 75;
    ctx.fillStyle = hq ? '#1a2025' : '#1a2127'; ctx.fillRect(x, top, 364, 640 - top);
    ctx.fillStyle = '#0e151b'; ctx.fillRect(x - 2, top - 9, 368, 9);
    line(ctx, x, top + 7, x + 364, top + 7, '#485057', 2);
    for (let row = 0; row < 4; row++) for (let col = 0; col < 5; col++) {
      const wx = x + 23 + col * 68, wy = top + 32 + row * 86;
      if (wy > 555) continue;
      ctx.fillStyle = '#0a1015'; ctx.fillRect(wx - 3, wy - 3, 36, 52);
      ctx.fillStyle = noise(i * 102 + row * 8 + col) > 0.57 ? '#b5a27638' : '#35444b55';
      ctx.fillRect(wx, wy, 30, 45);
      line(ctx, wx + 15, wy, wx + 15, wy + 45, '#101820', 2);
      line(ctx, wx, wy + 21, wx + 30, wy + 21, '#101820', 2);
      line(ctx, wx - 5, wy + 49, wx + 36, wy + 49, '#4f5350', 2);
    }
    if (hq) {
      for (let j = 0; j < 4; j++) {
        ctx.fillStyle = '#303636'; ctx.fillRect(x + j * 112, 364, 18, 276);
        line(ctx, x + j * 112 + 3, 367, x + j * 112 + 3, 640, '#555b54', 1);
      }
      if (i % 2 === 0) label(ctx, 'M O R R O W  &  C O.', x + 183, 355, 11, '#b7ab87');
    } else {
      for (let row = 0; row < 7; row++) line(ctx, x, 460 + row * 25, x + 364, 460 + row * 25, '#6570710d');
      ctx.fillStyle = '#0a1015'; ctx.fillRect(x + 145, 506, 72, 134);
      ctx.fillStyle = '#363a38'; ctx.fillRect(x + 152, 513, 58, 126);
      line(ctx, x + 181, 513, x + 181, 639, '#101518', 2);
      if (i % 3 === 0) this.neonSign(ctx, x + 118, 463, 'BAR', 126, 30);
      if (i % 3 === 1) {
        ctx.fillStyle = '#392b2a'; ctx.fillRect(x + 42, 440, 245, 31);
        label(ctx, '정든 전당포', x + 164, 455, 16, '#b9aa8b');
        for (let j = 0; j < 9; j++) line(ctx, x + 60 + j * 25, 476, x + 60 + j * 25, 595, '#68707135', 2);
      }
      line(ctx, x + 330, top, x + 330, 640, '#10171c', 6);
    }
    ctx.strokeStyle = '#050b11'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, top - 20); ctx.quadraticCurveTo(x + 180, top + 45, x + 370, top - 35); ctx.stroke();
  }

  subwayWall(ctx, x, i) {
    ctx.fillStyle = '#182428'; ctx.fillRect(x, 180, 370, 460);
    ctx.fillStyle = '#323d3c'; ctx.fillRect(x, 222, 370, 13);
    for (let y = 247; y < 495; y += 26) {
      line(ctx, x, y, x + 370, y, '#83938b13');
      for (let bx = 0; bx < 8; bx++) line(ctx, x + bx * 51 + (y % 52 ? 25 : 0), y, x + bx * 51 + (y % 52 ? 25 : 0), y + 26, '#83938b10');
    }
    ctx.fillStyle = '#090f15'; ctx.fillRect(x + 38, 291, 290, 193);
    ctx.fillStyle = '#283439'; ctx.fillRect(x + 46, 315, 274, 168);
    for (let j = 0; j < 3; j++) {
      ctx.fillStyle = '#0b1319'; ctx.fillRect(x + 55 + j * 89, 330, 70, 76);
      ctx.fillStyle = '#4b666326'; ctx.fillRect(x + 59 + j * 89, 334, 62, 68);
      line(ctx, x + 55 + j * 89, 421, x + 125 + j * 89, 421, '#66716a', 2);
    }
    ctx.fillStyle = '#573c35'; ctx.fillRect(x + 46, 443, 274, 7);
    ctx.fillStyle = '#0c1318'; ctx.fillRect(x + 29, 180, 18, 460);
    line(ctx, x + 32, 180, x + 32, 640, '#546063', 2);
    ctx.fillStyle = '#252b2b'; ctx.fillRect(x + 80, 251, 201, 27);
    label(ctx, i % 2 ? '03 · 종점 방면 →' : '새벽역  /  DAWN ST.', x + 182, 264, 12, '#c7c5aa');
    line(ctx, x + 85, 194, x + 280, 194, '#dad5ae', 3);
    glow(ctx, x + 182, 201, 125, '#dad5ae13');
  }

  drawWorld(room, camera) {
    const ctx = this.ctx;
    const start = Math.floor(camera / 480) - 1;
    if (room.theme !== 'subway') for (let i = start; i < start + 5; i++) this.lamp(ctx, 220 + i * 480, 640, 305);
    ctx.fillStyle = '#10161c'; ctx.fillRect(camera - 20, 640, WIDTH + 40, 80);
    ctx.fillStyle = '#65716e'; ctx.fillRect(camera - 20, 640, WIDTH + 40, 3);
    ctx.fillStyle = '#c6ac663b'; ctx.fillRect(camera - 20, 643, WIDTH + 40, 2);
    ctx.fillStyle = '#070c11'; ctx.fillRect(camera - 20, 653, WIDTH + 40, 67);
    for (let i = Math.floor(camera / 80); i < (camera + WIDTH) / 80 + 1; i++) {
      line(ctx, i * 80, 645, i * 80 - 4, 655, '#a6afad25');
      const px = i * 80 + 9, py = 668 + noise(i) * 37;
      ctx.fillStyle = noise(i + 8) > 0.6 ? '#d6aa6221' : '#72828f1f';
      ctx.fillRect(px, py, 26 + noise(i + 3) * 48, 2);
      ctx.fillStyle = '#aeb6b61c'; ctx.fillRect(px + 18, py + 4, 28, 1);
    }
    if (room.theme === 'subway') {
      for (let i = Math.floor(camera / 26); i < (camera + WIDTH) / 26 + 1; i++) {
        ctx.fillStyle = '#d4b95872'; ctx.fillRect(i * 26, 648, 15, 4);
      }
      line(ctx, camera - 20, 687, camera + WIDTH + 20, 687, '#3d4a50', 3);
      line(ctx, camera - 20, 706, camera + WIDTH + 20, 706, '#24343e', 4);
    }
  }

  drawPlatform(p) {
    const ctx = this.ctx;
    ctx.fillStyle = '#172129'; ctx.fillRect(p.x, p.y, p.w, Math.max(9, p.h || 12));
    ctx.fillStyle = '#87908d'; ctx.fillRect(p.x, p.y, p.w, 3);
    ctx.fillStyle = '#4e5555'; ctx.fillRect(p.x, p.y + 4, p.w, 4);
    for (let i = 12; i < p.w; i += 45) {
      polygon(ctx, [[p.x + i, p.y + 9], [p.x + i + 15, p.y + 23], [p.x + i + 15, p.y + 9]], '#4e5757');
      ctx.fillStyle = '#c5a568'; ctx.fillRect(p.x + i, p.y, 12, 2);
    }
    line(ctx, p.x, p.y + 11, p.x + p.w, p.y + 11, '#0a1016', 2);
  }

  drawCover(c, theme) {
    const ctx = this.ctx;
    const destructible = c.destructible;
    ctx.save(); ctx.translate(c.x, c.y);
    ctx.fillStyle = '#0006'; ctx.fillRect(5, c.h - 3, c.w + 7, 7);
    ctx.fillStyle = destructible ? '#64523e' : '#303b43'; ctx.fillRect(0, 0, c.w, c.h);
    ctx.fillStyle = destructible ? '#332c27' : '#19252c'; ctx.fillRect(4, 5, c.w - 8, c.h - 10);
    if (destructible) {
      for (let x = 7; x < c.w - 5; x += 14) {
        ctx.fillStyle = '#796348'; ctx.fillRect(x, 6, 11, c.h - 12);
        line(ctx, x + 4, 10, x + 7, c.h - 12, '#a48b6233');
      }
      line(ctx, 4, 6, c.w - 4, c.h - 6, '#ac8a59', 6);
      line(ctx, c.w - 4, 6, 4, c.h - 6, '#564637', 5);
      line(ctx, 0, 1, c.w, 1, '#bba178', 2);
      for (const [x, y] of [[5, 5], [c.w - 5, 5], [5, c.h - 5], [c.w - 5, c.h - 5]]) {
        ctx.fillStyle = '#d2bb84'; ctx.fillRect(x, y, 2, 2);
      }
      if (c.hp < c.maxHp * 0.65) {
        line(ctx, c.w * 0.4, 0, c.w * 0.55, c.h * 0.45, '#100e0c', 3);
        line(ctx, c.w * 0.55, c.h * 0.45, c.w * 0.35, c.h * 0.7, '#100e0c', 3);
        line(ctx, c.w * 0.35, c.h * 0.7, c.w * 0.5, c.h, '#100e0c', 2);
      }
    } else {
      ctx.fillStyle = theme === 'subway' ? '#55645f' : '#56606a'; ctx.fillRect(5, 6, c.w - 10, c.h - 12);
      line(ctx, 0, 1, c.w, 1, '#a0aaa4', 3);
      for (let y = 13; y < c.h - 6; y += 14) line(ctx, 10, y, c.w - 10, y, '#23333c', 3);
      ctx.fillStyle = '#b9aa71'; ctx.fillRect(c.w - 14, 8, 5, 4);
    }
    ctx.restore();
  }

  drawExit(game) {
    const ctx = this.ctx, room = game.room, x = room.exit.x, y = room.exit.y || 640;
    ctx.fillStyle = '#070d12'; ctx.fillRect(x - 37, y - 110, 74, 110);
    ctx.strokeStyle = '#49565d'; ctx.lineWidth = 5; ctx.strokeRect(x - 35, y - 108, 70, 108);
    ctx.fillStyle = room.cleared ? '#92794832' : '#26323a'; ctx.fillRect(x - 29, y - 103, 58, 103);
    for (let j = 0; j < 5; j++) line(ctx, x - 24, y - 93 + j * 11, x + 24, y - 93 + j * 11, '#121b21', 3);
    ctx.fillStyle = '#bca471'; ctx.fillRect(x + 18, y - 50, 3, 10);
    ctx.fillStyle = room.cleared ? '#e3bb63' : '#a14b45'; ctx.fillRect(x - 19, y - 123, 38, 6);
    glow(ctx, x, y - 121, 42, room.cleared ? '#e6c47b40' : '#ac4d3a20');
    if (room.cleared) {
      const g = ctx.createLinearGradient(0, y - 90, 0, y);
      g.addColorStop(0, '#dfbc6c00'); g.addColorStop(1, '#dfbc6c20');
      polygon(ctx, [[x - 25, y - 100], [x + 25, y - 100], [x + 65, y], [x - 65, y]], g);
      label(ctx, 'E  다음 방 →', x, y - 145 + Math.sin(this.time * 3) * 2, 13, '#f4d791');
    } else label(ctx, '출구', x, y - 140, 10, '#96a3a9');
  }

  drawPickup(p, player) {
    const ctx = this.ctx, y = p.y - 18 + Math.sin(this.time * 3 + p.x) * 4;
    const health = p.type === 'health', color = health ? '#e88a76' : '#e8c574';
    glow(ctx, p.x, y + 7, 34, health ? '#e65e4522' : '#e9c26428');
    ctx.strokeStyle = health ? '#ce705750' : '#dcb66a55'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, 23, 5, 0, 0, TAU); ctx.stroke();
    ctx.save(); ctx.translate(p.x, y);
    if (health) {
      ctx.fillStyle = '#3a2725'; ctx.fillRect(-10, -9, 20, 18); ctx.strokeStyle = color; ctx.strokeRect(-10, -9, 20, 18);
      ctx.fillStyle = color; ctx.fillRect(-2, -6, 4, 12); ctx.fillRect(-6, -2, 12, 4);
    } else {
      ctx.translate(-14, 0); this.drawGun(ctx, p.weaponId || 'pistol', 1, false, color);
    }
    ctx.restore();
    if (player && Math.abs(player.x - p.x) < 105 && Math.abs(player.y - p.y) < 90) {
      label(ctx, health ? 'E  응급 처치' : 'E  무기 획득', p.x, y - 24, 12, color);
    }
  }

  drawGun(ctx, id, scale = 1, muzzle = false, tint = null) {
    ctx.save(); ctx.scale(scale, scale);
    ctx.fillStyle = tint || '#b2b6af';
    const length = { pistol: 20, revolver: 25, smg: 31, shotgun: 42, heavy: 37, boss: 39 }[id] || 20;
    if (id === 'shotgun') {
      ctx.fillRect(1, -4, length, 4); ctx.fillStyle = tint || '#9b7351'; ctx.fillRect(12, 0, 12, 4); ctx.fillRect(-4, -2, 9, 6);
    } else if (id === 'smg' || id === 'heavy' || id === 'boss') {
      ctx.fillRect(0, -5, length - 7, 8); ctx.fillRect(length - 7, -3, 7, 4);
      ctx.fillStyle = tint || '#4b5559'; ctx.fillRect(10, 2, 6, 12); ctx.fillRect(0, 1, 5, 8);
      ctx.fillStyle = tint || '#d1c7a7'; ctx.fillRect(5, -7, 3, 2);
    } else {
      ctx.fillRect(0, -5, length, 5); ctx.fillRect(1, -1, 6, 9);
      if (id === 'revolver') { ctx.fillStyle = tint || '#646d6f'; ctx.fillRect(3, -4, 7, 7); }
      else { ctx.fillStyle = tint || '#434e54'; ctx.fillRect(1, -4, 12, 2); }
    }
    if (muzzle) {
      ctx.globalAlpha *= Number(muzzle);
      polygon(ctx, [[length + 2, -3], [length + 16, -9], [length + 11, -1], [length + 23, 1], [length + 11, 4], [length + 16, 9], [length + 1, 3]], '#ffdb86');
      polygon(ctx, [[length, -2], [length + 14, 0], [length, 3]], '#fff4cd');
    }
    ctx.restore();
  }

  drawPlayer(p, game) {
    const ctx = this.ctx;
    ctx.save(); ctx.translate(p.x, p.y);
    const dir = Math.cos(p.aim || 0) >= 0 ? 1 : -1;
    const moving = Math.abs(p.vx || 0) > 15 && p.grounded;
    const stride = moving ? Math.sin(p.animation || this.time * 16) * 7 : 0;
    const coat = moving ? Math.sin(p.animation || this.time * 15) * 4 - Math.sign(p.vx) * 5 : Math.sin(this.time * 2) * 1.5;
    const invuln = p.invuln > 0;
    if (invuln) ctx.globalAlpha = game.settings?.flash === 0 ? 0.72 : 0.6 + Math.sin(this.time * 48) * 0.18 * (game.settings?.flash ?? 0.5);
    ctx.fillStyle = '#0007'; ctx.beginPath(); ctx.ellipse(0, -1, 21, 4, 0, 0, TAU); ctx.fill();
    if (p.rollTime > 0) {
      ctx.translate(0, -18); ctx.rotate((p.rollTime * 17) * (p.rollDir || dir)); ctx.translate(0, 33);
    }
    // Legs, trailing coat, then pale lapel keep the player distinct in the dark.
    line(ctx, -6, -25, -7 + stride, -4, '#171d24', 8);
    line(ctx, 6, -25, 7 - stride, -4, '#3b4247', 7);
    line(ctx, -9 + stride, -2, -1 + stride, -2, '#91938c', 3);
    line(ctx, 3 - stride, -2, 13 - stride, -2, '#7f827e', 3);
    polygon(ctx, [[-10, -49], [-15, -36], [-17 + coat, -11], [-4, -17], [3, -13], [16 + coat, -10], [11, -39], [8, -49]], '#303b45', '#a3aba7');
    polygon(ctx, [[-9, -48], [-2, -39], [-6 + coat * 0.5, -16], [-12 + coat, -12]], '#16222c');
    polygon(ctx, [[2, -48], [8, -44], [6, -34], [-1, -38]], '#c4bca3');
    polygon(ctx, [[0, -43], [3, -42], [2, -31], [-1, -33]], '#b44840');
    ctx.fillStyle = '#bfb298'; ctx.fillRect(-5, -60, 12, 13);
    ctx.fillStyle = '#3e4444'; ctx.fillRect(dir > 0 ? -6 : 3, -60, 5, 11);
    ctx.fillStyle = '#6f7d80'; ctx.fillRect(-8, -65, 16, 7);
    ctx.fillStyle = '#202d35'; ctx.fillRect(-8, -64, 16, 6);
    polygon(ctx, [[-14, -59], [11, -61], [15, -57], [-13, -56]], '#333f47', '#a7aea6');
    const id = p.weapons?.[p.weaponIndex]?.id || 'pistol';
    const recoil = Math.min((p.recoil || 0) / ({ pistol: 3, revolver: 7, smg: 2.3, shotgun: 9 }[id] || 3), 1);
    ctx.save(); ctx.translate(0, -40); ctx.rotate(p.aim || 0);
    if (dir < 0) ctx.scale(1, -1);
    line(ctx, 0, 2, 12 - recoil * 5, 3, '#7b8589', 7);
    ctx.fillStyle = '#c9b89a'; ctx.fillRect(10 - recoil * 4, -1, 6, 6);
    ctx.translate(15 - recoil * 5, 0); ctx.rotate(-recoil * 0.1);
    this.drawGun(ctx, id, 1, p.muzzle > 0 ? (game.settings?.flash ?? 0.5) : 0);
    ctx.restore();
    if (p.rollTime > 0) {
      ctx.strokeStyle = '#e9ca834d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -33, 30, 0.3, 2.5); ctx.stroke();
    }
    ctx.restore();
    if (p.upgrades?.dodgeShot && p.dodgeBuff > 0) glow(ctx, p.x, p.y - 36, 24, '#ecc36b30');
  }

  drawEnemyTell(e) {
    const ctx = this.ctx;
    const boss = e.type === 'boss', rusher = e.type === 'rusher';
    const aim = Number.isFinite(e.lockedAim) ? e.lockedAim : e.aim || 0;
    const y = e.y - (e.h || 58) * 0.65;
    const progress = Math.max(0, Math.min(1, 1 - e.timer / (e.windupTotal || 1)));
    ctx.save();
    ctx.globalAlpha = 0.38 + progress * 0.4;
    if (rusher || (boss && e.pattern === 'rush')) {
      const direction = e.facing || (Math.cos(aim) >= 0 ? 1 : -1);
      const length = boss ? 380 : 260;
      ctx.setLineDash([10, 9]);
      line(ctx, e.x, e.y - 8, e.x + direction * length, e.y - 8, '#ed9368', 2);
      ctx.setLineDash([]);
      for (let i = 1; i <= 4; i++) {
        const x = e.x + direction * (i * length / 5);
        line(ctx, x - direction * 8, e.y - 16, x, e.y - 8, '#f3a671', 2);
        line(ctx, x, e.y - 8, x - direction * 8, e.y, '#f3a671', 2);
      }
    } else {
      const fan = boss && e.pattern === 'fan';
      const shotgun = e.type === 'shotgun';
      const length = boss ? 610 : e.type === 'heavy' ? 520 : shotgun ? 325 : 380;
      const offsets = fan ? [-0.54, -0.36, -0.18, 0, 0.18, 0.36, 0.54] : shotgun ? [-0.22, 0, 0.22] : [0];
      ctx.setLineDash([7, 9]);
      for (const offset of offsets) {
        const angle = aim + offset;
        line(ctx, e.x, y, e.x + Math.cos(angle) * length, y + Math.sin(angle) * length, '#f59b6a', boss && !fan ? 2 : 1);
      }
    }
    ctx.restore();
  }

  drawSpawnWarning(e) {
    const ctx = this.ctx, h = e.h || 58;
    const pulse = 0.55 + Math.sin(this.time * 12) * 0.15;
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = '#df9b68'; ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(e.x - (e.w || 30) / 2 - 8, e.y - h - 6, (e.w || 30) + 16, h + 8);
    ctx.setLineDash([]);
    line(ctx, e.x - 28, e.y + 3, e.x + 28, e.y + 3, '#e9a66f', 2);
    label(ctx, '증원 접근', e.x, e.y - h - 19, 10, '#f0bb88');
    ctx.restore();
  }

  drawEnemy(e, game) {
    const ctx = this.ctx;
    const boss = e.type === 'boss', heavy = e.type === 'heavy', rusher = e.type === 'rusher';
    const w = e.w || 30, h = e.h || 58;
    const scale = h / 58;
    const aim = e.aim || 0, dir = Math.cos(aim) >= 0 ? 1 : -1;
    const windup = e.state === 'windup';
    if (e.spawnTime > 0) { this.drawSpawnWarning(e); return; }
    if (windup) this.drawEnemyTell(e);
    ctx.save(); ctx.translate(e.x, e.y); ctx.scale(scale, scale);
    const stride = Math.abs(e.vx || 0) > 5 ? Math.sin(this.time * 12 + e.x * 0.04) * 5 : 0;
    ctx.fillStyle = '#0006'; ctx.beginPath(); ctx.ellipse(0, -1, w * 0.65 / scale, 4, 0, 0, TAU); ctx.fill();
    line(ctx, -7, -23, -7 + stride, -3, '#282b30', heavy ? 11 : 8);
    line(ctx, 7, -23, 8 - stride, -3, '#3f4243', heavy ? 11 : 8);
    line(ctx, -12 + stride, -2, -2 + stride, -2, '#8b8d80', 3);
    line(ctx, 4 - stride, -2, 14 - stride, -2, '#8b8d80', 3);
    const body = boss ? '#bdb7a6' : heavy ? '#646b68' : rusher ? '#5d4548' : e.type === 'smg' ? '#6a5a50' : e.type === 'shotgun' ? '#7b6950' : '#625d5d';
    polygon(ctx, [[-11, -46], [-heavy * 5 - 14, -35], [-12, -17], [12, -17], [heavy * 5 + 14, -35], [10, -46]], body, '#c2b2a04a');
    if (boss) {
      polygon(ctx, [[-4, -45], [4, -45], [8, -22], [-2, -28]], '#822e31');
      polygon(ctx, [[-11, -32], [-17, -12], [-4, -16], [-1, -33]], '#8b8a80');
    } else if (heavy) {
      ctx.fillStyle = '#303c42'; ctx.fillRect(-12, -42, 24, 21);
      line(ctx, -10, -38, 10, -38, '#9b9f89', 2); line(ctx, -10, -29, 10, -29, '#949881', 2);
      ctx.fillStyle = '#d3905b'; ctx.fillRect(-3, -35, 6, 4);
    } else if (e.type === 'shotgun') {
      ctx.fillStyle = '#273139'; ctx.fillRect(-8, -44, 16, 23);
      for (let j = 0; j < 4; j++) { ctx.fillStyle = '#c9a57a'; ctx.fillRect(-9 + j * 5, -37, 3, 8); }
    } else {
      polygon(ctx, [[-3, -45], [3, -44], [5, -32], [-2, -36]], '#bdaea0');
    }
    ctx.fillStyle = '#b1a18b'; ctx.fillRect(-6, -57, 12, 12);
    if (rusher) {
      polygon(ctx, [[-10, -49], [-10, -58], [-4, -64], [6, -63], [11, -54], [8, -47]], '#573f42', '#987874');
      ctx.fillStyle = '#17171c'; ctx.fillRect(-5, -57, 10, 8); ctx.fillStyle = '#df9e7f'; ctx.fillRect(dir > 0 ? 2 : -5, -55, 3, 2);
    } else if (heavy) {
      ctx.fillStyle = '#4c5d62'; ctx.fillRect(-9, -61, 18, 10); ctx.fillStyle = '#0c141a'; ctx.fillRect(-9, -55, 18, 4);
      ctx.fillStyle = '#dc9274'; ctx.fillRect(dir > 0 ? 4 : -8, -54, 4, 2);
    } else if (e.type === 'shotgun') {
      ctx.fillStyle = '#3e413c'; ctx.fillRect(-8, -61, 16, 6); ctx.fillRect(dir > 0 ? 3 : -13, -57, 11, 3);
    } else {
      ctx.fillStyle = boss ? '#bab3a1' : '#343239'; ctx.fillRect(-8, -63, 16, 8); ctx.fillRect(-12, -56, 26, 3);
      if (boss) { ctx.fillStyle = '#5f3936'; ctx.fillRect(-8, -58, 16, 2); }
    }
    ctx.save(); ctx.translate(0, -37); ctx.rotate(aim); if (dir < 0) ctx.scale(1, -1);
    line(ctx, 0, 0, 14, 2, body, heavy ? 9 : 7);
    ctx.fillStyle = '#ae9b83'; ctx.fillRect(11, -1, 6, 5);
    ctx.translate(15, 0);
    if (rusher) {
      polygon(ctx, [[-1, 1], [22, -7], [14, 2], [0, 4]], '#c5c9bf');
      ctx.fillStyle = '#805647'; ctx.fillRect(-5, 0, 7, 4);
    } else this.drawGun(ctx, e.type === 'heavy' ? 'heavy' : e.type, 0.88, e.muzzle > 0 ? (game.settings?.flash ?? 0.5) : 0);
    ctx.restore();
    if (e.flash > 0 && game.settings?.flash !== 0) {
      ctx.globalAlpha = Math.min(0.6, e.flash * 3) * (game.settings?.flash ?? 0.5); ctx.fillStyle = '#fff0c9'; ctx.fillRect(-9, -44, 18, 24); ctx.globalAlpha = 1;
    }
    ctx.restore();
    if (windup) {
      const radius = heavy || boss ? 12 : 8;
      ctx.save(); ctx.translate(e.x, e.y - h - 17);
      ctx.globalAlpha = 0.7 + Math.sin(this.time * 18) * 0.3;
      polygon(ctx, [[0, -radius], [radius, 0], [0, radius], [-radius, 0]], '#f4a16c');
      label(ctx, '!', 0, 1, 13, '#2e1e1a'); ctx.restore();
      if (boss) label(ctx, { fan: '부채꼴 사격', focus: '집중 사격', rush: '위치 이동' }[e.pattern] || '공격 준비', e.x, e.y - h - 58, 11, '#efb98c');
    }
    if (e.hp < e.maxHp || boss) {
      const barWidth = boss ? 150 : w + 9, y = e.y - h - (windup ? 37 : 13);
      ctx.fillStyle = '#080d11'; ctx.fillRect(e.x - barWidth / 2 - 1, y - 1, barWidth + 2, boss ? 7 : 5);
      ctx.fillStyle = '#574044'; ctx.fillRect(e.x - barWidth / 2, y, barWidth, boss ? 5 : 3);
      ctx.fillStyle = boss ? '#df6156' : '#d58a70'; ctx.fillRect(e.x - barWidth / 2, y, barWidth * Math.max(0, e.hp / e.maxHp), boss ? 5 : 3);
      if (boss) label(ctx, `장부의 주인 · ${e.phase || 1}단계`, e.x, y - 15, 11, '#e2b9a4');
    }
  }

  drawBullet(b) {
    const ctx = this.ctx, enemy = b.owner === 'enemy';
    const length = enemy ? 0.035 : 0.018;
    const px = b.x - (b.vx || 0) * length, py = b.y - (b.vy || 0) * length;
    const color = b.color || (enemy ? '#f28b73' : '#f8d28b');
    ctx.save();
    line(ctx, px, py, b.x, b.y, enemy ? '#f37c5840' : '#efc47b42', enemy ? 5 : 4);
    line(ctx, px + (b.x - px) * 0.3, py + (b.y - py) * 0.3, b.x, b.y, color, enemy ? 2 : 1.8);
    ctx.fillStyle = enemy ? '#ffbd96' : '#fff1bf';
    ctx.beginPath(); ctx.arc(b.x, b.y, enemy ? Math.max(3.5, b.radius || 3) : 2.3, 0, TAU); ctx.fill();
    if (enemy) { ctx.strokeStyle = '#ffd3ab'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(b.x, b.y, 5, 0, TAU); ctx.stroke(); }
    ctx.restore();
  }

  drawParticle(p) {
    const ctx = this.ctx;
    ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, p.life / (p.maxLife || 0.4)));
    ctx.fillStyle = p.color || '#d9b46d';
    if (p.type === 'text') {
      ctx.font = 'bold 14px "Malgun Gothic", sans-serif'; ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = '#0a0f14'; ctx.strokeText(p.text || '', p.x, p.y); ctx.fillText(p.text || '', p.x, p.y);
    } else if (p.type === 'shell') {
      ctx.translate(p.x, p.y); ctx.rotate(p.life * 13); ctx.fillStyle = '#d9b675'; ctx.fillRect(-2, -1, 4, 2);
    } else if (p.type === 'smoke') {
      ctx.globalAlpha *= 0.3; ctx.beginPath(); ctx.arc(p.x, p.y, (p.size || 8) * (1.6 - ctx.globalAlpha), 0, TAU); ctx.fill();
    } else if (p.type === 'blood') {
      ctx.fillRect(p.x, p.y, p.size || 3, p.size || 3);
    } else {
      line(ctx, p.x, p.y, p.x - (p.vx || 0) * 0.018, p.y - (p.vy || 0) * 0.018, p.color || '#f3c37a', p.size || 2);
    }
    ctx.restore();
  }

  drawRain(camera = 0, opacity = 1) {
    const ctx = this.ctx;
    ctx.lineWidth = 0.8;
    for (const drop of this.rain) {
      const y = (drop.y + this.time * drop.speed) % 800 - 40;
      const x = ((drop.x - this.time * 94 - camera * 0.15) % 1450 + 1450) % 1450 - 90;
      line(ctx, x, y, x - drop.length * 0.25, y + drop.length, `rgba(170,192,205,${drop.alpha * opacity})`, 0.8);
      if (y > 634 && y < 657) {
        ctx.strokeStyle = `rgba(170,192,205,${drop.alpha * opacity})`;
        ctx.beginPath(); ctx.ellipse(x, 647, 3 + (y - 634) * 0.2, 1, 0, 0, TAU); ctx.stroke();
      }
    }
  }

  drawAtmosphere(theme, camera, slow) {
    const ctx = this.ctx;
    this.drawRain(camera, theme === 'subway' ? 0.15 : slow ? 0.45 : 0.85);
    const mist = ctx.createLinearGradient(0, 540, 0, 640);
    mist.addColorStop(0, 'transparent'); mist.addColorStop(0.65, '#91a4ae08'); mist.addColorStop(1, 'transparent');
    ctx.fillStyle = mist; ctx.fillRect(0, 540, WIDTH, 100);
    const vignette = ctx.createRadialGradient(640, 390, 270, 640, 390, 820);
    vignette.addColorStop(0, 'transparent'); vignette.addColorStop(1, '#04080d91');
    ctx.fillStyle = vignette; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  drawCrosshair(game) {
    const mouse = game.input?.mouse;
    if (!mouse || !Number.isFinite(mouse.x) || !Number.isFinite(mouse.y)) return;
    const ctx = this.ctx, x = mouse.x, y = mouse.y;
    const gap = 5 + Math.min(game.player?.recoil || 0, 1) * 5;
    ctx.save();
    ctx.strokeStyle = '#0a0e13'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, 2, 0, TAU); ctx.stroke();
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      line(ctx, x + dx * gap, y + dy * gap, x + dx * (gap + 6), y + dy * (gap + 6), '#0c1117', 3);
      line(ctx, x + dx * gap, y + dy * gap, x + dx * (gap + 6), y + dy * (gap + 6), '#e8d9b5', 1);
    }
    ctx.fillStyle = '#e7b964'; ctx.fillRect(x - 1, y - 1, 2, 2);
    ctx.restore();
  }
}
