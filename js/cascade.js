/* =========================================================================
   LumaFit — cascade text reveal
   Vanilla port of the React TextReveal component. Splits any element marked
   with [data-cascade] into per-character spans so CSS can roll a duplicate of
   each glyph into view on hover/focus (see the .cascade-* rules in styles.css).

   Progressive enhancement + accessibility:
     - Runs only after the DOM is ready; if it never runs the links stay plain.
     - Skips entirely under prefers-reduced-motion (links remain normal text).
     - The split characters are wrapped in an aria-hidden span and the real,
       unbroken text is preserved on the element via aria-label, so screen
       readers announce "Privacy", not "P r i v a c y".

   Per-element overrides via data attributes:
     data-cascade-stagger="26"    (ms between characters)
     data-cascade-duration="260"  (ms per character)
     data-cascade-hover="#F2603F" (landing colour)
   ========================================================================= */
(function () {
  "use strict";

  var NBSP = " ";

  function splitGraphemes(text) {
    if (typeof Intl !== "undefined" && Intl.Segmenter) {
      try {
        var seg = new Intl.Segmenter("en", { granularity: "grapheme" });
        return Array.from(seg.segment(text), function (s) { return s.segment; });
      } catch (e) { /* fall through */ }
    }
    return Array.from(text);
  }

  function build(el) {
    var text = (el.textContent || "").trim();
    if (!text) return;

    // Preserve the accessible name before we shred the text node.
    if (!el.hasAttribute("aria-label")) el.setAttribute("aria-label", text);

    if (el.dataset.cascadeStagger) el.style.setProperty("--cascade-stagger", el.dataset.cascadeStagger + "ms");
    if (el.dataset.cascadeDuration) el.style.setProperty("--cascade-dur", el.dataset.cascadeDuration + "ms");
    if (el.dataset.cascadeHover) el.style.setProperty("--cascade-hover", el.dataset.cascadeHover);

    var inner = document.createElement("span");
    inner.className = "cascade-inner";
    inner.setAttribute("aria-hidden", "true");

    splitGraphemes(text).forEach(function (ch, i) {
      var span = document.createElement("span");
      span.className = "cascade-char";
      span.style.setProperty("--i", i);
      span.textContent = ch === " " ? NBSP : ch;
      inner.appendChild(span);
    });

    el.textContent = "";
    el.appendChild(inner);
    el.classList.add("cascade-ready");
  }

  function init() {
    var reduce = window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return; // leave links as plain, fully readable text

    var els = document.querySelectorAll("[data-cascade]");
    for (var i = 0; i < els.length; i++) build(els[i]);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
