const WIDTH = 1280;
const HEIGHT = 720;
// One art pixel is four world units. Physics and mouse aiming stay at 1280×720.
const DOT = 4;
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
  // Nested stepped halos instead of a blurred bloom filter.
  ctx.save(); ctx.fillStyle = color; ctx.globalAlpha *= 0.22;
  for (let ring = 4; ring >= 1; ring--) {
    const r = Math.ceil(radius * ring / 4 / DOT) * DOT;
    for (let row = -r; row < r; row += DOT * 2) {
      const half = Math.floor(Math.sqrt(Math.max(0, r * r - row * row)) / DOT) * DOT;
      ctx.fillRect(Math.round(x / DOT) * DOT - half, Math.round(y / DOT) * DOT + row, half * 2, DOT * 2);
    }
  }
  ctx.restore();
}

function label(ctx, text, x, y, size = 12, color = COLORS.paper, align = 'center') {
  // Korean labels are composited at display resolution; only the art is pixelated.
  if (ctx.pixelLabels) {
    const m = ctx.getTransform();
    ctx.pixelLabels.push({ text, x, y, size, color, align, alpha: ctx.globalAlpha,
      transform: [m.a, m.b, m.c, m.d, m.e, m.f].map(value => value * DOT) });
    return;
  }
  ctx.font = `${size > 16 ? '600' : '500'} ${size}px "Noto Sans KR", "Malgun Gothic", sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

// Hand-authored sprite rows. Dots are transparent; each other character is one
// palette entry. The silhouettes differ as well as the colors (hat/hood/armor).
const SPRITES = {
  player: [
    '....HHHH....', '...HhhhhH...', '..hHHHHHHh..', '....sShS....',
    '....sSS.....', '...cLrC.....', '..cCLrCC....', '..cCLrCCc...',
    '..cCCrCCc...', '..cCCCCCc...', '..cCCCCCc...', '..cCc.CCc...', '.ccCc.CCcc..',
  ],
  pistol: [
    '....hhhh....', '...hhhhhh...', '..HHHHHHHH..', '....sSSS....',
    '....sSS.....', '...cLrC.....', '..cCLrCC....', '..cCLrCCc...',
    '..cCCrCCc...', '...CCCCC....', '...CCCCC....', '...Cc.CC....', '...cc.Cc....',
  ],
  smg: [
    '....hhhh....', '....hhhhS...', '....sSSSS...', '....ssSS....',
    '.....SS.....', '...CCLCC....', '..CCCCCCC...', '..CCCCCCC...',
    '..sCcCCCs...', '..sCrCCCs...', '...CrCCC....', '...CCCCC....', '...cc.Cc....',
  ],
  shotgun: [
    '....HHHH....', '...HHHHHHH..', '....hSSS....', '....sSSS....',
    '.....ss.....', '...CCCCC....', '..CcLcLcC...', '..CcLcLcC...',
    '..CcccccC...', '..CcccccC...', '...CCCCC....', '...CCCCC....', '...cc.Cc....',
  ],
  rusher: [
    '.....rr.....', '....rCCr....', '...rCCCCr...', '...rhhLLr...',
    '...rhhSSr...', '....cCCc....', '...cCCCCc...', '..ccCCCCCc..',
    '..ccCCCCCc..', '..ccCCCCCc..', '...ccCCC....', '...ccCCC....', '...cc.Cc....',
  ],
  heavy: [
    '....HHHH....', '...HHHHHH...', '...hLLLLh...', '...hssssH...',
    '..cHHHHHHc..', '.cCCHHHHCCc.', '.cCccccccCc.', '.cCcLLLLcCc.',
    '.cCccccccCc.', '.cCcLLLLcCc.', '..CcLrrLcC..', '..CCCCCCCC..', '..CCC..CCC..',
  ],
  boss: [
    '....HHHH....', '...HHHHHH...', '...rrrrrr...', '..HHHHHHHH..',
    '....sSSS....', '....sSS.....', '..CCHrHCC...', '..CCHrHCC...',
    '..CCHrHCC...', '..CCCCCCC...', '..CCCCCCC...', '..CCC.CCC...', '.cCCC.CCCc..',
  ],
  portrait: [
    '.......hhhhhh.......', '......hHHHHHHh......', '......hHhhhhHh......',
    '......hhhhhhhh......', '...hhhhHHHHHHhhhh...', '...hHHHHHHHHHHHHh...',
    '.......ssSSSS.......', '.......sshShSS......', '.......sssSSS.......',
    '........ssSS........', '......cCLSrCC.......', '.....cCCLLrCCC......',
    '....cCCCLLrCCCc.....', '...cCCCcLLrCCCCc....', '...cCCccCLrCCcCCc...',
    '...cCCccCCrCCcCCc...', '...cCCccCCCCCcCCc...', '...cCCccCCCCCcCCc...',
    '...sScCCLCCCCcCCc...', '...sSccCLCCCCcCCc...', '.....ccCLCCCCcCSSc..',
    '.....ccCLCCCCc.SSL..', '....cccCLCCCCcc.LL..', '....cccCLCCCCcc.LL..',
    '...ccccCLcCCCcccLL..', '...cccCCc.ccCCccLL..', '...ccCCCc.ccCCCcLL..',
    '.....ccCc.ccCc......', '.....cCCc.cCCc......', '.....cCCc.cCCc......',
    '.....cCCc.cCCc......', '....hHHH..HHHHh.....',
  ],
};
const PALETTES = {
  player: { H: '#98aaa9', h: '#3e5669', c: '#253747', C: '#617d8a', L: '#e4d4a8', r: '#c24f49', s: '#8d796c', S: '#d8bb91' },
  pistol: { H: '#928e8e', h: '#383b4a', c: '#3c3545', C: '#7f7584', L: '#c6b8a2', r: '#bf5b55', s: '#896753', S: '#d0a88a' },
  smg: { H: '#a97b67', h: '#352e30', c: '#433d3d', C: '#8c6958', L: '#c7a487', r: '#d28a68', s: '#987258', S: '#d0a88a' },
  shotgun: { H: '#85855c', h: '#353d35', c: '#263b3b', C: '#7b8d77', L: '#e6c27d', r: '#d7a56c', s: '#8b7761', S: '#ceb99c' },
  rusher: { H: '#9e6a72', h: '#251d2d', c: '#412e43', C: '#875360', L: '#f2a987', r: '#ae6a72', s: '#665057', S: '#c9a293' },
  heavy: { H: '#8e9d9e', h: '#25333e', c: '#273541', C: '#607886', L: '#d2b477', r: '#ef965d', s: '#574b47', S: '#b3a48a' },
  boss: { H: '#ead9b3', h: '#676761', c: '#6d7173', C: '#b9b9a7', L: '#f2d6a0', r: '#ab484c', s: '#8c7666', S: '#cfb797' },
};
const GUNS = {
  pistol: ['LLLLL', 'HHHHH', '.CC..', '.CC..'],
  revolver: ['..LLLLL', 'HHLHHHH', '.CCC...', '.CC....'],
  smg: ['.L......', 'HHHHHHLL', 'CCCCCC..', '.C.CC...', '.C.CC...'],
  shotgun: ['LLLLLLLLLLL', 'CCHHHHHHHHH', 'CC.CCC.....'],
  heavy: ['.L.......', 'HHHHHHHLLL', 'CCCCCCC...', '.C.CCC....', '.C.CCC....'],
  boss: ['LLLLLLLLLL', 'HHHHHHHHHH', '.CC..CC...', '.CC..CC...'],
};
function sprite(ctx, rows, palette, x, y, dot = DOT) {
  for (let row = 0; row < rows.length; row++) for (let col = 0; col < rows[row].length; col++) {
    const color = palette[rows[row][col]];
    if (color) { ctx.fillStyle = color; ctx.fillRect(x + col * dot, y + row * dot, dot, dot); }
  }
}

const LETTERS = {
  A: ['.x.', 'x.x', 'xxx', 'x.x', 'x.x'], B: ['xx.', 'x.x', 'xx.', 'x.x', 'xx.'],
  R: ['xx.', 'x.x', 'xx.', 'x.x', 'x.x'], H: ['x.x', 'x.x', 'xxx', 'x.x', 'x.x'],
  O: ['xxx', 'x.x', 'x.x', 'x.x', 'xxx'], T: ['xxx', '.x.', '.x.', '.x.', '.x.'],
  E: ['xxx', 'x..', 'xx.', 'x..', 'xxx'], L: ['x..', 'x..', 'x..', 'x..', 'xxx'],
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.output = canvas.getContext('2d', { alpha: false });
    this.art = document.createElement('canvas');
    this.art.width = WIDTH / DOT; this.art.height = HEIGHT / DOT;
    this.ctx = this.art.getContext('2d', { alpha: false });
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.pixelLabels = [];
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
    ctx.pixelLabels.length = 0;
    ctx.setTransform(1 / DOT, 0, 0, 1 / DOT, 0, 0);
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    if (!game.room || game.mode === 'title') {
      this.drawTitle(game);
      this.present();
      return;
    }
    const settings = game.settings || {};
    const shake = Math.min(game.shake || 0, 14) * (settings.shake ?? 0.6);
    ctx.save();
    ctx.translate(Math.round(Math.sin(this.time * 143) * shake / DOT) * DOT, Math.round(Math.cos(this.time * 173) * shake * 0.65 / DOT) * DOT);
    const camera = Math.round((game.camera?.x || 0) / DOT) * DOT;
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
    this.present();
  }

  present() {
    const ctx = this.output;
    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.art, 0, 0, WIDTH, HEIGHT);
    for (const item of this.ctx.pixelLabels) {
      ctx.save(); ctx.transform(...item.transform); ctx.globalAlpha = item.alpha;
      label(ctx, item.text, item.x, item.y, item.size, item.color, item.align);
      ctx.restore();
    }
  }

  makeTitleArt() {
    const canvas = document.createElement('canvas'); canvas.width = WIDTH / DOT; canvas.height = HEIGHT / DOT;
    const ctx = canvas.getContext('2d');
    ctx.scale(1 / DOT, 1 / DOT); ctx.imageSmoothingEnabled = false;
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
    // A larger portrait keeps the in-game coat, fedora, red tie and palette.
    sprite(ctx, SPRITES.portrait, PALETTES.player, 832, 396, 8);
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
    ctx.drawImage(this.titleArt, 0, 0, WIDTH, HEIGHT);
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
    ctx.strokeStyle = '#bd4b42'; ctx.lineWidth = DOT; ctx.strokeRect(x, y, width, height);
    const dot = DOT, textWidth = (text.length * 4 - 1) * dot;
    for (let i = 0; i < text.length; i++) {
      sprite(ctx, LETTERS[text[i]] || [], { x: '#f28b76' }, Math.round((x + (width - textWidth) / 2) / DOT) * DOT + i * 4 * dot, Math.round((y + (height - 5 * dot) / 2) / DOT) * DOT, dot);
    }
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
    const rows = GUNS[id] || GUNS.pistol;
    const length = Math.max(...rows.map(row => row.length)) * DOT;
    sprite(ctx, rows, { L: tint || '#dfd9b7', H: tint || '#98a8a9', C: tint || '#53616b' }, 0, -8);
    if (muzzle) {
      ctx.globalAlpha *= Number(muzzle);
      sprite(ctx, ['..o....', '.oYo...', 'oYYYoo.', '.oYo...', '..o....'],
        { o: '#e9a656', Y: '#fff0b6' }, length, -12);
    }
    ctx.restore();
  }

  drawLegs(ctx, type, stride = 0) {
    const palette = PALETTES[type];
    const step = Math.round(stride / DOT) * DOT;
    ctx.fillStyle = '#17232f'; ctx.fillRect(-12 + step, -16, 8, 16);
    ctx.fillStyle = palette.c; ctx.fillRect(4 - step, -16, 8, 16);
    ctx.fillStyle = palette.H; ctx.fillRect(-16 + step, -4, 12, 4); ctx.fillRect(4 - step, -4, 12, 4);
  }

  drawPlayer(p, game) {
    const ctx = this.ctx;
    ctx.save(); ctx.translate(Math.round(p.x / DOT) * DOT, Math.round(p.y / DOT) * DOT);
    const dir = Math.cos(p.aim || 0) >= 0 ? 1 : -1;
    const moving = Math.abs(p.vx || 0) > 15 && p.grounded;
    const stride = moving ? Math.sin(p.animation || this.time * 16) * 6 : 0;
    if (p.invuln > 0) ctx.globalAlpha = game.settings?.flash === 0 ? 0.72 : 0.6 + Math.sin(this.time * 48) * 0.18 * (game.settings?.flash ?? 0.5);
    ctx.fillStyle = '#0007'; ctx.fillRect(-20, -4, 40, 8);
    if (p.rollTime > 0) {
      ctx.translate(0, -24); ctx.rotate(Math.round(p.rollTime * 17 / (Math.PI / 4)) * Math.PI / 4 * (p.rollDir || dir)); ctx.translate(0, 28);
    }
    ctx.save(); ctx.scale(dir, 1);
    this.drawLegs(ctx, 'player', stride);
    sprite(ctx, SPRITES.player, PALETTES.player, -24, -64);
    if (moving) {
      ctx.fillStyle = '#617d8a';
      ctx.fillRect(-24 - (stride > 0 ? 4 : 0), -20, 8, 8);
    }
    ctx.restore();
    const id = p.weapons?.[p.weaponIndex]?.id || 'pistol';
    const recoil = Math.min((p.recoil || 0) / ({ pistol: 3, revolver: 7, smg: 2.3, shotgun: 9 }[id] || 3), 1);
    ctx.save(); ctx.translate(0, -40); ctx.rotate(p.aim || 0);
    if (dir < 0) ctx.scale(1, -1);
    ctx.fillStyle = '#91a6ab'; ctx.fillRect(0, 0, 12 - recoil * 4, 8);
    ctx.fillStyle = '#dec39a'; ctx.fillRect(8 - recoil * 4, 0, 8, 4);
    ctx.translate(16 - recoil * 4, 0);
    this.drawGun(ctx, id, 1, p.muzzle > 0 ? (game.settings?.flash ?? 0.5) : 0);
    ctx.restore(); ctx.restore();
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
      line(ctx, e.x, e.y - 8, e.x + direction * length, e.y - 8, '#ed9368', DOT);
      ctx.setLineDash([]);
      for (let i = 1; i <= 4; i++) {
        const x = e.x + direction * (i * length / 5);
        line(ctx, x - direction * 8, e.y - 16, x, e.y - 8, '#f3a671', DOT);
        line(ctx, x, e.y - 8, x - direction * 8, e.y, '#f3a671', DOT);
      }
    } else {
      const fan = boss && e.pattern === 'fan';
      const shotgun = e.type === 'shotgun';
      const length = boss ? 610 : e.type === 'heavy' ? 520 : shotgun ? 325 : 380;
      const offsets = fan ? [-0.54, -0.36, -0.18, 0, 0.18, 0.36, 0.54] : shotgun ? [-0.22, 0, 0.22] : [0];
      ctx.setLineDash([7, 9]);
      for (const offset of offsets) {
        const angle = aim + offset;
        line(ctx, e.x, y, e.x + Math.cos(angle) * length, y + Math.sin(angle) * length, '#f59b6a', DOT);
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
    ctx.save(); ctx.translate(Math.round(e.x / DOT) * DOT, Math.round(e.y / DOT) * DOT); ctx.scale(scale, scale);
    const stride = Math.abs(e.vx || 0) > 5 ? Math.sin(this.time * 12 + e.x * 0.04) * 5 : 0;
    ctx.fillStyle = '#0006'; ctx.fillRect(-20, -4, 40, 8);
    ctx.save(); ctx.scale(dir, 1);
    this.drawLegs(ctx, e.type, stride);
    sprite(ctx, SPRITES[e.type], PALETTES[e.type], -24, -64);
    ctx.restore();
    ctx.save(); ctx.translate(0, -37); ctx.rotate(aim); if (dir < 0) ctx.scale(1, -1);
    ctx.fillStyle = PALETTES[e.type].C; ctx.fillRect(0, 0, 16, heavy ? 12 : 8);
    ctx.fillStyle = '#d2b398'; ctx.fillRect(12, 0, 8, 4); ctx.translate(16, 0);
    if (rusher) {
      sprite(ctx, ['.....LL', '..LLLL.', 'HHLL...', 'HH.....'], { L: '#e1e4cf', H: '#ae795d' }, 0, -8);
    } else this.drawGun(ctx, e.type, 1, e.muzzle > 0 ? (game.settings?.flash ?? 0.5) : 0);
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
    const x = Math.round(b.x / DOT) * DOT, y = Math.round(b.y / DOT) * DOT;
    const px = x - (b.vx || 0) * length, py = y - (b.vy || 0) * length;
    const color = b.color || (enemy ? '#f28b73' : '#f8d28b');
    ctx.save();
    line(ctx, px, py, x, y, enemy ? '#b54e46' : '#947346', DOT);
    ctx.fillStyle = enemy ? '#ad423c' : color;
    const r = enemy ? DOT : DOT / 2;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.fillStyle = enemy ? '#ffce93' : '#fff1bf'; ctx.fillRect(x - 2, y - 2, DOT, DOT);
    ctx.restore();
  }

  drawParticle(p) {
    const ctx = this.ctx;
    ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, p.life / (p.maxLife || 0.4)));
    ctx.fillStyle = p.color || '#d9b46d';
    if (p.type === 'text') {
      label(ctx, p.text || '', p.x, p.y, 14, p.color || '#d9b46d');
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
    for (const drop of this.rain) {
      const y = Math.floor(((drop.y + this.time * drop.speed) % 800 - 40) / DOT) * DOT;
      const x = Math.floor(((((drop.x - this.time * 94 - camera * 0.15) % 1450 + 1450) % 1450) - 90) / DOT) * DOT;
      ctx.fillStyle = `rgba(149,178,197,${drop.alpha * opacity * 0.65})`;
      ctx.fillRect(x, y, DOT, DOT * 2);
      if (drop.length > 16) ctx.fillRect(x - DOT, y + DOT * 2, DOT, DOT * 2);
      if (y > 634 && y < 657) {
        ctx.fillRect(x - DOT * 2, 648, DOT, DOT); ctx.fillRect(x + DOT, 648, DOT, DOT);
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
    const ctx = this.ctx, x = Math.round(mouse.x / DOT) * DOT, y = Math.round(mouse.y / DOT) * DOT;
    const gap = 8 + Math.round(Math.min(game.player?.recoil || 0, 1)) * DOT;
    ctx.save();
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      ctx.fillStyle = '#0c1117'; ctx.fillRect(x + dx * gap - 4, y + dy * gap - 4, 12, 12);
      ctx.fillStyle = '#eadbb3'; ctx.fillRect(x + dx * gap, y + dy * gap, DOT, DOT);
    }
    ctx.fillStyle = '#e7b964'; ctx.fillRect(x, y, DOT, DOT);
    ctx.restore();
  }
}
