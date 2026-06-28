'use strict';

if (!process.argv.includes('--confirm-reset')) {
  console.error('برای جلوگیری از حذف ناخواسته اطلاعات، فرمان باید با گزینه --confirm-reset اجرا شود.');
  process.exit(1);
}

if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
  console.error('پاک‌سازی داده‌های آزمایشی در محیط عملیاتی مجاز نیست.');
  process.exit(1);
}

const { DEFAULT_TEST_PASSWORD } = require('../src/config/test-accounts');

process.env.INIT_DB_PASSWORD_MODE = 'fixed';
process.env.INIT_DB_DEFAULT_PASSWORD = process.env.INIT_DB_DEFAULT_PASSWORD || DEFAULT_TEST_PASSWORD;

const { main } = require('../src/database/init_db');

main().catch((error) => {
  console.error('ایجاد داده‌های آزمایشی ناموفق بود:', error.message);
  process.exit(1);
});
