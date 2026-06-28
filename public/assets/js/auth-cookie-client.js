/* Sadra secure same-origin authentication client. */
(function () {
  'use strict';
  if (window.__NOORVISTA_COOKIE_AUTH__) return;
  window.__NOORVISTA_COOKIE_AUTH__ = true;

  const nativeFetch = window.fetch.bind(window);
  const unsafe = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
  const noRefreshPaths = new Set([
    '/api/auth/login', '/api/auth/logout', '/api/auth/refresh-token',
    '/api/auth/csrf-token', '/api/auth/request-otp', '/api/auth/verify-otp',
    '/api/auth/2fa/setup', '/api/auth/2fa/enable', '/api/auth/2fa/verify-login',
    '/api/auth/check'
  ]);
  let csrfPromise = null;
  let refreshPromise = null;

  function nativeFetchWithTimeout(url, options, timeoutMs) {
    if (typeof AbortController !== 'function') return nativeFetch(url, options);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    return nativeFetch(url, { ...options, signal: controller.signal })
      .finally(() => window.clearTimeout(timeoutId));
  }

  function cookie(name) {
    const prefix = `${encodeURIComponent(name)}=`;
    const item = document.cookie.split('; ').find((part) => part.startsWith(prefix));
    return item ? decodeURIComponent(item.slice(prefix.length)) : '';
  }

  async function csrfToken() {
    const existing = cookie('csrf_token');
    if (existing) return existing;
    if (!csrfPromise) {
      csrfPromise = nativeFetchWithTimeout('/api/auth/csrf-token', {
        method: 'GET', credentials: 'same-origin', headers: { Accept: 'application/json' }
      }, 4000)
        .then((response) => response.ok ? response.json() : {})
        .then((data) => data.csrf_token || cookie('csrf_token'))
        .catch(() => '')
        .finally(() => { csrfPromise = null; });
    }
    return csrfPromise;
  }

  async function prepare(input, init) {
    const options = { ...(init || {}) };
    const url = new URL(typeof input === 'string' ? input : input.url, window.location.href);
    if (url.origin !== window.location.origin) return { url, options };

    options.credentials = 'same-origin';
    const method = String(options.method || (typeof input !== 'string' && input.method) || 'GET').toUpperCase();
    const baseHeaders = new Headers(options.headers || (typeof input !== 'string' ? input.headers : undefined));
    baseHeaders.delete('Authorization');
    if (!baseHeaders.has('Accept')) baseHeaders.set('Accept', 'application/json');
    options.headers = baseHeaders;

    if (unsafe.has(method)) {
      const token = await csrfToken();
      if (token) baseHeaders.set('X-CSRF-Token', token);
    }
    return { url, options };
  }

  async function refreshSession() {
    if (!refreshPromise) {
      refreshPromise = (async () => {
        const token = await csrfToken();
        const headers = new Headers({ Accept: 'application/json' });
        if (token) headers.set('X-CSRF-Token', token);
        const response = await nativeFetchWithTimeout('/api/auth/refresh-token', {
          method: 'POST', credentials: 'same-origin', headers
        }, 6000);
        return response.ok;
      })().catch(() => false).finally(() => { refreshPromise = null; });
    }
    return refreshPromise;
  }

  window.fetch = async function secureFetch(input, init) {
    const prepared = await prepare(input, init);
    let response = await nativeFetch(input, prepared.options);

    const sameOrigin = prepared.url.origin === window.location.origin;
    const mayRefresh = sameOrigin && response.status === 401 && !noRefreshPaths.has(prepared.url.pathname);
    if (mayRefresh && await refreshSession()) {
      const retry = await prepare(input, init);
      response = await nativeFetch(input, retry.options);
    }
    return response;
  };

  const authStorageKeys = [
    'token', 'authToken', 'noorvista_token',
    'user', 'currentUser', 'authUser',
    'rememberedUsername'
  ];

  function clearClientAuthStorage() {
    authStorageKeys.forEach((key) => {
      try { localStorage.removeItem(key); } catch (_) {}
      try { sessionStorage.removeItem(key); } catch (_) {}
    });
  }

  // Remove legacy bearer tokens on every page load. Other auth data is cleared only on logout/expiry.
  ['token', 'authToken', 'noorvista_token'].forEach((key) => {
    try { localStorage.removeItem(key); sessionStorage.removeItem(key); } catch (_) {}
  });

  window.noorvistaClearClientAuth = clearClientAuthStorage;
  window.__NOORVISTA_COOKIE_AUTH_READY__ = true;

  let logoutPromise = null;

  window.noorvistaLogout = function noorvistaLogout() {
    if (logoutPromise) return logoutPromise;

    // Mark logout before any asynchronous work so in-flight profile requests cannot restore user data.
    window.__NOORVISTA_LOGGING_OUT__ = true;
    clearClientAuthStorage();

    logoutPromise = (async () => {
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timeoutId = window.setTimeout(() => controller?.abort(), 1800);
      try {
        await window.fetch('/api/auth/logout', {
          method: 'POST',
          credentials: 'same-origin',
          keepalive: true,
          ...(controller ? { signal: controller.signal } : {})
        });
      } catch (_) {
        // A local logout must still finish when the server or network is unavailable.
      } finally {
        window.clearTimeout(timeoutId);
        clearClientAuthStorage();
        window.location.replace('/login');
      }
    })();

    return logoutPromise;
  };
})();
