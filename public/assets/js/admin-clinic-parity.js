
/* NoorVista - System admin shell that reuses clinic-admin pages exactly */
(function () {
    'use strict';

    const isAdminPage = /\/dashboard\/panel\/admin\//i.test(location.pathname);
    if (!isAdminPage) return;

    document.body.classList.add('system-admin-panel');

    const ADMIN_NAV = [
        { section: 'عملیات کلینیک' },
        { href: 'index.html', icon: 'icon-dashboard', label: 'داشبورد' },
        { href: 'doctors.html', icon: 'icon-user-md', label: 'مدیریت پزشکان' },
        { href: 'schedule.html', icon: 'icon-clock', label: 'زمان‌بندی پزشکان' },
        { href: 'patients.html', icon: 'icon-users', label: 'مدیریت بیماران' },
        { href: 'appointments.html', icon: 'icon-calendar', label: 'مدیریت نوبت‌ها' },
        { href: 'staff.html', icon: 'icon-briefcase', label: 'مدیریت کارکنان' },
        { href: 'payments.html', icon: 'icon-credit-card', label: 'مدیریت مالی' },
        { href: 'faqs.html', icon: 'icon-question-circle', label: 'سوالات پرتکرار' },
        { href: 'reports.html', icon: 'icon-bar-chart', label: 'گزارشات' },
        { section: 'مدیریت سیستم' },
        { href: 'users.html', icon: 'icon-users', label: 'مدیریت کاربران و نقش‌ها' },
        { href: 'settings.html', icon: 'icon-cog', label: 'تنظیمات سیستم' },
        { href: 'backup.html', icon: 'icon-database', label: 'پشتیبان‌گیری' },
        { href: 'logs.html', icon: 'icon-list-alt', label: 'گزارشات و لاگ‌ها' }
    ];

    function qs(sel, root = document) { return root.querySelector(sel); }
    function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
    function token() { return localStorage.getItem('token') || localStorage.getItem('authToken') || ''; }
    function user() { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } }
    function currentFile() {
        const file = location.pathname.split('/').pop() || 'index.html';
        return file === '' ? 'index.html' : file;
    }
    function toast(message, type = 'info') {
        if (typeof window.showToast === 'function') return window.showToast(message, type);
        const el = document.createElement('div');
        el.style.cssText = 'position:fixed;bottom:20px;left:20px;background:#1f2937;color:#fff;padding:12px 18px;border-radius:8px;z-index:100000;font-size:13px;';
        el.textContent = message;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 3000);
    }
    function logout() {
        localStorage.removeItem('token');
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
        window.location.href = '/login';
    }

    function renderSidebar() {
        const sidebar = qs('.sidebar');
        if (!sidebar) return;
        const active = currentFile().toLowerCase();
        const nav = ADMIN_NAV.map(item => {
            if (item.section) return `<li class="admin-nav-section-label">${item.section}</li>`;
            const cls = active === item.href.toLowerCase() ? ' active' : '';
            return `<li class="nav-item"><a href="${item.href}" class="nav-link${cls}"><i class="${item.icon}"></i><span>${item.label}</span></a></li>`;
        }).join('');
        sidebar.innerHTML = `
            <div class="sidebar-header">
                <div class="sidebar-logo">Noor<span>Vista</span></div>
                <div class="sidebar-subtitle">مدیریت سیستم</div>
            </div>
            <ul class="sidebar-nav">${nav}</ul>
            <div class="nav-divider"></div>
            <ul class="sidebar-nav admin-account-nav">
                <li class="nav-item"><a href="#" class="nav-link change-password-btn"><i class="icon-lock"></i><span>تغییر رمز عبور</span></a></li>
                <li class="nav-item"><a href="#" class="nav-link logout-btn"><i class="icon-sign-out"></i><span>خروج</span></a></li>
            </ul>`;
    }

    function normalizeHeader() {
        const header = qs('.top-header');
        if (!header) return;
        if (!qs('.admin-mobile-toggle', header)) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'admin-mobile-toggle';
            btn.innerHTML = '<i class="icon-menu"></i>';
            btn.addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
            header.prepend(btn);
        }
        const u = user();
        const name = u.full_name || u.fullname || u.name || u.username || 'مدیر سیستم';
        qsa('.user-name').forEach(el => { el.textContent = name; });
        qsa('.user-avatar').forEach(el => { el.textContent = name.slice(0, 2).toUpperCase(); });
        let holder = qs('.header-actions', header) || qs('.user-menu', header) || qs('[style*="display: flex"]', header) || header;
        if (!qs('.admin-top-actions', header)) {
            const actions = document.createElement('div');
            actions.className = 'admin-top-actions';
            actions.innerHTML = `
                <button type="button" class="admin-account-btn change-password-btn"><i class="icon-lock"></i> تغییر رمز</button>
                <button type="button" class="admin-account-btn danger logout-btn"><i class="icon-sign-out"></i> خروج</button>`;
            holder.appendChild(actions);
        }
    }

    function ensurePasswordModal() {
        if (qs('#adminChangePasswordModal')) return;
        const modal = document.createElement('div');
        modal.id = 'adminChangePasswordModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-container">
                <div class="modal-header">
                    <h3><i class="icon-lock"></i> تغییر رمز عبور</h3>
                    <button type="button" class="modal-close" data-admin-close-password>&times;</button>
                </div>
                <form id="adminChangePasswordForm">
                    <div class="modal-body">
                        <div class="form-group">
                            <label>رمز فعلی</label>
                            <input class="form-control" name="currentPassword" type="password" required autocomplete="current-password">
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>رمز جدید</label>
                                <input class="form-control" name="newPassword" type="password" required minlength="6" autocomplete="new-password">
                                <div class="admin-password-help">حداقل ۶ کاراکتر</div>
                            </div>
                            <div class="form-group">
                                <label>تکرار رمز جدید</label>
                                <input class="form-control" name="confirmPassword" type="password" required minlength="6" autocomplete="new-password">
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-outline" data-admin-close-password>انصراف</button>
                        <button type="submit" class="btn btn-primary">ذخیره رمز جدید</button>
                    </div>
                </form>
            </div>`;
        document.body.appendChild(modal);
    }

    function openPasswordModal() {
        ensurePasswordModal();
        qs('#adminChangePasswordModal')?.classList.add('show');
        document.body.classList.add('modal-open');
    }
    function closePasswordModal() {
        qs('#adminChangePasswordModal')?.classList.remove('show');
        document.body.classList.remove('modal-open');
    }

    async function rawRequest(endpoint, method = 'GET', data) {
        const url = String(endpoint || '').startsWith('/api/') ? endpoint : '/api/' + String(endpoint || '').replace(/^\/+/, '');
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', ...(token() ? { Authorization: 'Bearer ' + token() } : {}) },
            body: data && ['POST','PUT','PATCH','DELETE'].includes(method) ? JSON.stringify(data) : undefined,
            cache: 'no-store'
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || body.success === false) {
            const err = new Error(body.message || body.error || 'خطا در ارتباط با سرور');
            err.status = res.status;
            throw err;
        }
        return body;
    }

    function adminEquivalent(endpoint) {
        let e = String(endpoint || '');
        if (!e.startsWith('/api/')) e = '/api/' + e.replace(/^\/+/, '');
        const mapPrefixes = [
            ['/api/clinic/appointments', '/api/admin/appointments'],
            ['/api/clinic/doctors', '/api/admin/doctors'],
            ['/api/clinic/patients', '/api/admin/patients'],
            ['/api/clinic/staff', '/api/admin/staff'],
            ['/api/clinic/payments', '/api/admin/payments'],
            ['/api/clinic/faqs', '/api/admin/faqs']
        ];
        for (const [from, to] of mapPrefixes) {
            if (e.startsWith(from)) return to + e.slice(from.length);
        }
        return e;
    }

    async function requestWithFallback(endpoint, method = 'GET', data) {
        const original = String(endpoint || '').startsWith('/api/') ? endpoint : '/api/' + String(endpoint || '').replace(/^\/+/, '');
        const admin = adminEquivalent(original);
        if (admin !== original) {
            try { return await rawRequest(admin, method, data); }
            catch (err) {
                if (![401,403,404,405,500].includes(err.status)) throw err;
                console.warn('Admin endpoint fallback:', admin, '=>', original, err.message);
            }
        }
        return rawRequest(original, method, data);
    }

    function installApiParity() {
        window.apiRequest = requestWithFallback;
        window.getDoctors = () => requestWithFallback('/api/clinic/doctors');
        window.createDoctor = data => requestWithFallback('/api/clinic/doctors', 'POST', data);
        window.updateDoctor = (id, data) => requestWithFallback(`/api/clinic/doctors/${id}`, 'PUT', data);
        window.updateDoctorStatus = (id, is_available) => requestWithFallback(`/api/clinic/doctors/${id}/status`, 'PUT', { is_available, is_active: is_available });
        window.deleteDoctorApi = id => requestWithFallback(`/api/clinic/doctors/${id}`, 'DELETE');

        window.getPatients = () => requestWithFallback('/api/clinic/patients');
        window.getPatient = id => requestWithFallback(`/api/clinic/patients/${id}`);
        window.createPatient = data => requestWithFallback('/api/clinic/patients', 'POST', data);
        window.updatePatient = (id, data) => requestWithFallback(`/api/clinic/patients/${id}`, 'PUT', data);
        window.deletePatientApi = id => requestWithFallback(`/api/clinic/patients/${id}`, 'DELETE');

        window.getStaff = () => requestWithFallback('/api/clinic/staff');
        window.createStaff = data => requestWithFallback('/api/clinic/staff', 'POST', data);
        window.updateStaff = (id, data) => requestWithFallback(`/api/clinic/staff/${id}`, 'PUT', data);
        window.updateStaffStatus = (id, is_active) => requestWithFallback(`/api/clinic/staff/${id}/status`, 'PUT', { is_active });
        window.deleteStaff = id => requestWithFallback(`/api/clinic/staff/${id}`, 'DELETE');

        window.getPayments = params => {
            const qs = new URLSearchParams(params || {}).toString();
            return requestWithFallback('/api/clinic/payments' + (qs ? '?' + qs : ''));
        };
        window.updatePayment = (id, data) => requestWithFallback(`/api/clinic/payments/${id}`, 'PUT', data);
        window.deletePaymentApi = id => requestWithFallback(`/api/clinic/payments/${id}`, 'DELETE');

        window.createAppointment = data => requestWithFallback('/api/clinic/appointments', 'POST', data);
        window.updateAppointment = (id, data) => requestWithFallback(`/api/clinic/appointments/${id}`, 'PUT', data);
        window.deleteAppointmentApi = id => requestWithFallback(`/api/clinic/appointments/${id}`, 'DELETE');
        window.confirmAppointmentApi = id => requestWithFallback(`/api/clinic/appointments/${id}/confirm`, 'PUT');
    }

    function bindActions() {
        qsa('.logout-btn').forEach(btn => {
            if (btn.dataset.adminBoundLogout === '1') return;
            btn.dataset.adminBoundLogout = '1';
            btn.addEventListener('click', e => { e.preventDefault(); logout(); });
        });
        qsa('.change-password-btn').forEach(btn => {
            if (btn.dataset.adminBoundPassword === '1') return;
            btn.dataset.adminBoundPassword = '1';
            btn.addEventListener('click', e => { e.preventDefault(); openPasswordModal(); });
        });
        qsa('[data-admin-close-password]').forEach(btn => {
            if (btn.dataset.adminBoundClose === '1') return;
            btn.dataset.adminBoundClose = '1';
            btn.addEventListener('click', closePasswordModal);
        });
        const modal = qs('#adminChangePasswordModal');
        if (modal && modal.dataset.adminBoundOverlay !== '1') {
            modal.dataset.adminBoundOverlay = '1';
            modal.addEventListener('click', e => { if (e.target === modal) closePasswordModal(); });
        }
        const form = qs('#adminChangePasswordForm');
        if (form && form.dataset.adminBoundSubmit !== '1') {
            form.dataset.adminBoundSubmit = '1';
            form.addEventListener('submit', async e => {
                e.preventDefault();
                const fd = new FormData(form);
                const currentPassword = fd.get('currentPassword');
                const newPassword = fd.get('newPassword');
                const confirmPassword = fd.get('confirmPassword');
                if (newPassword !== confirmPassword) return toast('تکرار رمز جدید صحیح نیست', 'error');
                try {
                    await rawRequest('/api/auth/change-password', 'POST', { currentPassword, oldPassword: currentPassword, newPassword, confirmPassword });
                    toast('رمز عبور با موفقیت تغییر کرد', 'success');
                    form.reset();
                    closePasswordModal();
                } catch (err) {
                    toast(err.message || 'خطا در تغییر رمز عبور', 'error');
                }
            });
        }
    }

    function init() {
        installApiParity();
        renderSidebar();
        normalizeHeader();
        ensurePasswordModal();
        bindActions();
        document.addEventListener('click', e => {
            if (document.body.classList.contains('sidebar-open') && !e.target.closest('.sidebar') && !e.target.closest('.admin-mobile-toggle')) {
                document.body.classList.remove('sidebar-open');
            }
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
