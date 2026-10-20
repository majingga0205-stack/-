import { WEAPONS, UPGRADES, ZONES } from './data.js';

const DEFAULT_SETTINGS = Object.freeze({ music: 0.3, sfx: 0.65, shake: 0.55, flash: 0.4 });
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const timeLabel = time => `${String(Math.floor(time / 60)).padStart(2, '0')}:${String(Math.floor(time % 60)).padStart(2, '0')}`;
const stackLabel = (count, max) => max === 1 ? (count ? '보유 중 · 중첩 불가' : '중첩 불가') : `${count} / ${max} 중첩`;

/** DOM overlays are rebuilt only when their content changes; HUD values are cached. */
export class GameUI {
  constructor(game) {
    this.game = game;
    this.panel = null;
    this.resumeOnClose = false;
    this.panelTrigger = null;
    this.lastMode = null;
    this.rewardSignature = '';
    this.seenRoom = null;
    this.roomEnteredTime = 0;
    this.cache = new Map();
    this.nodes = new Map();
    for (const node of document.querySelectorAll('[id]')) this.nodes.set(node.id, node);
    this.node('game-canvas').tabIndex = 0;
    // Keep keycaps stable while numerical values update during gameplay.
    this.node('dodge-status').innerHTML = '<span class="dodge-glyph" aria-hidden="true">↠</span> <span id="dodge-text">회피 준비</span> <kbd>Shift</kbd>';
    this.node('reload-status').innerHTML = '<kbd>R</kbd> <span id="reload-text">재장전</span>';
    this.node('secondary-weapon').innerHTML = '<kbd>Q</kbd> <span id="secondary-text">보조 무기 없음</span>';
    for (const id of ['dodge-text', 'reload-text', 'secondary-text']) this.nodes.set(id, document.getElementById(id));
    document.addEventListener('click', event => this.onClick(event));
    document.addEventListener('input', event => this.onSetting(event));
    document.addEventListener('keydown', event => this.onKey(event));
    document.addEventListener('pointerdown', event => {
      if (event.target.closest('button, a, input, .screen-overlay')) {
        game.input.mouse.left = false;
        game.input.mouse.right = false;
      }
    });
    this.update();
  }

  node(id) { return this.nodes.get(id); }
  text(id, value) {
    value = String(value);
    if (this.cache.get(id) !== value) { this.node(id).textContent = value; this.cache.set(id, value); }
  }
  visible(id, visible) { const node = this.node(id); if (node.hidden === visible) node.hidden = !visible; }
  fill(id, ratio) {
    const value = `${Math.round(clamp(ratio || 0, 0, 1) * 1000) / 10}%`;
    if (this.cache.get(`${id}:width`) !== value) { this.node(id).style.width = value; this.cache.set(`${id}:width`, value); }
  }
  focusGame() { document.activeElement?.blur?.(); this.node('game-canvas').focus({ preventScroll: true }); }

  onClick(event) {
    const button = event.target.closest('[data-action]');
    if (!button || button.disabled) return;
    event.preventDefault();
    this.game.audio?.start();
    const action = button.dataset.action;
    if (action === 'start' || action === 'retry') {
      this.panel = null; this.resumeOnClose = false; this.rewardSignature = '';
      this.game.startRun(); this.focusGame();
    } else if (action === 'pause') {
      this.game.pause();
    } else if (action === 'resume') {
      this.panel = null; this.game.resume(); this.focusGame();
    } else if (action === 'title') {
      this.panel = null; this.resumeOnClose = false; this.game.returnToTitle();
    } else if (action === 'brand') {
      if (this.game.mode === 'playing') this.game.pause();
      else if (!['paused', 'reward'].includes(this.game.mode)) { this.panel = null; this.game.returnToTitle(); }
    } else if (['controls', 'settings', 'upgrades'].includes(action)) {
      this.openPanel(action, button);
    } else if (action === 'close') {
      this.closePanel();
    } else if (action === 'reset-settings') {
      this.game.setSettings(DEFAULT_SETTINGS); this.refreshSettings();
    } else if (action === 'choose-upgrade') {
      if (this.game.mode !== 'reward' || this.panel) return;
      this.game.chooseUpgrade(button.dataset.upgrade);
      this.focusGame();
    }
    this.update();
  }

