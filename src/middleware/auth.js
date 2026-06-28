// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const mfaService = require('../services/mfaService');

const { JWT_SECRET } = require('../config/security');

function normalizeRoleName(role) {
    const raw = String(role || '').trim().toLowerCase();
    const normalized = raw.replace(/[\s-]+/g, '_');
    const compact = normalized.replace(/_/g, '');
    const faCompact = String(role || '').replace(/\s+/g, '').trim();
    return { raw, normalized, compact, faCompact };
}

function isSystemAdminRole(role) {
    const { normalized, compact, faCompact } = normalizeRoleName(role);
    const allowed = new Set([
        'system_admin', 'admin', 'super_admin', 'site_admin', 'owner',
        'systemadmin', 'superadmin', 'siteadmin'
    ]);
    const allowedFa = new Set([
        'مدیرسیستم', 'مديرسيستم', 'مدیرسایت', 'مديرسايت',
        'مدیرکل', 'مديركل', 'ادمین', 'ادمين'
    ]);
    return allowed.has(normalized) || allowed.has(compact) || allowedFa.has(faCompact);
}

function roleMatches(userRole, allowedRole) {
    const user = normalizeRoleName(userRole);
    const allowed = normalizeRoleName(allowedRole);
    if (user.normalized === allowed.normalized || user.compact === allowed.compact) return true;

    if (['system_admin', 'admin', 'super_admin', 'site_admin'].includes(allowed.normalized)) {
        return isSystemAdminRole(userRole);
    }

    if (allowed.normalized === 'clinic_admin') {
        return ['clinic_admin', 'clinicmanager', 'clinic_manager', 'manager', 'clinic', 'clinic_administrator'].includes(user.normalized) ||
               ['clinicadmin', 'clinicmanager', 'clinicadministrator', 'clinic'].includes(user.compact) ||
               ['مدیرکلینیک', 'مديركلينيك', 'مدیرمرکز', 'مديرمركز'].includes(user.faCompact) ||
               isSystemAdminRole(userRole);
    }

    return false;
}


/**
 * Middleware محافظت از مسیرها
 */
async function protect(req, res, next) {
    let token;
    
    if (req.cookies?.token) {
        token = req.cookies.token;
    } else if (req.headers.authorization?.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }
    
    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'لطفاً وارد حساب کاربری خود شوید'
        });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET, { issuer: 'noorvista', audience: 'noorvista-web' });
        
        const sessionId = Number(decoded.sid);
        if (!Number.isInteger(sessionId) || sessionId <= 0) {
            return res.status(401).json({ success: false, message: 'نشست نامعتبر است' });
        }
        const [users] = await db.query(
            `SELECT u.id, u.username, u.full_name, u.email, u.phone, u.role, u.is_active,
                    d.id as doctor_id, d.specialty, d.consultation_fee,
                    p.id as patient_id, p.national_code,
                    rt.id AS session_id
             FROM users u
             JOIN auth_refresh_tokens rt ON rt.user_id = u.id
                AND rt.id = ? AND rt.revoked_at IS NULL AND rt.expires_at > NOW()
             LEFT JOIN doctors d ON u.id = d.user_id
             LEFT JOIN patients p ON u.id = p.user_id
             WHERE u.id = ?`,
            [sessionId, decoded.id]
        );
        
        if (users.length === 0 || !users[0].is_active) {
            return res.status(401).json({
                success: false,
                message: 'کاربر یافت نشد یا غیرفعال است'
            });
        }
        
        if (mfaService.isMfaRequiredForRole(users[0].role) && decoded.mfa !== true) {
            return res.status(403).json({
                success: false,
                mfa_required: true,
                message: 'احراز هویت دومرحله‌ای برای این نقش الزامی است'
            });
        }

        req.user = users[0];
        next();
        
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'نشست شما منقضی شده است. لطفاً دوباره وارد شوید'
            });
        }
        
        return res.status(401).json({
            success: false,
            message: 'توکن نامعتبر است'
        });
    }
}

/**
 * Middleware محدودیت بر اساس نقش
 */
function restrictTo(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'احراز هویت نشده است'
            });
        }

        const allowed = roles.some(role => roleMatches(req.user.role, role));
        if (!allowed) {
            return res.status(403).json({
                success: false,
                message: 'شما دسترسی به این بخش را ندارید'
            });
        }

        next();
    };
}

