const express = require('express');

function createPanelFinalFixesRouter({ db, asyncHandler }) {
  const router = express.Router();

  async function getPool(req) {
    if (req.db) return req.db;
    if (db && typeof db.getPool === 'function') return db.getPool();
    if (db && typeof db.execute === 'function') return db;
    throw new Error('Database pool is not available');
  }

  async function tableHasColumn(pool, table, column) {
    try {
      const [rows] = await pool.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]);
      return Array.isArray(rows) && rows.length > 0;
    } catch (_) {
      return false;
    }
  }

  // Safe notification count endpoint used by header badges
  router.get('/api/notifications/count', asyncHandler(async (req, res) => {
    const pool = await getPool(req);
    let where = '1=1';
    const params = [];

    if (await tableHasColumn(pool, 'notifications', 'is_active')) {
      where += ' AND is_active = 1';
    }
    if (await tableHasColumn(pool, 'notifications', 'status')) {
      where += " AND (status IS NULL OR status NOT IN ('deleted','inactive'))";
    }

    const [rows] = await pool.query(`SELECT COUNT(*) AS count FROM notifications WHERE ${where}`, params);
    res.json({ success: true, count: Number(rows?.[0]?.count || 0) });
  }));

  // Safe notification delete: soft delete whenever possible
  router.delete('/api/notifications/:id', asyncHandler(async (req, res) => {
    const pool = await getPool(req);
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'شناسه اعلان نامعتبر است' });

    const sets = [];
    if (await tableHasColumn(pool, 'notifications', 'is_active')) sets.push('is_active = 0');
    if (await tableHasColumn(pool, 'notifications', 'status')) sets.push("status = 'deleted'");
    if (await tableHasColumn(pool, 'notifications', 'updated_at')) sets.push('updated_at = NOW()');

    if (sets.length) {
      await pool.query(`UPDATE notifications SET ${sets.join(', ')} WHERE id = ?`, [id]);
    } else {
      await pool.query('DELETE FROM notifications WHERE id = ?', [id]);
    }

    res.json({ success: true, message: 'اعلان حذف شد' });
  }));

  router.delete('/api/admin/notifications/:id', asyncHandler(async (req, res) => {
    req.url = `/notifications/${req.params.id}`;
    return router.handle(req, res);
  }));

  // Safe schedule delete: soft delete
  router.delete('/api/doctor-schedules/:id', asyncHandler(async (req, res) => {
    const pool = await getPool(req);
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'شناسه زمان‌بندی نامعتبر است' });

    const sets = [];
    if (await tableHasColumn(pool, 'doctor_schedules', 'is_active')) sets.push('is_active = 0');
    if (await tableHasColumn(pool, 'doctor_schedules', 'updated_at')) sets.push('updated_at = NOW()');

    if (sets.length) {
      await pool.query(`UPDATE doctor_schedules SET ${sets.join(', ')} WHERE id = ?`, [id]);
    } else {
      await pool.query('DELETE FROM doctor_schedules WHERE id = ?', [id]);
    }

    // Disable future slots if table exists
    try {
      const slotSets = [];
      if (await tableHasColumn(pool, 'appointment_slots', 'status')) slotSets.push("status = 'disabled'");
      if (await tableHasColumn(pool, 'appointment_slots', 'updated_at')) slotSets.push('updated_at = NOW()');
      if (slotSets.length) {
        await pool.query(`UPDATE appointment_slots SET ${slotSets.join(', ')} WHERE doctor_schedule_id = ? AND booked_count = 0`, [id]);
      }
    } catch (_) {}

    res.json({ success: true, message: 'زمان‌بندی حذف/غیرفعال شد' });
  }));

  router.delete('/api/admin/doctor-schedules/:id', asyncHandler(async (req, res) => {
    req.url = `/doctor-schedules/${req.params.id}`;
    return router.handle(req, res);
  }));

  // Safe slot delete: only if no bookings
  router.delete('/api/appointment-slots/:id', asyncHandler(async (req, res) => {
    const pool = await getPool(req);
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'شناسه نوبت نامعتبر است' });

    const check = await slotHasBookings(pool, id);
    if (!check.exists) return res.status(404).json({ success: false, message: 'نوبت پیدا نشد' });
    if (check.hasBookings) {
      return res.status(409).json({ success: false, message: 'این نوبت رزرو دارد و قابل حذف نیست' });
    }

    await pool.query('DELETE FROM appointment_slots WHERE id = ?', [id]);
    res.json({ success: true, message: 'نوبت حذف شد' });
  }));

  router.delete('/api/admin/appointment-slots/:id', asyncHandler(async (req, res) => {
    req.url = `/appointment-slots/${req.params.id}`;
    return router.handle(req, res);
  }));


  function normalizeIdList(ids) {
    if (!Array.isArray(ids)) return [];
    return ids.map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0);
  }

  function parseSlotRef(value) {
    const raw = String(value ?? '').trim();
    const match = raw.match(/^(\d+)(?:[-:_](\d+))?$/);
    if (!match) return null;

    const slotId = Number(match[1]);
    const position = match[2] ? Number(match[2]) : null;
    if (!Number.isInteger(slotId) || slotId <= 0) return null;
    if (position !== null && (!Number.isInteger(position) || position <= 0)) return null;

    return {
      raw,
      slotId,
      position,
      isPosition: position !== null
    };
  }

  function normalizeSlotRefs(ids) {
    if (!Array.isArray(ids)) return [];

    const seen = new Set();
    const refs = [];
    for (const item of ids) {
      const ref = parseSlotRef(item);
      if (!ref) continue;
      const key = ref.isPosition ? `${ref.slotId}-${ref.position}` : String(ref.slotId);
      if (seen.has(key)) continue;
      seen.add(key);
      refs.push(ref);
    }
    return refs;
  }

  function uniqueSlotIds(refs) {
    return [...new Set((refs || []).map((ref) => Number(ref.slotId)).filter(Boolean))];
  }

  function placeholders(values) {
    return values.map(() => '?').join(',');
  }

  function activeAppointmentWhere(alias = '') {
    const prefix = alias ? `${alias}.` : '';
    return `COALESCE(${prefix}status,'') NOT IN ('cancelled','canceled','deleted','rejected')`;
  }

  async function ensureSlotPositionStateTable(pool) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS appointment_slot_position_states (
        id INT AUTO_INCREMENT PRIMARY KEY,
        slot_id INT NOT NULL,
        position_in_slot INT NOT NULL,
        status ENUM('available','disabled','deleted') NOT NULL DEFAULT 'disabled',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_slot_position_state (slot_id, position_in_slot),
        INDEX idx_slot_position_state_slot (slot_id, status),
        INDEX idx_slot_position_state_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci
    `);
  }

  async function dailyQueueBaseForSlot(pool, slot) {
    const [rows] = await pool.query(
      `SELECT COALESCE(SUM(capacity), 0) AS base
       FROM appointment_slots
       WHERE doctor_id = ?
         AND medical_center_id = ?
         AND service_id = ?
         AND slot_date = ?
         AND start_time < ?
         AND COALESCE(status, 'available') NOT IN ('disabled', 'cancelled')`,
      [slot.doctor_id, slot.medical_center_id, slot.service_id, slot.slot_date, slot.start_time]
    );
    return Number(rows?.[0]?.base || 0);
  }

  async function appointmentForSlotPosition(pool, slot, position) {
    const capacity = Math.max(Number(slot.capacity || 1), 1);
    const positionNumber = Number(position || 0);
    if (!positionNumber || positionNumber < 1 || positionNumber > capacity) return null;

    const queueNumber = await dailyQueueBaseForSlot(pool, slot) + positionNumber;
    const [rows] = await pool.query(
      `SELECT id, status, appointment_queue_number
       FROM appointments
       WHERE appointment_slot_id = ?
         AND appointment_queue_number = ?
         AND ${activeAppointmentWhere()}
       LIMIT 1`,
      [slot.id, queueNumber]
    );
    return rows[0] || null;
  }

  async function materializeDisabledSlotPositions(pool, slot, exceptPosition = null) {
    if (String(slot.status || '').toLowerCase() !== 'disabled') return;

    await ensureSlotPositionStateTable(pool);
    const capacity = Math.max(Number(slot.capacity || 1), 1);
    for (let position = 1; position <= capacity; position += 1) {
      if (Number(exceptPosition || 0) === position) continue;
      await pool.query(
        `INSERT IGNORE INTO appointment_slot_position_states (slot_id, position_in_slot, status)
         VALUES (?, ?, 'disabled')`,
        [slot.id, position]
      );
    }
  }

  async function recalculateSlotAggregate(pool, slotId) {
    await ensureSlotPositionStateTable(pool);

    const [slotRows] = await pool.query('SELECT * FROM appointment_slots WHERE id = ? LIMIT 1', [slotId]);
    const slot = slotRows[0];
    if (!slot) return null;

    const capacity = Math.max(Number(slot.capacity || 1), 1);
    const [[bookedRow]] = await pool.query(
      `SELECT COUNT(*) AS booked_count
       FROM appointments
       WHERE appointment_slot_id = ?
         AND ${activeAppointmentWhere()}`,
      [slotId]
    );
    const bookedCount = Math.max(Number(bookedRow?.booked_count || 0), 0);

    const [[blockedRow]] = await pool.query(
      `SELECT COUNT(*) AS blocked_count
       FROM appointment_slot_position_states
       WHERE slot_id = ?
         AND position_in_slot BETWEEN 1 AND ?
         AND status IN ('disabled', 'deleted')`,
      [slotId, capacity]
    );
    const blockedCount = Math.max(Number(blockedRow?.blocked_count || 0), 0);
    const activeCapacity = Math.max(capacity - blockedCount, 0);
    const remaining = Math.max(activeCapacity - bookedCount, 0);
    const finalStatus = activeCapacity <= 0 ? 'disabled' : (remaining > 0 ? 'available' : 'full');

    await pool.query(
      'UPDATE appointment_slots SET booked_count = ?, remaining_capacity = ?, status = ? WHERE id = ?',
      [bookedCount, remaining, finalStatus, slotId]
    );

    return { id: slotId, capacity, booked_count: bookedCount, blocked_count: blockedCount, remaining_capacity: remaining, status: finalStatus };
  }

  async function deleteSlotPositionRef(pool, ref) {
    await ensureSlotPositionStateTable(pool);

    const [slotRows] = await pool.query('SELECT * FROM appointment_slots WHERE id = ? LIMIT 1', [ref.slotId]);
    const slot = slotRows[0];
    if (!slot) {
      const error = new Error('نوبت پیدا نشد');
      error.statusCode = 404;
      throw error;
    }

    const capacity = Math.max(Number(slot.capacity || 1), 1);
    if (!ref.position || ref.position < 1 || ref.position > capacity) {
      const error = new Error('شماره جایگاه نوبت نامعتبر است');
      error.statusCode = 400;
      throw error;
    }

    const appointment = await appointmentForSlotPosition(pool, slot, ref.position);
    if (appointment) {
      const error = new Error('این جایگاه نوبت رزرو دارد و قابل حذف نیست');
      error.statusCode = 409;
      throw error;
    }

    await materializeDisabledSlotPositions(pool, slot, ref.position);
    await pool.query(
      `INSERT INTO appointment_slot_position_states (slot_id, position_in_slot, status)
       VALUES (?, ?, 'deleted')
       ON DUPLICATE KEY UPDATE status = 'deleted', updated_at = NOW()`,
      [ref.slotId, ref.position]
    );

    await recalculateSlotAggregate(pool, ref.slotId);
    return true;
  }

  async function deleteSlotRowsByIds(pool, slotIds) {
    const ids = [...new Set((slotIds || []).map(Number).filter(Boolean))];
    if (!ids.length) return 0;

    const ph = placeholders(ids);

    try {
      await ensureSlotPositionStateTable(pool);
      await pool.query(`DELETE FROM appointment_slot_position_states WHERE slot_id IN (${ph})`, ids);
    } catch (_) {}

    // اگر نوبت‌های لغوشده/حذف‌شده به این ظرفیت وصل باشند، اتصالشان را قطع می‌کنیم تا حذف ظرفیت‌ها گیر FK نخورد.
    try {
      await pool.query(
        `UPDATE appointments
         SET appointment_slot_id = NULL
         WHERE appointment_slot_id IN (${ph})
           AND COALESCE(status,'') IN ('cancelled','canceled','deleted','rejected')`,
        ids
      );
    } catch (_) {}

    const [result] = await pool.query(`DELETE FROM appointment_slots WHERE id IN (${ph})`, ids);
    return Number(result.affectedRows || 0);
  }

  function addOptionalFilter(where, params, column, value) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      where.push(`${column} = ?`);
      params.push(value);
    }
  }

  function toBoolValue(value, fallback = true) {
    if (value === undefined || value === null || value === '') return fallback;
    if (value === true || value === 1 || value === '1' || value === 'true') return true;
    if (value === false || value === 0 || value === '0' || value === 'false') return false;
    return fallback;
  }

  async function resolveScheduleIds(pool, body) {
    const ids = normalizeIdList(body.ids);
    if (ids.length) return ids;

    if (body.scope !== 'filtered' || body.confirm_all !== true) {
      const error = new Error('برای حذف گروهی باید موارد انتخاب‌شده یا تایید حذف همه فیلترشده ارسال شود');
      error.statusCode = 400;
      throw error;
    }

    const filters = body.filters || {};
    const where = ['1=1'];
    const params = [];

    addOptionalFilter(where, params, 'doctor_id', filters.doctor_id);
    addOptionalFilter(where, params, 'medical_center_id', filters.medical_center_id);
    addOptionalFilter(where, params, 'service_id', filters.service_id);

    const [rows] = await pool.query(`SELECT id FROM doctor_schedules WHERE ${where.join(' AND ')}`, params);
    return rows.map((r) => Number(r.id)).filter(Boolean);
  }

  async function resolveSlotRefs(pool, body) {
    const selectedRefs = normalizeSlotRefs(body.ids);
    if (selectedRefs.length) return selectedRefs;

    if (body.scope !== 'filtered' || body.confirm_all !== true) {
      const error = new Error('برای حذف گروهی باید موارد انتخاب‌شده یا تایید حذف همه فیلترشده ارسال شود');
      error.statusCode = 400;
      throw error;
    }

    const filters = body.filters || {};
    const where = ['1=1'];
    const params = [];

    addOptionalFilter(where, params, 'doctor_id', filters.doctor_id);
    addOptionalFilter(where, params, 'medical_center_id', filters.medical_center_id);
    addOptionalFilter(where, params, 'service_id', filters.service_id);

    // اگر کاربر روی وضعیت «همه» است، disabled/deleted/inactive را در حذف گروهی بدون فیلتر وضعیت هم در نظر می‌گیریم.
    addOptionalFilter(where, params, 'status', filters.status);

    if (filters.date_from) {
      where.push('slot_date >= ?');
      params.push(filters.date_from);
    }
    if (filters.date_to) {
      where.push('slot_date <= ?');
      params.push(filters.date_to);
    }

    const [rows] = await pool.query(`SELECT id FROM appointment_slots WHERE ${where.join(' AND ')}`, params);
    return rows.map((r) => ({ raw: String(r.id), slotId: Number(r.id), position: null, isPosition: false })).filter((ref) => ref.slotId);
  }

  async function scheduleHasBookings(pool, scheduleId) {
    try {
      const [rows] = await pool.query(
        `SELECT COUNT(*) AS count
         FROM appointment_slots
         WHERE doctor_schedule_id = ? AND COALESCE(booked_count,0) > 0`,
        [scheduleId]
      );
      if (Number(rows?.[0]?.count || 0) > 0) return true;
    } catch (_) {}

    try {
      const [rows] = await pool.query(
        `SELECT COUNT(*) AS count
         FROM appointments a
         JOIN appointment_slots s ON s.id = a.appointment_slot_id
         WHERE s.doctor_schedule_id = ?
           AND COALESCE(a.status,'') NOT IN ('cancelled','canceled','deleted')`,
        [scheduleId]
      );
      if (Number(rows?.[0]?.count || 0) > 0) return true;
    } catch (_) {}

    return false;
  }

  async function hardDeleteSchedule(pool, scheduleId) {
    const hasBookings = await scheduleHasBookings(pool, scheduleId);

    if (hasBookings) {
      await pool.query('UPDATE doctor_schedules SET is_active = 0, updated_at = NOW() WHERE id = ?', [scheduleId]);
      try {
        await pool.query(
          `UPDATE appointment_slots
           SET status = 'disabled', updated_at = NOW()
           WHERE doctor_schedule_id = ? AND COALESCE(booked_count,0) = 0`,
          [scheduleId]
        );
      } catch (_) {}
      return { hardDeleted: false, disabled: true, slotsDeleted: 0 };
    }

    const [slotRows] = await pool.query('SELECT id FROM appointment_slots WHERE doctor_schedule_id = ?', [scheduleId]);
    const slotIds = slotRows.map((row) => Number(row.id)).filter(Boolean);
    const slotsDeleted = await deleteSlotRowsByIds(pool, slotIds);

    const [scheduleResult] = await pool.query('DELETE FROM doctor_schedules WHERE id = ?', [scheduleId]);
    return {
      hardDeleted: Number(scheduleResult.affectedRows || 0) > 0,
      disabled: false,
      slotsDeleted
    };
  }

  async function slotHasBookings(pool, slotId) {
    try {
      const [rows] = await pool.query(
        `SELECT booked_count FROM appointment_slots WHERE id = ? LIMIT 1`,
        [slotId]
      );
      if (!rows.length) return { exists: false, hasBookings: false };
      if (Number(rows[0].booked_count || 0) > 0) return { exists: true, hasBookings: true };
    } catch (_) {}

    try {
      const [rows] = await pool.query(
        `SELECT COUNT(*) AS count
         FROM appointments
         WHERE appointment_slot_id = ?
           AND COALESCE(status,'') NOT IN ('cancelled','canceled','deleted')`,
        [slotId]
      );
      if (Number(rows?.[0]?.count || 0) > 0) return { exists: true, hasBookings: true };
    } catch (_) {}

    return { exists: true, hasBookings: false };
  }

  router.post('/api/doctor-schedules/:id/toggle-active', asyncHandler(async (req, res) => {
    const pool = await getPool(req);
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'شناسه زمان‌بندی نامعتبر است' });

    const nextActive = toBoolValue(req.body?.is_active, true) ? 1 : 0;

    await pool.query('UPDATE doctor_schedules SET is_active = ?, updated_at = NOW() WHERE id = ?', [nextActive, id]);

    if (nextActive) {
      try {
        await pool.query(
          `UPDATE appointment_slots
           SET status = CASE
             WHEN COALESCE(booked_count,0) >= COALESCE(capacity,0) THEN 'full'
             ELSE 'available'
           END,
           updated_at = NOW()
           WHERE doctor_schedule_id = ?
             AND COALESCE(booked_count,0) = 0
             AND status IN ('disabled','inactive','deleted')`,
          [id]
        );
      } catch (_) {}
    } else {
      try {
        await pool.query(
          `UPDATE appointment_slots
           SET status = 'disabled', updated_at = NOW()
           WHERE doctor_schedule_id = ? AND COALESCE(booked_count,0) = 0`,
          [id]
        );
      } catch (_) {}
    }

    res.json({
      success: true,
      is_active: !!nextActive,
      message: nextActive ? 'زمان‌بندی فعال شد' : 'زمان‌بندی غیرفعال شد'
    });
  }));

  router.post('/api/admin/doctor-schedules/:id/toggle-active', asyncHandler(async (req, res) => {
    req.url = `/doctor-schedules/${req.params.id}/toggle-active`;
    return router.handle(req, res);
  }));

  router.post('/api/doctor-schedules/:id/hard-delete', asyncHandler(async (req, res) => {
    const pool = await getPool(req);
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'شناسه زمان‌بندی نامعتبر است' });

    const result = await hardDeleteSchedule(pool, id);

    res.json({
      success: true,
      ...result,
      message: result.hardDeleted
        ? `زمان‌بندی حذف شد و ${result.slotsDeleted} نوبت مرتبط حذف شد`
        : 'این زمان‌بندی رزرو دارد؛ برای حفظ سوابق حذف نشد و فقط غیرفعال شد'
    });
  }));

  router.post('/api/admin/doctor-schedules/:id/hard-delete', asyncHandler(async (req, res) => {
    req.url = `/doctor-schedules/${req.params.id}/hard-delete`;
    return router.handle(req, res);
  }));

  router.post('/api/doctor-schedules/bulk-hard-delete', asyncHandler(async (req, res) => {
    const pool = await getPool(req);
    const ids = await resolveScheduleIds(pool, req.body || {});

    if (!ids.length) {
      return res.json({ success: true, hard_deleted: 0, disabled: 0, slots_deleted: 0, message: 'زمان‌بندی‌ای برای حذف پیدا نشد' });
    }

    let hardDeleted = 0;
    let disabled = 0;
    let slotsDeleted = 0;

    for (const id of ids) {
      const result = await hardDeleteSchedule(pool, id);
      if (result.hardDeleted) hardDeleted += 1;
      if (result.disabled) disabled += 1;
      slotsDeleted += Number(result.slotsDeleted || 0);
    }

    res.json({
      success: true,
      hard_deleted: hardDeleted,
      disabled,
      slots_deleted: slotsDeleted,
      message: `${hardDeleted} زمان‌بندی حذف شد، ${disabled} زمان‌بندی دارای رزرو فقط غیرفعال شد و ${slotsDeleted} نوبت بدون رزرو حذف شد`
    });
  }));

  router.post('/api/admin/doctor-schedules/bulk-hard-delete', asyncHandler(async (req, res) => {
    req.url = '/doctor-schedules/bulk-hard-delete';
    return router.handle(req, res);
  }));

  router.post('/api/doctor-schedules/bulk-delete', asyncHandler(async (req, res) => {
    req.url = '/doctor-schedules/bulk-hard-delete';
    return router.handle(req, res);
  }));

  router.post('/api/admin/doctor-schedules/bulk-delete', asyncHandler(async (req, res) => {
    req.url = '/doctor-schedules/bulk-hard-delete';
    return router.handle(req, res);
  }));

  router.post('/api/appointment-slots/bulk-delete', asyncHandler(async (req, res) => {
    const pool = await getPool(req);
    const refs = await resolveSlotRefs(pool, req.body || {});

    if (!refs.length) {
      return res.json({ success: true, affected: 0, skipped: 0, message: 'نوبتی برای حذف پیدا نشد' });
    }

    let skipped = 0;
    let positionDeleted = 0;
    let slotsDeleted = 0;

    const positionRefs = refs.filter((ref) => ref.isPosition);
    const wholeSlotRefs = refs.filter((ref) => !ref.isPosition);

    for (const ref of positionRefs) {
      try {
        await deleteSlotPositionRef(pool, ref);
        positionDeleted += 1;
      } catch (error) {
        if (Number(error.statusCode || error.status || 0) === 409 || Number(error.statusCode || error.status || 0) === 404) {
          skipped += 1;
        } else {
          throw error;
        }
      }
    }

    const removableSlotIds = [];
    for (const slotId of uniqueSlotIds(wholeSlotRefs)) {
      const check = await slotHasBookings(pool, slotId);
      if (!check.exists) continue;
      if (check.hasBookings) {
        skipped += 1;
      } else {
        removableSlotIds.push(slotId);
      }
    }

    if (removableSlotIds.length) {
      slotsDeleted = await deleteSlotRowsByIds(pool, removableSlotIds);
    }

    const affected = positionDeleted + slotsDeleted;
    if (!affected) {
      return res.status(409).json({
        success: false,
        affected: 0,
        skipped,
        message: 'همه نوبت‌های انتخاب‌شده رزرو دارند یا قبلاً حذف شده‌اند'
      });
    }

    const parts = [];
    if (positionDeleted) parts.push(`${positionDeleted} جایگاه نوبت حذف شد`);
    if (slotsDeleted) parts.push(`${slotsDeleted} ساعت نوبت بدون رزرو حذف شد`);

    res.json({
      success: true,
      affected,
      skipped,
      position_deleted: positionDeleted,
      hard_deleted: slotsDeleted,
      message: `${parts.join(' و ')}${skipped ? `؛ ${skipped} مورد رزرو‌شده/نامعتبر حذف نشد` : ''}`
    });
  }));

  router.post('/api/admin/appointment-slots/bulk-delete', asyncHandler(async (req, res) => {
    req.url = '/appointment-slots/bulk-delete';
    return router.handle(req, res);
  }));

  router.post('/api/appointment-slots/:id/hard-delete', asyncHandler(async (req, res) => {
    const pool = await getPool(req);
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'شناسه نوبت نامعتبر است' });

    const check = await slotHasBookings(pool, id);
    if (!check.exists) return res.status(404).json({ success: false, message: 'نوبت پیدا نشد' });
    if (check.hasBookings) {
      return res.status(409).json({ success: false, message: 'این نوبت رزرو دارد و قابل حذف نیست' });
    }

    await pool.query('DELETE FROM appointment_slots WHERE id = ?', [id]);
    res.json({ success: true, message: 'نوبت حذف شد' });
  }));

  router.post('/api/admin/appointment-slots/:id/hard-delete', asyncHandler(async (req, res) => {
    req.url = `/appointment-slots/${req.params.id}/hard-delete`;
    return router.handle(req, res);
  }));


  return router;
}

module.exports = { createPanelFinalFixesRouter };
