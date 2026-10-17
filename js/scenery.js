"use strict";
/* ============================================================================
   THE LAST FIVE NIGHTS - scenery.js
   Replaces the simple primitive visuals of world.js with the detailed ones:
   lamps / LEDs / poles with glow, fences, shelters, pick-up item models,
   watchtower, vehicle, fallen tree, winch, beacon, work lights and the full
   compound layout (collision, hide spots, areas, checkpoints are unchanged).
   Loaded after world.js and overrides its functions.
   Created by MD Developer
   ============================================================================ */

/* ------------------------------------------------------------------ lamps */
World._bulbMesh = null;
World.makeLamp = function (x, y, z, o) {
  o = o || {};
  if (!World._bulbMesh) { const B = new Gfx.Builder(1); B.sphere(0.5, 0.5, 0.5, 10, 7, {}); World._bulbMesh = B.build("bulb"); }
  const size = o.size || 0.28, work = !!o.work;
  const off = Gfx.mat({ tint: 0x38383a, gloss: 0.6, noNormal: true });
  const on = Gfx.mat({ tint: 0x000000, em: work ? 0xfff4e0 : 0xffe2a0, emI: 2.0, noNormal: true });
  const e = Gfx.meshEntity(World.root, World._bulbMesh, o.always ? on : off, { name: "lamp", x: x, y: y, z: z, sx: size, recv: false });
  const col = o.color || new pc.Color(1, 0.9, 0.65);
  e.addComponent("light", { type: "omni", color: col, intensity: o.intensity || 1.2, range: o.range || 10, castShadows: false });
  e.light.enabled = false;
  const gl = Gfx.glow(World.root, x, y, z, work ? 3.6 : (o.interior ? 1.6 : 2.4), work ? 0xfff0d8 : 0xffd9a0, work ? 1.1 : 0.8);
  gl.enabled = !!o.always;
  const L = { entity: e, x: x, y: y, z: z, on: !!o.always, always: !!o.always, grid: !!o.grid, work: work, bulbOn: on, bulbOff: off, glow: gl };
  World.lamps.push(L);
  World.resetters.push(function () { World.setLamp(L, L.always); });
  return L;
};
World.setLamp = function (L, on) {
  L.on = !!on;
  L.entity.mi.material = on ? L.bulbOn : L.bulbOff;
  if (L.glow) L.glow.enabled = !!on;
  if (!on) L.entity.light.enabled = false;
};

/* ------------------------------------------------------------------- LEDs */
World._ledMesh = null;
World.makeLed = function (x, y, z, sz) {
  if (!World._ledMesh) { const B = new Gfx.Builder(2); B.box(1, 1, 0.5, {}); World._ledMesh = B.build("led"); }
  const red = Gfx.mat({ tint: 0x000000, em: 0xff2418, emI: 2, noNormal: true }), green = Gfx.mat({ tint: 0x000000, em: 0x30ff60, emI: 2, noNormal: true });
  const s = sz || 0.14;
  const e = Gfx.meshEntity(World.root, World._ledMesh, red, { name: "led", x: x, y: y, z: z, sx: s, sy: s, sz: s, recv: false });
  const gr = Gfx.glow(World.root, x, y, z, s * 5, 0xff3020, 0.7), gg = Gfx.glow(World.root, x, y, z, s * 5, 0x40ff70, 0.7);
  gg.enabled = false;
  const led = { e: e, red: red, green: green, gr: gr, gg: gg };
  World.resetters.push(function () { World.setLed(led, false); });
  return led;
};
World.setLed = function (led, ok) { if (led) { led.e.mi.material = ok ? led.green : led.red; led.gr.enabled = !ok; led.gg.enabled = !!ok; } };

/* ------------------------------------------------------------------- poles */
World.pole = function (x, z) {
  const S = new Props.Set({}, 21 + Math.floor(x + z));
  S.cyl("pw", 0.17, 0.11, 3.3, x, 0, z, [160, 140, 116], null, 8);
  S.cyl("pm", 0.2, 0.2, 0.14, x, 0, z, [90, 90, 88], null, 8);
  S.box("pw", 0.9, 0.09, 0.09, x, 2.85, z, [130, 112, 90]);
  S.box("pm", 0.04, 0.04, 0.3, x, 3.05, z, [50, 50, 50], { rx: 0 });
  S.cyl("pm", 0.34, 0.07, 0.2, x, 3.37, z, [70, 74, 70], null, 12);
  S.cyl("pm", 0.04, 0.04, 0.14, x, 3.56, z, [50, 50, 50], null, 6);
  S.cyl("pm", 0.18, 0.18, 0.03, x, 3.15, z, [60, 62, 60], null, 12);
  S.flush(World.root, { name: "pole", shadow: false });
  World.addCircle(x, z, 0.15, false);
  return World.makeLamp(x, 3.28, z, { grid: true, intensity: 1.6, range: 14, size: 0.3 });
};

/* ------------------------------------------------------------------- fences */
World._fenceSet = null;
World.fenceLine = function (x1, z1, x2, z2) {
  if (!World._fenceSet) World._fenceSet = new Props.Set({ fence: { tex: "planks", boards: 3, vc: true, bump: 0.9, gloss: 0.08, ts: 0.9 } }, 71);
  const S = World._fenceSet, len = Math.hypot(x2 - x1, z2 - z1), mx = (x1 + x2) / 2, mz = (z1 + z2) / 2, along = Math.abs(x2 - x1) > Math.abs(z2 - z1);
  const n = Math.max(1, Math.round(len / 2)), r = World.rng(Math.floor(x1 * 31 + z1 * 17 + 99));
  for (let i = 0; i <= n; i++) {
    const px = x1 + (x2 - x1) * i / n, pz = z1 + (z2 - z1) * i / n, hh = 1.1 + r() * 0.12;
    S.box("fence", 0.14, hh, 0.14, px, hh / 2, pz, [210 - r() * 40, 180 - r() * 40, 140 - r() * 30], { ry: r() * 20 });
    S.box("fence", 0.2, 0.05, 0.2, px, hh + 0.02, pz, [170, 146, 110]);
  }
  const rails = [0.42, 0.85];
  rails.forEach(function (y, k) {
    for (let i = 0; i < n; i++) {
      const ax = x1 + (x2 - x1) * (i + 0.5) / n, az = z1 + (z2 - z1) * (i + 0.5) / n, l = len / n;
      const tilt = (r() - 0.5) * 3;
      if (along) S.box("fence", l, 0.09, 0.05, ax, y + (r() - 0.5) * 0.04, az + 0.09, [200, 170, 130], { rz: tilt });
      else S.box("fence", 0.05, 0.09, l, ax + 0.09, y + (r() - 0.5) * 0.04, az, [200, 170, 130], { rx: tilt });
    }
    void k;
  });
  World.addBox(mx, mz, along ? len : 0.2, along ? 0.2 : len, { sight: false });
};

