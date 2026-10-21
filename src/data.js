/** The entire arsenal and encounter catalogue is local and deterministic. */
export const WEAPONS = Object.freeze({
  pistol: { id: 'pistol', wear: 0.7, headMultiplier: 2, name: '밤의 약속', tag: '권총', damage: 24, interval: 0.22, spread: 0.022, pellets: 1, magazine: 12, reload: 0.9, speed: 1450, range: 1550, recoil: 3, color: '#ffd184', description: '12발 · 몸통 24 / 머리 48 · 발사 간격 0.22초 · 재장전 0.9초 · 사격당 내구도 −0.7' },
  revolver: { id: 'revolver', wear: 1.6, headMultiplier: 2, name: '여섯 번째 증언', tag: '리볼버', damage: 58, interval: 0.59, spread: 0.014, pellets: 1, magazine: 6, reload: 1.8, speed: 1650, range: 1750, recoil: 7, color: '#ffe1a0', description: '6발 · 몸통 58 / 머리 116 · 긴 사거리 · 사격당 내구도 −1.6' },
  smg: { id: 'smg', wear: 0.28, name: '빗줄기', tag: '기관단총', damage: 12, interval: 0.078, spread: 0.068, pellets: 1, magazine: 30, reload: 1.6, speed: 1320, range: 1200, recoil: 2.3, color: '#ffc76c', description: '30발 · 피해 12 · 헤드샷 추가 피해 없음 · 연속 사격 시 탄 퍼짐 증가 · 사격당 내구도 −0.28' },
  shotgun: { id: 'shotgun', wear: 1.9, name: '문을 두드리는 자', tag: '산탄총', damage: 15, interval: 0.83, spread: 0.16, pellets: 7, magazine: 5, reload: 1.75, speed: 1200, range: 750, recoil: 9, color: '#ffb97c', description: '5발 · 산탄 7개 × 피해 15 · 헤드샷 추가 피해 없음 · 거리에 따라 피해 감소 · 사격당 내구도 −1.9' },
});

export const UPGRADES = Object.freeze([
  { id: 'dodgeShot', name: '구른 뒤의 한 발', description: '회피 후 1.2초 안의 다음 사격 피해 +45%. 중첩당 +45%, 최대 2중첩 (+90%). 산탄 전체 적용.', maxStacks: 2, icon: '↗', category: '회피 · 사격' },
  { id: 'lastRound', name: '마지막 진술', description: '탄창 마지막 사격 피해 +45%. 중첩당 +45%, 최대 2중첩 (+90%).', maxStacks: 2, icon: 'Ⅰ', category: '탄창 · 사격' },
  { id: 'quickReload', name: '침착한 손놀림', description: '처치 후 4초 동안 재장전 시간 −20%. 중첩당 −20%, 최대 2중첩 (−40%). 처치 시 지속시간 갱신.', maxStacks: 2, icon: '↻', category: '처치 · 재장전' },
  { id: 'pierce', name: '관통 증거', description: '탄환이 적 1명을 추가 관통. 최대 2중첩 (추가 2명). 벽과 엄폐물은 관통하지 않음.', maxStacks: 2, icon: '→', category: '탄환 · 관통' },
  { id: 'slowFocus', name: '고요한 방아쇠', description: '슬로모션 중 탄 퍼짐 −35%. 중첩당 −35%, 최대 2중첩 (−70%).', maxStacks: 2, icon: '◎', category: '집중 · 정밀' },
  { id: 'swapFrenzy', name: '두 번째 대답', description: '무기 교체 직후 2초 동안 발사 간격 −25% (연사력 +33%). 중첩 불가.', maxStacks: 1, icon: '⇄', category: '교체 · 연사' },
  { id: 'closeRange', name: '위험한 거리', description: '300px 이내의 적에게 피해 +25%. 중첩당 +25%, 최대 2중첩 (+50%).', maxStacks: 2, icon: '◈', category: '근접 · 사격' },
  { id: 'vitality', name: '죽기에는 이른 밤', description: '최대 체력 +25, 즉시 체력 25 회복. 중첩당 동일, 최대 3중첩 (최대 체력 +75).', maxStacks: 3, icon: '+', category: '생존 · 체력' },
  { id: 'extendedMag', name: '주머니 속 탄창', description: '기본 탄창 크기 +25% (올림). 중첩당 +25%, 최대 2중첩 (+50%).', maxStacks: 2, icon: '▥', category: '탄창 · 지속 사격' },
  { id: 'heavyRounds', name: '무거운 납', description: '모든 총기 피해 +15%. 중첩당 +15%, 최대 3중첩 (+45%).', maxStacks: 3, icon: '◆', category: '탄환 · 피해' },
  { id: 'slowHarvest', name: '빼앗은 시간', description: '적 처치 시 슬로모션 게이지 추가 +8. 중첩당 +8, 최대 2중첩 (추가 +16).', maxStacks: 2, icon: '◷', category: '처치 · 집중' },
  { id: 'secondWind', name: '멎지 않는 숨', description: '슬로모션 게이지 소모 −20%. 중첩당 −20%, 최대 2중첩 (−40%).', maxStacks: 2, icon: '≈', category: '집중 · 지속' },
  { id: 'quickFeet', name: '젖은 구두', description: '이동 속도 +10%, 회피 대기시간 −15%. 최대 2중첩 (속도 +20%, 대기 −30%).', maxStacks: 2, icon: '»', category: '이동 · 회피' },
  { id: 'bloodHeal', name: '살아남은 대가', description: '적 처치 시 체력 2 회복. 중첩당 +2, 최대 3중첩 (체력 6). 최대 체력 초과 불가.', maxStacks: 3, icon: '♥', category: '처치 · 회복' },
]);

