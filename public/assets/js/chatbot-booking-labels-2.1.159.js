(function () {
  if (window.__NV_CHATBOT_BOOKING_LABELS_2159_SAFE__) return;
  window.__NV_CHATBOT_BOOKING_LABELS_2159_SAFE__ = true;

  const CHAT_ROOT = '#ai-chat-widget, #chat-window, #chatbotPanel, .chatbot-panel, .chatbot-widget, #chatbotMessages, .chatbot-messages';

  function closeChatbot() {
    const chatWindow = document.getElementById('chat-window');
    if (chatWindow) chatWindow.style.display = 'none';

    document.querySelectorAll('#chatbotPanel, .chatbot-panel, .chatbot-widget').forEach((panel) => {
      panel.classList.remove('open', 'active', 'is-open');
      panel.setAttribute('aria-hidden', 'true');
      if (panel.style) { panel.style.display = 'none'; panel.style.pointerEvents = 'none'; }
    });

    document.body.classList.remove('chatbot-open');
    document.documentElement.classList.remove('chatbot-lock');
  }

  function openBooking() {
    const trigger = Array.from(document.querySelectorAll('[data-open-booking], .nav-booking, .open-booking, .floating-booking, .booking-btn'))
      .find(el => !el.closest(CHAT_ROOT) && !el.closest('.faq-item, .faq-list, #homepageFaqList, [data-faq-source]'));
    if (trigger) {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return;
    }
    if (window.NoorVistaBooking && typeof window.NoorVistaBooking.open === 'function') {
      window.NoorVistaBooking.open();
      return;
    }
    document.dispatchEvent(new CustomEvent('nv:open-appointment-booking'));
  }

  document.addEventListener('click', (event) => {
    const target = event.target && event.target.closest ? event.target.closest(
      '[data-chat-booking], .chat-booking-action, [data-open-booking], .chat-action-btn, .chatbot-action-btn, .chatbot-chip, button, a'
    ) : null;
    if (!target) return;
    if (!target.closest(CHAT_ROOT)) return;

    const text = (target.textContent || target.getAttribute('aria-label') || target.getAttribute('data-chat-prompt') || '').trim();
    const isBooking = target.hasAttribute('data-open-booking') || target.hasAttribute('data-chat-booking') || /رزرو\s*نوبت|دریافت\s*نوبت|گرفتن\s*نوبت|ثبت\s*نوبت/.test(text);
    if (!isBooking) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    closeChatbot();
    setTimeout(openBooking, 120);
  }, true);
})();