/* ------------------------------------------------------------------ shelter */
World.makeShelter = function (cx, cz, w, d, openSide, wallColor) {
  const st = Props.STYLE.tin, h = 2.4, t = 0.2;
  const S = new Props.Set({ wall: st.wall, floor: st.floor, roof: { tex: "corrugated", vc: true, tint: 0xd0d6d0, bump: 1.2, gloss: 0.32, metal: 0.3, ts: 1.5 } }, 55);
  const wall = function (x, z, sw, sd) { S.box("wall", sw, h, sd, x, h / 2, z, [255, 255, 255]); World.addBox(x, z, sw, sd); };
  if (openSide !== "N") wall(cx, cz - d / 2, w, t);
  if (openSide !== "S") wall(cx, cz + d / 2, w, t);
  if (openSide !== "W") wall(cx - w / 2, cz, t, d);
  if (openSide !== "E") wall(cx + w / 2, cz, t, d);
  S.box("floor", w, 0.1, d, cx, 0.05, cz, [255, 255, 255]);
  // posts at the open corners, roof (lean-to look via a low gable)
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) { S.box("pm", 0.14, h, 0.14, cx + c[0] * (w / 2), h / 2, cz + c[1] * (d / 2), [96, 100, 96]); });
  S.get("roof").gable(w, d, 0.6, 0.35, { x: cx, y: h + 0.02, z: cz, ts: 1.5, col: [255, 255, 255], endCol: [70, 70, 66], underCol: [70, 70, 68], ridgeX: w >= d });
  S.box("pv", w, 0.06, 0.06, cx, h - 0.1, cz, [60, 60, 58]);
  S.flush(World.root, { name: "shelter", shadow: true });
  World.addNoTree(cx, cz, w + 6, d + 6);
};

/* ---------------------------------------------------------------- pick-ups */
Props.itemParts = function (id, size, color) {
  if (Props.itemModels[id]) return Props.itemModels[id];
  const S = new Props.Set({}, 12), col = Props.c(color), dark = [30, 30, 32], silver = [190, 194, 196];
  /* centred helpers: cylinder along an axis, box */
  const cx = function (key, r0, r1, len, x, y, z, c, seg) { S.cyl(key, r0, r1, len, x + len / 2, y, z, c, { rz: 90 }, seg || 10); };      // along +x, from x to x+len
  const cz = function (key, r0, r1, len, x, y, z, c, seg) { S.cyl(key, r0, r1, len, x, y, z - len / 2, c, { rx: 90 }, seg || 10); };      // centred on z
  const cy = function (key, r0, r1, len, x, y, z, c, seg) { S.cyl(key, r0, r1, len, x, y - len / 2, z, c, null, seg || 10); };            // centred on y
  const emx = function (hex, i, r, len, x, y, z) { const key = "em" + hex + "_" + i; S.m[key] = { tint: 0, em: hex, emI: i, noNormal: true, gloss: 0.5 }; S.get(key).cyl(r, r, len, 10, { x: x + len / 2, y: y, z: z, rz: 90, ts: 1 }); };
  const emy = function (hex, i, r, len, x, y, z) { const key = "em" + hex + "_" + i; S.m[key] = { tint: 0, em: hex, emI: i, noNormal: true, gloss: 0.5 }; S.get(key).cyl(r, r, len, 12, { x: x, y: y - len / 2, z: z, ts: 1 }); };
  const paperSheet = function (w, h, d) {
    const m = Math.max(w, h, d);
    S.m.paper = Props.DEF.paper;
    S.get("paper").box(w, h, d, { x: 0, y: 0, z: 0, ts: m * 1.02, wuv: false, col: [255, 255, 255] });
  };
  if (id === "flashlight") {
    cx("pm", 0.03, 0.03, 0.16, -0.12, 0, 0, [220, 190, 60]);
    cx("pm", 0.034, 0.047, 0.07, 0.04, 0, 0, [60, 60, 62]);
    emx(0xfff2c0, 1.4, 0.04, 0.012, 0.11, 0, 0);
    S.box("pv", 0.03, 0.015, 0.02, -0.04, 0.034, 0, [30, 30, 30]);
  } else if (id.indexOf("bat") === 0 && id !== "beaconbat") {
    for (let i = 0; i < 2; i++) { const z = (i - 0.5) * 0.09; cy("pm", 0.032, 0.032, 0.2, 0, 0, z, [230, 140, 20]); cy("pm", 0.034, 0.034, 0.03, 0, -0.085, z, silver); cy("pm", 0.012, 0.012, 0.025, 0, 0.11, z, silver, 8); S.box("pv", 0.01, 0.1, 0.05, 0.032, 0, z, dark); }
  } else if (id === "beaconbat") {
    cy("pm", 0.07, 0.07, 0.3, 0, 0, 0, [40, 120, 200], 12); cy("pm", 0.072, 0.072, 0.03, 0, -0.135, 0, silver, 12); cy("pm", 0.02, 0.02, 0.04, 0, 0.16, 0, silver, 8);
    emy(0x66ccff, 1.2, 0.072, 0.03, 0, 0.0, 0);
  } else if (id === "beacon") {
    cy("pm", 0.12, 0.14, 0.16, 0, -0.1, 0, [50, 54, 56], 12);
    S.sph("pv", 0.1, 0.1, 0.1, 0, 0.04, 0, [255, 255, 255]);
    emy(0x66e0ff, 2.2, 0.09, 0.14, 0, 0.0, 0);
    cy("pm", 0.15, 0.15, 0.02, 0, 0.1, 0, [90, 94, 96], 12); cy("pm", 0.02, 0.02, 0.12, 0, 0.19, 0, silver, 6);
  } else if (id === "map" || id === "map_frag" || id.indexOf("note") === 0) {
    paperSheet(size[0], size[1], size[2]);
  } else if (id === "fuse") {
    cx("pv", 0.03, 0.03, 0.18, -0.09, 0, 0, [235, 225, 200]); cx("pm", 0.034, 0.034, 0.03, -0.09, 0, 0, silver); cx("pm", 0.034, 0.034, 0.03, 0.06, 0, 0, silver);
    emx(0xffcc40, 0.9, 0.012, 0.15, -0.075, 0, 0);
  } else if (id === "detector") {
    S.box("pm", 0.12, 0.05, 0.2, 0, 0, 0, [60, 64, 60]); S.box("pm", 0.08, 0.018, 0.1, 0, 0.032, -0.02, dark);
    S.glow(0x44ff88, 1.6, 0.07, 0.006, 0.08, 0, 0.044, -0.02); S.cyl("pm", 0.008, 0.008, 0.2, 0.05, 0.02, 0.1, silver, { rx: -20 }, 5);
    S.cyl("pm", 0.015, 0.015, 0.02, -0.03, 0.025, 0.07, [230, 60, 40], null, 8);
  } else if (id === "connector") {
    cz("pm", 0.04, 0.04, 0.2, 0, 0, -0.02, [230, 150, 50]); cz("pm", 0.055, 0.055, 0.06, 0, 0, 0.12, silver);
    for (let i = 0; i < 4; i++) cz("pm", 0.008, 0.008, 0.05, 0.02 * Math.cos(i * 1.57), 0.02 * Math.sin(i * 1.57), 0.16, [240, 220, 120], 5);
  } else if (id === "relay") {
    S.box("pm", 0.2, 0.15, 0.2, 0, 0, 0, [220, 110, 40]); S.box("pm", 0.22, 0.03, 0.22, 0, 0.09, 0, [60, 60, 60]);
    for (let i = 0; i < 4; i++) cy("pm", 0.012, 0.012, 0.04, -0.07 + i * 0.047, 0.13, 0.0, silver, 6);
    S.glow(0xff3020, 1.6, 0.025, 0.025, 0.01, 0.07, 0.03, 0.105);
  } else if (id === "cutter") {
    for (const sd of [-1, 1]) { S.box("pm", 0.04, 0.02, 0.42, sd * 0.02, 0, -0.05, [200, 150, 40], { ry: sd * 8 }); S.box("pf", 0.04, 0.03, 0.22, sd * 0.05, 0, -0.22, [30, 30, 30], { ry: sd * 8 }); }
    S.box("pm", 0.08, 0.05, 0.08, 0, 0, 0.17, [90, 94, 96]);
  } else if (id === "fuel") {
    S.box("pm", 0.34, 0.4, 0.14, 0, 0, 0, [200, 40, 34]); S.box("pm", 0.12, 0.08, 0.04, 0.1, 0.24, 0, [200, 40, 34]); S.cyl("pm", 0.035, 0.035, 0.05, -0.08, 0.2, 0, [220, 200, 40], null, 8);
    S.box("pv", 0.3, 0.03, 0.15, 0, -0.18, 0, [60, 12, 10]);
  } else if (id === "binoculars") {
    for (const sd of [-1, 1]) { cx("pm", 0.04, 0.045, 0.2, -0.1, 0, sd * 0.05, [50, 54, 50]); cx("pm", 0.05, 0.05, 0.05, 0.1, 0, sd * 0.05, dark); cx("pm", 0.03, 0.03, 0.04, -0.14, 0, sd * 0.05, [100, 150, 200]); }
    S.box("pm", 0.06, 0.03, 0.12, 0, 0, 0, [60, 64, 60]);
  } else {
    S.box("pv", size[0], size[1], size[2], 0, 0, 0, col);
  }
  const parts = [];
  for (const k in S.b) { const m = S.b[k].build("item_" + id); if (m) parts.push({ mesh: m, spec: S.m[k] }); }
  Props.itemModels[id] = parts;
  return parts;
};

