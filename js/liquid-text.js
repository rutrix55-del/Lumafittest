/* =========================================================================
   LumaFit — liquid shader text
   A dependency-free WebGL re-creation of @paper-design/shaders-react's
   GemSmoke, themed with LumaFit's palette and poured into a word of the
   hero headline. Sibling of shader-bg.js and built the same way.

   Why canvas compositing rather than the SVG mask the React component uses:
   an SVG inside a data: URL is rendered in an isolated context with no
   access to the document's web fonts, so a mask would silently fall back to
   a system face — that is why the original hardcodes sans-serif. Canvas 2D
   *can* use loaded web fonts, so we draw the real Fraunces italic and clip
   the shader to it with destination-in.

   Falls back to the CSS gradient text when WebGL is unavailable, and renders
   a single static frame when the user prefers reduced motion.
   ========================================================================= */
(function () {
  "use strict";

  // ---- Config (LumaFit-themed, mirrors the React component props) --------
  var CONFIG = {
    // warm -> cool, echoing --grad-brand-deep (the deep coral/pink/violet
    // set) with a gold lead-in for the molten highlights. The deep values
    // are deliberate: the shader background behind the headline is pale
    // pink-lilac, so the lighter --grad-brand set washes out against it.
    colors: ["#FFC76B", "#F2603F", "#E0327A", "#7C3AED"],
    // Softer warp + gentler swirl make the colours drift rather than churn;
    // the slightly higher speed keeps that drift from feeling sluggish.
    distortion: 0.44, // domain warp — the "liquid" wobble
    swirl: 0.38,
    speed: 0.40,
    glow: 0.26, // molten highlight strength
    maxDpr: 2,
  };

  var prefersReduced = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function hexToRgb(hex) {
    hex = hex.replace("#", "");
    if (hex.length === 3) hex = hex.replace(/(.)/g, "$1$1");
    return [
      parseInt(hex.slice(0, 2), 16) / 255,
      parseInt(hex.slice(2, 4), 16) / 255,
      parseInt(hex.slice(4, 6), 16) / 255,
    ];
  }

  var VERT = [
    "attribute vec2 a_pos;",
    "void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }",
  ].join("\n");

  var FRAG = [
    "precision highp float;",
    "uniform vec2  u_res;",
    "uniform float u_time;",
    "uniform float u_distortion;",
    "uniform float u_swirl;",
    "uniform float u_glow;",
    "uniform vec3  u_colors[4];",
    "uniform int   u_count;",

    "float hash(vec2 p){ p = fract(p * vec2(123.34, 345.45)); p += dot(p, p + 34.345); return fract(p.x * p.y); }",
    "float noise(vec2 p){",
    "  vec2 i = floor(p); vec2 f = fract(p);",
    "  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));",
    "  vec2 u = f * f * (3.0 - 2.0 * f);",
    "  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);",
    "}",
    "float fbm(vec2 p){",
    "  float v = 0.0, a = 0.5;",
    "  for (int i = 0; i < 5; i++){ v += a * noise(p); p *= 2.0; a *= 0.5; }",
    "  return v;",
    "}",
    // smooth ramp across up to 4 palette colours
    "vec3 ramp(float t){",
    "  t = clamp(t, 0.0, 1.0);",
    "  float seg = t * float(u_count - 1);",
    "  vec3 col = u_colors[0];",
    "  for (int i = 1; i < 4; i++){",
    "    if (i < u_count){",
    "      float w = clamp(seg - float(i - 1), 0.0, 1.0);",
    "      col = mix(col, u_colors[i], w);",
    "    }",
    "  }",
    "  return col;",
    "}",

    "void main(){",
    "  vec2 uv = gl_FragCoord.xy / u_res;",
    // the word is a wide, short box — stretch the field so blobs stay round
    "  vec2 p = vec2(uv.x * (u_res.x / u_res.y) * 0.35, uv.y);",
    "  float t = u_time;",
    // domain warp — this is what makes it read as liquid rather than gradient
    "  vec2 q = vec2(fbm(p * 3.0 + t * 0.25), fbm(p * 3.0 + vec2(3.1, 1.7) - t * 0.20));",
    "  vec2 w = p + u_distortion * q;",
    // swirl around the centre of the word
    "  vec2 c = w - vec2(0.5 * (u_res.x / u_res.y) * 0.35, 0.5);",
    "  float ang = u_swirl * 0.9 * fbm(w * 1.6 + t * 0.18);",
    "  float s = sin(ang), co = cos(ang);",
    "  w = vec2(c.x * co - c.y * s, c.x * s + c.y * co) + 0.5;",
    // sample the flowing field, map through the palette
    "  float f = fbm(w * 2.6 + t * 0.15);",
    "  f = smoothstep(0.18, 0.82, f);",
    "  vec3 col = ramp(f);",
    // molten highlight so it catches light like poured glass
    "  float hi = pow(smoothstep(0.55, 1.0, fbm(w * 4.2 - t * 0.30)), 2.0);",
    "  col = min(col + hi * u_glow, vec3(1.0));",
    "  gl_FragColor = vec4(col, 1.0);",
    "}",
  ].join("\n");

  function compile(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  // ---- One shader surface, shared by every liquid word on the page -------
  function createShader() {
    var canvas = document.createElement("canvas");
    var gl = canvas.getContext("webgl", { antialias: false, alpha: false }) ||
             canvas.getContext("experimental-webgl");
    if (!gl) return null;

    var vs = compile(gl, gl.VERTEX_SHADER, VERT);
    var fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return null;

    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    var U = {
      res: gl.getUniformLocation(prog, "u_res"),
      time: gl.getUniformLocation(prog, "u_time"),
      distortion: gl.getUniformLocation(prog, "u_distortion"),
      swirl: gl.getUniformLocation(prog, "u_swirl"),
      glow: gl.getUniformLocation(prog, "u_glow"),
      colors: gl.getUniformLocation(prog, "u_colors"),
      count: gl.getUniformLocation(prog, "u_count"),
    };

    var flat = [];
    CONFIG.colors.slice(0, 4).forEach(function (h) {
      var c = hexToRgb(h);
      flat.push(c[0], c[1], c[2]);
    });
    while (flat.length < 12) flat.push(0, 0, 0);

    gl.uniform1f(U.distortion, CONFIG.distortion);
    gl.uniform1f(U.swirl, CONFIG.swirl);
    gl.uniform1f(U.glow, CONFIG.glow);
    gl.uniform3fv(U.colors, flat);
    gl.uniform1i(U.count, Math.min(CONFIG.colors.length, 4));

    return {
      canvas: canvas,
      resize: function (w, h) {
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
          gl.viewport(0, 0, w, h);
        }
        gl.uniform2f(U.res, w, h);
      },
      draw: function (timeSec) {
        gl.uniform1f(U.time, timeSec * CONFIG.speed);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
    };
  }

  // ---- A single word, clipped out of the shader --------------------------
  function createWord(el, shader) {
    var text = el.textContent;
    var canvas = document.createElement("canvas");
    canvas.className = "liquid-canvas";
    canvas.setAttribute("aria-hidden", "true");
    var ctx = canvas.getContext("2d");
    if (!ctx) return null;

    var box = { w: 0, h: 0, baseline: 0, dpr: 1, font: "" };

    function measure() {
      var rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;

      var cs = getComputedStyle(el);
      // computed font-family already carries the full stack, incl. Fraunces
      var font = cs.fontStyle + " " + cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily;
      var dpr = Math.min(window.devicePixelRatio || 1, CONFIG.maxDpr);

      ctx.font = font;
      // letterSpacing is honoured by Chromium/Safari 16.4+; harmless elsewhere
      if ("letterSpacing" in ctx) ctx.letterSpacing = cs.letterSpacing;

      var m = ctx.measureText(text);
      var ascent = m.fontBoundingBoxAscent;
      var descent = m.fontBoundingBoxDescent;
      if (!isFinite(ascent) || !isFinite(descent)) {
        ascent = m.actualBoundingBoxAscent;
        descent = m.actualBoundingBoxDescent;
      }

      box.w = rect.width;
      box.h = rect.height;
      box.dpr = dpr;
      box.font = font;
      box.letterSpacing = cs.letterSpacing;
      // centre the text's own metric box inside the inline-block box
      box.baseline = (rect.height - (ascent + descent)) / 2 + ascent;

      canvas.width = Math.max(1, Math.round(box.w * dpr));
      canvas.height = Math.max(1, Math.round(box.h * dpr));
      canvas.style.width = box.w + "px";
      canvas.style.height = box.h + "px";
      return true;
    }

    function paint() {
      if (!box.w) return;
      ctx.setTransform(box.dpr, 0, 0, box.dpr, 0, 0);
      ctx.clearRect(0, 0, box.w, box.h);
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(shader.canvas, 0, 0, box.w, box.h);
      // keep only the pixels under the glyphs
      ctx.globalCompositeOperation = "destination-in";
      ctx.font = box.font;
      if ("letterSpacing" in ctx) ctx.letterSpacing = box.letterSpacing;
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
      ctx.fillStyle = "#000";
      ctx.fillText(text, 0, box.baseline);
      ctx.globalCompositeOperation = "source-over";
    }

    if (!measure()) return null;
    el.appendChild(canvas);
    el.classList.add("is-liquid");

    return { measure: measure, paint: paint, size: box };
  }

  function init() {
    var els = document.querySelectorAll(".liquid-word");
    if (!els.length) return;

    var shader = createShader();
    if (!shader) return; // -> CSS gradient text stays

    var words = [];
    for (var i = 0; i < els.length; i++) {
      var w = createWord(els[i], shader);
      if (w) words.push(w);
    }
    if (!words.length) return;

    function sizeShader() {
      var w = 1, h = 1;
      words.forEach(function (word) {
        w = Math.max(w, Math.round(word.size.w * word.size.dpr));
        h = Math.max(h, Math.round(word.size.h * word.size.dpr));
      });
      shader.resize(w, h);
    }

    function frame(timeSec) {
      shader.draw(timeSec);
      words.forEach(function (word) { word.paint(); });
    }

    sizeShader();

    var resizeTimer;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        words.forEach(function (word) { word.measure(); });
        sizeShader();
        if (prefersReduced) frame(6.0);
      }, 120);
    }, { passive: true });

    if (prefersReduced) {
      frame(6.0); // one calm static pour, no animation
      return;
    }

    var start = null;
    var running = true;

    function loop(ts) {
      if (!running) return;
      if (start === null) start = ts;
      frame((ts - start) / 1000);
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    // don't burn cycles on a hidden tab
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        running = false;
      } else if (!running) {
        running = true;
        start = null;
        requestAnimationFrame(loop);
      }
    });
  }

  function boot() {
    // wait for Fraunces, otherwise we'd clip the shader to a fallback face
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(init).catch(init);
    } else {
      init();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
