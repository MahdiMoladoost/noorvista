// src/services/faqService.js
// FAQ persistence, bulk import and matching logic used by public FAQ and chatbot.

function normalizeFaq(row) {
    return {
        id: row.id,
        question: row.question,
        answer: row.answer,
        category: row.category || '',
        keywords: row.keywords || '',
        sort_order: Number(row.sort_order) || 0,
        is_active: Boolean(row.is_active),
        show_on_public: Boolean(row.show_on_public),
        use_for_chatbot: Boolean(row.use_for_chatbot),
        created_at: row.created_at,
        updated_at: row.updated_at
    };
}

function normalizeBoolean(value, fallback = true) {
    if (value === undefined || value === null || value === '') return fallback ? 1 : 0;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'number') return value === 0 ? 0 : 1;
    const clean = String(value).trim().toLowerCase();
    if (['0', 'false', 'no', 'off', 'خیر', 'غیرفعال'].includes(clean)) return 0;
    if (['1', 'true', 'yes', 'on', 'بله', 'فعال'].includes(clean)) return 1;
    return fallback ? 1 : 0;
}

function normalizeFaqInput(body = {}) {
    return {
        question: String(body.question || '').trim().slice(0, 500),
        answer: String(body.answer || '').trim().slice(0, 20000),
        category: String(body.category || '').trim().slice(0, 100),
        keywords: String(body.keywords || '').trim().slice(0, 2000),
        sort_order: Math.max(-999999, Math.min(999999, Number.parseInt(body.sort_order, 10) || 0)),
        is_active: normalizeBoolean(body.is_active, true),
        show_on_public: normalizeBoolean(body.show_on_public, true),
        use_for_chatbot: normalizeBoolean(body.use_for_chatbot, true)
    };
}

function normalizeSearchText(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[يى]/g, 'ی')
        .replace(/[ك]/g, 'ک')
        .replace(/[أإآ]/g, 'ا')
        .replace(/[ۀة]/g, 'ه')
        .replace(/[ؤ]/g, 'و')
        .replace(/[ئ]/g, 'ی')
        .replace(/[\u064B-\u065F\u0670]/g, '')
        .replace(/[\u200c\u200e\u200f]/g, ' ')
        .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

const SEARCH_STOPWORDS = new Set([
    'من','ما','شما','او','این','آن','یک','برای','از','به','با','در','روی','را','و','یا','که','چی','چیه','چیست','چطور','چگونه','ایا','آیا','لطفا','لطفاً','می','شود','شده','کنم','کردن','هستم','هست','هستند','دارد','دارم','دارید','باید','ممکن','میشه','می‌شود','است','دور'
]);


