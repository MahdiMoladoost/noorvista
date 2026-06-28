// ============================================
// اسکریپت صفحه لاگین Sadra
// ============================================

const API_BASE = '/api';

// تابع هدایت به پنل مناسب
function redirectToPanel(role) {
    const panelUrls = {
        'system_admin': '/dashboard/panel/admin/index.html',
        'clinic_manager': '/dashboard/clinic-manager/index.html',
        'doctor': '/dashboard/panel/doctor/index.html',
        'receptionist': '/dashboard/panel/reception/index.html',
        'patient': '/dashboard/panel/patient/index.html'
    };
    window.location.href = panelUrls[role] || '/';
}

// تابع نمایش/مخفی کردن رمز عبور
window.togglePassword = function(fieldId) {
    const field = document.getElementById(fieldId);
    const icon = field.parentElement.querySelector('.toggle-password i');
    if (field.type === 'password') {
        field.type = 'text';
        icon.className = 'icon-eye-slash';
    } else {
        field.type = 'password';
        icon.className = 'icon-eye';
    }
};

// ==================== تب‌ها ====================
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        const tabId = this.getAttribute('data-tab');
        document.getElementById(tabId).classList.add('active');
        
        if (tabId === 'sms-tab') {
            document.getElementById('stepPhone').style.display = 'block';
            document.getElementById('stepCode').style.display = 'none';
        }
    });
});

// ==================== ورود با رمز عبور ====================
document.getElementById('passwordLoginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('passwordError');
    
    if (!username || !password) {
        errorDiv.textContent = 'لطفاً نام کاربری و رمز عبور را وارد کنید';
        errorDiv.classList.add('show');
        return;
    }
    
    errorDiv.classList.remove('show');
    
    const submitBtn = document.getElementById('passwordLoginBtn');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<span class="loading-spinner"></span> در حال ورود...';
    submitBtn.disabled = true;
    
    try {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success !== false && data.user) {
            void 0;
            localStorage.setItem('user', JSON.stringify(data.user));
            
            if (document.getElementById('rememberMe')?.checked) {
                localStorage.setItem('rememberedUsername', username);
            }
            
            Swal.fire({
                icon: 'success',
                title: 'ورود موفق',
                text: `خوش آمدید ${data.user.full_name || username}`,
                timer: 1500,
                showConfirmButton: false
            }).then(() => {
                redirectToPanel(data.user.role);
            });
        } else {
            errorDiv.textContent = data.message || 'نام کاربری یا رمز عبور اشتباه است';
            errorDiv.classList.add('show');
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    } catch (error) {
        console.error('Login error:', error);
        errorDiv.textContent = 'خطا در ارتباط با سرور';
        errorDiv.classList.add('show');
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
});

// ==================== ورود با پیامک ====================
let countdownTimer = null;
let currentPhone = '';

