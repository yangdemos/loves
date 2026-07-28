const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto('http://localhost:8766', { waitUntil: 'networkidle', timeout: 30000 });

  // Get all location chips
  const chips = await page.$$eval('.location-chip', els => els.map(el => ({
    text: el.textContent.trim(),
    classes: el.className,
    tag: el.tagName,
    dataset: JSON.parse(JSON.stringify(el.dataset)),
    visible: el.offsetParent !== null,
    rect: {
      x: el.getBoundingClientRect().x,
      y: el.getBoundingClientRect().y,
      w: el.getBoundingClientRect().width,
      h: el.getBoundingClientRect().height
    }
  })));
  console.log('Location chips:');
  chips.forEach((c, i) => console.log(i + ': ' + c.text + ' | visible: ' + c.visible + ' | rect: ' + JSON.stringify(c.rect) + ' | dataset: ' + JSON.stringify(c.dataset)));

  // Check the globe container
  const globeContainer = await page.$('#globe-container');
  if (globeContainer) {
    const info = await page.$eval('#globe-container', el => ({
      tag: el.tagName,
      classes: el.className,
      children: el.children.length,
      innerHTML: el.innerHTML.substring(0, 300)
    }));
    console.log('\nGlobe container:', JSON.stringify(info, null, 2));
  } else {
    console.log('\nGlobe container: NOT FOUND');
  }

  // Check canvas elements
  const canvases = await page.$$('canvas');
  console.log('\nCanvas count:', canvases.length);
  for (let i = 0; i < canvases.length; i++) {
    const info = await canvases[i].evaluate(el => ({
      id: el.id,
      width: el.width,
      height: el.height,
      classes: el.className
    }));
    console.log('  Canvas ' + i + ':', JSON.stringify(info));
  }

  // Check globe section inner structure
  const globeHTML = await page.$eval('#globe', el => el.innerHTML.substring(0, 800));
  console.log('\nGlobe section HTML (first 800 chars):');
  console.log(globeHTML);

  // Check slide overlay
  const overlay = await page.$('.slide-overlay');
  if (overlay) {
    const overlayInfo = await overlay.evaluate(el => ({
      tag: el.tagName,
      classes: el.className,
      text: el.textContent.substring(0, 100),
      html: el.innerHTML.substring(0, 200),
      rect: {
        x: el.getBoundingClientRect().x,
        y: el.getBoundingClientRect().y,
        w: el.getBoundingClientRect().width,
        h: el.getBoundingClientRect().height
      }
    }));
    console.log('\nSlide overlay:', JSON.stringify(overlayInfo, null, 2));
  } else {
    console.log('\nSlide overlay: NOT FOUND');
  }

  await browser.close();
})();
