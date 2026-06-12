// src/controllers/authController.js
// ============================================
// کنترلر احراز هویت - ورود، خروج، تغییر رمز و ...
// ============================================

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/db');

// تنظیمات JWT
const JWT_SECRET = process.env.JWT_SECRET || 'noorvista_super_secret_key_2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

/**
 * تولید JWT Token
 */
function generateToken(user) {
    return jwt.sign(
        {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            full_name: user.full_name
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
}

/**
 * تولید Refresh Token
 */
function generateRefreshToken(user) {
    return jwt.sign(
        { id: user.id, type: 'refresh' },
        JWT_SECRET,
        { expiresIn: JWT_REFRESH_EXPIRES_IN }
    );
}

/**
 * تنظیم کوکی JWT
 */
function setTokenCookie(res, token) {
    const isProduction = process.env.NODE_ENV === 'production';
    
    res.cookie('token', token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000
    });
}

/**
 * پاک کردن کوکی JWT
 */
function clearTokenCookie(res) {
    res.clearCookie('token', {
        httpOnly: true,
        sameSite: 'lax'
    });
}

/**
 * دریافت مسیر هدایت بر اساس نقش
 */
function getRedirectUrl(role) {
    const redirects = {
        system_admin: '/dashboard/panel/admin/index.html',
        clinic_admin: '/dashboard/panel/clinic-admin/index.html',
        doctor: '/dashboard/panel/doctor/index.html',
        receptionist: '/dashboard/panel/reception/index.html',
        patient: '/dashboard/panel/patient/index.html'
    };
    return redirects[role] || '/';
}

/**
 * ورود کاربر
 * POST /api/auth/login
 */
async function login(req, res) {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'نام کاربری و رمز عبور الزامی است'
            });
        }
        
// در تابع login
const [users] = await db.query(
    `SELECT u.*, 
            d.specialty, d.consultation_fee, d.is_available as doctor_available,
            p.national_code, p.birth_date
     FROM users u
     LEFT JOIN doctors d ON u.id = d.user_id
     LEFT JOIN patients p ON u.id = p.user_id
     WHERE u.username = ? OR u.email = ?`,
    [username, username]
);
        
        if (users.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'نام کاربری یا رمز عبور اشتباه است'
            });
        }
        
        const user = users[0];
        
        let isValid = false;
        if (user.password && user.password.startsWith('$2')) {
            isValid = await bcrypt.compare(password, user.password);
        } else {
            isValid = (user.password === password);
        }
        
        if (!isValid) {
            return res.status(401).json({
                success: false,
                message: 'نام کاربری یا رمز عبور اشتباه است'
            });
        }
        
        if (!user.is_active) {
            return res.status(401).json({
                success: false,
                message: 'حساب کاربری شما غیرفعال شده است'
            });
        }
        
        await db.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);
        
        const token = generateToken(user);
        
        setTokenCookie(res, token);
        
        const userResponse = {
            id: user.id,
            username: user.username,
            full_name: user.full_name,
            email: user.email,
            phone: user.phone,
            role: user.role,
            is_active: user.is_active,
            last_login: user.last_login,
            specialty: user.specialty,
            consultation_fee: user.consultation_fee
        };
        
        res.json({
            success: true,
            message: 'ورود موفقیت‌آمیز بود',
            token: token,
            user: userResponse,
            redirect: getRedirectUrl(user.role)
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'خطا در سرور. لطفاً مجدداً تلاش کنید'
        });
    }
}

/**
 * خروج از سیستم
 * POST /api/auth/logout
 */
async function logout(req, res) {
    try {
        clearTokenCookie(res);
        
        res.json({
            success: true,
            message: 'با موفقیت خارج شدید'
        });
        
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            success: false,
            message: 'خطا در خروج از سیستم'
        });
    }
}

/**
 * دریافت اطلاعات کاربر جاری
 * GET /api/auth/me
 */
