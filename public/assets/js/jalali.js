// ============================================
// Sadra - تبدیل تاریخ شمسی و میلادی
// ============================================

// تبدیل اعداد انگلیسی به فارسی
function toPersianNumber(num) {
    if (num === null || num === undefined) return '۰';
    const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    return String(num).replace(/\d/g, d => persianDigits[parseInt(d)]);
}

// تبدیل اعداد فارسی به انگلیسی
function toEnglishNumber(str) {
    if (!str) return '';
    const persianDigits = { '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' };
    return String(str).replace(/[۰-۹]/g, d => persianDigits[d]);
}

// تبدیل تاریخ میلادی به شمسی
function gregorianToJalali(gy, gm, gd) {
    if (typeof gy === 'string' && gy.includes('-')) {
        const parts = gy.split('-');
        gy = parseInt(parts[0]);
        gm = parseInt(parts[1]);
        gd = parseInt(parts[2]);
    } else if (gy instanceof Date) {
        gd = gy.getDate();
        gm = gy.getMonth() + 1;
        gy = gy.getFullYear();
    } else if (typeof gy === 'string' && gy.includes('T')) {
        const d = new Date(gy);
        gy = d.getFullYear();
        gm = d.getMonth() + 1;
        gd = d.getDate();
    }
    
    let jy = gy - 621;
    let jm = gm;
    let jd = gd;
    
    if (gm < 3) jy--;
    
    return {
        year: jy,
        month: jm,
        day: jd,
        toString: function() {
            return `${toPersianNumber(jy)}/${toPersianNumber(jm)}/${toPersianNumber(jd)}`;
        }
    };
}

// تبدیل تاریخ شمسی به میلادی
function jalaliToGregorian(jy, jm, jd) {
    if (typeof jy === 'string' && jy.includes('/')) {
        const parts = jy.split('/');
        jy = parseInt(toEnglishNumber(parts[0]));
        jm = parseInt(toEnglishNumber(parts[1]));
        jd = parseInt(toEnglishNumber(parts[2]));
    }
    
    let gy = jy + 621;
    let gm = jm;
    let gd = jd;
    
    if (jm > 3) gy++;
    
    return {
        year: gy,
        month: gm,
        day: gd,
        toString: function() {
            return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
        }
    };
}

// تابع کمکی برای تبدیل تاریخ میلادی به شمسی (ورودی رشته یا Date)
function toJalali(date) {
    if (!date) return '';
    
    // اگر تاریخ به فرمت شمسی است، همان را برگردان
    if (typeof date === 'string' && date.includes('/') && /^[۰-۹0-9]{4}\/[۰-۹0-9]{1,2}\/[۰-۹0-9]{1,2}$/.test(date)) {
        return date;
    }
    
    try {
        let d;
        if (typeof date === 'string' && date.includes('T')) {
            d = new Date(date);
        } else if (typeof date === 'string' && date.includes('-')) {
            d = new Date(date);
        } else if (date instanceof Date) {
            d = date;
        } else {
            d = new Date(date);
        }
        
        if (isNaN(d.getTime())) return date;
        
        const result = gregorianToJalali(d);
        return result.toString();
    } catch(e) {
        return date;
    }
}

// تابع کمکی برای تبدیل تاریخ شمسی به میلادی
function toGregorian(jalaliDate) {
    if (!jalaliDate) return '';
    
    // اگر تاریخ به فرمت میلادی است، همان را برگردان
    if (typeof jalaliDate === 'string' && jalaliDate.includes('-') && /^\d{4}-\d{2}-\d{2}$/.test(jalaliDate)) {
        return jalaliDate;
    }
    
    try {
        const result = jalaliToGregorian(jalaliDate);
        return result.toString();
    } catch(e) {
        return jalaliDate;
    }
}

// فرمت قیمت
function formatPrice(price) {
    if (!price && price !== 0) return '۰ تومان';
    const intPrice = Math.round(parseFloat(price));
    const formatted = intPrice.toLocaleString('en-US');
    return toPersianNumber(formatted) + ' تومان';
}

// اعتبارسنجی تاریخ شمسی
function isValidJalaliDate(dateStr) {
    if (!dateStr) return false;
    const cleaned = toEnglishNumber(dateStr);
    const parts = cleaned.split('/');
    if (parts.length !== 3) return false;
    
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]);
    const day = parseInt(parts[2]);
    
    if (year < 1300 || year > 1500) return false;
    if (month < 1 || month > 12) return false;
    if (day < 1 || day > 31) return false;
    
    return true;
}