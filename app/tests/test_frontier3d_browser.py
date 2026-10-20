"""Exercise the bundled Three.js game through real Chromium inputs.

Controlled fixtures accelerate waves and arrange a genuine heavy enemy. They
retain production movement, skinned models, shots, damage, Cannon contacts and
reload. Evidence is not a full manual playthrough or native Android validation.
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
VIDEOS = DOCS / "videos"
REPORT = DOCS / "FRONTIER3D_BROWSER_RESULTS.json"
PROFILES = [("desktop", 1366, 768, False), ("android-landscape", 844, 390, True),
            ("android-portrait", 390, 844, True)]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def state(page):
    return page.evaluate("OutbreakDebug.snapshot()")


def mode(page, expected):
    page.wait_for_function("m => OutbreakDebug.snapshot().mode === m", arg=expected)


def screenshot(page, item, label):
    target = SCREENSHOTS / f"three-{item['profile']}-{label}.png"
    page.screenshot(path=str(target), timeout=10000)
    item["screenshots"].append(str(target.relative_to(ROOT)))


def touch(cdp, event, points=()):
    cdp.send("Input.dispatchTouchEvent", {"type": event, "touchPoints": [
        {"id": identifier, "x": x, "y": y} for identifier, x, y in points]})


def center(page, selector):
    box = page.locator(selector).bounding_box()
    require(box is not None and box["width"] > 0, f"Missing control: {selector}")
    p = (box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    require(0 < p[0] < page.viewport_size["width"] and 0 < p[1] < page.viewport_size["height"],
            f"Control outside viewport: {selector}")
    return p


def teleport(page, x, y):
    require(page.evaluate("p => OutbreakDebug.teleport(p.x,p.y)", {"x": x, "y": y}),
            "Fixture location is inside an obstacle")
    page.wait_for_timeout(450)


def fixture(page):
    return page.evaluate("""() => {
      const s=OutbreakDebug.getState();s.player.invulnerable=1e6;
      for(const n of s.nests){n.budget=0;n.waveBudget=0;n.spawnTimer=1e6;}
      for(let i=0;i<20 && s.wave<3;i++){
        for(const e of [...s.enemies])if(e.hp>0)OutbreakDebug.damageEnemy(e,e.hp+1,{x:e.x-1,y:e.y});
        OutbreakDebug.step(.04);
      }
      if(s.wave!==3||OutbreakDebug.snapshot().pendingWaves!==0)throw Error('Final wave fixture failed');
      const target=s.enemies.find(e=>e.type==='brute'&&!e.isBoss)||s.enemies.find(e=>e.type==='brute');
      if(!target)throw Error('Production wave did not spawn a heavy enemy');
      Object.assign(target,{x:9.1,y:6.5,hp:4000,maxHp:4000,cooldown:1e6,telegraph:1e6,
        charge:0,path:[],impulseVX:0,impulseVY:0,moveSpeed:0,alerted:true});
      s.enemies=[target];s.enemyBullets=[];s.bullets=[];s.grenades=[];
      s.corpses=[];s.effects=[];s.pickups=[];s.shake=0;
      Object.assign(s.player,{weapon:'rifle',reload:0,cooldown:0,grenades:3});
      s.player.clip.rifle=30;s.player.ammo.rifle=180;
      return {targetId:target.id,targetType:target.type,
        method:'Production final-wave heavy enemy with controlled placement/HP, invulnerable player and disabled nest budget. Production inputs and simulation; not a manual campaign playthrough.'};
    }""")


def pose(page):
    return page.evaluate("Frontier3D.status().animation")


def audio_status(page):
    return page.evaluate("FrontierAudio.status()")


def verify_audio_started(page, item):
    page.wait_for_function("""() => {
      const a=window.FrontierAudio?.status();
      return a?.audioReady && a.musicPlaying && a.ambiencePlaying;
    }""", timeout=10000)
    measured = audio_status(page)
    expected = {"rifle", "pistol", "shotgun", "plasma", "reload", "grenade", "ambience", "music"}
    require(set(measured["loaded"]) == expected and measured["total"] == 8,
            "Not all eight production WAV assets decoded in the actual browser")
    require(measured["unlocked"] and not measured["muted"] and measured["mode"] == "playing",
            "Trusted start/deploy input failed to unlock the playing audio context")
    require(not measured["errors"], f"Web Audio errors: {measured['errors']}")
    item.setdefault("audio", {})["started"] = measured
    item["checks"].append("trusted start/deploy inputs unlock Web Audio, decode eight WAVs and start music and ambience")


def verify_movement(page, context, item, mobile):
    before = state(page)["player"]
    samples = []
    cdp = None
    if mobile:
        require(page.locator("#touchControls").is_visible(), "Android touch controls hidden")
        mx, my = center(page, "#moveStick")
        ax, ay = center(page, "#aimStick")
        cdp = context.new_cdp_session(page)
        touch(cdp, "touchStart", [(1, mx, my), (2, ax, ay)])
        page.wait_for_timeout(180)
        centered = state(page)["player"]
        require(math.hypot(centered["x"]-before["x"], centered["y"]-before["y"]) < .02,
                "Centered touch stick drifts")
        require(centered["clip"] == before["clip"], "Centered aim stick fires")
        touch(cdp, "touchMove", [(1, mx + 28, my), (2, ax + 28, ay)])
    else:
        page.keyboard.down("d")
    try:
        page.wait_for_function("OutbreakDebug.getState().player.moveSpeed > .8", timeout=4000)
        for i in range(5):
            page.wait_for_timeout(85)
            samples.append(pose(page))
            if i == 2:
                screenshot(page, item, "walking")
    finally:
        if cdp:
            touch(cdp, "touchEnd")
            cdp.detach()
        else:
            page.keyboard.up("d")
    after = state(page)["player"]
    require(math.hypot(after["x"]-before["x"], after["y"]-before["y"]) > .15,
            "Real movement input did not move the player")
    require(all(sample and sample.get("playerBones") for sample in samples),
            "Renderer exposes no measured skeletal poses")
    require(len({json.dumps(sample["playerBones"]) for sample in samples}) >= 3,
            "Walking translates the model without changing its actual bone transforms")
    if mobile:
        require(after["clip"]["rifle"] < before["clip"]["rifle"],
                "Simultaneous movement and aim touch did not fire")
    page.wait_for_function("OutbreakDebug.getState().player.moveSpeed < .03", timeout=4000)
    item["walking"] = {"before": before, "after": after, "sampledSkeletalPoses": samples}
    item["checks"].append("real multitouch movement and firing with changing skeletal poses" if mobile
                          else "real WASD movement with changing skeletal bone transforms")


def verify_muzzle(page, item):
    # Sampling and one production fire call share a JS task, eliminating timing
    # noise while preserving the real socket, weapon and projectile code.
    measured = page.evaluate("""() => {
      const s=OutbreakDebug.getState(),p=s.player;p.angle=0;p.cooldown=0;p.reload=0;
      const muzzle=OutbreakRenderer.muzzleFor(p,p.weapon);s.bullets=[];
      OutbreakDebug.fire();const b=s.bullets[0];
      const effect=s.effects.filter(e=>e.kind==='muzzle').at(-1);
      return {body:{x:p.x,y:p.y},muzzle,bullet:b?{x:b.x,y:b.y,startX:b.startX,startY:b.startY,height:b.height}:null,
        effect:effect?{x:effect.x,y:effect.y,height:effect.height}:null};
    }""")
    b, m, body, fx = measured["bullet"], measured["muzzle"], measured["body"], measured["effect"]
    require(b is not None and fx is not None, "Production rifle failed to create bullet and muzzle flash")
    require(math.hypot(m["x"]-body["x"], m["y"]-body["y"]) > .45,
            "Gun socket is located in the character's body")
    require(math.hypot(b["startX"]-m["x"], b["startY"]-m["y"]) < .001,
            "Bullet originates outside the actual 3D weapon socket")
    require(math.hypot(fx["x"]-m["x"], fx["y"]-m["y"]) < .001,
            "Muzzle flash originates outside the actual 3D weapon socket")
    require(b.get("height") is not None and abs(b["height"]-m["height"]) < .001,
            "Bullet height differs from the model's barrel")
    item["muzzleMeasurement"] = measured
    item["checks"].append("actual bullet and flash start at the model's 3D gun socket, away from the body")


def verify_target_and_reload(page, context, item, mobile):
    target_id = item["fixture"]["targetId"]
    page.evaluate("""id=>{const s=OutbreakDebug.getState(),e=s.enemies.find(e=>e.id===id);
      Object.assign(e,{x:9.1,y:6.5,impulseVX:0,impulseVY:0});s.player.cooldown=0;
      s.player.clip.rifle=30;}""", target_id)
    target = page.evaluate("""id=>{const s=OutbreakDebug.getState(),e=s.enemies.find(e=>e.id===id);
      return {hp:e.hp,point:OutbreakRenderer.actorAimPoint(e),
        playerPoint:OutbreakRenderer.worldToScreen(s.player.x,s.player.y)};}""", target_id)
    audio_before = audio_status(page)
    cdp = None
    if mobile:
        # A real browser touch moves the aim stick in the visible target's screen
        # direction; the production assist then chooses the actual target.
        ax, ay = center(page, "#aimStick")
        dx = target["point"]["x"] - target["playerPoint"]["x"]
        # Aim uses the floor direction, since stick vectors map to world movement.
        floor = page.evaluate("""id=>{const e=OutbreakDebug.getState().enemies.find(e=>e.id===id);
          return OutbreakRenderer.worldToScreen(e.x,e.y);}""", target_id)
        dy = floor["y"] - target["playerPoint"]["y"]
        length = max(.01, math.hypot(dx, dy))
        cdp = context.new_cdp_session(page)
        touch(cdp, "touchStart", [(1, ax, ay)])
        touch(cdp, "touchMove", [(1, ax + dx/length*28, ay + dy/length*28)])
    else:
        page.mouse.move(target["point"]["x"], target["point"]["y"])
        page.mouse.down()
    try:
        page.wait_for_function("""t=>{const e=OutbreakDebug.getState().enemies.find(e=>e.id===t.id);
          return e&&e.hp<t.hp;}""", arg={"id": target_id, "hp": target["hp"]}, timeout=5000)
        page.wait_for_function("""count=>{const a=FrontierAudio.status();
          return a.playCount>count && a.lastSound==='rifle';}""",
          arg=audio_before["playCount"], timeout=2500)
        audio_after = audio_status(page)
        screenshot(page, item, "rifle-hit")
    finally:
        if cdp:
            touch(cdp, "touchEnd")
            cdp.detach()
        else:
            page.mouse.up()
    item["checks"].append("real aim/fire input hits the production heavy enemy with rifle projectiles")
    item["audio"]["rifle"] = {"before": audio_before, "after": audio_after}
    item["checks"].append("real rifle firing starts a decoded rifle sound source and advances audio playCount")
    before = state(page)["player"]
    require(before["clip"]["rifle"] < 30, "Real rifle input consumed no ammunition")
    if mobile:
        page.locator("#reloadButton").tap()
    else:
        page.keyboard.press("r")
    page.wait_for_function("OutbreakDebug.getState().player.reload > 0", timeout=1500)
    page.wait_for_function("FrontierAudio.status().lastSound === 'reload'", timeout=1500)
    item["audio"]["reload"] = audio_status(page)
    reload_pose = pose(page)
    page.wait_for_timeout(220)
    later_pose = pose(page)
    require(reload_pose["playerBones"] != later_pose["playerBones"],
            "Reload timer advances but the actual skeletal weapon pose is static")
    item["reloadPoses"] = [reload_pose, later_pose]
    screenshot(page, item, "reload")
    page.wait_for_function("OutbreakDebug.getState().player.reload === 0", timeout=5000)
    after = state(page)["player"]
    require(after["clip"]["rifle"] == 30, "Reload failed to refill the rifle magazine")
    require(before["clip"]["rifle"] + before["ammo"]["rifle"] == after["clip"]["rifle"] + after["ammo"]["rifle"],
            "Reload created or destroyed ammunition")
    item["checks"].append("manual reload completes while conserving magazine and reserve ammunition")


def frozen_state(page):
    return page.evaluate("""() => {const s=OutbreakDebug.getState();return {time:s.time,
      player:{x:s.player.x,y:s.player.y,anim:s.player.anim},
      grenades:s.grenades.map(g=>({x:g.x,y:g.y,z:g.z,vz:g.vz,life:g.life})),
      bones:Frontier3D.status().animation.playerBones};}""")


def verify_grenade_pause(page, item, mobile):
    page.evaluate("""() => {
      const s=OutbreakDebug.getState();s.player.angle=Math.PI/2;
      const trace=window.__threeGrenade={samples:[],started:false,done:false,exploded:false};
      function sample(){const s=OutbreakDebug.getState(),g=s.grenades[0];
        if(g){trace.started=true;const previous=trace.samples.at(-1);
          if(!previous||previous.life!==g.life)trace.samples.push({x:g.x,y:g.y,z:g.z,vz:g.vz,
            bounces:g.bounces,life:g.life,physical3D:g.physical3D});
        }else if(trace.started){trace.done=true;trace.exploded=s.effects.some(e=>e.kind==='explosion');return;}
        requestAnimationFrame(sample);}
      requestAnimationFrame(sample);
    }""")
    if mobile:
        page.locator("#grenadeButton").tap()
    else:
        page.keyboard.press("Space")
    page.wait_for_function("OutbreakDebug.getState().grenades.some(g=>g.physical3D)", timeout=2000)
    page.locator("#pauseButton").click()
    mode(page, "paused")
    page.wait_for_function("""() => {const a=FrontierAudio.status();
      return a.mode==='paused' && !a.musicPlaying && !a.ambiencePlaying;}""", timeout=2000)
    paused_audio = audio_status(page)
    page.wait_for_timeout(100)
    before = frozen_state(page)
    page.wait_for_timeout(180)
    after = frozen_state(page)
    require(before == after, "Pause changes rigid-body positions, simulation time or skeletal bones")
    screenshot(page, item, "paused")
    page.locator("#resume").click()
    mode(page, "playing")
    page.wait_for_function("FrontierAudio.status().musicPlaying && FrontierAudio.status().ambiencePlaying",
                           timeout=2000)
    item["audio"]["pause"] = {"paused": paused_audio, "resumed": audio_status(page)}
    screenshot(page, item, "grenade-airborne")
    page.wait_for_function("window.__threeGrenade.done", timeout=5000)
    trace = page.evaluate("window.__threeGrenade")
    samples = trace["samples"]
    require(trace["exploded"], "Natural grenade fuse produced no explosion")
    require(len(samples) >= 4, "Grenade arc has insufficient actual simulation samples")
    require(any(s.get("physical3D") for s in samples), "Grenade did not run through Cannon rigid-body solver")
    require(all(s["z"] >= 0 for s in samples), "Grenade penetrated the floor")
    require(any(s["vz"] > 0 for s in samples) and any(s["vz"] < 0 for s in samples),
            "Grenade did not rise and descend under gravity")
    require(max(s["bounces"] for s in samples) > 0, "No physical grenade contact before natural fuse expired")
    require(page.evaluate("Frontier3D.status().physicsContacts") > 0,
            "Cannon reported no actual contact event")
    item["grenade"] = {"samples": samples, "pausedState": before, "pauseUnchanged": before == after}
    item["checks"].extend(["Cannon grenade rises, falls, contacts the floor and explodes on its natural fuse",
                            "pause freezes the simulation, physical grenade and actual skeletal transforms",
                            "pause stops music and ambience sources; resume restarts both loops"])


def verify_mute_persistence(page, item):
    page.locator("#pauseButton").click()
    mode(page, "paused")
    page.locator("#quit").click()
    mode(page, "menu")
    page.locator("#mute").click()
    page.wait_for_function("FrontierAudio.status().muted === true")
    require(page.evaluate("localStorage.getItem('last-frontier-audio-muted')") == "true",
            "Mute button did not persist its preference")
    require(page.locator("#mute").get_attribute("aria-pressed") == "true",
            "Mute button accessibility state disagrees with the audio setting")
    page.reload(wait_until="load", timeout=15000)
    page.wait_for_function("window.Frontier3D?.status().ready === true", timeout=15000)
    mode(page, "menu")
    persisted = audio_status(page)
    require(persisted["muted"] and not persisted["musicPlaying"] and not persisted["ambiencePlaying"],
            "Mute preference or silent audio state was lost on page reload")
    require(page.locator("#mute").get_attribute("aria-pressed") == "true",
            "Reloaded mute button does not show the persisted audio setting")
    page.locator("#mute").click()
    page.wait_for_function("FrontierAudio.status().muted === false")
    require(page.evaluate("localStorage.getItem('last-frontier-audio-muted')") == "false",
            "Unmute did not update its saved preference")
    require(page.locator("#mute").get_attribute("aria-pressed") == "false",
            "Unmute button accessibility state did not update")
    page.locator("#start").click()
    mode(page, "briefing")
    page.locator("#deploy").click()
    mode(page, "playing")
    page.wait_for_function("FrontierAudio.status().audioReady && FrontierAudio.status().musicPlaying",
                           timeout=10000)
    item["audio"]["mutePersistence"] = {"afterReload": persisted, "afterUnmuteAndDeploy": audio_status(page)}
    item["checks"].append("real mute button persists through reload, updates accessibility state and allows music after unmute")


def run():
    started = time.monotonic()
    results, fatal_error, server = [], None, None

    def deadline(_signal, _frame):
        raise TimeoutError("Three.js browser checks exceeded their 180 second budget")

    try:
        require((DIST / "index.html").is_file(), "Build app/dist before browser verification")
        SCREENSHOTS.mkdir(parents=True, exist_ok=True)
        VIDEOS.mkdir(parents=True, exist_ok=True)
        signal.signal(signal.SIGALRM, deadline)
        signal.alarm(180)
        server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(DIST)))
        Thread(target=server.serve_forever, kwargs={"poll_interval": .05}, daemon=True).start()
        url = f"http://127.0.0.1:{server.server_port}/"
        with sync_playwright() as pw:
            managed = pw.chromium.executable_path
            executable = (os.environ.get("FRONTIER_CHROMIUM") or
                          (managed if Path(managed).is_file() else None) or
                          shutil.which("chromium") or shutil.which("google-chrome"))
            browser = pw.chromium.launch(executable_path=executable, headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader"], timeout=15000)
            for profile, width, height, mobile in PROFILES:
                item = {"profile": profile, "viewport": [width, height], "passed": False,
                        "checks": [], "screenshots": [], "pageErrors": [],
                        "requestFailures": [], "artifactErrors": []}
                results.append(item)
                video_options = ({"record_video_dir": str(VIDEOS),
                                  "record_video_size": {"width": 1280, "height": 720}} if not mobile else {})
                context = browser.new_context(viewport={"width": width, "height": height},
                    is_mobile=mobile, has_touch=mobile, **video_options)
                page = context.new_page()
                page.set_default_timeout(5000)
                video = page.video
                page.on("pageerror", lambda error, result=item: result["pageErrors"].append(str(error)))
                page.on("requestfailed", lambda request, result=item: result["requestFailures"].append(
                    {"url": request.url, "failure": request.failure}) if len(result["requestFailures"]) < 30 else None)
                try:
                    if not mobile:
                        page.goto(url, wait_until="load", timeout=15000)
                        require(page.evaluate("typeof window.OutbreakDebug") == "undefined",
                                "Production URL exposes mutable debug controls")
                        item["checks"].append("production URL hides mutable test controls")
                    page.goto(url + "?test=1", wait_until="load", timeout=15000)
                    page.wait_for_function("window.Frontier3D?.status().ready === true", timeout=15000)
                    mode(page, "menu")
                    initial_audio = audio_status(page)
                    require(not initial_audio["unlocked"] and not initial_audio["musicPlaying"]
                            and not initial_audio["ambiencePlaying"] and initial_audio["playCount"] == 0,
                            "Audio started before a trusted browser input")
                    item["audio"] = {"beforeTrustedInput": initial_audio}
                    item["checks"].append("audio stays silent before the first trusted browser input")
                    require(page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "Horizontal overflow")
                    page.locator("#start").click()
                    mode(page, "briefing")
                    page.locator("#deploy").click()
                    mode(page, "playing")
                    verify_audio_started(page, item)
                    page.wait_for_function("Frontier3D.status().skinnedMeshes >= 2", timeout=6000)
                    rendered = page.evaluate("OutbreakRenderer.status()")
                    require(rendered["renderer"] == "three-webgl" and rendered["models"] == 4,
                            "Actual bundled Three.js renderer did not load all four glTF models")
                    require(rendered["camera"] == "orthographic-3d" and rendered["physics"] == "cannon-es",
                            "3D camera or Cannon physics adapter missing")
                    require(rendered["drawCalls"] > 0 and rendered["triangles"] > 0,
                            "WebGL drew no mesh geometry")
                    item["checks"].append("normal menu → briefing → deploy loads real skinned glTF meshes and WebGL geometry")
                    item["fixture"] = fixture(page)
                    teleport(page, 6.5, 6.5)
                    screenshot(page, item, "battle")
                    verify_movement(page, context, item, mobile)
                    teleport(page, 6.5, 6.5)
                    verify_muzzle(page, item)
                    verify_target_and_reload(page, context, item, mobile)
                    verify_grenade_pause(page, item, mobile)
                    item["renderer"] = page.evaluate("OutbreakRenderer.status()")
                    verify_mute_persistence(page, item)
                    require(not audio_status(page)["errors"], "Web Audio reported an asset or playback error")
                    require(not item["pageErrors"], f"JavaScript errors: {item['pageErrors']}")
                    item["passed"] = True
                except Exception as error:
                    item["error"] = str(error)
                    try:
                        item["failureState"] = page.evaluate("""() => ({
                          mode:window.OutbreakDebug?.snapshot().mode,
                          renderer:window.Frontier3D?.status(), audio:window.FrontierAudio?.status()
                        })""")
                    except Exception as evidence_error:
                        item["artifactErrors"].append(f"Failure state: {evidence_error}")
                    try:
                        screenshot(page, item, "failure")
                    except Exception as evidence_error:
                        item["artifactErrors"].append(f"Failure screenshot: {evidence_error}")
                finally:
                    try:
                        context.close()
                    except Exception as evidence_error:
                        item["passed"] = False
                        item["artifactErrors"].append(f"Context/video finalization: {evidence_error}")
                    if video:
                        try:
                            target = VIDEOS / f"three-{profile}.webm"
                            Path(video.path()).replace(target)
                            item["video"] = str(target.relative_to(ROOT))
                        except Exception as evidence_error:
                            item["passed"] = False
                            item["artifactErrors"].append(f"Video evidence: {evidence_error}")
            browser.close()
    except Exception as error:
        fatal_error = str(error)
    finally:
        signal.alarm(0)
        if server:
            server.shutdown()
            server.server_close()
        DOCS.mkdir(parents=True, exist_ok=True)
        report = {"passed": fatal_error is None and len(results) == len(PROFILES) and all(p["passed"] for p in results),
                  "durationSeconds": round(time.monotonic()-started, 2), "build": "dist-vite",
                  "renderer": "three-webgl", "fullCampaignPlaythrough": False,
                  "nativeAndroidDeviceTested": False,
                  "audioVerification": "Decoded production WAVs and active Web Audio sources after trusted inputs; physical speaker output and subjective mix quality were not assessed.",
                  "profiles": results}
        if fatal_error:
            report["error"] = fatal_error
        REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(run())
