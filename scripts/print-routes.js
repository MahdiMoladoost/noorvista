const fs = require('fs');
const path = require('path');
console.log(fs.readFileSync(path.join(__dirname, '..', 'docs', 'routes-map.md'), 'utf8'));
