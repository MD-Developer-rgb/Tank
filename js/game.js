"use strict";
/* ============================================================================
   THE LAST FIVE NIGHTS - game.js
   Game state, objectives and the 5 stages, every interactable in the world,
   noise events + clue markers + attractors, checkpoints, caught / respawn,
   both escape routes (road + beacon), the secret ending and the endings.
   Created by MD Developer
   ============================================================================ */
const Game = {
  S: null,                 // the save-able game state (see freshState)
  state: "none",           // none | playing | caught | ending
  clues: [], attractors: [], invuln: 0, seq: null, time: 0,
  hints: {}, cpDone: {}, hintQueue: [], genNoiseT: 0, beaconPulseT: 0, lastObjKey: "", registered: false,

  /* ======================================================== state helpers */
  diff() { return CFG.DIFF[Game.S ? Game.S.difficulty : "normal"]; },
  hearMul() { return Game.diff().hear * World.hearWeather() * Game.S.hollowAggression; },

  freshState(dk) {
    const D = CFG.DIFF[dk] || CFG.DIFF.normal;
    return {
      version: 1, difficulty: D.key, stage: 1, checkpoint: "cabin",
      objectives: {
        hasFlashlight: false, hasMap: false, hasRelay: false, hasFuel: false, generatorOn: false, lockerOpen: false, noteRead: false,
        hasDetector: false, hasFuse: false, hasConnector: false, radioFreqFound: false, radioTuned: false, hasCutter: false,
        wireCut: false, winchDone: false, gatePowered: false, hasBeaconBattery: false, beaconCharged: false, beaconCode: false, routeChosen: null,
        checklistRead: false, shedVisited: false, returnedToCabin: false, mapFragment: false, fuseInstalled: false, connectorInstalled: false,
        beaconInstalled: false, hasBeacon: false, beaconActive: false, binocularsUsed: false
      },
      inventory: [], flashlightBattery: 100, spareBatteries: 0, attemptsLeft: D.attempts,
      visitedAreas: ["cabin"], hollowAggression: 1.0, playTimeSeconds: 0, savedAt: null,
      picked: {}, notes: [], codes: { locker: "417", freq: 91.4, beacon: "1234" }, caughtCount: 0,
      charge: 0, rescueRemaining: 0, cabinetOpened: false, explored: []
    };
  },
  mergeDefaults(src) {
    const f = Game.freshState(src.difficulty);
    for (const k in f) if (src[k] === undefined) src[k] = f[k];
    for (const k in f.objectives) if (src.objectives[k] === undefined) src.objectives[k] = f.objectives[k];
    return src;
  },

  newGame(dk) {
    const S = Game.freshState(dk);
    const r = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    S.codes.locker = String(r(100, 999));
    S.codes.freq = CFG.FREQUENCIES[r(0, CFG.FREQUENCIES.length - 1)];
    S.codes.beacon = String(r(1000, 9999));
    Game.S = S;
  },
  loadGame(save) { Game.S = Game.mergeDefaults(save); },

  save() { if (Game.S) Save.write(Game.S); },
  checkpoint(name, silent) {
    Game.S.checkpoint = name;
    Game.save();
    if (!silent) UI.toast("Checkpoint saved");
  },

  /* ============================================================= begin */
  begin() {
    const S = Game.S;
    Game.state = "playing";
    Game.clues = []; Game.attractors = []; Game.invuln = 0; Game.seq = null; Game.time = 0;
    Game.hints = {}; Game.cpDone = {}; Game.hintQueue = []; Game.genNoiseT = 4; Game.beaconPulseT = 5; Game.lastObjKey = "";
    World.resetDynamic();
    Game.applyStateToWorld();
    const cp = World.checkpoints[S.checkpoint] || World.checkpoints.cabin;
    Player.reset(cp.x, cp.z, cp.yaw);
    Hollow.reset();
    UI.hudInit();
    Game.refreshStage(true);
    Game.refreshObjective(true);
    Game.refreshDoors();
    if (S.checkpoint === "cabin" && S.stage === 1 && !S.objectives.hasFlashlight) {
      Game.hintQueue.push({ t: 2.0, id: "move", text: UI.isTouch ? "Left stick: move. Drag the right side of the screen to look." : "WASD: move   Mouse: look   Shift: run (loud!)   C: crouch" });
    }
  },

  /* put dynamic world objects into the state described by the save */
  applyStateToWorld() {
    const S = Game.S, O = S.objectives, R = World.refs;
    for (const id in S.picked) World.setItemVisible(id, false);
    if (O.lockerOpen) { World.setLockerOpen(true); World.setItemVisible("relay", !S.picked.relay); }
    if (O.beaconCharged && !O.hasBeacon && !O.beaconActive) World.setItemVisible("beacon", true);
    if (O.generatorOn) {
      World.powerGrid(true); World.setLed(R.genLed, true);
      Audio.play("generator_loop", { loop: true, volume: 0 });
    }
    if (O.wireCut) R.wire.enabled = false;
    if (O.winchDone) { R.tree.moving = true; R.tree.anim = 1; R.tree.col.active = false; R.tree.entity.setPosition(75, 0.55, 53); R.tree.entity.setEulerAngles(90, 70, 0); }
    if (O.gatePowered) { World.setDoor(R.vgate, true, true); World.setLed(R.gateLed, true); }
    if (O.beaconActive) { R.beacon.entity.enabled = true; R.beacon.entity.light.enabled = true; R.beacon.active = true; }
    // map knowledge
    if (O.mapFragment) Game.revealAreas(["clearing", "service_road"]);
  },
  refreshDoors() {
    World.doors.forEach(function (d) { if (d.led) World.setLed(d.led, !(d.locked && d.locked())); });
  },
  revealAreas(ids) {
    const v = Game.S.visitedAreas;
    ids.forEach(function (id) { if (v.indexOf(id) < 0) v.push(id); });
  },

  /* ============================================================ inventory */
  hasItem(id) { return !!Game.S && Game.S.inventory.indexOf(id) >= 0; },
  carryCount() {
    const carry = ["relay", "fuelcan", "fuse", "connector", "cutter", "beaconbattery", "beacon"];
    return Game.S.inventory.filter(i => carry.indexOf(i) >= 0).length;
  },
  addItem(id) { if (!Game.hasItem(id)) Game.S.inventory.push(id); },
  removeItem(id) { const i = Game.S.inventory.indexOf(id); if (i >= 0) Game.S.inventory.splice(i, 1); },

  ITEMS: {
    flashlight: { name: "Flashlight", kind: "tool", flag: "hasFlashlight" },
    map: { name: "Compound Map", kind: "tool", flag: "hasMap" },
    detector: { name: "Motion Detector", kind: "tool", flag: "hasDetector" },
    relay: { name: "Starter Relay", kind: "carry", flag: "hasRelay" },
    fuel: { name: "Fuel Can", kind: "carry", flag: "hasFuel", inv: "fuelcan" },
    fuse: { name: "Transmitter Fuse", kind: "carry", flag: "hasFuse" },
    connector: { name: "Antenna Connector", kind: "carry", flag: "hasConnector", cp: "watchtower" },
    cutter: { name: "Cutting Tool", kind: "carry", flag: "hasCutter" },
    beaconbat: { name: "Beacon Battery", kind: "carry", flag: "hasBeaconBattery", inv: "beaconbattery", cp: "watchtower" },
    beacon: { name: "Emergency Beacon", kind: "carry", flag: "hasBeacon" }
  },

  takeItem(id) {
    const S = Game.S, def = Game.ITEMS[id], O = S.objectives;
    if (!def) return false;
    if (def.kind === "carry" && Game.carryCount() >= CFG.PLAYER.maxCarry) { UI.toast("Inventory full"); return false; }
    Game.addItem(def.inv || id);
    S.picked[id] = true;
    World.setItemVisible(id, false);
    O[def.flag] = true;
    Audio.play("item_pickup");
    Game.emitNoise(World.items[id].pos, CFG.NOISE.pickup, "pickup");
    UI.toast("Picked up: " + def.name);
    if (id === "flashlight") Game.hint("flash", UI.isTouch ? "Tap LIGHT to toggle the flashlight. The battery is limited." : "Press F to toggle the flashlight. The battery is limited.");
    if (id === "map") Game.hint("map", UI.isTouch ? "Tap MAP to open the compound map." : "Press M to open the compound map.");
    if (id === "detector") {
      Game.addAggression();
      Game.checkpoint("research_hut");
      Game.hint("det", "The detector pulses when something large moves nearby. It never shows a direction.");
    }
    if (def.cp) Game.checkpoint(def.cp);
    if (id === "beacon") { O.beaconCharged = true; }
    Game.afterChange();
    return true;
  },
  takeBattery(id) {
    const S = Game.S;
    S.spareBatteries = Math.min(6, S.spareBatteries + 1);
    S.picked[id] = true;
    World.setItemVisible(id, false);
    Audio.play("item_pickup");
    UI.toast("Picked up: Spare Battery");
    Game.afterChange();
  },
  addAggression() { Game.S.hollowAggression = Math.round((Game.S.hollowAggression + CFG.HOLLOW.aggrPerObjective) * 100) / 100; },

  /* ============================================================= notes */
  NOTES: {
    checklist: { title: "EQUIPMENT CHECKLIST", text: () =>
      "MAINTENANCE CABIN - DEPARTURE CHECKLIST\n\n[ ] Generator ........ needs fuel + starter relay\n[ ] Fuel can ......... tool shelter, service road\n[ ] Starter relay .... research hut locker\n[ ] Radio ............ fuse, antenna, tuning\n[ ] Emergency beacon . battery, charge, code\n[ ] Cutting tool ..... equipment shelter\n\nKeep the gate closed at night.\nIt listens. It does not see well in the rain." },
    maint: { title: "MAINTENANCE NOTE", text: () =>
      "To whoever relieves me:\n\nI keep forgetting the locker code at the research hut, so I'm writing it here where nobody will look.\n\n        LOCKER CODE:   " + Game.S.codes.locker.split("").join("  ") + "\n\nThe relay is inside. Do NOT start the generator after dark unless you have a plan - the noise carries for a long way." },
    radio: { title: "OPERATOR'S LOG", text: () =>
      "Radio operator's notes\n\nEmergency channel: " + Game.S.codes.freq.toFixed(1) + " MHz\n\nThe transmitter needs its fuse replaced (research hut shelf) and the antenna connector from the tower cabinet.\n\nTune slowly. The static fades as you get close." },
    clue1: { title: "FIELD NOTE 1 - THE PATHS", text: () =>
      "It follows the narrow forest paths. Every sighting so far was on a trail or within a few metres of one.\n\nIt walks. It does not run until it has seen you." },
    clue2: { title: "FIELD NOTE 2 - WATER & RAIN", text: () =>
      "Heavy rain muffles sound - and its memory of where you were. Water breaks the trail completely: it loses you at the stream's edge and searches there.\n\nBushes only hide you if you keep still and crouch." },
    clue3: { title: "FIELD NOTE 3 - LIGHT", text: () =>
      "Bright lights draw it in like a moth. A work light switched on at one end of the compound will pull it that way for a while.\n\nBut stand in that light yourself and it will see you from twice as far." },
    beacon_code: { title: "TERMINAL - BEACON CODE", text: () =>
      "RADIO STATION TERMINAL\n\nEMERGENCY BEACON ACTIVATION CODE:\n\n        " + Game.S.codes.beacon.split("").join("   ") + "\n\nEnter it at the beacon in the marked clearing." }
  },
  readNote(id) {
    const S = Game.S, O = S.objectives, n = Game.NOTES[id];
    if (!n) return;
    Audio.play("paper_read");
    if (S.notes.indexOf(id) < 0) S.notes.push(id);
    if (id === "checklist") O.checklistRead = true;
    if (id === "maint") O.noteRead = true;
    if (id === "radio") O.radioFreqFound = true;
    if (id === "beacon_code") O.beaconCode = true;
    UI.showNote(n.title, n.text());
    Game.afterChange();
  },

  /* ===================================================== stages/objectives */
  computeStage() {
    const O = Game.S.objectives;
    if (!O.returnedToCabin) return 1;
    if (!O.generatorOn) return 2;
    if (!O.hasDetector) return 3;
    if (!O.routeChosen) return 4;
    return 5;
  },
  refreshStage(silent) {
    const ns = Game.computeStage();
    if (ns !== Game.S.stage) {
      Game.S.stage = ns;
      if (!silent) { UI.toast("New objective"); }
      if (ns === 2) Game.hint("sprint", "Running is loud and noise attracts the Hollow. Rain muffles sound. Walk when you can.");
      Game.lastObjKey = "";
    }
  },
  afterChange() {
    Game.refreshStage(false);
    Game.refreshObjective(false);
    UI.refreshInventory();
  },

  objectiveData() {
    const S = Game.S, O = S.objectives, st = S.stage, lines = [];
    const L = (t, d) => lines.push({ t: t, done: !!d });
    let title = "";
    if (st === 1) {
      title = !O.hasFlashlight ? "Find a light." : !O.hasMap ? "Find the compound map." : !O.checklistRead ? "Read the equipment checklist." : !O.shedVisited ? "Find the generator shed." : "Return to the cabin.";
      L("Flashlight", O.hasFlashlight); L("Compound map", O.hasMap); L("Equipment checklist by the door", O.checklistRead);
      L("Find the generator shed", O.shedVisited); L("Return to the cabin", O.returnedToCabin);
    } else if (st === 2) {
      title = "Restore power.";
      L(O.lockerOpen || O.hasRelay ? "Starter relay" : "Find the starter relay (locked locker near the research hut)", O.hasRelay || O.generatorOn);
      L("Find fuel", O.hasFuel || O.generatorOn);
      L("Start the generator", O.generatorOn);
    } else if (st === 3) {
      title = "Understand the hunter.";
      const n = ["clue1", "clue2", "clue3"].filter(c => S.notes.indexOf(c) >= 0).length;
      L("Open the research hut (needs power)", O.hasDetector);
      L("Take the motion detector", O.hasDetector);
      L("Read the field notes (" + n + "/3)", n >= 3);
      L("Reach the radio station without being caught", false);
    } else if (st === 4) {
      title = O.radioTuned ? "Choose how to escape." : "Repair the emergency radio.";
      L("Transmitter fuse (research hut)", O.hasFuse || O.fuseInstalled);
      L("Antenna connector (watchtower cabinet)", O.hasConnector || O.connectorInstalled);
      L("Frequency (operator's notes at the radio station)", O.radioFreqFound);
      L("Install the parts and tune the radio", O.radioTuned);
    } else {
      if (O.routeChosen === "B") {
        title = "Activate the emergency beacon.";
        L("Beacon battery (watchtower)", O.hasBeaconBattery || O.beaconInstalled || O.beaconCharged);
        L("Charge it at the generator", O.beaconCharged);
        L("Beacon code (radio station terminal)", O.beaconCode);
        L("Carry the beacon to the marked clearing", O.hasBeacon || O.beaconActive);
        L("Survive until rescue arrives", false);
      } else {
        title = "Clear the service road.";
        L("Cutting tool (equipment shelter)", O.hasCutter || O.wireCut);
        L("Cut the wire on the fallen tree", O.wireCut);
        L("Use the winch to move the tree", O.winchDone);
        L("Restore power to the vehicle gate", O.gatePowered);
        L("Reach the vehicle and drive out", false);
      }
      L("(The other route is still possible)", false);
    }
    return { title: title, lines: lines };
  },
  /* where the map marker goes */
  objectiveTarget() {
    const S = Game.S, O = S.objectives, st = S.stage;
    if (st === 1) return (!O.hasFlashlight || !O.hasMap || !O.checklistRead) ? { x: 0, z: 0 } : (!O.shedVisited ? { x: -25, z: -17 } : { x: 0, z: 0 });
    if (st === 2) {
      if (!O.hasRelay) return O.lockerOpen || O.noteRead ? { x: 36, z: -30 } : { x: -40, z: -50 };
      if (!O.hasFuel) return { x: 55, z: 35 };
      return { x: -25, z: -17 };
    }
    if (st === 3) return { x: 30, z: -30 };
    if (st === 4) {
      if (!O.hasFuse && !O.fuseInstalled) return { x: 30, z: -30 };
      if (!O.hasConnector && !O.connectorInstalled) return { x: -40, z: -50 };
      return { x: 45, z: 10 };
    }
    if (O.routeChosen === "B") {
      if (!O.hasBeaconBattery && !O.beaconInstalled && !O.beaconCharged) return { x: -40, z: -50 };
      if (!O.beaconCharged) return { x: -25, z: -17 };
      if (!O.beaconCode) return { x: 45, z: 10 };
      return { x: -55, z: 20 };
    }
    if (!O.hasCutter && !O.wireCut) return { x: 50, z: 28 };
    if (!O.wireCut) return { x: 75, z: 40 };
    if (!O.winchDone) return { x: 73.5, z: 36.4 };
    if (!O.gatePowered) return { x: 84, z: 37 };
    return { x: 66, z: 42 };
  },
  refreshObjective(flash) {
    const d = Game.objectiveData(), key = d.title + "|" + d.lines.map(l => (l.done ? "1" : "0")).join("");
    if (key !== Game.lastObjKey) { Game.lastObjKey = key; UI.setObjective(d, flash !== false); }
    else if (flash) UI.setObjective(d, true);
  },

  hint(id, text) {
    if (Game.hints[id]) return;
    Game.hints[id] = true;
    UI.hint(text);
  },

  /* ================================================= noise, clues, lights */
  emitNoise(pos, loud, type) {
    if (Game.state !== "playing" || !pos) return;
    Hollow.hear(pos, loud, type || "noise");
  },
  addClue(pos, type) {
    Game.clues.push({ x: pos.x, z: pos.z, t: Game.time, type: type, checked: false });
    if (Game.clues.length > 40) Game.clues.shift();
  },
  freshestClue(x, z, maxD) {
    let best = null;
    for (let i = 0; i < Game.clues.length; i++) {
      const c = Game.clues[i];
      if (c.checked) continue;
      if (Math.hypot(c.x - x, c.z - z) > maxD) continue;
      if (!best || c.t > best.t) best = c;
    }
    return best;
  },
  onStreamEnter() {
    if (Hollow.state === "PURSUE") Game.hint("stream", "Water breaks a pursuer's trail. Keep moving.");
  },

  /* ============================================================ per frame */
  update(dt) {
    if (Game.state !== "playing") return;
    const S = Game.S, O = S.objectives, P = Player.pos;
    Game.time += dt;
    if (Game.invuln > 0) Game.invuln -= dt;

    // queued tutorial hints
    for (let i = Game.hintQueue.length - 1; i >= 0; i--) {
      Game.hintQueue[i].t -= dt;
      if (Game.hintQueue[i].t <= 0) { const h = Game.hintQueue.splice(i, 1)[0]; Game.hint(h.id, h.text); }
    }
    if (Player.target && !Game.hints.interact) Game.hint("interact", UI.isTouch ? "Tap the E button to interact. Hold it for longer actions." : "Press E to interact. Hold E for longer actions.");

    // visited areas (also drives the map's fog of war)
    for (let i = 0; i < World.areas.length; i++) {
      const a = World.areas[i];
      if (S.visitedAreas.indexOf(a.id) < 0 && Math.hypot(P.x - a.x, P.z - a.z) < a.reveal) S.visitedAreas.push(a.id);
    }

    // stage 1 -> 2: back inside the cabin after seeing the shed
    if (!O.returnedToCabin && O.shedVisited && Player.building && Player.building.id === "cabin") {
      O.returnedToCabin = true;
      Game.checkpoint("cabin");
      Game.afterChange();
    }
    // checkpoints on arrival
    if (!Game.cpDone.road && S.stage >= 4 && Math.hypot(P.x - 75, P.z - 42) < 14) { Game.cpDone.road = true; Game.checkpoint("service_road"); }
    if (!Game.cpDone.clear && O.hasBeacon && Math.hypot(P.x + 55, P.z - 20) < 8) { Game.cpDone.clear = true; Game.checkpoint("clearing"); }

    // generator: constant machinery noise + positional loop
    if (O.generatorOn) {
      Game.genNoiseT -= dt;
      if (Game.genNoiseT <= 0) { Game.genNoiseT = 6; Game.emitNoise(World.refs.generator, CFG.NOISE.generatorLoop, "generator"); }
      const d = Math.hypot(P.x - World.refs.generator.x, P.z - World.refs.generator.z);
      Audio.setVolume("generator_loop", Math.pow(Math.max(0, 1 - d / 45), 1.5) * 0.8);
    }

    // work lights + attractors + old clues
    World.refs.work.forEach(function (w) {
      if (w.lamp.on) { w.timer -= dt; if (w.timer <= 0) World.setLamp(w.lamp, false); }
    });
    for (let i = Game.attractors.length - 1; i >= 0; i--) if (Game.attractors[i].until < Game.time) Game.attractors.splice(i, 1);
    for (let i = Game.clues.length - 1; i >= 0; i--) if (Game.time - Game.clues[i].t > 150) Game.clues.splice(i, 1);

    // beacon charging at the generator (30 s, you must stay close)
    if (O.beaconInstalled && !O.beaconCharged) {
      const near = Math.hypot(P.x - World.refs.generator.x, P.z - World.refs.generator.z) < 9;
      if (near) {
        S.charge += dt / 30;
        if (S.charge >= 1) {
          S.charge = 1; O.beaconCharged = true; O.beaconInstalled = false;
          World.setItemVisible("beacon", true);
          Audio.play("power_on");
          UI.toast("The beacon is charged. Take it from the dock.");
          UI.setCharge(null);
          Game.afterChange();
        } else UI.setCharge("Beacon charging: " + Math.floor(S.charge * 100) + "%");
      } else UI.setCharge("Charging paused - stay near the generator (" + Math.floor(S.charge * 100) + "%)");
    } else UI.setCharge(null);

    // active beacon: pulses (noise + light) and the rescue countdown
    if (O.beaconActive) {
      S.rescueRemaining -= dt;
      Game.beaconPulseT -= dt;
      if (Game.beaconPulseT <= 0) {
        Game.beaconPulseT = 10;
        Game.emitNoise(World.refs.pad, CFG.NOISE.beaconPulse, "beacon");
        Audio.playAt("beacon_pulse", World.refs.pad, { maxDist: 80 });
      }
      UI.setRescue(Math.max(0, S.rescueRemaining));
      if (S.rescueRemaining <= 0) { Cine.rescue(); return; }
    }

    // interactables whose behaviour changes with state
    const gi = World.refs.genInter;
    if (gi) gi.hold = (O.generatorOn || !(Game.hasItem("relay") && Game.hasItem("fuelcan") && O.shedVisited)) ? 0 : 4;

    Game.updateSeq(dt);
    UI.setBars(S.flashlightBattery, Player.stamina, S.spareBatteries, Player.exhausted);
    Game.refreshObjective(false);
  },

  /* ============================================================ caught */
  caught() {
    if (Game.state !== "playing") return;
    const S = Game.S, R = World.refs;
    Game.state = "caught";
    Player.cancelHold(true);
    UI.closeAll();
    if (Game.seq) {     // a drive/countdown was running
      Game.seq = null; UI.centerText(null);
      R.vehicle.entity.setPosition(66, 0, 42); R.vehicle.col.active = true;
    }
    Audio.setChase(false);
    Audio.play("caught_sting");
    if (Settings.get("vibration") && navigator.vibrate) { try { navigator.vibrate([200, 80, 300]); } catch (e) { /* ignore */ } }
    Scare.caught();
    S.caughtCount++;
    if (S.attemptsLeft !== null && S.attemptsLeft !== undefined) S.attemptsLeft--;
    setTimeout(function () { if (Game.state === "caught") UI.fade(true, 0.45); }, 1250);
    setTimeout(function () { UI.centerText("IT FOUND YOU", 1400); }, 1750);
    setTimeout(function () {
      if (Game.state !== "caught") return;
      if (S.attemptsLeft !== null && S.attemptsLeft !== undefined && S.attemptsLeft <= 0) { Game.over(); return; }
      Game.respawn();
    }, 3300);
  },
  respawn() {
    const S = Game.S, cp = World.checkpoints[S.checkpoint] || World.checkpoints.cabin;
    Player.teleport(cp.x, cp.z, cp.yaw);
    Player.stamina = 1; Player.exhausted = false;
    Hollow.stopFeedback();
    Scare.reset(false); UI.fade(false, 0.8);
    Hollow.relocate(cp, CFG.HOLLOW.catchRespawnDist, false);
    Game.invuln = CFG.PLAYER.invulnSeconds;
    Game.clues = []; Game.attractors = [];
    if (S.beaconActive) {            // the beacon keeps running; the countdown is set back
      const total = Game.diff().beaconTime;
      S.rescueRemaining = Game.diff().key === "hard" ? total : Math.max(S.rescueRemaining, total * 0.5);
    }
    Game.state = "playing";
    UI.fade(false, 0.8);
    UI.centerText(null);
    if (S.attemptsLeft !== null && S.attemptsLeft !== undefined) UI.toast("Attempts left: " + S.attemptsLeft);
    Game.save();
    Game.refreshObjective(true);
  },
  over() {
    Game.state = "ending";
    Save.clear();
    UI.centerText(null);
    Hollow.stopFeedback();
    Audio.stopAll();
    Main.showGameOver();
  },

  /* ============================================================ endings */
  ending(kind) {
    if (Game.state === "ending") return;
    Game.state = "ending";
    Game.seq = null;
    const S = Game.S;
    Player.cancelHold(true);
    Hollow.stopFeedback();
    Audio.stopAll(); Audio.stopAmbient();
    Audio.play("win_sting");
    Save.clear();
    UI.closeAll();
    UI.centerText(null);
    const t = Math.floor(S.playTimeSeconds), mm = Math.floor(t / 60), ss = t % 60;
    const stats = "Time: " + mm + "m " + (ss < 10 ? "0" : "") + ss + "s\nTimes caught: " + S.caughtCount + "\nDifficulty: " + Game.diff().label;
    const E = {
      A: ["ENDING A - ROAD OUT", "The road falls behind you. The forest keeps whatever it didn't take."],
      B: ["ENDING B - EXTRACTION", "Lights cut through the trees. You made it until dawn."],
      C: ["SECRET ENDING - THE OBSERVERS", "Every screen shows the same tall shape between the trees. The compound was never a refuge. It was a hide. The signal you sent didn't call for rescue - it called for company."]
    }[kind];
    UI.fade(false, 0.4);
    Main.showEnding(E[0], E[1], stats);
  },

  /* ----- drive-out sequence (route A) ----- */
  startDrive() {
    const R = World.refs;
    Game.seq = { type: "drive", t: 0, lock: true, count: 4, driving: false, x0: R.vehicle.x };
    Audio.play("vehicle_engine");
    Game.emitNoise(R.vehicle.pos, CFG.NOISE.vehicle, "vehicle");
    Game.addClue(R.vehicle.pos, "vehicle");
    Player.cancelHold(true);
    Player.shake(0.02, 3);
    UI.toast("Starting the engine...");
  },
  updateSeq(dt) {
    const q = Game.seq;
    if (!q) return;
    q.t += dt;
    const R = World.refs, veh = R.vehicle;
    if (q.type !== "drive") return;
    if (!q.driving) {
      const c = Math.max(1, Math.ceil(3 - q.t));
      if (c !== q.count && q.t < 3) { q.count = c; UI.centerText(String(c), 700, true); }
      if (q.t >= 3) { UI.centerText(null); Game.seq = null; Cine.driveOut(); return; }
    } else {
      const k = Math.min(1, (q.t - q.t0) / 3.6), e = k * k * (3 - 2 * k);
      const x = veh.x + 24 * e;
      veh.entity.setPosition(x, 0, veh.z);
      Player.pos.set(x - 0.7, 0, veh.z - 0.45);
      Player.yaw = -90 + Math.sin(q.t * 3) * 1.5;
      if (!q.fading && k > 0.78) { q.fading = true; UI.fade(true, 1.2); }
      if (k >= 1 && !q.done) { q.done = true; setTimeout(function () { Game.ending("A"); }, 900); }
    }
  },

  /* ----- beacon activation (route B) ----- */
  activateBeacon() {
    const S = Game.S, O = S.objectives, R = World.refs;
    Game.removeItem("beacon");
    O.hasBeacon = false; O.beaconActive = true;
    S.rescueRemaining = Game.diff().beaconTime;
    Game.beaconPulseT = 3;
    R.beacon.entity.enabled = true; R.beacon.entity.light.enabled = true; R.beacon.active = true;
    Audio.play("beacon_activate");
    Game.emitNoise(R.pad, CFG.NOISE.beaconPulse, "beacon");
    Game.addClue(R.pad, "beacon");
    Game.checkpoint("clearing");
    UI.toast("Beacon active. Survive until the rescue arrives!");
    Game.afterChange();
  },

  /* ============================================== interactable definitions */
  init() {
    if (Game.registered) return;
    Game.registered = true;
    Game.registerInteractables();
  },

  registerInteractables() {
    const R = World.refs, V = (x, y, z) => new pc.Vec3(x, y, z);
    const I = World.addInteractable, S = () => Game.S, O = () => Game.S.objectives;
    const vis = id => World.items[id].entity.enabled;

    /* ---- doors + gate (the vehicle gate is powered, not opened by hand) ---- */
    World.doors.forEach(function (d) {
      if (d.kind === "vgate") return;
      const isGate = d.kind === "gate";
      if (d.id === "hut" || d.id === "radio" || d.id === "obs") d.locked = function () { return O().generatorOn ? null : "The electronic lock has no power."; };
      I({
        id: "door_" + d.id, pos: d.pos, range: 2.3, minDot: 0.1,
        prompt: function () { return d.target ? (isGate ? "Close gate" : "Close door") : (isGate ? "Open gate" : "Open door"); },
        check: function () { return !d.target && d.locked ? d.locked() : null; },
        onInteract: function () {
          const open = !d.target;
          World.setDoor(d, open);
          if (isGate) Audio.play("gate_creak"); else Audio.play(open ? "door_open" : "door_close");
          Game.emitNoise(d.pos, isGate ? CFG.NOISE.gate : (open ? CFG.NOISE.doorOpen : CFG.NOISE.doorClose), "door");
          if (open && isGate) { Game.addClue(d.pos, "gate"); Game.hint("gate", "Open gates leave a trail. Close it behind you."); }
        }
      });
    });

    /* ---- simple pickups ---- */
    const pick = function (id, verb, fn) {
      I({
        id: "pick_" + id, pos: World.items[id].pos, range: 2.4,
        prompt: function () { return vis(id) ? verb + " " + Game.ITEMS[id].name : null; },
        onInteract: fn || function () { Game.takeItem(id); }
      });
    };
    ["flashlight", "map", "detector", "fuse", "fuel", "cutter", "connector", "beaconbat", "relay", "beacon"].forEach(function (id) { pick(id, "Pick up"); });
    ["bat_yard", "bat_hut", "bat_tower"].forEach(function (id) {
      I({ id: "pick_" + id, pos: World.items[id].pos, range: 2.3, prompt: function () { return vis(id) ? "Pick up Spare Battery" : null; }, onInteract: function () { Game.takeBattery(id); } });
    });
    // map fragment reveals the clearing and the service road
    I({
      id: "pick_map_frag", pos: World.items.map_frag.pos, range: 2.4,
      prompt: function () { return vis("map_frag") ? "Take map fragment" : null; },
      onInteract: function () {
        World.setItemVisible("map_frag", false); Game.S.picked.map_frag = true; O().mapFragment = true;
        Game.revealAreas(["clearing", "service_road"]);
        Audio.play("item_pickup"); UI.toast("Map fragment: the clearing and the service road are now marked."); Game.afterChange();
      }
    });

    /* ---- readable notes ---- */
    [["note_checklist", "checklist", "Read equipment checklist"], ["note_maint", "maint", "Read maintenance note"],
      ["note_radio", "radio", "Read operator's notes"], ["note_clue1", "clue1", "Read field note 1"],
      ["note_clue2", "clue2", "Read field note 2"], ["note_clue3", "clue3", "Read field note 3"]].forEach(function (n) {
      I({ id: n[0], pos: World.items[n[0]].pos, range: 2.3, prompt: function () { return n[2]; }, onInteract: function () { Game.readNote(n[1]); } });
    });

    /* ---- cabin supply cabinet (needs power) ---- */
    I({
      id: "cabinet", pos: R.cabinet, range: 2.2,
      prompt: function () { return S().cabinetOpened ? "Supply cabinet (empty)" : "Open supply cabinet"; },
      check: function () { return S().cabinetOpened ? "There is nothing left inside." : (O().generatorOn ? null : "The electronic latch is dead. It needs power."); },
      onInteract: function () {
        S().cabinetOpened = true; S().spareBatteries = Math.min(6, S().spareBatteries + 2);
        Audio.play("locker_open"); Game.emitNoise(R.cabinet, CFG.NOISE.locker, "cabinet");
        UI.toast("Found 2 spare batteries."); UI.toast("A first-aid kit. Nothing in it helps right now.");
        Game.afterChange();
      }
    });

    /* ---- generator (hold 4 s once relay + fuel are in the inventory) ---- */
    R.genInter = I({
      id: "generator", pos: R.generator, range: 2.8, hold: 0,
      prompt: function () {
        if (O().generatorOn) return "Generator (running)";
        if (!O().shedVisited) return "Inspect generator";
        if (Game.hasItem("relay") && Game.hasItem("fuelcan")) return "Insert relay + pour fuel";
        return "Inspect generator";
      },
      check: function () { return O().generatorOn ? null : null; },
      onHoldStart: function () {
        Audio.play("generator_start");
        Game.emitNoise(R.generator, CFG.NOISE.generatorStart, "generator");
        Game.addClue(R.generator, "generator");
        Player.shake(0.02, 4);
      },
      onHoldCancel: function () { Audio.stop("generator_start"); },
      onInteract: function () {
        const o = O();
        if (o.generatorOn) { UI.toast("The generator is running."); return; }
        if (this.hold > 0 || (Game.hasItem("relay") && Game.hasItem("fuelcan") && o.shedVisited)) {
          if (!(Game.hasItem("relay") && Game.hasItem("fuelcan"))) return;
          Game.removeItem("relay"); Game.removeItem("fuelcan");
          o.generatorOn = true;
          World.powerGrid(true); World.setLed(R.genLed, true); Game.refreshDoors();
          Audio.play("power_on");
          Audio.play("generator_loop", { loop: true, volume: 0.6 });
          Game.emitNoise(R.generator, CFG.NOISE.generatorStart, "generator");
          Game.addAggression();
          Game.checkpoint("generator_shed");
          UI.toast("Power restored. It heard that.");
          Game.hint("power", "Hide, or move away from the shed. The Hollow is coming to investigate the noise.");
          Game.afterChange();
          return;
        }
        // the first inspection
        o.shedVisited = true;
        const missing = [];
        if (!Game.hasItem("relay")) missing.push("starter relay");
        if (!Game.hasItem("fuelcan")) missing.push("fuel");
        UI.toast(missing.length === 2 ? "No fuel. Starter relay missing." : "Still missing: " + missing.join(" and ") + ".");
        Game.afterChange();
      }
    });
    I({
      id: "panel", pos: R.panel, range: 2.0,
      prompt: function () { return "Power control panel"; },
      onInteract: function () { UI.toast(O().generatorOn ? "Compound power: ONLINE" : "Compound power: OFFLINE. The generator has no fuel or relay."); }
    });

    /* ---- beacon charging dock (route B) ---- */
    I({
      id: "dock", pos: R.dock, range: 2.4,
      prompt: function () {
        const o = O();
        if (o.hasBeaconBattery && !o.beaconInstalled && !o.beaconCharged) return "Insert beacon battery";
        if (o.beaconInstalled && !o.beaconCharged) return "Charging... " + Math.floor(S().charge * 100) + "%";
        return null;
      },
      check: function () { return O().beaconInstalled ? "It is charging. Stay near the generator." : (O().generatorOn ? null : "The dock has no power."); },
      onInteract: function () {
        const o = O();
        Game.removeItem("beaconbattery"); o.hasBeaconBattery = false; o.beaconInstalled = true; S().charge = 0;
        Audio.play("item_pickup");
        UI.toast("Battery docked. Stay near the generator for 30 seconds.");
        Game.afterChange();
      }
    });

    /* ---- research locker (3 digit keypad) ---- */
    I({
      id: "locker", pos: R.locker.pos, range: 2.3,
      prompt: function () { return O().lockerOpen ? null : "Use locker keypad"; },
      onInteract: function () {
        UI.keypad("LOCKER", 3, function (code) {
          if (code !== S().codes.locker) { Audio.play("keypad_beep", { rate: 0.6 }); return false; }
          O().lockerOpen = true; World.setLockerOpen(true); World.setItemVisible("relay", true);
          Audio.play("locker_open"); Game.emitNoise(R.locker.pos, CFG.NOISE.locker, "locker");
          UI.toast("The locker opens.");
          Game.afterChange();
          return true;
        });
      }
    });

    /* ---- watchtower ladder + binoculars ---- */
    I({
      id: "ladder_up", pos: R.tower.up, range: 2.2, minDot: 0.0,
      prompt: function () { return (!Player.elevated && !Player.anim) ? "Climb the ladder" : null; },
      onInteract: function () { Player.climb(true); }
    });
    I({
      id: "ladder_down", pos: R.tower.down, range: 2.4, minDot: 0.0,
      prompt: function () { return (Player.elevated && !Player.anim) ? "Climb down" : null; },
      onInteract: function () { Player.climb(false); }
    });
    I({
      id: "binoculars", pos: World.items.binoculars.pos, range: 2.4,
      prompt: function () { return "Use binoculars"; },
      onInteract: function () {
        O().binocularsUsed = true;
        Game.revealAreas(["cabin", "yard", "generator_shed", "research_hut", "radio_station", "watchtower", "service_road", "clearing"]);
        Audio.play("item_pickup");
        UI.toast("Through the binoculars you pick out every building and the paths between them.");
        UI.toggleMap();
      }
    });

    /* ---- radio desk (fuse -> connector -> tuning -> decision) ---- */
    I({
      id: "radio_desk", pos: R.radioDesk, range: 2.6,
      prompt: function () {
        const o = O();
        if (!o.generatorOn) return "Radio desk (no power)";
        if (!o.fuseInstalled) return Game.hasItem("fuse") ? "Install transmitter fuse" : "Radio desk (needs a transmitter fuse)";
        if (!o.connectorInstalled) return Game.hasItem("connector") ? "Install antenna connector" : "Radio desk (needs an antenna connector)";
        if (!o.radioTuned) return "Tune the radio";
        return o.routeChosen ? "Radio (transmission received)" : "Listen to the transmission";
      },
      onInteract: function () {
        const o = O();
        if (!o.generatorOn) { UI.toast("The radio has no power."); return; }
        if (!o.fuseInstalled) {
          if (!Game.hasItem("fuse")) { UI.toast("The transmitter fuse is blown. A replacement is in the research hut."); return; }
          Game.removeItem("fuse"); o.fuseInstalled = true; o.hasFuse = false; Audio.play("item_pickup"); UI.toast("Transmitter fuse installed."); Game.afterChange(); return;
        }
        if (!o.connectorInstalled) {
          if (!Game.hasItem("connector")) { UI.toast("The antenna connector is missing. Check the watchtower cabinet."); return; }
          Game.removeItem("connector"); o.connectorInstalled = true; o.hasConnector = false; Audio.play("item_pickup"); UI.toast("Antenna connector installed."); Game.afterChange(); return;
        }
        if (!o.radioTuned) {
          Game.addClue(R.radioDesk, "radio");
          UI.openRadio(S().codes.freq, {
            tune: function () { Game.emitNoise(R.radioDesk, CFG.NOISE.radioTune, "radio"); },
            locked: function () {
              o.radioTuned = true;
              Audio.play("radio_voice");
              Game.addAggression();
              Game.afterChange();
              setTimeout(function () { Game.showDecision(); }, 1600);
            }
          });
          return;
        }
        if (!o.routeChosen) Game.showDecision();
        else UI.toast("The rescue team cannot reach the compound. The service road is blocked.");
      }
    });
    I({
      id: "radio_screen", pos: R.radioScreen, range: 2.2,
      prompt: function () { return "Read terminal screen"; },
      onInteract: function () {
        if (!O().radioTuned) { UI.toast("The screen is dark. The radio must be tuned first."); return; }
        Game.readNote("beacon_code");
      }
    });

    /* ---- service road: wire, winch, gate box, vehicle ---- */
    I({
      id: "wire", pos: R.wirePos, range: 2.6, hold: 3,
      prompt: function () { return O().wireCut ? null : "Cut the wire"; },
      check: function () { return Game.hasItem("cutter") ? null : "You need something to cut the wire."; },
      onHoldStart: function () { Audio.play("wire_cut"); Game.emitNoise(R.wirePos, CFG.NOISE.wireCut, "wire"); },
      onInteract: function () {
        O().wireCut = true; R.wire.enabled = false; Game.removeItem("cutter"); O().hasCutter = false;
        Game.addClue(R.wirePos, "wire");
        UI.toast("The wire snaps."); Game.afterChange();
      }
    });
    I({
      id: "winch", pos: R.winchPos, range: 2.6, hold: 10,
      prompt: function () { return O().winchDone ? null : "Operate the winch"; },
      check: function () { return O().wireCut ? null : "The fallen tree is still secured by a wire."; },
      holdNoise: { loud: CFG.NOISE.winch, every: 3 },
      onHoldStart: function () { Audio.play("winch", { loop: true }); Game.addClue(R.winchPos, "winch"); Player.shake(0.015, 10); },
      onHoldCancel: function () { Audio.stop("winch"); },
      onInteract: function () {
        Audio.stop("winch");
        O().winchDone = true; R.tree.moving = true; R.tree.col.active = false;
        UI.toast("The tree rolls clear of the road."); Game.afterChange();
      }
    });
    I({
      id: "gatebox", pos: R.gateBox, range: 2.4,
      prompt: function () { return O().gatePowered ? null : "Restore power to the vehicle gate"; },
      check: function () { return O().generatorOn ? null : "The gate box is dead. The generator must be running."; },
      onInteract: function () {
        O().gatePowered = true;
        World.setDoor(R.vgate, true); World.setLed(R.gateLed, true);
        Audio.play("power_on"); Audio.play("gate_creak");
        Game.emitNoise(R.gateBox, CFG.NOISE.gatePower, "gate");
        Game.addClue(R.gateBox, "gate");
        UI.toast("The vehicle gate swings open."); Game.afterChange();
      }
    });
    I({
      id: "vehicle", pos: R.vehicle.pos, range: 2.6,
      prompt: function () { return "Start the vehicle"; },
      onInteract: function () {
        const o = O();
        if (!o.wireCut || !o.winchDone) { UI.toast("The road is still blocked by the fallen tree."); return; }
        if (!o.gatePowered) { UI.toast("The vehicle gate is still closed and has no power."); return; }
        Game.startDrive();
      }
    });

    /* ---- beacon clearing (4 digit code) ---- */
    I({
      id: "beacon_pad", pos: R.pad, range: 3.2, minDot: -1,
      prompt: function () { return O().hasBeacon && !O().beaconActive ? "Place the beacon and enter the code" : null; },
      onInteract: function () {
        UI.keypad("BEACON CODE", 4, function (code) {
          if (code !== S().codes.beacon) { Audio.play("keypad_beep", { rate: 0.6 }); return false; }
          Game.activateBeacon();
          return true;
        });
      }
    });

    /* ---- remote work lights: attract the Hollow, but also light you up ---- */
    R.work.forEach(function (w) {
      I({
        id: w.id, pos: w.pos, range: 2.4,
        prompt: function () { return w.lamp.on ? "Switch off work light" : "Switch on work light"; },
        onInteract: function () {
          if (w.lamp.on) {
            World.setLamp(w.lamp, false); w.timer = 0;
            Game.attractors = Game.attractors.filter(a => a.id !== w.id);
            Audio.play("work_light_switch", { rate: 0.9 });
            return;
          }
          World.setLamp(w.lamp, true); w.timer = 30;
          Game.attractors.push({ id: w.id, x: w.x, z: w.z, loud: CFG.HOLLOW.attractorLoud, until: Game.time + CFG.HOLLOW.attractorSeconds, noted: false });
          Audio.play("work_light_switch");
          Game.emitNoise(w.pos, CFG.NOISE.workLight, "worklight");
          Game.addClue(w.pos, "worklight");
          Game.hint("worklight", "Bright light lures the Hollow - but anyone standing in it can be seen from twice as far.");
        }
      });
    });

    /* ---- secret observation station ---- */
    I({
      id: "obs_terminal", pos: R.obsTerminal, range: 2.4,
      prompt: function () { return "Access terminal"; },
      onInteract: function () {
        Audio.play("paper_read");
        UI.showNote("OBSERVATION LOG - FINAL ENTRY",
          "Day 1,094.\n\nWe set out to watch the forest. For a long time I thought the cameras were pointed outward.\n\nThey are not. Every frame, from every pole, in every season, holds the same tall silhouette at the edge of the light - standing still, facing the compound.\n\nIt never needed to find us. It only needed us to keep making noise.\n\nIf you are reading this: stop the generator. Stop the radio. Do not call anyone else here.",
          function () { Game.ending("C"); });
      }
    });
  },

  showDecision() {
    const S = Game.S;
    UI.showDecision(function (route) {
      S.objectives.routeChosen = route;
      Game.addAggression();
      Game.checkpoint("radio_station");
      UI.toast(route === "A" ? "Route A: clear the service road." : "Route B: prepare the emergency beacon.");
      Game.afterChange();
      Game.refreshObjective(true);
    });
  }
};
