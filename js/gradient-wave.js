/* =========================================================================
   LumaFit — flowing gradient-wave background (experimental A/B)
   Vanilla port of the React GradientWave. The MiniGl / Gradient classes were
   already framework-free — only the React wrapper and the TypeScript types
   needed removing — so this is the same simplex-noise wave shader, themed to
   LumaFit in greyscale over a light base so body text stays readable.

   ON by default. This is an alternative to js/shader-bg.js, not an addition:
   two full-viewport WebGL contexts would fight and drain battery, so exactly
   one mounts. Override per-visit with a URL parameter, no redeploy needed:

       lumafit.org/            -> this flowing wave (the default)
       lumafit.org/?bg=mesh    -> the older mesh gradient (shader-bg.js)
       lumafit.org/?bg=wave    -> force this one

   To change which is default, set DEFAULT_BG in BOTH this file and
   js/shader-bg.js (they read the same parameter and must agree).

   Falls back to the CSS aurora when WebGL is unavailable, and renders a single
   static frame under prefers-reduced-motion.
   ========================================================================= */
(function () {
  "use strict";

  var DEFAULT_BG = "wave"; // keep in sync with js/shader-bg.js

  /* ---- Config (LumaFit-themed, mirrors the React component props) --------
     EXACTLY FOUR COLOURS. The vertex shader tests u_active_colors[i + 1] for
     each wave layer, and u_active_colors is a vec4 — so one base plus three
     layers is the ceiling. The component's own six-colour default overruns
     that vec4 and reads out of bounds. */
  var CONFIG = {
    // Greyscale on purpose: the waves read by tone alone (graphite, white,
    // silver) and the volt accents keep all the colour. The last layer paints
    // on top. Keep base in sync with --bg and the greys with the CSS fallback.
    base: "#F3F3F2",
    waves: ["#8A8E92", "#FFFFFF", "#C8CBCD"],
    shadowPower: 6,
    darkenTop: false,   // a light site: no top shadow
    noiseFreq: [0.00012, 0.00028],
    // Flow rate. The shader does time = u_time(ms) * noiseSpeed, so this is
    // tiny by nature — but below ~1e-5 the motion is too slow to perceive and
    // the background reads as a static image. Raise to speed the waves up.
    noiseSpeed: 0.00002,
    deform: {
      incline: 0.42,
      // Both 0, NOT the component's -0.5. The shader offsets y by
      // incline*width/2 * (uvNormX - offset), so a non-zero offset adds a
      // constant push on top of the diagonal tilt — enough to lift the mesh
      // off the bottom-right corner and expose the page background as a white
      // triangle. Zero keeps the tilt symmetric about the centre.
      offsetTop: 0,
      offsetBottom: 0,
      noiseFreq: [3, 4],
      noiseAmp: 280,
      noiseSpeed: 9,
      noiseFlow: 4.5,
      noiseSeed: 5
    }
  };

  function wantsWave() {
    var m = /[?&]bg=([a-z]+)/i.exec(window.location.search);
    return (m ? m[1].toLowerCase() : DEFAULT_BG) === "wave";
  }

  function normalizeColor(hexCode) {
    return [
      ((hexCode >> 16) & 255) / 255,
      ((hexCode >> 8) & 255) / 255,
      (255 & hexCode) / 255
    ];
  }

  // ---- MiniGl: the tiny WebGL harness the shader runs on ------------------
  function MiniGl(canvas) {
    this.canvas = canvas;
    this.meshes = [];

    var gl = canvas.getContext("webgl", { antialias: true });
    if (!gl) throw new Error("WebGL not supported");
    this.gl = gl;

    var context = gl;
    var _miniGl = this;

    this.Uniform = function (e) {
      this.type = "float";
      Object.assign(this, e);
      var typeMap = {
        float: "1f", int: "1i", vec2: "2fv",
        vec3: "3fv", vec4: "4fv", mat4: "Matrix4fv"
      };
      this.typeFn = typeMap[this.type] || "1f";
    };

    this.Uniform.prototype.update = function (location) {
      if (this.value === undefined || location === null) return;
      var fn = "uniform" + this.typeFn;
      if (this.typeFn.indexOf("Matrix") === 0) {
        context[fn](location, this.transpose || false, this.value);
      } else {
        context[fn](location, this.value);
      }
    };

    this.Uniform.prototype.getDeclaration = function (name, type, length) {
      if (this.excludeFrom === type) return "";

      if (this.type === "array") {
        return this.value[0].getDeclaration(name, type, this.value.length) +
          "\nconst int " + name + "_length = " + this.value.length + ";";
      }

      if (this.type === "struct") {
        var noPrefix = name.replace("u_", "");
        noPrefix = noPrefix.charAt(0).toUpperCase() + noPrefix.slice(1);
        var fields = Object.keys(this.value).map(function (n) {
          return this.value[n].getDeclaration(n, type).replace(/^uniform/, "");
        }, this).join("");
        return "uniform struct " + noPrefix + " {\n" + fields + "\n} " +
          name + (length ? "[" + length + "]" : "") + ";";
      }

      return "uniform " + this.type + " " + name +
        (length ? "[" + length + "]" : "") + ";";
    };

    this.Attribute = function (e) {
      this.type = context.FLOAT;
      this.normalized = false;
      this.buffer = context.createBuffer();
      Object.assign(this, e);
    };

    this.Attribute.prototype.update = function () {
      if (!this.values) return;
      context.bindBuffer(this.target, this.buffer);
      context.bufferData(this.target, this.values, context.STATIC_DRAW);
    };

    this.Attribute.prototype.attach = function (e, program) {
      var n = context.getAttribLocation(program, e);
      if (this.target === context.ARRAY_BUFFER) {
        context.bindBuffer(this.target, this.buffer);
        context.enableVertexAttribArray(n);
        context.vertexAttribPointer(n, this.size, this.type, this.normalized, 0, 0);
      }
      return n;
    };

    this.Attribute.prototype.use = function (e) {
      context.bindBuffer(this.target, this.buffer);
      if (this.target === context.ARRAY_BUFFER) {
        context.enableVertexAttribArray(e);
        context.vertexAttribPointer(e, this.size, this.type, this.normalized, 0, 0);
      }
    };

    this.Material = function (vertexShaders, fragments, uniforms) {
      uniforms = uniforms || {};
      var material = this;
      material.uniformInstances = [];

      function getShader(type, source) {
        var shader = context.createShader(type);
        context.shaderSource(shader, source);
        context.compileShader(shader);
        if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
          console.error(context.getShaderInfoLog(shader));
          throw new Error("Shader compilation error");
        }
        return shader;
      }

      function declarations(list, type) {
        return Object.keys(list).map(function (u) {
          return list[u].getDeclaration(u, type);
        }).join("\n");
      }

      material.uniforms = uniforms;
      var prefix = "precision highp float;";

      var vertexSource = prefix +
        "\nattribute vec4 position;\nattribute vec2 uv;\nattribute vec2 uvNorm;\n" +
        declarations(_miniGl.commonUniforms, "vertex") + "\n" +
        declarations(uniforms, "vertex") + "\n" + vertexShaders;

      var fragmentSource = prefix + "\n" +
        declarations(_miniGl.commonUniforms, "fragment") + "\n" +
        declarations(uniforms, "fragment") + "\n" + fragments;

      material.program = context.createProgram();
      context.attachShader(material.program, getShader(context.VERTEX_SHADER, vertexSource));
      context.attachShader(material.program, getShader(context.FRAGMENT_SHADER, fragmentSource));
      context.linkProgram(material.program);

      if (!context.getProgramParameter(material.program, context.LINK_STATUS)) {
        console.error(context.getProgramInfoLog(material.program));
        throw new Error("Program linking error");
      }

      context.useProgram(material.program);
      material.attachUniforms(undefined, _miniGl.commonUniforms);
      material.attachUniforms(undefined, material.uniforms);
    };

    this.Material.prototype.attachUniforms = function (name, uniforms) {
      var self = this;
      if (name === undefined) {
        Object.keys(uniforms).forEach(function (n) {
          self.attachUniforms(n, uniforms[n]);
        });
      } else if (uniforms.type === "array") {
        uniforms.value.forEach(function (u, i) {
          self.attachUniforms(name + "[" + i + "]", u);
        });
      } else if (uniforms.type === "struct") {
        Object.keys(uniforms.value).forEach(function (u) {
          self.attachUniforms(name + "." + u, uniforms.value[u]);
        });
      } else {
        self.uniformInstances.push({
          uniform: uniforms,
          location: context.getUniformLocation(self.program, name)
        });
      }
    };

    this.PlaneGeometry = function () {
      this.width = 1;
      this.height = 1;
      this.vertexCount = 0;
      this.xSegCount = 0;
      this.ySegCount = 0;
      this.attributes = {
        position: new _miniGl.Attribute({ target: context.ARRAY_BUFFER, size: 3 }),
        uv: new _miniGl.Attribute({ target: context.ARRAY_BUFFER, size: 2 }),
        uvNorm: new _miniGl.Attribute({ target: context.ARRAY_BUFFER, size: 2 }),
        index: new _miniGl.Attribute({
          target: context.ELEMENT_ARRAY_BUFFER, size: 3, type: context.UNSIGNED_SHORT
        })
      };
    };

    this.PlaneGeometry.prototype.setTopology = function (xSegs, ySegs) {
      this.xSegCount = xSegs || 1;
      this.ySegCount = ySegs || 1;
      this.vertexCount = (this.xSegCount + 1) * (this.ySegCount + 1);
      var quadCount = this.xSegCount * this.ySegCount * 2;

      this.attributes.uv.values = new Float32Array(2 * this.vertexCount);
      this.attributes.uvNorm.values = new Float32Array(2 * this.vertexCount);
      this.attributes.index.values = new Uint16Array(3 * quadCount);

      for (var y = 0; y <= this.ySegCount; y++) {
        for (var x = 0; x <= this.xSegCount; x++) {
          var i = y * (this.xSegCount + 1) + x;
          this.attributes.uv.values[2 * i] = x / this.xSegCount;
          this.attributes.uv.values[2 * i + 1] = 1 - y / this.ySegCount;
          this.attributes.uvNorm.values[2 * i] = (x / this.xSegCount) * 2 - 1;
          this.attributes.uvNorm.values[2 * i + 1] = 1 - (y / this.ySegCount) * 2;

          if (x < this.xSegCount && y < this.ySegCount) {
            var s = y * this.xSegCount + x;
            this.attributes.index.values[6 * s] = i;
            this.attributes.index.values[6 * s + 1] = i + 1 + this.xSegCount;
            this.attributes.index.values[6 * s + 2] = i + 1;
            this.attributes.index.values[6 * s + 3] = i + 1;
            this.attributes.index.values[6 * s + 4] = i + 1 + this.xSegCount;
            this.attributes.index.values[6 * s + 5] = i + 2 + this.xSegCount;
          }
        }
      }

      this.attributes.uv.update();
      this.attributes.uvNorm.update();
      this.attributes.index.update();
    };

    this.PlaneGeometry.prototype.setSize = function (width, height) {
      this.width = width || 1;
      this.height = height || 1;
      this.attributes.position.values = new Float32Array(3 * this.vertexCount);

      var offsetX = this.width / -2;
      var offsetY = this.height / -2;
      var segWidth = this.width / this.xSegCount;
      var segHeight = this.height / this.ySegCount;

      for (var y = 0; y <= this.ySegCount; y++) {
        var posY = offsetY + y * segHeight;
        for (var x = 0; x <= this.xSegCount; x++) {
          var idx = y * (this.xSegCount + 1) + x;
          this.attributes.position.values[3 * idx] = offsetX + x * segWidth;
          this.attributes.position.values[3 * idx + 1] = -posY;
          this.attributes.position.values[3 * idx + 2] = 0;
        }
      }

      this.attributes.position.update();
    };

    this.Mesh = function (geometry, material) {
      var self = this;
      this.geometry = geometry;
      this.material = material;
      this.attributeInstances = [];

      Object.keys(geometry.attributes).forEach(function (e) {
        self.attributeInstances.push({
          attribute: geometry.attributes[e],
          location: geometry.attributes[e].attach(e, material.program)
        });
      });

      _miniGl.meshes.push(this);
    };

    this.Mesh.prototype.draw = function () {
      context.useProgram(this.material.program);
      this.material.uniformInstances.forEach(function (o) {
        o.uniform.update(o.location);
      });
      this.attributeInstances.forEach(function (o) {
        o.attribute.use(o.location);
      });
      context.drawElements(
        context.TRIANGLES,
        this.geometry.attributes.index.values.length,
        context.UNSIGNED_SHORT, 0
      );
    };

    var identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    this.commonUniforms = {
      projectionMatrix: new this.Uniform({ type: "mat4", value: identity }),
      modelViewMatrix: new this.Uniform({ type: "mat4", value: identity }),
      resolution: new this.Uniform({ type: "vec2", value: [1, 1] }),
      aspectRatio: new this.Uniform({ type: "float", value: 1 })
    };
  }

  MiniGl.prototype.setSize = function (w, h) {
    this.width = w;
    this.height = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.gl.viewport(0, 0, w, h);
    this.commonUniforms.resolution.value = [w, h];
    this.commonUniforms.aspectRatio.value = w / h;
  };

  MiniGl.prototype.setOrthographicCamera = function () {
    this.commonUniforms.projectionMatrix.value = [
      2 / this.width, 0, 0, 0,
      0, 2 / this.height, 0, 0,
      0, 0, -0.001, 0,
      0, 0, 0, 1
    ];
  };

  MiniGl.prototype.render = function () {
    this.gl.clearColor(0, 0, 0, 0);
    this.gl.clearDepth(1);
    this.meshes.forEach(function (m) { m.draw(); });
  };

  // ---- Shaders (unchanged from the component; classic 3D simplex noise) ---
  var VERT = [
    "vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }",
    "vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }",
    "vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }",
    "vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }",
    "float snoise(vec3 v) {",
    "  const vec2 C = vec2(1.0/6.0, 1.0/3.0);",
    "  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);",
    "  vec3 i  = floor(v + dot(v, C.yyy));",
    "  vec3 x0 = v - i + dot(i, C.xxx);",
    "  vec3 g = step(x0.yzx, x0.xyz);",
    "  vec3 l = 1.0 - g;",
    "  vec3 i1 = min(g.xyz, l.zxy);",
    "  vec3 i2 = max(g.xyz, l.zxy);",
    "  vec3 x1 = x0 - i1 + C.xxx;",
    "  vec3 x2 = x0 - i2 + C.yyy;",
    "  vec3 x3 = x0 - D.yyy;",
    "  i = mod289(i);",
    "  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));",
    "  float n_ = 0.142857142857;",
    "  vec3 ns = n_ * D.wyz - D.xzx;",
    "  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);",
    "  vec4 x_ = floor(j * ns.z);",
    "  vec4 y_ = floor(j - 7.0 * x_);",
    "  vec4 x = x_ *ns.x + ns.yyyy;",
    "  vec4 y = y_ *ns.x + ns.yyyy;",
    "  vec4 h = 1.0 - abs(x) - abs(y);",
    "  vec4 b0 = vec4(x.xy, y.xy);",
    "  vec4 b1 = vec4(x.zw, y.zw);",
    "  vec4 s0 = floor(b0)*2.0 + 1.0;",
    "  vec4 s1 = floor(b1)*2.0 + 1.0;",
    "  vec4 sh = -step(h, vec4(0.0));",
    "  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;",
    "  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;",
    "  vec3 p0 = vec3(a0.xy,h.x);",
    "  vec3 p1 = vec3(a0.zw,h.y);",
    "  vec3 p2 = vec3(a1.xy,h.z);",
    "  vec3 p3 = vec3(a1.zw,h.w);",
    "  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));",
    "  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;",
    "  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);",
    "  m = m * m;",
    "  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));",
    "}",
    "vec3 blendNormal(vec3 base, vec3 blend) { return blend; }",
    "vec3 blendNormal(vec3 base, vec3 blend, float opacity) { return (blend * opacity + base * (1.0 - opacity)); }",
    "varying vec3 v_color;",
    "void main() {",
    "  float time = u_time * u_global.noiseSpeed;",
    "  vec2 noiseCoord = resolution * uvNorm * u_global.noiseFreq;",
    "  float tilt = resolution.y / 2.0 * uvNorm.y;",
    "  float incline = resolution.x * uvNorm.x / 2.0 * u_vertDeform.incline;",
    "  float offset = resolution.x / 2.0 * u_vertDeform.incline * mix(u_vertDeform.offsetBottom, u_vertDeform.offsetTop, uv.y);",
    "  float noise = snoise(vec3(",
    "    noiseCoord.x * u_vertDeform.noiseFreq.x + time * u_vertDeform.noiseFlow,",
    "    noiseCoord.y * u_vertDeform.noiseFreq.y,",
    "    time * u_vertDeform.noiseSpeed + u_vertDeform.noiseSeed",
    "  )) * u_vertDeform.noiseAmp;",
    "  noise *= 1.0 - pow(abs(uvNorm.y), 2.0);",
    "  noise = max(0.0, noise);",
    "  vec3 pos = vec3(position.x, position.y + tilt + incline + noise - offset, position.z);",
    "  v_color = u_baseColor;",
    "  for (int i = 0; i < u_waveLayers_length; i++) {",
    "    if (u_active_colors[i + 1] == 1.) {",
    "      WaveLayers layer = u_waveLayers[i];",
    "      float layerNoise = smoothstep(",
    "        layer.noiseFloor,",
    "        layer.noiseCeil,",
    "        snoise(vec3(",
    "          noiseCoord.x * layer.noiseFreq.x + time * layer.noiseFlow,",
    "          noiseCoord.y * layer.noiseFreq.y,",
    "          time * layer.noiseSpeed + layer.noiseSeed",
    "        )) / 2.0 + 0.5",
    "      );",
    "      v_color = blendNormal(v_color, layer.color, pow(layerNoise, 4.));",
    "    }",
    "  }",
    "  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);",
    "}"
  ].join("\n");

  var FRAG = [
    "varying vec3 v_color;",
    "void main() {",
    "  vec3 color = v_color;",
    "  if (u_darken_top == 1.0) {",
    "    vec2 st = gl_FragCoord.xy/resolution.xy;",
    "    color.g -= pow(st.y + sin(-12.0) * st.x, u_shadow_power) * 0.4;",
    "  }",
    "  gl_FragColor = vec4(color, 1.0);",
    "}"
  ].join("\n");

  // ---- Gradient: builds the uniforms and drives the render loop -----------
  function Gradient(canvas, colors) {
    this.canvas = canvas;
    this.colors = colors;
    this.time = 0;
    this.last = 0;
    this.isPlaying = false;
    this.minigl = new MiniGl(canvas);
    this.init();
  }

  Gradient.prototype.init = function () {
    var mg = this.minigl;
    var self = this;

    var sectionColors = this.colors.map(function (hex) {
      return normalizeColor(parseInt(hex.replace("#", "0x"), 16));
    });

    var uniforms = {
      u_time: new mg.Uniform({ value: 0 }),
      u_shadow_power: new mg.Uniform({ value: CONFIG.shadowPower }),
      u_darken_top: new mg.Uniform({ value: CONFIG.darkenTop ? 1 : 0 }),
      u_active_colors: new mg.Uniform({ value: [1, 1, 1, 1], type: "vec4" }),
      u_global: new mg.Uniform({
        value: {
          noiseFreq: new mg.Uniform({ value: CONFIG.noiseFreq, type: "vec2" }),
          noiseSpeed: new mg.Uniform({ value: CONFIG.noiseSpeed })
        },
        type: "struct"
      }),
      u_vertDeform: new mg.Uniform({
        value: {
          incline: new mg.Uniform({ value: CONFIG.deform.incline }),
          offsetTop: new mg.Uniform({ value: CONFIG.deform.offsetTop }),
          offsetBottom: new mg.Uniform({ value: CONFIG.deform.offsetBottom }),
          noiseFreq: new mg.Uniform({ value: CONFIG.deform.noiseFreq, type: "vec2" }),
          noiseAmp: new mg.Uniform({ value: CONFIG.deform.noiseAmp }),
          noiseSpeed: new mg.Uniform({ value: CONFIG.deform.noiseSpeed }),
          noiseFlow: new mg.Uniform({ value: CONFIG.deform.noiseFlow }),
          noiseSeed: new mg.Uniform({ value: CONFIG.deform.noiseSeed })
        },
        type: "struct",
        excludeFrom: "fragment"
      }),
      u_baseColor: new mg.Uniform({
        value: sectionColors[0], type: "vec3", excludeFrom: "fragment"
      }),
      u_waveLayers: new mg.Uniform({ value: [], excludeFrom: "fragment", type: "array" })
    };

    for (var i = 1; i < sectionColors.length; i++) {
      uniforms.u_waveLayers.value.push(new mg.Uniform({
        value: {
          color: new mg.Uniform({ value: sectionColors[i], type: "vec3" }),
          noiseFreq: new mg.Uniform({
            value: [2 + i / sectionColors.length, 3 + i / sectionColors.length],
            type: "vec2"
          }),
          noiseSpeed: new mg.Uniform({ value: 11 + 0.3 * i }),
          noiseFlow: new mg.Uniform({ value: 6.5 + 0.3 * i }),
          noiseSeed: new mg.Uniform({ value: 5 + 10 * i }),
          noiseFloor: new mg.Uniform({ value: 0.1 }),
          noiseCeil: new mg.Uniform({ value: 0.63 + 0.07 * i })
        },
        type: "struct"
      }));
    }

    var material = new mg.Material(VERT, FRAG, uniforms);
    this.mesh = new mg.Mesh(new mg.PlaneGeometry(), material);

    this.resize();
    window.addEventListener("resize", function () { self.resize(); }, { passive: true });
  };

  Gradient.prototype.resize = function () {
    var w = window.innerWidth;
    var h = window.innerHeight;
    this.minigl.setSize(w, h);
    this.minigl.setOrthographicCamera();
    this.mesh.geometry.setTopology(Math.ceil(w * 0.02), Math.ceil(h * 0.05));
    this.mesh.geometry.setSize(w, h);
    this.mesh.material.uniforms.u_shadow_power.value = w < 600 ? 5 : CONFIG.shadowPower;

    // The mesh spans +/-height but the viewport only +/-height/2, so it can
    // absorb a tilt of height/2 before a corner stops being covered. On wide,
    // short viewports the configured incline exceeds that, so clamp it —
    // 0.9 leaves margin for the noise displacement near the edges.
    var maxIncline = 0.9 * (h / w);
    this.mesh.material.uniforms.u_vertDeform.value.incline.value =
      Math.min(CONFIG.deform.incline, maxIncline);
    if (!this.isPlaying) this.minigl.render(); // keep the static frame correct
  };

  Gradient.prototype.frame = function (timestamp) {
    if (!this.isPlaying) return;
    // Clamp the step so a backgrounded tab doesn't jump the animation forward.
    this.time += Math.min(timestamp - this.last, 1000 / 15);
    this.last = timestamp;
    this.mesh.material.uniforms.u_time.value = this.time;
    this.minigl.render();
    this.animationId = requestAnimationFrame(this.frame.bind(this));
  };

  Gradient.prototype.start = function () {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.last = performance.now();
    this.animationId = requestAnimationFrame(this.frame.bind(this));
  };

  Gradient.prototype.stop = function () {
    this.isPlaying = false;
    if (this.animationId) cancelAnimationFrame(this.animationId);
  };

  // ---- Mount --------------------------------------------------------------
  function init() {
    if (!wantsWave()) return;

    var canvas = document.createElement("canvas");
    canvas.id = "shader-bg"; // reuses the same fixed, z-index:-3 CSS rule
    canvas.setAttribute("aria-hidden", "true");

    var gradient;
    try {
      gradient = new Gradient(canvas, [CONFIG.base].concat(CONFIG.waves));
    } catch (err) {
      console.warn("[LumaFit] gradient wave unavailable:", err.message);
      return; // -> CSS aurora fallback stays
    }

    document.body.appendChild(canvas);
    document.documentElement.classList.add("shader-active");

    var reduce = window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      gradient.minigl.render(); // one static frame, no loop
      return;
    }

    gradient.start();

    // Don't burn a GPU loop on a tab nobody is looking at.
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) gradient.stop();
      else gradient.start();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
