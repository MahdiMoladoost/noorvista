(function () {
  'use strict';

  if (window.__NV_PUBLIC_CRITICAL_FIX_309__) return;
  window.__NV_PUBLIC_CRITICAL_FIX_309__ = true;

  const FA = '۰۱۲۳۴۵۶۷۸۹';
  const AR = '٠١٢٣٤٥٦٧٨٩';
  const DIGIT_RE = /[0-9٠-٩]/g;
  const NON_EN_RE = /[۰-۹٠-٩]/g;
  const FA_TO_EN = {'۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9','٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9'};

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  function toFa(value) {
    return String(value ?? '')
      .replace(/[0-9]/g, d => FA[Number(d)] || d)
      .replace(/[٠-٩]/g, d => FA[AR.indexOf(d)] || d);
  }

  function toEn(value) {
    return String(value ?? '').replace(NON_EN_RE, d => FA_TO_EN[d] || d);
  }

  function shouldSkip(el) {
    return !el || !!el.closest('script,style,noscript,code,pre,textarea,select,svg,canvas,iframe,[data-keep-en-digits],.keep-en-digits');
  }

  function persianize(root) {
    root = root || document.body;
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || shouldSkip(parent)) return NodeFilter.FILTER_REJECT;
        DIGIT_RE.lastIndex = 0;
        return DIGIT_RE.test(node.nodeValue || '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      const next = toFa(node.nodeValue || '');
      if (next !== node.nodeValue) node.nodeValue = next;
    });
  }

  function assertStaticFlags() {
    const topbar = $('.topbar.nv-static-topbar-shell');
    if (topbar) {
      topbar.dataset.nvStaticTopbar = 'true';
      topbar.setAttribute('data-no-fa-digits', 'true');
      const inner = $('.nv-static-topbar', topbar);
      if (inner) inner.setAttribute('data-no-fa-digits', 'true');
    }

    $$('.footer .nv-static-footer-contact-list, .footer .nv-static-footer-socials, .footer .nv-static-footer-bottom').forEach(el => {
      el.dataset.nvStaticFooter = 'true';
      el.setAttribute('data-no-fa-digits', 'true');
      el.hidden = false;
      el.removeAttribute('aria-hidden');
    });
  }

  function fixMobileMenu() {
    const btn = $('.mobile-toggle, [data-mobile-menu-toggle], .nav-toggle');
    const menu = $('.navbar .menu, [data-mobile-menu], .nav-menu');
    if (!btn || !menu || btn.dataset.nvCriticalMenuReady === 'true') return;
    btn.dataset.nvCriticalMenuReady = 'true';
    btn.addEventListener('click', () => {
      const open = menu.classList.toggle('open') || menu.classList.toggle('is-open');
      document.body.classList.toggle('nv-menu-open', !!open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  function normalizeSubmitDigits() {
    document.addEventListener('submit', event => {
      const form = event.target;
      if (!form || !form.querySelectorAll) return;
      form.querySelectorAll('input,textarea').forEach(field => {
        if (field.type === 'password' || field.type === 'hidden') return;
        field.value = toEn(field.value || '');
      });
    }, true);
  }



  function fixHomepageActiveMenu() {
    const path = (window.location.pathname || '/').replace(/\/index\.html$/, '/');
    const menuLinks = $$('.navbar .menu > li > a');
    if (!menuLinks.length) return;

    function normHref(link) {
      try {
        const url = new URL(link.getAttribute('href') || '', window.location.origin);
        return url.pathname.replace(/\/index\.html$/, '/');
      } catch (_) {
        return link.getAttribute('href') || '';
      }
    }

    let currentKey = 'home';
    if (/\/about\.html$|\/about\/?$/.test(path)) currentKey = 'about';
    else if (/\/services\.html$|\/services\/?$/.test(path)) currentKey = 'services';
    else if (/\/faq\.html$|\/faq\/?$/.test(path)) currentKey = 'faq';
    else if (/\/contact\.html$|\/contact\/?$/.test(path)) currentKey = 'contact';
    else if (/\/blog\.html$|\/blog\/?$/.test(path)) currentKey = 'blog';
    else if (/\/doctors\.html$|\/doctors\/?$/.test(path)) currentKey = 'doctors';
    else if (path === '/' || /\/pages\/public\/?$/.test(path)) currentKey = 'home';

    menuLinks.forEach(link => {
      const href = normHref(link);
      const raw = link.getAttribute('href') || '';
      let key = '';
      if (href === '/') key = 'home';
      else if (/\/about\.html$|\/about\/?$/.test(href)) key = 'about';
      else if (/\/services\.html$|\/services\/?$/.test(href)) key = 'services';
      else if (/\/faq\.html$|\/faq\/?$/.test(href)) key = 'faq';
      else if (/\/contact\.html$|\/contact\/?$/.test(href)) key = 'contact';
      else if (/\/blog\.html$|\/blog\/?$/.test(href) || raw.includes('/blog') || raw.includes('blog.html') || raw.includes('#articles')) key = 'blog';
      else if (/\/doctors\.html$|\/doctors\/?$/.test(href)) key = 'doctors';
      else if (raw.includes('#patient-guide')) key = 'patient-guide';

      link.classList.remove('active');
      link.classList.remove('nv-current-page');
      link.removeAttribute('aria-current');

      if (key && key === currentKey) {
        link.classList.add('nv-current-page');
        link.setAttribute('aria-current', 'page');
      }
    });
  }

  function init() {
    document.documentElement.classList.add('nv-public-critical-309');
    document.body.classList.add('nv-public-critical-309');
    assertStaticFlags();
    fixMobileMenu();
    fixHomepageActiveMenu();
    persianize(document.body);
    normalizeSubmitDigits();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  window.NVPublicCriticalFix309 = { toFa, toEn, persianize };
})();
