
(function () {
  if (window.__NV_PUBLIC_TOPBAR_BOOKING_CHAT_FIX_2167__) return;
  window.__NV_PUBLIC_TOPBAR_BOOKING_CHAT_FIX_2167__ = true;

  const PHONE_SVG = '<svg class="nv-mobile-call-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.61 21 3 13.39 3 4a1 1 0 0 1 1-1h3.49a1 1 0 0 1 1 1c0 1.24.2 2.45.57 3.57a1 1 0 0 1-.25 1.02l-2.19 2.2Z"/></svg>';

  function qs(selector, root = document) { return root.querySelector(selector); }
  function qsa(selector, root = document) { return Array.from(root.querySelectorAll(selector)); }
  function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }

  function getPhoneHref() {
    const link = qs('a[href^="tel:"], a.topbar-phone[href^="tel:"], [data-topbar-item="phone"][href^="tel:"]');
    return link?.getAttribute('href') || '#';
  }

  function stabilizeTopbar() {
    const topbar = qs('.topbar');
    if (!topbar) return;
    const inner = qs('.topbar-inner', topbar) || qs('.container', topbar) || topbar;
    const info = qs('.topbar-info', topbar);
    const socials = qs('.socials', topbar);
    if (!info) return;

    topbar.classList.add('nv-mobile-topbar-v2');
    inner.classList.add('nv-mobile-topbar-v2-inner');

    const location = qs('[data-topbar-item="location"]', info) || qsa('span', info)[0];
    const clock = qs('[data-topbar-item="clock"]', info);
    const phone = qs('[data-topbar-item="phone"], a.topbar-phone', info);

    if (location) {
      location.dataset.topbarItem = 'location';
      location.classList.add('nv-mobile-location-item');
    }
    if (clock) clock.hidden = false;

    let call = qs('.nv-mobile-call-action', inner);
    if (!call) {
      call = document.createElement('a');
      call.className = 'nv-mobile-call-action';
      inner.insertBefore(call, inner.firstChild);
    }
    call.href = getPhoneHref();
    call.title = 'تماس';
    call.setAttribute('aria-label', 'تماس تلفنی با کلینیک');
    call.innerHTML = PHONE_SVG;

    if (socials) {
      socials.classList.add('nv-mobile-social-center');
      if (socials.parentElement !== inner) inner.appendChild(socials);
    }

    // On mobile, keep only address in .topbar-info; on desktop, keep normal info items and hide the separate call icon.
    if (window.matchMedia('(max-width: 720px)').matches) {
      if (location && location.parentElement !== info) info.appendChild(location);
      qsa(':scope > *', info).forEach((el) => {
        if (el !== location) el.remove();
      });
    } else {
      call.hidden = true;
      if (phone && phone.parentElement !== info) info.appendChild(phone);
      if (clock && clock.parentElement !== info) {
        const loc = qs('[data-topbar-item="location"]', info);
        if (loc?.nextSibling) info.insertBefore(clock, loc.nextSibling);
        else info.appendChild(clock);
      }
      qsa('.nv-mobile-topbar-actions', topbar).forEach((el) => el.remove());
    }

    qsa('.nv-mobile-doctor-glass').forEach((card) => {
      if (!window.matchMedia('(max-width: 720px)').matches) card.remove();
    });
  }

  function closeChatbotHard() {
    const chatWindow = qs('#chat-window');
    if (chatWindow) chatWindow.style.display = 'none';
    qsa('#chatbotPanel, .chatbot-panel, .chatbot-widget').forEach((panel) => {
      panel.classList.remove('open', 'active', 'is-open');
      panel.setAttribute('aria-hidden', 'true');
      if (panel.style) { panel.style.display = 'none'; panel.style.pointerEvents = 'none'; }
    });
    document.body.classList.remove('chatbot-open');
    document.documentElement.classList.remove('chatbot-lock');
  }

  function openBookingHard() {
    const trigger = qsa('[data-open-booking], .nav-booking, .open-booking, .floating-booking')
      .find((el) => !el.closest('#chatbotPanel, .chatbot-panel, .chatbot-widget') && !el.classList.contains('chat-action-btn'));
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

  function isChatbotBookingTarget(target) {
    const trigger = target?.closest?.('button, a, [data-chat-booking], .chat-booking-action, [data-open-booking], .chat-action-btn, .chatbot-action-btn, .chatbot-chip');
    if (!trigger) return null;
    const inChat = trigger.closest('#chatbotPanel, .chatbot-panel, .chatbot-widget, #chatbotMessages, .chatbot-messages');
    if (!inChat) return null;
    const text = clean(trigger.textContent || trigger.getAttribute('aria-label') || trigger.getAttribute('data-chat-prompt') || '');
    if (trigger.hasAttribute('data-open-booking') || trigger.hasAttribute('data-chat-booking') || /دریافت نوبت|رزرو نوبت|نوبت/.test(text)) return trigger;
    return null;
  }

  function interceptChatbotBooking(event) {
    const trigger = isChatbotBookingTarget(event.target);
    if (!trigger) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    closeChatbotHard();
    window.setTimeout(openBookingHard, 180);
  }

  function run() {
    stabilizeTopbar();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();

  document.addEventListener('noorvista:public-settings', () => {
    setTimeout(run, 0);
    setTimeout(run, 180);
    setTimeout(run, 500);
  });

  ['pointerdown', 'click', 'touchend'].forEach((type) => {
    document.addEventListener(type, interceptChatbotBooking, true);
  });

  window.addEventListener('resize', () => {
    clearTimeout(window.__NV_2167_RESIZE__);
    window.__NV_2167_RESIZE__ = setTimeout(run, 140);
  }, { passive: true });
})();
