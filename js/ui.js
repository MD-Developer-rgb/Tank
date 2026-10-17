"use strict";
/* ============================================================================
   THE LAST FIVE NIGHTS - ui.js
   Everything the player sees while playing: HUD (objective, bars, prompt, hold
   ring, toasts, hints, detector, weather, rescue timer, FPS), screen effects
   (vignette, noise, brightness, fade, centre text), modals (notes, keypad,
   radio tuner, route decision, fog-of-war map, inventory + notebook) and the
   mobile touch controls (joystick, look-drag, buttons).
   Created by MD Developer
   ============================================================================ */
const UI = {
  isTouch: false,
  el: {},
  stack: [],                 // open modals, most recent last
  openedAt: 0,
  threat: 0, chase: false, tNow: 0,
  _toastN: 0, _hintT: 0, _centerT: 0, _objT: 0, _obj: null, _pulseT: 0,
  _promptTxt: null, _barCache: {}, _mapTimer: 0, _expT: 0, _fps: { acc: 0, n: 0, shown: 0 },
  _noteCb: null, _keypad: null, _radio: null, _decisionCb: null, _weatherIcons: ["☾", "☔", "⛈"],
  _weatherNames: ["Clear night", "Light rain", "Storm"],

  /* ================================================================== init */
  init() {
    const $ = id => document.getElementById(id);
    const ids = ["hud", "hud-objective", "obj-title", "obj-lines", "hud-detector", "hud-weather", "bar-battery", "bar-stamina", "batt-spare",
      "hud-prompt", "hud-hold", "hold-ring", "hud-rescue", "hud-charge", "hud-hint", "hud-toasts", "hud-fps",
      "fx-vignette", "fx-noise", "fx-brightness", "fx-fade", "fx-center",
      "modal-note", "note-title", "note-body", "note-close", "modal-keypad", "keypad-title", "keypad-display", "keypad-grid", "keypad-cancel",
      "modal-radio", "radio-freq", "static-fill", "radio-status", "radio-dial", "radio-cancel", "modal-decision", "route-a", "route-b",
      "modal-map", "map-canvas", "map-close", "modal-inv", "tab-inv", "tab-notes", "inv-pane", "inv-grid", "inv-tools", "btn-use-battery",
      "notes-pane", "notes-list", "inv-close", "touch-ui", "joy-base", "joy-knob", "btn-interact", "btn-run", "btn-flash", "btn-hide",
      "btn-t-pause", "btn-t-map", "btn-t-inv", "game-canvas"];
    ids.forEach(function (id) { UI.el[id] = $(id); });

    UI.isTouch = !!((window.matchMedia && window.matchMedia("(pointer: coarse)").matches) || ("ontouchstart" in window && navigator.maxTouchPoints > 1 && !window.matchMedia("(pointer: fine)").matches));
    document.body.classList.toggle("touch", UI.isTouch);

    UI._makeNoiseTexture();
    UI._bindModals();
    UI._bindTouch();
    UI.setBrightness(Settings.get("brightness"));

    // a real touch on a hybrid device switches the game into touch mode
    window.addEventListener("touchstart", function () {
      if (!UI.isTouch) { UI.isTouch = true; document.body.classList.add("touch"); }
    }, { passive: true, once: true });
    window.addEventListener("contextmenu", function (e) { if (UI.isTouch) e.preventDefault(); });
    Settings.onChange(function (k, v) { if (k === "brightness") UI.setBrightness(v); });
  },

  _makeNoiseTexture() {
    try {
      const c = document.createElement("canvas"); c.width = c.height = 128;
      const g = c.getContext("2d"), img = g.createImageData(128, 128);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255 | 0;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      UI.el["fx-noise"].style.backgroundImage = "url(" + c.toDataURL("image/png") + ")";
    } catch (e) { /* the noise overlay is optional */ }
  },

  /* ============================================================ HUD basics */
  hudInit() {
    const E = UI.el;
    UI.resetAll();
    E["hud-prompt"].style.display = "none"; UI._promptTxt = null;
    E["hud-hold"].style.display = "none";
    E["hud-rescue"].style.display = "none";
    E["hud-charge"].style.display = "none";
    E["hud-hint"].style.display = "none";
    E["hud-toasts"].textContent = "";
    UI._barCache = {};
    UI.setWeather(World.weather.state);
    UI.setBrightness(Settings.get("brightness"));
    UI._applyFpsVisibility();
    UI.refreshDetector();
    UI.showObjective(true);
  },

  toast(text) {
    const box = UI.el["hud-toasts"];
    for (let i = 0; i < box.children.length; i++) if (box.children[i].textContent === text) return;   // no duplicates
    while (box.children.length >= 4) box.removeChild(box.firstChild);
    const d = document.createElement("div");
    d.className = "toast"; d.textContent = text;
    box.appendChild(d);
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 4200);
  },

  hint(text) {
    const h = UI.el["hud-hint"];
    h.textContent = text; h.style.display = "block";
    clearTimeout(UI._hintT);
    UI._hintT = setTimeout(function () { h.style.display = "none"; }, 7000);
  },

  setPrompt(text) {
    if (text === UI._promptTxt) return;
    UI._promptTxt = text;
    const p = UI.el["hud-prompt"];
    if (text) { p.textContent = text; p.style.display = "block"; } else p.style.display = "none";
  },

  holdProgress(p) {
    const h = UI.el["hud-hold"];
    if (p === null || p === undefined) { h.style.display = "none"; return; }
    h.style.display = "block";
    UI.el["hold-ring"].style.background = "conic-gradient(#7fe3d0 " + Math.round(p * 360) + "deg, rgba(0,0,0,.4) 0deg)";
  },

  setBars(batt, stamina, spare, exhausted) {
    const C = UI._barCache, E = UI.el;
    const b = Math.round(batt), s = Math.round(stamina * 100), sp = spare | 0, ex = !!exhausted;
    if (C.b !== b) {
      C.b = b; E["bar-battery"].style.width = Math.max(0, Math.min(100, b)) + "%";
      E["bar-battery"].style.background = b <= 15 ? "#d9523f" : "#e6d27a";
    }
    if (C.s !== s || C.ex !== ex) {
      C.s = s; C.ex = ex; E["bar-stamina"].style.width = Math.max(0, Math.min(100, s)) + "%";
      E["bar-stamina"].style.background = ex ? "#d9523f" : "#7fe3d0";
    }
    if (C.sp !== sp) { C.sp = sp; E["batt-spare"].textContent = sp > 0 ? "x" + sp : ""; }
  },

  setObjective(d, flash) {
    UI._obj = d;
    UI.el["obj-title"].textContent = d.title;
    const ul = UI.el["obj-lines"]; ul.textContent = "";
    d.lines.forEach(function (l) {
      const li = document.createElement("li");
      li.textContent = l.t; if (l.done) li.className = "done";
      ul.appendChild(li);
    });
    if (flash) UI.showObjective(true);
  },
  showObjective(show) {
    const o = UI.el["hud-objective"];
    if (!show) { o.classList.remove("show"); return; }
    o.classList.add("show");
    clearTimeout(UI._objT);
    UI._objT = setTimeout(function () { o.classList.remove("show"); }, 9000);
  },

  setCharge(text) {
    const e = UI.el["hud-charge"];
    if (!text) { if (e.style.display !== "none") e.style.display = "none"; return; }
    if (e.textContent !== text) e.textContent = text;
    e.style.display = "block";
  },
  setRescue(sec) {
    const e = UI.el["hud-rescue"];
    const s = Math.ceil(sec), t = "RESCUE IN " + Math.floor(s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60);
    if (e.textContent !== t) e.textContent = t;
    e.style.display = "block";
  },

  setWeather(ns) {
    const e = UI.el["hud-weather"];
    e.textContent = UI._weatherIcons[ns] || "";
    e.title = UI._weatherNames[ns] || "";
  },

  refreshDetector() {
    const has = !!(Game.S && Game.S.objectives.hasDetector);
    UI.el["hud-detector"].classList.toggle("has", has);
  },
  pulseDetector() {
    const d = UI.el["hud-detector"];
    d.classList.add("pulse");
    clearTimeout(UI._pulseT);
    UI._pulseT = setTimeout(function () { d.classList.remove("pulse"); }, 160);
    UI.vibrate(40);
  },

  vibrate(p) { try { if (Settings.get("vibration") && navigator.vibrate) navigator.vibrate(p); } catch (e) { /* ignore */ } },

  /* ============================================================ screen FX */
  setThreat(v, chase) { UI.threat = v; UI.chase = !!chase; },
  setBrightness(pct) {
    const e = UI.el["fx-brightness"]; if (!e) return;
    pct = Math.max(50, Math.min(150, pct));
    if (pct <= 100) { e.style.background = "#000"; e.style.mixBlendMode = "normal"; e.style.opacity = String((100 - pct) / 100 * 0.85); }
    else { e.style.background = "#9fb7ad"; e.style.mixBlendMode = "soft-light"; e.style.opacity = String(Math.min(1, (pct - 100) / 50 * 0.9)); }
  },
  fade(on, sec) {
    const f = UI.el["fx-fade"];
    f.style.transition = "opacity " + (sec || 0.6) + "s";
    f.style.opacity = on ? "1" : "0";
  },
  centerText(text, ms, big) {
    const c = UI.el["fx-center"];
    clearTimeout(UI._centerT);
    if (!text) { c.style.opacity = "0"; return; }
    c.textContent = text;
    c.style.fontSize = big ? "clamp(80px, 22vw, 220px)" : "";
    c.style.opacity = "1";
    if (ms) UI._centerT = setTimeout(function () { c.style.opacity = "0"; }, ms);
  },
  _applyFpsVisibility() { UI.el["hud-fps"].style.display = Settings.get("showFps") ? "block" : "none"; },

  /* called every frame (frame time `dt`) */
  update(dt, playing) {
    UI.tNow += dt;
    const E = UI.el;
    // FPS counter
    const f = UI._fps; f.acc += dt; f.n++;
    if (f.acc >= 0.5) {
      f.shown = Math.round(f.n / f.acc); f.acc = 0; f.n = 0;
      if (Settings.get("showFps")) { E["hud-fps"].style.display = "block"; E["hud-fps"].textContent = f.shown + " FPS"; }
      else if (E["hud-fps"].style.display !== "none") E["hud-fps"].style.display = "none";
    }
    UI._radioTick(dt);
    if (!playing) { E["fx-vignette"].style.opacity = "0"; E["fx-noise"].style.opacity = "0"; return; }

    // threat vignette + grain
    const v = Math.max(0, Math.min(1, UI.threat));
    const pulse = UI.chase ? 0.12 * (0.5 + 0.5 * Math.sin(UI.tNow * 9)) : 0;
    E["fx-vignette"].style.opacity = String(Math.min(1, v * 0.85 + pulse));
    E["fx-noise"].style.opacity = String(Math.min(0.5, v * v * 0.5));
    if (v > 0.25) E["fx-noise"].style.backgroundPosition = ((Math.random() * 160) | 0) + "px " + ((Math.random() * 160) | 0) + "px";

    // detector icon appears once picked up; touch toggle buttons mirror state
    UI._expT -= dt;
    if (UI._expT <= 0) {
      UI._expT = 0.5;
      UI.refreshDetector();
      UI.markExplored();
    }
    if (UI.isTouch) {
      E["btn-run"].classList.toggle("held", !!Player.input.run);
      E["btn-hide"].classList.toggle("held", !!Player.input.crouch);
    }
  },

  /* ================================================================ modals */
  anyModalOpen() { return UI.stack.length > 0; },
  isOpen(name) { return UI.stack.indexOf(name) >= 0; },

  _open(name) {
    if (UI.isOpen(name)) return;
    UI.stack.push(name);
    UI.openedAt = performance.now();
    UI.el["modal-" + name].classList.add("show");
    Player.clearInput();
    Player.releaseLock();
    Player.cancelHold(true);
  },
  _close(name) {
    const i = UI.stack.indexOf(name);
    if (i < 0) return false;
    UI.stack.splice(i, 1);
    UI.el["modal-" + name].classList.remove("show");
    if (name === "map") { clearInterval(UI._mapTimer); }
    if (name === "radio") { Audio.stop("radio_static"); UI._radio = null; }
    if (name === "keypad") UI._keypad = null;
    Player.clearInput();
    if (!UI.stack.length && !UI.isTouch && Main.state === "play" && !Main.paused && Game.state === "playing") Player.requestLock();
    return true;
  },
  /* silent close of everything (used by the game on caught/ending) */
  closeAll() {
    const list = UI.stack.slice();
    list.forEach(function (n) { UI._close(n); });
    UI._noteCb = null; UI._decisionCb = null;
  },
  /* the player pressed Esc / M / I / Tab: close the top modal (the route decision cannot be dismissed) */
  closeTop() {
    for (let i = UI.stack.length - 1; i >= 0; i--) {
      const n = UI.stack[i];
      if (n === "decision") continue;
      if (n === "note") UI._closeNote(); else UI._close(n);
      return;
    }
  },
  /* full reset when returning to the home screen */
  resetAll() {
    UI.closeAll();
    UI.centerText(null);
    UI.el["fx-fade"].style.transition = "none"; UI.el["fx-fade"].style.opacity = "0";
    UI.threat = 0; UI.chase = false;
    UI.el["fx-vignette"].style.opacity = "0"; UI.el["fx-noise"].style.opacity = "0";
    Audio.stop("radio_static");
  },

  _bindModals() {
    const E = UI.el, on = (el, fn) => { el.addEventListener("click", function (e) { e.preventDefault(); fn(e); }); };
    on(E["note-close"], function () { UI._closeNote(); });
    on(E["map-close"], function () { UI._close("map"); });
    on(E["inv-close"], function () { UI._close("inv"); });
    on(E["keypad-cancel"], function () { UI._close("keypad"); });
    on(E["radio-cancel"], function () { UI._close("radio"); });
    on(E["route-a"], function () { UI._decide("A"); });
    on(E["route-b"], function () { UI._decide("B"); });
    on(E["tab-inv"], function () { UI._tab("inv"); });
    on(E["tab-notes"], function () { UI._tab("notes"); });
    on(E["btn-use-battery"], function () { Player.useBattery(false); UI.refreshInventory(); });

    // keypad buttons
    const grid = E["keypad-grid"]; grid.textContent = "";
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "CLR", "0", "DEL"].forEach(function (k) {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = k;
      if (k === "CLR" || k === "DEL") b.style.fontSize = "15px";
      b.addEventListener("click", function (e) { e.preventDefault(); UI._keypadKey(k); });
      grid.appendChild(b);
    });

    // radio dial
    E["radio-dial"].addEventListener("input", function () { UI._radioUpdate(true); });

    // keyboard for modals (the Player handler only deals with Esc / M / I / Tab)
    window.addEventListener("keydown", function (e) {
      if (!UI.stack.length || performance.now() - UI.openedAt < 250) return;
      const top = UI.stack[UI.stack.length - 1], c = e.code;
      if (top === "keypad") {
        if (/^(Digit|Numpad)\d$/.test(c)) { UI._keypadKey(c.slice(-1)); e.preventDefault(); }
        else if (c === "Backspace") { UI._keypadKey("DEL"); e.preventDefault(); }
        else if (c === "Delete") { UI._keypadKey("CLR"); e.preventDefault(); }
      } else if (top === "note") {
        if (!e.repeat && (c === "KeyE" || c === "Enter" || c === "Space")) { UI._closeNote(); e.preventDefault(); }
      } else if (top === "decision") {
        if (c === "Digit1" || c === "KeyA") UI._decide("A"); else if (c === "Digit2" || c === "KeyB") UI._decide("B");
      } else if (top === "radio") {
        const d = E["radio-dial"], v = parseInt(d.value, 10);
        if (c === "ArrowLeft" || c === "KeyA") { d.value = v - 1; UI._radioUpdate(true); e.preventDefault(); }
        else if (c === "ArrowRight" || c === "KeyD") { d.value = v + 1; UI._radioUpdate(true); e.preventDefault(); }
        else if (c === "KeyE" || c === "Enter") { /* nothing: lock is automatic */ }
      } else if (top === "inv") {
        if (c === "KeyB") { Player.useBattery(false); UI.refreshInventory(); }
      }
    });
  },

  /* ----------------------------------------------------------------- notes */
  showNote(title, text, onClose) {
    UI.el["note-title"].textContent = title;
    UI.el["note-body"].textContent = text;
    UI._noteCb = onClose || null;
    UI._open("note");
  },
  _closeNote() {
    if (!UI.isOpen("note")) return;
    const cb = UI._noteCb; UI._noteCb = null;
    UI._close("note");
    if (cb) { try { cb(); } catch (e) { console.error(e); } }
  },

  /* ---------------------------------------------------------------- keypad */
  keypad(title, digits, cb) {
    UI.el["keypad-title"].textContent = title;
    UI._keypad = { n: digits, code: "", cb: cb, busy: false };
    UI._keypadRender();
    UI.el["keypad-display"].className = "";
    UI._open("keypad");
  },
  _keypadRender() {
    const k = UI._keypad; if (!k) return;
    let s = "";
    for (let i = 0; i < k.n; i++) s += (i < k.code.length ? k.code[i] : "•") + (i < k.n - 1 ? " " : "");
    UI.el["keypad-display"].textContent = s;
  },
  _keypadKey(key) {
    const k = UI._keypad; if (!k || k.busy) return;
    const disp = UI.el["keypad-display"];
    if (key === "CLR") k.code = "";
    else if (key === "DEL") k.code = k.code.slice(0, -1);
    else if (k.code.length < k.n) k.code += key;
    Audio.play("keypad_beep", { rate: key === "CLR" || key === "DEL" ? 0.8 : 1 });
    Game.emitNoise(Player.pos, CFG.NOISE.keypad, "keypad");
    UI._keypadRender();
    if (k.code.length === k.n) {
      k.busy = true;
      setTimeout(function () {
        if (UI._keypad !== k) return;
        let ok = false;
        try { ok = !!k.cb(k.code); } catch (e) { console.error(e); }
        if (ok) {
          disp.className = "good"; UI.vibrate(60);
          setTimeout(function () { if (UI._keypad === k) UI._close("keypad"); }, 450);
        } else {
          disp.className = "bad"; UI.vibrate([80, 40, 80]);
          UI.toast("Wrong code.");
          setTimeout(function () { if (UI._keypad === k) { k.code = ""; k.busy = false; disp.className = ""; UI._keypadRender(); } }, 650);
        }
      }, 220);
    }
  },

  /* ----------------------------------------------------------------- radio */
  openRadio(target, cb) {
    UI._radio = { target: target, cb: cb || {}, lockT: 0, done: false, tuneT: 0, lastV: -1 };
    UI.el["radio-dial"].value = 900;
    UI.el["radio-status"].className = "";
    UI._open("radio");
    Audio.play("radio_static", { loop: true, volume: 0.6 });
    UI._radioUpdate(false);
  },
  _radioUpdate(userMoved) {
    const r = UI._radio; if (!r || r.done) return;
    const E = UI.el, v = parseInt(E["radio-dial"].value, 10), f = v / 10;
    E["radio-freq"].textContent = f.toFixed(1);
    const diff = Math.abs(f - r.target), stat = Math.max(0.04, Math.min(1, diff / 6));
    E["static-fill"].style.width = Math.round((1 - stat) * 100) + "%";
    Audio.setVolume("radio_static", Math.min(1, 0.12 + stat * 0.85));
    const st = E["radio-status"];
    if (diff <= 0.3) { st.textContent = "SIGNAL FOUND - HOLD STEADY"; st.className = "locked"; }
    else { st.className = ""; st.textContent = diff < 1.5 ? "SIGNAL STRONG" : (diff < 4 ? "SIGNAL WEAK" : "STATIC"); }
    if (userMoved && v !== r.lastV) {
      r.lastV = v;
      if (performance.now() - r.tuneT > 900) { r.tuneT = performance.now(); if (r.cb.tune) r.cb.tune(); }
    }
  },
  _radioTick(dt) {
    const r = UI._radio; if (!r || r.done) return;
    const f = parseInt(UI.el["radio-dial"].value, 10) / 10;
    if (Math.abs(f - r.target) <= 0.3) {
      r.lockT += dt;
      if (r.lockT >= 0.9) {
        r.done = true;
        UI.el["radio-status"].textContent = "LOCKED"; UI.el["radio-status"].className = "locked";
        Audio.play("keypad_beep", { rate: 1.6 }); UI.vibrate(100);
        setTimeout(function () {
          const cb = r.cb; UI._close("radio");
          if (cb.locked) cb.locked();
        }, 600);
      }
    } else r.lockT = Math.max(0, r.lockT - dt * 2);
  },

  /* -------------------------------------------------------------- decision */
  showDecision(cb) {
    UI._decisionCb = cb;
    UI._open("decision");
  },
  _decide(route) {
    if (!UI.isOpen("decision")) return;
    const cb = UI._decisionCb; UI._decisionCb = null;
    UI._close("decision");
    Audio.play("ui_click");
    if (cb) cb(route);
  },

  /* ------------------------------------------------------------- inventory */
  toggleInventory() {
    if (UI.isOpen("inv")) { UI._close("inv"); return; }
    if (UI.anyModalOpen() || Game.state !== "playing" || Main.paused) return;
    UI._tab("inv");
    UI._open("inv");
  },
  _tab(which) {
    const E = UI.el, inv = which === "inv";
    E["tab-inv"].classList.toggle("active", inv); E["tab-notes"].classList.toggle("active", !inv);
    E["inv-pane"].style.display = inv ? "block" : "none";
    E["notes-pane"].style.display = inv ? "none" : "block";
    UI.refreshInventory();
  },
  refreshInventory() {
    if (!UI.isOpen("inv") || !Game.S) return;
    const E = UI.el, S = Game.S, O = S.objectives;
    const COLORS = { relay: "#d9a441", fuelcan: "#c0392b", fuse: "#e6d27a", connector: "#7fb0e3", cutter: "#9aa5a0", beaconbattery: "#6fd08c", beacon: "#ff8f5a" };
    const names = {};
    for (const k in Game.ITEMS) { const d = Game.ITEMS[k]; if (d.kind === "carry") names[d.inv || k] = d.name; }
    const carried = S.inventory.filter(i => names[i]);
    const grid = E["inv-grid"]; grid.textContent = "";
    for (let i = 0; i < CFG.PLAYER.maxCarry; i++) {
      const s = document.createElement("div"); s.className = "slot";
      if (carried[i]) {
        s.className = "slot full";
        const sw = document.createElement("i"); sw.style.background = COLORS[carried[i]] || "#888";
        s.appendChild(sw); s.appendChild(document.createTextNode(names[carried[i]]));
      } else s.textContent = "empty";
      grid.appendChild(s);
    }
    const lines = [];
    lines.push("Flashlight: " + (O.hasFlashlight ? Math.round(S.flashlightBattery) + "% charge" : "not found"));
    lines.push("Spare batteries: " + S.spareBatteries + (S.spareBatteries ? "  (press B to use one)" : ""));
    lines.push("Compound map: " + (O.hasMap ? "yes" : "not found"));
    lines.push("Motion detector: " + (O.hasDetector ? "yes" : "not found"));
    lines.push("Difficulty: " + Game.diff().label + (S.attemptsLeft !== null && S.attemptsLeft !== undefined ? "   Attempts left: " + S.attemptsLeft : ""));
    E["inv-tools"].textContent = lines.join("\n"); E["inv-tools"].style.whiteSpace = "pre-line";
    E["btn-use-battery"].disabled = S.spareBatteries <= 0;

    const nl = E["notes-list"]; nl.textContent = "";
    if (!S.notes.length) { const d = document.createElement("div"); d.className = "note-entry"; d.textContent = "No notes found yet."; nl.appendChild(d); }
    S.notes.forEach(function (id) {
      const n = Game.NOTES[id]; if (!n) return;
      const d = document.createElement("div"); d.className = "note-entry";
      const b = document.createElement("b"); b.textContent = n.title;
      const sp = document.createElement("span"); sp.textContent = n.text();
      d.appendChild(b); d.appendChild(sp); nl.appendChild(d);
    });
  },

  /* ------------------------------------------------------------------- map */
  toggleMap() {
    if (UI.isOpen("map")) { UI._close("map"); return; }
    if (UI.anyModalOpen() || Game.state !== "playing" || Main.paused) return;
    const O = Game.S.objectives;
    if (!O.hasMap && !O.binocularsUsed) { UI.toast("You do not have the compound map yet."); return; }
    UI._open("map");
    UI.drawMap();
    clearInterval(UI._mapTimer);
    UI._mapTimer = setInterval(UI.drawMap, 90);
  },

  /* remember which parts of the compound the player has walked through */
  markExplored() {
    const S = Game.S; if (!S || Game.state !== "playing" || !Player.pos) return;
    const cx = Math.floor(Player.pos.x / 6), cz = Math.floor(Player.pos.z / 6), key = (cx + 50) * 1000 + (cz + 50);
    if (S.explored.indexOf(key) < 0) S.explored.push(key);
  },

  drawMap() {
    const cv = UI.el["map-canvas"]; if (!cv || !Game.S) return;
    const g = cv.getContext("2d"), W = cv.width, H = cv.height, B = CFG.BOUNDS, S = Game.S;
    const sc = Math.min(W / (B.maxX - B.minX), H / (B.maxZ - B.minZ));
    const ox = (W - (B.maxX - B.minX) * sc) / 2, oy = (H - (B.maxZ - B.minZ) * sc) / 2;
    const X = x => ox + (x - B.minX) * sc, Y = z => oy + (z - B.minZ) * sc;

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = "#04100d"; g.fillRect(0, 0, W, H);
    // terrain
    g.fillStyle = "#0b1b15"; g.fillRect(X(B.minX), Y(B.minZ), (B.maxX - B.minX) * sc, (B.maxZ - B.minZ) * sc);
    g.strokeStyle = "rgba(127,227,208,0.06)"; g.lineWidth = 1;
    for (let x = Math.ceil(B.minX / 10) * 10; x <= B.maxX; x += 10) { g.beginPath(); g.moveTo(X(x), Y(B.minZ)); g.lineTo(X(x), Y(B.maxZ)); g.stroke(); }
    for (let z = Math.ceil(B.minZ / 10) * 10; z <= B.maxZ; z += 10) { g.beginPath(); g.moveTo(X(B.minX), Y(z)); g.lineTo(X(B.maxX), Y(z)); g.stroke(); }
    // stream + bridges
    const st = World.stream;
    g.fillStyle = "#1a4a66"; g.fillRect(X(st.x0), Y(st.z0), (st.x1 - st.x0) * sc, (st.z1 - st.z0) * sc);
    g.fillStyle = "#6b4a28";
    World.bridges.forEach(function (b) { g.fillRect(X(b.x - b.hw), Y(st.z0) - 1, b.hw * 2 * sc, (st.z1 - st.z0) * sc + 2); });
    // paths
    g.strokeStyle = "#5a5036"; g.lineWidth = 3; g.lineCap = "round";
    World.edges.forEach(function (e) {
      if (e.interior) return;
      const a = World.nodes[e.a], b = World.nodes[e.b];
      g.beginPath(); g.moveTo(X(a.x), Y(a.z)); g.lineTo(X(b.x), Y(b.z)); g.stroke();
    });
    // buildings
    World.buildings.forEach(function (b) {
      g.fillStyle = "#1d3a33"; g.strokeStyle = "#6fb8a6"; g.lineWidth = 1.5;
      g.fillRect(X(b.x0), Y(b.z0), (b.x1 - b.x0) * sc, (b.z1 - b.z0) * sc);
      g.strokeRect(X(b.x0), Y(b.z0), (b.x1 - b.x0) * sc, (b.z1 - b.z0) * sc);
    });
    // beacon clearing circle and special areas
    World.areas.forEach(function (a) {
      if (a.shape === "circle") {
        g.strokeStyle = "rgba(255,200,120,0.55)"; g.setLineDash([5, 4]); g.lineWidth = 2;
        g.beginPath(); g.arc(X(a.x), Y(a.z), (a.w / 2) * sc, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      }
    });
    // tower + vehicle + generator markers
    const R = World.refs;
    const dot = function (x, z, col, r) { g.fillStyle = col; g.beginPath(); g.arc(X(x), Y(z), r, 0, Math.PI * 2); g.fill(); };
    if (R.tower) { g.fillStyle = "#8a6a3a"; g.fillRect(X((R.tower.x0 + R.tower.x1) / 2) - 5, Y((R.tower.z0 + R.tower.z1) / 2) - 5, 10, 10); }
    if (R.generator) dot(R.generator.x, R.generator.z, "#d9a441", 3);
    if (R.vehicle) { g.fillStyle = "#7f8f95"; g.fillRect(X(R.vehicle.x) - 6, Y(R.vehicle.z) - 3, 12, 6); }

    // ---- fog of war ----
    if (!UI._fog) { UI._fog = document.createElement("canvas"); UI._fog.width = W; UI._fog.height = H; }
    const f = UI._fog.getContext("2d");
    f.setTransform(1, 0, 0, 1, 0, 0);
    f.globalCompositeOperation = "source-over";
    f.fillStyle = "rgba(2,7,6,0.97)"; f.fillRect(0, 0, W, H);
    f.globalCompositeOperation = "destination-out";
    const hole = function (x, z, r) {
      const px = X(x), py = Y(z), rr = r * sc, gr = f.createRadialGradient(px, py, rr * 0.55, px, py, rr);
      gr.addColorStop(0, "rgba(0,0,0,1)"); gr.addColorStop(1, "rgba(0,0,0,0)");
      f.fillStyle = gr; f.beginPath(); f.arc(px, py, rr, 0, Math.PI * 2); f.fill();
    };
    S.visitedAreas.forEach(function (id) {
      for (let i = 0; i < World.areas.length; i++) {
        const a = World.areas[i]; if (a.id !== id) continue;
        hole(a.x, a.z, Math.max(a.w, a.d) * 0.5 + a.reveal * 0.55);
      }
    });
    S.explored.forEach(function (k) {
      const cx = Math.floor(k / 1000) - 50, cz = (k % 1000) - 50;
      hole(cx * 6 + 3, cz * 6 + 3, 9);
    });
    hole(Player.pos.x, Player.pos.z, 11);
    f.globalCompositeOperation = "source-over";
    g.drawImage(UI._fog, 0, 0);

    // area labels for places already seen
    g.font = "bold 11px sans-serif"; g.textAlign = "center"; g.fillStyle = "#b8e6da";
    S.visitedAreas.forEach(function (id) {
      for (let i = 0; i < World.areas.length; i++) {
        const a = World.areas[i]; if (a.id !== id || id === "yard") continue;
        g.fillText(a.name, X(a.x), Y(a.z) - (Math.max(a.d, 4) * 0.5) * sc - 5);
      }
    });

    // border + compass
    g.strokeStyle = "#355a50"; g.lineWidth = 2; g.strokeRect(X(B.minX), Y(B.minZ), (B.maxX - B.minX) * sc, (B.maxZ - B.minZ) * sc);
    g.fillStyle = "#7fe3d0"; g.font = "bold 14px sans-serif"; g.textAlign = "left"; g.fillText("N ↑", 10, 20);

    // objective marker (pulsing diamond, always drawn)
    const T = Game.objectiveTarget();
    if (T) {
      const px = X(T.x), py = Y(T.z), p = 0.5 + 0.5 * Math.sin(performance.now() / 280);
      g.strokeStyle = "rgba(255,215,106," + (0.35 + 0.4 * p) + ")"; g.lineWidth = 2;
      g.beginPath(); g.arc(px, py, 9 + 6 * p, 0, Math.PI * 2); g.stroke();
      g.fillStyle = "#ffd76a"; g.beginPath(); g.moveTo(px, py - 7); g.lineTo(px + 6, py); g.lineTo(px, py + 7); g.lineTo(px - 6, py); g.closePath(); g.fill();
      g.strokeStyle = "#3a2c00"; g.lineWidth = 1; g.stroke();
    }

    // player arrow (the Hollow is never shown)
    const ang = Math.atan2(-Math.cos(Player.yaw * Math.PI / 180), -Math.sin(Player.yaw * Math.PI / 180));
    g.save(); g.translate(X(Player.pos.x), Y(Player.pos.z)); g.rotate(ang);
    g.fillStyle = "#7fe3d0"; g.strokeStyle = "#04100d"; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(9, 0); g.lineTo(-6, 6); g.lineTo(-3, 0); g.lineTo(-6, -6); g.closePath(); g.fill(); g.stroke();
    g.restore();

    // legend
    g.font = "11px sans-serif"; g.textAlign = "right"; g.fillStyle = "#8fb3a7";
    g.fillText("◆ objective   ▶ you", W - 10, H - 10);
  },

  /* ================================================================= touch */
  _bindTouch() {
    const E = UI.el, I = Player.input;
    const base = E["joy-base"], knob = E["joy-knob"], canvas = E["game-canvas"];
    let joyId = null, lookId = null, lx = 0, ly = 0;

    const joyMove = function (e) {
      const r = base.getBoundingClientRect(), R = r.width / 2;
      let dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R);
      const d = Math.hypot(dx, dy), m = R * 0.9;
      if (d > m) { dx = dx / d * m; dy = dy / d * m; }
      knob.style.transform = "translate(" + dx + "px," + dy + "px)";
      let jx = dx / m, jz = -dy / m;
      if (Math.hypot(jx, jz) < 0.14) { jx = 0; jz = 0; }
      I.jx = jx; I.jz = jz;
    };
    const joyEnd = function () { joyId = null; I.jx = 0; I.jz = 0; knob.style.transform = "translate(0,0)"; };
    base.addEventListener("pointerdown", function (e) {
      if (joyId !== null) return;
      joyId = e.pointerId; try { base.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
      joyMove(e); e.preventDefault();
    });
    base.addEventListener("pointermove", function (e) { if (e.pointerId === joyId) { joyMove(e); e.preventDefault(); } });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(function (n) {
      base.addEventListener(n, function (e) { if (e.pointerId === joyId) joyEnd(); });
    });

    // look: drag anywhere on the canvas
    canvas.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "mouse" || lookId !== null || Main.state !== "play") return;
      lookId = e.pointerId; lx = e.clientX; ly = e.clientY;
      try { canvas.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
    });
    canvas.addEventListener("pointermove", function (e) {
      if (e.pointerId !== lookId) return;
      Player.lookDX += (e.clientX - lx) * 1.15; Player.lookDY += (e.clientY - ly) * 1.15;
      lx = e.clientX; ly = e.clientY;
      e.preventDefault();
    });
    ["pointerup", "pointercancel"].forEach(function (n) {
      canvas.addEventListener(n, function (e) { if (e.pointerId === lookId) lookId = null; });
    });

    // buttons
    const press = function (el, down, up) {
      el.addEventListener("pointerdown", function (e) { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } down(); });
      const end = function (e) { e.preventDefault(); if (up) up(); };
      el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
      el.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    };
    press(E["btn-interact"], function () { if (UI.anyModalOpen()) return; I.interactHeld = true; I.interactPressed = true; }, function () { I.interactHeld = false; });
    press(E["btn-flash"], function () { if (!UI.anyModalOpen()) I.flashPressed = true; });
    press(E["btn-run"], function () { I.run = !I.run; });
    press(E["btn-hide"], function () { I.crouch = !I.crouch; });
    press(E["btn-t-pause"], function () { Main.togglePause(); });
    press(E["btn-t-map"], function () { UI.toggleMap(); });
    press(E["btn-t-inv"], function () { UI.toggleInventory(); });
  }
};