World.makeItem = function (id, x, y, z, color, size, shape) {
  const root = new pc.Entity("item_" + id);
  root.setLocalPosition(x, y, z);
  World.root.addChild(root);
  const upright = (size[1] > size[0] * 1.4 && size[2] < 0.06);   // wall notes / posters stay still
  let isNote = id.indexOf("note") === 0 || id === "map" || id === "map_frag";
  if (isNote) {   // face the sheet toward the room (flat sheets lie on surfaces)
    if (upright) root.setLocalEulerAngles(0, 0, 0);
  }
  const parts = Props.itemParts(id, size, color);
  const model = new pc.Entity("model");
  root.addChild(model);
  const k = isNote ? 1 : 1.25;
  model.setLocalScale(k, k, k);
  parts.forEach(function (p) { Gfx.meshEntity(model, p.mesh, Gfx.mat(p.spec), { name: "part", shadow: false }); });
  const gl = Gfx.glow(root, 0, 0.02, 0, isNote ? 0.5 : 0.7, isNote ? 0xfff3cc : (color || 0xffdd99), isNote ? 0.35 : 0.5);
  const it = { id: id, entity: root, model: model, glow: gl, pos: new pc.Vec3(x, y, z), taken: false, spin: !isNote, base: y, ph: Math.random() * 6.28 };
  World.items[id] = it;
  return it;
};
World.setItemVisible = function (id, v) {
  const it = World.items[id];
  if (it) { it.entity.enabled = !!v; it.taken = !v; }
};
World._updateItems = function (dt, cam) {
  const t = World.time;
  for (const id in World.items) {
    const it = World.items[id];
    if (!it.entity.enabled) continue;
    const dx = it.pos.x - cam.x, dz = it.pos.z - cam.z;
    if (dx * dx + dz * dz > 900) continue;
    if (it.spin) { it.model.setLocalEulerAngles(0, (t * 40 + it.ph * 57) % 360, 0); it.model.setLocalPosition(0, Math.sin(t * 2 + it.ph) * 0.02, 0); }
    if (it.glow) { const s = (it.glowBase || (it.glowBase = it.glow.getLocalScale().x)); const k = 1 + 0.12 * Math.sin(t * 3 + it.ph); it.glow.setLocalScale(s * k, s * k, s * k); }
  }
};

