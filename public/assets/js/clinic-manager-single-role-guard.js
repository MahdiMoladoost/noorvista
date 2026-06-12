// NOORVISTA Clinic Manager Single Role Guard
// Standard clinic manager role is ONLY: clinic_manager
(function () {
  if (window.__NV_CLINIC_MANAGER_SINGLE_ROLE_GUARD__) return;
  window.__NV_CLINIC_MANAGER_SINGLE_ROLE_GUARD__ = true;

  const STANDARD_ROLE = 'clinic_manager';

  function normalizeRole(role) {
    return String(role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  }

  function getStoredUser() {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch (_) {
      return null;
    }
  }

  function isClinicManagerPage() {
    return /\/dashboard\/clinic-manager\//i.test(location.pathname);
  }

  function fixStoredRole() {
    const user = getStoredUser();
    if (!user) return;

    const role = normalizeRole(user.role);
    if (role === STANDARD_ROLE) return;

    // Do NOT accept clinic_admin as a valid role.
    // Only clear obviously wrong stale aliases that were saved by old frontend code.
    if (['clinic_admin', 'clinic', 'manager'].includes(role)) {
      user.role = STANDARD_ROLE;
      localStorage.setItem('user', JSON.stringify(user));
    }
  }

  if (isClinicManagerPage()) {
    fixStoredRole();
  }
})();
