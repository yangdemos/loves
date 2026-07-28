  // --- 3D Round Carousel (always auto-rotating + drag momentum) ---
  const carouselContainer = document.getElementById("carouselContainer");
  const carouselPrev = document.getElementById("carouselPrev");
  const carouselNext = document.getElementById("carouselNext");
  const carouselDots = document.getElementById("carouselDots");

  if (carouselContainer && LOVE_DATA.gallery && LOVE_DATA.gallery.length > 0) {
    const items = LOVE_DATA.gallery;
    const slideCount = items.length;

    // ---- Config ----
    const BASE_SPEED = 0.3;           // baseline auto-rotation (deg/frame)
    const DRAG_SENSITIVITY = 0.35;    // degrees per pixel dragged
    const FRICTION = 0.92;            // extra velocity decay (0-1)
    const MIN_EXTRA = 0.01;           // threshold to zero out extraVelocity
    const BASE_RADIUS = 380;
    const TILT_DEG = -8;

    // ---- State ----
    let rotY = 0;                     // cumulative rotation angle of the ring
    let extraVelocity = 0;            // extra speed from drag/flick (decays to 0)
    let isDragging = false;
    let prevX = 0;
    let dragHistory = [];             // for flick detection (last 5 positions)
    let animationId = null;
    let isVisible = false;

    // Create a ring wrapper inside the container
    const ring = document.createElement("div");
    ring.className = "carousel-ring";
    carouselContainer.appendChild(ring);

    // Render slides
    items.forEach(function(item, i) {
      const slide = document.createElement("div");
      slide.className = "carousel-slide";
      slide.dataset.index = i;

      const img = document.createElement("img");
      img.src = item.src;
      img.alt = item.label;

      const overlay = document.createElement("div");
      overlay.className = "slide-overlay";

      const label = document.createElement("div");
      label.className = "slide-label";
      label.textContent = item.label;

      overlay.appendChild(label);
      slide.appendChild(img);
      slide.appendChild(overlay);
      ring.appendChild(slide);
    });

    // Build dots
    for (let i = 0; i < slideCount; i++) {
      const dot = document.createElement("button");
      dot.className = "carousel-dot";
      dot.setAttribute("aria-label", "转到第 " + (i + 1) + " 张");
      if (i === 0) dot.classList.add("active");
      dot.addEventListener("click", function() { snapToIndex(i); });
      carouselDots.appendChild(dot);
    }

    // ---- Positioning ----
    function positionSlides() {
      const slides = ring.querySelectorAll(".carousel-slide");
      const total = slides.length;
      const angleStep = 360 / total;
      const radius = Math.max(280, Math.min(BASE_RADIUS, window.innerWidth * 0.22));

      slides.forEach(function(slide, i) {
        const angle = angleStep * i;
        const rad = (angle * Math.PI) / 180;
        const x = Math.sin(rad) * radius;
        const z = Math.cos(rad) * radius;

        slide.style.transform =
          "translateX(" + x + "px) translateZ(" + z + "px) rotateY(" + (-angle) + "deg)";
      });

      return radius;
    }

    let radius = positionSlides();

    // ---- Update loop ----
    function updateVisibleSlides(currentRotY) {
      const slides = ring.querySelectorAll(".carousel-slide");
      const dots = carouselDots.querySelectorAll(".carousel-dot");
      const total = slides.length;
      const angleStep = 360 / total;

      // Find the closest slide to the front (0 deg mod 360)
      let minDist = Infinity;
      let closestIdx = 0;

      slides.forEach(function(slide, i) {
        let worldAngle = ((currentRotY + i * angleStep) % 360 + 360) % 360;
        let dist = Math.min(worldAngle, 360 - worldAngle);
        slide.dataset.worldAngle = worldAngle;

        // Opacity based on angular distance from front
        const opacity = dist > 120 ? 0 : 1 - (dist / 120) * 0.4;
        slide.style.opacity = opacity;
        slide.style.pointerEvents = dist < 50 ? "auto" : "none";

        if (dist < minDist) {
          minDist = dist;
          closestIdx = i;
        }
      });

      // Update active class
      slides.forEach(function(slide, i) {
        slide.classList.toggle("active", i === closestIdx);
      });

      // Update dots
      dots.forEach(function(d, i) {
        d.classList.toggle("active", i === closestIdx);
      });
    }

    // ---- Animation loop ----
    function animate() {
      if (!isVisible) {
        animationId = null;
        return;
      }

      // Always apply baseline auto-rotation
      rotY += BASE_SPEED;

      // Apply extra velocity (from drag/flick) and decay it
      if (isDragging || Math.abs(extraVelocity) > MIN_EXTRA) {
        rotY += extraVelocity;
        if (!isDragging) {
          extraVelocity *= FRICTION;
          if (Math.abs(extraVelocity) < MIN_EXTRA) {
            extraVelocity = 0;
          }
        }
      }

      // Apply ring rotation with tilt
      ring.style.transform =
        "rotateY(" + rotY + "deg) rotateX(" + TILT_DEG + "deg)";

      updateVisibleSlides(rotY);

      animationId = requestAnimationFrame(animate);
    }

    // ---- Start / stop based on visibility ----
    function startAnimation() {
      if (animationId) return;
      isVisible = true;
      animate();
    }

    function stopAnimation() {
      isVisible = false;
      if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
    }

    // ---- Snap to a specific slide ----
    function snapToIndex(index) {
      const total = ring.querySelectorAll(".carousel-slide").length;
      const angleStep = 360 / total;
      // Target rotY so that slide index faces front (0 deg)
      const targetRotY = -index * angleStep;
      // Animate smoothly
      const startRot = rotY;
      const delta = ((targetRotY - startRot) % 360 + 540) % 360 - 180;
      const duration = 400;
      const startTime = performance.now();

      function snapAnim(now) {
        const t = Math.min((now - startTime) / duration, 1);
        const ease = 1 - Math.pow(1 - t, 3);
        rotY = startRot + delta * ease;
        ring.style.transform =
          "rotateY(" + rotY + "deg) rotateX(" + TILT_DEG + "deg)";
        updateVisibleSlides(rotY);
        if (t < 1) {
          requestAnimationFrame(snapAnim);
        } else {
          rotY = startRot + delta;
          // extraVelocity decays naturally
        }
      }
      requestAnimationFrame(snapAnim);
    }

    // ---- Drag handlers ----
    function onDragStart(clientX) {
      isDragging = true;
      prevX = clientX;
      dragHistory = [{ x: clientX, t: performance.now() }];
      carouselContainer.style.cursor = "grabbing";
    }

    function onDragMove(clientX) {
      if (!isDragging) return;
      const dx = clientX - prevX;
      prevX = clientX;
      extraVelocity += dx * DRAG_SENSITIVITY;

      dragHistory.push({ x: clientX, t: performance.now() });
      if (dragHistory.length > 5) dragHistory.shift();
    }

    function onDragEnd() {
      if (!isDragging) return;
      isDragging = false;
      carouselContainer.style.cursor = "grab";

      // Momentum from flick
      if (dragHistory.length >= 2) {
        const first = dragHistory[0];
        const last = dragHistory[dragHistory.length - 1];
        const dt = last.t - first.t;
        if (dt > 0 && dt < 300) {
          const flickVelocity = (last.x - first.x) / dt * 15;
          extraVelocity += flickVelocity * DRAG_SENSITIVITY;
        }
      }

      // No setTimeout - baseline auto-rotation continues immediately
    }

    // ---- Mouse events ----
    carouselContainer.addEventListener("mousedown", function(e) {
      onDragStart(e.clientX);
      e.preventDefault();
    });

    window.addEventListener("mousemove", function(e) {
      if (!isDragging) return;
      onDragMove(e.clientX);
    });

    window.addEventListener("mouseup", function() {
      onDragEnd();
    });

    // ---- Touch events ----
    carouselContainer.addEventListener("touchstart", function(e) {
      onDragStart(e.touches[0].clientX);
    }, { passive: true });

    carouselContainer.addEventListener("touchmov
    carouselContainer.addEventListener("touchmove", function(e) {
      if (!isDragging) return;
      onDragMove(e.touches[0].clientX);
    }, { passive: true });

    carouselContainer.addEventListener("touchend", function() {
      onDragEnd();
    }, { passive: true });

    // ---- Keyboard ----
    document.addEventListener("keydown", function(e) {
      if (!isVisible) return;
      if (e.key === "ArrowLeft") {
        const total = ring.querySelectorAll(".carousel-slide").length;
        const dots = carouselDots.querySelectorAll(".carousel-dot");
        let activeIdx = 0;
        dots.forEach(function(d, i) { if (d.classList.contains("active")) activeIdx = i; });
        snapToIndex((activeIdx - 1 + total) % total);
      } else if (e.key === "ArrowRight") {
        const total = ring.querySelectorAll(".carousel-slide").length;
        const dots = carouselDots.querySelectorAll(".carousel-dot");
        let activeIdx = 0;
        dots.forEach(function(d, i) { if (d.classList.contains("active")) activeIdx = i; });
        snapToIndex((activeIdx + 1) % total);
      }
    });

    // ---- Button controls ----
    if (carouselNext) {
      carouselNext.addEventListener("click", function() {
        const dots = carouselDots.querySelectorAll(".carousel-dot");
        let activeIdx = 0;
        dots.forEach(function(d, i) { if (d.classList.contains("active")) activeIdx = i; });
        snapToIndex((activeIdx + 1) % slideCount);
      });
    }
    if (carouselPrev) {
      carouselPrev.addEventListener("click", function() {
        const dots = carouselDots.querySelectorAll(".carousel-dot");
        let activeIdx = 0;
        dots.forEach(function(d, i) { if (d.classList.contains("active")) activeIdx = i; });
        snapToIndex((activeIdx - 1 + slideCount) % slideCount);
      });
    }

    // ---- Window resize ----
    let resizeTimer;
    window.addEventListener("resize", function() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function() {
        radius = positionSlides();
      }, 150);
    });

    // ---- IntersectionObserver for visibility ----
    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting) {
            startAnimation();
          } else {
            stopAnimation();
          }
        });
      }, { threshold: 0.1 });
      observer.observe(carouselContainer);
    } else {
      startAnimation();
    }
  }
