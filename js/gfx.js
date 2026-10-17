"use strict";
/* ============================================================================
   THE LAST FIVE NIGHTS - gfx.js
   Graphics toolkit. Everything is generated in code (no asset files):
     * procedural tileable textures + normal maps (wood, bark, concrete, metal,
       shingles, asphalt, grass, dirt, water, fabric ...)
     * a merged-mesh builder (boxes, cylinders, cones, spheres, cards, gables)
       with per-vertex colour, so a whole tree or building is ONE draw call
     * night-sky dome (stars, milky way, moon, clouds), glow sprites, mist,
       flashlight cookie, post-processing set-up
   NOTE: nothing here touches `pc` at load time, only inside functions.
   Created by MD Developer
   ============================================================================ */
const Gfx = {
  app: null, device: null, quality: "MEDIUM",
  texCache: {}, matCache: {}, canvases: {},
  texSize: 256,
  moonDir: [-0.383, 0.643, -0.663],      // direction TOWARDS the moon (matches the directional light)
  glows: [], clouds: null, sky: null, mist: [],

  init(app) {
    Gfx.app = app; Gfx.device = app.graphicsDevice;
    Gfx.setQuality(Settings.get("quality"));
  },
  setQuality(q) {
    Gfx.quality = q;
    Gfx.texSize = q === "LOW" ? 128 : 256;
  }
};

