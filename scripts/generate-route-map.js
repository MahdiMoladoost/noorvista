'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const routesDir = path.join(root, 'src', 'routes');
const serverPath = path.join(root, 'server.js');
const server = fs.readFileSync(serverPath, 'utf8');

const sourceFiles = [serverPath];
for (const name of fs.readdirSync(routesDir).filter((name) => name.endsWith('.js')).sort()) {
  sourceFiles.push(path.join(routesDir, name));
}

function normalizeModulePath(fromFile, request) {
  if (!request.startsWith('.')) return null;
  const resolved = path.resolve(path.dirname(fromFile), request);
  const candidates = [resolved, `${resolved}.js`, path.join(resolved, 'index.js')];
  const hit = candidates.find((candidate) => fs.existsSync(candidate));
  return hit ? path.relative(root, hit).replace(/\\/g, '/') : null;
}

// Map imported variable/factory names to their actual route module.
const importToFile = new Map();
for (const match of server.matchAll(/const\s+([A-Za-z0-9_]+)\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
  const rel = normalizeModulePath(serverPath, match[2]);
  if (rel && rel.startsWith('src/routes/')) importToFile.set(match[1], rel);
}
for (const match of server.matchAll(/const\s*\{([^}]+)\}\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
  const rel = normalizeModulePath(serverPath, match[2]);
  if (!rel || !rel.startsWith('src/routes/')) continue;
  for (const entry of match[1].split(',')) {
    const imported = entry.trim().split(/\s+as\s+|\s*:\s*/)[0];
    if (imported) importToFile.set(imported, rel);
  }
}

const prefixByFile = new Map();
// app.use('/prefix', routerVariable)
for (const match of server.matchAll(/app\.use\(\s*['"]([^'"]+)['"]\s*,\s*([A-Za-z0-9_]+)\s*\)/g)) {
  const rel = importToFile.get(match[2]);
  if (rel) prefixByFile.set(rel, match[1]);
}
// app.use('/prefix', createRouter(...))
for (const match of server.matchAll(/app\.use\(\s*['"]([^'"]+)['"]\s*,\s*([A-Za-z0-9_]+)\s*\(/g)) {
  const rel = importToFile.get(match[2]);
  if (rel) prefixByFile.set(rel, match[1]);
}
// app.use(createRouter(...)) where the route module contains absolute /api paths.
for (const match of server.matchAll(/app\.use\(\s*([A-Za-z0-9_]+)\s*\(/g)) {
  const rel = importToFile.get(match[1]);
  if (rel && !prefixByFile.has(rel)) prefixByFile.set(rel, '');
}

function joinPath(prefix, routePath) {
  if (!prefix) return routePath || '/';
  return `${prefix}/${String(routePath || '').replace(/^\/+/, '')}`.replace(/\/+/g, '/');
}

const rows = [];
for (const file of sourceFiles) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const source = fs.readFileSync(file, 'utf8');
  const isServer = rel === 'server.js';
  const prefix = isServer ? '' : (prefixByFile.get(rel) ?? `UNMOUNTED:${rel}`);
  const regex = /(app|router)\.(get|post|put|patch|delete|use)\(\s*['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(regex)) {
    const owner = match[1];
    const method = match[2].toUpperCase();
    if (method === 'USE') continue;
    const rawPath = match[3];
    const fullPath = owner === 'app' ? rawPath : joinPath(prefix, rawPath);
    const line = source.slice(0, match.index).split('\n').length;
    rows.push({ method, path: fullPath || rawPath, file: rel, line });
  }
}

rows.sort((a, b) => `${a.path}:${a.method}`.localeCompare(`${b.path}:${b.method}`));
const groups = new Map();
for (const row of rows) {
  const key = `${row.method} ${row.path}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(row);
}
const duplicates = [...groups.entries()].filter(([, list]) => list.length > 1);
const unmounted = rows.filter((row) => row.path.startsWith('UNMOUNTED:'));

const lines = [
  '# NoorVista Route Map',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  '> Static inventory based on actual imports and Express mount prefixes.',
  '',
  '| Method | Path | Source |',
  '|---|---|---|',
  ...rows.map((row) => `| ${row.method} | \`${row.path}\` | \`${row.file}:${row.line}\` |`),
  '',
  '## Potential duplicates',
  ''
];
if (!duplicates.length) lines.push('No duplicate method+path pairs found by the static scanner.');
else for (const [key, list] of duplicates) {
  lines.push(`- **${key}** — ${list.map((row) => `\`${row.file}:${row.line}\``).join(', ')}`);
}
lines.push('', '## Unmounted route modules', '');
if (!unmounted.length) lines.push('No unmounted route modules were detected.');
else for (const row of unmounted) lines.push(`- ${row.method} \`${row.path}\` from \`${row.file}:${row.line}\``);

const output = path.join(root, 'docs', 'routes-map.md');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${lines.join('\n')}\n`);
console.log(`Wrote ${path.relative(root, output)} (${rows.length} routes, ${duplicates.length} potential duplicates, ${unmounted.length} unmounted entries)`);
if (process.argv.includes('--fail-on-duplicates') && duplicates.length) process.exitCode = 1;
if (process.argv.includes('--fail-on-unmounted') && unmounted.length) process.exitCode = 1;
