// src/services/faqService.js
// FAQ persistence and matching logic used by public FAQ and chatbot.

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

function normalizeFaqInput(body = {}) {
    return {
        question: String(body.question || '').trim().slice(0, 500),
        answer: String(body.answer || '').trim(),
        category: String(body.category || '').trim().slice(0, 100),
        keywords: String(body.keywords || '').trim(),
        sort_order: Number.parseInt(body.sort_order, 10) || 0,
        is_active: body.is_active === undefined ? 1 : (body.is_active ? 1 : 0),
        show_on_public: body.show_on_public === undefined ? 1 : (body.show_on_public ? 1 : 0),
        use_for_chatbot: body.use_for_chatbot === undefined ? 1 : (body.use_for_chatbot ? 1 : 0)
    };
}

function normalizeSearchText(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[ي]/g, 'ی')
        .replace(/[ك]/g, 'ک')
        .replace(/[أإآ]/g, 'ا')
        .replace(/[\u064B-\u065F]/g, '')
        .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenize(text) {
    return normalizeSearchText(text)
        .split(' ')
        .filter(token => token.length >= 3)
        .slice(0, 10);
}

async function ensureFaqTable(pool) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS faqs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            question VARCHAR(500) NOT NULL,
            answer TEXT NOT NULL,
            category VARCHAR(100) NULL,
            keywords TEXT NULL,
            sort_order INT DEFAULT 0,
            is_active TINYINT(1) DEFAULT 1,
            show_on_public TINYINT(1) DEFAULT 1,
            use_for_chatbot TINYINT(1) DEFAULT 1,
            created_by INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_is_active (is_active),
            INDEX idx_show_on_public (show_on_public),
            INDEX idx_use_for_chatbot (use_for_chatbot),
            INDEX idx_sort_order (sort_order),
            FULLTEXT KEY ft_faq_question_answer_keywords (question, answer, keywords)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci
    `);
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

async function createFaq(pool, body, createdBy = null) {
    await ensureFaqTable(pool);
    const faq = normalizeFaqInput(body);
    if (!faq.question || !faq.answer) {
        const error = new Error('سوال و پاسخ الزامی است');
        error.statusCode = 400;
        throw error;
    }

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
    if (!faq.question || !faq.answer) {
        const error = new Error('سوال و پاسخ الزامی است');
        error.statusCode = 400;
        throw error;
    }

    const [result] = await pool.query(
        `UPDATE faqs
         SET question = ?, answer = ?, category = ?, keywords = ?, sort_order = ?, is_active = ?, show_on_public = ?, use_for_chatbot = ?
         WHERE id = ?`,
        [faq.question, faq.answer, faq.category, faq.keywords, faq.sort_order, faq.is_active, faq.show_on_public, faq.use_for_chatbot, id]
    );

    return result.affectedRows > 0;
}

async function deactivateFaq(pool, id) {
    await ensureFaqTable(pool);
    const [result] = await pool.query('UPDATE faqs SET is_active = 0 WHERE id = ?', [id]);
    return result.affectedRows > 0;
}

async function findFaqAnswer(pool, message) {
    await ensureFaqTable(pool);

    const text = normalizeSearchText(message);
    const tokens = tokenize(text);
    if (!text || tokens.length === 0) return null;

    const likeParams = [];
    const tokenConditions = tokens.map(() => '(question LIKE ? OR answer LIKE ? OR keywords LIKE ?)');
    tokens.forEach(token => {
        const like = `%${token}%`;
        likeParams.push(like, like, like);
    });

    const [rows] = await pool.query(
        `SELECT id, question, answer, keywords, sort_order
         FROM faqs
         WHERE is_active = 1
           AND use_for_chatbot = 1
           AND (${tokenConditions.join(' OR ')})
         ORDER BY sort_order ASC, id DESC
         LIMIT 50`,
        likeParams
    );

    let best = null;
    let bestScore = 0;

    rows.forEach(row => {
        const combined = normalizeSearchText(`${row.question} ${row.keywords || ''}`);
        let score = 0;
        tokens.forEach(token => {
            if (combined.includes(token)) score += 2;
            if (normalizeSearchText(row.answer).includes(token)) score += 1;
        });
        if (combined === text || combined.includes(text) || text.includes(normalizeSearchText(row.question))) score += 6;

        if (score > bestScore) {
            bestScore = score;
            best = row;
        }
    });

    return bestScore >= 2 ? best : null;
}

module.exports = {
    normalizeFaq,
    normalizeFaqInput,
    normalizeSearchText,
    tokenize,
    ensureFaqTable,
    listPublicFaqs,
    listAdminFaqs,
    getFaqById,
    createFaq,
    updateFaq,
    deactivateFaq,
    findFaqAnswer
};
