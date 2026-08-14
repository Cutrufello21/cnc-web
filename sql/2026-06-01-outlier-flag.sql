-- Driver app build 141: per-delivery outlier flag (analytics tag, no payroll impact).
-- Apply in Supabase SQL editor before deploying driver app build that writes these columns.
-- Without the columns, the driver-side "Flag Outlier" button's write will silently fail.

ALTER TABLE daily_stops
  ADD COLUMN IF NOT EXISTS is_outlier BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS outlier_reason TEXT;

-- Optional analytics index for filtering outlier deliveries quickly.
CREATE INDEX IF NOT EXISTS daily_stops_is_outlier_idx
  ON daily_stops (is_outlier)
  WHERE is_outlier = TRUE;
