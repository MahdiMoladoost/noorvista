'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/db');
const smsService = require('../services/smsService');
const emailService = require('../services/emailService');
const mfaService = require('../services/mfaService');
const { JWT_SECRET, cookieOptions, secret } = require('../config/security');

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_TOKEN_DAYS = Math.max(1, Number(process.env.REFRESH_TOKEN_DAYS || 30));
const OTP_PEPPER = secret('OTP_PEPPER');
const PASSWORD_MIN_LENGTH = Math.max(8, Number(process.env.PASSWORD_MIN_LENGTH || 8));

const DATABASE_UNAVAILABLE_CODES = new Set([
  'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH',
  'PROTOCOL_CONNECTION_LOST', 'DB_CONNECTION_TIMEOUT',
  'ER_ACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR'
]);

function isDatabaseUnavailable(error) {
  return DATABASE_UNAVAILABLE_CODES.has(String(error?.code || ''));
}

function databaseUnavailableMessage(error) {
  const code = String(error?.code || '');
  if (code === 'ER_ACCESS_DENIED_ERROR') return 'اتصال به پایگاه داده مجاز نیست؛ نام کاربری و رمز دیتابیس را بررسی کنید.';
  if (code === 'ER_BAD_DB_ERROR') return 'پایگاه داده سامانه پیدا نشد؛ نام DB و اجرای migration را بررسی کنید.';
  return 'سرویس ورود به پایگاه داده متصل نیست؛ MySQL و تنظیمات فایل .env را بررسی کنید.';
}

function normalizePhone(value) {
  return smsService.normalizePhone(value).replace(/^\+98/, '0');
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function hashOtp(phone, code) {
  return crypto.createHmac('sha256', OTP_PEPPER).update(`${normalizePhone(phone)}:${String(code)}`).digest('hex');
}

function safeEqualHex(left, right) {
  if (!left || !right || left.length !== right.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex')); } catch (_) { return false; }
}

function accessTokenMaxAge() {
  const raw = String(JWT_EXPIRES_IN).trim();
  const match = raw.match(/^(\d+)([smhd])$/i);
  if (!match) return 15 * 60 * 1000;
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return Number(match[1]) * multipliers[match[2].toLowerCase()];
}

function generateToken(user, { mfaVerified = false, sessionId } = {}) {
  const sid = Number(sessionId);
  if (!Number.isInteger(sid) || sid <= 0) throw new Error('Active session id is required for access tokens');
  return jwt.sign({
    id: user.id,
    username: user.username,
    role: user.role,
    full_name: user.full_name,
    mfa: Boolean(mfaVerified),
    sid,
    jti: crypto.randomUUID()
  }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN, issuer: 'noorvista', audience: 'noorvista-web' });
}

function setTokenCookie(res, token) {
  res.cookie('token', token, cookieOptions(accessTokenMaxAge()));
}

function clearTokenCookie(res) {
  res.clearCookie('token', cookieOptions(0));
  res.clearCookie('refresh_token', cookieOptions(0, '/api/auth'));
  res.clearCookie('mfa_challenge', cookieOptions(0, '/api/auth'));
}

function getRedirectUrl(role) {
  const redirects = {
    system_admin: '/dashboard/panel/admin/index.html',
    admin: '/dashboard/panel/admin/index.html',
    clinic_admin: '/dashboard/panel/clinic-admin/index.html',
    clinic_manager: '/dashboard/panel/clinic-admin/index.html',
    doctor: '/dashboard/panel/doctor/index.html',
    receptionist: '/dashboard/panel/reception/index.html',
    patient: '/dashboard/panel/patient/index.html'
  };
  return redirects[role] || '/';
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    is_active: Boolean(user.is_active),
    specialty: user.specialty,
    consultation_fee: user.consultation_fee
  };
}

