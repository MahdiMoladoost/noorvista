(function () {
  'use strict';

  const state = { templates: [] };
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function toPersianNumber(value) {
    return String(value ?? '').replace(/\d/g, digit => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);
  }

  function renderTemplate(template, variables) {
    return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
      const item = variables.find(variable => variable.key === key);
      return item ? item.sample : '';
    }).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function smsParts(text) {
    const length = String(text || '').length;
    if (length === 0) return 0;
    return Math.max(1, Math.ceil(length / 70));
  }

  function setStatus(message, type = 'info') {
    const box = $('#smsTemplateStatus');
    if (!box) return;
    box.textContent = message || '';
    box.dataset.type = type;
  }

  function insertAtCursor(textarea, value) {
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? textarea.value.length;
    textarea.value = `${textarea.value.slice(0, start)}${value}${textarea.value.slice(end)}`;
    const next = start + value.length;
    textarea.focus();
    textarea.setSelectionRange(next, next);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function updateCard(card) {
    const textarea = $('textarea', card);
    const definition = state.templates.find(item => item.key === card.dataset.templateKey);
    if (!textarea || !definition) return;
    const text = textarea.value || '';
    const preview = $('.nv-sms-template-preview', card);
    const counter = $('[data-counter]', card);
    const parts = $('[data-parts]', card);
    const enabledInput = $('[data-template-enabled]', card);
    const enabled = enabledInput ? enabledInput.checked : definition.enabled !== false;
    card.classList.toggle('is-sms-disabled', !enabled);
    const enabledLabel = $('[data-enabled-label]', card);
    if (enabledLabel) enabledLabel.textContent = enabled ? 'ارسال فعال' : 'ارسال غیرفعال';
    if (preview) {
      const rendered = renderTemplate(text, definition.variables || []) || 'پیش‌نمایش بعد از وارد کردن متن نمایش داده می‌شود.';
      preview.textContent = enabled ? rendered : `این پیامک غیرفعال است و ارسال نمی‌شود.\nپیش‌نمایش متن: ${rendered}`;
    }
    if (counter) counter.textContent = toPersianNumber(text.length);
    if (parts) parts.textContent = toPersianNumber(smsParts(text));
  }

  function renderCards(templates) {
    const grid = $('#smsTemplateGrid');
    if (!grid) return;
    grid.innerHTML = templates.map(template => {
      const chips = (template.variables || []).map(variable => (
        `<button class="nv-sms-var-chip" type="button" data-variable="{{${escapeHtml(variable.key)}}}" title="${escapeHtml(variable.label || variable.key)}">{{${escapeHtml(variable.key)}}}</button>`
      )).join('');
      const enabled = template.enabled !== false;
      return `<article class="nv-sms-template-card ${enabled ? '' : 'is-sms-disabled'}" data-template-key="${escapeHtml(template.key)}">
        <header class="nv-sms-template-card-header">
          <span class="nv-sms-template-icon"><i class="${escapeHtml(template.icon || 'icon-comments')}" aria-hidden="true"></i></span>
          <span class="nv-sms-template-title"><strong>${escapeHtml(template.title)}</strong><span>${escapeHtml(template.category || 'پیامک')}</span></span>
          <label class="nv-sms-template-switch" title="فعال یا غیرفعال بودن ارسال این نوع پیامک">
            <input type="checkbox" data-template-enabled ${enabled ? 'checked' : ''}>
            <span class="nv-sms-switch-ui" aria-hidden="true"></span>
            <b data-enabled-label>${enabled ? 'ارسال فعال' : 'ارسال غیرفعال'}</b>
          </label>
        </header>
        <div class="nv-sms-template-card-body">
          <p class="nv-sms-template-description">${escapeHtml(template.description || '')}</p>
          <label class="nv3-sr-only" for="${escapeHtml(template.key)}">متن ${escapeHtml(template.title)}</label>
          <textarea id="${escapeHtml(template.key)}" data-template-input>${escapeHtml(template.value || template.defaultText || '')}</textarea>
          <div class="nv-sms-template-meta"><span>کاراکتر: <b data-counter>۰</b></span><span>تخمین پیامک: <b data-parts>۰</b> بخش</span></div>
          <div class="nv-sms-template-variables" aria-label="متغیرهای قابل استفاده">${chips}</div>
          <div class="nv-sms-template-preview" aria-live="polite"></div>
        </div>
        <footer class="nv-sms-template-card-footer">
          <button class="btn btn-outline-primary" type="button" data-reset-template>بازگردانی پیش‌فرض</button>
          <button class="btn btn-outline-primary" type="button" data-copy-preview>کپی پیش‌نمایش</button>
        </footer>
      </article>`;
    }).join('');

    $$('.nv-sms-template-card', grid).forEach(card => updateCard(card));
  }

  async function loadTemplates() {
    const grid = $('#smsTemplateGrid');
    if (grid) grid.innerHTML = '<div class="nv-sms-template-skeleton" aria-label="در حال بارگذاری"></div>';
    setStatus('در حال دریافت قالب‌های پیامک...');
    const response = await apiRequest('/admin/settings/sms/templates');
    state.templates = response.templates || [];
    renderCards(state.templates);
    setStatus('قالب‌ها و وضعیت ارسال آماده هستند. بعد از تغییر متن یا روشن/خاموش‌کردن پیامک‌ها، دکمه «ذخیره همه متن‌ها» را بزنید.', 'success');
  }

  function collectPayload() {
    const templates = {};
    const enabled = {};
    $$('.nv-sms-template-card').forEach(card => {
      const key = card.dataset.templateKey;
      const value = $('[data-template-input]', card)?.value ?? '';
      const isEnabled = $('[data-template-enabled]', card)?.checked !== false;
      if (key) {
        templates[key] = value;
        enabled[key] = isEnabled;
      }
    });
    return { templates, enabled };
  }

  async function saveTemplates() {
    const button = $('#saveSmsTemplatesBtn');
    const original = button?.textContent;
    if (button) { button.disabled = true; button.textContent = 'در حال ذخیره...'; }
    try {
      const response = await apiRequest('/admin/settings/sms/templates', 'PUT', collectPayload());
      showToast(response.message || 'متن پیامک‌ها ذخیره شد', 'success');
      setStatus('آخرین تغییرات ذخیره شد؛ متن‌ها و وضعیت فعال/غیرفعال پیامک‌ها از این به بعد اعمال می‌شوند.', 'success');
      await loadTemplates();
    } finally {
      if (button) { button.disabled = false; button.textContent = original || 'ذخیره همه متن‌ها'; }
    }
  }

  function bindEvents() {
    $('#saveSmsTemplatesBtn')?.addEventListener('click', () => saveTemplates().catch(error => {
      showToast(error.message || 'خطا در ذخیره متن پیامک‌ها', 'error');
      setStatus(error.message || 'ذخیره انجام نشد', 'error');
    }));
    $('#reloadSmsTemplatesBtn')?.addEventListener('click', () => loadTemplates().catch(error => {
      showToast(error.message || 'خطا در دریافت قالب‌ها', 'error');
      setStatus(error.message || 'دریافت قالب‌ها انجام نشد', 'error');
    }));
    $('#resetAllSmsTemplatesBtn')?.addEventListener('click', () => {
      $$('.nv-sms-template-card').forEach(card => {
        const definition = state.templates.find(item => item.key === card.dataset.templateKey);
        const textarea = $('[data-template-input]', card);
        if (definition && textarea) {
          textarea.value = definition.defaultText || '';
          const enabledInput = $('[data-template-enabled]', card);
          if (enabledInput) enabledInput.checked = true;
          updateCard(card);
        }
      });
      showToast('متن‌های پیش‌فرض در فرم قرار گرفت؛ برای اعمال نهایی ذخیره کنید.', 'info');
      setStatus('متن‌های پیش‌فرض فقط در فرم قرار گرفتند؛ برای اعمال در سامانه ذخیره کنید.', 'warning');
    });

    document.addEventListener('input', event => {
      const textarea = event.target.closest?.('[data-template-input]');
      if (!textarea) return;
      const card = textarea.closest('.nv-sms-template-card');
      if (card) updateCard(card);
    });
    document.addEventListener('change', event => {
      const toggle = event.target.closest?.('[data-template-enabled]');
      if (!toggle) return;
      const card = toggle.closest('.nv-sms-template-card');
      if (card) updateCard(card);
      setStatus('وضعیت ارسال تغییر کرد؛ برای اعمال نهایی ذخیره کنید.', 'warning');
    });
    document.addEventListener('click', event => {
      const chip = event.target.closest?.('[data-variable]');
      if (chip) {
        const card = chip.closest('.nv-sms-template-card');
        const textarea = $('[data-template-input]', card);
        if (textarea) insertAtCursor(textarea, chip.dataset.variable);
        return;
      }
      const reset = event.target.closest?.('[data-reset-template]');
      if (reset) {
        const card = reset.closest('.nv-sms-template-card');
        const definition = state.templates.find(item => item.key === card?.dataset.templateKey);
        const textarea = $('[data-template-input]', card);
        if (definition && textarea) {
          textarea.value = definition.defaultText || '';
          updateCard(card);
          showToast('متن پیش‌فرض در این کارت قرار گرفت؛ برای اعمال نهایی ذخیره کنید.', 'info');
        }
        return;
      }
      const copy = event.target.closest?.('[data-copy-preview]');
      if (copy) {
        const preview = $('.nv-sms-template-preview', copy.closest('.nv-sms-template-card'))?.textContent || '';
        navigator.clipboard?.writeText(preview).then(() => showToast('پیش‌نمایش پیام کپی شد', 'success')).catch(() => showToast('امکان کپی خودکار وجود ندارد', 'warning'));
      }
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    if (typeof initPage === 'function') await initPage();
    bindEvents();
    loadTemplates().catch(error => {
      showToast(error.message || 'خطا در دریافت قالب‌های پیامک', 'error');
      setStatus(error.message || 'دریافت قالب‌ها انجام نشد', 'error');
    });
  });
})();
