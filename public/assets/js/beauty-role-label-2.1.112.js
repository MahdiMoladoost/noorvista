(function () {
  'use strict';
  const BEAUTY_LABEL = 'زیباجو';
  function normalize(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }
  function patchLabels(root = document) {
    root.querySelectorAll('.nv3-user-copy > small, [data-nv3-user-role], .nv-header-user-role, .user-role').forEach((el) => {
      if (normalize(el.textContent) === 'بیمار') el.textContent = BEAUTY_LABEL;
    });
    root.querySelectorAll('.nv3-user-copy .user-name, [data-nv3-user-name]').forEach((el) => {
      if (normalize(el.textContent) === 'بیمار') el.textContent = BEAUTY_LABEL;
    });
    root.querySelectorAll('[data-fallback="بی"]').forEach((el) => {
      el.dataset.fallback = 'زی';
      if (normalize(el.textContent) === 'بی') el.textContent = 'زی';
    });
  }
  patchLabels();
  const observer = new MutationObserver((items) => {
    for (const item of items) {
      if (item.type === 'childList') item.addedNodes.forEach((node) => node.nodeType === 1 && patchLabels(node));
      if (item.type === 'characterData') patchLabels(item.target.parentElement || document);
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  document.addEventListener('DOMContentLoaded', () => patchLabels());
  window.setTimeout(() => patchLabels(), 250);
  window.setTimeout(() => patchLabels(), 1000);
})();
