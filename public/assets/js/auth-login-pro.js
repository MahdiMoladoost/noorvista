const API_BASE = '/api';
const REQUEST_TIMEOUT_MS = Object.freeze({
  health: 4000,
  session: 5000,
  login: 15000,
  default: 12000
});

function requestTimeoutError() {
  const error = new Error('زمان انتظار پاسخ سرور به پایان رسید.');
  error.code = 'REQUEST_TIMEOUT';
  return error;
}

async function fetchJson(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS.default) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeoutId = controller ? window.setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...options,
      ...(controller ? { signal: controller.signal } : {})
    });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  } catch (error) {
    if (error?.name === 'AbortError') throw requestTimeoutError();
    throw error;
  } finally {
    if (timeoutId !== null) window.clearTimeout(timeoutId);
  }
}

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function showToast(message, type = 'info') {
  const container = $('#toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4200);
}

function setError(id, message = '') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('show', Boolean(message));
}

function setButtonLoading(button, isLoading, loadingText = 'در حال پردازش...') {
  if (!button) return '';
  if (isLoading) {
    const old = button.innerHTML;
    button.dataset.oldHtml = old;
    button.innerHTML = `<span class="loading-spinner"></span>${loadingText}`;
    button.disabled = true;
    return old;
  }
  button.innerHTML = button.dataset.oldHtml || button.innerHTML;
  button.disabled = false;
  return '';
}