const FAQ_INTENT_ALIASES = {
    refractive: ['لیزیک','لازک','فمتولیزیک','فمتو','فمتو لیزیک','اسمایل','smile','prk','transprk','ترنس','ترنس پی آر کی','حذف عینک','برداشتن عینک','اصلاح دید','اصلاح عیوب انکساری','ضعیفی چشم','ضعیف چشم','چشمم ضعیفه','چشمام ضعیفه','چشام ضعیفه','چشم ضعیف','چشمم ضعیف شده','ضعیف شده','شماره چشم','شماره چشمم','نمره چشم','نمره چشمم','برگشت شماره','برگشت نمره','نزدیک بینی','دوربینی','آستیگمات','استیگمات','آستیگماتیسم','عینک','لنز طبی'],
    appointment: ['نوبت','رزرو','وقت','ویزیت','مراجعه','مشاوره','پذیرش'],
    hours: ['ساعت کاری','کی باز','چه ساعتی','باز هستید','تعطیل','زمان مراجعه','شیفت'],
    location: ['آدرس','کجا','لوکیشن','مسیریابی','نقشه','نشانی'],
    contact: ['تلفن','شماره تماس','تماس','واتساپ','ایتا','بله','تلگرام'],
    cost: ['هزینه','قیمت','تعرفه','پرداخت','مبلغ','گران','ارزان'],
    insurance: ['بیمه','تامین اجتماعی','تأمین اجتماعی','تکمیلی','قرارداد'],
    cataract: ['آب مروارید','کاتاراکت','عدسی','لنز داخل چشمی'],
    glaucoma: ['آب سیاه','گلوکوم','فشار چشم'],
    dry_eye: ['خشکی چشم','اشک مصنوعی','سوزش چشم','چشمم میسوزه','چشم میسوزه','میسوزه','می سوزه','میسوزد','سوزش','خارش چشم','خارش','قرمزی چشم','اشک ریزش'],
    dark_circle: ['سیاهی دور چشم','تیرگی دور چشم','دور چشم سیاه','دور چشم تیره','زیر چشم سیاه','زیر چشم تیره','گودی زیر چشم','کبودی دور چشم','هاله تیره دور چشم','سیاه شدن دور چشم','سیاهی زیر چشم'],
    keratoconus: ['قوز قرنیه','کراتوکونوس','قرنیه'],
    amblyopia: ['تنبلی چشم','آمبلیوپی'],
    strabismus: ['انحراف چشم','لوچی','استرابیسم'],
    eyelid: ['پلک','بلفاروپلاستی','افتادگی پلک','پف پلک'],
    child_eye: ['کودک','بچه','نوزاد','اطفال'],
    emergency: ['درد شدید','کاهش دید','ضربه','مواد شیمیایی','ترشح شدید','قرمزی شدید','جرقه نور','سایه در دید','مگس پران جدید']
};

const GENERIC_FAQ_PATTERNS = [
    /خدمات\s*(کلینیک|مرکز)?\s*(چیست|چیه|شامل|دارید|ارائه)/i,
    /چه\s*خدماتی/i,
    /معرفی\s*خدمات/i,
    /درباره\s*کلینیک/i
];

const GENERAL_FAQ_INTENTS = new Set(['appointment', 'hours', 'location', 'contact', 'cost', 'insurance']);

function hasSpecificFaqIntent(intents) {
    const values = intents instanceof Set ? Array.from(intents) : Array.from(intents || []);
    return values.some((intent) => intent && !GENERAL_FAQ_INTENTS.has(intent));
}

function expandIntentText(text) {
    const clean = normalizeSearchText(text);
    const additions = [];
    Object.entries(FAQ_INTENT_ALIASES).forEach(([intent, aliases]) => {
        const hit = aliases.some((alias) => {
            const normalized = normalizeSearchText(alias);
            return normalized && clean.includes(normalized);
        });
        if (hit) additions.push(intent, ...aliases.map(normalizeSearchText));
    });
    return compactUnique(`${clean} ${additions.join(' ')}`.split(' ')).join(' ');
}

function compactUnique(items) {
    const result = [];
    (items || []).forEach((item) => {
        const value = String(item || '').trim();
        if (value && !result.includes(value)) result.push(value);
    });
    return result;
}

function hasAnyPattern(text, patterns) {
    return patterns.some((pattern) => pattern.test(text));
}

