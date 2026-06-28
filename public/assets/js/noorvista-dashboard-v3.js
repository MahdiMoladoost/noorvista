/* Sadra Dashboard V3 — unified Tailwind shell for all roles */
(function () {
  'use strict';
  if (window.__NOORVISTA_DASHBOARD_V3__) return;
  window.__NOORVISTA_DASHBOARD_V3__ = true;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const body = document.body;
  const role = body?.dataset.panelRole || 'user';
  const collapseKey = `noorvista.dashboard.sidebar.${role}.collapsed`;
  const desktop = window.matchMedia('(min-width: 1024px)');

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }


  async function dashboardRequest(endpoint, method = 'GET', data = null) {
    const normalizedMethod = String(method || 'GET').toUpperCase();
    const headers = { Accept: 'application/json' };
    const options = { method: normalizedMethod, headers, credentials: 'same-origin', cache: 'no-store' };
    if (data !== null && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(normalizedMethod)) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(data);
    }
    const response = await fetch(endpoint, options);
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.success === false) {
      const error = new Error(result.message || `خطای سرور (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return result;
  }

  function adminEquivalent(endpoint) {
    return String(endpoint || '').replace(/^\/api\/clinic\//, '/api/admin/');
  }

  async function requestWithRoleFallback(endpoint, method = 'GET', data = null) {
    const isSystemAdmin = role === 'admin' || role === 'system_admin';
    const candidates = isSystemAdmin
      ? [adminEquivalent(endpoint), endpoint]
      : [endpoint, adminEquivalent(endpoint)];
    let lastError;
    for (const candidate of [...new Set(candidates)]) {
      try { return await dashboardRequest(candidate, method, data); }
      catch (error) {
        lastError = error;
        if (![404, 405].includes(error.status)) throw error;
      }
    }
    throw lastError || new Error('خطا در ارتباط با سرور');
  }

  function installApiCompatibility() {
    if (typeof window.getDoctors !== 'function') window.getDoctors = () => requestWithRoleFallback('/api/clinic/doctors');
    if (typeof window.createDoctor !== 'function') window.createDoctor = data => requestWithRoleFallback('/api/clinic/doctors', 'POST', data);
    if (typeof window.updateDoctor !== 'function') window.updateDoctor = (id, data) => requestWithRoleFallback(`/api/clinic/doctors/${id}`, 'PUT', data);
    if (typeof window.updateDoctorStatus !== 'function') window.updateDoctorStatus = (id, active) => requestWithRoleFallback(`/api/clinic/doctors/${id}/status`, 'PUT', { is_available: active, is_active: active });
    if (typeof window.deleteDoctorApi !== 'function') window.deleteDoctorApi = id => requestWithRoleFallback(`/api/clinic/doctors/${id}`, 'DELETE');
    if (typeof window.getPayments !== 'function') window.getPayments = params => {
      const query = new URLSearchParams(Object.entries(params || {}).filter(([, value]) => value !== undefined && value !== null && value !== '' && value !== 'all')).toString();
      return requestWithRoleFallback(`/api/clinic/payments${query ? `?${query}` : ''}`);
    };
    if (typeof window.updatePayment !== 'function') window.updatePayment = (id, data) => requestWithRoleFallback(`/api/clinic/payments/${id}`, 'PUT', data);
    if (typeof window.deletePaymentApi !== 'function') window.deletePaymentApi = id => requestWithRoleFallback(`/api/clinic/payments/${id}`, 'DELETE');
  }

  installApiCompatibility();

  function installModalCompatibility() {
    if (typeof window.openModal !== 'function') {
      window.openModal = function openModal(modalId) {
        if (typeof window.showModal === 'function' && window.showModal !== window.openModal) {
          window.showModal(modalId);
          return;
        }
        const modal = document.getElementById(modalId);
        if (!modal) return;
        modal.classList.add('show');
        modal.style.display = 'flex';
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('nv3-modal-open');
        const focusTarget = modal.querySelector('[autofocus], input:not([type=hidden]), select, textarea, button');
        requestAnimationFrame(() => focusTarget?.focus({ preventScroll: true }));
      };
    }

    if (typeof window.closeModal !== 'function') {
      window.closeModal = function closeModal(modalId) {
        if (typeof window.hideModal === 'function' && window.hideModal !== window.closeModal) {
          window.hideModal(modalId);
          return;
        }
        const modal = document.getElementById(modalId);
        if (!modal) return;
        modal.classList.remove('show');
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
        if (!document.querySelector('.modal-overlay.show, .modal.show, .admin-modal-overlay.show')) {
          document.body.classList.remove('nv3-modal-open');
        }
      };
    }
  }

  installModalCompatibility();


  const ICON_CLASS_ALIASES = {
    'icon-clock': 'icon-clock-o',
    'icon-trending-up': 'icon-trending_up',
    'icon-user-minus': 'icon-user-times'
  };


  const DATE_INPUT_SELECTOR = [
    '.jalali-date-input', '.nv-jalali-date', '.nv-jalali-datetime',
    'input[type="date"]', 'input[type="datetime-local"]',
    '#filterDate', '#startDate', '#endDate', '#date_from', '#date_to',
    '#start_date', '#end_date', '#appointmentDateJalali', '#birthDateJalali',
    '#startsAt', '#expiresAt', '#smsDateFrom', '#smsDateTo', '.persian-date-input'
  ].join(',');

  const ACTION_RULES = [
    { test: /مشاهده|جزئیات/, icon: 'icon-eye', variant: 'is-view' },
    { test: /ویرایش/, icon: 'icon-pencil', variant: 'is-edit' },
    { test: /تأیید|ذخیره/, icon: 'icon-check', variant: 'is-confirm' },
    { test: /لغو/, icon: 'icon-ban', variant: 'is-cancel' },
    { test: /حذف/, icon: 'icon-trash', variant: 'is-delete' },
    { test: /غیرفعال|فعال/, icon: 'icon-power-off', variant: 'is-toggle' },
    { test: /افزودن|ثبت .*جدید|نوبت جدید/, icon: 'icon-plus', variant: 'is-create' },
    { test: /جستجو/, icon: 'icon-search', variant: 'is-search' },
    { test: /بروزرسانی|به.?روزرسانی/, icon: 'icon-refresh', variant: 'is-search' },
    { test: /پاک.?کردن|بازنشانی/, icon: 'icon-refresh', variant: 'is-neutral' }
  ];


  const PAGE_TOPBAR_ICONS = {
    'index': 'icon-dashboard',
    'users': 'icon-users',
    'doctors': 'icon-user-md',
    'schedule': 'icon-clock-o',
    'patients': 'icon-people',
    'appointments': 'icon-calendar',
    'appointment-slots': 'icon-calendar',
    'staff': 'icon-briefcase',
    'payments': 'icon-credit-card',
    'medical-centers': 'icon-medkit',
    'services-management': 'icon-list',
    'doctor-centers': 'icon-link',
    'faqs': 'icon-comments',
    'notifications': 'icon-bell',
    'sms-log': 'icon-comments',
    'sms-templates': 'icon-comments',
    'reports': 'icon-bar-chart',
    'logs': 'icon-file-text',
    'settings': 'icon-cog',
    'backup': 'icon-database',
    'account': 'icon-user',
    'medical-records': 'icon-file-text',
    'prescriptions': 'icon-medkit',
    'profile': 'icon-user',
    'queue': 'icon-list'
  };

  function currentPageKey() {
    const path = String(window.location.pathname || '').split('/').pop() || 'index.html';
    return path.replace(/\.html?$/i, '').toLowerCase() || 'index';
  }

  function ensureUnifiedTopbarIcon() {
    const wrap = $('.nv3-heading-wrap');
    const heading = $('.nv3-page-heading', wrap || document);
    if (!wrap || !heading) return;

    let iconBox = $('.nv-page-topbar-icon, .nv-appt-topbar-icon', wrap);
    if (!iconBox) {
      iconBox = document.createElement('span');
      iconBox.className = 'nv-page-topbar-icon';
      iconBox.setAttribute('aria-hidden', 'true');
      wrap.insertBefore(iconBox, heading);
    } else {
      iconBox.classList.add('nv-page-topbar-icon');
    }

    const pageKey = currentPageKey();
    const iconClass = PAGE_TOPBAR_ICONS[pageKey] || 'icon-dashboard';
    let icon = $('i', iconBox);
    if (!icon) {
      icon = document.createElement('i');
      iconBox.appendChild(icon);
    }
    icon.className = iconClass;
    icon.setAttribute('aria-hidden', 'true');
  }

  function cleanButtonGlyphs(button) {
    if (!button || button.dataset.nv3GlyphCleaned === '1') return;
    button.dataset.nv3GlyphCleaned = '1';
    button.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) node.nodeValue = node.nodeValue.replace(/[+＋]/g, '').replace(/^\s+/, ' ');
    });
  }

  function enhanceProfessionalButtons(root = document) {
    const selector = [
      'table button', '.action-buttons button', '.appt-row-actions button',
      '.appt-actions button', '.filter-bar button', '.toolbar button',
      '.bulk-actions button', '.modal-footer button'
    ].join(',');
    $$(selector, root).forEach(button => {
      cleanButtonGlyphs(button);
      const text = String(button.textContent || '').replace(/\s+/g, ' ').trim();
      const rule = ACTION_RULES.find(item => item.test.test(text));
      const inTable = Boolean(button.closest('table, .nv3-table-scroll'));
      if (inTable) button.classList.add('nv3-table-action');
      else button.classList.add('nv3-control-action');
      if (rule) {
        button.classList.add(rule.variant);
        if (!button.querySelector('i[class*="icon-"]')) {
          const icon = document.createElement('i');
          icon.className = rule.icon;
          icon.setAttribute('aria-hidden', 'true');
          button.prepend(icon);
        }
      }
      if (!button.hasAttribute('type') && button.closest('form')) button.type = 'button';
    });
  }

  function sanitizeBrokenValues(root = document) {
    const host = root.nodeType === Node.DOCUMENT_NODE ? (root.querySelector('#main-content') || root.body) : root;
    if (!host) return;
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || parent.closest('script,style,textarea')) return NodeFilter.FILTER_REJECT;
        return /undefined|null\/null|NaN/.test(node.nodeValue || '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      node.nodeValue = String(node.nodeValue || '')
        .replace(/undefined(?:\s*\/\s*undefined){1,2}/g, '—')
        .replace(/\bundefined\b/g, '—')
        .replace(/\bNaN\b/g, '—')
        .replace(/null\s*\/\s*null/g, '—');
    });
  }

  function prepareUniversalDateFields(root = document) {
    $$(DATE_INPUT_SELECTOR, root).forEach(input => {
      if (!(input instanceof HTMLInputElement) || input.type === 'hidden') return;
      const id = String(input.id || '').toLowerCase();
      const isDateTime = input.classList.contains('nv-jalali-datetime') || input.type === 'datetime-local' || /startsat|expiresat|datetime/.test(id);
      input.classList.add(isDateTime ? 'nv-jalali-datetime' : 'nv-jalali-date');
      input.classList.add('nv3-date-control');
      input.setAttribute('autocomplete', 'off');
      input.setAttribute('inputmode', isDateTime ? 'text' : 'numeric');
      input.setAttribute('data-datepicker-initialized', 'true');
      input.setAttribute('data-nv-modern-datepicker', '1');
      if (!input.placeholder) input.placeholder = isDateTime ? '۱۴۰۵/۰۳/۲۴ ۰۹:۰۰' : '۱۴۰۵/۰۳/۲۴';
    });
  }

  function applyDateDefaults() {
    if (!window.NVDate?.toJalaliDate) return;
    const localIso = date => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    const today = window.NVDate.toJalaliDate(localIso(new Date()));
    const plusDays = days => {
      const d = new Date();
      d.setDate(d.getDate() + days);
      return window.NVDate.toJalaliDate(localIso(d));
    };
    $$(DATE_INPUT_SELECTOR).forEach(input => {
      if (!(input instanceof HTMLInputElement) || input.value || input.dataset.noDefaultDate === '1') return;
      const id = String(input.id || '').toLowerCase();
      if (/birth|تولد/.test(id)) return;
      if (id === 'expiresat') input.value = `${today} ۲۳:۰۰`;
      else if (id === 'startsat') input.value = `${today} ۰۹:۰۰`;
      else if (id === 'end_date') input.value = today;
      else input.value = today;
    });
  }

  function ensurePersianDateModule() {
    prepareUniversalDateFields();
    const activate = () => {
      prepareUniversalDateFields();
      window.NVDate?.initFields?.();
      applyDateDefaults();
    };
    if (window.NVDate?.__readyV2) return activate();
    const existing = document.querySelector('script[src*="/assets/js/admin-persian-date.js"]');
    if (existing) {
      let tries = 0;
      const timer = setInterval(() => {
        tries += 1;
        if (window.NVDate?.__readyV2 || tries > 30) {
          clearInterval(timer);
          activate();
        }
      }, 50);
      return;
    }
    if (!document.querySelector(DATE_INPUT_SELECTOR)) return;
    const script = document.createElement('script');
    script.src = '/assets/js/admin-persian-date.js?v=2.1.70';
    script.defer = true;
    script.onload = activate;
    document.head.appendChild(script);
  }

  function normalizeIcons(root = document) {
    $$('i[class*="icon-"]', root).forEach(icon => {
      Object.entries(ICON_CLASS_ALIASES).forEach(([invalidClass, validClass]) => {
        if (icon.classList.contains(invalidClass)) {
          icon.classList.remove(invalidClass);
          icon.classList.add(validClass);
        }
      });
      icon.setAttribute('aria-hidden', 'true');
    });

    $$('.modal-close', root).forEach(button => {
      const onlyText = button.childElementCount === 0 && button.textContent.trim() === '×';
      if (!onlyText) return;
      button.textContent = '';
      const icon = document.createElement('i');
      icon.className = 'icon-close';
      icon.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.className = 'nv3-sr-only';
      label.textContent = 'بستن';
      button.append(icon, label);
      if (!button.hasAttribute('aria-label')) button.setAttribute('aria-label', 'بستن');
    });
  }

  const ROLE_LABELS = Object.freeze({
    system_admin: 'مدیر سیستم',
    admin: 'مدیر سیستم',
    super_admin: 'مدیر سیستم',
    site_admin: 'مدیر سیستم',
    owner: 'مدیر سیستم',
    clinic_admin: 'مدیر کلینیک',
    clinic_manager: 'مدیر کلینیک',
    manager: 'مدیر کلینیک',
    doctor: 'پزشک',
    receptionist: 'منشی',
    reception: 'منشی',
    secretary: 'منشی',
    staff: 'منشی',
    patient: 'زیباجو'
  });

  let resolvedIdentityUser = null;

  function normalizeRoleName(value) {
    return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  }

  function roleLabel(value) {
    const normalized = normalizeRoleName(value || role);
    return ROLE_LABELS[normalized] || ROLE_LABELS[normalizeRoleName(role)] || 'کاربر سامانه';
  }

  function userName(user) {
    if (!user || typeof user !== 'object') return '';
    const direct = user.full_name || user.fullName || user.display_name || user.name;
    if (String(direct || '').trim()) return String(direct).trim();
    const combined = `${user.first_name || user.firstName || ''} ${user.last_name || user.lastName || ''}`.trim();
    return combined || String(user.username || '').trim();
  }

  function initials(name, fallback) {
    const words = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return fallback || 'NV';
    return `${words[0]?.[0] || ''}${words[1]?.[0] || ''}` || fallback || 'NV';
  }


  function ensureSystemBranding() {
    const applyLoaded = () => {
      try { window.SadraBranding?.load?.(); } catch (_) {}
    };
    if (window.SadraBranding?.load) {
      applyLoaded();
      return;
    }
    if (document.querySelector('script[data-noorvista-system-branding]')) return;
    const script = document.createElement('script');
    script.src = '/assets/js/system-branding-2.1.93.js?v=2.1.93';
    script.defer = true;
    script.dataset.noorvistaSystemBranding = '1';
    script.onload = applyLoaded;
    document.head.appendChild(script);
  }

  function applyIdentity(user = resolvedIdentityUser) {
    if (user && typeof user === 'object') resolvedIdentityUser = user;
    const activeUser = resolvedIdentityUser;
    const name = userName(activeUser);
    const currentRoleLabel = roleLabel(activeUser?.role);

    if (name) {
      $$('[data-nv3-user-name], [data-nv-user-name], .nv3-dashboard .user-name').forEach(el => { el.textContent = name; });
      $$('[data-nv3-user-avatar], [data-nv-user-avatar], .nv3-dashboard .user-avatar').forEach(el => {
        const value = initials(name, el.dataset.fallback || 'NV');
        el.textContent = value;
        el.setAttribute('aria-label', `نشان کاربری ${name}`);
      });
    }

    $$('[data-nv3-user-role], .nv3-user-copy > small').forEach(el => { el.textContent = currentRoleLabel; });

    try {
      const today = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      }).format(new Date());
      $$('[data-nv3-today]').forEach(el => { el.textContent = today; });
    } catch (_) {
      $$('[data-nv3-today]').forEach(el => { el.textContent = new Date().toLocaleDateString('fa-IR'); });
    }
  }

  async function hydrateIdentityFromSession() {
    if (resolvedIdentityUser) return resolvedIdentityUser;
    if (!window.__NOORVISTA_SESSION_USER_PROMISE__) {
      window.__NOORVISTA_SESSION_USER_PROMISE__ = (async () => {
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        const timeoutId = controller ? window.setTimeout(() => controller.abort(), 6000) : null;
        try {
          const response = await fetch('/api/auth/me', {
            method: 'GET',
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { Accept: 'application/json' },
            ...(controller ? { signal: controller.signal } : {})
          });
          const result = await response.json().catch(() => ({}));
          return response.ok && result.success !== false && result.user ? result.user : null;
        } catch (_) {
          return null;
        } finally {
          if (timeoutId) window.clearTimeout(timeoutId);
        }
      })();
    }
    const user = await window.__NOORVISTA_SESSION_USER_PROMISE__;
    if (user) applyIdentity(user);
    return user;
  }

  document.addEventListener('noorvista:session-ready', event => {
    if (event?.detail?.user) applyIdentity(event.detail.user);
  });

  function setSidebarOpen(open) {
    const sidebar = $('[data-nv3-sidebar]');
    const overlay = $('[data-nv3-sidebar-overlay]');
    if (!sidebar) return;
    sidebar.classList.toggle('is-open', Boolean(open));
    overlay?.classList.toggle('is-open', Boolean(open));
    body.classList.toggle('nv3-menu-open', Boolean(open));
    $$('[data-nv3-sidebar-open]').forEach(btn => btn.setAttribute('aria-expanded', String(Boolean(open))));
  }

  function setCollapsed(collapsed, persist = true) {
    const enabled = desktop.matches && Boolean(collapsed);
    document.documentElement.classList.toggle('nv3-sidebar-collapsed', enabled);
    const btn = $('[data-nv3-sidebar-collapse]');
    if (btn) {
      btn.setAttribute('aria-expanded', String(!enabled));
      btn.setAttribute('aria-label', enabled ? 'باز کردن منوی کناری' : 'جمع کردن منوی کناری');
      btn.title = enabled ? 'باز کردن منوی کناری' : 'جمع کردن منوی کناری';
      const icon = $('i', btn);
      if (icon) {
        icon.className = enabled ? 'icon-chevron-left' : 'icon-chevron-right';
      }
    }
    if (persist) {
      try { localStorage.setItem(collapseKey, enabled ? '1' : '0'); } catch (_) {}
    }
  }

  function initSidebar() {
    const sidebar = $('[data-nv3-sidebar]');
    if (!sidebar) return;
    $$('[data-nv3-sidebar-open]').forEach(btn => btn.addEventListener('click', () => setSidebarOpen(true)));
    $$('[data-nv3-sidebar-close]').forEach(btn => btn.addEventListener('click', () => setSidebarOpen(false)));
    $('[data-nv3-sidebar-overlay]')?.addEventListener('click', () => setSidebarOpen(false));
    $('[data-nv3-sidebar-collapse]')?.addEventListener('click', () => {
      setCollapsed(!document.documentElement.classList.contains('nv3-sidebar-collapsed'));
    });
    $$('.nv3-nav-link').forEach(link => link.addEventListener('click', () => {
      if (!desktop.matches) setSidebarOpen(false);
    }));
    const sync = () => {
      setSidebarOpen(false);
      if (desktop.matches) {
        let saved = false;
        try { saved = localStorage.getItem(collapseKey) === '1'; } catch (_) {}
        setCollapsed(saved, false);
      } else {
        document.documentElement.classList.remove('nv3-sidebar-collapsed');
      }
    };
    if (desktop.addEventListener) desktop.addEventListener('change', sync);
    else desktop.addListener(sync);
    sync();
    requestAnimationFrame(() => $('.nv3-nav-link.is-active')?.scrollIntoView({ block: 'nearest' }));
  }


  function removeWebsiteHomeFromUserMenus(root = document) {
    $$('.nv3-user-dropdown .nv3-user-menu-item, [data-nv3-user-menu] .nv3-user-menu-item', root).forEach(item => {
      const text = String(item.textContent || '').replace(/\s+/g, ' ').trim();
      const href = String(item.getAttribute?.('href') || '').trim();
      if ((text.includes('وب‌سایت صدرا') || text.includes('وب سایت صدرا')) || (href === '/' && /صدرا|وب/.test(text))) {
        item.remove();
      }
    });
  }

  function initUserMenu() {
    removeWebsiteHomeFromUserMenus();
    const trigger = $('[data-nv3-user-menu-toggle]');
    const menu = $('[data-nv3-user-menu]');
    if (!trigger || !menu) return;
    const setOpen = open => {
      menu.classList.toggle('is-open', Boolean(open));
      trigger.setAttribute('aria-expanded', String(Boolean(open)));
    };
    trigger.addEventListener('click', event => {
      event.stopPropagation();
      setOpen(!menu.classList.contains('is-open'));
    });
    document.addEventListener('click', event => {
      if (!menu.contains(event.target) && !trigger.contains(event.target)) setOpen(false);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') setOpen(false);
    });
  }


  function ensureNotificationDropdownStyles() {
    if (document.getElementById('nv3NotificationDropdownStyles')) return;
    const link = document.createElement('link');
    link.id = 'nv3NotificationDropdownStyles';
    link.rel = 'stylesheet';
    link.href = '/assets/css/admin-notifications-2.1.12.css';
    document.head.appendChild(link);
  }

  function notificationIconClass(type) {
    const value = String(type || 'info').toLowerCase();
    if (value === 'success') return 'icon-check';
    if (value === 'warning') return 'icon-warning';
    if (value === 'danger' || value === 'error') return 'icon-alert';
    return 'icon-bell';
  }

  function formatNotificationDate(value) {
    if (!value) return '';
    try {
      return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      }).format(new Date(value));
    } catch (_) {
      return '';
    }
  }

  function setNotificationBadge(badge, count) {
    const value = Math.max(0, Number(count) || 0);
    if (!badge) return;
    badge.hidden = value < 1;
    badge.textContent = value > 99 ? '۹۹+' : String(value).replace(/\d/g, digit => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);
    badge.setAttribute('aria-label', value ? `${value} اعلان خوانده‌نشده` : 'اعلان خوانده‌نشده وجود ندارد');
  }

  function renderTopbarNotifications(wrapper, items) {
    const list = $('.nv3-notification-list', wrapper);
    if (!list) return;
    if (!Array.isArray(items) || items.length === 0) {
      list.innerHTML = '<div class="nv3-notification-empty"><i class="icon-bell" aria-hidden="true"></i><strong>اعلان تازه‌ای ندارید</strong><span>همه اعلان‌ها خوانده شده‌اند.</span></div>';
      return;
    }
    list.innerHTML = items.map(item => {
      const title = escapeHtml(item.title || 'اعلان');
      const message = escapeHtml(String(item.message || '').slice(0, 130));
      const date = escapeHtml(formatNotificationDate(item.created_at));
      const id = escapeHtml(item.id);
      const state = item.is_read ? 'is-read' : 'is-unread';
      return `<button type="button" class="nv3-notification-item ${state}" data-nv3-notification-id="${id}">
        <span class="nv3-notification-item-icon"><i class="${notificationIconClass(item.type)}" aria-hidden="true"></i></span>
        <span class="nv3-notification-item-copy"><strong>${title}</strong><span>${message || 'بدون توضیح'}</span><small>${date}</small></span>
      </button>`;
    }).join('');
  }

  function closeTopbarNotifications(except = null) {
    $$('.nv3-notification-menu.is-open').forEach(menu => {
      if (menu === except) return;
      menu.classList.remove('is-open');
      $('[data-nv3-notification-toggle]', menu)?.setAttribute('aria-expanded', 'false');
      const dropdown = $('.nv3-notification-dropdown', menu);
      if (dropdown) dropdown.hidden = true;
    });
  }

  async function loadTopbarNotificationCount(wrapper) {
    const badge = $('.nv3-notification-badge', wrapper);
    try {
      const result = await dashboardRequest('/api/notifications/unread-count');
      setNotificationBadge(badge, result.unread_count);
    } catch (_) {
      setNotificationBadge(badge, 0);
    }
  }

  async function loadTopbarNotifications(wrapper) {
    const list = $('.nv3-notification-list', wrapper);
    if (list) list.innerHTML = '<div class="nv3-notification-loading"><span></span><span>در حال دریافت اعلان‌ها...</span></div>';
    try {
      const result = await dashboardRequest('/api/notifications?limit=6');
      renderTopbarNotifications(wrapper, result.notifications || []);
      wrapper.dataset.loaded = '1';
    } catch (error) {
      if (list) {
        list.innerHTML = `<div class="nv3-notification-empty is-error"><i class="icon-warning" aria-hidden="true"></i><strong>دریافت اعلان‌ها ناموفق بود</strong><span>${escapeHtml(error.message || 'ارتباط با سرور برقرار نشد.')}</span></div>`;
      }
    }
  }

  function initTopbarNotifications() {
    ensureNotificationDropdownStyles();
    const selectors = [
      '.nv3-topbar-actions a.nv3-icon-button[aria-label="اعلان‌ها"]',
      '.nv3-topbar-actions a.nv3-icon-button[href$="notifications.html"]'
    ].join(',');

    $$(selectors).forEach((link, index) => {
      if (link.dataset.nv3NotificationUpgraded === '1') return;
      link.dataset.nv3NotificationUpgraded = '1';
      const targetHref = link.getAttribute('href') || 'notifications.html';
      const wrapper = document.createElement('div');
      wrapper.className = 'nv3-notification-menu';
      wrapper.dataset.nv3NotificationMenu = '';

      const button = document.createElement('button');
      button.type = 'button';
      button.className = `${link.className} nv3-notification-trigger`;
      button.setAttribute('aria-label', 'نمایش اعلان‌های اخیر');
      button.setAttribute('aria-haspopup', 'menu');
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute('data-nv3-notification-toggle', '');
      button.innerHTML = '<i aria-hidden="true" class="icon-bell"></i><span class="nv3-notification-badge" hidden>۰</span>';

      const dropdown = document.createElement('div');
      dropdown.className = 'nv3-notification-dropdown';
      dropdown.id = `nv3NotificationDropdown${index + 1}`;
      dropdown.setAttribute('role', 'menu');
      dropdown.setAttribute('aria-label', 'اعلان‌های اخیر');
      dropdown.hidden = true;
      dropdown.innerHTML = `<div class="nv3-notification-head"><div><strong>اعلان‌ها</strong><span>آخرین پیام‌های سامانه</span></div><a href="${escapeHtml(targetHref)}">مشاهده همه</a></div><div class="nv3-notification-list"><div class="nv3-notification-loading"><span></span><span>در حال دریافت اعلان‌ها...</span></div></div>`;
      button.setAttribute('aria-controls', dropdown.id);

      wrapper.append(button, dropdown);
      link.replaceWith(wrapper);

      button.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        const willOpen = !wrapper.classList.contains('is-open');
        closeTopbarNotifications(wrapper);
        if (willOpen) dropdown.hidden = false;
        wrapper.classList.toggle('is-open', willOpen);
        if (!willOpen) dropdown.hidden = true;
        button.setAttribute('aria-expanded', String(willOpen));
        if (willOpen) await loadTopbarNotifications(wrapper);
      });

      wrapper.addEventListener('click', async event => {
        const item = event.target.closest('[data-nv3-notification-id]');
        if (!item) return;
        event.preventDefault();
        const id = item.dataset.nv3NotificationId;
        try {
          await dashboardRequest(`/api/notifications/${encodeURIComponent(id)}/read`, 'POST');
          item.classList.remove('is-unread');
          item.classList.add('is-read');
          await loadTopbarNotificationCount(wrapper);
        } catch (_) {}
      });

      loadTopbarNotificationCount(wrapper);
    });

    if (document.documentElement.dataset.nv3NotificationEvents !== '1') {
      document.documentElement.dataset.nv3NotificationEvents = '1';
      document.addEventListener('click', event => {
        if (!event.target.closest('[data-nv3-notification-menu]')) closeTopbarNotifications();
      });
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeTopbarNotifications();
      });
      window.addEventListener('noorvista:notifications-changed', refreshTopbarNotificationCounts);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') refreshTopbarNotificationCounts();
      });
      window.setInterval(() => {
        if (document.visibilityState === 'visible') refreshTopbarNotificationCounts();
      }, 45000);
    }
  }


  function refreshTopbarNotificationCounts() {
    $$('.nv3-notification-menu').forEach(wrapper => void loadTopbarNotificationCount(wrapper));
  }

  function ensureSmsTemplatesNav() {
    const normalizedRole = normalizeRoleName(role);
    const isAdminPanel = body?.classList?.contains('nv3-role-admin') || ['admin', 'system_admin', 'super_admin', 'site_admin', 'owner'].includes(normalizedRole);
    if (!isAdminPanel) return;

    const list = $('.nv3-nav > ul, .nv3-nav ul');
    if (!list) return;

    let item = Array.from(list.querySelectorAll('a.nv3-nav-link, a.nav-link')).find(link => {
      const href = String(link.getAttribute('href') || '').split(/[?#]/)[0];
      return href === 'sms-templates.html' || href.endsWith('/sms-templates.html');
    })?.closest('li');

    if (!item) {
      item = document.createElement('li');
      item.className = 'nv3-nav-item';
      item.innerHTML = '<a class="nav-link nv3-nav-link" href="sms-templates.html"><span class="nv3-nav-icon"><i aria-hidden="true" class="icon-comments"></i></span><span class="nv3-nav-label">متن پیامک‌ها</span></a>';
      const before = Array.from(list.children).find(li => {
        const href = li.querySelector('a')?.getAttribute('href') || '';
        return href === 'sms-log.html' || href.endsWith('/sms-log.html') || href === 'reports.html' || href.endsWith('/reports.html') || href === 'logs.html' || href.endsWith('/logs.html');
      });
      if (before) list.insertBefore(item, before);
      else list.appendChild(item);
    }

    const link = item.querySelector('a');
    if (!link) return;
    link.classList.add('nav-link', 'nv3-nav-link');
    link.setAttribute('href', 'sms-templates.html');
    if (currentPageKey() === 'sms-templates') {
      $$('.nv3-nav-link.is-active').forEach(active => {
        if (active !== link) {
          active.classList.remove('is-active');
          active.removeAttribute('aria-current');
        }
      });
      link.classList.add('is-active');
      link.setAttribute('aria-current', 'page');
    }
  }

  function ensureSmsLogNav() {
    const normalizedRole = normalizeRoleName(role);
    const isAdminPanel = body?.classList?.contains('nv3-role-admin') || ['admin', 'system_admin', 'super_admin', 'site_admin', 'owner'].includes(normalizedRole);
    const isClinicManagerPanel = body?.classList?.contains('nv3-role-clinic-manager') || ['clinic_admin', 'clinic_manager', 'manager'].includes(normalizedRole);
    if (!isAdminPanel && !isClinicManagerPanel) return;

    const list = $('.nv3-nav > ul, .nv3-nav ul');
    if (!list) return;

    let item = Array.from(list.querySelectorAll('a.nv3-nav-link, a.nav-link')).find(link => {
      const href = String(link.getAttribute('href') || '').split(/[?#]/)[0];
      return href === 'sms-log.html' || href.endsWith('/sms-log.html');
    })?.closest('li');

    if (!item) {
      item = document.createElement('li');
      item.className = 'nv3-nav-item';
      item.innerHTML = '<a class="nav-link nv3-nav-link" href="sms-log.html"><span class="nv3-nav-icon"><i aria-hidden="true" class="icon-comments"></i></span><span class="nv3-nav-label">پیامک‌های ارسالی</span></a>';
      const before = Array.from(list.children).find(li => {
        const href = li.querySelector('a')?.getAttribute('href') || '';
        return href === 'reports.html' || href.endsWith('/reports.html') || href === 'logs.html' || href.endsWith('/logs.html');
      });
      if (before) list.insertBefore(item, before);
      else list.appendChild(item);
    }

    const link = item.querySelector('a');
    if (!link) return;
    link.classList.add('nav-link', 'nv3-nav-link');
    link.setAttribute('href', 'sms-log.html');
    const pageKey = currentPageKey();
    if (pageKey === 'sms-log') {
      $$('.nv3-nav-link.is-active').forEach(active => {
        if (active !== link) {
          active.classList.remove('is-active');
          active.removeAttribute('aria-current');
        }
      });
      link.classList.add('is-active');
      link.setAttribute('aria-current', 'page');
    }
  }

  function installDateIconParityStyle() {
    if (document.getElementById('nv3DateIconParity2187')) return;
    const style = document.createElement('style');
    style.id = 'nv3DateIconParity2187';
    style.textContent = `
      body.nv3-dashboard .nv-date-field{
        position:relative!important;
        display:block!important;
        width:100%!important;
        min-width:0!important;
      }
      body.nv3-dashboard .nv-date-field>input{
        width:100%!important;
        min-width:0!important;
        box-sizing:border-box!important;
        padding-right:14px!important;
        padding-left:52px!important;
      }
      body.nv3-dashboard .nv-date-field>.nv-date-trigger[data-nv-date-primary="1"],
      body.nv3-dashboard .nv-date-field>.nv-date-trigger:only-of-type{
        position:absolute!important;
        z-index:6!important;
        top:50%!important;
        left:8px!important;
        right:auto!important;
        width:34px!important;
        height:34px!important;
        min-width:34px!important;
        min-height:34px!important;
        max-width:34px!important;
        max-height:34px!important;
        margin:0!important;
        padding:0!important;
        transform:translateY(-50%)!important;
        border:0!important;
        border-radius:10px!important;
        display:grid!important;
        place-items:center!important;
        background:#eef8fc!important;
        box-shadow:none!important;
        overflow:hidden!important;
        font-size:0!important;
        line-height:0!important;
      }
      body.nv3-dashboard .nv-date-field>.nv-date-trigger:not([data-nv-date-primary="1"]):not(:only-of-type),
      body.nv3-dashboard .appt-filter-field>.nv-date-trigger:not([data-nv-date-primary="1"]){
        display:none!important;
      }
      body.nv3-dashboard .nv-date-field>.nv-date-trigger::before{
        content:""!important;
        width:17px!important;
        height:17px!important;
        display:block!important;
        background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='%230d75a7' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4.5' width='18' height='16' rx='2'/%3E%3Cpath d='M16 2.5v4M8 2.5v4M3 9h18'/%3E%3Cpath d='M7 13h2M11 13h2M15 13h2M7 17h2M11 17h2M15 17h2'/%3E%3C/svg%3E") center/17px 17px no-repeat!important;
      }
      body.nv3-dashboard .nv-date-field>.nv-date-trigger>*{
        display:none!important;
      }
      body.nv3-dashboard .nv-date-field>.nv-date-trigger:hover{
        background:#168dc6!important;
      }
      body.nv3-dashboard .nv-date-field>.nv-date-trigger:hover::before{
        background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4.5' width='18' height='16' rx='2'/%3E%3Cpath d='M16 2.5v4M8 2.5v4M3 9h18'/%3E%3Cpath d='M7 13h2M11 13h2M15 13h2M7 17h2M11 17h2M15 17h2'/%3E%3C/svg%3E")!important;
      }
    `;
    document.head.appendChild(style);
  }

  function normalizeAdminUserMenu() {
    if (!body?.classList.contains('nv3-role-admin')) return;
    $$('.nv3-user-dropdown').forEach(menu => {
      const items = $$('.nv3-user-menu-item', menu);
      if (items[0]) {
        items[0].setAttribute('href', 'account.html');
        const icon = $('i', items[0]); if (icon) icon.className = 'icon-user';
        const label = $('span', items[0]); if (label) label.textContent = 'اطلاعات حساب و حساب کاربری';
      }
      if (items[1]) {
        items[1].setAttribute('href', 'account.html#password');
        const icon = $('i', items[1]); if (icon) icon.className = 'icon-lock';
        const label = $('span', items[1]); if (label) label.textContent = 'تغییر رمز عبور';
      }
    });
  }

  async function logout() {
    if (typeof window.noorvistaLogout === 'function') return window.noorvistaLogout();
    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); } catch (_) {}
    try {
      ['token', 'authToken', 'noorvista_token', 'user', 'currentUser', 'authUser'].forEach(key => {
        localStorage.removeItem(key); sessionStorage.removeItem(key);
      });
    } catch (_) {}
    window.location.replace('/login');
  }

  function initLogout() {
    if (document.documentElement.dataset.nv3LogoutBound === '1') return;
    document.documentElement.dataset.nv3LogoutBound = '1';

    // Capture delegation keeps both sidebar and user-menu logout buttons working,
    // including buttons rendered or replaced after the initial page load.
    document.addEventListener('click', event => {
      const button = event.target instanceof Element ? event.target.closest('[data-nv3-logout]') : null;
      if (!button) return;

      event.preventDefault();
      event.stopPropagation();
      if (button.dataset.nv3LogoutBusy === '1') return;

      button.dataset.nv3LogoutBusy = '1';
      button.setAttribute('aria-busy', 'true');
      button.disabled = true;
      const label = $('.nv3-nav-label, span', button);
      if (label && !label.dataset.nv3OriginalText) {
        label.dataset.nv3OriginalText = label.textContent || '';
        label.textContent = 'در حال خروج…';
      }

      Promise.resolve(logout()).catch(() => window.location.replace('/login'));
    }, true);

    if (typeof window.logout !== 'function') window.logout = logout;
  }

  function enhanceTable(table) {
    if (!table || table.dataset.nv3Enhanced === '1') return;
    table.dataset.nv3Enhanced = '1';
    table.classList.add('nv3-data-table');
    $$('thead th', table).forEach(th => th.setAttribute('scope', 'col'));
    if (!table.parentElement?.classList.contains('nv3-table-scroll')) {
      const wrapper = document.createElement('div');
      wrapper.className = 'nv3-table-scroll';
      table.parentNode.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    }
  }

  function enhanceModal(modal) {
    if (!modal || modal.dataset.nv3Enhanced === '1') return;
    modal.dataset.nv3Enhanced = '1';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    const title = $('.modal-header h3, .modal-header h2, .modal-title', modal);
    if (title) {
      if (!title.id) title.id = `nv3-modal-title-${Math.random().toString(36).slice(2, 9)}`;
      modal.setAttribute('aria-labelledby', title.id);
    }
  }



  const numericFitSelector = [
    '.stat-number',
    '.stat-info > h3',
    '.nv-live-metric',
    '.nv-tw-stat-card > div > strong',
    '.nv-pa-fee-value',
    '.nv-pa-summary-value'
  ].join(',');

  let numericFitFrame = 0;
  function fitDashboardNumericValues(root = document) {
    cancelAnimationFrame(numericFitFrame);
    numericFitFrame = requestAnimationFrame(() => {
      $$(numericFitSelector, root).forEach(element => {
        if (!(element instanceof HTMLElement) || element.offsetParent === null) return;
        element.style.removeProperty('font-size');
        const computed = window.getComputedStyle(element);
        const original = Number.parseFloat(computed.fontSize) || 24;
        const minimum = Math.min(original, 13);
        let size = original;
        element.style.whiteSpace = 'nowrap';
        element.style.maxWidth = '100%';
        element.style.minWidth = '0';
        while (element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1 && size > minimum) {
          size -= 0.5;
          element.style.fontSize = `${size}px`;
        }
        if (element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1) {
          element.style.letterSpacing = '-0.06em';
        } else {
          element.style.removeProperty('letter-spacing');
        }
      });
    });
  }

  function enhanceActions(root = document) {
    normalizeIcons(root);
    enhanceProfessionalButtons(root);
    prepareUniversalDateFields(root);
    sanitizeBrokenValues(root);
    removeWebsiteHomeFromUserMenus(root);
    $$('table', root).forEach(enhanceTable);
    $$('.modal-overlay, .modal', root).forEach(enhanceModal);
    $$('.filter-bar, .filter-section, .toolbar, .report-filter, .slot-filter', root).forEach(el => el.classList.add('nv3-action-panel'));
    $$('.card, .card-modern, .appt-card, .nv-tw-card', root).forEach(el => el.classList.add('nv3-surface'));
    $$('button:not([type])', root).forEach(button => {
      if (!button.closest('form') || button.hasAttribute('onclick')) button.type = 'button';
    });
    $$('input, textarea, select', root).forEach(control => {
      if (control.disabled) control.setAttribute('aria-disabled', 'true');
    });
  }

  function initDynamicEnhancement() {
    enhanceActions();
    fitDashboardNumericValues();
    let queued = false;
    const observer = new MutationObserver(records => {
      if (queued) return;
      if (!records.some(r => r.addedNodes && r.addedNodes.length)) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        enhanceActions();
        applyIdentity();
        ensureSystemBranding();
        fitDashboardNumericValues();
      });
    });
    observer.observe($('#main-content') || body, { childList: true, subtree: true });
  }

  function initKeyboard() {
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      if (!desktop.matches) setSidebarOpen(false);
      const openModal = $('.modal-overlay.show, .modal.show, .admin-modal-overlay.show');
      if (openModal?.id) {
        if (typeof window.closeModal === 'function') window.closeModal(openModal.id);
        else if (typeof window.hideModal === 'function') window.hideModal(openModal.id);
        else openModal.classList.remove('show');
      }
    });
  }

  function init() {
    installDateIconParityStyle();
    ensureUnifiedTopbarIcon();
    normalizeIcons();
    applyIdentity();
    ensureSystemBranding();
    void hydrateIdentityFromSession();
    ensurePersianDateModule();
    enhanceProfessionalButtons();
    sanitizeBrokenValues();
    ensureSmsTemplatesNav();
    ensureSmsLogNav();
    initSidebar();
    initUserMenu();
    normalizeAdminUserMenu();
    removeWebsiteHomeFromUserMenus();
    // خروج باید حتی اگر یک قابلیت جانبی مانند اعلان‌ها خطا داشت، همیشه فعال بماند.
    initLogout();
    try { initTopbarNotifications(); } catch (error) { console.error('Topbar notifications init failed:', error); }
    initDynamicEnhancement();
    initKeyboard();
    fitDashboardNumericValues();
    window.addEventListener('resize', () => fitDashboardNumericValues(), { passive: true });
    document.documentElement.classList.add('nv3-ready');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
  window.addEventListener('load', () => {
    installDateIconParityStyle();
    ensureSmsTemplatesNav();
    ensureSmsLogNav();
    ensureUnifiedTopbarIcon();
    ensureSystemBranding();
    ensurePersianDateModule();
    enhanceProfessionalButtons();
    sanitizeBrokenValues();
    fitDashboardNumericValues();
  }, { once: true });
})();
