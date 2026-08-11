(function () {
  'use strict';

  var root = document.getElementById('cinematic-background');
  var canvas = document.getElementById('cinematic-canvas');
  var particleCanvas = document.getElementById('cinematic-particles');
  if (!root || !canvas || !particleCanvas) return;

  var searchParams = new URLSearchParams(window.location.search);
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (searchParams.get('cinematicMotion') === 'force') reducedMotion = false;
  if (searchParams.get('cinematicMotion') === 'reduce') reducedMotion = true;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var lowPower = (navigator.deviceMemory || 4) <= 2 || (navigator.hardwareConcurrency || 4) <= 4;
  var sceneDuration = 16000;
  var transitionDuration = lowPower ? 2100 : 2700;
  var fastDemo = searchParams.get('cinematicDemo') === 'fast';
  if (fastDemo) {
    sceneDuration = 2600;
    transitionDuration = 1800;
  }

  var scenes = [
    { name: '雪山云海', src: 'images/cinematic/mountain-clouds.webp', transition: 0 },
    { name: '月夜海洋', src: 'images/cinematic/moon-ocean.webp', transition: 1 },
    { name: '极光湖', src: 'images/cinematic/aurora-lake.webp', transition: 2 },
    { name: '梦幻森林', src: 'images/cinematic/dream-forest.webp', transition: 3 }
  ];

  var gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: reducedMotion,
    powerPreference: lowPower ? 'low-power' : 'high-performance'
  });

  if (!gl) {
    root.classList.add('is-fallback');
    exposeApi(null);
    return;
  }

  var vertexSource = [
    'attribute vec2 aPosition;',
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = aPosition * .5 + .5;',
    '  gl_Position = vec4(aPosition, 0.0, 1.0);',
    '}'
  ].join('\n');

  var fragmentSource = [
    'precision mediump float;',
    'varying vec2 vUv;',
    'uniform sampler2D uCurrent;',
    'uniform sampler2D uNext;',
    'uniform vec2 uResolution;',
    'uniform vec2 uCurrentSize;',
    'uniform vec2 uNextSize;',
    'uniform vec2 uPointer;',
    'uniform float uProgress;',
    'uniform float uTime;',
    'uniform float uMode;',
    '',
    'float hash(vec2 p) {',
    '  p = fract(p * vec2(123.34, 456.21));',
    '  p += dot(p, p + 45.32);',
    '  return fract(p.x * p.y);',
    '}',
    '',
    'float noise(vec2 p) {',
    '  vec2 i = floor(p);',
    '  vec2 f = fract(p);',
    '  f = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),',
    '             mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), f.x), f.y);',
    '}',
    '',
    'float fbm(vec2 p) {',
    '  float value = 0.0;',
    '  float amplitude = .5;',
    '  for (int i = 0; i < 4; i++) {',
    '    value += noise(p) * amplitude;',
    '    p = p * 2.03 + vec2(7.2, 3.4);',
    '    amplitude *= .5;',
    '  }',
    '  return value;',
    '}',
    '',
    'vec2 coverUv(vec2 uv, vec2 imageSize) {',
    '  float viewportAspect = uResolution.x / max(1.0, uResolution.y);',
    '  float imageAspect = imageSize.x / max(1.0, imageSize.y);',
    '  vec2 scale = imageAspect > viewportAspect',
    '    ? vec2(viewportAspect / imageAspect, 1.0)',
    '    : vec2(1.0, imageAspect / viewportAspect);',
    '  return clamp((uv - .5) * scale + .5, .001, .999);',
    '}',
    '',
    'void main() {',
    '  vec2 uv = vUv;',
    '  float pulse = sin(3.14159265 * uProgress);',
    '  vec2 parallax = uPointer * .012;',
    '  vec2 drift = vec2(sin(uTime * .055), cos(uTime * .043)) * .0016;',
    '  vec2 flow = vec2(',
    '    fbm(uv * 3.1 + vec2(uTime * .025, 1.7)),',
    '    fbm(uv * 3.1 + vec2(6.4, -uTime * .021))',
    '  ) - .5;',
    '  vec2 uvA = uv + parallax + drift;',
    '  vec2 uvB = uv + parallax * .72 - drift;',
    '  float mask = uProgress;',
    '  float fogFlash = 0.0;',
    '',
    '  if (uMode < .5) {',
    '    vec2 center = uv - .5;',
    '    float radius = length(center);',
    '    vec2 direction = center / max(radius, .001);',
    '    float ripple = sin(radius * 54.0 - uProgress * 18.0) * .018 * pulse;',
    '    uvA += direction * ripple;',
    '    uvB -= direction * ripple * .72;',
    '    float rippleEdge = uProgress * .95 - .08;',
    '    mask = 1.0 - smoothstep(rippleEdge, rippleEdge + .1, radius);',
    '  } else if (uMode < 1.5) {',
    '    float dissolve = fbm(uv * 5.4 + flow * 1.7);',
    '    uvA += flow * .022 * pulse;',
    '    uvB -= flow * .026 * pulse;',
    '    mask = 1.0 - smoothstep(uProgress * 1.2 - .18, uProgress * 1.2 + .02, dissolve);',
    '  } else if (uMode < 2.5) {',
    '    float fog = fbm(vec2(uv.x * 3.6 + uTime * .024, uv.y * 4.2));',
    '    float sweep = uv.y + (fog - .5) * .42;',
    '    uvA += vec2(flow.x * .035, -.012) * pulse;',
    '    uvB += vec2(-flow.y * .03, .012) * pulse;',
    '    float fogEdge = uProgress * 1.4 - .2;',
    '    mask = 1.0 - smoothstep(fogEdge - .12, fogEdge + .12, sweep);',
    '    fogFlash = pulse * smoothstep(.36, .76, fog) * .22;',
    '  } else {',
    '    vec2 centered = uv - .5;',
    '    float radius = length(centered);',
    '    float angle = pulse * .34 * (1.0 - smoothstep(.0, .78, radius));',
    '    float cs = cos(angle);',
    '    float sn = sin(angle);',
    '    vec2 warped = mat2(cs, -sn, sn, cs) * centered + .5;',
    '    uvA = warped + flow * .058 * pulse + parallax;',
    '    uvB = uv - flow * .048 * pulse + parallax * .72;',
    '    mask = smoothstep(.26, .74, uProgress + flow.x * .34 - flow.y * .18);',
    '  }',
    '',
    '  vec3 currentColor = texture2D(uCurrent, coverUv(uvA, uCurrentSize)).rgb;',
    '  vec3 nextColor = texture2D(uNext, coverUv(uvB, uNextSize)).rgb;',
    '  vec3 color = mix(currentColor, nextColor, clamp(mask, 0.0, 1.0));',
    '',
    '  float mistNoise = fbm(vec2(uv.x * 3.0 + uTime * .012, uv.y * 4.8 - uTime * .006));',
    '  float mistBand = smoothstep(.42, .94, mistNoise) * (1.0 - smoothstep(.2, .88, uv.y)) * .09;',
    '  color = mix(color, vec3(.34, .43, .54), mistBand + fogFlash);',
    '  float vignette = smoothstep(.94, .28, length((uv - .5) * vec2(1.06, .92)));',
    '  color *= mix(.56, .88, vignette);',
    '  color += (hash(gl_FragCoord.xy + uTime * 47.0) - .5) * .018;',
    '  color = pow(max(color, 0.0), vec3(.96));',
    '  gl_FragColor = vec4(color, 1.0);',
    '}'
  ].join('\n');

  function compileShader(type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      var message = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(message || 'Shader compilation failed');
    }
    return shader;
  }

  function createProgram() {
    var program = gl.createProgram();
    gl.attachShader(program, compileShader(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || 'Shader link failed');
    }
    return program;
  }

  var program;
  try {
    program = createProgram();
  } catch (error) {
    console.warn('[CinematicBackground] WebGL fallback:', error);
    root.classList.add('is-fallback');
    exposeApi(null);
    return;
  }

  gl.useProgram(program);
  var quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  var positionLocation = gl.getAttribLocation(program, 'aPosition');
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  var uniforms = {
    current: gl.getUniformLocation(program, 'uCurrent'),
    next: gl.getUniformLocation(program, 'uNext'),
    resolution: gl.getUniformLocation(program, 'uResolution'),
    currentSize: gl.getUniformLocation(program, 'uCurrentSize'),
    nextSize: gl.getUniformLocation(program, 'uNextSize'),
    pointer: gl.getUniformLocation(program, 'uPointer'),
    progress: gl.getUniformLocation(program, 'uProgress'),
    time: gl.getUniformLocation(program, 'uTime'),
    mode: gl.getUniformLocation(program, 'uMode')
  };
  gl.uniform1i(uniforms.current, 0);
  gl.uniform1i(uniforms.next, 1);

  var textures = [];
  var currentIndex = 0;
  var nextIndex = 1;
  var transitionStart = 0;
  var lastSceneAt = performance.now();
  var isTransitioning = false;
  var pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
  var frameId = 0;
  var lastFrame = 0;
  var particleContext = particleCanvas.getContext('2d');
  var particles = [];

  function makeTexture(scene) {
    return new Promise(function (resolve, reject) {
      var image = new Image();
      image.decoding = 'async';
      image.onload = function () {
        var texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
        resolve({ texture: texture, width: image.naturalWidth, height: image.naturalHeight });
      };
      image.onerror = function () { reject(new Error('Unable to load ' + scene.src)); };
      image.src = scene.src;
    });
  }

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, lowPower ? 1 : 1.5);
    var width = Math.max(1, Math.round(window.innerWidth * dpr));
    var height = Math.max(1, Math.round(window.innerHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      gl.viewport(0, 0, width, height);
    }

    var particleDpr = lowPower ? 1 : Math.min(window.devicePixelRatio || 1, 1.25);
    particleCanvas.width = Math.max(1, Math.round(window.innerWidth * particleDpr));
    particleCanvas.height = Math.max(1, Math.round(window.innerHeight * particleDpr));
    particleCanvas.style.width = window.innerWidth + 'px';
    particleCanvas.style.height = window.innerHeight + 'px';
    particleContext.setTransform(particleDpr, 0, 0, particleDpr, 0, 0);
    buildParticles();
  }

  function buildParticles() {
    var count = lowPower || window.innerWidth < 700 ? 24 : 52;
    particles = [];
    for (var index = 0; index < count; index++) {
      particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        radius: .35 + Math.random() * 1.25,
        speed: .06 + Math.random() * .16,
        drift: (Math.random() - .5) * .08,
        alpha: .08 + Math.random() * .32,
        phase: Math.random() * Math.PI * 2
      });
    }
  }

  function drawParticles(now) {
    if (reducedMotion) return;
    particleContext.clearRect(0, 0, window.innerWidth, window.innerHeight);
    particleContext.globalCompositeOperation = 'lighter';
    for (var index = 0; index < particles.length; index++) {
      var mote = particles[index];
      mote.y -= mote.speed;
      mote.x += mote.drift + Math.sin(now * .00024 + mote.phase) * .028;
      if (mote.y < -8) {
        mote.y = window.innerHeight + 8;
        mote.x = Math.random() * window.innerWidth;
      }
      if (mote.x < -8) mote.x = window.innerWidth + 8;
      if (mote.x > window.innerWidth + 8) mote.x = -8;
      var shimmer = .55 + Math.sin(now * .0011 + mote.phase) * .45;
      var gradient = particleContext.createRadialGradient(mote.x, mote.y, 0, mote.x, mote.y, mote.radius * 5);
      gradient.addColorStop(0, 'rgba(226,236,245,' + (mote.alpha * shimmer) + ')');
      gradient.addColorStop(1, 'rgba(226,236,245,0)');
      particleContext.fillStyle = gradient;
      particleContext.beginPath();
      particleContext.arc(mote.x, mote.y, mote.radius * 5, 0, Math.PI * 2);
      particleContext.fill();
    }
  }

  function bindTexture(unit, textureInfo) {
    gl.activeTexture(unit === 0 ? gl.TEXTURE0 : gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, textureInfo.texture);
  }

  function draw(now, forceProgress) {
    var current = textures[currentIndex];
    var next = textures[nextIndex] || current;
    if (!current || !next) return;

    pointer.x += (pointer.targetX - pointer.x) * .035;
    pointer.y += (pointer.targetY - pointer.y) * .035;

    var progress = typeof forceProgress === 'number' ? forceProgress : 0;
    if (isTransitioning) {
      var elapsed = now - transitionStart;
      var linear = Math.min(1, elapsed / transitionDuration);
      progress = linear * linear * (3 - 2 * linear);
      if (linear >= 1) finishTransition(now);
    }

    bindTexture(0, current);
    bindTexture(1, next);
    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
    gl.uniform2f(uniforms.currentSize, current.width, current.height);
    gl.uniform2f(uniforms.nextSize, next.width, next.height);
    gl.uniform2f(uniforms.pointer, pointer.x, pointer.y);
    gl.uniform1f(uniforms.progress, progress);
    gl.uniform1f(uniforms.time, now * .001);
    gl.uniform1f(uniforms.mode, scenes[nextIndex].transition);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function finishTransition(now) {
    currentIndex = nextIndex;
    nextIndex = (currentIndex + 1) % scenes.length;
    isTransitioning = false;
    lastSceneAt = now;
    root.style.setProperty('--cinematic-fallback', "url('" + scenes[currentIndex].src + "')");
    announceScene('transition');
  }

  function announceScene(source) {
    root.dataset.sceneIndex = String(currentIndex);
    root.dataset.sceneName = scenes[currentIndex].name;
    window.dispatchEvent(new CustomEvent('cinematic-scene-change', {
      detail: {
        index: currentIndex,
        name: scenes[currentIndex].name,
        source: source || 'api'
      }
    }));
  }

  function goToScene(index, source) {
    var normalized = (index + scenes.length) % scenes.length;
    if (!textures.length) return false;
    if (reducedMotion) {
      currentIndex = normalized;
      nextIndex = (currentIndex + 1) % scenes.length;
      root.style.backgroundImage = 'url("' + scenes[currentIndex].src + '")';
      draw(performance.now(), 0);
      announceScene(source || 'api');
      return true;
    }
    if (isTransitioning || normalized === currentIndex) return false;
    nextIndex = normalized;
    transitionStart = performance.now();
    isTransitioning = true;
    return true;
  }

  function nextScene(source) {
    return goToScene(currentIndex + 1, source || 'api');
  }

  function previousScene(source) {
    return goToScene(currentIndex - 1, source || 'api');
  }

  function exposeApi(api) {
    var fallbackApi = api || {
      nextScene: function () { return false; },
      previousScene: function () { return false; },
      goToScene: function () { return false; },
      getCurrentScene: function () { return { index: 0, name: scenes[0].name }; }
    };
    window.CinematicBackground = fallbackApi;
    window.nextScene = fallbackApi.nextScene;
    root.dataset.sceneApi = 'nextScene';
    root.dataset.motion = reducedMotion ? 'reduced' : 'full';
  }

  exposeApi({
    nextScene: nextScene,
    previousScene: previousScene,
    goToScene: goToScene,
    getCurrentScene: function () {
      return { index: currentIndex, name: scenes[currentIndex].name };
    },
    scenes: scenes.map(function (scene) { return scene.name; })
  });

  function frame(now) {
    if (document.hidden) {
      frameId = requestAnimationFrame(frame);
      return;
    }
    var minimumFrameTime = lowPower ? 1000 / 30 : 1000 / 60;
    if (now - lastFrame >= minimumFrameTime) {
      lastFrame = now;
      if (!isTransitioning && now - lastSceneAt >= sceneDuration) nextScene('auto');
      draw(now);
      drawParticles(now);
    }
    frameId = requestAnimationFrame(frame);
  }

  if (finePointer && !reducedMotion) {
    window.addEventListener('pointermove', function (event) {
      pointer.targetX = (event.clientX / Math.max(1, window.innerWidth) - .5) * 2;
      pointer.targetY = (.5 - event.clientY / Math.max(1, window.innerHeight)) * 2;
    }, { passive: true });
  }

  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('beforeunload', function () {
    cancelAnimationFrame(frameId);
  }, { once: true });

  resize();
  Promise.all(scenes.map(makeTexture)).then(function (loadedTextures) {
    textures = loadedTextures;
    root.classList.add('is-ready');
    draw(performance.now(), 0);
    announceScene('initial');
    if (!reducedMotion) frameId = requestAnimationFrame(frame);
  }).catch(function (error) {
    console.warn('[CinematicBackground] Image fallback:', error);
    root.classList.add('is-fallback');
  });
}());
