// NOORVISTA Login Ultra Compact
(function () {
  if (window.__NV_LOGIN_ULTRA_COMPACT__) return;
  window.__NV_LOGIN_ULTRA_COMPACT__ = true;

  function removeExtras() {
    document.querySelectorAll(
      '.login-tabs, #sms-tab, #smsLoginForm, .server-status, .login-footer-links, .form-options, .forgot-modal, .login-trust-strip'
    ).forEach(el => el.remove());

    document.querySelectorAll('.login-header p').forEach(el => el.remove());

    const passwordTab = document.querySelector('#password-tab');
    if (passwordTab) {
      passwordTab.classList.add('active', 'nv-password-only');
      passwordTab.removeAttribute('id');
    }
  }

  function findInput(selectors) {
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) return el;
    }
    return null;
  }

  function fillLogin(username, password) {
    const usernameInput = findInput([
      '#username',
      '#loginUsername',
      'input[name="username"]',
      'input[name="phone"]',
      'input[name="mobile"]',
      'input[type="text"]'
    ]);

    const passwordInput = findInput([
      '#password',
      '#loginPassword',
      'input[name="password"]',
      'input[type="password"]'
    ]);

    if (usernameInput) {
      usernameInput.value = username;
      usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
      usernameInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    if (passwordInput) {
      passwordInput.value = password;
      passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
      passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  document.addEventListener('click', function (event) {
    const item = event.target.closest('.credential-item');
    if (!item) return;

    fillLogin(
      item.getAttribute('data-username') || '',
      item.getAttribute('data-password') || ''
    );
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', removeExtras);
  } else {
    removeExtras();
  }

  window.addEventListener('load', () => {
    setTimeout(removeExtras, 100);
    setTimeout(removeExtras, 500);
  });
})();
