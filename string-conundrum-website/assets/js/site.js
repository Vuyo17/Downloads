/* ==========================================================================
   String Conundrum — project website behaviour
   Progressive enhancement only: every page is complete without JavaScript.

   1  Python string semantics (index, slice, repr)   — mirrors CPython
   2  isiXhosa keyword transpiler                     — ported from the project
   3  Page behaviour: theme, navigation, table of contents, reveal
   4  String visualiser widget
   5  Knowledge-check quiz
   6  Transpiler demo
   7  Lightbox, chart tooltips, copy buttons
   ========================================================================== */
(function () {
  "use strict";

  /* 1 · Python string semantics ------------------------------------------ */
  var PyStr = (function () {
    function PyError(type, message) {
      this.type = type;
      this.message = message;
    }

    // Index access: negative indices count from the end; no clamping.
    function index(n, i) {
      var j = i < 0 ? i + n : i;
      if (j < 0 || j >= n) {
        throw new PyError("IndexError", "string index out of range");
      }
      return j;
    }

    // Slice bounds exactly as CPython's PySlice_Unpack + PySlice_AdjustIndices.
    function slice(n, start, stop, step) {
      var k = step === null || step === undefined ? 1 : step;
      if (k === 0) {
        throw new PyError("ValueError", "slice step cannot be zero");
      }
      var s, e, clampedStart = false, clampedStop = false;
      if (start === null || start === undefined) {
        s = k < 0 ? n - 1 : 0;
      } else {
        s = start;
        if (s < 0) {
          s += n;
          if (s < 0) {
            s = k < 0 ? -1 : 0;
            clampedStart = true;
          }
        } else if (s >= n) {
          s = k < 0 ? n - 1 : n;
          clampedStart = s !== start;
        }
      }
      if (stop === null || stop === undefined) {
        e = k < 0 ? -1 : n;
      } else {
        e = stop;
        if (e < 0) {
          e += n;
          if (e < 0) {
            e = k < 0 ? -1 : 0;
            clampedStop = true;
          }
        } else if (e >= n) {
          e = k < 0 ? n - 1 : n;
          clampedStop = e !== stop;
        }
      }
      var out = [], i;
      if (k > 0) {
        for (i = s; i < e; i += k) { out.push(i); }
      } else {
        for (i = s; i > e; i += k) { out.push(i); }
      }
      return { start: s, stop: e, step: k, indices: out, clampedStart: clampedStart, clampedStop: clampedStop };
    }

    // Python's repr() for str: picks the quote style and escapes like CPython.
    function repr(s) {
      var q = s.indexOf("'") !== -1 && s.indexOf('"') === -1 ? '"' : "'";
      var out = q;
      for (var t = 0; t < s.length; t++) {
        var ch = s.charAt(t), code = s.charCodeAt(t);
        if (ch === q || ch === "\\") { out += "\\" + ch; }
        else if (ch === "\n") { out += "\\n"; }
        else if (ch === "\r") { out += "\\r"; }
        else if (ch === "\t") { out += "\\t"; }
        else if (code < 0x20 || code === 0x7f) { out += "\\x" + ("0" + code.toString(16)).slice(-2); }
        else { out += ch; }
      }
      return out + q;
    }

    var NUM = "\\s*([+-]?\\d{1,12})?\\s*";
    var RE_INDEX = /^\[\s*([+-]?\d{1,12})\s*\]$/;
    var RE_SLICE = new RegExp("^\\[" + NUM + ":" + NUM + "(?::" + NUM + ")?\\]$");
    var RE_ASSIGN = /^(\[[^\]]*\])\s*=\s*(.*)$/;

    function toInt(v) {
      return v === undefined || v === "" ? null : parseInt(v, 10);
    }

    // Parse what follows the variable name, e.g. "[1:5]", "[-1]", '[0] = "J"'.
    function parse(expr) {
      var x = String(expr).trim().replace(/^word\s*/, "");
      var m = RE_ASSIGN.exec(x);
      if (m) {
        var target = parse(m[1]);
        if (target.kind === "index" || target.kind === "slice") {
          return { kind: "assign", target: target, value: m[2].trim() };
        }
        return { kind: "syntax" };
      }
      m = RE_INDEX.exec(x);
      if (m) { return { kind: "index", i: toInt(m[1]) }; }
      m = RE_SLICE.exec(x);
      if (m) { return { kind: "slice", start: toInt(m[1]), stop: toInt(m[2]), step: toInt(m[3]) }; }
      return { kind: "syntax" };
    }

    return { PyError: PyError, index: index, slice: slice, repr: repr, parse: parse };
  })();

  /* 2 · isiXhosa keyword transpiler ------------------------------------------
     The same ordered keyword table the project's transpiler uses (58 pairs,
     longest first). Only code outside string literals and comments changes. */
  var Xh = (function () {
    var PAIRS = [
      ["elif", "okanye ukuba"], ["not in", "hayi ku"], ["is not", "ayi yi"],
      ["if", "ukuba"], ["else", "ngaphandle"], ["while", "ngelixa"], ["for", "kwi"], ["in", "ku"],
      ["pass", "dlula"], ["break", "yeka"], ["continue", "qhuba"],
      ["def", "chaza"], ["return", "buyisa"], ["class", "klasi"], ["lambda", "isenzo"], ["yield", "nikela"],
      ["import", "ngenisa"], ["from", "ukusuka"], ["as", "njenge"],
      ["try", "zama"], ["except", "bamba"], ["finally", "ekugqibeleni"], ["raise", "phakamisa"], ["with", "nge"],
      ["del", "cima"], ["global", "jikelele"], ["nonlocal", "ayijikelele"], ["assert", "qinisekisa"],
      ["not", "hayi"], ["and", "kwaye"], ["or", "okanye"], ["is", "yi"],
      ["True", "Ewe"], ["False", "Hayi"], ["None", "Lutho"],
      ["print", "bhala"], ["len", "ubude"], ["range", "ithuba"], ["input", "faka"], ["str", "isigama"],
      ["int", "inombolo"], ["float", "decimali"], ["list", "uluhlu"], ["dict", "isichazi"], ["set", "iqela"],
      ["tuple", "iqoqo"], ["type", "uhlobo"], ["enumerate", "balela"], ["zip", "hlanganisa"], ["map", "guqula"],
      ["filter", "chonga"], ["sorted", "hlela"], ["reversed", "buyisela"], ["sum", "yonke"], ["min", "incinci"],
      ["max", "inkulu"], ["abs", "ixabiso"], ["open", "vula"]
    ];

    function rule(from, to) {
      return { re: new RegExp("\\b" + from + "\\b", "g"), to: to };
    }

    var TO_XH = PAIRS.map(function (p) { return rule(p[0], p[1]); });
    var TO_PY = PAIRS.slice().sort(function (a, b) {
      return b[1].length - a[1].length;
    }).map(function (p) { return rule(p[1], p[0]); });

    var LITERAL = /(#[^\n]*|"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g;

    function translateLine(line, rules) {
      var out = "", cursor = 0, m;
      LITERAL.lastIndex = 0;
      function code(text) {
        return rules.reduce(function (acc, r) { return acc.replace(r.re, r.to); }, text);
      }
      while ((m = LITERAL.exec(line)) !== null) {
        out += code(line.slice(cursor, m.index)) + m[0];
        cursor = m.index + m[0].length;
      }
      return out + code(line.slice(cursor));
    }

    function apply(source, rules) {
      return String(source).split(/\r?\n/).map(function (line) {
        var indent = /^\s*/.exec(line)[0];
        return indent + translateLine(line.slice(indent.length), rules);
      }).join("\n");
    }

    var XH_WORDS = {}, PY_WORDS = {};
    PAIRS.forEach(function (p) {
      p[1].split(" ").forEach(function (w) { XH_WORDS[w] = true; });
      p[0].split(" ").forEach(function (w) { PY_WORDS[w] = true; });
    });

    return {
      PAIRS: PAIRS,
      toXhosa: function (s) { return apply(s, TO_XH); },
      toPython: function (s) { return apply(s, TO_PY); },
      isXhWord: function (w) { return Object.prototype.hasOwnProperty.call(XH_WORDS, w); },
      isPyWord: function (w) { return Object.prototype.hasOwnProperty.call(PY_WORDS, w); }
    };
  })();

  if (typeof module === "object" && module.exports) {
    module.exports = { PyStr: PyStr, Xh: Xh };
  }
  if (typeof document === "undefined") {
    return;
  }

  var doc = document;
  var root = doc.documentElement;
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function $(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }
  function el(tag, cls, text) {
    var e = doc.createElement(tag);
    if (cls) { e.className = cls; }
    if (text !== undefined && text !== null) { e.textContent = text; }
    return e;
  }
  function store(key, value) {
    try {
      if (value === undefined) { return window.localStorage.getItem(key); }
      window.localStorage.setItem(key, value);
    } catch (err) { /* storage unavailable: preferences simply are not remembered */ }
    return null;
  }

  /* 3 · Page behaviour ------------------------------------------------------ */
  function initTheme() {
    var btn = $(".theme-toggle");
    if (!btn) { return; }
    var media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    function current() {
      var t = root.getAttribute("data-theme");
      if (t === "light" || t === "dark") { return t; }
      return media && media.matches ? "dark" : "light";
    }
    function label() {
      var next = current() === "dark" ? "light" : "dark";
      btn.setAttribute("aria-label", "Switch to " + next + " theme");
      btn.setAttribute("title", "Switch to " + next + " theme");
    }
    btn.addEventListener("click", function () {
      var next = current() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      store("sc-theme", next);
      label();
    });
    if (media && media.addEventListener) { media.addEventListener("change", label); }
    label();
  }

  function initNav() {
    var toggle = $(".nav-toggle"), nav = $("#site-nav");
    if (!toggle || !nav) { return; }
    function set(open) {
      nav.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    }
    toggle.addEventListener("click", function () {
      set(toggle.getAttribute("aria-expanded") !== "true");
    });
    doc.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        set(false);
        toggle.focus();
      }
    });
    $$("a", nav).forEach(function (a) { a.addEventListener("click", function () { set(false); }); });
  }

  function initToc() {
    var items = $$(".toc a[href^='#']").map(function (a) {
      return { a: a, el: doc.getElementById(a.getAttribute("href").slice(1)) };
    }).filter(function (it) { return it.el; });
    if (!items.length) { return; }
    var ticking = false;
    function update() {
      ticking = false;
      var line = window.innerHeight * 0.3, current = items[0];
      items.forEach(function (it) {
        if (it.el.getBoundingClientRect().top <= line) { current = it; }
      });
      if (window.innerHeight + window.pageYOffset >= doc.documentElement.scrollHeight - 4) {
        current = items[items.length - 1];
      }
      items.forEach(function (it) {
        var on = it === current;
        it.a.classList.toggle("is-active", on);
        if (on) { it.a.setAttribute("aria-current", "true"); } else { it.a.removeAttribute("aria-current"); }
      });
    }
    function onScroll() {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();
  }

  function initReveal() {
    var items = $$(".reveal");
    if (!items.length) { return; }
    if (reduceMotion || !("IntersectionObserver" in window)) {
      items.forEach(function (n) { n.classList.add("is-in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("is-in");
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    items.forEach(function (n) { io.observe(n); });
  }

  /* 4 · String visualiser ---------------------------------------------------- */
  var CATALOGUE = {
    indexing_from_one: ["misconception", "The first character is at index 1"],
    negative_index_confusion: ["misconception", "Negative indices are invalid or count forward"],
    off_by_one_length: ["misconception", "len(s) is a valid index"],
    slice_stop_inclusive: ["misconception", "The stop bound is included"],
    negative_step_unfamiliar: ["misconception", "A negative step is an error"],
    immutability_in_place: ["misconception", "Operations modify the original string"],
    slice_defaults: ["concept", "An omitted bound falls back to its default"],
    slice_step: ["concept", "Step selects within the slice rather than moving the bounds"],
    slice_clamping: ["concept", "Slice bounds clamp; indexing does not"],
    slice_empty_result: ["concept", "A slice that cannot advance returns empty"]
  };

  function ordinal(k) {
    var s = ["th", "st", "nd", "rd"], v = k % 100;
    return k + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  // How the poster's robot names a character: "the comma", "the 'W'".
  var CHAR_NAMES = {
    ",": "the comma", " ": "the space", "!": "the exclamation mark", ".": "the full stop",
    "?": "the question mark", ":": "the colon", ";": "the semicolon", "'": "the apostrophe",
    "\"": "the quotation mark", "-": "the hyphen", "_": "the underscore"
  };
  function charName(ch) {
    return CHAR_NAMES[ch] || "the '" + ch + "'";
  }

  function explain(str, expr) {
    var n = str.length;
    var p = PyStr.parse(expr);
    var res = { cells: [], marks: [], error: null, value: null, text: "", tag: null, buddy: null };

    if (p.kind === "syntax") {
      res.error = "SyntaxError";
      res.value = "SyntaxError";
      res.text = "This demo understands an index such as [1], a slice such as [1:5] or [::-1], and an assignment such as [0] = \"J\".";
      return res;
    }

    if (p.kind === "assign") {
      var at = p.target.kind === "index" ? p.target.i : (p.target.start === null ? 0 : p.target.start);
      var pos = at < 0 ? at + n : at;
      if (pos >= 0 && pos < n) { res.cells.push({ i: pos, cls: "is-err" }); }
      res.error = "TypeError";
      res.value = "TypeError: 'str' object does not support item assignment";
      var raw = p.value.replace(/^(['"])(.*)\1$/, "$2");
      var fixed = p.target.kind === "index" && pos >= 0 && pos < n ?
        " To get " + PyStr.repr(str.slice(0, pos) + raw + str.slice(pos + 1)) + ", build a new string instead: word = " +
        (pos > 0 ? "word[:" + pos + "] + " : "") + PyStr.repr(raw) + (pos + 1 < n ? " + word[" + (pos + 1) + ":]" : "") + "." : "";
      res.text = "Strings are immutable: Python refuses to change a character in place and the string stays " + PyStr.repr(str) + "." + fixed;
      res.tag = "immutability_in_place";
      res.buddy = ["Hands off!", " Strings are immutable, so a character can't be swapped in place."];
      return res;
    }

    if (p.kind === "index") {
      try {
        var j = PyStr.index(n, p.i);
        res.cells.push({ i: j, cls: "is-on", order: null });
        res.marks.push({ pos: j, label: "index " + p.i, note: p.i < 0 ? "= " + j : "" });
        res.value = PyStr.repr(str.charAt(j));
        res.buddy = ["Hi! I'm " + charName(str.charAt(j)) + " at index " + j + ".",
          p.i < 0 ? " You found me by counting back from the end." : " Python starts counting at 0."];
        if (p.i < 0) {
          res.text = "Negative indices count back from the end: " + p.i + " + len(word) = " + p.i + " + " + n + " = " + j + ".";
          res.tag = "negative_index_confusion";
        } else {
          res.text = "Counting starts at 0, so index " + p.i + " is the " + ordinal(p.i + 1) + " character.";
          res.tag = "indexing_from_one";
        }
      } catch (err) {
        res.error = err.type;
        res.value = err.type + ": " + err.message;
        var shown = Math.max(-1, Math.min(n, p.i < 0 ? p.i + n : p.i));
        res.marks.push({ pos: shown, label: "index " + p.i, note: "out of range", stop: true });
        res.text = n === 0 ? "The string is empty, so there is no character to index." :
          "word has " + n + " characters, so valid indices run from 0 to " + (n - 1) + " (or " + (-n) + " to -1). " +
          (p.i === n ? "Index " + n + " is one past the end." : "Index " + p.i + " is outside that range.") +
          " Unlike slicing, indexing never clamps.";
        res.tag = p.i === n ? "off_by_one_length" : "slice_clamping";
        res.buddy = ["Nobody lives at index " + p.i + ".",
          n ? " The last character is at index " + (n - 1) + "." : " This string is empty."];
      }
      return res;
    }

    // slice
    var r;
    try {
      r = PyStr.slice(n, p.start, p.stop, p.step);
    } catch (err) {
      res.error = err.type;
      res.value = err.type + ": " + err.message;
      res.text = "A step of 0 would never move, so Python rejects it.";
      res.tag = "slice_step";
      res.buddy = ["A step of 0 never moves,", " so Python refuses to run it."];
      return res;
    }
    var k = r.step, parts = [];
    var ordered = k !== 1;
    r.indices.forEach(function (i, t) { res.cells.push({ i: i, cls: "is-on", order: ordered ? t + 1 : null }); });
    if (k > 0 && r.stop >= 0 && r.stop < n) { res.cells.push({ i: r.stop, cls: "is-stop" }); }
    if (k < 0 && r.stop >= 0 && r.stop < n) { res.cells.push({ i: r.stop, cls: "is-stop" }); }
    res.value = PyStr.repr(r.indices.map(function (i) { return str.charAt(i); }).join(""));

    if (p.start === null) {
      parts.push(k > 0 ? "No start, so it begins at index 0." : "No start, so a negative step begins at the last index, " + (n - 1) + ".");
    } else if (p.start < 0 && p.start + n >= 0) {
      parts.push("Start " + p.start + " counts from the end: " + p.start + " + " + n + " = " + (p.start + n) + ".");
    } else if (r.clampedStart) {
      parts.push("Start " + p.start + " lies outside the string, so Python clamps it to " + r.start + ".");
    }
    if (p.stop === null) {
      parts.push(k > 0 ? "No stop, so it runs to the end." : "No stop, so it runs all the way to the first character.");
    } else if (p.stop < 0 && p.stop + n >= 0) {
      parts.push("Stop " + p.stop + " counts from the end: " + p.stop + " + " + n + " = " + (p.stop + n) + ".");
    } else if (r.clampedStop) {
      parts.push("Stop " + p.stop + " lies outside the string, so Python clamps it to " + (r.stop === -1 ? "the very beginning" : r.stop) + "; slices never raise IndexError.");
    }
    if (!r.indices.length) {
      parts.push((r.start === r.stop ?
        "Start and stop are both " + r.start + ", so nothing lies between them" :
        "Moving " + (k > 0 ? "forwards" : "backwards") + " from index " + r.start + " never gets closer to " +
        (r.stop === -1 ? "the beginning" : "stop " + r.stop) + ", so nothing is taken") +
        ". The result is the empty string '', which is a valid answer, not an error.");
    } else if (k > 0) {
      parts.push("Take index " + r.start + " (included) up to, but not including, index " + r.stop +
        (k > 1 ? ", keeping every " + ordinal(k) + " character" : "") + ".");
    } else {
      parts.push("Walk backwards from index " + r.start + " (included) " +
        (r.stop === -1 ? "to the first character" : "towards index " + r.stop + " (excluded)") +
        (k < -1 ? ", " + (-k) + " characters at a time" : "") + ".");
    }
    res.text = parts.join(" ");

    var startNote = r.indices.length ? "included" : "";
    if (r.start === r.stop) {
      res.marks.push({ pos: r.start, label: "start = stop", note: "nothing to take" });
    } else {
      res.marks.push({ pos: r.start, label: "start " + r.start, note: startNote });
      res.marks.push({ pos: r.stop, label: r.stop === -1 ? "stop" : (r.stop === n ? "stop " + n : "stop " + r.stop), note: r.stop === -1 ? "before 0" : (r.stop === n ? "end" : "excluded"), stop: true });
    }

    if (!r.indices.length) { res.tag = "slice_empty_result"; }
    else if (r.clampedStart || r.clampedStop) { res.tag = "slice_clamping"; }
    else if (k < 0) { res.tag = "negative_step_unfamiliar"; }
    else if (k > 1) { res.tag = "slice_step"; }
    else if ((p.start !== null && p.start < 0) || (p.stop !== null && p.stop < 0)) { res.tag = "negative_index_confusion"; }
    else if (p.start === null || p.stop === null) { res.tag = "slice_defaults"; }
    else { res.tag = "slice_stop_inclusive"; }

    if (!r.indices.length) { res.buddy = ["Nothing to pick up here.", " An empty slice is a valid answer."]; }
    else if (r.stop >= 0 && r.stop < n) { res.buddy = ["Hi! I'm " + charName(str.charAt(r.stop)) + " at index " + r.stop + ".", " Stop is excluded, so am I!"]; }
    else if (k > 0) { res.buddy = ["Stop is past the last index,", " so the slice runs to the end."]; }
    else { res.buddy = ["Walking backwards", " all the way to the first character!"]; }
    return res;
  }

  function initVisualiser() {
    var box = $("[data-viz]");
    if (!box) { return; }
    var inStr = $("#viz-str", box), inExpr = $("#viz-expr", box);
    var grid = $(".viz-grid", box), marks = null;
    var outVal = $(".viz-result .val", box), outText = $(".viz-explain", box), outMc = $(".viz-mc", box);
    var bud = $(".viz-buddy", box), bubble = $(".viz-bubble", box);
    var catalogue = box.getAttribute("data-catalogue") || "background.html";
    var presets = $$(".viz-presets .chip", box);
    var timer = null;

    function build(str) {
      var n = str.length;
      grid.textContent = "";
      grid.style.setProperty("--n", String(Math.max(n, 1)));
      grid.appendChild(el("span", "viz-rowlab", "index"));
      for (var i = 0; i < n; i++) { grid.appendChild(el("span", "viz-i viz-pos", String(i))); }
      grid.appendChild(el("span", "viz-rowlab", "char"));
      for (i = 0; i < n; i++) {
        var c = el("span", "viz-c", str.charAt(i) === " " ? "" : str.charAt(i));
        if (str.charAt(i) === " ") { c.classList.add("is-space"); }
        grid.appendChild(c);
      }
      if (!n) { grid.appendChild(el("span", "viz-i", "(empty string)")); }
      grid.appendChild(el("span", "viz-rowlab", "neg."));
      for (i = 0; i < n; i++) { grid.appendChild(el("span", "viz-i viz-neg", String(i - n))); }
      grid.appendChild(el("span", "viz-rowlab", ""));
      marks = el("span", "viz-marks");
      marks.style.gridColumn = "2 / -1";
      grid.appendChild(marks);
    }

    function render() {
      var str = inStr.value, expr = inExpr.value, n = str.length;
      var res = explain(str, expr);
      build(str);
      var cells = $$(".viz-c", grid), pos = $$(".viz-pos", grid), neg = $$(".viz-neg", grid);
      var delay = 0;
      res.cells.forEach(function (c) {
        var cell = cells[c.i];
        if (!cell) { return; }
        if (c.cls === "is-on" && !reduceMotion) {
          cell.style.transitionDelay = delay + "ms";
          delay = Math.min(delay + 70, 900);
        }
        if (c.order) { cell.appendChild(el("span", "ord", String(c.order))); }
        window.requestAnimationFrame(function () {
          window.requestAnimationFrame(function () {
            cell.classList.add(c.cls);
            if (c.cls === "is-on") {
              if (pos[c.i]) { pos[c.i].classList.add("is-on"); }
              if (neg[c.i]) { neg[c.i].classList.add("is-on"); }
            }
          });
        });
      });
      res.marks.forEach(function (m) {
        var mk = el("span", "viz-mark" + (m.stop ? " viz-mark--stop" : ""), m.label);
        if (m.note) { mk.appendChild(el("small", null, m.note)); }
        var f = (m.pos + 0.5) / Math.max(n, 1);
        mk.style.left = "calc((100% + 4px) * " + f.toFixed(5) + " - 2px)";
        marks.appendChild(mk);
      });
      outVal.textContent = res.value;
      outVal.classList.toggle("is-err", !!res.error);
      outText.textContent = res.text;
      outMc.textContent = "";
      if (res.tag && CATALOGUE[res.tag]) {
        var kind = CATALOGUE[res.tag][0];
        outMc.appendChild(doc.createTextNode(kind === "misconception" ? "Targets the misconception " : "Teaches the concept "));
        var a = el("a", null, res.tag);
        a.href = catalogue + "#mc-" + res.tag;
        outMc.appendChild(a);
        outMc.appendChild(doc.createTextNode(": \u201C" + CATALOGUE[res.tag][1] + "\u201D."));
      }
      if (bud && bubble) {
        bubble.textContent = "";
        if (res.buddy) {
          bubble.appendChild(el("b", null, res.buddy[0]));
          bubble.appendChild(doc.createTextNode(res.buddy[1]));
        }
        bud.hidden = !res.buddy;
      }
      presets.forEach(function (b) {
        b.setAttribute("aria-pressed", b.getAttribute("data-expr") === expr.trim() ? "true" : "false");
      });
    }

    function fit() {
      inStr.style.width = (Math.max(1, inStr.value.length) + 0.6) + "ch";
    }
    function schedule() {
      window.clearTimeout(timer);
      timer = window.setTimeout(render, 140);
    }
    inStr.addEventListener("input", function () { fit(); schedule(); });
    inExpr.addEventListener("input", schedule);
    presets.forEach(function (b) {
      b.addEventListener("click", function () {
        inExpr.value = b.getAttribute("data-expr");
        render();
      });
    });
    fit();
    render();
  }

  /* 5 · Knowledge-check quiz ------------------------------------------------- */
  function initQuiz() {
    var forms = $$("form.q");
    if (!forms.length) { return; }
    var firstTry = {}, scoreEl = $(".quiz-score");

    function updateScore() {
      if (!scoreEl) { return; }
      var keys = Object.keys(firstTry);
      var right = keys.filter(function (k) { return firstTry[k]; }).length;
      scoreEl.textContent = keys.length ?
        "You got " + right + " of " + keys.length + " right on the first try" + (keys.length === forms.length ? "." : " so far.") :
        "";
    }

    forms.forEach(function (form) {
      var answer = form.getAttribute("data-answer");
      var id = form.id;
      var reveal = $(".q-reveal", form);
      var fbBox = $(".q-feedback", form);
      var status = $(".q-status", form);
      if (reveal) { reveal.hidden = true; }
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var sel = $("input[type=radio]:checked", form);
        if (!sel) {
          status.textContent = "Choose an answer first.";
          return;
        }
        status.textContent = "";
        var ok = sel.value === answer;
        if (!(id in firstTry)) {
          firstTry[id] = ok;
          updateScore();
        }
        $$(".q-opt", form).forEach(function (lab) {
          var v = $("input", lab).value;
          lab.classList.remove("is-correct", "is-wrong");
          if (v === answer) { lab.classList.add("is-correct"); }
          else if (v === sel.value) { lab.classList.add("is-wrong"); }
        });
        fbBox.textContent = "";
        fbBox.hidden = false;
        fbBox.className = "q-feedback " + (ok ? "is-correct" : "is-wrong");
        fbBox.appendChild(el("p", "q-verdict", ok ? "Correct." : "Not quite."));
        var fb = $(".q-fb[data-for='" + sel.value + "']", form);
        if (fb) {
          $$(":scope > *", fb).forEach(function (n) { fbBox.appendChild(n.cloneNode(true)); });
        }
        var study = $(".q-study-src", form);
        if (study) {
          var s = el("div", "q-study");
          $$(":scope > *", study).forEach(function (n) { s.appendChild(n.cloneNode(true)); });
          fbBox.appendChild(s);
        }
      });
    });
  }

  /* 6 · Transpiler demo -------------------------------------------------------- */
  function highlight(target, code, lang) {
    target.textContent = "";
    var re = /(#[^\n]*)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)|([\s\S])/g;
    var m, buf = "";
    function flush() {
      if (buf) { target.appendChild(doc.createTextNode(buf)); buf = ""; }
    }
    function span(cls, text) {
      flush();
      target.appendChild(el("span", cls, text));
    }
    while ((m = re.exec(code)) !== null) {
      if (m[1]) { span("tk-com", m[1]); }
      else if (m[2]) { span("tk-str", m[2]); }
      else if (m[3]) { span("tk-num", m[3]); }
      else if (m[4]) {
        if (lang === "xh" ? Xh.isXhWord(m[4]) : Xh.isPyWord(m[4])) { span("tk-kw", m[4]); }
        else { buf += m[4]; }
      } else { buf += m[5]; }
    }
    flush();
  }

  function initTranspiler() {
    var box = $("[data-xh]");
    if (!box) { return; }
    var input = $("textarea", box), out = $(".xh-out code", box);
    var labIn = $(".xh-in-label", box), labOut = $(".xh-out-label", box);
    var buttons = $$(".seg button", box);
    var pressed = buttons.filter(function (b) { return b.getAttribute("aria-pressed") === "true"; })[0] || buttons[0];
    var dir = pressed.getAttribute("data-dir");
    function render() {
      var src = input.value;
      if (dir === "to-xh") { highlight(out, Xh.toXhosa(src), "xh"); }
      else { highlight(out, Xh.toPython(src), "py"); }
    }
    buttons.forEach(function (b) {
      b.addEventListener("click", function () {
        var next = b.getAttribute("data-dir");
        if (next === dir) { return; }
        var converted = out.textContent;
        dir = next;
        buttons.forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
        input.value = converted;
        labIn.textContent = dir === "to-xh" ? "Python (English keywords)" : "isiXhosa keywords";
        labOut.textContent = dir === "to-xh" ? "isiXhosa keywords" : "Python (English keywords)";
        render();
      });
    });
    input.addEventListener("input", render);
    render();
  }

  /* 7 · Lightbox, tooltips, copy ------------------------------------------- */
  function initLightbox() {
    var links = $$("a[data-lightbox]");
    if (!links.length || typeof HTMLDialogElement !== "function") { return; }
    var dlg = el("dialog", "lightbox");
    dlg.setAttribute("aria-label", "Enlarged image");
    var inner = el("div", "lightbox-inner");
    var close = el("button", "lightbox-close");
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    close.innerHTML = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
    var img = el("img");
    var cap = el("p", "lightbox-cap");
    inner.appendChild(close);
    inner.appendChild(img);
    inner.appendChild(cap);
    dlg.appendChild(inner);
    doc.body.appendChild(dlg);
    close.addEventListener("click", function () { dlg.close(); });
    dlg.addEventListener("click", function (e) { if (e.target === dlg) { dlg.close(); } });
    dlg.addEventListener("close", function () { img.removeAttribute("src"); });
    links.forEach(function (a) {
      a.addEventListener("click", function (e) {
        if (e.metaKey || e.ctrlKey || e.shiftKey) { return; }
        e.preventDefault();
        var thumb = $("img", a);
        img.src = a.getAttribute("href");
        img.alt = thumb ? thumb.alt : "";
        var fig = a.closest("figure");
        var fc = fig ? $("figcaption", fig) : null;
        cap.textContent = fc ? fc.textContent : "";
        dlg.showModal();
      });
    });
  }

  function initTooltips() {
    var marks = $$("[data-tip]");
    if (!marks.length) { return; }
    var tip = el("div", "tip");
    tip.setAttribute("role", "tooltip");
    tip.setAttribute("aria-hidden", "true");
    doc.body.appendChild(tip);
    function show(target, x, y) {
      tip.textContent = "";
      var v = target.getAttribute("data-tip-v");
      if (v) { tip.appendChild(el("b", null, v)); tip.appendChild(doc.createTextNode(" ")); }
      tip.appendChild(doc.createTextNode(target.getAttribute("data-tip")));
      tip.classList.add("is-on");
      var w = tip.offsetWidth, h = tip.offsetHeight;
      var left = Math.min(Math.max(8, x - w / 2), window.innerWidth - w - 8);
      var top = y - h - 14;
      if (top < 8) { top = y + 18; }
      tip.style.left = left + "px";
      tip.style.top = top + "px";
    }
    function hide() { tip.classList.remove("is-on"); }
    marks.forEach(function (m) {
      m.addEventListener("pointermove", function (e) { show(m, e.clientX, e.clientY); });
      m.addEventListener("pointerleave", hide);
      m.addEventListener("focus", function () {
        var r = m.getBoundingClientRect();
        show(m, r.left + r.width / 2, r.top);
      });
      m.addEventListener("blur", hide);
    });
    window.addEventListener("scroll", hide, { passive: true });
  }

  function initCopy() {
    $$("[data-copy]").forEach(function (btn) {
      btn.hidden = false;
      btn.addEventListener("click", function () {
        var src = doc.getElementById(btn.getAttribute("data-copy"));
        if (!src) { return; }
        var text = src.textContent;
        var done = function () {
          var old = btn.textContent;
          btn.textContent = "Copied";
          window.setTimeout(function () { btn.textContent = old; }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, function () {});
        }
      });
    });
  }

  function ready(fn) {
    if (doc.readyState === "loading") { doc.addEventListener("DOMContentLoaded", fn); }
    else { fn(); }
  }

  ready(function () {
    initTheme();
    initNav();
    initToc();
    initReveal();
    initVisualiser();
    initQuiz();
    initTranspiler();
    initLightbox();
    initTooltips();
    initCopy();
  });
})();
