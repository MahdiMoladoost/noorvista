// ============================================
// Sadra - PANEL COMMON FUNCTIONS
// توابع مشترک تمام پنل‌های مدیریتی
// ============================================

// ========== توابع API ==========
// Authentication is cookie-only. Legacy token helpers intentionally return no bearer token.
function getToken() { return ''; }
function setToken() { /* Access/refresh tokens are HttpOnly cookies. */ }

let panelUserCache = null;

function getUser() {
    return panelUserCache;
}

function normalizeApiUrl(endpoint) {
    let cleanEndpoint = String(endpoint || '');
    if (/^https?:\/\//.test(cleanEndpoint)) return cleanEndpoint;
    if (cleanEndpoint.startsWith('/api/')) return cleanEndpoint;
    if (cleanEndpoint.startsWith('api/')) return `/${cleanEndpoint}`;
    cleanEndpoint = cleanEndpoint.replace(/^\/+/, '');
    return `/api/${cleanEndpoint}`;
}

async function apiRequest(endpoint, method = 'GET', data = null) {
    const normalizedMethod = String(method || 'GET').toUpperCase();
    const options = {
        method: normalizedMethod,
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' }
    };

    if (data !== null && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(normalizedMethod)) {
        options.headers['Content-Type'] = 'application/json';
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
        throw error;
    }

    if (!response.ok || result.success === false) {
        const error = new Error(result.message || `خطای سرور (${response.status})`);
        error.status = response.status;
        error.payload = result;
        throw error;
    }

    return result;
}

// ========== توابع نمایشی ==========
function showToast(message, type = 'success') {
    // حذف توست قبلی
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : type === 'warning' ? '#f59e0b' : '#3b82f6'};
        color: white;
        padding: 12px 24px;
        border-radius: 12px;
        z-index: 100000;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 10px 25px rgba(0,0,0,0.1);
        animation: slideInLeft 0.3s ease;
        direction: rtl;
    `;
    toast.textContent = String(message || '');
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOutLeft 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ========== رندر جدول ==========
function renderTable(tableId, data, columns, actions = []) {
    const table = document.getElementById(tableId);
    if (!table) return;
    
    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    
    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="100%" class="text-center" style="text-align:center; padding:40px;">هیچ داده‌ای یافت نشد</td></tr>';
        return;
    }
    
    tbody.innerHTML = data.map(item => {
        let row = '<tr>';
        
        columns.forEach(col => {
            let value = item[col.key];
            
            if (col.type === 'date' && value) {
                value = toJalali(value);
            } else if (col.type === 'price' && value) {
                value = formatPrice(value);
            } else if (col.type === 'badge') {
                const badgeClass = col.badgeClass?.[value] || `badge-${value}`;
                const badgeText = col.badgeText?.[value] || value;
                value = `<span class="badge ${badgeClass}">${badgeText}</span>`;
            }
            
            row += `<td style="padding:12px;">${value || '-'}</td>`;
        });
        
        if (actions.length > 0) {
            row += '<td class="action-buttons" style="padding:12px;">';
            actions.forEach(action => {
                row += `<button class="btn btn-sm ${action.class}" onclick="${action.handler}(${item.id})"><i class="${action.icon}"></i> ${action.label}</button> `;
            });
            row += '</td>';
        }
        
        row += '</tr>';
        return row;
    }).join('');
}

// ========== توابع مودال ==========
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('show');
        modal.style.display = 'flex';
    }
}

function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
    }
}

function closeModal(modalId) {
    hideModal(modalId);
}

// ========== خروج از سیستم ==========
async function logout() {
    if (typeof window.noorvistaLogout === 'function') return window.noorvistaLogout();
    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); } catch (_) {}
    try { localStorage.removeItem('user'); } catch (_) {}
    window.location.replace('/login');
}

// Legacy callers expect a synchronous boolean. The real cookie session check is started in parallel.
function checkAuth() {
    if (window.SadraPanel?.initPage) void window.SadraPanel.initPage();
    return true;
}

// ========== نمایش اطلاعات کاربر ==========
function loadUserInfo() {
    const user = getUser();
    if (user) {
        document.querySelectorAll('.user-name').forEach(el => {
            el.textContent = user.full_name || user.username || 'کاربر';
        });
        document.querySelectorAll('.user-avatar').forEach(el => {
            const name = user.full_name || user.username || 'کاربر';
            el.textContent = name.charAt(0);
        });
    }
}

// ========== فراخوانی اولیه ==========
document.addEventListener('DOMContentLoaded', () => {
    loadUserInfo();
    
    document.querySelectorAll('.logout-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    });
    
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal-overlay');
            if (modal) hideModal(modal.id);
        });
    });
    
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) hideModal(modal.id);
        });
    });
});

// انیمیشن‌های CSS
if (!document.querySelector('#toast-styles')) {
    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.textContent = `
        @keyframes slideInLeft {
            from { transform: translateX(100px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOutLeft {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100px); opacity: 0; }
        }
        .text-center { text-align: center; }
        .text-muted { color: #6c757d; }
    `;
    document.head.appendChild(style);
}

/* ==== Sadra PANEL GLOBAL HELPERS START ==== */
(function () {
    'use strict';

    const PANEL_ROLES = {
        admin: new Set(['system_admin', 'admin', 'super_admin', 'site_admin', 'owner']),
        'clinic-admin': new Set(['clinic_admin', 'clinic_manager', 'manager', 'system_admin', 'admin']),
        doctor: new Set(['doctor', 'system_admin', 'admin']),
        reception: new Set(['receptionist', 'reception', 'secretary', 'staff', 'clinic_admin', 'clinic_manager', 'system_admin', 'admin']),
        patient: new Set(['patient', 'system_admin', 'admin'])
    };

    function normalizeRole(role) {
        return String(role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    }

    function panelRole() {
        return String(document.body?.dataset?.panelRole || '').trim().toLowerCase();
    }

    function roleHome(role) {
        const normalized = normalizeRole(role);
        if (['system_admin', 'admin', 'super_admin', 'site_admin', 'owner'].includes(normalized)) {
            return '/dashboard/panel/admin/index.html';
        }
        if (['clinic_admin', 'clinic_manager', 'manager'].includes(normalized)) {
            return '/dashboard/panel/clinic-admin/index.html';
        }
        if (normalized === 'doctor') return '/dashboard/panel/doctor/index.html';
        if (['receptionist', 'reception', 'secretary', 'staff'].includes(normalized)) {
            return '/dashboard/panel/reception/index.html';
        }
        if (normalized === 'patient') return '/dashboard/panel/patient/index.html';
        return '/';
    }

    function clearCachedIdentity() {
        panelUserCache = null;
        ['token', 'authToken', 'noorvista_token', 'user', 'currentUser', 'authUser'].forEach((key) => {
            try {
                localStorage.removeItem(key);
                sessionStorage.removeItem(key);
            } catch (_) {}
        });
    }

    function redirectToLogin(message) {
        clearCachedIdentity();
        if (message) {
            try { localStorage.setItem('loginMessage', message); } catch (_) {}
        }
        window.location.replace('/login');
    }

    function setPanelUserInfo(user) {
        if (!user) return;
        const name = user.full_name || user.username || 'کاربر صدرا';
        document.querySelectorAll('.user-name,[data-nv3-user-name]').forEach(el => { el.textContent = name; });
        document.querySelectorAll('.user-avatar,[data-nv3-user-avatar]').forEach(el => {
            const parts = String(name).trim().split(/\s+/).filter(Boolean);
            el.textContent = `${parts[0]?.[0] || ''}${parts[1]?.[0] || ''}` || 'NV';
        });
    }

    async function logout() {
        if (typeof window.noorvistaLogout === 'function') return window.noorvistaLogout();
        try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); } catch (_) {}
        redirectToLogin('با موفقیت خارج شدید.');
    }

    function bindPanelLogout() {
        document.querySelectorAll('.logout-btn,[data-nv3-logout]').forEach(btn => {
            if (btn.dataset.boundLogout === '1') return;
            btn.dataset.boundLogout = '1';
            btn.addEventListener('click', function (event) {
                event.preventDefault();
                void logout();
            });
        });
    }

    let sessionCheckPromise = null;

    async function checkSession(options = {}) {
        try {
            const response = await fetch('/api/auth/me', {
                method: 'GET',
                credentials: 'same-origin',
                cache: 'no-store',
                headers: { Accept: 'application/json' }
            });
            const result = await response.json().catch(() => ({}));

            if (response.status === 401) {
                redirectToLogin(result.message || 'نشست شما معتبر نیست. لطفاً دوباره وارد شوید.');
                return false;
            }

            // A temporary rate-limit/server error is not an authentication failure.
            // Keep the current page and cached identity instead of clearing the
            // session and sending the user to the login screen.
            if (!response.ok || !result.success || !result.user) {
                const cachedUser = getUser();
                if (response.status === 429 && cachedUser) {
                    setPanelUserInfo(cachedUser);
                    bindPanelLogout();
                    if (!window.__nvRateLimitSessionNoticeShown) {
                        window.__nvRateLimitSessionNoticeShown = true;
                        showToast(result.message || 'ارتباط موقتاً محدود شده است؛ صفحه بدون خروج از حساب ادامه می‌دهد.', 'warning');
                        window.setTimeout(() => { window.__nvRateLimitSessionNoticeShown = false; }, 60000);
                    }
                    return true;
                }
                const error = new Error(result.message || `خطا در بررسی نشست (${response.status})`);
                error.status = response.status;
                throw error;
            }

            const actualRole = normalizeRole(result.user.role);
            const expectedPanel = String(options.panelRole || panelRole()).toLowerCase();
            const explicitRoles = Array.isArray(options.roles)
                ? new Set(options.roles.map(normalizeRole))
                : null;
            const allowed = explicitRoles || PANEL_ROLES[expectedPanel];

            if (allowed && !allowed.has(actualRole)) {
                const destination = roleHome(actualRole);
                if (destination && destination !== window.location.pathname) {
                    window.location.replace(destination);
                }
                return false;
            }

            panelUserCache = result.user;
            setPanelUserInfo(result.user);
            bindPanelLogout();
            window.dispatchEvent(new CustomEvent('noorvista:session-ready', { detail: { user: result.user } }));
            return true;
        } catch (error) {
            console.error('Panel session check failed:', error);
            if (typeof window.showToast === 'function') {
                window.showToast('ارتباط با سرور برای بررسی نشست برقرار نشد.', 'error');
            }
            return false;
        }
    }

    function initPage(options = {}) {
        if (!sessionCheckPromise) sessionCheckPromise = checkSession(options);
        return sessionCheckPromise;
    }

    document.addEventListener('DOMContentLoaded', () => {
        if (document.body?.dataset?.panelRole) void initPage();
    });

    window.SadraPanel = Object.assign(window.SadraPanel || {}, {
        initPage,
        logout,
        redirectToLogin,
        setPanelUserInfo,
        bindPanelLogout,
        normalizeRole,
        roleHome
    });

    window.initPage = initPage;
    window.redirectToLogin = redirectToLogin;
    window.setPanelUserInfo = setPanelUserInfo;
    window.bindPanelLogout = bindPanelLogout;
})();
/* ==== Sadra PANEL GLOBAL HELPERS END ==== */



/* Sadra 2.1.85 — durable global helpers for legacy inline dashboard pages */
(function () {
    'use strict';
    const faDigits = '۰۱۲۳۴۵۶۷۸۹';
    const arDigits = '٠١٢٣٤٥٦٧٨٩';
    if (typeof window.toPersianNumber !== 'function') {
        window.toPersianNumber = function toPersianNumber(value) {
            return String(value ?? '').replace(/\d/g, digit => faDigits[Number(digit)]);
        };
    }
    if (typeof window.toEnglishNumber !== 'function') {
        window.toEnglishNumber = function toEnglishNumber(value) {
            return String(value ?? '')
                .replace(/[۰-۹]/g, digit => String(faDigits.indexOf(digit)))
                .replace(/[٠-٩]/g, digit => String(arDigits.indexOf(digit)));
        };
    }
    if (typeof window.escapeHtml !== 'function') {
        window.escapeHtml = function escapeHtml(value) {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        };
    }
    if (typeof window.localizeApiMessage !== 'function') {
        window.localizeApiMessage = function localizeApiMessage(message, fallback = 'عملیات انجام نشد. لطفاً دوباره تلاش کنید.') {
            const raw = String(message || fallback);
            const lower = raw.toLowerCase();
            if (/please fill out this field|fill out this field|required/.test(lower)) return 'پر کردن این فیلد الزامی است.';
            if (/invalid email/.test(lower)) return 'ایمیل واردشده معتبر نیست.';
            if (/failed to fetch|networkerror|load failed/.test(lower)) return 'ارتباط با سرور برقرار نشد.';
            if (/forbidden|access denied|permission|not authorized/.test(lower)) return 'شما دسترسی لازم برای انجام این عملیات را ندارید.';
            if (/cannot be null|not null/.test(lower)) return 'برخی فیلدهای ضروری خالی مانده‌اند.';
            return window.toPersianNumber(raw);
        };
    }
})();

/* NOORVISTA unified pretty selects loader */
(function(){
  if (!/\/dashboard\//i.test(location.pathname)) return;
  if (!document.querySelector('link[href="/assets/css/panel-pretty-selects-global.css"]')) {
    var l=document.createElement('link');
    l.rel='stylesheet';
    l.href='/assets/css/panel-pretty-selects-global.css';
    document.head.appendChild(l);
  }
  if (!window.__NOORVISTA_PRETTY_SELECT_LOADER_SCRIPT__ && !document.querySelector('script[src="/assets/js/panel-pretty-selects-global.js"]')) {
    window.__NOORVISTA_PRETTY_SELECT_LOADER_SCRIPT__ = true;
    var s=document.createElement('script');
    s.src='/assets/js/panel-pretty-selects-global.js';
    s.defer=true;
    document.head.appendChild(s);
  }
})();