  onSetting(event) {
    const input = event.target;
    if (!input.matches('[data-setting]')) return;
    const value = Number(input.value) / 100;
    if (!Number.isFinite(value)) return;
    this.game.setSettings({ [input.dataset.setting]: value });
    const output = this.node('panel-body').querySelector(`[data-output="${input.dataset.setting}"]`);
    if (output) output.textContent = value === 0 ? '꺼짐' : `${Math.round(value * 100)}%`;
  }

  onKey(event) {
    if (this.panel && event.code === 'Escape') {
      event.preventDefault(); event.stopPropagation(); this.closePanel(); this.update(); return;
    }
    // The game prevents Space scrolling. Preserve native keyboard activation on menus.
    if ((event.code === 'Space' || event.code === 'Enter') && event.target.closest('button, input, a')) event.stopPropagation();
    if (this.panel && event.code === 'Tab') {
      const focusable = [...this.node('panel-screen').querySelectorAll('button:not([disabled]), input:not([disabled]), a[href]')];
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !this.node('panel-screen').contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !this.node('panel-screen').contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    }
  }

  handleEscape() {
    if (this.panel) this.closePanel();
    else if (this.game.mode === 'playing') this.game.pause();
    else if (this.game.mode === 'paused') { this.game.resume(); this.focusGame(); }
    this.update();
  }

  openPanel(panel, trigger) {
    if (!this.panel) {
      this.resumeOnClose = this.game.mode === 'playing';
      this.panelTrigger = trigger || document.activeElement;
      if (this.resumeOnClose) this.game.pause();
    }
    this.panel = panel;
    this.renderPanel();
    this.update();
    this.node('panel-screen').querySelector('.close-button').focus({ preventScroll: true });
  }

  closePanel() {
    if (!this.panel) return;
    this.panel = null;
    if (this.resumeOnClose && this.game.mode === 'paused') { this.game.resume(); this.focusGame(); }
    else this.panelTrigger?.focus?.({ preventScroll: true });
    this.resumeOnClose = false;
    this.panelTrigger = null;
  }

