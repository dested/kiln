import React, { useRef, useEffect, useState, useCallback } from "react";
/* ============================================================
   KILN — an infinite crafting ecology
   Deterministic simulation core. No DOM, no imports.
   ============================================================ */

const MAX_ELEMENTS = 6000;
const MAX_MASS = 256;
const MAX_TIER_LOOKUP = 12;
const GENES = 16;
const SWEEP_PHASES = 6;

/* ---------- deterministic RNG (xorshift32) ---------- */
class RNG {
  constructor(seed) { this.s = (seed >>> 0) || 0x9e3779b9; }
  next() {
    let x = this.s;
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;  x >>>= 0;
    this.s = x; return x;
  }
  f() { return this.next() / 4294967296; }
  int(n) { return this.next() % n; }
  norm() { return (this.f() + this.f() + this.f() - 1.5) * 1.1547; }
}

function hash3(a, b, c) {
  let h = (Math.imul(a, 0x9e3779b1) ^ Math.imul(b, 0x85ebca77) ^ Math.imul(c, 0xc2b2ae3d)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2545f491);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2f);
  h ^= h >>> 16;
  return h >>> 0;
}
const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;

/* ============================================================
   ELEMENT TABLE
   Elements are DISCOVERED, not authored. combine(a,b) mints a new
   element whose properties derive from its parents plus seeded noise.
   ============================================================ */
class ElementTable {
  constructor(seed, nPrimordial) {
    this.seed = seed >>> 0;
    this.n = 0;
    this.nPrimordial = nPrimordial;
    const M = MAX_ELEMENTS;
    this.tier = new Int16Array(M);
    this.mass = new Float32Array(M);   // primordial motes bound up in this thing
    this.hard = new Float32Array(M);   // structural: inert, resists decay
    this.vol  = new Float32Array(M);   // volatility: decay chance
    this.aff  = new Float32Array(M);   // affinity: willingness to react
    this.cat  = new Float32Array(M);   // catalysis: speeds nearby reactions (TOOLS)
    this.fert = new Float32Array(M);   // fertility: self-copies into empty neighbours
    this.nut  = new Float32Array(M);   // nutrition: fraction of charge that is edible
    this.pa   = new Int32Array(M).fill(-1);
    this.pb   = new Int32Array(M).fill(-1);
    this.hue  = new Float32Array(M);
    this.uses = new Int32Array(M);     // times crafted (discovery pressure readout)
    this.bornTick = new Int32Array(M);
    this.pairKey = new Float64Array(M).fill(-1);
    this.pairs = new Map();
    this.free = [];              // recycled ids
    this.totalDiscovered = 0;    // monotonic: counts across the whole run
    this.collected = 0;
    for (let i = 0; i < nPrimordial; i++) this._mintPrimordial(i);
  }
  _mintPrimordial(i) {
    const id = this.n++;
    const h = hash3(this.seed, i, 0x50f1);
    const r = (k) => ((h >>> (k * 4)) & 0xff) / 255;
    this.tier[id] = 0;
    this.mass[id] = 1;
    this.hard[id] = 0.1 + r(0) * 0.7;
    this.vol[id]  = 0.05 + r(1) * 0.25;
    this.aff[id]  = 0.25 + r(2) * 0.7;
    this.cat[id]  = Math.pow(r(3), 4) * 0.5;
    this.fert[id] = Math.pow(r(4), 5) * 0.6;
    this.nut[id]  = 0.06 + r(5) * 0.11;
    this.hue[id]  = (i / Math.max(1, this.nPrimordial)) * 360;
    return id;
  }
  key(a, b) { const lo = a < b ? a : b, hi = a < b ? b : a; return lo * 4096 + hi; }
  /** returns element id, or -1 if the registry is exhausted */
  combine(a, b, tick) {
    const k = this.key(a, b);
    const got = this.pairs.get(k);
    if (got !== undefined) { this.uses[got]++; return got; }
    const m = this.mass[a] + this.mass[b];
    if (m > MAX_MASS) return -1;              // nothing binds beyond this scale
    let id;
    if (this.free.length) id = this.free.pop();
    else if (this.n < MAX_ELEMENTS) id = this.n++;
    else return -1;
    this.totalDiscovered++;
    const lo = a < b ? a : b, hi = a < b ? b : a;
    const h = hash3(this.seed ^ 0x1d3b, lo, hi);
    const r = (k2) => ((h >>> (k2 * 3)) & 0x3ff) / 1023;
    // TIER IS COMPLEXITY, NOT CHAIN LENGTH. Doubling mass buys one tier.
    const t = Math.floor(Math.log2(m));
    const mix = (arr) => (arr[a] * this.mass[a] + arr[b] * this.mass[b]) / m;
    this.mass[id] = m;
    this.tier[id] = t;
    this.hard[id] = clamp01(mix(this.hard) * 0.78 + r(0) * 0.42);
    // entropy climbs with tier: the tech tree has a natural ceiling
    this.vol[id]  = clamp01(mix(this.vol) * 0.72 + r(1) * 0.20 + t * 0.028);
    // big bodies are inert: this is what stops runaway agglomeration
    this.aff[id]  = clamp01(mix(this.aff) * (0.5 + r(2) * 0.7) / (1 + t * 0.42));
    this.cat[id]  = clamp01(Math.pow(r(3), 3) * (0.35 + t * 0.16) * (0.45 + this.hard[id]));
    this.fert[id] = clamp01(Math.pow(r(4), 5) * 0.8);
    // REFINING MAKES MATTER EDIBLE. This is the whole economic reason to craft.
    this.nut[id]  = clamp01(mix(this.nut) * 0.55 + 0.30 + (r(5) - 0.5) * 0.45);
    this.pa[id] = lo; this.pb[id] = hi;
    this.hue[id] = (this.hue[lo] * 0.5 + this.hue[hi] * 0.5 + (r(6) - 0.5) * 90 + 360) % 360;
    this.uses[id] = 1;
    this.bornTick[id] = tick;
    this.pairKey[id] = k;
    this.pairs.set(k, id);
    return id;
  }
}

/* ============================================================
   GENOME  (all genes live in [0,1]; meaning is applied at use)
   0..4  weights over element traits (hard, vol, aff, cat, fert)
   5     tier preference weight
   6     craft drive
   7     hunger threshold
   8     exploration noise
   9     (reserved / thrift)
   10    reproduction threshold
   11    mutation rate
   12    predation drive
   13    diet centre (which tier it digests best)
   14    diet breadth (generalist <-> specialist; breadth costs upkeep)
   15    social drive (how much it follows local tradition)
   ============================================================ */
const G = { W_HARD:0, W_VOL:1, W_AFF:2, W_CAT:3, W_FERT:4, W_TIER:5, CRAFT:6,
            HUNGER:7, EXPLORE:8, THRIFT:9, REPRO:10, MUT:11, PRED:12,
            DIET:13, BREADTH:14, SOCIAL:15 };

const DEFAULT_PARAMS = {
      sunRate: 200,       // energy units entering the world per tick
      sunCap: 1800,
      nPrimordial: 6,
      ventCount: 5,       // spawn clusters per primordial -> biogeography
      ventSigma: 9,
      decayRate: 0.020,
      ambientChem: 0.03,  // spontaneous adjacent reactions
      craftYield: 0.99,   // charge retained when two things become one
      craftCost: 0.05,
      upkeep: 0.100,
      maxEff: 0.92,
      reproCost: 0.10,
      cultureRate: 1.0,   // 0 disables regional traditions
      predation: 1.0,
      fertilityOn: 1.0,
      mutScale: 1.0,
      refineBonus: 0.22, // how steeply refinement pays. 0 = no reason to craft.
    };

/* ============================================================
   WORLD
   ============================================================ */
/* Elements are pure functions of their parents, so an element that no longer
   exists anywhere in the world can be forgotten and re-derived identically
   later. The registry is a working set, not a ledger. */
ElementTable.prototype.collect = function (markFn) {
  const live = new Uint8Array(MAX_ELEMENTS);
  markFn(live);
  let freed = 0;
  for (let id = this.nPrimordial; id < this.n; id++) {
    if (live[id] || this.pairKey[id] < 0) continue;
    this.pairs.delete(this.pairKey[id]);
    this.pairKey[id] = -1;
    this.free.push(id);
    freed++;
  }
  this.collected += freed;
  return freed;
};

class World {
  constructor(opts = {}) {
    this.W = opts.W || 192;
    this.H = opts.H || 120;
    this.seed = (opts.seed >>> 0) || 12345;
    this.p = Object.assign({}, DEFAULT_PARAMS, opts.p || {});

    this.reset();
  }

