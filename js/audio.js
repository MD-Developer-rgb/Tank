"use strict";
/* ============================================================================
   THE LAST FIVE NIGHTS - audio.js
   Audio manager with two back-ends:
     * SYNTH  - all sound effects are generated in code (js/synth.js) and played
                through WebAudio. No files needed.
     * FILE   - music is loaded lazily from audio/<name>.mp3 (menu_music,
                chase_music, and optionally ambient_forest_night, rain_loop,
                wind_loop). If a file is missing (404) it is marked missing, one
                console.warn is printed and it is silently ignored. The three
                ambience loops fall back to the built-in synthesized versions.
   The game NEVER fails because of audio.
   Created by MD Developer
   ============================================================================ */
const NativeAudio = window.Audio;   // keep the browser's constructor: our manager below is named "Audio"

var Audio = (function () {
  /* names that are music/ambience (use the MUSIC volume slider) */
  const MUSIC = { ending_music: 1, menu_music: 1, ambient_forest_night: 1, rain_loop: 1, wind_loop: 1, chase_music: 1 };
  /* try an mp3 first, fall back to the synthesized version when the file is missing */
  const FILE_FIRST = { ambient_forest_night: 1, rain_loop: 1, wind_loop: 1, menu_music: 1, chase_music: 1, ending_music: 1 };
  const sounds = {};
  let musicVol = 0.7, sfxVol = 0.8;
  let chaseLevel = 1, ambientOn = false, chase = false, rainLevel = 0, windLevel = 0.3;
  let suspended = false;
  let duckMul = 1;   // 0 while the pause menu is open (ui_* sounds are not ducked)
  const mix = { ambient: 0, rain: 0, wind: 0, chase: 0 };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ------------------------------------------------------------- WebAudio */
  let ctx = null, ctxFailed = false;
  const abufs = {};
  function getCtx() {
    if (ctx || ctxFailed) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { ctxFailed = true; return null; }
      ctx = new AC();
    } catch (e) { ctxFailed = true; ctx = null; }
    return ctx;
  }
  function getBuffer(name, v) {
    const c = getCtx(); if (!c) return null;
    if (!Synth.has(name)) return null;
    const ck = name + (v ? "#" + v : "");
    if (abufs[ck] !== undefined) return abufs[ck];
    let ab = null;
    try {
      const r = Synth.make(name, v);
      if (r) {
        ab = c.createBuffer(1, r.data.length, r.rate);
        if (ab.copyToChannel) ab.copyToChannel(r.data, 0); else ab.getChannelData(0).set(r.data);
      }
    } catch (e) { ab = null; }
    abufs[ck] = ab;
    return ab;
  }

  /* master chain: everything -> soft low-pass -> compressor -> out, plus one shared reverb send */
  let master = null, reverbIn = null;
  const WET = {   // how much of each sound goes into the room reverb
    door_open: 0.35, door_close: 0.4, gate_creak: 0.45, locker_open: 0.4, hollow_growl: 0.5, scare_hit: 0.3, whisper: 0.6, door_slam: 0.5, hollow_distant_call: 0.7, hollow_footsteps: 0.3,
    hollow_breath: 0.3, thunder: 0.6, caught_sting: 0.35, win_sting: 0.5, beacon_pulse: 0.6, beacon_activate: 0.45, power_on: 0.3,
    generator_start: 0.25, vehicle_engine: 0.2, wire_cut: 0.25, ladder_climb: 0.3, footstep_wood: 0.18, footstep_metal: 0.25, footstep_concrete: 0.2,
    footstep_grass: 0.1, footstep_dirt: 0.1, radio_voice: 0.2, item_pickup: 0.15, paper_read: 0.1, ui_click: 0.0, ui_hover: 0.0
  };
  function makeImpulse(c) {
    const rate = c.sampleRate, len = Math.floor(rate * 2.2), ir = c.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch); let lpS = 0;
      for (let i = 0; i < len; i++) {
        const t = i / rate, env = Math.pow(1 - i / len, 3.2) * Math.min(1, t / 0.012);
        lpS += (Math.random() * 2 - 1 - lpS) * Math.max(0.08, 0.55 - t * 0.28);   // darker as it decays
        d[i] = lpS * env;
      }
    }
    return ir;
  }
  function getMaster() {
    if (master) return master;
    const c = getCtx(); if (!c) return null;
    try {
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.22;
      const tone = c.createBiquadFilter(); tone.type = "lowpass"; tone.frequency.value = 11000; tone.Q.value = 0.4;
      const out = c.createGain(); out.gain.value = 0.95;
      tone.connect(comp); comp.connect(out); out.connect(c.destination);
      const conv = c.createConvolver(); conv.buffer = makeImpulse(c);
      const rg = c.createGain(); rg.gain.value = 0.55;
      const rhp = c.createBiquadFilter(); rhp.type = "highpass"; rhp.frequency.value = 180;
      rhp.connect(conv); conv.connect(rg); rg.connect(tone);
      master = tone; reverbIn = rhp;
    } catch (e) { master = ctx.destination; reverbIn = null; }
    return master;
  }

  /* ----------------------------------------------------------- sound records */
  function get(name) {
    let s = sounds[name];
    if (s) return s;
    const synthOK = typeof Synth !== "undefined" && Synth.has(name);
    s = sounds[name] = {
      name: name, music: !!MUSIC[name], missing: false, kind: "file", el: null, node: null,
      level: 1, target: 1, rate: 0, playing: false, wantPlay: false, loop: false
    };
    if (synthOK && !FILE_FIRST[name]) {
      s.kind = "synth";
      if (!getCtx()) s.missing = true;
      return s;
    }
    try {
      const el = new NativeAudio("audio/" + name + ".mp3");
      el.preload = "auto";
      el.addEventListener("error", function () {
        if (s.kind !== "file") return;
        if (synthOK && getCtx()) {       // ambience: switch to the built-in version
          s.kind = "synth"; s.el = null; s.playing = false;
          if (s.wantPlay) startLoop(s);
          return;
        }
        if (!s.missing) { s.missing = true; s.playing = false; console.warn("[Audio] missing file audio/" + name + ".mp3 (that sound stays silent)"); }
      });
      s.el = el;
    } catch (e) { s.missing = true; }
    return s;
  }

  const cat = s => (s.music ? musicVol : sfxVol) * (duckMul < 1 && s.name.indexOf("ui_") !== 0 ? duckMul : 1);

  function applyVol(s) {
    const v = clamp(s.level * cat(s), 0, 1);
    if (s.kind === "synth") {
      if (s.node) { try { s.node.gain.gain.value = v; } catch (e) { /* ignore */ } }
    } else if (s.el) { try { s.el.volume = v; } catch (e) { /* ignore */ } }
  }

  function isActive(s) {
    if (s.kind === "synth") return !!s.node;
    return !!(s.playing && s.el && !s.el.paused);
  }

  function startSynth(s, loop, vol, rate, o) {
    const c = getCtx(); if (!c) return null;
    const m = getMaster(); if (!m) return null;
    const nv = loop ? 1 : Synth.variants(s.name);
    const v = nv > 1 ? 1 + Math.floor(Math.random() * nv) - 1 : 0;
    const ab = getBuffer(s.name, v); if (!ab) return null;
    const src = c.createBufferSource();
    const g = c.createGain();
    src.buffer = ab;
    src.loop = !!loop;
    const jitter = loop ? 0 : (o && o.noJitter ? 1 : 1 + (Math.random() - 0.5) * (s.name.indexOf("footstep_") === 0 ? 0.16 : 0.08));
    src.playbackRate.value = (rate || 1) * jitter;
    g.gain.value = clamp(vol * cat(s), 0, 1);
    let last = g, lowp = null;
    if (o && o.cut) {   // distance: farther sounds get duller
      lowp = c.createBiquadFilter(); lowp.type = "lowpass"; lowp.frequency.value = o.cut; lowp.Q.value = 0.3;
      src.connect(lowp); lowp.connect(g);
    } else src.connect(g);
    g.connect(m);
    const wet = WET[s.name] || 0;
    if (wet > 0 && reverbIn && !loop) {
      const w = c.createGain(); w.gain.value = wet * (o && o.wet != null ? o.wet : 1);
      g.connect(w); w.connect(reverbIn);
      src.onended = function () { try { w.disconnect(); } catch (e) { /* ignore */ } };
    }
    try { src.start(0); } catch (e) { return null; }
    return { src: src, gain: g };
  }

  function startLoop(s) {
    if (s.missing) return;
    if (s.kind === "synth") {
      if (s.node) { applyVol(s); s.playing = true; return; }
      const n = startSynth(s, true, s.level, 0, null);
      if (n) { s.node = n; s.playing = true; }
      return;
    }
    if (!s.el) return;
    try {
      s.el.loop = true;
      applyVol(s);
      const p = s.el.play();
      s.playing = true;
      if (p && p.catch) p.catch(function () { s.playing = false; });   // autoplay blocked: retried in unlock()
    } catch (e) { s.playing = false; }
  }

  function stopLoop(s) {
    s.wantPlay = false;
    s.playing = false;
    if (s.node) { try { s.node.src.stop(0); } catch (e) { /* ignore */ } try { s.node.src.disconnect(); s.node.gain.disconnect(); } catch (e) { /* ignore */ } s.node = null; }
    try { if (s.el) s.el.pause(); } catch (e) { /* ignore */ }
  }

  const A = {
    listener: null,   // Vec3 (player position) set by Player.init

    init() {
      // resume on the first user interaction (autoplay policy)
      const unlock = function () { A.unlock(); };
      ["pointerdown", "touchstart", "keydown", "mousedown", "click"].forEach(ev => window.addEventListener(ev, unlock, { passive: true }));
      document.addEventListener("visibilitychange", function () {
        if (document.hidden) A.suspend(); else A.resume();
      });
    },

    /* retry loops that the browser refused to start, and wake the WebAudio context */
    prewarm() {   // render the common sounds a few at a time while the player is on the menu
      if (A._pw) return; A._pw = true;
      const list = ["menu_music", "chase_music", "scare_hit", "whisper", "door_slam", "ui_click", "ui_hover", "footstep_grass", "footstep_wood", "footstep_dirt", "footstep_metal", "flashlight_click", "item_pickup", "door_open", "door_close",
        "ambient_forest_night", "wind_loop", "rain_loop", "heartbeat", "keypad_beep", "paper_read", "thunder", "hollow_growl", "hollow_distant_call", "hollow_footsteps", "generator_start", "generator_loop", "power_on"];
      const jobs = [];
      list.forEach(n => { const nv = Synth.variants(n); for (let v = 0; v < nv; v++) jobs.push([n, v]); });
      const step = function () { const j = jobs.shift(); if (!j) return; try { getBuffer(j[0], j[1]); } catch (e) { /* ignore */ } setTimeout(step, 30); };
      setTimeout(step, 400);
    },

    unlock() {
      try { getCtx(); A.prewarm(); if (ctx && ctx.state === "suspended" && !suspended) ctx.resume(); } catch (e) { /* ignore */ }
      for (const n in sounds) {
        const s = sounds[n];
        if (s.kind === "file" && s.wantPlay && !s.missing && s.el && s.el.paused && !suspended) startLoop(s);
      }
    },

    suspend() {
      suspended = true;
      try { if (ctx && ctx.state === "running") ctx.suspend(); } catch (e) { /* ignore */ }
      for (const n in sounds) { const s = sounds[n]; try { if (s.kind === "file" && s.el && !s.el.paused) s.el.pause(); } catch (e) { /* ignore */ } }
    },
    resume() {
      suspended = false;
      try { if (ctx && ctx.state === "suspended") ctx.resume(); } catch (e) { /* ignore */ }
      for (const n in sounds) { const s = sounds[n]; if (s.kind === "file" && s.wantPlay && !s.missing) startLoop(s); }
    },

    /* play(name, {loop, volume, rate}) */
    play(name, o) {
      try {
        o = o || {};
        const s = get(name);
        if (s.missing) return;
        const vol = o.volume == null ? 1 : o.volume;
        if (s.kind === "synth") {
          if (o.loop) {
            s.loop = true; s.wantPlay = true; s.level = vol; s.target = vol; s.rate = 0;
            if (s.node) applyVol(s); else startLoop(s);
            return;
          }
          if (vol * sfxVol < 0.01 || (duckMul < 1 && name.indexOf("ui_") !== 0)) return;
          startSynth(s, false, vol, o.rate || 0, o);
          return;
        }
        if (suspended) { if (o.loop) { s.wantPlay = true; s.loop = true; } return; }
        if (o.loop) {
          s.loop = true; s.wantPlay = true; s.level = vol; s.target = vol; s.rate = 0;
          if (!s.playing || s.el.paused) startLoop(s); else applyVol(s);
          return;
        }
        let node = s.el;
        if (!(node.paused || node.ended)) node = s.el.cloneNode();   // overlapping one-shots
        node.loop = false;
        node.volume = clamp(vol * cat(s), 0, 1);
        if (o.rate) node.playbackRate = o.rate;
        try { node.currentTime = 0; } catch (e) { /* ignore */ }
        const p = node.play();
        if (p && p.catch) p.catch(function () { /* blocked or missing */ });
      } catch (e) { /* never crash on audio */ }
    },

    /* position based one-shot: volume falls off with distance from the listener */
    playAt(name, pos, o) {
      try {
        o = o || {};
        if (!A.listener || !pos) { A.play(name, o); return; }
        const dx = pos.x - A.listener.x, dz = pos.z - A.listener.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        const maxD = o.maxDist || 40;
        const v = Math.pow(Math.max(0, 1 - d / maxD), 1.5) * (o.volume == null ? 1 : o.volume);
        if (v < 0.02) return;
        const oo = {}; for (const k in o) oo[k] = o[k];
        oo.volume = v;
        oo.cut = clamp(9000 - d * 170, 1400, 9000);
        oo.wet = 1 + d / maxD;
        A.play(name, oo);
      } catch (e) { /* ignore */ }
    },

    stop(name) { const s = sounds[name]; if (s) stopLoop(s); },
    stopAll() { for (const n in sounds) stopLoop(sounds[n]); mix.ambient = mix.rain = mix.wind = mix.chase = 0; },
    isPlaying(name) { const s = sounds[name]; return !!(s && isActive(s)); },

    /* set a looping sound's relative volume right now */
    setVolume(name, v) {
      const s = sounds[name]; if (!s) return;
      s.level = s.target = clamp(v, 0, 1); s.rate = 0; applyVol(s);
    },
    fadeTo(name, v, seconds) {
      const s = get(name); s.target = clamp(v, 0, 1); s.rate = Math.abs(s.target - s.level) / Math.max(0.05, seconds);
    },

    /* mute / unmute all game sounds (pause menu) without stopping the loops */
    duck(on) { duckMul = on ? 0 : 1; for (const n in sounds) applyVol(sounds[n]); },

    setMusicVolume(v) { musicVol = clamp(v / 100, 0, 1); for (const n in sounds) applyVol(sounds[n]); },
    setSfxVolume(v) { sfxVol = clamp(v / 100, 0, 1); for (const n in sounds) applyVol(sounds[n]); },

    /* ---- in-game ambient mix (ambient / rain / wind / chase music) ---- */
    startAmbient() { ambientOn = true; chase = false; },
    stopAmbient() {
      ambientOn = false; chase = false;
      ["ambient_forest_night", "rain_loop", "wind_loop", "chase_music"].forEach(n => { if (sounds[n]) stopLoop(sounds[n]); });
      mix.ambient = mix.rain = mix.wind = mix.chase = 0;
    },
    setChase(on) { chase = !!on; },
    setChaseLevel(v) { chaseLevel = clamp(v, 0.45, 1); },
    setWeather(rain, wind) { rainLevel = rain; windLevel = wind; },

    update(dt) {
      // fade individual loops that were given fadeTo()
      for (const n in sounds) {
        const s = sounds[n];
        if (s.rate > 0 && s.level !== s.target) {
          const step = s.rate * dt;
          s.level = Math.abs(s.target - s.level) <= step ? s.target : s.level + Math.sign(s.target - s.level) * step;
          applyVol(s);
          if (s.level <= 0.001 && s.target === 0) stopLoop(s);
        }
      }
      if (!ambientOn || suspended) return;
      const want = {
        ambient: chase ? 0.25 : 1.0,
        rain: rainLevel * 0.85,
        wind: windLevel * (chase ? 0.4 : 0.8),
        chase: chase ? chaseLevel : 0
      };
      const names = { ambient: "ambient_forest_night", rain: "rain_loop", wind: "wind_loop", chase: "chase_music" };
      for (const k in want) {
        const rate = k === "chase" ? 0.9 : 0.5;
        mix[k] += clamp(want[k] - mix[k], -rate * dt, rate * dt);
        const s = get(names[k]);
        if (s.missing) continue;
        if (mix[k] > 0.01) {
          if (!isActive(s)) { s.loop = true; s.wantPlay = true; s.level = mix[k]; startLoop(s); }
          s.level = mix[k]; applyVol(s);
        } else if (isActive(s) || s.playing) { stopLoop(s); }
      }
    }
  };
  return A;
})();
