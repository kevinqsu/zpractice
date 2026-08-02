/* Minimal dependency-free SVG charts: an indexed line chart with crosshair
   tooltip, and a horizontal bar chart with per-mark tooltips. */

var ZCharts = (function () {

  var SURFACE = "#fcfcfb";
  var GRID = "#e1e0d9";
  var AXIS = "#c3c2b7";
  var MUTED = "#898781";
  var INK = "#0b0b0b";

  var NS = "http://www.w3.org/2000/svg";

  function svgEl(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function niceTicks(lo, hi, n) {
    if (lo === hi) { lo -= 1; hi += 1; }
    var span = hi - lo;
    var step = Math.pow(10, Math.floor(Math.log10(span / n)));
    var err = (span / n) / step;
    if (err >= 7.5) step *= 10;
    else if (err >= 3.5) step *= 5;
    else if (err >= 1.5) step *= 2;
    var ticks = [];
    var start = Math.ceil(lo / step) * step;
    for (var v = start; v <= hi + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
    return ticks;
  }

  /* opts: { series: [{name, color, values: [number|null]}],
             xLabels: [string], xTitles: [string], yFmt: fn, height } */
  function lineChart(container, opts) {
    container.textContent = "";
    var wrap = el("div", "chart-svg-wrap");
    container.appendChild(wrap);

    var W = Math.max(320, container.clientWidth || 640);
    var H = opts.height || 220;
    var M = { l: 40, r: 56, t: 12, b: 24 };
    var n = opts.xLabels.length;

    var all = [];
    opts.series.forEach(function (s) {
      s.values.forEach(function (v) { if (v !== null && v !== undefined) all.push(v); });
    });
    if (!all.length) { wrap.appendChild(el("div", "empty-note", "Not enough data yet.")); return; }

    var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
    var pad = (hi - lo) * 0.12 || Math.max(1, hi * 0.1);
    lo = Math.max(0, lo - pad); hi = hi + pad;
    var ticks = niceTicks(lo, hi, 4);

    var iw = W - M.l - M.r, ih = H - M.t - M.b;
    function px(i) { return M.l + (n === 1 ? iw / 2 : (i * iw) / (n - 1)); }
    function py(v) { return M.t + ih - ((v - lo) / (hi - lo)) * ih; }

    var svg = svgEl("svg", { width: W, height: H, viewBox: "0 0 " + W + " " + H });
    svg.style.display = "block";

    ticks.forEach(function (t) {
      svg.appendChild(svgEl("line", { x1: M.l, x2: W - M.r, y1: py(t), y2: py(t), stroke: GRID, "stroke-width": 1 }));
      var txt = svgEl("text", { x: M.l - 6, y: py(t) + 3.5, "text-anchor": "end", fill: MUTED, "font-size": 11 });
      txt.textContent = opts.yFmt ? opts.yFmt(t) : t;
      svg.appendChild(txt);
    });
    svg.appendChild(svgEl("line", { x1: M.l, x2: W - M.r, y1: M.t + ih, y2: M.t + ih, stroke: AXIS, "stroke-width": 1 }));

    /* sparse x labels */
    var lblEvery = Math.max(1, Math.ceil(n / 6));
    for (var i = 0; i < n; i++) {
      if (i % lblEvery !== 0 && i !== n - 1) continue;
      var tx = svgEl("text", { x: px(i), y: H - 6, "text-anchor": "middle", fill: MUTED, "font-size": 11 });
      tx.textContent = opts.xLabels[i];
      svg.appendChild(tx);
    }

    opts.series.forEach(function (s, si) {
      var d = "", started = false;
      s.values.forEach(function (v, i) {
        if (v === null || v === undefined) { started = false; return; }
        d += (started ? " L" : " M") + px(i).toFixed(1) + " " + py(v).toFixed(1);
        started = true;
      });
      if (d) svg.appendChild(svgEl("path", {
        d: d, fill: "none", stroke: s.color, "stroke-width": 2,
        "stroke-linejoin": "round", "stroke-linecap": "round"
      }));
      /* end marker + endpoint label for the primary series */
      var lastIdx = -1;
      s.values.forEach(function (v, i) { if (v !== null && v !== undefined) lastIdx = i; });
      if (lastIdx >= 0) {
        var v = s.values[lastIdx];
        svg.appendChild(svgEl("circle", {
          cx: px(lastIdx), cy: py(v), r: 4, fill: s.color, stroke: SURFACE, "stroke-width": 2
        }));
        if (si === 0) {
          var lab = svgEl("text", { x: px(lastIdx) + 9, y: py(v) + 4, fill: INK, "font-size": 12, "font-weight": "bold" });
          lab.textContent = opts.yFmt ? opts.yFmt(v) : v;
          svg.appendChild(lab);
        }
      }
    });

    /* crosshair + tooltip */
    var cross = svgEl("line", { y1: M.t, y2: M.t + ih, stroke: AXIS, "stroke-width": 1, visibility: "hidden" });
    svg.appendChild(cross);
    var dots = opts.series.map(function (s) {
      var c = svgEl("circle", { r: 4, fill: s.color, stroke: SURFACE, "stroke-width": 2, visibility: "hidden" });
      svg.appendChild(c);
      return c;
    });

    var tip = el("div", "viz-tooltip");
    wrap.appendChild(tip);

    function onMove(ev) {
      var rect = svg.getBoundingClientRect();
      var x = ev.clientX - rect.left;
      var i = Math.round(((x - M.l) / iw) * (n - 1));
      i = Math.max(0, Math.min(n - 1, isNaN(i) ? 0 : i));
      var cx = px(i);
      cross.setAttribute("x1", cx); cross.setAttribute("x2", cx);
      cross.setAttribute("visibility", "visible");

      tip.textContent = "";
      tip.appendChild(el("div", "tt-title", opts.xTitles ? opts.xTitles[i] : opts.xLabels[i]));
      opts.series.forEach(function (s, si) {
        var v = s.values[i];
        if (v === null || v === undefined) { dots[si].setAttribute("visibility", "hidden"); return; }
        dots[si].setAttribute("cx", cx); dots[si].setAttribute("cy", py(v));
        dots[si].setAttribute("visibility", "visible");
        var row = el("div", "tt-row");
        var key = el("span", "tt-key"); key.style.borderTopColor = s.color;
        row.appendChild(key);
        row.appendChild(el("span", "tt-val", opts.yFmt ? opts.yFmt(v) : String(v)));
        row.appendChild(el("span", "tt-name", s.name));
        tip.appendChild(row);
      });
      tip.style.display = "block";
      var tw = tip.offsetWidth;
      var left = cx + 12 + tw > W ? cx - tw - 12 : cx + 12;
      tip.style.left = left + "px";
      tip.style.top = (M.t + 4) + "px";
    }
    function onLeave() {
      cross.setAttribute("visibility", "hidden");
      dots.forEach(function (d) { d.setAttribute("visibility", "hidden"); });
      tip.style.display = "none";
    }
    svg.addEventListener("pointermove", onMove);
    svg.addEventListener("pointerleave", onLeave);

    wrap.appendChild(svg);
    wrap.appendChild(tip);
  }

  /* opts: { rows: [{label, value, detail}], color, vFmt, max } */
  function barChartH(container, opts) {
    container.textContent = "";
    var wrap = el("div", "chart-svg-wrap");
    container.appendChild(wrap);

    var rows = opts.rows;
    if (!rows.length) { wrap.appendChild(el("div", "empty-note", "Not enough data yet.")); return; }

    var W = Math.max(320, container.clientWidth || 640);
    var rowH = 30, barH = 16;
    var M = { l: 110, r: 64, t: 6, b: 6 };
    var H = M.t + M.b + rows.length * rowH;
    var iw = W - M.l - M.r;
    var max = opts.max || Math.max.apply(null, rows.map(function (r) { return r.value; })) * 1.08;

    var svg = svgEl("svg", { width: W, height: H, viewBox: "0 0 " + W + " " + H });
    svg.style.display = "block";

    var tip = el("div", "viz-tooltip");

    rows.forEach(function (r, i) {
      var y = M.t + i * rowH + (rowH - barH) / 2;
      var w = Math.max(2, (r.value / max) * iw);

      var lab = svgEl("text", { x: M.l - 10, y: y + barH / 2 + 4, "text-anchor": "end", fill: "#52514e", "font-size": 12 });
      lab.textContent = r.label;
      svg.appendChild(lab);

      /* rounded data end (right), square baseline (left) */
      var rr = Math.min(4, w / 2);
      var d = "M" + M.l + " " + y +
        " H" + (M.l + w - rr) +
        " a" + rr + " " + rr + " 0 0 1 " + rr + " " + rr +
        " V" + (y + barH - rr) +
        " a" + rr + " " + rr + " 0 0 1 -" + rr + " " + rr +
        " H" + M.l + " Z";
      var bar = svgEl("path", { d: d, fill: opts.color });
      svg.appendChild(bar);

      var val = svgEl("text", { x: M.l + w + 8, y: y + barH / 2 + 4, fill: INK, "font-size": 12, "font-weight": "bold" });
      val.textContent = opts.vFmt ? opts.vFmt(r.value) : r.value;
      svg.appendChild(val);

      /* transparent hit area covering the row */
      var hit = svgEl("rect", { x: 0, y: M.t + i * rowH, width: W, height: rowH, fill: "transparent" });
      hit.addEventListener("pointermove", function (ev) {
        bar.setAttribute("opacity", "0.8");
        tip.textContent = "";
        tip.appendChild(el("div", "tt-title", r.label));
        var row = el("div", "tt-row");
        row.appendChild(el("span", "tt-val", opts.vFmt ? opts.vFmt(r.value) : String(r.value)));
        if (r.detail) row.appendChild(el("span", "tt-name", r.detail));
        tip.appendChild(row);
        tip.style.display = "block";
        var rect = svg.getBoundingClientRect();
        var x = ev.clientX - rect.left + 14;
        if (x + tip.offsetWidth > W) x = x - tip.offsetWidth - 24;
        tip.style.left = x + "px";
        tip.style.top = (M.t + i * rowH - 6) + "px";
      });
      hit.addEventListener("pointerleave", function () {
        bar.removeAttribute("opacity");
        tip.style.display = "none";
      });
      svg.appendChild(hit);
    });

    /* baseline */
    svg.appendChild(svgEl("line", { x1: M.l, x2: M.l, y1: M.t, y2: H - M.b, stroke: AXIS, "stroke-width": 1 }));

    wrap.appendChild(svg);
    wrap.appendChild(tip);
  }

  return { lineChart: lineChart, barChartH: barChartH };
})();
