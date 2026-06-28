(function () {
  'use strict';

  if (window.__NOORVISTA_SITE_ACTIONS_21126__) return;
  window.__NOORVISTA_SITE_ACTIONS_21126__ = true;

  const $ = (selector, root = document) => root.querySelector(selector);
  const chatHistory = [];
  let chatBusy = false;

  function ensurePublicMobileHardeningStyles() {
    if (document.querySelector('link[href*="public-mobile-hardening-2.1.120.css"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/assets/css/public-mobile-hardening-2.1.120.css?v=2.1.120';
    document.head.appendChild(link);
  }

  ensurePublicMobileHardeningStyles();

  function isPublicPage() {
    const path = window.location.pathname;
    return !path.startsWith('/dashboard') && !path.startsWith('/api') && !path.startsWith('/login');
  }

  function ensureFloatingActions() {
    if (!isPublicPage()) return;

    document.querySelectorAll('.global-page-actions').forEach((node) => node.remove());

    const existing = document.querySelector('.floating-actions');
    if (existing && existing.dataset.nvFloatingActions === '2.1.126') return;
    if (existing) existing.remove();

    const wrap = document.createElement('div');
    wrap.className = 'floating-actions';
    wrap.dataset.nvFloatingActions = '2.1.126';
    wrap.setAttribute('aria-label', 'دسترسی سریع دریافت و مشاوره آنلاین');

    wrap.innerHTML = `
      <button type="button" class="floating-action-btn floating-booking nav-booking" data-open-booking aria-label="دریافت نوبت">
        <span class="floating-action-icon" aria-hidden="true"><span class="nv-action-icon nv-icon-calendar"></span></span>
        <span class="floating-action-text">دریافت نوبت</span>
      </button>
      <button type="button" class="floating-action-btn floating-consult open-chat" data-open-chat aria-label="مشاوره آنلاین">
        <span class="floating-action-icon" aria-hidden="true"><span class="nv-action-icon nv-icon-chat"></span></span>
        <span class="floating-action-text">مشاوره آنلاین</span>
      </button>
    `;
    document.body.appendChild(wrap);
  }

  function ensureChatbot() {
    if ($('#chatbotPanel')) return;
    const panel = document.createElement('div');
    panel.className = 'chatbot-panel';
    panel.id = 'chatbotPanel';
    panel.setAttribute('aria-hidden', 'true');
    panel.innerHTML = `
      <div class="chatbot-header">
        <div class="chatbot-header-main">
          <span class="chatbot-header-avatar chatbot-header-avatar--icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M12 4C7.58 4 4 7.07 4 10.86c0 2.12 1.14 4.02 2.92 5.28L6.2 19.2a.7.7 0 0 0 1.02.76l3.55-2.1c.4.05.81.08 1.23.08 4.42 0 8-3.07 8-6.86S16.42 4 12 4Zm-3 7.25a1.15 1.15 0 1 1 0-2.3 1.15 1.15 0 0 1 0 2.3Zm3 0a1.15 1.15 0 1 1 0-2.3 1.15 1.15 0 0 1 0 2.3Zm3 0a1.15 1.15 0 1 1 0-2.3 1.15 1.15 0 0 1 0 2.3Z"></path></svg></span>
          <div>
            <strong>مشاوره آنلاین کلینیک</strong>
            <small>راهنمایی اولیه و اتصال سریع به دریافت نوبت</small>
          </div>
        </div>
        <button aria-label="بستن مشاوره آنلاین" id="closeChatbot" type="button">×</button>
      </div>
      <div class="chatbot-messages" id="chatbotMessages">
        <div class="bot-message is-welcome">سلام، به مشاوره آنلاین کلینیک خوش آمدید. درباره خدمات، حذف عینک، آمادگی قبل از مراجعه یا ساعات کاری سؤال دارید؟ اگر نیاز به بررسی دقیق‌تر باشد، از همین جا به دریافت نوبت هدایت می‌شوید.</div><div class="chatbot-quick-prompts"><button class="chatbot-chip" type="button" data-chat-prompt="حذف عینک چیست؟">حذف عینک چیست؟</button><button class="chatbot-chip" type="button" data-chat-prompt="چشمم می‌سوزه">چشمم می‌سوزه</button><button class="chatbot-chip" type="button" data-chat-prompt="اسمایل برگشت شماره داره؟">اسمایل برگشت شماره داره؟</button><button class="chatbot-chip" type="button" data-chat-prompt="ساعات کاری کلینیک چیست؟">ساعات کاری کلینیک</button></div>
      </div>
      <form class="chatbot-form" id="chatbotForm">
        <input autocomplete="off" id="chatbotInput" placeholder="سؤال خود را بنویسید..." required type="text"/>
        <button aria-label="ارسال سؤال" type="submit"><span class="nv-action-icon nv-icon-send" aria-hidden="true"></span></button>
      </form>`;
    document.body.appendChild(panel);
  }

  function openChatbot() {
    const panel = $('#chatbotPanel');
    if (!panel) return;
    panel.style.display = '';
    panel.style.pointerEvents = '';
    panel.removeAttribute('inert');
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    document.body.classList.add('chatbot-open');
    document.documentElement.classList.add('chatbot-lock');
    window.setTimeout(() => $('#chatbotInput')?.focus(), 120);
  }

  function closeChatbot() {
    const panel = $('#chatbotPanel');
    if (!panel) return;
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('chatbot-open');
    document.documentElement.classList.remove('chatbot-lock');
  }

  function appendMessage(text, type, actions = []) {
    const list = $('#chatbotMessages');
    if (!list) return;
    const item = document.createElement('div');
    item.className = type === 'user' ? 'user-message' : 'bot-message';
    const content = document.createElement('div');
    content.className = 'chatbot-message-text';
    content.textContent = text;
    item.appendChild(content);

    const validActions = Array.isArray(actions) ? actions.filter((action) => action && action.type === 'booking') : [];
    if (type !== 'user' && validActions.length) {
      const actionWrap = document.createElement('div');
      actionWrap.className = 'chatbot-actions';
      validActions.slice(0, 1).forEach((action) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'chatbot-action-btn chat-booking-action';
        button.dataset.chatAction = 'booking';
        button.dataset.chatBooking = 'true';
        button.textContent = 'دریافت نوبت';
        if (action.description) button.title = action.description;
        actionWrap.appendChild(button);
      });
      item.appendChild(actionWrap);
    }

    list.appendChild(item);
    list.scrollTop = list.scrollHeight;
  }

  function appendSuggestedActions(actions, userText) {
    const list = $('#chatbotMessages');
    if (!list) return;
    const shouldShow = Array.isArray(actions) && actions.some((action) => /book|دریافت|appointment/i.test(`${action.type || ''} ${action.label || ''}`));
    const text = String(userText || '');
    const usefulByText = /(چشم|دید|بینایی|ضعیف|تار|سوزش|خشکی|لیزیک|اسمایل|حذف\s*عینک|عمل|جراحی|معاینه|ویزیت|نوبت|دریافت|هزینه)/i.test(text);
    if (!shouldShow && !usefulByText) return;
    const row = document.createElement('div');
    row.className = 'bot-message chat-action-row';
    row.style.background = 'transparent';
    row.style.border = '0';
    row.style.boxShadow = 'none';
    row.innerHTML = '<button type="button" class="chat-action-btn chat-booking-action" data-chat-booking="true" aria-label="دریافت نوبت">دریافت نوبت</button>';
    list.appendChild(row);
    list.scrollTop = list.scrollHeight;
  }

  function cookie(name) {
    const prefix = `${encodeURIComponent(name)}=`;
    const item = document.cookie.split('; ').find((part) => part.startsWith(prefix));
    return item ? decodeURIComponent(item.slice(prefix.length)) : '';
  }

  async function csrfToken() {
    const existing = cookie('csrf_token');
    if (existing) return existing;
    const response = await fetch('/api/auth/csrf-token', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    const data = await response.json().catch(() => ({}));
    return data.csrf_token || cookie('csrf_token') || '';
  }

  async function askAssistant(message) {
    const token = await csrfToken();
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(token ? { 'X-CSRF-Token': token } : {}) },
        body: JSON.stringify({ message, history: chatHistory.slice(-6), consent_to_external_ai: true }),
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) throw new Error(data.message || 'پاسخ مشاوره آنلاین دریافت نشد');
      return {
        reply: data.reply || data.message || 'پاسخ مناسبی پیدا نشد؛ لطفاً سؤال را دقیق‌تر بنویسید.',
        actions: Array.isArray(data.suggested_actions) ? data.suggested_actions : [],
        source: data.source || ''
      };
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('پاسخ مشاوره طول کشید؛ دوباره تلاش کنید.');
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
  }

  function setChatBusy(busy) {
    chatBusy = busy;
    const input = $('#chatbotInput');
    const button = $('#chatbotForm button[type="submit"]');
    if (input) input.disabled = busy;
    if (button) { button.disabled = busy; button.setAttribute('aria-busy', String(busy)); }
  }

  function appendTyping() {
    const list = $('#chatbotMessages');
    if (!list) return null;
    const item = document.createElement('div');
    item.className = 'bot-message is-typing';
    item.textContent = 'در حال آماده‌سازی پاسخ مشاوره آنلاین...';
    list.appendChild(item);
    list.scrollTop = list.scrollHeight;
    return item;
  }

  document.addEventListener('click', (event) => {
    const chatButton = event.target.closest('.open-chat, [data-open-chat]');
    if (chatButton && !event.defaultPrevented) {
      event.preventDefault();
      const panel = $('#chatbotPanel');
      panel?.classList.contains('open') ? closeChatbot() : openChatbot();
      return;
    }
    if (event.target.closest('#closeChatbot')) { closeChatbot(); return; }
    const quickPrompt = event.target.closest('[data-chat-prompt]');
    if (quickPrompt) {
      event.preventDefault();
      openChatbot();
      const input = $('#chatbotInput');
      const form = $('#chatbotForm');
      const prompt = String(quickPrompt.getAttribute('data-chat-prompt') || '').trim();
      if (input && form && prompt) {
        input.value = prompt;
        if (typeof form.requestSubmit === 'function') form.requestSubmit();
        else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }
      return;
    }
  });

  document.addEventListener('submit', async (event) => {
    if (event.target?.id !== 'chatbotForm') return;
    event.preventDefault();
    if (chatBusy) return;
    const input = $('#chatbotInput');
    const message = input?.value.trim();
    if (!message) return;
    appendMessage(message, 'user');
    input.value = '';
    chatHistory.push({ role: 'user', content: message });
    setChatBusy(true);
    const typing = appendTyping();
    try {
      const result = await askAssistant(message);
      const answer = result?.reply || 'پاسخ مناسبی پیدا نشد؛ لطفاً سؤال را دقیق‌تر بنویسید.';
      typing?.remove();
      appendMessage(answer, 'bot', result?.actions || []);
      chatHistory.push({ role: 'assistant', content: answer });
      while (chatHistory.length > 8) chatHistory.shift();
    } catch (error) {
      typing?.remove();
      appendMessage(error.message || 'پاسخ مشاوره آنلاین دریافت نشد. لطفاً دوباره تلاش کنید.', 'bot');
    } finally {
      setChatBusy(false);
      input?.focus();
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    ensureFloatingActions();
    ensureChatbot();
  });
})();
