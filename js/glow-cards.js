/* =========================================================================
   LumaFit — glowing card border
   Vanilla port of the React GlowingEffect. On any element marked [data-glow],
   a gradient ring (masked to the border band in styles.css) rotates to face
   the pointer and lights up when the pointer comes within PROXIMITY px.

   Drives two custom properties per card:
     --glow-start   arc angle in degrees, eased toward the pointer
     --glow-active  0 or 1, faded by a CSS transition

   Skips under prefers-reduced-motion and on coarse pointers, where the cards
   keep their plain glass look (the CSS gates the ring on pointer: fine too).
   ========================================================================= */
(function () {
  "use strict";

  var PROXIMITY = 64;       // px beyond the card edge that still counts as near
  var INACTIVE_ZONE = 0.01; // dead spot at the centre, as a fraction of the card
  var EASE = 0.12;          // how fast the arc chases the pointer, per frame
  var SETTLED = 0.1;        // degrees; below this we snap and stop animating

  var cards = [];
  var pointerX = 0;
  var pointerY = 0;
  var seenPointer = false;
  var queued = false;

  // Signed shortest way round the circle, so the arc never takes the long path.
  function shortestDelta(from, to) {
    return ((((to - from + 180) % 360) + 360) % 360) - 180;
  }

  function tick() {
    queued = false;
    if (!seenPointer) return;
    var again = false;

    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      var r = c.el.getBoundingClientRect();
      if (!r.width || !r.height) continue; // hidden card — nothing to light

      var cx = r.left + r.width * 0.5;
      var cy = r.top + r.height * 0.5;
      var dead = 0.5 * Math.min(r.width, r.height) * INACTIVE_ZONE;
      var near =
        pointerX > r.left - PROXIMITY &&
        pointerX < r.right + PROXIMITY &&
        pointerY > r.top - PROXIMITY &&
        pointerY < r.bottom + PROXIMITY;

      var active = near && Math.hypot(pointerX - cx, pointerY - cy) >= dead ? 1 : 0;

      if (active !== c.active) {
        c.active = active;
        c.el.style.setProperty("--glow-active", String(active));
      }
      if (!active) continue;

      // +90 so 0deg points up, matching the conic gradient's origin.
      var target = (Math.atan2(pointerY - cy, pointerX - cx) * 180) / Math.PI + 90;
      var delta = shortestDelta(c.angle, target);

      if (Math.abs(delta) > SETTLED) {
        c.angle += delta * EASE;
        again = true;
      } else {
        c.angle = target;
      }
      c.el.style.setProperty("--glow-start", c.angle.toFixed(2));
    }

    if (again) schedule();
  }

  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(tick);
  }

  function onPointerMove(e) {
    pointerX = e.clientX;
    pointerY = e.clientY;
    seenPointer = true;
    schedule();
  }

  function init() {
    var mm = window.matchMedia;
    if (mm && mm("(prefers-reduced-motion: reduce)").matches) return;
    if (mm && !mm("(hover: hover) and (pointer: fine)").matches) return;

    var els = document.querySelectorAll("[data-glow]");
    if (!els.length) return;

    for (var i = 0; i < els.length; i++) {
      cards.push({ el: els[i], angle: 0, active: 0 });
    }

    document.addEventListener("pointermove", onPointerMove, { passive: true });
    // Scrolling and resizing move the cards under a stationary pointer.
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