/* ============================================================ the compound */
World._buildCompound = function () {
  const R = World.refs, V = function (x, y, z) { return new pc.Vec3(x, y, z); };
  const hiddenAtStart = {};
  World.hiddenAtStart = hiddenAtStart;
  const item = function (id, x, y, z, color, size, shape) { return World.makeItem(id, x, y, z, color, size, shape); };
  const finish = function (b) { Props.exterior(b.id, b.set, b); Props.interior(b.id, b.set, R, V); b.set.flush(World.root, { name: b.id, shadow: true }); };

  /* ---------- 1. MAINTENANCE CABIN ---------- */
  const cabin = World.makeBuilding({ id: "cabin", name: "Maintenance Cabin", cx: 0, cz: 0, w: 6, d: 5, side: "N", style: "wood", doorKind: "wood" });
  World.addBox(-2, 1.2, 1.0, 2.0);                 // bed
  World.addBox(1.8, -1.4, 1.2, 0.7);               // table
  World.addBox(2.4, 1.9, 0.9, 0.6);                // wardrobe
  World.addBox(2.65, -0.4, 0.5, 1.0);              // supply cabinet
  World.addBox(-2.5, -1.8, 0.7, 0.55);             // stove
  finish(cabin);
  R.cabinet = V(2.45, 1.2, -0.4);
  World.hideZones.push({ x: 2.1, z: 1.3, r: 0.95, name: "wardrobe" });
  item("flashlight", 1.8, 0.98, -1.4, 0xffe28a, [0.22, 0.07, 0.07]);
  item("map", -2.84, 1.6, -0.5, 0xd8c9a0, [0.04, 0.5, 0.7]);
  item("note_checklist", 1.7, 1.5, -2.38, 0xeeeedd, [0.45, 0.6, 0.03]);
  World.makeLamp(0, 2.55, 0, { always: true, intensity: 0.8, range: 7, color: new pc.Color(1, 0.72, 0.42), interior: true });

  /* ---------- 2. YARD (fence + gate) ---------- */
  World.fenceLine(-8, -7, -8, -2.5); World.fenceLine(8, -7, 8, -2.5);
  World.fenceLine(-8, -7, -0.8, -7); World.fenceLine(0.8, -7, 8, -7);
  World.fenceLine(-8, -2.5, -3, -2.5); World.fenceLine(3, -2.5, 8, -2.5);
  const gate = World.makeDoorObj({ id: "yardgate", hx: -0.8, hz: -7, closedYaw: 0, openYaw: 90, w: 1.6, h: 1.05, thick: 0.08, kind2: "gate",
    colCx: 0, colCz: -7, colW: 1.6, colD: 0.2, sight: false, cx: 0, cz: -7, cy: 0.8, kind: "gate" });
  R.yardgate = gate;
  World.addNoTree(0, -4.75, 18, 8);
  item("bat_yard", 5.5, 0.14, -5.0, 0xffaa22, [0.16, 0.26, 0.16]);
  World.pole(-5.5, -3.8);

  /* ---------- 3. GENERATOR SHED ---------- */
  const shed = World.makeBuilding({ id: "shed", name: "Generator Shed", cx: -25, cz: -17, w: 5, d: 4, side: "S", style: "tin", doorKind: "metal", floor: "metal" });
  World.addBox(-26.3, -18.0, 1.4, 0.9);            // generator
  World.addBox(-24.2, -18.6, 0.6, 0.5);            // dock crate
  finish(shed);
  R.generator = V(-25.9, 0.9, -17.3);
  R.panel = V(-22.95, 1.5, -17.0);
  R.dock = V(-24.2, 1.0, -18.15);
  R.genLed = World.makeLed(-22.52, 1.8, -17.0, 0.1);
  item("beacon", -24.2, 1.05, -18.6, 0x66e0ff, [0.3, 0.28, 0.3]);
  hiddenAtStart.beacon = true;
  World.makeLamp(-25, 2.55, -17, { grid: true, intensity: 1.0, range: 8, interior: true });
  World.pole(-20.5, -13.2);
  shed.door.led = World.makeLed(-23.5, 1.5, -14.9, 0.1);

  /* ---------- 4. RESEARCH HUT ---------- */
  const hut = World.makeBuilding({ id: "hut", name: "Research Hut", cx: 30, cz: -30, w: 7, d: 5, side: "S", style: "wood", doorKind: "wood" });
  World.addBox(28.5, -31.5, 2.0, 0.8); World.addBox(32.2, -31.5, 1.2, 0.7);
  finish(hut);
  item("detector", 32.2, 0.97, -31.5, 0x44ff88, [0.2, 0.1, 0.3]);
  item("note_clue1", 27.9, 0.83, -31.5, 0xeeeedd, [0.3, 0.02, 0.4]);
  item("note_clue2", 28.5, 0.83, -31.5, 0xeeeedd, [0.3, 0.02, 0.4]);
  item("note_clue3", 29.1, 0.83, -31.5, 0xeeeedd, [0.3, 0.02, 0.4]);
  item("fuse", 26.95, 1.34, -30.0, 0xffd24a, [0.1, 0.1, 0.3]);
  item("map_frag", 26.95, 1.28, -29.1, 0xd8c9a0, [0.3, 0.02, 0.4]);
  item("bat_hut", 26.95, 1.34, -30.9, 0xffaa22, [0.16, 0.26, 0.16]);
  World.makeLamp(30, 2.55, -30, { grid: true, intensity: 1.0, range: 8, interior: true });
  World.pole(27, -25.5);
  hut.door.led = World.makeLed(31.4, 1.5, -27.35, 0.12);
  // crawlspace opening + storage locker outside
  const HS = new Props.Set({}, 81);
  HS.box("pv", 0.1, 0.6, 1.2, 33.55, 0.3, -28.6, [6, 6, 6]); HS.box("pw", 0.12, 0.06, 1.4, 33.58, 0.63, -28.6, [160, 130, 100]);
  HS.box("pw", 0.12, 0.6, 0.08, 33.58, 0.3, -27.95, [160, 130, 100]); HS.box("pw", 0.12, 0.6, 0.08, 33.58, 0.3, -29.25, [160, 130, 100]);
  World.hideZones.push({ x: 34.6, z: -28.6, r: 1.1, name: "crawlspace" });
  World.addBox(36.5, -30.0, 0.8, 0.8);
  HS.box("pm", 0.8, 1.9, 0.8, 36.5, 0.95, -30.0, [100, 124, 134]); HS.box("pm", 0.86, 0.05, 0.86, 36.5, 1.92, -30.0, [80, 100, 108]);
  HS.box("pm", 0.04, 0.16, 0.34, 35.97, 1.1, -30.0, [220, 215, 170]);
  for (let i = 0; i < 6; i++) HS.box("pm", 0.015, 0.02, 0.28, 35.965, 1.35 + (i % 3) * 0.06, -30.0, [30, 30, 30]);
  HS.glow(0xffa030, 1.3, 0.01, 0.04, 0.05, 35.96, 1.2, -30.0);
  HS.flush(World.root, { name: "hutextras", shadow: true });
  const lp = new pc.Entity("locker_door");
  lp.setLocalPosition(36.08, 0.95, -29.6);
  World.root.addChild(lp);
  const LP = new Props.Set({}, 83);
  LP.box("pm", 0.05, 1.8, 0.8, 0, 0, -0.4, [122, 148, 158]); LP.box("pm", 0.06, 0.06, 0.7, 0, 0.6, -0.4, [96, 118, 126]); LP.box("pm", 0.06, 0.06, 0.7, 0, -0.6, -0.4, [96, 118, 126]);
  LP.box("pm", 0.08, 0.04, 0.16, -0.05, 0, -0.68, [200, 200, 190]);
  for (let i = 0; i < 7; i++) LP.box("pv", 0.02, 0.02, 0.5, 0.03, 0.78 - i * 0.04, -0.4, [40, 50, 54]);
  LP.flush(lp, { name: "lockerpanel", shadow: true });
  R.locker = { pivot: lp, open: false, pos: V(35.6, 1.1, -30.0) };
  World.resetters.push(function () { World.setLockerOpen(false); });
  item("relay", 36.0, 1.0, -30.0, 0xff7a2a, [0.2, 0.15, 0.2]);
  hiddenAtStart.relay = true;

  /* ---------- 5. WATCHTOWER ---------- */
  World._buildTower();

  /* ---------- 6. RADIO STATION ---------- */
  const radio = World.makeBuilding({ id: "radio", name: "Radio Station", cx: 45, cz: 10, w: 6, d: 5, side: "N", style: "concrete", doorKind: "metal" });
  World.addBox(45, 11.5, 3.0, 0.8);
  finish(radio);
  R.screen = World._radioScreen();
  R.radioDesk = V(45, 1.2, 11.0);
  R.radioScreen = V(46.4, 1.3, 11.3);
  item("note_radio", 43.6, 1.03, 11.4, 0xeeeedd, [0.3, 0.02, 0.4]);
  World.makeLamp(45, 2.55, 10.8, { grid: true, intensity: 1.0, range: 8, interior: true });
  World.pole(41.5, 5.2);
  radio.door.led = World.makeLed(46.4, 1.5, 7.35, 0.12);

  /* ---------- 7. SERVICE ROAD, SHELTERS, VEHICLE ---------- */
  World.addNoTree(72, 42, 48, 14);
  World.makeShelter(55, 35, 3, 3, "N");
  World.makeShelter(50, 28, 3, 3, "N");
  const RS = new Props.Set({}, 91);
  RS.cyl("pm", 0.3, 0.3, 0.9, 54.2, 0, 35.9, [60, 90, 120], null, 14);                                     // barrel
  RS.cyl("pm", 0.31, 0.31, 0.04, 54.2, 0.22, 35.9, [30, 30, 30], null, 14); RS.cyl("pm", 0.31, 0.31, 0.04, 54.2, 0.62, 35.9, [30, 30, 30], null, 14);
  RS.box("pw", 1.8, 0.08, 0.4, 50, 0.52, 29.0, [180, 140, 100]);                                             // tool rack
  [49.2, 50.8].forEach(function (x) { RS.box("pw", 0.08, 0.52, 0.4, x, 0.26, 29.0, [120, 92, 66]); });
  RS.box("pw", 1.8, 1.0, 0.04, 50, 1.4, 29.45, [150, 120, 90]);
  for (let i = 0; i < 4; i++) RS.box("pm", 0.03, 0.4 + (i % 2) * 0.1, 0.03, 49.4 + i * 0.4, 1.3, 29.4, [150, 150, 148]);
  RS.box("pw", 0.9, 0.5, 0.5, 52.0, 0.25, 36.6, [200, 168, 120]);                                            // crates in shelter 1
  RS.cyl("pm", 0.12, 0.12, 0.5, 54.5, 0, 36.4, [200, 40, 34], null, 10); RS.cyl("pm", 0.12, 0.12, 0.5, 54.9, 0, 36.6, [200, 40, 34], null, 10);
  RS.flush(World.root, { name: "roadextras", shadow: true });
  item("fuel", 55.4, 0.5, 35.6, 0xcc2222, [0.4, 0.5, 0.25]);
  item("cutter", 50, 0.62, 28.9, 0xe0a020, [0.7, 0.1, 0.12]);
  World._buildFallenTree(V);
  World._buildVehicle(V);
  // vehicle gate + power box
  const vg = World.makeDoorObj({ id: "vgate", hx: 84, hz: 38.8, closedYaw: -90, openYaw: 0, w: 6.4, h: 1.4, thick: 0.12, kind2: "vgate",
    colCx: 84, colCz: 42, colW: 0.3, colD: 6.4, sight: false, cx: 84, cz: 42, cy: 1.0, kind: "vgate" });
  R.vgate = vg;
  const GS = new Props.Set({}, 95);
  GS.box("pm", 0.3, 1.7, 0.3, 84, 0.85, 38.4, [100, 104, 104]); GS.box("pm", 0.3, 1.7, 0.3, 84, 0.85, 45.6, [100, 104, 104]);
  GS.box("pm", 0.34, 0.1, 0.34, 84, 1.72, 38.4, [70, 74, 74]); GS.box("pm", 0.34, 0.1, 0.34, 84, 1.72, 45.6, [70, 74, 74]);
  World.addBox(84, 37.4, 0.5, 0.3);
  GS.box("pm", 0.5, 0.7, 0.3, 84, 1.1, 37.4, [110, 120, 118]); GS.box("pm", 0.4, 0.5, 0.02, 84, 1.12, 37.23, [60, 70, 68]);
  GS.box("pv", 0.3, 0.1, 0.012, 84, 0.92, 37.225, [230, 200, 40]);
  GS.cyl("pm", 0.04, 0.04, 0.5, 84, 1.45, 37.4, [60, 60, 60], null, 6);
  GS.flush(World.root, { name: "gatebox", shadow: true });
  R.gateLed = World.makeLed(84, 1.3, 37.2, 0.12);
  R.gateBox = V(84, 1.1, 36.8);
  World.pole(62, 37.5);

  /* ---------- 8. BEACON CLEARING ---------- */
  World._buildClearing(V);

  /* ---------- 9. SECRET OBSERVATION STATION ---------- */
  const obs = World.makeBuilding({ id: "obs", name: "Observation Station", cx: 10, cz: -70, w: 5, d: 4, side: "S", style: "concrete", doorKind: "metal" });
  World.addBox(10, -71.4, 1.4, 0.6);
  finish(obs);
  R.obsTerminal = V(10, 1.1, -71.0);
  World._obsScreen();
  World.makeLamp(10, 2.55, -70, { grid: true, intensity: 0.9, range: 7, interior: true });
  obs.door.led = World.makeLed(11.3, 1.5, -67.85, 0.12);
  World.pole(6.5, -66);

  /* ---------- 10. REMOTE WORK LIGHTS ---------- */
  R.work = [];
  [[-10, 25], [20, -5]].forEach(function (p, i) {
    const W = new Props.Set({}, 100 + i);
    [0, 120, 240].forEach(function (a) {                                  // tripod legs
      const ax = Math.sin(a * 0.01745) * 0.55, az = Math.cos(a * 0.01745) * 0.55;
      const len = Math.hypot(0.55, 1.5), ang = Math.atan2(0.55, 1.5) * 57.3;
      W.cyl("pm", 0.025, 0.02, len, p[0] + ax * 0.5, 0, p[1] + az * 0.5, [60, 62, 60], { ry: a, rz: -ang * 0 }, 6);
    });
    W.cyl("pm", 0.05, 0.04, 1.2, p[0], 1.2, p[1], [70, 72, 70], null, 8);
    W.box("pm", 0.8, 0.5, 0.24, p[0], 2.6, p[1], [40, 42, 40]); W.box("pm", 0.84, 0.54, 0.06, p[0], 2.6, p[1] - 0.1, [28, 28, 28]);
    for (let k = 0; k < 5; k++) W.box("pm", 0.84, 0.014, 0.012, p[0], 2.38 + k * 0.1, p[1] + 0.2, [30, 30, 30]);
    W.cyl("pm", 0.015, 0.015, 0.3, p[0] + 0.3, 2.9, p[1], [30, 30, 30], null, 4);
    W.flush(World.root, { name: "worklight", shadow: true });
    World.addCircle(p[0], p[1], 0.2, false);
    const L = World.makeLamp(p[0], 2.6, p[1] + 0.2, { work: true, intensity: 2.6, range: 26, size: 0.5, color: new pc.Color(1, 0.96, 0.85) });
    R.work.push({ lamp: L, pos: V(p[0], 1.6, p[1]), x: p[0], z: p[1], timer: 0, id: "work" + i });
  });
  World.resetters.push(function () { R.work.forEach(function (w) { w.timer = 0; }); });

  if (World._fenceSet) World._fenceSet.flush(World.root, { name: "fence", shadow: true });

  /* ---------- areas (map + visited tracking) ---------- */
  const A = function (id, name, x, z, w, d, reveal, shape) { World.areas.push({ id: id, name: name, x: x, z: z, w: w, d: d, reveal: reveal, shape: shape || "rect" }); };
  A("cabin", "Maintenance Cabin", 0, 0, 6, 5, 16);
  A("yard", "Yard", 0, -4.75, 16, 4.5, 14);
  A("generator_shed", "Generator Shed", -25, -17, 5, 4, 20);
  A("research_hut", "Research Hut", 30, -30, 7, 5, 20);
  A("radio_station", "Radio Station", 45, 10, 6, 5, 20);
  A("watchtower", "Watchtower", -40, -50, 5, 5, 24);
  A("service_road", "Service Road", 72, 42, 44, 6, 26);
  A("clearing", "Beacon Clearing", -55, 20, 13, 13, 16, "circle");
  A("observation", "Observation Station", 10, -70, 5, 4, 10);

  /* ---------- checkpoints (respawn positions) ---------- */
  const C = function (id, x, z, fx, fz) { World.checkpoints[id] = { x: x, z: z, yaw: World.yawTo(x, z, fx, fz) }; };
  C("cabin", 0, 0.9, 0, -5);
  C("generator_shed", -25, -12.6, -25, -17);
  C("research_hut", 30, -24.8, 30, -30);
  C("radio_station", 45, 4.6, 45, 10);
  C("watchtower", -40, -45.2, -40, -50);
  C("service_road", 58, 39.5, 75, 42);
  C("clearing", -49.5, 20, -55, 20);
};

