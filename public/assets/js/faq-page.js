// js/faq-page.js
// Standalone searchable public FAQ page.
(function () {
    const state = { faqs: [], category: 'all', search: '' };

    function escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, function (ch) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[ch];
        });
    }

    function normalize(text) {
        return String(text || '')
            .toLowerCase()
            .replace(/[ي]/g, 'ی')
            .replace(/[ك]/g, 'ک')
            .replace(/[أإآ]/g, 'ا')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function getCategories() {
        const categories = [...new Set(state.faqs.map(faq => faq.category).filter(Boolean))];
        return categories.sort((a, b) => String(a).localeCompare(String(b), 'fa'));
    }

    function filteredFaqs() {
        const search = normalize(state.search);
        return state.faqs.filter(faq => {
            const categoryOk = state.category === 'all' || faq.category === state.category;
            const searchText = normalize(`${faq.question} ${faq.answer} ${faq.keywords || ''}`);
            const searchOk = !search || searchText.includes(search);
            return categoryOk && searchOk;
        });
    }

    function renderCategories() {
        const root = document.getElementById('faqCategories');
        if (!root) return;
        const categories = getCategories();
        root.innerHTML = [
            `<button type="button" class="faq-chip ${state.category === 'all' ? 'active' : ''}" data-category="all">همه</button>`,
            ...categories.map(category => `<button type="button" class="faq-chip ${state.category === category ? 'active' : ''}" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`)
        ].join('');

        root.querySelectorAll('.faq-chip').forEach(button => {
            button.addEventListener('click', function () {
                state.category = button.getAttribute('data-category') || 'all';
                render();
            });
        });
    }

    function renderList() {
        const root = document.getElementById('faqList');
        if (!root) return;
        const faqs = filteredFaqs();
        if (!faqs.length) {
            root.innerHTML = '<div class="faq-empty">سوالی با این جستجو پیدا نشد.</div>';
            return;
        }

        root.innerHTML = faqs.map((faq, index) => `
            <article class="faq-card">
                <button class="faq-question" type="button" aria-expanded="${index === 0 ? 'true' : 'false'}">
                    <span>${escapeHtml(faq.question)}</span>
                    <strong>+</strong>
                </button>
                <div class="faq-answer" style="display:${index === 0 ? 'block' : 'none'};">${escapeHtml(faq.answer)}</div>
            </article>
        `).join('');

        root.querySelectorAll('.faq-question').forEach(button => {
            button.addEventListener('click', function () {
                const answer = button.parentElement.querySelector('.faq-answer');
                const isOpen = answer.style.display !== 'none';
                answer.style.display = isOpen ? 'none' : 'block';
                button.setAttribute('aria-expanded', String(!isOpen));
            });
        });
    }

    function render() {
        renderCategories();
        renderList();
    }

    async function loadFaqs() {
        const root = document.getElementById('faqList');
        try {
            const response = await fetch('/api/public/faqs', { cache: 'no-store' });
            const data = await response.json().catch(() => ({}));
            state.faqs = Array.isArray(data.faqs) ? data.faqs : [];
            render();
        } catch (error) {
            if (root) root.innerHTML = '<div class="faq-empty">خطا در دریافت سوالات پرتکرار.</div>';
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        const searchInput = document.getElementById('faqSearch');
        if (searchInput) {
            searchInput.addEventListener('input', function () {
                state.search = searchInput.value;
                renderList();
            });
        }
        loadFaqs();
    });
})();
