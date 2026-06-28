'use strict';

const nodemailer = require('nodemailer');

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_FROM);
}

async function sendPasswordResetEmail({ to, name, resetUrl }) {
  if (!smtpConfigured()) {
    return { success: false, skipped: true, message: 'SMTP is not configured' };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined
  });

  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject: 'بازیابی رمز عبور نورویستا',
    text: `${name || 'کاربر گرامی'}، برای بازیابی رمز عبور از این پیوند استفاده کنید:\n${resetUrl}\nاین پیوند یک‌بارمصرف است و یک ساعت اعتبار دارد.`,
    html: `<div dir="rtl"><p>${name || 'کاربر گرامی'}،</p><p>برای بازیابی رمز عبور روی پیوند زیر کلیک کنید:</p><p><a href="${resetUrl}">بازیابی رمز عبور</a></p><p>این پیوند یک‌بارمصرف است و یک ساعت اعتبار دارد.</p></div>`
  });

  return { success: true, messageId: info.messageId };
}

module.exports = { smtpConfigured, sendPasswordResetEmail };
