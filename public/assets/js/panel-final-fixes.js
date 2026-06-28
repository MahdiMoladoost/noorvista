

// NOORVISTA role-based sidebar standardizer
// پزشک، منشی و بیمار را بدون تغییر HTML صفحات، با منوی استاندارد نقش‌محور هماهنگ می‌کند.
(function () {
  if (window.__NOORVISTA_ROLE_SIDEBAR_STANDARDIZER__) return;
  window.__NOORVISTA_ROLE_SIDEBAR_STANDARDIZER__ = true;

  const MENUS = {
    doctor: [
      { file: "index.html", label: "داشبورد", icon: "icon-dashboard" },
      { file: "appointments.html", label: "نوبت‌های من", icon: "icon-calendar" },
      { file: "patients.html", label: "بیماران من", icon: "icon-patients" },
      { file: "medical-records.html", label: "پرونده‌های پزشکی", icon: "icon-database" },
      { file: "prescriptions.html", label: "نسخه‌ها / دستورات پزشکی", icon: "icon-comments" },
      { file: "schedule.html", label: "برنامه کاری من", icon: "icon-clock" },
      { file: "profile.html", label: "اطلاعات حساب من", icon: "icon-user" }
    ],
    secretary: [
      { file: "index.html", label: "داشبورد", icon: "icon-dashboard" },
      { file: "appointments.html", label: "نوبت‌ها", icon: "icon-calendar" },
      { file: "appointments.html#new", label: "ثبت نوبت جدید", icon: "icon-clock", match: "appointments.html" },
      { file: "patients.html", label: "بیماران", icon: "icon-patients" },
      { file: "queue.html", label: "صف پذیرش", icon: "icon-briefcase" },
      { file: "payments.html", label: "پرداخت‌ها", icon: "icon-credit-card" },
      { file: "notifications.html", label: "اعلانات / پیام‌ها", icon: "icon-bell", optional: true }
    ],
    patient: [
      { file: "index.html", label: "داشبورد", icon: "icon-dashboard" },
      { file: "appointments.html#book", label: "دریافت نوبت", icon: "icon-clock", match: "appointments.html" },
      { file: "appointments.html", label: "نوبت‌های من", icon: "icon-calendar" },
      { file: "medical-records.html", label: "پرونده پزشکی", icon: "icon-database" },
      { file: "prescriptions.html", label: "نسخه‌ها", icon: "icon-comments" },
      { file: "payments.html", label: "پرداخت‌ها", icon: "icon-credit-card" },
      { file: "profile.html", label: "اطلاعات حساب", icon: "icon-user" }
    ]
  };

  function getRoleFromPath() {
    const path = window.location.pathname.toLowerCase();

    if (path.includes("/dashboard/doctor/")) return "doctor";
    if (path.includes("/dashboard/secretary/")) return "secretary";
    if (path.includes("/dashboard/patient/")) return "patient";

    return "";
  }

  function currentFileName() {
    const clean = window.location.pathname.split("?")[0].split("#")[0];
    const last = clean.split("/").filter(Boolean).pop() || "index.html";
    return last.includes(".") ? last : "index.html";
  }

  function existingFilesInSidebar(sidebar) {
    return new Set(
      Array.from(sidebar.querySelectorAll(".nav-link[href]")).map((a) => {
        const href = a.getAttribute("href") || "";
        return href.split("?")[0].split("#")[0].split("/").filter(Boolean).pop() || "index.html";
      })
    );
  }

  function createNavItem(item, current, availableFiles) {
    if (item.optional) {
      const fileOnly = item.file.split("#")[0].split("?")[0];
      if (!availableFiles.has(fileOnly)) return "";
    }

    const fileOnly = item.file.split("#")[0].split("?")[0];
    const match = item.match || fileOnly;
    const isActive = current === match && !item.file.includes("#new") && !item.file.includes("#book");

    return `
      <li class="nav-item">
        <a class="nav-link ${isActive ? "active" : ""}" href="${item.file}" data-sidebar-match="${match}">
          <i class="${item.icon}"></i>
          <span>${item.label}</span>
        </a>
      </li>
    `;
  }

  function standardizeRoleSidebar() {
    if (window.__NOORVISTA_UNIFIED_SHELL__ || document.body?.classList.contains('nv-unified-shell-ready')) return;
    const role = getRoleFromPath();
    if (!role || !MENUS[role]) return;

    const sidebar = document.querySelector(".sidebar");
    const nav = sidebar?.querySelector(".sidebar-nav");
    if (!sidebar || !nav) return;

    const current = currentFileName();
    const available = existingFilesInSidebar(sidebar);

    nav.innerHTML = MENUS[role]
      .map((item) => createNavItem(item, current, available))
      .join("");

    // اگر hash دریافت یا ثبت نوبت است، active را روی آیتم مناسب بگذاریم.
    const hash = window.location.hash;
    if (hash === "#book") {
      nav.querySelectorAll(".nav-link").forEach((a) => a.classList.remove("active"));
      const booking = nav.querySelector('.nav-link[href="appointments.html#book"]');
      if (booking) booking.classList.add("active");
    } else if (hash === "#new") {
      nav.querySelectorAll(".nav-link").forEach((a) => a.classList.remove("active"));
      const newAppointment = nav.querySelector('.nav-link[href="appointments.html#new"]');
      if (newAppointment) newAppointment.classList.add("active");
    }
  }

  function handleHashAction() {
    const hash = window.location.hash;
    const path = window.location.pathname.toLowerCase();

    if (hash === "#new" && path.includes("/dashboard/secretary/appointments.html")) {
      setTimeout(function () {
        if (typeof window.openAddModal === "function") window.openAddModal();
      }, 350);
    }

    if (hash === "#book" && path.includes("/dashboard/patient/appointments.html")) {
      setTimeout(function () {
        if (typeof window.openAddModal === "function") window.openAddModal();
      }, 350);
    }
  }

  function init() {
    standardizeRoleSidebar();
    handleHashAction();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.addEventListener("hashchange", function () {
    standardizeRoleSidebar();
    handleHashAction();
  });

  window.addEventListener("load", function () {
    setTimeout(standardizeRoleSidebar, 80);
    setTimeout(standardizeRoleSidebar, 350);
  });
})();



// NOORVISTA admin sidebar canonical restore
// مدیر سیستم همیشه باید دقیقاً ۱۴ آیتم ثابت داشته باشد.
(function () {
  if (window.__NOORVISTA_ADMIN_SIDEBAR_13_RESTORE__) return;
  window.__NOORVISTA_ADMIN_SIDEBAR_13_RESTORE__ = true;

  const ADMIN_MENU = [
    { file: "index.html", label: "داشبورد", icon: "icon-dashboard", match: "index.html," },
    { file: "users.html", label: "مدیریت کاربران", icon: "icon-users", match: "users.html" },
    { file: "doctors.html", label: "مدیریت پزشکان", icon: "icon-user-md", match: "doctors.html" },
    { file: "schedule.html", label: "زمان‌بندی پزشکان", icon: "icon-clock", match: "schedule.html" },
    { file: "patients.html", label: "مدیریت بیماران", icon: "icon-users", match: "patients.html" },
    { file: "appointments.html", label: "مدیریت نوبت‌ها", icon: "icon-calendar", match: "appointments.html" },
    { file: "staff.html", label: "مدیریت کارکنان", icon: "icon-briefcase", match: "staff.html" },
    { file: "payments.html", label: "مدیریت مالی", icon: "icon-credit-card", match: "payments.html" },
    { file: "faqs.html", label: "سوالات پرتکرار", icon: "icon-comments nv-faq-icon", match: "faqs.html" },
    { file: "notifications.html", label: "اعلانات", icon: "icon-bell", match: "notifications.html" },
    { file: "settings.html", label: "تنظیمات سیستم", icon: "icon-cog", match: "settings.html" },
    { file: "backup.html", label: "پشتیبان‌گیری", icon: "icon-database", match: "backup.html" },
    { file: "reports.html", label: "گزارش‌ها و لاگ‌ها", icon: "icon-bar-chart", match: "reports.html,logs.html" },
    { file: "visitor-analytics.html", label: "بازدیدکنندگان سایت", icon: "icon-bar-chart", match: "visitor-analytics.html" }
  ];

  function isAdminPanel() {
    return window.location.pathname.toLowerCase().includes("/dashboard/admin/");
  }

  function currentFileName() {
    const clean = window.location.pathname.split("?")[0].split("#")[0];
    const last = clean.split("/").filter(Boolean).pop() || "index.html";
    return last.includes(".") ? last : "index.html";
  }

  function matchesCurrent(item, current) {
    const matches = String(item.match || item.file)
      .split(",")
      .map(x => x.trim())
      .filter(Boolean);

    const normalized = current === "logs.html" ? "logs.html" : current;
    return item.file === normalized || matches.includes(normalized);
  }

  function renderItem(item, current) {
    const active = matchesCurrent(item, current) ? " active" : "";

    return `
      <li class="nav-item">
        <a class="nav-link${active}" href="${item.file}" data-sidebar-match="${item.match || item.file}">
          <i class="${item.icon}"></i>
          <span>${item.label}</span>
        </a>
      </li>
    `;
  }

  function ensureAdminSidebar() {
    if (window.__NOORVISTA_UNIFIED_SHELL__ || document.body?.classList.contains('nv-unified-shell-ready')) return;
    if (!isAdminPanel()) return;

    const sidebar = document.querySelector(".sidebar");
    if (!sidebar) return;

    let nav = sidebar.querySelector(".sidebar-nav");
    if (!nav) {
      nav = document.createElement("ul");
      nav.className = "sidebar-nav";
      sidebar.appendChild(nav);
    }

    const current = currentFileName();

    nav.innerHTML = ADMIN_MENU.map(item => renderItem(item, current)).join("");

    // برای صفحه logs.html آیتم گزارش‌ها و لاگ‌ها فعال بماند.
    if (current === "logs.html") {
      nav.querySelectorAll(".nav-link").forEach(link => link.classList.remove("active"));
      const reports = nav.querySelector('[data-sidebar-match="reports.html,logs.html"]');
      if (reports) reports.classList.add("active");
    }

    sidebar.dataset.adminSidebarItems = String(ADMIN_MENU.length);
  }

  function init() {
    ensureAdminSidebar();
    setTimeout(ensureAdminSidebar, 100);
    setTimeout(ensureAdminSidebar, 400);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.addEventListener("load", init);
})();
