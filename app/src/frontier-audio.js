/* Original Siege audio. Web Audio; no external services or runtime libraries. */
(function () {
  'use strict';
  const KEYS = ['rifle', 'pistol', 'shotgun', 'plasma', 'reload', 'grenade', 'ambience', 'music'];
  const STORAGE_KEY = 'last-frontier-audio-muted';
  const base = new URL('assets/sounds/', document.baseURI);
  const encoded = new Map(), buffers = new Map(), voices = new Set(), loops = new Map();
  const errors = [];
  let context, master, compressor, decoding, unlocked = false, currentMode = 'menu', muted = false, pageActive = true;
  let playCount = 0, lastSound = '', lastPan = 0;
  try { muted = localStorage.getItem(STORAGE_KEY) === 'true'; } catch (_) { /* Private browsing. */ }
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
  const active = () => unlocked && context?.state === 'running' && currentMode === 'playing' && !document.hidden && !muted && pageActive;
  function report(error) {
    if (errors.length < 8) errors.push(String(error?.message || error).slice(0, 180));
  }
  // Fetching bytes is silent. The AudioContext is only created/resumed from a
  // trusted browser input event, including on Android.
  const preload = Promise.all(KEYS.map(async key => {
    try {
      const response = await fetch(new URL(`${key}.wav`, base));
      if (!response.ok) throw new Error(`${key}.wav: HTTP ${response.status}`);
      encoded.set(key, await response.arrayBuffer());
    } catch (error) { report(error); }
  }));
  function stopLoops() {
    if (!context) return;
    for (const loop of loops.values()) {
      if (!loop.source) continue;
      loop.offset = (loop.offset + Math.max(0, context.currentTime - loop.startedAt)) % buffers.get(loop.key).duration;
      loop.gain.gain.cancelScheduledValues(context.currentTime);
      loop.gain.gain.setTargetAtTime(0, context.currentTime, .012);
      try { loop.source.stop(context.currentTime + .045); } catch (_) { /* Already stopped. */ }
      loop.source = null;
    }
  }
  function stopVoices() {
    if (!context) return;
    for (const voice of voices) {
      voice.gain.gain.setTargetAtTime(0, context.currentTime, .006);
      try { voice.source.stop(context.currentTime + .025); } catch (_) { /* Already stopped. */ }
    }
  }
  function syncLoops() {
    if (!active()) { stopLoops(); return; }
    for (const [key, volume] of [['music', .22], ['ambience', .095]]) {
      const buffer = buffers.get(key);
      if (!buffer) continue;
      let loop = loops.get(key);
      if (!loop) { loop = { key, offset: 0, source: null }; loops.set(key, loop); }
      if (loop.source) continue;
      const source = context.createBufferSource(), gain = context.createGain();
      source.buffer = buffer; source.loop = true;
      gain.gain.setValueAtTime(0, context.currentTime);
      gain.gain.linearRampToValueAtTime(volume, context.currentTime + .18);
      source.connect(gain); gain.connect(compressor);
      source.onended = () => { source.disconnect(); gain.disconnect(); };
      loop.source = source; loop.gain = gain; loop.startedAt = context.currentTime;
      source.start(context.currentTime, loop.offset % buffer.duration);
    }
  }
  function decode() {
    if (decoding) return decoding;
    decoding = preload.then(async () => {
      await Promise.all([...encoded].map(async ([key, bytes]) => {
        try { buffers.set(key, await context.decodeAudioData(bytes)); } catch (error) { report(error); }
      }));
      encoded.clear(); syncLoops();
      window.dispatchEvent(new Event('frontier-audio-ready'));
    });
    return decoding;
  }
  function unlock(event) {
    if (!event.isTrusted) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    try {
      if (!context) {
        context = new AudioContext({ latencyHint: 'interactive' });
        compressor = context.createDynamicsCompressor();
        compressor.threshold.value = -15; compressor.knee.value = 18;
        compressor.ratio.value = 4; compressor.attack.value = .003; compressor.release.value = .18;
        master = context.createGain(); master.gain.value = muted ? 0 : .7;
        compressor.connect(master); master.connect(context.destination);
        context.addEventListener('statechange', syncLoops);
      }
      unlocked = true;
      // Call resume synchronously inside the trusted event, before any await.
      const resumed = context.resume();
      if (resumed?.then) resumed.then(syncLoops).catch(report);
      decode().catch(report);
    } catch (error) { report(error); }
  }
  document.addEventListener('pointerdown', unlock, { capture: true, passive: true });
  document.addEventListener('keydown', unlock, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stopLoops(); stopVoices(); } else syncLoops();
  });
  window.addEventListener('pagehide', () => { pageActive = false; stopLoops(); stopVoices(); });
  window.addEventListener('pageshow', () => { pageActive = true; syncLoops(); });
  window.FrontierAudio = {
    play(kind, options = {}) {
      let key = kind;
      if (kind === 'shot' || kind === 'weapon') key = ['rifle', 'pistol', 'shotgun', 'plasma'].includes(options.weapon) ? options.weapon : 'rifle';
      if (kind === 'explosion' || kind === 'boom') key = 'grenade';
      if (!KEYS.includes(key) || key === 'ambience' || key === 'music') return false;
      // Handled silently when paused/muted so a legacy fallback cannot leak audio.
      if (muted || currentMode !== 'playing' || document.hidden || !pageActive) return true;
      if (!active() || !buffers.has(key)) return false;
      try {
        if (voices.size >= 28) {
          const oldest = voices.values().next().value;
          oldest.source.stop(); voices.delete(oldest);
        }
        const source = context.createBufferSource(), gain = context.createGain();
        source.buffer = buffers.get(key);
        source.playbackRate.value = key === 'reload' ? 1 : .965 + Math.random() * .07;
        const dx = finite(options.x) - finite(options.listenerX, finite(options.x));
        const dy = finite(options.y) - finite(options.listenerY, finite(options.y));
        const distance = Math.hypot(dx, dy);
        lastPan = clamp((dx - dy) / 11, -.85, .85);
        const volume = clamp(finite(options.volume, 1), 0, 1.5);
        gain.gain.value = (key === 'reload' ? .35 : key === 'grenade' ? .66 : .58) * volume / (1 + distance * .13);
        source.connect(gain);
        const pan = context.createStereoPanner ? context.createStereoPanner() : null;
        if (pan) { pan.pan.value = lastPan; gain.connect(pan); pan.connect(compressor); }
        else gain.connect(compressor);
        const voice = { source, gain, pan }; voices.add(voice);
        source.onended = () => { voices.delete(voice); source.disconnect(); gain.disconnect(); pan?.disconnect(); };
        source.start(); playCount++; lastSound = key;
        return true;
      } catch (error) { report(error); return false; }
    },
    mode(value) {
      if (value === currentMode) return;
      currentMode = value;
      if (currentMode !== 'playing') stopVoices();
      syncLoops();
    },
    mute(value) {
      muted = !!value;
      try { localStorage.setItem(STORAGE_KEY, String(muted)); } catch (_) { /* Storage unavailable. */ }
      if (master) master.gain.setTargetAtTime(muted ? 0 : .7, context.currentTime, .012);
      if (muted) stopVoices();
      syncLoops();
      return muted;
    },
    status: () => ({
      audioReady: !!context && context.state === 'running' && buffers.size === KEYS.length,
      musicPlaying: !!loops.get('music')?.source && active(),
      ambiencePlaying: !!loops.get('ambience')?.source && active(),
      muted, mode: currentMode, unlocked, loaded: [...buffers.keys()], total: KEYS.length,
      activeVoices: voices.size, playCount, lastSound, lastPan, errors: [...errors]
    })
  };
}());
