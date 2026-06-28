'use strict';

const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { runMysqldump } = require('./secureBackupService');

function timestamp() {
  const d = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function createTemporarySqlDump({ env = process.env } = {}) {
  if (!String(env.DB_NAME || '').trim() || !String(env.DB_USER || '').trim()) {
    const error = new Error('تنظیمات اتصال پایگاه داده کامل نیست');
    error.code = 'BACKUP_DB_CONFIG_MISSING';
    throw error;
  }
  const filename = `noorvista_database_${timestamp()}.sql`;
  const filepath = path.join(os.tmpdir(), `noorvista_export_${process.pid}_${Date.now()}.sql`);
  try {
    await runMysqldump(filepath, env);
    const stat = await fsp.stat(filepath);
    return { filename, filepath, size: stat.size };
  } catch (error) {
    await fsp.rm(filepath, { force: true }).catch(() => {});
    throw error;
  }
}

module.exports = { createTemporarySqlDump };