export const ZONES = Object.freeze([
  { id: 'alley', name: '뒷골목', subtitle: '01 / 비가 지우지 못한 것', story: '배신의 밤. 장부는 마지막으로 이 골목에서 목격됐다.', color: '#c14c43' },
  { id: 'subway', name: '지하철', subtitle: '02 / 막차는 오지 않는다', story: '끊긴 선로 아래로, 조직의 돈과 이름이 흘렀다.', color: '#d3ac6e' },
  { id: 'hq', name: '조직 본부', subtitle: '03 / 모든 이름의 주인', story: '장부의 마지막 페이지. 내 이름 옆에 그의 서명이 있다.', color: '#c95c56' },
]);

export const ENEMY_TYPES = Object.freeze({
  pistol: { name: '골목 사수', hp: 64, w: 29, h: 54, speed: 76, damage: 10, range: 940, interval: 1.45, windup: 0.56, color: '#df8d7a' },
  smg: { name: '기관단총 사수', hp: 86, w: 31, h: 57, speed: 62, damage: 7, range: 1020, interval: 2.3, windup: 0.7, color: '#d8a86d' },
  shotgun: { name: '산탄총 집행자', hp: 112, w: 34, h: 58, speed: 114, damage: 7, range: 370, interval: 2.0, windup: 0.8, color: '#d27c5c' },
  rusher: { name: '칼잡이', hp: 58, w: 26, h: 53, speed: 210, damage: 17, range: 420, interval: 1.75, windup: 0.6, color: '#c3c1b3' },
  heavy: { name: '중장갑 경호원', hp: 190, w: 42, h: 67, speed: 42, damage: 19, range: 1150, interval: 2.9, windup: 1.1, color: '#b3a294' },
  boss: { name: '회장 · 백야', hp: 2100, w: 48, h: 78, speed: 102, damage: 12, range: 1500, interval: 2.5, windup: 1.15, color: '#e76660' },
});

// All geometry is assembled from validated ledges. Top surfaces are at most
// 115px apart vertically; the ground route and the exit are always continuous.
// Three arrangements per district: 9 independent templates, each with small
// deterministic variations and enemy composition chosen from the run's RNG.
const TEMPLATES = [
  { name: '젖은 네온 골목', platforms: [[680, 530, 360], [1190, 450, 300], [1690, 530, 380]], covers: [[500, 52, 44], [1080, 66, 54], [2110, 62, 44]], story: '“장부를 찾으면, 누가 널 팔았는지 알게 될 거야.”' },
  { name: '닫힌 술집 뒤편', platforms: [[620, 530, 310], [960, 420, 320], [1550, 530, 460], [2070, 420, 260]], covers: [[470, 66, 50], [1320, 60, 48], [2300, 66, 50]], story: '술잔은 아직 따뜻했다. 사람들은 모두 사라졌다.' },
  { name: '불 꺼진 하역장', platforms: [[720, 535, 520], [1320, 430, 360], [1810, 535, 470]], covers: [[550, 74, 54], [1410, 62, 48], [2180, 68, 50]], story: '검은 차 한 대. 피 묻은 운송장 한 장.' },
  { name: '폐쇄된 승강장', platforms: [[650, 530, 430], [1210, 425, 400], [1740, 530, 500]], covers: [[510, 60, 48], [1110, 64, 56], [2240, 70, 52]], story: '막차 안내방송은 몇 년째 같은 거짓말을 했다.' },
  { name: '급행선 정비 통로', platforms: [[700, 535, 300], [1060, 425, 340], [1510, 530, 360], [2020, 425, 390]], covers: [[510, 72, 58], [1410, 60, 48], [2280, 66, 52]], story: '철로 위의 돈다발. 이름 없는 거래는 없었다.' },
  { name: '버려진 환승역', platforms: [[620, 530, 440], [1150, 420, 520], [1840, 530, 490]], covers: [[480, 68, 52], [1200, 62, 50], [2370, 70, 52]], story: '구겨진 장부 조각에 본부의 주소가 남아 있었다.' },
  { name: '본부 로비', platforms: [[690, 530, 440], [1280, 425, 340], [1760, 530, 510]], covers: [[510, 78, 55], [1180, 68, 52], [2300, 78, 55]], story: '대리석에 비친 얼굴은 더 이상 도망자의 것이 아니었다.' },
  { name: '회계실 복도', platforms: [[650, 530, 330], [1060, 420, 430], [1600, 530, 360], [2100, 420, 320]], covers: [[510, 70, 52], [1390, 68, 54], [2340, 74, 54]], story: '불태운 종이 냄새. 그들은 진실보다 늦었다.' },
  { name: '새벽을 등진 집무실', platforms: [[680, 530, 430], [1260, 425, 390], [1800, 530, 440]], covers: [[510, 76, 52], [1150, 66, 52], [2290, 76, 52]], story: '“네 이름도 장부에 있다.” 그는 총을 내려놓지 않았다.' },
];

