"use strict";
/* ============================================================================
   THE LAST FIVE NIGHTS - props.js
   Detailed, textured buildings, furniture, machines, vehicle, pick-up models.
   Everything is merged into few meshes per building (Gfx.Builder) so the
   scenery looks rich but costs very few draw calls.
   NOTE: nothing touches `pc` at load time, only inside functions.
   Created by MD Developer
   ============================================================================ */
const Props = { sets: [], blinkers: [], spinners: [], itemModels: {} };

/* colour helpers */
Props.c = function (hex) { return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]; };
Props.mul = function (c, k) { return [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)]; };

/* default material specs for the generic builder keys */
Props.DEF = {
  pw: { tex: "planks", boards: 3, vc: true, bump: 0.7, gloss: 0.16, ts: 0.9 },          // painted / bare wood props
  pm: { tex: "metal", vc: true, metal: 0.4, gloss: 0.38, bump: 0.5, ts: 1.2 },           // metal props
  pf: { tex: "fabric", vc: true, gloss: 0.04, bump: 0.5, ts: 0.5 },                      // cloth, rubber, leather
  pv: { vc: true, gloss: 0.3 },                                                          // plain colours
  pst: { tex: "stone", vc: true, gloss: 0.08, bump: 1, ts: 1.1 },                        // stone
  glass: { tint: 0x2a4052, em: 0x0d1e2c, emI: 0.8, op: 0.42, gloss: 0.95 },
  paper: { tex: "paper", vc: false, gloss: 0.05, noNormal: true, cull: "none", tile: [1, 1] }
};

/* a Set collects boxes/cylinders per material key and flushes them into one mesh per key */
class PropSet {
  constructor(mats, seed) { this.m = Object.assign({}, Props.DEF, mats || {}); this.b = {}; this.seed = seed || 7; this.em = {}; }
  get(key) {
    if (!this.b[key]) this.b[key] = new Gfx.Builder(this.seed + key.length * 13 + Object.keys(this.b).length);
    return this.b[key];
  }
  _ts(key, o) { return (o && o.ts) || (this.m[key] && this.m[key].ts) || 1; }
  box(key, w, h, d, x, y, z, col, o) { o = Object.assign({}, o); o.x = x; o.y = y; o.z = z; o.col = col; o.ts = this._ts(key, o); this.get(key).box(w, h, d, o); return this; }
  /* cylinder: y is the BASE of the cylinder */
  cyl(key, r0, r1, h, x, y, z, col, o, seg) { o = Object.assign({}, o); o.x = x; o.y = y; o.z = z; o.col = col; o.ts = this._ts(key, o); this.get(key).cyl(r0, r1, h, seg || 10, o); return this; }
  sph(key, rx, ry, rz, x, y, z, col, o, seg, rings) { o = Object.assign({}, o); o.x = x; o.y = y; o.z = z; o.col = col; this.get(key).sphere(rx, ry, rz, seg || 8, rings || 6, o); return this; }
  /* emissive part: separate material per colour */
  glow(hex, intensity, w, h, d, x, y, z, o) {
    const key = "em" + hex + "_" + intensity;
    this.m[key] = { tint: 0x000000, em: hex, emI: intensity, gloss: 0.5, vc: false, noNormal: true };
    o = Object.assign({}, o); o.x = x; o.y = y; o.z = z; o.ts = 1;
    this.get(key).box(w, h, d, o); return this;
  }
  glowCyl(hex, intensity, r, h, x, y, z, o, seg) {
    const key = "em" + hex + "_" + intensity;
    this.m[key] = { tint: 0x000000, em: hex, emI: intensity, gloss: 0.5, vc: false, noNormal: true };
    o = Object.assign({}, o); o.x = x; o.y = y; o.z = z; o.ts = 1;
    this.get(key).cyl(r, r, h, seg || 10, o); return this;
  }
  /* flush to entities under parent. opts: shadow (cast), recv, name */
  flush(parent, opts) {
    opts = opts || {};
    const ents = [];
    for (const key in this.b) {
      const mesh = this.b[key].build(opts.name || "props");
      if (!mesh) continue;
      const spec = this.m[key] || Props.DEF.pv;
      const mat = Gfx.mat(spec);
      const e = Gfx.meshEntity(parent || World.root, mesh, mat, { name: (opts.name || "props") + "_" + key, shadow: spec.op ? false : !!opts.shadow, recv: opts.recv !== false });
      ents.push(e);
    }
    return ents;
  }
}
Props.Set = PropSet;

/* ================================================================ openings */
/* window: trim frame, muntins, glass, outside sill. axis "x": wall runs along x at z = fixed */
Props._window = function (S, axis, fixed, c, w, y0, y1, t, outSign) {
  const hgt = y1 - y0, fr = 0.07, tr = [74, 56, 40], tcol = [96, 78, 58];
  const along = (a, y, dw, dh, dd, col, key) => {
    if (axis === "x") S.box(key || "trim", dw, dh, dd, a, y, fixed, col);
    else S.box(key || "trim", dd, dh, dw, fixed, y, a, col);
  };
  const cy = (y0 + y1) / 2;
  along(c, cy, w - 0.04, hgt - 0.04, 0.025, [255, 255, 255], "glass");
  along(c - w / 2 + fr / 2, cy, fr, hgt, t + 0.06, tcol); along(c + w / 2 - fr / 2, cy, fr, hgt, t + 0.06, tcol);
  along(c, y1 - fr / 2, w, fr, t + 0.06, tcol); along(c, y0 + fr / 2, w, fr, t + 0.06, tcol);
  along(c, cy, 0.035, hgt - fr, 0.05, tr); along(c, cy, w - fr, 0.035, 0.05, tr);
  // sill sticking out on the outside
  const off = outSign * (t / 2 + 0.07);
  if (axis === "x") S.box("trim", w + 0.2, 0.05, 0.2, c, y0 - 0.02, fixed + off, [110, 90, 66]);
  else S.box("trim", 0.2, 0.05, w + 0.2, fixed + off, y0 - 0.02, c, [110, 90, 66]);
};

