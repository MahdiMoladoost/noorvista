(function () {
  'use strict';

  if (window.__NV_FOOTER_STATIC_308__) return;
  window.__NV_FOOTER_STATIC_308__ = true;

  const FA = '۰۱۲۳۴۵۶۷۸۹';
  const AR = '٠١٢٣٤٥٦٧٨٩';

  const DEFAULT = {
    addresses: [
      { key: 'primary', label: 'آدرس ۱', text: 'تهران، چیتگر' },
      { key: 'secondary', label: 'آدرس ۲', text: 'قرچک، بلوار اصلی قرچک، درمانگاه خیریه امیرالمومنین' }
    ],
    hours: '۰۸:۰۰ تا ۱۷:۰۰',
    phone: '۰۹۲۲۱۹۷۱۳۹۷',
    socials: {
      whatsapp: 'https://wa.me/989221971397?text',
      instagram: 'https://www.instagram.com/Dr_mohamadhaghparast',
      bale: 'https://ble.ir/Operatorsprobot'
    },
    footerSignatureText: 'طراحی و تولید توسط شرکت هوشمندسازان صنعت صدرا',
    footerSignatureUrl: 'https://smartsadra.ir'
  };

  const SOCIAL_ORDER = ['whatsapp', 'telegram', 'instagram', 'rubika', 'bale', 'eitaa'];
  const SOCIAL_LABEL = {
    whatsapp: 'واتساپ',
    telegram: 'تلگرام',
    instagram: 'اینستاگرام',
    rubika: 'روبیکا',
    bale: 'بله',
    eitaa: 'ایتا'
  };

  let applying = false;
  let observer = null;
  let latestKey = '';

  const $ = (s, r = document) => r.querySelector(s);
  const clean = v => String(v || '').replace(/\s+/g, ' ').trim();
  const esc = v => String(v || '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

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

  function normalize(data) {
    const runtime = data || window.SadraPublicSiteSettings?.get?.() || {};
    const addresses = Array.isArray(runtime.clinicAddresses) && runtime.clinicAddresses.length
      ? runtime.clinicAddresses.map((item, index) => ({
          key: item.key || (index ? 'secondary' : 'primary'),
          label: clean(item.label || `آدرس ${index + 1}`),
          text: clean(item.text || item.address || item.value || '')
        })).filter(item => item.text)
      : DEFAULT.addresses;

    const socialLinks = Object.assign({}, DEFAULT.socials, runtime.socialLinks || {});
    const socialEnabled = Object.assign({}, runtime.socialEnabled || runtime.socialVisibility || {});

    return {
      addresses: addresses.length ? addresses : DEFAULT.addresses,
      hours: toFa(clean(runtime.workingHours || runtime.working_hours || DEFAULT.hours)),
      phone: toFa(clean(runtime.clinicPhone || runtime.clinic_phone || DEFAULT.phone)),
      socials: socialLinks,
      socialEnabled,
      footerSignatureText: clean(runtime.footerSignatureText || runtime.footer_signature_text || DEFAULT.footerSignatureText),
      footerSignatureUrl: clean(runtime.footerSignatureUrl || runtime.footer_signature_url || DEFAULT.footerSignatureUrl)
    };
  }

  function contactHtml(data) {
    const addressRows = data.addresses.map((item, index) => {
      const icon = index === 0 ? '<span class="nv-inline-icon nv-icon-location" aria-hidden="true"></span>' : '';
      return '<li class="nv-footer-contact-row nv-footer-address" data-address-key="' + esc(item.key || index) + '">' +
        '<span class="nv-contact-icon">' + icon + '</span>' +
        '<span class="nv-contact-main"><span class="nv-contact-label">' + esc(toFa(item.label || `آدرس ${index + 1}`)) + ':</span><span class="nv-contact-value">' + esc(toFa(item.text)) + '</span></span>' +
        '</li>';
    }).join('');

    return addressRows +
      '<li class="nv-footer-contact-row nv-footer-hours"><span class="nv-contact-icon"><span class="nv-inline-icon nv-icon-clock" aria-hidden="true"></span></span><span class="nv-contact-main"><span class="nv-contact-label">ساعت کاری:</span><span class="nv-contact-value">' + esc(toFa(data.hours)) + '</span></span></li>' +
      '<li class="nv-footer-contact-row nv-footer-phone"><span class="nv-contact-icon"><span class="nv-inline-icon nv-icon-phone" aria-hidden="true"></span></span><a class="nv-contact-main" href="' + esc(phoneHref(data.phone)) + '"><span class="nv-contact-label">تلفن:</span><span class="nv-contact-value">' + esc(toFa(data.phone)) + '</span></a></li>';
  }

  function socialsHtml(data) {
    return SOCIAL_ORDER.map(name => {
      const href = clean(data.socials[name] || '');
      const enabled = data.socialEnabled[name] !== false && href && href !== '#';
      const label = SOCIAL_LABEL[name] || name;
      if (!enabled) {
        return '<a aria-label="' + esc(label) + '" class="social-link ' + esc(name) + ' is-hidden" href="#" hidden aria-hidden="true" tabindex="-1" data-nv-disabled-social="1" style="display: none !important; visibility: hidden !important; pointer-events: none !important;"><img src="/assets/icons/social_media/' + esc(name) + '.webp" alt="' + esc(label) + '" width="24" height="24" loading="lazy"></a>';
      }
      return '<a aria-label="' + esc(label) + '" class="social-link ' + esc(name) + ' nv-social-visible" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer"><img src="/assets/icons/social_media/' + esc(name) + '.webp" alt="' + esc(label) + '" width="24" height="24" loading="lazy"></a>';
    }).join('\n');
  }

  function ensureFooter() {
    const footer = $('.footer');
    if (!footer) return null;

    const infoColumn = $('.footer-grid > div:last-child', footer) || footer;
    let list = $('.footer .contact-list', footer);
    let socials = $('.footer .footer-socials.compact-socials', footer);
    let bottom = $('.footer .footer-bottom', footer);

    if (!list) {
      list = document.createElement('ul');
      infoColumn.appendChild(list);
    }
    if (!socials) {
      socials = document.createElement('div');
      infoColumn.appendChild(socials);
    }
    if (!bottom) {
      bottom = document.createElement('div');
      const container = $('.footer > .container', footer) || footer;
      container.appendChild(bottom);
    }

    list.className = 'contact-list nv-footer-static-contact-list';
    list.dataset.nvFooterStatic = 'true';
    list.setAttribute('data-no-fa-digits', 'true');

    socials.className = 'footer-socials compact-socials nv-footer-static-socials';
    socials.dataset.nvFooterStatic = 'true';
    socials.setAttribute('data-no-fa-digits', 'true');
    socials.setAttribute('aria-label', 'شبکه‌های اجتماعی کلینیک');

    bottom.className = 'footer-bottom nv-footer-centered nv-footer-bottom-static';
    bottom.dataset.nvFooterStatic = 'true';
    bottom.setAttribute('data-no-fa-digits', 'true');

    const old306 = $('.footer .nv-footer306-info', footer);
    if (old306) old306.hidden = true;

    return { footer, list, socials, bottom };
  }

  function render(dataInput) {
    if (applying) return;
    const parts = ensureFooter();
    if (!parts) return;
    const data = normalize(dataInput);
    const key = JSON.stringify(data);

    // Even when the key is the same, re-assert if another script changed the visible nodes.
    const nextContact = contactHtml(data);
    const nextSocials = socialsHtml(data);

    const text = data.footerSignatureText;
    const url = data.footerSignatureUrl;
    const linkLabel = url.replace(/^https?:\/\//, '').replace(/\/$/, '');

    applying = true;
    if (observer) observer.disconnect();
    try {
      if (parts.list.innerHTML !== nextContact) parts.list.innerHTML = nextContact;
      if (parts.socials.innerHTML !== nextSocials) parts.socials.innerHTML = nextSocials;

      let textNode = parts.bottom.querySelector('[data-footer-signature-text]');
      let linkNode = parts.bottom.querySelector('[data-footer-signature-url]');
      if (!textNode) {
        textNode = document.createElement('span');
        textNode.setAttribute('data-footer-signature-text', '');
        parts.bottom.appendChild(textNode);
      }
      if (!linkNode) {
        linkNode = document.createElement('a');
        linkNode.setAttribute('data-footer-signature-url', '');
        linkNode.target = '_blank';
        linkNode.rel = 'noopener';
        parts.bottom.appendChild(linkNode);
      }

      if (textNode.textContent !== text) textNode.textContent = text;
      if (linkNode.getAttribute('href') !== url) linkNode.setAttribute('href', url);
      if (linkNode.textContent !== linkLabel) linkNode.textContent = linkLabel;

      latestKey = key;
    } finally {
      applying = false;
      startObserver();
    }
  }

  function startObserver() {
    const footer = $('.footer');
    if (!footer) return;
    if (!observer) {
      observer = new MutationObserver(() => {
        if (applying) return;
        clearTimeout(window.__NV_FOOTER_STATIC_308_TIMER__);
        window.__NV_FOOTER_STATIC_308_TIMER__ = setTimeout(() => render(), 30);
      });
    }
    try {
      observer.observe(footer, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'hidden', 'style', 'href'] });
    } catch (_) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => render(), { once: true });
  else render();

  document.addEventListener('noorvista:public-settings', event => {
    render(event.detail || {});
    setTimeout(() => render(event.detail || {}), 160);
  });

  window.NVRenderStaticFooter308 = render;
})();
