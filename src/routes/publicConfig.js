'use strict';

const express = require('express');
const { createAsyncRouter } = require('../utils/asyncRouter');
const settingsService = require('../services/settingsService');

function getPublicMapConfig(env = process.env) {
  const apiKey = String(env.NESHAN_API_KEY || '').trim();
  return {
    provider: 'neshan',
    enabled: Boolean(apiKey),
    apiKey: apiKey || null
  };
}

function getPublicFeatureConfig(env = process.env) {
  return {
    onlinePayment: String(env.PAYMENT_ONLINE_ENABLED || '').toLowerCase() === 'true' && Boolean(String(env.PAYMENT_PROVIDER || '').trim()),
    externalAI: String(env.AI_ENABLED || '').toLowerCase() === 'true' && Boolean(String(env.AI_API_KEY || '').trim()),
    sms: String(env.SMS_ENABLED || '').toLowerCase() === 'true' && Boolean(String(env.SMS_API_KEY || '').trim())
  };
}

function cleanText(value, fallback = '') {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function cleanMultiline(value, fallback = '') {
  const text = String(value || '').replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
  return text || fallback;
}

function cleanUrl(value) {
  const text = cleanText(value, '');
  if (!text || text === '#') return '';
  if (/^(https?:\/\/|tel:|mailto:)/i.test(text)) return text;
  if (/^(javascript|data|vbscript):/i.test(text)) return '';
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(text)) return `https://${text}`;
  return text;
}

function cleanNumber(value) {
  const normalized = String(value || '')
    .replace(/[۰-۹]/g, ch => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(ch)))
    .replace(/[٠-٩]/g, ch => String('٠١٢٣٤٥٦٧٨٩'.indexOf(ch)))
    .trim();
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? normalized : '';
}

function normalizeBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return ['1', 'true', 'yes', 'on', 'enabled', 'فعال'].includes(String(value).trim().toLowerCase());
}

function socialEnabled(settings, env, key) {
  const envKey = `SOCIAL_${key.toUpperCase()}_ENABLED`;
  const settingKey = `social_${key}_enabled`;
  return normalizeBoolean(settings[settingKey] ?? env[envKey], false);
}

function socialLink(settings, env, key) {
  if (!socialEnabled(settings, env, key)) return '';
  const envKey = `SOCIAL_${key.toUpperCase()}`;
  return cleanUrl(settings[`social_${key}`] || env[envKey] || '');
}


function addressItemsFromSettings(settings = {}, env = process.env) {
  const legacy = cleanMultiline(settings.clinic_address || env.CLINIC_ADDRESS, '');
  const primaryText = cleanMultiline(settings.clinic_address_primary || env.CLINIC_ADDRESS_PRIMARY || legacy, '');
  const secondaryText = cleanMultiline(settings.clinic_address_secondary || env.CLINIC_ADDRESS_SECONDARY, '');
  const primaryEnabled = normalizeBoolean(settings.clinic_address_primary_enabled ?? env.CLINIC_ADDRESS_PRIMARY_ENABLED, false);
  const secondaryEnabled = normalizeBoolean(settings.clinic_address_secondary_enabled ?? env.CLINIC_ADDRESS_SECONDARY_ENABLED, false);
  const items = [];
  if (primaryEnabled && primaryText) items.push({ key: 'primary', label: 'آدرس ۱', text: primaryText });
  if (secondaryEnabled && secondaryText && secondaryText !== primaryText) items.push({ key: 'secondary', label: 'آدرس ۲', text: secondaryText });
  if (!items.length && legacy) items.push({ key: 'legacy', label: 'آدرس کلینیک', text: legacy });
  return items;
}

