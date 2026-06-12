// ============================================
// تقویم شمسی ساده برای فیلدهای تاریخ
// ============================================

class JalaliDatepicker {
    constructor(inputElement, options = {}) {
        this.input = inputElement;
        this.options = {
            format: 'yyyy/mm/dd',
            ...options
        };
        this.isOpen = false;
        this.currentDate = new Date();
        this.init();
    }
    
    init() {
        // ایجاد المان تقویم
        this.pickerDiv = document.createElement('div');
        this.pickerDiv.className = 'jalali-datepicker';
        this.pickerDiv.style.cssText = `
            position: absolute;
            background: white;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.1);
            z-index: 1000;
            width: 280px;
            padding: 10px;
            display: none;
            direction: rtl;
            font-family: 'Vazir', Tahoma, Arial;
        `;
        
        this.input.parentElement.style.position = 'relative';
        this.input.parentElement.appendChild(this.pickerDiv);
        
        // رویداد کلیک روی input
        this.input.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggle();
        });
        
        // بستن تقویم با کلیک خارج
        document.addEventListener('click', (e) => {
            if (!this.pickerDiv.contains(e.target) && e.target !== this.input) {
                this.close();
            }
        });
        
        // مقداردهی اولیه
        this.render();
    }
    
    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }
    
    open() {
        this.isOpen = true;
        this.pickerDiv.style.display = 'block';
        this.render();
    }
    
    close() {
        this.isOpen = false;
        this.pickerDiv.style.display = 'none';
    }
    
    getJalaliDate(date) {
        const gy = date.getFullYear();
        const gm = date.getMonth() + 1;
        const gd = date.getDate();
        
        // تبدیل به شمسی
        const jalali = gregorianToJalali(gy, gm, gd);
        return { year: jalali.year, month: jalali.month, day: jalali.day };
    }
    
    getCurrentJalaliYear() {
        const jalali = this.getJalaliDate(this.currentDate);
        return jalali.year;
    }
    
    getCurrentJalaliMonth() {
        const jalali = this.getJalaliDate(this.currentDate);
        return jalali.month;
    }
    
    render() {
        const jalaliDate = this.getJalaliDate(this.currentDate);
        const year = jalaliDate.year;
        const month = jalaliDate.month;
        
        // محاسبه روز اول ماه
        const firstDayOfMonth = this.getFirstDayOfMonth(year, month);
        
        // روزهای ماه شمسی
        const monthDays = this.getMonthDays(year, month);
        
        // نام ماه‌ها
        const monthNames = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
        
        // نام روزها
        const dayNames = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
        
        let html = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #e2e8f0;">
                <button type="button" class="datepicker-prev" style="background: none; border: none; cursor: pointer; font-size: 18px;">&rarr;</button>
                <div style="font-weight: bold;">${monthNames[month - 1]} ${toPersianNumber(year)}</div>
                <button type="button" class="datepicker-next" style="background: none; border: none; cursor: pointer; font-size: 18px;">&larr;</button>
            </div>
            <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; text-align: center; margin-bottom: 10px;">
                ${dayNames.map(day => `<div style="font-size: 12px; color: #94a3b8;">${day}</div>`).join('')}
            </div>
            <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; text-align: center;">
        `;
        
        // روزهای خالی قبل از شروع ماه
        for (let i = 0; i < firstDayOfMonth; i++) {
            html += `<div style="padding: 6px; color: #cbd5e1;"></div>`;
        }
        
        // روزهای ماه
        for (let i = 1; i <= monthDays; i++) {
            const isToday = (i === jalaliDate.day && 
                            year === this.getCurrentJalaliYear() && 
                            month === this.getCurrentJalaliMonth());
            const isSelected = this.input.value === `${year}/${month < 10 ? '0' + month : month}/${i < 10 ? '0' + i : i}`;
            
            html += `
                <div class="datepicker-day" data-day="${i}" style="
                    padding: 6px;
                    cursor: pointer;
                    border-radius: 8px;
                    ${isToday ? 'background: #dbeafe;' : ''}
                    ${isSelected ? 'background: #2f89fc; color: white;' : ''}
                    hover:background: #f1f5f9;
                ">
                    ${toPersianNumber(i)}
                </div>
            `;
        }
        
        html += `
            </div>
            <div style="display: flex; justify-content: space-between; margin-top: 10px; padding-top: 10px; border-top: 1px solid #e2e8f0;">
                <button type="button" class="datepicker-today" style="background: none; border: none; cursor: pointer; font-size: 12px; color: #2f89fc;">امروز</button>
                <button type="button" class="datepicker-clear" style="background: none; border: none; cursor: pointer; font-size: 12px; color: #dc2626;">پاک کردن</button>
            </div>
        `;
        
        this.pickerDiv.innerHTML = html;
        
        // رویدادهای دکمه‌ها
        this.pickerDiv.querySelector('.datepicker-prev')?.addEventListener('click', () => {
            this.currentDate.setMonth(this.currentDate.getMonth() - 1);
            this.render();
        });
        
        this.pickerDiv.querySelector('.datepicker-next')?.addEventListener('click', () => {
            this.currentDate.setMonth(this.currentDate.getMonth() + 1);
            this.render();
        });
        
        this.pickerDiv.querySelector('.datepicker-today')?.addEventListener('click', () => {
            this.currentDate = new Date();
            const todayJalali = toJalali(this.currentDate);
            this.input.value = todayJalali;
            this.close();
            this.input.dispatchEvent(new Event('change'));
        });
        
        this.pickerDiv.querySelector('.datepicker-clear')?.addEventListener('click', () => {
            this.input.value = '';
            this.close();
            this.input.dispatchEvent(new Event('change'));
        });
        
        // رویداد کلیک روی روزها
        this.pickerDiv.querySelectorAll('.datepicker-day').forEach(day => {
            day.addEventListener('click', () => {
                const dayNum = parseInt(day.getAttribute('data-day'));
                const jalaliY = year;
                const jalaliM = month < 10 ? '0' + month : month;
                const jalaliD = dayNum < 10 ? '0' + dayNum : dayNum;
                this.input.value = `${jalaliY}/${jalaliM}/${jalaliD}`;
                this.close();
                this.input.dispatchEvent(new Event('change'));
            });
        });
    }
    
    getFirstDayOfMonth(year, month) {
        // تبدیل اولین روز ماه شمسی به میلادی
        const gregorian = jalaliToGregorian(year, month, 1);
        const date = new Date(gregorian.year, gregorian.month - 1, gregorian.day);
        // روز هفته (0=شنبه در تقویم فارسی)
        let day = date.getDay();
        return (day + 1) % 7;
    }
    
    getMonthDays(year, month) {
        const monthDays = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];
        // بررسی کبیسه بودن سال شمسی
        const jalaliLeapYear = (y) => {
            const remainders = [1, 5, 9, 13, 17, 22, 26, 30];
            return remainders.includes(y % 33);
        };
        
        if (month === 12 && jalaliLeapYear(year)) {
            return 30;
        }
        return monthDays[month - 1];
    }
}

// فعال‌سازی تقویم شمسی برای تمام input های تاریخ
function initJalaliDatepickers() {
    document.querySelectorAll('input[type="date"], .date-input').forEach(input => {
        // تبدیل input type date به text
        if (input.type === 'date') {
            input.type = 'text';
            input.placeholder = '۱۴۰۳/۰۱/۰۱';
        }
        new JalaliDatepicker(input);
    });
}

// تبدیل تاریخ‌های موجود در جداول به شمسی
function convertTableDatesToJalali() {
    document.querySelectorAll('table .date-cell, td[data-date]').forEach(cell => {
        const date = cell.getAttribute('data-date') || cell.textContent;
        if (date && date.match(/\d{4}-\d{2}-\d{2}/)) {
            cell.textContent = toJalali(date);
        }
    });
}

// اجرا بعد از بارگذاری صفحه
document.addEventListener('DOMContentLoaded', () => {
    initJalaliDatepickers();
});