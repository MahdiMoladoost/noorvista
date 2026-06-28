// js/moladental-auth.js
// ============================================
// توابع احراز هویت سمت کاربر (Frontend)
// ============================================

const API_BASE = '/api';

/**
 * سازگاری با کدهای قدیمی؛ نشست فقط در کوکی HttpOnly نگهداری می‌شود.
 * @returns {null}
 */
function getToken() {
    return null;
}

function setToken() {
    // Intentionally empty: bearer tokens must never be stored in Web Storage.
}

/**
 * حذف توکن از localStorage
 */
function removeToken() {
    void 0;
    localStorage.removeItem('user');
}

/**
 * دریافت اطلاعات کاربر ذخیره شده
 * @returns {Object|null}
 */
function getStoredUser() {
    const userStr = localStorage.getItem('user');
    if (!userStr) return null;
    try {
        return JSON.parse(userStr);
    } catch (e) {
        return null;
    }
}

/**
 * ذخیره اطلاعات کاربر
 * @param {Object} user 
 */
function storeUser(user) {
    localStorage.setItem('user', JSON.stringify(user));
}

/**
 * بررسی وضعیت احراز هویت
 * @returns {boolean}
 */
function isAuthenticated() {
    return !!getStoredUser();
}

/**
 * دریافت نقش کاربر
 * @returns {string|null}
 */
function getUserRole() {
    const user = getStoredUser();
    return user?.role || null;
}

/**
 * دریافت نام کامل کاربر
 * @returns {string|null}
 */
function getUserFullName() {
    const user = getStoredUser();
    return user?.full_name || user?.username || null;
}

/**
 * دریافت شناسه کاربر
 * @returns {number|null}
 */
function getUserId() {
    const user = getStoredUser();
    return user?.id || null;
}

/**
 * ورود به سیستم
 * @param {string} username - نام کاربری یا ایمیل
 * @param {string} password - رمز عبور
 * @returns {Promise<Object>}
 */
async function login(username, password) {
    try {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password }),
            credentials: 'include' // برای ارسال کوکی
        });
        
        const data = await response.json();
        
        if (!response.ok || !data.success) {
            throw new Error(data.message || 'خطا در ورود به سیستم');
        }
        
        // فقط اطلاعات نمایشی غیرحساس ذخیره می‌شود؛ نشست در کوکی HttpOnly است.
        if (data.user) {
            storeUser(data.user);
        }
        
        return data;
        
    } catch (error) {
        console.error('Login error:', error);
        throw error;
    }
}

/**
 * ورود با OTP (کد پیامکی)
 * @param {string} phone - شماره تلفن
 * @returns {Promise<Object>}
 */
async function requestOTP(phone) {
    const response = await fetch(`${API_BASE}/auth/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
    });
    
    const data = await response.json();
    
    if (!response.ok || !data.success) {
        throw new Error(data.message || 'خطا در ارسال کد');
    }
    
    return data;
}

/**
 * تأیید OTP و ورود
 * @param {string} phone - شماره تلفن
 * @param {string} code - کد تأیید
 * @returns {Promise<Object>}
 */
async function verifyOTP(phone, code) {
    const response = await fetch(`${API_BASE}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code }),
        credentials: 'include'
    });
    
    const data = await response.json();
    
    if (!response.ok || !data.success) {
        throw new Error(data.message || 'کد نامعتبر است');
    }
    
    if (data.user) {
        storeUser(data.user);
    }
    
    return data;
}

/**
 * خروج از سیستم
 * @returns {Promise<void>}
 */
async function logout() {
    try {
        await fetch(`${API_BASE}/auth/logout`, {
            method: 'POST',
            credentials: 'include'
        });
    } catch (error) {
        console.error('Logout error:', error);
    } finally {
        removeToken();
        window.location.href = '/login.html';
    }
}

/**
 * دریافت اطلاعات کاربر جاری از سرور
 * @returns {Promise<Object|null>}
 */
async function fetchCurrentUser() {
    try {
        const response = await fetch(`${API_BASE}/auth/me`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch user');
        }
        
        const data = await response.json();
        
        if (data.success && data.user) {
            storeUser(data.user);
            return data.user;
        }
        
        return null;
        
    } catch (error) {
        console.error('Fetch user error:', error);
        removeToken();
        return null;
    }
}

/**
 * تغییر رمز عبور
 * @param {string} oldPassword - رمز فعلی
 * @param {string} newPassword - رمز جدید
 * @param {string} confirmPassword - تکرار رمز جدید
 * @returns {Promise<Object>}
 */
