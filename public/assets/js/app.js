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
    mobileToggle.textContent = isOpen ? "×" : "☰";
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
      mobileToggle.textContent = "☰";
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
  button.addEventListener("click", () => toggleChatbotPanel());
});

if (closeChatbot) {
  closeChatbot.addEventListener("click", () => closeChatbotPanel());
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeChatbotPanel();
});

if (chatbotForm && chatbotInput) {
  chatbotForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const userText = chatbotInput.value.trim();
    if (!userText) return;
    appendMessage(userText, "user");
    chatbotInput.value = "";
    setTimeout(() => {
      const response = getBotResponse(userText);
      appendMessage(response, "bot");
    }, 350);
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
  setTimeout(() => {
    if (chatbotInput) chatbotInput.focus();
  }, 250);
}

function closeChatbotPanel() {
  if (!chatbotPanel) return;
  chatbotPanel.classList.remove("open");
  chatbotPanel.setAttribute("aria-hidden", "true");
}

function appendMessage(text, type) {
  const message = document.createElement("div");
  message.className = type === "user" ? "user-message" : "bot-message";
  message.textContent = text;
  if (!chatbotMessages) return;
  chatbotMessages.appendChild(message);
  chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
}

function getBotResponse(input) {
  const text = normalizePersian(input);
  if (containsAny(text, ["سلام", "درود", "وقت بخیر", "خسته نباشید"])) {
    return "سلام، خوش آمدید. من مشاور آنلاین کلینیک هستم و برای انتخاب خدمت مناسب، آمادگی قبل از مراجعه و رزرو نوبت راهنمایی‌تان می‌کنم.";
  }
  if (containsAny(text, ["نوبت", "رزرو", "وقت", "آنلاین"])) {
    return "برای رزرو نوبت، روی دکمه «رزرو نوبت» بزنید و روز و ساعت مناسب را انتخاب کنید. اگر برای انتخاب خدمت مطمئن نیستید، همین‌جا سوالتان را بپرسید.";
  }
  if (containsAny(text, ["خدمات", "چه خدماتی", "معاینه", "بیماری", "چشم"])) {
    return "خدمات کلینیک در دو گروه اصلی ارائه می‌شود: خدمات درمانی چشم مانند آب مروارید، گلوکوم، قوز قرنیه، خشکی چشم و تنبلی چشم؛ و خدمات زیبایی و لیزر چشم مانند PRK، فمتولیزیک، SMILE، بلفاروپلاستی و ترمیم پلک.";
  }
  if (containsAny(text, ["پلک", "زیبایی", "افتادگی", "جراحی"])) {
    return "برای افتادگی پلک، مشکلات عملکردی پلک یا زیبایی اطراف چشم، ابتدا می‌توانید از مشاوره آنلاین سوال کنید و سپس رزرو نوبت تخصصی انجام دهید.";
  }
  if (containsAny(text, ["آدرس", "کجا", "موقعیت", "قیطریه", "تهران"])) {
    return "کلینیک کلینیک در تهران، قیطریه قرار دارد. اطلاعات دقیق‌تر موقعیت از بخش اطلاعات کلینیک و نقشه قابل مشاهده است.";
  }
  if (containsAny(text, ["ساعت", "زمان", "کی باز", "چه روزی", "روزهای کاری"])) {
    return "ساعات کاری کلینیک شنبه تا پنجشنبه، از ساعت ۹ تا ۲۳ است. برای مراجعه بهتر است ابتدا رزرو نوبت آنلاین ثبت شود.";
  }
  if (containsAny(text, ["مدارک", "همراه", "اولین مراجعه", "نسخه", "دارو"])) {
    return "برای مراجعه بهتر است عینک یا لنز فعلی، نسخه‌های قبلی، سوابق بیماری، داروهای مصرفی و نتایج معاینات گذشته را همراه داشته باشید.";
  }
  if (containsAny(text, ["هزینه", "قیمت", "تعرفه", "مبلغ"])) {
    return "هزینه خدمات به نوع معاینه یا خدمت بستگی دارد. برای راهنمایی اولیه می‌توانید از مشاوره آنلاین سوال کنید و سپس نوبت تخصصی رزرو کنید.";
  }
  return "متوجه شدم. برای راهنمایی دقیق‌تر می‌توانید بپرسید: «چطور نوبت بگیرم؟»، «خدمات کلینیک چیست؟»، «برای اولین مراجعه چه همراه داشته باشم؟» یا «ساعات کاری کلینیک چیست؟»";
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

// ========== MODAL BOOKING SYSTEM ==========
const modal = document.getElementById('bookingModal');
const step1 = document.getElementById('modalStep1');
const step2 = document.getElementById('modalStep2');
const step3 = document.getElementById('modalStep3');
const successDiv = document.getElementById('modalSuccess');
const daysContainer = document.getElementById('availableDays');
const timesContainer = document.getElementById('availableTimes');

let selectedDay = null;
let selectedTime = null;

// Mock data for UI testing (replace with real API later)
const mockAvailableDays = [
  { date: '2026-06-08', fa_date: 'شنبه ۱۸ خرداد' },
  { date: '2026-06-09', fa_date: 'یکشنبه ۱۹ خرداد' },
  { date: '2026-06-10', fa_date: 'دوشنبه ۲۰ خرداد' },
  { date: '2026-06-11', fa_date: 'سه‌شنبه ۲۱ خرداد' },
  { date: '2026-06-13', fa_date: 'پنجشنبه ۲۳ خرداد' }
];

const mockAvailableTimes = {
  '2026-06-08': ['۱۰:۰۰', '۱۱:۳۰', '۱۴:۰۰', '۱۶:۳۰'],
  '2026-06-09': ['۰۹:۰۰', '۱۰:۳۰', '۱۳:۰۰', '۱۵:۰۰', '۱۷:۳۰'],
  '2026-06-10': ['۱۱:۰۰', '۱۲:۳۰', '۱۵:۰۰', '۱۸:۰۰'],
  '2026-06-11': ['۱۰:۰۰', '۱۳:۰۰', '۱۴:۳۰', '۱۶:۰۰', '۱۹:۰۰'],
  '2026-06-13': ['۰۹:۳۰', '۱۱:۰۰', '۱۴:۳۰', '۱۷:۰۰']
};

function openBookingModal(e) {
  if (e) e.preventDefault();
  if (!modal || !step1 || !step2 || !step3 || !successDiv || !daysContainer || !timesContainer) return;
  modal.style.display = 'flex';
  resetModal();
  fetchAvailableDays();
}

function closeBookingModal() {
  if (!modal) return;
  modal.style.display = 'none';
  resetModal();
}

function resetModal() {
  if (!step1 || !step2 || !step3 || !successDiv) return;
  selectedDay = null;
  selectedTime = null;
  step1.style.display = 'block';
  step2.style.display = 'none';
  step3.style.display = 'none';
  successDiv.style.display = 'none';

  const bookingName = document.getElementById('bookingName');
  const bookingMobile = document.getElementById('bookingMobile');
  const bookingService = document.getElementById('bookingService');

  if (bookingName) bookingName.value = '';
  if (bookingMobile) bookingMobile.value = '';
  if (bookingService) bookingService.selectedIndex = 0;
}

function fetchAvailableDays() {
  if (!daysContainer || !step1 || !step2 || !step3 || !successDiv) return;
  daysContainer.innerHTML = '';
  mockAvailableDays.forEach(day => {
    const btn = document.createElement('button');
    btn.className = 'day-btn';
    btn.textContent = day.fa_date;
    btn.onclick = () => {
      document.querySelectorAll('.day-btn').forEach(d => d.classList.remove('selected'));
      btn.classList.add('selected');
      selectedDay = day.date;
      fetchAvailableTimes(day.date);
    };
    daysContainer.appendChild(btn);
  });
  step1.style.display = 'block';
  step2.style.display = 'none';
  step3.style.display = 'none';
  successDiv.style.display = 'none';
}

function fetchAvailableTimes(date) {
  if (!timesContainer || !step1 || !step2) return;
  const times = mockAvailableTimes[date] || ['۱۰:۰۰', '۱۴:۰۰', '۱۷:۰۰'];
  timesContainer.innerHTML = '';
  times.forEach(time => {
    const btn = document.createElement('button');
    btn.className = 'time-btn';
    btn.textContent = time;
    btn.onclick = () => {
      document.querySelectorAll('.time-btn').forEach(t => t.classList.remove('selected'));
      btn.classList.add('selected');
      selectedTime = time;
      goToStep3();
    };
    timesContainer.appendChild(btn);
  });
  step1.style.display = 'none';
  step2.style.display = 'block';
}

function goToStep3() {
  if (!step2 || !step3) return;
  step2.style.display = 'none';
  step3.style.display = 'block';
}

function submitBooking() {
  const bookingName = document.getElementById('bookingName');
  const bookingMobile = document.getElementById('bookingMobile');
  const bookingService = document.getElementById('bookingService');
  const trackingCodeEl = document.getElementById('trackingCode');

  if (!bookingName || !bookingMobile || !bookingService || !trackingCodeEl || !step3 || !successDiv) return;

  const name = bookingName.value.trim();
  const mobile = bookingMobile.value.trim();
  const service = bookingService.value;

  if (!name) {
    alert('لطفاً نام و نام خانوادگی را وارد کنید');
    return;
  }
  if (!mobile || !/^09\d{9}$/.test(mobile)) {
    alert('لطفاً شماره موبایل معتبر (۱۱ رقم و شروع با ۰۹) وارد کنید');
    return;
  }
  if (!selectedDay || !selectedTime) {
    alert('لطفاً روز و ساعت نوبت را انتخاب کنید');
    return;
  }

  const trackingCode = 'NV-' + Math.floor(Math.random() * 1000000);
  const bookingRecord = {
    name, mobile, service, date: selectedDay, time: selectedTime, trackingCode, createdAt: new Date().toISOString()
  };
  localStorage.setItem('noorvista_last_booking', JSON.stringify(bookingRecord));
  trackingCodeEl.innerText = trackingCode;
  step3.style.display = 'none';
  successDiv.style.display = 'block';
}

// Connect all booking buttons to modal
document.querySelectorAll('.nav-booking, .hero-actions .btn-primary, .service-summary-cta .btn-primary, .patient-guide-intro .btn-primary, .cta-actions .btn-light, .brand, .menu a[href="#booking"]').forEach(btn => {
  if (btn) {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openBookingModal();
    });
  }
});

const submitBookingBtn = document.getElementById('submitBookingBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const modalCloseSuccessBtn = document.getElementById('modalCloseSuccessBtn');

if (submitBookingBtn) submitBookingBtn.addEventListener('click', submitBooking);
if (closeModalBtn) closeModalBtn.addEventListener('click', closeBookingModal);
if (modalCloseSuccessBtn) modalCloseSuccessBtn.addEventListener('click', closeBookingModal);

if (modal) {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeBookingModal();
  });
}