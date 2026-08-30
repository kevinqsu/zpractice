/* Persistent state: settings, run history, difficult-problem pool.
   Everything lives in one localStorage blob so export/import is trivial.

   Storage format v2 stores each problem as a compact array
   [op, a, b, ans, t, flagbits] instead of an object — roughly 3x smaller,
   which matters because heavy use was hitting the localStorage quota and
   silently losing new runs. v1 data (objects) is read transparently. */

var ZTT = (function () {
  var KEY = "ztt.data.v1";
  var WIRE_VERSION = 2;

  var MAX_RUNS = 1200;        // hard cap on stored runs (oldest trimmed, counted in meta)
  var POOL_CAP = 1000;
  var DEFAULT_NEED = 3;       // consecutive fast-solve credits to master a regular problem
  var SIMPLE_NEED = 1;        // ...but objectively simple problems clear with one
  var MAX_NEED = 6;           // ceiling as continued slowness raises the requirement

  var DEFAULT_SETTINGS = {
    add: true, addL1: 2, addH1: 100, addL2: 2, addH2: 100,
    sub: true,
    mul: true, mulL1: 2, mulH1: 12, mulL2: 2, mulH2: 100,
    div: true,
    duration: 120
  };

  var cache = null;

  /* ---------- difficulty classification ----------
     "Simple" problems are ones a strong player answers by direct retrieval
     or a single trivial step, per the two robust effects in mental-arithmetic
     research: the problem-size effect (times-table facts are memory lookups)
     and the carry/borrow effect (carry-free multi-digit operations are
     reliably faster). These need only one fast solve to leave the pool. */

  function units(x) { return x % 10; }

  function isSimple(p) {
    switch (p.op) {
      case "add":
        return (units(p.a) + units(p.b) < 10) || Math.min(p.a, p.b) <= 10;
      case "sub": /* a - b = ans */
        return (units(p.a) >= units(p.b)) || p.b <= 10 || p.ans <= 10;
      case "mul":
        return (p.a <= 12 && p.b <= 12) || p.a === 10 || p.b === 10 ||
               p.a % 10 === 0 || p.b % 10 === 0;
      case "div": /* a / b = ans */
        return (p.b <= 12 && p.ans <= 12) || p.b === 10 || p.ans % 10 === 0;
    }
    return false;
  }

  /* ---------- settings compatibility ----------
     A pooled problem "fits" the current settings if those settings could have
     generated it (operation enabled, operands within the ranges, in either
     order). The pool shown for a hard run is always filtered this way, so it
     tracks whatever is set on the start page with no manual selection. */

  function inR(v, lo, hi) { return v >= lo && v <= hi; }

  function fits(p, s) {
    switch (p.op) {
      case "add":
        return !!s.add &&
          ((inR(p.a, s.addL1, s.addH1) && inR(p.b, s.addL2, s.addH2)) ||
           (inR(p.a, s.addL2, s.addH2) && inR(p.b, s.addL1, s.addH1)));
      case "sub": /* built from x + y: subtracted operand b, answer ans */
        return !!s.sub &&
          ((inR(p.b, s.addL1, s.addH1) && inR(p.ans, s.addL2, s.addH2)) ||
           (inR(p.b, s.addL2, s.addH2) && inR(p.ans, s.addL1, s.addH1)));
      case "mul":
        return !!s.mul &&
          ((inR(p.a, s.mulL1, s.mulH1) && inR(p.b, s.mulL2, s.mulH2)) ||
           (inR(p.a, s.mulL2, s.mulH2) && inR(p.b, s.mulL1, s.mulH1)));
      case "div": /* divisor b, quotient ans */
        return !!s.div &&
          ((inR(p.b, s.mulL1, s.mulH1) && inR(p.ans, s.mulL2, s.mulH2)) ||
           (inR(p.b, s.mulL2, s.mulH2) && inR(p.ans, s.mulL1, s.mulH1)));
    }
    return false;
  }

  /* ---------- wire (de)serialization ---------- */

  var FLAG_BIT = 1, FROMPOOL_BIT = 2;

  function expandProblems(list) {
    return (list || []).map(function (p) {
      if (Array.isArray(p)) {
        return {
          op: p[0], a: p[1], b: p[2], ans: p[3], t: p[4],
          flag: !!(p[5] & FLAG_BIT), fromPool: !!(p[5] & FROMPOOL_BIT)
        };
      }
      return p; /* v1 object form */
    });
  }

  function compactProblems(list) {
    return (list || []).map(function (p) {
      var f = (p.flag ? FLAG_BIT : 0) | (p.fromPool ? FROMPOOL_BIT : 0);
      return [p.op, p.a, p.b, p.ans, p.t, f];
    });
  }

  function toWire(d) {
    return {
      version: WIRE_VERSION,
      settings: d.settings,
      meta: d.meta,
      runs: d.runs.map(function (r) {
        var w = {
          id: r.id, ts: r.ts, mode: r.mode, sig: r.sig,
          duration: r.duration, score: r.score, settings: r.settings,
          problems: compactProblems(r.problems)
        };
        if (r.excluded) w.excluded = true;
        return w;
      }),
      pool: d.pool
    };
  }

  function fresh() {
    return {
      version: WIRE_VERSION,
      settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
      meta: { trimmed: 0 },
      runs: [],
      pool: []
    };
  }

  function load() {
    if (cache) return cache;
    try {
      var raw = localStorage.getItem(KEY);
      cache = raw ? JSON.parse(raw) : fresh();
    } catch (e) {
      cache = fresh();
    }
    if (!cache.runs) cache.runs = [];
    if (!cache.pool) cache.pool = [];
    if (!cache.meta) cache.meta = { trimmed: 0 };
    if (!cache.settings) cache.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    cache.runs.forEach(function (r) { r.problems = expandProblems(r.problems); });
    /* migrate pool entries from before streak mastery / simple classification */
    cache.pool.forEach(function (p) {
      if (typeof p.streak !== "number") p.streak = 0;
      if (typeof p.simple !== "boolean") p.simple = isSimple(p);
      if (typeof p.need !== "number") p.need = p.simple ? SIMPLE_NEED : DEFAULT_NEED;
      else if (p.simple && p.need === DEFAULT_NEED) p.need = SIMPLE_NEED;
    });
    cache.version = WIRE_VERSION;
    return cache;
  }

  function save() {
    var d = load();
    for (var attempt = 0; attempt < 4; attempt++) {
      try {
        localStorage.setItem(KEY, JSON.stringify(toWire(d)));
        return true;
      } catch (e) {
        /* quota: trim the oldest 15% of runs (at least 20) and retry,
           counting what was lost so the stats page can say so */
        var n = Math.max(20, Math.floor(d.runs.length * 0.15));
        if (!d.runs.length) return false;
        d.runs.splice(0, n);
        d.meta.trimmed = (d.meta.trimmed || 0) + n;
      }
    }
    return false;
  }

  /* ---------- settings ---------- */

  function getSettings() {
    return JSON.parse(JSON.stringify(load().settings));
  }

  function setSettings(s) {
    load().settings = JSON.parse(JSON.stringify(s));
    save();
  }

  function settingsSig(s) {
    var parts = [];
    if (s.add) parts.push("add(" + s.addL1 + "-" + s.addH1 + "," + s.addL2 + "-" + s.addH2 + ")");
    if (s.sub) parts.push("sub");
    if (s.mul) parts.push("mul(" + s.mulL1 + "-" + s.mulH1 + "," + s.mulL2 + "-" + s.mulH2 + ")");
    if (s.div) parts.push("div");
    parts.push(s.duration + "s");
    return parts.join(" ");
  }

  var DEFAULT_SIG = settingsSig(DEFAULT_SETTINGS);

  /* ---------- runs ---------- */

  function addRun(run) {
    run.id = run.ts + "-" + Math.random().toString(36).slice(2, 8);
    var d = load();
    d.runs.push(run);
    if (d.runs.length > MAX_RUNS) {
      var n = d.runs.length - MAX_RUNS;
      d.runs.splice(0, n);
      d.meta.trimmed = (d.meta.trimmed || 0) + n;
    }
    save();
    return run;
  }

  function getRuns() { return load().runs; }

  function updateProblemFlag(runId, idx, flagged) {
    var runs = load().runs;
    for (var i = 0; i < runs.length; i++) {
      if (runs[i].id === runId && runs[i].problems[idx]) {
        runs[i].problems[idx].flag = flagged;
        break;
      }
    }
    save();
  }

  function setRunExcluded(runId, excluded) {
    var runs = load().runs;
    for (var i = 0; i < runs.length; i++) {
      if (runs[i].id === runId) {
        runs[i].excluded = !!excluded;
        break;
      }
    }
    save();
  }

  /* Personal per-problem baseline (ms): median solve time over the last 10
     non-excluded normal runs with this settings signature; falls back to all
     normal runs, then to 2000ms when there is too little history. */
  function baselineMs(sig) {
    var runs = load().runs.filter(function (r) {
      return r.mode !== "hard" && !r.excluded && r.score > 0;
    });
    var matching = runs.filter(function (r) { return r.sig === sig; });
    var use = (matching.length >= 3 ? matching : runs).slice(-10);
    var times = [];
    use.forEach(function (r) {
      r.problems.forEach(function (p) { times.push(p.t); });
    });
    return times.length >= 30 ? median(times) : 2000;
  }

  /* ---------- difficult-problem pool ---------- */

  function probKey(p) { return p.op + ":" + p.a + ":" + p.b; }

  function poolFind(key) {
    var pool = load().pool;
    for (var i = 0; i < pool.length; i++) if (pool[i].key === key) return pool[i];
    return null;
  }

  function poolAdd(p, t) {
    var entry = poolFind(probKey(p));
    if (entry) {
      /* re-flagged: it was trouble again, so reset progress and raise the bar */
      entry.added = Date.now();
      entry.lastT = t;
      entry.streak = 0;
      entry.need = Math.min(entry.need + 1, MAX_NEED);
      save();
      return false; // already present
    }
    var simple = isSimple(p);
    var pool = load().pool;
    pool.push({
      key: probKey(p), op: p.op, a: p.a, b: p.b, ans: p.ans,
      added: Date.now(), lastT: t, streak: 0, simple: simple,
      need: simple ? SIMPLE_NEED : DEFAULT_NEED
    });
    while (pool.length > POOL_CAP) pool.shift();
    save();
    return true;
  }

  /* Records one encounter with a pooled problem.
     outcome: "blaze" (near-instant, counts double), "good" (fast, counts 1),
     "meh" (sluggish, resets the streak), "slow" (flagged slow again: resets
     the streak AND raises the requirement).
     Returns "mastered" when the requirement is met, else the entry. */
  function poolResult(p, outcome, t) {
    var entry = poolFind(probKey(p));
    if (!entry) return null;
    if (typeof t === "number") entry.lastT = t;
    if (outcome === "blaze" || outcome === "good") {
      entry.streak += (outcome === "blaze" ? 2 : 1);
      if (entry.streak >= entry.need) {
        poolRemove(p);
        return "mastered";
      }
    } else if (outcome === "slow") {
      entry.streak = 0;
      entry.need = Math.min(entry.need + 1, MAX_NEED);
    } else {
      entry.streak = 0;
    }
    save();
    return entry;
  }

  function poolRemove(p) {
    var pool = load().pool;
    var key = probKey(p);
    for (var i = 0; i < pool.length; i++) {
      if (pool[i].key === key) { pool.splice(i, 1); save(); return true; }
    }
    return false;
  }

  function poolHas(p) { return !!poolFind(probKey(p)); }

  /* With settings: only problems those settings could generate. */
  function getPool(settings) {
    var pool = load().pool.slice();
    if (!settings) return pool;
    return pool.filter(function (p) { return fits(p, settings); });
  }

  /* ---------- export / import ---------- */

  function exportJSON() {
    return JSON.stringify(toWire(load()), null, 1);
  }

  function importJSON(text) {
    var incoming = JSON.parse(text);
    if (!incoming || !Array.isArray(incoming.runs) ||
        (incoming.version !== 1 && incoming.version !== WIRE_VERSION)) {
      throw new Error("Not a valid export file.");
    }
    var d = load();
    var haveRun = {};
    d.runs.forEach(function (r) { haveRun[r.id] = true; });
    var addedRuns = 0;
    incoming.runs.forEach(function (r) {
      if (r && r.id && !haveRun[r.id]) {
        r.problems = expandProblems(r.problems);
        d.runs.push(r);
        addedRuns++;
      }
    });
    d.runs.sort(function (a, b) { return a.ts - b.ts; });

    var havePool = {};
    d.pool.forEach(function (p) { havePool[p.key] = true; });
    var addedPool = 0;
    (incoming.pool || []).forEach(function (p) {
      if (p && p.key && !havePool[p.key]) { d.pool.push(p); addedPool++; }
    });
    while (d.pool.length > POOL_CAP) d.pool.shift();
    /* normalize any freshly imported v1 pool entries */
    d.pool.forEach(function (p) {
      if (typeof p.streak !== "number") p.streak = 0;
      if (typeof p.simple !== "boolean") p.simple = isSimple(p);
      if (typeof p.need !== "number") p.need = p.simple ? SIMPLE_NEED : DEFAULT_NEED;
    });
    save();
    return { runs: addedRuns, pool: addedPool };
  }

  /* ---------- storage accounting ---------- */

  var QUOTA_CHARS = 5000000; // typical localStorage budget (UTF-16 units)

  function storageInfo() {
    var chars = 0;
    try { chars = (localStorage.getItem(KEY) || "").length; } catch (e) {}
    return {
      chars: chars,
      pct: Math.round((chars / QUOTA_CHARS) * 100),
      runs: load().runs.length,
      trimmed: load().meta.trimmed || 0
    };
  }

  /* ---------- stats helpers ---------- */

  function median(arr) {
    if (!arr.length) return 0;
    var s = arr.slice().sort(function (a, b) { return a - b; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  /* Modified z-score for each value (0 when MAD is 0). */
  function modifiedZ(values) {
    var med = median(values);
    var devs = values.map(function (v) { return Math.abs(v - med); });
    var mad = median(devs);
    return values.map(function (v) {
      return mad === 0 ? 0 : 0.6745 * (v - med) / mad;
    });
  }

  /* Outlier mask: true = keep. */
  function outlierMask(values, thresh) {
    thresh = thresh || 3.5;
    return modifiedZ(values).map(function (z) { return Math.abs(z) <= thresh; });
  }

  return {
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    DEFAULT_SIG: DEFAULT_SIG,
    DEFAULT_NEED: DEFAULT_NEED,
    getSettings: getSettings,
    setSettings: setSettings,
    settingsSig: settingsSig,
    addRun: addRun,
    getRuns: getRuns,
    updateProblemFlag: updateProblemFlag,
    setRunExcluded: setRunExcluded,
    baselineMs: baselineMs,
    probKey: probKey,
    isSimple: isSimple,
    fits: fits,
    poolAdd: poolAdd,
    poolRemove: poolRemove,
    poolHas: poolHas,
    poolGet: function (p) { return poolFind(probKey(p)); },
    poolResult: poolResult,
    getPool: getPool,
    exportJSON: exportJSON,
    importJSON: importJSON,
    storageInfo: storageInfo,
    median: median,
    modifiedZ: modifiedZ,
    outlierMask: outlierMask
  };
})();