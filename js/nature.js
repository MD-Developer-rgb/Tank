"use strict";
/* ============================================================================
   THE LAST FIVE NIGHTS - nature.js
   Terrain with a stream channel, dirt paths, water, forest (merged tree meshes),
   undergrowth (grass cards, ferns, rocks, logs, glowing mushrooms), rain
   streaks and ground mist.
   NOTE: nothing touches `pc` at load time, only inside functions.
   Created by MD Developer
   ============================================================================ */
const Nature = { chunks: [], water: null, mist: [], rain: null, treeMeshes: [], _cullT: 0 };

/* ------------------------------------------------------------ terrain height */
/* the stream channel is the only relief; bridges stay level */
Nature.channelDepth = function (x, z) {
  const s = World.stream, cz = (s.z0 + s.z1) / 2, dz = Math.abs(z - cz);
  if (dz > 3.2 || x < s.x0 - 3 || x > s.x1 + 3) return 0;
  const edgeX = Math.min(1, Math.max(0, Math.min(x - s.x0 + 3, s.x1 + 3 - x) / 3));
  const k = 1 - Gfx.N.sstep(1.35, 3.0, dz);
  return -0.42 * k * edgeX;
};
World.groundY = function (x, z) {
  if (World.onBridge && World.onBridge(x, z)) return 0;
  return Nature.channelDepth(x, z);
};

/* ----------------------------------------------------------------- terrain */
Nature.buildTerrain = function () {
  const B = new Gfx.Builder(5), N = Gfx.N;
  const xs = [], zs = [];
  for (let x = -100; x <= 124; x += 4) xs.push(x);
  for (let z = -106; z < -17; z += 6) zs.push(z);
  for (let z = -17; z <= -3; z += 0.5) zs.push(z);
  for (let z = 3; z <= 96; z += 6) zs.push(z);
  const nx = xs.length, nz = zs.length, P = [], U = [], C = [], I = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = xs[i], z = zs[j];
    P.push(x, Nature.channelDepth(x, z), z); U.push(x / 4.5, z / 4.5);
    const a = N.fbm((x + 200) / 70, (z + 200) / 70, 4, 4, 9), b = N.fbm((x + 90) / 24, (z + 90) / 24, 8, 3, 21);
    const dry = N.sstep(0.5, 0.75, b), k = 0.72 + 0.5 * a;
    // greens with the odd dry/brown patch; wet banks darker
    const wet = Nature.channelDepth(x, z) < -0.05 ? 0.55 : 1;
    C.push(Math.min(255, (150 + dry * 70) * k * wet), Math.min(255, (178 - dry * 20) * k * wet), Math.min(255, (140 - dry * 40) * k * wet), 255);
  }
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    I.push(a, c, b, b, c, d);
  }
  const Nn = new Array(P.length).fill(0);
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const px = uy * vz - uz * vy, py = uz * vx - ux * vz, pz = ux * vy - uy * vx;
    [a, b, c].forEach(k => { Nn[k] += px; Nn[k + 1] += py; Nn[k + 2] += pz; });
  }
  for (let v = 0; v < P.length / 3; v++) {
    const l = Math.hypot(Nn[v * 3], Nn[v * 3 + 1], Nn[v * 3 + 2]) || 1, sg = Nn[v * 3 + 1] < 0 ? -1 : 1;
    B.p.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); B.n.push(sg * Nn[v * 3] / l, sg * Nn[v * 3 + 1] / l, sg * Nn[v * 3 + 2] / l);
    B.uv.push(U[v * 2], U[v * 2 + 1]); B.c.push(C[v * 4], C[v * 4 + 1], C[v * 4 + 2], 255);
  }
  I.forEach(i => B.i.push(i));
  B.count = P.length / 3;
  const mesh = B.build("terrain");
  const m = Gfx.mat({ tex: "grass", vc: true, tint: 0xffffff, bump: 1.4, gloss: 0.12, tile: [1, 1], size: 256 });
  const e = Gfx.meshEntity(World.root, mesh, m, { name: "ground", recv: true });
  e.mi.cull = false;
  Nature.ground = e;
};

