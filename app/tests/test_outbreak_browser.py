"""Chromium checks for the actual built isometric game.

Three real input profiles exercise the ordinary UI with test-only player
invulnerability. A desktop fixture uses ?test=1 to accelerate early waves and
reduce final-wave target HP; objectives, projectile hits, purchases and exits
still use production code and UI input. Reference screenshots arrange actual
final-wave enemies on walkable tiles and trigger the real weapon/grenade code.
They are documented visual fixtures, not ordinary-play screenshots or proof of
a full campaign playthrough.
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import json
import math
import os
import shutil
import signal
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
DOCS = ROOT / "docs"
SCREENSHOTS = DOCS / "screenshots"
REPORT = DOCS / "OUTBREAK_BROWSER_RESULTS.json"
PROFILES = [("desktop", 1366, 768, False), ("mobile", 390, 844, True),
            ("landscape", 844, 390, True)]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def state(page):
    return page.evaluate("window.OutbreakDebug.snapshot()")


def mode(page, expected):
    page.wait_for_function("m => window.OutbreakDebug?.snapshot().mode === m",
                           arg=expected, timeout=4000)


def distance(before, after):
    a, b = before["player"], after["player"]
    return math.hypot(a["x"] - b["x"], a["y"] - b["y"])


def screenshot(page, item, view, prefix="outbreak"):
    target = SCREENSHOTS / f"{prefix}-{item['profile']}-{view}.png"
    page.screenshot(path=str(target), animations="disabled", timeout=5000)
    item["screenshots"].append(str(target.relative_to(ROOT)))


def touch(cdp, event, points=()):
    cdp.send("Input.dispatchTouchEvent", {"type": event, "touchPoints": [
        {"id": identifier, "x": x, "y": y} for identifier, x, y in points]})


def stick_center(page, selector):
    box = page.locator(selector).bounding_box()
    require(box is not None and box["width"] > 0, f"Missing touch control: {selector}")
    center = (box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    require(0 < center[0] < page.viewport_size["width"]
            and 0 < center[1] < page.viewport_size["height"], f"Control outside viewport: {selector}")
    return center


def verify_reload(page, item, mobile=False):
    before = state(page)["player"]
    key = before["weapon"]
    require(key != "pistol", "Reserve reload check needs a finite-ammo weapon")
    require(before["clip"][key] < 30, "Manual fire did not leave space in the magazine")
    if mobile:
        page.locator("#reloadButton").tap()
    else:
        page.keyboard.press("r")
    page.wait_for_function(
        """before => { const p = OutbreakDebug.snapshot().player;
        return p.clip[before.weapon] > before.clip[before.weapon]
          && p.ammo[before.weapon] < before.ammo[before.weapon]; }""",
        arg=before, timeout=5000)
    after = state(page)["player"]
    require(after["clip"][key] + after["ammo"][key]
            == before["clip"][key] + before["ammo"][key], "Reload created or lost ammunition")
    item["checks"].append("reload transfers reserve ammunition into the magazine")


def verify_desktop_input(page, item):
    before = state(page)
    page.keyboard.down("d")
    try:
        page.wait_for_function(
            """before => {const p=OutbreakDebug.snapshot().player;
            return Math.hypot(p.x-before.player.x,p.y-before.player.y)>.15;}""",
            arg=before, timeout=2500)
    finally:
        page.keyboard.up("d")
    require(state(page)["player"]["x"] > before["player"]["x"], "Screen-right movement is reversed")
    item["checks"].append("WASD moves through the isometric world")

    require(page.evaluate("OutbreakDebug.teleport(2.24, 6.5)"), "Wall test position is not walkable")
    wall_before = state(page)
    page.keyboard.down("a")
    try:
        page.wait_for_timeout(650)
    finally:
        page.keyboard.up("a")
    wall_after = state(page)
    require(wall_after["player"]["x"] >= 2.219, "Player penetrated the west wall")
    require(abs(wall_after["player"]["x"] - wall_before["player"]["x"]) < .06,
            "Wall did not block the horizontal component of movement")
    require(wall_after["player"]["y"] > wall_before["player"]["y"] + .3,
            "Player cannot slide along a wall")
    require(page.evaluate("""() => {const s=OutbreakDebug.getState();
        return OutbreakWorld.isWalkable(s.level,s.player.x,s.player.y,s.player.r);} """),
            "Player ended inside a wall")
    item["checks"].append("wall collision blocks penetration and permits sliding")

    before = state(page)
    page.wait_for_timeout(180)
    require(state(page)["player"]["clip"] == before["player"]["clip"], "Player fires without manual input")
    page.mouse.move(page.viewport_size["width"] * .62, page.viewport_size["height"] * .48)
    page.mouse.down()
    try:
        page.wait_for_function("n => OutbreakDebug.snapshot().player.clip.rifle < n",
                               arg=before["player"]["clip"]["rifle"], timeout=2500)
    finally:
        page.mouse.up()
    page.wait_for_timeout(60)
    item["checks"].append("mouse aim and manual fire consume the rifle magazine")
    verify_reload(page, item)


def verify_touch_input(page, context, item):
    require(page.locator("#touchControls").is_visible(), "Touch controls are hidden")
    mx, my = stick_center(page, "#moveStick")
    ax, ay = stick_center(page, "#aimStick")
    cdp = context.new_cdp_session(page)
    before = state(page)
    touch(cdp, "touchStart", [(1, mx, my), (2, ax, ay)])
    try:
        page.wait_for_timeout(200)
        centered = state(page)
        require(distance(before, centered) < .02, "Centred movement stick drifts")
        require(centered["player"]["clip"] == before["player"]["clip"], "Centred aim stick fires")
        touch(cdp, "touchMove", [(1, mx + 28, my), (2, ax + 28, ay)])
        page.wait_for_function(
            """before => {const p=OutbreakDebug.snapshot().player;
            return Math.hypot(p.x-before.player.x,p.y-before.player.y)>.12
              && p.clip.rifle < before.player.clip.rifle;}""",
            arg=centered, timeout=3000)
    finally:
        touch(cdp, "touchEnd")
    item["movementWorldUnits"] = round(distance(before, state(page)), 3)
    item["checks"].extend(["real multi-touch stick centres stay still and do not fire",
                            "simultaneous real touch moves and aims/fires"])
    page.wait_for_timeout(60)
    verify_reload(page, item, mobile=True)
    cdp.detach()


def verify_touch_skills(page, item):
    # A fixed, clear floor position isolates skill input from wall blocking.
    # The button taps, movement and cooldowns still run through production code.
    teleport(page, 6.5, 6.5)
    page.evaluate("""() => {const s=OutbreakDebug.getState();
        s.player.dashCooldown=0;s.player.abilityCooldown=0;s.player.angle=-Math.PI/4;}""")
    before = state(page)
    for selector in ["#dashButton", "#abilityButton"]:
        stick_center(page, selector)
        require(bool(page.locator(selector).get_attribute("aria-label")),
                f"Skill button lacks an accessible name: {selector}")
    page.locator("#dashButton").tap()
    page.wait_for_function("OutbreakDebug.getState().player.dashCooldown > 0", timeout=1500)
    page.wait_for_function("""before => {const p=OutbreakDebug.snapshot().player;
        return Math.hypot(p.x-before.player.x,p.y-before.player.y)>.4;}""",
        arg=before, timeout=1800)
    crystals_before = state(page)["resources"]
    page.locator("#abilityButton").tap()
    page.wait_for_function("OutbreakDebug.getState().player.abilityCooldown > 0", timeout=1500)
    cooldown = page.evaluate("OutbreakDebug.getState().player.abilityCooldown")
    require(page.locator("#abilityButton").is_disabled(), "Impulse remains usable during cooldown")
    require(state(page)["resources"] == crystals_before - 5, "Impulse did not spend five crystals")
    page.wait_for_timeout(100)
    require(page.evaluate("OutbreakDebug.getState().player.abilityCooldown") < cooldown,
            "Impulse cooldown did not advance")
    item["checks"].extend(["accessible touch dash button moves a stationary player and starts cooldown",
                            "touch impulse button starts cooldown and prevents immediate reuse"])


def teleport(page, x, y):
    require(page.evaluate("p => OutbreakDebug.teleport(p.x,p.y)", {"x": x, "y": y}),
            f"Fixture teleport rejected a walkable position: {x}, {y}")
    # Wait for the production camera to catch up. Aim coordinates then use the
    # actual renderer projection rather than a guessed screen offset.
    page.wait_for_function("""() => { const s=OutbreakDebug.getState();
        const p=OutbreakRenderer.worldToScreen(s.player.x,s.player.y);
        return Math.abs(p.x-innerWidth*.5)<4 && Math.abs(p.y-innerHeight*(innerWidth<600?.42:.48))<4; }""",
        timeout=3500)


def shoot_fixture_target(page, kind, index_or_id):
    target = page.evaluate("""spec => { const s=OutbreakDebug.getState();
        const t=spec.kind==='nest' ? s.nests[spec.id] : s.enemies.find(e=>e.id===spec.id);
        if(!t) throw Error('Controlled target is missing');
        t.hp=1;
        const offsets=[[2.2,0],[-2.2,0],[0,2.2],[0,-2.2],[1.5,1.5],[-1.5,-1.5]];
        const near=offsets.map(([x,y])=>({x:t.x+x,y:t.y+y})).find(p=>
          OutbreakWorld.isWalkable(s.level,p.x,p.y,s.player.r)&&OutbreakWorld.lineOfSight(s.level,p,t));
        if(!near) throw Error('No safe firing position for controlled target');
        return {x:t.x,y:t.y,near}; }""", {"kind": kind, "id": index_or_id})
    teleport(page, target["near"]["x"], target["near"]["y"])
    page.locator('[data-weapon="rifle"]').click()
    point = page.evaluate("""spec => {const s=OutbreakDebug.getState();
        const t=spec.kind==='nest'?s.nests[spec.id]:s.enemies.find(e=>e.id===spec.id);
        return OutbreakRenderer.actorAimPoint && spec.kind==='enemy'
          ? OutbreakRenderer.actorAimPoint(t) : OutbreakRenderer.worldToScreen(t.x,t.y);
        }""", {"kind": kind, "id": index_or_id})
    require(0 < point["x"] < page.viewport_size["width"]
            and 0 < point["y"] < page.viewport_size["height"], "Firing target projects outside viewport")
    page.mouse.move(point["x"], point["y"])
    page.mouse.down()
    try:
        page.wait_for_function("""spec => { const s=OutbreakDebug.getState();
            return spec.kind==='nest' ? s.nests[spec.id].hp<=0 : !s.enemies.some(e=>e.id===spec.id&&e.hp>0);
            }""", arg={"kind": kind, "id": index_or_id}, timeout=3000)
    finally:
        page.mouse.up()


def prepare_final_wave(page, item):
    """Shorten earlier combat without bypassing the production wave scheduler."""
    final_wave = [3, 6, 10][state(page)["levelIndex"]]
    advanced = page.evaluate("""last => { const s=OutbreakDebug.getState(), observed=[];
        s.player.invulnerable=1e6;
        for(const n of s.nests){n.budget=0;n.waveBudget=0;n.spawnTimer=1e6;}
        for(let attempts=0;attempts<20 && OutbreakDebug.snapshot().wave<last;attempts++){
          const before=OutbreakDebug.snapshot().wave;
          for(const e of [...s.enemies]) if(e.hp>0) OutbreakDebug.damageEnemy(e,e.hp+1,{x:e.x-1,y:e.y});
          OutbreakDebug.step(.04);
          const after=OutbreakDebug.snapshot().wave;
          if(after!==before)observed.push({before,after,enemies:s.enemies.length});
        }
        return {observed,wave:OutbreakDebug.snapshot().wave,
          pendingWaves:OutbreakDebug.snapshot().pendingWaves}; }""", final_wave)
    require(advanced["wave"] == final_wave, "Production scheduler did not reach the sector's final wave")
    require(advanced["pendingWaves"] == 0, "Final sector wave still has future waves pending")
    require(all(entry["after"] == entry["before"] + 1 and entry["enemies"] > 0
                for entry in advanced["observed"]),
            "Wave completion skipped a wave or failed to spawn the next group")
    item.setdefault("controlledWaveTransitions", []).extend(advanced["observed"])
    return final_wave


def verify_upgrade_purchase(page, item):
    before = state(page)["player"]
    require(before["cash"] >= 200, "Earlier-wave combat did not fund an upgrade")
    button = page.locator('[data-upgrade="damage"]')
    require(button.is_visible() and button.is_enabled(), "Damage upgrade is not purchasable")
    require(bool(button.get_attribute("aria-label")), "Upgrade lacks an accessible name")
    button.click()
    page.wait_for_function("""before => {const p=OutbreakDebug.snapshot().player;
        return p.upgrades.damage===before.upgrades.damage+1 && p.cash<before.cash;}""",
        arg=before)
    after = state(page)["player"]
    item["upgradePurchase"] = {"upgrade": "damage", "beforeLevel": before["upgrades"]["damage"],
                              "afterLevel": after["upgrades"]["damage"],
                              "creditsSpent": before["cash"] - after["cash"]}
    item["checks"].append("HUD upgrade click raises the damage tier and deducts earned credits")


def verify_reference_battle(page, item, mobile=False):
    """Arrange a repeatable view of real final-wave actors, then use real fire."""
    page.wait_for_function("""() => {const r=OutbreakRenderer.status();
        return r.hdAssetsReady === true && r.spriteRegions >= 16
          && r.artDirection === 'industrial-siege-hd';}""", timeout=10000)
    prepare_final_wave(page, item)
    fixture = page.evaluate("""() => {const s=OutbreakDebug.getState();
        const boss=s.enemies.find(e=>e.isBoss||e.type==='queen');
        if(!boss)throw Error('Final wave has no production boss');
        const ordinary=s.enemies.filter(e=>e!==boss).slice(0,8);
        if(ordinary.length<8)throw Error('Final wave lacks a visible horde');
        const poses=[[5.1,5.2],[8.6,7.7],[4.1,8.3],[7.4,4.1],
                     [10.3,7.1],[5.3,9.1],[10.8,4.5],[9.3,9.1]];
        s.player.x=4.1;s.player.y=7.6;s.player.invulnerable=1e6;
        s.player.cooldown=0;s.player.reload=0;s.player.clip.rifle=30;
        s.player.weapon='rifle';s.player.grenades=Math.max(1,s.player.grenades);
        const actors=[boss,...ordinary];
        for(let i=0;i<actors.length;i++){
          const e=actors[i],[x,y]=i===0?[10.8,6.9]:poses[i-1];
          if(!OutbreakWorld.isWalkable(s.level,x,y,e.r))throw Error('Visual fixture pose is inside a wall');
          e.x=x;e.y=y;e.cooldown=1e6;e.telegraph=1e6;e.hp=e.maxHp=Math.max(1200,e.maxHp);
          e.path=[];e.charge=0;e.angle=Math.atan2(s.player.y-y,s.player.x-x);
        }
        s.enemies=actors;s.enemyBullets=[];s.pickups=[];s.effects=[];
        s.reducedMotion=true;s.shake=0;s.toastTime=0;
        const toast=document.getElementById('toast');if(toast)toast.classList.add('hidden');
        return {bossId:boss.id,actors:actors.map(e=>({id:e.id,type:e.type,isBoss:!!e.isBoss,x:e.x,y:e.y})),
          method:'Test-only placement and increased target HP of actual final-wave actors, plus player invulnerability; real rifle and grenade input. Not an unmodified playthrough.'};}""")
    teleport(page, 4.1, 7.6)
    target = page.evaluate("""id => {const e=OutbreakDebug.getState().enemies.find(e=>e.id===id);
        return OutbreakRenderer.actorAimPoint?OutbreakRenderer.actorAimPoint(e):OutbreakRenderer.worldToScreen(e.x,e.y);}""",
        fixture["bossId"])
    require(0 < target["x"] < page.viewport_size["width"]
            and 0 < target["y"] < page.viewport_size["height"], "Reference boss is outside the viewport")
    if mobile:
        # A real aim-stick touch fires using the shipped mobile aim assist.
        ax, ay = stick_center(page, "#aimStick")
        cdp = page.context.new_cdp_session(page)
        touch(cdp, "touchStart", [(2, ax + 28, ay)])
    else:
        page.mouse.move(target["x"], target["y"])
        page.mouse.down()
    try:
        page.wait_for_function("OutbreakDebug.getState().player.clip.rifle < 30", timeout=1800)
        if mobile:
            page.locator("#grenadeButton").tap()
        else:
            page.keyboard.press("Space")
        # Shorten only the fuse, then let production grenade collision/explosion
        # create the effects. No decorative background or synthetic VFX are used.
        require(page.evaluate("""() => {const g=OutbreakDebug.getState().grenades[0];
            if(!g)return false;g.life=.45;return true;}"""), "Grenade input did not create a grenade")
        page.wait_for_function("OutbreakDebug.getState().effects.some(e=>e.kind==='explosion')", timeout=1800)
        require(page.evaluate("OutbreakDebug.getState().enemies.filter(e=>e.hp>0).length") >= 9,
                "Reference capture lost the arranged horde before the explosion")
        screenshot(page, item, "reference-battle", prefix="siege")
        fixture["effects"] = page.evaluate("OutbreakDebug.getState().effects.map(e=>e.kind)")
        fixture["renderer"] = page.evaluate("OutbreakRenderer.status()")
        item["referenceVisualFixture"] = fixture
        item["checks"].append("reference capture includes a production boss, eight mutants and real weapon/explosion effects")
    finally:
        if mobile:
            touch(cdp, "touchEnd")
            cdp.detach()
        else:
            page.mouse.up()


def verify_controlled_campaign(page, item):
    item["controlledCampaign"] = {
        "method": "Early waves accelerated by test-only damage and the production scheduler; one-hit final-wave targets, reduced enemy roster and disabled nest budgets/player damage. Real mouse/E/upgrade/shop input and production gates. No finishLevel hook.",
        "levels": [], "fullPlaythrough": False}
    for level_index in range(3):
        mode(page, "playing")
        require(state(page)["levelIndex"] == level_index, "Campaign skipped or repeated a level")
        prepare_final_wave(page, item)
        if level_index == 0:
            verify_upgrade_purchase(page, item)
        fixture = page.evaluate("""() => {const s=OutbreakDebug.getState();
            if(OutbreakDebug.snapshot().queued!==0) throw Error('Unexpected pending enemy queue');
            const boss=s.enemies.find(e=>e.isBoss||e.type==='queen');
            const brute=s.enemies.find(e=>e!==boss&&e.type==='brute')||s.enemies.find(e=>e!==boss);
            if(!brute||!boss) throw Error('Final wave needs a mutant and a boss for real projectile kills');
            for(const e of [...s.enemies])if(e!==brute&&e!==boss)OutbreakDebug.damageEnemy(e,e.hp+1,{x:e.x-1,y:e.y});
            OutbreakDebug.step(.02);
            for(const e of s.enemies){e.cooldown=1e6;e.telegraph=1e6;}
            for(const n of s.nests){n.budget=0;n.waveBudget=0;n.spawnTimer=1e6;}
            s.pickups=[];s.bullets=[];s.enemyBullets=[];s.grenades=[];s.player.invulnerable=1e6;
            s.reducedMotion=true;s.shake=0;s.spawnRemaining=s.enemies.length;
            return {bruteId:brute.id,bossId:boss.id,nests:s.nests.length,
              terminals:s.terminals.map(t=>({x:t.x,y:t.y})),exit:s.level.exit}; }""")
        level_result = {"levelIndex": level_index, "checks": []}
        item["controlledCampaign"]["levels"].append(level_result)
        teleport(page, fixture["exit"]["x"], fixture["exit"]["y"])
        page.keyboard.press("e")
        require(state(page)["mode"] == "playing" and not state(page)["exitReady"],
                "Exit allowed extraction before objectives")
        level_result["checks"].append("extraction is blocked before objectives")

        before_kills = state(page)["kills"]
        shoot_fixture_target(page, "enemy", fixture["bruteId"])
        require(state(page)["kills"] == before_kills + 1, "Projectile kill did not update kill count")
        level_result["checks"].append("manual projectile kills a controlled final-wave mutant")

        for i, terminal in enumerate(fixture["terminals"]):
            teleport(page, terminal["x"], terminal["y"])
            page.keyboard.press("e")
            page.wait_for_function("n => OutbreakDebug.snapshot().activeTerminals === n", arg=i + 1)
        require(not state(page)["exitReady"], "Terminals alone unlocked an infected sector")
        level_result["checks"].append("E activates each terminal; nests still block extraction")

        for nest_index in range(fixture["nests"]):
            cash = state(page)["player"]["cash"]
            shoot_fixture_target(page, "nest", nest_index)
            require(state(page)["player"]["cash"] == cash + 100, "Nest destruction reward is wrong")
        require(state(page)["livingNests"] == 0, "Controlled nest survived projectile damage")
        level_result["checks"].append("manual projectiles destroy every nest and award credits")

        if fixture.get("bossId") is not None:
            require(not state(page)["exitReady"], "Living boss did not block extraction")
            teleport(page, fixture["exit"]["x"], fixture["exit"]["y"])
            page.keyboard.press("e")
            require(state(page)["mode"] == "playing", "Extraction bypassed the living boss")
            screenshot(page, item, "reactor-before-boss")
            before_kills = state(page)["kills"]
            shoot_fixture_target(page, "enemy", fixture["bossId"])
            require(state(page)["kills"] == before_kills + 1, "Boss kill was not recorded")
            level_result["checks"].append("living sector boss blocks exit; real projectile kill releases the gate")
        page.wait_for_function("OutbreakDebug.snapshot().exitReady === true")
        teleport(page, fixture["exit"]["x"], fixture["exit"]["y"])
        page.keyboard.press("e")

        if level_index == 2:
            mode(page, "victory")
            require(state(page)["wave"] == 10 and state(page)["bossesKilled"] == 3,
                    "Victory did not preserve all ten waves and three defeated sector bosses")
            require(page.locator("#end").is_visible(), "Victory screen is hidden")
            require("ПРОТОКОЛ ЗАКРЫТ" in page.locator("#endTitle").inner_text(), "Wrong ending")
            require(page.evaluate("localStorage.getItem('last-frontier-outbreak-v1')") is None,
                    "Victory left an unfinished campaign checkpoint")
            screenshot(page, item, "victory")
            level_result["checks"].append("final extraction produces victory and clears the checkpoint")
            break

        mode(page, "shop")
        require(page.locator("#shop").is_visible(), "Supply shop is hidden")
        screenshot(page, item, f"shop-{level_index + 1}")
        before = state(page)["player"]
        item_id, price = ("shotgun", 340) if level_index == 0 else ("plasma", 950)
        require(before["cash"] >= price, "Controlled combat rewards cannot fund the next weapon")
        page.locator(f'[data-buy="{item_id}"]').click()
        page.wait_for_function("key => OutbreakDebug.snapshot().player.owned[key] === true", arg=item_id)
        after = state(page)["player"]
        require(after["cash"] == before["cash"] - price, "Weapon purchase charged the wrong amount")
        require(page.locator(f'[data-buy="{item_id}"]').is_disabled(), "Owned weapon can be purchased twice")
        level_result["checks"].append(f"shop buys {item_id}, deducts credits and prevents duplicate purchase")
        if level_index == 0:
            before_ammo = after["ammo"]["rifle"]
            before_cash = after["cash"]
            page.locator('[data-buy="rifleAmmo"]').click()
            after_ammo = state(page)["player"]
            require(after_ammo["ammo"]["rifle"] == before_ammo + 120
                    and after_ammo["cash"] == before_cash - 95, "Ammo purchase transaction is incorrect")
            level_result["checks"].append("shop exchanges 95 credits for 120 reserve rifle rounds")
        page.locator("#shopContinue").click()
        mode(page, "briefing")
        require(state(page)["levelIndex"] == level_index + 1, "Shop did not advance to the next level")
        require(state(page)["player"]["owned"][item_id], "Purchased weapon was lost between levels")
        if level_index == 0:
            saved_progress = state(page)["player"]
            page.reload(wait_until="load")
            mode(page, "menu")
            require(page.locator("#continue").is_visible(), "Checkpoint does not expose Continue")
            page.locator("#continue").click()
            mode(page, "briefing")
            require(state(page)["levelIndex"] == 1 and state(page)["player"]["owned"]["shotgun"],
                    "Reload/Continue lost the next sector or purchased weapon")
            restored = state(page)["player"]
            require(restored["level"] == saved_progress["level"]
                    and restored["xp"] == saved_progress["xp"]
                    and restored["upgrades"] == saved_progress["upgrades"],
                    "Reload/Continue lost earned XP or purchased upgrade tiers")
            level_result["checks"].append("page reload and Continue restore next-level checkpoint, inventory, XP and upgrade tiers")
        page.locator("#deploy").click()
        mode(page, "playing")
        level_result["checks"].append("shop continue → next-level briefing → deploy")
    item["checks"].append("controlled three-level objectives, weapon shop, checkpoint, boss and victory")


def run():
    started = time.monotonic()
    results = []
    fatal_error = None
    server = None

    def deadline(_signal, _frame):
        raise TimeoutError("Outbreak browser checks exceeded their 180 second execution budget")

    try:
        require((DIST / "index.html").is_file(), "Build app/dist before browser verification")
        SCREENSHOTS.mkdir(parents=True, exist_ok=True)
        signal.signal(signal.SIGALRM, deadline)
        signal.alarm(180)
        server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(DIST)))
        Thread(target=server.serve_forever, kwargs={"poll_interval": .05}, daemon=True).start()
        url = f"http://127.0.0.1:{server.server_port}/"
        with sync_playwright() as pw:
            managed = pw.chromium.executable_path
            executable = (os.environ.get("FRONTIER_CHROMIUM")
                          or (managed if Path(managed).is_file() else None)
                          or shutil.which("chromium") or shutil.which("google-chrome"))
            browser = pw.chromium.launch(executable_path=executable, headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader"], timeout=15000)
            for profile, width, height, mobile in PROFILES:
                item = {"profile": profile, "viewport": [width, height], "passed": False,
                        "checks": [], "screenshots": [], "pageErrors": []}
                results.append(item)
                context = browser.new_context(viewport={"width": width, "height": height},
                                              is_mobile=mobile, has_touch=mobile)
                page = context.new_page()
                page.set_default_timeout(4000)
                page.on("pageerror", lambda error, target=item: target["pageErrors"].append(str(error)))
                try:
                    page.goto(url, wait_until="load", timeout=10000)
                    require(page.evaluate("typeof window.OutbreakDebug") == "undefined",
                            "Production URL exposes the test-only debug API")
                    item["checks"].append("production URL hides the test-only state controls")
                    page.goto(url + "?test=1", wait_until="load", timeout=10000)
                    mode(page, "menu")
                    require(page.locator("#home").is_visible(), "Home screen missing")
                    require(page.locator("#continue").is_hidden(), "Fresh profile has a Continue checkpoint")
                    require(page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "Horizontal overflow")
                    page.wait_for_function("""() => {const r=OutbreakRenderer.status();
                        return r.hdAssetsReady === true && r.spriteRegions >= 16
                          && r.artDirection === 'industrial-siege-hd';}""", timeout=10000)
                    item["checks"].append("industrial HD artwork and all 16 actor/prop/weapon regions are ready")
                    screenshot(page, item, "home")
                    page.locator("#start").click()
                    mode(page, "briefing")
                    require(page.locator("#briefing").is_visible(), "Level briefing missing")
                    page.wait_for_function("OutbreakRenderer.status().assetsReady === true", timeout=10000)
                    require(page.evaluate("OutbreakRenderer.status().projection") == "2:1-isometric",
                            "Renderer is not using the intended isometric projection")
                    item["checks"].append("briefing loads game sprite assets and 2:1 projection")
                    if os.environ.get("FRONTIER_REQUIRE_PIXI") == "1":
                        page.wait_for_function("window.FrontierV6?.status().ready === true", timeout=10000)
                        item["checks"].append("bundled PixiJS renderer is ready")
                    screenshot(page, item, "briefing")
                    page.locator("#deploy").click()
                    mode(page, "playing")
                    require(page.locator("#hud").is_visible(), "Combat HUD missing")
                    page.evaluate("OutbreakDebug.getState().player.invulnerable=1e6")
                    require(state(page)["wave"] == 1 and state(page)["enemies"] >= 8,
                            "First deploy does not start wave one with a visible threat group")
                    item["checks"].append("home → level briefing → deploy")
                    if mobile:
                        verify_touch_input(page, context, item)
                        verify_touch_skills(page, item)
                    else:
                        verify_desktop_input(page, item)
                    page.locator("#pauseButton").click()
                    mode(page, "paused")
                    paused = state(page)
                    page.wait_for_timeout(120)
                    after_pause = state(page)
                    require(distance(paused, after_pause) < .001 and paused["time"] == after_pause["time"],
                            "Simulation continues while paused")
                    require(page.locator("#paused").is_visible(), "Pause panel missing")
                    page.locator("#resume").click()
                    mode(page, "playing")
                    item["checks"].append("pause freezes simulation and Resume returns to combat")
                    screenshot(page, item, "battle")
                    item["inputState"] = state(page)
                    item["renderer"] = page.evaluate("OutbreakRenderer.status()")
                    item["libraries"] = page.evaluate("window.FrontierV6?.status() ?? null")
                    if profile in ["desktop", "landscape"]:
                        verify_reference_battle(page, item, mobile=mobile)
                    if profile == "desktop":
                        verify_controlled_campaign(page, item)
                    require(not item["pageErrors"], f"JavaScript errors: {item['pageErrors']}")
                    item["passed"] = True
                except Exception as error:
                    item["error"] = str(error)
                    try:
                        screenshot(page, item, "failure")
                    except Exception:
                        pass
                finally:
                    context.close()
            browser.close()
    except Exception as error:
        fatal_error = str(error)
    finally:
        signal.alarm(0)
        if server:
            server.shutdown()
            server.server_close()
        DOCS.mkdir(parents=True, exist_ok=True)
        report = {"passed": fatal_error is None and len(results) == len(PROFILES)
                  and all(item["passed"] for item in results),
                  "durationSeconds": round(time.monotonic() - started, 2),
                  "build": "dist", "requiresPixi": os.environ.get("FRONTIER_REQUIRE_PIXI") == "1",
                  "fullCampaignPlaythrough": False, "profiles": results}
        if fatal_error:
            report["error"] = fatal_error
        REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(run())