async function createRefreshSession(connection, user, req, familyId = crypto.randomUUID(), mfaVerified = false) {
  const rawToken = crypto.randomBytes(48).toString('base64url');
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 86400000);
  const [result] = await connection.query(
    `INSERT INTO auth_refresh_tokens
      (user_id, token_hash, family_id, expires_at, created_ip, user_agent, mfa_verified, last_used_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
    [user.id, tokenHash, familyId, expiresAt, req.ip || null, String(req.get('user-agent') || '').slice(0, 500) || null, mfaVerified ? 1 : 0]
  );
  return { id: Number(result.insertId), rawToken, tokenHash, familyId, expiresAt };
}

function setRefreshCookie(res, rawToken) {
  res.cookie('refresh_token', rawToken, cookieOptions(REFRESH_TOKEN_DAYS * 86400000, '/api/auth'));
}

function assertStrongPassword(password) {
  const value = String(password || '');
  return value.length >= PASSWORD_MIN_LENGTH && /[A-Za-z\u0600-\u06FF]/.test(value) && /\d/.test(value);
}

const MFA_CHALLENGE_MINUTES = 5;

function setMfaChallengeCookie(res, user, purpose) {
  const token = jwt.sign(
    { id: user.id, role: user.role, purpose, jti: crypto.randomUUID() },
    JWT_SECRET,
    { expiresIn: `${MFA_CHALLENGE_MINUTES}m`, issuer: 'noorvista', audience: 'noorvista-mfa' }
  );
  res.cookie('mfa_challenge', token, cookieOptions(MFA_CHALLENGE_MINUTES * 60_000, '/api/auth'));
}

function clearMfaChallengeCookie(res) {
  res.clearCookie('mfa_challenge', cookieOptions(0, '/api/auth'));
}

async function getMfaRecord(connection, userId) {
  const [rows] = await connection.query(
    'SELECT user_id, secret_encrypted, enabled, enabled_at FROM auth_mfa WHERE user_id = ? LIMIT 1',
    [userId]
  );
  return rows[0] || null;
}

async function completeLogin(pool, user, req, res, { mfaVerified = false } = {}) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);
    const refresh = await createRefreshSession(connection, user, req, crypto.randomUUID(), mfaVerified);
    await connection.commit();
    setTokenCookie(res, generateToken(user, { mfaVerified, sessionId: refresh.id }));
    setRefreshCookie(res, refresh.rawToken);
    clearMfaChallengeCookie(res);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function maybeRequireMfa(pool, user, res) {
  if (!mfaService.isStaffRole(user.role)) return null;
  if (typeof mfaService.isMfaExplicitlyDisabled === 'function' && mfaService.isMfaExplicitlyDisabled()) return null;
  const record = await getMfaRecord(pool, user.id);
  if (record?.enabled) {
    setMfaChallengeCookie(res, user, 'verify');
    return {
      status: 202,
      body: {
        success: true,
        mfa_required: true,
        message: 'کد برنامه احراز هویت یا کد بازیابی را وارد کنید'
      }
    };
  }
  if (mfaService.isMfaRequiredForRole(user.role)) {
    setMfaChallengeCookie(res, user, 'enroll');
    return {
      status: 202,
      body: {
        success: true,
        mfa_setup_required: true,
        message: 'برای ادامه، احراز هویت دومرحله‌ای کارکنان باید فعال شود'
      }
    };
  }
  return null;
}

async function mfaSubject(req, res, next) {
  try {
    let decoded = null;
    const accessToken = req.cookies?.token;
    const challenge = req.cookies?.mfa_challenge;
    if (accessToken) {
      decoded = jwt.verify(accessToken, JWT_SECRET, { issuer: 'noorvista', audience: 'noorvista-web' });
      req.mfaChallengePurpose = null;
    } else if (challenge) {
      decoded = jwt.verify(challenge, JWT_SECRET, { issuer: 'noorvista', audience: 'noorvista-mfa' });
      req.mfaChallengePurpose = decoded.purpose;
    }
    if (!decoded?.id) return res.status(401).json({ success: false, message: 'نشست احراز هویت دومرحله‌ای یافت نشد' });
    const sid = Number(decoded.sid);
    const [users] = accessToken
      ? await db.query(
          `SELECT u.id, u.username, u.full_name, u.email, u.phone, u.role, u.is_active, u.password
           FROM users u JOIN auth_refresh_tokens rt ON rt.user_id = u.id
           WHERE u.id = ? AND rt.id = ? AND rt.revoked_at IS NULL AND rt.expires_at > NOW() LIMIT 1`,
          [decoded.id, Number.isInteger(sid) && sid > 0 ? sid : 0]
        )
      : await db.query(
          'SELECT id, username, full_name, email, phone, role, is_active, password FROM users WHERE id = ? LIMIT 1',
          [decoded.id]
        );
    if (!users[0]?.is_active) return res.status(401).json({ success: false, message: 'حساب کاربری غیرفعال است' });
    req.mfaUser = users[0];
    return next();
  } catch (_) {
    return res.status(401).json({ success: false, message: 'نشست احراز هویت دومرحله‌ای نامعتبر یا منقضی است' });
  }
}

async function login(req, res) {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ success: false, message: 'نام کاربری و رمز عبور الزامی است' });

  try {
    const pool = await db.getPool();
    const [users] = await pool.query(
      `SELECT u.id, u.username, u.password, u.full_name, u.email, u.phone, u.role, u.is_active,
              d.specialty, d.consultation_fee
       FROM users u
       LEFT JOIN doctors d ON u.id = d.user_id
       WHERE u.username = ? OR u.email = ? OR u.phone = ?
       LIMIT 1`,
      [username, username, normalizePhone(username)]
    );

    const user = users[0];
    const isBcrypt = Boolean(user?.password && /^\$2[aby]\$/.test(user.password));
    const valid = isBcrypt ? await bcrypt.compare(String(password), user.password) : false;
    if (!user || !valid) return res.status(401).json({ success: false, message: 'نام کاربری یا رمز عبور اشتباه است' });
    if (!user.is_active) return res.status(401).json({ success: false, message: 'حساب کاربری شما غیرفعال شده است' });

    clearTokenCookie(res);
    const challenge = await maybeRequireMfa(pool, user, res);
    if (challenge) return res.status(challenge.status).json(challenge.body);

    await completeLogin(pool, user, req, res, { mfaVerified: false });
    return res.json({ success: true, message: 'ورود موفقیت‌آمیز بود', user: publicUser(user), redirect: getRedirectUrl(user.role) });
  } catch (error) {
    console.error('Login error:', error.code || 'UNKNOWN', error.message);
    if (isDatabaseUnavailable(error)) {
      return res.status(503).json({
        success: false,
        code: 'DATABASE_UNAVAILABLE',
        message: databaseUnavailableMessage(error)
      });
    }
    return res.status(500).json({ success: false, code: 'LOGIN_FAILED', message: 'خطا در ورود؛ اجرای migrationهای امنیتی را بررسی کنید' });
  }
}

async function logout(req, res) {
  try {
    const raw = req.cookies?.refresh_token;
    if (raw) {
      const pool = await db.getPool();
      await pool.query('UPDATE auth_refresh_tokens SET revoked_at = COALESCE(revoked_at, NOW()) WHERE token_hash = ?', [sha256(raw)]);
    }
  } catch (error) {
    console.error('Logout revoke error:', error.message);
  }
  clearTokenCookie(res);
  return res.json({ success: true, message: 'با موفقیت خارج شدید' });
}

async function getMe(req, res) {
  try {
    const [users] = await db.query(
      `SELECT u.id, u.username, u.full_name, u.email, u.phone, u.role, u.is_active, u.last_login,
              d.specialty, d.sub_specialty, d.license_number, d.experience_years, d.bio, d.consultation_fee,
              p.national_code, p.birth_date, p.gender, p.blood_type, p.allergies, p.chronic_diseases, p.address
       FROM users u
       LEFT JOIN doctors d ON u.id = d.user_id
       LEFT JOIN patients p ON u.id = p.user_id
       WHERE u.id = ? LIMIT 1`,
      [req.user.id]
    );
    if (!users.length) return res.status(404).json({ success: false, message: 'کاربر یافت نشد' });
    return res.json({ success: true, user: users[0] });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'خطا در دریافت اطلاعات کاربر' });
  }
}

async function updateProfile(req, res) {
  try {
    const userId = req.user.id;
    const fullName = String(req.body.full_name || req.body.fullname || req.body.name || '').trim();
    const email = String(req.body.email || '').trim() || null;
    const phone = normalizePhone(req.body.phone || req.body.mobile || '') || null;
    if (!fullName) return res.status(400).json({ success: false, message: 'نام و نام خانوادگی الزامی است' });

    if (email) {
      const [duplicates] = await db.query('SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1', [email, userId]);
      if (duplicates.length) return res.status(409).json({ success: false, message: 'این ایمیل قبلاً ثبت شده است' });
    }
    if (phone) {
      const [duplicates] = await db.query('SELECT id FROM users WHERE phone = ? AND id <> ? LIMIT 1', [phone, userId]);
      if (duplicates.length) return res.status(409).json({ success: false, message: 'این شماره تلفن قبلاً ثبت شده است' });
    }

    await db.query('UPDATE users SET full_name = ?, email = ?, phone = ?, updated_at = NOW() WHERE id = ?', [fullName, email, phone, userId]);
    const [users] = await db.query('SELECT id, username, full_name, email, phone, role, is_active FROM users WHERE id = ? LIMIT 1', [userId]);
    return res.json({ success: true, message: 'اطلاعات حساب ذخیره شد', user: users[0] });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'خطا در ویرایش اطلاعات حساب' });
  }
}

async function changePassword(req, res) {
  const { old_password, new_password, confirm_password } = req.body || {};
  if (!old_password || !new_password || !confirm_password) return res.status(400).json({ success: false, message: 'تمام فیلدها الزامی است' });
  if (new_password !== confirm_password) return res.status(400).json({ success: false, message: 'رمز جدید و تکرار آن یکسان نیست' });
  if (!assertStrongPassword(new_password)) return res.status(400).json({ success: false, message: `رمز عبور باید حداقل ${PASSWORD_MIN_LENGTH} کاراکتر و شامل حرف و عدد باشد` });

  try {
    const pool = await db.getPool();
    const [users] = await pool.query('SELECT password FROM users WHERE id = ? LIMIT 1', [req.user.id]);
    const stored = users[0]?.password;
    const valid = stored && /^\$2[aby]\$/.test(stored) && await bcrypt.compare(String(old_password), stored);
    if (!valid) return res.status(401).json({ success: false, message: 'رمز عبور فعلی اشتباه است' });

    const hashed = await bcrypt.hash(String(new_password), 12);
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query('UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?', [hashed, req.user.id]);
      await connection.query('UPDATE auth_refresh_tokens SET revoked_at = COALESCE(revoked_at, NOW()) WHERE user_id = ?', [req.user.id]);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }

    clearTokenCookie(res);
    return res.json({ success: true, message: 'رمز عبور تغییر کرد؛ دوباره وارد شوید' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'خطا در تغییر رمز عبور' });
  }
}

async function forgotPassword(req, res) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const generic = { success: true, message: 'در صورت وجود حساب کاربری، لینک بازیابی ارسال خواهد شد' };
  if (!email) return res.status(400).json({ success: false, message: 'ایمیل الزامی است' });

  try {
    const pool = await db.getPool();
    const [users] = await pool.query('SELECT id, full_name, email FROM users WHERE LOWER(email) = ? AND is_active = 1 LIMIT 1', [email]);
    if (!users.length) return res.json(generic);

    const rawToken = crypto.randomBytes(32).toString('base64url');
    await pool.query('UPDATE password_reset_tokens SET used_at = COALESCE(used_at, NOW()) WHERE user_id = ? AND used_at IS NULL', [users[0].id]);
    await pool.query(
      'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, requested_ip) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR), ?)',
      [users[0].id, sha256(rawToken), req.ip || null]
    );

    const baseUrl = String(process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
    const sent = await emailService.sendPasswordResetEmail({ to: users[0].email, name: users[0].full_name, resetUrl });
    if (!sent.success) console.warn('[auth] Password reset token created but SMTP is not configured.');
    return res.json(generic);
  } catch (error) {
    console.error('Forgot password error:', error.message);
    return res.json(generic);
  }
}

async function resetPassword(req, res) {
  const { token, new_password, confirm_password } = req.body || {};
  if (!token || !new_password || !confirm_password) return res.status(400).json({ success: false, message: 'تمام فیلدها الزامی است' });
  if (new_password !== confirm_password) return res.status(400).json({ success: false, message: 'رمز جدید و تکرار آن یکسان نیست' });
  if (!assertStrongPassword(new_password)) return res.status(400).json({ success: false, message: `رمز عبور باید حداقل ${PASSWORD_MIN_LENGTH} کاراکتر و شامل حرف و عدد باشد` });

  const pool = await db.getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT id, user_id FROM password_reset_tokens
       WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()
       LIMIT 1 FOR UPDATE`,
      [sha256(token)]
    );
    if (!rows.length) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'پیوند بازیابی نامعتبر یا منقضی شده است' });
    }

    const hashed = await bcrypt.hash(String(new_password), 12);
    await connection.query('UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?', [hashed, rows[0].user_id]);
    await connection.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?', [rows[0].id]);
    await connection.query('UPDATE auth_refresh_tokens SET revoked_at = COALESCE(revoked_at, NOW()) WHERE user_id = ?', [rows[0].user_id]);
    await connection.commit();
    clearTokenCookie(res);
    return res.json({ success: true, message: 'رمز عبور با موفقیت بازنشانی شد' });
  } catch (error) {
    await connection.rollback();
    console.error('Reset password error:', error.message);
    return res.status(500).json({ success: false, message: 'خطا در بازنشانی رمز عبور' });
  } finally { connection.release(); }
}