/* ------------------------------------------------------------------- water */
Nature.buildWater = function () {
  const s = World.stream, B = new Gfx.Builder(2), y = -0.13, cz = (s.z0 + s.z1) / 2, hw = 1.75;
  const x0 = s.x0 - 2, x1 = s.x1 + 2, Lx = x1 - x0, ts = 3;
  B._add([x0, y, cz - hw, x1, y, cz - hw, x1, y, cz + hw, x0, y, cz + hw], [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], [0, 0, Lx / ts, 0, Lx / ts, 2 * hw / ts, 0, 2 * hw / ts], [0, 2, 1, 0, 3, 2], {});
  const m = Gfx.mat({ tex: "water", tint: 0x4a7a96, bump: 1.2, gloss: 0.96, spec: 0.5, op: 0.8, em: 0x061a26, emI: 0.6, tile: [1, 1] });
  const e = Gfx.meshEntity(World.root, B.build("water"), m, { name: "stream", recv: false });
  e.mi.cull = false;
  Nature.water = { e: e, m: m };
  // river bed stones along the banks + a few boulders
  const SB = new Gfx.Builder(11), r = World.rng(77);
  for (let i = 0; i < 70; i++) {
    const x = s.x0 + r() * (s.x1 - s.x0), side = r() < 0.5 ? -1 : 1, z = cz + side * (1.45 + r() * 0.5), sc = 0.2 + r() * 0.35;
    SB.sphere(sc, sc * 0.6, sc * 0.8, 7, 5, { x: x, y: -0.3 + sc * 0.2, z: z, jit: 0.45, ry: r() * 360, col: [120 + r() * 40, 124 + r() * 40, 118 + r() * 36], uvRect: [0, 0, 1, 1] });
  }
  const rm = SB.build("bankrocks");
  if (rm) Gfx.meshEntity(World.root, rm, Gfx.mat({ tex: "stone", vc: true, tint: 0xffffff, bump: 1.4, gloss: 0.3, tile: [1, 1] }), { name: "bankrocks" });
};

/* ------------------------------------------------------------------- paths */
Nature.buildPaths = function (edges) {
  const B = new Gfx.Builder(3), hw = 1.15;
  const addSeg = function (ax, az, bx, bz, v0) {
    const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, nx = -dz / l * hw, nz = dx / l * hw, y = 0.022;
    const ts = 4, v1 = v0 + l / ts;
    B._add([ax - nx, y, az - nz, ax + nx, y, az + nz, bx + nx, y, bz + nz, bx - nx, y, bz - nz], [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
      [0, v0, 1, v0, 1, v1, 0, v1], [0, 2, 1, 0, 3, 2], { col: [255, 255, 255] });
    return v1;
  };
  edges.forEach(function (e) {
    const a = World.nodes[e.a], b = World.nodes[e.b], steps = Math.max(1, Math.round(e.len / 3));
    let v = Math.abs(a.x * 0.173 + a.z * 0.311) % 7;
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps, t1 = (i + 1) / steps, x0 = a.x + (b.x - a.x) * t0, z0 = a.z + (b.z - a.z) * t0, x1 = a.x + (b.x - a.x) * t1, z1 = a.z + (b.z - a.z) * t1;
      const mz = (z0 + z1) / 2, mx = (x0 + x1) / 2;
      if (mz > World.stream.z0 - 2.3 && mz < World.stream.z1 + 2.3 && mx > World.stream.x0 - 3 && mx < World.stream.x1 + 3) { v += 3 / 4; continue; }
      v = addSeg(x0, z0, x1, z1, v);
    }
  });
  const mesh = B.build("paths");
  if (!mesh) return;
  const m = Gfx.mat({ tex: "path", tint: 0xffffff, bump: 1, gloss: 0.08, alphaMode: "blend", tile: [1, 1] });
  const e = Gfx.meshEntity(World.root, mesh, m, { name: "paths", recv: true });
  e.mi.cull = false;
  Nature.paths = e;
};

