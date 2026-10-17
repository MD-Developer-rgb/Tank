"use strict";
/* ============================================================================
   THE LAST FIVE NIGHTS - synth.js
   Procedural sound effects. Every SFX is rendered once (lazily) into a mono
   Float32 buffer from plain math (oscillators, filtered noise, envelopes),
   so the game ships with NO audio files for effects.
   Only music (menu_music, chase_music, ...) is expected as mp3 in /audio.
   Created by MD Developer
   ============================================================================ */
var Synth = (function () {
  const DEFSR = 32000;
  let SR = DEFSR;
  const TAU = Math.PI * 2;

  /* deterministic noise so every sound is identical on every device */
  function rngFor(name) {
    let h = 2166136261;
    for (let i = 0; i < name.length; i++) { h ^= name.charCodeAt(i); h = Math.imul(h, 16777619); }
    let a = h >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  let rnd = Math.random;
  const noise = () => rnd() * 2 - 1;
  const buf = sec => new Float32Array(Math.max(1, Math.floor(sec * SR)));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* one-pole filters */
  function lp(x, fc) {
    const a = 1 - Math.exp(-TAU * fc / SR); const y = new Float32Array(x.length); let s = 0;
    for (let i = 0; i < x.length; i++) { s += a * (x[i] - s); y[i] = s; }
    return y;
  }
  function hp(x, fc) {
    const l = lp(x, fc); const y = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) y[i] = x[i] - l[i];
    return y;
  }
  function bp(x, lo, hi) { return lp(hp(x, lo), hi); }
  function noiseBuf(sec) { const b = buf(sec); for (let i = 0; i < b.length; i++) b[i] = noise(); return b; }
  function brown(sec) { const b = buf(sec); let s = 0; for (let i = 0; i < b.length; i++) { s = (s + noise() * 0.08) * 0.998; b[i] = s * 3.5; } return b; }

  /* envelope helpers: t in seconds */
  const expd = (t, k) => Math.exp(-t * k);
  const adsr = (t, a, d, dur) => t < a ? t / a : Math.max(0, 1 - (t - a) / Math.max(0.001, d)) * (t < dur ? 1 : 0);

  /* add `src` into `dst` starting at time t0 with gain g */
  function mix(dst, src, t0, g) {
    const o = Math.floor((t0 || 0) * SR); g = g == null ? 1 : g;
    for (let i = 0; i < src.length; i++) { const j = o + i; if (j >= 0 && j < dst.length) dst[j] += src[i] * g; }
  }
  /* shaped tone: f(t) -> Hz, amp(t) -> 0..1 */
  function tone(sec, f, amp, wave) {
    const b = buf(sec); let ph = 0;
    for (let i = 0; i < b.length; i++) {
      const t = i / SR; ph += TAU * f(t) / SR;
      let s;
      if (wave === "saw") s = ((ph / TAU) % 1) * 2 - 1;
      else if (wave === "square") s = Math.sin(ph) >= 0 ? 1 : -1;
      else if (wave === "tri") s = Math.asin(Math.sin(ph)) * 2 / Math.PI;
      else s = Math.sin(ph);
      b[i] = s * amp(t);
    }
    return b;
  }
  function ring(sec, freqs, decay, gain) {   // struck metal: sum of decaying partials
    const b = buf(sec);
    for (let k = 0; k < freqs.length; k++) {
      const f = freqs[k], g = (gain || 1) / (1 + k * 0.6), d = decay * (1 + k * 0.5), ph0 = rnd() * TAU;
      for (let i = 0; i < b.length; i++) { const t = i / SR; b[i] += Math.sin(TAU * f * t + ph0) * g * expd(t, d); }
    }
    return b;
  }
  function click(sec, bright) {
    const b = noiseBuf(sec); const h = hp(b, bright || 2000);
    for (let i = 0; i < h.length; i++) h[i] *= expd(i / SR, 1 / (sec / 5));
    return h;
  }
  function thud(sec, f, decay) {
    return tone(sec, t => f * (1 + 0.8 * expd(t, 30)), t => expd(t, decay), "sine");
  }
  function normalize(b, peak) {
    let m = 0; for (let i = 0; i < b.length; i++) m = Math.max(m, Math.abs(b[i]));
    if (m > 0) { const g = (peak || 0.9) / m; for (let i = 0; i < b.length; i++) b[i] *= g; }
    return b;
  }
  function fadeEdges(b, ms) {
    const n = Math.min(b.length >> 1, Math.floor(ms / 1000 * SR));
    for (let i = 0; i < n; i++) { const g = i / n; b[i] *= g; b[b.length - 1 - i] *= g; }
    return b;
  }
  /* make a buffer loop seamlessly: crossfade the tail into the head */
  function loopify(b, fadeSec) {
    const n = Math.floor(fadeSec * SR), L = b.length - n, o = new Float32Array(L);
    for (let i = 0; i < L; i++) o[i] = b[i];
    for (let i = 0; i < n; i++) { const w = i / n; o[i] = b[i] * w + b[L + i] * (1 - w); }
    return o;
  }

  /* ----------------------------------------------------------------- recipes */
  const R = {};

  /* footsteps ------------------------------------------------------------- */
  R.footstep_grass = () => {
    const b = bp(noiseBuf(0.3), 180, 2200);
    for (let i = 0; i < b.length; i++) { const t = i / SR; b[i] *= Math.min(1, t / 0.014) * expd(t, 11 + rnd() * 2) * 2.4; }
    mix(b, thud(0.14, 58 + rnd() * 10, 26), 0.004, 0.35);
    for (let k = 0; k < 5; k++) mix(b, lp(click(0.02, 1800), 5000), 0.02 + rnd() * 0.12, 0.12 + rnd() * 0.1);   // leaf crinkle
    return normalize(lp(b, 4200), 0.42);
  };  R.footstep_dirt = () => {
    const b = bp(noiseBuf(0.26), 220, 2600);
    for (let i = 0; i < b.length; i++) { const t = i / SR; b[i] *= Math.min(1, t / 0.008) * expd(t, 15 + rnd() * 3) * 2.6; }
    mix(b, thud(0.14, 66 + rnd() * 12, 24), 0, 0.5);
    for (let k = 0; k < 5; k++) mix(b, lp(click(0.012, 2500), 6000), 0.01 + rnd() * 0.09, 0.12 + rnd() * 0.12);   // grit
    return normalize(lp(b, 5000), 0.46);
  };  R.footstep_concrete = () => {
    const b = bp(noiseBuf(0.2), 260, 3800);
    for (let i = 0; i < b.length; i++) b[i] *= expd(i / SR, 24 + rnd() * 4) * 2.6;
    mix(b, thud(0.16, 85 + rnd() * 15, 22), 0, 0.6);
    mix(b, lp(click(0.01, 3000), 6000), 0, 0.25);
    return normalize(lp(b, 5200), 0.5);
  };  R.footstep_wood = () => {
    const b = thud(0.3, 88 + rnd() * 16, 15);
    mix(b, ring(0.3, [170 + rnd() * 20, 290, 430], 16, 0.25), 0, 0.5);
    mix(b, lp(bp(noiseBuf(0.1), 200, 2000), 3000), 0, 0.45);
    if (rnd() < 0.5) mix(b, lp(tone(0.14, t => 330 - 70 * t * 4, t => 0.22 * Math.sin(Math.PI * clamp(t / 0.14, 0, 1)), "saw"), 900), 0.03, 0.4);   // board creak
    return normalize(lp(b, 3500), 0.55);
  };  R.footstep_metal = () => {
    const b = ring(0.55, [380 + rnd() * 40, 790, 1260, 1900], 10, 0.6);
    mix(b, lp(click(0.012, 2000), 5000), 0, 0.45);
    mix(b, thud(0.12, 80, 28), 0, 0.7);
    return normalize(lp(b, 3600), 0.45);
  };  R.footstep_water = () => {
    const b = bp(noiseBuf(0.5), 300, 3200);
    for (let i = 0; i < b.length; i++) { const t = i / SR; b[i] *= (t < 0.03 ? t / 0.03 : 1) * expd(t, 7) * (0.7 + 0.3 * Math.sin(t * 90)); }
    for (let k = 0; k < 6; k++) mix(b, tone(0.06, t => 900 + 1800 * t * 10 + k * 120, t => expd(t, 60), "sine"), 0.02 + rnd() * 0.3, 0.12);
    return normalize(b, 0.65);
  };

  /* doors ----------------------------------------------------------------- */
  R.door_open = () => {
    const sec = 1.5, b = buf(sec); let ph = 0;
    for (let i = 0; i < b.length; i++) {
      const t = i / SR, x = t / sec;
      const f = 92 + 70 * Math.sin(Math.PI * x * 0.9) + 8 * Math.sin(t * 7.1);
      ph += TAU * f / SR;
      const slip = Math.pow(Math.max(0, Math.sin(t * 37 + Math.sin(t * 5) * 2)), 2);        // stick-slip hinge
      const saw = ((ph / TAU) % 1) * 2 - 1;
      b[i] = (saw * 0.7 + Math.sin(ph * 2) * 0.2) * (0.25 + 0.75 * slip) * Math.sin(Math.PI * Math.min(1, x / 0.85)) * (x < 0.85 ? 1 : 0);
    }
    const f1 = lp(bp(b, 160, 1500), 1300);
    mix(f1, lp(click(0.03, 900), 2500), 0, 0.5);                       // latch
    mix(f1, lp(bp(noiseBuf(0.3), 100, 800), 600), 0.0, 0.18);
    mix(f1, thud(0.22, 62, 14), 1.28, 0.28);                           // door stops
    return normalize(f1, 0.5);
  };  R.door_close = () => {
    const b = thud(0.5, 58, 11);
    mix(b, lp(bp(noiseBuf(0.3), 90, 1400), 1600), 0, 0.5);
    mix(b, ring(0.35, [150, 320], 16, 0.16), 0, 0.5);
    mix(b, lp(click(0.02, 1200), 3000), 0.075, 0.5);     // latch
    return normalize(lp(b, 2600), 0.62);
  };  R.gate_creak = () => {
    const sec = 2.2, b = buf(sec); let ph = 0;
    for (let i = 0; i < b.length; i++) {
      const t = i / SR, x = t / sec;
      const f = 150 + 120 * Math.sin(Math.PI * x) + 30 * Math.sin(t * 3.1);
      ph += TAU * f / SR;
      const slip = Math.pow(Math.max(0, Math.sin(t * 23 + Math.sin(t * 4.3) * 3)), 1.5);
      const saw = ((ph / TAU) % 1) * 2 - 1;
      b[i] = (saw * 0.6 + Math.sin(ph * 3.01) * 0.25) * (0.15 + 0.85 * slip) * Math.min(1, t / 0.25) * Math.max(0, 1 - Math.max(0, x - 0.75) / 0.25);
    }
    const r = lp(bp(b, 140, 2200), 1900);
    mix(r, ring(0.6, [110, 240, 520], 7, 0.15), 1.9, 0.4);
    return normalize(r, 0.45);
  };
  /* machines -------------------------------------------------------------- */
  R.generator_start = () => {
    const sec = 3.2, b = buf(sec); let ph = 0;
    for (let i = 0; i < b.length; i++) {
      const t = i / SR;
      let f, a;
      if (t < 1.6) { f = 12 + 14 * t; a = 0.5 * (0.6 + 0.4 * Math.sin(t * TAU * 6)); }      // cranking
      else { f = 38 + 8 * Math.sin(t * 3); a = 0.55 + 0.1 * (t - 1.6) / 1.6; }               // catches, idles
      ph += TAU * f / SR;
      const saw = ((ph / TAU) % 1) * 2 - 1;
      const pulse = Math.pow(Math.max(0, Math.sin(ph * (t < 1.6 ? 2 : 0.5))), 3);
      b[i] = (saw * 0.5 + pulse * 0.9) * a;
    }
    const m = lp(b, 420);
    const n = lp(noiseBuf(sec), 600);
    for (let i = 0; i < m.length; i++) m[i] += n[i] * 0.25 * (i / SR > 1.6 ? 1 : 0.4);
    mix(m, thud(0.2, 55, 18), 1.58, 0.7);
    return normalize(fadeEdges(m, 10), 0.75);
  };
  R.generator_loop = () => {
    const sec = 1.0, b = buf(sec + 0.1);
    const f0 = 40;   // integer number of cycles in 1 s
    for (let i = 0; i < b.length; i++) {
      const t = i / SR, ph = TAU * f0 * t;
      const saw = (((ph / TAU) % 1) * 2 - 1);
      b[i] = saw * 0.5 + Math.pow(Math.max(0, Math.sin(ph / 2)), 3) * 0.9 + Math.sin(ph * 3) * 0.12;
    }
    const m = lp(b, 400); const n = lp(noiseBuf(sec + 0.1), 500);
    for (let i = 0; i < m.length; i++) m[i] += n[i] * 0.3;
    return normalize(loopify(m, 0.1), 0.6);
  };
  R.power_on = () => {
    const sec = 2.0, b = buf(sec);
    for (let i = 0; i < b.length; i++) {
      const t = i / SR, k = Math.min(1, t / 1.2);
      b[i] = (Math.sin(TAU * 60 * t) * 0.5 + Math.sin(TAU * 120 * t) * 0.25 + Math.sin(TAU * 180 * t) * 0.1) * k * (t > 1.7 ? (2 - t) / 0.3 : 1);
    }
    mix(b, thud(0.25, 50, 12), 0, 0.9);
    mix(b, ring(0.5, [220, 480], 10, 0.2), 0.02, 0.6);
    mix(b, click(0.02, 2500), 0.4, 0.5);
    mix(b, click(0.02, 2500), 0.62, 0.5);
    mix(b, tone(1.0, t => 1800 + 400 * Math.sin(t * 40), t => 0.04 * expd(t, 3), "sine"), 1.0, 1);
    return normalize(b, 0.7);
  };
  R.vehicle_engine = () => {
    const sec = 4.0, b = buf(sec); let ph = 0;
    for (let i = 0; i < b.length; i++) {
      const t = i / SR;
      let f, a;
      if (t < 1.2) { f = 9 + 8 * Math.sin(t * 14) * 0.2 + 6 * t; a = 0.6; }     // starter grind
      else { f = 24 + 3 * Math.sin(t * 5); a = 0.8; }                               // idle
      ph += TAU * f / SR;
      const saw = ((ph / TAU) % 1) * 2 - 1;
      b[i] = (saw * 0.6 + Math.pow(Math.max(0, Math.sin(ph * 2)), 4)) * a;
    }
    const m = lp(b, 360); const n = lp(noiseBuf(sec), 700);
    for (let i = 0; i < m.length; i++) m[i] += n[i] * 0.2;
    mix(m, bp(noiseBuf(1.2), 600, 2500), 0, 0.06);
    return normalize(fadeEdges(m, 20), 0.75);
  };
  R.winch = () => {
    const sec = 1.0, b = buf(sec + 0.1);
    for (let i = 0; i < b.length; i++) {
      const t = i / SR;
      b[i] = Math.sin(TAU * 118 * t) * 0.25 + (((TAU * 236 * t / TAU) % 1) * 2 - 1) * 0.1;   // motor whine
    }
    for (let k = 0; k < 8; k++) mix(b, ring(0.07, [1800, 2600], 55, 0.5), k / 8, 0.7);       // ratchet teeth
    for (let k = 0; k < 8; k++) mix(b, click(0.015, 3000), k / 8, 0.5);
    const n = bp(noiseBuf(sec + 0.1), 120, 900);
    for (let i = 0; i < b.length; i++) b[i] += n[i] * 0.35;
    return normalize(loopify(b, 0.1), 0.6);
  };

  /* small interactions ---------------------------------------------------- */
  R.item_pickup = () => {
    const b = buf(0.5);
    const r = lp(bp(noiseBuf(0.14), 700, 4500), 4500);                 // cloth rustle
    for (let i = 0; i < r.length; i++) r[i] *= Math.sin(Math.PI * i / r.length) * 0.9;
    mix(b, r, 0, 0.5);
    mix(b, tone(0.4, t => 523, t => expd(t, 9) * Math.min(1, t / 0.006), "sine"), 0.05, 0.4);
    mix(b, tone(0.4, t => 784, t => expd(t, 10) * Math.min(1, t / 0.006), "sine"), 0.11, 0.3);
    return normalize(lp(b, 4000), 0.36);
  };  R.paper_read = () => {
    const sec = 0.7, n = noiseBuf(sec), b = bp(n, 1500, 7000);
    for (let i = 0; i < b.length; i++) {
      const t = i / SR;
      b[i] *= (0.35 + 0.65 * Math.abs(Math.sin(t * 38 + Math.sin(t * 9) * 2))) * Math.sin(Math.PI * clamp(t / sec, 0, 1)) * 2;
    }
    return normalize(b, 0.4);
  };
  R.keypad_beep = () => {
    const b = tone(0.1, t => 880, t => Math.min(1, t / 0.004) * expd(t, 32), "sine");
    mix(b, tone(0.08, t => 1760, t => expd(t, 50) * 0.25, "sine"), 0, 1);
    mix(b, lp(click(0.008, 1500), 4000), 0, 0.12);
    return normalize(lp(b, 3000), 0.3);
  };  R.locker_open = () => {
    const b = ring(1.0, [310, 720, 1180, 1750], 6, 0.8);
    mix(b, click(0.02, 2000), 0, 0.9);
    mix(b, thud(0.2, 100, 16), 0.03, 0.7);
    mix(b, bp(noiseBuf(0.4), 500, 4000), 0.02, 0.3);
    mix(b, tone(0.4, t => 220 + 140 * t, t => 0.25 * Math.sin(Math.min(1, t / 0.4) * Math.PI), "saw"), 0.05, 0.5);   // hinge
    return normalize(b, 0.7);
  };
  R.ladder_climb = () => {
    const b = buf(1.0);
    for (let k = 0; k < 4; k++) {
      const t0 = k * 0.22;
      mix(b, ring(0.3, [520 + k * 20, 1130, 1760], 14, 0.7), t0, 0.8);
      mix(b, thud(0.12, 120, 24), t0, 0.6);
      mix(b, click(0.01, 2500), t0, 0.5);
    }
    return normalize(b, 0.55);
  };
  R.wire_cut = () => {
    const b = buf(0.35);
    mix(b, click(0.06, 2500), 0, 1);
    mix(b, tone(0.3, t => 3200 - 1200 * t, t => 0.5 * expd(t, 22), "sine"), 0, 0.4);
    mix(b, ring(0.2, [1500, 2400, 3400], 25, 0.4), 0, 0.5);
    mix(b, bp(noiseBuf(0.15), 2500, 7000), 0.03, 0.15);   // spark fizz
    return normalize(b, 0.6);
  };
  R.work_light_switch = () => {
    const b = buf(0.6);
    mix(b, click(0.025, 1800), 0, 1);
    mix(b, thud(0.12, 140, 28), 0, 0.5);
    mix(b, click(0.02, 1800), 0.09, 0.6);
    mix(b, tone(0.5, t => 100, t => 0.1 * expd(t, 5), "sine"), 0.1, 1);
    return normalize(b, 0.6);
  };
  R.flashlight_click = () => {
    const b = buf(0.14);
    mix(b, lp(click(0.04, 1800), 5000), 0, 1);
    mix(b, lp(click(0.03, 2400), 5000), 0.05, 0.55);
    mix(b, tone(0.06, t => 700, t => expd(t, 60), "sine"), 0, 0.18);
    return normalize(b, 0.4);
  };  R.detector_beep = () => {
    const b = tone(0.2, t => 1040, t => Math.min(1, t / 0.006) * expd(t, 13), "sine");
    mix(b, tone(0.2, t => 2080, t => expd(t, 22), "sine"), 0, 0.14);
    return normalize(lp(b, 3200), 0.36);
  };  R.radio_voice = () => {
    const sec = 3.0, b = buf(sec);
    const vowels = [[700, 1100], [450, 1800], [320, 2200], [500, 900], [600, 1300]];
    let ph = 0;
    for (let i = 0; i < b.length; i++) {
      const t = i / SR;
      const syl = Math.floor(t * 4.5);
      const v = vowels[(syl * 7 + 3) % vowels.length];
      const gate = Math.max(0, Math.sin(t * 4.5 * Math.PI)) ** 0.5 * (syl % 6 === 5 ? 0 : 1);
      ph += TAU * (115 + 12 * Math.sin(t * 3)) / SR;
      const saw = ((ph / TAU) % 1) * 2 - 1;
      b[i] = saw * gate * (0.5 + 0.5 * Math.sin(TAU * v[0] * t)) * 0.7 + saw * gate * Math.sin(TAU * v[1] * t) * 0.35;
    }
    const v = bp(b, 300, 3200);
    const st = bp(noiseBuf(sec), 600, 5000);
    for (let i = 0; i < v.length; i++) {
      const t = i / SR;
      v[i] = (v[i] * 0.9 + st[i] * 0.35 * (0.5 + 0.5 * Math.sin(t * 17))) * Math.min(1, t / 0.1) * Math.min(1, (sec - t) / 0.2);
    }
    return normalize(v, 0.55);
  };

  R.radio_static = () => {
    const sec = 2.0, n = noiseBuf(sec + 0.2), b = bp(n, 300, 4200);
    for (let i = 0; i < b.length; i++) {
      const t = i / SR;
      b[i] *= 0.45 + 0.55 * Math.abs(Math.sin(t * 41 + Math.sin(t * 5) * 3));
      if (rnd() < 0.0004) b[i] += (rnd() - 0.5) * 1.6;   // crackle
    }
    return normalize(loopify(lp(b, 4500), 0.2), 0.3);
  };
  /* beacon ---------------------------------------------------------------- */
  R.beacon_activate = () => {
    const sec = 2.6, b = buf(sec);
    mix(b, tone(sec, t => 120 * Math.pow(6, t / sec), t => 0.6 * Math.min(1, t / 0.3) * (t > sec - 0.5 ? (sec - t) / 0.5 : 1), "saw"), 0, 0.5);
    mix(b, tone(sec, t => 240 * Math.pow(6, t / sec), t => 0.4 * Math.min(1, t / 0.5) * (t > sec - 0.5 ? (sec - t) / 0.5 : 1), "sine"), 0, 0.7);
    mix(b, tone(0.9, t => 1760, t => 0.5 * expd(t, 4), "sine"), sec - 0.9, 0.7);
    mix(b, tone(0.9, t => 2640, t => 0.3 * expd(t, 5), "sine"), sec - 0.85, 0.7);
    const f = lp(b, 6000);
    return normalize(f, 0.6);
  };
  R.beacon_pulse = () => {
    const b = buf(1.6);
    mix(b, tone(1.6, t => 196 - 30 * t, t => expd(t, 3) * Math.min(1, t / 0.02), "sine"), 0, 0.8);
    mix(b, tone(1.6, t => 392 - 60 * t, t => expd(t, 5), "sine"), 0, 0.2);
    mix(b, tone(1.2, t => 196 - 30 * t, t => expd(t, 4), "sine"), 0.32, 0.3);
    return normalize(lp(b, 1800), 0.5);
  };
  /* weather --------------------------------------------------------------- */
  R.thunder = () => {
    const sec = 4.5, b = buf(sec);
    const n1 = lp(noiseBuf(sec), 500), n2 = lp(brown(sec), 140);
    for (let i = 0; i < b.length; i++) {
      const t = i / SR;
      const crack = t < 0.4 ? Math.exp(-t * 9) : 0;
      const roll = (Math.min(1, t / 0.25)) * Math.exp(-t * 0.85) * (0.6 + 0.4 * Math.sin(t * 5.3 + Math.sin(t * 1.7) * 3));
      b[i] = (hpSample(n1, i) * crack * 1.5) + n1[i] * roll * 1.1 + n2[i] * roll * 2.2;
    }
    return normalize(b, 0.85);
  };
  function hpSample(arr, i) { return i > 0 ? arr[i] - arr[i - 1] * 0.9 : arr[i]; }

  R.rain_loop = () => {
    const sec = 5.0, n = noiseBuf(sec + 0.5);
    const hi = lp(hp(n, 1200), 7500), mid = bp(n, 300, 1200), lo = lp(n, 220);
    const b = buf(sec + 0.5);
    for (let i = 0; i < b.length; i++) { const t = i / SR; b[i] = hi[i] * 0.55 + mid[i] * 0.35 + lo[i] * 0.2 + hi[i] * 0.12 * Math.sin(t * 0.7); }
    for (let k = 0; k < 120; k++) { const d = lp(click(0.03, 1500), 3500); mix(b, d, rnd() * sec, 0.05 + rnd() * 0.12); }   // big drops hitting leaves
    return normalize(loopify(b, 0.5), 0.4);
  };  R.wind_loop = () => {
    const sec = 9.0, n = noiseBuf(sec + 0.8), b = new Float32Array(n.length);
    const a = lp(n, 200), c = lp(n, 700), d = bp(n, 400, 1300);
    for (let i = 0; i < b.length; i++) {
      const t = i / SR;
      const g = 0.5 + 0.5 * Math.sin(t * 0.7 + Math.sin(t * 0.31) * 2);
      b[i] = a[i] * 2.2 * g + c[i] * 0.55 * g * g + d[i] * 0.28 * (0.5 + 0.5 * Math.sin(t * 1.3)) * g;
    }
    return normalize(loopify(lp(b, 1500), 0.8), 0.4);
  };  R.ambient_forest_night = () => {
    const sec = 14.0, b = buf(sec + 1.0), N = b.length;
    // soft moving air bed
    const air = lp(bp(noiseBuf(sec + 1.0), 120, 900), 700), air2 = lp(brown(sec + 1.0), 160);
    for (let i = 0; i < N; i++) { const t = i / SR; b[i] = air[i] * (0.1 + 0.08 * Math.sin(t * 0.43)) + air2[i] * 0.55; }
    // distant crickets: soft, low, irregular
    for (let c = 0; c < 4; c++) {
      const base = 2900 + c * 210 + rnd() * 80, rate = 0.38 + c * 0.11 + rnd() * 0.05;
      for (let t0 = rnd() * 2; t0 < sec; t0 += 1 / rate * (0.85 + rnd() * 0.3)) {
        const n = 3 + Math.floor(rnd() * 2);
        for (let p = 0; p < n; p++) mix(b, lp(tone(0.035, t => base * (1 + 0.01 * t * 20), t => Math.sin(Math.PI * clamp(t / 0.035, 0, 1)) ** 2, "sine"), 3600), t0 + p * 0.06, 0.012);
      }
    }
    // owl
    const ot = 3 + rnd() * 5;
    [[0, 0.5, 400], [0.65, 0.8, 350]].forEach(o => mix(b, lp(tone(o[1], t => o[2] - 40 * t, t => Math.sin(Math.PI * clamp(t / o[1], 0, 1)) ** 1.5, "sine"), 800), ot + o[0], 0.055));
    // twigs / leaves rustling
    for (let k = 0; k < 6; k++) { const r = lp(bp(noiseBuf(0.5), 800, 3500), 3500); for (let i = 0; i < r.length; i++) r[i] *= Math.sin(Math.PI * i / r.length) ** 2; mix(b, r, rnd() * sec, 0.05 + rnd() * 0.05); }
    return normalize(loopify(b, 1.0), 0.32);
  };
  /* the creature & stress ------------------------------------------------- */
  R.heartbeat = () => {
    const sec = 0.86, b = buf(sec);
    mix(b, tone(0.22, t => 62 - 20 * t, t => expd(t, 17) * Math.min(1, t / 0.006), "sine"), 0.0, 1.0);
    mix(b, tone(0.2, t => 52 - 14 * t, t => expd(t, 20) * Math.min(1, t / 0.006), "sine"), 0.27, 0.75);
    const l = lp(b, 160);
    return normalize(l, 0.95);
  };
  R.run_breath = () => {
    const sec = 1.1, n = noiseBuf(sec), b = bp(n, 350, 2600);
    for (let i = 0; i < b.length; i++) {
      const t = i / SR, ph = (t / 0.55) % 1;
      b[i] *= Math.sin(Math.PI * ph) ** 2 * (ph < 0.45 ? 1 : 0.7);
    }
    return normalize(loopify(mixPad(b), 0.08), 0.35);
  };
  function mixPad(b) { const o = new Float32Array(b.length + Math.floor(0.08 * SR)); for (let i = 0; i < o.length; i++) o[i] = b[i % b.length]; return o; }

  R.hollow_breath = () => {
    const sec = 3.4, n = noiseBuf(sec + 0.4), b = new Float32Array(n.length);
    const a = bp(n, 150, 900), c = bp(n, 1200, 3000), l = lp(brown(sec + 0.4), 90);
    for (let i = 0; i < b.length; i++) {
      const t = i / SR, ph = (t / 3.4) % 1;
      const inh = ph < 0.4 ? Math.sin(Math.PI * ph / 0.4) : 0;
      const exh = ph > 0.5 && ph < 0.95 ? Math.sin(Math.PI * (ph - 0.5) / 0.45) : 0;
      const rasp = 0.5 + 0.5 * Math.sin(t * 61);
      b[i] = a[i] * (inh * 1.2 + exh * 1.8) + c[i] * (inh * 0.5 + exh * 0.35) * rasp + l[i] * 3 * exh;
    }
    return normalize(loopify(b, 0.4), 0.7);
  };
  R.hollow_growl = () => {
    const sec = 1.9, b = buf(sec); let ph = 0, ph2 = 0;
    for (let i = 0; i < b.length; i++) {
      const t = i / SR;
      const f = 58 - 14 * t + 4 * Math.sin(t * 30);
      ph += TAU * f / SR; ph2 += TAU * f * 2.51 / SR;
      const saw = ((ph / TAU) % 1) * 2 - 1;
      const am = 0.55 + 0.45 * Math.sin(t * TAU * 27);
      const env = Math.min(1, t / 0.15) * Math.max(0, 1 - Math.max(0, t - 1.2) / 0.7);
      b[i] = (saw * 0.8 + Math.sin(ph2) * 0.3) * am * env;
    }
    const n = bp(noiseBuf(sec), 100, 900);
    for (let i = 0; i < b.length; i++) b[i] += n[i] * 0.6 * (0.5 + 0.5 * Math.sin(i / SR * TAU * 31)) * (i / SR < 1.3 ? 1 : 0.3);
    return normalize(lp(b, 1400), 0.85);
  };
  R.hollow_distant_call = () => {
    const sec = 4.2, b = buf(sec); let ph = 0, ph2 = 0;
    for (let i = 0; i < b.length; i++) {
      const t = i / SR;
      const f = 190 + 140 * Math.sin(Math.PI * clamp(t / 2.4, 0, 1)) - 25 * t + 7 * Math.sin(t * 34);
      ph += TAU * f / SR; ph2 += TAU * (f * 1.5 + 5) / SR;
      const env = Math.min(1, t / 0.6) * Math.max(0, 1 - Math.max(0, t - 2.4) / 1.4);
      b[i] = (Math.sin(ph) * 0.55 + ((ph2 / TAU) % 1 * 2 - 1) * 0.22) * env;
    }
    const f = lp(b, 1300);
    const o = new Float32Array(f.length);
    for (let i = 0; i < f.length; i++) o[i] = f[i] + (i > 7000 ? f[i - 7000] * 0.4 : 0) + (i > 15000 ? f[i - 15000] * 0.22 : 0);
    return normalize(fadeEdges(o, 40), 0.55);
  };  R.hollow_footsteps = () => {
    const b = buf(0.9);
    mix(b, thud(0.4, 48, 9), 0, 1);
    mix(b, lp(noiseBuf(0.25), 300), 0, 1.2);
    mix(b, thud(0.4, 44, 9), 0.42, 0.9);
    mix(b, lp(noiseBuf(0.25), 280), 0.42, 1.0);
    mix(b, bp(noiseBuf(0.1), 800, 3000), 0.0, 0.2);
    return normalize(b, 0.9);
  };

  /* stings ---------------------------------------------------------------- */
  R.caught_sting = () => {
    const sec = 2.4, b = buf(sec);
    const fr = [92, 97.5, 138, 146, 207, 311];
    for (let k = 0; k < fr.length; k++) {
      mix(b, tone(sec, t => fr[k] * (1 - 0.12 * t / sec), t => expd(t, 1.7) * Math.min(1, t / 0.005), "saw"), 0, 0.22);
    }
    mix(b, bp(noiseBuf(1.2), 200, 6000), 0, 0.9);
    for (let i = 0; i < Math.floor(1.2 * SR); i++) b[i] *= expd(i / SR, 4);
    mix(b, thud(0.7, 45, 5), 0, 1.2);
    return normalize(lp(b, 7000), 0.95);
  };
  R.win_sting = () => {
    const sec = 4.0, b = buf(sec);
    const notes = [261.6, 329.6, 392.0, 523.3, 659.3];
    notes.forEach((f, k) => {
      mix(b, tone(3.2, t => f, t => expd(t, 1.1) * Math.min(1, t / 0.02), "tri"), k * 0.22, 0.35);
      mix(b, tone(3.2, t => f * 2, t => expd(t, 1.6) * Math.min(1, t / 0.02), "sine"), k * 0.22, 0.12);
    });
    return normalize(fadeEdges(lp(b, 5000), 20), 0.7);
  };

  /* menu ------------------------------------------------------------------ */
  R.ui_hover = () => {
    const b = lp(bp(noiseBuf(0.05), 1500, 5000), 5000);
    for (let i = 0; i < b.length; i++) b[i] *= expd(i / SR, 90);
    mix(b, tone(0.05, t => 640, t => expd(t, 70) * 0.5, "sine"), 0, 0.5);
    return normalize(b, 0.14);
  };  R.ui_click = () => {
    const b = tone(0.16, t => 210 + 90 * expd(t, 45), t => expd(t, 26) * Math.min(1, t / 0.003), "sine");
    mix(b, lp(click(0.02, 1400), 4500), 0, 0.5);
    mix(b, tone(0.1, t => 480, t => expd(t, 40) * 0.25, "sine"), 0.01, 1);
    return normalize(lp(b, 3200), 0.3);
  };

  /* =================================================================== music */
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);
  const snapHz = (f, sec) => Math.round(f * sec) / sec;          // whole number of cycles per loop => seamless
  function mixw(dst, src, t0, g) {                                // circular mix (events wrap round the loop point)
    const N = dst.length, o = Math.floor(t0 * SR); g = g == null ? 1 : g;
    for (let i = 0; i < src.length; i++) dst[(((o + i) % N) + N) % N] += src[i] * g;
  }
  function pluck(f, dur, bright) {
    const b = buf(dur), H = bright || 5;
    for (let h = 1; h <= H; h++) {
      const a = 1 / h, d = 5 + h * 3.2;
      for (let i = 0; i < b.length; i++) { const t = i / SR; b[i] += Math.sin(TAU * f * h * t) * a * Math.exp(-t * d); }
    }
    for (let i = 0; i < Math.min(b.length, 120); i++) b[i] *= i / 120;
    return b;
  }
  function bell(f, dur) {
    const b = buf(dur), P = [[1, 1, 1.1], [2.76, 0.45, 1.9], [5.4, 0.22, 3], [8.93, 0.1, 4.5]];
    for (let k = 0; k < P.length; k++) for (let i = 0; i < b.length; i++) { const t = i / SR; b[i] += Math.sin(TAU * f * P[k][0] * t) * P[k][1] * Math.exp(-t * P[k][2]); }
    for (let i = 0; i < Math.min(b.length, 90); i++) b[i] *= i / 90;
    return b;
  }

  /* MENU: slow dark ambient, 64 s loop in D minor */
  R.menu_music = () => {
    const sec = 64, L = Math.floor((sec + 2) * SR), b = new Float32Array(L);
    const chords = [[50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52]];
    const F = chords.map(c => c.map(n => snapHz(midi(n), sec))), F2 = chords.map(c => c.map(n => snapHz(midi(n) * 1.0035, sec)));
    const d1 = snapHz(36.71, sec), d2 = snapHz(55.0, sec), d3 = snapHz(73.42, sec);
    for (let i = 0; i < L; i++) {
      const t = i / SR, swell = 0.65 + 0.35 * Math.sin(TAU * t / 32), slow = 0.5 + 0.5 * Math.sin(TAU * t / 16 + 1);
      let v = (Math.sin(TAU * d1 * t) * 0.55 + Math.sin(TAU * d2 * t) * 0.22 * swell + Math.sin(TAU * d3 * t) * 0.1 * slow) * 0.8;
      for (let k = 0; k < 4; k++) {
        let x = ((t - (8 + 16 * k) + 32) % 64 + 64) % 64 - 32;
        if (x < -11 || x > 11) continue;
        const w = 0.5 + 0.5 * Math.cos(Math.PI * x / 11);
        let p = 0;
        for (let n = 0; n < 3; n++) {
          const f = F[k][n], g = F2[k][n];
          p += Math.sin(TAU * f * t) + Math.sin(TAU * g * t) + 0.38 * Math.sin(TAU * 2 * f * t) * (0.6 + 0.4 * slow) + 0.15 * Math.sin(TAU * 3 * g * t) * slow;
        }
        v += p * w * 0.075;
      }
      b[i] = v;
    }
    // distant bells (pentatonic, sparse) with a long dark echo
    const bl = new Float32Array(L), sc = [62, 65, 69, 72, 74, 77, 57, 60];
    let tt = 3.0;
    while (tt < sec) {
      const n = sc[Math.floor(rnd() * sc.length)], f = midi(n), bb = bell(f, 7), g = 0.1 + rnd() * 0.12;
      mix(bl, bb, tt, g); mix(bl, bb, tt - sec, g);
      tt += 3.6 + rnd() * 4.2;
    }
    const d = Math.floor(0.62 * SR), d2s = Math.floor(0.97 * SR);
    for (let i = 0; i < L; i++) { if (i > d) bl[i] += bl[i - d] * 0.42; if (i > d2s) bl[i] += bl[i - d2s] * 0.25; }
    for (let i = 0; i < L; i++) b[i] += bl[i];
    // breathing air + very low rumble (cross-faded loop point hides the noise seam)
    const air = lp(bp(noiseBuf(sec + 2), 200, 1400), 900);
    for (let i = 0; i < L; i++) { const t = i / SR; b[i] += air[i] * 0.25 * (0.4 + 0.6 * Math.sin(TAU * t / 21 + 2) ** 2); }
    // one slow reversed-swell riser in the second half
    const ri = lp(noiseBuf(8), 1800); for (let i = 0; i < ri.length; i++) ri[i] *= Math.pow(i / ri.length, 3) * 0.28;
    mix(b, ri, 36, 1);
    return normalize(loopify(b, 2), 0.62);
  };
  R.menu_music.sr = 16000;

  /* CHASE: 144 bpm, 16 bars, driving low pulse + metallic ticks + rising strings */
  R.chase_music = () => {
    const bpm = 144, beat = 60 / bpm, bars = 16, sec = bars * 4 * beat, N = Math.floor(sec * SR), b = new Float32Array(N);
    const root = [38, 38, 39, 38, 38, 38, 36, 37];                    // D2 ... with b2 / flat-6 tension per bar
    for (let bar = 0; bar < bars; bar++) {
      const t0 = bar * 4 * beat, r = midi(root[bar % 8]);
      // "lub-dub" low pulse
      for (let q = 0; q < 4; q++) {
        mixw(b, thud(0.4, 48, 10), t0 + q * beat, q % 2 === 0 ? 1.0 : 0.7);
        mixw(b, thud(0.3, 44, 13), t0 + q * beat + beat * 0.38, 0.45);
      }
      // 8th-note bass ostinato
      const pat = [1, 1, 0, 1, 1, 0, 1, 0.6];
      for (let e = 0; e < 8; e++) if (pat[e]) {
        const f = r * (e === 6 ? 1.5 : (e === 7 ? 1.0595 : 1)) * (bar % 4 === 3 && e > 3 ? 1.0595 : 1);
        mixw(b, pluck(f, 0.32, 5), t0 + e * beat / 2, 0.34 * pat[e]);
      }
      // 16th ticks
      for (let s = 0; s < 16; s++) {
        const acc = s % 4 === 0 ? 1 : (s % 2 === 0 ? 0.55 : 0.28);
        const tick = hp(noiseBuf(0.05), 6000); for (let i = 0; i < tick.length; i++) tick[i] *= Math.exp(-i / SR * 90);
        mixw(b, tick, t0 + s * beat / 4, 0.16 * acc);
      }
      // snare on 2 and 4
      for (const q of [1, 3]) {
        const sn = bp(noiseBuf(0.2), 1400, 6500); for (let i = 0; i < sn.length; i++) sn[i] *= Math.exp(-i / SR * 20);
        mixw(b, sn, t0 + q * beat, 0.3); mixw(b, thud(0.15, 190, 30), t0 + q * beat, 0.25);
      }
      if (bar % 2 === 0) mixw(b, ring(1.2, [312, 587, 1090, 1730], 4, 0.4), t0, 0.22);     // anvil / metal hit
      // dissonant cluster stab at the start of every phrase
      if (bar % 4 === 0) for (const n of [50, 51, 57, 62]) mixw(b, lp(tone(1.4, t => midi(n), t => Math.exp(-t * 2.2) * Math.min(1, t / 0.01), "saw"), 1500), t0, 0.1);
    }
    // rising tremolo strings (minor second apart) over each 4-bar phrase
    for (let ph = 0; ph < bars / 4; ph++) {
      const len = 16 * beat, t0 = ph * len;
      for (const n0 of [69, 70]) {
        const s = tone(len, t => midi(n0) * (1 + 0.12 * (t / len)), t => Math.pow(t / len, 1.6) * (0.55 + 0.45 * Math.sin(TAU * 11 * t)) * (t > len - 0.05 ? (len - t) / 0.05 : 1), "saw");
        mixw(b, lp(lp(s, 2200), 2600), t0, 0.07);
      }
      const rs = hp(noiseBuf(len), 1500); for (let i = 0; i < rs.length; i++) rs[i] *= Math.pow(i / rs.length, 2.5);
      mixw(b, rs, t0, 0.11);
    }
    // constant deep drone
    const df = snapHz(36.71, sec);
    for (let i = 0; i < N; i++) b[i] += Math.sin(TAU * df * i / SR) * 0.18;
    return normalize(b, 0.82);
  };
  R.chase_music.sr = 22050;

  /* a short sad/relieved phrase for the ending */
  R.ending_music = () => {
    const sec = 20, b = buf(sec), ns = [[62, 0], [65, 1.2], [69, 2.4], [72, 4.2], [70, 6.4], [69, 8.6], [65, 10.8], [62, 13], [57, 15.5]];
    ns.forEach(n => { mix(b, bell(midi(n[0]), 6), n[1], 0.32); mix(b, lp(tone(7, t => midi(n[0] - 12), t => Math.sin(Math.PI * clamp(t / 7, 0, 1)) ** 1.5 * 0.5, "sine"), 800), n[1], 0.28); });
    for (const n of [50, 53, 57]) mix(b, lp(tone(sec, t => midi(n), t => Math.sin(Math.PI * clamp(t / sec, 0, 1)) * 0.5, "saw"), 600), 0, 0.12);
    const d = Math.floor(0.7 * SR); for (let i = d; i < b.length; i++) b[i] += b[i - d] * 0.4;
    return normalize(fadeEdges(b, 120), 0.6);
  };
  R.ending_music.sr = 16000;

  /* jump-scare sounds */
  R.scare_hit = () => {
    const sec = 1.6, b = buf(sec);
    const n = bp(noiseBuf(0.9), 120, 9000); for (let i = 0; i < n.length; i++) n[i] *= Math.exp(-i / SR * 5);
    mix(b, n, 0, 1.0);
    mix(b, thud(0.9, 52, 4.5), 0, 1.3);
    let ph = 0, ph2 = 0;
    for (let i = 0; i < Math.floor(0.9 * SR); i++) {
      const t = i / SR, f = 700 + 1900 * Math.min(1, t / 0.12) - 500 * t + 60 * Math.sin(t * 60);
      ph += TAU * f / SR; ph2 += TAU * f * 1.51 / SR;
      b[i] += (Math.sin(ph) * 0.5 + Math.sin(ph2) * 0.3 + (((ph / TAU) % 1) * 2 - 1) * 0.3) * Math.exp(-t * 3.2) * 0.8;
    }
    for (let i = 0; i < b.length; i++) b[i] = Math.tanh(b[i] * 1.8) * 0.85;
    return normalize(lp(b, 9000), 0.92);
  };
  R.whisper = () => {
    const sec = 1.8, n = bp(noiseBuf(sec), 1600, 5200), b = new Float32Array(n.length), f2 = bp(noiseBuf(sec), 500, 1200);
    for (let i = 0; i < b.length; i++) {
      const t = i / SR, syl = Math.pow(Math.max(0, Math.sin(t * 9.5 + Math.sin(t * 3) * 1.5)), 2), env = Math.sin(Math.PI * clamp(t / sec, 0, 1));
      b[i] = (n[i] * 0.8 + f2[i] * 0.6) * syl * env;
    }
    return normalize(b, 0.45);
  };
  R.door_slam = () => {
    const b = thud(0.7, 52, 7);
    mix(b, lp(bp(noiseBuf(0.35), 80, 2500), 2500), 0, 0.9);
    mix(b, ring(0.6, [140, 310, 620], 9, 0.3), 0, 0.5);
    mix(b, thud(0.3, 90, 18), 0.09, 0.4);
    return normalize(lp(b, 4000), 0.9);
  };
  R.heli_loop = () => {
    const sec = 1.0, b = buf(sec), n = lp(noiseBuf(sec), 900), n2 = hp(lp(noiseBuf(sec), 4500), 1800);
    for (let i = 0; i < b.length; i++) {
      const t = i / SR, thump = Math.pow(Math.max(0, Math.sin(Math.PI * 11 * t)), 6), whine = Math.sin(TAU * 320 * t) * 0.06;
      b[i] = (n[i] * 1.6 + Math.sin(TAU * 48 * t) * 0.5) * (0.35 + 0.65 * thump) + n2[i] * 0.25 * (0.4 + 0.6 * thump) + whine;
    }
    return normalize(b, 0.6);
  };
  R.light_buzz = () => {
    const b = buf(0.5);
    for (let i = 0; i < b.length; i++) { const t = i / SR; b[i] = (Math.sin(TAU * 100 * t) * 0.5 + Math.sin(TAU * 300 * t) * 0.25 + (rnd() - 0.5) * 0.3) * (Math.sin(t * 90) > -0.3 ? 1 : 0.2) * Math.exp(-t * 4); }
    return normalize(lp(b, 3500), 0.4);
  };

  /* -------------------------------------------------------------- public API */
  const cache = {};
  const aliases = { footstep_: "footstep_dirt" };

  function resolve(name) {
    if (R[name]) return name;
    if (name.indexOf("footstep_") === 0) return aliases.footstep_;
    return null;
  }

  /* one-shots that get several different renders so repeats never sound identical */
  const VARIANTS = { footstep_grass: 5, footstep_dirt: 5, footstep_wood: 5, footstep_metal: 4, footstep_concrete: 4, footstep_water: 3,
    door_open: 2, door_close: 2, item_pickup: 2, keypad_beep: 1, hollow_footsteps: 3, ladder_climb: 2, ui_click: 1, whisper: 2 };

  return {
    has(name) { return !!resolve(name); },
    variants(name) { const k = resolve(name); return (k && VARIANTS[k]) || 1; },
    /* returns a plain {data:Float32Array, rate} or null */
    make(name, v) {
      const key = resolve(name);
      if (!key) return null;
      const ck = key + (v ? "#" + v : "");
      if (cache[ck]) return cache[ck];
      try {
        rnd = rngFor(ck);
        SR = R[key].sr || DEFSR;
        const data = R[key]();
        const outRate = SR; SR = DEFSR;
        for (let i = 0; i < data.length; i++) { const x = data[i]; data[i] = x > 1 ? 1 : (x < -1 ? -1 : (x !== x ? 0 : x)); }
        cache[ck] = { data: data, rate: outRate };
      } catch (e) {
        console.warn("[Synth] failed to render " + key, e);
        cache[ck] = null;
      }
      return cache[ck];
    }
  };
})();
