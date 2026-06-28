CREATE TRIGGER trg_medical_access_audit_no_update BEFORE UPDATE ON medical_access_audit FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'medical_access_audit is append-only';
CREATE TRIGGER trg_medical_access_audit_no_delete BEFORE DELETE ON medical_access_audit FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'medical_access_audit is append-only';
CREATE TRIGGER trg_consent_audit_no_update BEFORE UPDATE ON consent_audit FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'consent_audit is append-only';
CREATE TRIGGER trg_consent_audit_no_delete BEFORE DELETE ON consent_audit FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'consent_audit is append-only';
CREATE TRIGGER trg_appointment_status_history_no_update BEFORE UPDATE ON appointment_status_history FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'appointment_status_history is append-only';
CREATE TRIGGER trg_appointment_status_history_no_delete BEFORE DELETE ON appointment_status_history FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'appointment_status_history is append-only';
CREATE TRIGGER trg_medical_record_amendments_no_update BEFORE UPDATE ON medical_record_amendments FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'medical_record_amendments is append-only';
CREATE TRIGGER trg_medical_record_amendments_no_delete BEFORE DELETE ON medical_record_amendments FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'medical_record_amendments is append-only';
