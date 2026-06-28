// NOORVISTA appointments day navigation and patient history
(function () {
  'use strict';
  if (window.__NV_APPOINTMENTS_DAY_HISTORY__) return;
  window.__NV_APPOINTMENTS_DAY_HISTORY__ = true;

  const faDigits = '۰۱۲۳۴۵۶۷۸۹';
  let appointments = [];
  let quickRangeDays = 0;

  const q = (selector, root = document) => root.querySelector(selector);
  const toFa = (value) => String(value ?? '').replace(/\d/g, d => faDigits[Number(d)]);
  const toEn = (value) => String(value ?? '')
    .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

  function normalizeText(value) {
    return toEn(value)
      .replace(/[ي]/g, 'ی')
      .replace(/[ك]/g, 'ک')
      .trim()
      .toLowerCase();
  }

  function localDateString(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function dateFromIso(value) {
    const iso = String(value || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const date = new Date(`${iso}T12:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function toGregorian(jalaliValue) {
    if (!jalaliValue) return '';
    if (typeof window.toGregorianDateString === 'function') {
      return String(window.toGregorianDateString(jalaliValue) || '').slice(0, 10);
    }
    if (window.NVDate?.toGregorianDate) {
      return String(window.NVDate.toGregorianDate(jalaliValue) || '').slice(0, 10);
    }
    return '';
  }

  function toJalali(gregorianValue) {
    if (!gregorianValue) return '';
    let result = '';
    if (typeof window.toJalaliDateString === 'function') result = window.toJalaliDateString(gregorianValue);
    else if (window.NVDate?.toJalaliDate) result = window.NVDate.toJalaliDate(gregorianValue);
    return toFa(result || gregorianValue);
  }

  function rangeLabel(days) {
    return ({ 7: 'هفته آینده', 30: 'ماه آینده', 90: 'سه‌ماه آینده', 365: 'یک‌سال آینده' })[Number(days)] || `${toFa(days)} روز آینده`;
  }

  function updateRangeButtons() {
    document.querySelectorAll('[data-appointments-range]').forEach(button => {
      const active = Number(button.dataset.appointmentsRange || 0) === Number(quickRangeDays || 0);
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function clearQuickRange(refresh = true) {
    quickRangeDays = 0;
    window.NVAppointmentsQuickRange = null;
    updateRangeButtons();
    if (refresh && typeof window.applyFilters === 'function') window.applyFilters();
  }

  function setQuickRange(days) {
    const count = Math.max(1, Number(days || 0));
    const from = dateFromIso(localDateString()) || new Date();
    const to = new Date(from);
    to.setDate(to.getDate() + count - 1);
    quickRangeDays = count;
    window.NVAppointmentsQuickRange = {
      days: count,
      from: localDateString(from),
      to: localDateString(to),
      label: rangeLabel(count)
    };
    const input = q('#filterDate');
    if (input) input.value = '';
    updateRangeButtons();
    updateDayLabel();
    if (typeof window.applyFilters === 'function') window.applyFilters();
  }

  function setFilterDay(gregorianDate) {
    clearQuickRange(false);
    const input = q('#filterDate');
    if (!input) return;
    input.value = toJalali(gregorianDate);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    updateDayLabel();
  }

  function currentFilterDay() {
    const input = q('#filterDate');
    const parsed = toGregorian(input?.value || '');
    return parsed || localDateString();
  }

  function shiftDay(offset) {
    const current = dateFromIso(currentFilterDay()) || new Date();
    current.setDate(current.getDate() + Number(offset || 0));
    setFilterDay(localDateString(current));
  }

  function updateDayLabel() {
    const input = q('#filterDate');
    const label = q('#appointmentsSelectedDayLabel');
    if (!label) return;
    label.textContent = quickRangeDays ? rangeLabel(quickRangeDays) : (input?.value ? input.value : 'همه روزها');
  }

  function patientKey(item) {
    if (item?.patient_id !== null && item?.patient_id !== undefined && item?.patient_id !== '') {
      return `id:${item.patient_id}`;
    }
    return `fallback:${normalizeText(item?.patient_name)}|${normalizeText(item?.patient_phone)}`;
  }

  function populatePatientSelect() {
    const select = q('#historyPatientId');
    if (!select) return;
    const current = select.value;
    const map = new Map();
    appointments.forEach(item => {
      const key = patientKey(item);
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: item.patient_name || 'بیمار بدون نام',
          phone: item.patient_phone || ''
        });
      }
    });

    const rows = [...map.values()].sort((a, b) => String(a.name).localeCompare(String(b.name), 'fa'));
    select.innerHTML = '<option value="">انتخاب بیمار...</option>' + rows.map(item => {
      const suffix = item.phone ? ` — ${item.phone}` : '';
      return `<option value="${escapeHtml(item.key)}">${escapeHtml(item.name + suffix)}</option>`;
    }).join('');
    if ([...select.options].some(option => option.value === current)) select.value = current;
    window.NVPrettySelects?.sync?.(select);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function historyBounds() {
    const range = q('#historyRange')?.value || '30';
    const today = dateFromIso(localDateString()) || new Date();
    const to = localDateString(today);

    if (range === 'all') return { from: '', to, label: 'کل سابقه ثبت‌شده' };
    if (range === 'custom') {
      const from = toGregorian(q('#historyDateFrom')?.value || '');
      const customTo = toGregorian(q('#historyDateTo')?.value || '') || to;
      return { from, to: customTo, label: 'بازه انتخابی' };
    }

    const days = Math.max(1, Number(range || 30));
    const fromDate = new Date(today);
    fromDate.setDate(fromDate.getDate() - (days - 1));
    const labels = { 30: '۳۰ روز گذشته', 90: '۳ ماه گذشته', 180: '۶ ماه گذشته', 365: '۱۲ ماه گذشته' };
    return { from: localDateString(fromDate), to, label: labels[days] || `${toFa(days)} روز گذشته` };
  }

  function statusText(status) {
    return ({ pending: 'در انتظار', confirmed: 'تأیید شده', completed: 'انجام شده', cancelled: 'لغو شده' })[status] || status || 'نامشخص';
  }

  function renderHistory() {
    const selectedPatient = q('#historyPatientId')?.value || '';
    const total = q('#historyTotalCount');
    const meta = q('#historyRangeMeta');
    const breakdown = q('#historyStatusBreakdown');
    const recent = q('#historyRecentList');
    if (!total || !meta || !breakdown || !recent) return;

    const bounds = historyBounds();
    const customFields = q('#historyCustomDates');
    if (customFields) customFields.hidden = (q('#historyRange')?.value !== 'custom');

    if (!selectedPatient) {
      total.textContent = '۰';
      meta.textContent = 'برای مشاهده تعداد نوبت‌ها، بیمار را انتخاب کنید.';
      breakdown.innerHTML = '';
      recent.innerHTML = '<div class="nv-history-empty">هنوز بیماری انتخاب نشده است.</div>';
      return;
    }

    if (q('#historyRange')?.value === 'custom' && (!bounds.from || !bounds.to)) {
      total.textContent = '۰';
      meta.textContent = 'تاریخ شروع و پایان بازه را مشخص کنید.';
      breakdown.innerHTML = '';
      recent.innerHTML = '<div class="nv-history-empty">بازه سفارشی کامل نیست.</div>';
      return;
    }

    const matches = appointments
      .filter(item => patientKey(item) === selectedPatient)
      .filter(item => {
        const date = String(item.appointment_date || '').slice(0, 10);
        if (!date) return false;
        if (bounds.from && date < bounds.from) return false;
        if (bounds.to && date > bounds.to) return false;
        return true;
      })
      .sort((a, b) => String(b.appointment_date).localeCompare(String(a.appointment_date)) || String(b.appointment_time).localeCompare(String(a.appointment_time)));

    total.textContent = toFa(matches.length);
    meta.textContent = `${bounds.label}؛ از ${bounds.from ? toJalali(bounds.from) : 'ابتدای سوابق'} تا ${toJalali(bounds.to)}`;

    const counts = matches.reduce((acc, item) => {
      const key = item.status || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    breakdown.innerHTML = ['completed', 'confirmed', 'pending', 'cancelled']
      .map(status => `<span class="nv-history-chip is-${status}">${statusText(status)}: <strong>${toFa(counts[status] || 0)}</strong></span>`)
      .join('');

    if (!matches.length) {
      recent.innerHTML = '<div class="nv-history-empty">در این بازه نوبتی برای بیمار ثبت نشده است.</div>';
      return;
    }

    recent.innerHTML = matches.slice(0, 5).map(item => `
      <div class="nv-history-row">
        <div><strong>${escapeHtml(item.doctor_name || 'پزشک نامشخص')}</strong><span>${toJalali(item.appointment_date)} ـ ${toFa(String(item.appointment_time || '').slice(0, 5))}</span></div>
        <span class="nv-history-status is-${escapeHtml(item.status || 'unknown')}">${escapeHtml(statusText(item.status))}</span>
      </div>
    `).join('');
  }

  function setCustomDefaults() {
    const from = q('#historyDateFrom');
    const to = q('#historyDateTo');
    if (!from || !to) return;
    const today = dateFromIso(localDateString()) || new Date();
    const monthAgo = new Date(today);
    monthAgo.setDate(monthAgo.getDate() - 29);
    if (!from.value) from.value = toJalali(localDateString(monthAgo));
    if (!to.value) to.value = toJalali(localDateString(today));
  }

  function bind() {
    q('#appointmentsPrevDay')?.addEventListener('click', () => shiftDay(-1));
    q('#appointmentsNextDay')?.addEventListener('click', () => shiftDay(1));
    q('#appointmentsTodayDay')?.addEventListener('click', () => setFilterDay(localDateString()));
    document.querySelectorAll('[data-appointments-range]').forEach(button => {
      button.addEventListener('click', () => setQuickRange(button.dataset.appointmentsRange));
    });
    q('#filterDate')?.addEventListener('input', () => {
      if (quickRangeDays) clearQuickRange(false);
      updateDayLabel();
    });
    q('#filterDate')?.addEventListener('change', () => {
      if (quickRangeDays) clearQuickRange(false);
      updateDayLabel();
    });

    q('#historyPatientId')?.addEventListener('change', renderHistory);
    q('#historyRange')?.addEventListener('change', event => {
      if (event.target.value === 'custom') setCustomDefaults();
      renderHistory();
    });
    ['#historyDateFrom', '#historyDateTo'].forEach(selector => {
      q(selector)?.addEventListener('input', renderHistory);
      q(selector)?.addEventListener('change', renderHistory);
    });
    q('#historyApplyBtn')?.addEventListener('click', renderHistory);

    const originalClear = window.clearFilters;
    if (typeof originalClear === 'function' && !originalClear.__nvWrapped) {
      const wrapped = function () {
        clearQuickRange(false);
        const result = originalClear.apply(this, arguments);
        updateDayLabel();
        return result;
      };
      wrapped.__nvWrapped = true;
      window.clearFilters = wrapped;
    }

    updateRangeButtons();
    updateDayLabel();
    renderHistory();
  }

  window.NVAppointmentsDateControls = {
    setQuickRange,
    clearQuickRange,
    setDay: setFilterDay
  };

  document.addEventListener('nv:appointments-loaded', event => {
    appointments = Array.isArray(event.detail?.appointments) ? event.detail.appointments : [];
    populatePatientSelect();
    renderHistory();
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