/* flat decals: gravel yard, clearing circle, road asphalt */
Nature.buildDecals = function () {
  const B = new Gfx.Builder(9), A = new Gfx.Builder(10), G = new Gfx.Builder(12);
  const rect = function (bd, x0, z0, x1, z1, y, ts, col) {
    bd._add([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1], [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], [x0 / ts, z0 / ts, x1 / ts, z0 / ts, x1 / ts, z1 / ts, x0 / ts, z1 / ts], [0, 2, 1, 0, 3, 2], { col: col || [255, 255, 255] });
  };
  rect(B, -8, -7, 8, -2.5, 0.02, 3, [190, 175, 150]);                        // yard gravel
  rect(A, 50, 39, 94, 45, 0.024, 4);                                         // service road asphalt
  // clearing: grass cut + a rim of glowing moss ring
  const cx = -55, cz = 20, seg = 40;
  const P = [], U = [], I = [];
  P.push(cx, 0.026, cz); U.push(0.5, 0.5);
  for (let i = 0; i <= seg; i++) { const a = i / seg * 6.2832; P.push(cx + Math.cos(a) * 6.3, 0.026, cz + Math.sin(a) * 6.3); U.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5); }
  for (let i = 0; i < seg; i++) I.push(0, i + 2, i + 1);
  G._add(P, [].concat.apply([], P.map(() => [0, 1, 0])), U, I, { col: [200, 200, 200] });
  const gm = G.build("clearing");
  if (gm) { const e = Gfx.meshEntity(World.root, gm, Gfx.mat({ tex: "dirt", vc: true, tint: 0x9a9080, bump: 1, gloss: 0.1, tile: [3, 3] }), { name: "clearing_disc" }); e.mi.cull = false; }
  const yb = B.build("yard"); if (yb) Gfx.meshEntity(World.root, yb, Gfx.mat({ tex: "dirt", vc: true, tint: 0xb0a590, bump: 1.2, gloss: 0.1 }), { name: "yard" });
  const ab = A.build("road"); if (ab) Gfx.meshEntity(World.root, ab, Gfx.mat({ tex: "asphalt", vc: true, tint: 0xffffff, bump: 1, gloss: 0.3, spec: 0.12 }), { name: "road" });
  // road markings
  const M = new Gfx.Builder(14);
  for (let x = 51; x < 93; x += 4) M._add([x, 0.03, 41.9, x + 2, 0.03, 41.9, x + 2, 0.03, 42.1, x, 0.03, 42.1], [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], [0, 0, 1, 0, 1, 1, 0, 1], [0, 2, 1, 0, 3, 2], { col: [210, 190, 90] });
  const mm = M.build("markings"); if (mm) Gfx.meshEntity(World.root, mm, Gfx.mat({ tint: 0xffffff, vc: true, gloss: 0.2 }), { name: "markings" });
};

/* ------------------------------------------------------------------ trees */
Nature._hashFn = function (v) { const s = Math.sin(v * 12.9898) * 43758.5453; return s - Math.floor(s); };

Nature._treeBuilders = {
  pine: function (B, r, o) {
    const H = o.h, tiers = o.tiers, R = o.r, dr = o.droop, lean = (r() - 0.5) * 0.4;
    B.cyl(0.28 * o.k, 0.06 * o.k, H * 0.97, 7, { uRange: [0.02, 0.48], jit: 0.12, col: [72, 54, 42], x: 0, y: 0, z: 0, rz: lean, cap: false, vary: 0.1 });
    for (let i = 0; i < 6; i++) {            // dead lower branch stubs
      const y = 1.2 + i * 0.5 + r() * 0.3, a = r() * 360;
      B.cyl(0.04, 0.015, 0.8 + r() * 0.5, 4, { x: 0, y: y, z: 0, ry: a, rz: 70 + r() * 10, uRange: [0.02, 0.48], col: [76, 58, 44], cap: false });
    }
    for (let i = 0; i < tiers; i++) {
      const t = i / (tiers - 1), y = H * (0.17 + 0.74 * t), rr = R * (1 - 0.82 * t) * (0.88 + r() * 0.24), hh = H * (0.19 - 0.05 * t);
      const base = Nature._pineCol(o.tone, r);
      B.tier(rr, hh, 10, { x: lean * y * 0.4, y: y, z: 0, ry: r() * 360, jag: 0.28, droop: rr * dr, uvRect: [0.5, 0, 0.5, 2.5], vary: 0.08,
        col: function (yy, v) { const k = Nature._hashFn(v + i * 7) * 0.5 + 0.75, h = Math.min(1, Math.max(0, (yy - y) / hh)); return [base[0] * k * (0.6 + 0.6 * h), base[1] * k * (0.6 + 0.6 * h), base[2] * k * (0.6 + 0.6 * h)]; } });
    }
    B.cyl(0.14, 0.0, H * 0.14, 6, { x: lean * H * 0.4, y: H * 0.93, z: 0, uvRect: null, col: [40, 90, 56], uRange: [0.5, 1], cap: false });
  },
  broad: function (B, r, o) {
    const H = o.h, k = o.k, pale = o.pale;
    const trunk = pale ? [190, 184, 170] : [96, 74, 56];
    B.cyl(0.24 * k, 0.1 * k, H * 0.62, 7, { uRange: [0.02, 0.48], jit: 0.14, col: trunk, cap: false, vary: 0.08 });
    const nb = 4 + Math.floor(r() * 3);
    for (let i = 0; i < nb; i++) {                                         // limbs
      const a = i / nb * 360 + r() * 40, y = H * (0.36 + r() * 0.2);
      B.cyl(0.09 * k, 0.03 * k, H * 0.34, 5, { x: 0, y: y, z: 0, ry: a, rz: 52 + r() * 16, uRange: [0.02, 0.48], col: trunk, cap: false });
    }
    const tone = Nature._leafCol(o.tone, r);
    const clumps = 7 + Math.floor(r() * 4);
    for (let i = 0; i < clumps; i++) {
      const a = r() * 6.2832, d = r() * H * 0.28, y = H * (0.62 + r() * 0.3), sz = H * (0.17 + r() * 0.1);
      B.sphere(sz, sz * 0.78, sz, 8, 6, { x: Math.cos(a) * d, y: y, z: Math.sin(a) * d, jit: 0.5, uvRect: [0.5, 0, 0.5, 1.5], vary: 0.1,
        col: function (yy, v) { const h = Math.min(1, Math.max(0, (yy - H * 0.45) / (H * 0.6))), q = Nature._hashFn(v + i * 3) * 0.45 + 0.7; return [tone[0] * q * (0.55 + 0.6 * h), tone[1] * q * (0.55 + 0.6 * h), tone[2] * q * (0.55 + 0.6 * h)]; } });
    }
  },
  dead: function (B, r, o) {
    const H = o.h, k = o.k;
    B.cyl(0.3 * k, 0.05 * k, H, 6, { uRange: [0.02, 0.48], jit: 0.18, col: [78, 70, 64], cap: false, rz: (r() - 0.5) * 6 });
    const nb = 9;
    for (let i = 0; i < nb; i++) {
      const y = H * (0.3 + r() * 0.62), a = r() * 360, L = (H * 0.28) * (1 - (y / H) * 0.5) * (0.6 + r() * 0.6);
      B.cyl(0.07 * k, 0.01, L, 4, { x: 0, y: y, z: 0, ry: a, rz: 48 + r() * 30, uRange: [0.02, 0.48], col: [72, 64, 58], cap: false });
      if (r() < 0.6) B.cyl(0.035 * k, 0.005, L * 0.55, 4, { x: Math.sin(a * 0.0174) * L * 0.55, y: y + L * 0.55 * 0.6, z: Math.cos(a * 0.0174) * L * 0.55, ry: a + 30 + r() * 40, rz: 40 + r() * 30, uRange: [0.02, 0.48], col: [72, 64, 58], cap: false });
    }
  }
};
Nature._pineCol = function (tone, r) { return tone === 0 ? [20, 52, 34] : (tone === 1 ? [26, 66, 40] : [18, 44, 36]); };
Nature._leafCol = function (tone, r) { return tone === 0 ? [44, 84, 40] : (tone === 1 ? [70, 92, 36] : [34, 70, 46]); };

