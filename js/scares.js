"use strict";
/* ============================================================================
   THE LAST FIVE NIGHTS - scares.js
   * Scare : random jump scares (a harmless decoy of the creature), plus the
           in-your-face "caught" jump scare.
   * Cine  : camera cut-scenes for the two escapes (road out / rescue).
   Created by MD Developer
   ============================================================================ */
const D2R = Math.PI / 180;

var Scare = {
  timer: 55, cur: null, ghost: null, dark: 0, cc: null, _lastType: "",

  reset(first) {
    Scare.cur = null; Scare.dark = 0; Scare.cc = null;
    Scare.timer = first ? 45 + Math.random() * 30 : 60 + Math.random() * 40;
    Scare.hide();
    Scare.resetCamera();
  },
  resetCamera() {
    try { if (Player.cam && Player.cam.camera) Player.cam.camera.fov = 72; } catch (e) { /* ignore */ }
  },

  /* ----------------------------------------------------------- decoy model */
  ghostModel() {
    if (!Scare.ghost) {
      Scare.ghost = Hollow._makeModel();
      Scare.ghost.eyeLight.intensity = 0.4; Scare.ghost.eyeLight.range = 4;
      Scare.ghost.root.enabled = false;
    }
    return Scare.ghost;
  },
  show(x, z, yaw) {
    const g = Scare.ghostModel();
    g.root.enabled = true; g.root.setPosition(x, World.groundY ? World.groundY(x, z) : 0, z); g.root.setEulerAngles(0, yaw, 0);
  },
  hide() { if (Scare.ghost) Scare.ghost.root.enabled = false; },
  faceTo(x, z, tx, tz) { return Math.atan2(-(tx - x), -(tz - z)) / D2R; },
  run(t, speed) {      // limb swing for a running pose
    const P = Scare.ghostModel().parts, s = Math.sin(t * speed) * 45;
    P.legL.setLocalEulerAngles(s, 0, 0); P.legR.setLocalEulerAngles(-s, 0, 0);
    P.armL.setLocalEulerAngles(-s * 0.8 - 20, 0, 4); P.armR.setLocalEulerAngles(s * 0.8 - 20, 0, -4);
    P.body.setLocalEulerAngles(14, 0, 0);
  },
  stand() {
    const P = Scare.ghostModel().parts;
    P.legL.setLocalEulerAngles(0, 0, 0); P.legR.setLocalEulerAngles(0, 0, 0); P.armL.setLocalEulerAngles(0, 0, 3); P.armR.setLocalEulerAngles(0, 0, -3); P.body.setLocalEulerAngles(4, 0, 0);
  },
  /* point at distance d, angle a (degrees, 0 = straight ahead, + = left) from the player's view */
  polar(d, a) {
    const yr = (Player.yaw + a) * D2R, P = Player.pos;
    return { x: P.x - Math.sin(yr) * d, z: P.z - Math.cos(yr) * d };
  },
  /* angle (deg) between where the player looks and a point */
  lookAngle(x, z) {
    const P = Player.pos, dx = x - P.x, dz = z - P.z, d = Math.hypot(dx, dz) || 1, f = Player.fwd, fl = Math.hypot(f.x, f.z) || 1;
    return Math.acos(Math.max(-1, Math.min(1, (dx * f.x + dz * f.z) / (d * fl)))) / D2R;
  },
  flash(a, ms) {
    const e = document.getElementById("fx-flash"); if (!e) return;
    e.style.transition = "none"; e.style.opacity = String(a == null ? 0.85 : a);
    void e.offsetWidth;
    e.style.transition = "opacity " + (ms || 260) + "ms ease-out"; e.style.opacity = "0";
  },
  jolt(strong) {
    Scare.flash(strong ? 0.9 : 0.55, strong ? 380 : 240);
    Player.shake(strong ? 0.12 : 0.07, 0.6);
    if (Settings.get("vibration") && navigator.vibrate) { try { navigator.vibrate(strong ? [120, 60, 220] : [90]); } catch (e) { /* ignore */ } }
  },

  /* ------------------------------------------------------------- scheduler */
  update(dt) {
    if (typeof Cine !== "undefined" && Cine.active) return;
    if (Game.state === "caught") { Scare.updateCaught(dt); return; }
    if (Scare.dark > 0) Scare.dark = Math.max(0, Scare.dark - dt);
    if (Game.state !== "playing" || !Game.S || Main.paused) { if (Scare.cur) Scare.end(); return; }
    if (Scare.cc) { Scare.cc = null; Scare.resetCamera(); }
    if (Scare.cur) {
      Scare.cur.t += dt;
      if (Scare.cur.update(dt, Scare.cur)) Scare.end();
      return;
    }
    Scare.timer -= dt;
    if (Scare.timer > 0) return;
    const busy = Hollow.state === "PURSUE" || Hollow.state === "CATCH" || Hollow.chaseFlag || Game.seq || UI.anyModalOpen() || Player.elevated || Player.anim || Game.invuln > 0;
    if (busy || Game.S.playTimeSeconds < 30) { Scare.timer = 5; return; }
    Scare.start();
  },
  end() {
    if (Scare.cur && Scare.cur.cleanup) Scare.cur.cleanup();
    Scare.cur = null; Scare.hide(); Scare.dark = 0;
    const k = { easy: 1.5, normal: 1, hard: 0.8 }[Game.diff().key] || 1;
    Scare.timer = (75 + Math.random() * 85) * k;
  },
  start() {
    const indoors = !!Player.building;
    let types = indoors ? ["blackout"] : ["stare", "dash", "behind", "blackout", "stare", "behind"];
    types = types.filter(t => t !== Scare._lastType || types.length === 1);
    const name = types[Math.floor(Math.random() * types.length)];
    const def = Scare.types[name](indoors);
    Scare._lastType = name;
    if (!def) { Scare.timer = 8; return; }
    def.t = 0; def.name = name;
    Scare.cur = def;
  },

  types: {
    /* something stands in the fog; look at it and it is suddenly right in front of you */
    stare() {
      let p = null;
      for (let i = 0; i < 10 && !p; i++) {
        const c = Scare.polar(11 + Math.random() * 4, (Math.random() - 0.5) * 60);
        if (World.los(Player.pos.x, Player.pos.z, c.x, c.z)) p = c;
      }
      if (!p) return null;
      Scare.show(p.x, p.z, Scare.faceTo(p.x, p.z, Player.pos.x, Player.pos.z)); Scare.stand();
      return {
        phase: 0, hold: 0,
        update(dt, s) {
          const g = Scare.ghostModel().root;
          if (s.phase === 0) {
            const gp = g.getPosition(), look = Scare.lookAngle(gp.x, gp.z), d = Math.hypot(gp.x - Player.pos.x, gp.z - Player.pos.z);
            if ((look < 16 && d > 5 && s.t > 1.2) || d < 6.5) {
              const f = Player.fwd, fl = Math.hypot(f.x, f.z) || 1, P = Player.pos, x = P.x + f.x / fl * 2.4, z = P.z + f.z / fl * 2.4;
              Scare.show(x, z, Scare.faceTo(x, z, P.x, P.z)); Scare.dark = 0.5;
              Audio.play("scare_hit", { volume: 0.9 }); Scare.jolt(true);
              s.phase = 1; s.t = 0;
            } else if (s.t > 12) return true;
          } else if (s.t > 0.5) { Audio.play("light_buzz", { volume: 0.5 }); return true; }
          return false;
        }
      };
    },
    /* it sprints across the path in front of you */
    dash() {
      const left = Math.random() < 0.5 ? 1 : -1, dist = 13 + Math.random() * 3;
      const a = Scare.polar(dist, 70 * left), b = Scare.polar(dist, -70 * left);
      if (!World.los(Player.pos.x, Player.pos.z, a.x, a.z)) return null;
      Audio.play("hollow_growl", { volume: 0.55 });
      Scare.show(a.x, a.z, 0);
      return {
        update(dt, s) {
          const k = Math.min(1, s.t / 1.5), x = a.x + (b.x - a.x) * k, z = a.z + (b.z - a.z) * k;
          Scare.show(x, z, Scare.faceTo(a.x, a.z, b.x, b.z));
          Scare.run(s.t, 18);
          if (!s.hit && k > 0.35) { s.hit = true; Scare.flash(0.22, 400); Player.shake(0.03, 0.5); Audio.play("hollow_footsteps", { volume: 0.5 }); }
          return k >= 1;
        }
      };
    },
    /* whisper and footsteps behind you; turn round and it is there */
    behind() {
      Audio.play("whisper", { volume: 0.8 });
      return {
        placed: false, hit: false, step: 0,
        update(dt, s) {
          if (!s.step && s.t > 1.3) { s.step = 1; Audio.play("hollow_footsteps", { volume: 0.45 }); }
          if (s.step === 1 && s.t > 2.2) { s.step = 2; Audio.play("hollow_footsteps", { volume: 0.6 }); }
          if (!s.placed && s.t > 2.6) {
            const c = Scare.polar(2.3, 180), v = new pc.Vec3(c.x, 0, c.z); World.collide(v, 0.45);
            if (!World.los(Player.pos.x, Player.pos.z, v.x, v.z)) return true;
            s.placed = true; s.px = v.x; s.pz = v.z;
            Scare.show(v.x, v.z, Scare.faceTo(v.x, v.z, Player.pos.x, Player.pos.z)); Scare.stand();
          }
          if (s.placed && !s.hit) {
            if (Scare.lookAngle(s.px, s.pz) < 55) { s.hit = true; s.t2 = s.t; Audio.play("scare_hit", { volume: 0.95 }); Scare.jolt(true); }
            else if (s.t > 9) { Audio.play("whisper", { volume: 0.5 }); return true; }
          }
          if (s.hit && s.t - s.t2 > 0.45) return true;
          return false;
        }
      };
    },
    /* lights and flashlight die; when they return it is standing close */
    blackout(indoors) {
      const d = indoors ? 3.0 : 4.5, c = Scare.polar(d, (Math.random() - 0.5) * 24);
      let x = c.x, z = c.z;
      if (!World.los(Player.pos.x, Player.pos.z, x, z)) { const c2 = Scare.polar(2.0, 0); x = c2.x; z = c2.z; if (!World.los(Player.pos.x, Player.pos.z, x, z)) return null; }
      Scare.dark = 3.6; Audio.play("light_buzz", { volume: 0.8 });
      return {
        phase: 0,
        update(dt, s) {
          Scare.dark = Math.max(Scare.dark, 0.3);
          if (s.phase === 0 && s.t > 1.5) { s.phase = 1; Scare.show(x, z, Scare.faceTo(x, z, Player.pos.x, Player.pos.z)); Scare.stand(); Audio.play("whisper", { volume: 0.5 }); }
          if (s.phase === 1 && s.t > 2.9) {
            s.phase = 2; const P = Player.pos, f = Player.fwd, fl = Math.hypot(f.x, f.z) || 1, nx = P.x + f.x / fl * 1.7, nz = P.z + f.z / fl * 1.7;
            Scare.show(nx, nz, Scare.faceTo(nx, nz, P.x, P.z)); Scare.dark = 0.2;
            Audio.play("scare_hit", { volume: 1 }); Scare.jolt(true);
          }
          if (s.phase === 2 && s.t > 3.35) { Scare.dark = 0; Audio.play("light_buzz", { volume: 0.4 }); return true; }
          return false;
        },
        cleanup() { Scare.dark = 0; }
      };
    }
  },

  /* ----------------------------------------------------- caught jump scare */
  caught() {
    const P = Player.pos, f = Player.fwd, fl = Math.hypot(f.x, f.z) || 1;
    // it is thrown in front of you
    const hx = P.x + f.x / fl * 1.15, hz = P.z + f.z / fl * 1.15;
    Scare.cc = { t: 0, hx: hx, hz: hz, y0: Player.yaw, p0: Player.pitch, flashed: 0 };
    Scare.hide();
    Hollow.pos.set(hx, 0, hz); Hollow.yaw = Scare.faceTo(hx, hz, P.x, P.z);
    Audio.play("scare_hit", { volume: 1 });
    Scare.flash(0.95, 450);
    if (Hollow.eyeLight) Hollow.eyeLight.intensity = 3.2;
  },
  updateCaught(dt) {
    const c = Scare.cc; if (!c) return;
    c.t += dt;
    const P = Player.pos, k = Math.min(1, c.t / 0.14);
    const want = Scare.faceTo(P.x, P.z, c.hx, c.hz), dy = ((want - c.y0 + 540) % 360) - 180;
    Player.yaw = c.y0 + dy * k; Player.pitch = c.p0 + (26 - c.p0) * k;
    // lunge: from 2.4 m to 1.0 m in a quarter of a second
    const lk = Math.min(1, c.t / 0.22), d = 2.4 - 1.4 * lk, f = Player.fwd, fl = Math.hypot(f.x, f.z) || 1;
    const x = P.x + f.x / fl * d, z = P.z + f.z / fl * d;
    Hollow.root.setPosition(x, 0, z); Hollow.root.setEulerAngles(0, Scare.faceTo(x, z, P.x, P.z), 0);
    const pr = Hollow.parts; if (pr) {
      const w = Math.sin(c.t * 40) * 6;
      pr.armL.setLocalEulerAngles(-105 + w, 0, 14); pr.armR.setLocalEulerAngles(-105 - w, 0, -14); pr.body.setLocalEulerAngles(-8, 0, 0);
      pr.head.setLocalEulerAngles(-12, Math.sin(c.t * 55) * 6, 0);
    }
    // zoom + strobe + shake
    const fov = c.t < 0.3 ? 72 - 24 * (c.t / 0.3) : 48 + Math.min(10, (c.t - 0.3) * 8);
    try { Player.cam.camera.fov = fov; } catch (e) { /* ignore */ }
    if (c.flashed < 2 && c.t > 0.18 + c.flashed * 0.16) { c.flashed++; Scare.flash(0.75, 140); }
    Player.shake(0.09, 0.2);
  }
};