/* wall along an axis with openings [{c,w,y0,y1,kind}] cut out. key = material key of the wall */
Props._wallRun = function (S, key, axis, fixed, a0, a1, h, t, ops, col) {
  ops = (ops || []).slice().sort((p, q) => p.c - q.c);
  const piece = (u0, u1, y0, y1) => {
    const L = u1 - u0, H = y1 - y0;
    if (L < 0.02 || H < 0.02) return;
    if (axis === "x") S.box(key, L, H, t, (u0 + u1) / 2, (y0 + y1) / 2, fixed, col);
    else S.box(key, t, H, L, fixed, (y0 + y1) / 2, (u0 + u1) / 2, col);
  };
  let cur = a0;
  ops.forEach(function (op) {
    piece(cur, op.c - op.w / 2, 0, h);
    piece(op.c - op.w / 2, op.c + op.w / 2, 0, op.y0);
    piece(op.c - op.w / 2, op.c + op.w / 2, op.y1, h);
    cur = op.c + op.w / 2;
  });
  piece(cur, a1, 0, h);
};

/* ============================================================== door meshes */
Props._doorCache = {};
/* panel from x=0 (hinge) to x=w, y=0..h, centred on z=0 */
Props.doorMesh = function (kind, w, h, th) {
  const key = kind + "|" + w + "|" + h + "|" + th;
  if (Props._doorCache[key]) return Props._doorCache[key];
  const S = new PropSet({ door: { tex: "planks", boards: 5, vc: true, bump: 1, gloss: 0.12, ts: 1, vertical: true }, dm: { tex: "metal", vc: true, metal: 0.5, gloss: 0.35, ts: 1.2, bump: 0.7 } }, 99);
  if (kind === "metal") {
    S.box("dm", w, h, th, w / 2, h / 2, 0, [150, 158, 156], { wuv: false });
    S.box("dm", w - 0.14, 0.05, th + 0.03, w / 2, h * 0.3, 0, [110, 118, 116]);
    S.box("dm", w - 0.14, 0.05, th + 0.03, w / 2, h * 0.72, 0, [110, 118, 116]);
    S.box("dm", 0.06, h - 0.1, th + 0.03, 0.1, h / 2, 0, [110, 118, 116]);
    S.box("dm", 0.06, h - 0.1, th + 0.03, w - 0.1, h / 2, 0, [110, 118, 116]);
    for (let i = 0; i < 6; i++) { S.cyl("pv", 0.02, 0.02, th + 0.04, 0.22 + i * (w - 0.44) / 5, h * 0.3 - 0.0, 0, [60, 60, 60], { rx: 90 }, 6); }
    S.box("pv", 0.5, 0.2, 0.02, w / 2, h * 0.88, th / 2 + 0.01, [200, 170, 30]);          // warning plate
    S.box("pv", 0.5, 0.2, 0.02, w / 2, h * 0.88, -th / 2 - 0.01, [200, 170, 30]);
  } else if (kind === "gate") {
    S.box("door", w, 0.1, th, w / 2, 0.15, 0, [190, 160, 120], { wuv: false });
    S.box("door", w, 0.1, th, w / 2, h - 0.12, 0, [190, 160, 120], { wuv: false });
    for (let i = 0; i < 8; i++) S.box("door", 0.12, h, th, 0.1 + i * (w - 0.2) / 7, h / 2, 0, [200, 168, 126], { wuv: false });
    const d = Math.hypot(w, h - 0.3);
    S.box("door", d, 0.09, th * 0.9, w / 2, h / 2, th * 0.6, [170, 140, 105], { rz: Math.atan2(h - 0.3, w) * 180 / Math.PI, wuv: false });
  } else if (kind === "vgate") {
    // striped boom barrier
    const n = 8;
    for (let i = 0; i < n; i++) S.box("pv", w / n, 0.22, th, (i + 0.5) * w / n, h * 0.82, 0, i % 2 ? [235, 235, 235] : [190, 40, 30]);
    for (let i = 0; i < n; i++) S.box("pv", w / n, 0.22, th, (i + 0.5) * w / n, h * 0.42, 0, i % 2 ? [235, 235, 235] : [190, 40, 30]);
    S.box("pm", 0.1, h, th, 0.05, h / 2, 0, [90, 90, 90]); S.box("pm", 0.1, h, th, w - 0.05, h / 2, 0, [90, 90, 90]);
    const d = Math.hypot(w, h * 0.4);
    S.box("pm", d, 0.07, th * 0.8, w / 2, h * 0.62, 0, [150, 150, 150], { rz: Math.atan2(h * 0.4, w) * 180 / Math.PI });
  } else {   // wood
    S.box("door", w, h, th, w / 2, h / 2, 0, [235, 200, 160], { wuv: false });
    S.box("door", w - 0.2, 0.12, th + 0.025, w / 2, h * 0.5, 0, [150, 120, 90], { wuv: false });
    S.box("door", 0.1, h - 0.1, th + 0.025, 0.08, h / 2, 0, [150, 120, 90], { wuv: false });
    S.box("door", 0.1, h - 0.1, th + 0.025, w - 0.08, h / 2, 0, [150, 120, 90], { wuv: false });
    // hinges
    [0.25, h - 0.3].forEach(function (y) { S.box("pm", 0.12, 0.14, th + 0.05, 0.06, y, 0, [40, 40, 40]); });
  }
  // handle both sides
  [1, -1].forEach(function (sd) {
    const z = sd * (th / 2 + 0.035);
    S.box("pm", 0.04, 0.04, 0.07, w - 0.14, h * 0.46, z * 0.9, [190, 175, 80]);
    S.box("pm", 0.12, 0.025, 0.025, w - 0.19, h * 0.46, z * 1.1, [190, 175, 80]);
  });
  const parts = [];
  for (const k in S.b) { const m = S.b[k].build("door"); if (m) parts.push({ mesh: m, spec: S.m[k] }); }
  Props._doorCache[key] = parts;
  return parts;
};
Props.addDoorMesh = function (pivot, kind, w, h, th) {
  Props.doorMesh(kind, w, h, th).forEach(function (p) { Gfx.meshEntity(pivot, p.mesh, Gfx.mat(p.spec), { name: "panel", shadow: true }); });
};

/* ======================================================= building shell */
Props.STYLE = {
  wood: { wall: { tex: "planks", boards: 6, tint: 0xc4ae92, bump: 1.1, gloss: 0.1, ts: 1.2 }, floor: { tex: "planks", boards: 4, tint: 0xa89880, bump: 1, gloss: 0.18, ts: 1.6 }, roof: "shingle", ceil: { tex: "planks", boards: 5, tint: 0x6e5c46, gloss: 0.1, ts: 1.4 } },
  tin: { wall: { tex: "corrugated", tint: 0xb8c0b8, bump: 1.2, gloss: 0.3, metal: 0.25, ts: 1.5 }, floor: { tex: "metal", tint: 0x8a9090, bump: 1, gloss: 0.3, metal: 0.4, ts: 1.5 }, roof: "tin", ceil: { tex: "corrugated", tint: 0x80887f, gloss: 0.2, ts: 1.5 } },
  concrete: { wall: { tex: "concrete", tint: 0xc0c4c0, bump: 1.1, gloss: 0.06, ts: 2.4 }, floor: { tex: "concrete", tint: 0x8c908c, bump: 1, gloss: 0.2, ts: 2 }, roof: "flat", ceil: { tex: "concrete", tint: 0x707470, gloss: 0.05, ts: 2.4 } }
};

