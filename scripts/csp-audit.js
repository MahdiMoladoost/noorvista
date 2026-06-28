'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'public');
const output = path.join(root, 'docs', 'reports', 'csp-inventory.md');

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(target, files);
    else if (entry.name.endsWith('.html')) files.push(target);
  }
  return files;
}

const rows = [];
let totalScripts = 0;
let totalStyles = 0;
let totalStyleAttrs = 0;
let totalEvents = 0;
for (const file of walk(publicDir)) {
  const html = fs.readFileSync(file, 'utf8');
  const inlineScripts = [...html.matchAll(/<script\b(?![^>]*\bsrc\s*=)[^>]*>[\s\S]*?<\/script>/gi)].length;
  const inlineStyles = [...html.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi)].length;
  const styleAttrs = [...html.matchAll(/\sstyle\s*=\s*["'][^"']*["']/gi)].length;
  const eventAttrs = [...html.matchAll(/\son[a-z]+\s*=\s*["'][^"']*["']/gi)].length;
  if (inlineScripts || inlineStyles || styleAttrs || eventAttrs) {
    rows.push({ file: path.relative(root, file).replace(/\\/g, '/'), inlineScripts, inlineStyles, styleAttrs, eventAttrs });
  }
  totalScripts += inlineScripts;
  totalStyles += inlineStyles;
  totalStyleAttrs += styleAttrs;
  totalEvents += eventAttrs;
}

const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const cspUsesUnsafeEval = /scriptSrc(?:Elem)?:\s*\[[^\]]*unsafe-eval/s.test(server);
const lines = [
  '# CSP migration inventory', '',
  `Generated: ${new Date().toISOString()}`, '',
  `- HTML files scanned: ${walk(publicDir).length}`,
  `- Inline <script> blocks: ${totalScripts}`,
  `- Inline <style> blocks: ${totalStyles}`,
  `- style attributes: ${totalStyleAttrs}`,
  `- inline event attributes: ${totalEvents}`,
  `- unsafe-eval in active Helmet CSP: ${cspUsesUnsafeEval ? 'YES' : 'NO'}`,
  '',
  '> This report is a migration inventory. A clean accessibility or syntax run does not mean unsafe-inline has been removed.',
  '',
  '| File | inline scripts | inline styles | style attrs | event attrs |',
  '|---|---:|---:|---:|---:|',
  ...rows.map((row) => `| \`${row.file}\` | ${row.inlineScripts} | ${row.inlineStyles} | ${row.styleAttrs} | ${row.eventAttrs} |`),
  ''
];
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, lines.join('\n'));
console.log(`CSP inventory: unsafe-eval=${cspUsesUnsafeEval ? 'yes' : 'no'}, inline scripts=${totalScripts}, event attrs=${totalEvents}`);
if (process.argv.includes('--fail-on-unsafe-eval') && cspUsesUnsafeEval) process.exitCode = 1;
