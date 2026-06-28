
/* Sadra 2.1.87 — clinic-manager E2E utilities, guards and Persian UX */
(function () {
  'use strict';
  if (window.__NOORVISTA_CLINIC_MANAGER_E2E_2187__) return;
  window.__NOORVISTA_CLINIC_MANAGER_E2E_2187__ = true;

  const faDigits = '۰۱۲۳۴۵۶۷۸۹';
  const arDigits = '٠١٢٣٤٥٦٧٨٩';

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function toPersianNumber(value) {
    return String(value ?? '').replace(/\d/g, digit => faDigits[Number(digit)]);
  }

  function toEnglishNumber(value) {
    return String(value ?? '')
      .replace(/[۰-۹]/g, digit => String(faDigits.indexOf(digit)))
      .replace(/[٠-٩]/g, digit => String(arDigits.indexOf(digit)));
  }

  function normalizeApiUrl(endpoint) {
    const raw = String(endpoint || '').trim();
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('/api/')) return raw;
    if (raw.startsWith('api/')) return '/' + raw;
    return '/api/' + raw.replace(/^\/+/, '');
  }

  async function request(endpoint, method = 'GET', data = null) {
    const normalizedMethod = String(method || 'GET').toUpperCase();
    const headers = { Accept: 'application/json' };
    const options = { method: normalizedMethod, credentials: 'same-origin', cache: 'no-store', headers };
    if (data !== null && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(normalizedMethod)) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(data);
    }
    const response = await fetch(normalizeApiUrl(endpoint), options);
    const contentType = response.headers.get('content-type') || '';
    const result = contentType.includes('application/json')
      ? await response.json().catch(() => ({}))
      : { message: await response.text().catch(() => '') };
    if (response.status === 401) {
      const message = result.message || 'نشست شما منقضی شده است. لطفاً دوباره وارد شوید.';
      if (window.SadraPanel?.redirectToLogin) window.SadraPanel.redirectToLogin(message);
      else window.location.replace('/login');
      const error = new Error(message);
      error.status = 401;
      error.payload = result;
      throw error;
    }
    if (!response.ok || result.success === false) {
      const error = new Error(localizeApiMessage(result.message || `خطای سرور با کد ${response.status} رخ داد.`));
      error.status = response.status;
      error.payload = result;
      throw error;
    }
    return result;
  }

  function query(params = {}) {
    return new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '' && value !== 'all')).toString();
  }

  function localizeApiMessage(message, fallback = 'عملیات انجام نشد. لطفاً دوباره تلاش کنید.') {
    const raw = String(message || fallback);
    const normalized = raw.toLowerCase();
    const replacements = [
      [/please fill out this field|fill out this field|required field|is required/, 'پر کردن این فیلد الزامی است.'],
      [/invalid email|email.*invalid/, 'ایمیل واردشده معتبر نیست.'],
      [/invalid phone|phone.*invalid|mobile.*invalid/, 'شماره تماس واردشده معتبر نیست.'],
      [/networkerror|failed to fetch|load failed/, 'ارتباط با سرور برقرار نشد. اتصال شبکه را بررسی کنید.'],
      [/forbidden|access denied|permission|not authorized/, 'شما دسترسی لازم برای انجام این عملیات را ندارید.'],
      [/not found|404/, 'رکورد موردنظر یافت نشد.'],
      [/duplicate|already exists|er_dup_entry/, 'این اطلاعات قبلاً ثبت شده است.'],
      [/server error|internal server error|500/, 'خطای داخلی سرور رخ داد.'],
      [/cannot be null|not null/, 'برخی فیلدهای ضروری خالی مانده‌اند.']
    ];
    for (const [pattern, fa] of replacements) if (pattern.test(normalized)) return fa;
    return toPersianNumber(raw);
  }

  function showPersianInvalidMessage(input) {
    if (!input || typeof input.setCustomValidity !== 'function') return;
    input.setCustomValidity('');
    if (input.validity.valid) return;
    let message = 'مقدار این فیلد معتبر نیست.';
    const label = input.closest('.form-group,.filter-group,.nv-sms-field')?.querySelector('label')?.textContent?.trim() || input.getAttribute('aria-label') || 'این فیلد';
    if (input.validity.valueMissing) message = `${label} الزامی است.`;
    else if (input.validity.typeMismatch && input.type === 'email') message = 'ایمیل واردشده معتبر نیست.';
    else if (input.validity.typeMismatch) message = `${label} معتبر نیست.`;
    else if (input.validity.patternMismatch) message = `فرمت ${label} درست نیست.`;
    else if (input.validity.tooShort) message = `${label} کوتاه است.`;
    else if (input.validity.rangeUnderflow || input.validity.rangeOverflow) message = `${label} خارج از بازه مجاز است.`;
    input.setCustomValidity(message);
  }

  function installPersianValidation(root = document) {
    root.querySelectorAll('input,select,textarea').forEach(input => {
      if (input.dataset.nvPersianValidation === '1') return;
      input.dataset.nvPersianValidation = '1';
      input.addEventListener('invalid', () => showPersianInvalidMessage(input));
      input.addEventListener('input', () => input.setCustomValidity?.(''));
      input.addEventListener('change', () => input.setCustomValidity?.(''));
    });
  }

  function refreshPrettySelects() {
    requestAnimationFrame(() => {
      try { window.NOORVISTA?.refreshUI?.(); } catch (_) {}
      try { window.SadraPrettySelects?.refresh?.(); } catch (_) {}
    });
  }

  function installApiHelpers() {
    window.apiRequest = window.apiRequest || request;
    window.getDoctors = window.getDoctors || (() => request('/api/clinic/doctors'));
    window.getDoctorById = window.getDoctorById || (id => request(`/api/clinic/doctors/${encodeURIComponent(id)}`));
    window.createDoctor = window.createDoctor || (data => request('/api/clinic/doctors', 'POST', data));
    window.updateDoctor = window.updateDoctor || ((id, data) => request(`/api/clinic/doctors/${encodeURIComponent(id)}`, 'PUT', data));
    window.updateDoctorStatus = window.updateDoctorStatus || ((id, active) => request(`/api/clinic/doctors/${encodeURIComponent(id)}/status`, 'PUT', { is_available: !!active, is_active: !!active }));
    window.deleteDoctorApi = window.deleteDoctorApi || (id => request(`/api/clinic/doctors/${encodeURIComponent(id)}`, 'DELETE'));

    window.getStaff = window.getStaff || (() => request('/api/clinic/staff'));
    window.getStaffById = window.getStaffById || (id => request(`/api/clinic/staff/${encodeURIComponent(id)}`));
    window.createStaff = window.createStaff || (data => request('/api/clinic/staff', 'POST', data));
    window.updateStaff = window.updateStaff || ((id, data) => request(`/api/clinic/staff/${encodeURIComponent(id)}`, 'PUT', data));
    window.updateStaffStatus = window.updateStaffStatus || ((id, is_active) => request(`/api/clinic/staff/${encodeURIComponent(id)}/status`, 'PUT', { is_active: !!is_active }));
    window.deleteStaff = window.deleteStaff || (id => request(`/api/clinic/staff/${encodeURIComponent(id)}`, 'DELETE'));

    window.getPayments = window.getPayments || ((params = {}) => {
      const qs = query(params);
      return request(`/api/clinic/payments${qs ? '?' + qs : ''}`);
    });
    window.updatePayment = window.updatePayment || ((id, data) => request(`/api/clinic/payments/${encodeURIComponent(id)}`, 'PUT', data));
    window.deletePaymentApi = window.deletePaymentApi || (id => request(`/api/clinic/payments/${encodeURIComponent(id)}`, 'DELETE'));

    window.getPatients = window.getPatients || ((params = {}) => {
      const qs = query(params);
      return request(`/api/clinic/patients${qs ? '?' + qs : ''}`);
    });
    window.updatePatient = window.updatePatient || ((id, data) => request(`/api/clinic/patients/${encodeURIComponent(id)}`, 'PUT', data));
  }



  function removeSmsLogFromClinicManager() { return; }

  function installClinicManagerNavObserver() { return; }

  function init() {
    removeSmsLogFromClinicManager();
    installClinicManagerNavObserver();
    installPersianValidation();
    refreshPrettySelects();
    document.addEventListener('change', event => {
      if (event.target?.matches?.('select,input,textarea')) refreshPrettySelects();
    });
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) mutation.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        installPersianValidation(node);
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  window.escapeHtml = window.escapeHtml || escapeHtml;
  window.toPersianNumber = window.toPersianNumber || toPersianNumber;
  window.toEnglishNumber = window.toEnglishNumber || toEnglishNumber;
  window.localizeApiMessage = window.localizeApiMessage || localizeApiMessage;
  window.SadraClinicManager = Object.assign(window.SadraClinicManager || {}, {
    request,
    escapeHtml,
    toPersianNumber,
    toEnglishNumber,
    localizeApiMessage,
    installPersianValidation,
    refreshPrettySelects,
    removeSmsLogFromClinicManager
  });

  installApiHelpers();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
