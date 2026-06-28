-- NoorVista 2.1.37
-- Keep payment audit fields compatible with databases created before secure checkout.
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS created_by INT NULL,
  ADD COLUMN IF NOT EXISTS approved_by INT NULL,
  ADD COLUMN IF NOT EXISTS approved_at DATETIME NULL;
