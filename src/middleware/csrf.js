'use strict';

const crypto = require('crypto');
const { isProduction } = require('../config/security');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function normalizeOrigin(value) {
  try { return new URL(value).origin; } catch (_) { return null; }
}

function requestOrigin(req) {
  const proto = req.secure ? 'https' : (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
  return `${proto}://${req.get('host')}`;
}

function issueCsrfToken(req, res) {
  const token = crypto.randomBytes(32).toString('base64url');
  res.cookie('csrf_token', token, {
    httpOnly: false,
    secure: isProduction,
    sameSite: 'strict',
    path: '/',
    maxAge: 2 * 60 * 60 * 1000
  });
  return token;
}

function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  // Public provider callbacks cannot use browser CSRF tokens; each provider route
  // must instead verify its signature/nonce server-to-server.
  if (req.path.startsWith('/payments/callback/') || req.path.startsWith('/webhooks/')) return next();

  const cookieAuthenticated = Boolean(req.cookies?.token || req.cookies?.refresh_token || req.cookies?.mfa_challenge);
  if (!cookieAuthenticated) return next();

  const expectedOrigin = requestOrigin(req);
  const origin = normalizeOrigin(req.get('origin'));
  const referer = normalizeOrigin(req.get('referer'));
  const fetchSite = String(req.get('sec-fetch-site') || '').toLowerCase();

  if (fetchSite === 'cross-site' || (origin && origin !== expectedOrigin) || (!origin && referer && referer !== expectedOrigin)) {
    return res.status(403).json({ success: false, message: 'درخواست بین‌سایتی غیرمجاز است' });
  }

  const cookieToken = String(req.cookies?.csrf_token || '');
  const headerToken = String(req.get('x-csrf-token') || '');
  if (!cookieToken || !headerToken || cookieToken.length !== headerToken.length ||
      !crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))) {
    return res.status(403).json({ success: false, message: 'توکن امنیتی درخواست نامعتبر است' });
  }

  next();
}

module.exports = { csrfProtection, issueCsrfToken, requestOrigin };