/* walls, floor, ceiling, roof, windows, trim, foundation of one building. o = makeBuilding options, b = building record */
Props.shell = function (o, b, g) {
  const st = Props.STYLE[o.style || "wood"], h = b.h, t = g.t;
  const roofSpec = st.roof === "shingle" ? { tex: "shingle", vc: true, tint: 0x9a918a, bump: 1.3, gloss: 0.1, ts: 1.4 }
    : st.roof === "tin" ? { tex: "corrugated", vc: true, tint: 0xd0d6d0, bump: 1.2, gloss: 0.32, metal: 0.3, ts: 1.5 }
    : { tex: "concrete", vc: true, tint: 0x9aa09a, bump: 1, gloss: 0.04, ts: 2.4 };
  const S = new PropSet({ wall: st.wall, floor: st.floor, ceil: st.ceil, roof: roofSpec,
    trim: { tex: "planks", boards: 3, tint: 0xffffff, vc: true, gloss: 0.12, ts: 0.9 } }, 31);
  const x0 = b.x0, x1 = b.x1, z0 = b.z0, z1 = b.z1, cx = b.cx, cz = b.cz, gw = g.gw, gh = g.gh;
  const wc = [255, 255, 255];
  const winW = 0.95, winY0 = 1.0, winY1 = 2.05;

  // openings per wall
  const opsFor = function (side, len, center) {
    const ops = [];
    if (o.side === side) ops.push({ c: center + (o.doorOffset || 0), w: gw, y0: 0, y1: gh, kind: "door" });
    if (o.windows !== false && !(o.noWin && o.noWin.indexOf(side) >= 0)) {
      const n = len > 5.5 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const c = center + (n === 1 ? (o.side === side ? 0 : 0) : (i ? 1 : -1) * len * 0.27);
        if (o.side === side && Math.abs(c - (center + (o.doorOffset || 0))) < gw / 2 + winW / 2 + 0.3) continue;
        if (o.side === side && n === 1) continue;
        ops.push({ c: c, w: winW, y0: winY0, y1: winY1, kind: "win" });
      }
    }
    return ops;
  };
  const sides = { N: ["x", z0, x0, x1, cx, +1, -1], S: ["x", z1, x0, x1, cx, +1, +1], W: ["z", x0, z0, z1, cz, -1, -1], E: ["z", x1, z0, z1, cz, -1, +1] };
  for (const side in sides) {
    const sd = sides[side], axis = sd[0], fixed = sd[1], a0 = sd[2], a1 = sd[3], center = sd[4];
    const ops = opsFor(side, a1 - a0, axis === "x" ? cx : cz);
    // window mirrored on the other axis uses different bounds
    const A0 = axis === "x" ? x0 : z0, A1 = axis === "x" ? x1 : z1;
    Props._wallRun(S, "wall", axis, fixed, A0 - t / 2, A1 + t / 2, h, t, ops, wc);
    ops.forEach(function (op) {
      if (op.kind === "win") Props._window(S, axis, fixed, op.c, op.w, op.y0, op.y1, t, sd[6]);
      else {   // door frame
        const jam = 0.09, ff = [96, 78, 58];
        if (axis === "x") {
          S.box("trim", jam, gh, t + 0.08, op.c - gw / 2 - jam / 2, gh / 2, fixed, ff); S.box("trim", jam, gh, t + 0.08, op.c + gw / 2 + jam / 2, gh / 2, fixed, ff);
          S.box("trim", gw + jam * 2, jam, t + 0.08, op.c, gh + jam / 2, fixed, ff);
          S.box("trim", gw + 0.4, 0.05, 0.7, op.c, 0.025, fixed + sd[6] * (t / 2 + 0.3), [120, 118, 112], { });
        } else {
          S.box("trim", t + 0.08, gh, jam, fixed, gh / 2, op.c - gw / 2 - jam / 2, ff); S.box("trim", t + 0.08, gh, jam, fixed, gh / 2, op.c + gw / 2 + jam / 2, ff);
          S.box("trim", t + 0.08, jam, gw + jam * 2, fixed, gh + jam / 2, op.c, ff);
          S.box("trim", 0.7, 0.05, gw + 0.4, fixed + sd[6] * (t / 2 + 0.3), 0.025, op.c, [120, 118, 112], { });
        }
      }
    });
  }
  // outer corner posts + foundation plinth
  [[x0, z0], [x1, z0], [x0, z1], [x1, z1]].forEach(function (p) { S.box("trim", 0.26, h, 0.26, p[0], h / 2, p[1], [150, 128, 100]); });
  S.box("trim", b.w + 0.3, 0.0, 0.0, cx, 0, z0, [0, 0, 0]);
  const pl = 0.34, pc = [150, 150, 146];
  S.box("pst", b.w + 0.46, pl, 0.24, cx, pl / 2 - 0.02, z0 - 0.02, pc); S.box("pst", b.w + 0.46, pl, 0.24, cx, pl / 2 - 0.02, z1 + 0.02, pc);
  S.box("pst", 0.24, pl, b.d + 0.46, x0 - 0.02, pl / 2 - 0.02, cz, pc); S.box("pst", 0.24, pl, b.d + 0.46, x1 + 0.02, pl / 2 - 0.02, cz, pc);

  // floor, ceiling + beams, baseboards
  S.box("floor", b.w, 0.1, b.d, cx, 0.05, cz, [255, 255, 255]);
  S.box("ceil", b.w - 0.1, 0.1, b.d - 0.1, cx, h - 0.05, cz, [255, 255, 255]);
  const nb = Math.max(2, Math.round(b.w / 1.6));
  for (let i = 0; i < nb; i++) { const x = x0 + (i + 0.5) * b.w / nb; S.box("trim", 0.14, 0.2, b.d - 0.2, x, h - 0.2, cz, [120, 96, 70]); }
  S.box("trim", b.w - 0.3, 0.12, 0.05, cx, 0.1, z0 + t / 2 + 0.03, [90, 72, 54]); S.box("trim", b.w - 0.3, 0.12, 0.05, cx, 0.1, z1 - t / 2 - 0.03, [90, 72, 54]);
  S.box("trim", 0.05, 0.12, b.d - 0.3, x0 + t / 2 + 0.03, 0.1, cz, [90, 72, 54]); S.box("trim", 0.05, 0.12, b.d - 0.3, x1 - t / 2 - 0.03, 0.1, cz, [90, 72, 54]);

  // roof
  const rb = S.get("roof");
  if (st.roof === "flat") {
    S.box("roof", b.w + 0.6, 0.28, b.d + 0.6, cx, h + 0.14, cz, [255, 255, 255], { ts: 2.4 });
    const pw = 0.22, ph = 0.38, py = h + 0.28 + ph / 2;
    S.box("roof", b.w + 0.6, ph, pw, cx, py, z0 - 0.3 + pw / 2, [215, 215, 215]); S.box("roof", b.w + 0.6, ph, pw, cx, py, z1 + 0.3 - pw / 2, [215, 215, 215]);
    S.box("roof", pw, ph, b.d + 0.6 - pw * 2, x0 - 0.3 + pw / 2, py, cz, [215, 215, 215]); S.box("roof", pw, ph, b.d + 0.6 - pw * 2, x1 + 0.3 - pw / 2, py, cz, [215, 215, 215]);
    S.box("roof", b.w + 0.2, 0.1, b.d + 0.2, cx, h + 0.31, cz, [150, 154, 150], { ts: 2.4 });
  } else {
    const rise = st.roof === "tin" ? 0.95 : Math.min(2.0, 0.34 * Math.min(b.w, b.d) + 0.6);
    rb.gable(b.w, b.d, rise, 0.55, { x: cx, y: h + 0.02, z: cz, ts: st.roof === "tin" ? 1.5 : 1.4,
      col: [255, 255, 255], endCol: [86, 66, 50], underCol: [70, 56, 44], ridgeX: b.w >= b.d });
    // ridge cap
    const rl = (b.w >= b.d ? b.w : b.d) + 1.1;
    if (b.w >= b.d) S.box("trim", rl, 0.1, 0.22, cx, h + rise + 0.05, cz, [60, 52, 46]); else S.box("trim", 0.22, 0.1, rl, cx, h + rise + 0.05, cz, [60, 52, 46]);
    b.rise = rise;
  }
  b.set = S;
  return S;
};

