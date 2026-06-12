// NOORVISTA Secretary Panel V2
// پنل منشی: نوبت‌ها، ثبت نوبت، بیماران، صف پذیرش، پرداخت‌ها
(function () {
  if (window.__NOORVISTA_SECRETARY_PANEL_V2__) return;
  window.__NOORVISTA_SECRETARY_PANEL_V2__ = true;

  const fa = "۰۱۲۳۴۵۶۷۸۹";
  const ar = "٠١٢٣٤٥٦٧٨٩";
  function toFa(v) { return String(v ?? "").replace(/\d/g, d => fa[Number(d)]); }
  function toEn(v) {
    return String(v ?? "")
      .replace(/[۰-۹]/g, d => String(fa.indexOf(d)))
      .replace(/[٠-٩]/g, d => String(ar.indexOf(d)));
  }
  function qs(s, r=document) { return r.querySelector(s); }
  function qsa(s, r=document) { return Array.from(r.querySelectorAll(s)); }
  function esc(v) { return String(v ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[c])); }
  function cleanPhone(v) { return toEn(v).replace(/[^\d+]/g, "").replace(/(?!^)\+/g, ""); }

  const token = localStorage.getItem("token") || localStorage.getItem("authToken") || localStorage.getItem("noorvista_token");
  let user = {};
  try { user = JSON.parse(localStorage.getItem("user") || localStorage.getItem("currentUser") || "{}"); } catch (_) {}

  function headers() {
    return {
      "Accept": "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
  }

  async function api(url, opts = {}) {
    const res = await fetch(url, { ...opts, headers: { ...headers(), ...(opts.headers || {}) } });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) {
      throw new Error(data.message || "دسترسی غیرمجاز یا پایان نشست کاربری");
    }
    if (!res.ok || data.success === false) {
      throw new Error(data.message || "خطا در ارتباط با سرور");
    }
    return data;
  }

  async function firstOk(urls, fallback = {}) {
    for (const url of urls) {
      try { return await api(url); } catch (_) {}
    }
    return fallback;
  }

  function arr(data, keys = []) {
    if (Array.isArray(data)) return data;
    for (const k of keys) {
      if (Array.isArray(data?.[k])) return data[k];
      if (Array.isArray(data?.data?.[k])) return data.data[k];
    }
    return [];
  }

  function todayISO() { return new Date().toISOString().slice(0, 10); }

  function jalali(iso) {
    if (!iso) return "-";
    try {
      return toFa(new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date(String(iso).slice(0,10) + "T00:00:00")));
    } catch (_) {
      return toFa(String(iso).slice(0,10));
    }
  }

  function time(v) { return toFa(String(v || "").slice(0, 5) || "-"); }

  function statusBadge(status) {
    const s = String(status || "pending");
    const map = {
      pending: ["در انتظار", "warning"],
      confirmed: ["تأیید شده", "success"],
      completed: ["انجام شده", "success"],
      cancelled: ["لغو شده", "danger"],
      canceled: ["لغو شده", "danger"],
      checked_in: ["پذیرش شده", "success"],
      waiting: ["در صف", "warning"],
      paid: ["پرداخت شده", "success"],
      unpaid: ["پرداخت نشده", "danger"],
      partial: ["پرداخت ناقص", "warning"]
    };
    const [label, cls] = map[s] || [s, "gray"];
    return `<span class="nv-badge ${cls}">${esc(label)}</span>`;
  }

  function setHeader() {
    const name = user.full_name || user.fullName || user.name || user.username || "منشی";
    const n = qs("#userName");
    const a = qs("#userAvatar");
    if (n) n.textContent = name;
    if (a) {
      a.classList.add("nv-header-avatar");
      a.setAttribute("data-nv-avatar-label", "من");
      a.setAttribute("aria-label", "آواتار منشی");
    }
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("authToken");
    localStorage.removeItem("noorvista_token");
    location.href = "/login";
  }
  window.logout = logout;

  function table(headers, rows, empty = "اطلاعاتی برای نمایش وجود ندارد") {
    if (!rows || !rows.length) return `<div class="nv-empty">${empty}</div>`;
    return `
      <div class="nv-table-wrap">
        <table>
          <thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>
          <tbody>${rows.join("")}</tbody>
        </table>
      </div>
    `;
  }

  function statCard(label, value, icon) {
    return `
      <div class="nv-card span-4">
        <div class="nv-card-body nv-stat">
          <div class="nv-stat-icon">${icon}</div>
          <div>
            <div class="nv-stat-value">${toFa(value)}</div>
            <div class="nv-stat-label">${label}</div>
          </div>
        </div>
      </div>
    `;
  }

  async function loadAppointments() {
    const data = await firstOk([
      "/api/secretary/appointments",
      "/api/appointments",
      "/api/admin/appointments"
    ], { appointments: [] });

    return arr(data, ["appointments", "items", "data"]).map(x => ({
      id: x.id,
      date: x.appointment_date || x.slot_date || x.date,
      time: x.start_time || x.appointment_time || x.time,
      patient: x.patient_name || x.patient_full_name || x.full_name || "بیمار",
      phone: x.patient_phone || x.phone || x.mobile || "-",
      doctor: x.doctor_name || "پزشک",
      service: x.service_name || x.type || "-",
      center: x.medical_center_name || x.center_name || "-",
      status: x.status || "pending",
      payment_status: x.payment_status || x.paymentStatus || "unpaid"
    }));
  }

  async function loadPatients() {
    const data = await firstOk([
      "/api/secretary/patients",
      "/api/patients",
      "/api/admin/patients"
    ], { patients: [] });

    return arr(data, ["patients", "items", "data"]).map(p => ({
      id: p.id,
      name: p.full_name || p.name || p.patient_name || p.username || "بیمار",
      phone: p.phone || p.mobile || p.patient_phone || "-",
      national_code: p.national_code || p.nationalCode || "-",
      created_at: p.created_at || p.createdAt || ""
    }));
  }

  async function loadPayments() {
    const data = await firstOk([
      "/api/secretary/payments",
      "/api/payments",
      "/api/admin/payments"
    ], { payments: [] });

    return arr(data, ["payments", "items", "data"]).map(p => ({
      id: p.id,
      patient: p.patient_name || p.full_name || "-",
      amount: p.amount || p.price || p.total || 0,
      method: p.method || p.payment_method || "-",
      status: p.status || p.payment_status || "unpaid",
      date: p.created_at || p.payment_date || p.date
    }));
  }

  async function renderDashboard(root) {
    root.innerHTML = `<div class="nv-empty">در حال بارگذاری داشبورد منشی...</div>`;
    const [appointments, patients, payments] = await Promise.all([loadAppointments(), loadPatients(), loadPayments()]);
    const today = todayISO();
    const todayAppointments = appointments.filter(a => String(a.date || "").slice(0,10) === today);
    const waiting = appointments.filter(a => ["pending","waiting","confirmed"].includes(String(a.status || "")));

    root.innerHTML = `
      <div class="nv-grid">
        ${statCard("نوبت‌های امروز", todayAppointments.length, "📅")}
        ${statCard("در صف پذیرش", waiting.length, "🧾")}
        ${statCard("بیماران ثبت‌شده", patients.length, "👥")}

        <div class="nv-card span-8">
          <div class="nv-card-header">
            <h2>نوبت‌های امروز</h2>
            <div class="nv-quick-actions">
              <a class="nv-btn secondary" href="appointments.html">همه نوبت‌ها</a>
              <a class="nv-btn" href="appointments.html#new">ثبت نوبت جدید</a>
            </div>
          </div>
          <div class="nv-card-body">
            ${table(["ساعت","بیمار","پزشک","خدمت","وضعیت"], todayAppointments.slice(0, 10).map(a => `
              <tr>
                <td>${time(a.time)}</td>
                <td>${esc(a.patient)}<br><small>${toFa(a.phone)}</small></td>
                <td>${esc(a.doctor)}</td>
                <td>${esc(a.service)}</td>
                <td>${statusBadge(a.status)}</td>
              </tr>
            `), "برای امروز نوبتی ثبت نشده است.")}
          </div>
        </div>

        <div class="nv-card span-4">
          <div class="nv-card-header"><h2>دسترسی سریع</h2></div>
          <div class="nv-card-body">
            <div class="nv-quick-actions" style="display:grid">
              <a class="nv-btn" href="appointments.html#new">ثبت نوبت جدید</a>
              <a class="nv-btn secondary" href="patients.html">ثبت / مشاهده بیمار</a>
              <a class="nv-btn secondary" href="queue.html">صف پذیرش</a>
              <a class="nv-btn secondary" href="payments.html">پرداخت‌ها</a>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function openAppointmentModal() {
    const modal = qs("#appointmentFormModal");
    if (modal) {
      modal.classList.add("show");
      document.body.style.overflow = "hidden";
    } else if (typeof window.openAddModal === "function") {
      window.openAddModal();
    }
  }

  function closeAppointmentModal() {
    const modal = qs("#appointmentFormModal");
    if (modal) {
      modal.classList.remove("show");
      document.body.style.overflow = "";
    }
  }

  async function renderAppointments(root) {
    root.innerHTML = `<div class="nv-empty">در حال بارگذاری نوبت‌ها...</div>`;
    const items = await loadAppointments();

    root.innerHTML = `
      <div class="nv-card">
        <div class="nv-card-header">
          <h2>مدیریت نوبت‌ها</h2>
          <div class="nv-quick-actions">
            <button class="nv-btn" id="openAppointmentModal">ثبت نوبت جدید</button>
            <button class="nv-btn secondary" onclick="location.reload()">بروزرسانی</button>
          </div>
        </div>
        <div class="nv-card-body">
          <div class="nv-searchbar">
            <input id="appointmentSearch" placeholder="جستجو بر اساس نام بیمار، پزشک یا خدمت...">
            <button class="nv-btn secondary" id="clearSearch">پاک کردن</button>
          </div>
          <div id="appointmentsTable">
            ${appointmentTable(items)}
          </div>
        </div>
      </div>

      <div class="nv-modal" id="appointmentFormModal">
        <div class="nv-modal-dialog">
          <div class="nv-modal-header">
            <h2>ثبت نوبت جدید</h2>
            <button class="nv-modal-close" type="button" id="closeAppointmentModal">×</button>
          </div>
          <div class="nv-modal-body">
            <form id="appointmentForm">
              <div class="nv-empty">در حال آماده‌سازی فرم نوبت‌دهی...</div>
            </form>
          </div>
          <div class="nv-modal-footer">
            <button class="nv-btn secondary" type="button" id="cancelAppointmentModal">انصراف</button>
            <button class="nv-btn" type="button" id="submitAppointmentBtn"><span id="formSubmitText">ثبت نوبت</span></button>
          </div>
        </div>
      </div>
    `;

    window.openAddModal = openAppointmentModal;
    window.closeModal = closeAppointmentModal;

    qs("#openAppointmentModal")?.addEventListener("click", openAppointmentModal);
    qs("#closeAppointmentModal")?.addEventListener("click", closeAppointmentModal);
    qs("#cancelAppointmentModal")?.addEventListener("click", closeAppointmentModal);
    qs("#submitAppointmentBtn")?.addEventListener("click", function () {
      if (typeof window.submitAppointmentForm === "function") window.submitAppointmentForm();
      else alert("فرم نوبت‌دهی هنوز آماده نشده است.");
    });

    qs("#appointmentSearch")?.addEventListener("input", function () {
      const q = this.value.trim();
      const filtered = !q ? items : items.filter(a => [a.patient, a.doctor, a.service, a.center, a.phone].some(v => String(v || "").includes(q)));
      qs("#appointmentsTable").innerHTML = appointmentTable(filtered);
    });

    qs("#clearSearch")?.addEventListener("click", function () {
      qs("#appointmentSearch").value = "";
      qs("#appointmentsTable").innerHTML = appointmentTable(items);
    });

    if (location.hash === "#new") {
      setTimeout(openAppointmentModal, 400);
    }

    // اگر appointments-v2 در صفحه وجود دارد، بعد از ساخت فرم آن را راه‌اندازی می‌کند.
    if (window.__NOORVISTA_APPOINTMENTS_V2__) {
      // already loaded
    }
  }

  function appointmentTable(items) {
    return table(["تاریخ","ساعت","بیمار","پزشک","خدمت","مرکز","وضعیت","پرداخت"], items.map(a => `
      <tr>
        <td>${jalali(a.date)}</td>
        <td>${time(a.time)}</td>
        <td>${esc(a.patient)}<br><small>${toFa(a.phone)}</small></td>
        <td>${esc(a.doctor)}</td>
        <td>${esc(a.service)}</td>
        <td>${esc(a.center)}</td>
        <td>${statusBadge(a.status)}</td>
        <td>${statusBadge(a.payment_status)}</td>
      </tr>
    `), "نوبتی برای نمایش وجود ندارد.");
  }

  async function renderPatients(root) {
    root.innerHTML = `<div class="nv-empty">در حال بارگذاری بیماران...</div>`;
    const items = await loadPatients();
    root.innerHTML = `
      <div class="nv-card">
        <div class="nv-card-header">
          <h2>بیماران</h2>
          <button class="nv-btn secondary" onclick="location.reload()">بروزرسانی</button>
        </div>
        <div class="nv-card-body">
          ${table(["نام بیمار","شماره تماس","کد ملی","تاریخ ثبت"], items.map(p => `
            <tr>
              <td>${esc(p.name)}</td>
              <td>${toFa(p.phone)}</td>
              <td>${toFa(p.national_code)}</td>
              <td>${p.created_at ? jalali(p.created_at) : "-"}</td>
            </tr>
          `), "بیماری برای نمایش وجود ندارد.")}
        </div>
      </div>
    `;
  }

  async function renderQueue(root) {
    root.innerHTML = `<div class="nv-empty">در حال بارگذاری صف پذیرش...</div>`;
    const items = (await loadAppointments()).filter(a => ["pending","confirmed","waiting","checked_in"].includes(String(a.status || "")));
    root.innerHTML = `
      <div class="nv-card">
        <div class="nv-card-header">
          <h2>صف پذیرش</h2>
          <a class="nv-btn" href="appointments.html#new">ثبت نوبت جدید</a>
        </div>
        <div class="nv-card-body">
          ${items.length ? items.map(a => `
            <div class="nv-reception-card">
              <strong>${esc(a.patient)} - ${time(a.time)}</strong>
              <small>پزشک: ${esc(a.doctor)} | خدمت: ${esc(a.service)} | مرکز: ${esc(a.center)}</small>
              <div class="nv-inline-actions">
                ${statusBadge(a.status)}
                <button class="nv-btn secondary" type="button">جزئیات</button>
              </div>
            </div>
          `).join("") : `<div class="nv-empty">صف پذیرش خالی است.</div>`}
        </div>
      </div>
    `;
  }

  async function renderPayments(root) {
    root.innerHTML = `<div class="nv-empty">در حال بارگذاری پرداخت‌ها...</div>`;
    const items = await loadPayments();
    root.innerHTML = `
      <div class="nv-card">
        <div class="nv-card-header"><h2>پرداخت‌ها</h2></div>
        <div class="nv-card-body">
          ${table(["بیمار","مبلغ","روش پرداخت","وضعیت","تاریخ"], items.map(p => `
            <tr>
              <td>${esc(p.patient)}</td>
              <td>${toFa(Number(p.amount || 0).toLocaleString("fa-IR"))} تومان</td>
              <td>${esc(p.method)}</td>
              <td>${statusBadge(p.status)}</td>
              <td>${p.date ? jalali(p.date) : "-"}</td>
            </tr>
          `), "پرداختی برای نمایش وجود ندارد.")}
        </div>
      </div>
    `;
  }

  async function render() {
    if (!token) {
      location.href = "/login";
      return;
    }

    setHeader();

    const root = qs("#secretaryPageContent");
    if (!root) return;

    const page = document.body.dataset.secretaryPage || "index";

    try {
      if (page === "index") await renderDashboard(root);
      else if (page === "appointments") await renderAppointments(root);
      else if (page === "patients") await renderPatients(root);
      else if (page === "queue") await renderQueue(root);
      else if (page === "payments") await renderPayments(root);
    } catch (error) {
      root.innerHTML = `<div class="nv-empty">خطا در بارگذاری صفحه: ${esc(error.message)}</div>`;
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render);
  else render();
})();


/* NOORVISTA unified pretty selects loader */
(function(){
  if (!/\/dashboard\//i.test(location.pathname)) return;
  if (!document.querySelector('link[href="/assets/css/panel-pretty-selects-global.css"]')) {
    var l=document.createElement('link');
    l.rel='stylesheet';
    l.href='/assets/css/panel-pretty-selects-global.css';
    document.head.appendChild(l);
  }
  if (!window.__NOORVISTA_PRETTY_SELECT_LOADER_SCRIPT__ && !document.querySelector('script[src="/assets/js/panel-pretty-selects-global.js"]')) {
    window.__NOORVISTA_PRETTY_SELECT_LOADER_SCRIPT__ = true;
    var s=document.createElement('script');
    s.src='/assets/js/panel-pretty-selects-global.js';
    s.defer=true;
    document.head.appendChild(s);
  }
})();

