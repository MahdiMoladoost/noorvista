
(function () {
  if (window.__NV_PUBLIC_TAILWIND_PAGES_2166__) return;
  window.__NV_PUBLIC_TAILWIND_PAGES_2166__ = true;

  const PHONE_SVG = '<svg class="nv-mobile-call-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.61 21 3 13.39 3 4a1 1 0 0 1 1-1h3.49a1 1 0 0 1 1 1c0 1.24.2 2.45.57 3.57a1 1 0 0 1-.25 1.02l-2.19 2.2Z"/></svg>';

  function qs(selector, root = document) { return root.querySelector(selector); }
  function qsa(selector, root = document) { return Array.from(root.querySelectorAll(selector)); }
  function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
  function isMobile() { return window.matchMedia('(max-width: 720px)').matches; }

  function markPublicPage() {
    document.body.classList.add('nv-public-tailwind-v2');
    document.body.classList.add('nv-public-page');
  }

  function normalizeLabels() {
    qsa('a, button, span, small, strong').forEach((el) => {
      const text = clean(el.textContent);
      if (text === 'ورود پنل' || text === 'ورود به پنل') el.textContent = 'ورود';
    });
  }

  function stabilizeTopbar() { /* 2.1.168: final-topbar-stable owns the topbar; keep this no-op to stop DOM flicker. */ }

  function handleChatbotBooking(event) {
    const trigger = event.target.closest('button, a, .chatbot-chip, [data-chat-prompt], [data-open-appointment], [data-open-booking]');
    if (!trigger) return;

    const text = clean(trigger.textContent || trigger.getAttribute('data-chat-prompt') || trigger.getAttribute('aria-label') || '');
    const isBookingIntent = /دریافت نوبت|رزرو نوبت|نوبت/.test(text) && trigger.closest('.chatbot-panel, .chatbot-widget, #chatbotPanel, .chatbot-messages');
    if (!isBookingIntent) return;

    const chatbot = qs('#chatbotPanel') || qs('.chatbot-panel') || qs('.chatbot-widget');
    const closeBtn = qs('[data-chatbot-close], .chatbot-close, #chatbotClose', chatbot || document);
    if (closeBtn) closeBtn.click();
    else if (chatbot) {
      chatbot.classList.remove('is-open', 'open', 'active');
      chatbot.setAttribute('hidden', '');
    }

    window.setTimeout(() => {
      const bookingTrigger = qs('[data-open-appointment], [data-open-booking], .open-appointment, .open-booking, a[href="#appointment"], a[href="#booking"]');
      if (bookingTrigger) bookingTrigger.click();
      else if (window.NoorVistaBooking && typeof window.NoorVistaBooking.open === 'function') window.NoorVistaBooking.open();
      else document.dispatchEvent(new CustomEvent('noorvista:open-booking'));
    }, 180);
  }

  function normalizeMobileDoctorCard() {
    qsa('.nv-mobile-doctor-glass').forEach((card) => {
      if (!isMobile()) card.remove();
    });
  }

  function run() {
    markPublicPage();
    normalizeLabels();
    stabilizeTopbar();
    normalizeMobileDoctorCard();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }

  document.addEventListener('noorvista:public-settings', () => {
    setTimeout(run, 0);
    setTimeout(run, 140);
  });

  document.addEventListener('click', handleChatbotBooking, true);

  window.addEventListener('resize', () => {
    clearTimeout(window.__NV_PUBLIC_TW_RESIZE_TIMER__);
    window.__NV_PUBLIC_TW_RESIZE_TIMER__ = setTimeout(run, 140);
  }, { passive: true });
})();
