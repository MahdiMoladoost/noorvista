'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const allowedLegacy = new Set();
const excludedTools = new Set(['src/database/init_db.js']);
const candidates = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js')) candidates.push(full);
  }
}
walk(path.join(root, 'src'));
candidates.push(path.join(root, 'server.js'));
const violations = [];
const legacy = [];
for (const file of candidates) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  if (excludedTools.has(rel)) continue;
  const source = fs.readFileSync(file, 'utf8');
  if (!/\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX)\b/i.test(source)) continue;
  (allowedLegacy.has(rel) ? legacy : violations).push(rel);
}
if (legacy.length) {
  console.error(`Legacy runtime DDL is no longer permitted: ${legacy.join(', ')}`);
  process.exit(1);
}
if (violations.length) {
  console.error(`New runtime DDL is not allowed: ${violations.join(', ')}`);
  process.exit(1);
}