  renderPanel() {
    const body = this.node('panel-body');
    if (this.panel === 'controls') {
      this.text('panel-title', '살아남는 법');
      this.text('panel-overline', 'FIELD NOTES / 조작 안내');
      this.text('panel-footer-note', 'PC · 키보드와 마우스');
      const controls = [
        ['좌우 이동', ['A', 'D']], ['점프', ['Space']], ['조준', ['마우스 이동']], ['사격', ['좌클릭 유지']],
        ['재장전', ['R']], ['회피 구르기', ['Shift']], ['무기 교체', ['Q']], ['슬로모션', ['우클릭 유지']],
        ['웅크리기', ['C 유지']], ['낮은 담 · 상자 넘기', ['F']],
        ['총기 고장 해제', ['R 5회 연타']], ['총기 정비', ['R 1.4초 유지']],
        ['획득 · 출구', ['E']], ['일시정지', ['Esc']],
      ];
      body.innerHTML = `<div class="controls-grid">${controls.map(([label, keys]) => `<div class="control-row"><span>${label}</span><span class="control-keys">${keys.map(key => `<kbd>${key}</kbd>`).join('')}</span></div>`).join('')}</div><div class="control-tip"><b>우클릭 + 좌클릭을 함께 누르면 슬로모션 중 사격합니다.</b> 이동과 조준은 독립적입니다. C로 상자 뒤에 숨고, 가까운 낮은 장애물은 바라보는 쪽으로 F를 눌러 넘으세요.<br><b>총기 관리:</b> 내구도 15% 이하는 마모 경고, 0%에서 고장. 비에 젖음 85%가 되어도 고장납니다. 고장은 <b>R을 눌렀다 떼기 5회</b>로 해제합니다. 길게 누르기는 연타에 포함되지 않습니다. 고장이 없을 때 R을 1.4초 누르면 내구도 100%로 정비하고 일부 건조합니다. 지붕 아래나 비가 그쳤을 때 젖음이 줄어듭니다.<br>회피는 잠깐 무적입니다. 집중 게이지는 적 처치 시 회복됩니다. 무기는 최대 2개, 예비 탄약은 무제한입니다.<br><b>적 처치 → 강화 선택 → 오른쪽 출구에서 E.</b> 3개 구역, 9번째 방에서 보스와 맞서세요.</div>`;
    } else if (this.panel === 'settings') {
      this.text('panel-title', '밤의 감도');
      this.text('panel-overline', 'PREFERENCES / 설정');
      this.text('panel-footer-note', '설정은 이 브라우저에 자동 저장됩니다');
      const settings = [
        ['music', '음악 볼륨', '빗소리처럼 흐르는 낮은 선율.'],
        ['sfx', '효과음 볼륨', '총성, 재장전, 피격과 전투 신호.'],
        ['shake', '화면 흔들림', '0%로 설정하면 화면 흔들림이 꺼집니다.'],
        ['flash', '섬광 강도', '0%로 설정하면 총구·피격 섬광이 꺼집니다.'],
      ];
      body.innerHTML = settings.map(([id, label, description]) => `<div class="setting-row"><label class="setting-label" for="setting-${id}"><span>${label}</span><output data-output="${id}" for="setting-${id}"></output></label><p>${description}</p><input id="setting-${id}" data-setting="${id}" type="range" min="0" max="100" step="1" value="${Math.round(this.game.settings[id] * 100)}" aria-label="${label}"></div>`).join('') + '<div class="settings-bottom"><span>음악과 효과음은 각각 끌 수 있습니다.</span><button class="text-button" data-action="reset-settings">기본값으로 복원 ↺</button></div>';
      this.refreshSettings();
    } else if (this.panel === 'upgrades') {
      this.text('panel-title', '이번 밤의 선택');
      this.text('panel-overline', 'YOUR HAND / 획득한 강화');
      this.text('panel-footer-note', '강화와 무기는 이번 도전에서만 유지됩니다');
      const upgrades = UPGRADES.filter(upgrade => (this.game.player?.upgrades[upgrade.id] || 0) > 0);
      body.innerHTML = upgrades.length ? `<div class="upgrade-list">${upgrades.map(upgrade => `<div class="upgrade-item"><span class="upgrade-item-icon" aria-hidden="true">${escapeHTML(upgrade.icon)}</span><div class="upgrade-item-info"><div class="upgrade-item-header"><span>${escapeHTML(upgrade.name)}</span><span>${stackLabel(this.game.player.upgrades[upgrade.id], upgrade.maxStacks)}</span></div><p>${escapeHTML(upgrade.description)}</p></div></div>`).join('')}</div>` : '<div class="empty-upgrades"><span aria-hidden="true">◇</span><strong>아직, 빈손이다.</strong>전투 방을 클리어하면 무작위 강화 3개 중<br>하나를 선택할 수 있습니다.</div>';
      if (this.game.player?.weapons.length) {
        body.innerHTML += `<div class="arsenal-heading">보유 무기 <span>최대 2개 · Q로 교체</span></div><div class="upgrade-list">${this.game.player.weapons.map((weapon, index) => { const def = WEAPONS[weapon.id]; return `<div class="upgrade-item arsenal-item"><span class="upgrade-item-icon" aria-hidden="true">${index + 1}</span><div class="upgrade-item-info"><div class="upgrade-item-header"><span>${escapeHTML(def.name)}</span><span>${index === this.game.player.weaponIndex ? '사용 중' : '보조 무기'}</span></div><p>${escapeHTML(def.tag)} · 피해 ${def.damage}${def.pellets > 1 ? ` × ${def.pellets}` : ''} · 재장전 ${def.reload}초<br>내구도 ${Math.round(weapon.durability ?? 100)}% · 젖음 ${Math.round(weapon.wetness ?? 0)}%${weapon.jammed ? ` · ${weapon.jamReason === 'rain' ? '침수' : '마모'} 고장 — R 5회 연타` : ''}<br>${escapeHTML(def.description)}</p></div></div>`; }).join('')}</div>`;
      }
    }
    body.scrollTop = 0;
  }

