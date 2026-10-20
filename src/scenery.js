// Pixel scenery is drawn in world units. The scene has a fixed 2 px detail grid;
// silhouettes use larger 4–8 px blocks, without gradients or blurred textures.
const W = 1280, FLOOR = 640;
const SNAP = n => Math.round(n / 2) * 2;
const fraction = n => { const a = Math.sin(n * 91.731 + 137.4) * 31917.437; return a - Math.floor(a); };
const SCENES = [
  ['비탈진 뒷골목', '01  /  OLD QUARTER'], ['붉은 잔 술집', '02  /  THE LAST CALL'],
  ['항구 적재장', '03  /  FREIGHT YARD'], ['새벽역 승강장', '04  /  DAWN STATION'],
  ['폐쇄 선로', '05  /  CLOSED LINE'], ['지하 정비구역', '06  /  MAINTENANCE'],
  ['본부 정문', '07  /  MORROW GATES'], ['장부 보관실', '08  /  LEDGER ARCHIVE'],
  ['장부의 주인', '09  /  PRIVATE DRIVE'],
];

function rect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(SNAP(x), SNAP(y), Math.max(2, SNAP(w)), Math.max(2, SNAP(h)));
}

function pixelLine(ctx, ax, ay, bx, by, color, size = 2) {
  const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) / size;
  ctx.fillStyle = color;
  for (let i = 0; i <= steps; i++) ctx.fillRect(SNAP(ax + (bx - ax) * i / (steps || 1)), SNAP(ay + (by - ay) * i / (steps || 1)), size, size);
}

function text(ctx, words, x, y, color = '#a99980', size = 12, align = 'left') {
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.font = `700 ${size}px "Courier New", "Malgun Gothic", monospace`;
  ctx.fillText(words, SNAP(x), SNAP(y));
}

const FONT = {
  A: ['01110','11011','11011','11111','11011','11011','11011'],
  B: ['11110','11011','11011','11110','11011','11011','11110'],
  C: ['01111','11000','11000','11000','11000','11000','01111'],
  D: ['11110','11011','11011','11011','11011','11011','11110'],
  E: ['11111','11000','11000','11110','11000','11000','11111'],
  F: ['11111','11000','11000','11110','11000','11000','11000'],
  G: ['01111','11000','11000','11011','11011','11011','01111'],
  H: ['11011','11011','11011','11111','11011','11011','11011'],
  I: ['11111','00100','00100','00100','00100','00100','11111'],
  K: ['11011','11010','11100','11100','11100','11010','11011'],
  L: ['11000','11000','11000','11000','11000','11000','11111'],
  M: ['10001','11011','11111','10101','10001','10001','10001'],
  N: ['11001','11001','11101','11111','11011','11011','11011'],
  O: ['01110','11011','11011','11011','11011','11011','01110'],
  P: ['11110','11011','11011','11110','11000','11000','11000'],
  R: ['11110','11011','11011','11110','11100','11010','11011'],
  S: ['01111','11000','11000','01110','00011','00011','11110'],
  T: ['11111','00100','00100','00100','00100','00100','00100'],
  U: ['11011','11011','11011','11011','11011','11011','01110'],
  V: ['10001','10001','10001','10001','11011','01010','00100'],
  W: ['10001','10001','10001','10101','11111','11011','10001'],
  Y: ['11011','11011','01010','00100','00100','00100','00100'],
  '0': ['01110','11011','11111','11011','11011','11011','01110'],
  '1': ['00100','01100','00100','00100','00100','00100','01110'],
  '2': ['01110','11011','00011','00110','01100','11000','11111'],
  '3': ['11110','00011','00011','01110','00011','00011','11110'],
  '4': ['11011','11011','11011','11111','00011','00011','00011'],
  '5': ['11111','11000','11000','11110','00011','00011','11110'],
  '6': ['01110','11000','11000','11110','11011','11011','01110'],
  '7': ['11111','00011','00011','00110','00110','01100','01100'],
  '8': ['01110','11011','11011','01110','11011','11011','01110'],
  '9': ['01110','11011','11011','01111','00011','00011','01110'],
};

function pixelText(ctx, words, x, y, dot = 3, color = '#ba5b4b') {
  ctx.fillStyle = color;
  for (let c = 0; c < words.length; c++) {
    const rows = FONT[words[c]];
    if (!rows) continue;
    rows.forEach((row, r) => {
      for (let col = 0; col < row.length; col++) if (row[col] === '1') ctx.fillRect(SNAP(x) + (c * 6 + col) * dot, SNAP(y) + r * dot, dot, dot);
    });
  }
}

function brick(ctx, x, y, w, h, seed = 0, color = '#192129') {
  rect(ctx, x, y, w, h, color);
  for (let row = 0; row < h / 24; row++) {
    const yy = y + row * 24;
    rect(ctx, x, yy, w, 2, '#0d151b');
    const shift = row % 2 ? 22 : 0;
    for (let col = 0; col < w / 46; col++) {
      const xx = x + col * 46 + shift;
      if (xx + 2 < x + w) rect(ctx, xx, yy, 2, 24, '#0c141a');
      if (fraction(seed + row * 31 + col) > .72 && xx + 28 < x + w) rect(ctx, xx + 6, yy + 7, 22, 2, '#293039');
    }
  }
}