function addRuleBasedFaqIntents(clean, intents) {
    const text = String(clean || '');
    const eyeContext = /(چشم|چشمم|چشمام|چشام|دید|بینایی|عینک|لنز|قرنیه|لیزر|عمل|جراحی|نمره|شماره)/i.test(text);

    if (
        hasAnyPattern(text, [
            /لیزیک|لازک|فمتو\s*لیزیک|فمتولیزیک|اسمایل|smile|\bprk\b|ترنس\s*پی\s*آر\s*کی|trans\s*prk/i,
            /حذف\s*عینک|برداشتن\s*عینک|اصلاح\s*دید|عیب\s*انکساری|عیوب\s*انکساری/i,
            /نزدیک\s*بینی|دور\s*بینی|آستیگمات|استیگمات/i,
            /برگشت\s*(شماره|نمره)|برگشت\s*دارد|برمی\s*گردد|برمیگردد|برگرده|برگردد/i
        ])
        || (eyeContext && /(ضعیف|ضعیفی|نمره|شماره|عینک|لنز\s*طبی)/i.test(text))
    ) {
        intents.add('refractive');
    }

    if (hasAnyPattern(text, [/خشک|خشکی|سوزش|می\s*سوز|میسوز|خارش|قرمز|اشک\s*ریزش|اشک/i]) && (eyeContext || text.length <= 40)) {
        intents.add('dry_eye');
    }

    if (hasAnyPattern(text, [
        /(?:دور|زیر)\s*چشم(?:م|ام|هام|هایم|ها)?\s*.*(?:سیاه|تیره|کبود|گود)/i,
        /(?:سیاه|تیره|کبود|گود)\s*.*(?:دور|زیر)\s*چشم/i,
        /سیاهی\s*(?:دور|زیر)\s*چشم/i,
        /تیرگی\s*(?:دور|زیر)\s*چشم/i,
        /گودی\s*(?:دور|زیر)\s*چشم/i
    ])) {
        intents.add('dark_circle');
    }

    if (hasAnyPattern(text, [/آب\s*مروارید|کاتاراکت|عدسی/i])) intents.add('cataract');
    if (hasAnyPattern(text, [/آب\s*سیاه|گلوکوم|فشار\s*چشم/i])) intents.add('glaucoma');
    if (hasAnyPattern(text, [/قوز\s*قرنیه|کراتوکونوس/i])) intents.add('keratoconus');
    if (hasAnyPattern(text, [/تنبلی\s*چشم|آمبلیوپی/i])) intents.add('amblyopia');
    if (hasAnyPattern(text, [/انحراف\s*چشم|لوچی|استرابیسم/i])) intents.add('strabismus');
    if (hasAnyPattern(text, [/پلک|بلفاروپلاستی|افتادگی\s*پلک|پف\s*پلک/i])) intents.add('eyelid');
    if (hasAnyPattern(text, [/کودک|بچه|نوزاد|اطفال/i])) intents.add('child_eye');
    if (hasAnyPattern(text, [/درد\s*شدید|کاهش\s*دید|ضربه|مواد\s*شیمیایی|ترشح\s*شدید|قرمزی\s*شدید|جرقه\s*نور|سایه\s*در\s*دید|مگس\s*پران\s*جدید/i])) intents.add('emergency');
}

function detectFaqIntents(text) {
    const clean = normalizeSearchText(text);
    const intents = new Set();
    if (!clean) return intents;
    Object.entries(FAQ_INTENT_ALIASES).forEach(([intent, aliases]) => {
        if (aliases.some((alias) => {
            const normalized = normalizeSearchText(alias);
            return normalized && clean.includes(normalized);
        })) intents.add(intent);
    });
    addRuleBasedFaqIntents(clean, intents);
    return intents;
}

function faqIntentOverlap(queryText, row) {
    const queryIntents = detectFaqIntents(queryText);
    if (!queryIntents.size) return { queryIntents, rowIntents: new Set(), overlap: 0 };
    const answerText = isGenericFaq(row) ? '' : (row.answer || '');
    const rowText = `${row.question || ''} ${row.keywords || ''} ${row.category || ''} ${answerText}`;
    const rowIntents = detectFaqIntents(rowText);
    let overlap = 0;
    queryIntents.forEach((intent) => { if (rowIntents.has(intent)) overlap += 1; });
    return { queryIntents, rowIntents, overlap: overlap / queryIntents.size };
}

function isGenericFaq(row) {
    const text = `${row.question || ''} ${row.category || ''}`;
    return GENERIC_FAQ_PATTERNS.some((pattern) => pattern.test(text));
}

