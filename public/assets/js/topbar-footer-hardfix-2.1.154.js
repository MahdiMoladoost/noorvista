(function () {
  if (window.__NV_TOPBAR_FOOTER_HARDFIX_2154__) return;
  window.__NV_TOPBAR_FOOTER_HARDFIX_2154__ = true;

  const faDigits = '۰۱۲۳۴۵۶۷۸۹';
  const arDigits = '٠١٢٣٤٥٦٧٨٩';
  const toFa = (value) => String(value ?? '')
    .replace(/\d/g, d => faDigits[Number(d)])
    .replace(/[٠-٩]/g, d => faDigits[arDigits.indexOf(d)] || d);

  const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  const phoneHref = (phone) => {
    const raw = String(phone || '').replace(/[^\d۰-۹٠-٩]/g, '')
      .replace(/[۰-۹]/g, d => String(faDigits.indexOf(d)))
      .replace(/[٠-٩]/g, d => String(arDigits.indexOf(d)));
    return raw ? `tel:${raw}` : '#';
  };

  let latest = {};

  function ensureTextSpan(el) {
    let textEl = el.querySelector('.nv-topbar-text');
    if (textEl) return textEl;
    textEl = document.createElement('span');
    textEl.className = 'nv-topbar-text';
    el.appendChild(textEl);
    return textEl;
  }

  function setPreservedText(el, value) {
    const textEl = ensureTextSpan(el);
    textEl.textContent = toFa(value);
  }

  function ensureTopbarMarkup(el, type) {
    if (type === 'phone' && !el.classList.contains('topbar-phone')) {
      el.classList.add('topbar-phone');
    }
    ensureTextSpan(el);
  }

  function findTopbarItems(block) {
    const children = Array.from(block.children || []);
    let location = children.find(el => el.dataset?.topbarItem === 'location') || children.find(el => el.matches('span')) || null;
    let clock = children.find(el => el.dataset?.topbarItem === 'clock') || children.filter(el => el.matches('span'))[1] || null;
    let phone = children.find(el => el.dataset?.topbarItem === 'phone') || block.querySelector(':scope > a.topbar-phone, :scope > [data-topbar-item="phone"]') || null;

    if (!location) {
      location = document.createElement('span');
      block.prepend(location);
    }
    if (!clock) {
      clock = document.createElement('span');
      if (phone) block.insertBefore(clock, phone);
      else block.appendChild(clock);
    }
    if (!phone) {
      phone = document.createElement('a');
      phone.className = 'topbar-phone';
      block.appendChild(phone);
    }

    location.dataset.topbarItem = 'location';
    clock.dataset.topbarItem = 'clock';
    phone.dataset.topbarItem = 'phone';
    phone.classList.add('topbar-phone');

    ensureTopbarMarkup(location, 'location');
    ensureTopbarMarkup(clock, 'clock');
    ensureTopbarMarkup(phone, 'phone');

    return { location, clock, phone };
  }

  function setItem(el, text, href) {
    const value = clean(text);
    el.hidden = !value;
    el.classList.toggle('nv-empty-config-hidden', !value);
    if (!value) {
      const textEl = el.querySelector('.nv-topbar-text');
      if (textEl) textEl.textContent = '';
      return;
    }

    setPreservedText(el, value);

    if (el.tagName === 'A') {
      el.setAttribute('href', href || '#');
      if (el.dataset.topbarItem === 'phone') {
        el.setAttribute('aria-label', `تماس با کلینیک ${toFa(value)}`);
      }
    }
  }

  function getAddress(data) {
    if (Array.isArray(data.clinicAddresses) && data.clinicAddresses.length) return data.clinicAddresses[0].text || '';
    return data.clinicAddress || data.clinic_address || document.documentElement.dataset.clinicAddress || '';
  }

  function normalizeTopbar(data = latest) {
    latest = Object.assign({}, latest, data || {});
    document.querySelectorAll('.topbar-info').forEach(block => {
      const { location, clock, phone } = findTopbarItems(block);
      setItem(location, getAddress(latest));
      setItem(clock, latest.workingHours || latest.working_hours || '');
      const clinicPhone = latest.clinicPhone || latest.clinic_phone || document.documentElement.dataset.clinicPhone || '';
      setItem(phone, clinicPhone, phoneHref(clinicPhone));
    });
  }

  function normalizeFooter() {
    document.querySelectorAll('.footer .contact-list .nv-address-label').forEach(label => {
      label.textContent = label.textContent.replace(/:\s*$/, ': ');
    });
    document.querySelectorAll('.footer .contact-list .nv-footer-phone .nv-contact-main, .footer .contact-list .nv-footer-phone .nv-contact-main strong').forEach(el => {
      el.style.fontWeight = '700';
    });
  }

  function run(data) {
    normalizeTopbar(data);
    normalizeFooter();
  }

  document.addEventListener('noorvista:public-settings', event => {
    run(event.detail || {});
    setTimeout(() => run(event.detail || {}), 50);
    setTimeout(() => run(event.detail || {}), 250);
    setTimeout(() => run(event.detail || {}), 800);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => run(), { once: true });
  } else {
    run();
  }
})();