function sky(ctx, camera, variant) {
  const colors = ['#05070c', '#080d14', '#0c121b', '#111a22', '#19232a'];
  for (let band = 0; band < colors.length; band++) {
    const y = band * 120;
    rect(ctx, -10, y, W + 20, 120, colors[band]);
    if (band) for (let x = 0; x < W; x += 12) rect(ctx, x, y + ((x / 12) % 2) * 4, 4, 4, colors[band - 1]);
  }
  for (let layer = 0; layer < 2; layer++) {
    const spacing = layer ? 118 : 91, speed = layer ? .19 : .07;
    const offset = camera * speed;
    for (let i = -2; i < 18; i++) {
      const k = i + variant * 17, x = i * spacing - offset % spacing;
      const height = 80 + fraction(k + 300 * layer) * (variant >= 6 ? 300 : 210);
      const y = 475 - height + layer * 55, width = spacing - 8;
      rect(ctx, x, y, width, 650 - y, layer ? '#101820' : '#131c25');
      if (i % 3 === 0) {
        rect(ctx, x + 22, y - 16, width - 40, 16, layer ? '#101820' : '#131c25');
        rect(ctx, x + 43, y - 54, 2, 38, '#1c2731');
      }
      for (let row = 0; row < height / 25; row++) for (let col = 0; col < width / 19 - 1; col++) {
        if (fraction(k * 17 + row * 11 + col) > .73) rect(ctx, x + 12 + col * 19, y + 14 + row * 25, 4, 8, layer ? '#71654b' : '#414a49');
      }
    }
  }
  // A few rectangular wisps remain discrete pixels, rather than a blur layer.
  rect(ctx, 0, 484, W, 36, '#172129');
}

function windowFrame(ctx, x, y, w = 48, h = 72, lit = false) {
  rect(ctx, x - 4, y - 4, w + 8, h + 8, '#080d13');
  rect(ctx, x, y, w, h, lit ? '#71634a' : '#1b2832');
  rect(ctx, x + 4, y + 4, w - 8, h - 8, lit ? '#9d8050' : '#20303a');
  rect(ctx, x + w / 2 - 2, y, 4, h, '#0c131a');
  rect(ctx, x, y + h * .48, w, 4, '#0c131a');
  rect(ctx, x - 6, y + h + 4, w + 12, 4, '#384249');
  if (lit) rect(ctx, x + 4, y + 4, 7, h - 8, '#534939');
}

function sign(ctx, x, y, word, dot = 4, color = '#c15c4b') {
  const width = word.length * dot * 6 + 24, height = dot * 7 + 24;
  rect(ctx, x - 4, y - 4, width + 8, height + 8, '#110d10');
  rect(ctx, x, y, width, height, '#3b2425');
  rect(ctx, x + 3, y + 3, width - 6, height - 6, '#120f14');
  rect(ctx, x + 8, y + height - 7, width - 16, 2, '#71362e');
  pixelText(ctx, word, x + 12, y + 11, dot, color);
}

function lamp(ctx, x, y = 315, height = 325) {
  rect(ctx, x + 28, y + 4, 8, height - 4, '#080e14');
  rect(ctx, x + 30, y + 8, 2, height - 8, '#28303a');
  rect(ctx, x - 10, y - 16, 46, 6, '#25313b');
  rect(ctx, x - 12, y - 10, 6, 12, '#25313b');
  rect(ctx, x - 24, y, 40, 10, '#0a1017');
  rect(ctx, x - 18, y + 10, 28, 4, '#c9a66a');
  // Stippled cone edges are deliberately sparse so enemies stay readable.
  ctx.save(); ctx.globalAlpha = .085;
  for (let row = 0; row < 12; row++) {
    const yy = y + 16 + row * 24, half = 16 + row * 8;
    rect(ctx, x - half, yy, half * 2, 24, row % 2 ? '#8d7951' : '#b5975f');
  }
  ctx.restore();
}

function wire(ctx, x, y, length, sag = 25) {
  let previous = [x, y];
  for (let i = 1; i <= 24; i++) {
    const next = [x + length * i / 24, y + Math.sin(i / 24 * Math.PI) * sag];
    pixelLine(ctx, ...previous, ...next, '#060b10', 2); previous = next;
  }
}