async function refreshToken(req, res) {
  const rawToken = req.cookies?.refresh_token;
  if (!rawToken) return res.status(401).json({ success: false, message: 'نشست قابل تمدید یافت نشد' });

  const pool = await db.getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const tokenHash = sha256(rawToken);
    const [tokens] = await connection.query(
      `SELECT * FROM auth_refresh_tokens WHERE token_hash = ? LIMIT 1 FOR UPDATE`,
      [tokenHash]
    );
    const current = tokens[0];
    if (!current || current.revoked_at || new Date(current.expires_at).getTime() <= Date.now()) {
      if (current?.family_id) await connection.query('UPDATE auth_refresh_tokens SET revoked_at = COALESCE(revoked_at, NOW()) WHERE family_id = ?', [current.family_id]);
      await connection.commit();
      clearTokenCookie(res);
      return res.status(401).json({ success: false, message: 'نشست نامعتبر یا منقضی شده است' });
    }

    const [users] = await connection.query('SELECT id, username, full_name, email, phone, role, is_active FROM users WHERE id = ? LIMIT 1', [current.user_id]);
    const user = users[0];
    if (!user?.is_active) {
      await connection.query('UPDATE auth_refresh_tokens SET revoked_at = NOW() WHERE family_id = ?', [current.family_id]);
      await connection.commit();
      clearTokenCookie(res);
      return res.status(401).json({ success: false, message: 'حساب کاربری غیرفعال است' });
    }
    if (mfaService.isMfaRequiredForRole(user.role) && !current.mfa_verified) {
      await connection.query(
        "UPDATE auth_refresh_tokens SET revoked_at = COALESCE(revoked_at, NOW()), revoked_reason = 'mfa_required' WHERE family_id = ?",
        [current.family_id]
      );
      await connection.commit();
      clearTokenCookie(res);
      return res.status(401).json({ success: false, mfa_required: true, message: 'ورود دومرحله‌ای مجدد الزامی است' });
    }

    const next = await createRefreshSession(connection, user, req, current.family_id, Boolean(current.mfa_verified));
    await connection.query('UPDATE auth_refresh_tokens SET revoked_at = NOW(), replaced_by_hash = ? WHERE id = ?', [next.tokenHash, current.id]);
    await connection.commit();
    setTokenCookie(res, generateToken(user, { mfaVerified: Boolean(current.mfa_verified), sessionId: next.id }));
    setRefreshCookie(res, next.rawToken);
    return res.json({ success: true, user: publicUser(user) });
  } catch (error) {
    await connection.rollback();
    console.error('Refresh token error:', error.message);
    clearTokenCookie(res);
    return res.status(401).json({ success: false, message: 'تمدید نشست ناموفق بود' });
  } finally { connection.release(); }
}

