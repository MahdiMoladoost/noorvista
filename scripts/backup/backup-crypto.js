'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');

const MAGIC = Buffer.from('NVBAK01\0', 'ascii');
const HEADER_SIZE = MAGIC.length + 16 + 12;
const TAG_SIZE = 16;

function keyFromEnv(salt) {
  const passphrase = String(process.env.BACKUP_ENCRYPTION_KEY || '');
  if (passphrase.length < 32) throw new Error('BACKUP_ENCRYPTION_KEY must contain at least 32 characters');
  return crypto.scryptSync(passphrase, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}
function validatePaths(inputPath, outputPath) {
  const input = path.resolve(inputPath || ''); const output = path.resolve(outputPath || '');
  if (!inputPath || !outputPath || input === output) throw new Error('Input and output paths must be different');
  if (!fs.existsSync(input) || !fs.statSync(input).isFile()) throw new Error('Input backup file not found');
  return { input, output };
}
async function encryptFile(inputPath, outputPath) {
  const { input, output } = validatePaths(inputPath, outputPath);
  const salt = crypto.randomBytes(16); const iv = crypto.randomBytes(12); const key = keyFromEnv(salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const temporary = `${output}.tmp-${process.pid}`;
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const out = fs.createWriteStream(temporary, { mode: 0o600 });
  out.write(Buffer.concat([MAGIC, salt, iv]));
  try {
    await pipeline(fs.createReadStream(input), cipher, out, { end: false });
    await new Promise((resolve, reject) => out.end(cipher.getAuthTag(), (error) => error ? reject(error) : resolve()));
    fs.renameSync(temporary, output); fs.chmodSync(output, 0o600);
    return { output, sha256: await sha256File(output) };
  } catch (error) { try { fs.unlinkSync(temporary); } catch (_) {} throw error; }
}
async function decryptFile(inputPath, outputPath) {
  const { input, output } = validatePaths(inputPath, outputPath);
  const stat = fs.statSync(input); if (stat.size <= HEADER_SIZE + TAG_SIZE) throw new Error('Encrypted backup is truncated');
  const fd = fs.openSync(input, 'r');
  try {
    const header = Buffer.alloc(HEADER_SIZE); fs.readSync(fd, header, 0, HEADER_SIZE, 0);
    if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Invalid encrypted backup header');
    const salt = header.subarray(MAGIC.length, MAGIC.length + 16);
    const iv = header.subarray(MAGIC.length + 16, HEADER_SIZE);
    const tag = Buffer.alloc(TAG_SIZE); fs.readSync(fd, tag, 0, TAG_SIZE, stat.size - TAG_SIZE);
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyFromEnv(salt), iv); decipher.setAuthTag(tag);
    const temporary = `${output}.tmp-${process.pid}`; fs.mkdirSync(path.dirname(output), { recursive: true });
    try {
      await pipeline(fs.createReadStream(input, { start: HEADER_SIZE, end: stat.size - TAG_SIZE - 1 }), decipher, fs.createWriteStream(temporary, { mode: 0o600 }));
      fs.renameSync(temporary, output); fs.chmodSync(output, 0o600);
      return { output, sha256: await sha256File(output) };
    } catch (error) { try { fs.unlinkSync(temporary); } catch (_) {} throw new Error('Backup decryption or integrity verification failed'); }
  } finally { fs.closeSync(fd); }
}
async function sha256File(filePath) {
  const hash = crypto.createHash('sha256'); await pipeline(fs.createReadStream(filePath), hash);
  return hash.digest('hex');
}
module.exports = { encryptFile, decryptFile, sha256File, MAGIC, HEADER_SIZE, TAG_SIZE };
