/* NoorVista Admin Unified Enhancements */
(function () {
    'use strict';

    const ADMIN_NAV = [
        { section: 'عملیات کلینیک' },
        { href: '/dashboard/panel/admin/index.html', icon: 'icon-dashboard', label: 'داشبورد' },
        { href: '/dashboard/panel/admin/doctors.html', icon: 'icon-user-md', label: 'مدیریت پزشکان' },
        { href: '/dashboard/panel/admin/schedule.html', icon: 'icon-clock', label: 'زمان‌بندی پزشکان' },
        { href: '/dashboard/panel/admin/patients.html', icon: 'icon-users', label: 'مدیریت بیماران' },
        { href: '/dashboard/panel/admin/appointments.html', icon: 'icon-calendar', label: 'مدیریت نوبت‌ها' },
        { href: '/dashboard/panel/admin/staff.html', icon: 'icon-id-badge', label: 'مدیریت کارکنان' },
        { href: '/dashboard/panel/admin/payments.html', icon: 'icon-credit-card', label: 'امور مالی' },
        { href: '/dashboard/panel/admin/reports.html', icon: 'icon-bar-chart', label: 'گزارشات' },
        { href: '/dashboard/panel/admin/faqs.html', icon: 'icon-question-circle', label: 'سوالات پرتکرار' },
        { section: 'مدیریت سیستم' },
        { href: '/dashboard/panel/admin/users.html', icon: 'icon-users', label: 'مدیریت کاربران و نقش‌ها' },
        { href: '/dashboard/panel/admin/settings.html', icon: 'icon-cog', label: 'تنظیمات سیستم' },
        { href: '/dashboard/panel/admin/backup.html', icon: 'icon-database', label: 'پشتیبان‌گیری' },
        { href: '/dashboard/panel/admin/logs.html', icon: 'icon-list-alt', label: 'گزارشات و لاگ‌ها' }
    ];

    function qs(sel, root = document) { return root.querySelector(sel); }
    function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
    function isAdminPage() { return /\/dashboard\/panel\/admin\//i.test(location.pathname); }
    function token() { return localStorage.getItem('token') || localStorage.getItem('authToken'); }
    function user() { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } }
    function toast(message, type = 'info') {
        if (typeof window.showToast === 'function') return window.showToast(message, type);
        const el = document.createElement('div');
        el.className = 'toast toast-' + type;
        el.textContent = message;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 3500);
    }
    function logout() {
        localStorage.removeItem('token');
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
        window.location.href = '/login.html';
    }
    async function request(endpoint, method = 'GET', data) {
        if (typeof window.apiRequest === 'function') return window.apiRequest(endpoint, method, data);
        const url = endpoint.startsWith('/api/') ? endpoint : '/api/' + endpoint.replace(/^\//, '');
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', ...(token() ? { Authorization: 'Bearer ' + token() } : {}) },
            body: data ? JSON.stringify(data) : undefined
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.message || body.error || 'خطا در ارتباط با سرور');
        return body;
    }
    function currentPath() {
        const path = location.pathname.toLowerCase();
        if (path.endsWith('/admin/') || path.endsWith('/admin')) return '/dashboard/panel/admin/index.html';
        return path;
    }

    function renderSidebar() {
        const sidebar = qs('.sidebar');
        if (!sidebar) return;
        const activePath = currentPath();
        const navHtml = ADMIN_NAV.map(item => {
            if (item.section) return `<li class="admin-nav-section-label">${item.section}</li>`;
            const active = activePath.endsWith(item.href.toLowerCase()) ? ' active' : '';
            return `<li class="nav-item"><a href="${item.href}" class="nav-link${active}"><i class="${item.icon}"></i><span>${item.label}</span></a></li>`;
        }).join('');
        sidebar.innerHTML = `
            <div class="sidebar-header">
                <div class="sidebar-logo">Noor<span>Vista</span></div>
                <div class="sidebar-subtitle">مدیریت سیستم</div>
            </div>
            <ul class="sidebar-nav">${navHtml}</ul>
            <ul class="sidebar-nav admin-account-nav">
                <li class="nav-item"><a href="#" class="nav-link change-password-btn"><i class="icon-lock"></i><span>تغییر رمز عبور</span></a></li>
                <li class="nav-item"><a href="#" class="nav-link logout-btn"><i class="icon-sign-out"></i><span>خروج</span></a></li>
            </ul>`;
    }

    function ensureHeaderStructure() {
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
        let actions = qs('.header-actions', header) || qs('.user-menu', header) || qs('.user-info', header);
        if (!actions) {
            actions = document.createElement('div');
            actions.className = 'header-actions';
            header.appendChild(actions);
        }
        if (!qs('.user-avatar', actions)) {
            const u = user();
            const name = u.full_name || u.fullname || u.name || u.username || 'مدیر سیستم';
            const userInfo = document.createElement('div');
            userInfo.className = 'user-info';
            userInfo.innerHTML = `<div class="user-avatar">${name.slice(0, 2)}</div><div><div class="user-name">${name}</div><small>مدیر سیستم</small></div>`;
            actions.prepend(userInfo);
        }
        if (!qs('.admin-header-actions', header)) {
            const wrap = document.createElement('div');
            wrap.className = 'admin-header-actions';
            wrap.innerHTML = `
                <button type="button" class="admin-header-btn change-password-btn"><i class="icon-lock"></i><span>تغییر رمز</span></button>
                <button type="button" class="admin-header-btn danger logout-btn"><i class="icon-sign-out"></i><span>خروج</span></button>`;
            actions.prepend(wrap);
        }
    }

    function ensureChangePasswordModal() {
        if (qs('#adminChangePasswordModal')) return;
        const modal = document.createElement('div');
        modal.id = 'adminChangePasswordModal';
        modal.className = 'admin-modal-overlay';
        modal.innerHTML = `
            <div class="admin-modal-container">
                <div class="admin-modal-header">
                    <h3><i class="icon-lock"></i> تغییر رمز عبور</h3>
                    <button type="button" class="admin-modal-close" aria-label="بستن">&times;</button>
                </div>
                <form id="adminChangePasswordForm">
                    <div class="admin-modal-body">
                        <div class="admin-form-grid">
                            <div class="admin-form-group full-width">
                                <label>رمز فعلی</label>
                                <input class="admin-form-control" name="currentPassword" type="password" required autocomplete="current-password">
                            </div>
                            <div class="admin-form-group">
                                <label>رمز جدید</label>
                                <input class="admin-form-control" name="newPassword" type="password" required minlength="6" autocomplete="new-password">
                                <div class="admin-help-text">رمز جدید حداقل ۶ کاراکتر باشد.</div>
                            </div>
                            <div class="admin-form-group">
                                <label>تکرار رمز جدید</label>
                                <input class="admin-form-control" name="confirmPassword" type="password" required minlength="6" autocomplete="new-password">
                            </div>
                        </div>
                    </div>
                    <div class="admin-modal-footer">
                        <button type="button" class="btn btn-outline admin-modal-cancel">انصراف</button>
                        <button type="submit" class="btn btn-primary">ذخیره رمز جدید</button>
                    </div>
                </form>
            </div>`;
        document.body.appendChild(modal);
    }

    function bindAccountActions() {
        ensureChangePasswordModal();
        qsa('.logout-btn').forEach(btn => {
            if (btn.dataset.boundLogout === '1') return;
            btn.dataset.boundLogout = '1';
            btn.addEventListener('click', e => { e.preventDefault(); logout(); });
        });
        qsa('.change-password-btn').forEach(btn => {
            if (btn.dataset.boundPassword === '1') return;
            btn.dataset.boundPassword = '1';
            btn.addEventListener('click', e => {
                e.preventDefault();
                qs('#adminChangePasswordModal')?.classList.add('show');
                document.body.classList.add('modal-open');
            });
        });
        qsa('.admin-modal-close, .admin-modal-cancel').forEach(btn => {
            if (btn.dataset.boundClose === '1') return;
            btn.dataset.boundClose = '1';
            btn.addEventListener('click', closePasswordModal);
        });
        const modal = qs('#adminChangePasswordModal');
        if (modal && modal.dataset.boundOverlay !== '1') {
            modal.dataset.boundOverlay = '1';
            modal.addEventListener('click', e => { if (e.target === modal) closePasswordModal(); });
        }
        const form = qs('#adminChangePasswordForm');
        if (form && form.dataset.boundSubmit !== '1') {
            form.dataset.boundSubmit = '1';
            form.addEventListener('submit', async e => {
                e.preventDefault();
                const fd = new FormData(form);
                const currentPassword = fd.get('currentPassword');
                const newPassword = fd.get('newPassword');
                const confirmPassword = fd.get('confirmPassword');
                if (newPassword !== confirmPassword) return toast('تکرار رمز جدید صحیح نیست', 'error');
                try {
                    await request('/api/auth/change-password', 'POST', { currentPassword, oldPassword: currentPassword, newPassword, confirmPassword });
                    toast('رمز عبور با موفقیت تغییر کرد', 'success');
                    form.reset();
                    closePasswordModal();
                } catch (err) {
                    toast(err.message || 'خطا در تغییر رمز عبور', 'error');
                }
            });
        }
    }

    function closePasswordModal() {
        qs('#adminChangePasswordModal')?.classList.remove('show');
        document.body.classList.remove('modal-open');
    }

    function normalizeUserInfo() {
        const u = user();
        const name = u.full_name || u.fullname || u.name || u.username || 'مدیر سیستم';
        qsa('.user-name').forEach(el => { el.textContent = name; });
        qsa('.user-avatar').forEach(el => { el.textContent = name.slice(0, 2); });
    }

    function enhanceDashboard() {
        if (!/\/admin\/(index\.html)?$/i.test(location.pathname)) return;
        if (qs('.admin-quick-grid')) return;
        const anchor = qs('.stats-grid') || qs('.welcome-banner') || qs('.top-header');
        if (!anchor) return;
        const box = document.createElement('div');
        box.innerHTML = `
            <div class="admin-dashboard-note">
                پنل مدیر سیستم همان امکانات مدیر کلینیک را دارد و ابزارهای اختصاصی تنظیمات سیستم، پشتیبان‌گیری، گزارشات و لاگ‌ها هم از همین منو در دسترس است.
            </div>
            <div class="admin-quick-grid">
                <a class="admin-quick-card" href="/dashboard/panel/admin/doctors.html"><i class="icon-user-md"></i><span>پزشکان</span></a>
                <a class="admin-quick-card" href="/dashboard/panel/admin/schedule.html"><i class="icon-clock"></i><span>زمان‌بندی</span></a>
                <a class="admin-quick-card" href="/dashboard/panel/admin/patients.html"><i class="icon-users"></i><span>بیماران</span></a>
                <a class="admin-quick-card" href="/dashboard/panel/admin/appointments.html"><i class="icon-calendar"></i><span>نوبت‌ها</span></a>
                <a class="admin-quick-card" href="/dashboard/panel/admin/staff.html"><i class="icon-id-badge"></i><span>کارکنان</span></a>
                <a class="admin-quick-card" href="/dashboard/panel/admin/payments.html"><i class="icon-credit-card"></i><span>مالی</span></a>
                <a class="admin-quick-card" href="/dashboard/panel/admin/settings.html"><i class="icon-cog"></i><span>تنظیمات</span></a>
                <a class="admin-quick-card" href="/dashboard/panel/admin/backup.html"><i class="icon-database"></i><span>پشتیبان‌گیری</span></a>
            </div>`;
        anchor.insertAdjacentElement(anchor.classList.contains('top-header') ? 'afterend' : 'beforebegin', box);
    }

    function normalizeModalBehavior() {
        qsa('.modal-overlay, .modal').forEach(modal => {
            if (modal.dataset.adminModalNormalized === '1') return;
            modal.dataset.adminModalNormalized = '1';
            modal.addEventListener('click', e => {
                if (e.target === modal && typeof window.closeModal === 'function' && modal.id) window.closeModal(modal.id);
            });
        });
        const observer = new MutationObserver(() => {
            const anyOpen = !!qs('.modal-overlay.show, .modal.show, .admin-modal-overlay.show');
            document.body.classList.toggle('modal-open', anyOpen);
        });
        observer.observe(document.body, { attributes: true, childList: true, subtree: true, attributeFilter: ['class'] });
    }

    function buildQuery(params) {
        const q = new URLSearchParams();
        Object.entries(params || {}).forEach(([key, value]) => {
            if (value !== undefined && value !== null && String(value) !== '' && String(value) !== 'all') q.set(key, value);
        });
        const text = q.toString();
        return text ? '?' + text : '';
    }

    function installAdminApiOverrides() {
        window.getPayments = params => request('/api/admin/payments' + buildQuery(params));
        window.updatePayment = (id, data) => request(`/api/admin/payments/${id}`, 'PUT', data);
        window.deletePaymentApi = id => request(`/api/admin/payments/${id}`, 'DELETE');
        window.getStaff = () => request('/api/admin/staff');
        window.createStaff = data => request('/api/admin/staff', 'POST', data);
        window.updateStaff = (id, data) => request(`/api/admin/staff/${id}`, 'PUT', data);
        window.updateStaffStatus = (id, is_active) => request(`/api/admin/staff/${id}/status`, 'PUT', { is_active });
        window.deleteStaff = id => request(`/api/admin/staff/${id}`, 'DELETE');
    }

    function init() {
        if (!isAdminPage()) return;
        document.body.classList.add('system-admin-panel');
        installAdminApiOverrides();
        renderSidebar();
        ensureHeaderStructure();
        bindAccountActions();
        normalizeUserInfo();
        enhanceDashboard();
        normalizeModalBehavior();
        document.addEventListener('click', e => {
            if (document.body.classList.contains('sidebar-open') && !e.target.closest('.sidebar') && !e.target.closest('.admin-mobile-toggle')) {
                document.body.classList.remove('sidebar-open');
            }
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