/* ============================================================== noise toolkit */
(function () {
  function hash2(ix, iy, seed) {
    let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed + 1, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  /* periodic value noise: x,y are lattice coordinates, per = period (wraps => tileable) */
  function vnoise(x, y, per, seed) {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const w = v => ((v % per) + per) % per;
    const xa = w(x0), xb = w(x0 + 1), ya = w(y0), yb = w(y0 + 1);
    const a = hash2(xa, ya, seed), b = hash2(xb, ya, seed), c = hash2(xa, yb, seed), d = hash2(xb, yb, seed);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  /* tileable fBm. u,v in 0..1 (one texture tile), base = lattice cells per tile (integer) */
  function fbm(u, v, base, oct, seed) {
    let s = 0, a = 0.5, f = 1, t = 0;
    for (let o = 0; o < oct; o++) {
      s += a * vnoise(u * base * f, v * base * f, base * f, seed + o * 17);
      t += a; a *= 0.5; f *= 2;
    }
    return s / t;
  }
  const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  /* anisotropic periodic noise: px cells across u, py cells across v (both integers => tileable) */
  function vnoiseA(x, y, px, py, seed) {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const wx = v => ((v % px) + px) % px, wy = v => ((v % py) + py) % py;
    const a = hash2(wx(x0), wy(y0), seed), b = hash2(wx(x0 + 1), wy(y0), seed), c = hash2(wx(x0), wy(y0 + 1), seed), d = hash2(wx(x0 + 1), wy(y0 + 1), seed);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  function fbmA(u, v, px, py, oct, seed) {
    let s = 0, a = 0.5, f = 1, t = 0;
    for (let o = 0; o < oct; o++) { s += a * vnoiseA(u * px * f, v * py * f, px * f, py * f, seed + o * 17); t += a; a *= 0.5; f *= 2; }
    return s / t;
  }
  Gfx.N = { hash2: hash2, vnoise: vnoise, fbm: fbm, fbmA: fbmA, clamp: clamp, sstep: sstep };
})();

/* ========================================================= texture generators */
/* Each generator fills a size*size RGBA array and returns {rgba, h} where h is a
   height map (0..1) used to derive the normal map. Output colours are neutral
   enough to be tinted by material.diffuse. */
Gfx._gen = {};
(function () {
  const N = Gfx.N, clamp = N.clamp, sstep = N.sstep, fbm = N.fbm;
  const make = function (S, fn) {
    const rgba = new Uint8ClampedArray(S * S * 4), h = new Float32Array(S * S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const o = fn(x / S, y / S, x, y), i = y * S + x;
        rgba[i * 4] = o[0] * 255; rgba[i * 4 + 1] = o[1] * 255; rgba[i * 4 + 2] = o[2] * 255; rgba[i * 4 + 3] = (o[4] == null ? 1 : o[4]) * 255;
        h[i] = o[3];
      }
    }
    return { rgba: rgba, h: h };
  };
  /* canvas based painter for stroke textures; returns same structure */
  const paint = function (S, draw) {
    const cv = document.createElement("canvas"); cv.width = cv.height = S;
    const g = cv.getContext("2d");
    draw(g, S);
    const d = g.getImageData(0, 0, S, S).data, rgba = new Uint8ClampedArray(d), h = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) h[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) / 255;
    return { rgba: rgba, h: h };
  };
  const rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  /* draws a stroke 9x so it wraps around the tile edges */
  const wrapLine = function (g, S, x1, y1, x2, y2) {
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      g.beginPath(); g.moveTo(x1 + ox * S, y1 + oy * S); g.lineTo(x2 + ox * S, y2 + oy * S); g.stroke();
    }
  };
  const wrapDot = function (g, S, x, y, r) {
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      g.beginPath(); g.arc(x + ox * S, y + oy * S, r, 0, 6.283); g.fill();
    }
  };

  Gfx._gen.planks = function (S, o) {
    o = o || {};
    const boards = o.boards || 6, vertical = !!o.vertical, rg = rng(11), fA = N.fbmA;
    const tone = [], offs = [], knots = [];
    for (let i = 0; i < boards; i++) { tone.push(0.7 + rg() * 0.3); offs.push(rg()); knots.push([rg(), 0.3 + rg() * 0.4, rg() < 0.45]); }
    return make(S, function (u, v) {
      if (vertical) { const t = u; u = v; v = t; }
      const bi = Math.min(boards - 1, Math.floor(v * boards)), t = v * boards - bi;
      const uu = (u + offs[bi]) % 1;
      // long fibres along the board (low frequency along u, high across)
      const fib = fA(uu, t, 2, 26, 4, 5 + bi), fib2 = fA(uu, t, 6, 60, 2, 90 + bi), ring = Math.sin((fA(uu, t, 2, 5, 3, 40 + bi) * 9 + t * 3) * 6.283) * 0.5 + 0.5;
      let c = tone[bi] * (0.62 + 0.28 * fib + 0.16 * fib2 + 0.12 * ring);
      let hh = 0.5 + (fib - 0.5) * 0.5 + (fib2 - 0.5) * 0.3;
      // knots
      const k = knots[bi];
      if (k[2]) { let dx = Math.abs(uu - k[0]); if (dx > 0.5) dx = 1 - dx; const d = Math.hypot(dx * 4, (t - k[1]) * 1.2); if (d < 0.32) { const q = 1 - d / 0.32; c *= 1 - 0.45 * q; hh -= 0.25 * q * (Math.sin(d * 60) * 0.5 + 0.5); } }
      // gaps between boards, butt joints, nails
      const gap = sstep(0.0, 0.07, t) * sstep(0.0, 0.07, 1 - t);
      const jx = (u * 2 + bi * 0.37) % 1, joint = sstep(0.0, 0.01, jx) * sstep(0.0, 0.01, 1 - jx);
      const nail = (Math.hypot(((jx - 0.05) * 2.2), (t - 0.5) * 1.0) < 0.03) ? 0.5 : 1;
      c *= (0.28 + 0.72 * gap) * (0.5 + 0.5 * joint) * nail;
      const grime = 0.9 + 0.1 * fbm(u, v, 5, 3, 9);
      c *= grime;
      return [clamp(c * 0.98, 0, 1), clamp(c * 0.9, 0, 1), clamp(c * 0.8, 0, 1), clamp(hh * gap * joint, 0, 1)];
    });
  };

  Gfx._gen.bark = function (S) {
    return make(S, function (u, v) {
      const warp = fbm(u, v, 4, 3, 21) * 0.18;
      const ridge = Math.abs(Math.sin((u + warp) * 6.283 * 7));
      const n = fbm(u, v, 5, 5, 3), fine = fbm(u, v * 0.25, 24, 3, 8);
      const crev = Math.pow(ridge, 0.7);
      const c = (0.2 + 0.55 * crev) * (0.65 + 0.7 * n) * (0.85 + 0.3 * fine);
      return [clamp(c * 0.95, 0, 1), clamp(c * 0.86, 0, 1), clamp(c * 0.76, 0, 1), crev * 0.8 + n * 0.2];
    });
  };

  Gfx._gen.concrete = function (S) {
    return make(S, function (u, v) {
      const n = fbm(u, v, 6, 5, 31), fine = fbm(u, v, 48, 2, 13);
      const stain = fbm(u * 1.0, v * 0.35, 4, 4, 77);
      let c = 0.5 + (n - 0.5) * 0.45 + (fine - 0.5) * 0.25 - Math.max(0, stain - 0.55) * 0.5;
      const cr = Math.abs(fbm(u, v, 5, 4, 91) - 0.5) * 2;
      const crack = cr < 0.012 ? 0.8 : 1;
      const seamX = Math.abs(((u * 2) % 1) - 0.5) > 0.495 ? 0.5 : 1, seamY = Math.abs(((v * 2) % 1) - 0.5) > 0.495 ? 0.5 : 1;
      c *= crack * seamX * seamY;
      return [clamp(c, 0, 1), clamp(c * 0.99, 0, 1), clamp(c * 0.96, 0, 1), clamp(n * 0.6 + fine * 0.4, 0, 1) * crack];
    });
  };

  Gfx._gen.corrugated = function (S) {
    return make(S, function (u, v) {
      const ridge = Math.sin(u * 6.283 * 8) * 0.5 + 0.5;
      const rust = sstep(0.52, 0.8, fbm(u, v * 0.6, 4, 5, 55)) * (0.5 + 0.5 * fbm(u, v, 16, 3, 5));
      let c = 0.42 + 0.3 * ridge;
      const base = [c, c * 1.0, c * 1.03];
      const rc = [0.42 + 0.25 * ridge, 0.2 + 0.1 * ridge, 0.1 + 0.05 * ridge];
      const dirt = 0.85 + 0.15 * fbm(u, v, 10, 4, 3);
      const rv = [base[0] * (1 - rust) + rc[0] * rust, base[1] * (1 - rust) + rc[1] * rust, base[2] * (1 - rust) + rc[2] * rust];
      const bolt = (Math.abs(((v * 6) % 1) - 0.5) < 0.04 && Math.abs(((u * 8) % 1) - 0.5) < 0.1) ? 0.6 : 1;
      return [rv[0] * dirt * bolt, rv[1] * dirt * bolt, rv[2] * dirt * bolt, ridge * 0.9];
    });
  };

  Gfx._gen.shingle = function (S) {
    const rows = 8, rg = rng(5), tones = [];
    for (let i = 0; i < 400; i++) tones.push(0.5 + rg() * 0.5);
    return make(S, function (u, v) {
      const r = Math.floor(v * rows), t = v * rows - r;
      const cols = 6, uu = (u * cols + (r % 2) * 0.5), ci = Math.floor(uu), cx = uu - ci;
      const tone = tones[(r * 7 + ((ci % cols) + cols) % cols) % 400];
      const edge = sstep(0, 0.05, cx) * sstep(0, 0.05, 1 - cx);
      const lip = 0.45 + 0.55 * sstep(0.0, 0.3, t);                  // dark gap under each course
      const wear = 0.8 + 0.3 * fbm(u, v, 24, 3, 4), streak = 0.88 + 0.12 * Math.sin((u * cols * 1.0 + tone * 9) * 6.283 * 2);
      const c = tone * edge * lip * wear * streak;
      return [clamp(c * 1.0, 0, 1), clamp(c * 0.97, 0, 1), clamp(c * 0.93, 0, 1), edge * (0.25 + 0.75 * sstep(0, 0.7, t)) * tone];
    });
  };

  Gfx._gen.dirt = function (S) {
    const rg = rng(3), pts = [];
    for (let i = 0; i < 90; i++) pts.push([rg(), rg(), 0.006 + rg() * 0.014, 0.4 + rg() * 0.5]);
    return make(S, function (u, v) {
      const n = fbm(u, v, 5, 5, 61), fine = fbm(u, v, 40, 2, 7);
      let c = 0.42 + (n - 0.5) * 0.5 + (fine - 0.5) * 0.28, hh = n * 0.7 + fine * 0.3;
      for (let i = 0; i < pts.length; i++) {
        let dx = Math.abs(u - pts[i][0]), dy = Math.abs(v - pts[i][1]);
        if (dx > 0.5) dx = 1 - dx; if (dy > 0.5) dy = 1 - dy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < pts[i][2]) { const k = 1 - d / pts[i][2]; c += k * 0.2 * pts[i][3]; hh += k * 0.5; }
      }
      return [clamp(c * 1.0, 0, 1), clamp(c * 0.85, 0, 1), clamp(c * 0.68, 0, 1), clamp(hh, 0, 1)];
    });
  };

  Gfx._gen.grass = function (S) {
    return paint(S, function (g, S) {
      const r = rng(77);
      g.fillStyle = "#33422a"; g.fillRect(0, 0, S, S);
      // soft colour patches
      for (let i = 0; i < 26; i++) {
        const x = r() * S, y = r() * S, rad = S * (0.08 + r() * 0.14);
        const gr = g.createRadialGradient(x, y, 0, x, y, rad);
        const tint = r() < 0.5 ? "rgba(70,60,34," : "rgba(30,56,30,";
        gr.addColorStop(0, tint + "0.55)"); gr.addColorStop(1, tint + "0)");
        g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      // blades
      for (let i = 0; i < S * 38; i++) {
        const x = r() * S, y = r() * S, a = -1.57 + (r() - 0.5) * 1.3, l = 3 + r() * 8;
        const sh = r(), gr = 40 + sh * 70;
        g.strokeStyle = "rgba(" + ((gr * 0.62) | 0) + "," + (gr | 0) + "," + ((gr * 0.4) | 0) + ",0.85)"; g.lineWidth = 0.7 + r() * 0.8;
        wrapLine(g, S, x, y, x + Math.cos(a) * l, y + Math.sin(a) * l);
      }
      // dry needles / leaf litter
      for (let i = 0; i < S * 5; i++) {
        const x = r() * S, y = r() * S, a = r() * 6.28, l = 3 + r() * 6;
        g.strokeStyle = "rgba(" + (70 + r() * 40 | 0) + "," + (50 + r() * 30 | 0) + "," + (28 + r() * 16 | 0) + ",0.8)"; g.lineWidth = 1;
        wrapLine(g, S, x, y, x + Math.cos(a) * l, y + Math.sin(a) * l);
      }
      for (let i = 0; i < S * 0.4; i++) { g.fillStyle = "rgba(10,14,8,0.5)"; wrapDot(g, S, r() * S, r() * S, 1 + r() * 2); }
    });
  };

  Gfx._gen.asphalt = function (S) {
    return make(S, function (u, v) {
      const n = fbm(u, v, 6, 5, 71), sp = fbm(u, v, 64, 1, 3);
      let c = 0.22 + (n - 0.5) * 0.12 + (sp > 0.82 ? 0.14 : 0) - (sp < 0.12 ? 0.05 : 0);
      const cr = Math.abs(fbm(u, v, 4, 4, 123) - 0.5) * 2;
      if (cr < 0.025) c *= 0.4;
      const oil = sstep(0.62, 0.8, fbm(u, v, 3, 4, 8)) * 0.07;
      c -= oil;
      return [clamp(c, 0, 1), clamp(c, 0, 1), clamp(c * 1.04, 0, 1), clamp(0.5 + (sp - 0.5) * 0.7, 0, 1) * (cr < 0.025 ? 0.2 : 1)];
    });
  };

  Gfx._gen.water = function (S) {
    return make(S, function (u, v) {
      const a = fbm(u, v, 4, 5, 15), b = fbm(u + 0.37, v * 1.0, 9, 3, 33);
      const h = a * 0.6 + b * 0.4;
      const c = 0.12 + h * 0.16;
      return [c * 0.5, c * 0.8, c * 1.0, h];
    });
  };

  Gfx._gen.metal = function (S) {
    return make(S, function (u, v) {
      const brushed = fbm(u * 1.0, v, 2, 3, 3) * 0.1 + fbm(u, v * 0.02 + 0.5, 64, 2, 9) * 0.15;
      const rust = sstep(0.55, 0.78, fbm(u, v, 5, 5, 41)) * 0.8;
      let c = 0.46 + brushed - 0.06;
      const rv = [c * (1 - rust) + (0.45) * rust, c * (1 - rust) + 0.22 * rust, c * (1 - rust) + 0.1 * rust];
      const rivet = Math.hypot((((u * 8) % 1) - 0.5), (((v * 8) % 1) - 0.5)) < 0.08 ? 1.25 : 1;
      const seam = (Math.abs(((u * 2) % 1) - 0.5) > 0.49 || Math.abs(((v * 2) % 1) - 0.5) > 0.49) ? 0.5 : 1;
      return [rv[0] * rivet * seam, rv[1] * rivet * seam, rv[2] * rivet * seam, (rivet > 1 ? 0.95 : 0.5) * seam + rust * 0.1];
    });
  };

  Gfx._gen.fabric = function (S) {
    return make(S, function (u, v) {
      const w = (Math.sin(u * 6.283 * 24) * 0.5 + 0.5) * 0.5 + (Math.sin(v * 6.283 * 24) * 0.5 + 0.5) * 0.5;
      const n = fbm(u, v, 8, 4, 2);
      const c = 0.55 + w * 0.25 + (n - 0.5) * 0.25;
      return [c, c, c, w * 0.6 + n * 0.4];
    });
  };

  Gfx._gen.needles = function (S) {   // detail layer for tree foliage (grey, tinted by vertex colours)
    return paint(S, function (g, S) {
      const r = rng(19);
      g.fillStyle = "#7a7a7a"; g.fillRect(0, 0, S, S);
      for (let i = 0; i < S * 60; i++) {
        const x = r() * S, y = r() * S, a = r() * 6.28, l = 4 + r() * 8, sh = 60 + r() * 150;
        g.strokeStyle = "rgba(" + (sh | 0) + "," + (sh | 0) + "," + (sh | 0) + ",0.8)"; g.lineWidth = 0.9;
        wrapLine(g, S, x, y, x + Math.cos(a) * l, y + Math.sin(a) * l);
      }
    });
  };

  Gfx._gen.leaf = function (S) {   // broadleaf detail
    return paint(S, function (g, S) {
      const r = rng(23);
      g.fillStyle = "#6c6c6c"; g.fillRect(0, 0, S, S);
      for (let i = 0; i < S * 0.9; i++) {
        const x = r() * S, y = r() * S, sh = 70 + r() * 150;
        g.fillStyle = "rgba(" + (sh | 0) + "," + (sh | 0) + "," + (sh | 0) + ",0.85)";
        const rad = 2 + r() * 4;
        for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
          g.beginPath(); g.ellipse(x + ox * S, y + oy * S, rad, rad * 0.6, r() * 3, 0, 6.28); g.fill();
        }
      }
    });
  };

  Gfx._gen.crate = function (S) {
    return paint(S, function (g, S) {
      const r = rng(31);
      g.fillStyle = "#8a7050"; g.fillRect(0, 0, S, S);
      const nb = 5;
      for (let i = 0; i < nb; i++) {
        const y0 = i * S / nb, sh = 100 + r() * 40;
        g.fillStyle = "rgb(" + sh + "," + (sh * 0.78 | 0) + "," + (sh * 0.55 | 0) + ")"; g.fillRect(0, y0 + 2, S, S / nb - 3);
        for (let k = 0; k < 20; k++) { g.strokeStyle = "rgba(60,40,20," + (0.15 + r() * 0.2) + ")"; g.lineWidth = 1; g.beginPath(); const yy = y0 + 4 + r() * (S / nb - 8); g.moveTo(0, yy); g.lineTo(S, yy + (r() - 0.5) * 3); g.stroke(); }
      }
      g.strokeStyle = "rgba(40,28,16,0.95)"; g.lineWidth = 6; g.strokeRect(3, 3, S - 6, S - 6);
      g.strokeStyle = "rgba(60,44,24,0.9)"; g.lineWidth = 8; g.beginPath(); g.moveTo(6, 6); g.lineTo(S - 6, S - 6); g.stroke();
      g.fillStyle = "rgba(30,24,18,0.9)"; [[10, 10], [S - 10, 10], [10, S - 10], [S - 10, S - 10]].forEach(p => { g.beginPath(); g.arc(p[0], p[1], 3, 0, 6.28); g.fill(); });
    });
  };
  Gfx._gen.treebark = function (S) {   // neutral grey: tints come from vertex colours
    return make(S, function (u, v) {
      const warp = fbm(u, v, 4, 3, 21) * 0.2;
      const ridge = Math.abs(Math.sin((u + warp) * 6.283 * 5));
      const n = fbm(u, v, 6, 5, 3), fine = fbm(u, v * 0.3, 20, 3, 8);
      const c = (0.35 + 0.6 * Math.pow(ridge, 0.8)) * (0.6 + 0.7 * n) * (0.85 + 0.3 * fine);
      return [clamp(c, 0, 1), clamp(c, 0, 1), clamp(c, 0, 1), ridge * 0.8 + n * 0.2];
    });
  };

  Gfx._gen.stone = function (S) {    // cobbles / fieldstone, neutral grey
    const rg = rng(8), pts = [];
    for (let i = 0; i < 26; i++) pts.push([rg(), rg(), 0.6 + rg() * 0.4]);
    return make(S, function (u, v) {
      let d1 = 9, d2 = 9, id = 0;
      for (let i = 0; i < pts.length; i++) {
        let dx = Math.abs(u - pts[i][0]), dy = Math.abs(v - pts[i][1]);
        if (dx > 0.5) dx = 1 - dx; if (dy > 0.5) dy = 1 - dy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < d1) { d2 = d1; d1 = d; id = i; } else if (d < d2) d2 = d;
      }
      const edge = clamp((d2 - d1) * 22, 0, 1), n = fbm(u, v, 12, 4, 5);
      const c = (0.35 + 0.3 * pts[id][2] + (n - 0.5) * 0.3) * (0.45 + 0.55 * edge);
      return [clamp(c * 1.0, 0, 1), clamp(c * 0.99, 0, 1), clamp(c * 0.96, 0, 1), clamp(edge * 0.8 + n * 0.2, 0, 1)];
    });
  };

  Gfx._gen.grasscard = function (S) {   // clump of blades on transparent background (alpha tested)
    const r = rng(41), cv = document.createElement("canvas"); cv.width = cv.height = S;
    const g = cv.getContext("2d");
    for (let i = 0; i < 26; i++) {
      const x0 = S * (0.5 + (r() - 0.5) * 0.5), lean = (r() - 0.5) * S * 0.5, hgt = S * (0.45 + r() * 0.5), wd = S * (0.018 + r() * 0.022);
      const sh = 110 + r() * 120;
      const gr = g.createLinearGradient(0, S, 0, S - hgt);
      gr.addColorStop(0, "rgb(" + (sh * 0.35 | 0) + "," + (sh * 0.5 | 0) + "," + (sh * 0.3 | 0) + ")");
      gr.addColorStop(1, "rgb(" + (sh * 0.9 | 0) + "," + (sh | 0) + "," + (sh * 0.7 | 0) + ")");
      g.fillStyle = gr; g.beginPath();
      g.moveTo(x0 - wd, S); g.quadraticCurveTo(x0 - wd + lean * 0.3, S - hgt * 0.55, x0 + lean, S - hgt);
      g.quadraticCurveTo(x0 + wd + lean * 0.3, S - hgt * 0.55, x0 + wd, S); g.fill();
    }
    const d = g.getImageData(0, 0, S, S).data, rgba = new Uint8ClampedArray(d), h = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) h[i] = d[i * 4 + 3] / 255;
    return { rgba: rgba, h: h };
  };

  Gfx._gen.fern = function (S) {
    const r = rng(52), cv = document.createElement("canvas"); cv.width = cv.height = S;
    const g = cv.getContext("2d");
    for (let f = 0; f < 9; f++) {
      const a = -1.57 + (f - 4) * 0.33 + (r() - 0.5) * 0.1, len = S * (0.38 + r() * 0.14);
      const bx = S / 2, by = S * 0.97, ex = bx + Math.cos(a) * len, ey = by + Math.sin(a) * len * 1.0;
      g.strokeStyle = "rgb(70,110,60)"; g.lineWidth = 2; g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo((bx + ex) / 2, by + Math.sin(a) * len * 0.8 - len * 0.12, ex, ey); g.stroke();
      for (let k = 1; k < 16; k++) {
        const t = k / 16, px = bx + (ex - bx) * t, py = by + (ey - by) * t - Math.sin(t * 3.14) * len * 0.1, ll = (1 - t * 0.8) * S * 0.09;
        const sh = 90 + r() * 90;
        g.strokeStyle = "rgb(" + (sh * 0.5 | 0) + "," + (sh | 0) + "," + (sh * 0.45 | 0) + ")"; g.lineWidth = 2.2 - t;
        g.beginPath(); g.moveTo(px, py); g.lineTo(px - Math.sin(a + 1.57) * 0 - ll, py + ll * 0.3); g.moveTo(px, py); g.lineTo(px + ll, py + ll * 0.3); g.stroke();
      }
    }
    const d = g.getImageData(0, 0, S, S).data, rgba = new Uint8ClampedArray(d), h = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) h[i] = d[i * 4 + 3] / 255;
    return { rgba: rgba, h: h };
  };

  Gfx._gen.path = function (S) {      // worn dirt track: u across the track (alpha fades at both edges), v along
    return make(S, function (u, v) {
      const n = fbm(u, v, 5, 5, 66), fine = fbm(u, v, 40, 2, 9), e = fbm(0.5, v, 6, 3, 17);
      const k = sstep(0.0, 0.22 + e * 0.12, u) * sstep(0.0, 0.22 + fbm(0.2, v, 6, 3, 19) * 0.12, 1 - u);
      const rut = 1 - 0.25 * Math.exp(-Math.pow((u - 0.32) * 9, 2)) - 0.25 * Math.exp(-Math.pow((u - 0.68) * 9, 2));
      let c = (0.4 + (n - 0.5) * 0.45 + (fine - 0.5) * 0.25) * rut;
      const stone = fine > 0.8 ? 0.16 : 0;
      c += stone;
      const grassy = Math.max(0, 0.45 - k) * 1.2;
      return [clamp(c * (1 - grassy * 0.35), 0, 1), clamp(c * 0.86 + grassy * 0.1, 0, 1), clamp(c * 0.66 - grassy * 0.02, 0, 1), clamp(n * 0.6 + rut * 0.3 + stone, 0, 1), clamp(k * 0.96, 0, 1)];
    });
  };

  Gfx._gen.mist = function (S) {
    return make(S, function (u, v) {
      const n = fbm(u, v, 3, 6, 91);
      const a = sstep(0.38, 0.8, n);
      return [0.6, 0.72, 0.85, n, a * 0.9];
    });
  };

  Gfx._gen.paper = function (S) {
    const r = rng(77), cv = document.createElement("canvas"); cv.width = cv.height = S;
    const g = cv.getContext("2d");
    g.fillStyle = "#d9d0b4"; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 400; i++) { g.fillStyle = "rgba(120,100,60," + (r() * 0.08) + ")"; g.fillRect(r() * S, r() * S, 2 + r() * 14, 1 + r() * 3); }
    g.strokeStyle = "rgba(60,50,40,0.75)"; g.lineWidth = 1.4;
    for (let y = 0.14; y < 0.93; y += 0.052) {
      let x = S * 0.1; const maxx = S * (0.7 + r() * 0.2);
      g.beginPath(); g.moveTo(x, S * y);
      while (x < maxx) { x += 3 + r() * 5; g.lineTo(x, S * y + (r() - 0.5) * 3.2); if (r() < 0.14) { x += 6; g.moveTo(x, S * y); } }
      g.stroke();
    }
    g.fillStyle = "rgba(80,50,30,0.18)"; g.beginPath(); g.arc(S * 0.8, S * 0.8, S * 0.07, 0, 6.28); g.fill();
    const d = g.getImageData(0, 0, S, S).data, rgba = new Uint8ClampedArray(d), h = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) h[i] = d[i * 4] / 255;
    return { rgba: rgba, h: h };
  };
  Gfx._gen.treeatlas = function (S) {      // left half = bark, right half = needles/leaves (neutral grey, tinted by vertex colours)
    return make(S, function (u, v) {
      if (u < 0.5) {
        const uu = u * 2, warp = fbm(uu, v, 4, 3, 21) * 0.2;
        const ridge = Math.abs(Math.sin((uu + warp) * 6.283 * 4));
        const n = fbm(uu, v, 6, 5, 3), fine = fbm(uu, v * 0.3, 20, 3, 8);
        const c = (0.3 + 0.65 * Math.pow(ridge, 0.8)) * (0.6 + 0.7 * n) * (0.85 + 0.3 * fine);
        return [clamp(c, 0, 1), clamp(c, 0, 1), clamp(c, 0, 1), ridge * 0.8 + n * 0.2];
      }
      const uu = (u - 0.5) * 2, a = fbm(uu, v, 24, 3, 5), b = fbm(uu + 0.3, v, 10, 4, 12);
      const c = 0.28 + 0.72 * a * (0.55 + 0.65 * b);
      return [clamp(c, 0, 1), clamp(c, 0, 1), clamp(c, 0, 1), clamp(a * 0.7 + b * 0.3, 0, 1)];
    });
  };

  Gfx._gen.streak = function (S) {      // rain streak: thin vertical line fading at both ends
    return make(S, function (u, v) {
      const d = Math.abs(u - 0.5) * 2, k = Math.pow(Math.max(0, 1 - d), 2.2) * Math.sin(Math.min(1, Math.max(0, v)) * 3.1416);
      return [0.8, 0.88, 1, k, k];
    });
  };
})();



