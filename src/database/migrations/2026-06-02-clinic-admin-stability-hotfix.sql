-- NoorVista Clinic Admin Stability Hotfix
-- Optional compatibility for older users schemas.
-- Each prepared-statement command is intentionally on its own line because
-- the NoorVista migration runner executes semicolon/newline-delimited statements.

SET @stmt = (
    SELECT IF(
        SUM(COLUMN_NAME = 'password_hash') > 0 AND SUM(COLUMN_NAME = 'password') > 0,
        'UPDATE users SET password_hash = password WHERE (password_hash IS NULL OR password_hash = '''') AND password IS NOT NULL',
        'SELECT 1'
    )
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND COLUMN_NAME IN ('password_hash', 'password')
);
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

SET @stmt = (
    SELECT IF(
        SUM(COLUMN_NAME = 'fullname') > 0
          AND SUM(COLUMN_NAME = 'full_name') > 0
          AND SUM(COLUMN_NAME = 'username') > 0,
        'UPDATE users SET fullname = COALESCE(NULLIF(fullname, ''''), NULLIF(full_name, ''''), NULLIF(username, ''''), ''کاربر'') WHERE fullname IS NULL OR fullname = ''''',
        'SELECT 1'
    )
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND COLUMN_NAME IN ('fullname', 'full_name', 'username')
);
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;
