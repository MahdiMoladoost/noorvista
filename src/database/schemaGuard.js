'use strict';

const cache = new Map();

function migrationRequired(context, missing) {
  const error = new Error(`Database migrations are incomplete for ${context}`);
  error.code = 'MIGRATION_REQUIRED';
  error.status = 503;
  error.statusCode = 503;
  error.expose = false;
  error.details = { context, missing };
  return error;
}

function normalizeRequirements(requirements) {
  if (!requirements || typeof requirements !== 'object') return {};

  // Backward compatibility: older callers used { tables: ['table_name'] }.
  // Treat that shape as a list of required tables instead of looking for a
  // literal table named `tables`.
  const normalized = {};
  if (Array.isArray(requirements.tables)) {
    requirements.tables.forEach((table) => {
      const name = String(table || '').trim();
      if (name) normalized[name] = [];
    });
  }

  for (const [table, requiredColumns] of Object.entries(requirements)) {
    if (table === 'tables') continue;
    normalized[table] = Array.isArray(requiredColumns) ? requiredColumns : [];
  }

  return normalized;
}

async function assertSchema(connection, context, requirements, { cacheKey = context } = {}) {
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const normalizedRequirements = normalizeRequirements(requirements);

  const check = (async () => {
    const missing = [];
    for (const [table, requiredColumns] of Object.entries(normalizedRequirements)) {
      const [tableRows] = await connection.query(
        `SELECT 1 AS present
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
         LIMIT 1`,
        [table]
      );
      if (!tableRows.length) {
        missing.push({ table, reason: 'table_missing' });
        continue;
      }

      if (!requiredColumns || requiredColumns.length === 0) continue;
      const [columnRows] = await connection.query(
        `SELECT COLUMN_NAME
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [table]
      );
      const available = new Set(columnRows.map((row) => row.COLUMN_NAME));
      for (const column of requiredColumns) {
        if (!available.has(column)) missing.push({ table, column, reason: 'column_missing' });
      }
    }

    if (missing.length) throw migrationRequired(context, missing);
    return true;
  })();

  cache.set(cacheKey, check);
  try {
    return await check;
  } catch (error) {
    cache.delete(cacheKey);
    throw error;
  }
}

function clearSchemaGuardCache() {
  cache.clear();
}

module.exports = { assertSchema, clearSchemaGuardCache, migrationRequired, normalizeRequirements };