/* ===================================================== texture / material API */
Gfx._normalFrom = function (h, S, strength) {
  const out = new Uint8ClampedArray(S * S * 4);
  const at = (x, y) => h[((y + S) % S) * S + ((x + S) % S)];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      let nx = -dx, ny = dy, nz = 1;
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz); nx /= l; ny /= l; nz /= l;
      const i = (y * S + x) * 4;
      out[i] = (nx * 0.5 + 0.5) * 255; out[i + 1] = (ny * 0.5 + 0.5) * 255; out[i + 2] = (nz * 0.5 + 0.5) * 255; out[i + 3] = 255;
    }
  }
  return out;
};

Gfx._makeTexture = function (rgba, S, o) {
  o = o || {};
  const cv = document.createElement("canvas"); cv.width = cv.height = S;
  const g = cv.getContext("2d");
  const id = g.createImageData(S, S); id.data.set(rgba); g.putImageData(id, 0, 0);
  const dev = Gfx.device;
  const fmt = pc.PIXELFORMAT_RGBA8 !== undefined ? pc.PIXELFORMAT_RGBA8 : pc.PIXELFORMAT_R8_G8_B8_A8;
  const opts = { width: S, height: S, format: fmt, mipmaps: o.mipmaps !== false };
  if (o.srgb) opts.srgb = true;
  if (o.name) opts.name = o.name;
  if (pc.FILTER_LINEAR_MIPMAP_LINEAR !== undefined) { opts.minFilter = pc.FILTER_LINEAR_MIPMAP_LINEAR; opts.magFilter = pc.FILTER_LINEAR; }
  const tex = new pc.Texture(dev, opts);
  const addr = o.clamp ? pc.ADDRESS_CLAMP_TO_EDGE : pc.ADDRESS_REPEAT;
  tex.addressU = addr; tex.addressV = addr;
  try { tex.anisotropy = Math.min(Gfx.quality === "HIGH" ? 8 : 4, dev.maxAnisotropy || 1); } catch (e) { /* ignore */ }
  tex.setSource(cv);
  Gfx.canvases[o.name || ("t" + Math.random())] = cv;
  return tex;
};

