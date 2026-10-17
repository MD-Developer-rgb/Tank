"use strict";
/* ============================================================================
   THE LAST FIVE NIGHTS - hollow.js
   THE HOLLOW: an original, 2.6 m tall bark-skinned stalker.
   It is NOT omniscient. It only reacts to:
     - noise events (hearing radius = loudness * multiplier, reduced by weather)
     - sight (70 degree cone, range depends on flashlight / hiding / buildings)
     - clue markers (open gates, activated machinery, disturbed foliage)
     - attractors (remote work lights)
   State machine: ROAM -> ALERT -> TRACK -> PURSUE -> SEARCH -> CATCH (+ AWAY when despawned).
   Also contains the motion detector pulses and the heartbeat/threat feedback.
   Created by MD Developer
   ============================================================================ */
const Hollow = {
  app: null, root: null, pos: null, lastKnown: null, target: null, _t: null,
  yaw: 0, state: "ROAM", stateT: 0, away: false, awayT: 0,
  seeT: 0, loseT: 0, waitT: 0, hideRoll: 0, hideBlind: false,
  curNode: -1, roamTo: -1, pauseT: 0, roamT: 0, vanishT: 60,
  path: null, pathIdx: 0, replanT: 0, trackClues: 0, stuckT: 0, lastMoved: 0,
  searchT: 0, searchDur: 10, searchCenter: null, searchPt: null, searchWait: 0,
  heat: {}, heatT: 0, detT: 0, callT: 20, stepAcc: 0, animT: 0, threat: 0, hbOn: false, breathOn: false,
  attT: 0, parts: null, eyeMat: null, eyeLight: null, eyeLvl: -1, chaseFlag: false,

  /* ====================================================== model + init */
  init(app) {
    Hollow.app = app;
    Hollow.pos = new pc.Vec3(); Hollow.lastKnown = new pc.Vec3(); Hollow.target = new pc.Vec3();
    Hollow.searchCenter = new pc.Vec3(); Hollow.searchPt = new pc.Vec3(); Hollow._t = new pc.Vec3();
    Hollow._buildModel();
  },

  _buildModel() {
    const m = Hollow._makeModel();
    Hollow.root = m.root; Hollow.eyeMat = m.eyeMat; Hollow.eyeLight = m.eyeLight; Hollow.parts = m.parts;
  },

  /* builds one complete creature model (also used for the harmless scare decoys) */
  _makeModel() {
    const root = new pc.Entity("hollow");
    Hollow.app.root.addChild(root);
    const M = function (tint, o) { o = o || {}; return Gfx.mat({ tex: o.tex || "dirt", tint: tint, bump: 1.6, gloss: 0.06, spec: 0.04, tile: o.tile || [1, 1], size: 128 }); };
    const ash = M(0x8a877c), ashDark = M(0x55534c), bone = M(0xcfc9b2), bark = M(0x6a5640, { tex: "treebark" }), moss = World.mat(0x1a2616), black = World.mat(0x050505);
    const eye = new pc.StandardMaterial();
    eye.diffuse = new pc.Color(0.7, 1, 0.97); eye.emissive = new pc.Color(0.72, 1, 0.97); eye.emissiveIntensity = 1.6; eye.update();
    const body = new pc.Entity("hbody");
    root.addChild(body);
    const E = World.ent, r = World.rng(99);
    // hunched ribcage: stacked flattened ribs around a spine
    E(body, "capsule", 0, 1.55, 0.1, 0.34, 0.9, 0.26, ashDark, { rx: 18, shadow: true, name: "torso" });
    for (let i = 0; i < 6; i++) {
      const y = 1.28 + i * 0.15, w = 0.5 - Math.abs(i - 2.2) * 0.045;
      E(body, "sphere", 0, y, 0.0 - i * 0.025, w, 0.07, 0.34, i % 2 ? ash : bone, { rx: 12, name: "rib" });
    }
    for (let i = 0; i < 7; i++) E(body, "sphere", 0, 1.1 + i * 0.17, 0.2 - i * 0.012 + 0.0, 0.1, 0.1, 0.1, bone, { name: "spine" });   // vertebrae knobs on the back
    for (let i = 0; i < 5; i++) E(body, "cone", 0, 1.3 + i * 0.22, 0.3 - i * 0.02, 0.1, 0.34 - i * 0.03, 0.1, bark, { rx: 62 });
    E(body, "sphere", 0, 1.02, 0.08, 0.46, 0.3, 0.34, ashDark, { name: "pelvis" });
    // bark plates, moss clumps and tattered strips hanging from the shoulders
    for (let i = 0; i < 9; i++) {
      E(body, "box", (r() - 0.5) * 0.5, 1.25 + r() * 0.95, 0.02 + (r() - 0.3) * 0.3, 0.12 + r() * 0.14, 0.16 + r() * 0.2, 0.04 + r() * 0.05, i % 3 ? bark : moss,
        { rx: (r() - 0.5) * 50, ry: (r() - 0.5) * 60, rz: (r() - 0.5) * 60, name: "plate" });
    }
    for (let i = 0; i < 7; i++) E(body, "box", -0.3 + i * 0.1, 1.6 - (i % 3) * 0.12, -0.2 - (i % 2) * 0.04, 0.05, 0.4 + (i % 3) * 0.18, 0.01, moss, { rx: 8, rz: (i - 3) * 4, name: "strip" });
    // legs: thigh, bent knee, shin, long foot (pivot at the hip)
    const mkLeg = function (x) {
      const p = new pc.Entity("hleg"); p.setLocalPosition(x, 1.0, 0.06); body.addChild(p);
      E(p, "cylinder", 0, -0.27, -0.04, 0.15, 0.56, 0.15, ash, { rx: 8, shadow: true });
      E(p, "sphere", 0, -0.56, -0.08, 0.15, 0.15, 0.15, bone);
      E(p, "cylinder", 0, -0.78, -0.02, 0.1, 0.5, 0.1, ashDark, { rx: -10, shadow: true });
      E(p, "box", 0, -0.98, -0.12, 0.14, 0.07, 0.36, ashDark);
      for (let i = -1; i <= 1; i++) E(p, "cone", i * 0.05, -0.98, -0.34, 0.03, 0.12, 0.03, bone, { rx: -90 });
      return p;
    };
    // very long arms with an elbow, almost touching the ground (pivot at the shoulder)
    const mkArm = function (x) {
      const p = new pc.Entity("harm"); p.setLocalPosition(x, 2.1, 0.0); body.addChild(p);
      E(p, "sphere", 0, 0, 0, 0.2, 0.2, 0.2, ash);
      E(p, "cylinder", 0, -0.55, 0, 0.12, 1.1, 0.12, ash, { shadow: true });
      E(p, "sphere", 0, -1.1, 0, 0.14, 0.14, 0.14, bone);
      const fore = new pc.Entity("hfore"); fore.setLocalPosition(0, -1.1, 0); fore.setLocalEulerAngles(-10, 0, 0); p.addChild(fore);
      E(fore, "cone", 0, -0.5, 0, 0.12, 1.0, 0.12, ashDark, { rx: 180, shadow: true });
      E(fore, "box", 0, -0.35, 0, 0.16, 0.22, 0.14, bark, { rz: 8 });
      for (let i = -2; i <= 1; i++) {
        const f = new pc.Entity("hfinger"); f.setLocalPosition(i * 0.045 + 0.022, -1.0, 0); f.setLocalEulerAngles(0, 0, i * 7); fore.addChild(f);
        E(f, "cone", 0, -0.2, 0, 0.04, 0.42, 0.04, bone, { rx: 180 });
      }
      return p;
    };
    // head: long skull, hollow face, open jaw, branch antlers, glowing slit eyes
    const head = new pc.Entity("hhead");
    head.setLocalPosition(0, 2.34, -0.2);
    body.addChild(head);
    E(body, "cylinder", 0, 2.2, -0.08, 0.1, 0.34, 0.1, ashDark, { rx: -22 });   // neck
    E(head, "sphere", 0, 0.02, 0, 0.36, 0.52, 0.4, ash, { shadow: true });
    E(head, "sphere", 0, -0.12, -0.12, 0.28, 0.3, 0.2, ashDark);
    E(head, "box", 0, -0.3, -0.12, 0.2, 0.06, 0.2, black, { rx: 18 });             // dark mouth
    E(head, "box", 0, -0.37, -0.14, 0.18, 0.16, 0.18, ashDark, { rx: 24 });        // dropped jaw
    for (let i = -2; i <= 2; i++) E(head, "cone", i * 0.035, -0.32, -0.22, 0.015, 0.08, 0.015, bone, { rx: 180 });   // teeth
    E(head, "sphere", -0.1, 0.07, -0.19, 0.17, 0.12, 0.08, black);
    E(head, "sphere", 0.1, 0.07, -0.19, 0.17, 0.12, 0.08, black);
    E(head, "sphere", -0.1, 0.07, -0.225, 0.11, 0.04, 0.03, eye, { rz: -12 });
    E(head, "sphere", 0.1, 0.07, -0.225, 0.11, 0.04, 0.03, eye, { rz: 12 });
    for (let s = -1; s <= 1; s += 2) {
      E(head, "cylinder", s * 0.14, 0.38, 0.0, 0.035, 0.36, 0.035, bark, { rz: -s * 22, rx: -8 });
      E(head, "cylinder", s * 0.26, 0.55, 0.0, 0.025, 0.26, 0.025, bark, { rz: -s * 52 });
      E(head, "cylinder", s * 0.2, 0.62, 0.0, 0.02, 0.2, 0.02, bark, { rz: s * 10 });
    }
    head.addComponent("light", { type: "omni", color: new pc.Color(0.6, 1, 0.95), intensity: 0.8, range: 7, castShadows: false });
    try { Gfx.glow(head, -0.1, 0.07, -0.27, 0.28, 0x9ffff0, 0.9); Gfx.glow(head, 0.1, 0.07, -0.27, 0.28, 0x9ffff0, 0.9); } catch (e) { /* glow sprites are optional */ }
    return { root: root, eyeMat: eye, eyeLight: head.light, parts: { body: body, head: head, legL: mkLeg(-0.2), legR: mkLeg(0.2), armL: mkArm(-0.5), armR: mkArm(0.5) } };
  },

  /* ================================================================ helpers */
  diff() { return Game.diff(); },
  aggr() { return Game.S ? Game.S.hollowAggression : 1; },
  speedMul() { return Math.min(CFG.HOLLOW.speedCap, 1 + ((Hollow.aggr() - 1) / 0.1) * CFG.HOLLOW.speedPerTenth); },
  distToPlayer() { return Math.hypot(Player.pos.x - Hollow.pos.x, Player.pos.z - Hollow.pos.z); },

  /* straight steering with wall sliding. Returns the distance that was left before the step. */
  moveTo(tx, tz, speed, dt) {
    const p = Hollow.pos, dx = tx - p.x, dz = tz - p.z, d = Math.sqrt(dx * dx + dz * dz);
    if (d < 0.05 || speed <= 0) { Hollow.lastMoved = 0; return d; }
    const step = Math.min(d, speed * dt), t = Hollow._t;
    t.set(p.x + dx / d * step, 0, p.z + dz / d * step);
    World.collide(t, CFG.HOLLOW.radius);
    Hollow.lastMoved = Math.hypot(t.x - p.x, t.z - p.z);
    p.x = t.x; p.z = t.z;
    // turn toward the heading
    const want = Math.atan2(-dx, -dz) * 180 / Math.PI;
    Hollow.yaw = Hollow._lerpAngle(Hollow.yaw, want, Math.min(1, dt * 7));
    if (Hollow.lastMoved < step * 0.2 && d > 0.6) Hollow.stuckT += dt; else Hollow.stuckT = Math.max(0, Hollow.stuckT - dt);
    return d;
  },
  turnToward(tx, tz, dt, rate) {
    const want = Math.atan2(-(tx - Hollow.pos.x), -(tz - Hollow.pos.z)) * 180 / Math.PI;
    Hollow.yaw = Hollow._lerpAngle(Hollow.yaw, want, Math.min(1, dt * (rate || 6)));
    Hollow.lastMoved = 0;
  },
  _lerpAngle(a, b, t) {
    let d = ((b - a + 540) % 360) - 180;
    return a + d * t;
  },

  /* walk along the waypoint graph toward a point; returns true on arrival */
  followTo(tx, tz, speed, dt, replanEvery) {
    const p = Hollow.pos, N = World.nodes;
    Hollow.replanT -= dt;
    if (Hollow.replanT <= 0 || !Hollow.path) {
      Hollow.replanT = replanEvery || 1.2;
      const a = World.nearestNode(p.x, p.z, false), b = World.nearestNode(tx, tz, false);
      Hollow.path = World.findPath(a, b);
      Hollow.pathIdx = 0;
      if (Hollow.path && Hollow.path.length > 1) {
        const n0 = N[Hollow.path[0]], n1 = N[Hollow.path[1]];
        if (Math.hypot(p.x - n1.x, p.z - n1.z) < Math.hypot(n0.x - n1.x, n0.z - n1.z)) Hollow.pathIdx = 1;
      }
    }
    if (Hollow.path) {
      while (Hollow.pathIdx < Hollow.path.length) {
        const n = N[Hollow.path[Hollow.pathIdx]];
        if (Math.hypot(p.x - n.x, p.z - n.z) < 1.3) Hollow.pathIdx++; else break;
      }
      if (Hollow.pathIdx < Hollow.path.length) {
        const n = N[Hollow.path[Hollow.pathIdx]];
        Hollow.moveTo(n.x, n.z, speed, dt);
        return false;
      }
    }
    const d = Hollow.moveTo(tx, tz, speed, dt);
    return d < 1.5;
  },

  /* ===================================================== senses */
  sightRange() {
    const D = Hollow.diff(), H = CFG.HOLLOW, base = D.sight;
    let r = base;
    if (Player.flashOn) {
      // flashlight on AND pointing roughly toward it
      const dx = Hollow.pos.x - Player.pos.x, dz = Hollow.pos.z - Player.pos.z, d = Math.hypot(dx, dz) || 1;
      const dot = (dx / d) * Player.fwd.x + (dz / d) * Player.fwd.z;
      if (dot > 0.6) r = base * H.flashSightMul;
    }
    if (Player.hidden) r = base * H.hiddenSightMul;
    else if (Player.building && Player.building.door && Player.building.door.anim < 0.05) r = base * H.insideSightMul;
    // active work lights reveal the player
    if (!Player.hidden) {
      const W = World.refs.work;
      for (let i = 0; i < W.length; i++) {
        if (W[i].lamp.on && Math.hypot(W[i].x - Player.pos.x, W[i].z - Player.pos.z) < H.workLightRadius) { r *= 2; break; }
      }
    }
    return r * H.sightWeather[World.weather.state];
  },

  canSee() {
    const P = Player.pos, p = Hollow.pos, H = CFG.HOLLOW;
    const dx = P.x - p.x, dz = P.z - p.z, d = Math.sqrt(dx * dx + dz * dz);
    if (d > Hollow.sightRange()) return false;
    if (d > H.peripheral) {
      const yr = Hollow.yaw * Math.PI / 180, fx = -Math.sin(yr), fz = -Math.cos(yr);
      const dot = (dx / d) * fx + (dz / d) * fz;
      if (dot < Math.cos((H.visionAngle / 2) * Math.PI / 180)) return false;
    }
    return World.los(p.x, p.z, P.x, P.z);
  },

  /* only a hidden, motionless player can fool it while it is searching */
  perceive(dt) {
    let sees = Hollow.canSee();
    if (sees && Hollow.state === "SEARCH" && Player.hidden && Player.speed < 0.3) {
      Hollow.hideRoll -= dt;
      if (Hollow.hideRoll <= 0) { Hollow.hideRoll = 1; Hollow.hideBlind = Math.random() < CFG.HOLLOW.hideFoolChance; }
      if (Hollow.hideBlind) sees = false;
    }
    if (sees) Hollow.seeT += dt; else Hollow.seeT = Math.max(0, Hollow.seeT - dt * 2);
    if (Hollow.seeT >= CFG.HOLLOW.noticeTime) { Hollow.setState("PURSUE"); return true; }
    return false;
  },

  /* noise from Game.emitNoise */
  hear(p, loud, type) {
    const st = Hollow.state;
    if (Hollow.away || st === "CATCH") return;
    if (st === "PURSUE") { if (Player.elevated) Hollow.waitT = 0; return; }
    const r = loud * Game.hearMul();
    const dx = p.x - Hollow.pos.x, dz = p.z - Hollow.pos.z;
    if (dx * dx + dz * dz > r * r) return;
    Hollow._setTargetNear(p.x, p.z);
    if (st === "ROAM" || st === "SEARCH") Hollow.setState("ALERT");
    else if (st === "TRACK") { Hollow.path = null; Hollow.trackClues = 0; }
  },
  _setTargetNear(x, z) {
    const B = CFG.BOUNDS, a = Math.random() * Math.PI * 2, o = 2 + Math.random() * 2;
    Hollow.target.set(Math.max(B.minX + 2, Math.min(B.maxX - 2, x + Math.cos(a) * o)), 0, Math.max(B.minZ + 2, Math.min(B.maxZ - 2, z + Math.sin(a) * o)));
  },

  /* ================================================== state machine */
  setState(s, arg) {
    const old = Hollow.states[Hollow.state];
    if (old && old.exit) old.exit(s);
    Hollow.state = s; Hollow.stateT = 0;
    const ns = Hollow.states[s];
    if (ns && ns.enter) ns.enter(arg);
  },

  states: {
    /* ---------------- ROAM: wander the waypoint graph ---------------- */
    ROAM: {
      enter() {
        Hollow.seeT = 0; Hollow.trackClues = 0; Hollow.path = null; Hollow.pauseT = 0; Hollow.roamT = 0;
        Hollow.vanishT = 50 + Math.random() * 70;
        const cur = Hollow.curNode >= 0 ? World.nodes[Hollow.curNode] : null;
        if (!cur || cur.interior || Math.hypot(cur.x - Hollow.pos.x, cur.z - Hollow.pos.z) > 15) Hollow.curNode = World.nearestNode(Hollow.pos.x, Hollow.pos.z, true);
        Hollow.roamTo = Hollow.pickNext();
      },
      update(dt) {
        if (Hollow.perceive(dt)) return;
        Hollow.roamT += dt;
        Hollow.callT -= dt;
        if (Hollow.callT <= 0) { Hollow.callT = 20 + Math.random() * 25; Audio.playAt("hollow_distant_call", Hollow.pos, { maxDist: 90, volume: 0.6 }); }
        if (Hollow.pauseT > 0) {
          Hollow.pauseT -= dt; Hollow.lastMoved = 0;
          Hollow.yaw += Math.sin(Hollow.stateT * 0.8) * dt * 25;   // slow look-around while waiting
          return;
        }
        const n = World.nodes[Hollow.roamTo];
        if (!n) { Hollow.roamTo = Hollow.pickNext(); return; }
        const d = Hollow.moveTo(n.x, n.z, CFG.HOLLOW.roamSpeed * Hollow.speedMul(), dt);
        if (d < 1.2 || Hollow.stuckT > 2) {
          if (Hollow.stuckT <= 2) Hollow.curNode = Hollow.roamTo;
          Hollow.stuckT = 0;
          if (Math.random() < 0.4) Hollow.pauseT = 2 + Math.random() * 4;
          Hollow.roamTo = Hollow.pickNext();
        }
        // sometimes it simply vanishes and later re-appears somewhere far away
        if (Hollow.roamT > Hollow.vanishT && Hollow.distToPlayer() > 35 && !Hollow.inPlayerView()) Hollow.despawn();
      }
    },

    /* ---------------- ALERT: froze, turns toward the noise ---------------- */
    ALERT: {
      enter() {
        Hollow.lastMoved = 0;
        Audio.playAt("hollow_distant_call", Hollow.pos, { maxDist: 80, volume: 0.8 });
      },
      update(dt) {
        if (Hollow.perceive(dt)) return;
        Hollow.turnToward(Hollow.target.x, Hollow.target.z, dt, 5);
        if (Hollow.stateT >= CFG.HOLLOW.alertTime) Hollow.setState("TRACK");
      }
    },

    /* ---------------- TRACK: walk the graph to the noise, then check clues ---------------- */
    TRACK: {
      enter() { Hollow.path = null; Hollow.replanT = 0; Hollow.stuckT = 0; },
      update(dt) {
        if (Hollow.perceive(dt)) return;
        const arrived = Hollow.followTo(Hollow.target.x, Hollow.target.z, CFG.HOLLOW.trackSpeed * Hollow.speedMul(), dt, 1.5);
        if (arrived || Hollow.stuckT > 1.5) {
          Hollow.stuckT = 0;
          const clue = Hollow.trackClues < 3 ? Game.freshestClue(Hollow.pos.x, Hollow.pos.z, CFG.HOLLOW.clueRange) : null;
          if (clue) {
            clue.checked = true; Hollow.trackClues++;
            Hollow._setTargetNear(clue.x, clue.z);
            Hollow.path = null; Hollow.replanT = 0;
          } else {
            Hollow.searchCenter.set(Hollow.pos.x, 0, Hollow.pos.z);
            Hollow.setState("SEARCH", { center: Hollow.searchCenter });
          }
        }
      }
    },

    /* ---------------- PURSUE: runs the player down; must be shaken off ---------------- */
    PURSUE: {
      enter() {
        Hollow.chaseT = 0; Hollow.farT = 0; Hollow.loseT = 0; Hollow.waitT = 0; Hollow.replanT = 0; Hollow.path = null; Hollow.stuckT = 0;
        Hollow.lastKnown.set(Player.pos.x, 0, Player.pos.z);
        Audio.playAt("hollow_growl", Hollow.pos, { maxDist: 60, volume: 1 });
        Audio.setChase(true);
        Hollow.chaseFlag = true;
      },
      exit(next) {
        if (next !== "PURSUE") { Audio.setChase(false); Hollow.chaseFlag = false; }
      },
      update(dt) {
        const P = Player.pos, p = Hollow.pos, H = CFG.HOLLOW;
        const dx = P.x - p.x, dz = P.z - p.z, d = Math.sqrt(dx * dx + dz * dz);
        Audio.setChaseLevel(1.15 - d / 38);
        Hollow.chaseT = (Hollow.chaseT || 0) + dt;
        const tired = Math.max(0.85, 1 - 0.015 * Math.max(0, Hollow.chaseT - 8));      // a long chase wears it down a little
        const speed = Hollow.diff().chase * Hollow.speedMul() * (d < H.lungeDist ? 1.08 : 1) * tired;
        if (d < 9) Hollow.chaseT = Math.min(Hollow.chaseT, 12);          // a close chase keeps it interested
        // 0) it loses you: far away for a while, or a long chase that never got close
        Hollow.farT = d > H.giveUpDist ? (Hollow.farT || 0) + dt : 0;
        if (!Player.elevated && (Hollow.farT > H.giveUpTime || Hollow.chaseT > H.giveUpMax)) {
          Hollow.farT = 0; Hollow.chaseT = 0;
          Hollow.searchCenter.set(Hollow.lastKnown.x, 0, Hollow.lastKnown.z);
          Hollow.setState("SEARCH", { center: Hollow.searchCenter });
          return;
        }

        // 1) catch
        if (P.y < 2.0 && !Player.elevated && d < H.catchDist && Game.invuln <= 0) { Hollow.setState("CATCH"); return; }

        // 2) water breaks the trail
        if (Player.inStream && d > 4 && !World.inStream(p.x, p.z)) {
          Hollow.searchCenter.set(p.x, 0, p.z);
          Hollow.setState("SEARCH", { center: Hollow.searchCenter, dur: H.streamSearch });
          return;
        }

        // 3) the player is up the tower: it waits underneath, then gives up
        if (Player.elevated) {
          if (d < 4.5) {
            Hollow.turnToward(P.x, P.z, dt, 6);
            Hollow.waitT += dt;
            if (Hollow.waitT >= H.towerWait) { Hollow.searchCenter.set(p.x, 0, p.z); Hollow.setState("SEARCH", { center: Hollow.searchCenter, dur: 4 }); }
            return;
          }
          Hollow.moveTo(P.x, P.z, speed, dt);
          return;
        }

        // 4) can it still see the player?
        let sees = d < Math.min(H.giveUpDist, Hollow.sightRange() * 1.15) && World.los(p.x, p.z, P.x, P.z);
        if (sees) {
          Hollow.lastKnown.set(P.x, 0, P.z);
          Hollow.loseT = 0;
          Hollow.moveTo(P.x, P.z, speed, dt);
          return;
        }
        Hollow.loseT += dt;
        const memory = H.memoryWeather[World.weather.state];
        if ((Player.hidden && Hollow.loseT > 4) || Hollow.loseT > memory) {
          Hollow.searchCenter.set(Hollow.lastKnown.x, 0, Hollow.lastKnown.z);
          Hollow.setState("SEARCH", { center: Hollow.searchCenter });
          return;
        }
        // go to the last known position, around obstacles
        const dl = Math.hypot(Hollow.lastKnown.x - p.x, Hollow.lastKnown.z - p.z);
        if (dl > 2.5) Hollow.followTo(Hollow.lastKnown.x, Hollow.lastKnown.z, speed, dt, 0.7);
        else Hollow.moveTo(Hollow.lastKnown.x, Hollow.lastKnown.z, speed, dt);
      }
    },

    /* ---------------- SEARCH: circles the last known position ---------------- */
    SEARCH: {
      enter(arg) {
        arg = arg || {};
        if (arg.center) Hollow.searchCenter.set(arg.center.x, 0, arg.center.z);
        Hollow.searchDur = arg.dur || (CFG.HOLLOW.searchMin + Math.random() * (CFG.HOLLOW.searchMax - CFG.HOLLOW.searchMin) +
          Math.max(0, Hollow.aggr() - 1) * CFG.HOLLOW.searchBonusPerAggr);
        Hollow.searchWait = 0.5; Hollow.seeT = 0; Hollow.stuckT = 0; Hollow.hideRoll = 0;
        Hollow._pickSearchPoint();
      },
      update(dt) {
        if (Hollow.perceive(dt)) return;
        if (Hollow.searchWait > 0) {
          Hollow.searchWait -= dt; Hollow.lastMoved = 0;
          Hollow.yaw += 70 * dt;                              // looks around
        } else {
          const d = Hollow.moveTo(Hollow.searchPt.x, Hollow.searchPt.z, CFG.HOLLOW.searchSpeed * Hollow.speedMul(), dt);
          if (d < 0.8 || Hollow.stuckT > 1.2) { Hollow.stuckT = 0; Hollow.searchWait = 0.8 + Math.random() * 1.2; Hollow._pickSearchPoint(); }
        }
        if (Hollow.stateT >= Hollow.searchDur) Hollow.setState("ROAM");
      }
    },

    /* ---------------- CATCH ---------------- */
    CATCH: {
      enter() { Hollow.lastMoved = 0; Game.caught(); },
      update() { Hollow.lastMoved = 0; }
    }
  },

  _pickSearchPoint() {
    const a = Math.random() * Math.PI * 2, r = Math.random() * CFG.HOLLOW.searchRadius, c = Hollow.searchCenter;
    Hollow.searchPt.set(c.x + Math.cos(a) * r, 0, c.z + Math.sin(a) * r);
  },

  /* ROAM: choose the next waypoint (biased toward the player's most used routes) */
  pickNext() {
    const N = World.nodes;
    let cur = N[Hollow.curNode];
    if (!cur) { Hollow.curNode = World.nearestNode(Hollow.pos.x, Hollow.pos.z, true); cur = N[Hollow.curNode]; }
    const aggr = Hollow.aggr(), bias = Math.max(0, Math.min(3, (aggr - 1) * 4));
    let maxHeat = 1;
    for (const k in Hollow.heat) if (Hollow.heat[k] > maxHeat) maxHeat = Hollow.heat[k];
    const cand = [];
    for (let i = 0; i < cur.adj.length; i++) {
      const to = cur.adj[i].to, n = N[to];
      if (n.interior) continue;
      if (!World.edgeOpen(cur.adj[i].edge)) continue;
      let w = 1 + bias * ((Hollow.heat[to] || 0) / maxHeat);
      if (to === Hollow.prevNode) w *= 0.25;
      cand.push({ to: to, w: w });
    }
    Hollow.prevNode = Hollow.curNode;
    if (!cand.length) return World.nearestNode(Hollow.pos.x, Hollow.pos.z, true);
    let tot = 0; cand.forEach(c => tot += c.w);
    let r = Math.random() * tot;
    for (let i = 0; i < cand.length; i++) { r -= cand[i].w; if (r <= 0) return cand[i].to; }
    return cand[cand.length - 1].to;
  },

  inPlayerView() {
    const P = Player.pos, dx = Hollow.pos.x - P.x, dz = Hollow.pos.z - P.z, d = Math.hypot(dx, dz) || 1;
    if (d > 90) return false;
    const dot = (dx / d) * Player.fwd.x + (dz / d) * Player.fwd.z;
    return dot > 0.25;
  },

  /* it disappears; after 20-45 s it appears at a far waypoint outside the player's view */
  despawn() {
    Hollow.away = true; Hollow.awayT = CFG.HOLLOW.vanishMin + Math.random() * (CFG.HOLLOW.vanishMax - CFG.HOLLOW.vanishMin);
    Hollow.root.enabled = false;
    Hollow.setState("AWAY");
  },
  respawn() {
    Hollow.relocate(Player.pos, CFG.HOLLOW.respawnMinDist, true);
  },
  /* place it on a random outdoor waypoint at least minDist from a point (and out of view) */
  relocate(from, minDist, needHidden) {
    const ids = World.outdoorNodes, c = [];
    for (let i = 0; i < ids.length; i++) {
      const n = World.nodes[ids[i]], d = Math.hypot(n.x - from.x, n.z - from.z);
      if (d < minDist) continue;
      if (needHidden) {
        const dx = n.x - Player.pos.x, dz = n.z - Player.pos.z, dd = Math.hypot(dx, dz) || 1;
        const dot = (dx / dd) * Player.fwd.x + (dz / dd) * Player.fwd.z;
        if (dot > 0.3 && dd < 80 && World.los(n.x, n.z, Player.pos.x, Player.pos.z)) continue;
      }
      c.push(n);
    }
    let n;
    if (c.length) n = c[Math.floor(Math.random() * c.length)];
    else {                                          // fall back to the farthest node
      let bd = -1; n = World.nodes[ids[0]];
      for (let i = 0; i < ids.length; i++) { const m = World.nodes[ids[i]], d = Math.hypot(m.x - from.x, m.z - from.z); if (d > bd) { bd = d; n = m; } }
    }
    Hollow.pos.set(n.x, 0, n.z);
    Hollow.curNode = n.id; Hollow.prevNode = -1;
    Hollow.away = false;
    Hollow.root.enabled = true;
    Hollow.yaw = Math.random() * 360;
    Hollow.seeT = 0; Hollow.stuckT = 0;
    Hollow.setState("ROAM");
  },
  reset() {
    Hollow.heat = {}; Hollow.heatT = 0; Hollow.detT = 0; Hollow.stepAcc = 0; Hollow.callT = 15 + Math.random() * 15;
    Hollow.state = "ROAM"; Audio.setChase(false); Hollow.chaseFlag = false;
    Hollow.relocate(Player.pos, 55, false);
    Hollow.stopFeedback();
  },
  stopFeedback() {
    if (Hollow.hbOn) { Hollow.hbOn = false; Audio.stop("heartbeat"); }
    if (Hollow.breathOn) { Hollow.breathOn = false; Audio.stop("hollow_breath"); }
    Hollow.threat = 0; UI.setThreat(0, false);
  },

  /* ============================================================ per frame */
  update(dt) {
    if (!Hollow.pos) return;
    Hollow.stateT += dt;
    Hollow.lastMoved = 0;
    if (Hollow.state === "AWAY") {
      Hollow.awayT -= dt;
      if (Hollow.awayT <= 0) Hollow.respawn();
    } else {
      const st = Hollow.states[Hollow.state];
      if (st && st.update) st.update(dt);
    }
    if (!Hollow.away) {
      Hollow.attractorCheck(dt);
      Hollow.root.setPosition(Hollow.pos.x, 0, Hollow.pos.z);
      Hollow.root.setEulerAngles(0, Hollow.yaw, 0);
      Hollow.animate(dt);
      // heavy footsteps nearby
      Hollow.stepAcc += Hollow.lastMoved;
      if (Hollow.stepAcc > 1.7) { Hollow.stepAcc = 0; Audio.playAt("hollow_footsteps", Hollow.pos, { maxDist: 30, volume: 0.9 }); }
    }
    // player route heat-map (slowly decays)
    Hollow.heatT -= dt;
    if (Hollow.heatT <= 0) {
      Hollow.heatT = 1;
      const n = World.nearestNode(Player.pos.x, Player.pos.z, true);
      Hollow.heat[n] = (Hollow.heat[n] || 0) + 1;
      for (const k in Hollow.heat) Hollow.heat[k] *= 0.985;
    }
    Hollow.updateDetector(dt);
    Hollow.updateFeedback(dt);
  },

  /* bright work lights keep calling it while they are on */
  attractorCheck(dt) {
    Hollow.attT -= dt;
    if (Hollow.attT > 0) return;
    Hollow.attT = 0.5;
    const st = Hollow.state;
    if (st !== "ROAM" && st !== "SEARCH" && st !== "TRACK") return;
    const A = Game.attractors, mul = Game.hearMul();
    for (let i = 0; i < A.length; i++) {
      const a = A[i], d = Math.hypot(a.x - Hollow.pos.x, a.z - Hollow.pos.z);
      if (d > a.loud * mul || d < 6) continue;
      if (!a.noted) { a.noted = true; Hollow._setTargetNear(a.x, a.z); if (st === "TRACK") { Hollow.path = null; Hollow.trackClues = 0; } else Hollow.setState("ALERT"); }
      else if (st !== "TRACK") { Hollow._setTargetNear(a.x, a.z); Hollow.setState("TRACK"); }
      return;
    }
  },

  /* ---- procedural limb animation: walk swing + nervous twitching ---- */
  animate(dt) {
    const P = Hollow.parts, moving = Math.min(1, Hollow.lastMoved / Math.max(dt, 0.001) / 3);
    Hollow.animT += dt * (1.4 + moving * 3.2 * (Hollow.state === "PURSUE" ? 1.6 : 1));
    const t = Hollow.animT, sw = Math.sin(t * 2.2) * 28 * moving;
    P.legL.setLocalEulerAngles(sw, 0, 0);
    P.legR.setLocalEulerAngles(-sw, 0, 0);
    const tw = Math.sin(t * 7.3) * 2.2 + Math.sin(t * 13.1) * 1.4;
    P.armL.setLocalEulerAngles(-sw * 0.6 + tw, 0, 5 + Math.sin(t * 0.9) * 3 + tw * 0.5);
    P.armR.setLocalEulerAngles(sw * 0.6 - tw, 0, -5 - Math.sin(t * 1.1) * 3 - tw * 0.5);
    P.body.setLocalEulerAngles(10 + Math.sin(t * 1.3) * 2 + (Hollow.state === "PURSUE" ? 14 : 0), 0, Math.sin(t * 1.1) * 2.5);
    P.body.setLocalPosition(0, Math.abs(Math.sin(t * 2.2)) * 0.05 * moving, 0);
    if (Math.random() < 0.02) P.head.setLocalEulerAngles(0, (Math.random() - 0.5) * 50, (Math.random() - 0.5) * 30);
    else {
      const e = P.head.getLocalEulerAngles();
      P.head.setLocalEulerAngles(e.x * 0.9, e.y * 0.93, e.z * 0.9);
    }
    // eyes glow brighter when it is near (< 12 m)
    const d = Hollow.distToPlayer(), near = d < 12 ? 1 - d / 12 : 0, lvl = Math.round(near * 10);
    if (lvl !== Hollow.eyeLvl) {
      Hollow.eyeLvl = lvl;
      Hollow.eyeMat.emissiveIntensity = 0.9 + near * 2.4;
      Hollow.eyeMat.update();
      Hollow.eyeLight.intensity = 0.6 + near * 1.6;
    }
  },

  /* ---- motion detector: proximity pulses only, never a direction ---- */
  updateDetector(dt) {
    const S = Game.S;
    if (!S || !S.objectives.hasDetector || Hollow.away) return;
    const d = Hollow.distToPlayer(), range = Hollow.diff().detector;
    const moving = Hollow.lastMoved > 0.0005 || Hollow.state === "PURSUE";
    if (d < range && moving) {
      Hollow.detT -= dt;
      if (Hollow.detT <= 0) {
        Hollow.detT = d > 20 ? 1.4 : (d > 10 ? 0.8 : 0.35);
        UI.pulseDetector();
        Audio.play("detector_beep", { volume: 0.8 });
      }
    } else Hollow.detT = Math.min(Hollow.detT, 0.25);
  },

  /* ---- heartbeat + vignette threat ---- */
  updateFeedback(dt) {
    const d = Hollow.away ? 999 : Hollow.distToPlayer(), R = CFG.HOLLOW.heartbeatRange;
    let v = d < R ? 1 - d / R : 0;
    if (v > 0) {
      if (!Hollow.hbOn) { Hollow.hbOn = true; Audio.play("heartbeat", { loop: true, volume: v }); }
      else Audio.setVolume("heartbeat", Math.min(1, v + 0.1));
    } else if (Hollow.hbOn) { Hollow.hbOn = false; Audio.stop("heartbeat"); }
    if (d < 6) {
      if (!Hollow.breathOn) { Hollow.breathOn = true; Audio.play("hollow_breath", { loop: true, volume: 0.6 }); }
    } else if (Hollow.breathOn) { Hollow.breathOn = false; Audio.stop("hollow_breath"); }
    const chase = Hollow.state === "PURSUE";
    Hollow.threat = Math.max(v, chase ? 0.6 : 0);
    UI.setThreat(Hollow.threat, chase);
  }
};
