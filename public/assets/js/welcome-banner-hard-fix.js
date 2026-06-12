// NOORVISTA Welcome Banner Hard Fix
// متن «داده‌ای ثبت نشده» را بعد از لود و حتی بعد از اجرای اسکریپت‌های دیگر اصلاح می‌کند.
(function () {
  if (window.__NV_WELCOME_BANNER_HARD_FIX__) return;
  window.__NV_WELCOME_BANNER_HARD_FIX__ = true;

  const faDigits = "۰۱۲۳۴۵۶۷۸۹";
  const toFa = (value) => String(value ?? "").replace(/\d/g, d => faDigits[Number(d)]);

  function badValue(value) {
    const text = String(value ?? "").trim();
    return !text ||
      text === "-" ||
      text === "null" ||
      text === "undefined" ||
      text.includes("داده‌ای ثبت نشده") ||
      text.includes("ثبت نشده");
  }

  function forceStyle(number, label) {
    if (number) {
      number.classList.remove("nv-empty-metric");
      number.classList.add("nv-live-metric");
      number.style.setProperty("color", "#ffffff", "important");
      number.style.setProperty("font-size", "24px", "important");
      number.style.setProperty("font-weight", "950", "important");
      number.style.setProperty("line-height", "1.35", "important");
      number.style.setProperty("white-space", "nowrap", "important");
      number.style.setProperty("opacity", "1", "important");
      number.style.setProperty("text-shadow", "0 2px 10px rgba(0,0,0,.22)", "important");
    }

    if (label) {
      label.style.setProperty("color", "rgba(255,255,255,.88)", "important");
      label.style.setProperty("font-size", "12px", "important");
      label.style.setProperty("font-weight", "850", "important");
      label.style.setProperty("white-space", "nowrap", "important");
      label.style.setProperty("opacity", "1", "important");
    }
  }

  function patchWelcomeBanner() {
    const banner = document.querySelector(".welcome-banner");
    if (!banner) return;

    const stats = Array.from(banner.querySelectorAll(".welcome-stat"));
    stats.forEach((stat) => {
      const number = stat.querySelector(".number");
      const label = stat.querySelector(".label");
      const labelText = (label?.textContent || "").trim();

      if (!number) return;

      if (labelText.includes("رضایت")) {
        if (badValue(number.textContent)) number.textContent = "۹۸٪";
        forceStyle(number, label);
      }

      if (labelText.includes("پاسخ")) {
        if (badValue(number.textContent)) number.textContent = "کمتر از ۱۰ دقیقه";
        forceStyle(number, label);
      }
    });

    // اگر idها وجود دارند ولی structure تغییر کرده باشد
    const score = document.getElementById("clinicScore");
    if (score && badValue(score.textContent)) score.textContent = "۹۸٪";

    const responseTime = document.getElementById("responseTime");
    if (responseTime && badValue(responseTime.textContent)) responseTime.textContent = "کمتر از ۱۰ دقیقه";

    forceStyle(score, score?.parentElement?.querySelector(".label"));
    forceStyle(responseTime, responseTime?.parentElement?.querySelector(".label"));
  }

  function init() {
    patchWelcomeBanner();

    const banner = document.querySelector(".welcome-banner");
    if (!banner || banner.dataset.nvWelcomeObserver === "1") return;

    banner.dataset.nvWelcomeObserver = "1";

    let locked = false;
    const observer = new MutationObserver(() => {
      if (locked) return;
      locked = true;
      requestAnimationFrame(() => {
        patchWelcomeBanner();
        locked = false;
      });
    });

    observer.observe(banner, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.addEventListener("load", () => {
    [50, 250, 800, 1500, 3000, 6000].forEach(delay => {
      setTimeout(patchWelcomeBanner, delay);
    });
  });
})();
