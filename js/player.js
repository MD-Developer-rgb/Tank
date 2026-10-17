"use strict";
/* ============================================================================
   THE LAST FIVE NIGHTS - player.js
   First-person controller (own simple movement, no physics engine):
   keyboard + mouse (pointer lock) + touch input, collisions, stamina, footsteps
   and noise, crouch/hide, flashlight + battery, interaction (press and hold),
   watchtower climbing, camera bob/shake.
   Created by MD Developer
   ============================================================================ */
const Player = {
  app: null, cam: null, flash: null, canvas: null,
  pos: null, eyePos: null, fwd: null, _tmp: null,
  yaw: 0, pitch: 0, lookDX: 0, lookDY: 0,
  input: { kx: 0, kz: 0, jx: 0, jz: 0, run: false, crouch: false, interactHeld: false, interactPressed: false, flashPressed: false },
  keys: {},
  stamina: 1, exhausted: false, flashOn: false, flickT: 0, flickOff: false,
  crouching: false, running: false, hidden: false, moving: false, speed: 0, building: null,
  inStream: false, elevated: false, anim: null,
  holdTarget: null, holdP: 0, holdNoiseT: 0, failed: null, target: null,
  _gy: 0, stepDist: 0, bobPhase: 0, bobBlend: 0, eyeCur: 1.65, shakeT: 0, shakeAmp: 0,
  hasLock: false, lockWanted: false, dragging: false, breathOn: false, foliageT: 0, menuT: 0,

  /* ---------------------------------------------------------------- init */
  init(app) {
    Player.app = app;
    Player.canvas = app.graphicsDevice.canvas;
    Player.pos = new pc.Vec3(); Player.eyePos = new pc.Vec3(); Player.fwd = new pc.Vec3(); Player._tmp = new pc.Vec3();
    const cam = new pc.Entity("camera");
    cam.addComponent("camera", { fov: 72, nearClip: 0.08, farClip: 130, clearColor: new pc.Color(0.03, 0.06, 0.07) });
    app.root.addChild(cam);
    Player.cam = cam;
    World.camera = cam;
    // flashlight: a spot light attached to the camera (lights shine along -Y, so rotate 90 about X to face forward)
    const fl = new pc.Entity("flashlight");
    fl.addComponent("light", {
      type: "spot", color: new pc.Color(1, 0.96, 0.82), intensity: CFG.FLASH.intensity, range: CFG.FLASH.range,
      innerConeAngle: CFG.FLASH.inner, outerConeAngle: CFG.FLASH.outer, castShadows: false, shadowResolution: 512
    });
    fl.setLocalPosition(0.12, -0.1, 0);
    fl.setLocalEulerAngles(90, 0, 0);
    fl.light.enabled = false;
    cam.addChild(fl);
    Player.flash = fl;
    try { const ck = Gfx.flashCookie(); if (ck) { fl.light.cookie = ck; fl.light.cookieIntensity = 1; } } catch (e) { console.warn("[Player] cookie skipped", e); }
    try { fl.light.normalOffsetBias = 0.05; fl.light.shadowBias = 0.2; } catch (e) { /* ignore */ }
    Player._buildViewmodel(cam);
    Audio.listener = Player.pos;
    Player.applyQuality();
    Player.bindInput();
  },

  /* held flashlight + gloved hand in the lower right of the view */
  _buildViewmodel(cam) {
    try {
      const vm = new pc.Entity("viewmodel");
      cam.addChild(vm);
      const metal = Gfx.mat({ tint: 0x30343a, metal: 0.85, gloss: 0.55, noNormal: true }), grip = Gfx.mat({ tint: 0x1b1c1e, gloss: 0.25, noNormal: true });
      const glove = Gfx.mat({ tint: 0x2a2520, gloss: 0.08, noNormal: true });
      const lens = new pc.StandardMaterial(); lens.diffuse = new pc.Color(0.2, 0.2, 0.2); lens.emissive = new pc.Color(0, 0, 0); lens.update();
      const t = new pc.Entity("fl_model"); vm.addChild(t); t.setLocalEulerAngles(0, 0, 0);
      World.ent(t, "cylinder", 0, 0, 0, 0.062, 0.24, 0.062, grip, { rx: 90, name: "fl_body" });
      for (let i = 0; i < 4; i++) World.ent(t, "cylinder", 0, 0, 0.07 - i * 0.045, 0.066, 0.012, 0.066, metal, { rx: 90 });   // grip rings
      World.ent(t, "cylinder", 0, 0, -0.15, 0.092, 0.075, 0.092, metal, { rx: 90, name: "fl_head" });
      World.ent(t, "cylinder", 0, 0, -0.192, 0.082, 0.006, 0.082, lens, { rx: 90, name: "fl_lens" });
      World.ent(t, "cylinder", 0, 0, 0.13, 0.05, 0.03, 0.05, metal, { rx: 90 });
      World.ent(t, "box", 0.0, 0.034, 0.02, 0.022, 0.012, 0.04, metal, { name: "fl_switch" });
      // gloved hand wrapped round the handle and a sleeve
      World.ent(t, "box", 0, -0.012, 0.05, 0.1, 0.08, 0.1, glove, { name: "hand" });
      World.ent(t, "box", 0.0, -0.03, 0.17, 0.095, 0.085, 0.18, glove, { rx: -8, name: "wrist" });
      World.ent(t, "box", 0.01, -0.06, 0.34, 0.12, 0.11, 0.26, Gfx.mat({ tint: 0x2c3329, noNormal: true, gloss: 0.05 }), { rx: -12, name: "sleeve" });
      vm.setLocalPosition(0.2, -0.2, -0.34);
      vm.setLocalEulerAngles(-4, 6, 0);
      Player.vm = vm; Player.vmLens = lens; Player._vmT = 0; Player._vmLag = { x: 0, y: 0 }; Player._vmYaw = 0; Player._vmPitch = 0;
      vm.enabled = false;
    } catch (e) { console.warn("[Player] viewmodel skipped", e); Player.vm = null; }
  },

  _updateViewmodel(dt, moved) {
    const vm = Player.vm; if (!vm) return;
    if ((typeof Cine !== "undefined" && Cine.active) || Game.state === "caught") { vm.enabled = false; return; }
    const has = !!(Game.S && Game.S.objectives && Game.S.objectives.hasFlashlight);
    const show = has && !Player.elevated || (has && Player.elevated);
    if (vm.enabled !== show) vm.enabled = show;
    if (!show) return;
    // lens glows while the light is on
    const on = Player.flashOn && Player.flash.light.enabled, e = on ? 1 : 0;
    Player._lensE = (Player._lensE || 0) + (e - (Player._lensE || 0)) * Math.min(1, dt * 18);
    const k = Player._lensE;
    Player.vmLens.emissive.set(1 * k, 0.95 * k, 0.75 * k); Player.vmLens.diffuse.set(0.2 + k * 0.8, 0.2 + k * 0.78, 0.2 + k * 0.6); Player.vmLens.update();
    // sway: lag behind camera turns, bob while walking
    const dyaw = Player.yaw - (Player._vmYaw || 0), dpitch = Player.pitch - (Player._vmPitch || 0);
    Player._vmYaw = Player.yaw; Player._vmPitch = Player.pitch;
    const L = Player._vmLag, wrap = ((dyaw + 540) % 360) - 180;
    L.x += (-Math.max(-6, Math.min(6, wrap)) * 0.0016 - L.x) * Math.min(1, dt * 7);
    L.y += (Math.max(-6, Math.min(6, dpitch)) * 0.0016 - L.y) * Math.min(1, dt * 7);
    Player._vmT += moved * 4.2;
    const bobAmt = Player.bobBlend * (Player.running ? 1.6 : 1), crouch = Player.crouching ? 0.03 : 0;
    vm.setLocalPosition(0.2 + L.x + Math.sin(Player._vmT) * 0.006 * bobAmt, -0.2 + L.y + Math.abs(Math.sin(Player._vmT)) * -0.008 * bobAmt - crouch, -0.34);
  },

  applyQuality() {
    const Q = CFG.QUALITY[Settings.get("quality")] || CFG.QUALITY.MEDIUM;
    if (Player.flash) Player.flash.light.castShadows = !!Q.shadows;
    if (Player.cam && Gfx.app && Player._postQ !== Settings.get("quality")) { Player._postQ = Settings.get("quality"); Gfx.applyPostQuality(Player.cam, Player._postQ); }
  },

  /* ------------------------------------------------------------- locking */
  isLocked() {
    return !!(UI.anyModalOpen() || Game.state !== "playing" || Player.anim || Main.paused || (Game.seq && Game.seq.lock));
  },
  requestLock() {
    if (UI.isTouch) return;
    try { const p = Player.canvas.requestPointerLock(); if (p && p.catch) p.catch(function () { /* ignore */ }); } catch (e) { /* ignore */ }
  },
  releaseLock() {
    Player.lockWanted = false;
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* ignore */ }
  },

  /* --------------------------------------------------------------- input */
  bindInput() {
    const K = Player.keys, I = Player.input;
    const down = function (e) {
      if (Main.state !== "play") return;
      const c = e.code;
      if (UI.anyModalOpen()) {
        if (c === "Escape" || c === "KeyM" || c === "KeyI" || c === "Tab") { e.preventDefault(); UI.closeTop(); }
        return;
      }
      if (["Tab", "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].indexOf(c) >= 0) e.preventDefault();
      if (e.repeat) return;
      K[c] = true;
      if (c === "KeyE") { I.interactHeld = true; I.interactPressed = true; }
      else if (c === "KeyF") I.flashPressed = true;
      else if (c === "KeyM") UI.toggleMap();
      else if (c === "Tab" || c === "KeyI") UI.toggleInventory();
      else if (c === "KeyO") UI.showObjective(true);
      else if (c === "KeyB") Player.useBattery(false);
      else if (c === "Escape" || c === "KeyP") Main.togglePause();
      Player.syncKeys();
    };
    const up = function (e) {
      K[e.code] = false;
      if (e.code === "KeyE") I.interactHeld = false;
      Player.syncKeys();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", function () { for (const k in K) K[k] = false; I.interactHeld = false; Player.syncKeys(); });

    window.addEventListener("mousemove", function (e) {
      if (Main.state !== "play") return;
      if (Player.hasLock || Player.dragging) { Player.lookDX += e.movementX || 0; Player.lookDY += e.movementY || 0; }
    });
    Player.canvas.addEventListener("mousedown", function (e) {
      if (Main.state !== "play" || UI.isTouch || Main.paused || UI.anyModalOpen()) return;
      if (e.button === 0) { Player.dragging = true; if (!Player.hasLock) Player.requestLock(); }
    });
    window.addEventListener("mouseup", function () { Player.dragging = false; });
    document.addEventListener("pointerlockchange", function () {
      const had = Player.hasLock;
      Player.hasLock = document.pointerLockElement === Player.canvas;
      if (Player.hasLock) Player.lockWanted = true;
      else if (had && Player.lockWanted && Main.state === "play" && !Main.paused && !UI.anyModalOpen() && Game.state === "playing") {
        Player.lockWanted = false;
        Main.pause();                 // losing pointer lock (Esc) opens the pause menu
      }
    });
  },
  syncKeys() {
    const K = Player.keys, I = Player.input;
    I.kx = ((K.KeyD || K.ArrowRight) ? 1 : 0) - ((K.KeyA || K.ArrowLeft) ? 1 : 0);
    I.kz = ((K.KeyW || K.ArrowUp) ? 1 : 0) - ((K.KeyS || K.ArrowDown) ? 1 : 0);
    if (!UI.isTouch) { I.run = !!(K.ShiftLeft || K.ShiftRight); I.crouch = !!(K.KeyC || K.ControlLeft); }
  },
  clearInput() {
    const I = Player.input;
    I.kx = I.kz = I.jx = I.jz = 0; I.run = I.crouch = I.interactHeld = I.interactPressed = I.flashPressed = false;
    for (const k in Player.keys) Player.keys[k] = false;
    Player.lookDX = Player.lookDY = 0;
  },

  /* -------------------------------------------------------------- placing */
  reset(x, z, yaw) {
    Player.teleport(x, z, yaw);
    Player.stamina = 1; Player.exhausted = false; Player.flashOn = false;
    Player.flash.light.enabled = false;
    Player.eyeCur = CFG.PLAYER.eye;
  },
  teleport(x, z, yawDeg) {
    Player.pos.set(x, 0, z);
    Player.yaw = yawDeg || 0; Player.pitch = 0;
    Player.elevated = false; Player.anim = null; Player.hidden = false;
    Player.cancelHold(true);
    Player.clearInput();
    Player.stepDist = 0;
  },

  /* ----------------------------------------------------------- flashlight */
  toggleFlash() {
    const S = Game.S;
    if (!S.objectives.hasFlashlight) { UI.toast("You have no flashlight yet."); return; }
    if (Player.flashOn) Player.flashOn = false;
    else {
      if (S.flashlightBattery <= 0 && !Player.useBattery(true)) { UI.toast("The flashlight battery is dead."); return; }
      Player.flashOn = true;
    }
    Audio.play("flashlight_click");
    Game.emitNoise(Player.pos, CFG.NOISE.flashlight, "click");
  },
  /* use a spare battery: +60% */
  useBattery(auto) {
    const S = Game.S;
    if (!S) return false;
    if (S.spareBatteries <= 0) { if (!auto) UI.toast("No spare batteries."); return false; }
    if (S.flashlightBattery >= 99.5 && !auto) { UI.toast("The battery is still full."); return false; }
    S.spareBatteries--;
    S.flashlightBattery = Math.min(100, S.flashlightBattery + CFG.FLASH.spareBoostPct);
    Audio.play("item_pickup");
    UI.toast(auto ? "Battery replaced automatically." : "Spare battery used.");
    UI.refreshInventory();
    return true;
  },

  /* ---------------------------------------------------------- interaction */
  cancelHold(done) {
    if (Player.holdTarget && !done && Player.holdTarget.onHoldCancel) { try { Player.holdTarget.onHoldCancel(); } catch (e) { console.error(e); } }
    Player.holdTarget = null; Player.holdP = 0;
    UI.holdProgress(null);
  },

  climb(up) {
    const T = World.refs.tower, P = Player.pos;
    Audio.play("ladder_climb");
    Game.emitNoise(P, CFG.NOISE.ladder, "ladder");
    Player.cancelHold(true);
    if (up) {
      Player.elevated = true;
      Player.anim = { t: 0, dur: 1.8, x0: P.x, y0: P.y, z0: P.z, x1: T.upPos.x, y1: T.y, z1: T.upPos.z, down: false };
    } else {
      Player.anim = { t: 0, dur: 1.5, x0: P.x, y0: P.y, z0: P.z, x1: T.downPos.x, y1: 0, z1: T.downPos.z, down: true };
    }
  },

  shake(amount, seconds) { Player.shakeAmp = amount; Player.shakeT = seconds; },

  /* ------------------------------------------------------------- per frame */
  update(dt) {
    const S = Game.S;
    if (!S) return;
    const I = Player.input, P = CFG.PLAYER, pos = Player.pos, diff = Game.diff();
    const locked = Player.isLocked();

    /* ---- look ---- */
    if (!locked) {
      const sens = CFG.SENS.min + (CFG.SENS.max - CFG.SENS.min) * (Settings.get("sens") / 100);
      Player.yaw -= Player.lookDX * sens;
      Player.pitch -= Player.lookDY * sens * (Settings.get("invertY") ? -1 : 1);
      Player.pitch = Math.max(-80, Math.min(80, Player.pitch));
    }
    Player.lookDX = Player.lookDY = 0;

    /* ---- ladder animation ---- */
    if (Player.anim) {
      const a = Player.anim; a.t += dt;
      const k = Math.min(1, a.t / a.dur), e = k * k * (3 - 2 * k);
      pos.set(a.x0 + (a.x1 - a.x0) * e, a.y0 + (a.y1 - a.y0) * e, a.z0 + (a.z1 - a.z0) * e);
      if (k >= 1) { if (a.down) Player.elevated = false; Player.anim = null; }
    }

    /* ---- movement ---- */
    let mx = 0, mz = 0, len = 0;
    if (!locked) { mx = I.kx + I.jx; mz = I.kz + I.jz; len = Math.sqrt(mx * mx + mz * mz); if (len > 1) { mx /= len; mz /= len; len = 1; } }
    const wantMove = len > 0.05;
    Player.crouching = !locked && !!I.crouch;
    const canRun = !Player.crouching && I.run && wantMove && Player.stamina > 0 && !Player.exhausted;
    Player.running = canRun;
    let sp = Player.crouching ? P.crouch : (canRun ? P.run : P.walk);
    if (Player.elevated) sp *= P.towerSpeed;
    if (Game.hasItem("beacon")) sp *= P.beaconSpeed;
    sp *= Math.max(0.35, len);

    // stamina
    if (canRun) {
      Player.stamina -= dt / P.staminaSeconds;
      if (Player.stamina <= 0) { Player.stamina = 0; Player.exhausted = true; }
    } else {
      Player.stamina = Math.min(1, Player.stamina + dt / P.staminaRegenSeconds);
      if (Player.exhausted && Player.stamina >= P.staminaResume) Player.exhausted = false;
    }

    let moved = 0;
    if (!Player.anim) {
      const sy = Math.sin(Player.yaw * Math.PI / 180), cy = Math.cos(Player.yaw * Math.PI / 180);
      const dx = (-sy * mz + cy * mx) * sp * dt, dz = (-cy * mz - sy * mx) * sp * dt;
      const t = Player._tmp; t.set(pos.x + dx, pos.y, pos.z + dz);
      if (Player.elevated) {
        const T = World.refs.tower;
        t.x = Math.max(T.x0, Math.min(T.x1, t.x)); t.z = Math.max(T.z0, Math.min(T.z1, t.z));
      } else World.collide(t, P.radius);
      moved = Math.hypot(t.x - pos.x, t.z - pos.z);
      pos.x = t.x; pos.z = t.z;
    }
    Player.moving = moved > 0.001;
    Player.speed += ((moved / Math.max(dt, 0.001)) - Player.speed) * Math.min(1, dt * 10);

    // hiding in a bush / wardrobe / crawlspace
    const zone = Player.elevated ? null : World.hideAt(pos.x, pos.z);
    Player.hidden = Player.crouching && !!zone && Player.speed < P.hideSpeedBreak;
    Player.building = Player.elevated ? null : World.buildingAt(pos.x, pos.z);

    // stream crossing
    const wasIn = Player.inStream;
    Player.inStream = !Player.elevated && World.inStream(pos.x, pos.z);
    if (Player.inStream && !wasIn) Game.onStreamEnter();

    /* ---- footsteps + noise ---- */
    if (moved > 0) {
      Player.stepDist += moved;
      const interval = Player.crouching ? P.stepCrouch : (Player.running ? P.stepRun : P.stepWalk);
      if (Player.stepDist >= interval) {
        Player.stepDist = 0;
        const g = World.groundType(pos.x, pos.z, Player.elevated);
        Audio.play("footstep_" + g, { volume: Player.running ? 0.9 : (Player.crouching ? 0.25 : 0.55), rate: 0.92 + Math.random() * 0.16 });
        let loud = Player.crouching ? CFG.NOISE.crouch : (Player.running ? CFG.NOISE.run : CFG.NOISE.walk);
        if (Player.inStream) loud = Math.max(loud, CFG.NOISE.water);
        Game.emitNoise(pos, loud, "step");
      }
      if (Player.running && zone && zone.bush) {   // running through bushes disturbs the foliage
        Player.foliageT -= dt;
        if (Player.foliageT <= 0) { Player.foliageT = 4; Game.addClue(pos, "foliage"); }
      }
    }
    if (Player.running && !Player.breathOn) { Player.breathOn = true; Audio.play("run_breath", { loop: true, volume: 0.5 }); }
    else if (!Player.running && Player.breathOn) { Player.breathOn = false; Audio.stop("run_breath"); }

    /* ---- flashlight ---- */
    if (I.flashPressed) { I.flashPressed = false; if (!locked) Player.toggleFlash(); }
    if (Player.flashOn) {
      S.flashlightBattery -= dt * 100 / diff.flashSeconds;
      if (S.flashlightBattery <= 0) {
        S.flashlightBattery = 0;
        if (S.spareBatteries > 0) Player.useBattery(true);
        else { Player.flashOn = false; UI.toast("The flashlight battery is empty."); }
      }
    }
    const light = Player.flash.light;
    light.enabled = Player.flashOn && !(typeof Scare !== "undefined" && Scare.dark > 0);
    if (Player.flashOn) {
      const low = CFG.FLASH.lowPct, b = S.flashlightBattery;
      let k = 1;
      if (b < low) {
        const f = b / low;
        k = 0.35 + 0.65 * f;
        Player.flickT -= dt;
        if (Player.flickT <= 0) { Player.flickT = 0.04 + Math.random() * 0.25; Player.flickOff = Math.random() < (0.15 + (1 - f) * 0.4); }
        if (Player.flickOff) k *= 0.12;
      }
      light.intensity = CFG.FLASH.intensity * k;
    }

    /* ---- interaction ---- */
    Player.updateInteraction(dt, locked);

    /* ---- camera ---- */
    const crouchEye = Player.crouching ? P.crouchEye : P.eye;
    Player.eyeCur += (crouchEye - Player.eyeCur) * Math.min(1, dt * 10);
    Player.bobBlend += ((Player.moving && !locked ? 1 : 0) - Player.bobBlend) * Math.min(1, dt * 8);
    Player.bobPhase += moved * 4.2;
    let bob = 0;
    if (P.headBob) bob = Math.sin(Player.bobPhase * 2) * P.bobAmount * Player.bobBlend * (Player.running ? 1.5 : 1);
    let sx = 0, sy2 = 0;
    if (Player.shakeT > 0) {
      Player.shakeT -= dt;
      const a = Player.shakeAmp * Math.min(1, Player.shakeT + 0.2);
      sx = (Math.random() - 0.5) * a; sy2 = (Math.random() - 0.5) * a;
    }
    Player._gy += ((Player.elevated ? 0 : World.groundY(pos.x, pos.z)) - Player._gy) * Math.min(1, dt * 12);
    Player.eyePos.set(pos.x + sx, pos.y + Player.eyeCur + bob + sy2 + Player._gy, pos.z);
    Player._updateViewmodel(dt, moved);
    Player.cam.setPosition(Player.eyePos.x, Player.eyePos.y, Player.eyePos.z);
    Player.cam.setEulerAngles(Player.pitch, Player.yaw, 0);
    const yr = Player.yaw * Math.PI / 180, pr = Player.pitch * Math.PI / 180, cp = Math.cos(pr);
    Player.fwd.set(-Math.sin(yr) * cp, Math.sin(pr), -Math.cos(yr) * cp);
  },

  updateInteraction(dt, locked) {
    const I = Player.input, eye = Player.eyePos, fwd = Player.fwd;
    let best = null, bs = -1e9;
    if (!locked) {
      const list = World.interactables;
      for (let i = 0; i < list.length; i++) {
        const it = list[i];
        if (!it.enabled) continue;
        const dx = it.pos.x - eye.x, dy = it.pos.y - eye.y, dz = it.pos.z - eye.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > it.range * it.range) continue;
        const d = Math.sqrt(d2) || 0.001;
        const dot = (dx * fwd.x + dy * fwd.y + dz * fwd.z) / d;
        if (dot < (it.minDot == null ? 0.3 : it.minDot) && d > 0.9) continue;
        const sc = dot * 2 - d * 0.25;
        if (sc > bs) { bs = sc; best = it; }
      }
    }
    let text = null;
    if (best) {
      text = typeof best.prompt === "function" ? best.prompt() : best.prompt;
      if (text === null || text === undefined) best = null;
    }
    Player.target = best;
    if (!best) {
      UI.setPrompt(null);
      if (Player.holdTarget) Player.cancelHold();
      I.interactPressed = false;
      if (!I.interactHeld) Player.failed = null;
      return;
    }
    UI.setPrompt((UI.isTouch ? "" : "[E] ") + text + (best.hold > 0 ? (UI.isTouch ? " (hold)" : " (hold E)") : ""));
    if (!I.interactHeld) Player.failed = null;

    if (best.hold > 0) {
      if (I.interactHeld) {
        if (Player.holdTarget !== best && Player.failed !== best) {
          Player.cancelHold();
          const msg = best.check ? best.check() : null;
          if (msg) { Player.failed = best; UI.toast(msg); }
          else { Player.holdTarget = best; Player.holdP = 0; Player.holdNoiseT = 0; if (best.onHoldStart) best.onHoldStart(); }
        }
        if (Player.holdTarget === best) {
          Player.holdP += dt / best.hold;
          if (best.holdNoise) {
            Player.holdNoiseT -= dt;
            if (Player.holdNoiseT <= 0) { Game.emitNoise(best.pos, best.holdNoise.loud, "hold"); Player.holdNoiseT = best.holdNoise.every; }
          }
          UI.holdProgress(Math.min(1, Player.holdP));
          if (Player.holdP >= 1) { const t = best; Player.cancelHold(true); t.onInteract(); }
        }
      } else if (Player.holdTarget) Player.cancelHold();
    } else {
      if (Player.holdTarget) Player.cancelHold();
      if (I.interactPressed) {
        const msg = best.check ? best.check() : null;
        if (msg) UI.toast(msg); else best.onInteract();
      }
    }
    I.interactPressed = false;
  },

  /* ------------------------------------------------- slow camera for menus */
  menuCam(dt) {
    Player.menuT += dt;
    const t = Player.menuT;
    Player.cam.setPosition(7 + Math.sin(t * 0.15) * 2.2, 2.3 + Math.sin(t * 0.21) * 0.25, 13 + Math.cos(t * 0.11) * 1.2);
    Player.cam.lookAt(0 + Math.sin(t * 0.09) * 1.5, 1.8, -2);
    Player.eyePos.set(7, 2.3, 13);
    Player.flash.light.enabled = false;
  }
};
