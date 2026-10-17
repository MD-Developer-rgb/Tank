"use strict";
/* ============================================================================
   THE LAST FIVE NIGHTS - main.js
   Boot sequence (PlayCanvas check + offline fallback, loading bar, world build,
   tap-to-start), the state manager (menu / play / end, pause) and the main loop.
   Created by MD Developer
   ============================================================================ */
const Main = {
  app: null,
  state: "boot",          // boot | menu | play | end
  paused: false,
  booted: false,
  fpsAdapt: { t: 0, n: 0, bad: 0 },

  /* ================================================================= boot */
  boot() {
    if (Main.booted) return;
    Main.booted = true;
    try {
      Settings.load();
      Audio.init();
      UI.init();
      Menu.init();
      Main.bindFullscreen();
    } catch (e) { console.error(e); Main.fatal("Interface failed to start: " + (e && e.message)); return; }

    window.addEventListener("error", function (ev) {
      if (Main.state === "boot") Main.fatal("An error stopped the game from loading: " + (ev && ev.message));
    });

    if (typeof pc !== "undefined") { Main.createApp(); return; }
    // CDN unreachable: try the offline copy in ./lib
    Main.setLoading(0.02, "Engine not found online - trying ./lib/playcanvas.min.js ...");
    const s = document.createElement("script");
    s.src = "lib/playcanvas.min.js";
    s.onload = function () { if (typeof pc !== "undefined") Main.createApp(); else Main.fatalNoEngine(); };
    s.onerror = function () { Main.fatalNoEngine(); };
    document.head.appendChild(s);
  },

  fatalNoEngine() {
    Main.fatal("The PlayCanvas engine could not be loaded from the internet (cdn.jsdelivr.net) or from lib/playcanvas.min.js.");
  },
  fatal(msg) {
    console.error("[FATAL] " + msg);
    document.getElementById("loading").classList.remove("show");
    document.getElementById("fatal-text").textContent = msg;
    document.getElementById("fatal").classList.add("show");
  },
  setLoading(f, text) {
    document.getElementById("loading-fill").style.width = Math.round(f * 100) + "%";
    if (text) document.getElementById("loading-text").textContent = text;
  },

  createApp() {
    let app;
    try {
      const canvas = document.getElementById("game-canvas");
      const touch = UI.isTouch;
      app = new pc.Application(canvas, {
        graphicsDeviceOptions: { antialias: !touch, alpha: false, preserveDrawingBuffer: false, powerPreference: "high-performance", depth: true, stencil: false }
      });
      app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
      app.setCanvasResolution(pc.RESOLUTION_AUTO);
      Main.app = app;
      Main.applyQuality();
      window.addEventListener("resize", function () { try { app.resizeCanvas(); } catch (e) { /* ignore */ } });
      app.start();
    } catch (e) {
      console.error(e);
      Main.fatal("Could not start the 3D engine (WebGL may be disabled or unsupported on this device). " + (e && e.message ? e.message : ""));
      return;
    }
    Main.setLoading(0.05, "Building the forest compound...");
    World.build(app, function (f, text) { Main.setLoading(0.05 + f * 0.9, text); }, function (err) {
      if (err) { Main.fatal("The world failed to build: " + (err && err.message ? err.message : err)); return; }
      try {
        Player.init(app);
        Hollow.init(app);
        Game.init();
        Hollow.root.enabled = false;
      } catch (e) { console.error(e); Main.fatal("Game setup failed: " + (e && e.message ? e.message : e)); return; }
      app.on("update", function (dt) { Main.tick(Math.min(dt, 0.05)); });
      Main.setLoading(1, "Ready");
      Main.state = "menu";
      Menu.applySettings();
      setTimeout(Main.showTapToStart, 250);
    });
  },

  /* ---- fullscreen (works with the standard and webkit APIs; falls back silently) ---- */
  isFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement); },
  setFullscreen(on) {
    const el = document.documentElement;
    try {
      if (on && !Main.isFullscreen()) {
        const p = (el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen);
        if (p) { const r = p.call(el); if (r && r.catch) r.catch(function () { /* ignore */ }); }
        try { if (UI.isTouch && screen.orientation && screen.orientation.lock) screen.orientation.lock("landscape").catch(function () { /* ignore */ }); } catch (x) { /* ignore */ }
      } else if (!on && Main.isFullscreen()) {
        const x = (document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen);
        if (x) { const r = x.call(document); if (r && r.catch) r.catch(function () { /* ignore */ }); }
      }
    } catch (e) { /* ignore */ }
  },
  toggleFullscreen() { Main.setFullscreen(!Main.isFullscreen()); },
  _fsChanged() {
    const on = Main.isFullscreen();
    document.body.classList.toggle("is-fs", on);
    const t = document.getElementById("s-fs"); if (t) { t.classList.toggle("on", on); t.textContent = on ? "ON" : "OFF"; }
    try { if (Main.app) Main.app.resizeCanvas(); } catch (e) { /* ignore */ }
  },
  bindFullscreen() {
    const b = document.getElementById("btn-fs");
    if (b) b.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); Main.toggleFullscreen(); b.blur(); });
    const t = document.getElementById("s-fs");
    if (t) t.addEventListener("click", function (e) { e.preventDefault(); Main.toggleFullscreen(); });
    document.addEventListener("fullscreenchange", Main._fsChanged);
    document.addEventListener("webkitfullscreenchange", Main._fsChanged);
    window.addEventListener("keydown", function (e) {
      if (e.code === "KeyU" && !e.ctrlKey && !e.altKey && !e.metaKey) { if (!document.querySelector(".modal.show")) { Main.toggleFullscreen(); e.preventDefault(); } }
    });
    Main._fsChanged();
  },

  /* canvas resolution scale from the graphics quality setting (live) */
  applyQuality() {
    if (!Main.app) return;
    const Q = CFG.QUALITY[Settings.get("quality")] || CFG.QUALITY.MEDIUM;
    try {
      Main.app.graphicsDevice.maxPixelRatio = Math.max(0.5, Math.min(window.devicePixelRatio || 1, 2) * Q.scale);
      Main.app.resizeCanvas();
    } catch (e) { /* ignore */ }
  },

  /* a tap is required before audio may play (browser autoplay policy) */
  showTapToStart() {
    document.getElementById("loading").classList.remove("show");
    const t = document.getElementById("tap-start");
    t.classList.add("show");
    const go = function (e) {
      window.removeEventListener("pointerdown", go, true);
      window.removeEventListener("keydown", go, true);
      t.classList.remove("show");
      Audio.unlock();
      if (UI.isTouch) {
        Main.setFullscreen(true);
      }
      Main.toHome();
      if (e && e.preventDefault && e.type === "keydown") e.preventDefault();
    };
    window.addEventListener("pointerdown", go, true);
    window.addEventListener("keydown", go, true);
  },

  /* ============================================================ state flow */
  toHome() {
    Main.state = "menu"; Main.paused = false;
    document.body.classList.remove("playing");
    Audio.duck(false);
    Audio.stopAmbient(); Audio.stopAll();
    try { Player.releaseLock(); Player.clearInput(); } catch (e) { /* ignore */ }
    if (Hollow.pos) { Hollow.stopFeedback(); Hollow.root.enabled = false; }
    Game.state = "none";
    UI.resetAll();
    Menu.show("home");
    Audio.play("menu_music", { loop: true, volume: 1 });
  },

  /* save: an existing save object (Continue) or a difficulty key (New Game) */
  startGame(save, diff) {
    if (Main.state === "play") return;
    Menu.hideAll();
    UI.fade(true, 0.01);
    Audio.stop("menu_music");
    setTimeout(function () {
      try {
        if (save) Game.loadGame(save); else { Game.newGame(diff); Game.save(); }
        Scare.reset(true); document.body.classList.remove("cine"); Cine.active = false;
        Main.state = "play"; Main.paused = false;
        document.body.classList.add("playing");
        Hollow.root.enabled = true;
        Game.begin();
        Audio.startAmbient();
        Audio.duck(false);
        if (!UI.isTouch) Player.requestLock();
        Player.menuT = 0;
        setTimeout(function () { UI.fade(false, 1.2); }, 150);
      } catch (e) {
        console.error(e);
        UI.fade(false, 0.2);
        Main.toHome();
        UI.toast("Could not start the game: " + (e && e.message));
      }
    }, 60);
  },

  /* ---- pause ---- */
  pause() {
    if (Main.state !== "play" || Main.paused || Game.state !== "playing") return;
    Main.paused = true;
    Player.releaseLock(); Player.clearInput();
    Audio.duck(true);
    Menu.show("pause");
  },
  resume() {
    if (!Main.paused) return;
    Main.paused = false;
    Menu.hideAll();
    Audio.duck(false);
    Player.clearInput();
    if (!UI.isTouch) Player.requestLock();
  },
  togglePause() {
    if (Main.state !== "play") return;
    if (Main.paused) {
      if (Menu.current === "settings") { Menu.back(); return; }   // Esc inside pause settings goes back one level
      if (Menu.confirmOpen) { Menu.back(); return; }
      Main.resume();
    } else Main.pause();
  },
  saveAndQuit() {
    if (Game.S && Game.state === "playing") Game.save();
    Main.toHome();
  },

  /* ---- endings (called by Game) ---- */
  showEnding(title, text, stats) {
    Main.state = "end"; Main.paused = false;
    document.body.classList.remove("playing");
    Player.releaseLock(); Player.clearInput();
    Menu.showEnding(title, text, stats);
  },
  showGameOver() {
    Main.state = "end"; Main.paused = false;
    document.body.classList.remove("playing");
    Player.releaseLock(); Player.clearInput();
    UI.fade(false, 0.4);
    Menu.showGameOver();
  },

  /* ================================================================== loop */
  tick(dt) {
    if (Main.state === "play") {
      if (Main.paused) { UI.update(dt, false); return; }
      const S = Game.S;
      if (S && Game.state !== "ending") S.playTimeSeconds += dt;
      Player.update(dt);
      if (Game.state === "playing") Hollow.update(dt);
      Cine.update(dt);
      Scare.update(dt);
      Game.update(dt);
      World.update(dt, Player.eyePos);
      Audio.update(dt);
      UI.update(dt, true);
      Main.watchFps(dt);
    } else if (Main.state === "menu" || Main.state === "end") {
      Player.menuCam(dt);
      World.update(dt, Player.eyePos);
      Audio.update(dt);
      UI.update(dt, false);
    }
  },

  /* on a slow device, lower the quality one step after sustained low FPS */
  watchFps(dt) {
    const A = Main.fpsAdapt;
    A.t += dt; A.n++;
    if (A.t < 4) return;
    const fps = A.n / A.t; A.t = 0; A.n = 0;
    if (fps < 22) A.bad++; else A.bad = 0;
    if (A.bad >= 2) {
      A.bad = 0;
      const q = Settings.get("quality");
      const next = q === "HIGH" ? "MEDIUM" : (q === "MEDIUM" ? "LOW" : null);
      if (next) { Settings.set("quality", next); UI.toast("Low frame rate - graphics set to " + next); }
    }
  }
};

window.addEventListener("load", function () { Main.boot(); });
