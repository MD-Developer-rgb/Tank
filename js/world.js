"use strict";
/* ============================================================================
   THE LAST FIVE NIGHTS - world.js
   Builds the whole map from PlayCanvas primitives (no external assets):
   ground, stream, buildings, forest, props, lamps, items, waypoint graph,
   collision, line-of-sight, weather (rain / wind / lightning) and the
   per-frame world update.
   NOTE: this file must not touch `pc` at load time, only inside functions.
   Created by MD Developer
   ============================================================================ */
const World = {
  app: null, root: null, camera: null, built: false, quality: "MEDIUM",
  mats: {}, colliders: [], grid: {}, trees: [], doors: [], buildings: [],
  interactables: [], lamps: [], items: {}, hideZones: [], nodes: [], edges: [],
  areas: [], checkpoints: {}, refs: {}, noTree: [], bridges: [], resetters: [],
  stream: { x0: -66, x1: 92, z0: -11.5, z1: -8.5 },
  weather: { state: 1, timer: 80, rain: 0, fogMul: 1, flash: 0, nextBolt: 25, boltQueue: [] },
  windMul: 1, windTimer: 10, gustT: 0, time: 0,
  _rain: [], _lampT: 0, _cullT: 0, _fogApplied: -1, _treeAnimT: 0
};

/* ------------------------------------------------------------------ helpers */
World.rng = function (seed) {                       // seeded random (mulberry32)
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
World.color = function (hex) { return new pc.Color(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255); };

/* shared materials, cached by their parameters (never one material per object) */
World.mat = function (hex, o) {
  o = o || {};
  const key = hex + "|" + (o.em == null ? "" : o.em) + "|" + (o.emI == null ? "" : o.emI) + "|" + (o.op == null ? "" : o.op);
  if (World.mats[key]) return World.mats[key];
  const m = new pc.StandardMaterial();
  m.diffuse = World.color(hex);
  if (o.em != null) { m.emissive = World.color(o.em); if (o.emI != null) m.emissiveIntensity = o.emI; }
  if (o.op != null && o.op < 1) { m.opacity = o.op; m.blendType = pc.BLEND_NORMAL; m.depthWrite = false; }
  m.update();
  World.mats[key] = m;
  return m;
};

/* create a primitive entity: shape = box|cylinder|cone|sphere|plane|capsule (or null for an empty node) */
World.ent = function (parent, shape, x, y, z, sx, sy, sz, material, o) {
  o = o || {};
  const e = new pc.Entity(o.name || shape || "node");
  e.setLocalPosition(x, y, z);
  e.setLocalScale(sx, sy, sz);
  if (o.rx || o.ry || o.rz) e.setLocalEulerAngles(o.rx || 0, o.ry || 0, o.rz || 0);
  (parent || World.root).addChild(e);
  if (shape) e.addComponent("render", { type: shape, material: material, castShadows: !!o.shadow, receiveShadows: o.recv !== false });
  return e;
};

/* prop = entity + optional collider (furniture does not block sight) */
World.prop = function (shape, x, y, z, sx, sy, sz, color, o) {
  o = o || {};
  const e = World.ent(o.parent || World.root, shape, x, y, z, sx, sy, sz, World.mat(color, o.m), o);
  if (o.col) World.addBox(x, z, sx, sz, { sight: o.sight === true });
  return e;
};

/* ---------------------------------------------------------------- collision */
World.addBox = function (cx, cz, w, d, o) {
  o = o || {};
  const c = { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, active: true, sight: o.sight !== false, door: !!o.door };
  World.colliders.push(c);
  return c;
};
World.addCircle = function (x, z, r, sight) {
  const c = { x: x, z: z, r: r, active: true, sight: sight !== false };
  const key = Math.floor(x / 8) + "," + Math.floor(z / 8);
  (World.grid[key] = World.grid[key] || []).push(c);
  return c;
};
World.addNoTree = function (cx, cz, w, d) { World.noTree.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 }); };