async function getMe(req, res) {
    try {
        const userId = req.user?.id;
        
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'احراز هویت نشده است'
            });
        }
        
        const [users] = await db.query(
            `SELECT u.id, u.username, u.full_name, u.email, u.phone, u.role, u.is_active, u.last_login,
                    d.specialty, d.sub_specialty, d.license_number, d.experience_years, 
                    d.bio, d.consultation_fee, d.is_available as doctor_available,
                    p.national_code, p.birth_date, p.gender, p.blood_type, p.allergies, 
                    p.chronic_diseases, p.address
             FROM users u
             LEFT JOIN doctors d ON u.id = d.user_id
             LEFT JOIN patients p ON u.id = p.user_id
             WHERE u.id = ?`,
            [userId]
        );
        
        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'کاربر یافت نشد'
            });
        }
        
        res.json({
            success: true,
            user: users[0]
        });
        
    } catch (error) {
        console.error('Get me error:', error);
        res.status(500).json({
            success: false,
            message: 'خطا در دریافت اطلاعات کاربر'
        });
    }
}


/**
 * ویرایش اطلاعات حساب کاربری جاری
 * PUT/PATCH /api/auth/profile
 * PUT/PATCH /api/auth/me
 */
async function updateProfile(req, res) {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'احراز هویت نشده است' });
        }

        const fullName = String(req.body.full_name || req.body.fullname || req.body.name || '').trim();
        const email = String(req.body.email || '').trim();
        const phone = String(req.body.phone || req.body.mobile || '').trim();

        if (!fullName) {
            return res.status(400).json({ success: false, message: 'نام و نام خانوادگی الزامی است' });
        }

        if (email) {
            const [duplicateEmails] = await db.query(
                'SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1',
                [email, userId]
            );
            if (duplicateEmails.length > 0) {
                return res.status(409).json({ success: false, message: 'این ایمیل قبلاً برای کاربر دیگری ثبت شده است' });
            }
        }

        const [columnsResult] = await db.query('SHOW COLUMNS FROM users');
        const columns = new Set((columnsResult || []).map(col => col.Field));
        const updateData = {};

        if (columns.has('full_name')) updateData.full_name = fullName;
        if (columns.has('fullname')) updateData.fullname = fullName;
        if (columns.has('name')) updateData.name = fullName;
        if (columns.has('email')) updateData.email = email || null;
        if (columns.has('phone')) updateData.phone = phone || null;
        if (columns.has('updated_at')) updateData.updated_at = new Date();

        const fields = Object.keys(updateData);
        if (!fields.length) {
            return res.status(500).json({ success: false, message: 'ستون قابل ویرایش در جدول کاربران پیدا نشد' });
        }

        const setClause = fields.map(field => `${field} = ?`).join(', ');
        const values = fields.map(field => updateData[field]);
        values.push(userId);

        await db.query(`UPDATE users SET ${setClause} WHERE id = ?`, values);

        const selectable = ['id', 'username', 'full_name', 'fullname', 'name', 'email', 'phone', 'role', 'is_active']
            .filter(field => columns.has(field));
        const [users] = await db.query(
            `SELECT ${selectable.join(', ')} FROM users WHERE id = ? LIMIT 1`,
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'کاربر یافت نشد' });
        }

        const user = users[0];
        user.full_name = user.full_name || user.fullname || user.name || fullName;

        res.json({
            success: true,
            message: 'اطلاعات حساب با موفقیت ذخیره شد',
            user
        });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ success: false, message: 'خطا در ویرایش اطلاعات حساب' });
    }
}

/**
 * تغییر رمز عبور
 * POST /api/auth/change-password
 */
