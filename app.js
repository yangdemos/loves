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
const GUN_LOCK_GRACE = 560;
const HOME_ENTRY_DELAY = SYSTEM_REDUCED ? 1800 : 3400;
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
  heartVelocityX: 0,
  heartVelocityY: 0,
  movementEnergy: 0,
  particleScaleX: 1,
  particleScaleY: 1,
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
  homeTransitionStarted: false,
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
    flow: .72 + Math.random() * .7,
    lag: .28 + Math.random() * .72,
    orbitDirection: Math.random() < .5 ? -1 : 1,
    lastBeat: 0,
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
  state.particleScaleX = 1;
  state.particleScaleY = 1;
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
  const bpm = fast ? 118 : 62;
  const phase = (now / 1000 * bpm / 60) % 1;
  const contraction = Math.exp(-Math.pow((phase - .09) / .062, 2));
  const firstRelease = Math.exp(-Math.pow((phase - .23) / .082, 2));
  const recoil = Math.exp(-Math.pow((phase - .38) / .068, 2));
  const secondRelease = Math.exp(-Math.pow((phase - .5) / .105, 2));
  return -contraction * .72 + firstRelease * 1.16 - recoil * .2 + secondRelease * .58;
}

function breathingWave(now) {
  const primary = Math.sin(now * .00145 - .8);
  const secondary = Math.sin(now * .00073 + 1.4) * .28;
  return primary * .72 + secondary;
}