async function checkAuth(req, res) {
  const token = req.cookies?.token;
  if (!token) return res.json({ authenticated: false });
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { issuer: 'noorvista', audience: 'noorvista-web' });
    const sid = Number(decoded.sid);
    if (!Number.isInteger(sid) || sid <= 0) return res.json({ authenticated: false });
    const [users] = await db.query(
      `SELECT u.id, u.username, u.full_name, u.role, u.is_active
       FROM users u JOIN auth_refresh_tokens rt ON rt.user_id = u.id
       WHERE u.id = ? AND rt.id = ? AND rt.revoked_at IS NULL AND rt.expires_at > NOW() LIMIT 1`,
      [decoded.id, sid]
    );
    const user = users[0];
    if (!user?.is_active) return res.json({ authenticated: false });
    if (mfaService.isMfaRequiredForRole(user.role) && decoded.mfa !== true) {
      return res.json({ authenticated: false, mfa_required: true });
    }
    return res.json({ authenticated: true, user });
  } catch (_) {
    return res.json({ authenticated: false });
  }
}

async function requestOTP(req, res) {
  const phone = normalizePhone(req.body?.phone);
  const generic = { success: true, message: 'در صورت وجود حساب، کد تأیید ارسال خواهد شد' };
  if (!phone) return res.status(400).json({ success: false, message: 'شماره تلفن الزامی است' });

  try {
    const pool = await db.getPool();
    const [users] = await pool.query('SELECT id FROM users WHERE phone = ? AND is_active = 1 LIMIT 1', [phone]);
    if (!users.length) return res.json(generic);

    const [recent] = await pool.query('SELECT created_at FROM auth_otp_codes WHERE phone = ? ORDER BY id DESC LIMIT 1', [phone]);
    if (recent.length && Date.now() - new Date(recent[0].created_at).getTime() < 60_000) {
      return res.status(429).json({ success: false, message: 'برای درخواست کد جدید کمی صبر کنید' });
    }

    const code = String(crypto.randomInt(100000, 1000000));
    await pool.query(
      `INSERT INTO auth_otp_codes (phone, code_hash, expires_at, requested_ip)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE), ?)`,
      [phone, hashOtp(phone, code), req.ip || null]
    );
    const sent = await smsService.sendOtpSms(pool, { receptor: phone, code });
    if (!sent.success) return res.status(503).json({ success: false, message: 'سرویس پیامک آماده نیست؛ ورود با رمز عبور را استفاده کنید' });
    return res.json(generic);
  } catch (error) {
    console.error('Request OTP error:', error.message);
    return res.status(500).json({ success: false, message: 'خطا در ارسال کد تأیید' });
  }
}

