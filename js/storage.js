/* Persistent state: settings, run history, difficult-problem pool.
   Everything lives in one localStorage blob so export/import is trivial. */

var ZTT = (function () {
  var KEY = "ztt.data.v1";

  var DEFAULT_SETTINGS = {
    add: true, addL1: 2, addH1: 100, addL2: 2, addH2: 100,
    sub: true,
    mul: true, mulL1: 2, mulH1: 12, mulL2: 2, mulH2: 100,
    div: true,
    duration: 120
  };

  var cache = null;

  function fresh() {
    return {
      version: 1,
      settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
      runs: [],   // {id, ts, mode, settings, duration, score, problems:[{op,a,b,ans,t,flag}]}
      pool: []    // {key, op, a, b, ans, added, lastT}
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
    if (!cache.settings) cache.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    /* migrate pool entries created before streak-based mastery */
    cache.pool.forEach(function (p) {
      if (typeof p.streak !== "number") p.streak = 0;
      if (typeof p.need !== "number") p.need = DEFAULT_NEED;
    });
    return cache;
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(load()));
    } catch (e) {
      /* quota exceeded: drop oldest half of runs and retry once */
      var d = load();
      d.runs = d.runs.slice(Math.floor(d.runs.length / 2));
      try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e2) {}
    }
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
    load().runs.push(run);
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

  /* ---------- difficult-problem pool ---------- */

  var POOL_CAP = 150;
  var DEFAULT_NEED = 3;   // consecutive fast solves required to master a problem
  var MAX_NEED = 6;       // ceiling as continued slowness raises the requirement

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
    var pool = load().pool;
    pool.push({
      key: probKey(p), op: p.op, a: p.a, b: p.b, ans: p.ans,
      added: Date.now(), lastT: t, streak: 0, need: DEFAULT_NEED
    });
    while (pool.length > POOL_CAP) pool.shift();
    save();
    return true;
  }

  /* Records one encounter with a pooled problem.
     outcome: "good" (fast solve), "slow" (flagged slow again), "meh" (neither).
     Returns "mastered" when the streak requirement is met, else the entry. */
  function poolResult(p, outcome, t) {
    var entry = poolFind(probKey(p));
    if (!entry) return null;
    if (typeof t === "number") entry.lastT = t;
    if (outcome === "good") {
      entry.streak++;
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

  function poolHas(p) {
    var pool = load().pool, key = probKey(p);
    for (var i = 0; i < pool.length; i++) if (pool[i].key === key) return true;
    return false;
  }

  function getPool() { return load().pool.slice(); }

  /* ---------- export / import ---------- */

  function exportJSON() {
    return JSON.stringify(load(), null, 1);
  }

  function importJSON(text) {
    var incoming = JSON.parse(text);
    if (!incoming || incoming.version !== 1 || !Array.isArray(incoming.runs)) {
      throw new Error("Not a valid export file.");
    }
    var d = load();
    var haveRun = {};
    d.runs.forEach(function (r) { haveRun[r.id] = true; });
    var addedRuns = 0;
    incoming.runs.forEach(function (r) {
      if (r && r.id && !haveRun[r.id]) { d.runs.push(r); addedRuns++; }
    });
    d.runs.sort(function (a, b) { return a.ts - b.ts; });

    var havePool = {};
    d.pool.forEach(function (p) { havePool[p.key] = true; });
    var addedPool = 0;
    (incoming.pool || []).forEach(function (p) {
      if (p && p.key && !havePool[p.key]) { d.pool.push(p); addedPool++; }
    });
    while (d.pool.length > POOL_CAP) d.pool.shift();
    save();
    return { runs: addedRuns, pool: addedPool };
  }

  /* ---------- stats helpers ---------- */

  function median(arr) {
    if (!arr.length) return 0;
    var s = arr.slice().sort(function (a, b) { return a - b; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  /* Modified z-score outlier mask: true = keep. */
  function outlierMask(values, thresh) {
    thresh = thresh || 3.5;
    var med = median(values);
    var devs = values.map(function (v) { return Math.abs(v - med); });
    var mad = median(devs);
    if (mad === 0) return values.map(function () { return true; });
    return values.map(function (v) {
      return Math.abs(0.6745 * (v - med) / mad) <= thresh;
    });
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
    probKey: probKey,
    poolAdd: poolAdd,
    poolRemove: poolRemove,
    poolHas: poolHas,
    poolGet: function (p) { return poolFind(probKey(p)); },
    poolResult: poolResult,
    getPool: getPool,
    exportJSON: exportJSON,
    importJSON: importJSON,
    median: median,
    outlierMask: outlierMask
  };
})();
