/* =========================================================================
   LumaFit — smooth mesh-gradient shader background
   A dependency-free WebGL re-creation of @paper-design/shaders-react's
   MeshGradient, themed with LumaFit's palette over the cream base so it
   matches the site's existing "Aurora Glow" style (just alive + flowing).

   Mirrors the React component's knobs: colors / distortion / swirl / speed
   / offsetX. Falls back to the CSS aurora when WebGL is unavailable, and
   renders a single static frame when the user prefers reduced motion.
   ========================================================================= */
(function () {
  "use strict";

  // ---- Config (LumaFit-themed, mirrors the React component props) --------
  var CONFIG = {
    colors: ["#E6FF55", "#B5F23D", "#4FE3A6", "#8BE86A", "#E4E7E1"], // volt→lime→spring→fresh→stone
    distortion: 0.9,
    swirl: 0.6,
    speed: 0.4,
    offsetX: 0.08,
    airiness: 0.6,     // 0 = full colour, 1 = pure cream. Keeps it light + fresh.
    renderScale: 0.55, // internal resolution (gradient is soft, so we can go low = fast)
    cream: "#F3F4F1", // stone, same as --bg (key name kept for the shader code)
  };

  // Which background wins. Only one may mount — two full-viewport WebGL
  // contexts would fight over the same z-index and double the GPU cost.
  // Keep DEFAULT_BG in sync with js/gradient-wave.js.
  var DEFAULT_BG = "wave";

  function wantsWave() {
    var m = /[?&]bg=([a-z]+)/i.exec(window.location.search);
    return (m ? m[1].toLowerCase() : DEFAULT_BG) === "wave";
  }

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
    "uniform float u_offsetX;",
    "uniform float u_airiness;",
    "uniform vec3  u_cream;",
    "uniform vec3  u_colors[6];",
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
    // smooth ramp across up to 6 palette colours (loop index = legal array index in GLSL ES 1.0)
    "vec3 ramp(float t){",
    "  t = clamp(t, 0.0, 1.0);",
    "  float seg = t * float(u_count - 1);",
    "  vec3 col = u_colors[0];",
    "  for (int i = 1; i < 6; i++){",
    "    if (i < u_count){",
    "      float w = clamp(seg - float(i - 1), 0.0, 1.0);",
    "      col = mix(col, u_colors[i], w);",
    "    }",
    "  }",
    "  return col;",
    "}",

    "void main(){",
    "  vec2 uv = gl_FragCoord.xy / u_res;",
    "  float aspect = u_res.x / u_res.y;",
    "  vec2 p = uv; p.x = (p.x - 0.5) * aspect + 0.5 + u_offsetX;",
    "  float t = u_time;",
    // domain warp (distortion)
    "  vec2 q = vec2(fbm(p * 2.0 + t * 0.10), fbm(p * 2.0 + vec2(5.2, 1.3) - t * 0.12));",
    "  vec2 w = p + u_distortion * 0.6 * q;",
    // swirl around centre
    "  vec2 c = w - 0.5;",
    "  float ang = u_swirl * 0.8 * fbm(w * 1.5 + t * 0.15);",
    "  float s = sin(ang), co = cos(ang);",
    "  w = vec2(c.x * co - c.y * s, c.x * s + c.y * co) + 0.5;",
    // sample the flowing field, map through the palette
    "  float f = fbm(w * 2.2 + t * 0.08);",
    "  f = f * 0.9 + 0.1 * fbm(p * 4.0 - t * 0.10);",
    "  vec3 col = ramp(f);",
    // keep it airy + fresh: blend toward the cream base
    "  col = mix(col, u_cream, u_airiness);",
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

  function init() {
    if (wantsWave()) return; // ?bg=wave -> js/gradient-wave.js mounts instead

    var canvas = document.createElement("canvas");
    canvas.id = "shader-bg";
    canvas.setAttribute("aria-hidden", "true");

    var gl = canvas.getContext("webgl", { antialias: false, alpha: false }) ||
             canvas.getContext("experimental-webgl");
    if (!gl) return; // -> CSS aurora fallback stays

    var vs = compile(gl, gl.VERTEX_SHADER, VERT);
    var fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;

    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    // full-screen triangle
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    // uniforms
    var U = {
      res: gl.getUniformLocation(prog, "u_res"),
      time: gl.getUniformLocation(prog, "u_time"),
      distortion: gl.getUniformLocation(prog, "u_distortion"),
      swirl: gl.getUniformLocation(prog, "u_swirl"),
      offsetX: gl.getUniformLocation(prog, "u_offsetX"),
      airiness: gl.getUniformLocation(prog, "u_airiness"),
      cream: gl.getUniformLocation(prog, "u_cream"),
      colors: gl.getUniformLocation(prog, "u_colors"),
      count: gl.getUniformLocation(prog, "u_count"),
    };

    var flat = [];
    CONFIG.colors.slice(0, 6).forEach(function (h) {
      var c = hexToRgb(h);
      flat.push(c[0], c[1], c[2]);
    });
    while (flat.length < 18) flat.push(0, 0, 0);

    gl.uniform1f(U.distortion, CONFIG.distortion);
    gl.uniform1f(U.swirl, CONFIG.swirl);
    gl.uniform1f(U.offsetX, CONFIG.offsetX);
    gl.uniform1f(U.airiness, CONFIG.airiness);
    gl.uniform3fv(U.cream, hexToRgb(CONFIG.cream));
    gl.uniform3fv(U.colors, flat);
    gl.uniform1i(U.count, Math.min(CONFIG.colors.length, 6));

    function resize() {
      var w = Math.max(1, Math.floor(window.innerWidth * CONFIG.renderScale));
      var h = Math.max(1, Math.floor(window.innerHeight * CONFIG.renderScale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      gl.uniform2f(U.res, w, h);
    }

    function draw(timeSec) {
      gl.uniform1f(U.time, timeSec * CONFIG.speed);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    document.documentElement.classList.add("shader-active");
    document.body.appendChild(canvas);

    resize();
    window.addEventListener("resize", resize, { passive: true });

    if (prefersReduced) {
      // one calm static frame, no animation
      draw(8.0);
      return;
    }

    var start = null;
    function loop(ts) {
      if (start === null) start = ts;
      draw((ts - start) / 1000);
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
