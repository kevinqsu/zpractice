/* Game flow: settings form, timed drill, per-problem timing, end screen,
   and zetamac-style game keys in the URL (optional, via a start-page toggle). */

(function () {

  var startView = document.getElementById("start-view");
  var gameView = document.getElementById("game-view");
  var endView = document.getElementById("end-view");

  var secondsLabel = document.getElementById("seconds-left");
  var scoreLabel = document.getElementById("score-label");
  var problemText = document.getElementById("problem-text");
  var answerInput = document.getElementById("answer-input");
  var keyToggle = document.getElementById("key-toggle");

  var state = null;
  var timerId = null;

  /* ---------- settings form ---------- */

  function fillForm(s) {
    document.getElementById("op-add").checked = !!s.add;
    document.getElementById("op-sub").checked = !!s.sub;
    document.getElementById("op-mul").checked = !!s.mul;
    document.getElementById("op-div").checked = !!s.div;
    document.getElementById("add-l1").value = s.addL1;
    document.getElementById("add-h1").value = s.addH1;
    document.getElementById("add-l2").value = s.addL2;
    document.getElementById("add-h2").value = s.addH2;
    document.getElementById("mul-l1").value = s.mulL1;
    document.getElementById("mul-h1").value = s.mulH1;
    document.getElementById("mul-l2").value = s.mulL2;
    document.getElementById("mul-h2").value = s.mulH2;
    var sel = document.getElementById("duration");
    var has = false;
    for (var i = 0; i < sel.options.length; i++) if (sel.options[i].value === String(s.duration)) has = true;
    if (!has && s.duration > 0) sel.add(new Option(s.duration + " seconds", String(s.duration)));
    sel.value = String(s.duration);
  }

  function intVal(id, fallback) {
    var v = parseInt(document.getElementById(id).value, 10);
    return isNaN(v) ? fallback : v;
  }

  function readForm() {
    var d = ZTT.DEFAULT_SETTINGS;
    var s = {
      add: document.getElementById("op-add").checked,
      sub: document.getElementById("op-sub").checked,
      mul: document.getElementById("op-mul").checked,
      div: document.getElementById("op-div").checked,
      addL1: intVal("add-l1", d.addL1), addH1: intVal("add-h1", d.addH1),
      addL2: intVal("add-l2", d.addL2), addH2: intVal("add-h2", d.addH2),
      mulL1: intVal("mul-l1", d.mulL1), mulH1: intVal("mul-h1", d.mulH1),
      mulL2: intVal("mul-l2", d.mulL2), mulH2: intVal("mul-h2", d.mulH2),
      duration: parseInt(document.getElementById("duration").value, 10) || 120
    };
    var pairs = [["addL1", "addH1"], ["addL2", "addH2"], ["mulL1", "mulH1"], ["mulL2", "mulH2"]];
    pairs.forEach(function (p) {
      if (s[p[0]] > s[p[1]]) { var t = s[p[0]]; s[p[0]] = s[p[1]]; s[p[1]] = t; }
    });
    if (!s.add && !s.sub && !s.mul && !s.div) s.add = true;
    return s;
  }

  function refreshHardNote() {
    /* the pool shown always matches the settings currently on the form */
    var n = ZTT.getPool(readForm()).length;
    var total = ZTT.getPool().length;
    var note = document.getElementById("hard-note");
    var btn = document.getElementById("hard-btn");
    if (n === 0) {
      note.textContent = total === 0
        ? "No difficult problems collected yet — slow problems from your runs will gather here."
        : "No difficult problems match these settings (" + total + " collected under other settings).";
      btn.disabled = true;
    } else {
      note.textContent = n + " difficult problem" + (n > 1 ? "s" : "") + " for these settings.";
      btn.disabled = false;
    }
  }

  /* ---------- auto-reset preference ----------
     When on, starting a run puts a game key in the URL so a refresh starts a
     new run with the same settings immediately. When off, the URL stays
     clean and a refresh returns to this page. Stored per browser; on by
     default (the original zetamac behavior). */

  var PREF_KEY = "ztt.urlkeys";

  function autoResetOn() {
    try { return localStorage.getItem(PREF_KEY) !== "0"; } catch (e) { return true; }
  }

  function setAutoReset(on) {
    try { localStorage.setItem(PREF_KEY, on ? "1" : "0"); } catch (e) {}
    refreshKeyToggle();
  }

  function refreshKeyToggle() {
    var on = autoResetOn();
    keyToggle.textContent = "auto reset: " + (on ? "on" : "off");
    keyToggle.title = on
      ? "Refreshing mid-run starts a new run right away. Click to turn off."
      : "Refreshing mid-run returns to this page. Click to turn on.";
  }

  /* ---------- game keys ----------
     Like zetamac's /game?key=..., but self-describing: the key packs the
     settings (and the hard-mode flag) into a few bytes, base64url-encoded,
     so a URL carrying a key starts a run immediately on load or refresh and
     works in any browser without server-side storage. */

  function zigzag(n) { return n < 0 ? (-n * 2 - 1) : n * 2; }
  function unzigzag(u) { return (u % 2) ? -(u + 1) / 2 : u / 2; }

  function encodeKey(s, mode) {
    var bytes = [];
    bytes.push((s.add ? 1 : 0) | (s.sub ? 2 : 0) | (s.mul ? 4 : 0) | (s.div ? 8 : 0) |
               (mode === "hard" ? 16 : 0));
    [s.addL1, s.addH1, s.addL2, s.addH2, s.mulL1, s.mulH1, s.mulL2, s.mulH2, s.duration]
      .forEach(function (n) {
        var u = zigzag(Math.round(n) || 0);
        while (u >= 128) { bytes.push((u % 128) | 128); u = Math.floor(u / 128); }
        bytes.push(u);
      });
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function decodeKey(key) {
    try {
      var b64 = key.replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4) b64 += "=";
      var bin = atob(b64), bytes = [];
      for (var i = 0; i < bin.length; i++) bytes.push(bin.charCodeAt(i));
      var flags = bytes[0], pos = 1, vals = [];
      for (var k = 0; k < 9; k++) {
        var u = 0, mult = 1, byte;
        do {
          if (pos >= bytes.length) return null;
          byte = bytes[pos++];
          u += (byte & 127) * mult;
          mult *= 128;
        } while (byte & 128);
        vals.push(unzigzag(u));
      }
      var s = {
        add: !!(flags & 1), sub: !!(flags & 2), mul: !!(flags & 4), div: !!(flags & 8),
        addL1: vals[0], addH1: vals[1], addL2: vals[2], addH2: vals[3],
        mulL1: vals[4], mulH1: vals[5], mulL2: vals[6], mulH2: vals[7],
        duration: vals[8]
      };
      if (!(s.duration > 0)) return null;
      return { settings: s, mode: (flags & 16) ? "hard" : "normal" };
    } catch (e) {
      return null;
    }
  }

  function keyFromURL() {
    var m = /[?&]key=([A-Za-z0-9_-]+)/.exec(location.search);
    return m ? m[1] : null;
  }

  function setURLKey(key, push) {
    var url = location.pathname + (key ? "?key=" + key : "");
    if (location.pathname + location.search === url) return;
    try {
      if (push) history.pushState(null, "", url);
      else history.replaceState(null, "", url);
    } catch (e) { /* file:// or sandboxed contexts: the key simply won't stick */ }
  }

  function abortRun() {
    if (timerId) { clearInterval(timerId); timerId = null; }
    if (state) state.current = null;
  }

  /* Decide what to show from the URL: a valid key starts that run at once,
     otherwise the start page. Runs on load and on back/forward navigation. */
  function route() {
    var key = keyFromURL();
    var dec = key ? decodeKey(key) : null;
    if (!dec) {
      abortRun();
      fillForm(ZTT.getSettings());
      refreshHardNote();
      show(startView);
      if (key) setURLKey(null, false); // scrub an unreadable key
      return;
    }
    fillForm(dec.settings);
    startRun(dec.mode);
  }

  /* ---------- views ---------- */

  function show(view) {
    startView.style.display = view === startView ? "" : "none";
    gameView.style.display = view === gameView ? "" : "none";
    endView.style.display = view === endView ? "" : "none";
  }

  /* ---------- run ---------- */

  function startRun(mode) {
    abortRun();
    var settings = readForm();
    ZTT.setSettings(settings);

    var queue = [];
    if (mode === "hard") {
      queue = ZTT.getPool(settings);
      if (!queue.length) {
        /* nothing to practice under these settings — stay on the start page */
        fillForm(ZTT.getSettings());
        refreshHardNote();
        show(startView);
        setURLKey(null, false);
        return;
      }
      /* shuffle the pool for variety */
      for (var i = queue.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = queue[i]; queue[i] = queue[j]; queue[j] = t;
      }
    }

    /* auto reset on: the key lands in the address bar so a refresh restarts
       this exact run. Off: keep the URL clean (and quietly drop a key that
       arrived via a link or bookmark) so a refresh returns to the start page. */
    if (autoResetOn()) setURLKey(encodeKey(settings, mode), true);
    else setURLKey(null, false);

    state = {
      mode: mode,
      settings: settings,
      duration: settings.duration,
      score: 0,
      problems: [],
      queue: queue,
      current: null,
      tShown: 0,
      lastKey: null,
      endAt: performance.now() + settings.duration * 1000
    };

    scoreLabel.textContent = "Score: 0";
    secondsLabel.textContent = "Seconds left: " + settings.duration;
    show(gameView);
    nextProblem();
    answerInput.value = "";
    answerInput.focus();

    timerId = setInterval(tick, 200);
  }

  function tick() {
    var left = Math.max(0, Math.ceil((state.endAt - performance.now()) / 1000));
    secondsLabel.textContent = "Seconds left: " + left;
    if (performance.now() >= state.endAt) endRun();
  }

  function nextProblem() {
    var p = null;
    if (state.queue.length) {
      var q = state.queue.shift();
      p = { op: q.op, a: q.a, b: q.b, ans: q.ans, fromPool: true };
    } else if (state.mode === "hard") {
      /* the difficult pool is done — end the run rather than padding it
         with random problems (the timer still caps a long pool) */
      endRun();
      return;
    } else {
      for (var tries = 0; tries < 6; tries++) {
        p = ZProblems.generate(state.settings);
        if (ZTT.probKey(p) !== state.lastKey) break;
      }
    }
    state.current = p;
    state.lastKey = ZTT.probKey(p);
    state.tShown = performance.now();
    problemText.textContent = ZProblems.display(p) + " = ";
    answerInput.value = "";
  }

  function onInput() {
    if (!state || !state.current) return;
    var v = answerInput.value.trim();
    if (v === "" || !/^-?\d+$/.test(v)) return;
    if (parseInt(v, 10) === state.current.ans) {
      var t = Math.max(1, Math.round(performance.now() - state.tShown));
      state.problems.push({
        op: state.current.op, a: state.current.a, b: state.current.b,
        ans: state.current.ans, t: t, flag: false,
        fromPool: !!state.current.fromPool
      });
      state.score++;
      scoreLabel.textContent = "Score: " + state.score;
      if (performance.now() < state.endAt) nextProblem();
    }
  }

  function endRun() {
    clearInterval(timerId);
    timerId = null;
    state.current = null;
    var secsLeft = Math.max(0, Math.ceil((state.endAt - performance.now()) / 1000));
    var poolDone = state.mode === "hard" && state.queue.length === 0 && secsLeft > 0;

    var times = state.problems.map(function (p) { return p.t; });
    var med = ZTT.median(times);
    var added = 0, mastered = 0;

    /* Mastery thresholds adapt to the player's recent per-problem baseline
       (median solve time over recent runs at these settings). */
    var sig = ZTT.settingsSig(state.settings);
    var baseline = ZTT.baselineMs(sig);
    var goodMs = Math.min(3500, Math.max(1500, 2.5 * baseline));
    var blazeMs = Math.max(900, 1.25 * baseline);
    var sluggishMs = 2 * goodMs;

    state.problems.forEach(function (p) {
      var auto = (times.length >= 5 && p.t >= 2 * med && p.t >= 2000) || p.t >= 8000;
      if (ZTT.poolHas(p)) {
        /* pooled problem encountered (hard run or by chance): update its
           streak. Near-instant solves count double, fast solves count one,
           sluggish ones reset, flagged-slow ones reset AND raise the bar. */
        var outcome;
        if (p.t <= blazeMs) outcome = "blaze";
        else if (p.t <= goodMs) outcome = "good";
        else if (auto || p.t > sluggishMs) outcome = "slow";
        else outcome = "meh";
        p.flag = auto;
        if (ZTT.poolResult(p, outcome, p.t) === "mastered") mastered++;
      } else if (auto) {
        p.flag = true;
        if (ZTT.poolAdd(p, p.t)) added++;
      }
    });

    var run = ZTT.addRun({
      ts: Date.now(),
      mode: state.mode,
      settings: state.settings,
      sig: sig,
      duration: state.duration,
      score: state.score,
      problems: state.problems
    });

    document.getElementById("final-score").textContent = "Score: " + state.score;
    document.getElementById("end-score-top").textContent = "Score: " + state.score;
    document.getElementById("end-seconds").textContent = "Seconds left: " + secsLeft;

    var noteBits = [];
    if (poolDone) noteBits.push("difficult pool for these settings completed");
    if (added) noteBits.push(added + " problem" + (added > 1 ? "s" : "") + " added to the difficult pool");
    if (mastered) noteBits.push(mastered + " mastered and removed from the pool");
    if (state.mode === "hard" && !mastered && state.problems.some(function (p) { return p.fromPool; })) {
      noteBits.push("no problems mastered yet — hover a flag below for streak progress");
    }
    document.getElementById("pool-note").textContent = noteBits.join(" · ");

    ZReview.render(run, document.getElementById("review-container"), {});
    show(endView);
  }

  /* ---------- wiring ---------- */

  document.getElementById("start-btn").addEventListener("click", function () { startRun("normal"); });
  document.getElementById("hard-btn").addEventListener("click", function () { startRun("hard"); });

  keyToggle.addEventListener("click", function () { setAutoReset(!autoResetOn()); });

  document.getElementById("try-again").addEventListener("click", function (e) {
    e.preventDefault();
    fillForm(ZTT.getSettings());
    startRun(state ? state.mode : "normal");
  });

  document.getElementById("change-settings").addEventListener("click", function (e) {
    e.preventDefault();
    setURLKey(null, true);
    fillForm(ZTT.getSettings());
    refreshHardNote();
    show(startView);
  });

  answerInput.addEventListener("input", onInput);

  /* keep the answer box focused while a run is live */
  answerInput.addEventListener("blur", function () {
    if (state && state.current && performance.now() < state.endAt) {
      setTimeout(function () { answerInput.focus(); }, 0);
    }
  });

  /* Enter on the start page starts a normal run */
  startView.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && e.target.tagName !== "BUTTON") startRun("normal");
  });

  /* keep the difficult-problem count in sync with the settings form */
  startView.addEventListener("change", refreshHardNote);
  startView.addEventListener("input", refreshHardNote);

  /* browser back/forward moves between the start page and keyed runs */
  window.addEventListener("popstate", route);

  refreshKeyToggle();
  route();
})();