-- src/database/verify_seed_users.sql
SELECT id, username, full_name, phone, role, is_active
FROM users
ORDER BY id;

SELECT COUNT(*) AS users_count FROM users;