function tokenVariants(token) {
    const variants = new Set([token]);
    if (/^چشم/.test(token) || /^چشا/.test(token) || token === 'چشام') variants.add('چشم');
    if (/^نمره/.test(token)) variants.add('نمره');
    if (/^شماره/.test(token)) variants.add('شماره');
    const suffixes = ['هایی','های','ها','ترین','تر','مان','تان','شان','ام','ات','اش','م','ت','ش','ی','ه'];
    for (const suffix of suffixes) {
        if (token.length >= suffix.length + 3 && token.endsWith(suffix)) variants.add(token.slice(0, -suffix.length));
    }
    return variants;
}

function tokenize(text, limit = 40) {
    const result = [];
    for (const token of normalizeSearchText(text).split(' ')) {
        if (token.length < 2 || SEARCH_STOPWORDS.has(token)) continue;
        for (const variant of tokenVariants(token)) {
            if (variant.length >= 2 && !SEARCH_STOPWORDS.has(variant) && !result.includes(variant)) result.push(variant);
        }
        if (result.length >= limit) break;
    }
    return result;
}

function charTrigrams(text) {
    const compact = normalizeSearchText(text).replace(/\s+/g, ' ');
    const set = new Set();
    if (compact.length < 3) { if (compact) set.add(compact); return set; }
    for (let index = 0; index <= compact.length - 3; index += 1) set.add(compact.slice(index, index + 3));
    return set;
}

function diceSimilarity(first, second) {
    const a = first instanceof Set ? first : new Set(first || []);
    const b = second instanceof Set ? second : new Set(second || []);
    if (!a.size || !b.size) return 0;
    let overlap = 0;
    for (const value of a) if (b.has(value)) overlap += 1;
    return (2 * overlap) / (a.size + b.size);
}

const WEAK_FUZZY_TOKENS = new Set(['چشم', 'چشما', 'چشمام', 'دید', 'عمل', 'روش', 'بینی', 'دور', 'لیزر', 'جراحی', 'عینک']);

function shouldFuzzyTokenMatch(token, item) {
    if (!token || !item || token === item) return false;
    if (token.length < 4 || item.length < 4) return false;
    if (WEAK_FUZZY_TOKENS.has(token) || WEAK_FUZZY_TOKENS.has(item)) return false;
    return item.includes(token) || token.includes(item);
}

function tokenCoverage(queryTokens, candidateTokens) {
    if (!queryTokens.length || !candidateTokens.length) return 0;
    const candidate = new Set(candidateTokens);
    let matched = 0;
    queryTokens.forEach((token) => {
        if (candidate.has(token) || [...candidate].some((item) => shouldFuzzyTokenMatch(token, item))) matched += 1;
    });
    return matched / queryTokens.length;
}

