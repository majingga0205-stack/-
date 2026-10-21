"""Browser integration checks. Requires Python Playwright + installed Chromium.
Run against an existing server: GAME_URL=http://127.0.0.1:8001 python3 tests/browser_smoke.py
Room traversal uses explicit accelerated fixtures; input/combat checks use real input.
"""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

URL = os.environ.get('GAME_URL', 'http://127.0.0.1:8000')
HTML_FILE = os.environ.get('GAME_HTML')
OUT = Path(os.environ.get('GAME_ARTIFACTS', '/tmp/last-bullet-artifacts'))
OUT.mkdir(parents=True, exist_ok=True)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    if HTML_FILE:
        html = Path(HTML_FILE).read_text(encoding='utf-8')
        page.route(URL, lambda route: route.fulfill(status=200, content_type='text/html; charset=utf-8', body=html))
    if URL.startswith('file:') or HTML_FILE:
        page.context.set_offline(True)
    errors, external = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: external.append(request.url) if not request.url.startswith(URL) else None)
    page.goto(URL, wait_until='networkidle')
    expect(page.get_by_role('heading', name='새벽 전 마지막 탄환.')).to_be_visible()
    page.screenshot(path=str(OUT / 'title.png'))
    page.locator('.header-nav [data-action=controls]').click()
    expect(page.get_by_role('heading', name='살아남는 법')).to_be_visible()
    assert page.locator('.control-row').count() == 14
    page.keyboard.press('Escape')
    page.locator('.header-nav [data-action=settings]').click()
    page.locator('#setting-music').fill('20')
    page.locator('#setting-sfx').fill('30')
    assert page.evaluate('__game.settings.music') == 0.2
    page.keyboard.press('Escape')
    page.get_by_role('button', name='밤 속으로').click()
    assert page.evaluate('__game.mode') == 'playing'
    page.keyboard.down('d')
    page.wait_for_timeout(450)
    page.keyboard.up('d')
    assert page.evaluate('__game.player.x') > 240
    page.keyboard.press('e')
    page.wait_for_timeout(60)
    assert page.evaluate('__game.player.weapons.length') == 2
    page.keyboard.press('q')
    page.wait_for_timeout(60)
    assert page.evaluate('__game.getWeapon().id') == 'pistol'

    box = page.locator('#game-canvas').bounding_box()
    def aim(x, y):
        page.mouse.move(box['x'] + x / 1280 * box['width'], box['y'] + y / 720 * box['height'])

    aim(600, 450)
    page.mouse.down()
    page.wait_for_timeout(350)
    page.mouse.up()
    assert page.evaluate('__game.stats.shots') >= 2
    page.keyboard.press('r')
    page.wait_for_timeout(40)
    assert page.evaluate('__game.getWeapon().reload') > 0
    page.keyboard.press('Escape')
    before = page.evaluate('JSON.stringify([__game.time,__game.player.x,__game.getWeapon().reload,__game.enemies.map(e=>[e.x,e.timer]),__game.bullets])')
    page.wait_for_timeout(400)
    after = page.evaluate('JSON.stringify([__game.time,__game.player.x,__game.getWeapon().reload,__game.enemies.map(e=>[e.x,e.timer]),__game.bullets])')
    assert before == after, 'Pause must freeze all combat timers'
    page.locator('#pause-screen [data-action=settings]').click()
    page.locator('#setting-shake').fill('0')
    page.locator('#setting-flash').fill('0')
    page.keyboard.press('Escape')
    assert page.evaluate('__game.mode') == 'paused'
    page.get_by_role('button', name='계속하기').click()
    page.wait_for_timeout(1100)
    assert page.evaluate('__game.getWeapon().ammo') == 12
    page.keyboard.press('Space')
    page.wait_for_timeout(130)
    assert page.evaluate('__game.player.y') < 610
    page.keyboard.press('Shift')
    page.wait_for_timeout(60)
    assert page.evaluate('__game.player.rollCooldown') > 0
    aim(750, 450)
    page.mouse.down(button='right')
    page.wait_for_timeout(300)
    page.mouse.up(button='right')
    assert page.evaluate('__game.player.slow') < 99
    page.wait_for_timeout(700)

    # Exercise actual DOM mouse events: pointerdown alone misses the second
    # button in a chord, so direct state changes cannot catch this regression.
    page.evaluate('''() => {
      const g=__game; g.enemies=[]; g.bullets=[]; g.room.covers=[]; g.room.platforms=[];
      g.room.hazards=[];g.arrivals=[];g.room.weatherAllowed=false;
      g.room.wave=1; g.waveDelay=999; g.player.invuln=100; g.player.slow=100;
      Object.assign(g.getWeapon(),{ammo:12,reload:0,cooldown:0,jammed:false,durability:100,wetness:0});
    }''')
    aim(1000, 450)
    for first, second in [('right', 'left'), ('left', 'right')]:
        page.evaluate('__game.player.slow=100; __game.getWeapon().cooldown=0')
        shots = page.evaluate('__game.stats.shots')
        page.mouse.down(button=first)
        page.wait_for_timeout(70)
        page.mouse.down(button=second)
        page.wait_for_timeout(750)
        assert page.evaluate('__game.input.mouse.left && __game.input.mouse.right && __game.slowActive'), (first, second)
        assert page.evaluate('__game.stats.shots') > shots, 'Both button orders must fire during slow motion'
        page.mouse.up(button=second)
        page.wait_for_timeout(40)
        assert page.evaluate(f'__game.input.mouse.{first}'), 'Releasing one button must preserve the other'
        assert not page.evaluate(f'__game.input.mouse.{second}'), 'Each button releases independently'
        page.mouse.up(button=first)
        page.wait_for_timeout(40)
        assert not page.evaluate('__game.input.mouse.left || __game.input.mouse.right')

    # C changes the collision body, not only the drawing; F crosses a real crate.
    page.evaluate('''() => {
      const g=__game; Object.assign(g.player,{x:250,y:640,vx:0,vy:0,grounded:true,rollTime:0});
      g.room.covers=[];g.room.platforms=[];g.camera.x=0;
    }''')
    page.keyboard.down('c')
    page.wait_for_timeout(80)
    assert page.evaluate('__game.player.h') == 34
    page.keyboard.up('c')
    page.wait_for_timeout(80)
    assert page.evaluate('__game.player.h') == 58
    page.evaluate('''() => {
      __game.room.covers=[{x:285,y:588,w:60,h:52,hp:100,maxHp:100,destructible:false}];
      __game.player.vaultCooldown=0;
    }''')
    aim(1000, 450)
    page.keyboard.press('f')
    page.wait_for_timeout(900)
    assert page.evaluate('__game.player.x') > 360, 'F must cross the near crate'

    # A thin barricade has its own hand-plant vault; wire refuses F and hurts
    # periodically even while the fixture has ordinary bullet invulnerability.
    page.evaluate('''() => {
      const g=__game;Object.assign(g.player,{x:250,y:640,vx:0,vy:0,grounded:true,vaultCooldown:0});
      g.room.covers=[{x:285,y:572,w:22,h:68,hp:99999,destructible:false,kind:'barricade',vaultable:true}];
    }''')
    page.keyboard.press('f')
    page.wait_for_timeout(90)
    assert page.evaluate('__game.player.vault.kind') == 'barricade'
    page.screenshot(path=str(OUT / 'barricade-vault.png'))
    page.wait_for_timeout(650)
    assert page.evaluate('__game.player.x') > 325
    page.evaluate('''() => {
      const g=__game;Object.assign(g.player,{x:250,y:640,vx:0,vy:0,grounded:true,vaultCooldown:0});
      Object.assign(g.room.covers[0],{kind:'wire',vaultable:false});
    }''')
    page.keyboard.press('f')
    page.wait_for_timeout(70)
    assert page.evaluate('__game.player.vaultTime') == 0
    assert page.evaluate('__game.player.x') == 250
    page.evaluate('''() => {
      const g=__game;g.room.covers=[];g.room.hazards=[{kind:'wire',x:225,y:630,w:80,h:10,damage:3,interval:.5}];
      g.player.hp=50;g.player.wireCooldown=0;
    }''')
    page.wait_for_timeout(180)
    assert page.evaluate('__game.player.hp') == 47
    page.evaluate('__game.room.hazards=[]')

    # A held R and auto-repeat keydowns are not distinct jam-clearing taps.
    page.evaluate('''() => {
      const g=__game;g.room.covers=[];
      Object.assign(g.getWeapon(),{jammed:true,clearProgress:0,ammo:12,reload:0,cooldown:0,wetness:100,durability:0});
    }''')
    page.keyboard.down('r')
    for _ in range(6):
        page.keyboard.down('r')
        page.wait_for_timeout(35)
    assert page.evaluate('__game.getWeapon().jammed'), 'OS key repeat must not clear a jam'
    assert page.evaluate('__game.getWeapon().clearProgress') == 1
    page.keyboard.up('r')
    for _ in range(4):
        page.keyboard.press('r')
        page.wait_for_timeout(65)
    assert not page.evaluate('__game.getWeapon().jammed')
    assert page.evaluate('__game.getWeapon().durability') >= 35
    assert page.evaluate('__game.getWeapon().wetness') == 100
    assert page.evaluate('__game.getWeapon().jamGrace') > 4
    page.keyboard.down('r')
    page.wait_for_timeout(1700)
    page.keyboard.up('r')
    assert page.evaluate('__game.getWeapon().durability') == 100
    assert page.evaluate('__game.getWeapon().wetness') == 0
    print('PASS: real two-button slow/fire chords, crouch, crate/barricade vault, wire rejection/contact, distinct R jam taps, inspection-only drying')

    # Fixed combat fixture, but damage is delivered with real aiming + mouse fire.
    page.evaluate('''() => {
      const g=__game; g.player.x=250; g.player.y=640; g.player.vx=0; g.player.vy=0;
      g.player.invuln=5; g.camera.x=0; g.room.covers=[]; g.room.platforms=[];g.bullets=[];
      g.enemies=[];g.spawnEnemy({type:'pistol',x:490,y:640},0);
    }''')
    heads_before = page.evaluate('__game.stats.headshots')
    aim(490, 592)
    page.mouse.down()
    page.wait_for_timeout(1100)
    page.mouse.up()
    assert page.evaluate('__game.kills') >= 1
    assert page.evaluate('__game.stats.hits') >= 2
    assert page.evaluate('__game.stats.headshots') > heads_before
    page.screenshot(path=str(OUT / 'combat.png'))
    print('PASS: real keyboard/mouse movement, pickup, swap, headshot/kill, reload, roll, slow, pause/settings')

    page.evaluate('__game.startRun(271828)')
    for room_index in range(8):
        page.evaluate('''() => {
          const g=__game;
          for(let wave=0;wave<3;wave++) {
            for(const e of g.enemies) {e.spawnTime=0;g.damageEnemy(e,10000);}
            g.enemies=g.enemies.filter(e=>!e.dead);
            g.updateRoomProgress(0.01);
            if(g.mode==='playing')g.updateRoomProgress(3);
          }
        }''')
        expect(page.locator('#reward-screen')).to_be_visible()
        assert page.evaluate('__game.mode') == 'reward'
        assert page.locator('.reward-card').count() == 3
        assert page.evaluate('__game.roomIndex') == room_index
        frozen = page.evaluate('__game.time')
        page.wait_for_timeout(150)
        assert page.evaluate('__game.time') == frozen
        if room_index == 0:
            page.screenshot(path=str(OUT / 'reward.png'))
            page.locator('.header-nav [data-action=settings]').click()
            page.keyboard.press('Escape')
            assert page.evaluate('__game.mode') == 'reward'
        page.locator('.reward-card').first.click()
        assert page.evaluate('__game.mode') == 'playing'
        page.evaluate('__game.player.x=__game.room.exit.x')
        page.keyboard.press('e')
        page.wait_for_timeout(80)
        assert page.evaluate('__game.roomIndex') == room_index + 1
    print('PASS: 8 rooms × 3 waves, 3 zones, rewards, paused reward clock, E exits (accelerated encounter fixtures)')

    # The final encounter is visible from the entrance: the car drifts in before
    # the boss gets an active collision/attack body and guards enter through doors.
    page.wait_for_timeout(1350)
    assert page.evaluate('__game.bossIntro.kind') == 'bossCar'
    assert page.evaluate('__game.bossIntro.drift') > 0
    assert page.evaluate('__game.enemies.find(e=>e.type==="boss").spawnTime') > 0
    page.screenshot(path=str(OUT / 'boss-arrival.png'))
    page.keyboard.press('Escape')
    intro_state = page.evaluate('JSON.stringify([__game.arrivals,__game.weather,__game.getWeapon(),__game.player.vaultCooldown])')
    page.wait_for_timeout(250)
    assert page.evaluate('JSON.stringify([__game.arrivals,__game.weather,__game.getWeapon(),__game.player.vaultCooldown])') == intro_state
    page.get_by_role('button', name='계속하기').click()
    page.wait_for_function('__game.bossIntro?.doorOpen', timeout=4000)
    assert page.evaluate('__game.bossIntro.doorOpen')
    assert page.evaluate('__game.enemies.find(e=>e.type==="boss").entry.visible')
    page.screenshot(path=str(OUT / 'boss-unload.png'))
    print('PASS: visible boss car drift, door opening, boss disembark, paused encounter/weather/condition timers')

    page.evaluate('''() => {
      const g=__game,b=g.enemies.find(e=>e.type==='boss');
      g.player.x=430;g.player.y=640;g.player.invuln=100;g.camera.x=0;
      b.spawnTime=0;b.hp=b.maxHp*0.49;g.updateEnemy(b,0.01);
    }''')
    assert page.evaluate('__game.enemies.find(e=>e.type==="boss").phase') == 2
    for pattern in ['fan', 'focus', 'rush']:
        result = page.evaluate('''pattern => {
          const g=__game,b=g.enemies.find(e=>e.type==='boss');
          b.pattern=pattern;b.state='windup';b.timer=.001;b.aim=Math.PI;
          const before=g.bullets.length;g.updateEnemy(b,.01);g.updateEnemy(b,.02);
          return {state:b.state,shots:g.bullets.length-before,moving:Math.abs(b.vx)>0};
        }''', pattern)
        assert result['state'] == 'attack'
        assert result['moving'] if pattern == 'rush' else result['shots'] > 0
    page.screenshot(path=str(OUT / 'boss.png'))
    page.evaluate('''() => {const g=__game;for(const e of g.enemies){e.spawnTime=0;g.damageEnemy(e,10000);}g.enemies=[];g.updateRoomProgress(.01);}''')
    expect(page.get_by_role('heading', name='새벽은, 끝내 온다.')).to_be_visible()
    assert page.evaluate('__game.best.wins') == 1
    page.screenshot(path=str(OUT / 'victory.png'))
    page.locator('#ending-screen [data-action=retry]').click()
    assert page.evaluate('Object.keys(__game.player.upgrades).length') == 0
    assert page.evaluate('__game.player.weapons.length') == 1
    assert page.evaluate('__game.bullets.length') == 0
    page.evaluate('__game.player.invuln=0;__game.damagePlayer(999)')
    expect(page.get_by_role('heading', name='밤은, 아직 길다.')).to_be_visible()
    page.screenshot(path=str(OUT / 'death.png'))
    page.locator('#ending-screen [data-action=retry]').click()
    assert page.evaluate('__game.player.hp') == 50
    assert page.evaluate('__game.mode') == 'playing'
    assert page.evaluate('__game.audio.context.state') == 'running'
    assert page.evaluate('__game.audio.musicVolume') == 0.2
    assert page.evaluate('__game.audio.sfxVolume') == 0.3
    print('PASS: phase-2 boss patterns, victory, death, one-click retry, reset, WebAudio volume controls')

    saved = page.evaluate('JSON.parse(localStorage.getItem("last-bullet-before-dawn-v1"))')
    assert set(saved) == {'best', 'settings'}
    page.reload(wait_until='networkidle')
    assert page.evaluate('__game.mode') == 'title'
    assert page.evaluate('__game.best.wins') == 1
    assert page.evaluate('__game.settings.shake') == 0
    assert not errors, errors
    assert not external, external
    print('PASS: only records/settings persist; zero external requests; zero browser errors')
    print(json.dumps({'screenshots': str(OUT), 'errors': errors}, ensure_ascii=False))
    browser.close()