function alley(ctx, camera, variant) {
  const shift = camera * .68;
  if (variant === 0) {
    for (let i = 0; i < 7; i++) {
      const x = i * 420 - shift - 80, top = 170 + (i % 3) * 28;
      if (x < -430 || x > W + 40) continue;
      brick(ctx, x, top, 404, FLOOR - top, i * 11, i % 2 ? '#171e27' : '#1a2028');
      rect(ctx, x - 6, top - 12, 416, 12, '#080e15');
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) windowFrame(ctx, x + 28 + c * 92, top + 30 + r * 104, 44, 66, fraction(i * 31 + r * 4 + c) > .76);
      rect(ctx, x + 140, 529, 70, 111, '#080c11'); rect(ctx, x + 146, 535, 58, 105, '#26303a');
      rect(ctx, x + 193, 575, 4, 8, '#8a805e');
      if (i === 1 || i === 4) sign(ctx, x + 238, top + 128, 'HOTEL', 2);
      if (i % 2 === 0) {
        for (let floor = 0; floor < 3; floor++) {
          const y = top + 108 + floor * 104;
          rect(ctx, x + 34, y, 230, 6, '#060b10');
          for (let bar = 0; bar < 12; bar++) rect(ctx, x + 34 + bar * 20, y - 26, 2, 26, '#060b10');
          pixelLine(ctx, x + 185, y, x + 245, y + 100, '#2e3740', 4);
        }
      }
      wire(ctx, x, top - 24, 420, 34);
    }
  } else if (variant === 1) {
    const x = 40 - shift;
    brick(ctx, x, 230, 1280, 410, 14, '#221e25');
    rect(ctx, x - 10, 226, 1300, 14, '#070b11');
    sign(ctx, x + 360, 297, 'LAST CALL', 5, '#ce6354');
    text(ctx, '붉은 잔 · 오늘 밤이 마지막이다', x + 502, 379, '#9c7663', 13, 'center');
    for (let i = 0; i < 6; i++) {
      const xx = x + 82 + i * 192;
      windowFrame(ctx, xx, 424, 122, 126, i !== 3);
      for (let stripe = 0; stripe < 10; stripe++) rect(ctx, xx - 6 + stripe * 14, 402, 14, 26, stripe % 2 ? '#4b3330' : '#1b2025');
      rect(ctx, xx + 18, 484, 86, 4, '#342e28');
      for (let bottle = 0; bottle < 6; bottle++) {
        rect(ctx, xx + 20 + bottle * 13, 472, 6, 12, '#293c34');
        rect(ctx, xx + 22 + bottle * 13, 468, 2, 4, '#293c34');
      }
    }
    rect(ctx, x + 594, 430, 100, 210, '#0b0c11');
    rect(ctx, x + 604, 440, 80, 200, '#332b2b');
    windowFrame(ctx, x + 614, 456, 60, 76, false);
    rect(ctx, x + 669, 555, 4, 12, '#a38c62');
    for (let i = 0; i < 3; i++) { rect(ctx, x + 580 - i * 12, 622 + i * 6, 128 + i * 24, 6, '#34363b'); }
    // The far end of the bar gives way to a dark tenement, not another bar.
    brick(ctx, x + 1336, 160, 1300, 480, 33, '#151c25');
    for (let i = 0; i < 12; i++) windowFrame(ctx, x + 1370 + i * 100, 242 + (i % 2) * 130, 48, 82, i % 5 === 0);
    sign(ctx, x + 1800, 450, 'ROOMS', 3, '#9f8b63');
    wire(ctx, x, 218, 1260, 60);
  } else {
    for (let i = 0; i < 4; i++) {
      const x = i * 800 - shift - 80;
      rect(ctx, x, 320, 784, 320, '#1a2025');
      for (let n = 0; n < 30; n++) rect(ctx, x + n * 26, 326, 2, 314, '#26303a');
      for (let step = 0; step < 8; step++) rect(ctx, x + step * 28, 308 - step * 12, 784 - step * 56, 12, '#101820');
      rect(ctx, x + 110, 434, 226, 206, '#0a1016');
      for (let y = 440; y < 640; y += 14) rect(ctx, x + 118, y, 210, 4, '#29333b');
      sign(ctx, x + 460, 354, i ? 'FREIGHT' : 'DOCK 03', 3, '#a18b5d');
      for (let c = 0; c < 3; c++) {
        rect(ctx, x + 460 + c * 74, 552 - c * 30, 70, 88 + c * 30, '#292b28');
        rect(ctx, x + 466 + c * 74, 558 - c * 30, 58, 3, '#595347');
        pixelLine(ctx, x + 468 + c * 74, 632, x + 520 + c * 74, 566 - c * 30, '#151d21', 4);
      }
    }
    const tower = 1210 - camera * .36;
    for (let i = 0; i < 2; i++) { rect(ctx, tower + i * 110, 176, 8, 340, '#121921'); pixelLine(ctx, tower + 8, 220 + i * 130, tower + 112, 350 + i * 130, '#25303a', 4); }
    rect(ctx, tower - 12, 142, 142, 108, '#2c3033'); rect(ctx, tower - 20, 136, 158, 10, '#111921');
    for (let row = 0; row < 5; row++) rect(ctx, tower - 10, 154 + row * 18, 136, 2, '#41413b');
    pixelLine(ctx, 220 - camera * .32, 320, 220 - camera * .32, 90, '#222b32', 8);
    pixelLine(ctx, 220 - camera * .32, 90, 570 - camera * .32, 90, '#222b32', 8);
    pixelLine(ctx, 220 - camera * .32, 180, 420 - camera * .32, 90, '#171f28', 4);
    rect(ctx, 566 - camera * .32, 94, 2, 240, '#38424a');
  }
}

