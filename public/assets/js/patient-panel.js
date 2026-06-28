// Sadra Patient Portal — unified patient shell and notifications v2.1.55.
(function () {
  'use strict';

  if (window.__NOORVISTA_PATIENT_PORTAL__) return;
  window.__NOORVISTA_PATIENT_PORTAL__ = true;
  document.documentElement.classList.add('nv-patient-document');

  const page = document.body.dataset.patientPage || 'dashboard';
  const root = document.getElementById('patientPageContent');
  const faDigits = '۰۱۲۳۴۵۶۷۸۹';
  const state = {
    appointments: [],
    doctors: [],
    records: [],
    prescriptions: [],
    payments: [],
    notifications: [],
    bookingSlots: [],
    bookingServices: [],
    availableDates: [],
    availableDateSet: new Set(),
    bookingMonthKey: '',
    currentPage: 1,
    perPage: 20,
    total: 0,
    activeModal: null,
    lastFocused: null,
    pendingAppointmentViewId: 0
  };

  const qs = (selector, scope = document) => scope.querySelector(selector);
  const qsa = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));
  const text = value => String(value ?? '').trim();
  const toFa = value => String(value ?? '').replace(/\d/g, d => faDigits[Number(d)]);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));
  const multiline = value => escapeHtml(text(value) || '—').replace(/\r?\n/g, '<br>');
  function currentClinicName() {
    return window.SadraBranding?.get?.().clinicName || document.documentElement.dataset.clinicName || 'کلینیک چشم پزشکی دکتر محمدصادق حق پرست';
  }

  function friendlyErrorMessage(error, fallback = 'انجام این درخواست موقتاً ممکن نشد. لطفاً دوباره تلاش کنید.') {
    const raw = text(error?.message || error);
    if (!raw) return fallback;
    const normalized = raw.toLowerCase();

    if (/401|unauthori[sz]ed|نشست|session|token|ورود مجدد/.test(normalized)) {
      return 'نشست شما پایان یافته است. لطفاً دوباره وارد حساب خود شوید.';
    }
    if (/403|forbidden|access denied|اجازه|دسترسی/.test(normalized)) {
      return 'اجازه انجام این کار برای حساب شما وجود ندارد.';
    }
    if (/404|not found|پیدا نشد/.test(normalized)) {
      return 'اطلاعات موردنظر پیدا نشد. صفحه را تازه‌سازی کنید و دوباره تلاش کنید.';
    }
    if (/fetch|network|econn|socket|timeout|timed out|ارتباط|شبکه/.test(normalized)) {
      return 'ارتباط با سامانه برقرار نشد. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.';
    }
    if (/slot|capacity|ظرفیت|نوبت.*(پر|دریافت)|already booked|conflict|409/.test(normalized)) {
      return 'این زمان دیگر در دسترس نیست. لطفاً زمان دیگری را انتخاب کنید.';
    }
    if (/consent|رضایت/.test(normalized) && /migration|table|column|database|schema|ساختار|تکمیل/.test(normalized)) {
      return 'بارگذاری رضایت‌ها موقتاً ممکن نشد. لطفاً چند لحظه دیگر دوباره تلاش کنید.';
    }
    if (/sql|mysql|database|table|column|schema|migration|errno|sqlstate|er_|warn_data|truncate|constraint|syntax|stack| at \w/.test(normalized)) {
      return fallback;
    }
    if (/^[\x00-\x7f\s]+$/.test(raw) || raw.length > 180) return fallback;
    return raw;
  }

  function showPatientError(error, fallback) {
    showToast(friendlyErrorMessage(error, fallback), 'error');
  }


  const professionalSelectState = {
    active: null,
    sequence: 0,
    scanFrame: 0
  };

  // Patient pages use the same single listbox engine as the other dashboards.
  // The legacy local enhancer is intentionally not installed; this bridge keeps
  // dynamic option/value changes synchronized with NVPrettySelects.
  function refreshUnifiedSelects() {
    const refresh = () => window.NVPrettySelects?.refresh?.();
    requestAnimationFrame(refresh);
    setTimeout(refresh, 60);
  }

  function professionalSelectLabel(option) {
    return text(option?.label || option?.textContent) || 'انتخاب کنید';
  }

  function professionalSelectShouldSkip(select) {
    return !select
      || select.tagName !== 'SELECT'
      || select.multiple
      || Number(select.size || 0) > 1
      || select.matches('[data-nv-native-select], [data-no-pretty-select]')
      || Boolean(select.closest('template'));
  }

  function professionalSelectWrapper(select) {
    return select?.closest('.nv-pselect') || null;
  }

  function professionalSelectOptions(select) {
    return Array.from(select?.options || []).filter(option => !option.hidden);
  }

  function professionalSelectSelected(select) {
    return select?.options?.[select.selectedIndex] || select?.options?.[0] || null;
  }

  function professionalSelectAriaLabel(select) {
    if (select.getAttribute('aria-label')) return select.getAttribute('aria-label');
    const label = select.id ? document.querySelector(`label[for="${CSS.escape(select.id)}"]`) : null;
    const labelText = text(label?.textContent).replace(/\*/g, '').trim();
    return labelText ? `انتخاب ${labelText}` : 'باز کردن فهرست انتخاب';
  }

  function professionalSelectEnabledButtons(portal) {
    return qsa('.nv-pselect-option:not([disabled]):not([hidden])', portal);
  }

  function positionProfessionalSelect() {
    const active = professionalSelectState.active;
    if (!active?.portal?.isConnected || !active.trigger?.isConnected) return;

    const rect = active.trigger.getBoundingClientRect();
    const gap = 8;
    const viewportPadding = 12;
    const availableBelow = window.innerHeight - rect.bottom - viewportPadding;
    const availableAbove = rect.top - viewportPadding;
    const opensUp = availableBelow < 220 && availableAbove > availableBelow;
    const maxHeight = Math.max(170, Math.min(360, opensUp ? availableAbove - gap : availableBelow - gap));
    const width = Math.max(rect.width, Math.min(360, window.innerWidth - viewportPadding * 2));
    let left = rect.left;

    if (left + width > window.innerWidth - viewportPadding) left = window.innerWidth - viewportPadding - width;
    if (left < viewportPadding) left = viewportPadding;

    active.portal.style.width = `${width}px`;
    active.portal.style.left = `${left}px`;
    active.portal.style.maxHeight = `${maxHeight}px`;

    if (opensUp) {
      active.portal.classList.add('nv-pselect-portal-up');
      active.portal.style.top = 'auto';
      active.portal.style.bottom = `${window.innerHeight - rect.top + gap}px`;
    } else {
      active.portal.classList.remove('nv-pselect-portal-up');
      active.portal.style.bottom = 'auto';
      active.portal.style.top = `${rect.bottom + gap}px`;
    }
  }

  function closeProfessionalSelect({ restoreFocus = false } = {}) {
    const active = professionalSelectState.active;
    if (!active) return;

    active.wrapper?.classList.remove('nv-pselect-open');
    active.trigger?.setAttribute('aria-expanded', 'false');
    active.portal?.remove();
    professionalSelectState.active = null;

    if (restoreFocus && active.trigger?.isConnected) active.trigger.focus();
  }

  function focusProfessionalSelectOption(portal, direction = 'selected') {
    const enabled = professionalSelectEnabledButtons(portal);
    if (!enabled.length) return;
    const selected = enabled.find(button => button.getAttribute('aria-selected') === 'true');
    const target = direction === 'last' ? enabled[enabled.length - 1] : (selected || enabled[0]);
    requestAnimationFrame(() => target.focus());
  }

  function moveProfessionalSelectFocus(portal, direction) {
    const enabled = professionalSelectEnabledButtons(portal);
    if (!enabled.length) return;
    const currentIndex = enabled.indexOf(document.activeElement);
    let nextIndex = currentIndex;
    if (direction === 'first') nextIndex = 0;
    else if (direction === 'last') nextIndex = enabled.length - 1;
    else if (direction > 0) nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % enabled.length;
    else nextIndex = currentIndex < 0 ? enabled.length - 1 : (currentIndex - 1 + enabled.length) % enabled.length;
    enabled[nextIndex].focus();
  }

  function chooseProfessionalSelectOption(select, option, trigger) {
    if (!option || option.disabled) return;
    select.value = option.value;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
    syncProfessionalSelect(select);
    closeProfessionalSelect();
    trigger?.focus();
  }

  function renderProfessionalSelectOptions(select, portal, query = '') {
    const list = qs('[data-nv-pselect-options]', portal);
    if (!list) return;

    const normalizedQuery = text(query).toLocaleLowerCase('fa');
    const options = professionalSelectOptions(select).filter(option => {
      return !normalizedQuery || professionalSelectLabel(option).toLocaleLowerCase('fa').includes(normalizedQuery);
    });

    list.innerHTML = '';
    if (!options.length) {
      const empty = document.createElement('div');
      empty.className = 'nv-pselect-empty';
      empty.innerHTML = '<i class="icon-search" aria-hidden="true"></i><span>گزینه‌ای پیدا نشد</span>';
      list.appendChild(empty);
      return;
    }

    options.forEach(option => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'nv-pselect-option';
      button.dataset.value = option.value;
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(String(option.value) === String(select.value)));
      button.disabled = option.disabled;

      const label = document.createElement('span');
      label.className = 'nv-pselect-option-label';
      label.textContent = professionalSelectLabel(option);

      const check = document.createElement('span');
      check.className = 'nv-pselect-option-check';
      check.setAttribute('aria-hidden', 'true');
      check.innerHTML = '<i class="icon-check"></i>';

      button.append(label, check);
      button.addEventListener('click', () => chooseProfessionalSelectOption(
        select,
        option,
        professionalSelectWrapper(select)?.querySelector('.nv-pselect-trigger')
      ));
      button.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          moveProfessionalSelectFocus(portal, 1);
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          moveProfessionalSelectFocus(portal, -1);
        } else if (event.key === 'Home') {
          event.preventDefault();
          moveProfessionalSelectFocus(portal, 'first');
        } else if (event.key === 'End') {
          event.preventDefault();
          moveProfessionalSelectFocus(portal, 'last');
        } else if (event.key === 'Escape') {
          event.preventDefault();
          closeProfessionalSelect({ restoreFocus: true });
        } else if (event.key === 'Tab') {
          closeProfessionalSelect();
        }
      });
      list.appendChild(button);
    });
  }

  function openProfessionalSelect(select, { keyboard = false, direction = 'selected' } = {}) {
    const wrapper = professionalSelectWrapper(select);
    const trigger = wrapper?.querySelector('.nv-pselect-trigger');
    if (!wrapper || !trigger || select.disabled) return;

    if (professionalSelectState.active?.select === select) {
      closeProfessionalSelect({ restoreFocus: keyboard });
      return;
    }
    closeProfessionalSelect();

    const portal = document.createElement('div');
    portal.className = 'nv-pselect-portal';
    portal.id = trigger.getAttribute('aria-controls');
    portal.setAttribute('role', 'listbox');
    portal.setAttribute('aria-label', professionalSelectAriaLabel(select));
    portal.dir = 'rtl';

    const options = professionalSelectOptions(select);
    if (options.length > 7) {
      const searchWrap = document.createElement('label');
      searchWrap.className = 'nv-pselect-search';
      searchWrap.innerHTML = '<i class="icon-search" aria-hidden="true"></i><span class="tw-sr-only">جستجو در گزینه‌ها</span>';
      const search = document.createElement('input');
      search.type = 'search';
      search.autocomplete = 'off';
      search.placeholder = 'جستجو در فهرست…';
      search.setAttribute('aria-label', 'جستجو در گزینه‌ها');
      searchWrap.appendChild(search);
      portal.appendChild(searchWrap);
      search.addEventListener('input', () => renderProfessionalSelectOptions(select, portal, search.value));
      search.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          moveProfessionalSelectFocus(portal, 1);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          closeProfessionalSelect({ restoreFocus: true });
        }
      });
    }

    const list = document.createElement('div');
    list.className = 'nv-pselect-options';
    list.dataset.nvPselectOptions = '';
    portal.appendChild(list);
    renderProfessionalSelectOptions(select, portal);

    document.body.appendChild(portal);
    wrapper.classList.add('nv-pselect-open');
    trigger.setAttribute('aria-expanded', 'true');
    professionalSelectState.active = { select, wrapper, trigger, portal };
    positionProfessionalSelect();

    if (keyboard) {
      const search = qs('.nv-pselect-search input', portal);
      if (search && options.length > 7) requestAnimationFrame(() => search.focus());
      else focusProfessionalSelectOption(portal, direction);
    }
  }

  function syncProfessionalSelect(select) {
    const wrapper = professionalSelectWrapper(select);
    if (!wrapper) {
      window.NVPrettySelects?.sync?.(select);
      return;
    }

    const trigger = qs('.nv-pselect-trigger', wrapper);
    const value = qs('.nv-pselect-value', wrapper);
    const selected = professionalSelectSelected(select);
    if (!trigger || !value) return;

    value.textContent = selected ? professionalSelectLabel(selected) : 'انتخاب کنید';
    value.classList.toggle('nv-pselect-placeholder', !selected || String(selected.value) === '');
    trigger.disabled = select.disabled;
    trigger.setAttribute('aria-disabled', String(select.disabled));
    wrapper.classList.toggle('nv-pselect-disabled', select.disabled);
    wrapper.classList.toggle('nv-pselect-invalid', !select.validity.valid && select.dataset.nvPselectTouched === 'true');

    if (professionalSelectState.active?.select === select) {
      if (select.disabled) closeProfessionalSelect();
      else renderProfessionalSelectOptions(select, professionalSelectState.active.portal);
    }
  }

  function enhanceProfessionalSelect(select) {
    if (professionalSelectShouldSkip(select)) return;
    if (select.dataset.nvPselectEnhanced === 'true') {
      syncProfessionalSelect(select);
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'nv-pselect';
    Array.from(select.classList)
      .filter(className => /(^|:)tw-(w|min-w|max-w)-/.test(className))
      .forEach(className => wrapper.classList.add(className));
    if (select.closest('.nv-profile-input-wrap')) wrapper.classList.add('nv-pselect-profile');
    if (select.closest('.nv-jalali-selects')) wrapper.classList.add('nv-pselect-compact');

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'nv-pselect-trigger';
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', professionalSelectAriaLabel(select));

    const listId = `nv-pselect-list-${++professionalSelectState.sequence}`;
    trigger.setAttribute('aria-controls', listId);
    trigger.innerHTML = '<span class="nv-pselect-value">انتخاب کنید</span><span class="nv-pselect-chevron" aria-hidden="true"><i class="icon-chevron-down"></i></span>';

    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(select);
    wrapper.appendChild(trigger);
    select.classList.add('nv-pselect-native');
    select.dataset.nvPselectEnhanced = 'true';
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');

    trigger.addEventListener('click', () => openProfessionalSelect(select));
    trigger.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        openProfessionalSelect(select, { keyboard: true, direction: 'selected' });
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        openProfessionalSelect(select, { keyboard: true, direction: 'last' });
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openProfessionalSelect(select, { keyboard: true });
      } else if (event.key === 'Escape') {
        closeProfessionalSelect({ restoreFocus: true });
      }
    });

    select.addEventListener('change', () => {
      select.dataset.nvPselectTouched = 'true';
      syncProfessionalSelect(select);
    });
    select.addEventListener('input', () => syncProfessionalSelect(select));
    select.addEventListener('focus', () => trigger.focus());
    select.addEventListener('invalid', event => {
      event.preventDefault();
      select.dataset.nvPselectTouched = 'true';
      syncProfessionalSelect(select);
      trigger.focus();
      showToast(`لطفاً ${professionalSelectAriaLabel(select).replace(/^انتخاب\s*/, '')} را انتخاب کنید.`, 'warning');
    });

    new MutationObserver(() => syncProfessionalSelect(select)).observe(select, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['selected', 'disabled', 'hidden', 'label']
    });

    syncProfessionalSelect(select);
  }

  function enhanceProfessionalSelects(scope = document) {
    if (scope?.matches?.('select')) enhanceProfessionalSelect(scope);
    qsa('select', scope).forEach(enhanceProfessionalSelect);
  }

  function installProfessionalSelects() {
    enhanceProfessionalSelects(document);
    const observer = new MutationObserver(mutations => {
      cancelAnimationFrame(professionalSelectState.scanFrame);
      professionalSelectState.scanFrame = requestAnimationFrame(() => {
        mutations.forEach(mutation => {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType !== Node.ELEMENT_NODE) return;
            enhanceProfessionalSelects(node);
          });
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener('pointerdown', event => {
      const active = professionalSelectState.active;
      if (!active) return;
      if (active.portal.contains(event.target) || active.wrapper.contains(event.target)) return;
      closeProfessionalSelect();
    }, true);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && professionalSelectState.active) closeProfessionalSelect({ restoreFocus: true });
    });
    window.addEventListener('resize', positionProfessionalSelect);
    window.addEventListener('scroll', positionProfessionalSelect, true);
  }

  async function api(endpoint, options = {}) {
    const url = /^https?:\/\//.test(endpoint)
      ? endpoint
      : endpoint.startsWith('/api/') ? endpoint : `/api/${String(endpoint).replace(/^\//, '')}`;

    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      credentials: 'same-origin',
      cache: 'no-store'
    });

    let result = {};
    try { result = await response.json(); } catch (_) {}

    if (response.status === 401) {
      if (typeof window.noorvistaClearClientAuth === 'function') window.noorvistaClearClientAuth();
      else { try { localStorage.removeItem('user'); } catch (_) {} }
      showToast(friendlyErrorMessage(result.message, 'نشست شما پایان یافته است. لطفاً دوباره وارد شوید.'), 'error');
      setTimeout(() => { window.location.replace('/login'); }, 500);
      const error = new Error(result.message || 'نشست کاربری معتبر نیست.');
      error.status = response.status;
      throw error;
    }

    if (response.status === 403) {
      const error = new Error(result.message || 'دسترسی شما به این بخش مجاز نیست.');
      error.status = response.status;
      throw error;
    }

    if (!response.ok || result.success === false) {
      const error = new Error(result.message || 'انجام درخواست موقتاً ممکن نشد.');
      error.status = response.status;
      throw error;
    }
    return result;
  }

  function showToast(message, type = 'info') {
    let region = document.getElementById('nvPatientToastRegion');
    if (!region) {
      region = document.createElement('div');
      region.id = 'nvPatientToastRegion';
      region.className = 'tw-fixed tw-bottom-5 tw-left-4 tw-z-[100] tw-flex tw-w-[min(92vw,420px)] tw-flex-col tw-gap-3';
      region.setAttribute('aria-live', 'polite');
      region.setAttribute('aria-atomic', 'true');
      document.body.appendChild(region);
    }

    const tones = {
      success: 'tw-border-emerald-200 tw-bg-emerald-50 tw-text-emerald-900',
      error: 'tw-border-rose-200 tw-bg-rose-50 tw-text-rose-900',
      warning: 'tw-border-amber-200 tw-bg-amber-50 tw-text-amber-900',
      info: 'tw-border-sky-200 tw-bg-sky-50 tw-text-sky-900'
    };
    const icons = { success: 'icon-check', error: 'icon-close', warning: 'icon-warning', info: 'icon-info' };
    const toast = document.createElement('div');
    toast.className = `tw-flex tw-items-start tw-gap-3 tw-rounded-2xl tw-border tw-p-4 tw-shadow-noor ${tones[type] || tones.info}`;
    toast.innerHTML = `<span class="tw-flex tw-h-9 tw-w-9 tw-flex-none tw-items-center tw-justify-center tw-rounded-xl tw-bg-white/70"><i class="${icons[type] || icons.info}"></i></span><p class="tw-flex-1 tw-text-sm tw-font-semibold tw-leading-7">${escapeHtml(message)}</p><button type="button" class="tw-flex tw-h-8 tw-w-8 tw-items-center tw-justify-center tw-rounded-lg tw-border-0 tw-bg-transparent tw-text-current hover:tw-bg-white/70" aria-label="بستن پیام"><i class="icon-close"></i></button>`;
    qs('button', toast).addEventListener('click', () => toast.remove());
    region.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
  }

  function formatDate(value, withWeekday = false) {
    if (!value) return '—';
    const raw = String(value).slice(0, 10);
    const parsed = new Date(`${raw}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) return toFa(raw);
    try {
      return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
        ...(withWeekday ? { weekday: 'long' } : {}),
        year: 'numeric', month: 'long', day: 'numeric'
      }).format(parsed);
    } catch (_) { return toFa(raw); }
  }

  function formatTime(value) {
    return value ? toFa(String(value).slice(0, 5)) : '—';
  }

  function formatMoney(value) {
    const amount = Number(value || 0);
    return `${toFa(new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number.isFinite(amount) ? amount : 0))} تومان`;
  }


  function insuranceMode(item) {
    return String(item?.supplementary_insurance_payment_mode || 'none').toLowerCase().replace(/[\s-]+/g, '_');
  }

  function hasServiceInsurance(item) {
    return Boolean(item?.supplementary_insurance_enabled);
  }

  function calculateInsurancePayable(amount, serviceOrSlot, hasInsurance) {
    const original = Math.max(0, Number(amount || 0));
    if (!hasInsurance || !hasServiceInsurance(serviceOrSlot) || original <= 0) return { original, payable: original, remaining: 0, applied: false };
    const mode = insuranceMode(serviceOrSlot);
    let payable = original;
    if (['waive', 'zero', 'free', 'no_online_payment', 'review'].includes(mode)) payable = 0;
    else if (['fixed', 'fixed_amount', 'reduced_fixed'].includes(mode)) payable = Math.min(original, Math.max(0, Number(serviceOrSlot.supplementary_insurance_amount || 0)));
    else if (['percent', 'percentage', 'reduced_percent'].includes(mode)) payable = Math.round(original * Math.max(0, Math.min(100, Number(serviceOrSlot.supplementary_insurance_percent || 0))) / 100);
    return { original, payable, remaining: Math.max(0, original - payable), applied: true };
  }

  function bookingInsuranceInput() {
    return {
      has: qs('#appointmentHasSupplementaryInsurance')?.checked || false,
      provider: text(qs('#appointmentInsuranceProvider')?.value),
      number: text(qs('#appointmentInsuranceNumber')?.value),
      note: text(qs('#appointmentInsuranceNote')?.value)
    };
  }

  function syncBookingInsuranceFields() {
    const has = qs('#appointmentHasSupplementaryInsurance')?.checked || false;
    const details = qs('[data-appointment-insurance-details]');
    if (details) details.hidden = !has;
    updateSelectedSlotSummary();
    updateBookingSubmitState();
  }

  function isoToday() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function isoAfterDays(days) {
    const date = parseIsoDate(isoToday()) || new Date();
    date.setDate(date.getDate() + Number(days || 0));
    return localIsoDate(date);
  }

  const persianMonths = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
  const persianWeekdays = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
  const persianPartsFormatter = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
    year: 'numeric', month: 'numeric', day: 'numeric'
  });

  function persianDateParts(date) {
    const parts = {};
    persianPartsFormatter.formatToParts(date).forEach(part => {
      if (part.type === 'year' || part.type === 'month' || part.type === 'day') parts[part.type] = Number(part.value);
    });
    return { year: parts.year, month: parts.month, day: parts.day };
  }

  function parseIsoDate(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function localIsoDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function findPersianMonthStart(year, month) {
    const approxGregorianYear = year + 621;
    const cursor = new Date(approxGregorianYear, 0, 1, 12, 0, 0, 0);
    for (let i = 0; i < 430; i += 1) {
      const parts = persianDateParts(cursor);
      if (parts.year === year && parts.month === month && parts.day === 1) return new Date(cursor);
      cursor.setDate(cursor.getDate() + 1);
    }
    return null;
  }

  function persianMonthDates(year, month) {
    const first = findPersianMonthStart(year, month);
    if (!first) return [];
    const dates = [];
    const cursor = new Date(first);
    for (let i = 0; i < 32; i += 1) {
      const parts = persianDateParts(cursor);
      if (parts.year !== year || parts.month !== month) break;
      dates.push({ date: new Date(cursor), iso: localIsoDate(cursor), day: parts.day });
      cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
  }

  function syncJalaliDisplay(input) {
    if (!input) return;
    const target = document.getElementById(input.dataset.dateTarget || '');
    input.value = target?.value ? formatDate(target.value) : '';
  }

  function bindJalaliDatePickers(scope = document) {
    qsa('[data-nv-jalali-input]', scope).forEach(input => {
      if (input.dataset.dateBound === 'true') return;
      input.dataset.dateBound = 'true';
      const open = () => openJalaliDatePicker(input);
      input.addEventListener('click', open);
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      });
      const button = input.parentElement?.querySelector('[data-nv-date-open]');
      button?.addEventListener('click', open);
      syncJalaliDisplay(input);
    });
  }

  function openJalaliDatePicker(displayInput) {
    const target = document.getElementById(displayInput.dataset.dateTarget || '');
    if (!target) return;
    const todayIso = isoToday();
    const selectedDate = parseIsoDate(target.value);
    const fallback = displayInput.dataset.dateMode === 'birth'
      ? new Date(new Date().getFullYear() - 30, new Date().getMonth(), new Date().getDate(), 12)
      : new Date();
    let view = persianDateParts(selectedDate || fallback);
    const minIso = displayInput.dataset.minToday === 'true' ? todayIso : (displayInput.dataset.min || '');
    const maxIso = displayInput.dataset.maxToday === 'true' ? todayIso : (displayInput.dataset.max || '');
    const availabilityMode = displayInput.dataset.availabilitySource === 'appointment';
    const availableDates = availabilityMode ? state.availableDateSet : null;
    const currentPersianYear = persianDateParts(new Date()).year;
    const minYear = displayInput.dataset.dateMode === 'birth' ? currentPersianYear - 120 : currentPersianYear - 1;
    const maxYear = displayInput.dataset.dateMode === 'birth' ? currentPersianYear : currentPersianYear + 3;
    view.year = Math.min(maxYear, Math.max(minYear, view.year));
    const lastFocused = document.activeElement;

    const modal = document.createElement('div');
    modal.className = 'nv-jalali-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', displayInput.dataset.dateLabel || 'انتخاب تاریخ شمسی');
    modal.innerHTML = `<div class="nv-jalali-panel">
      <header class="nv-jalali-header">
        <div><span class="nv-jalali-eyebrow">تقویم رسمی ایران</span><h2>${escapeHtml(displayInput.dataset.dateLabel || 'انتخاب تاریخ')}</h2></div>
        <button type="button" class="nv-jalali-close" data-jalali-close aria-label="بستن تقویم"><i class="icon-close" aria-hidden="true"></i></button>
      </header>
      <div class="nv-jalali-toolbar">
        <button type="button" class="nv-jalali-nav" data-jalali-next aria-label="ماه بعد"><i class="icon-chevron-right" aria-hidden="true"></i></button>
        <div class="nv-jalali-selects"><label><span class="tw-sr-only">ماه</span><select data-jalali-month></select></label><label><span class="tw-sr-only">سال</span><select data-jalali-year></select></label></div>
        <button type="button" class="nv-jalali-nav" data-jalali-prev aria-label="ماه قبل"><i class="icon-chevron-left" aria-hidden="true"></i></button>
      </div>
      <div class="nv-jalali-weekdays" aria-hidden="true">${persianWeekdays.map(day => `<span>${day}</span>`).join('')}</div>
      <div class="nv-jalali-grid" data-jalali-grid></div>
      ${availabilityMode ? `<div class="nv-jalali-availability" role="note"><span><i class="nv-jalali-dot is-available"></i> آبی پررنگ: دارای نوبت و قابل انتخاب</span><span><i class="nv-jalali-dot is-unavailable"></i> خاکستری: بدون نوبت</span></div>` : ''}
      <footer class="nv-jalali-footer">
        ${displayInput.dataset.dateMode === 'birth' ? '<span></span>' : '<button type="button" class="nv-jalali-text-btn" data-jalali-today>امروز</button>'}
        <div class="tw-flex tw-items-center tw-gap-2">${displayInput.dataset.optional === 'true' ? '<button type="button" class="nv-jalali-text-btn nv-jalali-clear" data-jalali-clear>پاک کردن</button>' : ''}<button type="button" class="noor-tw-btn-secondary" data-jalali-close>انصراف</button></div>
      </footer>
    </div>`;
    document.body.appendChild(modal);
    document.body.classList.add('tw-overflow-hidden');

    const monthSelect = qs('[data-jalali-month]', modal);
    const yearSelect = qs('[data-jalali-year]', modal);
    monthSelect.innerHTML = persianMonths.map((name, index) => `<option value="${index + 1}">${name}</option>`).join('');
    yearSelect.innerHTML = Array.from({ length: maxYear - minYear + 1 }, (_, index) => maxYear - index)
      .map(year => `<option value="${year}">${toFa(year)}</option>`).join('');

    function inRange(iso) {
      return (!minIso || iso >= minIso) && (!maxIso || iso <= maxIso);
    }

    function renderCalendar() {
      monthSelect.value = String(view.month);
      yearSelect.value = String(view.year);
      syncProfessionalSelect(monthSelect);
      syncProfessionalSelect(yearSelect);
      const dates = persianMonthDates(view.year, view.month);
      const grid = qs('[data-jalali-grid]', modal);
      if (!dates.length) {
        grid.innerHTML = '<p class="nv-jalali-error">نمایش این ماه ممکن نشد.</p>';
        return;
      }
      const firstOffset = (dates[0].date.getDay() + 1) % 7;
      const blanks = Array.from({ length: firstOffset }, () => '<span class="nv-jalali-blank" aria-hidden="true"></span>').join('');
      grid.innerHTML = blanks + dates.map(item => {
        const hasAvailability = !availabilityMode || availableDates.has(item.iso);
        const disabled = !inRange(item.iso) || !hasAvailability;
        const isSelected = item.iso === target.value;
        const isToday = item.iso === todayIso;
        const classNames = ['nv-jalali-day'];
        if (availabilityMode) classNames.push(hasAvailability ? 'nv-jalali-day-available' : 'nv-jalali-day-unavailable');
        if (isSelected) classNames.push('nv-jalali-day-selected');
        if (isToday) classNames.push('nv-jalali-day-today');
        const availabilityLabel = availabilityMode ? (hasAvailability ? '، دارای نوبت خالی و قابل انتخاب' : '، بدون نوبت خالی و غیرقابل انتخاب') : '';
        return `<button type="button" class="${classNames.join(' ')}" data-jalali-date="${item.iso}" ${disabled ? 'disabled' : ''} aria-label="${escapeHtml(formatDate(item.iso, true) + availabilityLabel)}" aria-pressed="${isSelected ? 'true' : 'false'}" ${isToday ? 'aria-current="date"' : ''}><span>${toFa(item.day)}</span></button>`;
      }).join('');
      qsa('[data-jalali-date]', grid).forEach(button => button.addEventListener('click', () => {
        target.value = button.dataset.jalaliDate;
        syncJalaliDisplay(displayInput);
        target.dispatchEvent(new Event('change', { bubbles: true }));
        displayInput.dispatchEvent(new Event('input', { bubbles: true }));
        close();
      }));
    }

    function shiftMonth(delta) {
      let nextMonth = view.month + delta;
      let nextYear = view.year;
      if (nextMonth < 1) { nextMonth = 12; nextYear -= 1; }
      if (nextMonth > 12) { nextMonth = 1; nextYear += 1; }
      if (nextYear < minYear || nextYear > maxYear) return;
      view = { year: nextYear, month: nextMonth, day: 1 };
      renderCalendar();
    }

    function close() {
      modal.remove();
      document.body.classList.remove('tw-overflow-hidden');
      lastFocused?.focus?.();
    }

    qsa('[data-jalali-close]', modal).forEach(button => button.addEventListener('click', close));
    qs('[data-jalali-prev]', modal).addEventListener('click', () => shiftMonth(-1));
    qs('[data-jalali-next]', modal).addEventListener('click', () => shiftMonth(1));
    monthSelect.addEventListener('change', () => { view.month = Number(monthSelect.value); renderCalendar(); });
    yearSelect.addEventListener('change', () => { view.year = Number(yearSelect.value); renderCalendar(); });
    qs('[data-jalali-today]', modal)?.addEventListener('click', () => {
      const today = parseIsoDate(todayIso);
      const p = persianDateParts(today);
      view = p;
      if (inRange(todayIso) && (!availabilityMode || availableDates.has(todayIso))) {
        target.value = todayIso;
        syncJalaliDisplay(displayInput);
        target.dispatchEvent(new Event('change', { bubbles: true }));
        displayInput.dispatchEvent(new Event('input', { bubbles: true }));
        close();
      } else renderCalendar();
    });
    qs('[data-jalali-clear]', modal)?.addEventListener('click', () => {
      target.value = '';
      syncJalaliDisplay(displayInput);
      target.dispatchEvent(new Event('change', { bubbles: true }));
      displayInput.dispatchEvent(new Event('input', { bubbles: true }));
      close();
    });
    modal.addEventListener('mousedown', event => { if (event.target === modal) close(); });
    modal.addEventListener('keydown', event => {
      if (event.key === 'Escape') { close(); return; }
      if (event.key !== 'Tab') return;
      const focusable = qsa('button:not([disabled]), select:not([disabled]), input:not([disabled])', modal).filter(item => item.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    renderCalendar();
    qs('[data-jalali-close]', modal)?.focus();
  }

  function appointmentDate(app) {
    const date = String(app?.appointment_date || '').slice(0, 10);
    const time = String(app?.appointment_time || '00:00').slice(0, 5);
    return new Date(`${date}T${time}:00`);
  }

  function canCancel(app) {
    if (!['pending', 'confirmed'].includes(String(app?.status))) return false;
    const diff = appointmentDate(app).getTime() - Date.now();
    return Number.isFinite(diff) && diff >= 24 * 60 * 60 * 1000;
  }

  function statusInfo(status) {
    const map = {
      pending: ['در حال بررسی توسط کلینیک', 'warning', 'icon-clock-o'],
      confirmed: ['تأیید شده', 'info', 'icon-check'],
      completed: ['انجام شده', 'success', 'icon-check-circle'],
      cancelled: ['لغو شده', 'danger', 'icon-close'],
      canceled: ['لغو شده', 'danger', 'icon-close'],
      no_show: ['عدم حضور', 'muted', 'icon-user-times'],
      paid: ['پرداخت شده', 'success', 'icon-check'],
      success: ['پرداخت شده', 'success', 'icon-check'],
      failed: ['ناموفق', 'danger', 'icon-close']
    };
    return map[String(status || '').toLowerCase()] || [text(status) || 'نامشخص', 'muted', 'icon-info'];
  }

  function badge(status) {
    const [label, tone, icon] = statusInfo(status);
    return `<span class="nv-tw-badge nv-tw-badge-${tone}"><i class="${icon} tw-ml-1.5" aria-hidden="true"></i>${escapeHtml(label)}</span>`;
  }

  function renderNotificationIndicator(unreadCount = 0) {
    const unread = Math.max(0, Number(unreadCount) || 0);
    qsa('.nv3-notification-entry').forEach(link => {
      link.classList.toggle('has-unread', unread > 0);
      let dot = qs('[data-nv3-notification-dot]', link);
      if (!dot) {
        dot = document.createElement('span');
        dot.className = 'nv3-notification-dot';
        dot.dataset.nv3NotificationDot = '';
        dot.setAttribute('aria-hidden', 'true');
        link.appendChild(dot);
      }
      dot.hidden = unread === 0;
      const label = unread > 0 ? `${toFa(unread)} اعلان خوانده‌نشده` : 'اعلان‌ها';
      link.setAttribute('aria-label', label);
      link.setAttribute('title', label);
    });
  }

  async function syncNotificationIndicator() {
    try {
      const result = await api('/notifications?limit=100');
      const items = Array.isArray(result.notifications) ? result.notifications : [];
      renderNotificationIndicator(items.filter(item => !item.is_read).length);
    } catch (_) {
      renderNotificationIndicator(0);
    }
  }

  function pageLoading(label = 'در حال دریافت اطلاعات شما...') {
    if (!root) return;
    root.innerHTML = `<div class="tw-grid tw-gap-5 lg:tw-grid-cols-3" aria-label="${escapeHtml(label)}"><div class="nv-patient-skeleton tw-h-36 lg:tw-col-span-2"></div><div class="nv-patient-skeleton tw-h-36"></div><div class="nv-patient-skeleton tw-h-72 lg:tw-col-span-3"></div></div>`;
  }

  function errorState(error, retry) {
    if (!root) return;
    root.innerHTML = `<section class="nv-tw-card"><div class="tw-p-8 tw-text-center"><span class="tw-mx-auto tw-flex tw-h-14 tw-w-14 tw-items-center tw-justify-center tw-rounded-2xl tw-bg-rose-50 tw-text-xl tw-text-rose-700"><i class="icon-warning"></i></span><h2 class="tw-mt-4 tw-text-lg tw-font-black tw-text-clinic-ink">بارگذاری این بخش ممکن نشد</h2><p class="tw-mx-auto tw-mt-2 tw-max-w-xl tw-text-sm tw-leading-7 tw-text-slate-600">${escapeHtml(friendlyErrorMessage(error, 'بارگذاری اطلاعات موقتاً ممکن نشد. لطفاً دوباره تلاش کنید.'))}</p><button type="button" class="noor-tw-btn-primary tw-mt-5" data-retry><i class="icon-refresh"></i> تلاش دوباره</button></div></section>`;
    qs('[data-retry]', root)?.addEventListener('click', retry);
  }

  function emptyState(title, description, action = '') {
    return `<div class="nv-patient-empty"><span class="tw-flex tw-h-14 tw-w-14 tw-items-center tw-justify-center tw-rounded-2xl tw-bg-noor-50 tw-text-xl tw-text-noor-700"><i class="icon-folder-open"></i></span><h3 class="tw-mt-4 tw-text-base tw-font-black tw-text-clinic-ink">${escapeHtml(title)}</h3><p class="tw-mt-2 tw-max-w-lg tw-text-sm tw-leading-7 tw-text-slate-500">${escapeHtml(description)}</p>${action}</div>`;
  }

  function statCard(icon, label, value, note, tone = 'noor') {
    const toneClass = {
      noor: 'tw-bg-noor-50 tw-text-noor-700',
      emerald: 'tw-bg-emerald-50 tw-text-emerald-700',
      amber: 'tw-bg-amber-50 tw-text-amber-700',
      violet: 'tw-bg-violet-50 tw-text-violet-700',
      rose: 'tw-bg-rose-50 tw-text-rose-700'
    }[tone] || 'tw-bg-noor-50 tw-text-noor-700';
    return `<article class="nv-tw-stat-card nv-patient-stat-card"><span class="nv-patient-stat-icon ${toneClass}"><i class="${icon}" aria-hidden="true"></i></span><div class="nv-patient-stat-copy"><strong class="nv-patient-stat-value">${escapeHtml(toFa(value ?? 0))}</strong><span class="nv-patient-stat-label">${escapeHtml(label)}</span><small class="nv-patient-stat-note">${escapeHtml(note)}</small></div></article>`;
  }

  function formatAmountNumber(value) {
    const amount = Number(value || 0);
    return toFa(new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number.isFinite(amount) ? amount : 0));
  }

  function paymentAmountStatCard(icon, label, value, note, tone = 'noor') {
    const toneClass = {
      noor: 'tw-bg-noor-50 tw-text-noor-700',
      emerald: 'tw-bg-emerald-50 tw-text-emerald-700',
      amber: 'tw-bg-amber-50 tw-text-amber-700',
      violet: 'tw-bg-violet-50 tw-text-violet-700',
      rose: 'tw-bg-rose-50 tw-text-rose-700'
    }[tone] || 'tw-bg-noor-50 tw-text-noor-700';
    return `<article class="nv-tw-stat-card nv-patient-stat-card nv-patient-money-stat"><span class="nv-payment-stat-unit">تومان</span><span class="nv-patient-stat-icon ${toneClass}"><i class="${icon}" aria-hidden="true"></i></span><div class="nv-patient-stat-copy"><strong class="nv-patient-stat-value nv-patient-money-value">${escapeHtml(formatAmountNumber(value))}</strong><span class="nv-patient-stat-label">${escapeHtml(label)}</span><small class="nv-patient-stat-note">${escapeHtml(note)}</small></div></article>`;
  }

  function appointmentSummaryCard(icon, label, value, tone = 'noor') {
    const toneClass = tone === 'emerald' ? 'is-success' : tone === 'amber' ? 'is-warning' : '';
    return `<article class="nv-pa-summary-item ${toneClass}"><span class="nv-pa-summary-icon"><i class="${icon}" aria-hidden="true"></i></span><div class="nv-pa-summary-copy"><strong class="nv-pa-summary-value">${escapeHtml(toFa(value ?? 0))}</strong><span class="nv-pa-summary-label">${escapeHtml(label)}</span></div></article>`;
  }

  function updateStoredUser(profile) {
    if (window.__NOORVISTA_LOGGING_OUT__) return;
    try {
      const current = JSON.parse(localStorage.getItem('user') || '{}');
      const merged = {
        ...current,
        ...profile,
        full_name: profile.full_name || current.full_name,
        phone: profile.phone ?? current.phone,
        email: profile.email ?? current.email
      };
      localStorage.setItem('user', JSON.stringify(merged));
      const name = merged.full_name || merged.username || 'کاربر گرامی';
      const words = String(name).trim().split(/\s+/).filter(Boolean);
      const avatar = `${words[0]?.[0] || 'ب'}${words[1]?.[0] || ''}`;
      qsa('[data-nv-user-name], [data-nv3-user-name], .nv3-dashboard .user-name').forEach(el => { el.textContent = name; });
      qsa('[data-nv-user-avatar], [data-nv3-user-avatar], .nv3-dashboard .user-avatar').forEach(el => {
        el.textContent = avatar;
        el.setAttribute('aria-label', `نشان کاربری ${name}`);
      });
    } catch (_) {}
  }

  function roleDashboard(roleName) {
    const role = String(roleName || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    const routes = {
      system_admin: '/dashboard/panel/admin/index.html',
      admin: '/dashboard/panel/admin/index.html',
      clinic_admin: '/dashboard/panel/clinic-manager/index.html',
      clinic_manager: '/dashboard/panel/clinic-manager/index.html',
      doctor: '/dashboard/panel/doctor/index.html',
      receptionist: '/dashboard/panel/secretary/index.html',
      patient: '/dashboard/panel/patient/index.html'
    };
    return routes[role] || '/';
  }

  async function bootstrapPatientSession() {
    const result = await api('/auth/me');
    const user = result.user || {};
    const role = String(user.role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (role !== 'patient') {
      showToast('این پنل فقط برای حساب زیباجو در دسترس است.', 'error');
      setTimeout(() => window.location.replace(roleDashboard(role)), 700);
      return false;
    }
    updateStoredUser(user);
    return true;
  }

  function openModal(id, trigger) {
    const modal = document.getElementById(id);
    if (!modal) return;
    state.lastFocused = trigger || document.activeElement;
    state.activeModal = modal;
    modal.classList.remove('tw-hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    const focusable = qs('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', modal);
    setTimeout(() => focusable?.focus(), 0);
  }

  function closeModal(modal) {
    const target = typeof modal === 'string' ? document.getElementById(modal) : modal;
    if (!target) return;
    target.classList.add('tw-hidden');
    target.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    state.activeModal = null;
    state.lastFocused?.focus?.();
  }

  function consumeAppointmentPageQuery() {
    const url = new URL(window.location.href);
    const paymentResult = text(url.searchParams.get('payment')).toLowerCase();
    const requestedViewId = Number(url.searchParams.get('view') || 0);

    // Payment/cancellation feedback is intentionally shown once as a toast.
    // A legacy `view` parameter attached to a payment return must never reopen
    // the details modal after refreshes, filtering or cancellation.
    state.pendingAppointmentViewId = paymentResult ? 0 : requestedViewId;

    if (paymentResult === 'cancelled') {
      showToast('پرداخت انجام نشد؛ دریافت موقت آزاد شد و هیچ نوبتی ثبت نشد.', 'info');
    } else if (paymentResult === 'paid') {
      showToast('پرداخت ثبت شد و نوبت تأیید شده است.', 'success');
    }

    if (paymentResult || requestedViewId) {
      url.searchParams.delete('payment');
      url.searchParams.delete('view');
      const cleanUrl = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  }

  function clearAppointmentTransientState() {
    state.pendingAppointmentViewId = 0;
    const url = new URL(window.location.href);
    if (!url.searchParams.has('payment') && !url.searchParams.has('view')) return;
    url.searchParams.delete('payment');
    url.searchParams.delete('view');
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
  }

  function bindModalSystem() {
    document.addEventListener('click', event => {
      const closer = event.target.closest('[data-modal-close]');
      if (closer) closeModal(closer.closest('[data-modal]'));
      if (event.target.matches('[data-modal]')) closeModal(event.target);
    });
    document.addEventListener('keydown', event => {
      if (!state.activeModal) return;
      if (event.key === 'Escape') closeModal(state.activeModal);
      if (event.key === 'Tab') {
        const focusable = qsa('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', state.activeModal)
          .filter(el => el.offsetParent !== null);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
  }

  function setButtonBusy(button, busy, busyLabel = 'در حال انجام...') {
    if (!button) return;
    if (busy) {
      button.dataset.originalHtml = button.innerHTML;
      button.disabled = true;
      button.innerHTML = `<span class="nv-patient-spinner" aria-hidden="true"></span>${escapeHtml(busyLabel)}`;
    } else {
      button.disabled = false;
      if (button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
    }
  }

  function appointmentPaymentStatus(app) {
    const insuranceStatus = String(app?.insurance_status || '').toLowerCase();
    const hasInsurance = Number(app?.has_supplementary_insurance || 0) === 1 || insuranceStatus.includes('pending');
    const onlineAmount = Number(app?.online_payable_amount ?? app?.amount ?? 0) || 0;
    if (hasInsurance && insuranceStatus && !['none', 'rejected', 'not_covered_by_service'].includes(insuranceStatus) && onlineAmount <= 0) return 'insurance_review';
    const value = String(app?.resolved_payment_status || app?.payment_record_status || app?.payment_status || '').toLowerCase();
    if (value === 'free') return 'free';
    if (['paid', 'completed', 'success'].includes(value)) return 'paid';
    if (value === 'pending') return hasInsurance && onlineAmount <= 0 ? 'insurance_review' : 'pending';
    if (['failed', 'cancelled', 'canceled'].includes(value)) return value === 'failed' ? 'failed' : 'cancelled';
    return 'unpaid';
  }

  function paymentBadge(status) {
    const normalized = String(status || 'unpaid').toLowerCase();
    const map = {
      paid: ['پرداخت شده', 'success', 'icon-check-circle'],
      free: ['خدمت رایگان', 'success', 'icon-gift'],
      pending: ['در انتظار پرداخت', 'warning', 'icon-clock-o'],
      insurance_review: ['در حال بررسی توسط کلینیک بیمه', 'info', 'icon-shield'],
      failed: ['پرداخت ناموفق', 'danger', 'icon-close'],
      cancelled: ['پرداخت لغوشده', 'muted', 'icon-ban'],
      unpaid: ['پرداخت نشده', 'warning', 'icon-credit-card']
    };
    const [label, tone, icon] = map[normalized] || map.unpaid;
    return `<span class="nv-tw-badge nv-tw-badge-${tone}"><i class="${icon} tw-ml-1.5" aria-hidden="true"></i>${label}</span>`;
  }

  function canPayAppointment(app) {
    return Number(app?.amount || 0) > 0
      && !['cancelled', 'canceled', 'no_show'].includes(String(app?.status || '').toLowerCase())
      && !['paid', 'insurance_review'].includes(appointmentPaymentStatus(app));
  }

  function appointmentRow(app) {
    const payStatus = appointmentPaymentStatus(app);
    return `<tr><td><div class="tw-font-black tw-text-clinic-ink">${formatDate(app.appointment_date)}</div><div class="tw-mt-1 tw-text-xs tw-text-slate-400">ساعت ${formatTime(app.appointment_time)}</div></td><td><div class="tw-font-bold tw-text-slate-800">دکتر ${escapeHtml(app.doctor_name || '—')}</div><div class="tw-mt-1 tw-text-xs tw-text-slate-400">${escapeHtml(app.specialty || 'چشم‌پزشکی')}</div></td><td>${badge(app.status)}</td><td>${paymentBadge(payStatus)}</td><td class="tw-font-bold tw-text-slate-700">${formatMoney(app.amount)}</td><td><div class="tw-flex tw-flex-wrap tw-gap-2"><button type="button" class="nv-patient-action-btn" data-appointment-view="${Number(app.id)}"><i class="icon-eye"></i><span>جزئیات</span></button>${canPayAppointment(app) ? `<button type="button" class="nv-patient-action-btn" data-appointment-pay="${Number(app.id)}"><i class="icon-credit-card"></i><span>پرداخت</span></button>` : ''}${canCancel(app) ? `<button type="button" class="nv-patient-action-btn nv-patient-action-danger" data-appointment-cancel="${Number(app.id)}"><i class="icon-close"></i><span>لغو</span></button>` : ''}</div></td></tr>`;
  }

  function appointmentMobileCard(app) {
    const payStatus = appointmentPaymentStatus(app);
    return `<article class="nv-pa-mobile-card"><div class="nv-pa-mobile-card-head"><div><strong class="tw-block tw-text-sm tw-font-black tw-text-clinic-ink">دکتر ${escapeHtml(app.doctor_name || '—')}</strong><span class="tw-mt-1 tw-block tw-text-xs tw-text-slate-500">${escapeHtml(app.specialty || 'چشم‌پزشکی')}</span></div>${badge(app.status)}</div><div class="nv-pa-mobile-card-grid"><div class="nv-pa-mobile-meta"><span>تاریخ مراجعه</span><strong>${formatDate(app.appointment_date)}</strong></div><div class="nv-pa-mobile-meta"><span>ساعت</span><strong>${formatTime(app.appointment_time)}</strong></div><div class="nv-pa-mobile-meta"><span>مبلغ</span><strong>${formatMoney(app.amount)}</strong></div><div class="nv-pa-mobile-meta"><span>وضعیت پرداخت</span><span>${paymentBadge(payStatus)}</span></div></div><div class="nv-pa-mobile-actions"><button type="button" class="nv-patient-action-btn" data-appointment-view="${Number(app.id)}"><i class="icon-eye"></i><span>جزئیات</span></button>${canPayAppointment(app) ? `<button type="button" class="nv-patient-action-btn" data-appointment-pay="${Number(app.id)}"><i class="icon-credit-card"></i><span>پرداخت</span></button>` : ''}${canCancel(app) ? `<button type="button" class="nv-patient-action-btn nv-patient-action-danger" data-appointment-cancel="${Number(app.id)}"><i class="icon-close"></i><span>لغو نوبت</span></button>` : ''}</div></article>`;
  }


  function dashboardAppointmentRow(app) {
    const payStatus = appointmentPaymentStatus(app);
    return `<tr><td><div class="tw-font-black tw-text-clinic-ink">${formatDate(app.appointment_date)}</div><div class="tw-mt-1 tw-text-xs tw-text-slate-400">ساعت ${formatTime(app.appointment_time)}</div></td><td><div class="tw-font-bold tw-text-slate-800">دکتر ${escapeHtml(app.doctor_name || '—')}</div><div class="tw-mt-1 tw-text-xs tw-text-slate-400">${escapeHtml(app.specialty || 'چشم‌پزشکی')}</div></td><td>${badge(app.status)}</td><td>${paymentBadge(payStatus)}</td><td><div class="tw-font-bold tw-text-slate-700">${formatMoney(app.amount)}</div>${canPayAppointment(app) ? `<button type="button" class="nv-pd-pay-link" data-appointment-pay="${Number(app.id)}"><i class="icon-credit-card" aria-hidden="true"></i> پرداخت</button>` : ''}</td></tr>`;
  }

  function dashboardAppointmentMobileCard(app) {
    const payStatus = appointmentPaymentStatus(app);
    return `<article class="nv-pd-recent-card"><div class="nv-pd-recent-date"><span>${formatDate(app.appointment_date)}</span><strong>${formatTime(app.appointment_time)}</strong></div><div class="nv-pd-recent-main"><div class="nv-pd-recent-doctor"><span class="nv-pd-recent-icon"><i class="icon-user" aria-hidden="true"></i></span><div><strong>دکتر ${escapeHtml(app.doctor_name || '—')}</strong><small>${escapeHtml(app.specialty || 'چشم‌پزشکی')}</small></div></div><div class="nv-pd-recent-badges">${badge(app.status)}${paymentBadge(payStatus)}</div><div class="nv-pd-recent-bottom"><span>${formatMoney(app.amount)}</span>${canPayAppointment(app) ? `<button type="button" class="nv-pd-pay-button" data-appointment-pay="${Number(app.id)}"><i class="icon-credit-card" aria-hidden="true"></i> پرداخت</button>` : ''}</div></div></article>`;
  }

  function renderAppointmentDetails(app) {
    const modal = document.getElementById('appointmentDetailModal');
    if (!modal || !app) return;
    qs('[data-modal-title]', modal).textContent = `جزئیات نوبت شماره ${toFa(app.id)}`;
    const payStatus = appointmentPaymentStatus(app);
    qs('[data-modal-content]', modal).innerHTML = `<div class="nv-patient-detail-grid"><div class="nv-patient-detail-item"><span>پزشک</span><strong>دکتر ${escapeHtml(app.doctor_name || '—')}</strong></div><div class="nv-patient-detail-item"><span>تخصص</span><strong>${escapeHtml(app.specialty || 'چشم‌پزشکی')}</strong></div><div class="nv-patient-detail-item"><span>مرکز درمانی</span><strong>${escapeHtml(app.medical_center_name || 'ثبت نشده')}</strong></div><div class="nv-patient-detail-item"><span>خدمت</span><strong>${escapeHtml(app.service_name || 'ویزیت')}</strong></div><div class="nv-patient-detail-item"><span>تاریخ مراجعه</span><strong>${formatDate(app.appointment_date, true)}</strong></div><div class="nv-patient-detail-item"><span>ساعت</span><strong>${formatTime(app.appointment_time)}</strong></div><div class="nv-patient-detail-item"><span>نوع نوبت</span><strong>${escapeHtml(appointmentTypeLabel(app.type))}</strong></div><div class="nv-patient-detail-item"><span>مبلغ قابل پرداخت هنگام دریافت</span><strong>${formatMoney(app.online_payable_amount ?? app.amount)}</strong></div>${Number(app?.has_supplementary_insurance || 0) === 1 ? `<div class="nv-patient-detail-item"><span>بیمه تکمیلی</span><strong>${escapeHtml(app.insurance_provider || 'ثبت شده')}</strong></div><div class="nv-patient-detail-item"><span>وضعیت بیمه</span><strong>${escapeHtml(app.insurance_status === 'pending_review' ? 'در حال بررسی توسط کلینیک' : app.insurance_status || 'ثبت شده')}</strong></div><div class="nv-patient-detail-item"><span>مبلغ نهایی پس از بررسی بیمه</span><strong>${formatMoney(app.remaining_amount || 0)}</strong></div>` : ''}<div class="nv-patient-detail-item"><span>وضعیت نوبت</span><div class="tw-mt-2">${badge(app.status)}</div></div><div class="nv-patient-detail-item"><span>وضعیت پرداخت</span><div class="tw-mt-2">${paymentBadge(payStatus)}</div></div><div class="nv-patient-detail-item"><span>روش پرداخت</span><strong>${escapeHtml(paymentMethodLabel(app.payment_method))}</strong></div><div class="nv-patient-detail-item"><span>شماره رسید</span><strong>${escapeHtml(app.payment_receipt_number || 'ثبت نشده')}</strong></div><div class="nv-patient-detail-item"><span>تاریخ پرداخت</span><strong>${paymentDateTimeValue(app) ? formatDateTime(paymentDateTimeValue(app)) : 'ثبت نشده'}</strong></div><div class="nv-patient-detail-item"><span>شماره پیگیری</span><strong>${escapeHtml(app.payment_reference || app.tracking_code || 'ثبت نشده')}</strong></div><div class="nv-patient-detail-item tw-col-span-full"><span>شرح مراجعه</span><p class="tw-mt-2 tw-whitespace-pre-wrap tw-text-sm tw-leading-7 tw-text-slate-700">${multiline(app.reason)}</p></div>${canPayAppointment(app) ? `<div class="tw-col-span-full"><a class="noor-tw-btn-primary tw-w-full sm:tw-w-auto" href="test-payment.html?appointment_id=${Number(app.id)}"><i class="icon-credit-card"></i> پرداخت این نوبت</a></div>` : ''}</div>`;
    const cancelButton = qs('[data-modal-cancel-appointment]', modal);
    if (cancelButton) {
      cancelButton.classList.toggle('tw-hidden', !canCancel(app));
      cancelButton.dataset.appointmentCancel = app.id;
    }
  }

  function appointmentTypeLabel(type) {
    return ({ regular: 'ویزیت عادی', follow_up: 'پیگیری درمان', followup: 'پیگیری درمان', consultation: 'مشاوره' })[type] || text(type) || 'ویزیت عادی';
  }

  async function initDashboard() {
    pageLoading();
    try {
      const [statsResult, appointmentsResult, profileResult, prescriptionsResult] = await Promise.allSettled([
        api('/patient/stats'),
        api('/patient/appointments?page=1&limit=50'),
        api('/patient/profile'),
        api('/patient/prescriptions')
      ]);

      const stats = statsResult.status === 'fulfilled' ? (statsResult.value.stats || {}) : {};
      const appointments = appointmentsResult.status === 'fulfilled' ? (appointmentsResult.value.appointments || []) : [];
      const profile = profileResult.status === 'fulfilled' ? (profileResult.value.patient || {}) : {};
      const prescriptions = prescriptionsResult.status === 'fulfilled' ? (prescriptionsResult.value.prescriptions || []) : [];
      state.appointments = appointments;

      const upcoming = appointments
        .filter(app => ['pending', 'confirmed'].includes(app.status) && appointmentDate(app) >= new Date())
        .sort((a, b) => appointmentDate(a) - appointmentDate(b));
      const next = upcoming[0];
      const recent = [...appointments].sort((a, b) => appointmentDate(b) - appointmentDate(a)).slice(0, 5);
      const profileFields = ['full_name', 'phone', 'email', 'birth_date', 'gender', 'address', 'emergency_contact_name', 'emergency_contact_phone'];
      const completedFields = profileFields.filter(field => text(profile[field])).length;
      const profilePercent = Math.round((completedFields / profileFields.length) * 100);

      root.innerHTML = `<div class="tw-space-y-6">
        <section class="tw-overflow-hidden tw-rounded-noor tw-bg-gradient-to-l tw-from-noor-900 tw-via-noor-700 tw-to-sky-500 tw-p-6 tw-text-white tw-shadow-noor sm:tw-p-8">
          <div class="tw-grid tw-gap-6 xl:tw-grid-cols-[minmax(0,1.7fr)_minmax(280px,.8fr)] xl:tw-items-center">
            <div><span class="tw-inline-flex tw-items-center tw-gap-2 tw-rounded-full tw-bg-white/15 tw-px-3 tw-py-1.5 tw-text-xs tw-font-bold tw-ring-1 tw-ring-white/20"><i class="icon-user"></i> پنل زیباجو</span><h2 class="tw-mt-4 tw-text-2xl tw-font-black sm:tw-text-4xl">سلام، <span data-nv-user-name>${escapeHtml(profile.full_name || 'کاربر گرامی')}</span></h2><p class="tw-mt-3 tw-max-w-2xl tw-text-sm tw-leading-8 tw-text-sky-100">نوبت‌ها، سوابق و نسخه‌های خود را یکجا مدیریت کنید و به خدمات درمانی موردنیاز سریع‌تر دسترسی داشته باشید.</p><div class="tw-mt-5 tw-flex tw-flex-wrap tw-gap-3"><a class="nv-patient-primary-cta tw-inline-flex tw-items-center tw-justify-center tw-gap-2 tw-rounded-xl tw-px-5 tw-py-3 tw-text-sm tw-font-black tw-shadow-lg" href="appointments.html#book"><i class="icon-calendar"></i> دریافت نوبت جدید</a><a class="tw-inline-flex tw-items-center tw-justify-center tw-gap-2 tw-rounded-xl tw-bg-white/10 tw-px-5 tw-py-3 tw-text-sm tw-font-bold tw-text-white tw-ring-1 tw-ring-white/25 hover:tw-bg-white/20" href="medical-records.html"><i class="icon-file-text"></i> مشاهده پرونده پزشکی</a></div></div>
            <div class="tw-rounded-3xl tw-bg-white/10 tw-p-5 tw-ring-1 tw-ring-white/20 tw-backdrop-blur"><div class="tw-flex tw-items-center tw-justify-between"><div><span class="tw-text-xs tw-font-bold tw-text-sky-100">تکمیل پرونده سلامت</span><strong class="tw-mt-2 tw-block tw-text-3xl tw-font-black">${toFa(profilePercent)}٪</strong></div><span class="tw-flex tw-h-14 tw-w-14 tw-items-center tw-justify-center tw-rounded-2xl tw-bg-white/15 tw-text-xl"><i class="icon-user"></i></span></div><div class="tw-mt-4 tw-h-2 tw-overflow-hidden tw-rounded-full tw-bg-white/20"><span class="tw-block tw-h-full tw-rounded-full tw-bg-white" style="width:${profilePercent}%"></span></div><a class="tw-mt-4 tw-inline-flex tw-items-center tw-gap-2 tw-text-xs tw-font-bold tw-text-white hover:tw-underline" href="profile.html">تکمیل اطلاعات برای خدمات دقیق‌تر <i class="icon-chevron-left"></i></a></div>
          </div>
        </section>

        ${next ? `<section class="nv-tw-card"><div class="tw-grid tw-gap-5 tw-p-5 md:tw-grid-cols-[auto_minmax(0,1fr)_auto] md:tw-items-center sm:tw-p-6"><span class="tw-flex tw-h-16 tw-w-16 tw-items-center tw-justify-center tw-rounded-2xl tw-bg-emerald-50 tw-text-2xl tw-text-emerald-700"><i class="icon-calendar-check-o"></i></span><div><div class="tw-flex tw-flex-wrap tw-items-center tw-gap-2"><span class="tw-text-xs tw-font-black tw-text-emerald-700">نوبت بعدی</span>${badge(next.status)}</div><h3 class="tw-mt-2 tw-text-xl tw-font-black tw-text-clinic-ink">${formatDate(next.appointment_date, true)}، ساعت ${formatTime(next.appointment_time)}</h3><p class="tw-mt-2 tw-text-sm tw-text-slate-500">دکتر ${escapeHtml(next.doctor_name || '—')} · ${escapeHtml(next.specialty || 'چشم‌پزشکی')}</p></div><button type="button" class="noor-tw-btn-secondary" data-appointment-view="${Number(next.id)}"><i class="icon-eye"></i> جزئیات نوبت</button></div></section>` : `<section class="tw-rounded-noor tw-border tw-border-dashed tw-border-noor-200 tw-bg-noor-50 tw-p-6"><div class="tw-flex tw-flex-col tw-gap-4 sm:tw-flex-row sm:tw-items-center sm:tw-justify-between"><div><h3 class="tw-text-lg tw-font-black tw-text-noor-900">نوبت آینده‌ای ثبت نشده است</h3><p class="tw-mt-2 tw-text-sm tw-leading-7 tw-text-noor-700">از بخش دریافت نوبت، پزشک و زمان مناسب را انتخاب کنید.</p></div><a class="noor-tw-btn-primary" href="appointments.html#book"><i class="icon-plus"></i> دریافت نوبت</a></div></section>`}

        <section class="tw-grid tw-grid-cols-1 tw-gap-4 sm:tw-grid-cols-2 xl:tw-grid-cols-4">
          ${statCard('icon-calendar', 'کل نوبت‌ها', stats.total_appointments || appointments.length, 'تمام نوبت‌های ثبت‌شده')}
          ${statCard('icon-calendar-check-o', 'نوبت‌های آینده', stats.upcoming_appointments || upcoming.length, 'نوبت‌های فعال پیش‌رو', 'emerald')}
          ${statCard('icon-file-text', 'سوابق پزشکی', stats.medical_records || 0, 'گزارش‌های ثبت‌شده', 'violet')}
          ${statCard('icon-medkit', 'نسخه‌ها', prescriptions.length, 'نسخه‌های قابل مشاهده', 'amber')}
        </section>

        <section class="tw-grid tw-gap-6 xl:tw-grid-cols-[minmax(0,1.8fr)_minmax(300px,.8fr)]">
          <article class="nv-tw-card nv-pd-recent-section"><header class="nv-tw-card-header"><div><h2 class="tw-text-lg tw-font-black tw-text-clinic-ink">آخرین نوبت‌ها</h2><p class="tw-mt-1 tw-text-sm tw-text-slate-500">مرور سریع وضعیت مراجعه‌های شما</p></div><a class="noor-tw-btn-secondary" href="appointments.html">همه نوبت‌ها <i class="icon-chevron-left"></i></a></header><div class="nv-tw-card-body">${recent.length ? `<div class="nv-patient-desktop-only"><div class="nv-tw-table-wrap"><table class="nv-tw-table"><thead><tr><th>زمان مراجعه</th><th>پزشک</th><th>وضعیت نوبت</th><th>وضعیت پرداخت</th><th>هزینه</th></tr></thead><tbody>${recent.map(dashboardAppointmentRow).join('')}</tbody></table></div></div><div class="nv-patient-mobile-only nv-pd-recent-list">${recent.map(dashboardAppointmentMobileCard).join('')}</div>` : emptyState('هنوز نوبتی ندارید', 'اولین نوبت خود را از همین پنل دریافت کنید.', '<a class="noor-tw-btn-primary tw-mt-4" href="appointments.html#book">دریافت نوبت</a>')}</div></article>
          <aside class="tw-space-y-6"><article class="nv-tw-card"><header class="nv-tw-card-header"><div><h2 class="tw-text-lg tw-font-black tw-text-clinic-ink">دسترسی سریع</h2><p class="tw-mt-1 tw-text-sm tw-text-slate-500">کارهای پرکاربرد شما</p></div></header><div class="nv-tw-card-body tw-space-y-3"><a class="nv-tw-quick-link" href="appointments.html#book"><span class="tw-flex tw-items-center tw-gap-3"><span class="nv-tw-quick-link-icon"><i class="icon-calendar"></i></span>دریافت نوبت</span><i class="icon-chevron-left tw-text-slate-400"></i></a><a class="nv-tw-quick-link" href="prescriptions.html"><span class="tw-flex tw-items-center tw-gap-3"><span class="nv-tw-quick-link-icon"><i class="icon-medkit"></i></span>نسخه‌های من</span><i class="icon-chevron-left tw-text-slate-400"></i></a><a class="nv-tw-quick-link" href="payments.html"><span class="tw-flex tw-items-center tw-gap-3"><span class="nv-tw-quick-link-icon"><i class="icon-credit-card"></i></span>پرداخت‌ها</span><i class="icon-chevron-left tw-text-slate-400"></i></a><a class="nv-tw-quick-link" href="profile.html"><span class="tw-flex tw-items-center tw-gap-3"><span class="nv-tw-quick-link-icon"><i class="icon-user"></i></span>اطلاعات سلامت</span><i class="icon-chevron-left tw-text-slate-400"></i></a></div></article><article class="tw-rounded-noor tw-border tw-border-amber-200 tw-bg-amber-50 tw-p-5"><div class="tw-flex tw-gap-3"><span class="tw-flex tw-h-10 tw-w-10 tw-flex-none tw-items-center tw-justify-center tw-rounded-xl tw-bg-white tw-text-amber-700"><i class="icon-info"></i></span><div><h3 class="tw-text-sm tw-font-black tw-text-amber-900">یادآوری پزشکی</h3><p class="tw-mt-2 tw-text-xs tw-leading-7 tw-text-amber-800">اطلاعات این پنل برای مشاهده سوابق است و جایگزین ارزیابی یا توصیه مستقیم پزشک نیست.</p></div></div></article></aside>
        </section>
      </div>${modalMarkup('appointmentDetailModal', 'جزئیات نوبت', true)}${cancelModalMarkup()}`;

      bindAppointmentActions();
      qs('[data-modal-cancel-appointment]')?.addEventListener('click', event => {
        const id = Number(event.currentTarget.dataset.appointmentCancel);
        closeModal('appointmentDetailModal');
        confirmCancellation(id, event.currentTarget);
      });
      qs('[data-confirm-cancel]')?.addEventListener('click', event => performCancellation(event.currentTarget));
    } catch (error) { errorState(error, initDashboard); }
  }

  function modalMarkup(id, title, allowCancel = false) {
    return `<div id="${id}" class="nv-patient-modal tw-hidden" data-modal role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="${id}Title"><div class="nv-patient-modal-panel"><header class="tw-flex tw-items-center tw-justify-between tw-gap-4 tw-border-b tw-border-slate-100 tw-p-5"><div><h2 id="${id}Title" class="tw-text-lg tw-font-black tw-text-clinic-ink" data-modal-title>${escapeHtml(title)}</h2><p class="tw-mt-1 tw-text-xs tw-text-slate-500">اطلاعات محرمانه حساب زیباجو</p></div><button type="button" class="nv-tw-icon-btn" data-modal-close aria-label="بستن پنجره"><i class="icon-close"></i></button></header><div class="tw-max-h-[65vh] tw-overflow-y-auto tw-p-5" data-modal-content></div><footer class="tw-flex tw-flex-wrap tw-justify-end tw-gap-3 tw-border-t tw-border-slate-100 tw-bg-slate-50 tw-p-4">${allowCancel ? '<button type="button" class="tw-hidden tw-inline-flex tw-items-center tw-justify-center tw-gap-2 tw-rounded-xl tw-bg-rose-600 tw-px-4 tw-py-2.5 tw-text-sm tw-font-bold tw-text-white hover:tw-bg-rose-700" data-modal-cancel-appointment><i class="icon-close"></i> لغو نوبت</button>' : ''}<button type="button" class="noor-tw-btn-secondary" data-modal-close>بستن</button></footer></div></div>`;
  }

  function bindAppointmentActions(scope = document) {
    qsa('[data-appointment-view]', scope).forEach(button => button.addEventListener('click', () => {
      const app = state.appointments.find(item => Number(item.id) === Number(button.dataset.appointmentView));
      if (!app) return;
      renderAppointmentDetails(app);
      openModal('appointmentDetailModal', button);
    }));
    qsa('[data-appointment-pay]', scope).forEach(button => button.addEventListener('click', () => {
      window.location.href = `test-payment.html?appointment_id=${Number(button.dataset.appointmentPay)}`;
    }));
    qsa('[data-appointment-cancel]', scope).forEach(button => button.addEventListener('click', () => confirmCancellation(Number(button.dataset.appointmentCancel), button)));
  }

  function confirmCancellation(id, trigger) {
    const app = state.appointments.find(item => Number(item.id) === Number(id));
    if (!app || !canCancel(app)) {
      showToast('این نوبت در حال حاضر قابل لغو نیست. لغو آنلاین فقط تا ۲۴ ساعت پیش از مراجعه امکان‌پذیر است.', 'warning');
      return;
    }
    const modal = document.getElementById('cancelAppointmentModal');
    if (!modal) return;
    modal.dataset.appointmentId = id;
    qs('[data-cancel-summary]', modal).innerHTML = `نوبت <strong>دکتر ${escapeHtml(app.doctor_name || '—')}</strong> در تاریخ <strong>${formatDate(app.appointment_date)}</strong> ساعت <strong>${formatTime(app.appointment_time)}</strong> لغو می‌شود.`;
    openModal('cancelAppointmentModal', trigger);
  }

  async function performCancellation(button) {
    const modal = document.getElementById('cancelAppointmentModal');
    const id = Number(modal?.dataset.appointmentId);
    if (!id) return;
    setButtonBusy(button, true, 'در حال لغو...');
    try {
      await api(`/patient/appointments/${id}/cancel`, { method: 'PUT' });
      closeModal(modal);
      if (modal) delete modal.dataset.appointmentId;
      clearAppointmentTransientState();
      showToast('نوبت با موفقیت لغو شد.', 'success');
      if (page === 'appointments') await loadAppointments();
      else await initDashboard();
    } catch (error) { showPatientError(error); }
    finally { setButtonBusy(button, false); }
  }

  async function initAppointments() {
    pageLoading('در حال بارگذاری نوبت‌ها...');
    try {
      root.innerHTML = `<div class="nv-pa-page nv-pa-appointments-only">
        <section class="nv-pa-hero-card">
          <span class="nv-pa-kicker"><i class="icon-calendar" aria-hidden="true"></i> دریافت و پیگیری مراجعه</span>
          <h2>نوبت‌های من</h2>
          <p>در این صفحه فقط نوبت‌های شما نمایش داده می‌شود. برای دریافت نوبت جدید از دکمه زیر استفاده کنید؛ چون وارد حساب خودتان شده‌اید، اطلاعات بیمار دوباره پرسیده نمی‌شود.</p>
          <div class="nv-pa-hero-actions">
            <button class="nv-pa-book-button" type="button" data-open-booking><i class="icon-plus" aria-hidden="true"></i><span>دریافت نوبت</span></button>
          </div>
        </section>
        <section class="nv-pa-card nv-pa-appointments-table-only" aria-labelledby="patientAppointmentsListTitle">
          <header class="nv-pa-card-head nv-pa-list-head">
            <div class="nv-pa-card-title"><h2 id="patientAppointmentsListTitle">جدول نوبت‌ها</h2><p><span data-total-count>—</span> نوبت ثبت‌شده؛ مشاهده، پرداخت و لغو از همین جدول انجام می‌شود.</p></div>
            <div class="nv-pa-list-tools">
              <label class="tw-sr-only" for="appointmentSearch">جستجوی نوبت</label>
              <div class="nv-pa-search"><i class="icon-search" aria-hidden="true"></i><input id="appointmentSearch" class="noor-tw-input" type="search" placeholder="نام پزشک یا تخصص"></div>
              <label class="tw-sr-only" for="appointmentStatusFilter">نمایش بر اساس وضعیت</label>
              <select id="appointmentStatusFilter" class="noor-tw-input"><option value="all">همه وضعیت‌ها</option><option value="pending">در انتظار</option><option value="confirmed">تأیید شده</option><option value="completed">انجام شده</option><option value="cancelled">لغو شده</option><option value="no_show">عدم حضور</option></select>
            </div>
          </header>
          <div class="nv-pa-card-body nv-pa-list-body"><div data-appointments-list>${emptyState('در حال بارگذاری نوبت‌ها', 'چند لحظه صبر کنید...')}</div><nav class="tw-flex tw-flex-wrap tw-items-center tw-justify-center tw-gap-2" data-pagination aria-label="صفحه‌بندی نوبت‌ها"></nav></div>
        </section>
      </div>${modalMarkup('appointmentDetailModal', 'جزئیات نوبت', true)}${cancelModalMarkup()}`;

      bindAppointmentPage();
      refreshUnifiedSelects();
      consumeAppointmentPageQuery();
      await loadAppointments();
      if (window.location.hash === '#book') setTimeout(() => qs('[data-open-booking]')?.click(), 100);
    } catch (error) { errorState(error, initAppointments); }
  }

  function cancelModalMarkup() {
    return `<div id="cancelAppointmentModal" class="nv-patient-modal tw-hidden" data-modal role="alertdialog" aria-modal="true" aria-hidden="true" aria-labelledby="cancelAppointmentTitle"><div class="nv-patient-modal-panel tw-max-w-lg"><div class="tw-p-6 tw-text-center"><span class="tw-mx-auto tw-flex tw-h-16 tw-w-16 tw-items-center tw-justify-center tw-rounded-2xl tw-bg-rose-50 tw-text-2xl tw-text-rose-700"><i class="icon-warning"></i></span><h2 id="cancelAppointmentTitle" class="tw-mt-4 tw-text-xl tw-font-black tw-text-clinic-ink">لغو نوبت</h2><p class="tw-mt-3 tw-text-sm tw-leading-7 tw-text-slate-600" data-cancel-summary></p><p class="tw-mt-3 tw-rounded-xl tw-bg-amber-50 tw-p-3 tw-text-xs tw-leading-6 tw-text-amber-800">لغو آنلاین فقط تا ۲۴ ساعت قبل از زمان مراجعه امکان‌پذیر است.</p><div class="tw-mt-6 tw-flex tw-flex-col-reverse tw-gap-3 sm:tw-flex-row sm:tw-justify-center"><button type="button" class="noor-tw-btn-secondary" data-modal-close>انصراف</button><button type="button" class="tw-inline-flex tw-items-center tw-justify-center tw-gap-2 tw-rounded-xl tw-bg-rose-600 tw-px-5 tw-py-2.5 tw-text-sm tw-font-bold tw-text-white hover:tw-bg-rose-700" data-confirm-cancel><i class="icon-close"></i> بله، لغو شود</button></div></div></div></div>`;
  }

  function bindAppointmentPage() {
    bindJalaliDatePickers(root);
    const status = qs('#appointmentStatusFilter');
    const search = qs('#appointmentSearch');
    status?.addEventListener('change', () => { state.currentPage = 1; loadAppointments(); });
    search?.addEventListener('input', renderAppointments);

    const doctor = qs('#doctorId');
    const service = qs('#appointmentServiceId');
    const date = qs('#appointmentDateIso');
    doctor?.addEventListener('change', async () => {
      await updateDoctorSummary();
      await loadDoctorServices();
      updateBookingSubmitState();
    });
    service?.addEventListener('change', async () => {
      syncAppointmentTypeFromService();
      await loadAvailableDates();
      updateBookingSubmitState();
    });
    date?.addEventListener('change', async () => {
      await loadSlots();
      updateBookingSubmitState();
      if (state.bookingSlots.length === 1 && qs('#appointmentTime')?.value) revealBookingPayment();
      else revealBookingStep('.nv-pa-booking-time-step', qs('[data-booking-slot]'));
    });
    qs('#appointmentTime')?.addEventListener('change', () => {
      updateSelectedSlotSummary();
      updateBookingSubmitState();
      if (qs('#appointmentTime')?.value) revealBookingPayment();
    });

    const reason = qs('#appointmentReason');
    reason?.addEventListener('input', () => { qs('[data-reason-count]').textContent = `${toFa(reason.value.length)} / ۱۰۰۰`; });
    qs('#appointmentHasSupplementaryInsurance')?.addEventListener('change', syncBookingInsuranceFields);
    qsa('#appointmentInsuranceProvider, #appointmentInsuranceNumber, #appointmentInsuranceNote').forEach(el => el.addEventListener('input', syncBookingInsuranceFields));

    qs('#appointmentBookingForm')?.addEventListener('submit', submitAppointment);
    qs('[data-confirm-cancel]')?.addEventListener('click', event => performCancellation(event.currentTarget));
    qs('[data-modal-cancel-appointment]')?.addEventListener('click', event => {
      const id = Number(event.currentTarget.dataset.appointmentCancel);
      closeModal('appointmentDetailModal');
      confirmCancellation(id, event.currentTarget);
    });
  }

  function bookingVisibleControl(control) {
    if (!control) return null;
    const wrapper = control.closest?.('.nvps-select, .nv-pselect');
    return wrapper?.querySelector?.('.nvps-trigger, .nv-pselect-trigger') || control;
  }

  function revealBookingStep(sectionOrSelector, controlOrSelector = null) {
    const section = typeof sectionOrSelector === 'string' ? qs(sectionOrSelector) : sectionOrSelector;
    if (!section) return;
    const requestedControl = typeof controlOrSelector === 'string'
      ? qs(controlOrSelector, section) || qs(controlOrSelector)
      : controlOrSelector;
    const control = bookingVisibleControl(requestedControl || qs('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])', section));
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    requestAnimationFrame(() => {
      section.classList.remove('nv-pa-step-attention');
      void section.offsetWidth;
      section.classList.add('nv-pa-step-attention');
      section.scrollIntoView?.({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center', inline: 'nearest' });
      window.setTimeout(() => {
        try { control?.focus?.({ preventScroll: true }); } catch (_) { control?.focus?.(); }
      }, reducedMotion ? 0 : 260);
      window.setTimeout(() => section.classList.remove('nv-pa-step-attention'), 1400);
    });
  }

  function revealBookingPayment() {
    const footer = qs('.nv-pa-book-footer');
    revealBookingStep(footer, qs('.nv-pa-submit', footer));
  }

  async function loadDoctors() {
    const select = qs('#doctorId');
    if (!select) return;
    try {
      const result = await api('/patient/doctors');
      state.doctors = result.doctors || [];
      select.innerHTML = `<option value="">یک پزشک را انتخاب کنید</option>${state.doctors.map(doctor => `<option value="${Number(doctor.id)}">دکتر ${escapeHtml(doctor.full_name || 'بدون نام')} — ${escapeHtml(doctor.specialty || 'چشم‌پزشکی')}</option>`).join('')}`;
      if (!state.doctors.length) select.innerHTML = '<option value="">پزشک فعالی برای دریافت وجود ندارد</option>';
      syncProfessionalSelect(select);
      if (state.doctors.length === 1) {
        select.value = String(state.doctors[0].id);
        syncProfessionalSelect(select);
        await updateDoctorSummary();
        await loadDoctorServices();
      }
    } catch (error) {
      select.innerHTML = '<option value="">دریافت فهرست پزشکان ممکن نشد</option>';
      showPatientError(error);
      syncProfessionalSelect(select);
    }
  }

  function renderGuidedPlaceholder(container, icon, message) {
    if (!container) return;
    container.innerHTML = `<div class="nv-pa-guided-placeholder"><i class="${escapeHtml(icon)}" aria-hidden="true"></i><span>${escapeHtml(message)}</span></div>`;
  }

  function resetBookingSlotOptions(message = 'پس از انتخاب روز، ساعت‌های خالی اینجا نمایش داده می‌شوند.') {
    state.bookingSlots = [];
    const time = qs('#appointmentTime');
    if (time) {
      time.disabled = true;
      time.value = '';
      time.innerHTML = `<option value="">${escapeHtml(message)}</option>`;
    }
    renderGuidedPlaceholder(qs('[data-booking-slots]'), 'icon-clock-o', message);
    updateSelectedSlotSummary();
  }

  function resetBookingDateAndSlots(message = 'ابتدا پزشک و خدمت درخواستی را انتخاب کنید') {
    state.bookingSlots = [];
    state.availableDates = [];
    state.availableDateSet = new Set();
    state.bookingMonthKey = '';
    const hidden = qs('#appointmentDateIso');
    if (hidden) hidden.value = '';
    const dayWrap = qs('[data-booking-days-wrap]');
    if (dayWrap) dayWrap.hidden = true;
    renderGuidedPlaceholder(qs('[data-booking-months]'), 'icon-info', message);
    renderGuidedPlaceholder(qs('[data-booking-days]'), 'icon-calendar', 'پس از انتخاب یک ماه دارای نوبت، روزها نمایش داده می‌شوند.');
    resetBookingSlotOptions('پس از انتخاب روز، ساعت‌های خالی اینجا نمایش داده می‌شوند.');
    const selectedFee = qs('[data-selected-fee]');
    if (selectedFee) selectedFee.textContent = 'پس از انتخاب نوبت';
    updateBookingSubmitState();
  }

  function appointmentTypeForService(service) {
    const haystack = `${service?.name || ''} ${service?.slug || ''} ${service?.category || ''}`.toLocaleLowerCase('fa');
    if (/پیگیری|follow/.test(haystack)) return 'follow_up';
    if (/مشاوره|consult/.test(haystack)) return 'consultation';
    if (/جراح|عمل|surg/.test(haystack)) return 'surgery';
    if (/اورژانس|emergency/.test(haystack)) return 'emergency';
    return 'regular';
  }

  function syncAppointmentTypeFromService() {
    const serviceId = Number(qs('#appointmentServiceId')?.value || 0);
    const service = state.bookingServices.find(item => Number(item.id) === serviceId);
    const hidden = qs('#appointmentType');
    if (hidden) hidden.value = appointmentTypeForService(service);
    const summary = qs('[data-service-summary]');
    if (!summary) return;
    if (!service) {
      summary.textContent = 'خدمت موردنظر را انتخاب کنید.';
      return;
    }
    const fee = Number(service.minimum_fee || 0);
    const duration = Number(service.default_duration_minutes || 0);
    summary.textContent = `${service.description || service.category || service.name || 'خدمت انتخاب‌شده'}${duration ? ` · حدود ${toFa(duration)} دقیقه` : ''}${service.is_free ? ' · رایگان' : fee > 0 ? ` · از ${formatMoney(fee)}` : ''}`;
  }

  async function loadDoctorServices() {
    const doctorId = Number(qs('#doctorId')?.value || 0);
    const select = qs('#appointmentServiceId');
    state.bookingServices = [];
    resetBookingDateAndSlots();
    if (!select) return;
    if (!doctorId) {
      select.disabled = true;
      select.innerHTML = '<option value="">ابتدا پزشک را انتخاب کنید</option>';
      syncProfessionalSelect(select);
      syncAppointmentTypeFromService();
      return;
    }
    select.disabled = true;
    select.innerHTML = '<option value="">در حال دریافت خدمات پزشک...</option>';
    syncProfessionalSelect(select);
    try {
      const result = await api(`/patient/doctors/${doctorId}/services`);
      state.bookingServices = Array.isArray(result.services) ? result.services : [];
      select.innerHTML = state.bookingServices.length
        ? `<option value="">خدمت موردنظر را انتخاب کنید</option>${state.bookingServices.map(service => `<option value="${Number(service.id)}">${escapeHtml(service.name)}${service.category ? ` — ${escapeHtml(service.category)}` : ''}</option>`).join('')}`
        : '<option value="">برای این پزشک خدمت فعالی تعریف نشده است</option>';
      select.disabled = !state.bookingServices.length;
      syncProfessionalSelect(select);
      if (state.bookingServices.length === 1) {
        select.value = String(state.bookingServices[0].id);
        syncProfessionalSelect(select);
        syncAppointmentTypeFromService();
        await loadAvailableDates();
      } else if (state.bookingServices.length > 1) {
        revealBookingStep(select.closest('.nv-pa-field'), select);
      }
    } catch (error) {
      select.innerHTML = '<option value="">دریافت خدمات پزشک ممکن نشد</option>';
      showPatientError(error);
      syncProfessionalSelect(select);
    }
    updateBookingSubmitState();
  }

  function bookingMonthKey(year, month) {
    return `${Number(year)}-${String(Number(month)).padStart(2, '0')}`;
  }

  function bookingMonthSequence(count = 12) {
    const current = persianDateParts(parseIsoDate(isoToday()) || new Date());
    return Array.from({ length: count }, (_, index) => {
      const zeroBased = (current.month - 1) + index;
      const year = current.year + Math.floor(zeroBased / 12);
      const month = (zeroBased % 12) + 1;
      return {
        year,
        month,
        key: bookingMonthKey(year, month),
        label: persianMonths[month - 1]
      };
    });
  }

  function bookingDateMeta(iso) {
    const date = parseIsoDate(iso);
    if (!date) return { year: 0, month: 0, day: 0, monthName: '', weekday: '' };
    const parts = persianDateParts(date);
    let weekday = '';
    try {
      weekday = new Intl.DateTimeFormat('fa-IR', { weekday: 'long' }).format(date);
    } catch (_) {}
    return {
      ...parts,
      monthName: persianMonths[parts.month - 1] || '',
      weekday
    };
  }

  function bookingDatesByMonth() {
    const groups = new Map();
    state.availableDates.forEach(item => {
      const iso = String(item?.date || '').slice(0, 10);
      const meta = bookingDateMeta(iso);
      if (!meta.year || !meta.month) return;
      const key = bookingMonthKey(meta.year, meta.month);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ ...item, date: iso, meta });
    });
    groups.forEach(items => items.sort((a, b) => a.date.localeCompare(b.date)));
    return groups;
  }

  function clearSelectedBookingDate() {
    const hidden = qs('#appointmentDateIso');
    if (hidden) hidden.value = '';
    resetBookingSlotOptions('پس از انتخاب روز، ساعت‌های خالی اینجا نمایش داده می‌شوند.');
    updateBookingSubmitState();
  }

  function renderBookingDays(groups = bookingDatesByMonth()) {
    const wrap = qs('[data-booking-days-wrap]');
    const container = qs('[data-booking-days]');
    const label = qs('[data-selected-month-label]');
    if (!wrap || !container) return false;
    const items = groups.get(state.bookingMonthKey) || [];
    const descriptor = bookingMonthSequence(12).find(item => item.key === state.bookingMonthKey);
    wrap.hidden = false;
    if (label && descriptor) {
      label.textContent = `${descriptor.label} ${toFa(descriptor.year)}؛ فقط روزهای دارای نوبت نمایش داده شده‌اند.`;
    }
    if (!items.length) {
      renderGuidedPlaceholder(container, 'icon-info', 'در این ماه نوبت خالی وجود ندارد؛ ماه دیگری را انتخاب کنید.');
      return false;
    }
    const selectedIso = qs('#appointmentDateIso')?.value || '';
    container.innerHTML = items.map(item => {
      const selected = item.date === selectedIso;
      const capacity = Number(item.remaining_capacity || item.slots_count || 0);
      return `<button type="button" class="nv-pa-day-option${selected ? ' is-selected' : ''}" data-booking-date="${item.date}" aria-pressed="${selected ? 'true' : 'false'}">
        <span class="nv-pa-day-weekday">${escapeHtml(item.meta.weekday || 'روز مراجعه')}</span>
        <span class="nv-pa-day-date"><strong>${toFa(item.meta.day)}</strong><span>${escapeHtml(item.meta.monthName)}</span></span>
        <span class="nv-pa-day-details">${toFa(item.slots_count || 0)} نوبت خالی · اولین ساعت ${formatTime(item.first_time)}</span>
        <span class="nv-pa-day-capacity">${toFa(capacity)} ظرفیت</span>
      </button>`;
    }).join('');

    const buttons = qsa('[data-booking-date]', container);
    buttons.forEach(button => button.addEventListener('click', () => {
      const hidden = qs('#appointmentDateIso');
      if (!hidden) return;
      hidden.value = button.dataset.bookingDate || '';
      buttons.forEach(item => {
        const selected = item === button;
        item.classList.toggle('is-selected', selected);
        item.setAttribute('aria-pressed', String(selected));
      });
      hidden.dispatchEvent(new Event('change', { bubbles: true }));
    }));

    const shouldAutoSelect = items.length === 1 && !selectedIso;
    if (shouldAutoSelect) {
      window.setTimeout(() => buttons[0]?.click(), 40);
      return true;
    }
    revealBookingStep(wrap, buttons[0]);
    return false;
  }

  function renderBookingMonths() {
    const container = qs('[data-booking-months]');
    if (!container) return;
    const groups = bookingDatesByMonth();
    const months = bookingMonthSequence(12);
    const availableMonths = months.filter(item => (groups.get(item.key) || []).length > 0);
    const currentIsValid = availableMonths.some(item => item.key === state.bookingMonthKey);
    if (!currentIsValid) state.bookingMonthKey = availableMonths.length === 1 ? availableMonths[0].key : '';

    container.innerHTML = months.map(item => {
      const dates = groups.get(item.key) || [];
      const enabled = dates.length > 0;
      const selected = enabled && item.key === state.bookingMonthKey;
      const totalSlots = dates.reduce((sum, date) => sum + Number(date.slots_count || 0), 0);
      return `<button type="button" class="nv-pa-month-option${enabled ? ' has-appointments' : ' is-disabled'}${selected ? ' is-selected' : ''}" data-booking-month="${item.key}" ${enabled ? '' : 'disabled'} aria-pressed="${selected ? 'true' : 'false'}">
        <span class="nv-pa-month-name">${escapeHtml(item.label)}</span>
        <span class="nv-pa-month-year">${toFa(item.year)}</span>
        <span class="nv-pa-month-count">${enabled ? `${toFa(dates.length)} روز · ${toFa(totalSlots)} نوبت خالی` : 'بدون نوبت'}</span>
      </button>`;
    }).join('');

    const enabledButtons = qsa('[data-booking-month]:not([disabled])', container);
    enabledButtons.forEach(button => button.addEventListener('click', () => {
      state.bookingMonthKey = button.dataset.bookingMonth || '';
      clearSelectedBookingDate();
      qsa('[data-booking-month]', container).forEach(item => {
        const selected = item === button;
        item.classList.toggle('is-selected', selected);
        item.setAttribute('aria-pressed', String(selected));
      });
      renderBookingDays(groups);
    }));

    if (state.bookingMonthKey) {
      renderBookingDays(groups);
    } else if (availableMonths.length) {
      const wrap = qs('[data-booking-days-wrap]');
      if (wrap) wrap.hidden = true;
      revealBookingStep(container.closest('.nv-pa-date-stage') || container, enabledButtons[0]);
    } else {
      const wrap = qs('[data-booking-days-wrap]');
      if (wrap) wrap.hidden = false;
      renderGuidedPlaceholder(qs('[data-booking-days]'), 'icon-info', 'در ۱۲ ماه آینده نوبت خالی ثبت نشده است.');
    }
  }

  async function fetchAvailableDatesWindow(doctorId, serviceId, from, to) {
    const result = await api(`/patient/available-dates?doctor_id=${encodeURIComponent(doctorId)}&service_id=${encodeURIComponent(serviceId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    return Array.isArray(result.available_dates) ? result.available_dates : [];
  }

  async function loadAvailableDates() {
    const doctorId = Number(qs('#doctorId')?.value || 0);
    const serviceId = Number(qs('#appointmentServiceId')?.value || 0);
    resetBookingDateAndSlots();
    const help = qs('[data-date-help]');
    if (!doctorId || !serviceId) {
      if (help) help.textContent = 'پس از انتخاب پزشک و خدمت، ماه‌های دارای نوبت مشخص می‌شوند.';
      return;
    }
    if (help) help.textContent = 'در حال بررسی نوبت‌های ۱۲ ماه آینده...';
    renderGuidedPlaceholder(qs('[data-booking-months]'), 'icon-clock-o', 'در حال دریافت ماه‌های دارای نوبت...');
    try {
      const items = await fetchAvailableDatesWindow(doctorId, serviceId, isoToday(), isoAfterDays(370));
      const merged = new Map();
      items.forEach(item => {
        const date = String(item?.date || '').slice(0, 10);
        if (date) merged.set(date, { ...item, date });
      });
      state.availableDates = Array.from(merged.values()).sort((a, b) => a.date.localeCompare(b.date));
      state.availableDateSet = new Set(state.availableDates.map(item => item.date));
      const enabled = state.availableDates.length > 0;
      if (help) help.textContent = enabled
        ? `${toFa(state.availableDates.length)} روز دارای نوبت پیدا شد. ابتدا ماه آبی و سپس روز مناسب را انتخاب کنید.`
        : 'در ۱۲ ماه آینده برای این خدمت نوبت خالی وجود ندارد؛ پزشک یا خدمت دیگری انتخاب کنید.';
      renderBookingMonths();
    } catch (error) {
      renderGuidedPlaceholder(qs('[data-booking-months]'), 'icon-warning', 'دریافت ماه‌های دارای نوبت ممکن نشد.');
      if (help) help.textContent = friendlyErrorMessage(error);
      showPatientError(error);
    }
    updateBookingSubmitState();
  }

  function updateBookingSubmitState() {
    const button = qs('#appointmentBookingForm .nv-pa-submit');
    if (!button || button.dataset.busy === 'true') return;
    const ready = Boolean(
      qs('#doctorId')?.value
      && qs('#appointmentServiceId')?.value
      && qs('#appointmentDateIso')?.value
      && qs('#appointmentTime')?.value
      && state.bookingSlots.some(item => Number(item.id) === Number(qs('#appointmentTime')?.value))
    );
    button.disabled = !ready;
    button.setAttribute('aria-disabled', String(!ready));
    button.title = ready ? 'پرداخت و ثبت نوبت' : 'ابتدا پزشک، خدمت، ماه، روز و ساعت را کامل کنید';
  }

  async function updateDoctorSummary() {
    const doctorId = Number(qs('#doctorId')?.value);
    const doctor = state.doctors.find(item => Number(item.id) === doctorId);
    qs('[data-selected-fee]').textContent = 'پس از انتخاب نوبت';
    const summary = qs('[data-doctor-summary]');
    if (!summary) return;
    if (!doctor) { summary.textContent = 'پس از انتخاب پزشک، هزینه و برنامه کاری نمایش داده می‌شود.'; return; }
    summary.textContent = `${doctor.specialty || 'چشم‌پزشکی'}${doctor.experience_years ? ` · ${toFa(doctor.experience_years)} سال سابقه` : ''}`;
    try {
      const result = await api(`/patient/doctors/${doctorId}/schedule`);
      const days = (result.schedules || []).map(item => dayLabel(item.day_of_week)).filter(Boolean);
      if (days.length) summary.textContent += ` · روزهای کاری: ${[...new Set(days)].join('، ')}`;
    } catch (_) {}
  }

  function dayLabel(day) {
    return ({ 0: 'شنبه', 1: 'یکشنبه', 2: 'دوشنبه', 3: 'سه‌شنبه', 4: 'چهارشنبه', 5: 'پنجشنبه', 6: 'جمعه' })[Number(day)] || '';
  }

  function updateSelectedSlotSummary() {
    const select = qs('#appointmentTime');
    const slot = state.bookingSlots.find(item => Number(item.id) === Number(select?.value));
    const fee = qs('[data-selected-fee]');
    const help = qs('[data-slot-help]');
    if (!slot) {
      if (fee) fee.textContent = 'پس از انتخاب نوبت';
      return;
    }
    const insurance = bookingInsuranceInput();
    const payment = calculateInsurancePayable(slot.amount, slot, insurance.has);
    if (fee) fee.textContent = Number(payment.payable || 0) > 0 ? formatMoney(payment.payable) : 'بدون پرداخت آنلاین';
    if (help) {
      const paymentText = payment.applied
        ? `مبلغ خدمت ${formatMoney(payment.original)} است. با ثبت بیمه تکمیلی، مبلغ قابل پرداخت الآن ${formatMoney(payment.payable)} می‌شود. مبلغ نهایی پس از بررسی بیمه در کلینیک مشخص می‌شود.`
        : Number(slot.amount || 0) > 0
          ? 'در مرحله بعد، مشخصات نوبت و مبلغ را تأیید می‌کنید.'
          : 'این نوبت رایگان است و پس از تأیید برای شما ثبت می‌شود.';
      help.textContent = `${slot.service_name || 'خدمت'} · ${slot.medical_center_name || 'مرکز درمانی'} · ${toFa(slot.remaining_capacity || 0)} ظرفیت خالی. ${paymentText}`;
    }
  }

  function renderBookingSlotOptions() {
    const container = qs('[data-booking-slots]');
    const select = qs('#appointmentTime');
    if (!container || !select) return;
    if (!state.bookingSlots.length) {
      renderGuidedPlaceholder(container, 'icon-info', 'برای این روز ساعت خالی وجود ندارد؛ روز دیگری را انتخاب کنید.');
      return;
    }
    const selectedId = Number(select.value || 0);
    container.innerHTML = state.bookingSlots.map(slot => {
      const selected = Number(slot.id) === selectedId;
      const feeText = Number(slot.amount || 0) > 0 ? formatMoney(slot.amount) : 'رایگان';
      const insuranceBadge = slot.supplementary_insurance_enabled ? '<small class="nv-pa-slot-insurance">بیمه تکمیلی</small>' : '';
      return `<button type="button" class="nv-pa-slot-option${selected ? ' is-selected' : ''}" data-booking-slot="${Number(slot.id)}" role="radio" aria-checked="${selected ? 'true' : 'false'}">
        <span class="nv-pa-slot-time">${formatTime(slot.start_time)} تا ${formatTime(slot.end_time)}</span>
        <span class="nv-pa-slot-center">${escapeHtml(slot.medical_center_name || 'مرکز درمانی')}</span>
        <span class="nv-pa-slot-meta"><span>${toFa(slot.remaining_capacity || 0)} ظرفیت</span><strong>${escapeHtml(feeText)}</strong>${insuranceBadge}</span>
      </button>`;
    }).join('');

    qsa('[data-booking-slot]', container).forEach(button => button.addEventListener('click', () => {
      select.value = button.dataset.bookingSlot || '';
      qsa('[data-booking-slot]', container).forEach(item => {
        const selected = item === button;
        item.classList.toggle('is-selected', selected);
        item.setAttribute('aria-checked', String(selected));
      });
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }));
  }

  async function loadSlots() {
    const doctorId = qs('#doctorId')?.value;
    const serviceId = qs('#appointmentServiceId')?.value;
    const date = qs('#appointmentDateIso')?.value;
    const select = qs('#appointmentTime');
    const help = qs('[data-slot-help]');
    state.bookingSlots = [];
    if (!select) return;
    if (!doctorId || !serviceId || !date) {
      select.disabled = true;
      select.value = '';
      select.innerHTML = '<option value="">ابتدا روز مراجعه را انتخاب کنید</option>';
      renderGuidedPlaceholder(qs('[data-booking-slots]'), 'icon-clock-o', 'پس از انتخاب روز، ساعت‌های خالی اینجا نمایش داده می‌شوند.');
      updateSelectedSlotSummary();
      updateBookingSubmitState();
      return;
    }
    select.disabled = true;
    select.value = '';
    select.innerHTML = '<option value="">در حال دریافت ساعت‌های خالی...</option>';
    renderGuidedPlaceholder(qs('[data-booking-slots]'), 'icon-clock-o', 'در حال دریافت ساعت‌های خالی این روز...');
    if (help) help.textContent = `در حال بررسی ساعت‌های خالی ${formatDate(date, true)}...`;
    try {
      const result = await api(`/patient/available-slots?doctor_id=${encodeURIComponent(doctorId)}&service_id=${encodeURIComponent(serviceId)}&date=${encodeURIComponent(date)}`);
      const slots = Array.isArray(result.available_slots) ? result.available_slots : [];
      state.bookingSlots = slots;
      select.innerHTML = slots.length
        ? `<option value="">یک ساعت را انتخاب کنید</option>${slots.map(slot => `<option value="${Number(slot.id)}">${formatTime(slot.start_time)} تا ${formatTime(slot.end_time)}</option>`).join('')}`
        : '<option value="">برای این روز ساعت خالی وجود ندارد</option>';
      select.disabled = !slots.length;
      if (slots.length === 1) select.value = String(slots[0].id);
      renderBookingSlotOptions();
      if (help) help.textContent = slots.length
        ? `${toFa(slots.length)} ساعت خالی برای ${formatDate(date, true)} وجود دارد.${slots.length === 1 ? ' تنها ساعت موجود به‌صورت خودکار انتخاب شد.' : ' ساعت مناسب را انتخاب کنید.'}`
        : 'برای این روز ساعت خالی باقی نمانده است؛ یک روز دیگر را انتخاب کنید.';
      updateSelectedSlotSummary();
      updateBookingSubmitState();
    } catch (error) {
      select.innerHTML = '<option value="">دریافت ساعت‌های خالی ممکن نشد</option>';
      renderGuidedPlaceholder(qs('[data-booking-slots]'), 'icon-warning', 'دریافت ساعت‌های خالی ممکن نشد.');
      if (help) help.textContent = friendlyErrorMessage(error);
      showPatientError(error);
    }
    updateBookingSubmitState();
  }

  async function submitAppointment(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const button = qs('[type="submit"]', form);
    const selectedSlotId = Number(qs('#appointmentTime')?.value || 0);
    const selectedSlot = state.bookingSlots.find(item => Number(item.id) === selectedSlotId);
    const insurance = bookingInsuranceInput();
    const payment = calculateInsurancePayable(selectedSlot?.amount, selectedSlot, insurance.has);
    const payload = {
      appointment_slot_id: selectedSlotId,
      type: qs('#appointmentType')?.value || 'regular',
      reason: qs('#appointmentReason').value.trim(),
      expected_amount: Number(payment.payable || 0),
      has_supplementary_insurance: insurance.has,
      insurance_provider: insurance.provider,
      insurance_number: insurance.number,
      insurance_note: insurance.note
    };
    if (!qs('#appointmentDateIso')?.value) {
      showToast('ابتدا ماه و سپس روز مراجعه را از روزهای دارای نوبت انتخاب کنید.', 'warning');
      qs('[data-booking-month]:not([disabled])')?.focus();
      return;
    }
    if (!selectedSlot) {
      showToast('یک ساعت خالی معتبر را انتخاب کنید.', 'warning');
      qs('[data-booking-slot]')?.focus();
      return;
    }
    button.dataset.busy = 'true';
    setButtonBusy(button, true, Number(payment.payable || 0) > 0 ? 'در حال انتقال به پرداخت...' : 'در حال ثبت نوبت...');
    try {
      const result = await api('/patient/appointments', { method: 'POST', body: payload });
      showToast(result.message || 'درخواست با موفقیت ثبت شد.', 'success');
      if (result.payment_required && result.payment_url) {
        window.location.assign(result.payment_url);
        return;
      }
      if (!result.payment_required && result.appointment_url) {
        window.location.assign(result.appointment_url);
        return;
      }
      await Promise.all([loadAppointmentStats(), loadAppointments()]);
    } catch (error) {
      showPatientError(error);
    } finally {
      setButtonBusy(button, false);
      button.dataset.busy = 'false';
      updateBookingSubmitState();
    }
  }

  async function loadAppointmentStats() {
    const container = qs('[data-appointment-stats]');
    if (!container) return;
    try {
      const result = await api('/patient/stats');
      const stats = result.stats || {};
      container.innerHTML = `${appointmentSummaryCard('icon-calendar', 'کل نوبت‌ها', stats.total_appointments || 0)}${appointmentSummaryCard('icon-check-circle', 'انجام‌شده', stats.completed_appointments || 0, 'emerald')}${appointmentSummaryCard('icon-clock-o', 'نوبت‌های آینده', stats.upcoming_appointments || 0, 'amber')}`;
    } catch (_) {}
  }

  async function loadAppointments() {
    const status = qs('#appointmentStatusFilter')?.value || 'all';
    const container = qs('[data-appointments-list]');
    if (container) container.innerHTML = `<div class="nv-patient-skeleton tw-h-64"></div>`;
    try {
      const params = new URLSearchParams({ page: state.currentPage, limit: state.perPage });
      if (status !== 'all') params.set('status', status);
      const result = await api(`/patient/appointments?${params}`);
      state.appointments = result.appointments || [];
      state.total = Number(result.pagination?.total || 0);
      qs('[data-total-count]').textContent = toFa(state.total);
      renderAppointments();
      renderPagination();
      const viewId = Number(state.pendingAppointmentViewId || 0);
      state.pendingAppointmentViewId = 0;
      if (viewId) {
        const app = state.appointments.find(item => Number(item.id) === viewId);
        if (app) { renderAppointmentDetails(app); openModal('appointmentDetailModal'); }
      }
    } catch (error) {
      if (container) container.innerHTML = emptyState('دریافت نوبت‌ها ممکن نشد', friendlyErrorMessage(error), '<button class="noor-tw-btn-primary tw-mt-4" type="button" data-reload-appointments>تلاش دوباره</button>');
      qs('[data-reload-appointments]')?.addEventListener('click', loadAppointments);
    }
  }

  function renderAppointments() {
    const container = qs('[data-appointments-list]');
    if (!container) return;
    const query = text(qs('#appointmentSearch')?.value).toLocaleLowerCase('fa');
    const filtered = state.appointments.filter(app => !query || `${app.doctor_name || ''} ${app.specialty || ''}`.toLocaleLowerCase('fa').includes(query));
    if (!filtered.length) {
      container.innerHTML = emptyState('نوبتی مطابق جستجو یافت نشد', 'وضعیت انتخاب‌شده یا عبارت جست‌وجو را تغییر دهید.', '<button type="button" class="noor-tw-btn-secondary tw-mt-4" data-clear-appointment-search>پاک‌کردن جستجو</button>');
      qs('[data-clear-appointment-search]')?.addEventListener('click', () => { qs('#appointmentSearch').value = ''; renderAppointments(); });
      return;
    }
    container.innerHTML = `<div class="nv-patient-desktop-only"><div class="nv-tw-table-wrap"><table class="nv-tw-table"><thead><tr><th>زمان مراجعه</th><th>پزشک</th><th>وضعیت نوبت</th><th>وضعیت پرداخت</th><th>هزینه</th><th>عملیات</th></tr></thead><tbody>${filtered.map(appointmentRow).join('')}</tbody></table></div></div><div class="nv-patient-mobile-only nv-pa-mobile-list">${filtered.map(appointmentMobileCard).join('')}</div>`;
    bindAppointmentActions(container);
  }

  function renderPagination() {
    const nav = qs('[data-pagination]');
    if (!nav) return;
    const pages = Math.max(1, Math.ceil(state.total / state.perPage));
    if (pages <= 1) { nav.innerHTML = ''; return; }
    const start = Math.max(1, state.currentPage - 2);
    const end = Math.min(pages, start + 4);
    nav.innerHTML = `${state.currentPage > 1 ? '<button type="button" class="nv-patient-page-btn" data-page="prev" aria-label="صفحه قبل"><i class="icon-chevron-right"></i></button>' : ''}${Array.from({ length: end - start + 1 }, (_, i) => i + start).map(num => `<button type="button" class="nv-patient-page-btn ${num === state.currentPage ? 'nv-patient-page-btn-active' : ''}" data-page="${num}" ${num === state.currentPage ? 'aria-current="page"' : ''}>${toFa(num)}</button>`).join('')}${state.currentPage < pages ? '<button type="button" class="nv-patient-page-btn" data-page="next" aria-label="صفحه بعد"><i class="icon-chevron-left"></i></button>' : ''}`;
    qsa('[data-page]', nav).forEach(button => button.addEventListener('click', () => {
      const target = button.dataset.page;
      state.currentPage = target === 'prev' ? state.currentPage - 1 : target === 'next' ? state.currentPage + 1 : Number(target);
      loadAppointments();
      qs('[data-appointments-list]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  }

  async function initMedicalRecords() {
    pageLoading('در حال دریافت پرونده پزشکی...');
    try {
      const result = await api('/patient/medical-records');
      state.records = result.records || [];
      root.innerHTML = `<div class="tw-space-y-6"><section class="tw-overflow-hidden tw-rounded-noor tw-bg-gradient-to-l tw-from-indigo-900 tw-via-noor-800 tw-to-noor-600 tw-p-6 tw-text-white tw-shadow-noor sm:tw-p-8"><div class="tw-flex tw-flex-col tw-gap-5 md:tw-flex-row md:tw-items-center md:tw-justify-between"><div><span class="tw-inline-flex tw-items-center tw-gap-2 tw-rounded-full tw-bg-white/15 tw-px-3 tw-py-1.5 tw-text-xs tw-font-bold"><i class="icon-lock"></i> پرونده محرمانه سلامت</span><h2 class="tw-mt-4 tw-text-2xl tw-font-black sm:tw-text-3xl">سوابق پزشکی شما</h2><p class="tw-mt-3 tw-max-w-2xl tw-text-sm tw-leading-8 tw-text-sky-100">گزارش‌های ثبت‌شده توسط پزشکان را به ترتیب تاریخ مرور کنید. از اشتراک‌گذاری بدون ضرورت این اطلاعات خودداری کنید.</p></div><span class="tw-flex tw-h-20 tw-w-20 tw-flex-none tw-items-center tw-justify-center tw-rounded-3xl tw-bg-white/10 tw-text-3xl tw-ring-1 tw-ring-white/20"><i class="icon-file-text"></i></span></div></section><section class="tw-grid tw-grid-cols-1 tw-gap-4 sm:tw-grid-cols-3">${statCard('icon-file-text', 'تعداد سوابق', state.records.length, 'کل گزارش‌های ثبت‌شده')}${statCard('icon-user-md', 'پزشکان ثبت‌کننده', new Set(state.records.map(r => r.doctor_name).filter(Boolean)).size, 'پزشکان مرتبط', 'violet')}${statCard('icon-calendar', 'آخرین به‌روزرسانی', state.records[0] ? formatDate(state.records[0].record_date) : '—', 'آخرین گزارش پرونده', 'emerald')}</section><section class="nv-tw-card"><header class="nv-tw-card-header"><div><h2 class="tw-text-lg tw-font-black tw-text-clinic-ink">خط زمانی پرونده</h2><p class="tw-mt-1 tw-text-sm tw-text-slate-500">برای مشاهده جزئیات، هر گزارش را باز کنید</p></div><div class="tw-relative tw-w-full sm:tw-w-72"><i class="icon-search tw-absolute tw-right-3.5 tw-top-1/2 -tw-translate-y-1/2 tw-text-slate-400"></i><label class="tw-sr-only" for="recordSearch">جستجوی پرونده</label><input id="recordSearch" class="noor-tw-input tw-pr-10" type="search" placeholder="جستجو در تشخیص یا پزشک"></div></header><div class="nv-tw-card-body"><div class="tw-space-y-4" data-records-list></div></div></section><section class="tw-rounded-noor tw-border tw-border-amber-200 tw-bg-amber-50 tw-p-5"><div class="tw-flex tw-gap-3"><span class="tw-flex tw-h-10 tw-w-10 tw-flex-none tw-items-center tw-justify-center tw-rounded-xl tw-bg-white tw-text-amber-700"><i class="icon-info"></i></span><div><h3 class="tw-text-sm tw-font-black tw-text-amber-900">توضیح مهم</h3><p class="tw-mt-2 tw-text-xs tw-leading-7 tw-text-amber-800">این اطلاعات برای آگاهی شماست. برای تفسیر نتایج، تغییر دارو یا تصمیم درمانی با پزشک معالج گفتگو کنید.</p></div></div></section></div>${modalMarkup('medicalRecordModal', 'جزئیات گزارش پزشکی')}`;
      renderMedicalRecords();
      qs('#recordSearch')?.addEventListener('input', renderMedicalRecords);
    } catch (error) { errorState(error, initMedicalRecords); }
  }

  function renderMedicalRecords() {
    const container = qs('[data-records-list]');
    if (!container) return;
    const query = text(qs('#recordSearch')?.value).toLocaleLowerCase('fa');
    const records = state.records.filter(record => !query || `${record.doctor_name || ''} ${record.diagnosis || ''} ${record.symptoms || ''}`.toLocaleLowerCase('fa').includes(query));
    if (!records.length) { container.innerHTML = emptyState('گزارش پزشکی یافت نشد', state.records.length ? 'عبارت جستجو را تغییر دهید.' : 'پس از ثبت گزارش توسط پزشک، سوابق در این بخش نمایش داده می‌شود.'); return; }
    container.innerHTML = records.map(record => `<article class="tw-relative tw-rounded-2xl tw-border tw-border-slate-200 tw-bg-white tw-p-5 tw-transition hover:tw-border-noor-200 hover:tw-shadow-noor-soft"><div class="tw-flex tw-flex-col tw-gap-4 sm:tw-flex-row sm:tw-items-start sm:tw-justify-between"><div class="tw-flex tw-gap-4"><span class="tw-flex tw-h-12 tw-w-12 tw-flex-none tw-items-center tw-justify-center tw-rounded-2xl tw-bg-violet-50 tw-text-lg tw-text-violet-700"><i class="icon-file-text"></i></span><div><div class="tw-flex tw-flex-wrap tw-items-center tw-gap-2"><h3 class="tw-text-base tw-font-black tw-text-clinic-ink">${escapeHtml(record.diagnosis || 'گزارش پزشکی')}</h3><span class="nv-tw-badge nv-tw-badge-muted">شماره ${toFa(record.id)}</span></div><p class="tw-mt-2 tw-text-sm tw-text-slate-500">دکتر ${escapeHtml(record.doctor_name || '—')} · ${formatDate(record.record_date, true)}</p>${record.symptoms ? `<p class="tw-mt-3 tw-line-clamp-2 tw-text-sm tw-leading-7 tw-text-slate-600"><strong>علائم:</strong> ${escapeHtml(record.symptoms)}</p>` : ''}</div></div><button type="button" class="noor-tw-btn-secondary tw-flex-none" data-record-view="${Number(record.id)}"><i class="icon-eye"></i> مشاهده گزارش</button></div></article>`).join('');
    qsa('[data-record-view]', container).forEach(button => button.addEventListener('click', () => {
      const record = state.records.find(item => Number(item.id) === Number(button.dataset.recordView));
      if (!record) return;
      const modal = document.getElementById('medicalRecordModal');
      qs('[data-modal-title]', modal).textContent = `گزارش پزشکی شماره ${toFa(record.id)}`;
      qs('[data-modal-content]', modal).innerHTML = `<div class="nv-patient-detail-grid"><div class="nv-patient-detail-item"><span>تاریخ ثبت</span><strong>${formatDate(record.record_date, true)}</strong></div><div class="nv-patient-detail-item"><span>پزشک معالج</span><strong>دکتر ${escapeHtml(record.doctor_name || '—')}</strong></div><div class="nv-patient-detail-item tw-col-span-full"><span>تشخیص</span><p class="tw-mt-2 tw-text-sm tw-leading-8 tw-text-slate-700">${multiline(record.diagnosis)}</p></div><div class="nv-patient-detail-item tw-col-span-full"><span>علائم ثبت‌شده</span><p class="tw-mt-2 tw-text-sm tw-leading-8 tw-text-slate-700">${multiline(record.symptoms)}</p></div><div class="nv-patient-detail-item tw-col-span-full"><span>دستور یا نسخه ثبت‌شده</span><p class="tw-mt-2 tw-text-sm tw-leading-8 tw-text-slate-700">${multiline(record.prescription)}</p></div><div class="nv-patient-detail-item tw-col-span-full"><span>یادداشت پزشک</span><p class="tw-mt-2 tw-text-sm tw-leading-8 tw-text-slate-700">${multiline(record.notes)}</p></div></div><button type="button" class="noor-tw-btn-secondary tw-mt-5" data-print-record="${Number(record.id)}"><i class="icon-print"></i> چاپ گزارش</button>`;
      qs('[data-print-record]', modal)?.addEventListener('click', () => printMedicalRecord(record));
      openModal('medicalRecordModal', button);
    }));
  }

  function printMedicalRecord(record) {
    printDocument(`گزارش پزشکی شماره ${record.id}`, `<h1>گزارش پزشکی صدرا</h1><p><strong>تاریخ:</strong> ${escapeHtml(formatDate(record.record_date, true))}</p><p><strong>پزشک:</strong> دکتر ${escapeHtml(record.doctor_name || '—')}</p><hr><h2>تشخیص</h2><p>${multiline(record.diagnosis)}</p><h2>علائم</h2><p>${multiline(record.symptoms)}</p><h2>دستور یا نسخه</h2><p>${multiline(record.prescription)}</p><h2>یادداشت پزشک</h2><p>${multiline(record.notes)}</p>`);
  }

  async function initPrescriptions() {
    pageLoading('در حال دریافت نسخه‌ها...');
    try {
      const result = await api('/patient/prescriptions');
      state.prescriptions = result.prescriptions || [];
      const active = state.prescriptions.filter(isPrescriptionActive).length;
      root.innerHTML = `<div class="tw-space-y-6"><section class="tw-overflow-hidden tw-rounded-noor tw-bg-gradient-to-l tw-from-emerald-900 tw-via-teal-700 tw-to-noor-600 tw-p-6 tw-text-white tw-shadow-noor sm:tw-p-8"><div class="tw-flex tw-flex-col tw-gap-5 md:tw-flex-row md:tw-items-center md:tw-justify-between"><div><span class="tw-inline-flex tw-items-center tw-gap-2 tw-rounded-full tw-bg-white/15 tw-px-3 tw-py-1.5 tw-text-xs tw-font-bold"><i class="icon-medkit"></i> نسخه‌های الکترونیکی</span><h2 class="tw-mt-4 tw-text-2xl tw-font-black sm:tw-text-3xl">نسخه‌ها و دستورهای دارویی</h2><p class="tw-mt-3 tw-max-w-2xl tw-text-sm tw-leading-8 tw-text-emerald-50">متن نسخه، دستور مصرف و زمان اعتبار را مشاهده کنید. مصرف یا قطع دارو فقط طبق نظر پزشک انجام شود.</p></div><span class="tw-flex tw-h-20 tw-w-20 tw-flex-none tw-items-center tw-justify-center tw-rounded-3xl tw-bg-white/10 tw-text-3xl tw-ring-1 tw-ring-white/20"><i class="icon-medkit"></i></span></div></section><section class="tw-grid tw-grid-cols-1 tw-gap-4 sm:tw-grid-cols-3">${statCard('icon-medkit', 'کل نسخه‌ها', state.prescriptions.length, 'همه نسخه‌های ثبت‌شده', 'violet')}${statCard('icon-check-circle', 'دارای اعتبار', active, 'بر اساس تاریخ اعتبار', 'emerald')}${statCard('icon-calendar', 'آخرین نسخه', state.prescriptions[0] ? formatDate(state.prescriptions[0].created_at || state.prescriptions[0].record_date) : '—', 'آخرین ثبت پزشک', 'amber')}</section><section class="nv-tw-card"><header class="nv-tw-card-header"><div><h2 class="tw-text-lg tw-font-black tw-text-clinic-ink">فهرست نسخه‌ها</h2><p class="tw-mt-1 tw-text-sm tw-text-slate-500">نسخه موردنظر را برای مشاهده، چاپ یا دریافت متن باز کنید</p></div><div class="nv-prescription-tools"><div class="tw-relative nv-prescription-search"><i class="icon-search tw-absolute tw-right-3.5 tw-top-1/2 -tw-translate-y-1/2 tw-text-slate-400" aria-hidden="true"></i><label class="tw-sr-only" for="prescriptionSearch">جستجوی نسخه</label><input id="prescriptionSearch" class="noor-tw-input tw-pr-10" type="search" placeholder="نام پزشک، تشخیص یا دارو"></div><label class="tw-sr-only" for="prescriptionFilter">نمایش بر اساس اعتبار</label><select id="prescriptionFilter" class="noor-tw-input nv-prescription-filter"><option value="all">همه نسخه‌ها</option><option value="active">دارای اعتبار</option><option value="expired">منقضی‌شده</option></select></div></header><div class="nv-tw-card-body"><div class="tw-grid tw-gap-4 lg:tw-grid-cols-2" data-prescriptions-list></div></div></section><section class="tw-rounded-noor tw-border tw-border-rose-200 tw-bg-rose-50 tw-p-5"><div class="tw-flex tw-gap-3"><span class="tw-flex tw-h-10 tw-w-10 tw-flex-none tw-items-center tw-justify-center tw-rounded-xl tw-bg-white tw-text-rose-700"><i class="icon-warning"></i></span><div><h3 class="tw-text-sm tw-font-black tw-text-rose-900">ایمنی دارویی</h3><p class="tw-mt-2 tw-text-xs tw-leading-7 tw-text-rose-800">در صورت بروز واکنش حساسیتی یا علائم شدید، مصرف خودسرانه دارو را ادامه ندهید و با پزشک یا خدمات اورژانسی تماس بگیرید.</p></div></div></section></div>${modalMarkup('prescriptionModal', 'جزئیات نسخه')}`;
      renderPrescriptions();
      qs('#prescriptionSearch')?.addEventListener('input', renderPrescriptions);
      qs('#prescriptionFilter')?.addEventListener('change', renderPrescriptions);
    } catch (error) { errorState(error, initPrescriptions); }
  }

  function isPrescriptionActive(prescription) {
    if (!prescription.valid_until) return true;
    const date = new Date(`${String(prescription.valid_until).slice(0, 10)}T23:59:59`);
    return !Number.isNaN(date.getTime()) && date >= new Date();
  }

  function prescriptionText(p) {
    return text(p.medicines || p.prescription || p.instructions) || 'جزئیات دارویی ثبت نشده است.';
  }

  function renderPrescriptions() {
    const container = qs('[data-prescriptions-list]');
    if (!container) return;
    const query = text(qs('#prescriptionSearch')?.value).toLocaleLowerCase('fa');
    const filter = qs('#prescriptionFilter')?.value || 'all';
    const items = state.prescriptions.filter(p => {
      const active = isPrescriptionActive(p);
      const matchesFilter = filter === 'all' || (filter === 'active' ? active : !active);
      const haystack = `${p.doctor_name || ''} ${p.diagnosis || ''} ${p.medicines || ''} ${p.prescription || ''}`.toLocaleLowerCase('fa');
      return matchesFilter && (!query || haystack.includes(query));
    });
    if (!items.length) { container.innerHTML = `<div class="lg:tw-col-span-2">${emptyState('نسخه‌ای یافت نشد', state.prescriptions.length ? 'عبارت جست‌وجو یا وضعیت انتخاب‌شده را تغییر دهید.' : 'پس از ثبت نسخه توسط پزشک، اطلاعات در این بخش نمایش داده می‌شود.')}</div>`; return; }
    container.innerHTML = items.map(p => { const active = isPrescriptionActive(p); return `<article class="tw-flex tw-h-full tw-flex-col tw-rounded-2xl tw-border tw-border-slate-200 tw-bg-white tw-p-5 tw-transition hover:tw-border-noor-200 hover:tw-shadow-noor-soft"><div class="tw-flex tw-items-start tw-justify-between tw-gap-3"><span class="tw-flex tw-h-12 tw-w-12 tw-items-center tw-justify-center tw-rounded-2xl tw-bg-emerald-50 tw-text-lg tw-text-emerald-700"><i class="icon-medkit"></i></span><span class="nv-tw-badge ${active ? 'nv-tw-badge-success' : 'nv-tw-badge-muted'}"><i class="${active ? 'icon-check' : 'icon-clock-o'} tw-ml-1.5"></i>${active ? 'دارای اعتبار' : 'منقضی‌شده'}</span></div><h3 class="tw-mt-4 tw-text-base tw-font-black tw-text-clinic-ink">${escapeHtml(p.diagnosis || 'نسخه پزشکی')}</h3><p class="tw-mt-2 tw-text-sm tw-text-slate-500">دکتر ${escapeHtml(p.doctor_name || '—')} · ${formatDate(p.created_at || p.record_date)}</p><p class="tw-mt-4 tw-line-clamp-3 tw-flex-1 tw-text-sm tw-leading-7 tw-text-slate-600">${escapeHtml(prescriptionText(p))}</p>${p.valid_until ? `<p class="tw-mt-3 tw-text-xs tw-font-bold ${active ? 'tw-text-emerald-700' : 'tw-text-slate-500'}">اعتبار تا ${formatDate(p.valid_until)}</p>` : ''}<button type="button" class="noor-tw-btn-secondary tw-mt-5 tw-w-full" data-prescription-view="${Number(p.id)}"><i class="icon-eye"></i> مشاهده نسخه</button></article>`; }).join('');
    qsa('[data-prescription-view]', container).forEach(button => button.addEventListener('click', () => openPrescription(Number(button.dataset.prescriptionView), button)));
  }

  function openPrescription(id, trigger) {
    const p = state.prescriptions.find(item => Number(item.id) === Number(id));
    if (!p) return;
    const modal = document.getElementById('prescriptionModal');
    qs('[data-modal-title]', modal).textContent = `نسخه شماره ${toFa(p.id)}`;
    qs('[data-modal-content]', modal).innerHTML = `<div class="nv-patient-detail-grid"><div class="nv-patient-detail-item"><span>تاریخ صدور</span><strong>${formatDate(p.created_at || p.record_date, true)}</strong></div><div class="nv-patient-detail-item"><span>پزشک</span><strong>دکتر ${escapeHtml(p.doctor_name || '—')}</strong></div><div class="nv-patient-detail-item"><span>اعتبار نسخه</span><strong>${p.valid_until ? formatDate(p.valid_until) : 'تاریخ انقضا ثبت نشده'}</strong></div><div class="nv-patient-detail-item"><span>وضعیت</span><div class="tw-mt-2"><span class="nv-tw-badge ${isPrescriptionActive(p) ? 'nv-tw-badge-success' : 'nv-tw-badge-muted'}">${isPrescriptionActive(p) ? 'دارای اعتبار' : 'منقضی‌شده'}</span></div></div><div class="nv-patient-detail-item tw-col-span-full"><span>تشخیص</span><p class="tw-mt-2 tw-text-sm tw-leading-8 tw-text-slate-700">${multiline(p.diagnosis)}</p></div><div class="nv-patient-detail-item tw-col-span-full"><span>داروها</span><p class="tw-mt-2 tw-text-sm tw-leading-8 tw-text-slate-700">${multiline(p.medicines || p.prescription)}</p></div><div class="nv-patient-detail-item tw-col-span-full"><span>دستور مصرف</span><p class="tw-mt-2 tw-text-sm tw-leading-8 tw-text-slate-700">${multiline(p.instructions)}</p></div></div><div class="tw-mt-5 tw-flex tw-flex-wrap tw-gap-3"><button type="button" class="noor-tw-btn-primary" data-print-prescription><i class="icon-print"></i> چاپ / ذخیره PDF</button><button type="button" class="noor-tw-btn-secondary" data-download-prescription><i class="icon-download"></i> دریافت متن نسخه</button></div>`;
    qs('[data-print-prescription]', modal)?.addEventListener('click', () => printPrescription(p));
    qs('[data-download-prescription]', modal)?.addEventListener('click', () => downloadPrescription(p));
    openModal('prescriptionModal', trigger);
  }

  function printPrescription(p) {
    printDocument(`نسخه شماره ${p.id}`, `<h1>نسخه پزشکی صدرا</h1><p><strong>شماره نسخه:</strong> ${escapeHtml(toFa(p.id))}</p><p><strong>تاریخ:</strong> ${escapeHtml(formatDate(p.created_at || p.record_date, true))}</p><p><strong>پزشک:</strong> دکتر ${escapeHtml(p.doctor_name || '—')}</p><hr><h2>تشخیص</h2><p>${multiline(p.diagnosis)}</p><h2>داروها</h2><p>${multiline(p.medicines || p.prescription)}</p><h2>دستور مصرف</h2><p>${multiline(p.instructions)}</p>${p.valid_until ? `<p><strong>اعتبار تا:</strong> ${escapeHtml(formatDate(p.valid_until))}</p>` : ''}<hr><p class="notice">این خروجی برای مشاهده بیمار است و جایگزین نسخه رسمی دارای امضا یا تأیید پزشک نیست.</p>`);
  }

  function downloadPrescription(p) {
    const content = `نسخه پزشکی صدرا\nشماره نسخه: ${p.id}\nتاریخ: ${formatDate(p.created_at || p.record_date, true)}\nپزشک: دکتر ${p.doctor_name || '—'}\n\nتشخیص:\n${text(p.diagnosis) || '—'}\n\nداروها:\n${text(p.medicines || p.prescription) || '—'}\n\nدستور مصرف:\n${text(p.instructions) || '—'}\n\nاعتبار تا: ${p.valid_until ? formatDate(p.valid_until) : 'ثبت نشده'}\n\nاین فایل برای مشاهده بیمار است و جایگزین نسخه رسمی نیست.`;
    const blob = new Blob(['\uFEFF', content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `noorvista-prescription-${p.id}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast('متن نسخه دریافت شد.', 'success');
  }

  function printDocument(title, body) {
    const popup = window.open('', '_blank', 'width=900,height=700');
    if (!popup) { showToast('مرورگر پنجره چاپ را مسدود کرده است. اجازه Pop-up را فعال کنید.', 'warning'); return; }
    try { popup.opener = null; } catch (_) {}
    popup.document.write(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>@font-face{font-family:Vazir;src:url('/fonts/Vazir.woff2') format('woff2'),url('/fonts/Vazir.woff') format('woff');font-display:swap}*{box-sizing:border-box}body{font-family:Vazir,Shabnam,Tahoma,Arial,sans-serif;direction:rtl;color:#172033;max-width:760px;margin:28px auto;padding:20px;line-height:2;background:#fff}h1{font-size:22px;color:#0b638f;margin:0}h2{font-size:16px;margin-top:24px}hr{border:0;border-top:1px solid #dbe3ea;margin:20px 0}.notice{font-size:12px;color:#64748b;background:#f8fafc;padding:12px;border-radius:10px}.receipt{border:1px solid #dbe3ea;border-radius:18px;overflow:hidden}.receipt-head{padding:22px 24px;text-align:center;background:#f4f9fc;border-bottom:1px solid #dbe3ea}.receipt-head strong{display:block;font-size:19px;color:#0b3954}.receipt-head span{display:block;margin-top:4px;font-size:13px;color:#64748b}.receipt-body{padding:18px 24px}.receipt-row{display:flex;justify-content:space-between;gap:18px;padding:9px 0;border-bottom:1px dashed #e2e8f0}.receipt-row:last-child{border-bottom:0}.receipt-row span{color:#64748b;font-size:13px}.receipt-row strong{font-size:13px;text-align:left}.receipt-total{margin-top:14px;padding:13px 15px;border-radius:12px;background:#ecfdf5;color:#065f46}.receipt-foot{padding:13px 24px;text-align:center;background:#f8fafc;color:#64748b;font-size:11px;border-top:1px solid #e2e8f0}@media(max-width:520px){body{margin:0;padding:12px}.receipt-body,.receipt-head{padding:16px}.receipt-row{align-items:flex-start;flex-direction:column;gap:2px}.receipt-row strong{text-align:right}}@media print{body{margin:0;max-width:none;padding:0}.receipt{break-inside:avoid}}</style></head><body>${body}<script>window.onload=function(){window.print()}<\/script></body></html>`);
    popup.document.close();
  }

  function paymentDateTimeValue(payment) {
    const paidAt = text(payment?.payment_date);
    if (paidAt && /(?:T|\s)\d{1,2}:\d{2}/.test(paidAt)) return paidAt;
    return payment?.created_at || paidAt || '';
  }

  async function initPayments() {
    pageLoading('در حال دریافت اطلاعات مالی...');
    try {
      const result = await api('/patient/payments');
      state.payments = result.payments || [];
      const unpaid = result.unpaid_appointments || [];
      root.innerHTML = `<div class="tw-space-y-6"><section class="tw-overflow-hidden tw-rounded-noor tw-bg-gradient-to-l tw-from-slate-900 tw-via-noor-900 tw-to-noor-600 tw-p-6 tw-text-white tw-shadow-noor sm:tw-p-8"><div class="tw-flex tw-flex-col tw-gap-5 md:tw-flex-row md:tw-items-center md:tw-justify-between"><div><span class="tw-inline-flex tw-items-center tw-gap-2 tw-rounded-full tw-bg-white/15 tw-px-3 tw-py-1.5 tw-text-xs tw-font-bold"><i class="icon-lock"></i> سوابق مالی محرمانه</span><h2 class="tw-mt-4 tw-text-2xl tw-font-black sm:tw-text-3xl">پرداخت‌ها و رسیدهای شما</h2><p class="tw-mt-3 tw-max-w-2xl tw-text-sm tw-leading-8 tw-text-sky-100">وضعیت هزینه‌های ثبت‌شده را بررسی کنید و رسید هر پرداخت را برای سوابق شخصی چاپ کنید.</p></div><span class="tw-flex tw-h-20 tw-w-20 tw-flex-none tw-items-center tw-justify-center tw-rounded-3xl tw-bg-white/10 tw-text-3xl tw-ring-1 tw-ring-white/20"><i class="icon-credit-card"></i></span></div></section><section class="tw-grid tw-grid-cols-1 tw-gap-4 sm:tw-grid-cols-2 xl:tw-grid-cols-4">${paymentAmountStatCard('icon-check-circle', 'مجموع پرداخت‌شده', result.total_paid || 0, 'پرداخت‌های تکمیل‌شده', 'emerald')}${paymentAmountStatCard('icon-clock-o', 'مبلغ در انتظار', result.pending_amount || 0, 'هزینه‌های تسویه‌نشده', 'amber')}${statCard('icon-credit-card', 'نوبت‌های پرداخت‌نشده', unpaid.length, 'قابل پرداخت')}${statCard('icon-file-text', 'تعداد رسیدها', state.payments.length, 'سوابق مالی ثبت‌شده', 'violet')}</section>${unpaid.length ? `<section class="nv-tw-card"><header class="nv-tw-card-header"><div><h2 class="tw-text-lg tw-font-black tw-text-clinic-ink">هزینه‌های در انتظار پرداخت</h2><p class="tw-mt-1 tw-text-sm tw-text-slate-500">برای نوبت‌های زیر پرداخت تکمیل‌شده ثبت نشده است</p></div><span class="nv-tw-badge nv-tw-badge-warning">${toFa(unpaid.length)} مورد</span></header><div class="nv-tw-card-body"><div class="tw-grid tw-gap-4 lg:tw-grid-cols-2">${unpaid.map(item => `<article class="tw-rounded-2xl tw-border tw-border-amber-200 tw-bg-amber-50 tw-p-5"><div class="tw-flex tw-items-start tw-justify-between tw-gap-3"><div><h3 class="tw-text-base tw-font-black tw-text-clinic-ink">دکتر ${escapeHtml(item.doctor_name || '—')}</h3><p class="tw-mt-2 tw-text-sm tw-text-slate-600">${formatDate(item.appointment_date)} · ساعت ${formatTime(item.appointment_time)}</p></div><strong class="tw-text-sm tw-font-black tw-text-amber-900">${formatMoney(item.amount)}</strong></div><div class="tw-mt-4"><a class="noor-tw-btn-primary tw-w-full" href="test-payment.html?appointment_id=${Number(item.id)}"><i class="icon-credit-card"></i> پرداخت</a><button type="button" data-online-payment-disabled disabled aria-disabled="true" hidden></button></div></article>`).join('')}</div></div></section>` : ''}<section class="nv-tw-card"><header class="nv-tw-card-header"><div><h2 class="tw-text-lg tw-font-black tw-text-clinic-ink">تاریخچه پرداخت‌ها</h2><p class="tw-mt-1 tw-text-sm tw-text-slate-500">رسیدها و وضعیت تراکنش‌های ثبت‌شده</p></div></header><div class="nv-tw-card-body" data-payments-list>${renderPaymentsList()}</div></section><section class="tw-rounded-noor tw-border tw-border-sky-200 tw-bg-sky-50 tw-p-5"><div class="tw-flex tw-gap-3"><span class="tw-flex tw-h-10 tw-w-10 tw-flex-none tw-items-center tw-justify-center tw-rounded-xl tw-bg-white tw-text-sky-700"><i class="icon-shield"></i></span><div><h3 class="tw-text-sm tw-font-black tw-text-sky-900">رسید پرداخت</h3><p class="tw-mt-2 tw-text-xs tw-leading-7 tw-text-sky-800">پس از تأیید هر پرداخت، رسید و شماره پیگیری آن در همین صفحه در دسترس شما خواهد بود.</p></div></div></section></div>`;
      qsa('[data-payment-receipt]').forEach(button => button.addEventListener('click', () => {
        const payment = state.payments.find(item => Number(item.id) === Number(button.dataset.paymentReceipt));
        if (payment) printReceipt(payment);
      }));
    } catch (error) { errorState(error, initPayments); }
  }


  async function initTestPayment() {
    const params = new URLSearchParams(window.location.search);
    const checkoutToken = params.get('checkout_token');
    const legacyAppointmentId = Number(params.get('appointment_id'));
    if (!checkoutToken && !legacyAppointmentId) {
      root.innerHTML = emptyState('پرداختی برای بررسی مشخص نشده است', 'از صفحه نوبت‌ها یک نوبت را انتخاب کنید.', '<a class="noor-tw-btn-primary tw-mt-4" href="appointments.html#book">انتخاب نوبت</a>');
      return;
    }

    pageLoading('در حال آماده‌سازی پرداخت...');
    try {
      const secureFlow = Boolean(checkoutToken);
      const result = secureFlow
        ? await api(`/patient/payments/checkout/${encodeURIComponent(checkoutToken)}`)
        : await api(`/patient/payments/test/${legacyAppointmentId}`);
      const app = secureFlow ? (result.checkout || {}) : (result.appointment || {});
      const paid = Boolean(result.already_paid || app.status === 'paid');
      const realGateway = secureFlow && app.provider === 'zarinpal';
      const expired = app.status === 'expired';
      const cancelled = app.status === 'cancelled';
      const terminal = paid || expired || cancelled || app.status === 'failed';
      const expiresAt = app.expires_at ? new Date(app.expires_at) : null;
      const appointmentId = Number(app.appointment_id || legacyAppointmentId || 0);

      root.innerHTML = `<div class="tw-mx-auto tw-max-w-4xl tw-space-y-6">
        <section class="tw-overflow-hidden tw-rounded-noor tw-bg-gradient-to-l tw-from-slate-900 tw-via-noor-900 tw-to-sky-600 tw-p-6 tw-text-white tw-shadow-noor sm:tw-p-8">
          <div class="tw-flex tw-flex-col tw-gap-5 sm:tw-flex-row sm:tw-items-center sm:tw-justify-between">
            <div><span class="tw-inline-flex tw-items-center tw-gap-2 tw-rounded-full tw-bg-white/15 tw-px-3 tw-py-1.5 tw-text-xs tw-font-bold"><i class="icon-shield"></i> ${realGateway ? 'درگاه امن پرداخت' : 'محیط آزمایشی — بدون کسر وجه'}</span><h1 class="tw-mt-4 tw-text-2xl tw-font-black sm:tw-text-3xl">تأیید پرداخت و ثبت نهایی نوبت</h1><p class="tw-mt-3 tw-text-sm tw-leading-8 tw-text-sky-100">مشخصات و مبلغ را بررسی کنید و سپس پرداخت را تأیید کنید. اطلاعات کارت بانکی در این صفحه دریافت نمی‌شود.</p></div>
            <span class="tw-flex tw-h-20 tw-w-20 tw-flex-none tw-items-center tw-justify-center tw-rounded-3xl tw-bg-white/10 tw-text-3xl tw-ring-1 tw-ring-white/20"><i class="icon-credit-card"></i></span>
          </div>
        </section>
        <section class="nv-tw-card">
          <header class="nv-tw-card-header"><div><h2 class="tw-text-lg tw-font-black tw-text-clinic-ink">خلاصه نوبت و مبلغ</h2><p class="tw-mt-1 tw-text-sm tw-text-slate-500">مبلغ و مشخصات را قبل از پرداخت بررسی کنید</p></div>${paid ? paymentBadge('paid') : paymentBadge(terminal ? 'cancelled' : 'pending')}</header>
          <div class="nv-tw-card-body">
            ${secureFlow && !terminal ? `<div class="tw-mb-5 tw-flex tw-flex-col tw-gap-3 tw-rounded-2xl tw-border tw-border-amber-200 tw-bg-amber-50 tw-p-4 sm:tw-flex-row sm:tw-items-center sm:tw-justify-between"><div><strong class="tw-text-sm tw-font-black tw-text-amber-950">دریافت موقت ظرفیت</strong><p class="tw-mt-1 tw-text-xs tw-leading-6 tw-text-amber-800">این ظرفیت فقط تا پایان مهلت زیر برای شما نگه داشته می‌شود؛ سپس خودکار آزاد خواهد شد.</p></div><strong class="tw-rounded-xl tw-bg-white tw-px-4 tw-py-2 tw-text-base tw-font-black tw-text-amber-900" data-checkout-countdown>—</strong></div>` : ''}
            <div class="tw-grid tw-grid-cols-1 tw-gap-4 sm:tw-grid-cols-2">
              <div class="tw-rounded-2xl tw-border tw-border-slate-200 tw-bg-slate-50 tw-p-4"><span class="tw-text-xs tw-font-bold tw-text-slate-500">بیمار</span><strong class="tw-mt-2 tw-block tw-text-base tw-font-black tw-text-clinic-ink">${escapeHtml(app.patient_name || '—')}</strong><small class="tw-mt-1 tw-block tw-text-slate-500">${escapeHtml(app.patient_phone || '')}</small></div>
              <div class="tw-rounded-2xl tw-border tw-border-slate-200 tw-bg-slate-50 tw-p-4"><span class="tw-text-xs tw-font-bold tw-text-slate-500">پزشک</span><strong class="tw-mt-2 tw-block tw-text-base tw-font-black tw-text-clinic-ink">دکتر ${escapeHtml(app.doctor_name || '—')}</strong><small class="tw-mt-1 tw-block tw-text-slate-500">${escapeHtml(app.specialty || 'چشم‌پزشکی')}</small></div>
              <div class="tw-rounded-2xl tw-border tw-border-slate-200 tw-bg-slate-50 tw-p-4"><span class="tw-text-xs tw-font-bold tw-text-slate-500">زمان مراجعه</span><strong class="tw-mt-2 tw-block tw-text-base tw-font-black tw-text-clinic-ink">${formatDate(app.appointment_date, true)}، ساعت ${formatTime(app.appointment_time)}</strong></div>
              <div class="tw-rounded-2xl tw-border tw-border-slate-200 tw-bg-slate-50 tw-p-4"><span class="tw-text-xs tw-font-bold tw-text-slate-500">مرکز و خدمت</span><strong class="tw-mt-2 tw-block tw-text-base tw-font-black tw-text-clinic-ink">${escapeHtml(app.medical_center_name || 'مرکز ثبت نشده')}</strong><small class="tw-mt-1 tw-block tw-text-slate-500">${escapeHtml(app.service_name || 'ویزیت')}</small></div>
            </div>
            <div class="tw-mt-5 tw-flex tw-flex-col tw-gap-4 tw-rounded-2xl tw-border tw-border-emerald-200 tw-bg-emerald-50 tw-p-5 sm:tw-flex-row sm:tw-items-center sm:tw-justify-between"><div><span class="tw-text-xs tw-font-bold tw-text-emerald-700">مبلغ قابل پرداخت</span><strong class="tw-mt-2 tw-block tw-text-2xl tw-font-black tw-text-emerald-950">${formatMoney(app.amount)}</strong></div><span class="tw-rounded-xl tw-bg-white tw-px-4 tw-py-2 tw-text-xs tw-font-bold tw-text-emerald-800 tw-shadow-sm">مبلغ هنگام تأیید دوباره کنترل می‌شود</span></div>
            <div class="tw-mt-6 tw-rounded-2xl tw-border tw-border-sky-200 tw-bg-sky-50 tw-p-4 tw-text-xs tw-leading-7 tw-text-sky-900"><strong>نکته مهم:</strong> تا زمانی که پرداخت را تأیید نکنید، نوبت نهایی نمی‌شود. در صورت انصراف یا پایان مهلت، زمان انتخاب‌شده دوباره آزاد خواهد شد.</div>
          </div>
          <footer class="tw-flex tw-flex-col-reverse tw-gap-3 tw-border-t tw-border-slate-100 tw-bg-slate-50 tw-p-5 sm:tw-flex-row sm:tw-justify-end">
            <button type="button" class="noor-tw-btn-secondary" data-test-payment-cancel ${terminal ? 'disabled' : ''}><i class="icon-close"></i> انصراف از پرداخت</button>
            <button type="button" class="noor-tw-btn-primary" data-test-payment-complete ${terminal ? 'disabled' : ''}><i class="icon-credit-card"></i> ${paid ? 'قبلاً پرداخت شده' : (realGateway ? 'انتقال به زرین‌پال' : 'تأیید پرداخت')}</button>
          </footer>
        </section>
        <div class="tw-text-center"><a class="tw-text-sm tw-font-bold tw-text-noor-700 hover:tw-text-noor-900" href="appointments.html#book">بازگشت به انتخاب نوبت</a></div>
      </div>`;

      if (secureFlow && expiresAt && !terminal) {
        const countdown = qs('[data-checkout-countdown]');
        const tick = () => {
          const remaining = Math.max(0, expiresAt.getTime() - Date.now());
          const minutes = Math.floor(remaining / 60000);
          const seconds = Math.floor((remaining % 60000) / 1000);
          if (countdown) countdown.textContent = `${toFa(minutes)}:${toFa(String(seconds).padStart(2, '0'))}`;
          if (remaining <= 0) {
            clearInterval(timer);
            showToast('مهلت پرداخت پایان یافت؛ ظرفیت آزاد شد و نوبتی ثبت نشد.', 'warning');
            setTimeout(() => window.location.replace('appointments.html?payment=cancelled#book'), 900);
          }
        };
        let timer = null;
        tick();
        timer = setInterval(tick, 1000);
      }

      qs('[data-test-payment-complete]')?.addEventListener('click', async event => {
        const button = event.currentTarget;
        setButtonBusy(button, true, realGateway ? 'در حال انتقال به درگاه...' : 'در حال تأیید پرداخت و ظرفیت...');
        try {
          if (realGateway) {
            if (!app.gateway_url || !/^https:\/\/payment\.zarinpal\.com\//i.test(app.gateway_url)) throw new Error('نشانی امن درگاه پرداخت در دسترس نیست');
            window.location.assign(app.gateway_url);
            return;
          }
          const payment = secureFlow
            ? await api(`/patient/payments/checkout/${encodeURIComponent(checkoutToken)}/test-complete`, { method: 'POST', body: {} })
            : await api(`/patient/payments/test/${legacyAppointmentId}/complete`, { method: 'POST', body: {} });
          const createdAppointmentId = Number(payment.appointment_id || appointmentId || 0);
          root.innerHTML = `<section class="tw-mx-auto tw-max-w-2xl tw-rounded-noor tw-border tw-border-emerald-200 tw-bg-white tw-p-6 tw-text-center tw-shadow-noor sm:tw-p-8"><span class="tw-mx-auto tw-flex tw-h-20 tw-w-20 tw-items-center tw-justify-center tw-rounded-3xl tw-bg-emerald-50 tw-text-3xl tw-text-emerald-700"><i class="icon-check-circle"></i></span><h2 class="tw-mt-5 tw-text-2xl tw-font-black tw-text-clinic-ink">پرداخت شد و نوبت ثبت شد</h2><p class="tw-mt-3 tw-text-sm tw-leading-8 tw-text-slate-600">پرداخت با موفقیت ثبت شد و نوبت شما قطعی است. شماره رسید و پیگیری را برای مراجعه نگه دارید.</p><div class="tw-mt-6 tw-grid tw-gap-3 tw-rounded-2xl tw-bg-slate-50 tw-p-5 tw-text-right sm:tw-grid-cols-2"><div><span class="tw-text-xs tw-font-bold tw-text-slate-500">شماره رسید</span><strong class="tw-mt-1 tw-block tw-text-sm tw-font-black tw-text-clinic-ink">${escapeHtml(payment.receipt_number || '—')}</strong></div><div><span class="tw-text-xs tw-font-bold tw-text-slate-500">شماره پیگیری</span><strong class="tw-mt-1 tw-block tw-text-sm tw-font-black tw-text-clinic-ink">${escapeHtml(payment.reference_number || '—')}</strong></div></div><div class="tw-mt-6 tw-flex tw-flex-col tw-gap-3 sm:tw-flex-row sm:tw-justify-center"><a class="noor-tw-btn-primary" href="appointments.html?payment=paid">بازگشت به نوبت‌های من</a><a class="noor-tw-btn-secondary" href="payments.html">مشاهده پرداخت‌ها</a></div>${createdAppointmentId ? `<p class="tw-mt-4 tw-text-xs tw-font-bold tw-text-slate-500">شماره نوبت: ${toFa(createdAppointmentId)}</p>` : ''}</section>`;
        } catch (error) {
          showPatientError(error);
          setButtonBusy(button, false);
        }
      });

      qs('[data-test-payment-cancel]')?.addEventListener('click', async event => {
        const button = event.currentTarget;
        setButtonBusy(button, true, 'در حال آزادسازی ظرفیت...');
        try {
          const response = secureFlow
            ? await api(`/patient/payments/checkout/${encodeURIComponent(checkoutToken)}/cancel`, { method: 'POST', body: {} })
            : await api(`/patient/payments/test/${legacyAppointmentId}/cancel`, { method: 'POST', body: {} });
          window.location.replace('appointments.html?payment=cancelled#book');
        } catch (error) {
          showPatientError(error);
          setButtonBusy(button, false);
        }
      });
    } catch (error) {
      errorState(error, initTestPayment);
    }
  }

  function renderPaymentsList() {
    if (!state.payments.length) return emptyState('هنوز پرداختی ثبت نشده است', 'پس از ثبت پرداخت توسط کلینیک، رسید آن در این بخش نمایش داده می‌شود.');
    return `<div class="nv-patient-desktop-only"><div class="nv-tw-table-wrap"><table class="nv-tw-table"><thead><tr><th>تاریخ پرداخت</th><th>شرح</th><th>روش</th><th>مبلغ</th><th>وضعیت</th><th>رسید</th></tr></thead><tbody>${state.payments.map(p => `<tr><td>${formatDateTime(paymentDateTimeValue(p))}</td><td><strong class="tw-text-clinic-ink">${escapeHtml(p.doctor_name ? `ویزیت دکتر ${p.doctor_name}` : p.description || 'پرداخت کلینیک')}</strong><div class="tw-mt-1 tw-text-xs tw-text-slate-400">${escapeHtml(p.receipt_number || 'بدون شماره رسید')}</div></td><td>${escapeHtml(paymentMethodLabel(p.payment_method))}</td><td class="tw-font-black tw-text-slate-800">${formatMoney(p.amount)}</td><td>${badge(p.status)}</td><td><button type="button" class="nv-patient-action-btn" data-payment-receipt="${Number(p.id)}"><i class="icon-print"></i> چاپ</button></td></tr>`).join('')}</tbody></table></div></div><div class="nv-patient-mobile-only tw-space-y-3">${state.payments.map(p => `<article class="tw-rounded-2xl tw-border tw-border-slate-200 tw-p-4"><div class="tw-flex tw-items-start tw-justify-between tw-gap-3"><div><strong class="tw-block tw-text-sm tw-font-black tw-text-clinic-ink">${formatMoney(p.amount)}</strong><span class="tw-mt-1 tw-block tw-text-xs tw-text-slate-500">${formatDateTime(paymentDateTimeValue(p))}</span></div>${badge(p.status)}</div><p class="tw-mt-3 tw-text-sm tw-text-slate-600">${escapeHtml(p.doctor_name ? `ویزیت دکتر ${p.doctor_name}` : p.description || 'پرداخت کلینیک')}</p><button type="button" class="noor-tw-btn-secondary tw-mt-4 tw-w-full" data-payment-receipt="${Number(p.id)}"><i class="icon-print"></i> چاپ رسید</button></article>`).join('')}</div>`;
  }

  function paymentMethodLabel(method) {
    return ({ cash: 'نقدی', card: 'کارت‌خوان', online: 'آنلاین', transfer: 'انتقال بانکی', pos: 'کارت‌خوان' })[String(method || '').toLowerCase()] || text(method) || 'ثبت نشده';
  }

  function printReceipt(p) {
    const description = p.doctor_name ? `ویزیت دکتر ${p.doctor_name}` : p.description || 'پرداخت خدمات درمانی';
    printDocument(`رسید پرداخت ${p.receipt_number || p.id}`, `<section class="receipt"><header class="receipt-head"><strong>${escapeHtml(currentClinicName())}</strong><span>رسید پرداخت</span></header><div class="receipt-body"><div class="receipt-row"><span>شماره رسید</span><strong>${escapeHtml(p.receipt_number || toFa(p.id))}</strong></div><div class="receipt-row"><span>تاریخ پرداخت</span><strong>${escapeHtml(formatDateTime(paymentDateTimeValue(p)))}</strong></div><div class="receipt-row"><span>شرح</span><strong>${escapeHtml(description)}</strong></div><div class="receipt-row"><span>روش پرداخت</span><strong>${escapeHtml(paymentMethodLabel(p.payment_method))}</strong></div><div class="receipt-row"><span>وضعیت</span><strong>${escapeHtml(statusInfo(p.status)[0])}</strong></div><div class="receipt-row receipt-total"><span>مبلغ پرداختی</span><strong>${escapeHtml(formatMoney(p.amount))}</strong></div></div><footer class="receipt-foot">این رسید به‌صورت الکترونیکی از پنل زیباجو صادر شده است.</footer></section>`);
  }

  const consentTypeLabels = {
    treatment: 'درمان',
    surgery: 'جراحی',
    image: 'تصویر و رسانه',
    sms: 'پیامک',
    data_processing: 'پردازش داده',
    ai_processing: 'پردازش با هوش مصنوعی'
  };

  function formatDateTime(value) {
    if (!value) return '—';
    const normalized = String(value).trim().replace(' ', 'T');
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) return toFa(String(value));
    try {
      return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
      }).format(parsed);
    } catch (_) { return toFa(parsed.toLocaleString('fa-IR')); }
  }

  function consentTypeLabel(type) {
    return consentTypeLabels[String(type || '')] || text(type) || 'رضایت‌نامه';
  }

  async function initConsents() {
    pageLoading('در حال دریافت رضایت‌نامه‌های شما...');
    try {
      const [documentsResult, historyResult] = await Promise.all([
        api('/consents/documents'),
        api('/consents/me')
      ]);
      const documents = Array.isArray(documentsResult.documents) ? documentsResult.documents : [];
      const history = Array.isArray(historyResult.consents) ? historyResult.consents : [];
      const activeConsents = history.filter(item => !item.revoked_at);
      const activeByType = new Map(activeConsents.map(item => [String(item.consent_type), item]));

      const documentCards = documents.length ? documents.map(doc => {
        const active = activeByType.get(String(doc.consent_type));
        const acceptedCurrent = active && String(active.document_version) === String(doc.version);
        const fieldId = `consentSignedName${Number(doc.id)}`;
        return `<article class="nv-tw-card tw-overflow-hidden" data-consent-document="${Number(doc.id)}">
          <header class="nv-consent-document-head">
            <span class="nv-consent-document-icon" aria-hidden="true"><i class="icon-shield"></i></span>
            <div class="nv-consent-document-copy">
              <div class="nv-consent-document-title-row">
                <strong class="nv-consent-document-type">${escapeHtml(consentTypeLabel(doc.consent_type))}</strong>
                ${acceptedCurrent ? '<span class="nv-tw-badge nv-tw-badge-success"><i class="icon-check tw-ml-1.5"></i>پذیرفته شده</span>' : ''}
              </div>
              <span class="nv-consent-document-version">نسخه ${escapeHtml(toFa(doc.version || '—'))}</span>
              <h2>${escapeHtml(doc.title || consentTypeLabel(doc.consent_type))}</h2>
            </div>
          </header>
          <div class="tw-space-y-5 tw-p-5">
            <details class="tw-rounded-2xl tw-border tw-border-slate-200 tw-bg-white tw-p-4"><summary class="tw-cursor-pointer tw-text-sm tw-font-black tw-text-clinic-ink">مشاهده متن کامل رضایت‌نامه</summary><div class="tw-mt-4 tw-border-t tw-border-slate-100 tw-pt-4 tw-text-sm tw-leading-8 tw-text-slate-600">${multiline(doc.content)}</div></details>
            ${acceptedCurrent ? `<div class="tw-flex tw-items-start tw-gap-3 tw-rounded-2xl tw-border tw-border-emerald-200 tw-bg-emerald-50 tw-p-4"><i class="icon-check-circle tw-mt-1 tw-text-emerald-700"></i><p class="tw-text-sm tw-leading-7 tw-text-emerald-900">این نسخه با نام <strong>${escapeHtml(active.signed_name || 'ثبت‌شده')}</strong> در ${escapeHtml(formatDateTime(active.accepted_at))} پذیرفته شده است.</p></div>` : `<div class="tw-grid tw-gap-3 sm:tw-grid-cols-[1fr_auto] sm:tw-items-end"><div><label class="noor-tw-label" for="${fieldId}">نام و نام خانوادگی تأییدکننده</label><input id="${fieldId}" class="noor-tw-input" type="text" autocomplete="name" maxlength="255" placeholder="نام کامل خود را وارد کنید" data-consent-signed-name></div><button type="button" class="noor-tw-btn-primary " data-consent-accept="${Number(doc.id)}"><i class="icon-check"></i> مطالعه کردم و می‌پذیرم</button></div>`}
          </div>
        </article>`;
      }).join('') : emptyState('رضایت‌نامه فعالی وجود ندارد', 'در حال حاضر سند جدیدی برای بررسی و تأیید منتشر نشده است.');

      const historyCards = history.length ? history.map(item => {
        const active = !item.revoked_at;
        const statusLabel = active ? 'فعال' : 'لغوشده';
        const statusIcon = active ? 'icon-check' : 'icon-close';
        return `<article class="nv-consent-history-item ${active ? 'is-active' : 'is-revoked'}">
          <span class="nv-consent-history-marker" aria-label="${statusLabel}"><i class="${statusIcon}" aria-hidden="true"></i></span>
          <div class="nv-consent-history-body">
            <header class="nv-consent-history-head">
              <div class="nv-consent-history-title-wrap">
                <strong>${escapeHtml(item.title || consentTypeLabel(item.consent_type))}</strong>
                <span class="nv-consent-history-state">${statusLabel}</span>
              </div>
              <span class="nv-consent-history-version">نسخه ${escapeHtml(toFa(item.document_version || '—'))}</span>
            </header>
            <dl class="nv-consent-history-meta">
              <div><dt>زمان پذیرش</dt><dd>${escapeHtml(formatDateTime(item.accepted_at))}</dd></div>
              ${item.signed_name ? `<div><dt>تأییدکننده</dt><dd>${escapeHtml(item.signed_name)}</dd></div>` : ''}
              ${item.revoked_at ? `<div class="is-revoked-row"><dt>زمان لغو</dt><dd>${escapeHtml(formatDateTime(item.revoked_at))}</dd></div>` : ''}
              ${item.revocation_reason ? `<div class="is-revoked-row"><dt>دلیل لغو</dt><dd>${escapeHtml(item.revocation_reason)}</dd></div>` : ''}
            </dl>
            ${active ? `<button type="button" class="nv-consent-history-revoke" data-consent-revoke="${Number(item.id)}" data-consent-label="${escapeHtml(consentTypeLabel(item.consent_type))}"><i class="icon-close" aria-hidden="true"></i><span>لغو رضایت</span></button>` : ''}
          </div>
        </article>`;
      }).join('') : emptyState('سابقه‌ای ثبت نشده است', 'پس از پذیرش هر رضایت‌نامه، نسخه و زمان آن در این بخش نگهداری می‌شود.');

      root.innerHTML = `<div class="tw-space-y-6">
        <section class="nv-patient-consent-intro" aria-labelledby="patientConsentIntroTitle">
          <span class="nv-patient-consent-intro-icon"><i class="icon-shield" aria-hidden="true"></i></span>
          <div><span class="nv-patient-consent-kicker">کنترل حریم خصوصی و درمان</span><h2 id="patientConsentIntroTitle">رضایت‌نامه چیست؟</h2><p>رضایت‌نامه مجوزی است که شما پس از مطالعه برای یک موضوع مشخص ثبت می‌کنید. در این بخش می‌توانید متن‌ها را بخوانید، موارد لازم را تأیید کنید و سابقه تصمیم‌های خود را ببینید.</p></div>
        </section>
        <section class="tw-grid tw-gap-4 sm:tw-grid-cols-3">${statCard('icon-file-text', 'نیازمند بررسی', documents.filter(doc => { const active = activeByType.get(String(doc.consent_type)); return !active || String(active.document_version) !== String(doc.version); }).length, 'متن‌هایی که هنوز نپذیرفته‌اید', 'noor')}${statCard('icon-check-circle', 'رضایت‌های فعال', activeConsents.length, 'مجوزهای معتبر فعلی', 'emerald')}${statCard('icon-history', 'سوابق ثبت‌شده', history.length, 'پذیرش‌ها و لغوهای قبلی', 'violet')}</section>
        <section class="tw-grid tw-gap-6 xl:tw-grid-cols-[minmax(0,1.8fr)_minmax(320px,.8fr)]"><div class="tw-space-y-5"><div><h2 class="tw-text-lg tw-font-black tw-text-clinic-ink">اسناد و مجوزهای قابل بررسی</h2><p class="tw-mt-1 tw-text-sm tw-leading-7 tw-text-slate-500">موضوع، متن و نسخه هر سند را پیش از پذیرش کامل مطالعه کنید.</p></div>${documentCards}</div><aside class="tw-space-y-5"><section class="nv-tw-card nv-consent-history-panel"><header class="nv-consent-history-panel-head"><span class="nv-consent-history-panel-icon" aria-hidden="true"><i class="icon-history"></i></span><div><h2>سابقه تصمیم‌های شما</h2><p>رضایت‌های فعال، لغوشده و نسخه‌های قبلی</p></div></header><div class="nv-consent-history-list">${historyCards}</div></section></aside></section>
        <div id="consentRevokeModal" class="nv-patient-modal tw-hidden" data-modal role="alertdialog" aria-modal="true" aria-hidden="true" aria-labelledby="consentRevokeTitle"><div class="nv-patient-modal-panel tw-max-w-lg"><form id="consentRevokeForm" class="tw-p-6"><div class="tw-text-center"><span class="tw-mx-auto tw-flex tw-h-16 tw-w-16 tw-items-center tw-justify-center tw-rounded-2xl tw-bg-rose-50 tw-text-2xl tw-text-rose-700"><i class="icon-warning"></i></span><h2 id="consentRevokeTitle" class="tw-mt-4 tw-text-xl tw-font-black tw-text-clinic-ink">لغو رضایت</h2><p class="tw-mt-2 tw-text-sm tw-leading-7 tw-text-slate-600" data-consent-revoke-summary></p></div><div class="tw-mt-5"><label class="noor-tw-label" for="consentRevokeReason">دلیل لغو</label><textarea id="consentRevokeReason" class="noor-tw-input tw-min-h-28" name="reason" minlength="3" maxlength="500" required placeholder="دلیل لغو رضایت را بنویسید"></textarea></div><div class="tw-mt-6 tw-flex tw-flex-col-reverse tw-gap-3 sm:tw-flex-row sm:tw-justify-center"><button type="button" class="noor-tw-btn-secondary" data-modal-close>انصراف</button><button type="submit" class="tw-inline-flex tw-items-center tw-justify-center tw-gap-2 tw-rounded-xl tw-bg-rose-600 tw-px-5 tw-py-2.5 tw-text-sm tw-font-bold tw-text-white hover:tw-bg-rose-700"><i class="icon-close"></i> ثبت لغو رضایت</button></div></form></div></div>
      </div>`;

      qsa('[data-consent-accept]', root).forEach(button => button.addEventListener('click', async () => {
        const card = button.closest('[data-consent-document]');
        const signedName = text(qs('[data-consent-signed-name]', card)?.value);
        if (signedName.length < 3) { showToast('نام و نام خانوادگی تأییدکننده را کامل وارد کنید.', 'warning'); return; }
        setButtonBusy(button, true, 'در حال ثبت...');
        try {
          await api(`/consents/${encodeURIComponent(button.dataset.consentAccept)}/accept`, { method: 'POST', body: { signed_name: signedName } });
          showToast('رضایت شما ثبت شد.', 'success');
          await initConsents();
        } catch (error) { showPatientError(error); setButtonBusy(button, false); }
      }));

      let revokeConsentId = null;
      qsa('[data-consent-revoke]', root).forEach(button => button.addEventListener('click', () => {
        revokeConsentId = Number(button.dataset.consentRevoke);
        qs('[data-consent-revoke-summary]', root).textContent = `در حال لغو رضایت «${button.dataset.consentLabel || 'انتخاب‌شده'}» هستید. این تغییر در سوابق شما ثبت می‌شود.`;
        qs('#consentRevokeReason', root).value = '';
        openModal('consentRevokeModal', button);
      }));
      qs('#consentRevokeForm', root)?.addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget;
        if (!form.reportValidity() || !revokeConsentId) return;
        const button = qs('[type="submit"]', form);
        setButtonBusy(button, true, 'در حال ثبت...');
        try {
          await api(`/consents/${encodeURIComponent(revokeConsentId)}/revoke`, { method: 'POST', body: { reason: text(qs('#consentRevokeReason', form).value) } });
          closeModal('consentRevokeModal');
          showToast('رضایت با موفقیت لغو شد.', 'success');
          await initConsents();
        } catch (error) { showPatientError(error); setButtonBusy(button, false); }
      });
    } catch (error) { errorState(error, initConsents); }
  }


  function patientNotificationTone(type) {
    const value = String(type || 'info').toLowerCase();
    if (value === 'success') return { icon: 'icon-check', className: 'is-success' };
    if (value === 'warning') return { icon: 'icon-warning', className: 'is-warning' };
    if (value === 'danger' || value === 'error') return { icon: 'icon-alert', className: 'is-danger' };
    return { icon: 'icon-bell', className: 'is-info' };
  }

  function renderPatientNotificationList() {
    const container = qs('[data-patient-notifications-list]');
    if (!container) return;
    if (!state.notifications.length) {
      container.innerHTML = emptyState('اعلان تازه‌ای ندارید', 'پیام‌ها و یادآوری‌های جدید در این بخش نمایش داده می‌شوند.');
      return;
    }
    container.innerHTML = state.notifications.map(item => {
      const tone = patientNotificationTone(item.type);
      const unread = !item.is_read;
      return `<article class="nv-patient-notification-card ${tone.className} ${unread ? 'is-unread' : 'is-read'}" data-patient-notification-card="${Number(item.id)}">
        <span class="nv-patient-notification-icon"><i class="${tone.icon}" aria-hidden="true"></i></span>
        <div class="nv-patient-notification-copy"><div class="nv-patient-notification-title-row"><h3>${escapeHtml(item.title || 'اعلان')}</h3>${unread ? '<span class="nv-patient-notification-new">جدید</span>' : ''}</div><p>${escapeHtml(item.message || 'پیام جدیدی برای شما ثبت شده است.')}</p><time>${escapeHtml(formatDateTime(item.created_at))}</time></div>
        ${unread ? `<button type="button" class="nv-patient-notification-read" data-patient-notification-read="${Number(item.id)}"><i class="icon-check" aria-hidden="true"></i><span>خواندم</span></button>` : '<span class="nv-patient-notification-read-state"><i class="icon-check" aria-hidden="true"></i> خوانده‌شده</span>'}
      </article>`;
    }).join('');

    qsa('[data-patient-notification-read]', container).forEach(button => button.addEventListener('click', async () => {
      setButtonBusy(button, true, 'در حال ثبت...');
      try {
        await api(`/notifications/${encodeURIComponent(button.dataset.patientNotificationRead)}/read`, { method: 'POST' });
        const item = state.notifications.find(entry => Number(entry.id) === Number(button.dataset.patientNotificationRead));
        if (item) item.is_read = true;
        renderNotificationIndicator(state.notifications.filter(entry => !entry.is_read).length);
        window.dispatchEvent(new CustomEvent('noorvista:notifications-changed'));
        await initNotifications();
      } catch (error) {
        showPatientError(error, 'ثبت وضعیت اعلان ممکن نشد. لطفاً دوباره تلاش کنید.');
        setButtonBusy(button, false);
      }
    }));
  }

  async function initNotifications() {
    pageLoading('در حال دریافت اعلان‌ها...');
    try {
      const result = await api('/notifications?limit=100');
      state.notifications = Array.isArray(result.notifications) ? result.notifications : [];
      const unread = state.notifications.filter(item => !item.is_read).length;
      renderNotificationIndicator(unread);
      root.innerHTML = `<div class="tw-space-y-6">
        <section class="nv-patient-notification-hero"><div><span><i class="icon-bell" aria-hidden="true"></i> پیام‌ها و یادآوری‌ها</span><h2>اعلان‌های شما</h2><p>یادآوری نوبت‌ها و پیام‌های کلینیک را در این بخش دنبال کنید.</p></div><span class="nv-patient-notification-hero-icon"><i class="icon-bell" aria-hidden="true"></i></span></section>
        <section class="tw-grid tw-grid-cols-1 tw-gap-4 sm:tw-grid-cols-3">${statCard('icon-bell', 'همه اعلان‌ها', state.notifications.length, 'پیام‌های ثبت‌شده', 'noor')}${statCard('icon-envelope', 'خوانده‌نشده', unread, 'نیازمند توجه شما', unread ? 'amber' : 'emerald')}${statCard('icon-check-circle', 'خوانده‌شده', state.notifications.length - unread, 'پیام‌های بررسی‌شده', 'emerald')}</section>
        <section class="nv-tw-card"><header class="nv-tw-card-header"><div><h2 class="tw-text-lg tw-font-black tw-text-clinic-ink">فهرست اعلان‌ها</h2><p class="tw-mt-1 tw-text-sm tw-text-slate-500">جدیدترین پیام‌ها در ابتدای فهرست قرار دارند</p></div>${unread ? `<span class="nv-tw-badge nv-tw-badge-warning">${toFa(unread)} اعلان جدید</span>` : '<span class="nv-tw-badge nv-tw-badge-success">همه خوانده شده‌اند</span>'}</header><div class="nv-tw-card-body"><div class="nv-patient-notification-list" data-patient-notifications-list></div></div></section>
      </div>`;
      renderPatientNotificationList();
    } catch (error) { errorState(error, initNotifications); }
  }

  async function initProfile() {
    pageLoading('در حال دریافت اطلاعات شما...');
    try {
      const result = await api('/patient/profile');
      const profile = result.patient || {};
      root.innerHTML = `<div class="tw-space-y-6">
        <section class="tw-overflow-hidden tw-rounded-noor tw-bg-gradient-to-l tw-from-noor-900 tw-via-indigo-800 tw-to-violet-600 tw-p-6 tw-text-white tw-shadow-noor sm:tw-p-8">
          <div class="tw-flex tw-flex-col tw-gap-5 md:tw-flex-row md:tw-items-center md:tw-justify-between">
            <div class="tw-max-w-2xl"><span class="tw-inline-flex tw-items-center tw-gap-2 tw-rounded-full tw-bg-white/15 tw-px-3 tw-py-1.5 tw-text-xs tw-font-bold"><i class="icon-shield"></i> پرونده سلامت</span><h2 class="tw-mt-5 tw-text-2xl tw-font-black tw-leading-relaxed sm:tw-text-3xl">اطلاعات خود را به‌روز نگه دارید</h2><p class="tw-mt-2 tw-text-sm tw-leading-7 tw-text-violet-100">اطلاعات تماس و پزشکی ضروری را بررسی و تکمیل کنید.</p></div>
            <span class="tw-flex tw-h-20 tw-w-20 tw-flex-none tw-items-center tw-justify-center tw-rounded-3xl tw-bg-white/10 tw-text-3xl tw-ring-1 tw-ring-white/20"><i class="icon-user"></i></span>
          </div>
        </section>
        <div class="tw-grid tw-gap-6 xl:tw-grid-cols-[minmax(0,1.8fr)_minmax(320px,.8fr)]">
          <div class="tw-space-y-6">
            <section class="nv-tw-card nv-profile-card">
              <div class="nv-profile-card-intro"><div><span class="nv-profile-card-kicker">پرونده پایه بیمار</span><h2>اطلاعات هویتی، تماس و سلامت</h2><p>موارد ستاره‌دار برای هماهنگی خدمات ضروری‌اند. سایر اطلاعات را هر زمان می‌توانید تکمیل کنید.</p></div><span class="nv-profile-card-icon"><i class="icon-address-card"></i></span></div>
              <form id="patientProfileForm" class="tw-space-y-6 tw-p-5 sm:tw-p-6" novalidate>
                <section class="nv-profile-section nv-profile-section-identity">
                  <header class="nv-profile-section-header"><span class="nv-profile-section-icon"><i class="icon-user"></i></span><div><span class="nv-profile-step">بخش ۱</span><h3>هویت و راه‌های ارتباطی</h3><p>اطلاعاتی که برای شناسایی و تماس با شما استفاده می‌شود.</p></div></header>
                  <div class="nv-profile-fields">
                    <div class="nv-profile-field"><label class="noor-tw-label" for="fullName">نام و نام خانوادگی <span class="tw-text-rose-600">*</span></label><div class="nv-profile-input-wrap"><i class="icon-user" aria-hidden="true"></i><input id="fullName" name="full_name" class="noor-tw-input nv-profile-input" type="text" maxlength="200" autocomplete="name" required></div></div>
                    <div class="nv-profile-field"><label class="noor-tw-label" for="nationalCode">کد ملی</label><div class="nv-profile-input-wrap"><i class="icon-id-card" aria-hidden="true"></i><input id="nationalCode" name="national_code" class="noor-tw-input nv-profile-input" type="text" inputmode="numeric" maxlength="20" autocomplete="off"></div><p class="nv-profile-help">برای تطبیق پرونده و جلوگیری از ثبت تکراری</p></div>
                    <div class="nv-profile-field"><label class="noor-tw-label" for="phone">شماره تلفن <span class="tw-text-rose-600">*</span></label><div class="nv-profile-input-wrap"><i class="icon-phone" aria-hidden="true"></i><input id="phone" name="phone" class="noor-tw-input nv-profile-input" type="tel" inputmode="tel" maxlength="20" autocomplete="tel" required></div></div>
                    <div class="nv-profile-field"><label class="noor-tw-label" for="email">ایمیل</label><div class="nv-profile-input-wrap"><i class="icon-envelope" aria-hidden="true"></i><input id="email" name="email" class="noor-tw-input nv-profile-input" type="email" maxlength="200" autocomplete="email"></div></div>
                    <div class="nv-profile-field"><label class="noor-tw-label" for="birthDate">تاریخ تولد</label><div class="nv-jalali-field"><input id="birthDate" class="noor-tw-input nv-jalali-display" type="text" inputmode="none" autocomplete="off" readonly placeholder="انتخاب از تقویم شمسی" data-nv-jalali-input data-date-target="birthDateIso" data-date-label="تاریخ تولد" data-date-mode="birth" data-max-today="true" data-optional="true"><input id="birthDateIso" name="birth_date" type="hidden"><button type="button" class="nv-jalali-trigger" data-nv-date-open aria-label="باز کردن تقویم تاریخ تولد"><i class="icon-calendar" aria-hidden="true"></i></button></div></div>
                    <div class="nv-profile-field"><label class="noor-tw-label" for="gender">جنسیت</label><div class="nv-profile-input-wrap"><i class="icon-users" aria-hidden="true"></i><select id="gender" name="gender" class="noor-tw-input nv-profile-input"><option value="">انتخاب نشده</option><option value="male">مرد</option><option value="female">زن</option><option value="other">سایر / ترجیح می‌دهم نگویم</option></select></div></div>
                    <div class="nv-profile-field nv-profile-field-wide"><label class="noor-tw-label" for="address">نشانی</label><div class="nv-profile-input-wrap nv-profile-textarea-wrap"><i class="icon-map-marker" aria-hidden="true"></i><textarea id="address" name="address" class="noor-tw-input nv-profile-input tw-min-h-24 tw-resize-y" maxlength="1000" autocomplete="street-address" placeholder="استان، شهر، خیابان و پلاک"></textarea></div></div>
                  </div>
                </section>

                <section class="nv-profile-section nv-profile-section-insurance">
                  <header class="nv-profile-section-header"><span class="nv-profile-section-icon"><i class="icon-credit-card"></i></span><div><span class="nv-profile-step">بخش ۲</span><h3>پوشش بیمه</h3><p>برای بررسی پوشش خدمات و ثبت دقیق‌تر هزینه‌ها.</p></div></header>
                  <div class="nv-profile-fields"><div class="nv-profile-field"><label class="noor-tw-label" for="insuranceProvider">نام بیمه‌گر</label><div class="nv-profile-input-wrap"><i class="icon-building" aria-hidden="true"></i><select id="insuranceProvider" name="insurance_provider" class="noor-tw-input nv-profile-input"><option value="">انتخاب بیمه‌گر</option><option value="بدون بیمه">بدون بیمه</option><option value="بیمه سلامت ایرانیان">بیمه سلامت ایرانیان</option><option value="سازمان تأمین اجتماعی">سازمان تأمین اجتماعی</option><option value="خدمات درمانی نیروهای مسلح">خدمات درمانی نیروهای مسلح</option><option value="بیمه ایران">بیمه ایران</option><option value="بیمه آسیا">بیمه آسیا</option><option value="بیمه البرز">بیمه البرز</option><option value="بیمه دانا">بیمه دانا</option><option value="بیمه دی">بیمه دی</option><option value="بیمه سامان">بیمه سامان</option><option value="بیمه پاسارگاد">بیمه پاسارگاد</option><option value="بیمه پارسیان">بیمه پارسیان</option><option value="بیمه کارآفرین">بیمه کارآفرین</option><option value="بیمه رازی">بیمه رازی</option><option value="بیمه معلم">بیمه معلم</option><option value="بیمه ملت">بیمه ملت</option><option value="بیمه نوین">بیمه نوین</option><option value="بیمه تعاون">بیمه تعاون</option><option value="بیمه سینا">بیمه سینا</option><option value="بیمه سرمد">بیمه سرمد</option><option value="بیمه کوثر">بیمه کوثر</option><option value="بیمه ما">بیمه ما</option><option value="بیمه حکمت صبا">بیمه حکمت صبا</option><option value="بیمه تجارت نو">بیمه تجارت نو</option><option value="بیمه آرمان">بیمه آرمان</option><option value="بیمه حافظ">بیمه حافظ</option><option value="بیمه امید">بیمه امید</option><option value="بیمه زندگی خاورمیانه">بیمه زندگی خاورمیانه</option><option value="سایر">سایر</option></select></div></div><div class="nv-profile-field"><label class="noor-tw-label" for="insuranceNumber">شماره بیمه</label><div class="nv-profile-input-wrap"><i class="icon-hashtag" aria-hidden="true"></i><input id="insuranceNumber" name="insurance_number" class="noor-tw-input nv-profile-input" type="text" inputmode="numeric" maxlength="80" placeholder="مثلاً ۱۲۳۴۵۶۷۸۹۰"></div></div></div>
                </section>

                <section class="nv-profile-section nv-profile-section-health">
                  <header class="nv-profile-section-header"><span class="nv-profile-section-icon"><i class="icon-heartbeat"></i></span><div><span class="nv-profile-step">بخش ۳</span><h3>اطلاعات مهم سلامت</h3><p>این موارد در تصمیم‌گیری بالینی و پیشگیری از خطاهای درمانی مؤثر است.</p></div></header>
                  <div class="nv-health-grid">
                    <div class="nv-health-field nv-health-field-rose"><label class="noor-tw-label" for="allergies"><i class="icon-warning"></i> حساسیت‌ها</label><textarea id="allergies" name="allergies" class="noor-tw-input tw-min-h-28 tw-resize-y" maxlength="2000" placeholder="حساسیت دارویی، غذایی یا محیطی"></textarea></div>
                    <div class="nv-health-field nv-health-field-amber"><label class="noor-tw-label" for="chronicDiseases"><i class="icon-heartbeat"></i> بیماری‌های زمینه‌ای</label><textarea id="chronicDiseases" name="chronic_diseases" class="noor-tw-input tw-min-h-28 tw-resize-y" maxlength="2000" placeholder="برای مثال: دیابت، فشار خون یا بیماری قلبی"></textarea></div>
                    <div class="nv-health-field nv-health-field-sky"><label class="noor-tw-label" for="medications"><i class="icon-medkit"></i> داروهای فعلی</label><textarea id="medications" name="medications" class="noor-tw-input tw-min-h-28 tw-resize-y" maxlength="2000" placeholder="نام دارو و مقدار مصرف در صورت اطلاع"></textarea></div>
                    <div class="nv-health-field nv-health-field-violet"><label class="noor-tw-label" for="medicalHistory"><i class="icon-file-text"></i> سابقه پزشکی مهم</label><textarea id="medicalHistory" name="medical_history" class="noor-tw-input tw-min-h-28 tw-resize-y" maxlength="3000" placeholder="عمل جراحی، بستری یا سابقه مهم درمانی"></textarea></div>
                  </div>
                </section>

                <section class="nv-profile-section nv-profile-section-emergency">
                  <header class="nv-profile-section-header"><span class="nv-profile-section-icon"><i class="icon-phone"></i></span><div><span class="nv-profile-step">بخش ۴</span><h3>تماس اضطراری</h3><p>فرد مورد اعتمادی که در شرایط ضروری با او تماس گرفته می‌شود.</p></div></header>
                  <div class="nv-profile-fields"><div class="nv-profile-field"><label class="noor-tw-label" for="emergencyName">نام فرد مورد اعتماد</label><div class="nv-profile-input-wrap"><i class="icon-user" aria-hidden="true"></i><input id="emergencyName" name="emergency_contact_name" class="noor-tw-input nv-profile-input" type="text" maxlength="150"></div></div><div class="nv-profile-field"><label class="noor-tw-label" for="emergencyPhone">شماره تماس اضطراری</label><div class="nv-profile-input-wrap"><i class="icon-phone" aria-hidden="true"></i><input id="emergencyPhone" name="emergency_contact_phone" class="noor-tw-input nv-profile-input" type="tel" inputmode="tel" maxlength="30"></div></div></div>
                </section>

                <div class="nv-profile-savebar"><div class="tw-flex tw-items-start tw-gap-3"><span class="nv-profile-save-icon"><i class="icon-lock"></i></span><div><strong>ذخیره امن تغییرات</strong><p>با ذخیره، صحت اطلاعات واردشده را تأیید می‌کنید.</p></div></div><button type="submit" class="noor-tw-btn-primary sm:tw-min-w-44"><i class="icon-save"></i> ذخیره تغییرات</button></div>
              </form>
            </section>

            <section class="nv-tw-card"><header class="nv-tw-card-header"><div><h2 class="tw-text-lg tw-font-black tw-text-clinic-ink">تغییر رمز عبور</h2><p class="tw-mt-1 tw-text-sm tw-text-slate-500">برای امنیت بیشتر از رمز منحصربه‌فرد استفاده کنید</p></div></header><div class="nv-tw-card-body"><form id="patientPasswordForm" class="tw-space-y-5" novalidate><div><label class="noor-tw-label" for="currentPassword">رمز عبور فعلی</label><div class="tw-relative"><input id="currentPassword" name="old_password" class="noor-tw-input tw-pl-12" type="password" autocomplete="current-password" required><button type="button" class="nv-patient-password-toggle" data-password-toggle="currentPassword" aria-label="نمایش رمز عبور"><i class="icon-eye"></i></button></div></div><div class="tw-grid tw-gap-5 md:tw-grid-cols-2"><div><label class="noor-tw-label" for="newPassword">رمز عبور جدید</label><div class="tw-relative"><input id="newPassword" name="new_password" class="noor-tw-input tw-pl-12" type="password" minlength="8" autocomplete="new-password" required><button type="button" class="nv-patient-password-toggle" data-password-toggle="newPassword" aria-label="نمایش رمز عبور"><i class="icon-eye"></i></button></div></div><div><label class="noor-tw-label" for="confirmPassword">تکرار رمز جدید</label><div class="tw-relative"><input id="confirmPassword" name="confirm_password" class="noor-tw-input tw-pl-12" type="password" minlength="8" autocomplete="new-password" required><button type="button" class="nv-patient-password-toggle" data-password-toggle="confirmPassword" aria-label="نمایش رمز عبور"><i class="icon-eye"></i></button></div></div></div><div><div class="tw-flex tw-items-center tw-justify-between"><span class="tw-text-xs tw-font-bold tw-text-slate-500">قدرت رمز عبور</span><span class="tw-text-xs tw-font-bold tw-text-slate-500" data-password-strength-label>وارد نشده</span></div><div class="tw-mt-2 tw-grid tw-grid-cols-4 tw-gap-2" aria-hidden="true"><span class="tw-h-1.5 tw-rounded-full tw-bg-slate-200" data-strength-bar></span><span class="tw-h-1.5 tw-rounded-full tw-bg-slate-200" data-strength-bar></span><span class="tw-h-1.5 tw-rounded-full tw-bg-slate-200" data-strength-bar></span><span class="tw-h-1.5 tw-rounded-full tw-bg-slate-200" data-strength-bar></span></div><p class="tw-mt-2 tw-text-xs tw-leading-6 tw-text-slate-500">حداقل ۸ کاراکتر و شامل حرف و عدد؛ استفاده از نماد نیز توصیه می‌شود.</p></div><button type="submit" class="noor-tw-btn-primary"><i class="icon-lock"></i> تغییر رمز عبور</button></form></div></section>
          </div>
          <aside class="tw-space-y-6"><section class="nv-tw-card tw-sticky tw-top-28"><div class="tw-p-5"><div class="tw-flex tw-items-center tw-gap-4"><span class="tw-flex tw-h-16 tw-w-16 tw-items-center tw-justify-center tw-rounded-2xl tw-bg-gradient-to-br tw-from-noor-500 tw-to-indigo-700 tw-text-xl tw-font-black tw-text-white" data-profile-avatar>ز</span><div><h2 class="tw-text-base tw-font-black tw-text-clinic-ink" data-profile-name>کاربر گرامی</h2><p class="tw-mt-1 tw-text-xs tw-text-slate-500">حساب زیباجو</p></div></div><div class="tw-mt-6"><div class="tw-flex tw-items-center tw-justify-between"><span class="tw-text-xs tw-font-bold tw-text-slate-500">میزان تکمیل اطلاعات</span><strong class="tw-text-sm tw-font-black tw-text-noor-700" data-profile-completion>۰٪</strong></div><div class="tw-mt-2 tw-h-2 tw-overflow-hidden tw-rounded-full tw-bg-slate-100"><span class="tw-block tw-h-full tw-rounded-full tw-bg-noor-600 tw-transition-all" data-profile-progress style="width:0%"></span></div><p class="tw-mt-3 tw-text-xs tw-leading-6 tw-text-slate-500" data-profile-completion-note>اطلاعات خود را تکمیل کنید.</p></div><div class="tw-mt-6 tw-space-y-3"><div class="tw-flex tw-items-start tw-gap-3 tw-rounded-2xl tw-bg-emerald-50 tw-p-4"><i class="icon-lock tw-mt-1 tw-text-emerald-700"></i><p class="tw-text-xs tw-leading-7 tw-text-emerald-800">اطلاعات سلامت شما فقط برای ارائه خدمات درمانی مجاز استفاده می‌شود.</p></div><div class="tw-flex tw-items-start tw-gap-3 tw-rounded-2xl tw-bg-amber-50 tw-p-4"><i class="icon-info tw-mt-1 tw-text-amber-700"></i><p class="tw-text-xs tw-leading-7 tw-text-amber-800">در دستگاه عمومی، رمز را ذخیره نکنید و پس از پایان کار خارج شوید.</p></div></div></div></section></aside>
        </div>
      </div>`;
      populateProfile(profile);
      bindProfilePage();
    } catch (error) { errorState(error, initProfile); }
  }

  function populateProfile(profile) {
    const insuranceSelect = document.getElementById('insuranceProvider');
    const savedInsurance = text(profile.insurance_provider);
    if (insuranceSelect && savedInsurance && !Array.from(insuranceSelect.options).some(option => option.value === savedInsurance)) {
      insuranceSelect.add(new Option(savedInsurance, savedInsurance));
    }
    const values = {
      fullName: profile.full_name,
      nationalCode: profile.national_code,
      phone: profile.phone,
      email: profile.email,
      birthDateIso: profile.birth_date ? String(profile.birth_date).slice(0, 10) : '',
      gender: profile.gender,
      insuranceProvider: profile.insurance_provider,
      insuranceNumber: profile.insurance_number,
      address: profile.address,
      allergies: profile.allergies,
      chronicDiseases: profile.chronic_diseases,
      medications: profile.medications,
      medicalHistory: profile.medical_history,
      emergencyName: profile.emergency_contact_name,
      emergencyPhone: profile.emergency_contact_phone
    };
    Object.entries(values).forEach(([id, value]) => { const el = document.getElementById(id); if (el) el.value = value || ''; });
    qsa('select', root).forEach(syncProfessionalSelect);
    refreshUnifiedSelects();
    bindJalaliDatePickers(root);
    qsa('[data-nv-jalali-input]', root).forEach(syncJalaliDisplay);
    qs('[data-profile-name]').textContent = profile.full_name || 'کاربر گرامی';
    qs('[data-profile-avatar]').textContent = (profile.full_name || 'ب').trim().charAt(0);
    updateProfileCompletion();
  }

  function bindProfilePage() {
    bindJalaliDatePickers(root);
    qs('#patientProfileForm')?.addEventListener('input', updateProfileCompletion);
    qs('#patientProfileForm')?.addEventListener('submit', submitProfile);
    qs('#patientPasswordForm')?.addEventListener('submit', submitPassword);
    qs('#newPassword')?.addEventListener('input', updatePasswordStrength);
    qsa('[data-password-toggle]').forEach(button => button.addEventListener('click', () => {
      const input = document.getElementById(button.dataset.passwordToggle);
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
      button.setAttribute('aria-label', input.type === 'password' ? 'نمایش رمز عبور' : 'پنهان‌کردن رمز عبور');
      qs('i', button).className = input.type === 'password' ? 'icon-eye' : 'icon-eye-slash';
    }));
  }

  function updateProfileCompletion() {
    const ids = ['fullName', 'phone', 'email', 'birthDateIso', 'gender', 'address', 'emergencyName', 'emergencyPhone', 'allergies', 'chronicDiseases'];
    const completed = ids.filter(id => text(document.getElementById(id)?.value)).length;
    const percent = Math.round(completed / ids.length * 100);
    qs('[data-profile-completion]').textContent = `${toFa(percent)}٪`;
    qs('[data-profile-progress]').style.width = `${percent}%`;
    qs('[data-profile-completion-note]').textContent = percent === 100 ? 'اطلاعات سلامت شما کامل است.' : `${toFa(ids.length - completed)} مورد برای تکمیل باقی مانده است.`;
  }

  async function submitProfile(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const button = qs('[type="submit"]', form);
    const payload = Object.fromEntries(new FormData(form).entries());
    if (payload.birth_date && payload.birth_date > isoToday()) { showToast('تاریخ تولد نمی‌تواند در آینده باشد.', 'warning'); return; }
    setButtonBusy(button, true, 'در حال ذخیره...');
    try {
      await api('/patient/profile', { method: 'PUT', body: payload });
      updateStoredUser(payload);
      qs('[data-profile-name]').textContent = payload.full_name || 'کاربر گرامی';
      qs('[data-profile-avatar]').textContent = (payload.full_name || 'ب').trim().charAt(0);
      showToast('اطلاعات شما با موفقیت به‌روزرسانی شد.', 'success');
    } catch (error) { showPatientError(error); }
    finally { setButtonBusy(button, false); }
  }

  function passwordScore(value) {
    let score = 0;
    if (value.length >= 8) score++;
    if (value.length >= 12) score++;
    if (/[A-Za-z\u0600-\u06FF]/.test(value) && /\d/.test(value)) score++;
    if (/[^A-Za-z\d\u0600-\u06FF]/.test(value)) score++;
    return Math.min(4, score);
  }

  function updatePasswordStrength() {
    const value = qs('#newPassword')?.value || '';
    const score = passwordScore(value);
    const labels = ['وارد نشده', 'ضعیف', 'متوسط', 'خوب', 'قوی'];
    const classes = ['tw-bg-slate-200', 'tw-bg-rose-500', 'tw-bg-amber-500', 'tw-bg-sky-500', 'tw-bg-emerald-500'];
    qs('[data-password-strength-label]').textContent = labels[score];
    qsa('[data-strength-bar]').forEach((bar, index) => {
      bar.className = `tw-h-1.5 tw-rounded-full ${index < score ? classes[score] : 'tw-bg-slate-200'}`;
    });
  }

  async function submitPassword(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const oldPassword = qs('#currentPassword').value;
    const newPassword = qs('#newPassword').value;
    const confirmPassword = qs('#confirmPassword').value;
    if (newPassword !== confirmPassword) { showToast('رمز عبور جدید و تکرار آن یکسان نیست.', 'warning'); return; }
    if (newPassword.length < 8 || !/[A-Za-z\u0600-\u06FF]/.test(newPassword) || !/\d/.test(newPassword)) { showToast('رمز عبور جدید باید حداقل ۸ کاراکتر و شامل حرف و عدد باشد.', 'warning'); return; }
    const button = qs('[type="submit"]', form);
    setButtonBusy(button, true, 'در حال تغییر رمز...');
    try {
      await api('/auth/change-password', { method: 'POST', body: { old_password: oldPassword, new_password: newPassword, confirm_password: confirmPassword } });
      form.reset();
      updatePasswordStrength();
      showToast('رمز عبور با موفقیت تغییر کرد.', 'success');
    } catch (error) { showPatientError(error); }
    finally { setButtonBusy(button, false); }
  }

  async function init() {
    bindModalSystem();
    refreshUnifiedSelects();
    pageLoading('در حال بررسی نشست امن شما...');
    try {
      const ready = await bootstrapPatientSession();
      if (!ready) return;
      void syncNotificationIndicator();
      window.addEventListener('noorvista:notifications-changed', syncNotificationIndicator);
      const handlers = {
        dashboard: initDashboard,
        index: initDashboard,
        appointments: initAppointments,
        'medical-records': initMedicalRecords,
        prescriptions: initPrescriptions,
        payments: initPayments,
        consents: initConsents,
        notifications: initNotifications,
        'test-payment': initTestPayment,
        profile: initProfile
      };
      await (handlers[page] || initDashboard)();
    } catch (error) {
      if (error.status !== 401) errorState(error, init);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