async function verifyOTP(req, res) {
  const phone = normalizePhone(req.body?.phone);
  const code = String(req.body?.code || '').trim();
  if (!phone || !/^\d{6}$/.test(code)) return res.status(400).json({ success: false, message: 'شماره تلفن و کد شش‌رقمی الزامی است' });

  const pool = await db.getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [codes] = await connection.query(
      `SELECT * FROM auth_otp_codes
       WHERE phone = ? AND used_at IS NULL AND expires_at > NOW()
       ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [phone]
    );
    const otp = codes[0];
    if (!otp || Number(otp.attempts) >= 5 || !safeEqualHex(otp.code_hash, hashOtp(phone, code))) {
      if (otp) await connection.query('UPDATE auth_otp_codes SET attempts = attempts + 1 WHERE id = ?', [otp.id]);
      await connection.commit();
      return res.status(401).json({ success: false, message: 'کد نامعتبر یا منقضی شده است' });
    }

    const [users] = await connection.query('SELECT id, username, full_name, email, phone, role, is_active FROM users WHERE phone = ? LIMIT 1', [phone]);
    const user = users[0];
    if (!user?.is_active) {
      await connection.rollback();
      return res.status(401).json({ success: false, message: 'حساب کاربری غیرفعال است' });
    }

    await connection.query('UPDATE auth_otp_codes SET used_at = NOW() WHERE id = ?', [otp.id]);
    await connection.commit();

    clearTokenCookie(res);
    const challenge = await maybeRequireMfa(pool, user, res);
    if (challenge) return res.status(challenge.status).json(challenge.body);

    await completeLogin(pool, user, req, res, { mfaVerified: false });
    return res.json({ success: true, message: 'ورود موفقیت‌آمیز بود', user: publicUser(user), redirect: getRedirectUrl(user.role) });
  } catch (error) {
    await connection.rollback();
    console.error('Verify OTP error:', error.message);
    return res.status(500).json({ success: false, message: 'خطا در تأیید کد' });
  } finally { connection.release(); }
}


async function requestPasswordResetOtp(req, res) {
  const phone = normalizePhone(req.body?.phone);
  const generic = { success: true, message: 'اگر حساب فعالی با این شماره وجود داشته باشد، کد بازیابی ارسال می‌شود' };
  if (!phone) return res.status(400).json({ success: false, message: 'شماره موبایل الزامی است' });

  try {
    const pool = await db.getPool();
    const [users] = await pool.query('SELECT id, role, is_active FROM users WHERE phone = ? AND is_active = 1 LIMIT 1', [phone]);
    if (!users.length) return res.json(generic);

    const [recent] = await pool.query('SELECT created_at FROM auth_otp_codes WHERE phone = ? ORDER BY id DESC LIMIT 1', [phone]);
    if (recent.length && Date.now() - new Date(recent[0].created_at).getTime() < 60_000) {
      return res.status(429).json({ success: false, message: 'برای درخواست کد جدید کمی صبر کنید' });
    }

    const code = String(crypto.randomInt(100000, 1000000));
    await pool.query(
      `INSERT INTO auth_otp_codes (phone, code_hash, expires_at, requested_ip)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE), ?)`,
      [phone, hashOtp(phone, code), req.ip || null]
    );

    const sent = await smsService.sendOtpSms(pool, { receptor: phone, code });
    if (!sent.success) return res.status(503).json({ success: false, message: 'سرویس پیامک آماده نیست؛ از مدیر سامانه درخواست بازنشانی رمز کنید' });
    return res.json(generic);
  } catch (error) {
    console.error('Request password reset OTP error:', error.message);
    return res.status(500).json({ success: false, message: 'خطا در ارسال کد بازیابی' });
  }
}


async function verifyPasswordResetOtp(req, res) {
  const phone = normalizePhone(req.body?.phone);
  const code = String(req.body?.code || '').trim();
  if (!phone || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ success: false, message: 'شماره موبایل و کد شش‌رقمی الزامی است' });
  }

  const pool = await db.getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [codes] = await connection.query(
      `SELECT * FROM auth_otp_codes
       WHERE phone = ? AND used_at IS NULL AND expires_at > NOW()
       ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [phone]
    );
    const otp = codes[0];
    if (!otp || Number(otp.attempts) >= 5 || !safeEqualHex(otp.code_hash, hashOtp(phone, code))) {
      if (otp) await connection.query('UPDATE auth_otp_codes SET attempts = attempts + 1 WHERE id = ?', [otp.id]);
      await connection.commit();
      return res.status(401).json({ success: false, message: 'کد نامعتبر یا منقضی شده است' });
    }

    const [users] = await connection.query('SELECT id, is_active FROM users WHERE phone = ? AND is_active = 1 LIMIT 1 FOR UPDATE', [phone]);
    const user = users[0];
    if (!user?.is_active) {
      await connection.rollback();
      return res.status(401).json({ success: false, message: 'حساب کاربری فعال پیدا نشد' });
    }

    const rawToken = crypto.randomBytes(32).toString('base64url');
    await connection.query('UPDATE password_reset_tokens SET used_at = COALESCE(used_at, NOW()) WHERE user_id = ? AND used_at IS NULL', [user.id]);
    await connection.query(
      'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, requested_ip) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE), ?)',
      [user.id, sha256(rawToken), req.ip || null]
    );
    await connection.query('UPDATE auth_otp_codes SET used_at = NOW() WHERE id = ?', [otp.id]);
    await connection.commit();
    return res.json({ success: true, reset_token: rawToken, message: 'کد تأیید شد؛ رمز جدید را وارد کنید' });
  } catch (error) {
    await connection.rollback();
    console.error('Verify password reset OTP error:', error.message);
    return res.status(500).json({ success: false, message: 'خطا در تأیید کد بازیابی' });
  } finally {
    connection.release();
  }
}


