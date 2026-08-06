import { FilesetResolver, HandLandmarker } from './vendor/mediapipe/vision_bundle.mjs';

const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');
const activateButton = document.getElementById('activate');
const activateLabel = activateButton.querySelector('span');
const statusNode = document.getElementById('status');
const debugPanel = document.getElementById('debug');
const debugMode = document.getElementById('debug-mode');
const debugDetail = document.getElementById('debug-detail');

const TAU = Math.PI * 2;
const SYSTEM_REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const DEBUG = new URLSearchParams(location.search).has('debug');
const LABELS = {
  IDLE: '等待手势',
  MOVE: '移动',
  GUN: '手枪手势',
  FIRE: '开枪',
  MESSAGE: '欢迎回家'
};

if (DEBUG) {
  debugPanel.hidden = false;
  debugPanel.setAttribute('aria-hidden', 'false');
}

const state = {
  width: 0,
  height: 0,
  dpr: Math.min(devicePixelRatio || 1, 2),
  particles: [],
  mode: 'IDLE',
  gesture: 'NONE',
  gestureCandidate: 'NONE',
  candidateFrames: 0,
  candidateSince: 0,
  heartX: 0,
  heartY: 0,
  targetX: 0,
  targetY: 0,
  heartScale: 100,
  lockedX: 0,
  lockedY: 0,
  handSeenAt: 0,
  gunFrames: 0,
  gunArmed: false,
  gunArmedAt: 0,
  gunLastSeenAt: 0,
  gunMotion: [],
  liftProgress: 0,
  shotCooldownUntil: 0,
  explosionAt: 0,
  messageAt: 0,
  messageTargets: [],
  modelPhase: '等待手势模型',
  detectionTimer: 0,
  modelReady: false,
  cameraActive: false,
  cameraStarting: false,
  stream: null,
  video: null,
  handLandmarker: null,
  modelLoading: null,
  lastVideoTime: -1,
  lastDetectionAt: 0,
  debugOverrideUntil: 0,
  raf: 0,
  lastFrameAt: performance.now(),
  reducedTimer: 0
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, amount) {
  return a + (b - a) * amount;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
}

function angleAt(a, b, c) {
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const abz = (a.z || 0) - (b.z || 0);
  const cbx = c.x - b.x;
  const cby = c.y - b.y;
  const cbz = (c.z || 0) - (b.z || 0);
  const dot = abx * cbx + aby * cby + abz * cbz;
  const mag = Math.hypot(abx, aby, abz) * Math.hypot(cbx, cby, cbz);
  return Math.acos(clamp(dot / Math.max(.00001, mag), -1, 1)) * 180 / Math.PI;
}

function randomHeartPoint() {
  let x;
  let y;
  let equation;
  do {
    x = Math.random() * 3 - 1.5;
    y = Math.random() * 2.8 - 1.35;
    const base = x * x + y * y - 1;
    equation = base * base * base - x * x * y * y * y;
  } while (equation > 0);

  const edgeBias = .72 + Math.pow(Math.random(), .52) * .28;
  return {
    x: x * edgeBias,
    y: -y * edgeBias,
    z: (Math.random() - .5) * .72
  };
}

function makeParticle(index) {
  const heart = randomHeartPoint();
  const tone = Math.random();
  return {
    x: state.heartX,
    y: state.heartY,
    vx: 0,
    vy: 0,
    hx: heart.x,
    hy: heart.y,
    hz: heart.z,
    tx: 0,
    ty: 0,
    textParticle: false,
    messageGroup: 'ambient',
    previousX: state.heartX,
    previousY: state.heartY,
    fireDelay: 0,
    fireGravity: 0,
    fireLife: 1,
    fireSpeed: 0,
    fireCurl: 0,
    trail: false,
    size: .55 + Math.random() * 1.75,
    alpha: .38 + Math.random() * .6,
    phase: Math.random() * TAU,
    twinkle: .55 + Math.random() * 1.4,
    tone: tone > .88 ? 2 : tone > .34 ? 1 : 0,
    seed: (index * .61803398875) % 1
  };
}