/**
 * Middleware احراز هویت اختیاری
 */
async function optionalAuth(req, res, next) {
    let token;
    
    if (req.cookies?.token) {
        token = req.cookies.token;
    } else if (req.headers.authorization?.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }
    
    if (!token) {
        return next();
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET, { issuer: 'noorvista', audience: 'noorvista-web' });
        
        const sessionId = Number(decoded.sid);
        if (!Number.isInteger(sessionId) || sessionId <= 0) return next();
        const [users] = await db.query(
            `SELECT u.id, u.username, u.full_name, u.email, u.phone, u.role, u.is_active
             FROM users u JOIN auth_refresh_tokens rt ON rt.user_id = u.id
             WHERE u.id = ? AND rt.id = ? AND rt.revoked_at IS NULL AND rt.expires_at > NOW()`,
            [decoded.id, sessionId]
        );
        
        if (users.length > 0 && users[0].is_active) {
            if (!mfaService.isMfaRequiredForRole(users[0].role) || decoded.mfa === true) {
                req.user = users[0];
            }
        }
        
        next();
        
    } catch (error) {
        next();
    }
}

/**
 * Middleware بررسی نقش پزشک
 */
async function isDoctor(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'احراز هویت نشده است'
        });
    }
    
    if (req.user.role !== 'doctor') {
        return res.status(403).json({
            success: false,
            message: 'این بخش فقط برای پزشکان قابل دسترسی است'
        });
    }
    
    if (req.user.doctor_id) {
        req.doctorId = req.user.doctor_id;
    } else {
        const [doctors] = await db.query(
            'SELECT id FROM doctors WHERE user_id = ?',
            [req.user.id]
        );
        req.doctorId = doctors[0]?.id;
    }
    
    next();
}

/**
 * Middleware بررسی نقش بیمار
 */
async function isPatient(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'احراز هویت نشده است'
        });
    }
    
    if (req.user.role !== 'patient') {
        return res.status(403).json({
            success: false,
            message: 'این بخش فقط برای بیماران قابل دسترسی است'
        });
    }
    
    let patientId = req.user.patient_id || null;
    if (!patientId) {
        const [patients] = await db.query(
            'SELECT id FROM patients WHERE user_id = ? LIMIT 1',
            [req.user.id]
        );
        patientId = patients[0]?.id || null;
    }

    // Older patient accounts may predate the patients profile row. Create the
    // minimum scoped profile once so every patient API always has a stable id.
    if (!patientId) {
        const [created] = await db.query(
            'INSERT INTO patients (user_id) VALUES (?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)',
            [req.user.id]
        );
        patientId = Number(created.insertId || 0);
        if (!patientId) {
            const [patients] = await db.query(
                'SELECT id FROM patients WHERE user_id = ? LIMIT 1',
                [req.user.id]
            );
            patientId = Number(patients[0]?.id || 0);
        }
    }

    if (!patientId) {
        return res.status(500).json({ success: false, message: 'پروفایل بیمار قابل ایجاد یا بازیابی نیست' });
    }
    req.patientId = patientId;
    req.user.patient_id = patientId;
    next();
}

/**
 * Middleware بررسی نقش منشی
 */
async function isReceptionist(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'احراز هویت نشده است'
        });
    }
    
    if (req.user.role !== 'receptionist' && req.user.role !== 'clinic_admin' && req.user.role !== 'system_admin') {
        return res.status(403).json({
            success: false,
            message: 'دسترسی محدود به پرسنل کلینیک'
        });
    }
    
    next();
}

/**
 * Middleware بررسی نقش مدیر کلینیک
 */
async function isClinicAdmin(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'احراز هویت نشده است'
        });
    }
    
    if (!roleMatches(req.user.role, 'clinic_admin')) {
        return res.status(403).json({
            success: false,
            message: 'دسترسی محدود به مدیران کلینیک'
        });
    }
    
    next();
}

/**
 * Middleware بررسی نقش مدیر سیستم
 */
async function isSystemAdmin(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'احراز هویت نشده است'
        });
    }

    if (!isSystemAdminRole(req.user.role)) {
        return res.status(403).json({
            success: false,
            message: 'دسترسی محدود به مدیران سیستم'
        });
    }

    next();
}

module.exports = {
    protect,
    restrictTo,
    optionalAuth,
    isDoctor,
    isPatient,
    isReceptionist,
    isClinicAdmin,
    isSystemAdmin
};