// NOORVISTA public booking v2
// Service -> available slots -> patient info -> transaction-based appointment booking
(function () {
  if (window.__NOORVISTA_PUBLIC_BOOKING_V2__) return;
  window.__NOORVISTA_PUBLIC_BOOKING_V2__ = true;

  const state = {
    services: [],
    slots: [],
    selectedServiceId: "",
    selectedSlotId: ""
  };

  function $(selector) {
    return document.querySelector(selector);
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, function (ch) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[ch];
    });
  }

  function injectStyles() {
    if ($("#publicBookingV2Style")) return;
    const style = document.createElement("style");
    style.id = "publicBookingV2Style";
    style.textContent = `
      .booking-v2-modal{position:fixed;inset:0;background:rgba(15,23,42,.54);backdrop-filter:blur(8px);z-index:5000;display:none;align-items:center;justify-content:center;padding:18px}
      .booking-v2-modal.open{display:flex}
      .booking-v2-card{width:min(760px,100%);max-height:calc(100vh - 36px);overflow:hidden;background:#fff;border-radius:28px;box-shadow:0 28px 88px rgba(15,23,42,.24);display:flex;flex-direction:column;border:1px solid #bae6fd}
      .booking-v2-header{padding:20px 22px;border-bottom:1px solid #e0f2fe;display:flex;align-items:center;justify-content:space-between;gap:12px;background:linear-gradient(180deg,#f8fbff,#fff)}
      .booking-v2-header h3{margin:0;color:#0f172a;font-size:21px;font-weight:950}
      .booking-v2-header p{margin:4px 0 0;color:#64748b;font-size:13px;line-height:1.8}
      .booking-v2-close{border:0;background:#fee2e2;color:#b91c1c;width:38px;height:38px;border-radius:14px;font-size:24px;cursor:pointer}
      .booking-v2-body{padding:22px;overflow:auto}
      .booking-v2-step{display:none}.booking-v2-step.active{display:block}
      .booking-v2-grid{display:grid;gap:12px}.booking-v2-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      .booking-v2-field label{display:block;margin-bottom:7px;color:#334155;font-size:12px;font-weight:950}
      .booking-v2-field input,.booking-v2-field select{width:100%;min-height:46px;border:1px solid #cbd5e1;border-radius:14px;background:#f8fafc;padding:10px 12px;font-family:inherit;font-size:14px;outline:none}
      .booking-v2-field input:focus,.booking-v2-field select:focus{border-color:#38bdf8;box-shadow:0 0 0 4px rgba(56,189,248,.16);background:#fff}
      .booking-v2-slots{display:grid;gap:10px;margin-top:14px;max-height:360px;overflow:auto}
      .booking-v2-slot{border:1px solid #dbeafe;border-radius:18px;background:#f8fbff;padding:14px;cursor:pointer;text-align:right;transition:.18s ease}
      .booking-v2-slot:hover,.booking-v2-slot.selected{background:#e0f2fe;border-color:#38bdf8}
      .booking-v2-slot strong{display:block;color:#075985;margin-bottom:5px}
      .booking-v2-slot small{display:block;color:#475569;line-height:1.9}
      .booking-v2-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px;flex-wrap:wrap}
      .booking-v2-btn{min-height:44px;border:0;border-radius:14px;padding:10px 16px;font-family:inherit;font-weight:950;cursor:pointer}
      .booking-v2-primary{background:linear-gradient(135deg,#0891b2,#075985);color:#fff}
      .booking-v2-secondary{background:#e0f2fe;color:#075985}
      .booking-v2-empty{padding:20px;border-radius:18px;background:#f8fbff;border:1px solid #dbeafe;color:#64748b;text-align:center;line-height:2}
      .booking-v2-success{padding:24px;border-radius:22px;background:#ecfdf5;border:1px solid #bbf7d0;text-align:center;color:#047857;line-height:2}
      @media(max-width:640px){.booking-v2-row{grid-template-columns:1fr}.booking-v2-card{border-radius:22px}.booking-v2-body{padding:16px}}
    `;
    document.head.appendChild(style);
  }

  async function api(url, options) {
    const res = await fetch(url, Object.assign({ headers: { "Content-Type": "application/json", "Accept": "application/json" } }, options || {}));
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) throw new Error(data.message || "خطا در ارتباط با سرور");
    return data;
  }

  function ensureModal() {
    injectStyles();
    let modal = $("#bookingV2Modal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "bookingV2Modal";
    modal.className = "booking-v2-modal";
    modal.innerHTML = `
      <div class="booking-v2-card" role="dialog" aria-modal="true" aria-labelledby="bookingV2Title">
        <div class="booking-v2-header">
          <div>
            <h3 id="bookingV2Title">رزرو نوبت آنلاین</h3>
            <p>ابتدا خدمت را انتخاب کنید، سپس نوبت آزاد را بر اساس ظرفیت باقی‌مانده رزرو کنید.</p>
          </div>
          <button type="button" class="booking-v2-close" id="bookingV2Close" aria-label="بستن">×</button>
        </div>
        <div class="booking-v2-body">
          <div class="booking-v2-step active" data-step="1">
            <div class="booking-v2-grid">
              <div class="booking-v2-field">
                <label>خدمت مورد نظر</label>
                <select id="bookingV2Service"></select>
              </div>
              <div class="booking-v2-row">
                <div class="booking-v2-field"><label>از تاریخ</label><input type="date" id="bookingV2DateFrom"></div>
                <div class="booking-v2-field"><label>تا تاریخ</label><input type="date" id="bookingV2DateTo"></div>
              </div>
            </div>
            <div id="bookingV2Slots" class="booking-v2-slots"><div class="booking-v2-empty">در حال دریافت نوبت‌ها...</div></div>
            <div class="booking-v2-actions">
              <button type="button" class="booking-v2-btn booking-v2-primary" id="bookingV2Next">ادامه ثبت اطلاعات</button>
            </div>
          </div>
          <div class="booking-v2-step" data-step="2">
            <div class="booking-v2-grid">
              <div class="booking-v2-row">
                <div class="booking-v2-field"><label>نام و نام خانوادگی</label><input type="text" id="bookingV2Name" required></div>
                <div class="booking-v2-field"><label>شماره موبایل</label><input type="tel" id="bookingV2Phone" required dir="ltr"></div>
              </div>
              <div class="booking-v2-field"><label>توضیحات اختیاری</label><input type="text" id="bookingV2Notes" placeholder="مثلاً سابقه جراحی، مشکل اصلی یا توضیح کوتاه"></div>
            </div>
            <div class="booking-v2-actions">
              <button type="button" class="booking-v2-btn booking-v2-secondary" id="bookingV2Back">بازگشت</button>
              <button type="button" class="booking-v2-btn booking-v2-primary" id="bookingV2Submit">ثبت نوبت</button>
            </div>
          </div>
          <div class="booking-v2-step" data-step="3">
            <div class="booking-v2-success">
              <strong>نوبت شما ثبت شد.</strong>
              <div>کد پیگیری: <span id="bookingV2Tracking"></span></div>
            </div>
            <div class="booking-v2-actions">
              <button type="button" class="booking-v2-btn booking-v2-primary" id="bookingV2Done">باشه</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    bindModalEvents();
    return modal;
  }

  function showStep(step) {
    document.querySelectorAll(".booking-v2-step").forEach((el) => el.classList.toggle("active", el.dataset.step === String(step)));
  }

  async function loadServices() {
    const data = await api("/api/services");
    state.services = Array.isArray(data.services) ? data.services : [];
    const select = $("#bookingV2Service");
    select.innerHTML = '<option value="">انتخاب خدمت</option>' + state.services.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");
  }

  async function loadSlots() {
    const box = $("#bookingV2Slots");
    if (!box) return;
    const serviceId = $("#bookingV2Service")?.value || "";
    const from = $("#bookingV2DateFrom")?.value || "";
    const to = $("#bookingV2DateTo")?.value || "";
    state.selectedServiceId = serviceId;
    state.selectedSlotId = "";
    if (!serviceId) {
      box.innerHTML = '<div class="booking-v2-empty">ابتدا خدمت مورد نظر را انتخاب کنید.</div>';
      return;
    }

    box.innerHTML = '<div class="booking-v2-empty">در حال دریافت نوبت‌های آزاد...</div>';
    const params = new URLSearchParams({ service_id: serviceId });
    if (from) params.set("date_from", from);
    if (to) params.set("date_to", to);

    try {
      const data = await api(`/api/appointment-slots/available?${params}`);
      state.slots = Array.isArray(data.slots) ? data.slots : [];
      if (!state.slots.length) {
        box.innerHTML = '<div class="booking-v2-empty">برای این خدمت در بازه انتخاب‌شده نوبت آزاد وجود ندارد.</div>';
        return;
      }
      box.innerHTML = state.slots.map((slot) => `
        <button type="button" class="booking-v2-slot" data-slot-id="${slot.id}">
          <strong>${escapeHtml(slot.slot_date)} | ${escapeHtml(slot.start_time)} تا ${escapeHtml(slot.end_time)}</strong>
          <small>پزشک: ${escapeHtml(slot.doctor_name || "-")} | مرکز: ${escapeHtml(slot.medical_center_name || "-")}</small>
          <small>ظرفیت باقی‌مانده: ${escapeHtml(slot.remaining_capacity)} نفر</small>
        </button>
      `).join("");
    } catch (error) {
      box.innerHTML = `<div class="booking-v2-empty">${escapeHtml(error.message)}</div>`;
    }
  }

  async function openBooking() {
    const modal = ensureModal();
    modal.classList.add("open");
    showStep(1);

    const today = new Date().toISOString().slice(0, 10);
    const to = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    $("#bookingV2DateFrom").value = today;
    $("#bookingV2DateTo").value = to;

    await loadServices();
    await loadSlots();
  }

  function closeBooking() {
    $("#bookingV2Modal")?.classList.remove("open");
  }

  function bindModalEvents() {
    document.addEventListener("click", async function (event) {
      const slotBtn = event.target.closest(".booking-v2-slot");
      if (slotBtn) {
        document.querySelectorAll(".booking-v2-slot").forEach((el) => el.classList.remove("selected"));
        slotBtn.classList.add("selected");
        state.selectedSlotId = slotBtn.dataset.slotId;
      }

      if (event.target.id === "bookingV2Close" || event.target.id === "bookingV2Done") closeBooking();
      if (event.target.id === "bookingV2Modal") closeBooking();

      if (event.target.id === "bookingV2Next") {
        if (!state.selectedSlotId) return alert("لطفاً یک نوبت آزاد انتخاب کنید.");
        showStep(2);
      }

      if (event.target.id === "bookingV2Back") showStep(1);

      if (event.target.id === "bookingV2Submit") {
        const name = $("#bookingV2Name").value.trim();
        const phone = $("#bookingV2Phone").value.trim();
        if (!name || !phone) return alert("نام و شماره موبایل الزامی است.");

        try {
          const data = await api("/api/appointments", {
            method: "POST",
            body: JSON.stringify({
              appointment_slot_id: state.selectedSlotId,
              patient_name: name,
              patient_phone: phone,
              notes: $("#bookingV2Notes").value.trim()
            })
          });
          $("#bookingV2Tracking").textContent = data.tracking_code || "-";
          showStep(3);
        } catch (error) {
          alert(error.message || "خطا در ثبت نوبت");
          loadSlots();
          showStep(1);
        }
      }
    });

    ["bookingV2Service", "bookingV2DateFrom", "bookingV2DateTo"].forEach((id) => {
      document.addEventListener("change", function (event) {
        if (event.target.id === id) loadSlots();
      });
    });
  }

  document.addEventListener("click", function (event) {
    const btn = event.target.closest(".nav-booking, .open-booking, .floating-booking");
    if (!btn) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openBooking();
  }, true);
})();