function normalizeRole(role = '') {
  return String(role).trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function dataSafeRedirect(value) {
  const target = String(value || '').trim();
  if (!target.startsWith('/') || target.startsWith('//')) return '';
  return target;
}

function redirectToDashboard(role, user = {}) {
  const normalizedRole = normalizeRole(role || user.role);
  const panelUrls = {
    system_admin: '/dashboard/panel/admin/index.html',
    admin: '/dashboard/panel/admin/index.html',
    clinic_admin: '/dashboard/panel/clinic-admin/index.html',
    clinic_manager: '/dashboard/panel/clinic-admin/index.html',
    manager: '/dashboard/panel/clinic-admin/index.html',
    doctor: '/dashboard/panel/doctor/index.html',
    receptionist: '/dashboard/panel/reception/index.html',
    reception: '/dashboard/panel/reception/index.html',
    secretary: '/dashboard/panel/reception/index.html',
    staff: '/dashboard/panel/reception/index.html',
    patient: '/dashboard/panel/patient/index.html',
    'پزشک': '/dashboard/panel/doctor/index.html',
    'بیمار': '/dashboard/panel/patient/index.html'
  };
  window.location.href = dataSafeRedirect(user.redirect || '') || panelUrls[normalizedRole] || '/login';
}


function resetStepText(step) {
  const title = $('#forgotTitle');
  const description = $('#forgotDescription');
  if (!title || !description) return;
  if (step === 'phone') {
    title.textContent = 'بازیابی رمز عبور';
    description.textContent = 'شماره موبایل ثبت‌شده را وارد کنید تا کد تأیید برای بازیابی رمز ارسال شود.';
  } else if (step === 'code') {
    title.textContent = 'تأیید کد بازیابی';
    description.textContent = `کد پیامک‌شده به شماره ${forgotResetPhone || ''} را وارد کنید.`;
  } else {
    title.textContent = 'ثبت رمز جدید';
    description.textContent = 'کد تأیید شد. رمز جدید را وارد کنید و تأیید نهایی را بزنید.';
  }
}

function setForgotResetStep(step) {
  forgotResetStep = step;
  $$('[data-reset-step]').forEach((el) => { el.hidden = el.dataset.resetStep !== step; });
  $$('[data-reset-progress]').forEach((el) => {
    const order = { phone: 1, code: 2, password: 3 };
    const current = order[step] || 1;
    const mine = order[el.dataset.resetProgress] || 1;
    el.classList.toggle('active', mine === current);
    el.classList.toggle('done', mine < current);
  });
  resetStepText(step);
  const btn = $('#submitForgotBtn');
  if (btn) {
    btn.textContent = step === 'phone' ? 'ارسال کد بازیابی' : (step === 'code' ? 'تأیید کد' : 'تغییر رمز عبور');
  }
}

function stopForgotTimer() {
  if (forgotTimerId) window.clearInterval(forgotTimerId);
  forgotTimerId = null;
  forgotRemainingSeconds = 0;
}

function startForgotTimer(seconds = 90) {
  stopForgotTimer();
  forgotRemainingSeconds = seconds;
  const text = $('#forgotTimerText');
  const resend = $('#forgotResendBtn');
  if (resend) resend.disabled = true;
  const render = () => {
    if (text) text.textContent = forgotRemainingSeconds > 0
      ? `تا امکان ارسال مجدد: ${toPersianDigits(String(forgotRemainingSeconds))} ثانیه`
      : 'امکان ارسال مجدد فعال است.';
    if (resend) resend.disabled = forgotRemainingSeconds > 0;
  };
  render();
  forgotTimerId = window.setInterval(() => {
    forgotRemainingSeconds -= 1;
    render();
    if (forgotRemainingSeconds <= 0) stopForgotTimer();
  }, 1000);
}

function resetForgotForm() {
  forgotResetPhone = '';
  forgotResetToken = '';
  stopForgotTimer();
  ['forgotEmail','forgotCode','forgotNewPassword','forgotConfirmPassword'].forEach(id => { const el = $('#' + id); if (el) el.value = ''; });
  setForgotResetStep('phone');
}

function openForgotModal() {
  const modal = $('#forgotPasswordModal');
  if (!modal) return;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  resetForgotForm();
  setTimeout(() => $('#forgotEmail')?.focus(), 120);
}

function closeForgotModal() {
  const modal = $('#forgotPasswordModal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  setError('forgotError', '');
  resetForgotForm();
}

async function checkServerStatus() {
  const statusDiv = $('#serverStatus');
  if (!statusDiv) return;
  statusDiv.hidden = true;
  try {
    const { response, data } = await fetchJson(
      `${API_BASE}/health`,
      { headers: { Accept: 'application/json' } },
      REQUEST_TIMEOUT_MS.health
    );
    if (!response.ok || data.status !== 'ok') throw new Error('SERVER_UNAVAILABLE');
    statusDiv.className = 'server-status online';
    statusDiv.hidden = true;
  } catch (error) {
    statusDiv.className = 'server-status offline';
    statusDiv.textContent = error?.code === 'REQUEST_TIMEOUT'
      ? 'سرور پاسخ نداد؛ سرویس Node.js و پورت 3000 را بررسی کنید'
      : 'ارتباط با سرور برقرار نشد؛ سرویس Backend را بررسی کنید';
  }
}

$$('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('.tab-btn').forEach((b) => b.classList.remove('active'));
    $$('.tab-content').forEach((t) => t.classList.remove('active'));
    btn.classList.add('active');
    const tab = document.getElementById(btn.dataset.tab);
    tab?.classList.add('active');
    if (btn.dataset.tab === 'sms-tab') {
      $('#stepPhone')?.classList.add('active');
      $('#stepCode')?.classList.remove('active');
    }
  });
});

$('#togglePasswordBtn')?.addEventListener('click', () => {
  const password = $('#password');
  const button = $('#togglePasswordBtn');
  if (!password || !button) return;
  const show = password.type === 'password';
  password.type = show ? 'text' : 'password';
  button.innerHTML = show ? '<span class="nv-inline-icon nv-icon-eye-off" aria-hidden="true"></span>' : '<span class="nv-inline-icon nv-icon-eye" aria-hidden="true"></span>';
});


let pendingMfaMode = null;

function openMfaModal(mode) {
  pendingMfaMode = mode;
  const modal = $('#mfaModal');
  const setupGroup = $('#mfaSetupSecretGroup');
  const submit = $('#mfaSubmitBtn');
  if (!modal) return;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  if (setupGroup) setupGroup.hidden = mode !== 'setup';
  if ($('#mfaDescription')) {
    $('#mfaDescription').textContent = mode === 'setup'
      ? 'برای نقش‌های کارکنان، احراز هویت دومرحله‌ای اجباری است. کلید را در برنامه Authenticator ثبت و کد شش‌رقمی را وارد کنید.'
      : 'کد برنامه Authenticator یا یکی از کدهای بازیابی را وارد کنید.';
  }
  if (submit) submit.textContent = mode === 'setup' ? 'فعال‌سازی و ورود' : 'تأیید و ورود';
  setTimeout(() => $('#mfaCode')?.focus(), 120);
}

