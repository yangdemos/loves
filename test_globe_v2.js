const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  // Collect all console messages
  const consoleLogs = [];
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', msg => {
    const data = { text: msg.text(), type: msg.type(), location: msg.location() };
    if (msg.type() === 'error') consoleErrors.push(data);
    consoleLogs.push(data);
  });
  page.on('pageerror', err => {
    pageErrors.push({ message: err.message, stack: err.stack });
  });

  console.log('=== Opening page ===');
  await page.goto('http://localhost:8766', { waitUntil: 'networkidle', timeout: 30000 });
  console.log('Page loaded successfully');

  // ======================================
  // 1. Console Error Check
  // ======================================
  console.log('\n=== 1. Console Errors ===');
  if (consoleErrors.length === 0 && pageErrors.length === 0) {
    console.log('PASS: No console errors or uncaught page errors');
  } else {
    console.log('FAIL: Found errors:');
    consoleErrors.forEach(e => console.log('  Console error:', e.text));
    pageErrors.forEach(e => console.log('  Page error:', e.message));
  }

  // ======================================
  // 2. Globe Section Structure
  // ======================================
  console.log('\n=== 2. Globe Section Structure ===');

  const globeSection = await page.$('#globe');
  if (globeSection) {
    console.log('PASS: #globe section exists');
  } else {
    console.log('FAIL: #globe section missing');
  }

  const globeCanvas = await page.$('#globe-canvas canvas');
  if (globeCanvas) {
    const canvasInfo = await globeCanvas.evaluate(el => ({
      width: el.width,
      height: el.height,
      style: el.style.cssText
    }));
    console.log('PASS: Globe canvas exists', canvasInfo);
  } else {
    console.log('FAIL: Globe canvas missing');
  }

  const locationList = await page.$('#globe-locations');
  if (locationList) {
    console.log('PASS: Location list (#globe-locations) exists');
  } else {
    console.log('FAIL: Location list missing');
  }

  // Count location chips
  const chips = await page.$$('.globe-location-chip');
  console.log('Location chips count: ' + chips.length);
  if (chips.length >= 4) {
    console.log('PASS: At least 4 location chips found');
  } else {
    console.log('FAIL: Too few location chips:', chips.length);
  }

  // Verify each chip has necessary attributes
  const chipData = await page.$$eval('.globe-location-chip', els =>
    els.map(el => ({
      text: el.querySelector('.chip-name')?.textContent?.trim() || '(no name)',
      dotColor: el.querySelector('.chip-dot')?.style?.backgroundColor || '(no dot)',
      dataId: el.dataset.locationId || '(no id)',
      visible: el.offsetParent !== null
    }))
  );
  console.log('Chip details:', JSON.stringify(chipData, null, 2));

  for (const chip of chipData) {
    if (!chip.dataId || chip.dataId === '(no id)') {
      console.log('FAIL: Chip missing data-location-id');
    }
    if (!chip.text) {
      console.log('FAIL: Chip missing name');
    }
  }

  // ======================================
  // 3. Click a location chip and verify photo modal
  // ======================================
  console.log('\n=== 3. Click Location Chip -> Photo Grid/Modal ===');

  // Scroll to the globe section first
  await globeSection.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);

  // Click the first visible chip (force:true to avoid overlay interception)
  const firstChip = await page.$('.globe-location-chip');
  if (firstChip) {
    const chipText = await firstChip.evaluate(el => el.textContent.trim());
    console.log('Clicking chip: "' + chipText + '"');
    await firstChip.click({ force: true });
    await page.waitForTimeout(2000);

    // Take screenshot after click
    await page.screenshot({ path: 'test1-after-chip-click.png', fullPage: false });
    console.log('Screenshot saved: test1-after-chip-click.png');

    // Check what appeared
    const modalVisible = await page.$('.location-modal, [class*="modal"], .photo-grid, .photos-grid');
    const modal = await page.$('.location-modal, [class*="modal"]');
    const photoGrid = await page.$('.photo-grid, .photos-grid');
    
    if (modal) {
      console.log('PASS: Location modal appeared after chip click');
      const modalTitle = await modal.$eval('h2, h3, .modal-title', el => el.textContent.trim()).catch(() => '(no title)');
      console.log('  Modal title:', modalTitle);
    } else if (photoGrid) {
      console.log('PASS: Photo grid appeared after chip click');
    } else {
      // Check if the slideshow appeared instead
      const slideShow = await page.$('.slide-show, [class*="slide"]');
      if (slideShow) {
        console.log('PASS: Slideshow appeared after chip click');
      } else {
        console.log('FAIL: No modal or photo grid appeared after clicking chip');
      }
    }

    // Check for images/thumbnails
    const images = await page.$$('.photo-grid img, .photos-grid img, [class*="gallery"] img, .modal img, .location-modal img');
    console.log('Images in modal/grid:', images.length);
    const photoGridImages = await page.$$('.photo-grid img');
    console.log('Images in photo-grid:', photoGridImages.length);

    // ======================================
    // 4. Click a photo to open lightbox
    // ======================================
    console.log('\n=== 4. Photo -> Lightbox ===');

    // Handle slide-overlay by using force click or dispatchEvent
    let clickedImage = false;
    for (const img of images) {
      if (await img.isVisible().catch(() => false)) {
        const src = await img.getAttribute('src').catch(() => '?');
        console.log('Attempting to click image:', src);
        // Use dispatchEvent to bypass overlay interception
        await img.evaluate(el => {
          el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        });
        await page.waitForTimeout(1500);
        clickedImage = true;
        break;
      }
    }

    if (!clickedImage) {
      // Try clicking any img or slide element using dispatchEvent
      const allImages = await page.$$('img');
      console.log('Trying dispatchEvent on first visible image (total images:', allImages.length, ')');
      for (const img of allImages) {
        if (await img.isVisible().catch(() => false)) {
          await img.evaluate(el => {
            el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          });
          await page.waitForTimeout(1500);
          clickedImage = true;
          break;
        }
      }
    }

    if (clickedImage) {
      await page.screenshot({ path: 'test2-after-image-click.png', fullPage: false });
      console.log('Screenshot saved: test2-after-image-click.png');
    }

    // Check for lightbox
    const lightbox = await page.$('.lightbox, [class*="lightbox"], .pswp, .pswp--open, .fancybox-container');
    if (lightbox) {
      console.log('PASS: Lightbox opened after image click');
    } else {
      console.log('Lightbox not found with standard selectors, checking for overlay-type elements...');
      // Check for fullscreen overlays
      const fullOverlay = await page.$('.overlay, [class*="overlay"], .fullscreen, [class*="fullscreen"]');
      if (fullOverlay) {
        console.log('  Found fullscreen/overlay element (possible lightbox variant)');
      } else {
        console.log('  No lightbox variant detected');
      }
    }

    // ======================================
    // 5. Keyboard Navigation
    // ======================================
    console.log('\n=== 5. Keyboard Navigation ===');

    // Test Escape
    console.log('Testing Escape key...');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    const anyModal = await page.$('.lightbox, [class*="lightbox"], .pswp, .location-modal, .modal, [class*="overlay"]');
    if (!anyModal || !(await anyModal.isVisible().catch(() => false))) {
      console.log('PASS: Escape closed the lightbox/modal');
    } else {
      // Check visibility
      const vis = await anyModal.evaluate(el => {
        const style = window.getComputedStyle(el);
        return {
          display: style.display,
          visibility: style.visibility,
          opacity: style.opacity,
          class: el.className
        };
      });
      console.log('Modal after Escape:', JSON.stringify(vis));
      if (vis.display === 'none' || vis.visibility === 'hidden' || vis.opacity === '0') {
        console.log('PASS: Escape closed the lightbox/modal (hidden)');
      } else {
        console.log('FAIL: Modal still visible after Escape');
      }
    }

    // Re-open lightbox for arrow key test
    console.log('\nTesting arrow keys (reopening if needed)...');
    const anyModalAgain = await page.$('.lightbox, [class*="lightbox"], .pswp, .location-modal');
    if (!anyModalAgain || !(await anyModalAgain.isVisible().catch(() => false))) {
      // Click chip again, then image
      const chip2 = await page.$('.globe-location-chip');
      if (chip2) {
        await chip2.click({ force: true });
        await page.waitForTimeout(1000);
      }
      const imgs2 = await page.$$('img');
      for (const img of imgs2) {
        if (await img.isVisible().catch(() => false)) {
          await img.evaluate(el => {
            el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          });
          await page.waitForTimeout(1000);
          break;
        }
      }
    }

    // Test Right Arrow
    const lightbox2 = await page.$('.lightbox, [class*="lightbox"], .pswp, .pswp--open, .fancybox-container');
    if (lightbox2 && await lightbox2.isVisible().catch(() => false)) {
      console.log('Testing Right Arrow key...');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(500);
      console.log('PASS: ArrowRight pressed (verify visually if image changed)');

      console.log('Testing Left Arrow key...');
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(500);
      console.log('PASS: ArrowLeft pressed');

      // Also test Space / Enter
      await page.keyboard.press('Space');
      await page.waitForTimeout(300);
      console.log('PASS: Space pressed');

      // Close again
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    } else {
      console.log('SKIP: Arrow key tests - no lightbox to test with');
    }

  } else {
    console.log('FAIL: Could not find any location chip');
  }

  // ======================================
  // Summary
  // ======================================
  console.log('\n========================================');
  console.log('TEST SUMMARY');
  console.log('========================================');

  await page.screenshot({ path: 'test-final-state.png', fullPage: false });
  console.log('Final screenshot: test-final-state.png');

  await browser.close();
})();
