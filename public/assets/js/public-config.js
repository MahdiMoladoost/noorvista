(function () {
  'use strict';

  if (window.SadraPublicConfig) return;

  let mapConfigPromise = null;
  let brandingConfigPromise = null;

  async function getMapConfig() {
    if (!mapConfigPromise) {
      mapConfigPromise = fetch('/api/public/config/map', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      })
        .then(async (response) => {
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || payload.success === false) {
            throw new Error('Public map configuration is unavailable.');
          }
          return payload.data || {};
        })
        .catch(() => ({ provider: 'neshan', enabled: false, apiKey: null }));
    }

    return mapConfigPromise;
  }



  async function getBrandingConfig() {
    if (!brandingConfigPromise) {
      brandingConfigPromise = fetch('/api/public/config/branding', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      })
        .then(async (response) => {
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || payload.success === false) {
            throw new Error('Public branding configuration is unavailable.');
          }
          return payload.data || {};
        })
        .catch(() => ({ clinicName: 'کلینیک چشم پزشکی دکتر محمدصادق حق پرست' }));
    }

    return brandingConfigPromise;
  }

  window.SadraPublicConfig = { getMapConfig, getBrandingConfig };
})();
