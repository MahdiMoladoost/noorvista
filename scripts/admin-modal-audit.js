'use strict';
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'public/pages/dashboard/admin');
const files = fs.readdirSync(dir).filter(name => name.endsWith('.html')).sort();
const issues = [];
const modals = [];

for (const file of files) {
  const source = fs.readFileSync(path.join(dir, file), 'utf8');
  if (!source.includes('admin-modal-system-2.1.14.css')) issues.push(`${file}: modal CSS missing`);
  if (!source.includes('admin-modal-system-2.1.15.js')) issues.push(`${file}: modal JS missing`);
  const tags = source.match(/<div\b[^>]*class="[^"]*\b(?:modal-overlay|admin-modal-overlay)\b[^"]*"[^>]*>/g) || [];
  for (const tag of tags) {
    const id = tag.match(/\bid="([^"]+)"/)?.[1] || '(without id)';
    modals.push({ file, id });
    if (id === '(without id)') issues.push(`${file}: modal without id`);
  }
}

const report = {
  pages: files.length,
  modals: modals.length,
  modalIds: modals,
  issues
};
console.log(JSON.stringify(report, null, 2));
if (process.argv.includes('--fail') && issues.length) process.exitCode = 1;