  reset() {
    const { W, H } = this;
    const N = W * H;
    this.rng = new RNG(hash3(this.seed, 7, 11));
    this.ET = new ElementTable(this.seed, this.p.nPrimordial);
    this.itemType = new Int32Array(N).fill(-1);
    this.charge = new Float32Array(N);
    this.agentAt = new Int32Array(N); // 0 = none, else agentIndex+1
    this.agents = [];
    this.tick = 0;
    this.sun = 600;
    this.nextId = 1;
    this.heat = 0;            // cumulative energy lost to entropy
    this.deaths = 0; this.births = 0; this.crafts = 0; this.kills = 0; this.craftFail = 0;
    this.maxTierEver = 0;
    this.effScratch = new Float32Array(MAX_TIER_LOOKUP + 1);

    // vents: each primordial wells up from a few drifting sources
    this.vents = [];
    for (let p = 0; p < this.p.nPrimordial; p++) {
      const arr = [];
      for (let v = 0; v < this.p.ventCount; v++) {
        arr.push({ x: this.rng.f() * W, y: this.rng.f() * H,
                   vx: (this.rng.f() - 0.5) * 0.02, vy: (this.rng.f() - 0.5) * 0.02 });
      }
      this.vents.push(arr);
    }

    // regional traditions: a coarse grid of demes, each with a recipe-value table
    this.demeW = 12; this.demeH = 8; this.demeTable = 256;
    this.memes = new Float32Array(this.demeW * this.demeH * this.demeTable);

    // seed life
    for (let i = 0; i < 90; i++) this.spawnAgent(null, 3.0);
    // prime the world with raw motes so gen-0 isn't instantly starved
    for (let i = 0; i < N * 0.06; i++) this._spawnMote(true);

    this.history = [];
    this.events = [];
    this.journal = [];
    this._log('Genesis. Seed ' + this.seed + '.');
  }

  setParam(k, v) {
    if (this.p[k] === v) return;
    this.p[k] = v;
    this.journal.push([this.tick, k, v]);
  }

  /* Full in-memory snapshot. Restoring one is instant, which is what makes
     "back up to the last safe point" usable while the thing is running. */
  snapshot() {
    const ET = this.ET;
    return {
      tick: this.tick, sun: this.sun, rng: this.rng.s, nextId: this.nextId,
      heat: this.heat, deaths: this.deaths, births: this.births,
      crafts: this.crafts, kills: this.kills, craftFail: this.craftFail,
      maxTierEver: this.maxTierEver,
      p: Object.assign({}, this.p),
      journal: this.journal.slice(),
      itemType: this.itemType.slice(), charge: this.charge.slice(),
      memes: this.memes.slice(),
      vents: this.vents.map(a => a.map(v => ({ ...v }))),
      agents: this.agents.map(a => ({ ...a, g: a.g.slice() })),
      history: this.history.slice(), events: this.events.slice(),
      et: {
        n: ET.n, free: ET.free.slice(), totalDiscovered: ET.totalDiscovered,
        collected: ET.collected,
        tier: ET.tier.slice(), mass: ET.mass.slice(), hard: ET.hard.slice(),
        vol: ET.vol.slice(), aff: ET.aff.slice(), cat: ET.cat.slice(),
        fert: ET.fert.slice(), nut: ET.nut.slice(), pa: ET.pa.slice(),
        pb: ET.pb.slice(), hue: ET.hue.slice(), uses: ET.uses.slice(),
        bornTick: ET.bornTick.slice(), pairKey: ET.pairKey.slice(),
        pairs: Array.from(ET.pairs.entries()),
      },
    };
  }

  restore(s) {
    const ET = this.ET;
    this.tick = s.tick; this.sun = s.sun; this.rng.s = s.rng; this.nextId = s.nextId;
    this.heat = s.heat; this.deaths = s.deaths; this.births = s.births;
    this.crafts = s.crafts; this.kills = s.kills; this.craftFail = s.craftFail;
    this.maxTierEver = s.maxTierEver;
    this.p = Object.assign({}, s.p);
    this.journal = s.journal.slice();
    this.itemType.set(s.itemType); this.charge.set(s.charge); this.memes.set(s.memes);
    this.vents = s.vents.map(a => a.map(v => ({ ...v })));
    this.agents = s.agents.map(a => ({ ...a, g: a.g.slice() }));
    this.history = s.history.slice(); this.events = s.events.slice();
    const e = s.et;
    ET.n = e.n; ET.free = e.free.slice(); ET.totalDiscovered = e.totalDiscovered;
    ET.collected = e.collected;
    for (const k of ['tier','mass','hard','vol','aff','cat','fert','nut','pa','pb','hue','uses','bornTick','pairKey'])
      ET[k].set(e[k]);
    ET.pairs = new Map(e.pairs);
    this.agentAt.fill(0);
    for (let i = 0; i < this.agents.length; i++)
      this.agentAt[this.idx(this.agents[i].x, this.agents[i].y)] = i + 1;
    return this;
  }

  idx(x, y) { return y * this.W + x; }
  wrapX(x) { const W = this.W; return x < 0 ? x + W : x >= W ? x - W : x; }
  wrapY(y) { const H = this.H; return y < 0 ? y + H : y >= H ? y - H : y; }

  _log(msg) {
    this.events.push({ t: this.tick, msg });
    if (this.events.length > 260) this.events.shift();
  }

  /* ---------- genome ---------- */
  randomGenome() {
    const g = new Float32Array(GENES);
    for (let i = 0; i < GENES; i++) g[i] = this.rng.f();
    g[G.MUT] = 0.10 + this.rng.f() * 0.25;
    g[G.CRAFT] = 0.2 + this.rng.f() * 0.6;
    g[G.PRED] = this.rng.f() * 0.3;
    g[G.BREADTH] = 0.3 + this.rng.f() * 0.5;
    g[G.DIET] = this.rng.f() * 0.35;
    return g;
  }
  mutate(g) {
    const c = new Float32Array(g);
    const m = (0.01 + c[G.MUT] * 0.22) * this.p.mutScale;
    for (let i = 0; i < GENES; i++) {
      c[i] = clamp01(c[i] + this.rng.norm() * m);
    }
    // mutation rate itself evolves, multiplicatively
    c[G.MUT] = Math.min(1, Math.max(0.02, g[G.MUT] * Math.exp(this.rng.norm() * 0.25)));
    return c;
  }

  spawnAgent(parent, energy, x, y) {
    const { W, H } = this;
    let px, py;
    if (x === undefined) {
      let tries = 0;
      do { px = this.rng.int(W); py = this.rng.int(H); tries++; }
      while (this.agentAt[this.idx(px, py)] !== 0 && tries < 30);
      if (this.agentAt[this.idx(px, py)] !== 0) return null;
    } else { px = x; py = y; }
    const a = {
      id: this.nextId++, x: px, y: py,
      e: energy, age: 0,
      g: parent ? this.mutate(parent.g) : this.randomGenome(),
      inv0: -1, inv1: -1, c0: 0, c1: 0,
      tool: -1, tc: 0,                 // equipped catalyst
      body: 0,
      gen: parent ? parent.gen + 1 : 0,
      lineage: parent ? parent.lineage : (this.nextId & 0xffff),
      crafted: 0, ate: 0,
    };
    a.body = Math.max(0, Math.min(MAX_TIER_LOOKUP, Math.round(a.g[G.DIET] * 8)));
    this.agents.push(a);
    this.agentAt[this.idx(px, py)] = this.agents.length;
    return a;
  }

  /* ---------- world chemistry ---------- */
  _spawnMote(free) {
    if (!free && this.sun < 1) return false;
    const p = this.rng.int(this.p.nPrimordial);
    const vents = this.vents[p];
    const v = vents[this.rng.int(vents.length)];
    const x = this.wrapX(Math.round(v.x + this.rng.norm() * this.p.ventSigma));
    const y = this.wrapY(Math.round(v.y + this.rng.norm() * this.p.ventSigma));
    const i = this.idx(x, y);
    if (this.itemType[i] !== -1) return false;
    this.itemType[i] = p; this.charge[i] = 1;
    if (!free) this.sun -= 1;
    return true;
  }

  _placeItem(i, type, charge) {
    if (this.itemType[i] === -1) { this.itemType[i] = type; this.charge[i] = charge; return true; }
    // try the 8 neighbours
    const x = i % this.W, y = (i / this.W) | 0;
    for (let k = 0; k < 8; k++) {
      const dx = [1,-1,0,0,1,1,-1,-1][k], dy = [0,0,1,-1,1,-1,1,-1][k];
      const j = this.idx(this.wrapX(x + dx), this.wrapY(y + dy));
      if (this.itemType[j] === -1) { this.itemType[j] = type; this.charge[j] = charge; return true; }
    }
    this.sun = Math.min(this.p.sunCap, this.sun + charge * 0.5);
    this.heat += charge * 0.5;
    return false;
  }

  demeOf(x, y) {
    const dx = Math.min(this.demeW - 1, (x * this.demeW / this.W) | 0);
    const dy = Math.min(this.demeH - 1, (y * this.demeH / this.H) | 0);
    return (dy * this.demeW + dx) * this.demeTable;
  }
  memeSlot(a, b) { return hash3(a, b, 0xc0ffee) % this.demeTable; }

  /* Edible fraction of an item's charge: refined matter is more digestible
     and more concentrated; hard matter resists being eaten at all. */
  edible(t) {
    const ET = this.ET;
    return ET.nut[t] * (1 - 0.6 * ET.hard[t]) * (1 + this.p.refineBonus * ET.tier[t]);
  }

