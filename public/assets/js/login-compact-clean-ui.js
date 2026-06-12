// NOORVISTA Login Compact Clean UI
// فقط برای کلیک روی حساب‌های تست و پاک‌کردن متن‌های اضافه اگر DOM قدیمی بود.
(function () {
  if (window.__NV_LOGIN_COMPACT_CLEAN_UI__) return;
  window.__NV_LOGIN_COMPACT_CLEAN_UI__ = true;

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

  function cleanupOldDemoNotes() {
    document.querySelectorAll('.default-credentials .demo-note').forEach((note, index) => {
      note.style.display = 'none';
    });
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
    document.addEventListener('DOMContentLoaded', cleanupOldDemoNotes);
  } else {
    cleanupOldDemoNotes();
  }
})();
