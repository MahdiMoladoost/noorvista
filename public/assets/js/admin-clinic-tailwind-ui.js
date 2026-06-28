/* NOORVISTA admin/clinic-manager Tailwind shell.
 * Presentation and accessibility only: no API, CRUD, permission or data logic is changed.
 */
(function () {
  'use strict';

  if (window.__NOORVISTA_ADMIN_CLINIC_TW_UI__) return;
  window.__NOORVISTA_ADMIN_CLINIC_TW_UI__ = true;

  const ready = (fn) => document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', fn, { once: true })
    : fn();

  const body = () => document.body;
  const qs = (selector, root = document) => root.querySelector(selector);
  const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function roleInfo() {
    const role = body().dataset.panelRole || (location.pathname.includes('/clinic-manager/') ? 'clinic-manager' : 'system-admin');
    return role === 'clinic-manager'
      ? { key: role, label: 'مدیر کلینیک', storage: 'nv:clinic-manager:sidebar-collapsed' }
      : { key: 'system-admin', label: 'مدیر سیستم', storage: 'nv:system-admin:sidebar-collapsed' };
  }

  function addTailwindUtilities() {
    body().classList.add('tw-font-sans', 'tw-min-h-screen', 'tw-bg-slate-50');
    const sidebar = qs('.sidebar');
    const main = qs('.main-content');
    const header = qs('.top-header');
    if (sidebar) sidebar.classList.add('tw-flex', 'tw-flex-col', 'tw-overflow-hidden');
    if (main) {
      main.id = main.id || 'main-content';
      main.classList.add('tw-min-w-0', 'tw-min-h-screen');
      main.setAttribute('tabindex', '-1');
    }
    if (header) header.classList.add('tw-sticky', 'tw-top-0', 'tw-bg-white/90', 'tw-backdrop-blur-xl');
  }

  function ensureSkipLink() {
    if (qs('.nv-skip-link')) return;
    const link = document.createElement('a');
    link.className = 'nv-skip-link';
    link.href = '#main-content';
    link.textContent = 'رفتن به محتوای اصلی';
    document.body.prepend(link);
  }

  function enhanceBrand() {
    const header = qs('.sidebar-header');
    if (!header || header.dataset.nvEnhanced === '1') return;

    const info = roleInfo();
    header.dataset.nvEnhanced = '1';
    header.innerHTML = `
      <span class="nv-sidebar-brand-mark" aria-hidden="true">NV</span>
      <span class="nv-sidebar-brand-copy">
        <span class="sidebar-logo nv-sidebar-brand-title">NOOR<span>VISTA</span></span>
        <span class="nv-sidebar-brand-subtitle">سامانه هوشمند سلامت</span>
        <span class="nv-sidebar-role">${info.label}</span>
      </span>
      <button class="nv-sidebar-toggle" type="button" aria-label="جمع کردن منوی کناری" aria-expanded="true" title="جمع کردن منوی کناری">
        <i class="icon-chevron-right" aria-hidden="true"></i>
      </button>`;
  }

  function currentFile() {
    return (location.pathname.split('/').pop() || 'index.html').split('?')[0] || 'index.html';
  }

  function enhanceNavigation() {
    const current = currentFile();
    qsa('.sidebar-nav .nav-link').forEach((link) => {
      const label = String(link.textContent || '').replace(/\s+/g, ' ').trim();
      link.dataset.nvLabel = label;
      link.title = label;
      const matches = String(link.getAttribute('data-sidebar-match') || '').split(',').map(x => x.trim()).filter(Boolean);
      const href = (link.getAttribute('href') || '').split('/').pop().split('?')[0] || 'index.html';
      const active = link.classList.contains('active') || href === current || matches.includes(current);
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    const nav = qs('.sidebar-nav');
    if (nav) nav.setAttribute('aria-label', 'منوی اصلی پنل');
  }

  function setCollapsed(collapsed, persist) {
    const info = roleInfo();
    const toggle = qs('.nv-sidebar-toggle');
    body().classList.toggle('nv-sidebar-collapsed', Boolean(collapsed));
    if (toggle) {
      toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      toggle.setAttribute('aria-label', collapsed ? 'باز کردن منوی کناری' : 'جمع کردن منوی کناری');
      toggle.title = collapsed ? 'باز کردن منوی کناری' : 'جمع کردن منوی کناری';
    }
    if (persist) {
      try { localStorage.setItem(info.storage, collapsed ? '1' : '0'); } catch (_) {}
    }
  }

  function setupSidebar() {
    const sidebar = qs('.sidebar');
    const toggle = qs('.nv-sidebar-toggle');
    const topHeader = qs('.top-header');
    if (!sidebar || !topHeader) return;

    const info = roleInfo();
    let stored = false;
    try { stored = localStorage.getItem(info.storage) === '1'; } catch (_) {}
    if (window.matchMedia('(min-width: 993px)').matches) setCollapsed(stored, false);

    if (toggle) toggle.addEventListener('click', () => setCollapsed(!body().classList.contains('nv-sidebar-collapsed'), true));

    let mobileButton = qs('.nv-mobile-menu-button');
    if (!mobileButton) {
      mobileButton = document.createElement('button');
      mobileButton.type = 'button';
      mobileButton.className = 'nv-mobile-menu-button';
      mobileButton.setAttribute('aria-label', 'باز کردن منوی پنل');
      mobileButton.setAttribute('aria-expanded', 'false');
      mobileButton.innerHTML = '<i class="icon-menu" aria-hidden="true"></i>';
      topHeader.prepend(mobileButton);
    }

    let overlay = qs('.nv-sidebar-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'nv-sidebar-overlay';
      overlay.setAttribute('aria-hidden', 'true');
      document.body.appendChild(overlay);
    }

    const setMobileOpen = (open) => {
      body().classList.toggle('nv-sidebar-mobile-open', open);
      mobileButton.setAttribute('aria-expanded', open ? 'true' : 'false');
      mobileButton.setAttribute('aria-label', open ? 'بستن منوی پنل' : 'باز کردن منوی پنل');
      overlay.setAttribute('aria-hidden', open ? 'false' : 'true');
    };

    mobileButton.addEventListener('click', () => setMobileOpen(!body().classList.contains('nv-sidebar-mobile-open')));
    overlay.addEventListener('click', () => setMobileOpen(false));
    qsa('.sidebar-nav .nav-link').forEach(link => link.addEventListener('click', () => {
      if (window.matchMedia('(max-width: 992px)').matches) setMobileOpen(false);
    }));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && body().classList.contains('nv-sidebar-mobile-open')) {
        setMobileOpen(false);
        mobileButton.focus();
      }
    });
    window.addEventListener('resize', () => {
      if (window.innerWidth > 992) setMobileOpen(false);
    }, { passive: true });
  }

  function formatPersianDate() {
    try {
      return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      }).format(new Date());
    } catch (_) {
      return new Date().toLocaleDateString('fa-IR');
    }
  }

  function enhanceHeader() {
    const actions = qs('.header-actions');
    if (!actions || qs('.nv-header-date', actions)) return;
    const date = document.createElement('div');
    date.className = 'nv-header-date';
    date.setAttribute('aria-label', `تاریخ امروز ${formatPersianDate()}`);
    date.innerHTML = `<i class="icon-calendar" aria-hidden="true"></i><span>${formatPersianDate()}</span>`;
    actions.prepend(date);

    const pageTitle = qs('.page-heading h1');
    if (pageTitle && !document.title.includes(pageTitle.textContent.trim())) {
      document.title = `${pageTitle.textContent.trim()} | NOORVISTA`;
    }
  }

  function enhanceTables(root = document) {
    qsa('table', root).forEach((table) => {
      if (table.dataset.nvTableEnhanced === '1') return;
      table.dataset.nvTableEnhanced = '1';
      const parent = table.parentElement;
      if (parent && !parent.classList.contains('table-responsive') && !parent.classList.contains('nv-table-region')) {
        const wrapper = document.createElement('div');
        wrapper.className = 'nv-table-region';
        wrapper.setAttribute('role', 'region');
        wrapper.setAttribute('tabindex', '0');
        const heading = table.closest('.card, .card-modern, .appt-card')?.querySelector('h2, h3, h4');
        wrapper.setAttribute('aria-label', heading ? `جدول ${heading.textContent.trim()}` : 'جدول اطلاعات');
        parent.insertBefore(wrapper, table);
        wrapper.appendChild(table);
      } else if (parent) {
        parent.setAttribute('role', 'region');
        parent.setAttribute('tabindex', '0');
      }
    });
  }

  function enhanceForms(root = document) {
    qsa('input, select, textarea', root).forEach((control) => {
      if (control.dataset.nvA11yEnhanced === '1') return;
      control.dataset.nvA11yEnhanced = '1';
      const group = control.closest('.form-group, .filter-group');
      const label = group && group.querySelector('label');
      if (label && !control.id) control.id = `nv-field-${Math.random().toString(36).slice(2, 9)}`;
      if (label && !label.getAttribute('for') && control.id) label.setAttribute('for', control.id);
      if (!control.getAttribute('aria-label') && !label && control.getAttribute('placeholder')) {
        control.setAttribute('aria-label', control.getAttribute('placeholder'));
      }
    });
  }

  function enhanceButtons(root = document) {
    qsa('button', root).forEach((button) => {
      if (!button.getAttribute('type') && !button.closest('form')) button.type = 'button';
      if (!button.getAttribute('aria-label') && !String(button.textContent || '').trim()) {
        const title = button.getAttribute('title');
        if (title) button.setAttribute('aria-label', title);
      }
    });
  }

  function enhanceDynamicContent() {
    let timer = null;
    const observer = new MutationObserver((mutations) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          enhanceTables(node);
          enhanceForms(node);
          enhanceButtons(node);
          if (node.matches('table')) enhanceTables(node.parentElement || document);
        }));
      }, 40);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  ready(() => {
    addTailwindUtilities();
    if (!window.__NOORVISTA_UNIFIED_SHELL__) {
      ensureSkipLink();
      enhanceBrand();
      enhanceNavigation();
      setupSidebar();
      enhanceHeader();
    }
    enhanceTables();
    enhanceForms();
    enhanceButtons();
    enhanceDynamicContent();
  });
})();