/* glowing radio screen (R.screen is only used as an object whose material game.js may swap) */
World._radioScreen = function () {
  const B = new Gfx.Builder(5); B.box(0.62, 0.38, 0.02, {});
  const m = Gfx.mat({ tint: 0x000000, em: 0x22cc77, emI: 0.9, noNormal: true });
  const e = Gfx.meshEntity(World.root, B.build("screen"), m, { name: "radio_screen", x: 46.4, y: 1.45, z: 11.7, recv: false });
  const gl = Gfx.glow(World.root, 46.4, 1.45, 11.55, 1.6, 0x30ff90, 0.35);
  e.glowRef = gl;
  e.render.material = m;
  return e;
};
World._obsScreen = function () {
  const B = new Gfx.Builder(5); B.box(0.98, 0.58, 0.02, {});
  const e = Gfx.meshEntity(World.root, B.build("obsscreen"), Gfx.mat({ tint: 0x000000, em: 0x33ff99, emI: 0.8, noNormal: true }), { name: "obs_screen", x: 10, y: 1.4, z: -71.53, recv: false });
  Gfx.glow(World.root, 10, 1.4, -71.2, 2.0, 0x30ff90, 0.3);
  return e;
};

/* ----------------------------------------------------------- watchtower */
World._buildTower = function () {
  const R = World.refs, V = function (x, y, z) { return new pc.Vec3(x, y, z); };
  const S = new Props.Set({ pw: { tex: "planks", boards: 3, vc: true, bump: 1, gloss: 0.1, ts: 1 }, roof: { tex: "corrugated", vc: true, tint: 0xd0d6d0, bump: 1.2, gloss: 0.32, metal: 0.3, ts: 1.5 } }, 45);
  const wood = [185, 160, 126], dark = [120, 100, 78], steel = [130, 136, 136];
  const legs = [[-41.8, -51.8], [-38.2, -51.8], [-41.8, -48.2], [-38.2, -48.2]];
  legs.forEach(function (p) { S.box("pw", 0.4, 8.1, 0.4, p[0], 4.05, p[1], wood); S.box("pst", 0.7, 0.3, 0.7, p[0], 0.1, p[1], [150, 150, 146]); World.addCircle(p[0], p[1], 0.3, true); });
  const brace = function (x0, y0, z0, x1, y1, z1) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, len = Math.hypot(dx, dy, dz);
    if (Math.abs(dx) > Math.abs(dz)) S.box("pw", Math.hypot(dx, dy), 0.12, 0.1, (x0 + x1) / 2, (y0 + y1) / 2, z0, dark, { rz: Math.atan2(dy, dx) * 57.3 });
    else S.box("pw", 0.1, 0.12, Math.hypot(dz, dy), x0, (y0 + y1) / 2, (z0 + z1) / 2, dark, { rx: -Math.atan2(dy, dz) * 57.3 });
    void len;
  };
  [[0.6, 3.0], [3.0, 5.5], [5.5, 8.0]].forEach(function (lv, i) {
    const a = lv[0], b = lv[1], sgn = i % 2 ? -1 : 1;
    [[-51.8, -41.8, -38.2], [-48.2, -41.8, -38.2]].forEach(function (f) { if (sgn > 0) brace(f[1], a, f[0], f[2], b, f[0]); else brace(f[2], a, f[0], f[1], b, f[0]); });
    [[-41.8, -51.8, -48.2], [-38.2, -51.8, -48.2]].forEach(function (f) { if (sgn > 0) brace(f[0], a, f[1], f[0], b, f[2]); else brace(f[0], a, f[2], f[0], b, f[1]); });
    [-41.8, -38.2].forEach(function (x) { S.box("pw", 0.12, 0.14, 3.2, x, b, -50, dark); });
    [-51.8, -48.2].forEach(function (z) { S.box("pw", 3.2, 0.14, 0.12, -40, b, z, dark); });
  });
  // platform deck, joists, rails
  S.box("pw", 5, 0.2, 5, -40, 8, -50, [200, 172, 130]);
  for (let i = 0; i < 6; i++) S.box("pw", 5.0, 0.04, 0.02, -40, 8.11, -52.4 + i * 0.95, [90, 74, 56]);
  S.box("pw", 5.2, 0.24, 0.2, -40, 7.78, -52.4, dark); S.box("pw", 5.2, 0.24, 0.2, -40, 7.78, -47.6, dark);
  const rail = function (x, z, w, d) {
    const long = w > d, L = long ? w : d;
    S.box("pw", long ? L : 0.08, 0.1, long ? 0.08 : L, x, 8.55, z, wood); S.box("pw", long ? L : 0.06, 0.07, long ? 0.06 : L, x, 8.9, z, wood); S.box("pw", long ? L : 0.1, 0.12, long ? 0.1 : L, x, 9.18, z, [215, 190, 150]);
    const n = Math.max(2, Math.round(L / 0.9));
    for (let i = 0; i <= n; i++) { const o = -L / 2 + L * i / n; S.box("pw", 0.09, 1.1, 0.09, long ? x + o : x, 8.65, long ? z : z + o, dark); }
  };
  rail(-40, -52.4, 5, 0.1); rail(-42.4, -50, 0.1, 5); rail(-37.6, -50, 0.1, 5); rail(-41.5, -47.6, 2.0, 0.1); rail(-38.5, -47.6, 2.0, 0.1);
  // ladder
  [-40.4, -39.6].forEach(function (x) { S.box("pw", 0.07, 8.2, 0.07, x, 4.1, -47.3, [150, 126, 96]); });
  for (let i = 0; i < 16; i++) S.box("pw", 0.8, 0.05, 0.05, -40, 0.4 + i * 0.5, -47.3, [200, 175, 135]);
  // canopy roof on four posts
  [[-42.2, -52.2], [-37.8, -52.2], [-42.2, -47.8], [-37.8, -47.8]].forEach(function (p) { S.box("pw", 0.16, 3.0, 0.16, p[0], 9.6, p[1], wood); });
  S.get("roof").gable(5, 5, 0.9, 0.5, { x: -40, y: 11.1, z: -50, ts: 1.5, col: [255, 255, 255], endCol: [60, 60, 56], underCol: [60, 58, 54], ridgeX: true });
  S.box("pw", 5.2, 0.12, 0.12, -40, 10.95, -50, dark);
  // equipment on the platform
  S.box("pw", 0.8, 0.6, 0.8, -41.2, 8.4, -51.4, [205, 175, 125]); S.box("pm", 0.84, 0.05, 0.84, -41.2, 8.72, -51.4, [90, 94, 90]);
  S.box("pm", 0.9, 1.8, 0.5, -38.2, 9.0, -51.9, [96, 120, 100]); S.box("pm", 0.8, 0.8, 0.02, -38.2, 8.9, -51.64, [110, 138, 112]); S.box("pm", 0.8, 0.8, 0.02, -38.2, 9.6, -51.64, [110, 138, 112]);
  S.cyl("pm", 0.04, 0.05, 1.2, -40, 8.1, -51.9, [60, 60, 62], null, 8); S.box("pm", 0.16, 0.05, 0.14, -40, 9.3, -51.9, [50, 52, 52]);
  // hanging storm lantern under the roof
  S.box("pm", 0.02, 0.5, 0.02, -40, 10.7, -49.0, [40, 40, 40]); S.glow(0xffb860, 1.6, 0.14, 0.2, 0.14, -40, 10.35, -49.0);
  S.flush(World.root, { name: "tower", shadow: true });
  Gfx.glow(World.root, -40, 10.35, -49, 2.4, 0xffc070, 0.55);
  R.tower = { x0: -42.2, x1: -37.8, z0: -52.2, z1: -47.8, y: 8.1, up: V(-40, 1.2, -47.0), down: V(-40, 9.0, -48.3), upPos: { x: -40, z: -48.4 }, downPos: { x: -40, z: -46.2 } };
  World.pole(-36.5, -46);
  World.addNoTree(-40, -50, 12, 12);
  const item = function (id, x, y, z, color, size) { return World.makeItem(id, x, y, z, color, size); };
  item("note_maint", -41.2, 8.74, -51.4, 0xeeeedd, [0.3, 0.02, 0.4]);
  item("connector", -38.2, 9.4, -51.55, 0xffaa44, [0.16, 0.16, 0.3]);
  item("beaconbat", -38.5, 8.3, -49.3, 0x66ccff, [0.25, 0.35, 0.25]);
  item("binoculars", -40, 9.3, -51.9, 0x88aacc, [0.3, 0.12, 0.16]);
  item("bat_tower", -37.8, 0.14, -46.5, 0xffaa22, [0.16, 0.26, 0.16]);
};

