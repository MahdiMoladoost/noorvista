(function () {
  'use strict';

  const content = document.getElementById('publicPaymentContent');
  const token = new URLSearchParams(window.location.search).get('checkout_token') || '';
  let checkout = null;
  let countdownTimer = null;

  const faDigits = '۰۱۲۳۴۵۶۷۸۹';
  const toFa = (value) => String(value ?? '').replace(/\d/g, (digit) => faDigits[Number(digit)]);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[character]);

  function formatMoney(value) {
    return `${Number(value || 0).toLocaleString('fa-IR')} تومان`;
  }

  function formatDate(value) {
    if (!value) return '—';
    try {
      return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      }).format(new Date(`${String(value).slice(0, 10)}T12:00:00`));
    } catch (_) {
      return toFa(String(value).slice(0, 10).replace(/-/g, '/'));
    }
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      method: options.method || 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) {
      const error = new Error(data.message || 'عملیات پرداخت انجام نشد');
      error.status = response.status;
      error.code = data.code || '';
      throw error;
    }
    return data;
  }

  function message(text, type = 'error', extra = '') {
    content.innerHTML = `<div class="nv-pay-message is-${type}">${escapeHtml(text)}${extra}</div><div class="nv-pay-actions"><a class="nv-pay-btn nv-pay-btn--secondary" href="/">بازگشت به سایت</a></div>`;
  }

  function remainingSeconds() {
    const expires = Date.parse(checkout?.expires_at || '');
    return Number.isFinite(expires) ? Math.max(0, Math.floor((expires - Date.now()) / 1000)) : 0;
  }

  function updateCountdown() {
    const target = document.getElementById('publicPaymentCountdown');
    if (!target) return;
    const seconds = remainingSeconds();
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    target.textContent = `${toFa(minutes)}:${toFa(String(rest).padStart(2, '0'))}`;
    if (seconds <= 0) {
      window.clearInterval(countdownTimer);
      document.getElementById('publicPaymentConfirm')?.setAttribute('disabled', 'disabled');
      message('مهلت پرداخت پایان یافته و ظرفیت نوبت آزاد شده است. دوباره نوبت دیگری انتخاب کنید.');
    }
  }

  function renderCheckout(data) {
    checkout = data.checkout || {};
    if (checkout.status === 'paid') {
      message('این پرداخت قبلاً تأیید شده و نوبت ثبت شده است.', 'success', checkout.provider_reference ? `<br><code>${escapeHtml(checkout.provider_reference)}</code>` : '');
      return;
    }
    if (checkout.status === 'expired') {
      message('مهلت پرداخت پایان یافته و ظرفیت نوبت آزاد شده است.');
      return;
    }
    if (checkout.status === 'cancelled') {
      message('این درخواست پرداخت لغو شده و نوبتی ثبت نشده است.');
      return;
    }

    const testNote = data.test_mode
      ? '<div class="nv-pay-notice"><i class="icon-info" aria-hidden="true"></i><span>این محیط از درگاه آزمایشی استفاده می‌کند؛ هیچ اطلاعات کارت بانکی دریافت نمی‌شود و پرداخت فقط برای آزمون سامانه است.</span></div>'
      : '<div class="nv-pay-notice"><i class="icon-info" aria-hidden="true"></i><span>برای ادامه، به درگاه بانکی امن منتقل می‌شوید.</span></div>';

    content.innerHTML = `
      <div class="nv-pay-summary">
        <div><span>خدمت</span><strong>${escapeHtml(checkout.service_name || 'خدمت چشم‌پزشکی')}</strong></div>
        <div><span>پزشک</span><strong>${escapeHtml(checkout.doctor_name || 'پزشک کلینیک')}</strong></div>
        <div><span>زمان مراجعه</span><strong>${escapeHtml(formatDate(checkout.appointment_date))}، ${toFa(checkout.appointment_time || '')}</strong></div>
        <div><span>مرکز درمانی</span><strong>${escapeHtml(checkout.medical_center_name || 'کلینیک')}</strong></div>
        <div><span>مراجعه‌کننده</span><strong>${escapeHtml(checkout.patient_name || '—')}</strong></div>
        <div><span>شماره تماس</span><strong dir="ltr">${escapeHtml(checkout.patient_phone || '—')}</strong></div>
      </div>
      <div class="nv-pay-amount"><span>مبلغ قابل پرداخت</span><strong>${escapeHtml(formatMoney(checkout.amount))}</strong></div>
      ${testNote}
      <div class="nv-pay-countdown">زمان باقی‌مانده برای پرداخت: <strong id="publicPaymentCountdown">—</strong></div>
      <div class="nv-pay-actions">
        <button class="nv-pay-btn nv-pay-btn--secondary" type="button" id="publicPaymentCancel">انصراف و آزادسازی ظرفیت</button>
        <button class="nv-pay-btn nv-pay-btn--primary" type="button" id="publicPaymentConfirm">${data.test_mode ? 'تأیید پرداخت آزمایشی' : 'انتقال به درگاه بانکی'}</button>
      </div>`;

    countdownTimer = window.setInterval(updateCountdown, 1000);
    updateCountdown();

    document.getElementById('publicPaymentConfirm')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      const original = button.textContent;
      button.textContent = 'در حال تأیید...';
      try {
        if (!data.test_mode) {
          if (!checkout.gateway_url || !/^https:\/\/payment\.zarinpal\.com\//i.test(checkout.gateway_url)) {
            throw new Error('نشانی امن درگاه پرداخت در دسترس نیست؛ دوباره دریافت را آغاز کنید');
          }
          button.textContent = 'در حال انتقال به زرین‌پال...';
          window.location.assign(checkout.gateway_url);
          return;
        }
        const result = await api(`/api/appointments/public-payment-checkout/${encodeURIComponent(token)}/test-complete`, { method: 'POST', body: {} });
        window.clearInterval(countdownTimer);
        message(result.message || 'پرداخت تأیید شد و نوبت ثبت گردید.', 'success', `<br><code>${escapeHtml(result.reference_number || result.receipt_number || '')}</code>`);
      } catch (error) {
        button.disabled = false;
        button.textContent = original;
        const notice = document.createElement('div');
        notice.className = 'nv-pay-message is-error';
        notice.textContent = error.message || 'تأیید پرداخت انجام نشد';
        content.prepend(notice);
      }
    });

    document.getElementById('publicPaymentCancel')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = 'در حال لغو...';
      try {
        const result = await api(`/api/appointments/public-payment-checkout/${encodeURIComponent(token)}/cancel`, { method: 'POST', body: {} });
        window.clearInterval(countdownTimer);
        message(result.message || 'ظرفیت آزاد شد و نوبتی ثبت نشد.', 'success');
      } catch (error) {
        button.disabled = false;
        button.textContent = 'انصراف و آزادسازی ظرفیت';
        const notice = document.createElement('div');
        notice.className = 'nv-pay-message is-error';
        notice.textContent = error.message || 'لغو پرداخت انجام نشد';
        content.prepend(notice);
      }
    });
  }

  async function init() {
    if (!token || token.length < 20) {
      message('شناسه پرداخت معتبر نیست. دوباره از صفحه دریافت نوبت شروع کنید.');
      return;
    }
    try {
      const data = await api(`/api/appointments/public-payment-checkout/${encodeURIComponent(token)}`);
      renderCheckout(data);
    } catch (error) {
      message(error.message || 'اطلاعات پرداخت پیدا نشد.');
    }
  }

  init();
})();