  /* ---------- per-agent digestion curve ---------- */
  _buildEff(a) {
    const centre = a.g[G.DIET] * 8;
    const width = 0.50 + a.g[G.BREADTH] * 2.0;
    const inv = 1 / (2 * width * width);
    for (let t = 0; t <= MAX_TIER_LOOKUP; t++) {
      const d = t - centre;
      this.effScratch[t] = this.p.maxEff * Math.exp(-d * d * inv);
    }
    return this.effScratch;
  }

  /* ============================================================
     TICK
     ============================================================ */
  step() {
    const { W, H, ET, p } = this;
    const N = W * H;
    const rng = this.rng;
    this.sun = Math.min(p.sunCap, this.sun + p.sunRate);

    // --- vents drift, so biomes migrate and niches never settle
    for (const arr of this.vents) for (const v of arr) {
      v.x = this.wrapX(v.x + v.vx); v.y = this.wrapY(v.y + v.vy);
      if (rng.f() < 0.002) { v.vx = (rng.f() - 0.5) * 0.05; v.vy = (rng.f() - 0.5) * 0.05; }
    }

    // --- primordial influx (matter is minted only from the sun budget)
    let budget = Math.min(this.sun, p.sunRate + this.sun * 0.08);
    let placed = 0, attempts = 0;
    while (placed < budget && attempts < budget * 6) {
      attempts++;
      if (this._spawnMote(false)) placed++;
    }

    // --- strided sweep: decay, ambient chemistry, fertility
    const phase = this.tick % SWEEP_PHASES;
    const rateScale = SWEEP_PHASES;
    for (let i = phase; i < N; i += SWEEP_PHASES) {
      const t = this.itemType[i];
      if (t === -1) continue;
      const x = i % W, y = (i / W) | 0;

      // decay -> falls back to one parent, remainder to heat
      if (rng.f() < ET.vol[t] * p.decayRate * rateScale * (1 - ET.hard[t] * 0.85)) {
        const c = this.charge[i];
        this.itemType[i] = -1; this.charge[i] = 0;
        const par = ET.pa[t];
        if (par >= 0) {
          this._placeItem(i, par, c * 0.45);
          this.sun = Math.min(p.sunCap, this.sun + c * 0.25);
          this.heat += c * 0.30;
        } else {
          this.sun = Math.min(p.sunCap, this.sun + c * 0.6);
          this.heat += c * 0.4;
        }
        continue;
      }

      // ambient chemistry: adjacent motes react on their own
      if (p.ambientChem > 0) {
        const k = rng.int(4);
        const dx = [1,-1,0,0][k], dy = [0,0,1,-1][k];
        const j = this.idx(this.wrapX(x + dx), this.wrapY(y + dy));
        const t2 = this.itemType[j];
        if (t2 !== -1) {
          const catBoost = 1 + (ET.cat[t] + ET.cat[t2]) * 9;
          const pr = ET.aff[t] * ET.aff[t2] * p.ambientChem * rateScale * 0.02 * catBoost;
          if (rng.f() < pr) {
            const nid = ET.combine(t, t2, this.tick);
            if (nid >= 0) {
              const c = (this.charge[i] + this.charge[j]) * p.craftYield;
              this.heat += (this.charge[i] + this.charge[j]) * (1 - p.craftYield);
              this.itemType[j] = -1; this.charge[j] = 0;
              this.itemType[i] = nid; this.charge[i] = c;
              this.crafts++;
              this._noteTier(nid);
              continue;
            }
          }
        }
      }

      // fertility: rare self-replicating matter, paid for out of the sun budget
      if (p.fertilityOn > 0 && ET.fert[t] > 0.02 && this.sun > 5) {
        if (rng.f() < ET.fert[t] * 0.02 * rateScale) {
          const k = rng.int(8);
          const dx = [1,-1,0,0,1,1,-1,-1][k], dy = [0,0,1,-1,1,-1,1,-1][k];
          const j = this.idx(this.wrapX(x + dx), this.wrapY(y + dy));
          if (this.itemType[j] === -1) {
            const cost = Math.min(this.charge[i], 2);
            this.sun -= cost; this.itemType[j] = t; this.charge[j] = cost;
          }
        }
      }
    }

    // --- culture: slow forgetting + diffusion between neighbouring demes
    if (p.cultureRate > 0 && (this.tick % 20) === 0) {
      const M = this.memes;
      for (let i = 0; i < M.length; i++) M[i] *= 0.995;
      for (let d = 0; d < 6; d++) {
        const dx = rng.int(this.demeW - 1), dy = rng.int(this.demeH);
        const A = (dy * this.demeW + dx) * this.demeTable;
        const B = (dy * this.demeW + dx + 1) * this.demeTable;
        for (let s = 0; s < this.demeTable; s++) {
          const avg = (M[A + s] + M[B + s]) * 0.5;
          M[A + s] += (avg - M[A + s]) * 0.25;
          M[B + s] += (avg - M[B + s]) * 0.25;
        }
      }
    }

    // --- agents
    const order = this.agents;
    for (let ai = 0; ai < order.length; ai++) {
      this._agentStep(order[ai], ai);
    }
    this._compact();

    // --- extinction guard
    if (this.agents.length < 6 && this.sun > 60) {
      for (let i = 0; i < 10; i++) this.spawnAgent(null, 3.0);
      this.sun -= 30;
      this._log('Reseeded: population collapsed below viability.');
    }

    if ((this.tick % 150) === 0 && this.tick > 0) this._collect();
    this.tick++;
    if (this.tick % 25 === 0) this._sample();
    return this;
  }

  _collect() {
    const ET = this.ET;
    if (ET.free.length + (MAX_ELEMENTS - ET.n) > MAX_ELEMENTS * 0.30) return;
    const freed = ET.collect((live) => {
      for (let i = 0; i < this.itemType.length; i++) {
        const t = this.itemType[i];
        if (t !== -1) { live[t] = 1; }
      }
      for (const a of this.agents) {
        if (a.inv0 >= 0) live[a.inv0] = 1;
        if (a.inv1 >= 0) live[a.inv1] = 1;
        if (a.tool >= 0) live[a.tool] = 1;
      }
      // keep ancestors of anything live, so lineage chains stay readable
      for (let pass = 0; pass < 14; pass++) {
        let changed = 0;
        for (let id = ET.nPrimordial; id < ET.n; id++) {
          if (!live[id]) continue;
          const pa = ET.pa[id], pb = ET.pb[id];
          if (pa >= 0 && !live[pa]) { live[pa] = 1; changed++; }
          if (pb >= 0 && !live[pb]) { live[pb] = 1; changed++; }
        }
        if (!changed) break;
      }
    });
    if (freed > 0) this._log(`Forgot ${freed} extinct elements; the space reopens.`);
  }

  _noteTier(id) {
    const t = this.ET.tier[id];
    if (t > this.maxTierEver) {
      this.maxTierEver = t;
      this._log(`Tier ${t} reached — element #${id} discovered.`);
    }
  }