function tiles(ctx, camera) {
  rect(ctx, 0, 112, W, 528, '#152024');
  const offset = (camera * .57) % 56;
  for (let row = 0; row < 15; row++) {
    const y = 204 + row * 28;
    rect(ctx, 0, y, W, 2, '#0e171d');
    for (let col = -1; col < 25; col++) {
      const x = col * 56 - offset + (row % 2) * 28;
      rect(ctx, x, y, 2, 28, '#0d161b');
      if (fraction(row * 24 + col) > .94) rect(ctx, x + 4, y + 4, 18, 6, '#233133');
    }
  }
  rect(ctx, 0, 264, W, 12, '#473d30'); rect(ctx, 0, 280, W, 4, '#8b7448');
}

function station(ctx, camera, variant, time) {
  rect(ctx, 0, 0, W, FLOOR, '#060c12');
  const shift = camera * .62;
  if (variant === 3) {
    tiles(ctx, camera);
    const tunnel = 1470 - shift;
    rect(ctx, tunnel, 272, 416, 368, '#03070c');
    for (let step = 0; step < 7; step++) rect(ctx, tunnel + step * 22, 266 - step * 14, 416 - step * 44, 14, '#03070c');
    for (let i = 0; i < 8; i++) {
      const x = i * 410 - shift + 40;
      rect(ctx, x, 118, 24, 522, '#0a1117'); rect(ctx, x + 4, 126, 4, 510, '#364244');
      rect(ctx, x - 12, 112, 48, 16, '#354042');
      rect(ctx, x + 76, 178, 250, 38, '#091116');
      pixelText(ctx, i % 2 ? 'DAWN ST' : 'LINE 03', x + 92, 188, 2, '#aaad93');
      rect(ctx, x + 82, 138, 230, 4, '#777f6a'); rect(ctx, x + 82, 142, 230, 3, '#b4b69b');
      if (i % 3 === 0) {
        rect(ctx, x + 120, 333, 166, 142, '#081116'); rect(ctx, x + 126, 339, 154, 130, '#344044');
        for (let route = 0; route < 3; route++) {
          pixelLine(ctx, x + 140, 365 + route * 28, x + 260, 391 + route * 28, ['#9b6b56','#7d8768','#71818a'][route], 3);
          for (let dot = 0; dot < 4; dot++) rect(ctx, x + 144 + dot * 34, 365 + route * 28 + dot * 7, 5, 5, '#c4b99a');
        }
      } else {
        rect(ctx, x + 105, 549, 170, 10, '#574a36');
        rect(ctx, x + 120, 559, 6, 62, '#1e292f'); rect(ctx, x + 254, 559, 6, 62, '#1e292f');
      }
    }
  } else if (variant === 4) {
    // Empty train cars, structural ribs and the vanishing rail differentiate
    // the closed line from both the public platform and maintenance room.
    rect(ctx, 0, 180, W, 460, '#0d151c');
    for (let i = -1; i < 8; i++) {
      const x = i * 380 - shift % 380;
      rect(ctx, x, 142, 22, 498, '#212c34');
      for (let step = 0; step < 7; step++) rect(ctx, x + step * 30, 142 - step * 12, 30, 14, '#212c34');
      rect(ctx, x + 150, 112, 230, 8, '#212c34');
      for (let cable = 0; cable < 4; cable++) rect(ctx, x, 242 + cable * 14, 380, 3, '#303b41');
    }
    for (let i = 0; i < 5; i++) trainCar(ctx, i * 660 + 60 - shift, 605, 620, false, i % 3 === 0);
    const signal = 1050 - camera * .85;
    rect(ctx, signal, 268, 8, 372, '#28313a'); rect(ctx, signal - 14, 258, 36, 78, '#070c11');
    rect(ctx, signal - 4, 270, 16, 16, '#ba5546'); rect(ctx, signal - 4, 300, 16, 16, '#292b28');
  } else {
    rect(ctx, 0, 170, W, 470, '#171e23');
    for (let row = 0; row < 4; row++) {
      rect(ctx, 0, 218 + row * 34, W, 20, row % 2 ? '#3d403a' : '#2d373d');
      rect(ctx, 0, 221 + row * 34, W, 3, '#596052');
      for (let x = -shift % 190; x < W; x += 190) rect(ctx, x, 214 + row * 34, 10, 28, '#121b21');
    }
    for (let i = 0; i < 7; i++) {
      const x = i * 430 - shift + 40;
      rect(ctx, x, 386, 242, 254, '#0b131a'); rect(ctx, x + 6, 394, 230, 246, '#263136');
      if (i % 2 === 0) {
        for (let row = 0; row < 11; row++) rect(ctx, x + 22, 410 + row * 18, 198, 6, '#10191e');
        rect(ctx, x + 102, 411, 36, 210, '#343b3d');
        pixelText(ctx, 'VENT', x + 36, 368, 2, '#81907c');
      } else {
        for (let row = 0; row < 3; row++) {
          rect(ctx, x + 22, 418 + row * 66, 92, 40, '#0b1519');
          rect(ctx, x + 28, 424 + row * 66, 58, 3, '#547361');
          rect(ctx, x + 164, 426 + row * 66, 8, 8, row === 2 ? '#ba6e42' : '#6c8a65');
          rect(ctx, x + 190, 425 + row * 66, 12, 12, '#74775f');
        }
      }
      sign(ctx, x + 275, 424, i % 2 ? 'HIGH' : 'KEEP OUT', 2, '#ae8a55');
    }
    rect(ctx, 0, 150, W, 12, '#080e14');
    // A steady hazard beacon avoids flashing when the user disables flashes.
    for (let i = 0; i < 4; i++) rect(ctx, i * 520 - shift % 520 + 130, 168, 18, 8, '#b47645');
  }
}

