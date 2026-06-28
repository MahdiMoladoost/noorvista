/* Sadra 2.1.5 — admin UI consistency and regression guard */
(function () {
  'use strict';
  if (window.__NOORVISTA_ADMIN_UI_215__) return;
  window.__NOORVISTA_ADMIN_UI_215__ = true;

  const faDigits = '۰۱۲۳۴۵۶۷۸۹';
  if (typeof window.toPersianNumber !== 'function') {
    window.toPersianNumber = function toPersianNumber(value) {
      return String(value ?? '').replace(/\d/g, digit => faDigits[Number(digit)]);
    };
  }
  if (typeof window.toEnglishNumber !== 'function') {
    window.toEnglishNumber = function toEnglishNumber(value) {
      return String(value ?? '')
        .replace(/[۰-۹]/g, digit => String(faDigits.indexOf(digit)))
        .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
    };
  }

  const currentFile = () => {
    const name = String(location.pathname || '').split('/').filter(Boolean).pop() || 'index.html';
    return /\.html?$/i.test(name) ? name.toLowerCase() : 'index.html';
  };

  const parentPage = {
    'appointment-slots.html': 'appointments.html',
    'doctor-centers.html': 'medical-centers.html'
  };

  function hrefFile(link) {
    try {
      const url = new URL(link.getAttribute('href') || '', location.href);
      return url.pathname.split('/').filter(Boolean).pop()?.toLowerCase() || 'index.html';
    } catch (_) {
      return '';
    }
  }

  let syncingSidebar = false;
  function syncSidebarActive() {
    if (syncingSidebar) return;
    const sidebar = document.querySelector('[data-nv3-sidebar], .nv3-sidebar');
    if (!sidebar) return;
    const links = Array.from(sidebar.querySelectorAll('.nv3-nav-link'));
    if (!links.length) return;
    syncingSidebar = true;
    try {
      const wanted = parentPage[currentFile()] || currentFile();
      links.forEach(link => {
        link.classList.remove('is-active', 'active');
        link.removeAttribute('aria-current');
      });
      const selected = links.find(link => hrefFile(link) === wanted) || links.find(link => hrefFile(link) === 'index.html');
      if (selected) {
        selected.classList.add('is-active');
        selected.setAttribute('aria-current', 'page');
      }
    } finally {
      syncingSidebar = false;
    }
  }

  function buttonKind(button) {
    const text = String(button.textContent || '').replace(/\s+/g, ' ').trim();
    if (/افزودن|ثبت .*جدید|پزشک جدید|اعلان جدید|پرسش جدید/.test(text)) return 'is-create';
    if (/جستجو|نمایش گزارش|به.?روزرسانی|بروزرسانی/.test(text)) return 'is-search';
    if (/پاک.?سازی|بازنشانی|پاک کردن$/.test(text)) return 'is-neutral';
    if (/قدیمی|حذف همگانی|پاک کردن رویداد/.test(text)) return 'is-danger';
    return '';
  }

  function decorateActionButton(button) {
    if (!button) return;
    button.classList.add('nv3-control-action');
    const kind = buttonKind(button);
    if (kind) button.classList.add(kind);
  }

  function ensureActionRow(panel) {
    if (!panel || panel.dataset.nv215Actions === '1') return;
    const movable = [];
    Array.from(panel.children).forEach(child => {
      if (child.classList?.contains('nv-admin-filter-actions')) return;
      if (child.matches?.('button,a.btn')) {
        movable.push({ wrapper: null, button: child });
        return;
      }
      if (!child.matches?.('.filter-group,.form-group')) return;
      const buttons = Array.from(child.querySelectorAll(':scope > button, :scope > a.btn'));
      const hasControl = child.querySelector('input,select,textarea');
      if (buttons.length === 1 && !hasControl) movable.push({ wrapper: child, button: buttons[0] });
    });
    if (!movable.length) {
      panel.dataset.nv215Actions = '1';
      return;
    }
    const row = document.createElement('div');
    row.className = 'nv-admin-filter-actions';
    movable
      .sort((a, b) => {
        const rank = kind => ({ 'is-create': 0, 'is-search': 1, 'is-neutral': 2, 'is-danger': 3, '': 4 }[kind] ?? 4);
        return rank(buttonKind(a.button)) - rank(buttonKind(b.button));
      })
      .forEach(({ wrapper, button }) => {
        decorateActionButton(button);
        row.appendChild(button);
        wrapper?.remove();
      });
    panel.appendChild(row);
    panel.dataset.nv215Actions = '1';
  }

  function moveReportHeaderActions() {
    if (document.body?.dataset.nvPage !== 'reports') return;
    const filter = document.querySelector('.report-filter');
    const header = filter?.closest('.card')?.querySelector('.card-header');
    if (!filter || !header) return;
    const source = Array.from(header.children).find(child => child !== header.querySelector('h4') && child.querySelector?.('button'));
    if (!source) return;
    let row = filter.querySelector('.nv-admin-filter-actions');
    if (!row) {
      row = document.createElement('div');
      row.className = 'nv-admin-filter-actions';
      filter.appendChild(row);
    }
    Array.from(source.querySelectorAll('button')).forEach(button => {
      decorateActionButton(button);
      row.appendChild(button);
    });
    source.remove();
  }

  function addSearchIcons(root = document) {
    const selectors = [
      '.nv3-action-panel input[type="search"]',
      '.nv3-action-panel input[id*="Search"]',
      '.nv3-action-panel input[id*="search"]',
      '.nv3-action-panel input.search'
    ].join(',');
    root.querySelectorAll(selectors).forEach(input => {
      if (input.closest('.nv-input-icon-wrap,.nv-date-field')) return;
      const wrap = document.createElement('div');
      wrap.className = 'nv-input-icon-wrap';
      const icon = document.createElement('i');
      icon.className = 'icon-search';
      icon.setAttribute('aria-hidden', 'true');
      input.parentNode.insertBefore(wrap, input);
      wrap.append(icon, input);
    });
  }

  function normalizeDateFields(root = document) {
    root.querySelectorAll('.nv-date-field').forEach(field => {
      const triggers = Array.from(field.querySelectorAll(':scope > .nv-date-trigger'));
      triggers.forEach((button, index) => {
        if (index === 0) button.dataset.nvDatePrimary = '1';
        else button.remove();
      });
    });
  }

  function normalizePersianLabels() {
    const replacements = new Map([
      ['بروزرسانی', 'به‌روزرسانی'],
      ['سوالات پرتکرار', 'پرسش‌های پرتکرار'],
      ['لیست سوالات', 'فهرست پرسش‌ها'],
      ['افزودن سوال', 'افزودن پرسش'],
      ['هیچ لاگی یافت نشد', 'هیچ رویدادی یافت نشد'],
      ['لاگ‌های سیستم', 'رویدادهای سیستم']
    ]);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.parentElement || node.parentElement.closest('script,style,code,textarea')) return NodeFilter.FILTER_REJECT;
        return Array.from(replacements.keys()).some(key => node.nodeValue.includes(key)) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      let text = node.nodeValue;
      replacements.forEach((value, key) => { text = text.replaceAll(key, value); });
      node.nodeValue = text;
    });
  }

  function init() {
    if (!document.body?.classList.contains('nv3-role-admin')) return;
    syncSidebarActive();
    document.querySelectorAll('.nv3-action-panel').forEach(ensureActionRow);
    moveReportHeaderActions();
    addSearchIcons();
    normalizeDateFields();
    normalizePersianLabels();

    const sidebar = document.querySelector('[data-nv3-sidebar], .nv3-sidebar');
    if (sidebar) {
      const observer = new MutationObserver(() => requestAnimationFrame(syncSidebarActive));
      observer.observe(sidebar, { subtree: true, attributes: true, attributeFilter: ['class', 'aria-current'] });
    }

    const main = document.getElementById('main-content');
    if (main) {
      const observer = new MutationObserver(() => {
        requestAnimationFrame(() => {
          main.querySelectorAll('.nv3-action-panel').forEach(ensureActionRow);
          addSearchIcons(main);
          normalizeDateFields(main);
        });
      });
      observer.observe(main, { subtree: true, childList: true });
    }

    [50, 250, 700].forEach(delay => setTimeout(() => {
      syncSidebarActive();
      normalizeDateFields();
    }, delay));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
