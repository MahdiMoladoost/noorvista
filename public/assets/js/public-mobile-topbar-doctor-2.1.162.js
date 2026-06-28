(function () {
  if (window.__NV_PUBLIC_MOBILE_HEADER_FINAL_2165__) return;
  window.__NV_PUBLIC_MOBILE_HEADER_FINAL_2165__ = true;

  const PHONE_SVG = '<svg class="nv-mobile-call-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.61 21 3 13.39 3 4a1 1 0 0 1 1-1h3.49a1 1 0 0 1 1 1c0 1.24.2 2.45.57 3.57a1 1 0 0 1-.25 1.02l-2.19 2.2Z"/></svg>';

  function qs(selector, root) { return (root || document).querySelector(selector); }
  function qsa(selector, root) { return Array.from((root || document).querySelectorAll(selector)); }
  function isMobile() { return window.matchMedia('(max-width: 720px)').matches; }

  function normalizeLoginText() {
    qsa('a, button').forEach((el) => {
      const text = (el.textContent || '').trim();
      if (text === 'ورود پنل' || text === 'ورود به پنل') el.textContent = 'ورود';
    });
  }

  function ensureDoctorGlassCard() {
    const hero = qs('.hero-content') || qs('.hero .container') || qs('.hero');
    if (!hero) return;
    let card = qs('.nv-mobile-doctor-glass', hero);
    if (!isMobile()) {
      if (card) card.remove();
      return;
    }
    if (card) return;
    const anchor = qs('.eyebrow', hero) || hero.firstElementChild;
    card = document.createElement('div');
    card.className = 'nv-mobile-doctor-glass';
    card.innerHTML = '<img src="/assets/images/doctor-1.webp" alt="دکتر محمدصادق حق‌پرست" loading="eager" decoding="async"><div class="nv-mobile-doctor-glass__text"><strong>دکتر محمدصادق حق‌پرست</strong><span>جراح و متخصص چشم‌پزشکی</span></div>';
    if (anchor && anchor.parentNode) anchor.insertAdjacentElement('afterend', card);
    else hero.prepend(card);
  }

  function extractPhoneHref() {
    const candidate = qs('a.topbar-phone[href^="tel:"], [data-topbar-item="phone"][href^="tel:"], a[href^="tel:"]');
    return candidate?.getAttribute('href') || '#';
  }

  function normalizeMobileTopbar() {
    const topbar = qs('.topbar');
    if (!topbar) return;
    const inner = qs('.topbar-inner', topbar) || qs('.container', topbar) || topbar;
    const info = qs('.topbar-info', topbar);
    const socials = qs('.socials', topbar);
    if (!info) return;

    topbar.classList.add('nv-mobile-topbar-v2');
    inner.classList.add('nv-mobile-topbar-v2-inner');

    const location = qs('[data-topbar-item="location"]', info) || info.querySelector('span');
    const clock = qs('[data-topbar-item="clock"]', info);
    if (clock) clock.hidden = true;

    if (location) {
      location.classList.add('nv-mobile-location-item');
      location.dataset.topbarItem = 'location';
      info.innerHTML = '';
      info.appendChild(location);
    }

    let call = qs('.nv-mobile-call-action', inner);
    if (!call) {
      call = document.createElement('a');
      call.className = 'nv-mobile-call-action';
      call.setAttribute('aria-label', 'تماس تلفنی با کلینیک');
      call.setAttribute('title', 'تماس');
      inner.appendChild(call);
    }
    call.href = extractPhoneHref();
    call.innerHTML = PHONE_SVG;

    if (socials) {
      socials.classList.add('nv-mobile-social-center');
      if (socials.parentElement !== inner) inner.appendChild(socials);
    }

    // Hide/remove every legacy phone node in the topbar. Only .nv-mobile-call-action is visible on mobile.
    qsa('.topbar-info [data-topbar-item="phone"], .topbar-info a.topbar-phone, .nv-mobile-topbar-actions, .topbar-info .topbar-phone', topbar).forEach((el) => el.remove());
  }

  function simplifyMobileHeaderBrand() {
    const brand = qs('.navbar .brand');
    if (!brand) return;
    brand.classList.add('nv-mobile-brand-minimal');
    const textBox = Array.from(brand.children || []).find(el => el.querySelector && (el.querySelector('strong') || el.querySelector('small')));
    if (textBox) textBox.classList.add('nv-mobile-brand-text-hidden');
  }

  function run() {
    normalizeLoginText();
    simplifyMobileHeaderBrand();
    ensureDoctorGlassCard();
    normalizeMobileTopbar();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();

  document.addEventListener('noorvista:public-settings', () => {
    setTimeout(run, 0);
    setTimeout(run, 120);
  });

  window.addEventListener('resize', () => {
    clearTimeout(window.__NV_MOBILE_HEADER_RESIZE_TIMER__);
    window.__NV_MOBILE_HEADER_RESIZE_TIMER__ = setTimeout(run, 120);
  }, { passive: true });
})();