/* =================================================== exterior decorations */
Props.exterior = function (id, S, b) {
  const wood = [200, 168, 126], dark = [70, 58, 46];
  if (id === "cabin") {
    // stone chimney against the west wall
    const x = b.x0 - 0.5, z = -0.6, top = b.h + (b.rise || 1.4) + 0.9;
    S.box("pst", 0.8, top, 0.9, x, top / 2, z, [255, 250, 240]);
    S.box("pst", 1.0, 0.18, 1.1, x, top, z, [210, 205, 195]);
    S.box("pv", 0.5, 0.25, 0.6, x, top + 0.2, z, [40, 36, 34]);
    // woodpile (stacked logs) beside the cabin
    for (let r = 0; r < 4; r++) for (let i = 0; i < 6 - r; i++) {
      S.cyl("pw", 0.11, 0.11, 1.4, b.x1 + 0.55 + r * 0.0, 0.12 + r * 0.19, b.z0 + 0.6 + i * 0.22 + r * 0.11, [180 - i * 4, 140 - i * 3, 100], { rz: 90 }, 7);
    }
    S.box("pw", 0.06, 1.0, 1.6, b.x1 + 1.35, 0.5, b.z0 + 1.2, wood); S.box("pw", 0.06, 1.0, 1.6, b.x1 + 0.2, 0.5, b.z0 + 1.2, wood);
    // rain barrel under the south-west corner
    S.cyl("pw", 0.38, 0.4, 0.9, b.x0 + 0.2, 0, b.z1 + 0.5, [150, 120, 90], null, 14);
    S.cyl("pm", 0.4, 0.4, 0.05, b.x0 + 0.2, 0.3, b.z1 + 0.5, [60, 60, 60], null, 14); S.cyl("pm", 0.4, 0.4, 0.05, b.x0 + 0.2, 0.7, b.z1 + 0.5, [60, 60, 60], null, 14);
    S.cyl("pv", 0.34, 0.34, 0.02, b.x0 + 0.2, 0.9, b.z1 + 0.5, [20, 40, 50], null, 14);
    // stump with an axe
    S.cyl("pw", 0.32, 0.38, 0.5, b.x0 - 1.4, 0, b.z0 + 0.6, [170, 140, 100], null, 10);
    S.box("pw", 0.05, 0.7, 0.05, b.x0 - 1.4, 0.8, b.z0 + 0.6, [110, 80, 54], { rz: 15 }); S.box("pm", 0.22, 0.14, 0.04, b.x0 - 1.52, 1.08, b.z0 + 0.6, [150, 154, 158], { rz: 15 });
    // hanging lantern by the door
    S.box("pm", 0.05, 0.3, 0.05, 0.9, 2.4, b.z0 - 0.35, dark); S.glow(0xffc070, 1.4, 0.14, 0.2, 0.14, 0.9, 2.12, b.z0 - 0.5);
  } else if (id === "shed") {
    S.cyl("pm", 0.1, 0.1, 1.8, b.x0 + 0.5, b.h + 0.3, b.z0 + 0.9, [90, 94, 90], null, 8);                  // roof vent pipe
    S.cyl("pm", 0.18, 0.18, 0.1, b.x0 + 0.5, b.h + 2.1, b.z0 + 0.9, [70, 74, 70], null, 8);
    [[0, 0], [0.7, 0.2], [0.2, 0.9]].forEach(function (p, i) {                                               // fuel drums
      S.cyl("pm", 0.3, 0.3, 0.85, b.x1 + 1.0 + p[0], 0, b.z1 - 0.8 + p[1], [[150, 40, 30], [40, 80, 120], [60, 100, 60]][i], null, 14);
      S.cyl("pm", 0.31, 0.31, 0.04, b.x1 + 1.0 + p[0], 0.2, b.z1 - 0.8 + p[1], [30, 30, 30], null, 14); S.cyl("pm", 0.31, 0.31, 0.04, b.x1 + 1.0 + p[0], 0.62, b.z1 - 0.8 + p[1], [30, 30, 30], null, 14);
    });
    S.box("pm", 0.7, 0.45, 0.04, b.cx + 1.2, 2.55, b.z1 + 0.15, [230, 200, 40]);                              // hazard sign
    S.box("pv", 0.5, 0.2, 0.045, b.cx + 1.2, 2.55, b.z1 + 0.17, [30, 30, 30]);
    S.box("pm", 0.12, 3.2, 0.12, b.x1 + 0.2, 1.6, b.z0 + 0.5, [60, 62, 60]);                                  // cable conduit
    S.box("pm", 0.1, 0.1, 3.0, b.x1 + 0.2, 3.1, b.z0 + 2.0, [40, 40, 40]);
  } else if (id === "hut") {
    const x = b.x1 + 0.45, top = b.h + (b.rise || 1.5) + 0.7;
    S.box("pst", 0.7, top, 0.8, x, top / 2, b.cz + 1.0, [255, 250, 240]); S.box("pst", 0.9, 0.16, 1.0, x, top, b.cz + 1.0, [210, 205, 195]);
    // crates + satellite dish on the roof
    S.box("pw", 0.8, 0.8, 0.8, b.x0 - 0.7, 0.4, b.z1 - 0.8, [210, 180, 130]); S.box("pw", 0.7, 0.7, 0.7, b.x0 - 0.8, 1.15, b.z1 - 0.75, [190, 160, 112], { ry: 25 });
    S.box("pm", 0.1, 1.2, 0.1, b.cx - 1.5, b.h + (b.rise || 1.5) * 0.45 + 0.4, b.cz + 0.5, [60, 62, 62]);
    S.cyl("pm", 0.7, 0.05, 0.28, b.cx - 1.5, b.h + (b.rise || 1.5) * 0.45 + 1.2, b.cz + 0.3, [200, 204, 204], { rx: 65 }, 14);
  } else if (id === "radio") {
    // antenna mast with red warning lights
    S.box("pm", 0.12, 7, 0.12, b.cx + 1.8, h(b) + 3.9, b.cz - 1.2, [70, 74, 76]);
    for (let i = 0; i < 6; i++) S.box("pm", 0.5 - i * 0.06, 0.04, 0.04, b.cx + 1.8, h(b) + 1.5 + i * 1.0, b.cz - 1.2, [90, 94, 96]);
    S.box("pm", 1.2, 0.05, 0.05, b.cx + 1.8, h(b) + 6.6, b.cz - 1.2, [90, 94, 96]);
    Props._blinkLight(S, b.cx + 1.8, h(b) + 7.5, b.cz - 1.2);
    S.box("pm", 1.3, 0.9, 0.9, b.cx - 1.4, h(b) + 0.78, b.cz + 0.9, [160, 166, 168]);                         // AC unit
    S.cyl("pm", 0.34, 0.34, 0.04, b.cx - 1.4, h(b) + 1.24, b.cz + 0.9, [60, 62, 62], null, 14);
    S.cyl("pm", 0.6, 0.05, 0.22, b.cx + 0.4, h(b) + 0.9, b.cz - 0.6, [210, 214, 214], { rx: 70 }, 14);        // dish
    S.box("pm", 0.1, 0.6, 0.1, b.cx + 0.4, h(b) + 0.6, b.cz - 0.8, [70, 72, 72]);
    S.box("pm", 0.1, 3.2, 0.1, b.x1 + 0.12, 1.6, b.z1 - 0.4, [70, 72, 72]);                                    // cable conduit
  } else if (id === "obs") {
    S.cyl("pm", 0.5, 0.5, 0.6, b.cx - 1.2, h(b) + 0.3, b.cz, [150, 156, 152], null, 14);                      // periscope dome
    S.sph("pm", 0.5, 0.45, 0.5, b.cx - 1.2, h(b) + 0.9, b.cz, [160, 166, 162], null, 12, 6);
    S.box("pv", 0.3, 0.05, 0.05, b.cx - 1.2, h(b) + 1.0, b.cz - 0.5, [20, 40, 30]);
    S.box("pm", 0.8, 0.5, 0.04, b.cx + 1.0, 1.9, b.z1 + 0.14, [230, 200, 40]); S.box("pv", 0.6, 0.12, 0.045, b.cx + 1.0, 1.95, b.z1 + 0.16, [40, 40, 40]);
    S.box("pm", 0.12, 2.2, 0.12, b.x0 - 0.12, 1.1, b.z0 + 0.5, [60, 64, 62]);
  }
  function h(bb) { return bb.h + 0.34; }
};

