'use strict';

const crypto = require('crypto');

const ZARINPAL_REQUEST_URL = 'https://payment.zarinpal.com/pg/v4/payment/request.json';
const ZARINPAL_VERIFY_URL = 'https://payment.zarinpal.com/pg/v4/payment/verify.json';
const ZARINPAL_START_PAY_URL = 'https://payment.zarinpal.com/pg/StartPay/';

class PaymentGatewayError extends Error {
  constructor(message, code = 'PAYMENT_GATEWAY_ERROR', status = 502, details = null) {
    super(message);
    this.name = 'PaymentGatewayError';
    this.code = code;
    this.status = status;
    this.expose = true;
    this.details = details;
  }
}

function configuredProvider() {
  return String(process.env.PAYMENT_PROVIDER || 'sandbox').trim().toLowerCase();
}

function isSandboxEnabled() {
  return process.env.TEST_PAYMENT_ENABLED === 'true' || process.env.NODE_ENV !== 'production';
}

function buildSandboxCheckoutUrl(rawToken, context = 'patient') {
  if (context === 'public') return `/appointment-payment.html?checkout_token=${encodeURIComponent(rawToken)}`;
  const panel = context === 'admin'
    ? 'admin'
    : (context === 'clinic-manager' ? 'clinic-manager' : (context === 'secretary' ? 'reception' : 'patient'));
  return `/dashboard/panel/${panel}/test-payment.html?checkout_token=${encodeURIComponent(rawToken)}`;
}

function publicBaseUrl(req) {
  const configured = String(process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL || '').trim().replace(/\/+$/, '');
  if (configured) {
    if (!/^https?:\/\//i.test(configured)) {
      throw new PaymentGatewayError('نشانی عمومی سامانه در تنظیمات سرور معتبر نیست', 'INVALID_PUBLIC_BASE_URL', 503);
    }
    if (process.env.NODE_ENV === 'production' && !/^https:\/\//i.test(configured)) {
      throw new PaymentGatewayError('در محیط عملیاتی، نشانی عمومی سامانه باید HTTPS باشد', 'HTTPS_PUBLIC_BASE_URL_REQUIRED', 503);
    }
    return configured;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new PaymentGatewayError('PUBLIC_BASE_URL در تنظیمات محیط عملیاتی ثبت نشده است', 'PUBLIC_BASE_URL_REQUIRED', 503);
  }

  const protocol = req?.protocol || 'http';
  const host = String(req?.get?.('host') || req?.headers?.host || 'localhost:3000').replace(/[\r\n]/g, '');
  return `${protocol}://${host}`;
}

function zarinpalMerchantId() {
  const value = String(process.env.ZARINPAL_MERCHANT_ID || '').trim();
  if (!/^[a-f0-9-]{36}$/i.test(value)) {
    throw new PaymentGatewayError('کد پذیرنده زرین‌پال در تنظیمات سرور ثبت نشده یا معتبر نیست', 'ZARINPAL_MERCHANT_ID_REQUIRED', 503);
  }
  return value;
}

function zarinpalCheckoutUrl(authority) {
  const value = String(authority || '').trim();
  if (!value) return null;
  return `${ZARINPAL_START_PAY_URL}${encodeURIComponent(value)}`;
}

async function postJson(url, body, timeoutMs = 15000) {
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(Math.max(3000, Number(timeoutMs) || 15000))
    });
  } catch (error) {
    const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    throw new PaymentGatewayError(
      timeout ? 'پاسخ درگاه پرداخت طول کشید؛ دوباره تلاش کنید' : 'ارتباط امن با درگاه پرداخت برقرار نشد',
      timeout ? 'PAYMENT_GATEWAY_TIMEOUT' : 'PAYMENT_GATEWAY_UNAVAILABLE',
      502
    );
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new PaymentGatewayError('درگاه پرداخت درخواست را نپذیرفت', 'PAYMENT_GATEWAY_HTTP_ERROR', 502, {
      status: response.status,
      errors: payload?.errors || null
    });
  }
  return payload;
}

async function createCheckoutTarget({ rawToken, callbackToken, reservation, context = 'patient', req, patient = {} }) {
  const provider = configuredProvider();
  if (provider === 'sandbox') {
    if (!isSandboxEnabled()) {
      throw new PaymentGatewayError('پرداخت آزمایشی در این محیط فعال نیست', 'SANDBOX_PAYMENT_DISABLED', 503);
    }
    return {
      provider,
      redirect_url: buildSandboxCheckoutUrl(rawToken, context),
      gateway_url: null,
      authority: null,
      request_payload: { mode: 'sandbox' },
      response_payload: { mode: 'sandbox' }
    };
  }

  if (provider !== 'zarinpal') {
    throw new PaymentGatewayError('ارائه‌دهنده درگاه پرداخت در تنظیمات سرور پشتیبانی نمی‌شود', 'PAYMENT_PROVIDER_NOT_SUPPORTED', 503);
  }

  const callbackUrl = `${publicBaseUrl(req)}/api/appointments/payment/zarinpal/callback?state=${encodeURIComponent(callbackToken)}`;
  const amount = Math.round(Number(reservation?.amount || 0));
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new PaymentGatewayError('مبلغ پرداخت معتبر نیست', 'INVALID_PAYMENT_AMOUNT', 409);
  }

  const requestPayload = {
    merchant_id: zarinpalMerchantId(),
    amount,
    currency: 'IRT',
    callback_url: callbackUrl,
    description: String(reservation?.description || `رزرو نوبت کلینیک چشم‌پزشکی - درخواست ${reservation?.id || ''}`).slice(0, 255),
    metadata: {
      ...(patient?.mobile ? { mobile: String(patient.mobile).slice(0, 20) } : {}),
      ...(patient?.email ? { email: String(patient.email).slice(0, 200) } : {}),
      order_id: String(reservation?.id || '')
    }
  };

  const payload = await postJson(ZARINPAL_REQUEST_URL, requestPayload, process.env.PAYMENT_GATEWAY_TIMEOUT_MS);
  const code = Number(payload?.data?.code);
  const authority = String(payload?.data?.authority || '').trim();
  if (code !== 100 || !authority) {
    const providerCode = Number(payload?.errors?.code || code || 0);
    throw new PaymentGatewayError('زرین‌پال امکان شروع این پرداخت را نداد', 'ZARINPAL_REQUEST_REJECTED', 502, {
      provider_code: providerCode,
      provider_message: payload?.errors?.message || payload?.data?.message || null
    });
  }

  return {
    provider,
    redirect_url: buildSandboxCheckoutUrl(rawToken, context),
    gateway_url: zarinpalCheckoutUrl(authority),
    authority,
    request_payload: { ...requestPayload, merchant_id: '[محافظت‌شده]' },
    response_payload: payload
  };
}

