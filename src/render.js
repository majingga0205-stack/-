import { drawScene, drawWeather, drawArrivals } from './scenery.js';
import { PLAYER_HEADS, getPlayerPose } from './motion.js';

const WIDTH = 1280;
const HEIGHT = 720;
// A native 64×64 actor occupies 64 world pixels; no detail is downsampled.
const DOT = 1;
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

// Each actor is authored directly on a 64×64 transparent canvas. The body uses
// individual pixels for seams, worn fabric, hat ribbons and face highlights;
// it is never an enlarged version of the old twelve-column sprite.
const ACTOR_COLORS = {
  player: { ink: '#05080d', dark: '#101720', coat: '#202c38', fold: '#2e3b49', edge: '#62717a', metal: '#75818a', accent: '#734043', skin: '#8d7b6c', light: '#b0a08a' },
  pistol: { ink: '#0a0b10', dark: '#23202b', coat: '#403b49', fold: '#514959', edge: '#887d8d', metal: '#8d8992', accent: '#8d504e', skin: '#957a69', light: '#c3a28a' },
  smg: { ink: '#100d0d', dark: '#302722', coat: '#4a392d', fold: '#634a35', edge: '#947d5c', metal: '#aaa18a', accent: '#a87545', skin: '#90725d', light: '#b89b7f' },
  shotgun: { ink: '#090e0d', dark: '#20302c', coat: '#33473e', fold: '#4b5c46', edge: '#859278', metal: '#b3a584', accent: '#b29c5c', skin: '#8e7962', light: '#baa086' },
  rusher: { ink: '#100b10', dark: '#2d202b', coat: '#50333e', fold: '#6b4651', edge: '#a3737c', metal: '#aa9f9f', accent: '#ad5f57', skin: '#8d6b61', light: '#be9485' },
  heavy: { ink: '#0b1014', dark: '#253039', coat: '#394852', fold: '#53616a', edge: '#84948d', metal: '#a2aa95', accent: '#d39b57', skin: '#725d4d', light: '#ab9271' },
  boss: { ink: '#0d0c0f', dark: '#24242b', coat: '#424047', fold: '#5a5356', edge: '#9e9490', metal: '#c1b398', accent: '#b1514c', skin: '#897460', light: '#bea589' },
};

function pixelLine(ctx, x0, y0, x1, y1, color, thickness = 1) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  ctx.fillStyle = color;
  for (;;) {
    ctx.fillRect(x0, y0, thickness, thickness);
    if (x0 === x1 && y0 === y1) break;
    const twice = error * 2;
    if (twice >= dy) { error += dy; x0 += sx; }
    if (twice <= dx) { error += dx; y0 += sy; }
  }
}

function pixelPolygon(ctx, points, color) {
  const top = Math.floor(Math.min(...points.map(p => p[1])));
  const bottom = Math.ceil(Math.max(...points.map(p => p[1])));
  ctx.fillStyle = color;
  for (let y = top; y < bottom; y++) {
    const edges = [];
    for (let a = 0, b = points.length - 1; a < points.length; b = a++) {
      const p = points[a], q = points[b];
      if ((p[1] <= y + .5 && q[1] > y + .5) || (q[1] <= y + .5 && p[1] > y + .5)) {
        edges.push(p[0] + (y + .5 - p[1]) * (q[0] - p[0]) / (q[1] - p[1]));
      }
    }
    edges.sort((a, b) => a - b);
    for (let i = 0; i < edges.length; i += 2) ctx.fillRect(Math.ceil(edges[i]), y, Math.ceil(edges[i + 1]) - Math.ceil(edges[i]), 1);
  }
}

