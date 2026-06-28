'use strict';

const DIGITS = {
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9'
};

function toEnglishDigits(value) {
  return String(value ?? '').replace(/[۰-۹٠-٩]/g, ch => DIGITS[ch] || ch);
}

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return Boolean(fallback);
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  const text = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on', 'دارم', 'بله'].includes(text)) return true;
  if (['0', 'false', 'no', 'off', 'ندارم', 'خیر'].includes(text)) return false;
  return Boolean(value);
}

function money(value, fallback = 0) {
  const raw = toEnglishDigits(value).replace(/[٬,\s]/g, '').replace(/[^0-9.]/g, '').trim();
  if (!raw) return fallback;
  const number = Number(raw);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return Math.round(number);
}

function text(value, max = 240) {
  const clean = String(value || '').trim();
  return clean ? clean.slice(0, max) : null;
}

function normalizeInsuranceRequest(body = {}) {
  const hasSupplementaryInsurance = bool(
    body.has_supplementary_insurance ?? body.supplementary_insurance ?? body.hasSupplementaryInsurance,
    false
  );
  return {
    hasSupplementaryInsurance,
    provider: text(body.insurance_provider ?? body.supplementary_insurance_provider ?? body.insuranceProvider, 120),
    number: text(body.insurance_number ?? body.supplementary_insurance_number ?? body.insuranceNumber, 80),
    note: text(body.insurance_note ?? body.supplementary_insurance_note ?? body.insuranceNote, 1000),
    attachmentUrl: text(body.insurance_attachment_url ?? body.supplementary_insurance_attachment_url, 500)
  };
}

function serviceInsuranceEnabled(slotOrService = {}) {
  return bool(slotOrService.supplementary_insurance_enabled, false);
}

function paymentMode(slotOrService = {}) {
  return String(slotOrService.supplementary_insurance_payment_mode || slotOrService.insurance_payment_mode || 'none')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function resolvePaymentPolicy(slotOrService = {}, insuranceInput = {}, baseAmountInput = null) {
  const originalAmount = Math.max(0, money(baseAmountInput ?? slotOrService.appointment_fee ?? slotOrService.resolved_amount ?? slotOrService.default_fee, 0));
  const insurance = normalizeInsuranceRequest(insuranceInput);
  const enabled = serviceInsuranceEnabled(slotOrService);
  const hasInsurance = Boolean(insurance.hasSupplementaryInsurance && enabled);

  let onlinePayableAmount = originalAmount;
  let paymentPolicy = 'standard_full_payment';
  let insuranceStatus = insurance.hasSupplementaryInsurance ? (enabled ? 'declared' : 'not_covered_by_service') : 'none';
  let notice = '';

  if (hasInsurance && originalAmount > 0) {
    const mode = paymentMode(slotOrService);
    if (['waive', 'zero', 'free', 'no_online_payment', 'review'].includes(mode)) {
      onlinePayableAmount = 0;
      paymentPolicy = mode === 'review' ? 'insurance_review_before_payment' : 'supplementary_insurance_no_online_payment';
    } else if (['fixed', 'fixed_amount', 'reduced_fixed'].includes(mode)) {
      onlinePayableAmount = Math.min(originalAmount, Math.max(0, money(slotOrService.supplementary_insurance_amount, 0)));
      paymentPolicy = 'supplementary_insurance_fixed_online_amount';
    } else if (['percent', 'percentage', 'reduced_percent'].includes(mode)) {
      const percent = Math.max(0, Math.min(100, Number(slotOrService.supplementary_insurance_percent || 0)));
      onlinePayableAmount = Math.round(originalAmount * percent / 100);
      paymentPolicy = 'supplementary_insurance_percent_online_amount';
    } else {
      paymentPolicy = 'supplementary_insurance_declared_full_payment';
    }
    insuranceStatus = 'pending_review';
    notice = 'اطلاعات بیمه توسط کلینیک بررسی می‌شود. اگر بیمه برای این خدمت تأیید نشود، مبلغ نهایی هنگام مراجعه اعلام می‌شود.';
  }

  if (originalAmount <= 0) {
    onlinePayableAmount = 0;
    paymentPolicy = 'free_service';
    insuranceStatus = insurance.hasSupplementaryInsurance ? 'not_required_for_free_service' : 'none';
  }

  const remainingAmount = Math.max(0, originalAmount - onlinePayableAmount);
  return {
    ...insurance,
    hasSupplementaryInsurance: Boolean(insurance.hasSupplementaryInsurance),
    insuranceApplied: hasInsurance,
    supplementaryInsuranceEnabled: enabled,
    originalAmount,
    onlinePayableAmount,
    remainingAmount,
    paymentPolicy,
    insuranceStatus,
    notice,
    requiresReview: hasInsurance ? bool(slotOrService.supplementary_insurance_requires_review, true) : false,
    attachmentRequired: hasInsurance ? bool(slotOrService.supplementary_insurance_attachment_required, false) : false
  };
}

function servicePolicyFromBody(body = {}) {
  return {
    supplementary_insurance_enabled: bool(body.supplementary_insurance_enabled, false) ? 1 : 0,
    supplementary_insurance_payment_mode: paymentMode({ supplementary_insurance_payment_mode: body.supplementary_insurance_payment_mode || 'none' }),
    supplementary_insurance_amount: money(body.supplementary_insurance_amount, 0),
    supplementary_insurance_percent: Math.max(0, Math.min(100, Number(toEnglishDigits(body.supplementary_insurance_percent || 0).replace(/[^0-9.]/g, '')) || 0)),
    supplementary_insurance_requires_review: bool(body.supplementary_insurance_requires_review, true) ? 1 : 0,
    supplementary_insurance_attachment_required: bool(body.supplementary_insurance_attachment_required, false) ? 1 : 0,
    supplementary_insurance_notice: text(body.supplementary_insurance_notice, 1000)
  };
}

function appointmentInsuranceFields(resolution) {
  return {
    original_amount: resolution.originalAmount,
    online_payable_amount: resolution.onlinePayableAmount,
    remaining_amount: resolution.remainingAmount,
    payment_policy: resolution.paymentPolicy,
    has_supplementary_insurance: resolution.hasSupplementaryInsurance ? 1 : 0,
    insurance_status: resolution.insuranceStatus,
    insurance_provider: resolution.provider,
    insurance_number: resolution.number,
    insurance_note: resolution.note,
    insurance_attachment_url: resolution.attachmentUrl
  };
}

module.exports = {
  normalizeInsuranceRequest,
  resolvePaymentPolicy,
  servicePolicyFromBody,
  appointmentInsuranceFields,
  toEnglishDigits,
  money,
  bool
};
