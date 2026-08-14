-- Persistent per-patient outlier "memory" — survives daily_stops re-imports.
-- When a driver flags a stop as outlier in the app, write here too. Future
-- CSV imports for the same patient+address auto-inherit is_outlier=true.

CREATE TABLE IF NOT EXISTS address_outliers (
  id BIGSERIAL PRIMARY KEY,
  patient_key TEXT NOT NULL UNIQUE,
  patient_name TEXT NOT NULL,
  address TEXT NOT NULL,
  reason TEXT,
  flagged_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS address_outliers_patient_key_idx
  ON address_outliers (patient_key);
