// Sadra patient dashboard rebuilt with Tailwind utilities.
(function () {
  'use strict';

  const qs = selector => document.querySelector(selector);
  const fa = '۰۱۲۳۴۵۶۷۸۹';
  const toFa = value => String(value ?? '').replace(/\d/g, d => fa[Number(d)]);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));

  function jalali(value) {
    if (!value) return '-';
    if (typeof window.toJalali === 'function') return window.toJalali(value);
    try {
      return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
        year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(new Date(String(value).slice(0, 10) + 'T00:00:00'));
    } catch (_) {
      return toFa(String(value).slice(0, 10));
    }
  }

  function statusBadge(status) {
    const map = {
      pending: ['در انتظار', 'nv-tw-badge-warning'],
      confirmed: ['تأیید شده', 'nv-tw-badge-info'],
      completed: ['انجام شده', 'nv-tw-badge-success'],
      cancelled: ['لغو شده', 'nv-tw-badge-danger'],
      canceled: ['لغو شده', 'nv-tw-badge-danger']
    };
    const [label, cls] = map[String(status || 'pending')] || [status || 'نامشخص', 'nv-tw-badge-muted'];
    return `<span class="nv-tw-badge ${cls}">${esc(label)}</span>`;
  }

  function statCard(label, value, icon, note) {
    return `
      <article class="nv-tw-stat-card">
        <span class="nv-tw-stat-icon"><i class="${icon}"></i></span>
        <div class="tw-min-w-0"><div class="nv-tw-stat-value">${toFa(value || 0)}</div><div class="nv-tw-stat-label">${label}</div><div class="tw-mt-1 tw-truncate tw-text-xs tw-text-slate-400">${note}</div></div>
      </article>`;
  }

  function appointmentsTable(appointments) {
    if (!appointments.length) return `<div class="nv-tw-empty">هنوز نوبتی برای شما ثبت نشده است.</div>`;
    return `
      <div class="nv-tw-table-wrap">
        <table class="nv-tw-table">
          <thead><tr><th>تاریخ</th><th>ساعت</th><th>پزشک</th><th>وضعیت</th><th>عملیات</th></tr></thead>
          <tbody>${appointments.map(app => `
            <tr>
              <td><strong class="tw-text-clinic-ink">${jalali(app.appointment_date)}</strong></td>
              <td>${toFa(String(app.appointment_time || '-').slice(0,5))}</td>
              <td>${esc(app.doctor_name || '-')}</td>
              <td>${statusBadge(app.status)}</td>
              <td><a class="tw-inline-flex tw-items-center tw-rounded-xl tw-border tw-border-slate-200 tw-px-3 tw-py-2 tw-text-xs tw-font-bold tw-text-slate-700 hover:tw-border-noor-200 hover:tw-bg-noor-50 hover:tw-text-noor-700" href="appointments.html?view=${encodeURIComponent(app.id)}">جزئیات</a></td>
            </tr>`).join('')}</tbody>
        </table>
      </div>`;
  }

  function render(root, stats, appointments) {
    const next = stats.nextAppointment;
    root.innerHTML = `
      <div class="tw-space-y-6">
        ${next ? `
          <article class="tw-overflow-hidden tw-rounded-noor tw-bg-gradient-to-l tw-from-indigo-700 tw-via-noor-700 tw-to-sky-500 tw-p-6 tw-text-white tw-shadow-noor sm:tw-p-7">
            <div class="tw-flex tw-flex-col tw-gap-5 sm:tw-flex-row sm:tw-items-center sm:tw-justify-between">
              <div><span class="tw-inline-flex tw-items-center tw-gap-2 tw-rounded-full tw-bg-white/15 tw-px-3 tw-py-1.5 tw-text-xs tw-font-bold"><i class="icon-calendar"></i> نوبت بعدی شما</span><h2 class="tw-mt-4 tw-text-2xl tw-font-black sm:tw-text-3xl">${jalali(next.appointment_date)} · ${toFa(String(next.appointment_time || '-').slice(0,5))}</h2><p class="tw-mt-3 tw-text-sm tw-text-sky-100"><i class="icon-user-md tw-ml-2"></i>دکتر ${esc(next.doctor_name || '-')}</p></div>
              <div class="tw-flex tw-items-center tw-gap-3">${statusBadge(next.status)}<a class="tw-inline-flex tw-items-center tw-rounded-xl tw-bg-white tw-px-4 tw-py-2.5 tw-text-sm tw-font-bold tw-text-noor-800 hover:tw-bg-sky-50" href="appointments.html">مشاهده نوبت</a></div>
            </div>
          </article>` : `
          <article class="tw-rounded-noor tw-border tw-border-dashed tw-border-noor-200 tw-bg-noor-50 tw-p-6">
            <div class="tw-flex tw-flex-col tw-gap-4 sm:tw-flex-row sm:tw-items-center sm:tw-justify-between"><div><h2 class="tw-text-lg tw-font-black tw-text-noor-900">نوبت فعالی ندارید</h2><p class="tw-mt-2 tw-text-sm tw-text-noor-700">برای دریافت خدمات چشم‌پزشکی یک زمان مناسب دریافت کنید.</p></div><a class="noor-tw-btn-primary" href="appointments.html#book"><i class="icon-calendar"></i> دریافت نوبت</a></div>
          </article>`}

        <div class="tw-grid tw-grid-cols-1 tw-gap-4 sm:tw-grid-cols-3">
          ${statCard('کل نوبت‌ها', stats.totalAppointments, 'icon-calendar', 'همه نوبت‌های ثبت‌شده')}
          ${statCard('نوبت‌های انجام‌شده', stats.completedAppointments, 'icon-check', 'سوابق ویزیت تکمیل‌شده')}
          ${statCard('پرونده‌های پزشکی', stats.totalRecords, 'icon-database', 'اسناد پزشکی قابل مشاهده')}
        </div>

        <div class="tw-grid tw-grid-cols-1 tw-gap-6 xl:tw-grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
          <article class="nv-tw-card">
            <header class="nv-tw-card-header"><div><h2 class="tw-text-lg tw-font-black tw-text-clinic-ink">نوبت‌های اخیر</h2><p class="tw-mt-1 tw-text-sm tw-text-slate-500">آخرین درخواست‌ها و وضعیت بررسی آن‌ها</p></div><a class="noor-tw-btn-primary" href="appointments.html#book"><i class="icon-plus"></i> درخواست نوبت</a></header>
            <div class="nv-tw-card-body">${appointmentsTable(appointments)}</div>
          </article>

          <aside class="nv-tw-card">
            <header class="nv-tw-card-header"><div><h2 class="tw-text-lg tw-font-black tw-text-clinic-ink">خدمات من</h2><p class="tw-mt-1 tw-text-sm tw-text-slate-500">دسترسی سریع به اطلاعات درمان</p></div></header>
            <div class="nv-tw-card-body tw-space-y-3">
              <a class="nv-tw-quick-link" href="medical-records.html"><span class="tw-flex tw-items-center tw-gap-3"><span class="nv-tw-quick-link-icon"><i class="icon-database"></i></span>پرونده پزشکی</span><i class="icon-chevron-left tw-text-slate-400"></i></a>
              <a class="nv-tw-quick-link" href="prescriptions.html"><span class="tw-flex tw-items-center tw-gap-3"><span class="nv-tw-quick-link-icon"><i class="icon-comments"></i></span>نسخه‌ها</span><i class="icon-chevron-left tw-text-slate-400"></i></a>
              <a class="nv-tw-quick-link" href="payments.html"><span class="tw-flex tw-items-center tw-gap-3"><span class="nv-tw-quick-link-icon"><i class="icon-credit-card"></i></span>پرداخت‌ها</span><i class="icon-chevron-left tw-text-slate-400"></i></a>
              <a class="nv-tw-quick-link" href="profile.html"><span class="tw-flex tw-items-center tw-gap-3"><span class="nv-tw-quick-link-icon"><i class="icon-user"></i></span>اطلاعات حساب من</span><i class="icon-chevron-left tw-text-slate-400"></i></a>
            </div>
          </aside>
        </div>
      </div>`;
  }

  async function init() {
    if (typeof window.checkAuth === 'function' && !window.checkAuth()) return;
    const root = qs('#patientPageContent');
    if (!root) return;
    root.innerHTML = `<div class="nv-tw-empty">در حال دریافت اطلاعات پرونده شما...</div>`;

    try {
      const [statsResult, appointmentsResult] = await Promise.all([
        window.apiRequest('/patient/stats'),
        window.apiRequest('/patient/appointments/recent')
      ]);
      render(root, statsResult || {}, appointmentsResult?.appointments || []);
    } catch (error) {
      root.innerHTML = `<div class="tw-rounded-noor tw-border tw-border-rose-200 tw-bg-rose-50 tw-p-6 tw-text-center tw-text-sm tw-font-bold tw-text-rose-700">خطا در بارگذاری داشبورد: ${esc(error.message || 'ارتباط با سرور برقرار نشد')}</div>`;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
