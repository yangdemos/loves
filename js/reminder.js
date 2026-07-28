/**
 * Love & Peace — Reminder System
 * ============================================
 * 
 * Provides:
 *   - Browser Notification API integration (with graceful degradation)
 *   - Service Worker backed background notifications
 *   - Configurable daily love reminder
 *   - Anniversary countdown notifications
 *   - Random memory trigger
 *   - Persistent settings via localStorage
 *   - Toast fallback when Notification is unavailable or denied
 *
 * Exposes:
 *   window.LOVE_REMINDER — the main API object
 */

(function () {
  'use strict';

  // ─── Constants ────────────────────────────────────────────────
  const STORAGE_KEY = 'love_reminder_settings';
  const LAST_TRIGGER_KEY = 'love_reminder_last_trigger';
  const ANNIVERSARY_CHECK_KEY = 'love_reminder_anniversary_check';

  const DEFAULT_CONFIG = {
    enabled: true,
    dailyReminderTime: '09:00',       // HH:mm (24h)
    anniversaryReminder: true,
    anniversaryAdvanceDays: 7,        // how many days before to start reminding
    lastNotificationDate: null,        // YYYY-MM-DD
    dailyReminderEnabled: true,
  };

  // ─── State ────────────────────────────────────────────────────
  let config = {};
  let swRegistration = null;
  let checkIntervalId = null;
  let todayCheckDone = false;

  // DOM refs (populated on init)
  let toastContainer = null;

  // ─── Storage helpers ──────────────────────────────────────────
  function loadConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        config = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
      } else {
        config = { ...DEFAULT_CONFIG };
      }
    } catch (e) {
      console.warn('[Reminder] Failed to load config, using defaults:', e);
      config = { ...DEFAULT_CONFIG };
    }
    return config;
  }

  function saveConfig() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch (e) {
      console.warn('[Reminder] Failed to save config:', e);
    }
  }

  function getLastTrigger() {
    try {
      return localStorage.getItem(LAST_TRIGGER_KEY) || null;
    } catch { return null; }
  }

  function setLastTrigger(dateStr) {
    try { localStorage.setItem(LAST_TRIGGER_KEY, dateStr); } catch { /* ignore */ }
  }

  function getAnniversaryCheck() {
    try {
      return localStorage.getItem(ANNIVERSARY_CHECK_KEY) || null;
    } catch { return null; }
  }

  function setAnniversaryCheck(dateStr) {
    try { localStorage.setItem(ANNIVERSARY_CHECK_KEY, dateStr); } catch { /* ignore */ }
  }

  // ─── Date helpers ─────────────────────────────────────────────
  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function daysBetween(a, b) {
    const ms = Math.abs(a.getTime() - b.getTime());
    return Math.floor(ms / (1000 * 60 * 60 * 24));
  }

  function getAnniversaryInfo() {
    const start = LOVE_DATA.startDate; // from data.js
    const now = new Date();
    const thisYear = now.getFullYear();
    
    // This year's anniversary date
    const thisAnniversary = new Date(thisYear, start.getMonth(), start.getDate());
    
    // Next year's anniversary
    const nextAnniversary = new Date(thisYear + 1, start.getMonth(), start.getDate());
    
    // Determine which anniversary to use (past or upcoming)
    let upcomingAnniversary = thisAnniversary;
    if (now > thisAnniversary) {
      upcomingAnniversary = nextAnniversary;
    }
    
    const daysUntil = daysBetween(now, upcomingAnniversary);
    const yearsTogether = upcomingAnniversary.getFullYear() - start.getFullYear();
    const totalDays = daysBetween(start, now);
    
    return { daysUntil, yearsTogether, totalDays, upcomingAnniversary };
  }

  // ─── Service Worker ───────────────────────────────────────────
  async function registerSW() {
    if (!('serviceWorker' in navigator)) {
      console.log('[Reminder] Service Worker not supported');
      return null;
    }

    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });
      console.log('[Reminder] SW registered:', registration.scope);
      
      // Wait for SW to be ready (activated and controlling clients)
      swRegistration = await navigator.serviceWorker.ready;
      return swRegistration;
    } catch (err) {
      console.warn('[Reminder] SW registration failed:', err);
      return null;
    }
  }

  /**
   * Send a message to the Service Worker to show a notification.
   * This works even when the page is in the background.
   */
  function notifyViaSW(title, body, opts = {}) {
    if (swRegistration && swRegistration.active) {
      swRegistration.active.postMessage({
        type: 'SHOW_NOTIFICATION',
        title,
        body,
        tag: opts.tag || 'love-reminder',
        icon: opts.icon || '/images/icon-192.png',
        requireInteraction: opts.requireInteraction !== false,
        silent: opts.silent || false,
        data: opts.data || {},
      });
      return true;
    }
    return false;
  }

  /**
   * Show notification directly via the Notification API.
   * Falls back to page toast if not permitted.
   */
  function notify(title, body, opts = {}) {
    // Priority 1: Service Worker (works in background)
    if (notifyViaSW(title, body, opts)) return;

    // Priority 2: Direct Notification API
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const n = new Notification(title, {
          body: body || '',
          icon: opts.icon || '/images/icon-192.png',
          tag: opts.tag || 'love-reminder',
          requireInteraction: opts.requireInteraction !== false,
          silent: opts.silent || false,
          data: opts.data || {},
        });
        n.onclick = () => {
          window.focus();
          n.close();
        };
        return;
      } catch (e) {
        console.warn('[Reminder] Notification API failed:', e);
      }
    }

    // Priority 3: Fallback — page toast
    showToast(body || title);
  }

  // ─── Toast fallback UI ────────────────────────────────────────
  function ensureToastContainer() {
    if (toastContainer) return toastContainer;

    toastContainer = document.createElement('div');
    toastContainer.id = 'reminder-toast-container';
    toastContainer.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 99999;
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-width: 360px;
      pointer-events: none;
    `;
    document.body.appendChild(toastContainer);
    return toastContainer;
  }

  function showToast(message, title) {
    const container = ensureToastContainer();

    const toast = document.createElement('div');
    toast.className = 'reminder-toast';
    toast.style.cssText = `
      pointer-events: auto;
      background: rgba(22, 22, 31, 0.95);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(184, 74, 90, 0.4);
      border-radius: 12px;
      padding: 16px 20px;
      color: #e8e0d8;
      font-family: "Noto Serif SC", serif;
      font-size: 0.95rem;
      line-height: 1.6;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      transform: translateX(120%);
      opacity: 0;
      transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease;
      max-width: 100%;
    `;

    if (title) {
      const titleEl = document.createElement('div');
      titleEl.style.cssText = `
        font-weight: 600;
        color: #d4a373;
        margin-bottom: 6px;
        font-size: 1rem;
      `;
      titleEl.textContent = title;
      toast.appendChild(titleEl);
    }

    const bodyEl = document.createElement('div');
    bodyEl.textContent = message;
    toast.appendChild(bodyEl);

    container.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
      toast.style.transform = 'translateX(0)';
      toast.style.opacity = '1';
    });

    // Auto-remove after 6 seconds
    setTimeout(() => {
      toast.style.transform = 'translateX(120%)';
      toast.style.opacity = '0';
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 500);
    }, 6000);

    // Also dismiss on click
    toast.addEventListener('click', () => {
      toast.style.transform = 'translateX(120%)';
      toast.style.opacity = '0';
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 500);
    });
  }

  // ─── Core reminder logic ──────────────────────────────────────

  /**
   * Check if today's daily reminder should fire.
   */
  function checkDailyReminder() {
    if (!config.enabled || !config.dailyReminderEnabled) return;

    const today = todayStr();
    const lastTrigger = getLastTrigger();

    // Skip if already triggered today
    if (lastTrigger === today) return;

    // Parse target time
    const [hours, minutes] = config.dailyReminderTime.split(':').map(Number);
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const targetMinutes = hours * 60 + minutes;

    // If current time has passed the target time, fire
    if (currentMinutes >= targetMinutes) {
      setLastTrigger(today);
      todayCheckDone = true;

      const calc = window.calculateTimeTogether ? window.calculateTimeTogether() : null;
      const days = calc ? calc.days : daysBetween(LOVE_DATA.startDate, now);

      notify(
        '❤️ 今天的爱情提醒',
        `已经在一起 ${days} 天了。每一秒都因为有你而变得特别。今天也继续相爱吧！`,
        { tag: 'daily-reminder', icon: '/images/icon-192.png' }
      );

      console.log(`[Reminder] Daily reminder fired for ${today}`);
    }
  }

  /**
   * Check if anniversary notification should fire.
   * Fires once per day when within the advance window.
   */
  function checkAnniversaryReminder() {
    if (!config.enabled || !config.anniversaryReminder) return;

    const today = todayStr();
    const lastCheck = getAnniversaryCheck();
    if (lastCheck === today) return; // already checked today

    const { daysUntil, yearsTogether, totalDays } = getAnniversaryInfo();

    if (daysUntil <= config.anniversaryAdvanceDays) {
      setAnniversaryCheck(today);

      if (daysUntil === 0) {
        notify(
          '🎉 纪念日快乐！',
          `今天是我们相识 ${yearsTogether} 周年！在一起的 ${totalDays} 天，每一个都是最美的礼物。爱你！`,
          { tag: 'anniversary', requireInteraction: true }
        );
      } else {
        notify(
          '💝 纪念日倒计时',
          `距离我们相识 ${yearsTogether} 周年还有 ${daysUntil} 天。已经开始期待了！`,
          { tag: 'anniversary-countdown', requireInteraction: false }
        );
      }
    }
  }

  /**
   * Polling check — runs every 60 seconds.
   * Uses requestIdleCallback when available to avoid jank.
   */
  function runScheduledCheck() {
    // Only run checks if the page is visible
    if (document.hidden) return;

    try {
      checkDailyReminder();
      checkAnniversaryReminder();
    } catch (e) {
      console.warn('[Reminder] Scheduled check error:', e);
    }
  }

  function scheduleChecks() {
    if (checkIntervalId) return;

    // Use requestIdleCallback for first check to avoid blocking initial render
    const scheduleFirst = () => {
      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => runScheduledCheck(), { timeout: 3000 });
      } else {
        setTimeout(() => runScheduledCheck(), 2000);
      }
    };

    // Also run on visibility change (user comes back to tab)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        // Reset todayCheckDone so daily check re-evaluates on return
        todayCheckDone = false;
        runScheduledCheck();
      }
    });

    // Periodic poll every 60 seconds
    checkIntervalId = setInterval(() => {
      runScheduledCheck();
    }, 60_000);

    scheduleFirst();
  }

  // ─── Random memory trigger ────────────────────────────────────

  /**
   * Pick a random memory from locations or gallery and notify.
   * Exposed for user interaction (button click).
   */
  function triggerRandomMemory() {
    const memories = [];

    // Gather location memories
    if (LOVE_DATA.locations) {
      LOVE_DATA.locations.forEach((loc) => {
        memories.push({
          type: 'location',
          title: `还记得 ${loc.name} 吗？`,
          body: loc.description,
          data: { locationId: loc.id },
        });
      });
    }

    // Gather gallery memories
    if (LOVE_DATA.gallery) {
      LOVE_DATA.gallery.forEach((item) => {
        memories.push({
          type: 'gallery',
          title: '一张照片，一段回忆',
          body: item.label,
          data: {},
        });
      });
    }

    if (memories.length === 0) {
      showToast('还没有足够的回忆数据，先去添加一些吧！', '💭');
      return;
    }

    const picked = memories[Math.floor(Math.random() * memories.length)];
    notify(picked.title, picked.body, {
      tag: 'random-memory',
      icon: '/images/icon-192.png',
      data: picked.data,
    });
  }

  // ─── Permission management ────────────────────────────────────

  /**
   * Request notification permission from the user.
   * Returns 'granted', 'denied', or 'default'.
   */
  async function requestPermission() {
    if (!('Notification' in window)) return 'unsupported';

    // Already granted
    if (Notification.permission === 'granted') return 'granted';

    // Already denied — don't re-ask, just return status
    if (Notification.permission === 'denied') return 'denied';

    // Ask
    try {
      const result = await Notification.requestPermission();
      return result;
    } catch (e) {
      console.warn('[Reminder] Permission request failed:', e);
      return 'denied';
    }
  }

  function getPermissionStatus() {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission;
  }

  // ─── UI Integration ───────────────────────────────────────────

  /**
   * Create and inject reminder settings panel into the page.
   * Called after DOM is ready.
   */
  function injectSettingsUI() {
    // Find a good place to inject — after the letter section or before the footer
    const footer = document.querySelector('.footer');
    if (!footer) return;

    const section = document.createElement('section');
    section.id = 'reminder-section';
    section.className = 'section reminder-section';
    section.style.cssText = `
      padding: 60px 0;
      position: relative;
      background: var(--bg-dark, #0e0e16);
    `;

    section.innerHTML = `
      <div class="container">
        <div class="section-header light">
          <span class="section-number">💌</span>
          <h2 class="section-title" style="font-size: 1.8rem;">提醒设置</h2>
          <div class="section-divider" style="background: var(--accent-gold, #c9a96e);"></div>
          <p class="section-desc">不要让忙碌冲淡了爱 — 让我们的故事时时提醒你</p>
        </div>

        <div class="reminder-settings" style="
          max-width: 600px;
          margin: 0 auto;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 16px;
          padding: 32px;
          backdrop-filter: blur(10px);
        ">
          <!-- Toggle: Enable reminders -->
          <div class="reminder-row" style="display:flex; align-items:center; justify-content:space-between; padding:12px 0; border-bottom:1px solid rgba(255,255,255,0.06);">
            <div>
              <div style="font-weight:600; color:#e8e0d8; font-size:1rem;">启用提醒</div>
              <div style="font-size:0.85rem; color:#908880; margin-top:2px;">接收每日爱情提醒和纪念日通知</div>
            </div>
            <label class="reminder-toggle" id="reminder-enabled-toggle">
              <input type="checkbox" ${config.enabled ? 'checked' : ''} />
              <span class="toggle-slider"></span>
            </label>
          </div>

          <!-- Daily reminder time -->
          <div class="reminder-row" style="display:flex; align-items:center; justify-content:space-between; padding:12px 0; border-bottom:1px solid rgba(255,255,255,0.06);">
            <div>
              <div style="font-weight:600; color:#e8e0d8; font-size:1rem;">每日提醒时间</div>
              <div style="font-size:0.85rem; color:#908880; margin-top:2px;">每天这个时间推送爱情提醒</div>
            </div>
            <input type="time" id="reminder-time-input" value="${config.dailyReminderTime}"
              style="
                background: rgba(255,255,255,0.08);
                border: 1px solid rgba(255,255,255,0.12);
                border-radius: 8px;
                color: #e8e0d8;
                padding: 8px 12px;
                font-size: 0.95rem;
                font-family: inherit;
              " />
          </div>

          <!-- Anniversary reminder toggle -->
          <div class="reminder-row" style="display:flex; align-items:center; justify-content:space-between; padding:12px 0; border-bottom:1px solid rgba(255,255,255,0.06);">
            <div>
              <div style="font-weight:600; color:#e8e0d8; font-size:1rem;">纪念日提醒</div>
              <div style="font-size:0.85rem; color:#908880; margin-top:2px;">纪念日前 ${config.anniversaryAdvanceDays} 天开始提醒</div>
            </div>
            <label class="reminder-toggle" id="reminder-anniversary-toggle">
              <input type="checkbox" ${config.anniversaryReminder ? 'checked' : ''} />
              <span class="toggle-slider"></span>
            </label>
          </div>

          <!-- Random memory button -->
          <div class="reminder-row" style="display:flex; align-items:center; justify-content:space-between; padding:12px 0; border-bottom:none;">
            <div>
              <div style="font-weight:600; color:#e8e0d8; font-size:1rem;">随机回忆</div>
              <div style="font-size:0.85rem; color:#908880; margin-top:2px;">随机弹出一条属于你们的美好回忆</div>
            </div>
            <button id="reminder-random-btn" style="
              background: linear-gradient(135deg, #b84a5a, #d4a373);
              border: none;
              border-radius: 8px;
              color: #fff;
              padding: 8px 20px;
              font-size: 0.9rem;
              font-weight: 600;
              cursor: pointer;
              transition: transform 0.2s, box-shadow 0.2s;
              font-family: inherit;
            "
            onmouseover="this.style.transform='scale(1.05)';this.style.boxShadow='0 4px 20px rgba(184,74,90,0.4)';"
            onmouseout="this.style.transform='scale(1)';this.style.boxShadow='none';">给我一个回忆</button>
          </div>

          <!-- Notification permission status -->
          <div class="reminder-row" style="display:flex; align-items:center; justify-content:space-between; padding:12px 0 0; border-top:1px solid rgba(255,255,255,0.06); margin-top:8px;">
            <div>
              <div style="font-weight:600; color:#e8e0d8; font-size:0.9rem;">桌面通知权限</div>
              <div style="font-size:0.8rem; color:#908880; margin-top:2px;">允许浏览器发送系统通知</div>
            </div>
            <button id="reminder-permission-btn" style="
              background: rgba(255,255,255,0.08);
              border: 1px solid rgba(255,255,255,0.12);
              border-radius: 8px;
              color: #e8e0d8;
              padding: 6px 16px;
              font-size: 0.85rem;
              cursor: pointer;
              transition: background 0.2s;
              font-family: inherit;
            "
            onmouseover="this.style.background='rgba(255,255,255,0.14)';"
            onmouseout="this.style.background='rgba(255,255,255,0.08)';"></button>
          </div>
        </div>
      </div>
    `;

    // Insert before footer
    footer.parentNode.insertBefore(section, footer);

    // Bind events after DOM injection
    setTimeout(() => bindSettingsUI(), 50);
  }

  function bindSettingsUI() {
    // Toggle: enabled
    const enabledToggle = document.querySelector('#reminder-enabled-toggle input');
    if (enabledToggle) {
      enabledToggle.addEventListener('change', () => {
        config.enabled = enabledToggle.checked;
        saveConfig();
        if (config.enabled) {
          scheduleChecks();
        }
      });
    }

    // Time input
    const timeInput = document.querySelector('#reminder-time-input');
    if (timeInput) {
      timeInput.addEventListener('change', () => {
        config.dailyReminderTime = timeInput.value;
        // Reset today's trigger so it re-evaluates with the new time
        setLastTrigger(null);
        saveConfig();
      });
    }

    // Anniversary toggle
    const anniToggle = document.querySelector('#reminder-anniversary-toggle input');
    if (anniToggle) {
      anniToggle.addEventListener('change', () => {
        config.anniversaryReminder = anniToggle.checked;
        setAnniversaryCheck(null); // reset
        saveConfig();
      });
    }

    // Random memory button
    const randomBtn = document.querySelector('#reminder-random-btn');
    if (randomBtn) {
      randomBtn.addEventListener('click', triggerRandomMemory);
    }

    // Permission button
    updatePermissionButton();
    const permBtn = document.querySelector('#reminder-permission-btn');
    if (permBtn) {
      permBtn.addEventListener('click', async () => {
        const result = await requestPermission();
        updatePermissionButton(result);
        if (result === 'granted') {
          showToast('通知权限已开启，以后会在这里收到提醒 ❤️', '✅ 权限已授予');
        } else if (result === 'denied') {
          showToast('权限被拒绝。如需更改，请到浏览器设置中允许本网站的通知。', '⚠️ 权限已拒绝');
        }
      });
    }
  }

  function updatePermissionButton(status) {
    const btn = document.querySelector('#reminder-permission-btn');
    if (!btn) return;

    const s = status || getPermissionStatus();
    switch (s) {
      case 'granted':
        btn.textContent = '✅ 已允许';
        btn.style.color = '#4ade80';
        break;
      case 'denied':
        btn.textContent = '🚫 已拒绝';
        btn.style.color = '#f87171';
        break;
      case 'unsupported':
        btn.textContent = '❌ 不支持';
        btn.style.color = '#908880';
        btn.disabled = true;
        break;
      default:
        btn.textContent = '🔔 点击授权';
        btn.style.color = '#e8e0d8';
        break;
    }
  }

  // ─── Public API ───────────────────────────────────────────────

  const LOVE_REMINDER = {
    /** Request notification permission */
    requestPermission,
    /** Get current permission status */
    getPermissionStatus,
    /** Trigger a random memory notification */
    triggerRandomMemory,
    /** Get current config (copy) */
    getConfig: () => ({ ...config }),
    /** Update config and persist */
    updateConfig: (patch) => {
      config = { ...config, ...patch };
      saveConfig();
    },
    /** Force check reminders now */
    checkNow: () => {
      runScheduledCheck();
    },
    /** Show a toast message */
    showToast,
    /** Send a notification */
    notify,
  };

  window.LOVE_REMINDER = LOVE_REMINDER;

  // ─── Initialize ──────────────────────────────────────────────

  async function init() {
    loadConfig();
    await registerSW();

    // Inject settings UI after DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        injectSettingsUI();
        if (config.enabled) scheduleChecks();
      });
    } else {
      injectSettingsUI();
      if (config.enabled) scheduleChecks();
    }

    console.log('[Reminder] System initialized');
  }

  // Start
  init();
})();
