'use strict';

const fs = require('fs');
const path = require('path');

const PANEL_DIRECTORIES = Object.freeze({
    admin: 'admin',
    'clinic-admin': 'clinic-manager',
    doctor: 'doctor',
    reception: 'secretary',
    secretary: 'secretary',
    patient: 'patient'
});

function uniquePaths(paths) {
    return [...new Set(paths.filter(Boolean).map(item => path.normalize(item)))];
}

function isSafeHtmlFileName(fileName) {
    return /^[a-z0-9][a-z0-9-]*\.html$/i.test(String(fileName || ''));
}

function resolveFirstExistingFile(candidates, existsSync = fs.existsSync) {
    return uniquePaths(candidates).find(candidate => existsSync(candidate)) || null;
}

function loginPageCandidates(publicDir) {
    return uniquePaths([
        path.join(publicDir, 'pages', 'auth', 'login.html'),
        path.join(publicDir, 'auth', 'login.html'),
        path.join(publicDir, 'pages', 'login.html'),
        path.join(publicDir, 'login.html')
    ]);
}

function publicPageCandidates(publicDir, segments) {
    const cleanSegments = Array.isArray(segments) ? segments.map(String) : [];
    const canonical = path.join(publicDir, 'pages', ...cleanSegments);

    if (cleanSegments.join('/').toLowerCase() === 'auth/login.html') {
        return loginPageCandidates(publicDir);
    }

    return uniquePaths([
        canonical,
        path.join(publicDir, ...cleanSegments)
    ]);
}

function panelPageCandidates(publicDir, panelSlug, fileName) {
    const slug = String(panelSlug || '').toLowerCase();
    const directory = PANEL_DIRECTORIES[slug];
    if (!directory || !isSafeHtmlFileName(fileName)) return [];

    return uniquePaths([
        // Canonical NoorVista structure.
        path.join(publicDir, 'pages', 'dashboard', directory, fileName),
        // Compatibility with earlier patch/install layouts.
        path.join(publicDir, 'pages', 'dashboard', 'panel', slug, fileName),
        path.join(publicDir, 'dashboard', 'panel', slug, fileName),
        path.join(publicDir, 'dashboard', directory, fileName)
    ]);
}

module.exports = {
    PANEL_DIRECTORIES,
    isSafeHtmlFileName,
    resolveFirstExistingFile,
    loginPageCandidates,
    publicPageCandidates,
    panelPageCandidates
};
