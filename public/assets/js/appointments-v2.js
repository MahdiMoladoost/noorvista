// NOORVISTA Appointments V2
// مدیریت نوبت‌ها بر اساس بیمار + خدمت + پزشک + مرکز درمانی + ظرفیت واقعی
(function () {
  if (window.__NOORVISTA_APPOINTMENTS_V2__) return;
  window.__NOORVISTA_APPOINTMENTS_V2__ = true;

  const state = {
    services: [],
    patients: [],
    availableSlots: [],
    selectedServiceId: "",
    selectedDoctorId: "",
    selectedCenterId: "",
    selectedSlot: null,
    patientMode: "existing",
    dateFrom: "",
    dateTo: ""
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

  function cleanPhone(value) {
    return toEn(value).replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    })[ch]);
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function addDaysISO(iso, days) {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function addMonthsISO(iso, months) {
    const d = new Date(iso + "T00:00:00");
    d.setMonth(d.getMonth() + months);
    return d.toISOString().slice(0, 10);
  }

  function jalaliView(iso) {
    if (!iso) return "-";
    if (window.toJalaliDateString) return toFa(window.toJalaliDateString(iso));
    try {
      return toFa(new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso + "T00:00:00")));
    } catch (_) {
      return toFa(iso);
    }
  }

  function timeView(value) {
    return toFa(String(value || "").slice(0, 5));
  }

  function apiHeaders() {
    const token = localStorage.getItem("token") || localStorage.getItem("authToken") || localStorage.getItem("noorvista_token");
    return {
      "Content-Type": "application/json",
      "Accept": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
  }

  async function api(url, options = {}) {
    const res = await fetch(url, { ...options, headers: { ...apiHeaders(), ...(options.headers || {}) } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.message || `خطای سرور: ${res.status}`);
    }
    return data;
  }

  function asArray(data, keys) {
    if (Array.isArray(data)) return data;
    for (const k of keys) {
      if (Array.isArray(data?.[k])) return data[k];
      if (Array.isArray(data?.data?.[k])) return data.data[k];
    }
    return [];
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
    const data = await api("/api/services?include_inactive=0");
    state.services = asArray(data, ["services"]);
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
    if (state.selectedDoctorId) params.set("doctor_id", state.selectedDoctorId);
    if (state.selectedCenterId) params.set("medical_center_id", state.selectedCenterId);

    const data = await api(`/api/appointment-slots/available?${params.toString()}`);
    state.availableSlots = asArray(data, ["slots"]);
  }

  function uniqueBy(items, keyFn) {
    const map = new Map();
    items.forEach(item => {
      const key = keyFn(item);
      if (key !== undefined && key !== null && key !== "") map.set(String(key), item);
    });
    return Array.from(map.values());
  }

  function getDoctorsFromSlots() {
    return uniqueBy(state.availableSlots, s => s.doctor_id)
      .map(s => ({ id: s.doctor_id, name: s.doctor_name || "پزشک" }));
  }

  function getCentersFromSlots() {
    return uniqueBy(state.availableSlots, s => s.medical_center_id)
      .map(s => ({ id: s.medical_center_id, name: s.medical_center_name || "مرکز درمانی" }));
  }

  function selectedService() {
    return state.services.find(s => String(s.id) === String(state.selectedServiceId));
  }

  function selectedDoctorName() {
    const slot = state.availableSlots.find(s => String(s.doctor_id) === String(state.selectedDoctorId));
    return slot?.doctor_name || "-";
  }

  function selectedCenterName() {
    const slot = state.availableSlots.find(s => String(s.medical_center_id) === String(state.selectedCenterId));
    return slot?.medical_center_name || "-";
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

    if (!state.selectedSlot) {
      el.className = "nv-selected-summary empty";
      el.innerHTML = "هنوز نوبتی انتخاب نشده است. ابتدا خدمت، پزشک، مرکز و زمان آزاد را انتخاب کنید.";
      return;
    }

    const s = state.selectedSlot;
    el.className = "nv-selected-summary";
    el.innerHTML = `
      <strong>نوبت انتخاب‌شده:</strong>
      ${escapeHtml(s.service_name || selectedService()?.name || "-")}
      با ${escapeHtml(s.doctor_name || selectedDoctorName())}
      در ${escapeHtml(s.medical_center_name || selectedCenterName())}
      در تاریخ ${jalaliView(s.slot_date)}
      ساعت ${timeView(s.start_time)}
      <br>
      ظرفیت باقی‌مانده: ${toFa(s.remaining_capacity || 0)} نفر
    `;
  }

  function renderPatientSelect() {
    const select = qs("#patientId");
    if (!select) return;

    select.innerHTML = '<option value="">انتخاب بیمار...</option>';
    state.patients.forEach(p => {
      const name = p.full_name || p.name || p.username || p.patient_name || "بیمار";
      const phone = p.phone || p.mobile || p.patient_phone || "";
      select.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(p.id)}">${escapeHtml(name)}${phone ? " - " + escapeHtml(toFa(phone)) : ""}</option>`);
    });
  }

  function renderServices() {
    const root = qs("#nvServiceOptions");
    if (!root) return;

    if (!state.services.length) {
      root.innerHTML = '<div class="nv-empty-state">خدمت فعالی برای نوبت‌دهی ثبت نشده است.</div>';
      return;
    }

    root.innerHTML = state.services.map(s => `
      <button type="button" class="nv-option-card ${String(s.id) === String(state.selectedServiceId) ? "active" : ""}" data-service-id="${escapeHtml(s.id)}">
        <strong>${escapeHtml(s.name)}</strong>
        <small>${escapeHtml(s.description || "انتخاب این خدمت برای مشاهده پزشکان و نوبت‌های آزاد")}</small>
        <span class="badge-row">
          <span class="nv-mini-badge">ظرفیت پیش‌فرض: ${toFa(s.default_capacity || 1)}</span>
          <span class="nv-mini-badge">${toFa(s.default_duration_minutes || 30)} دقیقه</span>
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

    root.innerHTML = doctors.map(d => {
      const count = state.availableSlots.filter(s => String(s.doctor_id) === String(d.id)).length;
      return `
        <button type="button" class="nv-option-card ${String(d.id) === String(state.selectedDoctorId) ? "active" : ""}" data-doctor-id="${escapeHtml(d.id)}">
          <strong>${escapeHtml(d.name)}</strong>
          <small>پزشک ارائه‌دهنده خدمت انتخاب‌شده</small>
          <span class="badge-row"><span class="nv-mini-badge">${toFa(count)} نوبت آزاد</span></span>
        </button>
      `;
    }).join("");
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

    root.innerHTML = centers.map(c => {
      const count = state.availableSlots.filter(s => String(s.medical_center_id) === String(c.id)).length;
      return `
        <button type="button" class="nv-option-card ${String(c.id) === String(state.selectedCenterId) ? "active" : ""}" data-center-id="${escapeHtml(c.id)}">
          <strong>${escapeHtml(c.name)}</strong>
          <small>مرکز درمانی فعال برای این خدمت</small>
          <span class="badge-row"><span class="nv-mini-badge">${toFa(count)} نوبت آزاد</span></span>
        </button>
      `;
    }).join("");
  }

  function renderSlots() {
    const root = qs("#nvSlotList");
    if (!root) return;

    if (!state.selectedCenterId) {
      root.innerHTML = '<div class="nv-empty-state">ابتدا مرکز درمانی را انتخاب کنید.</div>';
      return;
    }

    const slots = state.availableSlots
      .filter(s => String(s.service_id) === String(state.selectedServiceId))
      .filter(s => String(s.doctor_id) === String(state.selectedDoctorId))
      .filter(s => String(s.medical_center_id) === String(state.selectedCenterId))
      .filter(s => Number(s.remaining_capacity || 0) > 0 && String(s.status || "available") === "available")
      .sort((a, b) => `${a.slot_date} ${a.start_time}`.localeCompare(`${b.slot_date} ${b.start_time}`));

    if (!slots.length) {
      root.innerHTML = '<div class="nv-empty-state">در این بازه نوبت آزادی برای ترکیب انتخاب‌شده وجود ندارد.</div>';
      return;
    }

    const groups = new Map();
    slots.forEach(s => {
      const key = s.slot_date;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    });

    root.innerHTML = Array.from(groups.entries()).map(([date, items]) => `
      <div class="nv-slot-day">
        <div class="nv-slot-day-title">${jalaliView(date)}</div>
        <div class="nv-slot-buttons">
          ${items.map(s => `
            <button type="button" class="nv-slot-btn ${state.selectedSlot && String(state.selectedSlot.id) === String(s.id) ? "active" : ""}" data-slot-id="${escapeHtml(s.id)}">
              <span>${timeView(s.start_time)} تا ${timeView(s.end_time)}</span>
              <small>باقی‌مانده: ${toFa(s.remaining_capacity || 0)} از ${toFa(s.capacity || 0)}</small>
            </button>
          `).join("")}
        </div>
      </div>
    `).join("");
  }

  function renderAll() {
    renderPatientSelect();
    renderServices();
    renderDoctors();
    renderCenters();
    renderSlots();
    selectedSummary();
  }

  function formHtml() {
    return `
      <input id="appointmentId" type="hidden"/>
      <input id="nvSelectedSlotId" type="hidden"/>

      <div class="nv-appointment-v2">
        <div id="nvSelectedSummary" class="nv-selected-summary empty"></div>

        <div class="nv-booking-wizard">
          <section class="nv-booking-step">
            <div class="nv-booking-step-header">
              <div class="nv-booking-step-number">۱</div>
              <div class="nv-booking-step-title">
                <strong>انتخاب بیمار</strong>
                <span>بیمار را از پرونده‌های موجود انتخاب کنید یا سریعاً بیمار جدید ثبت کنید.</span>
              </div>
            </div>
            <div class="nv-booking-step-body">
              <div class="nv-booking-tabs">
                <button type="button" data-patient-mode="existing" class="active">بیمار موجود</button>
                <button type="button" data-patient-mode="new">بیمار جدید</button>
              </div>

              <div id="nvExistingPatientBox" class="nv-form-grid">
                <div class="nv-form-field nv-field-full">
                  <label>بیمار</label>
                  <select id="patientId">
                    <option value="">انتخاب بیمار...</option>
                  </select>
                </div>
              </div>

              <div id="nvNewPatientBox" class="nv-form-grid" style="display:none">
                <div class="nv-form-field">
                  <label>نام و نام خانوادگی بیمار</label>
                  <input id="nvPatientName" type="text" placeholder="مثلاً علی رضایی"/>
                </div>
                <div class="nv-form-field">
                  <label>شماره تماس بیمار</label>
                  <input id="nvPatientPhone" type="text" inputmode="tel" placeholder="مثلاً ۰۹۱۲۱۲۳۴۵۶۷"/>
                </div>
              </div>
            </div>
          </section>

          <section class="nv-booking-step">
            <div class="nv-booking-step-header">
              <div class="nv-booking-step-number">۲</div>
              <div class="nv-booking-step-title">
                <strong>انتخاب خدمت</strong>
                <span>ابتدا نوع خدمت را انتخاب کنید تا فقط پزشکان و نوبت‌های مرتبط نمایش داده شوند.</span>
              </div>
            </div>
            <div class="nv-booking-step-body">
              <div id="nvServiceOptions" class="nv-option-grid">
                <div class="nv-loading-state">در حال دریافت خدمات...</div>
              </div>
            </div>
          </section>

          <section class="nv-booking-step">
            <div class="nv-booking-step-header">
              <div class="nv-booking-step-number">۳</div>
              <div class="nv-booking-step-title">
                <strong>انتخاب پزشک</strong>
                <span>فقط پزشکانی نمایش داده می‌شوند که برای خدمت انتخاب‌شده نوبت آزاد دارند.</span>
              </div>
            </div>
            <div class="nv-booking-step-body">
              <div id="nvDoctorOptions" class="nv-option-grid">
                <div class="nv-empty-state">ابتدا خدمت را انتخاب کنید.</div>
              </div>
            </div>
          </section>

          <section class="nv-booking-step">
            <div class="nv-booking-step-header">
              <div class="nv-booking-step-number">۴</div>
              <div class="nv-booking-step-title">
                <strong>انتخاب مرکز درمانی</strong>
                <span>مرکز درمانی بر اساس پزشک و خدمت انتخاب‌شده فیلتر می‌شود.</span>
              </div>
            </div>
            <div class="nv-booking-step-body">
              <div id="nvCenterOptions" class="nv-option-grid">
                <div class="nv-empty-state">ابتدا پزشک را انتخاب کنید.</div>
              </div>
            </div>
          </section>

          <section class="nv-booking-step">
            <div class="nv-booking-step-header">
              <div class="nv-booking-step-number">۵</div>
              <div class="nv-booking-step-title">
                <strong>انتخاب نوبت آزاد</strong>
                <span>نوبت‌های دارای ظرفیت باقی‌مانده نمایش داده می‌شوند.</span>
              </div>
            </div>
            <div class="nv-booking-step-body">
              <div class="nv-slot-toolbar">
                <div class="nv-form-grid">
                  <div class="nv-form-field">
                    <label>از تاریخ</label>
                    <input id="nvDateFrom" type="text" readonly/>
                  </div>
                  <div class="nv-form-field">
                    <label>تا تاریخ</label>
                    <input id="nvDateTo" type="text" readonly/>
                  </div>
                </div>
                <button type="button" class="btn btn-outline nv-btn-soft" id="nvRefreshSlots">بروزرسانی نوبت‌ها</button>
              </div>

              <div id="nvBookingStatus" class="nv-empty-state">بعد از انتخاب خدمت، پزشک و مرکز، نوبت‌های آزاد نمایش داده می‌شوند.</div>
              <div id="nvSlotList" class="nv-slot-list"></div>
            </div>
          </section>

          <section class="nv-booking-step">
            <div class="nv-booking-step-header">
              <div class="nv-booking-step-number">۶</div>
              <div class="nv-booking-step-title">
                <strong>اطلاعات تکمیلی</strong>
                <span>وضعیت و توضیحات نوبت را مشخص کنید.</span>
              </div>
            </div>
            <div class="nv-booking-step-body">
              <div class="nv-final-row">
                <div class="nv-form-field">
                  <label>نوع نوبت</label>
                  <select id="appointmentType">
                    <option value="regular">عادی</option>
                    <option value="follow_up">پیگیری</option>
                    <option value="emergency">اورژانسی</option>
                    <option value="surgery">جراحی</option>
                  </select>
                </div>
                <div class="nv-form-field">
                  <label>وضعیت</label>
                  <select id="appointmentStatus">
                    <option value="pending">در انتظار</option>
                    <option value="confirmed">تأیید شده</option>
                    <option value="completed">انجام شده</option>
                    <option value="cancelled">لغو شده</option>
                  </select>
                </div>
                <div class="nv-form-field nv-field-full">
                  <label>توضیحات</label>
                  <textarea id="appointmentReason" placeholder="توضیحات نوبت..."></textarea>
                </div>
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

    if (state.selectedDoctorId) {
      const hasDoctor = state.availableSlots.some(s => String(s.doctor_id) === String(state.selectedDoctorId));
      if (!hasDoctor) {
        state.selectedDoctorId = "";
        state.selectedCenterId = "";
        state.selectedSlot = null;
      }
    }

    if (state.selectedCenterId) {
      const hasCenter = state.availableSlots.some(s => String(s.medical_center_id) === String(state.selectedCenterId));
      if (!hasCenter) {
        state.selectedCenterId = "";
        state.selectedSlot = null;
      }
    }

    const count = state.availableSlots.length;
    setStatus(count ? `${toFa(count)} نوبت آزاد در بازه انتخاب‌شده پیدا شد.` : "در این بازه نوبت آزادی برای خدمت انتخاب‌شده پیدا نشد.", count ? "success" : "warning");
    renderAll();
  }

  async function selectService(id) {
    state.selectedServiceId = String(id);
    state.selectedDoctorId = "";
    state.selectedCenterId = "";
    state.selectedSlot = null;
    await refreshSlotsForSelection();
  }

  async function selectDoctor(id) {
    state.selectedDoctorId = String(id);
    state.selectedCenterId = "";
    state.selectedSlot = null;
    renderAll();
  }

  function selectCenter(id) {
    state.selectedCenterId = String(id);
    state.selectedSlot = null;
    renderAll();
  }

  function selectSlot(id) {
    const slot = state.availableSlots.find(s => String(s.id) === String(id));
    if (!slot) return;

    state.selectedSlot = slot;
    qs("#nvSelectedSlotId").value = slot.id;

    const oldDate = qs("#appointmentDateJalali");
    const oldTime = qs("#appointmentTime");
    if (oldDate) oldDate.value = jalaliView(slot.slot_date);
    if (oldTime) oldTime.value = String(slot.start_time || "").slice(0, 5);

    renderSlots();
    selectedSummary();
  }

  function bindEvents() {
    const form = qs("#appointmentForm");
    if (!form || form.dataset.nvAppointmentsV2Bound === "1") return;
    form.dataset.nvAppointmentsV2Bound = "1";

    form.addEventListener("click", async (event) => {
      const patientMode = event.target.closest("[data-patient-mode]");
      if (patientMode) {
        state.patientMode = patientMode.dataset.patientMode;
        qsa("[data-patient-mode]", form).forEach(b => b.classList.toggle("active", b === patientMode));
        qs("#nvExistingPatientBox").style.display = state.patientMode === "existing" ? "" : "none";
        qs("#nvNewPatientBox").style.display = state.patientMode === "new" ? "" : "none";
        return;
      }

      const service = event.target.closest("[data-service-id]");
      if (service) {
        await selectService(service.dataset.serviceId);
        return;
      }

      const doctor = event.target.closest("[data-doctor-id]");
      if (doctor) {
        await selectDoctor(doctor.dataset.doctorId);
        return;
      }

      const center = event.target.closest("[data-center-id]");
      if (center) {
        selectCenter(center.dataset.centerId);
        return;
      }

      const slot = event.target.closest("[data-slot-id]");
      if (slot) {
        selectSlot(slot.dataset.slotId);
        return;
      }
    });

    qs("#nvRefreshSlots")?.addEventListener("click", refreshSlotsForSelection);
  }

  async function submitV2() {
    try {
      const slot = state.selectedSlot;
      if (!slot) throw new Error("لطفاً یک نوبت آزاد انتخاب کنید.");

      const type = qs("#appointmentType")?.value || "regular";
      const status = qs("#appointmentStatus")?.value || "pending";
      const notes = qs("#appointmentReason")?.value || "";

      const payload = {
        appointment_slot_id: slot.id,
        type,
        status,
        reason: notes,
        notes
      };

      if (state.patientMode === "existing") {
        const patientId = qs("#patientId")?.value;
        if (!patientId) throw new Error("لطفاً بیمار را انتخاب کنید.");
        payload.patient_id = patientId;
      } else {
        const name = qs("#nvPatientName")?.value?.trim();
        const phone = cleanPhone(qs("#nvPatientPhone")?.value || "");
        if (!name) throw new Error("لطفاً نام بیمار جدید را وارد کنید.");
        if (!phone) throw new Error("لطفاً شماره تماس بیمار جدید را وارد کنید.");
        payload.patient_name = name;
        payload.patient_phone = phone;
      }

      const btn = qs(".modal-footer .btn.btn-primary");
      if (btn) {
        btn.disabled = true;
        btn.dataset.oldText = btn.innerHTML;
        btn.innerHTML = "در حال ثبت...";
      }

      const result = await api("/api/appointments", {
        method: "POST",
        body: JSON.stringify(payload)
      });

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
      const btn = qs(".modal-footer .btn.btn-primary");
      if (btn) {
        btn.disabled = false;
        if (btn.dataset.oldText) btn.innerHTML = btn.dataset.oldText;
      }
    }
  }

  function resetV2() {
    state.selectedServiceId = "";
    state.selectedDoctorId = "";
    state.selectedCenterId = "";
    state.selectedSlot = null;
    state.availableSlots = [];
    state.patientMode = "existing";

    state.dateFrom = todayISO();
    state.dateTo = addMonthsISO(todayISO(), 1);

    const from = qs("#nvDateFrom");
    const to = qs("#nvDateTo");
    if (from) from.value = jalaliView(state.dateFrom);
    if (to) to.value = jalaliView(state.dateTo);

    qs("#appointmentId") && (qs("#appointmentId").value = "");
    qs("#nvSelectedSlotId") && (qs("#nvSelectedSlotId").value = "");
    qs("#appointmentReason") && (qs("#appointmentReason").value = "");
    qs("#nvPatientName") && (qs("#nvPatientName").value = "");
    qs("#nvPatientPhone") && (qs("#nvPatientPhone").value = "");

    qsa("[data-patient-mode]").forEach(b => b.classList.toggle("active", b.dataset.patientMode === "existing"));
    if (qs("#nvExistingPatientBox")) qs("#nvExistingPatientBox").style.display = "";
    if (qs("#nvNewPatientBox")) qs("#nvNewPatientBox").style.display = "none";

    renderAll();
    setStatus("بعد از انتخاب خدمت، پزشک و مرکز، نوبت‌های آزاد نمایش داده می‌شوند.");
  }

  async function initV2() {
    const page = location.pathname.toLowerCase();
    if (!page.includes("/dashboard/") || !page.includes("appointments.html")) return;

    const form = qs("#appointmentForm");
    if (!form) return;

    form.innerHTML = formHtml();

    state.dateFrom = todayISO();
    state.dateTo = addMonthsISO(todayISO(), 1);

    qs("#nvDateFrom").value = jalaliView(state.dateFrom);
    qs("#nvDateTo").value = jalaliView(state.dateTo);

    bindEvents();

    try {
      await Promise.all([loadPatients(), loadServices()]);
      renderAll();
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

    // توابع قدیمی انتخاب نوبت را به مدل جدید وصل می‌کنیم تا اگر جایی صدا زده شد خطا ندهد.
    window.findEarliestAvailableSlot = async function () {
      if (!state.selectedServiceId) return setStatus("ابتدا خدمت را انتخاب کنید.", "warning");
      await refreshSlotsForSelection();
      const first = state.availableSlots[0];
      if (first) {
        if (!state.selectedDoctorId) state.selectedDoctorId = String(first.doctor_id);
        if (!state.selectedCenterId) state.selectedCenterId = String(first.medical_center_id);
        selectSlot(first.id);
        renderAll();
      }
    };

    window.loadAvailableSlotsRange = refreshSlotsForSelection;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initV2);
  } else {
    initV2();
  }
})();
