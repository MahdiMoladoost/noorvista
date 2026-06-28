
(function () {
  if (window.__NV_SETTINGS_SOCIAL_MAP_REFINE_2157__) return;
  window.__NV_SETTINGS_SOCIAL_MAP_REFINE_2157__ = true;

  const SOCIAL_KEYS = ['whatsapp','telegram','instagram','bale','eitaa','rubika','soroush','gap','igap','nava'];

  function normalizeSocialUrl(key, value) {
    let v = String(value || '').trim();
    if (!v) return '';
    if (key === 'whatsapp') {
      v = v.replace(/\s+/g, '');
      const digits = v.replace(/[^\d]/g, '');
      if (/^09\d{9}$/.test(digits)) return `https://wa.me/98${digits.slice(1)}`;
      if (/^989\d{9}$/.test(digits)) return `https://wa.me/${digits}`;
      return v.replace(/\?text$/i, '');
    }
    if (/^(instagram|telegram|bale|eitaa|rubika|soroush|gap|igap|nava)$/.test(key) && !/^https?:\/\//i.test(v)) {
      return `https://${v.replace(/^\/+/, '')}`;
    }
    return v;
  }

  function enhanceSocialCards() {
    SOCIAL_KEYS.forEach(key => {
      const input = document.getElementById(`social_${key}`);
      const checkbox = document.getElementById(`social_${key}_enabled`);
      if (!input || !checkbox) return;
      const card = input.closest('.social-setting-item');
      if (!card) return;
      if (!card.querySelector('.nv-social-inline-error')) {
        const error = document.createElement('div');
        error.className = 'nv-social-inline-error';
        error.textContent = 'برای نمایش در سایت، لینک این شبکه را وارد کنید.';
        card.appendChild(error);
      }
      const refresh = () => {
        input.value = normalizeSocialUrl(key, input.value);
        const invalid = checkbox.checked && !input.value.trim();
        card.classList.toggle('is-invalid', invalid);
      };
      checkbox.addEventListener('change', refresh);
      input.addEventListener('blur', refresh);
      input.addEventListener('input', () => card.classList.remove('is-invalid'));
      refresh();
    });
  }

  function addOsmTilesToSettingsMap() {
    const canvas = document.getElementById('nvSettingsMapCanvas');
    if (!canvas || !window.L || !window.L.tileLayer) return;
    setTimeout(() => {
      // If the old Neshan map made a blue grid without tiles, overlay OSM tiles.
      try {
        const maps = document.querySelectorAll('#nvSettingsMapCanvas .leaflet-tile-pane img');
        if (maps.length > 0) return;
        // Existing map instance is not exposed, so no-op here. The patched core JS will create OSM map on next load.
      } catch (_) {}
    }, 1200);
  }

  function cleanupLocationTitle() {
    const panel = document.getElementById('nvSettingsMapPicker');
    if (!panel) return;
    const head = panel.querySelector('.nv-settings-map-picker__head div');
    if (head && !head.dataset.nvCleaned) {
      head.dataset.nvCleaned = '1';
      head.innerHTML = '<strong><i class="icon-location" aria-hidden="true"></i> انتخاب موقعیت کلینیک</strong><small>روی نقشه کلیک کنید؛ همان نقطه به‌عنوان موقعیت کلینیک ذخیره می‌شود.</small>';
    }
    const def = panel.querySelector('[data-nv-map-default]');
    if (def) def.remove();
    const fb = panel.querySelector('.nv-settings-map-picker__fallback');
    if (fb && /قیطریه/.test(fb.textContent || '')) {
      fb.textContent = 'نقشه آماده نشد. صفحه را با Ctrl+F5 تازه‌سازی کنید یا کلید نقشه را بررسی کنید.';
    }
  }

  function run() {
    enhanceSocialCards();
    cleanupLocationTitle();
    addOsmTilesToSettingsMap();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();

  const obs = new MutationObserver(() => {
    clearTimeout(obs._timer);
    obs._timer = setTimeout(run, 100);
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
})();