function particleCount() {
  const shortSide = Math.min(state.width, state.height);
  if (shortSide < 520) return 2100;
  if ((navigator.deviceMemory || 4) <= 2) return 2350;
  return 3200;
}

function computeScale() {
  const shortSide = Math.min(state.width, state.height);
  return shortSide * (state.width < 700 ? .205 : .16);
}

function positionParticlesImmediately() {
  for (const particle of state.particles) {
    particle.x = state.heartX + particle.hx * state.heartScale;
    particle.y = state.heartY + particle.hy * state.heartScale;
    particle.vx = 0;
    particle.vy = 0;
  }
}

function resize() {
  state.width = innerWidth;
  state.height = innerHeight;
  state.dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(state.width * state.dpr);
  canvas.height = Math.round(state.height * state.dpr);
  canvas.style.width = `${state.width}px`;
  canvas.style.height = `${state.height}px`;
  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

  const firstLayout = state.heartX === 0 && state.heartY === 0;
  state.heartScale = computeScale();
  if (firstLayout) {
    state.heartX = state.targetX = state.width * .5;
    state.heartY = state.targetY = state.height * .5;
  } else {
    state.heartX = state.targetX = clamp(state.heartX, state.heartScale * .35, state.width - state.heartScale * .35);
    state.heartY = state.targetY = clamp(state.heartY, state.heartScale * .35, state.height - state.heartScale * .35);
  }

  const count = particleCount();
  if (state.particles.length < count) {
    const start = state.particles.length;
    for (let index = start; index < count; index++) state.particles.push(makeParticle(index));
  } else if (state.particles.length > count) {
    state.particles.length = count;
  }

  if (firstLayout || SYSTEM_REDUCED) positionParticlesImmediately();
  if (state.mode === 'MESSAGE') buildMessageTargets();
}

function heartbeatWave(now, fast) {
  const bpm = fast ? 146 : 64;
  const phase = (now / 1000 * bpm / 60) % 1;
  const first = Math.exp(-Math.pow((phase - .06) / .055, 2));
  const second = Math.exp(-Math.pow((phase - .23) / .075, 2));
  return first + second * .5;
}

function drawHeart(now, dt) {
  const fastBeat = state.mode === 'GUN';
  const amplitude = fastBeat ? .068 : .007;
  const scale = state.heartScale * (1 + heartbeatWave(now, fastBeat) * amplitude);
  const rotation = state.mode === 'MOVE' ? (state.targetX - state.heartX) / Math.max(1, state.width) * .25 : 0;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const spring = state.mode === 'MOVE' ? .075 : .055;
  const drag = Math.pow(.82, dt);

  state.heartX += (state.targetX - state.heartX) * Math.min(1, .22 * dt);
  state.heartY += (state.targetY - state.heartY) * Math.min(1, .22 * dt);

  ctx.globalCompositeOperation = 'lighter';
  for (let index = 0; index < state.particles.length; index++) {
    const particle = state.particles[index];
    const localX = particle.hx * scale;
    const localZ = particle.hz * scale * .35;
    const rotatedX = localX * cos + localZ * sin;
    const depth = -localX * sin + localZ * cos;
    const perspective = 360 / Math.max(280, 360 - depth);
    const targetX = state.heartX + rotatedX * perspective;
    const targetY = state.heartY + particle.hy * scale * perspective;

    particle.vx += (targetX - particle.x) * spring * dt;
    particle.vy += (targetY - particle.y) * spring * dt;
    particle.vx *= drag;
    particle.vy *= drag;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;

    drawParticle(particle, now, perspective, .94);
  }
}

