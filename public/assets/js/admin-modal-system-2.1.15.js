/* Sadra 2.1.15 — unified admin modal behavior without global attribute-observer loops */
(function () {
  'use strict';
  if (window.__NOORVISTA_ADMIN_MODAL_2115__) return;
  window.__NOORVISTA_ADMIN_MODAL_2115__ = true;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const MODAL_SELECTOR = '.modal-overlay,.admin-modal-overlay';
  let lastTrigger = null;
  let syncFrame = 0;
  const modalStateObservers = new WeakMap();

  function isAdmin() {
    return document.body?.classList.contains('nv3-role-admin') || location.pathname.includes('/dashboard/admin/');
  }

  function topLevelModals(root = document) {
    return $$(MODAL_SELECTOR, root).filter(modal => !modal.parentElement?.closest(MODAL_SELECTOR));
  }

  function visibleModals() {
    return topLevelModals().filter(modal => {
      if (!modal.classList.contains('show')) return false;
      if (modal.hidden || modal.style.display === 'none') return false;
      return true;
    });
  }

  function syncBodyLock() {
    const locked = visibleModals().length > 0;
    document.body.classList.toggle('nv-modal-open', locked);
    if (!locked) document.body.classList.remove('modal-open', 'nv3-modal-open');
  }

  function scheduleBodyLockSync() {
    if (syncFrame) return;
    syncFrame = requestAnimationFrame(() => {
      syncFrame = 0;
      syncBodyLock();
    });
  }

  function observeModalState(modal) {
    if (!modal || modalStateObservers.has(modal)) return;
    const observer = new MutationObserver(scheduleBodyLockSync);
    observer.observe(modal, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    modalStateObservers.set(modal, observer);
  }

  function modalById(value) {
    if (!value) return null;
    if (value instanceof Element) return value.matches(MODAL_SELECTOR) ? value : value.closest(MODAL_SELECTOR);
    return document.getElementById(String(value).replace(/^#/, ''));
  }

  function firstFocusable(modal) {
    return $('[autofocus],input:not([type="hidden"]):not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled]),a[href]', modal);
  }

  function focusables(modal) {
    return $$('input:not([type="hidden"]):not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])', modal)
      .filter(node => node.offsetParent !== null || node === document.activeElement);
  }

  function setModalState(modal, open, trigger = null) {
    if (!modal) return;
    if (open) {
      lastTrigger = trigger || document.activeElement;
      modal.classList.add('show');
      modal.style.removeProperty('display');
      modal.removeAttribute('hidden');
      modal.setAttribute('aria-hidden', 'false');
      const body = $('.modal-body', modal);
      if (body) body.scrollTop = 0;
      requestAnimationFrame(() => (firstFocusable(modal) || $('.modal-container,.admin-modal-container,.modal-content', modal))?.focus({ preventScroll: true }));
    } else {
      modal.classList.remove('show');
      modal.style.removeProperty('display');
      modal.setAttribute('aria-hidden', 'true');
      const body = $('.modal-body', modal);
      if (body) body.scrollTop = 0;
      if (lastTrigger && document.contains(lastTrigger)) requestAnimationFrame(() => lastTrigger.focus?.({ preventScroll: true }));
    }
    syncBodyLock();
  }

  function openModal(id, trigger) { setModalState(modalById(id), true, trigger); }
  function closeModal(id) { setModalState(modalById(id), false); }

  function labelFor(field, modal) {
    if (field.id) {
      const explicit = modal.querySelector(`label[for="${CSS.escape(field.id)}"]`);
      if (explicit) return explicit.textContent.trim();
    }
    return field.closest('.form-group,.appt-field,.field-group')?.querySelector('label')?.textContent.trim() || field.getAttribute('aria-label') || '';
  }

  function placeholderFor(field, label) {
    const text = String(label || '').replace(/[()*:：]/g, ' ').replace(/\s+/g, ' ').trim();
    if (field.tagName === 'TEXTAREA') {
      if (/شرح حال|سابقه پزشکی/.test(text)) return 'سوابق و توضیحات پزشکی مرتبط را وارد کنید';
      if (/آدرس/.test(text)) return 'نشانی کامل را وارد کنید';
      if (/توضیح|یادداشت|شرح/.test(text)) return 'توضیحات تکمیلی را وارد کنید';
      if (/پاسخ/.test(text)) return 'پاسخ کامل و قابل‌فهم را وارد کنید';
      return 'متن موردنظر را وارد کنید';
    }
    if (/نام کامل|نام و نام خانوادگی/.test(text)) return 'مثال: علی رضایی';
    if (/نام کاربری/.test(text)) return 'شماره تلفن یا نام کاربری';
    if (/شماره تلفن|تلفن همراه|تلفن اضطراری/.test(text)) return 'مثال: ۰۹۱۲۳۴۵۶۷۸۹';
    if (/رایانامه|ایمیل/.test(text)) return 'مثال: name@example.com';
    if (/کد ملی/.test(text)) return '۱۰ رقم بدون خط تیره';
    if (/تخصص/.test(text)) return 'مثال: متخصص شبکیه';
    if (/نظام پزشکی/.test(text)) return 'مثال: ۱۲۳۴۵';
    if (/سابقه/.test(text)) return 'مثال: ۱۰';
    if (/هزینه|مبلغ/.test(text)) return 'مثال: ۵۰۰٬۰۰۰';
    if (/شماره رسید/.test(text)) return 'شماره پیگیری یا رسید';
    if (/بیمه پایه/.test(text)) return 'نام شرکت بیمه';
    if (/شماره بیمه/.test(text)) return 'شماره یا شناسه بیمه';
    if (/رمز عبور جدید/.test(text)) return 'در صورت نیاز، رمز جدید را وارد کنید';
    if (/رمز عبور/.test(text)) return 'حداقل ۸ نویسه شامل حرف و عدد';
    if (/تاریخ/.test(text)) return 'مثال: ۱۴۰۵/۰۳/۲۶';
    if (/عنوان/.test(text)) return 'عنوان کوتاه و روشن';
    return text ? `${text} را وارد کنید` : '';
  }

  function normalizeField(field, modal) {
    const label = labelFor(field, modal);
    if (/ایمیل/.test(label)) {
      const labelNode = field.id ? modal.querySelector(`label[for="${CSS.escape(field.id)}"]`) : field.closest('.form-group,.appt-field,.field-group')?.querySelector('label');
      if (labelNode) labelNode.textContent = labelNode.textContent.replace('ایمیل', 'رایانامه');
    }
    if (!field.getAttribute('placeholder') && !['SELECT','OPTION'].includes(field.tagName) && field.type !== 'hidden' && !['checkbox','radio'].includes(field.type)) {
      const placeholder = placeholderFor(field, label);
      if (placeholder) field.setAttribute('placeholder', placeholder);
    }
    if (field.type === 'tel') field.setAttribute('inputmode', 'tel');
    if (/کد ملی|شماره تلفن|تلفن همراه|شماره بیمه/.test(label)) field.setAttribute('inputmode', 'numeric');
    if (/تاریخ/.test(label) || /date/i.test(field.id || '')) {
      if (field.type !== 'hidden') {
        field.type = 'text';
        field.autocomplete = 'off';
        field.inputMode = 'numeric';
        field.classList.add(/ساعت|شروع نمایش|پایان نمایش/.test(label) ? 'nv-jalali-datetime' : 'nv-jalali-date');
        if (/تولد/.test(label)) field.dataset.noDefaultDate = '1';
      }
    }
  }

  function classifyButton(button) {
    const text = String(button.textContent || '').replace(/\s+/g, ' ').trim();
    button.type = button.type || 'button';
    button.classList.remove('nv-modal-primary','nv-modal-secondary','nv-modal-danger');
    if (/حذف|لغو نوبت/.test(text)) button.classList.add('nv-modal-danger');
    else if (/ثبت|ذخیره|افزودن|تأیید|ویرایش/.test(text)) button.classList.add('nv-modal-primary');
    else button.classList.add('nv-modal-secondary');
  }

  function normalizeGrid(modal) {
    const forms = $$('form', modal);
    forms.forEach(form => {
      const groups = $$(':scope > .form-group,:scope > .form-row,:scope > .field-group,:scope > .appt-field', form);
      if (groups.length >= 2 && !form.classList.contains('nv-user-modal-grid')) form.classList.add('nv-modal-form-grid');
    });
  }

  function normalizeModal(modal) {
    if (!modal) return;
    observeModalState(modal);
    if (modal.dataset.nvModalReady === '1') return;
    modal.dataset.nvModalReady = '1';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-hidden', modal.classList.contains('show') ? 'false' : 'true');

    const container = $('.modal-container,.admin-modal-container,.modal-content', modal);
    if (container) container.tabIndex = -1;
    const title = $('.modal-header h3,.modal-header h2,.modal-title', modal);
    if (title) {
      if (!title.id) title.id = `${modal.id || 'nvModal'}Title`;
      modal.setAttribute('aria-labelledby', title.id);
    }

    const fields = $$('input:not([type="hidden"]),select,textarea', modal);
    if (fields.length >= 10 || modal.id === 'appointmentFormModal') modal.classList.add('nv-modal-wide');
    if (fields.length === 0 && $$('.modal-body p,.modal-body .detail-grid', modal).length <= 2) modal.classList.add('nv-modal-compact');
    fields.forEach(field => normalizeField(field, modal));
    normalizeGrid(modal);

    $$('.modal-close', modal).forEach(button => {
      button.type = 'button';
      button.setAttribute('aria-label', button.getAttribute('aria-label') || 'بستن پنجره');
      if (!button.dataset.closeModal && modal.id) button.dataset.closeModal = modal.id;
    });
    $$('.modal-footer button,.modal-footer a.btn', modal).forEach(classifyButton);

    const body = $('.modal-body', modal);
    if (body && !$('.nv-modal-validation-summary', body)) {
      const summary = document.createElement('div');
      summary.className = 'nv-modal-validation-summary';
      summary.setAttribute('role', 'alert');
      summary.setAttribute('aria-live', 'polite');
      body.prepend(summary);
    }
    if (window.NVDate?.initFields) window.NVDate.initFields(modal);
  }

  function validateModalForm(event) {
    const button = event.target.closest('.modal-footer button,.modal-footer a.btn');
    if (!button || button.matches('.modal-close,[data-close-modal]')) return;
    const text = String(button.textContent || '');
    if (!/ثبت|ذخیره|افزودن|تأیید/.test(text)) return;
    const modal = button.closest(MODAL_SELECTOR);
    const form = button.closest('form') || $('form', modal);
    if (!modal || !form || form.noValidate) return;
    const invalid = $$('input,select,textarea', form).find(field => typeof field.checkValidity === 'function' && !field.checkValidity());
    const summary = $('.nv-modal-validation-summary', modal);
    if (invalid) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (summary) {
        summary.textContent = 'لطفاً فیلدهای الزامی یا دارای مقدار نامعتبر را اصلاح کنید.';
        summary.classList.add('is-visible');
      }
      invalid.reportValidity?.();
      invalid.focus({ preventScroll: true });
      invalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (summary) {
      summary.textContent = '';
      summary.classList.remove('is-visible');
    }
  }

  function trapFocus(event) {
    if (event.key !== 'Tab') return;
    const open = visibleModals().at(-1);
    if (!open) return;
    const nodes = focusables(open);
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function installCompatibility() {
    let compatibilityDepth = 0;
    const wrap = (name, action) => {
      const original = window[name];
      if (original && original.__nvModalCompat2115) return;
      const wrapped = function (id, ...args) {
        let result;
        if (compatibilityDepth === 0 && typeof original === 'function') {
          compatibilityDepth += 1;
          try { result = original.call(this, id, ...args); } catch (error) { console.warn(`${name} compatibility error:`, error); }
          finally { compatibilityDepth -= 1; }
        }
        action(id, document.activeElement);
        return result;
      };
      wrapped.__nvModalCompat2115 = true;
      window[name] = wrapped;
    };
    wrap('showModal', openModal);
    wrap('openModal', openModal);
    wrap('hideModal', closeModal);
    wrap('closeModal', closeModal);
  }

  function boot() {
    if (!isAdmin()) return;
    topLevelModals().forEach(normalizeModal);
    installCompatibility();
    syncBodyLock();

    document.addEventListener('click', event => {
      const opener = event.target.closest('[data-open-modal]');
      if (opener) { event.preventDefault(); openModal(opener.dataset.openModal, opener); return; }
      const closer = event.target.closest('[data-close-modal],.modal-close');
      if (closer) {
        const modal = closer.closest(MODAL_SELECTOR) || modalById(closer.dataset.closeModal);
        if (modal) { event.preventDefault(); closeModal(modal); }
        return;
      }
      const overlay = event.target.matches?.(MODAL_SELECTOR) ? event.target : null;
      if (overlay && overlay.dataset.static !== 'true') closeModal(overlay);
    }, true);

    document.addEventListener('click', validateModalForm, true);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        const open = visibleModals().at(-1);
        if (open && open.dataset.static !== 'true') closeModal(open);
      }
      trapFocus(event);
    });

    const observer = new MutationObserver(mutations => {
      let foundModal = false;
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (!(node instanceof Element)) return;
          if (node.matches(MODAL_SELECTOR)) { normalizeModal(node); foundModal = true; }
          const nested = topLevelModals(node);
          if (nested.length) { nested.forEach(normalizeModal); foundModal = true; }
        });
      });
      if (foundModal) scheduleBodyLockSync();
    });
    // Observe only DOM insertions globally. Watching every class/style mutation on the
    // entire dashboard created a self-amplifying callback loop on pages with dynamic UI.
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