/* a blinking red aircraft light: tiny emissive sphere + toggled glow sprite (blink in Props.update) */
Props._blinkLight = function (S, x, y, z) {
  S.glow(0xff2a18, 2.2, 0.16, 0.16, 0.16, x, y, z);
  Props.blinkers.push({ x: x, y: y, z: z, ent: null });
};

/* ============================================================ interiors */
Props.interior = function (id, S, R, V) {
  const wood = [215, 180, 135], dark = [90, 70, 52], paint = [150, 160, 150];
  const table = function (x, z, w, d, hgt, col) {          // generic table with legs, top, apron
    S.box("pw", w, 0.06, d, x, hgt - 0.03, z, col || wood);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) { S.box("pw", 0.07, hgt - 0.06, 0.07, x + s[0] * (w / 2 - 0.07), (hgt - 0.06) / 2, z + s[1] * (d / 2 - 0.07), dark); });
    S.box("pw", w - 0.2, 0.1, 0.03, x, hgt - 0.11, z - d / 2 + 0.07, dark); S.box("pw", w - 0.2, 0.1, 0.03, x, hgt - 0.11, z + d / 2 - 0.07, dark);
  };
  const chair = function (x, z, rot) {                        // rot: 0 faces -z, 180 faces +z
    const s = rot === 180 ? -1 : 1;
    S.box("pw", 0.42, 0.05, 0.42, x, 0.46, z, [190, 150, 105]);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) { S.box("pw", 0.045, 0.44, 0.045, x + p[0] * 0.18, 0.22, z + p[1] * 0.18, dark); });
    S.box("pw", 0.42, 0.36, 0.04, x, 0.72, z + s * 0.2, [190, 150, 105]);
    S.box("pw", 0.045, 0.4, 0.045, x - 0.18, 0.7, z + s * 0.2, dark); S.box("pw", 0.045, 0.4, 0.045, x + 0.18, 0.7, z + s * 0.2, dark);
  };
  const shelf = function (x, y, z, w, d, along, items) {       // wall shelf with brackets and clutter
    if (along === "x") { S.box("pw", w, 0.05, d, x, y, z, wood); S.box("pw", 0.05, 0.16, d, x - w / 2 + 0.2, y - 0.1, z, dark); S.box("pw", 0.05, 0.16, d, x + w / 2 - 0.2, y - 0.1, z, dark); }
    else { S.box("pw", d, 0.05, w, x, y, z, wood); S.box("pw", d, 0.16, 0.05, x, y - 0.1, z - w / 2 + 0.2, dark); S.box("pw", d, 0.16, 0.05, x, y - 0.1, z + w / 2 - 0.2, dark); }
  };
  const lampOn = function (x, y, z) { S.glowCyl(0xffc070, 0.9, 0.05, 0.08, x, y, z); };
  const rug = function (x, z, w, d, col) { S.box("pf", w, 0.02, d, x, 0.11, z, col); S.box("pf", w - 0.2, 0.025, d - 0.2, x, 0.115, z, Props.mul(col, 0.6)); S.box("pf", w - 0.5, 0.03, d - 0.5, x, 0.12, z, Props.mul(col, 1.15)); };
  const jar = function (x, y, z, col) { S.cyl("pv", 0.045, 0.045, 0.13, x, y, z, col, null, 8); S.cyl("pv", 0.04, 0.04, 0.02, x, y + 0.13, z, [180, 170, 140], null, 8); };
  const book = function (x, y, z, col, w, h, d) { S.box("pv", w || 0.04, h || 0.2, d || 0.15, x, y + (h || 0.2) / 2, z, col); };
  const picture = function (x, y, z, w, h, axis, col) {
    if (axis === "x") { S.box("pw", w + 0.08, h + 0.08, 0.04, x, y, z, dark); S.box("pv", w, h, 0.045, x, y, z, col || [90, 110, 120]); }
    else { S.box("pw", 0.04, h + 0.08, w + 0.08, x, y, z, dark); S.box("pv", 0.045, h, w, x, y, z, col || [90, 110, 120]); }
  };

  if (id === "cabin") {
    rug(0.0, 0.2, 2.4, 1.6, [120, 52, 46]);
    // bed: frame, mattress, blanket, pillow, headboard
    S.box("pw", 1.04, 0.26, 2.04, -2.0, 0.23, 1.2, [120, 90, 64]); S.box("pf", 0.96, 0.14, 1.96, -2.0, 0.43, 1.2, [210, 205, 190]);
    S.box("pf", 0.98, 0.07, 1.25, -2.0, 0.53, 0.78, [96, 112, 92]); S.box("pf", 0.98, 0.1, 0.1, -2.0, 0.55, 0.15, [96, 112, 92]);
    S.box("pf", 0.62, 0.12, 0.34, -2.0, 0.56, 1.95, [235, 232, 222]);
    S.box("pw", 1.1, 0.9, 0.08, -2.0, 0.45 + 0.1, 2.24, [150, 112, 80]); S.box("pw", 1.1, 0.46, 0.06, -2.0, 0.23, 0.18, [150, 112, 80]);
    // table + two chairs + oil lamp + mug
    table(1.8, -1.4, 1.2, 0.7, 0.88, [205, 170, 125]);
    chair(1.8, -0.7, 180); chair(1.1, -1.5, 0);
    S.cyl("pm", 0.06, 0.07, 0.1, 2.15, 0.88, -1.55, [150, 130, 70], null, 8); S.glow(0xffc070, 0.8, 0.06, 0.12, 0.06, 2.15, 1.04, -1.55);
    S.cyl("pv", 0.04, 0.035, 0.09, 1.5, 0.88, -1.2, [200, 200, 195], null, 8);
    // wardrobe with doors + handles (faces -z)
    S.box("pw", 0.9, 2.0, 0.6, 2.4, 1.0, 1.9, [150, 112, 80]);
    S.box("pw", 0.4, 1.85, 0.03, 2.2, 1.0, 1.58, [170, 128, 92]); S.box("pw", 0.4, 1.85, 0.03, 2.62, 1.0, 1.58, [170, 128, 92]);
    S.box("pw", 1.0, 0.1, 0.7, 2.4, 2.05, 1.9, [110, 82, 58]); S.box("pm", 0.03, 0.18, 0.04, 2.38, 1.0, 1.55, [200, 180, 80]); S.box("pm", 0.03, 0.18, 0.04, 2.46, 1.0, 1.55, [200, 180, 80]);
    // supply cabinet (metal, faces -x)
    S.box("pm", 0.5, 2.0, 1.0, 2.65, 1.0, -0.4, [96, 120, 100]); S.box("pm", 0.03, 1.8, 0.46, 2.38, 1.0, -0.65, [110, 138, 112]); S.box("pm", 0.03, 1.8, 0.46, 2.38, 1.0, -0.15, [110, 138, 112]);
    S.box("pm", 0.04, 0.3, 0.04, 2.35, 1.05, -0.4, [200, 200, 200]); S.box("pv", 0.03, 0.14, 0.2, 2.375, 1.55, -0.4, [220, 60, 50]);
    // iron wood stove (west wall, near the chimney) + pipe
    S.box("pm", 0.7, 0.8, 0.55, -2.5, 0.4, -1.8, [46, 46, 48]); S.box("pm", 0.74, 0.05, 0.6, -2.5, 0.82, -1.8, [60, 60, 62]);
    S.box("pm", 0.3, 0.3, 0.02, -2.15, 0.42, -1.8, [20, 20, 20]); S.glow(0xff7a30, 0.8, 0.22, 0.14, 0.02, -2.14, 0.42, -1.8);
    S.cyl("pm", 0.07, 0.07, 2.3, -2.5, 0.84, -1.8, [30, 30, 32], null, 8);
    // shelf with jars/books, picture, window curtain hint, coat hooks
    shelf(0.8, 1.55, -2.38, 1.4, 0.24, "x"); jar(0.4, 1.58, -2.4, [150, 80, 40]); jar(0.6, 1.58, -2.38, [90, 120, 60]); book(1.2, 1.58, -2.4, [140, 50, 44]); book(1.26, 1.58, -2.4, [60, 80, 120]); book(1.32, 1.58, -2.4, [200, 180, 100]);
    picture(-0.9, 1.7, -2.4, 0.6, 0.45, "x", [70, 94, 110]); picture(-2.89, 1.7, 0.4, 0.5, 0.4, "z", [120, 100, 70]);
    S.box("pw", 1.0, 0.06, 0.05, 2.0, 1.9, 2.45, dark); [1.6, 2.0, 2.4].forEach(function (x) { S.box("pm", 0.03, 0.12, 0.08, x, 1.84, 2.42, [60, 60, 60]); });
    S.box("pf", 0.34, 0.9, 0.12, 1.6, 1.4, 2.4, [110, 54, 40]); S.box("pf", 0.3, 0.7, 0.1, 2.15, 1.5, 2.4, [62, 74, 56]);
    lampOn(0, 2.52, 0); S.cyl("pm", 0.01, 0.01, 0.4, 0, 2.6, 0, [40, 40, 40], null, 4); S.cyl("pm", 0.22, 0.05, 0.14, 0, 2.5, 0, [120, 100, 60], null, 12);
    // checklist on the north wall (the item sits here too): board + pins
    S.box("pw", 0.6, 0.78, 0.03, 1.7, 1.5, -2.43, [170, 140, 100]);
  } else if (id === "shed") {
    // generator: frame, engine block, tank, alternator, exhaust, controls
    S.box("pm", 1.5, 0.12, 0.95, -26.3, 0.12, -18.0, [60, 64, 62]);
    S.box("pm", 1.3, 0.62, 0.8, -26.3, 0.55, -18.0, [76, 118, 80]); S.box("pm", 1.34, 0.06, 0.84, -26.3, 0.88, -18.0, [60, 96, 64]);
    S.cyl("pm", 0.3, 0.3, 0.55, -26.7, 0.9, -18.0, [150, 40, 34], { rz: 90 }, 12); S.cyl("pm", 0.05, 0.05, 0.1, -26.25, 1.34, -18.0, [30, 30, 30], null, 8);
    S.box("pm", 0.5, 0.45, 0.6, -25.75, 1.12, -18.0, [60, 64, 64]); for (let i = 0; i < 5; i++) S.box("pm", 0.5, 0.02, 0.62, -25.75, 0.95 + i * 0.08, -18.0, [30, 30, 30]);
    S.cyl("pm", 0.1, 0.1, 0.8, -26.9, 0.9, -17.6, [30, 30, 32], null, 8); S.cyl("pm", 0.13, 0.13, 0.12, -26.9, 1.7, -17.6, [20, 20, 22], null, 8);
    S.box("pm", 0.36, 0.28, 0.06, -26.3, 0.78, -17.57, [20, 20, 20]); S.glow(0x60ff90, 0.7, 0.2, 0.08, 0.02, -26.3, 0.82, -17.545);
    for (let i = 0; i < 3; i++) S.cyl("pm", 0.04, 0.04, 0.03, -26.55 + i * 0.25, 0.64, -17.6, [210, 210, 200], { rx: 90 }, 8);
    // wall control panel with dials + switches
    S.box("pm", 0.12, 0.85, 0.65, -22.6, 1.5, -17.0, [70, 78, 76]); S.box("pm", 0.03, 0.7, 0.52, -22.68, 1.5, -17.0, [40, 44, 44]);
    for (let i = 0; i < 3; i++) { S.cyl("pm", 0.07, 0.07, 0.03, -22.7, 1.65, -17.18 + i * 0.18, [210, 210, 200], { rz: 90 }, 12); S.box("pv", 0.015, 0.1, 0.012, -22.72, 1.67, -17.18 + i * 0.18, [200, 40, 30]); }
    for (let i = 0; i < 4; i++) S.box("pm", 0.04, 0.12, 0.06, -22.7, 1.28, -17.2 + i * 0.13, [200, 200, 190]);
    // charging dock crate with straps
    S.box("pw", 0.6, 0.9, 0.5, -24.2, 0.45, -18.6, [150, 135, 110]); S.box("pm", 0.64, 0.05, 0.54, -24.2, 0.9, -18.6, [60, 64, 62]); S.box("pm", 0.04, 0.9, 0.52, -24.05, 0.45, -18.6, [60, 64, 62]);
    S.box("pm", 0.16, 0.1, 0.02, -24.2, 0.7, -18.34, [60, 60, 60]); S.glow(0xff8030, 0.9, 0.1, 0.05, 0.02, -24.2, 0.7, -18.33);
    // shelves, tools, barrels, cables on floor
    S.box("pm", 1.8, 0.05, 0.36, -23.2, 1.3, -18.85, [90, 94, 90]); S.box("pm", 1.8, 0.05, 0.36, -23.2, 0.7, -18.85, [90, 94, 90]);
    [-24.0, -22.4].forEach(function (x) { S.box("pm", 0.05, 1.4, 0.36, x, 0.7, -18.85, [80, 84, 80]); });
    jar(-23.6, 1.33, -18.85, [190, 60, 40]); jar(-23.3, 1.33, -18.85, [60, 90, 150]); S.box("pm", 0.3, 0.15, 0.2, -22.9, 1.38, -18.85, [200, 100, 30]);
    S.cyl("pm", 0.22, 0.22, 0.7, -22.9, 0.0, -15.8, [150, 40, 30], null, 12);
    for (let i = 0; i < 12; i++) S.box("pv", 0.06, 0.04, 0.5, -24.5 + Math.sin(i * 0.8) * 0.5, 0.12, -16.0 + i * 0.12, [30, 30, 30], { ry: i * 8 });
    S.box("pm", 0.3, 0.5, 0.02, -25.0, 2.1, -14.95, [230, 200, 40]);
    lampOn(-25, 2.64, -17); S.cyl("pm", 0.2, 0.05, 0.1, -25, 2.55, -17, [90, 90, 90], null, 12);
  } else if (id === "hut") {
    // desk (west wall) with lamp + papers, and a table
    table(28.5, -31.5, 2.0, 0.8, 0.8, [170, 140, 100]); table(32.2, -31.5, 1.2, 0.7, 0.9, [205, 170, 125]);
    S.box("pw", 0.6, 0.55, 0.45, 27.8, 0.3, -31.1, [150, 120, 86]); S.box("pw", 0.54, 0.02, 0.05, 27.8, 0.36, -30.86, [60, 50, 40]);
    chair(28.5, -30.7, 180);
    S.cyl("pm", 0.06, 0.08, 0.04, 29.5, 0.8, -31.7, [60, 60, 60], null, 8); S.cyl("pm", 0.01, 0.01, 0.3, 29.5, 0.84, -31.7, [60, 60, 60], null, 4); S.cyl("pm", 0.1, 0.04, 0.09, 29.5, 1.1, -31.7, [60, 100, 60], null, 10);
    // shelving unit at x=26.9
    for (let i = 0; i < 4; i++) S.box("pw", 0.5, 0.06, 2.4, 26.95, 0.35 + i * 0.5, -30.0, [180, 140, 100]);
    S.box("pw", 0.5, 1.9, 0.06, 26.95, 0.95, -28.85, dark); S.box("pw", 0.5, 1.9, 0.06, 26.95, 0.95, -31.15, dark);
    for (let i = 0; i < 8; i++) book(26.8, 0.38, -29.3 - i * 0.07, [[140, 50, 44], [60, 80, 120], [80, 110, 70], [200, 180, 100]][i % 4], 0.05, 0.2 + (i % 3) * 0.03, 0.14);
    jar(26.8, 0.9, -30.3, [130, 90, 60]); jar(26.8, 0.9, -30.5, [70, 100, 70]); S.box("pw", 0.3, 0.2, 0.4, 26.9, 1.65, -30.6, [160, 130, 90]);
    // pinned map board + pictures on the north wall
    S.box("pw", 1.5, 1.0, 0.04, 31.0, 1.6, -32.45, [170, 140, 100]); S.box("pv", 1.38, 0.88, 0.045, 31.0, 1.6, -32.44, [200, 188, 150]);
    for (let i = 0; i < 5; i++) S.box("pv", 0.01, 0.01, 0.05, 30.5 + i * 0.25, 1.55 + (i % 2) * 0.2, -32.42, [200, 40, 40]);
    S.box("pv", 0.9, 0.012, 0.05, 31.0, 1.6, -32.41, [180, 40, 40], { rz: 24 });
    rug(30.2, -29.8, 2.2, 1.8, [70, 80, 100]);
    S.box("pm", 1.1, 0.6, 0.5, 29.0, 0.3, -28.2, [110, 118, 112]);                                               // equipment case
    lampOn(30, 2.64, -30);
  } else if (id === "radio") {
    // operating desk + transmitter rack + dial + screen
    table(45, 11.5, 3.0, 0.8, 1.0, [90, 96, 92]);
    S.box("pm", 1.3, 0.55, 0.5, 45, 1.3, 11.5, [58, 76, 62]);
    for (let i = 0; i < 6; i++) S.box("pm", 1.1, 0.02, 0.02, 45, 1.1 + i * 0.09, 11.24, [30, 30, 30]);
    for (let i = 0; i < 5; i++) S.cyl("pm", 0.035, 0.035, 0.03, 44.6 + i * 0.2, 1.38, 11.24, [210, 210, 200], { rx: 90 }, 10);
    S.cyl("pm", 0.3, 0.3, 0.06, 44.4, 1.4, 11.2, [180, 140, 70], { rx: 90 }, 18); S.cyl("pm", 0.22, 0.22, 0.02, 44.4, 1.4, 11.15, [30, 30, 30], { rx: 90 }, 18); S.box("pv", 0.02, 0.18, 0.015, 44.4, 1.43, 11.13, [230, 60, 40]);
    S.box("pm", 0.74, 0.5, 0.06, 46.4, 1.45, 11.75, [30, 34, 32]);                                                  // screen housing (screen glow = R.screen)
    S.cyl("pm", 0.04, 0.04, 0.2, 46.4, 1.0, 11.75, [50, 50, 50], null, 8);
    S.box("pm", 0.5, 0.03, 0.16, 46.1, 1.0, 11.3, [30, 30, 30]);                                                    // keyboard
    chair(45.0, 10.6, 180);
    S.box("pm", 0.1, 0.3, 0.2, 47.9, 0.5, 10, [34, 34, 34]);
    // wall of equipment racks (east) + antenna cables + map
    S.box("pm", 0.7, 2.0, 1.2, 47.5, 1.0, 12.1, [48, 54, 52]);
    for (let i = 0; i < 8; i++) { S.box("pm", 0.04, 0.12, 1.0, 47.12, 0.4 + i * 0.22, 12.1, [26, 26, 28]); S.glow(i % 3 ? 0x40ff70 : 0xffb040, 1.2, 0.012, 0.03, 0.03, 47.14, 0.4 + i * 0.22, 11.75 + (i % 4) * 0.15); }
    S.box("pv", 1.2, 0.8, 0.03, 43.0, 1.6, 12.4, [130, 150, 130]);
    for (let i = 0; i < 14; i++) S.box("pv", 0.05, 0.03, 0.4, 43.4 + Math.sin(i) * 0.4, 0.12, 8.6 + i * 0.08, [26, 26, 26], { ry: i * 9 });
    lampOn(45, 2.64, 10.8);
  } else if (id === "obs") {
    S.box("pm", 1.4, 1.2, 0.6, 10, 0.6, -71.4, [40, 52, 46]); S.box("pm", 1.5, 0.06, 0.7, 10, 1.22, -71.4, [60, 70, 64]);
    S.box("pm", 1.04, 0.64, 0.08, 10, 1.4, -71.6, [14, 22, 18]);
    for (let i = 0; i < 4; i++) S.box("pm", 0.3, 0.1, 0.02, 9.6 + i * 0.26, 0.85, -71.08, [26, 34, 30]);
    S.box("pm", 0.5, 0.03, 0.18, 10, 1.25, -71.1, [20, 26, 24]);
    // metal bunk, lockers, map table, hanging cables
    S.box("pm", 0.9, 0.12, 1.9, 8.0, 0.45, -70.4, [60, 64, 62]); S.box("pf", 0.84, 0.1, 1.84, 8.0, 0.55, -70.4, [90, 96, 84]);
    [[7.6, -69.5], [7.6, -71.3], [8.4, -69.5], [8.4, -71.3]].forEach(function (p) { S.box("pm", 0.05, 0.4, 0.05, p[0], 0.2, p[1], [50, 50, 50]); });
    for (let i = 0; i < 3; i++) { S.box("pm", 0.5, 1.8, 0.5, 12.0, 0.9, -68.6 - i * 0.5, [70, 84, 90]); S.box("pm", 0.02, 1.5, 0.3, 11.74, 0.95, -68.6 - i * 0.5, [50, 62, 66]); }
    S.box("pv", 1.6, 0.06, 1.1, 12.2, 0.9, -70.8, [60, 64, 60]); table(12.2, -70.8, 1.4, 1.0, 0.9, [80, 88, 84]);
    S.box("pv", 0.9, 0.012, 0.6, 12.2, 0.93, -70.8, [150, 170, 150]);
    for (let i = 0; i < 10; i++) S.box("pv", 0.04, 0.03, 0.5, 9 + Math.cos(i) * 0.8, 0.12, -68.6 - i * 0.1, [20, 20, 20], { ry: i * 17 });
    lampOn(10, 2.64, -70); S.cyl("pm", 0.2, 0.05, 0.1, 10, 2.55, -70, [70, 74, 70], null, 12);
  }
};

/* ====================================================== blink animation */
Props.update = function (dt, cam) {
  const t = World.time;
  for (let i = 0; i < Props.blinkers.length; i++) {
    const b = Props.blinkers[i];
    if (b.glow) b.glow.enabled = ((t * 0.7) % 1) < 0.25;
  }
  void dt; void cam;
};
