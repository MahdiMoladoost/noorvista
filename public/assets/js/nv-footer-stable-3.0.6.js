(function () {
  'use strict';

  if (window.__NV_FOOTER_STABLE_306__) return;
  window.__NV_FOOTER_STABLE_306__ = true;

  const FA = '۰۱۲۳۴۵۶۷۸۹';
  const AR = '٠١٢٣٤٥٦٧٨٩';
  const SOCIALS = ['whatsapp', 'instagram', 'bale', 'telegram', 'rubika', 'eitaa'];
  const LABELS = { whatsapp: 'واتساپ', instagram: 'اینستاگرام', bale: 'بله', telegram: 'تلگرام', rubika: 'روبیکا', eitaa: 'ایتا' };

  const DEFAULTS = {
    clinicPhone: '۰۹۲۲۱۹۷۱۳۹۷',
    workingHours: '۸:۰۰ تا ۱۷:۰۰',
    clinicAddress: 'تهران، چیتگر',
    clinicAddresses: [
      { key: 'primary', label: 'آدرس ۱', text: 'تهران، چیتگر' }
    ],
    socialLinks: {},
    socialEnabled: {}
  };

  const ICONS = {
    location: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2a10 10 0 1 0 .01 0ZM13 7h-2v6l5 3 1-1.73-4-2.27V7Z"/></svg>',
    phone: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.61 21 3 13.39 3 4a1 1 0 0 1 1-1h3.49a1 1 0 0 1 1 1c0 1.24.2 2.45.57 3.57a1 1 0 0 1-.25 1.02l-2.19 2.2Z"/></svg>'
  };

  let lastKey = '';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
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
    const runtime = window.SadraPublicSiteSettings?.get?.() || {};
    const merged = Object.assign({}, DEFAULTS, runtime, data || {});
    const addresses = Array.isArray(merged.clinicAddresses) && merged.clinicAddresses.length
      ? merged.clinicAddresses
      : [{ key: 'default', label: 'آدرس', text: merged.clinicAddress || DEFAULTS.clinicAddress }];

    return {
      phone: toFa(clean(merged.clinicPhone || merged.clinic_phone || DEFAULTS.clinicPhone)),
      hours: toFa(clean(merged.workingHours || merged.working_hours || DEFAULTS.workingHours)),
      addresses: addresses
        .map((item, index) => ({
          label: clean(item.label || (index ? `آدرس ${index + 1}` : 'آدرس ۱')),
          text: toFa(clean(item.text || item.address || item.value || ''))
        }))
        .filter(item => item.text),
      socialLinks: Object.assign({}, merged.socialLinks || {}),
      socialEnabled: Object.assign({}, merged.socialEnabled || merged.socialVisibility || {})
    };
  }

  function sourceHref(name) {
    const candidates = [
      `.footer .footer-socials a.social-link.${name}`,
      `.topbar .socials a.social-link.${name}`,
      `a.social-link.${name}`
    ];
    for (const selector of candidates) {
      const link = $(selector);
      const href = clean(link?.getAttribute('href') || '');
      if (href && href !== '#') return href;
    }
    return '';
  }

  function socialLinks(data) {
    const out = [];
    const seen = new Set();
    SOCIALS.forEach(name => {
      const enabled = data.socialEnabled[name] !== false;
      const href = enabled ? clean(data.socialLinks[name] || sourceHref(name)) : '';
      if (!href || href === '#') return;
      const key = href.toLowerCase().replace(/\/$/, '');
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ name, href });
    });
    return out.slice(0, 6);
  }

  function row(icon, html, extraClass) {
    return '<div class="nv-footer306-row ' + (extraClass || '') + '">' +
      '<span class="nv-footer306-icon" aria-hidden="true">' + ICONS[icon] + '</span>' +
      '<span class="nv-footer306-copy">' + html + '</span>' +
      '</div>';
  }

  function render(data) {
    const footer = $('.footer');
    if (!footer) return;

    const infoColumn = $('.footer-grid > div:last-child', footer) || footer;
    let host = $('.nv-footer306-info', infoColumn);
    if (!host) {
      host = document.createElement('div');
      host.className = 'nv-footer306-info';
      host.setAttribute('data-no-fa-digits', 'true');
      const oldSocials = $('.footer-socials', infoColumn);
      if (oldSocials) oldSocials.insertAdjacentElement('afterend', host);
      else infoColumn.appendChild(host);
    }

    const normalized = normalize(data);
    const links = socialLinks(normalized);
    const key = JSON.stringify({ normalized, links });
    if (key === lastKey && host.dataset.ready === 'true') return;

    const addressHtml = normalized.addresses.length
      ? '<span class="nv-footer306-address-list">' + normalized.addresses.map((item, index) => {
          const label = item.label || `آدرس ${index + 1}`;
          return '<span class="nv-footer306-address-line"><strong>' + esc(toFa(label)) + ':</strong> ' + esc(item.text) + '</span>';
        }).join('') + '</span>'
      : '';

    const socialsHtml = links.length
      ? '<div class="nv-footer306-socials" aria-label="شبکه‌های اجتماعی کلینیک">' + links.map(item => {
          const label = LABELS[item.name] || item.name;
          return '<a class="nv-footer306-social nv-footer306-social--' + esc(item.name) + '" href="' + esc(item.href) + '" target="_blank" rel="noopener" aria-label="' + esc(label) + '">' +
            '<img src="/assets/icons/social_media/' + esc(item.name) + '.webp" alt="' + esc(label) + '" width="24" height="24" loading="lazy">' +
            '</a>';
        }).join('') + '</div>'
      : '';

    host.innerHTML =
      (addressHtml ? row('location', addressHtml, 'nv-footer306-row--address') : '') +
      (normalized.hours ? row('clock', '<strong>ساعت کاری:</strong> ' + esc(normalized.hours), 'nv-footer306-row--hours') : '') +
      (normalized.phone ? row('phone', '<a class="nv-footer306-phone" href="' + esc(phoneHref(normalized.phone)) + '"><strong>تلفن:</strong> ' + esc(normalized.phone) + '</a>', 'nv-footer306-row--phone') : '') +
      socialsHtml;

    host.dataset.ready = 'true';
    lastKey = key;
  }

  function hideLegacy() {
    $$('.footer .contact-list, .footer .footer-socials.compact-socials').forEach(el => {
      el.setAttribute('data-no-fa-digits', 'true');
      el.setAttribute('aria-hidden', 'true');
      el.hidden = true;
    });
  }

  function run(data) {
    hideLegacy();
    render(data);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => run(), { once: true });
  else run();

  document.addEventListener('noorvista:public-settings', event => run(event.detail || {}));
  window.NVRenderStableFooter = run;
})();
