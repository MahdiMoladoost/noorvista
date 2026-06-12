-- 2026-06-07-appointment-architecture.sql
-- NOORVISTA appointment architecture v2
-- پزشک + مرکز درمانی + خدمت + برنامه + ظرفیت

CREATE TABLE IF NOT EXISTS medical_centers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    type ENUM('clinic','hospital','treatment_center','surgery_center','other') NOT NULL DEFAULT 'clinic',
    province VARCHAR(100) NULL,
    city VARCHAR(100) NULL,
    address TEXT NULL,
    phone VARCHAR(50) NULL,
    latitude DECIMAL(10,7) NULL,
    longitude DECIMAL(10,7) NULL,
    description TEXT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_medical_centers_active (is_active),
    INDEX idx_medical_centers_city (city)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;

CREATE TABLE IF NOT EXISTS services (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(200) NOT NULL UNIQUE,
    category VARCHAR(100) NULL,
    description TEXT NULL,
    default_capacity INT NOT NULL DEFAULT 1,
    default_duration_minutes INT NOT NULL DEFAULT 30,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_services_active (is_active),
    INDEX idx_services_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;

CREATE TABLE IF NOT EXISTS doctor_medical_centers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    doctor_id INT NOT NULL,
    medical_center_id INT NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_doctor_center (doctor_id, medical_center_id),
    INDEX idx_dmc_doctor (doctor_id),
    INDEX idx_dmc_center (medical_center_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;

-- Existing doctor_schedules is extended by runtime ensure function too.
-- If your existing table has a unique key on (doctor_id, day_of_week), drop it manually if migration tool does not support conditional DROP:
-- ALTER TABLE doctor_schedules DROP INDEX uk_doctor_day;

ALTER TABLE doctor_schedules ADD COLUMN medical_center_id INT NULL AFTER doctor_id;
ALTER TABLE doctor_schedules ADD COLUMN service_id INT NULL AFTER medical_center_id;
ALTER TABLE doctor_schedules ADD COLUMN slot_duration_minutes INT NULL AFTER end_time;
ALTER TABLE doctor_schedules ADD COLUMN capacity_per_slot INT NOT NULL DEFAULT 1 AFTER slot_duration_minutes;
ALTER TABLE doctor_schedules ADD COLUMN start_date DATE NULL AFTER capacity_per_slot;
ALTER TABLE doctor_schedules ADD COLUMN end_date DATE NULL AFTER start_date;
ALTER TABLE doctor_schedules ADD COLUMN is_recurring TINYINT(1) NOT NULL DEFAULT 1 AFTER end_date;

CREATE TABLE IF NOT EXISTS appointment_slots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    doctor_schedule_id INT NOT NULL,
    doctor_id INT NOT NULL,
    medical_center_id INT NOT NULL,
    service_id INT NOT NULL,
    slot_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    capacity INT NOT NULL DEFAULT 1,
    booked_count INT NOT NULL DEFAULT 0,
    remaining_capacity INT NOT NULL DEFAULT 1,
    status ENUM('available','full','disabled','cancelled') NOT NULL DEFAULT 'available',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_slot_unique (doctor_schedule_id, slot_date, start_time),
    INDEX idx_slots_lookup (service_id, doctor_id, medical_center_id, slot_date),
    INDEX idx_slots_status (status, slot_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;

ALTER TABLE appointments ADD COLUMN appointment_slot_id INT NULL AFTER patient_id;
ALTER TABLE appointments ADD COLUMN medical_center_id INT NULL AFTER doctor_id;
ALTER TABLE appointments ADD COLUMN service_id INT NULL AFTER medical_center_id;
ALTER TABLE appointments ADD COLUMN tracking_code VARCHAR(50) NULL AFTER status;
