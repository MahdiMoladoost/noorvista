const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const medicalRecordController = require('../controllers/medicalRecordController');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

// Validation rules
const createRecordValidation = [
  body('patient_id').isInt().withMessage('شناسه بیمار معتبر نیست'),
  body('diagnosis').notEmpty().withMessage('تشخیص الزامی است'),
  body('record_date').notEmpty().withMessage('تاریخ ثبت الزامی است')
];

// Routes
router.get('/', authMiddleware, medicalRecordController.getMedicalRecords);
router.get('/:id', authMiddleware, medicalRecordController.getMedicalRecordById);
router.post('/', authMiddleware, roleMiddleware('doctor', 'clinic_admin'), createRecordValidation, medicalRecordController.createMedicalRecord);
router.put('/:id', authMiddleware, roleMiddleware('doctor', 'clinic_admin'), medicalRecordController.updateMedicalRecord);

module.exports = router;