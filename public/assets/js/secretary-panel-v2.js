// NOORVISTA Secretary Panel V2.1.62
// پنل عملیاتی منشی: نوبت، صف پذیرش، بیماران، پرداخت و اعلان‌ها
(function () {
  'use strict';
  if (window.__NOORVISTA_SECRETARY_PANEL_V2__) return;
  window.__NOORVISTA_SECRETARY_PANEL_V2__ = true;

  const fa = '۰۱۲۳۴۵۶۷۸۹';
  const ar = '٠١٢٣٤٥٦٧٨٩';
  const SECRETARY_ROLES = new Set([
    'receptionist', 'reception', 'secretary', 'staff',
    'clinic_admin', 'clinic_manager', 'manager', 'system_admin', 'admin'
  ]);
  const state = { user: {}, appointments: [], patients: [], payments: [], page: '' };

  const qs = (selector, root = document) => root.querySelector(selector);
  const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const toFa = value => String(value ?? '').replace(/\d/g, digit => fa[Number(digit)]);
  const toEn = value => String(value ?? '')
    .replace(/[۰-۹]/g, digit => String(fa.indexOf(digit)))
    .replace(/[٠-٩]/g, digit => String(ar.indexOf(digit)));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[char]);
  const cleanPhone = value => {
    let phone = toEn(value).replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
    if (phone.startsWith('+98')) phone = `0${phone.slice(3)}`;
    else if (phone.startsWith('0098')) phone = `0${phone.slice(4)}`;
    else if (phone.startsWith('98') && phone.length === 12) phone = `0${phone.slice(2)}`;
    else if (phone.startsWith('9') && phone.length === 10) phone = `0${phone}`;
    return phone;
  };
  const normalizeRole = value => String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
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
      const options = includeTime
        ? { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }
        : { year: 'numeric', month: '2-digit', day: '2-digit' };
      const raw = includeTime ? new Date(value) : new Date(`${dateOnly(value)}T12:00:00`);
      return toFa(new Intl.DateTimeFormat('fa-IR-u-ca-persian', options).format(raw));
    } catch (_) {
      return toFa(includeTime ? String(value) : dateOnly(value));
    }
  }

  function money(value) {
    const amount = Number(value || 0);
    return amount > 0 ? `${toFa(Math.round(amount).toLocaleString('en-US'))} تومان` : 'رایگان/ثبت‌نشده';
  }

  function roleHome(role) {
    const value = normalizeRole(role);
    if (['system_admin', 'admin', 'super_admin', 'site_admin', 'owner'].includes(value)) return '/dashboard/panel/admin/index.html';
    if (['clinic_admin', 'clinic_manager', 'manager'].includes(value)) return '/dashboard/panel/clinic-admin/index.html';
    if (value === 'doctor') return '/dashboard/panel/doctor/index.html';
    if (['receptionist', 'reception', 'secretary', 'staff'].includes(value)) return '/dashboard/panel/reception/index.html';
    if (value === 'patient') return '/dashboard/panel/patient/index.html';
    return '/login';
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...options,
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

  async function firstOk(urls, fallback = {}) {
    let lastError = null;
    for (const url of urls) {
      try { return await api(url); }
      catch (error) {
        lastError = error;
        const status = Number(error.status);
        if (![404, 405].includes(status)) throw error;
      }
    }
    if (lastError && fallback == null) throw lastError;
    return fallback || {};
  }

  function arrayFrom(data, keys) {
    if (Array.isArray(data)) return data;
    for (const key of keys) {
      if (Array.isArray(data?.[key])) return data[key];
      if (Array.isArray(data?.data?.[key])) return data.data[key];
    }
    return [];
  }

  function showMessage(message, type = 'info') {
    if (window.showToast) {
      window.showToast(message, type);
      return;
    }
    let host = qs('#nvSecretaryFeedback');
    if (!host) {
      host = document.createElement('div');
      host.id = 'nvSecretaryFeedback';
      host.className = 'nv-secretary-feedback';
      host.setAttribute('role', 'status');
      host.setAttribute('aria-live', 'polite');
      document.body.appendChild(host);
    }
    host.className = `nv-secretary-feedback is-${type}`;
    host.textContent = message;
    host.hidden = false;
    window.clearTimeout(showMessage.timer);
    showMessage.timer = window.setTimeout(() => { host.hidden = true; }, 4500);
  }

  function setBusy(button, busy, text = 'در حال انجام...') {
    if (!button) return;
    if (busy) {
      button.dataset.oldText = button.innerHTML;
      button.disabled = true;
      button.innerHTML = esc(text);
    } else {
      button.disabled = false;
      if (button.dataset.oldText) button.innerHTML = button.dataset.oldText;
      delete button.dataset.oldText;
    }
  }

  function statusMeta(status) {
    const value = normalizeStatus(status);
    return ({
      pending: ['در انتظار تأیید', 'warning'],
      confirmed: ['تأیید شده', 'success'],
      rescheduled: ['تغییر زمان', 'warning'],
      completed: ['انجام شده', 'success'],
      no_show: ['عدم مراجعه', 'danger'],
      cancelled: ['لغو شده', 'danger'],
      paid: ['پرداخت شده', 'success'],
      completed_payment: ['پرداخت شده', 'success'],
      unpaid: ['پرداخت نشده', 'danger'],
      pending_payment: ['در انتظار بررسی', 'warning'],
      failed: ['ناموفق', 'danger'],
      refunded: ['بازپرداخت شده', 'gray'],
      free: ['رایگان', 'success']
    })[value] || [String(status || 'نامشخص'), 'gray'];
  }

  function badge(status, payment = false) {
    let value = normalizeStatus(status);
    if (payment && value === 'completed') value = 'completed_payment';
    if (payment && value === 'pending') value = 'pending_payment';
    const [label, tone] = statusMeta(value);
    return `<span class="nv-badge ${tone}">${esc(label)}</span>`;
  }

  function paymentMethodLabel(value) {
    return ({
      cash: 'نقدی', pos: 'کارت‌خوان', bank_transfer: 'واریز بانکی',
      card_to_card: 'کارت‌به‌کارت', online: 'آنلاین', sandbox: 'آزمایشی'
    })[String(value || '').toLowerCase()] || (value ? String(value) : 'ثبت نشده');
  }

  function appointmentTypeLabel(value) {
    return ({ regular: 'عادی', follow_up: 'پیگیری', emergency: 'اورژانسی', surgery: 'جراحی' })[String(value || '')] || 'عادی';
  }

  function table(headers, rows, empty = 'اطلاعاتی برای نمایش وجود ندارد.') {
    if (!rows.length) return `<div class="nv-empty">${esc(empty)}</div>`;
    return `<div class="nv-table-wrap"><table><thead><tr>${headers.map(item => `<th>${item}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  }

  function statCard(label, value, icon, note = '') {
    return `<article class="nv-tw-stat-card"><span class="nv-tw-stat-icon"><i class="${esc(icon)}" aria-hidden="true"></i></span><div class="tw-min-w-0"><div class="nv-tw-stat-value">${toFa(value)}</div><div class="nv-tw-stat-label">${esc(label)}</div>${note ? `<div class="tw-mt-1 tw-text-xs tw-text-slate-500">${esc(note)}</div>` : ''}</div></article>`;
  }

  function modalShell(id, title, body, footer = '') {
    return `<div class="nv-modal" id="${esc(id)}" role="dialog" aria-modal="true" aria-labelledby="${esc(id)}Title" hidden>
      <div class="nv-modal-dialog" tabindex="-1">
        <header class="nv-modal-header"><h2 id="${esc(id)}Title">${esc(title)}</h2><button class="nv-modal-close" type="button" data-modal-close aria-label="بستن">×</button></header>
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
    window.setTimeout(() => qs('input, select, textarea, button, [tabindex="0"]', modal)?.focus(), 20);
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('show');
    modal.hidden = true;
    document.body.classList.remove('nv-modal-open');
    modal._returnFocus?.focus?.();
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

  function setHeader() {
    const name = state.user.full_name || state.user.fullName || state.user.name || state.user.username || 'منشی';
    qsa('[data-nv-user-name], [data-nv3-user-name]').forEach(element => { element.textContent = name; });
    const avatar = qs('[data-nv3-user-avatar], #userAvatar');
    if (avatar) {
      const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('') || 'من';
      avatar.textContent = initials;
      avatar.setAttribute('aria-label', `کاربر ${name}`);
    }
  }

  async function bootstrapSession() {
    const data = await api('/api/auth/me');
    if (!data.user) throw new Error('اطلاعات حساب کاربری دریافت نشد.');
    const role = normalizeRole(data.user.role);
    if (!SECRETARY_ROLES.has(role)) {
      window.location.replace(roleHome(role));
      return false;
    }
    state.user = data.user;
    setHeader();
    return true;
  }

  function logout() {
    if (window.noorvistaLogout) return window.noorvistaLogout();
    window.location.replace('/login');
  }
  window.logout = logout;

  async function loadAppointments(force = false) {
    if (state.appointments.length && !force) return state.appointments;
    const data = await firstOk(['/api/clinic/appointments', '/api/appointments'], { appointments: [] });
    state.appointments = arrayFrom(data, ['appointments', 'items', 'data']).map(item => ({
      id: Number(item.id),
      patient_id: item.patient_id,
      patient: item.patient_name || item.patient_full_name || item.full_name || 'بیمار',
      phone: item.patient_phone || item.phone || item.mobile || '-',
      doctor: item.doctor_name || 'پزشک',
      service: item.service_name || item.type || '-',
      center: item.medical_center_name || item.center_name || '-',
      date: item.appointment_date || item.slot_date || item.date,
      time: item.appointment_time || item.start_time || item.time,
      type: item.type || 'regular',
      status: normalizeStatus(item.status || 'pending'),
      payment_status: normalizeStatus(item.resolved_payment_status || item.appointment_payment_status || item.payment_status || item.paymentStatus || 'unpaid'),
      amount: Number(item.amount || item.appointment_fee || 0),
      queue_number: item.appointment_queue_number || item.queue_number || '',
      reason: item.reason || item.description || '',
      notes: item.notes || '',
      tracking_code: item.tracking_code || '',
      payment_id: item.payment_id || '',
      payment_method: item.payment_method || '',
      payment_receipt: item.payment_receipt_number || item.receipt_number || '',
      payment_date: item.payment_date || ''
    }));
    return state.appointments;
  }

  async function loadPatients(force = false) {
    if (state.patients.length && !force) return state.patients;
    const data = await firstOk(['/api/clinic/patients', '/api/patients'], { patients: [] });
    state.patients = arrayFrom(data, ['patients', 'items', 'data']).map(item => ({
      id: Number(item.id),
      user_id: item.user_id,
      name: item.full_name || item.name || item.patient_name || item.username || 'بیمار',
      phone: item.phone || item.mobile || item.patient_phone || '-',
      email: item.email || '',
      national_code: item.national_code || item.nationalCode || '',
      birth_date: item.birth_date || '',
      gender: item.gender || '',
      address: item.address || '',
      appointment_count: Number(item.appointment_count || 0),
      created_at: item.created_at || item.createdAt || ''
    }));
    return state.patients;
  }

  async function loadPayments(force = false) {
    if (state.payments.length && !force) return state.payments;
    const data = await api('/api/clinic/payments');
    state.payments = arrayFrom(data, ['payments', 'items', 'data']).map(item => ({
      id: Number(item.id),
      appointment_id: Number(item.appointment_id || 0),
      patient: item.patient_name || item.full_name || '-',
      patient_phone: item.patient_phone || '',
      doctor: item.doctor_name || '',
      service: item.service_name || '',
      amount: Number(item.amount || 0),
      method: item.payment_method || item.method || '',
      status: normalizeStatus(item.status || item.payment_status || 'pending'),
      date: item.payment_date || item.created_at || item.date,
      receipt: item.receipt_number || item.tracking_code || item.ref_id || '',
      description: item.description || item.notes || ''
    }));
    return state.payments;
  }

  async function refreshCurrentPage(message = '') {
    state.appointments = [];
    state.patients = [];
    state.payments = [];
    await renderPage();
    if (message) showMessage(message, 'success');
  }

  async function changeAppointmentStatus(appointment, target, button) {
    const status = normalizeStatus(target);
    let reason = '';
    if (status === 'cancelled') {
      const answer = window.prompt('دلیل لغو نوبت را کوتاه بنویسید:');
      if (answer === null) return;
      reason = answer.trim();
    }
    const question = ({
      confirmed: 'این نوبت تأیید و شماره صف برای آن ثبت شود؟',
      completed: 'مراجعه این بیمار انجام شده است؟',
      no_show: 'عدم مراجعه بیمار ثبت شود؟',
      cancelled: 'این نوبت لغو شود؟'
    })[status] || 'وضعیت نوبت تغییر کند؟';
    if (!window.confirm(question)) return;

    setBusy(button, true);
    try {
      let result;
      if (status === 'confirmed') {
        result = await api(`/api/clinic/appointments/${appointment.id}/confirm`, { method: 'PUT', body: '{}' });
      } else {
        result = await api(`/api/clinic/appointments/${appointment.id}/status`, {
          method: 'PUT', body: JSON.stringify({ status, reason })
        });
      }
      await refreshCurrentPage(result.message || 'وضعیت نوبت تغییر کرد.');
    } catch (error) {
      showMessage(error.message || 'تغییر وضعیت انجام نشد.', 'error');
      setBusy(button, false);
    }
  }

  function appointmentActions(item, compact = false) {
    const actions = [`<button class="nv-btn secondary" type="button" data-appointment-detail="${item.id}">جزئیات</button>`];
    if (item.status === 'pending' || item.status === 'rescheduled') {
      actions.push(`<button class="nv-btn" type="button" data-appointment-status="confirmed" data-id="${item.id}">تأیید و شماره صف</button>`);
      actions.push(`<button class="nv-btn danger" type="button" data-appointment-status="cancelled" data-id="${item.id}">لغو</button>`);
    } else if (item.status === 'confirmed') {
      actions.push(`<button class="nv-btn" type="button" data-appointment-status="completed" data-id="${item.id}">اتمام مراجعه</button>`);
      actions.push(`<button class="nv-btn secondary" type="button" data-appointment-status="no_show" data-id="${item.id}">عدم مراجعه</button>`);
      if (!compact) actions.push(`<button class="nv-btn danger" type="button" data-appointment-status="cancelled" data-id="${item.id}">لغو</button>`);
    }
    return `<div class="nv-inline-actions">${actions.join('')}</div>`;
  }

  function bindAppointmentActions(root) {
    qsa('[data-appointment-status]', root).forEach(button => button.addEventListener('click', () => {
      const appointment = state.appointments.find(item => item.id === Number(button.dataset.id));
      if (appointment) void changeAppointmentStatus(appointment, button.dataset.appointmentStatus, button);
    }));
    qsa('[data-appointment-detail]', root).forEach(button => button.addEventListener('click', () => {
      const appointment = state.appointments.find(item => item.id === Number(button.dataset.appointmentDetail));
      if (appointment) showAppointmentDetails(appointment);
    }));
  }

  function showAppointmentDetails(item) {
    qs('#nvAppointmentDetailModal')?.remove();
    const details = `<div class="nv-detail-grid">
      <div><span>بیمار</span><strong>${esc(item.patient)}</strong><small>${toFa(item.phone)}</small></div>
      <div><span>پزشک</span><strong>${esc(item.doctor)}</strong></div>
      <div><span>خدمت</span><strong>${esc(item.service)}</strong></div>
      <div><span>مرکز</span><strong>${esc(item.center)}</strong></div>
      <div><span>تاریخ و ساعت</span><strong>${jalali(item.date)}، ساعت ${toFa(timeOnly(item.time))}</strong></div>
      <div><span>شماره صف</span><strong>${item.queue_number ? toFa(item.queue_number) : 'هنوز تعیین نشده'}</strong></div>
      <div><span>وضعیت نوبت</span>${badge(item.status)}</div>
      <div><span>وضعیت پرداخت</span>${badge(item.payment_status, true)}</div>
      <div><span>مبلغ</span><strong>${money(item.amount)}</strong></div>
      <div><span>نوع نوبت</span><strong>${esc(appointmentTypeLabel(item.type))}</strong></div>
      <div class="is-full"><span>شرح مراجعه</span><p>${esc(item.reason || 'شرحی ثبت نشده است.')}</p></div>
      ${item.tracking_code ? `<div class="is-full"><span>کد پیگیری</span><strong>${esc(item.tracking_code)}</strong></div>` : ''}
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalShell('nvAppointmentDetailModal', 'جزئیات نوبت', details, '<button class="nv-btn secondary" type="button" data-modal-close>بستن</button>'));
    const modal = qs('#nvAppointmentDetailModal');
    bindModal(modal);
    openModal(modal);
  }

  async function renderDashboard(root) {
    root.innerHTML = '<div class="nv-empty">در حال بارگذاری داشبورد منشی...</div>';
    const [appointments, patients, payments] = await Promise.all([loadAppointments(), loadPatients(), loadPayments()]);
    const today = todayISO();
    const todays = appointments.filter(item => dateOnly(item.date) === today);
    const queue = todays.filter(item => ['pending', 'confirmed', 'rescheduled'].includes(item.status));
    const pendingPayments = payments.filter(item => item.status === 'pending');
    const unpaid = appointments.filter(item => item.amount > 0 && !['paid', 'free'].includes(item.payment_status) && !['cancelled', 'no_show'].includes(item.status));

    root.innerHTML = `<div class="tw-space-y-6">
      <div class="tw-grid tw-grid-cols-1 tw-gap-4 sm:tw-grid-cols-2 xl:tw-grid-cols-4">
        ${statCard('نوبت‌های امروز', todays.length, 'icon-calendar', 'برنامه امروز کلینیک')}
        ${statCard('صف فعال امروز', queue.length, 'icon-list', 'در انتظار یا تأییدشده')}
        ${statCard('پرداخت بررسی‌نشده', pendingPayments.length, 'icon-credit-card', 'نیازمند بررسی مدیر')}
        ${statCard('هزینه تسویه‌نشده', unpaid.length, 'icon-warning', 'نوبت‌های پولی فعال')}
      </div>
      <div class="tw-grid tw-grid-cols-1 tw-gap-6 xl:tw-grid-cols-[minmax(0,2fr)_minmax(290px,1fr)]">
        <article class="nv-tw-card"><header class="nv-tw-card-header"><div><h2 class="tw-text-lg tw-font-black tw-text-clinic-ink">برنامه امروز</h2><p class="tw-mt-1 tw-text-sm tw-text-slate-600">وضعیت واقعی نوبت و پرداخت مستقل نمایش داده می‌شود.</p></div><a class="noor-tw-btn-secondary" href="appointments.html">همه نوبت‌ها</a></header>
          <div class="nv-tw-card-body">${table(['ساعت', 'شماره صف', 'بیمار', 'پزشک', 'وضعیت', 'پرداخت'], todays.slice().sort((a,b) => timeOnly(a.time).localeCompare(timeOnly(b.time))).map(item => `<tr><td><strong>${toFa(timeOnly(item.time))}</strong></td><td>${item.queue_number ? toFa(item.queue_number) : '-'}</td><td>${esc(item.patient)}<br><small>${toFa(item.phone)}</small></td><td>${esc(item.doctor)}</td><td>${badge(item.status)}</td><td>${badge(item.payment_status, true)}</td></tr>`), 'برای امروز نوبتی ثبت نشده است.')}</div></article>
        <aside class="tw-space-y-6"><article class="nv-tw-card"><header class="nv-tw-card-header"><div><h2 class="tw-text-lg tw-font-black tw-text-clinic-ink">دسترسی سریع</h2></div></header><div class="nv-tw-card-body tw-space-y-3">
          <a class="nv-tw-quick-link" href="appointments.html#new"><span>ثبت نوبت جدید</span><i class="icon-chevron-left" aria-hidden="true"></i></a>
          <a class="nv-tw-quick-link" href="queue.html"><span>صف پذیرش امروز</span><i class="icon-chevron-left" aria-hidden="true"></i></a>
          <a class="nv-tw-quick-link" href="patients.html#new"><span>ثبت بیمار جدید</span><i class="icon-chevron-left" aria-hidden="true"></i></a>
          <a class="nv-tw-quick-link" href="payments.html#new"><span>ثبت درخواست پرداخت</span><i class="icon-chevron-left" aria-hidden="true"></i></a>
        </div></article></aside>
      </div>
    </div>`;
  }

  function openAppointmentModal() {
    const modal = qs('#appointmentFormModal');
    if (!modal) return;
    modal._returnFocus = document.activeElement;
    modal.hidden = false;
    modal.classList.add('show');
    document.body.classList.add('nv-modal-open');
    window.setTimeout(() => qs('input, select, textarea, button, [tabindex="0"]', modal)?.focus(), 20);
  }

  function closeAppointmentModal() {
    const modal = qs('#appointmentFormModal');
    if (!modal) return;
    modal.classList.remove('show');
    modal.hidden = true;
    document.body.classList.remove('nv-modal-open');
    modal._returnFocus?.focus?.();
  }

  function appointmentRows(items) {
    return items.map(item => `<tr>
      <td>${jalali(item.date)}<br><small>ساعت ${toFa(timeOnly(item.time))}</small></td>
      <td>${esc(item.patient)}<br><small>${toFa(item.phone)}</small></td>
      <td>${esc(item.doctor)}<br><small>${esc(item.service)}</small></td>
      <td>${item.queue_number ? toFa(item.queue_number) : '-'}</td>
      <td>${badge(item.status)}</td>
      <td>${badge(item.payment_status, true)}<br><small>${money(item.amount)}</small></td>
      <td>${appointmentActions(item)}</td>
    </tr>`);
  }

  async function renderAppointments(root) {
    root.innerHTML = '<div class="nv-empty">در حال بارگذاری نوبت‌ها...</div>';
    const items = await loadAppointments();
    root.innerHTML = `<div class="nv-card"><div class="nv-card-header"><div><h2>مدیریت نوبت‌ها</h2><p class="nv-card-subtitle">تأیید، پیگیری و مشاهده وضعیت مستقل پرداخت</p></div><div class="nv-quick-actions"><button class="nv-btn" id="openAppointmentModal" type="button">ثبت نوبت جدید</button><button class="nv-btn secondary" id="refreshAppointments" type="button">به‌روزرسانی</button></div></div>
      <div class="nv-card-body"><div class="nv-filter-grid"><label><span>جست‌وجو</span><input id="appointmentSearch" type="search" placeholder="نام بیمار، پزشک، خدمت یا تلفن"></label><label><span>وضعیت</span><select id="appointmentStatusFilter"><option value="all">همه وضعیت‌ها</option><option value="pending">در انتظار</option><option value="confirmed">تأیید شده</option><option value="completed">انجام شده</option><option value="no_show">عدم مراجعه</option><option value="cancelled">لغو شده</option></select></label><label><span>زمان</span><select id="appointmentDateFilter"><option value="all">همه تاریخ‌ها</option><option value="today">امروز</option><option value="future">آینده</option><option value="past">گذشته</option></select></label></div><div id="appointmentsTable">${table(['تاریخ', 'بیمار', 'پزشک و خدمت', 'شماره صف', 'وضعیت', 'پرداخت', 'عملیات'], appointmentRows(items), 'نوبتی برای نمایش وجود ندارد.')}</div></div></div>
      <div class="nv-modal" id="appointmentFormModal" role="dialog" aria-modal="true" aria-labelledby="appointmentFormModalTitle" hidden><div class="nv-modal-dialog"><header class="nv-modal-header"><h2 id="appointmentFormModalTitle">ثبت نوبت جدید</h2><button class="nv-modal-close" type="button" id="closeAppointmentModal" aria-label="بستن">×</button></header><div class="nv-modal-body"><form id="appointmentForm"><div class="nv-empty">در حال آماده‌سازی فرم نوبت‌دهی...</div></form></div><footer class="nv-modal-footer"><button class="nv-btn secondary" type="button" id="cancelAppointmentModal">انصراف</button><button class="nv-btn" type="button" id="submitAppointmentBtn"><span id="formSubmitText">ثبت نوبت</span></button></footer></div></div>`;

    window.openAddModal = openAppointmentModal;
    window.closeModal = closeAppointmentModal;
    qs('#closeAppointmentModal')?.addEventListener('click', closeAppointmentModal);
    qs('#cancelAppointmentModal')?.addEventListener('click', closeAppointmentModal);
    qs('#appointmentFormModal')?.addEventListener('click', event => { if (event.target.id === 'appointmentFormModal') closeAppointmentModal(); });
    qs('#appointmentFormModal')?.addEventListener('keydown', event => { if (event.key === 'Escape') closeAppointmentModal(); });
    qs('#submitAppointmentBtn')?.addEventListener('click', () => window.submitAppointmentForm?.());
    qs('#refreshAppointments')?.addEventListener('click', () => void refreshCurrentPage());

    const applyFilters = () => {
      const query = String(qs('#appointmentSearch')?.value || '').trim().toLowerCase();
      const status = qs('#appointmentStatusFilter')?.value || 'all';
      const dateFilter = qs('#appointmentDateFilter')?.value || 'all';
      const today = todayISO();
      const filtered = items.filter(item => {
        const haystack = [item.patient, item.phone, item.doctor, item.service, item.center, item.tracking_code].join(' ').toLowerCase();
        const date = dateOnly(item.date);
        const dateMatch = dateFilter === 'all' || (dateFilter === 'today' && date === today) || (dateFilter === 'future' && date > today) || (dateFilter === 'past' && date < today);
        return (!query || haystack.includes(query)) && (status === 'all' || item.status === status) && dateMatch;
      });
      const host = qs('#appointmentsTable');
      if (host) {
        host.innerHTML = table(['تاریخ', 'بیمار', 'پزشک و خدمت', 'شماره صف', 'وضعیت', 'پرداخت', 'عملیات'], appointmentRows(filtered), 'نتیجه‌ای مطابق فیلترها پیدا نشد.');
        bindAppointmentActions(host);
      }
    };
    ['#appointmentSearch', '#appointmentStatusFilter', '#appointmentDateFilter'].forEach(selector => qs(selector)?.addEventListener(selector === '#appointmentSearch' ? 'input' : 'change', applyFilters));
    bindAppointmentActions(root);

    if (typeof window.SadraInitAppointmentWizard === 'function') await window.SadraInitAppointmentWizard();
    const preselectedPatientId = new URLSearchParams(window.location.search).get('patient_id');
    qs('#openAppointmentModal')?.addEventListener('click', () => {
      if (typeof window.openAddModal === 'function') window.openAddModal();
      else openAppointmentModal();
      if (preselectedPatientId && typeof window.SadraAppointmentWizard?.selectPatient === 'function') {
        window.setTimeout(() => window.SadraAppointmentWizard.selectPatient(preselectedPatientId, true), 0);
      }
    });
    if (location.hash === '#new') window.setTimeout(() => qs('#openAppointmentModal')?.click(), 250);
  }

  async function renderQueue(root) {
    root.innerHTML = '<div class="nv-empty">در حال بارگذاری صف پذیرش...</div>';
    const today = todayISO();
    const items = (await loadAppointments())
      .filter(item => dateOnly(item.date) === today && ['pending', 'confirmed', 'rescheduled'].includes(item.status))
      .sort((a, b) => (Number(a.queue_number || 9999) - Number(b.queue_number || 9999)) || timeOnly(a.time).localeCompare(timeOnly(b.time)));
    const confirmed = items.filter(item => item.status === 'confirmed').length;
    const pending = items.filter(item => item.status !== 'confirmed').length;
    root.innerHTML = `<div class="tw-space-y-5"><div class="tw-grid tw-grid-cols-1 tw-gap-4 sm:tw-grid-cols-2 xl:tw-grid-cols-4">${statCard('صف فعال', items.length, 'icon-list')}${statCard('تأییدشده', confirmed, 'icon-check')}${statCard('در انتظار تأیید', pending, 'icon-clock-o')}${statCard('تاریخ امروز', jalali(today), 'icon-calendar')}</div>
      <div class="nv-card"><div class="nv-card-header"><div><h2>صف پذیرش امروز</h2><p class="nv-card-subtitle">شماره صف فقط پس از تأیید نوبت تخصیص می‌یابد.</p></div><div class="nv-quick-actions"><a class="nv-btn" href="appointments.html#new">ثبت نوبت جدید</a><button class="nv-btn secondary" id="refreshQueue" type="button">به‌روزرسانی</button></div></div><div class="nv-card-body"><div class="nv-queue-list">${items.length ? items.map(item => `<article class="nv-reception-card"><div class="nv-queue-number"><span>شماره صف</span><strong>${item.queue_number ? toFa(item.queue_number) : '—'}</strong></div><div class="nv-queue-main"><h3>${esc(item.patient)}</h3><p>${toFa(timeOnly(item.time))} · ${esc(item.doctor)} · ${esc(item.service)}</p><small>${toFa(item.phone)} · ${esc(item.center)}</small></div><div class="nv-queue-status">${badge(item.status)}${badge(item.payment_status, true)}</div>${appointmentActions(item, true)}</article>`).join('') : '<div class="nv-empty">صف فعال امروز خالی است.</div>'}</div></div></div></div>`;
    qs('#refreshQueue')?.addEventListener('click', () => void refreshCurrentPage());
    bindAppointmentActions(root);
  }

  function patientRows(items) {
    return items.map(item => `<tr><td><strong>${esc(item.name)}</strong><br><small>${toFa(item.phone)}</small></td><td>${item.national_code ? toFa(item.national_code) : '-'}</td><td>${item.email ? esc(item.email) : '-'}</td><td>${toFa(item.appointment_count)}</td><td>${item.created_at ? jalali(item.created_at) : '-'}</td><td><div class="nv-inline-actions"><button class="nv-btn secondary" type="button" data-patient-edit="${item.id}">ویرایش</button><a class="nv-btn" href="appointments.html?patient_id=${item.id}#new" data-patient-book="${item.id}">ثبت نوبت</a></div></td></tr>`);
  }

  function patientForm(patient = null) {
    const editing = Boolean(patient);
    const birthDate = patient?.birth_date
      ? (window.toJalaliDateString?.(dateOnly(patient.birth_date)) || dateOnly(patient.birth_date))
      : '';
    return `<form id="nvPatientForm" class="nv-form" novalidate>
      <input type="hidden" name="id" value="${patient?.id || ''}">
      <label class="nv-form-field"><span>نام و نام خانوادگی *</span><input name="full_name" required maxlength="150" value="${esc(patient?.name || '')}" autocomplete="name"></label>
      <label class="nv-form-field"><span>شماره موبایل *</span><input name="phone" required inputmode="tel" maxlength="20" value="${esc(patient?.phone === '-' ? '' : patient?.phone || '')}" autocomplete="tel" placeholder="۰۹۱۲۱۲۳۴۵۶۷"></label>
      <label class="nv-form-field"><span>کد ملی</span><input name="national_code" inputmode="numeric" maxlength="10" value="${esc(patient?.national_code || '')}"></label>
      <label class="nv-form-field"><span>ایمیل</span><input name="email" type="email" maxlength="190" value="${esc(patient?.email || '')}" autocomplete="email"></label>
      ${editing ? `<label class="nv-form-field"><span>تاریخ تولد</span><input name="birth_date" type="text" class="nv-jalali-date" inputmode="numeric" autocomplete="off" data-date-mode="birth" placeholder="۱۴۰۰/۰۱/۰۱" value="${esc(birthDate)}"></label><label class="nv-form-field"><span>جنسیت</span><select name="gender"><option value="">انتخاب نشده</option><option value="male" ${patient?.gender === 'male' ? 'selected' : ''}>مرد</option><option value="female" ${patient?.gender === 'female' ? 'selected' : ''}>زن</option></select></label><label class="nv-form-field full"><span>نشانی</span><textarea name="address" rows="3" maxlength="1000">${esc(patient?.address || '')}</textarea></label>` : `<label class="nv-form-field"><span>نام کاربری</span><input name="username" maxlength="100" value="${esc(patient?.phone === '-' ? '' : patient?.phone || '')}" placeholder="در صورت خالی بودن، موبایل استفاده می‌شود"></label><label class="nv-form-field"><span>رمز موقت ورود *</span><input name="password" type="password" required minlength="8" autocomplete="new-password" placeholder="حداقل ۸ نویسه"></label>`}
      <div class="nv-form-note full">اطلاعات حساس فقط در سرور ذخیره می‌شود و در LocalStorage قرار نمی‌گیرد.</div>
    </form>`;
  }

  function openPatientEditor(patient = null) {
    qs('#nvPatientModal')?.remove();
    document.body.insertAdjacentHTML('beforeend', modalShell('nvPatientModal', patient ? 'ویرایش اطلاعات بیمار' : 'ثبت بیمار جدید', patientForm(patient), '<button class="nv-btn secondary" type="button" data-modal-close>انصراف</button><button class="nv-btn" type="button" id="savePatient">ذخیره</button>'));
    const modal = qs('#nvPatientModal');
    bindModal(modal);
    qs('#savePatient', modal)?.addEventListener('click', event => void savePatient(patient, event.currentTarget, modal));
    openModal(modal);
  }

  async function savePatient(patient, button, modal) {
    const form = qs('#nvPatientForm', modal);
    if (!form?.reportValidity()) return;
    const values = Object.fromEntries(new FormData(form).entries());
    values.phone = cleanPhone(values.phone);
    values.national_code = toEn(values.national_code).replace(/\D/g, '');
    values.username = String(values.username || values.phone).trim();
    if (patient && values.birth_date) {
      const birthDate = window.toGregorianDateString?.(values.birth_date) || values.birth_date;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return showMessage('تاریخ تولد معتبر نیست.', 'error');
      values.birth_date = birthDate;
    }
    if (!/^09\d{9}$/.test(values.phone)) return showMessage('شماره موبایل معتبر نیست.', 'error');
    if (values.national_code && !/^\d{10}$/.test(values.national_code)) return showMessage('کد ملی باید ۱۰ رقم باشد.', 'error');
    setBusy(button, true, 'در حال ذخیره...');
    try {
      const result = await api(patient ? `/api/clinic/patients/${patient.id}` : '/api/clinic/patients', {
        method: patient ? 'PUT' : 'POST', body: JSON.stringify(values)
      });
      closeModal(modal);
      await refreshCurrentPage(result.message || 'اطلاعات بیمار ذخیره شد.');
    } catch (error) {
      showMessage(error.message || 'ذخیره بیمار انجام نشد.', 'error');
      setBusy(button, false);
    }
  }

  async function renderPatients(root) {
    root.innerHTML = '<div class="nv-empty">در حال بارگذاری بیماران...</div>';
    const items = await loadPatients();
    root.innerHTML = `<div class="nv-card"><div class="nv-card-header"><div><h2>بیماران</h2><p class="nv-card-subtitle">ثبت و ویرایش اطلاعات تماس و هویتی بیمار</p></div><div class="nv-quick-actions"><button class="nv-btn" id="newPatient" type="button">ثبت بیمار جدید</button><button class="nv-btn secondary" id="refreshPatients" type="button">به‌روزرسانی</button></div></div><div class="nv-card-body"><div class="nv-searchbar"><label><span class="nv-sr-only">جست‌وجوی بیمار</span><input id="patientSearch" type="search" placeholder="نام، موبایل، کد ملی یا ایمیل"></label><button class="nv-btn secondary" id="clearPatientSearch" type="button">پاک کردن</button></div><div id="patientsTable">${table(['بیمار', 'کد ملی', 'ایمیل', 'تعداد نوبت', 'تاریخ ثبت', 'عملیات'], patientRows(items), 'بیماری ثبت نشده است.')}</div></div></div>`;
    const bindRows = host => qsa('[data-patient-edit]', host).forEach(button => button.addEventListener('click', () => openPatientEditor(items.find(item => item.id === Number(button.dataset.patientEdit)))));
    bindRows(root);
    const apply = () => {
      const query = String(qs('#patientSearch')?.value || '').trim().toLowerCase();
      const filtered = !query ? items : items.filter(item => [item.name, item.phone, item.national_code, item.email].join(' ').toLowerCase().includes(query));
      const host = qs('#patientsTable');
      host.innerHTML = table(['بیمار', 'کد ملی', 'ایمیل', 'تعداد نوبت', 'تاریخ ثبت', 'عملیات'], patientRows(filtered), 'بیماری مطابق جست‌وجو پیدا نشد.');
      bindRows(host);
    };
    qs('#patientSearch')?.addEventListener('input', apply);
    qs('#clearPatientSearch')?.addEventListener('click', () => { qs('#patientSearch').value = ''; apply(); });
    qs('#newPatient')?.addEventListener('click', () => openPatientEditor());
    qs('#refreshPatients')?.addEventListener('click', () => void refreshCurrentPage());
    if (location.hash === '#new') window.setTimeout(() => qs('#newPatient')?.click(), 100);
  }

  function paymentRows(items) {
    return items.map(item => `<tr><td><strong>${esc(item.patient)}</strong><br><small>${esc(item.doctor || item.service || '')}</small></td><td>${money(item.amount)}</td><td>${esc(paymentMethodLabel(item.method))}</td><td>${badge(item.status, true)}</td><td>${item.date ? jalali(item.date, true) : '-'}</td><td><button class="nv-btn secondary" type="button" data-payment-detail="${item.id}">جزئیات</button></td></tr>`);
  }

  function showPaymentDetails(payment) {
    qs('#nvPaymentDetailModal')?.remove();
    const body = `<div class="nv-detail-grid"><div><span>بیمار</span><strong>${esc(payment.patient)}</strong></div><div><span>مبلغ</span><strong>${money(payment.amount)}</strong></div><div><span>روش پرداخت</span><strong>${esc(paymentMethodLabel(payment.method))}</strong></div><div><span>وضعیت</span>${badge(payment.status, true)}</div><div><span>زمان ثبت</span><strong>${payment.date ? jalali(payment.date, true) : '-'}</strong></div><div><span>شماره رسید</span><strong>${esc(payment.receipt || 'ثبت نشده')}</strong></div><div class="is-full"><span>توضیحات</span><p>${esc(payment.description || 'توضیحی ثبت نشده است.')}</p></div></div>`;
    document.body.insertAdjacentHTML('beforeend', modalShell('nvPaymentDetailModal', 'جزئیات پرداخت', body, '<button class="nv-btn secondary" type="button" data-modal-close>بستن</button>'));
    const modal = qs('#nvPaymentDetailModal'); bindModal(modal); openModal(modal);
  }

  function openPaymentRequest(appointments) {
    const eligible = appointments.filter(item => item.amount > 0 && !['paid', 'free', 'pending'].includes(item.payment_status) && !['cancelled', 'no_show'].includes(item.status));
    qs('#nvPaymentModal')?.remove();
    const options = eligible.map(item => `<option value="${item.id}">${esc(item.patient)} — ${jalali(item.date)} ساعت ${toFa(timeOnly(item.time))} — ${money(item.amount)}</option>`).join('');
    const body = eligible.length ? `<form id="nvPaymentForm" class="nv-form" novalidate><label class="nv-form-field full"><span>نوبت *</span><select name="appointment_id" required><option value="">انتخاب نوبت</option>${options}</select></label><label class="nv-form-field"><span>روش پرداخت *</span><select name="payment_method" required><option value="cash">نقدی</option><option value="pos">کارت‌خوان</option><option value="bank_transfer">واریز بانکی</option><option value="card_to_card">کارت‌به‌کارت</option></select></label><label class="nv-form-field full"><span>توضیحات</span><textarea name="description" rows="3" maxlength="1000" placeholder="مثلاً شماره پیگیری یا توضیح دریافت وجه"></textarea></label><div class="nv-form-note full">این عملیات فقط یک درخواست پرداخت «در انتظار بررسی» ثبت می‌کند؛ تسویه قطعی باید توسط مدیر مجاز تأیید شود.</div></form>` : '<div class="nv-empty">نوبت فعال و پرداخت‌نشده‌ای برای ثبت درخواست وجود ندارد.</div>';
    const footer = '<button class="nv-btn secondary" type="button" data-modal-close>انصراف</button>' + (eligible.length ? '<button class="nv-btn" type="button" id="savePaymentRequest">ثبت درخواست</button>' : '');
    document.body.insertAdjacentHTML('beforeend', modalShell('nvPaymentModal', 'ثبت درخواست پرداخت دستی', body, footer));
    const modal = qs('#nvPaymentModal'); bindModal(modal);
    qs('#savePaymentRequest', modal)?.addEventListener('click', event => void savePaymentRequest(event.currentTarget, modal));
    openModal(modal);
  }

  async function savePaymentRequest(button, modal) {
    const form = qs('#nvPaymentForm', modal);
    if (!form?.reportValidity()) return;
    const values = Object.fromEntries(new FormData(form).entries());
    setBusy(button, true, 'در حال ثبت...');
    try {
      const result = await api('/api/clinic/payments', { method: 'POST', body: JSON.stringify(values) });
      closeModal(modal);
      await refreshCurrentPage(result.message || 'درخواست پرداخت ثبت شد.');
    } catch (error) {
      showMessage(error.message || 'ثبت درخواست پرداخت انجام نشد.', 'error');
      setBusy(button, false);
    }
  }

  async function renderPayments(root) {
    root.innerHTML = '<div class="nv-empty">در حال بارگذاری پرداخت‌ها...</div>';
    const [items, appointments] = await Promise.all([loadPayments(), loadAppointments()]);
    const paid = items.filter(item => item.status === 'completed');
    const pending = items.filter(item => item.status === 'pending');
    const paidAmount = paid.reduce((sum, item) => sum + item.amount, 0);
    const pendingAmount = pending.reduce((sum, item) => sum + item.amount, 0);
    root.innerHTML = `<div class="tw-space-y-5"><div class="tw-grid tw-grid-cols-1 tw-gap-4 sm:tw-grid-cols-2 xl:tw-grid-cols-4">${statCard('پرداخت قطعی', paid.length, 'icon-check')}${statCard('در انتظار بررسی', pending.length, 'icon-clock-o')}${statCard('مبلغ قطعی', money(paidAmount), 'icon-credit-card')}${statCard('مبلغ در انتظار', money(pendingAmount), 'icon-warning')}</div><div class="nv-card"><div class="nv-card-header"><div><h2>پرداخت‌ها</h2><p class="nv-card-subtitle">وضعیت پرداخت مستقل از وضعیت مراجعه نگهداری می‌شود.</p></div><div class="nv-quick-actions"><button class="nv-btn" id="newPaymentRequest" type="button">ثبت درخواست پرداخت</button><button class="nv-btn secondary" id="refreshPayments" type="button">به‌روزرسانی</button></div></div><div class="nv-card-body"><div class="nv-filter-grid"><label><span>جست‌وجو</span><input id="paymentSearch" type="search" placeholder="نام بیمار، پزشک یا رسید"></label><label><span>وضعیت</span><select id="paymentStatusFilter"><option value="all">همه وضعیت‌ها</option><option value="pending">در انتظار بررسی</option><option value="completed">قطعی</option><option value="failed">ناموفق</option><option value="refunded">بازپرداخت</option></select></label></div><div id="paymentsTable">${table(['بیمار', 'مبلغ', 'روش', 'وضعیت', 'زمان', 'عملیات'], paymentRows(items), 'پرداختی ثبت نشده است.')}</div></div></div></div>`;
    const bindRows = host => qsa('[data-payment-detail]', host).forEach(button => button.addEventListener('click', () => showPaymentDetails(items.find(item => item.id === Number(button.dataset.paymentDetail)))));
    bindRows(root);
    const apply = () => {
      const query = String(qs('#paymentSearch')?.value || '').trim().toLowerCase();
      const status = qs('#paymentStatusFilter')?.value || 'all';
      const filtered = items.filter(item => (!query || [item.patient, item.doctor, item.service, item.receipt].join(' ').toLowerCase().includes(query)) && (status === 'all' || item.status === status));
      const host = qs('#paymentsTable');
      host.innerHTML = table(['بیمار', 'مبلغ', 'روش', 'وضعیت', 'زمان', 'عملیات'], paymentRows(filtered), 'پرداختی مطابق فیلترها پیدا نشد.');
      bindRows(host);
    };
    qs('#paymentSearch')?.addEventListener('input', apply);
    qs('#paymentStatusFilter')?.addEventListener('change', apply);
    qs('#newPaymentRequest')?.addEventListener('click', () => openPaymentRequest(appointments));
    qs('#refreshPayments')?.addEventListener('click', () => void refreshCurrentPage());
    if (location.hash === '#new') window.setTimeout(() => qs('#newPaymentRequest')?.click(), 100);
  }

  async function renderNotifications(root) {
    root.innerHTML = '<div class="nv-empty">در حال بارگذاری اعلان‌ها...</div>';
    const data = await api('/api/notifications?limit=100');
    const items = arrayFrom(data, ['notifications', 'items', 'data']);
    root.innerHTML = `<div class="nv-card"><div class="nv-card-header"><div><h2>اعلان‌ها</h2><p class="nv-card-subtitle">پیام‌های مرتبط با فعالیت‌های کلینیک</p></div><span class="nv-badge warning">${toFa(items.filter(item => !item.is_read).length)} خوانده‌نشده</span></div><div class="nv-card-body"><div class="nv-notification-list">${items.length ? items.map(item => `<article class="nv-reception-card ${item.is_read ? '' : 'is-unread'}"><div><h3>${esc(item.title || 'اعلان کلینیک')}</h3><p>${esc(item.message || item.body || '')}</p><small>${item.created_at ? jalali(item.created_at, true) : ''}</small></div>${item.is_read ? badge('completed') : `<button class="nv-btn secondary" type="button" data-mark-read="${esc(item.id)}">خواندم</button>`}</article>`).join('') : '<div class="nv-empty">اعلان جدیدی وجود ندارد.</div>'}</div></div></div>`;
    qsa('[data-mark-read]', root).forEach(button => button.addEventListener('click', async () => {
      setBusy(button, true);
      try { await api(`/api/notifications/${encodeURIComponent(button.dataset.markRead)}/read`, { method: 'POST', body: '{}' }); await renderNotifications(root); }
      catch (error) { showMessage(error.message || 'ثبت وضعیت اعلان انجام نشد.', 'error'); setBusy(button, false); }
    }));
  }

  async function renderPage() {
    const root = qs('#secretaryPageContent');
    if (!root) return;
    state.page = document.body.dataset.secretaryPage || 'index';
    try {
      if (state.page === 'index') await renderDashboard(root);
      else if (state.page === 'appointments') await renderAppointments(root);
      else if (state.page === 'queue') await renderQueue(root);
      else if (state.page === 'patients') await renderPatients(root);
      else if (state.page === 'payments') await renderPayments(root);
      else if (state.page === 'notifications') await renderNotifications(root);
    } catch (error) {
      root.innerHTML = `<div class="nv-empty nv-error-state"><strong>بارگذاری این بخش انجام نشد.</strong><span>${esc(error.message || 'خطای نامشخص')}</span><button class="nv-btn secondary" type="button" id="retrySecretaryPage">تلاش دوباره</button></div>`;
      qs('#retrySecretaryPage')?.addEventListener('click', () => void refreshCurrentPage());
    }
  }

  async function init() {
    try {
      if (!await bootstrapSession()) return;
      await renderPage();
      window.loadAppointments = () => refreshCurrentPage();
    } catch (error) {
      const root = qs('#secretaryPageContent');
      if (root) root.innerHTML = `<div class="nv-empty nv-error-state">${esc(error.message || 'بررسی نشست کاربری انجام نشد.')}</div>`;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else void init();
})();

/* NOORVISTA unified pretty selects loader */
(function () {
  if (!/\/dashboard\//i.test(location.pathname)) return;
  if (!document.querySelector('link[href="/assets/css/panel-pretty-selects-global.css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/assets/css/panel-pretty-selects-global.css';
    document.head.appendChild(link);
  }
  if (!window.__NOORVISTA_PRETTY_SELECT_LOADER_SCRIPT__ && !document.querySelector('script[src="/assets/js/panel-pretty-selects-global.js"]')) {
    window.__NOORVISTA_PRETTY_SELECT_LOADER_SCRIPT__ = true;
    const script = document.createElement('script');
    script.src = '/assets/js/panel-pretty-selects-global.js';
    script.defer = true;
    document.head.appendChild(script);
  }
})();
