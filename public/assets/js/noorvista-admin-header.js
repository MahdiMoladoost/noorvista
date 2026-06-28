/* NOORVISTA unified top-header v17
   Purpose: clean account navigation for admin + clinic-admin panels.
   Contract:
   - No standalone logout/change-password button in top-header.
   - All account actions live once inside the user dropdown.
   - Dropdown closes on outside click and Escape.
   - RTL-safe, idempotent and safe when pages already contain different header fragments. */
(function () {
  'use strict';

  const ROLE_LABELS = {
    system_admin: 'مدیر سیستم',
    super_admin: 'مدیر سیستم',
    admin: 'مدیر سیستم',
    clinic_admin: 'مدیر کلینیک',
    clinic_manager: 'مدیر کلینیک',
    clinic: 'مدیر کلینیک',
    doctor: 'پزشک',
    receptionist: 'منشی',
    reception: 'منشی',
    staff: 'کارمند',
    patient: 'زیباجو'
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  function safeJson(value) {
    try { return JSON.parse(value || 'null'); } catch (_) { return null; }
  }

  function normalizeRole(role) {
    return String(role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  }

  function roleLabel(role) {
    return ROLE_LABELS[normalizeRole(role)] || 'کاربر سیستم';
  }

  function getStoredUser() {
    return safeJson(localStorage.getItem('user')) || {};
  }

  function getPanelKind() {
    const path = location.pathname.toLowerCase();
    if (path.includes('/dashboard/panel/admin')) return 'admin';
    if (path.includes('/dashboard/panel/clinic-admin')) return 'clinic-admin';
    return 'panel';
  }

  function getUserName(user = getStoredUser()) {
    return String(user.full_name || user.fullname || user.name || user.display_name || user.username || 'کاربر NOORVISTA').trim();
  }

  function initials(name, fallback = 'NV') {
    const cleaned = String(name || '').trim();
    if (!cleaned) return fallback;
    const parts = cleaned.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return cleaned.slice(0, 2).toUpperCase();
  }

  function showToast(message, type = 'info') {
    if (typeof window.showToast === 'function') {
      try { window.showToast(message, type); return; } catch (_) {}
    }
    const colors = { success: '#059669', error: '#dc2626', warning: '#d97706', info: '#1f2937' };
    const toast = document.createElement('div');
    toast.className = `nv-toast nv-toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `position:fixed;bottom:22px;left:22px;z-index:6000;background:${colors[type] || colors.info};color:#fff;padding:12px 18px;border-radius:14px;box-shadow:0 14px 34px rgba(15,35,52,.2);font:13px Vazir,Tahoma;`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }

  function logout() {
    void 0;
    localStorage.removeItem('user');
    sessionStorage.clear();
    window.location.href = '/login';
  }

  function accountPasswordUrl() {
    const path = location.pathname.toLowerCase();
    if (path.includes('/dashboard/admin/')) return '/dashboard/panel/admin/account.html#password';
    if (path.includes('/dashboard/clinic-manager/') || path.includes('/dashboard/panel/clinic-admin')) return '/dashboard/panel/admin/account.html#password';
    return '/dashboard/panel/admin/account.html#password';
  }

  // Password changes have one canonical UI. Legacy callers are redirected
  // instead of creating an additional password modal.
  function ensurePasswordModal() { return null; }
  function openPasswordModal() { window.location.assign(accountPasswordUrl()); }
  function closePasswordModal() {}
  function submitPasswordChange(event) {
    event?.preventDefault?.();
    window.location.assign(accountPasswordUrl());
  }

  function getPageTitleNode(header) {
    const existing = $(':scope > .page-title', header) || $(':scope > .page-heading', header) || $('.page-title', header) || $('.page-heading', header);
    if (existing) {
      existing.classList.add('page-heading');
      existing.classList.remove('page-title');
      return existing;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'page-heading';
    const title = document.title ? document.title.split('|')[0].trim() : 'پنل NOORVISTA';
    wrapper.innerHTML = `<h1>${title}</h1><p>مدیریت و کنترل اطلاعات سیستم</p>`;
    return wrapper;
  }

  async function fetchNotifications(limit = 6) {
    const response = await fetch('/api/notifications?limit=' + encodeURIComponent(limit), { headers: getAuthHeaders(), cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) throw new Error(data.message || 'خطا در دریافت اعلانات');
    return Array.isArray(data.notifications) ? data.notifications : [];
  }

  async function fetchUnreadNotificationsCount() {
    const response = await fetch('/api/notifications/unread-count', { headers: getAuthHeaders(), cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) return 0;
    return Number(data.unread_count || 0);
  }

  async function markNotificationRead(id) {
    if (!id) return;
    await fetch('/api/notifications/' + encodeURIComponent(id) + '/read', { method: 'POST', headers: getAuthHeaders() }).catch(() => null);
  }

  function notificationIcon(type) {
    const normalized = String(type || 'info').toLowerCase();
    if (normalized === 'success') return 'icon-check';
    if (normalized === 'warning') return 'icon-warning';
    if (normalized === 'danger' || normalized === 'error') return 'icon-alert';
    return 'icon-bell';
  }

  function renderNotificationItems(menu, items) {
    const list = $('.nv-notification-list', menu);
    if (!list) return;
    if (!items.length) {
      list.innerHTML = '<div class="nv-notification-empty">اعلان جدیدی وجود ندارد.</div>';
      return;
    }
    list.innerHTML = items.map(item => `
      <button type="button" class="nv-notification-item ${item.is_read ? 'is-read' : 'is-unread'}" data-notification-id="${escapeHtml(item.id)}">
        <span class="nv-notification-item-icon ${escapeHtml(item.type || 'info')}"><i class="${notificationIcon(item.type)}"></i></span>
        <span class="nv-notification-item-body">
          <strong>${escapeHtml(item.title)}</strong>
          <small>${escapeHtml(String(item.message || '').slice(0, 120))}${String(item.message || '').length > 120 ? '...' : ''}</small>
        </span>
      </button>`).join('');
  }

  function createNotificationButton() {
    const wrapper = document.createElement('div');
    wrapper.className = 'nv-notification-menu';
    wrapper.innerHTML = `
      <button type="button" class="notification-button" aria-label="اعلان‌ها" aria-expanded="false" title="اعلان‌ها">
        <i class="icon-bell"></i><span class="notification-count" aria-hidden="true" hidden>0</span>
      </button>
      <div class="nv-notification-dropdown" role="menu">
        <div class="nv-notification-head"><strong>اعلان‌ها</strong><a href="notifications.html">مدیریت اعلانات</a></div>
        <div class="nv-notification-list"><div class="nv-notification-empty">در حال بارگذاری...</div></div>
      </div>`;
    const button = $('.notification-button', wrapper);
    const countEl = $('.notification-count', wrapper);

    fetchUnreadNotificationsCount().then(count => {
      if (!countEl) return;
      if (count > 0) {
        countEl.hidden = false;
        countEl.textContent = count > 99 ? '99+' : String(count);
      } else {
        countEl.hidden = true;
      }
    }).catch(() => { if (countEl) countEl.hidden = true; });

    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const isOpen = wrapper.classList.toggle('open');
      button.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      closeAllDropdowns(wrapper);
      if (!isOpen) return;
      try {
        renderNotificationItems(wrapper, await fetchNotifications(6));
      } catch (error) {
        const list = $('.nv-notification-list', wrapper);
        if (list) list.innerHTML = '<div class="nv-notification-empty error">خطا در دریافت اعلانات</div>';
      }
    });

    wrapper.addEventListener('click', async (event) => {
      const item = event.target.closest('.nv-notification-item');
      if (!item) return;
      await markNotificationRead(item.dataset.notificationId);
      item.classList.remove('is-unread');
      item.classList.add('is-read');
    });

    return wrapper;
  }

  function getAuthHeaders() {
    const token = '';
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
  }

  function normalizeAccountUser(user = {}) {
    const current = getStoredUser();
    const merged = Object.assign({}, current, user || {});
    merged.full_name = String(merged.full_name || merged.fullname || merged.name || merged.display_name || merged.username || '').trim();
    merged.email = String(merged.email || '').trim();
    merged.phone = String(merged.phone || merged.mobile || '').trim();
    merged.username = String(merged.username || '').trim();
    merged.role = merged.role || current.role || (getPanelKind() === 'admin' ? 'system_admin' : 'clinic_admin');
    return merged;
  }

  async function fetchCurrentAccount() {
    const response = await fetch('/api/auth/me', { headers: getAuthHeaders() });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) {
      throw new Error(data.message || 'خطا در دریافت اطلاعات حساب کاربری');
    }
    return normalizeAccountUser(data.user || data.data || data);
  }

  function updateStoredAccount(user) {
    const normalized = normalizeAccountUser(user);
    const current = getStoredUser();
    const next = Object.assign({}, current, normalized);
    try { localStorage.setItem('user', JSON.stringify(next)); } catch (_) {}
    syncUserData();
    return next;
  }

  function ensureAccountModal() {
    let backdrop = $('#nvAccountModalBackdrop');
    if (backdrop) return backdrop;

    backdrop = document.createElement('div');
    backdrop.id = 'nvAccountModalBackdrop';
    backdrop.className = 'nv-account-modal-backdrop';
    backdrop.innerHTML = `
      <div class="nv-account-modal" role="dialog" aria-modal="true" aria-labelledby="nvAccountModalTitle">
        <div class="nv-account-modal-header">
          <div>
            <h3 class="nv-account-modal-title" id="nvAccountModalTitle"><i class="icon-user"></i> اطلاعات حساب کاربری</h3>
            <p class="nv-account-modal-subtitle" id="nvAccountModalSubtitle">مشاهده و ویرایش اطلاعات حساب شما</p>
          </div>
          <button type="button" class="modal-close nv-account-close" aria-label="بستن">&times;</button>
        </div>
        <form id="nvAccountForm" autocomplete="off">
          <div class="nv-account-modal-body">
            <div class="nv-account-summary">
              <div class="nv-account-avatar" id="nvAccountAvatar">نو</div>
              <div class="nv-account-summary-text">
                <strong id="nvAccountSummaryName">کاربر NOORVISTA</strong>
                <span id="nvAccountSummaryRole">کاربر سیستم</span>
              </div>
            </div>
            <input type="hidden" id="nvAccountUserId">
            <div class="nv-account-form-grid">
              <div class="nv-account-form-group">
                <label>نام و نام خانوادگی</label>
                <input type="text" id="nvAccountFullName" required maxlength="120" placeholder="نام کامل">
              </div>
              <div class="nv-account-form-group">
                <label>نام کاربری</label>
                <input type="text" id="nvAccountUsername" readonly disabled>
              </div>
              <div class="nv-account-form-group">
                <label>ایمیل</label>
                <input type="email" id="nvAccountEmail" maxlength="160" placeholder="example@email.com">
              </div>
              <div class="nv-account-form-group">
                <label>شماره موبایل</label>
                <input type="tel" id="nvAccountPhone" maxlength="30" placeholder="09123456789" inputmode="tel">
              </div>
              <div class="nv-account-form-group nv-account-form-group-full">
                <label>نقش کاربری</label>
                <input type="text" id="nvAccountRole" readonly disabled>
              </div>
            </div>
          </div>
          <div class="nv-account-modal-footer">
            <button type="button" class="btn btn-secondary nv-account-close">بستن</button>
            <button type="button" class="btn btn-primary" id="nvAccountEditFromViewBtn"><i class="icon-pencil"></i> ویرایش</button>
            <button type="submit" class="btn btn-primary" id="nvAccountSubmitBtn"><i class="icon-check"></i> ذخیره تغییرات</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(backdrop);

    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop || event.target.closest('.nv-account-close')) closeAccountModal();
    });
    const form = $('#nvAccountForm', backdrop);
    if (form) form.addEventListener('submit', submitAccountEdit);
    const editFromViewBtn = $('#nvAccountEditFromViewBtn', backdrop);
    if (editFromViewBtn) {
      editFromViewBtn.addEventListener('click', () => {
        setAccountModalMode('edit');
        setTimeout(() => $('#nvAccountFullName', backdrop)?.focus(), 50);
      });
    }
    return backdrop;
  }

  function setAccountModalMode(mode) {
    const modal = ensureAccountModal();
    const isView = mode === 'view';
    modal.dataset.mode = isView ? 'view' : 'edit';
    modal.classList.toggle('nv-account-view-mode', isView);
    modal.classList.toggle('nv-account-edit-mode', !isView);

    $('#nvAccountModalTitle', modal).innerHTML = isView ? '<i class="icon-user"></i> مشاهده اطلاعات حساب' : '<i class="icon-pencil"></i> ویرایش اطلاعات حساب';
    $('#nvAccountModalSubtitle', modal).textContent = isView ? 'اطلاعات حساب کاربری شما فقط برای مشاهده نمایش داده می‌شود.' : 'نام، ایمیل و شماره موبایل حساب خود را ویرایش کنید.';

    const closeBtn = $('.nv-account-modal-footer .nv-account-close', modal);
    if (closeBtn) closeBtn.textContent = isView ? 'بستن' : 'انصراف';

    const editFromViewBtn = $('#nvAccountEditFromViewBtn', modal);
    if (editFromViewBtn) {
      editFromViewBtn.hidden = !isView;
      editFromViewBtn.disabled = !isView;
      editFromViewBtn.setAttribute('aria-hidden', isView ? 'false' : 'true');
      editFromViewBtn.style.display = isView ? 'inline-flex' : 'none';
    }

    const submitBtn = $('#nvAccountSubmitBtn', modal);
    if (submitBtn) {
      submitBtn.hidden = isView;
      submitBtn.disabled = isView;
      submitBtn.setAttribute('aria-hidden', isView ? 'true' : 'false');
      submitBtn.style.display = isView ? 'none' : 'inline-flex';
    }

    ['nvAccountFullName', 'nvAccountEmail', 'nvAccountPhone'].forEach((id) => {
      const input = $('#' + id, modal);
      if (input) {
        input.readOnly = isView;
        input.classList.toggle('is-readonly', isView);
      }
    });
  }

  function fillAccountModal(user) {
    const modal = ensureAccountModal();
    const normalized = normalizeAccountUser(user);
    const name = getUserName(normalized);
    const role = roleLabel(normalized.role);
    $('#nvAccountUserId', modal).value = normalized.id || '';
    $('#nvAccountFullName', modal).value = normalized.full_name || '';
    $('#nvAccountUsername', modal).value = normalized.username || '';
    $('#nvAccountEmail', modal).value = normalized.email || '';
    $('#nvAccountPhone', modal).value = normalized.phone || '';
    $('#nvAccountRole', modal).value = role;
    $('#nvAccountAvatar', modal).textContent = initials(name, 'نو');
    $('#nvAccountSummaryName', modal).textContent = name;
    $('#nvAccountSummaryRole', modal).textContent = role;
  }

  async function openAccountModal(mode = 'edit') {
    const modal = ensureAccountModal();
    setAccountModalMode(mode);
    fillAccountModal(getStoredUser());
    modal.classList.add('show');

    try {
      const user = await fetchCurrentAccount();
      updateStoredAccount(user);
      fillAccountModal(user);
    } catch (error) {
      showToast(error.message || 'خطا در دریافت اطلاعات حساب', 'warning');
    }

    setTimeout(() => {
      const focusTarget = mode === 'view' ? $('.nv-account-close', modal) : $('#nvAccountFullName', modal);
      focusTarget?.focus();
    }, 60);
  }

  function closeAccountModal() {
    const modal = $('#nvAccountModalBackdrop');
    if (!modal) return;
    modal.classList.remove('show');
  }

  async function submitAccountEdit(event) {
    event.preventDefault();
    const modal = ensureAccountModal();
    if (modal.dataset.mode === 'view') {
      closeAccountModal();
      return;
    }

    const payload = {
      full_name: ($('#nvAccountFullName', modal)?.value || '').trim(),
      email: ($('#nvAccountEmail', modal)?.value || '').trim(),
      phone: ($('#nvAccountPhone', modal)?.value || '').trim()
    };

    if (!payload.full_name) {
      showToast('نام و نام خانوادگی الزامی است.', 'error');
      $('#nvAccountFullName', modal)?.focus();
      return;
    }

    const btn = $('#nvAccountSubmitBtn', modal);
    const original = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.classList.add('is-loading');
      btn.innerHTML = '<span class="nv-loading-dot"></span> در حال ذخیره...';
    }

    const endpoints = [
      { url: '/api/auth/profile', method: 'PUT' },
      { url: '/api/auth/me', method: 'PUT' },
      { url: '/api/profile', method: 'PUT' },
      { url: '/api/users/profile', method: 'PUT' }
    ];
    let lastError = null;

    try {
      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint.url, {
            method: endpoint.method,
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
          });
          const data = await response.json().catch(() => ({}));
          if (response.ok && data.success !== false) {
            const updated = updateStoredAccount(data.user || data.data || payload);
            fillAccountModal(updated);
            showToast('اطلاعات حساب با موفقیت ذخیره شد.', 'success');
            closeAccountModal();
            return;
          }
          lastError = new Error(data.message || `خطای سرور: ${response.status}`);
          if (![404, 405].includes(response.status)) break;
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new Error('API ویرایش اطلاعات حساب در سرور فعال نیست.');
    } catch (error) {
      showToast(error.message || 'خطا در ذخیره اطلاعات حساب', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.classList.remove('is-loading');
        btn.innerHTML = original;
      }
    }
  }

  function createUserMenu() {
    const user = getStoredUser();
    const name = getUserName(user);
    const role = roleLabel(user.role || (getPanelKind() === 'admin' ? 'system_admin' : 'clinic_admin'));

    const menu = document.createElement('div');
    menu.className = 'user-menu nv-user-menu';
    menu.innerHTML = `
      <button type="button" class="user-menu-trigger" aria-haspopup="true" aria-expanded="false">
        <span class="user-avatar nv-header-avatar">${initials(name, 'نو')}</span>
        <span class="user-menu-text">
          <strong class="user-name nv-header-user-name">${escapeHtml(name)}</strong>
          <small class="user-role nv-header-user-role">${escapeHtml(role)}</small>
        </span>
        <i class="icon-chevron-down nv-user-menu-chevron" aria-hidden="true"></i>
      </button>
      <div class="user-dropdown nv-user-dropdown" role="menu">
        <button type="button" class="user-dropdown-item" data-nv-profile role="menuitem"><i class="icon-user"></i><span>مشاهده اطلاعات حساب</span></button>
        <button type="button" class="user-dropdown-item" data-nv-edit-account role="menuitem"><i class="icon-pencil"></i><span>ویرایش اطلاعات حساب</span></button>
        <a class="user-dropdown-item" href="account.html#password" role="menuitem"><i class="icon-lock"></i><span>تغییر رمز عبور</span></a>
        <button type="button" class="user-dropdown-item" data-nv-account-settings role="menuitem"><i class="icon-cog"></i><span>تنظیمات حساب</span></button>
        <div class="user-dropdown-divider" aria-hidden="true"></div>
        <button type="button" class="user-dropdown-item danger" data-nv-logout role="menuitem"><i class="icon-sign-out"></i><span>خروج از حساب</span></button>
      </div>`;
    return menu;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function closeAllDropdowns(except = null) {
    $$('.user-menu.open, .nv-user-menu.open, .nv-notification-menu.open').forEach((menu) => {
      if (except && menu === except) return;
      menu.classList.remove('open');
      $('.user-menu-trigger, .notification-button', menu)?.setAttribute('aria-expanded', 'false');
    });
  }

  function normalizeHeader() {
    const header = $('.top-header');
    if (!header) return;

    const pageTitle = getPageTitleNode(header);
    const pageTitleClone = pageTitle.cloneNode(true);
    pageTitleClone.classList.add('page-heading');
    pageTitleClone.classList.remove('page-title');

    header.innerHTML = '';
    header.className = 'top-header nv-standard-top-header';
    header.appendChild(pageTitleClone);

    const actions = document.createElement('div');
    actions.className = 'header-actions';
    actions.appendChild(createNotificationButton());
    actions.appendChild(createUserMenu());
    header.appendChild(actions);
  }

  function bindHeader() {
    $$('.user-menu').forEach((menu) => {
      if (menu.dataset.nvHeaderBound === '1') return;
      menu.dataset.nvHeaderBound = '1';
      const trigger = $('.user-menu-trigger', menu);
      if (!trigger) return;

      trigger.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const willOpen = !menu.classList.contains('open');
        closeAllDropdowns(menu);
        menu.classList.toggle('open', willOpen);
        trigger.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      });

      menu.addEventListener('click', (event) => {
        const logoutBtn = event.target.closest('[data-nv-logout]');
        const profileBtn = event.target.closest('[data-nv-profile]');
        const editBtn = event.target.closest('[data-nv-edit-account]');
        const settingsBtn = event.target.closest('[data-nv-account-settings]');
        if (!logoutBtn && !profileBtn && !editBtn && !settingsBtn) return;

        event.preventDefault();
        event.stopPropagation();
        closeAllDropdowns();

        if (logoutBtn) logout();
        else if (profileBtn) openAccountModal('view');
        else if (editBtn) openAccountModal('edit');
        else if (settingsBtn) openAccountModal('edit');
      });
    });
  }

  function removeDuplicateAccountControls() {
    const header = $('.top-header');
    if (header) {
      $$('.logout-btn, .change-password-btn, .nv-header-logout-btn, .noorvista-logout-top, [data-action="logout"], [data-action="change-password"]', header).forEach((el) => el.remove());
    }

    // Sidebar is navigation only. Remove account action rows if legacy HTML still contains them.
    $$('.sidebar .logout-btn, .sidebar .change-password-btn, .sidebar .nv-change-password-btn, .sidebar [data-action="logout"], .sidebar [data-action="change-password"]').forEach((el) => {
      const li = el.closest('li.nav-item');
      if (li) li.remove(); else el.remove();
    });

    // Remove empty navigation sections left from old logout rows.
    $$('.sidebar .nav-divider').forEach((divider) => {
      const next = divider.nextElementSibling;
      if (next && next.matches('ul.sidebar-nav') && !next.querySelector('li.nav-item')) {
        next.remove();
        divider.remove();
      }
    });
  }

  function syncUserData() {
    const user = getStoredUser();
    const name = getUserName(user);
    const role = roleLabel(user.role || (getPanelKind() === 'admin' ? 'system_admin' : 'clinic_admin'));
    $$('.top-header .user-name, .top-header .nv-header-user-name').forEach((el) => { el.textContent = name; });
    $$('.top-header .user-role, .top-header .nv-header-user-role').forEach((el) => { el.textContent = role; });
    $$('.top-header .user-avatar, .top-header .nv-header-avatar').forEach((el) => { el.textContent = initials(name, 'نو'); });
  }

  function init() {
    if (!window.__NOORVISTA_UNIFIED_SHELL__) {
      normalizeHeader();
      removeDuplicateAccountControls();
    }
    syncUserData();
    bindHeader();
  }

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.user-menu')) closeAllDropdowns();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeAllDropdowns();
      closePasswordModal();
      closeAccountModal();
    }
  });

  window.NOORVISTA = Object.assign(window.NOORVISTA || {}, {
    initHeader: init,
    openPasswordModal,
    openAccountModal,
    closeAccountModal,
    logout
  });

  ready(init);
})();