  refreshSettings() {
    for (const [key, value] of Object.entries(this.game.settings)) {
      const input = this.node('panel-body').querySelector(`[data-setting="${key}"]`);
      const output = this.node('panel-body').querySelector(`[data-output="${key}"]`);
      if (input) input.value = String(Math.round(value * 100));
      if (output) output.textContent = value === 0 ? '꺼짐' : `${Math.round(value * 100)}%`;
    }
  }

  renderReward() {
    const signature = `${this.game.seed}:${this.game.roomIndex}:${this.game.rewardChoices.map(upgrade => upgrade.id).join(',')}`;
    if (signature === this.rewardSignature) return;
    this.rewardSignature = signature;
    this.text('reward-room', `${String(this.game.roomIndex + 1).padStart(2, '0')} / 09`);
    this.node('reward-cards').innerHTML = this.game.rewardChoices.map((upgrade, index) => {
      const current = this.game.player.upgrades[upgrade.id] || 0;
      return `<button class="reward-card" data-action="choose-upgrade" data-upgrade="${escapeHTML(upgrade.id)}" aria-label="${escapeHTML(upgrade.name)} 선택"><div class="reward-card-top"><span class="reward-icon" aria-hidden="true">${escapeHTML(upgrade.icon)}</span><span class="reward-number">0${index + 1}</span></div><div class="reward-category">${escapeHTML(upgrade.category)}</div><h3>${escapeHTML(upgrade.name)}</h3><p>${escapeHTML(upgrade.description)}</p><div class="reward-card-bottom"><span>${current ? `현재 ${current} → ${current + 1} / ${upgrade.maxStacks} 중첩` : stackLabel(current, upgrade.maxStacks)}</span><span>선택하기 ↗</span></div></button>`;
    }).join('');
  }

  renderEnding() {
    const won = this.game.mode === 'won';
    this.node('ending-screen').classList.toggle('won', won);
    this.node('ending-screen').classList.toggle('dead', !won);
    this.text('ending-overline', won ? 'THE TRUTH SURVIVES / 사건 종결' : 'END OF THE LINE / 도전 종료');
    this.text('ending-title', won ? '새벽은, 끝내 온다.' : '밤은, 아직 길다.');
    this.text('ending-description', won ? '장부를 손에 넣었다. 도시가 지우려 했던 이름들은, 이제 빛을 본다.' : '장부는 여전히 도시 어딘가에 있다. 다시 방아쇠를 당길 시간이다.');
    const records = [[String(this.game.score).padStart(6, '0'), '획득 점수'], [String(this.game.kills), '처치한 적'], [`${this.game.stats.roomsCleared} / 9`, '클리어한 방'], [timeLabel(this.game.time), '도전 시간']];
    this.node('ending-record').innerHTML = records.map(([value, label]) => `<div class="record-item"><strong>${value}</strong><span>${label}</span></div>`).join('');
  }

