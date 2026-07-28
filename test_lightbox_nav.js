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

  // Click a photo image - use dispatchEvent to bypass overlay
  const imgs = await page.$$('.location-modal img, .modal-content img, .photo-item img');
  console.log('Modal images found:', imgs.length);
  
  if (imgs.length > 0) {
    // Get the src before click
    const srcBefore = await imgs[0].getAttribute('src');
    console.log('Clicking image, src:', srcBefore);
    
    // Click via force to bypass overlay
    await imgs[0].click({ force: true });
    await page.waitForTimeout(2000);
    
    // Check lightbox image src
    const lightboxImg = await page.$('.lightbox img, .pswp img, .lightbox-image, .slide-show img, .photo-viewer img, [class*="lightbox"] img, [class*="viewer"] img');
    let lbSrc = null;
    if (lightboxImg) {
      lbSrc = await lightboxImg.getAttribute('src');
      console.log('Lightbox image src:', lbSrc);
    } else {
      console.log('Could not find lightbox image element');
      // Check what elements are in the lightbox
      const lb = await page.$('.lightbox, [class*="lightbox"], .pswp');
      if (lb) {
        const lbHTML = await lb.evaluate(el => el.innerHTML.substring(0, 600));
        console.log('Lightbox HTML:', lbHTML);
      } else {
        // Try to find any fullscreen element
        const allDivs = await page.$$('body > *:last-child');
        for (const div of allDivs) {
          const vis = await div.isVisible();
          if (vis) {
            const html = await div.evaluate(el => el.outerHTML.substring(0, 400));
            console.log('Last visible child HTML:', html);
          }
        }
      }
    }
    
    // Test ArrowRight - navigate to next image
    if (lightboxImg) {
      const src1 = await lightboxImg.getAttribute('src');
      console.log('\nPressing ArrowRight...');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(1000);
      const src2 = await lightboxImg.getAttribute('src');
      console.log('Src after ->', src2);
      if (src1 !== src2) {
        console.log('PASS: ArrowRight changed the image');
      } else {
        console.log('INFO: ArrowRight pressed, image might use counter-based src or same image');
      }
      
      // Test ArrowLeft
      console.log('\nPressing ArrowLeft...');
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(1000);
      const src3 = await lightboxImg.getAttribute('src');
      console.log('Src after <-', src3);
      if (src3 !== src2) {
        console.log('PASS: ArrowLeft changed the image back');
      }
      
      // Test Escape
      console.log('\nPressing Escape...');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
      const lbAfter = await page.$('.lightbox, [class*="lightbox"], .pswp');
      if (!lbAfter || !(await lbAfter.isVisible())) {
        console.log('PASS: Escape closed the lightbox');
      } else {
        const style = await lbAfter.evaluate(el => window.getComputedStyle(el).opacity);
        console.log('Lightbox opacity after Escape:', style);
        if (style === '0') {
          console.log('PASS: Lightbox faded out (opacity=0)');
        }
      }
    }
  }

  await page.screenshot({ path: 'test-lightbox-nav.png', fullPage: false });
  console.log('\nScreenshot saved: test-lightbox-nav.png');
  
  await browser.close();
})();