/* {diffuse, normal} textures for a generator kind (cached) */
Gfx.tex = function (kind, opt) {
  const S = (opt && opt.size) || Gfx.texSize;
  const key = kind + "|" + S + "|" + (opt && opt.boards ? opt.boards : "") + (opt && opt.vertical ? "v" : "");
  if (Gfx.texCache[key]) return Gfx.texCache[key];
  const gen = Gfx._gen[kind];
  if (!gen) return null;
  const r = gen(S, opt);
  const strength = { planks: 3.2, bark: 5, concrete: 3, corrugated: 4.5, shingle: 5, dirt: 4, grass: 2.2, asphalt: 3, water: 6, metal: 3.5, fabric: 3, needles: 3, leaf: 2.5, crate: 2.5, treebark: 5, stone: 5, grasscard: 1, fern: 1, path: 3, mist: 1, paper: 1.2, treeatlas: 6, streak: 1 }[kind] || 3;
  const t = {
    diffuse: Gfx._makeTexture(r.rgba, S, { srgb: true, name: kind + "_d" }),
    normal: Gfx._makeTexture(Gfx._normalFrom(r.h, S, strength), S, { name: kind + "_n" })
  };
  Gfx.texCache[key] = t;
  return t;
};

/* shared StandardMaterial from a spec.
   spec: { tex, tint(hex), bump, gloss, metal, em(hex), emI, op, vc(vertex colours), tile:[u,v], noNormal, cull, name, boards, vertical } */
