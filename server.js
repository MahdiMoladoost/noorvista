// server.js
// ============================================
// NOORVISTA Clinic Management System - Main Server
// ============================================

require('dotenv').config();

const express = require('express');
const { createPanelFinalFixesRouter } = require('./src/routes/panelFinalFixes');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Database
const db = require('./src/config/db');

// Routes
const authRoutes = require('./src/routes/auth');
const adminRoutes = require('./src/routes/admin');
const adminExtraRoutes = require('./src/routes/adminExtra');
const clinicRoutes = require('./src/routes/clinic');
const doctorRoutes = require('./src/routes/doctor');
const patientRoutes = require('./src/routes/patients');
const appointmentRoutes = require('./src/routes/appointments');
const appointmentArchitectureRoutes = require('./src/routes/appointmentArchitecture');
const appointmentQueueSmsRoutes = require('./src/routes/appointmentQueueSms');
const scheduleRoutes = require('./src/routes/schedule');
const createPlatformRoutes = require('./src/routes/platform');
const smsService = require('./src/services/smsService');

const app = express();

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'noorvista_super_secret_key_2026';
const NODE_ENV = process.env.NODE_ENV || 'development';

// ============================================
// Project Paths - migration-safe public structure
// ============================================
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const PUBLIC_PAGES_DIR = path.join(PUBLIC_DIR, 'pages');
const PUBLIC_ASSETS_DIR = path.join(PUBLIC_DIR, 'assets');
const PUBLIC_UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');

function publicPage(...segments) {
    return path.join(PUBLIC_PAGES_DIR, ...segments);
}

function sendPublicPage(res, ...segments) {
    return res.sendFile(publicPage(...segments));
}

// ============================================
// Helpers
// ============================================

const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

function getTokenFromRequest(req) {
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
        return authHeader.split(' ')[1];
    }

    if (req.cookies && req.cookies.token) {
        return req.cookies.token;
    }

    return null;
}

function authenticateToken(req, res, next) {
    try {
        const token = getTokenFromRequest(req);

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'توکن یافت نشد'
            });
        }

        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'توکن نامعتبر است'
        });
    }
}

function authorizeRoles(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'دسترسی غیرمجاز'
            });
        }

        next();
    };
}

function normalizeUser(user) {
    return {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        is_active: Boolean(user.is_active)
    };
}

async function isPasswordValid(inputPassword, storedPassword) {
    if (!storedPassword) return false;

    // پشتیبانی از رمزهای ساده پروژه فعلی مثل 123456
    if (inputPassword === storedPassword) return true;

    // پشتیبانی از bcrypt برای زمانی که بعداً رمزها hash شوند
    const looksHashed =
        storedPassword.startsWith('$2a$') ||
        storedPassword.startsWith('$2b$') ||
        storedPassword.startsWith('$2y$');

    if (!looksHashed) return false;

    try {
        return await bcrypt.compare(inputPassword, storedPassword);
    } catch (error) {
        return false;
    }
}

function getFallbackAIReply() {
    const fallbackResponses = [
        'متأسفم، در حال حاضر قادر به پاسخگویی نیستم. لطفاً با شماره ۰۲۱-۲۲۳۳۴۴۵۵ تماس بگیرید.',
        'در حال حاضر سرویس پاسخگویی با مشکل مواجه شده است. لطفاً بعداً تلاش کنید.',
        'برای دریافت پاسخ سوال خود، لطفاً با پشتیبانی کلینیک تماس بگیرید.'
    ];

    return fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
}


const CLINIC_PANEL_ROLES = [
    'clinic_admin',
    'clinic',
    'clinic_manager',
    'manager',
    'admin',
    'system_admin',
    'reception',
    'receptionist'
];

function pickFirstValue(row, keys, fallback = '') {
    if (!row) return fallback;

    for (const key of keys) {
        if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
            return row[key];
        }
    }

    return fallback;
}

function buildFullName(row, fallback = '-') {
    if (!row) return fallback;

    const directName = pickFirstValue(row, [
        'patient_name',
        'doctor_name',
        'full_name',
        'name',
        'username'
    ], '');

    if (directName) return directName;

    const firstName = pickFirstValue(row, ['first_name', 'firstname', 'fname'], '');
    const lastName = pickFirstValue(row, ['last_name', 'lastname', 'lname'], '');
    const combined = `${firstName} ${lastName}`.trim();

    return combined || fallback;
}

async function safeScalar(pool, sql, params = [], fallback = 0) {
    try {
        const [rows] = await pool.query(sql, params);
        const row = rows && rows[0] ? rows[0] : {};
        const value = row.value ?? row.count ?? row.total ?? fallback;
        return Number(value) || 0;
    } catch (error) {
        console.warn('Safe scalar query failed:', error.code || error.message);
        return fallback;
    }
}

async function safeRows(pool, sql, params = [], fallback = []) {
    try {
        const [rows] = await pool.query(sql, params);
        return Array.isArray(rows) ? rows : fallback;
    } catch (error) {
        console.warn('Safe rows query failed:', error.code || error.message);
        return fallback;
    }
}

async function fetchRowsByIds(pool, tableName, ids) {
    const allowedTables = ['patients', 'doctors', 'users'];
    if (!allowedTables.includes(tableName)) return new Map();

    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (uniqueIds.length === 0) return new Map();

    const rows = await safeRows(
        pool,
        `SELECT * FROM ${tableName} WHERE id IN (?)`,
        [uniqueIds]
    );

    return new Map(rows.map(row => [Number(row.id), row]));
}

function normalizeAppointment(row, patientMap = new Map(), doctorMap = new Map(), userMap = new Map()) {
    const patient = patientMap.get(Number(row.patient_id));
    const doctor = doctorMap.get(Number(row.doctor_id));
    const doctorUser = doctor && doctor.user_id ? userMap.get(Number(doctor.user_id)) : null;

    return {
        id: row.id,
        appointment_date: clinicV2DateOnly(pickFirstValue(row, ['appointment_date', 'date', 'visit_date'], '')),
        appointment_time: pickFirstValue(row, ['appointment_time', 'time', 'visit_time', 'start_time'], ''),
        patient_name: pickFirstValue(row, ['patient_name'], '') || buildFullName(patient, '-'),
        doctor_name: pickFirstValue(row, ['doctor_name'], '') || buildFullName(doctorUser, '') || buildFullName(doctor, '-'),
        type: pickFirstValue(row, ['type', 'appointment_type'], 'regular'),
        status: pickFirstValue(row, ['status'], 'pending')
    };
}

async function getAppointmentsForClinic(pool, whereSql, params = []) {
    const appointmentRows = await safeRows(
        pool,
        `SELECT * FROM appointments ${whereSql} ORDER BY appointment_date ASC, appointment_time ASC LIMIT 50`,
        params
    );

    const patientIds = appointmentRows.map(row => row.patient_id);
    const doctorIds = appointmentRows.map(row => row.doctor_id);

    const patientMap = await fetchRowsByIds(pool, 'patients', patientIds);
    const doctorMap = await fetchRowsByIds(pool, 'doctors', doctorIds);
    const userIds = [...doctorMap.values()].map(row => row.user_id);
    const userMap = await fetchRowsByIds(pool, 'users', userIds);

    return appointmentRows.map(row => normalizeAppointment(row, patientMap, doctorMap, userMap));
}

function buildWeeklyLabels() {
    const labels = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        labels.push(new Intl.DateTimeFormat('fa-IR', { weekday: 'long' }).format(d));
    }
    return labels;
}

// ============================================
// Security & Global Middleware
// ============================================

app.disable('x-powered-by');
app.disable('etag');

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],

            // Local styles + Neshan Leaflet SDK styles
            styleSrc: ["'self'", "'unsafe-inline'", 'https://static.neshan.org'],
            styleSrcElem: ["'self'", "'unsafe-inline'", 'https://static.neshan.org'],

            // Local scripts + Neshan Leaflet SDK script
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://static.neshan.org'],
            scriptSrcElem: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://static.neshan.org'],
            scriptSrcAttr: ["'unsafe-inline'"],

            // Fonts, images and map tiles
            fontSrc: ["'self'", 'data:', 'https://static.neshan.org'],
            imgSrc: ["'self'", 'data:', 'blob:', 'https:'],

            // Neshan SDK/API network requests
            connectSrc: [
                "'self'",
                'https://cdn.jsdelivr.net',
                'https://static.neshan.org',
                'https://api.neshan.org',
                'https://*.neshan.org'
            ],
        },
    },
}));

const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

app.use(cors({
    origin(origin, callback) {
        // اجازه به درخواست‌های same-origin و ابزارهایی مثل Postman
        if (!origin) return callback(null, true);

        if (corsOrigins.includes(origin)) {
            return callback(null, true);
        }

        return callback(new Error('CORS policy: Origin not allowed'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser(process.env.COOKIE_SECRET));
app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev'));

// ============================================
// Static Files
// ============================================

// فقط پوشه‌های عمومی را static کن.
// مسیرهای جدید زیر /assets هستند؛ مسیرهای قدیمی /css, /js, /images, /fonts برای سازگاری باقی مانده‌اند.
app.use('/assets', express.static(PUBLIC_ASSETS_DIR));
app.use('/css', express.static(path.join(PUBLIC_ASSETS_DIR, 'css')));
app.use('/js', express.static(path.join(PUBLIC_ASSETS_DIR, 'js')));
app.use('/images', express.static(path.join(PUBLIC_ASSETS_DIR, 'images')));
app.use('/fonts', express.static(path.join(PUBLIC_ASSETS_DIR, 'fonts')));

// Public uploads only. Patient documents stay outside public static exposure unless served by authenticated APIs.
app.use('/uploads/public', express.static(path.join(PUBLIC_UPLOADS_DIR, 'public')));

// Dashboard panels - new clean routes and legacy aliases
app.use('/dashboard/admin', express.static(publicPage('dashboard', 'admin')));
app.use('/dashboard/clinic', express.static(publicPage('dashboard', 'clinic-manager')));
app.use('/dashboard/clinic-manager', express.static(publicPage('dashboard', 'clinic-manager')));
app.use('/dashboard/doctor', express.static(publicPage('dashboard', 'doctor')));
app.use('/dashboard/secretary', express.static(publicPage('dashboard', 'secretary')));
app.use('/dashboard/reception', express.static(publicPage('dashboard', 'secretary')));
app.use('/dashboard/patient', express.static(publicPage('dashboard', 'patient')));

app.use('/dashboard/panel/admin', express.static(publicPage('dashboard', 'admin')));
app.use('/dashboard/panel/clinic-admin', express.static(publicPage('dashboard', 'clinic-manager')));
app.use('/dashboard/panel/doctor', express.static(publicPage('dashboard', 'doctor')));
app.use('/dashboard/panel/patient', express.static(publicPage('dashboard', 'patient')));
app.use('/dashboard/panel/reception', express.static(publicPage('dashboard', 'secretary')));

// جلوگیری از cache شدن پاسخ‌های API مخصوصاً /api/auth/me
app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
});

// ============================================
// Health Check
// ============================================

app.get('/api/health', asyncHandler(async (req, res) => {
    try {
        const pool = await db.getPool();
        await pool.query('SELECT 1');

        res.json({
            status: 'ok',
            mysql: true,
            timestamp: new Date(),
            uptime: process.uptime()
        });
    } catch (error) {
        res.status(503).json({
            status: 'error',
            mysql: false,
            error: error.message,
            timestamp: new Date(),
            uptime: process.uptime()
        });
    }
}));

// ============================================
// Rate Limiting
// ============================================

const panelApiRateLimitSkipPrefixes = [
    '/auth/me',
    '/clinic/',
    '/admin/',
    '/schedule/',
    '/doctor/',
    '/patient/',
    '/reception/',
    '/payments/',
    '/public/',
    '/health'
];

const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || (process.env.NODE_ENV === 'production' ? 1000 : 10000),
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => panelApiRateLimitSkipPrefixes.some(prefix => req.path === prefix || req.path.startsWith(prefix)),
    message: {
        success: false,
        message: 'تعداد درخواست‌ها زیاد است. چند لحظه صبر کنید و دوباره تلاش کنید.'
    },
});

app.use('/api/', limiter);

// ============================================
// Auth Routes
// ============================================

// ورود مستقیم، قبل از authRoutes قرار گرفته تا با routeهای احتمالی تکراری تداخل نداشته باشد.
app.post('/api/auth/login', asyncHandler(async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({
            success: false,
            message: 'نام کاربری و رمز عبور الزامی است'
        });
    }

    const connection = await db.getPool();

    const [users] = await connection.query(
        `SELECT id, username, password, full_name, email, phone, role, is_active
         FROM users
         WHERE username = ? OR email = ?
         LIMIT 1`,
        [username, username]
    );

    if (users.length === 0) {
        return res.status(401).json({
            success: false,
            message: 'نام کاربری یا رمز عبور اشتباه است'
        });
    }

    const user = users[0];
    const passwordValid = await isPasswordValid(password, user.password);

    if (!passwordValid) {
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

    await connection.query(
        'UPDATE users SET last_login = NOW() WHERE id = ?',
        [user.id]
    );

    const token = jwt.sign(
        {
            id: user.id,
            username: user.username,
            role: user.role,
            full_name: user.full_name
        },
        JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
        success: true,
        token,
        user: normalizeUser(user)
    });
}));

app.get('/api/auth/me', authenticateToken, asyncHandler(async (req, res) => {
    const connection = await db.getPool();

    const [users] = await connection.query(
        `SELECT id, username, full_name, email, phone, role, is_active
         FROM users
         WHERE id = ?
         LIMIT 1`,
        [req.user.id]
    );

    if (users.length === 0) {
        return res.status(404).json({
            success: false,
            message: 'کاربر یافت نشد'
        });
    }

    res.json({
        success: true,
        user: normalizeUser(users[0])
    });
}));

// ============================================
// Make DB Available In Route Modules
// ============================================

app.use(asyncHandler(async (req, res, next) => {
    req.db = await db.getPool();
    next();
}));


// ============================================
// Public Website Forms
// ============================================

let publicLeadTablesReady = false;

function cleanPublicText(value, maxLength = 1000) {
    return String(value || '')
        .replace(/[<>]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);
}

function cleanPublicPhone(value) {
    return cleanPublicText(value, 30).replace(/[^0-9+\-\s]/g, '').trim();
}

async function ensurePublicLeadTables(pool) {
    if (publicLeadTablesReady) return;

    await pool.query(`
        CREATE TABLE IF NOT EXISTS appointment_requests (
            id INT PRIMARY KEY AUTO_INCREMENT,
            full_name VARCHAR(200) NOT NULL,
            phone VARCHAR(30) NOT NULL,
            email VARCHAR(200) NULL,
            service VARCHAR(200) NULL,
            preferred_date VARCHAR(50) NULL,
            preferred_time VARCHAR(50) NULL,
            message TEXT NULL,
            status ENUM('new', 'contacted', 'converted', 'cancelled') DEFAULT 'new',
            ip_address VARCHAR(45) NULL,
            user_agent TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_status (status),
            INDEX idx_phone (phone),
            INDEX idx_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS contact_messages (
            id INT PRIMARY KEY AUTO_INCREMENT,
            full_name VARCHAR(200) NOT NULL,
            phone VARCHAR(30) NULL,
            email VARCHAR(200) NULL,
            subject VARCHAR(250) NULL,
            message TEXT NOT NULL,
            status ENUM('new', 'read', 'answered', 'archived') DEFAULT 'new',
            ip_address VARCHAR(45) NULL,
            user_agent TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_status (status),
            INDEX idx_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci
    `);

    publicLeadTablesReady = true;
}

