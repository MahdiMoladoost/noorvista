// ============================================
// NoorVista - توابع اصلی و ابزارها (نسخه کامل)
// ============================================

// تبدیل تاریخ به شمسی
function toPersianDate(date) {
    if (!date) return '-';
    const d = new Date(date);
    return new Intl.DateTimeFormat('fa-IR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }).format(d);
}

// تبدیل تاریخ به میلادی برای ذخیره
function toGregorianDate(persianDate) {
    // ساده شده - در عمل نیاز به کتابخانه تبدیل دارد
    return persianDate;
}

// فرمت قیمت
function formatPrice(amount) {
    if (!amount) return '۰ تومان';
    return new Intl.NumberFormat('fa-IR').format(amount) + ' تومان';
}

// وضعیت نوبت
function getAppointmentStatusBadge(status) {
    const map = {
        'pending': '<span class="badge status-pending"><i class="fas fa-clock"></i> در انتظار</span>',
        'confirmed': '<span class="badge status-confirmed"><i class="fas fa-check-circle"></i> تأیید شده</span>',
        'completed': '<span class="badge status-completed"><i class="fas fa-check-double"></i> انجام شده</span>',
        'cancelled': '<span class="badge status-cancelled"><i class="fas fa-ban"></i> لغو شده</span>',
        'no-show': '<span class="badge status-no-show"><i class="fas fa-user-slash"></i> عدم حضور</span>'
    };
    return map[status] || map.pending;
}

// وضعیت کاربر
function getUserStatusBadge(status) {
    if (status === 'active') return '<span class="badge status-active"><i class="fas fa-circle"></i> فعال</span>';
    return '<span class="badge status-inactive"><i class="fas fa-circle"></i> غیرفعال</span>';
}

// وضعیت پرداخت
function getPaymentStatusBadge(status) {
    const map = {
        'paid': '<span class="badge status-paid"><i class="fas fa-check-circle"></i> پرداخت شده</span>',
        'unpaid': '<span class="badge status-unpaid"><i class="fas fa-hourglass"></i> پرداخت نشده</span>',
        'partial': '<span class="badge status-partial"><i class="fas fa-chart-line"></i> پرداخت جزئی</span>'
    };
    return map[status] || map.unpaid;
}

// نمایش اعلان موفقیت
function showSuccess(message, title = 'موفق!') {
    Swal.fire({
        icon: 'success',
        title: title,
        text: message,
        timer: 2000,
        showConfirmButton: false,
        position: 'top-end'
    });
}

// نمایش اعلان خطا
function showError(message, title = 'خطا!') {
    Swal.fire({
        icon: 'error',
        title: title,
        text: message,
        confirmButtonText: 'باشه',
        confirmButtonColor: '#2f89fc'
    });
}

// نمایش اعلان تأیید
async function showConfirm(message, title = 'آیا اطمینان دارید؟') {
    const result = await Swal.fire({
        title: title,
        text: message,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'بله، حذف شود',
        cancelButtonText: 'انصراف',
        confirmButtonColor: '#dc3545',
        cancelButtonColor: '#6c757d'
    });
    return result.isConfirmed;
}

// نمایش مودال فرم
async function showFormModal(title, html, confirmText = 'ذخیره') {
    const result = await Swal.fire({
        title: title,
        html: html,
        showCancelButton: true,
        confirmButtonText: confirmText,
        cancelButtonText: 'انصراف',
        confirmButtonColor: '#2f89fc',
        preConfirm: () => {
            const form = Swal.getPopup().querySelector('form');
            if (form) {
                const formData = new FormData(form);
                const data = {};
                formData.forEach((value, key) => { data[key] = value; });
                return data;
            }
            return {};
        }
    });
    return result;
}

// رندر جدول با قابلیت جستجو و صفحه‌بندی
class DataTable {
    constructor(elementId, columns, data, options = {}) {
        this.element = document.getElementById(elementId);
        this.columns = columns;
        this.data = data;
        this.options = { pageSize: 10, ...options };
        this.currentPage = 1;
        this.filteredData = [...data];
        this.searchTerm = '';
        this.render();
    }
    
    render() {
        if (!this.element) return;
        
        // محاسبه داده‌های صفحه جاری
        const start = (this.currentPage - 1) * this.options.pageSize;
        const end = start + this.options.pageSize;
        const pageData = this.filteredData.slice(start, end);
        const totalPages = Math.ceil(this.filteredData.length / this.options.pageSize);
        
        // ساخت هدر
        let html = '<div class="table-responsive"><table class="table table-hover"><thead><tr>';
        this.columns.forEach(col => {
            html += `<th>${col.title}</th>`;
        });
        if (this.options.actions) html += '<th>عملیات</th>';
        html += '</tr></thead><tbody>';
        
        // ساخت ردیف‌ها
        pageData.forEach(item => {
            html += '<tr>';
            this.columns.forEach(col => {
                let value = item[col.field];
                if (col.format) value = col.format(value, item);
                html += `<td>${value || '-'}</td>`;
            });
            if (this.options.actions) {
                html += '<td class="action-buttons">';
                this.options.actions.forEach(action => {
                    html += `<button class="btn btn-sm btn-${action.color || 'primary'} action-${action.name}" data-id="${item.id}" title="${action.label}"><i class="${action.icon}"></i></button> `;
                });
                html += '</td>';
            }
            html += '</tr>';
        });
        
        if (pageData.length === 0) {
            html += '<tr><td colspan="100%" class="text-center">هیچ داده‌ای یافت نشد</td></tr>';
        }
        
        html += '</tbody></table></div>';
        
        // صفحه‌بندی
        html += `<div class="pagination-wrapper"><nav><ul class="pagination">`;
        html += `<li class="page-item ${this.currentPage === 1 ? 'disabled' : ''}"><a class="page-link" href="#" data-page="prev">قبلی</a></li>`;
        for (let i = 1; i <= totalPages; i++) {
            html += `<li class="page-item ${this.currentPage === i ? 'active' : ''}"><a class="page-link" href="#" data-page="${i}">${i}</a></li>`;
        }
        html += `<li class="page-item ${this.currentPage === totalPages || totalPages === 0 ? 'disabled' : ''}"><a class="page-link" href="#" data-page="next">بعدی</a></li>`;
        html += `</ul></nav></div>`;
        
        this.element.innerHTML = html;
        
        // اتصال رویدادها
        this.element.querySelectorAll('.page-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = link.dataset.page;
                if (page === 'prev') this.currentPage = Math.max(1, this.currentPage - 1);
                else if (page === 'next') this.currentPage = Math.min(totalPages, this.currentPage + 1);
                else this.currentPage = parseInt(page);
                this.render();
            });
        });
        
        // اتصال رویدادهای عملیات
        if (this.options.actions) {
            this.options.actions.forEach(action => {
                this.element.querySelectorAll(`.action-${action.name}`).forEach(btn => {
                    btn.addEventListener('click', () => {
                        const id = parseInt(btn.dataset.id);
                        if (action.onClick) action.onClick(id);
                    });
                });
            });
        }
    }
    
    filter(searchTerm) {
        this.searchTerm = searchTerm.toLowerCase();
        if (!this.searchTerm) {
            this.filteredData = [...this.data];
        } else {
            this.filteredData = this.data.filter(item => {
                return this.columns.some(col => {
                    const value = item[col.field];
                    return value && String(value).toLowerCase().includes(this.searchTerm);
                });
            });
        }
        this.currentPage = 1;
        this.render();
    }
    
    refresh(newData) {
        this.data = newData;
        this.filteredData = [...newData];
        this.currentPage = 1;
        this.render();
    }
}

