'use strict';

const { DEFAULT_TEST_PASSWORD, TEST_ACCOUNTS } = require('../config/test-accounts');

const SEED_PEOPLE = TEST_ACCOUNTS.map(account => ({ ...account }));

const DEFAULT_SERVICES = [
  {
    name: 'معاینه تخصصی چشم‌پزشکی', slug: 'ophthalmology-specialist-exam', category: 'ویزیت و معاینه',
    description: 'معاینه کامل چشم و بررسی اولیه مشکلات بینایی', defaultCapacity: 1,
    defaultDurationMinutes: 20, defaultFee: 500000
  },
  {
    name: 'سنجش فشار چشم', slug: 'eye-pressure-screening', category: 'خدمات تشخیصی',
    description: 'اندازه‌گیری فشار داخل چشم', defaultCapacity: 1,
    defaultDurationMinutes: 15, defaultFee: 300000
  },
  {
    name: 'تصویربرداری شبکیه و OCT', slug: 'retina-oct-imaging', category: 'تصویربرداری',
    description: 'تصویربرداری شبکیه و عصب بینایی', defaultCapacity: 1,
    defaultDurationMinutes: 30, defaultFee: 900000
  },
  {
    name: 'مشاوره جراحی آب‌مروارید', slug: 'cataract-surgery-consultation', category: 'مشاوره جراحی',
    description: 'بررسی و مشاوره پیش از جراحی آب‌مروارید', defaultCapacity: 1,
    defaultDurationMinutes: 30, defaultFee: 650000
  },
  {
    name: 'مشاوره لیزیک و اصلاح دید', slug: 'refractive-surgery-consultation', category: 'مشاوره جراحی',
    description: 'ارزیابی اولیه برای لیزیک و روش‌های اصلاح دید', defaultCapacity: 1,
    defaultDurationMinutes: 30, defaultFee: 700000
  },
  {
    name: 'تزریق داخل چشمی', slug: 'intravitreal-injection', category: 'خدمات درمانی',
    description: 'خدمت درمانی تزریق داخل چشمی طبق دستور پزشک', defaultCapacity: 1,
    defaultDurationMinutes: 20, defaultFee: 1200000
  },
  {
    name: 'پیگیری پس از جراحی چشم', slug: 'ophthalmic-postoperative-followup', category: 'پیگیری درمان',
    description: 'معاینه و پیگیری بیمار پس از جراحی چشم', defaultCapacity: 1,
    defaultDurationMinutes: 15, defaultFee: 350000
  },
  {
    name: 'بررسی خشکی چشم و قرنیه', slug: 'dry-eye-corneal-surface-exam', category: 'ویزیت و معاینه',
    description: 'ارزیابی خشکی چشم و سطح قرنیه', defaultCapacity: 1,
    defaultDurationMinutes: 20, defaultFee: 450000
  }
];

const DEFAULT_CENTERS = [
  {
    name: 'کلینیک چشم پزشکی دکتر محمدصادق حق پرست',
    title: 'کلینیک چشم پزشکی دکتر محمدصادق حق پرست',
    type: 'clinic',
    province: 'تهران',
    city: 'تهران',
    address: 'تهران، کلینیک چشم پزشکی دکتر محمدصادق حق پرست',
    phone: '02100000001',
    description: 'مرکز تخصصی چشم پزشکی برای داده‌های پایه و آزمایشی سامانه'
  },
  {
    name: 'بیمارستان تریتا',
    title: 'بیمارستان تریتا',
    type: 'hospital',
    province: 'تهران',
    city: 'تهران',
    address: 'تهران، بیمارستان تریتا',
    phone: '02100000002',
    description: 'بیمارستان تریتا برای داده‌های پایه و آزمایشی سامانه'
  }
];

module.exports = { DEFAULT_TEST_PASSWORD, SEED_PEOPLE, DEFAULT_SERVICES, DEFAULT_CENTERS };
