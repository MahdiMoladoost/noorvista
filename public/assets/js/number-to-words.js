// ============================================
// تبدیل عدد به حروف فارسی
// ============================================

function numberToWords(num) {
    if (num === 0) return 'صفر';
    
    const ones = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
    const tens = ['', 'ده', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
    const teens = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
    const hundreds = ['', 'یکصد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
    
    const groups = [
        { name: '', divisor: 1 },
        { name: 'هزار', divisor: 1000 },
        { name: 'میلیون', divisor: 1000000 },
        { name: 'میلیارد', divisor: 1000000000 },
        { name: 'تریلیون', divisor: 1000000000000 }
    ];
    
    function convertThreeDigits(n) {
        if (n === 0) return '';
        
        let result = [];
        const hundred = Math.floor(n / 100);
        const remainder = n % 100;
        
        if (hundred > 0) {
            result.push(hundreds[hundred]);
        }
        
        if (remainder > 0) {
            if (remainder < 10) {
                result.push(ones[remainder]);
            } else if (remainder < 20) {
                result.push(teens[remainder - 10]);
            } else {
                const ten = Math.floor(remainder / 10);
                const one = remainder % 10;
                if (one > 0) {
                    result.push(tens[ten] + ' و ' + ones[one]);
                } else {
                    result.push(tens[ten]);
                }
            }
        }
        
        return result.join(' و ');
    }
    
    let remaining = Math.abs(Math.floor(num));
    let result = [];
    
    for (let i = groups.length - 1; i >= 0; i--) {
        const group = groups[i];
        const groupValue = Math.floor(remaining / group.divisor);
        
        if (groupValue > 0) {
            const groupText = convertThreeDigits(groupValue);
            if (groupText) {
                if (group.name) {
                    result.push(groupText + ' ' + group.name);
                } else {
                    result.push(groupText);
                }
            }
            remaining %= group.divisor;
        }
    }
    
    return result.join(' و ');
}

// تابع نمایش قیمت با عدد و حروف
function formatPriceWithWords(price) {
    if (!price && price !== 0) return '۰ تومان';
    
    // حذف اعشار و تبدیل به عدد صحیح
    const intPrice = Math.round(parseFloat(price));
    
    // عدد به فارسی
    const persianNumber = toPersianNumber(intPrice);
    
    // عدد به حروف
    const words = numberToWords(intPrice);
    
    // تبدیل حروف به اعداد فارسی (اختیاری)
    const persianWords = words.replace(/[۰-۹]/g, '').trim();
    
    // نمایش عدد و حروف در دو خط
    return `<div class="price-container">
                <span class="price-number">${persianNumber}</span>
                <span class="price-words">${persianWords} تومان</span>
            </div>`;
}

// تابع ساده برای نمایش فقط حروف
function priceToWords(price) {
    if (!price && price !== 0) return 'صفر تومان';
    const intPrice = Math.round(parseFloat(price));
    const words = numberToWords(intPrice);
    return words + ' تومان';
}