/* push a position out of every collider. Modifies pos (x,z) and returns it. */
World.collide = function (pos, r) {
  const B = CFG.BOUNDS;
  pos.x = Math.max(B.minX + r, Math.min(B.maxX - r, pos.x));
  pos.z = Math.max(B.minZ + r, Math.min(B.maxZ - r, pos.z));
  const cols = World.colliders;
  for (let it = 0; it < 2; it++) {
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (!c.active) continue;
      if (pos.x < c.minX - r || pos.x > c.maxX + r || pos.z < c.minZ - r || pos.z > c.maxZ + r) continue;
      const cx = Math.max(c.minX, Math.min(pos.x, c.maxX)), cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
      const dx = pos.x - cx, dz = pos.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) { const d = Math.sqrt(d2), p = (r - d) / d; pos.x += dx * p; pos.z += dz * p; }
      else {   // centre is inside the box: push out through the nearest face
        const l = pos.x - c.minX, rr = c.maxX - pos.x, t = pos.z - c.minZ, b = c.maxZ - pos.z, m = Math.min(l, rr, t, b);
        if (m === l) pos.x = c.minX - r; else if (m === rr) pos.x = c.maxX + r; else if (m === t) pos.z = c.minZ - r; else pos.z = c.maxZ + r;
      }
    }
    const gx = Math.floor(pos.x / 8), gz = Math.floor(pos.z / 8);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const cell = World.grid[(gx + i) + "," + (gz + j)];
      if (!cell) continue;
      for (let k = 0; k < cell.length; k++) {
        const c = cell[k];
        if (!c.active) continue;
        const dx = pos.x - c.x, dz = pos.z - c.z, rr = r + c.r, d2 = dx * dx + dz * dz;
        if (d2 < rr * rr) { const d = Math.sqrt(d2) || 0.0001, p = (rr - d) / d; pos.x += dx * p; pos.z += dz * p; }
      }
    }
  }
  return pos;
};

function _segBox(ax, az, dx, dz, c, m) {
  let t0 = 0, t1 = 1;
  const minX = c.minX - m, maxX = c.maxX + m, minZ = c.minZ - m, maxZ = c.maxZ + m;
  if (Math.abs(dx) < 1e-9) { if (ax < minX || ax > maxX) return false; }
  else { let a = (minX - ax) / dx, b = (maxX - ax) / dx; if (a > b) { const t = a; a = b; b = t; } t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return false; }
  if (Math.abs(dz) < 1e-9) { if (az < minZ || az > maxZ) return false; }
  else { let a = (minZ - az) / dz, b = (maxZ - az) / dz; if (a > b) { const t = a; a = b; b = t; } t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return false; }
  return true;
}
function _segCircle(ax, az, dx, dz, c) {
  const fx = ax - c.x, fz = az - c.z, a = dx * dx + dz * dz;
  if (a < 1e-9) return fx * fx + fz * fz < c.r * c.r;
  let t = -(fx * dx + fz * dz) / a; t = Math.max(0, Math.min(1, t));
  const px = fx + dx * t, pz = fz + dz * t;
  return px * px + pz * pz < c.r * c.r;
}

/* true when nothing that blocks sight lies between (ax,az) and (bx,bz) */
World.los = function (ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, cols = World.colliders;
  for (let i = 0; i < cols.length; i++) { const c = cols[i]; if (!c.active || !c.sight) continue; if (_segBox(ax, az, dx, dz, c, 0)) return false; }
  const len = Math.sqrt(dx * dx + dz * dz), steps = Math.ceil(len / 6) + 1, seen = {};
  for (let s = 0; s <= steps; s++) {
    const t = s / steps, gx = Math.floor((ax + dx * t) / 8), gz = Math.floor((az + dz * t) / 8);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const key = (gx + i) + "," + (gz + j);
      if (seen[key]) continue; seen[key] = true;
      const cell = World.grid[key]; if (!cell) continue;
      for (let k = 0; k < cell.length; k++) { const c = cell[k]; if (c.active && c.sight && _segCircle(ax, az, dx, dz, c)) return false; }
    }
  }
  return true;
};

/* walkable straight line between two points (static boxes only; used for the waypoint graph) */
World.edgeClear = function (ax, az, bx, bz, margin, ignoreDoors) {
  const dx = bx - ax, dz = bz - az, cols = World.colliders;
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    if (c.door) { if (ignoreDoors) continue; }
    if (!c.active) continue;
    if (_segBox(ax, az, dx, dz, c, margin)) return false;
  }
  return true;
};

/* ------------------------------------------------------------------ queries */
World.inStream = function (x, z) {
  const s = World.stream;
  if (z < s.z0 || z > s.z1 || x < s.x0 || x > s.x1) return false;
  for (let i = 0; i < World.bridges.length; i++) if (Math.abs(x - World.bridges[i].x) < World.bridges[i].hw) return false;
  return true;
};
World.onBridge = function (x, z) {
  const s = World.stream;
  if (z < s.z0 || z > s.z1) return false;
  for (let i = 0; i < World.bridges.length; i++) if (Math.abs(x - World.bridges[i].x) < World.bridges[i].hw) return true;
  return false;
};
World.buildingAt = function (x, z) {
  for (let i = 0; i < World.buildings.length; i++) {
    const b = World.buildings[i];
    if (x > b.x0 + 0.05 && x < b.x1 - 0.05 && z > b.z0 + 0.05 && z < b.z1 - 0.05) return b;
  }
  return null;
};
World.hideAt = function (x, z) {
  for (let i = 0; i < World.hideZones.length; i++) {
    const h = World.hideZones[i], dx = x - h.x, dz = z - h.z;
    if (dx * dx + dz * dz < h.r * h.r) return h;
  }
  return null;
};
World.groundType = function (x, z, elevated) {
  if (elevated) return "metal";
  const b = World.buildingAt(x, z);
  if (b) return b.floorType;
  if (World.onBridge(x, z)) return "wood";
  return "grass";
};
World.yawTo = function (fx, fz, tx, tz) { return Math.atan2(-(tx - fx), -(tz - fz)) * 180 / Math.PI; };

