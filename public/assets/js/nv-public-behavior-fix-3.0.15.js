(function () {
  'use strict';

  if (window.__NV_PUBLIC_BEHAVIOR_FIX_3019__) return;
  window.__NV_PUBLIC_BEHAVIOR_FIX_3019__ = true;

  const CHAT_ROOT_SELECTOR = [
    '#ai-chat-widget',
    '#chat-window',
    '#chatbotPanel',
    '.chatbot-panel',
    '.chatbot-widget',
    '#chatbotMessages',
    '.chatbot-messages'
  ].join(',');

  const BOOKING_SELECTOR = [
    '[data-open-booking]',
    '.nav-booking',
    '.open-booking',
    '.floating-booking',
    '.booking-btn'
  ].join(',');

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function isInsideChat(el) {
    return !!(el && el.closest && el.closest(CHAT_ROOT_SELECTOR));
  }

  function isBookingIntent(el) {
    if (!el) return false;
    if (el.matches && el.matches('[data-chat-booking], .chat-booking-action, .chat-action-btn, .chatbot-action-btn')) {
      const text = clean(el.textContent || el.getAttribute('aria-label') || '');
      return !text || /رزرو\s*نوبت|دریافت\s*نوبت|گرفتن\s*نوبت|ثبت\s*نوبت|نوبت/.test(text);
    }
    if (el.matches && el.matches('[data-open-booking]')) return true;
    const text = clean(el.textContent || el.getAttribute?.('aria-label') || el.getAttribute?.('data-chat-prompt') || '');
    return /رزرو\s*نوبت|دریافت\s*نوبت|گرفتن\s*نوبت|ثبت\s*نوبت/.test(text);
  }

  function closeChatbotHard() {
    const chatWindow = document.getElementById('chat-window');
    if (chatWindow) chatWindow.style.display = 'none';

    const aiWidget = document.getElementById('ai-chat-widget');
    if (aiWidget) {
      aiWidget.classList.remove('open', 'active', 'is-open');
      aiWidget.setAttribute('aria-expanded', 'false');
    }

    document.querySelectorAll('#chatbotPanel, .chatbot-panel, .chatbot-widget').forEach(panel => {
      panel.classList.remove('open', 'active', 'is-open');
      panel.setAttribute('aria-hidden', 'true');
      panel.setAttribute('inert', '');
      if (panel.style) {
        panel.style.display = 'none';
        panel.style.pointerEvents = 'none';
      }
    });

    document.body.classList.remove('chatbot-open');
    document.documentElement.classList.remove('chatbot-lock');
  }

  function reopenChatbotVisualState(panel) {
    if (!panel) return;
    panel.removeAttribute('inert');
    if (panel.style) {
      panel.style.display = '';
      panel.style.pointerEvents = '';
    }
  }

  function openBookingModal(source) {
    const trigger = Array.from(document.querySelectorAll(BOOKING_SELECTOR)).find(el => {
      if (!el || el === source) return false;
      if (isInsideChat(el)) return false;
      if (el.closest && el.closest('.faq-item, .faq-list, #homepageFaqList, [data-faq-source]')) return false;
      return true;
    });

    if (trigger) {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return;
    }

    if (window.NoorVistaBooking && typeof window.NoorVistaBooking.open === 'function') {
      window.NoorVistaBooking.open();
      return;
    }

    document.dispatchEvent(new CustomEvent('noorvista:open-booking'));
    document.dispatchEvent(new CustomEvent('nv:open-appointment-booking'));
  }

  // FAQ is intentionally not intercepted here. public-faq.js handles FAQ accordion.
  document.addEventListener('click', function (event) {
    const candidate = event.target && event.target.closest && event.target.closest(
      'button, a, [role="button"], .chat-action-btn, .chatbot-action-btn, .chatbot-chip, [data-chat-booking], [data-open-booking]'
    );
    if (!candidate) return;
    if (!isInsideChat(candidate)) return;
    if (!isBookingIntent(candidate)) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    closeChatbotHard();
    window.setTimeout(() => openBookingModal(candidate), 160);
  }, true);

  document.addEventListener('click', function (event) {
    const open = event.target && event.target.closest && event.target.closest('.open-chat, [data-open-chat], #chat-toggle-btn');
    if (!open) return;
    document.querySelectorAll('#chatbotPanel, .chatbot-panel, .chatbot-widget').forEach(reopenChatbotVisualState);
  }, true);

  window.NVPublicBehaviorFix3019 = {
    closeChatbot: closeChatbotHard,
    openBookingModal
  };
})();