function drawHeart(now, dt) {
  const fastBeat = state.mode === 'GUN' || state.gunArmed;
  // Heartbeat is essential gesture feedback, so reduced-motion softens it
  // instead of disabling the lock confirmation entirely.
  const motionAmount = SYSTEM_REDUCED ? .58 : 1;
  const beat = heartbeatWave(now, fastBeat);
  const breath = breathingWave(now);
  const beatAmplitude = (fastBeat ? .15 : .016) * motionAmount;
  const breathAmplitude = (fastBeat ? .018 : .026) * motionAmount;
  const beatLift = beat * beatAmplitude;
  const breathLift = breath * breathAmplitude;
  const nextScaleX = 1 + beatLift + breathLift;
  const nextScaleY = 1 + beatLift * 1.08 + breathLift * 1.16;
  const particleScaleRatioX = clamp(nextScaleX / Math.max(.001, state.particleScaleX), .9, 1.11);
  const particleScaleRatioY = clamp(nextScaleY / Math.max(.001, state.particleScaleY), .9, 1.11);
  const scaleX = state.heartScale * nextScaleX;
  const scaleY = state.heartScale * nextScaleY;
  const rotation = state.mode === 'MOVE' ? (state.targetX - state.heartX) / Math.max(1, state.width) * .25 : 0;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const spring = state.mode === 'MOVE' ? .105 : .082;
  const drag = Math.pow(state.mode === 'MOVE' ? .79 : .805, dt);

  const previousHeartX = state.heartX;
  const previousHeartY = state.heartY;
  state.heartX += (state.targetX - state.heartX) * Math.min(1, .22 * dt);
  state.heartY += (state.targetY - state.heartY) * Math.min(1, .22 * dt);
  const centerDeltaX = state.heartX - previousHeartX;
  const centerDeltaY = state.heartY - previousHeartY;
  state.heartVelocityX = lerp(state.heartVelocityX, centerDeltaX / Math.max(.3, dt), .18);
  state.heartVelocityY = lerp(state.heartVelocityY, centerDeltaY / Math.max(.3, dt), .18);
  const currentEnergy = Math.hypot(state.heartVelocityX, state.heartVelocityY);
  state.movementEnergy = lerp(state.movementEnergy, clamp(currentEnergy / 7, 0, 1), .12);

  ctx.globalCompositeOperation = 'lighter';
  for (let index = 0; index < state.particles.length; index++) {
    const particle = state.particles[index];
    // Each point follows the hand at a slightly different rate. The uneven
    // carry is what makes the heart feel fluid instead of like one rigid decal.
    const moving = state.mode === 'MOVE';
    const carry = moving ? .34 + particle.lag * .5 : .94;
    particle.x += centerDeltaX * carry;
    particle.y += centerDeltaY * carry;
    particle.x = state.heartX + (particle.x - state.heartX) * particleScaleRatioX;
    particle.y = state.heartY + (particle.y - state.heartY) * particleScaleRatioY;

    if (moving) {
      const wake = (.055 + Math.abs(particle.hz) * .105) * (.72 + particle.seed * .56);
      particle.vx -= centerDeltaX * wake;
      particle.vy -= centerDeltaY * wake;
    }

    const localX = particle.hx * scaleX;
    const localY = particle.hy * scaleY;
    const localZ = particle.hz * scaleX * .35;
    const rotatedX = localX * cos + localZ * sin;
    const depth = -localX * sin + localZ * cos;
    const perspective = 360 / Math.max(280, 360 - depth);
    const baseLength = Math.max(.05, Math.hypot(particle.hx, particle.hy));
    const radialX = particle.hx / baseLength;
    const radialY = particle.hy / baseLength;
    const tangentX = -radialY * particle.orbitDirection;
    const tangentY = radialX * particle.orbitDirection;

    // A delayed beat travels through the cloud, so neighbouring particles do
    // not contract at exactly the same instant.
    const particleBeat = heartbeatWave(
      now - particle.seed * (fastBeat ? 78 : 135) - Math.abs(particle.hz) * 36,
      fastBeat
    );
    const beatDelta = particleBeat - particle.lastBeat;
    particle.lastBeat = particleBeat;
    const beatRipple = particleBeat * state.heartScale * (fastBeat ? .042 : .009) * motionAmount;
    const breathRipple = breath * state.heartScale * .007 * (.55 + particle.seed * .55) * motionAmount;

    const flowPhase = now * .0017 * particle.flow + particle.phase + particle.hz * 1.8;
    const orbit = Math.sin(flowPhase) + Math.sin(flowPhase * .47 + particle.seed * 5.2) * .34;
    const flowStrength = ((fastBeat ? 2.8 : 2.05) + state.movementEnergy * 3.5) * motionAmount;
    const shimmerX = Math.cos(now * .00105 * particle.twinkle + particle.phase) * .9 * motionAmount;
    const shimmerY = Math.sin(now * .00122 * particle.twinkle - particle.phase) * .72 * motionAmount;

    const speedLength = Math.max(.001, Math.hypot(state.heartVelocityX, state.heartVelocityY));
    const motionNormalX = -state.heartVelocityY / speedLength;
    const motionNormalY = state.heartVelocityX / speedLength;
    const sideFlow = Math.sin(now * .003 + particle.phase * 1.7) * state.movementEnergy * (1.8 + Math.abs(particle.hz) * 3.4);

    const livingX = tangentX * orbit * flowStrength
      + radialX * (beatRipple + breathRipple)
      + motionNormalX * sideFlow
      + shimmerX;
    const livingY = tangentY * orbit * flowStrength
      + radialY * (beatRipple + breathRipple)
      + motionNormalY * sideFlow
      + shimmerY;
    const targetX = state.heartX + rotatedX * perspective + livingX;
    const targetY = state.heartY + localY * perspective + livingY;

    const particleSpring = spring * (.82 + particle.lag * .4);
    const particleDrag = Math.pow(drag, .84 + particle.seed * .3);
    particle.vx += (targetX - particle.x) * particleSpring * dt;
    particle.vy += (targetY - particle.y) * particleSpring * dt;
    particle.vx += radialX * beatDelta * (fastBeat ? 1.45 : .24) * motionAmount;
    particle.vy += radialY * beatDelta * (fastBeat ? 1.45 : .24) * motionAmount;
    particle.vx *= particleDrag;
    particle.vy *= particleDrag;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;

    const depthTrail = state.mode === 'MOVE'
      ? (.2 + Math.abs(particle.hz) * .42) * (1 - particle.seed * .28)
      : 0;
    const renderX = particle.x - state.heartVelocityX * depthTrail;
    const renderY = particle.y - state.heartVelocityY * depthTrail;
    const expansion = Math.max(0, beat);
    const contraction = Math.max(0, -beat);
    const intensity = .88 + expansion * (fastBeat ? .9 : .18) + contraction * .24 + (breath + 1) * .03;
    const sizeBoost = 1
      + expansion * (fastBeat ? .24 : .045)
      + contraction * .06
      + state.movementEnergy * .065
      + Math.abs(particleBeat - beat) * (fastBeat ? .055 : .018);

    drawParticle(particle, now, perspective, intensity, renderX, renderY, sizeBoost);
  }

  state.particleScaleX = nextScaleX;
  state.particleScaleY = nextScaleY;
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
    const groupIntensity = particle.messageGroup === 'pig' ? 1.5 : .26;
    drawParticle(
      particle,
      now,
      1,
      particle.textParticle ? groupIntensity : .26,
      particle.x,
      particle.y,
      particle.textParticle ? 1.1 : 1
    );
  }

  drawFinalTitle(now);

  if (elapsed >= HOME_ENTRY_DELAY) enterHome();
}