async function changePassword(oldPassword, newPassword, confirmPassword) {
    const token = getToken();
    
    const response = await fetch(`${API_BASE}/auth/change-password`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword, confirm_password: confirmPassword }),
        credentials: 'include'
    });
    
    const data = await response.json();
    
    if (!response.ok || !data.success) {
        throw new Error(data.message || 'خطا در تغییر رمز عبور');
    }
    
    return data;
}

/**
 * درخواست بازیابی رمز عبور
 * @param {string} email - ایمیل کاربر
 * @returns {Promise<Object>}
 */
async function forgotPassword(email) {
    const response = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
    });
    
    const data = await response.json();
    
    if (!response.ok || !data.success) {
        throw new Error(data.message || 'خطا در ارسال لینک بازیابی');
    }
    
    return data;
}

/**
 * بازنشانی رمز عبور
 * @param {string} token - توکن بازیابی
 * @param {string} newPassword - رمز جدید
 * @param {string} confirmPassword - تکرار رمز جدید
 * @returns {Promise<Object>}
 */
async function resetPassword(token, newPassword, confirmPassword) {
    const response = await fetch(`${API_BASE}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: newPassword, confirm_password: confirmPassword })
    });
    
    const data = await response.json();
    
    if (!response.ok || !data.success) {
        throw new Error(data.message || 'خطا در بازنشانی رمز عبور');
    }
    
    return data;
}

/**
 * هدایت به پنل مناسب بر اساس نقش کاربر
 * @param {string} role - نقش کاربر
 */
function redirectToDashboard(role) {
    const redirects = {
        system_admin: '/dashboard/panel/admin/index.html',
        clinic_admin: '/dashboard/panel/clinic-admin/index.html',
        doctor: '/dashboard/panel/doctor/index.html',
        receptionist: '/dashboard/panel/reception/index.html',
        patient: '/dashboard/panel/patient/index.html'
    };
    
    const url = redirects[role] || '/';
    window.location.href = url;
}

/**
 * بررسی خودکار احراز هویت و هدایت
 * @returns {Promise<boolean>}
 */
async function checkAuthAndRedirect() {
    const token = getToken();
    
    if (!token) {
        if (!window.location.pathname.includes('login.html')) {
            window.location.href = '/login.html';
        }
        return false;
    }
    
    try {
        const user = await fetchCurrentUser();
        
        if (!user) {
            removeToken();
            if (!window.location.pathname.includes('login.html')) {
                window.location.href = '/login.html';
            }
            return false;
        }
        
        // اگر در صفحه لاگین هستیم، به پنل مناسب هدایت کن
        if (window.location.pathname.includes('login.html')) {
            redirectToDashboard(user.role);
        }
        
        return true;
        
    } catch (error) {
        console.error('Auth check error:', error);
        return false;
    }
}

/**
 * نمایش پیغام خطا/موفقیت
 * @param {string} message - متن پیغام
 * @param {string} type - نوع پیغام (success, error, warning, info)
 */
function showAuthMessage(message, type = 'error') {
    // حذف توست قبلی
    const existingToast = document.querySelector('.auth-toast');
    if (existingToast) existingToast.remove();
    
    const colors = {
        success: '#10b981',
        error: '#ef4444',
        warning: '#f59e0b',
        info: '#3b82f6'
    };
    
    const toast = document.createElement('div');
    toast.className = 'auth-toast';
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: ${colors[type] || colors.error};
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        z-index: 10000;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        direction: rtl;
        animation: slideInRight 0.3s ease;
    `;
    toast.innerHTML = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// اضافه کردن استایل‌های انیمیشن
if (!document.querySelector('#auth-toast-styles')) {
    const style = document.createElement('style');
    style.id = 'auth-toast-styles';
    style.textContent = `
        @keyframes slideInRight {
            from { transform: translateX(100px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOutRight {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100px); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
}

// صادر کردن توابع
window.SadraAuth = {
    getToken,
    setToken,
    removeToken,
    getStoredUser,
    storeUser,
    isAuthenticated,
    getUserRole,
    getUserFullName,
    getUserId,
    login,
    requestOTP,
    verifyOTP,
    logout,
    fetchCurrentUser,
    changePassword,
    forgotPassword,
    resetPassword,
    redirectToDashboard,
    checkAuthAndRedirect,
    showAuthMessage
};