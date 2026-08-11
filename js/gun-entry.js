/* ============================================
   开枪入场页 — 主逻辑 v3（体感重新设计）
   黑色背景 · 光粒子爱心 · 摄像头仅采集手势不外显
   状态机：LOADING → PALM(掌控爱心) → GUN(比枪心跳)
           → SHOOT(挥枪散开) → TEXT(六字浮现) → 进站

   v3 体感链路重做：
   1. MediaPipe 主库 / WASM / 手势模型全部本地化，零外网依赖
   2. GPU delegate 初始化失败自动降级 CPU 重试
   3. 掌心定位：9 关键点加权平均 + EMA 平滑，压掉手抖
   4. 手势判定：连续评分(0~1) + 帧缓冲防抖，不再单帧硬切
   5. 开枪：方向一致性的累计挥动，抗小幅乱晃误触
   ============================================ */

import { FilesetResolver, HandLandmarker } from "./vendor/vision_bundle.mjs";

// 全部本地资源（相对页面根目录），断网可跑
const MODEL_PATH = "assets/models/hand_landmarker.task";
const WASM_DIR = "js/vendor/wasm";

// ── DOM ──
const video = document.getElementById("cam");
const canvas = document.getElementById("fx");
const ctx = canvas.getContext("2d");
const crosshair = document.getElementById("crosshair");
const statusEl = document.getElementById("status");
const steps = [...document.querySelectorAll(".step")];
const flashEl = document.getElementById("flash");
const enterText = document.getElementById("enterText");
const fallback = document.getElementById("fallback");
const fallbackMsg = document.getElementById("fbMsg");
const enterBtn = document.getElementById("enterBtn");
const HOME_URL = "home.html?v=6e5c981&cinematicMotion=force";

// ── 错误透出：任何异常直接显示到页面，不留死寂 ──
function withTimeout(promise, ms, failMsg) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(failMsg)), ms)),
    ]);
}
window.addEventListener("error", (ev) => {
    if (!fallback.classList.contains("show")) showFallback("运行错误：" + ev.message);
});
window.addEventListener("unhandledrejection", (ev) => {
    if (!fallback.classList.contains("show")) {
        showFallback("加载失败：" + (ev.reason && ev.reason.message ? ev.reason.message : String(ev.reason)));
    }
});

// ── 状态 ──
let landmarker = null;
let lastVideoTime = -1;
let lastDetectTs = 0;
let mode = "LOADING"; // LOADING | PALM | GUN | SHOOT | TEXT
let fired = false;
let gunSince = 0;

// 爱心锚点（屏幕坐标，平滑跟随手掌）
let heartX = 0;
let heartY = 0;
let targetX = 0;
let targetY = 0;

// ── 手势判定：连续评分 + 帧缓冲 ──
const GUN_ENTER_FRAMES = 3; // 连续达标帧数才进枪形
const GUN_EXIT_FRAMES = 5;  // 连续掉线帧数才退出枪形
let gunFrames = 0;
let nonGunFrames = 0;

// 掌心平滑（9 关键点加权）
const PALM_POINTS = [0, 5, 9, 13, 17, 6, 10, 14, 18];
const PALM_WEIGHTS = [0.8, 1.0, 1.0, 1.0, 1.0, 0.6, 0.6, 0.6, 0.6];
let palmX = 0.5; // 归一化坐标（已镜像）
let palmY = 0.5;
const PALM_SMOOTH = 0.5; // EMA 系数

// 挥动开枪：方向一致性累计
let lastPalmPos = null;
let swingAcc = 0;
let swingDir = null;
let gunBaseX = 0;
let gunBaseY = 0;
let liftUpFrames = 0;
const SWING_STEP_MIN = 0.004; // 忽略的微抖
const SWING_FIRE = 0.15;      // 累计挥动距离阈值

// ── 工具 ──
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

function setStatus(text) {
    statusEl.textContent = text;
}

// ── 运行时诊断面板：把检测链路每一环实时打到屏幕 ──
const dbgRows = {}; // 有序诊断字段
const DBG_POS = ["engine", "video", "detect", "palm", "gun", "mode", "center", "note"];
const dbg = document.createElement("div");
dbg.id = "dbg";
dbg.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:9999;" +
    "font:11px/1.5 monospace;color:#cfe3ff;background:rgba(10,10,20,.82);" +
    "padding:8px 10px;border-radius:8px;pointer-events:none;white-space:pre;" +
    "max-width:360px;";
