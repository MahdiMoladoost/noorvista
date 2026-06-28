(function () {
  'use strict';

  const state = {
    action: null,
    phrases: {
      operational: 'پاکسازی داده های عملیاتی',
      full: 'حذف کامل اطلاعات'
    }
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function validBackupFilename(filename) {
    return /^backup_[A-Za-z0-9._-]+\.nvbak$/i.test(String(filename || ''));
  }

  function formatBytes(bytes) {
    const value = Number(bytes || 0);
    if (!Number.isFinite(value) || value < 0) return '—';
    if (value < 1024) return `${value.toLocaleString('fa-IR')} بایت`;
    if (value < 1024 * 1024) return `${(value / 1024).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} کیلوبایت`;
    if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} مگابایت`;
    return `${(value / (1024 * 1024 * 1024)).toLocaleString('fa-IR', { maximumFractionDigits: 2 })} گیگابایت`;
  }

  function setInlineResult(message, type) {
    const box = document.getElementById('dbInlineResult');
    if (!box) return;
    box.textContent = String(message || '');
    box.className = `nv-db-inline-result is-visible ${type === 'error' ? 'is-error' : 'is-success'}`;
  }

  function clearInlineResult() {
    const box = document.getElementById('dbInlineResult');
    if (!box) return;
    box.className = 'nv-db-inline-result';
    box.textContent = '';
  }

  async function loadMaintenanceStatus() {
    const badge = document.getElementById('dbResetState');
    try {
      const result = await window.apiRequest('/admin/database/maintenance-status');
      state.phrases = { ...state.phrases, ...(result.phrases || {}) };
      document.getElementById('dbTableCount').textContent = Number(result.tableCount || 0).toLocaleString('fa-IR');
      document.getElementById('dbEstimatedRows').textContent = Number(result.estimatedRows || 0).toLocaleString('fa-IR');
      document.getElementById('dbOperationalCount').textContent = Number(result.operationalTargetCount || 0).toLocaleString('fa-IR');
      document.getElementById('dbFullCount').textContent = Number(result.fullTargetCount || 0).toLocaleString('fa-IR');

      const enabled = Boolean(result.resetEnabled);
      badge.textContent = enabled ? 'پاک‌سازی فعال است' : 'پاک‌سازی در سرور غیرفعال است';
      badge.classList.toggle('is-disabled', !enabled);
      document.querySelectorAll('[data-reset-mode]').forEach((button) => {
        button.disabled = !enabled;
        button.title = enabled ? '' : (result.resetDisabledReason || 'ابتدا ALLOW_DATABASE_RESET=true را در تنظیمات سرور ثبت کنید');
      });
      const note = document.getElementById('dbResetDisabledNote');
      if (note) note.hidden = enabled;
    } catch (error) {
      badge.textContent = 'وضعیت نامشخص';
      badge.classList.add('is-disabled');
      document.querySelectorAll('[data-reset-mode]').forEach((button) => { button.disabled = true; });
      setInlineResult(error.message || 'دریافت وضعیت پایگاه داده ناموفق بود', 'error');
    }
  }

  async function loadBackups() {
    const tbody = document.querySelector('#backupsTable tbody');
    if (!tbody) return;
    try {
      const data = await window.apiRequest('/admin/backups');
      const backups = (data.backups || []).filter((item) => validBackupFilename(item.filename));
      if (!backups.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="nv-db-empty">هنوز نسخه پشتیبان رمزنگاری‌شده‌ای ایجاد نشده است</td></tr>';
        return;
      }
      tbody.innerHTML = backups.map((backup) => {
        const filename = escapeHtml(backup.filename);
        const encoded = encodeURIComponent(backup.filename);
        const createdAt = typeof window.toJalali === 'function'
          ? window.toJalali(backup.date || backup.created_at || '')
          : String(backup.created_at || '—');
        return `<tr>
          <td dir="ltr">${filename}</td>
          <td>${escapeHtml(createdAt || '—')}</td>
          <td>${escapeHtml(formatBytes(backup.size))}</td>
          <td><div class="nv-db-table-actions">
            <a class="nv-db-mini-btn" href="/api/admin/backup/download/${encoded}"><i class="icon-download" aria-hidden="true"></i><span>دانلود</span></a>
            <button class="nv-db-mini-btn is-danger" type="button" data-delete-backup="${encoded}"><i class="icon-trash" aria-hidden="true"></i><span>حذف</span></button>
          </div></td>
        </tr>`;
      }).join('');
    } catch (error) {
      tbody.innerHTML = '<tr><td colspan="4" class="nv-db-empty">بارگذاری فهرست پشتیبان‌ها ناموفق بود</td></tr>';
      setInlineResult(error.message || 'خطا در بارگذاری پشتیبان‌ها', 'error');
    }
  }

  async function createEncryptedBackup() {
    const button = document.getElementById('createBackupBtn');
    if (!button || button.disabled) return;
    clearInlineResult();
    const original = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="icon-refresh" aria-hidden="true"></i><span>در حال ایجاد پشتیبان...</span>';
    try {
      const result = await window.apiRequest('/admin/backup', 'POST');
      setInlineResult(result.message || 'نسخه پشتیبان رمزنگاری‌شده ایجاد شد', 'success');
      await loadBackups();
    } catch (error) {
      setInlineResult(error.message || 'ایجاد نسخه پشتیبان ناموفق بود', 'error');
    } finally {
      button.disabled = false;
      button.innerHTML = original;
    }
  }

  function modalElements() {
    return {
      modal: document.getElementById('dbActionModal'),
      title: document.getElementById('dbModalTitle'),
      description: document.getElementById('dbModalDescription'),
      warning: document.getElementById('dbModalWarning'),
      phraseField: document.getElementById('dbConfirmationField'),
      phrase: document.getElementById('dbExpectedPhrase'),
      confirmation: document.getElementById('dbConfirmationText'),
      password: document.getElementById('dbAdminPassword'),
      submit: document.getElementById('dbModalSubmit'),
      error: document.getElementById('dbModalError'),
      acknowledge: document.getElementById('dbBackupAcknowledge'),
      acknowledgeWrap: document.getElementById('dbBackupAcknowledgeWrap')
    };
  }

  function openModal(action) {
    const elements = modalElements();
    if (!elements.modal) return;
    state.action = action;
    elements.error.classList.remove('is-visible');
    elements.error.textContent = '';
    elements.password.value = '';
    elements.confirmation.value = '';
    if (elements.acknowledge) elements.acknowledge.checked = false;

    if (action === 'sql') {
      elements.title.textContent = 'دانلود نسخه SQL';
      elements.description.textContent = 'این فایل رمزنگاری نشده است و فقط هنگام دانلود روی سرور ساخته می‌شود.';
      elements.warning.textContent = 'فایل SQL شامل اطلاعات حساس بیماران و سامانه است. پس از انتقال، آن را در محل امن و رمزنگاری‌شده نگهداری کنید.';
      elements.phraseField.hidden = true;
      if (elements.acknowledgeWrap) elements.acknowledgeWrap.hidden = true;
      elements.submit.textContent = 'تأیید و دانلود SQL';
      elements.submit.className = 'nv-db-btn nv-db-btn-primary';
    } else {
      const full = action === 'full';
      elements.title.textContent = full ? 'بازنشانی کامل پایگاه داده' : 'پاک‌سازی داده‌های عملیاتی';
      elements.description.textContent = full
        ? 'تمام رکوردهای جدول‌ها پاک می‌شوند؛ حساب مدیر فعلی، رمز عبور، نشست فعال و احراز هویت دومرحله‌ای او همراه تاریخچه migration و پشتیبان ایمنی حفظ می‌شود.'
        : 'اطلاعات بیماران، نوبت‌ها، پرداخت‌ها و داده‌های عملیاتی پاک می‌شوند؛ حساب‌های کارکنان و تنظیمات پایه باقی می‌مانند.';
      elements.warning.textContent = 'پیش از حذف، سامانه به‌صورت اجباری یک پشتیبان رمزنگاری‌شده می‌سازد. بدون موفقیت پشتیبان، پاک‌سازی اجرا نمی‌شود.';
      elements.phraseField.hidden = false;
      if (elements.acknowledgeWrap) elements.acknowledgeWrap.hidden = false;
      elements.phrase.textContent = state.phrases[action] || '';
      elements.submit.textContent = full ? 'پشتیبان‌گیری و حذف کامل' : 'پشتیبان‌گیری و پاک‌سازی';
      elements.submit.className = `nv-db-btn ${full ? 'nv-db-btn-danger' : 'nv-db-btn-warning'}`;
    }

    elements.modal.hidden = false;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => elements.password.focus(), 40);
  }

  function closeModal() {
    const elements = modalElements();
    if (!elements.modal || elements.submit.disabled) return;
    elements.modal.hidden = true;
    document.body.style.overflow = '';
    state.action = null;
  }

  function filenameFromResponse(response) {
    const disposition = response.headers.get('content-disposition') || '';
    const match = disposition.match(/filename="?([^";]+)"?/i);
    return match ? match[1] : `noorvista_database_${Date.now()}.sql`;
  }

  async function exportSql(password) {
    const response = await window.fetch('/api/admin/backup/export-sql', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/sql, application/json' },
      body: JSON.stringify({ password })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message || 'دانلود نسخه SQL ناموفق بود');
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filenameFromResponse(response);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function submitModal(event) {
    event.preventDefault();
    const elements = modalElements();
    const action = state.action;
    if (!action || elements.submit.disabled) return;
    const password = elements.password.value;
    const confirmationText = elements.confirmation.value;
    const acknowledgeBackup = Boolean(elements.acknowledge?.checked);
    elements.error.classList.remove('is-visible');
    elements.error.textContent = '';
    if (!password) {
      elements.error.textContent = 'رمز عبور مدیر سیستم را وارد کنید';
      elements.error.classList.add('is-visible');
      elements.password.focus();
      return;
    }
    if (action !== 'sql' && !acknowledgeBackup) {
      elements.error.textContent = 'تأیید تهیه پشتیبان ایمنی الزامی است';
      elements.error.classList.add('is-visible');
      elements.acknowledge?.focus();
      return;
    }

    const original = elements.submit.textContent;
    elements.submit.disabled = true;
    elements.submit.textContent = action === 'sql' ? 'در حال آماده‌سازی فایل...' : 'در حال پشتیبان‌گیری و پاک‌سازی...';
    try {
      if (action === 'sql') {
        await exportSql(password);
        elements.submit.disabled = false;
        closeModal();
        setInlineResult('نسخه SQL دانلود شد؛ فایل را در محل امن نگهداری کنید', 'success');
        return;
      }

      const result = await window.apiRequest('/admin/database/reset', 'POST', {
        password,
        mode: action,
        confirmation_text: confirmationText,
        acknowledge_backup: acknowledgeBackup
      });
      elements.submit.disabled = false;
      closeModal();
      setInlineResult(result.message || 'پاک‌سازی پایگاه داده انجام شد', 'success');
      await loadMaintenanceStatus();
      await loadBackups();
      if (result.result?.sessionInvalidated || result.result?.session_invalidated) {
        window.setTimeout(() => window.location.replace('/login?reason=database-reset'), 1800);
      }
    } catch (error) {
      elements.error.textContent = error.message || 'عملیات ناموفق بود';
      elements.error.classList.add('is-visible');
    } finally {
      elements.submit.disabled = false;
      elements.submit.textContent = original;
    }
  }

  async function deleteBackup(button) {
    const filename = decodeURIComponent(button.dataset.deleteBackup || '');
    if (!validBackupFilename(filename)) return;
    const accepted = window.confirm(`فایل «${filename}» حذف شود؟`);
    if (!accepted) return;
    button.disabled = true;
    try {
      await window.apiRequest(`/admin/backup/${encodeURIComponent(filename)}`, 'DELETE');
      setInlineResult('فایل پشتیبان حذف شد', 'success');
      await loadBackups();
    } catch (error) {
      setInlineResult(error.message || 'حذف فایل پشتیبان ناموفق بود', 'error');
      button.disabled = false;
    }
  }

  async function init() {
    if (!await window.SadraPanel.initPage({ panelRole: 'admin' })) return;
    document.getElementById('createBackupBtn')?.addEventListener('click', createEncryptedBackup);
    document.getElementById('downloadSqlBtn')?.addEventListener('click', () => openModal('sql'));
    document.querySelectorAll('[data-reset-mode]').forEach((button) => {
      button.addEventListener('click', () => openModal(button.dataset.resetMode));
    });
    document.getElementById('dbActionForm')?.addEventListener('submit', submitModal);
    document.querySelectorAll('[data-db-modal-close]').forEach((button) => button.addEventListener('click', closeModal));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !document.getElementById('dbActionModal')?.hidden) closeModal();
    });
    document.getElementById('backupsTable')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-delete-backup]');
      if (button) void deleteBackup(button);
    });
    await Promise.all([loadMaintenanceStatus(), loadBackups()]);
  }

  document.addEventListener('DOMContentLoaded', () => { void init(); });
})();