// The detective uses jointed poses instead of a wide chest plate or a rotated
// standing sprite. Every limb and coat hem is rasterized on the same 64px grid.
function makePlayer(pose, frame) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d'), p = ACTOR_COLORS.player;
  const step = [0, 5, 0, -5][frame % 4];
  let body = { head:[33,13], angle:0, neck:[32,23], hip:[31,42], knees:[[27+step,51],[35-step,51]], feet:[[24+step,61],[38-step,61]], arm:[[25,27],[22-step*.35,37],[24-step*.5,44]], hem:12 };
  const poses = {
    crouch: { head:[38,36],neck:[35,44],hip:[29,51],knees:[[20,55],[42,54]],feet:[[23,62],[43,62]],arm:[[30,45],[25,50],[22,54]],hem:5 },
    jumpRise: { head:[36,12],angle:.08,neck:[34,23],hip:[30,39],knees:[[20,43],[42,43]],feet:[[17,54],[35,53]],arm:[[27,26],[22,34],[18,38]],hem:12 },
    jumpFall: { head:[32,13],angle:-.05,neck:[31,23],hip:[30,40],knees:[[24,49],[39,48]],feet:[[23,59],[42,58]],arm:[[25,27],[19,33],[17,39]],hem:13 },
    land: { head:[36,20],angle:.08,neck:[33,30],hip:[29,44],knees:[[19,53],[43,51]],feet:[[23,62],[45,62]],arm:[[27,32],[23,42],[27,48]],hem:9 },
    vaultPlant: { head:[40,15],angle:.25,neck:[36,26],hip:[28,41],knees:[[19,48],[42,39]],feet:[[18,61],[48,46]],arm:[[30,28],[36,36],[46,39]],hem:10 },
    vaultTuck: { head:[43,22],angle:.45,neck:[36,30],hip:[25,41],knees:[[35,41],[44,34]],feet:[[45,46],[56,37]],arm:[[30,31],[23,39],[27,48]],hem:11 },
    vaultClear: { head:[37,14],angle:.1,neck:[34,25],hip:[30,40],knees:[[40,47],[25,49]],feet:[[51,55],[24,61]],arm:[[28,28],[21,36],[18,42]],hem:11 },
    barrierPlant: { head:[40,18],angle:.35,neck:[35,29],hip:[24,41],knees:[[35,43],[18,49]],feet:[[48,48],[12,58]],arm:[[30,30],[38,38],[45,43]],hem:9 },
    barrierClear: { head:[37,26],angle:.65,neck:[30,35],hip:[20,44],knees:[[38,43],[39,36]],feet:[[55,43],[56,34]],arm:[[25,35],[21,43],[27,51]],hem:10 },
    barrierLand: { head:[38,19],angle:.12,neck:[34,30],hip:[29,44],knees:[[20,53],[41,50]],feet:[[23,62],[48,60]],arm:[[28,32],[24,43],[28,48]],hem:8 },
    dash: { head:[44,20],angle:.4,neck:[37,30],hip:[24,42],knees:[[14,47],[34,45]],feet:[[9,57],[22,55]],arm:[[30,32],[22,36],[14,36]],hem:11 },
  };
  if (poses[pose]) body = {...body, ...poses[pose]};
  if (pose === 'roll') {
    const rolls = [
      {head:[41,32],angle:.7,neck:[35,41],hip:[24,45],knees:[[18,54],[40,50]],feet:[[21,62],[47,59]],arm:[[30,40],[41,46],[46,52]],hem:9},
      {head:[43,47],angle:1.7,neck:[35,43],hip:[23,35],knees:[[19,27],[32,27]],feet:[[29,24],[43,33]],arm:[[33,43],[39,54],[32,58]],hem:9},
      {head:[23,49],angle:-1.8,neck:[28,42],hip:[41,38],knees:[[48,46],[40,53]],feet:[[51,57],[31,60]],arm:[[28,43],[19,53],[27,58]],hem:8},
      {head:[31,29],angle:-.2,neck:[32,39],hip:[33,48],knees:[[21,55],[42,54]],feet:[[22,62],[47,62]],arm:[[28,41],[22,49],[24,55]],hem:7},
    ];
    body = {...body, ...rolls[frame % 4]};
  }
  body.head = pose === 'roll' ? PLAYER_HEADS.roll[frame % 4] : PLAYER_HEADS[pose] || PLAYER_HEADS.stand;
  const poly = (points,color) => pixelPolygon(ctx,points,color);
  const limb = (a,b,width,color) => {
    const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy)||1,nx=-dy/len*width/2,ny=dx/len*width/2;
    poly([[a[0]+nx,a[1]+ny],[b[0]+nx,b[1]+ny],[b[0]-nx,b[1]-ny],[a[0]-nx,a[1]-ny]],color);
  };
  const chain = (points,width,color) => { for(let i=1;i<points.length;i++){limb(points[i-1],points[i],width+2,p.ink);limb(points[i-1],points[i],width,color);} };
  // The planted arm is drawn in world space so its hand can hold the actual
  // obstacle lip. Keeping it here as well would produce a third arm.
  if (!pose.endsWith('Plant')) chain(body.arm,4,p.dark);
  for (let side=0;side<2;side++) {
    const hip=[body.hip[0]+(side?3:-3),body.hip[1]];
    chain([hip,body.knees[side],body.feet[side]],side?5:4,side?p.coat:p.dark);
    pixelLine(ctx,body.knees[side][0],body.knees[side][1],body.feet[side][0],body.feet[side][1]-3,side?p.fold:p.dark);
    const foot=body.feet[side];ctx.fillStyle=p.ink;ctx.fillRect(Math.round(foot[0]-3),Math.round(foot[1]-1),10,4);
    ctx.fillStyle=side?p.edge:p.fold;ctx.fillRect(Math.round(foot[0]),Math.round(foot[1]-1),6,1);
  }
  const n=body.neck,h=body.hip,dx=h[0]-n[0],dy=h[1]-n[1],len=Math.hypot(dx,dy)||1;
  const side=[dy/len,-dx/len],down=[dx/len,dy/len];
  const point=(base,across,along=0)=>[base[0]+side[0]*across+down[0]*along,base[1]+side[1]*across+down[1]*along];
  const hem=[h[0]+down[0]*body.hem,h[1]+down[1]*body.hem];
  poly([point(n,-7),point(n,5),point(h,7),point(hem,7),point(hem,2,-3),point(h,0,2),point(hem,-5),point(hem,-9),point(h,-6)],p.ink);
  poly([point(n,-5,-1),point(n,4),point(h,5),point(hem,5,-2),point(hem,1,-4),point(h,-1,1),point(hem,-5,-2),point(hem,-7,-2),point(h,-4)],p.coat);
  poly([point(n,-4,2),point(h,-2),point(hem,-5,-3),point(hem,-7,-3)],p.dark);
  poly([point(n,2,3),point(h,3),point(hem,4,-3),point(h,5,-2)],p.fold);
  const lapel=point(n,-2,3),lapelEnd=point(n,-3,10);
  pixelLine(ctx,...point(n,-5),...lapel,p.edge);pixelLine(ctx,...lapel,...lapelEnd,p.fold);
  pixelLine(ctx,...point(n,1,2),...point(n,1,11),p.accent);
  pixelLine(ctx,...point(h,4,-2),...point(hem,5,-3),p.edge);
  ctx.fillStyle=p.metal;const button=point(h,0,-4);ctx.fillRect(Math.round(button[0]),Math.round(button[1]),1,1);
  // Face and fedora are redrawn at each joint angle, not rotated as a bitmap.
  const angle=body.angle||0,head=body.head,cos=Math.cos(angle),sin=Math.sin(angle);
  const hp=(x,y)=>[head[0]+x*cos-y*sin,head[1]+x*sin+y*cos];
  const face=(pts,color)=>poly(pts.map(([x,y])=>hp(x,y)),color);
  face([[-4,-4],[4,-4],[5,0],[8,2],[5,3],[4,8],[-3,7],[-6,2]],p.ink);
  face([[0,-2],[4,-2],[4,1],[7,2],[4,3],[3,6],[-1,6],[-1,1]],p.skin);
  pixelLine(ctx,...hp(1,0),...hp(5,0),p.dark);pixelLine(ctx,...hp(5,3),...hp(6,3),p.light);
  face([[-8,-10],[3,-10],[7,-6],[6,-2],[13,0],[13,2],[-12,2],[-12,0],[-7,-2]],p.ink);
  face([[-6,-8],[2,-8],[5,-5],[5,-2],[-7,-2]],p.coat);
  pixelLine(ctx,...hp(-6,-7),...hp(2,-7),p.fold);pixelLine(ctx,...hp(-6,-3),...hp(5,-3),p.dark);
  pixelLine(ctx,...hp(-10,0),...hp(10,0),p.fold);pixelLine(ctx,...hp(-9,0),...hp(-2,0),p.edge);
  if (pose==='roll' || pose.startsWith('vault') || pose.startsWith('barrier')) {
    const front = pose==='roll' ? [point(n,4,3),[body.head[0]+2,body.head[1]+6],point(n,0,8)] : [point(n,3,4),point(h,6,-2),point(h,8,5)];
    chain(front,4,p.coat);const hand=front[2];ctx.fillStyle=p.skin;ctx.fillRect(Math.round(hand[0]-1),Math.round(hand[1]-1),3,3);
  }
  return canvas;
}