function scoreFaqMatch(message, row) {
    const query = normalizeSearchText(message);
    const question = normalizeSearchText(row.question);
    const keywords = normalizeSearchText(row.keywords || '');
    const answer = normalizeSearchText(row.answer || '');
    if (!query || !question) return 0;

    // امتیاز اصلی باید روی متن واقعی سؤال/کلیدواژه باشد؛ گسترش کامل intent باعث می‌شد همه FAQهای یک حوزه
    // مثل «حذف عینک» و «ضعیفی چشم» بیش از حد شبیه هم شوند و پاسخ نامرتبط انتخاب شود.
    const queryTokens = tokenize(query);
    const questionTokens = tokenize(question);
    const keywordTokens = tokenize(keywords);
    const combinedTokens = [...new Set([...questionTokens, ...keywordTokens])];
    const exact = query === question ? 1 : 0;
    const phrase = question.includes(query) || query.includes(question) ? Math.min(query.length, question.length) / Math.max(query.length, question.length) : 0;
    const questionCoverage = tokenCoverage(queryTokens, questionTokens);
    const keywordCoverage = tokenCoverage(queryTokens, keywordTokens);
    const combinedCoverage = tokenCoverage(queryTokens, combinedTokens);
    const trigram = diceSimilarity(charTrigrams(query), charTrigrams(`${question} ${keywords}`));
    const { queryIntents, rowIntents, overlap } = faqIntentOverlap(query, row);
    const generic = isGenericFaq(row);
    const hasSpecificIntent = hasSpecificFaqIntent(queryIntents);
    const conflictingIntentPenalty = queryIntents.has('dark_circle') && rowIntents.has('refractive') && !rowIntents.has('dark_circle') ? 0.45 : 0;
    // برای سؤال‌های تخصصی/علامتی، متن پاسخ یک FAQ کلی نباید باعث انتخاب مستقیم آن شود.
    const answerCoverage = hasSpecificIntent && generic ? 0 : tokenCoverage(queryTokens, tokenize(answer, 100));
    const lengthPenalty = queryTokens.length === 1 && combinedCoverage < 1 ? 0.18 : 0;
    const genericPenalty = hasSpecificIntent && generic ? 0.55 : 0;
    const intentBoost = overlap > 0 && !(hasSpecificIntent && generic) ? Math.min(0.18, overlap * 0.18) : 0;

    const score = exact * 1
        + phrase * 0.28
        + questionCoverage * 0.32
        + keywordCoverage * 0.16
        + combinedCoverage * 0.16
        + answerCoverage * 0.05
        + trigram * 0.14
        + intentBoost
        - lengthPenalty
        - genericPenalty
        - conflictingIntentPenalty;
    return Math.max(0, Math.min(1, score));
}

async function ensureFaqTable(pool) {
    const [rows] = await pool.query(
        `SELECT 1 FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'faqs' LIMIT 1`
    );
    if (!rows.length) {
        const error = new Error('Database migration required: faqs table is missing');
        error.statusCode = 503;
        error.code = 'MIGRATION_REQUIRED';
        throw error;
    }
}

async function listPublicFaqs(pool) {
    await ensureFaqTable(pool);
    const [rows] = await pool.query(
        `SELECT id, question, answer, category, keywords, sort_order, is_active, show_on_public, use_for_chatbot, created_at, updated_at
         FROM faqs
         WHERE is_active = 1 AND show_on_public = 1
         ORDER BY sort_order ASC, id DESC`
    );
    return rows.map(normalizeFaq);
}

async function listAdminFaqs(pool, search = '') {
    await ensureFaqTable(pool);

    const cleanSearch = String(search || '').trim();
    const params = [];
    let where = '';

    if (cleanSearch) {
        where = 'WHERE question LIKE ? OR answer LIKE ? OR keywords LIKE ? OR category LIKE ?';
        const like = `%${cleanSearch}%`;
        params.push(like, like, like, like);
    }

    const [rows] = await pool.query(
        `SELECT id, question, answer, category, keywords, sort_order, is_active, show_on_public, use_for_chatbot, created_at, updated_at
         FROM faqs ${where}
         ORDER BY sort_order ASC, id DESC
         LIMIT 500`,
        params
    );

    return rows.map(normalizeFaq);
}

async function getFaqById(pool, id) {
    await ensureFaqTable(pool);
    const [rows] = await pool.query('SELECT * FROM faqs WHERE id = ? LIMIT 1', [id]);
    return rows[0] ? normalizeFaq(rows[0]) : null;
}

function assertFaqRequired(faq) {
    if (!faq.question || !faq.answer) {
        const error = new Error('پرسش و پاسخ الزامی است');
        error.statusCode = 400;
        throw error;
    }
}