function headquarters(ctx, camera, variant) {
  const shift = camera * .61;
  if (variant === 6) {
    const house = 670 - camera * .34;
    rect(ctx, house, 126, 890, 514, '#111921');
    for (let step = 0; step < 5; step++) rect(ctx, house + 80 + step * 36, 118 - step * 16, 730 - step * 72, 16, '#121b24');
    for (let row = 0; row < 4; row++) for (let col = 0; col < 10; col++) windowFrame(ctx, house + 36 + col * 85, 173 + row * 104, 34, 58, row === 1 && col % 4 === 2);
    for (let i = 0; i < 10; i++) {
      const x = i * 320 - shift - 60;
      rect(ctx, x, 414, 54, 226, '#2e3132'); rect(ctx, x - 6, 402, 66, 14, '#49473d');
      rect(ctx, x + 8, 424, 4, 216, '#4a4d46');
      for (let bar = 0; bar < 11; bar++) {
        const xx = x + 64 + bar * 24;
        rect(ctx, xx, 432, 4, 208, '#080f17'); pixelLine(ctx, xx - 2, 434, xx + 2, 424, '#35434a', 2);
      }
      rect(ctx, x + 54, 474, 266, 6, '#28343c'); rect(ctx, x + 54, 582, 266, 6, '#28343c');
      if (i === 2 || i === 6) sign(ctx, x + 86, 500, 'MORROW', 2, '#b19864');
    }
  } else if (variant === 7) {
    // A sealed archive, not another exterior facade: filing cabinets, ledgers,
    // suspended lamps and burnt paper make this leg of the route unmistakable.
    rect(ctx, 0, 120, W, 520, '#11191f');
    rect(ctx, 0, 134, W, 12, '#273035'); rect(ctx, 0, 340, W, 8, '#263131');
    for (let i = 0; i < 12; i++) {
      const xx = i * 270 - shift + 24;
      rect(ctx, xx - 12, 146, 8, 494, '#070e15'); rect(ctx, xx - 8, 146, 2, 494, '#404a45');
      rect(ctx, xx + 14, 230, 218, 370, '#0a1017');
      rect(ctx, xx + 20, 238, 206, 354, '#273035');
      if (i % 3 !== 1) {
        for (let row = 0; row < 4; row++) for (let col = 0; col < 2; col++) {
          const fx = xx + 28 + col * 96, fy = 250 + row * 82;
          rect(ctx, fx, fy, 86, 72, '#38413e'); rect(ctx, fx + 2, fy + 2, 82, 2, '#53594e');
          rect(ctx, fx + 26, fy + 18, 36, 12, '#152026'); rect(ctx, fx + 30, fy + 20, 28, 6, '#827e65');
          rect(ctx, fx + 26, fy + 42, 36, 5, '#999176'); rect(ctx, fx + 28, fy + 47, 32, 2, '#121b20');
        }
      } else {
        for (let row = 0; row < 5; row++) {
          const sy = 256 + row * 64;
          for (let book = 0; book < 13; book++) {
            const bx = xx + 29 + book * 14, bh = 34 + (book * 7 + row * 11) % 18;
            rect(ctx, bx, sy + 50 - bh, 11, bh, ['#69594a','#4b615a','#644546','#73705a'][book % 4]);
            rect(ctx, bx + 2, sy + 43, 7, 2, '#aea082');
          }
          rect(ctx, xx + 24, sy + 52, 198, 6, '#55584b');
        }
      }
      rect(ctx, xx + 58, 146, 2, 32, '#414846'); rect(ctx, xx + 173, 146, 2, 32, '#414846');
      rect(ctx, xx + 38, 178, 154, 8, '#565e55'); rect(ctx, xx + 42, 186, 146, 3, '#c3b887');
      if (i % 3 === 0) sign(ctx, xx + 56, 204, 'ARCHIVE', 2, '#a99b73');
      for (let paper = 0; paper < 6; paper++) {
        rect(ctx, xx + 15 + paper * 37, 622 + paper % 3 * 6, 14, 3, paper % 2 ? '#514e3f' : '#918872');
      }
    }
    const desk = 1130 - shift;
    rect(ctx, desk, 566, 280, 10, '#5e5142'); rect(ctx, desk + 12, 578, 10, 62, '#302d2a'); rect(ctx, desk + 252, 578, 10, 62, '#302d2a');
    rect(ctx, desk + 38, 552, 62, 14, '#a09578'); rect(ctx, desk + 42, 548, 53, 4, '#c3b492');
    rect(ctx, desk + 173, 528, 5, 38, '#777860'); rect(ctx, desk + 156, 520, 42, 10, '#516253');

  } else {
    const x = 600 - shift;
    rect(ctx, x, 120, 1200, 520, '#161d26');
    for (let i = 0; i < 11; i++) { rect(ctx, x + 60 + i * 104, 134, 14, 506, '#2d333b'); rect(ctx, x + 63 + i * 104, 144, 3, 494, '#474942'); }
    for (let i = 0; i < 10; i++) windowFrame(ctx, x + 83 + i * 104, 170, 50, 112, i === 4 || i === 5);
    rect(ctx, x + 278, 346, 650, 294, '#070c12');
    rect(ctx, x + 296, 362, 614, 278, '#26242a');
    for (let i = 0; i < 14; i++) rect(ctx, x + 304, 370 + i * 19, 598, 3, '#3b3335');
    sign(ctx, x + 402, 294, 'MORROW', 5, '#c39361');
    for (const side of [242, 946]) { rect(ctx, x + side, 382, 12, 240, '#673936'); rect(ctx, x + side + 4, 386, 3, 230, '#bc6956'); }
    // The red carpet ends at the private drive where the boss arrives.
    rect(ctx, x + 530, 617, 160, 23, '#342128');
    text(ctx, '회장 전용 · PRIVATE ENTRANCE', x + 610, 584, '#8e7165', 13, 'center');
    rect(ctx, x - 180, 354, 80, 286, '#1b2730'); rect(ctx, x - 168, 368, 56, 128, '#3d494c');
    rect(ctx, x - 162, 374, 44, 116, '#101c24');
    pixelText(ctx, '09', 110 - shift, 384, 8, '#7f7359');
  }
}

