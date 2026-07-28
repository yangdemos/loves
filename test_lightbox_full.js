const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto('http://localhost:8766', { waitUntil: 'networkidle', timeout: 30000 });

  // Scroll to globe
  await page.$eval('#globe', el => el.scrollIntoView({ behavior: 'instant', block: 'center' }));
  await page.waitForTimeout(1000);

  // Click first location chip (北京)
  await page.click('.globe-location-chip', { force: true });
  await page.waitForTimeout(2000);

  // Verify modal is open
  const modal = await page.$('#location-modal.open');
  console.log('Modal open:', !!modal);

  // Get modal photos
  const modalPhotos = await page.$$('.modal-photo-img');
  console.log('Modal photos found:', modalPhotos.length);

  if (modalPhotos.length > 0) {
    const firstSrc = await modalPhotos[0].getAttribute('src');
    console.log('Clicking modal photo:', firstSrc);

    // Click via force to bypass any overlay
    await modalPhotos[0].click({ force: true });
    await page.waitForTimeout(2000);

    // Check lightbox
    const lightboxImg = await page.$('.image-lightbox-img');
    if (lightboxImg) {
      const lbSrc = await lightboxImg.getAttribute('src');
      const lbVisible = await lightboxImg.isVisible();
      const lbRect = await lightboxImg.evaluate(el => ({
        w: el.getBoundingClientRect().width,
        h: el.getBoundingClientRect().height,
        display: window.getComputedStyle(el).display,
        opacity: window.getComputedStyle(el).opacity
      }));
      console.log('Lightbox img src:', lbSrc);
      console.log('Lightbox img visible:', lbVisible, 'rect:', JSON.stringify(lbRect));

      // --- Test: ArrowRight navigation ---
      const srcBefore = await lightboxImg.getAttribute('src');
      console.log('\n--- ArrowRight ---');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(800);
      const srcAfter = await lightboxImg.getAttribute('src');
      console.log('Src before:', srcBefore);
      console.log('Src after:', srcAfter);
      console.log('Changed:', srcBefore !== srcAfter ? 'YES (PASS)' : 'NO (might be same in loop)');

      // --- Test: ArrowLeft navigation ---
      const srcBefore2 = await lightboxImg.getAttribute('src');
      console.log('\n--- ArrowLeft ---');
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(800);
      const srcAfter2 = await lightboxImg.getAttribute('src');
      console.log('Src before:', srcBefore2);
      console.log('Src after:', srcAfter2);
      console.log('Changed:', srcBefore2 !== srcAfter2 ? 'YES (PASS)' : 'NO');

      // --- Test: Escape close ---
      console.log('\n--- Escape ---');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
      
      // Check if lightbox container is hidden (loses .open class, opacity→0)
      const lbContainerAfter = await page.$('#image-lightbox.open');
      const containerOpacity = await page.$eval('#image-lightbox', el => window.getComputedStyle(el).opacity);
      console.log('Lightbox after Escape: open=' + !!lbContainerAfter + ' opacity=' + containerOpacity);
      if (!lbContainerAfter && containerOpacity === '0') {
        console.log('PASS: Lightbox hidden after Escape');
      } else {
        console.log('FAIL: Lightbox still visible after Escape');
      }

      // --- Test: Re-open and close via close button ---
      console.log('\n--- Re-open and close via backdrop/close ---');
      await modalPhotos[0].click({ force: true });
      await page.waitForTimeout(1500);
      
      // Try clicking the overlay/backdrop (next to image)
      const lbContainer = await page.$('.image-lightbox');
      if (lbContainer) {
        // Click at a position on the backdrop (not on the image)
        await page.mouse.click(100, 200);
        await page.waitForTimeout(1000);
        const opacityAfterClick = await page.$eval('.image-lightbox', el => window.getComputedStyle(el).opacity).catch(() => '?');
        console.log('Lightbox opacity after backdrop click:', opacityAfterClick);
      }
    } else {
      console.log('FAIL: Could not find .image-lightbox-img element');
      
      // Check all image-lightbox elements
      const lbEls = await page.$$('[class*="lightbox"]');
      console.log('lightbox-related elements:', lbEls.length);
      for (const el of lbEls) {
        const info = await el.evaluate(e => ({
          tag: e.tagName,
          classes: e.className,
          id: e.id,
          html: e.outerHTML.substring(0, 300)
        }));
        console.log('  ', JSON.stringify(info));
      }
    }
  } else {
    console.log('FAIL: No modal photos found to click');
  }

  await page.screenshot({ path: 'test-lightbox-full.png', fullPage: false });
  console.log('\nFinal screenshot: test-lightbox-full.png');

  await browser.close();
})();
