// NOORVISTA public FAQ renderer
// صفحه اصلی: فقط ۴ سوال از دیتابیس
// صفحه /faq: همه سوالات فعال و قابل نمایش عمومی از دیتابیس
(function () {
  const HOME_LIMIT = 4;

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, function (ch) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[ch];
    });
  }

  function toFaqArray(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.faqs)) return data.faqs;
    if (data && data.data && Array.isArray(data.data.faqs)) return data.data.faqs;
    return [];
  }

  async function fetchFaqs(limit) {
    const url = limit ? `/api/public/faqs?limit=${encodeURIComponent(limit)}` : "/api/public/faqs";
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: { "Accept": "application/json" }
    });

    const data = await response.json().catch(function () {
      return {};
    });

    if (!response.ok || data.success === false) {
      throw new Error(data.message || "خطا در دریافت سوالات پرتکرار");
    }

    return toFaqArray(data).filter(function (faq) {
      return faq && faq.question && faq.answer;
    });
  }

  function createHomeItem(faq, index) {
    const article = document.createElement("article");
    article.className = "faq-item reveal" + (index === 0 ? " open" : "");
    article.innerHTML = `
      <button class="faq-question" type="button" aria-expanded="${index === 0 ? "true" : "false"}">
        <span>${escapeHtml(faq.question)}</span>
        <span class="faq-symbol">${index === 0 ? "−" : "+"}</span>
      </button>
      <div class="faq-answer" ${index === 0 ? "" : 'style="display:none"'}>
        <p>${escapeHtml(faq.answer)}</p>
      </div>
    `;
    return article;
  }

  function createFullItem(faq, index) {
    const details = document.createElement("details");
    if (index === 0) details.open = true;
    details.innerHTML = `
      <summary>${escapeHtml(faq.question)}</summary>
      <p>${escapeHtml(faq.answer)}</p>
    `;
    return details;
  }

  function bindHomeFaq(root) {
    if (root.dataset.boundFaqToggle === "1") return;
    root.dataset.boundFaqToggle = "1";

    root.addEventListener("click", function (event) {
      const button = event.target.closest(".faq-question");
      if (!button || !root.contains(button)) return;

      const item = button.closest(".faq-item");
      const answer = item ? item.querySelector(".faq-answer") : null;
      const symbol = button.querySelector(".faq-symbol") || button.querySelector("span:last-child");
      if (!item || !answer) return;

      const isOpen = item.classList.toggle("open");
      answer.style.display = isOpen ? "block" : "none";
      button.setAttribute("aria-expanded", String(isOpen));
      if (symbol) symbol.textContent = isOpen ? "−" : "+";
    });
  }

  function renderEmpty(target, type) {
    if (!target) return;
    target.innerHTML = `
      <div class="faq-empty-message">
        <strong>سوالی برای نمایش ثبت نشده است.</strong>
        <p>${type === "home" ? "پس از ثبت سوالات پرتکرار در پنل ادمین، این بخش به‌صورت خودکار به‌روزرسانی می‌شود." : "در حال حاضر سوال فعالی برای نمایش عمومی وجود ندارد."}</p>
      </div>
    `;
  }

  async function renderHomeFaqs() {
    const target = document.getElementById("homepageFaqList");
    if (!target) return;

    target.setAttribute("aria-busy", "true");

    try {
      const faqs = await fetchFaqs(HOME_LIMIT);
      target.innerHTML = "";

      if (!faqs.length) {
        renderEmpty(target, "home");
        return;
      }

      faqs.slice(0, HOME_LIMIT).forEach(function (faq, index) {
        target.appendChild(createHomeItem(faq, index));
      });

      bindHomeFaq(target);
    } catch (error) {
      console.warn("Homepage FAQ load failed:", error.message);
      renderEmpty(target, "home");
    } finally {
      target.removeAttribute("aria-busy");
    }
  }

  function injectFaqSchema(faqs) {
    if (!faqs.length) return;

    const old = document.getElementById("publicFaqSchema");
    if (old) old.remove();

    const schema = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": faqs.map(function (faq) {
        return {
          "@type": "Question",
          "name": String(faq.question || ""),
          "acceptedAnswer": {
            "@type": "Answer",
            "text": String(faq.answer || "")
          }
        };
      })
    };

    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = "publicFaqSchema";
    script.textContent = JSON.stringify(schema);
    document.head.appendChild(script);
  }

  async function renderFullFaqs() {
    const target = document.getElementById("publicFaqList");
    if (!target) return;

    target.setAttribute("aria-busy", "true");

    try {
      const faqs = await fetchFaqs();
      target.innerHTML = "";

      if (!faqs.length) {
        renderEmpty(target, "full");
        return;
      }

      faqs.forEach(function (faq, index) {
        target.appendChild(createFullItem(faq, index));
      });

      injectFaqSchema(faqs);
    } catch (error) {
      console.warn("Public FAQ page load failed:", error.message);
      renderEmpty(target, "full");
    } finally {
      target.removeAttribute("aria-busy");
    }
  }

  function init() {
    renderHomeFaqs();
    renderFullFaqs();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