/* ----------------------------------------------------------- fallen tree */
World._buildFallenTree = function (V) {
  const R = World.refs, r = World.rng(555), B = new Gfx.Builder(77);
  // trunk along local +y (the entity is rotated so that +y becomes +z in the world)
  B.cyl(0.62, 0.42, 9, 9, { x: 0, y: -4.5, z: 0, uRange: [0.02, 0.48], col: [96, 76, 60], jit: 0.12, cap: true });
  B.cyl(0.9, 0.62, 0.8, 9, { x: 0, y: -4.9, z: 0, uRange: [0.02, 0.48], col: [88, 70, 56], jit: 0.2, cap: false });
  for (let i = 0; i < 7; i++) {                // torn roots
    const a = i * 52 + r() * 20;
    B.cyl(0.18, 0.03, 1.8, 5, { x: 0, y: -4.75, z: 0, ry: a, rz: 105 + r() * 25, uRange: [0.02, 0.48], col: [92, 72, 56], cap: false });
  }
  for (let i = 0; i < 9; i++) {                // branches + foliage on the crown side
    const y = -1.5 + i * 0.85, a = r() * 360, L = 1.2 + r() * 1.5;
    B.cyl(0.1, 0.02, L, 5, { x: 0, y: y, z: 0, ry: a, rz: 55 + r() * 25, uRange: [0.02, 0.48], col: [86, 68, 54], cap: false });
    if (y > 0) B.sphere(0.8, 0.55, 0.8, 7, 5, { x: Math.sin(a * 0.01745) * L * 0.75, y: y + L * 0.28, z: Math.cos(a * 0.01745) * L * 0.75, jit: 0.45, uvRect: [0.5, 0, 0.5, 1.5], col: [44 + r() * 20, 80 + r() * 20, 40] });
  }
  const treeE = new pc.Entity("fallen_tree");
  treeE.setPosition(75, 0.55, 42);
  treeE.setEulerAngles(90, 0, 0);
  World.root.addChild(treeE);
  Gfx.meshEntity(treeE, B.build("fallentree"), Nature.treeMat, { name: "fallen_mesh", shadow: true });
  const treeCol = World.addBox(75, 42, 1.2, 9, { sight: false });
  R.tree = { entity: treeE, col: treeCol, anim: 0, moving: false };
  World.resetters.push(function () { R.tree.anim = 0; R.tree.moving = false; treeCol.active = true; treeE.setPosition(75, 0.55, 42); treeE.setEulerAngles(90, 0, 0); });
  // downed power line
  const wire = new pc.Entity("wire");
  wire.setLocalPosition(75, 0.75, 37.3);
  World.root.addChild(wire);
  const W = new Gfx.Builder(88);
  const pts = 14;
  for (let i = 0; i < pts; i++) {
    const t0 = i / pts, t1 = (i + 1) / pts, z0 = -1.6 + 3.2 * t0, z1 = -1.6 + 3.2 * t1;
    const y0 = -0.62 * Math.sin(t0 * 3.14), y1 = -0.62 * Math.sin(t1 * 3.14), l = Math.hypot(z1 - z0, y1 - y0);
    W.cyl(0.035, 0.035, l, 5, { x: 0, y: (y0 + y1) / 2 - l / 2 * 0, z: (z0 + z1) / 2, rx: -Math.atan2(y1 - y0, z1 - z0) * 57.3 + 90 - 90, col: [24, 24, 26], cap: false, ts: 1 });
  }
  W.cyl(0.04, 0.04, 0.12, 5, { x: 0, y: 0.0, z: -1.62, rx: 90, col: [210, 150, 80], cap: true });
  const WM = new Props.Set({}, 89);
  void WM;
  Gfx.meshEntity(wire, W.build("wire"), Gfx.mat({ tint: 0x151518, gloss: 0.5, noNormal: true, vc: true }), { name: "wire_mesh" });
  const spark = Gfx.glow(wire, 0, -0.55, 1.2, 0.9, 0x9fd0ff, 1.4);
  World._sparks = [spark];
  R.wire = wire;
  R.wirePos = V(75, 0.8, 36.7);
  World.resetters.push(function () { R.wire.enabled = true; });
  // winch
  const WS = new Props.Set({}, 97);
  WS.box("pm", 0.9, 0.08, 0.7, 73.5, 0.04, 36.4, [70, 72, 70]);
  WS.box("pm", 0.1, 1.2, 0.5, 73.15, 0.7, 36.4, [200, 120, 30]); WS.box("pm", 0.1, 1.2, 0.5, 73.85, 0.7, 36.4, [200, 120, 30]);
  WS.cyl("pm", 0.22, 0.22, 0.6, 73.2, 1.15, 36.4, [150, 154, 150], { rz: 90 }, 14); WS.cyl("pm", 0.25, 0.25, 0.04, 73.18, 1.15, 36.4, [100, 104, 100], { rz: 90 }, 14); WS.cyl("pm", 0.25, 0.25, 0.04, 73.82, 1.15, 36.4, [100, 104, 100], { rz: 90 }, 14);
  WS.cyl("pm", 0.03, 0.03, 0.5, 74.2, 1.15, 36.4, [60, 60, 60], { rz: 90 }, 6); WS.box("pm", 0.04, 0.4, 0.04, 74.45, 1.15, 36.4, [60, 60, 60]); WS.box("pf", 0.05, 0.14, 0.05, 74.45, 0.95, 36.4, [30, 30, 30]);
  WS.cyl("pv", 0.025, 0.025, 1.7, 73.5, 0.06, 37.2, [24, 24, 26], { rx: 90 }, 5);
  WS.glow(0xff8a20, 1.2, 0.1, 0.06, 0.06, 73.5, 1.65, 36.2);
  WS.flush(World.root, { name: "winch", shadow: true });
  World.addBox(73.5, 36.4, 0.4, 0.4);
  R.winchPos = V(73.5, 1.0, 36.4);
};