// The combat layout varies by seed, while each address has its own identity.
// This gives the nine rooms a readable journey instead of repeating one block.
const DISTRICTS = [
  { id: 'neon-alley', name: '1번가 · 붉은 네온 골목', subtitle: 'NIGHT MARKET · 01', story: '술집의 뒷문으로 검은 차가 들어갔다. 헤드라이트를 따라간다.', outdoors: true },
  { id: 'bar-backroom', name: '정든 술집 · 뒷문', subtitle: 'THE LAST GLASS · 02', story: '빈 술잔 사이의 쪽지. “장부는 하역장으로.”', outdoors: true },
  { id: 'freight-yard', name: '동부 하역장 · 7번 창고', subtitle: 'EAST FREIGHT · 03', story: '운송장에 찍힌 목적지. 폐쇄된 새벽역.', outdoors: true },
  { id: 'last-platform', name: '새벽역 · 1번 승강장', subtitle: 'PLATFORM 01 · 04', story: '막차 대신 조직의 전동차가 들어온다.', outdoors: false },
  { id: 'service-tunnel', name: '급행선 · 정비 터널', subtitle: 'SERVICE TUNNEL · 05', story: '전깃불이 끝나는 곳에, 다음 문이 있다.', outdoors: false },
  { id: 'transfer-hall', name: '폐쇄 환승역 · 북쪽 출구', subtitle: 'NORTH TRANSFER · 06', story: '구겨진 장부 조각. 본부의 출입 암호가 남아 있다.', outdoors: false },
  { id: 'headquarters-court', name: '백야 본부 · 정문 광장', subtitle: 'WHITE NIGHT HQ · 07', story: '철문 너머 경호차의 불빛. 돌아갈 길은 닫혔다.', outdoors: true },
  { id: 'ledger-archive', name: '본부 회계동 · 장부 보관실', subtitle: 'LEDGER ARCHIVE · 08', story: '불타는 서류 사이에서 내 이름을 찾았다. 회장은 옥상 마당에 있다.', outdoors: false },
  { id: 'dawn-courtyard', name: '마지막 마당 · 회장 백야', subtitle: 'FINAL CONFRONTATION · 09', story: '타이어가 젖은 돌바닥을 긁는다. 검은 차에서 마지막 증인이 내린다.', outdoors: true },
];