Nature.buildTreeMeshes = function () {
  const r = World.rng(4242), mk = function (kind, o, seed) {
    const B = new Gfx.Builder(seed);
    Nature._treeBuilders[kind](B, r, o);
    return B;
  };
  const M = Nature.treeMeshes;
  M.push({ type: 0, b: mk("pine", { h: 9.5, tiers: 7, r: 2.1, droop: 0.28, k: 1.1, tone: 0 }, 1) });
  M.push({ type: 0, b: mk("pine", { h: 8.0, tiers: 6, r: 2.3, droop: 0.35, k: 1.0, tone: 1 }, 2) });
  M.push({ type: 0, b: mk("pine", { h: 11.5, tiers: 8, r: 2.0, droop: 0.2, k: 1.2, tone: 2 }, 3) });
  M.push({ type: 0, b: mk("pine", { h: 6.0, tiers: 5, r: 1.9, droop: 0.3, k: 0.9, tone: 0 }, 4) });
  M.push({ type: 0, b: mk("pine", { h: 13.0, tiers: 9, r: 2.2, droop: 0.25, k: 1.3, tone: 1 }, 10) });
  M.push({ type: 1, b: mk("broad", { h: 8.0, k: 1.1, tone: 0, pale: false }, 5) });
  M.push({ type: 1, b: mk("broad", { h: 7.0, k: 0.9, tone: 1, pale: true }, 6) });
  M.push({ type: 1, b: mk("broad", { h: 9.0, k: 1.3, tone: 2, pale: false }, 7) });
  M.push({ type: 2, b: mk("dead", { h: 7.0, k: 1.0 }, 8) });
  M.push({ type: 2, b: mk("dead", { h: 5.2, k: 0.9 }, 9) });
  M.push({ type: 3, b: mk("pine", { h: 3.4, tiers: 4, r: 1.3, droop: 0.3, k: 0.6, tone: 1 }, 11) });
  M.push({ type: 3, b: mk("pine", { h: 2.6, tiers: 4, r: 1.1, droop: 0.25, k: 0.5, tone: 0 }, 12) });
  Nature.treeMat = Gfx.mat({ tex: "treeatlas", vc: true, tint: 0xffffff, bump: 1.4, gloss: 0.02, spec: 0.02, tile: [1, 1], size: 256 });
  Nature.treeCells = {};
};

