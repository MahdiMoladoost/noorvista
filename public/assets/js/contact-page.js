
(function () {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  const chatbotPanel = $("#chatbotPanel");
  const chatbotMessages = $("#chatbotMessages");
  const chatbotForm = $("#chatbotForm");
  const chatbotInput = $("#chatbotInput");
  const closeChatbot = $("#closeChatbot");

  function openChatbotPanel() {
    if (!chatbotPanel) return;
    chatbotPanel.classList.add("open");
    chatbotPanel.setAttribute("aria-hidden", "false");
    setTimeout(() => chatbotInput && chatbotInput.focus(), 150);
  }

  function closeChatbotPanel() {
    if (!chatbotPanel) return;
    chatbotPanel.classList.remove("open");
    chatbotPanel.setAttribute("aria-hidden", "true");
  }

  function toggleChatbotPanel() {
    if (!chatbotPanel) return;
    chatbotPanel.classList.contains("open") ? closeChatbotPanel() : openChatbotPanel();
  }

  $$(".open-chat").forEach((button) => {
    button.addEventListener("click", function (event) {
      event.preventDefault();
      toggleChatbotPanel();
    });
  });

  if (closeChatbot) closeChatbot.addEventListener("click", closeChatbotPanel);

  function appendMessage(text, type) {
    if (!chatbotMessages) return;
    const div = document.createElement("div");
    div.className = type === "user" ? "user-message" : "bot-message";
    div.textContent = text;
    chatbotMessages.appendChild(div);
    chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
  }

  function aiReply(message) {
    const text = message.toLowerCase();
    if (text.includes("نوبت") || text.includes("رزرو")) {
      return "برای رزرو نوبت، روی دکمه «رزرو نوبت» بزنید و روز و ساعت مناسب را انتخاب کنید. اگر نمی‌دانید کدام خدمت مناسب شماست، همین‌جا علائم یا سوالتان را بنویسید.";
    }
    if (text.includes("بلفارو") || text.includes("پلک")) {
      return "برای افتادگی پلک، پف پلک یا بلفاروپلاستی، ابتدا معاینه تخصصی لازم است تا مشخص شود مشکل زیبایی، عملکردی یا ترکیبی است. می‌توانید نوبت بررسی پلک رزرو کنید.";
    }
    if (text.includes("لیزر") || text.includes("عینک") || text.includes("prk") || text.includes("فمتو") || text.includes("smile")) {
      return "برای لیزر چشم و کاهش وابستگی به عینک، باید شماره چشم، ضخامت قرنیه، خشکی چشم و سبک زندگی بررسی شود. اگر سن، شماره چشم و سابقه بیماری را بگویید بهتر راهنمایی‌تان می‌کنم.";
    }
    if (text.includes("آب مروارید") || text.includes("کاتاراکت")) {
      return "برای آب مروارید، زمان مراجعه معمولاً وقتی است که تاری دید، خیرگی یا کاهش دید شب روی کارهای روزمره اثر بگذارد. رزرو معاینه تخصصی بهترین قدم بعدی است.";
    }
    if (text.includes("هزینه") || text.includes("قیمت")) {
      return "هزینه به نوع معاینه یا خدمت بستگی دارد. برای اعلام دقیق‌تر، ابتدا باید خدمت مورد نظر و شرایط چشم بررسی شود. می‌توانید نوبت بگیرید یا همین‌جا نوع خدمت را بفرمایید.";
    }
    return "برای راهنمایی دقیق‌تر، لطفاً بفرمایید مشکل اصلی شما چیست: معاینه چشم، لیزر چشم، بلفاروپلاستی، آب مروارید، قوز قرنیه یا رزرو نوبت؟";
  }

  if (chatbotForm) {
    chatbotForm.addEventListener("submit", function (event) {
      event.preventDefault();
      const message = chatbotInput ? chatbotInput.value.trim() : "";
      if (!message) return;
      appendMessage(message, "user");
      if (chatbotInput) chatbotInput.value = "";
      setTimeout(() => appendMessage(aiReply(message), "bot"), 350);
    });
  }

  const bookingModal = $("#bookingModal");
  const closeModalBtn = $("#closeModalBtn");
  const availableDays = $("#availableDays");
  const availableTimes = $("#availableTimes");
  const modalStep1 = $("#modalStep1");
  const modalStep2 = $("#modalStep2");
  const modalStep3 = $("#modalStep3");
  const modalSuccess = $("#modalSuccess");
  const submitBookingBtn = $("#submitBookingBtn");
  const modalCloseSuccessBtn = $("#modalCloseSuccessBtn");
  const trackingCode = $("#trackingCode");

  function openBookingModal() {
    if (!bookingModal) return;
    bookingModal.style.display = "flex";
    bookingModal.classList.add("open");
    showStep(1);
    renderDays();
  }

  function closeBookingModal() {
    if (!bookingModal) return;
    bookingModal.style.display = "none";
    bookingModal.classList.remove("open");
  }

  function showStep(step) {
    [modalStep1, modalStep2, modalStep3, modalSuccess].forEach((el) => {
      if (el) el.style.display = "none";
    });
    if (step === 1 && modalStep1) modalStep1.style.display = "block";
    if (step === 2 && modalStep2) modalStep2.style.display = "block";
    if (step === 3 && modalStep3) modalStep3.style.display = "block";
    if (step === "success" && modalSuccess) modalSuccess.style.display = "block";
  }

  function renderDays() {
    if (!availableDays) return;
    availableDays.innerHTML = "";
    ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه"].forEach((day) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = day;
      btn.addEventListener("click", () => {
        showStep(2);
        renderTimes();
      });
      availableDays.appendChild(btn);
    });
  }

  function renderTimes() {
    if (!availableTimes) return;
    availableTimes.innerHTML = "";
    ["۱۰:۰۰", "۱۲:۰۰", "۱۶:۰۰", "۱۸:۰۰", "۲۰:۰۰"].forEach((time) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = time;
      btn.addEventListener("click", () => showStep(3));
      availableTimes.appendChild(btn);
    });
  }

  $$(".nav-booking, .open-booking").forEach((button) => {
    button.addEventListener("click", function (event) {
      event.preventDefault();
      openBookingModal();
    });
  });

  if (closeModalBtn) closeModalBtn.addEventListener("click", closeBookingModal);
  if (modalCloseSuccessBtn) modalCloseSuccessBtn.addEventListener("click", closeBookingModal);

  if (bookingModal) {
    bookingModal.addEventListener("click", function (event) {
      if (event.target === bookingModal) closeBookingModal();
    });
  }

  if (submitBookingBtn) {
    submitBookingBtn.addEventListener("click", function (event) {
      event.preventDefault();
      if (trackingCode) trackingCode.textContent = "NV-" + Math.floor(100000 + Math.random() * 900000);
      showStep("success");
    });
  }
})();
