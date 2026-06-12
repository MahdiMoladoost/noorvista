/* admin-polish.js */
/* Complete missing admin actions + UI helpers for NoorVista */

(function () {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function hasApi() {
    return typeof window.apiRequest === "function";
  }

  function toast(message, type = "info") {
    if (typeof window.showToast === "function") {
      window.showToast(message, type);
      return;
    }
    console[type === "error" ? "error" : "log"](message);
    alert(message);
  }

  function safeText(value, fallback = "-") {
    if (value === null || value === undefined || value === "") return fallback;
    return String(value);
  }

  function price(value) {
    if (typeof window.formatPrice === "function") return window.formatPrice(value || 0);
    const number = Number(value || 0);
    return number.toLocaleString("fa-IR") + " تومان";
  }

  function faNumber(value) {
    if (typeof window.toPersianNumber === "function") return window.toPersianNumber(value);
    return String(value ?? "").replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
  }

  function show(id) {
    if (typeof window.showModal === "function") {
      window.showModal(id);
      return;
    }
    const modal = document.getElementById(id);
    if (modal) modal.classList.add("show");
  }

  function hide(id) {
    if (typeof window.hideModal === "function") {
      window.hideModal(id);
      return;
    }
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove("show");
  }

  function serializeForm(form) {
    const data = {};
    new FormData(form).forEach((value, key) => {
      data[key] = value;
    });
    return data;
  }

  function ensureModal(id, title, bodyHtml, footerHtml) {
    let modal = document.getElementById(id);
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = id;
    modal.className = "modal-overlay";
    modal.innerHTML = `
      <div class="modal-container" style="max-width:680px">
        <div class="modal-header">
          <h3>${title}</h3>
          <button class="modal-close" type="button" aria-label="بستن">&times;</button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
        <div class="modal-footer">${footerHtml}</div>
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
  }

  function closeAllModalsOnClick() {
    document.addEventListener("click", function (event) {
      const closeButton = event.target.closest(".modal-close");
      if (closeButton) {
        const modal = closeButton.closest(".modal-overlay");
        if (modal) modal.classList.remove("show");
      }

      if (event.target.classList.contains("modal-overlay")) {
        event.target.classList.remove("show");
      }
    });
  }

  function enhanceTables() {
    $$(".data-table, .data-table-advanced").forEach((table) => {
      const tbody = $("tbody", table);
      if (tbody && !tbody.children.length) {
        tbody.innerHTML = `<tr><td class="admin-empty" colspan="${$("thead tr", table)?.children.length || 1}">هنوز داده‌ای ثبت نشده است</td></tr>`;
      }
    });
  }

  function addPaymentButton() {
    if (!document.getElementById("addPaymentModal")) return;
    const header = $(".card-header");
    if (!header || $("#openAddPaymentBtn")) return;

    const btn = document.createElement("button");
    btn.id = "openAddPaymentBtn";
    btn.className = "btn btn-sm btn-primary";
    btn.innerHTML = `<i class="icon-plus"></i> ثبت پرداخت`;
    btn.type = "button";
    btn.addEventListener("click", () => show("addPaymentModal"));

    const title = $("h4", header);
    if (title) title.insertAdjacentElement("afterend", btn);
    else header.appendChild(btn);
  }

  function csvDownload(filename, rows) {
    const csv = rows
      .map((row) =>
        row
          .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  window.exportReport = function exportReport() {
    const rows = [["شناسه", "تاریخ", "بیمار", "نوبت", "مبلغ", "روش پرداخت", "وضعیت", "شماره رسید"]];
    const payments = Array.isArray(window.allPayments) ? window.allPayments : [];

    if (!payments.length) {
      toast("داده‌ای برای خروجی گرفتن وجود ندارد", "error");
      return;
    }

    payments.forEach((p) => {
      rows.push([
        p.id || "",
        p.payment_date_jalali || p.payment_date || "",
        p.patient_name || "",
        p.appointment_id || "",
        p.amount || "",
        p.payment_method || "",
        p.status || "",
        p.receipt_number || ""
      ]);
    });

    csvDownload("payments-report.csv", rows);
    toast("خروجی پرداخت‌ها آماده شد", "success");
  };

  /* Users page */
  function ensureUserEditModal() {
    ensureModal(
      "editUserModal",
      "ویرایش کاربر",
      `
        <form id="editUserForm">
          <input type="hidden" name="id" id="editUserId">
          <div class="form-row">
            <div class="form-group">
              <label>نام کامل</label>
              <input class="form-control" name="full_name" id="editUserFullName" required>
            </div>
            <div class="form-group">
              <label>نام کاربری</label>
              <input class="form-control" name="username" id="editUserUsername" required>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>شماره تلفن</label>
              <input class="form-control" name="phone" id="editUserPhone" required>
            </div>
            <div class="form-group">
              <label>ایمیل</label>
              <input class="form-control" name="email" id="editUserEmail" type="email">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>نقش کاربری</label>
              <select class="form-control" name="role" id="editUserRole">
                <option value="patient">بیمار</option>
                <option value="doctor">پزشک</option>
                <option value="receptionist">منشی</option>
                <option value="clinic_admin">مدیر کلینیک</option>
                <option value="system_admin">مدیر سیستم</option>
              </select>
            </div>
            <div class="form-group">
              <label>وضعیت</label>
              <select class="form-control" name="is_active" id="editUserStatus">
                <option value="true">فعال</option>
                <option value="false">غیرفعال</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>رمز عبور جدید؛ در صورت عدم تغییر خالی بماند</label>
            <input class="form-control" name="password" id="editUserPassword" type="password">
          </div>
        </form>
      `,
      `
        <button class="btn btn-outline" type="button" onclick="hideModal('editUserModal')">انصراف</button>
        <button class="btn btn-primary" type="button" onclick="updateUser()">ذخیره تغییرات</button>
      `
    );
  }

  window.editUser = async function editUser(id) {
    ensureUserEditModal();

    try {
      if (!hasApi()) throw new Error("apiRequest در دسترس نیست");
      const response = await apiRequest(`/api/admin/users/${id}`);
      const user = response.user || response;

      $("#editUserId").value = user.id || id;
      $("#editUserFullName").value = user.full_name || "";
      $("#editUserUsername").value = user.username || "";
      $("#editUserPhone").value = user.phone || "";
      $("#editUserEmail").value = user.email || "";
      $("#editUserRole").value = user.role || "patient";
      $("#editUserStatus").value = String(user.is_active !== false);
      $("#editUserPassword").value = "";

      show("editUserModal");
    } catch (error) {
      console.error(error);
      toast("خطا در دریافت اطلاعات کاربر", "error");
    }
  };

  window.updateUser = async function updateUser() {
    const form = $("#editUserForm");
    if (!form) return;

    const data = serializeForm(form);
    const id = data.id;
    data.is_active = data.is_active === "true";
    if (!data.password) delete data.password;

    try {
      await apiRequest(`/api/admin/users/${id}`, "PUT", data);
      toast("کاربر با موفقیت ویرایش شد", "success");
      hide("editUserModal");
      if (typeof window.loadUsers === "function") window.loadUsers();
    } catch (error) {
      console.error(error);
      toast("خطا در ویرایش کاربر", "error");
    }
  };

  window.deleteUser = async function deleteUser(id) {
    if (!confirm("آیا از حذف این کاربر اطمینان دارید؟")) return;

    try {
      await apiRequest(`/api/admin/users/${id}`, "DELETE");
      toast("کاربر با موفقیت حذف شد", "success");
      if (typeof window.loadUsers === "function") window.loadUsers();
    } catch (error) {
      console.error(error);
      toast("خطا در حذف کاربر", "error");
    }
  };

  /* Doctors page */
  function ensureDoctorEditModal() {
    ensureModal(
      "editDoctorModal",
      "ویرایش پزشک",
      `
        <form id="editDoctorForm">
          <input type="hidden" name="id" id="editDoctorId">
          <div class="form-row">
            <div class="form-group">
              <label>نام کامل</label>
              <input class="form-control" name="full_name" id="editDoctorFullName" required>
            </div>
            <div class="form-group">
              <label>تخصص</label>
              <input class="form-control" name="specialty" id="editDoctorSpecialty" required>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>شماره نظام پزشکی</label>
              <input class="form-control" name="license_number" id="editDoctorLicense" required>
            </div>
            <div class="form-group">
              <label>سابقه</label>
              <input class="form-control" name="experience_years" id="editDoctorExperience" type="number" min="0">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>هزینه ویزیت</label>
              <input class="form-control" name="consultation_fee" id="editDoctorFee" type="number" min="0">
            </div>
            <div class="form-group">
              <label>وضعیت</label>
              <select class="form-control" name="is_available" id="editDoctorAvailable">
                <option value="true">فعال و قابل رزرو</option>
                <option value="false">غیرفعال</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>تلفن</label>
              <input class="form-control" name="phone" id="editDoctorPhone">
            </div>
            <div class="form-group">
              <label>ایمیل</label>
              <input class="form-control" name="email" id="editDoctorEmail" type="email">
            </div>
          </div>
        </form>
      `,
      `
        <button class="btn btn-outline" type="button" onclick="hideModal('editDoctorModal')">انصراف</button>
        <button class="btn btn-primary" type="button" onclick="updateDoctor()">ذخیره تغییرات</button>
      `
    );
  }

  window.editDoctor = async function editDoctor(id) {
    ensureDoctorEditModal();

    try {
      const response = await apiRequest(`/api/admin/doctors/${id}`);
      const doctor = response.doctor || response;

      $("#editDoctorId").value = doctor.id || id;
      $("#editDoctorFullName").value = doctor.full_name || "";
      $("#editDoctorSpecialty").value = doctor.specialty || "";
      $("#editDoctorLicense").value = doctor.license_number || "";
      $("#editDoctorExperience").value = doctor.experience_years || "";
      $("#editDoctorFee").value = doctor.consultation_fee || "";
      $("#editDoctorAvailable").value = String(doctor.is_available !== false);
      $("#editDoctorPhone").value = doctor.phone || "";
      $("#editDoctorEmail").value = doctor.email || "";

      show("editDoctorModal");
    } catch (error) {
      console.error(error);
      toast("خطا در دریافت اطلاعات پزشک", "error");
    }
  };

  window.updateDoctor = async function updateDoctor() {
    const form = $("#editDoctorForm");
    if (!form) return;

    const data = serializeForm(form);
    const id = data.id;
    data.is_available = data.is_available === "true";

    try {
      await apiRequest(`/api/admin/doctors/${id}`, "PUT", data);
      toast("پزشک با موفقیت ویرایش شد", "success");
      hide("editDoctorModal");
      if (typeof window.loadDoctors === "function") window.loadDoctors();
    } catch (error) {
      console.error(error);
      toast("خطا در ویرایش پزشک", "error");
    }
  };

  window.deleteDoctor = async function deleteDoctor(id) {
    if (!confirm("آیا از حذف این پزشک اطمینان دارید؟")) return;

    try {
      await apiRequest(`/api/admin/doctors/${id}`, "DELETE");
      toast("پزشک با موفقیت حذف شد", "success");
      if (typeof window.loadDoctors === "function") window.loadDoctors();
    } catch (error) {
      console.error(error);
      toast("خطا در حذف پزشک", "error");
    }
  };

  /* Backup page */
  window.downloadBackup = function downloadBackup(filename) {
    if (!filename) {
      toast("نام فایل پشتیبان نامعتبر است", "error");
      return;
    }

    const url = `/api/admin/backups/${encodeURIComponent(filename)}/download`;
    window.location.href = url;
  };

  window.restoreBackupFile = async function restoreBackupFile(filename) {
    if (!filename) {
      toast("نام فایل پشتیبان نامعتبر است", "error");
      return;
    }

    if (!confirm("بازیابی پشتیبان ممکن است اطلاعات فعلی را تغییر دهد. ادامه می‌دهید؟")) return;

    try {
      await apiRequest(`/api/admin/backups/${encodeURIComponent(filename)}/restore`, "POST");
      toast("پشتیبان با موفقیت بازیابی شد", "success");
      if (typeof window.loadBackups === "function") window.loadBackups();
    } catch (error) {
      console.error(error);
      toast("خطا در بازیابی پشتیبان", "error");
    }
  };

  window.deleteBackup = async function deleteBackup(filename) {
    if (!filename) {
      toast("نام فایل پشتیبان نامعتبر است", "error");
      return;
    }

    if (!confirm("آیا از حذف این فایل پشتیبان اطمینان دارید؟")) return;

    try {
      await apiRequest(`/api/admin/backups/${encodeURIComponent(filename)}`, "DELETE");
      toast("فایل پشتیبان حذف شد", "success");
      if (typeof window.loadBackups === "function") window.loadBackups();
    } catch (error) {
      console.error(error);
      toast("خطا در حذف پشتیبان", "error");
    }
  };

  window.restoreBackup = function restoreBackup() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".sql,.zip,.gz,.bak";

    input.addEventListener("change", async function () {
      const file = input.files && input.files[0];
      if (!file) return;

      if (!confirm("از آپلود و بازیابی این پشتیبان اطمینان دارید؟")) return;

      try {
        const formData = new FormData();
        formData.append("backup", file);

        if (typeof fetch !== "function") throw new Error("fetch در مرورگر در دسترس نیست");

        const response = await fetch("/api/admin/backup/restore", {
          method: "POST",
          body: formData,
          credentials: "include"
        });

        if (!response.ok) throw new Error("restore failed");

        toast("پشتیبان با موفقیت آپلود و بازیابی شد", "success");
        if (typeof window.loadBackups === "function") window.loadBackups();
      } catch (error) {
        console.error(error);
        toast("خطا در آپلود یا بازیابی پشتیبان", "error");
      }
    });

    input.click();
  };

  /* Logs page */
  window.exportLogs = function exportLogs() {
    const table = $("#logsTable");
    if (!table) return;

    const rows = [];
    $$("tr", table).forEach((tr) => {
      const cells = $$("th,td", tr).map((cell) => cell.textContent.trim());
      if (cells.length) rows.push(cells);
    });

    if (rows.length <= 1) {
      toast("لاگی برای خروجی گرفتن وجود ندارد", "error");
      return;
    }

    csvDownload("system-logs.csv", rows);
    toast("خروجی لاگ‌ها آماده شد", "success");
  };

  function addLogsExportButton() {
    if (!$("#logsTable") || $("#exportLogsBtn")) return;

    const header = $(".card-header");
    if (!header) return;

    const btn = document.createElement("button");
    btn.id = "exportLogsBtn";
    btn.className = "btn btn-sm btn-success";
    btn.type = "button";
    btn.innerHTML = `<i class="icon-download"></i> خروجی لاگ‌ها`;
    btn.addEventListener("click", window.exportLogs);

    header.appendChild(btn);
  }

  function polishSettingsPage() {
    const form = $("#settingsForm");
    if (!form || $("#settingsPageHint")) return;

    const hint = document.createElement("div");
    hint.id = "settingsPageHint";
    hint.className = "backup-card";
    hint.innerHTML = `
      <h4 style="margin-bottom:8px">پیکربندی حرفه‌ای سیستم</h4>
      <p style="color:#64748b;margin:0">
        اطلاعات کلینیک، پیامک، یادآوری نوبت و هزینه پیش‌فرض را از این بخش مدیریت کنید.
      </p>
    `;
    form.parentElement.insertBefore(hint, form);
  }

  function init() {
    closeAllModalsOnClick();
    enhanceTables();
    addPaymentButton();
    addLogsExportButton();
    polishSettingsPage();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();