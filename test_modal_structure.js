const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto('http://localhost:8766', { waitUntil: 'networkidle', timeout: 30000 });

  // Scroll to globe
  await page.$eval('#globe', el => el.scrollIntoView({ behavior: 'instant', block: 'center' }));
  await page.waitForTimeout(1000);

  // Click first location chip
  await page.click('.globe-location-chip', { force: true });
  await page.waitForTimeout(2000);

  // Find all modals/overlays
  const modalSelectors = ['.location-modal', '.modal', '.modal-content', '.location-detail', '.slide-show', '.slide-overlay', '[class*="modal"]', '[class*="overlay"]'];
  for (const sel of modalSelectors) {
    const el = await page.$(sel);
    if (el && await el.isVisible()) {
      const html = await el.evaluate(e => e.outerHTML.substring(0, 800));
      console.log('Found visible element: ' + sel);
      console.log(html.substring(0, 600));
      console.log('---');
    }
  }

  // Find all images on the page
  const allImgs = await page.$$('img');
  console.log('\nAll images on page:', allImgs.length);
  for (let i = 0; i < allImgs.length; i++) {
    const info = await allImgs[i].evaluate(el => ({
      src: el.src || el.getAttribute('src'),
      alt: el.alt,
      classes: el.className,
      parent: el.parentElement?.className || '(no parent)',
      visible: el.offsetParent !== null,
      rect: {
        x: el.getBoundingClientRect().x,
        y: el.getBoundingClientRect().y,
        w: el.getBoundingClientRect().width,
        h: el.getBoundingClientRect().height
      }
    }));
    console.log('  img[' + i + ']:', JSON.stringify(info));
  }

  await page.screenshot({ path: 'test-modal-structure.png', fullPage: false });
  console.log('\nScreenshot: test-modal-structure.png');

  await browser.close();
})();