async function beginMfaSetup() {
  const response = await fetch(`${API_BASE}/auth/2fa/setup`, { method: 'POST' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'راه‌اندازی احراز هویت دومرحله‌ای ممکن نشد.');
  if ($('#mfaSetupSecret')) $('#mfaSetupSecret').value = data.secret || '';
  openMfaModal('setup');
}

async function handleLoginResult(response, data, fallbackErrorId) {
  if (response.ok && data?.mfa_required) {
    openMfaModal('verify');
    return true;
  }
  if (response.ok && data?.mfa_setup_required) {
    try { await beginMfaSetup(); } catch (error) { setError(fallbackErrorId, error.message); }
    return true;
  }
  if (response.ok && data.success !== false && data.user) {
    showToast(`خوش آمدید ${data.user?.full_name || data.user?.username || ''}`, 'success');
    setTimeout(() => redirectToDashboard(data.user?.role, { ...data.user, redirect: data.redirect }), 500);
    return true;
  }
  return false;
}

$('#mfaSubmitBtn')?.addEventListener('click', async () => {
  const code = $('#mfaCode')?.value.trim();
  const button = $('#mfaSubmitBtn');
  setError('mfaError', '');
  if (!code) { setError('mfaError', 'کد احراز هویت الزامی است.'); return; }
  setButtonLoading(button, true, 'در حال تأیید...');
  try {
    const endpoint = pendingMfaMode === 'setup' ? '/auth/2fa/enable' : '/auth/2fa/verify-login';
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'کد احراز هویت معتبر نیست.');
    if (Array.isArray(data.recovery_codes) && data.recovery_codes.length) {
      const box = $('#mfaRecoveryCodes');
      box.hidden = false;
      box.innerHTML = '<h3>کدهای بازیابی یک‌بارمصرف</h3><p>این کدها فقط همین یک‌بار نمایش داده می‌شوند. آن‌ها را در محل امن ذخیره کنید.</p><pre dir="ltr"></pre><button type="button" class="btn-secondary" id="mfaContinueBtn">ادامه به پنل</button>';
      box.querySelector('pre').textContent = data.recovery_codes.join('\n');
      button.hidden = true;
      $('#mfaCode').disabled = true;
      $('#mfaContinueBtn').addEventListener('click', () => { window.location.href = data.redirect || '/dashboard'; });
      return;
    }
    showToast(data.message || 'احراز هویت دومرحله‌ای موفق بود.', 'success');
    window.location.href = data.redirect || '/dashboard';
  } catch (error) {
    setError('mfaError', error.message || 'خطا در تأیید احراز هویت دومرحله‌ای.');
  } finally { setButtonLoading(button, false); }
});

$('#passwordLoginForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const username = $('#username')?.value.trim();
  const password = $('#password')?.value;
  const submitBtn = $('#passwordLoginBtn');
  setError('passwordError', '');

  if (!username || !password) {
    setError('passwordError', 'لطفاً نام کاربری و رمز عبور را وارد کنید.');
    return;
  }

  setButtonLoading(submitBtn, true, 'در حال ورود...');
  try {
    const { response, data } = await fetchJson(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ username, password })
    }, REQUEST_TIMEOUT_MS.login);

    if (await handleLoginResult(response, data, 'passwordError')) {
      try {
        if ($('#rememberMe')?.checked) localStorage.setItem('rememberedUsername', username);
        else localStorage.removeItem('rememberedUsername');
      } catch (_) {
        // محدودیت Storage نباید ورود موفق را به خطا تبدیل کند.
      }
      return;
    }
    setError('passwordError', data.message || 'نام کاربری یا رمز عبور اشتباه است.');
  } catch (error) {
    setError(
      'passwordError',
      error?.code === 'REQUEST_TIMEOUT'
        ? 'پاسخ سرویس ورود طولانی شد. وضعیت MySQL و تنظیمات پایگاه داده را بررسی کنید.'
        : (error?.message || 'خطا در ارتباط با سرور.')
    );
  } finally {
    setButtonLoading(submitBtn, false);
  }
});