function floor(ctx, room, camera, variant, wet) {
  rect(ctx, 0, FLOOR, W, 80, '#0b1118');
  rect(ctx, 0, FLOOR, W, 3, room.theme === 'subway' ? '#9a8959' : '#5a6264');
  rect(ctx, 0, FLOOR + 4, W, 8, '#1a252d');
  const start = Math.floor(camera / 80) - 1;
  for (let i = start; i < start + 19; i++) {
    const x = i * 80 - camera;
    if (room.theme === 'subway') {
      rect(ctx, x + 6, 651, 48, 5, '#7a6e49');
      for (let dot = 0; dot < 7; dot++) rect(ctx, x + 8 + dot * 7, 659, 2, 2, '#625d45');
    } else if (variant >= 6) {
      rect(ctx, x, 666, 78, 2, '#263038'); rect(ctx, x, 648, 2, 58, '#1c2730');
    } else if (i % 3 === 0) rect(ctx, x, 691, 54, 4, '#625f4a');
    for (let n = 0; n < 7; n++) {
      const fx = x + fraction(i * 11 + n) * 78, fy = 667 + fraction(i * 23 + n) * 49;
      rect(ctx, fx, fy, 4 + fraction(i * 19 + n) * 14, 2, '#1b252e');
    }
    if (wet > .05 && i % 2 === 0) {
      rect(ctx, x + 2, 673, 54, 2, '#3e4544');
      rect(ctx, x + 14, 679, 40, 2, variant === 1 ? '#594037' : '#373f40');
    }
  }
  rect(ctx, 0, 714, W, 6, '#080d14');
}

function shelter(ctx, cover, camera) {
  const x = cover.x - camera, y = cover.y, w = cover.w, h = cover.h || 12;
  rect(ctx, x - 4, y - 8, w + 8, h + 8, '#0a121b');
  for (let stripe = 0; stripe < w / 20; stripe++) rect(ctx, x + stripe * 20, y - 4, Math.min(20, w - stripe * 20), h + 4, stripe % 2 ? '#324247' : '#493c36');
  rect(ctx, x - 4, y + h, w + 8, 4, '#697169');
  rect(ctx, x + 5, y + h + 4, 4, FLOOR - y - h - 4, '#1d2c34');
  rect(ctx, x + w - 9, y + h + 4, 4, FLOOR - y - h - 4, '#1d2c34');
  rect(ctx, x + 12, y - 27, 88, 17, '#111d24');
  text(ctx, '비 가림', x + 56, y - 18, '#8eada5', 11, 'center');
}

export function drawScene(ctx, game, camera = 0, time = 0) {
  const room = game.room || {}, variant = Math.max(0, Math.min(8, room.variant ?? room.index ?? 0));
  ctx.save(); ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  sky(ctx, camera, variant);
  if (variant < 3) alley(ctx, camera, variant);
  else if (variant < 6) station(ctx, camera, variant, time);
  else headquarters(ctx, camera, variant);
  const wet = game.weather?.intensity || 0;
  floor(ctx, room, camera, variant, wet);
  if (room.weatherAllowed) {
    const first = Math.floor(camera / 760);
    for (let i = first; i < first + 3; i++) lamp(ctx, 290 + i * 760 - camera, variant >= 6 ? 340 : 314, variant >= 6 ? 300 : 326);
  }
  for (const canopy of room.shelters || []) shelter(ctx, canopy, camera);
  // Route plaques are part of the environment and change in every room.
  const plaqueX = 72 - camera * .76;
  if (plaqueX > -390) {
    rect(ctx, plaqueX - 8, 442, 320, 78, '#070d15');
    rect(ctx, plaqueX - 8, 442, 4, 78, variant >= 6 ? '#9e5149' : '#8a7952');
    text(ctx, room.landmark?.subtitle || SCENES[variant][1], plaqueX + 8, 461, '#7b8789', 11);
    text(ctx, room.landmark?.name || SCENES[variant][0], plaqueX + 8, 491, '#b5b7aa', 20);
  }
  ctx.restore();
}

