// NOORVISTA Appointments V2
// Guided booking wizard: patient + service + doctor + center + real available capacity
(function () {
  if (window.__NOORVISTA_APPOINTMENTS_V2__) return;
  window.__NOORVISTA_APPOINTMENTS_V2__ = true;

  const state = {
    services: [],
    patients: [],
    availableSlots: [],
    selectedPatientId: "",
    selectedServiceId: "",
    selectedDoctorId: "",
    selectedCenterId: "",
    selectedSlot: null,
    patientMode: "existing",
    patientQuery: "",
    dateFrom: "",
    dateTo: "",
    currentStep: 1,
    autoAdvanceTimer: null,
    patientSearchTimer: null,
    newPatientTimer: null,
    autoSelecting: false
  };

  const faDigits = "۰۱۲۳۴۵۶۷۸۹";
  const arDigits = "٠١٢٣٤٥٦٧٨٩";

  function qs(sel, root = document) { return root.querySelector(sel); }
  function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

  function toFa(value) {
    return String(value ?? "").replace(/\d/g, d => faDigits[Number(d)]);
  }

  function toEn(value) {
    return String(value ?? "")
      .replace(/[۰-۹]/g, d => String(faDigits.indexOf(d)))
      .replace(/[٠-٩]/g, d => String(arDigits.indexOf(d)));
  }

  function normalizeSearch(value) {
    return toEn(value)
      .replace(/[ي]/g, "ی")
      .replace(/[ك]/g, "ک")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function localizeUserMessage(message, fallback = "خطایی رخ داد. لطفاً دوباره تلاش کنید.") {
    const text = String(message || "").trim();
    if (!text) return fallback;
    const lower = text.toLowerCase();
    if (lower.includes("cancelled") && lower.includes("confirmed")) {
      return "تغییر وضعیت نوبت لغوشده به تأییدشده مجاز نیست؛ برای جلوگیری از ناسازگاری ظرفیت و پرداخت، یک نوبت جدید ثبت کنید.";
    }
    if (lower.includes("too many requests") || lower.includes("rate limit")) {
      return "تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.";
    }
    if (lower.includes("database migrations are incomplete") || lower.includes("migration required")) {
      return "به‌روزرسانی پایگاه داده کامل نشده است. مدیر سامانه باید مهاجرت‌های پایگاه داده را اجرا کند.";
    }
    if (lower.includes("internal server error")) return "خطای داخلی سرور رخ داد. لطفاً دوباره تلاش کنید.";
    if (lower.includes("not found")) return "اطلاعات موردنظر پیدا نشد.";
    if (lower.includes("unauthorized") || lower.includes("authentication required")) return "نشست شما معتبر نیست. لطفاً دوباره وارد شوید.";
    if (/^[\x00-\x7F]+$/.test(text)) return fallback;
    return text;
  }

  function cleanPhone(value) {
    return toEn(value).replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    })[ch]);
  }

  function normalizeIsoDate(value) {
    const text = String(value || "");
    return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : text;
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function addMonthsISO(iso, months) {
    const d = new Date(iso + "T00:00:00");
    d.setMonth(d.getMonth() + months);
    return d.toISOString().slice(0, 10);
  }

  function jalaliView(value) {
    const iso = normalizeIsoDate(value);
    if (!iso) return "-";
    if (window.toJalaliDateString) return toFa(window.toJalaliDateString(iso));
    try {
      return toFa(new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
        year: "numeric", month: "2-digit", day: "2-digit"
      }).format(new Date(iso + "T00:00:00")));
    } catch (_) {
      return toFa(iso);
    }
  }

  function timeView(value) {
    return toFa(String(value || "").slice(0, 5));
  }

  function moneyView(value) {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount) || amount <= 0) return "تعرفه تعیین نشده";
    return `${toFa(Math.round(amount).toLocaleString("en-US"))} تومان`;
  }


  function insuranceMode(item) {
    return String(item?.supplementary_insurance_payment_mode || 'none').toLowerCase().replace(/[\s-]+/g, '_');
  }
  function truthyFlag(value, defaultValue = false) {
    if (value === undefined || value === null || value === '') return defaultValue;
    if (value === true || value === 1) return true;
    if (value === false || value === 0) return false;
    return ['1', 'true', 'yes', 'on', 'enabled', 'فعال'].includes(String(value).trim().toLowerCase());
  }
  function hasInsurancePolicy(item) { return truthyFlag(item?.supplementary_insurance_enabled, false); }
  function insuranceRequiresReview(item) { return truthyFlag(item?.supplementary_insurance_requires_review, false); }
  function insuranceInput() {
    return {
      has: qs('#appointmentHasSupplementaryInsurance')?.checked || false,
      provider: (qs('#appointmentInsuranceProvider')?.value || '').trim(),
      number: (qs('#appointmentInsuranceNumber')?.value || '').trim(),
      note: (qs('#appointmentInsuranceNote')?.value || '').trim()
    };
  }
  function payableWithInsurance(amount, source, hasInsurance) {
    const original = Math.max(0, Number(amount || 0));
    if (!hasInsurance || !hasInsurancePolicy(source) || original <= 0) return { original, payable: original, remaining: 0, applied: false };
    const mode = insuranceMode(source);
    let payable = original;
    if (['waive', 'zero', 'free', 'no_online_payment', 'review'].includes(mode)) payable = 0;
    else if (['fixed', 'fixed_amount', 'reduced_fixed'].includes(mode)) payable = Math.min(original, Math.max(0, Number(source.supplementary_insurance_amount || 0)));
    else if (['percent', 'percentage', 'reduced_percent'].includes(mode)) payable = Math.round(original * Math.max(0, Math.min(100, Number(source.supplementary_insurance_percent || 0))) / 100);
    return { original, payable, remaining: Math.max(0, original - payable), applied: true };
  }
  function syncInsuranceFields() {
    const source = state.selectedSlot || selectedService();
    const allowed = hasInsurancePolicy(source);
    const box = qs('.nv-staff-insurance-box');
    const checkbox = qs('#appointmentHasSupplementaryInsurance');
    const details = qs('[data-appointment-insurance-details]');
    if (box) box.hidden = !allowed;
    if (!allowed) {
      if (checkbox) checkbox.checked = false;
      if (details) details.hidden = true;
    } else if (details) {
      details.hidden = !insuranceInput().has;
    }
    renderFinalReview();
    renderWizard(false);
  }

  function apiHeaders() {
    return { "Content-Type": "application/json", "Accept": "application/json" };
  }

  async function api(url, options = {}) {
    const res = await fetch(url, {
      ...options,
      headers: { ...apiHeaders(), ...(options.headers || {}) }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(localizeUserMessage(data.message, `خطای سرور با کد ${toFa(res.status)} رخ داد.`));
    }
    return data;
  }

  function asArray(data, keys) {
    if (Array.isArray(data)) return data;
    for (const key of keys) {
      if (Array.isArray(data?.[key])) return data[key];
      if (Array.isArray(data?.data?.[key])) return data.data[key];
    }
    return [];
  }

  function slotCapacity(slot) {
    return Math.max(0, Number(slot?.remaining_capacity || 0));
  }

  function isSelectableSlot(slot) {
    return slotCapacity(slot) > 0 && String(slot?.status || "available") === "available";
  }

  function patientName(patient) {
    return patient?.full_name || patient?.name || patient?.username || patient?.patient_name || "بیمار";
  }

  function patientPhone(patient) {
    return patient?.phone || patient?.mobile || patient?.patient_phone || "";
  }

  function patientNationalCode(patient) {
    return patient?.national_code || patient?.nationalCode || "";
  }

  function selectedPatient() {
    return state.patients.find(item => String(item.id) === String(state.selectedPatientId || qs("#patientId")?.value || ""));
  }

  function getPatientMatches() {
    const query = normalizeSearch(state.patientQuery);
    if (!query) return state.patients.slice(0, 12);
    return state.patients.filter(patient => {
      const haystack = normalizeSearch([
        patientName(patient),
        patientPhone(patient),
        patientNationalCode(patient),
        patient?.email || ""
      ].join(" "));
      return haystack.includes(query);
    }).slice(0, 30);
  }

  async function loadPatients() {
    const endpoints = ["/api/clinic/patients", "/api/patients", "/api/admin/patients"];
    for (const url of endpoints) {
      try {
        const data = await api(url);
        const patients = asArray(data, ["patients", "items", "data"]);
        if (patients.length) {
          state.patients = patients;
          return;
        }
      } catch (_) {}
    }

    if (Array.isArray(window.patientsList) && window.patientsList.length) {
      state.patients = window.patientsList;
    }
  }

  async function loadServices() {
    const params = new URLSearchParams();
    params.set("summary", "service");
    params.set("date_from", state.dateFrom || todayISO());
    params.set("date_to", state.dateTo || addMonthsISO(todayISO(), 1));

    try {
      const data = await api(`/api/appointment-slots/available?${params.toString()}`);
      state.services = asArray(data, ["services"])
        .map(service => ({
          ...service,
          available_count: Number(service.available_count || 0),
          available_slot_count: Number(service.available_slot_count || 0),
          first_available_date: normalizeIsoDate(service.first_available_date),
          minimum_fee: Number(service.minimum_fee || service.default_fee || 0),
          maximum_fee: Number(service.maximum_fee || service.minimum_fee || service.default_fee || 0)
        }))
        .filter(service => service.available_count > 0);
      return;
    } catch (_) {
      // Compatibility fallback for installations that have not yet loaded the summary route.
    }

    const [servicesData, slotsData] = await Promise.all([
      api("/api/services?include_inactive=0"),
      api(`/api/appointment-slots/available?date_from=${encodeURIComponent(state.dateFrom || todayISO())}&date_to=${encodeURIComponent(state.dateTo || addMonthsISO(todayISO(), 1))}&limit=1000`)
    ]);
    const slots = asArray(slotsData, ["slots"]).filter(isSelectableSlot);
    const counts = new Map();
    const firstDates = new Map();
    slots.forEach(slot => {
      const key = String(slot.service_id);
      counts.set(key, (counts.get(key) || 0) + slotCapacity(slot));
      const date = normalizeIsoDate(slot.slot_date);
      if (!firstDates.has(key) || date < firstDates.get(key)) firstDates.set(key, date);
    });
    state.services = asArray(servicesData, ["services"])
      .map(service => ({
        ...service,
        available_count: counts.get(String(service.id)) || 0,
        first_available_date: firstDates.get(String(service.id)) || "",
        minimum_fee: Number(service.default_fee || 0),
        maximum_fee: Number(service.default_fee || 0)
      }))
      .filter(service => service.available_count > 0);
  }

  async function loadAvailableSlots() {
    if (!state.selectedServiceId) {
      state.availableSlots = [];
      return;
    }

    const params = new URLSearchParams();
    params.set("service_id", state.selectedServiceId);
    params.set("date_from", state.dateFrom || todayISO());
    params.set("date_to", state.dateTo || addMonthsISO(todayISO(), 1));
    params.set("limit", "1000");

    const data = await api(`/api/appointment-slots/available?${params.toString()}`);
    state.availableSlots = asArray(data, ["slots"]).filter(isSelectableSlot);
  }

  function aggregateSlots(items, idKey, nameKey) {
    const map = new Map();
    items.filter(isSelectableSlot).forEach(slot => {
      const id = slot?.[idKey];
      if (id === undefined || id === null || id === "") return;
      const key = String(id);
      const current = map.get(key) || {
        id,
        name: slot?.[nameKey] || "-",
        availableCount: 0,
        slotCount: 0,
        firstDate: normalizeIsoDate(slot.slot_date),
        firstTime: String(slot.start_time || ""),
        minimumFee: Number(slot.appointment_fee || 0),
        maximumFee: Number(slot.appointment_fee || 0)
      };
      current.availableCount += slotCapacity(slot);
      current.slotCount += 1;
      const fee = Number(slot.appointment_fee || 0);
      if (fee > 0 && (!current.minimumFee || fee < current.minimumFee)) current.minimumFee = fee;
      if (fee > current.maximumFee) current.maximumFee = fee;
      const candidate = `${normalizeIsoDate(slot.slot_date)} ${String(slot.start_time || "")}`;
      const existing = `${current.firstDate} ${current.firstTime}`;
      if (!existing.trim() || candidate < existing) {
        current.firstDate = normalizeIsoDate(slot.slot_date);
        current.firstTime = String(slot.start_time || "");
      }
      map.set(key, current);
    });
    return Array.from(map.values()).sort((a, b) => {
      const aFirst = `${a.firstDate} ${a.firstTime}`;
      const bFirst = `${b.firstDate} ${b.firstTime}`;
      return aFirst.localeCompare(bFirst) || String(a.name).localeCompare(String(b.name), "fa");
    });
  }

  function getDoctorsFromSlots() {
    return aggregateSlots(
      state.availableSlots.filter(slot => String(slot.service_id) === String(state.selectedServiceId)),
      "doctor_id",
      "doctor_name"
    );
  }

  function getCentersFromSlots() {
    return aggregateSlots(
      state.availableSlots
        .filter(slot => String(slot.service_id) === String(state.selectedServiceId))
        .filter(slot => String(slot.doctor_id) === String(state.selectedDoctorId)),
      "medical_center_id",
      "medical_center_name"
    );
  }

  function getSelectableSlots() {
    return state.availableSlots
      .filter(isSelectableSlot)
      .filter(slot => String(slot.service_id) === String(state.selectedServiceId))
      .filter(slot => String(slot.doctor_id) === String(state.selectedDoctorId))
      .filter(slot => String(slot.medical_center_id) === String(state.selectedCenterId))
      .sort((a, b) => `${normalizeIsoDate(a.slot_date)} ${a.start_time}`.localeCompare(`${normalizeIsoDate(b.slot_date)} ${b.start_time}`));
  }

  function selectedService() {
    return state.services.find(service => String(service.id) === String(state.selectedServiceId));
  }

  function selectedDoctorName() {
    return getDoctorsFromSlots().find(doctor => String(doctor.id) === String(state.selectedDoctorId))?.name
      || state.selectedSlot?.doctor_name
      || "-";
  }

  function selectedCenterName() {
    return getCentersFromSlots().find(center => String(center.id) === String(state.selectedCenterId))?.name
      || state.selectedSlot?.medical_center_name
      || "-";
  }

  function setStatus(text, type = "info") {
    const el = qs("#nvBookingStatus");
    if (!el) return;
    el.className = `nv-empty-state nv-status-${type}`;
    el.textContent = text;
  }

  function selectedSummary() {
    const el = qs("#nvSelectedSummary");
    if (!el) return;

    const patient = selectedPatient();
    const patientValue = state.patientMode === "existing"
      ? (state.selectedPatientId ? patientName(patient) : "")
      : (qs("#nvPatientName")?.value?.trim() || "");
    const service = selectedService();
    const slot = state.selectedSlot;

    const selections = [
      patientValue ? { icon: "icon-user", label: "بیمار", value: patientValue } : null,
      state.selectedServiceId ? { icon: "icon-list", label: "خدمت", value: slot?.service_name || service?.name || "-" } : null,
      state.selectedDoctorId ? { icon: "icon-user-md", label: "پزشک", value: slot?.doctor_name || selectedDoctorName() } : null,
      state.selectedCenterId ? { icon: "icon-medkit", label: "مرکز", value: slot?.medical_center_name || selectedCenterName() } : null,
      slot ? { icon: "icon-calendar", label: "زمان", value: `${jalaliView(slot.slot_date)}، ${timeView(slot.start_time)}` } : null,
      slot ? { icon: "icon-credit-card", label: "مبلغ", value: moneyView(slot.appointment_fee) } : null
    ].filter(Boolean);

    if (!selections.length) {
      el.className = "nv-selected-summary empty";
      el.innerHTML = '<span class="nv-selection-empty">انتخاب‌های شما در این بخش نمایش داده می‌شوند.</span>';
      return;
    }

    el.className = "nv-selected-summary";
    el.innerHTML = `
      <div class="nv-selection-trail-head">
        <strong>انتخاب‌های انجام‌شده</strong>
        <small>برای اصلاح هر مورد، از مرحله‌های بالا یا دکمه «مرحله قبل» استفاده کنید.</small>
      </div>
      <div class="nv-selection-trail">
        ${selections.map(item => `
          <span class="nv-selection-chip">
            <i class="${escapeHtml(item.icon)}" aria-hidden="true"></i>
            <small>${escapeHtml(item.label)}</small>
            <strong>${escapeHtml(item.value)}</strong>
          </span>
        `).join("")}
        ${slot ? `<span class="nv-selection-capacity">${toFa(slotCapacity(slot))} ظرفیت باقی‌مانده</span>` : ""}
      </div>
    `;
  }

  function renderPatientSelect() {
    const select = qs("#patientId");
    if (!select) return;
    // Keep the native value stable for older integrations while the visible UI
    // uses searchable patient cards.
    const selectedPatientId = String(select.value || "");
    const selectedId = String(state.selectedPatientId || selectedPatientId || "");
    select.innerHTML = '<option value="">انتخاب بیمار...</option>';
    state.patients.forEach(patient => {
      select.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(patient.id)}">${escapeHtml(patientName(patient))}</option>`);
    });
    if (selectedId && Array.from(select.options).some(option => option.value === selectedId)) {
      select.value = selectedId;
      state.selectedPatientId = selectedId;
    }
    if (!state.selectedPatientId && selectedPatientId) {
      select.value = selectedPatientId;
      state.selectedPatientId = selectedPatientId;
    }
    window.NVPrettySelects?.sync?.(select);
  }

  function renderPatientResults() {
    const root = qs("#nvPatientResults");
    if (!root) return;
    const matches = getPatientMatches();
    const query = normalizeSearch(state.patientQuery);

    if (!state.patients.length) {
      root.innerHTML = '<div class="nv-empty-state">بیماری برای انتخاب پیدا نشد. از تب «بیمار جدید» استفاده کنید.</div>';
      return;
    }

    if (!matches.length) {
      root.innerHTML = '<div class="nv-empty-state">بیماری با این نام، موبایل یا کد ملی پیدا نشد.</div>';
      return;
    }

    const title = query ? `${toFa(matches.length)} نتیجه` : "بیماران اخیر";
    root.innerHTML = `
      <div class="nv-patient-results-meta"><span>${title}</span><small>برای انتخاب روی بیمار کلیک کنید.</small></div>
      <div class="nv-patient-card-list">
        ${matches.map(patient => {
          const id = String(patient.id);
          const phone = patientPhone(patient);
          const nationalCode = patientNationalCode(patient);
          const count = Number(patient.appointment_count || 0);
          return `
            <button type="button" class="nv-patient-card ${id === String(state.selectedPatientId) ? "active" : ""}" data-patient-id="${escapeHtml(id)}">
              <span class="nv-patient-avatar">${escapeHtml(patientName(patient).trim().slice(0, 1) || "ب")}</span>
              <span class="nv-patient-card-copy">
                <strong>${escapeHtml(patientName(patient))}</strong>
                <small>${phone ? `موبایل: ${escapeHtml(toFa(phone))}` : "بدون شماره موبایل"}${nationalCode ? ` · کد ملی: ${escapeHtml(toFa(nationalCode))}` : ""}</small>
              </span>
              <span class="nv-patient-appointments">${toFa(count)} نوبت</span>
            </button>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderServices() {
    const root = qs("#nvServiceOptions");
    if (!root) return;

    if (!state.services.length) {
      root.innerHTML = '<div class="nv-empty-state">در بازه انتخاب‌شده، خدمت دارای نوبت خالی پیدا نشد.</div>';
      return;
    }

    root.innerHTML = state.services.map(service => `
      <button type="button" class="nv-option-card ${String(service.id) === String(state.selectedServiceId) ? "active" : ""}" data-service-id="${escapeHtml(service.id)}">
        <strong>${escapeHtml(service.name)}</strong>
        <small>${escapeHtml(service.description || "انتخاب این خدمت برای مشاهده پزشکان دارای نوبت آزاد")}</small>
        <span class="badge-row">
          <span class="nv-mini-badge nv-capacity-badge">${toFa(service.available_count || 0)} نوبت خالی</span>
          ${service.first_available_date ? `<span class="nv-mini-badge">نزدیک‌ترین: ${jalaliView(service.first_available_date)}</span>` : ""}
          <span class="nv-mini-badge">${toFa(service.default_duration_minutes || 30)} دقیقه</span>
          <span class="nv-mini-badge nv-fee-badge">${service.minimum_fee && service.maximum_fee && service.minimum_fee !== service.maximum_fee ? `از ${moneyView(service.minimum_fee)} تا ${moneyView(service.maximum_fee)}` : moneyView(service.minimum_fee || service.default_fee || 0)}</span>
        </span>
      </button>
    `).join("");
  }

  function renderDoctors() {
    const root = qs("#nvDoctorOptions");
    if (!root) return;

    if (!state.selectedServiceId) {
      root.innerHTML = '<div class="nv-empty-state">ابتدا خدمت را انتخاب کنید.</div>';
      return;
    }

    const doctors = getDoctorsFromSlots();
    if (!doctors.length) {
      root.innerHTML = '<div class="nv-empty-state">برای این خدمت در بازه انتخاب‌شده پزشک دارای نوبت آزاد پیدا نشد.</div>';
      return;
    }

    root.innerHTML = doctors.map(doctor => `
      <button type="button" class="nv-option-card ${String(doctor.id) === String(state.selectedDoctorId) ? "active" : ""}" data-doctor-id="${escapeHtml(doctor.id)}">
        <strong>${escapeHtml(doctor.name)}</strong>
        <small>نزدیک‌ترین نوبت: ${jalaliView(doctor.firstDate)} ساعت ${timeView(doctor.firstTime)}</small>
        <span class="badge-row"><span class="nv-mini-badge nv-capacity-badge">${toFa(doctor.availableCount)} نوبت خالی</span><span class="nv-mini-badge nv-fee-badge">${doctor.minimumFee && doctor.maximumFee && doctor.minimumFee !== doctor.maximumFee ? `از ${moneyView(doctor.minimumFee)} تا ${moneyView(doctor.maximumFee)}` : moneyView(doctor.minimumFee || 0)}</span></span>
      </button>
    `).join("");
  }

  function renderCenters() {
    const root = qs("#nvCenterOptions");
    if (!root) return;

    if (!state.selectedDoctorId) {
      root.innerHTML = '<div class="nv-empty-state">ابتدا پزشک را انتخاب کنید.</div>';
      return;
    }

    const centers = getCentersFromSlots();
    if (!centers.length) {
      root.innerHTML = '<div class="nv-empty-state">برای این پزشک و خدمت، مرکز دارای نوبت آزاد پیدا نشد.</div>';
      return;
    }

    root.innerHTML = centers.map(center => `
      <button type="button" class="nv-option-card ${String(center.id) === String(state.selectedCenterId) ? "active" : ""}" data-center-id="${escapeHtml(center.id)}">
        <strong>${escapeHtml(center.name)}</strong>
        <small>نزدیک‌ترین نوبت: ${jalaliView(center.firstDate)} ساعت ${timeView(center.firstTime)}</small>
        <span class="badge-row"><span class="nv-mini-badge nv-capacity-badge">${toFa(center.availableCount)} نوبت خالی</span><span class="nv-mini-badge nv-fee-badge">${center.minimumFee && center.maximumFee && center.minimumFee !== center.maximumFee ? `از ${moneyView(center.minimumFee)} تا ${moneyView(center.maximumFee)}` : moneyView(center.minimumFee || 0)}</span></span>
      </button>
    `).join("");
  }

  function renderSlots() {
    const root = qs("#nvSlotList");
    if (!root) return;

    if (!state.selectedCenterId) {
      root.innerHTML = '<div class="nv-empty-state">ابتدا مرکز درمانی را انتخاب کنید.</div>';
      return;
    }

    const slots = getSelectableSlots();
    if (!slots.length) {
      root.innerHTML = '<div class="nv-empty-state">در این بازه نوبت آزادی برای ترکیب انتخاب‌شده وجود ندارد.</div>';
      return;
    }

    const groups = new Map();
    slots.forEach(slot => {
      const key = normalizeIsoDate(slot.slot_date);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(slot);
    });

    root.innerHTML = Array.from(groups.entries()).map(([date, items]) => `
      <div class="nv-slot-day">
        <div class="nv-slot-day-title">${jalaliView(date)}</div>
        <div class="nv-slot-buttons">
          ${items.map(slot => `
            <button type="button" class="nv-slot-btn ${state.selectedSlot && String(state.selectedSlot.id) === String(slot.id) ? "active" : ""}" data-slot-id="${escapeHtml(slot.id)}">
              <span>${timeView(slot.start_time)} تا ${timeView(slot.end_time)}</span>
              <small>باقی‌مانده: ${toFa(slotCapacity(slot))} از ${toFa(slot.capacity || 0)} · ${moneyView(slot.appointment_fee)}</small>
            </button>
          `).join("")}
        </div>
      </div>
    `).join("");
  }

  function renderFinalReview() {
    const root = qs("#nvFinalReview");
    if (!root) return;
    const slot = state.selectedSlot;
    if (!slot) {
      root.innerHTML = '<div class="nv-empty-state">برای نمایش خلاصه نهایی، ابتدا یک نوبت آزاد انتخاب کنید.</div>';
      return;
    }

    const patient = selectedPatient();
    const patientLabel = state.patientMode === "existing"
      ? patientName(patient)
      : (qs("#nvPatientName")?.value?.trim() || "بیمار جدید");
    const patientPhoneLabel = state.patientMode === "existing"
      ? patientPhone(patient)
      : cleanPhone(qs("#nvPatientPhone")?.value || "");

    const insurance = insuranceInput();
    const payment = payableWithInsurance(slot.appointment_fee, slot, insurance.has);
    const rows = [
      ["بیمار", patientLabel, patientPhoneLabel ? toFa(patientPhoneLabel) : ""],
      ["خدمت", slot.service_name || selectedService()?.name || "-", ""],
      ["پزشک", slot.doctor_name || selectedDoctorName(), ""],
      ["مرکز درمانی", slot.medical_center_name || selectedCenterName(), ""],
      ["تاریخ", jalaliView(slot.slot_date), ""],
      ["ساعت", `${timeView(slot.start_time)} تا ${timeView(slot.end_time)}`, ""],
      ["هزینه اصلی", moneyView(payment.original), ""],
      ["پرداخت هنگام دریافت", payment.payable > 0 ? moneyView(payment.payable) : "بدون پرداخت آنلاین", payment.applied ? "مبلغ نهایی پس از بررسی بیمه در کلینیک مشخص می‌شود" : "مبلغ نهایی هنگام ثبت در پرونده نوبت ذخیره می‌شود"]
    ];

    root.innerHTML = `
      <div class="nv-final-review-head">
        <div><strong>مرور نهایی نوبت</strong><span>اطلاعات را بررسی کنید؛ ثبت فقط با دکمه «ثبت نوبت» انجام می‌شود.</span></div>
        <span class="nv-final-review-capacity">${toFa(slotCapacity(slot))} ظرفیت باقی‌مانده</span>
      </div>
      <div class="nv-final-review-grid">
        ${rows.map(([label, value, meta]) => `
          <div class="nv-final-review-item ${label === "بیمار" ? "is-primary" : ""}"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong>${meta ? `<span>${escapeHtml(meta)}</span>` : ""}</div>
        `).join("")}
      </div>
    `;
  }

  const wizardStepLabels = [
    "بیمار",
    "خدمت",
    "پزشک",
    "مرکز درمانی",
    "زمان نوبت",
    "تکمیل و ثبت"
  ];

  function modalBody() {
    return qs("#appointmentFormModal .modal-body");
  }

  function modalIsOpen() {
    const modal = qs("#appointmentFormModal");
    return Boolean(modal && (
      modal.classList.contains("show") ||
      modal.classList.contains("active") ||
      modal.getAttribute("aria-hidden") === "false"
    ));
  }

  function validateWizardStep(step, notify = false) {
    let message = "";

    if (step === 1) {
      if (state.patientMode === "existing") {
        if (!state.selectedPatientId && !qs("#patientId")?.value) message = "لطفاً بیمار را انتخاب کنید.";
      } else {
        const name = qs("#nvPatientName")?.value?.trim();
        const phone = cleanPhone(qs("#nvPatientPhone")?.value || "");
        if (!name) message = "نام و نام خانوادگی بیمار جدید را وارد کنید.";
        else if (!/^09\d{9}$/.test(phone)) message = "شماره تماس بیمار را به‌صورت ۱۱ رقمی وارد کنید.";
      }
    } else if (step === 2 && !state.selectedServiceId) {
      message = "لطفاً خدمت مورد نظر را انتخاب کنید.";
    } else if (step === 3 && !state.selectedDoctorId) {
      message = "لطفاً پزشک را انتخاب کنید.";
    } else if (step === 4 && !state.selectedCenterId) {
      message = "لطفاً مرکز درمانی را انتخاب کنید.";
    } else if (step === 5 && !state.selectedSlot) {
      message = "لطفاً یکی از نوبت‌های آزاد را انتخاب کنید.";
    }

    if (message && notify) {
      if (window.showToast) window.showToast(message, "warning");
      else alert(message);
    }
    return !message;
  }

  function highestAccessibleStep() {
    let highest = 1;
    for (let step = 1; step < 6; step += 1) {
      if (!validateWizardStep(step, false)) break;
      highest = step + 1;
    }
    return highest;
  }

  function updateWizardSummaryVisibility() {
    const summary = qs("#nvSelectedSummary");
    if (!summary) return;
    const hasPatient = state.patientMode === "existing"
      ? Boolean(state.selectedPatientId)
      : Boolean(qs("#nvPatientName")?.value?.trim());
    const hasUsefulSelection = Boolean(hasPatient || state.selectedServiceId || state.selectedDoctorId || state.selectedCenterId || state.selectedSlot);
    summary.hidden = !hasUsefulSelection || state.currentStep === 1 || state.currentStep === 6;
  }

  function renderWizard(scrollToTop = false) {
    const form = qs("#appointmentForm");
    if (!form) return;

    const current = Math.min(6, Math.max(1, Number(state.currentStep) || 1));
    state.currentStep = current;
    const accessible = highestAccessibleStep();
    selectedSummary();

    qsa("[data-wizard-step]", form).forEach(section => {
      const step = Number(section.dataset.wizardStep);
      const active = step === current;
      section.hidden = !active;
      section.classList.toggle("is-current", active);
      section.setAttribute("aria-hidden", active ? "false" : "true");
    });

    qsa("[data-wizard-go]", form).forEach(button => {
      const step = Number(button.dataset.wizardGo);
      button.classList.toggle("is-current", step === current);
      button.classList.toggle("is-complete", step < current && validateWizardStep(step, false));
      button.disabled = step > accessible;
      button.setAttribute("aria-current", step === current ? "step" : "false");
    });

    const counter = qs("#nvWizardCurrentLabel");
    if (counter) counter.textContent = `مرحله ${toFa(current)} از ${toFa(6)} — ${wizardStepLabels[current - 1]}`;

    const back = qs("#nvWizardBack");
    const next = qs("#nvWizardNext");
    const submit = qs("#nvWizardSubmit");
    if (back) {
      back.hidden = current === 1;
      back.disabled = current === 1;
    }
    if (next) {
      next.hidden = current === 6;
      next.textContent = current === 5 ? "بررسی نهایی" : "مرحله بعد";
    }
    if (submit) {
      submit.hidden = current !== 6;
      const submitText = qs('#formSubmitText');
      const service = selectedService();
      const payment = payableWithInsurance(state.selectedSlot?.appointment_fee, state.selectedSlot || service, insuranceInput().has);
      const isFree = String(state.selectedSlot?.fee_source || '') === 'free' || Boolean(service?.is_free) || Number(payment.payable || 0) <= 0;
      const actionLabel = isFree ? 'ثبت نوبت' : 'ادامه به پرداخت';
      if (submitText) submitText.textContent = actionLabel;
      submit.classList.toggle('is-free', isFree);
      submit.classList.toggle('is-payment', !isFree);
      submit.setAttribute('aria-label', actionLabel);
      const actionIcon = qs('i', submit);
      if (actionIcon) actionIcon.className = isFree ? 'icon-check' : 'icon-credit-card';
    }

    updateWizardSummaryVisibility();
    const insuranceBox = qs('.nv-staff-insurance-box');
    if (insuranceBox) insuranceBox.hidden = !hasInsurancePolicy(state.selectedSlot || selectedService());
    if (current === 6) renderFinalReview();

    if (scrollToTop) {
      const body = modalBody();
      if (body) body.scrollTo({ top: 0, behavior: "smooth" });
      const heading = qs(`[data-wizard-step="${current}"] .nv-booking-step-title strong`, form);
      if (heading) heading.setAttribute("tabindex", "-1");
      window.setTimeout(() => heading?.focus?.({ preventScroll: true }), 160);
    }
  }

  function clearAutoTimer(name) {
    if (state[name]) window.clearTimeout(state[name]);
    state[name] = null;
  }

  function queueAutoSelect(delay = 120) {
    clearAutoTimer("autoAdvanceTimer");
    state.autoAdvanceTimer = window.setTimeout(() => {
      autoSelectSingleOption().catch(() => {});
    }, delay);
  }

  function advanceAfterSelection(step) {
    if (state.currentStep !== step) return;
    window.setTimeout(() => {
      if (state.currentStep === step && validateWizardStep(step, false)) {
        goToWizardStep(step + 1, false);
      }
    }, 70);
  }

  async function autoSelectSingleOption() {
    if (!modalIsOpen() || state.autoSelecting || state.currentStep === 6) return;
    state.autoSelecting = true;
    try {
      if (state.currentStep === 1 && state.patientMode === "existing" && !state.selectedPatientId && state.patients.length === 1) {
        selectPatient(state.patients[0].id, true);
        return;
      }
      if (state.currentStep === 2 && !state.selectedServiceId && state.services.length === 1) {
        await selectService(state.services[0].id, true);
        return;
      }
      const doctors = getDoctorsFromSlots();
      if (state.currentStep === 3 && !state.selectedDoctorId && doctors.length === 1) {
        selectDoctor(doctors[0].id, true);
        return;
      }
      const centers = getCentersFromSlots();
      if (state.currentStep === 4 && !state.selectedCenterId && centers.length === 1) {
        selectCenter(centers[0].id, true);
        return;
      }
      const slots = getSelectableSlots();
      if (state.currentStep === 5 && !state.selectedSlot && slots.length === 1) {
        selectSlot(slots[0].id, true);
      }
    } finally {
      state.autoSelecting = false;
    }
  }

  function goToWizardStep(target, notify = true) {
    const next = Math.min(6, Math.max(1, Number(target) || 1));
    if (next > state.currentStep) {
      for (let step = state.currentStep; step < next; step += 1) {
        if (!validateWizardStep(step, notify)) return false;
      }
    }
    if (next > highestAccessibleStep()) return false;
    state.currentStep = next;
    renderWizard(true);
    queueAutoSelect(160);
    return true;
  }

  function renderAll() {
    renderPatientSelect();
    renderPatientResults();
    renderServices();
    renderDoctors();
    renderCenters();
    renderSlots();
    selectedSummary();
    renderFinalReview();
    renderWizard(false);
  }

  function formHtml() {
    return `
      <input id="appointmentId" type="hidden"/>
      <input id="nvSelectedSlotId" type="hidden"/>

      <div class="nv-appointment-v2">
        <div class="nv-wizard-topbar">
          <div class="nv-wizard-current" id="nvWizardCurrentLabel">مرحله ۱ از ۶ — بیمار</div>
          <nav class="nv-wizard-progress" aria-label="مراحل ثبت نوبت">
            ${wizardStepLabels.map((label, index) => `<button type="button" data-wizard-go="${index + 1}" aria-label="مرحله ${index + 1}: ${label}"><span>${toFa(index + 1)}</span><small>${label}</small></button>`).join("")}
          </nav>
        </div>
        <div id="nvSelectedSummary" class="nv-selected-summary empty" hidden></div>

        <div class="nv-booking-wizard">
          <section class="nv-booking-step nv-step-patient" data-wizard-step="1">
            <div class="nv-booking-step-header">
              <div class="nv-booking-step-number">۱</div>
              <div class="nv-booking-step-title">
                <strong>انتخاب بیمار</strong>
                <span>با نام، شماره موبایل یا کد ملی جست‌وجو کنید؛ پس از انتخاب، مرحله بعد خودکار باز می‌شود.</span>
              </div>
            </div>
            <div class="nv-booking-step-body">
              <div class="nv-booking-tabs">
                <button type="button" data-patient-mode="existing" class="active">بیمار موجود</button>
                <button type="button" data-patient-mode="new">بیمار جدید</button>
              </div>

              <div id="nvExistingPatientBox">
                <select id="patientId" hidden aria-hidden="true" tabindex="-1"><option value="">انتخاب بیمار...</option></select>
                <div class="nv-patient-search-field">
                  <label for="nvPatientSearch">جست‌وجوی بیمار</label>
                  <div class="nv-patient-search-input"><i aria-hidden="true" class="icon-search"></i><input id="nvPatientSearch" type="search" autocomplete="off" placeholder="نام، موبایل یا کد ملی بیمار..."/></div>
                  <small>در حالت خالی، بیماران اخیر نمایش داده می‌شوند.</small>
                </div>
                <div id="nvPatientResults" class="nv-patient-results"></div>
              </div>

              <div id="nvNewPatientBox" class="nv-form-grid" style="display:none">
                <div class="nv-form-field">
                  <label>نام و نام خانوادگی بیمار</label>
                  <input id="nvPatientName" type="text" autocomplete="name" placeholder="مثلاً علی رضایی"/>
                </div>
                <div class="nv-form-field">
                  <label>شماره تماس بیمار</label>
                  <input id="nvPatientPhone" type="text" inputmode="tel" autocomplete="tel" placeholder="مثلاً ۰۹۱۲۱۲۳۴۵۶۷"/>
                </div>
              </div>
            </div>
          </section>

          <section class="nv-booking-step nv-step-service" data-wizard-step="2">
            <div class="nv-booking-step-header">
              <div class="nv-booking-step-number">۲</div>
              <div class="nv-booking-step-title">
                <strong>انتخاب خدمت</strong>
                <span>فقط خدمات دارای نوبت خالی در بازه نمایش داده می‌شوند و تعداد ظرفیت خالی روی کارت آمده است.</span>
              </div>
            </div>
            <div class="nv-booking-step-body">
              <div id="nvServiceOptions" class="nv-option-grid"><div class="nv-loading-state">در حال دریافت خدمات...</div></div>
            </div>
          </section>

          <section class="nv-booking-step nv-step-doctor" data-wizard-step="3">
            <div class="nv-booking-step-header">
              <div class="nv-booking-step-number">۳</div>
              <div class="nv-booking-step-title">
                <strong>انتخاب پزشک</strong>
                <span>فقط پزشکانی نمایش داده می‌شوند که برای خدمت انتخاب‌شده نوبت خالی دارند.</span>
              </div>
            </div>
            <div class="nv-booking-step-body"><div id="nvDoctorOptions" class="nv-option-grid"><div class="nv-empty-state">ابتدا خدمت را انتخاب کنید.</div></div></div>
          </section>

          <section class="nv-booking-step nv-step-center" data-wizard-step="4">
            <div class="nv-booking-step-header">
              <div class="nv-booking-step-number">۴</div>
              <div class="nv-booking-step-title">
                <strong>انتخاب مرکز درمانی</strong>
                <span>مرکز درمانی بر اساس پزشک و خدمت انتخاب‌شده فیلتر می‌شود.</span>
              </div>
            </div>
            <div class="nv-booking-step-body"><div id="nvCenterOptions" class="nv-option-grid"><div class="nv-empty-state">ابتدا پزشک را انتخاب کنید.</div></div></div>
          </section>

          <section class="nv-booking-step nv-step-slots nv-step-wide" data-wizard-step="5">
            <div class="nv-booking-step-header">
              <div class="nv-booking-step-number">۵</div>
              <div class="nv-booking-step-title">
                <strong>انتخاب نوبت آزاد</strong>
                <span>با انتخاب ساعت، مستقیماً به مرور نهایی می‌روید.</span>
              </div>
            </div>
            <div class="nv-booking-step-body">
              <div class="nv-slot-toolbar">
                <div class="nv-form-grid">
                  <div class="nv-form-field"><label>از تاریخ</label><div class="nv-date-input-shell"><input id="nvDateFrom" class="jalali-date-input nv-jalali-date" type="text" inputmode="numeric" autocomplete="off" placeholder="از تاریخ" readonly/><span aria-hidden="true" class="nv-date-input-icon"><i class="icon-calendar"></i></span></div></div>
                  <div class="nv-form-field"><label>تا تاریخ</label><div class="nv-date-input-shell"><input id="nvDateTo" class="jalali-date-input nv-jalali-date" type="text" inputmode="numeric" autocomplete="off" placeholder="تا تاریخ" readonly/><span aria-hidden="true" class="nv-date-input-icon"><i class="icon-calendar"></i></span></div></div>
                </div>
                <button type="button" class="btn btn-outline nv-btn-soft" id="nvRefreshSlots">بروزرسانی نوبت‌ها</button>
              </div>
              <div id="nvBookingStatus" class="nv-empty-state">بعد از انتخاب خدمت، پزشک و مرکز، نوبت‌های آزاد نمایش داده می‌شوند.</div>
              <div id="nvSlotList" class="nv-slot-list"></div>
            </div>
          </section>

          <section class="nv-booking-step nv-step-details nv-step-wide" data-wizard-step="6">
            <div class="nv-booking-step-header">
              <div class="nv-booking-step-number">۶</div>
              <div class="nv-booking-step-title">
                <strong>مرور و ثبت نهایی</strong>
                <span>در این مرحله ثبت خودکار انجام نمی‌شود؛ اطلاعات را بررسی و سپس دکمه ثبت را بزنید.</span>
              </div>
            </div>
            <div class="nv-booking-step-body">
              <div id="nvFinalReview" class="nv-final-review"></div>
              <div class="nv-final-row">
                <div class="nv-form-field nv-field-full nv-staff-insurance-box">
                  <label><input id="appointmentHasSupplementaryInsurance" type="checkbox" value="1"> بیمه تکمیلی دارد</label>
                  <small>اگر زیباجو بیمه تکمیلی دارد، اطلاعات بیمه را وارد کنید. مبلغ قابل پرداخت پیش از ثبت نهایی محاسبه و وضعیت بیمه برای بررسی ثبت می‌شود.</small>
                </div>
                <div class="nv-field-full" data-appointment-insurance-details hidden>
                  <div class="nv-form-grid">
                    <div class="nv-form-field"><label>نام بیمه تکمیلی</label><input id="appointmentInsuranceProvider" type="text" maxlength="120" placeholder="مثلاً بیمه دانا یا دی"/></div>
                    <div class="nv-form-field"><label>شماره بیمه/معرفی‌نامه</label><input id="appointmentInsuranceNumber" type="text" maxlength="80"/></div>
                    <div class="nv-form-field nv-field-full"><label>توضیح بیمه</label><textarea id="appointmentInsuranceNote" placeholder="توضیح کوتاه برای پذیرش"></textarea></div>
                  </div>
                </div>
                <div class="nv-form-field">
                  <label>نوع نوبت</label>
                  <select id="appointmentType"><option value="regular">عادی</option><option value="follow_up">پیگیری</option><option value="emergency">اورژانسی</option><option value="surgery">جراحی</option></select>
                </div>
                <div class="nv-form-field">
                  <label>وضعیت پس از ثبت</label>
                  <select id="appointmentStatus" title="وضعیت بر اساس رایگان یا پولی بودن خدمت تعیین می‌شود"><option value="pending">در انتظار پرداخت</option><option value="confirmed" selected>تأیید شده</option></select>
                </div>
                <p class="nv-payment-status-note nv-field-full"><i class="icon-info" aria-hidden="true"></i><span>خدمت پولی فقط بعد از پرداخت موفق ثبت و تأیید می‌شود؛ خدمت رایگان پس از احراز هویت مستقیم ثبت خواهد شد.</span></p>
                <div class="nv-form-field nv-field-full"><label>توضیحات</label><textarea id="appointmentReason" placeholder="توضیحات نوبت..."></textarea></div>
              </div>
            </div>
          </section>
        </div>
      </div>
    `;
  }

  async function refreshSlotsForSelection() {
    if (!state.selectedServiceId) return;

    setStatus("در حال دریافت نوبت‌های آزاد...", "loading");
    await loadAvailableSlots();

    if (state.selectedDoctorId && !state.availableSlots.some(slot => String(slot.doctor_id) === String(state.selectedDoctorId))) {
      state.selectedDoctorId = "";
      state.selectedCenterId = "";
      state.selectedSlot = null;
    }

    if (state.selectedCenterId && !state.availableSlots.some(slot =>
      String(slot.doctor_id) === String(state.selectedDoctorId) &&
      String(slot.medical_center_id) === String(state.selectedCenterId)
    )) {
      state.selectedCenterId = "";
      state.selectedSlot = null;
    }

    const capacity = state.availableSlots.reduce((sum, slot) => sum + slotCapacity(slot), 0);
    setStatus(
      capacity
        ? `${toFa(capacity)} نوبت خالی در ${toFa(state.availableSlots.length)} بازه زمانی پیدا شد.`
        : "در این بازه نوبت آزادی برای خدمت انتخاب‌شده پیدا نشد.",
      capacity ? "success" : "warning"
    );
    renderAll();
  }

  function selectPatient(id, shouldAdvance = true) {
    const patient = state.patients.find(item => String(item.id) === String(id));
    if (!patient) return;
    state.selectedPatientId = String(patient.id);
    state.patientQuery = [patientName(patient), patientPhone(patient)].filter(Boolean).join(" - ");
    const search = qs("#nvPatientSearch");
    if (search) search.value = state.patientQuery;
    const select = qs("#patientId");
    if (select) select.value = state.selectedPatientId;
    renderPatientResults();
    renderWizard(false);
    if (shouldAdvance) advanceAfterSelection(1);
  }

  async function selectService(id, shouldAdvance = true) {
    state.selectedServiceId = String(id);
    state.selectedDoctorId = "";
    state.selectedCenterId = "";
    state.selectedSlot = null;
    await refreshSlotsForSelection();
    if (shouldAdvance && state.availableSlots.length) advanceAfterSelection(2);
  }

  function selectDoctor(id, shouldAdvance = true) {
    state.selectedDoctorId = String(id);
    state.selectedCenterId = "";
    state.selectedSlot = null;
    renderAll();
    if (shouldAdvance) advanceAfterSelection(3);
  }

  function selectCenter(id, shouldAdvance = true) {
    state.selectedCenterId = String(id);
    state.selectedSlot = null;
    renderAll();
    if (shouldAdvance) advanceAfterSelection(4);
  }

  function selectSlot(id, shouldAdvance = true) {
    const slot = state.availableSlots.find(item => String(item.id) === String(id));
    if (!slot || !isSelectableSlot(slot)) return;

    state.selectedSlot = slot;
    const hidden = qs("#nvSelectedSlotId");
    if (hidden) hidden.value = slot.id;
    const statusSelect = qs("#appointmentStatus");
    if (statusSelect) {
      const isFree = String(slot.fee_source || "") === "free" || Boolean(selectedService()?.is_free);
      statusSelect.value = isFree ? "confirmed" : "pending";
      statusSelect.disabled = true;
      statusSelect.title = isFree
        ? "خدمت رایگان پس از احراز هویت مستقیم تأیید می‌شود"
        : "خدمت پولی فقط بعد از ثبت پرداخت تأیید می‌شود";
      window.NVPrettySelects?.sync?.(statusSelect);
    }
    renderSlots();
    selectedSummary();
    renderFinalReview();
    renderWizard(false);
    if (shouldAdvance) advanceAfterSelection(5);
  }

  function gregorianFromJalaliInput(input) {
    const value = String(input?.value || "").trim();
    if (!value) return "";
    const converted = typeof window.toGregorianDateString === "function"
      ? window.toGregorianDateString(value)
      : "";
    return /^\d{4}-\d{2}-\d{2}$/.test(String(converted || "")) ? converted : "";
  }

  function initModalPersianDates() {
    qsa("#nvDateFrom, #nvDateTo").forEach(input => {
      input.classList.add("jalali-date-input", "nv-jalali-date");
      input.setAttribute("autocomplete", "off");
      input.setAttribute("inputmode", "numeric");
    });
    if (typeof window.initDatepickers === "function") window.initDatepickers();
  }

  async function onDateRangeChanged(event) {
    const fromInput = qs("#nvDateFrom");
    const toInput = qs("#nvDateTo");
    let from = gregorianFromJalaliInput(fromInput);
    let to = gregorianFromJalaliInput(toInput);

    if (!from || !to) {
      setStatus("تاریخ شروع و پایان را از تقویم شمسی انتخاب کنید.", "warning");
      return;
    }

    if (to < from) {
      to = from;
      if (toInput && fromInput) toInput.value = fromInput.value;
      if (event?.target === fromInput && window.showToast) {
        window.showToast("تاریخ پایان با تاریخ شروع هماهنگ شد.", "info");
      }
    }

    state.dateFrom = from;
    state.dateTo = to;
    state.selectedSlot = null;

    await loadServices();
    if (state.selectedServiceId && !state.services.some(service => String(service.id) === String(state.selectedServiceId))) {
      state.selectedServiceId = "";
      state.selectedDoctorId = "";
      state.selectedCenterId = "";
      state.selectedSlot = null;
      state.currentStep = 2;
      renderAll();
      setStatus("برای بازه جدید، خدمت قبلی نوبت خالی ندارد. خدمت دیگری انتخاب کنید.", "warning");
      queueAutoSelect();
      return;
    }

    if (state.selectedServiceId) await refreshSlotsForSelection();
    else renderAll();
  }

  function schedulePatientSearchAutoSelect() {
    clearAutoTimer("patientSearchTimer");
    const query = normalizeSearch(state.patientQuery);
    const matches = getPatientMatches();
    if (state.currentStep !== 1 || state.patientMode !== "existing" || query.length < 3 || matches.length !== 1) return;
    const expectedId = String(matches[0].id);
    state.patientSearchTimer = window.setTimeout(() => {
      const currentMatches = getPatientMatches();
      if (state.currentStep === 1 && currentMatches.length === 1 && String(currentMatches[0].id) === expectedId) {
        selectPatient(expectedId, true);
      }
    }, 500);
  }

  function scheduleNewPatientAdvance() {
    clearAutoTimer("newPatientTimer");
    if (state.currentStep !== 1 || state.patientMode !== "new" || !validateWizardStep(1, false)) return;
    state.newPatientTimer = window.setTimeout(() => {
      if (state.currentStep === 1 && state.patientMode === "new" && validateWizardStep(1, false)) {
        goToWizardStep(2, false);
      }
    }, 450);
  }

  function bindEvents() {
    const form = qs("#appointmentForm");
    if (!form || form.dataset.nvAppointmentsV2Bound === "1") return;
    form.dataset.nvAppointmentsV2Bound = "1";

    form.addEventListener("click", async event => {
      const patientMode = event.target.closest("[data-patient-mode]");
      if (patientMode) {
        state.patientMode = patientMode.dataset.patientMode;
        qsa("[data-patient-mode]", form).forEach(button => button.classList.toggle("active", button === patientMode));
        const existingBox = qs("#nvExistingPatientBox");
        const newBox = qs("#nvNewPatientBox");
        if (existingBox) existingBox.style.display = state.patientMode === "existing" ? "" : "none";
        if (newBox) newBox.style.display = state.patientMode === "new" ? "" : "none";
        if (state.patientMode === "new") {
          state.selectedPatientId = "";
          const select = qs("#patientId");
          if (select) select.value = "";
          window.setTimeout(() => qs("#nvPatientName")?.focus(), 80);
        } else {
          window.setTimeout(() => qs("#nvPatientSearch")?.focus(), 80);
          queueAutoSelect();
        }
        renderWizard(false);
        return;
      }

      const patient = event.target.closest("[data-patient-id]");
      if (patient) {
        selectPatient(patient.dataset.patientId, true);
        return;
      }

      const service = event.target.closest("[data-service-id]");
      if (service) {
        await selectService(service.dataset.serviceId, true);
        return;
      }

      const doctor = event.target.closest("[data-doctor-id]");
      if (doctor) {
        selectDoctor(doctor.dataset.doctorId, true);
        return;
      }

      const center = event.target.closest("[data-center-id]");
      if (center) {
        selectCenter(center.dataset.centerId, true);
        return;
      }

      const slot = event.target.closest("[data-slot-id]");
      if (slot) selectSlot(slot.dataset.slotId, true);
    });

    qs("#nvRefreshSlots")?.addEventListener("click", async () => {
      await loadServices();
      await refreshSlotsForSelection();
      queueAutoSelect();
    });
    qs("#nvDateFrom")?.addEventListener("change", onDateRangeChanged);
    qs("#nvDateTo")?.addEventListener("change", onDateRangeChanged);

    form.addEventListener("input", event => {
      if (event.target?.id === "nvPatientSearch") {
        const selected = selectedPatient();
        const oldDisplay = selected ? normalizeSearch([patientName(selected), patientPhone(selected)].filter(Boolean).join(" - ")) : "";
        state.patientQuery = event.target.value || "";
        if (state.selectedPatientId && normalizeSearch(state.patientQuery) !== oldDisplay) {
          state.selectedPatientId = "";
          const select = qs("#patientId");
          if (select) select.value = "";
        }
        renderPatientResults();
        renderWizard(false);
        schedulePatientSearchAutoSelect();
        return;
      }
      if (["nvPatientName", "nvPatientPhone"].includes(event.target?.id)) {
        renderWizard(false);
        renderFinalReview();
        scheduleNewPatientAdvance();
        return;
      }
      if (["appointmentInsuranceProvider", "appointmentInsuranceNumber", "appointmentInsuranceNote"].includes(event.target?.id)) {
        syncInsuranceFields();
      }
    });

    form.addEventListener("change", event => {
      if (["nvPatientName", "nvPatientPhone"].includes(event.target?.id)) scheduleNewPatientAdvance();
      if (event.target?.id === "appointmentHasSupplementaryInsurance") syncInsuranceFields();
    });

    qsa("[data-wizard-go]", form).forEach(button => {
      button.addEventListener("click", () => goToWizardStep(button.dataset.wizardGo, true));
    });
    qs("#nvWizardBack")?.addEventListener("click", () => goToWizardStep(state.currentStep - 1, false));
    qs("#nvWizardNext")?.addEventListener("click", () => goToWizardStep(state.currentStep + 1, true));
  }

  async function submitV2() {
    try {
      const slot = state.selectedSlot;
      if (!slot) throw new Error("لطفاً یک نوبت آزاد انتخاب کنید.");

      const insurance = hasInsurancePolicy(state.selectedSlot || selectedService()) ? insuranceInput() : { has: false, provider: '', number: '', note: '' };
      const payment = payableWithInsurance(slot.appointment_fee, slot, insurance.has);
      const payload = {
        appointment_slot_id: slot.id,
        type: qs("#appointmentType")?.value || "regular",
        status: qs("#appointmentStatus")?.value || "confirmed",
        reason: qs("#appointmentReason")?.value || "",
        notes: qs("#appointmentReason")?.value || "",
        expected_amount: Number(payment.payable || 0),
        has_supplementary_insurance: insurance.has,
        insurance_provider: insurance.provider,
        insurance_number: insurance.number,
        insurance_note: insurance.note
      };

      if (state.patientMode === "existing") {
        const patientId = state.selectedPatientId || qs("#patientId")?.value;
        if (!patientId) throw new Error("لطفاً بیمار را انتخاب کنید.");
        payload.patient_id = patientId;
      } else {
        const name = qs("#nvPatientName")?.value?.trim();
        const phone = cleanPhone(qs("#nvPatientPhone")?.value || "");
        if (!name) throw new Error("لطفاً نام بیمار جدید را وارد کنید.");
        if (!/^09\d{9}$/.test(phone)) throw new Error("شماره تماس بیمار جدید معتبر نیست.");
        payload.patient_name = name;
        payload.patient_phone = phone;
      }

      const button = qs("#nvWizardSubmit");
      if (button) {
        button.disabled = true;
        button.dataset.oldText = button.innerHTML;
        button.innerHTML = "در حال ثبت...";
      }

      const result = await api("/api/appointments", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      if (result.payment_required) {
        if (!result.payment_url) throw new Error("مسیر پرداخت دریافت نشد؛ هیچ نوبتی ثبت نشده است.");
        const message = result.message || "ظرفیت این نوبت موقتاً نگه داشته شد؛ برای نهایی‌شدن نوبت، پرداخت را تکمیل کنید.";
        try { sessionStorage.setItem("nv_checkout_notice", message); } catch (_) {}
        window.location.assign(result.payment_url);
        return;
      }

      const queueMessage = result.appointment_queue_number || result.queue_number
        ? ` شماره نوبت: ${toFa(result.appointment_queue_number || result.queue_number)}`
        : "";
      const smsMessage = result.sms && result.sms.status === "sent" ? " پیامک تأیید ارسال شد." : "";
      const successMessage = result.message || `نوبت با موفقیت ثبت شد.${queueMessage}${smsMessage}`;
      if (window.showToast) window.showToast(successMessage, "success");
      else alert(successMessage);

      if (window.closeModal) window.closeModal("appointmentFormModal");
      if (typeof window.loadAppointments === "function") await window.loadAppointments();
    } catch (error) {
      if (window.showToast) window.showToast(error.message || "ثبت نوبت انجام نشد", "error");
      else alert(error.message || "ثبت نوبت انجام نشد");
    } finally {
      const button = qs("#nvWizardSubmit");
      if (button) {
        button.disabled = false;
        if (button.dataset.oldText) button.innerHTML = button.dataset.oldText;
      }
    }
  }

  function resetV2() {
    clearAutoTimer("autoAdvanceTimer");
    clearAutoTimer("patientSearchTimer");
    clearAutoTimer("newPatientTimer");

    state.selectedPatientId = "";
    state.selectedServiceId = "";
    state.selectedDoctorId = "";
    state.selectedCenterId = "";
    state.selectedSlot = null;
    state.availableSlots = [];
    state.patientMode = "existing";
    state.patientQuery = "";
    state.currentStep = 1;

    state.dateFrom = todayISO();
    state.dateTo = addMonthsISO(todayISO(), 1);

    const from = qs("#nvDateFrom");
    const to = qs("#nvDateTo");
    if (from) from.value = jalaliView(state.dateFrom);
    if (to) to.value = jalaliView(state.dateTo);

    const search = qs("#nvPatientSearch");
    if (search) search.value = "";
    const patientSelect = qs("#patientId");
    if (patientSelect) patientSelect.value = "";
    if (qs("#appointmentId")) qs("#appointmentId").value = "";
    if (qs("#nvSelectedSlotId")) qs("#nvSelectedSlotId").value = "";
    if (qs("#appointmentReason")) qs("#appointmentReason").value = "";
    if (qs("#appointmentType")) qs("#appointmentType").value = "regular";
    if (qs("#appointmentStatus")) qs("#appointmentStatus").value = "confirmed";
    if (qs("#nvPatientName")) qs("#nvPatientName").value = "";
    if (qs("#nvPatientPhone")) qs("#nvPatientPhone").value = "";

    qsa("[data-patient-mode]").forEach(button => button.classList.toggle("active", button.dataset.patientMode === "existing"));
    if (qs("#nvExistingPatientBox")) qs("#nvExistingPatientBox").style.display = "";
    if (qs("#nvNewPatientBox")) qs("#nvNewPatientBox").style.display = "none";

    renderAll();
    setStatus("بعد از انتخاب خدمت، پزشک و مرکز، نوبت‌های آزاد نمایش داده می‌شوند.");
    window.setTimeout(() => {
      qs("#nvPatientSearch")?.focus();
      queueAutoSelect();
    }, 180);
  }



  function initAppointmentToolbox() {
    const buttons = qsa('[data-appointments-tool-tab]');
    const panels = qsa('[data-appointments-tool-panel]');
    if (!buttons.length || !panels.length) return;

    const activate = (name, focus = false) => {
      buttons.forEach(button => {
        const active = button.dataset.appointmentsToolTab === name;
        button.classList.toggle('is-selected', active);
        button.setAttribute('aria-selected', active ? 'true' : 'false');
        button.tabIndex = active ? 0 : -1;
        if (active && focus) button.focus();
      });
      panels.forEach(panel => {
        const active = panel.dataset.appointmentsToolPanel === name;
        panel.hidden = !active;
        panel.classList.toggle('is-selected', active);
      });
      try { sessionStorage.setItem('noorvista_appointments_tool', name); } catch (_) {}
    };

    buttons.forEach((button, index) => {
      button.addEventListener('click', () => activate(button.dataset.appointmentsToolTab));
      button.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        const offset = event.key === 'ArrowLeft' ? 1 : -1;
        const target = buttons[(index + offset + buttons.length) % buttons.length];
        activate(target.dataset.appointmentsToolTab, true);
      });
    });

    let preferred = 'filter';
    try {
      const saved = sessionStorage.getItem('noorvista_appointments_tool');
      if (saved === 'history') preferred = saved;
    } catch (_) {}
    activate(preferred);
  }

  let initializedForm = null;
  let initPromise = null;

  async function initV2() {
    const page = location.pathname.toLowerCase();
    if (!page.includes("/dashboard/") || !page.includes("appointments.html")) return;
    initAppointmentToolbox();

    const form = qs("#appointmentForm");
    if (!form) return false;
    if (initializedForm === form && form.dataset.nvAppointmentV2Initialized === "1") return true;
    initializedForm = form;
    form.dataset.nvAppointmentV2Initialized = "1";
    form.innerHTML = formHtml();

    state.dateFrom = todayISO();
    state.dateTo = addMonthsISO(todayISO(), 1);
    qs("#nvDateFrom").value = jalaliView(state.dateFrom);
    qs("#nvDateTo").value = jalaliView(state.dateTo);
    initModalPersianDates();
    bindEvents();

    try {
      await Promise.all([loadPatients(), loadServices()]);
      renderAll();
      renderWizard(false);
    } catch (error) {
      setStatus(error.message || "خطا در آماده‌سازی فرم نوبت‌دهی", "error");
    }

    const oldOpenAdd = window.openAddModal;
    window.openAddModal = function () {
      if (typeof oldOpenAdd === "function") oldOpenAdd();
      const title = qs("#formModalTitle");
      const submitText = qs("#formSubmitText");
      if (title) title.textContent = "ثبت نوبت جدید";
      if (submitText) submitText.textContent = "ثبت نوبت";
      resetV2();
    };

    window.submitAppointmentForm = submitV2;
    window.SadraAppointmentWizard = {
      goToStep: goToWizardStep,
      currentStep: () => state.currentStep,
      refresh: () => renderWizard(false),
      selectPatient: (id, shouldAdvance = true) => selectPatient(id, shouldAdvance)
    };

    window.findEarliestAvailableSlot = async function () {
      if (!state.selectedServiceId) return setStatus("ابتدا خدمت را انتخاب کنید.", "warning");
      await refreshSlotsForSelection();
      const first = state.availableSlots[0];
      if (first) {
        state.selectedDoctorId = String(first.doctor_id);
        state.selectedCenterId = String(first.medical_center_id);
        selectSlot(first.id, false);
        state.currentStep = 6;
        renderWizard(true);
      }
    };

    window.loadAvailableSlotsRange = refreshSlotsForSelection;
    return true;
  }

  window.SadraInitAppointmentWizard = function () {
    if (initPromise) return initPromise;
    initPromise = Promise.resolve(initV2()).finally(() => { initPromise = null; });
    return initPromise;
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { void window.SadraInitAppointmentWizard(); });
  } else {
    void window.SadraInitAppointmentWizard();
  }
})();
