/* Sadra 2.1.93 — runtime branding from system settings */
(function () {
  'use strict';

  const DEFAULT_CLINIC_NAME = 'کلینیک چشم پزشکی دکتر محمدصادق حق پرست';
  const KNOWN_CLINIC_NAMES = [
    'کلینیک چشم‌پزشکی دکتر محمدصادق حق‌پرست',
    'کلینیک چشم پزشکی دکتر محمدصادق حق پرست',
    'کلینیک چشم‌پزشکی دکتر حق‌پرست',
    'کلینیک چشم پزشکی دکتر حق پرست',
    'کلینیک صدرا',
    'سامانه کلینیک'
  ];

  let brandingPromise = null;
  let branding = { clinicName: DEFAULT_CLINIC_NAME, clinicShortName: '', clinicPhone: '', clinicAddress: '' };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function clean(value, fallback = '') {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text || fallback;
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function splitClinicName(name) {
    const cleaned = clean(name, DEFAULT_CLINIC_NAME);
    const match = cleaned.match(/^(.*?)(دکتر\s+.+)$/);
    if (match && clean(match[1])) return { title: clean(match[1]), subtitle: clean(match[2]) };
    return { title: cleaned, subtitle: clean(branding.clinicShortName, 'سامانه مدیریت کلینیک') };
  }

  async function fetchBranding() {
    if (!brandingPromise) {
      brandingPromise = (async () => {
        try {
          if (window.SadraPublicConfig?.getBrandingConfig) {
            const data = await window.SadraPublicConfig.getBrandingConfig();
            return data || {};
          }
          const response = await fetch('/api/public/config/branding', {
            method: 'GET',
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { Accept: 'application/json' }
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || payload.success === false) throw new Error('branding unavailable');
          return payload.data || {};
        } catch (_) {
          return {};
        }
      })();
    }
    const data = await brandingPromise;
    branding = {
      clinicName: clean(data.clinicName || data.clinic_name, DEFAULT_CLINIC_NAME),
      clinicShortName: clean(data.clinicShortName || data.clinic_short_name, ''),
      clinicPhone: clean(data.clinicPhone || data.clinic_phone, ''),
      clinicAddress: clean(data.clinicAddress || data.clinic_address, '')
    };
    return branding;
  }

  function replaceKnownNames(text, clinicName) {
    let output = String(text || '');
    KNOWN_CLINIC_NAMES.forEach(item => {
      output = output.replace(new RegExp(escapeRegExp(item), 'g'), clinicName);
    });
    return output;
  }

  function updateTitleAndMeta(clinicName) {
    if (document.title) document.title = replaceKnownNames(document.title, clinicName);
    $$('meta[name="description"], meta[property="og:title"], meta[property="og:description"], meta[name="twitter:title"]').forEach(meta => {
      const content = meta.getAttribute('content');
      if (content) meta.setAttribute('content', replaceKnownNames(content, clinicName));
    });
  }

  function updateBrandBlocks(clinicName) {
    const parts = splitClinicName(clinicName);

    $$('.login-clinic-fullname, [data-nv-clinic-name]').forEach(el => { el.textContent = clinicName; });
    $$('.login-card, .login-shell').forEach(el => el.setAttribute('aria-label', `ورود ${clinicName}`));

    $$('.nv-pay-brand').forEach(link => {
      link.setAttribute('aria-label', `بازگشت به صفحه اصلی ${clinicName}`);
      const strong = $('strong', link);
      const small = $('small', link);
      if (strong) strong.textContent = parts.title;
      if (small) small.textContent = parts.subtitle;
    });

    $$('.nv3-brand, .nv-shell-brand').forEach(link => link.setAttribute('aria-label', `داشبورد ${clinicName}`));
    $$('.nv3-brand-copy').forEach(copy => {
      const strong = $('strong', copy);
      const small = $('small', copy);
      if (strong) strong.textContent = parts.title;
      if (small) small.textContent = parts.subtitle;
    });
  }

  function replaceTextNodes(root, clinicName) {
    const host = root || document.body;
    if (!host) return;
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || parent.closest('script, style, textarea, input, select, option')) return NodeFilter.FILTER_REJECT;
        return KNOWN_CLINIC_NAMES.some(item => String(node.nodeValue || '').includes(item))
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => { node.nodeValue = replaceKnownNames(node.nodeValue, clinicName); });
  }

  function applyBranding(root = document) {
    const clinicName = clean(branding.clinicName, DEFAULT_CLINIC_NAME);
    document.documentElement.dataset.clinicName = clinicName;
    updateTitleAndMeta(clinicName);
    updateBrandBlocks(clinicName);
    replaceTextNodes(root === document ? document.body : root, clinicName);
    document.dispatchEvent(new CustomEvent('noorvista:branding', { detail: { ...branding } }));
  }

  async function loadAndApply() {
    await fetchBranding();
    applyBranding();
    return branding;
  }

  window.SadraBranding = Object.assign(window.SadraBranding || {}, {
    load: loadAndApply,
    apply: applyBranding,
    get: () => ({ ...branding }),
    splitClinicName
  });

  function init() {
    void loadAndApply();
    const observer = new MutationObserver(records => {
      if (!records.some(record => record.addedNodes && record.addedNodes.length)) return;
      window.requestAnimationFrame(() => applyBranding());
    });
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
