'use strict';

const crypto = require('crypto');

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';
const ephemeral = new Map();

function secret(name, { minLength = 32 } = {}) {
  const value = String(process.env[name] || '').trim();
  if (value.length >= minLength) return value;

  if (isProduction) {
    throw new Error(`${name} must be configured with at least ${minLength} characters in production`);
  }

  if (!ephemeral.has(name)) {
    ephemeral.set(name, crypto.randomBytes(Math.max(minLength, 32)).toString('base64url'));
    // Never print the generated value.
    console.warn(`[security] ${name} is missing/short; using an ephemeral development-only secret.`);
  }
  return ephemeral.get(name);
}

function cookieOptions(maxAge, path = '/') {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path,
    maxAge
  };
}

module.exports = {
  NODE_ENV,
  isProduction,
  JWT_SECRET: secret('JWT_SECRET'),
  COOKIE_SECRET: secret('COOKIE_SECRET'),
  cookieOptions,
  secret
};
