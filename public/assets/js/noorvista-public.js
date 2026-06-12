(function () {
    'use strict';

    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

    function normalizeDigits(value) {
        return String(value || '')
            .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
            .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
    }

    function valueOf(form, selectors) {
        for (const selector of selectors) {
            const el = $(selector, form);
            if (!el) continue;
            if (el.tagName === 'SELECT') {
                return (el.value || (el.options[el.selectedIndex] && el.options[el.selectedIndex].text) || '').trim();
            }
            return (el.value || '').trim();
        }
        return '';
    }

    function setStatus(form, message, type) {
        let status = $('.nv-status', form.parentElement || form) || $('.nv-status', form);
        if (!status) {
            status = document.createElement('div');
            status.className = 'nv-status';
            form.appendChild(status);
        }
        status.className = 'nv-status is-visible ' + (type || 'info');
        status.textContent = message;
    }

    async function postJson(url, payload) {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.success === false) {
            throw new Error(data.message || 'ارسال اطلاعات با خطا روبه‌رو شد.');
        }
        return data;
    }

    function appointmentPayload(form) {
        return {
            service: valueOf(form, ['[name="service"]', 'select']),
            full_name: valueOf(form, ['[name="full_name"]', '#appointment_name', 'input[placeholder*="نام"]']),
            phone: normalizeDigits(valueOf(form, ['[name="phone"]', '#phone', 'input[type="tel"]', 'input[placeholder*="تلفن"]', 'input[placeholder*="همراه"]'])),
            email: valueOf(form, ['[name="email"]', '#appointment_email', 'input[type="email"]', 'input[placeholder*="ایمیل"]']),
            preferred_date: normalizeDigits(valueOf(form, ['[name="preferred_date"]', '.appointment_date', 'input[placeholder*="تاریخ"]'])),
            preferred_time: normalizeDigits(valueOf(form, ['[name="preferred_time"]', '.appointment_time', 'input[placeholder*="زمان"]'])),
            message: valueOf(form, ['[name="message"]', 'textarea'])
        };
    }

    function contactPayload(form) {
        return {
            full_name: valueOf(form, ['[name="full_name"]', 'input[placeholder*="نام"]']),
            email: valueOf(form, ['[name="email"]', 'input[type="email"]', 'input[placeholder*="ایمیل"]']),
            phone: normalizeDigits(valueOf(form, ['[name="phone"]', 'input[type="tel"]', 'input[placeholder*="تلفن"]', 'input[placeholder*="همراه"]'])),
            subject: valueOf(form, ['[name="subject"]', 'input[placeholder*="موضوع"]']),
            message: valueOf(form, ['[name="message"]', 'textarea'])
        };
    }

    function validateAppointment(payload) {
        if (!payload.full_name || payload.full_name.length < 3) return 'نام کامل را وارد کنید.';
        if (!payload.phone || payload.phone.replace(/\D/g, '').length < 10) return 'شماره تماس معتبر وارد کنید.';
        return '';
    }

    function validateContact(payload) {
        if (!payload.full_name || payload.full_name.length < 3) return 'نام کامل را وارد کنید.';
        if (!payload.message || payload.message.length < 6) return 'متن پیام را کامل‌تر وارد کنید.';
        if (!payload.phone && !payload.email) return 'حداقل شماره تماس یا ایمیل را وارد کنید.';
        return '';
    }

    async function submitAppointment(form) {
        const payload = appointmentPayload(form);
        const error = validateAppointment(payload);
        if (error) return setStatus(form, error, 'error');
        setStatus(form, 'در حال ثبت رزرو نوبت...', 'info');
        await postJson('/api/public/appointment-request', payload);
        setStatus(form, 'رزرو نوبت شما ثبت شد. وضعیت نوبت از مسیر پیگیری یا مشاوره آنلاین قابل بررسی است.', 'success');
        form.reset();
    }

    async function submitContact(form) {
        const payload = contactPayload(form);
        const error = validateContact(payload);
        if (error) return setStatus(form, error, 'error');
        setStatus(form, 'در حال ثبت سوال...', 'info');
        await postJson('/api/public/contact-message', payload);
        setStatus(form, 'سوال شما ثبت شد. برای پاسخ سریع‌تر می‌توانید از مشاوره آنلاین استفاده کنید.', 'success');
        form.reset();
    }

    document.addEventListener('submit', function (event) {
        const form = event.target;
        const isAppointment = form.matches('.appointment-form, [data-public-form="appointment"]') || !!form.closest('#modalRequest');
        const isContact = form.matches('#contactForm, [data-public-form="contact"]');
        if (!isAppointment && !isContact) return;
        event.preventDefault();
        (isAppointment ? submitAppointment(form) : submitContact(form)).catch(error => {
            setStatus(form, error.message || 'خطا در ارسال اطلاعات. لطفاً دوباره تلاش کنید.', 'error');
        });
    });
})();
