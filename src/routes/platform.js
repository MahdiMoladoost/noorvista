// src/routes/platform.js
// Phase 3 route module for FAQ, settings, AI gateway and SMS diagnostics.
// Mounted before legacy inline routes in server.js, so existing frontend behavior stays compatible.

const express = require('express');
const rateLimit = require('express-rate-limit');

const asyncHandler = require('../utils/asyncHandler');
const api = require('../utils/apiResponse');
const settingsService = require('../services/settingsService');
const faqService = require('../services/faqService');
const aiService = require('../services/aiService');
const smsService = require('../services/smsService');

const aiChatLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'تعداد پیام‌های چت زیاد است، لطفاً کمی بعد دوباره تلاش کنید'
    }
});

function createPlatformRoutes({ authenticateToken, authorizeRoles }) {
    const router = express.Router();
    const adminOnly = [authenticateToken, authorizeRoles('system_admin', 'admin')];

    router.get('/public/faqs', asyncHandler(async (req, res) => {
        const faqs = await faqService.listPublicFaqs(req.db);
        return api.ok(res, { faqs });
    }));

    router.get('/admin/faqs', ...adminOnly, asyncHandler(async (req, res) => {
        const faqs = await faqService.listAdminFaqs(req.db, req.query.search);
        return api.ok(res, { faqs });
    }));

    router.get('/admin/faqs/:id', ...adminOnly, asyncHandler(async (req, res) => {
        const faq = await faqService.getFaqById(req.db, req.params.id);
        if (!faq) return api.notFound(res, 'سوال پرتکرار یافت نشد');
        return api.ok(res, { faq });
    }));

    router.post('/admin/faqs', ...adminOnly, asyncHandler(async (req, res) => {
        const id = await faqService.createFaq(req.db, req.body, req.user?.id || null);
        return api.created(res, { id }, 'سوال پرتکرار با موفقیت ثبت شد');
    }));

    router.put('/admin/faqs/:id', ...adminOnly, asyncHandler(async (req, res) => {
        const updated = await faqService.updateFaq(req.db, req.params.id, req.body);
        if (!updated) return api.notFound(res, 'سوال پرتکرار یافت نشد');
        return api.ok(res, {}, 'سوال پرتکرار با موفقیت به‌روزرسانی شد');
    }));

    router.delete('/admin/faqs/:id', ...adminOnly, asyncHandler(async (req, res) => {
        const deactivated = await faqService.deactivateFaq(req.db, req.params.id);
        if (!deactivated) return api.notFound(res, 'سوال پرتکرار یافت نشد');
        return api.ok(res, {}, 'سوال پرتکرار غیرفعال شد');
    }));

    router.get('/admin/settings', ...adminOnly, asyncHandler(async (req, res) => {
        const settings = await settingsService.getSettingsMap(req.db, { maskSecrets: true });
        return res.json(settings);
    }));

    router.put('/admin/settings', ...adminOnly, asyncHandler(async (req, res) => {
        await settingsService.upsertSettings(req.db, req.body || null);
        return api.ok(res, {}, 'تنظیمات سیستم ذخیره شد');
    }));

    router.get('/admin/settings/ai', ...adminOnly, asyncHandler(async (req, res) => {
        const settings = await settingsService.getSettingsMap(req.db, { maskSecrets: true });
        const aiSettings = settingsService.filterSettings(settings, settingsService.AI_SETTING_KEYS);
        return api.ok(res, { settings: aiSettings, ...aiSettings });
    }));

    router.put('/admin/settings/ai', ...adminOnly, asyncHandler(async (req, res) => {
        await settingsService.upsertSettings(req.db, req.body, settingsService.AI_SETTING_KEYS);
        return api.ok(res, {}, 'تنظیمات هوش مصنوعی ذخیره شد');
    }));

    router.get('/admin/settings/sms', ...adminOnly, asyncHandler(async (req, res) => {
        const smsSettings = await smsService.getSmsSettings(req.db, { maskSecrets: true });
        return api.ok(res, { settings: smsSettings, ...smsSettings });
    }));

    router.put('/admin/settings/sms', ...adminOnly, asyncHandler(async (req, res) => {
        await settingsService.upsertSettings(req.db, req.body, settingsService.SMS_SETTING_KEYS);
        return api.ok(res, {}, 'تنظیمات پیامک ذخیره شد');
    }));

    // Protected diagnostics and safe service tests.
    router.get('/admin/sms/status', ...adminOnly, asyncHandler(async (req, res) => {
        const status = await smsService.getSmsStatus(req.db);
        return api.ok(res, status);
    }));

    router.post('/admin/sms/test', ...adminOnly, asyncHandler(async (req, res) => {
        const { receptor, message } = req.body || {};
        const result = await smsService.sendTestSms(req.db, { receptor, message });
        if (!result.success) {
            return api.ok(res, result, result.message || 'پیامک ارسال نشد');
        }
        return api.ok(res, { result }, 'پیامک تست با موفقیت ارسال شد');
    }));

    router.post('/admin/ai/test', ...adminOnly, aiChatLimiter, asyncHandler(async (req, res) => {
        const message = String(req.body?.message || 'سلام، لطفاً خیلی کوتاه خودت را معرفی کن.').trim();
        const result = await aiService.chat(req.db, { message, history: [] });
        return api.ok(res, result, 'تست سرویس هوش مصنوعی انجام شد');
    }));

    router.post('/ai/chat', aiChatLimiter, asyncHandler(async (req, res) => {
        const result = await aiService.chat(req.db, req.body || {});
        return api.ok(res, result);
    }));

    return router;
}

module.exports = createPlatformRoutes;
