/*
 * NOORVISTA unified role shell
 * Rebuilds only shared navigation/header presentation. Existing page content,
 * APIs, IDs, forms and role-specific scripts remain intact.
 */
(function () {
  'use strict';

  if (window.__NOORVISTA_UNIFIED_SHELL__) return;
  window.__NOORVISTA_UNIFIED_SHELL__ = true;

  const ready = (fn) => document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', fn, { once: true })
    : fn();
  const qs = (selector, root = document) => root.querySelector(selector);
  const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const ROLE_CONFIG = {
    'system-admin': {
      label: 'مدیر سیستم', fallback: 'مدیر سیستم', avatar: 'مس',
      notification: 'notifications.html', profile: 'settings.html',
      indexTitle: 'داشبورد مدیر سیستم', indexDescription: 'نظارت و مدیریت یکپارچه در سامانه صدرا'
    },
    'clinic-manager': {
      label: 'مدیر کلینیک', fallback: 'مدیر کلینیک', avatar: 'مک',
      notification: 'notifications.html', profile: '',
      indexTitle: 'داشبورد مدیر کلینیک', indexDescription: 'مدیریت عملیات، منابع و عملکرد کلینیک'
    },
    doctor: {
      label: 'پزشک', fallback: 'پزشک', avatar: 'پز',
      notification: '', profile: 'profile.html',
      indexTitle: 'داشبورد پزشک', indexDescription: 'نوبت‌ها، بیماران و برنامه کاری'
    },
    secretary: {
      label: 'منشی', fallback: 'منشی', avatar: 'من',
      notification: 'notifications.html', profile: '',
      indexTitle: 'داشبورد منشی', indexDescription: 'پذیرش، نوبت‌ها و امور روزانه کلینیک'
    },
    patient: {
      label: 'بیمار', fallback: 'بیمار', avatar: 'بی',
      notification: '', profile: 'profile.html',
      indexTitle: 'داشبورد بیمار', indexDescription: 'نوبت‌ها، پرونده و خدمات درمانی'
    }
  };

  const LABELS = {
    'system-admin': {
      'index.html': 'داشبورد', 'users.html': 'کاربران', 'doctors.html': 'پزشکان',
      'schedule.html': 'برنامه کاری پزشکان', 'patients.html': 'بیماران',
      'appointments.html': 'نوبت‌ها', 'staff.html': 'کارکنان', 'payments.html': 'امور مالی',
      'faqs.html': 'سوالات پرتکرار', 'notifications.html': 'اعلانات',
      'settings.html': 'تنظیمات سامانه', 'backup.html': 'پشتیبان‌گیری',
      'reports.html': 'گزارش‌ها', 'visitor-analytics.html': 'بازدیدکنندگان سایت', 'logs.html': 'رویدادهای سامانه',
      'medical-centers.html': 'مراکز درمانی', 'doctor-centers.html': 'پزشکان و مراکز',
      'services-management.html': 'خدمات درمانی', 'appointment-slots.html': 'ظرفیت‌های نوبت'
    },
    'clinic-manager': {
      'index.html': 'داشبورد', 'doctors.html': 'پزشکان', 'schedule.html': 'برنامه کاری پزشکان',
      'patients.html': 'بیماران', 'appointments.html': 'نوبت‌ها', 'staff.html': 'کارکنان',
      'payments.html': 'امور مالی', 'faqs.html': 'سوالات پرتکرار',
      'notifications.html': 'اعلانات', 'reports.html': 'گزارش‌ها',
      'medical-centers.html': 'مراکز درمانی', 'doctor-centers.html': 'پزشکان و مراکز',
      'services-management.html': 'خدمات درمانی', 'appointment-slots.html': 'ظرفیت‌های نوبت'
    },
    doctor: {
      'index.html': 'داشبورد', 'appointments.html': 'نوبت‌ها', 'patients.html': 'بیماران',
      'medical-records.html': 'پرونده‌های پزشکی', 'prescriptions.html': 'نسخه‌ها و دستورات',
      'schedule.html': 'برنامه کاری', 'profile.html': 'اطلاعات حساب و امنیت'
    },
    secretary: {
      'index.html': 'داشبورد', 'appointments.html': 'نوبت‌ها', 'patients.html': 'بیماران',
      'queue.html': 'صف پذیرش', 'payments.html': 'پرداخت‌ها', 'notifications.html': 'اعلانات و پیام‌ها'
    },
    patient: {
      'index.html': 'داشبورد', 'appointments.html': 'نوبت‌ها', 'medical-records.html': 'پرونده پزشکی',
      'prescriptions.html': 'نسخه‌ها', 'payments.html': 'پرداخت‌ها', 'profile.html': 'اطلاعات حساب و امنیت'
    }
  };

  const FALLBACK_MENUS = {
    doctor: [
      ['index.html', 'icon-dashboard'], ['appointments.html', 'icon-calendar'], ['patients.html', 'icon-users'],
      ['medical-records.html', 'icon-file-text'], ['prescriptions.html', 'icon-medkit'],
      ['schedule.html', 'icon-clock'], ['profile.html', 'icon-user']
    ],
    secretary: [
      ['index.html', 'icon-dashboard'], ['appointments.html', 'icon-calendar'], ['patients.html', 'icon-users'],
      ['queue.html', 'icon-briefcase'], ['payments.html', 'icon-credit-card'], ['notifications.html', 'icon-bell']
    ],
    patient: [
      ['index.html', 'icon-dashboard'], ['appointments.html', 'icon-calendar'],
      ['medical-records.html', 'icon-file-text'], ['prescriptions.html', 'icon-medkit'],
      ['payments.html', 'icon-credit-card'], ['profile.html', 'icon-user']
    ]
  };

  function detectRole() {
    const declared = document.body?.dataset.panelRole;
    if (declared && ROLE_CONFIG[declared]) return declared;
    const path = location.pathname;
    if (path.includes('/clinic-manager/')) return 'clinic-manager';
    if (path.includes('/admin/')) return 'system-admin';
    if (path.includes('/doctor/')) return 'doctor';
    if (path.includes('/secretary/')) return 'secretary';
    return 'patient';
  }

  function currentFile() {
    return (location.pathname.split('/').pop() || 'index.html').split('?')[0] || 'index.html';
  }

  function basename(href) {
    try { return new URL(href, location.href).pathname.split('/').pop() || 'index.html'; }
    catch (_) { return String(href || '').split('#')[0].split('?')[0].split('/').pop() || 'index.html'; }
  }

  function readStoredUser() {
    const stores = [];
    try { stores.push(window.localStorage); } catch (_) {}
    try { stores.push(window.sessionStorage); } catch (_) {}
    const keys = ['user', 'currentUser', 'authUser', 'noorvista_user', 'nv_user'];
    for (const store of stores) {
      for (const key of keys) {
        try {
          const raw = store.getItem(key);
          if (!raw) continue;
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') return parsed;
        } catch (_) {}
      }
    }
    return {};
  }

  function userNameFrom(user, fallback) {
    return user.full_name || user.fullName || user.display_name || user.name || user.username || fallback;
  }

  function initials(value, fallback) {
    const words = String(value || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return fallback;
    return `${words[0]?.[0] || ''}${words[1]?.[0] || ''}` || fallback;
  }

  function persianDate() {
    try {
      return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      }).format(new Date());
    } catch (_) { return new Date().toLocaleDateString('fa-IR'); }
  }

  function safeLogout(event) {
    if (event) event.preventDefault();
    if (typeof window.logout === 'function' && window.logout !== safeLogout) {
      try { window.logout(); return; } catch (_) {}
    }
    ['token', 'authToken', 'noorvista_token', 'user', 'currentUser', 'authUser', 'noorvista_user', 'nv_user']
      .forEach((key) => { try { localStorage.removeItem(key); sessionStorage.removeItem(key); } catch (_) {} });
    location.href = '/login';
  }

  function sidebarCandidates() {
    return qsa('[data-nv-unified-sidebar], [data-nv-sidebar], aside.sidebar, .sidebar, .nv-patient-sidebar')
      .filter((node, index, list) => node instanceof HTMLElement && list.indexOf(node) === index);
  }

  function findSidebar() {
    return qs('[data-nv-unified-sidebar]')
      || sidebarCandidates().find((node) => node.querySelector('nav, .sidebar-nav, a[href]'))
      || sidebarCandidates()[0]
      || null;
  }

  function findMain(sidebar) {
    const layout = sidebar?.closest('.nv-shell-layout');
    if (layout) return qs(':scope > .nv-shell-main', layout);

    const parent = sidebar?.parentElement || document;
    return qs(':scope > .main-content, :scope > .nv-patient-main, :scope > .tw-min-w-0', parent)
      || sidebar?.nextElementSibling
      || qs('.main-content, .nv-patient-main, main');
  }

  function removeDuplicateSidebars(canonical) {
    sidebarCandidates().forEach((node) => {
      if (node !== canonical && !canonical.contains(node)) node.remove();
    });
  }

  function pruneSidebar(sidebar) {
    if (!sidebar) return;
    const allowed = new Set([
      qs(':scope > .nv-shell-brand-panel', sidebar),
      qs(':scope > .nv-shell-nav', sidebar),
      qs(':scope > .nv-shell-sidebar-footer', sidebar)
    ].filter(Boolean));

    Array.from(sidebar.children).forEach((child) => {
      if (!allowed.has(child)) child.remove();
    });
  }

  function removeDuplicateHeaders(main, canonical) {
    if (!main) return;
    qsa(':scope > header, :scope > .top-header, :scope > .nv-unified-header', main).forEach((header) => {
      if (header !== canonical) header.remove();
    });
  }

  function ensureLayout(sidebar, main) {
    let layout = sidebar.closest('.nv-shell-layout');
    if (!layout) {
      const existing = qs('.nv-shell-layout');
      if (existing && existing.contains(main)) {
        layout = existing;
      } else {
        layout = sidebar.parentElement;
        const suitable = layout && main.parentElement === layout && layout !== document.body;
        if (!suitable) {
          layout = document.createElement('div');
          layout.className = 'nv-shell-layout';
          const first = [sidebar, main].sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1)[0];
          first.parentNode.insertBefore(layout, first);
          layout.append(sidebar, main);
        }
      }
    }

    qsa('.nv-shell-layout').forEach((candidate) => {
      if (candidate === layout) return;
      Array.from(candidate.children).forEach((child) => {
        if (child !== sidebar && child !== main) layout.appendChild(child);
      });
      candidate.remove();
    });

    if (sidebar.parentElement !== layout) layout.prepend(sidebar);
    if (main.parentElement !== layout) layout.append(main);

    layout.classList.add('nv-shell-layout');
    sidebar.classList.add('nv-shell-sidebar');
    sidebar.setAttribute('data-nv-unified-sidebar', '');
    main.classList.add('nv-shell-main');
    main.id = main.id || 'mainContent';
    main.setAttribute('tabindex', '-1');
    return layout;
  }

  function collectLinks(sidebar, role) {
    const navRoot = sidebar.querySelector('nav, .sidebar-nav');
    const links = navRoot ? qsa('a[href]', navRoot).filter((link) => {
      const href = link.getAttribute('href') || '';
      return href && !href.startsWith('javascript:');
    }) : [];
    if (links.length) return links;

    return (FALLBACK_MENUS[role] || []).map(([href, icon]) => {
      const link = document.createElement('a');
      link.href = href;
      link.innerHTML = `<i class="${icon}" aria-hidden="true"></i><span>${LABELS[role]?.[href] || href}</span>`;
      return link;
    });
  }

  function normalizeLink(link, role, isActive) {
    const file = basename(link.getAttribute('href'));
    const existingLabel = String(link.textContent || '').replace(/\s+/g, ' ').trim();
    const mapped = LABELS[role]?.[file];
    const specialNewAppointment = role === 'secretary' && file === 'appointments.html' && (link.getAttribute('href') || '').includes('#new');
    const label = specialNewAppointment ? 'ثبت نوبت جدید' : (mapped || existingLabel || 'بخش پنل');
    const icon = link.querySelector('i');
    let labelNode = link.querySelector('span:not(.nv-tw-nav-icon):not(.nv-shell-nav-icon)');
    if (!labelNode) {
      labelNode = document.createElement('span');
      link.appendChild(labelNode);
    }
    labelNode.textContent = label;
    labelNode.className = 'nv-shell-nav-label';
    if (icon) {
      icon.removeAttribute('style');
      icon.setAttribute('aria-hidden', 'true');
    }
    link.className = `nav-link nv-tw-nav-link nv-shell-nav-link${isActive ? ' active nv-tw-nav-link-active' : ''}`;
    link.title = label;
    if (isActive) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
    return link;
  }

  function buildSidebar(sidebar, role) {
    const config = ROLE_CONFIG[role];
    const current = currentFile();
    let links = collectLinks(sidebar, role);
    const exactHash = location.hash;
    let activeAssigned = false;

    links = links.filter((link, index, array) => {
      const signature = `${link.getAttribute('href') || ''}|${String(link.textContent || '').trim()}`;
      return array.findIndex((item) => `${item.getAttribute('href') || ''}|${String(item.textContent || '').trim()}` === signature) === index;
    });

    const navList = document.createElement('ul');
    navList.className = 'nv-shell-nav-list';
    links.forEach((link) => {
      const href = link.getAttribute('href') || '';
      const file = basename(href);
      const hash = href.includes('#') ? `#${href.split('#').slice(1).join('#')}` : '';
      let active = file === current && (!hash || hash === exactHash);
      if (file === current && !activeAssigned && !exactHash && hash) active = false;
      if (active && !activeAssigned) activeAssigned = true;
      else if (active) active = false;
      const li = document.createElement('li');
      li.className = 'nv-shell-nav-item';
      li.appendChild(normalizeLink(link, role, active));
      navList.appendChild(li);
    });

    if (!activeAssigned) {
      const first = qsa('.nv-shell-nav-link', navList).find((link) => basename(link.href) === current);
      if (first) { first.classList.add('active'); first.setAttribute('aria-current', 'page'); }
    }

    sidebar.innerHTML = '';
    sidebar.setAttribute('aria-label', `ناوبری ${config.label}`);

    const header = document.createElement('div');
    header.className = 'nv-shell-brand-panel';
    header.innerHTML = `
      <a class="nv-shell-brand" href="index.html" aria-label="صدرا، داشبورد">
        <span class="nv-shell-brand-mark" aria-hidden="true">NV</span>
        <span class="nv-shell-brand-copy">
          <strong class="nv-shell-brand-title">NOORVISTA</strong>
          <small class="nv-shell-brand-subtitle">سامانه دستیار پزشک</small>
        </span>
      </a>
      <button class="nv-shell-collapse" type="button" aria-expanded="true" aria-label="جمع کردن منوی کناری" title="جمع کردن منوی کناری"><i class="icon-chevron-right" aria-hidden="true"></i></button>
      <button class="nv-shell-mobile-close" type="button" aria-label="بستن منوی پنل"><i class="icon-close" aria-hidden="true"></i></button>`;

    const nav = document.createElement('nav');
    nav.className = 'nv-shell-nav';
    nav.setAttribute('aria-label', 'منوی اصلی پنل');
    nav.appendChild(navList);

    const footer = document.createElement('div');
    footer.className = 'nv-shell-sidebar-footer';
    footer.innerHTML = '<button class="nv-shell-logout" type="button"><i class="icon-sign-out" aria-hidden="true"></i><span>خروج از حساب</span></button>';

    sidebar.append(header, nav, footer);
    qs('.nv-shell-logout', footer)?.addEventListener('click', safeLogout);
  }

  function findExistingUserMenu(oldHeader) {
    const container = oldHeader?.querySelector('.nv-shell-user-menu, .nv-user-menu, .user-menu');
    if (container) return container;
    const trigger = oldHeader?.querySelector('[data-nv-user-menu-toggle]');
    if (!trigger) return null;
    return trigger.closest('.tw-relative') || trigger.parentElement;
  }

  function buildGenericDropdown(role) {
    const config = ROLE_CONFIG[role];
    const dropdown = document.createElement('div');
    dropdown.className = 'nv-shell-user-dropdown';
    dropdown.setAttribute('role', 'menu');
    if (config.profile) {
      const link = document.createElement('a');
      link.href = config.profile;
      link.setAttribute('role', 'menuitem');
      link.innerHTML = '<i class="icon-user" aria-hidden="true"></i><span>اطلاعات حساب و تنظیمات حساب</span>';
      dropdown.appendChild(link);
    }
    const home = document.createElement('a');
    home.href = 'index.html';
    home.setAttribute('role', 'menuitem');
    home.innerHTML = '<i class="icon-dashboard" aria-hidden="true"></i><span>داشبورد</span>';
    dropdown.appendChild(home);
    const divider = document.createElement('div');
    divider.className = 'user-dropdown-divider';
    divider.setAttribute('aria-hidden', 'true');
    dropdown.appendChild(divider);
    const logout = document.createElement('button');
    logout.type = 'button';
    logout.setAttribute('role', 'menuitem');
    logout.setAttribute('data-nv-unified-logout', '');
    logout.innerHTML = '<i class="icon-sign-out" aria-hidden="true"></i><span>خروج از حساب</span>';
    logout.addEventListener('click', safeLogout);
    dropdown.appendChild(logout);
    return dropdown;
  }

  function buildUserMenu(oldHeader, role) {
    const config = ROLE_CONFIG[role];
    const stored = readStoredUser();
    const oldName = oldHeader?.querySelector('[data-nv-user-name], #userName, .nv-header-user-name, .user-name')?.textContent?.trim();
    const name = (oldName && !['کاربر NOORVISTA', 'کاربر سیستم'].includes(oldName)) ? oldName : userNameFrom(stored, config.fallback);
    const existing = findExistingUserMenu(oldHeader);
    let dropdown = existing?.querySelector('[data-nv-user-menu], .nv-user-dropdown, .user-dropdown');
    if (dropdown) dropdown.remove();
    else dropdown = buildGenericDropdown(role);

    dropdown.classList.add('nv-shell-user-dropdown');
    dropdown.classList.remove('tw-hidden');
    dropdown.setAttribute('role', dropdown.getAttribute('role') || 'menu');

    const wrapper = document.createElement('div');
    wrapper.className = 'nv-shell-user-menu';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'nv-shell-user-trigger';
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML = `
      <span class="user-avatar nv-header-avatar nv-shell-user-avatar" id="userAvatar" data-nv-user-avatar data-fallback="${config.avatar}">${initials(name, config.avatar)}</span>
      <span class="nv-shell-user-copy">
        <strong class="user-name nv-header-user-name nv-shell-user-name" id="userName" data-nv-user-name>${name}</strong>
        <small class="user-role nv-header-user-role nv-shell-user-role">${config.label}</small>
      </span>
      <i class="icon-chevron-down nv-shell-user-chevron" aria-hidden="true"></i>`;
    wrapper.append(trigger, dropdown);

    const setOpen = (open) => {
      wrapper.classList.toggle('nv-open', open);
      trigger.setAttribute('aria-expanded', String(open));
    };
    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      setOpen(!wrapper.classList.contains('nv-open'));
    });
    document.addEventListener('click', (event) => {
      if (!wrapper.contains(event.target)) setOpen(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && wrapper.classList.contains('nv-open')) { setOpen(false); trigger.focus(); }
    });
    qsa('a, button', dropdown).forEach((item) => item.addEventListener('click', () => setOpen(false)));
    return wrapper;
  }

  function extractHeading(oldHeader, role) {
    const config = ROLE_CONFIG[role];
    const file = currentFile();
    const h1 = oldHeader?.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim();
    const p = oldHeader?.querySelector('p')?.textContent?.replace(/\s+/g, ' ').trim();
    if (file === 'index.html') return { title: config.indexTitle, description: config.indexDescription };
    return { title: h1 || document.title.split('|')[0].trim() || 'پنل صدرا', description: p || `خدمات و ابزارهای ${config.label}` };
  }

  function buildHeader(main, role) {
    const config = ROLE_CONFIG[role];
    const oldHeader = main.querySelector(':scope > header, :scope > .top-header') || qs('header, .top-header', main);
    const heading = extractHeading(oldHeader, role);
    const userMenu = buildUserMenu(oldHeader, role);
    const existingNotification = oldHeader?.querySelector('.notification-button');

    const header = document.createElement('header');
    header.className = 'top-header nv-unified-header';
    header.innerHTML = `
      <div class="nv-shell-header-primary">
        <button class="nv-shell-mobile-toggle" type="button" aria-expanded="false" aria-label="باز کردن منوی پنل"><i class="icon-menu" aria-hidden="true"></i></button>
        <div class="page-title page-heading">
          <h1>${heading.title}</h1>
          <p>${heading.description}</p>
        </div>
      </div>
      <div class="header-actions">
        <a class="nv-shell-header-button nv-shell-site-home" href="/" aria-label="بازگشت به وب‌سایت" title="بازگشت به وب‌سایت"><i class="icon-home" aria-hidden="true"></i></a>
        <div class="nv-shell-date" aria-label="تاریخ امروز"><small>امروز</small><strong>${persianDate()}</strong></div>
      </div>`;
    const actions = qs('.header-actions', header);

    if (existingNotification) {
      existingNotification.remove();
      existingNotification.classList.add('nv-shell-header-button');
      existingNotification.setAttribute('aria-label', existingNotification.getAttribute('aria-label') || 'اعلان‌ها');
      actions.appendChild(existingNotification);
    } else if (config.notification) {
      const notification = document.createElement('a');
      notification.className = 'nv-shell-header-button';
      notification.href = config.notification;
      notification.title = 'اعلان‌ها';
      notification.setAttribute('aria-label', 'اعلان‌ها');
      notification.innerHTML = '<i class="icon-bell" aria-hidden="true"></i>';
      actions.appendChild(notification);
    }
    actions.appendChild(userMenu);

    if (oldHeader) oldHeader.replaceWith(header);
    else main.prepend(header);
    document.title = `${heading.title} | NOORVISTA`;
    return header;
  }

  function setupSidebarBehavior(sidebar, header, role) {
    qsa('[data-nv-sidebar-overlay], .nv-sidebar-overlay, .tw-fixed.tw-inset-0.tw-z-40').forEach((item) => item.remove());
    const overlays = qsa('.nv-shell-overlay');
    const overlay = overlays.shift() || document.createElement('div');
    overlays.forEach((item) => item.remove());
    overlay.className = 'nv-shell-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    if (!overlay.isConnected) document.body.appendChild(overlay);

    const collapse = qs('.nv-shell-collapse', sidebar);
    const close = qs('.nv-shell-mobile-close', sidebar);
    const mobile = qs('.nv-shell-mobile-toggle', header);
    const storageKey = `noorvista:${role}:unified-sidebar-collapsed`;

    const setCollapsed = (collapsed, persist) => {
      const desktop = matchMedia('(min-width: 1024px)').matches;
      const active = desktop && Boolean(collapsed);
      document.body.classList.toggle('nv-shell-collapsed', active);
      if (collapse) {
        collapse.setAttribute('aria-expanded', String(!active));
        collapse.setAttribute('aria-label', active ? 'باز کردن منوی کناری' : 'جمع کردن منوی کناری');
        collapse.title = active ? 'باز کردن منوی کناری' : 'جمع کردن منوی کناری';
        const icon = collapse.querySelector('i');
        if (icon) {
          icon.classList.toggle('icon-chevron-right', !active);
          icon.classList.toggle('icon-chevron-left', active);
        }
      }
      if (persist) { try { localStorage.setItem(storageKey, active ? '1' : '0'); } catch (_) {} }
    };

    const setMobileOpen = (open) => {
      document.body.classList.toggle('nv-shell-mobile-open', Boolean(open));
      overlay.setAttribute('aria-hidden', open ? 'false' : 'true');
      mobile?.setAttribute('aria-expanded', String(Boolean(open)));
      mobile?.setAttribute('aria-label', open ? 'بستن منوی پنل' : 'باز کردن منوی پنل');
    };

    collapse?.addEventListener('click', () => setCollapsed(!document.body.classList.contains('nv-shell-collapsed'), true));
    mobile?.addEventListener('click', () => setMobileOpen(!document.body.classList.contains('nv-shell-mobile-open')));
    close?.addEventListener('click', () => setMobileOpen(false));
    overlay.addEventListener('click', () => setMobileOpen(false));
    qsa('.nv-shell-nav-link', sidebar).forEach((link) => link.addEventListener('click', () => {
      if (matchMedia('(max-width: 1023px)').matches) setMobileOpen(false);
    }));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && document.body.classList.contains('nv-shell-mobile-open')) { setMobileOpen(false); mobile?.focus(); }
    });

    let stored = false;
    try { stored = localStorage.getItem(storageKey) === '1'; } catch (_) {}
    setCollapsed(stored, false);
    matchMedia('(min-width: 1024px)').addEventListener?.('change', (event) => {
      setMobileOpen(false);
      if (event.matches) {
        try { setCollapsed(localStorage.getItem(storageKey) === '1', false); } catch (_) { setCollapsed(false, false); }
      } else setCollapsed(false, false);
    });
  }



  function normalizePageActions(main) {
    if (!main) return;

    const panels = qsa('.filter-section, .filter-bar, .report-filter', main);
    panels.forEach((panel) => {
      panel.classList.add('nv-shell-filter-panel');

      let actions = qs(':scope > .nv-shell-filter-actions', panel);
      const candidates = Array.from(panel.children).filter((child) => {
        if (!(child instanceof HTMLElement) || child === actions) return false;
        const controls = qsa('input, select, textarea', child);
        const buttons = qsa('button, a.btn, a.button', child);
        return buttons.length > 0 && controls.length === 0;
      });

      if (candidates.length) {
        if (!actions) {
          actions = document.createElement('div');
          actions.className = 'nv-shell-filter-actions';
          panel.appendChild(actions);
        }
        candidates.forEach((group) => {
          qsa('button, a.btn, a.button', group).forEach((button) => actions.appendChild(button));
          group.remove();
        });
      }

      qsa('button, a.btn, a.button', actions || panel).forEach((button) => {
        const text = String(button.textContent || '').replace(/\s+/g, ' ').trim();
        const primary = button.classList.contains('btn-success')
          || /^(ثبت|افزودن|ایجاد)|جدید/.test(text);
        button.classList.toggle('nv-shell-primary-action', primary);
      });
    });
  }

  function ensureSkipLink(main) {
    qsa('.nv-patient-skip-link, .nv-skip-link').forEach((link) => link.remove());
    if (qs('.nv-shell-skip-link')) return;
    const link = document.createElement('a');
    link.className = 'nv-shell-skip-link';
    link.href = `#${main.id}`;
    link.textContent = 'پرش به محتوای اصلی';
    document.body.prepend(link);
  }

  function syncIdentity(role) {
    const config = ROLE_CONFIG[role];
    const user = readStoredUser();
    const name = userNameFrom(user, config.fallback);
    qsa('.nv-unified-header [data-nv-user-name]').forEach((node) => {
      if (!node.textContent.trim() || node.textContent.trim() === config.fallback) node.textContent = name;
    });
    qsa('.nv-unified-header [data-nv-user-avatar]').forEach((node) => {
      node.textContent = initials(name, config.avatar);
      node.setAttribute('aria-label', `آواتار ${name}`);
    });
  }

  let applying = false;
  let integrityObserver = null;

  function enforceSingleShell() {
    const sidebar = qs('[data-nv-unified-sidebar]') || findSidebar();
    const main = sidebar ? findMain(sidebar) : null;
    if (!sidebar || !main) return false;

    removeDuplicateSidebars(sidebar);
    pruneSidebar(sidebar);

    const headers = qsa(':scope > .nv-unified-header', main);
    const header = headers[0] || null;
    headers.slice(1).forEach((item) => item.remove());
    removeDuplicateHeaders(main, header);

    qsa('.nv-shell-overlay').slice(1).forEach((item) => item.remove());
    qsa('.nv-mobile-menu-button, .nv-mobile-sidebar-toggle, .nv-sidebar-toggle, .nv-sidebar-overlay')
      .forEach((item) => item.remove());

    return Boolean(
      sidebar.classList.contains('nv-shell-sidebar')
      && sidebar.querySelector(':scope > .nv-shell-brand-panel')
      && sidebar.querySelector(':scope > .nv-shell-nav')
      && sidebar.querySelector(':scope > .nv-shell-sidebar-footer')
      && header
    );
  }

  function startIntegrityObserver() {
    if (integrityObserver || !document.body) return;
    let timer = null;
    integrityObserver = new MutationObserver((mutations) => {
      const relevant = mutations.some((mutation) => Array.from(mutation.addedNodes).some((node) => {
        if (!(node instanceof Element)) return false;
        return node.matches?.('.sidebar, [data-nv-sidebar], .sidebar-nav, header, .top-header, .nv-sidebar-overlay, .nv-mobile-menu-button, .filter-section, .filter-bar, .report-filter')
          || node.querySelector?.('.sidebar, [data-nv-sidebar], .sidebar-nav, header, .top-header, .nv-sidebar-overlay, .nv-mobile-menu-button, .filter-section, .filter-bar, .report-filter');
      }));
      if (!relevant) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const sidebar = qs('[data-nv-unified-sidebar]') || findSidebar();
        const main = sidebar ? findMain(sidebar) : null;
        if (main) normalizePageActions(main);
        if (!enforceSingleShell()) applyUnifiedShell();
      }, 20);
    });
    integrityObserver.observe(document.body, { childList: true, subtree: true });
  }

  function applyUnifiedShell() {
    if (applying) return;
    applying = true;
    try {
      const role = detectRole();
      const canonical = qs('[data-nv-unified-sidebar]');
      const sidebar = canonical || findSidebar();
      const main = findMain(sidebar);
      if (!sidebar || !main) return;

      document.body.dataset.panelRole = role;
      document.body.classList.add('nv-unified-shell-ready');
      removeDuplicateSidebars(sidebar);
      ensureLayout(sidebar, main);
      buildSidebar(sidebar, role);
      pruneSidebar(sidebar);
      const header = buildHeader(main, role);
      removeDuplicateHeaders(main, header);
      setupSidebarBehavior(sidebar, header, role);
      ensureSkipLink(main);
      syncIdentity(role);
      normalizePageActions(main);
      enforceSingleShell();
      startIntegrityObserver();
    } finally {
      applying = false;
    }
  }

  function repairIfNeeded() {
    const sidebar = qs('[data-nv-unified-sidebar]') || findSidebar();
    const main = sidebar ? findMain(sidebar) : null;
    if (main) normalizePageActions(main);
    if (!enforceSingleShell()) applyUnifiedShell();
  }

  ready(() => {
    applyUnifiedShell();
    [80, 180, 380, 760, 1400].forEach((delay) => setTimeout(repairIfNeeded, delay));
    window.addEventListener('load', () => {
      [60, 260, 700].forEach((delay) => setTimeout(repairIfNeeded, delay));
    }, { once: true });
  });
})();
