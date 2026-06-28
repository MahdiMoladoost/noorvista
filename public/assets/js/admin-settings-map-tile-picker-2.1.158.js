
(function () {
  if (window.__NV_SETTINGS_TILE_PICKER_2158__) return;
  window.__NV_SETTINGS_TILE_PICKER_2158__ = true;

  const faDigits = '۰۱۲۳۴۵۶۷۸۹';
  const arDigits = '٠١٢٣٤٥٦٧٨٩';
  const toEnglishDigits = (value) => String(value ?? '')
    .replace(/[۰-۹]/g, d => String(faDigits.indexOf(d)))
    .replace(/[٠-٩]/g, d => String(arDigits.indexOf(d)));
  const toFa = (value) => String(value ?? '').replace(/\d/g, d => faDigits[Number(d)]);

  function num(value) {
    const n = Number(toEnglishDigits(value));
    return Number.isFinite(n) ? n : null;
  }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

  const TILE = 256;
  function project(lat, lng, zoom) {
    const sin = Math.sin(lat * Math.PI / 180);
    const scale = TILE * Math.pow(2, zoom);
    return {
      x: (lng + 180) / 360 * scale,
      y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale
    };
  }
  function unproject(x, y, zoom) {
    const scale = TILE * Math.pow(2, zoom);
    const lng = x / scale * 360 - 180;
    const n = Math.PI - 2 * Math.PI * y / scale;
    const lat = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    return { lat, lng };
  }

  function buildPicker() {
    const panel = document.getElementById('nvSettingsMapPicker');
    const canvas = document.getElementById('nvSettingsMapCanvas');
    const latInput = document.getElementById('clinic_latitude');
    const lngInput = document.getElementById('clinic_longitude');
    const urlInput = document.getElementById('clinic_map_url');
    if (!panel || !canvas || !latInput || !lngInput || canvas.dataset.nvTilePickerReady === '1') return false;

    canvas.dataset.nvTilePickerReady = '1';
    panel.classList.add('nv-settings-map-picker--manual');

    const head = panel.querySelector('.nv-settings-map-picker__head div');
    if (head) {
      head.innerHTML = '<strong><i class="icon-location" aria-hidden="true"></i> انتخاب موقعیت کلینیک</strong><small>روی نقشه کلیک کنید؛ همان نقطه به‌عنوان موقعیت کلینیک ذخیره می‌شود.</small>';
    }
    panel.querySelector('[data-nv-map-default]')?.remove();

    let zoom = 15;
    let center = {
      lat: num(latInput.value) ?? 35.6892,
      lng: num(lngInput.value) ?? 51.3890
    };
    let selected = { ...center };

    canvas.innerHTML = '<div class="nv-manual-map-tiles"></div><div class="nv-manual-map-marker" aria-hidden="true"></div><div class="nv-manual-map-controls"><button type="button" data-map-zoom-in>+</button><button type="button" data-map-zoom-out>−</button></div>';
    const tiles = canvas.querySelector('.nv-manual-map-tiles');
    const marker = canvas.querySelector('.nv-manual-map-marker');
    const coordsEl = panel.querySelector('[data-nv-map-coords]');
    const open = panel.querySelector('[data-nv-map-open]');

    function setInputs(lat, lng) {
      selected = { lat, lng };
      latInput.value = String(lat);
      lngInput.value = String(lng);
      const url = `https://neshan.org/maps/@${lat},${lng},16z,0p`;
      if (urlInput) urlInput.value = url;
      if (open) open.href = url;
      if (coordsEl) coordsEl.textContent = `${toFa(lat.toFixed(6))} ، ${toFa(lng.toFixed(6))}`;
    }

    function render() {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(320, Math.round(rect.width || canvas.clientWidth || 900));
      const height = Math.max(260, Math.round(rect.height || canvas.clientHeight || 360));
      const scaleTiles = Math.pow(2, zoom);
      const centerPx = project(center.lat, center.lng, zoom);
      const startX = centerPx.x - width / 2;
      const startY = centerPx.y - height / 2;
      const firstTileX = Math.floor(startX / TILE);
      const firstTileY = Math.floor(startY / TILE);
      const lastTileX = Math.floor((startX + width) / TILE);
      const lastTileY = Math.floor((startY + height) / TILE);
      tiles.innerHTML = '';
      for (let x = firstTileX; x <= lastTileX; x += 1) {
        for (let y = firstTileY; y <= lastTileY; y += 1) {
          if (y < 0 || y >= scaleTiles) continue;
          const wrappedX = ((x % scaleTiles) + scaleTiles) % scaleTiles;
          const img = document.createElement('img');
          img.alt = '';
          img.decoding = 'async';
          img.loading = 'lazy';
          img.src = `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${y}.png`;
          img.style.left = `${Math.round(x * TILE - startX)}px`;
          img.style.top = `${Math.round(y * TILE - startY)}px`;
          tiles.appendChild(img);
        }
      }
      const selectedPx = project(selected.lat, selected.lng, zoom);
      marker.style.left = `${Math.round(selectedPx.x - startX)}px`;
      marker.style.top = `${Math.round(selectedPx.y - startY)}px`;
      setInputs(selected.lat, selected.lng);
    }

    canvas.addEventListener('click', (event) => {
      if (event.target.closest('.nv-manual-map-controls')) return;
      const rect = canvas.getBoundingClientRect();
      const centerPx = project(center.lat, center.lng, zoom);
      const x = centerPx.x - rect.width / 2 + (event.clientX - rect.left);
      const y = centerPx.y - rect.height / 2 + (event.clientY - rect.top);
      const point = unproject(x, y, zoom);
      selected = { lat: clamp(point.lat, -85, 85), lng: clamp(point.lng, -180, 180) };
      center = { ...selected };
      render();
    });

    canvas.querySelector('[data-map-zoom-in]')?.addEventListener('click', () => { zoom = clamp(zoom + 1, 5, 19); center = { ...selected }; render(); });
    canvas.querySelector('[data-map-zoom-out]')?.addEventListener('click', () => { zoom = clamp(zoom - 1, 5, 19); center = { ...selected }; render(); });

    window.addEventListener('resize', () => window.requestAnimationFrame(render), { passive: true });
    setInputs(selected.lat, selected.lng);
    window.requestAnimationFrame(render);
    setTimeout(render, 250);
    setTimeout(render, 800);
    return true;
  }

  function run() {
    if (buildPicker()) return;
    const fallback = document.querySelector('#nvSettingsMapCanvas .nv-settings-map-picker__fallback');
    if (fallback && /قیطریه|کلید نقشه/.test(fallback.textContent || '')) {
      fallback.textContent = 'نقشه آماده‌سازی می‌شود. اگر نمایش داده نشد، صفحه را با Ctrl+F5 تازه‌سازی کنید.';
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();

  const obs = new MutationObserver(() => {
    clearTimeout(obs._timer);
    obs._timer = setTimeout(run, 120);
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
})();
