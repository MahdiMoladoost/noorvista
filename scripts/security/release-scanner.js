'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  normalizeRelative,
  releaseExclusionReason,
  isTextCandidate
} = require('./release-policy');

const GENERIC_SECRET_PATTERNS = Object.freeze([
  { id: 'PRIVATE_KEY', regex: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g },
  { id: 'JWT_TOKEN', regex: /\beyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\b/g },
  { id: 'AWS_ACCESS_KEY', regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { id: 'GITHUB_TOKEN', regex: /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/g },
  { id: 'SLACK_TOKEN', regex: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g },
  { id: 'STRIPE_LIVE_KEY', regex: /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/g },
  { id: 'GOOGLE_API_KEY', regex: /\bAIza[0-9A-Za-z_-]{30,}\b/g }
]);

const SENSITIVE_ENV_KEY = /(?:PASSWORD|PASSWD|SECRET|TOKEN|API_KEY|PRIVATE_KEY|CREDENTIAL|MERCHANT|AUTHORITY)/i;

function parseSensitiveEnvValues(envPath) {
  if (!envPath || !fs.existsSync(envPath)) return [];
  const values = [];
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);

  for (const line of lines) {
    if (!line || /^\s*#/.test(line)) continue;
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!SENSITIVE_ENV_KEY.test(key)) continue;

    let value = rawValue.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!value || value.length < 4) continue;
    values.push({ key, value });
  }

  return values;
}

function lineNumberAt(text, index) {
  return text.slice(0, index).split('\n').length;
}

function walk(rootDir) {
  const entries = [];

  function visit(current) {
    const stat = fs.lstatSync(current);
    const rel = normalizeRelative(path.relative(rootDir, current));

    if (rel) entries.push({ absolutePath: current, relativePath: rel, stat });
    if (!stat.isDirectory()) return;

    for (const child of fs.readdirSync(current)) {
      visit(path.join(current, child));
    }
  }

  visit(rootDir);
  return entries;
}

function scanArtifact(artifactRoot, options = {}) {
  const root = path.resolve(artifactRoot);
  if (!fs.existsSync(root)) {
    throw new Error(`Artifact path does not exist: ${root}`);
  }

  const violations = [];
  const sensitiveValues = options.sensitiveValues || parseSensitiveEnvValues(options.sourceEnvPath);
  const entries = walk(root);

  for (const entry of entries) {
    const { relativePath, stat, absolutePath } = entry;
    const reason = releaseExclusionReason(relativePath, { isSymbolicLink: stat.isSymbolicLink(), isDirectory: stat.isDirectory() });
    if (reason) {
      violations.push({ type: 'FORBIDDEN_PATH', rule: reason, path: relativePath });
      continue;
    }

    if (!stat.isFile() || !isTextCandidate(relativePath, stat.size)) continue;

    const content = fs.readFileSync(absolutePath, 'utf8');

    for (const pattern of GENERIC_SECRET_PATTERNS) {
      pattern.regex.lastIndex = 0;
      const match = pattern.regex.exec(content);
      if (match) {
        violations.push({
          type: 'SECRET_PATTERN',
          rule: pattern.id,
          path: relativePath,
          line: lineNumberAt(content, match.index)
        });
      }
    }

    for (const item of sensitiveValues) {
      const index = content.indexOf(item.value);
      if (index !== -1) {
        violations.push({
          type: 'SOURCE_ENV_VALUE',
          rule: `ENV_VALUE_MATCH:${item.key}`,
          path: relativePath,
          line: lineNumberAt(content, index)
        });
      }
    }
  }

  return {
    artifactRoot: root,
    scannedEntries: entries.length,
    violations
  };
}

module.exports = {
  GENERIC_SECRET_PATTERNS,
  parseSensitiveEnvValues,
  scanArtifact
};
