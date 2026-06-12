// NOORVISTA Doctor Panel V2
// صفحات پنل پزشک را بدون خطای JS و با APIهای فعلی/آینده مدیریت می‌کند.
(function () {
  if (window.__NOORVISTA_DOCTOR_PANEL_V2__) return;
  window.__NOORVISTA_DOCTOR_PANEL_V2__ = true;

  const fa = "۰۱۲۳۴۵۶۷۸۹";
  function toFa(v) { return String(v ?? "").replace(/\d/g, d => fa[Number(d)]); }
  function qs(s, r=document) { return r.querySelector(s); }
  function qsa(s, r=document) { return Array.from(r.querySelectorAll(s)); }
  function esc(v) { return String(v ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[c])); }

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
      throw new Error(data.message || "خطا در دریافت اطلاعات");
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

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function jalali(iso) {
    if (!iso) return "-";
    try {
      return toFa(new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date(String(iso).slice(0,10) + "T00:00:00")));
    } catch (_) {
      return toFa(String(iso).slice(0,10));
    }
  }

  function statusBadge(status) {
    const s = String(status || "pending");
    const map = {
      pending: ["در انتظار", "warning"],
      confirmed: ["تأیید شده", "success"],
      completed: ["انجام شده", "success"],
      cancelled: ["لغو شده", "danger"],
      canceled: ["لغو شده", "danger"],
      available: ["آزاد", "success"],
      full: ["تکمیل", "danger"],
      disabled: ["غیرفعال", "gray"]
    };
    const [label, cls] = map[s] || [s, "gray"];
    return `<span class="nv-badge ${cls}">${esc(label)}</span>`;
  }

  function setHeader() {
    const name = user.full_name || user.fullName || user.name || user.username || "پزشک";
    const n = qs("#userName");
    const a = qs("#userAvatar");

    if (n) n.textContent = name;
    if (a) {
      a.classList.add("nv-header-avatar");
      a.setAttribute("data-nv-avatar-label", "دک");
      a.setAttribute("aria-label", "آواتار پزشک");
    }
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("authToken");
    localStorage.removeItem("noorvista_token");
    localStorage.removeItem("user");
    location.href = "/login";
  }

  window.logout = logout;

  function table(headers, rows, empty = "اطلاعاتی برای نمایش وجود ندارد") {
    if (!rows || !rows.length) {
      return `<div class="nv-empty">${empty}</div>`;
    }

    return `
      <div class="nv-table-wrap">
        <table>
          <thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>
          <tbody>${rows.join("")}</tbody>
        </table>
      </div>
    `;
  }

  async function loadAppointments() {
    const today = todayISO();
    const data = await firstOk([
      "/api/doctor/appointments",
      "/api/appointments?mine=1",
      "/api/appointments"
    ], { appointments: [] });

    let items = arr(data, ["appointments", "items", "data"]);
    items = items.map(x => ({
      id: x.id,
      date: x.appointment_date || x.slot_date || x.date,
      time: x.start_time || x.appointment_time || x.time,
      patient: x.patient_name || x.patient_full_name || x.full_name || "بیمار",
      phone: x.patient_phone || x.phone || "-",
      service: x.service_name || x.type || "-",
      center: x.medical_center_name || x.center_name || "-",
      status: x.status || "pending"
    }));

    return items;
  }

  async function loadPatients() {
    const data = await firstOk([
      "/api/doctor/patients",
      "/api/patients?mine=1",
      "/api/patients"
    ], { patients: [] });

    return arr(data, ["patients", "items", "data"]).map(p => ({
      id: p.id,
      name: p.full_name || p.name || p.patient_name || p.username || "بیمار",
      phone: p.phone || p.mobile || p.patient_phone || "-",
      age: p.age || p.birth_date || "-",
      last_visit: p.last_visit || p.updated_at || p.created_at || ""
    }));
  }

  async function loadRecords() {
    const data = await firstOk([
      "/api/doctor/medical-records",
      "/api/medical-records?mine=1",
      "/api/medical-records"
    ], { records: [] });

    return arr(data, ["records", "medical_records", "items", "data"]);
  }

  async function loadPrescriptions() {
    const data = await firstOk([
      "/api/doctor/prescriptions",
      "/api/prescriptions?mine=1",
      "/api/prescriptions"
    ], { prescriptions: [] });

    return arr(data, ["prescriptions", "items", "data"]);
  }

  async function loadSchedule() {
    const data = await firstOk([
      "/api/doctor/schedule",
      "/api/doctor-schedules?mine=1",
      "/api/doctor-schedules"
    ], { schedules: [] });

    return arr(data, ["schedules", "items", "data"]);
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

  async function renderDashboard(root) {
    root.innerHTML = `<div class="nv-empty">در حال بارگذاری داشبورد پزشک...</div>`;

    const [appointments, patients, schedule] = await Promise.all([
      loadAppointments(),
      loadPatients(),
      loadSchedule()
    ]);

    const today = todayISO();
    const todayItems = appointments.filter(a => String(a.date || "").slice(0,10) === today);
    const upcoming = appointments.filter(a => String(a.date || "").slice(0,10) >= today);

    root.innerHTML = `
      <div class="nv-grid">
        ${statCard("نوبت‌های امروز", todayItems.length, "📅")}
        ${statCard("نوبت‌های آینده", upcoming.length, "⏰")}
        ${statCard("بیماران من", patients.length, "👥")}

        <div class="nv-card span-8">
          <div class="nv-card-header"><h2>نوبت‌های امروز</h2><a class="nv-btn secondary" href="appointments.html">همه نوبت‌ها</a></div>
          <div class="nv-card-body">
            ${table(["ساعت","بیمار","خدمت","مرکز","وضعیت"], todayItems.slice(0,8).map(a => `
              <tr>
                <td>${toFa(String(a.time || "-").slice(0,5))}</td>
                <td>${esc(a.patient)}</td>
                <td>${esc(a.service)}</td>
                <td>${esc(a.center)}</td>
                <td>${statusBadge(a.status)}</td>
              </tr>
            `), "برای امروز نوبتی ثبت نشده است.")}
          </div>
        </div>

        <div class="nv-card span-4">
          <div class="nv-card-header"><h2>برنامه کاری</h2><a class="nv-btn secondary" href="schedule.html">مشاهده</a></div>
          <div class="nv-card-body">
            ${schedule.length ? schedule.slice(0,5).map(s => `
              <div class="nv-empty" style="text-align:right;margin-bottom:8px">
                <strong>${esc(s.service_name || s.service || "خدمت")}</strong><br>
                ${esc(s.medical_center_name || s.center_name || "مرکز")} - ${toFa(String(s.start_time || "-").slice(0,5))} تا ${toFa(String(s.end_time || "-").slice(0,5))}
              </div>
            `).join("") : `<div class="nv-empty">برنامه کاری ثبت نشده است.</div>`}
          </div>
        </div>
      </div>
    `;
  }

  async function renderAppointments(root) {
    root.innerHTML = `<div class="nv-empty">در حال بارگذاری نوبت‌ها...</div>`;
    const items = await loadAppointments();
    root.innerHTML = `
      <div class="nv-card">
        <div class="nv-card-header">
          <h2>نوبت‌های من</h2>
          <button class="nv-btn secondary" onclick="location.reload()">بروزرسانی</button>
        </div>
        <div class="nv-card-body">
          ${table(["تاریخ","ساعت","بیمار","تلفن","خدمت","مرکز","وضعیت"], items.map(a => `
            <tr>
              <td>${jalali(a.date)}</td>
              <td>${toFa(String(a.time || "-").slice(0,5))}</td>
              <td>${esc(a.patient)}</td>
              <td>${toFa(a.phone)}</td>
              <td>${esc(a.service)}</td>
              <td>${esc(a.center)}</td>
              <td>${statusBadge(a.status)}</td>
            </tr>
          `), "نوبتی برای پزشک ثبت نشده است.")}
        </div>
      </div>
    `;
  }

  async function renderPatients(root) {
    root.innerHTML = `<div class="nv-empty">در حال بارگذاری بیماران...</div>`;
    const items = await loadPatients();
    root.innerHTML = `
      <div class="nv-card">
        <div class="nv-card-header"><h2>بیماران من</h2></div>
        <div class="nv-card-body">
          ${table(["نام بیمار","شماره تماس","سن / تاریخ تولد","آخرین مراجعه"], items.map(p => `
            <tr>
              <td>${esc(p.name)}</td>
              <td>${toFa(p.phone)}</td>
              <td>${toFa(p.age)}</td>
              <td>${p.last_visit ? jalali(p.last_visit) : "-"}</td>
            </tr>
          `), "بیماری برای نمایش وجود ندارد.")}
        </div>
      </div>
    `;
  }

  async function renderRecords(root) {
    root.innerHTML = `<div class="nv-empty">در حال بارگذاری پرونده‌ها...</div>`;
    const items = await loadRecords();
    root.innerHTML = `
      <div class="nv-card">
        <div class="nv-card-header"><h2>پرونده‌های پزشکی</h2></div>
        <div class="nv-card-body">
          ${table(["بیمار","عنوان","تشخیص","تاریخ","وضعیت"], items.map(r => `
            <tr>
              <td>${esc(r.patient_name || r.full_name || "-")}</td>
              <td>${esc(r.title || r.record_title || "-")}</td>
              <td>${esc(r.diagnosis || r.summary || "-")}</td>
              <td>${jalali(r.visit_date || r.created_at)}</td>
              <td>${statusBadge(r.status || "confirmed")}</td>
            </tr>
          `), "پرونده‌ای برای نمایش وجود ندارد.")}
        </div>
      </div>
    `;
  }

  async function renderPrescriptions(root) {
    root.innerHTML = `<div class="nv-empty">در حال بارگذاری نسخه‌ها...</div>`;
    const items = await loadPrescriptions();
    root.innerHTML = `
      <div class="nv-card">
        <div class="nv-card-header"><h2>نسخه‌ها / دستورات پزشکی</h2></div>
        <div class="nv-card-body">
          ${table(["بیمار","عنوان","دارو / دستور","تاریخ","وضعیت"], items.map(p => `
            <tr>
              <td>${esc(p.patient_name || "-")}</td>
              <td>${esc(p.title || p.prescription_title || "-")}</td>
              <td>${esc(p.medicine || p.medications || p.instructions || "-")}</td>
              <td>${jalali(p.created_at || p.date)}</td>
              <td>${statusBadge(p.status || "confirmed")}</td>
            </tr>
          `), "نسخه‌ای برای نمایش وجود ندارد.")}
        </div>
      </div>
    `;
  }

  async function renderSchedule(root) {
    root.innerHTML = `<div class="nv-empty">در حال بارگذاری برنامه کاری...</div>`;
    const items = await loadSchedule();
    root.innerHTML = `
      <div class="nv-card">
        <div class="nv-card-header"><h2>برنامه کاری من</h2></div>
        <div class="nv-card-body">
          ${table(["مرکز درمانی","خدمت","روز","ساعت","ظرفیت","وضعیت"], items.map(s => `
            <tr>
              <td>${esc(s.medical_center_name || s.center_name || "-")}</td>
              <td>${esc(s.service_name || "-")}</td>
              <td>${esc(s.day_name || s.day_of_week || "-")}</td>
              <td>${toFa(String(s.start_time || "-").slice(0,5))} تا ${toFa(String(s.end_time || "-").slice(0,5))}</td>
              <td>${toFa(s.capacity_per_slot || s.capacity || "-")}</td>
              <td>${s.is_active === 0 ? statusBadge("disabled") : statusBadge("available")}</td>
            </tr>
          `), "برنامه کاری برای پزشک ثبت نشده است.")}
        </div>
      </div>
    `;
  }

  async function renderProfile(root) {
    const name = user.full_name || user.fullName || user.name || user.username || "";
    const phone = user.phone || user.mobile || "";
    const email = user.email || "";

    root.innerHTML = `
      <div class="nv-card">
        <div class="nv-card-header"><h2>پروفایل من</h2></div>
        <div class="nv-card-body">
          <form class="nv-form" id="doctorProfileForm">
            <div class="nv-form-field">
              <label>نام و نام خانوادگی</label>
              <input id="profileFullName" value="${esc(name)}" placeholder="نام پزشک">
            </div>
            <div class="nv-form-field">
              <label>شماره تماس</label>
              <input id="profilePhone" value="${esc(toFa(phone))}" placeholder="۰۹۱۲۱۲۳۴۵۶۷">
            </div>
            <div class="nv-form-field full">
              <label>ایمیل</label>
              <input id="profileEmail" value="${esc(email)}" placeholder="doctor@example.com" dir="ltr">
            </div>
            <div class="nv-form-field full">
              <button type="submit" class="nv-btn">ذخیره اطلاعات</button>
            </div>
          </form>
        </div>
      </div>
    `;

    qs("#doctorProfileForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = {
        full_name: qs("#profileFullName").value.trim(),
        phone: String(qs("#profilePhone").value).replace(/[۰-۹]/g, d => String(fa.indexOf(d))),
        email: qs("#profileEmail").value.trim()
      };

      for (const url of ["/api/doctor/profile", "/api/users/profile", "/api/profile"]) {
        try {
          await api(url, { method: "PATCH", body: JSON.stringify(payload) });
          break;
        } catch (_) {}
      }

      const next = { ...user, ...payload };
      localStorage.setItem("user", JSON.stringify(next));
      alert("اطلاعات پروفایل ذخیره شد.");
    });
  }

  async function render() {
    if (!token) {
      location.href = "/login";
      return;
    }

    setHeader();

    const root = qs("#doctorPageContent");
    if (!root) return;

    const page = document.body.dataset.doctorPage || "index";

    try {
      if (page === "index") await renderDashboard(root);
      else if (page === "appointments") await renderAppointments(root);
      else if (page === "patients") await renderPatients(root);
      else if (page === "medical-records") await renderRecords(root);
      else if (page === "prescriptions") await renderPrescriptions(root);
      else if (page === "schedule") await renderSchedule(root);
      else if (page === "profile") await renderProfile(root);
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

