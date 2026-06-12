// ========================================================== 
// NoorVista Clinic Admin Fixes v2
// افزونه مشترک بدون حذف قابلیت‌های موجود panel-common.js
// ==========================================================
(function () {
    'use strict';

    const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
    const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
    const CLINIC_ROLES = [
        'clinic_admin', 'clinic', 'clinic_manager', 'clinic_administrator', 'clinicadmin',
        'manager', 'admin', 'system_admin', 'super_admin', 'reception', 'receptionist', 'staff'
    ];

    function normalizeRole(role) {
        return String(role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    }

    function toEnglishNumber(value) {
        return String(value ?? '')
            .replace(/[۰-۹]/g, d => String(PERSIAN_DIGITS.indexOf(d)))
            .replace(/[٠-٩]/g, d => String(ARABIC_DIGITS.indexOf(d)));
    }

    function toPersianNumber(value) {
        if (value === null || value === undefined) return '';
        return String(value).replace(/\d/g, d => PERSIAN_DIGITS[Number(d)]);
    }

    function pad2(num) { return String(num).padStart(2, '0'); }

    function makeDateObject(y, m, d, formatter) {
        return {
            year: Number(y),
            month: Number(m),
            day: Number(d),
            0: Number(y),
            1: Number(m),
            2: Number(d),
            length: 3,
            toString: formatter || function () { return `${this.year}/${pad2(this.month)}/${pad2(this.day)}`; }
        };
    }

    function parseGregorianInput(gy, gm, gd) {
        if (gy instanceof Date) return [gy.getFullYear(), gy.getMonth() + 1, gy.getDate()];
        if (typeof gy === 'string') {
            const s = gy.slice(0, 10);
            if (s.includes('-')) {
                const p = s.split('-').map(Number);
                return [p[0], p[1], p[2]];
            }
        }
        return [Number(gy), Number(gm), Number(gd)];
    }

    function gregorianToJalaliCalc(gy, gm, gd) {
        [gy, gm, gd] = parseGregorianInput(gy, gm, gd);
        const gdm = [0,31,59,90,120,151,181,212,243,273,304,334];
        let jy = gy <= 1600 ? 0 : 979;
        gy -= gy <= 1600 ? 621 : 1600;
        const gy2 = gm > 2 ? gy + 1 : gy;
        let days = 365 * gy + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) - 80 + gd + gdm[gm - 1];
        jy += 33 * Math.floor(days / 12053);
        days %= 12053;
        jy += 4 * Math.floor(days / 1461);
        days %= 1461;
        if (days > 365) {
            jy += Math.floor((days - 1) / 365);
            days = (days - 1) % 365;
        }
        const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
        const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
        return makeDateObject(jy, jm, jd, function () {
            return `${toPersianNumber(this.year)}/${toPersianNumber(pad2(this.month))}/${toPersianNumber(pad2(this.day))}`;
        });
    }

    function parseJalaliInput(jy, jm, jd) {
        if (typeof jy === 'string') {
            const normalized = toEnglishNumber(jy).slice(0, 10).replace(/-/g, '/');
            const p = normalized.split('/').map(Number);
            return [p[0], p[1], p[2]];
        }
        return [Number(jy), Number(jm), Number(jd)];
    }

    function jalaliToGregorianCalc(jy, jm, jd) {
        [jy, jm, jd] = parseJalaliInput(jy, jm, jd);
        let gy = jy <= 979 ? 621 : 1600;
        jy -= jy <= 979 ? 0 : 979;
        let days = 365 * jy + Math.floor(jy / 33) * 8 + Math.floor(((jy % 33) + 3) / 4) + 78 + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
        gy += 400 * Math.floor(days / 146097);
        days %= 146097;
        if (days > 36524) {
            gy += 100 * Math.floor(--days / 36524);
            days %= 36524;
            if (days >= 365) days++;
        }
        gy += 4 * Math.floor(days / 1461);
        days %= 1461;
        if (days > 365) {
            gy += Math.floor((days - 1) / 365);
            days = (days - 1) % 365;
        }
        let gd = days + 1;
        const md = [0,31,((gy % 4 === 0 && gy % 100 !== 0) || (gy % 400 === 0)) ? 29 : 28,31,30,31,30,31,31,30,31,30,31];
        let gm = 1;
        while (gm <= 12 && gd > md[gm]) { gd -= md[gm]; gm++; }
        return makeDateObject(gy, gm, gd, function () {
            return `${this.year}-${pad2(this.month)}-${pad2(this.day)}`;
        });
    }

    function toJalali(date) {
        if (!date) return '';
        const s = String(date);
        if (s.includes('/') && /^[۰-۹0-9]{4}\/[۰-۹0-9]{1,2}\/[۰-۹0-9]{1,2}$/.test(s)) return s;
        return gregorianToJalaliCalc(s.slice(0, 10)).toString();
    }

    function toGregorian(date) {
        if (!date) return '';
        const s = String(date);
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        return jalaliToGregorianCalc(s).toString();
    }

    function isValidJalaliDate(dateStr) {
        const cleaned = toEnglishNumber(dateStr).replace(/-/g, '/');
        const parts = cleaned.split('/').map(Number);
        if (parts.length !== 3 || parts.some(Number.isNaN)) return false;
        return parts[0] >= 1300 && parts[0] <= 1500 && parts[1] >= 1 && parts[1] <= 12 && parts[2] >= 1 && parts[2] <= 31;
    }

    // Override inaccurate legacy conversion helpers while preserving their object contract.
    window.toEnglishNumber = toEnglishNumber;
    window.toPersianNumber = toPersianNumber;
    window.gregorianToJalali = gregorianToJalaliCalc;
    window.jalaliToGregorian = jalaliToGregorianCalc;
    window.toJalali = toJalali;
    window.toGregorian = toGregorian;
    window.toJalaliDateString = toJalali;
    window.toGregorianDateString = toGregorian;
    window.isValidJalaliDate = isValidJalaliDate;

    window.escapeHtml = window.escapeHtml || function (value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };

    window.formatPrice = window.formatPrice || function (price) {
        const n = Number(price) || 0;
        return `${toPersianNumber(n.toLocaleString('en-US'))} تومان`;
    };

    function getToken() { return localStorage.getItem('token'); }
    function getUser() {
        try { return JSON.parse(localStorage.getItem('user') || 'null'); }
        catch (_) { return null; }
    }

    function redirectToLogin(message) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        if (message) localStorage.setItem('loginMessage', message);
        window.location.href = '/login';
    }

    function setPanelUserInfo(user) {
        const name = user?.full_name || user?.username || 'مدیر کلینیک';
        document.querySelectorAll('.user-name').forEach(el => { el.textContent = name; });
        document.querySelectorAll('.user-avatar').forEach(el => { el.textContent = name.substring(0, 2).toUpperCase(); });
    }

    function bindPanelLogout() {
        document.querySelectorAll('.logout-btn').forEach(btn => {
            if (btn.dataset.boundClinicLogout === '1') return;
            btn.dataset.boundClinicLogout = '1';
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                redirectToLogin('با موفقیت خارج شدید.');
            });
        });
    }

    window.getToken = getToken;
    window.getUser = getUser;
    window.redirectToLogin = redirectToLogin;
    window.setPanelUserInfo = setPanelUserInfo;
    window.bindPanelLogout = bindPanelLogout;

    window.showToast = function (message, type = 'info') {
        const existing = document.querySelector('.clinic-toast');
        if (existing) existing.remove();
        const colors = { success: '#059669', error: '#dc2626', warning: '#d97706', info: '#1f2937' };
        const toast = document.createElement('div');
        toast.className = 'clinic-toast';
        toast.style.cssText = `position:fixed;bottom:20px;left:20px;background:${colors[type] || colors.info};color:white;padding:12px 20px;border-radius:12px;z-index:50000;box-shadow:0 10px 24px rgba(0,0,0,.16);font-size:13px;max-width:390px;line-height:1.9;`;
        toast.textContent = message || '';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3200);
    };

    window.apiRequest = async function (endpoint, method = 'GET', data = null) {
        let url = String(endpoint || '');
        if (!/^https?:\/\//.test(url)) {
            if (url.startsWith('/api/')) url = url;
            else if (url.startsWith('api/')) url = '/' + url;
            else url = '/api/' + url.replace(/^\/+/, '');
        }

        const options = { method, headers: { 'Content-Type': 'application/json' }, cache: 'no-store' };
        const token = getToken();
        if (token) options.headers.Authorization = 'Bearer ' + token;
        if (data && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) options.body = JSON.stringify(data);

        const response = await fetch(url, options);
        const result = await response.json().catch(() => ({}));

        if (response.status === 401) {
            if (url.includes('/api/auth/me')) redirectToLogin(result.message || 'نشست شما منقضی شده است. لطفاً دوباره وارد شوید.');
            const err = new Error(result.message || 'توکن نامعتبر است');
            err.status = 401;
            throw err;
        }
        if (!response.ok || result.success === false) {
            const err = new Error(result.message || 'خطای سرور: ' + response.status);
            err.status = response.status;
            throw err;
        }
        return result;
    };

    window.initPage = async function () {
        const token = getToken();
        if (!token) {
            redirectToLogin('برای ورود به پنل ابتدا وارد شوید.');
            return false;
        }
        try {
            const result = await window.apiRequest('/api/auth/me');
            if (!result?.user) {
                redirectToLogin('کاربر معتبر یافت نشد.');
                return false;
            }
            const role = normalizeRole(result.user.role);
            if (window.location.pathname.includes('/clinic-admin/') && !CLINIC_ROLES.includes(role)) {
                console.warn('Unknown clinic role:', result.user.role);
                showToast('نقش کاربری برای پنل کلینیک ناشناخته است، اما صفحه باز می‌ماند.', 'warning');
            }
            localStorage.setItem('user', JSON.stringify(result.user));
            setPanelUserInfo(result.user);
            bindPanelLogout();
            return true;
        } catch (e) {
            console.error('initPage failed:', e);
            showToast(e.message || 'خطا در بررسی ورود کاربر', 'error');
            return false;
        }
    };

    // ---------- Generic clinic APIs used by older pages ----------
    window.getDoctors = () => window.apiRequest('/api/clinic/doctors');
    window.createDoctor = data => window.apiRequest('/api/clinic/doctors', 'POST', data);
    window.updateDoctor = (id, data) => window.apiRequest(`/api/clinic/doctors/${id}`, 'PUT', data);
    window.updateDoctorStatus = (id, is_available) => window.apiRequest(`/api/clinic/doctors/${id}/status`, 'PUT', { is_available, is_active: is_available });
    window.deleteDoctorApi = id => window.apiRequest(`/api/clinic/doctors/${id}`, 'DELETE');

    window.getPatients = () => window.apiRequest('/api/clinic/patients');
    window.getPatient = id => window.apiRequest(`/api/clinic/patients/${id}`);
    window.createPatient = data => window.apiRequest('/api/clinic/patients', 'POST', data);
    window.updatePatient = (id, data) => window.apiRequest(`/api/clinic/patients/${id}`, 'PUT', data);
    window.deletePatientApi = id => window.apiRequest(`/api/clinic/patients/${id}`, 'DELETE');

    window.getPayments = params => {
        const qs = new URLSearchParams(params || {}).toString();
        return window.apiRequest('/api/clinic/payments' + (qs ? '?' + qs : ''));
    };

    window.getStaff = () => window.apiRequest('/api/clinic/staff');
    window.createStaff = data => window.apiRequest('/api/clinic/staff', 'POST', data);
    window.updateStaff = (id, data) => window.apiRequest(`/api/clinic/staff/${id}`, 'PUT', data);
    window.updateStaffStatus = (id, is_active) => window.apiRequest(`/api/clinic/staff/${id}/status`, 'PUT', { is_active });
    window.deleteStaff = id => window.apiRequest(`/api/clinic/staff/${id}`, 'DELETE');

    window.openModal = window.openModal || function (id) { document.getElementById(id)?.classList.add('show'); };
    window.closeModal = function (id) { document.getElementById(id)?.classList.remove('show'); };
    window.showModal = window.openModal;
    window.hideModal = window.closeModal;

    // ---------- Persianize displayed numbers without touching inputs ----------
    function shouldSkipNode(node) {
        const parent = node.parentElement;
        if (!parent) return true;
        return !!parent.closest('script,style,textarea,input,select,code,pre,[data-no-persian]');
    }
    function convertTextNode(node) {
        if (shouldSkipNode(node)) return;
        const old = node.nodeValue;
        const next = old.replace(/\d/g, d => PERSIAN_DIGITS[Number(d)]).replace(/%/g, '٪');
        if (next !== old) node.nodeValue = next;
    }
    function persianizeNumbers(root = document.body) {
        if (!root) return;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach(convertTextNode);
    }
    let observerTimer = null;
    function startObserver() {
        persianizeNumbers();
        const observer = new MutationObserver(() => {
            clearTimeout(observerTimer);
            observerTimer = setTimeout(() => persianizeNumbers(), 80);
        });
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }

    document.addEventListener('DOMContentLoaded', function () {
        bindPanelLogout();
        setPanelUserInfo(getUser());
        startObserver();
        if (typeof window.initDatepickers === 'function') {
            setTimeout(() => window.initDatepickers(), 0);
        }
    });
})();


