// ============================================
// NoorVista - PANEL COMMON FUNCTIONS
// توابع مشترک تمام پنل‌های مدیریتی
// ============================================

// ========== توابع API ==========
function getToken() {
    return localStorage.getItem('token');
}

function setToken(token) {
    localStorage.setItem('token', token);
}

function getUser() {
    const userStr = localStorage.getItem('user');
    if (!userStr) return null;
    try {
        return JSON.parse(userStr);
    } catch(e) {
        return null;
    }
}

async function apiRequest(endpoint, method = 'GET', data = null) {
    // پشتیبانی از هر دو قرارداد قدیمی و جدید:
    // apiRequest('/admin/settings') و apiRequest('/api/admin/settings')
    let cleanEndpoint = String(endpoint || '');
    let url;
    if (/^https?:\/\//.test(cleanEndpoint)) {
        url = cleanEndpoint;
    } else if (cleanEndpoint.startsWith('/api/')) {
        url = cleanEndpoint;
    } else if (cleanEndpoint.startsWith('api/')) {
        url = '/' + cleanEndpoint;
    } else {
        if (cleanEndpoint.startsWith('/')) cleanEndpoint = cleanEndpoint.substring(1);
        url = `/api/${cleanEndpoint}`;
    }
    const token = getToken();
    
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json'
        }
    };
    
    if (token) {
        options.headers['Authorization'] = `Bearer ${token}`;
    }
    
    if (data && (method === 'POST' || method === 'PUT' || method === 'DELETE')) {
        options.body = JSON.stringify(data);
    }
    
    try {
        const response = await fetch(url, options);
        const result = await response.json();
        
        if (!response.ok) {
            if (response.status === 401) {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                if (!window.location.pathname.includes('login')) {
                    window.location.href = '/login';
                }
                throw new Error('نشست شما منقضی شده است');
            }
            throw new Error(result.message || 'خطا در ارتباط با سرور');
        }
        
        return result;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
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
    toast.innerHTML = message;
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
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
}

// ========== بررسی احراز هویت ==========
function checkAuth() {
    const token = getToken();
    if (!token) {
        window.location.href = '/login';
        return false;
    }
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

/* ==== NoorVista CLINIC PANEL GLOBAL HELPERS START ==== */
(function () {
    'use strict';

    const ALLOWED_CLINIC_ROLES = ['clinic_manager'];

    function normalizeRole(role) {
        return String(role || '')
            .trim()
            .toLowerCase()
            .replace(/[\s-]+/g, '_');
    }

    function getToken() {
        return localStorage.getItem('token');
    }

    function redirectToLogin(message) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        if (message) localStorage.setItem('loginMessage', message);
        window.location.href = '/login';
    }

    function setPanelUserInfo(user) {
        if (!user) return;
        const name = user.full_name || user.username || 'مدیر کلینیک';
        document.querySelectorAll('.user-name').forEach(el => { el.textContent = name; });
        document.querySelectorAll('.user-avatar').forEach(el => { el.textContent = name.substring(0, 2).toUpperCase(); });
    }

    function bindPanelLogout() {
        document.querySelectorAll('.logout-btn').forEach(btn => {
            if (btn.dataset.boundLogout === '1') return;
            btn.dataset.boundLogout = '1';
            btn.addEventListener('click', function (event) {
                event.preventDefault();
                redirectToLogin('با موفقیت خارج شدید.');
            });
        });
    }

    if (typeof window.showToast !== 'function') {
        window.showToast = function (message, type = 'info') {
            const colors = {
                success: '#059669',
                error: '#dc2626',
                warning: '#d97706',
                info: '#1f2937'
            };
            const toast = document.createElement('div');
            toast.style.cssText = 'position:fixed;bottom:20px;left:20px;background:' +
                (colors[type] || colors.info) +
                ';color:white;padding:12px 20px;border-radius:8px;z-index:5000;box-shadow:0 8px 20px rgba(0,0,0,.15);font-size:13px;max-width:360px;line-height:1.8;';
            toast.textContent = message || '';
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
        };
    }

    if (typeof window.toPersianNumber !== 'function') {
        window.toPersianNumber = function (value) {
            if (value === null || value === undefined) return '';
            return String(value).replace(/\d/g, digit => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);
        };
    }

    if (typeof window.escapeHtml !== 'function') {
        window.escapeHtml = function (value) {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        };
    }

    if (typeof window.apiRequest !== 'function') {
        window.apiRequest = async function (url, method = 'GET', data = null) {
            const token = getToken();
            const options = {
                method,
                headers: { 'Content-Type': 'application/json' }
            };
            if (token) options.headers.Authorization = 'Bearer ' + token;
            if (data && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
                options.body = JSON.stringify(data);
            }

            const response = await fetch(url, options);
            const result = await response.json().catch(() => ({}));

            if (response.status === 401) {
                redirectToLogin(result.message || 'نشست شما منقضی شده است. لطفاً دوباره وارد شوید.');
                return null;
            }

            if (!response.ok || result.success === false) {
                throw new Error(result.message || 'خطای سرور: ' + response.status);
            }

            return result;
        };
    }

    if (typeof window.initPage !== 'function') {
        window.initPage = async function () {
            const token = getToken();
            if (!token) {
                redirectToLogin('برای ورود به پنل ابتدا وارد شوید.');
                return false;
            }

            try {
                const response = await fetch('/api/auth/me', {
                    headers: { Authorization: 'Bearer ' + token },
                    cache: 'no-store'
                });
                const result = await response.json().catch(() => ({}));

                if (!response.ok || !result.success || !result.user) {
                    redirectToLogin(result.message || 'توکن نامعتبر است. لطفاً دوباره وارد شوید.');
                    return false;
                }

                const role = normalizeRole(result.user.role);
                const currentPath = window.location.pathname.toLowerCase();

                if (currentPath.includes('/clinic-admin/') && !ALLOWED_CLINIC_ROLES.includes(role)) {
                    console.warn('User role is not in clinic panel allow list:', result.user.role);
                    if (typeof window.showToast === 'function') {
                        window.showToast('نقش کاربری برای پنل کلینیک ناشناخته است، اما صفحه باز می‌ماند.', 'warning');
                    }
                }

                localStorage.setItem('user', JSON.stringify(result.user));
                setPanelUserInfo(result.user);
                bindPanelLogout();
                return true;
            } catch (error) {
                console.error('initPage error:', error);
                if (typeof window.showToast === 'function') {
                    window.showToast('خطا در بررسی ورود کاربر', 'error');
                }
                return false;
            }
        };
    }

    window.getToken = window.getToken || getToken;
    window.redirectToLogin = window.redirectToLogin || redirectToLogin;
    window.setPanelUserInfo = window.setPanelUserInfo || setPanelUserInfo;
    window.bindPanelLogout = window.bindPanelLogout || bindPanelLogout;
})();
/* ==== NoorVista CLINIC PANEL GLOBAL HELPERS END ==== */


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

