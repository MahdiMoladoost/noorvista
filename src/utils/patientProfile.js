'use strict';

const toEnglishDigits = value => String(value || '')
  .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
  .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));

const normalizePatientPhone = value => {
  let digits = toEnglishDigits(value).replace(/\D/g, '');
  if (digits.startsWith('0098')) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith('98') && digits.length === 12) digits = `0${digits.slice(2)}`;
  else if (digits.startsWith('9') && digits.length === 10) digits = `0${digits}`;
  return digits;
};

const cleanText = value => String(value || '').trim();

const normalizePatientPayload = body => ({
  fullName: cleanText(body?.full_name || body?.fullName || body?.fullname).replace(/\s+/g, ' '),
  phone: normalizePatientPhone(body?.phone || body?.mobile),
  email: cleanText(body?.email).toLowerCase(),
  nationalCode: toEnglishDigits(body?.national_code || body?.nationalCode).replace(/\D/g, ''),
  birthDate: cleanText(body?.birth_date || body?.birthDate),
  gender: cleanText(body?.gender).toLowerCase(),
  address: cleanText(body?.address),
  emergencyContactName: cleanText(body?.emergency_contact_name || body?.emergencyContactName),
  emergencyContactPhone: cleanText(toEnglishDigits(body?.emergency_contact_phone || body?.emergencyContactPhone)),
  insuranceProvider: cleanText(body?.insurance_provider || body?.insuranceProvider),
  insuranceNumber: cleanText(toEnglishDigits(body?.insurance_number || body?.insuranceNumber)),
  allergies: cleanText(body?.allergies),
  medications: cleanText(body?.medications),
  chronicDiseases: cleanText(body?.chronic_diseases || body?.chronicDiseases),
  medicalHistory: cleanText(body?.medical_history || body?.medicalHistory),
  notes: cleanText(body?.notes || body?.patient_notes || body?.patientNotes)
});

const patientValidationError = ({
  fullName,
  phone,
  email,
  nationalCode,
  birthDate,
  gender,
  address,
  emergencyContactName = '',
  emergencyContactPhone = '',
  insuranceProvider = '',
  insuranceNumber = '',
  allergies = '',
  medications = '',
  chronicDiseases = '',
  medicalHistory = '',
  notes = ''
}) => {
  if (fullName.length < 2 || fullName.length > 120) return 'نام و نام خانوادگی معتبر وارد کنید';
  if (!/^09\d{9}$/.test(phone)) return 'شماره موبایل باید با ۰۹ شروع شود و ۱۱ رقم باشد';
  if (email && (email.length > 190 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return 'نشانی ایمیل معتبر نیست';
  if (nationalCode && !/^\d{10}$/.test(nationalCode)) return 'کد ملی باید ۱۰ رقم باشد';
  if (birthDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return 'تاریخ تولد معتبر نیست';
    const date = new Date(`${birthDate}T00:00:00Z`);
    const year = Number(birthDate.slice(0, 4));
    if (year < 1900 || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== birthDate || date > new Date()) {
      return 'تاریخ تولد معتبر نیست';
    }
  }
  if (gender && !['male', 'female', 'other'].includes(gender)) return 'جنسیت انتخاب‌شده معتبر نیست';
  if (address.length > 1000) return 'نشانی واردشده بیش از حد طولانی است';
  if (emergencyContactName.length > 150) return 'نام همراه اضطراری بیش از حد طولانی است';
  if (emergencyContactPhone.length > 30) return 'شماره تماس اضطراری بیش از حد طولانی است';
  if (insuranceProvider.length > 120) return 'نام بیمه بیش از حد طولانی است';
  if (insuranceNumber.length > 80) return 'شماره بیمه بیش از حد طولانی است';
  if ([allergies, medications, chronicDiseases, medicalHistory, notes].some(value => value.length > 10000)) {
    return 'یکی از توضیحات پزشکی بیش از حد طولانی است';
  }
  return '';
};

module.exports = {
  toEnglishDigits,
  normalizePatientPhone,
  normalizePatientPayload,
  patientValidationError
};
