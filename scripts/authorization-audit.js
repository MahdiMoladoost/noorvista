'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const reportPath = path.join(root, 'docs', 'reports', 'authorization-static.md');
const failures = [];
const checks = [];

function source(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}
function requirePattern(relative, pattern, description) {
  const ok = pattern.test(source(relative));
  checks.push({ relative, description, ok });
  if (!ok) failures.push(`${relative}: ${description}`);
}

requirePattern('src/routes/admin.js', /router\.use\(protect\)[\s\S]*restrictTo\('system_admin'\)/, 'system-admin router has global authentication and role restriction');
requirePattern('src/routes/adminExtra.js', /router\.use\(protect, adminOnly\)/, 'legacy admin additions have global authentication and system-admin authorization');
requirePattern('src/routes/clinic.js', /const CLINIC_STAFF_ROLES = \[[\s\S]*'receptionist'[\s\S]*'secretary'[\s\S]*'system_admin'[\s\S]*router\.use\(protect, restrictTo\(\.\.\.CLINIC_STAFF_ROLES\)\)/, 'clinic router has a global backend staff role boundary including supported aliases');
requirePattern('src/routes/doctor.js', /router\.use\(protect\)[\s\S]*router\.use\(restrictTo\('doctor'\)\)/, 'doctor router is doctor-only');
requirePattern('src/routes/patients.js', /router\.use\(protect\)[\s\S]*router\.use\(restrictTo\('patient'\)\)/, 'patient router is patient-only');
requirePattern('src/routes/consents.js', /router\.use\(protect\)/, 'consent router is authenticated globally');
requirePattern('src/routes/clinicalAccess.js', /router\.use\(protect\)/, 'break-glass router is authenticated globally');
requirePattern('src/routes/privateFiles.js', /router\.use\(protect\)/, 'private-file router is authenticated globally');
requirePattern('src/routes/panelFinalFixes.js', /router\.use\('\/api', protect\)[\s\S]*restrictTo\('clinic_admin', 'system_admin'\)/, 'compatibility mutations have global auth and admin role gates');
requirePattern('src/routes/appointmentArchitecture.js', /const managerOnly = \[protect, restrictTo\(/, 'appointment administration uses a reusable authenticated manager policy');
requirePattern('src/routes/appointmentArchitecture.js', /router\.post\('\/appointments', optionalAuth/, 'public booking is the only explicitly optional-auth mutation in appointment architecture');
requirePattern('src/routes/appointmentArchitecture.js', /router\.patch\('\/appointments\/:id\/cancel', protect/, 'appointment cancellation is authenticated');
requirePattern('src/routes/platform.js', /const adminOnly = \[authenticateToken, authorizeRoles\('system_admin', 'admin'\)\]/, 'platform administration mutations use an explicit admin policy');

for (const relative of ['src/routes/appointments.js', 'src/routes/schedule.js']) {
  const text = source(relative);
  for (const match of text.matchAll(/router\.(post|put|patch|delete)\(\s*['"][^'"]+['"]([^\n]*)/g)) {
    const ok = /\bprotect\b/.test(match[2]);
    const line = text.slice(0, match.index).split('\n').length;
    checks.push({ relative: `${relative}:${line}`, description: 'state-changing route includes protect middleware', ok });
    if (!ok) failures.push(`${relative}:${line}: state-changing route lacks protect middleware`);
  }
}

const server = source('server.js');
const authTokens = /\b(authenticateToken|clinicV2Auth|protect|nvCanManageNotifications)\b/;
const publicServerMutations = new Set([
  'POST /api/public/appointment-request',
  'POST /api/public/contact-message'
]);
for (const match of server.matchAll(/app\.(post|put|patch|delete)\(\s*['"]([^'"]+)['"]([^\n]*)/g)) {
  const method = match[1].toUpperCase();
  const route = match[2];
  const key = `${method} ${route}`;
  const line = server.slice(0, match.index).split('\n').length;
  const allowedPublic = publicServerMutations.has(key);
  const ok = allowedPublic || authTokens.test(match[3]);
  checks.push({ relative: `server.js:${line}`, description: allowedPublic ? `explicit public form allowlist: ${key}` : `inline mutation protected: ${key}`, ok });
  if (!ok) failures.push(`server.js:${line}: ${key} lacks recognized auth middleware`);
}

const lines = [
  '# Static authorization guard', '',
  `Generated: ${new Date().toISOString()}`, '',
  `- Assertions: ${checks.length}`,
  `- Passed: ${checks.filter((item) => item.ok).length}`,
  `- Failed: ${failures.length}`, '',
  '> This guard prevents obvious unprotected route regressions. It does not replace database-backed object-ownership/IDOR tests for every endpoint.', '',
  '| Result | Source | Assertion |',
  '|---|---|---|',
  ...checks.map((item) => `| ${item.ok ? 'PASS' : 'FAIL'} | \`${item.relative}\` | ${item.description} |`),
  ''
];
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, lines.join('\n'));
console.log(`Authorization audit: ${checks.length - failures.length}/${checks.length} assertions passed`);
if (failures.length) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
}