  _agentStep(a, ai) {
    if (a.e <= 0) return;
    const { W, H, ET, p } = this;
    const g = a.g;
    const rng = this.rng;

    const breadth = 0.50 + g[G.BREADTH] * 2.0;
    a.e -= p.upkeep * (1 + 0.14 * breadth);
    a.age++;
    if (a.e <= 0) { this._kill(a, ai); return; }

    const eff = this._buildEff(a);
    const reproThresh = 2.5 + g[G.REPRO] * 7;
    const hunger = clamp01(1 - a.e / (reproThresh * 0.6));
    const wH = (g[G.W_HARD] - 0.5) * 2, wV = (g[G.W_VOL] - 0.5) * 2;
    const wA = (g[G.W_AFF] - 0.5) * 2, wC = (g[G.W_CAT] - 0.5) * 2;
    const wF = (g[G.W_FERT] - 0.5) * 2, wT = (g[G.W_TIER] - 0.5) * 2;
    const social = p.cultureRate * g[G.SOCIAL];
    const demeBase = this.demeOf(a.x, a.y);
    const held = a.inv0 >= 0 ? a.inv0 : (a.inv1 >= 0 ? a.inv1 : -1);

    const itemScore = (i) => {
      const t = this.itemType[i];
      if (t === -1) return 0;
      const tt = ET.tier[t] > MAX_TIER_LOOKUP ? MAX_TIER_LOOKUP : ET.tier[t];
      const food = this.charge[i] * this.edible(t) * eff[tt];
      let s = food * (0.4 + hunger * 3.2);
      s += wH * ET.hard[t] + wV * ET.vol[t] + wA * ET.aff[t]
         + wC * ET.cat[t] * 3 + wF * ET.fert[t] * 3 + wT * tt * 0.22;
      if (social > 0 && held >= 0) s += social * this.memes[demeBase + this.memeSlot(held, t)] * 1.5;
      return s;
    };

    // --- perception over the Moore neighbourhood + own cell
    let bestS = -1e9, bx = a.x, by = a.y, bi = this.idx(a.x, a.y);
    const explore = g[G.EXPLORE];
    for (let k = 0; k < 9; k++) {
      const dx = [0,1,-1,0,0,1,1,-1,-1][k], dy = [0,0,0,1,-1,1,-1,1,-1][k];
      const nx = this.wrapX(a.x + dx), ny = this.wrapY(a.y + dy);
      const i = this.idx(nx, ny);
      let s = itemScore(i);
      const occ = this.agentAt[i];
      if (occ !== 0 && occ - 1 !== ai) {
        const other = this.agents[occ - 1];
        if (other && other.e > 0) {
          const dist = this._gdist(g, other.g);
          const pred = (g[G.PRED] * p.predation) * Math.min(1, dist * 2.5);
          s += pred * other.e * 0.45 * eff[Math.min(MAX_TIER_LOOKUP, other.body + 2)] - (1 - pred) * 0.6;
        }
      } else if (k > 0 && occ === 0) {
        s += 0.02; // mild preference for open ground
      }
      s += rng.norm() * explore * 0.55;
      if (s > bestS) { bestS = s; bx = nx; by = ny; bi = i; }
    }

    // --- act on the chosen cell
    const targetOcc = this.agentAt[bi];
    if (targetOcc !== 0 && targetOcc - 1 !== ai) {
      const other = this.agents[targetOcc - 1];
      if (other && other.e > 0) {
        const dist = this._gdist(g, other.g);
        const desire = g[G.PRED] * p.predation * Math.min(1, dist * 2.5);
        if (rng.f() < desire) {
          a.e -= 0.22;                                   // the attempt costs whatever happens
          const odds = a.e / (a.e + other.e + 0.001);
          if (rng.f() < odds) {
            const got = other.e * 0.45 * eff[Math.min(MAX_TIER_LOOKUP, other.body + 2)];
            a.e += got;
            this.heat += other.e - got;
            other.e = -1;
            this._kill(other, targetOcc - 1, true);
            this.kills++;
          } else {
            a.e -= 0.30; other.e -= 0.20;                // it fought back
            if (a.e <= 0) { this._kill(a, ai); return; }
          }
        }
      }
    } else if (bi !== this.idx(a.x, a.y)) {
      this.agentAt[this.idx(a.x, a.y)] = 0;
      a.x = bx; a.y = by;
      this.agentAt[bi] = ai + 1;
    }

    // --- interact with whatever is underfoot
    const here = this.idx(a.x, a.y);
    const t = this.itemType[here];
    if (t !== -1) {
      const tt = ET.tier[t] > MAX_TIER_LOOKUP ? MAX_TIER_LOOKUP : ET.tier[t];
      const food = this.charge[here] * this.edible(t) * eff[tt];
      const starving = a.e < (0.20 + g[G.HUNGER] * 1.2);
      const worthEating = 0.30 + (1 - g[G.CRAFT]) * 0.9;
      const eatNow = starving || food > worthEating;
      if (eatNow && food > 0.015) {
        a.e += food;
        this.heat += this.charge[here] - food;
        this.sun = Math.min(p.sunCap, this.sun + (this.charge[here] - food) * 0.35);
        this.itemType[here] = -1; this.charge[here] = 0;
        a.ate++;
      } else if (wC > 0 && ET.cat[t] > 0.06 && ET.cat[t] > (a.tool >= 0 ? ET.cat[a.tool] : 0)) {
        // a better catalyst than the one in hand: equip it
        if (a.tool >= 0) this._placeItem(here, a.tool, a.tc);
        a.tool = t; a.tc = this.charge[here];
        this.itemType[here] = -1; this.charge[here] = 0;
      } else if (a.inv0 === -1) {
        a.inv0 = t; a.c0 = this.charge[here];
        this.itemType[here] = -1; this.charge[here] = 0;
      } else if (a.inv1 === -1) {
        a.inv1 = t; a.c1 = this.charge[here];
        this.itemType[here] = -1; this.charge[here] = 0;
      }
    }

    // --- craft: two hands, one product
    if (a.inv0 >= 0 && a.inv1 >= 0) {
      if (rng.f() < g[G.CRAFT] && a.e > p.craftCost * 2) {
        const before = a.c0 * this.edible(a.inv0) + a.c1 * this.edible(a.inv1);
        const nid = ET.combine(a.inv0, a.inv1, this.tick);
        if (nid < 0) this.craftFail++;
        if (nid >= 0) {
          const slot = this.memeSlot(a.inv0, a.inv1);
          const q = a.tool >= 0 ? ET.cat[a.tool] : 0;                 // tool quality
          const yieldEff = 1 - (1 - p.craftYield) * (1 - 0.75 * q);
          const c = (a.c0 + a.c1) * yieldEff;
          this.heat += (a.c0 + a.c1) * (1 - yieldEff);
          a.e -= p.craftCost * (1 - 0.65 * q);
          if (a.tool >= 0) {
            a.tc -= 0.012 * (1 + q);                                   // tools wear
            if (a.tc <= 0) { this.heat += Math.max(0, a.tc); a.tool = -1; a.tc = 0; }
          }
          const after = c * this.edible(nid);
          if (p.cultureRate > 0) {
            const profit = Math.max(-1, Math.min(3, after - before));
            this.memes[demeBase + slot] += profit * 0.12;
          }
          a.inv0 = nid; a.c0 = c; a.inv1 = -1; a.c1 = 0;
          a.crafted++; this.crafts++;
          this._noteTier(nid);
        }
      } else if (rng.f() < 0.015) {
        this._placeItem(here, a.inv1, a.c1); a.inv1 = -1; a.c1 = 0;
      }
    }
    // eat the loose item first; the artifact in the other hand is capital
    const hungryAt = 0.6 + g[G.HUNGER] * 4.0;
    if (a.inv1 >= 0 && a.e < hungryAt) {
      const tt = Math.min(MAX_TIER_LOOKUP, ET.tier[a.inv1]);
      const food = a.c1 * this.edible(a.inv1) * eff[tt];
      a.e += food; this.heat += a.c1 - food;
      a.inv1 = -1; a.c1 = 0;
    }
    if (a.inv0 >= 0 && a.e < 0.18) {                 // desperation: eat the capital
      const tt = Math.min(MAX_TIER_LOOKUP, ET.tier[a.inv0]);
      const food = a.c0 * this.edible(a.inv0) * eff[tt];
      a.e += food; this.heat += a.c0 - food;
      a.inv0 = a.inv1; a.c0 = a.c1; a.inv1 = -1; a.c1 = 0;
    }
    // cache the artifact when comfortable -> stockpiles, and a tech tree that
    // a population can climb further than any individual could
    if (a.inv0 >= 0 && ET.tier[a.inv0] >= 2 && a.e > hungryAt * 1.4 &&
        rng.f() < g[G.THRIFT] * 0.09) {
      if (this.itemType[here] === -1) {
        this.itemType[here] = a.inv0; this.charge[here] = a.c0;
        a.inv0 = a.inv1; a.c0 = a.c1; a.inv1 = -1; a.c1 = 0;
      }
    }

    // --- reproduce
    if (a.e > reproThresh) {
      for (let k = 0; k < 8; k++) {
        const dx = [1,-1,0,0,1,1,-1,-1][k], dy = [0,0,1,-1,1,-1,1,-1][k];
        const nx = this.wrapX(a.x + dx), ny = this.wrapY(a.y + dy);
        const j = this.idx(nx, ny);
        if (this.agentAt[j] === 0) {
          const share = a.e * 0.45;
          a.e = a.e * 0.45 - this.p.reproCost;
          this.heat += a.e * 0.10;
          const child = this.spawnAgent(a, share, nx, ny);
          if (child) { this.agentAt[j] = this.agents.length; this.births++; }
          break;
        }
      }
    }
  }

  _gdist(g1, g2) {
    let s = 0;
    for (let i = 0; i < 8; i++) { const d = g1[i] - g2[i]; s += d * d; }
    const d13 = g1[G.DIET] - g2[G.DIET]; s += d13 * d13 * 4;
    return Math.sqrt(s / 9);
  }

  _kill(a, ai, eaten) {
    if (a.dead) return;
    a.dead = true;
    const here = this.idx(a.x, a.y);
    if (this.agentAt[here] === ai + 1) this.agentAt[here] = 0;
    if (!eaten) {
      const e = Math.max(0, a.e);
      if (e > 0.25) {
        this._placeItem(here, hash3(a.lineage, 3, 9) % this.p.nPrimordial, e * 0.8);
        this.heat += e * 0.2;
      } else {
        this.sun = Math.min(this.p.sunCap, this.sun + e * 0.5);
        this.heat += e * 0.5;
      }
    }
    if (a.inv0 >= 0) this._placeItem(here, a.inv0, a.c0);
    if (a.inv1 >= 0) this._placeItem(here, a.inv1, a.c1);
    if (a.tool >= 0 && a.tc > 0) this._placeItem(here, a.tool, a.tc);
    this.deaths++;
  }

