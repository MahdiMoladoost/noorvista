'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const roots = ['server.js', 'src', 'scripts', path.join('public', 'assets', 'js')];
const files = [];

function collect(target) {
  const full = path.join(root, target);
  const stat = fs.statSync(full);
  if (stat.isFile()) {
    if (full.endsWith('.js')) files.push(full);
    return;
  }
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    const relative = path.join(target, entry.name);
    if (entry.isDirectory()) collect(relative);
    else if (entry.name.endsWith('.js') && !entry.name.endsWith('.min.js')) files.push(path.join(root, relative));
  }
}

for (const target of roots) collect(target);
const failures = [];
for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ['-c', file], { encoding: 'utf8' });
  if (result.status !== 0) failures.push({ file: path.relative(root, file), error: result.stderr.trim() });
}

console.log(`Syntax check: ${files.length - failures.length}/${files.length} JavaScript files passed`);
for (const failure of failures) console.error(`\n${failure.file}\n${failure.error}`);
if (failures.length) process.exitCode = 1;
