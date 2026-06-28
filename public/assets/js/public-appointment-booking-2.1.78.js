(function () {
  'use strict';

  if (window.__NOORVISTA_PUBLIC_APPOINTMENT_2178__) return;
  window.__NOORVISTA_PUBLIC_APPOINTMENT_2178__ = true;

  function isPatientPanelBooking() {
    const body = document.body;
    const path = String(window.location.pathname || '').replace(/\/+/g, '/');
    return !!(
      body?.dataset?.panelRole === 'patient'
      || body?.dataset?.patientPage
      || body?.classList?.contains('nv3-role-patient')
      || path.includes('/dashboard/panel/patient/')
      || path.includes('/pages/dashboard/patient/')
    );
  }

  function applyPatientPanelIdentityMode() {
    if (!isPatientPanelBooking()) return;
    const modal = ensureModal();
    modal.classList.add('is-patient-panel-booking');
    ['nvBookingFirstName', 'nvBookingLastName', 'nvBookingPhone'].forEach(id => {
      const input = $('#' + id, modal);
      if (!input) return;
      input.required = false;
      input.disabled = true;
      input.value = '';
      const field = input.closest('.nv-booking-field');
      if (field) {
        field.hidden = true;
        field.classList.add('nv-patient-identity-hidden');
        field.style.display = 'none';
      }
    });
    const progressLabel = $('[data-nv-progress="6"] span:last-child', modal);
    if (progressLabel) progressLabel.textContent = 'بیمه';
    const heading = $('[data-nv-booking-step="6"] .nv-booking-step__head h3', modal);
    const desc = $('[data-nv-booking-step="6"] .nv-booking-step__head p', modal);
    const phoneField = $('.nv-booking-phone-field', modal);
    if (phoneField) phoneField.hidden = true;
    if (heading) heading.textContent = 'بیمه تکمیلی';
    if (desc) desc.textContent = hasInsurancePolicy(state.service) ? 'در صورت داشتن بیمه تکمیلی، اطلاعات آن را وارد کنید.' : 'این مرحله برای شما به‌صورت خودکار رد می‌شود.';
  }

  const state = {
    services: [],
    slots: [],
    service: null,
    doctor: null,
    center: null,
    selectedMonth: '',
    selectedDate: '',
    slot: null,
    step: 1,
    trigger: null,
    loading: false
  };

  const faDigits = '۰۱۲۳۴۵۶۷۸۹';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const toFa = (value) => String(value ?? '').replace(/\d/g, (digit) => faDigits[Number(digit)]);
  const toEn = (value) => String(value ?? '')
    .replace(/[۰-۹]/g, (digit) => String(faDigits.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[character]);
  }

  function isoDate(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function addDays(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return isoDate(date);
  }

  function dateObject(iso) {
    return new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  }

  function formatDate(iso, options = {}) {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
        weekday: options.weekday === false ? undefined : 'long',
        day: 'numeric',
        month: 'long',
        year: options.year ? 'numeric' : undefined
      }).format(dateObject(iso));
    } catch (_) {
      return toFa(String(iso).slice(0, 10).replace(/-/g, '/'));
    }
  }

  function monthLabel(iso) {
    try {
      const parts = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { month: 'long', year: 'numeric' }).formatToParts(dateObject(iso));
      const month = parts.find(p => p.type === 'month')?.value || '';
      const year = parts.find(p => p.type === 'year')?.value || '';
      return `${month} ${year}`.trim();
    } catch (_) {
      const text = formatDate(iso, { weekday: false, year: true });
      const match = text.match(/^(\S+)\s+(.+)$/);
      return match ? `${match[2]} ${match[1]}` : text;
    }
  }

  function shortDay(iso) {
    try {
      const parts = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'short', day: 'numeric' }).formatToParts(dateObject(iso));
      const weekday = parts.find((part) => part.type === 'weekday')?.value || '';
      const day = parts.find((part) => part.type === 'day')?.value || '';
      return { weekday, day };
    } catch (_) {
      return { weekday: '', day: toFa(String(iso).slice(-2)) };
    }
  }

  function formatMoney(value) {
    const amount = Number(value || 0);
    return amount > 0 ? `${amount.toLocaleString('fa-IR')} تومان` : 'رایگان';
  }

  function formatTime(value) {
    return toFa(String(value || '').slice(0, 5));
  }

  function normalizePhone(value) {
    let phone = toEn(value).replace(/[^0-9+]/g, '');
    if (phone.startsWith('0098')) phone = `0${phone.slice(4)}`;
    else if (phone.startsWith('+98')) phone = `0${phone.slice(3)}`;
    else if (phone.startsWith('98') && phone.length === 12) phone = `0${phone.slice(2)}`;
    return phone;
  }


  function cookie(name) {
    const prefix = `${encodeURIComponent(name)}=`;
    const item = document.cookie.split('; ').find((part) => part.startsWith(prefix));
    return item ? decodeURIComponent(item.slice(prefix.length)) : '';
  }

  async function csrfToken() {
    const existing = cookie('csrf_token');
    if (existing) return existing;
    const response = await fetch('/api/auth/csrf-token', {
      method: 'GET', credentials: 'same-origin', headers: { Accept: 'application/json' }
    });
    const data = await response.json().catch(() => ({}));
    return data.csrf_token || cookie('csrf_token') || '';
  }

  async function api(url, options = {}) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), Number(options.timeout || 15000));
    try {
      const method = String(options.method || 'GET').toUpperCase();
      const headers = {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      };
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        const token = await csrfToken();
        if (token) headers['X-CSRF-Token'] = token;
      }
      const response = await fetch(url, {
        method,
        credentials: 'same-origin',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) {
        const error = new Error(data.message || 'ارتباط با سامانه نوبت‌دهی برقرار نشد');
        error.status = response.status;
        error.code = data.code || '';
        throw error;
      }
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('پاسخ سامانه نوبت‌دهی طول کشید؛ دوباره تلاش کنید');
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
  }

  function removeLegacyBooking() {
    document.querySelectorAll('#bookingModal, #bookingV2Modal, #publicBookingV2Style').forEach((node) => node.remove());
  }

  function modalMarkup() {
    return `
      <div class="nv-public-booking__backdrop" data-nv-booking-close></div>
      <section class="nv-public-booking__panel" role="dialog" aria-modal="true" aria-labelledby="nvPublicBookingTitle">
        <header class="nv-public-booking__header">
          <div>
            <span class="nv-public-booking__eyebrow">دریافت آنلاین کلینیک</span>
            <h2 id="nvPublicBookingTitle">نوبت مناسب را در چند مرحله ساده انتخاب کنید</h2>
            <p class="nv-booking-header-note" hidden></p>
          </div>
          <button class="nv-public-booking__close" type="button" data-nv-booking-close aria-label="بستن">×</button>
        </header>
        <nav class="nv-public-booking__progress" aria-label="مراحل دریافت">
          ${['خدمت', 'پزشک', 'مرکز', 'روز', 'ساعت', 'موبایل و بیمه', 'تأیید نهایی'].map((label, index) => `<div class="nv-public-booking__progress-item" data-nv-progress="${index + 1}"><span>${toFa(index + 1)}</span><span>${label}</span></div>`).join('')}
        </nav>
        <div class="nv-booking-selection-summary" data-nv-booking-summary hidden></div>
        <div class="nv-public-booking__body">
          <section class="nv-booking-step" data-nv-booking-step="1">
            <div class="nv-booking-step__head"><div><h3>خدمت موردنظر را انتخاب کنید</h3><p>فقط خدماتی نمایش داده می‌شوند که در ماه‌های آینده نوبت خالی دارند.</p></div></div>
            <div data-nv-booking-services class="nv-booking-loading"><div><div class="nv-booking-spinner"></div><span>در حال دریافت خدمات دارای نوبت...</span></div></div>
          </section>
          <section class="nv-booking-step" data-nv-booking-step="2" hidden>
            <div class="nv-booking-step__head"><div><h3>پزشک را انتخاب کنید</h3><p data-nv-selected-service>—</p></div><button class="nv-booking-back" type="button" data-nv-booking-back="1">بازگشت</button></div>
            <div data-nv-booking-doctors></div>
          </section>
          <section class="nv-booking-step" data-nv-booking-step="3" hidden>
            <div class="nv-booking-step__head"><div><h3>مرکز درمانی را انتخاب کنید</h3><p>این خدمت در چند مرکز ارائه می‌شود؛ ابتدا محل مراجعه را مشخص کنید.</p></div><button class="nv-booking-back" type="button" data-nv-booking-back="2">بازگشت</button></div>
            <div data-nv-booking-centers></div>
          </section>
          <section class="nv-booking-step" data-nv-booking-step="4" hidden>
            <div class="nv-booking-step__head"><div><h3>روز مراجعه را انتخاب کنید</h3><p>ماه‌های دارای نوبت و سپس روز مناسب را انتخاب کنید.</p></div><button class="nv-booking-back" type="button" data-nv-booking-back="3">بازگشت</button></div>
            <div class="nv-booking-months" data-nv-booking-months></div>
            <div class="nv-booking-days" data-nv-booking-days></div>
          </section>
          <section class="nv-booking-step" data-nv-booking-step="5" hidden>
            <div class="nv-booking-step__head"><div><h3>ساعت خالی را انتخاب کنید</h3><p data-nv-selected-date>—</p></div><button class="nv-booking-back" type="button" data-nv-booking-back="4">بازگشت</button></div>
            <div class="nv-booking-times" data-nv-booking-times></div>
          </section>
          <section class="nv-booking-step" data-nv-booking-step="6" hidden>
            <div class="nv-booking-step__head"><div><h3>موبایل و بیمه</h3><p>شماره موبایل برای پیگیری نوبت لازم است. اگر این خدمت بیمه تکمیلی داشته باشد، همین‌جا نمایش داده می‌شود.</p></div><button class="nv-booking-back" type="button" data-nv-booking-back="5">بازگشت</button></div>
            <form data-nv-booking-form novalidate>
              <div class="nv-booking-form">
                <div class="nv-booking-field is-full nv-booking-phone-field"><label for="nvBookingPhone">شماره موبایل *</label><input id="nvBookingPhone" name="patient_phone" type="tel" inputmode="numeric" maxlength="14" autocomplete="tel" required dir="ltr" placeholder="۰۹۱۲۱۲۳۴۵۶۷"><small>برای پیگیری نوبت و ارسال پیامک استفاده می‌شود.</small></div>
                <input id="nvBookingFirstName" name="patient_first_name" type="hidden" value="">
                <input id="nvBookingLastName" name="patient_last_name" type="hidden" value="">
                <div class="nv-booking-field is-full nv-booking-insurance-box" hidden><label class="nv-booking-check"><input id="nvBookingHasSupplementaryInsurance" name="has_supplementary_insurance" type="checkbox" value="1"><span>بیمه تکمیلی دارم</span></label><small>این گزینه فقط برای خدمات دارای بیمه تکمیلی نمایش داده می‌شود.</small></div>
                <div class="nv-booking-field is-full nv-booking-insurance-details" data-nv-insurance-details hidden>
                  <div class="nv-booking-form">
                    <div class="nv-booking-field"><label for="nvBookingInsuranceProvider">نام بیمه تکمیلی</label><input id="nvBookingInsuranceProvider" name="insurance_provider" type="text" maxlength="120" placeholder="مثلاً بیمه دانا، دی، آسیا..."></div>
                    <div class="nv-booking-field"><label for="nvBookingInsuranceNumber">شماره بیمه/معرفی‌نامه</label><input id="nvBookingInsuranceNumber" name="insurance_number" type="text" maxlength="80" placeholder="اختیاری"></div>
                    <div class="nv-booking-field is-full"><label for="nvBookingInsuranceNote">توضیح بیمه</label><textarea id="nvBookingInsuranceNote" name="insurance_note" maxlength="1000" placeholder="اگر توضیحی درباره بیمه دارید بنویسید"></textarea></div>
                  </div>
                </div>
                <div class="nv-booking-message" data-nv-insurance-notice hidden></div>
                <input id="nvBookingReason" name="reason" type="hidden" value="">
              </div>
              <div class="nv-booking-message" data-nv-booking-message hidden></div>
              <div class="nv-booking-actions"><button class="nv-booking-btn nv-booking-btn--primary" type="submit" data-nv-booking-submit>ادامه به تأیید نهایی</button></div>
            </form>
          </section>
          <section class="nv-booking-step" data-nv-booking-step="7" hidden>
            <div class="nv-booking-step__head"><div><h3>تأیید نهایی نوبت</h3><p>مبلغ فقط در این مرحله نمایش داده می‌شود. اطلاعات را بررسی کنید و ادامه دهید.</p></div><button class="nv-booking-back" type="button" data-nv-booking-back="6">بازگشت</button></div>
            <div class="nv-booking-review nv-booking-final-amount" data-nv-booking-review></div>
            <div class="nv-booking-message" data-nv-booking-final-message hidden></div>
            <div class="nv-booking-actions nv-booking-final-actions"><button class="nv-booking-btn nv-booking-btn--primary" type="button" data-nv-booking-submit-final>ثبت و ادامه</button></div>
          </section>
          <section class="nv-booking-step" data-nv-booking-step="8" hidden>
            <div class="nv-booking-success">
              <div class="nv-booking-success__icon"></div>
              <h3>نوبت شما با موفقیت ثبت شد</h3>
              <p data-nv-booking-success-text>اطلاعات نوبت ثبت شد.</p>
              <code data-nv-booking-tracking hidden></code>
              <div class="nv-booking-actions"><button class="nv-booking-btn nv-booking-btn--primary" type="button" data-nv-booking-close>بستن</button></div>
            </div>
          </section>
        </div>
      </section>`;
  }

  function ensureModal() {
    let modal = $('#nvPublicBooking');
    if (modal) return modal;
    removeLegacyBooking();
    modal = document.createElement('div');
    modal.id = 'nvPublicBooking';
    modal.className = 'nv-public-booking';
    modal.hidden = true;
    modal.innerHTML = modalMarkup();
    document.body.appendChild(modal);
    applyPatientPanelIdentityMode();
    return modal;
  }

  function renderBookingSummary() {
    const box = $('[data-nv-booking-summary]', ensureModal());
    if (!box) return;
    const items = [];
    if (state.service) items.push(['خدمت', state.service.name]);
    if (state.doctor) items.push(['پزشک', state.doctor.name]);
    if (state.center) items.push(['مرکز', state.center.name]);
    if (state.selectedDate) items.push(['روز', formatDate(state.selectedDate, { year: true })]);
    if (state.slot) items.push(['ساعت', `${formatTime(state.slot.start_time)} تا ${formatTime(state.slot.end_time)}`]);
    box.hidden = items.length === 0;
    box.innerHTML = items.map(([label, value]) => `<span class="nv-booking-summary-chip"><em>${escapeHtml(label)}</em><strong>${escapeHtml(value || '—')}</strong></span>`).join('');
  }

  function setStep(step) {
    state.step = step;
    $$('[data-nv-booking-step]', ensureModal()).forEach((section) => {
      section.hidden = Number(section.dataset.nvBookingStep) !== step;
    });
    $$('[data-nv-progress]', ensureModal()).forEach((item) => {
      const number = Number(item.dataset.nvProgress);
      const visibleStep = Math.min(step, 7);
      item.classList.toggle('is-active', number === visibleStep);
      item.classList.toggle('is-done', number < visibleStep || step === 8);
    });
    renderBookingSummary();
    applyPatientPanelIdentityMode();
    $('.nv-public-booking__body', ensureModal()).scrollTop = 0;
    window.setTimeout(() => $('[data-nv-booking-step]:not([hidden]) button, [data-nv-booking-step]:not([hidden]) input', ensureModal())?.focus({ preventScroll: true }), 30);
  }

  function showMessage(message, type = 'info') {
    const box = $('[data-nv-booking-message]', ensureModal());
    if (!box) return;
    box.hidden = !message;
    box.className = `nv-booking-message${type === 'error' ? ' is-error' : type === 'success' ? ' is-success' : ''}`;
    box.textContent = message || '';
  }

  function resetState() {
    state.services = [];
    state.slots = [];
    state.service = null;
    state.doctor = null;
    state.center = null;
    state.selectedMonth = '';
    state.selectedDate = '';
    state.slot = null;
    state.step = 1;
    state.loading = false;
    const form = $('[data-nv-booking-form]', ensureModal());
    form?.reset();
    applyPatientPanelIdentityMode();
    showMessage('');
  }

  function currentServiceSlug() {
    const match = window.location.pathname.match(/\/services\/([^/]+?)(?:\.html)?$/i);
    return match ? decodeURIComponent(match[1]) : '';
  }

  function serviceFeeText(service) {
    const minimum = Number(service.minimum_fee || 0);
    const maximum = Number(service.maximum_fee || 0);
    if (minimum <= 0 && maximum <= 0) return 'رایگان';
    if (maximum > minimum) return `از ${formatMoney(minimum)} تا ${formatMoney(maximum)}`;
    return formatMoney(minimum || maximum);
  }


  function hasInsurancePolicy(item) {
    const value = item?.supplementary_insurance_enabled;
    if (value === true || value === 1) return true;
    if (value === false || value === 0 || value === undefined || value === null || value === '') return false;
    return ['1', 'true', 'yes', 'on', 'enabled', 'فعال'].includes(String(value).trim().toLowerCase());
  }

  function insurancePaymentMode(item) {
    return String(item?.supplementary_insurance_payment_mode || 'none').toLowerCase().replace(/[\s-]+/g, '_');
  }

  function calculatePayableAmount(amount, service, hasInsurance) {
    const original = Math.max(0, Number(amount || 0));
    if (!hasInsurance || !hasInsurancePolicy(service) || original <= 0) {
      return { original, payable: original, remaining: 0, applied: false, mode: 'standard_full_payment' };
    }
    const mode = insurancePaymentMode(service);
    let payable = original;
    if (['waive', 'zero', 'free', 'no_online_payment', 'review'].includes(mode)) payable = 0;
    else if (['fixed', 'fixed_amount', 'reduced_fixed'].includes(mode)) payable = Math.min(original, Math.max(0, Number(service.supplementary_insurance_amount || 0)));
    else if (['percent', 'percentage', 'reduced_percent'].includes(mode)) payable = Math.round(original * Math.max(0, Math.min(100, Number(service.supplementary_insurance_percent || 0))) / 100);
    return { original, payable, remaining: Math.max(0, original - payable), applied: true, mode };
  }

  function bookingInsuranceState(root = ensureModal()) {
    const has = $('#nvBookingHasSupplementaryInsurance', root)?.checked || false;
    return {
      has,
      provider: $('#nvBookingInsuranceProvider', root)?.value.trim() || '',
      number: $('#nvBookingInsuranceNumber', root)?.value.trim() || '',
      note: $('#nvBookingInsuranceNote', root)?.value.trim() || ''
    };
  }

  function syncInsuranceVisibility() {
    const modal = ensureModal();
    const box = $('.nv-booking-insurance-box', modal);
    const details = $('[data-nv-insurance-details]', modal);
    const notice = $('[data-nv-insurance-notice]', modal);
    const checkbox = $('#nvBookingHasSupplementaryInsurance', modal);
    const service = state.service || {};
    const allowed = hasInsurancePolicy(service);

    if (box) box.hidden = !allowed;
    if (!allowed) {
      if (checkbox) checkbox.checked = false;
      if (details) details.hidden = true;
      if (notice) notice.hidden = true;
      if (state.slot) renderReview();
      return;
    }

    const stateInfo = bookingInsuranceState(modal);
    if (details) details.hidden = !stateInfo.has;
    if (notice) {
      const requiresReview = service.supplementary_insurance_requires_review === true
        || service.supplementary_insurance_requires_review === 1
        || ['1', 'true', 'yes', 'on', 'فعال'].includes(String(service.supplementary_insurance_requires_review || '').trim().toLowerCase());
      const configuredNotice = String(service.supplementary_insurance_notice || '').trim();
      const noticeText = stateInfo.has
        ? (configuredNotice || (requiresReview ? 'بررسی بیمه برای این خدمت توسط کلینیک فعال است.' : ''))
        : '';
      notice.hidden = !noticeText;
      notice.textContent = noticeText;
    }
    if (state.slot) renderReview();
  }

  function renderServices() {
    const container = $('[data-nv-booking-services]', ensureModal());
    if (!state.services.length) {
      container.className = '';
      container.innerHTML = '<div class="nv-booking-message">در حال حاضر نوبت خالی برای دریافت اینترنتی وجود ندارد. می‌توانید با کلینیک تماس بگیرید.</div>';
      return;
    }
    container.className = 'nv-booking-card-grid';
    container.innerHTML = state.services.map((service) => `
      <button type="button" class="nv-booking-choice" data-nv-service-id="${Number(service.id)}">
        <span class="nv-booking-choice__top"><strong>${escapeHtml(service.name)}</strong><span class="nv-booking-choice__icon"></span></span>
        <p>${escapeHtml(service.category || 'خدمات چشم‌پزشکی')}</p>
        <span class="nv-booking-choice__meta"><span class="nv-booking-pill">${toFa(service.available_count || 0)} ظرفیت</span>${hasInsurancePolicy(service) ? '<span class="nv-booking-pill nv-booking-pill--insurance">بیمه تکمیلی</span>' : ''}</span>
      </button>`).join('');
  }

  async function loadServices() {
    const from = isoDate();
    const to = addDays(180);
    const result = await api(`/api/appointment-slots/available?summary=service&date_from=${encodeURIComponent(from)}&date_to=${encodeURIComponent(to)}`);
    state.services = Array.isArray(result.services) ? result.services.filter((item) => Number(item.available_count || 0) > 0) : [];
    renderServices();
    const slug = currentServiceSlug();
    const matched = slug && state.services.find((item) => String(item.slug || '').toLowerCase() === slug.toLowerCase());
    if (matched) await selectService(Number(matched.id));
  }

  function doctorGroups() {
    const map = new Map();
    state.slots.forEach((slot) => {
      const id = Number(slot.doctor_id || 0);
      if (!id) return;
      if (!map.has(id)) map.set(id, { id, name: slot.doctor_name || 'پزشک کلینیک', slots: [], centers: new Set() });
      const group = map.get(id);
      group.slots.push(slot);
      if (slot.medical_center_name) group.centers.add(slot.medical_center_name);
    });
    return Array.from(map.values()).sort((a, b) => String(a.name).localeCompare(String(b.name), 'fa'));
  }

  function renderDoctors() {
    const container = $('[data-nv-booking-doctors]', ensureModal());
    const groups = doctorGroups();
    $('[data-nv-selected-service]', ensureModal()).textContent = state.service ? `خدمت انتخاب‌شده: ${state.service.name}` : '';
    if (!groups.length) {
      container.className = '';
      container.innerHTML = '<div class="nv-booking-message">برای این خدمت در بازه فعلی پزشک یا نوبت خالی ثبت نشده است.</div>';
      return;
    }
    if (groups.length === 1) {
      container.className = '';
      container.innerHTML = `<div class="nv-booking-message is-success">پزشک ${escapeHtml(groups[0].name)} به‌صورت خودکار انتخاب شد.</div>`;
      window.setTimeout(() => selectDoctor(groups[0].id), 160);
      return;
    }
    container.className = 'nv-booking-card-grid';
    container.innerHTML = groups.map((doctor) => {
      const first = doctor.slots[0];
      return `<button type="button" class="nv-booking-choice" data-nv-doctor-id="${doctor.id}">
        <span class="nv-booking-choice__top"><strong>${escapeHtml(doctor.name)}</strong><span class="nv-booking-choice__icon">پ</span></span>
        <p>${escapeHtml(Array.from(doctor.centers).join('، ') || 'کلینیک')}</p>
        <span class="nv-booking-choice__meta"><span class="nv-booking-pill">نزدیک‌ترین: ${escapeHtml(formatDate(first.slot_date, { weekday: false }))}</span></span>
      </button>`;
    }).join('');
  }

  async function selectService(serviceId) {
    if (state.loading) return;
    const service = state.services.find((item) => Number(item.id) === Number(serviceId));
    if (!service) return;
    state.service = service;
    state.doctor = null;
    state.center = null;
    state.slot = null;
    state.selectedDate = '';
    state.loading = true;
    setStep(2);
    const container = $('[data-nv-booking-doctors]', ensureModal());
    container.className = 'nv-booking-loading';
    container.innerHTML = '<div><div class="nv-booking-spinner"></div><span>در حال دریافت پزشکان و ظرفیت‌های خالی...</span></div>';
    try {
      const result = await api(`/api/appointment-slots/available?service_id=${encodeURIComponent(service.id)}&date_from=${encodeURIComponent(isoDate())}&date_to=${encodeURIComponent(addDays(180))}&limit=1000`);
      state.slots = Array.isArray(result.slots) ? result.slots : [];
      renderDoctors();
    } catch (error) {
      container.className = '';
      container.innerHTML = `<div class="nv-booking-message is-error">${escapeHtml(error.message)}</div>`;
    } finally {
      state.loading = false;
    }
  }

  function rawDoctorSlots() {
    return state.slots.filter((slot) => Number(slot.doctor_id) === Number(state.doctor?.id));
  }

  function centerGroups() {
    const map = new Map();
    rawDoctorSlots().forEach((slot) => {
      const id = Number(slot.medical_center_id || 0);
      const key = String(id || 0);
      if (!map.has(key)) map.set(key, { id, name: slot.medical_center_name || 'کلینیک', slots: [] });
      map.get(key).slots.push(slot);
    });
    return Array.from(map.values()).sort((a, b) => String(a.name).localeCompare(String(b.name), 'fa'));
  }

  function selectedDoctorSlots() {
    const slots = rawDoctorSlots();
    if (!state.center) return slots;
    return slots.filter((slot) => Number(slot.medical_center_id || 0) === Number(state.center.id || 0));
  }

  function renderCenters() {
    const container = $('[data-nv-booking-centers]', ensureModal());
    const centers = centerGroups();
    if (!centers.length) {
      setStep(3);
      if (container) container.innerHTML = '<div class="nv-booking-message">برای این پزشک مرکز فعالی پیدا نشد.</div>';
      return;
    }
    if (centers.length === 1) {
      state.center = centers[0];
      setStep(4);
      renderDates();
      return;
    }
    setStep(3);
    container.className = 'nv-booking-card-grid';
    container.innerHTML = centers.map((center) => {
      const capacity = center.slots.reduce((sum, slot) => sum + Number(slot.remaining_capacity || 0), 0);
      return `<button type="button" class="nv-booking-choice" data-nv-center-id="${Number(center.id || 0)}">
        <span class="nv-booking-choice__top"><strong>${escapeHtml(center.name)}</strong><span class="nv-booking-choice__icon">م</span></span>
        <p>این خدمت در این مرکز قابل دریافت است.</p>
        <span class="nv-booking-choice__meta"><span class="nv-booking-pill">${toFa(capacity)} ظرفیت</span></span>
      </button>`;
    }).join('');
  }

  function selectCenter(centerId) {
    const center = centerGroups().find((item) => Number(item.id || 0) === Number(centerId || 0));
    if (!center) return;
    state.center = center;
    state.selectedMonth = '';
    state.selectedDate = '';
    state.slot = null;
    setStep(4);
    renderDates();
  }

  function dateGroups() {
    const unique = new Map();
    selectedDoctorSlots().forEach((slot) => {
      const date = String(slot.slot_date || '').slice(0, 10);
      if (date && !unique.has(date)) unique.set(date, []);
      if (date) unique.get(date).push(slot);
    });
    const months = new Map();
    Array.from(unique.keys()).sort().forEach((date) => {
      const label = monthLabel(date);
      if (!months.has(label)) months.set(label, []);
      months.get(label).push({ date, slots: unique.get(date) });
    });
    return months;
  }

  function renderDates() {
    const months = dateGroups();
    const monthLabels = Array.from(months.keys());
    if (!state.selectedMonth || !months.has(state.selectedMonth)) state.selectedMonth = monthLabels[0] || '';
    const monthContainer = $('[data-nv-booking-months]', ensureModal());
    const dayContainer = $('[data-nv-booking-days]', ensureModal());
    monthContainer.innerHTML = monthLabels.map((label) => `<button class="nv-booking-month${label === state.selectedMonth ? ' is-selected' : ''}" type="button" data-nv-month="${escapeHtml(label)}">${escapeHtml(label)}</button>`).join('');
    const days = months.get(state.selectedMonth) || [];
    dayContainer.innerHTML = days.map((item) => {
      const meta = shortDay(item.date);
      const capacity = item.slots.reduce((sum, slot) => sum + Number(slot.remaining_capacity || 0), 0);
      return `<button class="nv-booking-day" type="button" data-nv-date="${item.date}"><span>${escapeHtml(meta.weekday)}</span><strong>${escapeHtml(meta.day)}</strong><span>${toFa(capacity)} ظرفیت</span></button>`;
    }).join('') || '<div class="nv-booking-message">در این ماه نوبت خالی وجود ندارد.</div>';
  }

  function selectDoctor(doctorId) {
    const group = doctorGroups().find((item) => Number(item.id) === Number(doctorId));
    if (!group) return;
    state.doctor = group;
    state.center = null;
    state.selectedMonth = '';
    state.selectedDate = '';
    state.slot = null;
    renderCenters();
  }

  function renderTimes() {
    const slots = selectedDoctorSlots().filter((slot) => String(slot.slot_date).slice(0, 10) === state.selectedDate);
    const container = $('[data-nv-booking-times]', ensureModal());
    $('[data-nv-selected-date]', ensureModal()).textContent = `${formatDate(state.selectedDate, { year: true })} · ${state.doctor?.name || ''}`;
    container.innerHTML = slots.map((slot) => `<button class="nv-booking-time" type="button" data-nv-slot-id="${Number(slot.id)}"><strong>${formatTime(slot.start_time)} تا ${formatTime(slot.end_time)}</strong><span>${escapeHtml(slot.medical_center_name || 'کلینیک')}</span></button>`).join('') || '<div class="nv-booking-message">برای این روز ساعت خالی باقی نمانده است.</div>';
  }

  function selectDate(date) {
    state.selectedDate = date;
    state.slot = null;
    setStep(5);
    renderTimes();
  }

  function renderReview() {
    const modal = ensureModal();
    const review = $('[data-nv-booking-review]', modal);
    const patientMode = isPatientPanelBooking() || modal.classList.contains('is-patient-panel-booking');
    const allowedInsurance = hasInsurancePolicy(state.service);
    const insuranceState = bookingInsuranceState(modal);
    const payment = calculatePayableAmount(state.slot?.appointment_fee, state.service, insuranceState.has);
    const original = Number(payment.original || 0);
    const payable = Number(payment.payable || 0);

    if (review) {
      const insuranceLine = allowedInsurance
        ? `<div class="nv-final-amount-row"><span>بیمه تکمیلی</span><strong>${insuranceState.has ? 'اعمال می‌شود' : 'انتخاب نشده'}</strong></div>`
        : '';
      const originalLine = insuranceState.has && original !== payable
        ? `<div class="nv-final-amount-row is-muted"><span>تعرفه خدمت</span><strong>${escapeHtml(formatMoney(original))}</strong></div>`
        : '';
      const payableText = payable > 0 ? escapeHtml(formatMoney(payable)) : 'بدون پرداخت آنلاین';
      review.hidden = false;
      review.innerHTML = `
        <div class="nv-final-amount-card">
          <div class="nv-final-amount-title">مبلغ نهایی</div>
          ${originalLine}
          ${insuranceLine}
          <div class="nv-final-amount-row is-main"><span>${payable > 0 ? 'قابل پرداخت' : 'وضعیت پرداخت'}</span><strong>${payableText}</strong></div>
          <small>${payable > 0 ? 'پس از زدن دکمه، به صفحه پرداخت امن منتقل می‌شوید.' : 'با زدن دکمه، نوبت ثبت می‌شود و پیامک پیگیری ارسال خواهد شد.'}</small>
        </div>`;
    }

    const heading = $('[data-nv-booking-step="6"] .nv-booking-step__head h3', modal);
    const desc = $('[data-nv-booking-step="6"] .nv-booking-step__head p', modal);
    if (heading) heading.textContent = allowedInsurance ? 'بیمه تکمیلی و تأیید نهایی' : 'تأیید نهایی نوبت';
    if (desc) {
      desc.textContent = allowedInsurance
        ? (patientMode ? 'بیمه تکمیلی را در صورت نیاز انتخاب کنید؛ مبلغ فقط در این مرحله نمایش داده می‌شود.' : 'شماره موبایل را وارد کنید؛ اگر بیمه تکمیلی دارید آن را انتخاب کنید.')
        : (patientMode ? 'مبلغ نهایی را بررسی کنید و ادامه دهید.' : 'شماره موبایل را وارد کنید و مبلغ نهایی را بررسی کنید.');
    }

    const submit = $('[data-nv-booking-submit-final]', modal);
    if (submit) {
      submit.textContent = payable > 0 ? 'ادامه به پرداخت' : 'ثبت نوبت';
      submit.dataset.originalText = submit.textContent;
    }
  }

  function selectSlot(slotId) {
    const slot = selectedDoctorSlots().find((item) => Number(item.id) === Number(slotId));
    if (!slot) return;
    state.slot = slot;
    showMessage('');
    const patientMode = isPatientPanelBooking() || ensureModal().classList.contains('is-patient-panel-booking');
    if (patientMode && !hasInsurancePolicy(state.service)) {
      setStep(7);
      renderReview();
      return;
    }
    setStep(6);
    syncInsuranceVisibility();
  }

  function validateBookingDetails(form) {
    const patientMode = isPatientPanelBooking() || ensureModal().classList.contains('is-patient-panel-booking');
    const phone = normalizePhone($('#nvBookingPhone', form)?.value || '');
    if (!patientMode && !/^09\d{9}$/.test(phone)) {
      showMessage('شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود.', 'error');
      $('#nvBookingPhone', form)?.focus();
      return false;
    }
    showMessage('');
    setStep(7);
    renderReview();
    return true;
  }

  function showFinalMessage(message, type = 'info') {
    const box = $('[data-nv-booking-final-message]', ensureModal()) || $('[data-nv-booking-message]', ensureModal());
    if (!box) return;
    box.hidden = !message;
    box.className = `nv-booking-message${type === 'error' ? ' is-error' : type === 'success' ? ' is-success' : ''}`;
    box.textContent = message || '';
  }

  function setSubmitBusy(busy, text) {
    const button = $('[data-nv-booking-submit-final]', ensureModal()) || $('[data-nv-booking-submit]', ensureModal());
    if (!button) return;
    if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
    button.disabled = busy;
    button.textContent = busy ? text : button.dataset.originalText;
  }

  async function submitBooking(form) {
    if (!state.slot) return;
    const patientMode = isPatientPanelBooking() || ensureModal().classList.contains('is-patient-panel-booking');
    const phone = normalizePhone($('#nvBookingPhone', form)?.value || '');
    const reason = '';
    const insurance = hasInsurancePolicy(state.service) ? bookingInsuranceState(form) : { has: false, provider: '', number: '', note: '' };
    const payment = calculatePayableAmount(state.slot?.appointment_fee, state.service, insurance.has);
    if (!patientMode && !/^09\d{9}$/.test(phone)) {
      showMessage('شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود.', 'error');
      $('#nvBookingPhone', form)?.focus();
      return;
    }
    showFinalMessage('در حال کنترل ظرفیت و ثبت درخواست...', 'info');
    setSubmitBusy(true, 'در حال ثبت...');
    try {
      const body = {
        appointment_slot_id: Number(state.slot.id),
        reason,
        expected_amount: Number(payment.payable || 0),
        has_supplementary_insurance: insurance.has,
        insurance_provider: insurance.provider,
        insurance_number: insurance.number,
        insurance_note: insurance.note,
        type: 'regular'
      };
      if (!patientMode) {
        body.patient_name = `مراجعه‌کننده ${phone.slice(-4)}`;
        body.patient_phone = phone;
      }
      const result = await api(patientMode ? '/api/patient/appointments' : '/api/appointments', {
        method: 'POST',
        body,
        timeout: 22000
      });
      if (result.payment_required && result.payment_url) {
        showFinalMessage(result.message || 'در حال انتقال به صفحه پرداخت امن...', 'success');
        window.setTimeout(() => window.location.assign(result.payment_url), 450);
        return;
      }
      $('[data-nv-booking-success-text]', ensureModal()).textContent = result.message || 'نوبت ثبت و تأیید شد و پیامک آن در صف ارسال قرار گرفت.';
      const tracking = $('[data-nv-booking-tracking]', ensureModal());
      tracking.textContent = result.tracking_code || '';
      tracking.hidden = !result.tracking_code;
      setStep(8);
    } catch (error) {
      showFinalMessage(error.message || 'ثبت نوبت انجام نشد.', 'error');
      if (error.status === 409) {
        const serviceId = state.service?.id;
        if (serviceId) await selectService(serviceId);
      }
    } finally {
      setSubmitBusy(false, '');
    }
  }

  async function openBooking(trigger) {
    state.trigger = trigger || document.activeElement;
    const modal = ensureModal();
    applyPatientPanelIdentityMode();
    resetState();
    modal.hidden = false;
    document.body.classList.add('nv-booking-open');
    setStep(1);
    try {
      await loadServices();
    } catch (error) {
      const container = $('[data-nv-booking-services]', modal);
      container.className = '';
      container.innerHTML = `<div class="nv-booking-message is-error">${escapeHtml(error.message)}</div>`;
    }
  }

  function closeBooking() {
    const modal = $('#nvPublicBooking');
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove('nv-booking-open');
    state.trigger?.focus?.({ preventScroll: true });
  }

  document.addEventListener('click', (event) => {
    const bookingButton = event.target.closest('.nav-booking, .open-booking, .floating-booking, [data-open-booking]');
    if (bookingButton) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openBooking(bookingButton);
      return;
    }
  }, true);

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-nv-booking-close]')) { closeBooking(); return; }
    const back = event.target.closest('[data-nv-booking-back]');
    if (back) {
      let targetStep = Number(back.dataset.nvBookingBack || 1);
      if (targetStep === 6 && (isPatientPanelBooking() || ensureModal().classList.contains('is-patient-panel-booking')) && !hasInsurancePolicy(state.service)) targetStep = 5;
      if (targetStep === 3) { renderCenters(); return; }
      if (targetStep === 4) { setStep(4); renderDates(); return; }
      if (targetStep === 5) { setStep(5); renderTimes(); return; }
      setStep(targetStep);
      return;
    }
    const service = event.target.closest('[data-nv-service-id]');
    if (service) { selectService(Number(service.dataset.nvServiceId)); return; }
    const doctor = event.target.closest('[data-nv-doctor-id]');
    if (doctor) { selectDoctor(Number(doctor.dataset.nvDoctorId)); return; }
    const center = event.target.closest('[data-nv-center-id]');
    if (center) { selectCenter(Number(center.dataset.nvCenterId)); return; }
    const month = event.target.closest('[data-nv-month]');
    if (month) { state.selectedMonth = month.dataset.nvMonth || ''; renderDates(); return; }
    const date = event.target.closest('[data-nv-date]');
    if (date) { selectDate(date.dataset.nvDate || ''); return; }
    const slot = event.target.closest('[data-nv-slot-id]');
    if (slot) selectSlot(Number(slot.dataset.nvSlotId));
  });


  document.addEventListener('change', (event) => {
    if (event.target && event.target.id === 'nvBookingHasSupplementaryInsurance') syncInsuranceVisibility();
  });
  document.addEventListener('input', (event) => {
    if (event.target && event.target.id && /^nvBookingInsurance/.test(event.target.id)) syncInsuranceVisibility();
  });

  document.addEventListener('submit', (event) => {
    if (!event.target.matches('[data-nv-booking-form]')) return;
    event.preventDefault();
    validateBookingDetails(event.target);
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('[data-nv-booking-submit-final]')) return;
    event.preventDefault();
    const form = $('[data-nv-booking-form]', ensureModal());
    submitBooking(form);
  });

  document.addEventListener('keydown', (event) => {
    const modal = $('#nvPublicBooking');
    if (event.key === 'Escape' && modal && !modal.hidden) closeBooking();
  });

  document.addEventListener('DOMContentLoaded', () => {
    removeLegacyBooking();
    ensureModal();
  });
})();