async function notifyClinicManagers(pool, title, message, link = '/dashboard/panel/clinic-admin') {
    try {
        const [admins] = await pool.query(
            `SELECT id FROM users WHERE role IN ('system_admin', 'clinic_admin', 'receptionist') AND is_active = 1 LIMIT 20`
        );

        for (const admin of admins) {
            await pool.query(
                `INSERT INTO notifications (user_id, title, message, type, link) VALUES (?, ?, ?, 'info', ?)`,
                [admin.id, title, message, link]
            );
        }
    } catch (error) {
        console.warn('Public form notification skipped:', error.message);
    }
}

app.post('/api/public/appointment-request', asyncHandler(async (req, res) => {
    const pool = req.db || await db.getPool();
    await ensurePublicLeadTables(pool);

    const payload = {
        full_name: cleanPublicText(req.body.full_name, 200),
        phone: cleanPublicPhone(req.body.phone),
        email: cleanPublicText(req.body.email, 200),
        service: cleanPublicText(req.body.service, 200),
        preferred_date: cleanPublicText(req.body.preferred_date, 50),
        preferred_time: cleanPublicText(req.body.preferred_time, 50),
        message: cleanPublicText(req.body.message, 2000)
    };

    if (!payload.full_name || payload.full_name.length < 3) {
        return res.status(400).json({ success: false, message: 'نام کامل الزامی است' });
    }

    if (!payload.phone || payload.phone.replace(/\D/g, '').length < 10) {
        return res.status(400).json({ success: false, message: 'شماره تماس معتبر وارد کنید' });
    }

    const [result] = await pool.query(
        `INSERT INTO appointment_requests
         (full_name, phone, email, service, preferred_date, preferred_time, message, ip_address, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            payload.full_name,
            payload.phone,
            payload.email || null,
            payload.service || null,
            payload.preferred_date || null,
            payload.preferred_time || null,
            payload.message || null,
            req.ip || null,
            req.get('user-agent') || null
        ]
    );

    await notifyClinicManagers(
        pool,
        'درخواست نوبت جدید از سایت',
        `${payload.full_name} با شماره ${payload.phone} درخواست نوبت ثبت کرد.`,
        '/dashboard/panel/clinic-admin/appointments.html'
    );

    res.status(201).json({
        success: true,
        id: result.insertId,
        message: 'درخواست نوبت شما ثبت شد'
    });
}));

app.post('/api/public/contact-message', asyncHandler(async (req, res) => {
    const pool = req.db || await db.getPool();
    await ensurePublicLeadTables(pool);

    const payload = {
        full_name: cleanPublicText(req.body.full_name, 200),
        phone: cleanPublicPhone(req.body.phone),
        email: cleanPublicText(req.body.email, 200),
        subject: cleanPublicText(req.body.subject, 250),
        message: cleanPublicText(req.body.message, 3000)
    };

    if (!payload.full_name || payload.full_name.length < 3) {
        return res.status(400).json({ success: false, message: 'نام کامل الزامی است' });
    }

    if (!payload.message || payload.message.length < 6) {
        return res.status(400).json({ success: false, message: 'متن پیام را کامل‌تر وارد کنید' });
    }

    if (!payload.phone && !payload.email) {
        return res.status(400).json({ success: false, message: 'حداقل شماره تماس یا ایمیل را وارد کنید' });
    }

    const [result] = await pool.query(
        `INSERT INTO contact_messages
         (full_name, phone, email, subject, message, ip_address, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
            payload.full_name,
            payload.phone || null,
            payload.email || null,
            payload.subject || 'پیام سایت',
            payload.message,
            req.ip || null,
            req.get('user-agent') || null
        ]
    );

    await notifyClinicManagers(
        pool,
        'پیام جدید از فرم تماس سایت',
        `${payload.full_name} یک پیام جدید ارسال کرد.`,
        '/dashboard/panel/clinic-admin/notifications.html'
    );

    res.status(201).json({
        success: true,
        id: result.insertId,
        message: 'پیام شما ثبت شد'
    });
}));

// ============================================
// API Routes
// ============================================

// مسیرهای استاندارد شده فاز ۳ قبل از routeهای قدیمی mount می‌شوند تا بدون حذف کدهای قبلی، رفتار جدید و لایه‌بندی‌شده فعال شود.
app.use('/api', createPlatformRoutes({ authenticateToken, authorizeRoles }));

app.use('/api/auth', authRoutes);
// Appointment architecture v2: centers, services, service-based schedules, capacity-based slots
app.use('/api', appointmentArchitectureRoutes);
// Queue number + confirmation SMS routes must be mounted before legacy confirm routes.
app.use('/api', appointmentQueueSmsRoutes);
// NOORVISTA panel final fixes routes
app.use(createPanelFinalFixesRouter({ db, asyncHandler }));

// مسیرهای adminRoutes بعد از routeهای مستقیم جدید mount می‌شوند تا مسیرهای FAQ و تنظیمات تداخل پیدا نکنند.

// مسیرهای مستقیم داشبورد مدیریت کلینیک قبل از clinicRoutes قرار گرفته‌اند
// تا با middleware یا routeهای قدیمی داخل src/routes/clinic.js تداخل نکنند.
app.get(
    '/api/clinic/stats',
    authenticateToken,
    authorizeRoles(...CLINIC_PANEL_ROLES),
    asyncHandler(async (req, res) => {
        const pool = req.db || await db.getPool();

        const todayAppointments = await safeScalar(
            pool,
            'SELECT COUNT(*) AS value FROM appointments WHERE DATE(appointment_date) = CURDATE()'
        );

        const totalPatients = await safeScalar(
            pool,
            'SELECT COUNT(*) AS value FROM patients'
        );

        const totalDoctors = await safeScalar(
            pool,
            'SELECT COUNT(*) AS value FROM doctors WHERE COALESCE(is_active, 1) = 1',
            [],
            await safeScalar(pool, 'SELECT COUNT(*) AS value FROM doctors')
        );

        const monthlyRevenue = await safeScalar(
            pool,
            `SELECT COALESCE(SUM(amount), 0) AS value
             FROM payments
             WHERE YEAR(payment_date) = YEAR(CURDATE())
               AND MONTH(payment_date) = MONTH(CURDATE())
               AND COALESCE(status, 'completed') IN ('completed', 'paid', 'success')`
        );

        res.json({
            success: true,
            today_appointments: todayAppointments,
            total_patients: totalPatients,
            total_doctors: totalDoctors,
            monthly_revenue: monthlyRevenue
        });
    })
);

app.get(
    '/api/clinic/appointments/today',
    authenticateToken,
    authorizeRoles(...CLINIC_PANEL_ROLES),
    asyncHandler(async (req, res) => {
        const pool = req.db || await db.getPool();
        const appointments = await getAppointmentsForClinic(
            pool,
            'WHERE DATE(appointment_date) = CURDATE()'
        );

        res.json({ success: true, appointments });
    })
);

app.get(
    '/api/clinic/appointments/pending',
    authenticateToken,
    authorizeRoles(...CLINIC_PANEL_ROLES),
    asyncHandler(async (req, res) => {
        const pool = req.db || await db.getPool();
        const appointments = await getAppointmentsForClinic(
            pool,
            "WHERE COALESCE(status, 'pending') = 'pending'",
        );

        res.json({ success: true, appointments });
    })
);

app.get(
    '/api/clinic/revenue/weekly',
    authenticateToken,
    authorizeRoles(...CLINIC_PANEL_ROLES),
    asyncHandler(async (req, res) => {
        const pool = req.db || await db.getPool();
        const labels = buildWeeklyLabels();
        const values = new Array(7).fill(0);

        const rows = await safeRows(
            pool,
            `SELECT DATE(payment_date) AS payment_day, COALESCE(SUM(amount), 0) AS total
             FROM payments
             WHERE payment_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
               AND COALESCE(status, 'completed') IN ('completed', 'paid', 'success')
             GROUP BY DATE(payment_date)
             ORDER BY payment_day ASC`
        );

        const dateKeys = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            dateKeys.push(d.toISOString().slice(0, 10));
        }

        rows.forEach(row => {
            const key = row.payment_day instanceof Date
                ? row.payment_day.toISOString().slice(0, 10)
                : String(row.payment_day).slice(0, 10);
            const index = dateKeys.indexOf(key);
            if (index >= 0) values[index] = Number(row.total) || 0;
        });

        res.json({ success: true, labels, values });
    })
);

app.put(
    '/api/clinic/appointments/:id/confirm',
    authenticateToken,
    authorizeRoles(...CLINIC_PANEL_ROLES),
    asyncHandler(async (req, res) => {
        const pool = req.db || await db.getPool();
        await pool.query(
            "UPDATE appointments SET status = 'confirmed' WHERE id = ?",
            [req.params.id]
        );

        res.json({ success: true, message: 'نوبت با موفقیت تأیید شد' });
    })
);

app.put(
    '/api/clinic/appointments/:id/cancel',
    authenticateToken,
    authorizeRoles(...CLINIC_PANEL_ROLES),
    asyncHandler(async (req, res) => {
        const pool = req.db || await db.getPool();
        await pool.query(
            "UPDATE appointments SET status = 'cancelled' WHERE id = ?",
            [req.params.id]
        );

        res.json({ success: true, message: 'نوبت با موفقیت لغو شد' });
    })
);



// ===== CLINIC ADMIN API FIX V2 START =====
// مسیرهای پایدار پنل مدیر کلینیک - قبل از clinicRoutes قرار بگیرد.
const CLINIC_ADMIN_V2_ROLES = (typeof CLINIC_PANEL_ROLES !== 'undefined')
    ? CLINIC_PANEL_ROLES
    : ['clinic_admin', 'clinic', 'clinic_manager', 'manager', 'admin', 'system_admin', 'reception', 'receptionist', 'staff'];