export function drawWeather(ctx, game, camera = 0, time = 0) {
  const room = game.room || {};
  const intensity = Math.max(0, Math.min(1, game.weather?.intensity || 0));
  if (room.theme === 'subway' || room.weatherAllowed === false || intensity <= .01) return;
  const shelters = room.shelters || [];
  ctx.save();
  const count = Math.round(240 * intensity);
  for (let i = 0; i < count; i++) {
    const speed = 430 + fraction(i + 500) * 330;
    const y = (fraction(i + 3) * 760 + time * speed) % 760 - 30;
    const x = ((fraction(i + 30) * 1440 - time * 115 - camera * .12) % 1440 + 1440) % 1440 - 80;
    const worldX = x + camera;
    if (shelters.some(s => worldX >= s.x && worldX <= s.x + s.w && y >= s.y)) continue;
    ctx.globalAlpha = (.14 + fraction(i + 12) * .22) * intensity;
    rect(ctx, x, y, 2, 6, '#9daeb8'); rect(ctx, x - 2, y + 6, 2, 6, '#778f9f');
    if (y > 636 && y < 661) {
      rect(ctx, x - 7, 650, 4, 2, '#91a3ad'); rect(ctx, x + 3, 650, 4, 2, '#91a3ad');
    }
  }
  ctx.restore();
}

function car(ctx, x, y, event, boss = false) {
  const dir = event.facing || -1, elapsed = event.elapsed || 0;
  const phase = event.phase || 'approach';
  const drift = boss && phase === 'approach';
  const shake = drift ? Math.sin(elapsed * 22) * 2 : 0;
  ctx.save(); ctx.translate(SNAP(x), SNAP(y)); ctx.scale(dir < 0 ? -1 : 1, 1);
  if (drift) ctx.transform(1, 0, (event.drift || 0) * 2, 1, 0, -Math.abs(event.drift || 0) * 18);
  if (boss) ctx.scale(1.14, 1.08);
  rect(ctx, -122, -4, 244, 8, '#020509');
  if (drift) {
    for (let i = 0; i < 15; i++) {
      const xx = -126 - i * 16, yy = -4 - (i % 4) * 6;
      rect(ctx, xx, yy, 24 + i % 3 * 8, 8, ['#36424a','#25303b','#1e2833'][i % 3]);
    }
    rect(ctx, -350, 2, 280, 3, '#010407'); rect(ctx, -350, -5, 270, 2, '#06090e');
  }
  ctx.translate(0, shake);
  // A compact 1960s sedan in 2px silhouettes: roof, quarter windows, chrome,
  // wheel wells, opened rear door and a warm headlight projection.
  rect(ctx, -114, -49, 232, 30, boss ? '#20242b' : '#283039');
  rect(ctx, -102, -57, 204, 10, boss ? '#34353a' : '#3c454b');
  rect(ctx, -75, -63, 146, 10, '#111a24');
  rect(ctx, -65, -73, 124, 12, '#2d343d');
  rect(ctx, -56, -83, 104, 12, '#3a3c3e');
  rect(ctx, -48, -89, 88, 8, '#4e4c44');
  rect(ctx, -45, -81, 37, 22, '#0b1622'); rect(ctx, 0, -81, 37, 22, '#14212c');
  pixelLine(ctx, 38, -79, 58, -59, '#56605d', 2);
  pixelLine(ctx, -47, -79, -65, -59, '#56605d', 2);
  rect(ctx, -47, -80, 37, 3, '#829087'); rect(ctx, 1, -80, 34, 3, '#78877d');
  rect(ctx, -106, -30, 218, 3, '#777d73');
  rect(ctx, -90, -49, 172, 2, '#58615f');
  rect(ctx, -49, -53, 2, 26, '#0b131d'); rect(ctx, 4, -54, 2, 27, '#0b131d'); rect(ctx, 58, -53, 2, 26, '#0b131d');
  rect(ctx, -18, -46, 10, 3, '#a1a18b'); rect(ctx, 35, -46, 10, 3, '#a1a18b');
  for (const wx of [-77, 73]) {
    rect(ctx, wx - 19, -27, 38, 23, '#03080e'); rect(ctx, wx - 14, -31, 28, 31, '#03080e');
    rect(ctx, wx - 9, -24, 18, 19, '#4a5150'); rect(ctx, wx - 4, -20, 8, 10, '#8a8e80');
  }
  rect(ctx, 105, -45, 10, 10, '#d5c28f'); rect(ctx, -114, -43, 6, 8, '#a84940');
  rect(ctx, 115, -25, 7, 8, '#8b8a7e'); rect(ctx, -120, -25, 8, 8, '#777c73');
  if (phase === 'approach' || phase === 'unload') {
    ctx.save(); ctx.globalAlpha = .055;
    for (let i = 0; i < 10; i++) rect(ctx, 120 + i * 14, -45 - i * 2, 14, 12 + i * 4, '#d4c391');
    ctx.restore();
  }
  if (event.doorOpen || phase === 'unload') {
    rect(ctx, -10, -60, 34, 48, '#070d15');
    rect(ctx, 19, -57, 10, 47, '#42494a'); rect(ctx, 29, -53, 12, 43, '#2c353b');
    rect(ctx, 22, -51, 15, 19, '#11212c'); rect(ctx, 37, -28, 4, 5, '#9fa18e');
  }
  if (boss) { rect(ctx, -114, -47, 18, 2, '#84503d'); rect(ctx, 83, -49, 18, 2, '#84503d'); }
  ctx.restore();
}

