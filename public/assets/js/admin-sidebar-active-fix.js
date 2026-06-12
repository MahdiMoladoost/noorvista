(function () {
  if (window.__NOORVISTA_ADMIN_ACTIVE_SAFE__) return;
  window.__NOORVISTA_ADMIN_ACTIVE_SAFE__ = true;

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
    { file: "reports.html", label: "گزارشات و لاگ‌ها", icon: "icon-bar-chart", match: "reports.html,logs.html" }
  ];

  function isAdminPanel() {
    return window.location.pathname.toLowerCase().includes("/dashboard/admin/");
  }

  function currentFileName() {
    const cleanPath = window.location.pathname.split("?")[0].split("#")[0];
    const last = cleanPath.split("/").filter(Boolean).pop() || "index.html";
    return last.includes(".") ? last : "index.html";
  }

  function isActive(item, current) {
    const matches = String(item.match || item.file)
      .split(",")
      .map(x => x.trim())
      .filter(Boolean);

    return item.file === current || matches.includes(current);
  }

  function renderItem(item, current) {
    return `
      <li class="nav-item">
        <a class="nav-link ${isActive(item, current) ? "active" : ""}" href="${item.file}" data-sidebar-match="${item.match || item.file}">
          <i class="${item.icon}"></i>
          <span>${item.label}</span>
        </a>
      </li>
    `;
  }

  function fixActive() {
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

    if (current === "logs.html") {
      nav.querySelectorAll(".nav-link").forEach(link => link.classList.remove("active"));
      const reports = nav.querySelector('[data-sidebar-match="reports.html,logs.html"]');
      if (reports) reports.classList.add("active");
    }

    sidebar.dataset.adminSidebarItems = "13";
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fixActive);
  } else {
    fixActive();
  }

  window.addEventListener("load", function () {
    setTimeout(fixActive, 80);
    setTimeout(fixActive, 350);
  });
})();
