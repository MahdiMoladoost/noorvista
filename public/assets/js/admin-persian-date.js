// NOORVISTA Persian/Jalali date fields for admin forms
// Stable custom Jalali picker: no native Gregorian calendar, supports date and datetime fields.
(function () {
  if (window.NVDate && window.NVDate.__readyV2) return;

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
    if (jy < jp || jy >= breaks[bl - 1]) throw new Error('Invalid Jalaali year ' + jy);
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

  function todayJalali() { return toJalaliDate(new Date().toISOString().slice(0,10)); }

  const monthNames = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
  const daysInMonth = (jy, jm) => jm <= 6 ? 31 : jm <= 11 ? 30 : (jalCal(jy).leap === 0 ? 30 : 29);

  function ensurePicker() {
    let picker = document.getElementById('nvJalaliPicker');
    if (!picker) {
      picker = document.createElement('div');
      picker.id = 'nvJalaliPicker';
      picker.className = 'nv-jalali-picker';
      document.body.appendChild(picker);
    }
    return picker;
  }

  let activeInput = null;
  let view = (() => {
    const j = parseJalali(todayJalali());
    return { jy: j.jy, jm: j.jm };
  })();

  function placePicker(input, picker) {
    const rect = input.getBoundingClientRect();
    const width = Math.max(rect.width, 310);
    const left = Math.max(12, Math.min(window.scrollX + rect.left, window.scrollX + document.documentElement.clientWidth - width - 12));
    picker.style.top = `${window.scrollY + rect.bottom + 8}px`;
    picker.style.left = `${left}px`;
    picker.style.minWidth = `${width}px`;
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

  function renderPicker(input) {
    const picker = ensurePicker();
    const selected = parseJalali(input.value) || parseJalali(todayJalali());
    if (!view || !view.jy) view = { jy: selected.jy, jm: selected.jm };
    const firstG = toGregorianParts(view.jy, view.jm, 1);
    const firstDate = new Date(`${firstG.gy}-${pad(firstG.gm)}-${pad(firstG.gd)}T00:00:00`);
    const firstIndex = (firstDate.getDay() + 1) % 7;
    let html = `<div class="nv-jp-head"><button type="button" data-jp-prev aria-label="ماه قبل">›</button><strong>${monthNames[view.jm-1]} ${toPersianDigits(view.jy)}</strong><button type="button" data-jp-next aria-label="ماه بعد">‹</button></div>`;
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
    placePicker(input, picker);
    picker.classList.add('show');
  }

  function openPicker(input) {
    activeInput = input;
    const parsed = parseJalali(input.value) || parseJalali(todayJalali());
    view = { jy: parsed.jy, jm: parsed.jm };
    renderPicker(input);
  }

  function prepareInput(input) {
    if (!input || input.dataset.nvJalaliReady === '1') return;
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
    input.classList.add('nv-jalali-input');
    input.placeholder = isDateTime ? '۱۴۰۴/۰۱/۰۱ ۰۹:۰۰' : '۱۴۰۴/۰۱/۰۱';

    if (input.value) {
      input.value = isDateTime ? toJalaliDateTime(input.value) : toJalaliDate(input.value);
    }

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
        picker.classList.remove('show');
      }
      if (e.target.closest('[data-jp-today]') && activeInput) { const j = parseJalali(todayJalali()); setInputValue(activeInput, j.jy, j.jm, j.jd); picker.classList.remove('show'); }
      if (e.target.closest('[data-jp-clear]') && activeInput) { activeInput.value = ''; activeInput.dispatchEvent(new Event('input', {bubbles:true})); activeInput.dispatchEvent(new Event('change', {bubbles:true})); picker.classList.remove('show'); }
      return;
    }
    if (!e.target.closest('.nv-jalali-input,.nv-jalali-date,.nv-jalali-datetime')) picker.classList.remove('show');
  });

  window.addEventListener('resize', () => {
    const picker = document.getElementById('nvJalaliPicker');
    if (picker?.classList.contains('show') && activeInput) placePicker(activeInput, picker);
  });

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
        const token = localStorage.getItem('token');
        if (token) headers.Authorization = `Bearer ${token}`;
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
          if (node.nodeType === 1) initFields(node);
        });
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.NVDate = { __ready: true, __readyV2: true, toEnglishDigits, toPersianDigits, toGregorianDate, toGregorianDateTime, toJalaliDate, toJalaliDateTime, initFields };
})();
