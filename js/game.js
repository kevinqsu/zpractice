/* Game flow: settings form, timed drill, per-problem timing, end screen. */

(function () {

  var startView = document.getElementById("start-view");
  var gameView = document.getElementById("game-view");
  var endView = document.getElementById("end-view");

  var secondsLabel = document.getElementById("seconds-left");
  var scoreLabel = document.getElementById("score-label");
  var problemText = document.getElementById("problem-text");
  var answerInput = document.getElementById("answer-input");

  var MASTER_MS = 2500;    // a solve this fast counts toward a problem's mastery streak

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
    document.getElementById("duration").value = String(s.duration);
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
    var n = ZTT.getPool().length;
    var note = document.getElementById("hard-note");
    var btn = document.getElementById("hard-btn");
    if (n === 0) {
      note.textContent = "No difficult problems collected yet — slow problems from your runs will gather here.";
      btn.disabled = true;
    } else {
      note.textContent = n + " difficult problem" + (n > 1 ? "s" : "") +
        " collected; the run fills up with random problems once they are used up.";
      btn.disabled = false;
    }
  }

  /* ---------- views ---------- */

  function show(view) {
    startView.style.display = view === startView ? "" : "none";
    gameView.style.display = view === gameView ? "" : "none";
    endView.style.display = view === endView ? "" : "none";
  }

  /* ---------- run ---------- */

  function startRun(mode) {
    var settings = readForm();
    ZTT.setSettings(settings);

    var queue = [];
    if (mode === "hard") {
      queue = ZTT.getPool();
      /* newest flags first, then shuffle within the pool for variety */
      for (var i = queue.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = queue[i]; queue[i] = queue[j]; queue[j] = t;
      }
    }

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

    var times = state.problems.map(function (p) { return p.t; });
    var med = ZTT.median(times);
    var added = 0, mastered = 0;

    state.problems.forEach(function (p) {
      var auto = (times.length >= 5 && p.t >= 2 * med && p.t >= 2000) || p.t >= 8000;
      if (ZTT.poolHas(p)) {
        /* pooled problem encountered (hard run or by chance): update its streak.
           Fast solves build toward mastery; a flagged-slow solve resets the
           streak AND raises the requirement; anything between just resets. */
        var outcome = p.t <= MASTER_MS ? "good" : (auto ? "slow" : "meh");
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
      sig: ZTT.settingsSig(state.settings),
      duration: state.duration,
      score: state.score,
      problems: state.problems
    });

    document.getElementById("final-score").textContent = "Score: " + state.score;
    document.getElementById("end-score-top").textContent = "Score: " + state.score;
    document.getElementById("end-seconds").textContent = "Seconds left: 0";

    var noteBits = [];
    if (added) noteBits.push(added + " problem" + (added > 1 ? "s" : "") + " added to the difficult pool");
    if (mastered) noteBits.push(mastered + " mastered and removed from the pool");
    if (state.mode === "hard" && !mastered && state.problems.some(function (p) { return p.fromPool; })) {
      noteBits.push("mastery needs " + ZTT.DEFAULT_NEED + "+ fast solves in a row — hover a flag for progress");
    }
    document.getElementById("pool-note").textContent = noteBits.join(" · ");

    ZReview.render(run, document.getElementById("review-container"), {});
    show(endView);
  }

  /* ---------- wiring ---------- */

  document.getElementById("start-btn").addEventListener("click", function () { startRun("normal"); });
  document.getElementById("hard-btn").addEventListener("click", function () { startRun("hard"); });

  document.getElementById("try-again").addEventListener("click", function (e) {
    e.preventDefault();
    fillForm(ZTT.getSettings());
    startRun(state ? state.mode : "normal");
  });

  document.getElementById("change-settings").addEventListener("click", function (e) {
    e.preventDefault();
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

  fillForm(ZTT.getSettings());
  refreshHardNote();
})();
