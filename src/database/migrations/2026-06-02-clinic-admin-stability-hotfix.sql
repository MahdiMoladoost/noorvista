-- NoorVista Clinic Admin Stability Hotfix
-- Optional safety for old users schemas where password_hash/fullname are NOT NULL.

SET @stmt = (
    SELECT IF(COUNT(*) > 0,
        'UPDATE users SET password_hash = password WHERE password_hash IS NULL AND password IS NOT NULL',
        'SELECT 1'
    )
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'password_hash'
);
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @stmt = (
    SELECT IF(COUNT(*) > 0,
        'UPDATE users SET fullname = COALESCE(NULLIF(fullname, ), full_name, name, username, کاربر) WHERE fullname IS NULL OR fullname = ',
        'SELECT 1'
    )
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'fullname'
);
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;