function makeActor(type, pose = 'stand', frame = 0) {
  if (type === 'player') return makePlayer(pose, frame);
  const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const p = ACTOR_COLORS[type] || ACTOR_COLORS.pistol;
  const crouch = pose === 'crouch', vault = pose === 'vault';
  const shift = crouch ? 23 : vault ? 7 : 0, lean = crouch ? 5 : vault ? 8 : 0;
  const phase = [0, 3, 0, -3][frame % 4];
  const heavy = type === 'heavy', boss = type === 'boss', rusher = type === 'rusher';
  const coat = type === 'player' || boss || type === 'pistol';
  const rect = (x, y, w, h, color) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };
  const poly = (pts, color) => pixelPolygon(ctx, pts, color);
  const stroke = (x, y, xx, yy, color) => pixelLine(ctx, x, y, xx, yy, color);
  // Boots and two separately articulated trouser legs.
  if (crouch) {
    poly([[25, 49], [34, 50], [28, 57], [23, 60], [19, 59]], p.ink);
    poly([[31, 49], [39, 49], [44, 56], [41, 61], [34, 58]], p.dark);
    rect(19, 60, 14, 4, p.ink); rect(36, 60, 13, 4, p.ink);
    stroke(21, 60, 31, 60, p.fold); stroke(38, 60, 46, 60, p.fold);
    stroke(37, 51, 42, 56, p.fold);
  } else if (vault) {
    poly([[27, 42], [35, 42], [28, 53], [14, 55], [13, 50], [24, 47]], p.dark);
    poly([[35, 42], [42, 42], [47, 48], [45, 58], [39, 58], [38, 50]], p.coat);
    stroke(29, 45, 25, 50, p.fold); stroke(39, 46, 43, 49, p.edge);
    rect(10, 51, 7, 7, p.ink); rect(39, 57, 12, 5, p.ink);
    rect(42, 57, 8, 1, p.edge);
  } else {
    poly([[22, 42], [31, 43], [29 + phase, 60], [22 + phase, 60]], p.dark);
    poly([[32, 42], [41, 42], [40 - phase, 60], [33 - phase, 60]], p.coat);
    stroke(25, 45, 25 + phase, 58, p.fold); stroke(37, 46, 37 - phase, 59, p.fold);
    rect(20 + phase, 59, 11, 5, p.ink); rect(32 - phase, 59, 13, 5, p.ink);
    rect(22 + phase, 59, 7, 1, p.fold); rect(36 - phase, 59, 7, 1, p.edge);
    rect(21 + phase, 63, 9, 1, '#030609'); rect(33 - phase, 63, 11, 1, '#030609');
  }
  // Upper body: coat's split hem and long lapels stay readable against the road.
  ctx.save(); ctx.translate(lean, shift);
  const hem = crouch ? 32 : vault ? 37 : coat ? 52 : 46;
  const left = heavy ? 15 : boss ? 18 : 20, right = heavy ? 46 : boss ? 44 : 42;
  poly([[25, 20], [37, 20], [right, 25], [right + 2, hem - 2], [35, hem], [31, hem - 6], [27, hem], [left - 2, hem - 2], [left, 26]], p.ink);
  poly([[25, 22], [36, 22], [right - 1, 26], [right, hem - 3], [35, hem - 2], [31, hem - 8], [27, hem - 2], [left, hem - 3], [left + 2, 26]], p.coat);
  poly([[25, 24], [29, 27], [27, hem - 3], [21, hem - 4]], p.dark);
  poly([[35, 25], [39, 27], [40, hem - 4], [36, hem - 2], [33, 38]], p.fold);
  stroke(left + 2, 26, left, hem - 5, p.fold); stroke(right - 1, 27, right, hem - 6, p.edge);
  rect(31, 28, 1, Math.max(2, hem - 32), p.ink);
  if (coat) {
    poly([[26, 21], [31, 24], [29, 29], [26, 27], [28, 32], [24, 29]], p.edge);
    poly([[34, 21], [31, 25], [32, 31], [36, 26], [35, 24]], p.dark);
    rect(30, 25, 2, 11, p.accent); rect(31, 27, 1, 4, boss ? '#cf6b58' : '#9b5651');
    for (let i = 0; i < 3 && 33 + i * 5 < hem - 4; i++) rect(33, 33 + i * 5, 1, 1, p.metal);
    stroke(36, 37, 40, 36, p.ink); stroke(35, 38, 39, 37, p.edge);
    stroke(22, hem - 6, 27, hem - 7, p.fold);
    if (frame % 2 && !crouch && !vault) poly([[20, 39], [17, 48], [22, 51], [26, 43]], p.coat);
  } else {
    rect(23, 42, 17, 3, p.ink); rect(30, 42, 3, 2, p.metal);
    stroke(24, 27, 25, 40, p.fold); stroke(37, 28, 37, 39, p.dark);
  }
  // Rear arm is part of the sprite; the aiming arm is attached at runtime.
  poly([[left + 3, 25], [left - 1, 27], [left - 3, 38], [left, 43], [left + 4, 41], [left + 3, 37], [left + 5, 30]], p.ink);
  poly([[left + 2, 27], [left, 29], [left - 1, 37], [left + 1, 40], [left + 3, 39]], p.fold);
  rect(left, 40, 3, 4, p.dark); rect(left, 40, 1, 2, p.edge);
  if (type === 'shotgun') {
    for (let i = 0; i < 5; i++) { rect(25 + i * 2, 27 + i * 3, 3, 5, p.ink); rect(25 + i * 2, 27 + i * 3, 2, 3, p.accent); rect(25 + i * 2, 27 + i * 3, 2, 1, '#d7bc77'); }
  }
  if (type === 'smg') {
    rect(23, 29, 6, 7, p.dark); rect(23, 29, 6, 1, p.edge); rect(34, 29, 6, 7, p.dark); rect(34, 29, 6, 1, p.edge);
    rect(25, 31, 2, 1, p.metal); rect(36, 31, 2, 1, p.metal);
  }
  if (heavy) {
    rect(17, 25, 11, 10, p.dark); rect(17, 25, 11, 2, p.edge);
    rect(37, 25, 10, 10, p.dark); rect(37, 25, 10, 2, p.edge);
    poly([[25, 25], [38, 25], [41, 38], [35, 44], [24, 39]], p.fold);
    for (let i = 0; i < 3; i++) { rect(25, 29 + i * 5, 14, 3, p.dark); rect(26, 29 + i * 5, 12, 1, p.edge); }
    rect(29, 38, 6, 3, p.accent); rect(30, 38, 1, 3, '#e2bf77');
    rect(18, 29, 2, 1, p.metal); rect(44, 29, 2, 1, p.metal);
  }
  // A shadowed face with a single cheek edge; the protagonist never glows.
  rect(28, 16, 8, 8, p.ink); rect(30, 18, 5, 5, p.skin);
  poly([[27, 10], [36, 10], [38, 15], [40, 16], [38, 18], [37, 21], [30, 21], [27, 17]], p.ink);
  poly([[30, 12], [36, 12], [36, 15], [39, 16], [36, 18], [36, 20], [31, 19]], p.skin);
  rect(32, 13, 5, 2, p.dark); rect(35, 15, 2, 1, p.ink); rect(37, 16, 2, 1, p.light);
  rect(35, 18, 2, 1, p.light); rect(31, 18, 3, 2, p.dark);
  if (rusher) {
    poly([[27, 5], [35, 5], [40, 12], [40, 20], [36, 23], [26, 21], [23, 14]], p.ink);
    poly([[28, 7], [34, 7], [38, 12], [38, 18], [35, 20], [27, 18], [25, 13]], p.coat);
    rect(28, 13, 11, 5, p.dark); rect(33, 14, 5, 1, p.light); rect(27, 18, 10, 3, p.accent);
    stroke(26, 11, 28, 8, p.edge); stroke(36, 9, 38, 13, p.fold);
  } else if (heavy) {
    poly([[25, 5], [37, 5], [41, 10], [40, 18], [24, 18], [23, 10]], p.ink);
    poly([[26, 7], [36, 7], [39, 10], [38, 17], [26, 17], [25, 10]], p.fold);
    rect(25, 11, 15, 5, p.dark); rect(27, 12, 11, 2, p.accent); rect(28, 12, 4, 1, '#edc481');
    rect(27, 7, 9, 1, p.edge); rect(24, 16, 3, 5, p.dark);
  } else if (type === 'smg') {
    poly([[26, 8], [30, 5], [36, 6], [39, 10], [36, 12], [27, 12]], p.ink);
    rect(28, 7, 8, 2, p.dark); rect(29, 6, 5, 1, p.fold);
    rect(27, 10, 3, 6, p.dark); rect(30, 20, 6, 1, p.dark);
  } else if (type === 'shotgun') {
    poly([[26, 6], [36, 6], [39, 11], [40, 14], [25, 14], [24, 10]], p.ink);
    rect(27, 8, 10, 4, p.coat); rect(27, 7, 8, 1, p.edge); rect(25, 12, 16, 2, p.fold);
    rect(28, 11, 1, 1, p.metal); rect(32, 11, 1, 1, p.metal);
  } else {
    // Crooked fedora: stepped brim, pinched crown and worn one-pixel edge.
    poly([[25, 4], [36, 4], [39, 8], [38, 12], [44, 13], [44, 15], [19, 15], [19, 13], [24, 12]], p.ink);
    poly([[26, 5], [35, 5], [37, 8], [37, 12], [25, 12]], p.coat);
    rect(26, 6, 9, 1, p.fold); rect(25, 10, 13, 2, boss ? p.accent : p.dark);
    rect(20, 13, 22, 1, p.fold); rect(21, 13, 8, 1, p.edge); rect(38, 14, 5, 1, p.edge);
    rect(27, 7, 2, 2, p.dark); rect(35, 8, 1, 2, p.edge);
  }
  if (boss) { rect(38, 27, 3, 3, p.accent); rect(39, 27, 1, 1, '#e0af8c'); }
  ctx.restore();
  return canvas;
}