/* trees are merged into 32 m cells (one mesh per cell and quality layer) so a dense forest stays cheap */
Nature.addTree = function (x, z, scale, type, rnd, layer) {
  const list = Nature.treeMeshes.filter(m => m.type === type), pick = list[Math.floor(rnd() * list.length)];
  const key = Math.floor(x / 32) + "," + Math.floor(z / 32) + "," + layer;
  let c = Nature.treeCells[key];
  if (!c) c = Nature.treeCells[key] = { b: new Gfx.Builder(Math.floor(rnd() * 99999)), cx: (Math.floor(x / 32) + 0.5) * 32, cz: (Math.floor(z / 32) + 0.5) * 32, layer: layer };
  c.b.append(pick.b, x, 0, z, scale, scale * (0.9 + rnd() * 0.25), rnd() * 360);
};
Nature.flushTrees = function () {
  for (const k in Nature.treeCells) {
    const c = Nature.treeCells[k], mesh = c.b.build("trees");
    if (!mesh) continue;
    const e = Gfx.meshEntity(World.root, mesh, Nature.treeMat, { name: "trees", shadow: false });
    Nature.chunks.push({ e: e, kind: "tree", x: c.cx, z: c.cz, vis: true, layer: c.layer, on: true });
  }
  Nature.treeCells = {};
};
Nature.setTreeLayers = function (q) {
  const Q = CFG.QUALITY[q] || CFG.QUALITY.MEDIUM;
  for (let i = 0; i < Nature.chunks.length; i++) {
    const c = Nature.chunks[i];
    if (c.kind !== "tree") continue;
    c.on = c.layer === 0 || (c.layer === 1 && Q.trees >= 300) || (c.layer === 2 && Q.trees >= 400);
    c.e.enabled = c.on && c.vis;
  }
};

/* ------------------------------------------------------- undergrowth chunks */
Nature._cellKey = function (x, z) { return Math.floor(x / 24) + "," + Math.floor(z / 24); };

