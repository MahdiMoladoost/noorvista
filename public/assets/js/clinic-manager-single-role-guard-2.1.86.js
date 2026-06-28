
/* Sadra 2.1.86 — clinic-manager role guard compatibility */
(function () {
  'use strict';
  if (window.__NOORVISTA_CLINIC_MANAGER_SINGLE_ROLE_GUARD_2186__) return;
  window.__NOORVISTA_CLINIC_MANAGER_SINGLE_ROLE_GUARD_2186__ = true;
  const allowed = ['clinic_admin', 'clinic_manager', 'manager', 'admin', 'system_admin', 'super_admin', 'site_admin'];
  function normalize(role) { return String(role || '').trim().toLowerCase().replace(/[\s-]+/g, '_'); }
  async function run() {
    try {
      if (window.SadraPanel?.initPage) {
        await window.SadraPanel.initPage({ panelRole: 'clinic-admin', roles: allowed });
        return;
      }
      const response = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) return window.location.replace('/login');
      const role = normalize(result.user?.role);
      if (result.success && allowed.includes(role)) return;
      window.location.replace('/dashboard/panel/admin/index.html');
    } catch (error) {
      console.error('Clinic manager role guard failed:', error);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
})();
