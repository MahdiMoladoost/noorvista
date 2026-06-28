'use strict';

const path = require('node:path');

const BLOCKED_PATH_PREFIXES = Object.freeze([
  '.git',
  'node_modules',
  'logs',
  'backups',
  'docs/tailwind-dashboard-backups',
  'dist',
  '.cache',
  'coverage',
  '.nyc_output',
  'tmp',
  'temp'
]);

const BLOCKED_EXACT_FILES = new Set([
  '.env',
  'git',
  'noorvista-tailwind-nondestructive.patch',
  '.DS_Store',
  'Thumbs.db'
]);
const ALLOWED_BACKUP_NAMED_SOURCE_FILES = new Set([
  'public/pages/dashboard/admin/backup.html'
]);

const ALLOWED_BACKUP_SOURCE_PREFIXES = Object.freeze([
  'scripts/backup'
]);


const BLOCKED_FILE_PATTERNS = Object.freeze([
  /^\.env\.(?!example$).+/i,
  /\.(?:log|tmp|temp|bak|backup|swp|swo|orig|rej)$/i,
  /\.(?:zip|7z|rar|tar|tgz|tar\.gz)$/i,
  /(?:^|[-_.])(?:backup|dump)(?:[-_.]|$)/i,
  /~$/
]);

const RUNTIME_UPLOAD_PREFIXES = Object.freeze([
  'public/uploads/consents',
  'public/uploads/medical-records',
  'public/uploads/patient-documents',
  'public/uploads/temp',
  'public/uploads/public'
]);

const TEXT_EXTENSIONS = new Set([
  '.js', '.cjs', '.mjs', '.json', '.html', '.css', '.md', '.txt', '.xml',
  '.yml', '.yaml', '.toml', '.ini', '.conf', '.example', '.sql', '.sh',
  '.bat', '.cmd', '.ps1', '.env'
]);

function normalizeRelative(input) {
  return String(input || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

function pathStartsWith(relativePath, prefix) {
  return relativePath === prefix || relativePath.startsWith(`${prefix}/`);
}

function releaseExclusionReason(relativePath, options = {}) {
  const rel = normalizeRelative(relativePath);
  const basename = path.posix.basename(rel);

  if (!rel) return null;

  for (const prefix of BLOCKED_PATH_PREFIXES) {
    if (pathStartsWith(rel, prefix)) return `blocked-path:${prefix}`;
  }

  if (BLOCKED_EXACT_FILES.has(rel) || BLOCKED_EXACT_FILES.has(basename)) {
    return `blocked-file:${basename}`;
  }

  // Backup artifacts must be excluded, while backup implementation source files
  // and the admin backup page are required application code.
  const allowedBackupSource = ALLOWED_BACKUP_NAMED_SOURCE_FILES.has(rel)
    || ALLOWED_BACKUP_SOURCE_PREFIXES.some((prefix) => pathStartsWith(rel, prefix));
  if (options.isDirectory !== true && !allowedBackupSource) {
    for (const pattern of BLOCKED_FILE_PATTERNS) {
      if (pattern.test(basename)) return `blocked-pattern:${pattern.source}`;
    }
  }

  for (const prefix of RUNTIME_UPLOAD_PREFIXES) {
    if (pathStartsWith(rel, prefix) && options.isDirectory !== true && basename !== '.gitkeep') {
      return `runtime-upload:${prefix}`;
    }
  }

  if (options.isSymbolicLink) return 'symbolic-link';

  return null;
}

function shouldIncludeInRelease(relativePath, options = {}) {
  return releaseExclusionReason(relativePath, options) === null;
}

function isTextCandidate(relativePath, sizeBytes = 0) {
  if (sizeBytes > 5 * 1024 * 1024) return false;
  const rel = normalizeRelative(relativePath);
  const basename = path.posix.basename(rel);
  if (basename === '.env.example') return true;
  return TEXT_EXTENSIONS.has(path.posix.extname(basename).toLowerCase());
}

module.exports = {
  BLOCKED_PATH_PREFIXES,
  BLOCKED_EXACT_FILES,
  BLOCKED_FILE_PATTERNS,
  ALLOWED_BACKUP_NAMED_SOURCE_FILES,
  ALLOWED_BACKUP_SOURCE_PREFIXES,
  RUNTIME_UPLOAD_PREFIXES,
  normalizeRelative,
  releaseExclusionReason,
  shouldIncludeInRelease,
  isTextCandidate
};
