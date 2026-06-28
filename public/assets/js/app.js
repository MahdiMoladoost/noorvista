const mobileToggle = document.getElementById("mobileToggle");
const menu = document.getElementById("menu");
const menuLinks = document.querySelectorAll(".menu a");
const revealElements = document.querySelectorAll(".reveal");
const faqItems = document.querySelectorAll(".faq-item");
const yearElement = document.getElementById("year");
const bookingForm = document.getElementById("bookingForm");
const formMessage = document.getElementById("formMessage");
const openChatButtons = document.querySelectorAll(".open-chat");
const chatbotPanel = document.getElementById("chatbotPanel");
const closeChatbot = document.getElementById("closeChatbot");
const chatbotForm = document.getElementById("chatbotForm");
const chatbotInput = document.getElementById("chatbotInput");
const chatbotMessages = document.getElementById("chatbotMessages");

if (yearElement) {
  yearElement.textContent = new Date().toLocaleDateString("fa-IR", { year: "numeric" });
}

if (mobileToggle && menu) {
  mobileToggle.addEventListener("click", () => {
    const isOpen = menu.classList.toggle("open");
    mobileToggle.innerHTML = isOpen ? '<span class="nv-close-icon nv-icon-close" aria-hidden="true"></span>' : '<span class="nv-menu-icon nv-icon-menu" aria-hidden="true"></span>';
    mobileToggle.setAttribute("aria-label", isOpen ? "بستن منو" : "باز کردن منو");
  });
}

menuLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    const isMobileMenu = window.matchMedia("(max-width: 860px)").matches;
    const megaParent = link.closest(".has-mega");

    // در موبایل، کلیک اول روی «خدمات» فقط زیرمنو را باز می‌کند
    // تا کاربر همه زیرمنوها را ببیند؛ کلیک دوم می‌تواند وارد صفحه خدمات شود.
    if (isMobileMenu && megaParent && link === megaParent.querySelector(":scope > a")) {
      if (!megaParent.classList.contains("submenu-open")) {
        event.preventDefault();
        document.querySelectorAll(".has-mega.submenu-open").forEach((item) => {
          if (item !== megaParent) item.classList.remove("submenu-open");
        });
        megaParent.classList.add("submenu-open");
        return;
      }
    }

    if (menu && mobileToggle) {
      menu.classList.remove("open");
      mobileToggle.innerHTML = '<span class="nv-menu-icon nv-icon-menu" aria-hidden="true"></span>';
    }
    menuLinks.forEach((item) => item.classList.remove("active"));
    link.classList.add("active");
  });
});

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("show");
        }
      });
    },
    { threshold: 0.14 }
  );
  revealElements.forEach((element) => observer.observe(element));
} else {
  revealElements.forEach((element) => element.classList.add("show"));
}

faqItems.forEach((item) => {
  const button = item.querySelector(".faq-question");
  const icon = button ? button.querySelector("span:last-child") : null;
  if (!button) return;
  button.addEventListener("click", () => {
    const isOpen = item.classList.toggle("open");
    if (icon) icon.textContent = isOpen ? "−" : "+";
  });
});