const choose = (rng, values) => values[Math.min(values.length - 1, Math.floor(rng() * values.length))];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function generateRoom(rng, index) {
  index = clamp(Math.floor(index), 0, 8);
  const zoneIndex = Math.floor(index / 3);
  const zone = ZONES[zoneIndex];
  const boss = index === 8;
  const templateIndex = boss ? 8 : zoneIndex * 3 + Math.min(2, Math.floor(rng() * 3));
  const template = TEMPLATES[templateIndex];
  const district = DISTRICTS[index];
  const width = 2800;
  // A shared horizontal offset preserves all platform reachability relations.
  const offset = boss ? 0 : Math.floor((rng() - 0.5) * 90);
  const platforms = template.platforms.map(([x, y, w]) => ({ x: x + offset, y, w, h: 17, oneWay: true }));
  const covers = template.covers.map(([x, w, h], coverIndex) => {
    const destructible = coverIndex !== 0 || rng() > 0.6;
    return { x: x + offset, y: 640 - h, w, h, hp: 95 + zoneIndex * 25, maxHp: 95 + zoneIndex * 25,
      kind: destructible ? 'crate' : 'metal', vaultable: true, destructible };
  });
  // The first thin barricade teaches the dedicated hand-plant vault before the
  // first firefight. Its landing space is clear of the first existing crate.
  const barricadeHeight = index % 2 ? 72 : 68;
  covers.push({ kind: 'barricade', x: 390 + offset, y: 640 - barricadeHeight,
    w: 22, h: barricadeHeight, hp: 999999, maxHp: 999999, destructible: false, vaultable: true });
  const wire = { kind: 'wire', x: 1730 + offset, y: 578, w: 52, h: 62,
    hp: 999999, maxHp: 999999, destructible: false, vaultable: false };
  covers.push(wire);
  const hazards = [{ kind: 'wire', x: wire.x - 4, y: wire.y - 8, w: wire.w + 8,
    h: 10, damage: 3, interval: 0.5, attachedTo: 'fence' }];
  // Short, isolated strips can always be jumped. Keep them away from the start,
  // exit and obstacle landing zones; an enemy may never arrive on the barbs.
  const stripOptions = [850, 1030, 1530, 1970, 2470].map(x => x + offset).filter(x =>
    (!boss || Math.abs(x + 60 - 900) > 220) &&
    covers.every(c => x + 120 + 56 <= c.x || x - 56 >= c.x + c.w));
  if (stripOptions.length) hazards.push({ kind: 'wire', x: choose(rng, stripOptions), y: 630,
    w: 120, h: 10, damage: 3, interval: 0.5, attachedTo: 'ground' });
  const spawnPoints = [];
  // Places a combatant only on a supported surface, away from the entrance,
  // covers, exit, and every other actor. Final room reserves its centre for boss.
  const blocked = (x, y, w = 46, h = 78) =>
    covers.some(c => x + w / 2 > c.x - 12 && x - w / 2 < c.x + c.w + 12 && y > c.y && y - h < c.y + c.h) ||
    hazards.some(c => x + w / 2 > c.x - 12 && x - w / 2 < c.x + c.w + 12 && y > c.y && y - h < c.y + c.h);
  const candidates = [];
  for (let x = 770; x <= width - 350; x += 145) {
    const px = x + Math.floor((rng() - 0.5) * 42);
    if (!blocked(px, 640) && (!boss || Math.abs(px - 900) > 180)) candidates.push({ x: px, y: 640 });
  }
  for (const p of platforms) {
    for (let x = p.x + 75; x < p.x + p.w - 35; x += 175) {
      if (x >= 730 && !blocked(x, p.y) && (!boss || Math.abs(x - 900) > 180)) candidates.push({ x, y: p.y });
    }
  }
  // Fisher–Yates avoids dependence on unstable Array.sort(random).
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const pools = [
    ['pistol', 'pistol', 'smg', 'rusher', 'shotgun'],
    ['pistol', 'smg', 'smg', 'rusher', 'shotgun', 'heavy'],
    ['smg', 'shotgun', 'rusher', 'heavy', 'heavy', 'pistol'],
  ];
  const count = boss ? 4 : 4 + zoneIndex;
  if (!boss) {
    const firstArrival = candidates.filter(p => p.y === 640).sort((a, b) => a.x - b.x)[0];
    if (firstArrival) spawnPoints.push({ ...firstArrival, type: 'pistol' });
  }
  for (const point of candidates) {
    if (spawnPoints.length >= count) break;
    if (spawnPoints.some(s => Math.abs(s.x - point.x) < 90 && Math.abs(s.y - point.y) < 90)) continue;
    const type = choose(rng, pools[zoneIndex]);
    spawnPoints.push({ ...point, type });
  }
  // Enemy types are introduced predictably; positions remain seed dependent.
  if (!boss && spawnPoints.length) spawnPoints[0].type = ['pistol', 'smg', 'shotgun', 'rusher', 'heavy', 'heavy', 'smg', 'heavy'][index];
  if (boss) spawnPoints.push({ x: 900, y: 640, type: 'boss' });
  return {
    index, width, height: 720, theme: zone.id, name: district.name, story: district.story,
    variant: index, layoutName: template.name,
    landmark: { id: district.id, name: district.name, subtitle: district.subtitle },
    weatherAllowed: district.outdoors,
    shelters: [],
    platforms, covers, hazards, exit: { x: width - 135, y: 640 }, spawnPoints,
    weaponDrop: choose(rng, ['revolver', 'smg', 'shotgun', 'pistol']),
    cleared: false, boss,
  };
}
