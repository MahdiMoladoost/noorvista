'use strict';

const express = require('express');
const { protect, restrictTo } = require('../middleware/auth');
const privateFiles = require('../services/privateFileService');

function decodeHeader(value, fallback = '') {
  try { return decodeURIComponent(String(value || fallback)); } catch (_) { return String(value || fallback); }
}

function createPrivateFilesRouter({ rootDir } = {}) {
  const router = express.Router();
  router.use(protect);

  router.post(
    '/',
    restrictTo('doctor', 'receptionist', 'clinic_admin', 'system_admin'),
    express.raw({ type: [...privateFiles.ALLOWED_CATEGORIES].map(() => '*/*'), limit: `${Number(process.env.MAX_UPLOAD_SIZE_MB || 10)}mb` }),
    async (req, res, next) => {
      try {
        const result = await privateFiles.savePrivateFile(req.db, {
          user: req.user,
          category: req.get('x-file-category'),
          patientId: req.get('x-patient-id'),
          medicalRecordId: req.get('x-medical-record-id'),
          appointmentId: req.get('x-appointment-id'),
          originalName: decodeHeader(req.get('x-file-name'), 'document'),
          mimeType: req.get('content-type'),
          buffer: req.body,
          rootDir
        });
        return res.status(201).json({ success: true, file: result });
      } catch (error) { return next(error); }
    }
  );

  router.get('/:id', restrictTo('patient', 'doctor', 'receptionist', 'clinic_admin', 'system_admin'), async (req, res, next) => {
    try {
      const { metadata, buffer } = await privateFiles.readPrivateFile(req.db, { id: req.params.id, user: req.user, rootDir });
      res.set({
        'Cache-Control': 'private, no-store',
        'Content-Type': metadata.mime_type,
        'Content-Length': String(buffer.length),
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(metadata.original_name)}`,
        'X-Content-Type-Options': 'nosniff'
      });
      return res.end(buffer);
    } catch (error) { return next(error); }
  });

  return router;
}

module.exports = { createPrivateFilesRouter, ALLOWED_CATEGORIES: privateFiles.ALLOWED_CATEGORIES };
