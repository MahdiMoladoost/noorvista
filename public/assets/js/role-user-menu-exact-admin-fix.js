// NOORVISTA Role Panels - Exact Admin Users User Menu Fix
(function () {
  if (window.__NOORVISTA_ROLE_USER_MENU_EXACT_ADMIN_FIX__) return;
  window.__NOORVISTA_ROLE_USER_MENU_EXACT_ADMIN_FIX__ = true;

  const roleInfo = {
    doctor: { role: "پزشک", avatar: "دک", profile: "profile.html" },
    secretary: { role: "منشی", avatar: "من", profile: "index.html" },
    patient: { role: "بیمار", avatar: "ب", profile: "profile.html" }
  };

  function currentRole() {
    const path = location.pathname.toLowerCase();
    if (path.includes("/dashboard/doctor/")) return "doctor";
    if (path.includes("/dashboard/secretary/")) return "secretary";
    if (path.includes("/dashboard/patient/")) return "patient";
    return "";
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

  function userName(role) {
    const u = readUser();
    return (
      u.full_name ||
      u.fullName ||
      u.display_name ||
      u.displayName ||
      u.name ||
      u.username ||
      `کاربر ${roleInfo[role]?.role || "سیستم"}`
    );
  }

  function ensureLogout() {
    window.logout = function () {
      localStorage.removeItem("token");
      localStorage.removeItem("authToken");
      localStorage.removeItem("noorvista_token");
      localStorage.removeItem("user");
      localStorage.removeItem("currentUser");
      location.href = "/login";
    };
  }

  function buildExactUserMenu(role) {
    const info = roleInfo[role];
    const name = userName(role);

    const header =
      document.querySelector(".top-header.nv-standard-top-header") ||
      document.querySelector(".top-header") ||
      document.querySelector(".dashboard-header") ||
      document.querySelector(".admin-header");

    if (!header || !info) return;

    header.classList.add("top-header", "nv-standard-top-header");

    let actions = header.querySelector(".header-actions");
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "header-actions";
      header.appendChild(actions);
    }

    // فقط عناصر قدیمی کاربر را حذف می‌کنیم؛ notification-button را نگه می‌داریم.
    actions.querySelectorAll(".user-menu, .user-info, .header-user, .nv-admin-header-user-area, .nv-admin-userbox").forEach(el => el.remove());

    let notification = actions.querySelector(".notification-button");
    if (!notification) {
      notification = document.createElement("button");
      notification.type = "button";
      notification.className = "notification-button";
      notification.title = "اعلان‌ها";
      notification.setAttribute("aria-label", "اعلان‌ها");
      notification.innerHTML = '<i class="icon-bell"></i><span aria-hidden="true" class="notification-dot"></span>';
      actions.insertBefore(notification, actions.firstChild);
    }

    const menu = document.createElement("div");
    menu.className = "user-menu nv-user-menu";
    menu.innerHTML = `
      <button aria-expanded="false" aria-haspopup="true" class="user-menu-trigger" type="button">
        <span class="user-avatar nv-header-avatar">${info.avatar}</span>
        <span class="user-menu-text">
          <strong class="user-name nv-header-user-name">${name}</strong>
          <small class="user-role nv-header-user-role">${info.role}</small>
        </span>
        <i aria-hidden="true" class="icon-chevron-down nv-user-menu-chevron"></i>
      </button>
      <div class="user-dropdown nv-user-dropdown" role="menu">
        <button class="user-dropdown-item" data-nv-profile="" role="menuitem" type="button"><i class="icon-user"></i><span>مشاهده پروفایل</span></button>
        <button class="user-dropdown-item" data-nv-edit-account="" role="menuitem" type="button"><i class="icon-pencil"></i><span>ویرایش اطلاعات حساب</span></button>
        <button class="user-dropdown-item" data-nv-change-password="" role="menuitem" type="button"><i class="icon-lock"></i><span>تغییر رمز عبور</span></button>
        <button class="user-dropdown-item" data-nv-account-settings="" role="menuitem" type="button"><i class="icon-cog"></i><span>تنظیمات حساب</span></button>
        <div aria-hidden="true" class="user-dropdown-divider"></div>
        <button class="user-dropdown-item danger" data-nv-logout="" role="menuitem" type="button"><i class="icon-sign-out"></i><span>خروج از حساب</span></button>
      </div>
    `;

    actions.appendChild(menu);

    const trigger = menu.querySelector(".user-menu-trigger");

    trigger.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();

      const isOpen = menu.classList.toggle("open");
      trigger.setAttribute("aria-expanded", String(isOpen));
    });

    menu.querySelector("[data-nv-profile]").addEventListener("click", function () {
      location.href = info.profile;
    });

    menu.querySelector("[data-nv-logout]").addEventListener("click", function () {
      window.logout();
    });

    document.addEventListener("click", function (event) {
      if (!menu.contains(event.target)) {
        menu.classList.remove("open");
        trigger.setAttribute("aria-expanded", "false");
      }
    });
  }

  function init() {
    const role = currentRole();
    if (!role) return;

    ensureLogout();

    // کمی بعد از اسکریپت‌های صفحه اجرا می‌شود تا اگر آن‌ها user-info ساختند، جایگزین شود.
    buildExactUserMenu(role);
    setTimeout(() => buildExactUserMenu(role), 80);
    setTimeout(() => buildExactUserMenu(role), 350);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.addEventListener("load", init);
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

