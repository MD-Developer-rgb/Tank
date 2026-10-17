"use strict";
/* ============================================================================
   THE LAST FIVE NIGHTS - menu.js
   Home, difficulty, settings (applied live), credits, pause, ending and game
   over screens, confirm popups, keyboard + mouse + touch navigation and the
   menu sounds.
   Created by MD Developer
   ============================================================================ */
const Menu = {
  current: null,              // name of the visible screen: home | difficulty | settings | credits | pause | ending | gameover | null
  settingsFrom: "home",       // where the Back button of the settings screen goes
  confirmCb: null, confirmNo: null, confirmOpen: false,
  screens: {}, el: {},

  init() {
    const $ = id => document.getElementById(id);
    ["home", "difficulty", "settings", "credits", "pause", "ending", "gameover"].forEach(function (n) { Menu.screens[n] = $("screen-" + n); });
    Menu.el.confirm = $("confirm"); Menu.el.confirmText = $("confirm-text");
    const click = (id, fn) => $(id).addEventListener("click", function (e) { e.preventDefault(); fn(); });

    /* ---- home ---- */
    click("btn-continue", function () {
      const s = Save.read();
      if (!s) { Menu.refreshHome(); return; }
      Main.startGame(s, null);
    });
    click("btn-new", function () {
      if (Save.exists()) Menu.confirm("Starting a new game will overwrite your saved game. Continue?", function () { Menu.show("difficulty"); });
      else Menu.show("difficulty");
    });
    click("btn-settings", function () { Menu.openSettings("home"); });
    click("btn-credits", function () { Menu.show("credits"); });

    /* ---- difficulty ---- */
    document.querySelectorAll("[data-diff]").forEach(function (b) {
      b.addEventListener("click", function (e) { e.preventDefault(); Main.startGame(null, b.getAttribute("data-diff")); });
    });
    click("btn-diff-back", function () { Menu.show("home"); });

    /* ---- settings / credits ---- */
    click("btn-settings-back", function () { Menu.back(); });
    click("btn-credits-back", function () { Menu.show("home"); });
    click("btn-reset-save", function () {
      Menu.confirm("Delete your saved game? This cannot be undone.", function () { Save.clear(); Menu.refreshHome(); UI.toast("Save deleted"); });
    });
    Menu._bindSettings();

    /* ---- pause ---- */
    click("btn-resume", function () { Main.resume(); });
    click("btn-pause-settings", function () { Menu.openSettings("pause"); });
    click("btn-quit", function () { Main.saveAndQuit(); });

    /* ---- ending / game over ---- */
    click("btn-ending-home", function () { Main.toHome(); });
    click("btn-gameover-home", function () { Main.toHome(); });

    /* ---- confirm ---- */
    click("confirm-yes", function () { Menu._confirmDone(true); });
    click("confirm-no", function () { Menu._confirmDone(false); });

    /* ---- menu sounds ---- */
    document.querySelectorAll("[data-nav], .toggle, .seg button").forEach(function (b) {
      b.addEventListener("mouseenter", function () { if (!b.disabled) Audio.play("ui_hover"); });
      b.addEventListener("click", function () { if (!b.disabled) Audio.play("ui_click"); });
    });

    Menu._bindKeys();
    Settings.onChange(function () { Menu.applySettings(); });
    Menu.applySettings();
  },

  /* ------------------------------------------------------------ show/hide */
  show(name) {
    Menu.current = name;
    for (const n in Menu.screens) Menu.screens[n].classList.toggle("show", n === name);
    if (name === "home") Menu.refreshHome();
    if (name === "settings") Menu.syncSettings();
    Menu._focusFirst();
  },
  hideAll() {
    Menu.current = null;
    for (const n in Menu.screens) Menu.screens[n].classList.remove("show");
    Menu.el.confirm.classList.remove("show"); Menu.confirmOpen = false;
  },
  refreshHome() {
    const s = Save.read(), b = document.getElementById("btn-continue");
    b.disabled = !s;
    document.getElementById("continue-info").textContent = s ? Save.summary(s) : "No saved game";
  },
  openSettings(from) { Menu.settingsFrom = from; Menu.show("settings"); },
  back() {
    if (Menu.confirmOpen) { Menu._confirmDone(false); return; }
    switch (Menu.current) {
      case "difficulty": case "credits": Menu.show("home"); break;
      case "settings": Menu.show(Menu.settingsFrom === "pause" ? "pause" : "home"); break;
      default: break;
    }
  },
  showEnding(title, text, stats) {
    document.getElementById("ending-title").textContent = title;
    document.getElementById("ending-text").textContent = text;
    const st = document.getElementById("ending-stats"); st.textContent = stats; st.style.whiteSpace = "pre-line";
    Menu.show("ending");
  },
  showGameOver() { Menu.show("gameover"); },

  /* -------------------------------------------------------------- confirm */
  confirm(text, yes, no) {
    Menu.confirmCb = yes || null; Menu.confirmNo = no || null; Menu.confirmOpen = true;
    Menu.el.confirmText.textContent = text;
    Menu.el.confirm.classList.add("show");
    const n = document.getElementById("confirm-no"); if (n) n.focus();
    Menu._setFocusClass(n);
  },
  _confirmDone(yes) {
    if (!Menu.confirmOpen) return;
    Menu.confirmOpen = false;
    Menu.el.confirm.classList.remove("show");
    const cb = yes ? Menu.confirmCb : Menu.confirmNo;
    Menu.confirmCb = Menu.confirmNo = null;
    if (cb) cb();
    Menu._focusFirst();
  },

  /* ------------------------------------------------------------- settings */
  _bindSettings() {
    const $ = id => document.getElementById(id);
    const range = function (id, key, fmt) {
      const el = $(id);
      el.addEventListener("input", function () { Settings.set(key, parseInt(el.value, 10)); });
    };
    range("s-music", "music"); range("s-sens", "sens"); range("s-sfx", "sfx"); range("s-bright", "brightness");
    // play a sample when the sfx slider is released so the volume can be judged
    $("s-sfx").addEventListener("change", function () { Audio.play("item_pickup"); });
    document.querySelectorAll("#s-quality button").forEach(function (b) {
      b.addEventListener("click", function () { Settings.set("quality", b.getAttribute("data-q")); });
    });
    const toggle = function (id, key) {
      $(id).addEventListener("click", function () { Settings.set(key, !Settings.get(key)); });
    };
    toggle("s-invert", "invertY"); toggle("s-fps", "showFps"); toggle("s-vib", "vibration");
    $("s-vib").addEventListener("click", function () { if (Settings.get("vibration")) UI.vibrate(60); });
  },

  /* reflect Settings.data in the controls */
  syncSettings() {
    const $ = id => document.getElementById(id), S = Settings;
    $("s-music").value = S.get("music"); $("v-music").textContent = S.get("music") + "%";
    $("s-sfx").value = S.get("sfx"); $("v-sfx").textContent = S.get("sfx") + "%";
    $("s-sens").value = S.get("sens"); $("v-sens").textContent = S.get("sens");
    $("s-bright").value = S.get("brightness"); $("v-bright").textContent = S.get("brightness") + "%";
    document.querySelectorAll("#s-quality button").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-q") === S.get("quality")); });
    const t = function (id, v) { const e = $(id); e.classList.toggle("on", !!v); e.textContent = v ? "ON" : "OFF"; };
    t("s-invert", S.get("invertY")); t("s-fps", S.get("showFps")); t("s-vib", S.get("vibration"));
  },

  /* push every setting into the running game (live) */
  applySettings() {
    Menu.syncSettings();
    Audio.setMusicVolume(Settings.get("music"));
    Audio.setSfxVolume(Settings.get("sfx"));
    if (typeof UI !== "undefined" && UI.el && UI.el["fx-brightness"]) { UI.setBrightness(Settings.get("brightness")); UI._applyFpsVisibility(); }
    if (World.built) World.setQuality(Settings.get("quality"));
    if (Player.flash) Player.applyQuality();
    if (typeof Main !== "undefined" && Main.applyQuality) Main.applyQuality();
  },

  /* ----------------------------------------------------- keyboard + focus */
  _items() {
    let root = Menu.confirmOpen ? Menu.el.confirm : (Menu.current ? Menu.screens[Menu.current] : null);
    if (!root) return [];
    const list = root.querySelectorAll("[data-nav], input[type=range], .toggle, .seg button");
    return Array.prototype.filter.call(list, function (e) { return !e.disabled && e.offsetParent !== null; });
  },
  _setFocusClass(el) {
    document.querySelectorAll(".menu-btn.focus").forEach(function (b) { b.classList.remove("focus"); });
    if (el && el.classList) el.classList.add("focus");
  },
  _focus(el) {
    if (!el) return;
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
    Menu._setFocusClass(el.classList && el.classList.contains("menu-btn") ? el : null);
    if (el.scrollIntoView) { try { el.scrollIntoView({ block: "nearest" }); } catch (e) { /* ignore */ } }
  },
  _focusFirst() {
    if (UI.isTouch) return;
    setTimeout(function () {
      const it = Menu._items();
      if (!it.length) return;
      Menu._focus(it[0]);
    }, 30);
  },
  _bindKeys() {
    window.addEventListener("keydown", function (e) {
      if (!Menu.current && !Menu.confirmOpen) return;
      if (Main.state === "play" && Menu.current === "pause" && !Menu.confirmOpen && e.code === "Escape") return;   // Main handles resume
      const items = Menu._items(); if (!items.length) return;
      const c = e.code;
      let i = items.indexOf(document.activeElement);
      const cur = items[i];
      const isRange = cur && cur.type === "range", isSeg = cur && cur.parentNode && cur.parentNode.id === "s-quality";
      if (c === "ArrowDown" || (c === "ArrowRight" && !isRange && !isSeg && !(cur && cur.classList.contains("toggle")) && Menu.current !== "settings")) {
        Menu._focus(items[(i + 1 + items.length) % items.length]); Audio.play("ui_hover"); e.preventDefault();
      } else if (c === "ArrowUp" || (c === "ArrowLeft" && !isRange && !isSeg && !(cur && cur.classList.contains("toggle")) && Menu.current !== "settings")) {
        Menu._focus(items[(i - 1 + items.length) % items.length]); Audio.play("ui_hover"); e.preventDefault();
      } else if (c === "ArrowLeft" || c === "ArrowRight") {
        const d = c === "ArrowRight" ? 1 : -1;
        if (isSeg) {
          const sib = Array.prototype.slice.call(cur.parentNode.children), k = sib.indexOf(cur) + d;
          if (sib[k]) { sib[k].click(); Menu._focus(sib[k]); }
          e.preventDefault();
        } else if (cur && cur.classList.contains("toggle")) { cur.click(); e.preventDefault(); }
        // range inputs adjust natively
      } else if (c === "Enter" || c === "NumpadEnter") {
        if (cur && !isRange) { cur.click(); e.preventDefault(); }
      } else if (c === "Escape") {
        Menu.back(); e.preventDefault();
      } else if (i < 0 && (c === "Tab")) {
        Menu._focus(items[0]); e.preventDefault();
      }
    });
    // clicking with the mouse keeps the highlight in sync
    document.addEventListener("mouseover", function (e) {
      const t = e.target;
      if (t && t.classList && t.classList.contains("menu-btn")) Menu._setFocusClass(t);
    });
  }
};