// بارگذاری دپارتمان‌ها برای سلکت
async function loadDepartments(selectId, selectedId = null) {
    const departments = await getAllData(STORES.DEPARTMENTS);
    const select = document.getElementById(selectId);
    if (!select) return;
    select.innerHTML = '<option value="">انتخاب بخش</option>';
    departments.forEach(dept => {
        const option = document.createElement('option');
        option.value = dept.id;
        option.textContent = dept.name;
        if (selectedId && selectedId == dept.id) option.selected = true;
        select.appendChild(option);
    });
}

// بارگذاری پزشکان برای سلکت
async function loadDoctors(selectId, selectedId = null) {
    const doctors = await getAllData(STORES.DOCTORS);
    const users = await getAllData(STORES.USERS);
    const select = document.getElementById(selectId);
    if (!select) return;
    select.innerHTML = '<option value="">انتخاب پزشک</option>';
    for (const doctor of doctors) {
        const user = users.find(u => u.id === doctor.userId);
        if (user) {
            const option = document.createElement('option');
            option.value = doctor.id;
            option.textContent = `دکتر ${user.fullName} - ${doctor.specialty || 'متخصص'}`;
            if (selectedId && selectedId == doctor.id) option.selected = true;
            select.appendChild(option);
        }
    }
}

// بارگذاری بیماران برای سلکت
async function loadPatients(selectId, selectedId = null) {
    const patients = await getAllData(STORES.PATIENTS);
    const users = await getAllData(STORES.USERS);
    const select = document.getElementById(selectId);
    if (!select) return;
    select.innerHTML = '<option value="">انتخاب بیمار</option>';
    for (const patient of patients) {
        const user = users.find(u => u.id === patient.userId);
        if (user) {
            const option = document.createElement('option');
            option.value = patient.id;
            option.textContent = user.fullName;
            if (selectedId && selectedId == patient.id) option.selected = true;
            select.appendChild(option);
        }
    }
}