function enterHome() {
  if (state.homeTransitionStarted) return;
  state.homeTransitionStarted = true;
  statusNode.textContent = '正在进入网站';
  window.location.assign('home.html');
}

function getMessageLayout() {
  const compact = state.width < 700;
  const pigRadius = Math.min(
    state.width * (compact ? .2325 : .1425),
    state.height * (compact ? .135 : .2025)
  );
  return {
    compact,
    pigRadius,
    pigX: state.width / 2,
    pigY: state.height * (compact ? .34 : .37),
    textX: state.width / 2,
    smallSize: Math.floor(Math.min(state.height * .041, state.width * (compact ? .064 : .03))),
    titleSize: Math.floor(Math.min(state.height * (compact ? .05 : .065), state.width / (compact ? 8.7 : 16))),
    smallY: state.height * (compact ? .49 : .59),
    titleY: state.height * (compact ? .58 : .69)
  };
}

function drawFinalTitle(now) {
  const elapsed = now - state.messageAt;
  const smallProgress = SYSTEM_REDUCED ? 1 : clamp((elapsed - 360) / 900, 0, 1);
  const titleProgress = SYSTEM_REDUCED ? 1 : clamp((elapsed - 520) / 1100, 0, 1);
  const smallReveal = 1 - Math.pow(1 - smallProgress, 3);
  const titleReveal = 1 - Math.pow(1 - titleProgress, 3);
  if (smallReveal <= 0 && titleReveal <= 0) return;

  const layout = getMessageLayout();
  const smallY = layout.smallY + (1 - smallReveal) * 8;
  const titleY = layout.titleY + (1 - titleReveal) * 10;

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.translate(layout.textX, smallY);
  ctx.transform(1, 0, -.075, 1, 0, 0);
  ctx.font = `italic 500 ${layout.smallSize}px "STXingkai", "华文行楷", "STKaiti", "KaiTi", "KaiTi_GB2312", serif`;
  ctx.fillStyle = `rgba(175, 184, 190, ${smallReveal * .88})`;
  ctx.strokeStyle = `rgba(229, 234, 237, ${smallReveal * .12})`;
  ctx.lineWidth = Math.max(.7, layout.smallSize * .021);
  ctx.shadowColor = `rgba(98, 108, 116, ${smallReveal * .24})`;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 3;
  ctx.shadowBlur = 5;
  drawSpacedText(ctx, '小猪', 0, 0, layout.smallSize * .22, 'both');
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.translate(layout.textX, titleY);
  ctx.transform(1, 0, -.095, 1, 0, 0);
  ctx.font = `italic 600 ${layout.titleSize}px "STXingkai", "华文行楷", "STKaiti", "KaiTi", "KaiTi_GB2312", serif`;
  ctx.fillStyle = `rgba(211, 218, 222, ${titleReveal * .95})`;
  ctx.strokeStyle = `rgba(239, 242, 244, ${titleReveal * .14})`;
  ctx.lineWidth = Math.max(.9, layout.titleSize * .021);
  ctx.shadowColor = `rgba(91, 102, 110, ${titleReveal * .28})`;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 4;
  ctx.shadowBlur = 7;
  drawSpacedText(ctx, '欢迎回家', 0, 0, layout.titleSize * .08, 'both');
  ctx.restore();
}

function drawParticle(particle, now, perspective, intensity, drawX = particle.x, drawY = particle.y, sizeBoost = 1) {
  const shimmer = .72 + Math.sin(now * .0017 * particle.twinkle + particle.phase) * .22;
  const alpha = clamp(particle.alpha * shimmer * intensity, .08, 1);
  const size = Math.max(.65, particle.size * perspective * (intensity > 1 ? 1.12 : 1) * sizeBoost);

  if (particle.tone === 0) ctx.fillStyle = `rgba(183, 191, 197, ${alpha})`;
  else if (particle.tone === 1) ctx.fillStyle = `rgba(222, 227, 230, ${alpha})`;
  else ctx.fillStyle = `rgba(245, 247, 248, ${alpha})`;

  if (size > 1.35) {
    ctx.beginPath();
    ctx.arc(drawX, drawY, size, 0, TAU);
    ctx.fill();
  } else {
    ctx.fillRect(drawX, drawY, size, size);
  }
}

