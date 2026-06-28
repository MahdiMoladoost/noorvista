(function () {
  'use strict';

  const MAP_ID = 'neshanContactMap';

  const NESHAN_CSS_URL = 'https://static.neshan.org/sdk/leaflet/v1.9.4/neshan-sdk/v1.0.8/index.css';
  const NESHAN_JS_URL = 'https://static.neshan.org/sdk/leaflet/v1.9.4/neshan-sdk/v1.0.8/index.js';
  let sdkPromise = null;

  function loadNeshanSdk() {
    if (window.L && typeof window.L.Map === 'function') return Promise.resolve();
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise(function (resolve, reject) {
      if (!document.querySelector('link[data-nv-neshan-sdk]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = NESHAN_CSS_URL;
        link.dataset.nvNeshanSdk = '1';
        document.head.appendChild(link);
      }
      const script = document.createElement('script');
      script.src = NESHAN_JS_URL;
      script.async = true;
      script.defer = true;
      script.dataset.nvNeshanSdk = '1';
      script.onload = function () { resolve(); };
      script.onerror = function () { reject(new Error('Neshan SDK unavailable')); };
      document.head.appendChild(script);
    });
    return sdkPromise;
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char];
    });
  }

  function normalizeDigits(value) {
    return String(value || '')
      .replace(/[۰-۹]/g, ch => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(ch)))
      .replace(/[٠-٩]/g, ch => String('٠١٢٣٤٥٦٧٨٩'.indexOf(ch)));
  }

  async function getClinicConfig() {
    try {
      const branding = await window.SadraPublicConfig?.getBrandingConfig?.();
      return branding || {};
    } catch (_) {
      return {};
    }
  }

  function resolveLocation(config) {
    const lat = Number(normalizeDigits(config.mapLatitude || config.clinic_latitude || ''));
    const lng = Number(normalizeDigits(config.mapLongitude || config.clinic_longitude || ''));
    if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
    return null;
  }

  function showFallback() {
    const fallback = document.getElementById('neshanMapFallback');
    if (fallback) fallback.hidden = false;
  }

  async function initNeshanMap() {
    const mapEl = document.getElementById(MAP_ID);
    if (!mapEl) return;

    const [config, mapConfig] = await Promise.all([
      getClinicConfig(),
      window.SadraPublicConfig?.getMapConfig?.().catch(() => ({}))
    ]);
    const apiKey = mapConfig && mapConfig.enabled ? mapConfig.apiKey : '';
    const clinicLocation = resolveLocation(config);

    if (!clinicLocation || !apiKey) {
      showFallback();
      return;
    }

    try {
      await loadNeshanSdk();
      if (!window.L || typeof window.L.Map !== 'function') throw new Error('Neshan SDK unavailable');
      const map = new window.L.Map(MAP_ID, {
        key: apiKey,
        maptype: 'dreamy',
        center: clinicLocation,
        zoom: 15,
        zoomControl: true,
        scrollWheelZoom: false
      });

      const clinicName = config.clinicName || config.clinic_name || 'کلینیک چشم پزشکی دکتر محمدصادق حق پرست';
      const address = config.clinicAddress || config.clinic_address || 'محدوده قیطریه تهران';
      window.L.marker(clinicLocation)
        .addTo(map)
        .bindPopup(
          '<div class="clinic-map-popup"><strong>' + escapeHtml(clinicName) + '</strong><span>' + escapeHtml(address) + '</span></div>'
        )
        .openPopup();

      setTimeout(function () {
        map.invalidateSize();
      }, 350);
    } catch (error) {
      showFallback();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNeshanMap);
  } else {
    initNeshanMap();
  }
})();