let countdownTimer = null;
let currentPhone = '';
let forgotResetPhone = '';
let forgotResetToken = '';
let forgotResetStep = 'phone';
let forgotTimerId = null;
let forgotRemainingSeconds = 0;

function startTimer(seconds) {
  const timerText = $('#timerText');
  const resendBtn = $('#resendCodeBtn');
  if (!timerText || !resendBtn) return;
  if (countdownTimer) clearInterval(countdownTimer);
  let remaining = seconds;
  resendBtn.disabled = true;
  timerText.style.display = 'block';
  countdownTimer = setInterval(() => {
    if (remaining <= 0) {
      clearInterval(countdownTimer);
      timerText.textContent = '';
      resendBtn.disabled = false;
      resendBtn.textContent = 'ارسال مجدد کد';
      return;
    }
    const mins = Math.floor(remaining / 60);
    const secs = String(remaining % 60).padStart(2, '0');
    timerText.textContent = `ارسال مجدد کد پس از ${mins}:${secs}`;
    remaining -= 1;
  }, 1000);
}

async function requestOtp(phone, button, errorId) {
  setError(errorId, '');
  setButtonLoading(button, true, 'در حال ارسال...');
  try {
    const response = await fetch(`${API_BASE}/auth/request-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'خطا در ارسال کد');
    currentPhone = phone;
    $('#displayPhone').textContent = phone;
    $('#stepPhone')?.classList.remove('active');
    $('#stepCode')?.classList.add('active');
    startTimer(90);
    showToast('کد تأیید ارسال شد.', 'success');
  } catch (error) {
    setError(errorId, error.message || 'خطا در ارتباط با سرور.');
  } finally {
    setButtonLoading(button, false);
  }
}

$('#sendCodeBtn')?.addEventListener('click', () => {
  const phone = $('#phoneNumber')?.value.trim();
  if (!phone || phone.length < 11) {
    setError('smsError', 'لطفاً شماره تلفن معتبر وارد کنید.');
    return;
  }
  requestOtp(phone, $('#sendCodeBtn'), 'smsError');
});

$('#resendCodeBtn')?.addEventListener('click', () => {
  if (!currentPhone) return;
  requestOtp(currentPhone, $('#resendCodeBtn'), 'verifyError');
});

$('#smsLoginForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const code = $('#verificationCode')?.value.trim();
  const btn = $('#verifyCodeBtn');
  setError('verifyError', '');
  if (!code || code.length !== 6) {
    setError('verifyError', 'لطفاً کد ۶ رقمی را وارد کنید.');
    return;
  }
  setButtonLoading(btn, true, 'در حال ورود...');
  try {
    const response = await fetch(`${API_BASE}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: currentPhone, code })
    });
    const data = await response.json().catch(() => ({}));
    if (await handleLoginResult(response, data, 'verifyError')) return;
    setError('verifyError', data.message || 'کد وارد شده معتبر نیست.');
  } catch (error) {
    setError('verifyError', 'خطا در ارتباط با سرور.');
  } finally {
    setButtonLoading(btn, false);
  }
});

$('#forgotPasswordBtn')?.addEventListener('click', openForgotModal);
$$('[data-close-forgot]').forEach((el) => el.addEventListener('click', closeForgotModal));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeForgotModal();
});

