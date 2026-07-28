const fs = require('fs');
let lines = fs.readFileSync('js/main.js', 'utf8').split('
');

const newSection = [];
newSection.push('  // --- 3D Round Carousel (always auto-rotating + drag momentum) ---');
newSection.push('  const carouselContainer = document.getElementById(\"carouselContainer\");');
console.log('test ok');