Gfx.mat = function (spec) {
  const key = JSON.stringify(spec);
  if (Gfx.matCache[key]) return Gfx.matCache[key];
  const m = new pc.StandardMaterial();
  const hex = spec.tint == null ? 0xffffff : spec.tint;
  m.diffuse = new pc.Color(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
  if (spec.tex) {
    const t = Gfx.tex(spec.tex, spec);
    if (t) {
      m.diffuseMap = t.diffuse;
      if (!spec.noNormal) { m.normalMap = t.normal; m.bumpiness = spec.bump == null ? 1 : spec.bump; }
      const tl = spec.tile || [1, 1];
      if ("diffuseMapTiling" in m) m.diffuseMapTiling = new pc.Vec2(tl[0], tl[1]);
      if ("normalMapTiling" in m) m.normalMapTiling = new pc.Vec2(tl[0], tl[1]);
    }
  }
  if (spec.vc) { m.diffuseVertexColor = true; }
  m.useMetalness = true;
  m.metalness = spec.metal || 0;
  m.gloss = spec.gloss == null ? 0.18 : spec.gloss;
  if (spec.em != null) {
    m.emissive = new pc.Color(((spec.em >> 16) & 255) / 255, ((spec.em >> 8) & 255) / 255, (spec.em & 255) / 255);
    m.emissiveIntensity = spec.emI == null ? 1 : spec.emI;
  }
  if (spec.op != null && spec.op < 1) { m.opacity = spec.op; m.blendType = pc.BLEND_NORMAL; m.depthWrite = false; }
  if (spec.cull === "none") m.cull = pc.CULLFACE_NONE;
  if (spec.alphaMode && m.diffuseMap) {
    m.opacityMap = m.diffuseMap; m.opacityMapChannel = "a";
    if (spec.alphaMode === "test") { m.alphaTest = spec.alphaTest || 0.45; if ("alphaToCoverage" in m) m.alphaToCoverage = false; }
    else { m.blendType = pc.BLEND_NORMAL; m.depthWrite = false; }
    if ("opacityMapTiling" in m && spec.tile) m.opacityMapTiling = new pc.Vec2(spec.tile[0], spec.tile[1]);
  }
  if (spec.fog === false) m.useFog = false;
  if (spec.unlit) m.useLighting = false;
  if (spec.spec != null) { m.useMetalness = false; m.specular = new pc.Color(spec.spec, spec.spec, spec.spec * 1.05); }
  if (spec.depthBias) { m.depthBias = spec.depthBias; m.slopeDepthBias = spec.depthBias; }
  m.update();
  Gfx.matCache[key] = m;
  return m;
};

/* ============================================================ mesh builder */
function _rot(x, y, z, rx, ry, rz) {
  // rotation order: Z, then X, then Y (degrees)
  const d = Math.PI / 180;
  let c, s, t;
  if (rz) { c = Math.cos(rz * d); s = Math.sin(rz * d); t = x * c - y * s; y = x * s + y * c; x = t; }
  if (rx) { c = Math.cos(rx * d); s = Math.sin(rx * d); t = y * c - z * s; z = y * s + z * c; y = t; }
  if (ry) { c = Math.cos(ry * d); s = Math.sin(ry * d); t = x * c + z * s; z = -x * s + z * c; x = t; }
  return [x, y, z];
}

class GfxBuilder {
  constructor(seed) {
    this.p = []; this.n = []; this.uv = []; this.c = []; this.i = []; this.count = 0;
    let a = (seed || 1) >>> 0;
    this.rnd = function () { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  /* add a primitive: pos[] (xyz), nor[] or null, uv[], idx[]; opt: x,y,z,rx,ry,rz,col,vary,ao */
  _add(pos, nor, uv, idx, o) {
    o = o || {};
    const nv = pos.length / 3, base = this.count;
    const tp = new Array(pos.length), tn = new Array(pos.length);
    for (let v = 0; v < nv; v++) {
      let r = _rot(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2], o.rx || 0, o.ry || 0, o.rz || 0);
      tp[v * 3] = r[0] + (o.x || 0); tp[v * 3 + 1] = r[1] + (o.y || 0); tp[v * 3 + 2] = r[2] + (o.z || 0);
      if (nor) { r = _rot(nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2], o.rx || 0, o.ry || 0, o.rz || 0); tn[v * 3] = r[0]; tn[v * 3 + 1] = r[1]; tn[v * 3 + 2] = r[2]; }
    }
    if (!nor) {      // accumulate face normals (flat when vertices are not shared)
      for (let i = 0; i < tn.length; i++) tn[i] = 0;
      for (let t = 0; t < idx.length; t += 3) {
        const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
        const ux = tp[b] - tp[a], uy = tp[b + 1] - tp[a + 1], uz = tp[b + 2] - tp[a + 2];
        const vx = tp[c] - tp[a], vy = tp[c + 1] - tp[a + 1], vz = tp[c + 2] - tp[a + 2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        [a, b, c].forEach(k => { tn[k] += nx; tn[k + 1] += ny; tn[k + 2] += nz; });
      }
    }
    // colour: constant, function(worldY, vertexIndex), or white
    const vary = o.vary ? (1 + (this.rnd() - 0.5) * 2 * o.vary) : 1;
    for (let v = 0; v < nv; v++) {
      const l = Math.sqrt(tn[v * 3] * tn[v * 3] + tn[v * 3 + 1] * tn[v * 3 + 1] + tn[v * 3 + 2] * tn[v * 3 + 2]) || 1;
      this.p.push(tp[v * 3], tp[v * 3 + 1], tp[v * 3 + 2]);
      this.n.push(tn[v * 3] / l, tn[v * 3 + 1] / l, tn[v * 3 + 2] / l);
      this.uv.push(uv[v * 2], uv[v * 2 + 1]);
      let col = o.col || [255, 255, 255];
      if (o.vcols) col = o.vcols[v] || col;
      if (typeof col === "function") col = col(tp[v * 3 + 1], v);
      let k = vary;
      if (o.ao) { const ao = o.ao; k *= ao.min + (1 - ao.min) * Math.min(1, Math.max(0, (tp[v * 3 + 1] - ao.y0) / Math.max(0.01, ao.y1 - ao.y0))); }
      this.c.push(Math.min(255, col[0] * k), Math.min(255, col[1] * k), Math.min(255, col[2] * k), 255);
    }
    for (let i = 0; i < idx.length; i++) this.i.push(idx[i] + base);
    this.count += nv;
  }

  /* axis aligned box centred on its own origin, placed at o.x/y/z. ts = metres per texture tile.
     UVs are world-space (when not rotated) so neighbouring boxes continue the same texture. */
  box(w, h, d, o) {
    o = o || {}; const ts = o.ts || 2, hw = w / 2, hh = h / 2, hd = d / 2;
    const ox = o.x || 0, oy = o.y || 0, oz = o.z || 0, wuv = o.wuv !== false && !o.rx && !o.ry && !o.rz;
    const P = [], N = [], U = [], I = [];
    const face = (nx, ny, nz, ax, ay, az, bx, by, bz, du, dv) => {
      const k = P.length / 3, px = nx * hw, py = ny * hh, pz = nz * hd;
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (s) {
        const vx = px + ax * s[0] * du / 2 + bx * s[1] * dv / 2, vy = py + ay * s[0] * du / 2 + by * s[1] * dv / 2, vz = pz + az * s[0] * du / 2 + bz * s[1] * dv / 2;
        P.push(vx, vy, vz); N.push(nx, ny, nz);
        if (wuv) U.push(((vx + ox) * ax + (vy + oy) * ay + (vz + oz) * az) / ts, ((vx + ox) * bx + (vy + oy) * by + (vz + oz) * bz) / ts);
        else U.push((s[0] * 0.5 + 0.5) * du / ts, (s[1] * 0.5 + 0.5) * dv / ts);
      });
      I.push(k, k + 1, k + 2, k, k + 2, k + 3);
    };
    face(1, 0, 0, 0, 0, -1, 0, 1, 0, d, h); face(-1, 0, 0, 0, 0, 1, 0, 1, 0, d, h);
    face(0, 0, 1, 1, 0, 0, 0, 1, 0, w, h); face(0, 0, -1, -1, 0, 0, 0, 1, 0, w, h);
    if (o.noTop !== true) face(0, 1, 0, 1, 0, 0, 0, 0, -1, w, d);
    if (o.noBottom !== true) face(0, -1, 0, 1, 0, 0, 0, 0, 1, w, d);
    this._add(P, N, U, I, o);
    return this;
  }

  /* tapered cylinder, base at y=0 of its own space. r0 base radius, r1 top radius */
  cyl(r0, r1, h, seg, o) {
    o = o || {}; seg = seg || 8; const ts = o.ts || 2, P = [], N = [], U = [], I = [];
    const slope = (r0 - r1) / h;
    for (let j = 0; j <= 1; j++) {
      for (let s = 0; s <= seg; s++) {
        const a = s / seg * 6.2832, ca = Math.cos(a), sa = Math.sin(a), r = j ? r1 : r0;
        const jit = o.jit ? 1 + (this.rnd() - 0.5) * o.jit : 1;
        P.push(ca * r * jit, j * h, sa * r * jit);
        const l = Math.sqrt(1 + slope * slope);
        N.push(ca / l, slope / l, sa / l);
        U.push(o.uRange ? o.uRange[0] + (o.uRange[1] - o.uRange[0]) * s / seg : s / seg * (6.2832 * Math.max(r0, 0.05) / ts) * (o.uMul || 1), j * h / ts);
      }
    }
    for (let s = 0; s < seg; s++) { const a = s, b = s + 1, c = seg + 1 + s, d = seg + 2 + s; I.push(a, c, b, b, c, d); }
    if (o.cap !== false && r1 > 0) {
      const k = P.length / 3; P.push(0, h, 0); N.push(0, 1, 0); U.push(0.5, 0.5);
      for (let s = 0; s <= seg; s++) { const a = s / seg * 6.2832; P.push(Math.cos(a) * r1, h, Math.sin(a) * r1); N.push(0, 1, 0); U.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5); }
      for (let s = 0; s < seg; s++) I.push(k, k + 1 + s + 1, k + 1 + s);
    }
    this._add(P, N, U, I, o);
    return this;
  }

  /* jagged cone / drooping foliage tier: base at y=0, apex at y=h. jag = radius jitter, droop = outer rim lowered */
  tier(r, h, seg, o) {
    o = o || {}; seg = seg || 9; const jag = o.jag == null ? 0.22 : o.jag, droop = o.droop || 0, ts = o.ts || 1.5;
    const P = [], U = [], I = [];
    // apex ring: apex + inner ring + outer rim
    P.push(0, h, 0); U.push(0.5, 0.5);
    const rims = [];
    for (let s = 0; s < seg; s++) {
      const a = s / seg * 6.2832 + (this.rnd() - 0.5) * 0.25, rr = r * (1 - jag + this.rnd() * jag * 2 * (s % 2 ? 1 : 0.6));
      rims.push([Math.cos(a) * rr, -droop * (0.4 + this.rnd() * 0.6), Math.sin(a) * rr]);
    }
    const mids = rims.map(p => [p[0] * 0.55, h * 0.42 + p[1] * 0.3, p[2] * 0.55]);
    mids.forEach(p => { P.push(p[0], p[1], p[2]); U.push(0.5 + p[0] / (r * 2), 0.5 + p[2] / (r * 2)); });
    rims.forEach(p => { P.push(p[0], p[1], p[2]); U.push(0.5 + p[0] / (r * 2), 0.5 + p[2] / (r * 2)); });
    for (let s = 0; s < seg; s++) {
      const n = (s + 1) % seg;
      I.push(0, 1 + n, 1 + s);                                   // apex -> mid ring
      I.push(1 + s, 1 + n, 1 + seg + s, 1 + n, 1 + seg + n, 1 + seg + s);   // mid -> rim
    }
    // underside (dark)
    const k = P.length / 3; P.push(0, 0.05, 0); U.push(0.5, 0.5);
    rims.forEach(p => { P.push(p[0], p[1], p[2]); U.push(0.5 + p[0] / (r * 2), 0.5 + p[2] / (r * 2)); });
    for (let s = 0; s < seg; s++) I.push(k, k + 1 + s, k + 1 + (s + 1) % seg);
    void ts;
    if (o.uvRect) { const R = o.uvRect; for (let k = 0; k < U.length; k += 2) { U[k] = R[0] + U[k] * R[2]; U[k + 1] = R[1] + U[k + 1] * R[3]; } }
    else for (let k = 0; k < U.length; k++) U[k] *= (o.uvScale || 1.5);
    this._add(P, null, U, I, o);
    return this;
  }

  /* ellipsoid, centred. jit = radial jitter 0..1 (organic clumps) */
  sphere(rx, ry, rz, seg, rings, o) {
    o = o || {}; seg = seg || 8; rings = rings || 6; const P = [], N = [], U = [], I = [];
    const jv = [];
    for (let r = 0; r <= rings; r++) for (let s = 0; s <= seg; s++) jv.push(1 + (o.jit ? (this.rnd() - 0.5) * o.jit : 0));
    for (let r = 0; r <= rings; r++) {
      const phi = r / rings * Math.PI, y = Math.cos(phi), rr = Math.sin(phi);
      for (let s = 0; s <= seg; s++) {
        const a = s / seg * 6.2832, j = (s === seg ? jv[r * (seg + 1)] : jv[r * (seg + 1) + s]);
        const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
        P.push(x * rx * j, y * ry * j, z * rz * j);
        N.push(x / rx, y / ry, z / rz);
        if (o.uvRect) U.push(o.uvRect[0] + s / seg * o.uvRect[2], o.uvRect[1] + r / rings * o.uvRect[3]);
        else U.push(s / seg * (o.uvRep || 2), r / rings * (o.uvRep || 2));
      }
    }
    for (let r = 0; r < rings; r++) for (let s = 0; s < seg; s++) {
      const a = r * (seg + 1) + s, b = a + 1, c = a + seg + 1, d = c + 1;
      I.push(a, b, c, b, d, c);
    }
    this._add(P, o.jit ? null : N, U, I, o);
    return this;
  }

  /* vertical double-sided card (grass/fern). width w, height h, centred at base y=0, facing +z */
  card(w, h, o) {
    o = o || {}; const u0 = o.u0 || 0, u1 = o.u1 == null ? 1 : o.u1;
    const P = [-w / 2, 0, 0, w / 2, 0, 0, w / 2, h, 0, -w / 2, h, 0];
    const bend = o.bend || 0;     // leans the top
    P[7] += 0; P[6] += bend; P[9] += bend;
    const U = [u0, 1, u1, 1, u1, 0, u0, 0];
    this._add(P.concat(P), [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1], U.concat(U), [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6], o);
    return this;
  }

  /* arbitrary quad from 4 points (p = [x,y,z]*4), uv rect scaled by world size / ts */
  quad(p0, p1, p2, p3, o) {
    o = o || {}; const ts = o.ts || 2;
    const l01 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]), l12 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]);
    this._add([].concat(p0, p1, p2, p3), null, [0, 0, l01 / ts, 0, l01 / ts, l12 / ts, 0, l12 / ts], [0, 1, 2, 0, 2, 3], o);
    return this;
  }

  /* horizontal grid (ground) with per-vertex colour function colFn(x,z) -> [r,g,b] and height fn */
  grid(x0, z0, x1, z1, nx, nz, colFn, hFn, o) {
    o = o || {}; const ts = o.ts || 6, P = [], U = [], C = [], I = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = x0 + (x1 - x0) * i / nx, z = z0 + (z1 - z0) * j / nz;
      P.push(x, hFn ? hFn(x, z) : 0, z); U.push(x / ts, z / ts);
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      I.push(a, c, b, b, c, d);
    }
    const base = this.count, nv = P.length / 3;
    const N = new Array(P.length).fill(0);
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const nxx = uy * vz - uz * vy, nyy = uz * vx - ux * vz, nzz = ux * vy - uy * vx;
      [a, b, c].forEach(k => { N[k] += nxx; N[k + 1] += nyy; N[k + 2] += nzz; });
    }
    for (let v = 0; v < nv; v++) {
      const l = Math.sqrt(N[v * 3] * N[v * 3] + N[v * 3 + 1] * N[v * 3 + 1] + N[v * 3 + 2] * N[v * 3 + 2]) || 1;
      const col = colFn ? colFn(P[v * 3], P[v * 3 + 2]) : [255, 255, 255];
      this.p.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); this.n.push(N[v * 3] / l, Math.abs(N[v * 3 + 1] / l), N[v * 3 + 2] / l);
      this.uv.push(U[v * 2], U[v * 2 + 1]); this.c.push(col[0], col[1], col[2], 255);
    }
    I.forEach(i => this.i.push(i + base));
    this.count += nv;
    return this;
  }

  /* gable roof: footprint w (x) by d (z), base at y=0; rise = ridge height, over = overhang.
     Ridge runs along the longer side unless o.ridgeX is given. Slopes use o.col, gable ends o.endCol, underside o.underCol. */
  gable(w, d, rise, over, o) {
    o = o || {}; const ts = o.ts || 2;
    const ridgeX = o.ridgeX == null ? (w >= d) : o.ridgeX;
    const L = (ridgeX ? w : d) / 2 + over, Wd = (ridgeX ? d : w) / 2 + over;
    const sl = Math.hypot(Wd, rise);
    const P = [], N = [], U = [], I = [], C = [];
    const sc = o.col || [255, 255, 255], ec = o.endCol || [70, 54, 40], uc = o.underCol || [60, 46, 34];
    const add = (pts, n, uvs, col) => { const k = P.length / 3; pts.forEach(p => { P.push(p[0], p[1], p[2]); N.push(n[0], n[1], n[2]); C.push(col); }); uvs.forEach(u => U.push(u[0], u[1])); if (pts.length === 4) I.push(k, k + 1, k + 2, k, k + 2, k + 3); else I.push(k, k + 1, k + 2); };
    const nz = rise / sl, ny = Wd / sl;
    add([[-L, 0, Wd], [L, 0, Wd], [L, rise, 0], [-L, rise, 0]], [0, ny, nz], [[0, 0], [2 * L / ts, 0], [2 * L / ts, sl / ts], [0, sl / ts]], sc);
    add([[L, 0, -Wd], [-L, 0, -Wd], [-L, rise, 0], [L, rise, 0]], [0, ny, -nz], [[0, 0], [2 * L / ts, 0], [2 * L / ts, sl / ts], [0, sl / ts]], sc);
    const ei = Math.max(0.05, over * 0.9);
    add([[L - over * 0.9, 0, Wd - ei], [L - over * 0.9, 0, -Wd + ei], [L - over * 0.9, rise * (1 - ei / Wd), 0]], [1, 0, 0], [[0, 0], [1, 0], [0.5, 0.7]], ec);
    add([[-L + over * 0.9, 0, -Wd + ei], [-L + over * 0.9, 0, Wd - ei], [-L + over * 0.9, rise * (1 - ei / Wd), 0]], [-1, 0, 0], [[0, 0], [1, 0], [0.5, 0.7]], ec);
    add([[-L, -0.02, -Wd], [L, -0.02, -Wd], [L, -0.02, Wd], [-L, -0.02, Wd]], [0, -1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], uc);
    this._add(P, N, U, I, Object.assign({}, o, { vcols: C, ry: o.ry != null ? o.ry : (ridgeX ? 0 : 90) }));
    return this;
  }

  /* copy another builder's geometry into this one, scaled (sx, sy), rotated about Y (degrees) and moved to (x, y, z) */
  append(src, x, y, z, sx, sy, ryDeg) {
    const base = this.count, nv = src.p.length / 3, c = Math.cos(ryDeg * Math.PI / 180), s = Math.sin(ryDeg * Math.PI / 180);
    for (let v = 0; v < nv; v++) {
      const px = src.p[v * 3] * sx, py = src.p[v * 3 + 1] * sy, pz = src.p[v * 3 + 2] * sx;
      this.p.push(px * c + pz * s + x, py + y, -px * s + pz * c + z);
      const nx = src.n[v * 3], ny = src.n[v * 3 + 1], nz = src.n[v * 3 + 2];
      this.n.push(nx * c + nz * s, ny, -nx * s + nz * c);
      this.uv.push(src.uv[v * 2], src.uv[v * 2 + 1]);
      this.c.push(src.c[v * 4], src.c[v * 4 + 1], src.c[v * 4 + 2], src.c[v * 4 + 3]);
    }
    for (let i = 0; i < src.i.length; i++) this.i.push(src.i[i] + base);
    this.count += nv;
    return this;
  }

  /* finish: returns pc.Mesh (or null when empty) */
  build(name) {
    if (!this.count) return null;
    const dev = Gfx.device, mesh = new pc.Mesh(dev);
    mesh.setPositions(new Float32Array(this.p));
    mesh.setNormals(new Float32Array(this.n));
    mesh.setUvs(0, new Float32Array(this.uv));
    mesh.setColors32(new Uint8Array(this.c));
    mesh.setIndices(this.count > 65535 ? new Uint32Array(this.i) : new Uint16Array(this.i));
    mesh.update();
    mesh.name = name || "mesh";
    return mesh;
  }
}
Gfx.Builder = GfxBuilder;