async function confirmPasswordResetOtp(req, res) {
  const { reset_token, new_password, confirm_password } = req.body || {};
  if (!reset_token || !new_password || !confirm_password) {
    return res.status(400).json({ success: false, message: 'توکن بازیابی، رمز جدید و تکرار رمز الزامی است' });
  }
  if (new_password !== confirm_password) return res.status(400).json({ success: false, message: 'رمز جدید و تکرار آن یکسان نیست' });
  if (!assertStrongPassword(new_password)) return res.status(400).json({ success: false, message: `رمز عبور باید حداقل ${PASSWORD_MIN_LENGTH} کاراکتر و شامل حرف و عدد باشد` });

  const pool = await db.getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [tokens] = await connection.query(
      `SELECT id, user_id FROM password_reset_tokens
       WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()
       LIMIT 1 FOR UPDATE`,
      [sha256(reset_token)]
    );
    const token = tokens[0];
    if (!token) {
      await connection.rollback();
      return res.status(401).json({ success: false, message: 'مجوز بازیابی نامعتبر یا منقضی شده است' });
    }

    const [users] = await connection.query('SELECT id, is_active FROM users WHERE id = ? AND is_active = 1 LIMIT 1 FOR UPDATE', [token.user_id]);
    const user = users[0];
    if (!user?.is_active) {
      await connection.rollback();
      return res.status(401).json({ success: false, message: 'حساب کاربری فعال پیدا نشد' });
    }

    const hashed = await bcrypt.hash(String(new_password), 12);
    await connection.query('UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?', [hashed, user.id]);
    await connection.query('UPDATE auth_refresh_tokens SET revoked_at = COALESCE(revoked_at, NOW()) WHERE user_id = ?', [user.id]);
    await connection.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?', [token.id]);
    await connection.commit();
    clearTokenCookie(res);
    return res.json({ success: true, message: 'رمز عبور با موفقیت تغییر کرد؛ اکنون با رمز جدید وارد شوید' });
  } catch (error) {
    await connection.rollback();
    console.error('Confirm password reset token error:', error.message);
    return res.status(500).json({ success: false, message: 'خطا در بازنشانی رمز عبور' });
  } finally {
    connection.release();
  }
}


async function getTwoFactorStatus(req, res) {
  try {
    const user = req.mfaUser || req.user;
    const record = await getMfaRecord(await db.getPool(), user.id);
    return res.json({
      success: true,
      enabled: Boolean(record?.enabled),
      required: mfaService.isMfaRequiredForRole(user.role),
      enabled_at: record?.enabled_at || null
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'خطا در دریافت وضعیت احراز هویت دومرحله‌ای' });
  }
}

async function setupTwoFactor(req, res) {
  const user = req.mfaUser || req.user;
  if (!user) return res.status(401).json({ success: false, message: 'احراز هویت نشده است' });

  const pool = await db.getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [users] = await connection.query(
      'SELECT password FROM users WHERE id = ? LIMIT 1 FOR UPDATE',
      [user.id]
    );
    const existing = await getMfaRecord(connection, user.id);

    // یک نشست دزدیده‌شده نباید بتواند Secret فعال 2FA را بی‌صدا جایگزین کند.
    // راه‌اندازی مجدد فقط با رمز عبور و کد فعلی (یا Recovery Code) مجاز است.
    if (existing?.enabled) {
      const password = String(req.body?.password || '');
      const currentCode = String(req.body?.current_code || '').trim();
      if (!password || !currentCode) {
        await connection.rollback();
        return res.status(409).json({
          success: false,
          code: 'MFA_REENROLLMENT_REAUTH_REQUIRED',
          message: 'برای راه‌اندازی مجدد، رمز عبور و کد دومرحله‌ای فعلی الزامی است'
        });
      }
      if (!users[0]?.password || !await bcrypt.compare(password, users[0].password)) {
        await connection.rollback();
        return res.status(401).json({ success: false, message: 'رمز عبور نادرست است' });
      }
      const currentVerified = /^\d{6}$/.test(currentCode)
        ? mfaService.verifyTotp(mfaService.decryptSecret(existing.secret_encrypted), currentCode)
        : await consumeRecoveryCode(connection, user.id, currentCode);
      if (!currentVerified) {
        await connection.rollback();
        return res.status(401).json({ success: false, message: 'کد دومرحله‌ای فعلی نامعتبر است' });
      }
    }

    const secretValue = mfaService.generateSecret();
    const encrypted = mfaService.encryptSecret(secretValue);
    await connection.query(
      `INSERT INTO auth_mfa (user_id, secret_encrypted, enabled, created_at, updated_at)
       VALUES (?, ?, 0, NOW(), NOW())
       ON DUPLICATE KEY UPDATE secret_encrypted = VALUES(secret_encrypted), enabled = 0,
         enabled_at = NULL, updated_at = NOW()`,
      [user.id, encrypted]
    );
    await connection.query('DELETE FROM auth_mfa_recovery_codes WHERE user_id = ?', [user.id]);
    await connection.commit();
    return res.json({
      success: true,
      secret: secretValue,
      otpauth_uri: mfaService.otpauthUri({ secretValue, username: user.username || user.email || String(user.id) }),
      message: 'کلید را در برنامه احراز هویت ثبت کنید و سپس کد شش‌رقمی را تأیید کنید'
    });
  } catch (error) {
    await connection.rollback();
    console.error('MFA setup error:', error.message);
    return res.status(500).json({ success: false, message: 'خطا در ایجاد تنظیمات احراز هویت دومرحله‌ای' });
  } finally {
    connection.release();
  }
}

