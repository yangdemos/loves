/* ============================================
   Love & Peace Travel - Main JavaScript
   ============================================ */

document.addEventListener('DOMContentLoaded', function() {

  // --- Navbar scroll effect ---
  const navbar = document.querySelector('#navbar');
  let lastScroll = 0;

  window.addEventListener('scroll', function() {
    const currentScroll = window.pageYOffset;
    if (currentScroll > 80) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
    lastScroll = currentScroll;
  });

  // --- Mobile Hamburger ---
  const hamburger = document.querySelector('.nav-toggle');
  const navLinks = document.querySelector('.nav-links');

  if (hamburger && navLinks) {
    hamburger.addEventListener('click', function() {
      hamburger.classList.toggle('open');
      navLinks.classList.toggle('open');
    });

    // Close on link click
    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', function() {
        hamburger.classList.remove('open');
        navLinks.classList.remove('open');
      });
    });
  }

  // (Hero uses fullscreen video background — no slider needed)

  // --- Counter Animation (stats) ---
  function animateCounter(element, target) {
    let current = 0;
    const increment = Math.ceil(target / 60);
    const timer = setInterval(function() {
      current += increment;
      if (current >= target) {
        current = target;
        clearInterval(timer);
      }
      element.textContent = current + (target >= 1000 ? '+' : '+');
    }, 25);
  }

  // Intersection Observer for stats
  const statNumbers = document.querySelectorAll('.counter-value');
  if (statNumbers.length > 0) {
    let statsAnimated = false;
    const observer = new IntersectionObserver(function(entries) {
      entries.forEach(entry => {
        if (entry.isIntersecting && !statsAnimated) {
          statsAnimated = true;
          statNumbers.forEach(el => {
            const target = parseInt(el.getAttribute('data-target'));
            if (target) animateCounter(el, target);
          });
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });

    observer.observe(document.querySelector('.counters-grid'));
  }

  // (Newsletter form removed — not present on this page)

  // --- Smooth scroll for anchor links ---
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // --- Lazy load images with Intersection Observer ---
  if ('IntersectionObserver' in window) {
    const lazyImages = document.querySelectorAll('img[loading="lazy"]');
    const imageObserver = new IntersectionObserver(function(entries) {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          if (img.dataset.src) {
            img.src = img.dataset.src;
            img.removeAttribute('data-src');
          }
          imageObserver.unobserve(img);
        }
      });
    });

    lazyImages.forEach(img => imageObserver.observe(img));
  }

  // --- Letter Typewriter Effect ---
  const letterBody = document.getElementById('letter-body');
  const letterDate = document.getElementById('letter-date');
  if (letterBody && letterDate && LOVE_DATA.letter) {
    const fullText = LOVE_DATA.letter.join('\n\n');
    letterDate.textContent = LOVE_DATA.meetDate;

    const letterObserver = new IntersectionObserver(function(entries) {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          letterObserver.unobserve(entry.target);
          letterBody.textContent = '';
          let charIndex = 0;
          const typeInterval = setInterval(function() {
            if (charIndex < fullText.length) {
              letterBody.textContent += fullText[charIndex];
              charIndex++;
              // Auto-scroll the letter body as text fills
              letterBody.scrollTop = letterBody.scrollHeight;
            } else {
              clearInterval(typeInterval);
            }
          }, 30);
        }
      });
    }, { threshold: 0.3 });

    letterObserver.observe(letterBody);
  }

  // --- Gallery Grid Render ---
  const galleryGrid = document.getElementById('gallery-grid');
  if (galleryGrid && LOVE_DATA.gallery && LOVE_DATA.gallery.length > 0) {
    LOVE_DATA.gallery.forEach(function(item, index) {
      const card = document.createElement('div');
      card.className = 'gallery-item';
      card.style.setProperty('--card-delay', index * 0.05 + 's');

      const img = document.createElement('img');
      img.className = 'gallery-item-img';
      img.src = item.src;
      img.alt = item.label;
      img.loading = 'lazy';

      const overlay = document.createElement('div');
      overlay.className = 'gallery-item-overlay';

      const caption = document.createElement('p');
      caption.className = 'gallery-item-label';
      caption.textContent = item.label;

      overlay.appendChild(caption);
      card.appendChild(img);
      card.appendChild(overlay);
      galleryGrid.appendChild(card);
    });
  }

  // --- Globe Locations List (Chips) ---
  const locationsList = document.getElementById('globe-locations');
  if (locationsList && LOVE_DATA.locations && LOVE_DATA.locations.length > 0) {
    LOVE_DATA.locations.forEach(function(loc) {
      const chip = document.createElement('button');
      chip.className = 'globe-location-chip';
      chip.dataset.locationId = loc.id;

      const dot = document.createElement('span');
      dot.className = 'chip-dot';
      dot.style.backgroundColor = loc.color;

      const name = document.createElement('span');
      name.className = 'chip-name';
      name.textContent = loc.name;

      chip.appendChild(dot);
      chip.appendChild(name);

      chip.addEventListener('click', function() {
        if (window.openLocationModal) {
          window.openLocationModal(loc.id);
        }
        if (window.rotateGlobeToLocation) {
          window.rotateGlobeToLocation(loc.lat, loc.lng);
        }
      });

      locationsList.appendChild(chip);
    });
  }

  // --- Location Modal ---
  const modal = document.getElementById('location-modal');
  const modalOverlay = modal.querySelector('.modal-overlay');
  const modalClose = modal.querySelector('.modal-close');
  const modalHero = document.getElementById('modal-hero');
  const modalDesc = document.getElementById('modal-description');
  const modalPhotosGrid = document.getElementById('modal-photos-grid');

  function openLocationModal(locationId) {
    const loc = LOVE_DATA.locations.find(function(l) { return l.id === locationId; });
    if (!loc) return;

    // Set hero image
    modalHero.style.backgroundImage = 'url(' + loc.heroImage + ')';

    // Set description
    modalDesc.textContent = loc.description;

    // Render photos
    modalPhotosGrid.innerHTML = '';
    if (loc.photos && loc.photos.length > 0) {
      loc.photos.forEach(function(photoUrl) {
        const photoItem = document.createElement('div');
        photoItem.className = 'modal-photo-item';

        const photoImg = document.createElement('img');
        photoImg.className = 'modal-photo-img';
        photoImg.src = photoUrl;
        photoImg.loading = 'lazy';
        photoImg.alt = loc.name;

        photoItem.appendChild(photoImg);
        modalPhotosGrid.appendChild(photoItem);
      });
    }

    // Show modal with GSAP animation
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    if (window.gsap) {
      gsap.fromTo(modal.querySelector('.modal-container'),
        { opacity: 0, y: 40, scale: 0.95 },
        { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'power3.out' }
      );
      gsap.fromTo(modalOverlay,
        { opacity: 0 },
        { opacity: 1, duration: 0.4, ease: 'power2.out' }
      );
    }
  }

  function closeLocationModal() {
    if (window.gsap) {
      gsap.to(modal.querySelector('.modal-container'), {
        opacity: 0, y: 20, scale: 0.95,
        duration: 0.3, ease: 'power2.in',
        onComplete: function() {
          modal.classList.remove('open');
          document.body.style.overflow = '';
        }
      });
      gsap.to(modalOverlay, {
        opacity: 0, duration: 0.25
      });
    } else {
      modal.classList.remove('open');
      document.body.style.overflow = '';
    }
  }

  // Expose globally for globe.js to call
  window.openLocationModal = openLocationModal;

  // Modal close events
  if (modalClose) {
    modalClose.addEventListener('click', closeLocationModal);
  }
  if (modalOverlay) {
    modalOverlay.addEventListener('click', closeLocationModal);
  }
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && modal.classList.contains('open')) {
      closeLocationModal();
    }
  });

  // --- Hide loading spinner ---
  document.getElementById('loader')?.classList.add('hidden');
});