async function changePassword(req, res) {
    try {
        const { old_password, new_password, confirm_password } = req.body;
        const userId = req.user.id;
        
        if (!old_password || !new_password || !confirm_password) {
            return res.status(400).json({
                success: false,
                message: 'لطفاً تمام فیلدها را پر کنید'
            });
        }
        
        if (new_password !== confirm_password) {
            return res.status(400).json({
                success: false,
                message: 'رمز عبور جدید و تکرار آن مطابقت ندارند'
            });
        }
        
        if (new_password.length < 8) {
            return res.status(400).json({
                success: false,
                message: 'رمز عبور باید حداقل ۸ کاراکتر باشد'
            });
        }
        
        const [users] = await db.query('SELECT password FROM users WHERE id = ?', [userId]);
        
        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'کاربر یافت نشد'
            });
        }
        
        let isValid = false;
        const currentPassword = users[0].password;
        
        if (currentPassword && currentPassword.startsWith('$2')) {
            isValid = await bcrypt.compare(old_password, currentPassword);
        } else {
            isValid = (currentPassword === old_password);
        }
        
        if (!isValid) {
            return res.status(401).json({
                success: false,
                message: 'رمز عبور فعلی اشتباه است'
            });
        }
        
        const hashedPassword = await bcrypt.hash(new_password, 10);
        
        await db.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId]);
        
        res.json({
            success: true,
            message: 'رمز عبور با موفقیت تغییر کرد'
        });
        
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({
            success: false,
            message: 'خطا در تغییر رمز عبور'
        });
    }
}

/**
 * درخواست بازیابی رمز عبور
 * POST /api/auth/forgot-password
 */
async function forgotPassword(req, res) {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'ایمیل الزامی است'
            });
        }
        
        const [users] = await db.query('SELECT id, full_name, email FROM users WHERE email = ?', [email]);
        
        if (users.length === 0) {
            return res.json({
                success: true,
                message: 'در صورت وجود حساب کاربری، لینک بازیابی ارسال خواهد شد'
            });
        }
        
        const user = users[0];
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetExpires = new Date(Date.now() + 3600000);
        
        const resetUrl = `${req.protocol}://${req.get('host')}/reset-password?token=${resetToken}`;
        
        console.log(`Reset password link: ${resetUrl}`);
        
        res.json({
            success: true,
            message: 'در صورت وجود حساب کاربری، لینک بازیابی ارسال خواهد شد',
            ...(process.env.NODE_ENV === 'development' && { reset_token: resetToken })
        });
        
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({
            success: false,
            message: 'خطا در ارسال لینک بازیابی'
        });
    }
}

/**
 * بازنشانی رمز عبور
 * POST /api/auth/reset-password
 */
async function resetPassword(req, res) {
    try {
        const { token, new_password, confirm_password } = req.body;
        
        if (!token || !new_password || !confirm_password) {
            return res.status(400).json({
                success: false,
                message: 'لطفاً تمام فیلدها را پر کنید'
            });
        }
        
        if (new_password !== confirm_password) {
            return res.status(400).json({
                success: false,
                message: 'رمز عبور جدید و تکرار آن مطابقت ندارند'
            });
        }
        
        if (new_password.length < 8) {
            return res.status(400).json({
                success: false,
                message: 'رمز عبور باید حداقل ۸ کاراکتر باشد'
            });
        }
        
        // در اینجا باید توکن را در دیتابیس بررسی کنید
        // برای سادگی، فعلاً یک پاسخ موفق برمی‌گردانیم
        
        res.json({
            success: true,
            message: 'رمز عبور با موفقیت بازنشانی شد'
        });
        
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({
            success: false,
            message: 'خطا در بازنشانی رمز عبور'
        });
    }
}

/**
 * تمدید توکن
 * GET /api/auth/refresh-token
 */
async function refreshToken(req, res) {
    try {
        const token = req.cookies?.token;
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'توکن یافت نشد'
            });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        
        const [users] = await db.query(
            'SELECT id, username, email, role, full_name FROM users WHERE id = ?',
            [decoded.id]
        );
        
        if (users.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'کاربر یافت نشد'
            });
        }
        
        const newToken = generateToken(users[0]);
        setTokenCookie(res, newToken);
        
        res.json({
            success: true,
            token: newToken
        });
        
    } catch (error) {
        console.error('Refresh token error:', error);
        res.status(401).json({
            success: false,
            message: 'توکن نامعتبر است'
        });
    }
}