/* ============================================================================
   CUT-SCENES
   ============================================================================ */
var Cine = {
  active: false, t: 0, def: null,

  begin(def) {
    Cine.active = true; Cine.t = 0; Cine.def = def;
    Game.state = "cine"; Game.seq = null;
    Player.cancelHold(true); UI.closeAll(); UI.centerText(null);
    Audio.setChase(false); Hollow.stopFeedback();
    document.body.classList.add("cine");
    const b = document.getElementById("fx-bars"); if (b) b.classList.add("show");
    Scare.hide(); Scare.dark = 0;
    if (def.start) def.start();
  },
  sub(text, ms) {
    const e = document.getElementById("fx-sub"); if (!e) return;
    clearTimeout(Cine._subT);
    if (!text) { e.style.opacity = "0"; return; }
    e.textContent = text; e.style.opacity = "1";
    if (ms) Cine._subT = setTimeout(function () { e.style.opacity = "0"; }, ms);
  },
  cam(px, py, pz, tx, ty, tz, fov) {
    const c = Player.cam;
    c.setPosition(px, py, pz); c.lookAt(tx, ty, tz);
    try { c.camera.fov = fov || 70; } catch (e) { /* ignore */ }
    Player.eyePos.set(px, py, pz);
  },
  update(dt) {
    if (!Cine.active) return;
    Cine.t += dt;
    if (Cine.def.update(Cine.t, dt)) Cine.finish();
  },
  finish() {
    if (!Cine.active) return;
    Cine.active = false;
    const kind = Cine.def.ending;
    Cine.sub(null);
    document.body.classList.remove("cine");
    const b = document.getElementById("fx-bars"); if (b) b.classList.remove("show");
    Scare.resetCamera();
    Game.ending(kind);
  },
  ease(k) { k = Math.max(0, Math.min(1, k)); return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; },

  /* ---------------------------------------------------- ending A: road out */
  driveOut() {
    const R = World.refs, veh = R.vehicle, x0 = veh.x, z0 = veh.z, E = Cine.ease;
    const ghostSpot = x0 + 6;
    Cine.begin({
      ending: "A", faded: false, rev: false, said: 0,
      start() {
        Game.invuln = 999; veh.col.active = false;
        if (!veh.lit) {
          veh.lit = true;
          const hl = new pc.Entity("headlight");
          hl.addComponent("light", { type: "spot", color: new pc.Color(1, 0.95, 0.8), intensity: 3.4, range: 40, innerConeAngle: 16, outerConeAngle: 36, castShadows: false });
          hl.setLocalPosition(2.3, 1.0, 0); hl.setLocalEulerAngles(0, 0, 90); veh.entity.addChild(hl);
          try { Gfx.glow(veh.entity, -3.0, 1.15, 0.7, 0.6, 0xff2a10, 1.4); Gfx.glow(veh.entity, -3.0, 1.15, -0.7, 0.6, 0xff2a10, 1.4); } catch (e) { /* optional */ }
        }
        Scare.show(x0 - 20, z0 + 1.2, -90); Scare.run(0, 16);
        Audio.play("vehicle_engine", { rate: 1.1, volume: 0.95 });
        Player.pos.set(x0 - 300, 0, z0);
        Cine.sub("GO. GO. GO!", 1800);
      },
      update(t) {
        const d = 26 * E((t - 0.8) / 5.2), x = x0 + d;
        veh.entity.setPosition(x, 0, z0);
        // the creature runs the truck down, then gives up
        const gx = Math.min(ghostSpot, x0 - 20 + 9 * Math.max(0, t - 0.5));
        Scare.show(gx, z0 + 1.2, -90);
        if (gx < ghostSpot) Scare.run(t, 17); else { Scare.stand(); Scare.show(ghostSpot, z0 + 1.2, 90); }
        if (!this.rev && t > 2.4) { this.rev = true; Audio.play("vehicle_engine", { rate: 1.5, volume: 1 }); Player.shake(0.03, 2); }
        // camera: fixed ahead of the road, tracking the truck, then the creature
        const cx = x0 + 14, cy = 2.1, cz = z0 + 4.5;
        let tx = x, ty = 1.2, tz = z0;
        const kk = E((t - 4.6) / 0.9);
        tx += (ghostSpot - tx) * kk; ty += (2.0 - ty) * kk; tz += (z0 + 1.2 - tz) * kk;
        if (t < 1.4) { tx = x0 - 4; ty = 1.5; }    // opening shot looks down the road at the truck and the figure
        const shake = (t > 2.4 && t < 4.6) ? 0.03 : 0;
        Cine.cam(cx + (Math.random() - 0.5) * shake, cy, cz, tx, ty, tz, 66 - (t > 4.6 ? 14 * kk : 0));
        if (t > 4.7 && !this.said) { this.said = 1; Audio.play("ending_music", { volume: 1 }); Cine.sub("It doesn't follow.", 2400); }
        if (!this.faded && t > 7.2) { this.faded = true; UI.fade(true, 1.2); }
        return t > 8.6;
      }
    });
  },

  /* --------------------------------------------- ending B: rescue helicopter */
  buildHeli() {
    if (Cine.heli) return Cine.heli;
    const E = World.ent, dark = World.mat(0x58656f), mid = World.mat(0x74828c), glass = new pc.StandardMaterial();
    glass.diffuse = new pc.Color(0.1, 0.18, 0.24); glass.emissive = new pc.Color(0.03, 0.08, 0.12); glass.update();
    const h = new pc.Entity("heli"); World.root.addChild(h); h.setLocalScale(1.5, 1.5, 1.5);
    E(h, "sphere", 0, 0, 0, 1.9, 1.6, 3.8, dark, { name: "hbody" });
    E(h, "sphere", 0, 0.05, -1.45, 1.55, 1.2, 1.5, glass, { name: "hglass" });
    E(h, "cylinder", 0, 0.3, 3.9, 0.4, 4.4, 0.4, mid, { rx: 90 });
    E(h, "box", 0, 0.8, 5.9, 0.08, 1.1, 0.7, mid);
    for (const s of [-1, 1]) { E(h, "box", s * 0.9, -1.1, 0, 0.08, 0.08, 3.4, mid); E(h, "box", s * 0.9, -0.75, -0.9, 0.06, 0.7, 0.06, mid); E(h, "box", s * 0.9, -0.75, 0.9, 0.06, 0.7, 0.06, mid); }
    const hub = new pc.Entity("rotor"); hub.setLocalPosition(0, 1.15, 0); h.addChild(hub);
    E(hub, "box", 0, 0, 0, 8.2, 0.05, 0.3, mid); E(hub, "box", 0, 0, 0, 0.3, 0.05, 8.2, mid); E(hub, "cylinder", 0, 0.1, 0, 0.3, 0.3, 0.3, dark);
    const tail = new pc.Entity("trotor"); tail.setLocalPosition(0.3, 0.8, 6.0); h.addChild(tail);
    E(tail, "box", 0, 0, 0, 0.06, 1.5, 0.12, mid);
    const sp = new pc.Entity("searchlight"); sp.setLocalPosition(0, -0.9, -1.2); sp.setLocalEulerAngles(-12, 0, 0); h.addChild(sp);
    sp.addComponent("light", { type: "spot", color: new pc.Color(0.9, 0.97, 1), intensity: 7, range: 55, innerConeAngle: 10, outerConeAngle: 24, castShadows: false });
    try {
      const beam = Gfx.mat({ tint: 0xcfe8ff, unlit: true, op: 0.11, alphaMode: "blend", noNormal: true, cull: 0 });
      E(sp, "cone", 0, -9, 0, 7.5, 18, 7.5, beam, { name: "beam", shadow: false });
    } catch (e) { /* optional */ }
    try { Gfx.glow(h, 0, -0.95, -1.4, 2.2, 0xdff4ff, 2.2); Gfx.glow(h, -0.9, 0.2, 3.0, 0.4, 0x30ff60, 1.2); Gfx.glow(h, 0.9, 0.2, 3.0, 0.4, 0xff2020, 1.2); } catch (e) { /* optional */ }
    Cine.heli = { root: h, hub: hub, tail: tail };
    return Cine.heli;
  },
  rescue() {
    const R = World.refs, pad = R.pad, px = pad.x, pz = pad.z, E = Cine.ease, H = Cine.buildHeli();
    const from = { x: px + 85, y: 34, z: pz + 48 }, hover = { x: px + 7, y: 13, z: pz - 3 };
    let said = 0, hidden = false, faded = false;
    Cine.begin({
      ending: "B",
      start() {
        Audio.play("heli_loop", { loop: true, volume: 0.05 });
        Audio.play("wind_loop", { loop: true, volume: 0.7 });
        H.root.enabled = true;
        Scare.show(px - 17, pz + 10, 0); Scare.stand();
        Cine.sub("Rotors. Someone heard the beacon.", 2600);
      },
      update(t, dt) {
        const k = E(t / 5.2), x = from.x + (hover.x - from.x) * k, y = from.y + (hover.y - from.y) * k, z = from.z + (hover.z - from.z) * k;
        const hdx = hover.x - from.x, hdz = hover.z - from.z;
        H.root.setPosition(x, y + Math.sin(t * 2.1) * 0.15, z);
        H.root.setEulerAngles(t < 5.2 ? -9 * (1 - k) : 0, Math.atan2(-hdx, -hdz) / D2R, Math.sin(t * 1.3) * 2);
        H.hub.setLocalEulerAngles(0, t * 1600, 0); H.tail.setLocalEulerAngles(t * 1800, 0, 0);
        Audio.setVolume("heli_loop", Math.min(1, 0.05 + k * 0.95));
        // the creature watches from the trees, then backs away into the dark
        const gx = px - 17, gz = pz + 10, face = Scare.faceTo(gx, gz, px, pz);
        if (t < 6.6) { Scare.show(gx, gz, face); Scare.stand(); if (t > 4.8) { const P = Scare.ghostModel().parts; P.armL.setLocalEulerAngles(-70, 0, 10); P.armR.setLocalEulerAngles(-70, 0, -10); } }
        else if (!hidden) { hidden = true; Scare.hide(); }
        if (t < 5.4) {
          // first person at the pad, looking up at the helicopter
          Cine.cam(px, 1.65, pz + 3, x, y, z, 72 - 8 * k);
          Player.shake(0, 0);
        } else {
          // cut to a slow orbit above the clearing
          const a = (t - 5.4) * 0.35 + 0.6;
          Cine.cam(hover.x + Math.cos(a) * 17, hover.y + 6, hover.z + Math.sin(a) * 17, px - 4, 1.5, pz, 62);
        }
        if (t > 5.5 && !said) { said = 1; Audio.play("ending_music", { volume: 1 }); Cine.sub("It watches from the tree line.", 2600); }
        if (!faded && t > 8.0) { faded = true; UI.fade(true, 1.2); }
        return t > 9.4;
      }
    });
  }
};
