(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var body = doc.body;
  if (!body || body.dataset.nvInternationalUiux === '1') return;
  body.dataset.nvInternationalUiux = '1';

  var path = window.location.pathname.replace(/\/+$/, '') || '/';
  body.classList.add('nv-ux-ready');
  if (path === '/login' || path.indexOf('/login') === 0 || body.classList.contains('login-page')) {
    body.classList.add('nv-page-login');
  } else if (path.indexOf('/dashboard') === 0 || doc.querySelector('.dashboard-container,.dashboard-layout,.admin-layout,.panel-layout,.sidebar,.admin-sidebar,.panel-sidebar')) {
    body.classList.add('nv-page-dashboard');
  } else {
    body.classList.add('nv-page-public');
  }

  function ready(fn) {
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  ready(function () {
    ensureSkipLink();
    ensureProgressBar();
    enhanceCurrentNavigation();
    enhanceMobileNavigation();
    enhanceTables();
    enhanceForms();
    ensureBackToTop();
    root.classList.add('nv-uiux-enhanced');
  });

  function ensureSkipLink() {
    if (doc.querySelector('.nv-skip-link')) return;
    var main = doc.querySelector('main') || doc.querySelector('.main-content,.dashboard-main,.admin-main,.panel-main');
    if (!main) return;
    if (!main.id) main.id = 'nv-main-content';
    var link = doc.createElement('a');
    link.className = 'nv-skip-link';
    link.href = '#' + main.id;
    link.textContent = 'پرش به محتوای اصلی';
    body.insertBefore(link, body.firstChild);
  }

  function ensureProgressBar() {
    if (doc.querySelector('.nv-scrollbar')) return;
    var bar = doc.createElement('div');
    bar.className = 'nv-scrollbar';
    bar.setAttribute('aria-hidden', 'true');
    body.appendChild(bar);
    var ticking = false;
    function update() {
      var max = Math.max(1, doc.documentElement.scrollHeight - window.innerHeight);
      var ratio = Math.max(0, Math.min(1, window.scrollY / max));
      bar.style.transform = 'scaleX(' + ratio + ')';
      ticking = false;
    }
    function onScroll() {
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    update();
  }

  function enhanceCurrentNavigation() {
    var current = normalizePath(window.location.pathname);
    doc.querySelectorAll('nav a[href], .menu a[href], .sidebar a[href], .admin-sidebar a[href], .panel-sidebar a[href]').forEach(function (link) {
      var href = link.getAttribute('href') || '';
      if (!href || href.indexOf('#') === 0 || href.indexOf('javascript:') === 0) return;
      try {
        var url = new URL(href, window.location.origin);
        if (url.origin !== window.location.origin) return;
        var target = normalizePath(url.pathname);
        var isHome = current === '/' && target === '/';
        var isExact = target !== '/' && (current === target || current === target.replace(/\.html$/, '') || current.indexOf(target + '/') === 0);
        if (isHome || isExact) {
          link.classList.add('active');
          link.setAttribute('aria-current', 'page');
        }
      } catch (_) {}
    });
  }

  function normalizePath(value) {
    value = String(value || '/').replace(/\/+$/, '') || '/';
    return value.replace(/\.html$/i, '');
  }

  function enhanceMobileNavigation() {
    var toggle = doc.getElementById('mobileToggle') || doc.querySelector('.mobile-toggle,[data-mobile-toggle]');
    var menu = doc.getElementById('menu') || doc.querySelector('.menu');
    if (!toggle || !menu) return;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      var open = !body.classList.contains('nv-menu-open');
      body.classList.toggle('nv-menu-open', open);
      toggle.setAttribute('aria-expanded', String(open));
    });
    doc.addEventListener('click', function (event) {
      if (!body.classList.contains('nv-menu-open')) return;
      if (event.target.closest && event.target.closest('.nav-inner')) return;
      body.classList.remove('nv-menu-open');
      toggle.setAttribute('aria-expanded', 'false');
    });
    doc.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        body.classList.remove('nv-menu-open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function enhanceTables() {
    if (!body.classList.contains('nv-page-dashboard')) return;
    doc.querySelectorAll('table').forEach(function (table) {
      if (table.closest('.nv-table-wrap') || table.closest('.dataTables_wrapper')) return;
      var wrapper = doc.createElement('div');
      wrapper.className = 'nv-table-wrap';
      table.parentNode.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    });
  }

  function enhanceForms() {
    doc.querySelectorAll('form').forEach(function (form) {
      if (form.dataset.nvSubmitEnhanced === '1') return;
      form.dataset.nvSubmitEnhanced = '1';
      form.addEventListener('submit', function () {
        var button = form.querySelector('button[type="submit"], .btn-login');
        if (!button || button.disabled) return;
        button.classList.add('nv-loading-bar');
        window.setTimeout(function () { button.classList.remove('nv-loading-bar'); }, 2400);
      });
    });
  }

  function ensureBackToTop() {
    if (doc.querySelector('.nv-back-to-top')) return;
    var btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'nv-back-to-top';
    btn.setAttribute('aria-label', 'بازگشت به بالا');
    btn.textContent = '↑';
    body.appendChild(btn);
    btn.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
    var ticking = false;
    function update() {
      btn.classList.toggle('is-visible', window.scrollY > 520);
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    }, { passive: true });
    update();
  }
})();
