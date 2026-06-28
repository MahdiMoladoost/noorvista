// پنل یکپارچه پزشک - نسخه 2.1.84
(function () {
  'use strict';
  if (window.__NOORVISTA_DOCTOR_PANEL_V3__) return;
  window.__NOORVISTA_DOCTOR_PANEL_V3__ = true;

  const faDigits = '۰۱۲۳۴۵۶۷۸۹';
  const arDigits = '٠١٢٣٤٥٦٧٨٩';
  const state = {
    user: {}, doctor: {}, appointments: [], patients: [], records: [], prescriptions: [], schedules: []
  };

  const qs = (selector, root = document) => root.querySelector(selector);
  const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[char]);
  const toFa = value => String(value ?? '').replace(/\d/g, digit => faDigits[Number(digit)]);
  const toEn = value => String(value ?? '')
    .replace(/[۰-۹]/g, digit => String(faDigits.indexOf(digit)))
    .replace(/[٠-٩]/g, digit => String(arDigits.indexOf(digit)));
  const normalizeStatus = value => String(value || 'pending').trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/^canceled$/, 'cancelled');
  const dateOnly = value => String(value || '').slice(0, 10);
  const timeOnly = value => String(value || '').slice(0, 5) || '-';

  function todayISO() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function jalali(value, includeTime = false) {
    if (!value) return '-';
    try {
      const raw = includeTime ? new Date(value) : new Date(`${dateOnly(value)}T12:00:00`);
      const options = includeTime
        ? { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }
        : { year: 'numeric', month: '2-digit', day: '2-digit' };
      return toFa(new Intl.DateTimeFormat('fa-IR-u-ca-persian', options).format(raw));
    } catch (_) {
      return toFa(includeTime ? String(value) : dateOnly(value));
    }
  }

  function money(value) {
    const amount = Number(value || 0);
    return `${toFa(Math.round(amount).toLocaleString('en-US'))} تومان`;
  }

  function toGregorian(value) {
    const clean = String(value || '').trim();
    if (!clean) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(toEn(clean))) return toEn(clean).slice(0, 10);
    try {
      return window.NVDate?.toGregorianDate?.(clean) || window.toGregorianDateString?.(clean) || String(window.jalaliToGregorian?.(clean) || clean);
    } catch (_) {
      return clean;
    }
  }

  function showMessage(message, type = 'info') {
    const text = String(message || 'درخواست انجام شد.');
    if (typeof window.showToast === 'function') {
      try { window.showToast(text, type); } catch (_) {}
    }
    let host = qs('#nvDoctorFeedback');
    if (!host) {
      host = document.createElement('div');
      host.id = 'nvDoctorFeedback';
      host.className = 'nv-secretary-feedback';
      host.setAttribute('role', 'status');
      host.setAttribute('aria-live', 'polite');
      document.body.appendChild(host);
    }
    host.className = `nv-secretary-feedback is-${type}`;
    host.textContent = text;
    host.hidden = false;
    clearTimeout(showMessage.timer);
    showMessage.timer = setTimeout(() => { host.hidden = true; }, type === 'error' ? 8000 : 5000);
  }

  function fieldLabel(field) {
    const label = field.closest('label');
    const raw = label?.querySelector(':scope > span')?.textContent || field.getAttribute('aria-label') || field.name || 'این فیلد';
    return raw.replace('*', '').replace(/\s+/g, ' ').trim() || 'این فیلد';
  }

  function clearFieldError(field) {
    if (!field) return;
    field.classList.remove('is-invalid');
    field.removeAttribute('aria-invalid');
    const holder = field.closest('.nv-form-field, .nv-check-row') || field.parentElement;
    holder?.querySelector(':scope > .nv-field-error')?.remove();
  }

  function setFieldError(field, message) {
    if (!field) return;
    const holder = field.closest('.nv-form-field, .nv-check-row') || field.parentElement;
    clearFieldError(field);
    field.classList.add('is-invalid');
    field.setAttribute('aria-invalid', 'true');
    if (holder) {
      const error = document.createElement('small');
      error.className = 'nv-field-error';
      error.textContent = message;
      holder.appendChild(error);
    }
  }

  function validateFormPersian(form, extraRules = null) {
    if (!form) return false;
    const fields = qsa('input, select, textarea', form).filter(field => !field.disabled && field.type !== 'hidden');
    fields.forEach(clearFieldError);
    const errors = [];
    for (const field of fields) {
      const label = fieldLabel(field);
      const value = String(field.value || '').trim();
      let message = '';
      if (field.required) {
        if (field.type === 'checkbox' && !field.checked) message = `لطفاً ${label} را تأیید کنید.`;
        else if (!value) message = field.tagName === 'SELECT' ? `لطفاً ${label} را انتخاب کنید.` : `لطفاً ${label} را وارد کنید.`;
      }
      if (!message && field.type === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        message = 'رایانامه را با قالب درست وارد کنید؛ برای نمونه name@example.com';
      }
      if (!message && field.type === 'number' && value) {
        const numeric = Number(toEn(value));
        const min = field.min !== '' ? Number(field.min) : null;
        const max = field.max !== '' ? Number(field.max) : null;
        if (Number.isNaN(numeric)) message = `${label} باید عدد باشد.`;
        else if (min !== null && numeric < min) message = `${label} نباید کمتر از ${toFa(min)} باشد.`;
        else if (max !== null && numeric > max) message = `${label} نباید بیشتر از ${toFa(max)} باشد.`;
      }
      const maxLength = Number(field.getAttribute('maxlength') || 0);
      if (!message && maxLength > 0 && value.length > maxLength) {
        message = `${label} نباید بیشتر از ${toFa(maxLength)} کاراکتر باشد.`;
      }
      if (message) errors.push({ field, message });
    }
    if (typeof extraRules === 'function') {
      const extra = extraRules(form) || [];
      extra.forEach(item => item?.field && item?.message && errors.push(item));
    }
    if (errors.length) {
      for (const item of errors) setFieldError(item.field, item.message);
      errors[0].field.focus?.();
      showMessage(errors[0].message, 'error');
      return false;
    }
    return true;
  }

  function profileExtraRules(form) {
    const errors = [];
    const phone = qs('[name="phone"]', form);
    const phoneValue = toEn(phone?.value || '').replace(/\D/g, '');
    if (phone && phoneValue && !/^(?:0?9\d{9}|0\d{2,3}\d{7,8})$/.test(phoneValue)) {
      errors.push({ field: phone, message: 'شماره تماس را با قالب معتبر وارد کنید؛ برای موبایل نمونه ۰۹۱۲۳۴۵۶۷۸۹ است.' });
    }
    return errors;
  }

  function setBusy(button, busy, text = 'در حال انجام...') {
    if (!button) return;
    if (busy) {
      button.dataset.oldText = button.innerHTML;
      button.disabled = true;
      button.textContent = text;
    } else {
      button.disabled = false;
      if (button.dataset.oldText) button.innerHTML = button.dataset.oldText;
      delete button.dataset.oldText;
    }
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin', cache: 'no-store', ...options,
      headers: {
        Accept: 'application/json',
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      window.noorvistaClearClientAuth?.();
      window.location.replace('/login');
      const error = new Error('نشست شما پایان یافته است.');
      error.status = 401;
      throw error;
    }
    if (!response.ok || data.success === false) {
      const error = new Error(data.message || 'ارتباط با سرور انجام نشد.');
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  function arrayFrom(data, keys) {
    if (Array.isArray(data)) return data;
    for (const key of keys) {
      if (Array.isArray(data?.[key])) return data[key];
      if (Array.isArray(data?.data?.[key])) return data.data[key];
    }
    return [];
  }

  async function bootstrapSession() {
    const data = await api('/api/auth/me');
    const role = String(data.user?.role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (role !== 'doctor') {
      const target = ['system_admin', 'admin'].includes(role)
        ? '/dashboard/panel/admin/index.html'
        : (['clinic_admin', 'clinic_manager', 'manager'].includes(role)
          ? '/dashboard/panel/clinic-admin/index.html'
          : (['receptionist', 'reception', 'secretary', 'staff'].includes(role)
            ? '/dashboard/panel/reception/index.html'
            : '/dashboard/panel/patient/index.html'));
      window.location.replace(target);
      return false;
    }
    state.user = data.user || {};
    setHeader();
    return true;
  }

  function setHeader() {
    const name = state.doctor.full_name || state.user.full_name || state.user.name || state.user.username || 'پزشک';
    qsa('[data-nv3-user-name], [data-nv-user-name]').forEach(element => { element.textContent = name; });
    qsa('[data-nv3-user-role]').forEach(element => { element.textContent = 'پزشک'; });
    const avatar = qs('[data-nv3-user-avatar]');
    if (avatar) {
      const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('') || 'پز';
      avatar.textContent = initials;
      avatar.setAttribute('aria-label', `پزشک ${name}`);
    }
  }

  function statusMeta(status) {
    const value = normalizeStatus(status);
    return ({
      pending: ['در انتظار تأیید', 'warning'],
      confirmed: ['تأیید شده', 'success'],
      completed: ['انجام شده', 'success'],
      no_show: ['عدم مراجعه', 'danger'],
      cancelled: ['لغو شده', 'danger'],
      signed: ['امضاشده', 'success'],
      amended: ['اصلاح‌شده', 'warning'],
      locked: ['قفل‌شده', 'gray'],
      active: ['فعال', 'success'],
      inactive: ['غیرفعال', 'gray']
    })[value] || [String(status || 'نامشخص'), 'gray'];
  }

  function badge(status) {
    const [label, tone] = statusMeta(status);
    return `<span class="nv-badge ${tone}">${esc(label)}</span>`;
  }

  function table(headers, rows, empty = 'اطلاعاتی برای نمایش وجود ندارد.') {
    if (!rows.length) return `<div class="nv-empty">${esc(empty)}</div>`;
    return `<div class="nv-table-wrap"><table><thead><tr>${headers.map(item => `<th>${item}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  }

  function statCard(label, value, icon, note = '') {
    return `<article class="nv-tw-stat-card"><span class="nv-tw-stat-icon"><i class="${esc(icon)}" aria-hidden="true"></i></span><div class="nv-tw-stat-copy"><div class="nv-tw-stat-value">${toFa(value)}</div><div class="nv-tw-stat-label">${esc(label)}</div>${note ? `<div class="tw-mt-1 tw-text-xs tw-text-slate-500">${esc(note)}</div>` : ''}</div></article>`;
  }

  function modalShell(id, title, description, body, footer = '', extraClass = '') {
    return `<div class="nv-modal ${esc(extraClass)}" id="${esc(id)}" role="dialog" aria-modal="true" aria-labelledby="${esc(id)}Title" hidden>
      <div class="nv-modal-dialog" tabindex="-1">
        <header class="nv-modal-header"><div><h2 id="${esc(id)}Title">${esc(title)}</h2>${description ? `<p>${esc(description)}</p>` : ''}</div><button class="nv-modal-close" type="button" data-modal-close aria-label="بستن">×</button></header>
        <div class="nv-modal-body">${body}</div>
        ${footer ? `<footer class="nv-modal-footer">${footer}</footer>` : ''}
      </div>
    </div>`;
  }

  function openModal(modal) {
    if (!modal) return;
    modal.hidden = false;
    modal.classList.add('show');
    document.body.classList.add('nv-modal-open');
    modal._returnFocus = document.activeElement;
    window.NVDate?.initFields?.(modal);
    setTimeout(() => qs('input, select, textarea, button, [tabindex="0"]', modal)?.focus(), 30);
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('show');
    modal.hidden = true;
    document.body.classList.remove('nv-modal-open');
    modal._returnFocus?.focus?.();
    if (typeof modal._onClose === 'function') {
      const callback = modal._onClose;
      modal._onClose = null;
      callback();
    }
    if (modal.dataset.removeOnClose === '1') modal.remove();
  }

  function refreshPrettySelects(root = document) {
    try {
      window.NVPrettySelects?.refresh?.();
      qsa('select', root).forEach(select => window.NVPrettySelects?.sync?.(select));
    } catch (_) {}
  }

  function bindModal(modal) {
    if (!modal || modal.dataset.bound === '1') return;
    modal.dataset.bound = '1';
    qsa('[data-modal-close]', modal).forEach(button => button.addEventListener('click', () => closeModal(modal)));
    modal.addEventListener('click', event => { if (event.target === modal) closeModal(modal); });
    modal.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeModal(modal);
      if (event.key !== 'Tab') return;
      const focusable = qsa('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]', modal).filter(item => !item.hidden);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
  }

  function confirmAction({ title, message, requireReason = false, confirmText = 'تأیید' }) {
    return new Promise(resolve => {
      qs('#nvDoctorConfirmModal')?.remove();
      const body = `<div class="nv-staff-note">${esc(message)}</div>${requireReason ? `<label class="nv-form-field full"><span>توضیح یا دلیل</span><textarea id="nvDoctorConfirmReason" rows="3" maxlength="500" placeholder="توضیح کوتاه بنویسید"></textarea></label>` : ''}`;
      document.body.insertAdjacentHTML('beforeend', modalShell('nvDoctorConfirmModal', title, '', body,
        `<button class="nv-btn secondary" type="button" data-modal-close>انصراف</button><button class="nv-btn danger" type="button" id="nvDoctorConfirmSubmit">${esc(confirmText)}</button>`, 'is-compact'));
      const modal = qs('#nvDoctorConfirmModal');
      modal.dataset.removeOnClose = '1';
      bindModal(modal);
      modal._onClose = () => resolve(null);
      qs('#nvDoctorConfirmSubmit', modal)?.addEventListener('click', () => {
        const reason = requireReason ? String(qs('#nvDoctorConfirmReason', modal)?.value || '').trim() : '';
        if (requireReason && !reason) {
          showMessage('نوشتن دلیل الزامی است.', 'error');
          qs('#nvDoctorConfirmReason', modal)?.focus();
          return;
        }
        modal._onClose = null;
        modal.dataset.removeOnClose = '0';
        closeModal(modal);
        modal.remove();
        resolve({ reason });
      });
      openModal(modal);
    });
  }

  async function loadProfile(force = false) {
    if (state.doctor.id && !force) return state.doctor;
    const data = await api('/api/doctor/profile');
    state.doctor = data.doctor || {};
    setHeader();
    return state.doctor;
  }

  async function loadStats() {
    const data = await api('/api/doctor/stats');
    return data.stats || {};
  }

  async function loadAppointments(force = false, query = '') {
    if (state.appointments.length && !force && !query) return state.appointments;
    const data = await api(`/api/doctor/appointments?limit=200${query ? `&${query}` : ''}`);
    const items = arrayFrom(data, ['appointments', 'items', 'data']).map(item => ({
      ...item,
      id: Number(item.id),
      patient_id: Number(item.patient_id || 0),
      patient: item.patient_name || item.patient_full_name || item.full_name || 'بیمار',
      phone: item.patient_phone || item.phone || '-',
      date: item.appointment_date || item.date,
      time: item.appointment_time || item.start_time || item.time,
      service: item.service_name || item.type || item.reason || 'ویزیت',
      center: item.medical_center_name || item.center_name || '-',
      status: normalizeStatus(item.status || 'pending'),
      reason: item.reason || item.description || '',
      notes: item.notes || ''
    }));
    if (!query) state.appointments = items;
    return items;
  }

  async function loadPatients(force = false) {
    if (state.patients.length && !force) return state.patients;
    const data = await api('/api/doctor/patients?limit=200');
    state.patients = arrayFrom(data, ['patients', 'items', 'data']).map(item => ({
      ...item,
      patient_id: Number(item.patient_id || item.id || 0),
      user_id: Number(item.user_id || 0),
      name: item.full_name || item.name || item.patient_name || 'بیمار',
      phone: item.phone || item.mobile || '-',
      email: item.email || '',
      appointment_count: Number(item.appointment_count || 0),
      last_visit: item.last_visit || ''
    }));
    return state.patients;
  }

  async function loadRecords(force = false) {
    if (state.records.length && !force) return state.records;
    const data = await api('/api/doctor/medical-records?limit=200');
    state.records = arrayFrom(data, ['records', 'medical_records', 'items', 'data']).map(item => ({
      ...item,
      id: Number(item.id),
      patient_id: Number(item.patient_id || 0),
      patient: item.patient_name || 'بیمار',
      date: item.record_date || item.created_at,
      status: item.record_status || item.status || 'signed'
    }));
    return state.records;
  }

  async function loadPrescriptions(force = false) {
    if (state.prescriptions.length && !force) return state.prescriptions;
    const data = await api('/api/doctor/prescriptions?limit=200');
    state.prescriptions = arrayFrom(data, ['prescriptions', 'items', 'data']).map(item => {
      let medicines = item.medicines;
      if (typeof medicines === 'string') {
        try { medicines = JSON.parse(medicines); } catch (_) { medicines = []; }
      }
      return {
        ...item,
        id: Number(item.id),
        patient_id: Number(item.patient_id || 0),
        patient: item.patient_name || 'بیمار',
        medicines: Array.isArray(medicines) ? medicines : [],
        date: item.created_at || item.date
      };
    });
    return state.prescriptions;
  }

  async function loadSchedules(force = false) {
    if (state.schedules.length && !force) return state.schedules;
    const data = await api('/api/doctor/schedule');
    state.schedules = arrayFrom(data, ['schedules', 'items', 'data']);
    return state.schedules;
  }

  async function refreshData(type) {
    if (type === 'appointments') state.appointments = [];
    if (type === 'patients') state.patients = [];
    if (type === 'records') state.records = [];
    if (type === 'prescriptions') state.prescriptions = [];
    if (type === 'schedule') state.schedules = [];
    await renderPage();
  }

  function appointmentActions(item) {
    const actions = [`<button class="nv-btn secondary" type="button" data-doctor-appointment-detail="${item.id}"><i class="icon-eye" aria-hidden="true"></i><span>جزئیات</span></button>`];
    if (item.status === 'pending') actions.push(`<button class="nv-btn success" type="button" data-doctor-appointment-status="confirmed" data-id="${item.id}"><i class="icon-check" aria-hidden="true"></i><span>تأیید</span></button>`);
    if (item.status === 'confirmed') {
      actions.push(`<button class="nv-btn success" type="button" data-doctor-appointment-status="completed" data-id="${item.id}"><i class="icon-check" aria-hidden="true"></i><span>تکمیل ویزیت</span></button>`);
      actions.push(`<button class="nv-btn warning" type="button" data-doctor-appointment-status="no_show" data-id="${item.id}"><i class="icon-warning" aria-hidden="true"></i><span>عدم مراجعه</span></button>`);
    }
    if (['pending', 'confirmed'].includes(item.status)) actions.push(`<button class="nv-btn danger" type="button" data-doctor-appointment-status="cancelled" data-id="${item.id}"><i class="icon-close" aria-hidden="true"></i><span>لغو</span></button>`);
    return `<div class="nv-inline-actions">${actions.join('')}</div>`;
  }

  async function changeAppointmentStatus(item, status, button) {
    const meta = {
      confirmed: { title: 'تأیید نوبت', message: 'این نوبت برای ویزیت تأیید شود؟', text: 'تأیید نوبت' },
      completed: { title: 'تکمیل ویزیت', message: 'وضعیت نوبت به «انجام شده» تغییر کند؟', text: 'ثبت تکمیل' },
      no_show: { title: 'ثبت عدم مراجعه', message: 'عدم مراجعه بیمار برای این نوبت ثبت شود؟', text: 'ثبت عدم مراجعه' },
      cancelled: { title: 'لغو نوبت', message: 'این نوبت لغو شود؟', text: 'لغو نوبت', reason: true }
    }[status];
    if (!meta) return;
    const confirmation = await confirmAction({ title: meta.title, message: meta.message, requireReason: meta.reason, confirmText: meta.text });
    if (!confirmation) return;
    setBusy(button, true);
    try {
      const result = await api(`/api/doctor/appointments/${item.id}/status`, {
        method: 'PUT', body: JSON.stringify({ status, notes: confirmation.reason || '' })
      });
      state.appointments = [];
      await renderPage();
      showMessage(result.message || 'وضعیت نوبت تغییر کرد.', 'success');
    } catch (error) {
      showMessage(error.message || 'تغییر وضعیت انجام نشد.', 'error');
      setBusy(button, false);
    }
  }

  function showAppointmentDetails(item) {
    qs('#nvDoctorAppointmentModal')?.remove();
    const body = `<div class="nv-detail-grid">
      <div><span>بیمار</span><strong>${esc(item.patient)}</strong><p>${toFa(item.phone)}</p></div>
      <div><span>تاریخ و ساعت</span><strong>${jalali(item.date)}، ساعت ${toFa(timeOnly(item.time))}</strong></div>
      <div><span>خدمت</span><strong>${esc(item.service)}</strong></div>
      <div><span>مرکز درمانی</span><strong>${esc(item.center)}</strong></div>
      <div><span>وضعیت</span>${badge(item.status)}</div>
      <div><span>شناسه نوبت</span><strong>${toFa(item.id)}</strong></div>
      <div class="is-full"><span>شرح مراجعه</span><p>${esc(item.reason || 'شرحی ثبت نشده است.')}</p></div>
      <div class="is-full"><span>یادداشت</span><p>${esc(item.notes || 'یادداشتی ثبت نشده است.')}</p></div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalShell('nvDoctorAppointmentModal', 'جزئیات نوبت', 'اطلاعات ثبت‌شده برای ویزیت بیمار', body, '<button class="nv-btn secondary" type="button" data-modal-close>بستن</button>', 'is-compact'));
    const modal = qs('#nvDoctorAppointmentModal');
    modal.dataset.removeOnClose = '1';
    bindModal(modal);
    openModal(modal);
  }

  function bindAppointmentActions(root) {
    qsa('[data-doctor-appointment-detail]', root).forEach(button => button.addEventListener('click', () => {
      const item = state.appointments.find(row => row.id === Number(button.dataset.doctorAppointmentDetail));
      if (item) showAppointmentDetails(item);
    }));
    qsa('[data-doctor-appointment-status]', root).forEach(button => button.addEventListener('click', () => {
      const item = state.appointments.find(row => row.id === Number(button.dataset.id));
      if (item) void changeAppointmentStatus(item, button.dataset.doctorAppointmentStatus, button);
    }));
  }

  async function renderDashboard(root) {
    root.innerHTML = '<div class="nv-empty">در حال بارگذاری داشبورد پزشک...</div>';
    const [stats, appointments, schedules] = await Promise.all([loadStats(), loadAppointments(), loadSchedules()]);
    const today = todayISO();
    const todayItems = appointments.filter(item => dateOnly(item.date) === today && !['cancelled', 'no_show'].includes(item.status));
    root.innerHTML = `<div class="nv-staff-stack">
      <div class="tw-grid tw-grid-cols-1 tw-gap-4 sm:tw-grid-cols-2 xl:tw-grid-cols-4 nv-staff-stat-grid">
        ${statCard('نوبت‌های امروز', stats.today_appointments ?? todayItems.length, 'icon-calendar', 'ویزیت‌های برنامه امروز')}
        ${statCard('نوبت‌های آینده', stats.upcoming_appointments ?? 0, 'icon-clock-o', 'نوبت‌های ثبت‌شده آینده')}
        ${statCard('بیماران من', stats.total_patients ?? 0, 'icon-users', 'بیماران دارای رابطه درمانی')}
        ${statCard('ویزیت‌های تکمیل‌شده', stats.completed_visits ?? 0, 'icon-check', 'مراجعات پایان‌یافته')}
      </div>
      <div class="nv-staff-grid-main">
        <article class="nv-card"><header class="nv-card-header"><div><h2>نوبت‌های امروز</h2><p class="nv-card-subtitle">بیماران برنامه‌ریزی‌شده برای امروز</p></div><a class="nv-btn secondary" href="appointments.html"><i class="icon-calendar" aria-hidden="true"></i><span>مشاهده همه نوبت‌ها</span></a></header><div class="nv-card-body">${table(['ساعت', 'بیمار', 'خدمت', 'وضعیت', 'عملیات'], todayItems.slice(0, 10).map(item => `<tr><td><strong>${toFa(timeOnly(item.time))}</strong></td><td>${esc(item.patient)}<br><small>${toFa(item.phone)}</small></td><td>${esc(item.service)}</td><td>${badge(item.status)}</td><td>${appointmentActions(item)}</td></tr>`), 'برای امروز نوبتی ثبت نشده است.')}</div></article>
        <aside class="nv-staff-stack">
          <article class="nv-card"><header class="nv-card-header"><div><h2>دسترسی سریع</h2><p class="nv-card-subtitle">پرکاربردترین عملیات پزشک</p></div></header><div class="nv-card-body"><div class="nv-quick-link-grid"><a class="nv-staff-quick-link" href="medical-records.html#new"><span>ثبت پرونده پزشکی</span><span class="nv-tw-quick-link-icon"><i class="icon-file-text" aria-hidden="true"></i></span></a><a class="nv-staff-quick-link" href="prescriptions.html#new"><span>ثبت نسخه جدید</span><span class="nv-tw-quick-link-icon"><i class="icon-medkit" aria-hidden="true"></i></span></a><a class="nv-staff-quick-link" href="patients.html"><span>بیماران من</span><span class="nv-tw-quick-link-icon"><i class="icon-users" aria-hidden="true"></i></span></a><a class="nv-staff-quick-link" href="schedule.html"><span>برنامه کاری</span><span class="nv-tw-quick-link-icon"><i class="icon-clock-o" aria-hidden="true"></i></span></a></div></div></article>
          <article class="nv-card"><header class="nv-card-header"><div><h2>برنامه هفتگی</h2><p class="nv-card-subtitle">روزها و ساعت‌های فعال</p></div></header><div class="nv-card-body">${schedules.length ? schedules.slice(0, 7).map(item => `<div class="nv-staff-note" style="margin-bottom:10px"><strong>${esc(dayLabel(item.day_of_week))}</strong> — ${item.is_working === 0 ? 'تعطیل' : `${toFa(timeOnly(item.start_time))} تا ${toFa(timeOnly(item.end_time))}`}</div>`).join('') : '<div class="nv-empty">برنامه‌ای ثبت نشده است.</div>'}</div></article>
        </aside>
      </div>
    </div>`;
    bindAppointmentActions(root);
  }

  async function renderAppointments(root) {
    root.innerHTML = '<div class="nv-empty">در حال بارگذاری نوبت‌ها...</div>';
    const items = await loadAppointments();
    const rows = list => list.map(item => `<tr><td>${jalali(item.date)}<br><small>ساعت ${toFa(timeOnly(item.time))}</small></td><td><strong>${esc(item.patient)}</strong><br><small>${toFa(item.phone)}</small></td><td>${esc(item.service)}<br><small>${esc(item.center)}</small></td><td>${badge(item.status)}</td><td>${appointmentActions(item)}</td></tr>`);
    root.innerHTML = `<div class="nv-card"><header class="nv-card-header"><div><h2>فهرست نوبت‌های پزشک</h2><p class="nv-card-subtitle">جست‌وجو، فیلتر و تغییر وضعیت نوبت‌ها</p></div><button class="nv-btn secondary" type="button" id="refreshDoctorAppointments"><i class="icon-refresh" aria-hidden="true"></i><span>به‌روزرسانی</span></button></header><div class="nv-card-body">
      <div class="nv-staff-filter-grid nv-doctor-appointments-filter"><label class="nv-doctor-filter-search"><span>جست‌وجو</span><input id="doctorAppointmentSearch" type="search" placeholder="نام بیمار، تلفن یا شرح مراجعه"></label><label><span>وضعیت</span><select id="doctorAppointmentStatus"><option value="all">همه وضعیت‌ها</option><option value="pending">در انتظار تأیید</option><option value="confirmed">تأیید شده</option><option value="completed">انجام شده</option><option value="no_show">عدم مراجعه</option><option value="cancelled">لغو شده</option></select></label><label><span>از تاریخ</span><input id="doctorAppointmentFrom" type="text" class="nv-jalali-date" data-no-default-date="1" autocomplete="off" placeholder="انتخاب تاریخ"></label><label><span>تا تاریخ</span><input id="doctorAppointmentTo" type="text" class="nv-jalali-date" data-no-default-date="1" autocomplete="off" placeholder="انتخاب تاریخ"></label></div>
      <div id="doctorAppointmentsTable">${table(['تاریخ و ساعت', 'بیمار', 'خدمت و مرکز', 'وضعیت', 'عملیات'], rows(items), 'نوبتی ثبت نشده است.')}</div>
    </div></div>`;
    window.NVDate?.initFields?.(root);
    refreshPrettySelects(root);
    bindAppointmentActions(root);
    const apply = () => {
      const search = String(qs('#doctorAppointmentSearch')?.value || '').trim().toLowerCase();
      const status = qs('#doctorAppointmentStatus')?.value || 'all';
      const from = toGregorian(qs('#doctorAppointmentFrom')?.value || '');
      const to = toGregorian(qs('#doctorAppointmentTo')?.value || '');
      const filtered = items.filter(item => {
        const haystack = [item.patient, item.phone, item.service, item.center, item.reason].join(' ').toLowerCase();
        const date = dateOnly(item.date);
        return (!search || haystack.includes(search)) && (status === 'all' || item.status === status) && (!from || date >= from) && (!to || date <= to);
      });
      const host = qs('#doctorAppointmentsTable');
      host.innerHTML = table(['تاریخ و ساعت', 'بیمار', 'خدمت و مرکز', 'وضعیت', 'عملیات'], rows(filtered), 'نوبتی مطابق فیلترها پیدا نشد.');
      bindAppointmentActions(host);
    };
    qsa('#doctorAppointmentSearch,#doctorAppointmentStatus,#doctorAppointmentFrom,#doctorAppointmentTo').forEach(element => {
      element.addEventListener(element.tagName === 'SELECT' ? 'change' : 'input', apply);
      element.addEventListener('change', apply);
    });
    qs('#refreshDoctorAppointments')?.addEventListener('click', () => void refreshData('appointments'));
  }


  function patientEditorForm() {
    return `<form id="nvDoctorPatientCreateForm" class="nv-form" novalidate>
      <div class="nv-form-grid">
        <label class="nv-form-field"><span>نام و نام خانوادگی *</span><input name="full_name" required maxlength="150" autocomplete="name" placeholder="نام کامل بیمار"></label>
        <label class="nv-form-field"><span>شماره موبایل *</span><input name="phone" required inputmode="tel" maxlength="20" autocomplete="tel" placeholder="۰۹۱۲۱۲۳۴۵۶۷"></label>
        <label class="nv-form-field"><span>کد ملی</span><input name="national_code" inputmode="numeric" maxlength="10" placeholder="اختیاری"></label>
        <label class="nv-form-field"><span>رایانامه</span><input name="email" type="email" maxlength="190" autocomplete="email" placeholder="اختیاری"></label>
        <label class="nv-form-field is-full"><span>توضیحات اولیه</span><textarea name="notes" rows="3" maxlength="1000" placeholder="توضیح کوتاه درباره بیمار یا علت مراجعه"></textarea></label>
      </div>
      <div class="nv-note">برای بیمار یک حساب کاربری با نقش بیمار ساخته می‌شود. نام کاربری و رمز موقت در صورت خالی بودن از شماره موبایل ساخته می‌شود.</div>
    </form>`;
  }

  function openPatientEditor() {
    removeExistingModal('nvDoctorPatientCreateModal');
    document.body.insertAdjacentHTML('beforeend', modalShell('nvDoctorPatientCreateModal', 'ثبت بیمار جدید', 'افزودن بیمار و ساخت حساب کاربری مرتبط', patientEditorForm(), '<button class="nv-btn secondary" type="button" data-modal-close>انصراف</button><button class="nv-btn" type="button" id="saveDoctorPatient">ثبت بیمار</button>', 'is-wide'));
    const modal = qs('#nvDoctorPatientCreateModal');
    bindModalClose(modal);
    qs('#saveDoctorPatient', modal)?.addEventListener('click', async (event) => {
      const btn = event.currentTarget;
      const form = qs('#nvDoctorPatientCreateForm', modal);
      const values = Object.fromEntries(new FormData(form).entries());
      values.full_name = String(values.full_name || '').trim();
      values.phone = String(values.phone || '').trim();
      if (!values.full_name || !values.phone) return showMessage('نام و شماره موبایل بیمار الزامی است.', 'warning');
      btn.disabled = true;
      try {
        await api('/api/doctor/patients', { method: 'POST', body: JSON.stringify(values) });
        showMessage('بیمار ثبت شد و حساب کاربری او ساخته شد.', 'success');
        removeExistingModal('nvDoctorPatientCreateModal');
        await refreshData('patients');
      } catch (error) {
        showMessage(error.message || 'ثبت بیمار انجام نشد.', 'error');
      } finally {
        btn.disabled = false;
      }
    });
  }

  async function showPatientDetails(patient) {
    if (!patient?.patient_id) return showMessage('شناسه پرونده بیمار موجود نیست.', 'error');
    qs('#nvDoctorPatientModal')?.remove();
    document.body.insertAdjacentHTML('beforeend', modalShell('nvDoctorPatientModal', 'پرونده بیمار', 'اطلاعات پایه و سوابق درمانی بیمار', '<div class="nv-empty">در حال دریافت پرونده...</div>', '<button class="nv-btn secondary" type="button" data-modal-close>بستن</button>', 'is-wide'));
    const modal = qs('#nvDoctorPatientModal');
    modal.dataset.removeOnClose = '1';
    bindModal(modal);
    openModal(modal);
    try {
      const data = await api(`/api/doctor/patients/${patient.patient_id}/medical-records`);
      const person = data.patient || {};
      const records = arrayFrom(data, ['medical_records', 'records']);
      qs('.nv-modal-body', modal).innerHTML = `<div class="nv-detail-grid" style="margin-bottom:16px"><div><span>نام بیمار</span><strong>${esc(person.full_name || patient.name)}</strong></div><div><span>شماره تماس</span><strong>${toFa(person.phone || patient.phone)}</strong></div><div><span>تاریخ تولد</span><strong>${person.birth_date ? jalali(person.birth_date) : 'ثبت نشده'}</strong></div><div><span>جنسیت</span><strong>${person.gender === 'male' ? 'مرد' : (person.gender === 'female' ? 'زن' : 'ثبت نشده')}</strong></div><div class="is-full"><span>حساسیت‌ها</span><p>${esc(person.allergies || 'موردی ثبت نشده است.')}</p></div><div class="is-full"><span>بیماری‌های مزمن</span><p>${esc(person.chronic_diseases || 'موردی ثبت نشده است.')}</p></div></div>${table(['تاریخ', 'تشخیص', 'یافته‌ها', 'وضعیت'], records.map(record => `<tr><td>${jalali(record.record_date || record.created_at)}</td><td>${esc(record.diagnosis || '-')}</td><td>${esc(record.findings || record.notes || '-')}</td><td>${badge(record.record_status || 'signed')}</td></tr>`), 'سابقه پزشکی ثبت نشده است.')}`;
    } catch (error) {
      qs('.nv-modal-body', modal).innerHTML = `<div class="nv-empty">${esc(error.message || 'دریافت پرونده انجام نشد.')}</div>`;
    }
  }

  async function renderPatients(root) {
    root.innerHTML = '<div class="nv-empty">در حال بارگذاری بیماران...</div>';
    const items = await loadPatients();
    const rows = list => list.map(item => `<tr><td><strong>${esc(item.name)}</strong></td><td>${toFa(item.phone)}</td><td>${esc(item.email || '-')}</td><td>${toFa(item.appointment_count)}</td><td>${item.last_visit ? jalali(item.last_visit) : '-'}</td><td><div class="nv-inline-actions"><button class="nv-btn secondary" type="button" data-patient-detail="${item.patient_id}"><i class="icon-file-text" aria-hidden="true"></i><span>مشاهده پرونده</span></button><button class="nv-btn" type="button" data-patient-record="${item.patient_id}"><i class="icon-plus" aria-hidden="true"></i><span>ثبت پرونده</span></button><button class="nv-btn success" type="button" data-patient-prescription="${item.patient_id}"><i class="icon-medkit" aria-hidden="true"></i><span>ثبت نسخه</span></button></div></td></tr>`);
    root.innerHTML = `<div class="nv-card"><header class="nv-card-header"><div><h2>بیماران من</h2><p class="nv-card-subtitle">بیماران دارای نوبت یا سابقه درمان نزد پزشک</p></div><button class="nv-btn secondary" id="refreshDoctorPatients" type="button"><i class="icon-refresh" aria-hidden="true"></i><span>به‌روزرسانی</span></button></header><div class="nv-card-body"><div class="nv-staff-filter-grid"><label class="is-wide"><span>جست‌وجوی بیمار</span><input id="doctorPatientSearch" type="search" placeholder="نام، شماره تماس یا نشانی رایانامه"></label></div><div id="doctorPatientsTable">${table(['نام بیمار', 'شماره تماس', 'رایانامه', 'تعداد نوبت', 'آخرین مراجعه', 'عملیات'], rows(items), 'بیماری برای نمایش وجود ندارد.')}</div></div></div>`;
    refreshPrettySelects(root);
    const bindRows = host => {
      qsa('[data-patient-detail]', host).forEach(button => button.addEventListener('click', () => showPatientDetails(items.find(item => item.patient_id === Number(button.dataset.patientDetail)))));
      qsa('[data-patient-record]', host).forEach(button => button.addEventListener('click', () => openMedicalRecordModal(Number(button.dataset.patientRecord))));
      qsa('[data-patient-prescription]', host).forEach(button => button.addEventListener('click', () => openPrescriptionModal(Number(button.dataset.patientPrescription))));
    };
    bindRows(root);
    qs('#doctorPatientSearch')?.addEventListener('input', event => {
      const query = event.target.value.trim().toLowerCase();
      const filtered = items.filter(item => [item.name, item.phone, item.email].join(' ').toLowerCase().includes(query));
      const host = qs('#doctorPatientsTable');
      host.innerHTML = table(['نام بیمار', 'شماره تماس', 'رایانامه', 'تعداد نوبت', 'آخرین مراجعه', 'عملیات'], rows(filtered), 'بیماری مطابق جست‌وجو پیدا نشد.');
      bindRows(host);
    });
    qs('#refreshDoctorPatients')?.addEventListener('click', () => void refreshData('patients'));
  }

  function patientOptions(selected = 0) {
    return state.patients.map(item => `<option value="${item.patient_id}" ${Number(selected) === item.patient_id ? 'selected' : ''}>${esc(item.name)} — ${toFa(item.phone)}</option>`).join('');
  }

  function appointmentOptions(patientId = 0) {
    return state.appointments.filter(item => !patientId || item.patient_id === Number(patientId)).map(item => `<option value="${item.id}">${jalali(item.date)}، ساعت ${toFa(timeOnly(item.time))} — ${esc(item.patient)}</option>`).join('');
  }

  async function openMedicalRecordModal(patientId = 0) {
    await Promise.all([loadPatients(), loadAppointments()]);
    qs('#nvDoctorRecordFormModal')?.remove();
    const body = `<form id="nvDoctorRecordForm" class="nv-form" novalidate>
      <label class="nv-form-field"><span>بیمار *</span><select name="patient_id" id="recordPatient" required><option value="">انتخاب بیمار</option>${patientOptions(patientId)}</select></label>
      <label class="nv-form-field"><span>نوبت مرتبط</span><select name="appointment_id" id="recordAppointment"><option value="">بدون نوبت مرتبط</option>${appointmentOptions(patientId)}</select></label>
      <label class="nv-form-field full"><span>تشخیص *</span><textarea name="diagnosis" rows="3" required maxlength="3000" placeholder="تشخیص پزشکی را بنویسید"></textarea></label>
      <label class="nv-form-field"><span>علائم و شرح حال</span><textarea name="symptoms" rows="4" maxlength="5000" placeholder="علائم و شرح حال بیمار"></textarea></label>
      <label class="nv-form-field"><span>یافته‌های معاینه</span><textarea name="findings" rows="4" maxlength="5000" placeholder="نتایج معاینه و یافته‌ها"></textarea></label>
      <label class="nv-form-field full"><span>برنامه درمان</span><textarea name="treatment_plan" rows="3" maxlength="5000" placeholder="برنامه درمان و توصیه‌ها"></textarea></label>
      <label class="nv-form-field"><span>دید چشم راست</span><input name="visual_acuity_od" maxlength="50" placeholder="برای نمونه ۱۰/۱۰"></label>
      <label class="nv-form-field"><span>دید چشم چپ</span><input name="visual_acuity_os" maxlength="50" placeholder="برای نمونه ۱۰/۱۰"></label>
      <label class="nv-form-field"><span>فشار چشم راست</span><input name="iop_od" inputmode="decimal" placeholder="میلی‌متر جیوه"></label>
      <label class="nv-form-field"><span>فشار چشم چپ</span><input name="iop_os" inputmode="decimal" placeholder="میلی‌متر جیوه"></label>
      <label class="nv-form-field"><span>روش اندازه‌گیری فشار</span><select name="iop_method"><option value="">انتخاب نشده</option><option value="Goldmann">گلدمن (Goldmann)</option><option value="NCT">غیرتماسی (NCT)</option><option value="Tono-Pen">تونومتر قلمی (Tono-Pen)</option></select></label>
      <label class="nv-form-field"><span>تاریخ پیگیری</span><input name="follow_up_at" type="text" class="nv-jalali-date" data-no-default-date="1" autocomplete="off" placeholder="انتخاب تاریخ"></label>
      <label class="nv-form-field full"><span>یادداشت تکمیلی</span><textarea name="notes" rows="3" maxlength="5000" placeholder="یادداشت تکمیلی پرونده"></textarea></label>
      <div class="nv-form-note full">با ثبت پرونده مرتبط با نوبت، ویزیت همان نوبت به‌صورت امن تکمیل می‌شود.</div>
    </form>`;
    document.body.insertAdjacentHTML('beforeend', modalShell('nvDoctorRecordFormModal', 'ثبت پرونده پزشکی', 'اطلاعات معاینه و برنامه درمان بیمار را ثبت کنید.', body, '<button class="nv-btn secondary" type="button" data-modal-close>انصراف</button><button class="nv-btn success" type="button" id="saveDoctorRecord"><i class="icon-check" aria-hidden="true"></i><span>ثبت و امضای پرونده</span></button>', 'is-wide'));
    const modal = qs('#nvDoctorRecordFormModal');
    modal.dataset.removeOnClose = '1';
    bindModal(modal);
    qs('#recordPatient', modal)?.addEventListener('change', event => {
      const appointment = qs('#recordAppointment', modal);
      appointment.innerHTML = `<option value="">بدون نوبت مرتبط</option>${appointmentOptions(Number(event.target.value))}`;
      refreshPrettySelects(modal);
    });
    qs('#saveDoctorRecord', modal)?.addEventListener('click', event => void saveMedicalRecord(event.currentTarget, modal));
    openModal(modal);
    refreshPrettySelects(modal);
  }

  async function saveMedicalRecord(button, modal) {
    const form = qs('#nvDoctorRecordForm', modal);
    if (!validateFormPersian(form)) return;
    const payload = Object.fromEntries(new FormData(form).entries());
    payload.patient_id = Number(payload.patient_id);
    payload.appointment_id = payload.appointment_id ? Number(payload.appointment_id) : null;
    payload.follow_up_at = toGregorian(payload.follow_up_at);
    setBusy(button, true, 'در حال ثبت پرونده...');
    try {
      const result = await api('/api/doctor/medical-records', { method: 'POST', body: JSON.stringify(payload) });
      modal.dataset.removeOnClose = '0';
      closeModal(modal); modal.remove();
      state.records = []; state.appointments = [];
      await renderPage();
      showMessage(result.message || 'پرونده پزشکی ثبت شد.', 'success');
    } catch (error) {
      showMessage(error.message || 'ثبت پرونده انجام نشد.', 'error');
      setBusy(button, false);
    }
  }

  function showRecordDetails(record) {
    qs('#nvDoctorRecordDetailModal')?.remove();
    const body = `<div class="nv-detail-grid"><div><span>بیمار</span><strong>${esc(record.patient)}</strong></div><div><span>تاریخ ثبت</span><strong>${jalali(record.date)}</strong></div><div><span>وضعیت</span>${badge(record.status)}</div><div><span>شناسه پرونده</span><strong>${toFa(record.id)}</strong></div><div class="is-full"><span>تشخیص</span><p>${esc(record.diagnosis || '-')}</p></div><div class="is-full"><span>علائم</span><p>${esc(record.symptoms || '-')}</p></div><div class="is-full"><span>یافته‌ها</span><p>${esc(record.findings || '-')}</p></div><div class="is-full"><span>برنامه درمان</span><p>${esc(record.treatment_plan || '-')}</p></div><div class="is-full"><span>یادداشت</span><p>${esc(record.notes || '-')}</p></div></div>`;
    document.body.insertAdjacentHTML('beforeend', modalShell('nvDoctorRecordDetailModal', 'جزئیات پرونده پزشکی', 'پرونده امضاشده بیمار', body, '<button class="nv-btn secondary" type="button" data-modal-close>بستن</button>', 'is-wide'));
    const modal = qs('#nvDoctorRecordDetailModal'); modal.dataset.removeOnClose = '1'; bindModal(modal); openModal(modal);
  }

  function openAmendRecordModal(record) {
    qs('#nvDoctorAmendModal')?.remove();
    const body = `<form id="nvDoctorAmendForm" class="nv-form" novalidate><label class="nv-form-field full"><span>دلیل اصلاح *</span><textarea name="reason" required rows="3" maxlength="500" placeholder="دلیل اصلاح پرونده امضاشده را بنویسید"></textarea></label><label class="nv-form-field full"><span>تشخیص اصلاح‌شده</span><textarea name="diagnosis" rows="3" maxlength="3000">${esc(record.diagnosis || '')}</textarea></label><label class="nv-form-field"><span>یافته‌های اصلاح‌شده</span><textarea name="findings" rows="4" maxlength="5000">${esc(record.findings || '')}</textarea></label><label class="nv-form-field"><span>برنامه درمان اصلاح‌شده</span><textarea name="treatment_plan" rows="4" maxlength="5000">${esc(record.treatment_plan || '')}</textarea></label><label class="nv-form-field full"><span>یادداشت اصلاح‌شده</span><textarea name="notes" rows="3" maxlength="5000">${esc(record.notes || '')}</textarea></label><div class="nv-form-note full">پرونده اصلی حذف یا بازنویسی نمی‌شود؛ یک اصلاحیه نسخه‌دار و قابل پیگیری ثبت خواهد شد.</div></form>`;
    document.body.insertAdjacentHTML('beforeend', modalShell('nvDoctorAmendModal', 'ثبت اصلاحیه پرونده', 'برای حفظ سابقه پزشکی، اصلاح به‌صورت نسخه‌دار ثبت می‌شود.', body, '<button class="nv-btn secondary" type="button" data-modal-close>انصراف</button><button class="nv-btn warning" type="button" id="saveDoctorAmendment">ثبت اصلاحیه</button>', 'is-wide'));
    const modal = qs('#nvDoctorAmendModal'); modal.dataset.removeOnClose = '1'; bindModal(modal);
    qs('#saveDoctorAmendment', modal)?.addEventListener('click', async event => {
      const form = qs('#nvDoctorAmendForm', modal);
      if (!validateFormPersian(form)) return;
      const values = Object.fromEntries(new FormData(form).entries());
      const reason = values.reason; delete values.reason;
      setBusy(event.currentTarget, true, 'در حال ثبت...');
      try {
        const result = await api(`/api/doctor/medical-records/${record.id}/amend`, { method: 'POST', body: JSON.stringify({ reason, patch: values }) });
        modal.dataset.removeOnClose = '0'; closeModal(modal); modal.remove(); state.records = []; await renderPage(); showMessage(result.message || 'اصلاحیه ثبت شد.', 'success');
      } catch (error) { showMessage(error.message || 'ثبت اصلاحیه انجام نشد.', 'error'); setBusy(event.currentTarget, false); }
    });
    openModal(modal);
  }

  async function renderRecords(root) {
    root.innerHTML = '<div class="nv-empty">در حال بارگذاری پرونده‌ها...</div>';
    await loadPatients();
    const items = await loadRecords();
    const rows = list => list.map(record => `<tr><td><strong>${esc(record.patient)}</strong></td><td>${jalali(record.date)}</td><td>${esc(record.diagnosis || '-')}</td><td>${badge(record.status)}</td><td><div class="nv-inline-actions"><button class="nv-btn secondary" type="button" data-record-detail="${record.id}"><i class="icon-eye" aria-hidden="true"></i><span>مشاهده</span></button><button class="nv-btn warning" type="button" data-record-amend="${record.id}"><i class="icon-pencil" aria-hidden="true"></i><span>اصلاحیه</span></button></div></td></tr>`);
    root.innerHTML = `<div class="nv-card"><header class="nv-card-header"><div><h2>پرونده‌های پزشکی</h2><p class="nv-card-subtitle">ثبت، مشاهده و اصلاح نسخه‌دار پرونده‌های درمانی</p></div><div class="nv-quick-actions"><button class="nv-btn" id="newMedicalRecord" type="button"><i class="icon-plus" aria-hidden="true"></i><span>ثبت پرونده جدید</span></button><button class="nv-btn secondary" id="refreshMedicalRecords" type="button"><i class="icon-refresh" aria-hidden="true"></i><span>به‌روزرسانی</span></button></div></header><div class="nv-card-body"><div class="nv-staff-filter-grid"><label class="is-wide"><span>جست‌وجو</span><input id="medicalRecordSearch" type="search" placeholder="نام بیمار یا متن تشخیص"></label><label><span>بیمار</span><select id="medicalRecordPatient"><option value="all">همه بیماران</option>${patientOptions()}</select></label><label><span>از تاریخ</span><input id="medicalRecordFrom" type="text" class="nv-jalali-date" data-no-default-date="1" autocomplete="off" placeholder="انتخاب تاریخ"></label></div><div id="medicalRecordsTable">${table(['بیمار', 'تاریخ', 'تشخیص', 'وضعیت', 'عملیات'], rows(items), 'پرونده‌ای ثبت نشده است.')}</div></div></div>`;
    window.NVDate?.initFields?.(root);
    refreshPrettySelects(root);
    const bindRows = host => {
      qsa('[data-record-detail]', host).forEach(button => button.addEventListener('click', () => showRecordDetails(items.find(item => item.id === Number(button.dataset.recordDetail)))));
      qsa('[data-record-amend]', host).forEach(button => button.addEventListener('click', () => openAmendRecordModal(items.find(item => item.id === Number(button.dataset.recordAmend)))));
    };
    bindRows(root);
    const apply = () => {
      const search = String(qs('#medicalRecordSearch')?.value || '').trim().toLowerCase();
      const patientId = qs('#medicalRecordPatient')?.value || 'all';
      const from = toGregorian(qs('#medicalRecordFrom')?.value || '');
      const filtered = items.filter(item => (!search || [item.patient, item.diagnosis, item.findings, item.notes].join(' ').toLowerCase().includes(search)) && (patientId === 'all' || item.patient_id === Number(patientId)) && (!from || dateOnly(item.date) >= from));
      const host = qs('#medicalRecordsTable'); host.innerHTML = table(['بیمار', 'تاریخ', 'تشخیص', 'وضعیت', 'عملیات'], rows(filtered), 'پرونده‌ای مطابق فیلترها پیدا نشد.'); bindRows(host);
    };
    qsa('#medicalRecordSearch,#medicalRecordPatient,#medicalRecordFrom').forEach(element => { element.addEventListener('input', apply); element.addEventListener('change', apply); });
    qs('#newMedicalRecord')?.addEventListener('click', () => void openMedicalRecordModal());
    qs('#refreshMedicalRecords')?.addEventListener('click', () => void refreshData('records'));
    if (location.hash === '#new') setTimeout(() => qs('#newMedicalRecord')?.click(), 80);
  }

  function medicationRow(index) {
    return `<div class="nv-medication-row" data-medication-row><label class="nv-form-field"><span>نام دارو *</span><input name="drug_name_${index}" required maxlength="200" placeholder="نام دارو"></label><label class="nv-form-field"><span>مقدار مصرف *</span><input name="dose_${index}" required maxlength="100" placeholder="برای نمونه یک قطره"></label><label class="nv-form-field"><span>دفعات مصرف *</span><input name="frequency_${index}" required maxlength="100" placeholder="برای نمونه هر ۸ ساعت"></label><label class="nv-form-field"><span>مدت مصرف</span><input name="duration_${index}" maxlength="100" placeholder="برای نمونه ۷ روز"></label><button class="nv-btn danger" type="button" data-remove-medication><i class="icon-trash" aria-hidden="true"></i><span>حذف</span></button></div>`;
  }

  async function openPrescriptionModal(patientId = 0) {
    await Promise.all([loadPatients(), loadAppointments()]);
    qs('#nvDoctorPrescriptionModal')?.remove();
    const body = `<form id="nvDoctorPrescriptionForm" class="nv-form" novalidate><label class="nv-form-field"><span>بیمار *</span><select name="patient_id" id="prescriptionPatient" required><option value="">انتخاب بیمار</option>${patientOptions(patientId)}</select></label><label class="nv-form-field"><span>نوبت مرتبط</span><select name="appointment_id" id="prescriptionAppointment"><option value="">بدون نوبت مرتبط</option>${appointmentOptions(patientId)}</select></label><label class="nv-form-field full"><span>تشخیص</span><textarea name="diagnosis" rows="2" maxlength="3000" placeholder="تشخیص مرتبط با نسخه"></textarea></label><div class="nv-form-field full"><span>اقلام دارویی *</span><div class="nv-medication-list" id="doctorMedicationList">${medicationRow(0)}</div><button class="nv-btn secondary" type="button" id="addMedicationRow" style="margin-top:10px"><i class="icon-plus" aria-hidden="true"></i><span>افزودن داروی دیگر</span></button></div><label class="nv-form-field full"><span>دستورهای تکمیلی</span><textarea name="instructions" rows="3" maxlength="5000" placeholder="توصیه‌ها و نحوه مصرف"></textarea></label><label class="nv-form-field"><span>تاریخ اعتبار نسخه</span><input name="valid_until" type="text" class="nv-jalali-date" data-no-default-date="1" autocomplete="off" placeholder="انتخاب تاریخ"></label><label class="nv-check-row full"><input name="allergy_review_acknowledged" type="checkbox" required><span>حساسیت‌های دارویی و داروهای جاری بیمار را بررسی کرده‌ام.</span></label></form>`;
    document.body.insertAdjacentHTML('beforeend', modalShell('nvDoctorPrescriptionModal', 'ثبت نسخه جدید', 'نسخه دارویی ساختاریافته و قابل پیگیری ثبت کنید.', body, '<button class="nv-btn secondary" type="button" data-modal-close>انصراف</button><button class="nv-btn success" type="button" id="saveDoctorPrescription"><i class="icon-check" aria-hidden="true"></i><span>ثبت نسخه</span></button>', 'is-wide'));
    const modal = qs('#nvDoctorPrescriptionModal'); modal.dataset.removeOnClose = '1'; bindModal(modal);
    let counter = 1;
    qs('#addMedicationRow', modal)?.addEventListener('click', () => { qs('#doctorMedicationList', modal).insertAdjacentHTML('beforeend', medicationRow(counter++)); });
    modal.addEventListener('click', event => { const button = event.target.closest('[data-remove-medication]'); if (button && qsa('[data-medication-row]', modal).length > 1) button.closest('[data-medication-row]')?.remove(); });
    qs('#prescriptionPatient', modal)?.addEventListener('change', event => { qs('#prescriptionAppointment', modal).innerHTML = `<option value="">بدون نوبت مرتبط</option>${appointmentOptions(Number(event.target.value))}`; refreshPrettySelects(modal); });
    qs('#saveDoctorPrescription', modal)?.addEventListener('click', event => void savePrescription(event.currentTarget, modal));
    openModal(modal);
    refreshPrettySelects(modal);
  }

  async function savePrescription(button, modal) {
    const form = qs('#nvDoctorPrescriptionForm', modal);
    if (!validateFormPersian(form)) return;
    const data = new FormData(form);
    const items = qsa('[data-medication-row]', modal).map(row => ({
      drug_name: qs('[name^="drug_name_"]', row)?.value.trim(),
      dose: qs('[name^="dose_"]', row)?.value.trim(),
      frequency: qs('[name^="frequency_"]', row)?.value.trim(),
      duration: qs('[name^="duration_"]', row)?.value.trim()
    }));
    const payload = {
      patient_id: Number(data.get('patient_id')),
      appointment_id: data.get('appointment_id') ? Number(data.get('appointment_id')) : null,
      diagnosis: String(data.get('diagnosis') || '').trim(),
      instructions: String(data.get('instructions') || '').trim(),
      valid_until: toGregorian(data.get('valid_until')),
      allergy_review_acknowledged: data.get('allergy_review_acknowledged') === 'on',
      items
    };
    setBusy(button, true, 'در حال ثبت نسخه...');
    try {
      const result = await api('/api/doctor/prescriptions', { method: 'POST', body: JSON.stringify(payload) });
      modal.dataset.removeOnClose = '0'; closeModal(modal); modal.remove(); state.prescriptions = []; await renderPage(); showMessage(result.message || 'نسخه ثبت شد.', 'success');
    } catch (error) { showMessage(error.message || 'ثبت نسخه انجام نشد.', 'error'); setBusy(button, false); }
  }

  function showPrescriptionDetails(item) {
    qs('#nvDoctorPrescriptionDetail')?.remove();
    const medicines = item.medicines.length ? item.medicines.map((medicine, index) => `<div class="nv-staff-note" style="margin-bottom:10px"><strong>${toFa(index + 1)}. ${esc(medicine.drug_name || '-')}</strong><br>${esc(medicine.dose || '-')}، ${esc(medicine.frequency || '-')} ${medicine.duration ? `، ${esc(medicine.duration)}` : ''}</div>`).join('') : '<div class="nv-empty">اقلام نسخه در ساختار قدیمی ذخیره شده‌اند.</div>';
    const body = `<div class="nv-detail-grid" style="margin-bottom:16px"><div><span>بیمار</span><strong>${esc(item.patient)}</strong></div><div><span>تاریخ ثبت</span><strong>${jalali(item.date, true)}</strong></div><div><span>تاریخ اعتبار</span><strong>${item.valid_until ? jalali(item.valid_until) : 'ثبت نشده'}</strong></div><div><span>شناسه نسخه</span><strong>${toFa(item.id)}</strong></div><div class="is-full"><span>تشخیص</span><p>${esc(item.diagnosis || '-')}</p></div><div class="is-full"><span>دستورهای تکمیلی</span><p>${esc(item.instructions || '-')}</p></div></div><h3 style="margin-bottom:12px">اقلام دارویی</h3>${medicines}`;
    document.body.insertAdjacentHTML('beforeend', modalShell('nvDoctorPrescriptionDetail', 'جزئیات نسخه', 'نسخه دارویی ثبت‌شده برای بیمار', body, '<button class="nv-btn secondary" type="button" data-modal-close>بستن</button>', 'is-wide'));
    const modal = qs('#nvDoctorPrescriptionDetail'); modal.dataset.removeOnClose = '1'; bindModal(modal); openModal(modal);
  }

  async function renderPrescriptions(root) {
    root.innerHTML = '<div class="nv-empty">در حال بارگذاری نسخه‌ها...</div>';
    await loadPatients();
    const items = await loadPrescriptions();
    const rows = list => list.map(item => `<tr><td><strong>${esc(item.patient)}</strong></td><td>${jalali(item.date, true)}</td><td>${esc(item.diagnosis || '-')}</td><td>${toFa(item.medicines.length)}</td><td>${item.valid_until ? jalali(item.valid_until) : '-'}</td><td><button class="nv-btn secondary" type="button" data-prescription-detail="${item.id}"><i class="icon-eye" aria-hidden="true"></i><span>مشاهده</span></button></td></tr>`);
    root.innerHTML = `<div class="nv-card"><header class="nv-card-header"><div><h2>نسخه‌ها و دستورهای پزشکی</h2><p class="nv-card-subtitle">ثبت نسخه ساختاریافته و مشاهده نسخه‌های قبلی</p></div><div class="nv-quick-actions"><button class="nv-btn" id="newDoctorPrescription" type="button"><i class="icon-plus" aria-hidden="true"></i><span>ثبت نسخه جدید</span></button><button class="nv-btn secondary" id="refreshDoctorPrescriptions" type="button"><i class="icon-refresh" aria-hidden="true"></i><span>به‌روزرسانی</span></button></div></header><div class="nv-card-body"><div class="nv-staff-filter-grid"><label class="is-wide"><span>جست‌وجو</span><input id="doctorPrescriptionSearch" type="search" placeholder="نام بیمار، تشخیص یا نام دارو"></label><label><span>بیمار</span><select id="doctorPrescriptionPatient"><option value="all">همه بیماران</option>${patientOptions()}</select></label></div><div id="doctorPrescriptionsTable">${table(['بیمار', 'تاریخ ثبت', 'تشخیص', 'تعداد اقلام', 'اعتبار تا', 'عملیات'], rows(items), 'نسخه‌ای ثبت نشده است.')}</div></div></div>`;
    refreshPrettySelects(root);
    const bindRows = host => qsa('[data-prescription-detail]', host).forEach(button => button.addEventListener('click', () => showPrescriptionDetails(items.find(item => item.id === Number(button.dataset.prescriptionDetail)))));
    bindRows(root);
    const apply = () => {
      const search = String(qs('#doctorPrescriptionSearch')?.value || '').trim().toLowerCase();
      const patientId = qs('#doctorPrescriptionPatient')?.value || 'all';
      const filtered = items.filter(item => {
        const drugs = item.medicines.map(row => row.drug_name).join(' ');
        return (!search || [item.patient, item.diagnosis, item.instructions, drugs].join(' ').toLowerCase().includes(search)) && (patientId === 'all' || item.patient_id === Number(patientId));
      });
      const host = qs('#doctorPrescriptionsTable'); host.innerHTML = table(['بیمار', 'تاریخ ثبت', 'تشخیص', 'تعداد اقلام', 'اعتبار تا', 'عملیات'], rows(filtered), 'نسخه‌ای مطابق فیلترها پیدا نشد.'); bindRows(host);
    };
    qs('#doctorPrescriptionSearch')?.addEventListener('input', apply);
    qs('#doctorPrescriptionPatient')?.addEventListener('change', apply);
    qs('#newDoctorPrescription')?.addEventListener('click', () => void openPrescriptionModal());
    qs('#refreshDoctorPrescriptions')?.addEventListener('click', () => void refreshData('prescriptions'));
    if (location.hash === '#new') setTimeout(() => qs('#newDoctorPrescription')?.click(), 80);
  }

  function dayLabel(value) {
    const numeric = Number(value);
    const labels = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
    return labels[numeric] || String(value || '-');
  }

  async function renderSchedule(root) {
    root.innerHTML = '<div class="nv-empty">در حال بارگذاری برنامه کاری...</div>';
    const items = await loadSchedules();
    const byDay = new Map(items.map(item => [Number(item.day_of_week), item]));
    const dayOrder = [6, 0, 1, 2, 3, 4, 5];
    root.innerHTML = `<div class="nv-card nv-doctor-schedule-card"><header class="nv-card-header"><div><h2>برنامه کاری هفتگی</h2><p class="nv-card-subtitle">روزهای حضور و ساعت شروع و پایان فعالیت</p></div><button class="nv-btn success" id="saveDoctorSchedule" type="button"><i class="icon-check" aria-hidden="true"></i><span>ذخیره برنامه</span></button></header><div class="nv-card-body"><div class="nv-staff-note nv-doctor-schedule-note">تغییرات برنامه کاری ممکن است روی ظرفیت‌های نوبت‌دهی اثر بگذارد. پیش از ذخیره، ساعت‌ها را دقیق بررسی کنید.</div><form id="doctorScheduleForm" class="nv-doctor-schedule-form">${dayOrder.map(day => { const item = byDay.get(day) || {}; const working = item.is_working !== 0 && Boolean(item.start_time || item.end_time); const disabled = working ? '' : 'disabled'; return `<section class="nv-doctor-schedule-row ${working ? 'is-working' : 'is-off'}"><label class="nv-check-row nv-doctor-day-toggle"><input type="checkbox" name="working_${day}" ${working ? 'checked' : ''}><span>${esc(dayLabel(day))} روز کاری است</span></label><div class="nv-doctor-hours-grid"><label class="nv-form-field nv-doctor-time-field"><span>ساعت شروع</span><input type="time" name="start_${day}" value="${esc(timeOnly(item.start_time) === '-' ? '08:00' : timeOnly(item.start_time))}" ${disabled}></label><label class="nv-form-field nv-doctor-time-field"><span>ساعت پایان</span><input type="time" name="end_${day}" value="${esc(timeOnly(item.end_time) === '-' ? '14:00' : timeOnly(item.end_time))}" ${disabled}></label></div></section>`; }).join('')}</form></div></div>`;
    qsa('.nv-doctor-day-toggle input[type="checkbox"]', root).forEach(toggle => {
      const row = toggle.closest('.nv-doctor-schedule-row');
      const sync = () => {
        row?.classList.toggle('is-working', toggle.checked);
        row?.classList.toggle('is-off', !toggle.checked);
        qsa('input[type="time"]', row || document).forEach(input => { input.disabled = !toggle.checked; });
      };
      toggle.addEventListener('change', sync);
      sync();
    });
    qs('#saveDoctorSchedule')?.addEventListener('click', async event => {
      const form = qs('#doctorScheduleForm');
      const schedules = dayOrder.map(day => {
        const working = Boolean(qs(`[name="working_${day}"]`, form)?.checked);
        return {
          day_of_week: day,
          start_time: qs(`[name="start_${day}"]`, form)?.value || '08:00',
          end_time: qs(`[name="end_${day}"]`, form)?.value || '14:00',
          is_working: working
        };
      });
      const missing = schedules.find(item => item.is_working && (!item.start_time || !item.end_time));
      if (missing) return showMessage(`ساعت شروع و پایان ${dayLabel(missing.day_of_week)} را کامل وارد کنید.`, 'error');
      const invalid = schedules.find(item => item.is_working && item.start_time >= item.end_time);
      if (invalid) return showMessage(`ساعت پایان ${dayLabel(invalid.day_of_week)} باید بعد از ساعت شروع باشد.`, 'error');
      setBusy(event.currentTarget, true, 'در حال ذخیره...');
      try {
        const result = await api('/api/doctor/schedule', { method: 'PUT', body: JSON.stringify({ schedules }) });
        state.schedules = []; await loadSchedules(true); showMessage(result.message || 'برنامه کاری ذخیره شد.', 'success');
      } catch (error) { showMessage(error.message || 'ذخیره برنامه انجام نشد.', 'error'); }
      finally { setBusy(event.currentTarget, false); }
    });
  }

  async function renderProfile(root) {
    root.innerHTML = '<div class="nv-empty">در حال بارگذاری اطلاعات حساب...</div>';
    const doctor = await loadProfile(true);
    root.innerHTML = `<div class="nv-staff-grid-main"><article class="nv-card"><header class="nv-card-header"><div><h2>اطلاعات حرفه‌ای پزشک</h2><p class="nv-card-subtitle">اطلاعات نمایش‌داده‌شده در سامانه و فرآیند نوبت‌دهی</p></div></header><div class="nv-card-body"><form id="doctorProfileForm" class="nv-form" novalidate><label class="nv-form-field"><span>نام و نام خانوادگی *</span><input name="full_name" required maxlength="150" value="${esc(doctor.full_name || '')}"></label><label class="nv-form-field"><span>شماره تماس *</span><input name="phone" required inputmode="tel" maxlength="15" value="${esc(toFa(doctor.phone || ''))}"></label><label class="nv-form-field"><span>رایانامه</span><input name="email" type="email" dir="ltr" value="${esc(doctor.email || '')}" placeholder="name@example.com"></label><label class="nv-form-field"><span>تخصص</span><input name="specialty" maxlength="150" value="${esc(doctor.specialty || '')}" placeholder="برای نمونه چشم‌پزشکی"></label><label class="nv-form-field"><span>شماره نظام پزشکی</span><input name="license_number" maxlength="100" value="${esc(doctor.license_number || '')}"></label><label class="nv-form-field"><span>سابقه کاری (سال)</span><input name="experience_years" type="number" min="0" max="80" value="${esc(doctor.experience_years || 0)}"></label><label class="nv-form-field"><span>هزینه ویزیت (تومان)</span><input name="consultation_fee" inputmode="numeric" value="${esc(toFa(doctor.consultation_fee || 0))}"></label><label class="nv-form-field full"><span>معرفی پزشک</span><textarea name="bio" rows="6" maxlength="5000" placeholder="معرفی کوتاه و حرفه‌ای">${esc(doctor.bio || '')}</textarea></label><div class="nv-form-field full"><button class="nv-btn success" type="submit"><i class="icon-check" aria-hidden="true"></i><span>ذخیره اطلاعات</span></button></div></form></div></article><aside class="nv-card"><header class="nv-card-header"><div><h2>خلاصه حساب</h2><p class="nv-card-subtitle">اطلاعات هویتی و وضعیت دسترسی</p></div></header><div class="nv-card-body"><div class="nv-detail-grid"><div class="is-full"><span>نام کاربری</span><strong>${esc(doctor.username || state.user.username || '-')}</strong></div><div><span>وضعیت حساب</span>${badge(doctor.is_active === 0 ? 'inactive' : 'active')}</div><div><span>وضعیت پذیرش</span>${badge(doctor.is_available === 0 ? 'inactive' : 'active')}</div><div class="is-full"><span>هزینه ویزیت فعلی</span><strong>${money(doctor.consultation_fee)}</strong></div></div></div></aside></div>`;
    qs('#doctorProfileForm')?.addEventListener('submit', async event => {
      event.preventDefault();
      if (!validateFormPersian(event.currentTarget, profileExtraRules)) return;
      const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
      payload.phone = toEn(payload.phone).replace(/\D/g, '');
      payload.experience_years = Number(toEn(payload.experience_years) || 0);
      payload.consultation_fee = Number(toEn(payload.consultation_fee).replace(/\D/g, '') || 0);
      const button = qs('button[type="submit"]', event.currentTarget);
      setBusy(button, true, 'در حال ذخیره...');
      try {
        const result = await api('/api/doctor/profile', { method: 'PUT', body: JSON.stringify(payload) });
        state.doctor = { ...state.doctor, ...payload }; setHeader(); showMessage(result.message || 'اطلاعات حساب به‌روزرسانی شد.', 'success');
      } catch (error) { showMessage(error.message || 'ذخیره اطلاعات حساب انجام نشد.', 'error'); }
      finally { setBusy(button, false); }
    });
  }

  async function renderPage() {
    const root = qs('#doctorPageContent');
    if (!root) return;
    const page = document.body.dataset.doctorPage || 'index';
    try {
      if (page === 'index') await renderDashboard(root);
      else if (page === 'appointments') await renderAppointments(root);
      else if (page === 'patients') await renderPatients(root);
      else if (page === 'medical-records') await renderRecords(root);
      else if (page === 'prescriptions') await renderPrescriptions(root);
      else if (page === 'schedule') await renderSchedule(root);
      else if (page === 'profile') await renderProfile(root);
    } catch (error) {
      root.innerHTML = `<div class="nv-error-state"><strong>بارگذاری این بخش انجام نشد.</strong><span>${esc(error.message || 'خطای نامشخص')}</span><button class="nv-btn secondary" id="retryDoctorPage" type="button">تلاش دوباره</button></div>`;
      qs('#retryDoctorPage')?.addEventListener('click', () => void renderPage());
    }
  }

  async function init() {
    document.addEventListener('input', event => {
      if (event.target?.matches?.('input, select, textarea')) clearFieldError(event.target);
    }, true);
    document.addEventListener('change', event => {
      if (event.target?.matches?.('input, select, textarea')) clearFieldError(event.target);
    }, true);
    try {
      if (!await bootstrapSession()) return;
      await loadProfile().catch(() => ({}));
      await renderPage();
    } catch (error) {
      const root = qs('#doctorPageContent');
      if (root) root.innerHTML = `<div class="nv-error-state">${esc(error.message || 'بررسی نشست کاربری انجام نشد.')}</div>`;
    }
  }

  window.logout = () => window.noorvistaLogout ? window.noorvistaLogout() : window.location.replace('/login');
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => void init());
  else void init();
})();