function getPublicBrandingConfig(settings = {}, env = process.env) {
  const clinicName = cleanText(settings.clinic_name || env.CLINIC_NAME, '');
  const clinicShortName = cleanText(settings.clinic_short_name || env.CLINIC_SHORT_NAME, '');
  const clinicPhone = cleanText(settings.clinic_phone || env.CLINIC_PHONE, '');
  const clinicSecondaryPhone = cleanText(settings.clinic_secondary_phone || env.CLINIC_SECONDARY_PHONE, '');
  const clinicEmail = cleanText(settings.clinic_email || env.CLINIC_EMAIL, '');
  const clinicAddresses = addressItemsFromSettings(settings, env);
  const clinicAddress = clinicAddresses[0]?.text || cleanMultiline(settings.clinic_address || env.CLINIC_ADDRESS, '');
  const workingHours = cleanText(settings.working_hours || env.CLINIC_WORKING_HOURS, '');
  const openingNote = cleanText(settings.clinic_opening_note || env.CLINIC_OPENING_NOTE, '');
  const mapLatitude = cleanNumber(settings.clinic_latitude || env.CLINIC_LATITUDE);
  const mapLongitude = cleanNumber(settings.clinic_longitude || env.CLINIC_LONGITUDE);
  const mapUrl = cleanUrl(settings.clinic_map_url || env.CLINIC_MAP_URL || '');
  const footerSignatureText = cleanText(settings.footer_signature_text || env.FOOTER_SIGNATURE_TEXT, '');
  const footerSignatureUrl = cleanUrl(settings.footer_signature_url || env.FOOTER_SIGNATURE_URL || '');
  const socialKeys = ['whatsapp', 'telegram', 'instagram', 'bale', 'eitaa', 'rubika', 'soroush', 'gap', 'igap', 'nava'];
  const socialLinks = Object.fromEntries(socialKeys.map(key => [key, socialLink(settings, env, key)]));
  const socialVisibility = Object.fromEntries(socialKeys.map(key => [key, socialEnabled(settings, env, key)]));

  return {
    clinicName,
    clinicShortName,
    clinicPhone,
    clinicSecondaryPhone,
    clinicEmail,
    clinicAddress,
    clinicAddresses,
    workingHours,
    openingNote,
    mapLatitude,
    mapLongitude,
    mapUrl,
    socialLinks,
    socialVisibility,
    socialEnabled: socialVisibility,
    // Backward/HTML-friendly aliases for simple scripts and templates.
    clinic_name: clinicName,
    clinic_short_name: clinicShortName,
    clinic_phone: clinicPhone,
    clinic_secondary_phone: clinicSecondaryPhone,
    clinic_email: clinicEmail,
    clinic_address: clinicAddress,
    clinic_addresses: clinicAddresses,
    clinic_address_primary: cleanMultiline(settings.clinic_address_primary || env.CLINIC_ADDRESS_PRIMARY || clinicAddress, ''),
    clinic_address_primary_enabled: normalizeBoolean(settings.clinic_address_primary_enabled ?? env.CLINIC_ADDRESS_PRIMARY_ENABLED, true),
    clinic_address_secondary: cleanMultiline(settings.clinic_address_secondary || env.CLINIC_ADDRESS_SECONDARY, ''),
    clinic_address_secondary_enabled: normalizeBoolean(settings.clinic_address_secondary_enabled ?? env.CLINIC_ADDRESS_SECONDARY_ENABLED, false),
    working_hours: workingHours,
    clinic_opening_note: openingNote,
    clinic_latitude: mapLatitude,
    clinic_longitude: mapLongitude,
    clinic_map_url: mapUrl,
    footerSignatureText,
    footerSignatureUrl,
    footer_signature_text: footerSignatureText,
    footer_signature_url: footerSignatureUrl,
    social_whatsapp_enabled: socialVisibility.whatsapp,
    social_telegram_enabled: socialVisibility.telegram,
    social_instagram_enabled: socialVisibility.instagram,
    social_bale_enabled: socialVisibility.bale,
    social_eitaa_enabled: socialVisibility.eitaa,
    social_rubika_enabled: socialVisibility.rubika,
    social_soroush_enabled: socialVisibility.soroush,
    social_gap_enabled: socialVisibility.gap,
    social_igap_enabled: socialVisibility.igap,
    social_nava_enabled: socialVisibility.nava,
    productName: 'NoorVista'
  };
}

async function readBrandingSettings(req) {
  if (!req.db) return {};
  try {
    return await settingsService.getSettingsMap(req.db, { maskSecrets: true });
  } catch (error) {
    console.warn('Public branding config warning:', error.message || error);
    return {};
  }
}

function createPublicConfigRouter(options = {}) {
  const router = createAsyncRouter(express);
  const env = options.env || process.env;

  router.get('/features', (req, res) => {
    res.set('Cache-Control', 'no-store, max-age=0');
    res.json({ success: true, data: getPublicFeatureConfig(env) });
  });

  router.get('/map', (req, res) => {
    res.set('Cache-Control', 'no-store, max-age=0');
    res.set('Pragma', 'no-cache');
    res.json({ success: true, data: getPublicMapConfig(env) });
  });

  router.get('/branding', async (req, res) => {
    res.set('Cache-Control', 'no-store, max-age=0');
    res.set('Pragma', 'no-cache');
    const settings = await readBrandingSettings(req);
    res.json({ success: true, data: getPublicBrandingConfig(settings, env) });
  });

  return router;
}

module.exports = {
  createPublicConfigRouter,
  getPublicMapConfig,
  getPublicFeatureConfig,
  getPublicBrandingConfig
};
