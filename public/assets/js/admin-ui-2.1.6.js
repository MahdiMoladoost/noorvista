/* Sadra 2.1.6 — unified admin design system and browser-side guards */
(function () {
  'use strict';
  if (window.__NOORVISTA_ADMIN_UI_216__) return;
  window.__NOORVISTA_ADMIN_UI_216__ = true;

  const faDigits = '۰۱۲۳۴۵۶۷۸۹';
  const arDigits = '٠١٢٣٤٥٦٧٨٩';

  window.toPersianNumber = window.toPersianNumber || function toPersianNumber(value) {
    return String(value ?? '').replace(/\d/g, digit => faDigits[Number(digit)]);
  };
  window.toEnglishNumber = window.toEnglishNumber || function toEnglishNumber(value) {
    return String(value ?? '')
      .replace(/[۰-۹]/g, digit => String(faDigits.indexOf(digit)))
      .replace(/[٠-٩]/g, digit => String(arDigits.indexOf(digit)));
  };
  window.escapeHtml = window.escapeHtml || function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const pageTitles = {
    doctors: ['فیلتر پزشکان', 'پزشک موردنظر را بر اساس نام، تخصص یا وضعیت پیدا کنید.'],
    staff: ['فیلتر کارکنان', 'فهرست کارکنان را بر اساس نام، نقش و وضعیت محدود کنید.'],
    users: ['فیلتر کاربران', 'کاربران سامانه را بر اساس نام، شماره تماس یا نقش جست‌وجو کنید.'],
    patients: ['جست‌وجوی بیماران', 'بیمار را بر اساس نام، شماره تماس، ایمیل یا کد ملی پیدا کنید.'],
    faqs: ['جست‌وجوی پرسش‌ها', 'در متن پرسش، پاسخ، دسته‌بندی یا کلیدواژه جست‌وجو کنید.'],
    notifications: ['فیلتر اعلان‌ها', 'اعلان‌ها را بر اساس عنوان، متن و وضعیت بررسی کنید.'],
    reports: ['تنظیم گزارش', 'بازه زمانی و نوع گزارش را انتخاب کنید.'],
    logs: ['فیلتر رویدادها', 'رویدادهای سامانه را بر اساس نوع و بازه زمانی بررسی کنید.'],
    payments: ['فیلتر پرداخت‌ها', 'پرداخت‌ها را بر اساس تاریخ و وضعیت نمایش دهید.'],
    appointments: ['فیلتر نوبت‌ها', 'نوبت‌ها را بر اساس بیمار، پزشک، وضعیت یا تاریخ پیدا کنید.']
  };

  function currentFile() {
    const name = String(location.pathname || '').split('/').filter(Boolean).pop() || 'index.html';
    return /\.html?$/i.test(name) ? name.toLowerCase() : 'index.html';
  }

  const parentPage = {
    'appointment-slots.html': 'schedule.html',
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

  function syncSidebarActive() {
    const sidebar = document.querySelector('[data-nv3-sidebar], .nv3-sidebar');
    if (!sidebar) return;
    const links = Array.from(sidebar.querySelectorAll('.nv3-nav-link'));
    const wanted = parentPage[currentFile()] || currentFile();
    links.forEach(link => {
      link.classList.remove('is-active', 'active');
      link.removeAttribute('aria-current');
    });
    const selected = links.find(link => hrefFile(link) === wanted);
    if (selected) {
      selected.classList.add('is-active');
      selected.setAttribute('aria-current', 'page');
    }
  }

  function normalizedText(node) {
    return String(node?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function buttonKind(button) {
    const text = normalizedText(button);
    if (/افزودن|ثبت .*جدید|پزشک جدید|بیمار جدید|اعلان جدید|نوبت جدید/.test(text)) return 'create';
    if (/جست.?وجو|نمایش گزارش|به.?روزرسانی|دریافت فایل/.test(text)) return 'primary';
    if (/پاک.?سازی|بازنشانی/.test(text)) return 'neutral';
    if (/حذف رویدادهای قدیمی|حذف همگانی/.test(text)) return 'danger';
    return 'secondary';
  }

  function markButton(button, kind = buttonKind(button)) {
    if (!button) return;
    button.classList.add('nv-admin-button');
    button.dataset.nvActionKind = kind;
  }

  function findExternalCreateButton(panel) {
    const card = panel.closest('.card');
    if (!card) return null;
    return Array.from(card.querySelectorAll(':scope > .card-header button, :scope > .card-header a.btn'))
      .find(button => buttonKind(button) === 'create') || null;
  }

  function buildToolbar(panel) {
    if (!panel || panel.dataset.nvToolbarReady === '1') return;
    if (panel.closest('.nv-appointments-tools-grid')) return; // صفحه نوبت‌ها الگوی تخصصی خودش را دارد.

    const page = document.body?.dataset.nvPage || '';
    const [title, description] = pageTitles[page] || ['جست‌وجو و فیلتر', 'نتایج صفحه را با گزینه‌های زیر محدود کنید.'];

    panel.classList.add('nv-admin-toolbar');
    const children = Array.from(panel.children);
    const header = document.createElement('div');
    header.className = 'nv-admin-toolbar-header';
    header.innerHTML = `<div class="nv-admin-toolbar-copy"><h2>${window.escapeHtml(title)}</h2><p>${window.escapeHtml(description)}</p></div><div class="nv-admin-toolbar-header-actions"></div>`;
    const fields = document.createElement('div');
    fields.className = 'nv-admin-toolbar-fields';
    const footer = document.createElement('div');
    footer.className = 'nv-admin-toolbar-footer';

    const externalCreate = findExternalCreateButton(panel);
    if (externalCreate) {
      markButton(externalCreate, 'create');
      header.querySelector('.nv-admin-toolbar-header-actions').appendChild(externalCreate);
    }

    children.forEach(child => {
      if (child === header || child === fields || child === footer) return;
      const directButtons = child.matches('button,a.btn')
        ? [child]
        : Array.from(child.querySelectorAll(':scope > button, :scope > a.btn'));
      const hasControl = !!child.querySelector?.('input,select,textarea');

      if (directButtons.length === 1 && !hasControl) {
        const button = directButtons[0];
        const kind = buttonKind(button);
        markButton(button, kind);
        if (kind === 'create') header.querySelector('.nv-admin-toolbar-header-actions').appendChild(button);
        else footer.appendChild(button);
        if (button !== child) child.remove();
        return;
      }
      fields.appendChild(child);
    });

    // گزارش‌ها در نسخه قدیمی دکمه‌ها را داخل سربرگ کارت داشتند.
    if (page === 'reports') {
      const card = panel.closest('.card');
      const headerButtons = Array.from(card?.querySelectorAll(':scope > .card-header button') || []);
      headerButtons.forEach(button => {
        markButton(button, buttonKind(button));
        footer.appendChild(button);
      });
    }

    panel.replaceChildren(header, fields);
    if (footer.children.length) panel.appendChild(footer);
    panel.dataset.nvToolbarReady = '1';
  }

  function addSearchIcons(root = document) {
    root.querySelectorAll('.nv-admin-toolbar input[type="search"], .nv-admin-toolbar input[id*="Search"], .nv-admin-toolbar input[id*="search"]').forEach(input => {
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

  function normalizeStats() {
    document.querySelectorAll('.stats-grid .stat-card').forEach((card, index) => {
      card.classList.add('nv-admin-stat-card');
      card.dataset.nvStatIndex = String(index + 1);
      const value = card.querySelector('h3,.value,[id]');
      if (value) value.classList.add('nv-admin-stat-value');
      const label = card.querySelector('.stat-info p,.label');
      if (label) label.classList.add('nv-admin-stat-label');
      const icon = card.querySelector('.stat-icon') || card.firstElementChild;
      if (icon) icon.classList.add('nv-admin-stat-icon');
    });
  }

  function normalizeFormActions() {
    document.querySelectorAll('.modal-footer,.form-actions,.card-actions,.settings-actions').forEach(row => {
      row.classList.add('nv-admin-form-actions');
      row.querySelectorAll('button,a.btn').forEach(markButton);
    });
  }

  function normalizePersianLabels() {
    const replacements = new Map([
      ['بروزرسانی', 'به‌روزرسانی'],
      ['جستجو', 'جست‌وجو'],
      ['لیست ', 'فهرست '],
      ['لاگ‌های سیستم', 'رویدادهای سیستم'],
      ['دیتابیس', 'پایگاه داده'],
      ['فرانت‌اند', 'بخش کاربری'],
      ['بک‌اند', 'سرویس سمت سرور']
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
    document.querySelectorAll('.nv3-action-panel').forEach(buildToolbar);
    addSearchIcons();
    normalizeStats();
    normalizeFormActions();
    normalizePersianLabels();

    const sidebar = document.querySelector('[data-nv3-sidebar], .nv3-sidebar');
    if (sidebar) {
      const observer = new MutationObserver(() => requestAnimationFrame(syncSidebarActive));
      observer.observe(sidebar, { subtree: true, attributes: true, attributeFilter: ['class', 'aria-current'] });
    }

    [100, 400, 900].forEach(delay => setTimeout(() => {
      syncSidebarActive();
      normalizeStats();
    }, delay));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