function drawExplosion(now, dt) {
  const elapsed = now - state.explosionAt;
  ctx.globalCompositeOperation = 'lighter';

  for (const particle of state.particles) {
    const activeFor = elapsed - particle.fireDelay;
    if (activeFor <= 0) {
      const gather = 1 - clamp(elapsed / Math.max(1, particle.fireDelay), 0, 1);
      particle.x = lerp(particle.x, state.heartX, .018 * dt * gather);
      particle.y = lerp(particle.y, state.heartY, .018 * dt * gather);
      drawParticle(particle, now, 1, .95);
      continue;
    }

    particle.previousX = particle.x;
    particle.previousY = particle.y;
    const age = clamp(activeFor / particle.fireLife, 0, 1);
    const drag = Math.pow(.991 - age * .003, dt);
    particle.vx *= drag;
    particle.vy *= drag;
    const curl = particle.fireCurl * dt;
    const curledX = particle.vx * Math.cos(curl) - particle.vy * Math.sin(curl);
    const curledY = particle.vx * Math.sin(curl) + particle.vy * Math.cos(curl);
    particle.vx = curledX;
    particle.vy = curledY;
    particle.vy += particle.fireGravity * dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;

    if (particle.trail && activeFor < particle.fireLife * .82) {
      const trailAlpha = (1 - age) * particle.alpha * .34;
      ctx.strokeStyle = `rgba(218, 226, 231, ${trailAlpha})`;
      ctx.lineWidth = Math.max(.45, particle.size * .58);
      ctx.beginPath();
      ctx.moveTo(particle.previousX, particle.previousY);
      ctx.lineTo(particle.x, particle.y);
      ctx.stroke();
    }

    drawParticle(particle, now, 1, lerp(1.34, .42, age));
  }

  if (elapsed > 4300) enterMessage(now);
}

function drawMessage(now, dt) {
  const elapsed = now - state.messageAt;
  const settle = clamp(elapsed / 1500, 0, 1);
  const spring = lerp(.018, .065, settle);
  const drag = Math.pow(lerp(.94, .84, settle), dt);
  ctx.globalCompositeOperation = 'lighter';

  for (const particle of state.particles) {
    if (particle.textParticle) {
      particle.vx += (particle.tx - particle.x) * spring * dt;
      particle.vy += (particle.ty - particle.y) * spring * dt;
      particle.vx *= drag;
      particle.vy *= drag;
    } else {
      particle.vx *= Math.pow(.985, dt);
      particle.vy *= Math.pow(.985, dt);
    }
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    const groupIntensity = particle.messageGroup === 'pig' ? 1.42 : 1.28;
    drawParticle(particle, now, 1, particle.textParticle ? groupIntensity : .26);
  }
}

function drawParticle(particle, now, perspective, intensity) {
  const shimmer = .72 + Math.sin(now * .0017 * particle.twinkle + particle.phase) * .22;
  const alpha = clamp(particle.alpha * shimmer * intensity, .08, 1);
  const size = Math.max(.65, particle.size * perspective * (intensity > 1 ? 1.12 : 1));

  if (particle.tone === 0) ctx.fillStyle = `rgba(183, 191, 197, ${alpha})`;
  else if (particle.tone === 1) ctx.fillStyle = `rgba(222, 227, 230, ${alpha})`;
  else ctx.fillStyle = `rgba(245, 247, 248, ${alpha})`;

  if (size > 1.35) {
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, size, 0, TAU);
    ctx.fill();
  } else {
    ctx.fillRect(particle.x, particle.y, size, size);
  }
}

function frame(now) {
  const dt = Math.min(1.8, (now - state.lastFrameAt) / 16.667 || 1);
  state.lastFrameAt = now;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = state.mode === 'FIRE' || state.mode === 'MESSAGE'
    ? 'rgba(2, 3, 4, .13)'
    : 'rgba(2, 3, 4, .38)';
  ctx.fillRect(0, 0, state.width, state.height);

  if (state.mode === 'FIRE') drawExplosion(now, dt);
  else if (state.mode === 'MESSAGE') drawMessage(now, dt);
  else drawHeart(now, dt);

  const essentialMotion = state.cameraActive || state.mode === 'FIRE' || state.mode === 'MESSAGE';
  if (!SYSTEM_REDUCED || essentialMotion) {
    state.raf = requestAnimationFrame(frame);
  } else {
    state.reducedTimer = setTimeout(() => {
      state.raf = requestAnimationFrame(frame);
    }, 120);
  }
}