async function enableTwoFactor(req, res) {
  const user = req.mfaUser || req.user;
  const code = String(req.body?.code || '').trim();
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ success: false, message: 'کد شش‌رقمی معتبر وارد کنید' });

  const pool = await db.getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const record = await getMfaRecord(connection, user.id);
    if (!record?.secret_encrypted) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'ابتدا راه‌اندازی احراز هویت دومرحله‌ای را آغاز کنید' });
    }
    const secretValue = mfaService.decryptSecret(record.secret_encrypted);
    if (!mfaService.verifyTotp(secretValue, code)) {
      await connection.rollback();
      return res.status(401).json({ success: false, message: 'کد احراز هویت نامعتبر است' });
    }

    const recoveryCodes = mfaService.generateRecoveryCodes();
    await connection.query('UPDATE auth_mfa SET enabled = 1, enabled_at = NOW(), updated_at = NOW() WHERE user_id = ?', [user.id]);
    await connection.query('DELETE FROM auth_mfa_recovery_codes WHERE user_id = ?', [user.id]);
    for (const recoveryCode of recoveryCodes) {
      await connection.query(
        'INSERT INTO auth_mfa_recovery_codes (user_id, code_hash) VALUES (?, ?)',
        [user.id, mfaService.recoveryHash(user.id, recoveryCode)]
      );
    }
    await connection.commit();

    if (req.mfaChallengePurpose === 'enroll') {
      await completeLogin(pool, user, req, res, { mfaVerified: true });
    }
    return res.json({
      success: true,
      enabled: true,
      recovery_codes: recoveryCodes,
      redirect: req.mfaChallengePurpose === 'enroll' ? getRedirectUrl(user.role) : undefined,
      message: 'احراز هویت دومرحله‌ای فعال شد؛ کدهای بازیابی را فقط یک‌بار و در محل امن ذخیره کنید'
    });
  } catch (error) {
    await connection.rollback();
    console.error('MFA enable error:', error.message);
    return res.status(500).json({ success: false, message: 'خطا در فعال‌سازی احراز هویت دومرحله‌ای' });
  } finally {
    connection.release();
  }
}

async function consumeRecoveryCode(connection, userId, code) {
  const hash = mfaService.recoveryHash(userId, code);
  const [rows] = await connection.query(
    `SELECT id FROM auth_mfa_recovery_codes
     WHERE user_id = ? AND code_hash = ? AND used_at IS NULL
     LIMIT 1 FOR UPDATE`,
    [userId, hash]
  );
  if (!rows.length) return false;
  await connection.query('UPDATE auth_mfa_recovery_codes SET used_at = NOW() WHERE id = ?', [rows[0].id]);
  return true;
}

async function verifyTwoFactorLogin(req, res) {
  const challenge = req.cookies?.mfa_challenge;
  const code = String(req.body?.code || '').trim();
  if (!challenge || !code) return res.status(400).json({ success: false, message: 'کد احراز هویت الزامی است' });

  let decoded;
  try {
    decoded = jwt.verify(challenge, JWT_SECRET, { issuer: 'noorvista', audience: 'noorvista-mfa' });
  } catch (_) {
    clearMfaChallengeCookie(res);
    return res.status(401).json({ success: false, message: 'درخواست احراز هویت منقضی یا نامعتبر است' });
  }
  if (decoded.purpose !== 'verify') return res.status(409).json({ success: false, message: 'ابتدا احراز هویت دومرحله‌ای را فعال کنید' });

  const pool = await db.getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [users] = await connection.query(
      'SELECT id, username, full_name, email, phone, role, is_active FROM users WHERE id = ? LIMIT 1 FOR UPDATE',
      [decoded.id]
    );
    const user = users[0];
    if (!user?.is_active) {
      await connection.rollback();
      return res.status(401).json({ success: false, message: 'حساب کاربری غیرفعال است' });
    }
    const record = await getMfaRecord(connection, user.id);
    if (!record?.enabled) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'احراز هویت دومرحله‌ای فعال نیست' });
    }

    let verified = false;
    if (/^\d{6}$/.test(code)) {
      verified = mfaService.verifyTotp(mfaService.decryptSecret(record.secret_encrypted), code);
    } else {
      verified = await consumeRecoveryCode(connection, user.id, code);
    }
    if (!verified) {
      await connection.rollback();
      return res.status(401).json({ success: false, message: 'کد احراز هویت یا بازیابی نامعتبر است' });
    }
    await connection.commit();
    await completeLogin(pool, user, req, res, { mfaVerified: true });
    return res.json({ success: true, user: publicUser(user), redirect: getRedirectUrl(user.role), message: 'ورود دومرحله‌ای موفق بود' });
  } catch (error) {
    await connection.rollback();
    console.error('MFA login verify error:', error.message);
    return res.status(500).json({ success: false, message: 'خطا در تأیید احراز هویت دومرحله‌ای' });
  } finally {
    connection.release();
  }
}

