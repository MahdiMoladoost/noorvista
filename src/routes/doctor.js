// src/routes/doctor.js
const express = require('express');
const { createAsyncRouter } = require('../utils/asyncRouter');
const router = createAsyncRouter(express);
const { protect, restrictTo } = require('../middleware/auth');
const doctorController = require('../controllers/doctorController');
const db = require('../config/db');

router.use(protect);
router.use(restrictTo('doctor'));

async function resolveDoctorContext(req, res, next) {
    const directDoctorId = Number(req.user?.doctor_id || 0);
    if (Number.isInteger(directDoctorId) && directDoctorId > 0) {
        req.doctorId = directDoctorId;
        req.user.doctor_id = directDoctorId;
        return next();
    }

    const [rows] = await db.query(
        'SELECT id FROM doctors WHERE user_id = ? LIMIT 1',
        [req.user.id]
    );
    const doctorId = Number(rows[0]?.id || 0);
    if (!Number.isInteger(doctorId) || doctorId <= 0) {
        return res.status(404).json({
            success: false,
            message: 'اطلاعات پزشک یافت نشد. لطفاً اتصال حساب کاربری پزشک به پروفایل پزشک را در پنل مدیریت بررسی کنید.'
        });
    }

    req.doctorId = doctorId;
    req.user.doctor_id = doctorId;
    return next();
}

router.use(resolveDoctorContext);

router.get('/stats', doctorController.getDashboardStats);
router.get('/profile', doctorController.getProfile);
router.put('/profile', doctorController.updateProfile);

router.get('/appointments/today', doctorController.getTodayAppointments);
router.get('/appointments', doctorController.getMyAppointments);
router.put('/appointments/:id/status', doctorController.updateAppointmentStatus);

router.get('/patients', doctorController.getMyPatients);
router.post('/patients', doctorController.createPatient);
router.get('/patients/:patientId/medical-records', doctorController.getPatientMedicalRecord);

router.get('/medical-records', doctorController.getMedicalRecords);
router.post('/medical-records', doctorController.addMedicalRecord);
router.post('/medical-records/:id/amend', doctorController.amendMedicalRecord);

router.get('/prescriptions', doctorController.getMyPrescriptions);
router.post('/prescriptions', doctorController.addPrescription);

router.get('/schedule', doctorController.getSchedule);
router.put('/schedule', doctorController.updateSchedule);

module.exports = router;