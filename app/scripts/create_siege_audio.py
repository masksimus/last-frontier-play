#!/usr/bin/env python3
"""Rebuild the original Siege soundtrack and effects; Python standard library only.

No recordings, samples, sound fonts, or existing compositions are used. All output
is deterministic, mono PCM16 at 22050 Hz. See assets/sounds/siege-license.txt.
"""
from array import array
from hashlib import sha256
from math import exp, pi, sin, tanh
from pathlib import Path
import json
import random
import sys
import wave

RATE = 22050
TAU = 2 * pi
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets" / "sounds"


def blank(seconds):
    return array("d", [0.0]) * round(seconds * RATE)


def add(target, source, start=0.0, volume=1.0, wrap=False):
    offset = round(start * RATE)
    for i, value in enumerate(source):
        index = offset + i
        if wrap:
            index %= len(target)
        elif index >= len(target):
            break
        if index >= 0:
            target[index] += value * volume


def noise(seconds, seed, decay=10, lowpass=.25, highpass=0):
    rng = random.Random(seed)
    result = blank(seconds)
    low = previous = 0.0
    for i in range(len(result)):
        t = i / RATE
        low += lowpass * (rng.uniform(-1, 1) - low)
        value = low - previous * highpass
        previous = low
        result[i] = value * exp(-t * decay) * min(1, t * 2500)
    return result


def tone(seconds, frequency, decay, gain=1, bend=0, harmonics=.0):
    result = blank(seconds)
    phase = 0.0
    for i in range(len(result)):
        t = i / RATE
        phase += TAU * (frequency + bend * exp(-t * 30)) / RATE
        result[i] = gain * (sin(phase) + harmonics * sin(phase * 2.01)) * exp(-t * decay) * min(1, t * 1800)
    return result


def mechanical_click(seed, heavy=False):
    result = noise(.085 if heavy else .045, seed, 70 if heavy else 110, .7)
    add(result, tone(.08, 940 if heavy else 1780, 85, .25, harmonics=.3))
    return result


def report(name, seed, seconds, body, crack, weight):
    result = blank(seconds)
    add(result, noise(seconds, seed, 17, .28), volume=weight)
    add(result, noise(.07, seed + 1, 90, .94, .65), volume=crack)
    add(result, tone(seconds, body, 25, .85, bend=120, harmonics=.23))
    add(result, tone(.14, 74, 31, .35, bend=25))
    # Early outdoor reflections, followed by a quieter receiver/bolt return.
    reflection = noise(seconds * .55, seed + 2, 26, .12)
    add(result, reflection, .033, .38)
    add(result, reflection, .072, .16)
    add(result, mechanical_click(seed + 3), .105 if name == "rifle" else .14, .27)
    return result


def effects():
    rifle = report("rifle", 8120, .32, 163, 1.4, 1.45)
    pistol = report("pistol", 9120, .34, 218, 1.25, 1.1)
    shotgun = report("shotgun", 10120, .58, 88, 1.05, 2.3)
    add(shotgun, noise(.32, 10125, 8, .08), .035, .7)
    add(shotgun, noise(.07, 10126, 24, .5), .36, .45)
    add(shotgun, mechanical_click(10127, True), .46, .65)
    plasma = blank(.58)
    add(plasma, tone(.48, 119, 8, .7, bend=470, harmonics=.3))
    add(plasma, noise(.3, 11120, 14, .18), volume=.45)
    for frequency in (610, 937, 1391):
        add(plasma, tone(.45, frequency, 12, .1, bend=160), .015)
    reload = blank(1.25)
    for i, (at, volume, heavy) in enumerate(((.0, .7, False), (.18, .45, False), (.55, 1, True), (.86, .6, False), (1.04, .9, True))):
        add(reload, mechanical_click(12120 + i, heavy), at, volume)
    add(reload, noise(.19, 12129, 8, .18), .64, .22)
    grenade = blank(1.25)
    add(grenade, noise(1.25, 13120, 5, .09), volume=2.5)
    add(grenade, noise(.08, 13121, 65, .8), volume=.85)
    add(grenade, tone(.75, 47, 6, .8, bend=58, harmonics=.3))
    for i, at in enumerate((.12, .21, .32, .48, .67)):
        add(grenade, mechanical_click(13130 + i), at, .23 * (1 - at))
    return dict(rifle=rifle, pistol=pistol, shotgun=shotgun, plasma=plasma, reload=reload, grenade=grenade)


