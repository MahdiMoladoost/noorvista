// ============================================
// NoorVista - سیستم دیتابیس سمت کلاینت
// ============================================

const DB_NAME = 'NoorVistaDB';
const DB_VERSION = 1;

// نام استورها (جدول‌ها)
const STORES = {
    USERS: 'users',
    PATIENTS: 'patients',
    DOCTORS: 'doctors',
    SECRETARIES: 'secretaries',
    APPOINTMENTS: 'appointments',
    DEPARTMENTS: 'departments',
    EMPLOYEES: 'employees',
    LEAVES: 'leaves',
    ATTENDANCE: 'attendance',
    INVOICES: 'invoices',
    PAYMENTS: 'payments',
    EXPENSES: 'expenses',
    SALARY: 'salary',
    MEDICAL_RECORDS: 'medical_records',
    SCHEDULES: 'schedules',
    BLOG: 'blog',
    SETTINGS: 'settings',
    ACTIVITY_LOGS: 'activity_logs'
};

let db = null;

// باز کردن دیتابیس
async function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            // ایجاد استورها (جدول‌ها)
            
            // 1. کاربران
            if (!db.objectStoreNames.contains(STORES.USERS)) {
                const userStore = db.createObjectStore(STORES.USERS, { keyPath: 'id', autoIncrement: true });
                userStore.createIndex('username', 'username', { unique: true });
                userStore.createIndex('phone', 'phone', { unique: true });
                userStore.createIndex('role', 'role', { unique: false });
                userStore.createIndex('email', 'email', { unique: true });
            }
            
            // 2. بیماران
            if (!db.objectStoreNames.contains(STORES.PATIENTS)) {
                const patientStore = db.createObjectStore(STORES.PATIENTS, { keyPath: 'id', autoIncrement: true });
                patientStore.createIndex('phone', 'phone', { unique: true });
                patientStore.createIndex('nationalId', 'nationalId', { unique: true });
                patientStore.createIndex('email', 'email', { unique: false });
            }
            
            // 3. پزشکان
            if (!db.objectStoreNames.contains(STORES.DOCTORS)) {
                const doctorStore = db.createObjectStore(STORES.DOCTORS, { keyPath: 'id', autoIncrement: true });
                doctorStore.createIndex('specialty', 'specialty', { unique: false });
                doctorStore.createIndex('departmentId', 'departmentId', { unique: false });
            }
            
            // 4. منشی‌ها
            if (!db.objectStoreNames.contains(STORES.SECRETARIES)) {
                db.createObjectStore(STORES.SECRETARIES, { keyPath: 'id', autoIncrement: true });
            }
            
            // 5. نوبت‌ها
            if (!db.objectStoreNames.contains(STORES.APPOINTMENTS)) {
                const aptStore = db.createObjectStore(STORES.APPOINTMENTS, { keyPath: 'id', autoIncrement: true });
                aptStore.createIndex('patientId', 'patientId', { unique: false });
                aptStore.createIndex('doctorId', 'doctorId', { unique: false });
                aptStore.createIndex('date', 'date', { unique: false });
                aptStore.createIndex('status', 'status', { unique: false });
            }
            
            // 6. بخش‌ها
            if (!db.objectStoreNames.contains(STORES.DEPARTMENTS)) {
                db.createObjectStore(STORES.DEPARTMENTS, { keyPath: 'id', autoIncrement: true });
            }
            
            // 7. کارکنان
            if (!db.objectStoreNames.contains(STORES.EMPLOYEES)) {
                const empStore = db.createObjectStore(STORES.EMPLOYEES, { keyPath: 'id', autoIncrement: true });
                empStore.createIndex('employeeId', 'employeeId', { unique: true });
            }
            
            // 8. مرخصی‌ها
            if (!db.objectStoreNames.contains(STORES.LEAVES)) {
                const leaveStore = db.createObjectStore(STORES.LEAVES, { keyPath: 'id', autoIncrement: true });
                leaveStore.createIndex('employeeId', 'employeeId', { unique: false });
                leaveStore.createIndex('status', 'status', { unique: false });
            }
            
            // 9. حضور و غیاب
            if (!db.objectStoreNames.contains(STORES.ATTENDANCE)) {
                const attStore = db.createObjectStore(STORES.ATTENDANCE, { keyPath: 'id', autoIncrement: true });
                attStore.createIndex('employeeId', 'employeeId', { unique: false });
                attStore.createIndex('date', 'date', { unique: false });
            }
            
            // 10. صورتحساب‌ها
            if (!db.objectStoreNames.contains(STORES.INVOICES)) {
                const invStore = db.createObjectStore(STORES.INVOICES, { keyPath: 'id', autoIncrement: true });
                invStore.createIndex('patientId', 'patientId', { unique: false });
                invStore.createIndex('invoiceNumber', 'invoiceNumber', { unique: true });
                invStore.createIndex('status', 'status', { unique: false });
            }
            
            // 11. پرداخت‌ها
            if (!db.objectStoreNames.contains(STORES.PAYMENTS)) {
                const payStore = db.createObjectStore(STORES.PAYMENTS, { keyPath: 'id', autoIncrement: true });
                payStore.createIndex('invoiceId', 'invoiceId', { unique: false });
            }
            
            // 12. هزینه‌ها
            if (!db.objectStoreNames.contains(STORES.EXPENSES)) {
                db.createObjectStore(STORES.EXPENSES, { keyPath: 'id', autoIncrement: true });
            }
            
            // 13. حقوق
            if (!db.objectStoreNames.contains(STORES.SALARY)) {
                const salStore = db.createObjectStore(STORES.SALARY, { keyPath: 'id', autoIncrement: true });
                salStore.createIndex('employeeId', 'employeeId', { unique: false });
                salStore.createIndex('yearMonth', 'yearMonth', { unique: false });
            }
            
            // 14. پرونده‌های پزشکی
            if (!db.objectStoreNames.contains(STORES.MEDICAL_RECORDS)) {
                const recStore = db.createObjectStore(STORES.MEDICAL_RECORDS, { keyPath: 'id', autoIncrement: true });
                recStore.createIndex('patientId', 'patientId', { unique: false });
                recStore.createIndex('doctorId', 'doctorId', { unique: false });
                recStore.createIndex('date', 'date', { unique: false });
            }
            
            // 15. برنامه کاری پزشکان
            if (!db.objectStoreNames.contains(STORES.SCHEDULES)) {
                const schStore = db.createObjectStore(STORES.SCHEDULES, { keyPath: 'id', autoIncrement: true });
                schStore.createIndex('doctorId', 'doctorId', { unique: false });
                schStore.createIndex('dayOfWeek', 'dayOfWeek', { unique: false });
            }
            
            // 16. وبلاگ
            if (!db.objectStoreNames.contains(STORES.BLOG)) {
                db.createObjectStore(STORES.BLOG, { keyPath: 'id', autoIncrement: true });
            }
            
            // 17. تنظیمات
            if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
                db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
            }
            
            // 18. لاگ فعالیت‌ها
            if (!db.objectStoreNames.contains(STORES.ACTIVITY_LOGS)) {
                const logStore = db.createObjectStore(STORES.ACTIVITY_LOGS, { keyPath: 'id', autoIncrement: true });
                logStore.createIndex('userId', 'userId', { unique: false });
                logStore.createIndex('timestamp', 'timestamp', { unique: false });
            }
        };
    });
}

// CRUD عملیات عمومی
async function addData(storeName, data) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.add(data);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getData(storeName, id) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getAllData(storeName, indexName = null, value = null) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        let request;
        
        if (indexName && value !== null) {
            const index = store.index(indexName);
            request = index.getAll(value);
        } else {
            request = store.getAll();
        }
        
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

async function updateData(storeName, id, newData) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.put({ ...newData, id });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function deleteData(storeName, id) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.delete(id);
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
    });
}

async function deleteAllData(storeName) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.clear();
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
    });
}

// دریافت داده‌ها با فیلتر پیشرفته
async function filterData(storeName, filters) {
    const allData = await getAllData(storeName);
    return allData.filter(item => {
        for (const [key, value] of Object.entries(filters)) {
            if (item[key] !== value) return false;
        }
        return true;
    });
}

// جستجو
async function searchData(storeName, searchFields, keyword) {
    const allData = await getAllData(storeName);
    if (!keyword) return allData;
    
    const lowerKeyword = keyword.toLowerCase();
    return allData.filter(item => {
        return searchFields.some(field => {
            const value = item[field];
            return value && String(value).toLowerCase().includes(lowerKeyword);
        });
    });
}