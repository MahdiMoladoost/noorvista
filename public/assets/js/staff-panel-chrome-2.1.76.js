(function () {
  'use strict';

  if (window.__NV_STAFF_CHROME_2176__) return;
  window.__NV_STAFF_CHROME_2176__ = true;

  const qs = (selector, root = document) => root.querySelector(selector);
  const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function setMessage(element, message, visible) {
    if (!element) return;
    element.textContent = message || '';
    element.classList.toggle('is-visible', Boolean(visible && message));
  }

  async function requestJson(url, options) {
    const response = await window.fetch(url, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(options?.headers || {}) },
      ...options
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) {
      throw new Error(payload.message || 'انجام عملیات با خطا روبه‌رو شد');
    }
    return payload;
  }

  function modalMarkup() {
    return `<div class="nv-modal is-compact" id="nvStaffPasswordModal" role="dialog" aria-modal="true" aria-labelledby="nvStaffPasswordTitle" hidden>
      <div class="nv-modal-dialog" tabindex="-1">
        <header class="nv-modal-header">
          <div><h2 id="nvStaffPasswordTitle">تغییر رمز عبور</h2><p>پس از تغییر رمز، برای حفظ امنیت باید دوباره وارد سامانه شوید.</p></div>
          <button class="nv-modal-close" type="button" data-staff-password-close aria-label="بستن">×</button>
        </header>
        <form id="nvStaffPasswordForm" novalidate>
          <div class="nv-modal-body">
            <div class="nv-form">
              <label class="nv-form-field full nv-staff-password-wrap"><span>رمز عبور فعلی</span><input name="old_password" type="password" autocomplete="current-password" required><button class="nv-staff-password-toggle" type="button" data-password-toggle="old_password" aria-label="نمایش رمز عبور"><i class="icon-eye" aria-hidden="true"></i></button></label>
              <label class="nv-form-field nv-staff-password-wrap"><span>رمز عبور جدید</span><input name="new_password" type="password" minlength="8" autocomplete="new-password" required><button class="nv-staff-password-toggle" type="button" data-password-toggle="new_password" aria-label="نمایش رمز عبور"><i class="icon-eye" aria-hidden="true"></i></button></label>
              <label class="nv-form-field nv-staff-password-wrap"><span>تکرار رمز عبور جدید</span><input name="confirm_password" type="password" minlength="8" autocomplete="new-password" required><button class="nv-staff-password-toggle" type="button" data-password-toggle="confirm_password" aria-label="نمایش رمز عبور"><i class="icon-eye" aria-hidden="true"></i></button></label>
              <div class="nv-form-note full">رمز جدید باید حداقل ۸ نویسه و شامل حرف و عدد باشد.</div>
              <div class="nv-staff-password-error" id="nvStaffPasswordError" role="alert"></div>
              <div class="nv-staff-password-success" id="nvStaffPasswordSuccess" role="status"></div>
            </div>
          </div>
          <footer class="nv-modal-footer"><button class="nv-btn secondary" type="button" data-staff-password-close>انصراف</button><button class="nv-btn" id="nvStaffPasswordSubmit" type="submit"><i class="icon-lock" aria-hidden="true"></i><span>ثبت رمز جدید</span></button></footer>
        </form>
      </div>
    </div>`;
  }

  function getModal() {
    let modal = qs('#nvStaffPasswordModal');
    if (!modal) {
      document.body.insertAdjacentHTML('beforeend', modalMarkup());
      modal = qs('#nvStaffPasswordModal');
      bindModal(modal);
    }
    return modal;
  }

  function openModal() {
    const modal = getModal();
    const form = qs('#nvStaffPasswordForm', modal);
    form?.reset();
    setMessage(qs('#nvStaffPasswordError', modal), '', false);
    setMessage(qs('#nvStaffPasswordSuccess', modal), '', false);
    modal.hidden = false;
    modal.classList.add('show');
    document.body.classList.add('nv-modal-open');
    modal._returnFocus = document.activeElement;
    window.setTimeout(() => qs('input[name="old_password"]', modal)?.focus(), 30);
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('show');
    modal.hidden = true;
    document.body.classList.remove('nv-modal-open');
    modal._returnFocus?.focus?.();
  }

  function bindModal(modal) {
    qsa('[data-staff-password-close]', modal).forEach((button) => button.addEventListener('click', () => closeModal(modal)));
    qsa('[data-password-toggle]', modal).forEach((button) => button.addEventListener('click', () => {
      const input = qs(`[name="${button.dataset.passwordToggle}"]`, modal);
      if (!input) return;
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      button.setAttribute('aria-label', showing ? 'نمایش رمز عبور' : 'پنهان کردن رمز عبور');
      const icon = qs('i', button);
      if (icon) icon.className = showing ? 'icon-eye' : 'icon-eye-slash';
    }));
    modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(modal); });
    modal.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(modal); });
    qs('#nvStaffPasswordForm', modal)?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const oldPassword = String(form.elements.old_password.value || '');
      const newPassword = String(form.elements.new_password.value || '');
      const confirmPassword = String(form.elements.confirm_password.value || '');
      const errorBox = qs('#nvStaffPasswordError', modal);
      const successBox = qs('#nvStaffPasswordSuccess', modal);
      const submit = qs('#nvStaffPasswordSubmit', modal);
      setMessage(errorBox, '', false);
      setMessage(successBox, '', false);
      if (!oldPassword || !newPassword || !confirmPassword) {
        setMessage(errorBox, 'همه فیلدها را تکمیل کنید.', true);
        return;
      }
      if (newPassword !== confirmPassword) {
        setMessage(errorBox, 'رمز جدید و تکرار آن یکسان نیست.', true);
        return;
      }
      if (newPassword.length < 8 || !/[A-Za-z\u0600-\u06ff]/.test(newPassword) || !/\d/.test(newPassword)) {
        setMessage(errorBox, 'رمز جدید باید حداقل ۸ نویسه و شامل حرف و عدد باشد.', true);
        return;
      }
      const original = submit.innerHTML;
      submit.disabled = true;
      submit.innerHTML = '<span>در حال ثبت...</span>';
      try {
        const payload = await requestJson('/api/auth/change-password', {
          method: 'POST',
          body: JSON.stringify({ old_password: oldPassword, new_password: newPassword, confirm_password: confirmPassword })
        });
        setMessage(successBox, payload.message || 'رمز عبور تغییر کرد؛ دوباره وارد شوید.', true);
        window.setTimeout(() => {
          if (typeof window.noorvistaLogout === 'function') window.noorvistaLogout();
          else window.location.replace('/login');
        }, 1000);
      } catch (error) {
        setMessage(errorBox, error.message || 'تغییر رمز عبور انجام نشد.', true);
      } finally {
        submit.disabled = false;
        submit.innerHTML = original;
      }
    });
  }

  function normalizeUserMenu() {
    qsa('.nv3-user-dropdown .nv3-user-menu-item').forEach((item) => {
      if (item.textContent.includes('وب‌سایت صدرا')) item.remove();
    });
    qsa('[data-nv-change-password]').forEach((button) => {
      if (button.dataset.bound === '1') return;
      button.dataset.bound = '1';
      button.addEventListener('click', openModal);
    });
  }

  function boot() {
    normalizeUserMenu();
    window.NVDate?.initFields?.(document);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