async function verifyZarinpalPayment({ authority, amount }) {
  const cleanAuthority = String(authority || '').trim();
  const cleanAmount = Math.round(Number(amount || 0));
  if (!cleanAuthority || !Number.isSafeInteger(cleanAmount) || cleanAmount <= 0) {
    throw new PaymentGatewayError('اطلاعات بازگشت پرداخت کامل نیست', 'INVALID_ZARINPAL_VERIFICATION_INPUT', 400);
  }

  const requestPayload = {
    merchant_id: zarinpalMerchantId(),
    amount: cleanAmount,
    authority: cleanAuthority
  };
  const payload = await postJson(ZARINPAL_VERIFY_URL, requestPayload, process.env.PAYMENT_GATEWAY_TIMEOUT_MS);
  const code = Number(payload?.data?.code);
  if (![100, 101].includes(code)) {
    throw new PaymentGatewayError('پرداخت توسط زرین‌پال تأیید نشد', 'ZARINPAL_PAYMENT_NOT_VERIFIED', 409, {
      provider_code: Number(payload?.errors?.code || code || 0),
      provider_message: payload?.errors?.message || payload?.data?.message || null
    });
  }

  const reference = String(payload?.data?.ref_id || '').trim();
  if (!reference) {
    throw new PaymentGatewayError('شماره مرجع پرداخت از زرین‌پال دریافت نشد', 'ZARINPAL_REFERENCE_MISSING', 409);
  }

  return {
    verified: true,
    provider: 'zarinpal',
    authority: cleanAuthority,
    reference,
    receipt_number: `ZP-${reference}`,
    verified_amount: cleanAmount,
    verified_at: new Date(),
    idempotent: code === 101,
    response_payload: {
      code,
      message: payload?.data?.message || (code === 101 ? 'تراکنش قبلاً تأیید شده است' : 'پرداخت تأیید شد'),
      ref_id: reference,
      card_pan: payload?.data?.card_pan || null,
      fee_type: payload?.data?.fee_type || null,
      fee: Number(payload?.data?.fee || 0),
      currency: 'IRT'
    }
  };
}

function randomDigits(length) {
  let output = '';
  while (output.length < length) output += String(crypto.randomInt(0, 10));
  return output.slice(0, length);
}

function trustedSandboxVerification({ reservationId, amount }) {
  if (!isSandboxEnabled()) {
    throw new PaymentGatewayError('پرداخت آزمایشی در این محیط فعال نیست', 'SANDBOX_PAYMENT_DISABLED', 403);
  }
  const token = crypto.randomBytes(8).toString('hex').toUpperCase();
  const verifiedAt = new Date();
  return {
    verified: true,
    provider: 'sandbox',
    authority: `SANDBOX-${reservationId}-${Date.now()}`,
    reference: `NVTEST-${token}`,
    receipt_number: `TEST-${verifiedAt.toISOString().slice(0, 10).replace(/-/g, '')}-${token}`,
    verified_amount: Number(amount),
    verified_at: verifiedAt,
    response_payload: {
      mode: 'sandbox', result: 'APPROVED', result_message: 'تراکنش آزمایشی با موفقیت تأیید شد',
      bank_name: 'درگاه آزمایشی کلینیک', terminal_id: 'NV-SANDBOX-01',
      trace_number: randomDigits(8), rrn: randomDigits(12), approval_code: randomDigits(6),
      settlement_status: 'ثبت آزمایشی موفق', currency: 'IRT', no_card_data_collected: true
    }
  };
}

function assertVerifiedResult(result, expectedAmount) {
  if (!result || result.verified !== true) {
    throw new PaymentGatewayError('پرداخت توسط درگاه تأیید نشد', 'PAYMENT_NOT_VERIFIED', 409);
  }
  const verifiedAmount = Number(result.verified_amount);
  const expected = Number(expectedAmount);
  if (!Number.isFinite(verifiedAmount) || verifiedAmount !== expected) {
    throw new PaymentGatewayError('مبلغ تأییدشده درگاه با مبلغ نوبت یکسان نیست', 'PAYMENT_AMOUNT_MISMATCH', 409);
  }
  if (!result.provider || !result.authority || !result.reference) {
    throw new PaymentGatewayError('اطلاعات تأیید درگاه کامل نیست', 'PAYMENT_VERIFICATION_INCOMPLETE', 409);
  }
  return result;
}

module.exports = {
  PaymentGatewayError,
  configuredProvider,
  isSandboxEnabled,
  buildSandboxCheckoutUrl,
  zarinpalCheckoutUrl,
  createCheckoutTarget,
  verifyZarinpalPayment,
  trustedSandboxVerification,
  assertVerifiedResult
};
