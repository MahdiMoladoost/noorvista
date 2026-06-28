-- NoorVista Clinic Admin Review Patch
-- Run once after replacing the files. Safe to run multiple times.

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