document.body.appendChild(dbg);
function dbgSet(key, val) { dbgRows[key] = val; }
function renderDbg() {
    const lines = DBG_POS.map((k) => dbgRows[k] !== undefined ? `${k}: ${dbgRows[k]}` : null)
        .filter(Boolean);
    dbg.textContent = lines.join("\n");
}
window.dbgSet = dbgSet; // 供控制台直接取数
dbgSet("engine", "未加载");

function setStep(index) {
    steps.forEach((s, i) => s.classList.toggle("active", i === index));
}

// 手指伸直度连续评分：指尖到腕 / 指根到腕
// 1.35 以下=0(弯)，1.55 以上=1(直)，中间线性过渡
function fingerScore(lm, tip, pip) {
    const r = dist(lm[tip], lm[0]) / dist(lm[pip], lm[0]);
    return Math.max(0, Math.min(1, (r - 1.35) / 0.2));
}

// 枪形评分：食指、中指直，无名指、小指弯（乘积 → 任一不满足就拉低）
function gunScore(lm) {
    const idx = fingerScore(lm, 8, 6);
    const mid = fingerScore(lm, 12, 10);
    const ring = 1 - fingerScore(lm, 16, 14);
    const pinky = 1 - fingerScore(lm, 20, 18);
    return idx * mid * ring * pinky;
}

// 手掌评分：四指全直
function palmScore(lm) {
    const idx = fingerScore(lm, 8, 6);
    const mid = fingerScore(lm, 12, 10);
    const ring = fingerScore(lm, 16, 14);
    const pinky = fingerScore(lm, 20, 18);
    return idx * mid * ring * pinky;
}

// 掌心中心：9 关键点加权平均（腕 + 五 MCP + 四 PIP）
function palmCenter(lm) {
    let wx = 0, wy = 0, wsum = 0;
    for (let i = 0; i < PALM_POINTS.length; i++) {
        const idx = PALM_POINTS[i];
        wx += lm[idx].x * PALM_WEIGHTS[i];
        wy += lm[idx].y * PALM_WEIGHTS[i];
        wsum += PALM_WEIGHTS[i];
    }
    return { x: wx / wsum, y: wy / wsum };
}

// ── 光粒子爱心 ──
const PALETTE = ["#ff5c8a", "#ff8fab", "#ffc2d4", "#ff2e63", "#ffb3c9", "#ffd9e6"];
let W = 0;
let H = 0;

function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
    heartX = targetX = W / 2;
    heartY = targetY = H * 0.44;
    buildParticles();
}
window.addEventListener("resize", resize);

// 爱心参数方程（经典心形曲线）
function heartPoint(t) {
    return {
        x: 16 * Math.pow(Math.sin(t), 3),
        y: 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t),
    };
}

// 粒子：轮廓采样 + 向心收缩 + 抖动，形成发光的立体心
let particles = [];
const HEART_N = 280;

function buildParticles() {
    particles = [];
    for (let i = 0; i < HEART_N; i++) {
        const t = (i / HEART_N) * Math.PI * 2 + Math.random() * 0.25;
        const p = heartPoint(t);
        const inset = Math.random() * 0.62;
        particles.push({
            ax: p.x * (1 - inset) + (Math.random() - 0.5) * 2.6,
            ay: p.y * (1 - inset) + (Math.random() - 0.5) * 2.6,
            phase: Math.random() * Math.PI * 2,
            tw: 0.5 + Math.random() * 0.9,
            sp: 0.9 + Math.random() * 1.5,
            size: 1.3 + Math.random() * 2.1,
            color: PALETTE[(Math.random() * PALETTE.length) | 0],
            // 爆炸字段
            ex: 0, ey: 0, vx: 0, vy: 0, life: 0, rot: 0, vr: 0,
        });
    }
}

// 爱心基础缩放：坐标范围 ±16 左右 → 屏幕尺寸
function heartScale() {
    return Math.min(W, H) * 0.3 / 16;
}

// 全局心跳脉冲（0~1）
function pulseAt(now) {
    if (mode !== "GUN") return 0;
    const t = (now - gunSince) * 0.007;
    return Math.pow(Math.max(0, Math.sin(t)), 3);
}