// ارسال کد تأیید
document.getElementById('sendCodeBtn')?.addEventListener('click', async () => {
    const phone = document.getElementById('phoneNumber').value.trim();
    const errorDiv = document.getElementById('smsError');
    
    if (!phone || phone.length < 11) {
        errorDiv.textContent = 'لطفاً شماره تلفن معتبر وارد کنید';
        errorDiv.classList.add('show');
        return;
    }
    
    errorDiv.classList.remove('show');
    currentPhone = phone;
    
    const btn = document.getElementById('sendCodeBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="loading-spinner"></span> در حال ارسال...';
    btn.disabled = true;
    
    try {
        const response = await fetch(`${API_BASE}/auth/request-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            document.getElementById('displayPhone').innerText = phone;
            document.getElementById('stepPhone').style.display = 'none';
            document.getElementById('stepCode').style.display = 'block';
            startTimer(90);
            
            Swal.fire({
                icon: 'success',
                title: 'کد ارسال شد',
                text: `کد تأیید به شماره ${phone} ارسال شد`,
                timer: 2000,
                showConfirmButton: false
            });
        } else {
            errorDiv.textContent = data.message || 'خطا در ارسال کد';
            errorDiv.classList.add('show');
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    } catch (error) {
        console.error('Send code error:', error);
        errorDiv.textContent = 'خطا در ارتباط با سرور';
        errorDiv.classList.add('show');
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
});

// تایمر ارسال مجدد
function startTimer(seconds) {
    const timerText = document.getElementById('timerText');
    const resendBtn = document.getElementById('resendCodeBtn');
    
    if (countdownTimer) clearInterval(countdownTimer);
    let remaining = seconds;
    
    resendBtn.disabled = true;
    timerText.style.display = 'block';
    
    countdownTimer = setInterval(() => {
        if (remaining <= 0) {
            clearInterval(countdownTimer);
            timerText.style.display = 'none';
            resendBtn.disabled = false;
            resendBtn.textContent = 'ارسال مجدد کد';
        } else {
            const mins = Math.floor(remaining / 60);
            const secs = remaining % 60;
            timerText.textContent = `ارسال مجدد کد پس از ${mins}:${secs.toString().padStart(2, '0')}`;
            remaining--;
        }
    }, 1000);
}

// ارسال مجدد کد
document.getElementById('resendCodeBtn')?.addEventListener('click', async () => {
    const errorDiv = document.getElementById('verifyError');
    const btn = document.getElementById('resendCodeBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="loading-spinner"></span> در حال ارسال...';
    
    try {
        const response = await fetch(`${API_BASE}/auth/request-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: currentPhone })
        });
        
        if (response.ok) {
            startTimer(90);
            Swal.fire({
                icon: 'success',
                title: 'کد مجدد ارسال شد',
                timer: 1500,
                showConfirmButton: false
            });
        } else {
            const data = await response.json();
            errorDiv.textContent = data.message || 'خطا در ارسال مجدد کد';
            errorDiv.classList.add('show');
            btn.disabled = false;
            btn.innerHTML = 'ارسال مجدد کد';
        }
    } catch (error) {
        errorDiv.textContent = 'خطا در ارتباط با سرور';
        errorDiv.classList.add('show');
        btn.disabled = false;
        btn.innerHTML = 'ارسال مجدد کد';
    }
});

// تأیید کد و ورود
document.getElementById('verifyCodeBtn')?.addEventListener('click', async () => {
    const code = document.getElementById('verificationCode').value.trim();
    const errorDiv = document.getElementById('verifyError');
    
    if (!code || code.length !== 6) {
        errorDiv.textContent = 'لطفاً کد ۶ رقمی را وارد کنید';
        errorDiv.classList.add('show');
        return;
    }
    
    errorDiv.classList.remove('show');
    
    const btn = document.getElementById('verifyCodeBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="loading-spinner"></span> در حال ورود...';
    btn.disabled = true;
    
    try {
        const response = await fetch(`${API_BASE}/auth/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: currentPhone, code })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success !== false && data.user) {
            void 0;
            localStorage.setItem('user', JSON.stringify(data.user));
            
            Swal.fire({
                icon: 'success',
                title: 'ورود موفق',
                text: `خوش آمدید ${data.user.full_name || 'کاربر گرامی'}`,
                timer: 1500,
                showConfirmButton: false
            }).then(() => {
                redirectToPanel(data.user.role);
            });
        } else {
            errorDiv.textContent = data.message || 'کد نامعتبر است';
            errorDiv.classList.add('show');
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    } catch (error) {
        console.error('Verify error:', error);
        errorDiv.textContent = 'خطا در ارتباط با سرور';
        errorDiv.classList.add('show');
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
});

// بررسی وضعیت سرور
async function checkServerStatus() {
    const statusDiv = document.getElementById('serverStatus');
    if (!statusDiv) return;
    
    try {
        const response = await fetch(`${API_BASE}/health`);
        if (response.ok) {
            statusDiv.className = 'server-status online';
            statusDiv.hidden = true;
        } else {
            throw new Error('Server error');
        }
    } catch (error) {
        statusDiv.className = 'server-status offline';
        statusDiv.innerHTML = 'سرور در دسترس نیست! لطفاً سرور را راه‌اندازی کنید';
    }
}

// بارگذاری کاربر ذخیره شده
const remembered = localStorage.getItem('rememberedUsername');
if (remembered && document.getElementById('username')) {
    document.getElementById('username').value = remembered;
    document.getElementById('rememberMe').checked = true;
}

// بررسی توکن قبلی
const savedToken = null; // authentication state is held in HttpOnly cookies
if (savedToken) {
    fetch(`${API_BASE}/auth/me`, {
        headers: { 'Authorization': `Bearer ${savedToken}` }
    })
    .then(res => {
        if (res.ok) return res.json();
        throw new Error('Token invalid');
    })
    .then(user => {
        redirectToPanel(user.role);
    })
    .catch(() => {
        void 0;
        localStorage.removeItem('user');
        checkServerStatus();
    });
} else {
    checkServerStatus();
}