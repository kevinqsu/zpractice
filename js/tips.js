/* Mental-math tip generator: a short, concrete hint for solving a given
   problem quickly in the head. Techniques drawn from standard speed-math
   practice for zetamac-style drills (left-to-right addition, complements,
   round-and-adjust, x11/x12 tricks, division by anchoring on tens). */

var ZTips = (function () {

  function tens(x) { return Math.floor(x / 10); }
  function units(x) { return x % 10; }

  /* ---------- addition ---------- */

  function tipAdd(a, b, ans) {
    /* Round-and-adjust when an operand is close below a ten. */
    if (units(b) >= 8) {
      var r = b + (10 - units(b)), d = r - b;
      return "Round: " + a + " + " + b + " = " + a + " + " + r + " − " + d +
             " = " + (a + r) + " − " + d + " = " + ans + ".";
    }
    if (units(a) >= 8) {
      var r2 = a + (10 - units(a)), d2 = r2 - a;
      return "Round: " + a + " + " + b + " = " + r2 + " + " + b + " − " + d2 +
             " = " + (r2 + b) + " − " + d2 + " = " + ans + ".";
    }
    /* Complementary units make a clean ten. */
    if (units(a) + units(b) === 10) {
      return "Units " + units(a) + "+" + units(b) + " make 10, so it ends in 0: tens " +
             tens(a) + "0+" + tens(b) + "0+10 = " + ans + ".";
    }
    /* Default: left-to-right. */
    var t = (tens(a) + tens(b)) * 10, u = units(a) + units(b);
    return "Left to right: " + tens(a) + "0+" + tens(b) + "0 = " + t +
           ", then " + units(a) + "+" + units(b) + " = " + u + " → " + ans +
           ". Start typing the lead digit early.";
  }

  /* ---------- subtraction (a - b = ans) ---------- */

  function tipSub(a, b, ans) {
    if (units(b) >= 8) {
      var r = b + (10 - units(b)), d = r - b;
      return "Round: " + a + " − " + b + " = " + a + " − " + r + " + " + d +
             " = " + (a - r) + " + " + d + " = " + ans + ".";
    }
    /* 3-digit minus 2-digit: complement to 100. */
    if (a > 100 && b < 100) {
      var c = 100 - b, rest = a - 100;
      return "Complement: " + b + " needs " + c + " to reach 100, then " + rest +
             " more to reach " + a + ": " + c + " + " + rest + " = " + ans + ".";
    }
    /* Borrow case: count up from b. */
    if (units(a) < units(b)) {
      var d1 = (10 - units(b)) % 10, mid = b + d1, d2 = ans - d1;
      return "Count up: " + b + " → " + mid + " (+" + d1 + ") → " + a +
             " (+" + d2 + "): " + d1 + " + " + d2 + " = " + ans + ".";
    }
    /* No borrow: straight left-to-right. */
    return "No borrow needed: tens " + tens(a) + "0−" + tens(b) + "0 = " +
           (tens(a) - tens(b)) * 10 + ", units " + units(a) + "−" + units(b) +
           " = " + (units(a) - units(b)) + " → " + ans + ".";
  }

  /* ---------- multiplication ---------- */

  function tipMul(a, b, ans) {
    /* m: the small factor, n: the large one. */
    var m = a, n = b;
    if (m > n) { m = b; n = a; }

    if (m === 10) return "Append a zero to " + n + ": " + ans + ".";

    if (m === 11 && n >= 10 && n <= 99) {
      var s = tens(n) + units(n);
      if (s < 10) {
        return "×11 trick: spread the digits of " + n + " and put their sum in the middle: " +
               tens(n) + " " + s + " " + units(n) + " → " + ans + ".";
      }
      return "×11 trick: digits of " + n + " sum to " + s + "; write " + (s - 10) +
             " in the middle and carry 1: " + (tens(n) + 1) + " " + (s - 10) + " " + units(n) +
             " → " + ans + ".";
    }
    if (m === 11 && n < 10) return "×11: repeat the digit: " + n + "" + n + " = " + ans + ".";

    if (n <= 12) {
      return "Times-table fact — worth knowing cold: " + m + "×" + n + " = " + ans + ".";
    }

    if (m === 12) {
      return "12×" + n + " = 10×" + n + " + 2×" + n + " = " + (10 * n) +
             " + " + (2 * n) + " = " + ans + ".";
    }
    if (m === 9) {
      return "9×" + n + " = 10×" + n + " − " + n + " = " + (10 * n) +
             " − " + n + " = " + ans + ".";
    }
    if (m === 5) {
      return "5×" + n + " = half of " + (10 * n) + " = " + ans + ".";
    }
    if (m === 2) {
      return "Double " + n + ": " + (2 * tens(n) * 10) + " + " + (2 * units(n)) + " = " + ans + ".";
    }
    /* Even small factor with a ...5 partner: halve-double. */
    if (n % 10 === 5 && m % 2 === 0) {
      return "Halve–double: " + m + "×" + n + " = " + (m / 2) + "×" + (2 * n) +
             " = " + ans + ".";
    }
    /* Partner just below/above a ten: round and adjust. */
    if (units(n) === 9) {
      return "Round: " + m + "×" + n + " = " + m + "×" + (n + 1) + " − " + m +
             " = " + (m * (n + 1)) + " − " + m + " = " + ans + ".";
    }
    if (units(n) === 1 && n > 10) {
      return "Round: " + m + "×" + n + " = " + m + "×" + (n - 1) + " + " + m +
             " = " + (m * (n - 1)) + " + " + m + " = " + ans + ".";
    }
    if (m === 4) {
      return "Double twice: " + n + " → " + (2 * n) + " → " + ans + ".";
    }
    if (m === 8) {
      return "8×" + n + " = 10×" + n + " − 2×" + n + " = " + (10 * n) +
             " − " + (2 * n) + " = " + ans + ".";
    }
    if (m === 6) {
      return "6×" + n + " = 5×" + n + " + " + n + " = " + (5 * n) + " + " + n +
             " = " + ans + " (5× is half of " + (10 * n) + ").";
    }
    if (m === 7) {
      return "7×" + n + " = 5×" + n + " + 2×" + n + " = " + (5 * n) + " + " +
             (2 * n) + " = " + ans + ".";
    }
    if (m === 3) {
      return "3×" + n + " = 2×" + n + " + " + n + " = " + (2 * n) + " + " + n +
             " = " + ans + ".";
    }
    /* Generic distribution over tens and units. */
    return m + "×" + n + " = " + m + "×" + (tens(n) * 10) + " + " + m + "×" +
           units(n) + " = " + (m * tens(n) * 10) + " + " + (m * units(n)) + " = " + ans + ".";
  }

  /* ---------- division (a / b = ans) ---------- */

  function tipDiv(a, b, ans) {
    if (b === 2) return "Halve " + a + ": " + ans + ".";
    if (b === 4) return "Halve twice: " + a + " → " + (a / 2) + " → " + ans + ".";
    if (b === 5) return "÷5 = double, then ÷10: " + a + " → " + (2 * a) + " → " + ans + ".";
    if (b === 10) return "Drop the zero: " + ans + ".";

    if (b === 11 && a >= 110 && a <= 1089) {
      var h = Math.floor(a / 100), u = units(a);
      if (h * 10 + u === ans) {
        return "÷11 trick: the outer digits of " + a + " give the answer: " + h + " and " + u +
               " → " + ans + ".";
      }
      if ((h - 1) * 10 + u === ans) {
        return "÷11 trick: outer digits " + h + " and " + u + ", minus 1 on the lead (middle digit is small): " +
               ans + ".";
      }
    }

    if (b === 9) {
      var q0 = Math.ceil(ans / 10) * 10;
      if (q0 !== ans) {
        var over = 9 * q0 - a, k = over / 9;
        return "Anchor: 9×" + q0 + " = " + (9 * q0) + ", which overshoots by " + over +
               " = 9×" + k + " → " + q0 + " − " + k + " = " + ans + ".";
      }
      return "9×" + ans + " = 10×" + ans + " − " + ans + " = " + a + ".";
    }

    if (ans < 10) {
      return "Times-table fact: " + b + "×" + ans + " = " + a + ".";
    }

    /* Generic: peel off the tens of the quotient. */
    var t = Math.floor(ans / 10) * 10, c0 = b * t, r = a - c0;
    if (t > 0 && r > 0) {
      return "Anchor on tens: " + b + "×" + t + " = " + c0 + "; remainder " + a + " − " +
             c0 + " = " + r + " = " + b + "×" + (ans - t) + " → " + ans + ".";
    }
    return "Think multiplication: " + b + "×" + ans + " = " + a + ".";
  }

  function tipFor(p) {
    switch (p.op) {
      case "add": return tipAdd(p.a, p.b, p.ans);
      case "sub": return tipSub(p.a, p.b, p.ans);
      case "mul": return tipMul(p.a, p.b, p.ans);
      case "div": return tipDiv(p.a, p.b, p.ans);
    }
    return "";
  }

  return { tipFor: tipFor };
})();