function makeGun(id) {
  const canvas = document.createElement('canvas'); canvas.width = 52; canvas.height = 20;
  const ctx = canvas.getContext('2d');
  const rect = (x, y, w, h, color) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };
  const ink = '#080b10', steel = '#596470', edge = '#adb5af', dark = '#29353e', wood = '#73503b';
  const length = { pistol: 21, revolver: 27, smg: 34, shotgun: 45, heavy: 39, boss: 38 }[id] || 21;
  if (id === 'shotgun') {
    pixelPolygon(ctx, [[1, 9], [11, 6], [15, 8], [14, 13], [4, 16], [1, 15]], ink);
    rect(3, 10, 11, 4, wood); rect(5, 10, 7, 1, '#a07a52');
    rect(11, 5, 34, 7, ink); rect(12, 6, 32, 2, steel); rect(12, 6, 32, 1, edge); rect(15, 9, 29, 1, dark);
    rect(19, 9, 11, 4, wood); for (let i = 21; i < 30; i += 3) rect(i, 10, 1, 3, '#3c2d28');
    rect(15, 12, 1, 3, steel); rect(15, 14, 4, 1, steel); rect(41, 4, 2, 1, edge);
  } else if (id === 'smg' || id === 'heavy' || id === 'boss') {
    rect(3, 6, length - 3, 7, ink); rect(5, 7, length - 5, 4, steel); rect(6, 7, length - 7, 1, edge);
    rect(1, 8, 6, 6, dark); rect(0, 7, 2, 9, ink); rect(7, 11, 4, 8, ink); rect(8, 12, 2, 6, wood);
    rect(17, 11, id === 'heavy' ? 8 : 5, 8, ink); rect(18, 12, id === 'heavy' ? 5 : 2, 6, dark);
    rect(12, 8, 8, 3, dark); rect(16, 9, 3, 1, '#d6caa5'); rect(8, 4, 3, 3, ink); rect(9, 4, 1, 1, edge);
    for (let x = 23; x < length - 3; x += 3) rect(x, 9, 1, 2, ink);
    rect(length - 3, 5, 2, 1, edge);
  } else if (id === 'revolver') {
    rect(10, 5, 17, 5, ink); rect(11, 6, 15, 2, steel); rect(11, 6, 15, 1, edge);
    rect(4, 6, 10, 7, ink); rect(5, 7, 8, 5, steel); rect(7, 7, 1, 4, edge); rect(10, 7, 1, 4, dark);
    pixelPolygon(ctx, [[4, 11], [10, 11], [7, 19], [1, 18]], ink); pixelPolygon(ctx, [[4, 12], [8, 12], [6, 17], [3, 17]], wood);
    rect(11, 12, 1, 4, steel); rect(8, 15, 4, 1, steel); rect(23, 4, 2, 1, edge); rect(3, 5, 2, 2, steel);
  } else {
    rect(2, 5, 19, 7, ink); rect(3, 6, 17, 4, steel); rect(4, 6, 16, 1, edge);
    rect(2, 11, 6, 8, ink); rect(3, 12, 4, 6, wood); rect(4, 13, 1, 4, dark);
    for (let x = 4; x < 9; x += 2) rect(x, 7, 1, 3, dark);
    rect(10, 10, 1, 5, dark); rect(7, 14, 4, 1, steel); rect(17, 4, 2, 1, edge);
  }
  return { canvas, length };
}

