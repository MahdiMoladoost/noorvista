'use strict';

const express = require('express');
const path = require('path');
const {
  resolveFirstExistingFile,
  publicPageCandidates,
  panelPageCandidates,
  loginPageCandidates
} = require('../utils/publicPageResolver');

const PUBLIC_PAGE_ROUTES = Object.freeze({
  '/': ['public', 'index.html'],
  '/index': ['public', 'index.html'],
  '/index.html': ['public', 'index.html'],
  '/login': ['auth', 'login.html'],
  '/login.html': ['auth', 'login.html'],
  '/about': ['public', 'about.html'],
  '/about.html': ['public', 'about.html'],
  '/services': ['public', 'services.html'],
  '/services.html': ['public', 'services.html'],
  '/doctors': ['public', 'doctors.html'],
  '/doctors.html': ['public', 'doctors.html'],
  '/faqs': ['public', 'faq.html'],
  '/faq': ['public', 'faq.html'],
  '/faq.html': ['public', 'faq.html'],
  '/blog': ['public', 'blog.html'],
  '/blog.html': ['public', 'blog.html'],
  '/blog-single': ['public', 'blog-single.html'],
  '/blog-single.html': ['public', 'blog-single.html'],
  '/contact': ['public', 'contact.html'],
  '/contact.html': ['public', 'contact.html']
});

const PANEL_ENTRY_POINTS = Object.freeze([
  { paths: ['/dashboard/admin', '/dashboard/panel/admin'], directory: 'admin' },
  { paths: ['/dashboard/clinic', '/dashboard/clinic-manager', '/dashboard/panel/clinic-admin'], directory: 'clinic-manager' },
  { paths: ['/dashboard/doctor', '/dashboard/panel/doctor'], directory: 'doctor' },
  { paths: ['/dashboard/patient', '/dashboard/panel/patient'], directory: 'patient' },
  { paths: ['/dashboard/secretary', '/dashboard/reception', '/dashboard/panel/reception'], directory: 'secretary' }
]);

function relativeCandidates(rootDir, candidates) {
  return candidates.map(candidate => path.relative(rootDir, candidate));
}

function missingUiHtml() {
  return '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>خطای نصب رابط کاربری</title><style>body{margin:0;background:#f4f8fb;color:#17324d;font-family:Tahoma,Arial,sans-serif;line-height:2}.box{max-width:760px;margin:8vh auto;padding:28px;background:#fff;border:2px solid #0b749b;border-radius:18px;box-shadow:0 18px 50px rgba(15,45,70,.12)}h1{font-size:1.55rem;margin:0 0 12px;color:#8b1e2d}code{direction:ltr;display:inline-block;background:#edf4f8;padding:2px 8px;border-radius:7px}</style></head><body><main class="box"><h1>فایل رابط کاربری در دسترس نیست</h1><p>نصب سامانه ناقص است یا ساختار پوشه‌های <code>public/pages</code> درست ادغام نشده است. بسته اصلاحی را دوباره روی ریشه پروژه نصب و سرور را راه‌اندازی مجدد کنید.</p></main></body></html>';
}

function sendResolvedHtml({ res, next, candidates, label, rootDir, logger, strict = false, privatePage = false }) {
  const resolvedPath = resolveFirstExistingFile(candidates);
  if (!resolvedPath) {
    logger?.error?.('UI page is missing', {
      page: label,
      candidates: relativeCandidates(rootDir, candidates)
    });
    if (!strict) return next();
    return res.status(500).type('html').send(missingUiHtml());
  }

  res.type('html');
  if (privatePage) {
    res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  }

  return res.sendFile(resolvedPath, error => {
    if (error) return next(error);
    return undefined;
  });
}

function assertCriticalUiPages(publicDir) {
  const requiredPages = [
    { label: 'auth/login.html', candidates: loginPageCandidates(publicDir) },
    { label: 'dashboard/admin/appointments.html', candidates: panelPageCandidates(publicDir, 'admin', 'appointments.html') }
  ];
  const missing = requiredPages.filter(item => !resolveFirstExistingFile(item.candidates));
  if (!missing.length) return;

  const error = new Error(`Critical UI files are missing: ${missing.map(item => item.label).join(', ')}`);
  error.code = 'NOORVISTA_CRITICAL_UI_MISSING';
  error.missingPages = missing.map(item => item.label);
  throw error;
}

function createUiPagesRouter({ publicDir, logger = console }) {
  if (!publicDir) throw new TypeError('publicDir is required');
  const router = express.Router();
  const rootDir = path.dirname(publicDir);

  Object.entries(PUBLIC_PAGE_ROUTES).forEach(([routePath, segments]) => {
    router.get(routePath, (req, res, next) => {
      const isLogin = routePath === '/login' || routePath === '/login.html';
      return sendResolvedHtml({
        res,
        next,
        candidates: publicPageCandidates(publicDir, segments),
        label: segments.join('/'),
        rootDir,
        logger,
        strict: isLogin,
        privatePage: isLogin
      });
    });
  });

  router.get('/services/:serviceSlug', (req, res, next) => {
    const slug = String(req.params.serviceSlug || '').replace(/\.html$/i, '');
    if (!/^[a-z0-9-]+$/i.test(slug)) return next();
    const candidates = publicPageCandidates(publicDir, ['public', 'services', `${slug}.html`]);
    return sendResolvedHtml({ res, next, candidates, label: `services/${slug}.html`, rootDir, logger });
  });

  router.get(['/teacher-single', '/teacher-single.html'], (req, res) => res.redirect(302, '/doctors'));

  PANEL_ENTRY_POINTS.forEach(entry => {
    router.get(entry.paths, (req, res, next) => sendResolvedHtml({
      res,
      next,
      candidates: publicPageCandidates(publicDir, ['dashboard', entry.directory, 'index.html']),
      label: `dashboard/${entry.directory}/index.html`,
      rootDir,
      logger,
      strict: true,
      privatePage: true
    }));
  });

  router.get('/dashboard/panel/:panel/:page', (req, res, next) => {
    const requestedPage = String(req.params.page || '');
    const fileName = requestedPage.endsWith('.html') ? requestedPage : `${requestedPage}.html`;
    const candidates = panelPageCandidates(publicDir, req.params.panel, fileName);
    if (!candidates.length) return next();
    return sendResolvedHtml({
      res,
      next,
      candidates,
      label: `dashboard/panel/${req.params.panel}/${fileName}`,
      rootDir,
      logger,
      strict: true,
      privatePage: true
    });
  });

  return router;
}

module.exports = {
  PUBLIC_PAGE_ROUTES,
  PANEL_ENTRY_POINTS,
  assertCriticalUiPages,
  createUiPagesRouter,
  missingUiHtml,
  sendResolvedHtml
};