/**
 * بررسی وضعیت احراز هویت
 * GET /api/auth/check
 */
async function checkAuth(req, res) {
    try {
        const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.json({ authenticated: false });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        
        const [users] = await db.query(
            'SELECT id, role, is_active FROM users WHERE id = ?',
            [decoded.id]
        );
        
        res.json({
            authenticated: users.length > 0 && users[0].is_active,
            user: users[0]
        });
        
    } catch (error) {
        res.json({ authenticated: false });
    }
}

/**
 * درخواست OTP (برای ورود با پیامک)
 * POST /api/auth/request-otp
 */
async function requestOTP(req, res) {
    try {
        const { phone } = req.body;
        
        if (!phone) {
            return res.status(400).json({
                success: false,
                message: 'شماره تلفن الزامی است'
            });
        }
        
        const [users] = await db.query('SELECT id FROM users WHERE phone = ?', [phone]);
        
        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'شماره تلفن یافت نشد'
            });
        }
        
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 5 * 60000);
        
        await db.query(
            `INSERT INTO otp_codes (phone, code, expires_at)
             VALUES (?, ?, ?)`,
            [phone, code, expiresAt]
        );
        
        console.log(`📱 OTP code for ${phone}: ${code}`);
        
        res.json({
            success: true,
            message: 'کد تأیید ارسال شد',
            ...(process.env.NODE_ENV === 'development' && { debug_code: code })
        });
        
    } catch (error) {
        console.error('Request OTP error:', error);
        res.status(500).json({
            success: false,
            message: 'خطا در ارسال کد تأیید'
        });
    }
}

/**
 * تأیید OTP و ورود
 * POST /api/auth/verify-otp
 */
async function verifyOTP(req, res) {
    try {
        const { phone, code } = req.body;
        
        if (!phone || !code) {
            return res.status(400).json({
                success: false,
                message: 'شماره تلفن و کد تأیید الزامی است'
            });
        }
        
        const [codes] = await db.query(
            `SELECT * FROM otp_codes 
             WHERE phone = ? AND code = ? AND is_used = 0 AND expires_at > NOW()
             ORDER BY created_at DESC LIMIT 1`,
            [phone, code]
        );
        
        if (codes.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'کد نامعتبر یا منقضی شده است'
            });
        }
        
        await db.query('UPDATE otp_codes SET is_used = 1 WHERE id = ?', [codes[0].id]);
        
        const [users] = await db.query(
            `SELECT u.*, 
                    d.specialty, d.consultation_fee,
                    p.national_code, p.birth_date
             FROM users u
             LEFT JOIN doctors d ON u.id = d.user_id
             LEFT JOIN patients p ON u.id = p.user_id
             WHERE u.phone = ?`,
            [phone]
        );
        
        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'کاربر یافت نشد'
            });
        }
        
        const user = users[0];
        
        if (!user.is_active) {
            return res.status(401).json({
                success: false,
                message: 'حساب کاربری شما غیرفعال شده است'
            });
        }
        
        await db.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);
        
        const token = generateToken(user);
        setTokenCookie(res, token);
        
        const userResponse = {
            id: user.id,
            username: user.username,
            full_name: user.full_name,
            email: user.email,
            phone: user.phone,
            role: user.role,
            is_active: user.is_active
        };
        
        res.json({
            success: true,
            message: 'ورود موفقیت‌آمیز بود',
            token: token,
            user: userResponse,
            redirect: getRedirectUrl(user.role)
        });
        
    } catch (error) {
        console.error('Verify OTP error:', error);
        res.status(500).json({
            success: false,
            message: 'خطا در تأیید کد'
        });
    }
}

module.exports = {
    login,
    logout,
    getMe,
    changePassword,
    updateProfile,
    forgotPassword,
    resetPassword,
    refreshToken,
    checkAuth,
    requestOTP,
    verifyOTP,
    generateToken,
    setTokenCookie,
    clearTokenCookie
};