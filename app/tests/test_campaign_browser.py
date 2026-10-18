"""Release browser smoke. Run directly after build_release.py (45 second budget).

The HTTP server and Chromium intentionally share one process/network namespace.
Requires Playwright and Chromium (system or Playwright-managed).
The page under test only uses the local release server.
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
REPORT = DOCS / "CAMPAIGN_BROWSER_RESULTS.json"
PROFILES = [("desktop", 1366, 768, False), ("mobile", 390, 844, True),
            ("landscape", 844, 390, True)]
STARTED = time.monotonic()
results = []
fatal_error = None
server = None
browser = None


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def state(page):
    return page.evaluate("window.__FRONTIER_QA__.get()")


def distance(before, after):
    return math.hypot(after["x"] - before["x"], after["y"] - before["y"])


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def mode(page, expected):
    page.wait_for_function("m => window.__FRONTIER_QA__?.get().mode === m",
                           arg=expected, timeout=2500)


def screenshot(page, profile, view):
    target = SCREENSHOTS / f"rc-{profile}-{view}.png"
    page.screenshot(path=str(target), animations="disabled", timeout=3000)
    return str(target.relative_to(ROOT))


def touch(cdp, event, x=None, y=None):
    points = [] if event == "touchEnd" else [{"x": x, "y": y}]
    cdp.send("Input.dispatchTouchEvent", {"type": event, "touchPoints": points})


def deadline(_signal, _frame):
    raise TimeoutError("Browser smoke exceeded the 45 second execution budget")


if __name__ == "__main__":
    try:
        require((DIST / "index.html").is_file(), "Build app/dist before browser verification")
        SCREENSHOTS.mkdir(parents=True, exist_ok=True)
        signal.signal(signal.SIGALRM, deadline)
        signal.alarm(45)
        server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(DIST)))
        Thread(target=server.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True).start()
        url = f"http://127.0.0.1:{server.server_port}/"
        with sync_playwright() as pw:
            browser = pw.chromium.launch(
                executable_path=(os.environ.get("FRONTIER_CHROMIUM") or shutil.which("chromium")
                                 or shutil.which("google-chrome") or pw.chromium.executable_path),
                headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage"], timeout=8000)
            for profile, width, height, mobile in PROFILES:
                require(time.monotonic() - STARTED < 42, "Browser smoke budget exhausted")
                item = {"profile": profile, "viewport": [width, height], "passed": False,
                        "checks": [], "screenshots": [], "pageErrors": []}
                results.append(item)
                context = browser.new_context(viewport={"width": width, "height": height},
                                              is_mobile=mobile, has_touch=mobile)
                page = context.new_page()
                page.set_default_timeout(3000)
                page.on("pageerror", lambda error, target=item: target["pageErrors"].append(str(error)))
                try:
                    page.goto(url, wait_until="load", timeout=6000)
                    mode(page, "menu")
                    require(page.locator("#home").is_visible(), "Home screen missing")
                    require(page.locator("#continue").is_hidden(), "Empty save shows Continue")
                    require(page.locator("#difficulty").input_value() == "standard", "Wrong default difficulty")
                    require(page.evaluate("document.documentElement.scrollWidth <= innerWidth"),
                            "Horizontal overflow")
                    item["screenshots"].append(screenshot(page, profile, "home"))
                    item["checks"].append("home and difficulty")

                    page.locator("#start").click()
                    mode(page, "briefing")
                    require(page.locator("#briefing").is_visible(), "Sector briefing missing")
                    require(page.locator("#sectorBriefTitle").inner_text().startswith("A–07"),
                            "Unexpected first sector")
                    item["screenshots"].append(screenshot(page, profile, "briefing"))
                    # Wait while the briefing keeps combat paused. Cold CI image
                    # decoding must not consume the player's first combat seconds.
                    page.wait_for_function(
                        """() => { const s = window.__FRONTIER_QA__.get();
                        return s.animatedSpritesReady && s.terrainReady && s.fxAssetsLoaded; }""",
                        timeout=6000)
                    item["checks"].append("original character atlases, terrain and effects loaded")
                    page.locator("#deploy").click()
                    mode(page, "running")
                    require(page.locator("#hud").is_visible(), "HUD missing during combat")
                    item["checks"].append("start → briefing → deploy")

                    before = state(page)
                    if mobile:
                        require(page.locator("#controls").is_visible(), "Touch controls hidden")
                        ring = page.locator("#stickZone .ring").bounding_box()
                        require(ring is not None, "Joystick ring missing")
                        cx, cy = ring["x"] + ring["width"] / 2, ring["y"] + ring["height"] / 2
                        cdp = context.new_cdp_session(page)
                        touch(cdp, "touchStart", cx, cy)
                        page.wait_for_timeout(180)
                        centered = state(page)
                        touch(cdp, "touchEnd")
                        require(distance(before, centered) < 1, f"Joystick centre drifts: {distance(before, centered):.2f}")
                        item["checks"].append("joystick centre stays still")
                        touch(cdp, "touchStart", cx + 32, cy)
                        try:
                            page.wait_for_function("x => window.__FRONTIER_QA__.get().x > x + 5",
                                                   arg=centered["x"], timeout=1800)
                        finally:
                            touch(cdp, "touchEnd")
                        item["checks"].append("real touch moves player")
                    else:
                        page.keyboard.down("d")
                        try:
                            page.wait_for_function("x => window.__FRONTIER_QA__.get().x > x + 5",
                                                   arg=before["x"], timeout=1800)
                        finally:
                            page.keyboard.up("d")
                        item["checks"].append("keyboard moves player")
                    moved = state(page)
                    item["movementPixels"] = round(distance(before, moved), 2)

                    page.locator("#pauseButton").click()
                    mode(page, "paused")
                    require(page.locator("#paused").is_visible(), "Pause modal missing")
                    paused = state(page)
                    page.wait_for_timeout(90)
                    require(distance(paused, state(page)) < 0.1, "Player moves while paused")
                    page.locator("#resume").click()
                    mode(page, "running")
                    item["checks"].append("pause and resume")

                    # Exercise a real objective update and real upgrade selection without
                    # waiting for an entire wave; the hooks only place/trigger the player.
                    if profile == "desktop":
                        page.evaluate("window.__FRONTIER_QA__.setPosition(530, 480)")
                        page.wait_for_function("window.__FRONTIER_QA__.get().objectives[0] > 0.1", timeout=1800)
                        item["checks"].append("relay charges in simulation")
                        page.evaluate("window.__FRONTIER_QA__.forceUpgrade()")
                        mode(page, "upgrading")
                        page.locator(".upgradeCard").first.click()
                        mode(page, "running")
                        item["checks"].append("upgrade selection resumes combat")
                    item["screenshots"].append(screenshot(page, profile, "battle"))
                    item["state"] = state(page)
                    require(not item["pageErrors"], f"JavaScript errors: {item['pageErrors']}")
                    item["passed"] = True
                except Exception as error:
                    item["error"] = str(error)
                finally:
                    context.close()
            browser.close()
            browser = None
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
                  "durationSeconds": round(time.monotonic() - STARTED, 2),
                  "build": "dist", "profiles": results}
        if fatal_error:
            report["error"] = fatal_error
        REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
        print(json.dumps(report, ensure_ascii=False, indent=2))

    sys.exit(0 if report["passed"] else 1)
