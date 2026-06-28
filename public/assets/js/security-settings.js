(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);

  async function api(url, options) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      window.location.href = '/login';
      throw new Error('نشست شما منقضی شده است.');
    }
    if (!response.ok) throw new Error(data.message || 'عملیات انجام نشد.');
    return data;
  }

  function text(id, value) { const element = $(id); if (element) element.textContent = value || ''; }

  async function loadMfa() {
    try {
      const data = await api('/api/auth/2fa/status');
      text('mfaStatus', data.enabled ? ' احراز هویت دومرحله‌ای فعال است.' : '️ احراز هویت دومرحله‌ای فعال نیست.');
      $('mfaSetup').hidden = Boolean(data.enabled);
      $('disableMfaForm').hidden = !data.enabled || Boolean(data.required);
      if (data.required) text('disableMfaHelp', 'برای نقش شما 2FA اجباری است و امکان غیرفعال‌سازی ندارد.');
    } catch (error) { text('mfaError', error.message); }
  }

  $('startMfaBtn')?.addEventListener('click', async () => {
    text('mfaError', '');
    try {
      const data = await api('/api/auth/2fa/setup', { method: 'POST' });
      $('mfaSecret').value = data.secret || '';
      $('mfaSecretBox').hidden = false;
      $('mfaCode').focus();
    } catch (error) { text('mfaError', error.message); }
  });

  $('enableMfaBtn')?.addEventListener('click', async () => {
    text('mfaError', '');
    const code = $('mfaCode').value.trim();
    if (!/^\d{6}$/.test(code)) { text('mfaError', 'کد شش‌رقمی معتبر وارد کنید.'); return; }
    try {
      const data = await api('/api/auth/2fa/enable', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code })
      });
      const recovery = $('recoveryCodes');
      recovery.hidden = false;
      recovery.innerHTML = '<strong>کدهای بازیابی یک‌بارمصرف</strong><p>این کدها فقط همین یک‌بار نمایش داده می‌شوند. آن‌ها را در محل امن ذخیره کنید.</p><pre></pre>';
      recovery.querySelector('pre').textContent = (data.recovery_codes || []).join('\n');
      await loadMfa();
    } catch (error) { text('mfaError', error.message); }
  });

  $('disableMfaForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    text('mfaError', '');
    try {
      await api('/api/auth/2fa/disable', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: $('disablePassword').value, code: $('disableCode').value.trim() })
      });
      event.target.reset();
      await loadMfa();
    } catch (error) { text('mfaError', error.message); }
  });

  function formatDate(value) {
    if (!value) return 'ثبت نشده';
    try { return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
    catch (_) { return String(value); }
  }

  async function loadSessions() {
    text('sessionsError', '');
    try {
      const data = await api('/api/auth/sessions');
      const container = $('sessions');
      container.replaceChildren();
      if (!data.sessions?.length) { container.textContent = 'نشست فعالی ثبت نشده است.'; return; }
      for (const session of data.sessions) {
        const card = document.createElement('article');
        card.className = `session${session.current ? ' current' : ''}`;
        const title = document.createElement('strong');
        title.textContent = session.current ? 'این دستگاه' : 'دستگاه دیگر';
        const details = document.createElement('dl');
        for (const [label, value] of [
          ['IP', session.ip || 'نامشخص'], ['مرورگر', session.user_agent || 'نامشخص'],
          ['ایجاد', formatDate(session.created_at)], ['آخرین استفاده', formatDate(session.last_used_at)],
          ['انقضا', formatDate(session.expires_at)]
        ]) {
          const dt = document.createElement('dt'); dt.textContent = label;
          const dd = document.createElement('dd'); dd.textContent = value;
          details.append(dt, dd);
        }
        card.append(title, details);
        if (!session.current) {
          const button = document.createElement('button');
          button.type = 'button'; button.textContent = 'لغو این نشست';
          button.addEventListener('click', async () => {
            try { await api(`/api/auth/sessions/${encodeURIComponent(session.id)}`, { method: 'DELETE' }); await loadSessions(); }
            catch (error) { text('sessionsError', error.message); }
          });
          card.append(button);
        }
        container.append(card);
      }
    } catch (error) { text('sessionsError', error.message); }
  }

  $('revokeOthersBtn')?.addEventListener('click', async () => {
    text('sessionsError', '');
    try { await api('/api/auth/sessions/others', { method: 'DELETE' }); await loadSessions(); }
    catch (error) { text('sessionsError', error.message); }
  });
  $('logoutBtn')?.addEventListener('click', () => window.noorvistaLogout());

  Promise.all([loadMfa(), loadSessions()]);
})();