/* ---------------------------------------------------------- waypoint graph */
World.addNode = function (x, z, interior) {
  const n = { id: World.nodes.length, x: x, z: z, interior: !!interior, adj: [] };
  World.nodes.push(n);
  return n;
};
World.buildGraph = function () {
  const N = World.nodes, keys = {}, comp = N.map((n, i) => i);
  const find = a => { while (comp[a] !== a) { comp[a] = comp[comp[a]]; a = comp[a]; } return a; };
  const link = (a, b) => {
    const k = Math.min(a, b) + "_" + Math.max(a, b);
    if (keys[k]) return;
    keys[k] = true;
    const len = Math.hypot(N[a].x - N[b].x, N[a].z - N[b].z);
    const e = { a: a, b: b, len: len, interior: N[a].interior || N[b].interior };
    World.edges.push(e);
    N[a].adj.push({ to: b, edge: e }); N[b].adj.push({ to: a, edge: e });
    comp[find(a)] = find(b);
  };
  for (let i = 0; i < N.length; i++) {
    const c = [];
    for (let j = 0; j < N.length; j++) {
      if (i === j) continue;
      const d = Math.hypot(N[i].x - N[j].x, N[i].z - N[j].z);
      if (d < 34 && World.edgeClear(N[i].x, N[i].z, N[j].x, N[j].z, 0.3, true)) c.push({ j: j, d: d });
    }
    c.sort((p, q) => p.d - q.d);
    for (let k = 0; k < Math.min(3, c.length); k++) link(i, c[k].j);
  }
  // make sure the graph is one connected piece
  for (let guard = 0; guard < 60; guard++) {
    let best = null;
    for (let i = 0; i < N.length; i++) for (let j = i + 1; j < N.length; j++) {
      if (find(i) === find(j)) continue;
      const d = Math.hypot(N[i].x - N[j].x, N[i].z - N[j].z);
      const ok = World.edgeClear(N[i].x, N[i].z, N[j].x, N[j].z, 0.2, true);
      const score = d + (ok ? 0 : 500);
      if (!best || score < best.s) best = { i: i, j: j, s: score };
    }
    if (!best) break;
    link(best.i, best.j);
  }
};
/* is this graph edge currently walkable (closed doors / gates block it) */
World.edgeOpen = function (e) {
  const a = World.nodes[e.a], b = World.nodes[e.b];
  return World.edgeClear(a.x, a.z, b.x, b.z, 0.3, false);
};
World.nearestNode = function (x, z, outdoorOnly) {
  let best = -1, bd = 1e9;
  for (let i = 0; i < World.nodes.length; i++) {
    const n = World.nodes[i];
    if (outdoorOnly && n.interior) continue;
    const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
};
/* Dijkstra over currently open edges. Returns an array of node ids or null. */
World.findPath = function (from, to) {
  if (from < 0 || to < 0) return null;
  if (from === to) return [from];
  const N = World.nodes, dist = new Array(N.length).fill(1e9), prev = new Array(N.length).fill(-1), done = new Array(N.length).fill(false);
  const openCache = {};
  dist[from] = 0;
  for (let it = 0; it < N.length; it++) {
    let u = -1, bd = 1e9;
    for (let i = 0; i < N.length; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; u = i; }
    if (u < 0) break;
    if (u === to) break;
    done[u] = true;
    const adj = N[u].adj;
    for (let k = 0; k < adj.length; k++) {
      const e = adj[k].edge, v = adj[k].to;
      if (done[v]) continue;
      let ok = openCache[e.a + "_" + e.b];
      if (ok === undefined) ok = openCache[e.a + "_" + e.b] = World.edgeOpen(e);
      if (!ok) continue;
      const nd = dist[u] + e.len;
      if (nd < dist[v]) { dist[v] = nd; prev[v] = u; }
    }
  }
  if (prev[to] < 0) return null;
  const path = []; let c = to;
  while (c >= 0) { path.unshift(c); c = prev[c]; }
  return path;
};

/* --------------------------------------------------------------- doors etc. */
World.makeDoorObj = function (o) {
  const pivot = new pc.Entity("door_" + o.id);
  pivot.setLocalPosition(o.hx, 0, o.hz);
  pivot.setLocalEulerAngles(0, o.closedYaw, 0);
  World.root.addChild(pivot);
  Props.addDoorMesh(pivot, o.kind2 || "wood", o.w, o.h, o.thick || 0.12);
  const col = World.addBox(o.colCx, o.colCz, o.colW, o.colD, { sight: o.sight !== false, door: true });
  const d = { id: o.id, pivot: pivot, col: col, anim: 0, target: 0, closedYaw: o.closedYaw, openYaw: o.openYaw,
    pos: new pc.Vec3(o.cx, o.cy || 1.1, o.cz), locked: null, building: o.building || null, kind: o.kind || "door", led: null };
  World.doors.push(d);
  World.resetters.push(function () { d.anim = 0; d.target = 0; World._applyDoor(d); });
  return d;
};
World._applyDoor = function (d) {
  d.pivot.setLocalEulerAngles(0, d.closedYaw + (d.openYaw - d.closedYaw) * d.anim, 0);
  d.col.active = d.anim < 0.05;
};
World.setDoor = function (d, open, instant) {
  d.target = open ? 1 : 0;
  if (instant) { d.anim = d.target; World._applyDoor(d); }
};
World._updateDoors = function (dt) {
  for (let i = 0; i < World.doors.length; i++) {
    const d = World.doors[i];
    if (d.anim === d.target) continue;
    const sp = d.target ? 2.0 : 1.0, diff = d.target - d.anim;
    d.anim += Math.sign(diff) * Math.min(Math.abs(diff), sp * dt);
    World._applyDoor(d);
  }
};

/* a closed building (walls with door gap + windows, floor, ceiling, roof) drawn by Props.shell.
   o.side = N|S|E|W (N is -Z, the direction the player faces at yaw 0) */
World.makeBuilding = function (o) {
  const h = o.h || 3, gw = o.gw || 1.4, gh = 2.2, t = 0.2;
  const x0 = o.cx - o.w / 2, x1 = o.cx + o.w / 2, z0 = o.cz - o.d / 2, z1 = o.cz + o.d / 2;
  const b = { id: o.id, name: o.name, cx: o.cx, cz: o.cz, w: o.w, d: o.d, h: h, x0: x0, x1: x1, z0: z0, z1: z1, side: o.side, door: null, floorType: o.floor || "wood" };
  const off = o.doorOffset || 0, gx = o.cx + off, gz = o.cz + off;
  const seg = function (x, z, w, d) {
    if (w < 0.05 || d < 0.05) return;
    World.addBox(x, z, w, d);
  };
  [["N", z0], ["S", z1]].forEach(function (p) {
    const side = p[0], z = p[1];
    if (o.side === side) {
      const l = (gx - gw / 2) - x0, r = x1 - (gx + gw / 2);
      seg(x0 + l / 2, z, l, t); seg(gx + gw / 2 + r / 2, z, r, t);
    } else seg(o.cx, z, o.w, t);
  });
  [["W", x0], ["E", x1]].forEach(function (p) {
    const side = p[0], x = p[1];
    if (o.side === side) {
      const l = (gz - gw / 2) - z0, r = z1 - (gz + gw / 2);
      seg(x, z0 + l / 2, t, l); seg(x, gz + gw / 2 + r / 2, t, r);
    } else seg(x, o.cz, t, o.d);
  });
  let d;
  const dm = World.mat(0x3b2e22);
  if (o.side === "N" || o.side === "S") {
    const z = o.side === "N" ? z0 : z1;
    d = World.makeDoorObj({ id: o.id, hx: gx - gw / 2, hz: z, closedYaw: 0, openYaw: o.side === "N" ? 90 : -90, w: gw, h: gh, mat: dm, kind2: o.doorKind,
      colCx: gx, colCz: z, colW: gw, colD: 0.3, cx: gx, cz: z, building: b });
  } else {
    const x = o.side === "W" ? x0 : x1;
    d = World.makeDoorObj({ id: o.id, hx: x, hz: gz + gw / 2, closedYaw: 90, openYaw: o.side === "E" ? 0 : 180, w: gw, h: gh, mat: dm, kind2: o.doorKind,
      colCx: x, colCz: gz, colW: 0.3, colD: gw, cx: x, cz: gz, building: b });
  }
  b.door = d;
  World.buildings.push(b);
  Props.shell(o, b, { t: t, gw: gw, gh: gh });
  World.addNoTree(o.cx, o.cz, o.w + 8, o.d + 8);
  return b;
};

World.addInteractable = function (o) {
  if (!o.pos) o.pos = new pc.Vec3(o.x, o.y, o.z);
  if (o.range == null) o.range = 2.4;
  if (o.enabled == null) o.enabled = true;
  World.interactables.push(o);
  return o;
};

World.powerGrid = function (on) { for (let i = 0; i < World.lamps.length; i++) if (World.lamps[i].grid) World.setLamp(World.lamps[i], on); };
/* at most N lamp lights are active: the ones nearest to the player */
World._updateLamps = function (p) {
  const Q = CFG.QUALITY[World.quality], c = [];
  for (let i = 0; i < World.lamps.length; i++) {
    const L = World.lamps[i];
    if (!L.on) continue;
    c.push({ L: L, d: (L.x - p.x) * (L.x - p.x) + (L.z - p.z) * (L.z - p.z) });
  }
  c.sort((a, b) => a.d - b.d);
  const n = new Set();
  for (let i = 0; i < Math.min(Q.lamps, c.length); i++) { if (c[i].d < 900) n.add(c[i].L); }
  for (let i = 0; i < World.lamps.length; i++) { const L = World.lamps[i]; L.entity.light.enabled = n.has(L); }
};

/* ============================================================================
   PART 2 of world.js: building the scene (steps), weather, per-frame update
   ============================================================================ */

World.setLockerOpen = function (open) {
  const L = World.refs.locker;
  L.open = !!open;
  L.pivot.setLocalEulerAngles(0, open ? 90 : 0, 0);
};

/* progress callback + done callback; each step runs in its own timeout so the loading bar can animate */
World.build = function (app, onProgress, onDone) {
  World.app = app;
  World.root = new pc.Entity("world");
  app.root.addChild(World.root);
  const steps = [
    ["Lighting the night...", World._buildLighting],
    ["Laying the ground...", World._buildGround],
    ["Raising the compound...", World._buildCompound],
    ["Cutting the paths...", World._buildPaths],
    ["Planting the forest...", World._buildTrees],
    ["Gathering the clouds...", World._buildRain],
    ["Finishing touches...", World._finalize]
  ];
  let i = 0;
  (function next() {
    if (i >= steps.length) { World.built = true; if (onDone) onDone(null); return; }
    if (onProgress) onProgress(i / steps.length, steps[i][0]);
    try { steps[i][1](); } catch (err) { console.error(err); if (onDone) onDone(err); return; }
    i++;
    setTimeout(next, 20);
  })();
};

/* ------------------------------------------------------------- lighting/fog */
/* exponential fog: `far` is the distance at which things are (almost) swallowed by the fog */
World.setFog = function (near, far, color) {
  const sc = World.app.scene, dens = 1.55 / Math.max(10, far);
  if (sc.fog && typeof sc.fog === "object") {          // PlayCanvas 2.x
    sc.fog.type = pc.FOG_EXP2 !== undefined ? pc.FOG_EXP2 : pc.FOG_LINEAR;
    if (sc.fog.color && sc.fog.color.copy) sc.fog.color.copy(color); else sc.fog.color = color;
    sc.fog.density = dens; sc.fog.start = near; sc.fog.end = far;
  } else {                                              // PlayCanvas 1.x
    sc.fog = pc.FOG_EXP2 !== undefined ? pc.FOG_EXP2 : pc.FOG_LINEAR; sc.fogColor = color; sc.fogDensity = dens; sc.fogStart = near; sc.fogEnd = far;
  }
  if (World.camera && World.camera.camera) World.camera.camera.clearColor = color;
};
World._buildLighting = function () {
  const L = CFG.LOOK;
  World._amb = new pc.Color(L.ambient[0], L.ambient[1], L.ambient[2]);
  World.app.scene.ambientLight = World._amb;
  try { if ("exposure" in World.app.scene) World.app.scene.exposure = L.exposure || 1; } catch (e) { /* ignore */ }
  World.fogColor = new pc.Color(L.fogColor[0], L.fogColor[1], L.fogColor[2]);
  World.setFog(L.fogNear, 60, World.fogColor);
  const moon = new pc.Entity("moon");
  moon.addComponent("light", { type: "directional", color: new pc.Color(0.56, 0.68, 1.0), intensity: L.moon, castShadows: false,
    shadowDistance: 38, shadowResolution: 1024, shadowBias: 0.3, normalOffsetBias: 0.08, shadowIntensity: 0.85 });
  moon.setEulerAngles(-50, 30, 0);
  World.root.addChild(moon);
  World.moon = moon;
  const up = moon.up; Gfx.moonDir = [up.x, up.y, up.z];
};

/* ------------------------------------------------------------ ground+stream */
World._buildGround = function () {
  Gfx.init(World.app);
  Nature.buildTreeMeshes();
  Gfx.buildSky(World.root);
  Nature.buildTerrain();
  Nature.buildWater();
  Nature.buildDecals();
  const s = World.stream, S = new Props.Set({ pw: { tex: "planks", boards: 4, vc: true, bump: 1, gloss: 0.1, ts: 1.0 } }, 17);
  World.addNoTree((s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2, s.x1 - s.x0, (s.z1 - s.z0) + 3);
  const z0 = s.z0 - 0.7, z1 = s.z1 + 0.7, zc = (z0 + z1) / 2, len = z1 - z0;
  [0, -22].forEach(function (bx) {
    World.bridges.push({ x: bx, hw: 1.3 });
    S.box("pw", 2.4, 0.12, len, bx, 0.08, zc, [190, 160, 120]);                     // deck
    for (let i = 0; i < Math.round(len / 0.35); i++) S.box("pw", 2.4, 0.015, 0.02, bx, 0.145, z0 + 0.1 + i * 0.35, [70, 56, 42]);
    [-1.2, 1.2].forEach(function (sx) {
      S.box("pw", 0.22, 0.5, len + 0.2, bx + sx, -0.1, zc, [120, 98, 74]);          // stringers
      S.box("pw", 0.08, 0.08, len, bx + sx, 0.95, zc, [170, 140, 104]);             // top rail
      S.box("pw", 0.06, 0.06, len, bx + sx, 0.55, zc, [150, 122, 92]);              // mid rail
      for (let k = 0; k <= 5; k++) S.box("pw", 0.12, 1.0, 0.12, bx + sx, 0.5, z0 + 0.1 + k * (len - 0.2) / 5, [130, 106, 80]);
    });
    S.box("pw", 2.4, 0.2, 0.3, bx, 0.02, z0 - 0.1, [110, 90, 66]); S.box("pw", 2.4, 0.2, 0.3, bx, 0.02, z1 + 0.1, [110, 90, 66]);
  });
  S.flush(World.root, { name: "bridge", shadow: true });
};

/* -------------------------------------------------- waypoint graph + paths */
World._buildPaths = function () {
  const O = [[0, -8], [0, -14], [-22, -6.5], [-25, -13], [-12, -20], [12, -18], [26, -23], [30, -25.5], [38, -26], [45, -40],
    [28, -38], [10, -35], [-8, -33], [-22, -30], [-34, -40], [-40, -45], [-5, -52], [10, -65.5], [-20, -48], [-12, -4],
    [-30, 6], [-48, 20], [-15, 14], [-12, 22], [8, 12], [20, 2], [24, -4], [45, 4], [38, 16], [45, 20],
    [58, 27], [55, 31], [60, 44.2], [72, 44.2], [10, 40], [-25, 38], [35, 50], [30, 30]];
  O.forEach(function (p) { World.addNode(p[0], p[1], false); });
  World.addNode(0, 0.5, true);        // cabin interior
  World.addNode(0, -5, true);         // yard (only reachable when the gate is open)
  World.addNode(-25, -16.5, true);    // shed interior
  World.addNode(30, -29.8, true);     // hut interior
  World.addNode(45, 9.8, true);       // radio interior
  World.addNode(10, -70, true);       // observation interior
  World.buildGraph();
  World.outdoorNodes = World.nodes.filter(n => !n.interior).map(n => n.id);

  Nature.buildPaths(World.edges.filter(function (e) { return !e.interior; }));
};

/* ------------------------------------------------------------------ forest */
function _distSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + dx * t, cz = az + dz * t;
  return Math.hypot(px - cx, pz - cz);
}
World._buildTrees = function () {
  const rng = World.rng(CFG.TREES.seed), B = CFG.BOUNDS;
  const outEdges = World.edges.filter(e => !e.interior);

  const blocked = function (x, z) {
    for (let i = 0; i < World.noTree.length; i++) { const r = World.noTree[i]; if (x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ) return true; }
    for (let i = 0; i < outEdges.length; i++) {
      const a = World.nodes[outEdges[i].a], b = World.nodes[outEdges[i].b];
      if (_distSeg(x, z, a.x, a.z, b.x, b.z) < 2.6) return true;
    }
    for (let i = 0; i < World.nodes.length; i++) if (Math.hypot(x - World.nodes[i].x, z - World.nodes[i].z) < 3) return true;
    return false;
  };
  const nearPath = function (x, z, m) {
    for (let i = 0; i < outEdges.length; i++) {
      const a = World.nodes[outEdges[i].a], b = World.nodes[outEdges[i].b];
      if (_distSeg(x, z, a.x, a.z, b.x, b.z) < 1.15 + m) return true;
    }
    return false;
  };
  let randIdx = 0;
  const makeTree = function (x, z, scale, type, ring) {
    const idx = ring ? -1 : randIdx++, Qs = CFG.QUALITY;
    const layer = ring || idx < Qs.LOW.trees ? 0 : (idx < Qs.MEDIUM.trees ? 1 : 2);
    Nature.addTree(x, z, scale, type, rng, layer);
    const t = { root: null, x: x, z: z, ring: !!ring, idx: idx, phase: 0, vis: true, active: true, circle: World.addCircle(x, z, 0.4 * scale, true) };
    World.trees.push(t);
  };
  const MAXT = CFG.QUALITY.HIGH.trees;
  let guard = 0;
  while (randIdx < MAXT && guard < MAXT * 60) {
    guard++;
    const x = B.minX + 4 + rng() * (B.maxX - B.minX - 8), z = B.minZ + 4 + rng() * (B.maxZ - B.minZ - 8);
    if (blocked(x, z)) continue;
    const r = rng();
    makeTree(x, z, 0.8 + rng() * 0.55, r < 0.5 ? 0 : (r < 0.72 ? 1 : (r < 0.8 ? 2 : 3)), false);
  }
  // dense ring along the border
  for (let x = B.minX + 1; x < B.maxX; x += 3.6) {
    makeTree(x + (rng() - 0.5) * 1.5, B.minZ + 0.8 + rng(), 1.3, 0, true);
    makeTree(x + (rng() - 0.5) * 1.5, B.maxZ - 0.8 - rng(), 1.3, 0, true);
  }
  for (let z = B.minZ + 5; z < B.maxZ - 3; z += 3.6) {
    makeTree(B.minX + 0.8 + rng(), z + (rng() - 0.5) * 1.5, 1.3, 0, true);
    makeTree(B.maxX - 0.8 - rng(), z + (rng() - 0.5) * 1.5, 1.3, 0, true);
  }
  Nature.flushTrees();
  // undergrowth (grass, ferns, rocks, logs, glow-shrooms) + bushes = hiding spots (no collision)
  Nature.buildUndergrowth(blocked, nearPath, function (bush) {
    const addBush = function (x, z) {
      const s = 1.3 + rng() * 0.7;
      bush(x, z, s);
      World.hideZones.push({ x: x, z: z, r: 1.25 * s, name: "bush", bush: true });
    };
    const ok = function (x, z) {
      for (let k = 0; k < World.noTree.length; k++) { const r = World.noTree[k]; if (x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ) return false; }
      return !World.inStream(x, z);
    };
    let placed = 0, g2 = 0;
    while (placed < CFG.TREES.bushes && g2 < 4000) {
      g2++;
      const x = B.minX + 4 + rng() * (B.maxX - B.minX - 8), z = B.minZ + 4 + rng() * (B.maxZ - B.minZ - 8);
      if (!ok(x, z) || nearPath(x, z, 0.5)) continue;
      addBush(x, z); placed++;
    }
    for (let i = 0; i < 14; i++) {      // bushes near the paths
      const n = World.nodes[World.outdoorNodes[Math.floor(rng() * World.outdoorNodes.length)]];
      const a = rng() * 6.28, d = 3.5 + rng() * 1.5, x = n.x + Math.cos(a) * d, z = n.z + Math.sin(a) * d;
      if (x < B.minX + 3 || x > B.maxX - 3 || z < B.minZ + 3 || z > B.maxZ - 3) continue;
      if (!ok(x, z)) continue;
      addBush(x, z);
    }
  });
};

/* ---------------------------------------------------- rain, mist (nature.js) */
World._buildRain = function () {
  Nature.buildRain();
  Nature.buildMist();
};

World._finalize = function () {
  World.setQuality(Settings.get("quality"));
  World.resetDynamic();
};

/* quality changes apply live: tree count, fog distance, rain amount, lamps */
World.setQuality = function (q) {
  if (!CFG.QUALITY[q]) q = "MEDIUM";
  World.quality = q;
  const Q = CFG.QUALITY[q];
  for (let i = 0; i < World.trees.length; i++) {
    const t = World.trees[i];
    if (t.ring) continue;
    t.active = t.idx < Q.trees;
    t.circle.active = t.active;
  }
  Nature.setTreeLayers(q);
  if (World.moon) World.moon.light.castShadows = !!Q.shadows;
  World._fogApplied = -1; World._cullT = 0;
};

/* put every dynamic thing back to its start-of-game state */
World.resetDynamic = function () {
  World.resetters.forEach(function (f) { f(); });
  for (const id in World.items) {
    const it = World.items[id];
    it.taken = false;
    it.entity.enabled = !(World.hiddenAtStart && World.hiddenAtStart[id]);
  }
  World.powerGrid(false);
};

/* -------------------------------------------------------- weather + update */
World.hearWeather = function () { return CFG.HOLLOW.hearWeather[World.weather.state] * World.windMul; };

World._updateWeather = function (dt) {
  const w = World.weather, W = CFG.WEATHER;
  w.timer -= dt;
  if (w.timer <= 0) {
    const r = Math.random(), old = w.state;
    let ns = r < 0.3 ? 0 : (r < 0.7 ? 1 : 2);
    if (ns === old) ns = (old + 1 + (Math.random() < 0.5 ? 0 : 1)) % 3;
    w.state = ns;
    w.timer = W.cycleMin + Math.random() * (W.cycleMax - W.cycleMin);
    if (typeof UI !== "undefined" && UI.setWeather) UI.setWeather(ns);
  }
  w.rain += (W.rainTarget[w.state] - w.rain) * Math.min(1, dt * 0.4);
  w.fogMul += (W.fogMul[w.state] - w.fogMul) * Math.min(1, dt * 0.3);
  // wind gusts: hearing dips to 0.8 for a few seconds
  World.windTimer -= dt;
  if (World.windTimer <= 0) { World.gustT = 2 + Math.random() * 3; World.windTimer = 10 + Math.random() * 15; }
  if (World.gustT > 0) { World.gustT -= dt; World.windMul = W.windGust; } else World.windMul = 1;
  // lightning
  if (w.state >= 1) {
    w.nextBolt -= dt;
    if (w.nextBolt <= 0) {
      w.flash = 1; w.boltQueue = [0.12];
      w.nextBolt = (w.state === 2 ? 8 : 14) + Math.random() * 25;
      setTimeout(function () { Audio.play("thunder", { volume: 0.7 }); }, 500 + Math.random() * 2500);
    }
  }
  if (w.boltQueue.length) { w.boltQueue[0] -= dt; if (w.boltQueue[0] <= 0) { w.boltQueue.shift(); w.flash = 0.75; } }
  const hadFlash = w.flash > 0;
  if (w.flash > 0) w.flash = Math.max(0, w.flash - dt * 4);
  {
    // indoors the moon and sky light are mostly blocked: ease towards a dim interior
    const L = CFG.LOOK, f = w.flash * 0.5, inside = (typeof Player !== "undefined" && Player.building) ? 1 : 0;
    World._in = (World._in || 0) + (inside - (World._in || 0)) * Math.min(1, dt * 3.5);
    const k = World._in, a = 1 - 0.34 * k;
    World._amb.set((L.ambient[0] + f * 0.8) * a, (L.ambient[1] + f * 0.85) * a, (L.ambient[2] + f) * a);
    World.app.scene.ambientLight = World._amb;
    if (World.moon) World.moon.light.intensity = (CFG.LOOK.moon + w.flash * 0.9) * (1 - 0.72 * k);
  }
  const Q = CFG.QUALITY[World.quality], far = Q.fogFar * w.fogMul;
  if (Math.abs(far - World._fogApplied) > 0.4) { World._fogApplied = far; World.setFog(CFG.LOOK.fogNear, far, World.fogColor); }
  Audio.setWeather(w.rain, 0.25 + w.rain * 0.55 + (World.gustT > 0 ? 0.15 : 0));
};

World.update = function (dt, cam) {
  if (!World.built) return;
  World.time += dt;
  World._updateWeather(dt);
  World._updateDoors(dt);
  World._updateItems(dt, cam);
  Gfx.updateSky(cam, dt, World.time);
  Gfx.updateGlows(cam);
  Props.update(dt, cam);
  if (World._sparks && World._sparks[0] && World.refs.wire && World.refs.wire.enabled) { const sp = World._sparks[0]; sp.enabled = Math.random() < 0.18; sp.setLocalPosition((Math.random() - 0.5) * 0.4, -0.55 + Math.random() * 0.1, 1.0 + Math.random() * 0.4); }
  Nature.update(dt, cam, World.camera);

  World._lampT -= dt;
  if (World._lampT <= 0) { World._lampT = 0.3; World._updateLamps(cam); }

  // winch: the fallen tree slides away
  const T = World.refs.tree;
  if (T && T.moving && T.anim < 1) {
    T.anim = Math.min(1, T.anim + dt / 8);
    T.entity.setPosition(75, 0.55, 42 + T.anim * 11);
    T.entity.setEulerAngles(90, T.anim * 70, 0);
  }
  // beacon light pulse
  const bc = World.refs.beacon;
  if (bc && bc.active) bc.entity.light.intensity = 1.8 + 0.7 * Math.sin(World.time * 4);
};