document.querySelectorAll("img[data-fallback-title]").forEach((image) => {
  image.addEventListener("error", () => {
    const title = image.dataset.fallbackTitle || "کلینیک چشم‌پزشکی";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="620" viewBox="0 0 900 620"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stop-color="#e0f2fe"/><stop offset="48%" stop-color="#f8fbff"/><stop offset="100%" stop-color="#ccfbf1"/></linearGradient><radialGradient id="r" cx="30%" cy="25%" r="70%"><stop offset="0%" stop-color="#67e8f9" stop-opacity="0.65"/><stop offset="100%" stop-color="#ffffff" stop-opacity="0"/></radialGradient></defs><rect width="900" height="620" rx="42" fill="url(#g)"/><circle cx="210" cy="150" r="170" fill="url(#r)"/><circle cx="760" cy="520" r="220" fill="#bae6fd" opacity="0.42"/><path d="M450 222c94 0 170 88 198 120-28 32-104 120-198 120s-170-88-198-120c28-32 104-120 198-120Z" fill="#ffffff" stroke="#0891b2" stroke-width="18"/><circle cx="450" cy="342" r="70" fill="#0891b2" opacity="0.92"/><circle cx="450" cy="342" r="30" fill="#075985"/><circle cx="423" cy="318" r="18" fill="#ffffff" opacity="0.86"/><text x="450" y="520" text-anchor="middle" font-family="Tahoma, Arial, sans-serif" font-size="42" font-weight="700" fill="#075985">${escapeHtml(title)}</text><text x="450" y="570" text-anchor="middle" font-family="Tahoma, Arial, sans-serif" font-size="26" font-weight="700" fill="#64748b">Dr Mohammad Sadegh Haghparast Eye Clinic</text></svg>`;
    image.src = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  });
});

openChatButtons.forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleChatbotPanel();
  });
});

if (closeChatbot) {
  closeChatbot.addEventListener("click", () => closeChatbotPanel());
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeChatbotPanel();
});

document.addEventListener("click", (event) => {
  const chatButton = event.target.closest(".open-chat, [data-open-chat]");
  if (chatButton && !event.defaultPrevented) {
    event.preventDefault();
    event.stopPropagation();
    chatButton.setAttribute("data-nv-open-chat-delegated", "1");
    toggleChatbotPanel();
    return;
  }
  const quickPrompt = event.target.closest("[data-chat-prompt]");
  if (!quickPrompt) return;
  event.preventDefault();
  const prompt = String(quickPrompt.getAttribute("data-chat-prompt") || "").trim();
  if (!prompt || !chatbotForm || !chatbotInput) return;
  openChatbotPanel();
  chatbotInput.value = prompt;
  if (typeof chatbotForm.requestSubmit === "function") {
    chatbotForm.requestSubmit();
  } else {
    chatbotForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  }
});

const chatbotHistory = [];
let chatbotBusy = false;

if (chatbotForm && chatbotInput) {
  chatbotForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (chatbotBusy) return;
    const userText = chatbotInput.value.trim();
    if (!userText) return;

    appendMessage(userText, "user");
    chatbotHistory.push({ role: "user", content: userText });
    while (chatbotHistory.length > 8) chatbotHistory.shift();
    chatbotInput.value = "";

    const typing = appendTypingMessage();
    setChatbotBusy(true);
    try {
      const data = await askClinicAssistant(userText);
      if (typing) typing.remove();
      const answer = data.reply || data.message || getBotResponse(userText);
      appendMessage(answer, "bot");
      chatbotHistory.push({ role: "assistant", content: answer });
      while (chatbotHistory.length > 8) chatbotHistory.shift();
      appendSuggestedActions(data.suggested_actions, userText);
    } catch (error) {
      if (typing) typing.remove();
      const answer = getBotResponse(userText);
      appendMessage(answer, "bot");
      appendSuggestedActions(null, userText);
      console.warn("Sadra chatbot API fallback:", error.message);
    } finally {
      setChatbotBusy(false);
      chatbotInput.focus();
    }
  });
}

function toggleChatbotPanel() {
  if (!chatbotPanel) return;
  if (chatbotPanel.classList.contains("open")) {
    closeChatbotPanel();
  } else {
    openChatbotPanel();
  }
}

function openChatbotPanel() {
  if (!chatbotPanel) return;
  chatbotPanel.classList.add("open");
  chatbotPanel.setAttribute("aria-hidden", "false");
  document.body.classList.add("chatbot-open");
  document.documentElement.classList.add("chatbot-lock");
  setTimeout(() => {
    if (chatbotInput) chatbotInput.focus();
  }, 250);
}

function closeChatbotPanel() {
  if (!chatbotPanel) return;
  chatbotPanel.classList.remove("open");
  chatbotPanel.setAttribute("aria-hidden", "true");
  document.body.classList.remove("chatbot-open");
  document.documentElement.classList.remove("chatbot-lock");
}

function appendMessage(text, type) {
  const message = document.createElement("div");
  message.className = type === "user" ? "user-message" : "bot-message";
  const content = document.createElement("div");
  content.className = "chatbot-message-text";
  content.textContent = text;
  message.appendChild(content);
  if (!chatbotMessages) return null;
  chatbotMessages.appendChild(message);
  chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
  return message;
}

function appendTypingMessage() {
  const message = appendMessage("در حال آماده‌سازی پاسخ...", "bot");
  if (message) message.classList.add("is-typing");
  return message;
}

function setChatbotBusy(busy) {
  chatbotBusy = Boolean(busy);
  if (chatbotInput) chatbotInput.disabled = chatbotBusy;
  const submitButton = chatbotForm ? chatbotForm.querySelector('button[type="submit"]') : null;
  if (submitButton) {
    submitButton.disabled = chatbotBusy;
    submitButton.setAttribute("aria-busy", String(chatbotBusy));
  }
}

function getCookie(name) {
  const prefix = `${encodeURIComponent(name)}=`;
  const item = document.cookie.split("; ").find((part) => part.startsWith(prefix));
  return item ? decodeURIComponent(item.slice(prefix.length)) : "";
}

async function getCsrfToken() {
  const existing = getCookie("csrf_token");
  if (existing) return existing;
  const response = await fetch("/api/auth/csrf-token", { credentials: "same-origin", headers: { Accept: "application/json" } });
  const data = await response.json().catch(() => ({}));
  return data.csrf_token || getCookie("csrf_token") || "";
}

async function askClinicAssistant(message) {
  const token = await getCsrfToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18000);
  try {
    const response = await fetch("/api/ai/chat", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(token ? { "X-CSRF-Token": token } : {})
      },
      body: JSON.stringify({
        message,
        history: chatbotHistory.slice(-6),
        consent_to_external_ai: true
      }),
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) throw new Error(data.message || "پاسخ مشاوره دریافت نشد");
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function appendSuggestedActions(actions, userText) {
  if (!chatbotMessages) return;
  const useful = Array.isArray(actions) && actions.some((action) => /book|دریافت|appointment/i.test(`${action.type || ""} ${action.label || ""}`));
  if (!useful && !shouldSuggestBooking(userText)) return;
  const row = document.createElement("div");
  row.className = "bot-message chat-action-row";
  row.style.background = "transparent";
  row.style.border = "0";
  row.style.boxShadow = "none";
  row.innerHTML = '<button type="button" class="chat-action-btn chat-booking-action" data-chat-booking="true" aria-label="دریافت نوبت">دریافت نوبت</button>';
  chatbotMessages.appendChild(row);
  chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
}

function getBotResponse(input) {
  const text = normalizePersian(input);
  const bookingLine = "برای بررسی دقیق‌تر می‌توانید از دکمه «دریافت نوبت» سایت وقت بگیرید.";

  if (containsAny(text, ["سلام", "درود", "وقت بخیر", "خسته نباشید"])) {
    return "سلام، خوش آمدید. سؤال چشم‌پزشکی یا خدمت موردنظرتان را بنویسید تا بر اساس سوالات پرتکرار کلینیک راهنمایی‌تان کنم.";
  }

  if (containsAny(text, ["اسمایل"]) && containsAny(text, ["برگشت", "شماره", "نمره", "برمیگرد", "بر می گرد"])) {
    return `در روش اسمایل هدف اصلاح پایدار شماره چشم است، اما مثل همه روش‌های حذف عینک احتمال تغییر یا برگشت بخشی از شماره در بعضی افراد وجود دارد. این احتمال به شماره اولیه، ثابت بودن شماره چشم، وضعیت قرنیه، سن، خشکی چشم و عوامل فردی بستگی دارد. قبل از عمل معمولاً ثبات شماره، ضخامت و نقشه قرنیه بررسی می‌شود تا احتمال نتیجه نامناسب کمتر شود. اگر بعد از عمل تاری یا تغییر دید دارید باید معاینه شوید. ${bookingLine}`;
  }

  if (containsAny(text, ["حذف عینک", "برداشتن عینک", "اصلاح دید", "عیب انکساری", "عیوب انکساری"])) {
    return `حذف عینک به روش‌هایی گفته می‌شود که با اصلاح عیب انکساری چشم، دید بدون عینک یا لنز واضح‌تر می‌شود. عیب انکساری یعنی نور دقیقاً روی شبکیه متمرکز نمی‌شود و تصویر تار دیده می‌شود؛ نزدیک‌بینی، دوربینی و آستیگماتیسم شایع‌ترین انواع آن هستند. در بیشتر روش‌های لیزری، شکل قرنیه اصلاح می‌شود تا نور بهتر روی شبکیه متمرکز شود. انتخاب روش مناسب فقط بعد از معاینه، بررسی شماره چشم، ضخامت و نقشه قرنیه، خشکی چشم و سلامت شبکیه مشخص می‌شود. ${bookingLine}`;
  }

  if ((containsAny(text, ["چشم", "چشمم", "چشام", "دید", "بینایی"]) && containsAny(text, ["ضعیف", "تار", "شماره", "نمره", "عینک"])) || containsAny(text, ["ضعیفی چشم"])) {
    return `ضعیف شدن یا تار شدن دید می‌تواند به علت تغییر شماره چشم، آستیگماتیسم، خشکی چشم، مشکلات قرنیه، آب مروارید یا علت‌های دیگر باشد. اگر کاهش دید ناگهانی، درد چشم، جرقه نور، سایه در دید یا مگس‌پران جدید دارید، مراجعه فوری لازم است. اگر تغییر دید تدریجی است، باید معاینه شوید تا شماره چشم، قرنیه، فشار چشم و شبکیه بررسی شود. بعد از معاینه مشخص می‌شود عینک، لنز، درمان خشکی چشم یا روش‌هایی مثل PRK، فمتولیزیک، اسمایل یا ICL برای شما مناسب است یا نه. ${bookingLine}`;
  }

  if (containsAny(text, ["میسوزه", "می سوزه", "سوزش", "خارش", "خشکی", "قرمزی", "اشک ریزش"])) {
    return `سوزش چشم اغلب می‌تواند به خشکی چشم، حساسیت، استفاده از لنز، کار طولانی با موبایل و کامپیوتر یا التهاب سطح چشم مربوط باشد، اما بدون معاینه علت قطعی مشخص نمی‌شود. چشم را نمالید، اگر لنز دارید آن را خارج کنید و از مصرف خودسرانه قطره آنتی‌بیوتیک یا کورتون خودداری کنید. اگر سوزش همراه با درد شدید، کاهش دید، ترشح زیاد، حساسیت شدید به نور، ضربه یا تماس با مواد شیمیایی است، باید فوری مراجعه کنید. اگر علائم ادامه دارد، ${bookingLine}`;
  }

  if (containsAny(text, ["نوبت", "دریافت", "وقت", "ویزیت", "آنلاین"])) {
    return "برای دریافت نوبت، روی دکمه «دریافت نوبت» بزنید و روز و ساعت مناسب را انتخاب کنید. اگر برای انتخاب خدمت مطمئن نیستید، همین‌جا سؤال‌تان را بپرسید.";
  }

  if (containsAny(text, ["آدرس", "کجا", "موقعیت", "موقعیت", "قیطریه", "تهران"])) {
    return "آدرس و موقعیت کلینیک از تنظیمات سایت نمایش داده می‌شود. برای مراجعه بهتر است ابتدا از دکمه «دریافت نوبت» وقت بگیرید.";
  }

  if (containsAny(text, ["ساعت", "زمان", "کی باز", "چه روزی", "روزهای کاری"])) {
    return "ساعت کاری کلینیک از تنظیمات سایت نمایش داده می‌شود. برای جلوگیری از معطلی، بهتر است قبل از مراجعه از بخش دریافت نوبت وقت بگیرید.";
  }

  if (containsAny(text, ["هزینه", "قیمت", "تعرفه", "مبلغ", "بیمه"])) {
    return "هزینه و پوشش بیمه به نوع خدمت، معاینه و شرایط بیمار بستگی دارد. برای اعلام دقیق‌تر بهتر است ابتدا خدمت موردنظر مشخص شود یا نوبت معاینه دریافت کنید.";
  }

  if (containsAny(text, ["خدمات", "چه خدماتی"])) {
    return "کلینیک خدمات چشم‌پزشکی و جراحی‌های مرتبط با چشم مانند معاینه، بررسی ضعیفی چشم، حذف عینک، خشکی چشم، آب مروارید، قوز قرنیه و خدمات پلک را ارائه می‌کند. اگر مشکل یا خدمت موردنظرتان را بنویسید، دقیق‌تر راهنمایی می‌کنم.";
  }

  return `برای پاسخ دقیق‌تر، لطفاً سؤال را کمی مشخص‌تر بنویسید؛ مثلاً درباره ضعیفی چشم، حذف عینک، اسمایل، لیزیک، سوزش چشم، آب مروارید یا دریافت نوبت. ${bookingLine}`;
}

function shouldSuggestBooking(input) {
  const text = normalizePersian(input);
  return containsAny(text, ["چشم", "دید", "بینایی", "ضعیف", "تار", "سوزش", "خشکی", "لیزیک", "اسمایل", "حذف عینک", "عمل", "جراحی", "معاینه", "ویزیت", "نوبت", "دریافت", "هزینه"]);
}

function normalizePersian(value) {
  return value.toLowerCase().replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/[^\u0600-\u06FFa-zA-Z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function containsAny(text, keywords) {
  return keywords.some((keyword) => text.includes(normalizePersian(keyword)));
}

function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