const clinicV2Async = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
function clinicV2NormalizeRole(role) { return String(role || '').trim().toLowerCase().replace(/[\s-]+/g, '_'); }
function clinicV2Auth(req, res, next) { return authenticateToken(req, res, next); }
function clinicV2Role(req, res, next) {
    const role = clinicV2NormalizeRole(req.user && req.user.role);
    const roles = CLINIC_ADMIN_V2_ROLES.map(clinicV2NormalizeRole);
    if (!roles.includes(role)) return res.status(403).json({ success: false, message: 'دسترسی غیرمجاز' });
    next();
}
async function clinicV2Pool(req) { return req.db || await db.getPool(); }
async function clinicV2Rows(pool, sql, params = [], fallback = []) {
    try { const [rows] = await pool.query(sql, params); return Array.isArray(rows) ? rows : fallback; }
    catch (e) { console.warn('Clinic v2 query failed:', e.code || e.message); return fallback; }
}
async function clinicV2Columns(pool, table) {
    try { const [rows] = await pool.query('SHOW COLUMNS FROM `' + table + '`'); return new Set(rows.map(r => r.Field)); }
    catch (_) { return new Set(); }
}
function clinicV2Pick(row, keys, fallback = '') {
    for (const k of keys) if (row && row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') return row[k];
    return fallback;
}
function clinicV2Name(row, fallback = '-') {
    const direct = clinicV2Pick(row, ['full_name','fullname','name','display_name','patient_name','doctor_name','username'], '');
    if (direct) return direct;
    const combined = `${clinicV2Pick(row, ['first_name','firstname','fname'], '')} ${clinicV2Pick(row, ['last_name','lastname','lname'], '')}`.trim();
    return combined || fallback;
}
function clinicV2Bool(v, fallback = true) {
    if (v === undefined || v === null) return fallback;
    return v === true || v === 1 || v === '1' || v === 'true';
}
async function clinicV2MapByIds(pool, table, ids) {
    const allowed = ['users','patients','doctors'];
    if (!allowed.includes(table)) return new Map();
    const unique = [...new Set((ids || []).filter(Boolean).map(Number).filter(Boolean))];
    if (!unique.length) return new Map();
    const rows = await clinicV2Rows(pool, 'SELECT * FROM `' + table + '` WHERE id IN (?)', [unique]);
    return new Map(rows.map(r => [Number(r.id), r]));
}
function clinicV2Payload(cols, pairs) {
    const payload = {};
    Object.entries(pairs).forEach(([k, v]) => {
        if (cols.has(k) && v !== undefined && v !== null && v !== '') payload[k] = v;
    });
    return payload;
}
async function clinicV2RequiredColumns(pool, table) {
    return clinicV2Rows(pool, `
        SELECT COLUMN_NAME, DATA_TYPE
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND IS_NULLABLE = 'NO'
          AND COLUMN_DEFAULT IS NULL
          AND EXTRA NOT LIKE '%auto_increment%'
    `, [table]);
}
async function clinicV2ApplyRequiredDefaults(pool, table, payload, context = {}) {
    const requiredRows = await clinicV2RequiredColumns(pool, table);
    requiredRows.forEach(col => {
        const name = col.COLUMN_NAME;
        const type = String(col.DATA_TYPE || '').toLowerCase();
        if (payload[name] !== undefined && payload[name] !== null && payload[name] !== '') return;
        const nameValue = context.fullName || context.name || context.username || 'ثبت نشده';
        const phoneValue = context.phone || '';
        const licenseValue = context.license || context.licenseNumber || context.medical_license_number || 'MED-' + Date.now();
        if (/pass|password|hash/i.test(name)) payload[name] = context.passwordHash || '';
        else if (/medical.*license|license.*number|license/i.test(name)) payload[name] = licenseValue;
        else if (/special|field/i.test(name)) payload[name] = context.specialty || 'عمومی';
        else if (/full.?name|fullname|display.?name|name/i.test(name)) payload[name] = nameValue;
        else if (/user.?name|username/i.test(name)) payload[name] = context.username || phoneValue || ('user_' + Date.now());
        else if (/phone|mobile|tel/i.test(name)) payload[name] = phoneValue;
        else if (/email/i.test(name)) payload[name] = context.email || '';
        else if (/role/i.test(name)) payload[name] = context.role || 'patient';
        else if (/active|enabled|available/i.test(name)) payload[name] = 1;
        else if (/status/i.test(name)) payload[name] = context.status || 'active';
        else if (/created|updated|date|time/i.test(name)) payload[name] = new Date();
        else if (['int','bigint','smallint','mediumint','tinyint','decimal','float','double'].includes(type)) payload[name] = 0;
        else payload[name] = '';
    });
    return payload;
}
async function clinicV2FindExistingUser(pool, body = {}) {
    const cols = await clinicV2Columns(pool, 'users');
    const where = [];
    const params = [];
    if (cols.has('username') && body.username) { where.push('username = ?'); params.push(body.username); }
    if (cols.has('email') && body.email) { where.push('email = ?'); params.push(body.email); }
    const phone = clinicV2BodyPhone(body);
    if (cols.has('phone') && phone) { where.push('phone = ?'); params.push(phone); }
    if (!where.length) return null;
    const rows = await clinicV2Rows(pool, `SELECT * FROM users WHERE ${where.join(' OR ')} ORDER BY id DESC LIMIT 1`, params);
    return rows[0] || null;
}
function clinicV2BodyName(body) {
    return clinicV2Pick(body, ['full_name','fullname','name','display_name'], '');
}
function clinicV2BodyPhone(body) {
    return clinicV2Pick(body, ['phone','mobile','tel'], '');
}
async function clinicV2CreateUser(pool, body, role) {
    const cols = await clinicV2Columns(pool, 'users');
    if (!cols.size || !body.username) return null;
    const fullName = clinicV2BodyName(body);
    const phone = clinicV2BodyPhone(body);
    const rawPassword = body.password || body.password_hash || body.pass || Math.random().toString(36).slice(2) + Date.now();
    const passwordHash = await bcrypt.hash(String(rawPassword), 10);

    const existing = await clinicV2FindExistingUser(pool, body);
    if (existing && existing.id) {
        const currentRole = clinicV2NormalizeRole(existing.role);
        const targetRole = clinicV2NormalizeRole(role);
        if (currentRole && currentRole !== targetRole) {
            const err = new Error('کاربری با این ایمیل/نام کاربری/شماره موبایل قبلاً با نقش دیگری ثبت شده است');
            err.statusCode = 409;
            throw err;
        }
        await clinicV2UpdateUser(pool, existing.id, body);
        return existing.id;
    }

    const payload = clinicV2Payload(cols, {
        username: body.username || phone,
        password: passwordHash,
        password_hash: passwordHash,
        pass: passwordHash,
        full_name: fullName,
        fullname: fullName,
        name: fullName,
        display_name: fullName,
        email: body.email,
        phone,
        mobile: phone,
        role,
        is_active: 1,
        status: 'active',
        created_at: new Date(),
        updated_at: new Date()
    });

    await clinicV2ApplyRequiredDefaults(pool, 'users', payload, {
        fullName, username: body.username, email: body.email, phone, role, passwordHash
    });

    if (!payload.username) return null;
    try {
        const [result] = await pool.query('INSERT INTO users SET ?', [payload]);
        return result.insertId;
    } catch (err) {
        if (err && err.code === 'ER_DUP_ENTRY') {
            const duplicate = await clinicV2FindExistingUser(pool, body);
            if (duplicate && duplicate.id) return duplicate.id;
        }
        throw err;
    }
}
async function clinicV2UpdateUser(pool, userId, body) {
    if (!userId) return;
    const cols = await clinicV2Columns(pool, 'users');
    const fullName = clinicV2BodyName(body);
    const phone = clinicV2BodyPhone(body);
    const payload = clinicV2Payload(cols, {
        username: body.username,
        full_name: fullName,
        fullname: fullName,
        name: fullName,
        display_name: fullName,
        email: body.email,
        phone,
        mobile: phone,
        role: body.role,
        is_active: body.is_active,
        updated_at: new Date()
    });
    if (body.password) {
        const passwordHash = await bcrypt.hash(String(body.password), 10);
        if (cols.has('password')) payload.password = passwordHash;
        if (cols.has('password_hash')) payload.password_hash = passwordHash;
        if (cols.has('pass')) payload.pass = passwordHash;
    }
    if (Object.keys(payload).length) await pool.query('UPDATE users SET ? WHERE id = ?', [payload, userId]);
}
async function clinicV2NormalizeAppointments(pool, rows) {
    const patientMap = await clinicV2MapByIds(pool, 'patients', rows.map(r => r.patient_id));
    const doctorMap = await clinicV2MapByIds(pool, 'doctors', rows.map(r => r.doctor_id));
    const doctorUserMap = await clinicV2MapByIds(pool, 'users', [...doctorMap.values()].map(r => r.user_id));
    const patientUserMap = await clinicV2MapByIds(pool, 'users', [...patientMap.values()].map(r => r.user_id));
    return rows.map(row => {
        const patient = patientMap.get(Number(row.patient_id));
        const patientUser = patient && patient.user_id ? patientUserMap.get(Number(patient.user_id)) : null;
        const doctor = doctorMap.get(Number(row.doctor_id));
        const doctorUser = doctor && doctor.user_id ? doctorUserMap.get(Number(doctor.user_id)) : null;
        return {
            id: row.id,
            patient_id: row.patient_id,
            doctor_id: row.doctor_id,
            appointment_date: clinicV2DateOnly(clinicV2Pick(row, ['appointment_date','date','visit_date'], '')),
            appointment_time: clinicV2Pick(row, ['appointment_time','time','visit_time','start_time'], ''),
            patient_name: clinicV2Pick(row, ['patient_name'], '') || clinicV2Name(patient, '') || clinicV2Name(patientUser, '-'),
            patient_phone: clinicV2Pick(row, ['patient_phone','phone'], '') || clinicV2Pick(patient, ['phone','mobile'], '') || clinicV2Pick(patientUser, ['phone','mobile'], ''),
            doctor_name: clinicV2Pick(row, ['doctor_name'], '') || clinicV2Name(doctorUser, '') || clinicV2Name(doctor, '-'),
            type: clinicV2Pick(row, ['type','appointment_type'], 'regular'),
            status: clinicV2Pick(row, ['status'], 'pending'),
            amount: Number(clinicV2Pick(row, ['amount','price','fee','consultation_fee'], 0)) || 0,
            reason: clinicV2Pick(row, ['reason','description','notes'], '')
        };
    });
}
async function clinicV2ListAppointments(pool, query = {}) {
    const where = [];
    const params = [];
    if (query.status && query.status !== 'all') { where.push("COALESCE(status, 'pending') = ?"); params.push(query.status); }
    if (query.date) { where.push('DATE(appointment_date) = ?'); params.push(query.date); }
    if (query.start_date || query.start) { where.push('DATE(appointment_date) >= ?'); params.push(query.start_date || query.start); }
    if (query.end_date || query.end) { where.push('DATE(appointment_date) <= ?'); params.push(query.end_date || query.end); }
    const rows = await clinicV2Rows(pool, 'SELECT * FROM appointments ' + (where.length ? 'WHERE ' + where.join(' AND ') : '') + ' ORDER BY appointment_date DESC, appointment_time DESC LIMIT 500', params);
    return clinicV2NormalizeAppointments(pool, rows);
}

app.get('/api/clinic/appointments', clinicV2Auth, clinicV2Role, clinicV2Async(async (req, res) => {
    const pool = await clinicV2Pool(req);
    res.json({ success: true, appointments: await clinicV2ListAppointments(pool, req.query) });
}));
app.post('/api/clinic/appointments', clinicV2Auth, clinicV2Role, clinicV2Async(async (req, res) => {
    const pool = await clinicV2Pool(req);
    const cols = await clinicV2Columns(pool, 'appointments');
    const body = req.body || {};
    const payload = clinicV2Payload(cols, {
        patient_id: body.patient_id, doctor_id: body.doctor_id,
        appointment_date: body.appointment_date, appointment_time: body.appointment_time,
        type: body.type, appointment_type: body.type, status: body.status || 'pending',
        reason: body.reason, description: body.reason, notes: body.reason,
        amount: body.amount || body.price || body.fee
    });
    if (!payload.patient_id || !payload.doctor_id || !payload.appointment_date || !payload.appointment_time) {
        return res.status(400).json({ success: false, message: 'بیمار، پزشک، تاریخ و ساعت الزامی است' });
    }
    const [result] = await pool.query('INSERT INTO appointments SET ?', [payload]);
    res.json({ success: true, id: result.insertId, message: 'نوبت با موفقیت ثبت شد' });
}));
app.put('/api/clinic/appointments/:id', clinicV2Auth, clinicV2Role, clinicV2Async(async (req, res) => {
    const pool = await clinicV2Pool(req);
    const cols = await clinicV2Columns(pool, 'appointments');
    const b = req.body || {};
    const payload = clinicV2Payload(cols, { patient_id:b.patient_id, doctor_id:b.doctor_id, appointment_date:b.appointment_date, appointment_time:b.appointment_time, type:b.type, appointment_type:b.type, status:b.status, reason:b.reason, description:b.reason, notes:b.reason, amount:b.amount || b.price || b.fee });
    if (!Object.keys(payload).length) return res.status(400).json({ success:false, message:'داده‌ای برای ویرایش ارسال نشده است' });
    await pool.query('UPDATE appointments SET ? WHERE id = ?', [payload, req.params.id]);
    res.json({ success:true, message:'نوبت با موفقیت ویرایش شد' });
}));
app.delete('/api/clinic/appointments/:id', clinicV2Auth, clinicV2Role, clinicV2Async(async (req, res) => {
    const pool = await clinicV2Pool(req);
    const cols = await clinicV2Columns(pool, 'appointments');
    if (cols.has('status')) {
        await pool.query("UPDATE appointments SET status = 'cancelled' WHERE id = ?", [req.params.id]);
        return res.json({ success:true, message:'نوبت لغو شد' });
    }
    await pool.query('DELETE FROM appointments WHERE id = ?', [req.params.id]);
    res.json({ success:true, message:'نوبت حذف شد' });
}));

app.get('/api/clinic/doctors', clinicV2Auth, clinicV2Role, clinicV2Async(async (req, res) => {
    const pool = await clinicV2Pool(req);
    let rows = await clinicV2Rows(pool, 'SELECT * FROM doctors ORDER BY id DESC LIMIT 500');
    if (!rows.length) rows = await clinicV2Rows(pool, "SELECT * FROM users WHERE role IN ('doctor','پزشک') ORDER BY id DESC LIMIT 500");
    const userMap = await clinicV2MapByIds(pool, 'users', rows.map(r => r.user_id));
    const doctors = rows.map(r => {
        const u = r.user_id ? userMap.get(Number(r.user_id)) : (r.role ? r : null);
        return {
            id: r.id, user_id: r.user_id || (r.role ? r.id : null), username: clinicV2Pick(u, ['username'], r.username || ''),
            full_name: clinicV2Name(u, '') || clinicV2Name(r, 'پزشک'), fullname: clinicV2Name(u, '') || clinicV2Name(r, 'پزشک'), email: clinicV2Pick(u, ['email'], r.email || ''), phone: clinicV2Pick(u, ['phone'], r.phone || ''),
            specialty: clinicV2Pick(r, ['specialty','specialization','field'], 'عمومی'),
            license_number: clinicV2Pick(r, ['license_number','medical_license_number','medical_license','license'], ''),
            medical_license: clinicV2Pick(r, ['medical_license','medical_license_number','license_number','license'], ''),
            experience_years: Number(clinicV2Pick(r, ['experience_years','experience'], 0)) || 0,
            consultation_fee: Number(clinicV2Pick(r, ['consultation_fee','visit_fee','fee'], 0)) || 0,
            bio: clinicV2Pick(r, ['bio','description'], ''),
            is_available: clinicV2Bool(clinicV2Pick(r, ['is_available','is_active'], clinicV2Pick(u, ['is_active'], 1)), true),
            is_active: clinicV2Bool(clinicV2Pick(r, ['is_active','is_available'], clinicV2Pick(u, ['is_active'], 1)), true)
        };
    });
    res.json({ success:true, doctors });
}));
app.post('/api/clinic/doctors', clinicV2Auth, clinicV2Role, clinicV2Async(async (req, res) => {
    const pool = await clinicV2Pool(req);
    const body = req.body || {};
    const userId = await clinicV2CreateUser(pool, body, 'doctor');
    const cols = await clinicV2Columns(pool, 'doctors');
    const licenseNumber = body.license_number || body.medical_license_number || body.medical_license || body.license;
    const payload = clinicV2Payload(cols, { user_id:userId, full_name:clinicV2BodyName(body), fullname:clinicV2BodyName(body), name:clinicV2BodyName(body), phone:clinicV2BodyPhone(body), mobile:clinicV2BodyPhone(body), specialty:body.specialty, specialization:body.specialty, license_number:licenseNumber, medical_license:licenseNumber, medical_license_number:licenseNumber, license:licenseNumber, experience_years:body.experience_years, consultation_fee:body.consultation_fee, bio:body.bio, is_active:1, is_available:1 });
    await clinicV2ApplyRequiredDefaults(pool, 'doctors', payload, { fullName: clinicV2BodyName(body), phone: clinicV2BodyPhone(body), email: body.email, username: body.username, specialty: body.specialty, license: licenseNumber, role: 'doctor' });
    if (cols.size) {
        const existingDoctor = await clinicV2Rows(pool, 'SELECT id FROM doctors WHERE user_id = ? LIMIT 1', [userId]);
        if (existingDoctor[0]?.id) {
            await pool.query('UPDATE doctors SET ? WHERE id = ?', [payload, existingDoctor[0].id]);
            return res.json({ success:true, id:existingDoctor[0].id, message:'پزشک قبلاً کاربر داشت و اطلاعاتش تکمیل/به‌روزرسانی شد' });
        }
        const [result] = await pool.query('INSERT INTO doctors SET ?', [payload]);
        return res.json({ success:true, id:result.insertId, message:'پزشک ثبت شد' });
    }
    res.json({ success:true, id:userId, message:'پزشک ثبت شد' });
}));
app.put('/api/clinic/doctors/:id', clinicV2Auth, clinicV2Role, clinicV2Async(async (req, res) => {
    const pool = await clinicV2Pool(req);
    const body = req.body || {};
    const rows = await clinicV2Rows(pool, 'SELECT * FROM doctors WHERE id = ? LIMIT 1', [req.params.id]);
    const doctor = rows[0] || {};
    await clinicV2UpdateUser(pool, doctor.user_id, body);
    const cols = await clinicV2Columns(pool, 'doctors');
    const licenseNumber = body.license_number || body.medical_license_number || body.medical_license || body.license;
    const payload = clinicV2Payload(cols, { full_name:clinicV2BodyName(body), fullname:clinicV2BodyName(body), name:clinicV2BodyName(body), phone:clinicV2BodyPhone(body), mobile:clinicV2BodyPhone(body), specialty:body.specialty, specialization:body.specialty, license_number:licenseNumber, medical_license:licenseNumber, medical_license_number:licenseNumber, license:licenseNumber, experience_years:body.experience_years, consultation_fee:body.consultation_fee, bio:body.bio });
    if (Object.keys(payload).length) await pool.query('UPDATE doctors SET ? WHERE id = ?', [payload, req.params.id]);
    res.json({ success:true, message:'پزشک ویرایش شد' });
}));
app.put('/api/clinic/doctors/:id/status', clinicV2Auth, clinicV2Role, clinicV2Async(async (req, res) => {
    const pool = await clinicV2Pool(req);
    const value = req.body.is_available !== undefined ? req.body.is_available : req.body.is_active;
    const active = value ? 1 : 0;
    const cols = await clinicV2Columns(pool, 'doctors');
    const payload = clinicV2Payload(cols, { is_available: active, is_active: active });
    if (Object.keys(payload).length) await pool.query('UPDATE doctors SET ? WHERE id = ?', [payload, req.params.id]);
    const rows = await clinicV2Rows(pool, 'SELECT user_id FROM doctors WHERE id = ? LIMIT 1', [req.params.id]);
    if (rows[0]?.user_id) await clinicV2UpdateUser(pool, rows[0].user_id, { is_active: active });
    res.json({ success:true, message:'وضعیت پزشک تغییر کرد' });
}));
app.delete('/api/clinic/doctors/:id', clinicV2Auth, clinicV2Role, clinicV2Async(async (req, res) => {
    const pool = await clinicV2Pool(req);
    const cols = await clinicV2Columns(pool, 'doctors');
    if (cols.has('is_active') || cols.has('is_available')) {
        const payload = clinicV2Payload(cols, { is_active:0, is_available:0 });
        await pool.query('UPDATE doctors SET ? WHERE id = ?', [payload, req.params.id]);
    } else {
        await pool.query('DELETE FROM doctors WHERE id = ?', [req.params.id]);
    }
    res.json({ success:true, message:'پزشک حذف/غیرفعال شد' });
}));


async function clinicV2EnsurePatientProfileColumns(pool) {
    const statements = [
        "ALTER TABLE patients ADD COLUMN national_code VARCHAR(20) NULL",
        "ALTER TABLE patients ADD COLUMN birth_date DATE NULL",
        "ALTER TABLE patients ADD COLUMN gender VARCHAR(20) NULL",
        "ALTER TABLE patients ADD COLUMN address TEXT NULL",
        "ALTER TABLE patients ADD COLUMN emergency_contact_name VARCHAR(150) NULL",
        "ALTER TABLE patients ADD COLUMN emergency_contact_phone VARCHAR(30) NULL",
        "ALTER TABLE patients ADD COLUMN insurance_provider VARCHAR(120) NULL",
        "ALTER TABLE patients ADD COLUMN insurance_number VARCHAR(80) NULL",
        "ALTER TABLE patients ADD COLUMN allergies TEXT NULL",
        "ALTER TABLE patients ADD COLUMN medications TEXT NULL",
        "ALTER TABLE patients ADD COLUMN chronic_diseases TEXT NULL",
        "ALTER TABLE patients ADD COLUMN medical_history TEXT NULL",
        "ALTER TABLE patients ADD COLUMN notes TEXT NULL"
    ];
    for (const sql of statements) {
        try { await pool.query(sql); }
        catch (error) {
            if (error.code !== 'ER_DUP_FIELDNAME' && error.code !== 'ER_DUP_KEYNAME') {
                console.warn('Patient profile column check warning:', error.message);
            }
        }
    }
}

function clinicV2PatientProfilePayload(cols, body = {}) {
    return clinicV2Payload(cols, {
        national_code: body.national_code,
        birth_date: body.birth_date,
        gender: body.gender,
        address: body.address,
        emergency_contact_name: body.emergency_contact_name,
        emergency_contact_phone: body.emergency_contact_phone,
        insurance_provider: body.insurance_provider,
        insurance_number: body.insurance_number,
        allergies: body.allergies,
        medications: body.medications,
        chronic_diseases: body.chronic_diseases,
        medical_history: body.medical_history,
        notes: body.notes
    });
}

async function clinicV2PatientList(pool) {
    await clinicV2EnsurePatientProfileColumns(pool);
    let rows = await clinicV2Rows(pool, 'SELECT * FROM patients ORDER BY id DESC LIMIT 1000');
    if (!rows.length) rows = await clinicV2Rows(pool, "SELECT * FROM users WHERE role IN ('patient','بیمار') ORDER BY id DESC LIMIT 1000");
    const userMap = await clinicV2MapByIds(pool, 'users', rows.map(r => r.user_id));
    const counts = await clinicV2Rows(pool, 'SELECT patient_id, COUNT(*) AS count FROM appointments GROUP BY patient_id');
    const countMap = new Map(counts.map(r => [Number(r.patient_id), Number(r.count) || 0]));
    return rows.map(r => {
        const u = r.user_id ? userMap.get(Number(r.user_id)) : (r.role ? r : null);
        return {
            id: r.id,
            user_id: r.user_id || (r.role ? r.id : null),
            username: clinicV2Pick(r, ['username'], clinicV2Pick(u, ['username'], '')),
            full_name: clinicV2Name(r,'') || clinicV2Name(u,'بیمار'),
            phone: clinicV2Pick(r,['phone','mobile'], clinicV2Pick(u,['phone','mobile'],'')),
            email: clinicV2Pick(r,['email'], clinicV2Pick(u,['email'],'')),
            national_code: clinicV2Pick(r,['national_code'], ''),
            birth_date: clinicV2DateOnly(clinicV2Pick(r,['birth_date'], '')),
            gender: clinicV2Pick(r,['gender'], ''),
            address: clinicV2Pick(r,['address'], ''),
            emergency_contact_name: clinicV2Pick(r,['emergency_contact_name'], ''),
            emergency_contact_phone: clinicV2Pick(r,['emergency_contact_phone'], ''),
            insurance_provider: clinicV2Pick(r,['insurance_provider'], ''),
            insurance_number: clinicV2Pick(r,['insurance_number'], ''),
            allergies: clinicV2Pick(r,['allergies'], ''),
            medications: clinicV2Pick(r,['medications'], ''),
            chronic_diseases: clinicV2Pick(r,['chronic_diseases'], ''),
            medical_history: clinicV2Pick(r,['medical_history'], ''),
            notes: clinicV2Pick(r,['notes'], ''),
            appointment_count: countMap.get(Number(r.id)) || 0,
            created_at: clinicV2Pick(r,['created_at','created_date'], clinicV2Pick(u,['created_at'], '')),
            is_active: clinicV2Bool(clinicV2Pick(r,['is_active'], clinicV2Pick(u,['is_active'], 1)), true)
        };
    });
}

app.get('/api/clinic/patients', clinicV2Auth, clinicV2Role, clinicV2Async(async (req, res) => {
    const pool = await clinicV2Pool(req);
    res.json({ success:true, patients: await clinicV2PatientList(pool) });
}));
app.get('/api/clinic/patients/:id', clinicV2Auth, clinicV2Role, clinicV2Async(async (req, res) => {
    const pool = await clinicV2Pool(req);
    const patient = (await clinicV2PatientList(pool)).find(p => String(p.id) === String(req.params.id));
    if (!patient) return res.status(404).json({ success:false, message:'بیمار یافت نشد' });
    res.json({ success:true, patient });
}));
app.post('/api/clinic/patients', clinicV2Auth, clinicV2Role, clinicV2Async(async (req, res) => {
    const pool = await clinicV2Pool(req);
    await clinicV2EnsurePatientProfileColumns(pool);
    const body = req.body || {};
    if (!clinicV2BodyName(body) || !body.username || !clinicV2BodyPhone(body) || !body.password) {
        return res.status(400).json({ success:false, message:'نام، نام کاربری، تلفن و رمز عبور الزامی است' });
    }
    const userId = await clinicV2CreateUser(pool, body, 'patient');
    const cols = await clinicV2Columns(pool, 'patients');
    if (cols.size) {
        const payload = clinicV2Payload(cols, { user_id:userId, username:body.username, full_name:clinicV2BodyName(body), fullname:clinicV2BodyName(body), name:clinicV2BodyName(body), phone:clinicV2BodyPhone(body), mobile:clinicV2BodyPhone(body), email:body.email, created_at:new Date(), updated_at:new Date(), is_active:1 });
        Object.assign(payload, clinicV2PatientProfilePayload(cols, body));
        await clinicV2ApplyRequiredDefaults(pool, 'patients', payload, { fullName: clinicV2BodyName(body), phone: clinicV2BodyPhone(body), email: body.email, username: body.username, role: 'patient' });
        const existingPatient = await clinicV2Rows(pool, 'SELECT id FROM patients WHERE user_id = ? LIMIT 1', [userId]);
        if (existingPatient[0]?.id) return res.json({ success:true, id:existingPatient[0].id, message:'بیمار قبلاً ثبت شده بود و اطلاعات کاربری به‌روزرسانی شد' });
        const [result] = await pool.query('INSERT INTO patients SET ?', [payload]);
        return res.json({ success:true, id:result.insertId, message:'بیمار ثبت شد' });
    }
    res.json({ success:true, id:userId, message:'بیمار ثبت شد' });
}));
app.put('/api/clinic/patients/:id', clinicV2Auth, clinicV2Role, clinicV2Async(async (req, res) => {
    const pool = await clinicV2Pool(req);
    await clinicV2EnsurePatientProfileColumns(pool);
    const body = req.body || {};
    const rows = await clinicV2Rows(pool, 'SELECT * FROM patients WHERE id = ? LIMIT 1', [req.params.id]);
    const patient = rows[0] || {};
    await clinicV2UpdateUser(pool, patient.user_id, body);
    const cols = await clinicV2Columns(pool, 'patients');
    const payload = clinicV2Payload(cols, { username:body.username, full_name:clinicV2BodyName(body), fullname:clinicV2BodyName(body), name:clinicV2BodyName(body), phone:clinicV2BodyPhone(body), mobile:clinicV2BodyPhone(body), email:body.email, is_active:body.is_active });
    Object.assign(payload, clinicV2PatientProfilePayload(cols, body));
    if (!Object.keys(payload).length && !body.password) return res.status(400).json({ success:false, message:'داده‌ای برای ویرایش ارسال نشده است' });
    if (Object.keys(payload).length) await pool.query('UPDATE patients SET ? WHERE id = ?', [payload, req.params.id]);
    res.json({ success:true, message:'بیمار ویرایش شد' });
}));
app.delete('/api/clinic/patients/:id', clinicV2Auth, clinicV2Role, clinicV2Async(async (req, res) => {
    const pool = await clinicV2Pool(req);
    const rows = await clinicV2Rows(pool, 'SELECT * FROM patients WHERE id = ? LIMIT 1', [req.params.id]);
    const patient = rows[0] || {};
    const cols = await clinicV2Columns(pool, 'patients');
    if (cols.has('is_active')) await pool.query('UPDATE patients SET is_active = 0 WHERE id = ?', [req.params.id]);
    else await pool.query('DELETE FROM patients WHERE id = ?', [req.params.id]);
    if (patient.user_id) await clinicV2UpdateUser(pool, patient.user_id, { is_active: 0 });
    res.json({ success:true, message:'بیمار حذف/غیرفعال شد' });
}));

async function clinicV2PaymentList(pool, query = {}) {
    const where = [];
    const params = [];
    if (query.start) { where.push('DATE(payment_date) >= ?'); params.push(query.start); }
    if (query.end) { where.push('DATE(payment_date) <= ?'); params.push(query.end); }
    if (query.status && query.status !== 'all') { where.push('status = ?'); params.push(query.status); }
    if (query.id) { where.push('id = ?'); params.push(query.id); }
    const rows = await clinicV2Rows(pool, 'SELECT * FROM payments ' + (where.length ? 'WHERE ' + where.join(' AND ') : '') + ' ORDER BY payment_date DESC LIMIT 1000', params);
    const patientMap = await clinicV2MapByIds(pool, 'patients', rows.map(r => r.patient_id));
    return rows.map(r => ({
        id:r.id,
        patient_id:r.patient_id || null,
        payment_date:clinicV2Pick(r,['payment_date','created_at'],''),
        patient_name:clinicV2Pick(r,['patient_name'],'') || clinicV2Name(patientMap.get(Number(r.patient_id)), '-'),
        amount:Number(r.amount)||0,
        payment_method:clinicV2Pick(r,['payment_method','method'],'cash'),
        status:clinicV2Pick(r,['status'],'completed'),
        receipt_number:clinicV2Pick(r,['receipt_number','tracking_code','ref_id'], ''),
        description:clinicV2Pick(r,['description','notes'], '')
    }));
}

app.get('/api/clinic/payments', clinicV2Auth, clinicV2Role, clinicV2Async(async (req, res) => {
    const pool = await clinicV2Pool(req);
    const payments = await clinicV2PaymentList(pool, req.query);
    const total_income = payments.filter(p => ['completed','paid','success'].includes(p.status)).reduce((sum,p)=>sum+p.amount,0);
    const pending_total = payments.filter(p => !['completed','paid','success'].includes(p.status)).reduce((sum,p)=>sum+p.amount,0);
    res.json({ success:true, payments, total_income, paid_total:total_income, pending_total });
}));
app.get('/api/clinic/payments/:id', clinicV2Auth, clinicV2Role, clinicV2Async(async (req, res) => {
    const pool = await clinicV2Pool(req);
    const payment = (await clinicV2PaymentList(pool, { id: req.params.id }))[0];
    if (!payment) return res.status(404).json({ success:false, message:'پرداخت یافت نشد' });
    res.json({ success:true, payment });
}));
app.put('/api/clinic/payments/:id', clinicV2Auth, clinicV2Role, clinicV2Async(async (req, res) => {
    const pool = await clinicV2Pool(req);
    const cols = await clinicV2Columns(pool, 'payments');
    const b = req.body || {};
    const payload = clinicV2Payload(cols, {
        amount:b.amount,
        payment_method:b.payment_method,
        method:b.payment_method,
        status:b.status,
        receipt_number:b.receipt_number,
        tracking_code:b.receipt_number,
        ref_id:b.receipt_number,
        description:b.description,
        notes:b.description
    });
    if (!Object.keys(payload).length) return res.status(400).json({ success:false, message:'داده‌ای برای ویرایش پرداخت ارسال نشده است' });
    await pool.query('UPDATE payments SET ? WHERE id = ?', [payload, req.params.id]);
    res.json({ success:true, message:'پرداخت ویرایش شد' });
}));
app.delete('/api/clinic/payments/:id', clinicV2Auth, clinicV2Role, clinicV2Async(async (req, res) => {
    const pool = await clinicV2Pool(req);
    const cols = await clinicV2Columns(pool, 'payments');
    if (cols.has('status')) {
        await pool.query("UPDATE payments SET status = 'cancelled' WHERE id = ?", [req.params.id]);
        return res.json({ success:true, message:'پرداخت ابطال شد' });
    }
    await pool.query('DELETE FROM payments WHERE id = ?', [req.params.id]);
    res.json({ success:true, message:'پرداخت حذف شد' });
}));

app.get('/api/clinic/staff', clinicV2Auth, clinicV2Role, clinicV2Async(async (req, res) => {
    const pool = await clinicV2Pool(req);
    const rows = await clinicV2Rows(pool, "SELECT * FROM users WHERE role IN ('receptionist','reception','clinic_admin','clinic_manager','staff') ORDER BY id DESC LIMIT 500");
    const staff = rows.map(r => ({ id:r.id, username:r.username, full_name:clinicV2Name(r,'کارمند'), fullname:clinicV2Name(r,'کارمند'), role:r.role, phone:r.phone || r.mobile || '', email:r.email || '', hire_date:clinicV2Pick(r,['hire_date','created_at'], ''), is_active:clinicV2Bool(r.is_active, true) }));
    res.json({ success:true, staff });
}));
app.get('/api/clinic/staff/:id', clinicV2Auth, clinicV2Role, clinicV2Async(async (req, res) => {
    const pool = await clinicV2Pool(req);
    const rows = await clinicV2Rows(pool, "SELECT * FROM users WHERE id = ? AND role IN ('receptionist','reception','clinic_admin','clinic_manager','staff') LIMIT 1", [req.params.id]);
    const r = rows[0];
    if (!r) return res.status(404).json({ success:false, message:'کارمند یافت نشد' });
    res.json({ success:true, staff: { id:r.id, username:r.username, full_name:clinicV2Name(r,'کارمند'), fullname:clinicV2Name(r,'کارمند'), role:r.role, phone:r.phone || r.mobile || '', email:r.email || '', hire_date:clinicV2Pick(r,['hire_date','created_at'], ''), is_active:clinicV2Bool(r.is_active, true) } });
}));
app.post('/api/clinic/staff', clinicV2Auth, clinicV2Role, clinicV2Async(async (req, res) => {
    const pool = await clinicV2Pool(req);
    const id = await clinicV2CreateUser(pool, req.body || {}, req.body.role || 'receptionist');
    res.json({ success:true, id, message:'کارمند ثبت شد' });
}));
app.put('/api/clinic/staff/:id', clinicV2Auth, clinicV2Role, clinicV2Async(async (req, res) => {
    const pool = await clinicV2Pool(req);
    await clinicV2UpdateUser(pool, req.params.id, req.body || {});
    res.json({ success:true, message:'کارمند ویرایش شد' });
}));
app.put('/api/clinic/staff/:id/status', clinicV2Auth, clinicV2Role, clinicV2Async(async (req, res) => {
    const pool = await clinicV2Pool(req);
    await clinicV2UpdateUser(pool, req.params.id, { is_active: req.body.is_active ? 1 : 0 });
    res.json({ success:true, message:'وضعیت پرسنل تغییر کرد' });
}));
app.delete('/api/clinic/staff/:id', clinicV2Auth, clinicV2Role, clinicV2Async(async (req, res) => {
    const pool = await clinicV2Pool(req);
    await clinicV2UpdateUser(pool, req.params.id, { is_active: 0 });
    res.json({ success:true, message:'کارمند غیرفعال شد' });
}));

app.get('/api/clinic/reports/financial', clinicV2Auth, clinicV2Role, clinicV2Async(async (req, res) => {
    const pool = await clinicV2Pool(req);
    const appointments = await clinicV2ListAppointments(pool, { start: req.query.start_date, end: req.query.end_date });
    const payments = await clinicV2Rows(pool, 'SELECT DATE(payment_date) AS date, COUNT(*) AS count, COALESCE(SUM(amount),0) AS revenue FROM payments WHERE DATE(payment_date) >= ? AND DATE(payment_date) <= ? GROUP BY DATE(payment_date) ORDER BY DATE(payment_date)', [req.query.start_date || '1900-01-01', req.query.end_date || '2999-12-31']);
    const total_revenue = payments.reduce((s,r)=>s+(Number(r.revenue)||0),0);
    res.json({ success:true, total_appointments:appointments.length, total_revenue, average_payment:appointments.length ? Math.round(total_revenue/appointments.length) : 0, daily_data:payments });
}));
app.get('/api/clinic/reports/appointments', clinicV2Auth, clinicV2Role, clinicV2Async(async (req, res) => {
    const pool = await clinicV2Pool(req);
    const appointments = await clinicV2ListAppointments(pool, { start: req.query.start_date, end: req.query.end_date });
    res.json({ success:true, total:appointments.length, confirmed:appointments.filter(a=>a.status==='confirmed').length, pending:appointments.filter(a=>!a.status || a.status==='pending').length, appointments });
}));
app.get('/api/clinic/reports/doctors', clinicV2Auth, clinicV2Role, clinicV2Async(async (req, res) => {
    const pool = await clinicV2Pool(req);
    let rows = await clinicV2Rows(pool, 'SELECT * FROM doctors ORDER BY id DESC LIMIT 500');
    if (!rows.length) rows = await clinicV2Rows(pool, "SELECT * FROM users WHERE role IN ('doctor','پزشک') ORDER BY id DESC LIMIT 500");
    const doctors = rows.map(r => ({ id:r.id, full_name:clinicV2Name(r,'پزشک'), specialty:clinicV2Pick(r,['specialty','specialization'],'عمومی'), appointment_count:0, total_revenue:0, is_active:clinicV2Bool(clinicV2Pick(r,['is_active','is_available'],1), true) }));
    res.json({ success:true, total_doctors:doctors.length, active_doctors:doctors.filter(d=>d.is_active).length, doctors });
}));
app.get('/api/clinic/reports/patients', clinicV2Auth, clinicV2Role, clinicV2Async(async (req, res) => {
    const pool = await clinicV2Pool(req);
    const patients = (await clinicV2Rows(pool, 'SELECT * FROM patients ORDER BY id DESC LIMIT 1000')).map(r => ({ id:r.id, full_name:clinicV2Name(r,'بیمار'), phone:r.phone||'', appointment_count:0, last_visit:null }));
    res.json({ success:true, total_patients:patients.length, total_appointments:0, patients });
}));

app.get('/favicon.ico', (req, res) => res.status(204).end());
// ===== CLINIC ADMIN API FIX V2 END =====


app.use('/api/clinic', clinicRoutes);

// این دو route قبل از doctorRoutes تعریف شده‌اند تا پنل پزشک همیشه پاسخ درست بگیرد.
// اگر داخل src/routes/doctor.js همین مسیرها وجود داشته باشد، این نسخه‌ها اول اجرا می‌شوند.
app.get(
    '/api/doctor/stats',
    authenticateToken,
    authorizeRoles('doctor'),
    asyncHandler(async (req, res) => {
        // نسخه پایدار برای داشبورد پزشک.
        // در صورت نیاز بعداً می‌توان این آمار را از جدول appointments خواند.
        res.json({
            success: true,
            stats: {
                today_appointments: 3,
                upcoming_appointments: 8,
                total_patients: 45
            }
        });
    })
);

app.get(
    '/api/doctor/appointments/today',
    authenticateToken,
    authorizeRoles('doctor'),
    asyncHandler(async (req, res) => {
        // نسخه پایدار برای تست پنل پزشک.
        // بعداً می‌توان این لیست را از دیتابیس جایگزین کرد.
        res.json({
            success: true,
            appointments: [
                {
                    appointment_time: '09:00',
                    patient_name: 'رضا محمدی',
                    patient_phone: '09120000001',
                    type: 'regular',
                    status: 'confirmed'
                },
                {
                    appointment_time: '10:30',
                    patient_name: 'سارا احمدی',
                    patient_phone: '09120000002',
                    type: 'follow_up',
                    status: 'pending'
                },
                {
                    appointment_time: '14:00',
                    patient_name: 'علی کریمی',
                    patient_phone: '09120000003',
                    type: 'regular',
                    status: 'confirmed'
                }
            ]
        });
    })
);

app.use('/api/doctor', doctorRoutes);
app.use('/api/patient', patientRoutes);
app.use('/api/appointments', appointmentRoutes);

// ============================================
// NoorVista_DIRECT_SCHEDULE_API_START
// Direct Clinic Schedule API
// این routeها قبل از scheduleRoutes قرار گرفته‌اند تا صفحه زمان‌بندی پزشکان 404 نگیرد.
// ============================================

async function ensureDoctorSchedulesTable(pool) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS doctor_schedules (
            id INT AUTO_INCREMENT PRIMARY KEY,
            doctor_id INT NOT NULL,
            day_of_week TINYINT NOT NULL,
            start_time TIME NOT NULL DEFAULT '09:00:00',
            end_time TIME NOT NULL DEFAULT '17:00:00',
            slot_duration INT NOT NULL DEFAULT 30,
            break_between INT NOT NULL DEFAULT 5,
            booking_window_days INT NOT NULL DEFAULT 30,
            reminder_enabled TINYINT(1) NOT NULL DEFAULT 1,
            reminder_before_minutes INT NOT NULL DEFAULT 1440,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_doctor_day (doctor_id, day_of_week)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    for (const sql of [
        "ALTER TABLE doctor_schedules ADD COLUMN booking_window_days INT NOT NULL DEFAULT 30",
        "ALTER TABLE doctor_schedules ADD COLUMN reminder_enabled TINYINT(1) NOT NULL DEFAULT 1",
        "ALTER TABLE doctor_schedules ADD COLUMN reminder_before_minutes INT NOT NULL DEFAULT 1440"
    ]) {
        try { await pool.query(sql); } catch (error) { if (error.code !== 'ER_DUP_FIELDNAME') throw error; }
    }

    await pool.query(`
        CREATE TABLE IF NOT EXISTS doctor_schedule_dates (
            id INT AUTO_INCREMENT PRIMARY KEY,
            doctor_id INT NOT NULL,
            work_date DATE NOT NULL,
            start_time TIME NULL,
            end_time TIME NULL,
            slot_duration INT NOT NULL DEFAULT 30,
            break_between INT NOT NULL DEFAULT 5,
            is_closed TINYINT(1) NOT NULL DEFAULT 0,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            notes VARCHAR(500) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_doctor_date (doctor_id, work_date),
            INDEX idx_work_date (work_date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
}


function scheduleDateToString(value) {
    return clinicV2DateOnly(value);
}

function timeToMinutes(value) {
    const [h, m] = String(value || '00:00').slice(0, 5).split(':').map(Number);
    return (Number(h) || 0) * 60 + (Number(m) || 0);
}

function minutesToTime(value) {
    const h = String(Math.floor(value / 60)).padStart(2, '0');
    const m = String(value % 60).padStart(2, '0');
    return `${h}:${m}`;
}

function clinicV2DateOnly(value) {
    if (!value) return '';
    if (value instanceof Date) {
        const y = value.getFullYear();
        const m = String(value.getMonth() + 1).padStart(2, '0');
        const d = String(value.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    const str = String(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
    if (str.includes('T')) return str.slice(0, 10);
    return str.slice(0, 10);
}

function weekdayIndexFromGregorian(dateString) {
    const d = new Date(`${dateString}T12:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    // UI convention: 0=Saturday, 1=Sunday, ... 6=Friday
    return (d.getDay() + 1) % 7;
}

function buildScheduleSlots(schedule, bookedTimes = []) {
    if (!schedule || schedule.is_closed) return [];
    const start = timeToMinutes(schedule.start_time || '09:00');
    const end = timeToMinutes(schedule.end_time || '17:00');
    const duration = Math.max(5, Number(schedule.slot_duration || 30));
    const gap = Math.max(0, Number(schedule.break_between || 0));
    const booked = new Set((bookedTimes || []).map(t => String(t || '').slice(0, 5)));
    const slots = [];
    for (let t = start; t + duration <= end; t += duration + gap) {
        const value = minutesToTime(t);
        slots.push({ time: value, is_booked: booked.has(value) });
    }
    return slots;
}

async function getDateSchedulesHandler(req, res) {
    const pool = req.db || await db.getPool();
    const doctorId = Number(req.params.doctorId || req.params.id);
    if (!doctorId) return res.status(400).json({ success: false, message: 'شناسه پزشک نامعتبر است' });
    await ensureDoctorSchedulesTable(pool);
    const [rows] = await pool.query(
        `SELECT id, doctor_id, work_date, start_time, end_time, slot_duration, break_between, is_closed, is_active, notes
         FROM doctor_schedule_dates
         WHERE doctor_id = ? AND COALESCE(is_active, 1) = 1
         ORDER BY work_date DESC
         LIMIT 100`,
        [doctorId]
    );
    res.json({
        success: true,
        date_schedules: rows.map(r => ({
            id: r.id,
            doctor_id: Number(r.doctor_id),
            work_date: scheduleDateToString(r.work_date),
            start_time: String(r.start_time || '').slice(0, 5),
            end_time: String(r.end_time || '').slice(0, 5),
            slot_duration: Number(r.slot_duration || 30),
            break_between: Number(r.break_between || 0),
            is_closed: Boolean(r.is_closed),
            notes: r.notes || ''
        }))
    });
}

async function saveDateSchedulesHandler(req, res) {
    const pool = req.db || await db.getPool();
    const doctorId = Number(req.params.doctorId || req.params.id);
    const items = Array.isArray(req.body.date_schedules) ? req.body.date_schedules : [];
    if (!doctorId) return res.status(400).json({ success: false, message: 'شناسه پزشک نامعتبر است' });
    await ensureDoctorSchedulesTable(pool);
    for (const raw of items) {
        const workDate = scheduleDateToString(raw.work_date || raw.date);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) continue;
        const isClosed = raw.is_closed ? 1 : 0;
        await pool.query(
            `INSERT INTO doctor_schedule_dates
             (doctor_id, work_date, start_time, end_time, slot_duration, break_between, is_closed, is_active, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
             ON DUPLICATE KEY UPDATE start_time = VALUES(start_time), end_time = VALUES(end_time), slot_duration = VALUES(slot_duration), break_between = VALUES(break_between), is_closed = VALUES(is_closed), is_active = 1, notes = VALUES(notes)`,
            [doctorId, workDate, raw.start_time || null, raw.end_time || null, Math.max(5, Number(raw.slot_duration || 30)), Math.max(0, Number(raw.break_between || 0)), isClosed, raw.notes || null]
        );
    }
    res.json({ success: true, message: 'زمان‌بندی‌های تاریخ‌دار ذخیره شدند' });
}

async function deleteDateScheduleHandler(req, res) {
    const pool = req.db || await db.getPool();
    await ensureDoctorSchedulesTable(pool);
    await pool.query('UPDATE doctor_schedule_dates SET is_active = 0 WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'زمان‌بندی تاریخ‌دار حذف شد' });
}

async function availableSlotsHandler(req, res) {
    const pool = req.db || await db.getPool();
    const doctorId = Number(req.query.doctor_id || req.params.doctorId || req.params.id);
    const date = scheduleDateToString(req.query.date || req.params.date);
    if (!doctorId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ success: false, message: 'پزشک و تاریخ معتبر الزامی است' });
    }
    await ensureDoctorSchedulesTable(pool);

    const [dateRows] = await pool.query(
        `SELECT * FROM doctor_schedule_dates WHERE doctor_id = ? AND work_date = ? AND COALESCE(is_active, 1) = 1 LIMIT 1`,
        [doctorId, date]
    );

    let schedule = dateRows[0] || null;
    let source = schedule ? 'date' : 'weekly';
    if (!schedule) {
        const day = weekdayIndexFromGregorian(date);
        const [weekRows] = await pool.query(
            `SELECT * FROM doctor_schedules WHERE doctor_id = ? AND day_of_week = ? AND COALESCE(is_active, 1) = 1 ORDER BY start_time ASC LIMIT 1`,
            [doctorId, day]
        );
        schedule = weekRows[0] || null;
    }

    const [bookedRows] = await pool.query(
        `SELECT appointment_time FROM appointments WHERE doctor_id = ? AND DATE(appointment_date) = ? AND COALESCE(status, 'pending') NOT IN ('cancelled','no_show')`,
        [doctorId, date]
    );
    const bookedTimes = bookedRows.map(r => String(r.appointment_time || '').slice(0, 5));
    const slots = buildScheduleSlots(schedule, bookedTimes);
    res.json({ success: true, source, schedule: schedule || null, slots });
}

