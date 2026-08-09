/* ============================================================
 * bgm.js — 背景钢琴曲自动播放 + 右下角音乐开关
 * 策略：进页面立即尝试自动播放；若被浏览器自动播放策略拦截，
 * 则在用户首次交互（点击/触摸/按键）时补播。
 * ============================================================ */
(function () {
  'use strict';

  // 防止同页重复初始化（例如脚本被重复引用时）
  if (window.__BGM_INIT__) return;
  window.__BGM_INIT__ = true;

  var BTN_ID = 'bgm-toggle';
  var SRC = 'assets/music/bg_piano.mp3';

  var audio = new Audio();
  audio.src = SRC;
  audio.loop = true;
  audio.preload = 'auto';
  audio.volume = 0.7;

  var playing = false;

  // ---- 悬浮开关按钮 ----
  var style = document.createElement('style');
  style.textContent =
    '#' + BTN_ID + '{' +
      'position:fixed;right:18px;bottom:18px;z-index:9999;' +
      'padding:10px 18px;border:1px solid rgba(255,255,255,0.25);' +
      'border-radius:999px;background:rgba(20,20,30,0.55);' +
      'color:rgba(255,255,255,0.78);' +
      'font:500 13px/1 Inter,"Noto Serif SC","PingFang SC",sans-serif;' +
      'letter-spacing:1px;cursor:pointer;user-select:none;' +
      '-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);' +
      'transition:background .3s ease,color .3s ease,transform .3s ease;' +
    '}' +
    '#' + BTN_ID + ':hover{transform:translateY(-2px);}' +
    '#' + BTN_ID + '.on{' +
      'background:rgba(201,169,110,0.88);border-color:rgba(201,169,110,0.95);' +
      'color:#1a1410;' +
    '}' +
    '@keyframes bgm-pulse{0%,100%{opacity:1}50%{opacity:.62}}' +
    '#' + BTN_ID + '.on{animation:bgm-pulse 2.4s ease-in-out infinite;}';

  var btn = document.createElement('button');
  btn.id = BTN_ID;
  btn.type = 'button';
  btn.textContent = '♪ 音乐';
  btn.setAttribute('aria-label', '背景音乐开关');

  document.head.appendChild(style);
  document.body.appendChild(btn);

  // ---- 播放控制 ----
  function updateBtn() {
    if (playing) btn.classList.add('on');
    else btn.classList.remove('on');
  }

  function start() {
    if (playing) return;
    var p = audio.play();
    if (p && typeof p.then === 'function') {
      p.then(function () {
        playing = true;
        updateBtn();
      }).catch(function () {
        // 被浏览器拦截：等待首次交互时补播
      });
    }
  }

  function stop() {
    audio.pause();
    playing = false;
    updateBtn();
  }

  function toggle() {
    if (playing) stop();
    else start();
  }

  // 进页面立即尝试自动播放
  start();

  // 被拦截时：首次真实交互补播（点击音乐按钮本身除外，避免点暂停又被播）
  function tryAgain(e) {
    var t = e.target;
    if (t && t.closest && t.closest('#' + BTN_ID)) return;
    if (!playing) start();
  }
  document.addEventListener('pointerdown', tryAgain, { once: true });
  document.addEventListener('touchstart', tryAgain, { once: true });
  document.addEventListener('keydown', tryAgain, { once: true });

  btn.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    toggle();
  });

  updateBtn();
})();