async function disableTwoFactor(req, res) {
  const user = req.user;
  const password = String(req.body?.password || '');
  const code = String(req.body?.code || '').trim();
  if (!password || !code) return res.status(400).json({ success: false, message: 'رمز عبور و کد دومرحله‌ای الزامی است' });

  const pool = await db.getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [users] = await connection.query('SELECT password FROM users WHERE id = ? LIMIT 1 FOR UPDATE', [user.id]);
    const passwordHash = users[0]?.password;
    if (!passwordHash || !await bcrypt.compare(password, passwordHash)) {
      await connection.rollback();
      return res.status(401).json({ success: false, message: 'رمز عبور نادرست است' });
    }
    const record = await getMfaRecord(connection, user.id);
    if (!record?.enabled) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'احراز هویت دومرحله‌ای فعال نیست' });
    }
    const verified = /^\d{6}$/.test(code)
      ? mfaService.verifyTotp(mfaService.decryptSecret(record.secret_encrypted), code)
      : await consumeRecoveryCode(connection, user.id, code);
    if (!verified) {
      await connection.rollback();
      return res.status(401).json({ success: false, message: 'کد دومرحله‌ای نامعتبر است' });
    }
    if (mfaService.isMfaRequiredForRole(user.role)) {
      await connection.rollback();
      return res.status(403).json({ success: false, message: 'غیرفعال‌سازی 2FA برای نقش‌های کارکنان در این محیط مجاز نیست' });
    }
    await connection.query('UPDATE auth_mfa SET enabled = 0, disabled_at = NOW(), updated_at = NOW() WHERE user_id = ?', [user.id]);
    await connection.query('DELETE FROM auth_mfa_recovery_codes WHERE user_id = ?', [user.id]);
    await connection.commit();
    return res.json({ success: true, message: 'احراز هویت دومرحله‌ای غیرفعال شد' });
  } catch (error) {
    await connection.rollback();
    return res.status(500).json({ success: false, message: 'خطا در غیرفعال‌سازی احراز هویت دومرحله‌ای' });
  } finally {
    connection.release();
  }
}

async function listSessions(req, res) {
  try {
    const currentHash = req.cookies?.refresh_token ? sha256(req.cookies.refresh_token) : null;
    const [rows] = await db.query(
      `SELECT id, token_hash, created_ip, user_agent, created_at, last_used_at, expires_at
       FROM auth_refresh_tokens
       WHERE user_id = ? AND revoked_at IS NULL AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [req.user.id]
    );
    return res.json({
      success: true,
      sessions: rows.map((row) => ({
        id: row.id,
        ip: row.created_ip,
        user_agent: row.user_agent,
        created_at: row.created_at,
        last_used_at: row.last_used_at,
        expires_at: row.expires_at,
        current: Boolean(currentHash && row.token_hash === currentHash)
      }))
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'خطا در دریافت نشست‌های فعال' });
  }
}

async function revokeSession(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, message: 'شناسه نشست نامعتبر است' });
  const currentHash = req.cookies?.refresh_token ? sha256(req.cookies.refresh_token) : null;
  const [rows] = await db.query(
    'SELECT token_hash FROM auth_refresh_tokens WHERE id = ? AND user_id = ? LIMIT 1',
    [id, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ success: false, message: 'نشست یافت نشد' });
  await db.query(
    `UPDATE auth_refresh_tokens SET revoked_at = COALESCE(revoked_at, NOW()), revoked_reason = 'user_revoked'
     WHERE id = ? AND user_id = ?`,
    [id, req.user.id]
  );
  const current = Boolean(currentHash && rows[0].token_hash === currentHash);
  if (current) clearTokenCookie(res);
  return res.json({ success: true, current, message: current ? 'نشست فعلی لغو شد؛ دوباره وارد شوید' : 'نشست با موفقیت لغو شد' });
}

async function revokeOtherSessions(req, res) {
  const currentHash = req.cookies?.refresh_token ? sha256(req.cookies.refresh_token) : '';
  await db.query(
    `UPDATE auth_refresh_tokens
     SET revoked_at = COALESCE(revoked_at, NOW()), revoked_reason = 'user_revoked_others'
     WHERE user_id = ? AND token_hash <> ? AND revoked_at IS NULL`,
    [req.user.id, currentHash]
  );
  return res.json({ success: true, message: 'همه نشست‌های دیگر لغو شدند' });
}

module.exports = {
  login, logout, getMe, changePassword, updateProfile, forgotPassword, resetPassword, requestPasswordResetOtp, verifyPasswordResetOtp, confirmPasswordResetOtp,
  refreshToken, checkAuth, requestOTP, verifyOTP, generateToken, setTokenCookie, clearTokenCookie,
  mfaSubject, getTwoFactorStatus, setupTwoFactor, enableTwoFactor, verifyTwoFactorLogin,
  disableTwoFactor, listSessions, revokeSession, revokeOtherSessions
};