/* entity that renders a mesh with a material */
Gfx.meshEntity = function (parent, mesh, material, o) {
  o = o || {};
  const e = new pc.Entity(o.name || "mesh");
  if (o.x != null) e.setLocalPosition(o.x, o.y || 0, o.z || 0);
  if (o.sx != null) e.setLocalScale(o.sx, o.sy == null ? o.sx : o.sy, o.sz == null ? o.sx : o.sz);
  if (o.rx || o.ry || o.rz) e.setLocalEulerAngles(o.rx || 0, o.ry || 0, o.rz || 0);
  (parent || Gfx.app.root).addChild(e);
  const mi = new pc.MeshInstance(mesh, material);
  e.addComponent("render", { meshInstances: [mi], castShadows: !!o.shadow, receiveShadows: o.recv !== false });
  e.mi = mi;
  return e;
};

/* ================================================================== sky + glow */
Gfx._skyTexture = function () {
  const W = 8, H = 512, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, "#03060f"); gr.addColorStop(0.2, "#050b1b"); gr.addColorStop(0.36, "#0b1830"); gr.addColorStop(0.45, "#17304d"); gr.addColorStop(0.5, "#223f5c");
  gr.addColorStop(0.505, "#223f5c"); gr.addColorStop(1, "#223f5c");
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  return cv;
};

