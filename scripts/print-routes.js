'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const root = path.join(__dirname, '..');
const map = path.join(root, 'docs', 'routes-map.md');
if (!fs.existsSync(map)) {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'generate-route-map.js')], { stdio: 'inherit' });
  if (result.status) process.exit(result.status);
}
process.stdout.write(fs.readFileSync(map, 'utf8'));
