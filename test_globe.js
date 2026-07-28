const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  // Collect console errors
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push({ text: msg.text(), location: msg.location() });
    }
  });
  page.on('pageerror', err => {
    errors.push({ text: err.message, stack: err.stack });
  });

  console.log('=== Opening page ===');
  await page.goto('http://localhost:8766', { waitUntil: 'networkidle', timeout: 30000 });
  console.log('Page loaded');

  // Report all console errors
  console.log('\n=== Console Errors ===');
  if (errors.length === 0) {
    console.log('✓ No console errors found');
  } else {
    errors.forEach(e => console.log(e.text || e));
  }

  // Check for the globe section
  console.log('\n=== Globe Section ===');
  const globeSection = await page.$('#globe');
  if (globeSection) {
    console.log('✓ Globe section found (#globe)');
    const globeBox = await globeSection.boundingBox();
    console.log(`  Position: x=${globeBox.x}, y=${globeBox.y}, w=${globeBox.width}, h=${globeBox.height}`);
  } else {
    console.log('✗ Globe section NOT found');
  }

  // Check for location chips
  console.log('\n=== Location Chips ===');
  const locationChips = await page.$$('.location-chip, [class*="location"]');
  console.log(`  Found ${locationChips.length} location chips`);

  // Check for the globe canvas/container
  const globeCanvas = await page.$('#globe-container, #globeCanvas, canvas');
  console.log(`  Canvas/globe-container element: ${globeCanvas ? '✓ found' : '✗ not found'}`);

  // Take screenshot of globe section
  if (globeSection) {
    await globeSection.screenshot({ path: 'screenshot-globe-section.png' });
    console.log('  Screenshot saved: screenshot-globe-section.png');
  }

  // Scroll to globe section
  console.log('\n=== Scrolling to Globe ===');
  if (globeSection) {
    await globeSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    console.log('  Scrolled to globe section');
  }

  // Try to find and click a location chip
  console.log('\n=== Clicking Location Chips ===');
  const chips = await page.$$('.location-chip, .city-chip, [data-location], .pin');
  console.log(`  Found ${chips.length} clickable location elements`);
  
  if (chips.length > 0) {
    // Click the first visible chip
    for (const chip of chips) {
      if (await chip.isVisible()) {
        const text = await chip.textContent();
        console.log(`  Clicking: "${text.trim()}"`);
        await chip.click();
        await page.waitForTimeout(1500);
        break;
      }
    }
  }

  // Check for photo grid / modal after chip click
  console.log('\n=== Photo Grid / Modal ===');
  const photoGrid = await page.$('.photo-grid, .photos-grid, [class*="photo"], [class*="gallery"]');
  const modal = await page.$('.modal, .location-modal, [class*="modal"], [class*="overlay"], [class*="popup"]');
  console.log(`  Photo grid: ${photoGrid ? '✓ found' : '✗ not found'}`);
  console.log(`  Modal/overlay: ${modal ? '✓ found' : '✗ not found'}`);

  // Look for images/thumbnails in the grid
  const images = await page.$$('.photo-grid img, .photos-grid img, [class*="photo"] img, [class*="gallery"] img, .modal img');
  console.log(`  Images found: ${images.length}`);

  // Take screenshot after click
  await page.screenshot({ path: 'screenshot-after-click.png', fullPage: false });
  console.log('  Screenshot saved: screenshot-after-click.png');

  // Try clicking a photo image if available
  if (images.length > 0) {
    console.log('\n=== Clicking Image (Photo) ===');
    for (const img of images) {
      if (await img.isVisible()) {
        console.log(`  Clicking image: ${await img.getAttribute('src') || '(no src)'}`);
        await img.click();
        await page.waitForTimeout(1500);
        break;
      }
    }
  }

  // Check for lightbox
  console.log('\n=== Lightbox ===');
  const lightbox = await page.$('.lightbox, [class*="lightbox"], .pswp, [class*="photoswipe"], .fancybox, [class*="fancybox"]');
  console.log(`  Lightbox container: ${lightbox ? '✓ found' : '✗ not found'}`);

  // Try keyboard navigation (Escape)
  console.log('\n=== Keyboard Navigation ===');
  if (lightbox || modal) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    console.log('  Pressed Escape');
  }

  // Check if modals closed
  const modalAfter = await page.$('.modal, .location-modal, [class*="modal"], .lightbox, [class*="lightbox"]');
  console.log(`  Modal/lightbox after Escape: ${modalAfter ? 'still open' : '✓ closed'}`);

  await page.screenshot({ path: 'screenshot-final.png', fullPage: false });
  console.log('\n=== Test Complete ===');

  await browser.close();
})();