function trainCar(ctx, x, y, width = 520, doorOpen = false, dark = false) {
  rect(ctx, x, y - 224, width, 212, dark ? '#242b31' : '#303a3e');
  rect(ctx, x + 10, y - 232, width - 20, 10, '#59605b');
  rect(ctx, x, y - 68, width, 14, '#57413b'); rect(ctx, x, y - 50, width, 3, '#897c63');
  for (let i = 0; i < Math.floor((width - 120) / 100); i++) {
    const xx = x + 26 + i * 100;
    rect(ctx, xx, y - 204, 76, 100, '#070f18'); rect(ctx, xx + 5, y - 199, 66, 90, '#172a31');
    rect(ctx, xx + 6, y - 198, 60, 3, '#536665'); rect(ctx, xx + 10, y - 149, 54, 3, '#233b41');
  }
  const dx = x + width - 105;
  rect(ctx, dx, y - 214, 80, 192, '#111b23');
  if (doorOpen) {
    rect(ctx, dx + 8, y - 208, 64, 186, '#050a10'); rect(ctx, dx + 8, y - 24, 64, 3, '#a89b71');
  } else {
    rect(ctx, dx + 5, y - 208, 32, 180, '#3a4549'); rect(ctx, dx + 43, y - 208, 32, 180, '#3a4549');
    rect(ctx, dx + 10, y - 196, 22, 68, '#14232d'); rect(ctx, dx + 48, y - 196, 22, 68, '#14232d');
  }
  rect(ctx, x + 18, y - 12, width - 36, 12, '#080f16');
  for (const wx of [52, width - 72]) rect(ctx, x + wx, y - 4, 40, 10, '#060b11');
}

export function drawArrivals(ctx, game, camera = 0, time = 0) {
  ctx.save();
  for (const event of game.arrivals || []) {
    const x = event.x ?? event.toX ?? 0, y = event.y ?? FLOOR;
    if (x < camera - 760 || x > camera + W + 760) continue;
    if (event.kind === 'car' || event.kind === 'bossCar') {
      car(ctx, x, y, event, event.kind === 'bossCar');
      if (event.kind === 'bossCar' && event.phase === 'approach') text(ctx, '검은 차량 접근 · 회피 공간 확보', x, y - 126, '#d7ad7b', 14, 'center');
    } else if (event.kind === 'train') {
      trainCar(ctx, x - 220, y, 440, event.doorOpen || event.phase === 'unload');
      if (event.phase === 'approach') text(ctx, '회송 열차 진입', x, y - 252, '#cbb680', 12, 'center');
    } else if (event.kind === 'door') {
      rect(ctx, x - 37, y - 94, 74, 94, '#050b11');
      rect(ctx, x - 43, y - 100, 86, 6, '#596052');
      rect(ctx, x - 43, y - 100, 6, 100, '#384447'); rect(ctx, x + 37, y - 100, 6, 100, '#384447');
      const open = event.doorOpen || event.phase === 'unload';
      rect(ctx, x - 33, y - 90, open ? 16 : 66, 90, '#303838');
      if (!open) rect(ctx, x + 22, y - 45, 3, 8, '#b19a70');
      else rect(ctx, x - 24, y - 3, 56, 3, '#b39f71');
      rect(ctx, x - 23, y - 112, 46, 6, '#9f684b');
      if (event.phase === 'approach') text(ctx, '문 너머의 발소리', x, y - 130, '#b6aa8b', 11, 'center');
    } else if (event.kind === 'road') {
      const dir = event.facing || -1;
      rect(ctx, x - 36, y - 6, 72, 4, '#655749');
      for (let i = 0; i < 3; i++) {
        const xx = x + dir * (i * 18 - 18);
        pixelLine(ctx, xx - dir * 7, y - 14, xx, y - 8, '#ae956b', 2);
        pixelLine(ctx, xx, y - 8, xx - dir * 7, y - 2, '#ae956b', 2);
      }
      if (event.phase === 'approach') text(ctx, '도로에서 접근 중', x, y - 98, '#bbaa88', 11, 'center');
    }
  }
  ctx.restore();
}
