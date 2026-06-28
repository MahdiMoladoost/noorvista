
(function () {
  if (window.__NV_PUBLIC_MOBILE_UX_2160__) return;
  window.__NV_PUBLIC_MOBILE_UX_2160__ = true;

  function qs(selector, root) { return (root || document).querySelector(selector); }
  function qsa(selector, root) { return Array.from((root || document).querySelectorAll(selector)); }

  function isMobile() { return window.matchMedia('(max-width: 720px)').matches; }

  function findHeader(btn) {
    return btn.closest('.navbar, header, .site-header') || qs('.navbar') || qs('header');
  }

  function findMenu(header) {
    return qs('.menu, .nav-menu, .main-menu', header || document) || qs('.menu, .nav-menu, .main-menu');
  }

  function setMenu(open, btn, menu, header) {
    if (!menu) return;
    menu.classList.toggle('open', open);
    menu.classList.toggle('is-open', open);
    if (header) header.classList.toggle('is-menu-open', open);
    document.body.classList.toggle('nv-mobile-menu-open', open);
    if (btn) {
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-label', open ? 'بستن منو' : 'باز کردن منو');
    }
  }

  function initMobileMenu() {
    qsa('.mobile-toggle, #mobileToggle, .nv-mobile-toggle, .nav-toggle, .menu-toggle').forEach((btn) => {
      if (btn.dataset.nvMobileUx160) return;
      btn.dataset.nvMobileUx160 = '1';
      btn.setAttribute('aria-expanded', 'false');
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const header = findHeader(btn);
        const menu = findMenu(header);
        const open = !(menu && (menu.classList.contains('open') || menu.classList.contains('is-open')));
        setMenu(open, btn, menu, header);
      }, true);
    });

    document.addEventListener('click', (event) => {
      if (!document.body.classList.contains('nv-mobile-menu-open')) return;
      const header = qs('.navbar.is-menu-open') || qs('.navbar') || qs('header');
      if (event.target.closest('.mobile-toggle, #mobileToggle, .nv-mobile-toggle, .nav-toggle, .menu-toggle')) return;
      if (event.target.closest('.menu, .nav-menu, .main-menu')) return;
      const btn = qs('.mobile-toggle[aria-expanded="true"], #mobileToggle[aria-expanded="true"], .nav-toggle[aria-expanded="true"], .menu-toggle[aria-expanded="true"]');
      setMenu(false, btn, findMenu(header), header);
    }, true);

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      const btn = qs('.mobile-toggle[aria-expanded="true"], #mobileToggle[aria-expanded="true"], .nav-toggle[aria-expanded="true"], .menu-toggle[aria-expanded="true"]');
      if (!btn) return;
      const header = findHeader(btn);
      setMenu(false, btn, findMenu(header), header);
    });

    document.addEventListener('click', (event) => {
      const link = event.target.closest('.navbar .menu a, .navbar .nav-menu a, .navbar .main-menu a');
      if (!link) return;
      const li = link.closest('.has-mega');
      if (li && isMobile() && link.getAttribute('href') && link.getAttribute('href').includes('services')) {
        event.preventDefault();
        li.classList.toggle('is-open');
        return;
      }
      const btn = qs('.mobile-toggle[aria-expanded="true"], #mobileToggle[aria-expanded="true"]');
      const header = btn ? findHeader(btn) : qs('.navbar');
      setMenu(false, btn, findMenu(header), header);
    }, true);
  }

  function normalizeFloatingActions() {
    qsa('.floating-actions').forEach((wrap) => {
      const booking = qs('.floating-booking, [data-open-booking]', wrap);
      const consult = qs('.floating-consult, .open-chat, [data-open-chat]', wrap);
      Array.from(wrap.children).forEach((child) => {
        if (child !== booking && child !== consult) child.remove();
      });
      if (booking && consult) {
        wrap.appendChild(booking);
        wrap.appendChild(consult);
      }
    });
  }

  function closeChatbotBeforeBooking() {
    document.addEventListener('click', (event) => {
      const insideChatBooking = event.target.closest('#chatbotPanel [data-open-booking], .chatbot-panel [data-open-booking], #chatbotPanel .nav-booking, .chatbot-panel .nav-booking, .chat-action-btn.nav-booking');
      if (!insideChatBooking) return;
      qsa('#chatbotPanel, .chatbot-panel').forEach((panel) => {
        panel.classList.remove('open');
        panel.setAttribute('aria-hidden', 'true');
      });
      document.body.classList.remove('chatbot-open');
      document.documentElement.classList.remove('chatbot-lock');
    }, true);
  }

  function run() {
    initMobileMenu();
    normalizeFloatingActions();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
  closeChatbotBeforeBooking();

  const obs = new MutationObserver(() => {
    clearTimeout(obs._timer);
    obs._timer = setTimeout(run, 120);
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
})();
