// js/clinic-api.js
// توابع مشترک API برای صفحات مدیریت کلینیک

const API_BASE = '/api';

// دریافت توکن از localStorage
function getToken() {
    return '';
}

// بررسی وضعیت لاگین
function checkAuth() {
    const token = getToken();
    if (!token) {
        window.location.href = '/login.html';
        return false;
    }
    return true;
}

// دریافت اطلاعات کاربر جاری
async function getCurrentUser() {
    try {
        const response = await fetch(`${API_BASE}/auth/me`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        const data = await response.json();
        if (data.success && data.user) {
            localStorage.setItem('user', JSON.stringify(data.user));
            return data.user;
        }
        return null;
    } catch (error) {
        console.error('Get user error:', error);
        return null;
    }
}

// درخواست به API
async function apiRequest(endpoint, method = 'GET', data = null) {
    const url = `${API_BASE}${endpoint}`;
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getToken()}`
        }
    };
    
    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        options.body = JSON.stringify(data);
    }
    
    try {
        const response = await fetch(url, options);
        const result = await response.json();
        
        if (!response.ok || result.success === false) {
            throw new Error(result.message || 'خطا در ارتباط با سرور');
        }
        
        return result;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// ============ آمار ============
async function getClinicStats() {
    return await apiRequest('/clinic/stats');
}

// ============ مدیریت نوبت‌ها ============
async function getAppointments(params = {}) {
    const queryParams = new URLSearchParams(params).toString();
    const url = `/clinic/appointments${queryParams ? '?' + queryParams : ''}`;
    return await apiRequest(url);
}

async function getTodayAppointments() {
    return await apiRequest('/clinic/appointments/today');
}

async function getPendingAppointments() {
    return await apiRequest('/clinic/appointments/pending');
}

async function getAppointmentById(id) {
    return await apiRequest(`/clinic/appointments/${id}`);
}

async function createAppointment(data) {
    return await apiRequest('/clinic/appointments', 'POST', data);
}

async function updateAppointment(id, data) {
    return await apiRequest(`/clinic/appointments/${id}`, 'PUT', data);
}

async function updateAppointmentStatus(id, status) {
    return await apiRequest(`/clinic/appointments/${id}/status`, 'PUT', { status });
}

async function confirmAppointment(id) {
    return await apiRequest(`/clinic/appointments/${id}/confirm`, 'PUT');
}

async function cancelAppointment(id) {
    return await apiRequest(`/clinic/appointments/${id}/cancel`, 'PUT');
}

async function deleteAppointment(id) {
    return await apiRequest(`/clinic/appointments/${id}`, 'DELETE');
}

// ============ مدیریت پزشکان ============
async function getDoctors() {
    return await apiRequest('/clinic/doctors');
}

async function getDoctorById(id) {
    return await apiRequest(`/clinic/doctors/${id}`);
}

async function createDoctor(data) {
    return await apiRequest('/clinic/doctors', 'POST', data);
}

async function updateDoctor(id, data) {
    return await apiRequest(`/clinic/doctors/${id}`, 'PUT', data);
}

async function toggleDoctorStatus(id, isAvailable) {
    return await apiRequest(`/clinic/doctors/${id}/status`, 'PUT', { is_available: isAvailable });
}

async function deleteDoctor(id) {
    return await apiRequest(`/clinic/doctors/${id}`, 'DELETE');
}

// ============ مدیریت بیماران ============
async function getPatients(params = {}) {
    const queryParams = new URLSearchParams(params).toString();
    const url = `/clinic/patients${queryParams ? '?' + queryParams : ''}`;
    return await apiRequest(url);
}

async function getPatientById(id) {
    return await apiRequest(`/clinic/patients/${id}`);
}

async function createPatient(data) {
    return await apiRequest('/clinic/patients', 'POST', data);
}

async function deletePatient(id) {
    return await apiRequest(`/clinic/patients/${id}`, 'DELETE');
}

// ============ مدیریت پرسنل ============
async function getStaff() {
    return await apiRequest('/clinic/staff');
}

async function createStaff(data) {
    return await apiRequest('/clinic/staff', 'POST', data);
}

async function updateStaff(id, data) {
    return await apiRequest(`/clinic/staff/${id}`, 'PUT', data);
}

async function toggleStaffStatus(id, isActive) {
    return await apiRequest(`/clinic/staff/${id}/status`, 'PUT', { is_active: isActive });
}

async function deleteStaff(id) {
    return await apiRequest(`/clinic/staff/${id}`, 'DELETE');
}

// ============ مدیریت پرداخت‌ها ============
async function getPayments(params = {}) {
    const queryParams = new URLSearchParams(params).toString();
    const url = `/clinic/payments${queryParams ? '?' + queryParams : ''}`;
    return await apiRequest(url);
}

async function createPayment(data) {
    return await apiRequest('/clinic/payments', 'POST', data);
}

// ============ گزارشات ============
async function getFinancialReport(startDate, endDate) {
    return await apiRequest(`/clinic/reports?type=financial&start=${startDate}&end=${endDate}`);
}

async function getAppointmentsReport(startDate, endDate) {
    return await apiRequest(`/clinic/reports?type=appointments&start=${startDate}&end=${endDate}`);
}

async function getDoctorsReport(startDate, endDate) {
    return await apiRequest(`/clinic/reports?type=doctors&start=${startDate}&end=${endDate}`);
}

async function getPatientsReport(startDate, endDate) {
    return await apiRequest(`/clinic/reports?type=patients&start=${startDate}&end=${endDate}`);
}

async function getWeeklyRevenue() {
    return await apiRequest('/clinic/revenue/weekly');
}

// ============ زمان‌بندی پزشکان ============
async function getDoctorSchedule(doctorId) {
    return await apiRequest(`/schedule/doctor/${doctorId}/schedule`);
}

async function saveDoctorSchedule(doctorId, schedules) {
    return await apiRequest('/schedule/doctor/schedule', 'POST', { doctorId, schedules });
}

// ============ خروج از سیستم ============
function logout() {
    void 0;
    localStorage.removeItem('user');
    window.location.href = '/login.html';
}

// ============ توابع کمکی ============
function toPersianNumber(num) {
    if (num === null || num === undefined) return '۰';
    const digits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    return String(num).replace(/\d/g, d => digits[parseInt(d)]);
}

function toEnglishNumber(str) {
    if (!str) return '';
    const digits = { '۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9' };
    return String(str).replace(/[۰-۹]/g, d => digits[d]);
}

function formatPrice(price) {
    if (!price && price !== 0) return '۰ تومان';
    const intPrice = Math.round(parseFloat(price));
    const formatted = intPrice.toLocaleString('en-US');
    return toPersianNumber(formatted) + ' تومان';
}

function toJalali(dateStr) {
    if (!dateStr) return '';
    if (dateStr.includes('/')) return dateStr;
    
    try {
        let date;
        if (typeof dateStr === 'string' && dateStr.includes('T')) {
            date = new Date(dateStr);
        } else {
            date = new Date(dateStr);
        }
        
        if (isNaN(date.getTime())) return dateStr;
        
        const gy = date.getFullYear();
        const gm = date.getMonth() + 1;
        const gd = date.getDate();
        
        let jy = gy - 621;
        let jm = gm;
        let jd = gd;
        
        if (gm < 3) jy--;
        
        return `${toPersianNumber(jy)}/${toPersianNumber(jm)}/${toPersianNumber(jd)}`;
    } catch(e) {
        return dateStr;
    }
}

function jalaliToGregorian(jalaliDate) {
    if (!jalaliDate) return '';
    const english = toEnglishNumber(jalaliDate);
    const parts = english.split('/');
    if (parts.length !== 3) return '';
    
    let jy = parseInt(parts[0]);
    let jm = parseInt(parts[1]);
    let jd = parseInt(parts[2]);
    
    if (jy < 1300 || jy > 1500) return '';
    
    let gy = jy + 621;
    let gm = jm;
    let gd = jd;
    
    if (jm > 3) gy++;
    
    return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
}

function showToast(message, type = 'success') {
    // حذف توست قبلی اگر وجود داشت
    const existingToast = document.querySelector('.custom-toast');
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement('div');
    toast.className = 'custom-toast';
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 20px;
        background: ${type === 'error' ? '#dc2626' : '#10b981'};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        z-index: 9999;
        font-size: 13px;
        animation: slideIn 0.3s ease;
        font-family: 'Vazir', Tahoma, Arial;
    `;
    toast.innerHTML = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// اضافه کردن انیمیشن‌ها به صفحه
if (!document.querySelector('#toast-styles')) {
    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(-100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(-100%); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
}

// بارگذاری اطلاعات کاربر در header
async function loadUserInfo() {
    const user = await getCurrentUser();
    if (user) {
        const userAvatar = document.querySelector('.user-avatar');
        const userName = document.querySelector('.user-name');
        if (userAvatar) userAvatar.textContent = user.full_name?.charAt(0) || 'کاربر';
        if (userName) userName.textContent = user.full_name || 'کاربر';
    }
    return user;
}

// راه‌اندازی اولیه صفحه
async function initPage() {
    if (!checkAuth()) return false;
    await loadUserInfo();
    return true;
}