  _compact() {
    const alive = [];
    for (const a of this.agents) if (!a.dead && a.e > 0) alive.push(a);
    if (alive.length !== this.agents.length) {
      this.agents = alive;
      this.agentAt.fill(0);
      for (let i = 0; i < alive.length; i++) this.agentAt[this.idx(alive[i].x, alive[i].y)] = i + 1;
    }
  }

  /* ---------- telemetry ---------- */
  stats() {
    const n = this.agents.length;
    let e = 0, gen = 0, pred = 0, craft = 0, diet = 0, breadth = 0, social = 0, mut = 0, tierSum = 0;
    let tooled = 0, toolQ = 0, bodySum = 0, thrift = 0;
    for (const a of this.agents) {
      if (a.tool >= 0) { tooled++; toolQ += this.ET.cat[a.tool]; }
      bodySum += a.body;
      e += a.e; gen += a.gen; thrift += a.g[G.THRIFT];
      pred += a.g[G.PRED]; craft += a.g[G.CRAFT]; diet += a.g[G.DIET];
      breadth += a.g[G.BREADTH]; social += a.g[G.SOCIAL]; mut += a.g[G.MUT];
    }
    let items = 0, chargeTot = 0, maxT = 0;
    for (let i = 0; i < this.itemType.length; i++) {
      const t = this.itemType[i];
      if (t !== -1) { items++; chargeTot += this.charge[i]; tierSum += this.ET.tier[t]; if (this.ET.tier[t] > maxT) maxT = this.ET.tier[t]; }
    }
    const d = n || 1;
    return {
      tick: this.tick, pop: n, sun: this.sun, items, chargeTot,
      meanE: e / d, meanGen: gen / d, elements: this.ET.n,
      maxTierEver: this.maxTierEver, maxTierAlive: maxT,
      meanTierGround: items ? tierSum / items : 0,
      gPred: pred / d, gCraft: craft / d, gDiet: diet / d,
      gBreadth: breadth / d, gSocial: social / d, gMut: mut / d, gThrift: thrift / d,
      crafts: this.crafts, kills: this.kills, heat: this.heat,
      tooled: tooled / d, toolQ: tooled ? toolQ / tooled : 0, meanBody: bodySum / d,
    };
  }
  _sample() {
    const s = this.stats();
    this.history.push(s);
    if (this.history.length > 900) this.history.shift();
  }
}


/* ============================================================
   CONSOLE
   ============================================================ */

const C = {
  ink: '#12171A', well: '#090D0F', bone: '#DAD5C5', bone2: '#C6C0AC',
  rule: '#A9A28B', verd: '#2F7D6E', verdLo: '#1F5B50', ochre: '#C08A2E',
  ox: '#8C3A2B', dim: '#6E6857',
};

const PARAMS = [
  { k: 'sunRate',     label: 'Sunlight',     min: 10,   max: 600,  step: 5,     fmt: v => v + '/tick',
    note: 'Energy entering the world. Scales population; barely moves matter density.' },
  { k: 'upkeep',      label: 'Metabolism',   min: 0.02, max: 0.30, step: 0.005, fmt: v => v.toFixed(3),
    note: 'The real density control. Higher means fewer, hungrier agents in a richer world.' },
  { k: 'refineBonus', label: 'Refinement premium', min: 0, max: 0.6, step: 0.01, fmt: v => '×' + (1 + v).toFixed(2) + '/tier',
    note: 'How steeply crafting pays. At zero there is no reason to ever make anything.' },
  { k: 'decayRate',   label: 'Decay',        min: 0.002, max: 0.08, step: 0.002, fmt: v => v.toFixed(3),
    note: 'How fast matter falls back toward its parents.' },
  { k: 'ambientChem', label: 'Ambient chemistry', min: 0, max: 0.30, step: 0.005, fmt: v => v.toFixed(3),
    note: 'Reactions that happen with no agent involved.' },
  { k: 'craftYield',  label: 'Craft yield',  min: 0.80, max: 1.0,  step: 0.005, fmt: v => (v * 100).toFixed(1) + '%',
    note: 'Charge kept when two things become one.' },
  { k: 'craftCost',   label: 'Craft cost',   min: 0,    max: 0.4,  step: 0.01,  fmt: v => v.toFixed(2),
    note: 'Energy burned per combination.' },
  { k: 'mutScale',    label: 'Mutation',     min: 0,    max: 4,    step: 0.05,  fmt: v => '×' + v.toFixed(2),
    note: 'Multiplier on all inherited variation.' },
  { k: 'predation',   label: 'Predation',    min: 0,    max: 2.5,  step: 0.05,  fmt: v => '×' + v.toFixed(2),
    note: 'Appetite for eating each other. Zero forbids it outright.' },
  { k: 'cultureRate', label: 'Tradition',    min: 0,    max: 4,    step: 0.1,   fmt: v => '×' + v.toFixed(1),
    note: 'Strength of regional recipe knowledge. Does not evolve on its own — force it.' },
  { k: 'fertilityOn', label: 'Fertile matter', min: 0,  max: 1,    step: 1,     fmt: v => v ? 'on' : 'off',
    note: 'Whether rare self-copying matter exists at all.' },
];

const PRESETS = {
  Temperate:  {},
  Garden:     { sunRate: 380, upkeep: 0.07, decayRate: 0.012, refineBonus: 0.28, predation: 0.4 },
  'Hard winter': { sunRate: 70, upkeep: 0.13, decayRate: 0.045, craftCost: 0.09 },
  Toolmakers: { ambientChem: 0.12, craftYield: 0.995, refineBonus: 0.34, upkeep: 0.085 },
  'Red queen': { mutScale: 2.6, predation: 2.0, sunRate: 260, decayRate: 0.03 },
  'Flat world': { refineBonus: 0, ambientChem: 0.005 },
};

const VIEWS = ['Matter', 'Tier', 'Energy', 'Agents', 'Tradition'];

function hsl32(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  let r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const hk = (t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    r = hk(h + 1 / 3); g = hk(h); b = hk(h - 1 / 3);
  }
  return (255 << 24) | ((b * 255) << 16) | ((g * 255) << 8) | (r * 255);
}

/* ---------- small instruments ---------- */

function Trace({ data, color, label, value, height = 34 }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth, h = height;
    cv.width = w * dpr; cv.height = h * dpr;
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    if (!data || data.length < 2) return;
    let mn = Infinity, mx = -Infinity;
    for (const v of data) { if (v < mn) mn = v; if (v > mx) mx = v; }
    if (mx - mn < 1e-9) { mx = mn + 1; }
    const pad = (mx - mn) * 0.12; mn -= pad; mx += pad;
    g.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((data[i] - mn) / (mx - mn)) * h;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.strokeStyle = color; g.lineWidth = 1.25; g.lineJoin = 'round'; g.stroke();
    g.lineTo(w, h); g.lineTo(0, h); g.closePath();
    g.fillStyle = color + '18'; g.fill();
  }, [data, color, height]);
  return (
    <div>
      <div className="flex items-baseline justify-between" style={{ marginBottom: 2 }}>
        <span style={{ font: '500 9.5px "IBM Plex Mono", monospace', letterSpacing: '.09em',
                       textTransform: 'uppercase', color: C.dim }}>{label}</span>
        <span style={{ font: '500 11px "IBM Plex Mono", monospace', color: C.ink }}>{value}</span>
      </div>
      <canvas ref={ref} style={{ width: '100%', height, display: 'block' }} />
    </div>
  );
}

function Bar({ v, color, w = 34 }) {
  return (
    <div style={{ width: w, height: 3, background: '#00000014', borderRadius: 1 }}>
      <div style={{ width: Math.max(2, Math.min(1, v) * w), height: 3, background: color, borderRadius: 1 }} />
    </div>
  );
}