def ambience():
    result = blank(7)
    rng = random.Random(21017)
    raw = array("d", (rng.uniform(-1, 1) for _ in result))
    wind = blank(7)
    low = 0.0
    # Warm the filter through one full period, then capture the second period.
    # Its filter state wraps continuously with the deterministic noise sequence.
    for _ in range(2):
        for i, value in enumerate(raw):
            low += .006 * (value - low)
            wind[i] = low
    # Oscillators have an integer number of cycles in the seven-second loop.
    for i in range(len(result)):
        t = i / RATE
        result[i] = wind[i] * .68 + .025 * sin(TAU * 43 * t) + .018 * sin(TAU * 86 * t)
        result[i] += .012 * sin(TAU * 117 * t) * (.6 + .4 * sin(TAU * t / 7))
    return result


def note(midi):
    return 440 * 2 ** ((midi - 69) / 12)


def music():
    """Original 16-bar / 120 BPM dark industrial cue, exactly 32 seconds."""
    result = blank(32)
    # Four original harmonic sections: D minor / B-flat / G minor / A major.
    chords = ((38, 53, 57, 60), (34, 53, 58, 62), (31, 50, 55, 58), (33, 52, 57, 61))
    for bar in range(16):
        root, *upper = chords[(bar // 2) % 4]
        start = bar * 2.0
        # A very low chord bed; the attacks leave room for weapon transients.
        pad = blank(2.35)
        for index in range(len(pad)):
            t = index / RATE
            envelope = min(1, t / .22) * max(0, 1 - t / 2.35) ** .45
            pad[index] = sum(sin(TAU * note(m) * t + j * .7) for j, m in enumerate(upper)) * .024 * envelope
        add(result, pad, start, wrap=True)
        for step in range(8):
            at = start + step * .25
            midi = root + (12 if step in (3, 6) else 0)
            pulse = tone(.24, note(midi), 14, .14, harmonics=.32)
            add(result, pulse, at, .72 if step % 2 else 1, wrap=True)
            if step in (1, 4, 7):
                add(result, tone(.36, note(upper[(step + bar) % 3] + 12), 14, .024, harmonics=.15), at, wrap=True)
            hat = noise(.06, 31000 + bar * 8 + step, 55, .82, .86)
            add(result, hat, at, .024 if step % 2 else .038, wrap=True)
        for beat in (0, 2, 3.5 if bar % 4 == 3 else 2.75):
            add(result, tone(.3, 46, 18, .17, bend=100), start + beat * .5, wrap=True)
            add(result, noise(.018, 33000 + bar, 180, .75), start + beat * .5, .035, wrap=True)
        for beat in (1, 3):
            snare = noise(.16, 34000 + bar * 2 + beat, 28, .3)
            add(snare, tone(.12, 183, 35, .18))
            add(result, snare, start + beat * .5, .12, wrap=True)
    return result


def write(name, values, peak=.84):
    # Remove DC, gently compress, then normalize. The last samples of every
    # one-shot fade out; loops preserve their periodic tails.
    mean = sum(values) / len(values)
    values = array("d", (tanh((value - mean) * 1.2) for value in values))
    if name not in ("music", "ambience"):
        fade = min(round(.012 * RATE), len(values))
        for i in range(fade):
            values[-fade + i] *= 1 - i / (fade - 1)
    scale = peak / max(abs(value) for value in values)
    pcm = array("h", (round(value * scale * 32767) for value in values))
    if sys.byteorder != "little":
        pcm.byteswap()
    path = OUTPUT / f"{name}.wav"
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(RATE)
        output.writeframes(pcm.tobytes())
    rms = (sum((value * scale) ** 2 for value in values) / len(values)) ** .5
    return {"file": path.name, "seconds": round(len(values) / RATE, 3), "bytes": path.stat().st_size,
            "peak": peak, "rms": round(rms, 4), "sha256": sha256(path.read_bytes()).hexdigest()}


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    tracks = effects()
    tracks["ambience"] = ambience()
    tracks["music"] = music()
    report = [write(name, values, .65 if name == "music" else .72 if name == "ambience" else .84) for name, values in tracks.items()]
    print(json.dumps({"sampleRate": RATE, "format": "PCM16 mono", "totalBytes": sum(track["bytes"] for track in report), "tracks": report}, indent=2))


if __name__ == "__main__":
    main()
