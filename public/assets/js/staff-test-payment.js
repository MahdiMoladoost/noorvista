// NOORVISTA 2.1.40 — sandbox checkout return and appointment payment-state fix
(function () {
  'use strict';

  const root = document.getElementById('staffPaymentContent');
  if (!root) return;

  const faDigits = '۰۱۲۳۴۵۶۷۸۹';
  const backPage = 'appointments.html';
  const token = new URLSearchParams(window.location.search).get('checkout_token') || '';
  let countdownTimer = null;
  let checkout = null;
  let resultDetails = null;
  let flash = null;
  let busyAction = '';
  let returnTimer = null;

  const toFa = value => String(value ?? '').replace(/\d/g, d => faDigits[Number(d)]);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[ch]);

  function money(value) {
    const amount = Number(value || 0);
    return amount > 0 ? `${toFa(Math.round(amount).toLocaleString('en-US'))} تومان` : 'رایگان';
  }

  function parseUtc(value) {
    if (!value) return NaN;
    const raw = String(value).trim();
    if (!raw) return NaN;
    const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : `${raw.replace(' ', 'T')}Z`;
    return new Date(normalized).getTime();
  }

  function dateView(value) {
    const raw = String(value || '').slice(0, 10);
    if (!raw) return '—';
    try {
      return toFa(new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
        year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
      }).format(new Date(`${raw}T12:00:00`)));
    } catch (_) { return toFa(raw); }
  }

  function dateTimeView(value) {
    const timestamp = parseUtc(value);
    if (!Number.isFinite(timestamp)) return '—';
    try {
      return toFa(new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
      }).format(new Date(timestamp)));
    } catch (_) { return '—'; }
  }

  function timeView(value) {
    return toFa(String(value || '').slice(0, 5) || '—');
  }

  function remainingMs() {
    return Math.max(0, parseUtc(checkout?.expires_at) - Date.now());
  }

  function remainingLabel() {
    const seconds = Math.floor(remainingMs() / 1000);
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return `${toFa(String(minutes).padStart(2, '0'))}:${toFa(String(rest).padStart(2, '0'))}`;
  }

  function statusLabel(status) {
    return ({
      pending: 'در انتظار پرداخت',
      paid: 'پرداخت‌شده و نهایی',
      cancelled: 'انصراف از پرداخت',
      expired: 'مهلت پایان یافته',
      failed: 'پرداخت ناموفق'
    })[String(status || '')] || 'نامشخص';
  }

  function statusTone(status) {
    return ({
      pending: 'tw-border-amber-200 tw-bg-amber-50 tw-text-amber-950',
      paid: 'tw-border-emerald-200 tw-bg-emerald-50 tw-text-emerald-950',
      cancelled: 'tw-border-slate-200 tw-bg-slate-50 tw-text-slate-800',
      expired: 'tw-border-rose-200 tw-bg-rose-50 tw-text-rose-900',
      failed: 'tw-border-rose-200 tw-bg-rose-50 tw-text-rose-900'
    })[String(status || '')] || 'tw-border-sky-200 tw-bg-sky-50 tw-text-sky-900';
  }

  function appointmentsReturnUrl(appointmentId) {
    const params = new URLSearchParams();
    params.set('payment', 'success');
    if (appointmentId) params.set('appointment_id', String(appointmentId));
    return `${backPage}?${params.toString()}`;
  }

  function scheduleReturnToAppointments(appointmentId) {
    if (returnTimer) clearTimeout(returnTimer);
    returnTimer = setTimeout(() => {
      window.location.replace(appointmentsReturnUrl(appointmentId));
    }, 1100);
  }

  function notice(text, tone = 'info') {
    const tones = {
      info: 'tw-border-sky-200 tw-bg-sky-50 tw-text-sky-900',
      success: 'tw-border-emerald-200 tw-bg-emerald-50 tw-text-emerald-950',
      warning: 'tw-border-amber-200 tw-bg-amber-50 tw-text-amber-950',
      error: 'tw-border-rose-200 tw-bg-rose-50 tw-text-rose-900'
    };
    return `<div class="tw-rounded-2xl tw-border tw-p-4 tw-text-sm tw-font-bold tw-leading-7 ${tones[tone] || tones.info}">${escapeHtml(text)}</div>`;
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: 'same-origin',
      ...options,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) {
      throw new Error(data.message || `خطای سرور با کد ${toFa(response.status)} رخ داد.`);
    }
    return data;
  }

  function detail(label, value, meta = '') {
    return `<article class="tw-min-w-0 tw-rounded-2xl tw-border tw-border-slate-200 tw-bg-slate-50/80 tw-p-4">
      <span class="tw-block tw-text-xs tw-font-bold tw-text-slate-500">${escapeHtml(label)}</span>
      <strong class="tw-mt-2 tw-block tw-break-words tw-text-sm tw-font-black tw-leading-7 tw-text-slate-900">${escapeHtml(value || 'ثبت نشده')}</strong>
      ${meta ? `<small class="tw-mt-1 tw-block tw-break-words tw-text-xs tw-font-bold tw-text-slate-500">${escapeHtml(meta)}</small>` : ''}
    </article>`;
  }

  function resultPanel() {
    if (checkout?.status !== 'paid') return '';
    const source = resultDetails || {};
    return `
      <section class="tw-overflow-hidden tw-rounded-[26px] tw-border tw-border-emerald-200 tw-bg-white tw-shadow-xl tw-shadow-emerald-100/50">
        <div class="tw-bg-gradient-to-l tw-from-emerald-700 tw-to-teal-600 tw-p-6 tw-text-white">
          <div class="tw-flex tw-items-center tw-gap-4">
            <span class="tw-grid tw-h-14 tw-w-14 tw-flex-none tw-place-items-center tw-rounded-2xl tw-bg-white/20 tw-text-2xl"><i class="icon-check"></i></span>
            <div><h2 class="tw-text-xl tw-font-black">پرداخت آزمایشی موفق بود</h2><p class="tw-mt-1 tw-text-sm tw-font-bold tw-text-emerald-50">نوبت ایجاد و به‌صورت قطعی تأیید شد.</p></div>
          </div>
        </div>
        <div class="tw-grid tw-gap-3 tw-p-5 sm:tw-grid-cols-2 lg:tw-grid-cols-3">
          ${detail('شماره رسید', source.receipt_number || checkout.provider_reference)}
          ${detail('شماره پیگیری درگاه', source.reference_number || checkout.provider_reference)}
          ${detail('شماره رهگیری بانکی', source.rrn || 'در سوابق پرداخت ثبت شد')}
          ${detail('شماره پیگیری تراکنش', source.trace_number || 'در سوابق پرداخت ثبت شد')}
          ${detail('درگاه', source.bank_name || 'بانک آزمایشی صدرا')}
          ${detail('زمان تأیید', dateTimeView(source.verified_at || checkout.paid_at))}
        </div>
      </section>`;
  }

  function paymentSimulator() {
    const pending = checkout?.status === 'pending';
    const realGateway = checkout?.provider === 'zarinpal';
    const terminal = !pending;
    return `
      <section class="tw-overflow-hidden tw-rounded-[28px] tw-border tw-border-slate-200 tw-bg-white tw-shadow-2xl tw-shadow-slate-200/60">
        <div class="tw-bg-gradient-to-l tw-from-noor-900 tw-via-noor-800 tw-to-cyan-700 tw-p-6 tw-text-white sm:tw-p-7">
          <div class="tw-flex tw-flex-col tw-gap-5 sm:tw-flex-row sm:tw-items-center sm:tw-justify-between">
            <div>
              <span class="tw-inline-flex tw-items-center tw-gap-2 tw-rounded-full tw-bg-white/15 tw-px-3 tw-py-1.5 tw-text-xs tw-font-black tw-text-white"><i class="icon-shield"></i> ${realGateway ? 'درگاه امن پرداخت' : 'شبیه‌ساز درگاه بانکی'}</span>
              <h1 class="tw-mt-4 tw-text-2xl tw-font-black tw-text-white sm:tw-text-3xl">${realGateway ? 'پرداخت نوبت' : 'پرداخت آزمایشی نوبت'}</h1>
              <p class="tw-mt-2 tw-max-w-xl tw-text-sm tw-font-bold tw-leading-8 tw-text-sky-100">${realGateway ? 'با انتخاب ادامه، برای تکمیل پرداخت به صفحه امن زرین‌پال منتقل می‌شوید. پس از تأیید بانکی، نوبت به‌صورت خودکار ثبت می‌شود.' : 'هیچ اطلاعات کارت بانکی دریافت نمی‌شود. زدن دکمه پرداخت، پاسخ موفق بانک را شبیه‌سازی و اطلاعات تراکنش را در بانک اطلاعاتی ثبت می‌کند.'}</p>
            </div>
            <div class="tw-min-w-[210px] tw-rounded-3xl tw-bg-white/10 tw-p-5 tw-text-center tw-ring-1 tw-ring-white/20">
              <span class="tw-block tw-text-xs tw-font-bold tw-text-sky-100">مبلغ قابل پرداخت</span>
              <strong class="tw-mt-2 tw-block tw-text-3xl tw-font-black tw-text-white">${money(checkout?.amount)}</strong>
            </div>
          </div>
        </div>

        <div class="tw-space-y-5 tw-p-5 sm:tw-p-7">
          <div class="tw-flex tw-flex-col tw-gap-4 tw-rounded-2xl tw-border tw-p-4 sm:tw-flex-row sm:tw-items-center sm:tw-justify-between ${statusTone(checkout?.status)}">
            <div><span class="tw-block tw-text-xs tw-font-bold">وضعیت تراکنش</span><strong class="tw-mt-1 tw-block tw-text-base tw-font-black">${statusLabel(checkout?.status)}</strong></div>
            ${pending ? `<div class="tw-text-center"><span class="tw-block tw-text-xs tw-font-bold">زمان باقی‌مانده</span><strong class="tw-mt-1 tw-block tw-font-mono tw-text-2xl tw-font-black" data-countdown>${remainingLabel()}</strong></div>` : ''}
          </div>

          ${pending ? `<div class="tw-overflow-hidden tw-rounded-full tw-bg-slate-100"><div class="tw-h-2 tw-rounded-full tw-bg-gradient-to-l tw-from-emerald-500 tw-to-sky-500 tw-transition-all" data-progress style="width:100%"></div></div>` : ''}

          <div class="tw-grid tw-gap-3 sm:tw-grid-cols-3">
            <div class="tw-rounded-2xl tw-border tw-border-slate-200 tw-bg-slate-50 tw-p-4"><span class="tw-grid tw-h-10 tw-w-10 tw-place-items-center tw-rounded-xl tw-bg-sky-100 tw-text-sky-700"><i class="icon-lock"></i></span><strong class="tw-mt-3 tw-block tw-text-sm tw-font-black tw-text-slate-900">بدون اطلاعات کارت</strong><p class="tw-mt-1 tw-text-xs tw-leading-6 tw-text-slate-500">شماره کارت، رمز و CVV2 دریافت نمی‌شود.</p></div>
            <div class="tw-rounded-2xl tw-border tw-border-slate-200 tw-bg-slate-50 tw-p-4"><span class="tw-grid tw-h-10 tw-w-10 tw-place-items-center tw-rounded-xl tw-bg-emerald-100 tw-text-emerald-700"><i class="icon-database"></i></span><strong class="tw-mt-3 tw-block tw-text-sm tw-font-black tw-text-slate-900">ثبت سابقه تراکنش</strong><p class="tw-mt-1 tw-text-xs tw-leading-6 tw-text-slate-500">رسید، مرجع، رهگیری و پاسخ فیک بانک ذخیره می‌شود.</p></div>
            <div class="tw-rounded-2xl tw-border tw-border-slate-200 tw-bg-slate-50 tw-p-4"><span class="tw-grid tw-h-10 tw-w-10 tw-place-items-center tw-rounded-xl tw-bg-amber-100 tw-text-amber-700"><i class="icon-clock-o"></i></span><strong class="tw-mt-3 tw-block tw-text-sm tw-font-black tw-text-slate-900">دریافت موقت ظرفیت</strong><p class="tw-mt-1 tw-text-xs tw-leading-6 tw-text-slate-500">در انصراف یا پایان زمان، ظرفیت آزاد می‌شود.</p></div>
          </div>

          ${flash ? notice(flash.text, flash.tone) : ''}

          <div class="tw-flex tw-flex-col-reverse tw-gap-3 sm:tw-flex-row sm:tw-justify-end">
            <a href="${backPage}" class="noor-tw-btn-secondary tw-justify-center"><i class="icon-chevron-right"></i> بازگشت به نوبت‌ها</a>
            <button type="button" class="noor-tw-btn-secondary tw-justify-center" data-cancel ${terminal || busyAction ? 'disabled' : ''}><i class="icon-close"></i> انصراف و آزادسازی ظرفیت</button>
            <button type="button" class="noor-tw-btn-primary tw-min-w-48 tw-justify-center" data-complete ${terminal || busyAction ? 'disabled' : ''}><i class="${busyAction === 'complete' ? 'icon-refresh' : 'icon-check'}"></i> ${busyAction === 'complete' ? (realGateway ? 'در حال انتقال به درگاه...' : 'در حال ارتباط با بانک آزمایشی...') : (realGateway ? 'انتقال به زرین‌پال' : 'پرداخت آزمایشی و ثبت نوبت')}</button>
          </div>
        </div>
      </section>`;
  }

  function render() {
    if (!checkout) return;
    root.innerHTML = `
      <div class="tw-mx-auto tw-max-w-6xl tw-space-y-5">
        ${resultPanel()}
        ${paymentSimulator()}
        <section class="tw-rounded-[26px] tw-border tw-border-slate-200 tw-bg-white tw-shadow-xl tw-shadow-slate-200/50">
          <header class="tw-border-b tw-border-slate-100 tw-p-5 sm:tw-p-6"><h2 class="tw-text-lg tw-font-black tw-text-slate-900">اطلاعات نوبت و پرداخت</h2><p class="tw-mt-1 tw-text-xs tw-leading-6 tw-text-slate-500">این اطلاعات برای رسیدگی مالی و پاسخ‌گویی به بیمار نگهداری می‌شود.</p></header>
          <div class="tw-grid tw-gap-3 tw-p-5 sm:tw-grid-cols-2 sm:tw-p-6 lg:tw-grid-cols-3">
            ${detail('بیمار', checkout.patient_name, checkout.patient_phone)}
            ${detail('پزشک', checkout.doctor_name, checkout.specialty)}
            ${detail('خدمت', checkout.service_name)}
            ${detail('مرکز درمانی', checkout.medical_center_name)}
            ${detail('تاریخ نوبت', dateView(checkout.appointment_date))}
            ${detail('ساعت نوبت', `${timeView(checkout.appointment_time)} تا ${timeView(checkout.end_time)}`)}
            ${detail('مبلغ', money(checkout.amount))}
            ${detail('شناسه درخواست', toFa(checkout.id || '—'))}
            ${detail('انقضای دریافت موقت', dateTimeView(checkout.expires_at))}
          </div>
        </section>
      </div>`;

    bindActions();
    startCountdown();
  }

  function startCountdown() {
    if (countdownTimer) clearInterval(countdownTimer);
    const target = root.querySelector('[data-countdown]');
    const progress = root.querySelector('[data-progress]');
    if (!target || checkout?.status !== 'pending') return;
    const expiresAt = parseUtc(checkout.expires_at);
    const createdAt = parseUtc(checkout.created_at);
    const total = Math.max(1, expiresAt - (Number.isFinite(createdAt) ? createdAt : Date.now()));
    const tick = () => {
      const remaining = Math.max(0, expiresAt - Date.now());
      const seconds = Math.floor(remaining / 1000);
      target.textContent = `${toFa(String(Math.floor(seconds / 60)).padStart(2, '0'))}:${toFa(String(seconds % 60).padStart(2, '0'))}`;
      if (progress) progress.style.width = `${Math.max(0, Math.min(100, (remaining / total) * 100))}%`;
      if (remaining <= 0) {
        clearInterval(countdownTimer);
        load();
      }
    };
    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  function bindActions() {
    root.querySelector('[data-complete]')?.addEventListener('click', async () => {
      if (busyAction || checkout?.status !== 'pending') return;
      busyAction = 'complete';
      const realGateway = checkout?.provider === 'zarinpal';
      flash = { text: realGateway ? 'در حال انتقال به درگاه امن پرداخت...' : 'در حال شبیه‌سازی پاسخ موفق بانک و ثبت امن تراکنش هستیم...', tone: 'info' };
      render();
      try {
        if (realGateway) {
          if (!checkout.gateway_url || !/^https:\/\/payment\.zarinpal\.com\//i.test(checkout.gateway_url)) throw new Error('نشانی امن درگاه پرداخت در دسترس نیست');
          window.location.assign(checkout.gateway_url);
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 650));
        const result = await api(`/api/appointments/payment-checkout/${encodeURIComponent(token)}/test-complete`, { method: 'POST', body: '{}' });
        resultDetails = result;
        checkout.status = 'paid';
        checkout.provider_reference = result.reference_number || result.receipt_number || checkout.provider_reference;
        checkout.paid_at = result.verified_at || new Date().toISOString();
        flash = { text: result.message || 'پرداخت تأیید شد و نوبت ثبت گردید.', tone: 'success' };
        try { sessionStorage.setItem('nv_appointment_payment_result', flash.text); } catch (_) {}
        scheduleReturnToAppointments(result.appointment_id || checkout.appointment_id);
      } catch (error) {
        flash = { text: error.message || 'پرداخت تأیید نشد و نوبتی ثبت نشد.', tone: 'error' };
      } finally {
        busyAction = '';
        render();
      }
    });

    root.querySelector('[data-cancel]')?.addEventListener('click', async () => {
      if (busyAction || checkout?.status !== 'pending') return;
      busyAction = 'cancel';
      flash = { text: 'در حال لغو پرداخت و آزادسازی ظرفیت...', tone: 'warning' };
      render();
      try {
        const result = await api(`/api/appointments/payment-checkout/${encodeURIComponent(token)}/cancel`, { method: 'POST', body: '{}' });
        checkout.status = 'cancelled';
        flash = { text: result.message || 'پرداخت انجام نشد و ظرفیت آزاد شد.', tone: 'warning' };
        try { sessionStorage.setItem('nv_appointment_payment_result', flash.text); } catch (_) {}
      } catch (error) {
        flash = { text: error.message || 'انصراف از پرداخت انجام نشد.', tone: 'error' };
      } finally {
        busyAction = '';
        render();
      }
    });
  }

  async function load() {
    if (!token || token.length < 20) {
      root.innerHTML = `<div class="tw-mx-auto tw-max-w-2xl">${notice('شناسه پرداخت معتبر نیست؛ هیچ نوبتی ثبت نشده است.', 'error')}<a class="noor-tw-btn-secondary tw-mt-4" href="${backPage}">بازگشت به نوبت‌ها</a></div>`;
      return;
    }
    root.innerHTML = '<div class="tw-mx-auto tw-h-72 tw-max-w-6xl tw-animate-pulse tw-rounded-[28px] tw-bg-slate-200"></div>';
    try {
      const response = await api(`/api/appointments/payment-checkout/${encodeURIComponent(token)}`);
      checkout = response.checkout || {};
      render();
    } catch (error) {
      root.innerHTML = `<div class="tw-mx-auto tw-max-w-2xl">${notice(error.message || 'اطلاعات پرداخت دریافت نشد.', 'error')}<a class="noor-tw-btn-secondary tw-mt-4" href="${backPage}">بازگشت به نوبت‌ها</a></div>`;
    }
  }

  load();
})();
