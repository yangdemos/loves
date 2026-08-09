(function() {
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderInlineSegments(text) {
    return text.split('**').map(function(part, index) {
      if (!part) return '';
      const safe = escapeHtml(part);
      return index % 2 === 1 ? '<strong>' + safe + '</strong>' : safe;
    }).join('');
  }

  function parseLetterTokens(lines) {
    const tokens = [];

    lines.forEach(function(line, index) {
      if (typeof line !== 'string') return;
      const raw = line.trim();
      if (!raw) return;

      let tag = 'para';
      if (index === 0) {
        tag = 'heading';
      } else if (/^\d{2}｜/.test(raw)) {
        tag = 'chapter';
      } else if (/^——\s*/.test(raw)) {
        tag = 'signoff';
      }

      tokens.push({
        tag: tag,
        text: raw,
        html: renderInlineSegments(raw)
      });
    });

    return tokens;
  }

  function setupEnvelopeLink() {
    const envelopeOpen = document.getElementById('envelope-open');
    if (!envelopeOpen || envelopeOpen.tagName !== 'A') return;

    envelopeOpen.addEventListener('click', function(event) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      event.preventDefault();
      envelopeOpen.classList.add('is-opening');
      window.setTimeout(function() {
        window.location.href = envelopeOpen.href;
      }, 520);
    });
  }

  function setupLetterPage() {
    const letterBody = document.getElementById('letter-body');
    const loveData = typeof LOVE_DATA !== 'undefined' ? LOVE_DATA : null;
    if (!letterBody || !loveData || !Array.isArray(loveData.letter)) return;

    const outline = document.getElementById('letter-outline');
    const progressFill = document.getElementById('letter-progress-fill');
    const readStatus = document.getElementById('letter-read-status');
    const tokens = parseLetterTokens(loveData.letter);
    const outlineItems = [];
    const html = [];
    let chapterIndex = 0;

    tokens.forEach(function(token, index) {
      if (token.tag === 'heading') {
        html.push('<div class="letter-heading letter-heading-main">' + token.html + '</div>');
        return;
      }

      if (token.tag === 'chapter') {
        chapterIndex += 1;
        const chapterId = 'letter-chapter-' + chapterIndex;
        outlineItems.push({
          id: chapterId,
          label: token.text
        });
        html.push('<h3 class="letter-chapter" id="' + chapterId + '" data-chapter-index="' + chapterIndex + '">' + token.html + '</h3>');
        return;
      }

      if (token.tag === 'signoff') {
        html.push('<p class="letter-signoff">' + token.html + '</p>');
        return;
      }

      const revealDelay = Math.min(index * 0.03, 0.72).toFixed(2);
      html.push('<p class="letter-reveal" style="transition-delay:' + revealDelay + 's">' + token.html + '</p>');
    });

    letterBody.innerHTML = html.join('');

    window.requestAnimationFrame(function() {
      Array.prototype.forEach.call(letterBody.querySelectorAll('.letter-reveal'), function(block) {
        block.classList.add('is-visible');
      });
    });

    if (outline && outlineItems.length) {
      outline.innerHTML = outlineItems.map(function(item, index) {
        return '<button class="letter-outline-link' + (index === 0 ? ' is-active' : '') + '" type="button" data-target="' + item.id + '">' + escapeHtml(item.label) + '</button>';
      }).join('');

      outline.addEventListener('click', function(event) {
        const trigger = event.target.closest('.letter-outline-link');
        if (!trigger) return;
        const target = document.getElementById(trigger.getAttribute('data-target'));
        if (!target) return;
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

    const chapterNodes = Array.prototype.slice.call(document.querySelectorAll('.letter-chapter'));
    const outlineLinks = outline ? Array.prototype.slice.call(outline.querySelectorAll('.letter-outline-link')) : [];

    function updateActiveChapter() {
      if (!chapterNodes.length || !outlineLinks.length) return;

      let activeIndex = 0;
      chapterNodes.forEach(function(node, index) {
        const rect = node.getBoundingClientRect();
        if (rect.top <= 180) activeIndex = index;
      });

      outlineLinks.forEach(function(link, index) {
        link.classList.toggle('is-active', index === activeIndex);
      });

      if (readStatus) {
        readStatus.textContent = '正在读：' + chapterNodes[activeIndex].textContent;
      }
    }

    function updateProgress() {
      if (!progressFill) return;
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop || 0;
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = maxScroll > 0 ? Math.min(scrollTop / maxScroll, 1) : 0;
      progressFill.style.width = (ratio * 100).toFixed(2) + '%';
    }

    updateActiveChapter();
    updateProgress();
    window.addEventListener('scroll', updateActiveChapter, { passive: true });
    window.addEventListener('scroll', updateProgress, { passive: true });
    window.addEventListener('resize', updateActiveChapter);
  }

  document.addEventListener('DOMContentLoaded', function() {
    setupEnvelopeLink();
    setupLetterPage();
  });
})();
