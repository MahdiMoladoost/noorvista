/* Sadra 2.1.28 — Persian-friendly money inputs */
(function () {
  'use strict';
  if (window.NVMoneyInput) return;

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

  function setValue(input, value) {
    if (!input) return;
    const clean = digitsOnly(value);
    input.value = clean ? toPersian(clean) : '';
  }

  function sanitize(input) {
    if (!input || input.disabled || input.readOnly) return;
    const clean = digitsOnly(input.value);
    input.value = clean ? toPersian(clean) : '';
  }

  function enhance(input) {
    if (!input || input.dataset.nvMoneyEnhanced === '1') return;
    input.dataset.nvMoneyEnhanced = '1';
    input.dataset.moneyInput = '1';
    input.type = 'text';
    input.inputMode = 'numeric';
    input.autocomplete = 'off';
    input.dir = 'ltr';
    input.style.textAlign = 'right';
    input.setAttribute('pattern', '[0-9۰-۹٠-٩,٬ ]*');
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

  window.NVMoneyInput = { enhance, enhanceAll, parse, sanitize, setValue, toEnglish, toPersian };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => enhanceAll(document), { once: true });
  } else {
    enhanceAll(document);
  }
})();
