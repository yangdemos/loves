(function () {
  'use strict';

  if (window.top !== window.self) return;

  var routes = {
    story: 'story.html',
    letter: 'letter.html'
  };

  function getSubpageFromHref(href) {
    if (!href) return null;
    var normalized = href.split('#')[0].split('?')[0];
    if (normalized.slice(-10) === 'story.html') return 'story';
    if (normalized.slice(-11) === 'letter.html') return 'letter';
    return null;
  }

  function getRequestedSubpage() {
    var params = new URLSearchParams(window.location.search);
    var requested = params.get('subpage');
    return routes[requested] ? requested : null;
  }

  var root = document.createElement('div');
  root.className = 'subpage-shell';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML =
    '<div class="subpage-shell__backdrop" data-shell-close="true"></div>' +
    '<div class="subpage-shell__panel">' +
      '<iframe class="subpage-shell__frame" title="内容详情页" loading="eager" referrerpolicy="same-origin" allow="fullscreen"></iframe>' +
    '</div>' +
    '<button class="subpage-shell__close" type="button" aria-label="关闭详情页">&times;</button>';

  document.body.appendChild(root);

  var iframe = root.querySelector('.subpage-shell__frame');
  var closeBtn = root.querySelector('.subpage-shell__close');
  var backdrop = root.querySelector('.subpage-shell__backdrop');
  var activeSubpage = null;
  var restoreUrl = window.location.pathname + window.location.hash;

  function updateHistory(subpage, mode) {
    var nextUrl = new URL(window.location.href);
    if (subpage) nextUrl.searchParams.set('subpage', subpage);
    else nextUrl.searchParams.delete('subpage');
    var nextHref = nextUrl.pathname + nextUrl.search + nextUrl.hash;
    var state = { subpage: subpage || null, restoreUrl: restoreUrl };
    if (mode === 'replace') history.replaceState(state, '', nextHref);
    else history.pushState(state, '', nextHref);
  }

  function setOpenState(isOpen) {
    root.classList.toggle('is-open', isOpen);
    root.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    document.body.classList.toggle('subpage-shell-open', isOpen);
  }

  function openSubpage(subpage, options) {
    if (!routes[subpage]) return;

    options = options || {};
    if (!options.preserveRestoreUrl) {
      restoreUrl = window.location.pathname + window.location.search + window.location.hash;
      if (restoreUrl.indexOf('subpage=') !== -1) {
        restoreUrl = window.location.pathname + window.location.hash;
      }
    }

    activeSubpage = subpage;
    iframe.src = routes[subpage] + '?embed=1';
    setOpenState(true);

    if (options.historyMode) {
      updateHistory(subpage, options.historyMode);
    }
  }

  function closeSubpage(options) {
    options = options || {};
    activeSubpage = null;
    iframe.src = 'about:blank';
    setOpenState(false);

    if (options.historyMode) {
      updateHistory(null, options.historyMode);
    }
  }

  document.addEventListener('click', function (event) {
    var link = event.target.closest('a[href]');
    if (!link) return;
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    var subpage = link.dataset.subpageTarget || getSubpageFromHref(link.getAttribute('href'));
    if (!subpage) return;

    event.preventDefault();
    openSubpage(subpage, { historyMode: 'push' });
  });

  closeBtn.addEventListener('click', function () {
    if (!activeSubpage) return;
    closeSubpage({ historyMode: 'replace' });
  });

  backdrop.addEventListener('click', function () {
    if (!activeSubpage) return;
    closeSubpage({ historyMode: 'replace' });
  });

  window.addEventListener('message', function (event) {
    if (event.origin !== window.location.origin) return;
    if (!event.data || event.data.type !== 'subpage-shell:close') return;
    closeSubpage({ historyMode: 'replace' });
  });

  window.addEventListener('popstate', function () {
    var requested = getRequestedSubpage();
    if (requested) {
      openSubpage(requested, { preserveRestoreUrl: true });
      return;
    }
    if (activeSubpage) closeSubpage();
  });

  var requestedOnLoad = getRequestedSubpage();
  if (requestedOnLoad) {
    restoreUrl = window.location.pathname + window.location.hash;
    openSubpage(requestedOnLoad, { historyMode: 'replace', preserveRestoreUrl: true });
  }
}());
