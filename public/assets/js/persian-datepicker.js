// ============================================
// NoorVista - Persian Datepicker (تقویم شمسی حرفه‌ای)
// ============================================

class PersianDatepicker {
    constructor(inputElement, options = {}) {
        this.input = typeof inputElement === 'string' ? document.querySelector(inputElement) : inputElement;
        if (!this.input) return;
        
        this.options = {
            format: 'YYYY/MM/DD',
            autoClose: true,
            ...options
        };
        
        this.isOpen = false;
        this.init();
    }
    
    init() {
        if (this.input.hasAttribute('data-datepicker-initialized')) return;
        
        this.input.style.cursor = 'pointer';
        this.input.readOnly = true;
        this.input.setAttribute('data-datepicker-initialized', 'true');
        
        this.parseCurrentDate();
        this.createPicker();
        
        this.input.addEventListener('click', () => this.toggle());
    }
    
    parseCurrentDate() {
        const value = this.input.value;
        if (value && isValidJalaliDate(value)) {
            const cleaned = toEnglishNumber(value);
            const parts = cleaned.split('/');
            this.currentYear = parseInt(parts[0]);
            this.currentMonth = parseInt(parts[1]);
            this.currentDay = parseInt(parts[2]);
        } else {
            const today = gregorianToJalali(new Date());
            this.currentYear = today.year;
            this.currentMonth = today.month;
            this.currentDay = today.day;
        }
        
        this.displayYear = this.currentYear;
        this.displayMonth = this.currentMonth;
    }
    
    createPicker() {
        this.picker = document.createElement('div');
        this.picker.className = 'persian-datepicker';
        this.picker.style.cssText = `
            position: absolute;
            z-index: 100000;
            display: none;
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.15);
            border: 1px solid #e2e8f0;
            width: 280px;
            padding: 12px;
            font-family: 'Vazir', Tahoma, Arial, sans-serif;
            direction: rtl;
        `;
        
        document.body.appendChild(this.picker);
        this.render();
    }
    