function mapHandToScreen(landmarks) {
  const palmIds = [0, 5, 9, 13, 17];
  let x = 0;
  let y = 0;
  for (const id of palmIds) {
    x += landmarks[id].x;
    y += landmarks[id].y;
  }
  x = 1 - x / palmIds.length;
  y /= palmIds.length;

  const marginX = Math.min(state.heartScale * 1.35, state.width * .22);
  const marginY = Math.min(state.heartScale * 1.25, state.height * .22);
  const screenX = lerp(marginX, state.width - marginX, clamp((x - .04) / .92, 0, 1));
  const screenY = lerp(marginY, state.height - marginY, clamp((y - .04) / .92, 0, 1));
  const gap = Math.hypot(screenX - state.targetX, screenY - state.targetY);

  if (gap < 2.4) return;
  const adaptive = clamp(.2 + gap / Math.max(state.width, state.height) * 1.4, .2, .46);
  state.targetX = lerp(state.targetX, screenX, adaptive);
  state.targetY = lerp(state.targetY, screenY, adaptive);
}

function classifyHand(landmarks) {
  const wrist = landmarks[0];
  const handScale = Math.max(.001, distance(landmarks[5], landmarks[17]));

  const finger = (mcp, pip, dip, tip) => {
    const pipAngle = angleAt(landmarks[mcp], landmarks[pip], landmarks[dip]);
    const dipAngle = angleAt(landmarks[pip], landmarks[dip], landmarks[tip]);
    const extension = distance(landmarks[tip], wrist) / Math.max(.001, distance(landmarks[pip], wrist));
    return {
      extended: pipAngle > 138 && dipAngle > 132 && extension > 1.08,
      curled: pipAngle < 142 || dipAngle < 145 || extension < 1.08,
      pipAngle,
      dipAngle,
      extension
    };
  };

  const index = finger(5, 6, 7, 8);
  const middle = finger(9, 10, 11, 12);
  const ring = finger(13, 14, 15, 16);
  const pinky = finger(17, 18, 19, 20);
  const thumbAngle = angleAt(landmarks[2], landmarks[3], landmarks[4]);
  const thumbRatio = distance(landmarks[4], landmarks[5]) / handScale;
  const thumbExtended = thumbAngle > 126 && thumbRatio > .5;
  const thumbFolded = thumbAngle < 128 || thumbRatio < .45;
  const curledCount = [middle, ring, pinky].filter(fingerState => fingerState.curled).length;
  const otherThreeCurled = curledCount >= 2;
  const openPalm = index.extended && middle.extended && ring.extended && pinky.extended;
  const pointing = index.extended && otherThreeCurled && !thumbExtended;
  const gun = index.extended && otherThreeCurled && thumbExtended && !middle.extended;

  return {
    gesture: gun ? 'GUN' : 'MOVE',
    openPalm,
    pointing,
    gun,
    thumbExtended,
    thumbFolded,
    thumbRatio,
    indexExtended: index.extended,
    otherThreeCurled
  };
}

