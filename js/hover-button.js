/* =========================================================================
   LumaFit — glass hover button
   Vanilla port of the React HoverButton. On any element marked
   [data-hover-btn], pointer movement spawns soft blurred glow dots (throttled
   to ~10/sec) that fade in, linger, then fade out — exactly like the original
   component, but themed to LumaFit's coral→violet via the --circle-start /
   --circle-end custom properties on the element.

   Skips under prefers-reduced-motion (the button stays a normal glass pill).
   ========================================================================= */
(function () {
  "use strict";

  var THROTTLE_MS = 100;   // matches the component's 100ms gate
  var FADE_OUT_MS = 1000;  // start fading after 1s
  var REMOVE_MS = 2200;    // remove after 2.2s

  function readColor(el, prop, fallback) {
    var v = getComputedStyle(el).getPropertyValue(prop);
    return (v && v.trim()) || fallback;
  }

  function createCircle(btn, x, y, width) {
    var xPos = width ? x / width : 0;
    var start = readColor(btn, "--circle-start", "#E6FF55");
    var end = readColor(btn, "--circle-end", "#4FE3A6");
    var pct = (xPos * 100).toFixed(2) + "%";

    var dot = document.createElement("span");
    dot.className = "hover-btn-dot";
    dot.style.left = x + "px";
    dot.style.top = y + "px";
    dot.style.background = "linear-gradient(to right, " + start + " " + pct + ", " + end + " " + pct + ")";
    btn.appendChild(dot);

    // fade in next frame
    requestAnimationFrame(function () { dot.classList.add("is-in"); });
    // fade out, then remove
    setTimeout(function () {
      dot.classList.remove("is-in");
      dot.classList.add("is-out");
    }, FADE_OUT_MS);
    setTimeout(function () {
      if (dot.parentNode) dot.parentNode.removeChild(dot);
    }, REMOVE_MS);
  }

  function attach(btn) {
    var listening = false;
    var lastAdded = 0;

    btn.addEventListener("pointerenter", function () { listening = true; });
    btn.addEventListener("pointerleave", function () { listening = false; });
    btn.addEventListener("pointermove", function (e) {
      if (!listening) return;
      var now = (e.timeStamp != null) ? e.timeStamp : Date.now();
      if (now - lastAdded <= THROTTLE_MS) return;
      lastAdded = now;
      var rect = btn.getBoundingClientRect();
      createCircle(btn, e.clientX - rect.left, e.clientY - rect.top, rect.width);
    });
  }

  function init() {
    var reduce = window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var els = document.querySelectorAll("[data-hover-btn]");
    if (reduce) return; // leave the glass button static
    for (var i = 0; i < els.length; i++) attach(els[i]);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
