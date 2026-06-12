// NOORVISTA Appointment Architecture Admin UI
(function () {
  const page = document.body?.dataset?.appointmentPage;
  if (!page) return;

  const state = {
    doctors: [],
    centers: [],
    services: [],
    schedules: [],
    slots: [],
    slotPositions: [],
    slotRows: [],
    selectedSlotIds: new Set(),
    slotPage: 1,
    slotPageSize: 10,
    editingId: null
  };

  function token() {
    return localStorage.getItem("token") || "";
  }

  async function api(endpoint, options = {}) {
    const headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
    if (token()) headers.Authorization = `Bearer ${token()}`;
    const res = await fetch(endpoint, Object.assign({}, options, { headers }));
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.message || "خطا در ارتباط با سرور");
    }
    return data;
  }

  function toast(message, type = "success") {
    if (typeof showToast === "function") return showToast(message, type);
    alert(message);
  }

  function qs(sel, root = document) {
    return root.querySelector(sel);
  }

  function qsa(sel, root = document) {
    return Array.from(root.querySelectorAll(sel));
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, function (ch) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[ch];
    });
  }

  const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
  const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

  function toFaDigits(value) {
    return String(value ?? "").replace(/\d/g, function (d) {
      return FA_DIGITS[Number(d)];
    });
  }

  function toEnDigits(value) {
    return String(value ?? "")
      .replace(/[۰-۹]/g, function (d) { return String(FA_DIGITS.indexOf(d)); })
      .replace(/[٠-٩]/g, function (d) { return String(AR_DIGITS.indexOf(d)); });
  }

  function faNum(value) {
    return toFaDigits(value ?? "");
  }

  function faTime(value) {
    const raw = String(value || "").slice(0, 5);
    return toFaDigits(raw || "-");
  }

  function normalizeNumericValue(value) {
    return toEnDigits(value).replace(/[^\d.]/g, "");
  }

  function normalizePhoneValue(value) {
    return toEnDigits(value).replace(/[^\d+]/g, "");
  }

  function normalizeTimeValue(value) {
    const en = toEnDigits(value).replace(/[^\d:]/g, "");
    if (/^\d{1,2}:\d{1,2}$/.test(en)) {
      const [h, m] = en.split(":");
      return `${String(Math.min(Math.max(Number(h), 0), 23)).padStart(2, "0")}:${String(Math.min(Math.max(Number(m), 0), 59)).padStart(2, "0")}`;
    }
    if (/^\d{3,4}$/.test(en)) {
      const raw = en.padStart(4, "0");
      return `${raw.slice(0, 2)}:${raw.slice(2, 4)}`;
    }
    return en;
  }

  function isNumericField(input) {
    const key = `${input.id || ""} ${input.name || ""} ${input.placeholder || ""}`.toLowerCase();
    return input.type === "number"
      || /(capacity|duration|count|price|amount|phone|mobile|tel|national|postal|code|lat|lng|latitude|longitude|minute|minutes)/i.test(key)
      || input.classList.contains("numeric")
      || input.classList.contains("number");
  }

  function isPhoneField(input) {
    const key = `${input.id || ""} ${input.name || ""} ${input.placeholder || ""}`.toLowerCase();
    return /(phone|mobile|tel)/i.test(key) || /شماره|تماس|موبایل|تلفن/.test(input.placeholder || "");
  }

  function isDecimalField(input) {
    const key = `${input.id || ""} ${input.name || ""}`.toLowerCase();
    return /(lat|lng|latitude|longitude|price|amount)/i.test(key);
  }

  function sanitizeNumberInput(input) {
    if (!input || input.readOnly || input.disabled) return;

    const phone = isPhoneField(input);
    const decimal = isDecimalField(input);
    const en = toEnDigits(input.value || "");

    let clean = "";
    if (phone) {
      clean = en.replace(/[^\d+]/g, "");
      clean = clean.replace(/(?!^)\+/g, "");
    } else if (decimal) {
      clean = en.replace(/[^\d.]/g, "");
      const parts = clean.split(".");
      clean = parts.length > 1 ? `${parts.shift()}.${parts.join("")}` : clean;
    } else {
      clean = en.replace(/[^\d]/g, "");
    }

    input.value = toFaDigits(clean);
  }

  function persianValidationMessage(input) {
    const label = input.closest("label")?.innerText?.trim()
      || document.querySelector(`label[for="${input.id}"]`)?.innerText?.trim()
      || input.placeholder
      || "این فیلد";

    if (input.validity.valueMissing) return `لطفاً ${label.replace("*", "").trim()} را تکمیل کنید.`;
    if (input.validity.typeMismatch) return "لطفاً مقدار را با قالب درست وارد کنید.";
    if (input.validity.patternMismatch) return "لطفاً مقدار را با قالب خواسته‌شده وارد کنید.";
    if (input.validity.tooShort) return `مقدار واردشده کوتاه است. حداقل ${toFaDigits(input.minLength)} کاراکتر وارد کنید.`;
    if (input.validity.tooLong) return `مقدار واردشده طولانی است. حداکثر ${toFaDigits(input.maxLength)} کاراکتر مجاز است.`;
    if (input.validity.rangeUnderflow) return `مقدار باید حداقل ${toFaDigits(input.min)} باشد.`;
    if (input.validity.rangeOverflow) return `مقدار باید حداکثر ${toFaDigits(input.max)} باشد.`;
    if (input.validity.stepMismatch) return "لطفاً مقدار عددی معتبر وارد کنید.";
    if (input.validity.badInput) return "لطفاً فقط عدد معتبر وارد کنید.";
    return "لطفاً مقدار معتبر وارد کنید.";
  }

  function applyPersianValidation(root = document) {
    root.querySelectorAll("input, select, textarea").forEach((field) => {
      if (field.dataset.faValidationEnhanced === "1") return;
      field.dataset.faValidationEnhanced = "1";

      field.addEventListener("invalid", function () {
        field.setCustomValidity(persianValidationMessage(field));
      });

      field.addEventListener("input", function () {
        field.setCustomValidity("");
        if (isNumericField(field)) sanitizeNumberInput(field);
      });

      field.addEventListener("change", function () {
        field.setCustomValidity("");
        if (isNumericField(field)) sanitizeNumberInput(field);
      });
    });
  }

  function normalizeFormBeforeSubmit(form) {
    if (!form) return;

    form.querySelectorAll("input").forEach((input) => {
      if (isNumericField(input)) {
        const phone = isPhoneField(input);
        const decimal = isDecimalField(input);
        const en = toEnDigits(input.value || "");
        if (phone) input.value = en.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
        else if (decimal) {
          let clean = en.replace(/[^\d.]/g, "");
          const parts = clean.split(".");
          clean = parts.length > 1 ? `${parts.shift()}.${parts.join("")}` : clean;
          input.value = clean;
        } else {
          input.value = en.replace(/[^\d]/g, "");
        }
      }
    });

    ["start_time", "end_time"].forEach((id) => {
      const input = form.querySelector(`#${id}`);
      if (input && input.value) input.value = normalizeTimeValue(input.value);
    });
  }

  function restoreFormPersianAfterSubmit(form) {
    if (!form) return;
    form.querySelectorAll("input").forEach((input) => {
      if (isNumericField(input) && input.value) input.value = toFaDigits(input.value);
    });
    syncAppointmentUiFields();
  }


  function timeToMinutes(value) {
    const normalized = normalizeTimeValue(value || "00:00");
    const [h, m] = normalized.split(":").map(Number);
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
  }

  function minutesToTime(total) {
    let minutes = Number(total || 0);
    minutes = ((minutes % 1440) + 1440) % 1440;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  function setInputValuePersian(input, value) {
    if (!input) return;
    const normalized = normalizeNumericValue(value);
    input.value = normalized ? toFaDigits(normalized) : "";
  }

  function getInputValueEnglish(input) {
    return normalizeNumericValue(input?.value || "");
  }

  function refreshChoicePills(select) {
    if (!select) return;
    const wrap = select.nextElementSibling?.classList?.contains("appt-choice-pills") ? select.nextElementSibling : null;
    if (!wrap) return;
    wrap.querySelectorAll("button[data-value]").forEach((btn) => {
      btn.classList.toggle("active", String(btn.dataset.value) === String(select.value));
      btn.setAttribute("aria-pressed", String(String(btn.dataset.value) === String(select.value)));
    });
  }

  function enhanceChoiceSelect(select, options) {
    if (!select || select.dataset.choiceEnhanced === "1") return;
    select.dataset.choiceEnhanced = "1";
    select.classList.add("appt-hidden-select");

    const wrap = document.createElement("div");
    wrap.className = "appt-choice-pills";
    wrap.setAttribute("role", "group");

    options.forEach((opt) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "appt-choice-pill";
      btn.dataset.value = String(opt.value);
      btn.innerHTML = `<strong>${escapeHtml(opt.label)}</strong>${opt.hint ? `<small>${escapeHtml(opt.hint)}</small>` : ""}`;
      btn.addEventListener("click", () => {
        select.value = String(opt.value);
        select.dispatchEvent(new Event("change", { bubbles: true }));
        refreshChoicePills(select);
      });
      wrap.appendChild(btn);
    });

    select.insertAdjacentElement("afterend", wrap);
    refreshChoicePills(select);
  }

  function updateTimeControl(input) {
    if (!input) return;
    const control = input.nextElementSibling?.classList?.contains("appt-time-control") ? input.nextElementSibling : null;
    if (!control) return;

    const manual = control.querySelector(".appt-time-manual-input");
    const value = faTime(input.value || "09:00");

    if (manual && document.activeElement !== manual) manual.value = value;
  }

  function enhanceTimeInput(input, title) {
    if (!input || input.dataset.timeEnhanced === "1") return;
    input.dataset.timeEnhanced = "1";
    input.classList.add("appt-hidden-time");
    input.type = "hidden";

    const initial = normalizeTimeValue(input.value || "09:00") || "09:00";
    input.value = initial;

    const control = document.createElement("div");
    control.className = "appt-time-control appt-time-control-pro";
    control.innerHTML = `
      <div class="appt-time-manual">
        <input type="text" inputmode="numeric" autocomplete="off" class="appt-time-manual-input" value="${faTime(input.value || "09:00")}" placeholder="مثلاً ۰۹:۳۰"/>
      </div>

      <div class="appt-time-section-label">دقیقه</div>
      <div class="appt-time-buttons appt-time-buttons-grid">
        <button type="button" data-step="-15">−۱۵</button>
        <button type="button" data-step="15">+۱۵</button>
        <button type="button" data-step="-5">−۵</button>
        <button type="button" data-step="5">+۵</button>
        <button type="button" data-step="-1">−۱</button>
        <button type="button" data-step="1">+۱</button>
      </div>

      <div class="appt-time-section-label">ساعت</div>
      <div class="appt-time-presets">
        ${["08:00","09:00","10:00","12:00","14:00","16:00","18:00"].map((t) => `<button type="button" data-time="${t}">${faTime(t)}</button>`).join("")}
      </div>
    `;

    function commitTime(next) {
      const normalized = normalizeTimeValue(next);
      if (/^\d{2}:\d{2}$/.test(normalized)) {
        input.value = normalized;
        input.dispatchEvent(new Event("change", { bubbles: true }));
        updateTimeControl(input);
      }
    }

    control.addEventListener("click", (event) => {
      const stepBtn = event.target.closest("[data-step]");
      const timeBtn = event.target.closest("[data-time]");

      if (stepBtn) {
        commitTime(minutesToTime(timeToMinutes(input.value || "09:00") + Number(stepBtn.dataset.step || 0)));
      }

      if (timeBtn) {
        commitTime(timeBtn.dataset.time);
      }
    });

    const manual = control.querySelector(".appt-time-manual-input");
    manual.addEventListener("input", () => {
      manual.value = toFaDigits(toEnDigits(manual.value).replace(/[^\d:]/g, ""));
      const normalized = normalizeTimeValue(manual.value);
      if (/^\d{2}:\d{2}$/.test(normalized)) {
        input.value = normalized;
        input.dispatchEvent(new Event("change", { bubbles: true }));
        updateTimeControl(input);
      }
    });

    manual.addEventListener("blur", () => {
      const normalized = normalizeTimeValue(manual.value);
      if (/^\d{2}:\d{2}$/.test(normalized)) commitTime(normalized);
      else manual.value = faTime(input.value || "09:00");
    });

    input.insertAdjacentElement("afterend", control);
    updateTimeControl(input);
  }

  function enhancePersianNumberInput(input, mode = "number") {
    if (!input || input.dataset.faNumberEnhanced === "1") return;
    input.dataset.faNumberEnhanced = "1";
    input.type = "text";
    input.inputMode = mode === "phone" ? "tel" : "numeric";
    input.autocomplete = "off";
    input.classList.add("appt-fa-number-input");

    if (mode === "phone") {
      input.placeholder = input.placeholder || "مثلاً ۰۹۲۲۱۹۷۱۳۹۷";
    } else if (!input.placeholder) {
      input.placeholder = "مثلاً ۳۰";
    } else {
      input.placeholder = toFaDigits(input.placeholder);
    }

    if (input.value) {
      input.value = mode === "phone" ? toFaDigits(normalizePhoneValue(input.value)) : toFaDigits(normalizeNumericValue(input.value));
    }

    input.addEventListener("keydown", (event) => {
      const allowedKeys = ["Backspace","Delete","Tab","Enter","Escape","ArrowRight","ArrowLeft","ArrowUp","ArrowDown","Home","End"];
      if (allowedKeys.includes(event.key) || event.ctrlKey || event.metaKey) return;

      const isDigit = /^[0-9۰-۹٠-٩]$/.test(event.key);
      const isPlus = mode === "phone" && event.key === "+" && input.selectionStart === 0 && !input.value.includes("+");
      const isDecimal = isDecimalField(input) && event.key === "." && !toEnDigits(input.value).includes(".");

      if (!isDigit && !isPlus && !isDecimal) event.preventDefault();
    });

    input.addEventListener("paste", (event) => {
      event.preventDefault();
      const pasted = event.clipboardData?.getData("text") || "";
      input.value += pasted;
      sanitizeNumberInput(input);
    });

    input.addEventListener("input", () => sanitizeNumberInput(input));
    input.addEventListener("blur", () => sanitizeNumberInput(input));
  }

  function cleanupOrphanPrettySelects(root = document) {
    root.querySelectorAll(".nvps-select").forEach((wrap) => {
      if (!wrap.querySelector("select")) wrap.remove();
    });
  }

  function wrapFilterControl(id, label, hint) {
    const el = qs(`#${id}`);
    if (!el) return;

    cleanupOrphanPrettySelects();

    const host = el.closest(".nvps-select") || el;
    if (host.closest(".appt-filter-field")) return;

    const wrapper = document.createElement("label");
    wrapper.className = "appt-filter-field";
    wrapper.innerHTML = `<span>${escapeHtml(label)}</span>${hint ? `<small>${escapeHtml(hint)}</small>` : ""}`;
    host.parentNode.insertBefore(wrapper, host);
    wrapper.appendChild(host);
  }

  function enhanceFilterCard() {
    const filterIds = ["filter_doctor_id", "filter_center_id", "filter_service_id", "filter_status", "date_from", "date_to"];
    const first = filterIds.map((id) => qs(`#${id}`)).find(Boolean);
    if (!first) return;

    const card = first.closest(".appt-card");
    if (card) card.classList.add("appt-filter-card");

    wrapFilterControl("filter_doctor_id", "پزشک");
    wrapFilterControl("filter_center_id", "مرکز درمانی");
    wrapFilterControl("filter_service_id", "خدمت");
    wrapFilterControl("filter_status", "وضعیت نوبت");
    wrapFilterControl("date_from", "از تاریخ", "شمسی");
    wrapFilterControl("date_to", "تا تاریخ", "شمسی");
  }

  function localizeStaticLabels() {
    qsa("label").forEach((label) => {
      const text = (label.textContent || "").trim();
      if (text === "Slug") label.textContent = "نامک خدمت (آدرس انگلیسی)";
      if (text === "مدت هر نوبت / دقیقه") label.textContent = "مدت هر نوبت به دقیقه";
      if (text === "مدت پیش‌فرض هر نوبت / دقیقه") label.textContent = "مدت پیش‌فرض هر نوبت به دقیقه";
    });

    const phone = qs("#center_phone");
    if (phone) phone.placeholder = "مثلاً ۰۹۲۲۱۹۷۱۳۹۷";

    const slug = qs("#service_slug");
    if (slug) {
      slug.placeholder = "مثلاً laser-vision-correction";
      slug.dir = "ltr";
      slug.classList.add("appt-ltr-input");
    }

    const category = qs("#service_category");
    if (category) {
      category.placeholder = "مثلاً laser، surgery یا diagnostic";
      category.dir = "ltr";
      category.classList.add("appt-ltr-input");
    }
  }

  function enhanceAppointmentFields() {
    applyPersianValidation(document);
    localizeStaticLabels();

    ["#slot_duration_minutes", "#capacity_per_slot", "#service_capacity", "#service_duration"].forEach((sel) => {
      enhancePersianNumberInput(qs(sel));
    });

    enhancePersianNumberInput(qs("#center_phone"), "phone");

    enhanceTimeInput(qs("#start_time"), "شروع");
    enhanceTimeInput(qs("#end_time"), "پایان");

    enhanceChoiceSelect(qs("#day_of_week"), [
      { value: 0, label: "شنبه" },
      { value: 1, label: "یکشنبه" },
      { value: 2, label: "دوشنبه" },
      { value: 3, label: "سه‌شنبه" },
      { value: 4, label: "چهارشنبه" },
      { value: 5, label: "پنجشنبه" },
      { value: 6, label: "جمعه" }
    ]);

    enhanceChoiceSelect(qs("#is_recurring"), [
      { value: 1, label: "تکرارشونده هفتگی", hint: "نیازمند تاریخ پایان یا بازه آماده" },
      { value: 0, label: "فقط یک‌بار", hint: "فقط تاریخ شروع" }
    ]);

    ensureSchedulePeriodButtons();
    enhanceFilterCard();
    syncRecurringScheduleMode();
    syncAppointmentUiFields();
  }

  function syncAppointmentUiFields() {
    const scheduleCapacity = qs("#capacity_per_slot");
    if (scheduleCapacity && (!normalizeNumericValue(scheduleCapacity.value) || normalizeNumericValue(scheduleCapacity.value) === "0")) {
      scheduleCapacity.value = faNum(1);
    }

["#slot_duration_minutes", "#capacity_per_slot", "#service_capacity", "#service_duration"].forEach((sel) => {
      const input = qs(sel);
      if (input && input.dataset.faNumberEnhanced === "1" && input.value) input.value = toFaDigits(normalizeNumericValue(input.value));
    });

    const phone = qs("#center_phone");
    if (phone && phone.dataset.faNumberEnhanced === "1" && phone.value) phone.value = toFaDigits(normalizePhoneValue(phone.value));

    updateTimeControl(qs("#start_time"));
    updateTimeControl(qs("#end_time"));
    refreshChoicePills(qs("#day_of_week"));
    refreshChoicePills(qs("#is_recurring"));
    syncRecurringScheduleMode();
  }


  function isActiveValue(value) {
    return value === true || value === 1 || value === "1" || value === "true";
  }

  function activeBadge(value) {
    return isActiveValue(value) ? '<span class="appt-badge active">فعال</span>' : '<span class="appt-badge inactive">غیرفعال</span>';
  }

  function statusBadge(status) {
    const key = String(status || "available").toLowerCase();
    const labels = {
      available: "آزاد",
      free: "آزاد",
      booked: "رزروشده",
      reserved: "رزروشده",
      pending: "در انتظار تأیید",
      confirmed: "تأییدشده",
      completed: "انجام‌شده",
      full: "تکمیل ظرفیت",
      disabled: "غیرفعال",
      inactive: "غیرفعال",
      cancelled: "لغوشده",
      canceled: "لغوشده",
      deleted: "حذف‌شده",
      rejected: "ردشده",
      no_show: "عدم مراجعه"
    };
    const cls = {
      reserved: "booked",
      pending: "pending",
      confirmed: "confirmed",
      completed: "confirmed",
      canceled: "cancelled",
      cancelled: "cancelled",
      deleted: "disabled",
      inactive: "disabled",
      free: "available"
    }[key] || key;

    return `<span class="appt-badge ${escapeHtml(cls)}">${escapeHtml(labels[key] || "نامشخص")}</span>`;
  }

  function dayName(value) {
    return ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"][Number(value)] || "-";
  }

  function weekdayFromGregorianForSchedule(dateString) {
    const normalized = toGregorianDateInput(dateString || "");
    if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;

    const date = new Date(`${normalized}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return null;

    // JS: Sun=0 ... Sat=6 ; NOORVISTA schedule uses 0=Saturday, 1=Sunday, ...
    return (date.getUTCDay() + 1) % 7;
  }

  function fieldHostOf(input) {
    if (!input) return null;
    const pretty = input.closest(".nvps-select");
    if (pretty && pretty.parentElement) return pretty.parentElement;
    return input.closest(".appt-field, .form-group, div");
  }

  function ensureScheduleModeHint() {
    const start = qs("#start_date");
    const host = fieldHostOf(start);
    if (!host || host.querySelector(".nv-schedule-mode-hint")) return;

    const hint = document.createElement("small");
    hint.className = "nv-schedule-mode-hint";
    host.appendChild(hint);
  }

  function syncRecurringScheduleMode() {
    const recurringSelect = qs("#is_recurring");
    if (!recurringSelect) return;

    const recurring = String(recurringSelect.value ?? "1") === "1";
    const daySelect = qs("#day_of_week");
    const startDate = qs("#start_date");
    const endDate = qs("#end_date");
    const dayHost = fieldHostOf(daySelect);
    const endHost = fieldHostOf(endDate);

    ensureScheduleModeHint();
    const hint = qs(".nv-schedule-mode-hint");

    if (!recurring) {
      const computedDay = weekdayFromGregorianForSchedule(startDate?.value || "");
      if (daySelect && computedDay !== null) {
        daySelect.value = String(computedDay);
        daySelect.dispatchEvent(new Event("change", { bubbles: true }));
      }

      if (daySelect) daySelect.disabled = true;
      if (endDate) {
        endDate.value = "";
        endDate.disabled = true;
        endDate.required = false;
        endDate.setCustomValidity("");
      }

      dayHost?.classList.add("nv-schedule-one-time-hidden");
      endHost?.classList.add("nv-schedule-one-time-hidden");

      if (hint) {
        hint.textContent = "نوبت فقط برای تاریخ شروع تولید می‌شود؛ روز هفته از همان تاریخ محاسبه می‌شود.";
      }
    } else {
      if (daySelect) daySelect.disabled = false;
      if (endDate) {
        endDate.disabled = false;
        endDate.required = true;
      }

      dayHost?.classList.remove("nv-schedule-one-time-hidden");
      endHost?.classList.remove("nv-schedule-one-time-hidden");

      if (hint) {
        hint.textContent = "نوبت‌ها هر هفته در روز انتخابی تا تاریخ پایان تولید می‌شوند.";
      }
    }

    refreshChoicePills(daySelect);
    refreshChoicePills(recurringSelect);
    window.NVPrettySelects?.sync?.(daySelect);
    window.NVPrettySelects?.sync?.(recurringSelect);
  }


  function toGregorianDateInput(value) {
    return window.NVDate?.toGregorianDate ? window.NVDate.toGregorianDate(value) : String(value || "");
  }

  function toJalaliDateView(value) {
    return window.NVDate?.toJalaliDate ? window.NVDate.toJalaliDate(value) : String(value || "");
  }

  function addMonthsGregorian(dateString, months) {
    const normalized = toGregorianDateInput(dateString || "");
    if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return "";
    const date = new Date(`${normalized}T00:00:00`);
    const day = date.getDate();
    date.setMonth(date.getMonth() + Number(months || 0));
    if (date.getDate() < day) date.setDate(0);
    return date.toISOString().slice(0, 10);
  }

  function setScheduleEndByMonths(months) {
    const start = qs("#start_date")?.value;
    if (!start) {
      toast("اول تاریخ شروع را انتخاب کنید", "error");
      qs("#start_date")?.focus();
      return;
    }
    const endGregorian = addMonthsGregorian(start, months);
    if (!endGregorian) return;
    qs("#end_date").value = toJalaliDateView(endGregorian);
    qs("#end_date")?.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function ensureSchedulePeriodButtons() {
    const end = qs("#end_date");
    if (!end || qs("#schedulePeriodQuick")) return;

    const wrap = document.createElement("div");
    wrap.className = "appt-period-quick";
    wrap.id = "schedulePeriodQuick";
    wrap.innerHTML = `
      <div class="appt-period-buttons">
        <button type="button" data-months="1">۱</button>
        <button type="button" data-months="2">۲</button>
        <button type="button" data-months="3">۳</button>
        <button type="button" data-months="4">۴</button>
        <button type="button" data-months="5">۵</button>
        <button type="button" data-months="6">۶</button>
      </div>
    `;
    end.insertAdjacentElement("afterend", wrap);

    wrap.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-months]");
      if (!btn) return;
      setScheduleEndByMonths(btn.dataset.months);
    });
  }

  function validateSchedulePeriodBeforeSubmit(form) {
    if (!form || form.id !== "scheduleForm") return true;

    const recurring = String(qs("#is_recurring")?.value ?? "1") === "1";
    const start = qs("#start_date");
    const end = qs("#end_date");

    start?.setCustomValidity("");
    end?.setCustomValidity("");

    if (!start?.value) {
      start.setCustomValidity("لطفاً تاریخ شروع برنامه را مشخص کنید.");
      start.reportValidity();
      toast("برای تعریف برنامه، تاریخ شروع الزامی است.", "error");
      return false;
    }

    if (recurring && !end?.value) {
      end.setCustomValidity("برای برنامه تکرارشونده، تاریخ پایان الزامی است.");
      end.reportValidity();
      toast("برای برنامه تکرارشونده باید تاریخ پایان یا یکی از بازه‌های آماده را انتخاب کنید.", "error");
      return false;
    }

    return true;
  }

  function centerType(value) {
    return {
      clinic: "کلینیک",
      hospital: "بیمارستان",
      treatment_center: "درمانگاه",
      surgery_center: "مرکز جراحی",
      other: "سایر"
    }[value] || value || "-";
  }

  function asArray(data, keys) {
    for (const key of keys) {
      if (Array.isArray(data?.[key])) return data[key];
    }
    if (Array.isArray(data)) return data;
    return [];
  }

  function fillSelect(id, items, placeholder, labelFn = (x) => x.name, valueFn = (x) => x.id) {
    const el = qs(`#${id}`);
    if (!el) return;
    const current = el.value;
    el.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>` + items.map((item) => (
      `<option value="${escapeHtml(valueFn(item))}">${escapeHtml(labelFn(item))}</option>`
    )).join("");
    if (current) el.value = current;
  }

  async function loadDoctors() {
    try {
      const data = await api("/api/admin/doctors?limit=500");
      state.doctors = asArray(data, ["doctors", "data"]).map((d) => ({
        id: d.id,
        name: d.full_name || d.doctor_name || d.name || d.username || `پزشک ${d.id}`,
        specialty: d.specialty || d.sub_specialty || ""
      }));
    } catch (e) {
      const data = await api("/api/clinic/doctors");
      state.doctors = asArray(data, ["doctors", "data"]).map((d) => ({
        id: d.id,
        name: d.full_name || d.doctor_name || d.name || d.username || `پزشک ${d.id}`,
        specialty: d.specialty || ""
      }));
    }
  }

  async function loadCenters() {
    const data = await api("/api/medical-centers?include_inactive=1");
    state.centers = asArray(data, ["centers", "medical_centers"]);
  }

  async function loadServices() {
    const data = await api("/api/services?include_inactive=1");
    state.services = asArray(data, ["services"]);
  }

  async function loadLookups() {
    await Promise.allSettled([loadDoctors(), loadCenters(), loadServices()]);
    fillSelect("doctor_id", state.doctors, "انتخاب پزشک", (d) => `${d.name}${d.specialty ? " - " + d.specialty : ""}`);
    fillSelect("medical_center_id", state.centers, "انتخاب مرکز درمانی", (c) => c.name);
    fillSelect("service_id", state.services, "انتخاب خدمت", (s) => `${s.name} (ظرفیت پیش‌فرض ${faNum(s.default_capacity || 1)})`);
    fillSelect("filter_doctor_id", state.doctors, "همه پزشکان", (d) => d.name);
    fillSelect("filter_center_id", state.centers, "همه مراکز", (c) => c.name);
    fillSelect("filter_service_id", state.services, "همه خدمات", (s) => s.name);
    enhanceFilterCard();
  }

  function getSubmitButtons(form) {
    return Array.from(form.querySelectorAll('button[type="submit"], input[type="submit"]'));
  }

  function setFormSubmitting(form, isSubmitting) {
    if (!form) return;

    const isSchedule = form.id === "scheduleForm";
    const message = isSchedule ? "در حال ذخیره و تولید نوبت‌ها..." : "در حال ذخیره...";
    const buttons = getSubmitButtons(form);

    form.dataset.submitting = isSubmitting ? "1" : "0";
    form.classList.toggle("appt-form-submitting", Boolean(isSubmitting));
    form.setAttribute("aria-busy", isSubmitting ? "true" : "false");

    buttons.forEach((button) => {
      if (isSubmitting) {
        if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML;
        button.disabled = true;
        button.classList.add("appt-btn-loading");
        button.innerHTML = `<span class="appt-btn-spinner" aria-hidden="true"></span><span>${message}</span>`;
      } else {
        button.disabled = false;
        button.classList.remove("appt-btn-loading");
        if (button.dataset.originalHtml) {
          button.innerHTML = button.dataset.originalHtml;
          delete button.dataset.originalHtml;
        }
      }
    });
  }

  function bindForm(formId, handler) {
    const form = qs(`#${formId}`);
    if (!form) return;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      if (form.dataset.submitting === "1") {
        toast("در حال ذخیره و تولید نوبت‌ها هستیم؛ لطفاً چند لحظه صبر کنید.", "info");
        return;
      }

      try {
        applyPersianValidation(form);
        if (form.id === "scheduleForm" && !validateSchedulePeriodBeforeSubmit(form)) return;
        if (!form.checkValidity()) {
          form.reportValidity();
          return;
        }

        setFormSubmitting(form, true);
        normalizeFormBeforeSubmit(form);
        await handler(new FormData(form), form);
        restoreFormPersianAfterSubmit(form);
      } catch (error) {
        restoreFormPersianAfterSubmit(form);
        console.error(error);
        toast(error.message || "خطا در ذخیره اطلاعات", "error");
      } finally {
        setFormSubmitting(form, false);
      }
    });
  }


  // NV_SCHEDULE_SUBMIT_CLICK_GUARD
  document.addEventListener("click", (event) => {
    const submit = event.target.closest('button[type="submit"], input[type="submit"]');
    const form = submit?.closest("form");
    if (!submit || !form) return;

    if (form.dataset.submitting === "1") {
      event.preventDefault();
      event.stopPropagation();
      toast("در حال ذخیره و تولید نوبت‌ها هستیم؛ لطفاً چند لحظه صبر کنید.", "info");
    }
  }, true);

  function formDataObject(fd) {
    const obj = {};
    for (const [k, v] of fd.entries()) obj[k] = v;

    ["slot_duration_minutes", "capacity_per_slot", "default_capacity", "default_duration_minutes"].forEach((key) => {
      if (obj[key] !== undefined) obj[key] = normalizeNumericValue(obj[key]);
    });

    ["phone"].forEach((key) => {
      if (obj[key] !== undefined) obj[key] = normalizePhoneValue(obj[key]);
    });

    ["start_time", "end_time"].forEach((key) => {
      if (obj[key]) obj[key] = normalizeTimeValue(obj[key]);
    });

    ["start_date", "end_date", "date_from", "date_to"].forEach((key) => {
      if (obj[key]) obj[key] = toGregorianDateInput(obj[key]);
    });
    if (obj.is_recurring === "0" && obj.start_date) {
      obj.end_date = obj.start_date;
      const computedDay = weekdayFromGregorianForSchedule(obj.start_date);
      if (computedDay !== null) obj.day_of_week = String(computedDay);
    }
    if (obj.is_recurring === "1" && !obj.end_date) {
      throw new Error("برای برنامه تکرارشونده، تاریخ پایان الزامی است.");
    }
    return obj;
  }

  function selectedValues(selector) {
    return qsa(selector).filter((x) => x.checked).map((x) => x.value).filter(Boolean);
  }

  function scheduleFiltersPayload() {
    return {
      doctor_id: qs("#filter_doctor_id")?.value || "",
      medical_center_id: qs("#filter_center_id")?.value || "",
      service_id: qs("#filter_service_id")?.value || ""
    };
  }

  function slotFiltersPayload() {
    return {
      doctor_id: qs("#filter_doctor_id")?.value || "",
      medical_center_id: qs("#filter_center_id")?.value || "",
      service_id: qs("#filter_service_id")?.value || "",
      status: qs("#filter_status")?.value || "",
      date_from: qs("#date_from")?.value ? toGregorianDateInput(qs("#date_from").value) : "",
      date_to: qs("#date_to")?.value ? toGregorianDateInput(qs("#date_to").value) : ""
    };
  }

  function ensureScheduleBulkToolbar() {
    const table = qs("#schedulesTableBody")?.closest(".appt-table-wrap");
    if (!table || qs("#scheduleBulkToolbar")) return;

    const toolbar = document.createElement("div");
    toolbar.className = "appt-bulk-toolbar";
    toolbar.id = "scheduleBulkToolbar";
    toolbar.innerHTML = `
      <div>
        <strong>مدیریت گروهی زمان‌بندی‌ها</strong>
        <small>حذف به معنی غیرفعال‌سازی امن است و نوبت‌های بدون رزرو مرتبط هم غیرفعال می‌شوند.</small>
      </div>
      <div class="appt-bulk-actions">
        <button type="button" class="appt-btn appt-btn-muted" id="selectAllSchedules">انتخاب همه</button>
        <button type="button" class="appt-btn appt-btn-danger" id="deleteSelectedSchedules">حذف انتخاب‌شده‌ها</button>
        <button type="button" class="appt-btn appt-btn-danger-outline" id="deleteFilteredSchedules">حذف همه موارد فیلترشده</button>
      </div>
    `;
    table.parentNode.insertBefore(toolbar, table);
  }

  function ensureSlotBulkToolbar() {
    const table = qs("#slotsTableBody")?.closest(".appt-table-wrap");
    if (!table || qs("#slotBulkToolbar")) return;

    const toolbar = document.createElement("div");
    toolbar.className = "appt-bulk-toolbar";
    toolbar.id = "slotBulkToolbar";
    toolbar.innerHTML = `
      <div>
        <strong>مدیریت گروهی ظرفیت نوبت‌ها</strong>
        <small>فقط نوبت‌هایی که رزرو ندارند حذف/غیرفعال می‌شوند؛ نوبت رزرو‌شده حذف نمی‌شود.</small>
      </div>
      <div class="appt-bulk-actions">
        <button type="button" class="appt-btn appt-btn-muted" id="selectAllSlots">انتخاب همه</button>
        <button type="button" class="appt-btn appt-btn-danger" id="deleteSelectedSlots">حذف انتخاب‌شده‌ها</button>
        <button type="button" class="appt-btn appt-btn-danger-outline" id="deleteFilteredSlots">حذف همه نوبت‌های فیلترشده بدون رزرو</button>
      </div>
    `;
    table.parentNode.insertBefore(toolbar, table);
  }


  function getSlotRows() {
    return state.slotPositions && state.slotPositions.length ? state.slotPositions : state.slots;
  }

  function slotRowKey(row) {
    if (!row) return "";
    const isPosition = Boolean(row.slot_id || row.position_in_slot);
    return String(isPosition ? row.id : (row.slot_id || row.id));
  }

  function isSlotRowBooked(row) {
    return Boolean(row?.is_booked || row?.appointment_id);
  }

  function syncSlotSelectionWithRows(rows) {
    const allowed = new Set((rows || []).filter((row) => !isSlotRowBooked(row)).map(slotRowKey));
    Array.from(state.selectedSlotIds || []).forEach((id) => {
      if (!allowed.has(String(id))) state.selectedSlotIds.delete(id);
    });
  }

  function ensureSlotPagination() {
    const table = qs("#slotsTableBody")?.closest(".appt-table-wrap");
    if (!table) return null;

    let pager = qs("#slotPagination");
    if (!pager) {
      pager = document.createElement("div");
      pager.id = "slotPagination";
      pager.className = "nv-slot-pagination";
      table.parentNode.insertBefore(pager, table.nextSibling);
    }
    return pager;
  }

  function renderSlotPagination(totalRows) {
    const pager = ensureSlotPagination();
    if (!pager) return;

    const total = Number(totalRows || 0);
    if (total <= 0) {
      pager.innerHTML = "";
      pager.style.display = "none";
      return;
    }

    const pageSize = Math.max(Number(state.slotPageSize || 10), 1);
    const totalPages = Math.max(Math.ceil(total / pageSize), 1);
    state.slotPage = Math.min(Math.max(Number(state.slotPage || 1), 1), totalPages);

    const start = (state.slotPage - 1) * pageSize + 1;
    const end = Math.min(state.slotPage * pageSize, total);
    const buttons = [];
    const windowSize = 2;
    const addPage = (pageNumber) => {
      buttons.push(`<button type="button" class="nv-slot-page-btn ${pageNumber === state.slotPage ? "active" : ""}" data-slot-page="${pageNumber}" aria-label="صفحه ${faNum(pageNumber)}">${faNum(pageNumber)}</button>`);
    };

    addPage(1);
    const from = Math.max(2, state.slotPage - windowSize);
    const to = Math.min(totalPages - 1, state.slotPage + windowSize);
    if (from > 2) buttons.push(`<span class="nv-slot-page-ellipsis">…</span>`);
    for (let p = from; p <= to; p += 1) addPage(p);
    if (to < totalPages - 1) buttons.push(`<span class="nv-slot-page-ellipsis">…</span>`);
    if (totalPages > 1) addPage(totalPages);

    pager.style.display = "flex";
    pager.innerHTML = `
      <div class="nv-slot-pagination-info">
        نمایش ${faNum(start)} تا ${faNum(end)} از ${faNum(total)} نوبت
      </div>
      <div class="nv-slot-pagination-controls" aria-label="صفحه‌بندی جدول ظرفیت نوبت‌ها">
        <button type="button" class="nv-slot-page-btn" data-slot-page-action="first" ${state.slotPage <= 1 ? "disabled" : ""}>اول</button>
        <button type="button" class="nv-slot-page-btn" data-slot-page-action="prev" ${state.slotPage <= 1 ? "disabled" : ""}>قبلی</button>
        ${buttons.join("")}
        <button type="button" class="nv-slot-page-btn" data-slot-page-action="next" ${state.slotPage >= totalPages ? "disabled" : ""}>بعدی</button>
        <button type="button" class="nv-slot-page-btn" data-slot-page-action="last" ${state.slotPage >= totalPages ? "disabled" : ""}>آخر</button>
      </div>
      <label class="nv-slot-page-size">
        <span>نمایش در صفحه</span>
        <select id="slotPageSize">
          ${[10, 20, 50, 100].map((size) => `<option value="${size}" ${size === pageSize ? "selected" : ""}>${faNum(size)}</option>`).join("")}
        </select>
      </label>
    `;
  }

  function setSlotPage(nextPage) {
    const total = getSlotRows().length;
    const totalPages = Math.max(Math.ceil(total / Math.max(Number(state.slotPageSize || 10), 1)), 1);
    state.slotPage = Math.min(Math.max(Number(nextPage || 1), 1), totalPages);
    renderSlots(false);
  }


  function removePanelInjectedDeleteButtons() {
    qsa("#schedulesTableBody .btn-delete-schedule, #slotsTableBody .btn-delete-slot").forEach((btn) => btn.remove());
  }
  function polishScheduleActionButtons() { /* disabled: جدول خودش وضعیت دکمه را مدیریت می‌کند */ }

  async function bulkDeleteSchedules(mode) {
    let payload = { delete_empty_slots: true };

    if (mode === "selected") {
      const ids = selectedValues(".schedule-select");
      if (!ids.length) return toast("حداقل یک زمان‌بندی را انتخاب کنید", "error");
      if (!confirm(`آیا ${ids.length} زمان‌بندی انتخاب‌شده حذف شود؟ اگر زمان‌بندی رزرو داشته باشد فقط غیرفعال می‌شود.`)) return;
      payload.ids = ids;
    } else {
      const filters = scheduleFiltersPayload();
      const hasFilter = Object.values(filters).some(Boolean);
      const msg = hasFilter
        ? "همه زمان‌بندی‌های مطابق فیلتر فعلی حذف شوند؟ موارد دارای رزرو فقط غیرفعال می‌شوند."
        : "هیچ فیلتری انتخاب نشده است. آیا واقعاً همه زمان‌بندی‌ها حذف شوند؟ موارد دارای رزرو فقط غیرفعال می‌شوند.";
      if (!confirm(msg)) return;
      payload.scope = "filtered";
      payload.confirm_all = true;
      payload.filters = filters;
    }

    const result = await api("/api/doctor-schedules/bulk-hard-delete", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    await renderSchedules();
    toast(result.message || "عملیات حذف زمان‌بندی انجام شد");
  }

  async function toggleScheduleActive(id, nextActive) {
    const action = nextActive ? "فعال‌سازی" : "غیرفعال‌سازی";
    if (!confirm(`آیا از ${action} این زمان‌بندی مطمئن هستید؟`)) return;

    const result = await api(`/api/doctor-schedules/${id}/toggle-active`, {
      method: "POST",
      body: JSON.stringify({ is_active: nextActive ? 1 : 0 })
    });

    await renderSchedules();
    toast(result.message || `زمان‌بندی ${nextActive ? "فعال" : "غیرفعال"} شد`);
  }

  async function hardDeleteSchedule(id) {
    if (!confirm("آیا این زمان‌بندی حذف شود؟ اگر رزرو داشته باشد برای حفظ سوابق فقط غیرفعال می‌شود.")) return;

    const result = await api(`/api/doctor-schedules/${id}/hard-delete`, {
      method: "POST"
    });

    await renderSchedules();
    toast(result.message || "عملیات حذف زمان‌بندی انجام شد");
  }

  function appointmentManagementUrl(appointmentId) {
    const basePath = location.pathname.includes("/clinic-manager/")
      ? "/dashboard/clinic-manager/appointments.html"
      : "/dashboard/admin/appointments.html";
    return `${basePath}?appointment_id=${encodeURIComponent(appointmentId)}`;
  }

  async function setSlotStatus(id, status) {
    const normalizedStatus = String(status || "").toLowerCase();
    if (!["available", "disabled"].includes(normalizedStatus)) {
      toast("فقط فعال/غیرفعال کردن نوبت مجاز است", "error");
      return;
    }

    const labels = {
      available: "فعال",
      disabled: "غیرفعال"
    };

    const confirmText = normalizedStatus === "available"
      ? "این نوبت فعال شود؟"
      : "این نوبت غیرفعال شود؟";

    if (!confirm(confirmText)) return;

    const result = await api(`/api/appointment-slots/${encodeURIComponent(id)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: normalizedStatus })
    });

    await renderSlots();
    toast(result.message || `نوبت ${labels[normalizedStatus]} شد`);
  }

  async function hardDeleteSlot(id) {
    if (!confirm("این نوبت حذف شود؟ اگر رزرو داشته باشد حذف نمی‌شود.")) return;

    const result = await api(`/api/appointment-slots/${encodeURIComponent(id)}/hard-delete`, {
      method: "POST"
    });

    state.selectedSlotIds.delete(String(id));
    await renderSlots();
    toast(result.message || "نوبت حذف شد");
  }

  async function cancelBookedAppointment(id) {
    if (!confirm("نوبت این بیمار لغو شود و ظرفیت آزاد شود؟")) return;

    const result = await api(`/api/appointments/${id}/cancel`, {
      method: "PATCH",
      body: JSON.stringify({ reason: "لغو از جدول ظرفیت نوبت‌ها" })
    });

    await renderSlots();
    toast(result.message || "نوبت بیمار لغو شد");
  }

  async function bulkDeleteSlots(mode) {
    let payload = { only_empty: true };

    if (mode === "selected") {
      const ids = Array.from(state.selectedSlotIds && state.selectedSlotIds.size ? state.selectedSlotIds : new Set(selectedValues(".slot-select")));
      if (!ids.length) return toast("حداقل یک نوبت را انتخاب کنید", "error");
      if (!confirm(`آیا ${ids.length} نوبت انتخاب‌شده حذف شود؟ نوبت‌های رزرو‌شده حذف نمی‌شوند.`)) return;
      payload.ids = ids;
    } else {
      const filters = slotFiltersPayload();
      const hasFilter = Object.values(filters).some(Boolean);
      const msg = hasFilter
        ? "همه نوبت‌های بدون رزرو مطابق فیلتر فعلی حذف شوند؟"
        : "هیچ فیلتری انتخاب نشده است. آیا واقعاً همه نوبت‌های بدون رزرو حذف شوند؟";
      if (!confirm(msg)) return;
      payload.scope = "filtered";
      payload.confirm_all = true;
      payload.filters = filters;
    }

    const result = await api("/api/appointment-slots/bulk-delete", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    state.selectedSlotIds.clear();
    await renderSlots();
    toast(result.message || "عملیات حذف نوبت‌ها انجام شد");
  }

  // Medical centers
  async function renderCenters() {
    const body = qs("#centersTableBody");
    if (!body) return;
    await loadCenters();
    if (!state.centers.length) {
      body.innerHTML = '<tr><td colspan="8" class="appt-empty">مرکزی ثبت نشده است.</td></tr>';
      return;
    }
    body.innerHTML = state.centers.map((c, index) => `
      <tr>
        <td>${faNum(index + 1)}</td>
        <td><strong>${escapeHtml(c.name)}</strong></td>
        <td>${escapeHtml(centerType(c.type))}</td>
        <td>${escapeHtml(c.province || "-")} / ${escapeHtml(c.city || "-")}</td>
        <td>${escapeHtml(c.phone ? faNum(c.phone) : "-")}</td>
        <td>${activeBadge(c.is_active)}</td>
        <td>${escapeHtml(c.address || "-")}</td>
        <td>
          <div class="appt-row-actions">
            <button class="appt-btn appt-btn-secondary" data-edit-center="${c.id}">ویرایش</button>
            <button class="appt-btn ${isActiveValue(c.is_active) ? "appt-btn-warning" : "appt-btn-success"}" data-toggle-center-active="${c.id}" data-next-active="${isActiveValue(c.is_active) ? "0" : "1"}">
              ${isActiveValue(c.is_active) ? "غیرفعال" : "فعال"}
            </button>
          </div>
        </td>
      </tr>
    `).join("");
  }

  function fillCenterForm(center) {
    state.editingId = center?.id || null;
    qs("#center_id").value = center?.id || "";
    qs("#center_name").value = center?.name || "";
    qs("#center_type").value = center?.type || "clinic";
    qs("#center_province").value = center?.province || "";
    qs("#center_city").value = center?.city || "";
    qs("#center_phone").value = center?.phone ? faNum(center.phone) : "";
    qs("#center_address").value = center?.address || "";
    qs("#center_description").value = center?.description || "";
    qs("#center_is_active").value = center?.is_active === false ? "0" : "1";
  }

  async function initCenters() {
    enhanceAppointmentFields();
    await renderCenters();
    bindForm("centerForm", async (fd, form) => {
      const data = {
        name: fd.get("name"),
        type: fd.get("type"),
        province: fd.get("province"),
        city: fd.get("city"),
        phone: normalizePhoneValue(fd.get("phone")),
        address: fd.get("address"),
        description: fd.get("description"),
        is_active: fd.get("is_active")
      };
      const id = fd.get("id");
      await api(id ? `/api/medical-centers/${id}` : "/api/medical-centers", {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify(data)
      });
      form.reset();
      fillCenterForm(null);
      syncAppointmentUiFields();
      await renderCenters();
      toast("مرکز درمانی ذخیره شد");
    });
    document.addEventListener("click", async (e) => {
      const edit = e.target.closest("[data-edit-center]");
      if (edit) {
        const c = state.centers.find((x) => String(x.id) === edit.dataset.editCenter);
        fillCenterForm(c);

        const formCard = qs("#centerForm")?.closest(".appt-card") || qs("#centerForm");
        if (formCard) {
          formCard.scrollIntoView({ behavior: "smooth", block: "start" });
          setTimeout(() => qs("#center_name")?.focus(), 320);
        }
      }
      const toggle = e.target.closest("[data-toggle-center-active]");
      if (toggle) {
        const nextActive = Number(toggle.dataset.nextActive || 0);
        const message = nextActive ? "این مرکز درمانی فعال شود؟" : "این مرکز درمانی غیرفعال شود؟";
        if (!confirm(message)) return;

        await api(`/api/medical-centers/${toggle.dataset.toggleCenterActive}`, {
          method: "PATCH",
          body: JSON.stringify({ is_active: nextActive })
        });
        await renderCenters();
        toast(nextActive ? "مرکز درمانی فعال شد" : "مرکز درمانی غیرفعال شد");
      }

      const del = e.target.closest("[data-delete-center]");
      if (del && confirm("این مرکز درمانی غیرفعال شود؟")) {
        await api(`/api/medical-centers/${del.dataset.deleteCenter}`, { method: "DELETE" });
        await renderCenters();
      }
      if (e.target.closest("#resetCenterForm")) fillCenterForm(null);
    });
  }

  // Services
  async function renderServices() {
    const body = qs("#servicesTableBody");
    if (!body) return;
    await loadServices();
    if (!state.services.length) {
      body.innerHTML = '<tr><td colspan="8" class="appt-empty">خدمتی ثبت نشده است.</td></tr>';
      return;
    }
    body.innerHTML = state.services.map((s, index) => `
      <tr>
        <td>${faNum(index + 1)}</td>
        <td><strong>${escapeHtml(s.name)}</strong><br><small class="appt-slug-label">نامک: <bdi>${escapeHtml(s.slug || "")}</bdi></small></td>
        <td>${escapeHtml(s.category || "-")}</td>
        <td>${escapeHtml(faNum(s.default_capacity || 1))}</td>
        <td>${escapeHtml(faNum(s.default_duration_minutes || 30))} دقیقه</td>
        <td>${activeBadge(s.is_active)}</td>
        <td>${escapeHtml(s.description || "-")}</td>
        <td>
          <div class="appt-row-actions">
            <button class="appt-btn appt-btn-secondary" data-edit-service="${s.id}">ویرایش</button>
            <button class="appt-btn ${isActiveValue(s.is_active) ? "appt-btn-warning" : "appt-btn-success"}" data-toggle-service-active="${s.id}" data-next-active="${isActiveValue(s.is_active) ? "0" : "1"}">
              ${isActiveValue(s.is_active) ? "غیرفعال" : "فعال"}
            </button>
          </div>
        </td>
      </tr>
    `).join("");
  }

  function fillServiceForm(service) {
    qs("#service_id").value = service?.id || "";
    qs("#service_name").value = service?.name || "";
    qs("#service_slug").value = service?.slug || "";
    qs("#service_category").value = service?.category || "";
    qs("#service_capacity").value = faNum(service?.default_capacity || 1);
    qs("#service_duration").value = faNum(service?.default_duration_minutes || 30);
    qs("#service_description").value = service?.description || "";
    qs("#service_is_active").value = service?.is_active === false ? "0" : "1";
  }

  async function initServices() {
    enhanceAppointmentFields();
    await renderServices();
    bindForm("serviceForm", async (fd, form) => {
      const data = {
        name: fd.get("name"),
        slug: fd.get("slug"),
        category: fd.get("category"),
        default_capacity: Number(normalizeNumericValue(fd.get("default_capacity") || 1)),
        default_duration_minutes: Number(normalizeNumericValue(fd.get("default_duration_minutes") || 30)),
        description: fd.get("description"),
        is_active: fd.get("is_active")
      };
      const id = fd.get("id");
      await api(id ? `/api/services/${id}` : "/api/services", {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify(data)
      });
      form.reset();
      fillServiceForm(null);
      syncAppointmentUiFields();
      await renderServices();
      toast("خدمت ذخیره شد");
    });
    document.addEventListener("click", async (e) => {
      const edit = e.target.closest("[data-edit-service]");
      if (edit) fillServiceForm(state.services.find((x) => String(x.id) === edit.dataset.editService));
      const toggle = e.target.closest("[data-toggle-service-active]");
      if (toggle) {
        const nextActive = toggle.dataset.nextActive === "1";
        if (confirm(`این خدمت ${nextActive ? "فعال" : "غیرفعال"} شود؟`)) {
          await api(`/api/services/${toggle.dataset.toggleServiceActive}`, {
            method: "PATCH",
            body: JSON.stringify({ is_active: nextActive ? 1 : 0 })
          });
          await renderServices();
          toast(`خدمت ${nextActive ? "فعال" : "غیرفعال"} شد`);
        }
      }
      if (e.target.closest("#resetServiceForm")) fillServiceForm(null);
    });
  }

  // Doctor centers
  async function loadDoctorCenters(doctorId) {
    if (!doctorId) return [];
    const data = await api(`/api/doctors/${doctorId}/medical-centers`);
    return asArray(data, ["centers", "medical_centers"]);
  }

  async function renderDoctorCenterChoices() {
    const doctorId = qs("#doctor_id")?.value;
    const box = qs("#doctorCentersList");
    if (!box) return;
    if (!doctorId) {
      box.innerHTML = '<div class="appt-empty">ابتدا پزشک را انتخاب کنید.</div>';
      return;
    }
    const selected = await loadDoctorCenters(doctorId);
    const selectedIds = new Set(selected.map((c) => String(c.id)));
    if (!state.centers.length) {
      box.innerHTML = '<div class="appt-empty">مرکز درمانی فعالی ثبت نشده است.</div>';
      return;
    }
    box.innerHTML = state.centers.map((c) => {
      const checked = selectedIds.has(String(c.id));
      const inactive = c.is_active === false || c.is_active === 0;
      return `
        <label class="appt-checkbox-item appt-center-choice${checked ? " checked" : ""}${inactive ? " is-inactive" : ""}">
          <input type="checkbox" name="medical_center_ids" value="${c.id}" ${checked ? "checked" : ""}>
          <span class="appt-center-choice-body">
            <strong>${escapeHtml(c.name)}</strong>
            <small>${escapeHtml(centerType(c.type))}${c.city ? " · " + escapeHtml(c.city) : ""}${inactive ? " · غیرفعال" : ""}</small>
          </span>
        </label>
      `;
    }).join("");
  }

  async function initDoctorCenters() {
    enhanceAppointmentFields();
    await loadLookups();
    await renderDoctorCenterChoices();
    qs("#doctor_id")?.addEventListener("change", renderDoctorCenterChoices);
    qs("#doctorCentersList")?.addEventListener("change", (e) => {
      const item = e.target.closest(".appt-center-choice");
      if (item && e.target.matches('input[type="checkbox"]')) item.classList.toggle("checked", e.target.checked);
    });
    bindForm("doctorCentersForm", async (fd) => {
      const doctorId = fd.get("doctor_id");
      if (!doctorId) throw new Error("انتخاب پزشک الزامی است");
      const checked = qsa('input[name="medical_center_ids"]:checked').map((x) => x.value);
      for (const center of state.centers) {
        const isChecked = checked.includes(String(center.id));
        const wasLinked = false; // API idempotent; deleting unchecked is safe
        if (isChecked) {
          await api(`/api/doctors/${doctorId}/medical-centers`, {
            method: "POST",
            body: JSON.stringify({ medical_center_id: center.id })
          });
        } else {
          await api(`/api/doctors/${doctorId}/medical-centers/${center.id}`, { method: "DELETE" }).catch(() => {});
        }
      }
      toast("ارتباط پزشک با مراکز درمانی ذخیره شد");
      await renderDoctorCenterChoices();
    });
  }

  // Schedules
  async function loadSchedules() {
    const params = new URLSearchParams();
    ["filter_doctor_id", "filter_center_id", "filter_service_id"].forEach((id) => {
      const val = qs(`#${id}`)?.value;
      if (val) params.set(id.replace("filter_", ""), val);
    });
    const data = await api(`/api/doctor-schedules${params.toString() ? "?" + params : ""}`);
    state.schedules = asArray(data, ["schedules"]);
  }

  async function renderSchedules() {
    const body = qs("#schedulesTableBody");
    if (!body) return;
    await loadSchedules();
    ensureScheduleBulkToolbar();
    if (!state.schedules.length) {
      body.innerHTML = '<tr><td colspan="11" class="appt-empty">زمان‌بندی ثبت نشده است.</td></tr>';
      return;
    }
    body.innerHTML = state.schedules.map((s, index) => `
      <tr data-id="${escapeHtml(s.id)}">
        <td>
          <label class="appt-row-check">
            <input type="checkbox" class="schedule-select" value="${escapeHtml(s.id)}"/>
            <span>${faNum(index + 1)}</span>
          </label>
        </td>
        <td>${escapeHtml(s.doctor_name || s.doctor_id)}</td>
        <td>${escapeHtml(s.medical_center_name || "-")}</td>
        <td>${escapeHtml(s.service_name || "-")}</td>
        <td>${escapeHtml(dayName(s.day_of_week))}</td>
        <td>${escapeHtml(faTime(s.start_time))} - ${escapeHtml(faTime(s.end_time))}</td>
        <td>${escapeHtml(faNum(s.slot_duration_minutes))} دقیقه</td>
        <td>${escapeHtml(faNum(s.capacity_per_slot))} نفر</td>
        <td>${escapeHtml(toJalaliDateView(s.start_date) || "-")} تا ${escapeHtml(toJalaliDateView(s.end_date) || "-")}</td>
        <td>${activeBadge(s.is_active)}</td>
        <td>
          <div class="appt-row-actions">
            <button class="appt-btn appt-btn-secondary" data-edit-schedule="${s.id}">✎ ویرایش</button>
            <button class="appt-btn ${isActiveValue(s.is_active) ? "appt-btn-warning" : "appt-btn-success"}" data-toggle-schedule-active="${s.id}" data-next-active="${isActiveValue(s.is_active) ? "0" : "1"}">
              ${isActiveValue(s.is_active) ? "غیرفعال" : "فعال"}
            </button>
            <button class="appt-btn appt-btn-danger" data-hard-delete-schedule="${s.id}">حذف</button>
          </div>
        </td>
      </tr>
    `).join("");
    removePanelInjectedDeleteButtons();
    setTimeout(removePanelInjectedDeleteButtons, 50);
    polishScheduleActionButtons();
    setTimeout(polishScheduleActionButtons, 50);
  }

  function fillScheduleForm(s) {
    qs("#schedule_id").value = s?.id || "";
    qs("#doctor_id").value = s?.doctor_id || "";
    qs("#medical_center_id").value = s?.medical_center_id || "";
    qs("#service_id").value = s?.service_id || "";
    qs("#day_of_week").value = s?.day_of_week ?? "0";
    qs("#start_time").value = normalizeTimeValue(s?.start_time || "09:00");
    qs("#end_time").value = normalizeTimeValue(s?.end_time || "12:00");
    qs("#slot_duration_minutes").value = faNum(s?.slot_duration_minutes || 30);
    qs("#capacity_per_slot").value = faNum(s?.capacity_per_slot || 1);
    qs("#start_date").value = toJalaliDateView(s?.start_date || new Date().toISOString().slice(0, 10));
    qs("#end_date").value = toJalaliDateView(s?.end_date || "");
    qs("#is_recurring").value = s?.is_recurring === false ? "0" : "1";
    qs("#is_active").value = s?.is_active === false ? "0" : "1";
    window.NVDate?.initFields?.();
    syncRecurringScheduleMode();
    syncAppointmentUiFields();
  }

  async function initSchedules() {
    enhanceAppointmentFields();
    await loadLookups();
    fillScheduleForm(null);
    await renderSchedules();
    ["filter_doctor_id", "filter_center_id", "filter_service_id"].forEach((id) => qs(`#${id}`)?.addEventListener("change", renderSchedules));
    qs("#is_recurring")?.addEventListener("change", syncRecurringScheduleMode);
    qs("#start_date")?.addEventListener("input", syncRecurringScheduleMode);
    qs("#start_date")?.addEventListener("change", syncRecurringScheduleMode);

    bindForm("scheduleForm", async (fd, form) => {
      const id = fd.get("id");
      const data = formDataObject(fd);
      delete data.id;
      const result = await api(id ? `/api/doctor-schedules/${id}` : "/api/doctor-schedules", {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify(data)
      });
      form.reset();
      fillScheduleForm(null);
      await renderSchedules();
      toast(`زمان‌بندی ذخیره شد و ${faNum(result?.generated_slots || 0)} نوبت تولید شد`);
    });

    qs("#service_id")?.addEventListener("change", () => {
      const service = state.services.find((s) => String(s.id) === qs("#service_id").value);
      if (service) {
        const capacityInput = qs("#capacity_per_slot");
        if (capacityInput && (!normalizeNumericValue(capacityInput.value) || normalizeNumericValue(capacityInput.value) === "0")) {
          capacityInput.value = faNum(1);
        }
        qs("#slot_duration_minutes").value = faNum(service.default_duration_minutes || 30);
        syncAppointmentUiFields();
      }
    });

    document.addEventListener("click", async (e) => {
      const edit = e.target.closest("[data-edit-schedule]");
      if (edit) fillScheduleForm(state.schedules.find((x) => String(x.id) === edit.dataset.editSchedule));
      const toggle = e.target.closest("[data-toggle-schedule-active]");
      if (toggle) {
        await toggleScheduleActive(toggle.dataset.toggleScheduleActive, toggle.dataset.nextActive === "1");
      }

      const hardDelete = e.target.closest("[data-hard-delete-schedule]");
      if (hardDelete) {
        await hardDeleteSchedule(hardDelete.dataset.hardDeleteSchedule);
      }
      if (e.target.closest("#selectAllSchedules")) {
        const checks = qsa(".schedule-select");
        const shouldCheck = checks.some((x) => !x.checked);
        checks.forEach((x) => x.checked = shouldCheck);
      }
      if (e.target.closest("#deleteSelectedSchedules")) await bulkDeleteSchedules("selected");
      if (e.target.closest("#deleteFilteredSchedules")) await bulkDeleteSchedules("filtered");
      if (e.target.closest("#resetScheduleForm")) fillScheduleForm(null);
      if (e.target.closest("#quickLinkDoctorCenter")) {
        const doctorId = qs("#doctor_id").value;
        const centerId = qs("#medical_center_id").value;
        if (!doctorId || !centerId) return toast("ابتدا پزشک و مرکز را انتخاب کنید", "error");
        await api(`/api/doctors/${doctorId}/medical-centers`, {
          method: "POST",
          body: JSON.stringify({ medical_center_id: centerId })
        });
        toast("پزشک به مرکز درمانی انتخاب‌شده متصل شد");
      }
    });
  }

  // Slots
  async function loadSlots() {
    const params = new URLSearchParams();
    params.set("expand_positions", "1");
    ["filter_doctor_id", "filter_center_id", "filter_service_id", "filter_status", "date_from", "date_to"].forEach((id) => {
      const val = qs(`#${id}`)?.value;
      if (val) {
        const key = id.replace("filter_center_id", "medical_center_id").replace("filter_doctor_id", "doctor_id").replace("filter_service_id", "service_id").replace("filter_status", "status");
        params.set(key, (id === "date_from" || id === "date_to") ? toGregorianDateInput(val) : val);
      }
    });
    const data = await api(`/api/appointment-slots${params.toString() ? "?" + params : ""}`);
    state.slots = asArray(data, ["slots"]);
    state.slotPositions = asArray(data, ["positions"]);
    // وضعیت‌های غیرفعال باید در جدول دیده شوند تا کاربر بتواند دوباره آن‌ها را فعال کند.
    // فقط موارد واقعاً حذف‌شده/آرشیوشده از نمایش پیش‌فرض کنار گذاشته می‌شوند.
    const selectedStatus = qs("#filter_status")?.value || "";
    if (!selectedStatus) {
      state.slots = state.slots.filter((s) => !["deleted", "archived"].includes(String(s.status || "").toLowerCase()));
      state.slotPositions = state.slotPositions.filter((s) => !["deleted", "archived"].includes(String(s.status || "").toLowerCase()));
    }
  }

  function renderSlotStats() {
    const slots = state.slots || [];
    const positions = state.slotPositions || [];
    const total = slots.length;
    const cap = slots.reduce((a, s) => a + Number(s.capacity || 0), 0);
    const booked = positions.filter((p) => p.is_booked || p.appointment_id).length;
    const remaining = Math.max(cap - booked, 0);
    const box = qs("#slotStats");
    if (!box) return;
    box.innerHTML = `
      <div class="appt-stat"><strong>${faNum(total)}</strong><span>تعداد ساعت‌ها</span></div>
      <div class="appt-stat"><strong>${faNum(cap)}</strong><span>تعداد جایگاه‌ها</span></div>
      <div class="appt-stat"><strong>${faNum(booked)}</strong><span>رزروشده</span></div>
      <div class="appt-stat"><strong>${faNum(remaining)}</strong><span>جایگاه آزاد</span></div>
    `;
  }

  async function renderSlots(reload = true) {
    const body = qs("#slotsTableBody");
    if (!body) return;
    if (reload) await loadSlots();
    renderSlotStats();
    ensureSlotBulkToolbar();

    const rows = getSlotRows();
    state.slotRows = rows;
    syncSlotSelectionWithRows(rows);

    const pageSize = Math.max(Number(state.slotPageSize || 10), 1);
    const totalPages = Math.max(Math.ceil(rows.length / pageSize), 1);
    state.slotPage = Math.min(Math.max(Number(state.slotPage || 1), 1), totalPages);
    const pageStart = (state.slotPage - 1) * pageSize;
    const pageRows = rows.slice(pageStart, pageStart + pageSize);
    renderSlotPagination(rows.length);

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="9" class="appt-empty">نوبتی پیدا نشد.</td></tr>';
      return;
    }

    body.innerHTML = pageRows.map((s, index) => {
      const isPosition = Boolean(s.slot_id || s.position_in_slot);
      const slotId = s.slot_id || s.id;
      const rowActionId = isPosition ? s.id : slotId;
      const booked = Boolean(s.is_booked || s.appointment_id);
      const queue = s.daily_queue_number || s.appointment_queue_number || "-";
      const slotStatus = String(s.status || s.source_slot?.status || "available").toLowerCase();
      const appointmentStatus = String(s.appointment_status || "").toLowerCase();

      const patient = booked
        ? `<div class="slot-patient"><strong>${escapeHtml(s.patient_name || "بیمار")}</strong>${s.patient_phone ? `<small>${escapeHtml(faNum(s.patient_phone))}</small>` : ""}</div>`
        : '<span class="slot-free">آزاد</span>';

      const statusHtml = booked
        ? statusBadge(appointmentStatus || "booked")
        : statusBadge(slotStatus || "available");

      let actionsHtml = "";
      if (booked && s.appointment_id) {
        actionsHtml = `<div class="slot-actions-menu">
          <button type="button" class="nv-row-action-btn nv-row-action-view" data-view-appointment="${escapeHtml(s.appointment_id)}">
            <span class="nv-row-action-dots">⋮</span>
            <span>مشاهده نوبت</span>
          </button>
        </div>`;
      } else {
        const canActivate = ["disabled", "inactive", "cancelled", "canceled"].includes(slotStatus);
        const nextStatus = canActivate ? "available" : "disabled";
        actionsHtml = `
          <div class="slot-actions-menu">
            <button type="button" class="nv-row-action-btn" data-action-menu-trigger aria-haspopup="true">
              <span class="nv-row-action-dots">⋮</span>
              <span>عملیات</span>
            </button>
            <div class="nv-row-action-menu" role="menu">
              <button type="button" role="menuitem" class="${canActivate ? "success" : "warning"}" data-slot-status="${escapeHtml(rowActionId)}" data-next-status="${nextStatus}">
                ${canActivate ? "فعال" : "غیرفعال"}
              </button>
              <button type="button" role="menuitem" class="danger" data-appt-delete-slot="${escapeHtml(rowActionId)}">حذف</button>
            </div>
          </div>
        `;
      }

      return `
        <tr data-id="${escapeHtml(rowActionId)}" data-slot-id="${escapeHtml(slotId)}" class="${booked ? "slot-position-booked" : "slot-position-free"}">
          <td>
            <label class="appt-row-check">
              <input type="checkbox" class="slot-select" value="${escapeHtml(rowActionId)}" data-slot-id="${escapeHtml(slotId)}" data-position-id="${escapeHtml(rowActionId)}" ${state.selectedSlotIds?.has(String(rowActionId)) ? "checked" : ""} ${booked ? "disabled" : ""}/>
              <span>${faNum(pageStart + index + 1)}</span>
            </label>
          </td>
          <td>${escapeHtml(toJalaliDateView(s.slot_date))}</td>
          <td>
            <div class="slot-time-stack">
              <span>${escapeHtml(faTime(s.start_time))} - ${escapeHtml(faTime(s.end_time))}</span>
              <small>شماره نوبت: ${escapeHtml(faNum(queue))}</small>
            </div>
          </td>
          <td>${escapeHtml(s.doctor_name || "-")}</td>
          <td>${escapeHtml(s.medical_center_name || "-")}</td>
          <td>${escapeHtml(s.service_name || "-")}</td>
          <td>${patient}</td>
          <td>${statusHtml}</td>
          <td>
            <div class="slot-status-actions">${actionsHtml}</div>
          </td>
        </tr>
      `;
    }).join("");

    removePanelInjectedDeleteButtons();
    setTimeout(removePanelInjectedDeleteButtons, 50);
  }
  async function initSlots() {
    enhanceAppointmentFields();
    await loadLookups();

    const today = new Date().toISOString().slice(0, 10);
    const nextMonth = addMonthsGregorian(today, 1);

    if (qs("#date_from") && !qs("#date_from").value) qs("#date_from").value = toJalaliDateView(today);
    if (qs("#date_to") && !qs("#date_to").value) qs("#date_to").value = toJalaliDateView(nextMonth);

    window.NVDate?.initFields?.();
    await renderSlots();
    qsa(".slot-filter").forEach((el) => el.addEventListener("change", () => {
      state.slotPage = 1;
      state.selectedSlotIds.clear();
      renderSlots();
    }));
    qs("#refreshSlots")?.addEventListener("click", () => {
      state.slotPage = 1;
      renderSlots();
    });

    document.addEventListener("change", (e) => {
      const slotCheck = e.target.closest?.(".slot-select");
      if (slotCheck) {
        if (slotCheck.checked) state.selectedSlotIds.add(String(slotCheck.value));
        else state.selectedSlotIds.delete(String(slotCheck.value));
        return;
      }

      if (e.target.closest?.("#slotPageSize")) {
        state.slotPageSize = Math.max(Number(e.target.value || 10), 1);
        state.slotPage = 1;
        renderSlots(false);
      }
    });

    document.addEventListener("click", async (e) => {
      if (e.target.closest("#selectAllSlots")) {
        const selectableIds = getSlotRows().filter((row) => !isSlotRowBooked(row)).map(slotRowKey);
        const shouldSelectAll = selectableIds.some((id) => !state.selectedSlotIds.has(String(id)));
        selectableIds.forEach((id) => {
          if (shouldSelectAll) state.selectedSlotIds.add(String(id));
          else state.selectedSlotIds.delete(String(id));
        });
        renderSlots(false);
        return;
      }

      const pageBtn = e.target.closest("[data-slot-page], [data-slot-page-action]");
      if (pageBtn) {
        e.preventDefault();
        const total = getSlotRows().length;
        const pageSize = Math.max(Number(state.slotPageSize || 10), 1);
        const totalPages = Math.max(Math.ceil(total / pageSize), 1);
        const action = pageBtn.dataset.slotPageAction;
        if (pageBtn.dataset.slotPage) setSlotPage(Number(pageBtn.dataset.slotPage));
        else if (action === "first") setSlotPage(1);
        else if (action === "prev") setSlotPage(state.slotPage - 1);
        else if (action === "next") setSlotPage(state.slotPage + 1);
        else if (action === "last") setSlotPage(totalPages);
        return;
      }

      if (e.target.closest("#deleteSelectedSlots")) await bulkDeleteSlots("selected");
      if (e.target.closest("#deleteFilteredSlots")) await bulkDeleteSlots("filtered");

      const viewAppt = e.target.closest("[data-view-appointment]");
      if (viewAppt) {
        e.preventDefault();
        const id = viewAppt.dataset.viewAppointment;
        if (id) window.location.href = appointmentManagementUrl(id);
        return;
      }

      const statusBtn = e.target.closest("[data-slot-status]");
      if (statusBtn) {
        e.preventDefault();
        const id = statusBtn.dataset.slotStatus;
        const status = statusBtn.dataset.nextStatus;
        if (id && status) await setSlotStatus(id, status);
        return;
      }

      const cancelAppt = e.target.closest("[data-cancel-appointment]");
      if (cancelAppt) {
        e.preventDefault();
        const id = cancelAppt.dataset.cancelAppointment;
        if (id) await cancelBookedAppointment(id);
        return;
      }

      const del = e.target.closest("[data-appt-delete-slot]");
      if (del) {
        e.preventDefault();
        const id = del.dataset.apptDeleteSlot;
        if (!id) return;
        await hardDeleteSlot(id);
      }
    });
  }

  async function init() {
    try {
      if (page === "centers") await initCenters();
      if (page === "services") await initServices();
      if (page === "doctor-centers") await initDoctorCenters();
      if (page === "schedules") await initSchedules();
      if (page === "slots") await initSlots();
      enhanceAppointmentFields();
      syncAppointmentUiFields();
    } catch (error) {
      console.error(error);
      toast(error.message || "خطا در بارگذاری صفحه", "error");
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
