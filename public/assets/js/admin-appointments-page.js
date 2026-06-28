/* Sadra system-admin appointment page controller. */
'use strict';
// =============================
        // Appointments page logic
        // =============================
        let allAppointments = [];
        let filteredAppointments = [];
        let doctorsList = [];
        let patientsList = [];
        let doctorScheduleSettingsCache = new Map();
        let currentBookingWindowDays = 30;
        const APPOINTMENTS_SORT_STORAGE_KEY = `nv_appointments_sort_v2141_${document.body?.dataset?.panelRole || 'staff'}`;
        const APPOINTMENTS_SORT_KEYS = new Set(['id', 'created_at', 'appointment_date', 'appointment_time', 'patient_name', 'doctor_name', 'type', 'amount', 'payment_status', 'status']);
        const APPOINTMENTS_SORT_PRESETS = new Set(['nearest', 'created_desc', 'unpaid_first', 'pending_first']);
        const APPOINTMENTS_FA_COLLATOR = new Intl.Collator('fa', { numeric: true, sensitivity: 'base' });
        let appointmentsSortState = loadAppointmentsSortState();
        const ALLOWED_ROLES = ['system_admin', 'admin', 'super_admin', 'site_admin', 'owner'];

        function normalizeRole(role) {
            return String(role || '')
                .trim()
                .toLowerCase()
                .replace(/[\s-]+/g, '_');
        }
