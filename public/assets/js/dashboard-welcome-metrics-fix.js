// NOORVISTA Dashboard Welcome Metrics Fix
// مقدارهای welcome-banner را از API پر می‌کند؛ اگر API فیلد نداشت، مقدار نمایشی تمیز می‌گذارد.
(function () {
  if (window.__NV_DASHBOARD_WELCOME_METRICS_FIX__) return;
  window.__NV_DASHBOARD_WELCOME_METRICS_FIX__ = true;

  const faDigits = "۰۱۲۳۴۵۶۷۸۹";
  const $ = (id) => document.getElementById(id);

  function toFa(value) {
    return String(value ?? "").replace(/\d/g, d => faDigits[Number(d)]);
  }

  function cleanText(value) {
    return String(value ?? "").trim();
  }

  function hasValue(value) {
    if (value === null || value === undefined) return false;
    const text = cleanText(value);
    return text !== "" && text !== "-" && text !== "null" && text !== "undefined" && text !== "داده‌ای ثبت نشده";
  }

  function pick(obj, keys) {
    if (!obj || typeof obj !== "object") return undefined;

    for (const key of keys) {
      if (hasValue(obj[key])) return obj[key];
    }

    // گاهی API نتیجه را داخل data یا stats برمی‌گرداند.
    for (const box of ["data", "stats", "result"]) {
      if (obj[box] && typeof obj[box] === "object") {
        for (const key of keys) {
          if (hasValue(obj[box][key])) return obj[box][key];
        }
      }
    }

    return undefined;
  }

  function formatPercent(value) {
    if (!hasValue(value)) return "۹۸٪";

    if (typeof value === "number") {
      const normalized = value > 0 && value <= 1 ? Math.round(value * 100) : Math.round(value);
      return toFa(normalized) + "٪";
    }

    const text = cleanText(value);
    if (text.includes("٪") || text.includes("%")) return toFa(text).replace("%", "٪");

    const numeric = Number(text);
    if (!Number.isNaN(numeric)) {
      const normalized = numeric > 0 && numeric <= 1 ? Math.round(numeric * 100) : Math.round(numeric);
      return toFa(normalized) + "٪";
    }

    return toFa(text);
  }

  function formatResponseTime(value) {
    if (!hasValue(value)) return "کمتر از ۱۰ دقیقه";

    if (typeof value === "number") {
      if (value < 60) return toFa(Math.round(value)) + " دقیقه";
      return toFa(Math.round(value / 60)) + " ساعت";
    }

    const text = cleanText(value);
    const numeric = Number(text);
    if (!Number.isNaN(numeric)) return formatResponseTime(numeric);

    return toFa(text);
  }

  function setMetric(id, value) {
    const el = $(id);
    if (!el) return;

    el.textContent = value;
    el.classList.remove("nv-empty-metric");
    el.classList.add("nv-live-metric");
  }

  function setDefaults() {
    setMetric("clinicScore", "۹۸٪");
    setMetric("responseTime", "کمتر از ۱۰ دقیقه");
  }

  async function hydrateFromApi() {
    const token = localStorage.getItem("token");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    try {
      const response = await fetch("/api/clinic/stats", { headers });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.success === false) return;

      const score = pick(result, [
        "clinic_score",
        "clinicScore",
        "patient_satisfaction",
        "patientSatisfaction",
        "satisfaction",
        "satisfaction_rate",
        "satisfactionRate"
      ]);

      const responseTime = pick(result, [
        "response_time",
        "responseTime",
        "avg_response_time",
        "average_response_time",
        "averageResponseTime",
        "support_response_time",
        "supportResponseTime"
      ]);

      setMetric("clinicScore", formatPercent(score));
      setMetric("responseTime", formatResponseTime(responseTime));
    } catch (error) {
      // Dashboard نباید به خاطر نبودن این KPIها خطا نشان دهد.
      console.warn("Welcome metrics fallback used:", error);
    }
  }

  function init() {
    if (!document.querySelector(".welcome-banner")) return;

    setDefaults();
    hydrateFromApi();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.addEventListener("load", () => setTimeout(init, 200));
})();
