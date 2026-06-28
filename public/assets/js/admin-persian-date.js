// NOORVISTA Persian/Jalali date fields for admin forms
// Stable custom Jalali picker: no native Gregorian calendar, supports date and datetime fields.
(function () {
  if (window.NVDate && window.NVDate.__readyV2) return;


/* Sadra calendar month/year listboxes v2.1.70 */
(function installNVCalendarListbox(global) {
  if (global.NVCalendarListbox && global.NVCalendarListbox.version === '2.1.70') return;

  let activeShell = null;
  let uid = 0;

  function directSelect(shell) {
    return Array.from(shell.children).find(child => child.matches && child.matches('select.nv-tw-calendar-select')) || null;
  }

  function optionButtons(shell) {
    return Array.from(shell.querySelectorAll('.nv-calendar-listbox-option:not([disabled])'));
  }

  function close(shell = activeShell, restoreFocus = false) {
    if (!shell) return;
    const trigger = shell.querySelector('.nv-calendar-listbox-trigger');
    const menu = shell.querySelector('.nv-calendar-listbox-menu');
    shell.classList.remove('open', 'open-up');
    if (menu) {
      menu.hidden = true;
      menu.style.maxHeight = '';
    }
    if (trigger) {
      trigger.setAttribute('aria-expanded', 'false');
      if (restoreFocus && document.contains(trigger)) trigger.focus({ preventScroll: true });
    }
    if (activeShell === shell) activeShell = null;
  }

  function closeAll(except = null) {
    document.querySelectorAll('.nv-calendar-listbox.open').forEach(shell => {
      if (shell !== except) close(shell);
    });
  }

  function focusOption(shell, mode = 'selected') {
    const buttons = optionButtons(shell);
    if (!buttons.length) return;
    let target = buttons[0];
    if (mode === 'last') target = buttons[buttons.length - 1];
    if (mode === 'selected') target = buttons.find(button => button.getAttribute('aria-selected') === 'true') || target;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'nearest' });
  }

  function positionMenu(shell) {
    if (!shell || !shell.classList.contains('open')) return;
    const trigger = shell.querySelector('.nv-calendar-listbox-trigger');
    const menu = shell.querySelector('.nv-calendar-listbox-menu');
    if (!trigger || !menu || menu.hidden) return;

    const viewport = window.visualViewport;
    const viewportTop = viewport?.offsetTop || 0;
    const viewportHeight = viewport?.height || window.innerHeight || document.documentElement.clientHeight;
    const rect = trigger.getBoundingClientRect();
    const menuHeight = Math.max(menu.scrollHeight, menu.getBoundingClientRect().height || 0);
    const below = viewportTop + viewportHeight - rect.bottom - 12;
    const above = rect.top - viewportTop - 12;
    const openUp = below < Math.min(menuHeight, 180) && above > below;
    shell.classList.toggle('open-up', openUp);
    const available = Math.max(116, (openUp ? above : below) - 8);
    menu.style.maxHeight = `${Math.min(232, available)}px`;
  }

  function open(shell, focusMode = null) {
    const trigger = shell.querySelector('.nv-calendar-listbox-trigger');
    const menu = shell.querySelector('.nv-calendar-listbox-menu');
    if (!trigger || !menu || trigger.disabled) return;
    closeAll(shell);
    activeShell = shell;
    shell.classList.add('open');
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => {
      positionMenu(shell);
      if (focusMode) focusOption(shell, focusMode);
    });
  }

  function sync(shell) {
    const select = directSelect(shell);
    const value = shell.querySelector('.nv-calendar-listbox-value');
    if (!select || !value) return;
    const selected = select.options[select.selectedIndex] || select.options[0];
    value.textContent = selected ? selected.textContent.trim() : 'انتخاب کنید';
    shell.querySelectorAll('.nv-calendar-listbox-option').forEach(button => {
      const selectedNow = String(button.dataset.value) === String(select.value);
      button.classList.toggle('selected', selectedNow);
      button.setAttribute('aria-selected', selectedNow ? 'true' : 'false');
      button.tabIndex = selectedNow ? 0 : -1;
    });
  }

  function choose(shell, value) {
    const select = directSelect(shell);
    if (!select || select.disabled) return;
    close(shell);
    if (String(select.value) === String(value)) return;
    select.value = value;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function enhance(scope) {
    const root = scope && scope.querySelectorAll ? scope : document;
    if (activeShell && !document.contains(activeShell)) activeShell = null;

    root.querySelectorAll('.nv-tw-calendar-select-shell').forEach(shell => {
      const select = directSelect(shell);
      if (!select || shell.dataset.nvCalendarListboxReady === '1') return;

      shell.dataset.nvCalendarListboxReady = '1';
      shell.classList.add('nv-calendar-listbox');
      select.classList.add('nv-calendar-listbox-native');
      select.tabIndex = -1;
      select.setAttribute('aria-hidden', 'true');

      const id = `nv-calendar-listbox-${++uid}`;
      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'nv-calendar-listbox-trigger';
      trigger.setAttribute('aria-haspopup', 'listbox');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('aria-controls', `${id}-menu`);
      trigger.setAttribute('aria-label', select.getAttribute('aria-label') || 'انتخاب');
      trigger.innerHTML = '<span class="nv-calendar-listbox-value"></span><span class="nv-calendar-listbox-chevron" aria-hidden="true"></span>';

      const menu = document.createElement('div');
      menu.id = `${id}-menu`;
      menu.className = 'nv-calendar-listbox-menu';
      menu.setAttribute('role', 'listbox');
      menu.setAttribute('aria-label', select.getAttribute('aria-label') || 'انتخاب');
      menu.hidden = true;

      Array.from(select.options).forEach(option => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'nv-calendar-listbox-option';
        button.dataset.value = option.value;
        button.textContent = option.textContent.trim();
        button.setAttribute('role', 'option');
        if (option.disabled) button.disabled = true;
        button.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          choose(shell, button.dataset.value);
        });
        button.addEventListener('keydown', event => {
          const buttons = optionButtons(shell);
          const index = buttons.indexOf(button);
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const step = event.key === 'ArrowDown' ? 1 : -1;
            const next = buttons[(index + step + buttons.length) % buttons.length];
            next?.focus({ preventScroll: true });
            next?.scrollIntoView({ block: 'nearest' });
          } else if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            const next = event.key === 'Home' ? buttons[0] : buttons[buttons.length - 1];
            next?.focus({ preventScroll: true });
            next?.scrollIntoView({ block: 'nearest' });
          } else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            choose(shell, button.dataset.value);
          } else if (event.key === 'Escape' || event.key === 'Tab') {
            if (event.key === 'Escape') event.preventDefault();
            close(shell, event.key === 'Escape');
          }
        });
        menu.appendChild(button);
      });

      select.insertAdjacentElement('afterend', trigger);
      trigger.insertAdjacentElement('afterend', menu);

      trigger.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        shell.classList.contains('open') ? close(shell) : open(shell);
      });
      trigger.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          open(shell, event.key === 'ArrowDown' ? 'selected' : 'last');
        } else if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          shell.classList.contains('open') ? close(shell) : open(shell, 'selected');
        } else if (event.key === 'Escape') {
          event.preventDefault();
          close(shell);
        }
      });
      select.addEventListener('change', () => sync(shell));
      sync(shell);
    });
  }

  document.addEventListener('pointerdown', event => {
    if (activeShell && !activeShell.contains(event.target)) close(activeShell);
  }, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && activeShell && !activeShell.contains(document.activeElement)) close(activeShell);
  }, true);
  const repositionActiveMenu = () => {
    if (activeShell) requestAnimationFrame(() => positionMenu(activeShell));
  };
  window.addEventListener('resize', repositionActiveMenu, { passive: true });
  window.addEventListener('scroll', repositionActiveMenu, { passive: true, capture: true });
  window.visualViewport?.addEventListener('resize', repositionActiveMenu, { passive: true });
  window.visualViewport?.addEventListener('scroll', repositionActiveMenu, { passive: true });

  global.NVCalendarListbox = { version: '2.1.70', enhance, closeAll, positionMenu };
})(window);

  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
  const div = (a, b) => ~~(a / b);
  const mod = (a, b) => a - ~~(a / b) * b;
  const pad = n => String(n).padStart(2, '0');

  function toEnglishDigits(value) {
    const map = {'۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9','٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9'};
    return String(value || '').replace(/[۰-۹٠-٩]/g, d => map[d] || d);
  }

  function toPersianDigits(value) {
    const fa = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
    return String(value ?? '').replace(/\d/g, d => fa[Number(d)]);
  }

  function jalCal(jy) {
    let bl = breaks.length, gy = jy + 621, leapJ = -14, jp = breaks[0], jm, jump, leap, n, i;
    if (jy < jp || jy >= breaks[bl - 1]) throw new Error('سال شمسی نامعتبر است: ' + jy);
    for (i = 1; i < bl; i += 1) {
      jm = breaks[i]; jump = jm - jp;
      if (jy < jm) break;
      leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
      jp = jm;
    }
    n = jy - jp;
    leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
    if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
    const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
    const march = 20 + leapJ - leapG;
    if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
    leap = mod(mod(n + 1, 33) - 1, 4);
    if (leap === -1) leap = 4;
    return { leap, gy, march };
  }

  function g2d(gy, gm, gd) {
    let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
    d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
    return d;
  }

  function d2g(jdn) {
    let j = 4 * jdn + 139361631;
    j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
    const i = div(mod(j, 1461), 4) * 5 + 308;
    const gd = div(mod(i, 153), 5) + 1;
    const gm = mod(div(i, 153), 12) + 1;
    const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
    return { gy, gm, gd };
  }

  function j2d(jy, jm, jd) {
    const r = jalCal(jy);
    return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
  }

  function d2j(jdn) {
    const gy = d2g(jdn).gy;
    let jy = gy - 621;
    const r = jalCal(jy);
    const jdn1f = g2d(gy, 3, r.march);
    let k = jdn - jdn1f;
    let jm, jd;
    if (k >= 0) {
      if (k <= 185) { jm = 1 + div(k, 31); jd = mod(k, 31) + 1; return { jy, jm, jd }; }
      k -= 186;
    } else {
      jy -= 1;
      k += 179;
      if (r.leap === 1) k += 1;
    }
    jm = 7 + div(k, 30);
    jd = mod(k, 30) + 1;
    return { jy, jm, jd };
  }

  function toGregorianParts(jy, jm, jd) { return d2g(j2d(Number(jy), Number(jm), Number(jd))); }
  function toJalaliParts(gy, gm, gd) { return d2j(g2d(Number(gy), Number(gm), Number(gd))); }

  function parseSeparated(value) {
    const cleaned = toEnglishDigits(value).trim().replace(/\u200c/g, '');
    const m = cleaned.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::\d{2})?)?$/);
    if (!m) return null;
    return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]), time: m[4] ? `${pad(m[4])}:${m[5]}` : '' };
  }

  function parseJalali(value) {
    const p = parseSeparated(value);
    if (!p) return null;
    // Years under 1700 are treated as Jalali. This prevents 1404-xx-xx from being parsed as Gregorian.
    if (p.y >= 1700) return null;
    if (p.m < 1 || p.m > 12 || p.d < 1 || p.d > 31) return null;
    return { jy: p.y, jm: p.m, jd: p.d, time: p.time };
  }

  function parseGregorian(value) {
    const p = parseSeparated(value);
    if (!p) return null;
    if (p.y < 1700) return null;
    if (p.m < 1 || p.m > 12 || p.d < 1 || p.d > 31) return null;
    return { gy: p.y, gm: p.m, gd: p.d, time: p.time };
  }

  function toGregorianDate(value) {
    if (!value) return '';
    const j = parseJalali(value);
    if (j) {
      const out = toGregorianParts(j.jy, j.jm, j.jd);
      return `${out.gy}-${pad(out.gm)}-${pad(out.gd)}`;
    }
    const g = parseGregorian(value);
    if (g) return `${g.gy}-${pad(g.gm)}-${pad(g.gd)}`;
    return String(value || '');
  }

  function toGregorianDateTime(value) {
    if (!value) return '';
    const j = parseJalali(value);
    if (j) {
      const out = toGregorianParts(j.jy, j.jm, j.jd);
      return `${out.gy}-${pad(out.gm)}-${pad(out.gd)}T${j.time || '00:00'}`;
    }
    const g = parseGregorian(value);
    if (g) return `${g.gy}-${pad(g.gm)}-${pad(g.gd)}T${g.time || '00:00'}`;
    return String(value || '');
  }

  function formatJalali(j, withTime) {
    const base = `${toPersianDigits(j.jy)}/${toPersianDigits(pad(j.jm))}/${toPersianDigits(pad(j.jd))}`;
    return withTime ? `${base} ${toPersianDigits(j.time || '00:00')}` : base;
  }

  function toJalaliDate(value) {
    if (!value) return '';
    const j = parseJalali(value);
    if (j) return formatJalali(j, false);
    const g = parseGregorian(value);
    if (!g) return String(value || '');
    const out = toJalaliParts(g.gy, g.gm, g.gd);
    return formatJalali({ ...out, time: g.time }, false);
  }

  function toJalaliDateTime(value) {
    if (!value) return '';
    const j = parseJalali(value);
    if (j) return formatJalali(j, true);
    const g = parseGregorian(value);
    if (!g) return String(value || '');
    const out = toJalaliParts(g.gy, g.gm, g.gd);
    return formatJalali({ ...out, time: g.time || '00:00' }, true);
  }

  function localIso(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function todayJalali() { return toJalaliDate(localIso(new Date())); }

  function jalaliAfterDays(days) {
    const date = new Date();
    date.setDate(date.getDate() + Number(days || 0));
    return toJalaliDate(localIso(date));
  }

  function defaultValueFor(input, isDateTime) {
    if (!input || input.value || input.dataset.noDefaultDate === '1') return '';
    const id = String(input.id || '').toLowerCase();
    if (/birth|تولد/.test(id)) return '';
    const today = todayJalali();
    if (id === 'expiresat') return `${today} ۲۳:۰۰`;
    if (id === 'startsat' || isDateTime) return `${today} ۰۹:۰۰`;
    if (id === 'end_date') return today;
    return today;
  }

  const monthNames = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
  const daysInMonth = (jy, jm) => jm <= 6 ? 31 : jm <= 11 ? 30 : (jalCal(jy).leap === 0 ? 30 : 29);

  function ensurePicker() {
    let picker = document.getElementById('nvJalaliPicker');
    if (!picker) {
      picker = document.createElement('div');
      picker.id = 'nvJalaliPicker';
      picker.className = 'nv-jalali-picker';
      picker.setAttribute('role', 'dialog');
      picker.setAttribute('aria-label', 'تقویم شمسی');
      picker.setAttribute('aria-hidden', 'true');
      document.body.appendChild(picker);
    }
    return picker;
  }

  let activeInput = null;
  let view = (() => {
    const j = parseJalali(todayJalali());
    return { jy: j.jy, jm: j.jm };
  })();

  const PICKER_GAP = 12;
  const PICKER_OFFSET = 8;

  function viewportBox() {
    const viewport = window.visualViewport;
    return {
      top: viewport?.offsetTop || 0,
      left: viewport?.offsetLeft || 0,
      width: viewport?.width || document.documentElement.clientWidth || window.innerWidth,
      height: viewport?.height || window.innerHeight || document.documentElement.clientHeight
    };
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), Math.max(min, max));
  }

  function placePicker(input, picker) {
    if (!input || !picker || !document.contains(input)) return;
    const viewport = viewportBox();
    const rect = input.getBoundingClientRect();
    const maximumWidth = Math.max(280, viewport.width - (PICKER_GAP * 2));
    const requestedWidth = Math.max(312, Math.min(rect.width || 0, 332));
    const width = Math.min(requestedWidth, maximumWidth);
    const maximumHeight = Math.max(260, viewport.height - (PICKER_GAP * 2));

    picker.style.position = 'fixed';
    picker.style.width = `${width}px`;
    picker.style.minWidth = '0';
    picker.style.maxWidth = `${maximumWidth}px`;
    picker.style.maxHeight = `${maximumHeight}px`;
    picker.style.overflowY = 'auto';

    const measured = picker.getBoundingClientRect();
    const pickerHeight = Math.min(measured.height || picker.scrollHeight || 340, maximumHeight);
    const pickerWidth = measured.width || width;
    const availableBelow = viewport.top + viewport.height - rect.bottom - PICKER_GAP;
    const availableAbove = rect.top - viewport.top - PICKER_GAP;
    const requestedPlacement = String(input.dataset.calendarPlacement || input.dataset.datepickerPlacement || 'auto').toLowerCase();
    let placement;

    if (requestedPlacement === 'top' || requestedPlacement === 'bottom') {
      placement = requestedPlacement;
    } else if (availableBelow >= pickerHeight) {
      placement = 'bottom';
    } else if (availableAbove >= pickerHeight) {
      placement = 'top';
    } else {
      placement = availableAbove > availableBelow ? 'top' : 'bottom';
    }

    let top = placement === 'top'
      ? rect.top - pickerHeight - PICKER_OFFSET
      : rect.bottom + PICKER_OFFSET;
    let left = rect.left + ((rect.width - pickerWidth) / 2);

    top = clamp(top, viewport.top + PICKER_GAP, viewport.top + viewport.height - pickerHeight - PICKER_GAP);
    left = clamp(left, viewport.left + PICKER_GAP, viewport.left + viewport.width - pickerWidth - PICKER_GAP);

    picker.dataset.placement = placement;
    picker.style.top = `${Math.round(top)}px`;
    picker.style.left = `${Math.round(left)}px`;
    picker.style.right = 'auto';
    picker.style.bottom = 'auto';
  }

  function setInputValue(input, jy, jm, jd) {
    const date = `${toPersianDigits(jy)}/${toPersianDigits(pad(jm))}/${toPersianDigits(pad(jd))}`;
    if (input.classList.contains('nv-jalali-datetime')) {
      const parsed = parseJalali(input.value);
      const time = parsed?.time || input.dataset.defaultTime || '09:00';
      input.value = `${date} ${toPersianDigits(time)}`;
    } else {
      input.value = date;
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function pickerYearBounds(input, selectedYear) {
    const today = parseJalali(todayJalali());
    const currentYear = today?.jy || selectedYear || 1405;
    const idAndName = `${input?.id || ''} ${input?.name || ''} ${input?.getAttribute?.('aria-label') || ''}`.toLowerCase();
    const isBirthDate = /birth|تولد/.test(idAndName) || input?.dataset?.dateMode === 'birth';
    let minYear = Number(input?.dataset?.jalaliMinYear || input?.dataset?.minYear || (isBirthDate ? currentYear - 120 : currentYear - 15));
    let maxYear = Number(input?.dataset?.jalaliMaxYear || input?.dataset?.maxYear || (isBirthDate ? currentYear : currentYear + 15));
    if (!Number.isFinite(minYear)) minYear = currentYear - 15;
    if (!Number.isFinite(maxYear)) maxYear = currentYear + 15;
    if (minYear > maxYear) [minYear, maxYear] = [maxYear, minYear];
    if (selectedYear < minYear) minYear = selectedYear;
    if (selectedYear > maxYear) maxYear = selectedYear;
    return { minYear, maxYear };
  }

  function renderPicker(input) {
    const picker = ensurePicker();
    const selected = parseJalali(input.value) || parseJalali(todayJalali());
    if (!view || !view.jy) view = { jy: selected.jy, jm: selected.jm };
    const firstG = toGregorianParts(view.jy, view.jm, 1);
    const firstDate = new Date(`${firstG.gy}-${pad(firstG.gm)}-${pad(firstG.gd)}T00:00:00`);
    const firstIndex = (firstDate.getDay() + 1) % 7;
    const { minYear, maxYear } = pickerYearBounds(input, view.jy);
    const monthOptions = monthNames.map((name, index) => `<option value="${index + 1}" ${index + 1 === view.jm ? 'selected' : ''}>${name}</option>`).join('');
    const yearOptions = Array.from({ length: maxYear - minYear + 1 }, (_, index) => maxYear - index)
      .map(year => `<option value="${year}" ${year === view.jy ? 'selected' : ''}>${toPersianDigits(year)}</option>`).join('');

    const periodLabel = `${monthNames[view.jm - 1]} ${toPersianDigits(view.jy)}`;
    let html = `<div class="nv-jp-head"><button type="button" data-jp-prev aria-label="ماه قبل"><i class="icon-chevron-right" aria-hidden="true"></i></button><div class="nv-jp-selects nv-tw-calendar-select-grid"><div class="nv-tw-calendar-select-shell nv-jp-month-shell"><span class="tw-sr-only">ماه</span><select class="nv-tw-calendar-select" data-no-pretty-select data-jp-month aria-label="انتخاب ماه">${monthOptions}</select></div><div class="nv-tw-calendar-select-shell nv-jp-year-shell"><span class="tw-sr-only">سال</span><select class="nv-tw-calendar-select" data-no-pretty-select data-jp-year aria-label="انتخاب سال">${yearOptions}</select></div></div><button type="button" data-jp-next aria-label="ماه بعد"><i class="icon-chevron-left" aria-hidden="true"></i></button><strong class="nv-jp-period-label tw-sr-only" aria-live="polite">${periodLabel}</strong></div>`;
    html += '<div class="nv-jp-week"><span>ش</span><span>ی</span><span>د</span><span>س</span><span>چ</span><span>پ</span><span>ج</span></div><div class="nv-jp-days">';
    for (let i=0; i<firstIndex; i++) html += '<span></span>';
    for (let d=1; d<=daysInMonth(view.jy, view.jm); d++) {
      const active = selected && selected.jy === view.jy && selected.jm === view.jm && selected.jd === d ? ' active' : '';
      html += `<button type="button" class="nv-jp-day${active}" data-jp-day="${d}">${toPersianDigits(d)}</button>`;
    }
    html += '</div>';
    if (input.classList.contains('nv-jalali-datetime')) {
      const time = (parseJalali(input.value)?.time || input.dataset.defaultTime || '09:00');
      html += `<div class="nv-jp-time"><label>ساعت</label><input type="time" data-jp-time value="${time}"></div>`;
    }
    html += '<div class="nv-jp-actions"><button type="button" data-jp-today>امروز</button><button type="button" data-jp-clear>پاک کردن</button></div>';
    picker.innerHTML = html;
    window.NVCalendarListbox?.enhance(picker);

    picker.querySelector('[data-jp-month]')?.addEventListener('change', event => {
      view.jm = Number(event.target.value) || 1;
      renderPicker(input);
    });
    picker.querySelector('[data-jp-year]')?.addEventListener('change', event => {
      view.jy = Number(event.target.value) || view.jy;
      renderPicker(input);
    });

    picker.classList.add('show', 'is-measuring');
    picker.setAttribute('aria-hidden', 'false');
    placePicker(input, picker);
    requestAnimationFrame(() => {
      placePicker(input, picker);
      picker.classList.remove('is-measuring');
    });
  }

  function openPicker(input) {
    activeInput = input;
    const parsed = parseJalali(input.value) || parseJalali(todayJalali());
    view = { jy: parsed.jy, jm: parsed.jm };
    renderPicker(input);
  }

  function ensureSingleDateTrigger(input) {
    if (!input) return null;

    let field = input.closest('.nv-date-field');
    if (!field) {
      field = document.createElement('div');
      field.className = 'nv-date-field';
      input.parentNode.insertBefore(field, input);
      field.appendChild(input);
    }

    const filterField = input.closest('.appt-filter-field');
    const allTriggers = filterField
      ? Array.from(filterField.querySelectorAll('.nv-date-trigger'))
      : Array.from(field.querySelectorAll('.nv-date-trigger'));

    let trigger = allTriggers.find(item => item.parentElement === field) || allTriggers[0] || null;
    allTriggers.forEach(item => {
      if (item !== trigger) item.remove();
    });

    if (!trigger) {
      trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'nv-date-trigger';
    }

    if (trigger.parentElement !== field) field.appendChild(trigger);
    trigger.setAttribute('aria-label', 'باز کردن تقویم');
    trigger.setAttribute('title', 'باز کردن تقویم');
    trigger.dataset.nvDateFor = input.id || '';
    trigger.dataset.nvDatePrimary = '1';

    // همه محتوای قدیمی حذف می‌شود؛ تنها آیکون مجاز با ::before در CSS ساخته می‌شود.
    trigger.replaceChildren();
    Array.from(field.children).forEach(child => {
      if (child !== trigger && child.classList?.contains('nv-date-trigger')) child.remove();
    });

    if (trigger.dataset.nvDateBound !== '1') {
      trigger.dataset.nvDateBound = '1';
      trigger.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        openPicker(input);
      });
    }

    return field;
  }

  function prepareInput(input) {
    if (!input) return;
    if (input.dataset.nvJalaliReady === '1') {
      ensureSingleDateTrigger(input);
      return;
    }
    if (input.type === 'hidden' || input.disabled) return;
    const originalType = input.getAttribute('type') || 'text';
    const isDateTime = input.classList.contains('nv-jalali-datetime') || originalType === 'datetime-local';
    const isDate = input.classList.contains('nv-jalali-date') || originalType === 'date' || isDateTime;
    if (!isDate) return;

    input.dataset.nvOriginalType = originalType;
    input.dataset.nvJalaliReady = '1';
    input.type = 'text';
    input.dir = 'ltr';
    input.inputMode = 'numeric';
    input.autocomplete = 'off';
    input.classList.add(isDateTime ? 'nv-jalali-datetime' : 'nv-jalali-date');
    input.classList.add('nv-jalali-input', 'nv3-date-control');
    input.placeholder = isDateTime ? '۱۴۰۵/۰۳/۲۴ ۰۹:۰۰' : '۱۴۰۵/۰۳/۲۴';

    if (input.value) {
      input.value = isDateTime ? toJalaliDateTime(input.value) : toJalaliDate(input.value);
    } else {
      const initialValue = defaultValueFor(input, isDateTime);
      if (initialValue) input.value = initialValue;
    }

    ensureSingleDateTrigger(input);

    input.addEventListener('focus', () => openPicker(input));
    input.addEventListener('click', () => openPicker(input));
  }

  function initFields(root=document) {
    const selector = '.nv-jalali-date,.nv-jalali-datetime,input[type="date"]:not([data-nv-skip-jalali]),input[type="datetime-local"]:not([data-nv-skip-jalali])';
    root.querySelectorAll(selector).forEach(prepareInput);
  }

  document.addEventListener('click', function (e) {
    const picker = document.getElementById('nvJalaliPicker');
    if (!picker) return;
    if (e.target.closest('.nv-jalali-picker')) {
      if (e.target.closest('[data-jp-prev]')) { view.jm -= 1; if (view.jm < 1) { view.jm = 12; view.jy -= 1; } renderPicker(activeInput); }
      if (e.target.closest('[data-jp-next]')) { view.jm += 1; if (view.jm > 12) { view.jm = 1; view.jy += 1; } renderPicker(activeInput); }
      const day = e.target.closest('[data-jp-day]');
      if (day && activeInput) {
        const timeInput = picker.querySelector('[data-jp-time]');
        if (timeInput && activeInput.classList.contains('nv-jalali-datetime')) activeInput.dataset.defaultTime = timeInput.value || '09:00';
        setInputValue(activeInput, view.jy, view.jm, Number(day.dataset.jpDay));
        picker.classList.remove('show', 'is-measuring'); picker.setAttribute('aria-hidden', 'true');
      }
      if (e.target.closest('[data-jp-today]') && activeInput) { const j = parseJalali(todayJalali()); setInputValue(activeInput, j.jy, j.jm, j.jd); picker.classList.remove('show', 'is-measuring'); picker.setAttribute('aria-hidden', 'true'); }
      if (e.target.closest('[data-jp-clear]') && activeInput) { activeInput.value = ''; activeInput.dispatchEvent(new Event('input', {bubbles:true})); activeInput.dispatchEvent(new Event('change', {bubbles:true})); picker.classList.remove('show', 'is-measuring'); picker.setAttribute('aria-hidden', 'true'); }
      return;
    }
    if (!e.target.closest('.nv-jalali-input,.nv-jalali-date,.nv-jalali-datetime')) {
      picker.classList.remove('show', 'is-measuring');
      picker.setAttribute('aria-hidden', 'true');
    }
  });

  let pickerPositionFrame = 0;
  function schedulePickerPosition() {
    const picker = document.getElementById('nvJalaliPicker');
    if (!picker?.classList.contains('show') || !activeInput) return;
    cancelAnimationFrame(pickerPositionFrame);
    pickerPositionFrame = requestAnimationFrame(() => placePicker(activeInput, picker));
  }
  window.addEventListener('resize', schedulePickerPosition, { passive: true });
  window.addEventListener('scroll', schedulePickerPosition, { passive: true, capture: true });
  window.visualViewport?.addEventListener('resize', schedulePickerPosition, { passive: true });
  window.visualViewport?.addEventListener('scroll', schedulePickerPosition, { passive: true });

  // Safe notification fixes: Persian datetime fields + visual remove after delete.
  function installNotificationFixes() {
    if (!window.location.pathname.toLowerCase().includes('notifications')) return;
    const startsAt = document.getElementById('startsAt');
    const expiresAt = document.getElementById('expiresAt');
    [startsAt, expiresAt].filter(Boolean).forEach(input => {
      input.classList.add('nv-jalali-datetime');
      prepareInput(input);
    });

    const statusFilter = document.getElementById('statusFilter');
    if (statusFilter && !statusFilter.dataset.nvTouched) {
      statusFilter.value = 'active';
      statusFilter.dataset.nvTouched = '1';
    }

    document.addEventListener('click', async function (event) {
      const btn = event.target.closest('[data-action="delete"]');
      if (!btn || !document.getElementById('notificationsTableBody')) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const id = btn.dataset.id;
      if (!id || !confirm('آیا از حذف این اعلان مطمئن هستید؟')) return;
      try {
        const headers = { 'Content-Type': 'application/json' };
        const res = await fetch(`/api/admin/notifications/${encodeURIComponent(id)}`, { method: 'DELETE', headers, cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.success === false) throw new Error(data.message || 'خطا در حذف اعلان');
        btn.closest('tr')?.remove();
        if (typeof showToast === 'function') showToast('اعلان حذف شد', 'success');
      } catch (error) {
        if (typeof showToast === 'function') showToast(error.message || 'خطا در حذف اعلان', 'error');
        else alert(error.message || 'خطا در حذف اعلان');
      }
    }, true);
  }

  function boot() {
    initFields();
    installNotificationFixes();
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          initFields(node);

          const roots = [];
          if (node.matches?.('.nv-date-field,.appt-filter-field')) roots.push(node);
          node.querySelectorAll?.('.nv-date-field,.appt-filter-field').forEach(item => roots.push(item));
          roots.forEach(root => {
            root.querySelectorAll('.nv-jalali-input,.nv-jalali-date,.nv-jalali-datetime').forEach(ensureSingleDateTrigger);
          });
        });
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  function gregorianToJalaliCompat(gy, gm, gd) {
    if (gy instanceof Date) { gd = gy.getDate(); gm = gy.getMonth() + 1; gy = gy.getFullYear(); }
    else if (typeof gy === 'string') {
      const parsed = parseGregorian(gy);
      if (parsed) { gy = parsed.gy; gm = parsed.gm; gd = parsed.gd; }
    }
    const out = toJalaliParts(Number(gy), Number(gm), Number(gd));
    return { year: out.jy, month: out.jm, day: out.jd, jy: out.jy, jm: out.jm, jd: out.jd, 0: out.jy, 1: out.jm, 2: out.jd, length: 3,
      toString(){ return `${toPersianDigits(this.year)}/${toPersianDigits(pad(this.month))}/${toPersianDigits(pad(this.day))}`; } };
  }

  function jalaliToGregorianCompat(jy, jm, jd) {
    if (typeof jy === 'string') {
      const parsed = parseJalali(jy);
      if (parsed) { jy = parsed.jy; jm = parsed.jm; jd = parsed.jd; }
    }
    const out = toGregorianParts(Number(jy), Number(jm), Number(jd));
    return { year: out.gy, month: out.gm, day: out.gd, gy: out.gy, gm: out.gm, gd: out.gd, 0: out.gy, 1: out.gm, 2: out.gd, length: 3,
      toString(){ return `${this.year}-${pad(this.month)}-${pad(this.day)}`; } };
  }

  window.NVDate = { __ready: true, __readyV2: true, toEnglishDigits, toPersianDigits, toGregorianDate, toGregorianDateTime, toJalaliDate, toJalaliDateTime, initFields };
  window.toGregorian = toGregorianDate;
  window.toGregorianDateString = toGregorianDate;
  window.toJalali = toJalaliDate;
  window.toJalaliDateString = toJalaliDate;
  window.isValidJalaliDate = value => Boolean(parseJalali(value));
  window.gregorianToJalali = gregorianToJalaliCompat;
  window.jalaliToGregorian = jalaliToGregorianCompat;
})();