// ── 开枪：粒子缓慢散开（星尘式，非爆炸） ──
function explode() {
    const s = heartScale();
    for (const p of particles) {
        p.ex = p.ax * s;
        p.ey = -p.ay * s; // 屏幕坐标 y 镜像：数学坐标 y 向上、画布 y 向下，不镜像爱心就是倒的
        const ang = Math.atan2(p.ey, p.ex) + (Math.random() - 0.5) * 0.35;
        const sp = 0.35 + Math.random() * 1.1; // 慢速外扩
        p.vx = Math.cos(ang) * sp;
        p.vy = Math.sin(ang) * sp - 0.2; // 微微上浮
        p.life = 1;
        p.rot = (Math.random() - 0.5) * 0.3;
        p.vr = (Math.random() - 0.5) * 0.05;
    }
}

// ── 渲染循环：粒子爱心 + 散开 ──
function render(now) {
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";

    const s = heartScale();
    const pulse = pulseAt(now);
    const breathe = 1 + 0.035 * Math.sin(now * 0.0016);

    // 锚点柔和跟随
    heartX += (targetX - heartX) * 0.22;
    heartY += (targetY - heartY) * 0.22;

    // 整体外发光
    const glowR = s * 20 * (1 + pulse * 0.5);
    const glow = ctx.createRadialGradient(heartX, heartY, 0, heartX, heartY, glowR);
    glow.addColorStop(0, `rgba(255,60,110,${0.22 + pulse * 0.25})`);
    glow.addColorStop(1, "rgba(255,60,110,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(heartX - glowR, heartY - glowR, glowR * 2, glowR * 2);

    // 心跳缩放：脉冲时向外鼓
    const beatScale = 1 + pulse * 0.18;

    for (const p of particles) {
        let px, py, alpha, size;

        if (p.life > 0) {
            // 散开模式：缓慢飘散 + 弱浮力 + 闪烁渐隐
            p.vy += 0.012;
            p.vx *= 0.996;
            p.ex += p.vx;
            p.ey += p.vy;
            p.rot += p.vr;
            p.life -= 0.0045;
            px = heartX + p.ex;
            py = heartY + p.ey;
            alpha = Math.max(p.life, 0) * (0.5 + 0.5 * Math.sin(now * 0.004 + p.phase * 5));
            size = p.size * (0.55 + p.life * 0.75);
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(p.rot);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(0, 0, size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            continue;
        }

        // 正常模式：粒子在锚点附近浮动
        const wob = Math.sin(now * 0.001 * p.sp + p.phase);
        const twinkle = 0.55 + p.tw * (0.5 + 0.5 * Math.sin(now * 0.003 + p.phase * 3));
        px = heartX + (p.ax * s * beatScale + wob * 1.6) * breathe;
        py = heartY - (p.ay * s * beatScale + Math.cos(now * 0.001 * p.sp + p.phase) * 1.6) * breathe;
        alpha = Math.min(twinkle, 0.95);
        size = p.size * (1 + pulse * 0.4);

        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
}

// ── 开枪 ──
function fire() {
    if (fired) return;
    fired = true;
    mode = "SHOOT";
    // 固定散开位置：心在原位缓缓散开，不再跟随手掌
    targetX = heartX;
    targetY = heartY;

    crosshair.classList.remove("on");
    setStep(2);
    flashEl.classList.add("go");
    document.body.classList.add("shake");
    if (navigator.vibrate) navigator.vibrate([70, 40, 90]);

    explode();

    setTimeout(() => {
        document.body.classList.remove("shake");
        flashEl.classList.remove("go");
        showWords();
    }, 620);
}

// ── 六字浮现 → 进站 ──
function showWords() {
    mode = "TEXT";
    enterText.classList.add("show");
    setTimeout(() => {
        document.body.classList.add("leaving");
        setTimeout(() => {
            window.location.href = HOME_URL;
        }, 950);
    }, 3300);
}

// ── 回退（无摄像头 / 模型加载失败） ──
function showFallback(msg) {
    fallbackMsg.textContent = msg;
    fallback.classList.add("show");
    setStatus("体感不可用");
    dbgSet("note", msg);
}

// ── 手势处理 ──
function resetGunTracking() {
    lastPalmPos = null;
    swingAcc = 0;
    swingDir = null;
    gunBaseX = 0;
    gunBaseY = 0;
    liftUpFrames = 0;
    gunFrames = 0;
    nonGunFrames = 0;
}

function handleHand(lm) {
    if (mode === "SHOOT" || mode === "TEXT") return;

    // 掌心中心：9 点加权平均 + EMA 平滑（归一化坐标）
    const raw = palmCenter(lm);
    palmX += (raw.x - palmX) * PALM_SMOOTH;
    palmY += (raw.y - palmY) * PALM_SMOOTH;
    const cx = palmX;
    const cy = palmY;
    const sx = (1 - cx) * W; // 镜像
    const sy = cy * H;

    const gScore = gunScore(lm);
    const pScore = palmScore(lm);

    // 实时诊断：手势是否被识别、分数多少、掌心在哪
    dbgSet("detect", "有手");
    dbgSet("palm", pScore.toFixed(2));
    dbgSet("gun", gScore.toFixed(2));
    dbgSet("center", `${(sx / W).toFixed(2)},${(sy / H).toFixed(2)}`);
    dbgSet("mode", mode);

    // ── 枪形：连续帧缓冲进入 ──
    if (gScore >= 0.5) {
        nonGunFrames = 0;
        gunFrames++;
        if (mode !== "GUN" && gunFrames >= GUN_ENTER_FRAMES) {
            mode = "GUN";
            gunSince = performance.now();
            resetGunTracking();
            gunBaseX = cx;
            gunBaseY = cy;
            lastPalmPos = { x: cx, y: cy };
            crosshair.classList.add("on");
            setStep(1);
            setStatus("目标锁定 — 抬起手开枪");
        }
    } else {
        gunFrames = 0;
        if (mode === "GUN") {
            nonGunFrames++;
            if (nonGunFrames >= GUN_EXIT_FRAMES) {
                mode = "PALM";
                crosshair.classList.remove("on");
                setStep(0);
                setStatus("张开手掌控制爱心移动");
                resetGunTracking();
            }
        }
    }

    // ── GUN 模式：方向一致的累计挥动 → 开枪 ──
    if (mode === "GUN") {
        if (lastPalmPos) {
            const dx = cx - lastPalmPos.x;
            const dy = cy - lastPalmPos.y;
            const stepLen = Math.hypot(dx, dy);

            if (stepLen > SWING_STEP_MIN) {
                const dirX = dx / stepLen;
                const dirY = dy / stepLen;
                // 与上一帧运动方向一致才累计，否则重新起算
                if (swingDir && (dirX * swingDir.x + dirY * swingDir.y) > 0.35) {
                    swingAcc += stepLen;
                } else {
                    swingAcc = stepLen;
                }
                swingDir = { x: dirX, y: dirY };
            } else {
                swingAcc = Math.max(0, swingAcc - 0.004); // 缓慢衰减
                swingDir = null;
            }

            if (lastPalmPos.y - cy > 0.006 && lastPalmPos.y - cy > Math.abs(cx - lastPalmPos.x) * 0.8) {
                liftUpFrames++;
            } else if (cy - lastPalmPos.y > 0.004) {
                liftUpFrames = Math.max(0, liftUpFrames - 1);
            }

            const elapsedSeconds = Math.max(0.12, (performance.now() - gunSince) / 1000);
            const upwardTravel = gunBaseY - cy;
            const horizontalTravel = Math.abs(cx - gunBaseX);
            const upwardSpeed = upwardTravel / elapsedSeconds;
            if (
                performance.now() - gunSince > 220 &&
                upwardTravel > 0.13 &&
                upwardSpeed > 0.22 &&
                upwardTravel > horizontalTravel * 1.15 &&
                liftUpFrames >= 2
            ) {
                fire();
                return;
            }
        }
        lastPalmPos = { x: cx, y: cy };

        // 枪形下爱心仍轻微跟随手掌
        targetX = Math.min(Math.max(sx, W * 0.18), W * 0.82);
        targetY = Math.min(Math.max(sy, H * 0.25), H * 0.7);
        return;
    }

    // ── 手掌 / 其他手势：爱心跟随 ──
    if (mode === "LOADING" || mode === "PALM") {
        if (pScore >= 0.6 || mode === "LOADING") {
            // 手掌 → 爱心跟随
            if (mode !== "PALM") {
                mode = "PALM";
                setStep(0);
                setStatus("张开手掌控制爱心移动");
            }
            targetX = Math.min(Math.max(sx, W * 0.15), W * 0.85);
            targetY = Math.min(Math.max(sy, H * 0.18), H * 0.78);
        }
    }
}

function handLost() {
    if (mode === "GUN") {
        crosshair.classList.remove("on");
        mode = "PALM";
        setStep(0);
        setStatus("张开手掌控制爱心移动");
        resetGunTracking();
    }
    // 无手时爱心缓回屏幕中央
    targetX = W / 2;
    targetY = H * 0.44;

    dbgSet("detect", "无手");
    dbgSet("mode", mode);
}

// ── 主循环：检测 + 渲染 ──
function loop(ts) {
    requestAnimationFrame(loop);

    render(ts);

    if (!landmarker || fired) return;
    if (video.currentTime === lastVideoTime) return;
    lastVideoTime = video.currentTime;

    try {
        const res = landmarker.detectForVideo(video, ts);
        if (res.landmarks && res.landmarks.length) {
            handleHand(res.landmarks[0]);
        } else {
            handLost();
        }
        dbgSet("fps", Math.round(1000 / Math.max(1, ts - lastDetectTs)));
        dbgSet("video", `${(video.currentTime || 0).toFixed(2)}s`);
        lastDetectTs = ts;
    } catch (detErr) {
        console.error("手势检测异常：", detErr);
        landmarker = null; // 停止检测，避免每帧刷错
        showFallback("手势引擎运行异常 — 请刷新重试");
    }
}

// ── 引擎创建：GPU 失败自动降级 CPU ──
async function createLandmarker(delegate) {
    // WASM 与模型加载都套超时，任何一步卡住都显式失败，绝不无限挂起
    const fileset = await withTimeout(
        FilesetResolver.forVisionTasks(WASM_DIR),
        20000,
        "手势引擎 WASM 加载超时（20 秒）— 请刷新重试"
    );
    const lm = await withTimeout(
        HandLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: MODEL_PATH, delegate },
            runningMode: "VIDEO",
            numHands: 1,
        }),
        20000,
        "手势模型加载超时（20 秒）— 请刷新重试"
    );
    dbgSet("engine", `OK(${delegate})`);
    return lm;
}

