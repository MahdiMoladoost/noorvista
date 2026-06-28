'use strict';

const mysql = require('mysql2/promise');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const { DEFAULT_SERVICES } = require('../src/database/init_db');

const config = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'noorvista_clinic',
  charset: 'utf8mb4',
  dateStrings: true,
};

async function main() {
  const connection = await mysql.createConnection(config);
  try {
    const [tables] = await connection.query("SHOW TABLES LIKE 'services'");
    if (!tables.length) {
      throw new Error('جدول services وجود ندارد؛ ابتدا npm run migrate را اجرا کنید.');
    }

    await connection.beginTransaction();
    for (const service of DEFAULT_SERVICES) {
      await connection.execute(
        `INSERT INTO services
           (name, slug, category, description, default_capacity, default_duration_minutes, is_active)
         VALUES (?, ?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           category = VALUES(category),
           description = VALUES(description),
           default_capacity = VALUES(default_capacity),
           default_duration_minutes = VALUES(default_duration_minutes),
           is_active = 1`,
        [
          service.name,
          service.slug,
          service.category,
          service.description,
          service.defaultCapacity,
          service.defaultDurationMinutes,
        ]
      );
    }
    await connection.commit();

    const [countRows] = await connection.query(
      'SELECT COUNT(*) AS total FROM services WHERE slug IN (?)',
      [DEFAULT_SERVICES.map(service => service.slug)]
    );
    console.log(`✓ ${countRows[0]?.total || 0} ophthalmology services are ready.`);
  } catch (error) {
    try { await connection.rollback(); } catch (_) {}
    console.error(`✗ Seeding services failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

if (require.main === module) main();

module.exports = { main };
