/* Sadra 2.1.125 — public contact/social/location runtime settings with reliable social visibility */
(function () {
  'use strict';

  const DEFAULTS = {
    clinicName: 'کلینیک دکتر محمدصادق حق‌پرست',
    clinicPhone: '۰۹۲۲۱۹۷۱۳۹۷',
    clinicAddress: 'تهران، چیتگر',
    workingHours: '۸:۰۰ تا ۱۷:۰۰',
    mapLatitude: '',
    mapLongitude: '',
    mapUrl: '',
    socialLinks: {},
    socialEnabled: {},
    footerSignatureText: 'طراحی و تولید توسط شرکت هوشمندسازان صنعت صدرا',
    footerSignatureUrl: 'https://smartsadra.ir'
  };

  const SOCIALS = [
    'whatsapp', 'telegram', 'instagram', 'bale', 'eitaa',
    'rubika', 'soroush', 'gap', 'igap', 'nava'
  ];

  const KNOWN_CLINIC_NAMES = [
    'کلینیک چشم‌پزشکی دکتر محمدصادق حق‌پرست',
    'کلینیک چشم پزشکی دکتر محمدصادق حق پرست',
    'کلینیک چشم‌پزشکی دکتر حق‌پرست',
    'کلینیک چشم پزشکی دکتر حق پرست',
    'کلینیک صدرا',
    'سامانه هوشمند کلینیک دکتر محمدصادق حق‌پرست'
  ];

  const KNOWN_CONTACT_TEXTS = [
    'مشاوره آنلاین',
    'مشاوره آنلاین',
    'نظارت و مدیریت یکپارچه سامانه صدرا',
    ...KNOWN_CLINIC_NAMES,
    '09221971397',
    '۰۹۲۲۱۹۷۱۳۹۷',
    'تهران، قیطریه',
    'محدوده قیطریه تهران',
    'شنبه تا پنجشنبه، ساعت ۹ تا ۲۳',
    'شنبه تا پنجشنبه، ۹ تا ۲۳'
  ];

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  let nvPublicSettingsApplying = false;
  let nvPublicSettingsObserver = null;
  let nvPublicSettingsScheduled = false;


  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function clean(value, fallback = '') {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text || fallback;
  }

  function toBool(value, defaultValue = true) {
    if (value === undefined || value === null || value === '') return defaultValue;
    return ['1', 'true', 'yes', 'on', 'enabled', 'فعال'].includes(String(value).trim().toLowerCase());
  }

  function normalizeDigits(value) {
    return String(value || '')
      .replace(/[۰-۹]/g, ch => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(ch)))
      .replace(/[٠-٩]/g, ch => String('٠١٢٣٤٥٦٧٨٩'.indexOf(ch)));
  }

  function toPersianDigits(value) {
    return String(value || '').replace(/[0-9]/g, ch => '۰۱۲۳۴۵۶۷۸۹'[Number(ch)]).replace(/[٠-٩]/g, ch => '۰۱۲۳۴۵۶۷۸۹'['٠١٢٣٤٥٦٧٨٩'.indexOf(ch)]);
  }

  function phoneHref(phone) {
    const raw = normalizeDigits(phone).replace(/[^0-9+]/g, '');
    return raw ? `tel:${raw}` : '#';
  }


  function addressItemsFromRaw(raw) {
    const sourceItems = Array.isArray(raw.clinicAddresses) ? raw.clinicAddresses : (Array.isArray(raw.clinic_addresses) ? raw.clinic_addresses : []);
    const items = sourceItems
      .map((item, index) => ({ key: item.key || `address_${index + 1}`, label: clean(item.label || (index ? 'آدرس ۲' : 'آدرس ۱')), text: clean(item.text || item.address || item.value || '') }))
      .filter(item => item.text);
    if (items.length) return items;
    const legacy = clean(raw.clinicAddress || raw.clinic_address, '');
    const primary = clean(raw.clinic_address_primary || raw.clinicAddressPrimary || legacy, '');
    const secondary = clean(raw.clinic_address_secondary || raw.clinicAddressSecondary, '');
    const primaryEnabled = toBool(raw.clinic_address_primary_enabled ?? raw.clinicAddressPrimaryEnabled, false);
    const secondaryEnabled = toBool(raw.clinic_address_secondary_enabled ?? raw.clinicAddressSecondaryEnabled, false);
    const result = [];
    if (primaryEnabled && primary) result.push({ key: 'primary', label: 'آدرس ۱', text: primary });
    if (secondaryEnabled && secondary && secondary !== primary) result.push({ key: 'secondary', label: 'آدرس ۲', text: secondary });
    if (!result.length && legacy) result.push({ key: 'legacy', label: 'آدرس کلینیک', text: legacy });
    return result;
  }

  function addressLinesHtml(data) {
    const lines = Array.isArray(data.clinicAddresses) && data.clinicAddresses.length ? data.clinicAddresses : [{ key: 'default', label: 'آدرس کلینیک', text: data.clinicAddress }];
    const html = lines.filter(item => item.text).map(item => {
      const label = escapeHtml(item.label || 'آدرس');
      const text = escapeHtml(toPersianDigits(item.text));
      return `<span class="nv-address-line" data-address-key="${escapeHtml(item.key)}"><span class="nv-address-label">${label}:&nbsp;</span><span class="nv-address-text">${text}</span></span>`;
    }).join('');
    return `<span class="nv-address-lines">${html}</span>`;
  }

  function mapUrlFrom(data) {
    const lat = Number(normalizeDigits(data.mapLatitude || data.clinic_latitude || ''));
    const lng = Number(normalizeDigits(data.mapLongitude || data.clinic_longitude || ''));
    if (data.mapUrl || data.clinic_map_url) return clean(data.mapUrl || data.clinic_map_url);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return `https://nshn.ir/?lat=${lat}&lng=${lng}`;
    return '';
  }

  function normalizeConfig(raw) {
    const socialLinks = Object.assign({}, raw.socialLinks || {});
    const socialEnabled = Object.assign({}, raw.socialEnabled || raw.socialVisibility || {});
    SOCIALS.forEach(name => {
      socialLinks[name] = clean(socialLinks[name] || raw[`social_${name}`] || '');
      socialEnabled[name] = toBool(socialEnabled[name] ?? raw[`social_${name}_enabled`], false);
    });

    const clinicAddresses = addressItemsFromRaw(raw);
    const clinicAddress = clinicAddresses[0]?.text || clean(raw.clinicAddress || raw.clinic_address, '');
    return {
      clinicName: clean(raw.clinicName || raw.clinic_name, ''),
      clinicPhone: clean(raw.clinicPhone || raw.clinic_phone, ''),
      clinicSecondaryPhone: clean(raw.clinicSecondaryPhone || raw.clinic_secondary_phone, ''),
      clinicEmail: clean(raw.clinicEmail || raw.clinic_email, ''),
      clinicAddress,
      clinicAddresses,
      workingHours: clean(raw.workingHours || raw.working_hours, ''),
      openingNote: clean(raw.openingNote || raw.clinic_opening_note, ''),
      mapLatitude: clean(raw.mapLatitude || raw.clinic_latitude, ''),
      mapLongitude: clean(raw.mapLongitude || raw.clinic_longitude, ''),
      mapUrl: mapUrlFrom(raw),
      footerSignatureText: clean(raw.footerSignatureText || raw.footer_signature_text, ''),
      footerSignatureUrl: clean(raw.footerSignatureUrl || raw.footer_signature_url, ''),
      socialLinks,
      socialEnabled
    };
  }

  async function fetchConfig() {
    try {
      if (window.SadraPublicConfig?.getBrandingConfig) {
        return normalizeConfig(await window.SadraPublicConfig.getBrandingConfig());
      }
      const response = await fetch('/api/public/config/branding', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success === false) throw new Error('public config unavailable');
      return normalizeConfig(payload.data || {});
    } catch (_) {
      return normalizeConfig(DEFAULTS);
    }
  }

  function setText(el, value, prefix = '') {
    if (!el || !value) return;
    el.textContent = prefix ? `${prefix}${value}` : value;
  }



  function topbarIconSvg(name) {
    const icons = {
      location: '<svg class="nv-topbar-svg nv-topbar-svg-location" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z"/></svg>',
      clock: '<svg class="nv-topbar-svg nv-topbar-svg-clock" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2a10 10 0 1 0 .01 0ZM13 7h-2v6l5 3 1-1.73-4-2.27V7Z"/></svg>',
      phone: '<svg class="nv-topbar-svg nv-topbar-svg-phone" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.61 21 3 13.39 3 4a1 1 0 0 1 1-1h3.49a1 1 0 0 1 1 1c0 1.24.2 2.45.57 3.57a1 1 0 0 1-.25 1.02l-2.19 2.2Z"/></svg>'
    };
    return icons[name] || '';
  }

  function firstAddressText(data) {
    if (Array.isArray(data.clinicAddresses) && data.clinicAddresses.length) return clean(data.clinicAddresses[0].text);
    return clean(data.clinicAddress || '');
  }

  function updateTopbarInfo(data) {
    $$('.topbar-info').forEach(block => {
      const directItems = Array.from(block.children || []);
      const locationItem = directItems.find(el => el.dataset?.topbarItem === 'location' || el.querySelector?.('.nv-icon-location,.nv-topbar-svg-location')) || directItems[0];
      const clockItem = directItems.find(el => el.dataset?.topbarItem === 'clock' || el.querySelector?.('.nv-icon-clock,.nv-topbar-svg-clock')) || directItems[1];
      const phoneItem = directItems.find(el => el.matches?.('a.topbar-phone')) || $('.topbar-phone', block);

      const address = firstAddressText(data);
      if (locationItem) {
        locationItem.dataset.topbarItem = 'location';
        locationItem.hidden = !address;
        locationItem.classList.toggle('nv-empty-config-hidden', !address);
        if (address) locationItem.innerHTML = `<span class="nv-topbar-icon-wrap">${topbarIconSvg('location')}</span><span class="nv-topbar-text">${escapeHtml(address)}</span>`;
      }

      if (clockItem) {
        clockItem.dataset.topbarItem = 'clock';
        clockItem.hidden = !data.workingHours;
        clockItem.classList.toggle('nv-empty-config-hidden', !data.workingHours);
        if (data.workingHours) clockItem.innerHTML = `<span class="nv-topbar-icon-wrap">${topbarIconSvg('clock')}</span><span class="nv-topbar-text">${escapeHtml(data.workingHours)}</span>`;
      }

      if (phoneItem) {
        phoneItem.dataset.topbarItem = 'phone';
        phoneItem.hidden = !data.clinicPhone;
        phoneItem.classList.toggle('nv-empty-config-hidden', !data.clinicPhone);
        if (data.clinicPhone) {
          phoneItem.href = phoneHref(data.clinicPhone);
          phoneItem.setAttribute('aria-label', `تماس با کلینیک ${toPersianDigits(data.clinicPhone)}`);
          phoneItem.innerHTML = `<span class="nv-topbar-icon-wrap">${topbarIconSvg('phone')}</span><span class="nv-topbar-text">${toPersianDigits(data.clinicPhone)}</span>`;
        }
      }
    });
  }


  function updatePhoneLinks(data) {
    const phone = data.clinicPhone;
    const href = phoneHref(phone);
    $$('a[href^="tel:"], a.topbar-phone, .nv-floating-cta a[aria-label*="تماس"]').forEach(link => {
      link.setAttribute('href', href);
      link.setAttribute('dir', 'ltr');
      const plainText = clean(link.textContent).replace(/[\s+\-()]/g, '');
      if (link.classList.contains('topbar-phone') || /^([0-9۰-۹٠-٩]+)$/.test(plainText) || link.querySelector('.nv-icon-phone')) {
        link.innerHTML = `<span class="nv-topbar-icon-wrap">${topbarIconSvg('phone')}</span><span class="nv-topbar-text">${toPersianDigits(phone)}</span>`;
      }
    });

    $$('.topbar-contact, .nv-topbar-list').forEach(block => {
      $$('span', block).forEach(span => {
        const text = clean(span.textContent);
        if (/تماس|تلفن|شماره/.test(text)) {
          span.innerHTML = `تماس: <strong>${toPersianDigits(phone)}</strong>`;
        }
      });
    });
  }

  function ensureSocialVisibilityStyle() {
    if (document.getElementById('nv-social-visibility-style')) return;
    const style = document.createElement('style');
    style.id = 'nv-social-visibility-style';
    style.textContent = 'a.social-link[hidden],a.social-link.is-hidden{display:none!important;visibility:hidden!important;pointer-events:none!important}';
    document.head.appendChild(style);
  }

  function hideSocialLink(link) {
    link.hidden = true;
    link.classList.add('is-hidden');
    link.classList.remove('nv-social-visible');
    link.setAttribute('aria-hidden', 'true');
    link.setAttribute('tabindex', '-1');
    link.dataset.nvDisabledSocial = '1';
    link.setAttribute('href', '#');
    link.style.setProperty('display', 'none', 'important');
    link.style.setProperty('visibility', 'hidden', 'important');
    link.style.setProperty('pointer-events', 'none', 'important');
  }

  function showSocialLink(link, href) {
    link.hidden = false;
    link.classList.remove('is-hidden');
    link.classList.add('nv-social-visible');
    link.removeAttribute('aria-hidden');
    link.removeAttribute('tabindex');
    delete link.dataset.nvDisabledSocial;
    link.style.removeProperty('display');
    link.style.removeProperty('visibility');
    link.style.removeProperty('pointer-events');
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }


  function setHiddenIfEmpty(el, value) {
    if (!el) return;
    const hasValue = clean(value) !== '';
    el.hidden = !hasValue;
    el.classList.toggle('nv-empty-config-hidden', !hasValue);
  }

  function updateSocialLinks(data) {
    ensureSocialVisibilityStyle();
    SOCIALS.forEach(name => {
      const href = clean(data.socialLinks && data.socialLinks[name]);
      const enabled = !(data.socialEnabled && data.socialEnabled[name] === false);
      $$(`a.social-link.${name}`).forEach(link => {
        if (!enabled || !href || href === '#') {
          hideSocialLink(link);
          return;
        }
        link.classList.remove('is-empty-social');
        showSocialLink(link, href);
      });
    });
  }

  function directInfoTarget(item) {
    const children = Array.from(item.children || []);
    let target = children.find(child => {
      if (!child || child.nodeType !== 1) return false;
      if (child.matches('a')) return false;
      if (child.classList && child.classList.contains('nv-contact-icon')) return false;
      if (child.querySelector && child.querySelector('.nv-inline-icon')) return false;
      return true;
    });
    if (!target) {
      target = document.createElement('span');
      target.className = 'nv-contact-main';
      item.appendChild(target);
    }
    return target;
  }

  function updateFooterContactBlocks(data) {
    $$('.footer .contact-list').forEach(list => {
      if (list.dataset?.nvStaticFooter === 'true' || list.closest?.('[data-nv-static-footer="true"]')) return;
      if (list.dataset?.nvFooterStatic === 'true' || list.closest?.('[data-nv-footer-static="true"]')) return;
      const rows = [];
      const addresses = Array.isArray(data.clinicAddresses) && data.clinicAddresses.length
        ? data.clinicAddresses
        : (data.clinicAddress ? [{ key: 'default', label: 'آدرس', text: data.clinicAddress }] : []);

      addresses.forEach((item, index) => {
        const label = escapeHtml(toPersianDigits(item.label || `آدرس ${index + 1}`));
        const text = escapeHtml(toPersianDigits(item.text || ''));
        if (!text) return;
        rows.push(`<li class="nv-footer-contact-row nv-footer-address" data-address-key="${escapeHtml(item.key || index)}"><span class="nv-contact-icon">${index === 0 ? '<span class="nv-inline-icon nv-icon-location" aria-hidden="true"></span>' : ''}</span><span class="nv-contact-main"><span class="nv-contact-label">${label}:&nbsp;</span><span class="nv-contact-value">${text}</span></span></li>`);
      });

      if (data.workingHours) {
        rows.push(`<li class="nv-footer-contact-row nv-footer-hours"><span class="nv-contact-icon"><span class="nv-inline-icon nv-icon-clock" aria-hidden="true"></span></span><span class="nv-contact-main"><span class="nv-contact-label">ساعت کاری:&nbsp;</span><span class="nv-contact-value">${escapeHtml(data.workingHours)}</span></span></li>`);
      }
      if (data.clinicPhone) {
        rows.push(`<li class="nv-footer-contact-row nv-footer-phone"><span class="nv-contact-icon"><span class="nv-inline-icon nv-icon-phone" aria-hidden="true"></span></span><a class="nv-contact-main" href="${escapeHtml(phoneHref(data.clinicPhone))}"><span class="nv-contact-label">تلفن:&nbsp;</span><span class="nv-contact-value">${escapeHtml(toPersianDigits(data.clinicPhone))}</span></a></li>`);
      }
      const nextHtml = rows.join('');
      if (list.innerHTML !== nextHtml) list.innerHTML = nextHtml;
      setHiddenIfEmpty(list, rows.length ? '1' : '');
    });
  }

  function updateContactList(data) {
    updateFooterContactBlocks(data);
    $$('.contact-list li').forEach(item => {
      if (item.closest('.footer')) return;
      const text = clean(item.textContent);
      if (item.querySelector('.nv-icon-location') || /آدرس/.test(text)) {
        const target = directInfoTarget(item);
        target.innerHTML = data.clinicAddress ? addressLinesHtml(data) : '';
        setHiddenIfEmpty(item, data.clinicAddress);
      } else if (item.querySelector('.nv-icon-clock') || /ساعت/.test(text)) {
        const target = directInfoTarget(item);
        target.innerHTML = data.workingHours ? `<strong>ساعت کاری:</strong> ${escapeHtml(data.workingHours)}` : '';
        setHiddenIfEmpty(item, data.workingHours);
      } else if (item.querySelector('.nv-icon-phone') || item.querySelector('a[href^="tel:"]')) {
        let link = Array.from(item.children || []).find(child => child.matches && child.matches('a'));
        if (!link) {
          link = document.createElement('a');
          link.className = 'nv-contact-main';
          item.appendChild(link);
        }
        link.href = phoneHref(data.clinicPhone);
        link.removeAttribute('dir');
        link.innerHTML = data.clinicPhone ? `<strong>تلفن:</strong> ${escapeHtml(toPersianDigits(data.clinicPhone))}` : '';
        setHiddenIfEmpty(item, data.clinicPhone);
      }
    });
  }

  function updateLocationBlocks(data) {
    const addressHtml = data.clinicAddress ? addressLinesHtml(data) : '';

    $$('.home-location-details').forEach(block => {
      const rows = [];
      if (data.clinicAddress) {
        rows.push(`<div class="nv-visit-row nv-visit-address"><span class="nv-inline-icon nv-icon-location" aria-hidden="true"></span><div><strong class="nv-info-label">آدرس:</strong><div class="nv-address-holder">${addressHtml}</div></div></div>`);
      }
      if (data.workingHours) {
        rows.push(`<div class="nv-visit-row nv-visit-hours"><span class="nv-inline-icon nv-icon-clock" aria-hidden="true"></span><div><strong class="nv-info-label">ساعت کاری:</strong><span class="nv-info-value">${escapeHtml(data.workingHours)}</span></div></div>`);
      }
      if (data.clinicPhone) {
        rows.push(`<a class="nv-visit-row nv-visit-phone" href="${escapeHtml(phoneHref(data.clinicPhone))}"><span class="nv-inline-icon nv-icon-phone" aria-hidden="true"></span><div><strong class="nv-info-label">تلفن:</strong><span class="nv-info-value">${escapeHtml(toPersianDigits(data.clinicPhone))}</span></div></a>`);
      }
      const nextHtml = rows.join('');
      if (block.innerHTML !== nextHtml) block.innerHTML = nextHtml;
      setHiddenIfEmpty(block, rows.length ? '1' : '');
    });

    $$('.quick-item').forEach(item => {
      const label = clean($('strong', item)?.textContent || '');
      if (label.includes('شماره')) {
        let link = $('a', item);
        if (!link) return;
        link.href = phoneHref(data.clinicPhone);
        link.removeAttribute('dir');
        link.textContent = toPersianDigits(data.clinicPhone);
        setHiddenIfEmpty(item, data.clinicPhone);
      } else if (label.includes('آدرس')) {
        const holder = $('small', item) || $('div', item);
        if (holder) holder.innerHTML = addressHtml;
        setHiddenIfEmpty(item, data.clinicAddress);
      } else if (label.includes('ساعت')) {
        setText($('small', item), data.workingHours);
        setHiddenIfEmpty(item, data.workingHours);
      }
    });

    $$('.home-location-grid').forEach(grid => {
      const link = $('.home-location-copy .map-open-link', grid);
      const mapCard = $('.home-location-map-card', grid);
      if (link && mapCard && link.parentElement !== mapCard) {
        mapCard.appendChild(link);
      }
    });

    $$('.map-open-link').forEach(link => {
      link.href = data.mapUrl || '#';
      link.target = data.mapUrl ? '_blank' : '';
      link.rel = data.mapUrl ? 'noopener' : '';
      setHiddenIfEmpty(link, data.mapUrl);
    });

    $$('[aria-label*="نقشه موقعیت کلینیک"]').forEach(el => {
      el.setAttribute('aria-label', data.clinicName ? `نقشه موقعیت ${data.clinicName}` : 'نقشه موقعیت کلینیک');
    });
  }

  function replaceKnownTextNodes(root, data) {
    const host = root || document.body;
    if (!host) return;
    const replacements = new Map([
      ...KNOWN_CLINIC_NAMES.map(item => [item, data.clinicName]),
      ['09221971397', data.clinicPhone],
      ['۰۹۲۲۱۹۷۱۳۹۷', data.clinicPhone],
      ['تهران، قیطریه', data.clinicAddress],
      ['محدوده قیطریه تهران', data.clinicAddress],
      ['شنبه تا پنجشنبه، ساعت ۹ تا ۲۳', data.workingHours],
      ['شنبه تا پنجشنبه، ۹ تا ۲۳', data.workingHours],
      ['مشاوره آنلاین', 'مشاوره آنلاین'],
      ['مشاوره آنلاین', 'مشاوره آنلاین'],
      ['نظارت و مدیریت یکپارچه سامانه صدرا', 'نظارت و مدیریت یکپارچه در سامانه صدرا']
    ]);
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || parent.closest('script, style, textarea, input, select, option, [data-no-fa-digits], [data-nv-footer-static="true"], [data-nv-static-footer="true"], [data-nv-static-topbar="true"], .no-fa-digits, .nv-footer306-info, .nv-final-topbar, .nv-footer-bottom-static')) return NodeFilter.FILTER_REJECT;
        return KNOWN_CONTACT_TEXTS.some(item => String(node.nodeValue || '').includes(item))
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      let value = node.nodeValue;
      replacements.forEach((to, from) => { value = value.split(from).join(to); });
      node.nodeValue = value;
    });
  }


  function updateFooterSignature(data) {
    $$('.footer-bottom').forEach(footer => {
      if (footer.dataset?.nvFooterStatic === 'true' || footer.classList.contains('nv-footer-bottom-static')) return;

      const text = clean(data.footerSignatureText || data.footer_signature_text || DEFAULTS.footerSignatureText || '');
      const url = clean(data.footerSignatureUrl || data.footer_signature_url || DEFAULTS.footerSignatureUrl || '');

      footer.classList.add('nv-footer-centered');
      if (!text && !url) {
        footer.innerHTML = '';
        footer.hidden = true;
        return;
      }

      footer.hidden = false;
      let textNode = footer.querySelector('[data-footer-signature-text]');
      let linkNode = footer.querySelector('[data-footer-signature-url]');

      if (!textNode) {
        textNode = document.createElement('span');
        textNode.setAttribute('data-footer-signature-text', '');
        footer.appendChild(textNode);
      }
      if (!linkNode) {
        linkNode = document.createElement('a');
        linkNode.setAttribute('data-footer-signature-url', '');
        linkNode.target = '_blank';
        linkNode.rel = 'noopener';
        footer.appendChild(linkNode);
      }

      const linkText = (url || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
      if (textNode.textContent !== (text || url)) textNode.textContent = text || url;
      if (url && linkNode.getAttribute('href') !== url) linkNode.setAttribute('href', url);
      if (linkNode.textContent !== linkText) linkNode.textContent = linkText;
      linkNode.hidden = !url;
    });
  }

  function updateStructuredData(data) {
    $$('script[type="application/ld+json"]').forEach(script => {
      try {
        const json = JSON.parse(script.textContent || '{}');
        const items = Array.isArray(json) ? json : [json];
        items.forEach(item => {
          if (!item || typeof item !== 'object') return;
          if (item.telephone !== undefined) item.telephone = data.clinicPhone;
          if (item.name && /کلینیک|صدرا|Sadra/i.test(String(item.name))) item.name = data.clinicName;
          if (item.address && typeof item.address === 'object') {
            item.address.streetAddress = data.clinicAddress;
            item.address.addressLocality = data.clinicAddress.includes('تهران') ? 'تهران' : (item.address.addressLocality || '');
          }
          if (Number.isFinite(Number(data.mapLatitude)) && Number.isFinite(Number(data.mapLongitude))) {
            item.geo = Object.assign(item.geo || { '@type': 'GeoCoordinates' }, {
              '@type': 'GeoCoordinates',
              latitude: Number(data.mapLatitude),
              longitude: Number(data.mapLongitude)
            });
          }
        });
        script.textContent = JSON.stringify(Array.isArray(json) ? items : items[0], null, 2);
      } catch (_) {}
    });
  }

  function apply(data, root = document) {
    if (nvPublicSettingsApplying) return;
    nvPublicSettingsApplying = true;
    try {
      if (nvPublicSettingsObserver) nvPublicSettingsObserver.disconnect();

      document.documentElement.dataset.nvPublicSettings = 'loaded';
      document.documentElement.dataset.clinicPhone = data.clinicPhone;
      document.documentElement.dataset.clinicAddress = data.clinicAddress;
      updatePhoneLinks(data);
      updateTopbarInfo(data);
      updateSocialLinks(data);
      updateContactList(data);
      updateLocationBlocks(data);
      replaceKnownTextNodes(root === document ? document.body : root, data);
      updateTopbarInfo(data);
      updateStructuredData(data);
      updateFooterSignature(data);
      document.dispatchEvent(new CustomEvent('noorvista:public-settings', { detail: { ...data } }));
    } finally {
      nvPublicSettingsApplying = false;
      if (nvPublicSettingsObserver && document.body) {
        nvPublicSettingsObserver.observe(document.body, { childList: true, subtree: true });
      }
    }
  }

  async function init() {
    const data = await fetchConfig();
    window.SadraPublicSiteSettings = Object.assign(window.SadraPublicSiteSettings || {}, {
      get: () => ({ ...data }),
      apply: (root) => apply(data, root)
    });
    apply(data);

    nvPublicSettingsObserver = new MutationObserver(records => {
      if (nvPublicSettingsApplying || nvPublicSettingsScheduled) return;
      const hasRelevantAdditions = records.some(record => {
        if (!record.addedNodes || !record.addedNodes.length) return false;
        return Array.from(record.addedNodes).some(node => {
          if (node.nodeType !== 1) return false;
          if (node.matches && node.matches('script,style,link,[data-nv-ignore-settings]')) return false;
          return true;
        });
      });
      if (!hasRelevantAdditions) return;
      nvPublicSettingsScheduled = true;
      window.requestAnimationFrame(() => {
        nvPublicSettingsScheduled = false;
        apply(data);
      });
    });
    if (document.body) nvPublicSettingsObserver.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