// ---- Clinic Admin v3 handler safety layer ----
(function () {
    const requiredByPage = {
        'doctors.html': ['loadDoctors','openAddDoctorModal','openEditDoctorModal','openDeleteDoctorModal','confirmDelete','saveDoctor','toggleDoctorStatus','clearFilters','closeModal'],
        'patients.html': ['loadPatients','openAddPatientModal','viewPatient','deletePatient','savePatient','closeModal'],
        'staff.html': ['loadStaff','openAddStaffModal','openEditStaffModal','openDeleteModal','saveStaff','toggleStaffStatus','clearFilters','closeModal'],
        'appointments.html': ['loadAppointments','openAddModal','submitAppointmentForm','viewAppointment','openEditModal','confirmAppointment','confirmDeleteAppointment','clearFilters','closeModal'],
        'schedule.html': ['loadDoctors','addNewDoctor','editDoctor','openScheduleModal','saveDoctor','saveSchedule','confirmDeleteDoctor','toggleWeekday','closeModal'],
        'payments.html': ['loadPayments','resetFilters'],
        'reports.html': ['generateReport','exportToExcel'],
        'index.html': ['loadDashboard','confirmAppointment','cancelAppointment']
    };

    window.openModal = function (id) {
        const modal = document.getElementById(id);
        if (!modal) return;
        modal.classList.add('show');
        modal.style.display = 'flex';
    };
    window.closeModal = function (id) {
        const modal = document.getElementById(id);
        if (!modal) return;
        modal.classList.remove('show');
        modal.style.display = '';
    };
    window.showModal = window.openModal;
    window.hideModal = window.closeModal;

    document.addEventListener('DOMContentLoaded', function () {
        document.querySelectorAll('[onclick]').forEach(function (el) {
            const code = el.getAttribute('onclick') || '';
            const match = code.match(/^\s*([A-Za-z_$][\w$]*)\s*\(/);
            if (match && typeof window[match[1]] !== 'function') {
                console.error('Missing onclick handler:', match[1], el);
                el.dataset.handlerMissing = match[1];
            }
        });
        const page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
        (requiredByPage[page] || []).forEach(function (name) {
            if (typeof window[name] !== 'function') {
                console.error('Required clinic-admin handler is missing:', page, name);
            }
        });
    });
})();
