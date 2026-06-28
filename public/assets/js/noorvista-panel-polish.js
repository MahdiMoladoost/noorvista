/* NOORVISTA manager panels UI/UX system v13
   Root-cause changes:
   - Rebuilds sidebar/collapse in a deterministic/idempotent way.
   - Does not snapshot/restore tables and does not intercept CRUD table clicks.
   - Normalizes account placement: logout in header, password in user dropdown.
   - Normalizes action buttons without altering data/state or table rendering logic. */
(function () {
  'use strict';

  const ROLE_LABELS = {
    admin: 'مدیر سیستم',
    system_admin: 'مدیر سیستم',
    super_admin: 'مدیر سیستم',
    clinic_admin: 'مدیر کلینیک',
    clinic_manager: 'مدیر کلینیک',
    clinic: 'مدیر کلینیک',
    receptionist: 'منشی',
    reception: 'منشی',
    staff: 'کارمند',
    doctor: 'پزشک',
    patient: 'زیباجو'
  };

  const ACCOUNT_TEXT_RE = /^(خروج|تغییر\s*رمز|تغییر\s*رمز\s*عبور)$/;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const ready = (fn) => document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', fn, { once: true })
    : fn();

  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function normalizeRole(role) {
    return String(role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  }

  function getPanelType() {
    const path = location.pathname.toLowerCase();
    if (path.includes('/dashboard/panel/admin')) return 'admin';
    if (path.includes('/dashboard/panel/clinic-admin')) return 'clinic';
    return 'panel';
  }

  function getPageKey() {
    const file = (location.pathname.split('/').pop() || 'index.html').split('?')[0] || 'index.html';
    return file.replace(/\.html$/i, '') || 'index';
  }

  function getStoredUser() {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}') || {};
    } catch (_) {
      return {};
    }
  }

  function getUserName(user = getStoredUser()) {
    return cleanText(user.full_name || user.fullname || user.name || user.display_name || user.username) ||
      (getPanelType() === 'admin' ? 'مدیر سیستم' : 'مدیر کلینیک');
  }

  function getUserRoleLabel(user = getStoredUser()) {
    const normalized = normalizeRole(user.role);
    return ROLE_LABELS[normalized] || (getPanelType() === 'admin' ? 'مدیر سیستم' : 'مدیر کلینیک');
  }

  function initials(name) {
    const text = cleanText(name).replace(/^(دکتر|آقای|خانم)\s+/, '') || 'نو';
    return text.slice(0, 2).toUpperCase();
  }

  function logout() {
    void 0;
    localStorage.removeItem('user');
    localStorage.setItem('loginMessage', 'با موفقیت خارج شدید.');
    location.href = '/login';
  }

  function ensureBrand() {
    document.body.dataset.nvPage = getPageKey();
    document.title = String(document.title || '').replace(/Sadra|Sadra|Sadra/gi, 'NOORVISTA');
    $$('.sidebar-logo').forEach((el) => { el.innerHTML = 'NOOR<span>VISTA</span>'; });
    // Sidebar header must contain only centered brand and the collapse control.
    // Role/name are shown in the top user dropdown, so duplicated sidebar subtitles are removed.
    $$('.sidebar-subtitle').forEach((el) => el.remove());
  }

  function isAccountControl(el) {
    if (!el) return false;
    const text = cleanText(el.textContent);
    return el.classList.contains('logout-btn') ||
      el.classList.contains('change-password-btn') ||
      el.hasAttribute('data-nv-change-password') ||
      el.classList.contains('noorvista-logout-top') ||
      ACCOUNT_TEXT_RE.test(text);
  }

  function removeSidebarAccountControls(sidebar) {
    if (!sidebar) return;
    $$('.noorvista-account-nav, .noorvista-account-actions, .nv-sidebar-profile, .noorvista-sidebar-user, .noorvista-sidebar-tools, .nv-sidebar-collapse-btn', sidebar)
      .forEach((el) => el.remove());

    $$('a, button', sidebar).forEach((el) => {
      if (!isAccountControl(el)) return;
      const item = el.closest('li') || el;
      item.remove();
    });

    $$('.nav-divider', sidebar).forEach((divider) => {
      const prev = divider.previousElementSibling;
      const next = divider.nextElementSibling;
      if (!prev || !next || (next.matches('ul') && !next.querySelector('li'))) divider.remove();
    });
  }

  function ensureSidebar() {
    const sidebar = $('.sidebar');
    if (!sidebar) return;

    removeSidebarAccountControls(sidebar);

    let header = $('.sidebar-header', sidebar);
    if (!header) {
      header = document.createElement('div');
      header.className = 'sidebar-header';
      sidebar.prepend(header);
    }

    let logo = $('.sidebar-logo', header);
    if (!logo) {
      logo = document.createElement('div');
      logo.className = 'sidebar-logo';
      header.prepend(logo);
    }
    logo.innerHTML = 'NOOR<span>VISTA</span>';

    $$('.sidebar-subtitle', header).forEach((el) => el.remove());

    const collapseButton = document.createElement('button');
    collapseButton.type = 'button';
    collapseButton.className = 'nv-sidebar-collapse-btn';
    collapseButton.title = 'جمع/باز کردن منو';
    collapseButton.setAttribute('aria-label', 'جمع/باز کردن منوی سمت راست');
    collapseButton.innerHTML = '<i class="icon-menu"></i>';
    header.appendChild(collapseButton);

    // No sidebar profile: profile/name/role live only in the top account dropdown.
    $$('.nv-sidebar-profile, .noorvista-sidebar-user, .noorvista-sidebar-tools', sidebar).forEach((el) => el.remove());

    $$('.sidebar .nav-link').forEach((link) => {
      const label = cleanText(link.textContent);
      if (label) {
        link.title = label;
        link.dataset.tooltip = label;
      }
      if (/سوالات\s*پرتکرار/.test(label)) {
        const icon = $('i', link);
        if (icon) icon.className = 'icon-comments nv-faq-icon';
      }
    });

    collapseButton.addEventListener('click', (event) => {
      event.preventDefault();
      document.body.classList.toggle('nv-sidebar-collapsed');
      const collapsed = document.body.classList.contains('nv-sidebar-collapsed');
      try { localStorage.setItem('nvSidebarCollapsed', collapsed ? '1' : '0'); } catch (_) {}
    });

    if (localStorage.getItem('nvSidebarCollapsed') === '1' && window.innerWidth > 992) {
      document.body.classList.add('nv-sidebar-collapsed');
    }
  }

  function getHeaderActions() {
    const header = $('.top-header');
    if (!header) return null;

    let actions = $('.header-actions', header) || $('.noorvista-header-actions', header);
    if (!actions) {
      actions = Array.from(header.children).find((el) => {
        return el !== $('.page-title', header) && el.querySelector &&
          el.querySelector('.user-info, .search-box, .notification-btn, .user-avatar');
      });
    }
    if (!actions) {
      actions = document.createElement('div');
      header.appendChild(actions);
    }
    actions.classList.add('header-actions', 'noorvista-header-actions');
    return actions;
  }

  function ensureMobileSidebarToggle() {
    const header = $('.top-header');
    if (!header || $('.nv-mobile-sidebar-toggle', header)) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nv-mobile-sidebar-toggle';
    button.title = 'منو';
    button.setAttribute('aria-label', 'باز و بسته کردن منو');
    button.innerHTML = '<i class="icon-menu"></i>';
    header.insertBefore(button, header.firstChild);
    button.addEventListener('click', () => document.body.classList.toggle('nv-sidebar-mobile-open'));
  }

  function ensureHeaderAccount() {
    // v17: account actions are owned exclusively by noorvista-admin-header.js.
    // Keep this function as a no-op so older page init flows do not inject duplicate
    // logout/change-password buttons into the top-header.
    return;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function toast(message, type = 'info') {
    if (typeof window.showToast === 'function') {
      try { window.showToast(message, type); return; } catch (_) {}
    }
    alert(message);
  }

  async function requestJson(url, method, body) {
    const token = '';
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) {
      const error = new Error(data.message || `خطای سرور: ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function passwordAccountUrl() {
    return location.pathname.includes('/dashboard/admin/') ? 'account.html#password' : '/dashboard/panel/admin/account.html#password';
  }

  // The account page is the only self-service password UI.
  function ensurePasswordModal() { return null; }
  function openPasswordModal() { location.href = passwordAccountUrl(); }
  function closePasswordModal() {}
  async function submitPasswordChange() { location.href = passwordAccountUrl(); }

  function ensureConfirmDialog() {
    let modal = $('#noorvistaConfirmModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'noorvistaConfirmModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-container nv-confirm-box">
        <div class="modal-header"><h3 id="nvConfirmTitle">تأیید عملیات</h3><button type="button" class="modal-close" data-nv-confirm-cancel>&times;</button></div>
        <div class="modal-body"><div class="nv-confirm-icon"><i class="icon-info"></i></div><p id="nvConfirmMessage">آیا مطمئن هستید؟</p></div>
        <div class="modal-footer"><button type="button" class="btn btn-outline" data-nv-confirm-cancel>انصراف</button><button type="button" class="btn btn-danger" data-nv-confirm-ok>تأیید</button></div>
      </div>`;
    document.body.appendChild(modal);
    return modal;
  }

  function confirmDialog(options = {}) {
    const modal = ensureConfirmDialog();
    $('#nvConfirmTitle', modal).textContent = options.title || 'تأیید عملیات';
    $('#nvConfirmMessage', modal).textContent = options.message || 'آیا از انجام این عملیات مطمئن هستید؟';
    const ok = $('[data-nv-confirm-ok]', modal);
    ok.textContent = options.okText || 'تأیید';
    ok.className = 'btn ' + (options.danger === false ? 'btn-primary' : 'btn-danger');
    modal.classList.add('show');
    modal.style.display = 'flex';
    return new Promise((resolve) => {
      const close = (value) => {
        modal.classList.remove('show');
        modal.style.display = '';
        cleanup();
        resolve(value);
      };
      const onOk = () => close(true);
      const onCancel = () => close(false);
      const onOverlay = (event) => { if (event.target === modal) close(false); };
      const cleanup = () => {
        ok.removeEventListener('click', onOk);
        $$('[data-nv-confirm-cancel]', modal).forEach((button) => button.removeEventListener('click', onCancel));
        modal.removeEventListener('click', onOverlay);
      };
      ok.addEventListener('click', onOk);
      $$('[data-nv-confirm-cancel]', modal).forEach((button) => button.addEventListener('click', onCancel));
      modal.addEventListener('click', onOverlay);
    });
  }

  function hardenModalsAndButtons() {
    $$('button').forEach((button) => {
      if (!button.getAttribute('type')) button.setAttribute('type', 'button');
    });
    $$('.modal-overlay, .modal').forEach((modal) => modal.setAttribute('aria-modal', 'true'));
  }

  function iconForAction(type) {
    const icons = {
      view: 'icon-eye',
      edit: 'icon-pencil',
      confirm: 'icon-check',
      delete: 'icon-trash',
      status: 'icon-refresh',
      schedule: 'icon-calendar'
    };
    return icons[type] || '';
  }

  function inferAction(el) {
    const label = cleanText(el.textContent);
    const dataAction = cleanText(el.dataset.action);
    const onclick = String(el.getAttribute('onclick') || '');
    if (dataAction) return dataAction;
    if (/مشاهده/.test(label)) return 'view';
    if (/ویرایش/.test(label)) return 'edit';
    if (/تأیید|تایید/.test(label)) return 'confirm';
    if (/حذف|لغو|ابطال/.test(label)) return 'delete';
    if (/فعال|غیرفعال/.test(label)) return 'status';
    if (/زمان‌بندی|زمان بندی/.test(label) || /openScheduleModal/.test(onclick)) return 'schedule';
    return '';
  }

  function ensureButtonIcon(el, action) {
    if (!action || $('i', el)) return;
    const icon = iconForAction(action);
    if (!icon) return;
    el.insertAdjacentHTML('afterbegin', `<i class="${icon}"></i>`);
  }

  function normalizeButtons(root = document) {
    $$('button, a', root).forEach((el) => {
      if (el.closest('.sidebar') || el.closest('.nv-user-dropdown') || el.classList.contains('noorvista-logout-top') || el.classList.contains('nv-sidebar-collapse-btn')) return;
      const action = inferAction(el);
      if (!action) return;
      el.classList.add('action-btn');
      if (action === 'schedule') el.classList.add('btn-schedule-edit');
      else el.classList.add(action);
      ensureButtonIcon(el, action === 'schedule' ? 'schedule' : action);
    });
    $$('.data-table .actions, .data-table .action-buttons, .doctors-table .action-buttons').forEach((el) => el.classList.add('table-actions'));
  }

  function removeFakeDashboardNumbers() {
    const clinicScore = $('#clinicScore');
    const responseTime = $('#responseTime');
    if (clinicScore && /۹۸|98/.test(cleanText(clinicScore.textContent))) {
      clinicScore.textContent = 'داده‌ای ثبت نشده';
      clinicScore.classList.add('nv-empty-metric');
    }
    if (responseTime && /۲۴|24/.test(cleanText(responseTime.textContent))) {
      responseTime.textContent = 'داده‌ای ثبت نشده';
      responseTime.classList.add('nv-empty-metric');
    }
  }

  function ensureFaqIcon() {
    $$('a, h4, h3').forEach((el) => {
      if (!/سوالات\s*پرتکرار|سوال پرتکرار|لیست سوالات/.test(cleanText(el.textContent))) return;
      const icon = $('i', el);
      if (icon) icon.className = 'icon-comments nv-faq-icon';
    });
  }

  function addMissingApiHelpers() {
    if (typeof window.getPatient !== 'function' && typeof window.apiRequest === 'function') {
      window.getPatient = (id) => window.apiRequest(`/api/clinic/patients/${id}`);
    }
    if (typeof window.updatePatient !== 'function' && typeof window.apiRequest === 'function') {
      window.updatePatient = (id, data) => window.apiRequest(`/api/clinic/patients/${id}`, 'PUT', data);
    }
    if (typeof window.updateStaffStatus !== 'function' && typeof window.apiRequest === 'function') {
      window.updateStaffStatus = (id, is_active) => window.apiRequest(`/api/clinic/staff/${id}/status`, 'PUT', { is_active: !!is_active });
    }
  }


  function ensureClinicNameSettingField() {
    // بعضی نسخه‌های قدیمی noorvista-panel-polish این تابع را در init صدا می‌زدند
    // اما تعریف آن در فایل نهایی وجود نداشت و باعث توقف کامل JS پنل می‌شد.
    // این تابع فقط در صفحه تنظیمات، در صورت وجود فرم تنظیمات، یک فیلد امن برای نام کلینیک ایجاد می‌کند.
    // در سایر صفحات مثل users.html عمداً no-op است تا هیچ جدول/مودال/API خراب نشود.
    const isSettingsPage = /settings\.html$/i.test(location.pathname);
    if (!isSettingsPage) return;

    const form = document.querySelector('#settingsForm, form[data-settings], .settings-form, .system-settings-form, .clinic-settings-form');
    if (!form) return;

    if (form.querySelector('[name="clinic_name"], [name="clinicName"], #clinicName, #clinic_name')) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'form-group nv-clinic-name-setting-field';
    wrapper.innerHTML = `
      <label for="clinicName">نام کلینیک</label>
      <input id="clinicName" name="clinic_name" class="form-control" type="text" value="" placeholder="نام ثبت‌شده در تنظیمات سامانه" autocomplete="organization">
    `;

    const firstField = form.querySelector('.form-group, .form-row, input, select, textarea');
    if (firstField && firstField.parentElement === form) form.insertBefore(wrapper, firstField);
    else form.prepend(wrapper);
  }

  function observeRerenders() {
    let timer = null;
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        normalizeButtons();
        ensureFaqIcon();
        removeFakeDashboardNumbers();
      }, 50);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function init() {
    if (!window.__NOORVISTA_UNIFIED_SHELL__) {
      ensureBrand();
      ensureSidebar();
      ensureMobileSidebarToggle();
      ensureHeaderAccount();
    }
    if (typeof ensureClinicNameSettingField === 'function') ensureClinicNameSettingField();
    addMissingApiHelpers();
    hardenModalsAndButtons();
    normalizeButtons();
    ensureFaqIcon();
    removeFakeDashboardNumbers();
    observeRerenders();
  }

  window.NOORVISTA = Object.assign(window.NOORVISTA || {}, {
    confirm: confirmDialog,
    logout,
    refreshUI: () => {
      hardenModalsAndButtons();
      normalizeButtons();
      ensureFaqIcon();
      removeFakeDashboardNumbers();
    }
  });

  ready(() => {
    init();
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.nv-user-menu')) {
        $$('.nv-user-menu.open').forEach((menu) => menu.classList.remove('open'));
      }
      if (window.innerWidth <= 992 && event.target.closest('.sidebar .nav-link')) {
        document.body.classList.remove('nv-sidebar-mobile-open');
      }
    });
  });
})();
