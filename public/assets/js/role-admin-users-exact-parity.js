// NOORVISTA Role Panels Exact Admin Users Header/Sidebar Parity
(function () {
  if (window.__NOORVISTA_ROLE_ADMIN_USERS_EXACT_PARITY__) return;
  window.__NOORVISTA_ROLE_ADMIN_USERS_EXACT_PARITY__ = true;

  const menus = {
    doctor: [
      ["index.html", "داشبورد", "icon-dashboard"],
      ["appointments.html", "نوبت‌های من", "icon-calendar"],
      ["patients.html", "بیماران من", "icon-patients"],
      ["medical-records.html", "پرونده‌های پزشکی", "icon-database"],
      ["prescriptions.html", "نسخه‌ها / دستورات پزشکی", "icon-comments"],
      ["schedule.html", "برنامه کاری من", "icon-clock"],
      ["profile.html", "پروفایل من", "icon-user"]
    ],
    secretary: [
      ["index.html", "داشبورد", "icon-dashboard"],
      ["appointments.html", "نوبت‌ها", "icon-calendar"],
      ["appointments.html#new", "ثبت نوبت جدید", "icon-clock"],
      ["patients.html", "بیماران", "icon-patients"],
      ["queue.html", "صف پذیرش", "icon-briefcase"],
      ["payments.html", "پرداخت‌ها", "icon-credit-card"],
      ["notifications.html", "اعلانات / پیام‌ها", "icon-bell"]
    ],
    patient: [
      ["index.html", "داشبورد", "icon-dashboard"],
      ["appointments.html#book", "رزرو نوبت", "icon-clock"],
      ["appointments.html", "نوبت‌های من", "icon-calendar"],
      ["medical-records.html", "پرونده پزشکی", "icon-database"],
      ["prescriptions.html", "نسخه‌ها", "icon-comments"],
      ["payments.html", "پرداخت‌ها", "icon-credit-card"],
      ["profile.html", "پروفایل", "icon-user"]
    ]
  };

  const roleInfo = {
    doctor: { role: "پزشک", avatar: "دک", profile: "profile.html" },
    secretary: { role: "منشی", avatar: "من", profile: "index.html" },
    patient: { role: "بیمار", avatar: "ب", profile: "profile.html" }
  };

  function role() {
    const path = location.pathname.toLowerCase();
    if (path.includes("/dashboard/doctor/")) return "doctor";
    if (path.includes("/dashboard/secretary/")) return "secretary";
    if (path.includes("/dashboard/patient/")) return "patient";
    return "";
  }

  function currentFile() {
    const last = location.pathname.split("?")[0].split("#")[0].split("/").filter(Boolean).pop();
    return last || "index.html";
  }

  function readUser() {
    const keys = ["user", "currentUser", "authUser", "noorvista_user", "nv_user"];
    for (const key of keys) {
      try {
        const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") return parsed;
      } catch (_) {}
    }
    return {};
  }

  function userName(r) {
    const u = readUser();
    return (
      u.full_name ||
      u.fullName ||
      u.display_name ||
      u.displayName ||
      u.name ||
      u.username ||
      `کاربر ${roleInfo[r]?.role || "NOORVISTA"}`
    );
  }

  function ensureLogout() {
    if (typeof window.logout === "function" && window.logout.__nvExactParity) return;

    window.logout = function () {
      localStorage.removeItem("token");
      localStorage.removeItem("authToken");
      localStorage.removeItem("noorvista_token");
      localStorage.removeItem("user");
      localStorage.removeItem("currentUser");
      location.href = "/login";
    };
    window.logout.__nvExactParity = true;
  }

  function ensureDashboardLayout() {
    let layout = document.querySelector(".dashboard-layout");
    if (!layout) {
      layout = document.createElement("div");
      layout.className = "dashboard-layout";
      while (document.body.firstChild) layout.appendChild(document.body.firstChild);
      document.body.appendChild(layout);
    }

    let main = layout.querySelector(".main-content");
    if (!main) {
      main = document.createElement("main");
      main.className = "main-content";
      Array.from(layout.childNodes).forEach(node => {
        if (!(node.nodeType === 1 && node.classList.contains("sidebar"))) main.appendChild(node);
      });
      layout.appendChild(main);
    }

    return { layout, main };
  }

  function standardizeSidebar(r) {
    const { layout } = ensureDashboardLayout();
    let sidebar = layout.querySelector(".sidebar");

    if (!sidebar) {
      sidebar = document.createElement("div");
      sidebar.className = "sidebar";
      layout.insertBefore(sidebar, layout.firstChild);
    }

    const current = currentFile();

    sidebar.className = "sidebar";
    sidebar.innerHTML = `
      <div class="sidebar-header"><div class="sidebar-logo">NOOR<span>VISTA</span></div></div>
      <ul class="sidebar-nav">
        ${menus[r].map(([href, label, icon]) => {
          const file = href.split("#")[0];
          const active = current === file && !href.includes("#new") && !href.includes("#book");
          return `
            <li class="nav-item">
              <a class="nav-link ${active ? "active" : ""}" data-sidebar-match="${file}" href="${href}">
                <i class="${icon}"></i><span>${label}</span>
              </a>
            </li>
          `;
        }).join("")}
      </ul>
    `;

    const hash = location.hash;
    if (hash === "#new" || hash === "#book") {
      sidebar.querySelectorAll(".nav-link").forEach(a => a.classList.remove("active"));
      const link = sidebar.querySelector(`a[href="appointments.html${hash}"]`);
      if (link) link.classList.add("active");
    }
  }

  function getExistingTitle(main, r) {
    const h1 = main.querySelector(".top-header h1, .dashboard-header h1, .admin-header h1, .page-title h1, .page-heading h1");
    const p = main.querySelector(".top-header p, .dashboard-header p, .admin-header p, .page-title p, .page-heading p");

    return {
      title: (h1?.textContent || document.title.split("|")[0] || roleInfo[r].role).trim(),
      subtitle: (p?.textContent || `پنل ${roleInfo[r].role} NOORVISTA`).trim()
    };
  }

  function standardizeHeader(r) {
    const { main } = ensureDashboardLayout();
    const info = roleInfo[r];
    const name = userName(r);
    const { title, subtitle } = getExistingTitle(main, r);

    main.querySelectorAll(".top-header, .dashboard-header, .admin-header").forEach(el => el.remove());

    const header = document.createElement("div");
    header.className = "top-header nv-standard-top-header";
    header.innerHTML = `
      <div class="page-heading">
        <h1>${title}</h1>
        <p>${subtitle}</p>
      </div>
      <div class="header-actions">
        <button type="button" class="notification-button" title="اعلان‌ها" aria-label="اعلان‌ها">
          <i class="icon-bell"></i><span class="notification-dot" aria-hidden="true"></span>
        </button>
        <div class="user-menu nv-user-menu">
          <button type="button" class="user-menu-trigger" aria-haspopup="true" aria-expanded="false">
            <span class="user-avatar nv-header-avatar" data-nv-avatar-label="${info.avatar}">${info.avatar}</span>
            <span class="user-menu-text">
              <strong class="user-name nv-header-user-name">${name}</strong>
              <small class="user-role nv-header-user-role">${info.role}</small>
            </span>
            <i class="icon-chevron-down nv-user-menu-chevron" aria-hidden="true"></i>
          </button>
          <div class="user-dropdown nv-user-dropdown" role="menu">
            <button class="user-dropdown-item" data-nv-profile role="menuitem" type="button"><i class="icon-user"></i><span>مشاهده پروفایل</span></button>
            <button class="user-dropdown-item" data-nv-edit-account role="menuitem" type="button"><i class="icon-pencil"></i><span>ویرایش اطلاعات حساب</span></button>
            <button class="user-dropdown-item" data-nv-change-password role="menuitem" type="button"><i class="icon-lock"></i><span>تغییر رمز عبور</span></button>
            <button class="user-dropdown-item" data-nv-account-settings role="menuitem" type="button"><i class="icon-cog"></i><span>تنظیمات حساب</span></button>
            <div class="user-dropdown-divider" aria-hidden="true"></div>
            <button class="user-dropdown-item" data-nv-logout role="menuitem" type="button"><i class="icon-sign-out"></i><span>خروج</span></button>
          </div>
        </div>
      </div>
    `;

    main.insertBefore(header, main.firstChild);

    const menu = header.querySelector(".user-menu");
    const trigger = header.querySelector(".user-menu-trigger");

    trigger.addEventListener("click", function (event) {
      event.stopPropagation();
      const isOpen = menu.classList.toggle("open");
      trigger.setAttribute("aria-expanded", String(isOpen));
    });

    header.querySelector("[data-nv-logout]").addEventListener("click", function () {
      window.logout();
    });

    header.querySelector("[data-nv-profile]").addEventListener("click", function () {
      location.href = info.profile;
    });

    document.addEventListener("click", function (event) {
      if (!menu.contains(event.target)) {
        menu.classList.remove("open");
        trigger.setAttribute("aria-expanded", "false");
      }
    });
  }

  function handleHashAction(r) {
    const path = location.pathname.toLowerCase();

    if (r === "secretary" && path.includes("appointments.html") && location.hash === "#new") {
      setTimeout(() => {
        if (typeof window.openAddModal === "function") window.openAddModal();
      }, 350);
    }

    if (r === "patient" && path.includes("appointments.html") && location.hash === "#book") {
      setTimeout(() => {
        if (typeof window.openAddModal === "function") window.openAddModal();
      }, 350);
    }
  }

  function init() {
    const r = role();
    if (!r) return;

    document.body.classList.add("nv-role-panel", `nv-${r}-panel`);
    document.body.setAttribute("data-panel-role", r);

    ensureLogout();
    standardizeSidebar(r);
    standardizeHeader(r);
    handleHashAction(r);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.addEventListener("load", function () {
    setTimeout(init, 80);
    setTimeout(init, 350);
  });
  window.addEventListener("hashchange", init);
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