function updateGesture(landmarks, now) {
  if (state.mode === 'FIRE' || state.mode === 'MESSAGE') return;
  const pose = classifyHand(landmarks);
  state.handSeenAt = now;
  const palmY = (landmarks[0].y + landmarks[5].y + landmarks[9].y + landmarks[13].y + landmarks[17].y) / 5;

  if (pose.gun) {
    if (state.gestureCandidate !== 'GUN') {
      state.gestureCandidate = 'GUN';
      state.candidateSince = now;
      state.gunFrames = 0;
      state.gunMotion = [];
    }
    state.gunFrames++;
    state.gunLastSeenAt = now;

    if (now - state.candidateSince >= 180 && !state.gunArmed) {
      state.gunArmed = true;
      state.gunArmedAt = now;
      state.lockedX = state.heartX;
      state.lockedY = state.heartY;
      state.gunMotion = [{ y: palmY, time: now }];
    }

    if (state.gunArmed) {
      state.mode = 'GUN';
      state.gesture = 'GUN';
      state.targetX = state.lockedX;
      state.targetY = state.lockedY;
      state.gunMotion.push({ y: palmY, time: now });
      state.gunMotion = state.gunMotion.filter(sample => now - sample.time <= 700);
    } else {
      state.mode = 'MOVE';
      state.gesture = 'MOVE';
      mapHandToScreen(landmarks);
    }

    if (state.gunArmed && now > state.gunArmedAt + 180 && now > state.shotCooldownUntil) {
      const baseline = state.gunMotion.find(sample => now - sample.time >= 160) || state.gunMotion[0];
      const elapsedSeconds = Math.max(.08, (now - baseline.time) / 1000);
      const upwardTravel = baseline.y - palmY;
      const upwardSpeed = upwardTravel / elapsedSeconds;
      state.liftProgress = clamp(upwardTravel / .06, 0, 1);
      if (upwardTravel > .06 && upwardSpeed > .11) {
        beginExplosion(now);
        return;
      }
    }
  } else {
    state.gestureCandidate = 'MOVE';
    state.candidateSince = now;
    if (state.gunArmed && now - state.gunLastSeenAt <= 220) {
      state.mode = 'GUN';
      state.gesture = 'GUN';
      state.targetX = state.lockedX;
      state.targetY = state.lockedY;
    } else {
      state.gunFrames = 0;
      state.gunArmed = false;
      state.gunMotion = [];
      state.liftProgress = 0;
      state.mode = 'MOVE';
      state.gesture = 'MOVE';
      mapHandToScreen(landmarks);
    }
  }

  updateDebug(pose);
}

function beginExplosion(now = performance.now()) {
  if (state.mode === 'FIRE' || state.mode === 'MESSAGE') return;
  state.mode = 'FIRE';
  state.gesture = 'SHOT';
  state.explosionAt = now;
  state.shotCooldownUntil = now + 6000;
  state.gunArmed = false;
  state.gunMotion = [];
  state.liftProgress = 0;

  const speedBase = Math.min(state.width, state.height) * .0055;
  for (let index = 0; index < state.particles.length; index++) {
    const particle = state.particles[index];
    const dx = particle.x - state.heartX;
    const dy = particle.y - state.heartY;
    const length = Math.max(1, Math.hypot(dx, dy));
    const wave = index % 4;
    const spread = (Math.random() - .5) * (1.2 + wave * .08);
    const cos = Math.cos(spread);
    const sin = Math.sin(spread);
    const nx = dx / length;
    const ny = dy / length;
    const rx = nx * cos - ny * sin;
    const ry = nx * sin + ny * cos;
    const speed = speedBase * (.72 + Math.random() * 1.52 + wave * .1);
    particle.vx = rx * speed + (Math.random() - .5) * speedBase * .42;
    particle.vy = ry * speed - speedBase * (.08 + Math.random() * .16);
    particle.previousX = particle.x;
    particle.previousY = particle.y;
    particle.fireDelay = wave * 215 + Math.random() * 190;
    particle.fireGravity = speedBase * (.006 + Math.random() * .008);
    particle.fireLife = 2850 + Math.random() * 920;
    particle.fireSpeed = speed;
    particle.fireCurl = (Math.random() - .5) * .0028;
    particle.trail = Math.random() > .2;
    particle.textParticle = false;
    particle.messageGroup = 'ambient';
  }

  statusNode.textContent = '开枪成功，光粒子正在全屏绽放';
  updateDebug();
}

function drawSpacedText(context, text, centerX, y, spacing) {
  const widths = [...text].map(character => context.measureText(character).width);
  const totalWidth = widths.reduce((sum, width) => sum + width, 0) + spacing * Math.max(0, text.length - 1);
  let cursor = centerX - totalWidth / 2;
  [...text].forEach((character, index) => {
    context.fillText(character, cursor + widths[index] / 2, y);
    cursor += widths[index] + spacing;
  });
}

