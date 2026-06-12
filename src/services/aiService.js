// src/services/aiService.js
// AI gateway service. The frontend must never know provider URL/API key.

const settingsService = require('./settingsService');
const faqService = require('./faqService');

function getFallbackAIReply() {
    const fallbackResponses = [
        'متأسفم، در حال حاضر قادر به پاسخگویی نیستم. لطفاً با شماره ۰۲۱-۲۲۳۳۴۴۵۵ تماس بگیرید.',
        'در حال حاضر سرویس پاسخگویی با مشکل مواجه شده است. لطفاً بعداً تلاش کنید.',
        'برای دریافت پاسخ سوال خود، لطفاً با پشتیبانی کلینیک تماس بگیرید.'
    ];

    return fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
}

function buildAISystemPrompt(settings = {}) {
    const configuredPrompt = String(settings.ai_system_prompt || '').trim();
    if (configuredPrompt) return configuredPrompt;

    return `شما یک دستیار هوشمند برای کلینیک تخصصی چشم پزشکی NoorVista هستید.
فقط به پرسش‌های مرتبط با چشم‌پزشکی، نوبت‌دهی، خدمات کلینیک، مراقبت قبل و بعد از عمل و اطلاعات عمومی پاسخ دهید.
پاسخ‌ها باید فارسی، مؤدبانه، کوتاه و بدون ادعای تشخیص قطعی باشند.
در صورت وجود درد شدید، کاهش ناگهانی دید، ضربه به چشم یا جرقه‌های نوری، مراجعه فوری به پزشک یا اورژانس را توصیه کنید.`;
}

function normalizeHistory(history) {
    if (!Array.isArray(history)) return [];
    return history.slice(-6).map(item => ({
        role: item.role === 'assistant' ? 'assistant' : 'user',
        content: String(item.content || '').slice(0, 2000)
    })).filter(item => item.content);
}

async function chat(pool, { message, history = [] }) {
    const cleanMessage = String(message || '').trim();
    if (!cleanMessage) {
        const error = new Error('پیام خود را وارد کنید');
        error.statusCode = 400;
        throw error;
    }

    await faqService.ensureFaqTable(pool);
    await settingsService.ensureDefaultSettings(pool);

    const settings = await settingsService.getSettingsMap(pool);

    if (settingsService.normalizeBoolean(settings.ai_use_faq_first, true)) {
        const faqMatch = await faqService.findFaqAnswer(pool, cleanMessage);
        if (faqMatch) {
            return {
                source: 'faq',
                faq_id: faqMatch.id,
                reply: faqMatch.answer
            };
        }
    }

    const aiEnabled = settingsService.normalizeBoolean(settings.ai_enabled, false);
    const apiKey = settings.ai_api_key || process.env.AI_API_KEY;

    if (!aiEnabled || !apiKey) {
        return {
            source: 'fallback',
            reply: getFallbackAIReply()
        };
    }

    const baseUrl = String(settings.ai_base_url || process.env.AI_BASE_URL || 'https://api.gapgpt.app/v1').replace(/\/+$/, '');
    const messages = [
        { role: 'system', content: buildAISystemPrompt(settings) },
        ...normalizeHistory(history),
        { role: 'user', content: cleanMessage.slice(0, 2000) }
    ];

    try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: settings.ai_model || process.env.AI_MODEL || 'gapgpt-qwen-3.5',
                messages,
                temperature: settingsService.normalizeNumber(settings.ai_temperature, 0.7, 0, 2),
                max_tokens: settingsService.normalizeNumber(settings.ai_max_tokens, 500, 50, 2000),
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error(`AI API error: ${response.status}`);
        }

        const data = await response.json();
        return {
            source: 'ai',
            reply: data?.choices?.[0]?.message?.content || getFallbackAIReply()
        };
    } catch (error) {
        console.error('AI gateway error:', error.message);
        return {
            source: 'fallback',
            reply: getFallbackAIReply()
        };
    }
}

module.exports = {
    getFallbackAIReply,
    buildAISystemPrompt,
    normalizeHistory,
    chat
};
