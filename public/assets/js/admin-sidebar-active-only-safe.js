(function () {
  if (window.__NOORVISTA_ADMIN_ACTIVE_ONLY_SAFE__) return;
  window.__NOORVISTA_ADMIN_ACTIVE_ONLY_SAFE__ = true;

  function isAdminPage() {
    return window.location.pathname.toLowerCase().includes("/dashboard/admin/");
  }

  function currentFileName() {
    const cleanPath = window.location.pathname.split("?")[0].split("#")[0];
    const last = cleanPath.split("/").filter(Boolean).pop() || "index.html";
    return last.includes(".") ? last : "index.html";
  }

  function hrefFileName(href) {
    if (!href) return "";
    const clean = href.split("?")[0].split("#")[0];
    const last = clean.split("/").filter(Boolean).pop() || "index.html";
    return last.includes(".") ? last : "index.html";
  }

  function fixActiveOnly() {
    if (!isAdminPage()) return;

    const current = currentFileName();
    const sidebar = document.querySelector(".sidebar");
    if (!sidebar) return;

    const links = Array.from(sidebar.querySelectorAll(".nav-link"));
    if (!links.length) return;

    links.forEach((link) => link.classList.remove("active"));

    let active = links.find((link) => {
      const matches = (link.dataset.sidebarMatch || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);

      return matches.includes(current);
    });

    if (!active) {
      active = links.find((link) => hrefFileName(link.getAttribute("href")) === current);
    }

    if (!active && current === "index.html") {
      active = links.find((link) => hrefFileName(link.getAttribute("href")) === "index.html");
    }

    if (active) active.classList.add("active");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fixActiveOnly);
  } else {
    fixActiveOnly();
  }

  window.addEventListener("load", function () {
    setTimeout(fixActiveOnly, 50);
    setTimeout(fixActiveOnly, 300);
    setTimeout(fixActiveOnly, 800);
  });
})();
