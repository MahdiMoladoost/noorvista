(function () {
  'use strict';

  if (window.__NV_TOPBAR_FINAL_305__) return;
  window.__NV_TOPBAR_FINAL_305__ = true;

  const FA = '۰۱۲۳۴۵۶۷۸۹';
  const AR = '٠١٢٣٤٥٦٧٨٩';
  const DEFAULTS = { address: 'تهران، چیتگر', hours: '۸:۰۰ تا ۱۷:۰۰', phone: '۰۹۲۲۱۹۷۱۳۹۷' };
  const SOCIALS = ['whatsapp', 'instagram', 'bale', 'telegram', 'rubika', 'eitaa'];

  const ICONS = {
    location: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2a10 10 0 1 0 .01 0ZM13 7h-2v6l5 3 1-1.73-4-2.27V7Z"/></svg>',
    phone: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.61 21 3 13.39 3 4a1 1 0 0 1 1-1h3.49a1 1 0 0 1 1 1c0 1.24.2 2.45.57 3.57a1 1 0 0 1-.25 1.02l-2.19 2.2Z"/></svg>'
  };

  const SOCIAL_ICON = name => `/assets/icons/social_media/${name}.webp`;
  const SOCIAL_LABELS = {
    whatsapp: 'واتساپ', instagram: 'اینستاگرام', bale: 'بله', telegram: 'تلگرام', rubika: 'روبیکا', eitaa: 'ایتا'
  };

  let latest = {};
  let lastKey = '';
  let applying = false;
  let toastTimer = null;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clean = v => String(v || '').replace(/\s+/g, ' ').trim();
  const esc = v => String(v || '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const isMobile = () => window.matchMedia('(max-width: 720px)').matches;

  function toFa(value) {
    return String(value || '')
      .replace(/[0-9]/g, d => FA[Number(d)] || d)
      .replace(/[٠-٩]/g, d => FA[AR.indexOf(d)] || d);
  }

  function toEn(value) {
    return String(value || '')
      .replace(/[۰-۹]/g, d => String(FA.indexOf(d)))
      .replace(/[٠-٩]/g, d => String(AR.indexOf(d)));
  }

  function phoneHref(phone) {
    const raw = toEn(phone).replace(/[^\d+]/g, '');
    return raw ? `tel:${raw}` : '#';
  }

  function textFrom(selector) {
    const el = $(selector);
    if (!el) return '';
    const node = el.querySelector?.('.nv-topbar-text, .nv-final-topbar__text');
    return clean(node ? node.textContent : el.textContent);
  }

  function mapUrl(data, address) {
    const explicit = clean(data.mapUrl || data.clinic_map_url || '');
    if (explicit) return explicit;
    const lat = Number(toEn(data.mapLatitude || data.clinic_latitude || ''));
    const lng = Number(toEn(data.mapLongitude || data.clinic_longitude || ''));
    if (Number.isFinite(lat) && Number.isFinite(lng)) return `https://nshn.ir/?lat=${lat}&lng=${lng}`;
    return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : '#';
  }

  function settings() {
    const fromRuntime = window.SadraPublicSiteSettings?.get?.();
    const data = Object.assign({}, latest, fromRuntime || {});
    latest = data;

    const address = clean(data.clinicAddress || data.clinic_address || '') ||
      clean(Array.isArray(data.clinicAddresses) ? data.clinicAddresses[0]?.text : '') ||
      clean(document.documentElement.dataset.clinicAddress || '') ||
      textFrom('.topbar-info [data-topbar-item="location"]') || DEFAULTS.address;

    const hours = clean(data.workingHours || data.working_hours || '') ||
      textFrom('.topbar-info [data-topbar-item="clock"]') || DEFAULTS.hours;

    const phone = clean(data.clinicPhone || data.clinic_phone || '') ||
      clean(document.documentElement.dataset.clinicPhone || '') ||
      textFrom('.topbar-info [data-topbar-item="phone"], .topbar-info a.topbar-phone') || DEFAULTS.phone;

    return { address: toFa(address), hours: toFa(hours), phone: toFa(phone), map: mapUrl(data, address), raw: data };
  }

  function validHref(value) {
    const href = clean(value);
    return href && href !== '#' ? href : '';
  }

  function sourceHrefFor(name) {
    const link = $(`.topbar .socials a.social-link.${name}`);
    return validHref(link?.getAttribute('href') || '');
  }

  function socialLinks(data) {
    const result = [];
    const seenHref = new Set();
    SOCIALS.forEach(name => {
      const enabled = data.socialEnabled ? data.socialEnabled[name] !== false : true;
      const href = enabled ? (validHref(data.socialLinks?.[name]) || sourceHrefFor(name)) : '';
      if (!href) return;
      const key = href.replace(/\/$/, '').toLowerCase();
      if (seenHref.has(key)) return;
      seenHref.add(key);
      result.push({ name, href });
    });
    return result.slice(0, 4);
  }

  function contactItem(type, text, href, label) {
    const tag = href ? 'a' : 'span';
    const attrs = [
      `class="nv-final-topbar__item nv-final-topbar__item--${type}"`,
      'data-no-fa-digits="true"'
    ];
    if (href) attrs.push(`href="${esc(href)}"`);
    if (type === 'location' && href) attrs.push('target="_blank"', 'rel="noopener"');
    if (label) attrs.push(`aria-label="${esc(label)}"`);
    if (type === 'phone') attrs.push('dir="ltr"');
    return `<${tag} ${attrs.join(' ')}><span class="nv-final-topbar__icon" aria-hidden="true">${ICONS[type]}</span><span class="nv-final-topbar__text">${esc(toFa(text))}</span></${tag}>`;
  }

  function socialsHtml(items) {
    return items.map(({ name, href }) => `
      <a class="nv-final-topbar__social nv-final-topbar__social--${name}" href="${esc(href)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(SOCIAL_LABELS[name] || name)}" data-no-fa-digits="true">
        <img src="${esc(SOCIAL_ICON(name))}" alt="${esc(SOCIAL_LABELS[name] || name)}" width="22" height="22" loading="eager" decoding="async">
      </a>`).join('');
  }

  function hideLegacy(topbar) {
    $$('.topbar-info, .socials, .nv-topbar169, .nv-final-topbar:not(.nv-final-topbar--active)', topbar).forEach(el => {
      el.hidden = true;
      el.setAttribute('aria-hidden', 'true');
      el.style.setProperty('display', 'none', 'important');
    });
  }

  function setNavbarActive() {
    const path = location.pathname.replace(/\/$/, '') || '/';
    $$('.navbar .menu > li > a').forEach(a => {
      const href = a.getAttribute('href') || '';
      const normalized = href.split('#')[0].replace(/\/$/, '') || '/';
      const active = path === '/' ? href === '/' : normalized === path;
      a.classList.toggle('active', active);
      if (active) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  function ensureDoctorGlassCard() {
    if (!isMobile()) {
      $$('.nv-mobile-doctor-glass').forEach(card => card.remove());
      return;
    }
    const hero = $('.hero-content') || $('.hero .container') || $('.hero');
    if (!hero || $('.nv-mobile-doctor-glass', hero)) return;
    const anchor = $('.eyebrow', hero) || hero.firstElementChild;
    const card = document.createElement('div');
    card.className = 'nv-mobile-doctor-glass';
    card.innerHTML = '<img src="/images/doctor-1.webp" alt="دکتر محمدصادق حق‌پرست" loading="eager" decoding="async" onerror="this.onerror=null;this.src=\'/assets/images/doctor-profile_1.webp\';"><div class="nv-mobile-doctor-glass__text"><strong>دکتر محمدصادق حق‌پرست</strong><span>جراح و متخصص چشم‌پزشکی</span></div>';
    if (anchor?.parentNode) anchor.insertAdjacentElement('afterend', card);
    else hero.prepend(card);
  }

  function render(detail) {
    if (applying) return;
    applying = true;
    try {
      latest = Object.assign({}, latest, detail || {});
      const topbar = $('.topbar');
      if (!topbar) return;
      const inner = $('.topbar-inner', topbar) || $('.container', topbar) || topbar;
      const data = settings();
      const socials = socialLinks(data.raw);
      const key = JSON.stringify({ a: data.address, h: data.hours, p: data.phone, m: data.map, s: socials, mode: isMobile() ? 'm' : 'd' });

      let bar = $('.nv-final-topbar--active', topbar);
      if (!bar) {
        bar = document.createElement('div');
        bar.className = 'nv-final-topbar nv-final-topbar--active';
        bar.setAttribute('data-no-fa-digits', 'true');
        inner.appendChild(bar);
      }

      if (key !== lastKey || !bar.firstElementChild) {
        bar.innerHTML = `
          <div class="nv-final-topbar__socials" data-no-fa-digits="true">${socialsHtml(socials)}</div>
          <div class="nv-final-topbar__contacts" data-no-fa-digits="true">
            ${data.address ? contactItem('location', data.address, data.map, 'مشاهده آدرس کلینیک روی نقشه') : ''}
            ${data.hours ? contactItem('clock', data.hours) : ''}
            ${data.phone ? contactItem('phone', data.phone, phoneHref(data.phone), `تلفن کلینیک ${data.phone}`) : ''}
          </div>
          <div class="nv-final-topbar__mobile-address" data-no-fa-digits="true">
            ${data.address ? contactItem('location', data.address, data.map, 'مشاهده آدرس کلینیک روی نقشه') : ''}
          </div>
          ${data.phone ? `<a class="nv-final-topbar__mobile-call" href="${esc(phoneHref(data.phone))}" aria-label="تماس تلفنی با کلینیک" data-no-fa-digits="true"><span class="nv-final-topbar__icon" aria-hidden="true">${ICONS.phone}</span></a>` : ''}
        `;
        lastKey = key;
      }

      const phoneText = $('.nv-final-topbar__item--phone .nv-final-topbar__text', bar);
      if (phoneText) phoneText.textContent = toFa(data.phone);
      hideLegacy(topbar);
      topbar.classList.add('nv-final-topbar-ready');
      setNavbarActive();
      ensureDoctorGlassCard();
    } finally {
      applying = false;
    }
  }

  function toast(text) {
    let el = $('.nv-final-topbar-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'nv-final-topbar-toast';
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-visible'), 1800);
  }

  function handlePhoneClick(event) {
    const link = event.target?.closest?.('.nv-final-topbar__item--phone');
    if (!link || isMobile()) return;
    event.preventDefault();
    const number = clean(link.querySelector('.nv-final-topbar__text')?.textContent || link.textContent || '');
    if (navigator.clipboard && number) {
      navigator.clipboard.writeText(toEn(number)).then(() => toast('شماره تلفن کپی شد')).catch(() => toast(number));
    } else toast(number);
  }

  function closeChatbotHard() {
    $$('#chatbotPanel, .chatbot-panel, .chatbot-widget').forEach(panel => {
      panel.classList.remove('open', 'active', 'is-open');
      panel.setAttribute('aria-hidden', 'true');
      panel.classList.add('nv-chatbot-closed-hard');
    });
    document.body.classList.remove('chatbot-open');
    document.documentElement.classList.remove('chatbot-lock');
  }

  function openBookingHard() {
    const trigger = $$('[data-open-booking], .nav-booking, .open-booking, .floating-booking')
      .find(el => !el.closest('#chatbotPanel, .chatbot-panel, .chatbot-widget') && !el.classList.contains('chat-action-btn'));
    if (trigger) return trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
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

  window.NVRenderFinalTopbar = render;

  function schedule() {
    clearTimeout(window.__NV_TOPBAR_FINAL_305_TIMER__);
    window.__NV_TOPBAR_FINAL_305_TIMER__ = setTimeout(() => render(), 50);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => render(), { once: true });
  else render();

  document.addEventListener('noorvista:public-settings', event => render(event.detail || {}));
  window.addEventListener('resize', schedule, { passive: true });
  document.addEventListener('click', handlePhoneClick, true);
  ['pointerdown', 'click', 'touchend'].forEach(type => document.addEventListener(type, interceptChatBooking, true));

  try {
    new MutationObserver(records => {
      if (applying) return;
      if (records.some(r => Array.from(r.addedNodes || []).some(n => n.nodeType === 1 && (n.matches?.('.socials,.topbar-info,.nv-topbar169') || n.querySelector?.('.socials,.topbar-info,.nv-topbar169'))))) schedule();
    }).observe(document.documentElement, { childList: true, subtree: true });
  } catch (_) {}
})();