Nature.buildUndergrowth = function (blocked, nearPath, placeBushes) {
  const r = World.rng(909), Bd = CFG.BOUNDS, cells = {};
  const cell = function (kind, x, z) {
    const k = kind + Nature._cellKey(x, z);
    if (!cells[k]) cells[k] = { kind: kind, b: new Gfx.Builder(Math.floor(r() * 99999)), cx: (Math.floor(x / 24) + 0.5) * 24, cz: (Math.floor(z / 24) + 0.5) * 24, n: 0 };
    return cells[k];
  };
  const inB = (x, z) => x > Bd.minX + 1 && x < Bd.maxX - 1 && z > Bd.minZ + 1 && z < Bd.maxZ - 1;
  const free = function (x, z) {
    if (!inB(x, z)) return false;
    if (World.inStream(x, z) || (z > World.stream.z0 - 1.2 && z < World.stream.z1 + 1.2 && x > World.stream.x0 - 3 && x < World.stream.x1 + 3 && !World.onBridge(x, z))) return false;
    for (let i = 0; i < World.buildings.length; i++) { const b = World.buildings[i]; if (x > b.x0 - 0.8 && x < b.x1 + 0.8 && z > b.z0 - 0.8 && z < b.z1 + 0.8) return false; }
    return true;
  };
  let guard = 0, n;
  // grass tufts (alpha cards)
  const tuftN = 3400;
  for (n = 0; n < tuftN && guard < tuftN * 12; guard++) {
    const x = Bd.minX + 2 + r() * (Bd.maxX - Bd.minX - 4), z = Bd.minZ + 2 + r() * (Bd.maxZ - Bd.minZ - 4);
    if (!free(x, z) || nearPath(x, z, 0.9)) continue;
    n++;
    const c = cell("grass", x, z), sc = 0.7 + r() * 0.8, sh = 0.7 + r() * 0.5, dry = r() < 0.25;
    const col = dry ? [150 * sh, 140 * sh, 90 * sh] : [110 * sh, 150 * sh, 90 * sh];
    for (let k = 0; k < 3; k++) c.b.card(0.9 * sc, 0.75 * sc, { x: x, y: 0, z: z, ry: k * 60 + r() * 40, col: col, bend: (r() - 0.5) * 0.25 });
    c.n++;
  }
  // ferns
  for (n = 0, guard = 0; n < 380 && guard < 4000; guard++) {
    const x = Bd.minX + 2 + r() * (Bd.maxX - Bd.minX - 4), z = Bd.minZ + 2 + r() * (Bd.maxZ - Bd.minZ - 4);
    if (!free(x, z) || nearPath(x, z, 1.4)) continue;
    n++;
    const c = cell("fern", x, z), sc = 0.8 + r() * 0.7, sh = 0.7 + r() * 0.4;
    for (let k = 0; k < 3; k++) c.b.card(1.3 * sc, 1.0 * sc, { x: x, y: 0, z: z, ry: k * 60 + r() * 30, col: [100 * sh, 150 * sh, 90 * sh], bend: 0 });
  }
  // rocks
  for (n = 0, guard = 0; n < 190 && guard < 4000; guard++) {
    const x = Bd.minX + 2 + r() * (Bd.maxX - Bd.minX - 4), z = Bd.minZ + 2 + r() * (Bd.maxZ - Bd.minZ - 4);
    if (!free(x, z) || nearPath(x, z, 1.3)) continue;
    n++;
    const c = cell("rock", x, z), sc = 0.25 + Math.pow(r(), 2.2) * 0.9, g = 105 + r() * 50;
    c.b.sphere(sc, sc * (0.5 + r() * 0.3), sc * (0.7 + r() * 0.3), 7, 5, { x: x, y: sc * 0.12, z: z, jit: 0.4, ry: r() * 360, col: [g, g * 1.0, g * 0.95], uvRect: [0, 0, 1, 1] });
    if (r() < 0.5) c.b.sphere(sc * 0.5, sc * 0.3, sc * 0.45, 6, 4, { x: x + sc * 0.9, y: sc * 0.04, z: z + sc * 0.3, jit: 0.4, col: [g * 0.9, g * 0.9, g * 0.88], uvRect: [0, 0, 1, 1] });
    // moss on top
    if (r() < 0.6) c.b.sphere(sc * 0.8, sc * 0.18, sc * 0.7, 6, 3, { x: x, y: sc * 0.46, z: z, jit: 0.3, col: [60, 92, 50], uvRect: [0, 0, 1, 1] });
  }
  // fallen logs + stumps (bark atlas)
  for (n = 0, guard = 0; n < 46 && guard < 3000; guard++) {
    const x = Bd.minX + 4 + r() * (Bd.maxX - Bd.minX - 8), z = Bd.minZ + 4 + r() * (Bd.maxZ - Bd.minZ - 8);
    if (!free(x, z) || blocked(x, z)) continue;
    n++;
    const c = cell("log", x, z), rad = 0.18 + r() * 0.2, ang = r() * 360;
    if (r() < 0.55) {
      const L = 2.4 + r() * 3.2;
      c.b.cyl(rad, rad * 0.8, L, 7, { x: x, y: rad * 0.85, z: z, ry: ang, rz: 90, uRange: [0.02, 0.48], col: [92, 72, 56], cap: true, jit: 0.1 });
      for (let k = 0; k < 3; k++) c.b.sphere(rad * 1.4, rad * 0.3, rad * 1.4, 5, 3, { x: x + (r() - 0.5) * L * 0.7, y: rad * 1.5, z: z + (r() - 0.5) * L * 0.5, jit: 0.2, col: [58, 94, 52], uvRect: [0.5, 0, 0.5, 1] });
    } else {
      const h = 0.35 + r() * 0.5;
      c.b.cyl(rad * 1.5, rad * 1.1, h, 8, { x: x, y: 0, z: z, uRange: [0.02, 0.48], col: [100, 78, 60], jit: 0.2 });
      c.b.sphere(rad * 1.3, rad * 0.3, rad * 1.3, 6, 3, { x: x, y: h, z: z, col: [150, 120, 84], uvRect: [0, 0, 0.5, 1] });
    }
  }
  // bushes (also the hiding places): merged as dense leafy clumps
  const bushSpots = [];
  const bush = function (x, z, s) {
    const c = cell("bush", x, z);
    for (let k = 0; k < 6; k++) {
      const a = r() * 6.2832, d = r() * 0.55 * s, sz = (0.5 + r() * 0.35) * s;
      c.b.sphere(sz, sz * 0.7, sz, 7, 5, { x: x + Math.cos(a) * d, y: sz * 0.55, z: z + Math.sin(a) * d, jit: 0.45, uvRect: [0.5, 0, 0.5, 1.5],
        col: function (yy, v) { const q = Nature._hashFn(v + k * 5) * 0.5 + 0.7, h = Math.min(1, yy / (s * 1.1)); return [48 * q * (0.6 + 0.7 * h), 86 * q * (0.6 + 0.7 * h), 44 * q * (0.6 + 0.7 * h)]; } });
    }
    bushSpots.push([x, z]);
  };
  Nature.bush = bush;

  // glowing fungus (eerie, tiny, emissive)
  const F = { kind: "fungus", b: new Gfx.Builder(808), n: 0 };
  for (n = 0, guard = 0; n < 34 && guard < 3000; guard++) {
    const x = Bd.minX + 4 + r() * (Bd.maxX - Bd.minX - 8), z = Bd.minZ + 4 + r() * (Bd.maxZ - Bd.minZ - 8);
    if (!free(x, z) || blocked(x, z) || nearPath(x, z, 2.0)) continue;
    n++;
    for (let k = 0; k < 4; k++) { const dx = (r() - 0.5) * 0.5, dz = (r() - 0.5) * 0.5, s = 0.035 + r() * 0.05;
      F.b.cyl(s * 0.3, s * 0.3, s * 2.4, 5, { x: x + dx, y: 0, z: z + dz, col: [210, 220, 220], cap: false });
      F.b.sphere(s * 1.9, s * 0.9, s * 1.9, 7, 4, { x: x + dx, y: s * 2.4, z: z + dz, col: [60, 255, 200] }); }
  }

  if (placeBushes) placeBushes(bush);

  // flush chunks into entities
  const mats = {
    grass: Gfx.mat({ tex: "grasscard", vc: true, tint: 0xffffff, alphaMode: "test", alphaTest: 0.5, cull: "none", noNormal: true, gloss: 0.04, tile: [1, 1] }),
    fern: Gfx.mat({ tex: "fern", vc: true, tint: 0xffffff, alphaMode: "test", alphaTest: 0.5, cull: "none", noNormal: true, gloss: 0.04, tile: [1, 1] }),
    rock: Gfx.mat({ tex: "stone", vc: true, tint: 0xffffff, bump: 1.4, gloss: 0.2, tile: [1, 1] }),
    log: Nature.treeMat, bush: Nature.treeMat
  };
  for (const k in cells) {
    const c = cells[k], mesh = c.b.build(c.kind);
    if (!mesh) continue;
    const e = Gfx.meshEntity(World.root, mesh, mats[c.kind], { name: c.kind + "_chunk", recv: true });
    Nature.chunks.push({ e: e, kind: c.kind, x: c.cx, z: c.cz, vis: true });
  }
  const fm = F.b.build("fungus");
  if (fm) {
    const e = Gfx.meshEntity(World.root, fm, Gfx.mat({ tint: 0x000000, em: 0x4fd8b0, emI: 0.45, noNormal: true, vc: false }), { name: "fungus", recv: false });
    e.mi.cull = false;
  }
  return bushSpots;
};

