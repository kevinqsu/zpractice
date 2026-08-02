/* Per-problem review table, shared by the end-of-run screen (index.html)
   and the run-history detail view (stats.html). */

var ZReview = (function () {

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function fmtTime(ms) { return (ms / 1000).toFixed(1) + " s"; }

  function slowThreshold(run) {
    var times = run.problems.map(function (p) { return p.t; });
    if (!times.length) return Infinity;
    var med = ZTT.median(times);
    return Math.max(2 * med, 2000);
  }

  /* Renders the review table into `container`. */
  function render(run, container, opts) {
    opts = opts || {};
    container.textContent = "";

    if (!run.problems.length) {
      container.appendChild(el("div", "empty-note", "No problems answered in this run."));
      return;
    }

    var thresh = slowThreshold(run);
    var times = run.problems.map(function (p) { return p.t; });
    var med = ZTT.median(times);
    var avg = times.reduce(function (s, t) { return s + t; }, 0) / times.length;
    var nSlow = run.problems.filter(function (p) { return p.t >= thresh; }).length;

    var meta = el("div", "review-meta",
      "Average " + fmtTime(avg) + " per problem · median " + fmtTime(med) +
      (nSlow ? " · " + nSlow + " slow problem" + (nSlow > 1 ? "s" : "") + " highlighted" : ""));
    container.appendChild(meta);

    var table = el("table", "review");
    var thead = el("thead");
    var hr = el("tr");
    [["#", ""], ["Problem", ""], ["Answer", "num"], ["Time", "num"], ["Flag", ""], ["", ""]]
      .forEach(function (h) {
        var th = el("th", h[1], h[0]);
        hr.appendChild(th);
      });
    thead.appendChild(hr);
    table.appendChild(thead);

    var tbody = el("tbody");

    run.problems.forEach(function (p, i) {
      var tr = el("tr", p.t >= thresh ? "slow-row" : "");
      tr.appendChild(el("td", "", String(i + 1)));
      tr.appendChild(el("td", "", ZProblems ? ZProblems.display(p) :
        (p.a + " " + { add: "+", sub: "−", mul: "×", div: "÷" }[p.op] + " " + p.b)));
      tr.appendChild(el("td", "num", String(p.ans)));
      tr.appendChild(el("td", "num", fmtTime(p.t)));

      /* flag toggle: membership in the difficult-problem pool */
      var flagTd = el("td");
      var flagBtn = el("button", "flag-btn", "⚑");
      function flagTitle() {
        var entry = ZTT.poolGet(p);
        if (!entry) return "Add to difficult problems";
        return "In difficult pool — " + entry.streak + "/" + entry.need +
               " fast solves toward mastery. Click to remove.";
      }
      if (ZTT.poolHas(p)) flagBtn.classList.add("flagged");
      flagBtn.title = flagTitle();
      flagBtn.addEventListener("click", function () {
        if (ZTT.poolHas(p)) {
          ZTT.poolRemove(p);
          flagBtn.classList.remove("flagged");
          if (run.id) ZTT.updateProblemFlag(run.id, i, false);
        } else {
          ZTT.poolAdd(p, p.t);
          flagBtn.classList.add("flagged");
          if (run.id) ZTT.updateProblemFlag(run.id, i, true);
        }
        flagBtn.title = flagTitle();
        if (opts.onFlagChange) opts.onFlagChange();
      });
      flagTd.appendChild(flagBtn);
      tr.appendChild(flagTd);

      /* tip toggle */
      var tipTd = el("td");
      var tipBtn = el("button", "tip-btn", "tip");
      var tipOpen = false, tipRow = null;
      tipBtn.addEventListener("click", function () {
        if (tipOpen) {
          tipRow.remove();
          tipOpen = false;
          tipBtn.textContent = "tip";
          return;
        }
        tipRow = el("tr", "tip-row");
        var td = el("td", "", ZTips.tipFor(p));
        td.colSpan = 6;
        tipRow.appendChild(td);
        tr.after(tipRow);
        tipOpen = true;
        tipBtn.textContent = "hide";
      });
      tipTd.appendChild(tipBtn);
      tr.appendChild(tipTd);

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    container.appendChild(table);
  }

  return { render: render, slowThreshold: slowThreshold, fmtTime: fmtTime };
})();