// دریافت آمار داشبورد برای نقش‌های مختلف
async function getStatsForRole(role, userId = null) {
    const patients = await getAllData(STORES.PATIENTS);
    const doctors = await getAllData(STORES.DOCTORS);
    const appointments = await getAllData(STORES.APPOINTMENTS);
    const invoices = await getAllData(STORES.INVOICES);
    const today = new Date().toISOString().split('T')[0];
    
    let stats = {
        totalPatients: patients.length,
        totalDoctors: doctors.length,
        todayAppointments: appointments.filter(a => a.date === today).length,
        pendingAppointments: appointments.filter(a => a.status === 'pending').length,
        totalIncome: invoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + (i.amount || 0), 0),
        totalAppointments: appointments.length
    };
    
    // آمار ویژه پزشک
    if (role === 'doctor' && userId) {
        const doctor = doctors.find(d => d.userId === userId);
        if (doctor) {
            const myAppointments = appointments.filter(a => a.doctorId === doctor.id);
            stats.myTodayAppointments = myAppointments.filter(a => a.date === today).length;
            stats.myTotalPatients = [...new Set(myAppointments.map(a => a.patientId))].length;
            stats.myPendingAppointments = myAppointments.filter(a => a.status === 'pending').length;
            stats.myCompletedAppointments = myAppointments.filter(a => a.status === 'completed').length;
        }
    }
    
    // آمار ویژه بیمار
    if (role === 'patient' && userId) {
        const patient = patients.find(p => p.userId === userId);
        if (patient) {
            const myAppointments = appointments.filter(a => a.patientId === patient.id);
            stats.myUpcomingAppointments = myAppointments.filter(a => a.date >= today && a.status !== 'cancelled').length;
            stats.myTotalAppointments = myAppointments.length;
            stats.myCompletedAppointments = myAppointments.filter(a => a.status === 'completed').length;
        }
    }
    
    return stats;
}

// اکسل خروجی گرفتن
function exportToExcel(data, filename = 'export.xlsx') {
    // ساده شده - در عمل نیاز به کتابخانه SheetJS دارد
    console.log('خروجی اکسل:', data);
    showSuccess('در حال توسعه...');
}

// چاپ جدول
function printTable(elementId) {
    const content = document.getElementById(elementId).innerHTML;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html><head><title>چاپ</title>
        <style>body{font-family:Tahoma;direction:rtl;} table{border-collapse:collapse;width:100%} th,td{border:1px solid #ddd;padding:8px;text-align:right}</style>
        </head><body>${content}</body></html>
    `);
    printWindow.document.close();
    printWindow.print();
}