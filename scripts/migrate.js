'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../src/config/db');

function stripLeadingLineComments(statement) {
  return String(statement || '').replace(/^\s*(?:(?:--|#)[^\r\n]*(?:\r?\n|$)\s*)+/, '').trim();
}

function splitTopLevelCommaList(input) {
  const parts = [];
  let current = '';
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (const char of String(input || '')) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (quote) {
      current += char;
      if (char === '\\\\' && quote !== '`') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      current += char;
      continue;
    }

    if (char === '(') depth += 1;
    if (char === ')' && depth > 0) depth -= 1;

    if (char === ',' && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

/**
 * MySQL 8 does not support MariaDB-style `ADD COLUMN IF NOT EXISTS`.
 * Convert a pure multi-column ALTER into one ALTER per column. Executing each
 * column independently lets the migration runner safely ignore only the
 * duplicate column while still adding every missing column.
 */
function expandMysqlCompatibleStatement(statement) {
  const executable = stripLeadingLineComments(statement);
  const match = executable.match(/^ALTER\s+TABLE\s+(`?[A-Za-z0-9_$]+`?)\s+([\s\S]+)$/i);
  if (!match || !/\bADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\b/i.test(match[2])) {
    return [executable];
  }

  const table = match[1];
  const clauses = splitTopLevelCommaList(match[2]);
  if (!clauses.length || clauses.some((clause) => !/^ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+/i.test(clause))) {
    // Do not guess when ALTER TABLE mixes operation types. Removing the token
    // still produces valid MySQL and preserves legacy behaviour.
    return [executable.replace(/\bADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\b/gi, 'ADD COLUMN')];
  }

  return clauses.map((clause) =>
    `ALTER TABLE ${table} ${clause.replace(/^ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+/i, 'ADD COLUMN ')}`
  );
}

function parseMigrationStatements(sql) {
  return String(sql || '')
    .split(/;\s*(?:\r?\n|$)/)
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap(expandMysqlCompatibleStatement)
    .filter(Boolean);
}

async function main() {
  const pool = await db.getPool();
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    filename VARCHAR(255) NOT NULL UNIQUE,
    checksum CHAR(64) NOT NULL,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  const dir = path.join(__dirname, '..', 'src', 'database', 'migrations');
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.sql')).sort();

  for (const filename of files) {
    const sql = fs.readFileSync(path.join(dir, filename), 'utf8');
    const checksum = crypto.createHash('sha256').update(sql).digest('hex');
    const [rows] = await pool.query('SELECT checksum FROM schema_migrations WHERE filename = ? LIMIT 1', [filename]);
    if (rows.length) {
      if (rows[0].checksum !== checksum) throw new Error(`Applied migration changed: ${filename}`);
      continue;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const statements = parseMigrationStatements(sql);
      const idempotentDdlErrors = new Set([
        'ER_DUP_FIELDNAME',
        'ER_DUP_KEYNAME',
        'ER_TABLE_EXISTS_ERROR',
        'ER_FK_DUP_NAME',
        'ER_TRG_ALREADY_EXISTS'
      ]);
      for (const statement of statements) {
        try {
          await connection.query(statement);
        } catch (error) {
          // Historical migrations in this project overlap. Duplicate DDL is safe to skip,
          // while all other database errors still fail the deployment.
          if (!idempotentDdlErrors.has(error.code)) throw error;
          console.warn(`Skipped already-applied DDL in ${filename}: ${error.code}`);
        }
      }
      await connection.query('INSERT INTO schema_migrations (filename, checksum) VALUES (?, ?)', [filename, checksum]);
      await connection.commit();
      console.log(`Applied ${filename}`);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  await db.closePool();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  main,
  parseMigrationStatements,
  expandMysqlCompatibleStatement,
  splitTopLevelCommaList
};
