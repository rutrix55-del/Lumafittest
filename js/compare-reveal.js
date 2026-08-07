/* =========================================================================
   LumaFit — compare reveal
   A dependency-free port of Motiq's CompareReveal (MIT), themed for LumaFit
   and built the same way as shader-bg.js / liquid-text.js.

   The divider chases the pointer through a spring (k=140, c=18, damping
   ratio ~0.76) so the lag reads as elastic resistance and the release as a
   soft snap. On first viewport entry it demonstrates itself once —
   50 -> 96 -> 4 -> 50 over 2.6s — and re-arms if that sweep was interrupted.
   Double-click snaps home.

   The handle is a real button with slider semantics: arrows move 2%, shift
   +arrows 10%, Home/End pin the ends, aria-valuenow tracks the reveal. The
   reveal is a clip-path inset on a composited layer, so both sides are
   painted once rather than per frame.

   Markup contract:
     <div class="compare-reveal" data-labels="Left|Right">
       <div class="cr-side cr-after">  ...fills the frame... </div>
       <div class="cr-side cr-before"> ...clipped from the left edge... </div>
     </div>
   Everything else (chips, divider, handle) is built here.
   ========================================================================= */
(function () {
  "use strict";

  var SPRING_K = 140;
  var SPRING_C = 18;
  var SWEEP_SECONDS = 2.6;
  var KEY_STEP = 2;
  var KEY_STEP_LARGE = 10;
  var LABEL_FADE = 12; // a chip fades once its side narrows past this %

  var prefersReduced = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function sweepAt(u) {
    if (u < 0.38) return lerp(50, 96, easeInOutCubic(u / 0.38));
    if (u < 0.78) return lerp(96, 4, easeInOutCubic((u - 0.38) / 0.4));
    return lerp(4, 50, easeInOutCubic((u - 0.78) / 0.22));
  }

  var HANDLE_SVG =
    '<svg width="18" height="14" viewBox="0 0 18 14" fill="none" aria-hidden="true">' +
    '<path d="M6 1 L1 7 L6 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M12 1 L17 7 L12 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
    "</svg>";

  function setup(root) {
    var before = root.querySelector(".cr-before");
    if (!before) return;

    var parts = (root.getAttribute("data-labels") || "Before|After").split("|");
    var labelBefore = (parts[0] || "Before").trim();
    var labelAfter = (parts[1] || "After").trim();
    var start = clamp(parseFloat(root.getAttribute("data-position")) || 50, 0, 100);

    // ---- chips -----------------------------------------------------------
    var chips = [];
    [labelBefore, labelAfter].forEach(function (text, i) {
      var chip = document.createElement("span");
      chip.className = "cr-chip " + (i === 0 ? "cr-chip-left" : "cr-chip-right");
      chip.setAttribute("aria-hidden", "true");
      chip.textContent = text;
      root.appendChild(chip);
      chips.push(chip);
    });

    // ---- divider + handle ------------------------------------------------
    var divider = document.createElement("div");
    divider.className = "cr-divider";

    var handle = document.createElement("button");
    handle.type = "button";
    handle.className = "cr-handle";
    handle.setAttribute("role", "slider");
    handle.setAttribute("aria-label", "Reveal divider, " + labelBefore + " to " + labelAfter);
    handle.setAttribute("aria-valuemin", "0");
    handle.setAttribute("aria-valuemax", "100");
    handle.setAttribute("aria-valuenow", String(Math.round(start)));
    handle.innerHTML = HANDLE_SVG;

    divider.appendChild(handle);
    root.appendChild(divider);

    root.setAttribute("role", "group");
    root.setAttribute("aria-label", "Comparison: " + labelBefore + " versus " + labelAfter);

    // ---- sim -------------------------------------------------------------
    var sim = {
      x: start,
      v: 0,
      target: start,
      dragging: false,
      pointerId: null,
      introActive: false,
      introDone: false,
      introStart: 0,
    };

    function paint() {
      var x = clamp(sim.x, 0, 100);
      before.style.clipPath = "inset(0 " + (100 - x).toFixed(3) + "% 0 0)";
      divider.style.left = x.toFixed(3) + "%";
      var shown = Math.round(x);
      handle.setAttribute("aria-valuenow", String(shown));
      handle.setAttribute("aria-valuetext", shown + "% " + labelBefore);
      chips[0].style.opacity = x > LABEL_FADE ? "1" : "0";
      chips[1].style.opacity = x < 100 - LABEL_FADE ? "1" : "0";
    }

    paint();

    // still mode: fully functional, just maps input 1:1 with no spring
    if (prefersReduced) {
      root.setAttribute("data-motion", "static");
      sim.introDone = true;
      wireInput(function (next) {
        sim.target = sim.x = clamp(next, 0, 100);
        sim.v = 0;
        paint();
      });
      return;
    }

    root.setAttribute("data-motion", "animated");

    function commit(next) {
      sim.introActive = false;
      sim.introDone = true;
      sim.target = clamp(next, 0, 100);
    }
    wireInput(commit);

    // ---- loop, gated on visibility ---------------------------------------
    var raf = 0;
    var last = 0;
    var running = false;

    function frame(ts) {
      if (!running) return;
      var dt = Math.min(0.05, Math.max(0.001, (ts - last) / 1000));
      last = ts;

      if (sim.introActive) {
        var u = (ts / 1000 - sim.introStart) / SWEEP_SECONDS;
        if (u >= 1) {
          sim.introActive = false;
          sim.introDone = true;
          sim.target = 50;
        } else {
          sim.target = sweepAt(u);
        }
      }

      sim.v += ((sim.target - sim.x) * SPRING_K - sim.v * SPRING_C) * dt;
      sim.x += sim.v * dt;
      if (sim.x < 0) { sim.x = 0; sim.v = 0; }
      if (sim.x > 100) { sim.x = 100; sim.v = 0; }

      paint();
      raf = requestAnimationFrame(frame);
    }

    function play() {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }

    function pause() {
      running = false;
      cancelAnimationFrame(raf);
      // leaving mid-sweep re-arms the demo for the next entry
      if (sim.introActive) {
        sim.introActive = false;
        sim.introDone = false;
        sim.target = 50;
      }
    }

    function armIntro() {
      if (sim.introDone || sim.introActive) return;
      sim.introActive = true;
      sim.introStart = performance.now() / 1000;
    }

    if (typeof IntersectionObserver !== "undefined") {
      var io = new IntersectionObserver(function (entries) {
        var onScreen = entries.some(function (e) { return e.isIntersecting; });
        if (onScreen && !document.hidden) {
          armIntro();
          play();
        } else {
          pause();
        }
      }, { threshold: 0.2 });
      io.observe(root);
    } else {
      armIntro();
      play();
    }

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) pause();
    });

    // ---- input -----------------------------------------------------------
    function wireInput(setTarget) {
      function fromClientX(clientX) {
        var rect = root.getBoundingClientRect();
        setTarget(((clientX - rect.left) / Math.max(1, rect.width)) * 100);
      }

      root.addEventListener("pointerdown", function (e) {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        sim.dragging = true;
        sim.pointerId = e.pointerId;
        if (root.setPointerCapture) root.setPointerCapture(e.pointerId);
        fromClientX(e.clientX);
      });

      root.addEventListener("pointermove", function (e) {
        if (!sim.dragging || e.pointerId !== sim.pointerId) return;
        fromClientX(e.clientX);
      });

      function endDrag() {
        sim.dragging = false;
        sim.pointerId = null;
      }
      root.addEventListener("pointerup", endDrag);
      root.addEventListener("pointercancel", endDrag);

      root.addEventListener("dblclick", function () { setTarget(50); });

      handle.addEventListener("keydown", function (e) {
        var step = e.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
        var base = sim.target;
        var next = base;
        if (e.key === "ArrowRight" || e.key === "ArrowUp") next = base + step;
        else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = base - step;
        else if (e.key === "Home") next = 0;
        else if (e.key === "End") next = 100;
        else return;
        e.preventDefault();
        setTarget(next);
      });

      // The handle is the primary drag affordance, so its pointerdown is
      // deliberately left to bubble to the root — the resulting jump-to-x
      // lands where the handle already is, and the drag continues from there.
    }
  }

  function init() {
    var nodes = document.querySelectorAll(".compare-reveal");
    for (var i = 0; i < nodes.length; i++) setup(nodes[i]);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