// ── 启动 ──
async function start() {
    // 1. 摄像头
    setStatus("正在请求摄像头权限");
    let stream;
    try {
        stream = await withTimeout(
            navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480, facingMode: "user" },
                audio: false,
            }),
            10000,
            "摄像头响应超时 — 请检查是否被其他程序占用"
        );
    } catch (camErr) {
        console.error(camErr);
        const msg = typeof camErr === "string"
            ? camErr
            : (camErr && (camErr.name === "NotAllowedError" || camErr.name === "PermissionDeniedError")
                ? "摄像头权限被拒绝 — 请在浏览器设置中允许"
                : "未检测到可用摄像头，或已被其他程序占用");
        showFallback(msg);
        return;
    }
    video.srcObject = stream;
    dbgSet("cam", "已授权");
    try {
        await withTimeout(video.play(), 5000, "视频流启动失败 — 请刷新重试");
    } catch (playErr) {
        console.error(playErr);
        showFallback(typeof playErr === "string" ? playErr : "视频流启动失败 — 请刷新重试");
        return;
    }
    dbgSet("cam", `OK ${video.videoWidth}x${video.videoHeight}`);

    // 2. 手势引擎（GPU → CPU 兜底）
    setStatus("正在加载手势引擎");
    try {
        landmarker = await createLandmarker("GPU");
    } catch (gpuErr) {
        console.warn("GPU delegate 初始化失败，降级 CPU 重试：", gpuErr);
        try {
            setStatus("图形加速不可用，切换兼容模式");
            landmarker = await createLandmarker("CPU");
        } catch (cpuErr) {
            console.error(cpuErr);
            const detail = (cpuErr && cpuErr.message ? cpuErr.message : String(cpuErr)).slice(0, 160);
            showFallback(`手势引擎加载失败：${detail} — 请刷新重试`);
            return;
        }
    }

    setStatus("张开手掌控制爱心移动");
    setStep(0);
    requestAnimationFrame(loop);
}

enterBtn.addEventListener("click", () => {
    window.location.href = HOME_URL;
});

// 初始化尺寸
resize();
start();
