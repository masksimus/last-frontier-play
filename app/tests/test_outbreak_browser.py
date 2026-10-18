"""Chromium checks for the actual built isometric game.

Three real input profiles exercise the ordinary UI. A separate desktop fixture
uses the ?test=1-only state API to shorten combat (one-hit targets and a small
enemy roster); objectives, projectile hits, shop transactions and transitions
still use production code and UI input. This is not a full campaign playthrough.
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


def screenshot(page, item, view):
    target = SCREENSHOTS / f"outbreak-{item['profile']}-{view}.png"
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


def teleport(page, x, y):
    require(page.evaluate("p => OutbreakDebug.teleport(p.x,p.y)", {"x": x, "y": y}),
            f"Fixture teleport rejected a walkable position: {x}, {y}")
    # Wait for the production camera to catch up. Aim coordinates then use the
    # actual renderer projection rather than a guessed screen offset.
    page.wait_for_function("""() => { const s=OutbreakDebug.getState();
        const p=OutbreakRenderer.worldToScreen(s.player.x,s.player.y);
        return Math.abs(p.x-innerWidth*.5)<4 && Math.abs(p.y-innerHeight*.48)<4; }""",
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
    point = page.evaluate("p => OutbreakRenderer.worldToScreen(p.x,p.y)", target)
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


def verify_controlled_campaign(page, item):
    item["controlledCampaign"] = {
        "method": "One-hit target HP, reduced enemy roster, disabled nest spawning and damage; real mouse/E/shop input and production transitions. No finishLevel hook.",
        "levels": [], "fullPlaythrough": False}
    for level_index in range(3):
        mode(page, "playing")
        require(state(page)["levelIndex"] == level_index, "Campaign skipped or repeated a level")
        fixture = page.evaluate("""() => {const s=OutbreakDebug.getState();
            if(OutbreakDebug.snapshot().queued!==0) throw Error('Unexpected pending enemy queue');
            const brute=s.enemies.find(e=>e.type==='brute');
            const queen=s.enemies.find(e=>e.type==='queen');
            if(!brute) throw Error('Level has no brute to exercise a real projectile kill');
            s.enemies=s.enemies.filter(e=>e===brute||e===queen);
            for(const e of s.enemies){e.cooldown=1e6;e.telegraph=1e6;}
            for(const n of s.nests){n.budget=0;n.spawnTimer=1e6;}
            s.pickups=[];s.enemyBullets=[];s.player.invulnerable=1e6;
            s.reducedMotion=true;s.shake=0;s.spawnRemaining=s.enemies.length;
            return {bruteId:brute.id,queenId:queen?.id,nests:s.nests.length,
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
        level_result["checks"].append("manual projectile kills a controlled brute")

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

        if fixture.get("queenId") is not None:
            require(not state(page)["exitReady"], "Living boss did not block extraction")
            teleport(page, fixture["exit"]["x"], fixture["exit"]["y"])
            page.keyboard.press("e")
            require(state(page)["mode"] == "playing", "Extraction bypassed the living queen")
            screenshot(page, item, "reactor-before-boss")
            before_kills = state(page)["kills"]
            shoot_fixture_target(page, "enemy", fixture["queenId"])
            require(state(page)["kills"] == before_kills + 1, "Queen kill was not recorded")
            level_result["checks"].append("living queen blocks exit; real projectile kill releases the gate")
        page.wait_for_function("OutbreakDebug.snapshot().exitReady === true")
        teleport(page, fixture["exit"]["x"], fixture["exit"]["y"])
        page.keyboard.press("e")

        if level_index == 2:
            mode(page, "victory")
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
            page.reload(wait_until="load")
            mode(page, "menu")
            require(page.locator("#continue").is_visible(), "Checkpoint does not expose Continue")
            page.locator("#continue").click()
            mode(page, "briefing")
            require(state(page)["levelIndex"] == 1 and state(page)["player"]["owned"]["shotgun"],
                    "Reload/Continue lost the next sector or purchased weapon")
            level_result["checks"].append("page reload and Continue restore next-level checkpoint with inventory")
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
        raise TimeoutError("Outbreak browser checks exceeded their 150 second execution budget")

    try:
        require((DIST / "index.html").is_file(), "Build app/dist before browser verification")
        SCREENSHOTS.mkdir(parents=True, exist_ok=True)
        signal.signal(signal.SIGALRM, deadline)
        signal.alarm(150)
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
                    screenshot(page, item, "home")
                    page.locator("#start").click()
                    mode(page, "briefing")
                    require(page.locator("#briefing").is_visible(), "Level briefing missing")
                    page.wait_for_function("OutbreakRenderer.status().assetsReady === true", timeout=10000)
                    require(page.evaluate("OutbreakRenderer.status().projection") == "2:1-isometric",
                            "Renderer is not using the intended isometric projection")
                    item["checks"].append("briefing loads original Blender sprite assets and 2:1 projection")
                    if os.environ.get("FRONTIER_REQUIRE_PIXI") == "1":
                        page.wait_for_function("window.FrontierV6?.status().ready === true", timeout=10000)
                        item["checks"].append("bundled PixiJS renderer is ready")
                    screenshot(page, item, "briefing")
                    page.locator("#deploy").click()
                    mode(page, "playing")
                    require(page.locator("#hud").is_visible(), "Combat HUD missing")
                    item["checks"].append("home → level briefing → deploy")
                    if mobile:
                        verify_touch_input(page, context, item)
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
