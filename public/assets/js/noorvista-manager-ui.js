/* NOORVISTA manager UI helpers v18
   Visual/action normalization only. It does not attach CRUD handlers and does not re-render data tables. */
(function () {
  'use strict';

  const ACTIONS = [
    { re: /مشاهده|جزئیات|نمایش/, cls: 'action-view', icon: 'icon-eye' },
    { re: /ویرایش|اصلاح/, cls: 'action-edit', icon: 'icon-pencil' },
    { re: /حذف|لغو|ابطال/, cls: 'action-delete', icon: 'icon-trash' },
    { re: /تأیید|تایید|فعال|ذخیره/, cls: 'action-confirm', icon: 'icon-check' },
    { re: /غیرفعال/, cls: 'action-toggle', icon: 'icon-close' }
  ];

  const ready = (fn) => document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', fn, { once: true })
    : fn();

  function textOf(el) {
    return String(el?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function ensureIcon(button, iconClass) {
    if (!button || !iconClass || button.querySelector('i')) return;
    const icon = document.createElement('i');
    icon.className = iconClass;
    button.prepend(icon);
  }

  function normalizeButton(button) {
    if (!button || button.dataset.nvActionNormalized === '1') return;
    if (button.tagName === 'BUTTON' && !button.getAttribute('type')) button.type = 'button';

    const label = textOf(button);
    const match = ACTIONS.find(item => item.re.test(label));
    const isTableAction = button.closest('td, .actions, .action-buttons, .table-actions') && match;

    if (isTableAction) {
      button.classList.add('btn-action', match.cls);
      ensureIcon(button, match.icon);
      const holder = button.closest('td, .actions, .action-buttons, .table-actions');
      if (holder && holder.tagName === 'TD') holder.classList.add('table-actions');
      else if (holder) holder.classList.add('table-actions');
    }

    if (button.classList.contains('btn-primary')) ensureIcon(button, button.querySelector('i') ? '' : 'icon-check');
    button.dataset.nvActionNormalized = '1';
  }

  function normalizeButtons(root = document) {
    root.querySelectorAll('button, a.btn, .btn, .btn-sm, .action-btn, .action-icon').forEach(normalizeButton);
  }

  function enhanceModalCloseButtons(root = document) {
    root.querySelectorAll('.modal-close').forEach(btn => {
      if (btn.tagName === 'BUTTON' && !btn.getAttribute('type')) btn.type = 'button';
    });
  }

  function setPageKey() {
    const file = (location.pathname.split('/').pop() || 'index.html').split('?')[0] || 'index.html';
    document.body.dataset.nvPage = file.replace(/\.html$/i, '') || 'index';
  }

  function installObserver() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(node => {
          if (!(node instanceof Element)) return;
          if (node.matches('button, a.btn, .btn, .btn-sm, .action-btn, .action-icon')) normalizeButton(node);
          normalizeButtons(node);
          enhanceModalCloseButtons(node);
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  ready(() => {
    setPageKey();
    normalizeButtons();
    enhanceModalCloseButtons();
    installObserver();
  });

  window.NoorvistaManagerUI = {
    normalizeButtons,
    setButtonLoading(button, loading, text) {
      if (!button) return;
      if (loading) {
        button.dataset.nvOriginalHtml = button.innerHTML;
        button.disabled = true;
        button.classList.add('is-loading');
        button.innerHTML = `<span class="nv-spinner"></span>${text || 'در حال انجام...'}`;
      } else {
        button.disabled = false;
        button.classList.remove('is-loading');
        if (button.dataset.nvOriginalHtml) button.innerHTML = button.dataset.nvOriginalHtml;
        delete button.dataset.nvOriginalHtml;
      }
    }
  };
})();
