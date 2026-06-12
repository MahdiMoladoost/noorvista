// NOORVISTA Unified Global Pretty Selects
// تنها سیستم مجاز لیست‌باکس در تمام پنل‌ها: Admin, Clinic, Doctor, Secretary, Patient
(function () {
  if (window.__NOORVISTA_UNIFIED_GLOBAL_PRETTY_SELECTS_FINAL__) return;
  window.__NOORVISTA_UNIFIED_GLOBAL_PRETTY_SELECTS_FINAL__ = true;

  const PANEL_PATH_RE = /\/dashboard\//i;
  const SKIP_SELECTOR = [
    ".select2-hidden-accessible",
    "[data-no-pretty-select]",
    "[data-nv-no-pretty]",
    ".flatpickr-input",
    ".pwt-datepicker-input",
    ".datepicker-input"
  ].join(",");

  const faDigits = "۰۱۲۳۴۵۶۷۸۹";
  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const toFa = (value) => String(value ?? "").replace(/\d/g, d => faDigits[Number(d)]);

  let active = null;
  let scanTimer = null;
  let lastSelectedAt = 0;
  let valueHookInstalled = false;

  function inDashboard() {
    return PANEL_PATH_RE.test(location.pathname);
  }

  function isChoiceSelect(select) {
    return select && (select.id === "day_of_week" || select.name === "day_of_week" || select.id === "is_recurring" || select.name === "is_recurring");
  }

  function isStatusSelect(select) {
    return select && (select.id === "is_active" || select.name === "is_active" || select.id === "status" || select.name === "status");
  }

  function shouldSkip(select) {
    if (!select || select.tagName !== "SELECT") return true;
    if (!inDashboard()) return true;
    if (select.matches(SKIP_SELECTOR)) return true;
    if (select.multiple) return true;
    if (select.size && Number(select.size) > 1) return true;
    if (select.closest("template")) return true;
    if (select.closest(".select2, .select2-container")) return true;
    if (select.closest(".pwt-datepicker, .persian-datepicker, .datepicker, .timepicker")) return true;

    // وضعیت‌هایی که با switch اختصاصی کنترل می‌شوند نباید تبدیل شوند.
    if (select.classList.contains("appt-hidden-select") && !isChoiceSelect(select)) return true;
    if (select.hidden && !isChoiceSelect(select)) return true;
    if (select.type === "hidden") return true;

    // انتخاب روز/تکرار قبلاً گاهی به اشتباه hidden شده بود؛ باید برگردد.
    return false;
  }

  function ensureChoiceOptions(select) {
    if (!isChoiceSelect(select)) return;
    if (select.options.length) return;

    const dayItems = [
      ["0", "شنبه"], ["1", "یکشنبه"], ["2", "دوشنبه"], ["3", "سه‌شنبه"],
      ["4", "چهارشنبه"], ["5", "پنجشنبه"], ["6", "جمعه"]
    ];
    const recurringItems = [["1", "تکرارشونده هفتگی"], ["0", "فقط یک‌بار"]];
    const items = (select.id === "day_of_week" || select.name === "day_of_week") ? dayItems : recurringItems;

    items.forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      select.appendChild(option);
    });
  }

  function optionLabel(option) {
    return (option && option.textContent ? option.textContent.trim() : "") || "انتخاب کنید";
  }

  function selectedOption(select) {
    return select.options[select.selectedIndex] || select.options[0] || null;
  }

  function getWrapper(select) {
    return select && select.parentElement && select.parentElement.classList.contains("nvps-select")
      ? select.parentElement
      : null;
  }

  function unwrapOldSelect(select) {
    if (!select) return select;

    const oldWrapper = select.closest(".nv-pretty-select, .nv-stable-select, .nv-schedule-pro-select");
    if (oldWrapper) {
      oldWrapper.parentNode.insertBefore(select, oldWrapper);
      oldWrapper.remove();
    }

    const next = select.nextElementSibling;
    if (next && (
      next.classList.contains("nv-pretty-select") ||
      next.classList.contains("nv-stable-select") ||
      next.classList.contains("nv-schedule-pro-select") ||
      next.classList.contains("appt-choice-pills")
    )) {
      next.remove();
    }

    // اگر قبلاً به خاطر روز هفته/تکرار مخفی شده، برگردان.
    if (isChoiceSelect(select)) {
      select.classList.remove("appt-hidden-select", "nv-pretty-select-native", "nv-stable-select-native", "nv-pro-select-native", "nv-schedule-native-select");
      select.hidden = false;
      select.style.removeProperty("display");
      select.style.removeProperty("opacity");
      select.style.removeProperty("pointer-events");
    }

    return select;
  }

  function selectOption(select, value) {
    if (!select) return;

    const now = Date.now();
    if (now - lastSelectedAt < 120 && String(select.value) === String(value)) return;
    lastSelectedAt = now;

    select.value = value;
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));

    sync(select);
    closePortal();
  }

  function renderOptions(select, container) {
    container.innerHTML = "";

    const options = qa("option", select).filter(option => !option.hidden);
    if (!options.length) {
      const empty = document.createElement("div");
      empty.className = "nvps-empty";
      empty.textContent = "موردی برای نمایش وجود ندارد";
      container.appendChild(empty);
      return;
    }

    options.forEach(option => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "nvps-option";
      item.dataset.value = option.value;
      item.textContent = optionLabel(option);

      if (option.disabled) item.classList.add("disabled");
      if (String(option.value) === String(select.value)) item.classList.add("selected");

      // مهم: انتخاب روی pointerdown انجام می‌شود تا قبل از document click سایر اسکریپت‌ها ثبت شود.
      item.addEventListener("pointerdown", event => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        if (option.disabled) return;
        selectOption(select, option.value);
      }, true);

      item.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        if (option.disabled) return;
        selectOption(select, option.value);
      }, true);

      container.appendChild(item);
    });
  }

  function sync(select) {
    if (!select || shouldSkip(select)) return;

    ensureChoiceOptions(select);

    const wrapper = getWrapper(select);
    if (!wrapper) return;

    const value = q(".nvps-value", wrapper);
    const hiddenMenu = q(".nvps-menu", wrapper);
    const selected = selectedOption(select);

    if (value) value.textContent = selected ? optionLabel(selected) : "انتخاب کنید";

    if (hiddenMenu) {
      renderOptions(select, hiddenMenu);
    }
    // مهم: portal بازشده را اینجا دوباره render نکن؛
    // چون MutationObserver تغییرات خود portal را می‌بیند و باعث پرپر زدن آیتم‌ها می‌شود.
  }

  function enhance(select) {
    if (shouldSkip(select)) return;

    ensureChoiceOptions(select);
    unwrapOldSelect(select);

    if (getWrapper(select)) {
      sync(select);
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "nvps-select";
    wrapper.dataset.nvps = "1";

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "nvps-trigger";
    trigger.innerHTML = '<span class="nvps-value">انتخاب کنید</span><span class="nvps-chevron" aria-hidden="true"></span>';

    const menu = document.createElement("div");
    menu.className = "nvps-menu";
    menu.setAttribute("aria-hidden", "true");

    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(select);
    wrapper.appendChild(trigger);
    wrapper.appendChild(menu);

    select.classList.add("nvps-native");
    select.dataset.nvpsEnhanced = "1";

    trigger.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();

      if (active && active.select === select) {
        closePortal();
        return;
      }

      openPortal(select);
    }, true);

    select.addEventListener("change", () => sync(select));
    select.addEventListener("input", () => sync(select));

    if (!select.dataset.nvpsObserved) {
      select.dataset.nvpsObserved = "1";
      new MutationObserver(() => sync(select)).observe(select, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["selected", "disabled", "hidden", "label"]
      });
    }

    sync(select);
  }

  function closePortal() {
    if (!active) return;

    if (active.portal) active.portal.remove();
    if (active.wrapper) active.wrapper.classList.remove("open");

    active = null;
  }

  function openPortal(select) {
    if (!select || shouldSkip(select)) return;

    const wrapper = getWrapper(select);
    if (!wrapper) return;

    closePortal();

    sync(select);

    const portal = document.createElement("div");
    portal.className = "nvps-portal";
    if (isChoiceSelect(select) && (select.id === "day_of_week" || select.name === "day_of_week")) {
      portal.classList.add("nvps-day-menu");
    }

    renderOptions(select, portal);

    // ایمنی اضافه: اگر browser/اسکریپت دیگری listener دکمه را دور زد،
    // خود portal در فاز capture مقدار را قبل از بسته شدن dropdown ثبت می‌کند.
    const portalSelectHandler = function (event) {
      const btn = event.target && event.target.closest ? event.target.closest(".nvps-option[data-value]") : null;
      if (!btn || !portal.contains(btn)) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (btn.classList.contains("disabled")) return;
      selectOption(select, btn.dataset.value);
    };

    portal.addEventListener("pointerdown", portalSelectHandler, true);
    portal.addEventListener("mousedown", portalSelectHandler, true);
    portal.addEventListener("click", portalSelectHandler, true);

    document.body.appendChild(portal);

    active = { select, wrapper, portal };
    wrapper.classList.add("open");

    positionPortal();
  }

  function positionPortal() {
    if (!active || !active.wrapper || !active.portal) return;

    const trigger = q(".nvps-trigger", active.wrapper);
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const portal = active.portal;
    const desiredHeight = active.select && isChoiceSelect(active.select) && (active.select.id === "day_of_week" || active.select.name === "day_of_week")
      ? 420
      : 280;

    const bottomSpace = window.innerHeight - rect.bottom - 10;
    const topSpace = rect.top - 10;
    const openUp = bottomSpace < 180 && topSpace > bottomSpace;
    const maxHeight = Math.max(150, Math.min(openUp ? topSpace : bottomSpace, desiredHeight));

    portal.style.width = rect.width + "px";
    portal.style.left = rect.left + "px";
    portal.style.right = "auto";
    portal.style.maxHeight = maxHeight + "px";

    if (openUp) {
      portal.style.top = "auto";
      portal.style.bottom = (window.innerHeight - rect.top + 7) + "px";
    } else {
      portal.style.top = (rect.bottom + 7) + "px";
      portal.style.bottom = "auto";
    }
  }

  function scan() {
    if (!inDashboard()) return;
    document.body.classList.add("nv-panel-pretty-selects");

    qa("select").forEach(enhance);
  }

  function scheduleScan(delay = 0) {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, delay);
  }

  function installValueHook() {
    if (valueHookInstalled) return;
    valueHookInstalled = true;

    const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
    if (!descriptor || !descriptor.get || !descriptor.set) return;

    Object.defineProperty(HTMLSelectElement.prototype, "value", {
      configurable: true,
      enumerable: descriptor.enumerable,
      get: descriptor.get,
      set: function (value) {
        descriptor.set.call(this, value);
        if (this && this.tagName === "SELECT") {
          setTimeout(() => {
            if (getWrapper(this) || !shouldSkip(this)) {
              enhance(this);
              sync(this);
            }
          }, 0);
          setTimeout(() => sync(this), 80);
        }
      }
    });
  }

  function cleanupOnClick(event) {
    if (!active) return;

    // کلیک/تاچ روی خود منوی portal نباید قبل از انتخاب گزینه منو را ببندد.
    if (event.target && event.target.closest && event.target.closest(".nvps-portal")) return;
    if (active.portal && active.portal.contains(event.target)) return;
    if (active.wrapper && active.wrapper.contains(event.target)) return;

    closePortal();
  }

  function init() {
    if (!inDashboard()) return;

    installValueHook();
    scan();

    [100, 350, 900, 1800].forEach(delay => setTimeout(scan, delay));

    new MutationObserver((mutations) => {
      // تغییرات داخل منوی بازشده نباید باعث scan/render دوباره شود؛
      // وگرنه گزینه‌ها زیر موس دوباره ساخته می‌شوند و پرپر می‌زنند.
      const onlyPortalChanges = mutations.length && mutations.every((mutation) => {
        const target = mutation.target;
        return target && target.nodeType === 1 && (
          target.classList?.contains("nvps-portal") ||
          target.closest?.(".nvps-portal")
        );
      });

      if (onlyPortalChanges) return;
      scheduleScan(80);
    }).observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  document.addEventListener("click", cleanupOnClick, true);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closePortal();
  });
  document.addEventListener("change", event => {
    if (event.target && event.target.tagName === "SELECT") {
      enhance(event.target);
      sync(event.target);
    }
  }, true);

  window.addEventListener("scroll", positionPortal, true);
  window.addEventListener("resize", positionPortal);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.NVPrettySelects = {
    refresh: scan,
    sync: function (selectOrSelector) {
      const select = typeof selectOrSelector === "string" ? q(selectOrSelector) : selectOrSelector;
      if (select) {
        enhance(select);
        sync(select);
      } else {
        scan();
      }
    },
    close: closePortal
  };
})();