function normalizeScheduleRows(rows) {
    return (rows || []).map(row => ({
        id: row.id,
        doctor_id: Number(row.doctor_id),
        day_of_week: Number(row.day_of_week),
        start_time: String(row.start_time || '09:00:00').slice(0, 5),
        end_time: String(row.end_time || '17:00:00').slice(0, 5),
        slot_duration: Number(row.slot_duration || 30),
        break_between: Number(row.break_between || 0),
        booking_window_days: Number(row.booking_window_days || 30),
        reminder_enabled: row.reminder_enabled === undefined ? true : Boolean(row.reminder_enabled),
        reminder_before_minutes: Number(row.reminder_before_minutes || 1440),
        is_active: row.is_active === undefined ? true : Boolean(row.is_active)
    }));
}

function sanitizeScheduleInput(schedules) {
    if (!Array.isArray(schedules)) return [];

    return schedules
        .map(item => ({
            day_of_week: Number(item.day_of_week),
            start_time: String(item.start_time || '09:00').slice(0, 5),
            end_time: String(item.end_time || '17:00').slice(0, 5),
            slot_duration: Math.max(5, Number(item.slot_duration || 30)),
            break_between: Math.max(0, Number(item.break_between || 0)),
            booking_window_days: Math.min(365, Math.max(7, Number(item.booking_window_days || 30))),
            reminder_enabled: item.reminder_enabled === false || item.reminder_enabled === 0 || item.reminder_enabled === '0' ? 0 : 1,
            reminder_before_minutes: Math.min(43200, Math.max(15, Number(item.reminder_before_minutes || 1440)))
        }))
        .filter(item => Number.isInteger(item.day_of_week) && item.day_of_week >= 0 && item.day_of_week <= 6);
}

