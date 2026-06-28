'use strict';

const path = require('node:path');
const { scanArtifact } = require('./release-scanner');

const target = path.resolve(process.argv[2] || path.join(process.cwd(), 'dist', 'noorvista-release'));
const sourceEnvPath = path.join(process.cwd(), '.env');

try {
  const result = scanArtifact(target, { sourceEnvPath });
  if (result.violations.length) {
    console.error(JSON.stringify({
      ok: false,
      scannedEntries: result.scannedEntries,
      violations: result.violations
    }, null, 2));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({
      ok: true,
      scannedEntries: result.scannedEntries,
      violations: 0
    }, null, 2));
  }
} catch (error) {
  console.error(JSON.stringify({ ok: false, message: error.message }, null, 2));
  process.exitCode = 1;
}