  update() {
    const game = this.game, mode = game.mode;
    const changedMode = mode !== this.lastMode;
    if (changedMode) {
      if (['dead', 'won'].includes(mode)) { this.panel = null; this.resumeOnClose = false; this.renderEnding(); }
      this.lastMode = mode;
      this.node('game-stage').dataset.mode = mode;
    }
    this.visible('title-screen', mode === 'title');
    this.visible('game-hud', ['playing', 'paused', 'reward'].includes(mode));
    this.visible('pause-screen', mode === 'paused' && !this.panel);
    this.visible('reward-screen', mode === 'reward');
    this.visible('ending-screen', mode === 'dead' || mode === 'won');
    this.visible('panel-screen', Boolean(this.panel));
    this.text('title-best', String(game.best.score).padStart(6, '0'));
    if (mode === 'reward') this.renderReward();
    if (changedMode && !this.panel) {
      const selector = mode === 'paused' ? '#pause-screen [data-action=resume]' : mode === 'reward' ? '#reward-cards button' : ['dead', 'won'].includes(mode) ? '#ending-screen [data-action=retry]' : null;
      if (selector) document.querySelector(selector)?.focus({ preventScroll: true });
    }
    const status = { title: '새로운 밤이 당신을 기다립니다', paused: '일시정지 · 잠깐의 정적', reward: '전투 완료 · 다음 밤을 위한 선택', dead: '도전 종료 · 비는 아직 그치지 않았습니다', won: '사건 종결 · 진실은 살아남았습니다' };
    this.text('session-status', status[mode] || `${ZONES[game.zoneIndex]?.name || ''} · ${game.room?.name || ''}`);
    if (!game.player || !game.room) return;
    if (this.seenRoom !== game.room) { this.seenRoom = game.room; this.roomEnteredTime = game.time; }
    const player = game.player, weapon = game.getWeapon(), def = WEAPONS[weapon.id];
    const bossArrival = game.arrivals?.find(arrival => arrival.kind === 'bossCar' && arrival.elapsed < arrival.duration);
    this.text('story-caption', bossArrival ? '브레이크 소리. 검은 차 한 대. 백야가 도착했다.' : game.room.story || '');
    this.visible('story-caption', Boolean(bossArrival) || (Boolean(game.room.story) && game.time - this.roomEnteredTime < 7 && !game.room.cleared));
    this.text('health-number', `${Math.ceil(player.hp)} / ${player.maxHp}`);
    this.fill('health-fill', player.hp / player.maxHp);
    this.text('health-alert', player.hp <= player.maxHp * 0.25 ? '위험 · 엄폐하고 회피하세요' : player.hurt > 0 ? '피격' : '');
    this.node('game-hud').classList.toggle('low-health', player.hp <= player.maxHp * 0.25);
    this.node('game-hud').classList.toggle('slow-active', game.slowActive);
    this.node('game-hud').classList.toggle('ammo-empty', weapon.ammo === 0);
    this.text('area-name', `${String(game.zoneIndex + 1).padStart(2, '0')} / ${ZONES[game.zoneIndex].name}`);
    this.text('room-landmark', game.room.landmark?.name || game.room.name);
    const raining = (game.weather?.intensity || 0) > 0.05;
    this.text('weather-status', `${game.weather?.kindlabel || (raining ? '비' : '비 그침')}${player.sheltered && raining ? ' · 지붕 아래' : ''}`);
    this.node('weather-status').classList.toggle('sheltered', Boolean(player.sheltered && raining));
    const alive = game.enemies.reduce((count, enemy) => count + !enemy.dead, 0);
    this.text('room-progress', `${game.roomIndex + 1} / 9 방 · ${game.room.boss ? '최후의 결전' : game.room.cleared ? '전투 완료' : `${game.room.wave || 1} / ${game.room.totalWaves || 3} 차 공세 · 적 ${alive}`}`);
    this.text('run-time', timeLabel(game.time));
    this.text('slow-number', Math.ceil(player.slow));
    this.fill('slow-fill', player.slow / player.maxSlow);
    this.text('dodge-text', player.rollTime > 0 ? '회피 중' : player.rollCooldown > 0 ? `회피 ${player.rollCooldown.toFixed(1)}초` : '회피 준비');
    this.node('dodge-status').className = player.rollCooldown > 0 ? 'dodge-wait' : 'dodge-ready';
    this.text('crouch-status', player.crouching ? '웅크림' : '웅크리기');
    this.text('vault-status', player.vaultTime > 0 ? '넘는 중' : player.vaultCooldown > 0 ? `담 넘기 ${player.vaultCooldown.toFixed(1)}초` : '담 넘기');
    this.node('crouch-control').classList.toggle('active', Boolean(player.crouching));
    this.node('vault-control').classList.toggle('active', player.vaultTime > 0);
    this.text('upgrade-count', Object.values(player.upgrades).reduce((sum, count) => sum + count, 0));
    this.text('weapon-name', def.name);
    this.text('weapon-tag', def.tag);
    this.text('ammo-current', String(weapon.ammo).padStart(2, '0'));
    this.text('ammo-max', game.magazine ? game.magazine(weapon.id) : def.magazine);
    this.fill('reload-fill', weapon.reload > 0 ? 1 - weapon.reload / weapon.reloadTotal : 0);
    this.text('reload-text', weapon.reload > 0 ? `재장전 ${weapon.reload.toFixed(1)}초` : weapon.ammo === 0 ? '탄창 소진 · 재장전' : '재장전');
    this.text('secondary-text', player.weapons.length > 1 ? WEAPONS[player.weapons[1 - player.weaponIndex].id].tag : '보조 무기 없음');
    const durability = clamp(weapon.durability ?? 100, 0, 100), wetness = clamp(weapon.wetness ?? 0, 0, 100);
    const clearing = clamp(Math.floor(weapon.clearProgress || 0), 0, 5), maintenance = clamp(weapon.maintenance || 0, 0, 1.4);
    this.text('durability-number', `${Math.round(durability)}%`);
    this.text('wetness-number', `${Math.round(wetness)}%`);
    this.fill('durability-fill', durability / 100);
    this.fill('wetness-fill', wetness / 100);
    this.node('condition-panel').classList.toggle('jammed', Boolean(weapon.jammed));
    this.node('condition-panel').classList.toggle('worn', durability <= 15);
    this.node('condition-panel').classList.toggle('soaked', wetness >= 65);
    this.node('condition-panel').classList.toggle('maintaining', maintenance > 0);
    this.fill('service-fill', weapon.jammed ? clearing / 5 : maintenance / 1.4);
    this.visible('service-track', Boolean(weapon.jammed || maintenance > 0));
    this.text('condition-status', weapon.jammed ? `${weapon.jamReason === 'rain' ? '침수' : '마모'} 고장 · R 연타 ${clearing} / 5` : maintenance > 0 ? `정비 ${Math.min(100, Math.floor(maintenance / 1.4 * 100))}% · R 유지` : durability <= 15 ? '마모 위험 · R 1.4초 정비' : wetness >= 65 ? '총기가 젖습니다 · 지붕으로' : durability < 99 ? 'R 1.4초 유지 · 총기 정비' : '총기 상태 양호');
    if (weapon.jammed) this.text('reload-text', '고장 · R 연타');
    else if (maintenance > 0.25) this.text('reload-text', '현장 정비 중');
    this.visible('game-toast', game.toast.time > 0 && Boolean(game.toast.text));
    this.text('game-toast', game.toast.text || '');
    const pickup = game.pickups.find(item => Math.abs(item.x - player.x) < 90 && Math.abs(item.y - player.y) < 95);
    let notice = '';
    if (pickup?.type === 'weapon') notice = `E · ${WEAPONS[pickup.weaponId]?.tag || '무기'} ${player.weapons.length < 2 ? '획득' : '현재 무기와 교체'}`;
    else if (pickup?.type === 'health') notice = `E · 체력 ${pickup.amount} 회복`;
    else if (game.room.cleared && game.room.rewardTaken) notice = Math.abs(player.x - game.room.exit.x) < 120 ? 'E · 다음 방으로' : '오른쪽 출구로 이동 →';
    else if (game.waveDelay > 0) notice = '다음 공세가 다가온다 · 재장전하세요';
    else if (game.time < 9) notice = 'C 웅크리기 · F 담 넘기 · 우클릭 + 좌클릭 집중 사격';
    this.visible('room-notice', Boolean(notice));
    this.text('room-notice', notice);
  }
}
