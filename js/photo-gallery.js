/* =========================================================================
   LumaFit — locked photo fan (the recipes teaser)
   Vanilla port of the 21st.dev PhotoGallery (React + framer-motion): a stack
   of photos that fades in, then springs out into a fan one after another,
   each settling at a small random tilt. Hover lifts a photo; dragging pulls
   it on a rubber band (framer's dragConstraints of 0 with its default 0.35
   elastic) and it springs home on release.

   The spread-out resting layout lives in CSS, so without JS, or under
   reduced motion, the fan simply shows. This script adds the intro on top:
   it stacks the photos, waits for the section to scroll into view (the React
   version ran on mount, which this far down the page means nobody sees it),
   then plays the fade and the staggered spring. The spring curve itself is a
   CSS linear() in styles.css, fitted to framer's stiffness 70 / damping 12.

   The photos link to #buy. A drag must not end in that navigation, so the
   click that follows real movement is swallowed.
   ========================================================================= */
(function () {
  "use strict";

  var CONFIG = {
    delay: 150,     // ms after entering view before the stack fades in
    fade: 400,      // ms, matches the .pg-stage opacity transition
    spread: 1200,   // ms, matches the spring transition in CSS
    stagger: 150,   // ms between photos (the component's order * 0.15s)
    lead: 100,      // ms before the first photo moves (delayChildren)
    elastic: 0.35,  // share of the pointer's travel a dragged photo follows
    clickSlop: 6,   // px of movement after which a press counts as a drag
    tilt: [1, 4],   // deg range of the resting tilt; the sign comes from data-dir
  };

  var reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function randomTilt(photo) {
    var deg = CONFIG.tilt[0] + Math.random() * (CONFIG.tilt[1] - CONFIG.tilt[0]);
    if (photo.getAttribute("data-dir") === "left") deg = -deg;
    return deg.toFixed(2) + "deg";
  }

  function playIntro(gallery, count) {
    var settle = CONFIG.lead + (count - 1) * CONFIG.stagger + CONFIG.spread + 100;
    setTimeout(function () {
      gallery.classList.remove("is-hidden");            // fade the stack in
      setTimeout(function () {
        gallery.classList.add("is-spreading");          // spring timing + stagger
        gallery.classList.remove("is-stacked");         // ...out into the fan
        setTimeout(function () {
          gallery.classList.remove("is-spreading");     // hover goes back to snappy
        }, settle);
      }, CONFIG.fade);
    }, CONFIG.delay);
  }

  function enableDrag(photo) {
    var start = null;
    var moved = false;

    photo.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId };
      moved = false;
    });

    photo.addEventListener("pointermove", function (e) {
      if (!start || e.pointerId !== start.id) return;
      var dx = e.clientX - start.x;
      var dy = e.clientY - start.y;
      if (!moved) {
        if (Math.sqrt(dx * dx + dy * dy) < CONFIG.clickSlop) return;
        moved = true;
        photo.classList.add("is-dragging");
        try { photo.setPointerCapture(e.pointerId); } catch (err) { /* already released */ }
      }
      photo.style.setProperty("--drag-x", (dx * CONFIG.elastic).toFixed(1) + "px");
      photo.style.setProperty("--drag-y", (dy * CONFIG.elastic).toFixed(1) + "px");
    });

    function release() {
      if (!start) return;
      start = null;
      photo.classList.remove("is-dragging");   // the CSS transition springs it home
      photo.style.setProperty("--drag-x", "0px");
      photo.style.setProperty("--drag-y", "0px");
    }
    photo.addEventListener("pointerup", release);
    // Also fires when the browser takes a touch over for a vertical scroll.
    photo.addEventListener("pointercancel", release);

    photo.addEventListener("click", function (e) {
      if (moved) {
        e.preventDefault();
        moved = false;
      }
    });

    // Links and images are natively draggable; that ghost image fights ours.
    photo.addEventListener("dragstart", function (e) { e.preventDefault(); });
  }

  function setup(gallery) {
    var photos = gallery.querySelectorAll(".pg-photo");
    if (!photos.length) return;

    for (var i = 0; i < photos.length; i++) {
      photos[i].style.setProperty("--r", randomTilt(photos[i]));
      enableDrag(photos[i]);
    }

    if (reduceMotion || !("IntersectionObserver" in window)) return;

    // Stack and hide without animating, so the collapse itself is never seen,
    // then hand transitions back for the intro.
    gallery.classList.add("is-instant", "is-hidden", "is-stacked");
    void gallery.offsetWidth;
    gallery.classList.remove("is-instant");

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        playIntro(gallery, photos.length);
      });
    }, { threshold: 0.35 });
    io.observe(gallery);
  }

  function init() {
    var galleries = document.querySelectorAll("[data-photo-gallery]");
    for (var i = 0; i < galleries.length; i++) setup(galleries[i]);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
