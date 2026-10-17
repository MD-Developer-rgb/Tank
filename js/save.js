"use strict";
/* ============================================================================
   THE LAST FIVE NIGHTS - save.js
   localStorage save game + settings. Everything is wrapped in try/catch because
   localStorage can throw in private mode.
   Created by MD Developer
   ============================================================================ */
const Save = {
  KEY: "tlfn_save",

  /* write the game state object; returns true on success */
  write(state) {
    try {
      state.savedAt = new Date().toISOString();
      localStorage.setItem(Save.KEY, JSON.stringify(state));
      return true;
    } catch (e) { console.warn("[Save] write failed", e); return false; }
  },

  /* returns a valid save object or null */
  read() {
    try {
      const raw = localStorage.getItem(Save.KEY);
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (!o || o.version !== 1 || !o.objectives || !CFG.DIFF[o.difficulty]) return null;
      return o;
    } catch (e) { return null; }
  },

  exists() { return !!Save.read(); },

  clear() { try { localStorage.removeItem(Save.KEY); } catch (e) { /* ignore */ } },

  /* e.g. "Stage 3 - Normal - saved 12 Oct 19:45" */
  summary(o) {
    if (!o) return "No saved game";
    const d = new Date(o.savedAt);
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const pad = n => (n < 10 ? "0" : "") + n;
    const when = isNaN(d.getTime()) ? "" : (" - saved " + d.getDate() + " " + months[d.getMonth()] + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()));
    const dl = CFG.DIFF[o.difficulty].label;
    return "Stage " + o.stage + " - " + dl.charAt(0) + dl.slice(1).toLowerCase() + when;
  }
};

const Settings = {
  KEY: "tlfn_settings",
  data: {
    music: 70, sfx: 80, sens: 50, invertY: false, quality: "MEDIUM",
    showFps: false, brightness: 100, vibration: true
  },
  listeners: [],

  load() {
    let found = false;
    try {
      const raw = localStorage.getItem(Settings.KEY);
      if (raw) {
        const o = JSON.parse(raw);
        for (const k in Settings.data) if (o[k] !== undefined) Settings.data[k] = o[k];
        found = true;
      }
    } catch (e) { /* ignore */ }
    // first run on a touch phone: default to LOW graphics for smooth frame rates
    if (!found && ("ontouchstart" in window || navigator.maxTouchPoints > 0)) Settings.data.quality = "LOW";
    if (!CFG.QUALITY[Settings.data.quality]) Settings.data.quality = "MEDIUM";
  },

  save() {
    try { localStorage.setItem(Settings.KEY, JSON.stringify(Settings.data)); } catch (e) { /* ignore */ }
  },

  /* set a value, persist immediately and notify listeners (applied live) */
  set(k, v) {
    Settings.data[k] = v;
    Settings.save();
    for (const fn of Settings.listeners) { try { fn(k, v); } catch (e) { console.error(e); } }
  },

  get(k) { return Settings.data[k]; },
  onChange(fn) { Settings.listeners.push(fn); }
};