/* --------------------------------------------------------------- vehicle */
World._buildVehicle = function (V) {
  const R = World.refs, S = new Props.Set({ pm: { tex: "metal", vc: true, tint: 0xffffff, metal: 0.3, gloss: 0.35, bump: 0.8, ts: 1.0 } }, 61);
  const olive = [96, 112, 80], dk = [70, 82, 60];
  S.box("pm", 4.2, 0.5, 1.8, 0, 0.78, 0, olive);                                    // lower body
  S.box("pm", 1.5, 0.55, 1.7, 1.15, 1.28, 0, olive);                                // hood
  S.box("pm", 1.55, 0.9, 1.7, -0.6, 1.5, 0, dk);                                    // cab
  S.box("pm", 0.3, 0.55, 1.7, -0.35, 1.28, 0, dk);
  S.box("pm", 1.6, 0.06, 1.74, -0.6, 1.98, 0, [80, 94, 66]);                        // roof
  S.box("pm", 1.4, 0.04, 0.05, -0.6, 2.08, -0.6, [40, 40, 40]); S.box("pm", 1.4, 0.04, 0.05, -0.6, 2.08, 0.6, [40, 40, 40]);   // roof rack
  for (let i = 0; i < 4; i++) S.box("pm", 0.05, 0.04, 1.3, -1.1 + i * 0.4, 2.08, 0, [40, 40, 40]);
  S.box("pm", 2.2, 0.1, 1.8, -1.9, 1.25, 0, [60, 70, 52]);                          // bed floor lip
  S.box("pm", 0.08, 0.45, 1.8, -2.95, 1.2, 0, dk); S.box("pm", 2.2, 0.45, 0.08, -1.9, 1.2, -0.86, dk); S.box("pm", 2.2, 0.45, 0.08, -1.9, 1.2, 0.86, dk);
  S.box("pm", 0.4, 0.2, 1.95, 2.18, 0.58, 0, [40, 42, 40]); S.box("pm", 0.3, 0.2, 1.95, -3.1, 0.58, 0, [40, 42, 40]);    // bumpers
  S.box("pm", 0.06, 0.34, 1.3, 1.93, 1.0, 0, [30, 32, 30]);                                                                   // grille
  for (let i = 0; i < 5; i++) S.box("pm", 0.04, 0.02, 1.3, 1.96, 0.88 + i * 0.07, 0, [60, 62, 60]);
  // wheel arches + wheels
  [[-1.4, -0.92], [-1.4, 0.92], [1.4, -0.92], [1.4, 0.92]].forEach(function (p) {
    S.cyl("pf", 0.4, 0.4, 0.3, p[0], 0.38 - 0.0, p[1] + (p[1] < 0 ? -0.15 : -0.15), [24, 24, 26], { rx: 90 }, 16);
    S.cyl("pm", 0.22, 0.22, 0.32, p[0], 0.38, p[1] + (p[1] < 0 ? -0.15 : -0.15), [130, 134, 130], { rx: 90 }, 12);
    S.box("pm", 0.84, 0.1, 0.34, p[0], 0.78, p[1] * 1.0, [30, 32, 30]);
  });
  S.cyl("pf", 0.36, 0.36, 0.25, -3.12, 1.05, 0, [24, 24, 26], { rz: 90 }, 14); S.cyl("pm", 0.2, 0.2, 0.27, -3.12, 1.05, 0, [120, 124, 120], { rz: 90 }, 10);   // spare
  S.box("pm", 0.08, 0.14, 0.08, 0.4, 1.9, -1.0, [30, 30, 30]); S.box("pm", 0.06, 0.2, 0.18, 0.4, 1.85, -1.1, [30, 30, 30]);   // mirrors
  S.cyl("pm", 0.015, 0.015, 1.6, -2.7, 1.25, 0.8, [30, 30, 30], null, 5);                                                       // whip antenna
  S.box("pm", 0.8, 0.04, 0.3, -0.6, 2.12, 0, [30, 30, 30]);
  S.box("pv", 0.4, 0.3, 0.02, 2.19, 0.6, -0.6, [200, 190, 150]);                                                                  // plate
  S.glow(0xfff2c0, 1.6, 0.06, 0.2, 0.3, 1.96, 1.08, -0.6); S.glow(0xfff2c0, 1.6, 0.06, 0.2, 0.3, 1.96, 1.08, 0.6);
  S.glow(0xff2a1a, 0.9, 0.04, 0.12, 0.2, -3.0, 0.9, -0.8); S.glow(0xff2a1a, 0.9, 0.04, 0.12, 0.2, -3.0, 0.9, 0.8);
  S.box("glass", 0.04, 0.5, 1.5, 0.15, 1.55, 0, [255, 255, 255], { rz: -22 }); S.box("glass", 0.04, 0.45, 1.4, -1.38, 1.55, 0, [255, 255, 255]);
  S.box("glass", 1.2, 0.4, 0.04, -0.6, 1.58, -0.86, [255, 255, 255]); S.box("glass", 1.2, 0.4, 0.04, -0.6, 1.58, 0.86, [255, 255, 255]);
  // muddy stripe + dents (dark patches)
  S.box("pv", 4.22, 0.14, 1.82, 0, 0.6, 0, [58, 50, 40]);
  const veh = new pc.Entity("vehicle");
  veh.setPosition(66, 0, 42);
  World.root.addChild(veh);
  S.flush(veh, { name: "vehicle", shadow: true });
  const gl1 = Gfx.glow(veh, 2.4, 1.05, -0.6, 1.6, 0xfff0c0, 0.35), gl2 = Gfx.glow(veh, 2.4, 1.05, 0.6, 1.6, 0xfff0c0, 0.35);
  void gl1; void gl2;
  const vehCol = World.addBox(66, 42, 4.2, 1.8, { sight: true });
  R.vehicle = { entity: veh, x: 66, z: 42, pos: V(66, 1.2, 40.9), col: vehCol };
  World.resetters.push(function () { veh.setPosition(66, 0, 42); vehCol.active = true; });
};