    render() {
        if (!this.picker) return;
        
        const monthNames = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
        const weekDays = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
        
        const firstDayOfMonth = this.getFirstDayOfMonth(this.displayYear, this.displayMonth);
        const daysInMonth = this.getDaysInMonth(this.displayYear, this.displayMonth);
        
        let html = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <button type="button" class="datepicker-prev" style="background: none; border: none; cursor: pointer; font-size: 18px; padding: 4px 8px;">&rarr;</button>
                <span style="font-weight: 600;">${monthNames[this.displayMonth - 1]} ${toPersianNumber(this.displayYear)}</span>
                <button type="button" class="datepicker-next" style="background: none; border: none; cursor: pointer; font-size: 18px; padding: 4px 8px;">&larr;</button>
            </div>
            <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; text-align: center; margin-bottom: 8px;">
                ${weekDays.map(day => `<span style="font-size: 11px; font-weight: 600; color: #94a3b8;">${day}</span>`).join('')}
            </div>
            <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; text-align: center;">
        `;
        
        // روزهای خالی ابتدای ماه
        for (let i = 0; i < firstDayOfMonth; i++) {
            html += `<div></div>`;
        }
        
        // روزهای ماه
        for (let d = 1; d <= daysInMonth; d++) {
            const isToday = (this.displayYear === this.currentYear && 
                            this.displayMonth === this.currentMonth && 
                            d === this.currentDay);
            const isSelected = (this.displayYear === this.currentYear && 
                               this.displayMonth === this.currentMonth && 
                               d === this.currentDay);
            
            let dayStyle = 'padding: 6px 0; cursor: pointer; border-radius: 8px; transition: all 0.2s;';
            if (isToday) {
                dayStyle += ' background: #dbeafe; color: #2f89fc; font-weight: 600;';
            }
            if (isSelected) {
                dayStyle += ' background: linear-gradient(135deg, #2f89fc, #1a6fdb); color: white;';
            }
            
            html += `<div class="datepicker-day" data-day="${d}" style="${dayStyle}">${toPersianNumber(d)}</div>`;
        }
        
        html += `</div>`;
        html += `
            <div style="display: flex; gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid #e2e8f0;">
                <button type="button" class="datepicker-today" style="flex: 1; background: #f8fafc; border: none; border-radius: 8px; padding: 6px; cursor: pointer; font-size: 12px;">امروز</button>
                <button type="button" class="datepicker-clear" style="flex: 1; background: #fef2f2; border: none; border-radius: 8px; padding: 6px; cursor: pointer; font-size: 12px; color: #ef4444;">پاک کردن</button>
            </div>
        `;
        
        this.picker.innerHTML = html;
        
        // رویدادها
        this.picker.querySelector('.datepicker-prev')?.addEventListener('click', () => this.changeMonth(-1));
        this.picker.querySelector('.datepicker-next')?.addEventListener('click', () => this.changeMonth(1));
        this.picker.querySelector('.datepicker-today')?.addEventListener('click', () => this.selectToday());
        this.picker.querySelector('.datepicker-clear')?.addEventListener('click', () => this.clear());
        
        this.picker.querySelectorAll('.datepicker-day').forEach(el => {
            el.addEventListener('click', () => {
                const day = parseInt(el.getAttribute('data-day'));
                this.selectDate(day);
            });
        });
    }
    
    getFirstDayOfMonth(year, month) {
        const gregorian = jalaliToGregorian(year, month, 1);
        const date = new Date(gregorian.year, gregorian.month - 1, gregorian.day);
        let day = date.getDay();
        // تبدیل به شمسی (شنبه = 0)
        return day === 6 ? 0 : day + 1;
    }
    
    getDaysInMonth(year, month) {
        if (month <= 6) return 31;
        if (month <= 11) return 30;
        return this.isLeapYear(year) ? 30 : 29;
    }
    
    isLeapYear(year) {
        const remainders = [1, 5, 9, 13, 17, 22, 26, 30];
        const mod = (year - 474) % 2820;
        const leap = (mod + 474) % 33;
        return remainders.includes(leap);
    }
    
    changeMonth(delta) {
        let newMonth = this.displayMonth + delta;
        let newYear = this.displayYear;
        
        if (newMonth < 1) {
            newMonth = 12;
            newYear--;
        } else if (newMonth > 12) {
            newMonth = 1;
            newYear++;
        }
        
        this.displayYear = newYear;
        this.displayMonth = newMonth;
        this.render();
        this.positionPicker();
    }
    
    selectDate(day) {
        this.currentYear = this.displayYear;
        this.currentMonth = this.displayMonth;
        this.currentDay = day;
        
        const formatted = `${toPersianNumber(this.currentYear)}/${toPersianNumber(this.currentMonth)}/${toPersianNumber(day)}`;
        this.input.value = formatted;
        
        if (this.options.autoClose) this.close();
        this.triggerChange();
    }
    
    selectToday() {
        const today = gregorianToJalali(new Date());
        this.currentYear = today.year;
        this.currentMonth = today.month;
        this.currentDay = today.day;
        this.displayYear = today.year;
        this.displayMonth = today.month;
        
        const formatted = `${toPersianNumber(today.year)}/${toPersianNumber(today.month)}/${toPersianNumber(today.day)}`;
        this.input.value = formatted;
        
        if (this.options.autoClose) this.close();
        this.triggerChange();
        this.render();
    }
    
    clear() {
        this.input.value = '';
        if (this.options.autoClose) this.close();
        this.triggerChange();
    }
    
    triggerChange() {
        const event = new Event('change', { bubbles: true });
        this.input.dispatchEvent(event);
    }
    
    toggle() {
        if (this.isOpen) this.close();
        else this.open();
    }
    
    open() {
        this.isOpen = true;
        this.picker.style.display = 'block';
        this.positionPicker();
        document.addEventListener('click', this.handleOutsideClick.bind(this));
    }
    
    close() {
        this.isOpen = false;
        this.picker.style.display = 'none';
        document.removeEventListener('click', this.handleOutsideClick.bind(this));
    }
    
    positionPicker() {
        const rect = this.input.getBoundingClientRect();
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const scrollLeft = window.scrollX || document.documentElement.scrollLeft;
        
        let top = rect.bottom + scrollTop + 5;
        let left = rect.left + scrollLeft;
        
        // بررسی اینکه تقویم از صفحه خارج نشود
        const pickerRect = this.picker.getBoundingClientRect();
        if (top + pickerRect.height > window.innerHeight + scrollTop) {
            top = rect.top + scrollTop - pickerRect.height - 5;
        }
        if (left + pickerRect.width > window.innerWidth + scrollLeft) {
            left = window.innerWidth + scrollLeft - pickerRect.width - 10;
        }
        if (left < 0) left = 10;
        
        this.picker.style.top = `${top}px`;
        this.picker.style.left = `${left}px`;
    }
    
    handleOutsideClick(e) {
        if (!this.picker.contains(e.target) && e.target !== this.input) {
            this.close();
        }
    }
    
    destroy() {
        if (this.picker) this.picker.remove();
        this.input.removeAttribute('data-datepicker-initialized');
    }
}

// راه‌اندازی خودکار تمام تقویم‌ها
function initDatepickers() {
    document.querySelectorAll('.jalali-date-input').forEach(input => {
        if (!input.hasAttribute('data-datepicker-initialized')) {
            new PersianDatepicker(input);
        }
    });
}

// راه‌اندازی خودکار بعد از لود صفحه
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDatepickers);
} else {
    initDatepickers();
}