function Panel({ title, right, children }) {
  return (
    <section style={{ borderTop: `1px solid ${C.rule}66`, paddingTop: 9, marginTop: 12 }}>
      <div className="flex items-baseline justify-between" style={{ marginBottom: 7 }}>
        <h2 style={{ font: '600 9.5px "IBM Plex Mono", monospace', letterSpacing: '.16em',
                     textTransform: 'uppercase', color: C.verdLo, margin: 0 }}>{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

/* ============================================================ */

export default function KilnConsole() {
  const wrapRef = useRef(null);
  const cvRef = useRef(null);
  const offRef = useRef(null);
  const worldRef = useRef(null);
  if (!worldRef.current) worldRef.current = new World({ W: 176, H: 110, seed: 909 });
  const lutRef = useRef(new Uint32Array(MAX_ELEMENTS));
  const rafRef = useRef(0);
  const frameRef = useRef(0);
  const lastAutoRef = useRef(0);

  const [seedInput, setSeedInput] = useState('909');
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(3);
  const [view, setView] = useState('Matter');
  const [params, setParams] = useState(() => ({ ...DEFAULT_PARAMS }));
  const [ui, setUi] = useState({ tick: 0, pop: 0, items: 0, sun: 0, elements: 0, maxTierEver: 0,
                                 meanGen: 0, heat: 0, discovered: 0, tooled: 0, gPred: 0,
                                 gCraft: 0, gThrift: 0, gDiet: 0, kills: 0 });
  const [codex, setCodex] = useState([]);
  const [log, setLog] = useState([]);
  const [traces, setTraces] = useState({ pop: [], tier: [], disc: [], pred: [] });
  const [marks, setMarks] = useState([]);
  const [selected, setSelected] = useState(-1);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareText, setShareText] = useState('');
  const [replay, setReplay] = useState(0);
  const [tip, setTip] = useState(null);

  /* ---------- boot ---------- */
  const boot = useCallback((seed, p, GW = 176, GH = 110) => {
    const w = new World({ W: GW, H: GH, seed, p });
    worldRef.current = w;
    setParams({ ...w.p });
    setMarks([]);
    setSelected(-1);
    lutRef.current = new Uint32Array(MAX_ELEMENTS);
    return w;
  }, []);

  /* ---------- colour table ---------- */
  const rebuildLut = useCallback(() => {
    const w = worldRef.current; if (!w) return;
    const ET = w.ET, lut = lutRef.current;
    for (let i = 0; i < ET.n; i++) {
      const t = ET.tier[i];
      const sat = Math.min(0.92, 0.10 + t * 0.155);
      const lig = Math.min(0.72, 0.24 + t * 0.075 + ET.cat[i] * 0.18);
      lut[i] = hsl32(ET.hue[i], sat, lig);
    }
  }, []);

  /* ---------- draw ---------- */
  const draw = useCallback(() => {
    const w = worldRef.current, cv = cvRef.current;
    if (!w || !cv) return;
    const gw = w.W, gh = w.H;
    if (!offRef.current) {
      const o = document.createElement('canvas');
      o.width = gw; o.height = gh; offRef.current = o;
    }
    const off = offRef.current, og = off.getContext('2d');
    const img = og.createImageData(gw, gh);
    const buf = new Uint32Array(img.data.buffer);
    const lut = lutRef.current, ET = w.ET;
    const bg = 0xff0f0d09;
    const isTier = view === 'Tier', isEnergy = view === 'Energy';
    const isAgents = view === 'Agents', isTrad = view === 'Tradition';

    if (isTrad) {
      const nD = w.demeW * w.demeH;
      const cols = new Uint32Array(nD);
      let mx = 1e-6;
      const sums = new Float32Array(nD);
      for (let d = 0; d < nD; d++) {
        let acc = 0; const base = d * w.demeTable;
        for (let k = 0; k < w.demeTable; k++) acc += Math.abs(w.memes[base + k]);
        sums[d] = acc; if (acc > mx) mx = acc;
      }
      for (let d = 0; d < nD; d++) {
        const v = Math.min(1, sums[d] / mx);
        cols[d] = hsl32(168 - v * 130, 0.55, 0.08 + v * 0.42);
      }
      for (let y = 0; y < gh; y++) {
        const dy = Math.min(w.demeH - 1, (y * w.demeH / gh) | 0);
        for (let x = 0; x < gw; x++) {
          const dx = Math.min(w.demeW - 1, (x * w.demeW / gw) | 0);
          buf[y * gw + x] = cols[dy * w.demeW + dx];
        }
      }
    } else {
      buf.fill(bg);
      if (!isAgents) {
        for (let i = 0; i < buf.length; i++) {
          const t = w.itemType[i];
          if (t === -1) continue;
          if (selected >= 0) { buf[i] = t === selected ? 0xffffffff : ((lut[t] & 0xff3f3f3f) | 0xff000000); continue; }
          if (isTier) {
            const v = Math.min(1, ET.tier[t] / 7);
            buf[i] = hsl32(210 - v * 210, 0.72, 0.16 + v * 0.46);
          } else if (isEnergy) {
            const v = Math.min(1, w.charge[i] / 14);
            buf[i] = hsl32(46, 0.85, 0.08 + v * 0.58);
          } else buf[i] = lut[t] || bg;
        }
      }
    }
    og.putImageData(img, 0, 0);

    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.fillStyle = C.well;
    g.fillRect(0, 0, cv.width, cv.height);
    g.drawImage(off, 0, 0, cv.width, cv.height);

    // agents
    const sx = cv.width / gw, sy = cv.height / gh;
    const r = Math.max(1.6, sx * 1.15);
    for (const a of w.agents) {
      const px = a.x * sx, py = a.y * sy;
      const hue = 30 + a.g[G.DIET] * 260;
      const lit = 0.42 + Math.min(0.34, a.e * 0.05);
      if (a.inv0 >= 0 && ET.tier[a.inv0] >= 2) {
        g.fillStyle = `hsla(${ET.hue[a.inv0]},80%,62%,0.20)`;
        g.beginPath(); g.arc(px + sx / 2, py + sy / 2, r * 2.3, 0, 6.2832); g.fill();
      }
      g.fillStyle = a.g[G.PRED] > 0.55
        ? `hsl(${8},72%,${(lit * 100).toFixed(0)}%)`
        : `hsl(${hue.toFixed(0)},58%,${(lit * 100).toFixed(0)}%)`;
      g.fillRect(px - r * 0.2, py - r * 0.2, r * 1.5, r * 1.5);
      if (a.tool >= 0) {
        g.strokeStyle = '#F0D48A'; g.lineWidth = 0.8;
        g.strokeRect(px - r * 0.7, py - r * 0.7, r * 2.5, r * 2.5);
      }
    }
  }, [view, selected]);

  /* ---------- loop ---------- */
  useEffect(() => {
    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const w = worldRef.current; if (!w) return;
      if (running) for (let i = 0; i < speed; i++) w.step();
      const f = frameRef.current++;
      if (f % 12 === 0) rebuildLut();
      draw();
      if (f % 10 === 0) {
        const s = w.stats();
        setUi({ tick: s.tick, pop: s.pop, items: s.items, sun: s.sun, elements: s.elements,
                maxTierEver: s.maxTierEver, meanGen: s.meanGen, heat: s.heat,
                discovered: w.ET.totalDiscovered, tooled: s.tooled, gPred: s.gPred,
                gCraft: s.gCraft, gThrift: s.gThrift, gDiet: s.gDiet, kills: s.kills });
        const h = w.history.slice(-140);
        setTraces({ pop: h.map(x => x.pop), tier: h.map(x => x.maxTierEver),
                    disc: h.map(x => x.elements), pred: h.map(x => x.gPred) });
        setLog(w.events.slice(-9).reverse());
      }
      if (f % 40 === 0) {
        const counts = new Map();
        for (let i = 0; i < w.itemType.length; i++) {
          const t = w.itemType[i]; if (t === -1) continue;
          counts.set(t, (counts.get(t) || 0) + 1);
        }
        for (const a of w.agents) {
          for (const t of [a.inv0, a.inv1, a.tool]) if (t >= 0) counts.set(t, (counts.get(t) || 0) + 1);
        }
        const ET = w.ET;
        const top = [...counts.entries()].sort((a, b) => (ET.tier[b[0]] - ET.tier[a[0]]) || (b[1] - a[1]))
          .slice(0, 9)
          .map(([id, n]) => ({ id, n, tier: ET.tier[id], mass: ET.mass[id], hue: ET.hue[id],
                               hard: ET.hard[id], cat: ET.cat[id], nut: ET.nut[id], vol: ET.vol[id],
                               pa: ET.pa[id], pb: ET.pb[id] }));
        setCodex(top);
      }
      // automatic core samples
      if (w.tick > 0 && w.tick % 3000 === 0 && lastAutoRef.current !== w.tick) {
        lastAutoRef.current = w.tick;
        const entry = { tick: w.tick, snap: w.snapshot(), manual: false };
        setMarks(ms => {
          const autos = ms.filter(x => !x.manual).concat(entry).slice(-8);
          const mans = ms.filter(x => x.manual).slice(-6);
          return [...autos, ...mans].sort((a, b) => a.tick - b.tick);
        });
      }
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [running, speed, draw, rebuildLut]);

  /* ---------- canvas sizing ---------- */
  useEffect(() => {
    const fit = () => {
      const cv = cvRef.current, wrap = wrapRef.current;
      if (!cv || !wrap) return;
      const w = worldRef.current || { W: 176, H: 110 };
      const cw = wrap.clientWidth;
      cv.width = Math.round(cw); cv.height = Math.round(cw * w.H / w.W);
      cv.style.width = cw + 'px'; cv.style.height = Math.round(cw * w.H / w.W) + 'px';
      draw();
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [draw]);

  /* ---------- actions ---------- */
  const setP = (k, v) => {
    const w = worldRef.current; if (!w) return;
    w.setParam(k, v);
    setParams({ ...w.p });
  };
  const applyPreset = (name) => {
    const w = worldRef.current; if (!w) return;
    const base = DEFAULT_PARAMS;
    const over = PRESETS[name];
    for (const { k } of PARAMS) setP(k, over[k] !== undefined ? over[k] : base[k]);
  };
  const newWorld = () => {
    const s = (parseInt(seedInput, 10) >>> 0) || 1;
    boot(s, params ? { ...params } : undefined);
  };
  const restore = (m) => { if (!worldRef.current) return; worldRef.current.restore(m.snap); setParams({ ...worldRef.current.p }); draw(); };
  const markNow = () => {
    const w = worldRef.current;
    setMarks(ms => {
      const mans = ms.filter(x => x.manual).concat({ tick: w.tick, snap: w.snapshot(), manual: true }).slice(-6);
      return [...ms.filter(x => !x.manual), ...mans].sort((a, b) => a.tick - b.tick);
    });
  };
  const makeShare = () => {
    const w = worldRef.current;
    const code = btoa(JSON.stringify({ s: w.seed, w: w.W, h: w.H, t: w.tick, j: w.journal }));
    setShareText(code); setShareOpen(true);
  };
  const loadShare = async () => {
    let d;
    try { d = JSON.parse(atob(shareText.trim())); } catch { setTip('That code could not be read.'); return; }
    if (!d || typeof d.s !== 'number') { setTip('That code could not be read.'); return; }
    setRunning(false);
    const w = boot(d.s >>> 0, undefined, d.w || 176, d.h || 110);
    const target = d.t | 0;
    const journal = (d.j || []).slice().sort((a, b) => a[0] - b[0]);
    let jp = 0;
    setShareOpen(false);
    setReplay(0.0001);
    for (let t = 0; t < target;) {
      const end = Math.min(target, t + 4000);
      for (; t < end; t++) {
        while (jp < journal.length && journal[jp][0] <= t) { w.p[journal[jp][1]] = journal[jp][2]; jp++; }
        w.step();
      }
      setReplay(Math.max(0.0001, t / target));
      await new Promise(r => setTimeout(r, 0));
    }
    w.journal = journal.slice();
    setParams({ ...w.p }); setReplay(0); setRunning(true);
  };

  const fmt = (n, d = 0) => n.toLocaleString(undefined, { maximumFractionDigits: d });

  /* ---------- render ---------- */
  return (
    <div style={{ background: C.bone, color: C.ink, minHeight: '100%', padding: '18px 16px 26px' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
        .kiln { font-family: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif; }
        .kiln input[type=range]{ -webkit-appearance:none; appearance:none; width:100%; height:14px; background:transparent; cursor:pointer; }
        .kiln input[type=range]::-webkit-slider-runnable-track{ height:2px; background:${C.rule}; }
        .kiln input[type=range]::-moz-range-track{ height:2px; background:${C.rule}; }
        .kiln input[type=range]::-webkit-slider-thumb{ -webkit-appearance:none; width:9px; height:14px; background:${C.ink}; margin-top:-6px; border-radius:1px; }
        .kiln input[type=range]::-moz-range-thumb{ width:9px; height:14px; background:${C.ink}; border:0; border-radius:1px; }
        .kiln input[type=range]:focus-visible{ outline:2px solid ${C.verd}; outline-offset:3px; }
        .kbtn{ font:500 11px "IBM Plex Mono",monospace; letter-spacing:.05em; padding:5px 10px;
               border:1px solid ${C.rule}; background:transparent; color:${C.ink}; cursor:pointer; border-radius:2px; }
        .kbtn:hover{ background:#00000010; }
        .kbtn[data-on="1"]{ background:${C.ink}; color:${C.bone}; border-color:${C.ink}; }
        .kbtn:focus-visible{ outline:2px solid ${C.verd}; outline-offset:2px; }
        .kiln ::selection{ background:${C.verd}; color:${C.bone}; }
        @media (prefers-reduced-motion: reduce){ .kiln *{ transition:none !important; } }
      `}</style>

      <div className="kiln" style={{ maxWidth: 1320, margin: '0 auto' }}>

        {/* masthead */}
        <header className="flex flex-wrap items-end justify-between"
                style={{ gap: 14, borderBottom: `2px solid ${C.ink}`, paddingBottom: 10 }}>
          <div className="flex items-end" style={{ gap: 14 }}>
            <h1 style={{ font: '600 44px/0.82 Fraunces, Georgia, serif', margin: 0, letterSpacing: '-.02em' }}>
              KILN
            </h1>
            <p style={{ font: '400 12px/1.35 "IBM Plex Sans", sans-serif', color: C.dim, margin: '0 0 3px', maxWidth: 400 }}>
              Raw matter is nearly inedible. Refined matter feeds you. Nobody wrote the recipes.
            </p>
          </div>
          <dl className="flex" style={{ gap: 20, margin: 0 }}>
            {[['tick', fmt(ui.tick)], ['agents', fmt(ui.pop)], ['generation', fmt(ui.meanGen)],
              ['deepest tier', 'T' + ui.maxTierEver], ['discovered', fmt(ui.discovered)]].map(([k, v]) => (
              <div key={k}>
                <dt style={{ font: '500 8.5px "IBM Plex Mono",monospace', letterSpacing: '.14em',
                             textTransform: 'uppercase', color: C.dim }}>{k}</dt>
                <dd style={{ font: '500 17px "IBM Plex Mono",monospace', margin: 0 }}>{v}</dd>
              </div>
            ))}
          </dl>
        </header>

        <div className="flex flex-wrap" style={{ gap: 20, marginTop: 16, alignItems: 'flex-start' }}>

          {/* ---------- the well ---------- */}
          <div style={{ flex: '1 1 620px', minWidth: 320 }}>
            <div ref={wrapRef} style={{ position: 'relative', background: C.well, padding: 0,
                                        border: `1px solid ${C.ink}`, lineHeight: 0 }}>
              <canvas ref={cvRef} style={{ display: 'block', width: '100%' }} />
              {replay > 0 && (
                <div style={{ position: 'absolute', inset: 0, background: '#090D0FE0', display: 'flex',
                              alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10 }}>
                  <span style={{ font: '500 11px "IBM Plex Mono",monospace', color: C.bone2, letterSpacing: '.1em' }}>
                    REPLAYING FROM GENESIS · {(replay * 100).toFixed(0)}%
                  </span>
                  <div style={{ width: 220, height: 2, background: '#ffffff22' }}>
                    <div style={{ width: `${replay * 100}%`, height: 2, background: C.verd }} />
                  </div>
                </div>
              )}
              {selected >= 0 && (
                <button className="kbtn" onClick={() => setSelected(-1)}
                        style={{ position: 'absolute', top: 8, right: 8, background: C.bone, borderColor: C.bone }}>
                  clear highlight
                </button>
              )}
            </div>

            {/* transport */}
            <div className="flex flex-wrap items-center" style={{ gap: 8, marginTop: 9 }}>
              <button className="kbtn" data-on={running ? '1' : '0'} onClick={() => setRunning(r => !r)}
                      style={{ minWidth: 62 }}>{running ? '❚❚ pause' : '▶ run'}</button>
              <button className="kbtn" onClick={() => { worldRef.current.step(); draw(); }}>step</button>
              <div className="flex items-center" style={{ gap: 6, minWidth: 168 }}>
                <span style={{ font: '500 9.5px "IBM Plex Mono",monospace', letterSpacing: '.1em',
                               color: C.dim, textTransform: 'uppercase' }}>speed</span>
                <input type="range" min={1} max={16} step={1} value={speed}
                       aria-label="Ticks per frame"
                       onChange={e => setSpeed(+e.target.value)} style={{ flex: 1 }} />
                <span style={{ font: '500 11px "IBM Plex Mono",monospace', width: 34 }}>{speed}×</span>
              </div>
              <div style={{ flex: 1 }} />
              {VIEWS.map(v => (
                <button key={v} className="kbtn" data-on={view === v ? '1' : '0'} onClick={() => setView(v)}>{v}</button>
              ))}
            </div>

            {/* seed + safe points */}
            <div className="flex flex-wrap items-center" style={{ gap: 8, marginTop: 8 }}>
              <span style={{ font: '500 9.5px "IBM Plex Mono",monospace', letterSpacing: '.12em',
                             color: C.dim, textTransform: 'uppercase' }}>seed</span>
              <input value={seedInput} onChange={e => setSeedInput(e.target.value.replace(/\D/g, ''))}
                     aria-label="World seed"
                     style={{ font: '500 12px "IBM Plex Mono",monospace', width: 88, padding: '4px 7px',
                              border: `1px solid ${C.rule}`, background: 'transparent', color: C.ink, borderRadius: 2 }} />
              <button className="kbtn" onClick={newWorld}>new world</button>
              <button className="kbtn" onClick={() => setSeedInput(String((Math.random() * 4294967295) >>> 0))}>random</button>
              <button className="kbtn" onClick={markNow}>mark safe point</button>
              <button className="kbtn" onClick={makeShare}>share code</button>
            </div>

            <div style={{ marginTop: 9, borderTop: `1px solid ${C.rule}66`, paddingTop: 8 }}>
              <div className="flex items-baseline justify-between" style={{ marginBottom: 6 }}>
                <span style={{ font: '600 9.5px "IBM Plex Mono",monospace', letterSpacing: '.16em',
                               textTransform: 'uppercase', color: C.verdLo }}>Core samples</span>
                <span style={{ font: '400 10px "IBM Plex Sans",sans-serif', color: C.dim }}>
                  automatic every 3,000 ticks · restoring is exact
                </span>
              </div>
              <div className="flex flex-wrap" style={{ gap: 5 }}>
                {marks.length === 0 && (
                  <span style={{ font: '400 11px "IBM Plex Sans",sans-serif', color: C.dim }}>
                    No samples yet. The first is taken at tick 3,000, or mark one now.
                  </span>
                )}
                {marks.map((m, i) => (
                  <button key={i} className="kbtn" onClick={() => restore(m)}
                          title={`Return to tick ${m.tick}`}
                          style={{ borderColor: m.manual ? C.ochre : C.rule,
                                   color: m.manual ? '#7A5411' : C.ink, padding: '4px 7px' }}>
                    {m.manual ? '◆ ' : ''}{fmt(m.tick)}
                  </button>
                ))}
              </div>
            </div>

            {shareOpen && (
              <div style={{ marginTop: 10, border: `1px solid ${C.ink}`, padding: 10 }}>
                <p style={{ font: '400 11px/1.45 "IBM Plex Sans",sans-serif', margin: '0 0 7px', color: C.dim }}>
                  This string is the whole world: seed, size, tick, and every slider you moved.
                  Paste one in and it replays from genesis, exactly.
                </p>
                <textarea value={shareText} onChange={e => setShareText(e.target.value)}
                          aria-label="World share code"
                          style={{ width: '100%', height: 62, font: '400 10px "IBM Plex Mono",monospace',
                                   border: `1px solid ${C.rule}`, background: 'transparent', color: C.ink,
                                   padding: 6, resize: 'vertical', borderRadius: 2 }} />
                <div className="flex" style={{ gap: 7, marginTop: 7 }}>
                  <button className="kbtn" onClick={loadShare}>load this world</button>
                  <button className="kbtn" onClick={() => { navigator.clipboard?.writeText(shareText); setTip('Copied.'); }}>copy</button>
                  <button className="kbtn" onClick={() => setShareOpen(false)}>close</button>
                  {tip && <span style={{ font: '400 11px "IBM Plex Sans",sans-serif', color: C.verdLo, alignSelf: 'center' }}>{tip}</span>}
                </div>
              </div>
            )}
          </div>

          {/* ---------- instruments ---------- */}
          <div style={{ flex: '0 1 372px', minWidth: 290 }}>

            <Panel title="Vitals">
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '7px 16px' }}>
                {[['standing matter', fmt(ui.items) + ' motes'],
                  ['energy pool', fmt(ui.sun)],
                  ['live elements', fmt(ui.elements)],
                  ['heat shed', fmt(ui.heat)],
                  ['carrying a tool', (ui.tooled * 100).toFixed(0) + '%'],
                  ['kills', fmt(ui.kills)]].map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between">
                    <span style={{ font: '400 10.5px "IBM Plex Sans",sans-serif', color: C.dim }}>{k}</span>
                    <span style={{ font: '500 11.5px "IBM Plex Mono",monospace' }}>{v}</span>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Traces">
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Trace data={traces.pop} color={C.verd} label="population" value={fmt(ui.pop)} />
                <Trace data={traces.tier} color={C.ochre} label="deepest tier" value={'T' + ui.maxTierEver} />
                <Trace data={traces.disc} color={C.ink} label="live elements" value={fmt(ui.elements)} />
                <Trace data={traces.pred} color={C.ox} label="predation drive" value={ui.gPred.toFixed(2)} />
              </div>
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 10 }}>
                {[['craft drive', ui.gCraft, C.verd], ['hoarding', ui.gThrift, C.ochre],
                  ['diet centre', ui.gDiet, C.ink]].map(([k, v, col]) => (
                  <div key={k}>
                    <div style={{ font: '400 9.5px "IBM Plex Mono",monospace', color: C.dim,
                                  textTransform: 'uppercase', letterSpacing: '.08em' }}>{k}</div>
                    <div className="flex items-center" style={{ gap: 6, marginTop: 3 }}>
                      <Bar v={v} color={col} w={52} />
                      <span style={{ font: '500 11px "IBM Plex Mono",monospace' }}>
                        {k === 'diet centre' ? 'T' + (v * 8).toFixed(1) : v.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Codex" right={
              <span style={{ font: '400 10px "IBM Plex Sans",sans-serif', color: C.dim }}>
                most refined things present
              </span>}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {codex.length === 0 && (
                  <span style={{ font: '400 11px "IBM Plex Sans",sans-serif', color: C.dim }}>
                    Nothing refined exists yet. Give it a few hundred ticks.
                  </span>
                )}
                {codex.map(e => (
                  <button key={e.id} onClick={() => setSelected(s => s === e.id ? -1 : e.id)}
                          title="Highlight every instance in the well"
                          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                                   padding: '4px 6px', border: `1px solid ${selected === e.id ? C.ink : 'transparent'}`,
                                   background: selected === e.id ? '#00000010' : 'transparent',
                                   cursor: 'pointer', borderRadius: 2, textAlign: 'left' }}>
                    <span style={{ width: 11, height: 11, flexShrink: 0, borderRadius: 1,
                                   background: `hsl(${e.hue.toFixed(0)},${(10 + e.tier * 15).toFixed(0)}%,${(26 + e.tier * 7).toFixed(0)}%)`,
                                   border: `1px solid ${C.rule}` }} />
                    <span style={{ font: '600 11px "IBM Plex Mono",monospace', width: 22 }}>T{e.tier}</span>
                    <span style={{ font: '400 10.5px "IBM Plex Mono",monospace', color: C.dim, width: 92 }}>
                      m{e.mass} · #{e.id}
                    </span>
                    <span className="flex" style={{ gap: 4 }}>
                      <Bar v={e.nut} color={C.verd} w={22} />
                      <Bar v={e.hard} color={C.ink} w={22} />
                      <Bar v={e.cat * 3} color={C.ochre} w={22} />
                    </span>
                    <span style={{ font: '400 10.5px "IBM Plex Mono",monospace', color: C.dim,
                                   marginLeft: 'auto' }}>×{e.n}</span>
                  </button>
                ))}
              </div>
              <p style={{ font: '400 9.5px "IBM Plex Sans",sans-serif', color: C.dim, margin: '7px 0 0' }}>
                bars: <span style={{ color: C.verd }}>nutrition</span> ·
                <span style={{ color: C.ink }}> hardness</span> ·
                <span style={{ color: '#7A5411' }}> catalysis</span>
              </p>
            </Panel>

            <Panel title="Conditions" right={
              <div className="flex" style={{ gap: 4 }}>
                {Object.keys(PRESETS).map(n => (
                  <button key={n} className="kbtn" style={{ padding: '3px 6px', fontSize: 9.5 }}
                          onClick={() => applyPreset(n)}>{n}</button>
                ))}
              </div>}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {params && PARAMS.map(p => (
                  <div key={p.k}>
                    <div className="flex items-baseline justify-between">
                      <label htmlFor={'s-' + p.k}
                             style={{ font: '400 11px "IBM Plex Sans",sans-serif' }}>{p.label}</label>
                      <span style={{ font: '500 11px "IBM Plex Mono",monospace' }}>{p.fmt(params[p.k])}</span>
                    </div>
                    <input id={'s-' + p.k} type="range" min={p.min} max={p.max} step={p.step}
                           value={params[p.k]} onChange={e => setP(p.k, +e.target.value)} />
                    <div style={{ font: '400 9.5px/1.3 "IBM Plex Sans",sans-serif', color: C.dim, marginTop: -2 }}>
                      {p.note}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Log">
              <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex',
                           flexDirection: 'column', gap: 3 }}>
                {log.length === 0 && (
                  <li style={{ font: '400 11px "IBM Plex Sans",sans-serif', color: C.dim }}>Nothing has happened yet.</li>
                )}
                {log.map((e, i) => (
                  <li key={i} className="flex" style={{ gap: 8 }}>
                    <span style={{ font: '400 10px "IBM Plex Mono",monospace', color: C.dim,
                                   width: 58, flexShrink: 0, textAlign: 'right' }}>{fmt(e.t)}</span>
                    <span style={{ font: '400 10.5px/1.35 "IBM Plex Sans",sans-serif' }}>{e.msg}</span>
                  </li>
                ))}
              </ol>
            </Panel>

          </div>
        </div>

        <footer style={{ borderTop: `1px solid ${C.rule}66`, marginTop: 20, paddingTop: 9 }}>
          <p style={{ font: '400 10.5px/1.5 "IBM Plex Sans",sans-serif', color: C.dim, margin: 0, maxWidth: 780 }}>
            Every element in this world was derived from the seed by a hash, not written by anyone.
            The registry holds 6,000 at a time and forgets the ones that go extinct, so the space never
            closes — a 200,000-tick run passed through 3.3 million of them. Nothing here is scripted.
            Tools, hoarding, predators and trophic levels are all consequences of two hands, one energy
            budget, and the fact that gravel is hard to eat.
          </p>
        </footer>
      </div>
    </div>
  );
}