/* stars (small camera-centred quads on the dome) + moon sprite */
Gfx._buildStars = function (parent) {
  const r = World.rng(404), R = 112, N = 1700, B = new GfxBuilder(9);
  const P = [], U = [], I = [], C = [];
  let k = 0;
  const md = Gfx.moonDir;
  for (let i = 0; i < N; i++) {
    let x, y, z;
    for (let tries = 0; tries < 8; tries++) {
      const a = r() * 6.2832, yy = Math.pow(r(), 0.7) * 0.97 + 0.03, rr = Math.sqrt(1 - yy * yy);
      x = Math.cos(a) * rr; y = yy; z = Math.sin(a) * rr;
      // thicker near a milky-way great circle, and keep stars away from the moon
      const band = Math.abs(x * 0.35 + y * 0.8 + z * -0.5);
      if (r() < 0.25 + 0.75 * Math.max(0, 1 - band * 3.2)) { const dm = x * md[0] + y * md[1] + z * md[2]; if (dm < 0.985) break; }
    }
    const m = Math.pow(r(), 3.0), sz = (0.0016 + m * 0.0042) * R, br = 0.35 + m * 0.65, tint = r();
    // tangent frame
    let tx = -z, ty = 0, tz = x; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    const bx = y * tz - z * ty, by = z * tx - x * tz, bz = x * ty - y * tx;
    const cx = x * R, cy = y * R, cz = z * R;
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (s) { P.push(cx + (tx * s[0] + bx * s[1]) * sz, cy + (ty * s[0] + by * s[1]) * sz, cz + (tz * s[0] + bz * s[1]) * sz); });
    U.push(0, 1, 1, 1, 1, 0, 0, 0);
    for (let q = 0; q < 4; q++) C.push(255 * br * (0.82 + tint * 0.18), 255 * br * (0.88 + tint * 0.1), 255 * br * (1.0 - tint * 0.25), 255);
    I.push(k, k + 1, k + 2, k, k + 2, k + 3); k += 4;
  }
  B.p = P; B.uv = U; B.i = I; B.count = P.length / 3; B.c = C;
  B.n = new Array(P.length).fill(0).map((v, i) => (i % 3 === 1 ? 1 : 0));
  const mesh = B.build("stars");
  const t = Gfx._glowTex("glow_star", 64, 0.3);
  const m = new pc.StandardMaterial();
  m.diffuse = new pc.Color(0, 0, 0); m.emissive = new pc.Color(1, 1, 1); m.emissiveVertexColor = true; m.emissiveIntensity = 1.6;
  m.opacityMap = t; m.opacityMapChannel = "a"; m.blendType = pc.BLEND_ADDITIVEALPHA !== undefined ? pc.BLEND_ADDITIVEALPHA : pc.BLEND_ADDITIVE;
  m.useLighting = false; m.useFog = false; m.depthWrite = false; m.cull = pc.CULLFACE_NONE; m.update();
  const e = Gfx.meshEntity(parent, mesh, m, { name: "stars", recv: false });
  e.mi.drawBucket = 1; e.mi.cull = false;
  Gfx.stars = e;
  // moon sprite
  const S = 256, cv = document.createElement("canvas"); cv.width = cv.height = S;
  const g = cv.getContext("2d"), c = S / 2;
  const halo = g.createRadialGradient(c, c, 0, c, c, c);
  halo.addColorStop(0, "rgba(190,215,255,0.55)"); halo.addColorStop(0.2, "rgba(130,165,230,0.28)"); halo.addColorStop(0.5, "rgba(80,110,180,0.08)"); halo.addColorStop(1, "rgba(60,90,160,0)");
  g.fillStyle = halo; g.fillRect(0, 0, S, S);
  const disc = g.createRadialGradient(c - 4, c - 4, 4, c, c, 30);
  disc.addColorStop(0, "#fbfdff"); disc.addColorStop(1, "#d9e4f6");
  g.fillStyle = disc; g.beginPath(); g.arc(c, c, 28, 0, 6.283); g.fill();
  g.fillStyle = "rgba(140,158,190,0.5)";
  [[-9, -6, 6], [8, 4, 5], [-3, 11, 4], [11, -9, 3.2], [-14, 6, 2.6]].forEach(function (q) { g.beginPath(); g.arc(c + q[0], c + q[1], q[2], 0, 6.283); g.fill(); });
  const d = g.getImageData(0, 0, S, S).data;
  const mt = Gfx._makeTexture(d, S, { srgb: true, mipmaps: true, clamp: true, name: "moon" });
  const mm = new pc.StandardMaterial();
  mm.diffuse = new pc.Color(0, 0, 0); mm.emissive = new pc.Color(1, 1, 1); mm.emissiveMap = mt; mm.emissiveIntensity = 1.3; mm.opacityMap = mt; mm.opacityMapChannel = "a";
  mm.blendType = pc.BLEND_NORMAL; mm.useLighting = false; mm.useFog = false; mm.depthWrite = false; mm.cull = pc.CULLFACE_NONE; mm.update();
  const MB = new GfxBuilder(3), ms = 17, dist = 108;
  let mx = -md[2] * 0 + 0, ux = 0;
  const mdx = md[0], mdy = md[1], mdz = md[2];
  let tx2 = -mdz, tz2 = mdx; const tl2 = Math.hypot(tx2, tz2) || 1; tx2 /= tl2; tz2 /= tl2;
  const bx2 = mdy * tz2, by2 = mdz * tx2 - mdx * tz2, bz2 = -mdy * tx2;
  const q = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(function (s) { return [mdx * dist + (tx2 * s[0] + bx2 * s[1]) * ms, mdy * dist + (by2 * s[1]) * ms, mdz * dist + (tz2 * s[0] + bz2 * s[1]) * ms]; });
  MB._add([].concat.apply([], q), [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], [0, 1, 1, 1, 1, 0, 0, 0], [0, 1, 2, 0, 2, 3], {});
  void mx; void ux;
  const me = Gfx.meshEntity(parent, MB.build("moon"), mm, { name: "moon_sprite", recv: false });
  me.mi.drawBucket = 2; me.mi.cull = false;
  Gfx.moonSprite = me;
};

Gfx._cloudTexture = function () {
  const S = 256, rgba = new Uint8ClampedArray(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, n = Gfx.N.fbm(u, v, 4, 6, 303);
    const a = Gfx.N.sstep(0.5, 0.82, n);
    const i = (y * S + x) * 4;
    rgba[i] = 26 + n * 30; rgba[i + 1] = 36 + n * 36; rgba[i + 2] = 56 + n * 46; rgba[i + 3] = a * 215;
  }
  return rgba;
};

