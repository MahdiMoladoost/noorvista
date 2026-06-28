// Sadra Tailwind dashboard shell
(function () {
  'use strict';

  if (window.__NOORVISTA_TW_DASHBOARD_SHELL__) return;
  window.__NOORVISTA_TW_DASHBOARD_SHELL__ = true;

  const qs = (selector, root = document) => root.querySelector(selector);
  const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function readUser() {
    for (const key of ['user', 'currentUser', 'authUser', 'noorvista_user', 'nv_user']) {
      try {
        const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch (_) {}
    }
    return {};
  }

  function displayName(user) {
    return user.full_name || user.fullName || user.display_name || user.name || user.username || 'کاربر صدرا';
  }

  function initials(name, fallback) {
    const clean = String(name || '').trim();
    if (!clean) return fallback || 'NV';
    const parts = clean.split(/\s+/).filter(Boolean);
    return (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
  }

  function logout() {
    ['token', 'authToken', 'noorvista_token', 'user', 'currentUser', 'authUser'].forEach(key => localStorage.removeItem(key));
    window.location.href = '/login';
  }

  function initIdentity() {
    const user = readUser();
    const name = displayName(user);
    qsa('[data-nv-user-name]').forEach(el => { el.textContent = name; });
    qsa('[data-nv-user-avatar]').forEach(el => {
      el.textContent = initials(name, el.dataset.fallback || 'NV');
      el.setAttribute('aria-label', `آواتار ${name}`);
    });

    const date = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    }).format(new Date());
    qsa('[data-nv-today]').forEach(el => { el.textContent = date; });
  }

  function initSidebar() {
    const sidebar = qs('[data-nv-sidebar]');
    const overlay = qs('[data-nv-sidebar-overlay]');
    const mobileTriggers = qsa('[data-nv-sidebar-toggle]');
    const collapseTrigger = qs('[data-nv-sidebar-collapse]');
    const collapseIcon = qs('[data-nv-sidebar-collapse-icon]');
    const desktopMedia = window.matchMedia('(min-width: 1024px)');
    const collapseStorageKey = 'noorvista.patient.sidebar.collapsed';
    if (!sidebar) return;

    qsa('.nv-tw-nav-link', sidebar).forEach(link => {
      const label = qs('.nv-patient-nav-label', link)?.textContent?.trim();
      if (label && !link.title) link.title = label;
    });

    const setMobileOpen = open => {
      sidebar.classList.toggle('tw-translate-x-full', !open);
      sidebar.classList.toggle('tw-translate-x-0', open);
      if (overlay) overlay.classList.toggle('tw-hidden', !open);
      mobileTriggers.forEach(btn => btn.setAttribute('aria-expanded', String(open)));
      document.body.style.overflow = open && !desktopMedia.matches ? 'hidden' : '';
    };

    const readCollapsed = () => {
      try { return localStorage.getItem(collapseStorageKey) === '1'; }
      catch (_) { return false; }
    };

    const setCollapsed = (collapsed, persist = true) => {
      const active = desktopMedia.matches && Boolean(collapsed);
      document.documentElement.classList.toggle('nv-patient-sidebar-collapsed', active);
      if (collapseTrigger) {
        collapseTrigger.setAttribute('aria-expanded', String(!active));
        collapseTrigger.setAttribute('aria-label', active ? 'باز کردن منوی کناری' : 'جمع کردن منوی کناری');
        collapseTrigger.title = active ? 'باز کردن منوی کناری' : 'جمع کردن منوی کناری';
      }
      if (collapseIcon) {
        collapseIcon.classList.toggle('icon-chevron-right', !active);
        collapseIcon.classList.toggle('icon-chevron-left', active);
      }
      if (persist) {
        try { localStorage.setItem(collapseStorageKey, active ? '1' : '0'); }
        catch (_) {}
      }
    };

    mobileTriggers.forEach(btn => btn.addEventListener('click', () => {
      setMobileOpen(sidebar.classList.contains('tw-translate-x-full'));
    }));
    collapseTrigger?.addEventListener('click', () => {
      setCollapsed(!document.documentElement.classList.contains('nv-patient-sidebar-collapsed'));
    });
    overlay?.addEventListener('click', () => setMobileOpen(false));
    qsa('a', sidebar).forEach(link => link.addEventListener('click', () => {
      if (!desktopMedia.matches) setMobileOpen(false);
    }));

    const syncViewport = () => {
      if (desktopMedia.matches) {
        if (overlay) overlay.classList.add('tw-hidden');
        document.body.style.overflow = '';
        setCollapsed(readCollapsed(), false);
      } else {
        document.documentElement.classList.remove('nv-patient-sidebar-collapsed');
        setMobileOpen(false);
      }
    };

    if (typeof desktopMedia.addEventListener === 'function') desktopMedia.addEventListener('change', syncViewport);
    else desktopMedia.addListener(syncViewport);

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !desktopMedia.matches) setMobileOpen(false);
    });

    syncViewport();
  }

  function initUserMenu() {
    const menu = qs('[data-nv-user-menu]');
    const trigger = qs('[data-nv-user-menu-toggle]');
    if (!menu || !trigger) return;

    const setOpen = open => {
      menu.classList.toggle('tw-hidden', !open);
      trigger.setAttribute('aria-expanded', String(open));
    };

    trigger.addEventListener('click', event => {
      event.stopPropagation();
      setOpen(menu.classList.contains('tw-hidden'));
    });
    document.addEventListener('click', event => {
      if (!menu.contains(event.target) && !trigger.contains(event.target)) setOpen(false);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') setOpen(false);
    });
  }

  function init() {
    initIdentity();
    if (!window.__NOORVISTA_UNIFIED_SHELL__) {
      initSidebar();
      initUserMenu();
    }
    qsa('[data-nv-logout]').forEach(btn => btn.addEventListener('click', event => {
      event.preventDefault();
      if (typeof window.logout === 'function' && window.logout !== logout) window.logout();
      else logout();
    }));
    if (typeof window.logout !== 'function') window.logout = logout;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
