(function () {
  'use strict';

  if (window.__NV_PERSIAN_DIGITS_FINAL_307__) return;
  window.__NV_PERSIAN_DIGITS_FINAL_307__ = true;

  var FA = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
  var AR_TO_FA = {'٠':'۰','١':'۱','٢':'۲','٣':'۳','٤':'۴','٥':'۵','٦':'۶','٧':'۷','٨':'۸','٩':'۹'};
  var FA_TO_EN = {'۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9','٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9'};
  var DIGIT_RE = /[0-9٠-٩]/g;
  var NON_EN_RE = /[۰-۹٠-٩]/g;
  var scheduled = false;
  var observer = null;

  function toFa(value) {
    if (value == null) return value;
    return String(value).replace(DIGIT_RE, function (d) {
      return AR_TO_FA[d] || FA[Number(d)] || d;
    });
  }

  function toEn(value) {
    if (value == null) return value;
    return String(value).replace(NON_EN_RE, function (d) {
      return FA_TO_EN[d] || d;
    });
  }

  window.NVToPersianDigits = toFa;
  window.NVToEnglishDigits = toEn;

  function isEditable(el) {
    return !!(el && el.closest && el.closest('input:not([readonly]):not([disabled]), textarea:not([readonly]):not([disabled]), [contenteditable="true"]'));
  }

  function shouldSkipElement(el) {
    if (!el || el.nodeType !== 1) return false;
    return !!el.closest('script,style,noscript,code,pre,textarea,select,svg,canvas,iframe,video,audio,[data-keep-en-digits],.keep-en-digits,.nv-en-digits');
  }

  function convertTextNode(node) {
    if (!node || node.nodeType !== 3) return;
    var parent = node.parentElement;
    if (!parent || shouldSkipElement(parent) || isEditable(parent)) return;
    var current = node.nodeValue || '';
    if (!DIGIT_RE.test(current)) {
      DIGIT_RE.lastIndex = 0;
      return;
    }
    DIGIT_RE.lastIndex = 0;
    var next = toFa(current);
    if (next !== current) node.nodeValue = next;
  }

  function convertTextNodes(root) {
    if (!root) return;
    if (root.nodeType === 3) {
      convertTextNode(root);
      return;
    }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1 && shouldSkipElement(root)) return;

    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var parent = node.parentElement;
        if (!parent || shouldSkipElement(parent) || isEditable(parent)) return NodeFilter.FILTER_REJECT;
        DIGIT_RE.lastIndex = 0;
        return DIGIT_RE.test(node.nodeValue || '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });

    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(convertTextNode);
  }

  function convertAttributes(root) {
    if (!root || !root.querySelectorAll) return;
    var nodes = [];
    if (root.nodeType === 1) nodes.push(root);
    root.querySelectorAll('[placeholder],[title],[aria-label],[aria-valuetext],input[readonly],input[disabled]').forEach(function (el) {
      nodes.push(el);
    });

    nodes.forEach(function (el) {
      if (shouldSkipElement(el) || isEditable(el)) return;

      ['placeholder', 'title', 'aria-label', 'aria-valuetext'].forEach(function (attr) {
        var value = el.getAttribute && el.getAttribute(attr);
        if (!value) return;
        DIGIT_RE.lastIndex = 0;
        if (!DIGIT_RE.test(value)) return;
        DIGIT_RE.lastIndex = 0;
        var next = toFa(value);
        if (next !== value) el.setAttribute(attr, next);
      });

      if (el.matches && el.matches('input[readonly],input[disabled]') && el.type !== 'password' && el.type !== 'hidden') {
        var v = el.value || '';
        DIGIT_RE.lastIndex = 0;
        if (v && DIGIT_RE.test(v)) {
          DIGIT_RE.lastIndex = 0;
          el.value = toFa(v);
        }
      }
    });
  }

  function convertFinalIsolatedBlocks() {
    [
      '.nv-final-topbar__text',
      '.nv-footer306-copy',
      '.nv-footer306-phone',
      '.nv-footer306-address-line',
      '.nv-footer306-row',
      '.nv-final-topbar__item'
    ].forEach(function (selector) {
      document.querySelectorAll(selector).forEach(function (el) {
        if (!el || el.querySelector('svg,img,video,canvas')) {
          // Only change direct text nodes so icons/images remain untouched.
          Array.prototype.forEach.call(el.childNodes || [], function (node) {
            if (node.nodeType === 3) convertTextNode(node);
          });
          return;
        }
        var text = el.textContent || '';
        DIGIT_RE.lastIndex = 0;
        if (!DIGIT_RE.test(text)) return;
        DIGIT_RE.lastIndex = 0;
        var next = toFa(text);
        if (next !== text) el.textContent = next;
      });
    });
  }

  function persianize(root) {
    try {
      if (observer) observer.disconnect();
      convertTextNodes(root || document.body);
      convertAttributes(root || document.body);
      convertFinalIsolatedBlocks();
    } finally {
      startObserver();
    }
  }

  function schedule(root) {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(function () {
      scheduled = false;
      persianize(root || document.body);
    });
  }

  function startObserver() {
    if (!observer || !document.body) return;
    try {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['placeholder', 'title', 'aria-label', 'aria-valuetext', 'value']
      });
    } catch (_) {}
  }

  window.NVRefreshPersianDigits = function (root) {
    try { persianize(root || document.body); } catch (_) {}
  };

  function normalizeObject(value) {
    if (typeof value === 'string') return toEn(value);
    if (Array.isArray(value)) return value.map(normalizeObject);
    if (value && typeof value === 'object' && !(value instanceof File) && !(value instanceof Blob)) {
      Object.keys(value).forEach(function (key) { value[key] = normalizeObject(value[key]); });
    }
    return value;
  }

  if (window.fetch && !window.fetch.__nvDigitNormalized307) {
    var originalFetch = window.fetch;
    var wrappedFetch = function (input, init) {
      if (init && init.body) {
        try {
          if (typeof init.body === 'string') {
            var trimmed = init.body.trim();
            if ((trimmed[0] === '{' && trimmed[trimmed.length - 1] === '}') || (trimmed[0] === '[' && trimmed[trimmed.length - 1] === ']')) {
              init.body = JSON.stringify(normalizeObject(JSON.parse(init.body)));
            } else {
              init.body = toEn(init.body);
            }
          } else if (init.body instanceof URLSearchParams) {
            var params = new URLSearchParams();
            init.body.forEach(function (value, key) { params.append(key, toEn(value)); });
            init.body = params;
          } else if (init.body instanceof FormData) {
            var fd = new FormData();
            init.body.forEach(function (value, key) { fd.append(key, typeof value === 'string' ? toEn(value) : value); });
            init.body = fd;
          }
        } catch (_) {}
      }
      return originalFetch(input, init);
    };
    wrappedFetch.__nvDigitNormalized307 = true;
    window.fetch = wrappedFetch;
  }

  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!form || !form.querySelectorAll) return;
    form.querySelectorAll('input,textarea').forEach(function (field) {
      if (field.type === 'password' || field.type === 'hidden') return;
      if (field.value && NON_EN_RE.test(field.value)) {
        NON_EN_RE.lastIndex = 0;
        field.value = toEn(field.value);
      }
    });
  }, true);

  try {
    observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var target = mutations[i].target;
        if (target && target.nodeType === 1 && target.closest && target.closest('script,style,noscript,code,pre,textarea,select,svg,canvas,iframe,[data-keep-en-digits],.keep-en-digits,.nv-en-digits')) continue;
        schedule(document.body);
        break;
      }
    });
  } catch (_) {}

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { persianize(document.body); }, { once: true });
  } else {
    persianize(document.body);
  }

  document.addEventListener('noorvista:public-settings', function () {
    setTimeout(function () { persianize(document.body); }, 30);
    setTimeout(function () { persianize(document.body); }, 180);
  });

  window.addEventListener('load', function () { persianize(document.body); }, { once: true });
})();
