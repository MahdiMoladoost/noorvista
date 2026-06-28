'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { encryptFile } = require('../../scripts/backup/backup-crypto');

const BACKUP_DIR = path.join(process.cwd(), 'backups', 'admin');
let runningBackup = null;

function timestamp() {
  const d = new Date();
  const pad = value => String(value).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function buildMysqldumpArgs(env = process.env, outputPath) {
  const database = String(env.DB_NAME || '').trim();
  const user = String(env.DB_USER || '').trim();
  if (!database || !user) throw new Error('تنظیمات اتصال پایگاه داده کامل نیست');

  const args = [
    `--host=${String(env.DB_HOST || '127.0.0.1')}`,
    `--port=${String(env.DB_PORT || '3306')}`,
    `--user=${user}`,
    '--single-transaction',
    '--quick',
    '--skip-lock-tables',
    '--set-gtid-purged=OFF',
    '--no-tablespaces',
    '--default-character-set=utf8mb4',
    `--result-file=${outputPath}`,
    database
  ];
  return args;
}

function assertBackupConfiguration(env = process.env) {
  if (String(env.BACKUP_ENCRYPTION_KEY || '').length < 32) {
    const error = new Error('کلید رمزنگاری پشتیبان تنظیم نشده یا کوتاه است');
    error.code = 'BACKUP_KEY_MISSING';
    throw error;
  }
  if (!String(env.DB_NAME || '').trim() || !String(env.DB_USER || '').trim()) {
    const error = new Error('تنظیمات اتصال پایگاه داده کامل نیست');
    error.code = 'BACKUP_DB_CONFIG_MISSING';
    throw error;
  }
}

function runMysqldump(outputPath, env = process.env) {
  return new Promise((resolve, reject) => {
    const executable = String(env.MYSQLDUMP_PATH || 'mysqldump').trim();
    const args = buildMysqldumpArgs(env, outputPath);
    const child = spawn(executable, args, {
      windowsHide: true,
      shell: false,
      env: {
        ...process.env,
        MYSQL_PWD: String(env.DB_PASSWORD || '')
      },
      stdio: ['ignore', 'ignore', 'pipe']
    });

    let stderr = '';
    const timeoutMs = Math.max(30_000, Number(env.BACKUP_TIMEOUT_MS || 300_000));
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      const error = new Error('زمان ایجاد نسخه پشتیبان بیش از حد مجاز شد');
      error.code = 'BACKUP_TIMEOUT';
      reject(error);
    }, timeoutMs);

    child.stderr.on('data', chunk => {
      stderr += String(chunk || '').slice(0, 8_000);
    });
    child.once('error', error => {
      clearTimeout(timer);
      if (error.code === 'ENOENT') {
        const wrapped = new Error('ابزار mysqldump پیدا نشد؛ مسیر MYSQLDUMP_PATH را تنظیم کنید');
        wrapped.code = 'MYSQLDUMP_NOT_FOUND';
        reject(wrapped);
        return;
      }
      reject(error);
    });
    child.once('close', code => {
      clearTimeout(timer);
      if (code === 0 && fs.existsSync(outputPath)) return resolve();
      const error = new Error(stderr.trim() || `ایجاد خروجی پایگاه داده با کد ${code} متوقف شد`);
      error.code = 'MYSQLDUMP_FAILED';
      reject(error);
    });
  });
}

async function createEncryptedDatabaseBackup({ env = process.env } = {}) {
  assertBackupConfiguration(env);
  if (runningBackup) return runningBackup;

  runningBackup = (async () => {
    await fsp.mkdir(BACKUP_DIR, { recursive: true });
    const name = `backup_${timestamp()}.nvbak`;
    const encryptedPath = path.join(BACKUP_DIR, name);
    const tempSql = path.join(os.tmpdir(), `noorvista_${process.pid}_${Date.now()}.sql`);

    try {
      await runMysqldump(tempSql, env);
      const encrypted = await encryptFile(tempSql, encryptedPath);
      const stat = await fsp.stat(encryptedPath);
      return {
        filename: name,
        filepath: encryptedPath,
        size: stat.size,
        sha256: encrypted.sha256
      };
    } finally {
      await fsp.rm(tempSql, { force: true }).catch(() => {});
    }
  })();

  try {
    return await runningBackup;
  } finally {
    runningBackup = null;
  }
}

module.exports = {
  BACKUP_DIR,
  buildMysqldumpArgs,
  assertBackupConfiguration,
  runMysqldump,
  createEncryptedDatabaseBackup
};
