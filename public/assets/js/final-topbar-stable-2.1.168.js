
(function () {
  if (window.__NV_FINAL_TOPBAR_STABLE_2168__) return;
  window.__NV_FINAL_TOPBAR_STABLE_2168__ = true;

  const ICONS = {
    location: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2a10 10 0 1 0 .01 0ZM13 7h-2v6l5 3 1-1.73-4-2.27V7Z"/></svg>',
    phone: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.61 21 3 13.39 3 4a1 1 0 0 1 1-1h3.49a1 1 0 0 1 1 1c0 1.24.2 2.45.57 3.57a1 1 0 0 1-.25 1.02l-2.19 2.2Z"/></svg>'
  };

  function qs(selector, root = document) { return root.querySelector(selector); }
  function qsa(selector, root = document) { return Array.from(root.querySelectorAll(selector)); }
  function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
  function isMobile() { return window.matchMedia('(max-width: 720px)').matches; }

  function getText(selector) {
    const el = qs(selector);
    return clean(el?.querySelector?.('.nv-topbar-text')?.textContent || el?.textContent || '');
  }

  function getSettings(detail) {
    const address =
      clean(detail?.clinicAddress || detail?.clinic_address || '') ||
      clean(Array.isArray(detail?.clinicAddresses) ? detail.clinicAddresses[0]?.text : '') ||
      clean(document.documentElement.dataset.clinicAddress || '') ||
      getText('.topbar-info [data-topbar-item="location"]') ||
      getText('.topbar-info span:nth-child(1)');

    const hours =
      clean(detail?.workingHours || detail?.working_hours || '') ||
      getText('.topbar-info [data-topbar-item="clock"]') ||
      getText('.topbar-info span:nth-child(2)');

    const phone =
      clean(detail?.clinicPhone || detail?.clinic_phone || '') ||
      clean(document.documentElement.dataset.clinicPhone || '') ||
      getText('.topbar-info [data-topbar-item="phone"], .topbar-info a.topbar-phone') ||
      clean((qs('a[href^="tel:"]')?.getAttribute('href') || '').replace(/^tel:/, ''));

    return { address, hours, phone };
  }

  function phoneHref(phone) {
    const raw = clean(phone).replace(/[^\d۰-۹٠-٩]/g, '')
      .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
      .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
    return raw ? `tel:${raw}` : '#';
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  function makeItem(type, text, href) {
    const tag = href ? 'a' : 'span';
    const safe = escapeHtml(text);
    return `<${tag} class="nv-final-topbar-item nv-final-topbar-${type}" ${href ? `href="${href}" aria-label="تماس تلفنی"` : ''}><span class="nv-final-topbar-icon">${ICONS[type]}</span><span class="nv-final-topbar-text">${safe}</span></${tag}>`;
  }

  function makePhoneIcon(phone) {
    return `<a class="nv-final-topbar-call" href="${phoneHref(phone)}" aria-label="تماس تلفنی" title="تماس">${ICONS.phone}</a>`;
  }

  function ensureSocialClone(holder) {
    const original = qs('.topbar .socials');
    holder.innerHTML = '';
    if (!original) return;
    qsa('a.social-link', original).forEach((link) => {
      if (link.hidden || link.classList.contains('nv-empty-config-hidden')) return;
      const clone = link.cloneNode(true);
      clone.removeAttribute('style');
      clone.classList.add('nv-final-social-link');
      holder.appendChild(clone);
    });
  }

  function render(detail) {
    const topbar = qs('.topbar');
    if (!topbar) return;
    const inner = qs('.topbar-inner', topbar) || qs('.container', topbar) || topbar;
    const data = getSettings(detail);

    let final = qs('.nv-final-topbar', topbar);
    if (!final) {
      final = document.createElement('div');
      final.className = 'nv-final-topbar';
      inner.appendChild(final);
    }

    final.innerHTML = `
      <div class="nv-final-topbar-contact">
        ${data.address ? makeItem('location', data.address) : ''}
        ${data.hours ? makeItem('clock', data.hours) : ''}
        ${data.phone ? makeItem('phone', data.phone, phoneHref(data.phone)) : ''}
      </div>
      <div class="nv-final-topbar-socials"></div>
      ${data.phone ? makePhoneIcon(data.phone) : ''}
    `;
    ensureSocialClone(qs('.nv-final-topbar-socials', final));

    topbar.classList.add('nv-final-topbar-ready');
    topbar.classList.toggle('nv-final-topbar-mobile', isMobile());
    topbar.classList.toggle('nv-final-topbar-desktop', !isMobile());
  }

  function closeChatbotHard() {
    qsa('#chatbotPanel, .chatbot-panel, .chatbot-widget').forEach((panel) => {
      panel.classList.remove('open', 'active', 'is-open');
      panel.setAttribute('aria-hidden', 'true');
      panel.classList.add('nv-chatbot-closed-hard');
    });
    document.body.classList.remove('chatbot-open');
    document.documentElement.classList.remove('chatbot-lock');
  }

  function openBookingHard() {
    const trigger = qsa('[data-open-booking], .nav-booking, .open-booking, .floating-booking')
      .find(el => !el.closest('#chatbotPanel, .chatbot-panel, .chatbot-widget') && !el.classList.contains('chat-action-btn'));
    if (trigger) {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return;
    }
    document.dispatchEvent(new CustomEvent('noorvista:open-booking'));
    document.dispatchEvent(new CustomEvent('nv:open-appointment-booking'));
  }

  function interceptChatBooking(event) {
    const trigger = event.target?.closest?.('button, a, [data-open-booking], .chat-action-btn, .chatbot-chip');
    if (!trigger || !trigger.closest('#chatbotPanel, .chatbot-panel, .chatbot-widget, #chatbotMessages, .chatbot-messages')) return;
    const text = clean(trigger.textContent || trigger.getAttribute('aria-label') || trigger.getAttribute('data-chat-prompt') || '');
    if (!trigger.hasAttribute('data-open-booking') && !/دریافت نوبت|رزرو نوبت|نوبت/.test(text)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    closeChatbotHard();
    setTimeout(openBookingHard, 180);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => render(), { once: true });
  } else {
    render();
  }

  document.addEventListener('noorvista:public-settings', (event) => {
    render(event.detail || {});
    setTimeout(() => render(event.detail || {}), 150);
  });

  window.addEventListener('resize', () => {
    clearTimeout(window.__NV_FINAL_TOPBAR_RESIZE__);
    window.__NV_FINAL_TOPBAR_RESIZE__ = setTimeout(() => render(), 120);
  }, { passive: true });

  ['pointerdown', 'click', 'touchend'].forEach(type => {
    document.addEventListener(type, interceptChatBooking, true);
  });
})();