/* ------------------------------------------------------ beacon clearing */
World._buildClearing = function (V) {
  const R = World.refs, S = new Props.Set({}, 63), r = World.rng(2024);
  // ring of standing stones with faint glowing runes
  for (let i = 0; i < 11; i++) {
    const a = i / 11 * 6.2832 + r() * 0.15, x = -55 + Math.cos(a) * 6.5, z = 20 + Math.sin(a) * 6.5, h = 1.0 + r() * 1.2, w = 0.5 + r() * 0.3;
    S.box("pst", w, h, 0.4 + r() * 0.2, x, h / 2 - 0.05, z, [150 + r() * 30, 150 + r() * 30, 146 + r() * 30], { ry: -a * 57.3 + 90 + (r() - 0.5) * 20, rz: (r() - 0.5) * 6 });
    S.glow(0x40ffc0, 1.0, 0.035, h * 0.32, 0.02, x - Math.cos(a) * 0.23, h * 0.55, z - Math.sin(a) * 0.23, { ry: -a * 57.3 + 90 });
    World.addCircle(x, z, 0.35, false);
  }
  // pad
  S.cyl("pst", 1.0, 1.1, 0.14, -55, 0, 20, [190, 196, 190], null, 18);
  S.cyl("pm", 0.7, 0.7, 0.03, -55, 0.14, 20, [60, 70, 66], null, 18);
  S.flush(World.root, { name: "clearing", shadow: true });
  // glowing ring on the ground (flat additive disc) + glow
  const B = new Gfx.Builder(64), seg = 40, P = [], U = [], I = [];
  for (let i = 0; i <= seg; i++) { const a = i / seg * 6.2832, c = Math.cos(a), s2 = Math.sin(a); P.push(-55 + c * 5.7, 0.04, 20 + s2 * 5.7, -55 + c * 6.2, 0.04, 20 + s2 * 6.2); U.push(0, i / seg * 24, 1, i / seg * 24); }
  for (let i = 0; i < seg; i++) { const k = i * 2; I.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  B._add(P, P.map((v, i) => (i % 3 === 1 ? 1 : 0)), U, I, {});
  const rm = Gfx.mat({ tex: "path", tint: 0x2a8f6a, noNormal: true, unlit: true, em: 0x2a8f6a, emI: 0.7, alphaMode: "blend", tile: [1, 1] });
  const re = Gfx.meshEntity(World.root, B.build("clearring"), rm, { name: "clearing_ring", recv: false }); re.mi.cull = false;
  World.addNoTree(-55, 20, 17, 17);
  const bEnt = new pc.Entity("beacon");
  bEnt.setPosition(-55, 0, 20);
  World.root.addChild(bEnt);
  const BS = new Props.Set({}, 66);
  [0, 120, 240].forEach(function (a) { BS.cyl("pm", 0.04, 0.03, 1.3, Math.sin(a * 0.01745) * 0.22, 0.14, Math.cos(a * 0.01745) * 0.22, [60, 64, 62], { ry: a, rz: 0 }, 6); });
  BS.cyl("pm", 0.12, 0.16, 0.2, 0, 0.14, 0, [50, 54, 54], null, 12);
  BS.cyl("pm", 0.06, 0.06, 1.2, 0, 0.3, 0, [90, 94, 92], null, 8);
  BS.cyl("pm", 0.18, 0.18, 0.05, 0, 1.0, 0, [70, 74, 72], null, 12);
  BS.sph("pv", 0.26, 0.26, 0.26, 0, 1.55, 0, [255, 255, 255]);
  BS.glowCyl(0xff5533, 2.4, 0.2, 0.3, 0, 1.4, 0, null, 12);
  BS.cyl("pm", 0.02, 0.02, 0.6, 0, 1.85, 0, [60, 60, 60], null, 5);
  BS.flush(bEnt, { name: "beaconmodel", shadow: false });
  Gfx.glow(bEnt, 0, 1.5, 0, 3.4, 0xff6a3a, 1.2);
  bEnt.addComponent("light", { type: "omni", color: new pc.Color(1, 0.55, 0.3), intensity: 1.8, range: 22, castShadows: false });
  bEnt.light.enabled = false;
  bEnt.enabled = false;
  R.beacon = { entity: bEnt, active: false };
  World.resetters.push(function () { bEnt.enabled = false; bEnt.light.enabled = false; R.beacon.active = false; });
  R.pad = V(-55, 0.9, 20);
};
