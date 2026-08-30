/* Stats dashboard: filters, tiles, trend charts, operation breakdown,
   recurring trouble spots, run history with per-run review. */

(function () {

  var BLUE = "#2a78d6", ORANGE = "#eb6834";

  var body = document.getElementById("stats-body");
  var historyContainer = document.getElementById("history-container");
  var sigFilter = document.getElementById("sig-filter");
  var includeHard = document.getElementById("include-hard");
  var removeOutliers = document.getElementById("remove-outliers");

  var showAllHistory = false;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function runSig(r) { return r.sig || ZTT.settingsSig(r.settings); }

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function fmtDate(ts) {
    var d = new Date(ts);
    return MONTHS[d.getMonth()] + " " + d.getDate();
  }
  function fmtDateTime(ts) {
    var d = new Date(ts);
    var h = d.getHours() % 12 || 12, ap = d.getHours() < 12 ? "AM" : "PM";
    var m = d.getMinutes(); if (m < 10) m = "0" + m;
    return fmtDate(ts) + ", " + h + ":" + m + " " + ap;
  }

  /* ---------- filters ---------- */

  function buildSigFilter() {
    var counts = {};
    ZTT.getRuns().forEach(function (r) {
      var s = runSig(r);
      counts[s] = (counts[s] || 0) + 1;
    });
    var sigs = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });

    sigFilter.textContent = "";
    var optAll = el("option", "", "All settings");
    optAll.value = "*";
    sigFilter.appendChild(optAll);
    sigs.forEach(function (s) {
      var label = (s === ZTT.DEFAULT_SIG ? "Default settings" : s) + " (" + counts[s] + ")";
      var o = el("option", "", label);
      o.value = s;
      sigFilter.appendChild(o);
    });
    if (counts[ZTT.DEFAULT_SIG]) sigFilter.value = ZTT.DEFAULT_SIG;
    else sigFilter.value = sigs.length === 1 ? sigs[0] : "*";
  }

  function filteredRuns() {
    var sig = sigFilter.value;
    return ZTT.getRuns().filter(function (r) {
      if (r.excluded) return false;
      if (!includeHard.checked && r.mode === "hard") return false;
      if (sig !== "*" && runSig(r) !== sig) return false;
      return true;
    }).sort(function (a, b) { return a.ts - b.ts; });
  }

  /* Modified z-score of each run's score against non-excluded normal runs
     sharing its settings signature. Used to spot "near-outlier" low runs. */
  function runZMap() {
    var groups = {};
    ZTT.getRuns().forEach(function (r) {
      if (r.mode === "hard" || r.excluded || !r.score) return;
      var s = runSig(r);
      (groups[s] = groups[s] || []).push(r);
    });
    var zmap = {};
    Object.keys(groups).forEach(function (s) {
      var rs = groups[s];
      if (rs.length < 5) return; // too little history to judge
      var zs = ZTT.modifiedZ(rs.map(function (r) { return r.score; }));
      rs.forEach(function (r, i) { zmap[r.id] = zs[i]; });
    });
    return zmap;
  }

  /* ---------- tiles ---------- */

  function tile(label, value, deltaText, deltaCls) {
    var t = el("div", "tile");
    t.appendChild(el("div", "t-label", label));
    t.appendChild(el("div", "t-value", value));
    if (deltaText) t.appendChild(el("div", "t-delta " + (deltaCls || ""), deltaText));
    return t;
  }

  function renderTiles(runs) {
    var tiles = el("div", "tiles");
    var scores = runs.map(function (r) { return r.score; });
    var best = scores.length ? Math.max.apply(null, scores) : 0;

    var last10 = runs.slice(-10), prev10 = runs.slice(-20, -10);
    function avgScore(rs) {
      if (!rs.length) return null;
      return rs.reduce(function (s, r) { return s + r.score; }, 0) / rs.length;
    }
    var a10 = avgScore(last10), p10 = avgScore(prev10);
    var deltaText = null, deltaCls = "";
    if (a10 !== null && p10 !== null) {
      var d = a10 - p10;
      deltaText = (d >= 0 ? "▲ +" : "▼ ") + d.toFixed(1) + " vs prior 10";
      deltaCls = d >= 0 ? "up" : "down";
    }

    var scored = last10.filter(function (r) { return r.score > 0; });
    var rate = null;
    if (scored.length) {
      var totT = scored.reduce(function (s, r) { return s + r.duration; }, 0);
      var totS = scored.reduce(function (s, r) { return s + r.score; }, 0);
      rate = totT / totS;
    }

    /* pool tile scopes to the selected settings, like the start page does */
    var sig = sigFilter.value, poolCount, poolNote;
    if (sig === "*") {
      poolCount = ZTT.getPool().length;
      poolNote = "problems collected";
    } else {
      var sample = null;
      ZTT.getRuns().forEach(function (r) { if (runSig(r) === sig && r.settings) sample = r; });
      poolCount = sample ? ZTT.getPool(sample.settings).length : ZTT.getPool().length;
      poolNote = "for these settings";
    }

    tiles.appendChild(tile("Best score", String(best)));
    tiles.appendChild(tile("Average, last 10", a10 === null ? "—" : a10.toFixed(1), deltaText, deltaCls));
    tiles.appendChild(tile("Runs recorded", String(runs.length)));
    tiles.appendChild(tile("Seconds per problem", rate === null ? "—" : rate.toFixed(2) + " s", "last 10 runs"));
    tiles.appendChild(tile("Difficult pool", String(poolCount), poolNote));
    body.appendChild(tiles);
  }

  /* ---------- charts ---------- */

  function chartCard(title, subtitle) {
    var card = el("div", "chart-card");
    card.appendChild(el("h3", "", title));
    if (subtitle) card.appendChild(el("div", "chart-sub", subtitle));
    return card;
  }

  function legendRow(items) {
    var lg = el("div", "legend");
    items.forEach(function (it) {
      var s = el("span");
      var key = el("span", "key");
      key.style.borderTopColor = it.color;
      s.appendChild(key);
      s.appendChild(document.createTextNode(it.name));
      lg.appendChild(s);
    });
    return lg;
  }

  function movingAvg(values, w) {
    return values.map(function (v, i) {
      var lo = Math.max(0, i - w + 1);
      var win = values.slice(lo, i + 1).filter(function (x) { return x !== null; });
      if (!win.length || i < 1) return null;
      return Math.round((win.reduce(function (s, x) { return s + x; }, 0) / win.length) * 10) / 10;
    });
  }

  function renderScoreChart(runs) {
    if (runs.length < 2) return;
    var kept = runs, hidden = 0;
    if (removeOutliers.checked) {
      var mask = ZTT.outlierMask(runs.map(function (r) { return r.score; }));
      kept = runs.filter(function (r, i) { return mask[i]; });
      hidden = runs.length - kept.length;
    }
    if (kept.length < 2) return;

    var sub = kept.length + " runs" + (hidden ? " · " + hidden + " outlier" + (hidden > 1 ? "s" : "") + " hidden" : "");
    var card = chartCard("Score over time", sub);
    card.appendChild(legendRow([{ name: "Score", color: BLUE }, { name: "5-run average", color: ORANGE }]));
    var mount = el("div");
    card.appendChild(mount);
    body.appendChild(card);

    var scores = kept.map(function (r) { return r.score; });
    ZCharts.lineChart(mount, {
      series: [
        { name: "Score", color: BLUE, values: scores },
        { name: "5-run average", color: ORANGE, values: movingAvg(scores, 5) }
      ],
      xLabels: kept.map(function (r) { return fmtDate(r.ts); }),
      xTitles: kept.map(function (r) { return fmtDateTime(r.ts) + (r.mode === "hard" ? " (hard run)" : ""); }),
      height: 240
    });
  }

  function renderRateChart(runs) {
    var scored = runs.filter(function (r) { return r.score > 0; });
    if (scored.length < 2) return;
    var rates = scored.map(function (r) { return Math.round((r.duration / r.score) * 100) / 100; });
    var kept = scored, keptRates = rates, hidden = 0;
    if (removeOutliers.checked) {
      var mask = ZTT.outlierMask(rates);
      kept = scored.filter(function (r, i) { return mask[i]; });
      keptRates = rates.filter(function (v, i) { return mask[i]; });
      hidden = scored.length - kept.length;
    }
    if (kept.length < 2) return;

    var sub = "Lower is faster" + (hidden ? " · " + hidden + " outlier" + (hidden > 1 ? "s" : "") + " hidden" : "");
    var card = chartCard("Seconds per problem", sub);
    var mount = el("div");
    card.appendChild(mount);
    body.appendChild(card);

    ZCharts.lineChart(mount, {
      series: [{ name: "s / problem", color: BLUE, values: keptRates }],
      xLabels: kept.map(function (r) { return fmtDate(r.ts); }),
      xTitles: kept.map(function (r) { return fmtDateTime(r.ts); }),
      yFmt: function (v) { return v.toFixed(1) + "s"; },
      height: 200
    });
  }

  function renderOpChart(runs) {
    var agg = {};
    runs.forEach(function (r) {
      r.problems.forEach(function (p) {
        if (!agg[p.op]) agg[p.op] = { n: 0, tot: 0 };
        agg[p.op].n++;
        agg[p.op].tot += p.t;
      });
    });
    var rows = Object.keys(agg).map(function (op) {
      return {
        label: ZProblems.OP_NAME[op],
        value: agg[op].tot / agg[op].n / 1000,
        detail: agg[op].n + " problems"
      };
    }).sort(function (a, b) { return b.value - a.value; });
    if (!rows.length) return;

    var card = chartCard("Average time by operation", "Where the seconds actually go");
    var mount = el("div");
    card.appendChild(mount);
    body.appendChild(card);

    ZCharts.barChartH(mount, {
      rows: rows,
      color: BLUE,
      vFmt: function (v) { return v.toFixed(2) + " s"; }
    });
  }

  function renderTroubleSpots(runs) {
    var agg = {};
    runs.forEach(function (r) {
      r.problems.forEach(function (p) {
        var k = ZTT.probKey(p);
        if (!agg[k]) agg[k] = { p: p, n: 0, tot: 0 };
        agg[k].n++;
        agg[k].tot += p.t;
      });
    });
    var rows = Object.keys(agg)
      .map(function (k) { return agg[k]; })
      .filter(function (a) { return a.n >= 2; })
      .sort(function (a, b) { return (b.tot / b.n) - (a.tot / a.n); })
      .slice(0, 8);
    if (!rows.length) return;

    var card = chartCard("Recurring trouble spots", "Problems seen more than once, slowest first");
    var table = el("table", "review");
    var hr = el("tr");
    [["Problem", ""], ["Seen", "num"], ["Avg time", "num"], ["Flag", ""], ["", ""]].forEach(function (h) {
      hr.appendChild(el("th", h[1], h[0]));
    });
    var thead = el("thead"); thead.appendChild(hr); table.appendChild(thead);
    var tbody = el("tbody");

    rows.forEach(function (a) {
      var tr = el("tr");
      tr.appendChild(el("td", "", ZProblems.display(a.p) + " = " + a.p.ans));
      tr.appendChild(el("td", "num", String(a.n)));
      tr.appendChild(el("td", "num", (a.tot / a.n / 1000).toFixed(1) + " s"));

      var flagTd = el("td");
      var flagBtn = el("button", "flag-btn", "⚑");
      if (ZTT.poolHas(a.p)) flagBtn.classList.add("flagged");
      flagBtn.title = "Toggle membership in the difficult pool";
      flagBtn.addEventListener("click", function () {
        if (ZTT.poolHas(a.p)) { ZTT.poolRemove(a.p); flagBtn.classList.remove("flagged"); }
        else { ZTT.poolAdd(a.p, Math.round(a.tot / a.n)); flagBtn.classList.add("flagged"); }
      });
      flagTd.appendChild(flagBtn);
      tr.appendChild(flagTd);

      var tipTd = el("td");
      var tipBtn = el("button", "tip-btn", "tip");
      var open = false, tipRow = null;
      tipBtn.addEventListener("click", function () {
        if (open) { tipRow.remove(); open = false; tipBtn.textContent = "tip"; return; }
        tipRow = el("tr", "tip-row");
        var td = el("td", "", ZTips.tipFor(a.p));
        td.colSpan = 5;
        tipRow.appendChild(td);
        tr.after(tipRow);
        open = true;
        tipBtn.textContent = "hide";
      });
      tipTd.appendChild(tipBtn);
      tr.appendChild(tipTd);

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    card.appendChild(table);
    body.appendChild(card);
  }

  /* ---------- run history ---------- */

  function renderHistory() {
    historyContainer.textContent = "";
    var runs = ZTT.getRuns().slice().sort(function (a, b) { return b.ts - a.ts; });
    if (!runs.length) {
      historyContainer.appendChild(el("div", "empty-note", "No runs yet."));
      return;
    }

    var zmap = runZMap();
    var limit = showAllHistory ? runs.length : 30;
    var table = el("table", "review");
    var hr = el("tr");
    [["When", ""], ["Mode", ""], ["Score", "num"], ["s / problem", "num"], ["Settings", ""], ["", ""]].forEach(function (h) {
      hr.appendChild(el("th", h[1], h[0]));
    });
    var thead = el("thead"); thead.appendChild(hr); table.appendChild(thead);
    var tbody = el("tbody");

    runs.slice(0, limit).forEach(function (r) {
      var tr = el("tr", "hist-row" + (r.excluded ? " excluded-row" : ""));
      tr.appendChild(el("td", "", fmtDateTime(r.ts)));
      var modeTd = el("td");
      if (r.mode === "hard") modeTd.appendChild(el("span", "mode-tag", "hard"));
      if (r.excluded) modeTd.appendChild(el("span", "mode-tag", "excluded"));
      tr.appendChild(modeTd);
      tr.appendChild(el("td", "num", String(r.score)));
      tr.appendChild(el("td", "num", r.score > 0 ? (r.duration / r.score).toFixed(2) : "—"));
      var sigTd = el("td", "", runSig(r) === ZTT.DEFAULT_SIG ? "default" : runSig(r));
      sigTd.style.color = "#898781";
      sigTd.style.fontSize = "0.85em";
      tr.appendChild(sigTd);

      /* action cell: undo for excluded runs; an "exclude?" prompt for runs
         scoring well below typical that the auto outlier filter won't catch */
      var actTd = el("td");
      if (r.excluded) {
        var inc = el("button", "tip-btn", "include");
        inc.title = "Put this run back into the stats.";
        inc.addEventListener("click", function (e) {
          e.stopPropagation();
          ZTT.setRunExcluded(r.id, false);
          render();
        });
        actTd.appendChild(inc);
      } else if (zmap[r.id] !== undefined && zmap[r.id] <= -2.0) {
        var ex = el("button", "tip-btn ask-btn", "low run — exclude?");
        ex.title = "Scored well below your typical for these settings (went afk?). " +
          "Click to leave it out of graphs and averages; it can be re-included any time.";
        ex.addEventListener("click", function (e) {
          e.stopPropagation();
          ZTT.setRunExcluded(r.id, true);
          render();
        });
        actTd.appendChild(ex);
      }
      tr.appendChild(actTd);

      var open = false, detailRow = null;
      tr.addEventListener("click", function () {
        if (open) { detailRow.remove(); open = false; return; }
        detailRow = el("tr", "hist-detail-row");
        var td = el("td");
        td.colSpan = 6;
        var wrap = el("div");
        wrap.style.padding = "10px 8px 4px 8px";
        ZReview.render(r, wrap, {});
        td.appendChild(wrap);
        detailRow.appendChild(td);
        tr.after(detailRow);
        open = true;
      });

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    historyContainer.appendChild(table);

    if (runs.length > limit) {
      var more = el("button", "tip-btn", "Show all " + runs.length + " runs");
      more.style.margin = "10px 0";
      more.addEventListener("click", function () { showAllHistory = true; renderHistory(); });
      historyContainer.appendChild(more);
    }

    /* storage meter — heavy use can approach the browser's localStorage cap */
    var info = ZTT.storageInfo();
    var noteText = "Storage: about " + info.pct + "% used · " + info.runs + " runs stored.";
    if (info.pct >= 80) noteText += " Getting full — export your data soon.";
    var note = el("div", "storage-note", noteText);
    if (info.trimmed > 0) {
      note.appendChild(el("div", "storage-warn",
        "Storage filled up at some point and the " + info.trimmed +
        " oldest runs were trimmed to make room. Export regularly to keep a full archive."));
    }
    historyContainer.appendChild(note);
  }

  /* ---------- main render ---------- */

  function render() {
    body.textContent = "";
    var runs = filteredRuns();
    if (!runs.length) {
      body.appendChild(el("div", "empty-note",
        "No runs recorded yet for this filter — play a run and stats will appear here."));
    } else {
      renderTiles(runs);
      renderScoreChart(runs);
      renderRateChart(runs);
      renderOpChart(runs);
      renderTroubleSpots(runs);
    }
    renderHistory();
  }

  /* ---------- export / import ---------- */

  document.getElementById("export-btn").addEventListener("click", function () {
    var blob = new Blob([ZTT.exportJSON()], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "zetamac-trainer-export.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    document.getElementById("io-status").textContent = "Exported.";
  });

  document.getElementById("import-btn").addEventListener("click", function () {
    document.getElementById("import-file").click();
  });

  document.getElementById("import-file").addEventListener("change", function (ev) {
    var f = ev.target.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var res = ZTT.importJSON(String(reader.result));
        document.getElementById("io-status").textContent =
          "Imported " + res.runs + " runs and " + res.pool + " pool problems.";
        buildSigFilter();
        render();
      } catch (e) {
        document.getElementById("io-status").textContent = "Import failed: " + e.message;
      }
    };
    reader.readAsText(f);
    ev.target.value = "";
  });

  sigFilter.addEventListener("change", render);
  includeHard.addEventListener("change", render);
  removeOutliers.addEventListener("change", render);

  buildSigFilter();
  render();
})();