function sprite(ctx, rows, palette, x, y, dot = 4) {
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
    this.actors = new Map();
    this.guns = new Map();
    for (const type of Object.keys(ACTOR_COLORS)) for (const pose of (type === 'player' ? ['stand','crouch','jumpRise','jumpFall','land','roll','vaultPlant','vaultTuck','vaultClear','barrierPlant','barrierClear','barrierLand'] : ['stand','crouch','vault'])) {
      for (let frame = 0; frame < 4; frame++) this.actors.set(`${type}/${pose}/${frame}`, makeActor(type, pose, frame));
    }
    for (const id of ['pistol', 'revolver', 'smg', 'shotgun', 'heavy', 'boss']) this.guns.set(id, makeGun(id));
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
    drawScene(ctx, game, camera, this.time);
    ctx.save(); ctx.translate(-camera, 0);
    drawArrivals(ctx, game, camera, this.time, 'back');
    this.drawExit(game);
    for (const platform of game.room.platforms || []) this.drawPlatform(platform);
    for (const cover of game.room.covers || []) {
      if (cover.hp > 0 || !cover.destructible) this.drawCover(cover, game.room.theme);
    }
    for (const hazard of game.room.hazards || []) this.drawHazard(hazard);
    drawArrivals(ctx, game, camera, this.time, 'front');
    for (const pickup of game.pickups || []) this.drawPickup(pickup, game.player);
    for (const enemy of game.enemies || []) {
      if (!enemy.dead && enemy.hp > 0) this.drawEnemy(enemy, game);
    }
    if (game.player) this.drawPlayer(game.player, game);
    for (const bullet of game.bullets || []) this.drawBullet(bullet);
    for (const particle of game.particles || []) this.drawParticle(particle);
    ctx.restore();
    drawWeather(ctx, game, camera, this.time);
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
    const canvas = document.createElement('canvas'); canvas.width = WIDTH / 4; canvas.height = HEIGHT / 4;
    const ctx = canvas.getContext('2d');
    ctx.scale(1 / 4, 1 / 4); ctx.imageSmoothingEnabled = false;
    const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    sky.addColorStop(0, '#080e17'); sky.addColorStop(0.65, '#232c35'); sky.addColorStop(1, '#0a1017');
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
    ctx.drawImage(this.actors.get('player/stand/0'), 785, 334, 320, 320);
    ctx.save(); ctx.translate(955, 485); ctx.rotate(0.95); this.drawGun(ctx, 'revolver', 4); ctx.restore();
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
    // Sparse, stepped haze keeps the title's old-city silhouette pixel sharp.
    ctx.fillStyle = '#a2afba08';
    for (let i = 0; i < 4; i++) {
      const x = Math.floor((530 + Math.sin(this.time * .12 + i) * 120) / 4) * 4;
      ctx.fillRect(x, 592 + i * 16, 400, 4); ctx.fillRect(x + 32, 596 + i * 16, 300, 4);
    }
  }

  neonSign(ctx, x, y, text, width, height, vertical = false) {
    ctx.save();
    glow(ctx, x + width / 2, y + height / 2, width * 1.2, '#b83e3020');
    ctx.fillStyle = '#100f12'; ctx.fillRect(x - 4, y - 4, width + 8, height + 8);
    ctx.strokeStyle = '#bd4b42'; ctx.lineWidth = 4; ctx.strokeRect(x, y, width, height);
    const dot = 4, textWidth = (text.length * 4 - 1) * dot;
    for (let i = 0; i < text.length; i++) {
      sprite(ctx, LETTERS[text[i]] || [], { x: '#f28b76' }, Math.round((x + (width - textWidth) / 2) / dot) * dot + i * 4 * dot, Math.round((y + (height - 5 * dot) / 2) / dot) * dot, dot);
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
    if (c.kind === 'barricade') {
      ctx.save(); ctx.translate(Math.round(c.x), Math.round(c.y));
      ctx.fillStyle='#070d13';ctx.fillRect(-2,0,c.w+4,c.h);
      ctx.fillStyle='#495354';ctx.fillRect(1,2,c.w-2,c.h-2);
      ctx.fillStyle='#81908a';ctx.fillRect(-3,0,c.w+6,3);
      ctx.fillStyle='#1a272f';ctx.fillRect(4,6,c.w-8,c.h-10);
      for(let y=10;y<c.h-8;y+=15) {
        pixelPolygon(ctx,[[3,y],[c.w-3,y+9],[c.w-3,y+14],[3,y+5]],'#b59d64');
        ctx.fillStyle='#d1be8d';ctx.fillRect(3,y,3,2);
      }
      ctx.fillStyle='#333f43';ctx.fillRect(-9,c.h-4,c.w+18,4);
      ctx.fillStyle='#b1bcb0';ctx.fillRect(3,4,2,2);ctx.fillRect(c.w-5,4,2,2);
      ctx.restore();return;
    }
    if (c.kind === 'wire') {
      ctx.save();ctx.translate(Math.round(c.x),Math.round(c.y));
      ctx.fillStyle='#1b282e';ctx.fillRect(0,0,c.w,c.h);
      for(let i=-c.h;i<c.w;i+=12) {
        const start=Math.max(0,-i),end=Math.min(c.h,c.w-i);
        pixelLine(ctx,i+start,start,i+end,end,'#536465');
        pixelLine(ctx,c.w-i-start,start,c.w-i-end,end,'#354b53');
      }
      ctx.fillStyle='#81918a';ctx.fillRect(0,0,3,c.h);ctx.fillRect(c.w-3,0,3,c.h);ctx.fillRect(0,1,c.w,2);
      ctx.fillStyle='#554039';ctx.fillRect(4,4,9,9);ctx.fillStyle='#b39364';ctx.fillRect(7,5,2,5);ctx.fillRect(7,11,2,1);
      ctx.restore();label(ctx,'철조망 · 넘기 불가',c.x+c.w/2,c.y-16,10,'#bf9b7d');return;
    }
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

  drawHazard(h) {
    if(h.kind!=='wire') return;
    const ctx=this.ctx, y=Math.round(h.y+h.h*.6);
    ctx.save();
    pixelLine(ctx,h.x,y,h.x+h.w,y,'#89948b',2);
    pixelLine(ctx,h.x,y+3,h.x+h.w,y+3,'#34474e');
    for(let x=h.x+5;x<h.x+h.w-4;x+=11) {
      pixelLine(ctx,x-3,y-4,x+4,y+4,'#a3ada2');pixelLine(ctx,x-3,y+4,x+4,y-4,'#657a7b');
      ctx.fillStyle='#4c302b';ctx.fillRect(Math.round(x),y-1,2,2);
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
    const gun = this.guns.get(id) || this.guns.get('pistol');
    ctx.drawImage(gun.canvas, 0, -8);
    if (tint) {
      ctx.fillStyle = tint; ctx.fillRect(3, -3, Math.min(gun.length - 3, 10), 1);
    }
    if (muzzle) {
      ctx.globalAlpha *= Number(muzzle);
      sprite(ctx, ['.....o....', '..o.oYo...', 'ooYYYYYYoo', '..o.oYo...', '.....o....'],
        { o: '#dd9144', Y: '#ffebad' }, gun.length, -6, 2);
      ctx.fillStyle = '#fff8da'; ctx.fillRect(gun.length, -2, 5, 2);
    }
    ctx.restore();
  }

  actor(type, pose, frame) {
    return this.actors.get(`${type}/${pose}/${frame % 4}`) || this.actors.get('pistol/stand/0');
  }

  drawPlayer(p, game) {
    const ctx = this.ctx;
    const x = Math.round(p.x), y = Math.round(p.y);
    const aimDir = Math.cos(p.aim || 0) >= 0 ? 1 : -1;
    const { pose, frame, dir, vaultProgress } = getPlayerPose(p);
    const vaulting = p.vaultTime > 0 && p.vault;
    ctx.save(); ctx.translate(x, y);
    if (p.invuln > 0) ctx.globalAlpha = game.settings?.flash === 0 ? 0.72 : 0.64 + Math.sin(this.time * 48) * 0.15 * (game.settings?.flash ?? 0.5);
    ctx.fillStyle = '#02040999'; ctx.fillRect(-17, -2, 34, 4);
    ctx.save(); ctx.scale(dir, 1); ctx.drawImage(this.actor('player', pose, frame), -32, -64); ctx.restore();
    const weapon = p.weapons?.[p.weaponIndex], id = weapon?.id || 'pistol';
    if (vaulting && vaultProgress >= .24 && vaultProgress < .33 && Number.isFinite(p.vault.obstacleX)) {
      // The support hand stays on the same physical lip while knees lift.
      const lipX = dir > 0 ? p.vault.obstacleX + 3 : p.vault.obstacleX + p.vault.obstacleW - 3;
      const lipY = p.vault.obstacleY + 1;
      const sx = dir * 5, sy = -36, hx = lipX - x, hy = lipY - y;
      const ex = sx + (hx-sx)*.55 - dir*3, ey = sy + (hy-sy)*.46 + 5;
      pixelLine(ctx,sx-1,sy-1,ex,ey,'#060b11',6);pixelLine(ctx,ex,ey,hx-2,hy-2,'#060b11',6);
      pixelLine(ctx,sx,sy,ex,ey,'#263440',4);pixelLine(ctx,ex,ey,hx-1,hy-1,'#33414b',4);
      ctx.fillStyle='#ac9981';ctx.fillRect(Math.round(hx-3),Math.round(hy-1),6,2);
    }
    if (!vaulting && p.rollTime <= 0) {
      const recoil = Math.min((p.recoil || 0) / ({ pistol: 3, revolver: 7, smg: 2.3, shotgun: 9 }[id] || 3), 1);
      const origin = p.crouching ? 21 : pose==='land' ? 34 : 38;
      ctx.save(); ctx.translate(0, -origin); ctx.rotate(p.aim || 0);
      if (aimDir < 0) ctx.scale(1, -1);
      const hand = 13 - Math.round(recoil * 4);
      ctx.fillStyle = '#090f16'; ctx.fillRect(-3, 0, hand + 5, 6);
      ctx.fillStyle = '#263440'; ctx.fillRect(-2, 1, hand, 4);
      ctx.fillStyle = '#53616b'; ctx.fillRect(0, 1, hand - 1, 1);
      ctx.fillStyle = '#6b655e'; ctx.fillRect(hand, 1, 5, 3);
      ctx.fillStyle = '#aba08b'; ctx.fillRect(hand + 3, 1, 2, 1);
      ctx.translate(hand + 3, 0); this.drawGun(ctx, id, 1, p.muzzle > 0 ? (game.settings?.flash ?? 0.5) : 0);ctx.restore();
    } else {
      // Weapon stays close to the body while both hands/shoulders do the work.
      ctx.save();ctx.translate(dir*1,-25);ctx.scale(dir,1);ctx.rotate(.9);this.drawGun(ctx,id,.58);ctx.restore();
    }
    ctx.restore();
    if (p.upgrades?.dodgeShot && p.dodgeBuff > 0) glow(ctx, x, y - 36, 19, '#ecc36b25');
    if (weapon?.jammed) label(ctx, '총기 고장 · R 연타', x, y - (p.crouching ? 48 : 75), 12, '#e5a16f');
    else if (p.crouching) {
      ctx.fillStyle = '#a7b4a7'; ctx.fillRect(x - 4, y - 45, 8, 2); ctx.fillRect(x - 4, y - 43, 2, 3); ctx.fillRect(x + 2, y - 43, 2, 3);
    }
  }

  drawEnemyTell(e) {
    const ctx = this.ctx;
    const boss = e.type === 'boss', rusher = e.type === 'rusher';
    const aim = Number.isFinite(e.lockedAim) ? e.lockedAim : e.aim || 0;
    const y = e.y - (e.h || 58) * 0.65;
    const progress = Math.max(0, Math.min(1, 1 - e.timer / (e.windupTotal || 1)));
    ctx.save();
    ctx.globalAlpha = 0.38 + progress * 0.4;
    if (rusher && e.pattern === 'leap') {
      const direction = e.chargeDir || (Math.cos(aim) >= 0 ? 1 : -1);
      const length = 265, height = 122;
      // A broken arc distinguishes a jumping lunge from a ground charge.
      for (let i = 0; i < 18; i += 2) {
        const a = i / 18, b = (i + 1) / 18;
        pixelLine(ctx, e.x + direction * length * a, e.y - 10 - 4 * height * a * (1-a), e.x + direction * length * b, e.y - 10 - 4 * height * b * (1-b), '#f1aa73', 2);
      }
      const tip = e.x + direction * length;
      pixelLine(ctx, tip - direction * 14, e.y - 26, tip, e.y - 10, '#f1aa73', 2);
      pixelLine(ctx, tip, e.y - 10, tip - direction * 18, e.y - 10, '#f1aa73', 2);
      label(ctx, '도약 준비', e.x, e.y - (e.h || 58) - 24, 10, '#efb687');
    } else if (rusher || (boss && e.pattern === 'rush')) {
      const direction = boss ? (e.chargeDir || (Math.cos(aim) >= 0 ? 1 : -1)) : (Math.cos(aim) >= 0 ? 1 : -1);
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
        line(ctx, e.x, y, e.x + Math.cos(angle) * length, y + Math.sin(angle) * length, '#f59b6a', 2);
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

  drawEnemy(enemy, game) {
    const ctx = this.ctx;
    // Arrival actors walk from a real doorway, road edge or car before they
    // become combatants. Spawn protection stays in the simulation.
    const entering = enemy.spawnTime > 0;
    if (entering && !enemy.entry) { this.drawSpawnWarning(enemy); return; }
    if (entering && !enemy.entry.visible) return;
    const e = entering ? { ...enemy, x: enemy.entry.drawX ?? enemy.x, y: enemy.entry.drawY ?? enemy.y } : enemy;
    const boss = e.type === 'boss', heavy = e.type === 'heavy', rusher = e.type === 'rusher';
    const w = e.w || 30, h = e.h || 58;
    const scale = h / 58;
    const aim = e.aim || 0, dir = Math.cos(aim) >= 0 ? 1 : -1;
    const windup = !entering && e.state === 'windup';
    if (windup) this.drawEnemyTell(e);
    ctx.save(); ctx.translate(Math.round(e.x), Math.round(e.y)); ctx.scale(scale, scale);
    const moving = entering || Math.abs(e.vx || 0) > 5;
    const frame = moving ? Math.floor(this.time * 9 + (entering ? (e.entry.progress || 0) * 5 : e.x * .02)) % 4 : 0;
    ctx.fillStyle = '#02040999'; ctx.fillRect(-20, -3, 40, 5);
    ctx.save(); ctx.scale(dir, 1);
    const enemyPose = rusher && (!e.grounded || e.airDashTime > 0) ? 'vault' : 'stand';
    if(rusher && e.airDashTime > 0) { ctx.save();ctx.globalAlpha=.18;ctx.drawImage(this.actor(e.type,enemyPose,frame),-48,-64);ctx.restore(); }
    ctx.drawImage(this.actor(e.type, enemyPose, frame), -32, -64); ctx.restore();
    ctx.save(); ctx.translate(0, -37); ctx.rotate(aim); if (dir < 0) ctx.scale(1, -1);
    const palette = ACTOR_COLORS[e.type];
    ctx.fillStyle = palette.ink; ctx.fillRect(0, 0, 16, heavy ? 9 : 7);
    ctx.fillStyle = palette.coat; ctx.fillRect(0, 1, 14, heavy ? 6 : 4);
    ctx.fillStyle = palette.edge; ctx.fillRect(1, 1, 12, 1);
    ctx.fillStyle = palette.skin; ctx.fillRect(12, 1, 5, 3); ctx.translate(16, 0);
    if (rusher) {
      pixelPolygon(ctx, [[0, 3], [17, -8], [26, -12], [19, -4], [4, 5]], '#1b232a');
      pixelPolygon(ctx, [[5, 1], [19, -8], [25, -11], [19, -5], [7, 3]], '#b8c1b7');
      pixelLine(ctx, 7, 2, 22, -8, '#e3dfc5'); ctx.fillStyle = '#644438'; ctx.fillRect(-1, 2, 7, 4);
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
    pixelLine(ctx, px, py, x, y, enemy ? '#b54e46' : '#947346', enemy ? 2 : 1);
    ctx.fillStyle = enemy ? '#ad423c' : color;
    const r = enemy ? Math.max(3, b.radius || 3) : 2;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.fillStyle = enemy ? '#ffce93' : '#fff1bf'; ctx.fillRect(x - 1, y - 1, 2, 2);
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
      ctx.globalAlpha *= 0.3;
      const r = Math.ceil((p.size || 8) * (1.6 - ctx.globalAlpha) / 2) * 2;
      const x = Math.round(p.x / 2) * 2, y = Math.round(p.y / 2) * 2;
      ctx.fillRect(x - r, y - r / 2, r * 2, r); ctx.fillRect(x - r / 2, y - r, r, r * 2);
    } else if (p.type === 'blood') {
      ctx.fillRect(p.x, p.y, p.size || 3, p.size || 3);
    } else {
      pixelLine(ctx, p.x, p.y, p.x - (p.vx || 0) * 0.018, p.y - (p.vy || 0) * 0.018, p.color || '#f3c37a', Math.max(1, Math.round(p.size || 2)));
    }
    ctx.restore();
  }

  drawRain(camera = 0, opacity = 1) {
    const ctx = this.ctx, dot = 2;
    for (const drop of this.rain) {
      const y = Math.floor(((drop.y + this.time * drop.speed) % 800 - 40) / dot) * dot;
      const x = Math.floor(((((drop.x - this.time * 94 - camera * 0.15) % 1450 + 1450) % 1450) - 90) / dot) * dot;
      ctx.fillStyle = `rgba(149,178,197,${drop.alpha * opacity * 0.65})`;
      ctx.fillRect(x, y, dot, dot * 2);
      if (drop.length > 16) ctx.fillRect(x - dot, y + dot * 2, dot, dot * 2);
      if (y > 634 && y < 657) {
        ctx.fillRect(x - dot * 2, 648, dot, dot); ctx.fillRect(x + dot, 648, dot, dot);
      }
    }
  }

  drawCrosshair(game) {
    const mouse = game.input?.mouse;
    if (!mouse || !Number.isFinite(mouse.x) || !Number.isFinite(mouse.y)) return;
    const ctx = this.ctx, x = Math.round(mouse.x / DOT) * DOT, y = Math.round(mouse.y / DOT) * DOT;
    const gap = 8 + Math.round(Math.min(game.player?.recoil || 0, 1)) * DOT;
    ctx.save();
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      ctx.fillStyle = '#0c1117'; ctx.fillRect(x + dx * gap - 4, y + dy * gap - 4, 12, 12);
      ctx.fillStyle = '#eadbb3'; ctx.fillRect(x + dx * gap, y + dy * gap, 2, 2);
    }
    ctx.fillStyle = '#e7b964'; ctx.fillRect(x, y, 2, 2);
    ctx.restore();
  }
}