function redirectToLogin(message) {
            if (window.SadraPanel?.redirectToLogin) {
                window.SadraPanel.redirectToLogin(message);
                return;
            }
            if (message) {
                try { localStorage.setItem('loginMessage', message); } catch (_) {}
            }
            window.location.replace('/login');
        }

        async function initPage() {
            if (window.SadraPanel?.initPage) {
                return window.SadraPanel.initPage({ panelRole: 'admin', roles: ALLOWED_ROLES });
            }

            try {
                const response = await fetch('/api/auth/me', {
                    credentials: 'same-origin',
                    cache: 'no-store',
                    headers: { Accept: 'application/json' }
                });
                const result = await response.json().catch(() => ({}));
                if (!response.ok || !result.success || !result.user) {
                    redirectToLogin(result.message || 'نشست شما معتبر نیست. لطفاً دوباره وارد شوید.');
                    return false;
                }
                setUserInfo(result.user);
                bindLogout();
                return true;
            } catch (error) {
                console.error('Init page error:', error);
                showToast('خطا در بررسی ورود کاربر', 'error');
                return false;
            }
        }

        function setUserInfo(user) {
            const name = user?.full_name || user?.username || 'مدیر کلینیک';
            const avatar = document.querySelector('.user-avatar');
            const userName = document.querySelector('.user-name');
            if (avatar) avatar.textContent = name.substring(0, 2).toUpperCase();
            if (userName) userName.textContent = name;
        }

        function bindLogout() {
            if (window.SadraPanel?.bindPanelLogout) {
                window.SadraPanel.bindPanelLogout();
                return;
            }
            document.querySelectorAll('.logout-btn,[data-nv3-logout]').forEach(btn => {
                if (btn.dataset.boundLogout === '1') return;
                btn.dataset.boundLogout = '1';
                btn.addEventListener('click', (event) => {
                    event.preventDefault();
                    if (window.noorvistaLogout) void window.noorvistaLogout();
                    else redirectToLogin('با موفقیت خارج شدید.');
                });
            });
        }

        function localizeApiMessage(message, fallback = 'خطایی رخ داد. لطفاً دوباره تلاش کنید.') {
            const text = String(message || '').trim();
            if (!text) return fallback;
            const lower = text.toLowerCase();
            if (lower.includes('completed') && lower.includes('cancelled')) return 'نوبت انجام‌شده قابل لغو نیست؛ سوابق مالی و پرونده بیمار باید حفظ شود.';
            if (lower.includes('no_show') && lower.includes('cancelled')) return 'برای این نوبت عدم مراجعه ثبت شده و قابل لغو نیست.';
            if (lower.includes('cancelled') && lower.includes('confirmed')) return 'تغییر وضعیت نوبت لغوشده به تأییدشده مجاز نیست؛ برای جلوگیری از ناسازگاری ظرفیت و پرداخت، یک نوبت جدید ثبت کنید.';
            if (lower.includes('too many requests') || lower.includes('rate limit')) return 'تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.';
            if (lower.includes('database migrations are incomplete') || lower.includes('migration required')) return 'به‌روزرسانی پایگاه داده کامل نشده است. مدیر سامانه باید مهاجرت‌های پایگاه داده را اجرا کند.';
            if (lower.includes('internal server error')) return 'خطای داخلی سرور رخ داد. لطفاً دوباره تلاش کنید.';
            if (lower.includes('not found')) return 'اطلاعات موردنظر پیدا نشد.';
            if (lower.includes('unauthorized') || lower.includes('authentication required')) return 'نشست شما معتبر نیست. لطفاً دوباره وارد شوید.';
            if (/^[\x00-\x7F]+$/.test(text)) return fallback;
            return text;
        }

        async function apiRequest(url, method = 'GET', data = null) {
            const options = {
                method,
                credentials: 'same-origin',
                cache: 'no-store',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' }
            };
            if (data !== null && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(method).toUpperCase())) {
                options.body = JSON.stringify(data);
            }

            const response = await fetch(url, options);
            const result = await response.json().catch(() => ({}));

            if (response.status === 401) {
                redirectToLogin(localizeApiMessage(result.message, 'نشست شما منقضی شده است. لطفاً دوباره وارد شوید.'));
                const err = new Error(localizeApiMessage(result.message, 'نشست منقضی شده است.'));
                err.status = 401;
                throw err;
            }

            if (!response.ok || result.success === false) {
                const err = new Error(localizeApiMessage(result.message, `خطای سرور با کد ${toPersianNumber(response.status)} رخ داد.`));
                err.status = response.status;
                throw err;
            }

            return result;
        }

        async function tryApi(url, method = 'GET', data = null) {
            try {
                return await apiRequest(url, method, data);
            } catch (error) {
                if ([404, 405].includes(error.status)) {
                    console.warn('Skipping endpoint:', url, error.message);
                    return null;
                }
                throw error;
            }
        }

        async function getAppointments() {
            const admin = await tryApi('/api/admin/appointments?limit=500');
            if (admin?.appointments) return admin;

            const clinic = await tryApi('/api/clinic/appointments');
            if (clinic?.appointments) return clinic;

            const [today, pending] = await Promise.all([
                tryApi('/api/clinic/appointments/today'),
                tryApi('/api/clinic/appointments/pending')
            ]);

            const map = new Map();
            [...(today?.appointments || []), ...(pending?.appointments || [])].forEach(item => {
                if (item && item.id != null) map.set(String(item.id), item);
            });

            return { success: true, appointments: [...map.values()] };
        }

        async function getDoctors() {
            const result = await tryApi('/api/admin/doctors?limit=500')
                || await tryApi('/api/clinic/doctors');
            if (result?.doctors) return result;

            const map = new Map();
            allAppointments.forEach(app => {
                if (app.doctor_id && app.doctor_name) map.set(app.doctor_id, { id: app.doctor_id, full_name: app.doctor_name });
            });
            return { success: true, doctors: [...map.values()] };
        }

        async function getPatients() {
            const result = await tryApi('/api/admin/patients?limit=500')
                || await tryApi('/api/clinic/patients');
            if (result?.patients) return result;

            const map = new Map();
            allAppointments.forEach(app => {
                if (app.patient_id && app.patient_name) map.set(app.patient_id, { id: app.patient_id, full_name: app.patient_name, phone: app.patient_phone || '' });
            });
            return { success: true, patients: [...map.values()] };
        }

        async function createAppointment(payload) {
            const result = await tryApi('/api/admin/appointments', 'POST', payload)
                || await tryApi('/api/clinic/appointments', 'POST', payload);
            if (result) return result;
            throw new Error('API ثبت نوبت در سرور پیدا نشد.');
        }

        async function updateAppointment(id, payload) {
            const result = await tryApi(`/api/admin/appointments/${id}`, 'PUT', payload)
                || await tryApi(`/api/clinic/appointments/${id}`, 'PUT', payload);
            if (result) return result;
            throw new Error('API ویرایش نوبت در سرور پیدا نشد.');
        }

        async function deleteAppointmentApi(id) {
            let result = await tryApi(`/api/admin/appointments/${id}`, 'DELETE');
            if (result) return result;
            result = await tryApi(`/api/clinic/appointments/${id}`, 'DELETE');
            if (result) return result;
            result = await tryApi(`/api/clinic/appointments/${id}/cancel`, 'PUT');
            if (result) return result;
            result = await tryApi(`/api/clinic/appointments/${id}`, 'PUT', { status: 'cancelled' });
            if (result) return result;
            throw new Error('API لغو نوبت در سرور پیدا نشد.');
        }

        async function confirmAppointmentApi(id) {
            const result = await tryApi(`/api/admin/appointments/${id}/confirm`, 'PUT')
                || await tryApi(`/api/clinic/appointments/${id}/confirm`, 'PUT');
            if (result) return result;
            return updateAppointment(id, { status: 'confirmed' });
        }

        async function getAvailableSlots(doctorId, gregorianDate) {
            if (!doctorId || !gregorianDate) return { success: true, slots: [] };
            const result = await tryApi(`/api/clinic/available-slots?doctor_id=${encodeURIComponent(doctorId)}&date=${encodeURIComponent(gregorianDate)}`);
            return result || { success: true, slots: [] };
        }


        async function getDoctorSchedule(doctorId) {
            if (!doctorId) return { success: true, schedules: [] };
            const result = await tryApi(`/api/schedule/doctor/${encodeURIComponent(doctorId)}`);
            return result || { success: true, schedules: [] };
        }

        async function loadAppointments() {
            try {
                const result = await getAppointments();
                allAppointments = normalizeAppointments(result?.appointments || []);
                await loadDoctorsSelect();
                await loadPatientsSelect();
                applyFilters();
                updateStats();
                document.dispatchEvent(new CustomEvent('nv:appointments-loaded', {
                    detail: { appointments: allAppointments }
                }));
            } catch (error) {
                console.error('Load appointments error:', error);
                showToast(error.message || 'خطا در بارگذاری نوبت‌ها', 'error');
                renderAppointments([]);
            }
        }

        function normalizeAppointments(items) {
            return items.map(item => ({
                // Preserve the complete API record first. Payment/audit fields such as
                // created_at, resolved_payment_status and receipt details are needed by
                // both the table and the appointment detail modal.
                ...item,
                id: item.id,
                appointment_date: normalizeDate(item.appointment_date || item.date || item.visit_date || ''),
                appointment_time: formatTime(item.appointment_time || item.time || item.visit_time || ''),
                patient_id: item.patient_id,
                doctor_id: item.doctor_id,
                patient_name: item.patient_name || item.patient_full_name || item.full_name || '-',
                patient_phone: item.patient_phone || item.phone || '',
                doctor_name: item.doctor_name || item.doctor_full_name || '-',
                doctor_specialty: item.doctor_specialty || item.specialty || '',
                medical_center_name: item.medical_center_name || item.center_name || '',
                service_name: item.service_name || '',
                type: item.type || item.appointment_type || 'regular',
                status: item.status || 'pending',
                amount: item.amount ?? item.price ?? item.fee ?? 0,
                reason: item.reason || item.description || item.notes || '',
                created_at: item.registration_time || item.created_at || item.createdAt || item.registered_at || item.created_on || item.created_date || '',
                payment_status: item.payment_status || item.paymentStatus || '',
                resolved_payment_status: item.resolved_payment_status || item.resolvedPaymentStatus || '',
                payment_record_status: item.payment_record_status || item.paymentRecordStatus || '',
                payment_method: item.payment_method || item.paymentMethod || '',
                payment_receipt_number: item.payment_receipt_number || item.receipt_number || '',
                payment_date: item.payment_date || '',
                payment_provider: item.payment_provider || item.provider || '',
                payment_reference: item.payment_reference || item.provider_reference || '',
                payment_authority: item.payment_authority || item.provider_authority || '',
                payment_verified_at: item.payment_verified_at || item.verified_at || '',
                payment_idempotency_key: item.payment_idempotency_key || item.idempotency_key || ''
            }));
        }

        async function loadDoctorsSelect() {
            try {
                const result = await getDoctors();
                doctorsList = result?.doctors || [];
                const select = document.getElementById('doctorId');
                if (!select) return;
                select.innerHTML = '<option value="">انتخاب پزشک...</option>';
                doctorsList.forEach(doc => {
                    const name = doc.full_name || doc.name || doc.username || doc.doctor_name || 'پزشک';
                    const specialty = doc.specialty || doc.specialization || 'عمومی';
                    select.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(doc.id)}">${escapeHtml(name)} - ${escapeHtml(specialty)}</option>`);
                });
            } catch (error) {
                console.error('Load doctors error:', error);
            }
        }


        async function loadDoctorSchedulingSettings(doctorId) {
            if (!doctorId) return { booking_window_days: 30, reminder_enabled: true, reminder_before_minutes: 1440 };
            if (doctorScheduleSettingsCache.has(String(doctorId))) return doctorScheduleSettingsCache.get(String(doctorId));
            let settings = { booking_window_days: 30, reminder_enabled: true, reminder_before_minutes: 1440 };
            try {
                const result = await getDoctorSchedule(doctorId);
                const schedules = result?.schedules || [];
                if (schedules.length) {
                    settings = {
                        booking_window_days: Number(schedules[0].booking_window_days || 30),
                        reminder_enabled: schedules[0].reminder_enabled === false || schedules[0].reminder_enabled === 0 || schedules[0].reminder_enabled === '0' ? false : true,
                        reminder_before_minutes: Number(schedules[0].reminder_before_minutes || 1440)
                    };
                }
            } catch (error) {
                console.warn('Doctor scheduling settings failed:', error.message);
            }
            doctorScheduleSettingsCache.set(String(doctorId), settings);
            return settings;
        }

        async function refreshDoctorSlotWindowInfo(doctorId) {
            const info = document.getElementById('slotWindowInfo');
            if (!doctorId) {
                currentBookingWindowDays = 30;
                if (info) info.textContent = 'ابتدا پزشک را انتخاب کنید؛ بازه از تنظیمات زمان‌بندی همان پزشک خوانده می‌شود.';
                return;
            }
            const settings = await loadDoctorSchedulingSettings(doctorId);
            currentBookingWindowDays = Math.min(365, Math.max(7, Number(settings.booking_window_days || 30)));
            if (info) info.textContent = `نوبت‌های خالی تا ${toPersianNumber(currentBookingWindowDays)} روز آینده نمایش داده می‌شود. تغییر این مقدار در صفحه زمان‌بندی پزشکان انجام می‌شود.`;
        }

        async function loadPatientsSelect() {
            try {
                const result = await getPatients();
                patientsList = result?.patients || [];
                const select = document.getElementById('patientId');
                if (!select) return;
                select.innerHTML = '<option value="">انتخاب بیمار...</option>';
                patientsList.forEach(patient => {
                    const name = patient.full_name || patient.name || patient.username || patient.patient_name || 'بیمار';
                    const phone = patient.phone || patient.mobile || patient.patient_phone || '';
                    select.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(patient.id)}">${escapeHtml(name)}${phone ? ' - ' + escapeHtml(phone) : ''}</option>`);
                });
            } catch (error) {
                console.error('Load patients error:', error);
            }
        }


        function getDefaultAppointmentsSortState() {
            return { mode: 'nearest', key: 'appointment_datetime', direction: 'asc' };
        }

        function loadAppointmentsSortState() {
            try {
                const stored = JSON.parse(localStorage.getItem(APPOINTMENTS_SORT_STORAGE_KEY) || 'null');
                if (stored?.mode === 'column' && APPOINTMENTS_SORT_KEYS.has(stored.key)) {
                    return {
                        mode: 'column',
                        key: stored.key,
                        direction: stored.direction === 'desc' ? 'desc' : 'asc'
                    };
                }
                if (APPOINTMENTS_SORT_PRESETS.has(stored?.mode)) {
                    return { mode: stored.mode, key: stored.key || '', direction: stored.direction === 'asc' ? 'asc' : 'desc' };
                }
            } catch (error) {
                console.warn('Appointment sort preference could not be read:', error);
            }
            return getDefaultAppointmentsSortState();
        }

        function saveAppointmentsSortState() {
            try {
                localStorage.setItem(APPOINTMENTS_SORT_STORAGE_KEY, JSON.stringify(appointmentsSortState));
            } catch (error) {
                console.warn('Appointment sort preference could not be saved:', error);
            }
        }

        function setAppointmentSortPreset(mode) {
            const presets = {
                nearest: { mode: 'nearest', key: 'appointment_datetime', direction: 'asc' },
                created_desc: { mode: 'created_desc', key: 'created_at', direction: 'desc' },
                unpaid_first: { mode: 'unpaid_first', key: 'payment_status', direction: 'asc' },
                pending_first: { mode: 'pending_first', key: 'status', direction: 'asc' }
            };
            appointmentsSortState = presets[mode] || getDefaultAppointmentsSortState();
            saveAppointmentsSortState();
            applyFilters();
        }

        function setAppointmentColumnSort(key) {
            if (!APPOINTMENTS_SORT_KEYS.has(key)) return;
            const isSameColumn = appointmentsSortState.mode === 'column' && appointmentsSortState.key === key;
            appointmentsSortState = {
                mode: 'column',
                key,
                direction: isSameColumn && appointmentsSortState.direction === 'asc' ? 'desc' : 'asc'
            };
            saveAppointmentsSortState();
            applyFilters();
        }

        function parseAppointmentDateTime(app) {
            const date = String(app?.appointment_date || '').slice(0, 10);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
            const rawTime = String(app?.appointment_time || '').match(/(\d{1,2}):(\d{2})/);
            const hours = rawTime ? String(Math.min(23, Number(rawTime[1]))).padStart(2, '0') : '00';
            const minutes = rawTime ? String(Math.min(59, Number(rawTime[2]))).padStart(2, '0') : '00';
            const value = Date.parse(`${date}T${hours}:${minutes}:00`);
            return Number.isFinite(value) ? value : null;
        }

        function parseCreatedAtValue(value) {
            if (!value) return null;
            const raw = String(value).trim();
            let parsed = Date.parse(raw);
            if (Number.isFinite(parsed)) return parsed;
            const match = raw.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s]+(\d{1,2}:\d{2})(?::\d{2})?)?/);
            if (!match) return null;
            parsed = Date.parse(`${match[1]}T${match[2] || '00:00'}:00`);
            return Number.isFinite(parsed) ? parsed : null;
        }

        function getAppointmentTimeMinutes(value) {
            const match = String(value || '').match(/(\d{1,2}):(\d{2})/);
            if (!match) return null;
            return (Number(match[1]) * 60) + Number(match[2]);
        }

        function compareSortValues(a, b, direction = 'asc') {
            const aMissing = a === null || a === undefined || a === '' || Number.isNaN(a);
            const bMissing = b === null || b === undefined || b === '' || Number.isNaN(b);
            if (aMissing && bMissing) return 0;
            if (aMissing) return 1;
            if (bMissing) return -1;

            let result = 0;
            if (typeof a === 'number' && typeof b === 'number') result = a - b;
            else result = APPOINTMENTS_FA_COLLATOR.compare(String(a), String(b));
            return direction === 'desc' ? -result : result;
        }

        function compareNearestAppointments(a, b) {
            const now = Date.now();
            const aDateTime = parseAppointmentDateTime(a);
            const bDateTime = parseAppointmentDateTime(b);
            const aGroup = aDateTime === null ? 2 : (aDateTime >= now ? 0 : 1);
            const bGroup = bDateTime === null ? 2 : (bDateTime >= now ? 0 : 1);
            if (aGroup !== bGroup) return aGroup - bGroup;
            if (aGroup === 0) return compareSortValues(aDateTime, bDateTime, 'asc');
            if (aGroup === 1) return compareSortValues(aDateTime, bDateTime, 'desc');
            return 0;
        }

        function getPaymentSortRank(app) {
            return ({ unpaid: 0, pending: 1, failed: 2, cancelled: 3, paid: 4, free: 4 })[getPaymentStatusValue(app)] ?? 5;
        }

        function getAppointmentStatusSortRank(status) {
            return ({ pending: 0, confirmed: 1, completed: 2, cancelled: 3 })[String(status || '').toLowerCase()] ?? 4;
        }

        function compareAppointmentsByColumn(a, b, key, direction) {
            let result = 0;
            switch (key) {
                case 'id':
                    result = compareSortValues(Number(a.id), Number(b.id), direction);
                    break;
                case 'created_at':
                    result = compareSortValues(parseCreatedAtValue(a.created_at), parseCreatedAtValue(b.created_at), direction);
                    break;
                case 'appointment_date':
                    result = compareSortValues(parseAppointmentDateTime(a), parseAppointmentDateTime(b), direction);
                    break;
                case 'appointment_time':
                    result = compareSortValues(getAppointmentTimeMinutes(a.appointment_time), getAppointmentTimeMinutes(b.appointment_time), direction);
                    if (!result) result = compareSortValues(String(a.appointment_date || ''), String(b.appointment_date || ''), direction);
                    break;
                case 'patient_name':
                    result = compareSortValues(normalizeText(a.patient_name), normalizeText(b.patient_name), direction);
                    break;
                case 'doctor_name':
                    result = compareSortValues(normalizeText(a.doctor_name), normalizeText(b.doctor_name), direction);
                    break;
                case 'type':
                    result = compareSortValues(getTypeText(a.type), getTypeText(b.type), direction);
                    break;
                case 'amount':
                    result = compareSortValues(Number(a.amount) || 0, Number(b.amount) || 0, direction);
                    break;
                case 'payment_status':
                    result = compareSortValues(getPaymentSortRank(a), getPaymentSortRank(b), direction);
                    break;
                case 'status':
                    result = compareSortValues(getAppointmentStatusSortRank(a.status), getAppointmentStatusSortRank(b.status), direction);
                    break;
                default:
                    result = compareNearestAppointments(a, b);
            }
            if (result) return result;
            return compareSortValues(Number(a.id), Number(b.id), 'asc');
        }

        function sortAppointments(appointments) {
            const state = appointmentsSortState || getDefaultAppointmentsSortState();
            return appointments
                .map((appointment, originalIndex) => ({ appointment, originalIndex }))
                .sort((left, right) => {
                    const a = left.appointment;
                    const b = right.appointment;
                    let result = 0;

                    if (state.mode === 'nearest') {
                        result = compareNearestAppointments(a, b);
                    } else if (state.mode === 'created_desc') {
                        result = compareAppointmentsByColumn(a, b, 'created_at', 'desc');
                    } else if (state.mode === 'unpaid_first') {
                        result = compareSortValues(getPaymentSortRank(a), getPaymentSortRank(b), 'asc');
                        if (!result) result = compareNearestAppointments(a, b);
                    } else if (state.mode === 'pending_first') {
                        result = compareSortValues(getAppointmentStatusSortRank(a.status), getAppointmentStatusSortRank(b.status), 'asc');
                        if (!result) result = compareNearestAppointments(a, b);
                    } else {
                        result = compareAppointmentsByColumn(a, b, state.key, state.direction);
                    }

                    return result || (left.originalIndex - right.originalIndex);
                })
                .map(item => item.appointment);
        }

        function getAppointmentsSortSummary() {
            if (appointmentsSortState.mode === 'nearest') return 'نوبت‌های آینده از نزدیک به دور؛ نوبت‌های گذشته از جدید به قدیم';
            if (appointmentsSortState.mode === 'created_desc') return 'جدیدترین زمان ثبت در ابتدای جدول';
            if (appointmentsSortState.mode === 'unpaid_first') return 'پرداخت‌نشده‌ها در ابتدای جدول؛ سپس نزدیک‌ترین نوبت';
            if (appointmentsSortState.mode === 'pending_first') return 'نوبت‌های در انتظار تأیید در ابتدای جدول؛ سپس نزدیک‌ترین نوبت';
            const activeButton = document.querySelector(`[data-appointment-sort-key="${appointmentsSortState.key}"]`);
            const label = activeButton?.dataset.sortLabel || 'ستون انتخابی';
            return `${label}: ${appointmentsSortState.direction === 'desc' ? 'نزولی' : 'صعودی'}`;
        }

        function updateAppointmentsSortUI() {
            const preset = document.getElementById('appointmentsSortPreset');
            if (preset) preset.value = appointmentsSortState.mode === 'column' ? 'custom' : appointmentsSortState.mode;

            document.querySelectorAll('[data-appointment-sort-key]').forEach(button => {
                const isActive = appointmentsSortState.mode === 'column' && appointmentsSortState.key === button.dataset.appointmentSortKey;
                const direction = isActive ? appointmentsSortState.direction : '';
                const th = button.closest('th');
                const indicator = button.querySelector('.nv-sort-indicator');
                button.classList.toggle('is-active', isActive);
                if (th) th.setAttribute('aria-sort', isActive ? (direction === 'desc' ? 'descending' : 'ascending') : 'none');
                if (indicator) indicator.textContent = isActive ? (direction === 'desc' ? '↓' : '↑') : '↕';
                const label = button.dataset.sortLabel || button.textContent.trim();
                button.setAttribute('aria-label', isActive
                    ? `${label}، مرتب‌سازی ${direction === 'desc' ? 'نزولی' : 'صعودی'}؛ برای تغییر جهت کلیک کنید`
                    : `${label}، مرتب‌سازی صعودی`);
            });

            const summary = document.getElementById('appointmentsSortSummary');
            if (summary) summary.textContent = getAppointmentsSortSummary();
        }

        function applyFilters() {
            const search = normalizeText(document.getElementById('filterSearch')?.value || document.getElementById('headerSearchInput')?.value || '');
            const status = document.getElementById('filterStatus')?.value || 'all';
            const jalaliDate = document.getElementById('filterDate')?.value || '';
            const gregorianDate = jalaliDate ? window.toGregorianDateString(jalaliDate) : '';
            const quickRange = window.NVAppointmentsQuickRange || null;

            filteredAppointments = sortAppointments(allAppointments.filter(app => {
                const haystack = normalizeText(`${app.patient_name} ${app.doctor_name} ${app.patient_phone} ${app.type} ${app.status}`);
                const matchesSearch = !search || haystack.includes(search);
                const matchesStatus = status === 'all' || app.status === status;
                const appointmentDate = String(app.appointment_date || '').slice(0, 10);
                const matchesDate = quickRange?.from && quickRange?.to
                    ? appointmentDate >= quickRange.from && appointmentDate <= quickRange.to
                    : (!gregorianDate || appointmentDate === gregorianDate);
                return matchesSearch && matchesStatus && matchesDate;
            }));

            updateAppointmentsSortUI();
            renderAppointments(filteredAppointments);
            const countEl = document.getElementById('filteredCount');
            if (countEl) countEl.textContent = toPersianNumber(filteredAppointments.length);
        }

        function normalizeAppointmentStatus(status) {
            return String(status || 'pending').trim().toLowerCase().replace(/[\s-]+/g, '_').replace('canceled', 'cancelled');
        }

        function canConfirmAppointment(app) {
            return ['pending', 'rescheduled'].includes(normalizeAppointmentStatus(app?.status));
        }

        function canCancelAppointment(app) {
            return ['pending', 'confirmed', 'rescheduled'].includes(normalizeAppointmentStatus(app?.status));
        }

        function getBlockedAppointmentActionMessage(app, action = 'cancel') {
            const status = normalizeAppointmentStatus(app?.status);
            if (status === 'completed') return 'نوبت انجام‌شده قابل لغو یا تأیید دوباره نیست؛ سوابق مالی و پرونده باید حفظ شود.';
            if (status === 'no_show') return 'برای این نوبت عدم مراجعه ثبت شده و قابل لغو یا تأیید دوباره نیست.';
            if (status === 'cancelled') return 'این نوبت قبلاً لغو شده است؛ برای مراجعه جدید باید نوبت تازه ثبت شود.';
            if (status === 'confirmed' && action === 'confirm') return 'این نوبت قبلاً تأیید شده است.';
            return 'این عملیات برای وضعیت فعلی نوبت مجاز نیست.';
        }

        function getDisabledCancelLabel(app) {
            const status = normalizeAppointmentStatus(app?.status);
            if (status === 'completed') return 'انجام‌شده';
            if (status === 'no_show') return 'عدم مراجعه';
            if (status === 'cancelled') return 'لغو شده';
            return 'غیرقابل لغو';
        }

        function renderAppointments(appointments) {
            const tbody = document.getElementById('appointmentsTableBody');
            if (!tbody) return;

            if (!appointments.length) {
                tbody.innerHTML = '<tr><td colspan="11" class="table-empty-state">هیچ نوبتی یافت نشد</td></tr>';
                return;
            }

            tbody.innerHTML = appointments.map(app => {
                const appointmentId = Number(app.id);
                const confirmable = canConfirmAppointment(app);
                const cancellable = canCancelAppointment(app);
                const confirmTitle = confirmable ? 'تأیید این نوبت' : getBlockedAppointmentActionMessage(app, 'confirm');
                const cancelTitle = cancellable ? 'لغو این نوبت و حفظ سابقه آن' : getBlockedAppointmentActionMessage(app, 'cancel');
                return `
                <tr>
                    <td>${toPersianNumber(app.id || '-')}</td>
                    <td><span class="nv-created-at-cell">${formatAppointmentCreatedAt(app.created_at)}</span></td>
                    <td>${toPersianNumber(window.toJalaliDateString(app.appointment_date) || '-')}</td>
                    <td>${toPersianNumber(formatTime(app.appointment_time))}</td>
                    <td>${escapeHtml(app.patient_name || '-')}</td>
                    <td>${escapeHtml(app.doctor_name || '-')}</td>
                    <td>${getTypeText(app.type)}</td>
                    <td>${formatPrice(app.amount || 0)}</td>
                    <td><span class="badge ${getPaymentStatusClass(app)}">${getPaymentStatusText(app)}</span></td>
                    <td><span class="badge ${getStatusClass(app.status)}">${getStatusText(app.status)}</span></td>
                    <td>
                        <div class="action-buttons">
                            <button class="action-btn view" type="button" data-appointment-action="view" data-appointment-id="${appointmentId}"><i class="icon-eye" aria-hidden="true"></i> مشاهده</button>
                            <button class="action-btn confirm" type="button" data-appointment-action="confirm" data-appointment-id="${appointmentId}" title="${confirmTitle}" ${confirmable ? '' : 'disabled'}><i class="icon-check" aria-hidden="true"></i> ${normalizeAppointmentStatus(app.status) === 'confirmed' ? 'تأیید شده' : 'تأیید'}</button>
                            ${cancellable
                                ? `<button class="action-btn delete" type="button" data-appointment-action="cancel" data-appointment-id="${appointmentId}" title="${cancelTitle}"><i class="icon-ban" aria-hidden="true"></i> لغو</button>`
                                : `<button class="action-btn is-disabled" type="button" disabled title="${cancelTitle}"><i class="icon-lock" aria-hidden="true"></i> ${getDisabledCancelLabel(app)}</button>`}
                        </div>
                    </td>
                </tr>`;
            }).join('');
        }

        function bindEvents() {
            document.getElementById('clearAppointmentsFiltersBtn')?.addEventListener('click', clearFilters);
            document.getElementById('refreshAppointmentsBtn')?.addEventListener('click', () => window.loadAppointments?.());
            document.getElementById('openAppointmentModalBtn')?.addEventListener('click', () => window.openAddModal?.());
            document.getElementById('findEarliestSlotBtn')?.addEventListener('click', findEarliestAvailableSlot);
            document.getElementById('loadAllSlotsBtn')?.addEventListener('click', loadAvailableSlotsRange);
            document.getElementById('manualDateModeBtn')?.addEventListener('click', toggleManualDateMode);
            document.getElementById('nvWizardSubmit')?.addEventListener('click', () => window.submitAppointmentForm?.());

            document.querySelectorAll('[data-close-modal]').forEach(button => {
                button.addEventListener('click', () => window.closeModal?.(button.dataset.closeModal));
            });

            document.getElementById('appointmentsTableBody')?.addEventListener('click', event => {
                const button = event.target.closest('[data-appointment-action][data-appointment-id]');
                if (!button || button.disabled) return;
                const id = Number(button.dataset.appointmentId);
                if (!Number.isInteger(id) || id < 1) return;
                const handlers = {
                    view: () => window.viewAppointment?.(id),
                    confirm: () => window.confirmAppointment?.(id),
                    cancel: () => window.confirmDeleteAppointment?.(id)
                };
                handlers[button.dataset.appointmentAction]?.();
            });

            document.getElementById('availableSlotsPanel')?.addEventListener('click', event => {
                const button = event.target.closest('.slot-chip[data-slot-date][data-slot-time]');
                if (!button) return;
                selectAvailableSlot(button.dataset.slotDate, button.dataset.slotTime);
            });

            document.getElementById('appointmentsSortPreset')?.addEventListener('change', event => {
                if (event.target.value !== 'custom') setAppointmentSortPreset(event.target.value);
            });
            document.querySelectorAll('[data-appointment-sort-key]').forEach(button => {
                button.addEventListener('click', () => setAppointmentColumnSort(button.dataset.appointmentSortKey));
            });
            updateAppointmentsSortUI();

            ['filterSearch', 'filterStatus', 'filterDate', 'headerSearchInput'].forEach(id => {
                const el = document.getElementById(id);
                if (!el) return;
                el.addEventListener(id === 'filterStatus' ? 'change' : 'input', applyFilters);
            });

            ['doctorId', 'appointmentDateJalali'].forEach(id => {
                const el = document.getElementById(id);
                if (!el) return;
                const handler = () => {
                    if (id === 'doctorId') {
                        document.getElementById('appointmentDateJalali').value = '';
                        clearAvailableSlotsPanel();
                        resetTimeSelect();
                        refreshDoctorSlotWindowInfo(el.value);
                        setSlotFinderStatus('برای این پزشک می‌توانید زودترین نوبت یا همه نوبت‌های خالی را دریافت کنید.', 'info');
                        return;
                    }
                    loadSlotsForSelectedDoctorDate();
                    const g = window.toGregorianDateString ? window.toGregorianDateString(el.value) : '';
                    const t = document.getElementById('appointmentTime')?.value || '';
                    updateSelectedSlotBanner(g, t);
                };
                el.addEventListener('change', handler);
                el.addEventListener('input', handler);
            });
            document.getElementById('appointmentTime')?.addEventListener('change', function () {
                const j = document.getElementById('appointmentDateJalali')?.value || '';
                const g = window.toGregorianDateString ? window.toGregorianDateString(j) : '';
                updateSelectedSlotBanner(g, this.value);
            });
            let lastSlotKey = '';
            setInterval(() => {
                const key = `${document.getElementById('doctorId')?.value || ''}|${document.getElementById('appointmentDateJalali')?.value || ''}`;
                if (key && key !== lastSlotKey && document.getElementById('appointmentFormModal')?.classList.contains('show')) {
                    lastSlotKey = key;
                    loadSlotsForSelectedDoctorDate(document.getElementById('appointmentTime')?.value || '');
                }
            }, 700);

            document.querySelectorAll('.modal-overlay').forEach(modal => {
                modal.addEventListener('click', event => {
                    if (event.target === modal) closeModal(modal.id);
                });
            });
        }

        function openAddModal() {
            const form = document.getElementById('appointmentForm');
            if (form) form.reset();
            document.getElementById('appointmentId').value = '';
            document.getElementById('formModalTitle').textContent = 'ثبت نوبت جدید';
            document.getElementById('formSubmitText').textContent = 'ثبت نوبت';
            resetTimeSelect();
            clearAvailableSlotsPanel();
            refreshDoctorSlotWindowInfo('');
            setSlotFinderStatus('ابتدا بیمار و پزشک را انتخاب کنید.', 'info');
            const dateInput = document.getElementById('appointmentDateJalali');
            if (dateInput) { dateInput.readOnly = true; dateInput.dataset.manual = '0'; }
            const row = document.getElementById('bookingFieldRow');
            if (row) row.style.display = 'none';
            updateSelectedSlotBanner('', '');
            openModal('appointmentFormModal');
        }

        function viewAppointment(id) {
            const app = findAppointment(id);
            if (!app) return showToast('نوبت مورد نظر یافت نشد', 'error');

            const content = document.getElementById('viewAppointmentContent');
            if (content) {
                content.innerHTML = `
                    ${detailItem('شناسه نوبت', toPersianNumber(app.id || '-'))}
                    ${detailItem('زمان ثبت نوبت', formatAppointmentCreatedAt(app.created_at))}
                    ${detailItem('کد پیگیری نوبت', toPersianNumber(app.tracking_code || '-'))}
                    ${detailItem('تاریخ مراجعه', toPersianNumber(window.toJalaliDateString(app.appointment_date) || '-'))}
                    ${detailItem('ساعت مراجعه', toPersianNumber(formatTime(app.appointment_time)))}
                    ${detailItem('وضعیت نوبت', getStatusText(app.status))}
                    ${detailItem('بیمار', escapeHtml(app.patient_name || '-'))}
                    ${detailItem('تلفن بیمار', toPersianNumber(escapeHtml(app.patient_phone || '-')))}
                    ${detailItem('پزشک', escapeHtml(app.doctor_name || '-'))}
                    ${detailItem('تخصص', escapeHtml(app.doctor_specialty || '-'))}
                    ${detailItem('مرکز درمانی', escapeHtml(app.medical_center_name || '-'))}
                    ${detailItem('خدمت', escapeHtml(app.service_name || '-'))}
                    ${detailItem('نوع نوبت', getTypeText(app.type))}
                    ${detailItem('مبلغ نوبت', formatPrice(app.amount || 0))}
                    ${detailItem('وضعیت پرداخت', getPaymentStatusText(app))}
                    ${detailItem('روش پرداخت', getPaymentMethodText(app.payment_method))}
                    ${detailItem('شماره رسید', escapeHtml(app.payment_receipt_number || '-'))}
                    ${detailItem('تاریخ پرداخت', app.payment_date ? toPersianNumber(window.toJalaliDateString(app.payment_date) || '-') : '-')}
                    ${detailItem('درگاه پرداخت', app.payment_provider === 'sandbox' ? 'آزمایشی' : escapeHtml(app.payment_provider || '-'))}
                    ${detailItem('شماره پیگیری پرداخت', escapeHtml(app.payment_reference || '-'))}
                    ${detailItem('شناسه مرجع درگاه', escapeHtml(app.payment_authority || '-'))}
                    ${detailItem('زمان تأیید درگاه', app.payment_verified_at ? toPersianNumber(window.toJalaliDateString(app.payment_verified_at) || '-') : '-')}
                    ${detailItem('کلید یکتای پرداخت', escapeHtml(app.payment_idempotency_key || '-'), true)}
                    ${detailItem('توضیحات', escapeHtml(app.reason || '-'), true)}
                `;
            }

            const confirmButton = document.getElementById('viewConfirmBtn');
            const cancelButton = document.getElementById('viewDeleteBtn');
            const detailFooter = document.querySelector('#viewAppointmentModal .nv-appointment-detail-footer');
            const confirmable = canConfirmAppointment(app);
            const cancellable = canCancelAppointment(app);

            if (confirmButton) {
                confirmButton.hidden = !confirmable;
                confirmButton.title = confirmable ? 'تأیید این نوبت' : getBlockedAppointmentActionMessage(app, 'confirm');
                confirmButton.onclick = () => confirmAppointment(id);
            }
            if (cancelButton) {
                cancelButton.hidden = !cancellable;
                cancelButton.title = cancellable ? 'لغو این نوبت و حفظ سابقه آن' : getBlockedAppointmentActionMessage(app, 'cancel');
                cancelButton.onclick = () => confirmDeleteAppointment(id);
            }
            if (detailFooter) {
                const actionCount = 1 + (confirmable ? 1 : 0) + (cancellable ? 1 : 0);
                detailFooter.style.gridTemplateColumns = `repeat(${actionCount}, minmax(0, 1fr))`;
            }
            openModal('viewAppointmentModal');
        }

        function detailItem(label, value, full = false) {
            return `<div class="detail-item ${full ? 'full' : ''}"><div class="detail-label">${label}</div><div class="detail-value">${value}</div></div>`;
        }

        async function submitAppointmentForm() {
            const id = document.getElementById('appointmentId').value;
            const patientId = document.getElementById('patientId').value;
            const doctorId = document.getElementById('doctorId').value;
            const jalaliDate = document.getElementById('appointmentDateJalali').value;
            const appointmentDate = window.toGregorianDateString(jalaliDate);
            const appointmentTime = document.getElementById('appointmentTime').value;
            const type = document.getElementById('appointmentType').value;
            const status = document.getElementById('appointmentStatus').value;
            const reason = document.getElementById('appointmentReason').value;

            if (!patientId || !doctorId || !appointmentDate || !appointmentTime) {
                showToast('لطفاً بیمار، پزشک، تاریخ و ساعت را کامل وارد کنید', 'error');
                return;
            }

            try {
                const payload = {
                    patient_id: Number(patientId),
                    doctor_id: Number(doctorId),
                    appointment_date: appointmentDate,
                    appointment_time: appointmentTime,
                    type,
                    status,
                    reason
                };

                if (id) {
                    await updateAppointment(id, payload);
                    showToast('نوبت ویرایش شد', 'success');
                } else {
                    await createAppointment(payload);
                    showToast('نوبت ثبت شد', 'success');
                }

                closeModal('appointmentFormModal');
                await loadAppointments();
            } catch (error) {
                console.error('Submit appointment error:', error);
                showToast(error.message || 'خطا در ذخیره نوبت', 'error');
            }
        }

        async function confirmAppointment(id) {
            const app = findAppointment(id);
            if (app && !canConfirmAppointment(app)) {
                showToast(getBlockedAppointmentActionMessage(app, 'confirm'), 'warning');
                return;
            }
            if (!id || !confirm('آیا این نوبت تأیید شود؟')) return;
            try {
                await confirmAppointmentApi(id);
                closeModal('viewAppointmentModal');
                showToast('نوبت تأیید شد', 'success');
                await loadAppointments();
            } catch (error) {
                showToast(error.message || 'خطا در تأیید نوبت', 'error');
            }
        }

        async function confirmDeleteAppointment(id) {
            const app = findAppointment(id);
            if (app && !canCancelAppointment(app)) {
                showToast(getBlockedAppointmentActionMessage(app, 'cancel'), 'warning');
                return;
            }
            if (!id || !confirm('آیا از لغو این نوبت مطمئن هستید؟')) return;
            try {
                await deleteAppointmentApi(id);
                closeModal('viewAppointmentModal');
                showToast('نوبت لغو شد', 'success');
                await loadAppointments();
            } catch (error) {
                showToast(error.message || 'خطا در لغو نوبت', 'error');
            }
        }

        function clearFilters() {
            const search = document.getElementById('filterSearch');
            const headerSearch = document.getElementById('headerSearchInput');
            const status = document.getElementById('filterStatus');
            const date = document.getElementById('filterDate');
            if (search) search.value = '';
            if (headerSearch) headerSearch.value = '';
            if (status) status.value = 'all';
            if (date) date.value = '';
            applyFilters();
        }

        function openModal(id) {
            const modal = document.getElementById(id);
            if (!modal) return;
            modal.classList.add('show');
            document.body.classList.add('modal-open');
            const scrollBody = modal.querySelector('.modal-body');
            if (scrollBody) {
                scrollBody.setAttribute('tabindex', '-1');
                requestAnimationFrame(() => {
                    scrollBody.scrollTop = 0;
                    scrollBody.focus({ preventScroll: true });
                });
            }
        }

        function closeModal(id) {
            const modal = document.getElementById(id);
            if (!modal) return;
            modal.classList.remove('show');
            if (!document.querySelector('.modal-overlay.show, .modal.show')) {
                document.body.classList.remove('modal-open');
            }
        }

        function findAppointment(id) {
            return allAppointments.find(app => String(app.id) === String(id));
        }

        function resetTimeSelect() {
            const select = document.getElementById('appointmentTime');
            if (select) select.innerHTML = '<option value="">ابتدا پزشک و نوبت خالی را انتخاب کنید</option>';
        }

        async function loadSlotsForSelectedDoctorDate(selectedTime = '') {
            const doctorId = document.getElementById('doctorId')?.value;
            const jalaliDate = document.getElementById('appointmentDateJalali')?.value;
            const gregorianDate = jalaliDate && window.toGregorianDateString ? window.toGregorianDateString(jalaliDate) : '';
            const select = document.getElementById('appointmentTime');
            if (!select) return;
            if (!doctorId || !gregorianDate) {
                resetTimeSelect();
                return;
            }
            select.innerHTML = '<option value="">در حال دریافت ساعت‌های مجاز...</option>';
            try {
                const result = await getAvailableSlots(doctorId, gregorianDate);
                const selected = formatTime(selectedTime);
                let slots = (result.slots || []).filter(s => !s.is_booked || s.time === selected).map(s => s.time);
                if (selected && !slots.includes(selected)) slots.unshift(selected);
                if (!slots.length) {
                    select.innerHTML = '<option value="">برای این پزشک در این تاریخ زمان خالی/تعریف‌شده وجود ندارد</option>';
                    return;
                }
                setTimeOptions(selected, slots);
            } catch (error) {
                console.warn('Available slots failed:', error.message);
                select.innerHTML = '<option value="">خطا در دریافت ساعت‌های مجاز</option>';
            }
        }

        function setTimeOptions(selectedTime = '', slots = []) {
            const select = document.getElementById('appointmentTime');
            if (!select) return;
            const selected = formatTime(selectedTime);
            select.innerHTML = '<option value="">انتخاب ساعت...</option>' + slots.map(slot => `<option value="${slot}">${toPersianNumber(slot)}</option>`).join('');
            if (selected) select.value = selected;
        }

        function getSlotSearchDays() {
            const daysCount = Math.min(365, Math.max(7, Number(currentBookingWindowDays || 30)));
            const start = new Date();
            start.setHours(0, 0, 0, 0);
            const dates = [];
            for (let i = 0; i < daysCount; i++) {
                const d = new Date(start);
                d.setDate(start.getDate() + i);
                dates.push(formatGregorianDate(d));
            }
            return dates;
        }

        function formatGregorianDate(date) {
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        }

        function setSlotFinderStatus(message, type = 'info') {
            const el = document.getElementById('slotFinderStatus');
            if (!el) return;
            el.className = `slot-finder-status ${type}`;
            el.textContent = message || '';
        }

        function clearAvailableSlotsPanel() {
            const panel = document.getElementById('availableSlotsPanel');
            if (panel) panel.innerHTML = '';
        }

        async function getFreeSlotsForDate(doctorId, gregorianDate) {
            const result = await getAvailableSlots(doctorId, gregorianDate);
            return (result.slots || [])
                .filter(slot => !slot.is_booked)
                .map(slot => formatTime(slot.time || slot))
                .filter(Boolean);
        }

        function requireDoctorForSlotSearch() {
            const doctorId = document.getElementById('doctorId')?.value;
            if (!doctorId) {
                setSlotFinderStatus('ابتدا پزشک را انتخاب کنید.', 'warning');
                return '';
            }
            return doctorId;
        }

        async function findEarliestAvailableSlot() {
            const doctorId = requireDoctorForSlotSearch();
            if (!doctorId) return;
            clearAvailableSlotsPanel();
            const dates = getSlotSearchDays();
            setSlotFinderStatus(`در حال جستجوی زودترین نوبت خالی در بازه ${toPersianNumber(dates.length)} روزه پزشک...`, 'loading');
            try {
                for (const date of dates) {
                    const slots = await getFreeSlotsForDate(doctorId, date);
                    if (slots.length) {
                        selectAvailableSlot(date, slots[0]);
                        setSlotFinderStatus(`زودترین نوبت خالی انتخاب شد: ${toPersianNumber(window.toJalaliDateString(date))} ساعت ${toPersianNumber(slots[0])}`, 'success');
                        renderAvailableSlotGroups([{ date, slots: slots.slice(0, 8) }]);
                        return;
                    }
                }
                resetTimeSelect();
                setSlotFinderStatus('در این بازه نوبت خالی برای این پزشک پیدا نشد.', 'warning');
            } catch (error) {
                console.error('Earliest slot search failed:', error);
                setSlotFinderStatus(error.message || 'خطا در جستجوی نوبت خالی', 'error');
            }
        }

        async function loadAvailableSlotsRange() {
            const doctorId = requireDoctorForSlotSearch();
            if (!doctorId) return;
            const dates = getSlotSearchDays();
            clearAvailableSlotsPanel();
            setSlotFinderStatus(`در حال دریافت نوبت‌های خالی تا ${toPersianNumber(dates.length)} روز آینده...`, 'loading');
            const groups = [];
            try {
                for (let i = 0; i < dates.length; i++) {
                    const date = dates[i];
                    const slots = await getFreeSlotsForDate(doctorId, date);
                    if (slots.length) groups.push({ date, slots });
                    if (i % 7 === 0) {
                        setSlotFinderStatus(`بررسی روزها: ${toPersianNumber(i + 1)} از ${toPersianNumber(dates.length)}`, 'loading');
                    }
                }
                renderAvailableSlotGroups(groups);
                if (groups.length) {
                    setSlotFinderStatus(`${toPersianNumber(groups.reduce((sum, item) => sum + item.slots.length, 0))} نوبت خالی در ${toPersianNumber(groups.length)} روز پیدا شد.`, 'success');
                } else {
                    setSlotFinderStatus('در این بازه نوبت خالی برای این پزشک پیدا نشد.', 'warning');
                }
            } catch (error) {
                console.error('Load available slots range failed:', error);
                setSlotFinderStatus(error.message || 'خطا در دریافت نوبت‌های خالی', 'error');
            }
        }

        function renderAvailableSlotGroups(groups) {
            const panel = document.getElementById('availableSlotsPanel');
            if (!panel) return;
            if (!groups.length) {
                panel.innerHTML = '';
                return;
            }
            panel.innerHTML = groups.map(group => `
                <div class="slot-day-card">
                    <div class="slot-day-title">${toPersianNumber(window.toJalaliDateString(group.date))}</div>
                    <div class="slot-chip-row">
                        ${group.slots.map(time => `<button type="button" class="slot-chip" data-slot-date="${group.date}" data-slot-time="${time}">${toPersianNumber(time)}</button>`).join('')}
                    </div>
                </div>
            `).join('');
            const currentDate = document.getElementById('appointmentDateJalali')?.value;
            const currentGregorian = currentDate && window.toGregorianDateString ? window.toGregorianDateString(currentDate) : '';
            markSelectedSlotChip(currentGregorian, document.getElementById('appointmentTime')?.value || '');
        }

        function updateSelectedSlotBanner(gregorianDate, time) {
            const banner = document.getElementById('selectedSlotBanner');
            if (!banner) return;
            const cleanTime = formatTime(time);
            if (!gregorianDate || !cleanTime) {
                banner.className = 'selected-slot-banner selected-slot-sticky empty';
                banner.innerHTML = `<i class="icon-calendar" aria-hidden="true"></i><div><strong>هنوز نوبتی انتخاب نشده است</strong><span>از زودترین نوبت خالی یا لیست نوبت‌های خالی پزشک انتخاب کنید.</span></div>`;
                return;
            }
            const jalali = window.toJalaliDateString ? window.toJalaliDateString(gregorianDate) : gregorianDate;
            banner.className = 'selected-slot-banner selected-slot-sticky selected';
            banner.innerHTML = `<i class="icon-check" aria-hidden="true"></i><div><strong>${toPersianNumber(jalali)} - ساعت ${toPersianNumber(cleanTime)}</strong><span>این نوبت برای ثبت انتخاب شده است.</span></div>`;
        }

        function markSelectedSlotChip(gregorianDate, time) {
            document.querySelectorAll('.slot-chip').forEach(btn => {
                const active = btn.dataset.slotDate === String(gregorianDate) && btn.dataset.slotTime === String(formatTime(time));
                btn.classList.toggle('active', active);
            });
        }

        function selectAvailableSlot(gregorianDate, time) {
            const dateInput = document.getElementById('appointmentDateJalali');
            const timeSelect = document.getElementById('appointmentTime');
            if (dateInput) {
                dateInput.readOnly = true;
                dateInput.dataset.manual = '0';
                dateInput.value = window.toJalaliDateString(gregorianDate);
            }
            updateSelectedSlotBanner(gregorianDate, time);
            markSelectedSlotChip(gregorianDate, time);
            const row = document.getElementById('bookingFieldRow');
            if (row) row.style.display = 'none';
            if (timeSelect) {
                setTimeOptions(time, [time]);
                timeSelect.value = formatTime(time);
            }
        }

        function toggleManualDateMode() {
            const input = document.getElementById('appointmentDateJalali');
            const row = document.getElementById('bookingFieldRow');
            if (!input) return;
            const manual = input.dataset.manual === '1';
            input.dataset.manual = manual ? '0' : '1';
            input.readOnly = manual;
            input.placeholder = manual ? 'از دکمه‌های بالا انتخاب می‌شود' : 'مثال: ۱۴۰۵/۰۳/۱۲';
            if (!manual) {
                if (row) row.style.display = 'grid';
                input.focus();
                setSlotFinderStatus('حالت دستی فقط برای موارد استثنایی است؛ بعد از وارد کردن تاریخ، ساعت‌های مجاز همان روز دریافت می‌شود.', 'warning');
            } else {
                if (row) row.style.display = 'none';
                setSlotFinderStatus('حالت انتخاب هوشمند فعال است.', 'info');
            }
        }

        function updateStats() {
            const today = new Date().toISOString().slice(0, 10);
            setText('totalAppointmentsCount', toPersianNumber(allAppointments.length));
            setText('pendingAppointmentsCount', toPersianNumber(allAppointments.filter(app => app.status === 'pending').length));
            setText('confirmedAppointmentsCount', toPersianNumber(allAppointments.filter(app => app.status === 'confirmed').length));
            setText('todayAppointmentsCount', toPersianNumber(allAppointments.filter(app => app.appointment_date === today).length));
        }

        function setText(id, value) {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        }

        function normalizeDate(value) {
            if (!value) return '';
            const str = String(value);
            if (str.includes('T')) return str.slice(0, 10);
            if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
            return str;
        }

        function formatTime(timeStr) {
            if (!timeStr) return '-';
            return String(timeStr).slice(0, 5);
        }

        function formatAppointmentCreatedAt(value) {
            if (!value) return '-';
            const raw = String(value).trim();
            const datePart = normalizeDate(raw);
            const jalali = window.toJalaliDateString ? window.toJalaliDateString(datePart) : datePart;
            const timeMatch = raw.match(/(?:T|\s)(\d{2}:\d{2})/);
            const time = timeMatch ? timeMatch[1] : '';
            return toPersianNumber(`${jalali || '-'}${time ? `، ساعت ${time}` : ''}`);
        }

        function getTypeText(type) {
            return ({ regular: 'عادی', follow_up: 'پیگیری', emergency: 'اورژانسی', surgery: 'جراحی' })[type] || type || '-';
        }

        function getPaymentStatusValue(app) {
            const value = String(app?.resolved_payment_status || app?.payment_record_status || app?.payment_status || '').toLowerCase();
            if (value === 'free') return 'free';
            if (['paid', 'completed', 'success'].includes(value)) return 'paid';
            if (value === 'pending') return 'pending';
            if (['failed', 'cancelled', 'canceled'].includes(value)) return value === 'failed' ? 'failed' : 'cancelled';
            return 'unpaid';
        }

        function getPaymentStatusText(app) {
            return ({ paid: 'پرداخت شده', free: 'خدمت رایگان', pending: 'در انتظار پرداخت', failed: 'پرداخت ناموفق', cancelled: 'پرداخت لغوشده', unpaid: 'پرداخت نشده' })[getPaymentStatusValue(app)] || 'پرداخت نشده';
        }

        function getPaymentStatusClass(app) {
            return ({ paid: 'badge-confirmed', free: 'badge-confirmed', pending: 'badge-pending', failed: 'badge-cancelled', cancelled: 'badge-cancelled', unpaid: 'badge-pending' })[getPaymentStatusValue(app)] || 'badge-pending';
        }

        function getPaymentMethodText(method) {
            return ({ online: 'آنلاین / آزمایشی', cash: 'نقدی', card: 'کارت بانکی', pos: 'کارت‌خوان', bank_transfer: 'انتقال بانکی', card_to_card: 'کارت‌به‌کارت' })[String(method || '').toLowerCase()] || (method || '-');
        }

        function getStatusText(status) {
            const normalized = normalizeAppointmentStatus(status);
            return ({ pending: 'در انتظار', confirmed: 'تأیید شده', rescheduled: 'تغییر زمان داده‌شده', completed: 'انجام شده', no_show: 'عدم مراجعه', cancelled: 'لغو شده' })[normalized] || status || '-';
        }

        function getStatusClass(status) {
            const normalized = normalizeAppointmentStatus(status);
            return ({ pending: 'badge-pending', confirmed: 'badge-confirmed', rescheduled: 'badge-pending', completed: 'badge-completed', no_show: 'badge-cancelled', cancelled: 'badge-cancelled' })[normalized] || 'badge-pending';
        }

        function toPersianNumber(value) {
            if (value === null || value === undefined) return '';
            return String(value).replace(/\d/g, digit => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);
        }

        function formatPrice(value) {
            const amount = Number(value) || 0;
            return `${toPersianNumber(amount.toLocaleString('en-US'))} تومان`;
        }

        function normalizeText(value) {
            return String(value || '')
                .replace(/[ي]/g, 'ی')
                .replace(/[ك]/g, 'ک')
                .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
                .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
                .trim()
                .toLowerCase();
        }

        function escapeHtml(value) {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        function showToast(message, type = 'info') {
            const colors = { success: '#059669', error: '#dc2626', warning: '#d97706', info: '#1f2937' };
            const toast = document.createElement('div');
            toast.style.cssText = `position:fixed;bottom:20px;left:20px;background:${colors[type] || colors.info};color:white;padding:12px 20px;border-radius:8px;z-index:12050;box-shadow:0 8px 20px rgba(0,0,0,.15);font-size:13px;`;
            toast.textContent = message;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
        }

        window.loadAppointments = loadAppointments;
        window.clearFilters = clearFilters;
        window.openAddModal = openAddModal;
        window.closeModal = closeModal;
        window.submitAppointmentForm = submitAppointmentForm;
        window.viewAppointment = viewAppointment;
        window.confirmAppointment = confirmAppointment;
        window.confirmDeleteAppointment = confirmDeleteAppointment;

        function consumePaymentReturnNotice() {
            let message = '';
            try {
                message = sessionStorage.getItem('nv_appointment_payment_result') || '';
                if (message) sessionStorage.removeItem('nv_appointment_payment_result');
            } catch (_) {}

            const params = new URLSearchParams(window.location.search);
            if (!message && params.get('payment') === 'success') {
                message = 'پرداخت با موفقیت تأیید شد و نوبت ثبت گردید.';
            }
            if (message) showToast(message, 'success');

            if (params.has('payment') || params.has('appointment_id')) {
                params.delete('payment');
                params.delete('appointment_id');
                const cleanQuery = params.toString();
                const cleanUrl = `${window.location.pathname}${cleanQuery ? `?${cleanQuery}` : ''}${window.location.hash || ''}`;
                window.history.replaceState({}, document.title, cleanUrl);
            }
        }

        document.addEventListener('DOMContentLoaded', async () => {
            const ok = await initPage();
            if (!ok) return;
            resetTimeSelect();
            bindEvents();
            await loadAppointments();
            consumePaymentReturnNotice();
        });