function frame(now) {
  const dt = Math.min(1.8, (now - state.lastFrameAt) / 16.667 || 1);
  state.lastFrameAt = now;
  ctx.globalCompositeOperation = 'source-over';
  const fadeAlpha = state.mode === 'FIRE' || state.mode === 'MESSAGE'
    ? .13
    : state.mode === 'GUN'
      ? .72
      : state.mode === 'MOVE'
        ? .48
        : .42;
  ctx.fillStyle = `rgba(2, 3, 4, ${fadeAlpha})`;
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
  const gunShape = index.extended && otherThreeCurled && !middle.extended;
  const gun = gunShape && thumbExtended;

  return {
    gesture: gun ? 'GUN' : 'MOVE',
    openPalm,
    pointing,
    gun,
    gunShape,
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

  const gunLockGrace = state.gunArmed && pose.gunShape && now - state.gunLastSeenAt <= GUN_LOCK_GRACE;
  const gunActive = pose.gun || gunLockGrace;

  if (gunActive) {
    if (state.gestureCandidate !== 'GUN') {
      state.gestureCandidate = 'GUN';
      state.candidateSince = now;
      state.gunFrames = 0;
      state.gunMotion = [];
    }
    if (pose.gun) {
      state.gunFrames++;
      state.gunLastSeenAt = now;
    }

    if (pose.gun && now - state.candidateSince >= 160 && !state.gunArmed) {
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

    if (pose.gun && state.gunArmed && now > state.gunArmedAt + 180 && now > state.shotCooldownUntil) {
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
    state.gunFrames = 0;
    state.gunArmed = false;
    state.gunMotion = [];
    state.liftProgress = 0;
    state.mode = 'MOVE';
    state.gesture = 'MOVE';
    mapHandToScreen(landmarks);
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

function drawSpacedText(context, text, centerX, y, spacing, renderMode = 'fill') {
  const widths = [...text].map(character => context.measureText(character).width);
  const totalWidth = widths.reduce((sum, width) => sum + width, 0) + spacing * Math.max(0, text.length - 1);
  let cursor = centerX - totalWidth / 2;
  [...text].forEach((character, index) => {
    const x = cursor + widths[index] / 2;
    if (renderMode === 'stroke' || renderMode === 'both') context.strokeText(character, x, y);
    if (renderMode === 'fill' || renderMode === 'both') context.fillText(character, x, y);
    cursor += widths[index] + spacing;
  });
}

function drawPigMark(context, centerX, centerY, radius) {
  context.save();
  context.strokeStyle = '#f3f5f6';
  context.fillStyle = '#f3f5f6';
  context.lineWidth = Math.max(4, radius * .055);
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

  const layout = getMessageLayout();
  drawPigMark(textCtx, layout.pigX, layout.pigY, layout.pigRadius);

  const pixels = textCtx.getImageData(0, 0, state.width, state.height).data;
  const step = state.width < 700 ? 4 : 5;
  const points = [];
  for (let y = 0; y < state.height; y += step) {
    for (let x = 0; x < state.width; x += step) {
      if (pixels[(y * state.width + x) * 4 + 3] <= 90) continue;
      points.push({ x, y, group: 'pig' });
    }
  }

  for (let index = points.length - 1; index > 0; index--) {
    const target = Math.floor(Math.random() * (index + 1));
    [points[index], points[target]] = [points[target], points[index]];
  }

  const textCount = Math.floor(state.particles.length * .72);
  state.messageTargets = points;
  for (let index = 0; index < state.particles.length; index++) {
    const particle = state.particles[index];
    particle.textParticle = index < textCount && points.length > 0;
    if (particle.textParticle) {
      const point = points[index % points.length];
      particle.tx = point.x + (Math.random() - .5) * 1.8;
      particle.ty = point.y + (Math.random() - .5) * 1.8;
      particle.messageGroup = point.group;
    } else {
      particle.messageGroup = 'ambient';
    }
  }
}

function enterMessage(now) {
  state.mode = 'MESSAGE';
  state.messageAt = now;
  state.homeTransitionStarted = false;
  buildMessageTargets();
  statusNode.textContent = '小猪欢迎回家';
  updateDebug();
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
  const lossGrace = state.gunArmed ? 720 : 360;
  if (now - state.handSeenAt <= lossGrace) return;
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
});

resize();
positionParticlesImmediately();
frame(performance.now());
initializeTracking();

if (DEBUG && new URLSearchParams(location.search).get('demo') === 'fire') {
  setTimeout(() => beginExplosion(), 900);
}
