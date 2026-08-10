(function () {
  'use strict';

  const root = document.getElementById('video-maker');
  if (!root) return;

  const STORAGE_KEY = 'love_peace_wish_bottle_v1';
  const OWNER_CLASS = {
    '我': 'owner-me',
    '你': 'owner-you',
    '我们': 'owner-us'
  };

  const refs = {
    ownerTabs: document.getElementById('wish-owner-tabs'),
    form: document.getElementById('wish-form'),
    titleInput: document.getElementById('wish-title-input'),
    textInput: document.getElementById('wish-text-input'),
    progressInput: document.getElementById('wish-progress-input'),
    progressValue: document.getElementById('wish-progress-value'),
    stagePill: document.getElementById('wish-stage-pill'),
    stageCopy: document.getElementById('wish-stage-copy'),
    countBadge: document.getElementById('wish-count-badge'),
    stats: document.getElementById('wish-stats'),
    list: document.getElementById('wish-list'),
    bottleField: document.getElementById('wish-bottle-field'),
    bottleEmpty: document.getElementById('wish-bottle-empty'),
    detailModal: document.getElementById('wish-detail-modal'),
    detailClose: document.getElementById('wish-detail-close'),
    detailOwner: document.getElementById('wish-detail-owner'),
    detailTitle: document.getElementById('wish-detail-title'),
    detailText: document.getElementById('wish-detail-text'),
    detailProgressValue: document.getElementById('wish-detail-progress-value'),
    detailProgressFill: document.getElementById('wish-detail-progress-fill'),
    detailProgressInput: document.getElementById('wish-detail-progress-input'),
    detailStagePill: document.getElementById('wish-detail-stage-pill'),
    detailStageCopy: document.getElementById('wish-detail-stage-copy'),
    detailSave: document.getElementById('wish-detail-save'),
    detailDelete: document.getElementById('wish-detail-delete'),
    toast: document.getElementById('wish-toast')
  };

  const state = {
    wishes: [],
    selectedOwner: '我们',
    activeWishId: null,
    particleStates: new Map(),
    pauseMotion: false,
    rafId: null,
    toastTimer: null
  };

  function safeParse(raw) {
    try {
      return JSON.parse(raw);
    } catch (error) {
      console.warn('[WishBottle] Failed to parse storage:', error);
      return null;
    }
  }

  function loadWishes() {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? safeParse(raw) : [];
    state.wishes = Array.isArray(parsed)
      ? parsed.filter((item) => item && item.id && item.title && item.text).map((item) => ({
          id: item.id,
          owner: item.owner || '我们',
          title: item.title,
          text: item.text,
          progress: clampProgress(item.progress),
          createdAt: item.createdAt || new Date().toISOString()
        }))
      : [];
  }

  function saveWishes() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.wishes));
  }

  function clampProgress(value) {
    const num = Number(value);
    if (Number.isNaN(num)) return 0;
    return Math.min(100, Math.max(0, Math.round(num / 5) * 5));
  }

  function createWishId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'wish-' + Date.now() + '-' + Math.random().toString(16).slice(2, 8);
  }

  function ownerLabel(owner) {
    return owner === '我们' ? '我们的愿望' : owner + '的愿望';
  }

  function progressMeta(progress) {
    if (progress >= 100) {
      return {
        label: '已经实现',
        copy: '这颗星光已经落进现实里，不再只是说说而已。'
      };
    }
    if (progress >= 75) {
      return {
        label: '快要实现了',
        copy: '愿望已经很近了，像伸手就能摸到的光。'
      };
    }
    if (progress >= 45) {
      return {
        label: '正在靠近',
        copy: '它已经不是空想，很多步骤正在一件件补齐。'
      };
    }
    if (progress >= 15) {
      return {
        label: '开始发光',
        copy: '愿望已经有了轮廓，接下来只差继续往前推。'
      };
    }
    return {
      label: '刚刚放进瓶里',
      copy: '先把它认真记下来，之后它才会慢慢靠近现实。'
    };
  }

  function setSelectedOwner(owner) {
    state.selectedOwner = owner;
    refs.ownerTabs.querySelectorAll('.wish-owner-chip').forEach((chip) => {
      chip.classList.toggle('is-active', chip.dataset.owner === owner);
    });
  }

  function updateProgressPreview(progress, refsGroup) {
    const meta = progressMeta(progress);
    refsGroup.value.textContent = progress + '%';
    refsGroup.pill.textContent = meta.label;
    refsGroup.copy.textContent = meta.copy;
  }

  function showToast(message) {
    if (!refs.toast) return;
    refs.toast.textContent = message;
    refs.toast.classList.add('active');
    clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(function () {
      refs.toast.classList.remove('active');
    }, 2600);
  }

  function renderStats() {
    const total = state.wishes.length;
    const complete = state.wishes.filter((wish) => wish.progress >= 100).length;
    const active = state.wishes.filter((wish) => wish.progress > 0 && wish.progress < 100).length;
    refs.countBadge.textContent = total + ' 个愿望';
    refs.stats.innerHTML = [
      '<span class="wish-stat-pill">进行中 ' + active + '</span>',
      '<span class="wish-stat-pill">已实现 ' + complete + '</span>',
      '<span class="wish-stat-pill">还在发光 ' + Math.max(total - complete, 0) + '</span>'
    ].join('');
  }

  function renderList() {
    if (state.wishes.length === 0) {
      refs.list.innerHTML = '<div class="wish-empty-card">现在瓶子里还是空的。先写下一个愿望，给这个页面一点未来感。</div>';
      return;
    }

    const html = state.wishes
      .slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map((wish) => {
        const snippet = wish.text.length > 78 ? wish.text.slice(0, 78) + '…' : wish.text;
        return (
          '<article class="wish-list-item" role="button" tabindex="0" data-wish-open="' + wish.id + '">' +
            '<div class="wish-list-item-main">' +
              '<div class="wish-list-item-top">' +
                '<span class="wish-list-owner">' + ownerLabel(wish.owner) + '</span>' +
                '<span class="wish-list-progress">' + wish.progress + '%</span>' +
              '</div>' +
              '<h4 class="wish-list-title">' + escapeHtml(wish.title) + '</h4>' +
              '<p class="wish-list-snippet">' + escapeHtml(snippet) + '</p>' +
              '<div class="wish-mini-track"><span style="width:' + wish.progress + '%"></span></div>' +
            '</div>' +
            '<div class="wish-list-actions">' +
              '<button class="wish-list-arrow" type="button" data-wish-open="' + wish.id + '">打开</button>' +
              '<button class="wish-list-delete" type="button" data-wish-delete="' + wish.id + '" aria-label="删除愿望：' + escapeHtml(wish.title) + '">&times;</button>' +
            '</div>' +
          '</article>'
        );
      })
      .join('');

    refs.list.innerHTML = html;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function particleSize(wish) {
    return 22 + Math.round(wish.progress / 8);
  }

  function upsertParticleState(wish, el) {
    const fieldWidth = refs.bottleField.clientWidth;
    const fieldHeight = refs.bottleField.clientHeight;
    const size = el.offsetWidth || particleSize(wish);
    const maxX = Math.max(0, fieldWidth - size);
    const maxY = Math.max(0, fieldHeight - size);
    const speedBase = 0.32 + wish.progress / 250;
    const existing = state.particleStates.get(wish.id);

    if (existing) {
      existing.maxX = maxX;
      existing.maxY = maxY;
      existing.size = size;
      existing.vx = existing.vx < 0 ? -speedBase : speedBase;
      existing.vy = existing.vy < 0 ? -(speedBase + 0.08) : speedBase + 0.08;
      existing.x = Math.min(existing.x, maxX);
      existing.y = Math.min(existing.y, maxY);
      return;
    }

    state.particleStates.set(wish.id, {
      x: Math.random() * maxX,
      y: Math.random() * maxY,
      vx: (Math.random() > 0.5 ? 1 : -1) * speedBase,
      vy: (Math.random() > 0.5 ? 1 : -1) * (speedBase + 0.08),
      maxX: maxX,
      maxY: maxY,
      size: size
    });
  }

  function renderBottle() {
    refs.bottleField.innerHTML = '';

    if (state.wishes.length === 0) {
      refs.bottleField.appendChild(refs.bottleEmpty);
      refs.bottleEmpty.style.display = 'flex';
      return;
    }

    refs.bottleEmpty.style.display = 'none';

    state.wishes.forEach((wish) => {
      const button = document.createElement('button');
      button.className = 'wish-particle ' + (OWNER_CLASS[wish.owner] || OWNER_CLASS['我们']);
      button.type = 'button';
      button.dataset.wishOpen = wish.id;
      button.setAttribute('aria-label', '打开愿望：' + wish.title);
      button.style.setProperty('--size', particleSize(wish) + 'px');
      button.innerHTML = '<span class="wish-particle-core">✦</span>';
      refs.bottleField.appendChild(button);
      upsertParticleState(wish, button);
    });

    startParticleAnimation();
  }

  function startParticleAnimation() {
    if (state.rafId) return;

    const step = function () {
      const field = refs.bottleField;
      if (!field || !field.isConnected) {
        state.rafId = null;
        return;
      }

      state.wishes.forEach((wish) => {
        const el = field.querySelector('[data-wish-open="' + wish.id + '"]');
        const particle = state.particleStates.get(wish.id);
        if (!el || !particle) return;

        if (!state.pauseMotion) {
          particle.x += particle.vx;
          particle.y += particle.vy;

          if (particle.x <= 0 || particle.x >= particle.maxX) {
            particle.vx *= -1;
            particle.x = Math.max(0, Math.min(particle.x, particle.maxX));
          }
          if (particle.y <= 0 || particle.y >= particle.maxY) {
            particle.vy *= -1;
            particle.y = Math.max(0, Math.min(particle.y, particle.maxY));
          }
        }

        el.style.transform = 'translate(' + particle.x + 'px, ' + particle.y + 'px)';
      });

      state.rafId = window.requestAnimationFrame(step);
    };

    state.rafId = window.requestAnimationFrame(step);
  }

  function syncParticleBounds() {
    state.wishes.forEach((wish) => {
      const el = refs.bottleField.querySelector('[data-wish-open="' + wish.id + '"]');
      if (el) upsertParticleState(wish, el);
    });
  }

  function renderAll() {
    renderStats();
    renderList();
    renderBottle();
    syncParticleBounds();
  }

  function findWish(id) {
    return state.wishes.find((wish) => wish.id === id) || null;
  }

  function openWishDetail(id) {
    const wish = findWish(id);
    if (!wish) return;

    state.activeWishId = id;
    refs.detailOwner.textContent = ownerLabel(wish.owner);
    refs.detailTitle.textContent = wish.title;
    refs.detailText.textContent = wish.text;
    refs.detailProgressInput.value = wish.progress;
    refs.detailProgressValue.textContent = wish.progress + '%';
    refs.detailProgressFill.style.width = wish.progress + '%';
    updateProgressPreview(wish.progress, {
      value: refs.detailProgressValue,
      pill: refs.detailStagePill,
      copy: refs.detailStageCopy
    });
    refs.detailModal.classList.add('open');
    refs.detailModal.setAttribute('aria-hidden', 'false');
    state.pauseMotion = true;
    document.body.style.overflow = 'hidden';
  }

  function closeWishDetail() {
    refs.detailModal.classList.remove('open');
    refs.detailModal.setAttribute('aria-hidden', 'true');
    state.pauseMotion = false;
    document.body.style.overflow = '';
    state.activeWishId = null;
  }

  function handleWishSubmit(event) {
    event.preventDefault();

    const title = refs.titleInput.value.trim();
    const text = refs.textInput.value.trim();
    const progress = clampProgress(refs.progressInput.value);

    if (!title || !text) {
      showToast('先把标题和愿望内容写完整，瓶子不收空话。');
      return;
    }

    state.wishes.unshift({
      id: createWishId(),
      owner: state.selectedOwner,
      title: title,
      text: text,
      progress: progress,
      createdAt: new Date().toISOString()
    });

    saveWishes();
    renderAll();

    refs.form.reset();
    refs.progressInput.value = 0;
    updateProgressPreview(0, {
      value: refs.progressValue,
      pill: refs.stagePill,
      copy: refs.stageCopy
    });

    refs.titleInput.focus();
    showToast('愿望已经放进瓶子里，星光开始乱跳了。');
  }

  function saveDetailProgress() {
    const wish = findWish(state.activeWishId);
    if (!wish) return;
    wish.progress = clampProgress(refs.detailProgressInput.value);
    refs.detailProgressFill.style.width = wish.progress + '%';
    saveWishes();
    renderAll();
    showToast('愿望进度已经记下来了。');
  }

  function deleteWish(id) {
    const wish = findWish(id);
    if (!wish) return;

    state.wishes = state.wishes.filter((item) => item.id !== id);
    state.particleStates.delete(id);
    saveWishes();
    renderAll();

    if (state.activeWishId === id) {
      closeWishDetail();
    }

    showToast('这个愿望已经从瓶子里拿出来了。');
  }

  refs.ownerTabs.addEventListener('click', function (event) {
    const chip = event.target.closest('.wish-owner-chip');
    if (!chip) return;
    setSelectedOwner(chip.dataset.owner || '我们');
  });

  refs.progressInput.addEventListener('input', function () {
    updateProgressPreview(clampProgress(refs.progressInput.value), {
      value: refs.progressValue,
      pill: refs.stagePill,
      copy: refs.stageCopy
    });
  });

  refs.form.addEventListener('submit', handleWishSubmit);

  refs.list.addEventListener('click', function (event) {
    const deleteTrigger = event.target.closest('[data-wish-delete]');
    if (deleteTrigger) {
      deleteWish(deleteTrigger.dataset.wishDelete);
      return;
    }

    const trigger = event.target.closest('[data-wish-open]');
    if (!trigger) return;
    openWishDetail(trigger.dataset.wishOpen);
  });

  refs.list.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const trigger = event.target.closest('[data-wish-open]');
    if (!trigger) return;
    if (event.target.closest('[data-wish-delete]')) return;
    event.preventDefault();
    openWishDetail(trigger.dataset.wishOpen);
  });

  refs.bottleField.addEventListener('click', function (event) {
    const trigger = event.target.closest('[data-wish-open]');
    if (!trigger) return;
    openWishDetail(trigger.dataset.wishOpen);
  });

  refs.bottleField.addEventListener('pointerenter', function () {
    state.pauseMotion = true;
  });

  refs.bottleField.addEventListener('pointerleave', function () {
    if (!refs.detailModal.classList.contains('open')) {
      state.pauseMotion = false;
    }
  });

  refs.detailClose.addEventListener('click', closeWishDetail);
  refs.detailModal.addEventListener('click', function (event) {
    if (event.target && event.target.getAttribute('data-wish-close') === 'true') {
      closeWishDetail();
    }
  });

  refs.detailProgressInput.addEventListener('input', function () {
    const progress = clampProgress(refs.detailProgressInput.value);
    refs.detailProgressValue.textContent = progress + '%';
    refs.detailProgressFill.style.width = progress + '%';
    updateProgressPreview(progress, {
      value: refs.detailProgressValue,
      pill: refs.detailStagePill,
      copy: refs.detailStageCopy
    });
  });

  refs.detailSave.addEventListener('click', saveDetailProgress);
  refs.detailDelete.addEventListener('click', function () {
    if (!state.activeWishId) return;
    deleteWish(state.activeWishId);
  });

  window.addEventListener('resize', syncParticleBounds);
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && refs.detailModal.classList.contains('open')) {
      closeWishDetail();
    }
  });

  loadWishes();
  setSelectedOwner(state.selectedOwner);
  updateProgressPreview(0, {
    value: refs.progressValue,
    pill: refs.stagePill,
    copy: refs.stageCopy
  });
  renderAll();
})();
