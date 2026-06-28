'use strict';
const express = require('express');
const { createAsyncRouter } = require('../utils/asyncRouter');
const db = require('../config/db');
const { protect, restrictTo } = require('../middleware/auth');
const clinicalAccess = require('../services/clinicalAccessService');

const router = createAsyncRouter(express);
function id(value){const n=Number(value);return Number.isInteger(n)&&n>0?n:null;}
function text(value,max=1000){return String(value||'').trim().slice(0,max);}
router.use(protect);

router.post('/break-glass', restrictTo('doctor'), async (req,res)=>{
  const patientId=id(req.body.patient_id); const scope=req.body.access_scope==='write'?'write':'read'; const reason=text(req.body.reason);
  if(!patientId||reason.length<20)return res.status(400).json({success:false,message:'بیمار و دلیل دقیق حداقل ۲۰ کاراکتری الزامی است'});
  const pool=await db.getPool(); const connection=await pool.getConnection();
  try{
    await connection.beginTransaction(); await clinicalAccess.ensureSchema(connection);
    const [patients]=await connection.query('SELECT id FROM patients WHERE id=? LIMIT 1 FOR UPDATE',[patientId]);
    if(!patients.length){await connection.rollback();return res.status(404).json({success:false,message:'بیمار یافت نشد'});}
    const [active]=await connection.query(`SELECT id,status FROM clinical_break_glass_requests
      WHERE doctor_id=? AND patient_id=? AND status IN ('requested','approved') AND (expires_at IS NULL OR expires_at>NOW())
      ORDER BY id DESC LIMIT 1 FOR UPDATE`,[req.user.doctor_id,patientId]);
    if(active.length){await connection.rollback();return res.status(409).json({success:false,message:'یک درخواست فعال برای این بیمار وجود دارد',request_id:active[0].id,status:active[0].status});}
    const [result]=await connection.query(`INSERT INTO clinical_break_glass_requests
      (patient_id,doctor_id,requested_by,access_scope,reason,request_ip) VALUES (?,?,?,?,?,?)`,
      [patientId,req.user.doctor_id,req.user.id,scope,reason,req.ip||null]);
    await connection.commit(); return res.status(201).json({success:true,request_id:result.insertId,status:'requested',message:'درخواست ثبت شد و تا تأیید ثانویه دسترسی ایجاد نمی‌کند'});
  }catch(error){await connection.rollback();return res.status(500).json({success:false,message:'خطا در ثبت درخواست دسترسی اضطراری'});}finally{connection.release();}
});

router.get('/break-glass/mine', restrictTo('doctor'), async (req,res)=>{
  const pool=await db.getPool(); await clinicalAccess.ensureSchema(pool);
  await pool.query("UPDATE clinical_break_glass_requests SET status='expired' WHERE status='approved' AND expires_at<=NOW()");
  const [rows]=await pool.query(`SELECT id,patient_id,access_scope,reason,status,approval_reason,expires_at,last_used_at,use_count,created_at
    FROM clinical_break_glass_requests WHERE doctor_id=? ORDER BY id DESC LIMIT 100`,[req.user.doctor_id]);
  return res.json({success:true,requests:rows});
});

router.get('/break-glass/pending', restrictTo('system_admin','admin','clinic_admin','clinic_manager'), async(req,res)=>{
  const pool=await db.getPool(); await clinicalAccess.ensureSchema(pool);
  const [rows]=await pool.query(`SELECT b.id,b.patient_id,b.doctor_id,b.access_scope,b.reason,b.created_at,
    du.full_name AS doctor_name, pu.full_name AS patient_name
    FROM clinical_break_glass_requests b
    JOIN doctors d ON d.id=b.doctor_id JOIN users du ON du.id=d.user_id
    JOIN patients p ON p.id=b.patient_id JOIN users pu ON pu.id=p.user_id
    WHERE b.status='requested' ORDER BY b.created_at ASC`);
  return res.json({success:true,requests:rows});
});

router.post('/break-glass/:id/approve', restrictTo('system_admin','admin','clinic_admin','clinic_manager'), async(req,res)=>{
  const requestId=id(req.params.id); const approvalReason=text(req.body.approval_reason); const minutes=Math.min(60,Math.max(5,Number(req.body.duration_minutes)||30));
  if(!requestId||approvalReason.length<10)return res.status(400).json({success:false,message:'دلیل تأیید حداقل ۱۰ کاراکتری الزامی است'});
  const pool=await db.getPool();const connection=await pool.getConnection();
  try{await connection.beginTransaction();await clinicalAccess.ensureSchema(connection);
    const [rows]=await connection.query('SELECT id,requested_by,status FROM clinical_break_glass_requests WHERE id=? FOR UPDATE',[requestId]);const request=rows[0];
    if(!request){await connection.rollback();return res.status(404).json({success:false,message:'درخواست یافت نشد'});}
    if(Number(request.requested_by)===Number(req.user.id)){await connection.rollback();return res.status(403).json({success:false,message:'درخواست‌کننده نمی‌تواند درخواست خود را تأیید کند'});}
    if(request.status!=='requested'){await connection.rollback();return res.status(409).json({success:false,message:'درخواست در وضعیت قابل تأیید نیست'});}
    await connection.query(`UPDATE clinical_break_glass_requests SET status='approved',approved_by=?,approval_reason=?,approved_at=NOW(),
      expires_at=DATE_ADD(NOW(),INTERVAL ? MINUTE) WHERE id=?`,[req.user.id,approvalReason,minutes,requestId]);
    await connection.commit();return res.json({success:true,status:'approved',duration_minutes:minutes});
  }catch(error){await connection.rollback();return res.status(500).json({success:false,message:'خطا در تأیید دسترسی اضطراری'});}finally{connection.release();}
});

router.post('/break-glass/:id/reject', restrictTo('system_admin','admin','clinic_admin','clinic_manager'), async(req,res)=>{
  const requestId=id(req.params.id);const reason=text(req.body.reason);if(!requestId||reason.length<10)return res.status(400).json({success:false,message:'دلیل رد الزامی است'});
  const pool=await db.getPool();await clinicalAccess.ensureSchema(pool);
  const [result]=await pool.query(`UPDATE clinical_break_glass_requests SET status='rejected',rejected_by=?,rejection_reason=?,rejected_at=NOW()
    WHERE id=? AND status='requested'`,[req.user.id,reason,requestId]);
  if(!result.affectedRows)return res.status(409).json({success:false,message:'درخواست قابل رد نیست'});return res.json({success:true,status:'rejected'});
});

router.post('/break-glass/:id/revoke', restrictTo('system_admin','admin','clinic_admin','clinic_manager'), async(req,res)=>{
  const requestId=id(req.params.id);const reason=text(req.body.reason);if(!requestId||reason.length<10)return res.status(400).json({success:false,message:'دلیل لغو دسترسی الزامی است'});
  const pool=await db.getPool();await clinicalAccess.ensureSchema(pool);
  const [result]=await pool.query(`UPDATE clinical_break_glass_requests SET status='revoked',revoked_by=?,revocation_reason=?,revoked_at=NOW()
    WHERE id=? AND status='approved'`,[req.user.id,reason,requestId]);
  if(!result.affectedRows)return res.status(409).json({success:false,message:'دسترسی فعال یافت نشد'});return res.json({success:true,status:'revoked'});
});

module.exports=router;
