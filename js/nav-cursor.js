/* =========================================================================
   LumaFit — sliding nav cursor
   Vanilla port of the framer-motion NavHeader. A gradient pill (.nav-cursor)
   slides behind whichever nav tab is hovered or keyboard-focused, and fades
   out when the pointer/focus leaves the nav. The CSS transition does the
   easing that framer-motion's `animate` did in the original.

   The white label colour is driven by an `.is-active` class added/removed in
   exact lockstep with the pill (NOT by :hover/:focus-visible), and the whole
   behaviour is gated behind a JS-set `.cursor-ready` class. So the label can
   never be left white on the bare glass nav (failed JS, resize, click-focus,
   etc.) — with no/failed JS the labels stay dark and readable.
   ========================================================================= */
(function () {
  "use strict";

  function init() {
    var list = document.querySelector(".nav-links");
    if (!list) return;
    var cursor = list.querySelector(".nav-cursor");
    if (!cursor) return;

    var tabs = list.querySelectorAll("li:not(.nav-cursor)");
    var activeLi = null;
    var shown = false; // has the pill been revealed at least once?

    list.classList.add("cursor-ready");

    function moveTo(li) {
      if (activeLi && activeLi !== li) activeLi.classList.remove("is-active");
      activeLi = li;
      li.classList.add("is-active"); // whitens the label, in lockstep with the pill

      if (!shown) {
        // First reveal: place it directly under the tab (no slide from left:0).
        cursor.style.transition = "none";
        cursor.style.left = li.offsetLeft + "px";
        cursor.style.width = li.offsetWidth + "px";
        void cursor.offsetWidth; // force reflow so the jump takes effect
        cursor.style.transition = "";
        shown = true;
      } else {
        cursor.style.left = li.offsetLeft + "px";
        cursor.style.width = li.offsetWidth + "px";
      }
      cursor.style.opacity = "1";
    }

    function hide() {
      cursor.style.opacity = "0";
      if (activeLi) {
        activeLi.classList.remove("is-active");
        activeLi = null;
      }
    }

    for (var i = 0; i < tabs.length; i++) {
      (function (li) {
        li.addEventListener("mouseenter", function () { moveTo(li); });
        var a = li.querySelector("a");
        if (a) a.addEventListener("focus", function () { moveTo(li); });
      })(tabs[i]);
    }

    list.addEventListener("mouseleave", hide);
    // hide when keyboard focus leaves the nav entirely
    list.addEventListener("focusout", function (e) {
      if (!list.contains(e.relatedTarget)) hide();
    });
    // On resize, re-anchor to the active tab (recomputes geometry) rather than
    // dropping it — keeps the pill + white label together for keyboard users.
    window.addEventListener("resize", function () {
      if (activeLi) moveTo(activeLi);
      else hide();
    }, { passive: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