function drawPigMark(context, centerX, centerY, radius) {
  context.save();
  context.strokeStyle = '#f3f5f6';
  context.fillStyle = '#f3f5f6';
  context.lineWidth = Math.max(5, radius * .095);
  context.lineCap = 'round';
  context.lineJoin = 'round';

  context.beginPath();
  context.moveTo(centerX - radius * .64, centerY - radius * .58);
  context.lineTo(centerX - radius * .91, centerY - radius * 1.03);
  context.lineTo(centerX - radius * .24, centerY - radius * .78);
  context.moveTo(centerX + radius * .64, centerY - radius * .58);
  context.lineTo(centerX + radius * .91, centerY - radius * 1.03);
  context.lineTo(centerX + radius * .24, centerY - radius * .78);
  context.stroke();

  context.beginPath();
  context.ellipse(centerX, centerY, radius, radius * .82, 0, 0, TAU);
  context.stroke();

  context.beginPath();
  context.arc(centerX - radius * .34, centerY - radius * .1, radius * .075, 0, TAU);
  context.arc(centerX + radius * .34, centerY - radius * .1, radius * .075, 0, TAU);
  context.fill();

  context.beginPath();
  context.ellipse(centerX, centerY + radius * .32, radius * .46, radius * .27, 0, 0, TAU);
  context.stroke();
  context.beginPath();
  context.arc(centerX - radius * .17, centerY + radius * .32, radius * .055, 0, TAU);
  context.arc(centerX + radius * .17, centerY + radius * .32, radius * .055, 0, TAU);
  context.fill();
  context.restore();
}

function buildMessageTargets() {
  const textCanvas = document.createElement('canvas');
  const textCtx = textCanvas.getContext('2d', { willReadFrequently: true });
  textCanvas.width = state.width;
  textCanvas.height = state.height;
  textCtx.clearRect(0, 0, state.width, state.height);
  textCtx.fillStyle = '#e3e7e9';
  textCtx.textAlign = 'center';
  textCtx.textBaseline = 'middle';

  const compact = state.width < 700;
  const pigRadius = Math.min(state.width * (compact ? .12 : .082), state.height * .135);
  const pigY = state.height * (compact ? .27 : .29);
  drawPigMark(textCtx, state.width / 2, pigY, pigRadius);

  const smallSize = Math.floor(Math.min(state.height * .045, state.width * .055));
  textCtx.font = `400 ${smallSize}px "FangSong", "STFangsong", "Songti SC", "SimSun", serif`;
  textCtx.globalAlpha = .8;
  drawSpacedText(textCtx, '小猪', state.width / 2, state.height * .49, smallSize * .78);

  const mainSize = Math.floor(Math.min(state.height * .115, state.width / (compact ? 5.7 : 7.1)));
  textCtx.font = `500 ${mainSize}px "FangSong", "STFangsong", "Songti SC", "SimSun", serif`;
  textCtx.globalAlpha = 1;
  drawSpacedText(textCtx, '欢迎回家', state.width / 2, state.height * .63, mainSize * .18);

  const pixels = textCtx.getImageData(0, 0, state.width, state.height).data;
  const step = state.width < 700 ? 4 : 5;
  const points = [];
  for (let y = 0; y < state.height; y += step) {
    for (let x = 0; x < state.width; x += step) {
      if (pixels[(y * state.width + x) * 4 + 3] > 90) points.push({ x, y });
    }
  }

  for (let index = points.length - 1; index > 0; index--) {
    const target = Math.floor(Math.random() * (index + 1));
    [points[index], points[target]] = [points[target], points[index]];
  }

  const textCount = Math.floor(state.particles.length * .96);
  state.messageTargets = points;
  for (let index = 0; index < state.particles.length; index++) {
    const particle = state.particles[index];
    particle.textParticle = index < textCount && points.length > 0;
    if (particle.textParticle) {
      const point = points[index % points.length];
      particle.tx = point.x + (Math.random() - .5) * 1.8;
      particle.ty = point.y + (Math.random() - .5) * 1.8;
      particle.messageGroup = point.y < state.height * .43 ? 'pig' : 'text';
    } else {
      particle.messageGroup = 'ambient';
    }
  }
}