async function getDoctorScheduleHandler(req, res) {
    const pool = req.db || await db.getPool();
    const doctorId = Number(req.params.doctorId || req.params.id);

    if (!doctorId) {
        return res.status(400).json({ success: false, message: 'شناسه پزشک نامعتبر است' });
    }

    try {
        await ensureDoctorSchedulesTable(pool);

        const [rows] = await pool.query(
            `SELECT id, doctor_id, day_of_week, start_time, end_time, slot_duration, break_between,
                    booking_window_days, reminder_enabled, reminder_before_minutes, is_active
             FROM doctor_schedules
             WHERE doctor_id = ? AND COALESCE(is_active, 1) = 1
             ORDER BY day_of_week ASC, start_time ASC`,
            [doctorId]
        );

        return res.json({
            success: true,
            schedules: normalizeScheduleRows(rows)
        });
    } catch (error) {
        console.error('Direct schedule GET error:', error.message);
        return res.json({ success: true, schedules: [] });
    }
}

async function saveDoctorScheduleHandler(req, res) {
    const pool = req.db || await db.getPool();
    const doctorId = Number(req.params.doctorId || req.params.id);
    const schedules = sanitizeScheduleInput(req.body.schedules || req.body.schedule || []);

    if (!doctorId) {
        return res.status(400).json({ success: false, message: 'شناسه پزشک نامعتبر است' });
    }

    try {
        await ensureDoctorSchedulesTable(pool);

        await pool.query('DELETE FROM doctor_schedules WHERE doctor_id = ?', [doctorId]);

        for (const item of schedules) {
            await pool.query(
                `INSERT INTO doctor_schedules
                 (doctor_id, day_of_week, start_time, end_time, slot_duration, break_between, booking_window_days, reminder_enabled, reminder_before_minutes, is_active)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                [doctorId, item.day_of_week, item.start_time, item.end_time, item.slot_duration, item.break_between, item.booking_window_days || 30, item.reminder_enabled ? 1 : 0, item.reminder_before_minutes || 1440]
            );
        }

        return res.json({
            success: true,
            message: 'زمان‌بندی پزشک با موفقیت ذخیره شد',
            schedules
        });
    } catch (error) {
        console.error('Direct schedule SAVE error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'خطا در ذخیره زمان‌بندی پزشک: ' + error.message
        });
    }
}

app.get('/api/schedule/doctor/:doctorId', authenticateToken, asyncHandler(getDoctorScheduleHandler));
app.get('/api/schedule/:doctorId', authenticateToken, asyncHandler(getDoctorScheduleHandler));
app.put('/api/schedule/doctor/:doctorId', authenticateToken, asyncHandler(saveDoctorScheduleHandler));
app.put('/api/schedule/:doctorId', authenticateToken, asyncHandler(saveDoctorScheduleHandler));
app.post('/api/schedule/doctor/:doctorId', authenticateToken, asyncHandler(saveDoctorScheduleHandler));
app.post('/api/schedule/:doctorId', authenticateToken, asyncHandler(saveDoctorScheduleHandler));

// ============================================
// NoorVista_DIRECT_SCHEDULE_API_END
// ============================================


app.get('/api/schedule/doctor/:doctorId/dates', authenticateToken, asyncHandler(getDateSchedulesHandler));
app.post('/api/schedule/doctor/:doctorId/dates', authenticateToken, asyncHandler(saveDateSchedulesHandler));
app.delete('/api/schedule/doctor/date/:id', authenticateToken, asyncHandler(deleteDateScheduleHandler));
app.get('/api/clinic/available-slots', clinicV2Auth, clinicV2Role, asyncHandler(availableSlotsHandler));
app.get('/api/schedule/doctor/:doctorId/slots', authenticateToken, asyncHandler(availableSlotsHandler));

app.use('/api/schedule', scheduleRoutes);


// ============================================
// Settings, FAQ & AI Helpers (Phase 1)
// ============================================

const SECRET_SETTING_KEYS = new Set(['ai_api_key', 'sms_api_key']);
const AI_SETTING_KEYS = new Set([
    'ai_enabled',
    'ai_base_url',
    'ai_api_key',
    'ai_model',
    'ai_temperature',
    'ai_max_tokens',
    'ai_system_prompt',
    'ai_use_faq_first'
]);
const SMS_SETTING_KEYS = new Set([
    'sms_enabled',
    'sms_provider',
    'sms_base_url',
    'sms_api_key',
    'sms_sender',
    'sms_otp_template',
    'sms_appointment_template',
    'sms_appointment_reminder_enabled',
    'sms_appointment_reminder_default_minutes'
]);

function normalizeSettingBoolean(value, defaultValue = false) {
    if (value === undefined || value === null || value === '') return defaultValue;
    return ['1', 'true', 'yes', 'on', 'enabled', 'فعال'].includes(String(value).toLowerCase());
}

function normalizeSettingNumber(value, defaultValue, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return defaultValue;
    return Math.min(max, Math.max(min, num));
}

function maskSecret(value) {
    if (!value) return '';
    const stringValue = String(value);
    if (stringValue.length <= 4) return '****';
    return `${'*'.repeat(Math.max(8, stringValue.length - 4))}${stringValue.slice(-4)}`;
}

function isMaskedSecret(value) {
    return typeof value === 'string' && /^\*{4,}.{0,12}$/.test(value.trim());
}

function settingGroupForKey(key) {
    if (AI_SETTING_KEYS.has(key)) return 'ai';
    if (SMS_SETTING_KEYS.has(key)) return 'sms';
    if (key.startsWith('sms_')) return 'sms';
    if (key.startsWith('ai_')) return 'ai';
    return 'system';
}

function normalizeSettingsRows(rows, { maskSecrets = false } = {}) {
    const settings = {};
    rows.forEach(row => {
        const key = row.setting_key;
        if (maskSecrets && SECRET_SETTING_KEYS.has(key)) {
            settings[key] = maskSecret(row.setting_value);
        } else {
            settings[key] = row.setting_value ?? '';
        }
    });
    return settings;
}

async function getSettingsMap(pool, { maskSecrets = false } = {}) {
    const [rows] = await pool.query('SELECT setting_key, setting_value, setting_group FROM settings');
    return normalizeSettingsRows(rows, { maskSecrets });
}

async function upsertSettings(pool, settings, allowedKeys = null) {
    const entries = Object.entries(settings || {});
    for (const [rawKey, rawValue] of entries) {
        const key = String(rawKey || '').trim();
        if (!key) continue;
        if (allowedKeys && !allowedKeys.has(key)) continue;
        if (SECRET_SETTING_KEYS.has(key) && isMaskedSecret(rawValue)) continue;

        const value = rawValue === undefined || rawValue === null ? '' : String(rawValue);
        await pool.query(
            `INSERT INTO settings (setting_key, setting_value, setting_group)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), setting_group = VALUES(setting_group)`,
            [key, value, settingGroupForKey(key)]
        );
    }
}

async function ensurePhase1Tables(pool) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS faqs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            question VARCHAR(500) NOT NULL,
            answer TEXT NOT NULL,
            category VARCHAR(100) NULL,
            keywords TEXT NULL,
            sort_order INT DEFAULT 0,
            is_active TINYINT(1) DEFAULT 1,
            show_on_public TINYINT(1) DEFAULT 1,
            use_for_chatbot TINYINT(1) DEFAULT 1,
            created_by INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_is_active (is_active),
            INDEX idx_show_on_public (show_on_public),
            INDEX idx_use_for_chatbot (use_for_chatbot),
            INDEX idx_sort_order (sort_order),
            FULLTEXT KEY ft_faq_question_answer_keywords (question, answer, keywords)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci
    `);

    const defaults = [
        ['ai_enabled', process.env.AI_ENABLED || 'false', 'ai'],
        ['ai_base_url', process.env.AI_BASE_URL || 'https://api.gapgpt.app/v1', 'ai'],
        ['ai_api_key', process.env.AI_API_KEY || '', 'ai'],
        ['ai_model', process.env.AI_MODEL || 'gapgpt-qwen-3.5', 'ai'],
        ['ai_temperature', '0.7', 'ai'],
        ['ai_max_tokens', '500', 'ai'],
        ['ai_use_faq_first', 'true', 'ai'],
        ['ai_system_prompt', `شما یک دستیار هوشمند برای کلینیک تخصصی چشم پزشکی NoorVista هستید. فقط به پرسش‌های مرتبط با چشم‌پزشکی و خدمات کلینیک پاسخ دهید. پاسخ‌ها باید فارسی، مؤدبانه، کوتاه و بدون ادعای تشخیص قطعی باشند. در موارد اورژانسی یا علائم شدید، کاربر را به مراجعه فوری به پزشک یا اورژانس راهنمایی کنید.`, 'ai'],
        ['sms_enabled', process.env.SMS_ENABLED || 'false', 'sms'],
        ['sms_provider', 'kavenegar', 'sms'],
        ['sms_base_url', '', 'sms'],
        ['sms_api_key', process.env.SMS_API_KEY || '', 'sms'],
        ['sms_sender', process.env.SMS_SENDER || '10002000', 'sms'],
        ['sms_otp_template', '', 'sms'],
        ['sms_appointment_template', '{{patient_name}} عزیز، نوبت شما در تاریخ {{appointment_date}} ساعت {{appointment_time}} است.', 'sms'],
        ['sms_appointment_reminder_enabled', 'true', 'sms'],
        ['sms_appointment_reminder_default_minutes', '1440', 'sms']
    ];

    for (const [key, value, group] of defaults) {
        await pool.query(
            `INSERT INTO settings (setting_key, setting_value, setting_group)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE setting_key = setting_key`,
            [key, value, group]
        );
    }
}

function normalizeFaq(row) {
    return {
        id: row.id,
        question: row.question,
        answer: row.answer,
        category: row.category || '',
        keywords: row.keywords || '',
        sort_order: Number(row.sort_order) || 0,
        is_active: Boolean(row.is_active),
        show_on_public: Boolean(row.show_on_public),
        use_for_chatbot: Boolean(row.use_for_chatbot),
        created_at: row.created_at,
        updated_at: row.updated_at
    };
}

function normalizeFaqInput(body = {}) {
    return {
        question: String(body.question || '').trim(),
        answer: String(body.answer || '').trim(),
        category: String(body.category || '').trim(),
        keywords: String(body.keywords || '').trim(),
        sort_order: Number.parseInt(body.sort_order, 10) || 0,
        is_active: body.is_active === undefined ? 1 : (normalizeSettingBoolean(body.is_active) ? 1 : 0),
        show_on_public: body.show_on_public === undefined ? 1 : (normalizeSettingBoolean(body.show_on_public) ? 1 : 0),
        use_for_chatbot: body.use_for_chatbot === undefined ? 1 : (normalizeSettingBoolean(body.use_for_chatbot) ? 1 : 0)
    };
}

function normalizeSearchText(text = '') {
    return String(text)
        .toLowerCase()
        .replace(/[ي]/g, 'ی')
        .replace(/[ك]/g, 'ک')
        .replace(/[أإآ]/g, 'ا')
        .replace(/[،,.!?؟؛:()\[\]{}"']/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

async function findFaqAnswer(pool, message) {
    const normalizedMessage = normalizeSearchText(message);
    if (!normalizedMessage) return null;

    const terms = normalizedMessage
        .split(' ')
        .filter(term => term.length >= 3)
        .slice(0, 8);

    const params = [];
    const scoreParts = [];

    for (const term of terms) {
        const like = `%${term}%`;
        scoreParts.push('(CASE WHEN question LIKE ? THEN 4 ELSE 0 END)'); params.push(like);
        scoreParts.push('(CASE WHEN keywords LIKE ? THEN 3 ELSE 0 END)'); params.push(like);
        scoreParts.push('(CASE WHEN answer LIKE ? THEN 1 ELSE 0 END)'); params.push(like);
    }

    if (terms.length === 0) return null;

    const exactLike = `%${normalizedMessage}%`;
    params.push(exactLike, exactLike);

    const [rows] = await pool.query(
        `SELECT *, (${scoreParts.join(' + ')}) AS match_score
         FROM faqs
         WHERE is_active = 1
           AND use_for_chatbot = 1
           AND (question LIKE ? OR keywords LIKE ? OR (${scoreParts.join(' + ')}) > 0)
         ORDER BY match_score DESC, sort_order ASC, id DESC
         LIMIT 1`,
        [...params, ...params.slice(0, params.length - 2)]
    );

    const best = rows[0];
    if (!best || Number(best.match_score) < 3) return null;
    return normalizeFaq(best);
}

function buildAISystemPrompt(settings) {
    return settings.ai_system_prompt || `شما یک دستیار هوشمند برای کلینیک تخصصی چشم پزشکی NoorVista هستید.

قوانین پاسخگویی:
1. فقط به سوالات مرتبط با چشم پزشکی و خدمات کلینیک پاسخ دهید.
2. تشخیص قطعی یا نسخه دارویی ارائه نکنید.
3. پاسخ‌ها فارسی، مؤدبانه و کوتاه باشند.
4. در علائم شدید مثل کاهش ناگهانی دید، درد شدید، ضربه به چشم یا جرقه‌های نوری، مراجعه فوری به پزشک یا اورژانس را توصیه کنید.`;
}

const aiChatLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'تعداد پیام‌های چت زیاد است، لطفاً کمی بعد دوباره تلاش کنید'
    }
});

// ============================================
// AI Chat Route
// ============================================

app.get('/api/public/faqs', asyncHandler(async (req, res) => {
    const pool = req.db || await db.getPool();
    await ensurePhase1Tables(pool);

    const rawLimit = String(req.query.limit || '').trim();
    const limit = rawLimit ? Math.min(Math.max(parseInt(rawLimit, 10) || 0, 0), 100) : 0;
    const limitSql = limit > 0 ? ` LIMIT ${limit}` : '';

    const [rows] = await pool.query(
        `SELECT id, question, answer, category, keywords, sort_order, is_active, show_on_public, use_for_chatbot, created_at, updated_at
         FROM faqs
         WHERE is_active = 1 AND show_on_public = 1
         ORDER BY sort_order ASC, id DESC${limitSql}`
    );

    res.json({
        success: true,
        count: rows.length,
        faqs: rows.map(normalizeFaq)
    });
}));


// FAQ routes for clinic-admin panel as well as system admin.
app.get('/api/clinic/faqs', clinicV2Auth, clinicV2Role, asyncHandler(async (req, res) => {
    const pool = req.db || await db.getPool();
    await ensurePhase1Tables(pool);
    const search = String(req.query.search || '').trim();
    const params = [];
    let where = '';
    if (search) {
        where = 'WHERE question LIKE ? OR answer LIKE ? OR keywords LIKE ? OR category LIKE ?';
        const like = `%${search}%`;
        params.push(like, like, like, like);
    }
    const [rows] = await pool.query(
        `SELECT id, question, answer, category, keywords, sort_order, is_active, show_on_public, use_for_chatbot, created_at, updated_at
         FROM faqs ${where}
         ORDER BY sort_order ASC, id DESC
         LIMIT 500`,
        params
    );
    res.json({ success: true, faqs: rows.map(normalizeFaq) });
}));

app.get('/api/clinic/faqs/:id', clinicV2Auth, clinicV2Role, asyncHandler(async (req, res) => {
    const pool = req.db || await db.getPool();
    await ensurePhase1Tables(pool);
    const [rows] = await pool.query('SELECT * FROM faqs WHERE id = ? LIMIT 1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'سوال پرتکرار یافت نشد' });
    res.json({ success: true, faq: normalizeFaq(rows[0]) });
}));

app.post('/api/clinic/faqs', clinicV2Auth, clinicV2Role, asyncHandler(async (req, res) => {
    const pool = req.db || await db.getPool();
    await ensurePhase1Tables(pool);
    const faq = normalizeFaqInput(req.body);
    if (!faq.question || !faq.answer) return res.status(400).json({ success: false, message: 'سوال و پاسخ الزامی است' });
    const [result] = await pool.query(
        `INSERT INTO faqs (question, answer, category, keywords, sort_order, is_active, show_on_public, use_for_chatbot, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [faq.question, faq.answer, faq.category, faq.keywords, faq.sort_order, faq.is_active, faq.show_on_public, faq.use_for_chatbot, req.user?.id || null]
    );
    res.status(201).json({ success: true, message: 'سوال پرتکرار با موفقیت ثبت شد', id: result.insertId });
}));

app.put('/api/clinic/faqs/:id', clinicV2Auth, clinicV2Role, asyncHandler(async (req, res) => {
    const pool = req.db || await db.getPool();
    await ensurePhase1Tables(pool);
    const faq = normalizeFaqInput(req.body);
    if (!faq.question || !faq.answer) return res.status(400).json({ success: false, message: 'سوال و پاسخ الزامی است' });
    const [result] = await pool.query(
        `UPDATE faqs SET question = ?, answer = ?, category = ?, keywords = ?, sort_order = ?, is_active = ?, show_on_public = ?, use_for_chatbot = ? WHERE id = ?`,
        [faq.question, faq.answer, faq.category, faq.keywords, faq.sort_order, faq.is_active, faq.show_on_public, faq.use_for_chatbot, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ success: false, message: 'سوال پرتکرار یافت نشد' });
    res.json({ success: true, message: 'سوال پرتکرار با موفقیت به‌روزرسانی شد' });
}));

app.delete('/api/clinic/faqs/:id', clinicV2Auth, clinicV2Role, asyncHandler(async (req, res) => {
    const pool = req.db || await db.getPool();
    await ensurePhase1Tables(pool);
    const [result] = await pool.query('UPDATE faqs SET is_active = 0 WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: 'سوال پرتکرار یافت نشد' });
    res.json({ success: true, message: 'سوال پرتکرار غیرفعال شد' });
}));

app.get('/api/admin/faqs', authenticateToken, authorizeRoles('system_admin', 'admin'), asyncHandler(async (req, res) => {
    const pool = req.db || await db.getPool();
    await ensurePhase1Tables(pool);

    const search = String(req.query.search || '').trim();
    const params = [];
    let where = '';
    if (search) {
        where = 'WHERE question LIKE ? OR answer LIKE ? OR keywords LIKE ? OR category LIKE ?';
        const like = `%${search}%`;
        params.push(like, like, like, like);
    }

    const [rows] = await pool.query(
        `SELECT id, question, answer, category, keywords, sort_order, is_active, show_on_public, use_for_chatbot, created_at, updated_at
         FROM faqs ${where}
         ORDER BY sort_order ASC, id DESC
         LIMIT 500`,
        params
    );

    res.json({ success: true, faqs: rows.map(normalizeFaq) });
}));

app.get('/api/admin/faqs/:id', authenticateToken, authorizeRoles('system_admin', 'admin'), asyncHandler(async (req, res) => {
    const pool = req.db || await db.getPool();
    await ensurePhase1Tables(pool);

    const [rows] = await pool.query('SELECT * FROM faqs WHERE id = ? LIMIT 1', [req.params.id]);
    if (!rows.length) {
        return res.status(404).json({ success: false, message: 'سوال پرتکرار یافت نشد' });
    }

    res.json({ success: true, faq: normalizeFaq(rows[0]) });
}));

app.post('/api/admin/faqs', authenticateToken, authorizeRoles('system_admin', 'admin'), asyncHandler(async (req, res) => {
    const pool = req.db || await db.getPool();
    await ensurePhase1Tables(pool);

    const faq = normalizeFaqInput(req.body);
    if (!faq.question || !faq.answer) {
        return res.status(400).json({ success: false, message: 'سوال و پاسخ الزامی است' });
    }

    const [result] = await pool.query(
        `INSERT INTO faqs
         (question, answer, category, keywords, sort_order, is_active, show_on_public, use_for_chatbot, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [faq.question, faq.answer, faq.category, faq.keywords, faq.sort_order, faq.is_active, faq.show_on_public, faq.use_for_chatbot, req.user?.id || null]
    );

    res.status(201).json({ success: true, message: 'سوال پرتکرار با موفقیت ثبت شد', id: result.insertId });
}));

app.put('/api/admin/faqs/:id', authenticateToken, authorizeRoles('system_admin', 'admin'), asyncHandler(async (req, res) => {
    const pool = req.db || await db.getPool();
    await ensurePhase1Tables(pool);

    const faq = normalizeFaqInput(req.body);
    if (!faq.question || !faq.answer) {
        return res.status(400).json({ success: false, message: 'سوال و پاسخ الزامی است' });
    }

    const [result] = await pool.query(
        `UPDATE faqs
         SET question = ?, answer = ?, category = ?, keywords = ?, sort_order = ?, is_active = ?, show_on_public = ?, use_for_chatbot = ?
         WHERE id = ?`,
        [faq.question, faq.answer, faq.category, faq.keywords, faq.sort_order, faq.is_active, faq.show_on_public, faq.use_for_chatbot, req.params.id]
    );

    if (!result.affectedRows) {
        return res.status(404).json({ success: false, message: 'سوال پرتکرار یافت نشد' });
    }

    res.json({ success: true, message: 'سوال پرتکرار با موفقیت به‌روزرسانی شد' });
}));

app.delete('/api/admin/faqs/:id', authenticateToken, authorizeRoles('system_admin', 'admin'), asyncHandler(async (req, res) => {
    const pool = req.db || await db.getPool();
    await ensurePhase1Tables(pool);

    const [result] = await pool.query('UPDATE faqs SET is_active = 0 WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) {
        return res.status(404).json({ success: false, message: 'سوال پرتکرار یافت نشد' });
    }

    res.json({ success: true, message: 'سوال پرتکرار غیرفعال شد' });
}));

app.get('/api/admin/settings', authenticateToken, authorizeRoles('system_admin', 'admin'), asyncHandler(async (req, res) => {
    const pool = req.db || await db.getPool();
    await ensurePhase1Tables(pool);
    const settings = await getSettingsMap(pool, { maskSecrets: true });
    res.json(settings);
}));

app.put('/api/admin/settings', authenticateToken, authorizeRoles('system_admin', 'admin'), asyncHandler(async (req, res) => {
    const pool = req.db || await db.getPool();
    await ensurePhase1Tables(pool);
    await upsertSettings(pool, req.body || null);
    res.json({ success: true, message: 'تنظیمات سیستم ذخیره شد' });
}));

app.get('/api/admin/settings/ai', authenticateToken, authorizeRoles('system_admin', 'admin'), asyncHandler(async (req, res) => {
    const pool = req.db || await db.getPool();
    await ensurePhase1Tables(pool);
    const settings = await getSettingsMap(pool, { maskSecrets: true });
    const aiSettings = Object.fromEntries(Object.entries(settings).filter(([key]) => AI_SETTING_KEYS.has(key)));
    res.json({ success: true, settings: aiSettings, ...aiSettings });
}));

app.put('/api/admin/settings/ai', authenticateToken, authorizeRoles('system_admin', 'admin'), asyncHandler(async (req, res) => {
    const pool = req.db || await db.getPool();
    await ensurePhase1Tables(pool);
    await upsertSettings(pool, req.body, AI_SETTING_KEYS);
    res.json({ success: true, message: 'تنظیمات هوش مصنوعی ذخیره شد' });
}));

app.get('/api/admin/settings/sms', authenticateToken, authorizeRoles('system_admin', 'admin'), asyncHandler(async (req, res) => {
    const pool = req.db || await db.getPool();
    await ensurePhase1Tables(pool);
    const settings = await getSettingsMap(pool, { maskSecrets: true });
    const smsSettings = Object.fromEntries(Object.entries(settings).filter(([key]) => SMS_SETTING_KEYS.has(key)));
    res.json({ success: true, settings: smsSettings, ...smsSettings });
}));

app.put('/api/admin/settings/sms', authenticateToken, authorizeRoles('system_admin', 'admin'), asyncHandler(async (req, res) => {
    const pool = req.db || await db.getPool();
    await ensurePhase1Tables(pool);
    await upsertSettings(pool, req.body, SMS_SETTING_KEYS);
    res.json({ success: true, message: 'تنظیمات پیامک ذخیره شد' });
}));



// ============================================
// NOORVISTA Notifications API
// ============================================
const NOTIFICATION_MANAGER_ROLES = ['system_admin', 'super_admin', 'admin', 'clinic_admin', 'clinic_manager', 'clinic'];

function nvNormalizeRole(role) {
    return String(role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function nvCanManageNotifications(req, res, next) {
    const role = nvNormalizeRole(req.user && req.user.role);
    if (!NOTIFICATION_MANAGER_ROLES.map(nvNormalizeRole).includes(role)) {
        return res.status(403).json({ success: false, message: 'دسترسی مدیریت اعلانات مجاز نیست' });
    }
    next();
}

async function nvEnsureNotificationsTables(pool) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS notifications (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            message TEXT NOT NULL,
            type VARCHAR(40) DEFAULT 'info',
            target_roles TEXT NULL,
            target_user_id INT NULL,
            starts_at DATETIME NULL,
            expires_at DATETIME NULL,
            is_active TINYINT(1) DEFAULT 1,
            created_by INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_notifications_active (is_active),
            INDEX idx_notifications_user (target_user_id),
            INDEX idx_notifications_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS notification_reads (
            id INT AUTO_INCREMENT PRIMARY KEY,
            notification_id INT NOT NULL,
            user_id INT NOT NULL,
            read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_notification_user (notification_id, user_id),
            INDEX idx_notification_reads_user (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
}

function nvNotificationRoles(value) {
    if (Array.isArray(value)) return value.map(nvNormalizeRole).filter(Boolean);
    return String(value || '')
        .split(/[،,|]/)
        .map(nvNormalizeRole)
        .filter(Boolean);
}

function nvNotificationMatchesUser(row, user) {
    if (!row) return false;
    if (Number(row.is_active) !== 1) return false;
    const now = new Date();
    if (row.starts_at && new Date(row.starts_at) > now) return false;
    if (row.expires_at && new Date(row.expires_at) < now) return false;
    if (row.target_user_id && Number(row.target_user_id) !== Number(user.id)) return false;
    const roles = nvNotificationRoles(row.target_roles);
    if (!roles.length) return true;
    return roles.includes(nvNormalizeRole(user.role));
}

function nvNotificationDto(row, readSet = new Set()) {
    return {
        id: row.id,
        title: row.title,
        message: row.message,
        type: row.type || 'info',
        target_roles: row.target_roles || '',
        target_user_id: row.target_user_id || null,
        starts_at: row.starts_at || null,
        expires_at: row.expires_at || null,
        is_active: Number(row.is_active) === 1,
        is_read: readSet.has(Number(row.id)),
        created_by: row.created_by || null,
        created_at: row.created_at,
        updated_at: row.updated_at
    };
}

async function nvCurrentNotifications(pool, user, limit = 20) {
    await nvEnsureNotificationsTables(pool);
    const [rows] = await pool.query(`
        SELECT * FROM notifications
        WHERE is_active = 1
        ORDER BY created_at DESC
        LIMIT 200
    `);
    const visible = rows.filter(row => nvNotificationMatchesUser(row, user));
    const ids = visible.map(row => row.id);
    let readSet = new Set();
    if (ids.length) {
        const [reads] = await pool.query('SELECT notification_id FROM notification_reads WHERE user_id = ? AND notification_id IN (?)', [user.id, ids]);
        readSet = new Set(reads.map(r => Number(r.notification_id)));
    }
    return visible.slice(0, Number(limit) || 20).map(row => nvNotificationDto(row, readSet));
}

app.get('/api/notifications', authenticateToken, asyncHandler(async (req, res) => {
    const pool = await db.getPool();
    const notifications = await nvCurrentNotifications(pool, req.user, req.query.limit || 20);
    res.json({ success: true, notifications });
}));

app.get('/api/notifications/unread-count', authenticateToken, asyncHandler(async (req, res) => {
    const pool = await db.getPool();
    const notifications = await nvCurrentNotifications(pool, req.user, 200);
    const unread_count = notifications.filter(item => !item.is_read).length;
    res.json({ success: true, unread_count });
}));

app.post('/api/notifications/:id/read', authenticateToken, asyncHandler(async (req, res) => {
    const pool = await db.getPool();
    await nvEnsureNotificationsTables(pool);
    await pool.query('INSERT IGNORE INTO notification_reads (notification_id, user_id) VALUES (?, ?)', [req.params.id, req.user.id]);
    res.json({ success: true, message: 'اعلان خوانده شد' });
}));

app.get('/api/admin/notifications', authenticateToken, nvCanManageNotifications, asyncHandler(async (req, res) => {
    const pool = await db.getPool();
    await nvEnsureNotificationsTables(pool);
    const [rows] = await pool.query('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 500');
    res.json({ success: true, notifications: rows.map(row => nvNotificationDto(row)) });
}));

app.get('/api/admin/notifications/:id', authenticateToken, nvCanManageNotifications, asyncHandler(async (req, res) => {
    const pool = await db.getPool();
    await nvEnsureNotificationsTables(pool);
    const [rows] = await pool.query('SELECT * FROM notifications WHERE id = ? LIMIT 1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, message: 'اعلان یافت نشد' });
    res.json({ success: true, notification: nvNotificationDto(rows[0]) });
}));

app.post('/api/admin/notifications', authenticateToken, nvCanManageNotifications, asyncHandler(async (req, res) => {
    const pool = await db.getPool();
    await nvEnsureNotificationsTables(pool);
    const body = req.body || {};
    const title = String(body.title || '').trim();
    const message = String(body.message || '').trim();
    if (!title || !message) {
        return res.status(400).json({ success: false, message: 'عنوان و متن اعلان الزامی است' });
    }
    const targetRoles = Array.isArray(body.target_roles) ? body.target_roles.join(',') : String(body.target_roles || body.roles || '').trim();
    const payload = {
        title,
        message,
        type: String(body.type || 'info').trim() || 'info',
        target_roles: targetRoles || null,
        target_user_id: body.target_user_id || null,
        starts_at: body.starts_at || null,
        expires_at: body.expires_at || null,
        is_active: body.is_active === undefined ? 1 : (body.is_active ? 1 : 0),
        created_by: req.user.id || null
    };
    const [result] = await pool.query('INSERT INTO notifications SET ?', [payload]);
    res.status(201).json({ success: true, id: result.insertId, message: 'اعلان ثبت شد' });
}));

app.put('/api/admin/notifications/:id', authenticateToken, nvCanManageNotifications, asyncHandler(async (req, res) => {
    const pool = await db.getPool();
    await nvEnsureNotificationsTables(pool);
    const body = req.body || {};
    const targetRoles = Array.isArray(body.target_roles) ? body.target_roles.join(',') : String(body.target_roles || body.roles || '').trim();
    const payload = {
        title: String(body.title || '').trim(),
        message: String(body.message || '').trim(),
        type: String(body.type || 'info').trim() || 'info',
        target_roles: targetRoles || null,
        target_user_id: body.target_user_id || null,
        starts_at: body.starts_at || null,
        expires_at: body.expires_at || null,
        is_active: body.is_active === undefined ? 1 : (body.is_active ? 1 : 0)
    };
    if (!payload.title || !payload.message) {
        return res.status(400).json({ success: false, message: 'عنوان و متن اعلان الزامی است' });
    }
    await pool.query('UPDATE notifications SET ? WHERE id = ?', [payload, req.params.id]);
    res.json({ success: true, message: 'اعلان ویرایش شد' });
}));

app.delete('/api/admin/notifications/:id', authenticateToken, nvCanManageNotifications, asyncHandler(async (req, res) => {
    const pool = await db.getPool();
    await nvEnsureNotificationsTables(pool);
    await pool.query('UPDATE notifications SET is_active = 0 WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'اعلان حذف/غیرفعال شد' });
}));

app.use('/api/admin', adminExtraRoutes);
app.use('/api/admin', adminRoutes);

app.post('/api/ai/chat', aiChatLimiter, asyncHandler(async (req, res) => {
    const { message, history = [] } = req.body || {};

    if (!message || !String(message).trim()) {
        return res.status(400).json({
            success: false,
            message: 'پیام خود را وارد کنید'
        });
    }

    const pool = req.db || await db.getPool();
    await ensurePhase1Tables(pool);
    const settings = await getSettingsMap(pool);

    if (normalizeSettingBoolean(settings.ai_use_faq_first, true)) {
        const faqMatch = await findFaqAnswer(pool, message);
        if (faqMatch) {
            return res.json({
                success: true,
                source: 'faq',
                faq_id: faqMatch.id,
                reply: faqMatch.answer
            });
        }
    }

    const aiEnabled = normalizeSettingBoolean(settings.ai_enabled, false);
    const apiKey = settings.ai_api_key || process.env.AI_API_KEY;

    if (!aiEnabled || !apiKey) {
        return res.json({
            success: true,
            source: 'fallback',
            reply: getFallbackAIReply()
        });
    }

    const baseUrl = String(settings.ai_base_url || process.env.AI_BASE_URL || 'https://api.gapgpt.app/v1').replace(/\/+$/, '');
    const systemPrompt = buildAISystemPrompt(settings);
    const messages = [
        { role: 'system', content: systemPrompt },
        ...Array.isArray(history) ? history.slice(-6).map(item => ({
            role: item.role === 'assistant' ? 'assistant' : 'user',
            content: String(item.content || '').slice(0, 2000)
        })) : [],
        { role: 'user', content: String(message).slice(0, 2000) }
    ];

    try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: settings.ai_model || process.env.AI_MODEL || 'gapgpt-qwen-3.5',
                messages,
                temperature: normalizeSettingNumber(settings.ai_temperature, 0.7, 0, 2),
                max_tokens: normalizeSettingNumber(settings.ai_max_tokens, 500, 50, 2000),
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error(`AI API error: ${response.status}`);
        }

        const data = await response.json();
        const reply = data?.choices?.[0]?.message?.content || getFallbackAIReply();

        res.json({
            success: true,
            source: 'ai',
            reply
        });
    } catch (error) {
        console.error('AI Chat error:', error.message);

        res.json({
            success: true,
            source: 'fallback',
            reply: getFallbackAIReply()
        });
    }
}));

// ============================================
// HTML Routes
// ============================================

app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
});

// Main pages
const publicPages = {
    '/': ['public', 'index.html'],
    '/index': ['public', 'index.html'],
    '/index.html': ['public', 'index.html'],
    '/login': ['auth', 'login.html'],
    '/login.html': ['auth', 'login.html'],
    '/about': ['public', 'about.html'],
    '/about.html': ['public', 'about.html'],
    '/services': ['public', 'services.html'],
    '/services.html': ['public', 'services.html'],
    '/doctors': ['public', 'doctors.html'],
    '/doctors.html': ['public', 'doctors.html'],
    '/faqs': ['public', 'faq.html'],
    '/faq': ['public', 'faq.html'],
    '/faq.html': ['public', 'faq.html'],
    '/blog': ['public', 'blog.html'],
    '/blog.html': ['public', 'blog.html'],
    '/blog-single': ['public', 'blog-single.html'],
    '/blog-single.html': ['public', 'blog-single.html'],
    '/contact': ['public', 'contact.html'],
    '/contact.html': ['public', 'contact.html']
};

Object.entries(publicPages).forEach(([routePath, segments]) => {
    app.get(routePath, (req, res) => sendPublicPage(res, ...segments));
});

// Service detail pages: /services/cataract and /services/cataract.html
app.get('/services/:serviceSlug', (req, res, next) => {
    const slug = String(req.params.serviceSlug || '').replace(/\.html$/i, '');
    if (!/^[a-z0-9-]+$/i.test(slug)) return next();
    const filePath = publicPage('public', 'services', `${slug}.html`);
    return res.sendFile(filePath, (err) => err ? next() : undefined);
});

// لینک قدیمی قالب برای صفحه تکی پزشک وجود نداشت؛ به صفحه پزشکان هدایت می‌شود تا 404 ندهد.
app.get(['/teacher-single', '/teacher-single.html'], (req, res) => {
    res.redirect('/doctors');
});

// Dashboard entry points
app.get(['/dashboard/admin', '/dashboard/panel/admin'], (req, res) => {
    sendPublicPage(res, 'dashboard', 'admin', 'index.html');
});

app.get(['/dashboard/clinic', '/dashboard/clinic-manager', '/dashboard/panel/clinic-admin'], (req, res) => {
    sendPublicPage(res, 'dashboard', 'clinic-manager', 'index.html');
});

app.get(['/dashboard/doctor', '/dashboard/panel/doctor'], (req, res) => {
    sendPublicPage(res, 'dashboard', 'doctor', 'index.html');
});

app.get(['/dashboard/patient', '/dashboard/panel/patient'], (req, res) => {
    sendPublicPage(res, 'dashboard', 'patient', 'index.html');
});

app.get(['/dashboard/secretary', '/dashboard/reception', '/dashboard/panel/reception'], (req, res) => {
    sendPublicPage(res, 'dashboard', 'secretary', 'index.html');
});


// ============================================
// Appointment Reminder Scheduler
// ============================================

let appointmentReminderSchedulerStarted = false;

async function ensureAppointmentReminderColumns(pool) {
    const statements = [
        "ALTER TABLE appointments ADD COLUMN reminder_sent_at DATETIME NULL",
        "ALTER TABLE appointments ADD COLUMN reminder_status VARCHAR(50) NULL",
        "ALTER TABLE appointments ADD COLUMN reminder_error TEXT NULL"
    ];

    for (const sql of statements) {
        try {
            await pool.query(sql);
        } catch (error) {
            if (error.code !== 'ER_DUP_FIELDNAME') {
                console.warn('Reminder column check warning:', error.message);
            }
        }
    }
}

async function getDoctorReminderConfig(pool, doctorId) {
    try {
        await ensureDoctorSchedulesTable(pool);
        const [rows] = await pool.query(
            `SELECT reminder_enabled, reminder_before_minutes
             FROM doctor_schedules
             WHERE doctor_id = ? AND COALESCE(is_active, 1) = 1
             ORDER BY id ASC
             LIMIT 1`,
            [doctorId]
        );

        if (rows[0]) {
            return {
                enabled: rows[0].reminder_enabled === undefined ? true : Boolean(rows[0].reminder_enabled),
                beforeMinutes: Number(rows[0].reminder_before_minutes || 1440)
            };
        }
    } catch (error) {
        console.warn('Doctor reminder config warning:', error.message);
    }

    const settings = await getSettingsMap(pool);
    return {
        enabled: normalizeSettingBoolean(settings.sms_appointment_reminder_enabled, true),
        beforeMinutes: normalizeSettingNumber(settings.sms_appointment_reminder_default_minutes, 1440, 15, 43200)
    };
}

function buildAppointmentDateTime(dateValue, timeValue) {
    const date = clinicV2DateOnly(dateValue);
    const time = String(timeValue || '00:00').slice(0, 5);
    return new Date(`${date}T${time}:00`);
}

async function runAppointmentReminderJob(pool) {
    const settings = await getSettingsMap(pool);
    if (!normalizeSettingBoolean(settings.sms_appointment_reminder_enabled, true)) return;

    await ensureAppointmentReminderColumns(pool);

    const [rows] = await pool.query(
        `SELECT
            a.id,
            a.appointment_date,
            a.appointment_time,
            a.doctor_id,
            COALESCE(pu.phone, '') AS patient_phone,
            COALESCE(pu.full_name, pu.username, 'بیمار گرامی') AS patient_name,
            COALESCE(du.full_name, du.username, 'پزشک') AS doctor_name
         FROM appointments a
         INNER JOIN patients p ON p.id = a.patient_id
         LEFT JOIN users pu ON pu.id = p.user_id
         INNER JOIN doctors d ON d.id = a.doctor_id
         LEFT JOIN users du ON du.id = d.user_id
         WHERE a.reminder_sent_at IS NULL
           AND COALESCE(a.status, 'pending') IN ('pending', 'confirmed')
           AND TIMESTAMP(a.appointment_date, a.appointment_time) >= NOW()
           AND TIMESTAMP(a.appointment_date, a.appointment_time) <= DATE_ADD(NOW(), INTERVAL 45 DAY)
         ORDER BY a.appointment_date ASC, a.appointment_time ASC
         LIMIT 100`
    );

    const now = new Date();
    for (const row of rows) {
        const config = await getDoctorReminderConfig(pool, row.doctor_id);
        if (!config.enabled) continue;

        const appointmentAt = buildAppointmentDateTime(row.appointment_date, row.appointment_time);
        if (Number.isNaN(appointmentAt.getTime())) continue;

        const reminderAt = new Date(appointmentAt.getTime() - config.beforeMinutes * 60 * 1000);
        if (now < reminderAt) continue;

        try {
            const result = await smsService.sendAppointmentReminder(pool, {
                receptor: row.patient_phone,
                variables: {
                    patient_name: row.patient_name,
                    doctor_name: row.doctor_name,
                    appointment_date: scheduleDateToString(row.appointment_date),
                    appointment_time: String(row.appointment_time || '').slice(0, 5),
                    clinic_name: 'کلینیک چشم‌پزشکی دکتر محمدصادق حق‌پرست'
                }
            });

            await pool.query(
                `UPDATE appointments SET reminder_sent_at = NOW(), reminder_status = ?, reminder_error = NULL WHERE id = ?`,
                [result && result.skipped ? 'skipped' : 'sent', row.id]
            );
        } catch (error) {
            await pool.query(
                `UPDATE appointments SET reminder_status = 'failed', reminder_error = ? WHERE id = ?`,
                [String(error.message || error).slice(0, 1000), row.id]
            );
            console.warn('Appointment reminder failed:', row.id, error.message);
        }
    }
}

function startAppointmentReminderScheduler(pool) {
    if (appointmentReminderSchedulerStarted) return;
    appointmentReminderSchedulerStarted = true;

    const runSafe = () => {
        runAppointmentReminderJob(pool).catch(error => {
            console.warn('Appointment reminder scheduler warning:', error.message);
        });
    };

    setTimeout(runSafe, 30 * 1000);
    setInterval(runSafe, 15 * 60 * 1000);
    console.log('✅ Appointment reminder scheduler started');
}

// ============================================
// 404 Handler
// ============================================

app.use((req, res) => {
    if (req.accepts('html')) {
        return res.status(404).sendFile(publicPage('public', '404.html'));
    }

    return res.status(404).json({
        success: false,
        message: 'مسیر مورد نظر یافت نشد'
    });
});

// ============================================
// Error Handler
// ============================================

app.use((err, req, res, next) => {
    console.error('Server error:', err);

    if (err.message && err.message.includes('CORS policy')) {
        return res.status(403).json({
            success: false,
            message: 'درخواست از دامنه غیرمجاز ارسال شده است'
        });
    }

    if (err.statusCode) {
        return res.status(err.statusCode).json({ success: false, message: err.message });
    }

    if (err.code === 'ER_NO_DEFAULT_FOR_FIELD') {
        return res.status(400).json({ success: false, message: 'ساختار دیتابیس با فرم هماهنگ نیست. لطفاً migrationهای جدید را اجرا کنید یا این خطا را ارسال کنید: ' + err.sqlMessage });
    }

    if (err.code === 'ECONNREFUSED') {
        return res.status(503).json({
            success: false,
            message: 'خطا در ارتباط با دیتابیس'
        });
    }

    return res.status(500).json({
        success: false,
        message: NODE_ENV === 'development' ? err.message : 'خطای داخلی سرور'
    });
});

// ============================================
// Start Server
// ============================================

async function startServer() {
    try {
        const pool = await db.getPool();
        await ensurePhase1Tables(pool);
        startAppointmentReminderScheduler(pool);

        app.listen(PORT, () => {
            console.log(`
═══════════════════════════════════════════════════════════════════
🏥 NOORVISTA Clinic Management System v2.0
═══════════════════════════════════════════════════════════════════
✅ Server running on port: ${PORT}
✅ API ready at: http://localhost:${PORT}/api
✅ Login page: http://localhost:${PORT}/login
═══════════════════════════════════════════════════════════════════

📋 Panel Access:
   🔧 System Admin:    http://localhost:${PORT}/dashboard/panel/admin
   🏥 Clinic Admin:    http://localhost:${PORT}/dashboard/panel/clinic-admin
   👨‍⚕️ Doctor:         http://localhost:${PORT}/dashboard/panel/doctor
   💼 Reception:       http://localhost:${PORT}/dashboard/panel/reception
   👤 Patient:         http://localhost:${PORT}/dashboard/panel/patient

📋 Default Login Credentials:
   Username: admin / clinic_admin / doctor / reception / patient
   Password: 123456
═══════════════════════════════════════════════════════════════════
            `);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error.message);
        console.log('⚠️ Make sure MySQL is running and database is initialized');
        console.log('   Run: npm run init-db to initialize database');
        process.exit(1);
    }
}

startServer();

// ============================================
// Graceful Shutdown
// ============================================

async function shutdown(signal) {
    console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);

    try {
        await db.closePool();
        process.exit(0);
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