/* --------------------------------------------------------------- mist + sky */
Nature.buildMist = function () {
  const mk = function (y, size, alpha, tile, tint) {
    const B = new Gfx.Builder(30 + y), h = size / 2;
    B._add([-h, 0, -h, h, 0, -h, h, 0, h, -h, 0, h], [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], [0, 0, tile, 0, tile, tile, 0, tile], [0, 2, 1, 0, 3, 2], {});
    const m = Gfx.mat({ tex: "mist", tint: tint, alphaMode: "blend", noNormal: true, unlit: true, cull: "none", op: alpha, tile: [1, 1] });
    const e = Gfx.meshEntity(World.root, B.build("mist"), m, { name: "mist", recv: false, y: y, x: 0, z: 0 });
    e.mi.cull = false; e.mi.drawBucket = 130;
    return { e: e, m: m, y: y, sp: 0.01 + y * 0.004, a: alpha };
  };
  Nature.mist.push(mk(0.45, 150, 0.55, 5, 0x6f8aa0));
  Nature.mist.push(mk(1.35, 150, 0.38, 4, 0x6a8296));
};

/* -------------------------------------------------------------------- rain */
Nature.buildRain = function () {
  const N = 700, B = new Gfx.Builder(66), P = new Array(N * 12).fill(0);
  const uv = [], idx = [], nor = [];
  for (let i = 0; i < N; i++) {
    uv.push(0, 1, 1, 1, 1, 0, 0, 0); nor.push(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1);
    const k = i * 4; idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  const dev = Gfx.device, mesh = new pc.Mesh(dev);
  Nature.rain = { n: N, pos: new Float32Array(N * 12), mesh: mesh, drops: [], active: 0 };
  for (let i = 0; i < N; i++) Nature.rain.drops.push({ x: (Math.random() * 2 - 1) * 14, y: Math.random() * 14, z: (Math.random() * 2 - 1) * 14, v: 15 + Math.random() * 7, l: 0.5 + Math.random() * 0.6 });
  mesh.setPositions(Nature.rain.pos); mesh.setNormals(new Float32Array(nor)); mesh.setUvs(0, new Float32Array(uv));
  mesh.setIndices(new Uint16Array(idx));
  mesh.update();
  const m = Gfx.mat({ tex: "streak", tint: 0xffffff, alphaMode: "blend", noNormal: true, unlit: true, cull: "none", op: 0.5, tile: [1, 1], em: 0x9fb4c8, emI: 1.0 });
  const e = Gfx.meshEntity(World.root, mesh, m, { name: "rain", recv: false });
  e.mi.cull = false; e.mi.drawBucket = 140;
  Nature.rain.e = e;
  void B;
};

Nature.updateRain = function (dt, cam, camEnt) {
  const R = Nature.rain; if (!R) return;
  const Q = CFG.QUALITY[World.quality], n = Math.min(R.n, Math.floor(Q.rain * 4.2 * World.weather.rain));
  R.e.enabled = n > 4;
  if (!R.e.enabled) return;
  const right = camEnt.right, rx = right.x, rz = right.z, fx = camEnt.forward.x, fz = camEnt.forward.z;
  const wind = 1.8 + (World.gustT > 0 ? 1.5 : 0), pos = R.pos, w = 0.012;
  let o = 0;
  for (let i = 0; i < n; i++) {
    const d = R.drops[i];
    d.y -= d.v * dt; d.x += wind * dt * 0.5;
    if (d.y < 0 || d.x > 14) { d.y = 8 + Math.random() * 7; d.x = (Math.random() * 2 - 1) * 14; d.z = (Math.random() * 2 - 1) * 14; }
    const x = cam.x + d.x, y = d.y, z = cam.z + d.z, l = d.l, sx = wind * 0.04 * l;
    pos[o++] = x - rx * w; pos[o++] = y; pos[o++] = z - rz * w;
    pos[o++] = x + rx * w; pos[o++] = y; pos[o++] = z + rz * w;
    pos[o++] = x + rx * w + sx; pos[o++] = y + l; pos[o++] = z + rz * w;
    pos[o++] = x - rx * w + sx; pos[o++] = y + l; pos[o++] = z - rz * w;
  }
  void fx; void fz;
  R.mesh.setPositions(pos);
  R.mesh.update(pc.PRIMITIVE_TRIANGLES, false);
  if (R.mesh.primitive && R.mesh.primitive[0]) R.mesh.primitive[0].count = n * 6;
};

/* ------------------------------------------------------------ per frame */
Nature.update = function (dt, cam, camEnt) {
  // distance culling of chunks (grass is cheap but numerous)
  Nature._cullT -= dt;
  if (Nature._cullT <= 0) {
    Nature._cullT = 0.3;
    const Qm = { LOW: 0.62, MEDIUM: 0.85, HIGH: 1 }[World.quality] || 0.85;
    const dist = { grass: 34 * Qm, fern: 40 * Qm, rock: 55, log: 55, bush: 60, tree: CFG.QUALITY[World.quality].treeDist + 6 };
    for (let i = 0; i < Nature.chunks.length; i++) {
      const c = Nature.chunks[i], dx = c.x - cam.x, dz = c.z - cam.z, lim = (dist[c.kind] || 50) + (c.kind === "tree" ? 24 : 17);
      const v = dx * dx + dz * dz < lim * lim;
      if (v !== c.vis) { c.vis = v; c.e.enabled = v && c.on !== false; }
    }
  }
  // moving water + mist
  if (Nature.water) {
    const m = Nature.water.m, t = World.time;
    if ("diffuseMapOffset" in m) { m.diffuseMapOffset = new pc.Vec2(-t * 0.06, t * 0.015); m.normalMapOffset = new pc.Vec2(-t * 0.1, t * 0.03); m.update(); }
  }
  for (let i = 0; i < Nature.mist.length; i++) {
    const mi = Nature.mist[i], t = World.time;
    mi.e.setPosition(cam.x, mi.y, cam.z);
    if ("opacityMapOffset" in mi.m) { mi.m.opacityMapOffset = new pc.Vec2(t * mi.sp + cam.x * 0.0, t * mi.sp * 0.6); mi.m.update(); }
    const base = World.weather.state === 0 ? 1.15 : (World.weather.state === 1 ? 1 : 0.75);
    mi.m.opacity = mi.a * base; mi.m.update();
  }
  Nature.updateRain(dt, cam, camEnt);
};
