const API_BASE = '/api';

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
  return String(role).trim();
}

function redirectToDashboard(role, user = {}) {
  const normalizedRole = normalizeRole(role || user.role);
  const panelUrls = {
    system_admin: '/dashboard/admin',
    admin: '/dashboard/admin',
    clinic_manager: '/dashboard/clinic-manager/index.html',
    doctor: '/dashboard/doctor',
    receptionist: '/dashboard/secretary',
    reception: '/dashboard/secretary',
    secretary: '/dashboard/secretary',
    staff: '/dashboard/secretary',
    patient: '/dashboard/patient',
    'پزشک': '/dashboard/doctor',
    'بیمار': '/dashboard/patient'
  };
  window.location.href = panelUrls[normalizedRole] || '/dashboard/patient';
}

function openForgotModal() {
  const modal = $('#forgotPasswordModal');
  if (!modal) return;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  setTimeout(() => $('#forgotEmail')?.focus(), 120);
}

function closeForgotModal() {
  const modal = $('#forgotPasswordModal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  setError('forgotError', '');
}

async function checkServerStatus() {
  const statusDiv = $('#serverStatus');
  if (!statusDiv) return;
  try {
    const response = await fetch(`${API_BASE}/health`, { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (response.ok && data.status === 'ok') {
      statusDiv.className = 'server-status online';
      statusDiv.textContent = data.mysql ? '✅ سرور و دیتابیس متصل هستند' : '✅ سرور متصل است';
    } else {
      throw new Error('Server error');
    }
  } catch (error) {
    statusDiv.className = 'server-status offline';
    statusDiv.textContent = '❌ سرور در دسترس نیست؛ لطفاً اجرا بودن backend را بررسی کنید';
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

$('#defaultLoginsToggle')?.addEventListener('click', () => {
  const grid = $('#defaultLoginsGrid');
  const btn = $('#defaultLoginsToggle');
  if (!grid || !btn) return;
  const isOpen = grid.style.display !== 'none';
  grid.style.display = isOpen ? 'none' : 'grid';
  btn.setAttribute('aria-expanded', String(!isOpen));
});

$$('.default-login-item').forEach((item) => {
  item.addEventListener('click', () => {
    $('#username').value = item.dataset.username || '';
    $('#password').value = item.dataset.password || '';
    showToast('اطلاعات ورود در فرم قرار گرفت.', 'success');
  });
});

$('#togglePasswordBtn')?.addEventListener('click', () => {
  const password = $('#password');
  const button = $('#togglePasswordBtn');
  if (!password || !button) return;
  const show = password.type === 'password';
  password.type = show ? 'text' : 'password';
  button.textContent = show ? '🙈' : '👁';
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
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await response.json().catch(() => ({}));

    if (response.ok && data.token) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user || {}));
      if ($('#rememberMe')?.checked) localStorage.setItem('rememberedUsername', username);
      else localStorage.removeItem('rememberedUsername');
      showToast(`خوش آمدید ${data.user?.full_name || username}`, 'success');
      setTimeout(() => redirectToDashboard(data.user?.role, data.user), 500);
      return;
    }
    setError('passwordError', data.message || 'نام کاربری یا رمز عبور اشتباه است.');
  } catch (error) {
    setError('passwordError', 'خطا در ارتباط با سرور.');
  } finally {
    setButtonLoading(submitBtn, false);
  }
});

let countdownTimer = null;
let currentPhone = '';

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
    if (response.ok && data.token) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user || {}));
      showToast('ورود موفق بود.', 'success');
      setTimeout(() => redirectToDashboard(data.user?.role, data.user), 500);
      return;
    }
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

$('#submitForgotBtn')?.addEventListener('click', async () => {
  const identifier = $('#forgotEmail')?.value.trim();
  const btn = $('#submitForgotBtn');
  setError('forgotError', '');
  if (!identifier) {
    setError('forgotError', 'لطفاً نام کاربری یا ایمیل را وارد کنید.');
    return;
  }
  setButtonLoading(btn, true, 'در حال ارسال...');
  try {
    const response = await fetch(`${API_BASE}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: identifier, username: identifier })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) throw new Error(data.message || 'امکان ارسال درخواست بازیابی وجود ندارد.');
    closeForgotModal();
    showToast(data.message || 'درخواست بازیابی رمز عبور ثبت شد.', 'success');
    if (data.reset_token) console.info('Reset token:', data.reset_token);
  } catch (error) {
    setError('forgotError', error.message || 'خطا در ارتباط با سرور.');
  } finally {
    setButtonLoading(btn, false);
  }
});

const remembered = localStorage.getItem('rememberedUsername');
if (remembered && $('#username')) {
  $('#username').value = remembered;
  if ($('#rememberMe')) $('#rememberMe').checked = true;
}

const savedToken = localStorage.getItem('token');
if (savedToken) {
  fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${savedToken}` }, cache: 'no-store' })
    .then((res) => {
      if (!res.ok) throw new Error('invalid token');
      return res.json();
    })
    .then((data) => {
      const user = data.user || data;
      if (user && user.role) redirectToDashboard(user.role, user);
      else throw new Error('invalid user');
    })
    .catch(() => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      checkServerStatus();
    });
} else {
  checkServerStatus();
}


// Fill login form from the separated default credentials card
document.addEventListener("click", function (event) {
  const item = event.target.closest(".login-demo-side [data-username]");
  if (!item) return;

  const username = item.getAttribute("data-username");
  const password = item.getAttribute("data-password") || "Admin@123456";

  const usernameInput =
    document.querySelector("#username") ||
    document.querySelector('input[name="username"]') ||
    document.querySelector('input[type="text"]');

  const passwordInput =
    document.querySelector("#password") ||
    document.querySelector('input[name="password"]') ||
    document.querySelector('input[type="password"]');

  if (usernameInput) {
    usernameInput.value = username;
    usernameInput.dispatchEvent(new Event("input", { bubbles: true }));
  }

  if (passwordInput) {
    passwordInput.value = password;
    passwordInput.dispatchEvent(new Event("input", { bubbles: true }));
  }
});