function enterMessage(now) {
  state.mode = 'MESSAGE';
  state.messageAt = now;
  buildMessageTargets();
  statusNode.textContent = '小猪欢迎回家';
  updateDebug();
  // 粒子聚合为"小猪 欢迎回家"后再停留片刻，自动进入主站
  clearTimeout(state.enterTimer);
  state.enterTimer = setTimeout(() => {
    window.location.href = 'home.html';
  }, 5600);
}

function updateDebug(pose) {
  if (!DEBUG) return;
  debugMode.textContent = LABELS[state.mode] || state.mode;
  if (pose) {
    const lift = Math.round(state.liftProgress * 100);
    debugDetail.textContent = `${pose.gun ? '手枪' : '普通手'} · ${state.gunArmed ? '已锁定' : '跟随中'} · 抬手 ${lift}%`;
  } else {
    debugDetail.textContent = state.modelReady
      ? (state.cameraActive ? '模型就绪 · 摄像头画面隐藏' : '模型就绪 · 等待摄像头')
      : state.modelPhase;
  }
}

function resetLostHand(now = performance.now()) {
  if (now - state.handSeenAt <= 320) return;
  state.gesture = 'NONE';
  state.gestureCandidate = 'NONE';
  state.candidateFrames = 0;
  state.candidateSince = 0;
  state.gunFrames = 0;
  state.gunArmed = false;
  state.gunMotion = [];
  state.liftProgress = 0;
  if (state.mode !== 'FIRE' && state.mode !== 'MESSAGE') state.mode = 'IDLE';
  updateDebug();
}

async function initializeRecognition() {
  if (state.handLandmarker) return state.handLandmarker;
  if (state.modelLoading) return state.modelLoading;

  state.modelPhase = '正在加载本地手势模型';
  updateDebug();
  state.modelLoading = (async () => {
    const wasmRoot = new URL('./vendor/mediapipe/wasm', import.meta.url).href;
    const modelPath = new URL('./models/hand_landmarker.task', import.meta.url).href;
    const vision = await FilesetResolver.forVisionTasks(wasmRoot);
    const options = {
      baseOptions: { modelAssetPath: modelPath, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numHands: 1,
      minHandDetectionConfidence: .68,
      minHandPresenceConfidence: .64,
      minTrackingConfidence: .68
    };

    try {
      state.handLandmarker = await HandLandmarker.createFromOptions(vision, options);
    } catch {
      options.baseOptions.delegate = 'CPU';
      state.handLandmarker = await HandLandmarker.createFromOptions(vision, options);
    }

    state.modelReady = true;
    state.modelPhase = '模型就绪';
    statusNode.textContent = '体感已连接，摄像头画面隐藏并仅在本机分析';
    updateDebug();
    if (state.cameraActive) detectHands();
    return state.handLandmarker;
  })();

  try {
    return await state.modelLoading;
  } catch (error) {
    state.modelLoading = null;
    state.modelReady = false;
    activateButton.hidden = false;
    statusNode.textContent = '手势模型加载失败，请点击重试';
    if (DEBUG) debugDetail.textContent = `模型错误：${error.message}`;
    throw error;
  }
}

async function startCamera() {
  if (!window.isSecureContext) {
    statusNode.textContent = '请通过 HTTPS 或 localhost 打开页面';
    activateButton.hidden = false;
    return;
  }

  if (state.cameraActive || state.cameraStarting) return;
  state.cameraStarting = true;
  activateButton.disabled = true;
  activateLabel.textContent = '正在连接';
  if (!state.modelReady) statusNode.textContent = '正在准备本地手势识别';

  try {
    state.stream?.getTracks().forEach(track => track.stop());
    state.stream = null;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: 320, max: 424 },
        height: { ideal: 240, max: 320 },
        frameRate: { ideal: 15, max: 20 }
      }
    });

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();

    state.stream = stream;
    state.video = video;
    state.cameraActive = true;
    const videoTrack = stream.getVideoTracks()[0];
    videoTrack?.addEventListener('ended', () => {
      state.cameraActive = false;
      clearTimeout(state.detectionTimer);
      activateLabel.textContent = '重新连接体感';
      activateButton.hidden = false;
      statusNode.textContent = '摄像头连接已中断';
      updateDebug();
    }, { once: true });
    state.cameraStarting = false;
    activateButton.disabled = false;
    activateLabel.textContent = '启用体感';
    activateButton.hidden = true;
    statusNode.textContent = '体感已连接，摄像头画面隐藏并仅在本机分析';
    updateDebug();
    setTimeout(() => initializeRecognition().catch(() => {}), 180);
  } catch (error) {
    state.cameraStarting = false;
    state.cameraActive = false;
    activateButton.disabled = false;
    activateButton.hidden = false;
    activateLabel.textContent = error?.name === 'NotAllowedError'
      ? '允许摄像头'
      : error?.name === 'NotReadableError'
        ? '摄像头被占用'
        : '重试体感';
    statusNode.textContent = error?.name === 'NotAllowedError'
      ? '需要摄像头权限才能识别手势'
      : '摄像头连接失败，请点击重试';
    updateDebug();
    if (DEBUG) debugDetail.textContent = `摄像头错误：${error?.name || 'UnknownError'} · ${error?.message || '无法连接'}`;
  }
}