async function createFaq(pool, body, createdBy = null) {
    await ensureFaqTable(pool);
    const faq = normalizeFaqInput(body);
    assertFaqRequired(faq);

    const [result] = await pool.query(
        `INSERT INTO faqs
         (question, answer, category, keywords, sort_order, is_active, show_on_public, use_for_chatbot, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [faq.question, faq.answer, faq.category, faq.keywords, faq.sort_order, faq.is_active, faq.show_on_public, faq.use_for_chatbot, createdBy]
    );

    return result.insertId;
}

async function updateFaq(pool, id, body) {
    await ensureFaqTable(pool);
    const faq = normalizeFaqInput(body);
    assertFaqRequired(faq);

    const [result] = await pool.query(
        `UPDATE faqs
         SET question = ?, answer = ?, category = ?, keywords = ?, sort_order = ?, is_active = ?, show_on_public = ?, use_for_chatbot = ?
         WHERE id = ?`,
        [faq.question, faq.answer, faq.category, faq.keywords, faq.sort_order, faq.is_active, faq.show_on_public, faq.use_for_chatbot, id]
    );

    return result.affectedRows > 0;
}

async function importFaqRows(pool, rows, options = {}) {
    await ensureFaqTable(pool);
    if (!Array.isArray(rows) || rows.length === 0) {
        const error = new Error('فایل انتخاب‌شده هیچ ردیف قابل ورود ندارد');
        error.statusCode = 400;
        throw error;
    }
    if (rows.length > 25) {
        const error = new Error('در هر مرحله حداکثر ۲۵ ردیف قابل ورود است');
        error.statusCode = 400;
        throw error;
    }

    const duplicateMode = options.duplicateMode === 'update' ? 'update' : 'skip';
    const createdBy = Number(options.createdBy) > 0 ? Number(options.createdBy) : null;
    const connection = typeof pool.getConnection === 'function' ? await pool.getConnection() : pool;
    const shouldRelease = connection !== pool && typeof connection.release === 'function';
    const result = { inserted: 0, updated: 0, skipped: 0, invalid: 0, errors: [] };

    try {
        if (typeof connection.beginTransaction === 'function') await connection.beginTransaction();
        const [existingRows] = await connection.query('SELECT id, question FROM faqs');
        const existingByQuestion = new Map();
        existingRows.forEach((item) => {
            const key = normalizeSearchText(item.question);
            if (key && !existingByQuestion.has(key)) existingByQuestion.set(key, Number(item.id));
        });
        const fileKeys = new Set();

        for (let index = 0; index < rows.length; index += 1) {
            const faq = normalizeFaqInput(rows[index] || {});
            const rowNumber = Number(rows[index]?.row_number) || index + 2;
            if (!faq.question || !faq.answer) {
                result.invalid += 1;
                result.errors.push({ row: rowNumber, message: 'پرسش یا پاسخ خالی است' });
                continue;
            }
            const key = normalizeSearchText(faq.question);
            if (!key) {
                result.invalid += 1;
                result.errors.push({ row: rowNumber, message: 'متن پرسش معتبر نیست' });
                continue;
            }
            if (fileKeys.has(key)) {
                result.skipped += 1;
                result.errors.push({ row: rowNumber, message: 'پرسش تکراری در همین فایل' });
                continue;
            }
            fileKeys.add(key);

            const existingId = existingByQuestion.get(key);
            if (existingId && duplicateMode === 'skip') {
                result.skipped += 1;
                continue;
            }

            if (existingId) {
                await connection.query(
                    `UPDATE faqs
                     SET question = ?, answer = ?, category = ?, keywords = ?, sort_order = ?, is_active = ?, show_on_public = ?, use_for_chatbot = ?, updated_at = NOW()
                     WHERE id = ?`,
                    [faq.question, faq.answer, faq.category, faq.keywords, faq.sort_order, faq.is_active, faq.show_on_public, faq.use_for_chatbot, existingId]
                );
                result.updated += 1;
            } else {
                const [insert] = await connection.query(
                    `INSERT INTO faqs
                     (question, answer, category, keywords, sort_order, is_active, show_on_public, use_for_chatbot, created_by)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [faq.question, faq.answer, faq.category, faq.keywords, faq.sort_order, faq.is_active, faq.show_on_public, faq.use_for_chatbot, createdBy]
                );
                existingByQuestion.set(key, Number(insert.insertId));
                result.inserted += 1;
            }
        }

        if (typeof connection.commit === 'function') await connection.commit();
        return result;
    } catch (error) {
        if (typeof connection.rollback === 'function') await connection.rollback().catch(() => {});
        throw error;
    } finally {
        if (shouldRelease) connection.release();
    }
}

