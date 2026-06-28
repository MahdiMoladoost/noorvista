/* Sadra 2.1.29 — Persian-friendly money inputs with live amount-in-words */
(function () {
  'use strict';
  if (window.NVMoneyInput?.version === '2.1.29') return;

  const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
  const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

  function toEnglish(value) {
    return String(value ?? '')
      .replace(/[۰-۹]/g, digit => String(FA_DIGITS.indexOf(digit)))
      .replace(/[٠-٩]/g, digit => String(AR_DIGITS.indexOf(digit)));
  }

  function digitsOnly(value) {
    return toEnglish(value).replace(/[^0-9]/g, '');
  }

  function toPersian(value) {
    return String(value ?? '').replace(/\d/g, digit => FA_DIGITS[Number(digit)]);
  }

  function parse(valueOrElement) {
    const value = valueOrElement && typeof valueOrElement === 'object'
      ? valueOrElement.value
      : valueOrElement;
    const clean = digitsOnly(value);
    return clean ? Number(clean) : 0;
  }

  const ones = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
  const teens = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
  const tens = ['', 'ده', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
  const hundreds = ['', 'یکصد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
  const scales = ['', 'هزار', 'میلیون', 'میلیارد', 'تریلیون', 'کوادریلیون'];

  function threeDigitsToWords(number) {
    const n = Math.max(0, Math.floor(number));
    const result = [];
    const hundred = Math.floor(n / 100);
    const remainder = n % 100;
    if (hundred) result.push(hundreds[hundred]);
    if (remainder) {
      if (remainder < 10) result.push(ones[remainder]);
      else if (remainder < 20) result.push(teens[remainder - 10]);
      else {
        const ten = Math.floor(remainder / 10);
        const one = remainder % 10;
        result.push(one ? `${tens[ten]} و ${ones[one]}` : tens[ten]);
      }
    }
    return result.join(' و ');
  }

  function numberToWords(value) {
    let number = Math.floor(Math.abs(Number(value) || 0));
    if (!number) return 'صفر';
    const groups = [];
    let scaleIndex = 0;
    while (number > 0 && scaleIndex < scales.length) {
      const group = number % 1000;
      if (group) {
        const words = threeDigitsToWords(group);
        groups.unshift(scales[scaleIndex] ? `${words} ${scales[scaleIndex]}` : words);
      }
      number = Math.floor(number / 1000);
      scaleIndex += 1;
    }
    return groups.join(' و ');
  }

  function helperId(input) {
    return `nv-money-words-${input.id || Math.random().toString(36).slice(2)}`;
  }

  function ensureWordsHelper(input) {
    if (!input) return null;
    let helper = input.nextElementSibling;
    if (!helper || !helper.classList?.contains('nv-money-words')) {
      helper = document.createElement('small');
      helper.className = 'nv-money-words';
      helper.id = helperId(input);
      helper.setAttribute('aria-live', 'polite');
      helper.hidden = true;
      input.insertAdjacentElement('afterend', helper);
    }
    const describedBy = new Set(String(input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
    describedBy.add(helper.id);
    input.setAttribute('aria-describedby', Array.from(describedBy).join(' '));
    return helper;
  }

  function updateWords(input) {
    const helper = ensureWordsHelper(input);
    if (!helper) return;
    const amount = parse(input);
    helper.hidden = !amount;
    helper.textContent = amount ? `${numberToWords(amount)} تومان` : '';
  }

  function setValue(input, value) {
    if (!input) return;
    const clean = digitsOnly(value);
    input.value = clean ? toPersian(clean) : '';
    updateWords(input);
  }

  function sanitize(input) {
    if (!input || input.disabled || input.readOnly) return;
    const clean = digitsOnly(input.value);
    input.value = clean ? toPersian(clean) : '';
    updateWords(input);
  }

  function enhance(input) {
    if (!input) return;
    if (input.dataset.nvMoneyEnhanced === '1') {
      updateWords(input);
      return;
    }
    input.dataset.nvMoneyEnhanced = '1';
    input.dataset.moneyInput = '1';
    input.type = 'text';
    input.inputMode = 'numeric';
    input.autocomplete = 'off';
    input.dir = 'ltr';
    input.style.textAlign = 'right';
    input.setAttribute('pattern', '[0-9۰-۹٠-٩,٬ ]*');
    ensureWordsHelper(input);
    setValue(input, input.value);

    input.addEventListener('input', () => sanitize(input));
    input.addEventListener('change', () => sanitize(input));
    input.addEventListener('blur', () => sanitize(input));
    input.addEventListener('paste', event => {
      event.preventDefault();
      const pasted = event.clipboardData?.getData('text') || '';
      const start = Number.isInteger(input.selectionStart) ? input.selectionStart : input.value.length;
      const end = Number.isInteger(input.selectionEnd) ? input.selectionEnd : input.value.length;
      const next = `${input.value.slice(0, start)}${pasted}${input.value.slice(end)}`;
      setValue(input, next);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  function enhanceAll(root = document) {
    root.querySelectorAll('[data-money-input], #custom_fee, #service_default_fee, #consultationFee, #consultation_fee_default')
      .forEach(enhance);
  }

  window.NVMoneyInput = {
    version: '2.1.29',
    enhance,
    enhanceAll,
    parse,
    sanitize,
    setValue,
    updateWords,
    numberToWords,
    toEnglish,
    toPersian
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => enhanceAll(document), { once: true });
  } else {
    enhanceAll(document);
  }
})();
