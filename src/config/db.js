// src/config/db.js
// ============================================
// کانفیگ دیتابیس MySQL با connection pool
// ============================================

const mysql = require('mysql2/promise');
require('dotenv').config();

let pool = null;
let isConnected = false;

function positiveInt(value, fallback, min = 1000, max = 60000) {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

const DB_CONNECT_TIMEOUT_MS = positiveInt(process.env.DB_CONNECT_TIMEOUT_MS, 8000);
const DB_ACQUIRE_TIMEOUT_MS = positiveInt(process.env.DB_ACQUIRE_TIMEOUT_MS, 8000);

function dbTimeoutError() {
    const error = new Error('Database connection timed out');
    error.code = 'DB_CONNECTION_TIMEOUT';
    return error;
}

async function acquireConnectionWithTimeout(targetPool, timeoutMs = DB_ACQUIRE_TIMEOUT_MS) {
    let timeoutId;
    let timedOut = false;
    const acquirePromise = targetPool.getConnection().then((connection) => {
        if (timedOut) {
            connection.release();
            throw dbTimeoutError();
        }
        return connection;
    });
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            timedOut = true;
            reject(dbTimeoutError());
        }, timeoutMs);
    });
    try {
        return await Promise.race([acquirePromise, timeoutPromise]);
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * ایجاد یا بازگرداندن connection pool
 * @returns {Promise<mysql.Pool>}
 */
async function getPool() {
    if (pool) {
        // بررسی سلامت connection pool
        try {
            const connection = await acquireConnectionWithTimeout(pool);
            connection.release();
            return pool;
        } catch (error) {
            console.warn('⚠️ Connection pool is not healthy, recreating...');
            pool = null;
        }
    }

    // ایجاد pool جدید
    const dbConfig = {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '3306'),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'noorvista_clinic',
        waitForConnections: true,
        connectionLimit: parseInt(process.env.DB_POOL_SIZE || '10'),
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
        // جلوگیری از جابه‌جایی یک‌روزه تاریخ‌های DATE هنگام تبدیل به JSON
        dateStrings: true,
        timezone: 'Z',
        // تنظیمات timeout معتبر mysql2
        connectTimeout: DB_CONNECT_TIMEOUT_MS
    };

    try {
        pool = mysql.createPool(dbConfig);
        
        // تست اتصال
        const testConn = await acquireConnectionWithTimeout(pool);
        testConn.release();
        
        console.log('✅ MySQL Database connected successfully');
        isConnected = true;
        return pool;
    } catch (error) {
        console.error('❌ MySQL connection error:', error.message);
        isConnected = false;
        throw error;
    }
}

/**
 * دریافت اتصال مستقیم (برای تراکنش‌ها)
 * @returns {Promise<mysql.PoolConnection>}
 */
async function getConnection() {
    const pool = await getPool();
    return acquireConnectionWithTimeout(pool);
}

/**
 * اجرای کوئری SELECT
 * @param {string} sql - کوئری SQL
 * @param {Array} params - پارامترها
 * @returns {Promise<Array>}
 */
async function query(sql, params = []) {
    const pool = await getPool();
    try {
        const [rows] = await pool.query(sql, params);
        // بیشتر controllerهای پروژه با الگوی mysql2 یعنی const [rows] = await db.query(...) نوشته شده‌اند.
        // بنابراین wrapper هم همان شکل [rows] را برمی‌گرداند تا routeهای قدیمی خراب نشوند.
        return [rows];
    } catch (error) {
        console.error('Query error:', error.message);
        throw error;
    }
}

/**
 * اجرای کوئری (INSERT, UPDATE, DELETE)
 * @param {string} sql - کوئری SQL
 * @param {Array} params - پارامترها
 * @returns {Promise<Object>}
 */
async function execute(sql, params = []) {
    const pool = await getPool();
    try {
        const [result] = await pool.execute(sql, params);
        return result;
    } catch (error) {
        console.error('Execute error:', error.message);
        throw error;
    }
}

/**
 * شروع تراکنش
 * @returns {Promise<mysql.PoolConnection>}
 */
async function beginTransaction() {
    const connection = await getConnection();
    await connection.beginTransaction();
    return connection;
}

/**
 * commit تراکنش
 * @param {mysql.PoolConnection} connection - اتصال تراکنش
 */
async function commit(connection) {
    await connection.commit();
    connection.release();
}

/**
 * rollback تراکنش
 * @param {mysql.PoolConnection} connection - اتصال تراکنش
 */
async function rollback(connection) {
    await connection.rollback();
    connection.release();
}

/**
 * بستن connection pool
 */
async function closePool() {
    if (pool) {
        await pool.end();
        pool = null;
        isConnected = false;
        console.log('Database pool closed');
    }
}

/**
 * بررسی وضعیت اتصال
 * @returns {boolean}
 */
function isDatabaseConnected() {
    return isConnected;
}

module.exports = {
    getPool,
    getConnection,
    query,
    execute,
    beginTransaction,
    commit,
    rollback,
    closePool,
    isDatabaseConnected,
    DB_CONNECT_TIMEOUT_MS,
    DB_ACQUIRE_TIMEOUT_MS,
    acquireConnectionWithTimeout
};