/* creates sky dome (+ cloud layer) following the camera */
Gfx.buildSky = function (parent) {
  const B = new GfxBuilder(3);
  // inward-facing sphere
  const seg = 48, rings = 24, P = [], U = [], I = [], R = 118;
  for (let r = 0; r <= rings; r++) {
    const phi = r / rings * Math.PI, y = Math.cos(phi), rr = Math.sin(phi);
    for (let s = 0; s <= seg; s++) {
      const a = s / seg * 6.2832;
      // longitude 0 at -z (matches atan2(x,-z) used for the moon)
      P.push(Math.sin(a) * rr * R, y * R, -Math.cos(a) * rr * R); U.push(s / seg, r / rings);
    }
  }
  for (let r = 0; r < rings; r++) for (let s = 0; s < seg; s++) { const a = r * (seg + 1) + s, b = a + 1, c = a + seg + 1, d = c + 1; I.push(a, c, b, b, c, d); }
  B._add(P, P.map((v, i) => 0), U, I, { col: [255, 255, 255] });
  const mesh = B.build("sky");
  const m = new pc.StandardMaterial();
  const cvs = Gfx._skyTexture();
  const t2 = new pc.Texture(Gfx.device, { width: 8, height: 512, format: pc.PIXELFORMAT_RGBA8 !== undefined ? pc.PIXELFORMAT_RGBA8 : pc.PIXELFORMAT_R8_G8_B8_A8, mipmaps: false, srgb: true, name: "sky" });
  t2.addressU = pc.ADDRESS_REPEAT; t2.addressV = pc.ADDRESS_CLAMP_TO_EDGE; t2.setSource(cvs);
  m.diffuse = new pc.Color(0, 0, 0); m.emissive = new pc.Color(1, 1, 1); m.emissiveMap = t2; m.emissiveIntensity = 1;
  m.useLighting = false; m.useFog = false; m.depthWrite = false; m.cull = pc.CULLFACE_NONE;
  m.update();
  const e = Gfx.meshEntity(parent, mesh, m, { name: "sky" });
  e.mi.drawBucket = 0;
  Gfx.sky = e;
  Gfx._buildStars(parent);

  // slow cloud layer
  const cB = new GfxBuilder(4), P2 = [], U2 = [], I2 = [], R2 = 112;
  for (let r = 0; r <= 10; r++) {
    const phi = r / 10 * Math.PI * 0.46, y = Math.cos(phi), rr = Math.sin(phi);
    for (let s = 0; s <= 32; s++) {
      const a = s / 32 * 6.2832;
      P2.push(Math.sin(a) * rr * R2, y * R2, -Math.cos(a) * rr * R2); U2.push(Math.sin(a) * rr * 1.6 + 5, -Math.cos(a) * rr * 1.6 + 5);
    }
  }
  for (let r = 0; r < 10; r++) for (let s = 0; s < 32; s++) { const a = r * 33 + s, b = a + 1, c = a + 33, d = c + 1; I2.push(a, c, b, b, c, d); }
  cB._add(P2, P2.map(() => 0), U2, I2, { col: [255, 255, 255] });
  for (let v = 0; v < cB.c.length / 4; v++) { const ring = Math.floor(v / 33) / 10; cB.c[v * 4 + 3] = 255 * (1 - Gfx.N.sstep(0.35, 0.9, ring)); }
  const cm = new pc.StandardMaterial();
  const cloudTex = Gfx._makeTexture(Gfx._cloudTexture(), 256, { srgb: true, name: "clouds" });
  cm.diffuse = new pc.Color(0, 0, 0); cm.emissive = new pc.Color(1, 1, 1); cm.emissiveMap = cloudTex; cm.opacityMap = cloudTex;
  cm.opacityVertexColor = true; cm.blendType = pc.BLEND_NORMAL; cm.useLighting = false; cm.useFog = false; cm.depthWrite = false; cm.cull = pc.CULLFACE_NONE;
  if ("emissiveMapTiling" in cm) cm.emissiveMapTiling = new pc.Vec2(1, 1);
  cm.update();
  const ce = Gfx.meshEntity(parent, cB.build("clouds"), cm, { name: "clouds" });
  ce.mi.drawBucket = 3;
  Gfx.clouds = { e: ce, m: cm };
};

Gfx.updateSky = function (camPos, dt, t) {
  if (!Gfx.sky) return;
  Gfx.sky.setPosition(camPos.x, camPos.y, camPos.z);
  if (Gfx.stars) Gfx.stars.setPosition(camPos.x, camPos.y, camPos.z);
  if (Gfx.moonSprite) Gfx.moonSprite.setPosition(camPos.x, camPos.y, camPos.z);
  if (Gfx.clouds) {
    Gfx.clouds.e.setPosition(camPos.x, camPos.y, camPos.z);
    const m = Gfx.clouds.m;
    if ("emissiveMapOffset" in m) { m.emissiveMapOffset = new pc.Vec2(t * 0.0016, t * 0.0007); m.opacityMapOffset = new pc.Vec2(t * 0.0016, t * 0.0007); m.update(); }
  }
};

/* radial glow texture (additive halo) */
Gfx._glowTex = function (name, size, inner) {
  if (Gfx.texCache[name]) return Gfx.texCache[name];
  const cv = document.createElement("canvas"); cv.width = cv.height = size;
  const g = cv.getContext("2d"), r = size / 2, gr = g.createRadialGradient(r, r, 0, r, r, r);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(inner || 0.18, "rgba(255,255,255,0.55)"); gr.addColorStop(0.5, "rgba(255,255,255,0.14)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const d = g.getImageData(0, 0, size, size).data;
  const t = Gfx._makeTexture(d, size, { srgb: true, mipmaps: false, clamp: true, name: name });
  Gfx.texCache[name] = t;
  return t;
};
Gfx.glowMaterial = function (hex, intensity, name) {
  const key = "glow|" + hex + "|" + intensity;
  if (Gfx.matCache[key]) return Gfx.matCache[key];
  const t = Gfx._glowTex("glow_soft", 128, 0.12);
  const m = new pc.StandardMaterial();
  m.diffuse = new pc.Color(0, 0, 0);
  m.emissive = new pc.Color(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
  m.emissiveIntensity = intensity || 1;
  m.opacityMap = t; m.opacityMapChannel = "a";
  m.blendType = pc.BLEND_ADDITIVEALPHA !== undefined ? pc.BLEND_ADDITIVEALPHA : pc.BLEND_ADDITIVE;
  m.useLighting = false; m.useFog = true; m.depthWrite = false; m.cull = pc.CULLFACE_NONE;
  m.update();
  Gfx.matCache[key] = m;
  void name;
  return m;
};
/* camera facing glow billboard. returns the entity; update with Gfx.updateGlows() */
Gfx.glow = function (parent, x, y, z, size, hex, intensity) {
  const B = new GfxBuilder(1);
  B._add([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], [0, 1, 1, 1, 1, 0, 0, 0], [0, 1, 2, 0, 2, 3], {});
  if (!Gfx._glowMesh) Gfx._glowMesh = B.build("glow");
  const e = Gfx.meshEntity(parent, Gfx._glowMesh, Gfx.glowMaterial(hex, intensity), { name: "glow", x: x, y: y, z: z, sx: size, sy: size, sz: size, recv: false });
  e.glowBase = size;
  Gfx.glows.push(e);
  return e;
};
Gfx.updateGlows = function (camPos) {
  const g = Gfx.glows, cx = camPos.x, cy = camPos.y, cz = camPos.z;
  for (let i = 0; i < g.length; i++) {
    const e = g[i];
    if (!e.enabled) continue;
    const p = e.getPosition(), dx = p.x - cx, dz = p.z - cz;
    if (dx * dx + dz * dz > 5000) continue;
    e.lookAt(cx, cy, cz);
  }
};

/* flashlight cookie: soft hot-spot with a subtle ring and organic edge */
Gfx.flashCookie = function () {
  if (Gfx.texCache.cookie) return Gfx.texCache.cookie;
  const S = 256, rgba = new Uint8ClampedArray(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (x + 0.5) / S * 2 - 1, dy = (y + 0.5) / S * 2 - 1, d = Math.sqrt(dx * dx + dy * dy);
    const n = Gfx.N.fbm(x / S, y / S, 8, 3, 12);
    let k = 1 - Gfx.N.sstep(0.35, 0.97 + (n - 0.5) * 0.12, d);
    k *= 0.82 + 0.18 * Math.max(0, 1 - d * 1.8) + 0.07 * Math.sin(d * 24 + n * 3) * Math.max(0, d - 0.3);
    k *= 0.9 + 0.1 * n;
    const i = (y * S + x) * 4, v = Gfx.N.clamp(k, 0, 1) * 255;
    rgba[i] = v; rgba[i + 1] = v; rgba[i + 2] = v * 0.95; rgba[i + 3] = 255;
  }
  const t = Gfx._makeTexture(rgba, S, { srgb: false, mipmaps: true, clamp: true, name: "cookie" });
  Gfx.texCache.cookie = t;
  return t;
};

/* ========================================================== post processing */
/* Bloom + vignette + grading through CameraFrame (PlayCanvas 2.x). Everything is
   feature-detected and wrapped: if anything is missing the game simply renders
   without post effects. */
Gfx.setupPost = function (camEntity, quality) {
  Gfx.frame = null;
  try {
    const cam = camEntity.camera;
    if (pc.TONEMAP_ACES !== undefined && "toneMapping" in cam) cam.toneMapping = pc.TONEMAP_ACES;
    if (!pc.CameraFrame) return;
    if (quality === "LOW") return;
    const f = new pc.CameraFrame(Gfx.app, cam);
    f.rendering.toneMapping = pc.TONEMAP_ACES !== undefined ? pc.TONEMAP_ACES : 0;
    f.rendering.samples = quality === "HIGH" ? 2 : 1;
    f.rendering.renderTargetScale = 1;
    if (f.bloom) { f.bloom.intensity = quality === "HIGH" ? 0.035 : 0.025; if ("blurLevel" in f.bloom) f.bloom.blurLevel = 14; }
    if (f.vignette) { f.vignette.intensity = 0.55; f.vignette.inner = 0.45; f.vignette.outer = 1.45; if ("curvature" in f.vignette) f.vignette.curvature = 0.6; }
    if (f.grading) { f.grading.enabled = true; f.grading.brightness = 1.0; f.grading.contrast = 1.08; f.grading.saturation = 0.92; if (f.grading.tint) f.grading.tint = new pc.Color(0.93, 0.99, 1.03); }
    if (f.ssao && quality === "HIGH" && pc.SSAOTYPE_LIGHTING !== undefined) { f.ssao.type = pc.SSAOTYPE_LIGHTING; f.ssao.intensity = 0.5; f.ssao.radius = 6; f.ssao.samples = 10; f.ssao.power = 5; }
    if (f.update) f.update();
    Gfx.frame = f;
  } catch (e) { console.warn("[Gfx] post processing unavailable:", e); Gfx.frame = null; }
};
Gfx.applyPostQuality = function (camEntity, quality) {
  try {
    if (Gfx.frame) { Gfx.frame.destroy(); Gfx.frame = null; }
  } catch (e) { /* ignore */ }
  Gfx.setupPost(camEntity, quality);
};