async function detectHands() {
  clearTimeout(state.detectionTimer);
  if (!state.cameraActive || !state.video || !state.handLandmarker) return;

  const now = performance.now();
  const hasNewFrame = state.video.readyState >= 2 && state.video.currentTime !== state.lastVideoTime;
  let inferenceTime = 0;
  if (hasNewFrame && now - state.lastDetectionAt >= 86) {
    state.lastVideoTime = state.video.currentTime;
    state.lastDetectionAt = now;
    try {
      const startedAt = performance.now();
      const result = state.handLandmarker.detectForVideo(state.video, now);
      inferenceTime = performance.now() - startedAt;
      const finishedAt = performance.now();
      if (!(DEBUG && finishedAt < state.debugOverrideUntil)) {
        if (result.landmarks?.[0]) updateGesture(result.landmarks[0], finishedAt);
        else resetLostHand(finishedAt);
      }
    } catch (error) {
      if (DEBUG) debugDetail.textContent = `识别错误：${error.message}`;
    }
  }

  const nextDelay = clamp(70 + inferenceTime, 86, 190);
  state.detectionTimer = setTimeout(detectHands, nextDelay);
}

async function initializeTracking() {
  try {
    await startCamera();
  } catch (error) {
    activateButton.hidden = false;
    statusNode.textContent = '摄像头需要手动启用';
    if (DEBUG) debugDetail.textContent = `摄像头：${error.message}`;
  }
}

activateButton.addEventListener('click', async () => {
  await startCamera();
  if (state.cameraActive && !state.modelReady) initializeRecognition().catch(() => {});
});

if (DEBUG) {
  globalThis.__heartSenseDebug = { classifyHand, updateGesture, state };
  addEventListener('pointermove', event => {
    if (state.mode === 'FIRE' || state.mode === 'MESSAGE') return;
    state.debugOverrideUntil = performance.now() + 1200;
    state.mode = 'MOVE';
    state.targetX = event.clientX;
    state.targetY = event.clientY;
    updateDebug();
  });
  addEventListener('keydown', event => {
    if (event.key.toLowerCase() === 'g' && state.mode !== 'FIRE' && state.mode !== 'MESSAGE') {
      state.debugOverrideUntil = performance.now() + 1800;
      state.mode = 'GUN';
      updateDebug();
    }
    if (event.code === 'Space' || event.key.toLowerCase() === 'f') {
      event.preventDefault();
      beginExplosion();
    }
  });
}

addEventListener('resize', resize, { passive: true });
addEventListener('beforeunload', () => {
  state.stream?.getTracks().forEach(track => track.stop());
  state.handLandmarker?.close?.();
  cancelAnimationFrame(state.raf);
  clearTimeout(state.detectionTimer);
  clearTimeout(state.reducedTimer);
  clearTimeout(state.enterTimer);
});

resize();
positionParticlesImmediately();
frame(performance.now());
initializeTracking();

if (DEBUG && new URLSearchParams(location.search).get('demo') === 'fire') {
  setTimeout(() => beginExplosion(), 900);
}