async function sendForgotOtp({ resend = false } = {}) {
  const phone = ($('#forgotEmail')?.value || forgotResetPhone || '').trim();
  const btn = resend ? $('#forgotResendBtn') : $('#submitForgotBtn');
  setError('forgotError', '');
  if (!phone || phone.length < 11) {
    setError('forgotError', 'شماره موبایل معتبر وارد کنید.');
    return false;
  }
  setButtonLoading(btn, true, resend ? 'ارسال...' : 'در حال ارسال...');
  try {
    const response = await fetch(`${API_BASE}/auth/password-reset/request-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) throw new Error(data.message || 'ارسال کد بازیابی انجام نشد.');
    forgotResetPhone = phone;
    forgotResetToken = '';
    setForgotResetStep('code');
    startForgotTimer(90);
    showToast(data.message || 'کد بازیابی ارسال شد.', 'success');
    setTimeout(() => $('#forgotCode')?.focus(), 80);
    return true;
  } catch (error) {
    setError('forgotError', error.message || 'خطا در ارتباط با سرور.');
    return false;
  } finally {
    setButtonLoading(btn, false);
  }
}

async function verifyForgotOtp() {
  const code = $('#forgotCode')?.value.trim();
  const btn = $('#submitForgotBtn');
  setError('forgotError', '');
  if (!code || code.length !== 6) {
    setError('forgotError', 'کد ۶ رقمی را وارد کنید.');
    return;
  }
  setButtonLoading(btn, true, 'در حال تأیید...');
  try {
    const response = await fetch(`${API_BASE}/auth/password-reset/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: forgotResetPhone, code })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false || !data.reset_token) throw new Error(data.message || 'کد تأیید نشد.');
    forgotResetToken = data.reset_token;
    stopForgotTimer();
    setForgotResetStep('password');
    showToast(data.message || 'کد تأیید شد.', 'success');
    setTimeout(() => $('#forgotNewPassword')?.focus(), 80);
  } catch (error) {
    setError('forgotError', error.message || 'خطا در تأیید کد.');
  } finally {
    setButtonLoading(btn, false);
  }
}

async function submitForgotNewPassword() {
  const newPassword = $('#forgotNewPassword')?.value;
  const confirmPassword = $('#forgotConfirmPassword')?.value;
  const btn = $('#submitForgotBtn');
  setError('forgotError', '');
  if (!newPassword || !confirmPassword) {
    setError('forgotError', 'رمز جدید و تکرار آن را وارد کنید.');
    return;
  }
  setButtonLoading(btn, true, 'در حال ثبت...');
  try {
    const response = await fetch(`${API_BASE}/auth/password-reset/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset_token: forgotResetToken, new_password: newPassword, confirm_password: confirmPassword })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) throw new Error(data.message || 'بازنشانی رمز انجام نشد.');
    closeForgotModal();
    showToast(data.message || 'رمز عبور تغییر کرد؛ با رمز جدید وارد شوید.', 'success');
    $('#username')?.focus();
  } catch (error) {
    setError('forgotError', error.message || 'خطا در ثبت رمز جدید.');
  } finally {
    setButtonLoading(btn, false);
  }
}

$('#submitForgotBtn')?.addEventListener('click', async () => {
  if (forgotResetStep === 'phone') return sendForgotOtp();
  if (forgotResetStep === 'code') return verifyForgotOtp();
  return submitForgotNewPassword();
});

$('#forgotResendBtn')?.addEventListener('click', async () => {
  if (forgotRemainingSeconds > 0) return;
  await sendForgotOtp({ resend: true });
});

try {
  const remembered = localStorage.getItem('rememberedUsername');
  if (remembered && $('#username')) {
    $('#username').value = remembered;
    if ($('#rememberMe')) $('#rememberMe').checked = true;
  }
} catch (_) {
  // ورود باید حتی در مرورگرهایی که Storage را محدود کرده‌اند فعال بماند.
}

async function restoreCookieSession() {
  try {
    const { response, data } = await fetchJson(
      `${API_BASE}/auth/check`,
      { headers: { Accept: 'application/json' } },
      REQUEST_TIMEOUT_MS.session
    );
    if (response.ok && data.authenticated === true && data.user?.role) {
      redirectToDashboard(data.user.role, data.user);
    }
  } catch (_) {
    // بررسی نشست قبلی نباید فرم ورود را مسدود کند.
  }
}

window.__NOORVISTA_LOGIN_CONTROLLER_READY__ = true;
void checkServerStatus();
void restoreCookieSession();
