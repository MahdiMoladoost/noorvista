'use strict';

const crypto = require('crypto');

function requestContext(req, res, next) {
  const incoming = String(req.get('x-request-id') || '').trim();
  const safeIncoming = /^[A-Za-z0-9._:-]{8,100}$/.test(incoming) ? incoming : null;
  req.correlationId = safeIncoming || crypto.randomUUID();
  res.set('X-Request-ID', req.correlationId);
  next();
}

module.exports = { requestContext };
