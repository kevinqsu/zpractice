/* Problem generation with the same semantics as zetamac:
   - addition: (r1) + (r2)
   - subtraction: addition problems in reverse
   - multiplication: (r1) x (r2)
   - division: multiplication problems in reverse */

var ZProblems = (function () {

  function randInt(lo, hi) {
    lo = Math.ceil(lo); hi = Math.floor(hi);
    if (hi < lo) { var t = lo; lo = hi; hi = t; }
    return lo + Math.floor(Math.random() * (hi - lo + 1));
  }

  function enabledOps(s) {
    var ops = [];
    if (s.add) ops.push("add");
    if (s.sub) ops.push("sub");
    if (s.mul) ops.push("mul");
    if (s.div) ops.push("div");
    return ops;
  }

  /* Returns {op, a, b, ans} where the problem displays as "a <op> b = ans". */
  function generate(settings) {
    var ops = enabledOps(settings);
    if (!ops.length) ops = ["add"];
    var op = ops[randInt(0, ops.length - 1)];
    var x, y;
    switch (op) {
      case "add":
        x = randInt(settings.addL1, settings.addH1);
        y = randInt(settings.addL2, settings.addH2);
        return { op: "add", a: x, b: y, ans: x + y };
      case "sub":
        x = randInt(settings.addL1, settings.addH1);
        y = randInt(settings.addL2, settings.addH2);
        /* (x+y) - x = y, subtracting either operand */
        if (randInt(0, 1)) { var t = x; x = y; y = t; }
        return { op: "sub", a: x + y, b: x, ans: y };
      case "mul":
        x = randInt(settings.mulL1, settings.mulH1);
        y = randInt(settings.mulL2, settings.mulH2);
        return { op: "mul", a: x, b: y, ans: x * y };
      case "div":
        x = randInt(settings.mulL1, settings.mulH1);
        y = randInt(settings.mulL2, settings.mulH2);
        /* (x*y) / x = y : divisor from the first multiplication range */
        return { op: "div", a: x * y, b: x, ans: y };
    }
  }

  var SYMBOL = { add: "+", sub: "−", mul: "×", div: "÷" };

  function display(p) {
    return p.a + " " + SYMBOL[p.op] + " " + p.b;
  }

  var OP_NAME = { add: "Addition", sub: "Subtraction", mul: "Multiplication", div: "Division" };

  return { generate: generate, display: display, SYMBOL: SYMBOL, OP_NAME: OP_NAME, randInt: randInt };
})();
