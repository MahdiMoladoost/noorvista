'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  normalizeRelative,
  releaseExclusionReason,
  shouldIncludeInRelease
} = require('./release-policy');
const { parseSensitiveEnvValues, scanArtifact } = require('./release-scanner');

function ensureInside(parent, child) {
  const parentPath = path.resolve(parent) + path.sep;
  const childPath = path.resolve(child);
  if (!childPath.startsWith(parentPath)) {
    throw new Error('Release output must be inside the project directory.');
  }
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function buildRelease(options = {}) {
  const sourceRoot = path.resolve(options.sourceRoot || process.cwd());
  const outputRoot = path.resolve(options.outputRoot || path.join(sourceRoot, 'dist', 'noorvista-release'));
  const sourceEnvPath = options.sourceEnvPath || path.join(sourceRoot, '.env');

  ensureInside(sourceRoot, outputRoot);
  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(outputRoot, { recursive: true });

  const excluded = [];
  const copiedFiles = [];

  function copyEntry(sourcePath) {
    const rel = normalizeRelative(path.relative(sourceRoot, sourcePath));
    if (!rel) return;

    const stat = fs.lstatSync(sourcePath);
    const reason = releaseExclusionReason(rel, { isSymbolicLink: stat.isSymbolicLink(), isDirectory: stat.isDirectory() });
    if (reason) {
      excluded.push({ path: rel, reason });
      return;
    }

    const destination = path.join(outputRoot, rel);

    if (stat.isDirectory()) {
      fs.mkdirSync(destination, { recursive: true });
      for (const child of fs.readdirSync(sourcePath)) copyEntry(path.join(sourcePath, child));
      return;
    }

    if (!stat.isFile() || !shouldIncludeInRelease(rel)) return;

    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(sourcePath, destination);
    fs.chmodSync(destination, stat.mode & 0o777);
    copiedFiles.push(rel);
  }

  for (const child of fs.readdirSync(sourceRoot)) {
    copyEntry(path.join(sourceRoot, child));
  }

  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    project: 'NoorVista',
    files: copiedFiles.sort().map((rel) => ({
      path: rel,
      sha256: sha256(path.join(outputRoot, rel))
    })),
    excludedSummary: excluded.reduce((acc, item) => {
      acc[item.reason] = (acc[item.reason] || 0) + 1;
      return acc;
    }, {})
  };

  fs.writeFileSync(
    path.join(outputRoot, 'release-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  );

  const sensitiveValues = parseSensitiveEnvValues(sourceEnvPath);
  const scan = scanArtifact(outputRoot, { sensitiveValues });
  if (scan.violations.length) {
    const error = new Error(`Release security scan failed with ${scan.violations.length} violation(s).`);
    error.violations = scan.violations;
    throw error;
  }

  return {
    sourceRoot,
    outputRoot,
    copiedFiles: copiedFiles.length,
    excludedEntries: excluded.length,
    scannedEntries: scan.scannedEntries
  };
}

if (require.main === module) {
  try {
    const result = buildRelease();
    console.log(JSON.stringify({
      ok: true,
      output: path.relative(process.cwd(), result.outputRoot),
      copiedFiles: result.copiedFiles,
      excludedEntries: result.excludedEntries,
      scannedEntries: result.scannedEntries
    }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      message: error.message,
      violations: error.violations || []
    }, null, 2));
    process.exitCode = 1;
  }
}

module.exports = { buildRelease };