async function deactivateFaq(pool, id) {
    await ensureFaqTable(pool);
    const [result] = await pool.query('UPDATE faqs SET is_active = 0 WHERE id = ?', [id]);
    return result.affectedRows > 0;
}

async function rankChatbotFaqs(pool, message) {
    await ensureFaqTable(pool);
    const text = normalizeSearchText(message);
    const queryTokens = tokenize(text);
    if (!text || queryTokens.length === 0) return { text, queryTokens, ranked: [] };

    const [rows] = await pool.query(
        `SELECT id, question, answer, category, keywords, sort_order, updated_at
         FROM faqs
         WHERE is_active = 1 AND use_for_chatbot = 1
         ORDER BY sort_order ASC, id DESC
         LIMIT 5000`
    );

    const ranked = rows
        .map((row) => ({ row, score: scoreFaqMatch(text, row) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || Number(a.row.sort_order || 0) - Number(b.row.sort_order || 0));

    return { text, queryTokens, ranked };
}

async function findFaqAnswer(pool, message) {
    const { queryTokens, ranked } = await rankChatbotFaqs(pool, message);
    const queryIntents = detectFaqIntents(message);
    const hasSpecificIntent = hasSpecificFaqIntent(queryIntents);
    // وقتی بیمار علامت یا خدمت خاصی می‌پرسد، FAQ کلی «خدمات کلینیک» نباید پاسخ مستقیم شود.
    const eligibleRanked = hasSpecificIntent ? ranked.filter((item) => !isGenericFaq(item.row)) : ranked;
    const best = eligibleRanked[0];
    const runnerUp = eligibleRanked[1];
    if (!best) return null;

    const intentInfo = faqIntentOverlap(message, best.row);
    let minimum = queryTokens.length <= 2 ? 0.48 : 0.34;
    const separation = runnerUp ? best.score - runnerUp.score : best.score;
    if (best.score < minimum || (best.score < 0.60 && separation < 0.025)) return null;
    return { ...best.row, match_score: Number(best.score.toFixed(4)), intent_overlap: Number(intentInfo.overlap.toFixed(4)) };
}

async function findFaqCandidates(pool, message, options = {}) {
    const limit = Math.max(1, Math.min(10, Number(options.limit) || 3));
    const minimumScore = Math.max(0, Math.min(1, Number(options.minimumScore) || 0.18));
    const { ranked } = await rankChatbotFaqs(pool, message);
    const hasSpecificIntent = hasSpecificFaqIntent(detectFaqIntents(message));
    return ranked
        .filter((item) => item.score >= minimumScore)
        .filter((item) => !(hasSpecificIntent && isGenericFaq(item.row)))
        .slice(0, limit)
        .map((item) => ({ ...item.row, match_score: Number(item.score.toFixed(4)) }));
}

module.exports = {
    normalizeFaq,
    normalizeBoolean,
    normalizeFaqInput,
    normalizeSearchText,
    tokenize,
    charTrigrams,
    diceSimilarity,
    tokenCoverage,
    scoreFaqMatch,
    detectFaqIntents,
    hasSpecificFaqIntent,
    faqIntentOverlap,
    isGenericFaq,
    ensureFaqTable,
    listPublicFaqs,
    listAdminFaqs,
    getFaqById,
    createFaq,
    updateFaq,
    importFaqRows,
    deactivateFaq,
    rankChatbotFaqs,
    findFaqAnswer,
    findFaqCandidates
};
