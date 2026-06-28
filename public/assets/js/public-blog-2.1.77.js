(function () {
  'use strict';
  const search = document.getElementById('blogSearch');
  const cards = Array.from(document.querySelectorAll('[data-blog-card]'));
  const buttons = Array.from(document.querySelectorAll('[data-blog-category]'));
  const empty = document.getElementById('blogEmpty');
  const allowedCategories = new Set(['all', 'laser', 'disease', 'beauty']);
  const requestedCategory = new URLSearchParams(window.location.search).get('category') || 'all';
  let category = allowedCategories.has(requestedCategory) ? requestedCategory : 'all';

  function normalize(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[ي]/g, 'ی')
      .replace(/[ك]/g, 'ک')
      .replace(/[أإآ]/g, 'ا')
      .replace(/[\u200c\u200f]/g, ' ')
      .replace(/\s+/g, ' ');
  }

  function apply() {
    const query = normalize(search?.value);
    let visible = 0;
    cards.forEach((card) => {
      const categoryMatches = category === 'all' || card.dataset.category === category;
      const haystack = normalize(`${card.dataset.search || ''} ${card.textContent || ''}`);
      const searchMatches = !query || haystack.includes(query);
      card.hidden = !(categoryMatches && searchMatches);
      if (!card.hidden) visible += 1;
    });
    if (empty) empty.hidden = visible > 0;
  }

  buttons.forEach((button) => {
    button.classList.toggle('is-active', (button.dataset.blogCategory || 'all') === category);
    button.addEventListener('click', () => {
    category = button.dataset.blogCategory || 'all';
    buttons.forEach((item) => item.classList.toggle('is-active', item === button));
      apply();
    });
  });
  search?.addEventListener('input', apply);
  apply();
})();
